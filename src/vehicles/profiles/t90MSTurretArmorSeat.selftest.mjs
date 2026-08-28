import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const tank = createTank('t90ms', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
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
  turretArmor.geometry.computeBoundingBox();
  const bounds = turretArmor.geometry.boundingBox;
  assert.ok(bounds.min.y >= 0.10,
    `t90ms: turret armor stays above the ring instead of hanging below it (${bounds.min.y})`);
  assert.ok(bounds.max.z <= 1.62,
    `t90ms: nose cassettes remain seated on the welded arrowhead (${bounds.max.z})`);

  const mainChevrons = tank.root.userData.combatGeometryParts.filter((part) => {
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
    revision: 'outer-skin-projected-r1',
    projectedParts: 54,
    flankCarriers: 3,
    lowerCassettes: 8,
    shoulderCassettes: 8,
    roofPlates: 5,
    maxBackGapM: 0.004,
  }, 't90ms: every non-frontal turret ERA part is projected onto its carrier facet');
} finally {
  tank.dispose();
}

console.log('t90MSTurretArmorSeat.selftest: dense cheek modules and 54 projected turret ERA parts pass');
