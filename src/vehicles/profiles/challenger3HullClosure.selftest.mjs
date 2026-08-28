import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const tank = createTank('challenger_3', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
  const hullRig = tank.root.getObjectByName('rig_hull');
  const hull = tank.root.getObjectByName('hull');
  const hullDetail = tank.root.getObjectByName('hullDetail');
  assert.ok(hullRig && hull?.isMesh && hullDetail?.isMesh,
    'Challenger 3 keeps structural hull and fittings under rig_hull');

  const receipt = hullRig.userData.challenger3HullClosureReceipt;
  assert.deepEqual(receipt?.upperGlacisSeam, {
    innerX: 1.60,
    outerX: 1.70,
    frontZ: 3.60,
    rearZ: 2.30,
    mirrors: 2,
  }, 'both upper-glacis wing seams are structurally closed');
  assert.equal(receipt?.skirtCarriers?.length, 3,
    'each visible skirt bay has a hull-owned carrier plate');
  assert.equal(receipt?.hangerStations?.length, 8,
    'discrete hangers tie the skirt carriers into the sponson wall');
  assert.equal(receipt?.scallopNeckStations?.length, 3,
    'each low scallop tab has a welded neck into the skirt assembly');
  assert.equal(receipt?.visibleSkirtFacesMoved, false,
    'the exterior skirt faces remain at their reviewed positions');
  assert.equal(receipt?.longShadowProxyRemoved, true,
    'the former unselectable track-side line is recorded as removed');

  assert.equal(tank.root.getObjectByName('hullShadow'), undefined,
    'no full-length render-only shadow beam may remain beside the tracks');

  const collect = (mesh) => {
    const positions = mesh.geometry.attributes.position;
    const vertices = [];
    for (let index = 0; index < positions.count; index += 1) {
      vertices.push([
        positions.getX(index),
        positions.getY(index),
        positions.getZ(index),
      ]);
    }
    return vertices;
  };
  const hullVertices = collect(hull);
  const detailVertices = collect(hullDetail);

  for (const side of [-1, 1]) {
    assert.ok(hullVertices.some(([x, y, z]) => side * x > 1.67
      && side * x < 1.71 && y > 1.48 && z > 2.28 && z < 2.36),
    `${side < 0 ? 'left' : 'right'} glacis seam reaches the deck knee`);
    assert.ok(hullVertices.some(([x, y, z]) => side * x > 1.68
      && side * x < 1.72 && y > 1.10 && y < 1.34 && z > -0.90 && z < 2.30),
    `${side < 0 ? 'left' : 'right'} skirt carriers overlap the visible bays`);
    assert.ok(hullVertices.some(([x, y, z]) => side * x > 1.63
      && side * x < 1.71 && y > 0.94 && y < 1.20 && z > 2.00 && z < 2.20),
    `${side < 0 ? 'left' : 'right'} forward scallop neck bridges its vertical gap`);
    assert.ok(detailVertices.some(([x, y, z]) => side * x > 1.55
      && side * x < 1.70 && y > 1.28 && y < 1.50 && z > -0.75 && z < 2.80),
    `${side < 0 ? 'left' : 'right'} skirt hangers remain discrete and hull-attached`);
  }
} finally {
  tank.dispose();
}

console.log('challenger3HullClosure.selftest: glacis seams, skirt carriers, and proxy cleanup verified');
