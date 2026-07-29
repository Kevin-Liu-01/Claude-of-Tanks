// TEMP lighting_post r6: inject test boxes at 20/80/200/350m in front of the
// player_view camera; do THEY cast shadows? Isolates pipeline-vs-props.
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const vite = await createServer({
  server: { port: 5698, hmr: false, watch: { ignored: ['**/*'] } },
  logLevel: 'silent',
});
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5698/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate("window.__SHOTS.set('player_view')");
await new Promise((r) => setTimeout(r, 1200));

const dump = await page.evaluate(async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const D = window.__DEBUG;
  // pole state (from prior probe cut off)
  const rc = new THREE.Raycaster(); rc.far = 4000;
  const ndc = new THREE.Vector2((1452 / 1920) * 2 - 1, -(470 / 1080) * 2 + 1);
  rc.setFromCamera(ndc, D.camera);
  const hits = rc.intersectObjects(D.scene.children, true);
  const h = hits.find((x) => x.object.isMesh || x.object.isInstancedMesh);
  const pole = h ? {
    dist: +h.distance.toFixed(1),
    type: h.object.isInstancedMesh ? `inst x${h.object.count}` : 'mesh',
    chain: (() => { const c = []; let p = h.object; while (p) { c.push(p.name || p.type); p = p.parent; } return c.join('<'); })(),
    castShadow: h.object.castShadow,
    frustumCulled: h.object.frustumCulled,
    matType: h.object.material && h.object.material.type,
    matVisible: h.object.material && h.object.material.visible,
    bsRadius: h.object.geometry.boundingSphere ? +h.object.geometry.boundingSphere.radius.toFixed(1) : null,
  } : null;

  // inject test boxes down the camera forward axis
  const cam = D.camera;
  const fwd = new THREE.Vector3();
  cam.getWorldDirection(fwd);
  fwd.y = 0; fwd.normalize();
  const mat = new THREE.MeshStandardMaterial({ color: 0xcc4444 });
  const hf = D.world.heightField;
  for (const d of [20, 80, 200, 350]) {
    const p = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, d);
    const y = hf.getHeightAt(p.x, p.z);
    const box = new THREE.Mesh(new THREE.BoxGeometry(2, 7, 2), mat);
    box.position.set(p.x + 6, y + 3.5, p.z);
    box.castShadow = true;
    D.scene.add(box);
  }
  D.lighting.update(true);
  return { pole };
});
console.log(JSON.stringify(dump, null, 1));
await new Promise((r) => setTimeout(r, 500));
writeFileSync('shots/_lp6_pv_boxes.png', await page.screenshot({ type: 'png' }));
await browser.close();
await vite.close();
