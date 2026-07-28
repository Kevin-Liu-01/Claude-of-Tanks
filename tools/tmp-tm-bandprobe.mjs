// tools/tmp-tm-bandprobe.mjs — tank_models r1 temp probe: load the game,
// stage tank_closeup_modern, and report every VISIBLE mesh near the player
// m1a2 whose bbox is track-band-shaped (long + low) to identify the giant
// floating track loops seen in the harness closeup.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, rmdirSync, statSync } from 'node:fs';

const LOCK_DIR = '/tmp/cot-shots.lock';
let lockHeld = false;
async function acquireLock() {
  const t0 = Date.now();
  for (;;) {
    try { mkdirSync(LOCK_DIR); lockHeld = true; return; } catch (_) { /* held */ }
    try { if (Date.now() - statSync(LOCK_DIR).mtimeMs > 300000) { rmdirSync(LOCK_DIR); continue; } } catch (_) { continue; }
    if (Date.now() - t0 > 600000) throw new Error('lock timeout');
    await new Promise((r) => setTimeout(r, 2000));
  }
}
await acquireLock();
process.on('exit', () => { if (lockHeld) try { rmdirSync(LOCK_DIR); } catch (_) {} });

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5990, strictPort: false } });
await server.listen();
const port = server.config.server.port;
const browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await page.evaluate("window.__SHOTS.set('tank_closeup_modern')");
await new Promise((r) => setTimeout(r, 3500));
const report = await page.evaluate(() => {
  const D = window.__DEBUG;
  const g = D && D.game;
  if (!g) return 'no game';
  const player = g.tankById.get('m1a2');
  const rootOf = (e) => (e && (e.visual && e.visual.root)) || null;
  const posOf = (e) => {
    const r = rootOf(e);
    if (!r) return { x: 0, y: 0, z: 0 };
    r.updateWorldMatrix(true, false);
    return { x: r.matrixWorld.elements[12], y: r.matrixWorld.elements[13], z: r.matrixWorld.elements[14] };
  };
  const pp = posOf(player);
  const out = [];
  const THREE_Box = null;
  const scene = D.scene || (D.renderer && null);
  const root = player ? (function r(n) { let m = n; return m; })(player.visual.root) : null;
  let sceneRoot = root;
  while (sceneRoot && sceneRoot.parent) sceneRoot = sceneRoot.parent;
  const rows = [];
  sceneRoot.traverse((o) => {
    if (!(o.isMesh || o.isInstancedMesh) || !o.visible) return;
    // visibility up the chain
    let vis = true;
    for (let p = o; p; p = p.parent) if (p.visible === false) { vis = false; break; }
    if (!vis) return;
    if (!o.geometry || !o.geometry.boundingBox) { if (o.geometry) o.geometry.computeBoundingBox(); else return; }
    const bb = o.geometry.boundingBox.clone();
    o.updateWorldMatrix(true, false);
    bb.applyMatrix4(o.matrixWorld);
    const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
    const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
    const d = Math.hypot(cx - pp.x, cz - pp.z);
    if (d > 25) return;
    const long = Math.max(sx, sz), tall = sy;
    if (long > 5.5 && tall < 2.2 && Math.min(sx, sz) < 1.6) {
      // walk up to a named ancestor / tank owner
      let path = [];
      for (let p = o; p && path.length < 6; p = p.parent) path.push(p.name || p.type);
      rows.push({ name: o.name || o.type, mat: o.material && o.material.name,
        path: path.join('<'), d: +d.toFixed(1), size: [sx, sy, sz].map((v) => +v.toFixed(2)) });
    }
  });
  // also list tank entities near player
  const tanks = [];
  for (const [id, ent] of g.tankById) {
    const q = posOf(ent);
    const dd = Math.hypot(q.x - pp.x, q.z - pp.z);
    if (dd < 30) tanks.push({ id, d: +dd.toFixed(1) });
  }
  return { rows, tanks };
});
console.log(JSON.stringify(report, null, 1));
await browser.close();
await server.close();
process.exit(0);
