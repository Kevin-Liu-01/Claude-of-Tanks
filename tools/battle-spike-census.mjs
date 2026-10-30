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
//        [--root=.] [--out=<dir>] [--trace=1] [--resume] [--budget-min=0] [--driver=player|watch] [--heap-profile]
//        [--trace-detail] [--cpu-profile] [--roots=base=<dir>,lane=<dir>] [--governor=pinned|live]
//
// --roots plays every battle on each build (a root holding a dist), each served on its own port, in alternating order
// from one scenario to the next (base then lane, lane then base …), so the machine's load drifts across both sides
// alike; census-ab.json sets the pairs side by side. --governor=pinned (the default) holds the adaptive resolution at
// its full scale from boot: on a loaded machine its steps reallocate the composer's targets mid-battle (each a GPU
// stall the census would charge to the battle), and a pair must render the same pixels.
//
// --cpu-profile samples the main thread's JavaScript through the live battle (CDP Profiler, 200 µs) and names the
// functions with the most self time, through the dist's source maps when the build has them.
//
// --trace-detail adds V8's execution events and keeps every main-thread and GPU-thread event (each compacted as it
// streams, the ones under 50 µs dropped), so a task the kinds the analysis names do not cover shows what ran in it.
//
// --heap-profile samples V8's allocations through the live battle (HeapProfiler sampling, the objects the scavenger and
// the mark-compactor already took included) and names the sites that allocate most, through the dist's source maps
// when the build has them (`npm run build -- --sourcemap` into a diagnostic root).
//
// --driver=watch plays a watched battle instead (every seat a bot's, the camera riding the human seat's hull): the
// simulation is then the same tick for tick on every run of a build (a fresh profile, a pinned roster), the workload a
// before/after pair must share. The AC-130 cannot be watched (its gunship is the human's alone) and keeps the player.
//
// One browser at a time (--js-flags heap cap; the browser guard fails a battle whose renderer passes 6 GB or whose
// browser tree passes BATTLE_TREE_CAP_MB, and the census goes on to the next), the capture FIFO held
// for the whole run (tools/capture-lock.mjs), the dist served by `vite preview`. Each battle writes
// <out>/<map>-<mode>-<size>v<size>-<pass>.json (the analysis, the roster, the load), and beside it the recorder's
// readout (.frames.json.gz) and the main thread's trace events (.trace.json.gz), so --reanalyze=<out> can re-run the
// analysis over a finished census.
import { launchGuardedBrowser } from './browser-launch.mjs';
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
/**
 * (2026-10-27) The browser tree's cap for a battle (MB; COT_BROWSER_TREE_CAP_MB overrides): the guard's 10 GB default
 * killed a 7v7 Steinburg census at 10.09 GB with its renderer at 2.9 GB, the rest the GPU process's targets and textures
 * (a footprint the old 6 GB RSS rule here never read). The renderer's 6 GB cap stays the runaway guard.
 */
const BATTLE_TREE_CAP_MB = 16384;
/**
 * A scenario's whole run (a fresh browser, its cold and warm battles) at most. A browser the RSS watchdog closed left a
 * page call that never settled, and the census held the capture FIFO for 91 minutes with no browser (2026-10-25): every
 * scenario now races the watchdog's abort and this deadline, and moves on.
 */
const SCENARIO_DEADLINE_MS = 25 * 60 * 1000;

const log = (message) => console.log(`[${TOOL} ${new Date().toISOString().slice(11, 19)}] ${message}`);

export function parseCensusArgs(argv) {
  const o = {
    scenarios: [...DEFAULT_SCENARIOS], sizes: [7, 14, 21], seconds: 45, passes: ['cold', 'warm'], spec: 't90m',
    preset: 'high', viewport: '1920x1080', port: 5396, root: process.cwd(), out: null, trace: true, resume: false,
    budgetMin: 0, reanalyze: null, driver: 'player', heapProfile: false, traceDetail: false, cpuProfile: false, drawAttribution: false, domCensus: false,
    roots: null, governor: 'pinned',
  };
  for (const arg of argv) {
    // split at the first '=' only: a value may carry its own (--roots=base=<dir>)
    const flag = arg.replace(/^--/, ''), at = flag.indexOf('=');
    const key = at < 0 ? flag : flag.slice(0, at), value = at < 0 ? '1' : flag.slice(at + 1);
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
      case 'heap-profile': o.heapProfile = value !== '0'; break;
      case 'trace-detail': o.traceDetail = value !== '0'; break;
      case 'cpu-profile': o.cpuProfile = value !== '0'; break;
      case 'draw-attribution': o.drawAttribution = value !== '0'; break;
      case 'dom-census': o.domCensus = value !== '0'; break;
      case 'roots': o.roots = value.split(',').filter(Boolean).map((pair) => {
        const at = pair.indexOf('=');
        if (at <= 0) throw new Error('--roots: label=<dir>,label=<dir>');
        return { label: pair.slice(0, at), root: path.resolve(pair.slice(at + 1)) };
      }); break;
      case 'governor': o.governor = value; break;
      // (battle-spikes-253) engine/lighting.ts's __SHADOW_DEBUG switches set before boot (a same-build A/B): noScopedRebuild,noPoseHold
      case 'shadow-debug': o.shadowDebug = Object.fromEntries(value.split(',').filter(Boolean).map((key) => [key, true])); break;
      default: throw new Error(`${TOOL}: unknown flag --${key}`);
    }
  }
  for (const s of o.scenarios) if (!/^[a-z_]+:[a-z_0-9]+$/.test(s)) throw new Error(`--scenarios: <map>:<mode>, not ${s}`);
  if (o.sizes.some((n) => !(n >= 1 && n <= 21))) throw new Error('--sizes: team sizes 1..21 (21 v 21 is the field limit)');
  if (o.passes.some((p) => p !== 'cold' && p !== 'warm') || o.passes[0] !== 'cold' && o.passes.length > 1) throw new Error('--passes: cold[,warm]');
  if (!/^\d+x\d+$/.test(o.viewport)) throw new Error('--viewport: <w>x<h>');
  if (o.driver !== 'player' && o.driver !== 'watch') throw new Error('--driver: player or watch');
  if (o.governor !== 'pinned' && o.governor !== 'live') throw new Error('--governor: pinned or live');
  o.roots = (o.roots ?? [{ label: '', root: o.root }]).map((side, i) => ({ ...side, port: o.port + i }));
  if (new Set(o.roots.map((side) => side.label)).size !== o.roots.length) throw new Error('--roots: one label a root');
  o.out ??= path.join(os.homedir(), 'cot-lanes', 'battle-spikes-census', new Date().toISOString().slice(0, 16).replace(/[:T]/g, ''));
  return o;
}

// ---------------------------------------------------------------------------------------------- page side

/** Before boot: the preset, every mode's team arrangement, and the long-task, long-animation-frame and decode observers. */
export function installCensusObservers({ preset, allies, enemies }) {
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
export async function driveBattle(page, { seconds, mode }) {
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

/** A detailed trace's event, its fields the analysis reads and no more (a minute of every event fits the heap). */
function compactEvent(e) {
  const data = e.args?.data;
  const args = {};
  if (data) args.data = { url: data.url, functionName: data.functionName, type: data.type, stackTrace: data.stackTrace?.slice(0, 1) };
  if (e.args?.usedHeapSizeBefore != null) { args.usedHeapSizeBefore = e.args.usedHeapSizeBefore; args.usedHeapSizeAfter = e.args.usedHeapSizeAfter; }
  if (e.ph === 'M') args.name = e.args?.name;
  return { name: e.name, ph: e.ph, pid: e.pid, tid: e.tid, ts: e.ts, dur: e.dur, args };
}

/** Start a battle's trace (CDP Tracing, streamed); `stop()` reads it back event by event and keeps what the analysis can use. */
async function startTrace(page, { detail = false } = {}) {
  const cdp = await page.target().createCDPSession();
  // detail: V8's execution, and the GPU process's own work (ANGLE's pipeline and program builds inside a GPUTask)
  const categories = detail ? [...TRACE_CATEGORIES, 'v8.execute', 'v8', 'gpu', 'gpu.angle', 'disabled-by-default-gpu.service'] : [...TRACE_CATEGORIES];
  await cdp.send('Tracing.start', {
    transferMode: 'ReturnAsStream', streamFormat: 'json',
    traceConfig: { recordMode: 'recordUntilFull', traceBufferSizeInKb: TRACE_BUFFER_KB, includedCategories: categories },
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
      const keep = detail
        ? (e) => e.ph === 'M' || e.name === SYNC_MARK || (e.ph === 'X' ? (e.dur ?? 0) >= 50 : e.ph === 'B' || e.ph === 'E')
        : (e) => traceEventOfInterest(e, SYNC_MARK);
      const splitter = createTraceSplitter((e) => { seen++; if (keep(e)) kept.push(detail ? compactEvent(e) : e); });
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

/** Start V8's sampling heap profiler (every allocation's site, the collected ones included); `stop()` returns the profile. */
async function startHeapProfile(page) {
  const cdp = await page.target().createCDPSession();
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  return {
    async stop() {
      const { profile } = await cdp.send('HeapProfiler.stopSampling');
      await cdp.send('HeapProfiler.disable').catch(() => {});
      await cdp.detach().catch(() => {});
      return profile;
    },
  };
}

/**
 * A sampling heap profile's allocation by site (self size: the bytes allocated in that function) and by chunk, the
 * sites mapped to their sources when `resolve(url, line, column)` can (the dist's source maps).
 */
export function summarizeHeapProfile(profile, seconds, { resolve = null, top = 40 } = {}) {
  const sites = new Map(), chunks = new Map();
  let total = 0;
  const stack = [profile.head];
  while (stack.length) {
    const node = stack.pop();
    for (const child of node.children ?? []) stack.push(child);
    if (!node.selfSize) continue;
    total += node.selfSize;
    const f = node.callFrame ?? {};
    const key = `${f.url}|${f.lineNumber}|${f.columnNumber}|${f.functionName}`;
    const row = sites.get(key) ?? { fn: f.functionName || '(anonymous)', url: f.url || '', line: f.lineNumber, col: f.columnNumber, bytes: 0 };
    row.bytes += node.selfSize;
    sites.set(key, row);
    const chunk = chunkOfUrl(f.url, f.functionName);
    chunks.set(chunk, (chunks.get(chunk) ?? 0) + node.selfSize);
  }
  const mb = (bytes) => Math.round(bytes / 1048576 * 100) / 100;
  const ranked = [...sites.values()].sort((a, b) => b.bytes - a.bytes).slice(0, top).map((row) => {
    const source = resolve && row.url ? resolve(row.url, row.line, row.col) : null;
    return { mb: mb(row.bytes), mbPerS: seconds > 0 ? mb(row.bytes / seconds) : null, fn: row.fn, chunk: chunkOfUrl(row.url, row.fn), at: `${row.line + 1}:${row.col}`, ...(source ? { source } : {}) };
  });
  return {
    allocMB: mb(total), allocMBPerS: seconds > 0 ? mb(total / seconds) : null, sites: ranked,
    byChunk: [...chunks].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([chunk, bytes]) => ({ chunk, mb: mb(bytes) })),
  };
}

/** Start the main thread's sampling CPU profile; `stop()` returns it. */
async function startCpuProfile(page) {
  const cdp = await page.target().createCDPSession();
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  return {
    async stop() {
      const { profile } = await cdp.send('Profiler.stop');
      await cdp.send('Profiler.disable').catch(() => {});
      await cdp.detach().catch(() => {});
      return profile;
    },
  };
}

/** A CPU profile's self time by function (and by chunk), sources mapped when `resolve` can. */
export function summarizeCpuProfile(profile, seconds, { resolve = null, top = 40 } = {}) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const self = new Map();
  let total = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const us = profile.timeDeltas[i + 1] ?? 0;
    const node = byId.get(profile.samples[i]);
    if (!node) continue;
    total += us;
    const f = node.callFrame;
    const key = `${f.url}|${f.lineNumber}|${f.columnNumber}|${f.functionName}`;
    const row = self.get(key) ?? { fn: f.functionName || '(anonymous)', url: f.url || '', line: f.lineNumber, col: f.columnNumber, us: 0 };
    row.us += us;
    self.set(key, row);
  }
  const ms = (us) => Math.round(us / 10) / 100;
  const chunks = new Map();
  for (const row of self.values()) { const chunk = chunkOfUrl(row.url, row.fn); chunks.set(chunk, (chunks.get(chunk) ?? 0) + row.us); }
  return {
    totalMs: ms(total), msPerS: seconds > 0 ? ms(total / seconds) : null,
    functions: [...self.values()].sort((a, b) => b.us - a.us).slice(0, top).map((row) => {
      const source = resolve && row.url ? resolve(row.url, row.line, row.col) : null;
      return { ms: ms(row.us), msPerS: seconds > 0 ? ms(row.us / seconds) : null, fn: row.fn, chunk: chunkOfUrl(row.url, row.fn), ...(source ? { source } : {}) };
    }),
    byChunk: [...chunks].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([chunk, us]) => ({ chunk, ms: ms(us) })),
  };
}

/** Resolve a dist script position to its source through the script's own map (dist/assets/<file>.map), when present. */
export async function sourceResolver(root) {
  let TraceMap, originalPositionFor;
  try { ({ TraceMap, originalPositionFor } = await import('@jridgewell/trace-mapping')); } catch { return null; }
  const maps = new Map();
  return (url, line, column) => {
    const file = url.split(/[?#]/)[0].split('/').pop();
    if (!maps.has(file)) {
      const mapFile = path.join(root, 'dist', 'assets', `${file}.map`);
      maps.set(file, existsSync(mapFile) ? new TraceMap(readFileSync(mapFile, 'utf8')) : null);
    }
    const map = maps.get(file);
    if (!map) return null;
    const p = originalPositionFor(map, { line: line + 1, column });
    return p.source ? `${p.source.replace(/^(\.\.\/)+/, '')}:${p.line}${p.name ? ` ${p.name}` : ''}` : null;
  };
}

/** Keep the renderer main thread's and the GPU main thread's events (the rest of a trace is the analysis's noise). */
export function filterTraceEvents(events) {
  const main = rendererMainThread(events, SYNC_MARK);
  const gpu = new Set();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrGpuMain') gpu.add(`${e.pid}:${e.tid}`);
  return events.filter((e) => (e.ph === 'M') || (main && e.pid === main.pid && e.tid === main.tid) || gpu.has(`${e.pid}:${e.tid}`));
}

/**
 * (--draw-attribution; battle-spikes-253, the draw-count lever) Every draw of `frames` frames by pass (the shadow maps:
 * an orthographic camera; the rest by the camera's kind), and a tank's (its visual root) by its distance band from the
 * view camera (the far merge's 30 m and the far LOD's 180 m) and its part (two levels under the root); with the distinct
 * materials and programs drawn, all and on tanks. Run in the page (no closures).
 */
export async function pageDrawAttribution(frames) {
  const D = window.__DEBUG, R = D.renderer, scene = D.scene, camera = D.camera;
  const roots = new Map();
  for (const tank of D.game.tanks) if (tank.visual?.root) roots.set(tank.visual.root, tank);
  const ownerOf = (object) => { for (let o = object; o; o = o.parent) if (roots.has(o)) return o; return null; };
  const partOf = (object, root) => {
    const path = [];
    for (let o = object; o && o !== root; o = o.parent) path.push(o.name || o.type);
    return path.reverse().slice(0, 2).join('/');
  };
  const bandOf = (distance) => (distance < 30 ? 'near<30' : distance < 180 ? 'mid30-180' : 'far>180');
  const fxKinds = {};
  const passes = {}, bands = {}, parts = {}, materials = new Set(), programs = new Set(), tankMaterials = new Set(), tankPrograms = new Set();
  const tanksSeen = {};
  const props = R.properties;
  const orig = R.renderBufferDirect;
  const at = { x: 0, y: 0, z: 0 };
  // (battle-spikes-253) shadow draws by cascade (the shadow camera's light), the static cache's phase (a rebuild's static
  // layer, the dynamic layer over a copy, or an ordinary render) and owner (world, tank, other)
  const cascadeOf = new Map((D.lighting?.csm?.lights ?? []).map((light, index) => [light.shadow.camera, index]));
  const cascades = {}, dynamicWorld = {}, fxCascades = {};
  R.renderBufferDirect = function (cam, sc, geometry, material, object) {
    const pass = cam?.isOrthographicCamera ? 'shadow' : 'main';
    passes[pass] = (passes[pass] ?? 0) + 1;
    if (pass === 'shadow') {
      let top = object;
      while (top.parent && top.parent !== scene) top = top.parent;
      const owner = ownerOf(object) ? 'tank' : /^world/.test(top.name || '') ? 'world' : 'other';
      const phase = D.lighting?.staticCacheFrame?.drawPhase || 'full';
      const key = `c${cascadeOf.get(cam) ?? '?'}|${phase}|${owner}`;
      cascades[key] = (cascades[key] ?? 0) + 1;
      // the world's draws the cache leaves to the dynamic layer, by what drew (its name, else its parent's), indices dropped
      if (phase === 'dynamic' && owner === 'world') {
        const name = `${(object.name || `${object.parent?.name || '?'}>${object.type}`).replace(/[-_]?\d+$/, '')}${object.isInstancedMesh ? '[I]' : ''}`;
        dynamicWorld[name] = (dynamicWorld[name] ?? 0) + 1;
      }
    }
    materials.add(material);
    const program = props?.get?.(material)?.currentProgram;
    if (program) programs.add(program);
    const root = ownerOf(object);
    if (root) {
      tankMaterials.add(material);
      if (program) tankPrograms.add(program);
      const p = root.getWorldPosition ? root.matrixWorld.elements : null;
      if (p) { at.x = p[12]; at.y = p[13]; at.z = p[14]; }
      const c = camera.matrixWorld.elements;
      const band = bandOf(Math.hypot(at.x - c[12], at.y - c[13], at.z - c[14]));
      const key = `${band}|${pass}`;
      bands[key] = (bands[key] ?? 0) + 1;
      (tanksSeen[band] ??= new Set()).add(root);
      const pk = `${band}|${pass}|${partOf(object, root)}`; parts[pk] = (parts[pk] ?? 0) + 1;
    } else {
      let top = object;
      while (top.parent && top.parent !== scene) top = top.parent;
      const key = `${top.name || top.type}|${pass}`;
      bands[`other:${key}`] = (bands[`other:${key}`] ?? 0) + 1;
      // the effects by what drew (a collapse's baked heap, a fracture's face, a body in flight), their indices dropped
      if (top !== object && (top.name === 'fx' || top.userData?.fxRoot)) {
        const kind = `${(object.name || object.type).replace(/[-_]?\d+$/, '')}|${pass}`;
        fxKinds[kind] = (fxKinds[kind] ?? 0) + 1;
        // and its shadow draws by cascade (a flying body's reach profile keeps it out of the cascades it cannot reach)
        if (pass === 'shadow') { const ck = `${kind}|c${cascadeOf.get(cam) ?? '?'}`; fxCascades[ck] = (fxCascades[ck] ?? 0) + 1; }
      }
    }
    return orig.apply(this, arguments);
  };
  // the static shadow cache's decision a frame (engine/shadowStaticCache.ts frameRecord): its cascades rebuilt, reused,
  // rendered whole or still settling, and why
  const cache = { frames: 0, rebuilt: 0, reused: 0, full: 0, unsettled: 0, kept: 0, reasons: {}, content: {} };
  const bits = (mask) => { let n = 0; for (let m = mask >>> 0; m; m &= m - 1) n++; return n; };
  const readCache = () => {
    const r = D.lighting?.staticCacheFrame;
    if (!r) return;
    cache.frames++; cache.rebuilt += bits(r.rebuildMask); cache.reused += bits(r.reuseMask); cache.full += bits(r.fullMask);
    cache.unsettled += bits(r.unsettledMask);
    cache.kept += bits(r.keptMask ?? 0); // (a bounded content change's cascades left standing)
    if (r.reason) cache.reasons[r.reason] = (cache.reasons[r.reason] ?? 0) + 1;
    if (r.content) { const key = `${r.content}:${r.changed}`; cache.content[key] = (cache.content[key] ?? 0) + 1; }
  };
  await new Promise((resolve) => { let n = 0; const tick = () => { readCache(); if (++n >= frames) resolve(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  R.renderBufferDirect = orig;
  const per = (count) => Math.round(count / frames * 10) / 10;
  const tanksIn = Object.fromEntries(Object.entries(tanksSeen).map(([band, set]) => [band, set.size]));
  const bandRows = Object.entries(bands).map(([k, v]) => [k, per(v)]).sort((a, b) => b[1] - a[1]);
  const perTank = {};
  for (const [k, v] of Object.entries(bands)) {
    if (k.startsWith('other:')) continue;
    const [band, pass] = k.split('|');
    perTank[`${band}|${pass}`] = Math.round(v / frames / Math.max(1, tanksIn[band] ?? 1) * 10) / 10;
  }
  const topParts = Object.entries(parts).map(([k, v]) => {
    const band = k.split('|')[0];
    return [k, Math.round(v / frames / Math.max(1, tanksIn[band] ?? 1) * 100) / 100];
  }).sort((a, b) => b[1] - a[1]).slice(0, 60);
  return { frames, passes: Object.fromEntries(Object.entries(passes).map(([k, v]) => [k, per(v)])),
    shadowCascades: Object.fromEntries(Object.entries(cascades).sort().map(([k, v]) => [k, per(v)])),
    dynamicWorld: Object.entries(dynamicWorld).map(([k, v]) => [k, per(v)]).sort((a, b) => b[1] - a[1]).slice(0, 30), tanksIn, perTank,
    rows: bandRows.slice(0, 40), topParts, materials: materials.size, programs: programs.size,
    fxKinds: Object.entries(fxKinds).map(([k, v]) => [k, per(v)]).sort((a, b) => b[1] - a[1]).slice(0, 30),
    fxCascades: Object.fromEntries(Object.entries(fxCascades).sort().map(([k, v]) => [k, per(v)])),
    tankMaterials: tankMaterials.size, tankPrograms: tankPrograms.size, shadowCache: cache };
}

/**
 * (--dom-census; battle-spikes-253, the battle UI budget: the HUD at 0.5 ms a frame, no forced reflow) Over `frames`
 * frames, the DOM reads and queries the page makes — querySelector(All), getBoundingClientRect, getClientRects,
 * getComputedStyle — counted and timed a frame (a read after a write forces the layout inside its call, so its time is
 * the reflow's), the slowest frame's, and by the stack's first page frame (chunk:line:col, resolved by the census).
 * Run in the page (no closures).
 */
async function pageDomCensus(frames) {
  const targets = [[Document.prototype, 'querySelectorAll'], [Document.prototype, 'querySelector'], [Element.prototype, 'querySelectorAll'],
    [Element.prototype, 'querySelector'], [Element.prototype, 'getBoundingClientRect'], [Element.prototype, 'getClientRects'], [window, 'getComputedStyle']];
  const restore = [];
  const totals = {}, sites = new Map();
  let frameMs = 0, frameCalls = 0;
  const perFrame = [];
  const siteOf = () => {
    const stack = new Error().stack?.split('\n') ?? [];
    for (const line of stack.slice(3)) {
      const m = /\/assets\/([^/:]+):(\d+):(\d+)/.exec(line);
      if (m) return `${m[1]}:${m[2]}:${m[3]}`;
    }
    return '?';
  };
  for (const [owner, name] of targets) {
    const original = owner[name];
    if (typeof original !== 'function') continue;
    const label = `${owner === window ? 'window' : owner === Document.prototype ? 'document' : 'element'}.${name}`;
    owner[name] = function () {
      const t0 = performance.now();
      try { return original.apply(this, arguments); } finally {
        const ms = performance.now() - t0;
        const row = totals[label] ??= { calls: 0, ms: 0 };
        row.calls++; row.ms += ms; frameMs += ms; frameCalls++;
        if (ms > 0.05 || row.calls % 50 === 1) { const site = `${label} ${siteOf()}`; const r = sites.get(site) ?? { calls: 0, ms: 0 }; r.calls++; r.ms += ms; sites.set(site, r); }
      }
    };
    restore.push(() => { owner[name] = original; });
  }
  await new Promise((resolve) => {
    let n = 0;
    const tick = () => { perFrame.push([frameCalls, frameMs]); frameCalls = 0; frameMs = 0; if (++n >= frames) resolve(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  for (const undo of restore) undo();
  const sorted = perFrame.map(([, ms]) => ms).sort((a, b) => a - b);
  const q = (p) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] * 1000) / 1000;
  return { frames, perFrameMs: { median: q(0.5), p90: q(0.9), max: q(1) },
    callsPerFrame: Math.round(perFrame.reduce((a, [c]) => a + c, 0) / frames * 10) / 10,
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, { calls: Math.round(v.calls / frames * 10) / 10, ms: Math.round(v.ms / frames * 1000) / 1000 }])),
    sites: [...sites].sort((a, b) => b[1].ms - a[1].ms).slice(0, 25).map(([k, v]) => [k, v.calls, Math.round(v.ms * 100) / 100]) };
}

const keyOf = (scenario, size, pass, label = '') => `${label ? `${label}--` : ''}${scenario.replace(':', '-')}-${size}v${size}-${pass}`;

// the browser playing now: a stopped census (SIGTERM, SIGINT) closes it before it exits, leaving no orphan Chrome
let activeBrowser = null;
// a guard trip (exit: false) released the capture FIFO with the browser: the next battle takes its place again
let guardReleasedLocks = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    const closing = activeBrowser ? activeBrowser.close().catch(() => {}) : Promise.resolve();
    void closing.finally(() => process.exit(130));
  });
}

/** A scenario raced against its watchdog's abort and its deadline: a stuck page never holds the census (and the FIFO). */
async function runScenario(options, side, scenario, size, done) {
  let fail;
  const failed = new Promise((_, reject) => { fail = reject; });
  failed.catch(() => {});
  const deadline = setTimeout(() => fail(new Error(`${scenario} ${size}v${size}: past its ${SCENARIO_DEADLINE_MS / 60000}-minute deadline`)), SCENARIO_DEADLINE_MS);
  deadline.unref();
  const run = playScenario(options, side, scenario, size, done, (reason) => fail(new Error(reason)));
  run.catch(() => {}); // a run left behind by an abort settles (or not) on its own
  try { await Promise.race([run, failed]); } finally {
    clearTimeout(deadline);
    // whatever stopped the race, the scenario's browser goes with it
    await activeBrowser?.close().catch(() => {});
    activeBrowser = null;
  }
}

async function playScenario(options, side, scenario, size, done, abort) {
  const [mapId, gameMode] = scenario.split(':');
  const [width, height] = options.viewport.split('x').map(Number);
  const allies = size - 1, enemies = size;
  let aborted = null;
  // (2026-10-27) the guard is the one memory rule: a trip kills this browser and fails this battle only (exit: false)
  const browser = await launchGuardedBrowser(puppeteer, { headless: 'new', protocolTimeout: 900000,
    args: [...MAP_PROBE_BROWSER_ARGS, '--enable-precise-memory-info', `--window-size=${width},${height}`, '--js-flags=--max-old-space-size=3072'] },
  {
    label: `battle-spike-census ${side.label ? `${side.label} ` : ''}${scenario} ${size}v${size}`,
    treeCapMb: Number(process.env.COT_BROWSER_TREE_CAP_MB) || BATTLE_TREE_CAP_MB,
    exit: false,
    onTrip: (report) => {
      guardReleasedLocks = true;
      if (aborted) return;
      aborted = `browser guard: ${report.why}`;
      log(`${side.label ? `${side.label} ` : ''}${scenario} ${size}v${size}: ${aborted}: aborting`);
      abort(aborted);
    },
  });
  activeBrowser = browser;
  const pid = browser.process()?.pid;
  // the browser tree's resident set (the GPU process's Metal memory included on a Mac): its peak a battle, recorded
  const rss = { peakKb: 0 };
  const watchdog = setInterval(() => {
    const kb = pid ? treeRssKb(pid) : 0;
    rss.peakKb = Math.max(rss.peakKb, kb);
  }, 5000);
  watchdog.unref();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error?.message ?? error).slice(0, 300)));
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(installCensusObservers, { preset: options.preset, allies, enemies });
    if (options.shadowDebug) await page.evaluateOnNewDocument((flags) => { window.__SHADOW_DEBUG = { ...(window.__SHADOW_DEBUG ?? {}), ...flags }; }, options.shadowDebug);
    const bootAt = Date.now();
    await page.goto(`http://127.0.0.1:${side.port}/?nosplash=1&tier=desktop`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction('window.__GAME_READY === true', { timeout: 300000 });
    // the adaptive resolution held at its full scale from boot (--governor=pinned): no mid-battle reallocation
    if (options.governor === 'pinned') {
      await page.evaluate(() => { const P = window.__DEBUG.post; P.setAdaptiveSuspended?.(true); P.pinDynScale?.(1); });
    }
    const bootMs = Date.now() - bootAt;
    const catalog = await page.evaluate(() => window.__DEBUG.game.allTanks.map((e) => e.specId));
    const opponents = pinnedOpponents(catalog, options.spec, allies + enemies);
    await page.evaluate((ids) => { const f = window.__DEBUG.flags; f.forceRoster = ids; f.rosterExact = true; }, opponents);
    await page.evaluate(() => window.__DEBUG.frameStages.install({ gl: true }));
    let played = false;
    for (const pass of options.passes) {
      const key = keyOf(scenario, size, pass, side.label);
      if (done.has(key)) { log(`${key}: measured already`); continue; }
      // a warm battle is the page's second: a resumed run whose cold battle was measured earlier plays one, unrecorded
      if (pass === 'warm' && !played) {
        log(`${key}: the page's first battle, unrecorded (its cold one was measured earlier)`);
        await primeBattle(page, options, { mapId, gameMode });
      }
      if (pass === 'warm') {
        await page.evaluate(() => window.__DEBUG.leaveBattleToGarage());
        await page.waitForFunction('window.__DEBUG.game.phase === "garage"', { timeout: 180000, polling: 250 });
        await sleep(5000);
      }
      rss.peakKb = 0;
      const record = await measureBattle(page, { ...options, root: side.root, port: side.port }, { mapId, gameMode, allies, enemies, pass, key });
      record.browserPeakRssMB = Math.round(rss.peakKb / 1024);
      record.label = side.label;
      record.governor = options.governor;
      record.shadowDebug = options.shadowDebug ?? null;
      played = true;
      record.bootMs = bootMs;
      record.errors = errors.splice(0);
      writeFileSync(path.join(options.out, `${key}.json`), JSON.stringify(record, null, 1));
      const s = record.analysis;
      const gc = record.live.heap;
      log(`${key}: ${s.intervals.count} frames (median ${s.intervals.medianMs} ms), ${s.intervals.over33} over 33 ms, ${s.intervals.hitches} hitches `
        + `past ${s.intervals.hitchMs} ms (max ${s.intervals.max} ms), ${s.longTasks.length} long tasks; live: ${record.live.links?.links ?? '?'} links, `
        + `${gc?.allocMBPerS ?? '?'} MB/s allocated, ${gc?.scavenges ?? '?'} scavenges — `
        + `${Object.entries(s.summary).slice(0, 5).map(([c, r]) => `${c} ${r.spikes}/${r.longTasks}`).join(', ')}`);
      const draws = record.live.draws;
      if (draws) log(`${key}: draws ${draws.draws.median} (p90 ${draws.draws.p90}), programs ${draws.programsUsed.median}, switches `
        + `${draws.programSwitches.median}, submission ${draws.submitMs.median} ms (p90 ${draws.submitMs.p90}), ${draws.usPerDraw} µs a draw`);
      const da = record.drawAttribution;
      if (da && !da.error) log(`${key}: tanks by band ${JSON.stringify(da.tanksIn)}, a tank's draws ${JSON.stringify(da.perTank)}; passes `
        + `${JSON.stringify(da.passes)}; materials ${da.materials} (tanks ${da.tankMaterials}), programs ${da.programs} (tanks ${da.tankPrograms}); `
        + `shadow cache ${JSON.stringify(da.shadowCache)}; shadow draws by cascade|phase|owner ${JSON.stringify(da.shadowCascades)}; the world's dynamic-layer draws ${JSON.stringify(da.dynamicWorld)}`);
      const dc = record.domCensus;
      if (dc && !dc.error) log(`${key}: DOM reads ${dc.callsPerFrame} a frame, ${dc.perFrameMs.median} ms (p90 ${dc.perFrameMs.p90}, max ${dc.perFrameMs.max}); `
        + `${dc.sites.slice(0, 6).map(([site, calls, ms]) => `${site} ${calls}x ${ms} ms`).join('; ')}`);
      if (aborted) throw new Error(aborted);
    }
  } finally {
    clearInterval(watchdog);
    await browser.close().catch(() => {});
    activeBrowser = null;
  }
}

/** Play one battle unrecorded (the census's driver, its seconds of combat): the page's first, before a resumed warm one. */
async function primeBattle(page, options, { mapId, gameMode }) {
  const watched = options.driver === 'watch' && gameMode !== 'ac130';
  if (watched) {
    await page.evaluate((request) => { setTimeout(() => window.__DEBUG.beginBattleEntry(request.specId, request.mapId, { gameMode: request.gameMode, watch: true }), 0); },
      { specId: options.spec, mapId, gameMode });
  } else {
    await page.evaluate((request) => { setTimeout(() => window.__DEBUG.beginSoloBattle(request), 0); }, { specId: options.spec, mapId, gameMode });
  }
  await waitForGame(page, 'window.__DEBUG.game.phase === "battle" && window.__DEBUG.game.preBattleS <= 0', { timeout: 420000, polling: 250 });
  if (watched) await sleep(options.seconds * 1000);
  else await driveBattle(page, { seconds: options.seconds, mode: gameMode });
}

/**
 * (battle-spikes-253) A wait on the game whose timeout says where the game stood: its phase, the countdown, the battle
 * load's and the world build's records, and its page errors (an evaluate raced against 20 s: a blocked main thread says
 * so). A battle that never started used to leave only "Waiting failed".
 */
async function waitForGame(page, expression, options) {
  try {
    await page.waitForFunction(expression, options);
  } catch (error) {
    const state = await Promise.race([
      page.evaluate(() => {
        const D = window.__DEBUG;
        const brief = (value) => { try { return JSON.stringify(value)?.slice(0, 600) ?? null; } catch { return 'unserialisable'; } };
        return { phase: D?.game?.phase ?? null, preBattleS: D?.game?.preBattleS ?? null, battleLoad: brief(window.__BATTLE_LOAD ?? null),
          worldLoad: brief(window.__WORLD_LOAD ?? null), prefetch: brief(window.__WORLD_PREFETCH ?? null),
          countdownWarm: brief(window.__BATTLE_COUNTDOWN_WARM ?? null) };
      }).catch((e) => ({ evaluateFailed: String(e?.message ?? e).slice(0, 200) })),
      new Promise((resolve) => setTimeout(() => resolve({ evaluateFailed: 'no answer in 20 s (the main thread blocked)' }), 20000)),
    ]);
    error.message = `${error.message}; at the timeout ${JSON.stringify(state).slice(0, 2400)}`;
    throw error;
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
    await waitForGame(page, 'window.__DEBUG.game.phase === "battle"', { timeout: 420000, polling: 100 });
    if (options.trace) {
      tracer = await startTrace(page, { detail: options.traceDetail });
      syncPerfMs = await page.evaluate((name) => performance.mark(name).startTime, SYNC_MARK);
    }
    // the CPU profile covers the battle from its phase on, as the trace does: the countdown's warm work and the fight
    const battlePhaseMs = await page.evaluate(() => performance.now());
    const cpuProfiler = options.cpuProfile ? await startCpuProfile(page) : null;
    await waitForGame(page, 'window.__DEBUG.game.phase === "battle" && window.__DEBUG.game.preBattleS <= 0', { timeout: 420000, polling: 250 });
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
    const heapProfiler = options.heapProfile ? await startHeapProfile(page) : null;
    if (watched) await sleep(options.seconds * 1000);
    else await driveBattle(page, { seconds: options.seconds, mode: gameMode });
    const endMs = await page.evaluate(() => performance.now());
    let cpuProfile = null;
    if (cpuProfiler) {
      const profile = await cpuProfiler.stop();
      writeFileSync(path.join(options.out, `${key}.cpu.json.gz`), gzipSync(JSON.stringify(profile)));
      cpuProfile = summarizeCpuProfile(profile, (endMs - battlePhaseMs) / 1000, { resolve: await sourceResolver(options.root) });
    }
    let heapProfile = null;
    if (heapProfiler) {
      const profile = await heapProfiler.stop();
      writeFileSync(path.join(options.out, `${key}.heap.json.gz`), gzipSync(JSON.stringify(profile)));
      heapProfile = summarizeHeapProfile(profile, (endMs - liveStartMs) / 1000, { resolve: await sourceResolver(options.root) });
    }
    const play = await page.evaluate(() => {
      const g = window.__DEBUG.game;
      return { shots: window.__DEBUG.playerShellLog?.length ?? 0, alive: g.tanks.filter((e) => !e.combat?.destroyed).length,
        destroyed: g.tanks.filter((e) => e.combat?.destroyed).length, simS: +g.timeS.toFixed(1), result: !!g.result };
    });
    // (--draw-attribution) 30 frames of draws by pass, tank band and part, at the battle's end (after the readout's window)
    const drawAttribution = options.drawAttribution ? await page.evaluate(pageDrawAttribution, 30).catch((error) => ({ error: String(error?.message ?? error) })) : null;
    // (--dom-census) 120 frames of DOM reads and queries, at the battle's end
    const domCensus = options.domCensus ? await page.evaluate(pageDomCensus, 120).catch((error) => ({ error: String(error?.message ?? error) })) : null;
    if (domCensus?.sites) {
      const resolve = await sourceResolver(options.root);
      if (resolve) domCensus.sites = domCensus.sites.map(([site, calls, ms]) => {
        const m = /^(\S+) ([^:]+):(\d+):(\d+)$/.exec(site);
        const at = m ? resolve(m[2], Number(m[3]) - 1, Number(m[4]) - 1) : null;
        return [at ? `${m[1]} ${at}` : site, calls, ms];
      });
    }
    const readout = await page.evaluate(() => window.__DEBUG.frameStages.read());
    // the deferred warm's own record (game/deferredCombatWarmRuntime.ts): its stages, each opening route's job, when it ended
    const deferredWarm = await page.evaluate(() => {
      try { return JSON.parse(JSON.stringify(window.__BATTLE_DEFERRED_WARM ?? null)); } catch { return null; }
    });
    // a session's first battle's covered warm (combatWarmComposition warmFirstBattleCovered) and the entry's own trace
    const entryWarm = await page.evaluate(() => {
      try {
        const load = window.__BATTLE_LOAD ?? null;
        return JSON.parse(JSON.stringify({ firstBattleWarm: window.__BATTLE_FIRST_WARM ?? null, loadTotalMs: load?.totalMs ?? null,
          loadingElapsedMs: load?.loadingElapsedMs ?? null, stages: load?.stages ?? null }));
      } catch { return null; }
    });
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
      analysis, live, heapProfile, cpuProfile, deferredWarm, entryWarm, drawAttribution, domCensus,
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
  return { analysis, live: { intervals: live.intervals, heap: live.heap, links: live.links, firstDraws: live.firstDraws, draws: live.draws,
    summary: live.summary, spikes: live.spikes.length, longTasks: live.longTasks.length } };
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
    log(`${name}: ${record.analysis.intervals.over33} over 33 ms, ${record.analysis.intervals.hitches} hitches, ${record.analysis.longTasks.length} long tasks`);
  }
  writeFileSync(path.join(dir, 'census.json'), JSON.stringify(summarizeCensus(dir), null, 1));
}

export async function runCensus(options) {
  mkdirSync(options.out, { recursive: true });
  const done = new Set(options.resume ? readdirSync(options.out).filter((n) => /-(cold|warm)\.json$/.test(n)).map((n) => n.replace(/\.json$/, '')) : []);
  for (const side of options.roots) {
    if (!existsSync(path.join(side.root, 'dist', 'index.html'))) throw new Error(`${side.root} has no dist (npm run build)`);
  }
  let locks = await acquireProbeLocks({ log });
  const refresh = setInterval(() => locks.refresh(), 30000);
  refresh.unref();
  // a chunk with a budget stops hard 30 minutes past it, whatever is pending: the FIFO is the other lanes' too
  if (options.budgetMin) {
    setTimeout(() => {
      log(`hard stop: ${options.budgetMin + 30} minutes`);
      void (activeBrowser?.close() ?? Promise.resolve()).catch(() => {}).finally(() => { locks.release(); process.exit(2); });
    }, (options.budgetMin + 30) * 60000).unref();
  }
  const servers = [];
  for (const side of options.roots) servers.push(await openPreview(side.root, side.port));
  const started = Date.now();
  const failures = [];
  let turn = 0;
  try {
    for (const scenario of options.scenarios) {
      for (const size of options.sizes) {
        // the sides alternate who plays first, battle pair to battle pair
        const order = turn++ % 2 ? [...options.roots].reverse() : options.roots;
        for (const side of order) {
          if (options.budgetMin && (Date.now() - started) / 60000 > options.budgetMin) { log('time budget spent: stopping'); return { failures, stopped: true }; }
          try { await runScenario(options, side, scenario, size, done); } catch (error) {
            failures.push({ scenario, size, label: side.label, error: String(error?.message ?? error).slice(0, 2600) });
            log(`${side.label ? `${side.label} ` : ''}${scenario} ${size}v${size} FAILED: ${String(error?.message ?? error).slice(0, 1500)}`);
          }
          if (guardReleasedLocks) {
            guardReleasedLocks = false;
            log('the browser guard released the capture FIFO: queueing again');
            locks = await acquireProbeLocks({ log });
          }
        }
      }
    }
  } finally {
    for (const server of servers) await server.close().catch(() => {});
    clearInterval(refresh);
    locks.release();
  }
  writeFileSync(path.join(options.out, 'census.json'), JSON.stringify(summarizeCensus(options.out), null, 1));
  if (options.roots.length > 1) writeFileSync(path.join(options.out, 'census-ab.json'), JSON.stringify(compareCensus(options.out), null, 1));
  return { failures };
}

/** An A/B census's pairs: each battle on each side, the hitches, the causes, the GPU stalls and the first-use links. */
export function compareCensus(dir) {
  const { rows } = summarizeCensus(dir);
  const pairs = new Map();
  for (const row of rows) {
    const key = row.key.replace(/^[^-]+--/, '');
    const pair = pairs.get(key) ?? { key };
    const gpu = (row.causes['gpu busy']?.spikes ?? 0);
    pair[row.label || 'only'] = { hitches: row.hitches, liveHitches: row.liveHitches, over33: row.over33, median: row.medianMs, max: row.max,
      gpuBusy: gpu, links: row.liveLinks, longTasks: row.longTasks, load: row.load?.before?.[0] ?? null };
    pairs.set(key, pair);
  }
  const labels = [...new Set(rows.map((row) => row.label || 'only'))];
  const totals = {};
  for (const label of labels) {
    const sides = [...pairs.values()].map((pair) => pair[label]).filter(Boolean);
    totals[label] = { battles: sides.length, hitches: sides.reduce((n, x) => n + (x.hitches ?? 0), 0),
      liveHitches: sides.reduce((n, x) => n + (x.liveHitches ?? 0), 0), gpuBusy: sides.reduce((n, x) => n + x.gpuBusy, 0),
      links: sides.reduce((n, x) => n + (x.links ?? 0), 0), worst: Math.max(0, ...sides.map((x) => x.max ?? 0)) };
  }
  return { labels, totals, pairs: [...pairs.values()] };
}

/** The folder's battles side by side: spikes, long tasks and the causes, cold against warm. */
export function summarizeCensus(dir) {
  const rows = [];
  for (const name of readdirSync(dir).filter((n) => /-(cold|warm)\.json$/.test(n)).sort()) {
    const r = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
    rows.push({ key: r.key, label: r.label ?? '', map: r.mapId, mode: r.gameMode, size: r.size, pass: r.pass, tanks: r.roster?.count, entryMs: r.entryMs,
      frames: r.analysis.intervals.count, over33: r.analysis.intervals.over33, over50: r.analysis.intervals.over50,
      over100: r.analysis.intervals.over100, p99: r.analysis.intervals.p99, max: r.analysis.intervals.max,
      longTasks: r.analysis.longTasks.length, medianMs: r.analysis.intervals.medianMs, hitches: r.analysis.intervals.hitches, peakRssMB: r.browserPeakRssMB ?? null,
      liveOver33: r.live.intervals.over33, liveHitches: r.live.intervals.hitches, liveLinks: r.live.links?.links ?? null,
      linkNames: r.live.links?.names ?? null, gc: r.live.heap ?? null, heapProfileMBPerS: r.heapProfile?.allocMBPerS ?? null,
      causes: r.analysis.summary, load: r.load });
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
