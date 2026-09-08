import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { ownFittingGeometry, disposeOwnedFittingGeometry } from './ownedFittingGeometry.ts';

const files = new Map([
  [new URL('./profiles/kit.ts', import.meta.url).href, [
    "import { ownFittingGeometry } from '../ownedFittingGeometry.ts';\n",
    '    ownFittingGeometry(merged);\n',
  ]],
  [new URL('./tankFactoryCore.ts', import.meta.url).href, [
    "import { disposeOwnedFittingGeometry } from './ownedFittingGeometry.ts';\n",
    '        if (isVehicleMesh(o)) disposeOwnedFittingGeometry(o.geometry);\n',
  ]],
]);

// The control removes exactly the two import/call pairs. Current lighting,
// batching, all profiles and every other runtime byte remain in both sides.
function withoutOwnership(url) {
  let source = fs.readFileSync(new URL(url), 'utf8');
  for (const line of files.get(url)) {
    assert.equal(source.split(line).length, 2, 'exact ownership-only inverse');
    source = source.replace(line, '');
  }
  return stripTypeScriptTypes(source);
}

function attributeDigest(attribute) {
  if (!attribute) return null;
  const array = attribute.array ?? attribute.data.array;
  return { type: attribute.constructor.name, arrayType: array.constructor.name,
    itemSize: attribute.itemSize, count: attribute.count, normalized: attribute.normalized,
    usage: attribute.usage, gpuType: attribute.gpuType, offset: attribute.offset,
    stride: attribute.data?.stride,
    sha: createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex') };
}

function digest(root) {
  const nodes = [], rows = [], materialIds = new Map(), materials = [], uuids = new Map();
  const semantic = value => {
    if (typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      if (!uuids.has(value)) uuids.set(value, uuids.size);
      return `uuid:${uuids.get(value)}`;
    }
    if (Array.isArray(value)) return value.map(semantic);
    if (value && typeof value === 'object') return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, semantic(value[key])]));
    return value;
  };
  root.updateMatrixWorld(true); root.traverse(node => nodes.push(node));
  const nodeIds = new Map(nodes.map((node, index) => [node, index]));
  for (const node of nodes) {
    const ids = (node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : []).map(material => {
      if (!materialIds.has(material)) {
        materialIds.set(material, materials.length); materials.push(semantic(material.toJSON()));
      }
      return materialIds.get(material);
    });
    const geometry = node.geometry;
    rows.push({ name: node.name, type: node.type, parent: nodeIds.get(node.parent) ?? null,
      matrix: node.matrix.elements, world: node.matrixWorld.elements,
      visible: node.visible, layers: node.layers.mask, renderOrder: node.renderOrder,
      castShadow: node.castShadow, receiveShadow: node.receiveShadow, frustumCulled: node.frustumCulled,
      // These authored fitting metadata fields contain no timing or runtime references.
      fittingMetadata: node.userData.fittingSlot ? semantic(node.userData) : null,
      materials: ids, count: node.count, instanceMatrix: attributeDigest(node.instanceMatrix),
      instanceColor: attributeDigest(node.instanceColor),
      levels: node.levels?.map(level => [level.distance, level.hysteresis, nodeIds.get(level.object)]),
      geometry: geometry ? { type: geometry.type, groups: geometry.groups, drawRange: geometry.drawRange,
        attributes: Object.fromEntries(Object.keys(geometry.attributes).sort().map(key => [key, attributeDigest(geometry.attributes[key])])),
        morph: Object.fromEntries(Object.keys(geometry.morphAttributes).sort().map(key => [key, geometry.morphAttributes[key].map(attributeDigest)])),
        morphTargetsRelative: geometry.morphTargetsRelative, index: attributeDigest(geometry.index) } : null });
  }
  return { nodes: nodes.length, meshes: nodes.filter(node => node.isMesh).length,
    materials: materials.length, sha: createHash('sha256').update(JSON.stringify({ rows, materials })).digest('hex') };
}

function fittingRecords(root) {
  const records = new Map();
  root.traverse(object => {
    if (!object.isMesh || typeof object.userData.fittingSlot !== 'string') return;
    if (!records.has(object.geometry)) {
      const record = { mesh: object, disposals: 0 };
      object.geometry.addEventListener('dispose', () => record.disposals++);
      records.set(object.geometry, record);
    }
  });
  assert.equal(records.size, 13, 'all thirteen actual shared-kit merged fitting buffers');
  return records;
}

async function nativeChild(reference) {
  let hook; const loaded = new Set();
  if (reference) hook = registerHooks({ load(url, context, next) {
    if (!files.has(url)) return next(url, context);
    assert.ok(!loaded.has(url)); loaded.add(url);
    return { format: 'module', shortCircuit: true, source: withoutOwnership(url) };
  } });
  const { createTank } = await import('./tankFactory.ts');
  const { getSpec } = await import('./specs.ts');
  const { createTankState } = await import('../sim/movement.ts');
  const results = []; let buffers = 0, detachedCases = 0, batchCases = 0;
  for (const id of ['m1a2', 'challenger_3x']) for (const quality of ['high', 'low']) for (const batchStatic of [false, true]) {
    const options = { quality, materialMode: 'geometry-only', proceduralOnly: true, camoSeed: 4242, decor: true,
      batchStatic, deferStaticBatch: !batchStatic, battleDetailLod: batchStatic };
    const a = createTank(id, null, options), b = createTank(id, null, options);
    const first = fittingRecords(a.root), second = fittingRecords(b.root);
    const firstDigest = digest(a.root), liveDigest = digest(b.root);
    assert.deepEqual(firstDigest, liveDigest, 'independent resident tanks retain identical authored content');
    for (const geometry of first.keys()) assert.ok(!second.has(geometry), 'different visuals own different buffers');

    // Two mesh references to one registered buffer still release it only once.
    const [aliasedGeometry, aliasedRecord] = first.entries().next().value;
    const alias = new THREE.Mesh(aliasedGeometry, aliasedRecord.mesh.material);
    alias.name = 'ownershipTestDuplicateReference'; a.root.add(alias);
    // Ordinary unregistered geometry can be borrowed by more than one visual.
    const borrowed = new THREE.BoxGeometry(.1, .1, .1); let borrowedDisposals = 0;
    borrowed.addEventListener('dispose', () => borrowedDisposals++);
    a.root.add(new THREE.Mesh(borrowed, aliasedRecord.mesh.material));

    if (batchStatic) {
      assert.ok(a.root.userData.staticBatchSavedDraws > 0, 'actual native static batching is exercised'); batchCases++;
      if (quality === 'high') {
        const groups = []; a.root.traverse(object => { if (object.userData.battleDetailGroup) groups.push(object); });
        assert.ok(groups.length > 0);
        a.syncFromState(createTankState(getSpec(id), new THREE.Vector3(), 0), 0, 150);
        assert.ok(groups.every(group => group.parent === null), 'far detail really leaves the scene');
        assert.ok([...first.values()].some(record => !a.root.getObjectById(record.mesh.id)), 'fitting buffer lives in detached detail');
        detachedCases++;
      }
    }
    a.dispose();
    for (const [geometry, record] of first) {
      assert.equal(record.disposals, reference ? 0 : 1, reference ? 'original missing-disposal negative witness' : 'owned buffer released once');
      assert.equal(disposeOwnedFittingGeometry(geometry), false, 'native disposal consumed the ownership registration'); buffers++;
    }
    assert.equal(borrowedDisposals, 0, 'ordinary borrowed stock is not blanket-disposed');
    for (const record of second.values()) assert.equal(record.disposals, 0, 'the resident other visual survives');
    assert.deepEqual(digest(b.root), liveDigest, 'disposing first tank cannot mutate the resident other visual');
    b.dispose();
    for (const record of second.values()) { assert.equal(record.disposals, reference ? 0 : 1); buffers++; }
    assert.equal(borrowedDisposals, 0); borrowed.dispose();
    if (reference) for (const geometry of [...first.keys(), ...second.keys()]) geometry.dispose();
    results.push({ id, quality, batchStatic, fittingBuffersPerVisual: first.size,
      batchSavedDraws: a.root.userData.staticBatchSavedDraws ?? 0, ...firstDigest });
  }
  if (reference) assert.equal(loaded.size, 2, 'both actual native source paths use the ownership-only inverse');
  hook?.deregister();
  console.log('FITTING_OWNERSHIP_NATIVE ' + JSON.stringify({ results, builds: results.length * 2, buffers, detachedCases, batchCases }));
}

if (process.argv.includes('--native-child')) {
  await nativeChild(process.argv.includes('--reference'));
} else {
  const owned = new THREE.BoxGeometry(), borrowed = new THREE.BoxGeometry();
  let releases = 0, borrowedReleases = 0;
  owned.addEventListener('dispose', () => releases++); borrowed.addEventListener('dispose', () => borrowedReleases++);
  ownFittingGeometry(owned); ownFittingGeometry(owned);
  assert.equal(disposeOwnedFittingGeometry(borrowed), false);
  assert.equal(disposeOwnedFittingGeometry(owned), true);
  assert.equal(disposeOwnedFittingGeometry(owned), false);
  assert.equal(releases, 1); assert.equal(borrowedReleases, 0); borrowed.dispose();
  const run = reference => {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--native-child', ...(reference ? ['--reference'] : [])],
      { encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
    assert.ifError(child.error); assert.equal(child.status, 0, child.stderr || child.stdout);
    const line = child.stdout.split('\n').find(row => row.startsWith('FITTING_OWNERSHIP_NATIVE '));
    assert.ok(line, 'complete native ownership receipt'); return JSON.parse(line.slice('FITTING_OWNERSHIP_NATIVE '.length));
  };
  const before = run(true), after = run(false);
  assert.deepEqual(after, before, 'all native geometry/material/metadata/rig/instance/LOD results stay exact');
  assert.equal(after.builds, 16); assert.equal(after.buffers, 208);
  assert.equal(after.detachedCases, 2); assert.equal(after.batchCases, 4);
  console.log(JSON.stringify({ test: 'fitting geometry ownership', pass: true,
    nativeNodeBuilds: before.builds + after.builds, fixedBuffersReleasedOnce: after.buffers,
    originalUndisposedBufferWitnesses: before.buffers, detachedCasesPerVariant: after.detachedCases,
    actualBatchCasesPerVariant: after.batchCases, results: after.results,
    scope: 'Node procedural construction/dispose events; not GPU residency or browser switching latency' }));
}
