// TEMP lighting_post r6: move a known-casting tree instance onto the road —
// does its shadow appear on the terrain (road) receiver?
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const vite = await createServer({
  server: { port: 5705, hmr: false, watch: { ignored: ['**/*'] } },
  logLevel: 'silent',
});
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5705/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate("window.__SHOTS.set('player_view')");
await new Promise((r) => setTimeout(r, 1200));

const res = await page.evaluate(async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const D = window.__DEBUG;
  const cam = D.camera;
  const fwd = new THREE.Vector3();
  cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const hf = D.world.heightField;
  const road = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 26);
  const ry = hf.getHeightAt(road.x, road.z);
  const world = D.scene.children.find((c) => c.name && c.name.startsWith('world'));
  const veg = world.children.find((c) => c.name === 'vegetation');
  // find casting instanced meshes with instances (trunks+canopies)
  const casters = [];
  veg.traverse((o) => { if (o.isInstancedMesh && o.castShadow && o.count > 10) casters.push(o); });
  // teleport instance #3 of the first two casters (trunk+canopy pair, hopefully)
  const m4 = new THREE.Matrix4();
  let moved = 0;
  for (const im of casters.slice(0, 4)) {
    im.getMatrixAt(3, m4);
    const e = m4.elements;
    e[12] = road.x; e[13] = ry; e[14] = road.z;
    im.setMatrixAt(3, m4);
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    moved++;
  }
  D.lighting.update(true);
  return { casters: casters.length, moved, roadPos: [road.x.toFixed(1), ry.toFixed(1), road.z.toFixed(1)] };
});
console.log(JSON.stringify(res));
await new Promise((r) => setTimeout(r, 500));
writeFileSync('shots/_lp6_treeroad.png', await page.screenshot({ type: 'png' }));
await browser.close();
await vite.close();
