#!/usr/bin/env bash
set -euo pipefail

POC=/home/rodrigo_mella/constructor-general-linux-m01-lab/experimental/temporal-poc
PREPARE_SRC="$POC/oracle-wrapper/cgl-oracle-prepare.py"
VALIDATE_SRC="$POC/oracle-wrapper/cgl-oracle-validate.py"
SUDOERS_SRC="$POC/oracle-wrapper/cgl-oracle-validate.sudoers"
PREPARE_DST=/usr/local/libexec/cgl-oracle-prepare
VALIDATE_DST=/usr/local/libexec/cgl-oracle-validate
SUDOERS_DST=/etc/sudoers.d/cgl-oracle
PREPARE_BAK=/usr/local/libexec/cgl-oracle-prepare.bak-20261009-concurrency
VALIDATE_BAK=/usr/local/libexec/cgl-oracle-validate.bak-20261009-concurrency
SUDOERS_BAK=/etc/sudoers.d/cgl-oracle.bak-20261009-concurrency
PREPARE_SHA=068a24d78947ad090674b83662ad5f2d23092a03529f6cbeb0f61743c29ef7a1
VALIDATE_SHA=175e2471105b158ccd28ec55cbcc88bea38684ac71e4e9e1a0558907e764608a
SUDOERS_SHA=125d7d522046578831d981058135e72a5d0c117acefa34b0574dad2c178be86b
targets_may_have_changed=0
rollback_running=0

hash_file() { sha256sum "$1" | awk '{print $1}'; }
sudo_hash() { local output; output="$(sudo sha256sum "$1")" || return 1; printf '%s\n' "${output%% *}"; }
mode_owner() { sudo stat -c '%U:%G:%a' "$1"; }
require_exact_metadata() { local observed; observed="$(mode_owner "$1")"; test "$observed" = "$2"; }

rollback() {
  local reason="$1" rc="$2" failed=0
  if [ "$rollback_running" -eq 1 ]; then printf 'ROLLBACK FAIL: recursive rollback prevented\n' >&2; exit 1; fi
  rollback_running=1; trap - ERR INT TERM; set +e
  printf 'ROLLBACK START: %s\n' "$reason" >&2
  if [ "$targets_may_have_changed" -eq 0 ]; then printf 'ROLLBACK PASS: no destination replacement occurred\n' >&2; exit "$rc"; fi

  sudo install -o root -g root -m 0750 "$PREPARE_BAK" "$PREPARE_DST"
  if [ $? -eq 0 ] && [ "$(sudo_hash "$PREPARE_DST")" = "$PREPARE_OLD_SHA" ] && [ "$(mode_owner "$PREPARE_DST")" = "$PREPARE_OLD_META" ]; then printf 'ROLLBACK PASS: prepare restored\n' >&2; else printf 'ROLLBACK FAIL: prepare restoration mismatch\n' >&2; failed=1; fi
  sudo install -o root -g root -m 0755 "$VALIDATE_BAK" "$VALIDATE_DST"
  if [ $? -eq 0 ] && [ "$(sudo_hash "$VALIDATE_DST")" = "$VALIDATE_OLD_SHA" ] && [ "$(mode_owner "$VALIDATE_DST")" = "$VALIDATE_OLD_META" ]; then printf 'ROLLBACK PASS: validate restored\n' >&2; else printf 'ROLLBACK FAIL: validate restoration mismatch\n' >&2; failed=1; fi
  sudo install -o root -g root -m 0440 "$SUDOERS_BAK" "$SUDOERS_DST"
  if [ $? -eq 0 ] && sudo visudo -cf "$SUDOERS_DST" && [ "$(sudo_hash "$SUDOERS_DST")" = "$SUDOERS_OLD_SHA" ] && [ "$(mode_owner "$SUDOERS_DST")" = "$SUDOERS_OLD_META" ]; then printf 'ROLLBACK PASS: sudoers restored\n' >&2; else printf 'ROLLBACK FAIL: sudoers restoration mismatch\n' >&2; failed=1; fi
  if [ "$failed" -eq 0 ]; then printf 'ROLLBACK PASS: all destinations restored; evidence/directories preserved\n' >&2; exit "$rc"; fi
  printf 'ROLLBACK PARTIAL: preserve backups and recover manually\n' >&2; exit 1
}

on_err() { local rc=$?; rollback "ERR at line ${BASH_LINENO[0]:-unknown}" "$rc"; }
on_signal() { rollback "received $1" "$2"; }
trap on_err ERR
trap 'on_signal INT 130' INT
trap 'on_signal TERM 143' TERM

command -v sudo >/dev/null
command -v sha256sum >/dev/null
command -v visudo >/dev/null
sudo -v
test "$(id -u cgl_oracle)" = 997
test "$(id -g cgl_oracle)" = 987
test -f "$PREPARE_SRC"
test -f "$VALIDATE_SRC"
test -f "$SUDOERS_SRC"
test "$(hash_file "$PREPARE_SRC")" = "$PREPARE_SHA"
test "$(hash_file "$VALIDATE_SRC")" = "$VALIDATE_SHA"
test "$(hash_file "$SUDOERS_SRC")" = "$SUDOERS_SHA"
/usr/sbin/visudo -cf "$SUDOERS_SRC"
sudo test -f "$PREPARE_DST"
sudo test -f "$VALIDATE_DST"
sudo test -f "$SUDOERS_DST"
require_exact_metadata "$PREPARE_DST" root:root:750
require_exact_metadata "$VALIDATE_DST" root:root:755
require_exact_metadata "$SUDOERS_DST" root:root:440
sudo test ! -e "$PREPARE_BAK"
sudo test ! -e "$VALIDATE_BAK"
sudo test ! -e "$SUDOERS_BAK"

PREPARE_OLD_SHA="$(sudo_hash "$PREPARE_DST")"
VALIDATE_OLD_SHA="$(sudo_hash "$VALIDATE_DST")"
SUDOERS_OLD_SHA="$(sudo_hash "$SUDOERS_DST")"
PREPARE_OLD_META="$(mode_owner "$PREPARE_DST")"
VALIDATE_OLD_META="$(mode_owner "$VALIDATE_DST")"
SUDOERS_OLD_META="$(mode_owner "$SUDOERS_DST")"
printf 'INSTALLED BEFORE\nprepare=%s %s\nvalidate=%s %s\nsudoers=%s %s\n' "$PREPARE_OLD_SHA" "$PREPARE_OLD_META" "$VALIDATE_OLD_SHA" "$VALIDATE_OLD_META" "$SUDOERS_OLD_SHA" "$SUDOERS_OLD_META"

sudo install -o root -g root -m 0750 "$PREPARE_DST" "$PREPARE_BAK"
sudo install -o root -g root -m 0755 "$VALIDATE_DST" "$VALIDATE_BAK"
sudo install -o root -g root -m 0440 "$SUDOERS_DST" "$SUDOERS_BAK"
test "$(sudo_hash "$PREPARE_BAK")" = "$PREPARE_OLD_SHA"
test "$(sudo_hash "$VALIDATE_BAK")" = "$VALIDATE_OLD_SHA"
test "$(sudo_hash "$SUDOERS_BAK")" = "$SUDOERS_OLD_SHA"
test "$(mode_owner "$PREPARE_BAK")" = "$PREPARE_OLD_META"
test "$(mode_owner "$VALIDATE_BAK")" = "$VALIDATE_OLD_META"
test "$(mode_owner "$SUDOERS_BAK")" = "$SUDOERS_OLD_META"

targets_may_have_changed=1
sudo install -d -o root -g cgl_oracle -m 0750 /etc/cgl-oracle/jobs
sudo install -d -o root -g cgl_oracle -m 0750 /var/lib/cgl-oracle/jobs
sudo install -d -o cgl_oracle -g cgl_oracle -m 0711 /var/lib/cgl-oracle-public-results
sudo install -o root -g root -m 0750 "$PREPARE_SRC" "$PREPARE_DST"
sudo install -o root -g root -m 0755 "$VALIDATE_SRC" "$VALIDATE_DST"
sudo install -o root -g root -m 0440 "$SUDOERS_SRC" "$SUDOERS_DST"
sudo visudo -cf "$SUDOERS_DST"
test "$(sudo_hash "$PREPARE_DST")" = "$PREPARE_SHA"
test "$(sudo_hash "$VALIDATE_DST")" = "$VALIDATE_SHA"
test "$(sudo_hash "$SUDOERS_DST")" = "$SUDOERS_SHA"
require_exact_metadata "$PREPARE_DST" root:root:750
require_exact_metadata "$VALIDATE_DST" root:root:755
require_exact_metadata "$SUDOERS_DST" root:root:440
targets_may_have_changed=0
trap - ERR INT TERM
printf 'INSTALL PASS: files, modes, sudoers and hashes verified\n'
