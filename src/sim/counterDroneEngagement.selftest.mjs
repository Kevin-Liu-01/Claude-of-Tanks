// VH.15 counter-drone on the real network authority (227 guards, 2026-10-16). The cause: the owner played the 226
// preview and ruled "i think machine guns targeting drones is a lil too punishinng"; 226 moved
// AERIAL_RULES.drone.hitsToDown from 1 to 1.1 (abbf6315a). matchRuleset.selftest pins that value's arithmetic; this
// receipt pins what it does in a fight. Every engagement runs inside createAuthoritativeMatch in the drone mode (the host
// Worker's and the match service's step: stepAerial, the roof stations with the authority's GunContext, droneHit and
// strikeDrone, the warhead's sweep) on flat open ground, with a pilot's aim intents
// (counterDroneEngagement.test-support.mjs; tools/counter-drone-engage.mjs is the same harness by --ids; the solo
// battle's own GunContext answers the same hover in weaponReload.selftest, which already loads game/state.ts).
//   1. The census: every roof station in the fleet carries its class's 226 counter-drone numbers (reach, share at 100 m,
//      capped share, burst, cadence, slew, elevation; COUNTER_DRONE_CLASSES, literals). A station off every class, a
//      vehicle's own cartridge copy tuned apart (a Qilin-only 12.7 share), or a class re-tuned fails here.
//   2. The elevation ratchet: a mount scaled unevenly (y against z) carries its profile's elevationRad to another world
//      angle, and a drone above that angle is safe from it. The eleven stations more than 3 degrees off are listed.
//   3. Hovers, deterministic (the same flight every run), one lone station per class: the rounds before the drone falls
//      and the ticks from the first round, pinned. About 33 m out every round is capped: a lone 7.62 downs it in 8
//      rounds inside one burst, a lone 12.7 (6) or 30 mm (4) only after a burst pause. About 102 m out every round is
//      below the cap: 46, 39 and 20 rounds. A flight relaunched after a downed one starts clean (8 rounds again).
//   4. The 30 mm + 7.62 one-roof pair (Leopard 2A7V, 2A5, Revolution, Leclerc XLR): each roof's capped hover pinned
//      (both stations' rounds: a ceiling and a floor on two-station lethality; the 2A7V's 7.62 cannot reach 20 degrees,
//      so only its 30 mm fires), and three level pilot runs each on its own seed: both stations answer every run, and
//      each run's outcome, rounds and ticks are pinned (a ceiling the old 12-of-12 floor did not have).
//   5. The owner's band: level pilot runs (front, side, rear; seeds 1-8) against a lone machine gun (M1A1's 7.62, the
//      T-90A's 12.7) end with the drone downed in 4-11 of 48 (9 at 1.1; the 226 value of 1 downs 14). The band is the
//      fight's outcome; the levers under it (hitsToDown, a share, a burst, a rate) are pinned in 1 and 3.
// A failure in 1, 3 or 4 means counter-drone lethality moved: re-measure with
// `node tools/counter-drone-engage.mjs --set=reference,pair --check`, re-rule with the owner, then update the pins.
// Cost: about 6.7 s CPU (the module graph about 3 s, the authority's specs for eight vehicles, 11 hovers, 61 pilot runs). It reruns on every npm
// test: like every receipt on the authority, its cache closure takes in whole directories (src/ui/i18nDictionaries.ts
// reaches an opaque import(), which the selftest cache counts as broad).
import assert from 'node:assert/strict';
import { AUXILIARY_INVENTORY } from '../vehicles/auxiliaryInventory.generated.ts';
import { AERIAL_RULES, matchRulesetFor } from './matchRuleset.ts';
import { SIM_DT } from './movement.ts';
import {
  COUNTER_DRONE_CLASSES, COUNTER_DRONE_SETS, counterDroneCell, engageCounterDrone, hoverCounterDrone, prepareCounterDrone, roofStations,
} from './counterDroneEngagement.test-support.mjs';

const OWNER = 'owner 2026-10-16 on the 226 preview: "machine guns targeting drones is a lil too punishinng"';
const PAIR = COUNTER_DRONE_SETS.pair;
const ticks = (s) => s === null ? null : Math.round(s / SIM_DT);
assert.equal(matchRulesetFor('drone').counterDrone, true, 'the drone mode keeps counter-drone fire');
assert.equal(AERIAL_RULES.drone.hitsToDown, 1.1, `${OWNER}: a drone falls at 1.1 strikes (226; it was 1)`);

// the lone anchors (the Rh 202's one hull, the MBT-70, is the entry point's anchor; its numbers are in the census)
const anchors = Object.fromEntries(Object.entries(COUNTER_DRONE_CLASSES).filter(([name]) => name !== 'rh202').map(([name, c]) => [name, c.anchor]));
await prepareCounterDrone([...Object.values(anchors), ...PAIR]);

// 1. The census: every roof station in the fleet, against its class's 226 numbers.
{
  const off = [];
  for (const id of Object.keys(AUXILIARY_INVENTORY)) for (const s of roofStations(id)) if (!s.droneClass) off.push(`${id}:${s.name} (${s.caliberMm} mm)`);
  assert.deepEqual(off, [], `${OWNER}: every roof station carries its class's 226 counter-drone numbers (COUNTER_DRONE_CLASSES); these do not`);
  for (const [name, id] of Object.entries(anchors)) assert.deepEqual(roofStations(id).map((s) => s.droneClass), [name], `${id}: one ${name} roof station`);
  for (const id of PAIR) assert.deepEqual(roofStations(id).map((s) => s.droneClass), ['cannon', 'rifle'], `${id}: a 30 mm and a 7.62 on one roof`);
}

// 2. The elevation ratchet: every roof station in the fleet, against its profile.
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

// 3. Hovers: one lone station per class, capped (about 33 m) and below the cap (about 102 m). Ticks from the first round
//    to the fall (60 a second); the rounds are the class table's.
{
  const TICKS = { rifle: { at30: 42, at100: 617 }, heavy: { at30: 117, at100: 838 }, cannon: { at30: 135, at100: 812 } };
  for (const [name, id] of Object.entries(anchors)) {
    const c = COUNTER_DRONE_CLASSES[name], near = hoverCounterDrone({ specId: id }), far = hoverCounterDrone({ specId: id, distanceM: 100, seconds: 30 });
    assert.ok(near.rangeM > 25 && near.rangeM < 38 && far.rangeM > 95 && far.rangeM < 110, `${id}: the hovers sit about 33 m and 102 m out (${near.rangeM?.toFixed(1)}, ${far.rangeM?.toFixed(1)} m)`);
    assert.deepEqual([near.rounds, ticks(near.downedS)], [[c.capped], TICKS[name].at30],
      `${OWNER}: a lone ${name} station downs a drone hovering 33 m out in ${c.capped} capped rounds, ${TICKS[name].at30} ticks after its first (measured ${JSON.stringify(near.rounds)}, ${ticks(near.downedS)} ticks; hitsToDown 1 gives fewer)`);
    assert.equal(near.insideFirstBurst, !c.survivesBurst, c.survivesBurst
      ? `${OWNER}: a lone ${name} station's first capped burst leaves the drone flying (${near.totalRounds} rounds; a burst is ${roofStations(id)[0].burstRounds})`
      : `a lone ${name} station still downs a drone inside one capped burst`);
    assert.deepEqual([far.rounds, ticks(far.downedS)], [[c.at100], TICKS[name].at100],
      `${OWNER}: below the cap (102 m) a lone ${name} station needs ${c.at100} rounds, ${TICKS[name].at100} ticks (measured ${JSON.stringify(far.rounds)}, ${ticks(far.downedS)} ticks)`);
  }
  const twice = hoverCounterDrone({ specId: anchors.rifle, flights: 2, seconds: 45 });
  assert.deepEqual(twice.flights.map((f) => [f.rounds, ticks(f.downedS)]), [[[8], 42], [[8], 42]],
    'a drone relaunched after a downed one starts with no strikes on it: the second flight takes the same 8 rounds');
}

// 4. The 30 mm + 7.62 one-roof pair: a capped hover and three level pilot runs per roof (each roof on its own seed; the
//    runs' rounds land mostly below the cap), rows pinned as outcome:30 mm rounds/7.62 rounds@ticks from launch.
{
  const HOVER = { leo2a7v: [[4, 0], 135], leo2a5: [[2, 3], 20], leo2_revolution: [[2, 4], 19], leclerc_xlr: [[2, 4], 18] };
  const RUNS = {
    leo2a7v: 'd:6/7@694 d:7/6@604 d:8/12@613', leo2a5: 'd:9/12@653 d:9/9@627 d:6/4@667',
    leo2_revolution: 'd:8/5@554 d:8/7@652 d:9/14@656', leclerc_xlr: 'd:8/5@609 d:7/11@611 d:7/6@677',
  };
  const row = (r) => `${r.outcome[0]}:${r.rounds[0].join('/')}@${r.at === null ? '-' : ticks(r.at)}`;
  let first = null;
  for (const [i, id] of PAIR.entries()) {
    const h = hoverCounterDrone({ specId: id }), hover = [h.rounds, ticks(h.downedS)];
    assert.deepEqual(hover, HOVER[id], `${id}: two stations on one roof add their capped shares on a drone hovering 33 m off the bow (measured ${JSON.stringify(hover)})`);
    const c = counterDroneCell({ specIds: [id], runs: 1, seed0: i + 1 });
    first ??= c.rows[0];
    for (const [k, name] of [[0, '30 mm'], [1, '7.62']]) {
      const silent = c.rows.filter((r) => !(r.rounds[0][k] > 0)).map((r) => `${r.approach}:${r.seed}`);
      assert.deepEqual(silent, [], `${id}: its ${name} answers the drone in every run`);
    }
    assert.equal(c.rows.map(row).join(' '), RUNS[id], `${id}: its level runs (seed ${i + 1}: front, side, rear)`);
  }
  // the authority is deterministic: the same run twice is the same run
  const again = engageCounterDrone({ specIds: [PAIR[0]], approach: first.approach, seed: first.seed });
  assert.deepEqual([again.outcome, again.at, again.rounds], [first.outcome, first.at, first.rounds], 'one seed, one outcome');
}

// 5. The owner's band for a lone machine gun.
{
  const cells = [anchors.rifle, anchors.heavy].map((id) => counterDroneCell({ specIds: [id], runs: 8 }));
  const n = cells.reduce((a, c) => a + c.n, 0), downed = cells.reduce((a, c) => a + c.downed, 0);
  assert.equal(n, 48);
  for (const c of cells) assert.equal(c.engaged, c.n, `${c.specIds[0]}: the station fires at every drone`);
  const detail = cells.map((c) => `${c.specIds[0]} ${c.downed}/${c.n}`).join(', ');
  assert.ok(downed <= 11, `${OWNER}: a lone machine gun downs at most 11 of 48 level runs; it downed ${downed} (${detail}; hitsToDown ${AERIAL_RULES.drone.hitsToDown})`);
  assert.ok(downed >= 4, `a lone machine gun still downs at least 4 of 48 level runs; it downed ${downed} (${detail})`);
}

console.log(`counterDroneEngagement: on the authority at hitsToDown ${AERIAL_RULES.drone.hitsToDown}, every roof station carries its class's 226 numbers; the elevation ratchet holds; a lone 7.62 / 12.7 / 30 mm downs a hovering drone in 8 / 6 / 4 capped rounds (the 12.7 and 30 mm only after a burst pause) and 46 / 39 / 20 below the cap, a relaunched drone starts clean; the 30 mm + 7.62 roofs' hovers and runs hold their pins with both stations firing; a lone machine gun downs 4-11 of 48 level runs (the owner's band)`);
