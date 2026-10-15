#!/usr/bin/env node
// structure-shell-pool.browser.mjs — Plan W's browser receipt (2026-10-13, the perf stream): the game's own async world
// build, with the structure shells derived in the pool's module workers, gives every collision record and every
// structure anatomy the inline build gives, byte for byte. Two pages of this checkout (Vite dev server): the default
// (workers) and ?inlineShells (every structure derived on the main thread); each switches to every map in turn and packs
// its records the way the collision manifests do (headlessWorldCollision.mjs packCollisionRecord), plus each structure's
// anatomy (world.structureDamage(i).anatomy). The worker page must have posted its structures to the pool.
//
//   node tools/structure-shell-pool.browser.mjs --no-lock [--maps=urban,foundry,blackglass] [--root=.]   (inside a capture-lock hold)
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packCollisionRecord } from './headlessWorldCollision.mjs';
import { openGamePage, withMapProbeSession } from './map-probe-runtime.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const maps = (args.maps || 'urban,foundry,blackglass').split(',');
const root = path.resolve(args.root || fileURLToPath(new URL('..', import.meta.url)));
const QUERY = 'nosplash=1&tier=desktop&gfxreset=1';

const captureScript = (mapId) => `(async () => {
  const world = await window.__DEBUG.switchMap(${JSON.stringify(mapId)});
  const pack = ${packCollisionRecord.toString()};
  const anatomies = [];
  let misses = 0;
  for (let i = 0; misses < 64; i++) {
    const seam = world.structureDamage(i);
    if (!seam) { misses++; continue; }
    misses = 0;
    anatomies.push([i, seam.anatomy]);
  }
  return JSON.stringify({
    obstacles: world.getObstacles().map(pack),
    colliders: world.getColliders().map(pack),
    anatomies,
    pool: world._buildDetail?.props?.structureShells ?? null,
  });
})()`;

// a browser on the GPU: run it inside a capture-lock hold (the perf block runner passes --no-lock)
if (!args['no-lock']) { console.error('run inside a capture-lock hold (the block runner passes --no-lock)'); process.exit(2); }
let failed = 0;
{
  await withMapProbeSession({ root, launch: { width: 1280, height: 720 } }, async ({ browser, port }) => {
    const pages = {};
    for (const [name, query] of [['worker', QUERY], ['inline', `${QUERY}&inlineShells=1`]]) {
      pages[name] = await openGamePage(browser, { port, viewport: { width: 1280, height: 720 }, query });
    }
    for (const mapId of maps) {
      const results = {};
      for (const name of ['worker', 'inline']) {
        const text = await pages[name].page.evaluate(captureScript(mapId));
        results[name] = JSON.parse(text);
        results[name].sha = createHash('sha256').update(JSON.stringify([results[name].obstacles, results[name].colliders, results[name].anatomies])).digest('hex').slice(0, 16);
      }
      const { worker, inline } = results;
      const same = JSON.stringify([worker.obstacles, worker.colliders]) === JSON.stringify([inline.obstacles, inline.colliders]);
      const sameAnatomy = JSON.stringify(worker.anatomies) === JSON.stringify(inline.anatomies);
      const pooled = worker.pool && worker.pool.posted > 0 && inline.pool === null;
      const ok = same && sameAnatomy && pooled;
      if (!ok) failed++;
      console.log(`${mapId}: ${ok ? 'EQUAL' : 'DIFFERENT'} — ${worker.obstacles.length} obstacles, ${worker.colliders.length} colliders, `
        + `${worker.anatomies.length} anatomies; records ${same ? 'equal' : 'DIFFER'}, anatomies ${sameAnatomy ? 'equal' : 'DIFFER'}; `
        + `worker pool ${JSON.stringify(worker.pool)} (inline page ${JSON.stringify(inline.pool)}); sha ${worker.sha} / ${inline.sha}`);
    }
    for (const { page, errors } of Object.values(pages)) {
      if (errors.length) { failed++; console.log(`page errors: ${errors.slice(0, 5).join(' | ')}`); }
      await page.close().catch(() => {});
    }
  });
}
console.log(failed ? `structure-shell-pool.browser: ${failed} failure(s)` : `structure-shell-pool.browser: ${maps.length} maps equal on the worker and inline paths`);
process.exit(failed ? 1 : 0);
