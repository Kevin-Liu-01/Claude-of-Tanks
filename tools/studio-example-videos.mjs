// Render a pinned set of modern-MBT Studio duel videos.
// Usage:
//   npm run studio:examples -- --out shots/studio-modern-all-maps-v3
//   node tools/studio-example-videos.mjs --count 2 --fps 30 --out /tmp/duels
//
// The renderer uses the production __STUDIO.load/directDuel/recordVideo path.
// Generated WebM files and their manifest belong under shots/ (gitignored).

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import {
  mkdirSync, readFileSync, renameSync, rmdirSync, statSync, writeFileSync, readdirSync,
  unlinkSync, utimesSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { MAP_IDS, getMapConfig } from '../src/world/maps/index.js';

function stageForMap(mapId) {
  const points = getMapConfig(mapId).spawns?.enemies || [];
  let best = null;
  for (let left = 0; left < points.length; left++) {
    for (let right = left + 1; right < points.length; right++) {
      const distance = Math.hypot(points[right].x - points[left].x, points[right].z - points[left].z);
      const score = Math.abs(distance - 62);
      if (!best || score < best.score) best = { left, right, score };
    }
  }
  if (!best) throw new Error(`${mapId} has no two-point enemy stage`);
  return {
    alpha: [points[best.left].x, points[best.left].z],
    bravo: [points[best.right].x, points[best.right].z],
  };
}

const MAP_SEQUENCE = [...MAP_IDS, 'desert', 'winter', 'verdant', 'coastal'];
const WINTER_MAPS = new Set(['winter', 'alpine']);
const ARID_MAPS = new Set(['desert', 'badlands', 'caldera']);
const TANK_PAIRS = [
  ['m1a2_sepv3', 't90m'], ['strv122', 'k2'], ['challenger_3', 'leo2a7v'],
  ['type10b', 'ztz99a2'], ['leclerc_xlr', 't14'], ['kf51b', 'abramsx'],
  ['m1a2_tusk', 't90sm'], ['ua_t84_oplot_m', 'pt91_twardy'], ['pl01_105', 'k2b'],
  ['merkava4b', 'ariete_c2'], ['m1a2_sepv2', 'type99a'], ['leo2_revolution', 't72b3m'],
  ['challenger2', 'leclerc'], ['type10', 'k1a1'], ['m1a1ha', 't80u'],
  ['ua_m1a1', 'ua_t64bv'], ['leo2a6m', 't90ms'], ['merkava3d', 'amx40'],
  ['type90a', 'pt91m'], ['m1a2', 'ua_t80u_kursk'],
];

const SCENARIOS = TANK_PAIRS.map(([alpha, bravo], index) => ({
  index: index + 1,
  map: MAP_SEQUENCE[index],
  alpha,
  bravo,
  stage: stageForMap(MAP_SEQUENCE[index]),
  camo: WINTER_MAPS.has(MAP_SEQUENCE[index])
    ? 'winter'
    : (ARID_MAPS.has(MAP_SEQUENCE[index]) ? 'desert' : 'summer'),
  seed: 24001 + index * 137,
}));

if (new Set(SCENARIOS.slice(0, MAP_IDS.length).map((scenario) => scenario.map)).size !== MAP_IDS.length) {
  throw new Error('Studio examples must cover every registered map');
}

const args = process.argv.slice(2);
function opt(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const outDir = resolve(opt('out', 'shots/studio-modern-all-maps-v3'));
const count = Math.max(1, Math.min(SCENARIOS.length, Number.parseInt(opt('count', '20'), 10) || 20));
const only = new Set(String(opt('only', ''))
  .split(',')
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isInteger(value) && value >= 1 && value <= SCENARIOS.length));
const fps = Math.max(24, Math.min(60, Number.parseInt(opt('fps', '30'), 10) || 30));
const videoBitsPerSecond = Math.max(
  2_000_000,
  Math.min(30_000_000, Number.parseInt(opt('bitrate', '8000000'), 10) || 8_000_000),
);
mkdirSync(outDir, { recursive: true });

// FIFO GPU lock shared by the repository's browser rendering tools.
const LOCK_DIR = '/tmp/cot-shots.lock';
const QUEUE_DIR = '/tmp/cot-shots.queue';
const LOCK_STALE_MS = 5 * 60 * 1000;
const TICKET_STALE_MS = 60 * 60 * 1000;
let lockHeld = false;

function ticketPid(name) {
  const match = name.match(/-(\d+)\.t$/);
  return match ? Number.parseInt(match[1], 10) : -1;
}

function ticketAlive(name) {
  const pid = ticketPid(name);
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function acquireLock(timeoutMs) {
  mkdirSync(QUEUE_DIR, { recursive: true });
  const ticket = `${String(Date.now()).padStart(15, '0')}-${process.pid}.t`;
  writeFileSync(join(QUEUE_DIR, ticket), String(process.pid));
  const startedAt = Date.now();
  try {
    for (;;) {
      let head = null;
      let names = [];
      try {
        names = readdirSync(QUEUE_DIR).filter((name) => name.endsWith('.t')).sort();
      } catch (_) {
        names = [ticket];
      }
      for (const name of names) {
        if (name === ticket) {
          head ||= name;
          break;
        }
        let stale = false;
        try {
          stale = Date.now() - statSync(join(QUEUE_DIR, name)).mtimeMs > TICKET_STALE_MS;
        } catch (_) {
          continue;
        }
        if (stale || !ticketAlive(name)) {
          try { unlinkSync(join(QUEUE_DIR, name)); } catch (_) { /* raced */ }
          continue;
        }
        head = name;
        break;
      }
      if (head === ticket) {
        try {
          mkdirSync(LOCK_DIR);
          lockHeld = true;
          return;
        } catch (_) { /* lock is live */ }
        try {
          if (Date.now() - statSync(LOCK_DIR).mtimeMs > LOCK_STALE_MS) {
            try { rmdirSync(LOCK_DIR); } catch (error) {
              if (error.code === 'ENOTDIR') unlinkSync(LOCK_DIR);
              else throw error;
            }
            continue;
          }
        } catch (_) {
          continue;
        }
      }
      if (Date.now() - startedAt > timeoutMs) throw new Error('cot-shots lock timeout');
      await new Promise((done) => setTimeout(done, head === ticket ? 300 : 1000));
    }
  } finally {
    try { unlinkSync(join(QUEUE_DIR, ticket)); } catch (_) { /* fine */ }
  }
}

function releaseLock() {
  if (!lockHeld) return;
  lockHeld = false;
  try { rmdirSync(LOCK_DIR); } catch (_) { /* fine */ }
}

await acquireLock(45 * 60 * 1000);
process.on('exit', releaseLock);
const lockRefresher = setInterval(() => {
  try {
    const now = new Date();
    utimesSync(LOCK_DIR, now, now);
  } catch (_) { /* fine */ }
}, 60 * 1000);
lockRefresher.unref();

const port = 7800 + Math.floor(Math.random() * 400);
let server = null;
let browser = null;
const consoleErrors = [];
let existingVideos = [];
if (only.size) {
  try {
    const existing = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'));
    if (existing.version === 3 && Array.isArray(existing.videos)) {
      existingVideos = existing.videos.filter((video) => !only.has(video.index));
    }
  } catch (_) { /* selective render into a new directory */ }
}
const manifest = {
  version: 3,
  generatedAt: new Date().toISOString(),
  renderer: { width: 1280, height: 720, fps, videoBitsPerSecond },
  videos: existingVideos,
};

function writeManifest() {
  manifest.videos.sort((a, b) => a.index - b.index);
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function normalizeContainer(file) {
  const remuxed = `${file}.remux.webm`;
  const remux = spawnSync('ffmpeg', [
    '-y', '-v', 'error', '-i', file, '-map', '0:v:0', '-c', 'copy', remuxed,
  ], { encoding: 'utf8' });
  if (remux.status === 0) renameSync(remuxed, file);
  else {
    try { unlinkSync(remuxed); } catch (_) { /* ffmpeg unavailable or no temp file */ }
  }
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file,
  ], { encoding: 'utf8' });
  const seconds = Number.parseFloat(probe.stdout);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
}

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
  console.log(`[studio-examples] vite up at ${url}`);

  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon')) {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));

  await page.goto(`${url}?studio=1&map=desert&nogate=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 180_000,
  });
  await page.waitForFunction(
    "window.__GAME_READY === true && window.__STUDIO?.active === true && window.__STUDIO.mapId === 'desert'",
    { timeout: 180_000 },
  );

  const jobs = only.size
    ? SCENARIOS.filter((scenario) => only.has(scenario.index))
    : SCENARIOS.slice(0, count);
  for (let jobIndex = 0; jobIndex < jobs.length; jobIndex++) {
    const scenario = jobs[jobIndex];
    const number = String(scenario.index).padStart(2, '0');
    console.log(
      `[studio-examples] ${String(jobIndex + 1).padStart(2, '0')}/` +
      `${String(jobs.length).padStart(2, '0')} [scenario ${number}] ` +
      `${scenario.alpha} vs ${scenario.bravo} on ${scenario.map}`,
    );
    const result = await page.evaluate(async (job) => {
      const S = window.__STUDIO;
      const alphaInfo = S.getSpecInfo(job.alpha);
      const bravoInfo = S.getSpecInfo(job.bravo);
      for (const info of [alphaInfo, bravoInfo]) {
        if (info.era !== 'modern' || info.class !== 'mbt') {
          throw new Error(`${info.id} is ${info.era}/${info.class}, expected modern/mbt`);
        }
      }
      await S.load({
        map: job.map,
        seed: job.seed,
        actors: [
          { id: job.alpha, name: 'alpha', pos: job.stage.alpha, facingDeg: 72, camo: job.camo },
          { id: job.bravo, name: 'bravo', pos: job.stage.bravo, facingDeg: 252, camo: job.camo },
        ],
        fxTime: 0,
        timeScale: 0,
      });
      const board = S.directDuel({ variant: job.index });
      if (board.durationMs > 20_000 || board.actorTracks.length !== 2) {
        throw new Error('Direct Duel did not build a bounded two-tank storyboard');
      }
      const recording = await S.recordVideo({
        fps: job.fps,
        videoBitsPerSecond: job.videoBitsPerSecond,
        download: false,
      });
      const dataUrl = await new Promise((resolveData, rejectData) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolveData(reader.result), { once: true });
        reader.addEventListener('error', () => rejectData(reader.error), { once: true });
        reader.readAsDataURL(recording.blob);
      });
      return {
        alpha: alphaInfo,
        bravo: bravoInfo,
        durationMs: recording.durationMs,
        mimeType: recording.mimeType,
        size: recording.size,
        base64: String(dataUrl).split(',')[1],
        shots: board.shots.length,
        cameraCues: board.cameraCues.length,
        effects: S.listEffects().length,
      };
    }, { ...scenario, fps, videoBitsPerSecond });

    if (result.durationMs > 20_000 || result.durationMs < 1_000 || result.size < 20_000) {
      throw new Error(`${number}: invalid recording ${result.durationMs} ms / ${result.size} bytes`);
    }
    const extension = result.mimeType.includes('mp4') ? 'mp4' : 'webm';
    const file = `${number}_${scenario.alpha}_vs_${scenario.bravo}_${scenario.map}.${extension}`;
    const bytes = Buffer.from(result.base64, 'base64');
    if (bytes.length !== result.size) {
      throw new Error(`${file}: browser reported ${result.size} bytes, transferred ${bytes.length}`);
    }
    const outputFile = join(outDir, file);
    writeFileSync(outputFile, bytes);
    const containerDurationMs = extension === 'webm' ? normalizeContainer(outputFile) : null;
    const outputBytes = statSync(outputFile).size;
    if (containerDurationMs != null && containerDurationMs > 20_000) {
      throw new Error(`${file}: container duration ${containerDurationMs} ms exceeds 20 seconds`);
    }
    manifest.videos.push({
      index: scenario.index,
      file,
      map: scenario.map,
      seed: scenario.seed,
      shotStyle: scenario.index % 4,
      stage: scenario.stage,
      camo: scenario.camo,
      alpha: { id: scenario.alpha, name: result.alpha.name },
      bravo: { id: scenario.bravo, name: result.bravo.name },
      durationMs: result.durationMs,
      containerDurationMs,
      mimeType: result.mimeType,
      bytes: outputBytes,
      cameraShots: result.shots,
      cameraCues: result.cameraCues,
      effects: result.effects,
    });
    writeManifest();
    console.log(`[studio-examples] wrote ${file} (${outputBytes} bytes)`);
  }

  if (consoleErrors.length) {
    throw new Error(`page emitted ${consoleErrors.length} console error(s): ${consoleErrors.slice(0, 5).join(' | ')}`);
  }
  console.log(`[studio-examples] complete: ${manifest.videos.length} videos in ${outDir}`);
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  releaseLock();
}
