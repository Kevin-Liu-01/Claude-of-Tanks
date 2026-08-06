#!/bin/bash
# TEMP (abrams §B3/m1a1ha round): FIFO-honest lock wrapper for repo probe
# tools that don't implement the cot-shots ticket queue themselves.
# Usage: tools/tmp-b3-lockrun.sh <command...>   Deleted after round.
set -u
LOCK_DIR=/tmp/cot-shots.lock
QUEUE_DIR=/tmp/cot-shots.queue
mkdir -p "$QUEUE_DIR"
# ticket in the SAME 15-digit-millisecond format the mjs harnesses use —
# a wider ticket sorts ahead of every 15-char ticket and jumps the queue.
TICKET="$QUEUE_DIR/$(printf '%015d' "$(($(date +%s) * 1000))")-$$.t"
echo $$ > "$TICKET"
cleanup() { rm -f "$TICKET"; if [ "${HELD:-0}" = 1 ]; then rmdir "$LOCK_DIR" 2>/dev/null; fi; }
trap cleanup EXIT
T0=$(date +%s)
while :; do
  HEAD=""
  for t in $(ls "$QUEUE_DIR" 2>/dev/null | sort); do
    P="$QUEUE_DIR/$t"
    PID="${t##*-}"; PID="${PID%.t}"
    # stale (>60min) or dead ticket -> drop
    if [ -n "$(find "$P" -mmin +60 2>/dev/null)" ] || ! kill -0 "$PID" 2>/dev/null; then
      [ "$P" = "$TICKET" ] || { rm -f "$P"; continue; }
    fi
    HEAD="$P"; break
  done
  if [ "$HEAD" = "$TICKET" ]; then
    if mkdir "$LOCK_DIR" 2>/dev/null; then HELD=1; break; fi
    # steal stale lock (>5min untouched)
    if [ -n "$(find "$LOCK_DIR" -maxdepth 0 -mmin +5 2>/dev/null)" ]; then rmdir "$LOCK_DIR" 2>/dev/null || rm -f "$LOCK_DIR" 2>/dev/null; continue; fi
  fi
  [ $(( $(date +%s) - T0 )) -gt 1800 ] && { echo "lockrun: timeout" >&2; exit 1; }
  sleep 1
done
rm -f "$TICKET"
# refresh mtime in background while the child runs
( while :; do sleep 60; touch "$LOCK_DIR" 2>/dev/null || break; done ) &
REFRESH=$!
"$@"
RC=$?
kill "$REFRESH" 2>/dev/null
exit $RC
