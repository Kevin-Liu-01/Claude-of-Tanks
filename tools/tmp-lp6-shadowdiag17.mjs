// TEMP lighting_post r6: clean A/B — plain Mesh box vs InstancedMesh box caster.
// Also dump every MeshDepthMaterial program's diagnostics.
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const vite = await createServer({
  server: { port: 5709, hmr: false, watch: { ignored: ['**/*'] } },
  logLevel: 'silent',
});
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5709/', { waitUntil: 'domcontentloaded' });
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
  const mat = new THREE.MeshLambertMaterial({ color: 0xb04040 }); // lambert: avoid heavy standard variants
  // plain mesh, left of road
  {
    const p = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 22).addScaledVector(right, -7);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(p.x, hf.getHeightAt(p.x, p.z) + 3, p.z);
    m.castShadow = true;
    D.scene.add(m);
  }
  // instanced mesh, right of road
  {
    const p = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 22).addScaledVector(right, 7);
    const im = new THREE.InstancedMesh(geo, mat, 1);
    im.setMatrixAt(0, new THREE.Matrix4().setPosition(p.x, hf.getHeightAt(p.x, p.z) + 3, p.z));
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.frustumCulled = false;
    D.scene.add(im);
  }
});
await new Promise((r) => setTimeout(r, 600));
writeFileSync('shots/_lp6_inst_ab.png', await page.screenshot({ type: 'png' }));

const progs = await page.evaluate(() => {
  const D = window.__DEBUG;
  return (D.renderer.info.programs || [])
    .filter((p) => /depth/i.test(p.name) || (p.cacheKey && /MeshDepth/.test(String(p.cacheKey))))
    .map((p) => ({ name: p.name, usedTimes: p.usedTimes, runnable: p.diagnostics ? p.diagnostics.runnable : 'ok' }));
});
console.log('depth programs:', JSON.stringify(progs));
console.log('console:', JSON.stringify(logs.filter((l) => !l.startsWith('log')).slice(0, 12), null, 1));
await browser.close();
await vite.close();
