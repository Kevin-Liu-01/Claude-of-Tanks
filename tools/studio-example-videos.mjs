// Render a pinned set of modern-MBT Studio duel videos.
// Usage:
//   npm run studio:examples -- --out shots/studio-modern-examples
//   node tools/studio-example-videos.mjs --count 2 --fps 30 --out /tmp/duels
//
// The renderer uses the production __STUDIO.load/directDuel/recordVideo path.
// Generated WebM files and their manifest belong under shots/ (gitignored).

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import {
  mkdirSync, rmdirSync, statSync, writeFileSync, readdirSync, unlinkSync, utimesSync,
} from 'node:fs';
import { resolve, join } from 'node:path';

const SCENARIOS = [
  ['desert', 'm1a2_sepv3', 't90m'],
  ['winter', 'strv122', 'k2'],
  ['urban', 'challenger_3', 'leo2a7v'],
  ['verdant', 'type10b', 'ztz99a2'],
  ['desert', 'leclerc_xlr', 't14'],
  ['winter', 'kf51b', 'abramsx'],
  ['urban', 'm1a2_tusk', 't90sm'],
  ['verdant', 'ua_t84_oplot_m', 'pt91_twardy'],
  ['desert', 'pl01_105', 'k2b'],
  ['winter', 'merkava4b', 'ariete_c2'],
  ['urban', 'm1a2_sepv2', 'type99a'],
  ['verdant', 'leo2_revolution', 't72b3m'],
  ['desert', 'challenger2', 'leclerc'],
  ['winter', 'type10', 'k1a1'],
  ['urban', 'm1a1ha', 't80u'],
  ['verdant', 'ua_m1a1', 'ua_t64bv'],
  ['desert', 'leo2a6m', 't90ms'],
  ['winter', 'merkava3d', 'amx40'],
  ['urban', 'type90a', 'pt91m'],
  ['verdant', 'm1a2', 'ua_t80u_kursk'],
].map(([map, alpha, bravo], index) => ({
  index: index + 1,
  map,
  alpha,
  bravo,
  seed: 24001 + index * 137,
}));

const args = process.argv.slice(2);
function opt(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const outDir = resolve(opt('out', 'shots/studio-modern-examples'));
const count = Math.max(1, Math.min(SCENARIOS.length, Number.parseInt(opt('count', '20'), 10) || 20));
const fps = Math.max(24, Math.min(60, Number.parseInt(opt('fps', '30'), 10) || 30));
const videoBitsPerSecond = Math.max(
  2_000_000,
  Math.min(30_000_000, Number.parseInt(opt('bitrate', '6000000'), 10) || 6_000_000),
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
const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  renderer: { width: 1280, height: 720, fps, videoBitsPerSecond },
  videos: [],
};

function writeManifest() {
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
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

  const jobs = SCENARIOS.slice(0, count);
  for (const scenario of jobs) {
    const number = String(scenario.index).padStart(2, '0');
    console.log(
      `[studio-examples] ${number}/${String(count).padStart(2, '0')} ` +
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
      const camo = job.map === 'winter' ? 'winter' : (job.map === 'desert' ? 'desert' : 'summer');
      await S.load({
        map: job.map,
        seed: job.seed,
        actors: [
          { id: job.alpha, name: 'alpha', pos: [-26, -8], facingDeg: 72, camo },
          { id: job.bravo, name: 'bravo', pos: [26, 10], facingDeg: 252, camo },
        ],
        fxTime: 0,
        timeScale: 0,
      });
      const board = S.directDuel();
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
    writeFileSync(join(outDir, file), bytes);
    manifest.videos.push({
      index: scenario.index,
      file,
      map: scenario.map,
      seed: scenario.seed,
      alpha: { id: scenario.alpha, name: result.alpha.name },
      bravo: { id: scenario.bravo, name: result.bravo.name },
      durationMs: result.durationMs,
      mimeType: result.mimeType,
      bytes: result.size,
      cameraShots: result.shots,
      effects: result.effects,
    });
    writeManifest();
    console.log(`[studio-examples] wrote ${file} (${result.size} bytes)`);
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
