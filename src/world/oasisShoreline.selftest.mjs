import assert from 'node:assert/strict';
import { createHeightField } from './terrain.ts';
import { buildLiquidLakeBanks } from './liquidMarshSurface.ts';
import { SHORELINE_SEGMENTS, shorelineRadiusAt, shorelineDistance, sampleShorelineMask } from './shoreline.ts';
import oasis from './maps/oasis.ts';

// Exact published three-cell input before the authored single-basin change.
const originalLakes = [
  { x: -138, z: -16, r: 52, depth: 0.75, level: -1.2 },
  { x: -182, z: 32, r: 57, depth: 0.75, level: -1.2 },
  { x: -134, z: 84, r: 48, depth: 0.65, level: -1.2 },
];
const original = { ...oasis, terrain: { ...oasis.terrain, lakes: originalLakes } };
const lake = oasis.terrain.lakes[0];

function samplePoint(angle, band) {
  const radius = shorelineRadiusAt(lake, angle) * band;
  return { x: lake.x + Math.cos(angle) * radius, z: lake.z + Math.sin(angle) * radius };
}

function inspectContour() {
  assert.equal(oasis.terrain.lakes.length, 1, 'one continuous basin, no joined disc lobes');
  assert.equal(lake.level, -1.2);
  assert.equal(lake.radii.length, 16);
  assert.ok(lake.radii.every(r => r >= 0.4 && r <= 1));
  const points = Array.from({ length: SHORELINE_SEGMENTS }, (_, i) => samplePoint(i * Math.PI / 32, 1));
  for (const { x, z } of points) assert.ok(Math.abs(shorelineDistance(lake, x, z) - 1) < 1e-12);
  const bounds = { minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)),
    minZ: Math.min(...points.map(p => p.z)), maxZ: Math.max(...points.map(p => p.z)) };
  assert.ok(bounds.minX >= -240 && bounds.maxX <= -90 && bounds.minZ >= -70 && bounds.maxZ <= 135,
    'retain the spring corridor, not a new lake across the town or dune routes');
  assert.ok(bounds.maxZ - bounds.minZ > 185 && bounds.maxX - bounds.minX > 125);
  assert.ok(lake.radii[0] < lake.radii[2] * 0.65 && lake.radii[0] < lake.radii[14] * 0.7,
    'one dry town-facing indentation between the tapering arms');
  assert.notEqual(lake.radii[2], lake.radii[14], 'arms are not mirror-image circles');
  return bounds;
}

function inspectCoverage() {
  let previousArea = 0, area = 0, sharedArea = 0;
  for (let x = -250; x <= -70; x += 2) for (let z = -80; z <= 145; z += 2) {
    const before = sampleShorelineMask([], originalLakes, x, z) > 0.5;
    const after = sampleShorelineMask([], [lake], x, z) > 0.5;
    if (before) previousArea += 4;
    if (after) area += 4;
    if (before && after) sharedArea += 4;
  }
  assert.ok(area >= previousArea * 0.85 && area <= previousArea * 1.15, 'preserve meaningful water coverage');
  assert.ok(sharedArea / previousArea > 0.8, `the existing oasis remains in place: ${JSON.stringify({ previousArea, area, sharedArea })}`);
  // Every radial interior stays wet and connected to the same core; unlike a
  // visual-only union, this is the canonical movement/minimap mask itself.
  for (let i = 0; i < 64; i++) for (let band = 0; band <= 0.79; band += 0.079) {
    const { x, z } = samplePoint(i * Math.PI / 32, band);
    assert.equal(sampleShorelineMask([], [lake], x, z), 1);
  }
  return { previousArea, area, sharedArea };
}

function inspectSupportPoint(field, before, x, z, receipt, pad) {
  assert.equal(field.getWaterMaskAt(x, z), 0, 'route/deployment surface remains dry');
  const delta = Math.abs(field.getHeightAt(x, z) - before.getHeightAt(x, z));
  receipt.maxHeightDelta = Math.max(receipt.maxHeightDelta, delta);
  assert.ok(delta < 1e-10, `unchanged route/pad support elevations at ${x},${z}: delta=${delta}`);
  const normal = field.getNormalAt(x, z).y;
  const key = pad ? 'minimumPadNormal' : 'minimumRoadNormal';
  receipt[key] = Math.min(receipt[key], normal);
  assert.ok(normal >= (pad ? 0.94 : 0.90), 'usable unchanged support');
}

function inspectRoutes(field, before) {
  const receipt = { maxHeightDelta: 0, minimumRoadNormal: 1, minimumPadNormal: 1 };
  assert.deepEqual(field._layout.roads, before._layout.roads);
  for (const road of field._layout.roads) for (const [x, z] of road) {
    inspectSupportPoint(field, before, x, z, receipt, false);
  }
  for (const pad of [oasis.spawns.player, ...oasis.spawns.enemies]) {
    for (let x = -8; x <= 8; x += 2) for (let z = -8; z <= 8; z += 2) {
      inspectSupportPoint(field, before, pad.x + x, pad.z + z, receipt, true);
    }
  }
  return receipt;
}

function gradeAt(field, x, z) {
  return Math.hypot((field.getHeightAt(x + 0.25, z) - field.getHeightAt(x - 0.25, z)) * 2,
    (field.getHeightAt(x, z + 0.25) - field.getHeightAt(x, z - 0.25)) * 2);
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function expectedWater(field, x, z) {
  const raw = sampleShorelineMask([], [lake], x, z);
  const dryRoad = smoothstep(14, 18, field._roadDist(x, z));
  const pads = [oasis.spawns.player, ...oasis.spawns.enemies];
  const dryPads = pads.reduce((weight, p) => weight * smoothstep(22, 26, Math.hypot(x - p.x, z - p.z)), 1);
  return smoothstep(...oasis.splat.seaRamp, raw * dryRoad * dryPads);
}

function inspectBankPoint(field, angle, band, receipt) {
  const { x, z } = samplePoint(angle, band);
  const mask = field.getWaterMaskAt(x, z), height = field.getHeightAt(x, z);
  assert.equal(mask, expectedWater(field, x, z), 'same contour with the authored liquid ramp and dry-route protection');
  assert.ok(Number.isFinite(height));
  if (mask > 0.98) {
    assert.ok(Math.abs(height - lake.level) < 1e-10, 'one level, seamless water sheet');
    assert.ok(gradeAt(field, x, z) <= 0.01001, 'water never climbs its basin');
    assert.equal(field._noVeg(x, z), true);
    receipt.coreSamples++;
  }
  if (band >= 0.94 && field._roadDist(x, z) >= 20) {
    const grade = gradeAt(field, x, z);
    if (grade > receipt.maximumBankGrade) { receipt.maximumBankGrade = grade; receipt.worst = { x, z, band }; }
    receipt.bankSamples++;
  }
}

function inspectBanks(field) {
  const receipt = { coreSamples: 0, bankSamples: 0, maximumBankGrade: 0, worst: null };
  for (let i = 0; i < 64; i++) for (const band of [0.3, 0.6, 0.79, 0.94, 1.04, 1.15, 1.3, 1.5, 1.8]) {
    inspectBankPoint(field, i * Math.PI / 32, band, receipt);
  }
  assert.ok(receipt.coreSamples >= 190 && receipt.bankSamples >= 250);
  assert.ok(receipt.maximumBankGrade < 0.75, `safe navigable banks: ${JSON.stringify(receipt)}`);
  return receipt;
}

const bounds = inspectContour(), coverage = inspectCoverage();
for (const seed of [1337, 2049, 7719]) {
  const field = createHeightField(seed, oasis), before = createHeightField(seed, original);
  const routes = inspectRoutes(field, before), banks = inspectBanks(field);
  const bankData = buildLiquidLakeBanks([lake], (x, z) => before.getHeightAt(x, z));
  assert.equal(bankData.byteLength, Float64Array.BYTES_PER_ELEMENT, 'one bank record instead of three');
  console.log('Oasis shoreline', JSON.stringify({ seed, bounds, coverage, routes, banks, bankBytes: bankData.byteLength }));
}
console.log('oasisShoreline self-test: connected authored basin, matched support, shared wetness and bounded banks PASS');
