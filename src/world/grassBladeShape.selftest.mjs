import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import * as THREE from 'three';
import ts from 'typescript-compiler-api';
import { MAP_IDS, getMapConfig } from './maps/index.ts';

// Native Canvas inputs, not a browser/overdraw/FPS proof. Optional --out saves
// actual production-seed PNGs and all observations; no output by default.
const { values } = parseArgs({ options: { out: { type: 'string' } } });
const url = new URL('./vegetation.ts', import.meta.url), text = readFileSync(url, 'utf8');
const tree = ts.createSourceFile('vegetation.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function declaration(name) {
  const found = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found.push(node.getText(tree));
    ts.forEachChild(node, visit);
  }
  visit(tree); assert.equal(found.length, 1, `one actual ${name}`); return found[0];
}
function tokenHash(code) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, code), tokens = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) tokens.push([token, scanner.getTokenText()]);
  return createHash('sha256').update(JSON.stringify(tokens)).digest('hex');
}
// Exact7145bf3f1cef1aae3a9f97d7b06a4cddbdf0e2c3 declarations, ignoring trivia
// only. This authenticates the original painter without Git/shallow-history
// dependency. No entire-vegetation lock: independent palm changes are allowed.
const pinned = {
  css: '8e2c6ed12c7aa05d6a8306b02c7a5eded849d18069e4d7e809b0418250daff4a',
  finishAlphaPixels: '5558eea18ee914912e6574671e4e48c32d61c789c256123d13d6610ad9ad80f6',
  buildGrassTuftGeometry: 'dcfd5a07b21f99ccf2e89e2fca0be7d64a5eb282f26580ff8ca9c92f4c2d1ff8',
  makeGrassMaterial: '87fb06acf435f3e218afa1c273af517a0554521083627788421156a61da7e845',
  mipAlphaGuard: '52c2a3521a17e3619f41932bb22bb58414bcce792df22fa64a17d29b1789ae65',
};
for (const [name, hash] of Object.entries(pinned)) assert.equal(tokenHash(declaration(name)), hash, `${name}: unchanged grass contract`);
const painter = declaration('makeGrassCardTexture'), width = 'const bw = 1.35 + rng() * 1.8;';
assert.equal(painter.split(width).length, 2, 'one actual45%-width expression');
const originalPainter = painter.replace(width, 'const bw = 3 + rng() * 4;');
assert.equal(tokenHash(originalPainter), 'b0fe6c001600cd100a1680bbff09e3680771cd76c4d03c8889e2b0ba98295031',
  'all original blade counts/RNG/roots/tips/curves/pigment/padding retained except width');
assert.match(text, /makeGrassCardTexture\(mulberry32\(seed \+ 41\), 0, veg\.grassTexTone\)/);
assert.match(text, /makeGrassCardTexture\(mulberry32\(seed \+ 42\), 1, veg\.grassTexTone\)/);
const currentUrl = url.href + '?grass-shape=current', originalUrl = url.href + '?grass-shape=original';
const lightUrl = new URL('../engine/lighting.ts?grass-shape=mips', import.meta.url).href;
const hook = registerHooks({ load(href, context, next) {
  const result = next(href, context);
  if (href === lightUrl) return { ...result, source: String(result.source) + '\nexport { buildCoverageMipmaps };' };
  if (href !== currentUrl && href !== originalUrl) return result;
  assert.equal(String(result.source), text, 'source stable during fixture load');
  const code = href === originalUrl ? text.replace(painter, originalPainter) : text;
  return { ...result, source: code + `\nexport { mipAlphaGuard };\nexport function grassShapeMaterial(engineCtx, grassWindHook) { ${declaration('makeGrassMaterial')} return makeGrassMaterial; }` };
} });
let current, original, buildMips;
try { current = await import(currentUrl); original = await import(originalUrl); ({ buildCoverageMipmaps: buildMips } = await import(lightUrl)); }
finally { hook.deregister(); }
const shader = { fragmentShader: '#include <alphatest_fragment>' };
current.mipAlphaGuard(shader);
assert.match(shader.fragmentShader, /min\( aaMip, 3\.50 \) \* 0\.250/, 'CPU mip observation uses actual unchanged shader boost');

function textureContract(texture) {
  assert.ok(texture.image instanceof ImageData);
  assert.deepEqual([texture.image.width, texture.image.height, texture.image.data.byteLength], [128, 128, 65536]);
  assert.strictEqual(texture.source.data, texture.image, 'one straight-alpha upload buffer');
  for (const [key, value] of Object.entries({ colorSpace: THREE.SRGBColorSpace, anisotropy: 8,
    wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
    generateMipmaps: true, premultiplyAlpha: false, flipY: true, version: 1 })) assert.equal(texture[key], value, key);
  assert.deepEqual(texture.mipmaps, []);
  buildMips(texture, .44); // Actual owner skips ImageData: ordinary GPU mips remain enabled.
  assert.deepEqual(texture.mipmaps, []); assert.equal(texture.generateMipmaps, true); assert.equal(texture.version, 1);
}
function materialContract(api, texture) {
  const calls = [], extra = () => {};
  const make = api.grassShapeMaterial({ setupShadowMaterial: (mat, hook) => calls.push([mat, hook]) }, () => extra);
  const mat = make(texture, 150, 'world-grass-wind-v6');
  try {
    assert.ok(mat instanceof THREE.MeshLambertMaterial); assert.strictEqual(mat.map, texture);
    assert.deepEqual([mat.alphaTest, mat.alphaToCoverage, mat.side, mat.transparent, mat.depthWrite], [.44, true, THREE.DoubleSide, false, true]);
    assert.deepEqual(calls, [[mat, extra]]); assert.equal(mat.customProgramCacheKey(), 'world-grass-wind-v6');
    assert.deepEqual(Object.values(mat).filter(value => value?.isTexture), [texture]);
  } finally { mat.dispose(); }
}
function mipRows(pixels) {
  let alpha = Float64Array.from({ length: pixels.data.length / 4 }, (_, i) => pixels.data[i * 4 + 3] / 255), size = pixels.width;
  const rows = [];
  for (let level = 0; ; level++) {
    const boost = 1 + Math.min(level, 3.5) * .25;
    rows.push({ size, coverage: alpha.reduce((a, b) => a + b, 0) / alpha.length,
      nonzero: alpha.filter(a => a > 0).length, surviving: alpha.filter(a => a * boost >= .44).length });
    if (size === 1) return rows;
    const small = new Float64Array(alpha.length / 4), half = size / 2;
    for (let y = 0; y < half; y++) for (let x = 0; x < half; x++) {
      const i = y * 2 * size + x * 2;
      small[y * half + x] = (alpha[i] + alpha[i + 1] + alpha[i + size] + alpha[i + size + 1]) / 4;
    }
    alpha = small; size = half;
  }
}
function coverageContract(before, after) {
  assert.ok(after[0].nonzero > 0 && after[0].nonzero < before[0].nonzero, 'narrower nonempty base silhouette');
  assert.deepEqual(after.map(r => r.size), [128, 64, 32, 16, 8, 4, 2, 1]);
  for (let i = 0; i < after.length; i++) assert.ok(after[i].coverage > 0 && after[i].coverage < before[i].coverage,
    `strictly reduced positive fractional coverage at mip${i}; integer1x1 counts may tie`);
}
function paint(api, seed, variant, tone) {
  const next = api.mulberry32(seed); let calls = 0;
  const texture = api.makeGrassCardTexture(() => { calls++; return next(); }, variant, tone);
  return { texture, calls, tail: [next(), next(), next()] };
}
function savePng(name, pixels) {
  if (!values.out) return;
  const canvas = createCanvas(pixels.width, pixels.height);
  canvas.getContext('2d').putImageData(pixels, 0, 0);
  writeFileSync(join(values.out, name + '.png'), canvas.toBuffer('image/png'), { flag: 'wx' });
}
const priorDocument = globalThis.document;
globalThis.document = { createElement(tag) { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };
const rows = [];
try {
  if (values.out) mkdirSync(values.out, { recursive: true });
  assert.equal(MAP_IDS.length, 30);
  for (const [w, h] of [[.92, .74], [1.14, .58]]) for (const n of [1, 2]) {
    const a = original.buildGrassTuftGeometry(w, h, n, n === 1 ? 1.5 : 1.12);
    const b = current.buildGrassTuftGeometry(w, h, n, n === 1 ? 1.5 : 1.12);
    try {
      assert.deepEqual(Object.keys(b.attributes).sort(), ['normal', 'position', 'uv']);
      for (const name of Object.keys(a.attributes)) assert.deepEqual(b.attributes[name].array, a.attributes[name].array);
      assert.deepEqual(b.index.array, a.index.array); assert.equal(b.attributes.position.count, n * 4);
      assert.equal(b.index.count, n * 6);
      assert.equal(Object.values(b.attributes).reduce((sum, item) => sum + item.array.byteLength, b.index.array.byteLength), n * 140);
    } finally { a.dispose(); b.dispose(); }
  }
  for (const mapId of MAP_IDS) for (const seed of [2042, 2043, 0, 0xffffffff]) for (const variant of [0, 1]) {
    const tone = getMapConfig(mapId).vegetation.grassTexTone ?? null;
    const a = paint(original, seed, variant, tone), b = paint(current, seed, variant, tone);
    try {
      assert.deepEqual([b.calls, b.tail], [a.calls, a.tail], 'identical painter random stream/tail');
      textureContract(a.texture); textureContract(b.texture); materialContract(current, b.texture);
      const before = mipRows(a.texture.image), after = mipRows(b.texture.image); coverageContract(before, after);
      assert.throws(() => coverageContract(before, before), /narrower/, 'restoring broad blades is rejected');
      assert.throws(() => coverageContract(before, after.map(row => ({ ...row, coverage: 0 }))), /fractional/, 'empty mips are rejected');
      rows.push({ mapId, seed, variant, calls: b.calls, tail: b.tail, before, after });
      if (seed === 2042 + variant) {
        savePng(`${mapId}-${variant}-before`, a.texture.image); savePng(`${mapId}-${variant}-after`, b.texture.image);
      }
    } finally { a.texture.dispose(); b.texture.dispose(); }
  }
  const receipt = { scope: 'actual Canvas base; unquantized CPU box-mip model, not GPU alpha-test survival or FPS', rows };
  if (values.out) writeFileSync(join(values.out, 'receipt.json'), JSON.stringify(receipt, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(receipt));
  console.log(`grassBladeShape: ${rows.length} native Canvas cases; narrower blades, exact RNG/pigment source/geometry/material/upload contracts`);
} finally {
  if (priorDocument === undefined) delete globalThis.document;
  else globalThis.document = priorDocument;
}
