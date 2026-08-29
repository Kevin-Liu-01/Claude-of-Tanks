import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { measureTurretBarrelCircularity } from './turretBarrelCircularity.ts';

function createBarrelFixture(scaleX = 1, offsetX = 0) {
  const root = new THREE.Group();
  const gunRig = new THREE.Group();
  gunRig.name = 'rig_gun';
  root.add(gunRig);

  const geometry = new THREE.CylinderGeometry(0.1, 0.1, 3, 24);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0, 2.5);
  const barrel = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  barrel.name = 'gun';
  barrel.scale.x = scaleX;
  barrel.position.x = offsetX;
  gunRig.add(barrel);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'rig_muzzle';
  muzzle.position.z = 4;
  gunRig.add(muzzle);
  return root;
}

const circularFixture = createBarrelFixture();
const circularResult = measureTurretBarrelCircularity({ root: circularFixture });
assert.equal(circularResult.pass, true, 'a circular barrel passes the cross-section gate');
assert.ok(circularResult.worst?.aspectRatio < 1.01,
  `circular fixture stays round (${circularResult.worst?.aspectRatio})`);

const ovalFixture = createBarrelFixture(2);
const ovalResult = measureTurretBarrelCircularity({ root: ovalFixture });
assert.equal(ovalResult.pass, false, 'a one-axis-scaled barrel fails the cross-section gate');
assert.ok(ovalResult.worst?.aspectRatio > 1.9,
  `oval fixture exposes its distortion (${ovalResult.worst?.aspectRatio})`);

const offAxisFixture = createBarrelFixture(1, 0.045);
const offAxisResult = measureTurretBarrelCircularity({ root: offAxisFixture });
assert.equal(offAxisResult.pass, false,
  'a circular barrel offset from its declared firing axis fails the centering gate');
assert.ok(offAxisResult.worstAxis?.aspectRatio < 1.01,
  `off-axis fixture remains geometrically round (${offAxisResult.worstAxis?.aspectRatio})`);
assert.ok(Math.abs((offAxisResult.worstAxis?.lateralAxisOffsetM ?? 0) - 0.045) < 1e-4,
  `off-axis fixture exposes its 45 mm lateral error (${offAxisResult.worstAxis?.lateralAxisOffsetM})`);

for (const id of [
  't90a_vladimir',
  't90sm',
  'fv4034',
  'challenger2',
  'challenger2e',
  'ua_challenger2',
  't80',
  'm60a2',
  'bmpt_terminator2',
  'bmpt_t90',
  'type89',
  'm551_sheridan',
  'm551a1_tts',
  'leclerc',
  'leclerc_xlr',
  'amx56',
  't72b3m',
  't72bu',
  'ariete',
  'kf51',
  'merkava3d',
]) {
  const visual = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
    quality: 'high',
    camoSeed: 4242,
    staticPreview: true,
  });
  try {
    const result = measureTurretBarrelCircularity(visual, { requireMeasurement: true });
    assert.equal(result.pass, true,
      `${id} keeps circular, axis-centered barrel sections (worst ratio ${result.worst?.aspectRatio}, lateral ${result.worstAxis?.lateralAxisOffsetM})`);
    assert.ok(result.worst && result.worst.aspectRatio <= 1.08,
      `${id} exposes a measurable main-gun contour`);
    if (['fv4034', 'challenger2', 'challenger2e', 'ua_challenger2'].includes(id)) {
      const sleeveResult = measureTurretBarrelCircularity(visual, {
        requireMeasurement: true,
        meshNamePattern: /^gunMount$/,
        checkAxisAlignment: false,
      });
      assert.equal(sleeveResult.pass, true,
        `${id} keeps its forward gun sleeve circular (${sleeveResult.worst?.aspectRatio})`);
      const maximumSleeveDiameterM = Math.max(...sleeveResult.samples.map((sample) =>
        Math.max(sample.widthM, sample.heightM)));
      assert.ok(maximumSleeveDiameterM <= 0.23,
        `${id} L30 sleeve must stay at a normal diameter (${maximumSleeveDiameterM} m)`);
    }
    if (id === 't90sm') {
      let maximumJacketDiameterM = 0;
      for (const sample of result.samples) {
        if (sample.source === 'barrel') {
          maximumJacketDiameterM = Math.max(
            maximumJacketDiameterM,
            sample.widthM,
            sample.heightM,
          );
        }
      }
      assert.ok(maximumJacketDiameterM <= 0.26,
        `t90sm thermal jacket must stay at a normal diameter (${maximumJacketDiameterM} m)`);
    }
  } finally {
    visual.dispose();
  }
}

console.log('turretBarrelCircularity.selftest: circular, axis-centered geometry enforced for reported barrels');
