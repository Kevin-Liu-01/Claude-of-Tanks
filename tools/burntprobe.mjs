// TEMP: verify the burnt-material swap applies to GLB-swapped tanks.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5980, strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 640, height: 360 });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
const out = await page.evaluate(() => {
  const D = window.__DEBUG;
  D.startBattle('m1a2');
  const res = {};
  for (const t of D.game.tanks) {
    if (t.isPlayer) continue;
    const before = new Set();
    t.visual.root.traverse((o) => { if (o.isMesh) before.add(o.material.uuid); });
    t.visual.setDestroyed({ pop: false });
    let burnt = 0, other = 0, hidden = 0, emissive = 0;
    const mats = new Set();
    t.visual.root.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.visible) { hidden++; return; }
      mats.add(o.material.uuid);
      if (o.material.emissiveMap) { burnt++; emissive++; } else other++;
    });
    res[t.specId] = { meshes: burnt + other + hidden, burntSwapped: burnt, notSwapped: other, hidden, distinctMats: mats.size };
    if (Object.keys(res).length >= 4) break;
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
await server.close();
