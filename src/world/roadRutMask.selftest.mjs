import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ClampToEdgeWrapping, LinearFilter, LinearMipmapLinearFilter, NoColorSpace,
  RGBAFormat, Texture, UnsignedByteType,
} from 'three';
import { roadCoreMask, roadRutInverseWidth, roadRutMask } from './roadMaskProfile.ts';
import { createHeightField, makeMaskTexture, mulberry32, selectTerrainLandformMask } from './terrain.ts';
import { historicalMaskTexture, unoptimizedFilteredMaskTexture } from './roadRutHistoryTestOracle.mjs';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { getDeviceTier, resolveDeviceTier } from '../engine/quality.ts';

const PHASES = [[0, 0], [.25, .25], [.5, .75], [.75, .5]];
const ACROSS = [0, -1.55, 1.55, -3.85, 3.85];
const SEEDS = [1337, 7719];
const originalRut = distance => Math.exp(-Math.pow((Math.abs(distance) - 1.55) / .55, 2));
const byte = new Uint8ClampedArray(1);
const encode = value => { byte[0] = value; return byte[0]; };

function filteredSampler(profile, texelM, amplitude, c, s, phase) {
  const inverseWidth = roadRutInverseWidth(texelM);
  // Actual mask pixel centres, Uint8Clamped storage and linear sampling. Keep
  // intended noise modulation constant to isolate raster aliasing; test both
  // the neutral-noise amplitude (.775) and maximum authored amplitude (1).
  const pixel = (x, z) => {
    const d = Math.abs((x + .5 - phase[0]) * texelM * c + (z + .5 - phase[1]) * texelM * s);
    return encode(245 * amplitude * roadCoreMask(d, 0, 0, texelM) * profile(d, inverseWidth)) / 255;
  };
  return (x, z) => {
    const gx = x / texelM - .5, gz = z / texelM - .5;
    const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
    const a = pixel(ix, iz), b = pixel(ix + 1, iz), d = pixel(ix, iz + 1), e = pixel(ix + 1, iz + 1);
    return (a + (b - a) * fx) * (1 - fz) + (d + (e - d) * fx) * fz;
  };
}

function measureProfile(profile, texelM, amplitude) {
  const cases = [];
  for (let bearing = 0; bearing < 180; bearing += 5) for (const phase of PHASES) {
    const c = Math.cos(bearing * Math.PI / 180), s = Math.sin(bearing * Math.PI / 180);
    const sample = filteredSampler(profile, texelM, amplitude, c, s, phase);
    for (const across of ACROSS) {
      let low = Infinity, high = -Infinity, alongGradient = 0, sum = 0, count = 0;
      for (let along = -32; along <= 32; along += .5) {
        const x = -along * s + across * c + phase[0] * texelM;
        const z = along * c + across * s + phase[1] * texelM;
        const value = sample(x, z);
        // The shader takes unscaled central differences at +/-1.4 m. Project
        // that exact vector onto the road tangent: a uniform straight rut
        // must not manufacture successive uphill/downhill lighting bumps.
        const gx = sample(x + 1.4, z) - sample(x - 1.4, z);
        const gz = sample(x, z + 1.4) - sample(x, z - 1.4);
        alongGradient = Math.max(alongGradient, Math.abs(-s * gx + c * gz));
        low = Math.min(low, value); high = Math.max(high, value); sum += value; count++;
      }
      cases.push({ bearing, phase, across, variation: high - low, alongGradient, mean: sum / count });
    }
  }
  return cases;
}

function assertContinuity(cases, texelM) {
  // Fixed mechanism-level bounds, including road-core multiplication, byte
  // quantization and full amplitude. These bound raw G, before the shader's
  // subtle colour/normal weights; they do not hide aliasing by reducing those
  // weights. Compare matched old worst cases separately below.
  const colourLimit = texelM === 2 ? .12 : .10;
  const gradientLimit = texelM === 2 ? .11 : .08;
  for (const sample of cases) {
    const context = `${texelM}m/${sample.bearing}deg/phase${sample.phase}/across${sample.across}`;
    assert.ok(sample.variation <= colourLimit,
      `${context}: longitudinal G variation ${sample.variation} exceeds ${colourLimit}`);
    assert.ok(sample.alongGradient <= gradientLimit,
      `${context}: longitudinal mask gradient ${sample.alongGradient} exceeds ${gradientLimit}`);
  }
}

function assertArea(profile, texelM) {
  const step = .01, inverseWidth = roadRutInverseWidth(texelM);
  let area = 0;
  for (let index = 0; index < 6400; index++) {
    const distance = -32 + (index + .5) * step, value = profile(distance, inverseWidth);
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, 'rut profile stays finite and normalized');
    assert.ok(Math.abs(value - profile(-distance, inverseWidth)) < 1e-12, 'both signed lanes remain symmetric');
    area += value * step;
  }
  const originalArea = 2 * .55 * Math.sqrt(Math.PI);
  assert.ok(Math.abs(area / originalArea - 1) < .001,
    `${texelM}m: integrated rut profile area ${area} preserves authored wear within 0.1%`);
}

function assertRetainedWear(cases, texelM) {
  const average = across => {
    const selected = cases.filter(row => Math.abs(row.across) === across);
    return selected.reduce((sum, row) => sum + row.mean, 0) / selected.length;
  };
  const centre = average(0), lane = average(1.55), shoulder = average(3.85);
  assert.ok(centre > .10 && lane > .10 && lane > shoulder * 2, 'filtered mask retains substantial road-local wear');
  if (texelM === 2) {
    // A single 2 m grid phase cannot resolve both 3.1 m-spaced lanes. Require
    // positive aggregate lane contrast across every bearing/phase, not a
    // physically impossible positive contrast for each individual phase.
    assert.ok(lane - centre > .003, 'desktop sampling retains positive aggregate twin-lane contrast');
  } else {
    assert.ok(centre - lane > .015, 'mobile lanes merge naturally into a continuous compacted centre');
  }
}

for (const texelM of [2, 4]) {
  assertArea(roadRutMask, texelM);
  assert.throws(() => assertArea(() => 0, texelM), /integrated rut profile area/, 'flat zero is not anti-aliasing');
  const inverseWidth = roadRutInverseWidth(texelM);
  assert.ok(inverseWidth > 0 && inverseWidth < 1 / .55, 'filter expands the unresolved authored rut footprint');
  const centre = roadRutMask(0, inverseWidth), lane = roadRutMask(1.55, inverseWidth);
  assert.ok(texelM === 2 ? lane - centre > .04 : centre - lane > .02,
    'continuous profile retains desktop lanes and merges unresolved mobile lanes');
  for (const amplitude of [.775, 1]) {
    const current = measureProfile(roadRutMask, texelM, amplitude);
    const original = measureProfile(originalRut, texelM, amplitude);
    assertContinuity(current, texelM); assertRetainedWear(current, texelM);
    assert.throws(() => assertContinuity(original, texelM), /longitudinal/,
      'the original point-sampled Gaussian must fail this same continuity oracle');
    const oldWorstIndex = original.reduce((best, row, index) => row.variation > original[best].variation ? index : best, 0);
    const newWorstIndex = current.reduce((best, row, index) => row.variation > current[best].variation ? index : best, 0);
    assert.ok(current[oldWorstIndex].variation <= original[oldWorstIndex].variation * .2,
      'at least 80% less longitudinal variation at the exact original worst bearing/phase/cross-road position');
    console.log(JSON.stringify({ texelM, amplitude,
      originalWorst: original[oldWorstIndex], currentAtOriginalWorst: current[oldWorstIndex],
      currentWorst: current[newWorstIndex], originalAtCurrentWorst: original[newWorstIndex],
      currentMaxAlongGradient: Math.max(...current.map(row => row.alongGradient)),
      originalMaxAlongGradient: Math.max(...original.map(row => row.alongGradient)),
    }));
  }
}

const serialize = value => JSON.stringify(value, (_key, item) => typeof item === 'function' ? item.toString() : item);
function textureProperties(texture) {
  return serialize(Object.fromEntries(Object.entries(texture).filter(([key]) => !['id', 'uuid', 'source'].includes(key))));
}

function assertTexture(texture, size) {
  assert.equal(texture.isDataTexture, true, 'one data mask, not a canvas or render target');
  assert.equal(texture.image.width, size); assert.equal(texture.image.height, size);
  assert.ok(texture.image.data instanceof Uint8Array);
  assert.equal(texture.image.data.byteLength, size * size * 4, 'unchanged RGBA mask footprint');
  assert.equal(texture.format, RGBAFormat); assert.equal(texture.type, UnsignedByteType);
  assert.equal(texture.colorSpace, NoColorSpace); assert.equal(texture.premultiplyAlpha, false);
  assert.equal(texture.flipY, false); assert.equal(texture.wrapS, ClampToEdgeWrapping);
  assert.equal(texture.wrapT, ClampToEdgeWrapping); assert.equal(texture.minFilter, LinearMipmapLinearFilter);
  assert.equal(texture.magFilter, LinearFilter); assert.equal(texture.generateMipmaps, true);
  assert.equal(texture.anisotropy, 4); assert.equal(texture.mipmaps.length, 0);
}

function assertChannelScope(before, after, label) {
  assert.equal(after.length, before.length, `${label}: same mask size`);
  let changed = 0, positive = 0;
  for (let at = 0; at < before.length; at += 4) {
    if (before[at] !== after[at] || before[at + 2] !== after[at + 2] || before[at + 3] !== after[at + 3]) {
      assert.fail(`${label}: protected R/B/A channel changed at pixel ${at / 4}`);
    }
    const green = after[at + 1];
    if (!Number.isFinite(green) || !Number.isInteger(green) || green < 0 || green > 255) {
      assert.fail(`${label}: finite normalized green byte required at pixel ${at / 4}`);
    }
    if (green > 0) positive++;
    if (green !== before[at + 1]) {
      assert.ok(after[at] > 0, `${label}: rut changes must remain inside existing road-R coverage`);
      changed++;
    }
  }
  assert.ok(positive > 0, `${label}: actual factory must retain nonzero green wear`);
  assert.ok(changed > 0, `${label}: actual factory must replace the original aliased rut expression`);
  return { changed, positive };
}

function assertMaskBytesEqual(before, after, label) {
  assert.equal(after.length, before.length, `${label}: same full RGBA byte length`);
  for (let at = 0; at < before.length; at++) {
    if (after[at] !== before[at]) {
      assert.fail(`${label}: full RGBA differs at pixel ${Math.floor(at / 4)}, channel ${'RGBA'[at % 4]}: ${before[at]} -> ${after[at]}`);
    }
  }
}

function supportSnapshot(field, cfg) {
  const points = [];
  for (const x of [-480, -240, 0, 240, 480]) for (const z of [-480, -240, 0, 240, 480]) points.push([x, z]);
  for (const spawn of [field._layout.spawns.player, ...field._layout.spawns.enemies]) {
    for (const dx of [-4, 0, 4]) for (const dz of [-4, 0, 4]) points.push([spawn.x + dx, spawn.z + dz]);
  }
  for (const road of field._layout.roads) for (const point of road) points.push(point);
  for (const beat of cfg.props?.tacticalBeats ?? []) points.push([beat.x, beat.z]);
  return points.map(([x, z]) => [x, z, field.getHeightAt(x, z), ...field.getNormalAt(x, z).toArray(),
    field.getGroundType(x, z), field.getWaterMaskAt(x, z), field._roadDist(x, z), field._noVeg(x, z)]);
}

function bake(factory, field, cfg) {
  // Splat construction fixes the paint-noise seed at 3010 independently of
  // the height-field seed. Preserve that live composition for both controls.
  return factory(new SimplexNoise({ random: mulberry32(3010) }), field._layout,
    selectTerrainLandformMask(cfg.splat, field._mesaW), field._waterWetnessAt ?? null,
    cfg.splat?.shoreDirt ? (cfg.splat.seaRamp?.[0] ?? .40) : null);
}

function checkLiveMap(id, seed, size) {
  const cfg = getMapConfig(id), field = createHeightField(seed, cfg), layout = field._layout;
  const layoutBefore = serialize(layout), cfgBefore = serialize(cfg), supportBefore = supportSnapshot(field, cfg);
  // Texture IDs are assigned by the shared Three.js constructor. Sentinels
  // prove each real factory allocates exactly one texture, including no hidden
  // extra texture after its returned mask. No renderer/GPU is constructed.
  const start = new Texture();
  let original, unoptimized, current, end;
  try {
    original = bake(historicalMaskTexture, field, cfg);
    unoptimized = bake(unoptimizedFilteredMaskTexture, field, cfg);
    current = bake(makeMaskTexture, field, cfg);
    end = new Texture();
    assert.equal(original.id, start.id + 1); assert.equal(unoptimized.id, original.id + 1);
    assert.equal(current.id, unoptimized.id + 1);
    assert.equal(end.id, current.id + 1, 'no extra texture allocation in the current factory');
    assertTexture(original, size); assertTexture(unoptimized, size); assertTexture(current, size);
    assert.deepEqual(Object.getOwnPropertyNames(current).sort(), Object.getOwnPropertyNames(original).sort(), 'no new texture properties');
    assert.equal(textureProperties(current), textureProperties(original), 'every non-identity texture setting stays exact');
    assert.deepEqual(Object.getOwnPropertyNames(current).sort(), Object.getOwnPropertyNames(unoptimized).sort(), 'early-out adds no texture properties');
    assert.equal(textureProperties(current), textureProperties(unoptimized), 'early-out preserves every texture setting');
    assertMaskBytesEqual(unoptimized.image.data, current.image.data, `${id}/${seed}/${size}/zero-core early-out`);
    const counts = assertChannelScope(original.image.data, current.image.data, `${id}/${seed}/${size}`);
    assert.equal(field._layout, layout, 'mask painting does not replace the world layout');
    assert.equal(serialize(layout), layoutBefore, 'roads, spawns, authored terrain and layout remain unchanged');
    assert.equal(serialize(cfg), cfgBefore, 'no map-specific opt-in or authoring change');
    assert.deepEqual(supportSnapshot(field, cfg), supportBefore, 'terrain geometry, water, road and landmark support remain exact');
    if (id === 'badlands' && seed === 1337) {
      for (const channel of [0, 1, 2, 3]) {
        const corrupt = current.image.data.slice(); corrupt[channel] ^= 1;
        assert.throws(() => assertMaskBytesEqual(unoptimized.image.data, corrupt, 'early-out mutant'), /full RGBA differs/);
      }
      for (const channel of [0, 2, 3]) {
        const corrupt = current.image.data.slice(); corrupt[channel] ^= 1;
        assert.throws(() => assertChannelScope(original.image.data, corrupt, 'mutant'), /protected R\/B\/A/);
      }
      const offRoad = current.image.data.findIndex((value, index) => index % 4 === 0 && value === 0);
      assert.ok(offRoad >= 0, 'scope mutation needs a real off-road pixel');
      const corrupt = current.image.data.slice(); corrupt[offRoad + 1] ^= 1;
      assert.throws(() => assertChannelScope(original.image.data, corrupt, 'mutant'), /inside existing road-R/);
      const flat = current.image.data.slice();
      for (let at = 1; at < flat.length; at += 4) flat[at] = 0;
      assert.throws(() => assertChannelScope(original.image.data, flat, 'mutant'), /nonzero green wear/);
      assert.throws(() => assertChannelScope(original.image.data, original.image.data, 'mutant'), /replace the original aliased/);
    }
    return counts;
  } finally { start.dispose(); original?.dispose(); unoptimized?.dispose(); current?.dispose(); end?.dispose(); }
}

function checkZeroCoreNoiseWork(size) {
  const texelM = 1024 / size;
  const layout = { village: { x0: 900, x1: 950, z0: 900, z1: 950 },
    roads: [[[-512, -1.25], [512, -1.25]]], marshes: [], lakes: [], terrain: {} };
  const measuredNoise = () => {
    const random = mulberry32(3010);
    let randomCalls = 0, noiseCalls = 0;
    const noise = new SimplexNoise({ random: () => { randomCalls++; return random(); } });
    const sample = noise.noise.bind(noise);
    noise.noise = (x, z) => { noiseCalls++; return sample(x, z); };
    return { noise, counts: () => ({ randomCalls, noiseCalls }) };
  };
  const beforeNoise = measuredNoise(), afterNoise = measuredNoise();
  // Compute expected zero-core coverage independently using a separate real,
  // pure seeded noise instance. The straight-road distance is exact here,
  // including Float32 raster storage; this is not a quantized-R shortcut.
  const control = new SimplexNoise({ random: mulberry32(3010) });
  let nearRoadPixels = 0, zeroCorePixels = 0;
  for (let row = 0; row < size; row++) {
    const z = (row + .5) * texelM - 512, distance = Math.abs(z + 1.25);
    if (distance >= 13) continue;
    for (let column = 0; column < size; column++) {
      const x = (column + .5) * texelM - 512;
      const wobble = control.noise(x * .055, z * .055) * .8 + control.noise(x * .21, z * .21) * .35;
      const width = control.noise(x * .011 + 41, z * .011 - 17) * 1.5;
      nearRoadPixels++;
      if (roadCoreMask(distance, wobble, width, texelM) === 0) zeroCorePixels++;
    }
  }
  let before, after;
  try {
    before = unoptimizedFilteredMaskTexture(beforeNoise.noise, layout);
    after = makeMaskTexture(afterNoise.noise, layout);
    assertTexture(before, size); assertTexture(after, size);
    assertMaskBytesEqual(before.image.data, after.image.data, `${size}/pure noise early-out`);
    const originalCalls = beforeNoise.counts(), currentCalls = afterNoise.counts();
    assert.equal(originalCalls.randomCalls, 256, 'noise samples never advance the seed RNG');
    assert.equal(currentCalls.randomCalls, 256, 'skipped noise does not shift subsequent random state');
    assert.ok(zeroCorePixels > 0 && zeroCorePixels < nearRoadPixels, 'fixture covers real roads and uncovered shoulders');
    assert.equal(originalCalls.noiseCalls, nearRoadPixels * 4, 'unoptimized factory samples four times per nearby pixel');
    assert.equal(currentCalls.noiseCalls, originalCalls.noiseCalls - zeroCorePixels,
      'exactly one pure noise call is skipped for every zero floating-point core');
    console.log(JSON.stringify({ size, nearRoadPixels, zeroCorePixels,
      unoptimizedNoiseCalls: originalCalls.noiseCalls, optimizedNoiseCalls: currentCalls.noiseCalls }));
  } finally { before?.dispose(); after?.dispose(); }
}

function checkLiveStraightRoad(size) {
  const texelM = 1024 / size;
  // Drive the unmodified factory with a deterministic straight road, no noise
  // and no later stamps. This ties the analytical tests to actual G bytes;
  // a disconnected helper or wrong texel-width argument cannot pass.
  const layout = { village: { x0: 900, x1: 950, z0: 900, z1: 950 },
    roads: [[[-512, -1.25], [512, -1.25]]], marshes: [], lakes: [], terrain: {} };
  const texture = makeMaskTexture({ noise: () => 0 }, layout);
  try {
    assertTexture(texture, size);
    let positive = 0;
    for (let row = 0; row < size; row++) {
      const distance = Math.abs((row + .5) * texelM - 512 + 1.25);
      const expected = encode(245 * .775 * roadCoreMask(distance, 0, 0, texelM)
        * roadRutMask(distance, roadRutInverseWidth(texelM)));
      for (let column = 0; column < size; column++) {
        const actual = texture.image.data[(row * size + column) * 4 + 1];
        assert.equal(actual, expected, 'actual factory uses filtered helper and actual mask footprint');
        if (actual > 0) positive++;
      }
    }
    assert.ok(positive > size, 'actual straight road retains multiple nonzero wear rows');
  } finally { texture.dispose(); }
}

const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
assert.match(source, /float texel = 1\.4 \/ 1024\.0;/, 'analytical gradient follows the current physical shader offsets');
assert.match(source, /rutG\.x = texture2D\(uMask, mUV \+ vec2\(texel, 0\.0\)\)\.g - texture2D\(uMask, mUV - vec2\(texel, 0\.0\)\)\.g;/);
assert.match(source, /rutG\.y = texture2D\(uMask, mUV \+ vec2\(0\.0, texel\)\)\.g - texture2D\(uMask, mUV - vec2\(0\.0, texel\)\)\.g;/);

assert.equal(MAP_IDS.length, 30, 'all thirty registered battlefields are covered');
assert.equal(getDeviceTier(), 'desktop', 'run in an isolated renderer-free test process');
const savedWindow = globalThis.window;
try {
  for (const size of [512, 256]) {
    if (size === 256) {
      globalThis.window = { location: { search: '?tier=mobile' }, localStorage: { getItem: () => null } };
      assert.equal(resolveDeviceTier(), 'mobile');
    }
    checkLiveStraightRoad(size);
    checkZeroCoreNoiseWork(size);
    let changed = 0, positive = 0;
    for (const id of MAP_IDS) for (const seed of SEEDS) {
      const result = checkLiveMap(id, seed, size); changed += result.changed; positive += result.positive;
    }
    console.log(JSON.stringify({ size, maps: MAP_IDS.length, seeds: SEEDS, changedGreenPixels: changed, positiveGreenPixels: positive }));
  }
} finally {
  if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
}

console.log('roadRutMask.selftest: filtered/quantized continuity and gradient, retained wear, original/flat/channel negative controls, pure-noise early-out savings, 120 live cases with exact optimized/unoptimized RGBA and historical R/B/A/layout/support/texture contracts passed');
