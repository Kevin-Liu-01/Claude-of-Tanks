// TEMP lighting_post r6: A/B the PCF radius (penumbra smear theory) on player_view.
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const vite = await createServer({
  server: { port: 5694, hmr: false, watch: { ignored: ['**/*'] } },
  logLevel: 'silent',
});
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5694/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await page.evaluate("window.__SHOTS.set('player_view')");
await new Promise((r) => setTimeout(r, 1200));
writeFileSync('shots/_lp6_pv_base.png', await page.screenshot({ type: 'png' }));

await page.evaluate(() => {
  const D = window.__DEBUG;
  for (const l of D.lighting.csm.lights) l.shadow.radius = 0.35;
  D.lighting.update(true);
});
await new Promise((r) => setTimeout(r, 500));
writeFileSync('shots/_lp6_pv_r035.png', await page.screenshot({ type: 'png' }));

// also check: props group casters listing (which anon casters exist)
const casters = await page.evaluate(() => {
  const D = window.__DEBUG;
  const grp = D.scene.children.find((c) => c.type === 'Group' && !c.name);
  const rows = [];
  if (grp) {
    grp.traverse((o) => {
      if ((o.isMesh || o.isInstancedMesh) && o.visible && o.castShadow) {
        const g = o.geometry;
        const tris = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
        rows.push({ t: o.isInstancedMesh ? `inst x${o.count}` : 'mesh', tris: Math.round(tris), fc: o.frustumCulled });
      }
    });
  }
  return rows;
});
console.log(JSON.stringify(casters));
await browser.close();
await vite.close();
