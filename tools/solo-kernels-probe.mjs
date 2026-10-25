// Copyright (c) Kevin B. Liu. See NOTICE.md.
//
// Solo battles on the world kernels (docs/RUST-KERNELS.md), in headless Chrome on this checkout's dev server: 16-a-side
// debug battles on a map. With --check, first one on ?simKernels=wasm-check (the TypeScript drives, every kernel answer
// compared); then A B B A cycles timing the main-thread sim (__DEBUG.fastForward, profiled: simStep, movement and the
// support solve a tick) without the flag and with ?simKernels=wasm. Holds the capture lock.
//
//   node tools/solo-kernels-probe.mjs [--map=verdant] [--seconds=20] [--cycles=2] [--check]
//   (report: .qa-dev/solo-kernels-<map>.json)
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { createCaptureLock } from './capture-lock.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const mapId = arg('map', 'verdant');
const seconds = Number(arg('seconds', 20));
const cycles = Number(arg('cycles', 2));
const port = Number(arg('port', 5294));
const out = resolve(root, '.qa-dev', `solo-kernels-${mapId}.json`);

const lock = createCaptureLock();
const vite = await createServer({ root, cacheDir: resolve(root, '.qa-dev/solo-kernels-vite-cache'), logLevel: 'error',
  server: { host: '127.0.0.1', port, strictPort: true, hmr: false } });
await vite.listen();
const origin = `http://127.0.0.1:${port}`;
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 600_000,
  args: ['--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--use-angle=metal', '--enable-gpu'] });

async function battlePage(mode) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  // (a renderer that dies is a crash, not a closed page: name it, with the page's memory when last read)
  page.on('error', (error) => { errors.push(`crash: ${error}`); console.error(`[probe] ${mode ?? 'ts'} page crashed: ${error}`); });
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('cot.game.teams.v1', JSON.stringify({ standard: { allies: 15, enemies: 16 } }));
  });
  await page.goto(`${origin}/?nosplash=1&tier=desktop${mode ? `&simKernels=${mode}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  await page.waitForFunction(() => window.__GAME_READY === true && window.__DEBUG?.game?.phase === 'garage', { timeout: 300_000, polling: 250 });
  await page.evaluate((map) => window.__DEBUG.startBattle('m1a1_abrams_hc', map), mapId);
  await page.waitForFunction(() => window.__DEBUG?.game?.phase === 'battle', { timeout: 300_000, polling: 250 });
  const tanks = await page.evaluate(() => window.__DEBUG.game.tanks.length);
  return { page, errors, tanks };
}

/** Inclusive ms of the named functions (each sample charged once per distinct name on its stack). */
function inclusive(profile, names) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const totals = Object.fromEntries(names.map((n) => [n, 0]));
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = (profile.timeDeltas[i] ?? 0) / 1000;
    const seen = new Set();
    for (let id = profile.samples[i]; id !== undefined; id = parent.get(id)) {
      const name = byId.get(id).callFrame.functionName;
      if (name in totals && !seen.has(name)) { seen.add(name); totals[name] += dt; }
    }
  }
  return totals;
}

const report = { mapId, seconds, cycles, check: null, runs: [] };
try {
  await lock.acquire(90 * 60 * 1000);
  // the comparison: the TypeScript drives a battle, the kernels answer beside it
  if (process.argv.includes('--check')) {
    const { page, errors, tanks } = await battlePage('wasm-check');
    const ff = await page.evaluate((s) => { const t0 = performance.now(); window.__DEBUG.fastForward(s); return performance.now() - t0; }, seconds);
    report.check = { tanks, ms: Math.round(ff), kernels: await page.evaluate(() => window.__SIM_KERNELS ?? null), errors };
    console.log('check', JSON.stringify(report.check));
    await page.close();
  }
  // A B B A: the main-thread sim, warmed 5 s first
  const order = [];
  for (let c = 0; c < cycles; c++) order.push(...(c % 2 ? ['wasm', null] : [null, 'wasm']));
  for (const mode of order) {
    const { page, errors, tanks } = await battlePage(mode);
    await page.evaluate(() => window.__DEBUG.fastForward(5));
    const cdp = await page.target().createCDPSession();
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await cdp.send('Profiler.start');
    const heapBefore = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
    const timing = await page.evaluate((s) => {
      const t0 = performance.now(), g0 = window.__DEBUG.game.timeS;
      window.__DEBUG.fastForward(s);
      return { ms: performance.now() - t0, simS: window.__DEBUG.game.timeS - g0 };
    }, seconds);
    const { profile } = await cdp.send('Profiler.stop');
    const ticks = timing.simS * 60;
    const incl = inclusive(profile, ['simStep', 'stepTankMovement', 'updateTank', 'solveSupportHeight', 'syncFastForwardPresentation', 'update']);
    const run = { mode: mode ?? 'ts', tanks, msPerTick: timing.ms / ticks, simStepMsPerTick: incl.simStep / ticks,
      movementMsPerTick: incl.stepTankMovement / ticks, supportMsPerTick: incl.solveSupportHeight / ticks,
      presentationMsPerTick: incl.syncFastForwardPresentation / ticks, simS: timing.simS, heapMbBefore: heapBefore && Math.round(heapBefore / 1048576),
      kernels: await page.evaluate(() => window.__SIM_KERNELS?.worlds ?? 0), errors: errors.slice(0, 5) };
    report.runs.push(run);
    console.log('run', JSON.stringify(run));
    await page.close();
  }
} finally {
  writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
  lock.release();
  await browser.close();
  await vite.close();
}
