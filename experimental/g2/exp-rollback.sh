#!/usr/bin/env bash
# Rollback of the experimental runtime state, with the same EXP_ROOT guards.
#   EXP_ALLOW_ROLLBACK=1 exp-rollback.sh
# Stops experimental processes (own pids only), then removes EXP_ROOT, which
# guard_root restricts to the dedicated directory or its .sandbox/ subtree.
# Never touches the stable environment, the lab code or secrets.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
guard_config
[[ "${EXP_ALLOW_ROLLBACK:-}" == "1" ]] || die "rollback requires EXP_ALLOW_ROLLBACK=1"

"$EXP_G2_DIR/exp-tunnel.sh" stop
"$EXP_G2_DIR/exp-opencode.sh" stop

target="$(realpath -m -s -- "$EXP_ROOT")"
guard_root # re-validated immediately before deletion
if [[ -d "$target" ]]; then
  rm -rf -- "$target"
  info "removed $target"
else
  info "nothing to remove ($target absent)"
fi
