import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { outputIdentity } from '../../tools/wreck-paint-bench.mjs';

// Observe the actual shared factory. The negative control restores only the
// old bucket-paint condition; all geometry, posing and final wreck paint run
// through the production implementation. No Canvas, fake tank or timed gate.
const target = new URL('../vehicles/tankFactoryCore.ts', import.meta.url).href;
const key = '__COT_WRECK_DISCARDED_PAINT_TEST';
const state = { forcePaint: false, paintedRows: 0, bucketCalls: 0 };
globalThis[key] = state;
let hooks = 0;
const loader = registerHooks({ load(url, context, nextLoad) {
  const loaded = nextLoad(url, context);
  if (url !== target) return loaded;
  const source = loaded.source.toString();
  const gate = 'if (!geometryOnly && CAMO_BUCKETS.has(bucket)) {';
  const paint = '      boxUV(merged, spec.visual.camoScale ?? 0.34);';
  assert.equal(source.split(gate).length, 2, 'one production non-rendering paint gate');
  assert.equal(source.split(paint).length, 2, 'observe the actual bucket painter');
  hooks++;
  return { ...loaded, source: source.replace(gate,
    `if ((globalThis.${key}.forcePaint || !geometryOnly) && CAMO_BUCKETS.has(bucket)) {`)
    .replace(paint, `globalThis.${key}.paintedRows += merged.attributes.position.count;
      globalThis.${key}.bucketCalls++;
${paint}`) };
} });

const reset = forcePaint => Object.assign(state, { forcePaint, paintedRows: 0, bucketCalls: 0 });
const dispose = baked => { baked?.geo.dispose(); baked?.shadowGeo?.dispose(); };
try {
  assert.equal(typeof globalThis.document, 'undefined');
  const { ensureTankBuilder, createTank } = await import('../vehicles/fleetFactory.ts');
  const { bakeTankWreck } = await import('./wrecks.ts');
  assert.equal(hooks, 1);
  const fixtures = [
    { specId: 't90m', seed: 2526, pop: false },
    { specId: 'k2', seed: 2002, pop: true },
    { specId: 'm1a1', seed: 2002, pop: true },
    { specId: 'type10', seed: 2133, pop: true },
  ];
  const receipts = [];
  for (const fixture of fixtures) {
    await ensureTankBuilder(fixture.specId);
    let control, candidate;
    try {
      reset(true);
      control = bakeTankWreck(null, fixture.specId, fixture);
      const expected = outputIdentity(control);
      const discardedRows = state.paintedRows;
      assert.ok(discardedRows > 1000 && state.bucketCalls > 0, 'old path does real discarded paint work');
      reset(false);
      candidate = bakeTankWreck(null, fixture.specId, fixture);
      assert.equal(state.bucketCalls, 0, 'production wreck never enters temporary UV/dirt painter');
      assert.equal(state.paintedRows, 0);
      assert.deepEqual(outputIdentity(candidate), expected,
        `${fixture.specId}: all ordered geometry, normals, final colors, indices, shadows and bounds stay exact`);
      const colors = candidate.geo.attributes.color.array, saved = colors[0];
      colors[0] += 0.05;
      assert.notDeepEqual(outputIdentity(candidate), expected, 'equivalence must detect changed final paint');
      colors[0] = saved;
      assert.deepEqual(outputIdentity(candidate), expected);
      receipts.push({ specId: fixture.specId, discardedRows });
    } finally { dispose(control); dispose(candidate); }
  }

  // Geometry-receipt inspection deliberately avoids Canvas but retains the
  // default rendered mode. Its UV/dirt behavior must remain default-on.
  reset(false);
  const inspection = createTank('t90m', null, {
    quality: 'low', geometryQuality: 'low', geometryReceipt: true,
    proceduralOnly: true, eraVisualBindingReceipt: false,
  });
  try {
    assert.ok(state.bucketCalls > 0 && state.paintedRows > 1000,
      'default rendered-mode inspection still produces its UV/dirt attributes');
  } finally { inspection.dispose(); }

  // The other production geometry-only consumer is the Garage worker. Copy
  // its actual full-detail options (not wreck low detail) and compare only
  // wire-relevant channels; serializeTank deliberately discards UV/color.
  const { createHash } = await import('node:crypto');
  const garageOptions = { camoSeed: 4242, materialMode: 'geometry-only',
    geometryQuality: 'high', staticPreview: true, decor: true, deferStaticBatch: true };
  const wireStream = attribute => {
    if (!attribute) return null;
    let array = attribute.array;
    if (attribute.isInterleavedBufferAttribute) {
      array = new Float32Array(attribute.count * attribute.itemSize);
      for (let i = 0; i < attribute.count; i++) for (let c = 0; c < attribute.itemSize; c++) {
        array[i * attribute.itemSize + c] = attribute.getComponent(i, c);
      }
    }
    return { itemSize: attribute.itemSize, normalized: attribute.normalized,
      type: array.constructor.name, length: array.length,
      hash: createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex') };
  };
  const garageSnapshot = root => {
    const geometryIds = new Map(), materialIds = new Map(), geometries = [], materials = [];
    const geometryId = geometry => {
      if (geometryIds.has(geometry)) return geometryIds.get(geometry);
      const id = geometries.length; geometryIds.set(geometry, id);
      // Match worker-side bound preparation; no render-thread recomputation.
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      geometries.push({ attributes: Object.entries(geometry.attributes)
        .filter(([name]) => name === 'position' || name === 'normal')
        .map(([name, attribute]) => [name, wireStream(attribute)]),
      index: wireStream(geometry.index), groups: geometry.groups.map(group => ({ ...group })),
      drawRange: { ...geometry.drawRange },
      box: geometry.boundingBox && [geometry.boundingBox.min.toArray(), geometry.boundingBox.max.toArray()],
      sphere: geometry.boundingSphere && [geometry.boundingSphere.center.toArray(), geometry.boundingSphere.radius] });
      return id;
    };
    const materialId = material => {
      if (materialIds.has(material)) return materialIds.get(material);
      const id = materials.length; materialIds.set(material, id);
      materials.push({ name: material.name || '', role: String(material.userData?.appearanceRole || ''),
        color: material.color?.isColor ? material.color.getHex() : null,
        roughness: typeof material.roughness === 'number' ? material.roughness : null,
        metalness: typeof material.metalness === 'number' ? material.metalness : null,
        opacity: material.opacity, transparent: material.transparent, side: material.side,
        depthWrite: material.depthWrite, vertexColors: material.vertexColors });
      return id;
    };
    const userDataKeys = ['appearanceRole', 'authoredShadowProxy', 'combatHitboxPart', 'combatHitboxRole',
      'runningGear', 'trackBucket', 'trackGuard', 'vehicleMarking'];
    const node = object => ({ type: object.type, name: object.name,
      position: object.position.toArray(), quaternion: object.quaternion.toArray(), scale: object.scale.toArray(),
      visible: object.visible, matrixAutoUpdate: object.matrixAutoUpdate, renderOrder: object.renderOrder,
      userData: Object.fromEntries(userDataKeys.filter(name => ['string', 'number', 'boolean']
        .includes(typeof object.userData[name])).map(name => [name, object.userData[name]])),
      geometry: object.isMesh ? geometryId(object.geometry) : null,
      materials: object.isMesh ? (Array.isArray(object.material) ? object.material : [object.material])
        .filter(Boolean).map(materialId) : [],
      count: object.isInstancedMesh ? object.count : 0,
      instanceMatrix: object.isInstancedMesh ? wireStream(object.instanceMatrix) : null,
      instanceColor: object.isInstancedMesh ? wireStream(object.instanceColor) : null,
      lod: object.isLOD ? object.levels.map(level => [level.distance, level.hysteresis]) : null,
      children: object.children.map(node) });
    const hierarchy = node(root);
    assert.ok(geometries.length > 0 && materials.length > 0, 'actual Garage donor has transferable content');
    return { hierarchy, geometries, materials };
  };
  await ensureTankBuilder('m1a2');
  let oldGarage, newGarage;
  try {
    reset(true);
    oldGarage = createTank('m1a2', {}, garageOptions);
    const expectedGarage = garageSnapshot(oldGarage.root);
    assert.ok(state.bucketCalls > 0 && state.paintedRows > 1000, 'old Garage worker path performs bucket paint');
    reset(false);
    newGarage = createTank('m1a2', {}, garageOptions);
    assert.equal(state.bucketCalls, 0, 'new Garage worker path skips discarded bucket paint');
    assert.equal(state.paintedRows, 0);
    assert.deepEqual(garageSnapshot(newGarage.root), expectedGarage,
      'actual Garage M1A2 keeps exact P/N/index storage, sharing, hierarchy, transforms, bounds and material properties');
  } finally { try { oldGarage?.dispose(); } finally { newGarage?.dispose(); } }
  console.log('wreckDiscardedPaint: unchanged real wreck outputs; skipped temporary paint rows', receipts);
} finally { loader.deregister(); delete globalThis[key]; }
