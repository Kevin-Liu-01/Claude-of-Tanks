import assert from 'node:assert/strict';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { createHorizonNoiseSampler, sampleHorizonTextureTerrain } from './maps/horizon.ts';

const tau = Math.PI * 2;
const smoothstep = (a, b, x) => {
  const value = (x - a) / (b - a);
  const t = value < 0 ? 0 : value > 1 ? 1 : value;
  return t * t * (3 - 2 * t);
};

function makeNoise(seed) {
  let state = seed >>> 0;
  return new SimplexNoise({ random() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  } });
}

// Independent f95bee586 reference: do not share the optimized sampler,
// short-circuit branches, or strata helper with production.
function legacyNoiseSampler(noise) {
  return (u, v, frequencyU, frequencyV, offset) => noise.noise3d(
    Math.cos(u * tau) * frequencyU * 0.5 + offset,
    Math.sin(u * tau) * frequencyU * 0.5 - offset * 0.7,
    v * frequencyV + offset * 1.31,
  );
}

function legacyTerrain(sampleNoise, options, u, v) {
  const { banding, treeline, grainAmp, gullyAmp = 1 } = options;
  const belowTree = treeline > 0
    ? 1 - smoothstep(treeline * 0.85, treeline * 1.08, v) : 0;
  const fineDetail = options.mesaSurface ? 1 - belowTree : treeline > 0 ? 0 : 1;
  let luminance = 1 + (sampleNoise(u, v, 90, 100, 17) * 0.05
    + sampleNoise(u, v, 34, 38, 5) * 0.06) * grainAmp * fineDetail;
  const faceVariation = smoothstep(0.25, 0.75,
    sampleNoise(u, v * 0.25, 9, 1.1, 77) * 0.5 + 0.5);
  const ridge = 1 - Math.abs(sampleNoise(u, v, 46, 2.6, 9));
  const segment = 0.45 + 0.55 * smoothstep(0.3, 0.72,
    sampleNoise(u, v, 31, 9.5, 118) * 0.5 + 0.5);
  const gully = smoothstep(0.86, 0.985, ridge) * gullyAmp
    * (0.35 + 0.65 * faceVariation) * segment;
  const scree = smoothstep(0.72, 0.92, ridge) * (1 - gully)
    * gullyAmp * faceVariation * segment;
  luminance *= 1 - gully * 0.13 + scree * 0.04;
  const talus = sampleNoise(u, v, 64, 46, 205);
  luminance *= 1 + talus * 0.045 * (0.5 + 0.5 * gullyAmp) * fineDetail;
  luminance *= treeline > 0
    ? 1 + sampleNoise(u, v, 7, 3.6, 41) * 0.05
    : 1 + sampleNoise(u, v, 7, 11, 41) * 0.06;
  if (banding > 0.003) {
    const warp = sampleNoise(u, v, 2.2, 0.6, 23) * 0.45;
    const band = Math.sin(v * 46 + warp) * 0.5
      + Math.sin(v * 13.5 + warp * 0.6 + 1.7) * 0.5;
    const bedWeight = 0.55
      + 0.45 * (sampleNoise(u, v, 1.5, 9, 311) * 0.5 + 0.5);
    luminance *= 1 + band * banding * 1.35 * bedWeight;
    const marker = smoothstep(0.75, 0.95, Math.sin(v * 6.2 + warp * 0.4 + 0.6));
    luminance *= 1 - marker * banding * 0.65;
    luminance *= 1 + smoothstep(0.72, 0.95, v) * 0.07
      - (1 - smoothstep(0.05, 0.4, v)) * 0.08;
  }
  return { luminance, belowTree, ridge, segment, gully };
}

function recordedTerrain(sample, noise, options, u, v) {
  const calls = [];
  const result = sample((...args) => {
    const value = noise(...args);
    calls.push({ args, value });
    return value;
  }, options, u, v);
  return { result, calls };
}

function assertTerrainParity(sample, factory) {
  const base = { banding: 0, snowline: 2, treeline: 0, grainAmp: 1 };
  const optionsList = [];
  for (const treeline of [0, 0.03, 0.65]) {
    for (const mesaSurface of [undefined, false, true]) {
      for (const overrides of [
        {}, { grainAmp: 0 }, { grainAmp: -0 }, { grainAmp: Number.MIN_VALUE },
        { grainAmp: 1e-8 }, { gullyAmp: 0 }, { gullyAmp: 0.14 },
        { banding: 0.003 }, { banding: 0.003 + Number.EPSILON },
        { banding: 0.18, gullyAmp: 0.14, snowline: 0.68 },
        { snowline: undefined, coolRock: true },
      ]) optionsList.push({ ...base, treeline, mesaSurface, ...overrides });
    }
  }
  let compared = 0, zeroFine = 0, zeroGrain = 0, tinyFine = 0, tinyGrain = 0;
  for (const seed of [0, 1, 4242, 0xffffffff]) {
    const actualNoise = factory(makeNoise(seed));
    const expectedNoise = legacyNoiseSampler(makeNoise(seed));
    for (const options of optionsList) {
      const tree = options.treeline;
      for (const u of [-0.1, 0, 1 / 512, 0.19, 0.731, 1 - Number.EPSILON, 1]) {
        for (const v of [-0.1, 0, tree * 0.85, tree * (0.85 + 1e-8), tree,
          tree * 1.08 - Number.EPSILON, tree * 1.08, tree * 1.08 + Number.EPSILON,
          0.63, 1]) {
          const expected = recordedTerrain(legacyTerrain, expectedNoise, options, u, v);
          const actual = recordedTerrain(sample, actualNoise, options, u, v);
          const label = `seed=${seed} u=${u} v=${v} options=${JSON.stringify(options)}`;
          assert.deepEqual(actual.result, expected.result, `Exact every-field terrain parity: ${label}`);
          const fine = options.mesaSurface ? 1 - expected.result.belowTree : tree > 0 ? 0 : 1;
          const skipGrain = fine === 0 || options.grainAmp === 0;
          const skipTalus = fine === 0;
          const retained = expected.calls.filter(({ args: [, , frequencyU] }) =>
            !((skipGrain && (frequencyU === 90 || frequencyU === 34))
              || (skipTalus && frequencyU === 64)));
          assert.deepEqual(actual.calls, retained, `Exact surviving noise coordinates/order/values: ${label}`);
          assert.equal(expected.calls.length, options.banding > 0.003 ? 9 : 7);
          assert.equal(expected.calls.length - actual.calls.length,
            skipTalus ? 3 : skipGrain ? 2 : 0, `Only zero-weight calls are removed: ${label}`);
          if (fine === 0) zeroFine++;
          else if (options.grainAmp === 0) {
            zeroGrain++;
            assert.ok(actual.calls.some(call => call.args[2] === 64), 'Zero grain retains live talus');
          }
          if (fine > 0 && fine < 1e-10) tinyFine++;
          if (fine > 0 && options.grainAmp > 0 && options.grainAmp < 1e-7) tinyGrain++;
          compared++;
        }
      }
    }
  }
  assert.ok(zeroFine > 0 && zeroGrain > 0 && tinyFine > 0 && tinyGrain > 0,
    'Exercise exact-zero and tiny-positive fine/grain branches, not merely generic terrain');
  return compared;
}

function coordinateRecorder(noise) {
  const calls = [];
  const original = noise.noise3d.bind(noise);
  noise.noise3d = (...args) => {
    calls.push(args);
    return original(...args);
  };
  return calls;
}

function assertFactoryParity(factory) {
  let compared = 0;
  for (const seed of [0, 4242, 0xffffffff]) {
    const actualNoise = makeNoise(seed), expectedNoise = makeNoise(seed);
    const actualCoordinates = coordinateRecorder(actualNoise);
    const expectedCoordinates = coordinateRecorder(expectedNoise);
    const actual = factory(actualNoise), expected = legacyNoiseSampler(expectedNoise);
    // Repeated, changed, returning and seam u values; include signed zero and
    // a subnormal-frequency witness against moving * 0.5 ahead of frequencyU.
    for (const u of [0, 0, -0, -0, 0.19, 0.19, 0.731, 0.19,
      1 - Number.EPSILON, 1, 0, -Number.EPSILON, Math.acos(0.4) / tau]) {
      for (const [frequencyU, frequencyV, offset] of [
        [90, 100, 17], [34, 38, 5], [7, 3.6, 41], [2.2, 0.6, 23],
        [48, 40, 631], [1, 1, 0], [3 * Number.MIN_VALUE, 1, 0],
      ]) {
        for (const v of [0.37, 0.38, 0.36]) {
          const args = [u, v, frequencyU, frequencyV, offset];
          assert.equal(actual(...args), expected(...args), 'Exact actual Simplex output for every factory call');
          assert.deepEqual(actualCoordinates.at(-1), expectedCoordinates.at(-1),
            'Preserve all three noise3d coordinates, signs and multiplication order');
          compared++;
        }
      }
    }
    assert.equal(actualCoordinates.length, expectedCoordinates.length, 'No cached noise samples');
  }
  return compared;
}

function assertLocalTrigCache(factory) {
  const originalCos = Math.cos, originalSin = Math.sin;
  let cosineCalls = 0, sineCalls = 0;
  const a = factory(makeNoise(4242)), b = factory(makeNoise(1));
  const check = (sampler, u, expectedCalls) => {
    sampler(u, 0.37, 48, 40, 631);
    sampler(u, 0.38, 20, 16, 733);
    sampler(u, 0.36, 7, 3.6, 41);
    assert.equal(cosineCalls, expectedCalls, 'One cosine per new last-u, independently per construction');
    assert.equal(sineCalls, expectedCalls, 'One sine per new last-u, independently per construction');
  };
  try {
    Math.cos = value => { cosineCalls++; return originalCos(value); };
    Math.sin = value => { sineCalls++; return originalSin(value); };
    check(a, 0.19, 1);
    check(a, 0.19, 1);
    check(b, 0.19, 2);
    check(a, 0.73, 3);
    check(b, 0.19, 3);
    check(a, 0.19, 4); // A last-u cache recomputes returning angles.
    check(a, 0, 5);
    check(a, -0, 6);
    check(a, 1, 7); // The seam is not wrapped or rounded.
    check(a, 0, 8);
  } finally {
    Math.cos = originalCos;
    Math.sin = originalSin;
  }
}

const terrainComparisons = assertTerrainParity(sampleHorizonTextureTerrain, createHorizonNoiseSampler);
const factoryComparisons = assertFactoryParity(createHorizonNoiseSampler);
assertLocalTrigCache(createHorizonNoiseSampler);
assert.throws(() => assertTerrainParity(legacyTerrain, createHorizonNoiseSampler), { code: 'ERR_ASSERTION' },
  'Negative control: removing zero-weight call elimination must fail the cost contract');
assert.throws(() => assertTerrainParity((noise, options, u, v) =>
  sampleHorizonTextureTerrain(noise, { ...options, grainAmp: options.grainAmp < 1e-7 ? 0 : options.grainAmp }, u, v),
createHorizonNoiseSampler), { code: 'ERR_ASSERTION' },
'Negative control: epsilon-skipping nonzero grain must fail exact calls or output');
assert.throws(() => assertLocalTrigCache(legacyNoiseSampler), { code: 'ERR_ASSERTION' },
  'Negative control: removing the last-u cache must fail trig counts');
assert.throws(() => assertFactoryParity(noise => (u, v, fu, fv, offset) => noise.noise3d(
  (Math.cos(u * tau) * 0.5) * fu + offset,
  (Math.sin(u * tau) * 0.5) * fu - offset * 0.7,
  v * fv + offset * 1.31,
)), { code: 'ERR_ASSERTION' },
'Negative control: pre-halving cached trig must fail original-coordinate arithmetic');

console.log(`horizonNoiseSampling: ${terrainComparisons} exact terrain/call comparisons, ${factoryComparisons} exact Simplex/coordinate comparisons, construction-local trig counts and four negative controls PASS`);
