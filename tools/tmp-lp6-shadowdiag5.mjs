// TEMP lighting_post r6: (a) kill all world casters -> do tree shadows persist (baked?)
// (b) rotate sun azimuth -> do shadows move?
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const vite = await createServer({
  server: { port: 5695, hmr: false, watch: { ignored: ['**/*'] } },
  logLevel: 'silent',
});
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5695/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await page.evaluate("window.__SHOTS.set('player_view')");
await new Promise((r) => setTimeout(r, 1200));

// (a) disable every caster in the world group
await page.evaluate(() => {
  const D = window.__DEBUG;
  const world = D.scene.children.find((c) => c.name && c.name.startsWith('world'));
  world.traverse((o) => { if (o.isMesh || o.isInstancedMesh) o.castShadow = false; });
  D.lighting.update(true);
});
await new Promise((r) => setTimeout(r, 400));
writeFileSync('shots/_lp6_pv_nocasters.png', await page.screenshot({ type: 'png' }));

// restore + (b) rotate the light azimuth ~70 deg
await page.evaluate(() => {
  location.reload();
});
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await page.evaluate("window.__SHOTS.set('player_view')");
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => {
  const D = window.__DEBUG;
  const d = D.lighting.csm.lightDirection; // FROM sun (already negated)
  // rotate around Y by 70 deg
  const a = (70 * Math.PI) / 180;
  const x = d.x * Math.cos(a) - d.z * Math.sin(a);
  const z = d.x * Math.sin(a) + d.z * Math.cos(a);
  d.x = x; d.z = z;
  D.lighting.update(true);
});
await new Promise((r) => setTimeout(r, 400));
writeFileSync('shots/_lp6_pv_sunrot.png', await page.screenshot({ type: 'png' }));
await browser.close();
await vite.close();
console.log('done');
