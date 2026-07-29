// TEMP lighting_post r6: (a) plain Mesh + frustumCulled=false — casts?
// (b) all world plain meshes frustumCulled=false — do houses/fences cast?
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const vite = await createServer({
  server: { port: 5711, hmr: false, watch: { ignored: ['**/*'] } },
  logLevel: 'silent',
});
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5711/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate("window.__SHOTS.set('player_view')");
await new Promise((r) => setTimeout(r, 1200));

await page.evaluate(async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const D = window.__DEBUG;
  const cam = D.camera;
  const fwd = new THREE.Vector3();
  cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
  const hf = D.world.heightField;
  const geo = new THREE.BoxGeometry(1.5, 6, 1.5);
  const mat = new THREE.MeshLambertMaterial({ color: 0xb04040 });
  const p = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 22).addScaledVector(right, -7);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(p.x, hf.getHeightAt(p.x, p.z) + 3, p.z);
  m.castShadow = true;
  m.frustumCulled = false; // <- the single delta vs diag17's plain box
  D.scene.add(m);
});
await new Promise((r) => setTimeout(r, 600));
writeFileSync('shots/_lp6_nocull_box.png', await page.screenshot({ type: 'png' }));

await page.evaluate(() => {
  const D = window.__DEBUG;
  const world = D.scene.children.find((c) => c.name && c.name.startsWith('world'));
  let n = 0;
  world.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh && o.castShadow && o.frustumCulled) { o.frustumCulled = false; n++; }
  });
  D.lighting.update(true);
  console.log('uncull-cast-meshes', n);
});
await new Promise((r) => setTimeout(r, 600));
writeFileSync('shots/_lp6_nocull_world.png', await page.screenshot({ type: 'png' }));
await browser.close();
await vite.close();
console.log('done');
