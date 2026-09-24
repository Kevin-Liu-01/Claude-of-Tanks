import { acquireCaptureLock as acquireLock, refreshCaptureLock, releaseCaptureLock as releaseLock } from '../capture-lock.mjs';
// Render the presentation's canonical in-engine Studio action loop, including
// the live Scene Studio controls and cinematic timeline.
//
// Usage:
//   npm run studio:action:render
//   node tools/marketing-shots/record-studio-action-loop.mjs --out shots/studio-action-loop-r2
//
// The staged composition is the checked-in Studio storyboard
// scenes-studio-r1/studio_winter_breakthrough.json — scene, actor tracks and
// camera shots — the same file the presentation-r1 keyframes and the copyable
// recipe come from, so the film, the stills and the recipe cannot drift apart
// (round 53, 2026-09-24: the inline stage this file carried sat on Frosthollow's
// retired lake at (195,-120); round 48 redesigned the map and round 51 moved the
// storyboard onto the c(-16,-150) pond). The narrow rail keeps scenery off the
// tanks. The WebM records the complete browser viewport so the published film
// demonstrates the real Studio UI rather than a clean canvas.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
function opt(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const outDir = resolve(opt('out', 'shots/studio-action-loop-r2'));
const fps = Math.max(24, Math.min(60, Number.parseInt(opt('fps', '30'), 10) || 30));
const width = Math.max(1280, Math.min(3840, Number.parseInt(opt('width', '1920'), 10) || 1920));
const height = Math.max(720, Math.min(2160, Number.parseInt(opt('height', '1080'), 10) || 1080));
const bitrate = Math.max(4_000_000, Math.min(
  30_000_000,
  Number.parseInt(opt('bitrate', '10000000'), 10) || 10_000_000,
));
mkdirSync(outDir, { recursive: true });

const HERE = dirname(fileURLToPath(import.meta.url));
const SCENE_SOURCE = 'tools/marketing-shots/scenes-studio-r1/studio_winter_breakthrough.json';
const scene = JSON.parse(readFileSync(join(HERE, 'scenes-studio-r1', 'studio_winter_breakthrough.json'), 'utf8'));
if (!scene.storyboard?.shots?.length || !scene.storyboard.actorTracks?.length) {
  throw new Error(`${SCENE_SOURCE} must carry a storyboard with camera shots and actor tracks`);
}
const durationMs = scene.storyboard.durationMs;

await acquireLock(45 * 60 * 1000);
process.on('exit', releaseLock);
const lockRefresher = setInterval(() => { refreshCaptureLock(); }, 60 * 1000);
lockRefresher.unref();

const port = 7800 + Math.floor(Math.random() * 400);
let server = null;
let browser = null;
const consoleErrors = [];

try {
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
  console.log(`[studio-action] vite up at ${url}`);

  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon')) {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));
  await page.goto(`${url}?studio=1&map=winter&nogate=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 180_000,
  });
  await page.waitForFunction(
    "window.__GAME_READY === true && window.__STUDIO?.active === true && window.__STUDIO.mapId === 'winter'",
    { timeout: 180_000 },
  );

  const staged = await page.evaluate(async (input) => {
    const S = window.__STUDIO;
    // load() takes the storyboard with the scene (docs/STUDIO.md scene schema)
    await S.load(input);
    for (const actor of S.listActors()) {
      const info = S.getSpecInfo(actor.id);
      if (info.era !== 'modern') {
        throw new Error(`${info.id} is ${info.era}, expected a modern-era vehicle`);
      }
    }
    const board = S.getStoryboard();
    if (board.durationMs !== input.storyboard.durationMs || board.shots.length !== input.storyboard.shots.length) {
      throw new Error(`storyboard did not load as authored: ${board.shots.length} shots over ${board.durationMs} ms`);
    }
    S.setRailVisible(false);
    S.seek(0);
    return { scene: S.state(), storyboard: board };
  }, scene);
  writeFileSync(join(outDir, 'studio_leclerc_knockout.resolved.json'), `${JSON.stringify(staged.scene, null, 2)}\n`);

  const keyframes = [850, 1550, 2600, 4150, 5200];
  for (let index = 0; index < keyframes.length; index++) {
    const tMs = keyframes[index];
    const captured = await page.evaluate(async (input) => {
      const S = window.__STUDIO;
      S.seek(input.timeMs);
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      return S.capture({ width: input.width, height: input.height, type: 'image/png', download: false });
    }, { width, height, timeMs: tMs });
    const bytes = Buffer.from(String(captured.dataURL).split(',')[1], 'base64');
    const file = `studio_leclerc_knockout_${String(index + 1).padStart(2, '0')}_${tMs}ms.png`;
    writeFileSync(join(outDir, file), bytes);
    console.log(`[studio-action] wrote ${file} (${bytes.length} bytes)`);
  }

  const masterFile = 'studio_leclerc_knockout.webm';
  const masterPath = join(outDir, masterFile);
  await page.evaluate(() => {
    const S = window.__STUDIO;
    S.seek(0);
    const dock = document.querySelector('.cot-studio .dock');
    if (dock) dock.scrollTop = 0;
  });
  const recorder = await page.screencast({
    path: masterPath,
    fps,
    quality: 24,
    ffmpegPath: '/opt/homebrew/bin/ffmpeg',
  });
  await page.evaluate(() => window.__STUDIO.play());
  await new Promise((done) => setTimeout(done, 1650));
  await page.evaluate(() => {
    const timeline = document.querySelector('.cot-studio .timelineBoard');
    timeline?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  await page.waitForFunction(
    'window.__STUDIO.playing === false && window.__STUDIO.fxTimeMs >= window.__STUDIO.durationMs - 1',
    { timeout: 30_000 },
  );
  await new Promise((done) => setTimeout(done, 350));
  await recorder.stop();
  const recordingSize = statSync(masterPath).size;
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify({
    version: 1,
    renderer: { width, height, fps, bitrate },
    scene: 'studio_leclerc_knockout.resolved.json',
    source: SCENE_SOURCE,
    master: masterFile,
    durationMs,
    mimeType: 'video/webm',
    bytes: recordingSize,
    captureMode: 'studio-ui',
    keyframes,
    actors: scene.actors.map(({ id, name }) => ({ id, name })),
    effects: scene.effects.map(({ type, actor, tMs }) => ({ type, actor: actor || null, tMs })),
  }, null, 2)}\n`);
  console.log(`[studio-action] wrote ${masterFile} (${recordingSize} bytes)`);

  if (consoleErrors.length) {
    throw new Error(`Page emitted ${consoleErrors.length} console error(s): ${consoleErrors.slice(0, 5).join(' | ')}`);
  }
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  releaseLock();
}
