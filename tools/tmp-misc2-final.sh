#!/bin/zsh
# tools/tmp-misc2-final.sh — end-of-round verification batch v2 (misc push-2).
# Runs under ONE cot-shots lock session via tmp-misc2-lock.sh. v2: every
# step writes its own scratchpad file (v1 lost everything to a buffered
# tail when the harness backgrounded the job) and failures don't abort.
cd /Users/kevinliu/claude-of-tanks
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
SCRATCH="${SCRATCH:-/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad}"
LOG="$SCRATCH/final-batch-v2.log"
step() { echo "[$(date +%H:%M:%S)] === $1 ===" | tee -a "$LOG"; }
step "GATE RUN A"
node tools/geometry-gate.mjs --ids=ariete,type90 > "$SCRATCH/gate-a.txt" 2>&1
echo "rc=$? lines=$(wc -l < "$SCRATCH/gate-a.txt")" | tee -a "$LOG"
tail -4 "$SCRATCH/gate-a.txt" | tee -a "$LOG"
step "GATE RUN B (x2)"
node tools/geometry-gate.mjs --ids=ariete,type90 > "$SCRATCH/gate-b.txt" 2>&1
echo "rc=$?" | tee -a "$LOG"
tail -4 "$SCRATCH/gate-b.txt" | tee -a "$LOG"
step "TRACK-CLIP exact"
node tools/track-clip-audit.mjs --exact --ids=ariete,type90 > "$SCRATCH/clip.txt" 2>&1
echo "rc=$?" | tee -a "$LOG"
tail -8 "$SCRATCH/clip.txt" | tee -a "$LOG"
step "STANDARD CHECK"
node tools/tank-standard-check.mjs --ids=ariete,type90 > "$SCRATCH/stdcheck.txt" 2>&1
echo "rc=$?" | tee -a "$LOG"
tail -12 "$SCRATCH/stdcheck.txt" | tee -a "$LOG"
step "TURRET-PARENT AUDIT"
node tools/turret-parent-audit.mjs --ids=ariete,type90 > "$SCRATCH/parent.txt" 2>&1
echo "rc=$?" | tee -a "$LOG"
tail -10 "$SCRATCH/parent.txt" | tee -a "$LOG"
step "BOARDS"
mkdir -p shots/misc-push2/after
node tools/procedural-fidelity.mjs --ids=ariete,type90 --board --shots=1 > "$SCRATCH/boards.txt" 2>&1
echo "rc=$?" | tee -a "$LOG"
tail -6 "$SCRATCH/boards.txt" | tee -a "$LOG"
step "ALL DONE"
