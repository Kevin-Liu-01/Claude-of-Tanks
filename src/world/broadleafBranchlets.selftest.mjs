import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import * as THREE from 'three';
import ts from 'typescript-compiler-api';
import { getMapConfig, MAP_IDS } from './maps/index.ts';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
const url = new URL('./vegetation.ts', import.meta.url), source = readFileSync(url, 'utf8');
const sha = value => createHash('sha256').update(value).digest('hex');
const tree = ts.createSourceFile('vegetation.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function body(name) {
  const nodes = tree.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(nodes.length, 1, name); return nodes[0].getText(tree);
}
function replaceOnce(text, before, after) {
  assert.equal(text.split(before).length, 2, 'unique actual-module replacement');
  return text.replace(before, after);
}
// Immutable complete painter from 33b243436; no Git or predecessor reconstruction at runtime.
const oldPainter = `export function makeLeafClusterTexture(rng: RandomSource, tone: ToneFunction | null = null): THREE.Texture {
  // MOBILE r1: tier-scaled atlas (painter is K-relative)
  const s = texSize(512), K = s / 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = context2d(c, { willReadFrequently: true });
  ctx.clearRect(0, 0, s, s);
  const cx = s / 2, cy = s / 2;
  // r8: three distinct clump FAMILIES on the one atlas (sun-bleached yellow-
  // green tips / mid olive / dark blue-green shadow foliage) with varied leaf
  // sizes — the single-family clumps read as "one repeated leaf texture"
  // stamped across every crown (critique). Family mix keyed per clump so
  // cards cut from different atlas regions carry visibly different foliage.
  for (let k = 0; k < 115; k++) {
    const a = rng() * Math.PI * 2;
    const rr = Math.pow(rng(), 0.62) * 0.45 * s;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    const sun = 1 - y / s;
    const famRoll = rng();
    let hue, sat, l;
    if (famRoll < 0.30) {        // sun-bleached tips
      // lighting_post r2: cap the bleached family — 0.48 HSL-lightness
      // clipped to lime-white under the 4.5 sun key; ~0.41 rolls off inside
      // the grade shoulder.
      hue = 0.205 + rng() * 0.035; sat = 0.27 + rng() * 0.07;
      l = 0.18 + sun * 0.10 + rng() * 0.06;
    } else if (famRoll < 0.78) { // mid olive body
      hue = 0.215 + rng() * 0.045; sat = 0.29 + rng() * 0.09;
      l = 0.17 + sun * 0.15 + rng() * 0.10;
    } else {                     // dark shadow foliage
      hue = 0.26 + rng() * 0.045; sat = 0.24 + rng() * 0.08;
      l = 0.12 + sun * 0.10 + rng() * 0.07;
    }
    const sizeMul = 0.7 + rng() * 0.9; // per-clump leaf scale spread
    // shadow understorey blob under the clump: leaves read as lit shapes ON
    // a dark interior instead of paint daubs on transparency
    {
      const ur = (9 + rng() * 8) * K * sizeMul;
      const gr = ctx.createRadialGradient(x, y + 3 * K, 0, x, y + 3 * K, ur);
      gr.addColorStop(0, css(hue + 0.02, sat * 0.8, l * 0.42));
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(x, y + 3 * K, ur, 0, Math.PI * 2);
      ctx.fill();
    }
    const nl = 6 + (rng() * 7) | 0;
    for (let j = 0; j < nl; j++) {
      const lx = x + (rng() - 0.5) * 15 * K, ly = y + (rng() - 0.5) * 15 * K;
      // r6: leaves ~2.3x bigger in atlas space — bold readable shapes
      const lw = (3.6 + rng() * 5.2) * sizeMul * K, lh = (2.2 + rng() * 3.1) * sizeMul * K;
      const rot = rng() * Math.PI;
      // r2: PER-LEAF value/hue spread (was one flat fill per clump — the
      // "acrylic paint daub" tell) + a lit sliver on the upper edge of ~half
      // the leaves so crowns carry leaf-scale speckle and specular breakup
      const ll = l * (0.74 + rng() * 0.60);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(rot);
      // leaf: pointed-ellipse body with a faint dark keel line
      ctx.fillStyle = css(hue + (rng() - 0.5) * 0.022, sat, ll);
      ctx.beginPath();
      ctx.ellipse(0, 0, lw, lh, 0, 0, Math.PI * 2);
      ctx.fill();
      if (rng() < 0.6) {
        ctx.fillStyle = css(hue - 0.008, sat * 0.95, Math.min(0.42, ll + 0.045 + sun * 0.025));
        ctx.beginPath();
        ctx.ellipse(-lw * 0.18, -lh * 0.30, lw * 0.55, lh * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (rng() < 0.55) { // central vein keel — leaf-scale structure at 512px
        ctx.strokeStyle = css(hue + 0.01, sat * 0.9, ll * 0.55);
        ctx.lineWidth = 0.9 * K * 0.5;
        ctx.beginPath();
        ctx.moveTo(-lw * 0.8, 0);
        ctx.lineTo(lw * 0.8, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  // r2: punch small sky-holes through the foliage mass — solid card interiors
  // were the flat-splat giveaway; alpha gaps let light break through crowns
  ctx.globalCompositeOperation = 'destination-out';
  for (let hle = 0; hle < 70; hle++) {
    const a = rng() * Math.PI * 2;
    const rr = Math.pow(rng(), 0.7) * 0.42 * s;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    ctx.beginPath();
    ctx.arc(x, y, (1.5 + rng() * 3.6) * K, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  return finishAlphaTexture(c, ctx, 70, 78, 40, true, tone);
}`;
const frozen = {
  "makeGrassCardTexture": "653f9d9d287846f261f40a2e157d874fe0983474e2b660aa9ebb6a6e013a3cf0",
  "makeNeedleSprayTexture": "68cdefe51f646fe42a46ea2c858a07f1bfa0c56985d0c3b61fb39632788a7357",
  "makePalmFrondTexture": "36a339129927f9fef1e474625ce845aad7ab5ee74b1f3cd124a8a41ccbca1be1",
  "makeBirchLeafTexture": "da3c3add2eaf15d8ed13ac3b5441ad4b1caedb358d93a6c976d4281aa85c9a9b",
  "makeTwigTexture": "e42913b459160ded6942a5955d386a2ba6a20d2a33868ad9fa6cbec38ea7854e",
  "finishAlphaPixels": "9bb3f49e523355830c1639edce97554c004e91ccaffd25f98d2441273e110801",
  "finishAlphaTexture": "30f9812391b96bca4710e2aaefe62cc6020793bb6aa453b2ff0653bc1946fb04"
};
assert.equal(sha(oldPainter + '\n'), '2fd61ffaf926d6e140297544ab05f9f3658574c15b6dfc6178b0b4f0da2b0bcd');
for (const [name, hash] of Object.entries(frozen)) assert.equal(sha(body(name) + '\n'), hash, name);

async function loadPainters(tier) {
  // Device resolution is cached: use a fresh actual quality module for each tier.
  const qualityURL = new URL('../engine/quality.ts?branchlets-' + tier, import.meta.url).href;
  const quality = await import(qualityURL); quality.resolveDeviceTier();
  const hook = registerHooks({ load(href, context, next) {
    const result = next(href, context);
    if (!href.startsWith(url.href + '?branchlets-')) return result;
    assert.equal(String(result.source), source, 'stable complete production module');
    const input = href.endsWith('-old') ? replaceOnce(source, body('makeLeafClusterTexture'), oldPainter) : source;
    const code = replaceOnce(input, "'../engine/quality.ts'", JSON.stringify(qualityURL));
    return { ...result, source: code.replaceAll('new THREE.Texture(', 'new ObservedTexture(') +
      '\nlet textureCalls = 0;\nclass ObservedTexture extends THREE.Texture {' +
      'constructor(...args) { super(...args); textureCalls++; }}\n' +
      'export function takeTextureCalls() { const n = textureCalls; textureCalls = 0; return n; }\n' };
  } });
  try { return [await import(url.href + '?branchlets-' + tier + '-old'),
    await import(url.href + '?branchlets-' + tier + '-new')]; }
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
const textureKeys = ['colorSpace', 'anisotropy', 'wrapS', 'wrapT', 'minFilter', 'magFilter', 'format',
  'type', 'generateMipmaps', 'premultiplyAlpha', 'flipY', 'unpackAlignment'];
function resources(a, b) {
  assert.ok(b.texture.image instanceof ImageData, 'native straight-alpha upload');
  assert.deepEqual([b.texture.image.width, b.texture.image.height, b.texture.image.data.byteLength],
    [a.texture.image.width, a.texture.image.height, a.texture.image.data.byteLength]);
  assert.strictEqual(b.texture.source.data, b.texture.image); assert.equal(b.texture.version, 1);
  assert.deepEqual(b.texture.mipmaps, []); assert.equal(b.texture.colorSpace, THREE.SRGBColorSpace);
  assert.equal(b.texture.premultiplyAlpha, false); assert.equal(b.texture.generateMipmaps, true);
  assert.equal(b.texture.anisotropy, 8);
  for (const key of textureKeys) assert.equal(b.texture[key], a.texture[key], key);
  assert.equal(b.calls.canvases, 1); assert.equal(b.constructors, 1, 'one Texture owner');
}
function branches(a, b) {
  resources(a, b);
  assert.equal(b.draws.length + 210, a.draws.length, 'only 70 final three-draw punches removed');
  assert.deepEqual(b.draws, a.draws.slice(0, -210), 'exact retained RNG prefix; tail intentionally differs');
  assert.equal(a.calls.createRadialGradient, 115);
  assert.equal(b.calls.createRadialGradient, 0, 'no radial backing');
  assert.equal(b.calls.createLinearGradient, 0); assert.equal(b.calls.arc, 0); assert.equal(b.calls.ellipse, 0);
  assert.equal(a.calls.arc, 185); assert.equal(b.calls.twigs, 115, 'one local twig per clump');
  assert.equal(b.calls.blades, a.calls.oldLeaves, 'same main leaf population');
  assert.ok(b.calls.blades >= 690 && b.calls.blades <= 1380);
  assert.equal(b.calls.stroke, a.calls.stroke + 115, 'unchanged vein count plus 115 twigs');
  assert.ok(b.calls.attachments.every(gap => Number.isFinite(gap) && gap <= .002),
    'every actual transformed pointed blade base lies on its drawn twig (0.002 px packing guard)');
  assert.notEqual(sha(b.texture.image.data), sha(a.texture.image.data));
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
function footprint(before, current) {
  for (let i = 0; i < before.length; i++) {
    const a = before[i], b = current[i];
    assert.ok(b.coverage >= a.coverage * .75 && b.coverage <= Math.min(.75, a.coverage + .18),
      b.size + 'px paired coverage avoids sparse collapse/solid backing: ' + b.coverage + ' vs ' + a.coverage);
    assert.ok(b.width >= a.width * .90 && b.height >= a.height * .90, 'retain broad radial footprint');
    assert.ok(b.mean >= a.mean * .70, 'retain substantial alpha mass');
    for (let q = 0; q < 4; q++) assert.ok(b.quadrants[q] >= a.quadrants[q] * .60, 'no one-sided whole-card fan');
  }
  assert.ok(current[0].empty >= .20, 'genuine negative space');
}
function save(name, image) {
  if (!values.out) return;
  const c = createCanvas(image.width, image.height); c.getContext('2d').putImageData(image, 0, 0);
  writeFileSync(join(values.out, name + '.png'), c.toBuffer('image/png'), { flag: 'wx' });
}
function negativeControls(a, b, before, current) {
  assert.throws(() => branches(a, a));
  assert.throws(() => branches(a, { ...b, draws: [...b.draws, .5] }), /punches/);
  assert.throws(() => branches(a, { ...b, calls: { ...b.calls, blades: b.calls.blades - 1 } }), /population/);
  assert.throws(() => branches(a, { ...b, calls: { ...b.calls, attachments: [1] } }), /twig/);
  const wrongUpload = { ...b, texture: { ...b.texture, premultiplyAlpha: true } };
  assert.throws(() => resources(a, wrongUpload));
  assert.throws(() => footprint(before, current.map(r => ({ ...r, coverage: 0 }))), /coverage/);
  assert.throws(() => footprint(before, current.map(r => ({ ...r, coverage: 1 }))), /coverage/);
  assert.throws(() => footprint(before, current.map(r => ({ ...r, width: .1 }))), /footprint/);
}
const rows = [], failures = [];
function checkPair(apis, tier, label, tone, seed, png = false) {
  const [old, now] = apis, a = paint(old, 'makeLeafClusterTexture', seed, tone), b = paint(now, 'makeLeafClusterTexture', seed, tone);
  try {
    const before = alphaRows(a.texture.image), current = alphaRows(b.texture.image);
    const row = { tier, label, seed, before, current, beforeSHA: sha(a.texture.image.data), currentSHA: sha(b.texture.image.data),
      oldDraws: a.draws.length, newDraws: b.draws.length, blades: b.calls.blades, twigs: b.calls.twigs,
      maxAttachmentGapPx: Math.max(...b.calls.attachments), textureBytes: b.texture.image.data.byteLength };
    rows.push(row);
    if (png) {
      save(tier + '-' + label + '-before', a.texture.image); save(tier + '-' + label + '-current', b.texture.image);
      console.log('[atlas]', JSON.stringify(row));
    }
    const size = tier === 'desktop' ? 512 : 256;
    assert.deepEqual([b.texture.image.width, b.texture.image.height], [size, size]);
    branches(a, b); footprint(before, current);
    if (png) {
      const repeat = paint(now, 'makeLeafClusterTexture', seed, tone);
      try { assert.deepEqual(repeat.texture.image.data, b.texture.image.data, 'deterministic native pixels');
        assert.deepEqual(repeat.draws, b.draws); negativeControls(a, b, before, current); }
      finally { repeat.texture.dispose(); }
    }
  } catch (error) { failures.push(tier + '/' + label + '/' + seed + ': ' + error.message); }
  finally { a.texture.dispose(); b.texture.dispose(); }
}
function siblingParity([old, now]) {
  for (const name of Object.keys(frozen).filter(n => n.startsWith('make'))) {
    for (const variant of name === 'makeGrassCardTexture' ? [0, 1] : [0]) {
      const a = paint(old, name, 2052, null, variant), b = paint(now, name, 2052, null, variant);
      try { resources(a, b); assert.deepEqual(b.draws, a.draws, name + ' RNG');
        assert.deepEqual(b.texture.image.data, a.texture.image.data, name + ' exact sibling RGBA'); }
      finally { a.texture.dispose(); b.texture.dispose(); }
    }
  }
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
  assert.equal(affected.length, 24, 'actual broadleaf map scope');
  return { affected, tones: result };
}
const priorDocument = globalThis.document, priorWindow = globalThis.window;
const scope = mapTones(), seeds = [2052, 0, 1, 1337, 2060, 2061, 2063, 2064, 7719];
const tones = [['default', null], ['autumn-oak', getMapConfig('autumn').vegetation.palettes.oak.texTone]];
async function checkTier(tier) {
  globalThis.window = { location: { search: '?tier=' + tier }, localStorage: { getItem: () => null } };
  const apis = await loadPainters(tier);
  // Emit first diagnostic PNGs before the broader matrix or any aggregate failure.
  for (const [name, tone] of tones) checkPair(apis, tier, name, tone, 2052, true);
  for (const seed of seeds.slice(1)) for (const [name, tone] of tones) checkPair(apis, tier, name, tone, seed);
  for (const [name, tone] of scope.tones) checkPair(apis, tier, name, tone, 2052);
  siblingParity(apis);
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
const report = { baseline: '33b243436200c01bd0013aaf9ecf6aadbaacfffa', sourceSHA: sha(source), testSHA: sha(readFileSync(new URL(import.meta.url))),
  canvasPackage: require('@napi-rs/canvas/package.json').version, cutoff: .38, maps: scope.affected, rows, failures,
  limits: 'Native Canvas and analytical 2x2 box-alpha diagnostics only; not GPU mip, art, overdraw or frame-cost acceptance.' };
if (values.out) writeFileSync(join(values.out, 'receipt.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ cases: rows.length, maps: scope.affected.length, failures, out: values.out ?? null }));
assert.equal(failures.length, 0, failures.join('\n'));
console.log('broadleafBranchlets: PASS');
