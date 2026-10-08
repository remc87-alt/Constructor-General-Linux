# M03-G2 — Experimental environment (prepared, not started)

Isolated path for the later test
`OpenCode → SSE → adapter → MCP Events → ChatGPT callback → Director`,
without touching the stable environment (`~/opencode-constructor-e2e`).

## Isolation

| Resource | Stable (never touched) | Experimental |
|---|---|---|
| Code | `~/opencode-constructor-e2e/mcp-opencode-adapter` | lab `mcp-opencode-adapter` (M03-A4) |
| OpenCode | `127.0.0.1:4096`, no password, default XDG (`~/.local/share/opencode/opencode.db`) | `127.0.0.1:4097`, random basic-auth password, own `XDG_{DATA,STATE,CACHE,CONFIG}_HOME` → own SQLite DB, cwd = lab, launched with `setsid` and stdin detached |
| Mission map | stable `.mission-map.json` | lab `mcp-opencode-adapter/.mission-map.json` (gitignored) |
| Subscriptions | stable `.subscriptions.json` | `$EXP_ROOT/adapter/subscriptions.json` |
| Outbox | — (stable adapter has none) | `$EXP_ROOT/adapter/event-outbox.json` + pid lock |
| Tunnel | `tunnel_6ac2f4a0…` , health `:8080` | **a different tunnel id** (to be created at G3), health `:8081` |
| Transport | STDIO | STDIO via `exp-adapter.sh` |
| Emitter | n/a | `MCP_EVENTS_EMITTER=off` by default |

`EXP_ROOT=~/.local/state/constructor-g2-exp` (mode 700, outside any repo).

Why own XDG homes: lab and stable share the same git root commit, and OpenCode
keeps all sessions in one SQLite DB under `XDG_DATA_HOME`; a second server with
default XDG would share the DB and the project with the stable server.

## Secrets (never in this directory)

- `FREELLM_KEY`: caller environment, only for `exp-opencode.sh start`.
- Control-plane API key: referenced by path (`file:`), never copied.
- Experimental OpenCode password: generated into `$EXP_ROOT/run/opencode.password` (0600).

## Start / stop policy (G3+ only)

Nothing starts without `EXP_ALLOW_START=1`. Order:

```bash
cd ~/constructor-general-linux-m01-lab/experimental/g2
./exp-preflight.sh                                   # must be RESULT: PASS
EXP_ALLOW_START=1 FREELLM_KEY=… ./exp-opencode.sh start
EXP_ALLOW_START=1 EXP_TUNNEL_ID=tunnel_<new> ./exp-tunnel.sh start
./exp-tunnel.sh status && ./exp-opencode.sh status
# stop (reverse order); only pids started by these scripts are signalled
./exp-tunnel.sh stop && ./exp-opencode.sh stop
./exp-preflight.sh                                   # stable fingerprint unchanged
```

`exp-opencode.sh` uses `setsid` and redirects stdin from `/dev/null`. The PID
file is still validated against the exact experimental `opencode serve` command
before `stop` signals it. Do not stop OpenCode while an experimental mission is
running or has a pending permission: pending permission requests were observed
to disappear after a server restart.

## Guards (M03-G2-FIX)

- `EXP_ROOT` must be `~/.local/state/constructor-g2-exp` or a subtree of its
  `.sandbox/`; relative paths, `.`/`..`, symlink escapes, `$HOME`, `/`, lab and
  stable are refused before any mkdir/chmod/write/rm (`guard_root`).
- Ports are FREE / BUSY / ERROR; a failing `ss` is ERROR and blocks starts and
  fails the preflight (`port_state`, `require_port_free`).
- Stable fingerprint: pid via exact `pgrep`, validated before reading `/proc`;
  outcomes DIAGNOSTIC_ERROR, STABLE_PROCESS_NOT_FOUND/AMBIGUOUS/CHANGED,
  BASELINE_MISSING, STABLE_DISCREPANCY (integrity) and WARN
  STABLE_RUNTIME_ACTIVITY (session status only).
- Baseline: `--baseline` only creates it when absent and never from an
  incomplete diagnosis; replacing it needs `EXP_ALLOW_REBASELINE=1 --rebaseline`
  (Director authorization; previous kept as `.prev`).
- `./test-guards.sh` reproduces all guard tests (starts nothing).

## Rollback

1. `EXP_ALLOW_ROLLBACK=1 ./exp-rollback.sh` (stops own pids, removes the guarded `EXP_ROOT`).
2. Delete the experimental tunnel / ChatGPT connector created for G3, if any.
3. `rm -rf experimental/g2` in the lab (uncommitted files).

The stable environment needs no rollback: nothing here writes to it.
