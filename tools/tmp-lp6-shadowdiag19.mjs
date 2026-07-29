// TEMP lighting_post r6: plain box + fresh customDepthMaterial — casts?
// Also: reversed depth state + a box with depthPacking=RGBADepthPacking custom.
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const vite = await createServer({
  server: { port: 5712, hmr: false, watch: { ignored: ['**/*'] } },
  logLevel: 'silent',
});
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5712/', { waitUntil: 'domcontentloaded' });
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
  const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
  const hf = D.world.heightField;
  const geo = new THREE.BoxGeometry(1.5, 6, 1.5);
  const mat = new THREE.MeshLambertMaterial({ color: 0xb04040 });
  const put = (i, custom) => {
    const p = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 22).addScaledVector(right, i);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(p.x, hf.getHeightAt(p.x, p.z) + 3, p.z);
    m.castShadow = true;
    if (custom) m.customDepthMaterial = custom;
    D.scene.add(m);
  };
  put(-9, new THREE.MeshDepthMaterial());                                              // fresh basic
  put(0, new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));       // like foliage
  put(9, null);                                                                        // control: shared singleton
  let reversed = null;
  try { reversed = D.renderer.state.buffers.depth.getReversed(); } catch (e) { reversed = 'err'; }
  return { reversed };
});
console.log(JSON.stringify(res));
await new Promise((r) => setTimeout(r, 600));
writeFileSync('shots/_lp6_customdepth.png', await page.screenshot({ type: 'png' }));
await browser.close();
await vite.close();
