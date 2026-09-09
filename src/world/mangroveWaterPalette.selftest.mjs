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
  // Exact published 1e0b2608b input, source blob ff51870b56b69c5f7bd220cd7e8bd90c917f0f1f.
  assert.deepEqual(config.horizon, {
    baseHex: 0x38542c, amp: 1.0, style: 'rolling', treeline: 0,
  }, 'current restored Verdant horizon remains exact before historical substitution');
}
const verdant = getMapConfig('verdant');
verifyCurrentVerdantHorizon(verdant);
const changedHorizon = { ...verdant, horizon: { ...verdant.horizon, treeline: 0.94 } };
assert.equal(stringify(historicalPaletteConfig(changedHorizon)), stringify(historicalPaletteConfig(verdant)),
  'negative control demonstrates historical projection alone would hide a current horizon mutation');
assert.throws(() => verifyCurrentVerdantHorizon(changedHorizon), /current restored Verdant horizon/);
// The original b66d receipt is the authenticated pre-c8476fa77 other29
// configuration (f4854d513), NOT the introducing 2b2d14b39 source, whose
// actual digest is e0b4112aa40fc3411635e04638e334fbdc50af7251b11825ae52c5e245c4d779.
// Preserve the original receipt unchanged with its exact historical inputs;
// later Reservoir/Longleaf/Polders/Oasis authoring and Verdant's restored
// horizon are not palette changes.
function verifyHistoricalConfigs(resolve) {
  const unchangedMaps = [];
  for (const id of MAP_IDS) {
    if (id !== 'mangrove') unchangedMaps.push([id, stringify(historicalPaletteConfig(resolve(id)))]);
  }
  assert.equal(hash(JSON.stringify(unchangedMaps)),
    'b66d67a8425f3da8180017c3936c7e2fa9a0cfcfd6a7e8e48dedd3e2a4ea86e8', 'original other29 config digest');
  const historical = historicalShorelineConfig(resolve('mangrove'));
  assert.equal(hash(stringify({ ...historical, splat: { ...historical.splat, mudTone: null, iceSky: null } })),
    'ca35068e3e71850b4896251accef2daca22815445ebfb491cf42cd8412d78ede', 'original non-palette Mangrove digest');
}
verifyHistoricalConfigs(getMapConfig);
verifyUnmutatedInputs(MAP_IDS.map(id => stringify(getMapConfig(id))));
assert.throws(() => verifyHistoricalConfigs(id => id === 'verdant'
  ? { ...getMapConfig(id), terrain: { ...getMapConfig(id).terrain, hillScale: -1 } } : getMapConfig(id)), /other29 config/);
assert.throws(() => verifyHistoricalConfigs(id => id === 'mangrove'
  ? { ...cfg, terrain: { ...cfg.terrain, hillScale: -1 } } : getMapConfig(id)), /non-palette Mangrove/);
const nonPalette = config => stringify({ ...config, splat: { ...config.splat, mudTone: null, iceSky: null } });
assert.equal(nonPalette(oldCfg), nonPalette(cfg), 'current palette A/B differs in exactly the two permitted fields');
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
  console.log(`mangroveWaterPalette.selftest: PASS six native sea bakes (${packageInfo.name}@${packageInfo.version}), exact alpha/normals/physics/resources, untouched other29 configs`);
} finally {
  for (const [key, value] of originals) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
}
