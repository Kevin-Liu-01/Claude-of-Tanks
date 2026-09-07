import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { NoColorSpace, RepeatWrapping, SRGBColorSpace } from 'three';
import { makeIceLayer, mulberry32 } from './terrain.ts';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { resolveDeviceTier, texSize } from '../engine/quality.ts';
import { normalTextureFromHeight, tileableTorusNoise } from './proceduralTexture.ts';

// Genuine native Canvas2D is mandatory: path/gradient coverage cannot be
// proved by the pixel-upload-only stubs used by other CPU tests. npm ci installs
// the pinned rasterizer; an explicit bundled native module is also supported.
const { values } = parseArgs({ options: {
  'canvas-module': { type: 'string' }, 'out-dir': { type: 'string' },
} });
function resolveCanvasModule(explicitPath) {
  if (explicitPath !== undefined) {
    assert.ok(isAbsolute(explicitPath), '--canvas-module must be an absolute @napi-rs/canvas/index.js path');
    return explicitPath;
  }
  try { return createRequire(import.meta.url).resolve('@napi-rs/canvas'); }
  catch (cause) {
    throw new Error('Native @napi-rs/canvas is required: run npm ci, or pass '
      + '--canvas-module=<absolute @napi-rs/canvas/index.js>. No stub or skip is supported.', { cause });
  }
}
const canvasModule = resolveCanvasModule(values['canvas-module']);
const rasterizer = JSON.parse(readFileSync(join(dirname(canvasModule), 'package.json'), 'utf8'));
assert.equal(rasterizer.name, '@napi-rs/canvas', 'The rasterizer must be the genuine @napi-rs/canvas package');
const native = await import(pathToFileURL(canvasModule).href);
assert.equal(typeof native.createCanvas, 'function');
assert.equal(typeof native.ImageData, 'function');
if (values['out-dir']) {
  assert.ok(isAbsolute(values['out-dir']), '--out-dir must be absolute and new');
  mkdirSync(values['out-dir']);
}

const savedGlobals = new Map(['document', 'ImageData', 'window'].map(key => [key, globalThis[key]]));
const created = [];
const paintOps = new WeakMap();
globalThis.ImageData = native.ImageData;
globalThis.document = { createElement(tag) {
  assert.equal(tag, 'canvas');
  const canvas = native.createCanvas(1, 1);
  observePainting(canvas);
  created.push(canvas);
  return canvas;
} };

function observePainting(canvas) {
  // Observe calls, forwarding every operation to the real rasterizer. These
  // counters prove the authored path budget; the raster below proves coverage.
  const context = canvas.getContext('2d');
  const ops = { strokes: [], fills: 0 };
  paintOps.set(canvas, ops);
  let segments = 0;
  for (const method of ['beginPath', 'lineTo', 'stroke', 'fill']) {
    const original = context[method].bind(context);
    context[method] = (...args) => {
      if (method === 'beginPath') segments = 0;
      if (method === 'lineTo') segments++;
      if (method === 'stroke') ops.strokes.push({ segments, width: context.lineWidth });
      if (method === 'fill') ops.fills++;
      return original(...args);
    };
  }
}
function pixels(canvas) {
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
}
function hash(data) { return createHash('sha256').update(data).digest('hex'); }
function expectedRelief(seed, size) {
  const noise = new SimplexNoise({ random: mulberry32(seed) });
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const depth = tileableTorusNoise(noise, x / size, y / size, 1, 1, 9) * 0.6
      + tileableTorusNoise(noise, x / size, y / size, 2, 2, 41) * 0.4;
    height[y * size + x] = 0.5 + depth * 0.12;
  }
  const normal = normalTextureFromHeight(height, size, 0.8, 4);
  try { return pixels(normal.image); } finally { normal.dispose(); }
}
function inspectPigment(data, size) {
  let bright = 0, quiet = 0, soft = 0, min = 1, max = 0, sharpEdges = 0;
  const luminance = i => (data[i] * 0.3 + data[i + 1] * 0.45 + data[i + 2] * 0.25) / 255;
  for (let i = 0; i < data.length; i += 4) {
    const light = luminance(i);
    if (light > 0.72) bright++;
    if (light < 0.52) quiet++;
    if (light >= 0.52 && light <= 0.72) soft++;
    min = Math.min(min, light); max = Math.max(max, light);
    if ((i / 4) % size < size - 1 && Math.abs(luminance(i + 4) - light) > 0.1) sharpEdges++;
  }
  const area = size * size;
  return { bright: bright / area, quiet: quiet / area, soft: soft / area,
    sharpEdges: sharpEdges / area, min, max };
}
function assertPackedRgb(packed, pigment) {
  assert.equal(packed.length, pigment.length);
  let maxError = 0, maxTolerance = 0;
  for (let i = 0; i < packed.length; i += 4) {
    const alpha = packed[i + 3];
    assert.ok(alpha > 0, 'roughness packing must retain observable RGB');
    // Canvas stores 8-bit premultiplied channels. Half a stored-channel LSB
    // expands by 255/alpha; unpremultiplication adds at most half an RGB LSB.
    // Derive this per texel, rather than excusing all pixels by the lowest alpha.
    const tolerance = 0.5 * 255 / alpha + 0.5;
    maxTolerance = Math.max(maxTolerance, tolerance);
    for (let channel = 0; channel < 3; channel++) {
      const error = Math.abs(packed[i + channel] - pigment[i + channel]);
      assert.ok(error <= tolerance,
        `returned RGB diverges at texel ${i / 4}, channel ${channel}: ${error} > ${tolerance}`);
      maxError = Math.max(maxError, error);
    }
  }
  return { maxError, maxTolerance };
}
function assertIceTone(tone, label) {
  assert.ok(tone.bright > 0.01 && tone.bright < 0.05,
    `${label}: strong seams occupy 1–5%, not a dense white network`);
  assert.ok(tone.quiet > 0.88 && tone.soft > 0.015,
    `${label}: broad quiet ice and feathered transitions both survive`);
  assert.ok(tone.sharpEdges < 0.07 && tone.max - tone.min > 0.65, label);
}
function inspectNormals(data) {
  let minZ = 1, sumZ = 0, maxTilt = 0;
  for (let i = 0; i < data.length; i += 4) {
    const x = data[i] / 127.5 - 1, y = data[i + 1] / 127.5 - 1, z = data[i + 2] / 127.5 - 1;
    assert.ok(Number.isFinite(x + y + z) && Math.abs(Math.hypot(x, y, z) - 1) < 0.012);
    assert.equal(data[i + 3], 255);
    minZ = Math.min(minZ, z); sumZ += z;
    maxTilt = Math.max(maxTilt, Math.hypot(x, y));
  }
  return { minZ, meanZ: sumZ / (data.length / 4), maxTilt };
}
function captureLayer(seed) {
  const before = created.length;
  const layer = makeIceLayer(seed, 4);
  assert.equal(created.length - before, 3, 'one transient painter plus exactly two texture canvases');
  const size = texSize(256);
  assert.deepEqual(Object.keys(layer).sort(), ['albedo', 'normal']);
  for (const texture of Object.values(layer)) {
    assert.equal(texture.image.width, size); assert.equal(texture.image.height, size);
    assert.equal(texture.wrapS, RepeatWrapping); assert.equal(texture.wrapT, RepeatWrapping);
    assert.equal(texture.anisotropy, 4); assert.equal(texture.generateMipmaps, true);
  }
  assert.equal(layer.albedo.colorSpace, SRGBColorSpace);
  assert.equal(layer.normal.colorSpace, NoColorSpace);
  const result = { size, pigment: pixels(created[before]),
    packed: pixels(layer.albedo.image), normals: pixels(layer.normal.image),
    painter: created[before], ops: paintOps.get(created[before]) };
  layer.albedo.dispose(); layer.normal.dispose();
  return result;
}
function inspectLayer(seed, tier) {
  const first = captureLayer(seed), repeat = captureLayer(seed);
  const { size, pigment, packed, normals } = first;
  assert.deepEqual(pigment, repeat.pigment, 'native path/gradient rasterization is seeded');
  assert.deepEqual(packed, repeat.packed); assert.deepEqual(normals, repeat.normals);
  assert.equal(first.ops.fills, 90, 'ten broad drift fields at nine wrap offsets');
  assert.equal(first.ops.strokes.filter(op => op.segments === 6).length, 54,
    'exactly three main paths, two strokes each, at nine wrap offsets');
  const branches = first.ops.strokes.filter(op => op.segments === 2).length;
  assert.ok(branches <= 54 && branches % 18 === 0, 'at most one short child per main path');
  assert.equal(first.ops.strokes.length, 54 + branches, 'no uncounted recursive or fine scratch paths');
  assert.deepEqual(normals, expectedRelief(seed, size), 'painted cracks and snow cannot emboss the relief');
  const tone = inspectPigment(pigment, size), relief = inspectNormals(normals);
  const packedRgb = assertPackedRgb(packed, pigment), packedTone = inspectPigment(packed, size);
  assertIceTone(tone, 'painter');
  assertIceTone(packedTone, 'returned albedo RGB');
  const corrupted = new Uint8ClampedArray(packed);
  corrupted[0] = pigment[0] <= 127 ? 255 : 0;
  for (let i = 3; i < packed.length; i += 4) assert.equal(corrupted[i], packed[i]);
  assert.throws(() => assertPackedRgb(corrupted, pigment), /returned RGB diverges/,
    'RGB-only corruption must fail even with every roughness alpha byte retained');
  assert.ok(relief.minZ > 0.98 && relief.meanZ > 0.999 && relief.maxTilt > 0.03);
  let minRoughness = 255, maxRoughness = 0;
  for (let i = 3; i < packed.length; i += 4) {
    assert.ok(packed[i] >= 25 && packed[i] <= 210, 'roughness stays finite within the original packing range');
    minRoughness = Math.min(minRoughness, packed[i]); maxRoughness = Math.max(maxRoughness, packed[i]);
  }
  assert.ok(maxRoughness - minRoughness > 140, 'stress seams retain rough refrozen ice over glossy fields');
  if (values['out-dir']) {
    writeFileSync(join(values['out-dir'], `${tier}-${seed}-pigment.png`), first.painter.toBuffer('image/png'), { flag: 'wx' });
    const preview = native.createCanvas(size, size);
    const opaquePacked = new Uint8ClampedArray(packed);
    for (let i = 3; i < opaquePacked.length; i += 4) opaquePacked[i] = 255;
    preview.getContext('2d').putImageData(new native.ImageData(opaquePacked, size, size), 0, 0);
    writeFileSync(join(values['out-dir'], `${tier}-${seed}-packed-rgb.png`), preview.toBuffer('image/png'), { flag: 'wx' });
    preview.getContext('2d').putImageData(new native.ImageData(normals, size, size), 0, 0);
    writeFileSync(join(values['out-dir'], `${tier}-${seed}-normal.png`), preview.toBuffer('image/png'), { flag: 'wx' });
  }
  return { seed, tier, size, textureCount: 2, rgbaBaseBytes: packed.byteLength + normals.byteLength,
    stressPaths: 3, shortBranches: branches / 18,
    pigmentHash: hash(pigment), packedHash: hash(packed), normalHash: hash(normals),
    tone, packedTone, packedRgb, relief, minRoughness, maxRoughness };
}

try {
  const rows = [3003, 1337, 7719].map(seed => inspectLayer(seed, 'desktop'));
  assert.ok(rows.every(row => row.size === 256 && row.rgbaBaseBytes === 524288));
  assert.equal(new Set(rows.map(row => row.pigmentHash)).size, 3, 'different seeds produce different stress fields');
  globalThis.window = { location: { search: '?tier=mobile' },
    localStorage: { getItem() { return null; } } };
  assert.equal(resolveDeviceTier(), 'mobile');
  const mobile = [3003, 1337, 7719].map(seed => inspectLayer(seed, 'mobile'));
  assert.ok(mobile.every(row => row.size === 128 && row.rgbaBaseBytes === 131072));
  rows.push(...mobile);
  const receipt = { proof: 'actual Canvas2D rasterization and CPU texture payloads; no GPU or final-shader acceptance',
    consumers: ['winter', 'alpine', 'whiteout'], rasterizer: { name: rasterizer.name, version: rasterizer.version,
      module: canvasModule }, rows };
  if (values['out-dir']) writeFileSync(join(values['out-dir'], 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(receipt, null, 2));
  console.log('iceSurfaceDetail.selftest: PASS actual seeded ice atlas, sparse stress, smooth separate relief, unchanged two-texture budget');
} finally {
  for (const [key, value] of savedGlobals) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
}
