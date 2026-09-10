import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import ts from 'typescript-compiler-api';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { cropRowSegmentIsSupported } from './propPlacement.ts';
import { captureAutumnCropRow } from './autumnHeadlands.ts';

// Real Canvas2D + current coverage mips and row construction. This is not a
// browser appearance, raster-overdraw, construction-time or FPS acceptance.
const { values } = parseArgs({ options: { out: { type: 'string' } } });
const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const lighting = readFileSync(new URL('../engine/lighting.ts', import.meta.url), 'utf8');
function declaration(text, name) {
  const tree = ts.createSourceFile('owner.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found.push(node.getText(tree));
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.equal(found.length, 1, `one actual ${name}`);
  return found[0];
}
const documentPort = { createElement(tag) { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };
// Source-owned virtual modules: only named declarations from the two local
// owners and the explicit test mutation enter this loader. No CLI text/code,
// Function constructor, production export or filesystem fixture is needed.
const fixtureSources = new Map();
let fixtureId = 0;
const fixtureHook = registerHooks({ load(url, context, next) {
  if (!fixtureSources.has(url)) return next(url, context);
  return { format: 'module', source: fixtureSources.get(url), shortCircuit: true };
} });
async function loadFixture(text, bindings) {
  const url = new URL(`./props.ts?crop-biome-test-port=${fixtureId++}`, import.meta.url).href;
  // Parse a complete function, so fixture-local return statements are legal.
  const wrapped = `export function fixture({ ${bindings.join(', ')} }) {\n${text}\n}`;
  fixtureSources.set(url, stripTypeScriptTypes(wrapped));
  try { return (await import(url)).fixture; }
  finally { fixtureSources.delete(url); }
}
const rngSource = declaration(source, 'mulberry32');
assert.match(rngSource, /^export function mulberry32\(/);
// The public owner becomes a local declaration inside this test port.
const rngFixture = await loadFixture(`${rngSource.replace(/^export /, '')}\nreturn mulberry32;`, []);
const mulberry32 = rngFixture({});
const mipSource = ['isDrawableImage', 'alphaCoverage', 'downsampleCoverageMip', 'correctMipCoverage', 'buildCoverageMipmaps']
  .map(name => declaration(lighting, name)).join('\n');
const mipFixture = await loadFixture(`${mipSource}\nreturn buildCoverageMipmaps;`, ['document', 'ImageData', 'HTMLCanvasElement']);
const buildMips = mipFixture({
  document: documentPort, ImageData, HTMLCanvasElement: createCanvas(1, 1).constructor,
});

// Literal published 3cdbf6149 painter; independent of Git availability and of
// the current opt-in branch. Keep this historical source, not refreshed hashes.
function legacyCropTexture(crng, _col, aniso) {
  const cs = 256, cc = createCanvas(cs, cs), cctx = cc.getContext('2d');
  cctx.clearRect(0, 0, cs, cs);
  for (let b = 0; b < 260; b++) {
    const x = crng() * cs, hgt = cs * (0.50 + crng() * 0.42), lean = (crng() - 0.5) * 16;
    const lum = 0.17 + crng() * 0.11;
    _col.setHSL(0.115 + crng() * 0.02, 0.34, lum);
    cctx.strokeStyle = _col.getStyle(); cctx.lineWidth = 1.2 + crng() * 1.1;
    cctx.beginPath(); cctx.moveTo(x, cs + 2);
    cctx.quadraticCurveTo(x + lean * 0.4, cs - hgt * 0.6, x + lean, cs - hgt);
    cctx.stroke();
    _col.setHSL(0.105 + crng() * 0.02, 0.38, Math.min(0.35, lum + 0.065));
    cctx.fillStyle = _col.getStyle(); cctx.beginPath();
    cctx.ellipse(x + lean, cs - hgt, 1.7 + crng(), 4.5 + crng() * 2.5, lean * 0.03, 0, Math.PI * 2);
    cctx.fill();
  }
  const cid = cctx.getImageData(0, 0, cs, cs);
  for (let i = 0; i < cs * cs; i++) {
    const x = i % cs, y = Math.floor(i / cs);
    if (x % 64 < 24) cid.data[i * 4 + 3] = 0;
    const rootShade = 0.98 - y / cs * 0.18;
    for (let channel = 0; channel < 3; channel++) cid.data[i * 4 + channel] *= rootShade;
    if (cid.data[i * 4 + 3] < 24) {
      cid.data[i * 4] = 126; cid.data[i * 4 + 1] = 110; cid.data[i * 4 + 2] = 66;
    }
  }
  cctx.putImageData(cid, 0, 0);
  const texture = new THREE.CanvasTexture(cc);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = THREE.RepeatWrapping; texture.anisotropy = aniso;
  return texture;
}
const painterNames = ['canvas2d', 'paintWetCropLeaves', 'paintCropPanicle', 'biomeCropHeight', 'biomeCropLean', 'paintCropStalk',
  'finishStandingCrop', 'finishBrokenCrop', 'paintBiomeCrop', 'createCropTexture'];
const painterSource = painterNames.map(name => declaration(source, name)).join('\n');
const painterBindings = ['THREE', 'document', '_col', 'P', 'aniso'];
const painterExports = '\nreturn { createCropTexture, paintWetCropLeaves, paintCropPanicle };';
const painterFixture = await loadFixture(painterSource + painterExports, painterBindings);
function painter(form, fixture = painterFixture) {
  return fixture({
    THREE, document: documentPort, _col: new THREE.Color(), P: { cropForm: form }, aniso: 4,
  }).createCropTexture;
}
function counted(seed) {
  const next = mulberry32(seed), draws = [];
  return { draws, next() { const value = next(); draws.push(value); return value; } };
}
function pixels(texture) { return texture.image.getContext('2d').getImageData(0, 0, 256, 256).data; }
function hash(data) { return createHash('sha256').update(data).digest('hex'); }
function assertDraws(actual, expected) {
  assert.equal(actual.draws.length, 2340, 'nine draws for every stalk, including headless cuts');
  assert.deepEqual(actual.draws, expected.draws, 'unchanged draw values and order');
  assert.equal(actual.next(), expected.next(), 'next plot-placement draw stays exact');
}
function stats(image) {
  let covered = 0, upper = 0, bottom = 0, gold = 0, green = 0, oldGap = 0;
  const { width, height, data } = image;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 4;
    if (data[p + 3] / 255 < .42) continue;
    covered++;
    if (y < height * .65) upper++;
    if (y >= height * .70) bottom++;
    if (data[p] > data[p + 1]) gold++; else if (data[p + 1] > data[p]) green++;
    if ((x * 256 / width) % 64 < 24) oldGap++;
  }
  return { width, covered, fraction: covered / (width * height), upper, bottom, gold, green, oldGap };
}
function assertIdentity(form, levels) {
  const full = levels[0];
  assert.ok(full.fraction > .025 && full.fraction < .65, 'nonempty permeable plants, not filled cards');
  assert.ok(full.oldGap > full.covered * .12, 'plants occupy former punched windows; no four hard cutouts');
  if (form === 'harvest') {
    assert.ok(full.bottom > full.covered * .65, 'harvest is predominantly short cut stubble');
    assert.ok(full.upper > 0 && full.upper < full.covered * .30, 'sparse intact standing heads remain');
    assert.ok(full.gold > full.covered * .8, 'dry harvest pigment');
  } else {
    assert.ok(full.upper > full.covered * .30, 'wet-edge plants retain substantial upright foliage');
    assert.ok(full.green > full.covered * .8, 'green wet-edge crop pigment');
  }
  for (const level of levels.slice(1)) {
    assert.ok(level.covered > 0 && level.fraction < .75, `${level.width}px actual mip remains nonempty and permeable`);
  }
}
function assertCoverageBudget(levels, legacy) {
  for (const [i, level] of levels.entries()) assert.ok(level.covered <= legacy[i].covered,
    `${level.width}px covered alpha texels ${level.covered} exceed legacy ${legacy[i].covered}; hold candidate`);
}
function emit(texture, label) {
  if (!values.out) return;
  for (const size of [256, 64, 16]) {
    const image = texture.mipmaps.find(mip => mip.width === size), c = createCanvas(size, size);
    c.getContext('2d').putImageData(image, 0, 0);
    writeFileSync(join(values.out, `${label}-${size}.png`), c.toBuffer('image/png'));
  }
}
function checkRaster(form, seed, receipt) {
  const rng = counted(seed), oldRng = counted(seed), repeatRng = counted(seed);
  const texture = painter(form)(rng.next), old = legacyCropTexture(oldRng.next, new THREE.Color(), 4);
  const repeat = painter(form)(repeatRng.next);
  try {
    assertDraws(rng, oldRng);
    assert.deepEqual(pixels(texture), pixels(repeat), 'actual Canvas output is deterministic');
    for (const key of ['colorSpace', 'wrapS', 'wrapT', 'minFilter', 'magFilter', 'format', 'type',
      'flipY', 'premultiplyAlpha', 'generateMipmaps', 'anisotropy']) assert.equal(texture[key], old[key], key);
    assert.equal(texture.image.width * texture.image.height * 4, 262144);
    if (!form) assert.deepEqual(pixels(texture), pixels(old), 'non-target atlas bytes match literal published painter');
    else assert.notDeepEqual(pixels(texture), pixels(old), 'biome identity must reach the real raster');
    const digest = hash(pixels(texture));
    buildMips(texture, .42); buildMips(old, .42);
    assert.equal(texture.mipmaps.length, 9, 'actual complete existing coverage chain');
    assert.equal(texture.mipmaps.reduce((sum, image) => sum + image.data.byteLength, 0), 349524);
    assert.equal(texture.generateMipmaps, false); assert.equal(texture.anisotropy, 8);
    const levels = [256, 64, 16].map(size => stats(texture.mipmaps.find(image => image.width === size)));
    const oldLevels = [256, 64, 16].map(size => stats(old.mipmaps.find(image => image.width === size)));
    receipt.push({ form: form ?? 'legacy', seed, sha256: digest, levels, legacyLevels: oldLevels });
    emit(texture, `${form ?? 'legacy'}-${seed}`);
    if (form) emit(old, `before-${form}-${seed}`);
    if (form) {
      assertIdentity(form, levels);
      assertCoverageBudget(levels, oldLevels);
      assert.throws(() => assertIdentity(form, oldLevels),
        /four hard cutouts/, 'old painter is a live negative, not an accepted biome form');
    }
  } finally { texture.dispose(); old.dispose(); repeat.dispose(); }
}

function observePaths() {
  const calls = [], context = new Proxy({}, { set(target, key, value) { target[key] = value; return true; },
    get(target, key) { return target[key] ?? ((...args) => calls.push([key, ...args])); } });
  return { calls, context };
}
function checkAttachments() {
  const api = painterFixture({
    THREE, document: documentPort, _col: new THREE.Color(), P: {}, aniso: 4,
  });
  const leaf = observePaths(), x = 81, h = 193, lean = -3;
  api.paintWetCropLeaves(leaf.context, x, h, lean, 1);
  const roots = leaf.calls.filter(call => call[0] === 'moveTo');
  for (const [i, t] of [.36, .61].entries()) {
    const u = 1 - t;
    const expected = [u * u * x + 2 * u * t * (x + .4 * lean) + t * t * (x + lean),
      u * u * 258 + 2 * u * t * (256 - .6 * h) + t * t * (256 - h)];
    assert.ok(Math.hypot(roots[i][1] - expected[0], roots[i][2] - expected[1]) < 1e-10,
      'leaf root is independently on the actual stalk Bernstein curve');
  }
  const head = observePaths(); api.paintCropPanicle(head.context, 40, 50, 15, 4);
  const joints = head.calls.filter(call => call[0] === 'moveTo');
  assert.deepEqual(joints[0], ['moveTo', 40, 50], 'head starts at the exact stalk tip');
  for (let branch = 0; branch < 5; branch++) {
    const t = (branch + 1) / 6, u = 1 - t;
    const bx = u * u * 40 + 2 * u * t * 40.8 + t * t * 41.6;
    const by = u * u * 50 + 2 * u * t * 39.5 + t * t * 35;
    assert.ok(Math.hypot(joints[branch + 1][1] - bx, joints[branch + 1][2] - by) < 1e-10,
      'panicle branches start on their own curved spine');
  }
}

const rowNames = ['cropPlotAvoidsSpawns', 'cropPlotCornersAreLevel', 'appendCropRowGeometry', 'appendCropRows',
  'tryPlaceCropPlot', 'finalizeCropFields', 'placeCropFields', '_mustReplace', 'cropAttributeNormal'];
const rowSource = rowNames.map(name => declaration(source, name)).join('\n');
const rowFixture = await loadFixture(`${painterSource}\n${rowSource}\nplaceCropFields(); return group;`,
  ['THREE', 'document', '_col', 'aniso', 'seed', 'group', 'L', 'v', 'P', 'heightField', 'noVeg', 'mulberry32',
    'cropRowSegmentIsSupported', 'mergeGeometries', 'engineCtx', 'autumnCropRows', 'captureAutumnCropRow']);
function buildPlots(mapId, seed) {
  const form = getMapConfig(mapId).props.cropForm;
  const autumnCropRows = mapId === 'autumn' ? [] : null;
  const group = new THREE.Group(), L = { village: { x0: 800, x1: 900, z0: 800, z1: 900 },
    spawns: { player: { x: 900, z: 900 }, enemies: [] } };
  const field = { getHeightAt: (x, z) => x * .002 - z * .003, getNormalAt: () => ({ y: 1 }),
    getGroundType: () => 'grass', _roadDist: () => 1000, _noVeg: () => false };
  const api = rowFixture({
    THREE, document: documentPort, _col: new THREE.Color(), aniso: 4, seed, group, L, v: L.village,
    P: { cropFields: 2, cropForm: form }, heightField: field, noVeg: field._noVeg, mulberry32,
    autumnCropRows, captureAutumnCropRow,
    cropRowSegmentIsSupported, mergeGeometries, engineCtx: { setupShadowMaterial(material) { buildMips(material.map, .42); } },
  });
  assert.equal(api, group); assert.equal(group.children.length, 1);
  if (autumnCropRows) assert.ok(autumnCropRows.length > 0, 'Autumn executes the real emitted-row observer');
  return group.children[0];
}
function checkRows() {
  for (const seed of [2001, 1337]) {
    const old = buildPlots('verdant', seed);
    try {
      for (const mapId of ['autumn', 'delta']) {
        const actual = buildPlots(mapId, seed);
        try {
          for (const [key, attr] of Object.entries(old.geometry.attributes)) {
            assert.deepEqual(actual.geometry.attributes[key].array, attr.array, `actual placed ${key} bytes unchanged`);
          }
          assert.deepEqual(actual.geometry.index.array, old.geometry.index.array, 'plot admission/row spans unchanged');
          for (const key of ['alphaTest', 'alphaToCoverage', 'side', 'vertexColors', 'roughness', 'metalness',
            'envMapIntensity', 'transparent', 'depthWrite']) assert.equal(actual.material[key], old.material[key], key);
          assert.equal(actual.material.customProgramCacheKey(), 'world-crop-authored-normal-v1');
          assert.equal(Object.values(actual.material).filter(v => v?.isTexture).length, 1);
          assert.deepEqual([actual.castShadow, actual.receiveShadow, actual.matrixAutoUpdate], [false, false, false]);
        } finally { actual.geometry.dispose(); actual.material.map.dispose(); actual.material.dispose(); }
      }
    } finally { old.geometry.dispose(); old.material.map.dispose(); old.material.dispose(); }
  }
}

if (values.out) mkdirSync(values.out, { recursive: true });
const receipt = [];
const targets = MAP_IDS.filter(id => getMapConfig(id).props.cropForm);
assert.deepEqual(targets, ['autumn', 'delta'], 'only the two authored opt-ins change');
assert.equal(getMapConfig('autumn').props.cropForm, 'harvest');
assert.equal(getMapConfig('delta').props.cropForm, 'wet-upright');
let completed = false;
const failures = [];
try {
  const cases = MAP_IDS.filter(id => !targets.includes(id)).map(id => [getMapConfig(id).props.cropForm, 2516]);
  // Production terrain1337 -> props2002 -> crop stream2517, plus all R2 seeds.
  for (const form of ['harvest', 'wet-upright']) for (const seed of [2516, 2517, 1852, 0, 0xffffffff, 9347]) cases.push([form, seed]);
  for (const [form, seed] of cases) {
    try { checkRaster(form, seed, receipt); }
    catch (error) { failures.push(new Error(`${form ?? 'legacy'}/${seed}: ${error.message}`, { cause: error })); }
  }
  checkAttachments(); checkRows();
  const extraDraw = painterSource.replace('const headHue = crng()', 'crng(); const headHue = crng()');
  assert.notEqual(extraDraw, painterSource);
  const extraDrawFixture = await loadFixture(extraDraw + painterExports, painterBindings);
  const changed = counted(2516), original = counted(2516);
  const changedTexture = painter('harvest', extraDrawFixture)(changed.next);
  const originalTexture = legacyCropTexture(original.next, new THREE.Color(), 4);
  try { assert.throws(() => assertDraws(changed, original), /nine draws/, 'adding one cosmetic draw must fail'); }
  finally { changedTexture.dispose(); originalTexture.dispose(); }
  assert.throws(() => assertCoverageBudget([{ width: 256, covered: 11 }], [{ covered: 10 }]),
    /exceed legacy/, 'even unchanged texture capacity cannot excuse added coverage');
  if (failures.length) throw new AggregateError(failures, failures.map(error => error.message).join('\n'));
  completed = true;
  console.log(`cropBiomeIdentity: ${receipt.length} real Canvas cases; exact legacy/RNG/rows/resources; attached biome forms PASS`);
} finally {
  fixtureHook.deregister();
  if (values.out) writeFileSync(join(values.out, 'receipt.json'), JSON.stringify({ completed, failures: failures.map(error => error.message),
    proof: 'Native Canvas CPU raster/mips and actual construction; no native visual/performance acceptance', cases: receipt,
  }, null, 2));
}
