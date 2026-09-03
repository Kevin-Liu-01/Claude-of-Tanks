import { acquireCaptureLock as acquireLock, refreshCaptureLock, releaseCaptureLock as releaseLock } from '../capture-lock.mjs';
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
// Scenes are shot grouped by map (fewest map rebuilds) but written under
// their own names, so ordering never changes output. Extra keys on the scene
// JSON (e.g. "meta") are ignored by __STUDIO.load.
//
// Shares the /tmp/cot-shots FIFO lock with the other capture harnesses so
// concurrent agent runs never contend for the GPU (same protocol as
// tools/screenshot.mjs / tools/studio-selftest.mjs — keep in sync).
// Own vite on a 7xxx port — NEVER 5001/5002.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- exclusive harness lock (FIFO ticket protocol, see screenshot.mjs) ------

// --- options -----------------------------------------------------------------
const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const WIDTH = parseInt(opt('width', '3840'), 10);
const outDir = resolve(opt('out', 'shots/marketing/raw'));
const matchArg = opt('match', '');
const matches = matchArg ? matchArg.split(',').map((s) => s.trim()).filter(Boolean) : null;
mkdirSync(outDir, { recursive: true });

const HERE = dirname(fileURLToPath(import.meta.url));
const sceneDir = resolve(opt('scenes', join(HERE, 'scenes')));
let sceneFiles = readdirSync(sceneDir).filter((n) => n.endsWith('.json')).sort();
if (matches) sceneFiles = sceneFiles.filter((n) => matches.some((m) => n.includes(m)));
if (!sceneFiles.length) {
  console.error('[marketing-shots] no scene files matched');
  process.exit(1);
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

await acquireLock(30 * 60 * 1000);
process.on('exit', releaseLock);
const lockRefresher = setInterval(() => { refreshCaptureLock(); }, 60 * 1000);
lockRefresher.unref();

// --- vite (own 7xxx port — NEVER 5001/5002) -----------------------------------
const port = 7300 + Math.floor(Math.random() * 500);
const server = await createServer({
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

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
// 16:9 stage — capture inherits the live aspect, so 3840 -> 3840x2160
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('favicon')) consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

function pngSize(buf) {
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

let failed = false;
const shot = [];
try {
  const firstMap = scenes[0].json.map || 'verdant';
  await page.goto(`${url}?studio=1&map=${firstMap}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 180000 });
  await page.waitForFunction(
    `window.__STUDIO && window.__STUDIO.active === true && window.__STUDIO.mapId === '${firstMap}'`,
    { timeout: 180000 },
  );
  console.log(`[marketing-shots] studio entered on ${firstMap}`);

  for (const sc of scenes) {
    const t0 = Date.now();
    try {
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
      shot.push(sc.name);
    } catch (err) {
      failed = true;
      console.error(`[marketing-shots] FAILED ${sc.name}: ${err.message}`);
    }
  }
} catch (err) {
  failed = true;
  console.error(`[marketing-shots] FATAL: ${err.message}`);
} finally {
  if (consoleErrors.length) {
    console.error(`[marketing-shots] page console errors (${consoleErrors.length}):`);
    for (const e of consoleErrors.slice(0, 20)) console.error(`  ${e}`);
  }
  await browser.close();
  await server.close();
}
console.log(`[marketing-shots] done: ${shot.length}/${scenes.length} captured`);
process.exit(failed ? 1 : 0);
