#!/usr/bin/env node
// media-motion-savedata.browser.mjs — the media policy in a real browser (brand-ui SPEC 8.3, SHOWCASE §5.1/§5.5;
// BUI-F7). A browser receipt: run it after `npm run build` (it serves dist/ with `vite preview` unless --url names a
// server). It holds the shared capture lock (tools/capture-lock.mjs) for its browser run.
//
//   1. Reduced motion and Save-Data: each public page (home, the manual's index with its archive dialog open, topic
//      pages, the Gallery, the 404) is loaded headless with each flag and scrolled to its end: zero video bytes. Under
//      Save-Data every still with a 640 rung that loads after the page's LCP is that rung.
//   2. The Play hand-off: on the home page, with the reel's transfer in flight on a throttled link, hovering Play
//      prefetches nothing, and clicking it cancels every media transfer before the game document is requested.
//   3. The entry prefetch: with no video downloading, hovering Play prefetches the game's entry chunk (named by
//      <meta name="cot-game-entry">), and nothing fetches it before the hover.
//
//   node tools/media-motion-savedata.browser.mjs [--url=http://127.0.0.1:4173] [--out=<dir>] [--pages=/home,/docs]
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { createCaptureLock } from './capture-lock.mjs';
import { stillRungs } from '../src/presentation/responsivePicture.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const OUT = resolve(arg('out', join(ROOT, '.qa-dev/media-motion-savedata')));
mkdirSync(OUT, { recursive: true });
const PAGES = arg('pages', '/home,/docs,/docs/vehicles,/docs/filming,/docs/worlds,/gallery,/no-such-sector').split(',');
const VIDEO = /\.(?:webm|mp4|mov)(?:[?#]|$)/i;

async function freePort() {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => done(port)); });
  });
}

let preview = null;
let base = arg('url', '');
if (!base) {
  assert.ok(existsSync(join(ROOT, 'dist/home.html')), 'build first (npm run build) or pass --url');
  const port = await freePort();
  preview = spawn(join(ROOT, 'node_modules/.bin/vite'), ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' } });
  base = `http://127.0.0.1:${port}`;
  for (let tries = 0; ; tries++) {
    try { if ((await fetch(`${base}/home`)).ok) break; } catch { /* starting */ }
    if (tries > 120) throw new Error('vite preview did not start');
    await new Promise((done) => setTimeout(done, 250));
  }
}

// (a driver that already holds the capture lock for a longer session passes COT_CAPTURE_LOCK_HELD=1)
const lock = process.env.COT_CAPTURE_LOCK_HELD === '1' ? { acquire: async () => {}, refresh() {}, release() {} } : createCaptureLock();
await lock.acquire(20 * 60 * 1000);
const keepLock = setInterval(() => lock.refresh(), 30_000);
const report = { base, flags: [], handoff: null, prefetch: null };
let browser;
try {
  browser = await puppeteer.launch({ headless: true, channel: 'chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

  /** A fresh page with network logging: requests by id, with type, bytes, failure and CDP timestamps. */
  async function openPage({ reducedMotion = false, saveData = false, viewport = { width: 1440, height: 900 } } = {}) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport(viewport);
    if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    if (saveData) {
      await page.setExtraHTTPHeaders({ 'Save-Data': 'on' });
      await page.evaluateOnNewDocument(() => {
        const connection = { saveData: true, effectiveType: '4g', addEventListener() {}, removeEventListener() {} };
        Object.defineProperty(Navigator.prototype, 'connection', { configurable: true, get: () => connection });
      });
    }
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    const requests = new Map();
    cdp.on('Network.requestWillBeSent', ({ requestId, request, type, timestamp }) => {
      requests.set(requestId, { url: request.url, type, sent: timestamp, bytes: 0, finished: null, failed: null, canceled: false });
    });
    cdp.on('Network.dataReceived', ({ requestId, encodedDataLength }) => {
      const request = requests.get(requestId);
      if (request) request.bytes += encodedDataLength;
    });
    cdp.on('Network.loadingFinished', ({ requestId, timestamp, encodedDataLength }) => {
      const request = requests.get(requestId);
      if (request) { request.finished = timestamp; request.bytes = Math.max(request.bytes, encodedDataLength); }
    });
    cdp.on('Network.loadingFailed', ({ requestId, timestamp, canceled, errorText }) => {
      const request = requests.get(requestId);
      if (request) { request.failed = timestamp; request.canceled = !!canceled || /ERR_ABORTED/.test(errorText); }
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    return { context, page, cdp, requests, errors };
  }

  async function scrollThrough(page) {
    await page.evaluate(async () => {
      const step = Math.round(innerHeight * 0.8);
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        scrollTo(0, y);
        await new Promise((done) => setTimeout(done, 260));
      }
      scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((done) => setTimeout(done, 600));
    });
  }

  // 1. Reduced motion and Save-Data: zero video bytes; Save-Data's stills at their 640 rung.
  for (const flag of ['reducedMotion', 'saveData']) {
    for (const path of PAGES) {
      const { context, page, requests, errors } = await openPage({ [flag]: true });
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle2', timeout: 60_000 });
      if (path === '/docs') {
        await page.click('#docsArchiveOpen');
        await new Promise((done) => setTimeout(done, 1500));
        await page.keyboard.press('Escape');
      }
      await scrollThrough(page);
      await new Promise((done) => setTimeout(done, 800));
      const rows = [...requests.values()];
      const videos = rows.filter((row) => VIDEO.test(row.url) || row.type === 'Media');
      const videoBytes = videos.reduce((sum, row) => sum + row.bytes, 0);
      const eager = await page.evaluate(() => [...document.querySelectorAll('img[fetchpriority="high"], link[rel="preload"][as="image"]')]
        .map((element) => new URL(element.getAttribute('src') || element.getAttribute('href'), location.href).pathname));
      const largeStills = flag === 'saveData' ? rows.map((row) => new URL(row.url).pathname).filter((pathname) => {
        if (!/\.(?:webp|jpe?g)$/.test(pathname) || eager.includes(pathname)) return false;
        const rungs = stillRungs(pathname);
        return rungs.length > 1 && rungs[0].width <= 640 && rungs[0].src !== pathname && existsSync(join(ROOT, 'public', rungs[0].src));
      }) : [];
      const shot = join(OUT, `${flag}${path.replace(/\//g, '_') || '_root'}.png`);
      await page.screenshot({ path: shot });
      report.flags.push({ flag, path, videoRequests: videos.map((row) => new URL(row.url).pathname), videoBytes, largeStills,
        stills: rows.filter((row) => /\.(?:webp|jpe?g)$/.test(new URL(row.url).pathname)).length, errors });
      assert.equal(videoBytes, 0, `${flag} ${path}: ${videoBytes} video bytes (${videos.map((row) => row.url).join(', ')})`);
      assert.equal(videos.length, 0, `${flag} ${path}: no video request at all`);
      assert.deepEqual(largeStills, [], `${flag} ${path}: data saving loads the 640 rung of a still that has one`);
      assert.deepEqual(errors, [], `${flag} ${path}: page errors`);
      await context.close();
    }
  }

  // 2. The Play hand-off, with the reel's transfer in flight on a slow link.
  {
    const { context, page, cdp, requests, errors } = await openPage();
    await page.goto(`${base}/home`, { waitUntil: 'networkidle2', timeout: 60_000 });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200_000, uploadThroughput: 100_000 });
    await page.evaluate(() => document.querySelector('.v5-film')?.scrollIntoView({ block: 'center' }));
    const started = Date.now();
    let inFlight = null;
    while (!inFlight && Date.now() - started < 15_000) {
      inFlight = [...requests.values()].find((row) => VIDEO.test(row.url) && !row.finished && !row.failed);
      if (!inFlight) await new Promise((done) => setTimeout(done, 100));
    }
    assert.ok(inFlight, 'a video transfer is in flight before the hand-off');
    // hovering Play while a video downloads prefetches nothing
    await page.hover('.hero-actions .btn.primary');
    await new Promise((done) => setTimeout(done, 500));
    const prefetchedWhileBusy = await page.evaluate(() => !!document.querySelector('link[rel="prefetch"][data-cot-game-entry], link[rel="prefetch"][href*="/assets/main-"]'));
    // the click: every media transfer cancelled before the game document is requested
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => null),
      page.click('.hero-actions .btn.primary'),
    ]);
    await new Promise((done) => setTimeout(done, 500));
    const rows = [...requests.values()];
    const documentRequest = rows.find((row) => row.type === 'Document' && /^\/(?:cn\/?)?$/.test(new URL(row.url).pathname));
    const media = rows.filter((row) => (VIDEO.test(row.url) || row.type === 'Media') && row.sent < (documentRequest?.sent ?? Infinity));
    const open = media.filter((row) => !row.finished);
    report.handoff = {
      inFlight: new URL(inFlight.url).pathname, prefetchedWhileBusy,
      game: documentRequest ? { url: documentRequest.url, sent: documentRequest.sent } : null,
      media: media.map((row) => ({ url: new URL(row.url).pathname, sent: row.sent, failed: row.failed, canceled: row.canceled, finished: row.finished })),
      errors,
    };
    assert.equal(prefetchedWhileBusy, false, 'no entry prefetch while a video downloads');
    assert.ok(documentRequest, 'the click requested the game document');
    for (const row of open) {
      assert.ok(row.canceled && row.failed !== null && row.failed <= documentRequest.sent,
        `${row.url}: cancelled (${row.canceled}) at ${row.failed} before the game's first request at ${documentRequest.sent}`);
    }
    assert.ok(open.length >= 1, 'the in-flight transfer was among those cancelled');
    await context.close();
  }

  // 3. The entry prefetch on hover, with no video downloading (the hero, before any scroll).
  {
    const { context, page, requests } = await openPage();
    await page.goto(`${base}/home`, { waitUntil: 'networkidle2', timeout: 60_000 });
    const entry = await page.evaluate(() => document.querySelector('meta[name="cot-game-entry"]')?.content || '');
    assert.match(entry, /^\/assets\/main-[\w-]+\.js$/, 'the build names the game\'s entry chunk');
    const before = [...requests.values()].filter((row) => new URL(row.url).pathname === entry).length;
    await new Promise((done) => setTimeout(done, 500));
    await page.hover('.hero-actions .btn.primary');
    await new Promise((done) => setTimeout(done, 1500));
    const after = [...requests.values()].filter((row) => new URL(row.url).pathname === entry);
    report.prefetch = { entry, before, after: after.map((row) => ({ type: row.type, bytes: row.bytes, finished: !!row.finished })) };
    assert.equal(before, 0, 'nothing fetches the entry chunk before a hover');
    assert.equal(after.length, 1, 'the hover prefetches the entry chunk once');
    await context.close();
  }
} finally {
  clearInterval(keepLock);
  await browser?.close().catch(() => {});
  lock.release();
  preview?.kill('SIGTERM');
  writeFileSync(join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(`media-motion-savedata: ${report.flags.length} page loads (reduced motion, Save-Data) with zero video bytes and `
  + `640 stills under Save-Data; the Play hand-off cancelled ${report.handoff.media.filter((row) => row.canceled).length} transfer(s) `
  + `before the game's first request; the entry chunk prefetched only on hover (${report.prefetch.entry}); report ${join(OUT, 'report.json')}`);
