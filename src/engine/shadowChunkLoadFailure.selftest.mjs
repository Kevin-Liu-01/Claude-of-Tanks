// shadowChunkLoadFailure.selftest.mjs — the lighting rig's two lazy shadow chunks follow the one lazy-chunk policy
// (2026-11-02 audit R6, round 2 U35). Copyright © 2026 Kevin B. Liu.
//
// lighting.ts asked for the caster-kind settling (shadowDepthKinds.ts) from the first instanced caster's shadow draw, and
// for the static shadow cache (shadowStaticCache.ts) from the first frame with a frozen world root, each behind a latch
// set before its import and never lifted: one failed chunk (an offline blip) left three's own depth derivation and the
// ordinary cascade render for the session. Now each is an app/lazyChunk.ts chunk whose latch the rig's update lifts once a
// frame while it is failed: asked again at once after one failure, then past the policy's backoff (never every frame),
// and loaded once the network is back. A chunk "fails" the way a browser's import does when the network drops: its
// resolve throws.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

let clock = 0;
performance.now = () => clock; // the lazy chunks' default clock

const KINDS = './shadowDepthKinds.ts';
const CACHE = './shadowStaticCache.ts';
const failing = new Map([[KINDS, 3], [CACHE, 3]]);
const asked = new Map([[KINDS, 0], [CACHE, 0]]);
const data = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
// the kinds' settling, counted (the real module only spares three's re-derivations)
const KINDS_STUB = data('export function settleShadowDepthKind() { globalThis.__cotDepthKindSettles = (globalThis.__cotDepthKindSettles ?? 0) + 1; }');
const hook = registerHooks({
  resolve(specifier, context, next) {
    if ((context.parentURL ?? '').endsWith('/src/engine/lighting.ts') && asked.has(specifier)) {
      asked.set(specifier, asked.get(specifier) + 1);
      const left = failing.get(specifier);
      if (left > 0) {
        failing.set(specifier, left - 1);
        throw new TypeError(`Failed to fetch dynamically imported module: ${specifier}`);
      }
      if (specifier === KINDS) return { url: KINDS_STUB, shortCircuit: true };
    }
    return next(specifier, context);
  },
});

const THREE = await import('three');
const { createLighting } = await import('./lighting.ts');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
const lighting = createLighting(scene, camera, new THREE.Vector3(1, 1, 1).normalize());
const frozenWorld = new THREE.Group();
frozenWorld.userData.matrixTraversalFrozen = true; // map.ts freezes the battle world's root after its build
scene.add(frozenWorld);
const caster = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 1);
frozenWorld.add(caster);
const depth = new THREE.MeshDepthMaterial();
const renderer = { localClippingEnabled: false };
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve)); };
/** One frame: the rig's update, then the shadow pass's draws of an instanced caster (each cascade draws it). */
const frame = async () => {
  lighting.update(false, 1 / 60);
  for (let cascade = 0; cascade < 4; cascade++) caster.onBeforeShadow(renderer, caster, camera, camera, caster.geometry, depth, null);
  await settle();
};
const counts = () => `${asked.get(KINDS)} kinds, ${asked.get(CACHE)} cache asks`;

try {
  await frame();
  assert.deepEqual([asked.get(KINDS), asked.get(CACHE)], [1, 1], `the first caster drawn and the first frozen world ask once (${counts()})`);
  await frame();
  assert.deepEqual([asked.get(KINDS), asked.get(CACHE)], [2, 2],
    `after one failure the next frame asks again at once (the base kept both failures for the session: ${counts()})`);
  for (let i = 0; i < 30; i++) { clock += 50; await frame(); }
  assert.deepEqual([asked.get(KINDS), asked.get(CACHE)], [2, 2], `inside the 2 s backoff no frame asks (${counts()})`);
  clock = 2_000;
  await frame();
  assert.deepEqual([asked.get(KINDS), asked.get(CACHE)], [3, 3], `past it, one ask each (${counts()})`);
  for (let i = 0; i < 30; i++) { clock += 100; await frame(); }
  assert.deepEqual([asked.get(KINDS), asked.get(CACHE)], [3, 3], `inside the 4 s backoff none (${counts()})`);
  clock = 6_000;
  await frame();
  assert.deepEqual([asked.get(KINDS), asked.get(CACHE)], [4, 4], `past it the network is back (${counts()})`);
  await frame();
  assert.ok((globalThis.__cotDepthKindSettles ?? 0) > 0, 'the caster kinds settle once their chunk is in');
  assert.ok(lighting.getShadowTelemetry().staticCache, 'and the static shadow cache is armed');
  for (let i = 0; i < 10; i++) { clock += 10_000; await frame(); }
  assert.deepEqual([asked.get(KINDS), asked.get(CACHE)], [4, 4], `a loaded chunk is never asked again (${counts()})`);
} finally {
  lighting.csm.remove();
  lighting.csm.dispose();
  hook.deregister();
}
console.log('shadowChunkLoadFailure.selftest: a failed caster-kind or static-cache chunk is asked again past the policy\'s backoff (never every frame) and loads once the network is back');
