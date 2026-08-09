// Desktop development performance probe.
//
// Captures the full DEV flight recorder plus a V8 sample profile while playing
// through battle open. Profiles:
//   normal      host CPU + hardware ANGLE
//   constrained 2x CDP CPU, 4 logical cores, 4 GB reported memory
//   software    constrained CPU plus SwiftShader (stress floor, not an iGPU model)

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
function option(name, fallback) {
  const exact = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (exact) return exact.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}
const profileName = option('profile', 'normal');
const entryMode = option('entry', 'debug');
if (!['debug', 'real'].includes(entryMode)) throw new Error('--entry must be debug or real');
const seconds = Math.max(4, Number(option('seconds', '12')) || 12);
const openTimeoutMs = Math.max(10000, (Number(option('open-timeout', '180')) || 180) * 1000);
const output = resolve(option('out', `.qa-dev/dev-perf-${profileName}.json`));
const profiles = {
  normal: { cpuRate: 1, cores: null, memoryGB: null, softwareGPU: false },
  constrained: { cpuRate: 2, cores: null, memoryGB: null, softwareGPU: false },
  software: { cpuRate: 2, cores: null, memoryGB: null, softwareGPU: true },
};
if (!profiles[profileName]) throw new Error(`unknown --profile=${profileName}; use normal, constrained, or software`);
const selected = { ...profiles[profileName] };
const cpuOverride = Number(option('cpu', ''));
if (cpuOverride > 0) selected.cpuRate = cpuOverride;
const coresOverride = Number(option('cores', ''));
const memoryOverride = Number(option('memory', ''));
if (coresOverride > 0) selected.cores = coresOverride;
if (memoryOverride > 0) selected.memoryGB = memoryOverride;
selected.throttleStage = option('throttle-stage', profileName === 'normal' ? 'boot' : 'live');
if (!['boot', 'countdown', 'live'].includes(selected.throttleStage)) {
  throw new Error('--throttle-stage must be boot, countdown, or live');
}

const percentile = (values, q) => {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
};
function frameWindow(trace, fromMs, toMs) {
  const ix = Object.fromEntries(trace.frameSchema.map((name, i) => [name, i]));
  const frames = trace.frames.filter((row) => row[ix.tMs] >= fromMs && row[ix.tMs] <= toMs);
  const gaps = frames.map((row) => row[ix.gapMs]);
  const programs = frames.map((row) => row[ix.programs]);
  return {
    fromMs: +fromMs.toFixed(1), toMs: +toMs.toFixed(1), frames: frames.length,
    gapP50: +percentile(gaps, .5).toFixed(2), gapP95: +percentile(gaps, .95).toFixed(2),
    gapP99: +percentile(gaps, .99).toFixed(2), maxGapMs: +(Math.max(0, ...gaps)).toFixed(2),
    programBirths: programs.length ? Math.max(...programs) - programs[0] : 0,
    longTasks: trace.events.filter((row) => row.kind === 'anomaly' && row.name === 'longtask'
      && row.tMs >= fromMs && row.tMs <= toMs).length,
    freezes: trace.events.filter((row) => row.kind === 'anomaly'
      && ['screen:freeze', 'sim:freeze', 'render:freeze'].includes(row.name)
      && row.tMs >= fromMs && row.tMs <= toMs).length,
  };
}
function battleOpenWindow(trace) {
  const ix = Object.fromEntries(trace.frameSchema.map((name, i) => [name, i]));
  const explicit = trace.events.find((row) => row.kind === 'mark' && row.name === 'battle:open');
  if (explicit) return frameWindow(trace, explicit.tMs, explicit.tMs + 10000);
  const first = trace.frames.find((row) => row[ix.phase] === 'battle' && row[ix.preBattleS] <= 0);
  if (!first) return null;
  return frameWindow(trace, first[ix.tMs], first[ix.tMs] + 10000);
}
function topSelf(profile, limit = 30) {
  const byFunction = new Map();
  for (const node of profile.nodes || []) {
    const frame = node.callFrame || {};
    const cleanUrl = (frame.url || '').replace(/^.*\/(src|node_modules)\//, '$1/').split('?')[0];
    const key = `${frame.functionName || '(anonymous)'} @ ${cleanUrl}:${(frame.lineNumber ?? -1) + 1}`;
    byFunction.set(key, (byFunction.get(key) || 0) + (node.hitCount || 0));
  }
  const hits = [...byFunction.values()].reduce((sum, n) => sum + n, 0);
  const intervalUs = profile.endTime && profile.startTime && hits
    ? (profile.endTime - profile.startTime) / hits : 500;
  return [...byFunction.entries()]
    .map(([fn, n]) => ({ fn, selfMs: +(n * intervalUs / 1000).toFixed(2) }))
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, limit);
}

const port = 6200 + Math.floor(Math.random() * 500);
const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
  optimizeDeps: {
    entries: ['index.html'],
    include: [
      'three', 'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js',
    ],
  },
});
let browser, page, cdp;
let profilerRunning = false;
let readyWallMs = null;
let bootTrace = null;
let url = '';
const consoleErrors = [];
let watchdogTimer = null, watchdogStage = null;
function armWatchdog(stage) {
  clearTimeout(watchdogTimer);
  watchdogStage = null;
  watchdogTimer = setTimeout(() => {
    watchdogStage = stage;
    // Giant renderer/GPU tasks can block CDP's own timeout callbacks. Kill
    // only this probe-owned Chrome to enforce a real wall-clock bound.
    const ownedBrowser = browser;
    browser = null;
    try { ownedBrowser?.process()?.kill('SIGKILL'); } catch (_) { /* already gone */ }
  }, openTimeoutMs + 15000);
}
function disarmWatchdog() { clearTimeout(watchdogTimer); watchdogTimer = null; }
try {
  await server.listen();
  const launchArgs = ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'];
  if (selected.softwareGPU) launchArgs.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: Math.max(30000, Math.min(300000, openTimeoutMs + 15000)),
    args: launchArgs,
  });
  page = await browser.newPage();
  await page.setViewport({ width: 1365, height: 768, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon')) {
      consoleErrors.push(`console: ${message.text()}`);
    }
  });
  if (selected.cores || selected.memoryGB) {
    await page.evaluateOnNewDocument((cores, memoryGB) => {
      if (cores) Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { configurable: true, get: () => cores });
      if (memoryGB) Object.defineProperty(Navigator.prototype, 'deviceMemory', { configurable: true, get: () => memoryGB });
    }, selected.cores, selected.memoryGB);
  }
  cdp = await page.createCDPSession();
  const emulation = {};
  async function cdpTry(method, params) {
    const rows = emulation[method] ||= [];
    try { await cdp.send(method, params); rows.push({ params, status: 'ok' }); }
    catch (error) { rows.push({ params, status: `unsupported: ${error.message}` }); }
  }
  await cdpTry('Emulation.setCPUThrottlingRate', {
    rate: selected.throttleStage === 'boot' ? selected.cpuRate : 1,
  });
  if (selected.cores) await cdpTry('Emulation.setHardwareConcurrencyOverride', { hardwareConcurrency: selected.cores });
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  // A 0.5 ms sampler materially amplifies the real desktop path's cold GLB +
  // shader loading. Keep the lossless in-page recorder on for that window,
  // then start CPU sampling at battle-open so the diagnostic does not create
  // the multi-minute CDP stall it is trying to measure.
  if (entryMode === 'debug') {
    await cdp.send('Profiler.start');
    profilerRunning = true;
  }

  url = `http://localhost:${server.config.server.port}/?nosplash=1&tier=desktop&gfxreset=1`;
  const bootStarted = Date.now();
  armWatchdog('game-ready-or-battle-open');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.__GAME_READY === true && window.__DEV_TRACE?.enabled === true', { timeout: 240000 });
  await page.bringToFront();
  readyWallMs = Date.now() - bootStarted;
  // Preserve boot events/long tasks before the play window gets a fresh clock.
  // Defer the optional driver query so it cannot contaminate boot attribution.
  bootTrace = await page.evaluate(() => window.__DEV_TRACE.snapshot({ gpu: false }));
  await page.evaluate((metadata) => {
    window.__DEV_TRACE.clear();
    window.__DEV_TRACE.mark('probe:start', metadata);
  }, { profile: profileName, entry: entryMode, seconds, syntheticFreezeExcluded: true });

  // Queue the synchronous battle constructor as a page task, so DevTools gets
  // control back before it starts. The two marks expose its exact wall block.
  await page.evaluate((entry) => {
    setTimeout(async () => {
      window.__DEV_TRACE.mark('battle:start-request', { tank: 'm1a2', entry });
      if (entry === 'real') await window.__DEBUG.beginBattleEntry('m1a2', 'verdant');
      else window.__DEBUG.startBattle('m1a2');
      window.__DEV_TRACE.mark('battle:start-returned', { entry });
    }, 0);
  }, entryMode);
  await page.waitForFunction(
    'window.__DEV_TRACE.tail(20, "mark").some((row) => row.name === "battle:start-returned")',
    { timeout: openTimeoutMs, polling: 50 });
  if (selected.throttleStage === 'countdown') {
    await cdpTry('Emulation.setCPUThrottlingRate', { rate: selected.cpuRate });
    await page.evaluate((rate) => window.__DEV_TRACE.mark('probe:cpu-throttle', { rate }), selected.cpuRate);
  }
  await page.waitForFunction(
    'window.__DEBUG.game.phase === "battle" && window.__DEBUG.game.preBattleS <= 0',
    { timeout: openTimeoutMs, polling: 50 });
  disarmWatchdog();
  if (!profilerRunning) {
    await cdp.send('Profiler.start');
    profilerRunning = true;
  }
  if (selected.throttleStage === 'live') {
    await cdpTry('Emulation.setCPUThrottlingRate', { rate: selected.cpuRate });
    await page.evaluate((rate) => window.__DEV_TRACE.mark('probe:cpu-throttle', { rate }), selected.cpuRate);
  }
  await page.evaluate(() => {
    window.__DEV_TRACE.mark('battle:open', {});
    window.__DEBUG.aimAtNearest();
    window.__DEBUG.flags.forceFire = true;
  });
  await page.keyboard.down('w');
  await new Promise((resolveWait) => setTimeout(resolveWait, Math.round(seconds * 500)));
  await page.keyboard.press('r');
  await new Promise((resolveWait) => setTimeout(resolveWait, Math.round(seconds * 500)));
  await page.keyboard.up('w');
  await page.evaluate(() => {
    window.__DEBUG.flags.forceFire = false;
    const player = window.__DEBUG.game.player;
    if (player?.input) { player.input.throttle = 0; player.input.steer = 0; }
    window.__DEV_TRACE.mark('probe:natural-end', {});
  });

  const naturalStats = await page.evaluate(() => window.__DEV_TRACE.stats());
  const { profile } = await cdp.send('Profiler.stop');
  profilerRunning = false;
  const naturalTrace = await page.evaluate(() => window.__DEV_TRACE.snapshot());
  naturalTrace.stats = naturalStats;
  const loading = await page.evaluate(() => ({
    battle: window.__BATTLE_LOAD || null,
    glb: window.__GLB_STATS || null,
    worldPrefetch: window.__WORLD_PREFETCH || null,
    rosterPrefetch: window.__ROSTER_PREFETCH || null,
  }));

  // Detector falsification: marked and kept out of naturalTrace/topSelf.
  await page.evaluate(() => new Promise((resolveWait) => {
    setTimeout(() => {
      window.__DEV_TRACE.mark('probe:synthetic-freeze:start', { expectedMs: 320 });
      const until = performance.now() + 320;
      while (performance.now() < until) { /* intentional main-thread block */ }
      window.__DEV_TRACE.mark('probe:synthetic-freeze:end', {});
      resolveWait();
    }, 0);
  }));
  await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  const trace = await page.evaluate(() => window.__DEV_TRACE.snapshot());
  const syntheticStart = trace.events.find((row) => row.kind === 'mark' && row.name === 'probe:synthetic-freeze:start');
  const syntheticFreeze = trace.events.find((row) => row.kind === 'anomaly'
    && ['screen:freeze', 'frame:hidden-gap'].includes(row.name)
    && row.seq > (syntheticStart?.seq || Infinity));
  const syntheticLongTask = trace.events.find((row) => row.kind === 'anomaly' && row.name === 'longtask'
    && row.seq > (syntheticStart?.seq || Infinity));
  const result = {
    version: 1, generatedAt: new Date().toISOString(), profile: profileName, entryMode,
    profileConfig: {
      ...selected,
      gpuMeaning: selected.softwareGPU
        ? 'SwiftShader software rasterizer: a severe GPU stress floor, not a calibrated low-end iGPU'
        : 'Host ANGLE renderer; CPU/device traits are the only calibrated constraints',
    },
    cdp: emulation, url, readyWallMs, seconds, bootTrace, loading,
    natural: {
      stats: naturalTrace.stats,
      battleOpen10s: battleOpenWindow(naturalTrace),
      anomalies: naturalTrace.events.filter((row) => row.kind === 'anomaly'),
      topSelf: topSelf(profile),
    },
    syntheticVerification: {
      expectedMs: 320, freezeDetected: !!syntheticFreeze,
      freeze: syntheticFreeze || null, longTaskDetected: !!syntheticLongTask,
    },
    consoleErrors,
    trace,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    output, profile: profileName, readyWallMs,
    gpu: trace.environment.gpu?.renderer || null,
    natural: result.natural.stats, battleOpen10s: result.natural.battleOpen10s,
    syntheticVerification: result.syntheticVerification,
    consoleErrors,
  }, null, 2));
  if (!syntheticFreeze) process.exitCode = 2;
  if (consoleErrors.length) process.exitCode = 3;
} catch (error) {
  let partialTrace = null, partialProfile = null;
  const devToolsResponsive = !(error.name === 'ProtocolError' && /timed out/i.test(error.message));
  if (devToolsResponsive) {
    if (profilerRunning) {
      try { ({ profile: partialProfile } = await cdp.send('Profiler.stop')); } catch (_) { /* renderer unavailable */ }
    }
    try { partialTrace = await page?.evaluate(() => window.__DEV_TRACE?.snapshot() || null); } catch (_) { /* renderer unavailable */ }
  } else {
    // No second protocol wait: this is the very giant-task failure we report.
    try { browser?.process()?.kill('SIGTERM'); } catch (_) { /* already gone */ }
    browser = null;
  }
  profilerRunning = false;
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify({
    version: 1, generatedAt: new Date().toISOString(), profile: profileName,
    profileConfig: selected, failed: true, devToolsResponsive, watchdogStage,
    url, readyWallMs, openTimeoutMs, bootTrace,
    error: { name: error.name, message: error.message, stack: error.stack },
    natural: partialTrace ? {
      stats: partialTrace.stats, battleOpen10s: battleOpenWindow(partialTrace),
      anomalies: partialTrace.events.filter((row) => row.kind === 'anomaly'),
      topSelf: partialProfile ? topSelf(partialProfile) : [],
    } : null,
    consoleErrors, trace: partialTrace,
  }, null, 2)}\n`);
  console.error(`[dev-perf] failed; diagnostic written to ${output}\n${error.stack || error}`);
  process.exitCode = 1;
} finally {
  disarmWatchdog();
  if (browser) await browser.close();
  await server.close();
}
