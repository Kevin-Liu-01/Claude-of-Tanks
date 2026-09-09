import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHeightField, mulberry32 } from '../terrain.ts';
import { dressMapExtras, railSegmentIsDry } from './mapKits.ts';
import skybridge from './skybridge.ts';

const bucketNames = ['plaster', 'plaster2', 'plaster3', 'roof', 'stone', 'wood',
  'dark', 'glass', 'curtain', 'straw', 'baked'];
const lines = [[40, -235, 235], [49, -235, 235], [58, -205, 210],
  [67, -175, 185], [76, -150, 160], [-66, -235, 235], [-57, -190, 200]];
const flat = { getHeightAt: () => 0, _roadDist: () => 100 };
assert.equal(railSegmentIsDry(flat, 0, 0, 10), true, 'legacy height fields retain dry-track behavior');
assert.equal(railSegmentIsDry({ ...flat, getWaterMaskAt: (_x, z) => Math.abs(z - 5) < 1 ? 1 : 0 },
  0, 0, 10), false, 'dry endpoints cannot bridge a wet midpoint');
assert.equal(railSegmentIsDry({ ...flat, getWaterMaskAt: x => x > 1.4 ? 1 : 0 },
  0, 0, 10), false, 'the whole ballast width is checked, not only the track center');
assert.equal(railSegmentIsDry({ ...flat, getWaterMaskAt: (_x, z) => z < 0 ? 1 : 0 },
  0, 0, 10), false, 'tilted slab overhang cannot project past a dry endpoint into water');

function build(heightField, seed, mapId = 'skybridge') {
  const buckets = Object.fromEntries(bucketNames.map(name => [name, []]));
  const random = mulberry32(seed ^ 0x5a17);
  let calls = 0;
  const rng = () => { calls++; return random(); };
  dressMapExtras({ mapId, extraKits: ['rail'], L: heightField._layout,
    heightField, rng, buckets });
  return { buckets, calls, next: random() };
}

function hashGeometry(geometry) {
  const hash = createHash('sha256');
  for (const name of Object.keys(geometry.attributes).sort()) {
    hash.update(name);
    const values = geometry.attributes[name].array;
    hash.update(new Uint8Array(values.buffer, values.byteOffset, values.byteLength));
  }
  if (geometry.index) hash.update(new Uint8Array(geometry.index.array.buffer));
  return hash.digest('hex');
}

function isBallast(geometry) {
  return geometry.parameters?.width === 3 && geometry.parameters?.height === 0.16;
}

function isRail(geometry) {
  return geometry.parameters?.width === 0.09 && geometry.parameters?.height === 0.17;
}

let removed = 0;
for (const seed of [1337, 2049, 7719]) {
  const heightField = createHeightField(seed, skybridge);
  const original = build({ ...heightField, getWaterMaskAt: () => 0 }, seed);
  const washed = build(heightField, seed);
  const legacy = seed === 1337 ? build(heightField, seed, 'railyard') : null;
  try {
    assert.equal(washed.calls, original.calls, 'washing out tracks preserves every original RNG draw');
    assert.equal(washed.next, original.next, 'later dressing receives the exact original seeded stream');
    const expectedDry = [];
    for (const [x, z0, z1] of lines) {
      const count = Math.max(1, Math.round((z1 - z0) / 10));
      for (let k = 0; k < count; k++) {
        const za = z0 + k * 10, zb = Math.min(z1, za + 10);
        expectedDry.push(railSegmentIsDry(heightField, x, za, zb));
      }
    }
    const beforeBallast = original.buckets.baked.filter(isBallast);
    const afterBallast = washed.buckets.baked.filter(isBallast);
    assert.equal(beforeBallast.length, expectedDry.length, 'every authored source segment is inspected');
    assert.deepEqual(afterBallast.map(hashGeometry), beforeBallast
      .filter((_geometry, index) => expectedDry[index]).map(hashGeometry),
    'every dry ballast segment survives byte-identically, and every wet one is omitted');
    assert.equal(washed.buckets.dark.filter(isRail).length, afterBallast.length * 2,
      'both rails follow exactly the same washed-out segment policy as their ballast');
    const removedHere = beforeBallast.length - afterBallast.length;
    assert.ok(removedHere >= 50 && afterBallast.length >= 180,
      'the real lake crossings disappear while substantial dry sidings remain');
    removed += removedHere;

    for (const name of bucketNames) {
      const before = original.buckets[name].map(hashGeometry);
      const after = washed.buckets[name].map(hashGeometry);
      let cursor = 0;
      for (const hash of after) {
        while (cursor < before.length && before[cursor] !== hash) cursor++;
        assert.ok(cursor < before.length, `${name}: surviving rails and later extras are byte-identical`);
        cursor++;
      }
      // Coal has its own all-map dry-footprint policy. This fixture continues
      // to isolate Skybridge's rail washout from every other dressing family.
      const nonCoal = geometries => geometries.filter(geometry => geometry.name !== 'rail-coal-stockpile');
      if (legacy) assert.deepEqual(nonCoal(legacy.buckets[name]).map(hashGeometry),
        nonCoal(original.buckets[name]).map(hashGeometry),
        `${name}: non-Skybridge rails ignore washout, even with the same wet height field`);
    }

    // Audit the emitted geometry itself on a denser grid than the policy:
    // edge/corner water cannot hide between the tested center-line samples.
    for (const geometry of afterBallast) {
      assert.equal(geometry.attributes.position.count, 24,
        'the skipped color-draw count matches the actual ballast BoxGeometry');
      geometry.computeBoundingBox();
      const { min, max } = geometry.boundingBox;
      for (let iz = 0; iz <= 24; iz++) for (let ix = 0; ix <= 6; ix++) {
        const x = min.x + (max.x - min.x) * ix / 6;
        const z = min.z + (max.z - min.z) * iz / 24;
        assert.ok(heightField.getWaterMaskAt(x, z) <= 0.01,
          `${seed}: no emitted ballast/rail footprint remains over significant liquid coverage at ${x},${z}`);
      }
    }
  } finally {
    for (const built of [original, washed, legacy]) {
      if (!built) continue;
      for (const geometries of Object.values(built.buckets)) for (const geometry of geometries) geometry.dispose();
    }
  }
}
console.log(`railWashout.selftest: ${removed} wet segments omitted across3seeds; dry geometry and RNG unchanged`);
