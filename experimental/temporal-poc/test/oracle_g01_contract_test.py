#!/usr/bin/python3
"""G01 checks for the oracle wrappers: fixed /srv/cgl/workspaces root, dir_fd
access with O_NOFOLLOW (the executor controls the workspace), orchestrator
ownership, FIFO/hardlink/symlink refusal and exact source_workspace identity."""
import importlib.util
import os
import sys
import tempfile
import threading
from pathlib import Path

HERE = Path(__file__).parents[1] / "oracle-wrapper"

def load(name: str, file: str):
    spec = importlib.util.spec_from_file_location(name, HERE / file)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

prepare = load("g01_prepare", "cgl-oracle-prepare.py")
validate = load("g01_validate", "cgl-oracle-validate.py")

def refused(fn, needle: str) -> None:
    try:
        fn()
    except SystemExit as exc:
        assert needle in str(exc), f"{needle!r} not in {exc!r}"
        return
    raise AssertionError(f"accepted; expected refusal containing {needle!r}")

# Constants: both wrappers agree on the isolated root and read no environment.
assert prepare.ROOT == Path("/srv/cgl/workspaces") == validate.WORKSPACE_ROOT
assert prepare.ORCHESTRATOR == "rodrigo_mella"
for source in (HERE / "cgl-oracle-prepare.py", HERE / "cgl-oracle-validate.py"):
    text = source.read_text()
    assert "os.environ" not in text and "getenv" not in text, f"{source.name} reads the environment"
    assert "/home/rodrigo_mella/.local/state" not in text, f"{source.name} still uses the legacy root"
prepare_text = (HERE / "cgl-oracle-prepare.py").read_text()
assert ".resolve()" not in prepare_text.split("def main")[1], "prepare main must not resolve executor paths"
assert '"source_workspace": str(workspace)' in prepare_text and "workspace = ROOT / mission_id" in prepare_text
validate_text = (HERE / "cgl-oracle-validate.py").read_text()
assert "if source_workspace != WORKSPACE_ROOT / mission_id: fail(" in validate_text

uid = os.geteuid()
with tempfile.TemporaryDirectory(prefix="oracle-g01-") as tmp:
    root = Path(tmp) / "workspaces"
    root.mkdir()
    ws = root / "g01-mission-001"
    ws.mkdir(mode=0o700)
    (ws / "expense_cli.py").write_bytes(b"print('ok')\n")
    (ws / "opencode.json").write_text("{}")

    fd = prepare.open_workspace("g01-mission-001", root, uid)
    try:
        data, digest = prepare.read_source(fd)
        assert data == b"print('ok')\n" and len(digest) == 64
        os.close(prepare.open_regular(fd, "opencode.json"))
    finally:
        os.close(fd)

    # Ownership: a workspace owned by anyone else (e.g. squatted by cgl_exec).
    refused(lambda: prepare.open_workspace("g01-mission-001", root, uid + 1), "owned by the orchestrator")
    os.chmod(ws, 0o707)
    refused(lambda: prepare.open_workspace("g01-mission-001", root, uid), "owned by the orchestrator")
    os.chmod(ws, 0o700)

    # Symlinked workspace, symlinked root, missing workspace.
    outside = Path(tmp) / "outside"
    outside.mkdir()
    (outside / "expense_cli.py").write_text("secret")
    (root / "g01-link-001").symlink_to(outside)
    refused(lambda: prepare.open_workspace("g01-link-001", root, uid), "outside POC root")
    (Path(tmp) / "root-link").symlink_to(root)
    refused(lambda: prepare.open_workspace("g01-mission-001", Path(tmp) / "root-link", uid), "workspace root")
    refused(lambda: prepare.open_workspace("g01-absent-001", root, uid), "outside POC root")

    # Hostile files planted by the executor inside its own workspace.
    cases = {
        "g01-symlink-001": lambda p: p.symlink_to(outside / "expense_cli.py"),
        "g01-hardlink-001": lambda p: os.link(outside / "expense_cli.py", p),
        "g01-dir-001": lambda p: p.mkdir(),
        "g01-fifo-001": lambda p: os.mkfifo(p),
    }
    for name, plant in cases.items():
        w = root / name
        w.mkdir(mode=0o700)
        plant(w / "expense_cli.py")
        fd = prepare.open_workspace(name, root, uid)
        try:
            # A FIFO must be refused immediately (O_NONBLOCK), never hang root.
            done, outcome = threading.Event(), []
            def run(fd=fd):
                try: prepare.read_source(fd)
                except SystemExit as exc: outcome.append(str(exc))
                done.set()
            threading.Thread(target=run, daemon=True).start()
            assert done.wait(5), f"{name}: read_source hung"
            assert outcome and "expense_cli.py must be" in outcome[0], f"{name}: {outcome}"
        finally:
            os.close(fd)

    # Size limit is enforced on the opened descriptor.
    big = root / "g01-big-001"
    big.mkdir(mode=0o700)
    (big / "expense_cli.py").write_bytes(b"x" * 1_000_001)
    fd = prepare.open_workspace("g01-big-001", root, uid)
    try:
        refused(lambda: prepare.read_source(fd), "no larger than 1 MiB")
    finally:
        os.close(fd)

# Non-root invocation is refused before touching anything.
saved = sys.argv
sys.argv = ["cgl-oracle-prepare", "g01-mission-001", "exec-0001"]
try:
    if os.geteuid() != 0:
        refused(prepare.main, "root and mission_id")
finally:
    sys.argv = saved

print("oracle G01 contract: PASS")
