#!/usr/bin/python3
"""Deterministic local tests for the candidate public-result publisher only."""
import importlib.util
import json
import multiprocessing
import os
import stat
import tempfile
from pathlib import Path

SOURCE = Path(__file__).parents[1] / "oracle-wrapper" / "cgl-oracle-validate.py"
SPEC = importlib.util.spec_from_file_location("candidate_oracle_validate", SOURCE)
assert SPEC and SPEC.loader
oracle = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(oracle)

MISSION_A = "oracle-wrapper-a-001"
MISSION_B = "oracle-wrapper-b-001"
EXEC_A = "01a120b1-d9d6-7a94-8d14-eb6a8e4df26b-v1"
EXEC_B = "01a120b2-d9d6-7a94-8d14-eb6a8e4df26b-v1"

def concurrent_writer(barrier, queue, mission_id, execution_id, ok, status):
    barrier.wait()
    try:
        queue.put(("published", oracle.publish_once(mission_id, execution_id, ok, status)["status"]))
    except SystemExit as exc:
        queue.put(("rejected", str(exc)))

with tempfile.TemporaryDirectory(prefix="oracle-wrapper-contract-") as tmp:
    public = Path(tmp) / "public"
    public.mkdir(mode=0o711)
    os.chmod(public, 0o711)
    oracle.PUBLIC_RESULTS = public

    # Positive fixture: a real atomic public PASS record is created.
    passed = oracle.publish_once(MISSION_A, EXEC_A, True, "passed")
    path_a = oracle.result_path(public, MISSION_A, EXEC_A)
    assert passed["ok"] is True and path_a.is_file()
    assert json.loads(path_a.read_text())["oracle_execution_id"] == EXEC_A
    assert stat.S_IMODE(path_a.stat().st_mode) == 0o644
    assert path_a.stat().st_uid == os.geteuid()

    # Late retry with the same result is idempotent; a contrary verdict fails closed.
    assert oracle.publish_once(MISSION_A, EXEC_A, True, "passed")["status"] == "passed"
    try:
        oracle.publish_once(MISSION_A, EXEC_A, False, "failed")
        raise AssertionError("conflicting late result accepted")
    except SystemExit:
        pass

    # Negative fixture: a separate identity produces a real FAIL record.
    failed = oracle.publish_once(MISSION_B, EXEC_B, False, "failed")
    path_b = oracle.result_path(public, MISSION_B, EXEC_B)
    assert failed["ok"] is False and failed["status"] == "failed" and path_b.is_file()
    assert path_a != path_b

    # Two processes race on the same identity with contrary verdicts. Atomic
    # link admits one final record and the loser rejects the content conflict.
    ctx = multiprocessing.get_context("fork")
    barrier, queue = ctx.Barrier(2), ctx.Queue()
    race_mission, race_execution = "oracle-wrapper-race-001", "01a120b3-d9d6-7a94-8d14-eb6a8e4df26b-v1"
    writers = [
        ctx.Process(target=concurrent_writer, args=(barrier, queue, race_mission, race_execution, True, "passed")),
        ctx.Process(target=concurrent_writer, args=(barrier, queue, race_mission, race_execution, False, "failed")),
    ]
    for writer in writers: writer.start()
    for writer in writers: writer.join(10)
    assert all(writer.exitcode == 0 for writer in writers)
    outcomes = [queue.get(timeout=2) for _ in writers]
    assert sum(kind == "published" for kind, _ in outcomes) == 1
    assert sum(kind == "rejected" for kind, _ in outcomes) == 1

    # Corruption and symlink replacement are rejected fail-closed.
    path_b.write_text("not json")
    try:
        oracle.safe_public(path_b, MISSION_B, EXEC_B)
        raise AssertionError("corrupt public result accepted")
    except SystemExit:
        pass
    path_b.unlink()
    target = public / "target.json"
    target.write_text("{}")
    path_b.symlink_to(target)
    try:
        oracle.safe_public(path_b, MISSION_B, EXEC_B)
        raise AssertionError("symlink public result accepted")
    except SystemExit:
        pass

print("oracle wrapper contract: PASS")
