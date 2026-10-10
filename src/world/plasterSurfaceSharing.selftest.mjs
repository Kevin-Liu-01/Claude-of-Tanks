import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { releaseCsmShaderMaterial } from '../engine/lighting.ts';
import {
  disposeObject3DResources, registerRetainedObject3DResources, releaseObject3DGpuResources,
} from '../engine/resourceLifetime.ts';
import { normalTextureFromHeight, textureFromRgbaPixels } from './proceduralTexture.ts';
import { resolveStructureWindowStyle } from './structureInstanceAppearance.ts';
import { applyRockShaderHook, rockDressingFor } from './rockDressing.ts'; // round 75 item 6
import { STONE_SETTLE_M, applyStoneWallHook } from './stoneWallShader.ts'; // b14: the dry-stone walls' world-space hook
import { MUD_SLUMP_M, applyMudWallHook } from './mudWallShader.ts'; // b14: the mud walls' world-space hook
import { STRUCTURE_OCCLUSION_EXCLUDED_KINDS } from '../engine/structureOcclusion.ts'; // (2026-10-10, the shadows lane r4: the structures' pixel tag)

// 2026-10-01 (frozen pins retired): the control used to be an embedded copy of the 465a68f7c painter, tone, normal and
// surface formulas plus a copy of that commit's palette call sites, so any intended plaster repaint failed here. The
// control is now the CURRENT production palette with relief sharing disabled (every family paints its own normal and
// surface): sharing must be a pure allocation saving, with identical pixels, noise order, checkpoints and materials.
const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const sourced = readFileSync(new URL('./sourcedTextures.ts', import.meta.url), 'utf8');
function section(text, start, end) {
  const a = text.indexOf(start), b = text.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `production source section: ${start}`);
  return text.slice(a, b);
}
const math = section(source, 'function clamp(', '// ---------------------------------------------------------------------------');
const painter = section(source, 'function surfaceFromHeight(', 'function makeRoofTiles(');
const tone = section(terrain, 'const _toneCol =', '// ---------------------------------------------------------------------------');
const productionPainter = new Function('THREE', 'toTexture', 'normalFromHeight',
  `${stripTypeScriptTypes(math + tone + painter).replace(/^export /gm, '')}\nreturn makePlaster;`)(
  THREE, textureFromRgbaPixels, normalTextureFromHeight);
// Unshared control: the same production painter, ignoring the shared relief argument.
const controlPainter = (noi, anisotropy, tone) => productionPainter(noi, anisotropy, tone);
const productionPalette = section(source, '  const T = P.tones || {};', '  const roofT =');
// (batch 4: Skybridge round 2's glencanyon kit pours its plaster2 as board-formed concrete, whose relief is the
// formwork's, so a poured kit's plaster3 keeps a render's own relief: `pouredConcrete ? null : plaster2`)
assert.match(productionPalette, /makePlaster\(noi, aniso,\s+T\.plaster3 \|\| _tShift\(T\.plaster, [^)]*\), (?:pouredConcrete \? null : )?plaster2\)/,
  'plaster3 borrows plaster2 relief at the production call site');
function compilePalette(body, makePlaster) {
  // (batch 4: the palette reads a kit's poured concrete, regionalArchitecture?.surfaces.concrete; the receipt's palettes
  // carry no kit, so it is null and makeRegionalConcrete / applyTone are never reached)
  const noKit = () => { throw new Error('the receipt palettes carry no regional kit'); };
  return new Function('makePlaster', 'regionalArchitecture', 'makeRegionalConcrete', 'applyTone', `${stripTypeScriptTypes(
    `function* palette(noi, aniso, P) { ${body}\nreturn { plaster, plaster2, plaster3 }; }`)}\nreturn palette;`)(
    makePlaster, null, function* () { noKit(); }, noKit);
}
const generate = compilePalette(productionPalette, productionPainter);
const control = compilePalette(productionPalette, controlPainter);

const { values } = parseArgs({ options: { 'canvas-module': { type: 'string' } } });
if (values['canvas-module'] !== undefined) assert.ok(isAbsolute(values['canvas-module']));
const modulePath = values['canvas-module'] ?? createRequire(import.meta.url).resolve('@napi-rs/canvas');
const rasterizer = JSON.parse(readFileSync(join(dirname(modulePath), 'package.json'), 'utf8'));
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
assert.equal(rasterizer.name, '@napi-rs/canvas', 'native Canvas is required; never skip or substitute a stub');
assert.equal(rasterizer.version, packageJson.devDependencies['@napi-rs/canvas']);
const native = await import(pathToFileURL(modulePath).href);
const globals = new Map(['document', 'ImageData'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let canvasCount = 0;
globalThis.ImageData = native.ImageData;
globalThis.document = { createElement(tag) {
  assert.equal(tag, 'canvas'); canvasCount++;
  return native.createCanvas(1, 1);
} };
const ownedTextures = new Set();
const families = ['plaster', 'plaster2', 'plaster3'];
function allTextures(palette) { return new Set(Object.values(palette).flatMap(Object.values)); }
function textureSnapshot(texture) {
  const image = texture.image;
  const rgba = image.getContext('2d').getImageData(0, 0, image.width, image.height).data;
  const state = {};
  for (const key of ['mapping', 'channel', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'anisotropy',
    'format', 'internalFormat', 'type', 'colorSpace', 'generateMipmaps', 'premultiplyAlpha',
    'flipY', 'unpackAlignment', 'rotation', 'matrixAutoUpdate', 'version', 'isCanvasTexture']) state[key] = texture[key];
  for (const key of ['offset', 'repeat', 'center', 'matrix']) state[key] = texture[key].toArray();
  state.source = { version: texture.source.version, dataReady: texture.source.dataReady };
  state.mipmaps = texture.mipmaps.slice();
  return { size: [image.width, image.height], rgba: Buffer.from(rgba), state };
}
function paletteSnapshot(palette) {
  return Object.fromEntries(families.map(name => [name,
    Object.fromEntries(Object.entries(palette[name]).map(([key, value]) => [key, textureSnapshot(value)]))]));
}
function noise(seed) {
  let state = seed + 7, rngCalls = 0, calls = 0;
  const rng = () => {
    rngCalls++; state |= 0; state = state + 0x6D2B79F5 | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const noi = new SimplexNoise({ random: rng });
  const original = noi.noise.bind(noi), order = createHash('sha256'), coordinates = Buffer.alloc(16);
  noi.noise = (x, y) => {
    calls++; coordinates.writeDoubleLE(x, 0); coordinates.writeDoubleLE(y, 8); order.update(coordinates);
    return original(x, y);
  };
  return { noi, finish: () => ({ calls, rngCalls, tail: [rng(), rng(), rng()], order: order.digest('hex') }) };
}
function build(api, sample) {
  const probe = noise(sample.seed), before = canvasCount;
  const steps = api(probe.noi, sample.aniso, { tones: sample.tones }), yields = [], checkpointCanvases = [];
  let next;
  do {
    next = steps.next();
    if (!next.done) { yields.push(next.value); checkpointCanvases.push(canvasCount - before); }
  } while (!next.done);
  allTextures(next.value).forEach(texture => ownedTextures.add(texture));
  return { palette: next.value, canvases: canvasCount - before, noise: probe.finish(), yields, checkpointCanvases };
}
function assertSharing(palette) {
  for (const key of ['normal', 'surface']) {
    assert.equal(palette.plaster2[key], palette.plaster3[key], `${key}: same world-local Texture, not just pixels`);
    assert.notEqual(palette.plaster[key], palette.plaster2[key], `${key}: sourced primary is exclusive`);
  }
  assert.equal(new Set(families.map(name => palette[name].albedo)).size, 3, 'all pigment textures stay independent');
}

const materialStage = section(source, '  const windowStyle = resolveStructureWindowStyle(mapId);',
  '  const buckets: CompletePropsBuckets =');
const roof = new Function('THREE', `${stripTypeScriptTypes(section(source,
  'function makeRoofMaterial(', 'function buildStoneCourseEdges('))}\nreturn makeRoofMaterial;`)(THREE);
// round 75 (2026-09-26): the 'steel' atlas family joins the material stage (propsSteelAtlas.ts)
const remaining = ['roofT', 'stone', 'fieldStone', 'fieldMud', 'wood', 'straw', 'hay', 'structureWood', 'structureCanvas', 'burlap', 'structureMetal', 'vehiclePaint', 'steel', 'rockDetail'];
const materialFactory = new Function('THREE', 'resolveStructureWindowStyle', 'makeRoofMaterial',
  'registerRetainedObject3DResources', '_mustReplace', 'rockDressingFor', 'applyRockShaderHook',
  'STONE_SETTLE_M', 'applyStoneWallHook', 'MUD_SLUMP_M', 'applyMudWallHook', 'STRUCTURE_OCCLUSION_EXCLUDED_KINDS', `${stripTypeScriptTypes(`
  function* materialSteps(group, engineCtx, mapId, atlases, grimeTex) {
    const { ${[...families, ...remaining].join(', ')} } = atlases, P = {};
    const regionalArchitecture = null; // a map without a regional kit (maps/regional): no weathered materials
    ${materialStage}
    return { mats, retainedSurfaceMaterials };
  }`)}\nreturn materialSteps;`)(THREE, resolveStructureWindowStyle, roof, registerRetainedObject3DResources,
  (text, anchor, replacement) => { assert.ok(text.includes(anchor)); return text.replace(anchor, replacement); }, rockDressingFor, applyRockShaderHook,
  STONE_SETTLE_M, applyStoneWallHook, MUD_SLUMP_M, applyMudWallHook, STRUCTURE_OCCLUSION_EXCLUDED_KINDS);
function materialFixture(palette, mapId = 'verdant', attached = false) {
  const group = new THREE.Group(), scene = new THREE.Scene(); scene.add(group);
  const dummy = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  ownedTextures.add(dummy);
  const atlases = { ...palette, ...Object.fromEntries(remaining.map(key => [key,
    { albedo: dummy, normal: dummy, surface: dummy }])) };
  const csm = { shaders: new Map(), cascades: 4, fade: true, camera: new THREE.PerspectiveCamera(),
    maxFar: 520, breaks: [0.1, 0.3, 0.6, 1], _getExtendedBreaks: CSM.prototype._getExtendedBreaks };
  const engine = { setupShadowMaterial(material, extraHook) {
    CSM.prototype.setupMaterial.call(csm, material);
    if (!extraHook) return;
    const hook = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => { hook(shader, renderer); extraHook(shader, renderer); };
  } };
  const steps = materialFactory(group, engine, mapId, atlases, dummy);
  let next; do { next = steps.next(); } while (!next.done);
  const { mats } = next.value;
  if (attached) for (const key of families) group.add(new THREE.Mesh(new THREE.PlaneGeometry(), mats[key]));
  return { group, scene, csm, mats, dummy, textures: new Set([...allTextures(palette), dummy]) };
}
function materialSnapshot(material) {
  // The byte snapshots below already cover images. Seed Three's serializer
  // cache with texture identities so material comparison does not encode PNGs.
  const textures = Object.fromEntries(Object.values(material).filter(value => value?.isTexture)
    .map(texture => [texture.uuid, { uuid: texture.uuid }]));
  const json = material.toJSON({ textures, images: {} }); delete json.uuid;
  for (const key of ['map', 'normalMap', 'roughnessMap', 'aoMap']) json[key] = textureSnapshot(material[key]);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, null);
  return { json, cacheKey: material.customProgramCacheKey(), vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader, uniformNames: Object.keys(shader.uniforms).sort() };
}
function evict(fixture) {
  const receipt = disposeObject3DResources(fixture.group, { onDispose(kind, resource) {
    if (kind === 'material') assert.equal(releaseCsmShaderMaterial(fixture.csm, resource), true);
  } });
  assert.equal(fixture.group.parent, null); assert.equal(fixture.csm.shaders.size, 0);
  fixture.textures.forEach(texture => ownedTextures.delete(texture));
  return receipt;
}
const swap = new Function(stripTypeScriptTypes(section(sourced, 'function swapTexture(', '\n}\n') + '\n}')
  + '\nreturn swapTexture;')();
const samples = [
  { seed: 0, aniso: 1, tones: {} },
  { seed: 721, aniso: 4, tones: { plaster: (h, s, l) => [h - 0.09, s * 0.7, l * 0.82] } },
  { seed: -917, aniso: 8, tones: { plaster2: (h, s, l) => [h + 0.4, s * 1.3, l * 1.1],
    plaster3: (h, s, l) => [h - 0.7, s * 0.1, l * 0.75] } },
  { seed: 0xffffffff, aniso: 16, tones: { plaster: () => [1.4, 1.5, -0.2],
    plaster2: () => [-0.2, -1, 1.3], plaster3: (h, s, l) => [h, s, l] } },
];
const receipts = [];
try {
  for (const sample of samples) {
    const expected = build(control, sample), actual = build(generate, sample);
    console.log(`plaster pixels/materials: seed=${sample.seed}, anisotropy=${sample.aniso}`);
    assert.deepEqual(paletteSnapshot(actual.palette), paletteSnapshot(expected.palette), 'native RGBA and texture-state parity');
    assert.deepEqual(actual.noise, expected.noise, 'exact noise call order and RNG continuation');
    assert.deepEqual(actual.yields, expected.yields, 'unchanged three build checkpoints');
    assertSharing(actual.palette);
    assert.equal(expected.canvases, 9); assert.equal(actual.canvases, 7, 'avoid allocations, not post-build disposal');
    assert.deepEqual(expected.checkpointCanvases, [3, 6, 9]);
    assert.deepEqual(actual.checkpointCanvases, [3, 6, 7], 'pair created only at the second palette, reused at the third');
    assert.equal(allTextures(expected.palette).size - allTextures(actual.palette).size, 2);
    for (const mapId of ['verdant', 'winter']) {
      const before = materialFixture(expected.palette, mapId), after = materialFixture(actual.palette, mapId);
      for (const key of families) assert.deepEqual(materialSnapshot(after.mats[key]), materialSnapshot(before.mats[key]),
        `${mapId}/${key}: actual CSM/material/shader state is unchanged`);
      // These temporary fixtures borrow the palettes; release only their own materials/dummy.
      for (const fixture of [before, after]) {
        for (const material of Object.values(fixture.mats)) {
          releaseCsmShaderMaterial(fixture.csm, material); material.dispose();
        }
        fixture.dummy.dispose(); ownedTextures.delete(fixture.dummy);
      }
    }
    receipts.push({ seed: sample.seed, anisotropy: sample.aniso, canvasesBefore: expected.canvases,
      canvasesAfter: actual.canvases, texturesSaved: 2, pixelsSaved: 2 * 256 * 256,
      primaryAlbedoSha256: createHash('sha256').update(textureSnapshot(actual.palette.plaster.albedo).rgba).digest('hex') });
    allTextures(expected.palette).forEach(texture => { texture.dispose(); ownedTextures.delete(texture); });
    allTextures(actual.palette).forEach(texture => { texture.dispose(); ownedTextures.delete(texture); });
  }

  for (const attached of [false, true]) {
    const first = build(generate, samples[1]).palette, second = build(generate, samples[1]).palette;
    const owner = materialFixture(first, 'verdant', attached), other = materialFixture(second);
    for (const texture of owner.textures) assert.ok(!other.textures.has(texture), 'no cross-world retention/cache');
    const counts = new Map();
    for (const texture of [...owner.textures, ...other.textures]) {
      counts.set(texture, 0); texture.addEventListener('dispose', () => counts.set(texture, counts.get(texture) + 1));
    }
    const unchanged = paletteSnapshot(first);
    for (let cycle = 1; cycle <= 3; cycle++) {
      assert.equal(releaseObject3DGpuResources(owner.group).textures, 8, '7 distinct plaster textures plus dummy, including empty buckets');
      assert.equal(owner.group.parent, owner.scene);
      assert.deepEqual(paletteSnapshot(first), unchanged, 'same CPU images/identities survive GPU suspension');
      for (const texture of owner.textures) assert.equal(counts.get(texture), cycle);
      for (const texture of other.textures) assert.equal(counts.get(texture), 0);
    }
    assert.equal(evict(owner).textures, 8);
    for (const texture of owner.textures) assert.equal(counts.get(texture), 4, 'shared pair disposed once per operation');
    for (const texture of other.textures) assert.equal(counts.get(texture), 0, 'eviction cannot invalidate another world');
    assert.equal(evict(other).textures, 8);
  }

  const primary = build(generate, samples[2]).palette;
  const variants = [textureSnapshot(primary.plaster2.normal), textureSnapshot(primary.plaster2.surface)];
  for (const texture of Object.values(primary.plaster)) swap(texture, native.createCanvas(16, 16));
  assertSharing(primary);
  assert.deepEqual([textureSnapshot(primary.plaster3.normal), textureSnapshot(primary.plaster3.surface)], variants,
    'actual sourced image-swap function cannot alter procedural relief');
  // a regional architecture kit (maps/regional) passes its own subset of the same primary sets
  const sourcedCall = /applySourcedBuildings\(([^]*?)mapId, P, sourceApplication/.exec(source)?.[1] ?? '';
  assert.match(sourcedCall, /: \{ plaster, roof: roofT, wood, stone \}/,
    'only the primary plaster enters the sourced replacement owner');
  assert.doesNotMatch(sourcedCall, /plaster[23]/, 'no plaster variant enters the sourced replacement owner, kit or not');

  // Negative controls: reject primary sharing even though its initial relief
  // pixels happen to match; reject a changed relief byte independently.
  const badOwner = { ...primary, plaster3: { ...primary.plaster3, normal: primary.plaster.normal } };
  assert.throws(() => assertSharing(badOwner), assert.AssertionError);
  const right = build(control, samples[0]), shared = build(generate, samples[0]);
  // Hash only this deliberate mismatch: formatting a 256² Buffer diff can
  // dwarf the test itself. Positive controls above compare every native byte.
  const reliefHash = palette => createHash('sha256')
    .update(textureSnapshot(palette.plaster3.normal).rgba).digest('hex');
  assert.equal(reliefHash(shared.palette), reliefHash(right.palette), 'shared plaster3 relief equals its own unshared paint');
  const tampered = right.palette.plaster3.normal.image;
  const context = tampered.getContext('2d'), image = context.getImageData(0, 0, 1, 1);
  image.data[0] ^= 1; context.putImageData(image, 0, 0);
  assert.throws(() => assert.equal(reliefHash(shared.palette), reliefHash(right.palette)), assert.AssertionError,
    'the relief parity comparison detects a one-byte change');
  console.log(JSON.stringify({ ok: true, evidence: 'native Canvas CPU pixels/materials; no GPU or frame timing claim',
    rasterizer: { name: rasterizer.name, version: rasterizer.version }, receipts, ownershipCases: 2 }, null, 2));
} finally {
  for (const texture of ownedTextures) texture.dispose();
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
}
