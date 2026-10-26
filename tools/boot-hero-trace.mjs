#!/usr/bin/env node
// The boot hero's own records from a release build (2026-10-26: the first live frame compiled every program of the
// hero, none linked before it). Copyright (c) 2026 Kevin B. Liu. First-party tool; see NOTICE.md.
// Opens '/' as a player (navigator.webdriver hidden), waits for the boot gate, and prints the pedestal's switch records
// (__SWITCH_TIMINGS: each switch's build, compile and link outcome), its trace (__PED_TRACE) and __BOOT_TIMINGS.
//   node tools/boot-hero-trace.mjs --dist=<dir> [--vercel-json=<path>] --out=<file.json> [--lock]
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createCaptureLock } from './capture-lock.mjs';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dist = resolve(arg('dist'));
const vercelJson = arg('vercel-json');
const out = resolve(arg('out') ?? 'boot-hero-trace.json');
const root = new URL('..', import.meta.url).pathname;
const freePort = () => new Promise((done, fail) => {
  const probe = net.createServer();
  probe.once('error', fail);
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)); });
});
const lock = process.argv.includes('--lock') ? createCaptureLock() : null;
if (lock) { await lock.acquire(90 * 60 * 1000, { place: 'boot-hero-trace' }); setInterval(() => lock.refresh(), 30_000).unref(); }
const port = await freePort();
const server = spawn(process.execPath, [join(root, 'tools/vercel-static-preview.mjs'), `--dist=${dist}`, `--port=${port}`,
  ...(vercelJson ? [`--vercel-json=${resolve(vercelJson)}`] : [])], { stdio: 'ignore' });
const origin = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100 && !await fetch(origin).then(() => true, () => false); i++) await new Promise((r) => setTimeout(r, 100));
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--js-flags=--max-old-space-size=3072'] });
let result = null;
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true }));
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('#cot-boot-gate.on'), { timeout: 240_000, polling: 200 });
  result = await page.evaluate(() => JSON.parse(JSON.stringify({
    switches: window.__SWITCH_TIMINGS ?? null,
    garageSwitch: window.__GARAGE_SWITCH ?? null,
    trace: (window.__PED_TRACE ?? []).slice(-60),
    bootTimings: window.__BOOT_TIMINGS ?? null,
  }, (key, value) => (typeof value === 'function' ? undefined : value))));
} finally {
  await browser.close();
  server.kill();
  if (lock) await lock.release();
}
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ switches: result?.switches, garageSwitch: result?.garageSwitch }, null, 1).slice(0, 6000));
console.log('trace:', (result?.trace ?? []).map((row) => JSON.stringify(row)).join('\n  ').slice(0, 6000));
process.exit(0);
