// 235 crew fit: every playable vehicle's crew stations are seated P50 (1.75 m) bodies inside the exact shell.
//   - the posture policy: modern MBT drivers recline, other drivers sit, turret loaders stand where they can;
//   - every calibration row seats its internal layout's crew roster, in order, in each station's frame;
//   - the finalized anatomy (what every client and authority reads) carries each seat's literal box, head, posture and
//     hit shapes;
//   - every seated hit shape lies inside armour at every turret yaw (hull crew: the hull; turret crew: the turret, or
//     the hull under it at every yaw; never the open gap between them), every station box corner inside the crew
//     shell (which adds the turret ring's opening), the head on its head shape, HE splash at head, torso and lap;
//   - only the pinned stations needed trimming (no posture fits their shell).
import assert from 'node:assert/strict';
import '../vehicles/tankFactory.ts';
import { ALL_TANK_IDS, getSpec } from './specs.ts';
import { COMBAT_ANATOMY_CALIBRATIONS } from './combatAnatomyCalibrations.ts';
import { INTERNAL_LAYOUT_BY_TANK } from './internalLayoutRegistry.ts';
import { crewArmour, crewPostureLadders, crewShell, shapeSurfaceSamples } from '../../tools/crew-seat-fit.mjs';

// Stations where no P50 posture fits the measured shell (the body's share left outside at the best placement): kept
// there, shapes trimmed inside. The Challenger 2 / FV4034 turret is ~0.56 m tall over a ~0.65 m-radius hull collar,
// the ZTZ-100s', TOS-1A's and Type 96B's turrets and the BMPT's hull bays are as low; the rest miss by under 1 %.
const TRIMMED = Object.freeze({
  // 243: t90a_2006 and t90a_burlak_proto seat untrimmed on gun-hull 49bf1fd16a's T-90 fixes (the crew refit on the
  // merged tree); leo2a4m_can at 242's crew refit of the rows both lanes moved (bb3b58a894)
  'abramsx/gunner': 0.006, 'cv90_mk4/gunner': 0.008,
  'cv90_mk4/commander': 0.003, 'leo2a4m_can/gunner': 0.007, 'leo2a4m_can/commander': 0.008,
  'leo2a4m_can/loader': 0.007, 'type96b/gunner': 0.043, 'type96_80_feng/gunner': 0.004, 'ztz100/gunner': 0.021,
  'ztz100/commander': 0.022, 'ztz100_prototype/gunner': 0.034, 'ztz100_prototype/commander': 0.012,
  'm60a3/driver': 0.001, 'tos1a_tagil/gunner': 0.017, 'tos1a_tagil/commander': 0.017,
  'bmpt_t90/weaponOperatorLeft': 0.008, 'bmpt_t90/weaponOperatorRight': 0.059, 'k2_black_panther/commander': 0.005,
  't72b3m_hetman_ii/driver': 0.001, 't80u_yun/gunner': 0.008,
});

assert.deepEqual(crewPostureLadders('leo2a6', 'leopard', 'driver', 'hull'), ['driverReclined']);
assert.deepEqual(crewPostureLadders('m1a2_abrams_sepv3', 'abrams', 'driver', 'hull'), ['driverReclined']);
assert.deepEqual(crewPostureLadders('t72b3', 'sovietAz', 'driver', 'hull'), ['driverReclined']);
assert.deepEqual(crewPostureLadders('leo1a5', 'leopard', 'driver', 'hull'), ['driverSeated', 'driverReclined']);
assert.deepEqual(crewPostureLadders('m60a3', 'westernManualHullAmmo', 'driver', 'hull'), ['driverSeated', 'driverReclined']);
assert.deepEqual(crewPostureLadders('chieftain5', 'westernManualHullAmmo', 'driver', 'hull'), ['driverReclined']);
assert.deepEqual(crewPostureLadders('m60a3', 'westernManualHullAmmo', 'loader', 'turret'), ['loaderStanding', 'loaderSeated', 'seatedHunched']);
assert.deepEqual(crewPostureLadders('m60a3', 'westernManualHullAmmo', 'commander', 'turret'), ['commander', 'seatedHunched']);

let stations = 0, shapes = 0, reclined = 0, standing = 0, basket = 0;
const trimmed = {};
for (const id of ALL_TANK_IDS) {
  const calibration = COMBAT_ANATOMY_CALIBRATIONS[id];
  const layout = INTERNAL_LAYOUT_BY_TANK[id];
  const seats = calibration.crewSeats;
  assert.ok(Array.isArray(seats), `${id}: calibration carries crew seats`);
  assert.deepEqual(seats.map((seat) => [seat.crew, seat.frame]), layout.crew.map((station) => [station.role, station.frame]),
    `${id}: one seat per researched crew station, in order, in its frame`);
  const armor = getSpec(id).armor;
  for (const seat of seats) {
    stations++;
    const volume = armor.crew.find((entry) => entry.crew === seat.crew);
    assert.ok(volume, `${id}/${seat.crew}: finalized crew volume`);
    assert.deepEqual([volume.min, volume.max, volume.head, volume.shapes, volume.posture, volume.blastPoints],
      [seat.min, seat.max, seat.head, seat.shapes, seat.posture, seat.blastPoints], `${id}/${seat.crew}: the finalized station is the seat`);
    assert.equal(seat.blastPoints.length, 3, `${id}/${seat.crew}: HE splash strikes head, torso and lap`);
    for (const value of [...seat.min, ...seat.max, ...seat.head, ...seat.pelvis, ...Object.values(seat.posture).filter((v) => typeof v === 'number')]) {
      assert.ok(Number.isFinite(value), `${id}/${seat.crew}: finite seat`);
    }
    for (let axis = 0; axis < 3; axis++) assert.ok(seat.min[axis] < seat.max[axis], `${id}/${seat.crew}: ordered box`);
    const turretFrame = seat.frame === 'turret';
    const shell = crewShell(armor, seat.frame);
    const armour = crewArmour(armor, seat.frame);
    const head = seat.shapes[0];
    assert.equal(head.kind, 'ellipsoid', `${id}/${seat.crew}: head shape first`);
    assert.deepEqual(head.center, seat.head, `${id}/${seat.crew}: head on its head shape`);
    assert.ok(seat.shapes.slice(1).every((shape) => shape.kind === 'capsule'), `${id}/${seat.crew}: limbs are capsules`);
    if (seat.trimmed === undefined) assert.ok(seat.shapes.length >= 5, `${id}/${seat.crew}: head, torso, thighs, shins`);
    else trimmed[`${id}/${seat.crew}`] = seat.trimmed;
    for (const shape of seat.shapes) {
      shapes++;
      for (const point of shapeSurfaceSamples(shape)) {
        assert.ok(armour.inside(point, -0.003), `${id}/${seat.crew}: ${shape.kind} inside armour at ${point.map((v) => v.toFixed(3))}`);
      }
    }
    for (const x of [seat.min[0], seat.max[0]]) for (const y of [seat.min[1], seat.max[1]]) for (const z of [seat.min[2], seat.max[2]]) {
      assert.ok(shell.inside([x, y, z], -0.01), `${id}/${seat.crew}: station box corner inside the shell`);
    }
    if (seat.posture.kind === 'driverReclined') reclined++;
    if (seat.posture.kind === 'loaderStanding') standing++;
    if (turretFrame && seat.shapes.some((shape) => (shape.kind === 'capsule' ? Math.min(shape.a[1], shape.b[1]) : shape.center[1])
      < Math.min(...armor.collisionShells.turret.map((cell) => cell.min[1])))) basket++;
  }
}
assert.deepEqual(trimmed, TRIMMED, 'only the pinned stations are trimmed');
console.log(`crew seats: ${ALL_TANK_IDS.length} vehicles · ${stations} seated P50 crew (${reclined} reclined drivers, `
  + `${standing} standing loaders, ${basket} turret crew in the basket) · ${shapes} hit shapes inside the shell · `
  + `${Object.keys(trimmed).length} trimmed PASS`);
