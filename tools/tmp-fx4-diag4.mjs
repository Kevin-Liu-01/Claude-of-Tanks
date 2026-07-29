// TEMP fx r4 diagnostic 4 — trap whoever rewrites the particle clock mid-kill.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

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
    // trap setFrozen with stack capture
    const orig = D.fx.setFrozen.bind(D.fx);
    const calls = [];
    D.fx.setFrozen = (f, at = null) => {
      calls.push({ f, at, stack: (new Error()).stack.split('\n').slice(2, 5).join(' | ') });
      return orig(f, at);
    };
    const uTimeOf = () => {
      let v = null;
      D.fx.group.traverse((o) => {
        if (v === null && o.material && o.material.uniforms && o.material.uniforms.uTime) v = o.material.uniforms.uTime.value;
      });
      return v;
    };
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
    const t0 = uTimeOf();
    const live = () => D.game.shells.some((s) => s.isPlayer && !s.dead);
    D.flags.forceFire = true;
    let steps = 0;
    const trace = [];
    for (; steps < 200 && !live(); steps++) {
      D.fastForward(1 / 60);
      trace.push(uTimeOf());
    }
    D.flags.forceFire = false;
    let fs = 0;
    for (; fs < 30 && !tgt.combat.destroyed; fs++) {
      D.fastForward(1 / 60);
      trace.push(uTimeOf());
    }
    return { t0, steps, fs, trace: trace.slice(-8), calls };
  });
  console.log(JSON.stringify(out, null, 1));
} catch (e) {
  console.error('[diag4] FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
