// physics lane scratch (never staged): film a Studio scene on the running dev server into PNG frames + a contact sheet.
//   node .qa-dev/turret-strip.mjs --url=http://127.0.0.1:5733 --out=<dir> --scene=<json file> --frames=40 --step=100 [--size=640x360]
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const arg = (name, fallback = null) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const base = arg('url', 'http://127.0.0.1:5733');
const out = path.resolve(arg('out'));
const scenes = JSON.parse(readFileSync(arg('scene'), 'utf8'));
const frames = Number(arg('frames', '40'));
const stepMs = Number(arg('step', '100'));
const [W, H] = arg('size', '640x360').split('x').map(Number);
const map = arg('map', 'verdant');
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage', `--window-size=${W},${H}`] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/?studio=1&map=${map}&nosplash=1&debug=1`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 300000 });
  await page.waitForFunction(`window.__STUDIO && window.__STUDIO.active === true && window.__STUDIO.mapId === '${map}'`, { timeout: 300000 });
  for (const entry of scenes) {
    const dir = path.join(out, entry.id);
    mkdirSync(dir, { recursive: true });
    await page.evaluate(async (s) => { await window.__STUDIO.load(s); }, entry.scene);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
    const track = [];
    for (let f = 0; f < frames; f++) {
      if (f > 0) await page.evaluate((ms) => window.__STUDIO.advanceFrame(ms), stepMs);
      const cap = await page.evaluate((w, h) => window.__STUDIO.capture({ width: w, height: h }).dataURL, W, H);
      writeFileSync(path.join(dir, `f${String(f).padStart(3, '0')}.png`), Buffer.from(cap.split(',')[1], 'base64'));
      const pos = await page.evaluate(() => {
        const sc = window.__DEBUG.scene; let hit = null;
        sc.traverse((o) => { if (!hit && o.name === 'rig_turret') { let r = o; while (r.parent && r.parent !== sc) r = r.parent; if (!/m1a3/.test(r.name) || false) hit = o; } });
        if (!hit) return null;
        hit.updateWorldMatrix(true, false);
        const e = hit.matrixWorld.elements;
        return [e[12], e[13], e[14]].map((v) => Math.round(v * 100) / 100);
      });
      track.push([f * stepMs, pos]);
    }
    writeFileSync(path.join(dir, 'track.json'), JSON.stringify(track));
    console.log(entry.id, 'frames', frames, 'errors', errors.length);
  }
  if (errors.length) console.log('page errors:', errors.slice(0, 5));
} finally {
  await browser.close();
}
