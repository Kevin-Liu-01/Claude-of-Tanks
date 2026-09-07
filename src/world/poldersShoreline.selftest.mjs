import assert from 'node:assert/strict';
import { createHeightField } from './terrain.ts';
import { buildLiquidLakeBanks } from './liquidMarshSurface.ts';
import { minimumShorelineRadius, shorelineRadiusAt, shorelineDistance, SHORELINE_SEGMENTS } from './shoreline.ts';
import { createLakeChannel } from './maps/marshChannel.ts';
import polders from './maps/polders.ts';

// The actual previous compartments, not five discs masquerading as a baseline.
const originalLakes = [
  ...createLakeChannel([{ x: -218, z: -312, r: 22 }, { x: -168, z: -312, r: 22 }, { x: -168, z: -240, r: 22 }], 1.4),
  ...createLakeChannel([{ x: 80, z: -220, r: 26 }, { x: 80, z: -286, r: 26 }, { x: 164, z: -286, r: 26 }], -2.6),
  ...createLakeChannel([{ x: 136, z: -36, r: 24 }, { x: 136, z: 16, r: 24 }, { x: 204, z: 16, r: 24 }], -3.3),
  ...createLakeChannel([{ x: -196, z: 252, r: 23 }, { x: -154, z: 252, r: 23 }, { x: -154, z: 278, r: 23 }], 0),
  { x: 100, z: 282, r: 23, level: -5.4 }, { x: 74, z: 282, r: 23, level: -5.4 },
  { x: 126, z: 282, r: 23, level: -5.4 }, { x: 100, z: 308, r: 23, level: -5.4 },
];
const originalSpawns = { player: { x: -112, z: -390 }, enemies: [
  { x: -246, z: 390 }, { x: -170, z: 426 }, { x: -92, z: 378 }, { x: -10, z: 420 },
  { x: 76, z: 386 }, { x: 162, z: 422 }, { x: 248, z: 388 },
] };
const original = { ...polders, terrain: { ...polders.terrain, lakes: originalLakes }, spawns: originalSpawns };

function inspectContour(lake) {
  assert.equal(lake.radii.length, 16);
  assert.ok(lake.radii.every(radius => Number.isFinite(radius) && radius >= 0.4 && radius <= 1));
  assert.equal(minimumShorelineRadius(lake), Math.min(...lake.radii) * lake.r);
  const points = Array.from({ length: SHORELINE_SEGMENTS }, (_, i) => {
    const a = i * Math.PI * 2 / SHORELINE_SEGMENTS, r = shorelineRadiusAt(lake, a);
    const x = lake.x + Math.cos(a) * r, z = lake.z + Math.sin(a) * r;
    assert.ok(Math.abs(shorelineDistance(lake, x, z, 1.1) - 1) < 1e-12);
    return [x, z];
  });
  let area = 0, inward = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], c = points[(i + 2) % points.length];
    area += a[0] * b[1] - a[1] * b[0];
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) < 0) inward++;
  }
  assert.ok(inward >= 5, 'every basin has multiple coves, unlike a circle or ellipse');
  assert.ok(Math.abs(area) * 0.5 > 3000, 'retain meaningful basins, not tiny water dots');
  assert.ok(Math.max(...lake.radii.map((r, i) => Math.abs(r - lake.radii[(i + 8) & 15]))) > 0.15,
    'opposing shores are asymmetric, not centered oval profiles');
  assert.ok(Math.abs(shorelineRadiusAt(lake, -1e-8) - shorelineRadiusAt(lake, Math.PI * 2 - 1e-8)) < 1e-6);
  return { x: lake.x, z: lake.z, areaM2: Math.abs(area) * 0.5, inward };
}

function inspectRoadsAndPads(field, before, beforeWater) {
  let minimumRoadNormal = 1, maximumRoadHeightDelta = 0, minimumPadNormal = 1, maximumPadMoveRoadDelta = 0;
  const padFailures = [];
  for (const road of field._layout.roads) for (const [x, z] of road) {
    minimumRoadNormal = Math.min(minimumRoadNormal, field.getNormalAt(x, z).y);
    maximumRoadHeightDelta = Math.max(maximumRoadHeightDelta, Math.abs(field.getHeightAt(x, z) - beforeWater.getHeightAt(x, z)));
    maximumPadMoveRoadDelta = Math.max(maximumPadMoveRoadDelta, Math.abs(field.getHeightAt(x, z) - before.getHeightAt(x, z)));
    assert.equal(field.getWaterMaskAt(x, z), 0, 'existing road center remains dry');
  }
  const pads = [polders.spawns.player, ...polders.spawns.enemies];
  const oldPads = [originalSpawns.player, ...originalSpawns.enemies];
  for (const [index, pad] of pads.entries()) {
    assert.equal(field.getWaterMaskAt(pad.x, pad.z), 0);
    if (pad.x === oldPads[index].x && pad.z === oldPads[index].z) {
      assert.ok(Math.abs(field.getHeightAt(pad.x, pad.z) - before.getHeightAt(pad.x, pad.z)) < 1e-10);
    }
    for (let x = -8; x <= 8; x += 2) for (let z = -8; z <= 8; z += 2) {
      const px = pad.x + x, pz = pad.z + z;
      const normal = field.getNormalAt(px, pz).y;
      minimumPadNormal = Math.min(minimumPadNormal, normal);
      assert.equal(field.getWaterMaskAt(px, pz), 0, 'entire deployment footprint is dry');
      if (normal < 0.94) padFailures.push({ x: px, z: pz, normal,
        before: before.getNormalAt(px, pz).y });
    }
  }
  assert.ok(minimumRoadNormal >= 0.90, 'existing road centerline remains tank-traversable');
  assert.ok(maximumRoadHeightDelta < 1e-10, 'water authoring cannot change canonical road elevations');
  return { minimumRoadNormal, maximumRoadHeightDelta, maximumPadMoveRoadDelta, minimumPadNormal, padFailures,
    oldShoulderNormal: before.getNormalAt(-178, 426).y, oldPlayerShoulderNormal: before.getNormalAt(-116, -384).y };
}

function inspectBankRay(field, lake, a, pads, receipt) {
    const radius = shorelineRadiusAt(lake, a);
    const cx = lake.x + Math.cos(a) * radius * 1.06, cz = lake.z + Math.sin(a) * radius * 1.06;
    if (radius * 1.06 < lake.r && field._roadDist(cx, cz) > 20) {
      assert.equal(field.getWaterMaskAt(cx, cz), 0);
      assert.equal(field._noVeg(cx, cz), false, 'dry coves can receive shoreline dressing instead of circular exclusion');
      receipt.dryCoves++;
    }
    for (const band of [0.6, 0.8, 0.94, 1.04, 1.15, 1.3, 1.5, 1.8, 2.1, 2.5, 3]) {
      const x = lake.x + Math.cos(a) * radius * band, z = lake.z + Math.sin(a) * radius * band;
      if (field._roadDist(x, z) < 20 || pads.some(p => Math.hypot(x - p.x, z - p.z) < 28)) continue;
      const h = field.getHeightAt(x, z);
      assert.ok(Number.isFinite(h));
      const grade = Math.hypot((field.getHeightAt(x + 0.25, z) - field.getHeightAt(x - 0.25, z)) * 2,
        (field.getHeightAt(x, z + 0.25) - field.getHeightAt(x, z - 0.25)) * 2);
      if (field.getWaterMaskAt(x, z) > 0.98) {
        assert.ok(grade <= 0.01001, 'open water remains level');
        assert.equal(field._noVeg(x, z), true);
        if (band < 0.8) assert.ok(Math.abs(h - lake.level) < 1e-10);
        receipt.coreSamples++;
      } else if (band >= 0.94) {
        receipt.bankSamples++;
        if (grade > receipt.maximumBankGrade) { receipt.maximumBankGrade = grade; receipt.worst = { x, z, band }; }
      }
    }
}

function inspectBanks(field) {
  const receipt = { bankSamples: 0, coreSamples: 0, maximumBankGrade: 0, worst: null, dryCoves: 0 };
  const pads = [polders.spawns.player, ...polders.spawns.enemies];
  for (const lake of polders.terrain.lakes) for (let i = 0; i < 64; i++) {
    inspectBankRay(field, lake, i * Math.PI / 32, pads, receipt);
  }
  assert.ok(receipt.coreSamples >= 600 && receipt.bankSamples >= 1200 && receipt.dryCoves >= 200);
  return receipt;
}

function nearestRoadPoint(field, pad) {
  let nearest = null, distance = Infinity;
  for (const road of field._layout.roads) for (let i = 1; i < road.length; i++) {
    const a = road[i - 1], b = road[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((pad.x - a[0]) * dx + (pad.z - a[1]) * dz) / (dx * dx + dz * dz)));
    const x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(pad.x - x, pad.z - z);
    if (d < distance) { distance = d; nearest = { x, z }; }
  }
  return nearest;
}

function measurePadApproach(field, pad, road) {
  const dx = road.x - pad.x, dz = road.z - pad.z;
  const distance = Math.hypot(dx, dz), steps = Math.ceil(distance / 2);
  let minimumNormal = 1;
  for (let step = 0; step <= steps; step++) for (const across of [-4, 0, 4]) {
    const x = pad.x + dx * step / steps - dz / distance * across;
    const z = pad.z + dz * step / steps + dx / distance * across;
    if (field.getWaterMaskAt(x, z) !== 0) return null;
    minimumNormal = Math.min(minimumNormal, field.getNormalAt(x, z).y);
  }
  return { x: pad.x, z: pad.z, roadX: road.x, roadZ: road.z, distance, minimumNormal };
}

function inspectPadApproach(field, pad) {
  // Test a usable eight-metre-wide exit, not an obligation to drive squarely
  // across the steepest causeway shoulder. Candidate endpoints are EXISTING
  // nearby road nodes; this authors no road or alternate heightfield.
  const nearest = nearestRoadPoint(field, pad);
  let best = measurePadApproach(field, pad, nearest);
  for (const road of field._layout.roads) for (const [x, z] of road) {
    if (Math.hypot(x - pad.x, z - pad.z) > 100) continue;
    const candidate = measurePadApproach(field, pad, { x, z });
    if (candidate && (!best || candidate.minimumNormal > best.minimumNormal)) best = candidate;
  }
  assert.ok(best?.minimumNormal >= 0.90, `traversable full-width deployment approach: ${JSON.stringify(best)}`);
  return best;
}

assert.equal(originalLakes.length, 27);
assert.equal(polders.terrain.lakes.length, 5);
assert.equal(Math.hypot(polders.spawns.player.x + 112, polders.spawns.player.z + 390), 18);
assert.equal(Math.hypot(polders.spawns.enemies[1].x + 170, polders.spawns.enemies[1].z - 426), 18);
for (let i = 0; i < polders.spawns.enemies.length; i++) {
  const a = polders.spawns.enemies[i];
  if (i !== 1) assert.deepEqual(a, originalSpawns.enemies[i], 'all other spawn anchors are unchanged');
  assert.ok(Math.hypot(a.x - polders.spawns.player.x, a.z - polders.spawns.player.z) > 700);
  for (const b of polders.spawns.enemies.slice(i + 1)) {
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 56, 'deployment pads remain separate');
  }
}
const contours = polders.terrain.lakes.map(inspectContour);
assert.ok(polders.terrain.lakes.reduce((count, lake) => count + 4 + lake.radii.length, 0) < originalLakes.length * 4);
assert.equal(buildLiquidLakeBanks(polders.terrain.lakes, () => 9).byteLength, 40);
assert.equal(buildLiquidLakeBanks(originalLakes, () => 9).byteLength, 216);
console.log(JSON.stringify({ contours, originalRecords: 27, records: 5, originalContourVertices: 1728, contourVertices: 320,
  authoringScalarsBefore: 108, authoringScalarsAfter: 100, levelAndBankBytesBefore: 432, levelAndBankBytesAfter: 80 }));
const receipts = [];
for (const seed of [1337, 2049, 7719]) {
  const before = createHeightField(seed, original), field = createHeightField(seed, polders);
  const beforeWater = createHeightField(seed, { ...original, spawns: polders.spawns });
  const roads = inspectRoadsAndPads(field, before, beforeWater);
  const banks = inspectBanks(field);
  const approaches = [polders.spawns.player, polders.spawns.enemies[1]].map(pad => inspectPadApproach(field, pad));
  console.log(JSON.stringify({ seed, roads, banks, approaches }));
  receipts.push({ seed, roads, banks });
}
assert.ok(receipts.every(receipt => receipt.roads.padFailures.length === 0), 'complete deployment footprints stay stable for every seed');
assert.ok(Math.abs(receipts.find(receipt => receipt.seed === 2049).roads.oldShoulderNormal - 0.8706010374956304) < 1e-12,
  'preserve evidence of the original seed-2049 causeway-shoulder deployment defect');
assert.ok(Math.abs(receipts.find(receipt => receipt.seed === 7719).roads.oldPlayerShoulderNormal - 0.8667011164167123) < 1e-12,
  'preserve the seed-7719 player shoulder defect missed by nine-point pad checks');
assert.ok(receipts.every(receipt => receipt.banks.maximumBankGrade < 0.75), 'same 75% physical bank-grade ceiling through the complete apron');
console.log('Polders shoreline: five substantial asymmetric basins; exact road support, dry stable deployment footprints, level cores, dry coves and graded banks PASS; native visuals/performance unverified');
