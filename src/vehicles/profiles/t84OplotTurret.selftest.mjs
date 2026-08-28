import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const tank = createTank('t84', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  const turret = turretRig?.getObjectByName('turret');
  const turretDark = turretRig?.getObjectByName('turretDark');
  const turretExternalArmor = turretRig?.getObjectByName('turretExternalArmor');
  assert.ok(turretRig && gunRig && turret?.isMesh && turretDark?.isMesh
    && turretExternalArmor?.isMesh,
    'T-84 keeps structural turret, ERA detail and gun geometry on articulated rigs');

  const receipt = turretRig.userData.t84OplotTurretReceipt;
  assert.ok(receipt, 'T-84 exposes its turret modernization receipt');
  assert.equal(receipt.architecture, 'kmdb-welded-duplet',
    'turret uses the Ukrainian welded/Duplet architecture');
  assert.equal(receipt.cheekCarrierWings, 2, 'both cheek ERA fields have structural carriers');
  assert.equal(receipt.cheekEraCassettes, 16, 'two eight-cassette cheek fields are present');
  assert.equal(receipt.flankEraCassettes, 8, 'cheek ERA wraps around both turret flanks');
  assert.equal(receipt.cassetteBackingContinuous, true,
    'intentional cassette seams remain backed by continuous armor');
  assert.ok(receipt.minimumPanelOverlapM >= 0.03,
    'bustle and cheek close-outs overlap by at least 30 mm');
  assert.equal(receipt.shoulderCloseoutPanels, 2, 'both cheek-to-bustle shoulders are closed');
  assert.equal(receipt.bustleSidePanels, 2, 'bustle has complete left and right side shells');
  assert.equal(receipt.bustleRearClosurePanels, 1, 'bustle has a structural rear service plate');
  assert.equal(receipt.bustleAttached, true, 'bustle is attached to the turret shell');

  const position = turretExternalArmor.geometry.getAttribute('position');
  const normal = turretExternalArmor.geometry.getAttribute('normal');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  let cheekCapTriangles = 0;
  let flankCapTriangles = 0;
  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    n.fromBufferAttribute(normal, index).normalize();
    const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    if (n.y > 0.90 && area > 0.012 && area < 0.024
      && Math.abs(centroid.x) > 0.12 && Math.abs(centroid.x) < 1.14
      && centroid.y > 0.35 && centroid.y < 0.65
      && centroid.z > 0.65 && centroid.z < 1.82) cheekCapTriangles += 1;
    if (Math.abs(n.x) > 0.90 && area > 0.020 && area < 0.040
      && Math.abs(centroid.x) > 1.20 && Math.abs(centroid.x) < 1.27
      && centroid.y > 0.18 && centroid.y < 0.52
      && centroid.z > -0.70 && centroid.z < 0.78) flankCapTriangles += 1;
  }
  assert.ok(cheekCapTriangles >= 32,
    `all sixteen cheek cassette lids remain discrete (${cheekCapTriangles} face triangles)`);
  assert.ok(flankCapTriangles >= 16,
    `all eight flank cassette lids remain discrete (${flankCapTriangles} face triangles)`);

  turret.geometry.computeBoundingBox();
  const structuralBounds = turret.geometry.boundingBox;
  assert.ok(structuralBounds.max.x <= receipt.structuralHalfWidthM + 0.01
    && structuralBounds.min.x >= -receipt.structuralHalfWidthM - 0.01,
  'new turret armor remains inside the calibrated structural width');
  assert.ok(structuralBounds.min.z <= receipt.structuralRearLocalZ + 0.01,
    'closed bustle reaches the accepted rear structural station');

  for (const yaw of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    turretRig.rotation.y = yaw;
    tank.root.updateMatrixWorld(true);
    assert.equal(gunRig.parent, turretRig, `gun remains turret-owned through yaw ${yaw}`);
    assert.equal(turret.parent, turretRig, `structural bustle remains turret-owned through yaw ${yaw}`);
  }
} finally {
  tank.dispose();
}

console.log('t84OplotTurret.selftest: backed Duplet cheeks and sealed attached bustle verified');
