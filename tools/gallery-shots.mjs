#!/usr/bin/env node
// Gallery stills at exact cameras, headless on SwiftShader (no GPU, so no capture lock):
//   node tools/gallery-shots.mjs --port=5291 --out=dir 'kf51_u@-7.87,-13.34,5.24@0,2.16,0;leo2a5m@-3,0.25,-6.4@-1.36,1.05,-3.65'
// Each shot is id@camera@target in the Tank Gallery's frame — the frame a surface-markup export records as
// camera.position and camera.target, so an owner's markup view is reproduced exactly (window.__TANK_GALLERY.setCamera).
// Serve a checkout first (`node node_modules/vite/bin/vite.js --port 5291 --strictPort`) and stop that exact PID after.
// Never edit src while it runs: vite hot-reloads the page under the capture. A manual probe, not part of npm test.
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const spec = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!spec) { console.error('usage: node tools/gallery-shots.mjs --port=N --out=dir \'id@px,py,pz@tx,ty,tz;...\''); process.exit(2); }
const port = arg('port', '5291'), out = arg('out', 'tmp/gallery-shots');
const width = +arg('width', 1200), height = +arg('height', 900);
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 900000,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', `--window-size=${width},${height}`] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  let current = null;
  for (const shot of spec.split(';').filter(Boolean)) {
    const [id, position, target] = shot.split('@');
    const p = position.split(',').map(Number), t = target.split(',').map(Number);
    if (!current) {
      await page.goto(`http://127.0.0.1:${port}/gallery?id=${id}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
      await page.waitForFunction(() => window.__TANK_GALLERY?.ready, { timeout: 300000, polling: 500 });
    } else if (current !== id) {
      await page.evaluate((next) => window.__TANK_GALLERY.loadTank(next), id);
      await page.waitForFunction((next) => window.__TANK_GALLERY?.ready && window.__TANK_GALLERY.getState().selectedId === next,
        { timeout: 300000, polling: 500 }, id);
    }
    current = id;
    await page.evaluate((cp, ct) => window.__TANK_GALLERY.setCamera(cp, ct), p, t);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const file = `${out}/${id}-${p.map((v) => v.toFixed(2)).join('_')}.png`;
    await (await page.$('canvas')).screenshot({ path: file });
    console.log(file);
  }
} finally {
  await browser.close();
}
