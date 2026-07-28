// TEMP r5 lighting_post diagnosis probe:
//  1. battlefield near-white ground bisect (fog / aerial / env / gtao)
//  2. combat_firing muzzle anchor vs GLB tube centerline offset
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5991, strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

async function sampleRegion(tag) {
  await settle(1400);
  const shot = await page.screenshot({ type: 'png', encoding: 'base64' });
  const stats = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    const reg = (rx, ry, rw, rh) => {
      const d = x.getImageData(rx, ry, rw, rh).data;
      let r = 0, g = 0, b = 0, n = 0, white = 0;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        if (d[i] > 210 && d[i + 1] > 210 && d[i + 2] > 200) white++;
      }
      return { mean: [(r / n) | 0, (g / n) | 0, (b / n) | 0], pctWhite: +(100 * white / n).toFixed(1) };
    };
    return { right: reg(1300, 650, 500, 250), left: reg(200, 650, 350, 250) };
  }, shot);
  console.log(tag, JSON.stringify(stats));
  return shot;
}

// ---- battlefield white-ground bisect --------------------------------------
await page.evaluate(() => { window.__SHOTS.set('battlefield'); });
const base = await sampleRegion('baseline    ');
writeFileSync('shots/crops_r5lp/probe_baseline.png', Buffer.from(base, 'base64'));

await page.evaluate(() => { const D = window.__DEBUG; D.scene.fog = null; });
await sampleRegion('no-fog      ');

await page.evaluate(() => {
  const D = window.__DEBUG;
  const aerial = D.post.composer.passes.find((p) => p.material && p.material.name === 'AerialPerspectiveShader');
  if (aerial) aerial.enabled = false;
});
await sampleRegion('no-aerial   ');

await page.evaluate(() => { window.__DEBUG.post.gtao.enabled = false; });
await sampleRegion('no-gtao     ');

await page.evaluate(() => { window.__DEBUG.scene.environment = null; });
await sampleRegion('no-env      ');

await page.evaluate(() => { window.__DEBUG.scene.environmentIntensity = 99; }); // sanity: does env matter at all
await sampleRegion('env-99(sanity)');

// restore for muzzle test
await page.evaluate(() => { window.__DEBUG.scene.environmentIntensity = 0.32; });

// ---- combat_firing muzzle anchor offset -----------------------------------
const muz = await page.evaluate(() => {
  const D = window.__DEBUG;
  window.__SHOTS.set('combat_firing');
  const THREEV = D.rig.aimPoint.constructor; // Vector3 class
  const p = D.game.player.visual;
  const muzW = new THREEV(); p.gunMuzzleWorld(muzW);
  const pivW = new THREEV(); p.gunPivotWorld(pivW);
  // find muzzle node + recoil group
  let mNode = null;
  const tmp = new THREEV();
  p.root.traverse((o) => {
    if (!mNode && o.children.length === 0 && !o.isMesh && o.getWorldPosition(tmp).distanceTo(muzW) < 1e-4) mNode = o;
  });
  const rG = mNode ? mNode.parent : null;
  if (!rG) return { err: 'no muzzle node' };
  rG.updateMatrixWorld(true);
  const inv = rG.matrixWorld.clone().invert();
  // gun tube tip centroid: verts in recoilG space within 0.4 of max z
  let tipZ = -Infinity;
  const rel = [];
  rG.traverse((m) => {
    if (!m.isMesh || !m.geometry.getAttribute) return;
    const pos = m.geometry.getAttribute('position');
    const relM = inv.clone().multiply(m.matrixWorld);
    const step = Math.max(1, Math.floor(pos.count / 8000));
    for (let i = 0; i < pos.count; i += step) {
      tmp.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(relM);
      rel.push([tmp.x, tmp.y, tmp.z]);
      if (tmp.z > tipZ) tipZ = tmp.z;
    }
  });
  let cx = 0, cy = 0, n = 0;
  for (const [x, y, z] of rel) {
    if (z > tipZ - 0.4) { cx += x; cy += y; n++; }
  }
  cx /= n; cy /= n;
  // where is the muzzle node in recoilG space?
  const mLocal = mNode.position;
  // project muzzle world + corrected tip world to screen
  const cam = D.camera;
  const proj = (v) => {
    const c = v.clone().project(cam);
    return [((c.x + 1) / 2 * 1920) | 0, ((1 - c.y) / 2 * 1080) | 0];
  };
  const tipWorld = new THREEV(cx, cy, tipZ).applyMatrix4(rG.matrixWorld);
  return {
    playerSpec: D.game.player.specId,
    muzzleLocal: [mLocal.x, mLocal.y, mLocal.z].map((v) => +v.toFixed(3)),
    tubeTipCentroidLocal: [+cx.toFixed(3), +cy.toFixed(3), +tipZ.toFixed(3)],
    muzzleScreen: proj(muzW),
    tubeTipScreen: proj(tipWorld),
    pivotScreen: proj(pivW),
    tipSampleCount: n,
  };
});
console.log('muzzle', JSON.stringify(muz, null, 1));

await browser.close();
await server.close();
