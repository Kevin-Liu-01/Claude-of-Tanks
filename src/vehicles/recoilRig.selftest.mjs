// §5.362 recoil-rig selftest — the fleet recuperator contract (owner order:
// "make all cannons have proper recoil ... ifv autocannons should have recoil
// too, and the terminators should have alternating recoil").
//
// Headless (no fx clock registered), so syncFromState timelines advance by
// the caller's dt — the unit-probe fallback documented on lastFxS.
// Covers:
//  - caliber-class cannon throw (120 mm class ~0.13 m) + full recuperate
//    return to battery;
//  - autocannon-belt rapid stroke (5.5-7.7 cm) completing inside the fastest
//    belt cycle (no mid-return snap at 0.30-0.5 s reloads);
//  - twin-plant alternation (spec.gun.muzzles) on BOTH terminators
//    (bmpt_terminator2 ±0.16, bmpt_t90 §5.368 ±0.20): per-barrel fire
//    anchors, cursor + explicit-index recoilKick contract, asymmetric
//    yaw/roll kick mirroring with the firing barrel, flash-origin swap
//    distance, belt-refire clearance — plus a roster guard that fails if a
//    future gun.muzzles id is added without coverage here;
//  - casemate law: fixedMount chains re-seat rig_muzzle AND rig_recoil under
//    rig_hull; tubeless mounts (hull-printed cannons, incl. the hidden
//    ball-mount stub collars) never slide — their budget rides a boosted
//    hull rock.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec, TANK_SPECS } from './specs.ts';
import { createTankState } from '../sim/movement.ts';
import './garagePresentation.selftest.mjs';

const near = (a, b, eps, label) => assert.ok(
  Number.isFinite(a) && Math.abs(a - b) <= eps,
  `${label}: expected ${b} ±${eps}, got ${a}`,
);

function rig(id) {
  const visual = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const state = createTankState(getSpec(id), new THREE.Vector3(0, 0, 0), 0);
  const recoilG = visual.root.getObjectByName('rig_recoil');
  const turretG = visual.root.getObjectByName('rig_turret');
  const muzzle = visual.root.getObjectByName('rig_muzzle');
  const barrelGs = [
    visual.root.getObjectByName('rig_barrel_0'),
    visual.root.getObjectByName('rig_barrel_1'),
  ].filter(Boolean);
  visual.syncFromState(state, 0); // settle the rest pose
  return { visual, state, recoilG, turretG, muzzle, barrelGs };
}

// ---- stabilized bore: rendered suspension must not bend the shot line ----
{
  const { visual, state } = rig('leclerc');
  state.yaw = 0.3;
  state.visualPitch = 0.045;
  state.visualRoll = -0.03;
  state.turretYaw = 0.42;
  state.gunPitch = 0.075;
  state._susp.p = 0.032;
  state._susp.r = -0.021;
  state._swayEst = 0.013;
  state._flinch.p = 0.018;
  state._flinch.r = -0.012;
  visual.syncFromState(state, 0);

  const canonicalHull = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    -state.visualPitch, state.yaw, state.visualRoll, 'YXZ',
  ));
  const expected = new THREE.Vector3(
    Math.sin(state.turretYaw) * Math.cos(state.gunPitch),
    Math.sin(state.gunPitch),
    Math.cos(state.turretYaw) * Math.cos(state.gunPitch),
  ).applyQuaternion(canonicalHull).normalize();
  const actual = new THREE.Vector3();
  visual.gunDirWorld(actual);
  assert.ok(actual.angleTo(expected) < 1e-5,
    `leclerc: stabilizer holds canonical shell line through rendered hull rock (${actual.angleTo(expected)} rad)`);
}

// ---- 120 mm-class cannon: scale-true throw + full recuperate cycle --------
{
  const { visual, state, recoilG } = rig('leclerc');
  assert.equal(recoilG.position.z, 0, 'leclerc: in battery at rest');
  visual.recoilKick(0, 1);
  visual.syncFromState(state, 0.12); // inside the out-of-battery hold
  near(recoilG.position.z, -0.13, 1e-6, 'leclerc: 120 mm-class throw at hold');
  assert.ok(visual.root.getObjectByName('rig_gun').rotation.x < -0.013,
    'leclerc: cradle rock rides the stroke');
  assert.ok(state._flinch.pv !== 0, 'leclerc: hull-rock impulse routed to the sim mirror');
  visual.syncFromState(state, 0.70); // past back+hold+return (0.79 s)
  visual.syncFromState(state, 0.05);
  near(recoilG.position.z, 0, 1e-9, 'leclerc: recuperated to battery');
}

// ---- IFV autocannon: rapid shudder completes inside the belt cycle --------
{
  const { visual, state, recoilG } = rig('bmp3');
  visual.recoilKick(0, 0.36); // the shared belt scale (shotRecoilScale)
  visual.syncFromState(state, 0.06); // inside the rapid hold window
  near(recoilG.position.z, -0.066, 1e-6, 'bmp3: 30 mm rapid throw');
  assert.ok(visual.root.getObjectByName('rig_gun').rotation.x < -0.011,
    'bmp3: rapid cradle pitch remains visible despite stabilization');
  visual.syncFromState(state, 0.22); // t=0.28 = complete rapid cycle
  near(recoilG.position.z, 0, 1e-9, 'bmp3: back in battery before the 0.42 s belt refire');
  // same vehicle's missile rail (full impulse) plays the cannon profile
  visual.recoilKick(0, 1);
  visual.syncFromState(state, 0.12);
  near(recoilG.position.z, -0.06, 1e-6, 'bmp3: ATGM rail takes the cannon-class floor throw');
  visual.syncFromState(state, 1.0);
  near(recoilG.position.z, 0, 1e-9, 'bmp3: rail recuperated');
}

// ---- twin-plant alternation (BOTH terminators, spec.gun.muzzles) ----------
// Owner order: "the terminators should have alternating recoil depending on
// which gun is firing" — plural, so the contract is asserted for every
// twin-plant id off its OWN authored bore table:
//   bmpt_terminator2  twin 30 mm at x ±0.16 (§5.330 knob origin)
//   bmpt_t90 (§5.368) the same grammar sized up on a T-90A hull, x ±0.20
// Any future `spec.gun.muzzles` id must be added here (the roster guard at
// the end of this block fails the build if one is missing).
const TWIN_PLANT = ['bmpt_terminator2', 'bmpt_t90'];
for (const id of TWIN_PLANT) {
  const bore = getSpec(id).gun.muzzles.map((m) => m.x);
  assert.equal(bore.length, 2, `${id}: twin plant`);
  const { visual, state, recoilG, turretG, barrelGs } = rig(id);
  assert.equal(barrelGs.length, 2, `${id}: each physical tube owns an animation group`);
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
  visual.gunMuzzleWorld(a, 0);
  visual.gunMuzzleWorld(b, 1);
  visual.gunMuzzleWorld(c); // legacy center anchor
  near(a.x, bore[0], 0.02, `${id}: barrel 0 tip at the left bore`);
  near(b.x, bore[1], 0.02, `${id}: barrel 1 tip at the right bore`);
  near(b.x - a.x, bore[1] - bore[0], 0.02,
    `${id}: flash origin swaps the full ${(bore[1] - bore[0]).toFixed(2)} m`);
  near(c.x, 0, 1e-6, `${id}: no-index sample stays the center anchor`);
  near(a.y, b.y, 1e-6, `${id}: twin tips share the bore height`);

  // internal cursor alternates when no index is passed (studio/bridge path)
  assert.equal(visual.recoilKick(0, 0.36), 0, `${id}: cursor shot 1 -> barrel 0`);
  assert.equal(visual.recoilKick(0, 0.36), 1, `${id}: cursor shot 2 -> barrel 1`);
  assert.equal(visual.recoilKick(0, 0.36), 0, `${id}: cursor wraps`);
  // explicit index (sim path: shot N -> muzzles[N % len]) is respected
  assert.equal(visual.recoilKick(0, 0.36, 5), 1, `${id}: explicit index modulo`);

  // asymmetric kick: yaw/roll flip sides with the firing barrel
  visual.recoilKick(0, 0.36, 0); // left barrel
  visual.syncFromState(state, 0.06);
  const yawL = turretG.rotation.y - state.turretYaw;
  const rollL = recoilG.rotation.z;
  assert.ok(yawL < -0.010, `${id}: left barrel yaws the station left (got ${yawL})`);
  assert.ok(rollL > 0.017, `${id}: left barrel dips the left side (got ${rollL})`);
  near(recoilG.position.z, 0, 1e-12, `${id}: shared cradle does not slide both tubes`);
  near(barrelGs[0].position.z, -0.066, 1e-6, `${id}: left firing tube recoils`);
  near(barrelGs[1].position.z, 0, 1e-12, `${id}: right idle tube stays in battery`);
  visual.syncFromState(state, 0.5); // settle
  visual.recoilKick(0, 0.36, 1); // right barrel
  visual.syncFromState(state, 0.06);
  const yawR = turretG.rotation.y - state.turretYaw;
  const rollR = recoilG.rotation.z;
  assert.ok(yawR > 0.010, `${id}: right barrel yaws the station right (got ${yawR})`);
  assert.ok(rollR < -0.017, `${id}: right barrel dips the right side (got ${rollR})`);
  assert.ok(Math.abs(yawL + yawR) < 1e-9 && Math.abs(rollL + rollR) < 1e-9,
    `${id}: the two barrels' kicks are exact mirrors`);
  near(recoilG.position.z, 0, 1e-12, `${id}: shared cradle remains seated`);
  near(barrelGs[0].position.z, 0, 1e-12, `${id}: left idle tube stays in battery`);
  near(barrelGs[1].position.z, -0.066, 1e-6, `${id}: right firing tube recoils`);
  // The Terminator belt refire must find the tube back in battery; the
  // rapid stroke spans exactly 0.28 s, matching the fastest twin cycle.
  const cycle = getSpec(id).gun.shells[0].reloadS;
  visual.syncFromState(state, cycle - 0.06);
  for (let index = 0; index < barrelGs.length; index++) {
    near(barrelGs[index].position.z, 0, 1e-9,
      `${id}: tube ${index} in battery before the ${cycle}s belt refire`);
  }
  near(recoilG.rotation.z, 0, 1e-12, `${id}: cradle roll returns to zero`);
}
// Roster guard: every id that authors `gun.muzzles` must be exercised above.
// Scans the whole spec table (the tankFactory import above has already run
// the roster registration side effect, so this is the full 140+ id census,
// not the 26-id base TANK_IDS array).
{
  const seen = Object.keys(TANK_SPECS).filter((id) => {
    const g = TANK_SPECS[id].gun;
    return Array.isArray(g && g.muzzles) && g.muzzles.length > 1;
  });
  assert.ok(seen.length >= 2,
    `roster guard is vacuous — found ${seen.length} twin-plant ids in a ${Object.keys(TANK_SPECS).length}-id table`);
  for (const id of seen) {
    assert.ok(TWIN_PLANT.includes(id),
      `twin-plant id ${id} authors gun.muzzles but is not covered by the alternation test`);
  }
}

// ---- casemate law: fixedMount chain + tubeless stroke suppression ---------
{
  const { visual, state, recoilG, muzzle } = rig('t95');
  assert.equal(muzzle.parent.name, 'rig_hull', 't95: rig_muzzle under rig_hull (§5.313)');
  assert.equal(recoilG.parent.name, 'rig_hull', 't95: rig_recoil joins the hull chain (§5.362)');
  visual.recoilKick(0, 1);
  visual.syncFromState(state, 0.12);
  assert.equal(recoilG.position.z, 0, 't95: hull-printed cannon never slides');
  const t95Rock = Math.abs(state._flinch.pv);
  assert.ok(t95Rock > 0, 't95: chassis carries the recoil impulse');

  const lec = rig('leclerc');
  lec.visual.recoilKick(0, 1);
  lec.visual.syncFromState(lec.state, 0.12);
  assert.ok(t95Rock > Math.abs(lec.state._flinch.pv) * 1.3,
    `t95: tubeless hull rock is boosted past the tube-recoil fleet (${t95Rock} vs ${Math.abs(lec.state._flinch.pv)})`);
}

// ---- stub guard: hidden ball-mount collars never walk the static tube -----
{
  const { visual, state, recoilG } = rig('isu152');
  visual.recoilKick(0, 1);
  visual.syncFromState(state, 0.12);
  assert.equal(recoilG.position.z, 0, 'isu152: 0.26 m stub collar stays seated');
}

// ---- shortest real tube in the fleet (m2a2 0.755 m Bushmaster) recoils ----
{
  const { visual, state, recoilG } = rig('m2a2_bradley');
  visual.recoilKick(0, 0.36);
  visual.syncFromState(state, 0.06);
  near(recoilG.position.z, -0.055, 1e-6, 'm2a2: 25 mm belt shudder on the short tube');
  visual.syncFromState(state, 0.22);
  near(recoilG.position.z, 0, 1e-9, 'm2a2: belt stroke recuperated inside the cycle');
}

console.log('recoilRig.selftest: cannon throw, belt shudder, twin-plant alternation and casemate law pass');
