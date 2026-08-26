// End-to-end loading budget probe.
//
// Measures the user-visible promise boundary for every app-controlled load:
//   - cold navigation -> interactive garage
//   - garage -> playable solo battle, for every battlefield
//   - direct navigation -> ready Studio, for every battlefield
//   - live Studio map switches, for every battlefield
//   - Studio scene load/reload and Studio/Battle returns to the garage
//   - cached battle rematch and every garage tank selection
//
// External multiplayer matchmaking/peer readiness is deliberately outside
// this gate; presentNetworkBattle records those network waits separately.
//
// Usage:
//   node tools/loading-budget-probe.mjs
//   node tools/loading-budget-probe.mjs --maps verdant,desert --mode all
//   node tools/loading-budget-probe.mjs --limit 5000
//   node tools/loading-budget-probe.mjs --stall-limit 500
//   node tools/loading-budget-probe.mjs --mode battle --garage-dwell 14000
//   node tools/loading-budget-probe.mjs --mode battle --maps random --battle-intent-dwell 1200
//   node tools/loading-budget-probe.mjs --mode tank-switch --tank-ids merkava1b,merkava3d
//   node tools/loading-budget-probe.mjs --mode tank-switch --tank-ids m1a2,t90m --tank-intent-dwell 150
//   node tools/loading-budget-probe.mjs --serve dev --mode studio

// Exit 0 means every measured path completed in strictly less than the load
// limit without a main-thread frame gap at or above the stall limit. Total
// load time and loading-screen responsiveness are intentionally separate
// contracts: a fast load with a frozen progress screen is still a failure.

import { build, createServer, preview } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import os, { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import puppeteer from 'puppeteer';
import { MAP_IDS } from '../src/world/maps/index.js';

const argv = process.argv.slice(2);
function option(name, fallback) {
  const eq = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}

const limitMs = Math.max(1, Number(option('limit', '5000')) || 5000);
const rolloutLimitMs = Math.max(
  limitMs,
  Number(option('rollout-limit', String(limitMs + 2500))) || (limitMs + 2500),
);
// This gate targets the massive transition freezes reported by players. The
// 500 ms ceiling catches the former 0.9-2.8 s lockups while leaving the
// steady-state 16.7 ms frame budget to tools/perfprobe.mjs.
const stallLimitMs = Math.max(17, Number(option('stall-limit', '500')) || 500);
const mode = option('mode', 'all');
const serveMode = option('serve', 'production');
const deviceTier = option('tier', 'desktop');
const garageDwellMs = Math.max(0, Number(option('garage-dwell', '0')) || 0);
const battleIntentDwellMs = Math.max(0, Number(option('battle-intent-dwell', '0')) || 0);
const battleSpecOption = option('battle-spec', 'm1a2');
const requestedTankIds = option('tank-ids', 'all');
const tankIntentDwellMs = Math.max(0, Number(option('tank-intent-dwell', '0')) || 0);
const modes = new Set([
  'all', 'boot', 'battle', 'studio', 'studio-switch', 'scene-load',
  'transitions', 'tank-switch',
]);
if (!modes.has(mode)) {
  throw new Error(`Unknown mode '${mode}' (expected ${[...modes].join(', ')})`);
}
if (!['production', 'dev'].includes(serveMode)) {
  throw new Error(`Unknown serve mode '${serveMode}' (expected production or dev)`);
}
if (!['desktop', 'mobile'].includes(deviceTier)) {
  throw new Error(`Unknown tier '${deviceTier}' (expected desktop or mobile)`);
}
const requestedMaps = option('maps', 'all');
const maps = requestedMaps === 'all'
  ? [...MAP_IDS]
  : requestedMaps.split(',').map((id) => id.trim()).filter(Boolean);
if (!maps.length) throw new Error('At least one map is required');
for (const id of maps) {
  if (!MAP_IDS.includes(id) && !(id === 'random' && mode === 'battle')) {
    throw new Error(`Unknown map '${id}'`);
  }
}

const runBoot = mode === 'all' || mode === 'boot';
const runBattle = mode === 'all' || mode === 'battle';
const runStudio = mode === 'all' || mode === 'studio';
const runStudioSwitch = mode === 'all' || mode === 'studio-switch';
const runSceneLoad = mode === 'all' || mode === 'scene-load';
const runTransitions = mode === 'all' || mode === 'transitions';
const runTankSwitch = mode === 'all' || mode === 'tank-switch';

// Transition timing is especially sensitive to a second Chromium renderer or
// a saturated CPU stealing the exact first-render frame under measurement.
// Refuse certification in those windows rather than recording a false pass or
// false regression. The scenario numbers still print for diagnosis.
const cores = os.cpus().length;
const loadLimit = cores * 0.5;
const probeLoadAllowance = 5;
const gpuCpuLimit = 15;
const load1Start = os.loadavg()[0];
let load1Max = load1Start;
let foreignHeadlessMax = 0;
let foreignGpuCpuMax = 0;

function processRows() {
  try {
    return execSync('ps -axo pid=,ppid=,pcpu=,command=', { encoding: 'utf8' })
      .split('\n')
      .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/))
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function isChildOf(pid, ancestorPid, ppidOf) {
  for (let hop = 0; hop < 12 && pid; hop++) {
    if (pid === ancestorPid || pid === process.pid) return true;
    pid = ppidOf.get(pid) || 0;
  }
  return false;
}

function sampleGpuContention(ownBrowserPid) {
  const rows = processRows();
  const ppidOf = new Map(rows.map((row) => [+row[1], +row[2]]));
  let foreignHeadless = 0;
  let foreignGpuCpu = 0;
  for (const row of rows) {
    const pid = +row[1];
    const cpu = +row[3];
    const command = row[4];
    if (isChildOf(pid, ownBrowserPid, ppidOf)) continue;
    if (/Chrome for Testing|--headless/.test(command)
        && /[Cc]hrom/.test(command) && cpu >= 5) {
      foreignHeadless++;
    }
    if (/--type=gpu-process/.test(command) && cpu > 0) foreignGpuCpu += cpu;
  }
  foreignHeadlessMax = Math.max(foreignHeadlessMax, foreignHeadless);
  foreignGpuCpuMax = Math.max(foreignGpuCpuMax, +foreignGpuCpu.toFixed(1));
}

const requestedPort = 7600 + Math.floor(Math.random() * 300);
let server;
let distDir = null;
if (serveMode === 'production') {
  distDir = await mkdtemp(join(tmpdir(), 'cot-loading-budget-'));
  await build({
    root: process.cwd(),
    logLevel: 'error',
    build: { outDir: distDir, emptyOutDir: true },
  });
  server = await preview({
    root: process.cwd(),
    logLevel: 'error',
    build: { outDir: distDir },
    preview: { port: requestedPort, strictPort: false },
  });
} else {
  server = await createServer({
    root: process.cwd(),
    logLevel: 'error',
    server: {
      port: requestedPort,
      strictPort: false,
      hmr: false,
      watch: null,
    },
    optimizeDeps: {
      entries: ['index.html'],
      include: [
        'three',
        'three/examples/jsm/loaders/GLTFLoader.js',
        'three/examples/jsm/utils/SkeletonUtils.js',
        'three/examples/jsm/utils/BufferGeometryUtils.js',
        'three/examples/jsm/geometries/RoundedBoxGeometry.js',
      ],
    },
  });
  await server.listen();
}
const address = server.httpServer.address();
const port = typeof address === 'object' && address ? address.port : requestedPort;
const baseUrl = `http://localhost:${port}/`;
console.log(`[loading-budget] ${serveMode} server up at ${baseUrl}`);
console.log(`[loading-budget] strict budget <${limitMs} ms; maps=${maps.join(',')}`);
console.log(`[loading-budget] battle click-to-control budget <${rolloutLimitMs} ms`);
console.log(`[loading-budget] transition frame-gap budget <${stallLimitMs} ms`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const ownBrowserPid = browser.process()?.pid || 0;
sampleGpuContention(ownBrowserPid);
const contentionSampler = setInterval(() => {
  load1Max = Math.max(load1Max, os.loadavg()[0]);
  sampleGpuContention(ownBrowserPid);
}, 1000);

const rows = [];
const pageTimeoutMs = Math.max(30000, limitMs * 4);

function record(kind, name, ms, details = {}) {
  const pass = Number.isFinite(ms) && ms >= 0 && ms < limitMs
    && (details.rolloutMs == null || details.rolloutMs < rolloutLimitMs)
    && (!details.stall || details.stall.maxGapMs < stallLimitMs)
    && (!details.backgroundStall || details.backgroundStall.maxGapMs < stallLimitMs)
    && !(details.errors?.length) && details.invariantPass !== false;
  const row = { kind, name, ms: Math.round(ms), pass, ...details };
  rows.push(row);
  const worstStage = details.stall?.gaps?.[0]?.stage;
  const stall = details.stall
    ? ` gap=${Math.round(details.stall.maxGapMs)}ms${worstStage ? `@${worstStage}` : ''}`
    : '';
  const suffix = `${stall}${details.errors?.length ? ` errors=${details.errors.length}` : ''}`;
  const background = details.backgroundStall
    ? ` idleGap=${Math.round(details.backgroundStall.maxGapMs)}ms` : '';
  const rollout = details.rolloutMs == null ? '' : ` rollout=${Math.round(details.rolloutMs)}ms`;
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${kind.padEnd(13)} ${name.padEnd(10)} ${String(row.ms).padStart(5)} ms${rollout}${suffix}${background}`);
  return row;
}

async function openPage(search = '', { transitions = false } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.evaluateOnNewDocument((gapFloorMs) => {
    const rows = [];
    const longTasks = [];
    let scenario = 'navigation';
    let startedAt = performance.now();
    let lastFrameAt = startedAt;
    let frameCount = 0;

    const stage = () => {
      const battle = document.querySelector('.cot-bl.on, .cot-bl.leaving');
      if (battle) {
        const label = battle.querySelector('.fstage')?.textContent?.trim();
        return `battle:${label || 'loading'}`;
      }
      const transition = document.querySelector('.cot-trans.on');
      if (transition) {
        const label = transition.querySelector('.mstage')?.textContent?.trim();
        const title = transition.querySelector('.title')?.textContent?.trim();
        return `transition:${label || title || 'covered'}`;
      }
      const boot = document.getElementById('cot-boot');
      if (boot && !boot.classList.contains('cot-boot-out')) {
        return `boot:${document.getElementById('cot-boot-stage')?.textContent?.trim() || 'loading'}`;
      }
      return window.__STUDIO?.active
        ? `studio:${window.__STUDIO.mapId || 'active'}`
        : `phase:${window.__DEBUG?.game?.phase || 'initializing'}`;
    };

    const loop = (now) => {
      const gapMs = now - lastFrameAt;
      frameCount++;
      if (gapMs >= gapFloorMs) {
        rows.push({
          atMs: +(now - startedAt).toFixed(1),
          gapMs: +gapMs.toFixed(1),
          stage: stage(),
        });
      }
      lastFrameAt = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks.push({
            atMs: +(entry.startTime - startedAt).toFixed(1),
            durationMs: +entry.duration.toFixed(1),
            stage: stage(),
          });
        }
      }).observe({ entryTypes: ['longtask'] });
    } catch (_) { /* Long Tasks API is optional; rAF gaps remain authoritative. */ }

    window.__LOAD_STALLS = {
      reset(nextScenario = 'unnamed') {
        scenario = nextScenario;
        startedAt = performance.now();
        lastFrameAt = startedAt;
        frameCount = 0;
        rows.length = 0;
        longTasks.length = 0;
      },
      snapshot() {
        let maxGapMs = 0;
        for (const row of rows) maxGapMs = Math.max(maxGapMs, row.gapMs);
        return {
          scenario,
          durationMs: +(performance.now() - startedAt).toFixed(1),
          frames: frameCount,
          maxGapMs,
          gaps: rows.slice().sort((a, b) => b.gapMs - a.gapMs).slice(0, 12),
          longTasks: longTasks.slice().sort((a, b) => b.durationMs - a.durationMs).slice(0, 12),
        };
      },
    };
  }, Math.min(50, stallLimitMs));
  if (transitions) {
    // The app intentionally skips presentation fades under webdriver. These
    // scenarios measure the real player-facing transition, while nosplash=1
    // still bypasses only the initial keypress gate.
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(Navigator.prototype, 'webdriver', {
        configurable: true,
        get: () => false,
      });
    });
  }
  await page.setViewport(deviceTier === 'mobile'
    // Loading throughput is compared at one physical pixel per CSS pixel.
    // Headless ANGLE at emulated DPR 2 intermittently falls back to a
    // software path (2.7 s vs 17.5 s for the same untouched boot), measuring
    // the harness rather than the app. Pixel-density fidelity has its own
    // renderer probes; tier=mobile still selects the real mobile preset.
    ? { width: 390, height: 844, deviceScaleFactor: 1 }
    : { width: 1920, height: 1080, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().includes('/_vercel/insights/')) {
      errors.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error'
        && !message.text().includes('favicon')
        && !message.text().includes('Failed to load resource')) {
      errors.push(message.text());
    }
  });
  const startedAt = Date.now();
  await page.goto(`${baseUrl}${search}`, {
    waitUntil: 'domcontentloaded', timeout: pageTimeoutMs,
  });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: pageTimeoutMs });
  const readyWallMs = Date.now() - startedAt;
  return { context, page, errors, readyWallMs };
}

async function resetStalls(page, scenario) {
  await page.evaluate((name) => window.__LOAD_STALLS.reset(name), scenario);
}

async function captureStalls(page) {
  // Include the first two painted destination frames. This catches work that
  // was merely moved from behind the veil onto the reveal boundary.
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  return page.evaluate(() => window.__LOAD_STALLS.snapshot());
}

async function closePage(opened) {
  await opened.context.close();
}

async function measureBoot() {
  const opened = await openPage(`?nosplash=1&tier=${deviceTier}&gfxreset=1`);
  try {
    const app = await opened.page.evaluate(() => ({
      bootMs: window.__BOOT_MS,
      timings: window.__BOOT_TIMINGS,
      phase: window.__DEBUG?.game?.phase,
    }));
    const stall = await captureStalls(opened.page);
    record('boot', 'garage', opened.readyWallMs, {
      appMs: app.bootMs,
      stages: app.timings,
      phase: app.phase,
      stall,
      errors: opened.errors,
    });
  } finally {
    await closePage(opened);
  }
}

async function measureBattle(mapId) {
  const opened = await openPage(`?nosplash=1&tier=${deviceTier}&gfxreset=1`);
  try {
    let garageDwellStall = null;
    if (garageDwellMs > 0) {
      await resetStalls(opened.page, `battle-prefetch:${mapId}`);
      await opened.page.evaluate((map) => window.__DEBUG.garage.setSelectedMap(map), mapId);
      await new Promise((resolve) => setTimeout(resolve, garageDwellMs));
      garageDwellStall = await captureStalls(opened.page);
    }
    if (battleIntentDwellMs > 0) {
      await opened.page.evaluate((map) => window.__DEBUG.garage.setSelectedMap(map), mapId);
      await opened.page.hover('.cot-battle-control');
      await new Promise((resolve) => setTimeout(resolve, battleIntentDwellMs));
    }
    await resetStalls(opened.page, `battle:${mapId}`);
    const result = await opened.page.evaluate(async ({ map, requestedSpec }) => {
      const debug = window.__DEBUG;
      const stagedSpec = requestedSpec.startsWith('staged:')
        ? requestedSpec.slice('staged:'.length) : null;
      const specId = requestedSpec === 'selected'
        ? debug.selectedSpecId : (stagedSpec || requestedSpec);
      if (stagedSpec) {
        debug.stagePedestalTank(stagedSpec);
        await new Promise((resolve, reject) => {
          const deadline = performance.now() + 10000;
          const check = () => {
            if (debug.pedestalVisual?.specId === stagedSpec) resolve();
            else if (performance.now() > deadline) reject(new Error(`staging ${stagedSpec} timed out`));
            else requestAnimationFrame(check);
          };
          check();
        });
      }
      const pedestalBefore = debug.pedestalVisual;
      const startedAt = performance.now();
      await debug.beginBattleEntry(specId, map);
      const loadingMs = performance.now() - startedAt;
      while (debug.game.phase === 'battle' && debug.game.preBattleS > 0) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return {
        ms: loadingMs,
        rolloutMs: performance.now() - startedAt,
        specId,
        phase: debug.game.phase,
        loadScreen: !!document.querySelector('.cot-bl.on'),
        trace: window.__BATTLE_LOAD,
        world: window.__WORLD_LOAD,
        minimap: window.__MINIMAP_LOAD,
        combatWarm: window.__COMBAT_WARM,
        prefetch: window.__WORLD_PREFETCH,
        reusedPedestal: debug.game.player?.visual === pedestalBefore,
        playerContactReady: !!debug.game.player?.visual?.contactGeom,
        markingSeatPaths: debug.game.tanks.map((entity) =>
          entity.visual?.root?.userData?.markingSeatPath || null),
        pedestalTrace: window.__PED_TRACE?.slice(-12) || [],
        startBattle: window.__START_BATTLE_TIMINGS || null,
        visualLoadTimings: window.__VISUAL_LOAD_TIMINGS || [],
      };
    }, { map: mapId, requestedSpec: battleSpecOption });
    let warmTimedOut = false;
    try {
      await opened.page.waitForFunction(
        'window.__BATTLE_COUNTDOWN_WARM?.done === true',
        { timeout: 20000 },
      );
    } catch (_) {
      warmTimedOut = true;
    }
    let deferredWarmTimedOut = false;
    try {
      await opened.page.waitForFunction(
        'window.__BATTLE_DEFERRED_WARM?.done === true',
        { timeout: 20000 },
      );
    } catch (_) {
      deferredWarmTimedOut = true;
    }
    Object.assign(result, await opened.page.evaluate(() => ({
      countdownWarm: window.__BATTLE_COUNTDOWN_WARM,
      deferredWarm: window.__BATTLE_DEFERRED_WARM,
      combatOpeningWarm: window.__COMBAT_OPENING_WARM,
      combatRareWarm: window.__COMBAT_RARE_WARM,
      combatWarm: window.__COMBAT_WARM,
    })));
    const stall = await captureStalls(opened.page);
    record('battle', mapId, result.ms, {
      bootMs: opened.readyWallMs,
      specId: result.specId,
      phase: result.phase,
      loadScreen: result.loadScreen,
      stages: result.trace?.stages || null,
      worldTextureUpload: result.trace?.worldTextureUpload || null,
      tracedTotalMs: result.trace?.totalMs ?? null,
      rolloutMs: result.rolloutMs,
      world: result.world || null,
      minimap: result.minimap || null,
      combatWarm: result.combatWarm || null,
      combatOpeningWarm: result.combatOpeningWarm || null,
      combatRareWarm: result.combatRareWarm || null,
      deferredWarm: result.deferredWarm || null,
      prefetch: result.prefetch || null,
      reusedPedestal: result.reusedPedestal,
      playerContactReady: result.playerContactReady,
      markingSeatPaths: result.markingSeatPaths,
      pedestalTrace: result.pedestalTrace,
      startBattle: result.startBattle,
      visualLoadTimings: result.visualLoadTimings,
      countdownWarm: result.countdownWarm || null,
      backgroundStall: garageDwellStall,
      warmTimedOut,
      deferredWarmTimedOut,
      stall,
      invariantPass: result.countdownWarm?.doneBeforeRollout === true
        && result.deferredWarm?.doneBeforeRollout === true
        && result.minimap?.state === 'ready',
      errors: opened.errors,
    });
  } finally {
    await closePage(opened);
  }
}

async function measureDirectStudio(mapId) {
  const opened = await openPage(`?studio=1&map=${encodeURIComponent(mapId)}&nosplash=1&tier=${deviceTier}&gfxreset=1`);
  try {
    await opened.page.waitForFunction(
      (map) => window.__STUDIO?.active === true && window.__STUDIO.mapId === map,
      { timeout: pageTimeoutMs }, mapId,
    );
    const app = await opened.page.evaluate(() => ({
      bootMs: window.__BOOT_MS,
      bootStages: window.__BOOT_TIMINGS,
      studio: window.__STUDIO_LOAD,
      warm: window.__STUDIO_WARM,
      world: window.__WORLD_LOAD,
      phase: window.__DEBUG.game.phase,
    }));
    const stall = await captureStalls(opened.page);
    record('studio', mapId, opened.readyWallMs, {
      appMs: app.bootMs,
      phase: app.phase,
      stages: app.studio?.stages || null,
      tracedTotalMs: app.studio?.totalMs ?? null,
      warm: app.warm || null,
      world: app.world || null,
      bootStages: app.bootStages,
      stall,
      errors: opened.errors,
    });
  } finally {
    await closePage(opened);
  }
}

async function measureStudioSwitches() {
  const first = maps[0] || MAP_IDS[0];
  const opened = await openPage(`?studio=1&map=${encodeURIComponent(first)}&nosplash=1&tier=${deviceTier}&gfxreset=1`);
  try {
    await opened.page.waitForFunction(
      (map) => window.__STUDIO?.active === true && window.__STUDIO.mapId === map,
      { timeout: pageTimeoutMs }, first,
    );
    for (const mapId of maps) {
      await resetStalls(opened.page, `studio-switch:${mapId}`);
      const result = await opened.page.evaluate(async (map) => {
        const startedAt = performance.now();
        await window.__STUDIO.setMap(map);
        return {
          ms: performance.now() - startedAt,
          mapId: window.__STUDIO.mapId,
          world: window.__WORLD_LOAD,
        };
      }, mapId);
      const stall = await captureStalls(opened.page);
      record('studio-switch', mapId, result.ms, {
        activeMap: result.mapId,
        world: result.world || null,
        stall,
        errors: opened.errors.splice(0),
      });
    }
  } finally {
    await closePage(opened);
  }
}

const SCENE_LOAD_FIXTURE = {
  map: 'desert',
  seed: 5000,
  actors: [
    { id: 't90m', name: 'shooter', pos: [-26, -14], facingDeg: 60,
      turretDeg: 0, gunDeg: 1.5, camo: 'desert', state: 'intact', smoking: true },
    { id: 'tiger1', name: 'victim', pos: [26, 16], facingDeg: 285,
      turretDeg: -20, gunDeg: 0, state: 'intact' },
    { id: 'm4a3e8', name: 'wreck', pos: [10, -26], facingDeg: 152,
      turretDeg: 35, gunDeg: -4, state: 'wrecked-burnt', stateAgeS: 240 },
  ],
  effects: [
    { type: 'tank_kill', actor: 'victim', tMs: 60,
      params: { cause: 'ammorack', pop: true } },
    { type: 'dust', actor: 'wreck', tMs: 250,
      params: { count: 12, intensity: 1, dirDeg: 150 } },
    { type: 'fire', actor: 'shooter', tMs: 590,
      params: { slot: 0, tracer: true, recoil: true } },
  ],
  camera: { pos: [-48, 5.5, -34], lookAt: [10, 2.5, 4], groundRel: true, fov: 42 },
  fxTime: 620,
  timeScale: 0,
};

async function measureStudioSceneLoad() {
  const opened = await openPage(`?studio=1&map=desert&nosplash=1&tier=${deviceTier}&gfxreset=1`);
  try {
    await resetStalls(opened.page, 'studio-scene:three-tank');
    const cold = await opened.page.evaluate(async (scene) => {
      const startedAt = performance.now();
      const state = await window.__STUDIO.load(scene);
      return { ms: performance.now() - startedAt, actors: state.actors.length };
    }, SCENE_LOAD_FIXTURE);
    const coldStall = await captureStalls(opened.page);
    record('studio-scene', 'three-tank', cold.ms, {
      invariantPass: cold.actors === 3,
      actors: cold.actors,
      stall: coldStall,
      errors: opened.errors.splice(0),
    });

    await resetStalls(opened.page, 'studio-reload:round-trip');
    const reload = await opened.page.evaluate(async () => {
      const scene = window.__STUDIO.state();
      const startedAt = performance.now();
      const state = await window.__STUDIO.load(scene);
      return { ms: performance.now() - startedAt, actors: state.actors.length };
    });
    const reloadStall = await captureStalls(opened.page);
    record('studio-reload', 'round-trip', reload.ms, {
      invariantPass: reload.actors === 3,
      actors: reload.actors,
      stall: reloadStall,
      errors: opened.errors.splice(0),
    });
  } finally {
    await closePage(opened);
  }
}

async function measureTransitionsAndRematch() {
  const studioPage = await openPage(
    `?studio=1&map=urban&nosplash=1&tier=${deviceTier}&gfxreset=1`,
    { transitions: true },
  );
  try {
    await resetStalls(studioPage.page, 'studio-exit:garage');
    const result = await studioPage.page.evaluate(async () => {
      const startedAt = performance.now();
      window.__STUDIO.exit();
      while (window.__STUDIO.active
          || window.__DEBUG.game.phase !== 'garage'
          || document.querySelector('.cot-trans.on')) {
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      while (!window.__DEBUG.pedestalVisual
          || window.__DEBUG.pedestalVisual.specId !== window.__DEBUG.selectedSpecId
          || window.__DEBUG.pedestalVisual.root.visible === false) {
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      return { ms: performance.now() - startedAt, phase: window.__DEBUG.game.phase };
    });
    const stall = await captureStalls(studioPage.page);
    const garageTrace = await studioPage.page.evaluate(() => ({
      pedestal: window.__PED_TRACE?.slice(-20) || [],
      switches: window.__SWITCH_TIMINGS?.slice(-5) || [],
      entry: window.__GARAGE_ENTRY || null,
    }));
    record('studio-exit', 'garage', result.ms, {
      invariantPass: result.phase === 'garage',
      phase: result.phase,
      stall,
      garageTrace,
      errors: studioPage.errors,
    });
  } finally {
    await closePage(studioPage);
  }

  const battlePage = await openPage(
    `?nosplash=1&tier=${deviceTier}&gfxreset=1`,
    { transitions: true },
  );
  try {
    await resetStalls(battlePage.page, 'battle-entry:urban');
    const entryStartedAt = Date.now();
    await battlePage.page.evaluate(() => window.__DEBUG.beginBattleEntry('m1a2', 'urban'));
    await battlePage.page.waitForFunction(
      'window.__BATTLE_COUNTDOWN_WARM?.done === true', { timeout: pageTimeoutMs },
    );
    await battlePage.page.waitForFunction(
      'window.__BATTLE_DEFERRED_WARM?.done === true', { timeout: pageTimeoutMs },
    );
    const entryStall = await captureStalls(battlePage.page);
    const entryVisuals = await battlePage.page.evaluate(
      () => window.__VISUAL_LOAD_TIMINGS?.slice() || []);
    record('battle-entry', 'urban', Date.now() - entryStartedAt, {
      phase: await battlePage.page.evaluate(() => window.__DEBUG.game.phase),
      stall: entryStall,
      visuals: entryVisuals,
      invariantPass: await battlePage.page.evaluate(() => (
        window.__BATTLE_COUNTDOWN_WARM?.doneBeforeRollout === true
        && window.__BATTLE_DEFERRED_WARM?.doneBeforeRollout === true
      )),
      errors: battlePage.errors.splice(0),
    });
    await resetStalls(battlePage.page, 'battle-exit:garage');
    const exited = await battlePage.page.evaluate(async () => {
      const startedAt = performance.now();
      window.__DEBUG.leaveBattleToGarage();
      while (window.__DEBUG.game.phase !== 'garage'
          || document.querySelector('.cot-trans.on')) {
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      return { ms: performance.now() - startedAt, phase: window.__DEBUG.game.phase };
    });
    const exitStall = await captureStalls(battlePage.page);
    const exitGarageTrace = await battlePage.page.evaluate(() => ({
      pedestal: window.__PED_TRACE?.slice(-20) || [],
      switches: window.__SWITCH_TIMINGS?.slice(-5) || [],
      entry: window.__GARAGE_ENTRY || null,
    }));
    record('battle-exit', 'garage', exited.ms, {
      invariantPass: exited.phase === 'garage',
      phase: exited.phase,
      stall: exitStall,
      garageTrace: exitGarageTrace,
      errors: battlePage.errors.splice(0),
    });

    await resetStalls(battlePage.page, 'battle-rematch:urban:leo2a7v');
    const rematch = await battlePage.page.evaluate(async () => {
      const startedAt = performance.now();
      await window.__DEBUG.beginBattleEntry('leo2a7v', 'urban');
      return {
        ms: performance.now() - startedAt,
        phase: window.__DEBUG.game.phase,
        trace: window.__BATTLE_LOAD,
      };
    });
    await battlePage.page.waitForFunction(
      'window.__BATTLE_COUNTDOWN_WARM?.done === true', { timeout: pageTimeoutMs },
    );
    await battlePage.page.waitForFunction(
      'window.__BATTLE_DEFERRED_WARM?.done === true', { timeout: pageTimeoutMs },
    );
    const rematchWarm = await battlePage.page.evaluate(() => ({
      countdown: window.__BATTLE_COUNTDOWN_WARM,
      deferred: window.__BATTLE_DEFERRED_WARM,
      opening: window.__COMBAT_OPENING_WARM,
      rare: window.__COMBAT_RARE_WARM,
    }));
    const rematchStall = await captureStalls(battlePage.page);
    record('battle-rematch', 'urban', rematch.ms, {
      phase: rematch.phase,
      stages: rematch.trace?.stages || null,
      countdownWarm: rematchWarm.countdown,
      deferredWarm: rematchWarm.deferred,
      combatOpeningWarm: rematchWarm.opening,
      combatRareWarm: rematchWarm.rare,
      stall: rematchStall,
      invariantPass: rematch.phase === 'battle'
        && rematchWarm.countdown?.doneBeforeRollout === true
        && rematchWarm.deferred?.doneBeforeRollout === true,
      errors: battlePage.errors.splice(0),
    });

    // The second return exercises the already-adopted player visual. This is
    // a distinct lifecycle edge: the hero is both the live battle visual and
    // an attached pedestal-cache entry, so a one-exit probe cannot detect it
    // being left at the battlefield pose after a rematch.
    await resetStalls(battlePage.page, 'battle-reexit:garage');
    const reexit = await battlePage.page.evaluate(async () => {
      const startedAt = performance.now();
      window.__DEBUG.leaveBattleToGarage();
      while (window.__DEBUG.game.phase !== 'garage'
          || document.querySelector('.cot-trans.on')) {
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      const visual = window.__DEBUG.pedestalVisual;
      return {
        ms: performance.now() - startedAt,
        phase: window.__DEBUG.game.phase,
        selected: window.__DEBUG.selectedSpecId,
        visualId: visual?.specId || null,
        onStage: window.__DEBUG.pedestalOnStage,
      };
    });
    const reexitStall = await captureStalls(battlePage.page);
    record('battle-reexit', 'garage', reexit.ms, {
      phase: reexit.phase,
      stall: reexitStall,
      invariantPass: reexit.phase === 'garage'
        && reexit.visualId === reexit.selected && reexit.onStage,
      errors: battlePage.errors.splice(0),
    });
  } finally {
    await closePage(battlePage);
  }
}

async function measureTankSwitches() {
  const opened = await openPage(`?nosplash=1&tier=${deviceTier}&gfxreset=1`);
  try {
    const availableIds = await opened.page.evaluate(() => [
      ...document.querySelectorAll('.cot-card[data-spec-id]'),
    ].map((card) => card.dataset.specId));
    const ids = requestedTankIds === 'all'
      ? availableIds
      : requestedTankIds.split(',').map((id) => id.trim()).filter(Boolean);
    const missing = ids.filter((id) => !availableIds.includes(id));
    if (missing.length) throw new Error(`Unknown tank id(s): ${missing.join(', ')}`);
    for (const id of ids) {
      await resetStalls(opened.page, `tank-switch:${id}`);
      if (tankIntentDwellMs > 0) {
        await opened.page.evaluate((specId) => {
          const card = document.querySelector(`.cot-card[data-spec-id="${specId}"]`);
          card?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
        }, id);
        await new Promise((resolve) => setTimeout(resolve, tankIntentDwellMs));
      }
      const result = await opened.page.evaluate(async (specId) => {
        const startedAt = performance.now();
        window.__DEBUG.selectGarageTank(specId);
        for (;;) {
          const visual = window.__DEBUG.pedestalVisual;
          if (visual && visual.specId === specId && visual.root.visible !== false) {
            const timing = [...(window.__SWITCH_TIMINGS || [])]
              .reverse().find((row) => row.id === specId) || null;
            return {
              ms: performance.now() - startedAt,
              selected: window.__DEBUG.selectedSpecId,
              timing,
            };
          }
          if (performance.now() - startedAt >= 10000) {
            return { ms: Infinity, selected: window.__DEBUG.selectedSpecId };
          }
          await new Promise((resolve) => setTimeout(resolve, 8));
        }
      }, id);
      const stall = await captureStalls(opened.page);
      record('tank-switch', id, result.ms, {
        invariantPass: result.selected === id,
        selected: result.selected,
        timing: result.timing,
        intentDwellMs: tankIntentDwellMs,
        stall,
        errors: opened.errors.splice(0),
      });
    }
  } finally {
    await closePage(opened);
  }
}

try {
  if (runBoot) await measureBoot();
  if (runBattle) {
    for (const mapId of maps) await measureBattle(mapId);
  }
  if (runStudio) {
    for (const mapId of maps) await measureDirectStudio(mapId);
  }
  if (runStudioSwitch) await measureStudioSwitches();
  if (runSceneLoad) await measureStudioSceneLoad();
  if (runTransitions) await measureTransitionsAndRematch();
  if (runTankSwitch) await measureTankSwitches();
} finally {
  clearInterval(contentionSampler);
  load1Max = Math.max(load1Max, os.loadavg()[0]);
  sampleGpuContention(ownBrowserPid);
  await browser.close();
  if (typeof server.close === 'function') await server.close();
  else await new Promise((resolve) => server.httpServer.close(resolve));
  if (distDir) await rm(distDir, { recursive: true, force: true });
}

const failures = rows.filter((row) => !row.pass);
const max = rows.reduce((worst, row) => !worst || row.ms > worst.ms ? row : worst, null);
const load1End = os.loadavg()[0];
load1Max = Math.max(load1Max, load1End);
const contended = load1Start > loadLimit
  || load1Max > loadLimit + probeLoadAllowance
  || foreignHeadlessMax > 0
  || foreignGpuCpuMax > gpuCpuLimit;
const report = {
  date: new Date().toISOString(),
  serveMode,
  deviceTier,
  mode,
  limitMs,
  rolloutLimitMs,
  stallLimitMs,
  garageDwellMs,
  battleIntentDwellMs,
  tankIntentDwellMs,
  pass: failures.length === 0 && !contended,
  certification: contended
    ? 'REFUSED — machine contended; scenario numbers are diagnostic only'
    : (failures.length === 0 ? 'PASS' : 'FAIL'),
  machine: {
    cores,
    load1Start: +load1Start.toFixed(2),
    load1End: +load1End.toFixed(2),
    load1Max: +load1Max.toFixed(2),
    loadLimit: +loadLimit.toFixed(2),
    foreignHeadlessMax,
    foreignGpuCpuMax,
    gpuCpuLimit,
    contended,
  },
  scenarios: rows.length,
  max: max ? { kind: max.kind, name: max.name, ms: max.ms } : null,
  failures: failures.map(({ kind, name, ms, errors }) => ({ kind, name, ms, errors })),
  rows,
};
if (contended) {
  console.error(`[loading-budget] CONTENDED: load1 ${report.machine.load1Start} -> ${report.machine.load1End} (max ${report.machine.load1Max}); foreign headless=${foreignHeadlessMax}; interactive GPU CPU=${foreignGpuCpuMax}%. Certification refused.`);
}
console.log(JSON.stringify(report, null, 2));
if (failures.length || contended) process.exitCode = 1;
