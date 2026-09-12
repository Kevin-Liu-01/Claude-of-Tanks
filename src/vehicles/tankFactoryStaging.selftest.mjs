// Exact geometry/material/order goldens captured from the pre-staging core.
// This does not certify native pixels or wall-time improvements. Original
// fingerprints stay immutable. The exact 2963f43c2 shadow-submission call is
// disabled only for a historical receipt; current sync/staged outputs retain
// their full shadow batches and are compared without normalization.
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
const shadowBatchCall = '    if (batchStatic) installArticulatedShadowBatch(root, proceduralShadowSources);';
const sentinelCall = '    if (batchStatic) detachEmptyLodSentinels(root);';
assert.equal(candidateCore.split(sentinelCall).length, 2, 'one runtime-only empty sentinel finalizer');
assert.equal(candidateCore.split(shadowBatchCall).length, 2,
  'historical projection requires exactly the published shadow finalizer call');
// 2026-09-12 fleet visual standard batch: the six original-output goldens were
// refreshed against the current core (camouflaged detail buckets, pressed-disc
// wheel motif, terminal-surface-fit-r2 muzzle seat); the staged-vs-sync exact
// equality below is the staging claim and is unchanged.
const goldenSourceSha256 = 'b7a453af76ae13a972526c38a46c6beee44bdfc90f042ab1eddf80eb781740a3';
const goldenReceipts = [
  {
    "id": "m1a1",
    "options": {
      "proceduralOnly": true,
      "geometryReceipt": true,
      "quality": "ai",
      "camoSeed": 4242,
      "decor": true
    },
    "sha256": "90ceb72a00b7d0a579388a80c7faddf3e784252d70d18f58d76e3035e442ad4a"
  },
  {
    "id": "strv103",
    "options": {
      "proceduralOnly": true,
      "geometryReceipt": true,
      "quality": "ai",
      "camoSeed": 4242,
      "decor": true
    },
    "sha256": "6fc95ddf897b30624c76b0af72f0aa7071330ba0bfe9857e1b2ec72ecf4fd261"
  },
  {
    "id": "m1a1",
    "options": {
      "proceduralOnly": true,
      "geometryReceipt": true,
      "quality": "ai",
      "camoSeed": 4242,
      "decor": true,
      "geometryQuality": "low"
    },
    "sha256": "07c7d431cc3a54f1d4378376602d68308c69b0bf86e101776225931db35c10ba"
  },
  {
    "id": "m1a1",
    "options": {
      "proceduralOnly": true,
      "geometryReceipt": true,
      "quality": "ai",
      "camoSeed": 4242,
      "decor": true,
      "batchStatic": true,
      "battleDetailLod": true
    },
    "sha256": "1c95b7fc9424f74be644137f93076daf29bed581abe5399c62a4de1e57964555"
  },
  {
    "id": "merkava1b",
    "options": {
      "proceduralOnly": true,
      "geometryReceipt": true,
      "quality": "ai",
      "camoSeed": 4242,
      "decor": true,
      "geometryQuality": "low",
      "batchStatic": true,
      "battleDetailLod": true
    },
    "sha256": "53deb8307380c2ee2d34455271d9d908c5eddb9874b2c32c71adf2cd73310db5"
  },
  {
    "id": "m1a1",
    "options": {
      "proceduralOnly": true,
      "geometryReceipt": true,
      "quality": "ai",
      "camoSeed": 4242,
      "decor": false
    },
    "sha256": "fb0166b3a80dcb426b61f8549a51593f14c90b1274a42cb9e6813bf8b4d0351b"
  }
];
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
    source = source.replace(shadowBatchCall,
      '    if (batchStatic && !globalThis.__factoryStagingHistoricalShadow) installArticulatedShadowBatch(root, proceduralShadowSources);');
    source = source.replace(sentinelCall,
      '    if (batchStatic && !globalThis.__factoryStagingHistoricalShadow) detachEmptyLodSentinels(root);');
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
function historicalShadowReceipt(id, options, synchronous) {
  if (!options.batchStatic) return receipt(synchronous);
  let historical;
  globalThis.__factoryStagingHistoricalShadow = true;
  try {
    historical = candidate.createTank(id, null, options);
    assert.equal(historical.root.getObjectByName('articulatedShadowBatch'), undefined,
      'historical comparison alone retains the original proxy submissions');
    assert.ok(synchronous.root.getObjectByName('articulatedShadowBatch')?.isBatchedMesh,
      'current comparison must retain the actual published shadow batch');
    return receipt(historical);
  } finally {
    globalThis.__factoryStagingHistoricalShadow = false;
    historical?.dispose();
  }
}
let checks = 0;
let goldenIndex = 0;
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
    const golden = goldenReceipts[goldenIndex++];
    equal({ id, options }, { id: golden.id, options: golden.options }, "fixture order matches independent original receipt");
    equal(digest(JSON.stringify(historicalShadowReceipt(id, options, synchronous))), golden.sha256,
      `${id}: original geometry/material/order retained across the explicit shadow-submission change`);
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
hook.deregister();
console.log(JSON.stringify({ checks, goldenSourceSha256, fixtures: goldenIndex, scope: "headless original-output and lifetime proof; not native performance acceptance" }));
