import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { createTank, ensureTankBuilder } from '../vehicles/fleetFactory.ts';

// The real wreck path needs neither a browser nor a Canvas fixture. A loader
// hook only observes its actual factory call and restores the default option
// for the negative control; neither builder nor receipt implementation is mocked.
assert.equal(typeof globalThis.document, 'undefined');
await ensureTankBuilder('t90m');
const target = new URL('./wrecks.ts', import.meta.url).href;
const hookName = '__COT_WRECK_ERA_RECEIPT_TEST';
let forceDefault = false, observation = null, hookCount = 0;
const hasReceipt = root => Object.hasOwn(root.userData, 'eraVisualBindingReceipt');
const assertReceipt = root => {
  assert.ok(hasReceipt(root), 'default keeps the anatomy receipt');
  const receipt = root.userData.eraVisualBindingReceipt;
  assert.equal(receipt.revision, 'canonical-gameplay-era-binding-r1');
  assert.ok(receipt.plates.some(plate => plate.fittedSurfaces.length > 0), 'real fitted ERA surfaces remain');
  assert.ok(Object.isFrozen(receipt) && Object.isFrozen(receipt.plates));
};
globalThis[hookName] = { create(factory, specId, context, options) {
  assert.equal(options.eraVisualBindingReceipt, false, 'only the production wreck caller opts out');
  const actual = { ...options };
  if (forceDefault) delete actual.eraVisualBindingReceipt;
  const visual = factory(specId, context, actual);
  if (forceDefault) assertReceipt(visual.root);
  else assert.equal(hasReceipt(visual.root), false, 'wreck omits the receipt, not just its rows');
  observation = { receiptPresent: hasReceipt(visual.root),
    clusterNames: visual.root.userData.eraClusterNames,
    clusterOwners: visual.root.userData.eraClusterOwners,
    finishReceipt: visual.root.userData.eraFinishReceipt };
  return visual;
} };
const loader = registerHooks({ load(url, context, nextLoad) {
  const loaded = nextLoad(url, context);
  if (url !== target) return loaded;
  const source = loaded.source.toString(), needle = 'visual = createTank(specId, engineCtx, {';
  assert.equal(source.split(needle).length, 2, 'one real wreck factory seam');
  hookCount++;
  return { ...loaded, source: source.replace(needle,
    `visual = globalThis.${hookName}.create(createTank, specId, engineCtx, {`) };
} });

const hash = array => createHash('sha256')
  .update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const stream = attr => attr ? { hash: hash(attr.array), type: attr.array.constructor.name,
  count: attr.count, size: attr.itemSize, normalized: attr.normalized, usage: attr.usage, gpuType: attr.gpuType } : null;
function geometrySnapshot(geometry) {
  if (!geometry) return null;
  return { attributes: Object.entries(geometry.attributes).map(([name, attr]) => [name, stream(attr)]),
    index: stream(geometry.index), groups: geometry.groups.map(group => ({ ...group })),
    drawRange: { ...geometry.drawRange },
    box: geometry.boundingBox ? [geometry.boundingBox.min.toArray(), geometry.boundingBox.max.toArray()] : null };
}
function snapshot(baked) {
  return { bounds: [baked.hx, baked.hz, baked.h], tris: baked.tris,
    geometry: geometrySnapshot(baked.geo), shadow: geometrySnapshot(baked.shadowGeo) };
}

try {
  const { bakeTankWreck } = await import(target);
  assert.equal(hookCount, 1);
  for (const options of [
    { materialMode: 'geometry-only' },
    { geometryReceipt: true },
    { materialMode: 'geometry-only', geometryReceipt: true },
    { materialMode: 'geometry-only', eraVisualBindingReceipt: true },
  ]) {
    const visual = createTank('t90m', null, { camoSeed: 4532, quality: 'low', proceduralOnly: true, ...options });
    try { assertReceipt(visual.root); } finally { visual.dispose(); }
  }
  for (const pop of [false, true]) {
    let control, candidate;
    try {
      forceDefault = true;
      control = bakeTankWreck(null, 't90m', { seed: 2526, pop });
      assert.ok(control, 'forced-default real wreck control succeeds');
      const controlObservation = observation;
      forceDefault = false;
      candidate = bakeTankWreck(null, 't90m', { seed: 2526, pop });
      assert.ok(candidate, 'production receipt-free wreck succeeds');
      assert.equal(controlObservation.receiptPresent, true);
      assert.equal(observation.receiptPresent, false);
      for (const key of ['clusterNames', 'clusterOwners', 'finishReceipt']) {
        assert.deepEqual(observation[key], controlObservation[key], `${key} survives receipt omission`);
      }
      const expected = snapshot(control);
      assert.deepEqual(snapshot(candidate), expected,
        'ordered vertices, normals, colors, indices, shadows, triangle count and bounds are exact');
      const colors = candidate.geo.attributes.color.array, original = colors[0];
      colors[0] += 0.05;
      assert.throws(() => assert.deepEqual(snapshot(candidate), expected),
        'changed RGB must fail the output-equivalence gate');
      colors[0] = original;
      assert.deepEqual(snapshot(candidate), expected);
    } finally {
      control?.geo.dispose(); control?.shadowGeo?.dispose();
      candidate?.geo.dispose(); candidate?.shadowGeo?.dispose();
    }
  }
} finally { loader.deregister(); delete globalThis[hookName]; }
console.log('wreckEraReceipt: default/anatomy receipts retained; real T-90M popped/unseated wreck streams exact without the discarded receipt');
