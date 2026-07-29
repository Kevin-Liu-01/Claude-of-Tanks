// TEMP lighting_post r6: swap terrain material — (a) plain standard (non-CSM),
// (b) the known-shadow-receiving veg material. Which shows road shadows?
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const vite = await createServer({
  server: { port: 5708, hmr: false, watch: { ignored: ['**/*'] } },
  logLevel: 'silent',
});
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5708/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate("window.__SHOTS.set('player_view')");
await new Promise((r) => setTimeout(r, 1200));

// (a) plain material on all terrain meshes
await page.evaluate(async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const D = window.__DEBUG;
  const world = D.scene.children.find((c) => c.name && c.name.startsWith('world'));
  const terr = world.children.find((c) => c.name === 'terrain');
  const plain = new THREE.MeshStandardMaterial({ color: 0x777777 });
  window.__origTerrMats = [];
  terr.traverse((o) => { if (o.isMesh) { window.__origTerrMats.push([o, o.material]); o.material = plain; } });
});
await new Promise((r) => setTimeout(r, 500));
writeFileSync('shots/_lp6_terr_plain.png', await page.screenshot({ type: 'png' }));

// (b) veg caster material on terrain
await page.evaluate(() => {
  const D = window.__DEBUG;
  const world = D.scene.children.find((c) => c.name && c.name.startsWith('world'));
  const veg = world.children.find((c) => c.name === 'vegetation');
  let vegMat = null;
  veg.traverse((o) => { if (!vegMat && o.isInstancedMesh && o.castShadow && o.receiveShadow && o.material.isMeshStandardMaterial && !o.material.alphaTest) vegMat = o.material; });
  if (!vegMat) { veg.traverse((o) => { if (!vegMat && o.isInstancedMesh && o.castShadow && o.receiveShadow && o.material.isMeshStandardMaterial) vegMat = o.material; }); }
  for (const [o] of window.__origTerrMats) o.material = vegMat;
});
await new Promise((r) => setTimeout(r, 500));
writeFileSync('shots/_lp6_terr_vegmat.png', await page.screenshot({ type: 'png' }));
await browser.close();
await vite.close();
console.log('done');
