// VH.15 counter-drone pilot runs on the authority, pinned exactly (guards 229; critic rounds 1 and 2). The levers are
// data in counterDroneEngagement.selftest and the hovers (33 m and 102 m) in weaponReload.selftest; this receipt flies
// what they cannot see: a share-law change at another range (critic round 1: a 12.7-only 1.6x lethality rise past
// 110 m passed both), the pilot's flight, the stations' slew and bursts on a moving target. Each run happens inside
// createAuthoritativeMatch in the drone mode, deterministic (COUNTER_DRONE_PINS, measured on integ/229):
//   1. the lone anchors (M1A1's 7.62, the T-90A's 12.7) on seeds 1-8, front, side and rear: every run's outcome,
//      rounds and ticks from launch, and the owner's band on them (4-11 of 48 downed; 9 at 1.1, 14 at the old 1);
//   2. the 30 mm + 7.62 one-roof Leopard 2A7V, 2A5, Revolution and Leclerc XLR, one seed each: every run exact with
//      both stations firing in each, and each roof's bow hover about 33 m out.
// A failure means counter-drone lethality moved: re-measure with `node tools/counter-drone-engage.mjs
// --set=reference,pair --check`, re-rule with the owner, then re-pin. About 6 s CPU (the authority's module graph and
// 64 flights). Its inputs never change on a tank lane's geometry edit, and the selftest cache keys it on its closure
// where the runner lists it as a fixture-keyed receipt (item/tests-speed-229's SELFTEST_FIXTURE_KEYED_FILES: the
// closure reaches i18nDictionaries' browser-only runtime-URL import(), which nothing here executes).
import assert from 'node:assert/strict';
import { AERIAL_RULES } from './matchRuleset.ts';
import { SIM_DT } from './movement.ts';
import {
  COUNTER_DRONE_PINS, LEVEL_APPROACHES, counterDroneCell, hoverCounterDrone, pinnedRunRow, prepareCounterDrone, roofStations,
} from './counterDroneEngagement.test-support.mjs';

const OWNER = 'owner 2026-10-16 on the 226 preview: "machine guns targeting drones is a lil too punishinng"';
const ids = Object.keys(COUNTER_DRONE_PINS.runs);
await prepareCounterDrone(ids);

const downed = {};
for (const id of ids) {
  const pin = COUNTER_DRONE_PINS.runs[id];
  const cell = counterDroneCell({ specIds: [id], runs: pin.runs, seed0: pin.seed0 });
  const rows = cell.rows.filter((r) => LEVEL_APPROACHES.includes(r.approach));
  const measured = rows.map(pinnedRunRow), expected = pin.rows.split(' ');
  const moved = expected.map((want, k) => (measured[k] === want ? null : `${rows[k]?.approach}:${rows[k]?.seed} ${want} -> ${measured[k]}`)).filter(Boolean);
  assert.deepEqual(moved, [], `${OWNER}: ${id}'s pinned level runs (seeds ${pin.seed0}-${pin.seed0 + pin.runs - 1}) moved (hitsToDown ${AERIAL_RULES.drone.hitsToDown})`);
  assert.equal(measured.length, expected.length);
  if (roofStations(id).length > 1) {
    const silent = rows.filter((r) => r.rounds[0].some((n) => !(n > 0))).map((r) => `${r.approach}:${r.seed}`);
    assert.deepEqual(silent, [], `${id}: every station of the roof answers the drone in every pinned run`);
  }
  downed[id] = rows.filter((r) => r.outcome === 'downed').length;
}
for (const [id, pin] of Object.entries(COUNTER_DRONE_PINS.hovers)) {
  const h = hoverCounterDrone({ specId: id });
  assert.deepEqual([h.rounds, h.downedS === null ? null : Math.round(h.downedS / SIM_DT)], pin,
    `${id}: two stations on one roof add their capped shares on a drone hovering 33 m off the bow`);
}
const { loneBand } = COUNTER_DRONE_PINS;
const loneDowned = loneBand.ids.reduce((sum, id) => sum + downed[id], 0);
assert.ok(loneDowned >= loneBand.downed[0] && loneDowned <= loneBand.downed[1],
  `${OWNER}: a lone machine gun downs ${loneBand.downed[0]}-${loneBand.downed[1]} of ${loneBand.of} level runs; it downed ${loneDowned}`);
// the authority is deterministic: one seed, one outcome
const first = counterDroneCell({ specIds: [ids[0]], runs: 1 }).rows[0];
assert.equal(pinnedRunRow(first), COUNTER_DRONE_PINS.runs[ids[0]].rows.split(' ')[0], 'one seed, one outcome');

console.log(`counterDroneRuns: ${Object.values(COUNTER_DRONE_PINS.runs).reduce((n, p) => n + 3 * p.runs, 0)} pinned level runs exact on the authority `
  + `(lone 7.62 and 12.7 down ${loneDowned} of ${loneBand.of}, the owner's band ${loneBand.downed.join('-')}); the 30 mm + 7.62 roofs fire both stations in every run; their bow hovers hold`);
