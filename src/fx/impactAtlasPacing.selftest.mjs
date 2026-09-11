import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { createImpactDecals, createImpactDecalsSteps } from './impactDecals.ts';
import { createFx, createFxChunked } from './effects.ts';
import { createFxRuntimeAccess } from './fxRuntimeAccess.ts';
import { mulberry32, makeFbm } from './particles.ts';
import { registerFxClock, registerPopTrail, fxNow, emitPopTrail } from './clock.ts';
import { SURFACE_MARKING_STYLE } from '../vehicles/vehicleMarkings.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
const documentBefore = Object.getOwnPropertyDescriptor(globalThis, 'document');
let canvases = 0;
globalThis.document = { createElement(tag) {
  assert.equal(tag, 'canvas'); canvases++; return createCanvas(1, 1);
} };
const source = readFileSync(new URL('./impactDecals.ts', import.meta.url), 'utf8');
const painter = source.slice(source.indexOf('const ATLAS ='), source.indexOf('/** Bake the full atlas.'));
assert.equal(createHash('sha256').update(painter).digest('hex'),
  '55a9fb75a9a79cb61bd981bb4aab3d3b86c1ed1e5bb5994e23f8d41e7c56dfae',
  'all cell painters/layouts remain frozen at 5602647d7; pacing cannot redefine the visual oracle');
// Independent pre-change traversal/order and texture creation, frozen from
// 5602647d7. Shared unchanged painters above are hash-authenticated.
const control = new Function('THREE', 'makeFbm', 'SURFACE_MARKING_STYLE',
  `${stripTypeScriptTypes(painter).replace(/^export /gm, '')}
  return (rng, anisotropy) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = ATLAS;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, ATLAS, ATLAS); const fbm = makeFbm(rng);
    const bake = (idx, draw, erode, freq) => {
      const [ox, oy] = beginCell(ctx, idx); draw(); ctx.restore();
      erodeCell(ctx, fbm, ox, oy, erode, freq);
    };
    for (const i of FAMILY_CELLS.pen) bake(i, () => drawPen(ctx, rng, false), 0.30, 3.4);
    for (const i of FAMILY_CELLS.crit) bake(i, () => drawPen(ctx, rng, true), 0.30, 3.4);
    for (const i of FAMILY_CELLS.scuff) bake(i, () => drawScuff(ctx, rng), 0.34, 4.0);
    for (const i of FAMILY_CELLS.gouge) bake(i, () => drawGouge(ctx, rng), 0.26, 5.2);
    for (const i of FAMILY_CELLS.scorch) bake(i, () => drawScorch(ctx, rng), 0.62, 2.6);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = Math.max(1, anisotropy | 0); return tex;
  };`)(THREE, makeFbm, SURFACE_MARKING_STYLE);
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
    const expected = control(mulberry32((seed ^ SURFACE_MARKING_STYLE.wearSeedSalt) >>> 0), anisotropy);
    const sync = createImpactDecals({ seed, anisotropy });
    const steps = createImpactDecalsSteps({ seed, anisotropy });
    let count = 0, next = steps.next();
    while (!next.done) { count++; next = steps.next(); }
    assert.equal(count, 16, 'one completed-cell checkpoint, including before texture allocation');
    assert.deepEqual(snapshot(sync.material.map), snapshot(expected));
    assert.deepEqual(snapshot(next.value.material.map), snapshot(expected));
    expected.dispose(); disposeDecals(sync); disposeDecals(next.value);
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
  console.log('[impact-atlas-pacing] PASS frozen native bytes/samplers, 16 private checkpoints, cancellation/retry, clocks, coalescing and scene parity');
} finally {
  for (const runtime of liveFx) disposeObject3DResources(runtime.group);
  if (documentBefore) Object.defineProperty(globalThis, 'document', documentBefore);
  else delete globalThis.document;
}
