// garagePrewarmCancel.selftest.mjs — a cancelled hover prewarm stops at its next slice, not after its whole prepare
// (2026-11-02 audit R5, round 2: U25). Round 1 let a newer prewarm or a selection elsewhere cancel a prewarm, but only
// its checkpoint before the synchronous bake: the prepare itself (trees, the skyline, the kit's pieces, the atmosphere,
// each structure, every one in a setTimeout slice) ran to its end first, and its 'building' record counted toward the
// cache trim meanwhile. The controller now hands the prepare its stillWanted, and the kit checks it between slices.
// - The controller (fake kit): the prepare receives a stillWanted that turns false when the prewarm is cancelled or the
//   controller disposed, and a prewarm revived by a selection of its card prepares the rest before its bake.
// - The kit (real garageEnvironmentKit.ts): a prepare whose caller stops wanting it runs no further slice, keeps no
//   prepared structures, and says so (false); one nobody cancels prepares everything (true).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { createGarageArchitectureController } from './garageArchitecture.ts';

const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
const outdoor = GARAGE_VARIANTS.filter((variant) => variant.architecture !== 'field_shed');
const verdant = GARAGE_VARIANTS.find((variant) => variant.architecture === 'field_shed');

const failures = [];
async function check(name, body) {
  try { await body(); } catch (error) { failures.push(`${name}: ${error.message}`); }
}

const originalDocument = globalThis.document;
const originalRaf = globalThis.requestAnimationFrame;
globalThis.document = {};
globalThis.requestAnimationFrame = (callback) => { queueMicrotask(() => callback(0)); return 1; };

/** A kit whose prepare records the stillWanted it was handed and waits on `gates` (false: it stopped at a slice). */
function fakeKit(gates) {
  const wanted = new Map();
  const prepared = [];
  const built = [];
  const kit = {
    createGarageEnvironmentAssetLibrary: () => ({
      retainedTextures: () => [], diagnostics: () => ({ residentSets: 0, referencedSets: 0 }), warmAll() {}, dispose() {},
      retryFailed() {},
    }),
    pinGarageEnvironmentCaches: () => () => {},
    prepareGarageEnvironmentAssets: async (_assets, variant, stillWanted) => {
      wanted.set(variant.architecture, stillWanted);
      await gates.get(variant.architecture)?.promise;
      // a prepare stops at its next slice once its caller no longer wants it
      const finished = typeof stillWanted !== 'function' || stillWanted();
      if (finished) prepared.push(variant.architecture);
      return finished;
    },
    buildGarageEnvironment: (_ctx, _assets, variant) => {
      built.push(variant.architecture);
      const root = new THREE.Group();
      Object.assign(root.userData, { ready: true, mode: 'garage-environment', source: 'authentic-garage-scene-pack' });
      return { root, stats: root.userData, texturesReady: Promise.resolve(), dispose() { root.removeFromParent(); } };
    },
  };
  return { kit, wanted, prepared, built };
}

try {
  // 1. The controller hands the prepare its stillWanted: a newer prewarm cancels the older one's prepare mid-way.
  await check('a cancelled prewarm\'s prepare is told to stop', async () => {
    const [a, b] = outdoor;
    const gates = new Map([[a.architecture, deferred()], [b.architecture, deferred()]]);
    const { kit, wanted, built } = fakeKit(gates);
    const controller = createGarageArchitectureController({ renderer: { initTexture() {} } }, new THREE.Group(), () => {},
      async () => kit);
    controller.setVariant(verdant);
    await controller.whenReady();
    const hoverA = controller.prepareVariant(a);
    await flush();
    const stillWantedA = wanted.get(a.architecture);
    assert.equal(typeof stillWantedA, 'function', 'the prepare receives no stillWanted: it runs all its slices after a cancel');
    assert.equal(stillWantedA(), true, 'a prewarm nobody cancelled is wanted');
    const hoverB = controller.prepareVariant(b);
    assert.equal(stillWantedA(), false, 'the newer prewarm cancels the older one\'s prepare at its next slice');
    gates.get(a.architecture).resolve();
    gates.get(b.architecture).resolve();
    await Promise.all([hoverA, hoverB]);
    assert.deepEqual(built, [b.architecture], 'and the card the pointer left is never baked');
    controller.dispose();
    assert.equal(wanted.get(b.architecture)(), false, 'a disposed controller wants no prepare');
  });

  // 2. A prewarm stopped at a slice and then revived (its card selected) prepares the rest before its bake.
  await check('a revived prewarm prepares the rest', async () => {
    const [a, b] = outdoor;
    const gates = new Map([[a.architecture, deferred()]]);
    const { kit, wanted, prepared, built } = fakeKit(gates);
    const controller = createGarageArchitectureController({ renderer: { initTexture() {} } }, new THREE.Group(), () => {},
      async () => kit);
    controller.setVariant(verdant);
    await controller.whenReady();
    void controller.prepareVariant(a);
    await flush();
    gates.set(b.architecture, deferred());
    void controller.prepareVariant(b); // cancels a's prepare
    assert.equal(wanted.get(a.architecture)?.(), false);
    gates.get(a.architecture).resolve(); // a's prepare stops at its slice
    await flush();
    controller.setVariant(a); // ... and a selection of a revives it (if its record still stands, or starts it over)
    gates.get(b.architecture).resolve();
    const stats = await controller.whenReady();
    assert.equal(stats.key, a.architecture);
    assert.ok(prepared.includes(a.architecture), 'the selected pack\'s prepare ran to its end before the bake');
    assert.ok(built.includes(a.architecture));
    controller.dispose();
  });

  // 3. The real kit stops between its slices once its caller stops wanting it.
  await check('the kit\'s prepare stops between slices', async () => {
    const kit = await import('./garageEnvironmentKit.ts');
    const variant = outdoor.find((entry) => !kit.hasPreparedGarageStructures(entry.id));
    const release = kit.pinGarageEnvironmentCaches(variant);
    const noTrees = { prepareTreeGroves: async () => {} };
    const realSetTimeout = globalThis.setTimeout;
    let slices = 0;
    let wanted = true;
    globalThis.setTimeout = (callback, ...rest) => realSetTimeout(() => { slices += 1; callback(); }, ...rest);
    let result;
    try {
      const preparing = kit.prepareGarageEnvironmentAssets(noTrees, variant, () => wanted);
      await new Promise((resolve) => realSetTimeout(resolve, 0)); // one slice in
      wanted = false; // a newer hover, a selection elsewhere or a disposed controller
      const stoppedAt = slices;
      result = await preparing;
      assert.ok(slices - stoppedAt <= 1, `the prepare ran ${slices - stoppedAt} more slices after its caller stopped wanting it`);
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
    assert.equal(result, false, 'a stopped prepare says so');
    assert.equal(kit.hasPreparedGarageStructures(variant.id), false, 'and keeps no prepared structures for a bake that will not run');
    // nobody cancels: everything is prepared, and the next prepare (a revived prewarm) finds it done
    assert.equal(await kit.prepareGarageEnvironmentAssets(noTrees, variant, () => true), true);
    assert.equal(kit.hasPreparedGarageStructures(variant.id), true);
    release();
    assert.equal(kit.hasPreparedGarageStructures(variant.id), false);
  });
} finally {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  if (originalRaf === undefined) delete globalThis.requestAnimationFrame;
  else globalThis.requestAnimationFrame = originalRaf;
}

assert.deepEqual(failures, [], `garagePrewarmCancel.selftest: ${failures.length} case(s) failed`);
console.log('garagePrewarmCancel.selftest: a cancelled prewarm stops at its next slice; a revived one prepares the rest PASS');
