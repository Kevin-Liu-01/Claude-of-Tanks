import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

// Explicit policy list: every production-visible vehicle with authored ERA,
// reactive composite cassettes, or a first-party visual ERA package must opt
// into the same finish path. Updating this list is intentional review work,
// not a side effect of inheriting a donor hull or turret.
const ERA_VEHICLE_IDS = Object.freeze([
  't64bv1', 't72b_1987', 't72b3m', 't72bu', 'pt91m',
  't80bv', 't80u', 't84', 't90', 't90a', 't90a_vladimir',
  't90a_burlak', 't90sm', 't90ms', 't90m', 't90m_proryv',
  'type10b', 'ariete_c2', 'leo2a6m', 'leo2a7v', 'amx56',
  'type99a', 'ztz99a2_prototype', 'ztz99a2', 't14', 't72b3',
  'm1a2_tusk', 'm1a2_sepv2', 'm1a2_sepv3',
  'merkava1b', 'merkava2b', 'merkava2d', 'merkava3c',
  'merkava3d', 'merkava4b', 'amx30b2', 'm60a3',
  'ua_t64bv', 'ua_t80bv', 'ua_t80u_kursk', 'ua_t84_oplot_m',
  'leo2a6_ua', 't72m1_jaguar', 'pt91_twardy',
  'bmpt_terminator2', 'm3a3_bradley', 'bmpt_t90',
  'kf51b',
]);

const REQUIRED_T64_ERA_SECTORS = Object.freeze({
  t64bv1: Object.freeze([
    't64bv1-k1-hull-era',
    't64bv1-k1-turret-era',
  ]),
  ua_t64bv: Object.freeze([
    'ua-t64bv-k1-hull-glacis-era',
    'ukraine-k1-hull',
    'ukraine-layered-turret',
  ]),
});

const uvSpan = (mesh) => {
  const uv = mesh.geometry.getAttribute('uv');
  assert.ok(uv, `${mesh.name} has vehicle-space UV coordinates`);
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
  return Math.max(maxU - minU, maxV - minV);
};

for (const id of ERA_VEHICLE_IDS) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'low',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  const receipt = tank.root.userData.eraFinishReceipt;
  assert.ok(receipt, `${id} publishes the fleet ERA finish receipt`);
  assert.equal(receipt.revision, 'fleet-layered-vehicle-scale-camo-r1');
  assert.equal(receipt.camoProjection, 'vehicle-scale-box-uv');
  assert.equal(receipt.bodyAndCoverUseVehiclePaint, true);
  assert.equal(receipt.semanticBucket, 'externalArmor');
  assert.equal(receipt.staticMergedProtection, true);
  assert.equal(receipt.perFrameWork, false);
  assert.ok(receipt.authoredParts > 0, `${id} records authored ERA geometry`);
  assert.ok(receipt.sectors.length > 0, `${id} records at least one ERA sector`);
  for (const sector of REQUIRED_T64_ERA_SECTORS[id] || []) {
    assert.ok(receipt.visualSectors.includes(sector),
      `${id} routes ${sector} through the painted layered ERA finish`);
    assert.ok(receipt.partsBySector[sector] > 0,
      `${id} records painted geometry for ${sector}`);
  }
  assert.ok(receipt.maximumDrawBuckets <= 2,
    `${id} adds at most one static ERA bucket per articulation owner`);
  assert.deepEqual(receipt.owners, [...receipt.owners].sort(),
    `${id} ERA owners are deterministic`);

  for (const owner of receipt.owners) {
    const armorMesh = tank.root.getObjectByName(`${owner}ExternalArmor`);
    const bodyMesh = tank.root.getObjectByName(owner);
    assert.ok(armorMesh?.isMesh && !armorMesh.isInstancedMesh,
      `${id} ${owner} ERA is one ordinary merged mesh`);
    assert.ok(bodyMesh?.isMesh, `${id} retains its ${owner} paint mesh`);
    assert.equal(armorMesh.material, bodyMesh.material,
      `${id} ${owner} ERA shares the vehicle paint material`);
    assert.ok(armorMesh.material.map,
      `${id} ${owner} ERA receives the vehicle camouflage texture`);
    assert.ok(uvSpan(armorMesh) > 0.25,
      `${id} ${owner} ERA does not restart a miniature 0..1 texture per cassette`);
  }
  tank.dispose();
}

// These closely related donors intentionally carry passive applique or plain
// armor only. They guard against family inheritance turning ordinary boxes,
// sensors, or the early T-80 brow into false ERA.
for (const id of ['m1a1', 'm1a1ha', 'm1a2', 't80', 't80b']) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'low',
    geometryReceipt: true,
  });
  assert.equal(tank.root.userData.eraFinishReceipt, undefined,
    `${id} does not misclassify passive armor as ERA`);
  tank.dispose();
}

console.log(`fleetEraFinish.selftest: standardized ${ERA_VEHICLE_IDS.length} ERA vehicles`);
