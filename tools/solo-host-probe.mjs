#!/usr/bin/env node
// Copyright (c) Kevin B. Liu. See NOTICE.md.
//
// A solo battle on a local host against today's solo (RUST-ENGINE-DECISION §7 step 5), in headless Chrome on this
// checkout's dev server. Each run enters a solo battle through the Garage's own entry (__DEBUG.beginSoloBattle): in the
// page (no flag) or on a local host (?soloAuthority=host: a room in the page, the authority in the host's Worker). Once
// the battle runs, it measures the main thread for --seconds of real play: its task time a frame (CDP TaskDuration over
// the frames the page drew) and the frame rate. Runs alternate A B B A per size. Holds the capture lock; --smoke renders
// on SwiftShader (no GPU, no lock) for a functional check: the battle enters on the host and its Worker steps.
//
// --latency=N: the feel gate, N trials of input to motion. The player's hull stands still, W goes down, and the probe
// counts the frames (and ms) until the hull the page presents has moved 1 cm; then W comes up and the hull settles.
// --cpu-throttle=R slows the page's CPU R times (CDP), for the low frame rates (about 11 fps).
//
//   node tools/solo-host-probe.mjs [--map=verdant] [--sizes=7,14] [--seconds=20] [--cycles=1] [--smoke]
//                                  [--latency=12] [--cpu-throttle=6]
//   (report: .qa-dev/solo-host-probe.json)
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { createCaptureLock } from './capture-lock.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const mapId = arg('map', 'verdant');
const sizes = arg('sizes', '7,14').split(',').map(Number);
const seconds = Number(arg('seconds', 20));
const cycles = Number(arg('cycles', 1));
const smoke = process.argv.includes('--smoke');
const latencyTrials = Number(arg('latency', 0));
const cpuThrottle = Number(arg('cpu-throttle', 1));
const port = Number(arg('port', 5296));
const out = resolve(root, '.qa-dev', 'solo-host-probe.json');

const lock = smoke ? null : createCaptureLock();
const vite = await createServer({ root, cacheDir: resolve(root, '.qa-dev/solo-host-vite-cache'), logLevel: 'error',
  server: { host: '127.0.0.1', port, strictPort: true, hmr: false } });
await vite.listen();
const origin = `http://127.0.0.1:${port}`;
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 600_000, args: ['--no-sandbox',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  ...(smoke ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--enable-gpu'])] });

async function run(mode, size) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('error', (error) => errors.push(`crash: ${error}`));
  const log = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
    if (log.length < 60) log.push(`${message.type()}: ${message.text().slice(0, 300)}`);
  });
  const waitFor = (label, predicate, timeout) => page.waitForFunction(predicate, { timeout, polling: 250 }).catch(async (error) => {
    const phase = await page.evaluate(() => window.__DEBUG?.game?.phase ?? null).catch(() => 'unreadable');
    throw new Error(`${label} (phase ${phase}): ${String(error).slice(0, 120)}\n${log.slice(-25).join('\n')}`);
  });
  await page.evaluateOnNewDocument((sides) => {
    localStorage.setItem('cot.game.teams.v1', JSON.stringify({ standard: sides }));
  }, { allies: size - 1, enemies: size });
  await page.goto(`${origin}/?nosplash=1&tier=desktop${mode === 'host' ? '&soloAuthority=host' : ''}`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  await waitFor('the garage', () => window.__GAME_READY === true && window.__DEBUG?.game?.phase === 'garage', 300_000);
  const started = performance.now();
  await page.evaluate((map) => { void window.__DEBUG.beginSoloBattle({ specId: 'm1a1_abrams_hc', mapId: map }); }, mapId);
  // (a network battle's game.tanks holds the hulls the viewer may see; its roster is rosterTanks)
  await waitFor('the battle', () => window.__DEBUG?.game?.phase === 'battle'
    && ((window.__DEBUG.game.rosterTanks ?? window.__DEBUG.game.tanks)?.length ?? 0) > 1, 180_000);
  const entryMs = Math.round(performance.now() - started);
  // the countdown and the first seconds' warm-up
  await new Promise((done) => setTimeout(done, 8_000));
  const cdp = await page.target().createCDPSession();
  if (cpuThrottle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  await cdp.send('Performance.enable');
  const metric = async (name) => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === name)?.value ?? 0;
  await page.evaluate(() => {
    window.__soloProbeFrames = 0;
    const count = () => { window.__soloProbeFrames++; requestAnimationFrame(count); };
    requestAnimationFrame(count);
  });
  const task0 = await metric('TaskDuration'), frames0 = await page.evaluate(() => window.__soloProbeFrames), t0 = performance.now();
  await new Promise((done) => setTimeout(done, seconds * 1000));
  const task1 = await metric('TaskDuration'), frames1 = await page.evaluate(() => window.__soloProbeFrames), t1 = performance.now();
  const frames = Math.max(1, frames1 - frames0);
  const state = await page.evaluate(() => {
    const game = window.__DEBUG.game, network = window.__DEBUG.network;
    return { tanks: (game.rosterTanks ?? game.tanks).length, timeS: game.timeS ?? null,
      network: network ? { phase: network.session?.phase ?? network.phase ?? null, role: network.session?.role ?? null,
        hostTick: network.session?.p2p?.tick ?? network.session?.host?.tick ?? null } : null };
  });
  const workers = page.workers().map((worker) => worker.url().replace(/^.*\//, ''));
  const latency = latencyTrials > 0 ? await measureLatency(page, latencyTrials) : null;
  const result = { mode, size, tanks: state.tanks, network: state.network, entryMs, frames, fps: frames / ((t1 - t0) / 1000),
    mainMsPerFrame: ((task1 - task0) * 1000) / frames, battleTimeS: state.timeS, workers, latency, errors: errors.slice(0, 6) };
  await page.close();
  return result;
}

/**
 * Input to motion: from W's keydown to the first frame whose presented own hull lies 1 cm from where it stood. Each trial
 * waits for the hull to settle first (a frame-to-frame step under 1 mm for half a second).
 */
async function measureLatency(page, trials) {
  const samples = [];
  for (let trial = 0; trial < trials; trial++) {
    await page.evaluate(() => new Promise((settled) => {
      let still = 0, last = null;
      const pos = () => { const p = window.__DEBUG.game.player?.state?.pos; return p ? { x: p.x, z: p.z } : null; };
      const check = () => {
        const now = pos();
        if (now && last && Math.hypot(now.x - last.x, now.z - last.z) < 0.001) still++; else still = 0;
        last = now;
        if (still >= 30) settled(); else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    }));
    // the page arms its frame watch first, then the key goes down
    await page.evaluate(() => {
      const p = window.__DEBUG.game.player.state.pos;
      window.__soloProbeLatency = { from: { x: p.x, z: p.z }, keyAt: null, frames: 0, ms: null };
      const watch = () => {
        const probe = window.__soloProbeLatency;
        if (probe.keyAt !== null) {
          probe.frames++;
          const now = window.__DEBUG.game.player?.state?.pos;
          if (now && Math.hypot(now.x - probe.from.x, now.z - probe.from.z) >= 0.01) { probe.ms = performance.now() - probe.keyAt; return; }
          if (probe.frames > 600) return;
        }
        requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
      window.addEventListener('keydown', () => { window.__soloProbeLatency.keyAt ??= performance.now(); }, { once: true, capture: true });
    });
    await page.keyboard.down('KeyW');
    await page.waitForFunction(() => window.__soloProbeLatency.ms !== null || window.__soloProbeLatency.frames > 600, { timeout: 60_000, polling: 50 });
    const sample = await page.evaluate(() => ({ frames: window.__soloProbeLatency.frames, ms: window.__soloProbeLatency.ms }));
    await page.keyboard.up('KeyW');
    samples.push(sample);
    await new Promise((done) => setTimeout(done, 1_500));
  }
  const frames = samples.map((s) => s.frames).sort((a, b) => a - b), ms = samples.filter((s) => s.ms !== null).map((s) => s.ms).sort((a, b) => a - b);
  return { trials: samples, framesP50: frames[frames.length >> 1], msP50: ms[ms.length >> 1] ?? null };
}

const report = { mapId, sizes, seconds, cycles, smoke, latencyTrials, cpuThrottle, loadStart: loadavg()[0], runs: [] };
try {
  if (lock) await lock.acquire(90 * 60 * 1000);
  for (const size of sizes) {
    const order = [];
    for (let c = 0; c < cycles; c++) order.push(...(c % 2 ? ['host', 'page'] : ['page', 'host']));
    if (smoke) order.splice(0, order.length, 'host');
    for (const mode of order) {
      const result = await run(mode, size).catch((error) => ({ mode, size, failed: String(error).slice(0, 6000) }));
      report.runs.push(result);
      console.log('run', JSON.stringify(result));
      writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
    }
  }
} finally {
  report.loadEnd = loadavg()[0];
  writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
  lock?.release();
  await browser.close();
  await vite.close();
}
