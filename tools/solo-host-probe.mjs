#!/usr/bin/env node
// Copyright (c) Kevin B. Liu. See NOTICE.md.
//
// A solo battle on a local host against today's solo (RUST-ENGINE-DECISION §7 step 5), in headless Chrome on this
// checkout's dev server. Each run enters a solo battle through the Garage's own entry (__DEBUG.beginSoloBattle, or the
// BATTLE button with --click): in the page (?soloAuthority=page) or on a local host (a room in the page, the authority in
// the host's Worker). Once
// the battle runs, it measures the main thread for --seconds of real play: its task time a frame (CDP TaskDuration over
// the frames the page drew) and the frame rate. Runs alternate A B B A per size. Holds the capture lock; --smoke renders
// on SwiftShader (no GPU, no lock) for a functional check: the battle enters on the host and its Worker steps.
//
// --latency=N: the feel gate, N trials of input to motion. The player's hull stands still, W goes down, and the probe
// counts the frames (and ms) until the hull as drawn (its visual root) has moved 1 cm; then W comes up and it settles.
// --cpu-throttle=R slows the page's CPU R times (CDP), for the low frame rates (about 11 fps).
//
// --killcam: the killcam's parity. After the measurement the player drives forward until its hull dies (5 min at most),
// and the probe samples the killcam and the battle clock while it plays: solo's simulation holds through it, and so
// must the local host's authority (the battle frame's hold).
//
// --profile: a CPU profile of the main thread over the measured window, saved per run under .qa-dev/solo-host-profiles/,
// with its self time by file in the report (where each mode's frame goes).
//
// --profile-entry: the same over the entry (beginSoloBattle to the battle phase), with the main thread's busy share of it.
//
// --intent=<ms>: the player's hover before the click: the Garage's battle button hears a pointerenter (its battle intent:
// solo's warm, and with the flag the network composition and the prepared host thread), and the entry follows <ms> later.
//
// --subject=worker measures the solo sim Worker (?soloAuthority=worker) against the page instead of the local host. Its
// entry is the BATTLE button (the debug entry keeps the page's simulation), so both modes then enter by --click.
//
// --viewport=WxH sizes the page (1280x720).
//
// --roster-seed=N pins the roster's draw (main.ts draws a seed at boot), so both modes field the same seats.
//
// --dist=<dir> serves a production build (vite preview) instead of the dev server: the entry as a player meets it (the
// dev server loads every module of a path the first time that path runs).
//
// --click enters through the Garage's BATTLE button instead of the debug entry. The host runs always force the host
// (?soloAuthority=host: the page is every solo battle's default again since 256, and the debug entry keeps the page's
// simulation without the flag); the page's runs take its opt-out (?soloAuthority=page).
//
// --battles=N plays N battles in one page, returning to the Garage between them; --memory samples, in each battle and in
// the Garage after each, the page's and the host Worker's JS heaps (two forced collections first) and the browser's
// resident set by process.
//
//   node tools/solo-host-probe.mjs [--map=verdant] [--sizes=7,14] [--seconds=20] [--cycles=1] [--smoke]
//                                  [--latency=12] [--cpu-throttle=6] [--dist=.qa-dev/dist]
//   (report: .qa-dev/solo-host-probe.json)
import { launchGuardedBrowser } from './browser-launch.mjs';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import puppeteer from 'puppeteer';
import { createServer, preview } from 'vite';
import { createCaptureLock } from './capture-lock.mjs';
import { rssByKind } from './battle-memory-probe.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const mapId = arg('map', 'verdant');
const sizes = arg('sizes', '7,14').split(',').map(Number);
const seconds = Number(arg('seconds', 20));
const cycles = Number(arg('cycles', 1));
const smoke = process.argv.includes('--smoke');
const latencyTrials = Number(arg('latency', 0));
const cpuThrottle = Number(arg('cpu-throttle', 1));
const killcamCheck = process.argv.includes('--killcam');
const profileRuns = process.argv.includes('--profile');
const profileEntry = process.argv.includes('--profile-entry');
const intentMs = Number(arg('intent', 0));
const battles = Math.max(1, Number(arg('battles', 1)));
const memoryCheck = process.argv.includes('--memory');
const subject = arg('subject', 'host');
if (subject !== 'host' && subject !== 'worker') throw new Error(`--subject: host or worker, not ${subject}`);
const clickEntry = process.argv.includes('--click') || subject === 'worker';
const rosterSeed = arg('roster-seed', null);
const [viewWidth, viewHeight] = arg('viewport', '1280x720').split('x').map(Number);
const port = Number(arg('port', 5296));
const out = resolve(root, arg('out', '.qa-dev/solo-host-probe.json'));

const lock = smoke ? null : createCaptureLock();
const dist = arg('dist', null);
const vite = dist
  ? await preview({ root, logLevel: 'error', build: { outDir: resolve(root, dist) }, preview: { host: '127.0.0.1', port, strictPort: true } })
  : await createServer({ root, cacheDir: resolve(root, '.qa-dev/solo-host-vite-cache'), logLevel: 'error',
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false } });
if (!dist) await vite.listen();
const origin = `http://127.0.0.1:${port}`;
const browser = await launchGuardedBrowser(puppeteer, { headless: true, protocolTimeout: 600_000, args: ['--no-sandbox',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  ...(smoke ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--enable-gpu'])] });

async function run(mode, size) {
  const page = await browser.newPage();
  await page.setViewport({ width: viewWidth, height: viewHeight });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('error', (error) => errors.push(`crash: ${error}`));
  const log = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
    if (log.length < 60) log.push(`${message.type()}: ${message.text().slice(0, 300)}`);
  });
  const waitFor = (label, predicate, timeout) => page.waitForFunction(predicate, { timeout, polling: 250 }).catch(async (error) => {
    const phase = await page.evaluate(() => window.__DEBUG?.game?.phase ?? null).catch((evaluateError) => `unreadable: ${String(evaluateError).slice(0, 160)}`);
    throw new Error(`${label} (phase ${phase}): ${String(error).slice(0, 120)}\n${log.slice(-25).join('\n')}`);
  });
  await page.evaluateOnNewDocument((sides) => {
    localStorage.setItem('cot.game.teams.v1', JSON.stringify({ standard: sides }));
  }, { allies: size - 1, enemies: size });
  // today's solo: the opt-out (the Battle hover prepares no host); the host: forced, through the BATTLE button (--click) or
  // the debug entry (256: the page is the default again, and the debug entry keeps the page's simulation otherwise)
  const authority = `&soloAuthority=${mode}`;
  await page.goto(`${origin}/?nosplash=1&tier=desktop${authority}`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  await waitFor('the garage', () => window.__GAME_READY === true && window.__DEBUG?.game?.phase === 'garage', 300_000);
  const cdp = await page.target().createCDPSession();
  await cdp.send('Performance.enable');
  const battlesRun = [];
  const memoryRows = [];
  const backToGarage = async () => {
    await page.evaluate(() => window.__DEBUG.leaveBattleToGarage());
    await waitFor('the garage again', () => window.__DEBUG?.game?.phase === 'garage', 180_000);
    await new Promise((done) => setTimeout(done, 5_000));
  };
  for (let battle = 1; battle <= battles; battle++) {
    if (battle > 1) {
      await backToGarage();
      if (memoryCheck) memoryRows.push({ at: `garage after battle ${battle - 1}`, ...(await memory(page, cdp)) });
    }
    const played = await playBattle(page, cdp, mode, size, waitFor, battle === 1);
    if (memoryCheck) played.memoryInBattle = await memory(page, cdp);
    battlesRun.push(played);
  }
  if (memoryCheck) {
    await backToGarage();
    memoryRows.push({ at: `garage after battle ${battles}`, ...(await memory(page, cdp)) });
  }
  const [first, ...later] = battlesRun;
  const result = { mode, size, ...first,
    ...(later.length ? { laterBattles: later.map(({ revealMs, controlMs, entryStages, mainMsPerFrame, fps, simRate, memoryInBattle }) => ({ revealMs, controlMs, entryStages, mainMsPerFrame, fps, simRate, memoryInBattle })) } : {}),
    ...(memoryCheck ? { memory: memoryRows } : {}), errors: errors.slice(0, 6) };
  await page.close();
  return result;
}

/**
 * What the page and its Workers hold now, after two forced collections in each: their JS heaps (CDP Runtime.getHeapUsage,
 * the host Worker's apart) and the browser's resident set by process (a dedicated Worker lives in its page's renderer).
 */
async function memory(page, cdp) {
  const workers = page.workers();
  for (let pass = 0; pass < 2; pass++) {
    await cdp.send('HeapProfiler.collectGarbage');
    for (const worker of workers) { try { await worker.client.send('HeapProfiler.collectGarbage'); } catch { /* a closing Worker */ } }
    await new Promise((done) => setTimeout(done, 300));
  }
  const mb = (bytes) => Math.round(bytes / 1048576);
  const pageHeap = await cdp.send('Runtime.getHeapUsage');
  const workerHeaps = [];
  for (const worker of workers) {
    try { workerHeaps.push([worker.url().replace(/^.*\//, '').replace(/\?.*$/, ''), mb((await worker.client.send('Runtime.getHeapUsage')).usedSize)]); }
    catch { /* a closing Worker */ }
  }
  const hostWorkerHeapMB = workerHeaps.filter(([name]) => /matchHostWorker|soloSimWorker/.test(name)).reduce((sum, [, size]) => sum + size, 0);
  return { pageHeapMB: mb(pageHeap.usedSize), hostWorkerHeapMB, workerHeapsMB: workerHeaps, rss: rssByKind(browser.process().pid) };
}

async function playBattle(page, cdp, mode, size, waitFor, firstBattle) {
  let entryCdp = null;
  if (profileEntry && firstBattle) {
    entryCdp = await page.target().createCDPSession();
    await entryCdp.send('Performance.enable');
    await entryCdp.send('Profiler.enable');
    await entryCdp.send('Profiler.setSamplingInterval', { interval: 1000 });
    await entryCdp.send('Profiler.start');
  }
  if (intentMs > 0) {
    // the Garage shows the battle's tank and map, as a player's choice would (the intent warms what is selected)
    await page.evaluate((map) => {
      window.__DEBUG.garage?.setSelected?.('m1a1_abrams_hc');
      window.__DEBUG.garage?.setSelectedMap?.(map);
      document.querySelector('.cot-battle')?.dispatchEvent(new PointerEvent('pointerenter'));
    }, mapId);
    await new Promise((done) => setTimeout(done, intentMs));
  }
  // a click entry takes the Garage's selection: the battle's tank and map, as the debug entry names them
  if (clickEntry && intentMs <= 0) {
    await page.evaluate((map) => { window.__DEBUG.garage?.setSelected?.('m1a1_abrams_hc'); window.__DEBUG.garage?.setSelectedMap?.(map); }, mapId);
  }
  if (rosterSeed !== null) await page.evaluate((seed) => { window.__DEBUG.game.rosterSeed = seed; }, Number(rosterSeed) >>> 0);
  const entryTask0 = entryCdp ? (await entryCdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration')?.value ?? 0 : 0;
  const started = performance.now();
  // the page's own marks, a frame each: the click; the reveal (the loading cover, .cot-bl, leaving after it showed); the
  // control (the battle clock running: both modes start it when the countdown ends)
  await page.evaluate((map, click) => {
    const marks = window.__soloProbeEntry = { clickAt: performance.now(), shownAt: null, revealAt: null, controlAt: null };
    const watch = () => {
      const covered = !!document.querySelector('.cot-bl.on');
      const at = performance.now();
      if (marks.shownAt === null && covered) marks.shownAt = at;
      if (marks.shownAt !== null && marks.revealAt === null && !covered) marks.revealAt = at;
      if (marks.revealAt !== null && marks.controlAt === null && (window.__DEBUG?.game?.timeS ?? 0) > 0) marks.controlAt = at;
      if (marks.controlAt === null) requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
    if (click) document.querySelector('.cot-battle')?.click();
    else void window.__DEBUG.beginSoloBattle({ specId: 'm1a1_abrams_hc', mapId: map });
  }, mapId, clickEntry);
  // (a network battle's game.tanks holds the hulls the viewer may see; its roster is rosterTanks)
  await waitFor('the battle', () => window.__DEBUG?.game?.phase === 'battle'
    && ((window.__DEBUG.game.rosterTanks ?? window.__DEBUG.game.tanks)?.length ?? 0) >= 1, 180_000);
  const entryMs = Math.round(performance.now() - started);
  let entryProfile = null;
  if (entryCdp) {
    const entryTask1 = (await entryCdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration')?.value ?? 0;
    const { profile } = await entryCdp.send('Profiler.stop');
    const dir = resolve(root, '.qa-dev/solo-host-profiles');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `entry-${mode}-${size}-${Date.now()}.cpuprofile`), JSON.stringify(profile));
    entryProfile = { busyMs: Math.round((entryTask1 - entryTask0) * 1000), wallMs: entryMs, files: selfTimeByFile(profile, 1) };
  }
  // past the countdown (the battle clock running), then the first seconds' warm-up
  await waitFor('the battle clock', () => (window.__DEBUG.game.timeS ?? 0) > 2, 120_000);
  const marks = await page.evaluate(() => window.__soloProbeEntry);
  const sinceClick = (at) => (at === null ? null : Math.round(at - marks.clickAt));
  const revealMs = sinceClick(marks.revealAt), controlMs = sinceClick(marks.controlAt);
  await new Promise((done) => setTimeout(done, 3_000));
  if (cpuThrottle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  const metric = async (name) => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === name)?.value ?? 0;
  await page.evaluate(() => {
    window.__soloProbeFrames = 0;
    const count = () => { window.__soloProbeFrames++; requestAnimationFrame(count); };
    requestAnimationFrame(count);
  });
  const clock = () => page.evaluate(() => window.__DEBUG.game.timeS ?? 0);
  if (profileRuns && firstBattle) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
    await cdp.send('Profiler.start');
  }
  const task0 = await metric('TaskDuration'), frames0 = await page.evaluate(() => window.__soloProbeFrames), t0 = performance.now(), sim0 = await clock();
  await new Promise((done) => setTimeout(done, seconds * 1000));
  const task1 = await metric('TaskDuration'), frames1 = await page.evaluate(() => window.__soloProbeFrames), t1 = performance.now(), sim1 = await clock();
  let profileFiles = null;
  if (profileRuns && firstBattle) {
    const { profile } = await cdp.send('Profiler.stop');
    const dir = resolve(root, '.qa-dev/solo-host-profiles');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `${mode}-${size}-${Date.now()}.cpuprofile`), JSON.stringify(profile));
    profileFiles = selfTimeByFile(profile, Math.max(1, frames1 - frames0));
  }
  if (cpuThrottle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const frames = Math.max(1, frames1 - frames0);
  const state = await page.evaluate(() => {
    const game = window.__DEBUG.game, network = window.__DEBUG.network;
    // the entry's own stages: the composition's load trace on the host, the solo sim's on the Worker, the solo loading's in
    // the page; and the world activation's (both modes: was the battlefield cached, how long its build took)
    const trace = window.__NETWORK_LOAD ?? window.__SOLO_SIM_LOAD ?? window.__BATTLE_LOAD ?? null;
    const world = window.__WORLD_LOAD ?? null;
    const hostBoot = window.__HOST_BOOT ?? null;
    return { streamedRoster: trace?.streamedRoster ?? null, tanks: (game.rosterTanks ?? game.tanks).length, timeS: game.timeS ?? null,
      entryStages: trace?.stages ?? null, worldCached: trace?.worldCached ?? world?.cached ?? null, hostBoot,
      worldStages: world?.stageIntervals ? world.stageIntervals.map((s) => [s.stage, Math.round((s.endTime ?? s.startTime) - s.startTime)]) : (world?.stages ?? null),
      network: network ? { phase: network.session?.phase ?? network.phase ?? null, role: network.session?.role ?? null,
        hostTick: network.session?.p2p?.tick ?? network.session?.host?.tick ?? null } : null };
  });
  const workers = page.workers().map((worker) => worker.url().replace(/^.*\//, ''));
  // what the host Worker fetched (its chunk graph, the roster's anatomy, the battlefield's collision): names and bytes
  let workerFetches = null;
  for (const worker of page.workers()) {
    if (!/matchHostWorker|soloSimWorker/.test(worker.url())) continue;
    try {
      workerFetches = await worker.evaluate(() => performance.getEntriesByType('resource')
        .map((entry) => [entry.name.replace(/^.*\//, '').replace(/\?.*$/, ''), Math.round(entry.decodedBodySize)]));
    } catch { /* a closing Worker */ }
  }
  const latency = latencyTrials > 0 && firstBattle ? await measureLatency(page, latencyTrials) : null;
  const killcam = killcamCheck && firstBattle ? await watchKillcam(page) : null;
  return { tanks: state.tanks, network: state.network, entryMs, revealMs, controlMs, streamedRoster: state.streamedRoster, entryStages: state.entryStages,
    worldCached: state.worldCached, worldStages: state.worldStages, hostBoot: state.hostBoot, entryProfile, frames, fps: frames / ((t1 - t0) / 1000),
    mainMsPerFrame: ((task1 - task0) * 1000) / frames, battleTimeS: state.timeS,
    // battle seconds a real second over the window (1: the simulation keeps real time)
    simRate: (sim1 - sim0) / ((t1 - t0) / 1000), workers, workerFetches, latency, killcam, profileFiles };
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
      // the hull as drawn (its visual root), in both modes: solo's state is the simulation's newest tick, not what is drawn
      const pos = () => { const p = window.__DEBUG.game.player?.visual?.root?.position ?? window.__DEBUG.game.player?.state?.pos; return p ? { x: p.x, z: p.z } : null; };
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
      const p = window.__DEBUG.game.player.visual?.root?.position ?? window.__DEBUG.game.player.state.pos;
      window.__soloProbeLatency = { from: { x: p.x, z: p.z }, keyAt: null, frames: 0, ms: null };
      const watch = () => {
        const probe = window.__soloProbeLatency;
        if (probe.keyAt !== null) {
          probe.frames++;
          const now = window.__DEBUG.game.player?.visual?.root?.position ?? window.__DEBUG.game.player?.state?.pos;
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

/** A profile's self time by script (ms a frame), the 20 dearest. */
function selfTimeByFile(profile, frames) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const totals = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const node = byId.get(profile.samples[i]);
    const url = node?.callFrame.url ? node.callFrame.url.replace(/^.*\/(assets|src)\//, '').replace(/\?.*$/, '') : `(${node?.callFrame.functionName || 'program'})`;
    totals.set(url, (totals.get(url) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
  }
  return [...totals].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([file, ms]) => [file, Math.round((ms / frames) * 100) / 100]);
}

/** Drive forward until the player's hull dies, then sample the killcam and the battle clock while it plays. */
async function watchKillcam(page) {
  await page.keyboard.down('KeyW');
  const died = await page.waitForFunction(() => window.__DEBUG.game.player?.combat?.destroyed === true || !!window.__DEBUG.game.result,
    { timeout: 300_000, polling: 250 }).then(() => true, () => false);
  await page.keyboard.up('KeyW');
  if (!died) return { died: false };
  return page.evaluate(() => new Promise((done) => {
    const game = window.__DEBUG.game, killcam = window.__DEBUG.killcam;
    const samples = [];
    const startedAt = performance.now();
    const tick = () => {
      samples.push({ ms: Math.round(performance.now() - startedAt), active: !!killcam?.isActive?.(), timeS: game.timeS, result: game.result ?? null });
      const sawIt = samples.some((sample) => sample.active);
      if ((sawIt && !samples.at(-1).active) || performance.now() - startedAt > 30_000) {
        const during = samples.filter((sample) => sample.active);
        done({ died: true, decided: !!game.result, activeMs: during.length ? during.at(-1).ms - during[0].ms : 0,
          clockDuringS: during.length ? during.at(-1).timeS - during[0].timeS : null, samples: samples.length });
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  }));
}

const report = { subject, rosterSeed, viewport: `${viewWidth}x${viewHeight}`, mapId, sizes, seconds, cycles, smoke, latencyTrials, cpuThrottle, killcamCheck, intentMs, dist, loadStart: loadavg()[0], runs: [] };
try {
  if (lock) await lock.acquire(90 * 60 * 1000);
  for (const size of sizes) {
    const order = [];
    for (let c = 0; c < cycles; c++) order.push(...(c % 2 ? [subject, 'page'] : ['page', subject]));
    if (smoke) order.splice(0, order.length, subject);
    for (const mode of order) {
      const load = loadavg()[0];
      const result = { ...(await run(mode, size).catch((error) => ({ mode, size, failed: String(error).slice(0, 6000) }))), load };
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
  if (dist) await new Promise((done) => vite.httpServer.close(() => done()));
  else await vite.close();
}
