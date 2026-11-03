// 2026-11-02 audit R5 (Garage scene packs): each pack is one record with a declared phase (building, attached, warming,
// warmed, retired) and one transition function. A hover prewarm is cancellable (a newer prewarm or a selection elsewhere
// stops it before its bake), the texture latch records only real uploads, a lost WebGL context renews the cached packs'
// warm, and setVariant's reveal and whenReady share one staleness rule. Fake kits only: fast.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { GARAGE_PACK_MOVES, createGarageArchitectureController } from './garageArchitecture.ts';

const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
const outdoor = GARAGE_VARIANTS.filter((variant) => variant.architecture !== 'field_shed');
const verdant = GARAGE_VARIANTS.find((variant) => variant.architecture === 'field_shed');

function fakeKit({ prepares = new Map(), texture = () => null } = {}) {
  const built = [];
  const disposed = [];
  const kit = {
    createGarageEnvironmentAssetLibrary: () => ({
      retainedTextures: () => [], diagnostics: () => ({ residentSets: 0, referencedSets: 0 }), warmAll() {}, dispose() {},
    }),
    pinGarageEnvironmentCaches: () => () => {},
    prepareGarageEnvironmentAssets: async (_assets, variant) => { await prepares.get(variant.architecture)?.promise; },
    buildGarageEnvironment: (_ctx, _assets, variant) => {
      built.push(variant.architecture);
      const root = new THREE.Group();
      const map = texture(variant);
      root.add(map ? new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map })) : new THREE.Group());
      Object.assign(root.userData, { ready: true, mode: 'garage-environment', source: 'authentic-garage-scene-pack' });
      return {
        root, stats: root.userData, texturesReady: Promise.resolve(),
        dispose() { disposed.push(variant.architecture); root.removeFromParent(); },
      };
    },
  };
  return { kit, built, disposed };
}

const originalDocument = globalThis.document;
const originalRaf = globalThis.requestAnimationFrame;
globalThis.document = {};
globalThis.requestAnimationFrame = (callback) => { queueMicrotask(() => callback(0)); return 1; };
try {
  // 1. The transition table: a retired pack never comes back; a build never skips its attach to warm.
  assert.deepEqual(GARAGE_PACK_MOVES.retired, []);
  assert.equal(GARAGE_PACK_MOVES.building.includes('warming'), false);

  // 2. Hover prewarms: a newer one cancels the older before its bake, so N hovered cards cost one bake, not N.
  {
    const [a, b, c] = outdoor;
    const prepares = new Map([[a.architecture, deferred()], [b.architecture, deferred()]]);
    const { kit, built } = fakeKit({ prepares });
    const controller = createGarageArchitectureController({ renderer: { initTexture() {} } }, new THREE.Group(), () => {},
      async () => kit);
    controller.setVariant(verdant);
    await controller.whenReady();
    const hoverA = controller.prepareVariant(a);
    await flush();
    const hoverB = controller.prepareVariant(b);
    prepares.get(a.architecture).resolve();
    prepares.get(b.architecture).resolve();
    await Promise.all([hoverA, hoverB]);
    assert.deepEqual(built, [b.architecture], 'the card the pointer left is never baked');
    assert.deepEqual(controller.packPhases().map((pack) => pack.key), [verdant.architecture, b.architecture]);
    // a selection elsewhere cancels a prewarm still in flight; selecting the prewarmed card takes it over instead
    prepares.set(c.architecture, deferred());
    const hoverC = controller.prepareVariant(c);
    await flush();
    controller.setVariant(b);
    prepares.get(c.architecture).resolve();
    await hoverC;
    assert.equal(built.includes(c.architecture), false, 'a selection elsewhere cancels the prewarm');
    const stats = await controller.whenReady();
    assert.equal(stats.ready, true);
    assert.equal(stats.key, b.architecture);
    assert.ok(stats.cached <= 2, 'the cache stays at its limit');
    const d = outdoor[3];
    prepares.set(d.architecture, deferred());
    const hoverD = controller.prepareVariant(d);
    await flush();
    controller.setVariant(d);
    prepares.get(d.architecture).resolve();
    await hoverD;
    const selectedD = await controller.whenReady();
    assert.equal(selectedD.ready, true, 'a selected prewarm is no longer cancellable');
    assert.deepEqual(built, [b.architecture, d.architecture], 'and is baked once');
    controller.dispose();
  }

  // 3. whenReady and setVariant's reveal: one staleness rule (the selection the call started under must still stand).
  {
    const [a, b] = outdoor;
    const prepares = new Map([[a.architecture, deferred()]]);
    const { kit } = fakeKit({ prepares });
    const controller = createGarageArchitectureController({}, new THREE.Group(), () => {}, async () => kit);
    controller.setVariant(a);
    const stale = controller.whenReady();
    controller.setVariant(b);
    prepares.get(a.architecture).resolve();
    const staleStats = await stale;
    assert.equal(staleStats.key, b.architecture);
    const bStats = await controller.whenReady();
    assert.equal(bStats.ready, true);
    assert.equal(controller.packPhases().find((pack) => pack.key === a.architecture)?.phase === 'warmed'
      && controller.stats().key === a.architecture, false, 'the superseded pack never shows');
    controller.dispose();
  }

  // 4. The texture latch records an upload only when there was one (a loader image that missed the race has none).
  {
    const [a, b] = outdoor;
    const shared = new THREE.Texture(); // its image has not arrived: version 0
    const uploads = [];
    const { kit } = fakeKit({ texture: () => shared });
    const controller = createGarageArchitectureController({ renderer: { initTexture: (texture) => uploads.push(texture.version) } },
      new THREE.Group(), () => {}, async () => kit);
    controller.setVariant(a);
    assert.equal((await controller.whenReady()).ready, true, 'the pack still reveals at its bound');
    assert.deepEqual(uploads, [], 'nothing to upload: nothing is latched');
    shared.needsUpdate = true; // the image arrived
    controller.setVariant(b);
    await controller.whenReady();
    assert.deepEqual(uploads, [1], 'the next warm uploads it under cover, once');
    controller.setVariant(a);
    await controller.whenReady();
    assert.deepEqual(uploads, [1], 'and never again');
    controller.dispose();
  }

  // 5. A lost WebGL context renews every cached pack's warm but the shown one's (the covered restore re-uploads it).
  {
    const [a, b] = outdoor;
    const shared = new THREE.Texture();
    shared.needsUpdate = true;
    const uploads = [];
    const canvas = new EventTarget();
    const { kit } = fakeKit({ texture: () => shared });
    const controller = createGarageArchitectureController({ renderer: { domElement: canvas, initTexture: () => uploads.push(1) } },
      new THREE.Group(), () => {}, async () => kit);
    controller.setVariant(a);
    await controller.whenReady();
    controller.setVariant(b);
    await controller.whenReady();
    assert.equal(uploads.length, 1, 'the shared texture uploaded once');
    canvas.dispatchEvent(new Event('webglcontextlost'));
    const phases = Object.fromEntries(controller.packPhases().map((pack) => [pack.key, pack.phase]));
    assert.equal(phases[a.architecture], 'attached', 'the hidden pack must warm again before it shows');
    assert.equal(phases[b.architecture], 'warmed', 'the shown pack stays');
    const immediate = controller.setVariant(a);
    assert.equal(immediate.ready, false, 'no reveal on the lost context\'s uploads');
    const back = await controller.whenReady();
    assert.equal(back.ready, true);
    assert.equal(uploads.length, 2, 'its textures upload again on the restored context');
    controller.dispose();
    canvas.dispatchEvent(new Event('webglcontextlost'));
  }
} finally {
  if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  if (originalRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = originalRaf;
}

console.log('garageArchitectureRecords.selftest: one record per pack, cancellable prewarms, a true upload latch, context-loss renewal PASS');
