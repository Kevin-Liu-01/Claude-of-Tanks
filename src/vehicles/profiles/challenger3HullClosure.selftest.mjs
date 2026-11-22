import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

// Kevin's surface markup (2026-11-22, faces 215/220/200): the lower-cheek wedges ahead of the turret face
// (turret-local x .40..1.40, z 1.22..1.70) stay on the prototype and are gone from the production Challenger 3,
// along with the cheek ERA courses laid into them. The throat under the gun (|x| <= .78) remains on both.
const lowerCheekWedgeVertices = (built) => {
  const turretRig = built.root.getObjectByName('rig_turret');
  const vertices = [];
  for (const name of ['turret', 'turretExternalArmor']) {
    const position = turretRig?.getObjectByName(name)?.geometry?.attributes?.position;
    for (let i = 0; position && i < position.count; i++) {
      if (Math.abs(position.getX(i)) > 0.80 && position.getZ(i) > 1.25 && position.getY(i) < 0.60) vertices.push(i);
    }
  }
  return vertices.length;
};

const tank = createTank('challenger3_proto', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
  const hullRig = tank.root.getObjectByName('rig_hull');
  const turretRig = tank.root.getObjectByName('rig_turret');
  const hull = tank.root.getObjectByName('hull');
  const hullDetail = tank.root.getObjectByName('hullDetail');
  assert.ok(hullRig && hull?.isMesh && hullDetail?.isMesh,
    'Challenger 3 keeps structural hull and fittings under rig_hull');
  assert.deepEqual(hullRig.scale.toArray(), [1.1, 1.1, 1.1],
    'Challenger 3 hull is uniformly ten percent larger');
  assert.deepEqual(turretRig?.scale.toArray(), [1.1, 1.1, 1.1],
    'Challenger 3 turret and articulated equipment share the ten percent enlargement');
  assert.deepEqual(hullRig.userData.challenger3FamilyScaleReceipt, {
    uniformScale: 1.1,
    turretPivotScaled: true,
    trackContactMetadataScaled: true,
    trackHitGeometryScaled: true,
  }, 'enlargement keeps external movement and damage metadata in the rendered frame');

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

  assert.ok(tank.root.getObjectByName('hullShadow') === undefined,
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
  assert.ok(lowerCheekWedgeVertices(tank) > 0, 'the Challenger 3 prototype keeps its lower-cheek wedges');
} finally {
  tank.dispose();
}

const challenger3X = createTank('challenger3', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
  const hullRig = challenger3X.root.getObjectByName('rig_hull');
  const turretRig = challenger3X.root.getObjectByName('rig_turret');
  const receipt = hullRig?.userData.challenger3XReceipt;

  assert.ok(receipt && receipt === turretRig?.userData.challenger3XReceipt,
    'Challenger 3 X package receipt is shared by both articulation owners');
  assert.deepEqual({
    enhancedSkirtPanels: receipt.enhancedSkirtPanels,
    skirtHangers: receipt.skirtHangers,
    glacisEraCassettes: receipt.glacisEraCassettes,
    skirtEraCassettes: receipt.skirtEraCassettes,
    turretSideEraCassettes: receipt.turretSideEraCassettes,
    totalEraCassettes: receipt.totalEraCassettes,
    autocannonStations: receipt.autocannonStations,
    radarArrays: receipt.radarArrays,
    searchlights: receipt.searchlights,
    bustleCageRails: receipt.bustleCageRails,
    stowageItems: receipt.stowageItems,
    equipmentSeatsFlush: receipt.equipmentSeatsFlush,
  }, {
    enhancedSkirtPanels: 18,
    skirtHangers: 18,
    glacisEraCassettes: 40,
    // (release 240: the profile skirt keeps the 28 cassettes a side that lie on it, clear of its raked ends: 78 -> 56)
    skirtEraCassettes: 56,
    // (275: the cheek courses went with the lower-cheek wedges they sat in, Kevin's surface markup: 176 -> 144)
    turretSideEraCassettes: 48,
    totalEraCassettes: 144,
    autocannonStations: 0,
    radarArrays: 1,
    searchlights: 1,
    bustleCageRails: 16,
    stowageItems: 7,
    equipmentSeatsFlush: true,
  }, 'Challenger 3 X retains its complete armor and equipment package');

  assert.deepEqual(challenger3X.root.userData.eraClusterNames, [
    'c3x_glacis_era_L',
    'c3x_glacis_era_R',
    'c3x_skirt_era_L',
    'c3x_skirt_era_R',
    'c3x_turret_side_era_L',
    'c3x_turret_side_era_R',
  ], 'every visible Challenger 3 X ERA field is registered for one-shot depletion');
  assert.equal(lowerCheekWedgeVertices(challenger3X), 0,
    'the production Challenger 3 has no lower-cheek wedges or cheek ERA ahead of its turret face');
  assert.equal(challenger3X.root.userData.eraFinishReceipt?.bodyAndCoverUseVehiclePaint, true,
    'ERA faces and covers inherit the vehicle camouflage instead of a generic slab color');
  assert.equal(challenger3X.root.userData.eraFinishReceipt?.semanticBucket, 'externalArmor',
    'ERA remains selectable and damageable as external armor');
} finally {
  challenger3X.dispose();
}

console.log('challenger3HullClosure.selftest: scale, hull closure, and Challenger 3 X package verified');
