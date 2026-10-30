#!/bin/zsh
# Lane tool (envelope-honesty-264): npm run tank:anatomy:check's CPU steps, fleet-wide, each logged with its rc (the
# tank-assets-check step runs in the icons hold, after the diagrams are rendered).
setopt NO_BG_NICE
cd ${ROOT:-$HOME/cot-lanes/envelope-honesty-264}
O=$HOME/cot-lanes/envelope-honesty-264-evidence/anatomy-check; mkdir -p $O; : > $O/summary.log
step() { local label=$1; shift; perl -e 'alarm 5400; exec @ARGV' nice -n 5 node --max-old-space-size=4096 "$@" > $O/$label.log 2>&1; echo "$label rc=$? $(date +%T)" >> $O/summary.log; }
echo "== $(date +%T) head $(git rev-parse --short HEAD)" >> $O/summary.log
step anatomy tools/gen-combat-anatomy.mjs --check
step marking tools/gen-vehicle-marking-seats.mjs --check
step fleetpass src/vehicles/fleetPassDefault.selftest.mjs
step modulehit tools/module-hit-probe.mjs
step spare tools/spare-track-placement-check.mjs --ids=all --ledger=docs/geometry-gate/spare-track.json --check --quiet
step censusrules tools/envelope-census.selftest.mjs
echo "== ANATOMY-CHECK-DONE $(date +%T)" >> $O/summary.log
