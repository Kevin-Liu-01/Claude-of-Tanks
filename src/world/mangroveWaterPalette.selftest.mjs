import { originalExitConfig } from '../../tools/road-authored-exit-fixture.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { NoColorSpace, RepeatWrapping, SRGBColorSpace } from 'three';
import { createHeightField, makeSeaLayer } from './terrain.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { resolveDeviceTier } from '../engine/quality.ts';
import { historicalShorelineConfig, historicalPaletteConfig } from './shorelineHistoryTestOracle.mjs';

// Real production imports and native Canvas2D only. This tests the returned
// packed pixels, including premultiplied backing-store quantization; it does
// not stand in for GPU upload, reflection, postprocessing or native art review.
const { values } = parseArgs({ options: { 'canvas-module': { type: 'string' } } });
function canvasPath(explicitPath) {
  if (explicitPath !== undefined) {
    assert.ok(isAbsolute(explicitPath), '--canvas-module must be an absolute native module path');
    return explicitPath;
  }
  try { return createRequire(import.meta.url).resolve('@napi-rs/canvas'); }
  catch (cause) {
    throw new Error('Native @napi-rs/canvas is required. Run npm ci or pass --canvas-module=<absolute index.js>; no stub/skip.', { cause });
  }
}
const modulePath = canvasPath(values['canvas-module']);
const packageInfo = JSON.parse(readFileSync(join(dirname(modulePath), 'package.json'), 'utf8'));
assert.equal(packageInfo.name, '@napi-rs/canvas');
const native = await import(pathToFileURL(modulePath).href);
const cfg = getMapConfig('mangrove'), oldTone = getMapConfig('delta').splat.mudTone;
// Frozen V34 pigment: independently bake the rejected dark candidate so the
// brightness gate cannot pass merely because cyan became equally dark ochre.
const v34Tone = (_h, s, l) => [.115, Math.min(1, s * .75), Math.min(1, l * .88)];
const oldCfg = { ...cfg, splat: { ...cfg.splat, mudTone: oldTone, iceSky: [.22, .42, .40] } };
const stringify = value => JSON.stringify(value, (_key, item) => typeof item === 'function' ? String(item) : item);
const hash = value => createHash('sha256').update(value).digest('hex');
// Snapshot before historical projection, not after: the test-only fixture
// must not mutate a current input while preparing an old receipt.
const currentInputs = MAP_IDS.map(id => stringify(getMapConfig(id)));
function verifyUnmutatedInputs(inputs) {
  assert.deepEqual(inputs, currentInputs, 'actual current map inputs remain unmutated through all bakes');
}
function verifyCurrentVerdantHorizon(config) {
  // User-approved return to 7997efb42's pastoral horizon, not the short-lived
  // 1e0b2608b original mountain wall. No terrain or palette input changed.
  assert.deepEqual(config.horizon, {
    baseHex: 0x4d6540, amp: 1.0, style: 'rolling', treeline: 0.94, treelineLayers: 2,
    forestHex: 0x33502e, rockHex: 0x77725f, haze: 0.95, grain: 0.7,
  }, 'current pastoral Verdant horizon remains exact before historical substitution');
}
const verdant = getMapConfig('verdant');
verifyCurrentVerdantHorizon(verdant);
const changedHorizon = { ...verdant, horizon: { ...verdant.horizon, treeline: 0 } };
assert.equal(stringify(historicalPaletteConfig(changedHorizon)), stringify(historicalPaletteConfig(verdant)),
  'negative control demonstrates historical projection alone would hide a current horizon mutation');
assert.throws(() => verifyCurrentVerdantHorizon(changedHorizon), /current pastoral Verdant horizon/);
// The original other29 receipt is
// b66d67a8425f3da8180017c3936c7e2fa9a0cfcfd6a7e8e48dedd3e2a4ea86e8.
// It is the authenticated pre-c8476fa77 other29
// configuration (f4854d513), NOT the introducing 2b2d14b39 source, whose
// actual digest is e0b4112aa40fc3411635e04638e334fbdc50af7251b11825ae52c5e245c4d779.
// Published deaf6bf112 changed wreck donor IDs, owned by wreckRoster.selftest,
// not water pigment. Omit ONLY that field from both sides of this receipt;
// wreck era/count/debris and every other property remain covered. The new
// digest was independently derived from frozen c4762727724e, whose raw replay
// still produced b66d above (maps tree f7f97155e28e09bf1b7afeaca34340450caf7086,
// history-helper blob cc0e5f36f6205e9237f79a129ac185a3a2dae407).
function paletteReceiptInput(config) {
  if (!config.props?.tankWrecks) return config;
  const { ids: _donorIds, ...tankWrecks } = config.props.tankWrecks;
  return { ...config, props: { ...config.props, tankWrecks } };
}
function historicalFoundryPaletteInput(config) {
  if (config.id !== 'foundry') return config;
  // Published 0823acd74e7bcf573e717f96f28ef5f1551dbef7 added only
  // sourcedPalette to Foundry (74cbf547936cfce0c60ad5883acdecec35331211
  // -> c3ad3042999d7241824ad9a4670fcbd73a5fb84a). The older palette receipt's
  // f4854d513/2b2d14b39 input (a991dc69e0b3f46cd23f0ab445e3acd2aa43e51f)
  // also had no such field. Its existing donor projection remains untouched.
  // Only the historical digest uses this view; the current value is guarded
  // separately, and all sibling properties survive in the original hash.
  const { sourcedPalette: _laterPalette, ...props } = config.props;
  return { ...config, props };
}
function historicalCropPaletteInput(config) {
  if (config.id !== 'autumn' && config.id !== 'delta') return config;
  // Published 3bfd72f9080cb3f0215ae8440edd040e163bf121 added only cropForm:
  // Autumn aaf7b14ca -> f05d9e1bd; Delta 3e9fbab55 -> 410c62153.
  // Guard today's values separately; omit only these later prop leaves from
  // the historical water receipt, preserving cropFields and every sibling.
  const { cropForm: _laterCrop, ...props } = config.props;
  return { ...config, props };
}
// Authenticated independently from Autumn Git blobs at 1beb0c780 / 17d999:
// f05d9e1bd16f4b1ccde15756189c5fc7ee2e3dc5 -> 4aacb9c5f4ab059da2662cde186bcaede19a99f2.
// Those complete configs differ only in vegetation.palettes. This static
// historical digest view retains native Node TypeScript-stripped function
// serialization, including parameter spacing; these strings are never executed.
// Runtime inputs and the original other29 golden remain unchanged.
const historicalAutumnPalettes = {
  "oak": {
    "texTone": "(h        , s        , l        ) => [clamp01(0.055 + (h - 0.22) * 0.25), clamp01(s * 1.02 + 0.10), clamp01(l * 1.02)]",
    "cardHue": 0.058,
    "cardSat": 0.52,
    "cardL0": 0.3,
    "canopy": {
      "hue": 0.06,
      "sat": 0.42,
      "l0": 0.27,
      "l1": 0.39
    },
    "jitterHue": 0.85
  },
  "birch": {
    "texTone": "(h        , s        , l        ) => [0.105, clamp01(s * 0.55 + 0.22), clamp01(l * 0.92 + 0.10)]",
    "cardHue": 0.105,
    "cardSat": 0.55,
    "cardL0": 0.42,
    "canopy": {
      "hue": 0.11,
      "sat": 0.5,
      "l0": 0.36,
      "l1": 0.52
    },
    "jitterHue": 0.6
  }
};
assert.equal(hash(stringify(historicalAutumnPalettes)),
  '31bdbf450402c2c0e54f8cbb8c45a14619c35bddb9d56acd10e2ef7d3e06973e',
  'authenticated predecessor Autumn palette serialization remains exact');
function verifyCurrentAutumnPalette(config) {
  const palettes=config.vegetation?.palettes;
  // Published 99ea0b24f adds only these two atlas selections to Autumn blob
  // 4aacb9c5f -> 537e8c57d. Guard them separately, preserving every original
  // color/function field and the immutable seasonal palette fingerprint.
  assert.equal(palettes?.birch?.birchLeaves,true,'current Autumn palette keeps the published birch leaf atlas');
  assert.equal(palettes?.aspen?.birchLeaves,true,'current Autumn palette keeps the published aspen leaf atlas');
  const {birchLeaves:_birchAtlas,...birch}=palettes.birch;
  const {birchLeaves:_aspenAtlas,...aspen}=palettes.aspen;
  assert.equal(hash(stringify({...palettes,birch,aspen})),
    'abb772abb6b3f67077b2a86d2cd7930a121b796fd6a6b2af9678f5dacdeb53b3',
    'current Autumn palette remains the exact published seasonal selection');
}
function historicalAutumnPaletteInput(config) {
  if (config.id !== 'autumn') return config;
  return { ...config, vegetation: { ...config.vegetation, palettes: historicalAutumnPalettes } };
}
function verifyHistoricalConfigs(resolve) {
  verifyCurrentAutumnPalette(resolve('autumn'));
  assert.equal(resolve('autumn').props.cropForm, 'harvest', 'current Autumn crop identity remains exact');
  assert.equal(resolve('delta').props.cropForm, 'wet-upright', 'current Delta crop identity remains exact');
  assert.equal(resolve('foundry').props.sourcedPalette, 'ironworks',
    'current Foundry palette remains the published ironworks selection');
  const unchangedMaps = [];
  for (const id of MAP_IDS) {
    const historical = historicalCropPaletteInput(historicalAutumnPaletteInput(historicalFoundryPaletteInput(historicalPaletteConfig(originalExitConfig(resolve(id))))));
    if (id !== 'mangrove') unchangedMaps.push([id, stringify(paletteReceiptInput(historical))]);
  }
  assert.equal(hash(JSON.stringify(unchangedMaps)),
    '99347e4fcf9a54d89ee07e150aa8583e154b26e454cad2120f1cd745edb68750',
    'other29 config digest retains original donor policy and authenticated historical Foundry/Autumn inputs');
  const historical = paletteReceiptInput(historicalShorelineConfig(resolve('mangrove')));
  assert.equal(hash(stringify({ ...historical, splat: { ...historical.splat, mudTone: null, iceSky: null } })),
    'ca35068e3e71850b4896251accef2daca22815445ebfb491cf42cd8412d78ede', 'original non-palette Mangrove digest');
}
verifyHistoricalConfigs(getMapConfig);
for (const id of ['frontier', 'alpine']) {
  const canonical = getMapConfig(id);
  const mutateFirst = fields => ({ ...canonical, terrain: { ...canonical.terrain,
    landforms: canonical.terrain.landforms.map((form, index) => index === 0 ? { ...form, ...fields } : form) } });
  for (const relief of [undefined, { ...canonical.terrain.landforms[0].relief, bendM: -999 }]) {
    assert.throws(() => verifyHistoricalConfigs(key => key === id ? mutateFirst({ relief }) : getMapConfig(key)),
      /current playable relief/, 'missing or changed live relief cannot hide behind historical projection');
  }
  assert.throws(() => verifyHistoricalConfigs(key => key === id ? mutateFirst({ height: -1 }) : getMapConfig(key)),
    /other29 config/, 'original landform anchors remain inside the immutable digest');
}
const badlands = getMapConfig('badlands');
for (const changed of [
  { ...badlands, terrain: { ...badlands.terrain, redrockCanyon: false } },
  { ...badlands, props: { ...badlands.props, tacticalBeats: badlands.props.tacticalBeats.map((beat, index) =>
    index === 0 ? { ...beat, x: beat.x + 1 } : beat) } },
]) assert.throws(() => verifyHistoricalConfigs(id => id === 'badlands' ? changed : getMapConfig(id)),
  /current Badlands authoring/, 'current canyon authoring cannot disappear behind its historical projection');
for (const changed of [
  { ...badlands, splat: { ...badlands.splat, microAmp: -1 } },
  { ...badlands, terrain: { ...badlands.terrain, village: { ...badlands.terrain.village, cx: -1 } } },
  { ...badlands, props: { ...badlands.props, rocks: badlands.props.rocks + 1 } },
]) assert.throws(() => verifyHistoricalConfigs(id => id === 'badlands' ? changed : getMapConfig(id)),
  /other29 config/, 'unprojected Badlands siblings retain the immutable full-config guard');
for (const id of ['autumn', 'delta']) {
  const original = getMapConfig(id);
  for (const cropForm of [undefined, 'wrong-crop']) {
    assert.throws(() => verifyHistoricalConfigs(key => key === id
      ? { ...original, props: { ...original.props, cropForm } } : getMapConfig(key)),
    /current .* crop identity/, 'missing or changed crop identity cannot hide behind historical projection');
  }
  assert.throws(() => verifyHistoricalConfigs(key => key === id
    ? { ...original, props: { ...original.props, cropFields: original.props.cropFields + 1 } } : getMapConfig(key)),
  /other29 config/, 'crop count remains protected by the original immutable digest');
}
const autumn = getMapConfig('autumn');
for(const species of ['birch','aspen'])for(const birchLeaves of [undefined,false,'enabled']){
  const changed={...autumn,vegetation:{...autumn.vegetation,palettes:{...autumn.vegetation.palettes,
    [species]:{...autumn.vegetation.palettes[species],birchLeaves}}}};
  assert.throws(()=>verifyHistoricalConfigs(id=>id==='autumn'?changed:getMapConfig(id)),/current Autumn palette/,
    'historical color projection cannot hide missing or corrupt current atlas selections');
}
const changedAutumnPalettes = { ...autumn.vegetation.palettes,
  oak: { ...autumn.vegetation.palettes.oak, cardSat: 0.9 } };
assert.equal(stringify(historicalAutumnPaletteInput({ ...autumn,
  vegetation: { ...autumn.vegetation, palettes: changedAutumnPalettes } })),
stringify(historicalAutumnPaletteInput(autumn)),
'negative control demonstrates the historical view alone would conceal current Autumn palette corruption');
for (const palettes of [undefined, changedAutumnPalettes, {
  ...autumn.vegetation.palettes,
  oak: { ...autumn.vegetation.palettes.oak, texTone: () => [0, 0, 0] },
}]) assert.throws(() => verifyHistoricalConfigs(id => id === 'autumn'
  ? { ...autumn, vegetation: { ...autumn.vegetation, palettes } } : getMapConfig(id)),
/current Autumn palette/, 'missing, numeric and functional palette changes cannot hide behind historical projection');
for (const changed of [
  { ...autumn, vegetation: { ...autumn.vegetation, grassTexTone: () => [0, 0, 0] } },
  { ...autumn, terrain: { ...autumn.terrain, hillScale: -1 } },
]) assert.throws(() => verifyHistoricalConfigs(id => id === 'autumn' ? changed : getMapConfig(id)),
/other29 config/, 'non-palette Autumn siblings remain inside the original immutable digest');
const foundry = getMapConfig('foundry');
for (const sourcedPalette of [undefined, 'wrong-palette']) {
  assert.throws(() => verifyHistoricalConfigs(id => id === 'foundry'
    ? { ...foundry, props: { ...foundry.props, sourcedPalette } } : getMapConfig(id)),
  /current Foundry palette/, 'historical projection cannot hide a missing or changed current palette');
}
assert.throws(() => verifyHistoricalConfigs(id => id === 'foundry'
  ? { ...foundry, props: { ...foundry.props, plan: foundry.props.plan.slice(1) } } : getMapConfig(id)),
/other29 config/, 'unrelated Foundry plan changes still fail the immutable digest');
verifyUnmutatedInputs(MAP_IDS.map(id => stringify(getMapConfig(id))));
assert.throws(() => verifyHistoricalConfigs(id => id === 'verdant'
  ? { ...getMapConfig(id), terrain: { ...getMapConfig(id).terrain, hillScale: -1 } } : getMapConfig(id)), /other29 config/);
assert.throws(() => verifyHistoricalConfigs(id => id === 'mangrove'
  ? { ...cfg, terrain: { ...cfg.terrain, hillScale: -1 } } : getMapConfig(id)), /non-palette Mangrove/);
function withWreckFields(config, fields) {
  return { ...config, props: { ...config.props, tankWrecks: { ...config.props.tankWrecks, ...fields } } };
}
verifyHistoricalConfigs(id => withWreckFields(getMapConfig(id), { ids: ['different-donor'] }));
for (const id of ['verdant', 'mangrove']) {
  const original = getMapConfig(id);
  for (const changed of [
    withWreckFields(original, { count: original.props.tankWrecks.count + 1 }),
    withWreckFields(original, { era: 'different-era' }),
    withWreckFields(original, { debris: !original.props.tankWrecks.debris }),
    { ...original, props: { ...original.props, rocks: original.props.rocks + 1 } },
    { ...original, splat: { ...original.splat, microAmp: -1 } },
  ]) assert.throws(() => verifyHistoricalConfigs(key => key === id ? changed : getMapConfig(key)),
    /other29 config|non-palette Mangrove/, 'the narrow donor exclusion cannot hide a sibling-property mutation');
}
const nonPalette = config => stringify({ ...config, splat: { ...config.splat, mudTone: null, iceSky: null } });
assert.equal(nonPalette(oldCfg), nonPalette(cfg), 'current palette A/B differs in exactly the two permitted fields');
assert.notEqual(nonPalette(withWreckFields(oldCfg, { ids: ['different-donor'] })), nonPalette(cfg),
  'current palette A/B still compares every non-palette field, including donor IDs');
const mutation = currentInputs.slice(); mutation[0] += 'corrupt';
assert.throws(() => verifyUnmutatedInputs(mutation), /remain unmutated/);
assert.deepEqual(cfg.splat.iceSky, [.18, .19, .145]);
assert.deepEqual(cfg.splat.mudTone(.51, .3, .2), [.115, .3 * .75, .2 * 1.8]);

const originals = new Map(['document', 'ImageData', 'window'].map(key => [key, globalThis[key]]));
const uploads = new WeakMap();
let canvasCount = 0;
globalThis.ImageData = native.ImageData;
globalThis.document = { createElement(tag) {
  assert.equal(tag, 'canvas'); canvasCount++;
  const canvas = native.createCanvas(1, 1), context = canvas.getContext('2d');
  const put = context.putImageData.bind(context);
  context.putImageData = (image, ...args) => {
    uploads.set(canvas, image.data.slice());
    return put(image, ...args);
  };
  return canvas;
} };
function pixels(texture) {
  const canvas = texture.image;
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
}
function readbackAgreement(packed, uploaded) {
  for (let i = 0; i < packed.length; i += 4) {
    assert.equal(packed[i + 3], uploaded[i + 3], 'packed roughness survives native readback exactly');
    // A half-LSB premultiplication error becomes 255/(2*alpha) RGB units;
    // allow one final unpremultiplication/output rounding unit, not a fixed
    // tolerance that could hide wholesale RGB corruption at opaque pixels.
    const tolerance = 255 / (2 * packed[i + 3]) + 1;
    for (let channel = 0; channel < 3; channel++) {
      assert.ok(Math.abs(packed[i + channel] - uploaded[i + channel]) <= tolerance,
        'returned RGB agrees with actual uploaded pigment at its own alpha precision');
    }
  }
}
function channels(data) {
  const sums = [0, 0, 0];
  let min = 255, max = 0;
  for (let i = 0; i < data.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) sums[channel] += data[i + channel];
    min = Math.min(min, data[i]); max = Math.max(max, data[i]);
  }
  return { rgb: sums.map(sum => sum / (data.length / 4)), redRange: max - min };
}
function comparePigment(before, after) {
  let changed = 0;
  for (let i = 0; i < after.length; i += 4) {
    assert.equal(after[i + 3], before[i + 3], 'palette never alters M roughness');
    if (after[i] !== before[i] || after[i + 1] !== before[i + 1] || after[i + 2] !== before[i + 2]) changed++;
  }
  assert.ok(changed > after.length / 4 * .95, 'water actually leaves the old blue-green pigment');
  const old = channels(before), current = channels(after);
  assert.ok(old.rgb[2] > old.rgb[0] * 1.2, 'negative control is the actual inherited cyan palette');
  assert.ok(current.rgb[0] > current.rgb[2] * 1.2 && current.rgb[1] > current.rgb[2] * 1.1,
    'returned native water pigment reads restrained ochre/olive, not unchanged cyan');
  assert.ok(current.redRange > 8, 'existing swell/chop variation survives the tone transform');
  return current;
}
function checkSedimentRange(data) {
  const { rgb } = channels(data);
  // Returned sRGB pigment, before the shader's depth tint: retain a middle-
  // dark olive/ochre contribution, neither V34's near-black nor pale foam.
  for (const [channel, low, high] of [[0, 90, 125], [1, 75, 110], [2, 55, 90]]) {
    assert.ok(rgb[channel] >= low && rgb[channel] <= high, 'sediment RGB mean is in the authored diffuse range');
  }
  for (let i = 0; i < data.length; i += 4) {
    assert.ok(Math.min(data[i], data[i + 1], data[i + 2]) > 0
      && Math.max(data[i], data[i + 1], data[i + 2]) < 255, 'sediment RGB has no clipped channels');
  }
}
function bakeCandidate(seed) {
  const lightness = { min: Infinity, max: -Infinity };
  const layer = makeSeaLayer(seed, 4, (h, s, l) => {
    const toned = cfg.splat.mudTone(h, s, l);
    assert.equal(toned[2], l * 1.8, 'actual production inputs never trigger the lightness clamp');
    lightness.min = Math.min(lightness.min, toned[2]);
    lightness.max = Math.max(lightness.max, toned[2]);
    return toned;
  });
  // makeSeaLayer L is .085–.235 before its first 8-bit quantization. Allow
  // that half-channel quantization step, not an arbitrary clipping margin.
  assert.ok(lightness.min >= (.085 - .5 / 255) * 1.8);
  assert.ok(lightness.max <= (.235 + .5 / 255) * 1.8);
  return { layer, lightness };
}
function checkTexture(texture, size, colorSpace) {
  assert.equal(texture.isCanvasTexture, true);
  assert.equal(texture.image.width, size); assert.equal(texture.image.height, size);
  assert.equal(texture.colorSpace, colorSpace);
  assert.equal(texture.wrapS, RepeatWrapping); assert.equal(texture.wrapT, RepeatWrapping);
  assert.equal(texture.anisotropy, 4); assert.equal(texture.generateMipmaps, true);
}
function checkLayer(seed, size) {
  const countBefore = canvasCount;
  const before = makeSeaLayer(seed, 4, oldTone), dark = makeSeaLayer(seed, 4, v34Tone);
  const { layer: current, lightness } = bakeCandidate(seed);
  try {
    assert.equal(canvasCount - countBefore, 6, 'three independent controls each create exactly two existing textures');
    assert.deepEqual(Object.keys(current).sort(), ['albedo', 'normal']);
    checkTexture(current.albedo, size, SRGBColorSpace); checkTexture(current.normal, size, NoColorSpace);
    assert.deepEqual(pixels(current.normal), pixels(before.normal), 'all returned M normal bytes are exact');
    assert.deepEqual(pixels(current.normal), pixels(dark.normal), 'V34 wave normals remain byte-identical');
    const oldPigment = pixels(before.albedo), darkPigment = pixels(dark.albedo), pigment = pixels(current.albedo);
    for (let i = 3; i < pigment.length; i += 4) assert.equal(pigment[i], darkPigment[i], 'V34 roughness remains byte-identical');
    readbackAgreement(pigment, uploads.get(current.albedo.image));
    const tone = comparePigment(oldPigment, pigment);
    checkSedimentRange(pigment);
    assert.throws(() => checkSedimentRange(darkPigment), /authored diffuse range/);
    const corrupt = pigment.slice(); corrupt[0] = 255;
    assert.throws(() => readbackAgreement(corrupt, uploads.get(current.albedo.image)), /returned RGB/);
    assert.throws(() => checkSedimentRange(corrupt), /clipped channels/);
    console.log(JSON.stringify({ seed, size, textureCount: 2,
      baseRgbaBytes: pigment.byteLength + pixels(current.normal).byteLength,
      v34RgbMean: channels(darkPigment).rgb.map(value => +value.toFixed(3)),
      rgbMean: tone.rgb.map(value => +value.toFixed(3)), redRange: tone.redRange, lightness,
      albedoHash: hash(pigment), normalHash: hash(pixels(current.normal)) }));
  } finally {
    for (const layer of [before, dark, current]) { layer.albedo.dispose(); layer.normal.dispose(); }
  }
}
function checkPhysics(seed) {
  const old = createHeightField(seed, oldCfg), current = createHeightField(seed, cfg);
  for (let z = -480; z <= 480; z += 32) for (let x = -480; x <= 480; x += 32) {
    assert.equal(current.getHeightAt(x, z), old.getHeightAt(x, z));
    assert.deepEqual(current.getNormalAt(x, z), old.getNormalAt(x, z));
    assert.equal(current.getWaterMaskAt(x, z), old.getWaterMaskAt(x, z));
    assert.equal(current.getGroundType(x, z), old.getGroundType(x, z));
    assert.equal(current._noVeg(x, z), old._noVeg(x, z));
  }
}
try {
  for (const seed of [3003, 1337, 2002]) checkLayer(seed, 256);
  for (const seed of [1337, 2049, 4093]) checkPhysics(seed);
  globalThis.window = { location: { search: '?tier=mobile' }, localStorage: { getItem: () => null } };
  assert.equal(resolveDeviceTier(), 'mobile');
  for (const seed of [3003, 1337, 2002]) checkLayer(seed, 128);
  verifyUnmutatedInputs(MAP_IDS.map(id => stringify(getMapConfig(id))));
  console.log(`mangroveWaterPalette.selftest: PASS six native sea bakes (${packageInfo.name}@${packageInfo.version}), exact alpha/normals/physics/resources, original other29 donor policy and independently guarded historical Foundry/Autumn inputs`);
} finally {
  for (const [key, value] of originals) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
}
