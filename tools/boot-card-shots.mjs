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
const dist = resolve(arg('dist'));
const vercelJson = arg('vercel-json');
const out = resolve(arg('out') ?? 'boot-card-shots');
const root = new URL('..', import.meta.url).pathname;
const SIZES = [
  { name: 'desktop-1440', width: 1440, height: 900, dpr: 1 },
  { name: 'laptop-1280', width: 1280, height: 720, dpr: 1 },
  { name: 'tablet-768', width: 768, height: 1024, dpr: 2, mobile: true },
  { name: 'phone-390', width: 390, height: 844, dpr: 3, mobile: true },
  { name: 'phone-360', width: 360, height: 640, dpr: 2, mobile: true },
  { name: 'phone-land-844', width: 844, height: 390, dpr: 3, mobile: true },
];
const freePort = () => new Promise((done, fail) => {
  const probe = net.createServer();
  probe.once('error', fail);
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)); });
});

mkdirSync(out, { recursive: true });
const lock = process.argv.includes('--lock') ? createCaptureLock() : null;
if (lock) { await lock.acquire(90 * 60 * 1000, { place: 'boot-card-shots' }); setInterval(() => lock.refresh(), 30_000).unref(); }
const port = await freePort();
const server = spawn(process.execPath, [join(root, 'tools/vercel-static-preview.mjs'), `--dist=${dist}`, `--port=${port}`,
  ...(vercelJson ? [`--vercel-json=${resolve(vercelJson)}`] : [])], { stdio: 'ignore' });
const origin = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100 && !await fetch(origin).then(() => true, () => false); i++) await new Promise((r) => setTimeout(r, 100));
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--js-flags=--max-old-space-size=3072'] });
const rows = [];
try {
  for (const size of SIZES) {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true }));
    await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: size.dpr, isMobile: !!size.mobile, hasTouch: !!size.mobile });
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#cot-boot .cot-boot-mark .cot-mark--layers', { timeout: 30_000 });
    await new Promise((r) => setTimeout(r, 900));
    const box = await page.evaluate(() => {
      const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect();
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 }; };
      return { mark: r('.cot-boot-mark'), words: r('.cot-boot-words'), tank: r('.cot-boot-tank'), layers: r('.cot-mark--layers'),
        animations: document.getAnimations().filter((a) => a.effect?.target?.closest?.('.cot-mark--layers')).length };
    });
    await page.screenshot({ path: join(out, `${size.name}-a.png`) });
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: join(out, `${size.name}-b.png`) });
    if (box.mark) await page.screenshot({ path: join(out, `${size.name}-mark.png`), clip: { x: Math.max(0, box.mark.x - 8), y: Math.max(0, box.mark.y - 8), width: box.mark.w + 16, height: box.mark.h + 16 } });
    rows.push({ size: size.name, ...box });
    console.log(`${size.name}: mark ${JSON.stringify(box.mark)} words ${JSON.stringify(box.words)} tank ${JSON.stringify(box.tank)} layers ${JSON.stringify(box.layers)}, ${box.animations} animations`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
  if (lock) await lock.release();
}
writeFileSync(join(out, 'boxes.json'), JSON.stringify(rows, null, 2));
process.exit(0);
