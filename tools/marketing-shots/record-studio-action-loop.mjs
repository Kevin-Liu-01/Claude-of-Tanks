import { acquireCaptureLock as acquireLock, refreshCaptureLock, releaseCaptureLock as releaseLock } from '../capture-lock.mjs';
// Render the presentation's canonical in-engine Studio action loop, including
// the live Scene Studio controls and cinematic timeline.
//
// Usage:
//   npm run studio:action:render
//   node tools/marketing-shots/record-studio-action-loop.mjs --out shots/studio-action-loop-r2
//
// The staged composition starts from a camera already approved by the battle
// screenshot campaign, then uses a deliberately narrow rail so scenery cannot
// occlude the tanks. The WebM records the complete browser viewport so the
// published film demonstrates the real Studio UI rather than a clean canvas.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

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

const scene = {
  map: 'winter',
  seed: 8222,
  actors: [
    { id: 'strv122', name: 'shooter', pos: [176, -108], facingDeg: 122, turretDeg: -1, gunDeg: 0.5, camo: 'winterbands', camoSeed: 8220 },
    { id: 'leclerc', name: 'victim', pos: [198, -123], facingDeg: 300, turretDeg: 20, gunDeg: 0.5, camo: 'winterbands', camoSeed: 8221 },
  ],
  effects: [
    { type: 'dust', actor: 'shooter', tMs: 250, params: { count: 14, intensity: 0.8, dirDeg: 302 } },
    { type: 'fire', actor: 'shooter', tMs: 1120, params: { slot: 0, tracer: true, recoil: true } },
    { type: 'impact', actor: 'victim', tMs: 1450, params: { kind: 'nonpen', caliberMm: 120, hFrac: 0.56 } },
    { type: 'sparks', actor: 'victim', tMs: 1520, params: { caliberMm: 120, kind: 'ricochet', hFrac: 0.58 } },
    { type: 'fire', actor: 'victim', tMs: 2720, params: { slot: 0, tracer: true, recoil: true } },
    { type: 'sparks', actor: 'shooter', tMs: 2960, params: { caliberMm: 125, kind: 'ricochet', hFrac: 0.68 } },
    { type: 'fire', actor: 'shooter', tMs: 3580, params: { slot: 0, tracer: true, recoil: true } },
    { type: 'detrack', actor: 'victim', tMs: 3740, params: { side: 'L' } },
    { type: 'tank_kill', actor: 'victim', tMs: 3980, params: { cause: 'ammorack', pop: true } },
  ],
  camera: {
    pos: [164.5, 1.1, -132.8],
    lookAt: [187, 2.4, -118.5],
    groundRel: true,
    fov: 30,
    rollDeg: 1,
  },
  fxTime: 0,
  timeScale: 0,
};

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
    await S.load(input);
    for (const actor of S.listActors()) {
      const info = S.getSpecInfo(actor.id);
      if (info.era !== 'modern') {
        throw new Error(`${info.id} is ${info.era}, expected a modern-era vehicle`);
      }
    }
    const base = S.getCamera();
    const [x, y, z] = base.pos;
    const [lx, ly, lz] = base.lookAt;
    const durationMs = 6500;
    const storyboard = {
      durationMs,
      shots: [
        { id: 'open', label: 'Armored contact', tMs: 0,
          pos: [x, y, z], lookAt: [lx, ly, lz], fov: 30, rollDeg: 1, transition: 'linear' },
        { id: 'push', label: 'Return fire', tMs: 2200,
          pos: [x + 1.8, y + 0.4, z + 0.5], lookAt: [lx + 0.8, ly + 0.1, lz + 0.2], fov: 31, rollDeg: 0.5, transition: 'smooth' },
        { id: 'impact', label: 'Knockout', tMs: 3850,
          pos: [x + 3.1, y + 0.8, z + 0.9], lookAt: [195, ly + 0.1, -122.5], fov: 30, rollDeg: -0.75, transition: 'smooth' },
        { id: 'aftermath', label: 'Breakthrough', tMs: durationMs,
          pos: [x + 0.8, y + 1.25, z - 0.7], lookAt: [192, ly + 0.2, -121], fov: 31, rollDeg: 0, transition: 'smooth' },
      ],
      actorTracks: [
        { actor: 'shooter', keys: [
          { id: 'shooter-0', tMs: 0, pos: [176, -108], facingDeg: 122, turretDeg: -1, gunDeg: 0.5 },
          { id: 'shooter-1', tMs: 3500, pos: [178.2, -109.4], facingDeg: 122, turretDeg: -1, gunDeg: 0.5 },
          { id: 'shooter-2', tMs: durationMs, pos: [179.4, -110.1], facingDeg: 122, turretDeg: -1, gunDeg: 0.5 },
        ] },
        { actor: 'victim', keys: [
          { id: 'victim-0', tMs: 0, pos: [198, -123], facingDeg: 300, turretDeg: 20, gunDeg: 0.5 },
          { id: 'victim-1', tMs: 3700, pos: [196.8, -122.5], facingDeg: 300, turretDeg: 18, gunDeg: 0.5 },
          { id: 'victim-2', tMs: durationMs, pos: [196.8, -122.5], facingDeg: 300, turretDeg: 18, gunDeg: 0.5 },
        ] },
      ],
    };
    S.setStoryboard(storyboard);
    S.setRailVisible(false);
    S.seek(0);
    return { scene: S.state(), storyboard: S.getStoryboard() };
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
    master: masterFile,
    durationMs: 6500,
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
