import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as THREE from 'three';
import { createTank, ensureTankBuilder, isTankBuilderReady } from './fleetFactory.ts';
import { getSpec } from './specs.ts';
import { createTankState } from '../sim/movement.ts';
import { vehicleNightLightEmittersFor } from './vehicleNightLighting.ts';

// Compare the existing default-on factory to its existing receipt-only opt-out.
// These are real browser-facade builds, not replacement builders or a reduced
// geometry/material fixture. This is CPU structural/material evidence, not GPU
// rendering, pixel presentation, frame-time or browser performance evidence.
const IDS = ['t64bv1', 't80u', 't80bv', 't90m', 'm1a1ha_x', 'merkava1b'];
const ROOT_EXCLUSIONS = new Set([
  'eraVisualBindingReceipt', // The one intentionally omitted diagnostic payload.
  'coreBuildTiming', 'decorBuildMs', 'decorYieldMs', // Measured elapsed time only.
]);
// Three.js allocation identity, event listeners and upload counters are not
// visual content. These exclusions apply ONLY to resource objects, not metadata
// fields with similar names. Metadata UUID values retain canonical aliasing.
const RESOURCE_EXCLUSIONS = new Set(['id', 'uuid', '_listeners', 'version']);
const hashBytes = array => createHash('sha256').update(
  Buffer.from(array.buffer, array.byteOffset, array.byteLength),
).digest('hex');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const require = createRequire(import.meta.url);
let canvasModule;
try { canvasModule = require.resolve('@napi-rs/canvas'); }
catch (cause) {
  throw new Error('battleEraReceipt requires the pinned native @napi-rs/canvas; run npm ci. No stub or skip is supported.', { cause });
}
const rasterizer = JSON.parse(readFileSync(join(dirname(canvasModule), 'package.json'), 'utf8'));
assert.equal(rasterizer.name, '@napi-rs/canvas');
const native = require(canvasModule);
const savedGlobals = new Map(['document', 'ImageData', 'Path2D'].map(name =>
  [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement(tag) {
    assert.equal(tag, 'canvas');
    return native.createCanvas(1, 1);
  },
} });
for (const name of ['ImageData', 'Path2D']) {
  assert.equal(typeof native[name], 'function', `native ${name} is required`);
  Object.defineProperty(globalThis, name, { configurable: true, value: native[name] });
}

function attributeContent(attribute) {
  if (!attribute) return null;
  const array = attribute.array ?? attribute.data.array;
  return { type: attribute.constructor.name, arrayType: array.constructor.name,
    count: attribute.count, itemSize: attribute.itemSize, normalized: attribute.normalized,
    usage: attribute.usage ?? attribute.data?.usage, gpuType: attribute.gpuType,
    stride: attribute.data?.stride, offset: attribute.offset,
    meshPerAttribute: attribute.meshPerAttribute, bytes: array.byteLength, sha256: hashBytes(array) };
}

function geometryContent(geometry, metadata = value => value) {
  return { type: geometry.type, name: geometry.name, index: attributeContent(geometry.index),
    attributes: Object.fromEntries(Object.keys(geometry.attributes).sort().map(name =>
      [name, attributeContent(geometry.attributes[name])])),
    morphAttributes: Object.fromEntries(Object.keys(geometry.morphAttributes).sort().map(name =>
      [name, geometry.morphAttributes[name].map(attributeContent)])),
    morphTargetsRelative: geometry.morphTargetsRelative,
    groups: metadata(geometry.groups), drawRange: metadata(geometry.drawRange),
    boundingBox: metadata(geometry.boundingBox), boundingSphere: metadata(geometry.boundingSphere),
    userData: metadata(geometry.userData) };
}

// Every geometry attribute/index and every instance buffer participates. ERA
// depletion compares actual bytes, never merely a receipt or triangle count.
function bufferFingerprint(root) {
  const rows = [];
  root.traverse(node => rows.push({ name: node.name,
    geometry: node.geometry ? geometryContent(node.geometry) : null,
    instances: attributeContent(node.instanceMatrix), colors: attributeContent(node.instanceColor),
    batchMatrices: node.isBatchedMesh ? attributeContent({ array: node._matricesTexture.image.data }) : null,
  }));
  return hash(rows);
}

function snapshot(visual) {
  const root = visual.root, nodes = [];
  root.updateMatrixWorld(true);
  root.traverse(node => nodes.push(node));
  const nodeIds = new Map(nodes.map((node, index) => [node, index]));
  const materialIds = new Map(), textureIds = new Map(), geometryIds = new Map();
  const materials = [], textures = [], geometries = [], references = new Map(), uuids = new Map();
  function resource(value, ids, rows, describe) {
    if (!ids.has(value)) {
      const index = rows.length;
      ids.set(value, index); rows.push(null); rows[index] = describe(value);
    }
    return ids.get(value);
  }
  function ownProperties(value, excluded) {
    return Object.fromEntries(Object.keys(value).sort().filter(key => !excluded.has(key))
      .map(key => [key, semantic(value[key])]));
  }
  function imageContent(value) {
    if (!value) return null;
    if (Array.isArray(value)) return value.map(imageContent);
    if (value.data) return { width: value.width, height: value.height, depth: value.depth,
      data: semantic(value.data) };
    assert.equal(typeof value.getContext, 'function', 'every canvas texture uses real readable pixels');
    return { width: value.width, height: value.height,
      rgbaSha256: hashBytes(value.getContext('2d').getImageData(0, 0, value.width, value.height).data) };
  }
  function describeTexture(texture) {
    return { ...ownProperties(texture, new Set([...RESOURCE_EXCLUSIONS, 'source'])),
      image: imageContent(texture.image) };
  }
  function describeMaterial(material) {
    const library = material.isMeshStandardMaterial ? THREE.ShaderLib.standard
      : material.isMeshDepthMaterial ? THREE.ShaderLib.depth : THREE.ShaderLib.basic;
    const shader = { uniforms: {}, vertexShader: library.vertexShader, fragmentShader: library.fragmentShader };
    material.onBeforeCompile(shader, null);
    return { properties: ownProperties(material, RESOURCE_EXCLUSIONS),
      programCacheKey: material.customProgramCacheKey(),
      compiledHook: { vertex: shader.vertexShader, fragment: shader.fragmentShader,
        uniforms: semantic(shader.uniforms) } };
  }
  function semantic(value) {
    if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
    if (Object.is(value, -0)) return '-0';
    if (typeof value === 'function') return value.toString();
    if (typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) {
      if (!uuids.has(value)) uuids.set(value, uuids.size);
      return { uuid: uuids.get(value) };
    }
    if (!value || typeof value !== 'object') return value;
    if (value.isObject3D) {
      // Keep referenced detached source meshes, not just their labels.
      if (!nodeIds.has(value)) { nodeIds.set(value, nodes.length); nodes.push(value); }
      return { node: nodeIds.get(value) };
    }
    if (value.isMaterial) return { material: resource(value, materialIds, materials, describeMaterial) };
    if (value.isTexture) return { texture: resource(value, textureIds, textures, describeTexture) };
    if (value.isBufferGeometry) return { geometry: resource(value, geometryIds, geometries,
      geometry => geometryContent(geometry, semantic)) };
    if (ArrayBuffer.isView(value)) return { array: value.constructor.name, bytes: value.byteLength, sha256: hashBytes(value) };
    if (references.has(value)) return { ref: references.get(value) };
    references.set(value, references.size);
    if (Array.isArray(value)) return value.map(semantic);
    if (value instanceof Map) return [...value].map(([key, entry]) => [semantic(key), semantic(entry)]);
    if (value instanceof Set) return [...value].map(semantic);
    return ownProperties(value, new Set());
  }
  const rows = [];
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    rows.push({ name: node.name, type: node.type, parent: semantic(node.parent),
      children: node.children.map(semantic), matrix: [...node.matrix.elements],
      world: [...node.matrixWorld.elements], position: node.position.toArray(),
      quaternion: node.quaternion.toArray(), scale: node.scale.toArray(), rotationOrder: node.rotation.order,
      visible: node.visible, layers: node.layers.mask, renderOrder: node.renderOrder,
      castShadow: node.castShadow, receiveShadow: node.receiveShadow, frustumCulled: node.frustumCulled,
      matrixAutoUpdate: node.matrixAutoUpdate, matrixWorldAutoUpdate: node.matrixWorldAutoUpdate,
      material: semantic(node.material), depthMaterial: semantic(node.customDepthMaterial),
      distanceMaterial: semantic(node.customDistanceMaterial), geometry: semantic(node.geometry),
      count: node.count, instanceMatrix: attributeContent(node.instanceMatrix),
      instanceColor: attributeContent(node.instanceColor),
      batch: node.isBatchedMesh ? semantic({ geometry: node._geometryInfo, instances: node._instanceInfo,
        matrices: node._matricesTexture, colors: node._colorsTexture,
        perObjectFrustumCulled: node.perObjectFrustumCulled, sortObjects: node.sortObjects }) : null,
      levels: node.levels?.map(level => [level.distance, level.hysteresis, semantic(level.object)]),
      userData: ownProperties(node.userData, node === root ? ROOT_EXCLUSIONS : new Set()),
      nightEmitters: semantic(vehicleNightLightEmittersFor(node)),
    });
  }
  const point = method => visual[method](new THREE.Vector3()).toArray();
  const datums = { specId: visual.specId, dims: visual.dims, boundingRadiusM: visual.boundingRadiusM,
    contactGeom: visual.contactGeom, presentationAnchor: visual.presentationAnchor,
    assetPresentationAnchor: visual.assetPresentationAnchor,
    presentationFloorYM: visual.presentationFloorYM, presentationTrackFloorYM: visual.presentationTrackFloorYM,
    muzzle: point('gunMuzzleWorld'), pivot: point('gunPivotWorld'), direction: point('gunDirWorld'),
    turretTop: point('turretTopWorld'), anchorWorld: point('presentationAnchorWorld') };
  return { nodes: rows.length, meshes: nodes.filter(node => node.isMesh).length,
    geometryCount: geometries.length, materialCount: materials.length, textureCount: textures.length,
    rootMetadata: hash(ownProperties(root.userData, ROOT_EXCLUSIONS)),
    graph: hash(rows), geometry: hash(geometries), materials: hash(materials), textures: hash(textures),
    datums: semantic(datums) };
}

function checkClusters(enabled, disabled, label) {
  const names = [...enabled.root.userData.eraClusterNames];
  assert.deepEqual(disabled.root.userData.eraClusterNames, names, `${label}: exact cluster names`);
  const initial = bufferFingerprint(enabled.root);
  assert.equal(bufferFingerprint(disabled.root), initial);
  const unknown = '__battle_receipt_not_an_era_cluster__';
  assert.ok(!names.includes(unknown));
  for (const visual of [enabled, disabled]) {
    assert.equal(visual.stripEra(unknown), false, `${label}: non-member is rejected`);
    assert.equal(bufferFingerprint(visual.root), initial, `${label}: non-member is a byte-exact no-op`);
  }
  for (const name of names) {
    for (const visual of [enabled, disabled]) assert.equal(visual.stripEra(name), true, `${label}/${name}: registered`);
    const spent = bufferFingerprint(enabled.root);
    assert.notEqual(spent, initial, `${label}/${name}: removes real vertices or instances`);
    assert.equal(bufferFingerprint(disabled.root), spent, `${label}/${name}: exact same geometry is removed`);
    for (const visual of [enabled, disabled]) {
      assert.equal(visual.stripEra(name), true, `${label}/${name}: repeated removal retains API contract`);
      assert.equal(bufferFingerprint(visual.root), spent, `${label}/${name}: idempotent arrays`);
      assert.equal(visual.resetEra(), true, `${label}/${name}: reset is supported`);
      assert.equal(bufferFingerprint(visual.root), initial, `${label}/${name}: reset restores every exact array`);
      assert.equal(visual.resetEra(), true);
      assert.equal(bufferFingerprint(visual.root), initial, `${label}/${name}: repeated reset is byte-exact`);
    }
  }
  if (!names.length) for (const visual of [enabled, disabled]) assert.equal(visual.resetEra(), false);
  return names.length;
}

function stateFor(id) {
  const state = createTankState(getSpec(id), new THREE.Vector3(13, 2, -7), 0.43);
  Object.assign(state, { turretYaw: -0.71, gunPitch: 0.11, visualPitch: 0.035, visualRoll: -0.024 });
  state._susp.p = 0.018; state._susp.r = -0.009;
  state.trackScroll.l = 0.38; state.trackScroll.r = 0.27;
  return state;
}

const results = [];
try {
  const probe = native.createCanvas(8, 8), context = probe.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 8, 0);
  gradient.addColorStop(0, '#ff0000'); gradient.addColorStop(1, '#0000ff');
  context.fillStyle = gradient; context.fillRect(0, 0, 8, 8);
  const pixels = context.getImageData(0, 0, 8, 8).data;
  assert.ok(pixels[0] > pixels[2] && pixels[28] < pixels[30] && pixels[3] === 255,
    'real native Canvas2D gradients paint nonuniform opaque pixels');

  for (const id of IDS) {
    await ensureTankBuilder(id);
    assert.equal(isTankBuilderReady(id), true, `${id}: typed demand facade loaded the exact family and receipts`);
    for (const role of ['desktop-bot', 'desktop-hero']) {
      const options = { camoSeed: 4242, camoPattern: 'factory', batchStatic: true,
        quality: role === 'desktop-hero' || id === 't90m' ? 'preview' : 'ai',
        geometryQuality: role === 'desktop-hero' ? 'high' : 'low',
        battleDetailLod: role === 'desktop-bot' };
      const label = `${id}/${role}`;
      const enabled = createTank(id, null, options);
      let disabled;
      try {
        const baseline = snapshot(enabled);
        disabled = createTank(id, null, { ...options, eraVisualBindingReceipt: false });
        assert.deepEqual(snapshot(enabled), baseline,
          `${label}: candidate construction cannot contaminate the enabled control through shared caches`);
        assert.ok(enabled.root.userData.eraVisualBindingReceipt, `${label}: factory default remains on`);
        assert.equal(Object.hasOwn(disabled.root.userData, 'eraVisualBindingReceipt'), false);
        for (const visual of [enabled, disabled]) {
          assert.equal(visual.root.name, `tank_${id}`);
          assert.equal(visual.root.userData.materialMode, 'rendered');
          assert.equal(visual.root.userData.geometryQuality, options.geometryQuality);
          assert.equal(visual.root.userData.textureQuality, options.quality);
          assert.ok(visual.root.userData.__decorSummary, `${label}: actual decoration construction completes`);
          assert.ok(visual.contactGeom, `${label}: full battle contact data is constructed`);
        }
        assert.ok(baseline.textureCount > 0 && baseline.meshes > 20 && baseline.geometryCount > 10,
          `${label}: native painted full-detail scene, not an empty or map-free fixture`);
        assert.deepEqual(snapshot(disabled), baseline, `${label}: complete as-built parity`);

        if (results.length === 0) {
          let target;
          disabled.root.traverse(node => { if (!target && node.geometry?.attributes.position) target = node; });
          const position = target.geometry.attributes.position, original = position.array[0];
          position.array[0] += 0.125;
          assert.throws(() => assert.deepEqual(snapshot(disabled), baseline), assert.AssertionError,
            'negative control: changing one actual vertex fails the full fingerprint');
          position.array[0] = original;
          assert.deepEqual(snapshot(disabled), baseline);
          const names = disabled.root.userData.eraClusterNames;
          assert.ok(names.length > 0, 'negative control requires a genuine live cluster');
          disabled.root.userData.eraClusterNames = names.slice(1);
          assert.throws(() => assert.deepEqual(snapshot(disabled), baseline), assert.AssertionError,
            'negative control: deleting one cluster fails despite unchanged geometry');
          disabled.root.userData.eraClusterNames = names;
          assert.deepEqual(snapshot(disabled), baseline);
        }

        const clusters = checkClusters(enabled, disabled, label);
        assert.deepEqual(snapshot(disabled), snapshot(enabled), `${label}: full parity after ERA reset`);
        const states = [stateFor(id), stateFor(id)];
        for (const [index, visual] of [enabled, disabled].entries()) visual.syncFromState(states[index], 0, 18);
        const articulated = snapshot(enabled);
        assert.deepEqual(snapshot(disabled), articulated, `${label}: articulated rigs, track scroll and muzzle parity`);
        assert.notEqual(articulated.graph, baseline.graph, `${label}: articulation actually changes the scene`);
        for (const visual of [enabled, disabled]) visual.recoilKick(0, 1);
        for (const [index, visual] of [enabled, disabled].entries()) visual.syncFromState(states[index], 0.12, 18);
        const recoiling = snapshot(enabled);
        assert.deepEqual(snapshot(disabled), recoiling, `${label}: actual recoil geometry/material/muzzle parity`);
        assert.notEqual(recoiling.graph, articulated.graph, `${label}: cannon recoil actually moves the rig`);
        assert.deepEqual(states[1], states[0], `${label}: recoil sends identical simulation impulses`);
        for (const [index, visual] of [enabled, disabled].entries()) visual.syncFromState(states[index], 1, 18);
        assert.deepEqual(snapshot(disabled), snapshot(enabled), `${label}: recuperated rig parity`);
        results.push({ id, role, quality: options.quality, geometryQuality: options.geometryQuality,
          clusters, nodes: baseline.nodes, meshes: baseline.meshes,
          geometries: baseline.geometryCount, materials: baseline.materialCount, textures: baseline.textureCount,
          geometrySha256: baseline.geometry, materialSha256: baseline.materials, textureSha256: baseline.textures });
      } finally { disabled?.dispose(); enabled.dispose(); }
    }
  }
  assert.equal(results.length, 12);
  assert.ok(results.reduce((sum, row) => sum + row.clusters, 0) > 0);
  console.log(JSON.stringify({ pass: true, builds: results.length * 2,
    rasterizer: { name: rasterizer.name, version: rasterizer.version },
    rootExclusions: [...ROOT_EXCLUSIONS], resourceExclusions: [...RESOURCE_EXCLUSIONS], results,
    scope: 'Actual demand-loaded rendered-material CPU builds, native Canvas2D texture pixels, all geometry/instance buffers, material roles/shader hooks, ownership/pose, contacts/muzzles, finish/gameplay metadata and every ERA cluster. Not GPU or browser rendering/performance certification.' }));
} finally {
  for (const [name, descriptor] of savedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}
