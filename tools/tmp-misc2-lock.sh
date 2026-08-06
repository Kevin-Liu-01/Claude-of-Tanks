#!/bin/zsh
# tools/tmp-misc2-lock.sh — FIFO lock wrapper for browser-using probes
# (misc ariete-r2/type90 agent). Mirrors visual-evaluator.mjs's ticket
# queue at /tmp/cot-shots.queue + /tmp/cot-shots.lock so many agents
# share the GPU honestly. Usage: tools/tmp-misc2-lock.sh <cmd...>
set -e
QUEUE=/tmp/cot-shots.queue
LOCK=/tmp/cot-shots.lock
mkdir -p "$QUEUE"
# TICKET FORMAT MUST MATCH visual-evaluator.mjs exactly: 13-digit ms epoch
# zero-padded to 15 (macOS date has no %N — the old %s%N string sorted
# BEFORE every legitimate ticket = accidental queue-jumping).
MS=$(node -e 'console.log(String(Date.now()).padStart(15,"0"))')
TICKET="$QUEUE/$MS-$$.t"
echo $$ > "$TICKET"
cleanup() { rm -f "$TICKET"; if [ "$HELD" = "1" ]; then rmdir "$LOCK" 2>/dev/null || true; fi }
trap cleanup EXIT INT TERM
HELD=0
t0=$(date +%s)
while true; do
  # find queue head among live tickets
  head=""
  for n in $(ls "$QUEUE" 2>/dev/null | grep '\.t$' | sort); do
    p="$QUEUE/$n"
    pid="${n##*-}"; pid="${pid%.t}"
    if [ "$p" = "$TICKET" ]; then head="$p"; break; fi
    # stale (>60min) or dead pid -> drop
    mt=$(stat -f %m "$p" 2>/dev/null || echo 0)
    now=$(date +%s)
    if [ $((now - mt)) -gt 3600 ] || ! kill -0 "$pid" 2>/dev/null; then rm -f "$p"; continue; fi
    head="$p"; break
  done
  if [ "$head" = "$TICKET" ]; then
    if mkdir "$LOCK" 2>/dev/null; then HELD=1; break; fi
    # stale lock (>5min untouched)
    mt=$(stat -f %m "$LOCK" 2>/dev/null || echo 0)
    now=$(date +%s)
    if [ $((now - mt)) -gt 300 ]; then rmdir "$LOCK" 2>/dev/null || rm -f "$LOCK" 2>/dev/null || true; continue; fi
  fi
  if [ $(($(date +%s) - t0)) -gt 7200 ]; then echo "lock timeout" >&2; exit 1; fi
  sleep 1
done
# refresh mtime in background while running
( while true; do sleep 60; touch "$LOCK" 2>/dev/null || break; done ) &
REFRESH=$!
"$@"
rc=$?
kill $REFRESH 2>/dev/null || true
exit $rc
