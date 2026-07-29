// TEMP lighting_post r6: enumerate world-verdant meshes; toggle prop casters only.
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const vite = await createServer({ server: { port: 5693 }, logLevel: 'silent' });
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)); });
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5693/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await page.evaluate("window.__SHOTS.set('player_view')");
await new Promise((r) => setTimeout(r, 1200));

const list = await page.evaluate(() => {
  const D = window.__DEBUG;
  const world = D.scene.children.find((c) => c.name && c.name.startsWith('world'));
  const rows = [];
  world.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    if (!o.visible || o.castShadow) return;
    const g = o.geometry;
    const tris = g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
    rows.push({
      name: o.name || '(anon)',
      parent: o.parent && o.parent.name || '(anon)',
      type: o.isInstancedMesh ? `inst x${o.count}` : 'mesh',
      matName: o.material && (o.material.name || o.material.type),
      transparent: !!(o.material && o.material.transparent),
      depthWrite: o.material ? o.material.depthWrite : null,
      tris: Math.round(tris),
    });
  });
  return rows;
});
console.log(JSON.stringify(list));
await browser.close();
await vite.close();
