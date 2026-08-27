import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const marks = Object.freeze({
  merkava1b: 16,
  merkava2b: 20,
  merkava2d: 30,
  merkava3c: 36,
  merkava3d: 36,
  merkava4b: 20,
});

const movedVertices = (position) => {
  let count = 0;
  for (let index = 0; index < position.count; index++) {
    if (position.getY(index) < -999) count++;
  }
  return count;
};

for (const [id, expectedTiles] of Object.entries(marks)) {
  const visual = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  visual.root.updateMatrixWorld(true);
  const turret = visual.root.getObjectByName('rig_turret');
  assert.ok(turret, `${id} retains the canonical turret rig`);

  const receipt = turret.userData.merkavaEraFinishReceipt;
  assert.ok(receipt, `${id} publishes its ERA finish receipt`);
  assert.equal(receipt.revision, 'layered-vehicle-scale-camo-r1');
  assert.equal(receipt.baseTiles, expectedTiles, `${id} preserves every ERA charge body`);
  assert.equal(receipt.coverTiles, expectedTiles, `${id} covers every ERA charge body`);
  assert.equal(receipt.cassetteLayers, 2, `${id} ERA uses two physical layers`);
  assert.equal(receipt.totalAuthoredParts, expectedTiles * 2);
  assert.equal(receipt.camoProjection, 'vehicle-scale-box-uv');
  assert.equal(receipt.destructibleConstruction, 'authored-layered-cluster');
  assert.equal(receipt.staticMergedProtection, true);
  assert.equal(receipt.externalArmorDrawBuckets, 1);
  assert.equal(receipt.perFrameWorkAdded, false);
  assert.equal(receipt.sectors.length, 2, `${id} retains independent left/right sectors`);

  const obsoleteInstancedEra = [];
  const externalArmorMeshes = [];
  turret.traverse((object) => {
    const dimensions = object.geometry?.parameters;
    if (object.isInstancedMesh
        && object.geometry?.type === 'BoxGeometry'
        && Math.abs((dimensions?.width ?? 0) - 0.28) < 1e-6
        && Math.abs((dimensions?.height ?? 0) - 0.13) < 1e-6
        && Math.abs((dimensions?.depth ?? 0) - 0.07) < 1e-6) {
      obsoleteInstancedEra.push(object);
    }
    if (object.isMesh && object.name === 'turretExternalArmor') externalArmorMeshes.push(object);
  });
  assert.equal(obsoleteInstancedEra.length, 0,
    `${id} has no miniature repeated 0..1 ERA texture instance`);
  assert.equal(externalArmorMeshes.length, 1,
    `${id} merges all ERA into one existing external-armor draw bucket`);
  const externalArmor = externalArmorMeshes[0];
  assert.equal(externalArmor.userData.combatHitboxRole, 'externalArmor');

  const uv = externalArmor.geometry.getAttribute('uv');
  assert.ok(uv, `${id} external armor receives merged vehicle-space UVs`);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let index = 0; index < uv.count; index++) {
    minU = Math.min(minU, uv.getX(index));
    maxU = Math.max(maxU, uv.getX(index));
    minV = Math.min(minV, uv.getY(index));
    maxV = Math.max(maxV, uv.getY(index));
  }
  assert.ok(minU < 0 || minV < 0 || maxU > 1 || maxV > 1,
    `${id} ERA UVs are not confined to one tiny repeated tile island`);
  assert.ok(Math.max(maxU - minU, maxV - minV) > 0.70,
    `${id} ERA UVs span the full bilateral armor field`);

  const externalParts = visual.root.userData.combatGeometryParts
    .filter((part) => part.bucket === 'turretExternalArmor');
  assert.equal(externalParts.length, expectedTiles * 2,
    `${id} geometry receipt contains one base and cover per cassette`);
  assert.ok(externalArmor.geometry.getAttribute('position').count <= expectedTiles * 72,
    `${id} layered ERA remains inside a crisp-box static vertex budget`);

  const position = externalArmor.geometry.getAttribute('position');
  const beforeStrip = position.array.slice();
  assert.equal(visual.stripEra(receipt.sectors[0]), true,
    `${id} left/right ERA sector remains destructible`);
  assert.equal(movedVertices(position), expectedTiles / 2 * 2 * 36,
    `${id} one hit removes both layers on exactly one side`);
  visual.resetEra();
  assert.deepEqual(position.array, beforeStrip,
    `${id} round reset restores the two-layer ERA field exactly`);

  if (id === 'merkava3c' || id === 'merkava3d') {
    const rails = turret.userData[`${id}TurretRailSeatReceipt`];
    assert.ok(rails, `${id} publishes its turret-side rail seats`);
    assert.equal(rails.revision, 'outer-carrier-conformal-r1');
    assert.equal(rails.maximumSurfaceGapM, 0);
    assert.equal(rails.structuralOverlapM, 0.006);
    assert.equal(rails.seats.length, 16, `${id} seats eight rail pieces on each side`);
    assert.deepEqual(new Set(rails.seats.map((seat) => seat.side)), new Set([-1, 1]));
    for (const seat of rails.seats) {
      const center = new THREE.Vector3(...seat.centerLocal);
      const surface = new THREE.Vector3(...seat.surfaceLocal);
      const normal = new THREE.Vector3(...seat.normalLocal);
      const expectedProud = seat.kind === 'longitudinal-rail' ? 0.005 : 0.004;
      assert.ok(Math.abs(normal.length() - 1) < 1e-6, `${id} rail normal is normalized`);
      assert.ok(normal.x * seat.side > 0.25, `${id} rail normal faces outward`);
      assert.ok(Math.abs(center.clone().sub(surface).dot(normal) - expectedProud) < 1e-6,
        `${id} ${seat.kind} overlaps its modular carrier instead of floating`);
    }
  }

  visual.dispose();
}

console.log('merkavaEraFinish.selftest: layered coherent ERA and Mk 3 rail seating passed');
