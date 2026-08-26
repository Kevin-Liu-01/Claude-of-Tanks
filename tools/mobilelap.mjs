// The mobile performance lap (docs/PERFORMANCE.md): a deterministic session
// on emulated-iPhone headless Chrome, instrumented for main-thread health.
// Stations: garage_idle, tank_switch, battle_load, look, drive, fire,
// fight (+spot reveals), rematch, cross-map resource release, repeated-battle
// soak, orientation, lifecycle, and forced GPU context recovery. Emits a JSON
// scorecard with per-station
// long tasks, rAF gaps, renderer.info deltas, heap, sim-time — and budget
// pass/fail flags (ratified 2026-08-07).
// Usage: node tools/mobilelap.mjs [--production] [--profile native|constrained|software]
//   [--soak-cycles 2] [--out scorecard.json] [--trace-out trace.json]
//   [--shots directory] [--tank m2a2_bradley]
import { createServer, preview } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, f) => {
  const eq = argv.find((arg) => arg.startsWith(`--${n}=`));
  if (eq) return eq.slice(n.length + 3);
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : f;
};
const has = (n) => argv.includes(`--${n}`);
const OUT = opt('out', '');
const TRACE_OUT = opt('trace-out', '');
const SHOTS_DIR = opt('shots', '');
const TANK = opt('tank', 'm2a2_bradley');
const PRODUCTION = has('production');
const PROFILE = opt('profile', 'native');
const SOAK_CYCLES = Math.max(0, Math.min(6, Number(opt('soak-cycles', '0')) || 0));
const SOAK_SECONDS = Math.max(3, Math.min(60, Number(opt('soak-seconds', '10')) || 10));
const ALLOW_FAIL = has('allow-fail');
const PROFILES = {
  native: { cpuRate: 1, cores: null, memoryGB: null, softwareGpu: false },
  constrained: { cpuRate: 4, cores: 4, memoryGB: 4, softwareGpu: false },
  software: { cpuRate: 2, cores: 4, memoryGB: 4, softwareGpu: true },
};
if (!PROFILES[PROFILE]) throw new Error(`unknown --profile=${PROFILE}; use native, constrained, or software`);
const selectedProfile = PROFILES[PROFILE];

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
  map_cycle: { wallMs: 30000 },
};

const server = PRODUCTION
  ? await preview({
    root: process.cwd(), logLevel: 'error',
    preview: { host: '127.0.0.1', port: 5780, strictPort: false },
  })
  : await createServer({
    root: process.cwd(), logLevel: 'error',
    server: { host: '127.0.0.1', port: 5780, strictPort: false },
    optimizeDeps: {
      entries: ['index.html'],
      include: ['three', 'three/examples/jsm/loaders/GLTFLoader.js',
        'three/examples/jsm/utils/SkeletonUtils.js',
        'three/examples/jsm/utils/BufferGeometryUtils.js',
        'three/examples/jsm/geometries/RoundedBoxGeometry.js'],
    },
  });
if (!PRODUCTION) await server.listen();
const address = server.httpServer.address();
const port = typeof address === 'object' && address ? address.port : server.config.server.port;
const url = new URL(`http://127.0.0.1:${port}/`);
url.searchParams.set('tier', 'mobile');
url.searchParams.set('gfxreset', '1');
if (PRODUCTION) url.searchParams.set('debug', '1');
const browser = await puppeteer.launch({
  headless: 'new', protocolTimeout: 600000,
  args: [
    '--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage',
    ...(selectedProfile.softwareGpu ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []),
  ],
});
const page = await browser.newPage();
const landscapeViewport = {
  width: 892, height: 412, isMobile: true, hasTouch: true,
  isLandscape: true, deviceScaleFactor: 3,
};
await page.emulate({
  viewport: landscapeViewport,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
});
if (selectedProfile.cores || selectedProfile.memoryGB) {
  await page.evaluateOnNewDocument((cores, memoryGB) => {
    if (cores) Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { configurable: true, get: () => cores });
    if (memoryGB) Object.defineProperty(Navigator.prototype, 'deviceMemory', { configurable: true, get: () => memoryGB });
  }, selectedProfile.cores, selectedProfile.memoryGB);
}
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
const cdp = await page.createCDPSession();
if (selectedProfile.cpuRate > 1) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: selectedProfile.cpuRate });
}
await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 360000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 360000 });
if (PRODUCTION) {
  await page.waitForFunction('window.__QA_TRACE?.enabled === true', { timeout: 30000 });
}
if (SHOTS_DIR) mkdirSync(resolve(SHOTS_DIR), { recursive: true });
const shot = async (name) => {
  if (!SHOTS_DIR) return;
  const previousDisplay = await page.evaluate(() => {
    const hud = document.getElementById('cot-perfhud');
    if (!hud) return null;
    const display = hud.style.display;
    hud.style.display = 'none';
    return display;
  });
  try {
    await page.screenshot({ path: resolve(SHOTS_DIR, `${name}.png`), type: 'png' });
  } finally {
    await page.evaluate((display) => {
      const hud = document.getElementById('cot-perfhud');
      if (hud && display != null) hud.style.display = display;
    }, previousDisplay);
  }
};
const writeJson = (file, data) => {
  const target = resolve(file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  return target;
};
const closeServer = async () => {
  if (typeof server.close === 'function') {
    await server.close();
    return;
  }
  await new Promise((done) => server.httpServer.close(done));
};

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
await shot('01-garage');

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
    // Suppressive-fire contract: keep one real touch held for the full
    // station while moving that same pointer through alternating aim drags.
    // The input layer refires the Bradley whenever its 0.5 s reload clears.
    const id = 30;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: cx, y: cy, id }],
    });
    const fireUntil = performance.now() + 8000;
    let step = 0;
    while (performance.now() < fireUntil) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{
          x: cx + (step % 2 ? -28 : 30),
          y: cy + (step % 3 ? -12 : 16),
          id,
        }],
      });
      step += 1;
      await sleep(320);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
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
await shot('02-battle-fight');

console.log('[lap] rematch');
await begin('rematch');
await page.evaluate((id) => window.__DEBUG.startBattle(id), TANK);
await page.waitForFunction(
  () => window.__DEBUG.game.phase === 'battle' && window.__DEBUG.game.preBattleS <= 0,
  { timeout: 120000, polling: 100 });
await end();

// Mobile browsers account hidden worlds against the same graphics budget as
// the visible battlefield. Move to a different map and prove that the prior
// scene is evicted rather than accumulating across random battles.
console.log('[lap] map_cycle');
await begin('map_cycle');
const cycleFromMap = await page.evaluate(() => window.__DEBUG.world?.mapId || 'verdant');
const cycleToMap = cycleFromMap === 'desert' ? 'verdant' : 'desert';
await page.evaluate((mapId, specId) => {
  window.__DEBUG.enterGarage();
  return window.__DEBUG.beginSoloBattle({ specId, mapId });
}, cycleToMap, TANK);
await page.waitForFunction(
  (mapId) => window.__DEBUG.game.phase === 'battle'
    && window.__DEBUG.game.preBattleS <= 0
    && window.__DEBUG.world?.mapId === mapId,
  { timeout: 120000, polling: 100 }, cycleToMap);
await sleep(1000);
await end();
const mobileResidency = await page.evaluate(() => ({
  limits: window.__DEBUG.residentLimits,
  worlds: window.__DEBUG.worldCacheIds,
  pedestal: window.__DEBUG.pedestalCacheIds,
  release: window.__DEBUG.lastWorldRelease,
  memory: { ...window.__DEBUG.renderer.info.memory },
  garageEntry: window.__GARAGE_ENTRY || null,
  battleLoad: window.__BATTLE_LOAD || null,
  countdownWarm: window.__BATTLE_COUNTDOWN_WARM || null,
}));

// Repeated map/battle churn catches the class of failures that only appears
// after several matches: stale worlds, retained GPU resources, heap growth,
// and adaptive-quality collapse. Compare the same map before/after whenever
// enough cycles were requested, so legitimate biome differences do not look
// like a leak.
const resourceSample = (label) => page.evaluate((sampleLabel) => {
  const D = window.__DEBUG;
  const info = D.renderer.info;
  return {
    label: sampleLabel,
    map: D.world?.mapId || null,
    phase: D.game.phase,
    limits: D.residentLimits,
    worlds: D.worldCacheIds,
    pedestal: D.pedestalCacheIds,
    roster: D.game.tanks.map((tank) => tank.specId).sort(),
    programs: (info.programs || []).length,
    textures: info.memory.textures,
    geometries: info.memory.geometries,
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : -1,
    preset: D.quality.resolvePresetName(),
    dynScale: +D.post.dynScale.toFixed(3),
    contextLost: D.graphicsContextLost,
  };
}, label);
const soakSamples = [await resourceSample('baseline')];
for (let cycle = 1; cycle <= SOAK_CYCLES; cycle++) {
  const currentMap = await page.evaluate(() => window.__DEBUG.world?.mapId || 'verdant');
  const nextMap = currentMap === 'desert' ? 'verdant' : 'desert';
  const station = `soak_${cycle}`;
  console.log(`[lap] ${station} (${nextMap}, ${SOAK_SECONDS}s)`);
  await begin(station);
  await page.evaluate((mapId, specId) => {
    window.__DEBUG.enterGarage();
    return window.__DEBUG.beginSoloBattle({ specId, mapId, randomRoster: false });
  }, nextMap, TANK);
  await page.waitForFunction(
    (mapId) => window.__DEBUG.game.phase === 'battle'
      && window.__DEBUG.game.preBattleS <= 0
      && window.__DEBUG.world?.mapId === mapId,
    { timeout: 120000, polling: 100 }, nextMap);
  await page.evaluate(() => {
    const D = window.__DEBUG;
    D.aimAtNearest();
    D.flags.forceFire = true;
    const p = D.game.player;
    if (p?.input && !p.combat?.destroyed) {
      p.input.throttle = 0.8;
      p.input.steer = 0.25;
    }
  });
  await sleep(SOAK_SECONDS * 1000);
  await page.evaluate(() => {
    const D = window.__DEBUG;
    D.flags.forceFire = false;
    const p = D.game.player;
    if (p?.input) { p.input.throttle = 0; p.input.steer = 0; p.input.fire = false; }
  });
  await end();
  try { await cdp.send('HeapProfiler.collectGarbage'); } catch (_) { /* optional CDP domain */ }
  await sleep(750);
  soakSamples.push(await resourceSample(station));
}
const sameMapSamples = soakSamples.filter((sample) => sample.map === soakSamples[0].map);
const soakRosterKey = soakSamples[1] ? JSON.stringify(soakSamples[1].roster) : null;
const soakRosterStable = soakSamples.slice(1)
  .every((sample) => JSON.stringify(sample.roster) === soakRosterKey);
// The first return to a map legitimately completes one-time shared warmups.
// Leak detection starts there and compares a later return to the same map.
const soakComparable = sameMapSamples.length >= 3;
const soakFirst = soakComparable ? sameMapSamples[1] : sameMapSamples[0];
const soakLast = sameMapSamples[sameMapSamples.length - 1];
const soakGrowth = soakComparable ? {
  programs: soakLast.programs - soakFirst.programs,
  textures: soakLast.textures - soakFirst.textures,
  geometries: soakLast.geometries - soakFirst.geometries,
  heapMB: soakFirst.heapMB >= 0 && soakLast.heapMB >= 0
    ? +(soakLast.heapMB - soakFirst.heapMB).toFixed(1) : null,
} : null;
const coldGrowth = sameMapSamples.length >= 2 ? {
  programs: sameMapSamples[1].programs - sameMapSamples[0].programs,
  textures: sameMapSamples[1].textures - sameMapSamples[0].textures,
  geometries: sameMapSamples[1].geometries - sameMapSamples[0].geometries,
  heapMB: sameMapSamples[0].heapMB >= 0 && sameMapSamples[1].heapMB >= 0
    ? +(sameMapSamples[1].heapMB - sameMapSamples[0].heapMB).toFixed(1) : null,
} : null;
const soak = {
  cycles: SOAK_CYCLES,
  secondsPerCycle: SOAK_SECONDS,
  samples: soakSamples,
  deterministicRoster: soakRosterStable,
  comparable: soakComparable,
  comparisonMap: soakComparable ? soakFirst.map : null,
  coldGrowth,
  growth: soakGrowth,
  budgets: { programs: 8, textures: 24, geometries: 48, heapMB: 96 },
};

// Exercise real responsive layout and backing-buffer resizing in both
// orientations. Emulation cannot reproduce a phone GPU, but it can prove the
// battle/camera survives the same CSS and resize events without a reload.
console.log('[lap] orientation_recovery');
const orientationState = () => page.evaluate(() => {
  const D = window.__DEBUG;
  const canvas = D.renderer.domElement;
  const rect = canvas.getBoundingClientRect();
  const touch = document.querySelector('.cot-touch.on');
  const box = (selector) => {
    const element = document.querySelector(selector);
    if (!element || getComputedStyle(element).display === 'none') return null;
    const r = element.getBoundingClientRect();
    return r.width > 0 && r.height > 0
      ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
      : null;
  };
  const boxes = {
    scoreboard: box('.cot-top'),
    minimap: box('.cot-minimap'),
    mobileChrome: box('.cot-touch .mobile-chrome'),
  };
  const overlaps = (a, b) => !!a && !!b
    && a.left < b.right && a.right > b.left
    && a.top < b.bottom && a.bottom > b.top;
  const criticalOverlaps = [
    ['scoreboard', 'minimap'],
    ['scoreboard', 'mobileChrome'],
    ['minimap', 'mobileChrome'],
  ].filter(([a, b]) => overlaps(boxes[a], boxes[b])).map(([a, b]) => `${a}:${b}`);
  return {
    viewport: [innerWidth, innerHeight],
    phase: D.game.phase,
    map: D.world?.mapId || null,
    cameraAspect: +D.camera.aspect.toFixed(4),
    expectedAspect: +(innerWidth / innerHeight).toFixed(4),
    canvasCss: [+rect.width.toFixed(1), +rect.height.toFixed(1)],
    canvasBuffer: [canvas.width, canvas.height],
    deviceDpr: devicePixelRatio,
    rendererDpr: D.renderer.getPixelRatio(),
    outputResolution: D.renderer.userData.outputResolution || null,
    reconstruction: D.post.upscaler.telemetry(),
    touchVisible: !!touch && getComputedStyle(touch).display !== 'none',
    criticalOverlaps,
    contextLost: D.graphicsContextLost,
  };
});
const orientationBefore = await orientationState();
await page.setViewport({
  width: 412, height: 892, isMobile: true, hasTouch: true,
  isLandscape: false, deviceScaleFactor: 3,
});
await sleep(1200);
const orientationPortrait = await orientationState();
await shot('03-portrait');
await page.setViewport(landscapeViewport);
await sleep(1200);
const orientationAfter = await orientationState();
const orientationRecovery = {
  before: orientationBefore,
  portrait: orientationPortrait,
  after: orientationAfter,
  statePreserved: orientationBefore.phase === orientationPortrait.phase
    && orientationBefore.phase === orientationAfter.phase
    && orientationBefore.map === orientationPortrait.map
    && orientationBefore.map === orientationAfter.map,
};

// Freeze/activate through Chrome's lifecycle domain. This approximates an OS
// task switch or background suspension and catches stale input/renderer state.
console.log('[lap] lifecycle_recovery');
let lifecycleRecovery;
const lifecycleBefore = await page.evaluate(() => ({
  phase: window.__DEBUG.game.phase,
  map: window.__DEBUG.world?.mapId || null,
  simS: window.__DEBUG.game.timeS || 0,
}));
try {
  await cdp.send('Page.setLifecycleEventsEnabled', { enabled: true });
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
  await sleep(1200);
  await cdp.send('Page.setWebLifecycleState', { state: 'active' });
  await cdp.send('Page.bringToFront');
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await sleep(1200);
  const after = await page.evaluate(() => {
    const D = window.__DEBUG;
    const p = D.game.player;
    if (p?.input) { p.input.throttle = 0; p.input.steer = 0; p.input.fire = false; }
    return {
      phase: D.game.phase,
      map: D.world?.mapId || null,
      simS: D.game.timeS || 0,
      contextLost: D.graphicsContextLost,
      renderCalls: D.renderer.info.render.calls,
      hidden: document.hidden,
      visibilityState: document.visibilityState,
      focused: document.hasFocus(),
      input: p?.input ? {
        throttle: p.input.throttle || 0,
        steer: p.input.steer || 0,
        fire: !!p.input.fire,
      } : null,
    };
  });
  lifecycleRecovery = {
    supported: true,
    before: lifecycleBefore,
    after,
    statePreserved: lifecycleBefore.phase === after.phase && lifecycleBefore.map === after.map,
    simDeltaS: +(after.simS - lifecycleBefore.simS).toFixed(2),
  };
} catch (error) {
  try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }); } catch (_) { /* already active */ }
  lifecycleRecovery = { supported: false, reason: String(error?.message || error), before: lifecycleBefore };
}

// WEBGL_lose_context exercises the browser's real loss/restoration events.
// The game must pause, show recovery state, preserve the battle, step down to
// the safe preset, and resume without a reload.
console.log('[lap] context_recovery');
const runtimeEvaluate = async (expression) => {
  const response = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: false,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description
      || response.exceptionDetails.text || 'Runtime.evaluate failed');
  }
  return response.result.value;
};
const pollRuntime = async (expression, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await runtimeEvaluate(expression)) return true;
    await sleep(100);
  }
  throw new Error(`context recovery condition timed out after ${timeoutMs} ms`);
};
const contextStart = JSON.parse(await runtimeEvaluate(`(() => {
  const D = window.__DEBUG;
  const ext = D.renderer.getContext().getExtension('WEBGL_lose_context');
  if (!ext) return JSON.stringify({ supported: false });
  window.__lapLoseContextExt = ext;
  const start = { supported: true, phase: D.game.phase, map: D.world?.mapId || null };
  setTimeout(() => ext.loseContext(), 0);
  return JSON.stringify(start);
})()`));
console.log('[lap] context_recovery: loss requested');
let contextRecovery = contextStart;
if (contextStart.supported) {
  await pollRuntime(
    'window.__DEBUG.graphicsContextLost && !!document.getElementById("cot-ctxlost")',
    5000);
  console.log('[lap] context_recovery: loss observed');
  const during = JSON.parse(await runtimeEvaluate(`JSON.stringify({
    paused: window.__DEBUG.graphicsContextLost,
    overlay: !!document.getElementById('cot-ctxlost'),
  })`));
  // Screenshot capture itself is a GPU operation and can deadlock while the
  // context is deliberately absent. The DOM/trace assertions below preserve
  // the loss-state evidence without asking the failed device to paint.
  // Restore on the next task. Some ANGLE builds synchronously re-enter their
  // context-restored listeners from restoreContext(); returning to CDP first
  // prevents the automation call itself from becoming the thing that hangs.
  await runtimeEvaluate('setTimeout(() => window.__lapLoseContextExt.restoreContext(), 0); true');
  console.log('[lap] context_recovery: restore requested');
  await pollRuntime(
    '!window.__DEBUG.graphicsContextLost && !document.getElementById("cot-ctxlost")',
    12000);
  console.log('[lap] context_recovery: restore observed');
  let renderResumed = true;
  try {
    await pollRuntime('window.__DEBUG.renderer.info.render.calls > 0', 5000);
  } catch (_) {
    renderResumed = false;
  }
  const after = JSON.parse(await runtimeEvaluate(`(() => {
    const D = window.__DEBUG;
    return JSON.stringify({
      paused: D.graphicsContextLost,
      overlay: !!document.getElementById('cot-ctxlost'),
      phase: D.game.phase,
      map: D.world?.mapId || null,
      preset: D.quality.resolvePresetName(),
      contextLost: D.renderer.getContext().isContextLost(),
      renderCalls: D.renderer.info.render.calls,
    });
  })()`));
  contextRecovery = {
    ...contextStart,
    during,
    after,
    renderResumed,
    statePreserved: after.phase === contextStart.phase && after.map === contextStart.map,
  };
}

const traceReport = JSON.parse(await runtimeEvaluate(`(() => {
  const trace = window.__QA_TRACE;
  if (!trace?.enabled) return 'null';
  trace.mark('qa:lap-complete', {});
  // After a deliberate context restore, querying fresh driver identity strings
  // can block in some ANGLE implementations. Engine telemetry already carries
  // the GPU identity cached before loss, so do not re-enter the driver here.
  const snapshot = trace.snapshot({ frames: false, gpu: false });
  return JSON.stringify({
    stats: snapshot.stats,
    environment: snapshot.environment,
    telemetry: snapshot.telemetry,
    frameSchema: snapshot.frameSchema,
    errors: snapshot.events.filter((event) => event.kind === 'error'),
    contextEvents: snapshot.events.filter((event) =>
      event.name === 'webgl:context-lost' || event.name === 'webglcontextrestored'),
    lifecycleEvents: snapshot.events.filter((event) => event.kind === 'lifecycle'),
  });
})()`));

// ---- scorecard --------------------------------------------------------------
const raw = JSON.parse(await runtimeEvaluate(`JSON.stringify((() => {
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
})())`));
raw.battleLoadStages = battleLoadStages;
raw.profile = {
  name: PROFILE,
  ...selectedProfile,
  production: PRODUCTION,
  url: url.href,
  viewport: landscapeViewport,
};
raw.mobileResidency = mobileResidency;
raw.soak = soak;
raw.orientationRecovery = orientationRecovery;
raw.lifecycleRecovery = lifecycleRecovery;
raw.contextRecovery = contextRecovery;
raw.trace = traceReport;

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
raw.verdicts.mobile_residency = mobileResidency.worlds.length <= mobileResidency.limits.worldScenes
  && mobileResidency.pedestal.length <= mobileResidency.limits.pedestalVisuals
  && !!mobileResidency.release ? 'PASS' : 'FAIL';
raw.verdicts.context_recovery = !contextRecovery.supported || (
  contextRecovery.during.paused
  && contextRecovery.during.overlay
  && !contextRecovery.after.paused
  && !contextRecovery.after.overlay
  && !contextRecovery.after.contextLost
  && contextRecovery.renderResumed
  && contextRecovery.statePreserved
) ? 'PASS' : 'FAIL';
const cacheWithinLimits = soakSamples.every((sample) =>
  sample.worlds.length <= sample.limits.worldScenes
  && sample.pedestal.length <= sample.limits.pedestalVisuals
  && !sample.contextLost);
raw.verdicts.soak = SOAK_CYCLES === 0 ? 'SKIP' : cacheWithinLimits && soakRosterStable && (!soakComparable || (
  soakGrowth.programs <= soak.budgets.programs
  && soakGrowth.textures <= soak.budgets.textures
  && soakGrowth.geometries <= soak.budgets.geometries
  && (soakGrowth.heapMB == null || soakGrowth.heapMB <= soak.budgets.heapMB)
)) ? 'PASS' : 'FAIL';
const orientationPass = (state) => {
  const expectedW = Math.round(state.canvasCss[0] * state.rendererDpr);
  const expectedH = Math.round(state.canvasCss[1] * state.rendererDpr);
  return Math.abs(state.cameraAspect - state.expectedAspect) <= 0.02
  && Math.abs(state.canvasBuffer[0] - expectedW) <= 1
  && Math.abs(state.canvasBuffer[1] - expectedH) <= 1
  && state.rendererDpr <= state.deviceDpr + 0.001
  && (state.outputResolution?.budgetLimited || state.outputResolution?.native)
  && state.reconstruction.inputScale >= 0.33
  && state.touchVisible
  && state.criticalOverlaps.length === 0
  && !state.contextLost;
};
raw.verdicts.orientation_recovery = orientationRecovery.statePreserved
  && orientationPass(orientationRecovery.portrait)
  && orientationPass(orientationRecovery.after) ? 'PASS' : 'FAIL';
raw.verdicts.lifecycle_recovery = !lifecycleRecovery.supported ? 'SKIP' : (
  lifecycleRecovery.statePreserved
  && !lifecycleRecovery.after.contextLost
  && lifecycleRecovery.after.renderCalls > 0
  && !lifecycleRecovery.after.hidden
  && lifecycleRecovery.after.visibilityState === 'visible'
  && lifecycleRecovery.after.focused
  && !lifecycleRecovery.after.input?.fire
  && lifecycleRecovery.after.input?.throttle === 0
  && lifecycleRecovery.after.input?.steer === 0
) ? 'PASS' : 'FAIL';
const contextNames = new Set((traceReport?.contextEvents || []).map((event) => event.name));
raw.verdicts.trace = traceReport
  && traceReport.stats.framesDropped === 0
  && traceReport.stats.eventsDropped === 0
  && traceReport.errors.length === 0
  && traceReport.telemetry
  && (!contextRecovery.supported || (
    contextNames.has('webgl:context-lost') && contextNames.has('webglcontextrestored')
  )) ? 'PASS' : 'FAIL';

console.log('\n[lap] scorecard:');
for (const [k, st] of Object.entries(raw.stations)) {
  console.log(`  ${raw.verdicts[k] === 'PASS' ? ' ok ' : raw.verdicts[k] === 'FAIL' ? 'FAIL' : ' -- '} ${k}: wall ${st.wallMs}ms sim ${st.simS}s worst ${st.worstMs}ms >100ms/10s ${st.over100Per10s} ltf ${st.ltfPct}% gapP95 ${st.gapP95}ms prog+${st.programsDelta} tex+${st.texturesDelta} heap${st.heapDeltaMB >= 0 ? '+' : ''}${st.heapDeltaMB}MB calls ${st.drawCalls}`);
}
console.log(`  reveals: ${raw.reveals.length} (worst ${raw.reveals.reduce((a, r) => Math.max(a, r.worstMs), 0)} ms)`);
console.log(`  ${raw.verdicts.mobile_residency === 'PASS' ? ' ok ' : 'FAIL'} mobile residency: ${mobileResidency.worlds.length}/${mobileResidency.limits.worldScenes} worlds, ${mobileResidency.pedestal.length}/${mobileResidency.limits.pedestalVisuals} pedestal visuals`);
console.log(`  ${raw.verdicts.soak === 'PASS' ? ' ok ' : raw.verdicts.soak === 'SKIP' ? ' -- ' : 'FAIL'} soak: ${SOAK_CYCLES} cycles${soakGrowth ? `, same-map growth ${JSON.stringify(soakGrowth)}` : ', no same-map comparison'}`);
console.log(`  ${raw.verdicts.orientation_recovery === 'PASS' ? ' ok ' : 'FAIL'} orientation recovery: portrait ${orientationPortrait.viewport.join('×')} buffer ${orientationPortrait.canvasBuffer.join('×')} @${orientationPortrait.rendererDpr.toFixed(2)}x (${orientationPortrait.reconstruction.mode}) overlaps ${orientationPortrait.criticalOverlaps.join(',') || 'none'}, landscape ${orientationAfter.viewport.join('×')}`);
console.log(`  ${raw.verdicts.lifecycle_recovery === 'PASS' ? ' ok ' : raw.verdicts.lifecycle_recovery === 'SKIP' ? ' -- ' : 'FAIL'} lifecycle recovery: ${lifecycleRecovery.supported ? `${lifecycleRecovery.simDeltaS}s sim delta` : lifecycleRecovery.reason}`);
console.log(`  ${raw.verdicts.context_recovery === 'PASS' ? ' ok ' : 'FAIL'} context recovery: ${contextRecovery.supported ? JSON.stringify(contextRecovery.after) : 'extension unsupported'}`);
console.log(`  ${raw.verdicts.trace === 'PASS' ? ' ok ' : 'FAIL'} trace: ${traceReport ? `${traceReport.stats.frames} frames, ${traceReport.stats.events} events, ${traceReport.errors.length} errors` : 'missing'}`);

if (OUT) console.log(`[lap] wrote ${writeJson(OUT, raw)}`);
if (TRACE_OUT) {
  const traceJson = await runtimeEvaluate('window.__QA_TRACE?.exportJson(false, { gpu: false }) || ""');
  if (!traceJson) throw new Error('trace export requested but the QA trace is unavailable');
  console.log(`[lap] wrote ${writeJson(TRACE_OUT, traceJson)}`);
}
const failed = Object.values(raw.verdicts).filter((v) => v === 'FAIL').length;
console.log(failed ? `\n[lap] ${failed} station(s) over budget` : '\n[lap] ALL BUDGETS GREEN');

await browser.close();
await closeServer();
if (failed && !ALLOW_FAIL) process.exitCode = 1;
