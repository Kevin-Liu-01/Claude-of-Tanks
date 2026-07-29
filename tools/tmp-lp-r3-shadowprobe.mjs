// lighting_post r3 diagnostic: why do battlefield AI tanks cast no shadows,
// and why do hulls render darker than terrain?
// Usage: node tools/tmp-lp-r3-shadowprobe.mjs
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const port = 5700 + Math.floor(Math.random() * 200);
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port, strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
page.on('pageerror', (e) => console.error('PAGEERROR', String(e)));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });

await page.evaluate(() => window.__SHOTS.set('battlefield'));
await new Promise((r) => setTimeout(r, 2600));

const info = await page.evaluate(() => {
  const D = window.__DEBUG;
  const cam = D.camera;
  const out = { camPos: cam.position.toArray().map((v) => +v.toFixed(1)), tanks: [], csm: [] };
  const v = new (cam.position.constructor)();
  for (const t of D.game.tanks) {
    const root = t.visual && t.visual.root;
    if (!root) continue;
    root.getWorldPosition(v);
    const dist = v.distanceTo(cam.position);
    const rec = {
      id: t.spec.id, isPlayer: t === D.game.player,
      dist: +dist.toFixed(1),
      pos: v.toArray().map((x) => +x.toFixed(1)),
      rootVisible: root.visible,
      casters: 0, casterNames: [], proxies: 0, hiddenCasters: 0,
      lodLevels: [],
    };
    root.traverse((o) => {
      if (o.isLOD) rec.lodLevels.push(o.levels.map((l) => l.distance).join('/'));
    });
    // effective-visibility walk
    const walk = (node, vis) => {
      const nv = vis && node.visible;
      if ((node.isMesh || node.isInstancedMesh) && node.castShadow) {
        if (nv) {
          rec.casters++;
          if (rec.casterNames.length < 8) rec.casterNames.push(node.name || node.type);
          if ((node.name || '').startsWith('shadowProxy')) rec.proxies++;
        } else rec.hiddenCasters++;
      }
      for (const c of node.children) walk(c, nv);
    };
    walk(root, true);
    out.tanks.push(rec);
  }
  out.tanks.sort((a, b) => a.dist - b.dist);
  const csm = D.lighting.csm;
  out.maxFar = csm.maxFar;
  out.breaks = csm.breaks ? csm.breaks.map((b) => (typeof b === 'number' ? +b.toFixed(4) : [b.x, b.y])) : null;
  for (const l of csm.lights) {
    const c = l.shadow.camera;
    out.csm.push({
      int: +l.intensity.toFixed(2),
      mapSize: l.shadow.mapSize.x,
      autoUpdate: l.shadow.autoUpdate,
      cam: [c.left, c.right, c.top, c.bottom, c.near, c.far].map((x) => +x.toFixed(0)),
      lightPos: l.position.toArray().map((x) => +x.toFixed(0)),
      targetPos: l.target.position.toArray().map((x) => +x.toFixed(0)),
    });
  }
  out.camNearFar = [cam.near, cam.far];
  return out;
});
console.log(JSON.stringify(info, null, 1));

await browser.close();
await server.close();
