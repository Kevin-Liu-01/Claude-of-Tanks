import assert from 'node:assert/strict';
import { Ray, Vector3 } from 'three';
import { createTank } from '../tankFactory.ts';
import { VEHICLE_SIZE_FACTORS } from '../vehicleSizePolicy.ts';
import { shellPart } from '../../../tools/base-shell-audit-math.mjs';

// The 0.10/1.62 envelope and all chevron dimensions below describe the
// original authoring frame (f90de613b). The owner-directed 5% enlargement
// added by 245aa4e4e is baked into vertices, not an Object3D scale.
function authoredEnvelope(geometry, factor) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox.clone();
  bounds.min.divideScalar(factor); bounds.max.divideScalar(factor);
  assert.ok(bounds.min.y >= 0.10,
    `t90ms: turret armor stays above the ring instead of hanging below it (${bounds.min.y})`);
  assert.ok(bounds.max.z <= 1.62,
    `t90ms: nose cassettes remain seated on the welded arrowhead (${bounds.max.z})`);
  return bounds;
}

const emitted = [];

const tank = createTank('t90ms', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
  partCensus(bucket, geometry, source) {
    if (source !== 'add') return;
    const fitted = String(geometry.userData.nativeArmorSkinRole).startsWith('t90ms-welded-');
    const carrier = bucket === 'turret' && geometry.getAttribute('position').count === 312
      && new Error().stack.includes('rebuildT90MSTurretExact (');
    if (fitted || carrier) emitted.push({ geometry, carrier,
      authoredPositions: Float32Array.from(geometry.getAttribute('position').array) });
  },
});

try {
  const factor = VEHICLE_SIZE_FACTORS.t90ms;
  assert.equal(factor, 1.05, 't90ms: retains the owner-directed whole-vehicle enlargement');
  assert.deepEqual(tank.root.getObjectByName('rig_hull')?.userData.vehicleSize,
    { factor, baked: true }, 't90ms: installed frame explicitly records the baked scale');
  // Observe source stock before the bake and compare every installed vertex.
  // A stale, missing, doubled or nonuniform bake cannot be hidden by dividing
  // arbitrary final bounds by a convenient value.
  for (const { geometry, authoredPositions } of emitted) {
    const installed = geometry.getAttribute('position').array;
    assert.equal(installed.length, authoredPositions.length);
    for (let i = 0; i < installed.length; i++) assert.ok(
      Math.abs(installed[i] - Math.fround(authoredPositions[i] * factor)) < 0.0000003,
      't90ms: measured stock follows exactly the declared uniform scale');
  }
  const receipt = tank.root.userData.eraFinishReceipt;
  assert.ok(receipt, 't90ms: publishes its layered armor receipt');
  assert.equal(receipt.semanticBucket, 'externalArmor',
    't90ms: fitted chevrons retain external-armor semantics');
  assert.ok(receipt.visualSectors.includes('t90ms-relikt-turret-era'),
    't90ms: fitted chevrons remain registered as visible ERA');
  assert.equal(receipt.partsBySector['t90ms-relikt-turret-era'], 8,
    't90ms: keeps two rows of two main-chevron modules on both cheeks');
  assert.equal(receipt.partsBySector['t90ms-relikt-nose-era'], 49,
    't90ms: mounts twenty-four framed ERA modules inside the same chevron footprint');
  assert.equal(receipt.partsBySector['t90ms-relikt-flank-era'], 54,
    't90ms: retains the exact cheek, shoulder and flank cassette course');

  const turretArmor = tank.root.getObjectByName('turretExternalArmor');
  assert.ok(turretArmor?.isMesh, 't90ms: merges turret armor into one draw bucket');
  const bounds = authoredEnvelope(turretArmor.geometry, factor);
  const protruding = turretArmor.geometry.clone().translate(0, 0, (1.621 - bounds.max.z) * factor);
  const sagging = turretArmor.geometry.clone().translate(0, (0.099 - bounds.min.y) * factor, 0);
  try {
    assert.throws(() => authoredEnvelope(protruding, factor), /nose cassettes/,
      'a native nose displaced beyond the unchanged 1.62 m authoring limit is rejected');
    assert.throws(() => authoredEnvelope(sagging, factor), /above the ring/,
      'native armor displaced below the unchanged 0.10 m authoring limit is rejected');
  } finally { protruding.dispose(); sagging.dispose(); }

  const mainChevrons = tank.root.userData.combatGeometryParts.map(part => ({ ...part,
    min: part.min.map(value => value / factor), max: part.max.map(value => value / factor),
  })).filter((part) => {
    if (part.bucket !== 'turretExternalArmor') return false;
    const spanX = part.max[0] - part.min[0];
    const spanY = part.max[1] - part.min[1];
    const spanZ = part.max[2] - part.min[2];
    return spanX >= 0.65 && spanY <= 0.30 && spanZ >= 0.60 && part.max[2] >= 1.0;
  });
  assert.equal(mainChevrons.length, 8,
    't90ms: exposes upper and lower ERA rows on both diagonal cheeks');
  for (const side of [-1, 1]) {
    const cheek = mainChevrons
      .filter((part) => Math.sign((part.min[0] + part.max[0]) * 0.5) === side)
      .sort((a, b) => Math.abs((a.min[0] + a.max[0]) * 0.5)
        - Math.abs((b.min[0] + b.max[0]) * 0.5));
    assert.equal(cheek.length, 4, `t90ms: side ${side} has two modules in both ERA rows`);
    const inner = cheek.slice(0, 2).sort((a, b) => a.min[1] - b.min[1]);
    const outer = cheek.slice(2, 4).sort((a, b) => a.min[1] - b.min[1]);
    assert.ok(inner[0].max[1] <= inner[1].min[1] + 0.015,
      `t90ms: side ${side} inner lower and upper rows meet at one ridge`);
    assert.ok(outer[0].max[1] <= outer[1].min[1] + 0.015,
      `t90ms: side ${side} outer lower and upper rows meet at one ridge`);
    const innerZ = (inner[0].min[2] + inner[0].max[2]) * 0.5;
    const outerZ = (outer[0].min[2] + outer[0].max[2]) * 0.5;
    assert.ok(outerZ < innerZ - 0.40,
      `t90ms: side ${side} ERA follows the rearward-sloping / or \\ cheek`);
  }

  const turretRig = tank.root.getObjectByName('rig_turret');
  const layout = turretRig?.userData.t90MSCheekEraReceipt;
  assert.deepEqual(layout, {
    rowsPerCheek: 2,
    modulesPerRow: 2,
    modulesTotal: 8,
    tilesPerCarrierSurface: 3,
    squareTilesTotal: 24,
    ridgeY: 0.34,
    ridgeZOffset: 0.09,
    rearEdgeZOffset: -0.10,
  }, 't90ms: the two ERA rows join forward into the side-view chevron ridge');

  const flankSeat = turretRig?.userData.t90MSFlankEraSeatReceipt;
  assert.deepEqual(flankSeat, {
    revision: 'emitted-welded-facets-r2',
    projectedParts: 54,
    flankCarriers: 3,
    lowerCassettes: 8,
    shoulderCassettes: 8,
    roofPlates: 5,
    maxBackGapM: 0.004,
  }, 't90ms: every non-frontal turret ERA part is projected onto its carrier facet');

  // Check actual back faces against the actual emitted carrier independently
  // of its receipt. Both are returned to the historical authoring frame.
  const carriers = emitted.filter(part => part.carrier);
  const plates = emitted.filter(part => !part.carrier);
  assert.equal(carriers.length, 1, 't90ms: one complete welded carrier is present');
  assert.equal(plates.length, 54, 't90ms: every fitted flank/shoulder/roof solid is tested');
  const carrierGeometry = carriers[0].geometry.clone().scale(1 / factor, 1 / factor, 1 / factor);
  try {
    const carrier = shellPart(carrierGeometry);
    let backFaces = 0;
    for (const { geometry } of plates) {
      const local = geometry.clone().scale(1 / factor, 1 / factor, 1 / factor);
      try {
        const plate = shellPart(local), roof = geometry.userData.nativeArmorSkinRole.endsWith('roof');
        const outward = new Vector3(roof ? 0 : Math.sign(plate.bounds.min.x + plate.bounds.max.x), roof ? 1 : 0, 0);
        const assertSeat = point => {
          const ray = new Ray(point.clone().addScaledVector(outward, 4), outward.clone().negate());
          let distance = Infinity;
          for (const face of carrier.triangles) {
            const hit = ray.intersectTriangle(face.triangle.a, face.triangle.b, face.triangle.c, false, new Vector3());
            if (hit) distance = Math.min(distance, hit.distanceTo(ray.origin));
          }
          const gap = distance - 4;
          // Baked Float32 positions are divided back into the authoring
          // frame; allow 0.3 micrometres of representation error at the seat.
          assert.ok(gap >= 0.0009 - 0.0000003 && gap <= 0.004 + 0.0000003,
            `t90ms: actual fitted back face has a finite carrier seat (${gap})`);
        };
        let count = 0;
        for (const face of plate.triangles) if (face.triangle.getNormal(new Vector3()).dot(outward) < -0.05) {
          const point = face.triangle.getMidpoint(new Vector3());
          assertSeat(point); count++; backFaces++;
          assert.throws(() => assertSeat(point.clone().addScaledVector(outward, 0.05)), /finite carrier seat/,
            'a fitted back face displaced 50 mm off its real carrier is rejected');
        }
        assert.ok(count >= 2, 't90ms: each complete fitted solid has actual back faces');
      } finally { local.dispose(); }
    }
    assert.ok(backFaces > 108, 't90ms: includes subdivided faces at the welded carrier ridges');
  } finally { carrierGeometry.dispose(); }

  const towerReceipt = turretRig?.userData.t90msTagilWeaponTowerReceipt;
  assert.deepEqual(towerReceipt, {
    revision: 'aligned-detailed-equipment-r1',
    owner: 'rig_turret',
    firingAxis: '+Z',
    stationYaw: 0,
    foundationTopY: 0.98,
    supportInterfaceCenter: [-0.64, 0.98, -1.195],
    supportInterfaceSize: [0.32, 0, 0.33],
    optics: 2,
    workLights: 1,
    ammoBoxes: 1,
    feedLinks: 7,
    armorHitboxExpanded: false,
  }, 't90ms: Tagil tower is forward-facing, detailed, and aligned to the marked roof plate');
} finally {
  tank.dispose();
}

console.log('t90MSTurretArmorSeat.selftest: declared 1.05 bake, unchanged authoring-frame limits, chevrons and 54 actual carrier seats pass');
