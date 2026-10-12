// physics lane scratch (never staged): a live solo battle, the enemies brought in front of the player and cooked off
// through the step's turret bodies (__DEBUG.slayEnemies('ammorack')). Records, per animation frame, the frame interval,
// each victim's body pose (game._wreckTurrets) against its drawn turret, and screenshots.
//   node .qa-dev/live-pop-probe.mjs --url=http://127.0.0.1:5733 --out=<dir> [--map=verdant] [--cause=ammorack]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const arg = (name, fallback = null) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const base = arg('url', 'http://127.0.0.1:5733');
const out = path.resolve(arg('out'));
const map = arg('map', 'verdant');
const cause = arg('cause', 'ammorack');
const victims = Number(arg('victims', '3'));
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,720'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  await page.goto(`${base}/?debug=1&nosplash=1&map=${map}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 300000 });
  await sleep(1500);
  await page.evaluate(() => window.__DEBUG.startBattle('m1a2'));
  await page.waitForFunction(() => window.__DEBUG.game?.phase === 'battle', { timeout: 300000 });
  await sleep(3000);
  // bring `victims` enemies in front of the player, 22-34 m out, broadside
  const setup = await page.evaluate((count) => {
    const g = window.__DEBUG.game;
    const p = g.player;
    const enemies = g.tanks.filter((t) => t.team === 'enemy' && t.state && !t.combat.destroyed).slice(0, count);
    const fx = Math.sin(p.state.yaw), fz = Math.cos(p.state.yaw);
    const rx = Math.cos(p.state.yaw), rz = -Math.sin(p.state.yaw);
    const world = window.__DEBUG.world;
    enemies.forEach((e, i) => {
      const d = 24 + i * 5, side = (i - (count - 1) / 2) * 9;
      const x = p.state.pos.x + fx * d + rx * side, z = p.state.pos.z + fz * d + rz * side;
      const y = world.heightField.getHeightAt(x, z);
      e.state.pos.set(x, y, z);
      e.state.speed = 0;
      e.state.yaw = p.state.yaw + Math.PI / 2;
      if (e.aiCtl) e.aiCtl.disabled = true;
    });
    return enemies.map((e) => e.id);
  }, victims);
  await sleep(1500);
  // per-frame recorder
  await page.evaluate((ids) => {
    const g = window.__DEBUG.game;
    const sc = window.__DEBUG.scene;
    const pose = new Float64Array(7);
    window.__POP = { frames: [], on: true, t0: performance.now(), last: performance.now(), killAt: null };
    const turretOf = (e) => { let hit = null; e.visual?.root?.traverse((o) => { if (!hit && o.name === 'rig_turret') hit = o; }); return hit; };
    const turrets = new Map(ids.map((id) => [id, turretOf(g.tankById.get(id))]));
    const tick = (now) => {
      const rec = window.__POP;
      if (!rec.on) return;
      const frame = { t: now - rec.t0, dt: now - rec.last, bodies: [] };
      rec.last = now;
      for (const id of ids) {
        const t = turrets.get(id);
        if (!t) continue;
        t.updateWorldMatrix(true, false);
        const e = t.matrixWorld.elements;
        const has = g._wreckTurrets?.framePose(id, pose);
        frame.bodies.push({ id, drawn: [e[12], e[13], e[14]].map((v) => +v.toFixed(3)), body: has ? [...pose].slice(0, 3).map((v) => +v.toFixed(3)) : null, asleep: !!g._wreckTurrets?.settled(id) });
      }
      rec.frames.push(frame);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    void sc;
  }, setup);
  await sleep(2000);
  await page.evaluate((c) => { window.__POP.killAt = performance.now() - window.__POP.t0; window.__DEBUG.slayEnemies(c); }, cause);
  for (let k = 0; k < 6; k++) {
    await sleep(700);
    await page.screenshot({ path: path.join(out, `shot-${k}.png`) });
  }
  await sleep(2500);
  const rec = await page.evaluate(() => { window.__POP.on = false; return window.__POP; });
  writeFileSync(path.join(out, 'frames.json'), JSON.stringify(rec));
  const before = rec.frames.filter((f) => f.t < rec.killAt && f.t > rec.killAt - 1800).map((f) => f.dt);
  const after = rec.frames.filter((f) => f.t >= rec.killAt && f.t < rec.killAt + 3000).map((f) => f.dt);
  const stat = (a) => { const s = [...a].sort((x, y) => x - y); return { n: s.length, p50: +(s[Math.floor(s.length / 2)] ?? 0).toFixed(1), p95: +(s[Math.floor(s.length * 0.95)] ?? 0).toFixed(1), max: +(s.at(-1) ?? 0).toFixed(1) }; };
  // drawn vs body after the kill (the presentation interpolates between steps: within a step's travel)
  let worstGap = 0, frames = 0;
  for (const f of rec.frames) for (const b of f.bodies) if (b.body) {
    frames++;
    worstGap = Math.max(worstGap, Math.hypot(b.drawn[0] - b.body[0], b.drawn[1] - b.body[1], b.drawn[2] - b.body[2]));
  }
  const last = rec.frames.at(-1);
  console.log(JSON.stringify({ victims: setup, before: stat(before), after: stat(after), drawnVsBody: { frames, worstGapM: +worstGap.toFixed(3) },
    final: last?.bodies, errors: errors.slice(0, 5) }, null, 1));
} finally {
  await browser.close();
}
