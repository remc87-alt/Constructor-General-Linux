# shellcheck shell=bash
# Shared loader and guards for the M03-G2 experimental environment.
# Sourced by exp-*.sh. Never prints secrets.

EXP_G2_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=exp.env
source "$EXP_G2_DIR/exp.env"

die() { echo "EXP-G2 REFUSED: $*" >&2; exit 2; }
info() { echo "EXP-G2: $*" >&2; }

# Port diagnosis with three outcomes. A failing or unrecognizable `ss` is
# ERROR, never FREE: callers must refuse to start on anything but FREE.
port_state() {
  local port="$1" out err rc
  err="$(mktemp)"
  out="$(ss -ltn "( sport = :$port )" 2>"$err")"; rc=$?
  if [[ $rc -ne 0 || -s "$err" || "$(head -n 1 <<<"$out")" != State* ]]; then
    rm -f "$err"; echo ERROR; return 0
  fi
  rm -f "$err"
  if [[ -n "$(tail -n +2 <<<"$out")" ]]; then echo BUSY; else echo FREE; fi
}

require_port_free() {
  local state; state="$(port_state "$1")"
  [[ "$state" == FREE ]] || die "port $1 is $state (start requires FREE)"
}

# EXP_ROOT: only the dedicated directory or a subtree of its .sandbox/.
# Rejects relative paths, '..', symlink escapes, $HOME, /, lab and stable.
# Must pass before any mkdir, chmod, write or rm under EXP_ROOT.
guard_root() {
  local root="$EXP_ROOT" canon literal dflt sandbox
  [[ "$root" == /* ]] || die "EXP_ROOT must be absolute: $root"
  case "/$root/" in */../*|*/./*) die "EXP_ROOT must not contain '.' or '..' segments: $root" ;; esac
  canon="$(realpath -m -- "$root")"           # symlinks resolved
  literal="$(realpath -m -s -- "$root")"      # symlinks NOT resolved
  [[ "$canon" == "$literal" ]] || die "EXP_ROOT goes through a symlink ($root -> $canon)"
  dflt="$(realpath -m -s -- "$EXP_ROOT_DEFAULT")"
  [[ "$(realpath -m -- "$EXP_ROOT_DEFAULT")" == "$dflt" ]] || die "dedicated EXP_ROOT default goes through a symlink"
  local forbidden
  for forbidden in / "$HOME" "$EXP_LAB" "$STABLE_CHECKOUT" "$HOME/.local" "$HOME/.local/state" "$HOME/.config"; do
    [[ "$canon" != "$(realpath -m -- "$forbidden")" ]] || die "EXP_ROOT is a forbidden location: $canon"
  done
  sandbox="$dflt/.sandbox"
  if [[ "$canon" == "$dflt" ]]; then return 0; fi
  if [[ "$canon" == "$sandbox"/?* ]]; then return 0; fi
  die "EXP_ROOT must be $dflt or under $sandbox/: $canon"
}

# Every experimental path must be outside the stable checkout.
guard_path() {
  local p; p="$(realpath -m -- "$1")"
  case "$p" in
    "$(realpath -m "$STABLE_CHECKOUT")"|"$(realpath -m "$STABLE_CHECKOUT")"/*)
      die "path inside the stable checkout: $p" ;;
  esac
}

guard_config() {
  guard_root
  [[ "$EXP_OPENCODE_PORT" != "$STABLE_OPENCODE_PORT" ]] || die "experimental OpenCode port equals stable ($STABLE_OPENCODE_PORT)"
  [[ "$EXP_TUNNEL_HEALTH" != "$STABLE_TUNNEL_HEALTH" ]] || die "tunnel health port equals stable ($STABLE_TUNNEL_HEALTH)"
  [[ "$EXP_EVENTS_EMITTER" == "on" || "$EXP_EVENTS_EMITTER" == "off" ]] || die "EXP_EVENTS_EMITTER must be on|off"
  local p
  for p in "$EXP_ROOT" "$EXP_ADAPTER_DIR" "$EXP_SUBSCRIPTIONS_FILE" "$EXP_OUTBOX_FILE" \
           "$EXP_OPENCODE_XDG_DATA" "$EXP_OPENCODE_XDG_STATE" "$EXP_OPENCODE_XDG_CACHE" \
           "$EXP_OPENCODE_XDG_CONFIG" "$EXP_TUNNEL_PROFILE"; do
    guard_path "$p"
  done
  [[ "$(realpath -m "$EXP_ADAPTER_DIR")" == "$(realpath -m "$EXP_LAB")/mcp-opencode-adapter" ]] \
    || die "adapter dir is not the lab adapter"
}

guard_tunnel_id() {
  [[ -n "$EXP_TUNNEL_ID" ]] || die "EXP_TUNNEL_ID is required (a tunnel distinct from the stable one)"
  [[ "$EXP_TUNNEL_ID" =~ ^tunnel_[0-9a-f]{32}$ ]] || die "EXP_TUNNEL_ID has an unexpected format"
  [[ "$EXP_TUNNEL_ID" != "$STABLE_TUNNEL_ID" ]] || die "EXP_TUNNEL_ID is the STABLE tunnel"
}

# Starting anything is a later gate (G3+): require an explicit opt-in.
guard_start_allowed() {
  [[ "${EXP_ALLOW_START:-}" == "1" ]] || die "starting processes requires EXP_ALLOW_START=1 (not authorized in G2)"
}

ensure_dirs() {
  guard_config # re-validated right before touching the filesystem
  umask 077
  mkdir -p "$EXP_RUN" "$EXP_LOGS" "$(dirname "$EXP_SUBSCRIPTIONS_FILE")" \
           "$EXP_OPENCODE_XDG_DATA" "$EXP_OPENCODE_XDG_STATE" "$EXP_OPENCODE_XDG_CACHE" \
           "$EXP_OPENCODE_XDG_CONFIG" "$(dirname "$EXP_TUNNEL_PROFILE")"
  chmod 700 "$EXP_ROOT"
}

# Reads /proc only for a well-formed pid (an empty pid would read /proc/cmdline).
proc_cmdline() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]] || return 1
  [[ -r "/proc/$1/cmdline" ]] || return 1
  tr '\0' ' ' <"/proc/$1/cmdline"
}

# Only ever signal a pid that this tooling started, and only if it still is
# the expected command (pid reuse safe).
stop_pidfile() {
  local pidfile="$1" expect="$2" pid cmd
  [[ -f "$pidfile" ]] || { info "not running ($pidfile absent)"; return 0; }
  pid="$(cat "$pidfile")"
  if cmd="$(proc_cmdline "$pid")" && grep -qF -- "$expect" <<<"$cmd"; then
    kill "$pid" && info "stopped pid $pid"
  else
    info "pid '$pid' is not '$expect' (stale or invalid pidfile); nothing signalled"
  fi
  rm -f "$pidfile"
}
