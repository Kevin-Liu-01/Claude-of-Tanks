import { launchGuardedBrowser } from '../browser-launch.mjs';
import { freezePage, thawPage } from '../capture-hold.mjs';
import { heldRunExitCode, heldStopWhy, openHeldRun, runHeldItem } from '../held-items.mjs';
// tools/marketing-shots/shoot.mjs — marketing screenshot batch driver.
//
// Drives window.__STUDIO (docs/STUDIO.md) over every scene JSON in
// tools/marketing-shots/scenes/*.json and captures one hi-res PNG per scene
// to shots/marketing/raw/<scene-name>.png. Scene files are the checked-in
// source of truth — same JSON in, same frame out (studio determinism
// contract), so any shot can be reproduced or iterated by editing its JSON.
//
// Usage:
//   node tools/marketing-shots/shoot.mjs                 # all scenes @3840
//   node tools/marketing-shots/shoot.mjs --width 1600    # fast preview pass
//   node tools/marketing-shots/shoot.mjs --match 07,12   # only scenes whose
//                                                        # filename contains
//                                                        # one of the tokens
//   node tools/marketing-shots/shoot.mjs --out shots/marketing/raw
//
// A flag given twice takes its last value (round 4 E10; recorded round 5 U9): the --match a stop's finishing run appends
// to the same options replaces the run's own, and a trailing flag overrides one given before it.
//
// Scenes are shot grouped by map (fewest map rebuilds) but written under
// their own names, so ordering never changes output. Extra keys on the scene
// JSON (e.g. "meta") are ignored by __STUDIO.load.
//
// Shares the /tmp/cot-shots FIFO lock with the other capture harnesses so
// concurrent agent runs never contend for the GPU (same protocol as
// tools/screenshot.mjs / tools/studio-selftest.mjs — keep in sync).
// Own vite on a 7xxx port — NEVER 5001/5002.

import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForBootLoaded } from '../game-readiness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function pngSize(buf) {
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * The pass as a function (round 4 F12: tools/long-hold-users.selftest.mjs drives it in Node, with no Vite or Chrome).
 * `args` are the command line's arguments; it sets process.exitCode. `deps` stand in for what serves and draws:
 * `createServer` (Vite's), `puppeteer` (the launcher launchGuardedBrowser takes) and `hold` (openCaptureHold options laid
 * over the tool's own: a stand-in lock, its log, its teardown).
 */
export async function shootMarketing(args = process.argv.slice(2), { createServer = null, puppeteer = null, hold: holdOptions = {} } = {}) {
  // --- options -----------------------------------------------------------------
  // (round 4 E10 review) the last occurrence: a finishing run named by a stop appends --match <left> to the same options,
  // which may hold a --match already (a finishing run stopped again); the first one won, and every scene was shot again
  function opt(name, fallback) {
    const i = args.lastIndexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : fallback;
  }
  const WIDTH = parseInt(opt('width', '3840'), 10);
  const outDir = resolve(opt('out', 'shots/marketing/raw'));
  const matchArg = opt('match', '');
  const matches = matchArg ? matchArg.split(',').map((s) => s.trim()).filter(Boolean) : null;
  mkdirSync(outDir, { recursive: true });

  const sceneDir = resolve(opt('scenes', join(HERE, 'scenes')));
  let sceneFiles = readdirSync(sceneDir).filter((n) => n.endsWith('.json')).sort();
  if (matches) sceneFiles = sceneFiles.filter((n) => matches.some((m) => n.includes(m)));
  if (!sceneFiles.length) {
    console.error('[marketing-shots] no scene files matched');
    process.exitCode = 1;
    return;
  }
  const scenes = sceneFiles.map((f) => {
    const json = JSON.parse(readFileSync(join(sceneDir, f), 'utf8'));
    return { file: f, name: f.replace(/\.json$/, ''), json };
  });
  // group by map so the chunked world build runs at most once per map
  const MAP_ORDER = ['desert', 'winter', 'urban', 'verdant'];
  scenes.sort((a, b) => {
    const ma = MAP_ORDER.indexOf(a.json.map || 'verdant');
    const mb = MAP_ORDER.indexOf(b.json.map || 'verdant');
    return ma !== mb ? ma - mb : a.file.localeCompare(b.file);
  });
  console.log(`[marketing-shots] ${scenes.length} scene(s), width ${WIDTH} -> ${outDir}`);
  createServer ??= (await import('vite')).createServer;
  puppeteer ??= (await import('puppeteer')).default;

  // (round 3 A5 review) a whole pass (30 scenes at 3840 px, a world build per map) can run past the lock's 20-min cap, which
  // the hold enforces: between scenes it yields while anyone waits, the Studio page frozen through the yield (it draws every
  // frame) and thawed once the lock is held again. The grace (180 s, not the default 60) lets a scene in flight when the cap
  // comes (a map change builds a world) finish before its yield. A hold that was stopped (a signal, a yield that could not
  // hold again) ends the pass and names the --match run that finishes it. (round 4 E10) Each scene's end is
  // tools/held-items.mjs runHeldItem's and the exit code heldRunExitCode's: 1 for a FAILED scene, 3 for scenes left
  // only (it was 1 for both), a signal's 128 + n stands (it was 1), also while queued (openHeldRun: nothing shot).
  let page = null, frozen = null;
  const hold = await openHeldRun({ label: 'shoot', timeoutMs: 30 * 60 * 1000, graceSeconds: 180,
    onYield: async () => { frozen = await freezePage(page); },
    onResume: async () => { await thawPage(page, frozen); frozen = null; }, ...holdOptions });
  if (!hold) return;

  let failed = false, leftFrom = null, next = 0, server = null, browser = null;
  const shot = [];
  const consoleErrors = [];
  try {
    // --- vite (own 7xxx port — NEVER 5001/5002) ---------------------------------
    // (round 4 E10) inside the try with the Studio's boot: a stop during either (a signal refuses the launch) leaves every
    // scene, its exit code kept; it threw past that code (exit 1)
    const port = 7300 + Math.floor(Math.random() * 500);
    server = await createServer({
      root: process.cwd(),
      logLevel: 'error',
      server: { port, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
      optimizeDeps: {
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
    const url = `http://localhost:${server.config.server.port}/`;
    console.log(`[marketing-shots] vite up at ${url}`);

    browser = await launchGuardedBrowser(puppeteer, {
      headless: 'new',
      protocolTimeout: 300000,
      args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
    });
    page = await browser.newPage();
    // 16:9 stage — capture inherits the live aspect, so 3840 -> 3840x2160
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    const firstMap = scenes[0].json.map || 'verdant';
    await page.goto(`${url}?studio=1&map=${firstMap}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await waitForBootLoaded(page, { timeout: 180000 });
    await page.waitForFunction(
      `window.__STUDIO && window.__STUDIO.active === true && window.__STUDIO.mapId === '${firstMap}'`,
      { timeout: 180000 },
    );
    console.log(`[marketing-shots] studio entered on ${firstMap}`);

    for (const [index, sc] of scenes.entries()) {
      next = index;
      const t0 = Date.now();
      const item = await runHeldItem(hold, async () => {
        await page.evaluate(
          (scene) => window.__STUDIO.load(scene),
          sc.json,
        );
        // camera-variant tuning mode: scene JSON may carry "cameraVariants":
        // [{pos,lookAt,fov,...}, ...] — the scene is loaded ONCE and one PNG per
        // camera is captured (suffix _vN). Bake the winner into "camera" and
        // drop the array for the production pass (camera moves are the only
        // non-destructive post-load edit, per the studio determinism contract).
        const variants = Array.isArray(sc.json.cameraVariants) ? sc.json.cameraVariants : null;
        const takes = variants
          ? variants.map((cam, i) => ({ cam, file: `${sc.name}_v${i + 1}.png` }))
          : [{ cam: null, file: `${sc.name}.png` }];
        for (const take of takes) {
          if (take.cam) {
            await page.evaluate((cam) => window.__STUDIO.setCamera(cam), take.cam);
          }
          const cap = await page.evaluate(
            (w) => window.__STUDIO.capture({ width: w }),
            WIDTH,
          );
          const b64 = cap.dataURL.split(',')[1];
          const buf = Buffer.from(b64, 'base64');
          const dims = pngSize(buf);
          if (!dims) throw new Error('capture is not a PNG');
          writeFileSync(join(outDir, take.file), buf);
          console.log(`[marketing-shots] ${take.file} (${dims.width}x${dims.height}, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
        }
      });
      // the stop came before this scene or cut it (its browser stopped under it): left with the rest, not FAILED
      if (item.outcome === 'left') { leftFrom = index; break; }
      if (item.outcome === 'failed') {
        failed = true;
        console.error(`[marketing-shots] FAILED ${sc.name}: ${item.error.message}`);
        continue;
      }
      shot.push(sc.name);
    }
  } catch (err) {
    // a stop before the scenes (Vite, the launch or the Studio's boot cut by a signal) leaves every scene not yet shot
    if (hold.signal.aborted) leftFrom ??= next;
    else {
      failed = true;
      console.error(`[marketing-shots] FATAL: ${err.message}`);
    }
  } finally {
    if (consoleErrors.length) {
      console.error(`[marketing-shots] page console errors (${consoleErrors.length}):`);
      for (const e of consoleErrors.slice(0, 20)) console.error(`  ${e}`);
    }
    if (browser) await browser.close();
    if (server) await server.close();
    await hold.release();
  }
  if (leftFrom !== null) {
    const left = scenes.slice(leftFrom).map((scene) => scene.name);
    console.error(`[marketing-shots] the capture hold was stopped (${heldStopWhy(hold.signal)}): `
      + `${left.length} scene(s) left; finish with the same options and --match ${left.join(',')}`);
  }
  console.log(`[marketing-shots] done: ${shot.length}/${scenes.length} captured`);
  heldRunExitCode({ failed, left: leftFrom !== null });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await shootMarketing();
  process.exit();
}
