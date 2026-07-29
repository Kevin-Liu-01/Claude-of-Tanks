// TEMP lighting_post r6: opaque vs alphaTest caster A/B + depth-program diagnostics.
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const vite = await createServer({
  server: { port: 5704, hmr: false, watch: { ignored: ['**/*'] } },
  logLevel: 'silent',
});
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') errors.push(m.text().slice(0, 400)); });
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5704/', { waitUntil: 'domcontentloaded' });
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
  const put = (i, mat) => {
    const p = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 22).addScaledVector(right, (i - 1) * 7);
    const y = hf.getHeightAt(p.x, p.z);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.x, y + 3, p.z);
    mesh.castShadow = true;
    D.scene.add(mesh);
  };
  put(0, new THREE.MeshStandardMaterial({ color: 0xc04040 })); // opaque
  // alphaTest without map: getDepthMaterial only clones when (map||alphaMap)
  // && alphaTest > 0 — so give it a tiny fully-opaque canvas map.
  const cv = document.createElement('canvas'); cv.width = cv.height = 8;
  const cx = cv.getContext('2d'); cx.fillStyle = '#f0f000'; cx.fillRect(0, 0, 8, 8);
  const tex = new THREE.CanvasTexture(cv);
  put(2, new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, alphaTest: 0.4 })); // alphaTest+map
  return true;
});
await new Promise((r) => setTimeout(r, 500));
writeFileSync('shots/_lp6_ab.png', await page.screenshot({ type: 'png' }));

const progs = await page.evaluate(() => {
  const D = window.__DEBUG;
  const out = [];
  for (const p of D.renderer.info.programs || []) {
    out.push({
      name: p.name,
      usedTimes: p.usedTimes,
      diag: p.diagnostics ? {
        runnable: p.diagnostics.runnable,
        progLog: String(p.diagnostics.programLog).slice(0, 240),
        vsLog: p.diagnostics.vertexShader && String(p.diagnostics.vertexShader.log).slice(0, 240),
        fsLog: p.diagnostics.fragmentShader && String(p.diagnostics.fragmentShader.log).slice(0, 240),
      } : null,
    });
  }
  return out.filter((p) => p.name.includes('Depth') || p.name.includes('Distance') || p.diag);
});
console.log('programs:', JSON.stringify(progs, null, 1));
console.log('console errors/warns:', JSON.stringify([...new Set(errors)].slice(0, 10), null, 1));
await browser.close();
await vite.close();
