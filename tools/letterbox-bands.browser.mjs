#!/usr/bin/env node
// No letterbox bands, on screen (owner 2026-10-26, on the battle load screen: "there are still black bars above and below
// the images here!!! fix that!!! no more object containns LOL"). Copyright © 2026 Kevin B. Liu.
//
// The browser half of the image-fit lint (tools/image-fit-lint.mjs). It serves this checkout through Vite and renders
// the battle load screen and the end report from their fixtures, and the media pages (/home, the Field Manual, its
// filming chapter and library), at 16:9, 16:10, 4:3, 21:9 and a phone held upright and sideways. On each it takes every
// visible picture frame of at least 160 x 90 px (an <img>, <video> or <canvas>, or a box painted with a background image;
// a transparent cutout is left out by its alpha corners), photographs the frame's box as composited and fails on letterbox
// bands: matching runs of solid, near-black rows at its top and bottom, or columns at its left and right. That catches a
// contain fit and a bar laid over a picture alike.
//
//   node tools/letterbox-bands.browser.mjs [--out=<dir>] [--surfaces=load,end,home,docs,filming] [--sizes=16x9,phone-portrait]
//
// One browser at a time, under the shared capture lock, with a 3 GB V8 heap per renderer; the run stops if any renderer
// passes 6 GB. Vite gets its own cache directory, so it never shares the suite's. Writes report.json and one screenshot
// per surface and size to --out (default .qa-dev/letterbox-bands); exits 1 on any band.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { acquireCaptureLock, refreshCaptureLock, releaseCaptureLock } from './capture-lock.mjs';
import { letterboxBands } from './letterbox-bands.mjs';

const arg = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

/** The aspect ratios the bands are looked for at: width, height, a touch phone. */
const SIZES = Object.freeze({
  '16x9': [1920, 1080, false], '16x10': [1440, 900, false], '4x3': [1024, 768, false], '21x9': [2560, 1080, false],
  'phone-portrait': [390, 844, true], 'phone-landscape': [844, 390, true],
});
/** The surfaces: where each renders, and when it stands still enough to photograph. */
const SURFACES = Object.freeze([
  { id: 'load', url: '/tools/fixtures/battle-load-layout.html?map=verdant&name=Verdant',
    ready: `!!window.__LOAD_LAYOUT && !!document.querySelector('.cot-bl .hero .art-img.ready')` },
  { id: 'end', url: '/tools/fixtures/end-screen.html?scene=1', ready: `!!window.__DEBRIEF && !!document.querySelector('.cot-es')` },
  { id: 'home', url: '/home', ready: `document.readyState === 'complete'` },
  { id: 'docs', url: '/docs', ready: `document.readyState === 'complete'` },
  { id: 'filming', url: '/docs/filming#library', ready: `document.readyState === 'complete'` },
]);
const RENDERER_LIMIT_KB = 6 * 1024 * 1024;
const MIN_FRAME = [160, 90];

/** Runs in the page: every visible picture frame, stamped data-band-frame="<n>", with its box clamped to the viewport.
 *  A same-origin image with transparent corners is a cutout (contain is right for it) and is left out. */
async function framesInPage([minWidth, minHeight]) {
  const shown = (el) => el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true;
  const label = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${[...el.classList].slice(0, 3).join('.')}` : ''}`;
  const corners = async (src) => {
    try {
      const image = new Image();
      image.src = src;
      await Promise.race([image.decode(), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 3000))]);
      const canvas = document.createElement('canvas');
      canvas.width = 8; canvas.height = 8;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, 8, 8);
      const data = context.getImageData(0, 0, 8, 8).data;
      return [0, 7, 56, 63].some((pixel) => data[pixel * 4 + 3] < 250);
    } catch { return false; }
  };
  const frames = [];
  for (const el of document.querySelectorAll('body *')) {
    const tag = el.tagName;
    const background = getComputedStyle(el).backgroundImage;
    const url = /url\(["']?([^"')]+)["']?\)/.exec(background)?.[1];
    if (!(tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS' || url)) continue;
    const box = el.getBoundingClientRect();
    const x = Math.max(0, box.left), y = Math.max(0, box.top);
    const width = Math.min(innerWidth, box.right) - x, height = Math.min(innerHeight, box.bottom) - y;
    if (width < minWidth || height < minHeight || !shown(el)) continue;
    const src = tag === 'IMG' ? el.currentSrc || el.src : tag === 'VIDEO' || tag === 'CANVAS' ? null : url;
    if (src && new URL(src, location.href).origin === location.origin && await corners(src)) continue;
    el.setAttribute('data-band-frame', String(frames.length));
    frames.push({ n: frames.length, element: label(el), fit: getComputedStyle(el).objectFit,
      clip: { x: Math.floor(x), y: Math.floor(y), width: Math.floor(width), height: Math.floor(height) } });
  }
  return frames;
}

/** Runs in the page: the PNG of one frame (base64) decoded to its pixels, judged by letterboxBands (its source passed in). */
async function bandsInPage([base64, judge]) {
  const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0);
  const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
  return new Function(`return (${judge})`)()(data, width, height);
}

/** The largest RSS (kB) of any process under the browser. */
function rendererPeakKb(rootPid) {
  try {
    const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim().split('\n').map((line) => line.trim().split(/\s+/).map(Number));
    const children = new Map();
    for (const [pid, ppid] of rows) { if (!children.has(ppid)) children.set(ppid, []); children.get(ppid).push(pid); }
    const rss = new Map(rows.map(([pid, , kb]) => [pid, kb]));
    let peak = 0;
    const stack = [rootPid];
    while (stack.length) { const pid = stack.pop(); for (const child of children.get(pid) || []) { peak = Math.max(peak, rss.get(child) || 0); stack.push(child); } }
    return peak;
  } catch { return 0; }
}

async function main() {
  const out = resolve(arg('out', '.qa-dev/letterbox-bands'));
  mkdirSync(out, { recursive: true });
  const wantSurfaces = arg('surfaces', 'all').split(',');
  const wantSizes = arg('sizes', 'all').split(',');
  const surfaces = SURFACES.filter((surface) => wantSurfaces.includes('all') || wantSurfaces.includes(surface.id));
  const sizes = Object.entries(SIZES).filter(([id]) => wantSizes.includes('all') || wantSizes.includes(id));
  await acquireCaptureLock(3 * 60 * 60 * 1000);
  const refresher = setInterval(refreshCaptureLock, 60_000);
  const server = await createServer({ cacheDir: join(tmpdir(), `cot-letterbox-vite-${process.pid}`), logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, hmr: false, ws: false } });
  let browser = null;
  let aborted = null;
  const report = [];
  try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000,
      args: ['--js-flags=--max-old-space-size=3072', '--no-sandbox', '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
    const guard = setInterval(() => {
      if (rendererPeakKb(browser.process()?.pid) > RENDERER_LIMIT_KB) { aborted = 'a renderer passed 6 GB'; browser.process()?.kill('SIGKILL'); }
    }, 5000);
    try {
      for (const surface of surfaces) {
        for (const [sizeId, [width, height, touch]] of sizes) {
          if (aborted) break;
          const page = await browser.newPage();
          // a mobile viewport reloads the document, so it is set before the page loads
          await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
          const entry = { surface: surface.id, size: sizeId, bands: [], error: null };
          try {
            await page.goto(`${base}${surface.url}`, { waitUntil: 'load', timeout: 180000 });
            await page.waitForFunction(surface.ready, { timeout: 60000, polling: 250 }).catch(() => { entry.error = 'not ready in 60 s (photographed as it stood)'; });
            await new Promise((done) => setTimeout(done, 1500));
            await page.screenshot({ path: join(out, `${surface.id}.${sizeId}.png`) });
            for (const frame of await page.evaluate(framesInPage, MIN_FRAME)) {
              const shot = await page.screenshot({ clip: frame.clip, encoding: 'base64' });
              for (const band of await page.evaluate(bandsInPage, [shot, letterboxBands.toString()])) entry.bands.push({ element: frame.element, fit: frame.fit, ...band });
            }
          } catch (cause) {
            entry.error = String(cause?.message || cause).split('\n')[0];
          } finally {
            await page.close().catch(() => {});
          }
          report.push(entry);
          const line = entry.bands.map((band) => `${band.element} (${band.fit}): ${band.axis} ${band.sizes.join(' / ')} px of rgb(${band.colour.join(',')})`);
          console.log(`${surface.id.padEnd(8)} ${sizeId.padEnd(16)} ${entry.bands.length ? `BANDS ${line.join('; ')}` : 'clean'}${entry.error ? `  (${entry.error})` : ''}`);
        }
      }
    } finally {
      clearInterval(guard);
    }
  } finally {
    clearInterval(refresher);
    await browser?.close().catch(() => {});
    await server.close().catch(() => {});
    releaseCaptureLock();
  }
  writeFileSync(join(out, 'report.json'), `${JSON.stringify({ aborted, report }, null, 1)}\n`);
  const banded = report.filter((entry) => entry.bands.length);
  console.log(`letterbox-bands: ${report.length} captures, ${banded.length} with bands${aborted ? `, aborted: ${aborted}` : ''}; ${out}`);
  if (banded.length || aborted) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
