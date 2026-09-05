// Capture the current Garage, Tank Gallery, Scene Studio, and compact Garage
// surfaces for the UI-only R2 showcase. Each product surface is loaded once;
// deterministic public hooks then stage every requested state at a 4K backing
// resolution without changing live gameplay.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  acquireCaptureLock,
  refreshCaptureLock,
  releaseCaptureLock,
} from '../capture-lock.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const outDir = resolve(option('out', join(ROOT, 'shots/showcase-r2/raw')));
const config = JSON.parse(readFileSync(join(HERE, 'showcase-r2.json'), 'utf8'));
const onlyIds = new Set((option('ids', '') || '').split(',').filter(Boolean));
const productShots = config.shots.filter((shot) =>
  ['garage', 'gallery', 'studio', 'mobile'].includes(shot.sourceType)
    && (!onlyIds.size || onlyIds.has(shot.id)));
mkdirSync(outDir, { recursive: true });

await acquireCaptureLock(30 * 60 * 1000);
process.on('exit', releaseCaptureLock);
const lockRefresher = setInterval(() => refreshCaptureLock(), 60 * 1000);
lockRefresher.unref();

const port = 7800 + Math.floor(Math.random() * 400);
const server = await createServer({
  root: ROOT,
  logLevel: 'error',
  server: { port, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
  optimizeDeps: {
    entries: ['index.html', 'gallery.html'],
    include: [
      'three',
      'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js',
    ],
  },
});

let browser;
try {
  await server.listen();
  const baseUrl = `http://localhost:${server.config.server.port}`;
  console.log(`[showcase-r2-ui] vite up at ${baseUrl}/`);
  browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 300000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  let errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !/github-stars|favicon\.ico/.test(message.text())) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  const desktopViewport = { width: 1920, height: 1080, deviceScaleFactor: 2 };
  const capture = async (shot) => {
    await page.evaluate(() => document.fonts.ready);
    await new Promise((resolveWait) => setTimeout(resolveWait, 650));
    if (errors.length) throw new Error(`${shot.id} console errors:\n${errors.join('\n')}`);
    await page.screenshot({ path: join(outDir, shot.source), type: 'png' });
    const viewport = page.viewport();
    console.log(`[showcase-r2-ui] ${shot.source} (${viewport.width * viewport.deviceScaleFactor}x${viewport.height * viewport.deviceScaleFactor})`);
  };

  await page.setViewport(desktopViewport);
  await page.goto(`${baseUrl}/?nosplash=1&qa=1`, {
    waitUntil: 'domcontentloaded', timeout: 120000,
  });
  await page.waitForFunction(() => window.__GAME_READY === true && window.__GARAGE_WORKSHOP,
    { timeout: 120000 });
  await page.waitForFunction(() => {
    const stats = window.__GARAGE_WORKSHOP.stats();
    return stats.architecture?.ready === true && stats.architecture.presented === true;
  }, { timeout: 120000 });
  await page.waitForFunction(() => window.__GARAGE_WORKSHOP.stats().built === true,
    { timeout: 120000 }).catch(() => {
    console.warn('[showcase-r2-ui] optional workshop did not finish before capture window');
  });

  for (const shot of productShots.filter((entry) => entry.sourceType === 'garage')) {
    errors = [];
    await page.evaluate(async ({ variantId, vehicleId }) => {
      window.__DEBUG.selectGarageTank(vehicleId);
      await window.__DEBUG.stagePedestalTank(vehicleId);
      window.__GARAGE_WORKSHOP.set(variantId);
    }, shot);
    await page.waitForFunction(({ variantId, vehicleId }) => {
      const stats = window.__GARAGE_WORKSHOP.stats();
      return window.__DEBUG.selectedSpecId === vehicleId
        && stats.selected === variantId && stats.architecture?.ready === true
        && stats.architecture.presented === true;
    }, { timeout: 60000 }, shot);
    await capture(shot);
  }

  const mobileShot = productShots.find((entry) => entry.sourceType === 'mobile');
  if (mobileShot) {
    errors = [];
    await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
    await page.evaluate(async ({ variantId, vehicleId }) => {
      window.__DEBUG.selectGarageTank(vehicleId);
      await window.__DEBUG.stagePedestalTank(vehicleId);
      window.__GARAGE_WORKSHOP.set(variantId);
    }, mobileShot);
    await page.waitForFunction(({ variantId, vehicleId }) => {
      const stats = window.__GARAGE_WORKSHOP.stats();
      return window.__DEBUG.selectedSpecId === vehicleId
        && stats.selected === variantId && stats.architecture?.presented === true;
    }, { timeout: 60000 }, mobileShot);
    await capture(mobileShot);
  }

  errors = [];
  await page.setViewport(desktopViewport);
  const galleryShots = productShots.filter((entry) => entry.sourceType === 'gallery');
  await page.goto(`${baseUrl}/gallery.html?id=${galleryShots[0]?.vehicleId || 'k2'}`, {
    waitUntil: 'domcontentloaded', timeout: 120000,
  });
  await page.waitForFunction(() => window.__TANK_GALLERY?.ready === true,
    { timeout: 120000 });
  for (const shot of galleryShots) {
    errors = [];
    const mode = shot.mode === 'hero' ? 'appearance' : shot.mode;
    await page.evaluate(async ({ vehicleId, nextMode }) => {
      await window.__TANK_GALLERY.loadTank(vehicleId, { mode: nextMode, view: 'hero' });
      window.__TANK_GALLERY.frameView('hero');
    }, { vehicleId: shot.vehicleId, nextMode: mode });
    await page.waitForFunction(({ vehicleId, nextMode }) => {
      const state = window.__TANK_GALLERY.getState();
      return state.selectedId === vehicleId && state.mode === nextMode;
    }, { timeout: 30000 }, { vehicleId: shot.vehicleId, nextMode: mode });
    await capture(shot);
  }

  const studioShot = productShots.find((entry) => entry.sourceType === 'studio');
  if (studioShot) {
    errors = [];
    const scene = JSON.parse(readFileSync(
      join(HERE, 'scenes-action-r3/85_action_urban_alley_flash.json'), 'utf8'));
    await page.goto(`${baseUrl}/?studio=1&map=urban&nogate=1`, {
      waitUntil: 'domcontentloaded', timeout: 120000,
    });
    await page.waitForFunction(() => window.__GAME_READY === true && window.__STUDIO?.active === true,
      { timeout: 120000 });
    await page.evaluate(async (nextScene) => {
      await window.__STUDIO.load(nextScene);
      window.__STUDIO.seek(nextScene.fxTime || 0);
      window.__STUDIO.setRailVisible(true);
    }, scene);
    await capture(studioShot);
  }
} finally {
  if (browser) await browser.close();
  await server.close();
  clearInterval(lockRefresher);
  releaseCaptureLock();
}
