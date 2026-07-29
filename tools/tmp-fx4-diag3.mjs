// TEMP fx r4 diagnostic 3 — frozen-flow pool forensics (critic destroy2 flow).
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const outDir = resolve('shots/fx_r4');
mkdirSync(outDir, { recursive: true });
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5600 + Math.floor(Math.random() * 90), strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('[pageerror]', String(e)));
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
  const out = await page.evaluate(() => {
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
    D.fx.setFrozen(true, 900);
    const live = () => D.game.shells.some((s) => s.isPlayer && !s.dead);
    D.flags.forceFire = true;
    let steps = 0;
    for (; steps < 200 && !live(); steps++) D.fastForward(1 / 60);
    D.flags.forceFire = false;
    let fs = 0;
    for (; fs < 30 && !tgt.combat.destroyed; fs++) D.fastForward(1 / 60);
    D.fx.setFrozen(true, 900 + (steps + fs) / 60 + 0.3); // pin at fireball mid-life
    // forensics on the two cap-256 pools (billow + debris) and fire pool
    const pools = [];
    D.fx.group.traverse((o) => {
      if (!o.geometry || !o.geometry.isInstancedBufferGeometry) return;
      const g = o.geometry;
      const aPB = g.getAttribute('aPB');
      if (!aPB) return;
      const lifeA = g.getAttribute('aVL') || g.getAttribute('aAL');
      const n = g.instanceCount;
      const rows = [];
      for (let i = Math.max(0, n - 6); i < n; i++) {
        rows.push([i,
          Math.round(aPB.array[i * 4] * 10) / 10,
          Math.round(aPB.array[i * 4 + 1] * 10) / 10,
          Math.round(aPB.array[i * 4 + 2] * 10) / 10,
          Math.round(aPB.array[i * 4 + 3] * 100) / 100,
          lifeA ? Math.round(lifeA.array[i * 4 + 3] * 100) / 100 : -1]);
      }
      pools.push({ cap: g._capacity, blend: o.material.blending, n, rows });
    });
    return {
      steps, fs, destroyed: tgt.combat.destroyed,
      tgt: [Math.round(tgt.state.pos.x), Math.round(tgt.state.pos.y), Math.round(tgt.state.pos.z)],
      pools,
    };
  });
  console.log(JSON.stringify(out, null, 1));
} catch (e) {
  console.error('[diag3] FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
