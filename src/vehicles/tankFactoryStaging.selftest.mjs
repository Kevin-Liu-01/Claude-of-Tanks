// Staged (createTankSteps) construction must publish exactly the synchronous createTank result, own and
// release every private resource on cancellation or failure, and keep its timing receipts honest. This
// does not certify native pixels or wall-time improvements.
// 2026-10-01 (owner: retire frozen pins): the six pinned material-inclusive original-output goldens, the
// historical shadow-submission and shoe-material projections that reached them and their oracle-only
// negative controls are gone; the fleet geometry ledger owns whole-tank change detection. Live staged ==
// sync equality, lifetime/ownership, shoe-material and shadow-batch contracts remain.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
const root = fileURLToPath(new URL('../..', import.meta.url));
const require = createRequire(new URL('../../package.json', import.meta.url));
const { createCanvas, ImageData, Path2D } = require('@napi-rs/canvas');
globalThis.ImageData = ImageData;
globalThis.Path2D = Path2D;
globalThis.document = { createElement(tag) { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };
const coreUrl = pathToFileURL(root + '/src/vehicles/tankFactoryCore.ts').href;
const facadeUrl = pathToFileURL(root + '/src/vehicles/fleetFactory.ts').href;
const facadeCoreUrl = coreUrl + '?factory-staging-facade-test';
const candidateFacadeUrl = facadeUrl + '?factory-staging-test';
const candidateCore = readFileSync(new URL(coreUrl), 'utf8');
let capture, decorStage;
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === './tankFactoryCore.ts' && context.parentURL === candidateFacadeUrl) return next(facadeCoreUrl, context);
    return next(specifier, context);
  },
  load(href, context, next) {
    const result = next(href, context);
    if (![coreUrl, facadeCoreUrl].includes(href)) return result;
    let source = candidateCore.replace('    // No earlier yield: all core resources now belong to visual.dispose().',
      '    globalThis.__factoryStagingCapture({ visual, disposables, mats });\n    // No earlier yield: all core resources now belong to visual.dispose().');
    source = source.replace('      const pausedAt = performance.now();',
      '      globalThis.__factoryStagingSlice(result.value);\n      const pausedAt = performance.now();');
    source = source.replace('    finalizeVehicleNightLighting(root);',
      "    if (globalThis.__factoryStagingFailFinalize) throw new Error('injected finalizer failure');\n    finalizeVehicleNightLighting(root);");
    return { ...result, source };
  },
});
globalThis.__factoryStagingCapture = value => { capture = value; };
globalThis.__factoryStagingSlice = value => { decorStage = value.stage; };
await import('./tankFactory.ts');
const candidate = await import(coreUrl);
const digest = value => createHash('sha256').update(value).digest('hex');
function attribute(value) {
  const array = value.isInterleavedBufferAttribute ? value.data.array : value.array;
  return { type: array.constructor.name, itemSize: value.itemSize, normalized: value.normalized,
    bytes: digest(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)) };
}
function material(value) {
  return { name: value.name, type: value.type, color: value.color?.toArray(),
    roughness: value.roughness, metalness: value.metalness, opacity: value.opacity,
    transparent: value.transparent, side: value.side, alphaTest: value.alphaTest,
    depthWrite: value.depthWrite, depthTest: value.depthTest, vertexColors: value.vertexColors,
    emissive: value.emissive?.toArray(), emissiveIntensity: value.emissiveIntensity,
    polygonOffset: value.polygonOffset, polygonOffsetFactor: value.polygonOffsetFactor,
    polygonOffsetUnits: value.polygonOffsetUnits, key: value.customProgramCacheKey(),
    maps: ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'emissiveMap']
      .map(key => { const texture = value[key]; return texture ? { key, name: texture.name,
        colorSpace: texture.colorSpace, repeat: texture.repeat.toArray(), offset: texture.offset.toArray(),
        wrapS: texture.wrapS, wrapT: texture.wrapT, width: texture.image?.width, height: texture.image?.height,
        data: ArrayBuffer.isView(texture.image?.data) ? digest(texture.image.data) : null } : null; }),
  };
}
function receipt(visual) {
  const rows = [];
  visual.root.traverse(object => {
    const row = { name: object.name, type: object.type, visible: object.visible,
      children: object.children.map(child => ({ name: child.name, type: child.type })),
      position: object.position.toArray(), quaternion: object.quaternion.toArray(), scale: object.scale.toArray(),
      matrix: object.matrix.elements.slice(), matrixWorld: object.matrixWorld.elements.slice(),
      layers: object.layers.mask, renderOrder: object.renderOrder,
      castShadow: object.castShadow, receiveShadow: object.receiveShadow,
      hitboxRole: object.userData.combatHitboxRole,
    };
    if (object.geometry) row.geometry = { attributes: Object.entries(object.geometry.attributes)
      .map(([key, value]) => [key, attribute(value)]), index: object.geometry.index && attribute(object.geometry.index),
      groups: object.geometry.groups, drawRange: object.geometry.drawRange };
    if (object.material) row.material = (Array.isArray(object.material) ? object.material : [object.material]).map(material);
    if (object.instanceMatrix) row.instanceMatrix = attribute(object.instanceMatrix);
    if (object.instanceColor) row.instanceColor = attribute(object.instanceColor);
    if (object.isLOD) row.lod = object.levels.map(level => ({ distance: level.distance, hysteresis: level.hysteresis }));
    rows.push(row);
  });
  return { rows, dims: visual.dims, boundingRadiusM: visual.boundingRadiusM,
    presentationAnchor: visual.presentationAnchor, assetPresentationAnchor: visual.assetPresentationAnchor,
    presentationFloorYM: visual.presentationFloorYM, presentationTrackFloorYM: visual.presentationTrackFloorYM,
    decor: visual.root.userData.__decorSummary, savedDraws: visual.root.userData.staticBatchSavedDraws,
    detailGroups: visual.root.userData.battleDetailGroupCount, detailCount: visual.root.userData.battleDetailObjectCount,
  };
}
// Canonical shoes take their colour from the instance palette over an exactly white base, times their own worn-steel
// vertex colours; a dark multiplier or a stream without the colours would blacken them in every staged/sync build.
const TRACK_SHOE_NAMES = ['gearTrackPads', 'gearTrackPadsSimplified'];
function assertShoeMaterial(visual) {
  const shoes = [];
  visual.root.traverse(mesh => {
    if (!mesh.isMesh) return;
    if (TRACK_SHOE_NAMES.includes(mesh.name)) shoes.push(mesh);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (material.userData.appearanceColorSource === 'instance-palette') {
        assert.ok(TRACK_SHOE_NAMES.includes(mesh.name), 'only canonical shoes may use the instance palette');
      }
    }
  });
  assert.deepEqual(shoes.map(mesh => mesh.name).sort(), [...TRACK_SHOE_NAMES].sort(),
    'both canonical shoe meshes must appear exactly once');
  const material = shoes[0].material;
  assert.ok(!Array.isArray(material), 'canonical shoes use one material');
  assert.equal(material.name, 'cot:track-pad');
  assert.equal(material.userData.appearanceRole, 'trackPad');
  assert.equal(material.userData.appearanceColorSource, 'instance-palette');
  assert.deepEqual(material.color.toArray(), [1, 1, 1], 'actual shoe base must remain exactly white');
  // Fleet lane round 1 (2026-10-07): the shoes read their worn-steel vertex colours (tankFactoryCore bakeTrackShoeWear)
  // under the instance palette, so the material requests vertex colours and BOTH shoe streams must carry them; a
  // stream without the attribute would multiply the palette by black.
  assert.equal(material.vertexColors, true, 'actual shoes read their worn-steel vertex colours');
  for (const mesh of shoes) {
    assert.equal(mesh.material, material, 'near and far shoes share the actual material');
    assert.equal(mesh.isInstancedMesh, true);
    assert.ok(mesh.count > 0 && mesh.instanceColor?.count >= mesh.count);
    const wear = mesh.geometry.getAttribute('color');
    assert.ok(wear && wear.count === mesh.geometry.getAttribute('position').count,
      'every shoe stream must carry its worn-steel vertex colours');
  }
  visual.root.traverse(mesh => {
    if (!mesh.isMesh) return;
    if ((Array.isArray(mesh.material) ? mesh.material : [mesh.material]).includes(material)) {
      assert.ok(TRACK_SHOE_NAMES.includes(mesh.name), 'only canonical shoes may share the track-pad material');
    }
  });
}
// Negative controls: the shoe-material gate bites, and rejected controls leave the candidate unchanged.
function verifyShoeMaterialGuards(visual) {
  const actualHash = digest(JSON.stringify(receipt(visual)));
  const shoe = visual.root.getObjectByName('gearTrackPads');
  const material = shoe.material, color = material.color.clone();
  try {
    material.color.setHex(0x30312f);
    assert.throws(() => assertShoeMaterial(visual), /actual shoe base must remain exactly white/);
  } finally { material.color.copy(color); }
  try {
    material.vertexColors = false;
    assert.throws(() => assertShoeMaterial(visual), /read their worn-steel vertex colours/);
  } finally { material.vertexColors = true; }
  const wear = shoe.geometry.getAttribute('color');
  try {
    shoe.geometry.deleteAttribute('color');
    assert.throws(() => assertShoeMaterial(visual), /must carry its worn-steel vertex colours/);
  } finally { shoe.geometry.setAttribute('color', wear); }
  const unrelated = new THREE.Mesh(shoe.geometry, material);
  unrelated.name = 'unrelated-material-user';
  visual.root.add(unrelated);
  try {
    assert.throws(() => assertShoeMaterial(visual), /only canonical shoes/);
  } finally { visual.root.remove(unrelated); }
  assert.equal(digest(JSON.stringify(receipt(visual))), actualHash,
    'all rejected controls leave the actual candidate unchanged');
}
let checks = 0;
let fixtures = 0;
function check(value, message) { assert.ok(value, message); checks++; }
function equal(a, b, message) { assert.deepEqual(a, b, message); checks++; }
function drain(steps, visit = () => {}) {
  let result = steps.next();
  while (!result.done) { equal(result.value, undefined, 'public checkpoints never publish a visual or mutable work state'); visit(); result = steps.next(); }
  return result.value;
}
function shadowRegistry(fail = false) {
  const foreign = {}, registered = new Map([[foreign, 'unrelated live material']]);
  const context = { setupShadowMaterial(material, extraHook) {
    registered.set(material, null);
    material.defines ??= {};
    material.defines.USE_CSM = true;
    if (fail && extraHook) throw new Error('injected decoration material failure');
    return material;
  }, releaseShadowMaterial(material) { return registered.delete(material); } };
  return { context, registered, foreign, assertEmpty() {
    equal([...registered.keys()], [foreign], 'canceled private factory leaves no CSM keys and preserves foreign registry entries');
  } };
}
const baseOpts = { proceduralOnly: true, geometryReceipt: true, quality: 'ai', camoSeed: 4242, decor: true };
for (const [id, options] of [
  ['m1a1', baseOpts], ['strv103', baseOpts],
  ['m1a1', { ...baseOpts, geometryQuality: 'low' }],
  ['m1a1', { ...baseOpts, batchStatic: true, battleDetailLod: true }],
  ['merkava1b', { ...baseOpts, geometryQuality: 'low', batchStatic: true, battleDetailLod: true }],
  ['m1a1', { ...baseOpts, decor: false }],
]) {
  const synchronous = candidate.createTank(id, null, options);
  let staged;
  try {
    capture = undefined;
    const steps = candidate.createTankSteps(id, null, options);
    equal(capture, undefined, 'constructing an iterator performs no early core work');
    let first = true;
    staged = drain(steps, () => {
      check(capture?.visual?.root.children.length > 0, 'first checkpoint owns a completed core visual');
      equal(capture.visual.root.parent, null, 'private visual never published into a scene across checkpoints');
      if (first) equal(capture.visual.root.userData.__decorApplied, undefined, 'first checkpoint precedes decoration');
      first = false;
    });
    if (fixtures++ === 0) verifyShoeMaterialGuards(synchronous);
    assertShoeMaterial(synchronous); checks++;
    if (options.batchStatic) check(synchronous.root.getObjectByName('articulatedShadowBatch')?.isBatchedMesh,
      `${id}: batched construction retains the actual published articulated shadow batch`);
    equal(receipt(staged), receipt(synchronous), `${id}: stepped output preserves exact original geometry/material/order/pose`);
    check(Number.isFinite(staged.root.userData.decorBuildMs), 'decoration active time is retained');
    check(staged.root.userData.decorYieldMs >= 0, 'decoration wait is separately retained');
  } finally { synchronous.dispose(); staged?.dispose(); }
}

const originalDispose = THREE.BufferGeometry.prototype.dispose;
const originalMaterialDispose = THREE.Material.prototype.dispose;
const originalTextureDispose = THREE.Texture.prototype.dispose;
const disposed = new Map();
function observeDispose(originalMethod) { return function () { disposed.set(this, (disposed.get(this) ?? 0) + 1); return originalMethod.call(this); }; }
THREE.BufferGeometry.prototype.dispose = observeDispose(originalDispose);
THREE.Material.prototype.dispose = observeDispose(originalMaterialDispose);
THREE.Texture.prototype.dispose = observeDispose(originalTextureDispose);
try {
  for (const target of ['core-ready', 'surface-index', 'manifest-row', 'material-bucket', 'publish']) {
    for (const operation of ['return', 'throw']) {
      disposed.clear(); capture = undefined; decorStage = undefined;
      const registry = shadowRegistry();
      const steps = candidate.createTankSteps('m1a1', registry.context, baseOpts);
      let result = steps.next();
      check(!result.done && capture, 'cancellable core checkpoint reached');
      if (target !== 'core-ready') {
        while (!result.done && decorStage !== target) result = steps.next();
        check(!result.done && decorStage === target, `${target}: actual decoration checkpoint reached`);
      }
      const { visual, disposables, mats } = capture;
      const owned = new Set([...disposables, ...Object.values(mats).filter(value => value?.isMaterial || value?.isTexture)]);
      if (operation === 'return') steps.return(undefined);
      else assert.throws(() => steps.throw(new Error('factory cancellation')), /factory cancellation/);
      for (const resource of owned) check((disposed.get(resource) ?? 0) >= 1, `${target}/${operation}: completed private core resource released`);
      equal(visual.root.parent, null, 'canceled root remains absent from scene');
      equal(visual.root.userData.__decorApplied, undefined, 'nested IteratorClose clears an unpublished decoration claim');
      equal(steps.next().done, true, 'abandoned generator cannot resume');
      registry.assertEmpty();
    }
  }
  disposed.clear(); capture = undefined;
  const finalizerRegistry = shadowRegistry();
  globalThis.__factoryStagingFailFinalize = true;
  assert.throws(() => drain(candidate.createTankSteps('m1a1', finalizerRegistry.context, baseOpts)), /injected finalizer failure/);
  for (const resource of capture.disposables) check((disposed.get(resource) ?? 0) >= 1,
    'finalization failure releases core and successfully transferred decoration resources');
  finalizerRegistry.assertEmpty();
  globalThis.__factoryStagingFailFinalize = false;
} finally {
  THREE.BufferGeometry.prototype.dispose = originalDispose;
  THREE.Material.prototype.dispose = originalMaterialDispose;
  THREE.Texture.prototype.dispose = originalTextureDispose;
  globalThis.__factoryStagingFailFinalize = false;
}

// Actual decorated errors remain optional for sync callers but are fatal and
// ownership-clean for stepped construction. This getter fails inside material
// acquisition, not in the outer core builder's validated engine adapter.
let errorCapture;
const warnings = [], warn = console.warn;
const failureRegistry = shadowRegistry(true);
console.warn = (...args) => warnings.push(args);
try {
  const legacy = candidate.createTank('m1a1', failureRegistry.context, baseOpts);
  errorCapture = legacy;
  check(warnings.length > 0, 'sync caller retains decoration warning/null fallback');
  assert.throws(() => drain(candidate.createTankSteps('m1a1', failureRegistry.context, baseOpts)), /injected decoration material failure/);
} finally { errorCapture?.dispose(); console.warn = warn; }
failureRegistry.assertEmpty();

const clockDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
let clock = 0;
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => clock } });
let timed;
try {
  let yields = 0;
  timed = drain(candidate.createTankSteps('m1a1', null, baseOpts), () => { clock += 17; yields++; });
  equal(timed.root.userData.decorBuildMs, 0, 'scheduled pauses are not mislabeled as synchronous decoration cost');
  equal(timed.root.userData.decorYieldMs, 17 * (yields - 1), 'only nested decoration waits enter its wait receipt');
  equal(timed.root.userData.decorCheckpointCount, yields - 1, 'first completed-core pause is not decoration work');
} finally { timed?.dispose(); Object.defineProperty(globalThis, 'performance', clockDescriptor); }

const facade = await import(candidateFacadeUrl);
assert.throws(() => facade.createTankSteps('m1a1', null, baseOpts), /not loaded/,
  'new demand facade checks readiness synchronously before returning any iterator');
await facade.ensureTankBuilder('m1a1');
const facadeVisual = drain(facade.createTankSteps('m1a1', null, baseOpts));
equal(facadeVisual.specId, 'm1a1', 'ready demand facade delegates to the staged core');
facadeVisual.dispose();
// Garage uses rendered paint, decorated HIGH geometry, a static rest pose and
// articulation-local batches. Slicing must preserve this exact caller policy.
for (const id of ['m1a1', 'challenger_3x', 'ariete_c2_x']) {
  await facade.ensureTankBuilder(id);
  const options = { camoSeed: 4200, quality: 'ai', staticPreview: true,
    batchStatic: true, eraVisualBindingReceipt: false };
  const synchronous = facade.createTank(id, null, options);
  const staged = drain(facade.createTankSteps(id, null, options));
  try {
    equal(receipt(staged), receipt(synchronous), `${id}: exact Garage geometry, materials, shadows and rig`);
    equal(staged.root.parent, null, 'completed Garage graph remains private until caller publication');
  } finally { staged.dispose(); synchronous.dispose(); }
}
hook.deregister();
console.log(JSON.stringify({ checks, fixtures, scope: "headless staged == sync equality and lifetime proof; not native performance acceptance" }));
