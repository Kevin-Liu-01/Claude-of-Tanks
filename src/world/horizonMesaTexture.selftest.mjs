import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { sampleHorizonTextureTerrain } from './maps/horizon.ts';
import { getMapConfig } from './maps/index.ts';

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Historical 3c3b6aae recipe. Keep every operation and noise invocation;
// only the explicit final argument permits an independently checked fade.
function historicalTerrain(sampleNoise, options, u, v,
  fineDetail = options.treeline > 0 ? 0 : 1) {
  const { banding, treeline, grainAmp, gullyAmp = 1 } = options;
  const belowTree = treeline > 0
    ? 1 - smoothstep(treeline * 0.85, treeline * 1.08, v) : 0;
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

function recordSample(sample, options, u, v, noise) {
  const calls = [];
  const result = sample((...args) => {
    const value = noise(...args);
    calls.push({ args, value });
    return value;
  }, options, u, v);
  return { result, calls };
}

const coherentNoise = (u, v, fu, fv, offset) =>
  Math.sin(Math.cos(u * Math.PI * 2) * fu * 0.5 + v * fv + offset * 1.31) * 0.85;
const fineNoise = (_u, _v, frequencyU) =>
  ({ 90: 0.8, 34: 0.6, 64: 0.5, 46: 1 })[frequencyU] ?? 0;
const titan = getMapConfig('titan_gorge');
assert.equal(titan.horizon.style, 'mesa');
assert.equal(titan.horizon.treeline, 0.03, 'Exercise the real tiny, nonzero Titan treeline');
const titanOptions = {
  banding: titan.horizon.banding ?? 0.16, snowline: titan.horizon.snowline ?? 2,
  treeline: titan.horizon.treeline, grainAmp: titan.horizon.grain ?? 1,
  gullyAmp: 0.14, mesaSurface: true,
};

let compared = 0;
for (const treeline of [0, 0.03, 0.35, 0.8]) {
  for (const banding of [0, 0.003, 0.18]) for (const gullyAmp of [undefined, 0, 0.14, 1]) {
    for (const u of [0, 0.19, 0.73, 1]) {
      for (const v of [-0.05, 0, treeline * 0.85, treeline, treeline * 1.08, 0.63, 1]) {
        const base = { ...titanOptions, treeline, banding, gullyAmp };
        const previous = recordSample(historicalTerrain, base, u, v, coherentNoise);
        for (const mesaSurface of [undefined, false, true]) {
          const options = { ...base, mesaSurface };
          const current = recordSample(sampleHorizonTextureTerrain, options, u, v, coherentNoise);
          assert.deepEqual(current.calls, previous.calls,
            'Fine grain/talus already ran: same ordered noise coordinates, values and total calls');
          assert.equal(current.calls.length, banding > 0.003 ? 9 : 7);
          assert.deepEqual(current.calls.map(call => call.args.slice(2)), [
            [90, 100, 17], [34, 38, 5], [9, 1.1, 77], [46, 2.6, 9],
            [31, 9.5, 118], [64, 46, 205], [7, treeline > 0 ? 3.6 : 11, 41],
            ...(banding > 0.003 ? [[2.2, 0.6, 23], [1.5, 9, 311]] : []),
          ], 'Do not hide a reordered or added noise evaluation behind equivalent output');
          const { luminance: _oldLuminance, ...oldFields } = previous.result;
          const { luminance, ...newFields } = current.result;
          assert.deepEqual(newFields, oldFields, 'Biome, ridge, segmentation and gully are unchanged');
          assert.ok(Number.isFinite(luminance) && luminance > 0 && luminance < 2,
            'Correction remains a bounded multiplicative terrain response');
          if (!mesaSurface || treeline === 0 || v <= treeline * 0.85) {
            assert.deepEqual(current.result, previous.result,
              'Non-mesa, bare terrain, and fully forested pixels retain the exact historical result');
          } else {
            const weight = smoothstep(treeline * 0.85, treeline * 1.08, v);
            assert.deepEqual(current.result,
              historicalTerrain(coherentNoise, options, u, v, 1 - (1 - weight)),
              'Only the three existing fine noise terms gain the altitude-local mesa mask');
          }
          compared++;
        }
      }
    }
  }
}

function assertTitanFineResponse(sample) {
  // Suppress unrelated strata/broad noise in this analytical attenuation test;
  // the full actual Titan recipe is independently compared above and below.
  const options = { ...titanOptions, banding: 0, grainAmp: 1, gullyAmp: 1 };
  let last = 1;
  for (let step = 0; step <= 128; step++) {
    const v = options.treeline * (0.85 + (1.08 - 0.85) * step / 128);
    const weight = smoothstep(options.treeline * 0.85, options.treeline * 1.08, v);
    const fine = 1 - (1 - weight);
    const expected = (1 + (0.8 * 0.05 + 0.6 * 0.06) * fine) * (1 + 0.5 * 0.045 * fine);
    const actual = sample(fineNoise, options, 0.19, v).luminance;
    assert.ok(Math.abs(actual - expected) < 1e-14,
      'Mesa grain and talus fade through the real treeline rather than a global veto');
    assert.ok(actual >= last - 1e-14 && actual - last < 0.002,
      'The supported smoothstep response is monotone and has no threshold jump');
    last = actual;
  }
  assert.ok(last > 1.09, 'Above the tiny treeline the existing fine texture must actually contribute');
  for (const v of [-0.1, 0, options.treeline * 0.5]) {
    assert.equal(sample(fineNoise, options, 0.19, v).luminance, 1,
      'No fine-grain spill into the fully forested base');
  }
  assert.equal(sample(fineNoise, options, 0.19, 1).luminance, last,
    'Fine response saturates rather than amplifying indefinitely with altitude');
}
assertTitanFineResponse(sampleHorizonTextureTerrain);
assert.throws(() => assertTitanFineResponse(historicalTerrain), { code: 'ERR_ASSERTION' },
  'Mutation control: the former global treeline veto must fail');
assert.throws(() => assertTitanFineResponse((noise, options, u, v) =>
  historicalTerrain(noise, options, u, v, 1)), { code: 'ERR_ASSERTION' },
'Mutation control: always-on grain must fail the lower forest/continuity checks');

// Exercise the actual material generator's option handoff, not a source-regex
// claim. An isolated test module stops before Canvas allocation at the called
// texture generator. It never creates fake pixels, a GL context, or live assets.
const wiringUrls = [false, true].map(mutated => new URL(
  `./maps/horizon.ts?selftest=mesa-options-${mutated ? 'missing' : 'actual'}`, import.meta.url).href);
const hooks = registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (!wiringUrls.includes(url)) return result;
  let source = String(result.source);
  const entry = '  const { banding, treeline } = options;';
  assert.equal(source.split(entry).length, 2, 'Unambiguous pre-Canvas texture boundary');
  source = source.replace(entry, `  throw { mesaTextureOptions: options };\n${entry}`);
  if (url === wiringUrls[1]) {
    const setting = "    mesaSurface: style === 'mesa',";
    assert.equal(source.split(setting).length, 2, 'Mutation targets the actual material option once');
    source = source.replace(setting, '');
  }
  return { ...result, source: `${source}\nexport { buildHorizonMaterialSteps as testMaterialSteps };\n` };
} });
try {
  const modules = await Promise.all(wiringUrls.map(url => import(url)));
  function assertMaterialWiring(module) {
    for (const style of ['mesa', 'rolling', 'alpine', 'escarpment']) {
      const generator = module.testMaterialSteps({
        noise: null, ...titanOptions, style, seed: 1337, mapId: titan.id,
        sun: [0, 1, 0], maxHeight: 650, retainedTextures: [],
      });
      let observed;
      assert.throws(() => generator.next(), error => {
        observed = error.mesaTextureOptions;
        return Boolean(observed);
      }, 'Actual material construction reaches its texture generator');
      assert.equal(observed.mesaSurface, style === 'mesa',
        'Production material wiring opts in only mesa terrain');
      assert.equal(observed.treeline, 0.03);
      assert.equal(observed.gullyAmp, style === 'alpine' ? 0.06 : style === 'mesa' ? 0.14 : 0);
      assert.equal(observed.coolRock, style === 'alpine');
    }
  }
  assertMaterialWiring(modules[0]);
  assert.throws(() => assertMaterialWiring(modules[1]), { code: 'ERR_ASSERTION' },
    'Mutation control: exported sampler fix cannot pass with missing production opt-in');
} finally {
  hooks.deregister();
}

console.log(`horizonMesaTexture: ${compared} exact historical/noise-order comparisons, continuous bounded Titan fine detail, actual material wiring and mutation controls PASS`);
