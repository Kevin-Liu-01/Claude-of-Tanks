import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';
import { getSpec } from '../specs.js';
import { createTankState, SIM_DT, updateTank } from '../../sim/movement.js';
import { SPECIAL_ACTION_KINDS, specialActionKind } from '../../sim/specialActions.ts';

const IDS = ['type74', 'stb1'];
const flatTerrain = { getHeightAt: () => 0, getGroundType: () => 'hard' };

for (const id of IDS) {
  const spec = getSpec(id);
  assert.equal(specialActionKind(spec), SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM,
    `${id}: exposes suspension aim as its context action`);
  assert.ok(spec.hydropneumaticAim?.noseDownDeg >= 8
    && spec.hydropneumaticAim?.noseUpDeg >= 8,
  `${id}: owns a useful bidirectional hydraulic aiming envelope`);
  assert.ok(spec.hydropneumaticAim?.compressionM >= 0.32
    && spec.hydropneumaticAim?.droopM >= 0.32,
  `${id}: owns enough physical travel for the five-station wheel train`);

  const state = createTankState(spec, new THREE.Vector3(), 0);
  const entity = {
    spec,
    state,
    input: {
      throttle: 0, steer: 0, brake: true, fire: false, shellSlot: 0,
      aimPoint: new THREE.Vector3(0, 24, 170),
    },
  };
  state.suspensionAim = true;
  for (let frame = 0; frame < 300; frame++) updateTank(entity, flatTerrain, SIM_DT);
  assert.ok(state.suspensionAimPitch >= THREE.MathUtils.degToRad(6),
    `${id}: active suspension produces a visible nose-up aiming attitude`);

  const visual = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  try {
    const hull = visual.root.getObjectByName('rig_hull');
    const receipt = hull?.userData.runningGearReceipts?.[0];
    const wheels = visual.root.getObjectByName('gearRoadWheelTires');
    assert.ok(receipt && wheels?.isInstancedMesh,
      `${id}: exposes its canonical wheel and track assembly`);
    assert.equal(receipt.suspensionPatternId, 'hydropneumatic-link',
      `${id}: uses the hydropneumatic linkage geometry`);
    assert.equal(receipt.suspensionLinkCount, 10,
      `${id}: both sides of all five road-wheel stations remain articulated`);

    if (id === 'type74') {
      assert.equal(receipt.botY, 0.055,
        'Type 74 lower track run shares the loaded tire contact datum');
      visual.root.updateMatrixWorld(true);
      const restBounds = new THREE.Box3().setFromObject(visual.root);
      assert.ok(restBounds.min.y > -0.08,
        `Type 74 rest geometry stays above the garage clipping threshold (${restBounds.min.y.toFixed(3)} m)`);
    }

    visual.setGroundSampler(() => 0);
    for (let frame = 0; frame < 48; frame++) visual.syncFromState(state, SIM_DT);
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
    assert.ok(maxWheelY - minWheelY >= 0.24,
      `${id}: live suspension visibly staggers the road-wheel train`);

  } finally {
    visual.dispose();
  }
}

console.log('japaneseHydropneumaticSuspension.selftest: Type 74 and STB-1 ride height and suspension aim pass');
