import { acquireCaptureLock as acquireLock, refreshCaptureLock, releaseCaptureLock as releaseLock } from './capture-lock.mjs';
// Headless screenshot harness for critic agents.
// Usage: node tools/screenshot.mjs [--out shots] [--views name1,name2]
//   [--width 1920] [--height 1080] [--dpr 1] [--dyn-scale 0.8]
// Starts a vite dev server, loads the game in headless Chromium, waits for
// window.__GAME_READY, then iterates window.__SHOTS.views (or --views subset),
// calling window.__SHOTS.set(name) before each capture.
// Exits non-zero and prints page console errors if the game fails to load.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Exclusive run lock (controls_gunnery r3): parallel harness instances on one
// machine starve each other's vite/Chromium cold starts into spurious
// "Navigation timeout" gate failures. mkdir is the atomic primitive; a lock
// older than 5 min is stale (crashed run) and is reclaimed.
//
// performance_budget r4 (critic major: lock starvation): the randomized mkdir
// spin is NOT fair — with 8+ sibling harnesses queued a waiter can lose every
// wakeup race until its 20-minute budget expires (observed during the r4
// review). Waiters now take a FIFO TICKET (ordered file in
// /tmp/cot-shots.queue); only the lowest live ticket contends for the mkdir,
// so handoff is first-come-first-served and starvation-free among
// ticket-aware tools, while old-protocol tools remain mutually excluded by
// the same atomic directory.

await acquireLock(20 * 60 * 1000);
process.on('exit', releaseLock);
// performance_budget r4: a full 13-view capture under machine load can exceed
// the 5-minute staleness horizon — without a refresher a sibling reclaims the
// LIVE lock mid-capture and two Chromium instances share the GPU (this is one
// of the ways review-window perf evidence kept getting contended). Same
// refresher tools/perfprobe.mjs has carried since r2.
const lockRefresher = setInterval(() => { refreshCaptureLock(); }, 60 * 1000);
lockRefresher.unref();

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const outDir = resolve(opt('out', 'shots'));
const width = parseInt(opt('width', '1920'), 10);
const height = parseInt(opt('height', '1080'), 10);
const dpr = parseFloat(opt('dpr', '1'));
const dynScaleArg = opt('dyn-scale', '');
const dynScale = dynScaleArg === '' ? null : parseFloat(dynScaleArg);
const onlyViews = opt('views', '') ? opt('views', '').split(',') : null;
mkdirSync(outDir, { recursive: true });

const port = 5200 + Math.floor(Math.random() * 700);
const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  // hmr:false (content r4 / r3 CB handoff item): concurrent sessions editing
  // src/ during a capture trigger a vite HMR full reload that destroys the
  // puppeteer execution context mid-evaluate ("Execution context was
  // destroyed"). The harness captures a static build state — live reload has
  // no value here.
  // camo_spotting r3: watch off too — a concurrent editor session touching
  // src/ mid-capture triggered a full-reload navigation that destroyed the
  // evaluate context (spotting-check.mjs has carried this fix since r2).
  server: { port, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
  optimizeDeps: {
    // tank_models r3: pre-bundle the lazy-loaded modules so dep discovery can
    // never trigger a mid-capture page reload / stale-chunk 504
    entries: ['index.html'],
    include: [
      'three',
      'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js',
    ],
  },
});
await server.listen();
const actualPort = server.config.server.port;
const url = `http://localhost:${actualPort}/`;
console.log(`[shots] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: dpr });

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('favicon')) consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

let failed = false;
try {
  // tank_models/terrain_environment/hud_ui r3: one retry on navigation/ready
  // timeout — cold vite transforms under machine load can legitimately exceed
  // the old 30 s budget, and stale-dep 504s from a failed attempt are not
  // capture errors.
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
      break;
    } catch (err) {
      if (attempt >= 1) throw err;
      console.warn(`[shots] load attempt ${attempt + 1} failed (${err.message}) — retrying`);
      consoleErrors.length = 0;
    }
  }

  const views = await page.evaluate(() =>
    window.__SHOTS && Array.isArray(window.__SHOTS.views) ? window.__SHOTS.views : []
  );
  const targets = onlyViews ? views.filter((v) => onlyViews.includes(v)) : views;
  if (targets.length === 0) throw new Error('No screenshot views exposed via window.__SHOTS.views');

  for (const view of targets) {
    await page.evaluate((v) => window.__SHOTS.set(v), view);
    if (Number.isFinite(dynScale)) {
      await page.evaluate((scale) => window.__DEBUG.post.pinDynScale(scale), dynScale);
    }
    // let the scene settle: post-processing, particles, LOD, shadows.
    // Map-switch views rebuild the whole world (terrain bake, props,
    // vegetation) — on cold vite transforms the fixed 1.2 s could capture
    // the PREVIOUS screen (terrain_environment r1), so they get ~3 s.
    const settleMs = view.startsWith('battlefield_') ? 3000 : 1200;
    // performance_budget r3 (capture determinism, killcam r2 follow-up): the
    // garage view RESUMES the GLB idle queue so the pedestal hero can land —
    // but the fixed settle raced the swap under machine load and a GREEN run
    // shipped an empty pedestal. Wait (bounded) for the queue to drain AND
    // hold stable before the settle; on timeout capture anyway (never hang).
    if (view === 'garage') {
      await page.waitForFunction(
        `(() => {
          const s = window.__GLB_STATS;
          if (!s) return true;
          const key = s.settled + '/' + s.started;
          if (s.settled < s.started) { window.__GLB_STABLE_SHOT = null; return false; }
          if (!window.__GLB_STABLE_SHOT || window.__GLB_STABLE_SHOT.key !== key) {
            window.__GLB_STABLE_SHOT = { key, at: performance.now() };
            return false;
          }
          return performance.now() - window.__GLB_STABLE_SHOT.at > 800;
        })()`,
        { timeout: 20000, polling: 200 },
      ).catch(() => console.warn('[shots] garage GLB queue did not settle within 20 s — capturing anyway'));
    }
    await new Promise((r) => setTimeout(r, settleMs));
    const file = `${outDir}/${view}.png`;
    await page.screenshot({ path: file });
    const renderState = await page.evaluate(() => {
      const canvas = window.__DEBUG.renderer.domElement;
      return {
        canvas: [canvas.width, canvas.height],
        renderScale: canvas.dataset.renderScale,
        dynScale: canvas.dataset.dynScale,
        postAA: canvas.dataset.postAa,
        softDepthCopies: window.__DEBUG.post.lateFx?.softDepthCopies ?? 0,
      };
    });
    console.log(`[shots] state ${view} ${JSON.stringify(renderState)}`);
    // tank_models r3: fail instead of shipping an empty turntable.
    if (view === 'garage') {
      const heroOk = await page.evaluate(() => {
        const D = window.__DEBUG; if (!D) return false;
        let ok = false;
        D.scene.traverse((o) => {
          if (ok || !o.name || !o.name.startsWith('tank_')) return;
          if (o.parent !== D.scene) return;
          const dx = o.position.x + 1500, dz = o.position.z + 1500;
          if (dx * dx + dz * dz > 3600) return;      // 60 m of the garage disc
          if (!o.visible) return;
          let vis = 0;
          o.traverse((c) => { if (c.isMesh && c.visible) vis++; });
          ok = vis > 10;                              // real model, not a stub
        });
        return ok;
      });
      if (!heroOk) throw new Error('garage view captured with an EMPTY pedestal (no visible hero tank)');
    }
    // tank_models r3: guard against a future dead-flank/stand-in restage.
    // camo r3 amendment: the from-scratch rebuild program (owner mandate)
    // re-registers vehicles as procedural while their curve-true builds land
    // — m1a2 flipped to {source:'procedural'} on 2026-08-04. Require the GLB
    // swap ONLY while a GLB source is registered; a procedural registration
    // gets the garage view's visible-hero check instead (real model, not a
    // stub or an empty flank).
    if (view === 'tank_closeup_modern') {
      const closeupOk = await page.evaluate(async () => {
        const t = window.__DEBUG.game.tankById.get('m1a2');
        if (!t || !t.visual) return false;
        const S = await import('/src/vehicles/specs.ts');
        const src = (S.MODEL_SOURCE || {}).m1a2;
        const wantsGlb = !!(src && src.source && src.source !== 'procedural');
        let swapped = false, vis = 0;
        t.visual.root.traverse((o) => {
          if (o.userData && o.userData.__glbSwapped) swapped = true;
          if (o.isMesh && o.visible) vis++;
        });
        return wantsGlb ? swapped : vis > 10;
      });
      if (!closeupOk) throw new Error('tank_closeup_modern captured a stand-in (GLB unswapped or stub model)');
    }
    console.log(`[shots] captured ${file}`);
  }
} catch (err) {
  failed = true;
  console.error(`[shots] FAILED: ${err.stack || err.message}`);
} finally {
  if (consoleErrors.length) {
    console.error(`[shots] page console errors (${consoleErrors.length}):`);
    for (const e of consoleErrors.slice(0, 30)) console.error(`  ${e}`);
  }
  await browser.close();
  await server.close();
}
process.exit(failed || consoleErrors.length ? 1 : 0);
