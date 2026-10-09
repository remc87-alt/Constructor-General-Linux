#!/usr/bin/env bash
# Executes a generated target with no oracle mount, no network and a read-only
# workspace. The private oracle invokes this wrapper from outside the target.
set -euo pipefail
workspace="${1:?workspace required}"; shift
input="${1:?input path or --no-input required}"; shift
[[ $# -gt 0 ]] || { echo "usage: oracle-target.sh <workspace> <command...>" >&2; exit 2; }
root="$(/usr/bin/realpath "/var/lib/cgl-oracle/jobs")"
workspace="$(/usr/bin/realpath "$workspace")"
[[ "$workspace" == "$root/"* ]] || { echo "workspace must be an oracle staging directory" >&2; exit 2; }
bind_input=()
if [[ "$input" != "--no-input" ]]; then
  input="$(/usr/bin/realpath "$input")"
  testroot="/var/lib/cgl-oracle/tests/"
  [[ "$input" == "$testroot"* && -f "$input" ]] || { echo "input must be a private oracle file" >&2; exit 2; }
  bind_input=(--ro-bind "$input" /input.csv)
fi
exec /usr/bin/bwrap --unshare-user --unshare-pid --unshare-net --die-with-parent --clearenv \
  --ro-bind /usr /usr --ro-bind /bin /bin --ro-bind /lib /lib --ro-bind /lib64 /lib64 \
  --ro-bind "$workspace" /workspace "${bind_input[@]}" --tmpfs /tmp --proc /proc --dev /dev \
  --setenv PATH /usr/bin:/bin --setenv HOME /tmp --chdir /workspace -- "$@"
