// TEMP lighting_post r6: read the CSM per-material uniforms for terrain vs veg,
// compare against live camera/breaks; then csm.updateFrustums() and re-shoot.
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const vite = await createServer({
  server: { port: 5707, hmr: false, watch: { ignored: ['**/*'] } },
  logLevel: 'silent',
});
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5707/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate("window.__SHOTS.set('player_view')");
await new Promise((r) => setTimeout(r, 1200));

const res = await page.evaluate(() => {
  const D = window.__DEBUG;
  const csm = D.lighting.csm;
  const world = D.scene.children.find((c) => c.name && c.name.startsWith('world'));
  const terr = world.children.find((c) => c.name === 'terrain');
  let terrMat = null;
  terr.traverse((o) => { if (!terrMat && o.isMesh && o.material && o.material.isMeshStandardMaterial) terrMat = o.material; });
  const veg = world.children.find((c) => c.name === 'vegetation');
  let vegMat = null;
  veg.traverse((o) => { if (!vegMat && o.isInstancedMesh && o.castShadow && o.receiveShadow && o.material.isMeshStandardMaterial) vegMat = o.material; });

  const shaders = csm.shaders || csm._shaders;
  const dump = (mat, label) => {
    if (!mat) return { label, err: 'nomat' };
    const sh = shaders && shaders.get(mat);
    if (!sh) return { label, err: 'not-registered-or-null', registered: shaders ? shaders.has(mat) : 'no-map' };
    return {
      label,
      cascades: sh.uniforms.CSM_cascades.value.map((v) => [+v.x.toFixed(4), +v.y.toFixed(4)]),
      cameraNear: sh.uniforms.cameraNear.value,
      shadowFar: sh.uniforms.shadowFar.value,
    };
  };
  const live = [];
  csm._getExtendedBreaks ? csm._getExtendedBreaks(live) : null;
  return {
    camera: { near: D.camera.near, far: D.camera.far, fov: D.camera.fov },
    maxFar: csm.maxFar,
    liveBreaks: live.map((v) => [+v.x.toFixed(4), +v.y.toFixed(4)]),
    registeredCount: shaders ? shaders.size : -1,
    terrain: dump(terrMat, 'terrain'),
    veg: dump(vegMat, 'veg'),
  };
});
console.log(JSON.stringify(res, null, 1));

// now refresh uniforms via updateFrustums and re-shoot
await page.evaluate(() => {
  window.__DEBUG.lighting.updateFrustums();
  window.__DEBUG.lighting.update(true);
});
await new Promise((r) => setTimeout(r, 500));
writeFileSync('shots/_lp6_after_updfrustums.png', await page.screenshot({ type: 'png' }));
await browser.close();
await vite.close();
