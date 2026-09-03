// Generate short front-quarter firing clips for the feature promo.
// Every camera and both tanks remain in motion through the final source frame.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import {
  mkdirSync, readdirSync, renameSync, rmdirSync, statSync, unlinkSync,
  utimesSync, writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getMapConfig } from '../src/world/maps/index.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const OUT_DIR = resolve(opt('out', 'shots/promo-frontline-60fps'));
const FPS = 60;
const BITRATE = 14_000_000;
const DURATION_MS = 2400;
const SCENARIOS = [
  ['verdant', 'm1a2_sepv3', 't90m', 'summer'],
  ['autumn', 'kf51b', 'abramsx', 'autumn'],
  ['winter', 'strv122', 'k2', 'winter'],
  ['railyard', 'ua_t84_oplot_m', 'pt91_twardy', 'summer'],
  ['steppe', 'm1a2_tusk', 't90sm', 'summer'],
  ['urban', 'type10b', 'ztz99a2', 'urbanblock'],
  ['coastal', 'm1a2', 'ua_t80u_kursk', 'summer'],
  ['delta', 'm1a2_sepv2', 'type99a', 'tropic'],
  ['desert', 'leo2a6m', 't90ms', 'desert'],
  ['fjord', 'merkava4b', 'ariete_c2', 'summer'],
  ['badlands', 'leo2_revolution', 't72b3m', 'desert'],
].map(([map, alpha, bravo, camo], index) => ({
  index: index + 1, map, alpha, bravo, camo, seed: 82031 + index * 173,
}));

function stageForMap(mapId) {
  const points = getMapConfig(mapId).spawns?.enemies || [];
  let best = null;
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      const distance = Math.hypot(
        points[right].x - points[left].x,
        points[right].z - points[left].z,
      );
      const score = Math.abs(distance - 58);
      if (!best || score < best.score) best = { left, right, score };
    }
  }
  if (!best) throw new Error(`${mapId} has no two-point stage`);
  return {
    alpha: [points[best.left].x, points[best.left].z],
    bravo: [points[best.right].x, points[best.right].z],
  };
}

const LOCK_DIR = '/tmp/cot-shots.lock';
const QUEUE_DIR = '/tmp/cot-shots.queue';
const LOCK_STALE_MS = 5 * 60 * 1000;
let lockHeld = false;

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

async function acquireLock() {
  mkdirSync(QUEUE_DIR, { recursive: true });
  const ticket = `${String(Date.now()).padStart(15, '0')}-${process.pid}.t`;
  writeFileSync(join(QUEUE_DIR, ticket), String(process.pid));
  const startedAt = Date.now();
  try {
    for (;;) {
      const names = readdirSync(QUEUE_DIR).filter((name) => name.endsWith('.t')).sort();
      for (const name of names) {
        if (name === ticket) break;
        const pid = Number.parseInt(name.match(/-(\d+)\.t$/)?.[1] || '-1', 10);
        if (!pidAlive(pid)) {
          try { unlinkSync(join(QUEUE_DIR, name)); } catch (_) { /* raced */ }
        } else break;
      }
      const head = readdirSync(QUEUE_DIR).filter((name) => name.endsWith('.t')).sort()[0];
      if (head === ticket) {
        try {
          mkdirSync(LOCK_DIR);
          lockHeld = true;
          return;
        } catch (_) {
          try {
            if (Date.now() - statSync(LOCK_DIR).mtimeMs > LOCK_STALE_MS) rmdirSync(LOCK_DIR);
          } catch (_) { /* lock raced */ }
        }
      }
      if (Date.now() - startedAt > 45 * 60 * 1000) throw new Error('cot-shots lock timeout');
      await new Promise((done) => setTimeout(done, 700));
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

function normalizeContainer(file) {
  const remuxed = `${file}.remux.webm`;
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', file,
    '-map', '0:v:0', '-c', 'copy', remuxed,
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    try { unlinkSync(remuxed); } catch (_) { /* no partial file */ }
    throw new Error(`could not normalize ${file}: ${result.stderr.trim()}`);
  }
  renameSync(remuxed, file);
}

mkdirSync(OUT_DIR, { recursive: true });
await acquireLock();
process.on('exit', releaseLock);
const lockRefresher = setInterval(() => {
  try { const now = new Date(); utimesSync(LOCK_DIR, now, now); } catch (_) { /* fine */ }
}, 60_000);
lockRefresher.unref();

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  renderer: { width: 1280, height: 720, fps: FPS, videoBitsPerSecond: BITRATE },
  choreography: 'continuous front-quarter firing rail',
  videos: [],
};
let server;
let browser;
const consoleErrors = [];

try {
  server = await createServer({
    root: process.cwd(),
    logLevel: 'error',
    server: { port: 7850 + (process.pid % 80), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
  });
  await server.listen();
  const url = `http://localhost:${server.config.server.port}/`;
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
  await page.goto(`${url}?studio=1&map=verdant&nogate=1`, {
    waitUntil: 'domcontentloaded', timeout: 180_000,
  });
  await page.waitForFunction(
    "window.__GAME_READY === true && window.__STUDIO?.active === true",
    { timeout: 180_000 },
  );

  for (const scenario of SCENARIOS) {
    const stage = stageForMap(scenario.map);
    console.log(`[feature-frontline] ${scenario.index}/${SCENARIOS.length} ${scenario.alpha} on ${scenario.map}`);
    const result = await page.evaluate(async (job) => {
      const S = window.__STUDIO;
      const alphaInfo = S.getSpecInfo(job.alpha);
      const bravoInfo = S.getSpecInfo(job.bravo);
      for (const info of [alphaInfo, bravoInfo]) {
        if (info.era !== 'modern' || info.class !== 'mbt') {
          throw new Error(`${info.id} is ${info.era}/${info.class}, expected modern/mbt`);
        }
      }
      const ax = job.stage.alpha[0]; const az = job.stage.alpha[1];
      const bx = job.stage.bravo[0]; const bz = job.stage.bravo[1];
      const distance = Math.max(1, Math.hypot(bx - ax, bz - az));
      const ux = (bx - ax) / distance; const uz = (bz - az) / distance;
      const px = uz; const pz = -ux;
      const facing = Math.atan2(ux, uz) * 180 / Math.PI;
      const opposite = ((facing + 180 + 540) % 360) - 180;
      const alphaEnd = [ax + ux * 5.5, az + uz * 5.5];
      const bravoEnd = [bx - ux * 3.5, bz - uz * 3.5];
      const actors = [
        { id: job.alpha, name: 'alpha', pos: [ax, az], facingDeg: facing, camo: job.camo },
        { id: job.bravo, name: 'bravo', pos: [bx, bz], facingDeg: opposite, camo: job.camo },
      ];
      await S.load({ map: job.map, seed: job.seed, actors, fxTime: 0, timeScale: 0 });
      const height = window.__DEBUG.world.heightField.getHeightAt.bind(window.__DEBUG.world.heightField);
      const cameraPoint = (x, z, lift) => [x, height(x, z) + lift, z];
      const cameraStartX = ax + ux * 10 + px * 8.5;
      const cameraStartZ = az + uz * 10 + pz * 8.5;
      const cameraEndX = alphaEnd[0] + ux * 14 + px * 4.0;
      const cameraEndZ = alphaEnd[1] + uz * 14 + pz * 4.0;
      const board = {
        version: 2,
        durationMs: job.durationMs,
        shots: [
          {
            id: 'front-quarter-in', label: 'Front-quarter firing line', tMs: 0,
            pos: cameraPoint(cameraStartX, cameraStartZ, 3.0),
            lookAt: cameraPoint(ax + ux * 1.2, az + uz * 1.2, 1.9),
            fov: 35, rollDeg: job.index % 2 ? -3 : 3, transition: 'linear',
          },
          {
            id: 'front-quarter-out', label: 'Moving gun close-up', tMs: job.durationMs,
            pos: cameraPoint(cameraEndX, cameraEndZ, 3.4),
            lookAt: cameraPoint(alphaEnd[0] + ux * 1.4, alphaEnd[1] + uz * 1.4, 2.0),
            fov: 31, rollDeg: job.index % 2 ? 4 : -4, transition: 'linear',
          },
        ],
        cameraCues: [
          {
            id: 'hero-fire-cue', label: 'Muzzle concussion', tMs: 720,
            durationMs: 520, amplitudeM: 0.22, rollDeg: 2.5,
            fovKickDeg: 2.4, frequencyHz: 15, seed: job.seed + 19,
          },
          {
            id: 'return-fire-cue', label: 'Return fire', tMs: 1680,
            durationMs: 420, amplitudeM: 0.12, rollDeg: 1.4,
            fovKickDeg: 1.2, frequencyHz: 12, seed: job.seed + 37,
          },
        ],
        actorTracks: [
          { actor: 'alpha', keys: [
            { id: 'alpha-in', tMs: 0, pos: [ax, az], facingDeg: facing, turretDeg: 0, gunDeg: 0 },
            { id: 'alpha-out', tMs: job.durationMs, pos: alphaEnd, facingDeg: facing, turretDeg: 0, gunDeg: 0, transition: 'drive' },
          ] },
          { actor: 'bravo', keys: [
            { id: 'bravo-in', tMs: 0, pos: [bx, bz], facingDeg: opposite, turretDeg: 0, gunDeg: 0 },
            { id: 'bravo-out', tMs: job.durationMs, pos: bravoEnd, facingDeg: opposite, turretDeg: 0, gunDeg: 0, transition: 'drive' },
          ] },
        ],
      };
      await S.load({
        map: job.map, seed: job.seed, actors, storyboard: board,
        effects: [
          { type: 'dust', actor: 'alpha', tMs: 180, params: { count: 13, intensity: 0.95 } },
          { type: 'fire', actor: 'alpha', tMs: 720, params: { slot: 0, tracer: true, recoil: true } },
          { type: 'impact', actor: 'bravo', tMs: 1120, params: { kind: 'ricochet', caliberMm: 120 } },
          { type: 'fire', actor: 'bravo', tMs: 1680, params: { slot: 0, tracer: true, recoil: true } },
          { type: 'dust', actor: 'alpha', tMs: 1960, params: { count: 11, intensity: 0.8 } },
        ],
        fxTime: 0,
        timeScale: 0,
      });
      const recording = await S.recordVideo({
        fps: job.fps,
        videoBitsPerSecond: job.bitrate,
        download: false,
      });
      const base64 = await new Promise((resolveData, rejectData) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolveData(String(reader.result).split(',')[1]), { once: true });
        reader.addEventListener('error', () => rejectData(reader.error), { once: true });
        reader.readAsDataURL(recording.blob);
      });
      return {
        base64, size: recording.size, mimeType: recording.mimeType,
        durationMs: recording.durationMs, alpha: alphaInfo, bravo: bravoInfo,
      };
    }, { ...scenario, stage, durationMs: DURATION_MS, fps: FPS, bitrate: BITRATE });

    const file = `${String(scenario.index).padStart(2, '0')}_${scenario.alpha}_${scenario.map}.webm`;
    const output = join(OUT_DIR, file);
    const bytes = Buffer.from(result.base64, 'base64');
    if (bytes.length !== result.size || bytes.length < 20_000) {
      throw new Error(`${file}: invalid browser transfer ${bytes.length}/${result.size}`);
    }
    writeFileSync(output, bytes);
    normalizeContainer(output);
    manifest.videos.push({
      ...scenario, stage, file, bytes: statSync(output).size,
      durationMs: result.durationMs,
      alphaName: result.alpha.name,
      bravoName: result.bravo.name,
    });
  }

  if (consoleErrors.length) {
    throw new Error(`frontline capture emitted console errors: ${consoleErrors.slice(0, 5).join(' | ')}`);
  }
  writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[feature-frontline] complete: ${OUT_DIR}`);
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  releaseLock();
}
