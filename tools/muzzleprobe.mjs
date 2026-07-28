// TEMP: measure gunMuzzleWorld vs the furthest gun-mesh vertex along the bore.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5990, strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 640, height: 360 });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
const out = await page.evaluate(() => {
  const D = window.__DEBUG;
  window.__SHOTS.set('combat_firing');
  const res = {};
  for (const id of ['m1a2', 'tiger1', 't90m', 'leo2a7', 'is2']) {
    const ent = D.game.tankById.get(id);
    if (!ent) continue;
    const p = ent.visual;
    const muz = D.rig.aimPoint.clone(); p.gunMuzzleWorld(muz);
    const piv = D.rig.aimPoint.clone(); p.gunPivotWorld(piv);
    const dir = muz.clone().sub(piv).normalize();
    // furthest vertex along dir across every mesh under the gun/recoil group
    let recoilG = null;
    p.root.traverse((o) => { if (!recoilG && o.isObject3D && o.children.some((c) => c.isMesh) && o.parent && o.parent !== p.root) {} });
    // walk up from the muzzle node instead: its parent is the recoil group
    let mNode = null;
    p.root.traverse((o) => { if (!mNode && o.isObject3D && o.children.length === 0 && Math.abs(o.getWorldPosition(D.rig.aimPoint.clone()).distanceTo(muz)) < 1e-3) mNode = o; });
    const rG = mNode ? mNode.parent : null;
    let best = -1e9;
    const v = D.rig.aimPoint.clone();
    (rG || p.root).traverse((m) => {
      if (!m.isMesh || !m.geometry || !m.geometry.getAttribute) return;
      const pos = m.geometry.getAttribute('position');
      if (!pos) return;
      m.updateWorldMatrix(true, false);
      const step = Math.max(1, Math.floor(pos.count / 4000));
      for (let i = 0; i < pos.count; i += step) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(m.matrixWorld);
        const d = v.sub(piv).dot(dir);
        if (d > best) best = d;
      }
    });
    const muzD = muz.clone().sub(piv).dot(dir);
    res[id] = { muzzleAlongBore: +muzD.toFixed(3), furthestVertex: +best.toFixed(3), gap: +(muzD - best).toFixed(3), scanned: rG ? 'recoilGroup' : 'root' };
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
await server.close();
