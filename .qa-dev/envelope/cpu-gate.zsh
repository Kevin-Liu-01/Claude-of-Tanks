#!/bin/zsh
# Lane tool (envelope-honesty-264): the release gate's CPU steps (tools/tank-release-plan.mjs: sealed scoring, and the
# fleet probes that need no browser) for a set of ids, each its own log and rc, all run even when one fails.
#   .qa-dev/envelope/cpu-gate.zsh <name> <id,id,...>
setopt NO_BG_NICE
cd ${ROOT:-$HOME/cot-lanes/envelope-honesty-264}
N=$1; IDS=$2; O=$HOME/cot-lanes/envelope-honesty-264-evidence/cpu-gate-$N; mkdir -p $O; : > $O/summary.log
step() { local label=$1; shift; perl -e 'alarm 3600; exec @ARGV' nice -n 5 node --max-old-space-size=4096 "$@" > $O/$label.log 2>&1; local rc=$?; echo "$label rc=$rc" >> $O/summary.log; }
echo "== $N $(date +%T) head $(git rev-parse --short HEAD) ids=$IDS" >> $O/summary.log
step sealed tools/tank-sealed-check.mjs --ids=$IDS --ledger=docs/geometry-gate/sealed.json --gate
step ledger tools/fleet-geometry-ledger.mjs --check --jobs=4 --ids=$IDS
step seats tools/gen-mission-attachment-seats.mjs --seeds=4000,4242,8191 --qualities=high,low --check --ids=$IDS
step spare tools/spare-track-placement-check.mjs --ids=$IDS --ledger=docs/geometry-gate/spare-track.json --gate
step modulehit tools/module-hit-probe.mjs --ids=$IDS
step material tools/vehicle-material-registration.mjs --ids=$IDS
step gunjunction tools/gun-junction-census.mjs --ids=$IDS --ledger=docs/geometry-gate/gun-junction.json --check --gate
step circularity tools/turret-barrel-circularity.mjs --ids=$IDS
step marking tools/gen-vehicle-marking-seats.mjs --check --ids=$IDS
echo "== CPU-GATE-DONE $(date +%T)" >> $O/summary.log
