#!/usr/bin/env bash
# Non-destructive proof that the target view has no oracle path and cannot
# write the generated workspace. It runs no generated code.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
workspace="${1:?workspace required}"
bash "$HERE/oracle-target.sh" "$workspace" --no-input /bin/sh -ceu '
  test ! -e /oracle
  ! touch /workspace/.oracle-write-probe
  test ! -e /workspace/.oracle-write-probe
  echo oracle_target_boundary=PASS
'
