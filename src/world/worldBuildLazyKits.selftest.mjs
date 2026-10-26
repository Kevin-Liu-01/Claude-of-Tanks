// (battle-spikes-253) A page's world build under lazy kits, through the prefetch path. A page loads a map's architecture
// styles on demand (loadMapKits, awaited before the props build); Node loads every kit while the registries evaluate, so
// a plan made at the build's start that resolved a style passed every Node receipt and failed every render-kit map's
// build in the browser (a025fe4ccf: "Architecture style franconian/shanghai is not loaded"; nav-perf's rooms census on
// Suzhou Creek, the solo census on Steinburg). This receipt runs the page's way in a child (COT_KITS_LAZY=1) with Worker
// defined, so the paint, ring, wreck and shell prefetches start as they do in a page: Suzhou Creek (the shanghai kit's
// lime render) builds, its style unloaded at the start, and its kit's render prints join the paint worker once the kits
// have loaded.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.env.COT_KITS_LAZY !== '1') {
  const child = spawnSync(process.execPath, ['--max-old-space-size=4096', fileURLToPath(import.meta.url)], {
    env: { ...process.env, COT_KITS_LAZY: '1' }, encoding: 'utf8', timeout: 900000,
  });
  const tail = (child.stderr || '').split('\n').filter((line) => line && !/Warning|trace-warnings/.test(line)).slice(-10).join(' | ');
  assert.equal(child.status, 0, `the page's way under lazy kits: ${tail}`);
  console.log(child.stdout.trim().split('\n').pop());
  process.exit(0);
}

const { installWorldBuildFixture } = await import('../../tools/headlessWorldCollision.mjs');
installWorldBuildFixture();
const THREE = await import('three');

// a Worker as a page has one: the surface paint worker records its jobs and answers each as failed (the props build
// paints it where it stands); every other worker reports an error (each prefetch falls back to its inline path)
const paintJobs = [];
globalThis.Worker = class FakeWorker {
  constructor(url) { this.url = String(url); this.onmessage = null; this.onerror = null; }
  postMessage(job) {
    if (this.url.includes('surfacePaintWorker')) {
      paintJobs.push({ kind: job.kind, seed: job.seed });
      setTimeout(() => this.onmessage?.({ data: { id: job.id, ok: false, message: 'a test worker paints nothing' } }), 0);
      return;
    }
    setTimeout(() => this.onerror?.({ message: 'a test worker answers nothing' }), 0);
  }
  terminate() {}
  addEventListener() {}
  removeEventListener() {}
};

const regional = await import('./maps/regional/index.ts');
const { getMapConfig } = await import('./maps/index.ts');
const config = getMapConfig('blackglass');
const styleId = config.props?.architecture;
assert.equal(styleId, 'shanghai', 'Suzhou Creek builds in the shanghai kit');
assert.throws(() => regional.resolveRegionalArchitecture(styleId), /not loaded/, 'its style is not loaded when the build starts');

const { createMapAsync } = await import('./map.ts');
const scene = new THREE.Scene();
const engineCtx = { scene, anisotropy: 4, setupShadowMaterial() {}, releaseShadowMaterial() {} };
const started = performance.now();
const world = await createMapAsync(engineCtx, { mapId: 'blackglass', seed: 1337 },
  async () => { await new Promise((resolve) => setImmediate(resolve)); }, { fineSlices: true });
assert.ok(world?.group, 'the world builds');
assert.equal(regional.resolveRegionalArchitecture(styleId).id, styleId, 'its style loaded with its kits');
const kitRender = regional.resolveRegionalArchitecture(styleId).surfaces.render;
const limeJobs = paintJobs.filter((job) => job.kind === kitRender.kind).map((job) => job.seed);
assert.deepEqual(limeJobs, [kitRender.seed, kitRender.seed + 1], 'the kit render prints joined the paint worker once the kits loaded');
assert.ok(paintJobs.findIndex((job) => job.kind === kitRender.kind) > 0, 'after the fixed prints planned at the start');
world.dispose?.();
console.log(`worldBuildLazyKits.selftest: Suzhou Creek built under lazy kits through the prefetch path (${Math.round(performance.now() - started)} ms), its shanghai style loaded with its kits, its render prints added after them PASS`);
process.exit(0);
