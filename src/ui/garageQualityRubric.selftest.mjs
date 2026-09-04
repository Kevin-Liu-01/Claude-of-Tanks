import assert from 'node:assert/strict';
import { scoreGarageQuality } from './garageQualityRubric.ts';

const passing = {
  id: 'test',
  isVerdant: false,
  transitionMaxGapMs: 16.7,
  architecture: {
    unsupportedParts: 0,
    maxGroundContactErrorM: 0.02,
    placementOverlaps: 0,
    structuralConnections: 68,
    servicePurposeTags: [
      'lift', 'pit', 'repair', 'parts', 'logistics', 'inspection', 'fabrication', 'storage',
    ],
    heavyLiftSystems: 2,
    operationalMachines: 3,
    factoryProcessZones: 1,
    elevatedAccessSystems: 2,
    secureStorageSystems: 1,
    environmentSpecificAssemblies: 2,
    facilityStations: 2,
    openingSightlineIntrusions: 0,
    distinctiveElements: Array.from({ length: 10 }, (_, index) => `layer-${index}`),
    structures: 8,
    structurePerimeterSectors: 5,
    collisionAuditedStructures: 8,
    collisionFootprints: 32,
    collisionEnvelopeFill: 0.62,
    openCollisionMaxFill: 0.40,
    sourceBeat: 'authored-source-beat',
    serviceFrame: 'connected service frame',
    terrainProfile: 'battlefield-derived terrain excerpt',
    signature: 'distinct-signature',
    treeSpecies: ['oak', 'birch'],
    treeTrunkMinRadialSegments: 10,
    treeTrunksRooted: true,
    landmarkHeightM: 9,
    facilityMaterialClasses: 4,
    connectedExteriorParts: 140,
    textureSets: ['a', 'b', 'c', 'd', 'e', 'f'],
    drawCalls: 22,
    triangles: 42_000,
    lastBuildMs: 24,
  },
  workshop: {
    exhibitCount: 4,
    workshopOrbitCoverageDegrees: 360,
    modelMode: 'actual-fleet',
  },
};

const pass = scoreGarageQuality(passing);
assert.equal(pass.total, 100);
assert.deepEqual(pass.failures, []);

const floating = scoreGarageQuality({
  ...passing,
  architecture: { ...passing.architecture, unsupportedParts: 1 },
});
assert.equal(floating.total, 93,
  'one floating component must consume the complete support criterion');
assert.ok(floating.failures.includes('unsupported structure part'));

const proxy = scoreGarageQuality({
  ...passing,
  workshop: { ...passing.workshop, modelMode: 'proxy' },
});
assert.equal(proxy.total, 98);
assert.ok(proxy.failures.includes('proxy tank or proxy component path is active'));

console.log('garageQualityRubric.selftest: ok');
