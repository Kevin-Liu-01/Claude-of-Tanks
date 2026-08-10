// The Mobile QA Lap (docs/MOBILE-QA.md): a deterministic real-time session
// on emulated-iPhone headless Chrome, instrumented for main-thread health.
// Stations: garage_idle, tank_switch, battle_load, look, drive, fire,
// fight (+spot reveals), rematch. Emits a JSON scorecard with per-station
// long tasks, rAF gaps, renderer.info deltas, heap, sim-time — and budget
// pass/fail flags (ratified 2026-08-07).
// Usage: node tools/mobilelap.mjs [--out scorecard.json] [--tank m2a2_bradley]
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (n, f) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : f; };
const OUT = opt('out', '');
const TANK = opt('tank', 'm2a2_bradley');

// FEEL r12: gapP95 budgets added — the long-task budgets went green while
// steady frame time sat at 20-26 ms (~40-50 fps) and the game FELT laggy.
// 20 ms p95 = a 50+ fps floor; sim-time deltas flag host-throttle runs.
const BUDGET = {
  garage_idle: { ltfPctMin: 95 },
  tank_switch: { worstMs: 250 },
  battle_load: { wallMs: 8000 },
  look: { over100Per10s: 0, gapP95: 20 },
  drive: { over100Per10s: 0, gapP95: 20 },
  fire: { over100Per10s: 0, gapP95: 20 },
  fight: { over100Per10s: 0, revealWorstMs: 50, gapP95: 20 },
  rematch: { wallMs: 8000 },
};

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 5780, strictPort: false },
  optimizeDeps: {
    entries: ['index.html'],
    include: ['three', 'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js'],
  },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({
  headless: 'new', protocolTimeout: 600000,
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.emulate({
  viewport: { width: 892, height: 412, isMobile: true, hasTouch: true, isLandscape: true, deviceScaleFactor: 3 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
});
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
const cdp = await page.createCDPSession();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 360000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 360000 });

// ---- in-page instrumentation ----------------------------------------------
await page.evaluate(() => {
  const M = window.__LAP = {
    station: null, stations: {}, spotted: [],
    _raf: 0, _lastT: 0,
  };
  M.obs = new PerformanceObserver((list) => {
    const st = M.station && M.stations[M.station];
    if (!st) return;
    for (const e of list.getEntries()) st.tasks.push({ t: +e.startTime.toFixed(0), d: +e.duration.toFixed(0) });
  });
  M.obs.observe({ entryTypes: ['longtask'] });
  const rafLoop = (t) => {
    const st = M.station && M.stations[M.station];
    if (st && M._lastT) st.gaps.push(t - M._lastT);
    M._lastT = t;
    M._raf = requestAnimationFrame(rafLoop);
  };
  M._raf = requestAnimationFrame(rafLoop);
  window.__DEBUG.bus.on('tank:spotted', (ev) => {
    M.spotted.push({ wall: performance.now(), station: M.station, ev: ev && ev.id });
  });
  M.info = () => {
    const r = window.__DEBUG.renderer;
    return {
      programs: (r.info.programs || []).length,
      textures: r.info.memory.textures,
      geometries: r.info.memory.geometries,
      calls: r.info.render.calls,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : -1,
    };
  };
  M.begin = (name) => {
    M.stations[name] = {
      tasks: [], gaps: [], t0: performance.now(),
      sim0: window.__DEBUG.game.timeS || 0, info0: M.info(),
    };
    M.station = name;
  };
  M.end = () => {
    const st = M.stations[M.station];
    st.t1 = performance.now();
    st.sim1 = window.__DEBUG.game.timeS || 0;
    st.info1 = M.info();
    M.station = null;
  };
});

const begin = (n) => page.evaluate((x) => window.__LAP.begin(x), n);
const end = () => page.evaluate(() => window.__LAP.end());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// touch helpers (CDP — real gesture path through touchControls)
async function touchDrag(x0, y0, x1, y1, ms, id = 9) {
  const steps = Math.max(4, Math.round(ms / 40));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id }] });
  for (let i = 1; i <= steps; i++) {
    const f = i / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, id }],
    });
    await sleep(ms / steps);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

// ---- stations ---------------------------------------------------------------
console.log('[lap] garage_idle');
await begin('garage_idle'); await sleep(10000); await end();

console.log('[lap] tank_switch');
await begin('tank_switch');
for (let i = 0; i < 6; i++) { await page.click('.next').catch(() => {}); await sleep(1400); }
await end();

// select the target tank for battle (between stations — selection clicks
// are not part of any measured window). Garage h3 shows the display name;
// match on the spec's name from TANK_SPECS via __DEBUG.
const wantName = await page.evaluate(
  (id) => { const t = window.__DEBUG.game.tankById.get(id); return t ? t.spec.name : id; }, TANK);
for (let i = 0; i < 90; i++) {
  const name = await page.evaluate(() => (document.querySelector('.stats h3') || {}).textContent || '');
  if (name.trim() === wantName) break;
  await page.click('.next').catch(() => {});
  await sleep(120);
}

console.log('[lap] battle_load');
await begin('battle_load');
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button, .btn, [class*="battle"]')]
    .find((el) => /^\s*BATTLE\s*$/i.test(el.textContent));
  if (b) b.click(); else throw new Error('BATTLE button not found');
});
await page.waitForFunction(
  () => window.__DEBUG.game.phase === 'battle' && window.__DEBUG.game.preBattleS <= 0,
  { timeout: 120000, polling: 100 });
await end();
const battleLoadStages = await page.evaluate(() => window.__BATTLE_LOAD || null);

console.log('[lap] look');
await begin('look');
for (let i = 0; i < 8; i++) {
  await touchDrag(650, 200, 850, 230, 600);
  await touchDrag(850, 230, 620, 190, 600);
  await sleep(200);
}
await end();

console.log('[lap] drive');
await begin('drive');
// forward + gentle S-curve straight on the player's input (same fields the
// touch stick writes each frame; the station measures drive-time cost, not
// gesture fidelity — 'look'/'fire' cover the real touch path)
await page.evaluate(() => {
  const p = window.__DEBUG.game.player;
  const t0 = performance.now();
  window.__lapDriveTimer = setInterval(() => {
    if (!p.state || p.combat.destroyed) return;
    p.input.throttle = 1;
    p.input.steer = Math.sin((performance.now() - t0) / 1500) * 0.5;
  }, 100);
});
await sleep(15000);
await page.evaluate(() => {
  clearInterval(window.__lapDriveTimer);
  const p = window.__DEBUG.game.player;
  if (p && p.input) { p.input.throttle = 0; p.input.steer = 0; }
});
await end();

console.log('[lap] fire');
await begin('fire');
{
  const btn = await page.$('.cot-touch .fire:not(.alt)');
  if (btn) {
    const box = await btn.boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    // Dynamic Aim is release-fire: repeat real drag -> lift gestures for the
    // Bradley instead of holding the button (a hold now correctly arms one
    // shot without firing it). Alternating drags exercise both aim axes.
    const fireUntil = performance.now() + 8000;
    let volley = 0;
    while (performance.now() < fireUntil) {
      const sx = volley % 2 ? -24 : 26;
      const sy = volley % 3 ? -10 : 14;
      await touchDrag(cx, cy, cx + sx, cy + sy, 120, 30 + volley);
      volley += 1;
      await sleep(350);
    }
  } else {
    await page.evaluate(() => { window.__DEBUG.flags.forceFire = true; });
    await sleep(8000);
    await page.evaluate(() => { window.__DEBUG.flags.forceFire = false; });
  }
}
await end();

console.log('[lap] fight');
await begin('fight');
await page.evaluate(() => {
  const D = window.__DEBUG;
  D.aimAtNearest();
  D.flags.forceFire = true;
  const p = D.game.player;
  // drive toward the nearest live enemy for the whole station
  window.__lapFightTimer = setInterval(() => {
    if (!p.state || p.combat.destroyed) return;
    let best = null, bd = Infinity;
    for (const e of D.game.tanks) {
      if (e.team === 'enemy' && e.state && e.combat && !e.combat.destroyed) {
        const d = e.state.pos.distanceToSquared(p.state.pos);
        if (d < bd) { bd = d; best = e; }
      }
    }
    if (best) {
      const dx = best.state.pos.x - p.state.pos.x;
      const dz = best.state.pos.z - p.state.pos.z;
      const want = Math.atan2(dx, dz);
      let dy = want - p.state.yaw;
      while (dy > Math.PI) dy -= 2 * Math.PI;
      while (dy < -Math.PI) dy += 2 * Math.PI;
      p.input.throttle = 1;
      p.input.steer = Math.max(-1, Math.min(1, dy * 2));
    }
  }, 250);
});
await sleep(20000);
await page.evaluate(() => {
  clearInterval(window.__lapFightTimer);
  window.__DEBUG.flags.forceFire = false;
  const p = window.__DEBUG.game.player;
  if (p && p.input) { p.input.throttle = 0; p.input.steer = 0; }
});
await end();

console.log('[lap] rematch');
await begin('rematch');
await page.evaluate((id) => window.__DEBUG.startBattle(id), TANK);
await page.waitForFunction(
  () => window.__DEBUG.game.phase === 'battle' && window.__DEBUG.game.preBattleS <= 0,
  { timeout: 120000, polling: 100 });
await end();

// ---- scorecard --------------------------------------------------------------
const raw = await page.evaluate(() => {
  const out = { stations: {}, spotted: window.__LAP.spotted, ua: navigator.userAgent, dpr: devicePixelRatio };
  for (const [k, st] of Object.entries(window.__LAP.stations)) {
    const gaps = st.gaps.slice().sort((a, b) => a - b);
    const frames = st.gaps.length || 1;
    const wallMs = st.t1 - st.t0;
    const over100 = st.tasks.filter((t) => t.d > 100);
    out.stations[k] = {
      wallMs: +wallMs.toFixed(0),
      simS: +(st.sim1 - st.sim0).toFixed(1),
      frames,
      ltfPct: +((1 - st.tasks.reduce((a, t) => a + Math.min(t.d, wallMs), 0) / wallMs) * 100).toFixed(1),
      gapP95: +(gaps[Math.floor(gaps.length * 0.95)] || 0).toFixed(0),
      gapMax: +(gaps[gaps.length - 1] || 0).toFixed(0),
      taskCount: st.tasks.length,
      worstMs: st.tasks.reduce((a, t) => Math.max(a, t.d), 0),
      over100Count: over100.length,
      over100Per10s: +(over100.length / (wallMs / 10000)).toFixed(2),
      tasks: st.tasks.slice(0, 40),
      programsDelta: st.info1.programs - st.info0.programs,
      texturesDelta: st.info1.textures - st.info0.textures,
      geometriesDelta: st.info1.geometries - st.info0.geometries,
      drawCalls: st.info1.calls,
      heapDeltaMB: +(st.info1.heapMB - st.info0.heapMB).toFixed(1),
    };
  }
  return out;
});
raw.battleLoadStages = battleLoadStages;

// spot-reveal worst task: tasks within ±200 ms of each reveal in 'fight'
const fightTasks = (raw.stations.fight || {}).tasks || [];
raw.reveals = (raw.spotted || []).filter((s) => s.station === 'fight').map((s) => {
  const near = fightTasks.filter((t) => Math.abs(t.t - s.wall) < 200);
  return { worstMs: near.reduce((a, t) => Math.max(a, t.d), 0) };
});

// budget verdicts
raw.verdicts = {};
for (const [k, b] of Object.entries(BUDGET)) {
  const st = raw.stations[k];
  if (!st) { raw.verdicts[k] = 'MISSING'; continue; }
  let pass = true;
  if (b.ltfPctMin != null && st.ltfPct < b.ltfPctMin) pass = false;
  if (b.worstMs != null && st.worstMs > b.worstMs) pass = false;
  if (b.wallMs != null && st.wallMs > b.wallMs) pass = false;
  if (b.over100Per10s != null && st.over100Per10s > b.over100Per10s) pass = false;
  if (b.gapP95 != null && st.gapP95 > b.gapP95) pass = false;
  if (b.revealWorstMs != null && raw.reveals.some((r) => r.worstMs > b.revealWorstMs)) pass = false;
  raw.verdicts[k] = pass ? 'PASS' : 'FAIL';
}

console.log('\n[lap] scorecard:');
for (const [k, st] of Object.entries(raw.stations)) {
  console.log(`  ${raw.verdicts[k] === 'PASS' ? ' ok ' : raw.verdicts[k] === 'FAIL' ? 'FAIL' : ' -- '} ${k}: wall ${st.wallMs}ms sim ${st.simS}s worst ${st.worstMs}ms >100ms/10s ${st.over100Per10s} ltf ${st.ltfPct}% gapP95 ${st.gapP95}ms prog+${st.programsDelta} tex+${st.texturesDelta} heap${st.heapDeltaMB >= 0 ? '+' : ''}${st.heapDeltaMB}MB calls ${st.drawCalls}`);
}
console.log(`  reveals: ${raw.reveals.length} (worst ${raw.reveals.reduce((a, r) => Math.max(a, r.worstMs), 0)} ms)`);

if (OUT) { writeFileSync(OUT, JSON.stringify(raw, null, 2)); console.log(`[lap] wrote ${OUT}`); }
const failed = Object.values(raw.verdicts).filter((v) => v === 'FAIL').length;
console.log(failed ? `\n[lap] ${failed} station(s) over budget` : '\n[lap] ALL BUDGETS GREEN');

await browser.close();
await server.close();
