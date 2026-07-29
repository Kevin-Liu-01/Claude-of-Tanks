// TEMP lighting_post r6: diagnose missing prop/building shadows in player_view.
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const vite = await createServer({ server: { port: 5691 }, logLevel: 'silent' });
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5691/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await page.evaluate("window.__SHOTS.set('player_view')");
await new Promise((r) => setTimeout(r, 1500));

const info = await page.evaluate(() => {
  const D = window.__DEBUG;
  const csm = D.lighting.csm;
  const cams = csm.lights.map((l) => {
    const c = l.shadow.camera;
    return {
      intensity: +l.intensity.toFixed(2),
      mapSize: l.shadow.mapSize.x,
      hasMap: !!l.shadow.map,
      autoUpdate: l.shadow.autoUpdate,
      needsUpdate: l.shadow.needsUpdate,
      radius: +l.shadow.radius.toFixed(2),
      box: [c.left, c.right, c.top, c.bottom, c.near, c.far].map((v) => +v.toFixed(1)),
      pos: l.position.toArray().map((v) => +v.toFixed(1)),
    };
  });
  // census of castShadow flags by rough category
  const cats = {};
  D.scene.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    const key = `${o.name || o.material?.name || o.material?.type || 'mesh'}|cast=${o.castShadow}|vis=${o.visible}`;
    cats[key] = (cats[key] || 0) + 1;
  });
  return { cams, maxFar: csm.maxFar, breaks: csm.breaks?.map((b) => [b.x?.toFixed?.(3), b.y?.toFixed?.(3)] ?? b), cats };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
await vite.close();
