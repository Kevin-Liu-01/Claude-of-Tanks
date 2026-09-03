// Generate the promo's scenic battlefield montage as ten matching segments of
// one continuous virtual camera rail. Each map receives the next rail phase,
// so direction, speed, pitch, and framing continue through the map cuts.
//
// Usage:
//   node tools/feature-promo-map-rail.mjs
//   node tools/feature-promo-map-rail.mjs --out shots/promo-map-rail-60fps

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import {
  mkdirSync, renameSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getMapConfig } from '../src/world/maps/index.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const OUT_DIR = resolve(opt('out', 'shots/promo-map-rail-60fps'));
const FPS = 60;
const BITRATE = 12_000_000;
const MAPS = [
  'verdant', 'desert', 'winter', 'urban', 'autumn',
  'steppe', 'railyard', 'fjord', 'delta', 'coastal',
];

function mapFrame(mapId) {
  const config = getMapConfig(mapId);
  const fallbackLook = [0, 2, 0];
  const fallbackPos = [-48, 30, -180];
  return {
    camera: config.shot?.pos || fallbackPos,
    look: config.shot?.look || fallbackLook,
  };
}

function normalizeContainer(file) {
  const remuxed = `${file}.remux.webm`;
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', file,
    '-map', '0:v:0', '-c', 'copy', remuxed,
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    try { unlinkSync(remuxed); } catch (_) { /* no partial output */ }
    throw new Error(`could not normalize ${file}: ${result.stderr.trim()}`);
  }
  renameSync(remuxed, file);
}

mkdirSync(OUT_DIR, { recursive: true });
const port = 7940 + (process.pid % 40);
let server;
let browser;
const consoleErrors = [];
const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  renderer: { width: 1280, height: 720, fps: FPS, videoBitsPerSecond: BITRATE },
  rail: {
    kind: 'continuous-linear-scenic',
    phases: MAPS.length,
    sourceSegmentMs: 1000,
  },
  videos: [],
};

try {
  server = await createServer({
    root: process.cwd(),
    logLevel: 'error',
    server: { port, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
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
    waitUntil: 'domcontentloaded',
    timeout: 180_000,
  });
  await page.waitForFunction(
    "window.__GAME_READY === true && window.__STUDIO?.active === true",
    { timeout: 180_000 },
  );

  for (let index = 0; index < MAPS.length; index += 1) {
    const map = MAPS[index];
    const frame = mapFrame(map);
    const phaseStart = index / MAPS.length;
    const phaseEnd = (index + 1) / MAPS.length;
    console.log(`[feature-map-rail] ${index + 1}/${MAPS.length} ${map}`);
    const result = await page.evaluate(async (job) => {
      const S = window.__STUDIO;
      await S.load({ map: job.map, seed: 67121 + job.index, actors: [], fxTime: 0, timeScale: 0 });
      const heightField = window.__DEBUG.world?.heightField;
      if (!heightField?.getHeightAt) throw new Error(`height field unavailable for ${job.map}`);
      const heightAt = (x, z) => heightField.getHeightAt(x, z);
      const frameAt = (u) => {
        // One continuous rail in local map space. Every map uses the next
        // contiguous u interval, keeping screen-space velocity consistent.
        const wave = Math.sin(u * Math.PI);
        const dx = job.frame.look[0] - job.frame.camera[0];
        const dz = job.frame.look[2] - job.frame.camera[2];
        const invLength = 1 / Math.max(0.001, Math.hypot(dx, dz));
        const forwardX = dx * invLength;
        const forwardZ = dz * invLength;
        const rightX = forwardZ;
        const rightZ = -forwardX;
        const cameraLateral = -34 + u * 68;
        const lookLateral = -9 + u * 18;
        const cameraForward = wave * 8;
        const lookForward = wave * 4;
        const x = job.frame.camera[0] + rightX * cameraLateral + forwardX * cameraForward;
        const z = job.frame.camera[2] + rightZ * cameraLateral + forwardZ * cameraForward;
        const lookX = job.frame.look[0] + rightX * lookLateral + forwardX * lookForward;
        const lookZ = job.frame.look[2] + rightZ * lookLateral + forwardZ * lookForward;
        const lookGroundOffset = job.frame.look[1] - heightAt(job.frame.look[0], job.frame.look[2]);
        const cameraGroundOffset = job.frame.camera[1] - heightAt(job.frame.camera[0], job.frame.camera[2]);
        const lookY = heightAt(lookX, lookZ) + lookGroundOffset;
        const cameraY = Math.max(
          heightAt(x, z) + Math.max(cameraGroundOffset, 10.5),
          lookY + 8.5,
        );
        return {
          pos: [x, cameraY, z],
          lookAt: [lookX, lookY, lookZ],
        };
      };
      const start = frameAt(job.phaseStart);
      const end = frameAt(job.phaseEnd);
      S.setStoryboard({
        version: 2,
        durationMs: 1000,
        shots: [
          {
            id: `rail-${job.index}-start`, label: `${job.map} rail in`, tMs: 0,
            ...start, fov: 42, rollDeg: 0, transition: 'linear',
          },
          {
            id: `rail-${job.index}-end`, label: `${job.map} rail out`, tMs: 1000,
            ...end, fov: 42, rollDeg: 0, transition: 'linear',
          },
        ],
        cameraCues: [],
        actorTracks: [],
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
        base64,
        mimeType: recording.mimeType,
        durationMs: recording.durationMs,
        start,
        end,
      };
    }, {
      index,
      map,
      frame,
      phaseStart,
      phaseEnd,
      fps: FPS,
      bitrate: BITRATE,
    });

    const file = `${String(index + 1).padStart(2, '0')}_${map}.webm`;
    const output = join(OUT_DIR, file);
    writeFileSync(output, Buffer.from(result.base64, 'base64'));
    normalizeContainer(output);
    manifest.videos.push({
      index: index + 1,
      map,
      file,
      bytes: statSync(output).size,
      durationMs: result.durationMs,
      phaseStart,
      phaseEnd,
      frame,
      start: result.start,
      end: result.end,
    });
  }

  if (consoleErrors.length) {
    throw new Error(`map rail emitted ${consoleErrors.length} console error(s): ${consoleErrors.slice(0, 5).join(' | ')}`);
  }
  writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[feature-map-rail] complete: ${OUT_DIR}`);
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
}
