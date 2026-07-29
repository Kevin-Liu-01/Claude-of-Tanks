// TEMP fx r4 diagnostic 2 — pool buffer forensics after a frozen live kill,
// plus a REAL-TIME (unfrozen) live kill capture.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/fx_r4');
mkdirSync(outDir, { recursive: true });
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5600 + Math.floor(Math.random() * 90), strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function shot(name) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`[diag2] ${name}.png`);
}
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });

  // REAL-TIME live kill: no freezing at all. Stage, fire, then screenshot on
  // wall-clock time while the game runs.
  const kd = await page.evaluate(() => {
    const D = window.__DEBUG;
    D.startBattle('m1a2');
    D.rig.update(10, { mouseDX: 3, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false });
    D.aimAtNearest();
    D.fastForward(9);
    D.aimAtNearest();
    D.fastForward(2);
    const p = D.game.player;
    const tgt = D.game.tanks.find((tk) => tk.team === 'enemy' && tk.combat && !tk.combat.destroyed);
    const muz = D.rig.aimPoint.clone(); p.visual.gunMuzzleWorld(muz);
    const piv = D.rig.aimPoint.clone(); p.visual.gunPivotWorld(piv);
    const dir = muz.clone().sub(piv).normalize(); dir.y = 0; dir.normalize();
    tgt.state.pos.set(p.state.pos.x + dir.x * 42, p.state.pos.y + 1.2, p.state.pos.z + dir.z * 42);
    tgt.state.yaw = p.state.yaw + Math.PI / 2;
    tgt.combat.hp = 1;
    D.fastForward(0.8);
    D.aimAtNearest();
    D.fastForward(4.5);
    // camera fixed on the victim BEFORE the kill
    const v = D.rig.aimPoint.clone().set(tgt.state.pos.x, tgt.state.pos.y + 2.4, tgt.state.pos.z);
    const az = tgt.state.yaw + 2.3;
    const cam = v.clone(); cam.x += Math.sin(az) * 19; cam.z += Math.cos(az) * 19; cam.y += 4.0;
    D.rig.setExternalPose(cam, v, 45);
    const live = () => D.game.shells.some((s) => s.isPlayer && !s.dead);
    D.flags.forceFire = true;
    let steps = 0;
    for (; steps < 200 && !live(); steps++) D.fastForward(1 / 60);
    D.flags.forceFire = false;
    let fs = 0;
    for (; fs < 30 && !tgt.combat.destroyed; fs++) D.fastForward(1 / 60);
    window.__TGT = tgt;
    return { destroyed: tgt.combat.destroyed, tgtPos: [tgt.state.pos.x, tgt.state.pos.y, tgt.state.pos.z] };
  });
  console.log('[diag2] live stage:', JSON.stringify(kd));

  // pool forensics: for every instanced mesh in fx group, sample live slots
  const forensics = await page.evaluate(() => {
    const D = window.__DEBUG;
    const now = (() => { let t = 0; D.fx.update(0, [], D.camera); return null; })();
    const tgt = window.__TGT;
    const out = { uTimeGuess: null, pools: [] };
    D.fx.group.traverse((o) => {
      if (!o.geometry || !o.geometry.isInstancedBufferGeometry) return;
      const g = o.geometry;
      const aPB = g.getAttribute('aPB');
      if (!aPB) { out.pools.push({ cap: g._capacity, n: g.instanceCount, note: 'no aPB' }); return; }
      const lifeAttr = g.getAttribute('aVL') || g.getAttribute('aAL');
      const n = g.instanceCount;
      const rows = [];
      for (let i = Math.max(0, n - 4); i < n; i++) {
        rows.push({
          i,
          pos: [aPB.array[i * 4], aPB.array[i * 4 + 1], aPB.array[i * 4 + 2]].map((x) => Math.round(x * 10) / 10),
          birth: Math.round(aPB.array[i * 4 + 3] * 1000) / 1000,
          life: lifeAttr ? Math.round(lifeAttr.array[i * 4 + 3] * 100) / 100 : null,
        });
      }
      out.pools.push({ cap: g._capacity, n, rows, dToTgt: rows.length ? Math.round(Math.hypot(rows[rows.length-1].pos[0] - tgt.state.pos.x, rows[rows.length-1].pos[2] - tgt.state.pos.z)) : null });
    });
    return out;
  });
  console.log('[diag2] forensics:', JSON.stringify(forensics, null, 1));

  // real-time captures while the destruction runs live
  await shot('live_destroy_a');
  await sleep(350);
  await shot('live_destroy_b');
  await sleep(800);
  await shot('live_destroy_c');
  await sleep(2500);
  await shot('live_destroy_d');
} catch (e) {
  console.error('[diag2] FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (errs.length) { console.error(`[diag2] console errors (${errs.length}):`); for (const er of errs.slice(0, 15)) console.error('  ' + er); }
  await browser.close();
  await server.close();
}
