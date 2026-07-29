// TEMP lighting_post r6: (1) raw renderer.render with injected box — shadow?
// (2) fresh own DirectionalLight shadow — does terrain receive at all from a
//     non-CSM light? (3) box wearing the props' own material.
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const vite = await createServer({
  server: { port: 5703, hmr: false, watch: { ignored: ['**/*'] } },
  logLevel: 'silent',
});
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5703/', { waitUntil: 'domcontentloaded' });
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
  const world = D.scene.children.find((c) => c.name && c.name.startsWith('world'));
  const props = world.children.find((c) => c.name === 'props');
  // grab a merged props material (the house bucket mat)
  let propsMat = null;
  props.traverse((o) => { if (!propsMat && o.isMesh && !o.isInstancedMesh && o.castShadow && o.material.isMeshStandardMaterial) propsMat = o.material; });

  const geo = new THREE.BoxGeometry(1.5, 6, 1.5);
  const put = (i, mat) => {
    const p = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 22).addScaledVector(right, (i - 1) * 7);
    const y = hf.getHeightAt(p.x, p.z);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.x, y + 3, p.z);
    mesh.castShadow = true;
    D.scene.add(mesh);
    return mesh;
  };
  put(0, new THREE.MeshStandardMaterial({ color: 0xc04040 }));
  put(2, propsMat || new THREE.MeshStandardMaterial({ color: 0x4040c0 }));
  return { propsMatFound: !!propsMat, alphaTest: propsMat && propsMat.alphaTest, hasMap: !!(propsMat && propsMat.map) };
});
console.log('setup:', JSON.stringify(res));
await new Promise((r) => setTimeout(r, 400));
writeFileSync('shots/_lp6_raw1.png', await page.screenshot({ type: 'png' }));

// (2) fresh own shadow light aligned with the sun, high intensity so its
// shadow is obvious; CSM materials will recompile (light count change) but
// we only care whether ANY shadow from a plain light lands on the terrain.
await page.evaluate(async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const D = window.__DEBUG;
  const dl = new THREE.DirectionalLight(0xffffff, 2.5);
  dl.castShadow = true;
  dl.shadow.mapSize.set(2048, 2048);
  dl.shadow.camera.left = -60; dl.shadow.camera.right = 60;
  dl.shadow.camera.top = 60; dl.shadow.camera.bottom = -60;
  dl.shadow.camera.near = 1; dl.shadow.camera.far = 500;
  const cam = D.camera;
  const fwd = new THREE.Vector3();
  cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const target = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 25);
  dl.position.copy(target).add(new THREE.Vector3(60, 80, -40));
  dl.target.position.copy(target);
  D.scene.add(dl); D.scene.add(dl.target);
});
await new Promise((r) => setTimeout(r, 800));
writeFileSync('shots/_lp6_raw2.png', await page.screenshot({ type: 'png' }));
await browser.close();
await vite.close();
