import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import * as THREE from 'three';
import { getDeviceTier, resolveDeviceTier, texSize } from '../engine/quality.ts';
import { createHorizonDetailAtlas, HORIZON_DETAIL_ATLAS_VARIANTS } from './horizonDetailAtlas.ts';

const { values } = parseArgs({ options: {
  'canvas-module': { type: 'string' }, 'out-dir': { type: 'string' },
} });
const modulePath = values['canvas-module'] ?? createRequire(import.meta.url).resolve('@napi-rs/canvas');
assert.ok(isAbsolute(modulePath), 'native canvas module path must be absolute');
const packageInfo = JSON.parse(readFileSync(join(dirname(modulePath), 'package.json'), 'utf8'));
assert.equal(packageInfo.name, '@napi-rs/canvas', 'actual native Canvas2D is mandatory; no pixel-upload stub');
const native = await import(pathToFileURL(modulePath).href);
assert.equal(typeof native.createCanvas, 'function');
if (values['out-dir']) {
  assert.ok(isAbsolute(values['out-dir']));
  mkdirSync(values['out-dir']);
}
const savedGlobals = new Map(['document', 'window'].map(key => [key, globalThis[key]]));
globalThis.document = { createElement(tag) {
  assert.equal(tag, 'canvas');
  return native.createCanvas(1, 1);
} };
const kinds = ['woodland', 'conifer', 'scrub', 'rock', 'snow', 'mesa'];
const hash = data => createHash('sha256').update(data).digest('hex');
const pixels = image => image.getContext('2d').getImageData(0, 0, image.width, image.height).data;
const bandPixels = (data, width, height, variant) => {
  const start = (3 - variant) * height / 4 * width * 4;
  return data.subarray(start, start + height / 4 * width * 4);
};

// Native Canvas2D 0.1.100 seed4242 receipts from the accepted atlas foundation.
// A woodland repair must not redraw scrub, conifers, rocks, snow or mesas.
const unchangedFamilyHashes = {
  desktop: {
    conifer: 'b65ea388c74c030d1b97f9c3ee2876e3f57084381720ab0850a7bcbd0b9c7205',
    scrub: '2cff2805613fe2dcd3994093e1ffa98c5d05c6181bab971be818c4f03a513c1b',
    rock: '511ba49122d2bfba6828551f9b24a3b84fef19183639e0cbd1e2319e05ab429a',
    snow: '9ee001e940b980951a6e2ff21c1abfba6e1e9494f97f49da7a6867c8e77ae343',
    mesa: 'f4a4f086a1b2de1aea756c62232f741cd62228c8c90aee77d1af7c0234dfeaeb',
  },
  mobile: {
    conifer: '8202b8351d75d778ce633f63cf70458c73f847e3293e2b48aa113fde382627b4',
    scrub: '0b60315e25037dce34c378d340cf30c581e64c9173005b03936f26b0c4dfdbe8',
    rock: '656d0cbc8f77b536f4c18f434754eec4075f5cc841a35b1c35f6d0bc440a2010',
    snow: '9241c8fd245a722630884ce8194c02d9ca1767da701ec2b5af4f6a1005e77d4e',
    mesa: '5c7b995998f43b75e38c343c1c0950c61ab79b1201f68c337f93130543d89406',
  },
};

function inspectWoodlandUnderCanopy(data, width, height, label) {
  const scale = height / 64;
  const y = Math.round(height - 10 * scale);
  const solid = x => data[(y * width + x) * 4 + 3] >= 97;
  let count = 0, narrowSupports = 0;
  for (let x = 0; x < width; x++) {
    if (!solid(x)) continue;
    count++;
    if (solid((x + width - 1) % width)) continue;
    let run = 1;
    while (run < width && solid((x + run) % width)) run++;
    if (run <= Math.ceil(7 * scale)) narrowSupports++;
  }
  assert.ok(count / width > 0.08 && count / width < 0.45,
    `${label}: open under-canopy gaps around supported trunks, not a filled boulder base`);
  assert.ok(narrowSupports >= 12, `${label}: many independent slender connected trunks`);
  return { underCanopyCoverage: count / width, narrowSupports };
}

function inspectWoodlandLayering(data, width, height, label) {
  const scale = height / 64;
  const start = Math.round(height - 22 * scale), end = Math.round(height - 16 * scale);
  const masses = new Float64Array(12);
  for (let y = start; y < end; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] >= 97) masses[Math.floor(x * masses.length / width)]++;
    }
  }
  const total = masses.reduce((sum, value) => sum + value, 0);
  const coverage = total / (width * (end - start));
  const range = (Math.max(...masses) - Math.min(...masses)) / (width / masses.length * (end - start));
  assert.ok(coverage > 0.45 && coverage < 0.90,
    `${label}: overlapping lower-canopy mass, not a sparse picket row or filled hedge`);
  assert.ok(range > 0.25, `${label}: irregular clustered canopy density, not a uniform strip`);
  return { lowerCanopyCoverage: coverage, canopyDensityRange: range };
}

function inspectBand(data, width, height, label) {
  const scale = height / 64;
  const gutter = Math.round(4 * scale);
  const root = height - gutter - 1;
  const solid = index => data[index * 4 + 3] >= 97;
  let opaqueCount = 0, sum = 0, squared = 0, detailCount = 0;
  const values = new Set();
  const top = new Int16Array(width).fill(root);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      assert.equal(data[i], data[i + 1], `${label}: no biome-specific green pigment`);
      assert.equal(data[i], data[i + 2], `${label}: neutral blue channel`);
      if (y < gutter || y >= height - gutter) assert.ok(data[i + 3] <= 8,
        `${label}: invisible sub-cutoff mip-safe band gutters`);
      if (x === 0) assert.deepEqual(data.subarray(i, i + 4),
        data.subarray(i + (width - 1) * 4, i + width * 4), `${label}: periodic seam`);
      if (data[i + 3] < 40) assert.ok(data[i] >= 210 && data[i] <= 230,
        `${label}: neutral flood survives premultiplied canvas storage`);
      if (solid(y * width + x)) {
        opaqueCount++;
        top[x] = Math.min(top[x], y);
      }
      if (data[i + 3] === 255 && y > gutter + 3 * scale && y < root - 4 * scale) {
        values.add(data[i]); sum += data[i]; squared += data[i] ** 2; detailCount++;
      }
    }
  }
  assert.ok(opaqueCount > width * height * 0.22 && opaqueCount < width * height * 0.85,
    `${label}: meaningful irregular silhouette, not a solid rectangle or empty texture`);
  assert.ok(detailCount > width * height * 0.12, `${label}: substantive interior surface`);
  const mean = sum / detailCount;
  const deviation = Math.sqrt(squared / detailCount - mean ** 2);
  assert.ok(values.size >= 16 && deviation > 3, `${label}: local surface shading, not flat fill`);
  assert.ok(mean >= 200 && mean <= 240, `${label}: exposed pigment remains bright enough for map tint`);
  assert.ok(Math.max(...top) - Math.min(...top) >= 7 * scale,
    `${label}: nonuniform stand/shelf heights`);

  // Flood from the opaque buried root using four-neighbour connectivity and
  // the actual alpha-test threshold. Every visible pixel must be attached.
  const visited = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let head = 0, tail = 0;
  for (let x = 0; x < width; x++) {
    const i = root * width + x;
    assert.ok(solid(i), `${label}: entire buried root is attached`);
    visited[i] = 1; queue[tail++] = i;
  }
  while (head < tail) {
    const i = queue[head++], x = i % width, y = Math.floor(i / width);
    const neighbours = [y * width + (x + 1) % width,
      y * width + (x + width - 1) % width, i - width, i + width];
    for (const j of neighbours) {
      if (j < 0 || j >= visited.length || visited[j] || !solid(j)) continue;
      visited[j] = 1; queue[tail++] = j;
    }
  }
  assert.equal(tail, opaqueCount, `${label}: no detached floaters or isolated needles`);
  return { coverage: opaqueCount / (width * height), mean, deviation,
    surfaceTones: values.size, silhouetteRange: Math.max(...top) - Math.min(...top), hash: hash(data) };
}

function inspectAtlas(kind, seed, tier, secondaryKind) {
  const texture = createHorizonDetailAtlas(kind, seed, secondaryKind);
  const image = texture.image;
  const data = pixels(image);
  try {
    assert.equal(image.width, texSize(384));
    assert.equal(image.height, texSize(256));
    assert.equal(image.width * image.height, texSize(768) * texSize(128), 'unchanged previous atlas texel area');
    assert.equal(texture.wrapS, THREE.RepeatWrapping);
    assert.equal(texture.wrapT, THREE.ClampToEdgeWrapping);
    assert.equal(texture.anisotropy, 2);
    assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
    assert.equal(texture.generateMipmaps, true);
    const bands = Array.from({ length: 4 }, (_, variant) => {
      const band = bandPixels(data, image.width, image.height, variant);
      const label = `${tier}/${kind}${secondaryKind ? `+${secondaryKind}` : ''}/${variant}`;
      const result = inspectBand(band, image.width, image.height / 4, label);
      const family = variant >= 2 && secondaryKind ? secondaryKind : kind;
      return family === 'woodland' ? { ...result,
        ...inspectWoodlandUnderCanopy(band, image.width, image.height / 4, label),
        ...inspectWoodlandLayering(band, image.width, image.height / 4, label) } : result;
    });
    assert.equal(new Set(bands.map(band => band.hash)).size, 4, 'four independently painted variants');
    if (values['out-dir']) writeFileSync(join(values['out-dir'],
      `${tier}-${kind}${secondaryKind ? `-${secondaryKind}` : ''}-${seed}.png`), image.toBuffer('image/png'), { flag: 'wx' });
    return { kind, secondaryKind, seed, tier, width: image.width, height: image.height,
      rgbaBytes: data.length, hash: hash(data), bands, data: data.slice() };
  } finally {
    let disposed = 0;
    texture.addEventListener('dispose', () => disposed++);
    texture.dispose();
    assert.equal(disposed, 1, 'caller owns and can dispose the single atlas texture');
  }
}

const rows = [];
try {
  assert.equal(HORIZON_DETAIL_ATLAS_VARIANTS, 4);
  for (const tier of ['desktop', 'mobile']) {
    globalThis.window = { location: { search: `?tier=${tier}` }, localStorage: { getItem() { return null; } } };
    // The production tier is intentionally immutable after first resolution.
    // Exercise the desktop default, then resolve the constrained tier once.
    assert.equal(tier === 'mobile' ? resolveDeviceTier() : getDeviceTier(), tier);
    const batch = kinds.map(kind => inspectAtlas(kind, 4242, tier));
    assert.equal(new Set(batch.map(row => row.hash)).size, kinds.length, 'all six families rasterize differently');
    const expectedBytes = tier === 'desktop' ? 393216 : 98304;
    assert.ok(batch.every(row => row.rgbaBytes === expectedBytes));
    for (const row of batch) {
      if (row.kind !== 'woodland') assert.equal(row.hash, unchangedFamilyHashes[tier][row.kind],
        `${tier}/${row.kind}: exact unchanged non-woodland native raster`);
      const repeated = createHorizonDetailAtlas(row.kind, row.seed);
      const changed = createHorizonDetailAtlas(row.kind, row.seed + 1);
      try {
        assert.equal(hash(pixels(repeated.image)), row.hash, `${row.kind}: exact seeded raster determinism`);
        assert.notEqual(hash(pixels(changed.image)), row.hash, `${row.kind}: genuinely different seed`);
      } finally { repeated.dispose(); changed.dispose(); }
    }
    const mixed = inspectAtlas('conifer', 4242, tier, 'snow');
    for (let band = 0; band < 4; band++) {
      const original = batch.find(row => row.kind === (band < 2 ? 'conifer' : 'snow'));
      assert.equal(mixed.bands[band].hash, original.bands[band].hash,
        'mixed primary/secondary rows preserve exact family artwork and UV band ownership');
    }
    rows.push(...batch, mixed);
  }
  // Reject broken evidence, not just the happy path.
  const sample = rows[0];
  const source = bandPixels(sample.data, sample.width, sample.height, 0);
  const flat = source.slice();
  for (let i = 0; i < flat.length; i += 4) if (flat[i + 3] >= 40) flat[i] = flat[i + 1] = flat[i + 2] = 220;
  assert.throws(() => inspectBand(flat, sample.width, sample.height / 4, 'flat mutation'), /surface shading/);
  const brokenSeam = source.slice();
  brokenSeam[(20 * sample.width) * 4 + 3] ^= 255;
  assert.throws(() => inspectBand(brokenSeam, sample.width, sample.height / 4, 'seam mutation'), /periodic seam/);
  const detached = source.slice();
  const lonely = (5 * sample.width + 190) * 4;
  detached[lonely] = detached[lonely + 1] = detached[lonely + 2] = 220;
  detached[lonely + 3] = 255;
  assert.throws(() => inspectBand(detached, sample.width, sample.height / 4, 'floater mutation'), /detached floaters/);
  const solidBase = source.slice();
  const supportY = sample.height / 4 - 10;
  for (let x = 0; x < sample.width; x++) solidBase[(supportY * sample.width + x) * 4 + 3] = 255;
  assert.throws(() => inspectWoodlandUnderCanopy(solidBase, sample.width, sample.height / 4,
    'old broad-base mutation'), /open under-canopy gaps/);
  const missingTrunks = source.slice();
  for (let x = 0; x < sample.width; x++) missingTrunks[(supportY * sample.width + x) * 4 + 3] = 8;
  assert.throws(() => inspectWoodlandUnderCanopy(missingTrunks, sample.width, sample.height / 4,
    'unsupported crown mutation'), /open under-canopy gaps/);
  const picket = source.slice();
  for (let y = 42; y < 48; y++) {
    for (let x = 0; x < sample.width; x++) picket[(y * sample.width + x) * 4 + 3] = x % 16 < 3 ? 255 : 8;
  }
  assert.throws(() => inspectWoodlandLayering(picket, sample.width, sample.height / 4,
    'regular thin-stem picket mutation'), /overlapping lower-canopy mass/);
  const hedge = source.slice();
  for (let y = 42; y < 48; y++) {
    for (let x = 0; x < sample.width; x++) hedge[(y * sample.width + x) * 4 + 3] = x % 4 < 3 ? 255 : 8;
  }
  assert.throws(() => inspectWoodlandLayering(hedge, sample.width, sample.height / 4,
    'uniform hedge mutation'), /irregular clustered canopy density/);
  const receipt = { proof: 'Real native Canvas2D raster only; no GPU, scope or final-world visual acceptance',
    rasterizer: { name: packageInfo.name, version: packageInfo.version, module: modulePath },
    rows: rows.map(({ data, ...row }) => row) };
  if (values['out-dir']) writeFileSync(join(values['out-dir'], 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(receipt, null, 2));
  console.log('horizonDetailAtlas.selftest: PASS native six-family atlas, two-tier raster, strict roots/seams/detail, open woodland branches, five unchanged families, mixed bands, deterministic lifetime and unchanged budget');
} finally {
  for (const [key, value] of savedGlobals) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
}
