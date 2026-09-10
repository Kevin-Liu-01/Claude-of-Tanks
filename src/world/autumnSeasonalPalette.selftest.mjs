import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createCanvas } from '@napi-rs/canvas';
import ts from 'typescript-compiler-api';
import { MAP_IDS, getMapConfig } from './maps/index.ts';

// Source-owned palette predecessor from c0064aaae. Optional frozen-root mode
// independently checks all 30 configs and the unchanged vegetation module.
// Default mode does not depend on local Git history or an external checkout.
const { values } = parseArgs({ options: { 'baseline-root': { type: 'string' } } });
const oldPalettes = `{
  oak: {
    texTone: (h, s, l) => [clamp01(.055 + (h - .22) * .25), clamp01(s * 1.02 + .10), clamp01(l * 1.02)],
    cardHue: .058, cardSat: .52, cardL0: .30,
    canopy: { hue: .060, sat: .42, l0: .27, l1: .39 }, jitterHue: .85,
  },
  birch: {
    texTone: (h, s, l) => [.105, clamp01(s * .55 + .22), clamp01(l * .92 + .10)],
    cardHue: .105, cardSat: .55, cardL0: .42,
    canopy: { hue: .11, sat: .50, l0: .36, l1: .52 }, jitterHue: .6,
  },
}`;
const url = new URL('./vegetation.ts', import.meta.url), text = readFileSync(url, 'utf8');
const mapUrl = new URL('./maps/autumn.ts', import.meta.url), mapText = readFileSync(mapUrl, 'utf8');
const parse = code => ts.createSourceFile('fixture.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function find(tree, predicate, label) {
  const found = [];
  function visit(node) { if (predicate(node)) found.push(node); node.forEachChild(visit); }
  visit(tree); assert.equal(found.length, 1, label); return found[0];
}
const tree = parse(text), mapTree = parse(mapText);
const fn = name => find(tree, n => ts.isFunctionDeclaration(n) && n.name?.text === name, name).getText(tree);
const variable = name => find(tree, n => ts.isVariableDeclaration(n) && n.name.getText(tree) === name, name).initializer.getText(tree);
const paletteNode = find(mapTree, n => ts.isPropertyAssignment(n) && n.name.getText(mapTree) === 'palettes', 'one map palette');
const priorSource = mapText.slice(0, paletteNode.initializer.getStart(mapTree)) + oldPalettes + mapText.slice(paletteNode.initializer.end);
const start = text.indexOf('  const OAK_SHAPES:'), end = text.indexOf('  const foliageTex =', start);
assert.ok(start > 0 && end > start, 'actual registry boundaries');
const rng = fn('mulberry32');
const observed = text.replace(rng, rng.replace('function mulberry32(', 'function seasonalRandomCore(')) + `
  const streams = [];
  export function mulberry32(seed) {
    const next = seasonalRandomCore(seed), row = {seed, calls: 0, next}; streams.push(row);
    return () => { row.calls++; return next(); };
  }
  export function takeStreams() { return streams.splice(0).map(({seed,calls,next}) => ({seed,calls,tail:[next(),next(),next()]})); }
  export function seasonalLibrary(seed, input, engineCtx) {
    const cfg = {vegetation:input}, veg = ${variable('veg')};
    ${text.slice(start, end)}
    function materials() {
      const foliageTex = {}, foliageMats = {}, foliageDepthMats = {}, foliageWindHook = () => {};
      ${fn('createFoliageMaterials')}
      for (const step of createFoliageMaterials()) void step;
      return {foliageTex, foliageMats, foliageDepthMats};
    }
    return {SPECIES, speciesList, palOf, bushSpecies, materials};
  }
  export {buildBushCards};
`;
const observedUrl = url.href + '?seasonal-palette', priorUrl = mapUrl.href + '?seasonal-before';
const hook = registerHooks({ load(href, context, next) {
  const result = next(href, context);
  if (href === observedUrl) { assert.equal(String(result.source), text); return {...result, source: observed}; }
  if (href === priorUrl) { assert.equal(String(result.source), mapText); return {...result, source: priorSource}; }
  return result;
} });
let api, before;
try { api = await import(observedUrl); before = (await import(priorUrl)).default; }
finally { hook.deregister(); }
const current = getMapConfig('autumn');
// This historical comparison owns pigment only. Leaf-bearing silhouette is
// independently exercised by autumnLeafSprays.selftest; keep exact old alpha
// and painter RNG assertions below by disabling that opt-in on fixture copies.
function paletteOnly(config) {
  const palettes = Object.fromEntries(Object.entries(config.vegetation.palettes ?? {}).map(([species, palette]) => {
    const { birchLeaves, ...pigment } = palette;
    if (birchLeaves !== undefined) assert.ok(config.id === 'autumn' && ['birch', 'aspen'].includes(species)
      && birchLeaves === true, 'leaf-form opt-in is separate and Autumn birch/aspen only');
    return [species, pigment];
  }));
  return { ...config, vegetation: { ...config.vegetation, palettes } };
}
const snapshot = value => JSON.stringify(value, (_, item) => typeof item === 'function' ? item.toString() : item);
function withoutPalettes(config) { const {palettes, ...vegetation} = config.vegetation; return {...config, vegetation}; }
assert.equal(snapshot(withoutPalettes(current)), snapshot(withoutPalettes(before)), 'non-palette Autumn input unchanged');
const otherMaps = MAP_IDS.filter(id => id !== 'autumn').map(id => snapshot(getMapConfig(id)));
assert.equal(otherMaps.length, 29);
if (values['baseline-root']) {
  const base = await import(pathToFileURL(join(values['baseline-root'], 'src/world/maps/index.ts')).href);
  for (const id of MAP_IDS) assert.equal(snapshot(id === 'autumn' ? withoutPalettes(getMapConfig(id)) : getMapConfig(id)),
    snapshot(id === 'autumn' ? withoutPalettes(base.getMapConfig(id)) : base.getMapConfig(id)), `${id}: frozen non-palette config`);
  assert.equal(readFileSync(join(values['baseline-root'], 'src/world/vegetation.ts'), 'utf8'), text, 'frozen rendering/placement/lifetime source');
  before = base.getMapConfig('autumn'); // Use the actual frozen palette for this independent comparison.
}
function families(palettes) {
  assert.deepEqual(Object.keys(palettes).sort(), ['aspen', 'birch', 'oak', 'poplar'], 'four explicit families');
  const {oak, birch, aspen, poplar} = palettes;
  assert.ok(oak.cardHue < birch.cardHue && birch.cardHue < aspen.cardHue && aspen.cardHue < poplar.cardHue);
  assert.ok(aspen.cardSat < birch.cardSat && Object.values(palettes).every(p => p.cardSat <= .30), 'muted card chroma');
  for (const p of Object.values(palettes)) assert.ok(Math.abs(p.cardHue - p.canopy.hue) < .02, 'near/far authored family');
}
families(current.vegetation.palettes);
assert.throws(() => families(before.vegetation.palettes), /four explicit/, 'old collapsed families rejected');
assert.throws(() => families({...current.vegetation.palettes, oak: {...current.vegetation.palettes.oak, cardSat: .9}}), /muted/);
const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
function geometryContract(a, b, colorChange = true) {
  assert.deepEqual(Object.keys(a.attributes), Object.keys(b.attributes));
  for (const [name, attr] of Object.entries(a.attributes)) {
    const next = b.attributes[name];
    assert.deepEqual([next.count, next.itemSize, next.normalized, next.array.constructor, next.array.byteLength],
      [attr.count, attr.itemSize, attr.normalized, attr.array.constructor, attr.array.byteLength]);
    assert.ok(next.array.every(Number.isFinite));
    if (name !== 'color' || !colorChange) assert.ok(bytes(attr.array).equals(bytes(next.array)), name + ': exact bytes');
  }
  assert.deepEqual(b.index?.array, a.index?.array); assert.deepEqual(b.groups, a.groups); assert.deepEqual(b.drawRange, a.drawRange);
  a.computeBoundingBox(); b.computeBoundingBox(); a.computeBoundingSphere(); b.computeBoundingSphere();
  assert.deepEqual(b.boundingBox, a.boundingBox); assert.deepEqual(b.boundingSphere, a.boundingSphere);
}
function compareBuild(build, left, right) {
  const a = build(left), streamsA = api.takeStreams(), b = build(right), streamsB = api.takeStreams();
  const aa = a.isBufferGeometry ? {cards:a} : a, bb = b.isBufferGeometry ? {cards:b} : b;
  try {
    assert.deepEqual(streamsB, streamsA, 'actual construction RNG calls and tail');
    for (const key of Object.keys(aa)) geometryContract(aa[key], bb[key], key !== 'trunk');
    const g = bb.cards ?? bb.canopy, old = aa.cards ?? aa.canopy;
    assert.ok(!bytes(g.attributes.color.array).equals(bytes(old.attributes.color.array)), 'actual foliage tint changed');
    const flex = g.attributes.aFlex.array[0]; g.attributes.aFlex.array[0] += .125;
    assert.throws(() => geometryContract(old, g), /aFlex: exact/, 'wind-flex mutation rejected');
    g.attributes.aFlex.array[0] = flex; g.attributes.position.array[0] += .125;
    assert.throws(() => geometryContract(old, g), /position: exact/, 'shape mutation rejected');
  } finally { for (const g of [...Object.values(aa), ...Object.values(bb)]) g.dispose(); }
}
const priorDocument = globalThis.document;
globalThis.document = {createElement(tag) { assert.equal(tag, 'canvas'); return createCanvas(1, 1); }};
const rows = [];
function textureContract(a, b) {
  assert.deepEqual([b.image.width,b.image.height,b.image.data.byteLength], [a.image.width,a.image.height,a.image.data.byteLength]);
  for (const key of ['colorSpace','anisotropy','wrapS','wrapT','minFilter','magFilter','format','type','generateMipmaps','premultiplyAlpha','flipY'])
    assert.equal(b[key], a[key], key);
  const aa = a.image.data, bb = b.image.data;
  for (let i = 3; i < aa.length; i += 4) assert.equal(bb[i], aa[i], 'exact alpha coverage');
  assert.ok(!bytes(aa).equals(bytes(bb)), 'actual atlas RGB changed');
}
try {
  const libraries = [before,current].map(paletteOnly).map(config => api.seasonalLibrary(2001, config.vegetation, {setupShadowMaterial() {}}));
  const [a,b] = libraries;
  assert.deepEqual(b.speciesList, a.speciesList); assert.equal(b.bushSpecies, 'oak');
  for (const sp of a.speciesList) {
    const p = a.palOf(sp), q = b.palOf(sp);
    assert.deepEqual([q.cardL0,q.jitterHue,q.canopy.l0,q.canopy.l1], [p.cardL0,p.jitterHue,p.canopy.l0,p.canopy.l1], 'wind/instance jitter/value bounds');
    for (const h of [0,.1,.22,.3,1]) for (const s of [0,.35,1]) for (const l of [0,.3,1]) {
      const old = p.texTone(h,s,l), next = q.texTone(h,s,l);
      assert.ok(next.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
      assert.equal(next[2], old[2]); assert.ok(next[1] < old[1], 'lower atlas chroma without value darkening');
    }
    for (let k = 0; k < 3; k++) compareBuild(lib => lib.SPECIES[sp].near(k, lib.palOf(sp)), a, b);
    for (let k = 0; k < 2; k++) compareBuild(lib => lib.SPECIES[sp].far(api.mulberry32(2001 + lib.SPECIES[sp].farSeed + k * 101), lib.palOf(sp), k), a, b);
  }
  for (const seed of [2032,2033]) compareBuild(lib => api.buildBushCards(api.mulberry32(seed), lib.palOf(lib.bushSpecies)), a, b);
  const left = a.materials(), streamsA = api.takeStreams(), right = b.materials(), streamsB = api.takeStreams();
  try {
    assert.deepEqual(streamsB, streamsA, 'same actual painter RNG');
    for (const key of Object.keys(left)) assert.deepEqual([new Set(Object.values(left[key])).size, new Set(Object.values(right[key])).size], [4,4], 'existing four species owners');
    for (const sp of a.speciesList) {
      const x = left.foliageTex[sp], y = right.foliageTex[sp]; textureContract(x,y);
      const pixel = y.image.data[3]; y.image.data[3] ^= 1;
      assert.throws(() => textureContract(x,y), /exact alpha/); y.image.data[3] = pixel;
      for (const bucket of ['foliageMats','foliageDepthMats']) {
        const m = left[bucket][sp], n = right[bucket][sp];
        assert.equal(n.type,m.type); assert.strictEqual(n.map,y); assert.strictEqual(m.map,x);
        for (const key of ['alphaTest','alphaToCoverage','side','transparent','depthWrite','vertexColors','roughness','metalness','envMapIntensity','depthPacking']) assert.equal(n[key],m[key],key);
        assert.equal(n.customProgramCacheKey(),m.customProgramCacheKey());
      }
      rows.push({species:sp, atlas:[y.image.width,y.image.height], bytes:y.image.data.byteLength, near:3, far:2});
    }
  } finally { for (const resources of [left,right]) for (const bucket of Object.values(resources)) for (const value of Object.values(bucket)) value.dispose(); }
} finally {
  if (priorDocument === undefined) delete globalThis.document; else globalThis.document = priorDocument;
}
assert.deepEqual(MAP_IDS.filter(id => id !== 'autumn').map(id => snapshot(getMapConfig(id))), otherMaps, '29 maps not mutated');
console.log(JSON.stringify({rows, baselineRoot:values['baseline-root'] ?? null,
  scope:'actual palette/Canvas/registry construction; 12 near, 8 far, 2 bush pairs; no world placement, GPU, timing or visual acceptance'}));
