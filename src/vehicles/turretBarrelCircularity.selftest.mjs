import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { measureTurretBarrelCircularity } from './turretBarrelCircularity.ts';

function createBarrelFixture(scaleX = 1) {
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

for (const id of [
  't90a_vladimir',
  'fv4034',
  'challenger2e',
  'ua_challenger2',
  't80',
  'm60a2',
  'bmpt_terminator2',
  'bmpt_t90',
  'type89',
  'm551_sheridan',
  'm551a1_tts',
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
      `${id} keeps circular barrel sections (worst ratio ${result.worst?.aspectRatio})`);
    assert.ok(result.worst && result.worst.aspectRatio <= 1.08,
      `${id} exposes a measurable main-gun contour`);
    if (['fv4034', 'challenger2e', 'ua_challenger2'].includes(id)) {
      const sleeveResult = measureTurretBarrelCircularity(visual, {
        requireMeasurement: true,
        meshNamePattern: /^gunMount$/,
      });
      assert.equal(sleeveResult.pass, true,
        `${id} keeps its forward gun sleeve circular (${sleeveResult.worst?.aspectRatio})`);
    }
  } finally {
    visual.dispose();
  }
}

console.log('turretBarrelCircularity.selftest: circular geometry enforced for reported barrels');
