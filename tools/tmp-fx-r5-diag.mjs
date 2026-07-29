// TEMP fx r5 diagnostic — deterministic live-path kill of the m1a2_tusk
// (exact announceDestroyed sequence), then dump turretG subtree + frames.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/fx_r5_diag');
mkdirSync(outDir, { recursive: true });

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 5700 + Math.floor(Math.random() * 90), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
async function shot(name) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`[diag] ${name}.png`);
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  await page.evaluate(() => { window.__DEBUG.startBattle('m1a2'); });
  await new Promise((r) => setTimeout(r, 4500)); // flyby + async GLB swaps settle

  const info = await page.evaluate(() => {
    const D = window.__DEBUG;
    D.game.phase = 'battle';
    D.fx.setFrozen(false);
    D.rig.release();
    const tgt = D.game.tanks.find((tk) => tk.team === 'enemy' && tk.specId === 'm1a2_tusk' && tk.combat && !tk.combat.destroyed)
      || D.game.tanks.find((tk) => tk.team === 'enemy' && tk.combat && !tk.combat.destroyed);
    // pre-kill turretG dump
    const root = tgt.visual.root;
    const V3 = tgt.state.pos.constructor;
    const findTurretG = () => {
      let tg = null;
      root.traverse((o) => { if (!tg && o.children && o.children.some((c) => /TurretPivot/i.test(c.name || ''))) tg = o; });
      return tg;
    };
    const tg = findTurretG();
    const sub = [];
    if (tg) {
      const walk = (o, d) => {
        const wp = o.getWorldPosition(new V3());
        sub.push(`${'  '.repeat(d)}${o.isMesh ? 'Mesh' : 'Grp'} "${o.name || '(anon)'}" vis=${o.visible} n=${o.children.length} localPos=${o.position.x.toFixed(2)},${o.position.y.toFixed(2)},${o.position.z.toFixed(2)} wy=${wp.y.toFixed(2)}${o.isMesh ? ' mat=' + (o.material.name || o.material.type) : ''}`);
        if (d < 3) o.children.forEach((c) => walk(c, d + 1));
      };
      walk(tg, 0);
    }
    // camera
    const v = D.rig.aimPoint.clone().set(tgt.state.pos.x, tgt.state.pos.y + 2.6, tgt.state.pos.z);
    const az = tgt.state.yaw + 2.4;
    const cam = v.clone(); cam.x += Math.sin(az) * 20; cam.z += Math.cos(az) * 20; cam.y += 4.5;
    D.rig.setExternalPose(cam, v, 45);
    D.fx.setFrozen(true, 900);
    // EXACT live-kill sequence (state.js announceDestroyed)
    tgt.combat.hp = 0;
    tgt.combat.destroyed = true;
    tgt._destroyedAnnounced = true;
    tgt.visual.setDestroyed({ pop: false });
    D.bus.emit('tank:destroyed', {
      id: tgt.id, specId: tgt.specId,
      pos: [tgt.state.pos.x, tgt.state.pos.y, tgt.state.pos.z],
      killerId: D.game.player.id, cause: 'shot',
    });
    D.game.phase = 'shot';
    return { specId: tgt.specId, id: tgt.id, hasTG: !!tg, sub };
  });
  console.log('[diag] victim:', info.specId, 'turretG found:', info.hasTG);
  for (const l of info.sub) console.log('   ' + l);

  let t = 0;
  for (const age of [0.1, 0.55, 0.9, 2.5]) {
    const dump = await page.evaluate((o) => {
      const D = window.__DEBUG;
      D.game.phase = 'battle';
      if (o.dt > 0) D.fastForward(o.dt);
      D.game.phase = 'shot';
      D.fx.setFrozen(true, 900 + o.age);
      // dump turret pose
      const tgt = D.game.tanks.find((tk) => tk.id === o.id);
      const root = tgt.visual.root;
      const V3 = tgt.state.pos.constructor;
      let tg = null;
      root.traverse((n) => { if (!tg && n.children && n.children.some((c) => /TurretPivot/i.test(c.name || ''))) tg = n; });
      if (!tg) return ['no turretG'];
      const out = [`turretG pos=${tg.position.x.toFixed(2)},${tg.position.y.toFixed(2)},${tg.position.z.toFixed(2)} rotY=${tg.rotation.y.toFixed(2)} rotZ=${tg.rotation.z.toFixed(2)}`];
      tg.traverse((n) => {
        if (n.isMesh && n.visible) {
          const wp = n.getWorldPosition(new V3());
          out.push(`  vismesh "${n.name}" wy=${wp.y.toFixed(2)} mat=${(n.material.name || n.material.type).slice(0, 26)}`);
        }
      });
      return out.slice(0, 12);
    }, { dt: age - t, age, id: info.id });
    t = age;
    console.log(`[diag] @${age}s:`); for (const l of dump) console.log('   ' + l);
    await shot(`kill_${String(age).replace('.', '_')}s`);
  }
} catch (e) {
  console.error('[diag] FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (errs.length) { console.error(`[diag] console errors (${errs.length}):`); for (const er of errs.slice(0, 15)) console.error('  ' + er); }
  await browser.close();
  await server.close();
}
