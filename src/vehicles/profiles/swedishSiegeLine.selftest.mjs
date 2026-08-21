import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';
import { getSpec } from '../specs.js';
import { tankTier } from '../tier.js';
import { NATIVE_FAMILY_ORDER } from '../fleetOrder.js';
import { createTankState, SIM_DT, updateTank } from '../../sim/movement.js';
import { SPECIAL_ACTION_KINDS, specialActionKind } from '../../sim/specialActions.js';

const LINE = ['udes03', 'strv103a', 'strv103'];
const TIERS = [8, 9, 10];
const MIN_HP = [1400, 1800, 2400];
const MIN_ALPHA = [400, 420, 440];
const MIN_PEN = [300, 320, 350];
const MIN_FRONT_ARMOR = [50, 125, 160];
const MAX_ACCURACY = [0.23, 0.21, 0.18];
const MAX_AIM_TIME_S = [1.4, 1.25, 1.05];

const specs = LINE.map(getSpec);
assert.deepEqual(LINE.map(tankTier), TIERS,
  'Swedish siege TDs progress through tiers VIII, IX and X');
assert.deepEqual(NATIVE_FAMILY_ORDER.sweden.slice(1, 4), LINE,
  'garage progression keeps UDES 03 directly ahead of both S-Tanks');

let previousDpm = 0;
for (let i = 0; i < LINE.length; i++) {
  const spec = specs[i];
  const shell = spec.gun.shells[0];
  const dpm = shell.dmg * 60 / spec.gun.reloadS;
  const upperGlacis = spec.armor.hullPlates.find((plate) => plate.name === 'upper_glacis');
  assert.ok(spec.hp >= MIN_HP[i], `${spec.id}: survivability is competitive at tier ${TIERS[i]}`);
  assert.ok(upperGlacis?.keMm >= MIN_FRONT_ARMOR[i],
    `${spec.id}: frontal protection improves along the siege line`);
  assert.ok(shell.dmg >= MIN_ALPHA[i], `${spec.id}: primary shell has tier-appropriate alpha`);
  assert.ok(shell.pen100Mm >= MIN_PEN[i], `${spec.id}: primary shell has tier-appropriate penetration`);
  assert.ok(spec.gun.baseAccuracy <= MAX_ACCURACY[i],
    `${spec.id}: siege accuracy is tier-appropriate`);
  assert.ok(spec.gun.aimTimeS <= MAX_AIM_TIME_S[i],
    `${spec.id}: suspension aiming settles promptly`);
  assert.ok(dpm > previousDpm, `${spec.id}: sustained fire improves along the siege line`);
  previousDpm = dpm;
  assert.ok(spec.hydropneumaticAim?.noseDownDeg >= 12,
    `${spec.id}: hydraulic nose-down authority is visibly stronger than the old six degrees`);
  assert.ok(spec.hydropneumaticAim?.noseUpDeg >= 11,
    `${spec.id}: hydraulic nose-up authority is visibly stronger than the old eight degrees`);
  assert.ok(spec.hydropneumaticAim?.rateDegS >= 9,
    `${spec.id}: hydraulic aiming reaches useful slopes promptly`);
  assert.equal(spec.armor.turretless, true, `${spec.id}: armor model is explicitly turretless`);
  assert.equal(spec.armor.turretPlates.length, 0,
    `${spec.id}: fixed-gun armor has no phantom rotating-turret hit surfaces`);
  assert.equal(specialActionKind(spec), SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM,
    `${spec.id}: suspension aim is spec-owned and available in every runtime`);
}

const flatTerrain = { getHeightAt: () => 0, getGroundType: () => 'hard' };
for (const spec of specs) {
  const state = createTankState(spec, new THREE.Vector3(), 0);
  const reachableAim = new THREE.Vector3(0, 28, 180);
  const entity = {
    spec,
    state,
    input: {
      throttle: 0, steer: 0, brake: false, fire: false, shellSlot: 0,
      aimPoint: reachableAim,
    },
  };
  state.suspensionAim = true;
  for (let frame = 0; frame < 360; frame++) updateTank(entity, flatTerrain, SIM_DT);
  assert.equal(state.turretYaw, 0,
    `${spec.id}: fixed gun never hides yaw in a virtual turret`);
  assert.equal(state.gunPitch, 0,
    `${spec.id}: fixed gun elevation is owned entirely by the rendered hull`);

  const visual = createTank(spec.id, null, { proceduralOnly: true, geometryReceipt: true });
  visual.setGroundSampler(() => 0);
  for (let frame = 0; frame < 48; frame++) visual.syncFromState(state, SIM_DT);
  visual.root.updateMatrixWorld(true);
  const muzzle = visual.root.getObjectByName('rig_muzzle');
  const muzzlePos = muzzle.getWorldPosition(new THREE.Vector3());
  const boreDir = new THREE.Vector3(0, 0, 1).transformDirection(muzzle.matrixWorld);
  const aimDir = reachableAim.clone().sub(muzzlePos).normalize();
  const boreErrorDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(
    boreDir.dot(aimDir), -1, 1)));
  assert.ok(boreErrorDeg <= 0.25,
    `${spec.id}: visible fixed bore tracks the requested aim (${boreErrorDeg.toFixed(3)} deg error)`);
  visual.dispose();

  entity.input.aimPoint.set(0, 85, 180);
  for (let frame = 0; frame < 240; frame++) updateTank(entity, flatTerrain, SIM_DT);
  assert.ok(state.suspensionAimPitch >= THREE.MathUtils.degToRad(10.5),
    `${spec.id}: hydraulic aim reaches a pronounced nose-up posture`);
  const settledVisual = createTank(spec.id, null, {
    proceduralOnly: true, geometryReceipt: true,
  });
  settledVisual.setGroundSampler(() => 0);
  for (let frame = 0; frame < 48; frame++) settledVisual.syncFromState(state, SIM_DT);
  const settledWheels = settledVisual.root.getObjectByName('gearRoadWheelTires');
  const settledMatrix = new THREE.Matrix4();
  const settledPosition = new THREE.Vector3();
  let settledMinY = Infinity;
  let settledMaxY = -Infinity;
  for (let instance = 0; instance < settledWheels.count; instance++) {
    settledWheels.getMatrixAt(instance, settledMatrix);
    settledPosition.setFromMatrixPosition(settledMatrix);
    settledMinY = Math.min(settledMinY, settledPosition.y);
    settledMaxY = Math.max(settledMaxY, settledPosition.y);
  }
  const settledStaggerM = settledMaxY - settledMinY;
  assert.ok(settledStaggerM >= 0.30,
    `${spec.id}: live hydraulic support solve uses compression and droop across the wheel course ` +
    `(${settledStaggerM.toFixed(3)} m)`);
  settledVisual.dispose();
  entity.input.aimPoint.set(0, -85, 180);
  for (let frame = 0; frame < 300; frame++) updateTank(entity, flatTerrain, SIM_DT);
  assert.ok(state.suspensionAimPitch <= THREE.MathUtils.degToRad(-11.5),
    `${spec.id}: hydraulic aim reaches a pronounced nose-down posture`);
}

const udes = createTank('udes03', null, { proceduralOnly: true, geometryReceipt: true });
const udesHull = udes.root.getObjectByName('rig_hull');
const udesWheels = udes.root.getObjectByName('gearRoadWheelTires');
assert.equal(udesHull?.userData.nativeRoadWheelStations, 4,
  'UDES 03 carries its own iconic four-station running gear');
assert.equal(udesWheels?.count, 8, 'UDES 03 has one four-wheel course per side');
assert.ok(udes.root.getObjectByName('gearTrackBandL'), 'UDES 03 has one deformable left track band');
assert.ok(udes.root.getObjectByName('gearTrackBandR'), 'UDES 03 has one deformable right track band');

for (const spec of specs) {
  const visual = createTank(spec.id, null, { proceduralOnly: true, geometryReceipt: true });
  const state = createTankState(spec, new THREE.Vector3(), 0);
  const wheels = visual.root.getObjectByName('gearRoadWheelTires');
  const band = visual.root.getObjectByName('gearTrackBandL');
  const restBand = Float32Array.from(band.geometry.getAttribute('position').array);
  state.visualPitch = THREE.MathUtils.degToRad(12);
  visual.setGroundSampler(() => 0);
  for (let frame = 0; frame < 36; frame++) visual.syncFromState(state, SIM_DT);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  let minWheelY = Infinity;
  let maxWheelY = -Infinity;
  for (let instance = 0; instance < wheels.count; instance++) {
    wheels.getMatrixAt(instance, matrix);
    position.setFromMatrixPosition(matrix);
    minWheelY = Math.min(minWheelY, position.y);
    maxWheelY = Math.max(maxWheelY, position.y);
  }
  assert.ok(maxWheelY - minWheelY >= 0.52,
    `${spec.id}: hydraulic posture produces at least 52 cm of visible bogie stagger`);

  const deformed = band.geometry.getAttribute('position').array;
  let maxBandTravel = 0;
  for (let i = 1; i < deformed.length; i += 3) {
    maxBandTravel = Math.max(maxBandTravel, Math.abs(deformed[i] - restBand[i]));
  }
  assert.ok(maxBandTravel >= 0.18,
    `${spec.id}: the loaded track run visibly reshapes with the hydraulic suspension`);
}

const hillSpec = getSpec('strv103');
const hillState = createTankState(hillSpec, new THREE.Vector3(), 0);
const hillEntity = {
  spec: hillSpec,
  state: hillState,
  input: { throttle: 0, steer: 0, brake: true, fire: false, shellSlot: 0, aimPoint: null },
};
const hill = {
  getHeightAt: (_x, z) => z * 0.25,
  getGroundType: () => 'hard',
};
for (let frame = 0; frame < 240; frame++) updateTank(hillEntity, hill, SIM_DT);
assert.ok(hillState.visualPitch >= THREE.MathUtils.degToRad(11),
  'the S-Tank settles into the real hill slope instead of staying visually flat');

console.log('swedishSiegeLine.selftest: tier balance, hydraulic authority and track deformation passed');
