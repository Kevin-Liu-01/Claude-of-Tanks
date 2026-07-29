// TEMP fx r4 diagnostic 5 — identify wreck box meshes on m1a2_tusk.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5600 + Math.floor(Math.random() * 90), strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 700, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('[pageerror]', String(e)));
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
  await page.evaluate(() => { window.__DEBUG.startBattle('m1a2'); });
  await new Promise((r) => setTimeout(r, 5000));
  const out = await page.evaluate(() => {
    const D = window.__DEBUG;
    const tgt = D.game.tanks.find((tk) => tk.specId === 'm1a2_tusk') ||
      D.game.tanks.find((tk) => tk.team === 'enemy');
    const rows = [];
    tgt.visual.root.updateMatrixWorld(true);
    tgt.visual.root.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox;
      const sx = (bb.max.x - bb.min.x) * o.scale.x, sy = (bb.max.y - bb.min.y) * o.scale.y, sz = (bb.max.z - bb.min.z) * o.scale.z;
      if (Math.max(sx, sy, sz) < 2.5) return; // only big meshes (box suspects)
      rows.push({
        name: o.name || '(anon)', type: o.type,
        size: [sx, sy, sz].map((v) => Math.round(v * 100) / 100),
        visible: o.visible,
        mat: m && { t: m.type, transparent: m.transparent, opacity: m.opacity, colorWrite: m.colorWrite, visible: m.visible, depthWrite: m.depthWrite, name: m.name || '' },
      });
    });
    return { spec: tgt.specId, rows };
  });
  console.log(JSON.stringify(out, null, 1));
} catch (e) {
  console.error('[diag5] FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
