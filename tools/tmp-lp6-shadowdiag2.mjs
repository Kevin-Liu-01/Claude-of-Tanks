// TEMP lighting_post r6: A/B — force castShadow on all visible meshes; does the
// village/pole shadow appear? Also dump per-group caster stats.
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const vite = await createServer({ server: { port: 5692 }, logLevel: 'silent' });
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5692/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await page.evaluate("window.__SHOTS.set('player_view')");
await new Promise((r) => setTimeout(r, 1200));
writeFileSync('shots/_lp6_pv_base.png', await page.screenshot({ type: 'png' }));

const stats = await page.evaluate(() => {
  const D = window.__DEBUG;
  // per top-level group: caster counts
  const rows = [];
  for (const child of D.scene.children) {
    let cast = 0, nocast = 0, tris = 0;
    child.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      if (!o.visible) return;
      if (o.castShadow) cast++; else nocast++;
    });
    if (cast + nocast > 0) rows.push({ name: child.name || child.type, cast, nocast });
  }
  return rows;
});
console.log(JSON.stringify(stats));

// A/B: force everything to cast (except sky/clouds/decals with transparent+depthWrite false)
await page.evaluate(() => {
  const D = window.__DEBUG;
  D.scene.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    if (!o.visible) return;
    const m = o.material;
    if (m && (m.name === 'SkyShader' || (m.transparent && m.depthWrite === false))) return;
    o.castShadow = true;
  });
  D.lighting.update(true);
});
await new Promise((r) => setTimeout(r, 600));
writeFileSync('shots/_lp6_pv_allcast.png', await page.screenshot({ type: 'png' }));
await browser.close();
await vite.close();
