import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createImpactDecals, createImpactDecalsSteps } from './impactDecals.ts';
import { createFx, createFxChunked } from './effects.ts';
import { createFxRuntimeAccess } from './fxRuntimeAccess.ts';
import { registerFxClock, registerPopTrail, fxNow, emitPopTrail } from './clock.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
const documentBefore = Object.getOwnPropertyDescriptor(globalThis, 'document');
let canvases = 0;
globalThis.document = { createElement(tag) {
  assert.equal(tag, 'canvas'); canvases++; return createCanvas(1, 1);
} };
// 2026-10-01 (frozen pins retired): the sha256 pin of every cell painter/layout at 5602647d7 and the frozen pre-change
// traversal used as the control froze the impact-decal look. The pacing contract is live: the 16-checkpoint stepped
// bake reproduces the synchronous bake's native bytes and sampler state for every seed and anisotropy.
function bytes(texture) {
  const c = texture.image;
  return Buffer.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data);
}
function snapshot(texture) {
  return { bytes: bytes(texture), sampler: Object.fromEntries(['mapping', 'channel',
    'wrapS', 'wrapT', 'magFilter', 'minFilter', 'anisotropy', 'format', 'type',
    'colorSpace', 'generateMipmaps', 'premultiplyAlpha', 'flipY', 'unpackAlignment']
    .map(key => [key, texture[key]])) };
}
function disposeDecals(runtime) { runtime.clearAll(); runtime.material.map.dispose(); runtime.material.dispose(); }
const liveFx = [];
try {
  for (const [seed, anisotropy] of [[5000, 4], [19, 1], [0xffffffff, 8]]) {
    const sync = createImpactDecals({ seed, anisotropy });
    const steps = createImpactDecalsSteps({ seed, anisotropy });
    let count = 0, next = steps.next();
    while (!next.done) { count++; next = steps.next(); }
    assert.equal(count, 16, 'one completed-cell checkpoint, including before texture allocation');
    assert.deepEqual(snapshot(next.value.material.map), snapshot(sync.material.map),
      'the stepped bake reproduces the synchronous native bytes and sampler state');
    assert.equal(sync.material.map.anisotropy, Math.max(1, anisotropy | 0));
    disposeDecals(sync); disposeDecals(next.value);
  }

  for (const rejectAt of [1, 8, 16]) {
    const scene = new THREE.Scene(), engine = { scene, anisotropy: 4 };
    const hf = { getHeightAt: () => 0 };
    let yields = 0, popCalls = 0, bindings = 0, attachments = 0, shouldReject = true;
    registerFxClock(() => 73); registerPopTrail(() => popCalls++);
    const before = canvases;
    const failure = new Error(`cancel at cell ${rejectAt}`);
    const access = createFxRuntimeAccess({
      loadModule: () => ({ createFxChunked }),
      initialize: async module => {
        const live = await module.createFxChunked(engine, hf, { seed: 5000 }, async () => {
          yields++;
          assert.equal(fxNow(), 73, 'private preparation does not publish a clock');
          emitPopTrail(0, 0, 0, 1); assert.equal(popCalls, yields, 'previous trail provider stays active');
          assert.equal(scene.children.length, 0);
          assert.equal(bindings, 0); assert.equal(attachments, 0);
          assert.equal(access.current, null);
          if (shouldReject) {
            assert.equal(canvases, before + 1, 'suspended construction owns only its atlas canvas');
            if (yields === rejectAt) throw failure;
          }
        });
        liveFx.push(live);
        live.bindBus({ on() { bindings++; return () => {}; } });
        attachments++;
        return live;
      },
      activate: runtime => scene.add(runtime.group),
    });
    const a = access.ensureRuntime(), b = access.ensureRuntime();
    assert.equal(a, b, 'concurrent entry coalesces onto one initializer');
    await assert.rejects(a, error => error === failure);
    assert.equal(access.current, null); assert.equal(access.active, false);
    assert.equal(fxNow(), 73); assert.equal(bindings, 0); assert.equal(attachments, 0);
    shouldReject = false; yields = 0; popCalls = 0;
    const runtime = await access.ensureRuntime();
    assert.equal(yields, 16); assert.equal(access.current, runtime);
    assert.equal(scene.children.length, 1); assert.equal(attachments, 1);
    assert.ok(bindings > 0); assert.equal(await access.ensureRuntime(), runtime);
  }
  for (const heldCell of [1, 8, 16]) {
    let reached, release;
    const entered = new Promise(resolve => { reached = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const scene = new THREE.Scene();
    let cells = 0, suspensions = 0;
    const access = createFxRuntimeAccess({
      loadModule: () => ({ createFxChunked }),
      initialize: async module => {
        const live = await module.createFxChunked({ scene, anisotropy: 4 },
          { getHeightAt: () => 0 }, { seed: 5000 }, async () => {
            if (++cells === heldCell) { reached(); await gate; }
          });
        liveFx.push(live); return live;
      },
      activate: live => scene.add(live.group),
      suspend: live => { suspensions++; live.group.removeFromParent(); },
    });
    const pending = access.ensureRuntime();
    await entered;
    // A different Promise.all entry branch failed; FX construction itself
    // remains healthy and completes after Garage recovery has suspended it.
    assert.equal(access.suspendRuntime(), true);
    release();
    const live = await pending;
    assert.equal(access.active, false);
    assert.equal(scene.children.length, 0, 'late healthy completion cannot reattach effects in Garage');
    assert.equal(suspensions, 1);
    assert.equal(await access.ensureRuntime(), live);
    assert.equal(cells, 16, 'next entry reuses completed construction');
    assert.equal(scene.children.length, 1);
  }
  const syncFx = createFx({ anisotropy: 4 }, { getHeightAt: () => 0 }, { seed: 5000 });
  liveFx.push(syncFx);
  function graph(runtime) {
    const rows = [];
    runtime.group.traverse(node => rows.push([node.name, node.type,
      node.geometry?.index?.count ?? null, node.geometry?.attributes?.position?.count ?? null,
      node.isLight ? [node.color.getHex(), node.intensity, node.distance] : null]));
    return rows;
  }
  assert.deepEqual(graph(liveFx[0]), graph(syncFx), 'sync and covered construction retain the same scene structure');
  console.log('[impact-atlas-pacing] PASS stepped-vs-sync native bytes/samplers, 16 private checkpoints, cancellation/retry, clocks, coalescing and scene parity');
} finally {
  for (const runtime of liveFx) disposeObject3DResources(runtime.group);
  if (documentBefore) Object.defineProperty(globalThis, 'document', documentBefore);
  else delete globalThis.document;
}
