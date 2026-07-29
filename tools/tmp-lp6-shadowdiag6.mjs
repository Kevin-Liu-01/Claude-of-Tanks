// TEMP lighting_post r6: identify pole/house/fence/tree meshes via raycast and
// dump their full shadow-relevant state.
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const vite = await createServer({
  server: { port: 5697, hmr: false, watch: { ignored: ['**/*'] } },
  logLevel: 'silent',
});
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5697/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate("window.__SHOTS.set('player_view')");
await new Promise((r) => setTimeout(r, 1200));

const dump = await page.evaluate(async () => {
  let THREE;
  try { THREE = await import('/node_modules/.vite/deps/three.js'); } catch (e) { return { err: 'import three: ' + String(e) }; }
  const D = window.__DEBUG;
  const rc = new THREE.Raycaster();
  rc.far = 4000;
  const pts = {
    bigPole: [1452, 470],
    housewall: [990, 420],
    fence: [690, 620],
    treeTrunk: [175, 320],
    hayBale: [1130, 390],
  };
  const out = {};
  for (const [label, [px, py]] of Object.entries(pts)) {
    const ndc = new THREE.Vector2((px / 1920) * 2 - 1, -(py / 1080) * 2 + 1);
    rc.setFromCamera(ndc, D.camera);
    const hits = rc.intersectObjects(D.scene.children, true);
    const h = hits.find((x) => x.object.isMesh || x.object.isInstancedMesh);
    if (!h) { out[label] = null; continue; }
    const o = h.object;
    const m = o.material;
    out[label] = {
      dist: +h.distance.toFixed(1),
      type: o.isInstancedMesh ? `inst x${o.count}` : 'mesh',
      name: o.name || '(anon)',
      parentChain: (() => { const c = []; let p = o; while (p) { c.push(p.name || p.type); p = p.parent; } return c.join('<'); })(),
      castShadow: o.castShadow,
      receiveShadow: o.receiveShadow,
      frustumCulled: o.frustumCulled,
      layersMask: o.layers.mask,
      matType: m && m.type,
      side: m && m.side,
      transparent: m && !!m.transparent,
      alphaTest: m && m.alphaTest,
      depthWrite: m && m.depthWrite,
      visible: o.visible,
      hasCustomDepth: !!o.customDepthMaterial,
      bsRadius: o.geometry.boundingSphere ? +o.geometry.boundingSphere.radius.toFixed(1) : null,
    };
  }
  out.lightLayers = D.lighting.csm.lights.map((l) => [l.layers.mask, l.shadow.camera.layers.mask]);
  out.shadowMapEnabled = D.renderer.shadowMap.enabled;
  out.shadowMapAutoUpdate = D.renderer.shadowMap.autoUpdate;
  out.shadowMapType = D.renderer.shadowMap.type;
  return out;
});
console.log(JSON.stringify(dump, null, 1));
await browser.close();
await vite.close();
