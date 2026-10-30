#!/bin/zsh
# Lane tool (envelope-honesty-264): the ids-scoped CPU regen chain for one batch, in the fixpoint order
# (anatomy to its fixpoint, rigs, fills, markings, mission seats, spare-track, ledger, gun lines), every child niced,
# 4 GB heap and its own alarm, then a second pass that must change nothing, then each step's --check.
#   zsh .qa-dev/envelope/chain.zsh <batch-name> <id,id,...> [<sim-floor accept reason, no : or ;>]
setopt NO_BG_NICE pipefail
B=$1; IDS=$2; ACCEPT=$3
[[ -n $B && -n $IDS ]] || { echo "usage: chain.zsh <batch> <ids>"; exit 2; }
cd ${ROOT:-$HOME/cot-lanes/envelope-honesty-264} || exit 2
O=~/cot-lanes/envelope-honesty-264-evidence/chain-$B; mkdir -p $O
LOG=$O/chain.log; : > $LOG
say() { print -r -- "[$(date +%H:%M:%S)] $*" | tee -a $LOG; }
run() { # run <alarm-s> <label> <args...>
  local t=$1 label=$2; shift 2
  say "run $label: $*"
  perl -e 'alarm shift; exec @ARGV' $t nice -n 10 node --max-old-space-size=4096 "$@" >> $O/$label.log 2>&1
  local rc=$?; say "  $label rc=$rc"; return $rc
}
gen=(src/vehicles/combatAnatomyGroups src/vehicles/combatGunRigs.generated.ts src/vehicles/interiorFillGroups
  src/vehicles/vehicleMarkingSeatGroups src/vehicles/vehicleMarkingSeats.generated.ts src/sim/missionAttachmentSeats.generated.ts
  src/sim/missionDockSeats.generated.ts docs/geometry-gate docs/references/fleet-geometry-ledger.json src/vehicles/spareTrackSeatPlan.ts)
snap() { git diff --stat -- $gen | tail -1; git diff -- $gen | md5 -q; }
pass() { # one ordered pass; returns nonzero on any tool failure
  local n=$1
  for k in 1 2 3 4 5 6; do
    if [[ -n $ACCEPT ]]; then
      run 3600 anatomy$n-$k tools/gen-combat-anatomy.mjs --ids=$IDS "--accept-floor=$IDS:$ACCEPT" || return 1
    else
      run 3600 anatomy$n-$k tools/gen-combat-anatomy.mjs --ids=$IDS || return 1
    fi
    run 1800 anatomycheck$n-$k tools/gen-combat-anatomy.mjs --check --ids=$IDS && break
    say "  still moving: $(grep -h 'changed receipts' $O/anatomycheck$n-$k.log | cut -c1-200)"
  done
  run 1800 rigs$n tools/gun-barrel-align-census.mjs --rigs=src/vehicles/combatGunRigs.generated.ts --update --ids=$IDS || return 1
  run 1800 anatomyrig$n tools/gen-combat-anatomy.mjs --check --ids=$IDS || run 3600 anatomyrigfix$n tools/gen-combat-anatomy.mjs --ids=$IDS ${ACCEPT:+"--accept-floor=$IDS:$ACCEPT"} || return 1
  if (( fillsStale )) || [[ $n == 2 ]]; then run 7200 fills$n tools/gen-interior-fills.mjs --voxel=0.025 --cell=2 --rounds=8 --min-fine=1 --ids=$IDS || return 1; fi
  run 3600 marking$n tools/gen-vehicle-marking-seats.mjs --ids=$IDS || return 1
  run 3600 seats$n tools/gen-mission-attachment-seats.mjs --seeds=4000,4242,8191 --qualities=high,low --ids=$IDS || return 1
  run 3600 spare$n tools/spare-track-placement-check.mjs --ledger=docs/geometry-gate/spare-track.json --update --force --quiet --ids=$IDS || return 1
  run 3600 ledger$n tools/fleet-geometry-ledger.mjs --update --jobs=4 --ids=$IDS || return 1
  run 3600 gunlines$n tools/gun-junction-census.mjs --ledger=docs/geometry-gate/gun-junction.json --update --ids=$IDS || return 1
}
say "batch $B ids $IDS at $(git log -1 --format=%h)"
fillsStale=0
if [[ -n $FILLS_STALE ]]; then fillsStale=$FILLS_STALE; say "fills pre-check skipped (FILLS_STALE=$FILLS_STALE)"
else run 7200 c0-fills tools/changed-only/fills-check.mjs --voxel=0.025 --cell=2 --rounds=8 --min-fine=1 --ids=$IDS --jobs=4 || fillsStale=1; fi
pass 1 || { say "PASS1 FAILED"; exit 1; }
say "after pass 1: $(snap)"
checks() {
  local fail=0
  run 1800 c-anatomy$1 tools/gen-combat-anatomy.mjs --check --ids=$IDS || fail=1
  local rigsBefore=$(md5 -q src/vehicles/combatGunRigs.generated.ts)
  run 1800 c-rigs$1 tools/gun-barrel-align-census.mjs --rigs=src/vehicles/combatGunRigs.generated.ts --update --ids=$IDS || fail=1
  [[ $(md5 -q src/vehicles/combatGunRigs.generated.ts) == $rigsBefore ]] || { say "  rigs moved on the check run"; fail=1; }
  run 1800 c-marking$1 tools/gen-vehicle-marking-seats.mjs --check --ids=$IDS || fail=1
  run 1800 c-seats$1 tools/gen-mission-attachment-seats.mjs --seeds=4000,4242,8191 --qualities=high,low --check --ids=$IDS || fail=1
  run 1800 c-spare$1 tools/spare-track-placement-check.mjs --ledger=docs/geometry-gate/spare-track.json --quiet --check --ids=$IDS || fail=1
  run 1800 c-ledger$1 tools/fleet-geometry-ledger.mjs --check --jobs=4 --ids=$IDS || fail=1
  run 1800 c-gunlines$1 tools/gun-junction-census.mjs --ledger=docs/geometry-gate/gun-junction.json --check --ids=$IDS || fail=1
  run 7200 c-fills$1 tools/changed-only/fills-check.mjs --voxel=0.025 --cell=2 --rounds=8 --min-fine=1 --ids=$IDS --jobs=4 || fail=1
  return $fail
}
if checks A; then say "CHAIN-DONE checks all PASS after one pass"; exit 0; fi
say "a check failed after pass 1: second pass"
pass 2 || { say "PASS2 FAILED"; exit 1; }
say "after pass 2: $(snap)"
checks B && say "CHAIN-DONE checks all PASS after two passes" || say "CHAIN-DONE checks FAIL after two passes"
