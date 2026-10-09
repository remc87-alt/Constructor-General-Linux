#!/usr/bin/python3
"""Deterministic contract checks for candidate prepare directory creation."""
import importlib.util
import os
import stat
import tempfile
from pathlib import Path

SOURCE = Path(__file__).parents[1] / "oracle-wrapper" / "cgl-oracle-prepare.py"
SPEC = importlib.util.spec_from_file_location("candidate_oracle_prepare", SOURCE)
assert SPEC and SPEC.loader
prepare = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(prepare)

with tempfile.TemporaryDirectory(prefix="oracle-prepare-contract-") as tmp:
    root = Path(tmp)
    fresh = root / "fresh"
    prepare.checked_dir(fresh, os.geteuid(), os.getegid())
    meta = fresh.lstat()
    assert stat.S_ISDIR(meta.st_mode)
    assert not stat.S_ISLNK(meta.st_mode)
    assert meta.st_uid == os.geteuid() and meta.st_gid == os.getegid()
    assert stat.S_IMODE(meta.st_mode) == 0o750

    # Existing metadata is never normalized silently: fail closed instead.
    os.chmod(fresh, 0o700)
    try:
        prepare.checked_dir(fresh, os.geteuid(), os.getegid())
        raise AssertionError("unsafe existing directory was accepted")
    except SystemExit as exc:
        assert "unsafe oracle directory" in str(exc)

source = SOURCE.read_text()
assert "os.chown(stage, 0, oracle_gid)\n        os.chmod(stage, 0o750)" in source
assert "os.chown(tmp, 0, gid)" in source and "os.fchmod(fd, 0o640)" in source
print("oracle prepare contract: PASS")
