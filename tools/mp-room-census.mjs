#!/usr/bin/env node
// mp-room-census.mjs — UI-LOCKDOWN E's console census for the rooms flow (2026-10-25).
// Copyright (c) 2026 Kevin B. Liu. First-party tool; see NOTICE.md.
//
// Two first-time browsers on a built dist, and one in-process room host (server/rooms/serve.ts, the LAN helper's
// composition) on the port a local page looks for it on (127.0.0.1:8792, src/mp/session/endpoint.ts):
// - A creates a LAN room from the Garage;
// - B opens the invite and joins;
// - both ready, and A starts;
// - both reach the battle, then both leave to the Garage.
// Each stage records both pages' console errors (page errors and failed requests included) and warnings as a
// click-timeline census sample (kind lobby-<stage>: the 'rooms' surface) in <out>/<label>/mp-room.desktop.json, which
// check:frontend scores (a console error anywhere in the flow is a miss for premiere-site). The run exits non-zero on
// any console error.
//
//   node tools/mp-room-census.mjs --dist=<dir> --label=<label> --out=<dir> [--lock] [--budget-min=20]
//     [--map=<id>] [--solo] [--vercel-json=<path>] [--transport=p2p] [--cpu-profile [--no-convolver]] [--battle-eval=<expr>]
//     [--program-log] [--profile-leave] [--leave-first=A|B] [--leave-gap-ms=<ms>] [--profile-solo] [--solo-eval=<expr>]
//     [--gate]   (exit 4 when the leave stage logs a console warning: its budget is 0)
import { launchGuardedBrowser } from './browser-launch.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createRoomsServer } from '../server/rooms/serve.ts';
import { LAN_ROOMS_PORT } from '../src/mp/session/endpoint.ts';
import { createCaptureLock } from './capture-lock.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const dist = resolve(option('dist', 'dist'));
const label = option('label', 'build');
const out = resolve(option('out', 'mp-room-census'));
const useLock = argv.includes('--lock');
const budgetMin = Number(option('budget-min', '20'));
// --map=<id>: the room's battlefield (the lobby's map control, set by the host); without it the room keeps its default
const mapId = option('map', '');
// --solo: before the room, a solo battle on the same battlefield (the page's own kernels, its own CSP reports)
const solo = argv.includes('--solo');
// --vercel-json=<path>: the headers (CSP among them) the preview serves, when the build's own tree is not this one
const vercelJson = option('vercel-json', '');
// --transport=p2p: the match runs in the host commander's browser (its Worker, as production's rooms do) instead of the
// LAN helper's in-process service, so the host's kernels and their CSP show
const transport = option('transport', 'service');
// --cpu-profile: a CPU profile of the host commander's room entry, from the start press to the battle's settle (page A's
// main thread, and each worker A starts in it, the match host's among them), with each long task's heaviest functions
const cpuProfile = argv.includes('--cpu-profile');
// --no-convolver: the reverb's convolver a pass-through gain, so the V8 sampler's signal cannot land in its FFT and wedge
// the renderer (the perf lane's finding, 2026-10-25); the mix is wrong, the main thread's work is the same
const noConvolver = argv.includes('--no-convolver');
// --battle-eval=<expression>: evaluated in both pages once the battle has settled, kept in the battle stage's sample
// (battleEval) and printed (a lane's entry probe: the black watchdog's newPrograms, say)
const battleEval = option('battle-eval', '');
// --program-log: every three program each page's renderer acquires (its name or type and its cache key), so each long
// task of the battle stage names the programs it made and the key parts that differ from the nearest program of that
// name made before it (a program released and made again reads "same key")
const programLog = argv.includes('--program-log');
// --profile-leave: a CPU profile of both pages through the leave to the Garage, each long task attributed (with --solo,
// also the host page's leave from its solo battle: a single player's leave, no second battle in the GPU process)
const profileLeave = argv.includes('--profile-leave');
// --leave-first=A|B and --leave-gap-ms=<ms>: who leaves first (B by default) and how long the other waits after that
// page's Garage is back (0 by default): two pages share the census's GPU process, so a gap keeps one page's Garage
// restore out of the other's round trips
// --profile-solo: with --solo, a CPU profile of the host page's solo battle entry, each long task attributed (300 ms or
// more, or --profile-solo-min-ms=<ms>)
const profileSolo = argv.includes('--profile-solo');
const profileSoloMinMs = Number(option('profile-solo-min-ms', '300')) || 300;
// --solo-eval=<expression>: with --solo, evaluated in the host page once its solo battle has settled (its loading trace,
// window.__BATTLE_LOAD, say), kept on the solo stage's sample (soloEval) and printed
const soloEval = option('solo-eval', '');
// --gate: the run fails (exit 4) when the leave stage logs any console warning (Main 2026-10-26: the rooms' leave has a
// budget of 0 warnings; the stopped host's late heartbeat was refused, host_only / invalid_command)
const gate = argv.includes('--gate');
const leaveFirst = option('leave-first', 'B') === 'A' ? 'A' : 'B';
const leaveGapMs = Number(option('leave-gap-ms', '0')) || 0;
const profiling = { armed: false, live: [], workers: [] };
const profileWorker = async (url, session) => {
  await session.send('Profiler.enable');
  await session.send('Profiler.setSamplingInterval', { interval: 500 });
  await session.send('Profiler.start');
  profiling.workers.push({ url, session });
};
const CSP_TEXT = /Content Security Policy|Content-Security-Policy|\[Report Only\]|Refused to (compile|evaluate|load|execute)/i;
const root = new URL('..', import.meta.url).pathname;
const BOOT_QUERY = 'nosplash=1&tier=desktop&gfxreset=1';
// the deployment's own headers on a plain-http host
const IGNORED = /Cross-Origin-Opener-Policy header has been ignored|origin-agent-cluster/i;

function freePort() {
  return new Promise((done, fail) => {
    const probe = net.createServer();
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)); });
  });
}
function portFree(port) {
  return new Promise((done) => {
    const probe = net.createServer();
    probe.once('error', () => done(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)));
  });
}

/** Each page's console since the last stage: errors (with page errors and failed requests) and warnings. */
function observe(page, name, log) {
  // (Main 2026-10-25) a CSP report is counted on its own, from the page console, the page's securitypolicyviolation
  // events and each worker's Log domain (a report-only refusal in the match host's Worker never reaches the page)
  page.evaluateOnNewDocument((passThroughConvolver, logPrograms) => {
    // each page's long tasks (the entry's longest is the perf lane's question), read and cleared per stage; their spans
    // place them in a CPU profile
    window.__censusLongTasks = [];
    window.__censusLongSpans = [];
    window.__censusTaskSpans = [];
    try { new PerformanceObserver((list) => { for (const e of list.getEntries()) { window.__censusLongTasks.push(Math.round(e.duration)); window.__censusLongSpans.push([e.startTime, e.duration]); window.__censusTaskSpans.push([e.startTime, e.duration]); } })
      .observe({ type: 'longtask', buffered: true }); } catch { /* no long task timing */ }
    if (logPrograms) {
      window.__censusPrograms = [];
      let drawing = null;
      const path = (object) => {
        const names = [];
        for (let o = object, i = 0; o && i < 5; o = o.parent, i++) names.push(`${o.name || o.type || '?'}${o.visible === false ? '(hidden)' : ''}`);
        return names.join('<');
      };
      const drawer = () => {
        if (!drawing) return 'compile or setup (no draw)';
        const { object, material, scene } = drawing;
        return `${scene ? 'forward' : 'shadow'} ${path(object)} [${material?.name || material?.type || '?'}]`;
      };
      // the calling chunks past three's own frames (its module, core and the render-layer wrapper)
      const stack = () => {
        const limit = Error.stackTraceLimit;
        Error.stackTraceLimit = 60; // V8 keeps 10 frames, all of them three's inside a draw
        try { return new Error().stack || ''; } finally { Error.stackTraceLimit = limit; }
      };
      const chunks = () => stack().split('\n').slice(3, 60).map((line) => (line.match(/([\w.-]+\.js):(\d+)/) || [])[0] || '')
        .filter((frame) => frame && !/^(three\.(module|core)|renderLayers)-/.test(frame))
        .filter((frame, i, all) => all.indexOf(frame) === i).slice(0, 6).join(' ');
      const logProgram = (t, program) => window.__censusPrograms.length < 8000 && window.__censusPrograms.push({ t, name: program.name || program.type || '?',
        parts: String(program.cacheKey ?? '').split(',').map((part) => part.slice(0, 80)), drawer: t ? drawer() : null, stack: t ? chunks() : null });
      const install = () => {
        const renderer = window.__DEBUG?.renderer;
        const programs = renderer?.info?.programs;
        if (!programs) return false;
        const direct = renderer.renderBufferDirect;
        renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
          const outer = drawing;
          drawing = { object, material, scene };
          try { return direct.call(this, camera, scene, geometry, material, object, group); } finally { drawing = outer; }
        };
        for (const program of programs) logProgram(0, program);
        const push = programs.push;
        programs.push = function (...made) { for (const program of made) logProgram(performance.now(), program); return push.apply(this, made); };
        return true;
      };
      const timer = setInterval(() => { if (install()) clearInterval(timer); }, 50);
    }
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__cspViolations.push(`${e.disposition} ${e.effectiveDirective} ${e.blockedURI}`));
    if (passThroughConvolver) {
      for (const proto of [window.BaseAudioContext?.prototype, window.AudioContext?.prototype, window.OfflineAudioContext?.prototype]) {
        if (proto && 'createConvolver' in proto) proto.createConvolver = function () { return this.createGain(); };
      }
      if (window.ConvolverNode) window.ConvolverNode = function ConvolverNode(context) { return context.createGain(); };
    }
  }, noConvolver, programLog).catch(() => {});
  page.on('workercreated', async (worker) => {
    try {
      const session = worker.client;
      session.on('Log.entryAdded', ({ entry }) => { if (CSP_TEXT.test(entry.text)) log.csp.push(`${name} worker ${worker.url().split('/').pop()}: ${entry.text.slice(0, 200)}`); });
      // the worker's own requests (a cached module included): the match host's kernels fetch
      session.on('Network.requestWillBeSent', ({ request }) => { if (/\.wasm(\?|$)/.test(request.url)) log.wasm.push(`${name} worker: ${request.url.split('/').pop()}`); });
      await session.send('Log.enable');
      await session.send('Network.enable').catch(() => {});
      if (name === 'A') {
        profiling.live.push({ url: worker.url(), session });
        if (profiling.armed) await profileWorker(worker.url(), session);
      }
    } catch { /* a worker that ended at once */ }
  });
  page.on('console', async (m) => {
    if (CSP_TEXT.test(m.text())) log.csp.push(`${name}: ${m.text().slice(0, 200)}`);
    if (IGNORED.test(m.text())) return;
    // an Error logged with the message travels as an argument: its stack names where the entry failed
    if (m.type() === 'error') {
      log.errors.push(`${name}: ${m.text().slice(0, 240)}`);
      for (const arg of m.args()) {
        const stack = await arg.evaluate((value) => (value instanceof Error ? value.stack : null)).catch(() => null);
        if (stack) log.errors.push(`${name}:   stack ${stack.split('\n').slice(0, 9).join(' | ').slice(0, 900)}`);
      }
    }
    else if (m.type() === 'warn') log.warnings.push(`${name}: ${m.text().slice(0, 240)}`);
  });
  page.on('pageerror', (e) => log.errors.push(`${name}: pageerror ${String(e?.message || e).split('\n')[0]}`));
  page.on('requestfailed', (r) => { if (!/net::ERR_ABORTED/.test(r.failure()?.errorText ?? '')) log.errors.push(`${name}: request failed ${r.url()} ${r.failure()?.errorText ?? ''}`); });
  page.on('response', (r) => {
    if (r.status() >= 400) log.errors.push(`${name}: ${r.status()} ${r.url()}`);
    // the world kernels' module (the page's and the match host Worker's fetch): the kernels ran where it was fetched
    if (/\.wasm(\?|$)/.test(r.url())) log.wasm.push(`${name}: ${r.url().split('/').pop()}`);
  });
}

/** Each window's heaviest functions in a CPU profile: self and inclusive time, on a clock `origin` ms behind the profile's. */
function attribute(profile, windows, origin) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const label = (n) => `${n.callFrame.functionName || '(anon)'} ${String(n.callFrame.url).split('/').pop()}:${n.callFrame.lineNumber + 1}`;
  let t = profile.startTime;
  const samples = profile.samples.map((id, i) => { t += profile.timeDeltas[i]; return { id, ms: t / 1000 - origin }; });
  return windows.map(([start, ms]) => {
    const self = new Map(), total = new Map();
    let n = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      if (s.ms < start || s.ms > start + ms) continue;
      const node = nodes.get(s.id);
      if (node.callFrame.functionName === '(idle)') continue;
      const dt = i + 1 < samples.length ? samples[i + 1].ms - s.ms : 0.5;
      n++;
      self.set(label(node), (self.get(label(node)) ?? 0) + dt);
      const seen = new Set();
      for (let cur = s.id; cur != null; cur = parent.get(cur)) {
        const l = label(nodes.get(cur));
        if (seen.has(l)) continue;
        seen.add(l);
        total.set(l, (total.get(l) ?? 0) + dt);
      }
    }
    const top = (map, k) => [...map].sort((a, b) => b[1] - a[1]).slice(0, k).map(([l, v]) => `${v.toFixed(0).padStart(6)} ms  ${l}`);
    return { startMs: Math.round(start), ms: Math.round(ms), samples: n, self: top(self, 15), total: top(total, 30) };
  });
}

const samples = [];
const log = { errors: [], warnings: [], csp: [], wasm: [] };
let pagesForStage = [];
const stage = async (name, startedAt) => {
  // each page's own violation events since the last stage, and the world kernels as the page reports them
  const pageState = await Promise.all(pagesForStage.map((page) => page.evaluate(() => ({ csp: (window.__cspViolations ?? []).splice(0),
    longTasks: (window.__censusLongTasks ?? []).splice(0), entryFailure: window.__NETWORK_ENTRY_FAILURE ?? null,
    kernels: globalThis.__SIM_KERNELS ? { mode: globalThis.__SIM_KERNELS.mode, worlds: globalThis.__SIM_KERNELS.worlds } : null })).catch(() => null)));
  const csp = [...log.csp.splice(0), ...pageState.flatMap((p, i) => (p?.csp ?? []).map((v) => `${'AB'[i]} event: ${v}`))];
  samples.push({ kind: `lobby-${name}`, census: { consoleErrors: log.errors.splice(0), consoleWarnings: log.warnings.length,
    consoleWarningTexts: log.warnings.splice(0), cspReports: csp, kernels: pageState.map((p) => p?.kernels ?? null), wasmFetches: log.wasm.splice(0),
    longTasks: pageState.map((p) => { const t = p?.longTasks ?? []; return { count: t.length, totalMs: t.reduce((a, b) => a + b, 0), longestMs: t.length ? Math.max(...t) : 0 }; }),
    entryFailures: pageState.map((p) => p?.entryFailure ?? null) },
    wallMs: Math.round(performance.now() - startedAt) });
  const last = samples.at(-1).census;
  console.log(`lobby-${name.padEnd(8)} ${String(last.consoleErrors.length).padStart(2)} errors ${String(last.consoleWarnings).padStart(2)} warnings `
    + `${String(csp.length).padStart(2)} csp  kernels ${JSON.stringify(last.kernels)}  wasm ${JSON.stringify(last.wasmFetches)}`
    + `  longest task ${last.longTasks.map((t, i) => `${'AB'[i]} ${t.longestMs} ms (${t.count})`).join(', ')}`
    + `${last.entryFailures.some(Boolean) ? `  ENTRY FAILED ${JSON.stringify(last.entryFailures)}` : ''}`
    + `${last.consoleErrors.length ? `\n    ${last.consoleErrors.join('\n    ')}` : ''}${csp.length ? `\n    ${csp.slice(0, 6).join('\n    ')}` : ''}`);
};

const lock = useLock ? createCaptureLock() : null;
let rooms = null, server = null, browser = null, pages = [];
try {
  if (lock) {
    await lock.acquire(150 * 60 * 1000, { place: `mp-room-census-${label}` });
    setInterval(() => lock.refresh(), 30_000).unref();
    setTimeout(() => { console.error(`mp-room-census: past its ${budgetMin} min budget`); process.exit(3); }, budgetMin * 60_000).unref();
  }
  if (!await portFree(LAN_ROOMS_PORT)) throw new Error(`port ${LAN_ROOMS_PORT} (the LAN room helper's) is in use`);
  rooms = await createRoomsServer({ host: '127.0.0.1', port: LAN_ROOMS_PORT, seatSecret: randomBytes(24).toString('hex'), world: 'terrain',
    matchTransport: transport === 'p2p' ? 'p2p' : 'service' });
  const port = await freePort();
  server = spawn(process.execPath, [join(root, 'tools/vercel-static-preview.mjs'), `--dist=${dist}`, `--port=${port}`,
    ...(vercelJson ? [`--vercel-json=${resolve(vercelJson)}`] : [])], { stdio: 'ignore' });
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100 && !await fetch(origin).then(() => true, () => false); i++) await new Promise((r) => setTimeout(r, 100));

  browser = await launchGuardedBrowser(puppeteer, { headless: true, protocolTimeout: 360_000,
    args: ['--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--use-gl=angle', '--enable-webgl', '--js-flags=--max-old-space-size=3072', '--window-size=1100,720'] });
  // two first-time machines: separate contexts share no storage, cache or player identity
  const [pageA, pageB] = await Promise.all([1, 2].map(async () => (await browser.createBrowserContext()).newPage()));
  pages = [pageA, pageB];
  for (const page of [pageA, pageB]) await page.setViewport({ width: 1024, height: 640, deviceScaleFactor: 1 });
  observe(pageA, 'A', log);
  observe(pageB, 'B', log);
  pagesForStage = [pageA, pageB];
  const garage = () => window.__GAME_READY === true && window.__DEBUG?.game?.phase === 'garage';
  const inBattle = () => window.__MULTIPLAYER_V2?.stats?.().inMatch === true && window.__DEBUG?.game?.phase === 'battle'
    && getComputedStyle(document.querySelector('.cot-bl')).display === 'none';

  let at = performance.now();
  await pageA.goto(`${origin}/?${BOOT_QUERY}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await pageA.waitForFunction(garage, { timeout: 240_000, polling: 100 });
  await stage('boot', at);

  if (solo) {
    at = performance.now();
    const specId = await pageA.evaluate(() => window.__DEBUG?.selectedSpecId ?? window.__DEBUG?.game?.player?.specId ?? null);
    let soloEntryCdp = null, soloEntryFrom = 0;
    if (profileSolo) {
      soloEntryCdp = await pageA.createCDPSession();
      await soloEntryCdp.send('Profiler.enable');
      await soloEntryCdp.send('Profiler.setSamplingInterval', { interval: 500 });
      soloEntryFrom = await pageA.evaluate(() => performance.now());
      await soloEntryCdp.send('Profiler.start');
    }
    // the Garage BATTLE button's covered entry (main.ts beginBattleEntry); the debug startBattle sets the battle up in
    // one task (root-u: an 8.4-27.8 s task no player meets), so it is only the fallback for a build without the former
    await pageA.evaluate((spec, map) => {
      const debug = window.__DEBUG;
      void (debug.beginBattleEntry ?? debug.startBattle)(spec ?? 'm1a2_sepv3', map || null);
    }, specId, mapId);
    await pageA.waitForFunction(() => window.__DEBUG?.game?.phase === 'battle' && getComputedStyle(document.querySelector('.cot-bl')).display === 'none',
      { timeout: 240_000, polling: 100 });
    await new Promise((r) => setTimeout(r, 5000));
    let soloEntryProfile = null;
    if (soloEntryCdp) {
      const { profile } = await soloEntryCdp.send('Profiler.stop');
      const spans = (await pageA.evaluate(() => window.__censusTaskSpans ?? [])).filter(([start, ms]) => start >= soloEntryFrom && ms >= profileSoloMinMs);
      mkdirSync(join(out, label), { recursive: true });
      writeFileSync(join(out, label, 'solo-entry-A.cpuprofile'), JSON.stringify(profile));
      soloEntryProfile = attribute(profile, spans, profile.startTime / 1000 - soloEntryFrom);
      for (const task of soloEntryProfile) console.log(`solo entry task at ${task.startMs} ms, ${task.ms} ms (${task.samples} samples)\n  self:\n    ${task.self.join('\n    ')}\n  total:\n    ${task.total.slice(0, 30).join('\n    ')}`);
    }
    const soloEvaluated = soloEval ? await pageA.evaluate((expression) => {
      try { return { value: JSON.parse(JSON.stringify((0, eval)(expression) ?? null)) }; } catch (error) { return { error: String(error?.message || error) }; }
    }, soloEval).catch((error) => ({ error: String(error?.message || error).split('\n')[0] })) : null;
    await stage('solo', at);
    const soloSample = samples.at(-1);
    if (soloEntryProfile) soloSample.entryProfile = soloEntryProfile;
    if (soloEvaluated) {
      soloSample.soloEval = { expression: soloEval, value: soloEvaluated };
      console.log(`solo eval: ${JSON.stringify(soloEvaluated).slice(0, 4000)}`);
    }
    let soloCdp = null, soloFrom = 0;
    if (profileLeave) {
      soloCdp = await pageA.createCDPSession();
      await soloCdp.send('Profiler.enable');
      await soloCdp.send('Profiler.setSamplingInterval', { interval: 500 });
      soloFrom = await pageA.evaluate(() => performance.now());
      await soloCdp.send('Profiler.start');
    }
    await pageA.evaluate(() => window.__DEBUG.leaveBattleToGarage());
    await pageA.waitForFunction(garage, { timeout: 120_000, polling: 100 });
    if (soloCdp) {
      await new Promise((r) => setTimeout(r, 2000));
      const { profile } = await soloCdp.send('Profiler.stop');
      const spans = (await pageA.evaluate(() => window.__censusTaskSpans ?? [])).filter(([start, ms]) => start >= soloFrom && ms >= 200);
      mkdirSync(join(out, label), { recursive: true });
      writeFileSync(join(out, label, 'solo-leave-A.cpuprofile'), JSON.stringify(profile));
      soloSample.leaveProfile = attribute(profile, spans, profile.startTime / 1000 - soloFrom);
      soloSample.leaveLongTasks = spans.map(([start, ms]) => [Math.round(start - soloFrom), Math.round(ms)]);
      console.log(`solo leave: ${spans.length} long tasks ${JSON.stringify(soloSample.leaveLongTasks)}`);
      for (const task of soloSample.leaveProfile) console.log(`solo leave task at ${task.startMs} ms, ${task.ms} ms (${task.samples} samples)\n  self:\n    ${task.self.join('\n    ')}\n  total:\n    ${task.total.slice(0, 24).join('\n    ')}`);
    }
  }

  at = performance.now();
  // the rooms open from Deploy's room tabs on every layout (the Garage's own entry button hides where the panels persist)
  const visible = (selector) => pageA.evaluate((sel) => [...document.querySelectorAll(sel)].some((el) => el.checkVisibility?.() ?? el.offsetParent !== null), selector);
  if (await visible('.cot-multiplayer-entry')) await pageA.click('.cot-multiplayer-entry');
  else {
    await pageA.evaluate(() => {
      const open = [...document.querySelectorAll('[data-nav=deploy], .cot-battle-mode')].find((el) => el.checkVisibility?.() ?? el.offsetParent !== null);
      open?.click();
    });
    await pageA.waitForSelector('#cot-battle-menu.open [data-deploy-room="lan"]', { timeout: 30_000 });
    await pageA.evaluate(() => document.querySelector('#cot-battle-menu [data-deploy-room="lan"]')?.click());
  }
  await pageA.waitForSelector('.cot-play.show .modes [data-value="lan"]', { timeout: 30_000 });
  await pageA.click('.cot-play .modes [data-value="lan"]');
  await pageA.evaluate(() => {
    const name = document.querySelector('.cot-play [data-field="name"]');
    if (name) name.value = 'Alpha Lead';
    const size = document.querySelector('.cot-play [data-field="create-size"]');
    if (size) size.value = '2';
  });
  await pageA.click('.cot-play [data-action="create"]');
  await pageA.waitForFunction(() => document.querySelector('.cot-play .lobby')?.classList.contains('show') && /[?&]room=[A-Z0-9]{6}/.test(location.search), { timeout: 30_000, polling: 100 });
  const invite = new URL(await pageA.evaluate(() => location.href));
  await stage('create', at);

  at = performance.now();
  for (const [key, value] of new URLSearchParams(BOOT_QUERY)) invite.searchParams.set(key, value);
  await pageB.goto(invite.href, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await pageB.waitForFunction(garage, { timeout: 240_000, polling: 100 });
  await pageB.waitForFunction(() => document.querySelector('.cot-play .lobby.show .players')?.children.length === 2
    || document.querySelector('.cot-play .status')?.classList.contains('err'), { timeout: 60_000, polling: 100 });
  await pageA.waitForFunction(() => document.querySelector('.cot-play .lobby.show .players')?.children.length === 2, { timeout: 30_000, polling: 100 });
  await stage('join', at);

  at = performance.now();
  await pageB.evaluate(() => {
    const team = document.querySelector('.cot-play [data-control="team"]');
    team.value = 'alpha';
    team.dispatchEvent(new Event('change', { bubbles: true }));
  });
  if (mapId) {
    await pageA.evaluate((id) => {
      const map = document.querySelector('.cot-play [data-control="map"]');
      map.value = id;
      map.dispatchEvent(new Event('change', { bubbles: true }));
    }, mapId);
  }
  await new Promise((r) => setTimeout(r, 1000));
  await pageB.click('.cot-play [data-action="ready"]');
  await pageA.click('.cot-play [data-action="ready"]');
  await pageA.waitForFunction(() => !document.querySelector('.cot-play [data-action="start"]')?.disabled, { timeout: 30_000, polling: 100 });
  await stage('ready', at);

  at = performance.now();
  // (each page's own clock)
  const stageFrom = await Promise.all([pageA, pageB].map((page) => page.evaluate(() => performance.now())));
  let cdpA = null, profiledFrom = 0;
  if (cpuProfile) {
    cdpA = await pageA.createCDPSession();
    await cdpA.send('Profiler.enable');
    await cdpA.send('Profiler.setSamplingInterval', { interval: 500 });
    await pageA.evaluate(() => { window.__censusLongSpans = []; });
    profiledFrom = await pageA.evaluate(() => performance.now());
    profiling.armed = true;
    // A's workers already running (a match host started before the press) are profiled too
    for (const { url, session } of profiling.live) await profileWorker(url, session).catch(() => {});
    await cdpA.send('Profiler.start');
  }
  await pageA.click('.cot-play [data-action="start"]');
  await Promise.all([pageA, pageB].map((page) => page.waitForFunction(inBattle, { timeout: 240_000, polling: 100 })));
  await new Promise((r) => setTimeout(r, 3000));
  let entryProfile = null;
  if (cdpA) {
    profiling.armed = false;
    const { profile } = await cdpA.send('Profiler.stop');
    const spans = (await pageA.evaluate(() => window.__censusLongSpans.splice(0))).filter(([start, ms]) => start >= profiledFrom && ms >= 200);
    mkdirSync(join(out, label), { recursive: true });
    writeFileSync(join(out, label, 'host-entry.cpuprofile'), JSON.stringify(profile));
    // the profile's clock is monotonic µs from an arbitrary origin: anchored at its start to the page clock
    entryProfile = { page: attribute(profile, spans, profile.startTime / 1000 - profiledFrom), workers: [] };
    for (const [i, { url, session }] of profiling.workers.entries()) {
      const stopped = await session.send('Profiler.stop').catch(() => null);
      if (!stopped) continue;
      writeFileSync(join(out, label, `host-worker-${i}.cpuprofile`), JSON.stringify(stopped.profile));
      const p = stopped.profile;
      entryProfile.workers.push({ url: url.split('/').pop(), ...attribute(p, [[0, (p.endTime - p.startTime) / 1000]], p.startTime / 1000)[0] });
    }
    for (const task of entryProfile.page) console.log(`host entry task at ${task.startMs} ms, ${task.ms} ms (${task.samples} samples)\n  self:\n    ${task.self.join('\n    ')}\n  total:\n    ${task.total.slice(0, 20).join('\n    ')}`);
    for (const w of entryProfile.workers) console.log(`host worker ${w.url}: ${w.ms} ms profiled, ${w.samples} busy samples\n  self:\n    ${w.self.join('\n    ')}`);
  }
  // each long task of the battle stage (300 ms or more) and the programs it made, against the nearest made before it
  const programTasks = programLog ? await Promise.all([pageA, pageB].map((page, index) => page.evaluate((from) => {
    const rows = window.__censusPrograms ?? [];
    return (window.__censusTaskSpans ?? []).filter(([start, ms]) => start >= from && ms >= 300).map(([start, ms]) => {
      const made = rows.filter((r) => r.t >= start && r.t <= start + ms), prior = rows.filter((r) => r.t < start);
      const lines = made.map((r) => {
        let best = null;
        for (const o of prior) {
          if (o.name !== r.name || o.parts.length !== r.parts.length) continue;
          const d = [];
          for (let i = 0; i < r.parts.length; i++) if (r.parts[i] !== o.parts[i]) d.push(`${i}:${r.parts[i].slice(0, 60)} / ${o.parts[i].slice(0, 60)}`);
          if (!best || d.length < best.length) best = d;
        }
        return `${r.name}: ${best ? (best.length ? best.slice(0, 5).join(' | ') : 'same key') : 'no prior program of that name and key length'}`
          + `\n        drawn by ${r.drawer}\n        from ${r.stack}`;
      });
      return { startMs: Math.round(start), ms: Math.round(ms), made: made.length, programs: lines.slice(0, 80) };
    });
  }, stageFrom[index]).catch((error) => ({ error: String(error?.message || error).split('\n')[0] })))) : null;
  const evaluated = battleEval ? await Promise.all([pageA, pageB].map((page) => page.evaluate((expression) => {
    try { return { value: JSON.parse(JSON.stringify((0, eval)(expression) ?? null)) }; } catch (error) { return { error: String(error?.message || error) }; }
  }, battleEval).catch((error) => ({ error: String(error?.message || error).split('\n')[0] })))) : null;
  await stage('battle', at);
  if (entryProfile) samples.at(-1).profile = entryProfile;
  if (programTasks) {
    samples.at(-1).programTasks = programTasks;
    for (const [i, tasks] of programTasks.entries()) {
      for (const task of Array.isArray(tasks) ? tasks : [tasks]) {
        console.log(`programs ${'AB'[i]}: task at ${task.startMs} ms, ${task.ms} ms: ${task.made} made${task.error ? ` (${task.error})` : ''}`);
        for (const line of task.programs ?? []) console.log(`    ${line}`);
      }
    }
  }
  if (evaluated) {
    samples.at(-1).battleEval = { expression: battleEval, pages: evaluated };
    for (const [i, result] of evaluated.entries()) console.log(`battle eval ${'AB'[i]}: ${JSON.stringify(result).slice(0, 6000)}`);
  }

  at = performance.now();
  // each page's session and its own clock at the start
  const leaveCdp = [], leaveFrom = [];
  if (profileLeave) {
    for (const page of [pageA, pageB]) {
      const cdp = await page.createCDPSession();
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
      leaveFrom.push(await page.evaluate(() => performance.now()));
      await cdp.send('Profiler.start');
      leaveCdp.push(cdp);
    }
  }
  for (const [i, page] of (leaveFirst === 'A' ? [pageA, pageB] : [pageB, pageA]).entries()) {
    if (i > 0 && leaveGapMs) await new Promise((r) => setTimeout(r, leaveGapMs));
    await page.evaluate(() => window.__DEBUG.leaveBattleToGarage());
    await page.waitForFunction(() => window.__DEBUG?.game?.phase === 'garage', { timeout: 60_000, polling: 100 });
  }
  await new Promise((r) => setTimeout(r, 2000));
  let leaveProfile = null;
  if (leaveCdp.length) {
    leaveProfile = {};
    mkdirSync(join(out, label), { recursive: true });
    for (const [i, cdp] of leaveCdp.entries()) {
      const page = [pageA, pageB][i], who = 'AB'[i];
      const { profile } = await cdp.send('Profiler.stop');
      const spans = (await page.evaluate(() => window.__censusTaskSpans ?? [])).filter(([start, ms]) => start >= leaveFrom[i] && ms >= 200);
      writeFileSync(join(out, label, `leave-${who}.cpuprofile`), JSON.stringify(profile));
      leaveProfile[who] = attribute(profile, spans, profile.startTime / 1000 - leaveFrom[i]);
      for (const task of leaveProfile[who]) console.log(`${who} leave task at ${task.startMs} ms, ${task.ms} ms (${task.samples} samples)\n  self:\n    ${task.self.join('\n    ')}\n  total:\n    ${task.total.slice(0, 24).join('\n    ')}`);
    }
  }
  await stage('leave', at);
  if (leaveProfile) samples.at(-1).profile = leaveProfile;
} catch (error) {
  // where each page stood when the stage gave up, and the stage's console so far
  const state = await Promise.all(pages.map((page) => page.evaluate(() => {
    const cover = document.querySelector('.cot-bl');
    return { inMatch: window.__MULTIPLAYER_V2?.stats?.().inMatch ?? null, phase: window.__DEBUG?.game?.phase ?? null,
      cover: cover ? getComputedStyle(cover).display : null, coverText: cover?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? null,
      // the network entry's own record of a failed round (main.ts recordEntryFailure) and its stage trace
      entryFailure: window.__NETWORK_ENTRY_FAILURE ?? null, entryTrace: window.__NETWORK_LOAD?.stages ?? null };
  }).catch((e) => ({ unreadable: String(e?.message || e).split('\n')[0] }))));
  samples.push({ kind: `lobby-${(solo ? ['boot', 'solo', 'create', 'join', 'ready', 'battle', 'leave'] : ['boot', 'create', 'join', 'ready', 'battle', 'leave'])[samples.length] ?? 'flow'}`, error: String(error?.message || error).split('\n')[0],
    pages: state, census: { consoleErrors: log.errors.splice(0), consoleWarnings: log.warnings.length, consoleWarningTexts: log.warnings.splice(0), cspReports: log.csp.splice(0) } });
  console.error(`mp-room-census: ${samples.at(-1).error}`);
  for (const [i, s] of state.entries()) console.error(`  page ${'AB'[i]}: ${JSON.stringify(s)}`);
  for (const line of [...samples.at(-1).census.consoleErrors, ...samples.at(-1).census.consoleWarningTexts]) console.error(`  ${String(line).slice(0, 240)}`);
  process.exitCode = 2;
} finally {
  await browser?.close().catch(() => {});
  server?.kill();
  try { await rooms?.close(); } catch { /* already gone */ }
  await lock?.release();
}
mkdirSync(join(out, label), { recursive: true });
writeFileSync(join(out, label, 'mp-room.desktop.json'), `${JSON.stringify({ profile: 'desktop', dist, samples }, null, 1)}\n`);
const errors = samples.reduce((n, s) => n + (s.census?.consoleErrors.length ?? 0), 0);
console.log(`mp-room-census: ${samples.length} stages, ${errors} console errors -> ${join(out, label, 'mp-room.desktop.json')}`);
if (errors && !process.exitCode) process.exitCode = 1;
if (gate) {
  const leave = samples.find((sample) => sample.kind === 'lobby-leave');
  const warnings = leave?.census?.consoleWarnings ?? null;
  if (warnings === null) {
    console.error('mp-room-census: GATE the leave stage did not run');
    if (!process.exitCode) process.exitCode = 4;
  } else if (warnings > 0) {
    console.error(`mp-room-census: GATE lobby-leave logged ${warnings} console warning(s) (budget 0)`);
    for (const text of leave.census.consoleWarningTexts ?? []) console.error(`  ${String(text).slice(0, 240)}`);
    if (!process.exitCode) process.exitCode = 4;
  } else console.log('mp-room-census: GATE lobby-leave 0 console warnings (budget 0)');
}
process.exit(process.exitCode ?? 0);
