import { acquireCaptureLock as acquireLock, refreshCaptureLock, releaseCaptureLock as releaseLock } from '../capture-lock.mjs';
// Render the presentation's canonical in-engine Studio action loop, including
// the live Scene Studio controls and cinematic timeline.
//
// Usage:
//   npm run studio:action:render
//   node tools/marketing-shots/record-studio-action-loop.mjs --out shots/studio-action-loop-r2
//   node tools/marketing-shots/record-studio-action-loop.mjs --scene <scene.json> --workspace director --name studio --out <dir>
//     (the home page's Studio card: its master <dir>/studio.webm and <dir>/manifest.json are delivered as
//     features/studio.webm and features/studio.json, tools/media-r5/site-media.mjs)
//
// The staged composition is the checked-in Studio storyboard
// scenes-studio-r1/studio_winter_breakthrough.json — scene, actor tracks and
// camera shots — the same file the presentation-r1 keyframes and the copyable
// recipe come from, so the film, the stills and the recipe cannot drift apart
// (round 53, 2026-09-24: the inline stage this file carried sat on Frosthollow's
// retired lake at (195,-120); round 48 redesigned the map and round 51 moved the
// storyboard onto the c(-16,-150) pond). The narrow rail keeps scenery off the
// tanks. The WebM is the complete browser viewport, so the published film
// demonstrates the real Studio UI rather than a clean canvas.
//
// The film is shot frame by frame on the Studio's export clock: advanceFrame()
// steps the timeline a fixed 1/fps, the page draws, and a screenshot keeps the
// frame, so every frame of the WebM is a new picture whatever the machine's load.
// (2026-10-15: the real-time page.screencast this file used caught 11 viewport
// pictures in the 200 frames of the home page's Studio loop, held up to 1.7 s
// each, and the landing page played them as a 1.7 fps slideshow.)
//   --name <base>       the master's file name (default studio_leclerc_knockout)
//   --keep-frames       keep the PNG frames beside the master

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
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
const baseName = opt('name', 'studio_leclerc_knockout');
const keepFrames = args.includes('--keep-frames');
if (!/^[a-z0-9][a-z0-9_-]*$/i.test(baseName)) throw new Error(`--name ${baseName}: letters, digits, dashes and underscores`);
mkdirSync(outDir, { recursive: true });

const HERE = dirname(fileURLToPath(import.meta.url));
// --scene <file> (home r2, 2026-10-12): film another storyboard scene; --workspace director keeps the Studio rail open
// on its Director workspace (the site's takes as preset cards, the shot list and transport) instead of hiding the
// rail and scrolling to the cinematics timeline.
const SCENE_SOURCE = opt('scene', 'tools/marketing-shots/scenes-studio-r1/studio_winter_breakthrough.json');
const scene = JSON.parse(readFileSync(resolve(SCENE_SOURCE), 'utf8'));
const workspace = opt('workspace', 'timeline');
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
  await page.goto(`${url}?studio=1&map=${scene.map || 'winter'}&nogate=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 180_000,
  });
  await page.waitForFunction(
    (mapId) => window.__GAME_READY === true && window.__STUDIO?.active === true && window.__STUDIO.mapId === mapId,
    { timeout: 180_000 }, scene.map || 'winter',
  );

  const staged = await page.evaluate(async (input, view) => {
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
    S.setRailVisible(view === 'director');
    if (view === 'director') document.querySelector('[data-workspace="director"]')?.click();
    S.seek(0);
    return { scene: S.state(), storyboard: board };
  }, scene, workspace);
  if (workspace === 'director') {
    await page.waitForFunction(() => document.querySelectorAll('[data-site-take]').length > 0, { timeout: 60_000 })
      .catch(() => console.warn('[studio-action] the Director workspace did not list the site takes'));
  }
  writeFileSync(join(outDir, `${baseName}.resolved.json`), `${JSON.stringify(staged.scene, null, 2)}\n`);

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
    const file = `${baseName}_${String(index + 1).padStart(2, '0')}_${tMs}ms.png`;
    writeFileSync(join(outDir, file), bytes);
    console.log(`[studio-action] wrote ${file} (${bytes.length} bytes)`);
  }

  // The film, one frame per export step. A paused timeline draws the camera-rail guide over the scene, so the guide is
  // hidden; the dynamic resolution stays at full scale and the adaptive quality is held, so a slow frame cannot lower
  // the picture; the map's textures and the Director's take cards are ready before the first frame.
  const masterFile = `${baseName}.webm`;
  const masterPath = join(outDir, masterFile);
  const frameDir = join(outDir, `${baseName}-frames`);
  const framePattern = /^f\d{5}\.png$/;
  mkdirSync(frameDir, { recursive: true });
  for (const name of readdirSync(frameDir)) if (framePattern.test(name)) unlinkSync(join(frameDir, name));
  const stepMs = 1000 / fps;
  const frameCount = Math.round(durationMs / stepMs);
  // the timeline workspace brings the cinematics timeline into view where the real-time take scrolled to it (1.65 s)
  const timelineFrame = workspace === 'director' ? -1 : Math.round(1650 / stepMs);
  await page.evaluate(async () => {
    const S = window.__STUDIO;
    S.pause();
    S.seek(0);
    S.setRailVisible(false);
    window.__DEBUG?.post?.pinDynScale?.(1);
    window.__DEBUG?.post?.setAdaptiveSuspended?.(true);
    const dock = document.querySelector('.cot-studio .dock');
    if (dock) dock.scrollTop = 0;
    const world = window.__DEBUG?.world;
    if (world) {
      const { awaitMapCaptureReadiness } = await import('/src/dev/mapCaptureReadiness.ts');
      await awaitMapCaptureReadiness(world, () => window.__DEBUG.world);
    }
    await Promise.all([...document.querySelectorAll('.cot-studio img')].map((img) => img.decode?.().catch(() => {})));
    await document.fonts?.ready;
  });
  for (let frame = 0; frame < frameCount; frame++) {
    if (frame === timelineFrame) {
      await page.evaluate(() => document.querySelector('.cot-studio .timelineBoard')?.scrollIntoView({ block: 'center' }));
    }
    if (frame) await page.evaluate((ms) => window.__STUDIO.advanceFrame(ms), stepMs);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    await page.screenshot({ path: join(frameDir, `f${String(frame).padStart(5, '0')}.png`), type: 'png' });
    if (frame % 30 === 0) console.log(`[studio-action] frame ${frame}/${frameCount}`);
  }
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(fps), '-i', join(frameDir, 'f%05d.png'),
    '-c:v', 'libvpx-vp9', '-crf', '12', '-b:v', '0', '-pix_fmt', 'yuv420p', '-row-mt', '1', '-deadline', 'good',
    '-cpu-used', '2', masterPath], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (!keepFrames) {
    for (const name of readdirSync(frameDir)) if (framePattern.test(name)) unlinkSync(join(frameDir, name));
    try { rmdirSync(frameDir); } catch { /* something else lives there: leave the folder */ }
  }
  const recordingSize = statSync(masterPath).size;
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify({
    version: 1,
    renderer: { width, height, fps },
    scene: `${baseName}.resolved.json`,
    source: SCENE_SOURCE,
    master: masterFile,
    durationMs,
    mimeType: 'video/webm',
    bytes: recordingSize,
    captureMode: 'studio-ui',
    capture: 'frame-stepped',
    frames: frameCount,
    workspace,
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
