import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import * as THREE from 'three';
import { getMapConfig, MAP_IDS } from './maps/index.ts';

// 2026-10-01 (frozen pins retired): the receipt used to embed the 33b243436 leaf painter, pin its text and seven sibling
// painter bodies by sha256, replay the old painter through the live module and hold the current atlas to the old
// one's footprint. Those were change detectors of history. The current painter is now held to absolute contracts:
// one understorey backing, disc and twig per clump, six to twelve pointed blades per clump seated on their twig, a
// broad, substantial alpha footprint with real negative space at every mip, the shared texture policy and
// deterministic native pixels. Footprint floors sit below the measured 2026-10-01 atlas (coverage .43-.50, width and
// height .81-.89, mean .37-.42, quadrant minimum .38-.47, top-mip empty space .36-.44).
const { values } = parseArgs({ options: { out: { type: 'string' } } });
const url = new URL('./vegetation.ts', import.meta.url), source = readFileSync(url, 'utf8');
const sha = value => createHash('sha256').update(value).digest('hex');
function replaceOnce(text, before, after) {
  assert.equal(text.split(before).length, 2, 'unique actual-module replacement');
  return text.replace(before, after);
}

async function loadPainters(tier) {
  // Device resolution is cached: use a fresh actual quality module for each tier.
  const qualityURL = new URL('../engine/quality.ts?branchlets-' + tier, import.meta.url).href;
  const quality = await import(qualityURL); quality.resolveDeviceTier();
  const hook = registerHooks({ load(href, context, next) {
    const result = next(href, context);
    if (!href.startsWith(url.href + '?branchlets-')) return result;
    assert.equal(String(result.source), source, 'stable complete production module');
    const code = replaceOnce(source, "'../engine/quality.ts'", JSON.stringify(qualityURL));
    return { ...result, source: code.replaceAll('new THREE.Texture(', 'new ObservedTexture(') +
      '\nlet textureCalls = 0;\nclass ObservedTexture extends THREE.Texture {' +
      'constructor(...args) { super(...args); textureCalls++; }}\n' +
      'export function takeTextureCalls() { const n = textureCalls; textureCalls = 0; return n; }\n' };
  } });
  try { return await import(url.href + '?branchlets-' + tier); }
  finally { hook.deregister(); }
}

let calls, path, twig;
function point(ctx, x, y) {
  const m = ctx.getTransform(); return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}
function segmentGap(p, line) {
  const [a, b] = line, dx = b[0] - a[0], dy = b[1] - a[1];
  const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy);
}
function observePath(ctx, key, args) {
  if (key === 'beginPath') path = { points: [], curves: 0 };
  if (key === 'moveTo' || key === 'lineTo') path.points.push(point(ctx, ...args));
  if (key === 'quadraticCurveTo') path.curves++;
  if (key === 'stroke' && path.points.length === 2 && ctx.lineWidth > ctx.canvas.width / 512) {
    twig = path.points; calls.twigs++;
  }
  if (key !== 'closePath' || path.curves !== 2) return;
  calls.blades++; calls.attachments.push(twig ? segmentGap(path.points[0], twig) : Infinity);
}
function observeCall(ctx, key, args) {
  if (Object.hasOwn(calls, key)) calls[key]++;
  if (key === 'ellipse' && args[0] === 0 && args[1] === 0) calls.oldLeaves++;
  observePath(ctx, key, args);
}
function observedCanvas() {
  calls.canvases++;
  const canvas = createCanvas(1, 1), getContext = canvas.getContext.bind(canvas);
  canvas.getContext = (...args) => new Proxy(getContext(...args), {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      return (...params) => { observeCall(target, key, params); return value.apply(target, params); };
    },
    set(target, key, value) { return Reflect.set(target, key, value, target); },
  });
  return canvas;
}
function paint(api, name, seed, tone, variant = 0) {
  calls = { canvases: 0, createRadialGradient: 0, createLinearGradient: 0, ellipse: 0, arc: 0,
    stroke: 0, oldLeaves: 0, blades: 0, twigs: 0, attachments: [] };
  path = { points: [], curves: 0 }; twig = null;
  api.takeTextureCalls(); const next = api.mulberry32(seed), draws = [];
  const rng = () => { const value = next(); draws.push(value); return value; };
  const texture = name === 'makeGrassCardTexture' ? api[name](rng, variant, tone) : api[name](rng, tone);
  return { texture, draws, calls, constructors: api.takeTextureCalls() };
}
function resources(b, size) {
  assert.ok(b.texture.image instanceof ImageData, 'native straight-alpha upload');
  assert.deepEqual([b.texture.image.width, b.texture.image.height, b.texture.image.data.byteLength], [size, size, size * size * 4]);
  assert.strictEqual(b.texture.source.data, b.texture.image); assert.equal(b.texture.version, 1);
  assert.deepEqual(b.texture.mipmaps, []); assert.equal(b.texture.colorSpace, THREE.SRGBColorSpace);
  assert.equal(b.texture.premultiplyAlpha, false); assert.equal(b.texture.generateMipmaps, true);
  assert.equal(b.texture.anisotropy, 8);
  assert.equal(b.calls.canvases, 1); assert.equal(b.constructors, 1, 'one Texture owner');
}
function branches(b, size) {
  resources(b, size);
  // Leaves 2026-09-12: the shaded understorey of the original atlas returns under every clump (one radial backing and
  // disc per clump, drawn before its branchlet); the 70 sky-hole punches stay retired.
  assert.equal(b.calls.createRadialGradient, 115, 'one understorey backing per clump');
  assert.equal(b.calls.createLinearGradient, 0); assert.equal(b.calls.arc, 115, 'one understorey disc per clump, no punches');
  assert.equal(b.calls.ellipse, 0, 'leaves are pointed blades, not ellipses');
  assert.equal(b.calls.twigs, 115, 'one local twig per clump');
  assert.ok(b.calls.blades >= 690 && b.calls.blades <= 1380, 'main leaf population stays at six to twelve blades per clump');
  assert.ok(b.calls.stroke >= b.calls.twigs, 'every twig is stroked; veins are per-leaf draws');
  assert.ok(b.calls.attachments.every(gap => Number.isFinite(gap) && gap <= .002),
    'every actual transformed pointed blade base lies on its drawn twig (0.002 px packing guard)');
}

function alphaStats(alpha, size) {
  let covered = 0, empty = 0, sum = 0, minX = size, maxX = -1, minY = size, maxY = -1;
  const quadrants = [0, 0, 0, 0];
  for (let i = 0; i < alpha.length; i++) {
    const v = alpha[i]; sum += v; if (v < .05) empty++;
    if (v < .38) continue;
    const x = i % size, y = Math.floor(i / size); covered++;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    quadrants[(x >= size / 2 ? 1 : 0) + (y >= size / 2 ? 2 : 0)]++;
  }
  return { size, coverage: covered / alpha.length, empty: empty / alpha.length, mean: sum / alpha.length,
    width: Math.max(0, maxX - minX + 1) / size, height: Math.max(0, maxY - minY + 1) / size,
    quadrants: quadrants.map(n => n * 4 / alpha.length) };
}
function downsample(alpha, size) {
  const half = size / 2, out = new Float64Array(half * half);
  for (let y = 0; y < half; y++) for (let x = 0; x < half; x++) {
    const i = y * 2 * size + x * 2; out[y * half + x] = (alpha[i] + alpha[i + 1] + alpha[i + size] + alpha[i + size + 1]) / 4;
  }
  return out;
}
function alphaRows(image) {
  let size = image.width, alpha = Float64Array.from({ length: size * size }, (_, i) => image.data[i * 4 + 3] / 255);
  const rows = [];
  while (size >= 16) { rows.push(alphaStats(alpha, size)); alpha = downsample(alpha, size); size /= 2; }
  return rows;
}
function footprint(current) {
  for (const b of current) {
    assert.ok(b.coverage >= .35 && b.coverage <= .75,
      b.size + 'px coverage avoids sparse collapse/solid backing: ' + b.coverage);
    assert.ok(b.width >= .75 && b.height >= .75, 'retain broad radial footprint');
    assert.ok(b.mean >= .30, 'retain substantial alpha mass');
    for (let q = 0; q < 4; q++) assert.ok(b.quadrants[q] >= .27, 'no one-sided whole-card fan');
  }
  assert.ok(current[0].empty >= .20, 'genuine negative space');
}

function save(name, image) {
  if (!values.out) return;
  const c = createCanvas(image.width, image.height); c.getContext('2d').putImageData(image, 0, 0);
  writeFileSync(join(values.out, name + '.png'), c.toBuffer('image/png'), { flag: 'wx' });
}
function negativeControls(b, current, size) {
  assert.throws(() => branches({ ...b, calls: { ...b.calls, blades: 0 } }, size), /population/);
  assert.throws(() => branches({ ...b, calls: { ...b.calls, attachments: [1] } }, size), /twig/);
  assert.throws(() => branches({ ...b, calls: { ...b.calls, ellipse: 115 } }, size), /ellipses/);
  const wrongUpload = { ...b, texture: { ...b.texture, premultiplyAlpha: true } };
  assert.throws(() => resources(wrongUpload, size));
  assert.throws(() => footprint(current.map(r => ({ ...r, coverage: 0 }))), /coverage/);
  assert.throws(() => footprint(current.map(r => ({ ...r, coverage: 1 }))), /coverage/);
  assert.throws(() => footprint(current.map(r => ({ ...r, width: .1 }))), /footprint/);
}
const rows = [], failures = [];
function checkPair(api, tier, label, tone, seed, png = false) {
  const b = paint(api, 'makeLeafClusterTexture', seed, tone);
  try {
    const current = alphaRows(b.texture.image);
    const row = { tier, label, seed, current, currentSHA: sha(b.texture.image.data),
      draws: b.draws.length, blades: b.calls.blades, twigs: b.calls.twigs,
      maxAttachmentGapPx: Math.max(...b.calls.attachments), textureBytes: b.texture.image.data.byteLength };
    rows.push(row);
    if (png) {
      save(tier + '-' + label + '-current', b.texture.image);
      console.log('[atlas]', JSON.stringify(row));
    }
    const size = tier === 'desktop' ? 512 : 256;
    branches(b, size); footprint(current);
    if (png) {
      const repeat = paint(api, 'makeLeafClusterTexture', seed, tone);
      try { assert.deepEqual(repeat.texture.image.data, b.texture.image.data, 'deterministic native pixels');
        assert.deepEqual(repeat.draws, b.draws); negativeControls(b, current, size); }
      finally { repeat.texture.dispose(); }
    }
  } catch (error) { failures.push(tier + '/' + label + '/' + seed + ': ' + error.message); }
  finally { b.texture.dispose(); }
}
function mapTones() {
  const broadleaf = new Set(['oak', 'poplar', 'willow', 'acacia', 'eucalyptus']), result = [], affected = [];
  for (const id of MAP_IDS) {
    const v = getMapConfig(id).vegetation, species = v.species.filter(s => broadleaf.has(s));
    if (!species.length) continue;
    affected.push(id);
    for (const speciesId of species) {
      const palette = v.palettes?.[speciesId] ?? v.palettes?.oak ?? {};
      result.push([id + '-' + speciesId, palette.texTone ?? null]);
    }
  }
  // Every battlefield that lists a broadleaf species paints its own tone through the matrix below.
  assert.ok(affected.length > 0, 'the broadleaf scope is read from the live map registry');
  return { affected, tones: result };
}
const priorDocument = globalThis.document, priorWindow = globalThis.window;
const scope = mapTones(), seeds = [2052, 0, 1, 1337, 2060, 2061, 2063, 2064, 7719];
const tones = [['default', null], ['autumn-oak', getMapConfig('autumn').vegetation.palettes.oak.texTone]];
async function checkTier(tier) {
  globalThis.window = { location: { search: '?tier=' + tier }, localStorage: { getItem: () => null } };
  const api = await loadPainters(tier);
  // Emit first diagnostic PNGs before the broader matrix or any aggregate failure.
  for (const [name, tone] of tones) checkPair(api, tier, name, tone, 2052, true);
  for (const seed of seeds.slice(1)) for (const [name, tone] of tones) checkPair(api, tier, name, tone, seed);
  for (const [name, tone] of scope.tones) checkPair(api, tier, name, tone, 2052);
}
if (values.out) mkdirSync(values.out, { recursive: true });
globalThis.document = { createElement(tag) { assert.equal(tag, 'canvas'); return observedCanvas(); } };
try {
  // The tiers share an observed DOM/Canvas fixture; parallel loading would race it.
  await checkTier('desktop');
  await checkTier('mobile');
} finally {
  if (priorDocument === undefined) delete globalThis.document; else globalThis.document = priorDocument;
  if (priorWindow === undefined) delete globalThis.window; else globalThis.window = priorWindow;
}
const require = createRequire(import.meta.url);
const report = { sourceSHA: sha(source), testSHA: sha(readFileSync(new URL(import.meta.url))),
  canvasPackage: require('@napi-rs/canvas/package.json').version, cutoff: .38, maps: scope.affected, rows, failures,
  limits: 'Native Canvas and analytical 2x2 box-alpha diagnostics only; not GPU mip, art, overdraw or frame-cost acceptance.' };
if (values.out) writeFileSync(join(values.out, 'receipt.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ cases: rows.length, maps: scope.affected.length, failures, out: values.out ?? null }));
assert.equal(failures.length, 0, failures.join('\n'));
console.log('broadleafBranchlets: PASS');
