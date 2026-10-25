#!/usr/bin/env node
// Copyright (c) Kevin B. Liu. See NOTICE.md.
//
// Run the renderer probe (wasm/wgpu-probe/dist, served at --url) in puppeteer's Chrome on the machine's GPU, over a
// sweep of scenes from geometry-bound (18 detailed tanks) to draw-bound (thousands of light ones). Hold the GPU capture
// lock (tools/capture-lock.mjs) around it. Prints and writes the results as JSON.
//
//   node tools/wgpu-probe-run.mjs --url=http://127.0.0.1:43197 [--out=FILE]
import { writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import puppeteer from 'puppeteer';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const url = arg('url', 'http://127.0.0.1:43197');
const sweep = process.env.SMOKE ? [{ tanks: 18, detail: 8, frames: 5, rounds: 1 }] : [
  { tanks: 18, detail: 40, frames: 60, rounds: 5 },
  { tanks: 300, detail: 8, frames: 30, rounds: 3 },
  { tanks: 1500, detail: 4, frames: 15, rounds: 3 },
  { tanks: 3000, detail: 2, frames: 10, rounds: 3 },
];
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 900_000, args: [
  '--use-gl=angle', '--enable-unsafe-webgpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--disable-frame-rate-limit', '--disable-gpu-vsync', '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
const results = { browser: await browser.version(), loadStart: loadavg()[0], runs: [] };
try {
  for (const s of sweep) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
    await page.goto(`${url}/index.html?tanks=${s.tanks}&detail=${s.detail}&frames=${s.frames}&rounds=${s.rounds}`);
    await page.waitForFunction(() => /DONE|ERROR/.test(document.getElementById('out').textContent), { timeout: 600_000, polling: 1000 });
    const text = await page.$eval('#out', (e) => e.textContent);
    const probe = await page.evaluate(() => window.__probe ?? null);
    console.log(text.split('\n').slice(1).join('\n'));
    results.runs.push({ ...s, probe, text });
    await page.close();
  }
} finally {
  await browser.close();
}
results.loadEnd = loadavg()[0];
const out = arg('out', null);
if (out) writeFileSync(out, `${JSON.stringify(results, null, 1)}\n`);
console.log(`[wgpu-probe] ${results.browser}, load ${results.loadStart.toFixed(1)} -> ${results.loadEnd.toFixed(1)}`);
