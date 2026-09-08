import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SHORELINE_SEGMENTS,
  minimumShorelineRadius, shorelineDistance, shorelineRadiusAt, shorelineWetness, shorelineWetnessFromDistance, sampleShorelineMask,
} from './shoreline.ts';
import { createHeightField } from './terrain.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';

// Frozen pre-authored-contour formula: every other map remains bit-identical,
// including negative positions, varying radii and angular wrap boundaries.
function legacyRadiusAt(disc, angle) {
  const hash = value => {
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    return (value ^ (value >>> 16)) >>> 0;
  };
  const tau = Math.PI * 2;
  const seed = hash(Math.imul(Math.round(disc.x * 16), 73856093)
    ^ Math.imul(Math.round(disc.z * 16), 19349663));
  const phaseA = (seed & 0xffff) / 65536 * tau, phaseB = (seed >>> 16) / 65536 * tau;
  const broad = Math.sin(angle * 3 + phaseA) * 0.025;
  const cove = Math.max(0, Math.sin(angle * 5 - phaseB));
  const bank = Math.abs(Math.sin(angle * 11 + phaseA + phaseB)) * 0.04;
  return disc.r * Math.min(1, Math.max(0.80, 0.99 + broad - cove * cove * 0.12 - bank));
}
let legacyChecks = 0;
const originalOasisLakes = [
  { x: -138, z: -16, r: 52 }, { x: -182, z: 32, r: 57 }, { x: -134, z: 84, r: 48 },
];
for (const id of MAP_IDS.filter(id => id !== 'polders')) {
  const terrain = getMapConfig(id).terrain;
  // Oasis explicitly migrated to one authored basin; preserve all of its
  // historical formula comparisons, not an exemption that deletes coverage.
  const lakes = id === 'oasis' ? originalOasisLakes : terrain.lakes ?? [];
  for (const disc of [...lakes, ...(terrain.marshes ?? [])]) {
    assert.equal(disc.radii, undefined, `${id}: no implicit profile migration`);
    assert.equal(minimumShorelineRadius(disc), disc.r * 0.8);
    for (let i = -64; i <= 64; i++) {
      const angle = i * Math.PI / 32;
      assert.equal(shorelineRadiusAt(disc, angle), legacyRadiusAt(disc, angle), `${id}: unchanged legacy contour`);
      legacyChecks++;
    }
  }
}
assert.ok(legacyChecks > 10000);
for (const disc of ['polders', 'oasis'].flatMap(id => getMapConfig(id).terrain.lakes)) {
  assert.equal(disc.radii.length, 16);
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    assert.ok(Math.abs(shorelineRadiusAt(disc, a) - disc.r * disc.radii[i]) < 1e-12);
    assert.ok(Math.abs(shorelineRadiusAt(disc, a + Math.PI / 16)
      - disc.r * (disc.radii[i] + disc.radii[(i + 1) & 15]) * 0.5) < 1e-12);
  }
}
console.log(`shoreline: ${legacyChecks} exact legacy contour comparisons; authored knots and interpolation PASS`);

const lake = { x: 195, z: -120, r: 88 };
const beach = { x: 195, z: -120, r: 110 };
const other = { x: -190, z: -210, r: 62 };
assert.deepEqual(Object.keys(lake), ['x', 'z', 'r'], 'contours retain no arrays or caches on world discs');
assert.equal(shorelineRadiusAt(lake, 1.2) / lake.r, shorelineRadiusAt(beach, 1.2) / beach.r,
  'concentric sheet and apron share the same cuts');
assert.equal(shorelineRadiusAt(lake, 0.7), shorelineRadiusAt({ ...lake }, 0.7),
  'contours are deterministic without depending on construction order');
assert.notEqual(shorelineRadiusAt(lake, 1) / lake.r, shorelineRadiusAt(other, 1) / other.r,
  'different centers do not repeat one outline');

let radialRange = 0, asymmetry = 0, concaveTurns = 0;
const points = [];
for (let i = 0; i < SHORELINE_SEGMENTS; i++) {
  const angle = i / SHORELINE_SEGMENTS * Math.PI * 2;
  const radius = shorelineRadiusAt(lake, angle);
  assert.ok(radius / lake.r >= 0.799 && radius / lake.r <= 1,
    'all bank cuts remain inside the authored gameplay envelope');
  radialRange = Math.max(radialRange, Math.abs(radius - shorelineRadiusAt(lake, angle + 1.1)));
  asymmetry = Math.max(asymmetry, Math.abs(radius - shorelineRadiusAt(lake, angle + Math.PI)));
  points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  const px = lake.x + Math.cos(angle) * radius;
  const pz = lake.z + Math.sin(angle) * radius;
  assert.ok(Math.abs(shorelineDistance(lake, px, pz) - 1) < 1e-6,
    'geometry and coverage use the exact same bank contour');
  assert.equal(shorelineWetness(lake, px, pz, true), 0, 'bank contour is dry');
  const innerX = lake.x + Math.cos(angle) * radius * 0.79;
  const innerZ = lake.z + Math.sin(angle) * radius * 0.79;
  assert.equal(shorelineWetness(lake, innerX, innerZ, true), 1, 'water sheet has a solid interior');
  for (const band of [0.35, 0.79, 0.84, 0.91, 0.97, 1.12, 1.6]) {
    const x = lake.x + Math.cos(angle) * radius * band;
    const z = lake.z + Math.sin(angle) * radius * band;
    const distance = shorelineDistance(lake, x, z, 1.8);
    for (const isLake of [true, false]) {
      assert.equal(shorelineWetnessFromDistance(distance, isLake), shorelineWetness(lake, x, z, isLake),
        'reusing the existing bank distance is bit-identical to a separate wetness query');
    }
  }
}
for (let i = 0; i < points.length; i++) {
  const a = points[i], b = points[(i + 1) % points.length], c = points[(i + 2) % points.length];
  const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  if (cross < 0) concaveTurns++;
}
assert.ok(radialRange > lake.r * 0.12, 'outline has substantial capes and coves, not a jittered circle');
assert.ok(asymmetry > lake.r * 0.12, 'opposite banks cannot form a centered ellipse');
assert.ok(concaveTurns >= 8, 'outline contains actual inward bank cuts, unlike any oval');
for (const disc of [lake, other, { x: 0, z: 0, r: 100 }]) {
  const radii = Array.from({ length: SHORELINE_SEGMENTS }, (_, i) =>
    shorelineRadiusAt(disc, i / SHORELINE_SEGMENTS * Math.PI * 2) / disc.r);
  assert.ok(Math.min(...radii) < 0.85 && Math.max(...radii) >= 0.99,
    'deep one-sided inlets interrupt broad capes, not equal rounded lobes');
  const sharpestBank = Math.max(...radii.map((r, i) => Math.abs(
    radii[(i + 1) % radii.length] + radii[(i + radii.length - 1) % radii.length] - 2 * r)));
  assert.ok(sharpestBank > 0.04,
    'bank cuts remain legible at the existing 64-sample geometry budget');
}
const contourSource = readFileSync(new URL('./shoreline.ts', import.meta.url), 'utf8');
assert.equal((contourSource.match(/Math\.sin\(/g) || []).length, 3, 'no additional per-query trig work');
assert.equal(SHORELINE_SEGMENTS, 64, 'no added shoreline geometry samples');
assert.ok(Math.abs(shorelineRadiusAt(lake, -1e-8)
  - shorelineRadiusAt(lake, Math.PI * 2 - 1e-8)) < 1e-7, 'angle seam is continuous');
assert.equal(shorelineDistance(lake, lake.x, lake.z), 0, 'center is finite');
assert.equal(shorelineDistance(lake, 500, 500), Infinity, 'distant queries stop at the broad phase');
assert.equal(shorelineWetness(lake, 500, 500, true), 0);
const overlap = { x: 253, z: -120, r: 88 };
assert.equal(sampleShorelineMask([], [lake, overlap], 251, -120),
  sampleShorelineMask([], [overlap, lake], 251, -120),
  'a first lake edge cannot suppress the solid interior of a second lake');
console.log('shoreline self-test: deterministic bounded irregular banks and shared coverage passed');

const authoredLake = { x: 250, z: -220, r: 70, level: -2 };
const field = createHeightField(1337, {
  terrain: { lakes: [authoredLake], marshes: [], softLakes: true },
  splat: { seaLake: true, seaRamp: [0.30, 0.62] },
});
for (let i = 0; i < 32; i++) {
  const angle = i / 32 * Math.PI * 2;
  const radius = shorelineRadiusAt(authoredLake, angle);
  const x = authoredLake.x + Math.cos(angle) * radius * 0.78;
  const z = authoredLake.z + Math.sin(angle) * radius * 0.78;
  assert.ok(Math.abs(field.getHeightAt(x, z) - authoredLake.level) < 1e-8,
    'every irregular water interior sits on the same flat sheet');
  assert.equal(field.getWaterMaskAt(x, z), 1, 'material coverage and water query share the same interior');
  assert.equal(field.getGroundType(x, z), 'soft', 'liquid bank shape also owns movement ground type');
  assert.equal(field._noVeg(x, z), true, 'the same water interior excludes vegetation');
  const dryX = authoredLake.x + Math.cos(angle) * radius * 1.06;
  const dryZ = authoredLake.z + Math.sin(angle) * radius * 1.06;
  assert.equal(field.getWaterMaskAt(dryX, dryZ), 0, 'coves cannot leave an invisible circular water mask');
  assert.equal(field.getGroundType(dryX, dryZ), 'medium', 'coves return dry-ground movement');
  assert.equal(field._noVeg(dryX, dryZ), radius * 1.06 < authoredLake.r * 1.04,
    'dry coves retain the conservative authored habitat buffer without refilling shoreline trees');
  assert.equal(field._noVeg(authoredLake.x + Math.cos(angle) * authoredLake.r * 1.06,
    authoredLake.z + Math.sin(angle) * authoredLake.r * 1.06), false,
  'bank dressing resumes beyond the authored outer-circle buffer');
}
console.log('shoreline self-test: terrain sheet, ground type, water coverage and vegetation agree');
