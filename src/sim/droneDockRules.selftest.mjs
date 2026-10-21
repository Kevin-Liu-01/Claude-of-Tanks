// droneDockRules.selftest.mjs — the drone dock's launch column is the ruleset's rule, read from a leaf (2026-10-16, the
// test-speed lane): src/sim/droneDockRules.ts holds AERIAL_RULES.drone.launchHeightM, which matchRuleset.ts reads and
// re-exports, and the decor keep-out reads the leaf so the ruleset stays out of every vehicle build's import graph.
//
// 1. One value: the ruleset's launch height is the leaf's, and no mode's ruleset carries a launch height of its own.
// 2. The decor keep-out's launch column (src/vehicles/decorations.ts dockKeepOut) rises exactly the ruleset's launch
//    height above the parked airframe on every docked vehicle.
// 3. The dock volumes' and the decor builder's import graphs reach the leaf and never the ruleset. (This receipt imports
//    both, so the runner keys it on every module the walk reads; src/ui/i18nChunkImport.selftest.mjs shows the
//    runner's own planner, whose importer, tools/selftest-cache.mjs, it never keys: it passes on process.env.)
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importChain, staticImportClosure } from '../../tools/static-import-closure.mjs';
import { DOCK_KEEP_OUT_CLEAR, dockKeepOut } from '../vehicles/decorations.ts';
import { DRONE_LAUNCH_HEIGHT_M as LEAF_LAUNCH_HEIGHT_M } from './droneDockRules.ts';
import { GAME_MODE_IDS } from './matchModes.ts';
import { AERIAL_RULES, DRONE_LAUNCH_HEIGHT_M, matchRulesetFor } from './matchRuleset.ts';
import { MISSION_DOCK_SEATS } from './missionDockSeats.generated.ts';
import { DRONE_DOCK_VOLUMES, missionAirframeVolumes, missionCradleVolumes } from './missionDockVolumes.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchHeightM } = AERIAL_RULES.drone;

// 1.
assert.equal(launchHeightM, LEAF_LAUNCH_HEIGHT_M, 'the ruleset reads its launch height from the leaf');
assert.equal(DRONE_LAUNCH_HEIGHT_M, LEAF_LAUNCH_HEIGHT_M, 'and re-exports the leaf\'s value');
assert.ok(Object.isFrozen(AERIAL_RULES.drone), 'the aerial rules are one frozen table');
for (const mode of GAME_MODE_IDS) {
  assert.doesNotMatch(JSON.stringify(matchRulesetFor(mode)), /launchHeight/i, `the ${mode} ruleset carries no launch height of its own`);
}

// 2.
const seats = Object.entries(MISSION_DOCK_SEATS);
assert.ok(seats.length > 20, 'the docked fleet');
for (const [id, seat] of seats) {
  const boxes = dockKeepOut(id, seat.frame), parked = missionAirframeVolumes(seat, false);
  const column = boxes.slice(missionCradleVolumes(seat).length);
  assert.equal(column.length, DRONE_DOCK_VOLUMES.length, `${id}: one launch-column box per airframe volume`);
  column.forEach((box, index) => {
    const rise = box.max.y - DOCK_KEEP_OUT_CLEAR - seat.y - parked[index].max[1];
    assert.ok(Math.abs(rise - launchHeightM) < 1e-9, `${id}: the keep-out's launch column rises ${rise} m, the ruleset's ${launchHeightM} m`);
  });
}

// 3.
for (const entry of ['src/sim/missionDockVolumes.ts', 'src/vehicles/decorations.ts']) {
  const graph = staticImportClosure(entry, { root: ROOT });
  assert.ok(graph.has('src/sim/droneDockRules.ts'), `${entry} reads the launch height from the leaf`);
  assert.ok(!graph.has('src/sim/matchRuleset.ts'),
    `${entry} reaches the ruleset (${importChain(graph, 'src/sim/matchRuleset.ts')}): every vehicle receipt would re-run on a rule edit`);
}

console.log(`droneDockRules.selftest: launch column ${launchHeightM} m, one value in ${GAME_MODE_IDS.length} modes; `
  + `${seats.length} docked vehicles keep it clear; the decor path reads the leaf, not the ruleset`);
