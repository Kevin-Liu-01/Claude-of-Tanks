#!/usr/bin/env node
// The battle spike census (battle-spikes-253, docs/PERF-SPIKES.md; the owner's "no more lag spikes"): full solo battles
// on the production build, bots fighting and the player driving and firing, on each map × mode × team size, cold (a
// fresh browser profile: nothing compiled, nothing cached) then warm (a second battle on the same page). Every frame
// interval over 33 ms and every main-thread task over 50 ms is split into its causes (tools/battle-spike-analysis.mjs)
// from three sources: the frame-stage recorder (src/dev/frameStageRecorder.ts, through __DEBUG.frameStages: the
// frame's stages, the bus events whose listeners cost most, the WebGL program links and uploads in and between frames),
// a Chrome trace of the renderer main thread (GC, the rendering pipeline's DOM work, other tasks' scripts by chunk,
// compiles) and the page's long-task, long-animation-frame and audio-decode observers.
//
//   node tools/battle-spike-census.mjs [--scenarios=verdant:standard,urban:zone_control,...] [--sizes=7,14,21]
//        [--seconds=45] [--passes=cold,warm] [--spec=t90m] [--preset=high] [--viewport=1920x1080] [--port=5396]
//        [--root=.] [--out=<dir>] [--trace=1] [--resume] [--budget-min=0] [--driver=player|watch]
//
// --driver=watch plays a watched battle instead (every seat a bot's, the camera riding the human seat's hull): the
// simulation is then the same tick for tick on every run of a build (a fresh profile, a pinned roster), the workload a
// before/after pair must share. The AC-130 cannot be watched (its gunship is the human's alone) and keeps the player.
//
// One browser at a time (--js-flags heap cap; the run aborts a battle past 6 GB of browser RSS), the capture FIFO held
// for the whole run (tools/capture-lock.mjs), the dist served by `vite preview`. Each battle writes
// <out>/<map>-<mode>-<size>v<size>-<pass>.json (the analysis, the roster, the load), and beside it the recorder's
// readout (.frames.json.gz) and the main thread's trace events (.trace.json.gz), so --reanalyze=<out> can re-run the
// analysis over a finished census.
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import puppeteer from 'puppeteer';
import { MAP_PROBE_BROWSER_ARGS, isMainModule, sleep } from './map-probe-runtime.mjs';
import { acquireProbeLocks, chunkOfUrl, foreignGpuCpu, openPreview, pinnedOpponents } from './frame-budget-probe.mjs';
import { StringDecoder } from 'node:string_decoder';
import { analyzeBattle, rendererMainThread, traceEventOfInterest } from './battle-spike-analysis.mjs';

const TOOL = 'battle-spike-census';
/** The census's battles: the directive's AC-130, drone, destruction-heavy and urban maps among the modes. */
export const DEFAULT_SCENARIOS = Object.freeze([
  'verdant:standard', 'urban:zone_control', 'railyard:capture_the_flag', 'desert:ac130', 'autumn:drone',
  'foundry:frontline_assault', 'blackglass:standard',
]);
const SYNC_MARK = 'cot-spike-census-sync';
/**
 * The trace categories: the tasks (RunTask), GC (MinorGC, MajorGC), scripts (FunctionCall, TimerFire, EventDispatch …),
 * compiles (v8.compile), the rendering pipeline, and the user-timing marks (the sync). `v8` and `v8.execute` would add
 * an event per call into V8.
 */
const TRACE_CATEGORIES = Object.freeze(['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing']);
/** Chrome's trace buffer for a battle (KB): it holds the battle; the stream is read event by event, never whole. */
const TRACE_BUFFER_KB = 600 * 1024;
const RSS_ABORT_KB = 6 * 1024 * 1024;

const log = (message) => console.log(`[${TOOL} ${new Date().toISOString().slice(11, 19)}] ${message}`);

export function parseCensusArgs(argv) {
  const o = {
    scenarios: [...DEFAULT_SCENARIOS], sizes: [7, 14, 21], seconds: 45, passes: ['cold', 'warm'], spec: 't90m',
    preset: 'high', viewport: '1920x1080', port: 5396, root: process.cwd(), out: null, trace: true, resume: false,
    budgetMin: 0, reanalyze: null, driver: 'player',
  };
  for (const arg of argv) {
    const [key, value = '1'] = arg.replace(/^--/, '').split('=');
    switch (key) {
      case 'scenarios': o.scenarios = value.split(',').filter(Boolean); break;
      case 'sizes': o.sizes = value.split(',').map(Number); break;
      case 'seconds': o.seconds = Number(value); break;
      case 'passes': o.passes = value.split(',').filter(Boolean); break;
      case 'spec': o.spec = value; break;
      case 'preset': o.preset = value; break;
      case 'viewport': o.viewport = value; break;
      case 'port': o.port = Number(value); break;
      case 'root': o.root = path.resolve(value); break;
      case 'out': o.out = path.resolve(value); break;
      case 'trace': o.trace = value !== '0'; break;
      case 'resume': o.resume = value !== '0'; break;
      case 'budget-min': o.budgetMin = Number(value); break;
      case 'reanalyze': o.reanalyze = path.resolve(value); break;
      case 'driver': o.driver = value; break;
      default: throw new Error(`${TOOL}: unknown flag --${key}`);
    }
  }
  for (const s of o.scenarios) if (!/^[a-z_]+:[a-z_0-9]+$/.test(s)) throw new Error(`--scenarios: <map>:<mode>, not ${s}`);
  if (o.sizes.some((n) => !(n >= 1 && n <= 21))) throw new Error('--sizes: team sizes 1..21 (21 v 21 is the field limit)');
  if (o.passes.some((p) => p !== 'cold' && p !== 'warm') || o.passes[0] !== 'cold' && o.passes.length > 1) throw new Error('--passes: cold[,warm]');
  if (!/^\d+x\d+$/.test(o.viewport)) throw new Error('--viewport: <w>x<h>');
  if (o.driver !== 'player' && o.driver !== 'watch') throw new Error('--driver: player or watch');
  o.out ??= path.join(os.homedir(), 'cot-lanes', 'battle-spikes-census', new Date().toISOString().slice(0, 16).replace(/[:T]/g, ''));
  return o;
}

// ---------------------------------------------------------------------------------------------- page side

/** Before boot: the preset, every mode's team arrangement, and the long-task, long-animation-frame and decode observers. */
function installCensusObservers({ preset, allies, enemies }) {
  const census = { tasks: [], loaf: [], decodes: [] };
  window.__CENSUS = census;
  try {
    window.localStorage.setItem('cot.gfxPreset', preset);
    window.localStorage.removeItem('cot.gfxAutoTier');
    const arrangement = { allies, enemies, waveSize: null, enemyNation: null };
    const all = {};
    for (const mode of ['standard', 'capture_the_flag', 'zone_control', 'king_of_the_hill', 'turbo_ball', 'mars', 'juggernaut',
      'infected', 'realistic', 'gun_game', 'drone', 'ac130', 'frontline_assault', 'endless_horde']) all[mode] = arrangement;
    window.localStorage.setItem('cot.game.teams.v1', JSON.stringify(all));
  } catch { /* storage blocked */ }
  const cap = 4000;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (census.tasks.length < cap) census.tasks.push({ t: +e.startTime.toFixed(1), ms: +e.duration.toFixed(1) });
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* unsupported */ }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (census.loaf.length >= cap) break;
        census.loaf.push({
          t: +e.startTime.toFixed(1), ms: +e.duration.toFixed(1), blocking: +(e.blockingDuration ?? 0).toFixed(1),
          renderStart: +(e.renderStart ?? 0).toFixed(1), styleStart: +(e.styleAndLayoutStart ?? 0).toFixed(1),
          scripts: (e.scripts ?? []).filter((s) => s.duration >= 5).slice(0, 6).map((s) => ({
            invoker: s.invoker, type: s.invokerType, src: s.sourceURL, fn: s.sourceFunctionName, ms: +s.duration.toFixed(1),
            forced: +(s.forcedStyleAndLayoutDuration ?? 0).toFixed(1),
          })),
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch { /* unsupported */ }
  // audio decodes: when each began and settled, and how long its continuation held the thread
  const Context = window.AudioContext || window.webkitAudioContext;
  const decode = Context?.prototype?.decodeAudioData;
  if (decode) {
    Context.prototype.decodeAudioData = function censusDecode(data, ...rest) {
      const row = { t0: +performance.now().toFixed(1), bytes: data?.byteLength ?? 0, t1: null };
      if (census.decodes.length < cap) census.decodes.push(row);
      const result = decode.call(this, data, ...rest);
      if (result && typeof result.then === 'function') result.then(() => { row.t1 = +performance.now().toFixed(1); }, () => { row.t1 = -1; });
      return result;
    };
  }
}

/** The player drives and fires (the perf probe's drive: W held, A/D alternating, forceFire); drone mode launches its drone. */
async function driveBattle(page, { seconds, mode }) {
  await page.evaluate(() => { window.__DEBUG.flags.forceFire = true; });
  await page.keyboard.down('KeyW');
  const until = Date.now() + seconds * 1000;
  let turn = 0;
  try {
    while (Date.now() < until) {
      const key = turn % 2 ? 'KeyD' : 'KeyA';
      if (mode === 'drone' && turn % 10 === 1) { await page.keyboard.press('KeyV').catch(() => {}); }
      await page.keyboard.down(key);
      await sleep(Math.min(800, Math.max(0, until - Date.now())));
      await page.keyboard.up(key);
      await sleep(Math.min(1200, Math.max(0, until - Date.now())));
      turn++;
    }
  } finally {
    await page.keyboard.up('KeyW').catch(() => {});
    await page.evaluate(() => { window.__DEBUG.flags.forceFire = false; }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------------------------- host side

function treeRssKb(rootPid) {
  try {
    const rows = execSync('ps -axo pid=,ppid=,rss=', { encoding: 'utf8' }).trim().split('\n').map((r) => r.trim().split(/\s+/).map(Number));
    const children = new Map();
    for (const [pid, ppid] of rows) { const list = children.get(ppid) ?? []; list.push(pid); children.set(ppid, list); }
    const rss = new Map(rows.map(([pid, , kb]) => [pid, kb]));
    let total = 0;
    const stack = [rootPid];
    while (stack.length) { const pid = stack.pop(); total += rss.get(pid) ?? 0; stack.push(...(children.get(pid) ?? [])); }
    return total;
  } catch { return 0; }
}

/**
 * Split a streamed trace (`{"traceEvents":[{…},{…}],…}`) into its events as the chunks arrive: braces and brackets
 * counted outside strings, each object at the array's depth parsed alone and handed to `onEvent`. The whole trace is
 * never one string (a cold battle's passed V8's string limit and took the census down with it).
 */
export function createTraceSplitter(onEvent) {
  let depth = 0, inString = false, escaped = false, start = -1, carry = '';
  return {
    push(chunk) {
      const text = carry + chunk;
      for (let i = carry.length; i < text.length; i++) {
        const c = text[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (c === '\\') escaped = true;
          else if (c === '"') inString = false;
          continue;
        }
        if (c === '"') inString = true;
        else if (c === '{' || c === '[') { if (depth === 2 && c === '{') start = i; depth++; }
        else if (c === '}' || c === ']') {
          depth--;
          if (depth === 2 && c === '}' && start >= 0) { onEvent(JSON.parse(text.slice(start, i + 1))); start = -1; }
        }
      }
      // an event still open carries over; anything before it is spent
      if (start >= 0) { carry = text.slice(start); start = 0; } else carry = '';
    },
  };
}

/** Start a battle's trace (CDP Tracing, streamed); `stop()` reads it back event by event and keeps what the analysis can use. */
async function startTrace(page) {
  const cdp = await page.target().createCDPSession();
  await cdp.send('Tracing.start', {
    transferMode: 'ReturnAsStream', streamFormat: 'json',
    traceConfig: { recordMode: 'recordUntilFull', traceBufferSizeInKb: TRACE_BUFFER_KB, includedCategories: [...TRACE_CATEGORIES] },
  });
  let stopped = false;
  return {
    async stop() {
      if (stopped) return null;
      stopped = true;
      const complete = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
      await cdp.send('Tracing.end');
      const { stream, dataLossOccurred } = await complete;
      const kept = [];
      let seen = 0, bytes = 0;
      const splitter = createTraceSplitter((e) => { seen++; if (traceEventOfInterest(e, SYNC_MARK)) kept.push(e); });
      const decoder = new StringDecoder('utf8');
      for (;;) {
        const chunk = await cdp.send('IO.read', { handle: stream, size: 4 << 20 });
        const data = chunk.base64Encoded ? decoder.write(Buffer.from(chunk.data, 'base64')) : chunk.data;
        bytes += data.length;
        splitter.push(data);
        if (chunk.eof) break;
      }
      await cdp.send('IO.close', { handle: stream }).catch(() => {});
      await cdp.detach().catch(() => {});
      return { events: filterTraceEvents(kept), seen, bytes, dataLoss: !!dataLossOccurred };
    },
  };
}

/** Keep the renderer main thread's and the GPU main thread's events (the rest of a trace is the analysis's noise). */
export function filterTraceEvents(events) {
  const main = rendererMainThread(events, SYNC_MARK);
  const gpu = new Set();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrGpuMain') gpu.add(`${e.pid}:${e.tid}`);
  return events.filter((e) => (e.ph === 'M') || (main && e.pid === main.pid && e.tid === main.tid) || gpu.has(`${e.pid}:${e.tid}`));
}

const keyOf = (scenario, size, pass) => `${scenario.replace(':', '-')}-${size}v${size}-${pass}`;

async function runScenario(options, server, scenario, size, done) {
  const [mapId, gameMode] = scenario.split(':');
  const [width, height] = options.viewport.split('x').map(Number);
  const allies = size - 1, enemies = size;
  const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
    args: [...MAP_PROBE_BROWSER_ARGS, '--enable-precise-memory-info', `--window-size=${width},${height}`, '--js-flags=--max-old-space-size=3072'] });
  let aborted = null;
  const pid = browser.process()?.pid;
  const watchdog = setInterval(() => {
    const kb = pid ? treeRssKb(pid) : 0;
    if (kb > RSS_ABORT_KB && !aborted) { aborted = `browser RSS ${(kb / 1048576).toFixed(1)} GB past 6 GB`; log(`${scenario} ${size}v${size}: ${aborted}: aborting`); browser.close().catch(() => {}); }
  }, 5000);
  watchdog.unref();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error?.message ?? error).slice(0, 300)));
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(installCensusObservers, { preset: options.preset, allies, enemies });
    const bootAt = Date.now();
    await page.goto(`http://127.0.0.1:${options.port}/?nosplash=1&tier=desktop`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction('window.__GAME_READY === true', { timeout: 300000 });
    const bootMs = Date.now() - bootAt;
    const catalog = await page.evaluate(() => window.__DEBUG.game.allTanks.map((e) => e.specId));
    const opponents = pinnedOpponents(catalog, options.spec, allies + enemies);
    await page.evaluate((ids) => { const f = window.__DEBUG.flags; f.forceRoster = ids; f.rosterExact = true; }, opponents);
    await page.evaluate(() => window.__DEBUG.frameStages.install({ gl: true }));
    for (const pass of options.passes) {
      const key = keyOf(scenario, size, pass);
      if (done.has(key)) { log(`${key}: measured already`); continue; }
      if (pass === 'warm') {
        await page.evaluate(() => window.__DEBUG.leaveBattleToGarage());
        await page.waitForFunction('window.__DEBUG.game.phase === "garage"', { timeout: 180000, polling: 250 });
        await sleep(5000);
      }
      const record = await measureBattle(page, options, { mapId, gameMode, allies, enemies, pass, key });
      record.bootMs = bootMs;
      record.errors = errors.splice(0);
      writeFileSync(path.join(options.out, `${key}.json`), JSON.stringify(record, null, 1));
      const s = record.analysis;
      log(`${key}: ${s.intervals.count} frames, ${s.intervals.over33} over 33 ms (p99 ${s.intervals.p99} ms, max ${s.intervals.max} ms), `
        + `${s.longTasks.length} long tasks — ${Object.entries(s.summary).slice(0, 4).map(([c, r]) => `${c} ${r.spikes}/${r.longTasks}`).join(', ')}`);
      if (aborted) throw new Error(aborted);
    }
  } finally {
    clearInterval(watchdog);
    await browser.close().catch(() => {});
  }
}

async function measureBattle(page, options, { mapId, gameMode, allies, enemies, pass, key }) {
  const load = { before: os.loadavg().map((v) => +v.toFixed(1)), foreignGpu: foreignGpuCpu() };
  await page.evaluate(() => { window.__DEBUG.frameStages.clear(); const c = window.__CENSUS; c.tasks.length = 0; c.loaf.length = 0; c.decodes.length = 0; });
  let tracer = null, syncPerfMs = null;
  try {
    const entryStartMs = await page.evaluate(() => performance.now());
    const entryAt = Date.now();
    const watched = options.driver === 'watch' && gameMode !== 'ac130';
    if (watched) {
      await page.evaluate((request) => { setTimeout(() => window.__DEBUG.beginBattleEntry(request.specId, request.mapId, { gameMode: request.gameMode, watch: true }), 0); },
        { specId: options.spec, mapId, gameMode });
    } else {
      await page.evaluate((request) => { setTimeout(() => window.__DEBUG.beginSoloBattle(request), 0); }, { specId: options.spec, mapId, gameMode });
    }
    // the trace covers the battle from its phase on (the countdown and the fight; the loading veil's build is the
    // recorder's alone): a loading trace is most of the bytes and none of the frames a player sees
    await page.waitForFunction('window.__DEBUG.game.phase === "battle"', { timeout: 420000, polling: 100 });
    if (options.trace) {
      tracer = await startTrace(page);
      syncPerfMs = await page.evaluate((name) => performance.mark(name).startTime, SYNC_MARK);
    }
    await page.waitForFunction('window.__DEBUG.game.phase === "battle" && window.__DEBUG.game.preBattleS <= 0', { timeout: 420000, polling: 250 });
    const entryMs = Date.now() - entryAt;
    // a watched battle: ride the human seat's hull (its bot drives it) as a player's chase view would follow it
    const rodeSeat = watched ? await page.evaluate(() => {
      const D = window.__DEBUG;
      const seatId = D.game.watch?.seatId ?? null;
      return seatId && D.watch?.rideId(seatId) ? seatId : null;
    }) : null;
    const roster = await page.evaluate(() => {
      const g = window.__DEBUG.game;
      return { count: g.tanks.length, player: g.player?.specId ?? null, mode: g.gameMode, map: window.__DEBUG.world?.mapId ?? null,
        teams: g.tanks.reduce((acc, e) => { acc[e.team] = (acc[e.team] ?? 0) + 1; return acc; }, {}) };
    });
    const liveStartMs = await page.evaluate(() => performance.now());
    const shotsBefore = await page.evaluate(() => window.__DEBUG.playerShellLog?.length ?? 0);
    if (watched) await sleep(options.seconds * 1000);
    else await driveBattle(page, { seconds: options.seconds, mode: gameMode });
    const endMs = await page.evaluate(() => performance.now());
    const play = await page.evaluate(() => {
      const g = window.__DEBUG.game;
      return { shots: window.__DEBUG.playerShellLog?.length ?? 0, alive: g.tanks.filter((e) => !e.combat?.destroyed).length,
        destroyed: g.tanks.filter((e) => e.combat?.destroyed).length, simS: +g.timeS.toFixed(1), result: !!g.result };
    });
    const readout = await page.evaluate(() => window.__DEBUG.frameStages.read());
    const observers = await page.evaluate(() => window.__CENSUS);
    let trace = null, traceInfo = null;
    if (tracer) {
      const read = await tracer.stop();
      tracer = null;
      traceInfo = { bytes: read.bytes, seen: read.seen, kept: read.events.length, dataLoss: read.dataLoss };
      if (read.dataLoss) log(`${key}: the trace buffer filled (data lost): its end is untraced`);
      trace = { events: read.events, syncName: SYNC_MARK, syncPerfMs, fromMs: syncPerfMs };
      writeFileSync(path.join(options.out, `${key}.trace.json.gz`), gzipSync(JSON.stringify({ syncName: SYNC_MARK, syncPerfMs, fromMs: syncPerfMs, events: read.events })));
    }
    writeFileSync(path.join(options.out, `${key}.frames.json.gz`), gzipSync(JSON.stringify({ readout, observers })));
    const { analysis, live } = analyzeWindows({ readout, trace, observers, entryStartMs, liveStartMs, endMs });
    load.after = os.loadavg().map((v) => +v.toFixed(1));
    return {
      tool: TOOL, key, mapId, gameMode, size: `${allies + 1}v${enemies}`, pass, seconds: options.seconds, preset: options.preset,
      viewport: options.viewport, spec: options.spec, driver: watched ? 'watch' : 'player', rodeSeat, roster, entryMs, play: { ...play, shots: play.shots - shotsBefore }, load,
      trace: traceInfo,
      window: { entryStartMs: +entryStartMs.toFixed(1), liveStartMs: +liveStartMs.toFixed(1), endMs: +endMs.toFixed(1) },
      analysis, live,
      observers: { longTasks: observers.tasks.length, loaf: observers.loaf.slice(0, 200), decodes: observers.decodes },
      frames: readout?.frames?.length ?? 0, dropped: readout?.dropped ?? 0,
    };
  } finally {
    if (tracer) await tracer.stop().catch(() => {});
  }
}

/** The whole battle (from the entry) and its live part (from control release). */
function analyzeWindows({ readout, trace, observers, entryStartMs, liveStartMs, endMs }) {
  const analysis = analyzeBattle({ readout, trace, observers, window: { fromMs: entryStartMs, toMs: endMs }, chunkOfUrl });
  const live = analyzeBattle({ readout, trace, observers, window: { fromMs: liveStartMs, toMs: endMs }, chunkOfUrl });
  return { analysis, live: { intervals: live.intervals, heap: live.heap, links: live.links, summary: live.summary, spikes: live.spikes.length,
    longTasks: live.longTasks.length } };
}

const readGz = (file) => JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));

/** Re-run the analysis over a finished census folder from the saved readouts and traces; rewrite each record and census.json. */
function reanalyze(dir) {
  for (const name of readdirSync(dir).filter((n) => /-(cold|warm)\.json$/.test(n))) {
    const file = path.join(dir, name);
    const record = JSON.parse(readFileSync(file, 'utf8'));
    const base = file.replace(/\.json$/, '');
    if (!existsSync(`${base}.frames.json.gz`)) { log(`${name}: no readout kept`); continue; }
    const { readout, observers } = readGz(`${base}.frames.json.gz`);
    const trace = existsSync(`${base}.trace.json.gz`) ? readGz(`${base}.trace.json.gz`) : null;
    const { entryStartMs, liveStartMs, endMs } = record.window;
    Object.assign(record, analyzeWindows({ readout, trace, observers, entryStartMs, liveStartMs, endMs }));
    writeFileSync(file, JSON.stringify(record, null, 1));
    log(`${name}: ${record.analysis.intervals.over33} over 33 ms, ${record.analysis.longTasks.length} long tasks`);
  }
  writeFileSync(path.join(dir, 'census.json'), JSON.stringify(summarizeCensus(dir), null, 1));
}

export async function runCensus(options) {
  mkdirSync(options.out, { recursive: true });
  const done = new Set(options.resume ? readdirSync(options.out).filter((n) => /-(cold|warm)\.json$/.test(n)).map((n) => n.replace(/\.json$/, '')) : []);
  if (!existsSync(path.join(options.root, 'dist', 'index.html'))) throw new Error(`${options.root} has no dist (npm run build)`);
  const locks = await acquireProbeLocks({ log });
  const refresh = setInterval(() => locks.refresh(), 30000);
  refresh.unref();
  const server = await openPreview(options.root, options.port);
  const started = Date.now();
  const failures = [];
  try {
    for (const scenario of options.scenarios) {
      for (const size of options.sizes) {
        if (options.budgetMin && (Date.now() - started) / 60000 > options.budgetMin) { log('time budget spent: stopping'); return { failures, stopped: true }; }
        try { await runScenario(options, server, scenario, size, done); } catch (error) {
          failures.push({ scenario, size, error: String(error?.message ?? error).slice(0, 400) });
          log(`${scenario} ${size}v${size} FAILED: ${String(error?.message ?? error).slice(0, 200)}`);
        }
      }
    }
  } finally {
    await server.close().catch(() => {});
    clearInterval(refresh);
    locks.release();
  }
  writeFileSync(path.join(options.out, 'census.json'), JSON.stringify(summarizeCensus(options.out), null, 1));
  return { failures };
}

/** The folder's battles side by side: spikes, long tasks and the causes, cold against warm. */
export function summarizeCensus(dir) {
  const rows = [];
  for (const name of readdirSync(dir).filter((n) => /-(cold|warm)\.json$/.test(n)).sort()) {
    const r = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
    rows.push({ key: r.key, map: r.mapId, mode: r.gameMode, size: r.size, pass: r.pass, tanks: r.roster?.count, entryMs: r.entryMs,
      frames: r.analysis.intervals.count, over33: r.analysis.intervals.over33, over50: r.analysis.intervals.over50,
      over100: r.analysis.intervals.over100, p99: r.analysis.intervals.p99, max: r.analysis.intervals.max,
      longTasks: r.analysis.longTasks.length, liveOver33: r.live.intervals.over33, liveLinks: r.live.links?.links ?? null,
      allocMBPerS: r.live.heap?.allocMBPerS ?? null, gcDrops: r.live.heap?.gcDrops ?? null, causes: r.analysis.summary, load: r.load });
  }
  const totals = {};
  for (const row of rows) for (const [cause, c] of Object.entries(row.causes)) {
    const t = totals[cause] ??= { spikes: 0, excessMs: 0, longTasks: 0, longTaskMs: 0 };
    t.spikes += c.spikes; t.excessMs = +(t.excessMs + c.excessMs).toFixed(1); t.longTasks += c.longTasks; t.longTaskMs = +(t.longTaskMs + c.longTaskMs).toFixed(1);
  }
  return { rows, totals: Object.fromEntries(Object.entries(totals).sort((a, b) => b[1].excessMs + b[1].longTaskMs - a[1].excessMs - a[1].longTaskMs)) };
}

if (isMainModule(import.meta.url)) {
  const options = parseCensusArgs(process.argv.slice(2));
  if (options.reanalyze) { reanalyze(options.reanalyze); process.exit(0); }
  log(`${options.scenarios.length} scenarios × sizes ${options.sizes.join('/')} × ${options.passes.join('+')}, ${options.seconds} s of combat each → ${options.out}`);
  runCensus(options).then(({ failures }) => {
    if (failures.length) { log(`${failures.length} battle(s) failed`); process.exitCode = 1; }
    log('done');
  }, (error) => { console.error(error); process.exitCode = 1; });
}
