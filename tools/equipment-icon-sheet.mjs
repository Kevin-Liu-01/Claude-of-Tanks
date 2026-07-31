// tools/equipment-icon-sheet.mjs — screenshot the equipment icon sheet
// (tools/equip-icon-sheet.html) for glyph review at 20/34/48 px.
// Usage: node tools/equipment-icon-sheet.mjs [--out shots/equipment/icon-sheet.png]
// Own vite on a 7xxx port; no game boot, no WebGL — no capture lock needed.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const args = process.argv.slice(2);
const i = args.indexOf('--out');
const out = resolve(i >= 0 ? args[i + 1] : 'shots/equipment/icon-sheet.png');
mkdirSync(dirname(out), { recursive: true });

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { port: 7300 + Math.floor(Math.random() * 500), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/tools/equip-icon-sheet.html`;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1120, height: 560, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__SHEET_READY === true, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 250));
const h = await page.evaluate(() => document.body.scrollHeight);
await page.setViewport({ width: 1120, height: Math.min(1400, h + 10), deviceScaleFactor: 2 });
await new Promise((r) => setTimeout(r, 150));
await page.screenshot({ path: out, fullPage: true });
await browser.close();
await server.close();
console.log(`[icon-sheet] wrote ${out}`);
