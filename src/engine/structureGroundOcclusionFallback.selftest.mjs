import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStructureGroundOcclusion } from './structureGroundOcclusionRuntime.ts';
import { SGO_POLL_S } from './structureGroundOcclusion.ts';

// 2026-11-02 audit R3 (structure ground occlusion): after the worker's onerror the handle baked the initial raster on the
// main thread and only cleared stats.worker; request() and requestAur() still tested the worker constant and posted to the
// terminated worker. Region re-bakes after a building was destroyed, and later aureole bakes, were dropped, so the
// occlusion stayed stale under rubble and a capture's whenReady() waited on an aureole bake that never came. The reply's
// "full bake" test was also positional (id 1). Now the handle tracks the worker's liveness and each posted bake.

const box = (cx, cz, hw, hl, h) => ({ min: [cx - hw, 0, cz - hl], max: [cx + hw, h, cz + hl], shape2: { kind: 'obb', cx, cz, hw, hl, yaw: 0 } });
const sun = [Math.cos(0.3), Math.sin(0.3), 0];
const idleBefore = globalThis.requestIdleCallback;
globalThis.requestIdleCallback = (cb) => setTimeout(() => cb({ timeRemaining: () => 50 }), 0);
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

try {
  const posts = [];
  const worker = { onmessage: null, onerror: null, terminated: 0,
    postMessage(message) { if (this.terminated) posts.push({ ...message, afterTerminate: true }); else posts.push(message); },
    terminate() { this.terminated += 1; } };
  const group = new THREE.Group();
  new THREE.Scene().add(group);
  const records = [box(0, 0, 2, 2, 3), box(30, 0, 2, 2, 3)];
  const handle = createStructureGroundOcclusion(records, { group, makeWorker: () => worker });
  assert.equal(handle.stats.worker, true);
  assert.equal(posts.length, 1, 'the full bake is posted');
  // the worker answers the full bake, then a building falls and its region re-bake is posted
  worker.onmessage({ data: { id: posts[0].id, rg: new Uint8Array(2), rect: [0, 0, 1, 1], parts: 2, ms: 1 } });
  assert.equal(handle.ready, true);
  records[1].dead = true;
  handle.update(SGO_POLL_S + 0.01);
  assert.equal(posts.length, 2, 'the region re-bake is posted');
  // the worker fails with that region bake unanswered
  worker.onerror(new Event('error'));
  assert.equal(handle.stats.worker, false);
  assert.equal(worker.terminated, 1);
  await settle();
  assert.equal(handle.stats.rebakes, 1, 'the unanswered region re-bake ran again on the main thread');
  // a later destroyed building and a later aureole: the main thread, never the terminated worker
  records[0].crushed = true;
  handle.update(SGO_POLL_S + 0.01);
  handle.requestAureole(sun);
  await settle();
  assert.equal(posts.filter((post) => post.afterTerminate).length, 0, 'nothing is posted to the terminated worker');
  assert.equal(handle.stats.rebakes, 2, 'the later region re-bake lands');
  assert.equal(handle.stats.aureoleBakes, 1, 'the later aureole bake lands');
  const waited = await Promise.race([handle.whenReady(), new Promise((resolve) => setTimeout(() => resolve('hung'), 200))]);
  assert.equal(waited, true, 'a capture\'s wait settles');
  worker.onerror(new Event('error'));
  assert.equal(worker.terminated, 1, 'a second error report changes nothing');
  handle.dispose();
} finally {
  if (idleBefore) globalThis.requestIdleCallback = idleBefore; else delete globalThis.requestIdleCallback;
}

console.log('structureGroundOcclusionFallback selftest: a failed worker\'s bakes, and every later one, run on the main thread');
