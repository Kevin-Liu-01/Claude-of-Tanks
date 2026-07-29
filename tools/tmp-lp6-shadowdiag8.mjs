// TEMP lighting_post r6: property bisect — which attribute makes a caster work?
// Variants side by side: plain box | CSM-setup material box | InstancedMesh box |
// alphaTest box | box parented under vegetation group.
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const vite = await createServer({
  server: { port: 5699, hmr: false, watch: { ignored: ['**/*'] } },
  logLevel: 'silent',
});
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5699/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate("window.__SHOTS.set('player_view')");
await new Promise((r) => setTimeout(r, 1200));

const dump = await page.evaluate(async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const D = window.__DEBUG;
  const cam = D.camera;
  const fwd = new THREE.Vector3();
  cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
  const hf = D.world.heightField;
  const base = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 30);
  const world = D.scene.children.find((c) => c.name && c.name.startsWith('world'));
  const veg = world.children.find((c) => c.name === 'vegetation');

  const geo = new THREE.BoxGeometry(1.5, 6, 1.5);
  const mk = (i, mat, parent, instanced) => {
    const p = base.clone().addScaledVector(right, (i - 2) * 8);
    const y = hf.getHeightAt(p.x, p.z);
    let mesh;
    if (instanced) {
      mesh = new THREE.InstancedMesh(geo, mat, 1);
      const m4 = new THREE.Matrix4().setPosition(p.x, y + 3, p.z);
      mesh.setMatrixAt(0, m4);
      mesh.instanceMatrix.needsUpdate = true;
    } else {
      mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.x, y + 3, p.z);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    (parent || D.scene).add(mesh);
    return mesh;
  };
  // V0 plain
  mk(0, new THREE.MeshStandardMaterial({ color: 0xd04040 }), null, false);
  // V1 CSM setupShadowMaterial
  const m1 = new THREE.MeshStandardMaterial({ color: 0x40d040 });
  D.lighting.setupShadowMaterial(m1);
  mk(1, m1, null, false);
  // V2 instanced
  mk(2, new THREE.MeshStandardMaterial({ color: 0x4040d0 }), null, true);
  // V3 alphaTest
  mk(3, new THREE.MeshStandardMaterial({ color: 0xd0d040, alphaTest: 0.44 }), null, false);
  // V4 parented under vegetation group
  mk(4, new THREE.MeshStandardMaterial({ color: 0xd040d0 }), veg, false);
  D.lighting.update(true);
  return { vegName: veg ? veg.name : null };
});
console.log(JSON.stringify(dump));
await new Promise((r) => setTimeout(r, 600));
writeFileSync('shots/_lp6_pv_variants.png', await page.screenshot({ type: 'png' }));
await browser.close();
await vite.close();
