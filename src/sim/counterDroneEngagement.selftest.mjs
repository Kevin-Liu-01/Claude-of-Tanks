// VH.15 counter-drone, the cheap pins (227 guards; split in guards 229). The cause: the owner played the 226 preview and
// ruled "i think machine guns targeting drones is a lil too punishinng"; 226 moved AERIAL_RULES.drone.hitsToDown from 1
// to 1.1 (abbf6315a). This receipt holds the levers as data, with no authority, world or game state in its module graph
// (src/sim/counterDroneStations.test-support.mjs), so the selftest cache can key it and it costs about a second:
//   1. hitsToDown is 1.1 and the drone mode keeps counter-drone fire.
//   2. The census: every roof station in the fleet carries its class's 226 counter-drone numbers (reach, share at 100 m,
//      capped share, burst, cadence, slew, elevation; COUNTER_DRONE_CLASSES, literals). A station off every class, a
//      vehicle's own cartridge copy tuned apart (a Qilin-only 12.7 share), or a class re-tuned fails here. The class
//      anchors and the 30 mm + 7.62 roofs carry the classes the authority's pins are measured on.
//   3. The elevation ratchet: a mount scaled unevenly (y against z) carries its profile's elevationRad to another world
//      angle, and a drone above that angle is safe from it. The eleven stations more than 3 degrees off are listed.
// What the levers do in a fight is pinned on the authority elsewhere: each class anchor's hovers at 33 m and 102 m and a
// relaunched flight in src/sim/weaponReload.selftest.mjs (it already loads the authority and the solo battle), and every
// level pilot run of the lone anchors (seeds 1-8) and the 30 mm + 7.62 roofs, exactly, with the owner's 4-11 of 48 band,
// in src/sim/counterDroneRuns.selftest.mjs (and `node tools/counter-drone-engage.mjs --ids=<ids> --check` per vehicle).
import assert from 'node:assert/strict';
import { AUXILIARY_INVENTORY } from '../vehicles/auxiliaryInventory.generated.ts';
import { AERIAL_RULES, matchRulesetFor } from './matchRuleset.ts';
import { COUNTER_DRONE_CLASSES, COUNTER_DRONE_SETS, roofStations } from './counterDroneStations.test-support.mjs';

const OWNER = 'owner 2026-10-16 on the 226 preview: "machine guns targeting drones is a lil too punishinng"';

// 1. The airframe's threshold and the mode.
assert.equal(matchRulesetFor('drone').counterDrone, true, 'the drone mode keeps counter-drone fire');
assert.equal(AERIAL_RULES.drone.hitsToDown, 1.1, `${OWNER}: a drone falls at 1.1 strikes (226; it was 1)`);

// 2. The census: every roof station in the fleet, against its class's 226 numbers.
let stations = 0;
{
  const off = [];
  for (const id of Object.keys(AUXILIARY_INVENTORY)) for (const s of roofStations(id)) {
    stations++;
    if (!s.droneClass) off.push(`${id}:${s.name} (${s.caliberMm} mm)`);
  }
  assert.ok(stations > 100, `the census reads the fleet's roof stations (${stations})`);
  assert.deepEqual(off, [], `${OWNER}: every roof station carries its class's 226 counter-drone numbers (COUNTER_DRONE_CLASSES); these do not`);
  for (const [name, c] of Object.entries(COUNTER_DRONE_CLASSES)) assert.deepEqual(roofStations(c.anchor).map((s) => s.droneClass), [name], `${c.anchor}: one ${name} roof station`);
  for (const id of COUNTER_DRONE_SETS.pair) assert.deepEqual(roofStations(id).map((s) => s.droneClass), ['cannon', 'rifle'], `${id}: a 30 mm and a 7.62 on one roof`);
}

// 3. The elevation ratchet: every roof station in the fleet, against its profile.
{
  const KNOWN = {
    'leo2a7v:leo2a7v_xRoofMachineGun': 21.3, 'leo2a5m:leo2a4m_xRoofMachineGun': 21.9, 'leo2a6m:leo2a6m_xRoofMachineGun': 28.0,
    'leo2a5:leo2a5_xRoofMachineGun': 29.2, 'challenger3_proto:fitting_browningDerived_m2': 31.0, 'challenger3:fitting_browningDerived_m2': 31.0,
    'm551_sheridan:m551LoaderMg': 36.1, 'challenger1_mk2:challenger1LoaderL37': 48.0, 'challenger1_mk2:challenger1CommanderL37': 48.0,
    't90am:t90mProryvRemoteKord': 55.1, 't90m_proryv:t90mProryvRemoteKord': 55.1,
  };
  const off = {};
  for (const id of Object.keys(AUXILIARY_INVENTORY)) for (const s of roofStations(id)) {
    if (Math.abs(s.elevationReachDeg - s.profileElevationDeg) > 3) off[`${id}:${s.name}`] = +s.elevationReachDeg.toFixed(1);
  }
  const unlisted = Object.keys(off).filter((key) => !(key in KNOWN)).map((key) => `${key} reaches ${off[key]} deg`);
  const repaired = Object.keys(KNOWN).filter((key) => !(key in off));
  const moved = Object.keys(KNOWN).filter((key) => key in off && Math.abs(off[key] - KNOWN[key]) > .5).map((key) => `${key} ${KNOWN[key]} -> ${off[key]} deg`);
  assert.deepEqual(unlisted, [], 'a roof station whose mount scale moves its world elevation more than 3 degrees off its profile (a drone above it is safe from it)');
  assert.deepEqual(repaired, [], 'a listed station now reaches its profile: take it off the KNOWN list');
  assert.deepEqual(moved, [], 'a listed station\'s reach moved: re-measure and update the KNOWN list');
}

console.log(`counterDroneEngagement: hitsToDown ${AERIAL_RULES.drone.hitsToDown}; all ${stations} roof stations carry their class's 226 numbers; the class anchors and the 30 mm + 7.62 roofs hold their classes; the elevation ratchet holds (hovers: weaponReload.selftest; pilot runs: counterDroneRuns.selftest)`);
