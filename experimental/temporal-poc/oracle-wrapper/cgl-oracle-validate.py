#!/usr/bin/python3
"""cgl_oracle entrypoint for one sealed validation execution."""
import json, os, re, stat, subprocess, sys, tempfile
from pathlib import Path

JOB_ROOT = Path("/etc/cgl-oracle/jobs")
TEST_ROOT = Path("/var/lib/cgl-oracle/tests")
PRIVATE_RESULTS = Path("/var/lib/cgl-oracle/results")
PUBLIC_RESULTS = Path("/var/lib/cgl-oracle-public-results")
WORKSPACE_ROOT = Path("/home/rodrigo_mella/.local/state/constructor-temporal-poc/workspaces")
STAGE_ROOT = Path("/var/lib/cgl-oracle/jobs")
TARGET = Path("/usr/local/libexec/cgl-oracle-target")
IDENTITY = re.compile(r"[a-z0-9][a-z0-9-]{2,119}")

def valid(value: str) -> bool: return bool(IDENTITY.fullmatch(value))
def result_name(mission_id: str, execution_id: str) -> str: return f"{mission_id}--{execution_id}.json"
def result_path(root: Path, mission_id: str, execution_id: str) -> Path: return root / result_name(mission_id, execution_id)

def safe_public(path: Path, mission_id: str, execution_id: str) -> dict:
    s = path.lstat()
    if not stat.S_ISREG(s.st_mode) or stat.S_ISLNK(s.st_mode) or s.st_uid != os.geteuid() or stat.S_IMODE(s.st_mode) != 0o644:
        raise SystemExit("unsafe public oracle result")
    try: value = json.loads(path.read_text())
    except Exception as exc: raise SystemExit("invalid public oracle result") from exc
    if not isinstance(value, dict) or value.get("schema") != "cgl-oracle-result-v1" or value.get("mission_id") != mission_id or value.get("oracle_execution_id") != execution_id:
        raise SystemExit("public oracle result identity conflict")
    if value.get("ok") is not (value.get("status") == "passed") or value.get("status") not in {"passed", "failed", "oracle_error"}:
        raise SystemExit("public oracle result verdict conflict")
    return value

def publish_once(mission_id: str, execution_id: str, ok: bool, status: str) -> dict:
    if (ok and status != "passed") or (not ok and status not in {"failed", "oracle_error"}): raise SystemExit("invalid public verdict")
    ds = PUBLIC_RESULTS.lstat()
    if not stat.S_ISDIR(ds.st_mode) or stat.S_ISLNK(ds.st_mode) or ds.st_uid != os.geteuid() or stat.S_IMODE(ds.st_mode) != 0o711: raise SystemExit("unsafe public results directory")
    final = result_path(PUBLIC_RESULTS, mission_id, execution_id)
    payload = {"schema": "cgl-oracle-result-v1", "mission_id": mission_id, "oracle_execution_id": execution_id, "ok": ok, "status": status,
               "diagnostics": [] if ok else [{"code": "ORACLE_ERROR" if status == "oracle_error" else "FUNCTIONAL_FAILURE", "summary": "isolated oracle unavailable" if status == "oracle_error" else "oracle rejected generated program"}]}
    if final.exists():
        existing = safe_public(final, mission_id, execution_id)
        if existing != payload: raise SystemExit("public oracle result content conflict")
        return existing
    fd, tmp = tempfile.mkstemp(prefix=f".{mission_id}-{execution_id}.", dir=PUBLIC_RESULTS)
    try:
        os.fchmod(fd, 0o644); os.write(fd, (json.dumps(payload, separators=(",", ":")) + "\n").encode())
    finally: os.close(fd)
    try:
        os.link(tmp, final)  # atomic create; an existing final result wins
    except FileExistsError:
        existing = safe_public(final, mission_id, execution_id)
        if existing != payload: raise SystemExit("public oracle result content conflict")
        return existing
    finally:
        os.unlink(tmp)
    return payload

def fail(message: str, private: Path, mission_id: str, execution_id: str) -> None:
    private.write_text(json.dumps({"ok": False, "status": "oracle_error", "diagnostics": [{"code": "ORACLE_ERROR", "summary": message}]}) + "\n")
    publish_once(mission_id, execution_id, False, "oracle_error")
    os.chmod(private, 0o600); raise SystemExit(2)

def read_job(job: Path, mission_id: str, execution_id: str) -> dict:
    s = job.lstat()
    if not stat.S_ISREG(s.st_mode) or stat.S_ISLNK(s.st_mode) or s.st_uid != 0 or stat.S_IMODE(s.st_mode) != 0o640: raise SystemExit("unsafe oracle job manifest")
    try: value = json.loads(job.read_text())
    except Exception as exc: raise SystemExit("invalid oracle job manifest") from exc
    if not isinstance(value, dict) or value.get("mission_id") != mission_id or value.get("oracle_execution_id") != execution_id: raise SystemExit("oracle job identity conflict")
    return value

def main() -> None:
    if len(sys.argv) != 3: raise SystemExit("mission_id and oracle_execution_id required")
    mission_id, execution_id = sys.argv[1:]
    if not valid(mission_id) or not valid(execution_id): raise SystemExit("invalid oracle identity")
    public = result_path(PUBLIC_RESULTS, mission_id, execution_id)
    if public.exists():
        final = safe_public(public, mission_id, execution_id)
        raise SystemExit(0 if final["status"] == "passed" else 1 if final["status"] == "failed" else 2)
    private = result_path(PRIVATE_RESULTS, mission_id, execution_id)
    job = read_job(JOB_ROOT / result_name(mission_id, execution_id), mission_id, execution_id)
    source_workspace = Path(job.get("source_workspace", "")).resolve()
    workspace, suite = Path(job.get("workspace", "")).resolve(), job.get("suite", "")
    if WORKSPACE_ROOT not in source_workspace.parents or source_workspace.name != mission_id: fail("source workspace outside POC root", private, mission_id, execution_id)
    if workspace != (STAGE_ROOT / mission_id / execution_id).resolve() or not workspace.is_dir(): fail("staged workspace identity conflict", private, mission_id, execution_id)
    staged = workspace.stat()
    if staged.st_uid != 0 or stat.S_IMODE(staged.st_mode) != 0o750: fail("unsafe staged workspace", private, mission_id, execution_id)
    if not valid(suite): fail("invalid suite", private, mission_id, execution_id)
    validator = (TEST_ROOT / suite / "validate.py").resolve()
    if not validator.is_file() or TEST_ROOT not in validator.parents: fail("validator missing", private, mission_id, execution_id)
    env = {"PATH": "/usr/bin:/bin", "HOME": "/var/lib/cgl-oracle", "CGL_ORACLE_TARGET": str(TARGET), "CGL_WORKSPACE": str(workspace), "CGL_RESULT": str(private)}
    try: completed = subprocess.run(["/usr/bin/python3", "-I", str(validator)], cwd=str(validator.parent), env=env, text=True, capture_output=True, timeout=120)
    except subprocess.TimeoutExpired: fail("validator timeout", private, mission_id, execution_id)
    if not private.is_file(): fail("validator produced no result", private, mission_id, execution_id)
    try:
        private_value = json.loads(private.read_text())
        passed = private_value.get("ok") is True and private_value.get("status") == "passed" and completed.returncode == 0
        publish_once(mission_id, execution_id, passed, "passed" if passed else "failed")
    except Exception: fail("invalid private validator result", private, mission_id, execution_id)
    os.chmod(private, 0o600)
    raise SystemExit(completed.returncode)

if __name__ == "__main__": main()
