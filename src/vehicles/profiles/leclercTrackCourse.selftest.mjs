import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const EPSILON = 1e-5;
const pose = (mesh, index) => {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  mesh.getMatrixAt(index, matrix);
  matrix.decompose(position, quaternion, scale);
  return { position, scale };
};

for (const id of ['leclerc', 'leclerc_xlr', 'amx56']) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  await Promise.resolve();

  try {
    const hull = tank.root.getObjectByName('rig_hull');
    const receipt = hull?.userData.runningGearReceipts?.[0];
    const pads = hull?.getObjectByName('gearTrackPads');
    const bands = [];
    hull?.traverse((object) => {
      if (/^gearTrackBand[LR]$/.test(object.name)) bands.push(object);
    });

    assert.ok(receipt && pads && bands.length === 2,
      `${id} exposes one measured shoe course and both casting bands`);
    assert.equal(receipt.shoeDetailMode, 'family-integrated',
      `${id} uses one centralized one-course tread mesh`);
    assert.equal(receipt.trackPatternId, 'nato-double-pin',
      `${id} resolves through the shared NATO double-pin family`);
    assert.equal(pads.userData.trackShoeDetailMode, receipt.shoeDetailMode,
      `${id} shoe geometry matches its course receipt`);

    const positions = pads.geometry.getAttribute('position');
    let detachedOuterRailVertices = 0;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      if (Math.abs(x) > receipt.trackW * 0.20 && y < -0.055) detachedOuterRailVertices++;
    }
    assert.equal(detachedOuterRailVertices, 0,
      `${id} omits the low outboard connector rails that read as a second track`);

    const count = receipt.shoeCountPerSide;
    const bandBySide = new Map(bands.map((band) => [band.userData.runningGearSide, band]));
    for (const [sideIndex, side] of [-1, 1].entries()) {
      const band = bandBySide.get(side);
      const expectedX = band.position.x + side * receipt.shoeOutboardOffset;
      for (let i = 0; i < count; i++) {
        const shoe = pose(pads, sideIndex * count + i);
        assert.ok(shoe.scale.lengthSq() > 0.1,
          `${id} side ${side} shoe ${i} remains present around the full loop`);
        assert.ok(Math.abs(shoe.position.x - expectedX) <= EPSILON,
          `${id} side ${side} shoe ${i} shares the casting-band lane`);
      }
    }
  } finally {
    tank.dispose();
  }
}

console.log('leclercTrackCourse.selftest: Leclerc family shoe detail is integrated and belt-aligned');
