// VH.15 counter-drone on the real network authority (227 guards, 2026-10-16). The cause: the owner played the 226
// preview and ruled "i think machine guns targeting drones is a lil too punishinng"; 226 moved
// AERIAL_RULES.drone.hitsToDown from 1 to 1.1 (abbf6315a). matchRuleset.selftest pins that value's arithmetic; this
// receipt pins what it does in a fight. Every engagement here runs inside createAuthoritativeMatch in the drone mode (the
// host Worker's and the match service's step: stepAerial, the roof stations with the authority's GunContext, droneHit
// and strikeDrone, the warhead's sweep) on flat open ground, with a pilot's aim intents
// (counterDroneEngagement.test-support.mjs; tools/counter-drone-engage.mjs is the same harness by --ids).
//   1. Point blank (a drone hovering about 33 m off the bow): a lone 7.62 still downs it inside one burst; a lone 12.7 or
//      30 mm survives a whole capped burst and falls to the second, a burst pause (1.4 s / 1.8 s) later.
//   2. The owner's band: level pilot runs (front, side, rear; seeds 1-8) against a lone machine gun (M1A1's 7.62, the
//      T-90A's 12.7) end with the drone downed in 4-11 of 48 (9 at 1.1; the 226 value of 1 downs 14).
//   3. The 30 mm + 7.62 one-roof pair (Leopard 2A7V, 2A5, Revolution, Leclerc XLR; seed 1 front, side and rear): both
//      stations answer the drone in every run and the pair downs at least 10 of 12 (12 at 1.1; with the 7.62 silent, 3).
//   4. A ratchet on the stations' world elevation: a mount scaled unevenly (y against z) carries its profile's
//      elevationRad to a different world angle, and a drone above that angle is safe from it. The eleven stations whose
//      reach is more than 3 degrees off their profile are listed; a new one, or a listed one that moves or is repaired,
//      fails until this list is updated. (The Leopard 2A7V's roof 7.62 reaches 21 degrees: it holds while a drone hovers
//      over the bow at 20 degrees; its repair is an open 227 item.)
// A failure in 1-3 means counter-drone lethality left the band the owner ruled: re-measure with
// `node tools/counter-drone-engage.mjs --set=reference,pair --check` and re-rule with the owner before moving a bound.
// Cost: the authority's specs for seven vehicles (about 2 s), three hovers and 61 attack runs (about 0.05 s each).
import assert from 'node:assert/strict';
import { AUXILIARY_INVENTORY } from '../vehicles/auxiliaryInventory.generated.ts';
import { auxiliaryWeaponProfile } from '../vehicles/auxiliaryWeapons.ts';
import { AERIAL_RULES, matchRulesetFor } from './matchRuleset.ts';
import {
  COUNTER_DRONE_SETS, counterDroneCell, engageCounterDrone, hoverCounterDrone, prepareCounterDrone, roofStations,
} from './counterDroneEngagement.test-support.mjs';

const OWNER = 'owner 2026-10-16 on the 226 preview: "machine guns targeting drones is a lil too punishinng"';
const LONE = Object.freeze({ '7.62': 'm1a1', '12.7': 't90a_2004', '30': 't72b3m_hetman' });
const PAIR = COUNTER_DRONE_SETS.pair;
assert.equal(matchRulesetFor('drone').counterDrone, true, 'the drone mode keeps counter-drone fire');
await prepareCounterDrone([...Object.values(LONE), ...PAIR]);
for (const [calibre, id] of Object.entries(LONE)) {
  const stations = roofStations(id);
  assert.deepEqual(stations.map((s) => String(s.caliberMm)), [calibre], `${id}: one ${calibre} mm roof station`);
}
for (const id of PAIR) assert.deepEqual(roofStations(id).map((s) => s.caliberMm), [30, 7.62], `${id}: a 30 mm and a 7.62 on one roof`);

// 1. Point blank: one bow hover per lone calibre.
{
  const hover = Object.fromEntries(Object.entries(LONE).map(([calibre, id]) => [calibre, hoverCounterDrone({ specId: id })]));
  for (const [calibre, h] of Object.entries(hover)) {
    assert.ok(h.downAt !== null && h.downedS < 4, `${LONE[calibre]}: its ${calibre} mm brings a hovering drone down within 4 s of its first round (${h.downedS?.toFixed(2)} s)`);
    assert.ok(h.rangeM > 25 && h.rangeM < 38, `${LONE[calibre]}: the hover sits at capped range (${h.rangeM?.toFixed(1)} m)`);
  }
  const p = (calibre) => auxiliaryWeaponProfile(Number(calibre), LONE[calibre]);
  assert.ok(hover['7.62'].insideFirstBurst, `a lone 7.62 still downs a drone inside one burst (${hover['7.62'].totalRounds} of ${p('7.62').burstRounds} rounds)`);
  for (const calibre of ['12.7', '30']) {
    const h = hover[calibre];
    assert.ok(!h.insideFirstBurst && h.totalRounds > p(calibre).burstRounds,
      `${OWNER}: a lone ${calibre} mm survives a whole capped burst (it fell to round ${h.totalRounds}; a burst is ${p(calibre).burstRounds})`);
    assert.ok(h.downedS >= p(calibre).burstPauseS,
      `${OWNER}: a lone ${calibre} mm needs its burst pause before the drone falls (${h.downedS.toFixed(2)} s after its first round, pause ${p(calibre).burstPauseS} s)`);
  }
}

// 2. The owner's band for a lone machine gun.
{
  const cells = ['m1a1', 't90a_2004'].map((id) => counterDroneCell({ specIds: [id], runs: 8 }));
  const n = cells.reduce((a, c) => a + c.n, 0), downed = cells.reduce((a, c) => a + c.downed, 0);
  assert.equal(n, 48);
  for (const c of cells) assert.equal(c.engaged, c.n, `${c.specIds[0]}: the station fires at every drone`);
  const detail = cells.map((c) => `${c.specIds[0]} ${c.downed}/${c.n}`).join(', ');
  assert.ok(downed <= 11, `${OWNER}: a lone machine gun downs at most 11 of 48 level runs; it downed ${downed} (${detail}; hitsToDown ${AERIAL_RULES.drone.hitsToDown})`);
  assert.ok(downed >= 4, `a lone machine gun still downs at least 4 of 48 level runs; it downed ${downed} (${detail})`);
}

// 3. The 30 mm + 7.62 one-roof pair.
{
  let downed = 0, n = 0, first = null;
  for (const id of PAIR) {
    const c = counterDroneCell({ specIds: [id], runs: 1 });
    downed += c.downed; n += c.n; first ??= c.rows[0];
    for (const [k, name] of [[0, '30 mm'], [1, '7.62']]) {
      const silent = c.rows.filter((r) => !(r.rounds[0][k] > 0)).map((r) => `${r.approach}:${r.seed}`);
      assert.deepEqual(silent, [], `${id}: its ${name} answers the drone in every run`);
    }
  }
  assert.equal(n, 12);
  assert.ok(downed >= 10, `two stations on one roof add their shares: the pair downs at least 10 of 12 level runs (${downed})`);
  // the authority is deterministic: the same run twice is the same run
  const again = engageCounterDrone({ specIds: [PAIR[0]], approach: first.approach, seed: first.seed });
  assert.deepEqual([again.outcome, again.at, again.rounds], [first.outcome, first.at, first.rounds], 'one seed, one outcome');
}

// 4. The elevation ratchet: every roof station in the fleet, against its profile.
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

console.log(`counterDroneEngagement: on the authority at hitsToDown ${AERIAL_RULES.drone.hitsToDown}, a lone 7.62 downs a hovering drone in one burst, a lone 12.7 or 30 mm only after its burst pause; a lone machine gun downs 4-11 of 48 level runs (the owner's band); the 30 mm + 7.62 roof (2A7V, 2A5, Revolution, XLR) fires both stations and downs 10+ of 12; the elevation ratchet holds`);
