// physics lane scratch (never staged): the turret-pop hitch probe, A vs B, interleaved A B B A.
// Each arm's dist is served by `vite preview`; a solo battle on --map at desktop High; four enemies are brought in front
// of the player 24-40 m out and cooked off one at a time, 4 s apart, the same way in both arms: the destruction FX
// (tank:destroyed, cause ammorack) and the wreck look with the pop (visual.setDestroyed({ pop: true })); in an arm that
// has the turret bodies (game._wreckTurrets) the step's body is launched too, as a real death does. Frame intervals
// (rAF) from 1 s before to 3.5 s after each kill; per arm: p50, p95, p99, max, frames over 33 ms; the kill frame's own.
//   node .qa-dev/pop-hitch-probe.mjs --roots=<A dist root>,<B dist root> --labels=A,B --out=<dir> [--map=verdant] [--port=5470]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { preview } from 'vite';
import puppeteer from 'puppeteer';

const arg = (name, fallback = null) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const roots = arg('roots').split(',').map((r) => path.resolve(r));
const labels = arg('labels', 'A,B').split(',');
const out = path.resolve(arg('out'));
const map = arg('map', 'verdant');
const basePort = Number(arg('port', '5470'));
const order = (arg('order', '0,1,1,0')).split(',').map(Number);
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[pop-hitch ${new Date().toISOString().slice(11, 19)}]`, ...a);

async function runArm(index, pass) {
  const root = roots[index], label = labels[index];
  const server = await preview({ root, configFile: false, logLevel: 'error', preview: { host: '127.0.0.1', port: basePort + index, strictPort: true } });
  const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,900'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    await page.evaluateOnNewDocument(() => {
      try { localStorage.setItem('cot.settings.v1', JSON.stringify({ aiDifficulty: 'easy', quality: 'high' })); } catch { /* private */ }
    });
    await page.goto(`http://127.0.0.1:${basePort + index}/?debug=1&nosplash=1&map=${map}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction('window.__GAME_READY === true', { timeout: 300000 });
    await sleep(1500);
    await page.evaluate(() => window.__DEBUG.startBattle('m1a2'));
    await page.waitForFunction(() => window.__DEBUG.game?.phase === 'battle', { timeout: 300000 });
    await sleep(4000);
    const ids = await page.evaluate(() => {
      const g = window.__DEBUG.game, p = g.player, world = window.__DEBUG.world;
      const enemies = g.tanks.filter((t) => t.team === 'enemy' && t.state && !t.combat.destroyed).slice(0, 4);
      const fx = Math.sin(p.state.yaw), fz = Math.cos(p.state.yaw), rx = Math.cos(p.state.yaw), rz = -Math.sin(p.state.yaw);
      enemies.forEach((e, i) => {
        const d = 24 + (i % 2) * 14, side = (i - 1.5) * 10;
        const x = p.state.pos.x + fx * d + rx * side, z = p.state.pos.z + fz * d + rz * side;
        e.state.pos.set(x, world.heightField.getHeightAt(x, z), z);
        e.state.speed = 0;
        e.state.yaw = p.state.yaw + Math.PI / 2;
        if (e.aiCtl) e.aiCtl.disabled = true;
        e.input.fire = false;
      });
      return enemies.map((e) => e.id);
    });
    await sleep(2500);
    await page.evaluate(() => {
      window.__HITCH = { frames: [], on: true, t0: performance.now(), last: performance.now(), kills: [] };
      const tick = (now) => {
        const rec = window.__HITCH;
        if (!rec.on) return;
        rec.frames.push([now - rec.t0, now - rec.last]);
        rec.last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await sleep(1200);
    for (const id of ids) {
      await page.evaluate((victim) => {
        const D = window.__DEBUG, g = D.game, e = g.tankById.get(victim);
        if (!e || e.combat.destroyed) return;
        window.__HITCH.kills.push(performance.now() - window.__HITCH.t0);
        e.combat.hp = 0; e.combat.destroyed = true; e._destroyedAnnounced = true;
        e.visual?.setDestroyed?.({ pop: true });
        g._wreckTurrets?.launch?.(e, 'ammorack', Math.round(g.timeS * 60));
        D.bus?.emit?.('tank:destroyed', { id: e.id, specId: e.specId, pos: [e.state.pos.x, e.state.pos.y, e.state.pos.z],
          killerId: g.player?.id ?? null, cause: 'ammorack' });
      }, id);
      await sleep(4000);
    }
    const rec = await page.evaluate(() => { window.__HITCH.on = false; return window.__HITCH; });
    const windows = [];
    for (const k of rec.kills) {
      const inWin = rec.frames.filter(([t]) => t >= k && t < k + 3500).map(([, dt]) => dt);
      const before = rec.frames.filter(([t]) => t >= k - 1000 && t < k).map(([, dt]) => dt);
      const killFrame = rec.frames.find(([t]) => t >= k)?.[1] ?? null;
      windows.push({ inWin, before, killFrame });
    }
    const all = windows.flatMap((w) => w.inWin), base = windows.flatMap((w) => w.before);
    const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return +(s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0).toFixed(1); };
    const result = { label, pass, kills: rec.kills.length, hasBodies: await page.evaluate(() => !!window.__DEBUG.game._wreckTurrets),
      after: { n: all.length, p50: q(all, 0.5), p95: q(all, 0.95), p99: q(all, 0.99), max: q(all, 1), over33: all.filter((d) => d > 33.4).length },
      before: { n: base.length, p50: q(base, 0.5), p95: q(base, 0.95), max: q(base, 1) },
      killFrames: windows.map((w) => w.killFrame && +w.killFrame.toFixed(1)), errors: errors.slice(0, 3) };
    writeFileSync(path.join(out, `hitch-${pass}-${label}.json`), JSON.stringify({ ...result, frames: rec.frames, killsAt: rec.kills }));
    log(JSON.stringify(result));
    return result;
  } finally {
    await browser.close();
    await new Promise((r) => server.httpServer.close(r));
  }
}

const results = [];
for (let pass = 0; pass < order.length; pass++) results.push(await runArm(order[pass], pass));
writeFileSync(path.join(out, 'hitch-summary.json'), JSON.stringify(results.map(({ label, pass, after, before, killFrames, hasBodies }) => ({ label, pass, hasBodies, after, before, killFrames })), null, 1));
log('done');
