#!/usr/bin/env node
// The boot card at the UI's sizes, from a release build (2026-10-26: the living tank as compositor layers over the
// stacked wordmark). Copyright (c) 2026 Kevin B. Liu. First-party tool; see NOTICE.md.
// A fresh page per size opens '/' (navigator.webdriver hidden, so the boot screen plays as a player's does), waits for
// the card's mark, and screenshots the whole viewport twice, 1.5 s apart (the tank mid-loop), plus the mark's box.
//   node tools/boot-card-shots.mjs --dist=<dir> [--vercel-json=<path>] --out=<dir> [--lock]
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createCaptureLock } from './capture-lock.mjs';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const liveOrigin = (arg('origin') ?? '').replace(/\/$/, '');
const dist = liveOrigin ? null : resolve(arg('dist'));
// a deployed build refuses analytics and the game's telemetry at the network: a capture adds no production records
const LIVE_BLOCKED = /googletagmanager\.com|google-analytics\.com|\/api\/telemetry|cot-telemetry\./;
const vercelJson = arg('vercel-json');
const out = resolve(arg('out') ?? 'boot-card-shots');
const root = new URL('..', import.meta.url).pathname;
// the UI gauntlet's eight sizes (tools/SKILL.md), each in en ('/') and zh ('/cn/')
const SIZES = [[2560, 1440], [1920, 1080], [1440, 900], [1280, 720], [1024, 600], [900, 700], [390, 844], [844, 390]].flatMap(([width, height]) => {
  const mobile = width < 768 || height < 500;
  return [['en', '/'], ['zh', '/cn/']].map(([lang, path]) => ({ name: `${lang}-${width}x${height}`, width, height, dpr: mobile ? 3 : 1, mobile, path }));
});
const freePort = () => new Promise((done, fail) => {
  const probe = net.createServer();
  probe.once('error', fail);
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)); });
});

mkdirSync(out, { recursive: true });
const lock = process.argv.includes('--lock') ? createCaptureLock() : null;
if (lock) { await lock.acquire(90 * 60 * 1000, { place: 'boot-card-shots' }); setInterval(() => lock.refresh(), 30_000).unref(); }
let origin = liveOrigin, server = null;
if (!origin) {
  const port = await freePort();
  server = spawn(process.execPath, [join(root, 'tools/vercel-static-preview.mjs'), `--dist=${dist}`, `--port=${port}`,
    ...(vercelJson ? [`--vercel-json=${resolve(vercelJson)}`] : [])], { stdio: 'ignore' });
  origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100 && !await fetch(origin).then(() => true, () => false); i++) await new Promise((r) => setTimeout(r, 100));
}
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--js-flags=--max-old-space-size=3072'] });
const rows = [];
try {
  for (const size of SIZES) {
    // a fresh profile per shot: a '/cn/' visit is remembered, and every later '/' then opened in Chinese
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.evaluateOnNewDocument(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true }));
    await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: size.dpr, isMobile: !!size.mobile, hasTouch: !!size.mobile });
    if (liveOrigin) {
      await page.setRequestInterception(true);
      page.on('request', (request) => { if (LIVE_BLOCKED.test(request.url())) request.abort('blockedbyclient').catch(() => {}); else request.continue().catch(() => {}); });
    }
    await page.goto(`${origin}${size.path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#cot-boot .cot-boot-mark .mkl, #cot-boot .cot-boot-mark .cot-mark--layers', { timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 900));
    const box = await page.evaluate(() => {
      const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect();
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 }; };
      const overflowX = document.documentElement.scrollWidth > innerWidth + 1;
      return { mark: r('.cot-boot-mark'), tank: r('.cot-boot-mark .mkl') ?? r('.cot-mark--layers'), words: r('.cot-boot-mark .wm-stack') ?? r('.cot-boot-words'),
        animations: document.getAnimations().filter((a) => a.effect?.target?.closest?.('.mkl, .cot-mark--layers')).length, overflowX,
        lang: document.documentElement.lang };
    });
    await page.screenshot({ path: join(out, `${size.name}-a.png`) });
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: join(out, `${size.name}-b.png`) });
    if (box.mark) await page.screenshot({ path: join(out, `${size.name}-mark.png`), clip: { x: Math.max(0, box.mark.x - 8), y: Math.max(0, box.mark.y - 8), width: box.mark.w + 16, height: box.mark.h + 16 } });
    const langOk = box.lang?.startsWith(size.path === '/cn/' ? 'zh' : 'en') === true;
    rows.push({ size: size.name, ...box, langOk });
    console.log(`${size.name}: mark ${JSON.stringify(box.mark)} tank ${JSON.stringify(box.tank)} words ${JSON.stringify(box.words)}, ${box.animations} animations, lang ${box.lang}, overflowX ${box.overflowX}`);
    await context.close();
  }
} finally {
  await browser.close();
  server?.kill();
  if (lock) await lock.release();
}
writeFileSync(join(out, 'boxes.json'), JSON.stringify(rows, null, 2));
const wrongLang = rows.filter((row) => !row.langOk).map((row) => row.size);
if (wrongLang.length) console.log(`boot-card-shots: ${wrongLang.length} pages opened in the wrong language: ${wrongLang.join(', ')}`);
process.exit(wrongLang.length ? 5 : 0);
