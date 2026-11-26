# Fail-closed probes and bounded waits for lane scripts (practice audit 2026-11-26, mechanism 10). First-party
# tooling: Kevin B. Liu. Source it from bash or zsh: `. ~/cot-lanes/lane-probe.sh` (that loader reads this file from
# git); tools/lane-probe.selftest.mjs runs every function under both shells.
#
# Why: before the 2026-11-26 00:35 reboot (the system file table filled), lane scripts carried ~11 copies of load1()
# and ~9 of portfree() that failed open (`lsof || return 0` read an lsof error as a free port; an unreadable load read
# as fine), a far-hull rerun chain retried every 3-6 s with no backoff, and a waiter polled a /private/tmp task output
# that the reboot then deleted, so it could never finish. Here:
#   - a probe that errors counts as busy / over the gate;
#   - every wait has a deadline, and polls at least 60 s apart, doubling to a 600 s cap with +-10% jitter;
#   - a retry loop stops after N failures in a row.
# This is the bridge until the shared `job wait` (Kevin-Wiki scripts/job) lands; then lanes move to it.
#
#   cot_load1                         the 1-minute load; prints 999 and returns 1 when it cannot be read
#   cot_load_over T / cot_load_under T  0 when over (or unreadable) / 0 only when readable and at or under T
#   cot_port_busy P / cot_port_free P   0 when a listener holds P or the probe fails / 0 only when lsof says no listener
#   cot_file_has TEXT FILE            0 when FILE holds TEXT (fixed string); a missing file is "not yet"
#   cot_wait DESC DEADLINE_S CMD...   run CMD until it succeeds; 124 at the deadline, 2 on a bad call
#   cot_retry MAX_FAILS DESC CMD...   rerun CMD until it succeeds; 75 after MAX_FAILS failures in a row
#
# Knobs: COT_PROBE_MAX_S (the backoff cap, default 600). The 60 s floor is fixed. Tests replace the clock and sleep
# with COT_PROBE_CLOCK and COT_PROBE_SLEEP (commands) and Linux's load file with COT_PROBE_LOADAVG; scripts leave them unset.

COT_PROBE_MIN_S=60

_cot_log() { printf '[lane-probe %s] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
_cot_now() { if [ -n "${COT_PROBE_CLOCK:-}" ]; then "$COT_PROBE_CLOCK"; else date +%s; fi; }
_cot_sleep() { if [ -n "${COT_PROBE_SLEEP:-}" ]; then "$COT_PROBE_SLEEP" "$1"; else sleep "$1"; fi; }
_cot_uint() { case "$1" in ''|*[!0-9]*) return 1;; *) return 0;; esac; }

# the delay before attempt N+1: 60 s doubling, capped, with +-10% jitter; never under the floor
_cot_delay() {
  local _cot_cap="${COT_PROBE_MAX_S:-600}"
  _cot_uint "$_cot_cap" && [ "$_cot_cap" -ge "$COT_PROBE_MIN_S" ] || _cot_cap=600
  awk -v n="$1" -v lo="$COT_PROBE_MIN_S" -v cap="$_cot_cap" -v seed="$$$1" 'BEGIN {
    srand(seed); d = lo; for (i = 1; i < n && d < cap; i++) d *= 2; if (d > cap) d = cap;
    d = int(d * (0.9 + 0.2 * rand())); if (d > cap) d = cap; if (d < lo) d = lo; print d }'
}

cot_load1() {
  local _cot_l
  _cot_l=$(sysctl -n vm.loadavg 2>/dev/null | awk '{ print $2 }')
  [ -n "$_cot_l" ] || _cot_l=$(awk '{ print $1 }' "${COT_PROBE_LOADAVG:-/proc/loadavg}" 2>/dev/null) # Linux
  case "$_cot_l" in
    ''|*[!0-9.]*|*.*.*) printf '999\n'; return 1;;
  esac
  printf '%s\n' "$_cot_l"
}

cot_load_over() {
  local _cot_l
  case "$1" in ''|*[!0-9.]*) _cot_log "load gate: not a number: '$1'; counts as over"; return 0;; esac
  _cot_l=$(cot_load1) || { _cot_log "load unreadable; counts as over $1"; return 0; }
  awk -v l="$_cot_l" -v t="$1" 'BEGIN { exit !(l + 0 > t + 0) }'
}
cot_load_under() { ! cot_load_over "$1"; }

cot_port_busy() {
  local _cot_out _cot_rc
  _cot_uint "$1" || { _cot_log "port probe: not a port: '$1'; counts as busy"; return 0; }
  command -v lsof >/dev/null 2>&1 || { _cot_log "no lsof: port $1 counts as busy"; return 0; }
  _cot_out=$(lsof -w -nP -iTCP:"$1" -sTCP:LISTEN -t 2>&1)
  _cot_rc=$?
  [ "$_cot_rc" -eq 1 ] && [ -z "$_cot_out" ] && return 1
  [ "$_cot_rc" -ne 0 ] && _cot_log "lsof failed (rc $_cot_rc): port $1 counts as busy: $(printf '%s' "$_cot_out" | head -c 160)"
  return 0
}
cot_port_free() { ! cot_port_busy "$1"; }

cot_file_has() { [ -f "$2" ] && grep -q -F -- "$1" "$2" 2>/dev/null; }

cot_wait() {
  local _cot_desc="$1" _cot_deadline="$2" _cot_start _cot_n=0 _cot_d _cot_elapsed _cot_arg
  if [ $# -lt 3 ] || ! _cot_uint "$_cot_deadline" || [ "$_cot_deadline" -le 0 ]; then
    _cot_log "cot_wait DESC DEADLINE_S CMD...: got '$*'"; return 2
  fi
  shift 2
  for _cot_arg in "$@"; do
    case "$_cot_arg" in
      */tmp/*|/var/folders/*) _cot_log "$_cot_desc: waits on $_cot_arg, which a reboot deletes; the deadline ends the wait";;
    esac
  done
  _cot_start=$(_cot_now)
  while :; do
    if "$@"; then return 0; fi
    _cot_n=$((_cot_n + 1))
    _cot_d=$(_cot_delay "$_cot_n")
    _cot_elapsed=$(( $(_cot_now) - _cot_start ))
    if [ $((_cot_elapsed + _cot_d)) -gt "$_cot_deadline" ]; then
      _cot_log "$_cot_desc: gave up after ${_cot_elapsed}s and $_cot_n polls (deadline ${_cot_deadline}s)"
      return 124
    fi
    _cot_log "$_cot_desc: not yet (poll $_cot_n, ${_cot_elapsed}s); next in ${_cot_d}s"
    _cot_sleep "$_cot_d"
  done
}

cot_retry() {
  local _cot_max="$1" _cot_desc="$2" _cot_fails=0 _cot_rc _cot_d
  if [ $# -lt 3 ] || ! _cot_uint "$_cot_max" || [ "$_cot_max" -le 0 ]; then
    _cot_log "cot_retry MAX_FAILS DESC CMD...: got '$*'"; return 2
  fi
  shift 2
  while :; do
    if "$@"; then return 0; else _cot_rc=$?; fi # (an `if` keeps a caller's `set -e` from exiting on a failed try)
    _cot_fails=$((_cot_fails + 1))
    if [ "$_cot_fails" -ge "$_cot_max" ]; then
      _cot_log "$_cot_desc: STOPPED after $_cot_fails failures in a row (last rc $_cot_rc)"
      return 75
    fi
    _cot_d=$(_cot_delay "$_cot_fails")
    _cot_log "$_cot_desc: failed (rc $_cot_rc, $_cot_fails of $_cot_max); retry in ${_cot_d}s"
    _cot_sleep "$_cot_d"
  done
}
