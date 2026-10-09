#!/usr/bin/python3
"""Root-only, idempotent preparation for one oracle validation execution."""
import grp, hashlib, json, os, re, shutil, stat, sys, tempfile
from pathlib import Path

ROOT = Path("/home/rodrigo_mella/.local/state/constructor-temporal-poc/workspaces").resolve()
JOB_ROOT = Path("/etc/cgl-oracle/jobs")
STAGE_ROOT = Path("/var/lib/cgl-oracle/jobs")
SUITE = "csv-expense-v1"
IDENTITY = re.compile(r"[a-z0-9][a-z0-9-]{2,119}")

def valid(value: str) -> bool:
    return bool(IDENTITY.fullmatch(value))

def result_name(mission_id: str, execution_id: str) -> str:
    return f"{mission_id}--{execution_id}.json"

def checked_dir(path: Path, uid: int, gid: int) -> None:
    created = False
    try:
        path.mkdir(mode=0o750)
        created = True
    except FileExistsError:
        pass
    # A root process inherits the parent group unless that parent is setgid.
    # Set the contract explicitly only for a directory we just created; an
    # existing directory with unexpected metadata remains a hard failure.
    if created:
        os.chown(path, uid, gid)
        os.chmod(path, 0o750)
    s = path.lstat()
    if not stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode) or s.st_uid != uid or s.st_gid != gid or stat.S_IMODE(s.st_mode) != 0o750:
        raise SystemExit(f"unsafe oracle directory: {path}")

def read_source(workspace: Path) -> tuple[bytes, str]:
    source = workspace / "expense_cli.py"
    before = source.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_size > 1_000_000:
        raise SystemExit("expense_cli.py must be a regular file no larger than 1 MiB")
    fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as src:
        opened = os.fstat(src.fileno())
        if not stat.S_ISREG(opened.st_mode) or opened.st_size > 1_000_000:
            raise SystemExit("expense_cli.py changed while staging")
        data = src.read(1_000_001)
    if len(data) > 1_000_000:
        raise SystemExit("expense_cli.py changed while staging")
    return data, hashlib.sha256(data).hexdigest()

def read_job(job: Path) -> dict:
    s = job.lstat()
    if not stat.S_ISREG(s.st_mode) or stat.S_ISLNK(s.st_mode) or s.st_uid != 0 or stat.S_IMODE(s.st_mode) != 0o640:
        raise SystemExit("unsafe oracle job manifest")
    try:
        value = json.loads(job.read_text())
    except Exception as exc:
        raise SystemExit("invalid oracle job manifest") from exc
    if not isinstance(value, dict): raise SystemExit("invalid oracle job manifest")
    return value

def write_job_once(job: Path, payload: dict, gid: int) -> None:
    fd, tmp = tempfile.mkstemp(prefix="job.", dir=JOB_ROOT)
    try:
        os.fchmod(fd, 0o640)
        os.write(fd, (json.dumps(payload, separators=(",", ":")) + "\n").encode())
    finally:
        os.close(fd)
    os.chown(tmp, 0, gid)
    try:
        os.link(tmp, job)  # atomic create; never replace a final manifest
    except FileExistsError:
        existing = read_job(job)
        if existing != payload: raise SystemExit("oracle job identity conflict")
    finally:
        os.unlink(tmp)

def main() -> None:
    if os.geteuid() != 0 or len(sys.argv) != 3: raise SystemExit("root and mission_id oracle_execution_id required")
    mission_id, execution_id = sys.argv[1:]
    if not valid(mission_id) or not valid(execution_id): raise SystemExit("invalid oracle identity")
    workspace = (ROOT / mission_id).resolve()
    if ROOT not in workspace.parents or not workspace.is_dir(): raise SystemExit("workspace missing or outside POC root")
    if not (workspace / "opencode.json").is_file(): raise SystemExit("workspace missing opencode.json")
    if not (Path("/var/lib/cgl-oracle/tests") / SUITE / "validate.py").is_file(): raise SystemExit("private suite unavailable")
    data, digest = read_source(workspace)
    oracle_gid = grp.getgrnam("cgl_oracle").gr_gid
    checked_dir(STAGE_ROOT, 0, oracle_gid)
    mission_stage = STAGE_ROOT / mission_id
    checked_dir(mission_stage, 0, oracle_gid)
    stage = mission_stage / execution_id
    job = JOB_ROOT / result_name(mission_id, execution_id)
    payload = {"mission_id": mission_id, "oracle_execution_id": execution_id, "source_workspace": str(workspace), "workspace": str(stage), "suite": SUITE, "source_sha256": digest}
    created = False
    try:
        stage.mkdir(mode=0o750)
        created = True
        os.chown(stage, 0, oracle_gid)
        os.chmod(stage, 0o750)
        destination = stage / "expense_cli.py"
        with destination.open("xb") as dst: dst.write(data)
        os.chown(destination, 0, oracle_gid); os.chmod(destination, 0o640)
    except FileExistsError:
        if created:
            shutil.rmtree(stage)
            raise
        created = False
    except BaseException:
        if created: shutil.rmtree(stage)
        raise
    if not created:
        existing = read_job(job) if job.exists() else None
        if existing != payload: raise SystemExit("oracle execution already exists with different content")
        stage_stat = stage.lstat()
        if not stat.S_ISDIR(stage_stat.st_mode) or stat.S_ISLNK(stage_stat.st_mode) or stage_stat.st_uid != 0 or stage_stat.st_gid != oracle_gid or stat.S_IMODE(stage_stat.st_mode) != 0o750:
            raise SystemExit("unsafe existing oracle stage")
        staged = stage / "expense_cli.py"
        staged_stat = staged.lstat()
        if not stat.S_ISREG(staged_stat.st_mode) or stat.S_ISLNK(staged_stat.st_mode) or staged_stat.st_uid != 0 or staged_stat.st_gid != oracle_gid or stat.S_IMODE(staged_stat.st_mode) != 0o640 or hashlib.sha256(staged.read_bytes()).hexdigest() != digest:
            raise SystemExit("oracle staged program conflict")
        return
    try:
        checked_dir(JOB_ROOT, 0, oracle_gid)
        write_job_once(job, payload, oracle_gid)
    except BaseException:
        shutil.rmtree(stage)
        raise

if __name__ == "__main__": main()
