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
//   node tools/loading-budget-probe.mjs --serve dev --mode studio

// Exit 0 means every measured path completed in strictly less than the limit.

import { build, createServer, preview } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
const mode = option('mode', 'all');
const serveMode = option('serve', 'production');
const deviceTier = option('tier', 'desktop');
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
  if (!MAP_IDS.includes(id)) throw new Error(`Unknown map '${id}'`);
}

const runBoot = mode === 'all' || mode === 'boot';
const runBattle = mode === 'all' || mode === 'battle';
const runStudio = mode === 'all' || mode === 'studio';
const runStudioSwitch = mode === 'all' || mode === 'studio-switch';
const runSceneLoad = mode === 'all' || mode === 'scene-load';
const runTransitions = mode === 'all' || mode === 'transitions';
const runTankSwitch = mode === 'all' || mode === 'tank-switch';

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

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});

const rows = [];
const pageTimeoutMs = Math.max(30000, limitMs * 4);

function record(kind, name, ms, details = {}) {
  const pass = Number.isFinite(ms) && ms >= 0 && ms < limitMs
    && !(details.errors?.length) && details.invariantPass !== false;
  const row = { kind, name, ms: Math.round(ms), pass, ...details };
  rows.push(row);
  const suffix = details.errors?.length ? ` errors=${details.errors.length}` : '';
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${kind.padEnd(13)} ${name.padEnd(10)} ${String(row.ms).padStart(5)} ms${suffix}`);
  return row;
}

async function openPage(search = '', { transitions = false } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
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
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon')) {
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
    record('boot', 'garage', opened.readyWallMs, {
      appMs: app.bootMs,
      stages: app.timings,
      phase: app.phase,
      errors: opened.errors,
    });
  } finally {
    await closePage(opened);
  }
}

async function measureBattle(mapId) {
  const opened = await openPage(`?nosplash=1&tier=${deviceTier}&gfxreset=1`);
  try {
    const result = await opened.page.evaluate(async (map) => {
      const startedAt = performance.now();
      await window.__DEBUG.beginBattleEntry('m1a2', map);
      return {
        ms: performance.now() - startedAt,
        phase: window.__DEBUG.game.phase,
        loadScreen: !!document.querySelector('.cot-bl.on'),
        trace: window.__BATTLE_LOAD,
        world: window.__WORLD_LOAD,
        combatWarm: window.__COMBAT_WARM,
      };
    }, mapId);
    let warmTimedOut = false;
    try {
      await opened.page.waitForFunction(
        'window.__BATTLE_COUNTDOWN_WARM?.done === true',
        { timeout: 20000 },
      );
    } catch (_) {
      warmTimedOut = true;
    }
    result.countdownWarm = await opened.page.evaluate(() => window.__BATTLE_COUNTDOWN_WARM);
    record('battle', mapId, result.ms, {
      bootMs: opened.readyWallMs,
      phase: result.phase,
      loadScreen: result.loadScreen,
      stages: result.trace?.stages || null,
      tracedTotalMs: result.trace?.totalMs ?? null,
      world: result.world || null,
      combatWarm: result.combatWarm || null,
      countdownWarm: result.countdownWarm || null,
      warmTimedOut,
      invariantPass: result.countdownWarm?.doneBeforeRollout === true,
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
    record('studio', mapId, opened.readyWallMs, {
      appMs: app.bootMs,
      phase: app.phase,
      stages: app.studio?.stages || null,
      tracedTotalMs: app.studio?.totalMs ?? null,
      warm: app.warm || null,
      world: app.world || null,
      bootStages: app.bootStages,
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
      const result = await opened.page.evaluate(async (map) => {
        const startedAt = performance.now();
        await window.__STUDIO.setMap(map);
        return {
          ms: performance.now() - startedAt,
          mapId: window.__STUDIO.mapId,
          world: window.__WORLD_LOAD,
        };
      }, mapId);
      record('studio-switch', mapId, result.ms, {
        activeMap: result.mapId,
        world: result.world || null,
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
    const cold = await opened.page.evaluate(async (scene) => {
      const startedAt = performance.now();
      const state = await window.__STUDIO.load(scene);
      return { ms: performance.now() - startedAt, actors: state.actors.length };
    }, SCENE_LOAD_FIXTURE);
    record('studio-scene', 'three-tank', cold.ms, {
      invariantPass: cold.actors === 3,
      actors: cold.actors,
      errors: opened.errors.splice(0),
    });

    const reload = await opened.page.evaluate(async () => {
      const scene = window.__STUDIO.state();
      const startedAt = performance.now();
      const state = await window.__STUDIO.load(scene);
      return { ms: performance.now() - startedAt, actors: state.actors.length };
    });
    record('studio-reload', 'round-trip', reload.ms, {
      invariantPass: reload.actors === 3,
      actors: reload.actors,
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
    record('studio-exit', 'garage', result.ms, {
      invariantPass: result.phase === 'garage',
      phase: result.phase,
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
    await battlePage.page.evaluate(() => window.__DEBUG.beginBattleEntry('m1a2', 'urban'));
    await battlePage.page.waitForFunction(
      'window.__BATTLE_COUNTDOWN_WARM?.done === true', { timeout: 10000 },
    );
    const exited = await battlePage.page.evaluate(async () => {
      const startedAt = performance.now();
      window.__DEBUG.leaveBattleToGarage();
      while (window.__DEBUG.game.phase !== 'garage'
          || document.querySelector('.cot-trans.on')) {
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      return { ms: performance.now() - startedAt, phase: window.__DEBUG.game.phase };
    });
    record('battle-exit', 'garage', exited.ms, {
      invariantPass: exited.phase === 'garage',
      phase: exited.phase,
      errors: battlePage.errors.splice(0),
    });

    const rematch = await battlePage.page.evaluate(async () => {
      const startedAt = performance.now();
      await window.__DEBUG.beginBattleEntry('m1a2', 'urban');
      return {
        ms: performance.now() - startedAt,
        phase: window.__DEBUG.game.phase,
        trace: window.__BATTLE_LOAD,
      };
    });
    await battlePage.page.waitForFunction(
      'window.__BATTLE_COUNTDOWN_WARM?.done === true', { timeout: 10000 },
    );
    const countdownWarm = await battlePage.page.evaluate(() => window.__BATTLE_COUNTDOWN_WARM);
    record('battle-rematch', 'urban', rematch.ms, {
      phase: rematch.phase,
      stages: rematch.trace?.stages || null,
      countdownWarm,
      invariantPass: rematch.phase === 'battle' && countdownWarm?.doneBeforeRollout === true,
      errors: battlePage.errors.splice(0),
    });
  } finally {
    await closePage(battlePage);
  }
}

async function measureTankSwitches() {
  const opened = await openPage(`?nosplash=1&tier=${deviceTier}&gfxreset=1`);
  try {
    const ids = await opened.page.evaluate(() => [
      ...document.querySelectorAll('.cot-card[data-spec-id]'),
    ].map((card) => card.dataset.specId));
    for (const id of ids) {
      const result = await opened.page.evaluate(async (specId) => {
        const startedAt = performance.now();
        window.__DEBUG.selectGarageTank(specId);
        for (;;) {
          const visual = window.__DEBUG.pedestalVisual;
          if (visual && visual.specId === specId && visual.root.visible !== false) {
            return { ms: performance.now() - startedAt, selected: window.__DEBUG.selectedSpecId };
          }
          if (performance.now() - startedAt >= 10000) {
            return { ms: Infinity, selected: window.__DEBUG.selectedSpecId };
          }
          await new Promise((resolve) => setTimeout(resolve, 8));
        }
      }, id);
      record('tank-switch', id, result.ms, {
        invariantPass: result.selected === id,
        selected: result.selected,
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
  await browser.close();
  if (typeof server.close === 'function') await server.close();
  else await new Promise((resolve) => server.httpServer.close(resolve));
  if (distDir) await rm(distDir, { recursive: true, force: true });
}

const failures = rows.filter((row) => !row.pass);
const max = rows.reduce((worst, row) => !worst || row.ms > worst.ms ? row : worst, null);
const report = {
  date: new Date().toISOString(),
  serveMode,
  deviceTier,
  mode,
  limitMs,
  pass: failures.length === 0,
  scenarios: rows.length,
  max: max ? { kind: max.kind, name: max.name, ms: max.ms } : null,
  failures: failures.map(({ kind, name, ms, errors }) => ({ kind, name, ms, errors })),
  rows,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
