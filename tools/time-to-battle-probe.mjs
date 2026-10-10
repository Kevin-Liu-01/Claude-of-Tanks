#!/usr/bin/env node
// Time-to-battle probe (2026-10-07, the perf lane; the owner: "going into games takes a long time"). From the Garage's
// BATTLE action (__DEBUG.beginBattleEntry, the button's own onBattle handler) to the first playable frame — the loading
// veil gone, the battle open with its countdown — per build, map and cache state, with the game's own load trace
// (src/game/soloBattleLoadingRuntime.ts: the stages world → roster → bake → warm → holdCountdown → primeReveal → hide → open,
// __WORLD_LOAD, __MINIMAP_LOAD, texture uploads, the impostor bake), every tank's construction (__VISUAL_LOAD_TIMINGS: the
// factory build, the shared-texture prebake, upload and program compile, per spec), the shader programs linked and the
// main-thread time inside WebGL's compile, link and status calls, the network (requests, bytes, cache hits) and long tasks.
//
//   node tools/time-to-battle-probe.mjs --roots=<A>,<B> --labels=main,pr --maps=verdant,titan_gorge,monsoon --out=<dir>
//        [--runs=cold,warm] [--reps=1] [--spec=t90m_x] [--sides=13x14] [--profile] [--port=5491] [--session-mutex=<dir>]
//        [--warm=page|relaunch] [--browser-args=<flag>|<flag>]
//
// cold: a fresh browser profile (empty HTTP cache, empty GPU program cache, no storage) — a first visit. warm: a second
// page in the same profile, after the cold run — a returning player (HTTP and GPU caches warm, a fresh page). Both builds
// face the same pinned 27 opponents (every id the two catalogs share but the player, sorted, every k-th: the cost probes'
// rule), the High preset and 14 v 14. Runs alternate the builds' order map by map. --profile adds a CDP CPU profile over
// each entry (attribution only: a profiled run's timings are not comparable with an unprofiled one).
// Locks: the capture FIFO with --session-mutex (frame-budget-probe's acquireProbeLocks) unless a lane hold took them
// (COT_LANE_HOLD=1).
import path from 'node:path';
import os from 'node:os';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { preview } from 'vite';
import puppeteer from 'puppeteer';
import { MAP_PROBE_BROWSER_ARGS, isMainModule, sleep } from './map-probe-runtime.mjs';
import { acquireProbeLocks, installObservers, pinnedOpponents, profileSelfByChunk } from './frame-budget-probe.mjs';

const TOOL = 'time-to-battle';
const log = (m) => console.log(`[${TOOL} ${new Date().toTimeString().slice(0, 8)}] ${m}`);

// ---------------------------------------------------------------------------------------------- page side

/** Before boot: WebGL's compile / link / status calls counted and timed on the main thread, and long tasks kept. */
function installGlTimers() {
  const t = { compileShader: [0, 0], linkProgram: [0, 0], getProgramParameter: [0, 0], getShaderParameter: [0, 0],
    texImage2D: [0, 0], texSubImage2D: [0, 0], compressedTexImage2D: [0, 0], bufferData: [0, 0] };
  // the slow program queries (the warm opening-frame stall): when each program's link was issued, and every status query
  // over 30 ms with its program's link order and age — a query waiting on its own link, or on a queue of links before it
  const linkAt = new WeakMap(), slowQueries = [];
  let linkSeq = 0;
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue;
    for (const name of Object.keys(t)) {
      const original = C.prototype[name];
      if (typeof original !== 'function') continue;
      C.prototype[name] = function (...args) {
        const s = performance.now();
        try { return original.apply(this, args); } finally {
          const now = performance.now(), e = t[name]; e[0]++; e[1] += now - s;
          if (name === 'linkProgram') linkAt.set(args[0], { at: s, seq: ++linkSeq });
          else if (name === 'getProgramParameter' && now - s > 30 && slowQueries.length < 60) {
            const l = linkAt.get(args[0]);
            const pname = args[1] === this.LINK_STATUS ? 'LINK_STATUS' : args[1] === 0x91B1 ? 'COMPLETION_STATUS' : String(args[1]);
            slowQueries.push({ at: +s.toFixed(1), ms: +(now - s).toFixed(1), pname, linkSeq: l?.seq ?? null,
              sinceLinkMs: l ? +(s - l.at).toFixed(1) : null, linksIssued: linkSeq });
          }
        }
      };
    }
  }
  const longTasks = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longTasks.push([+e.startTime.toFixed(1), +e.duration.toFixed(1)]); }).observe({ type: 'longtask', buffered: true }); } catch { /* unsupported */ }
  window.__TTB = {
    gl: t, longTasks, slowQueries,
    snapshot() { return Object.fromEntries(Object.entries(t).map(([k, [n, ms]]) => [k, { n, ms: +ms.toFixed(1) }])); },
  };
}

/** The entry: beginBattleEntry awaited (it resolves once the battle is open); the load trace and the counters at open. */
async function enterBattle({ specId, mapId, opponents }) {
  const D = window.__DEBUG, R = D.renderer;
  const f = D.flags; f.forceRoster = opponents; f.rosterExact = true;
  const gl0 = window.__TTB.snapshot();
  const programs0 = R.info.programs?.length ?? null;
  const longFrom = window.__TTB.longTasks.length;
  // the program churn (2026-10-08: a warm entry links ~30 more programs than a cold one and opens with ~22 fewer): every
  // program the renderer acquires or releases during the entry, by time, shader name and cache-key hash; the released
  // keys kept whole for the diff against a later program of the same name (which parameters changed)
  const churn = [], keys = new Map();
  // the call paths of the releases (and of the acquisitions after the first release): who disposes or swaps materials
  const stacks = new Map();
  const stackOf = () => { const limit = Error.stackTraceLimit; Error.stackTraceLimit = 40; try { return String(new Error().stack || '').split('\n').slice(2, 40).join('\n'); } finally { Error.stackTraceLimit = limit; } };
  // (keyed by the whole path below the probe's own two frames; up to 16 release paths, and 8 acquisition paths once
  // 20 programs have been released — the opening frame's burst, not the impostor bakes' few)
  let releases = 0, acquirePaths = 0;
  const noteStack = (tag) => {
    if (tag === 'release' ? stacks.size - acquirePaths >= 16 : (releases < 20 || acquirePaths >= 8)) return;
    const st = stackOf().split('\n').slice(2).join('\n');
    const e = stacks.get(st);
    if (e) { e.n++; return; }
    stacks.set(st, { tag, n: 1, at: +performance.now().toFixed(1), stack: st.slice(0, 4000) });
    if (tag !== 'release') acquirePaths++;
  };
  let releasedAny = false;
  const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return (h >>> 0).toString(16); };
  try {
    const keyOf = (p) => { const k = String(p?.cacheKey ?? ''); const h = hash(k); if (!keys.has(h)) keys.set(h, k); return h; };
    const watch = (p) => {
      if (!p || p.__ttbWatched || typeof p.destroy !== 'function') return;
      p.__ttbWatched = true;
      const destroy = p.destroy;
      p.destroy = function (...args) { try { churn.push([+performance.now().toFixed(1), '-', p.id, p.name, keyOf(p)]); releasedAny = true; releases++; noteStack('release'); } catch { /* diagnostics only */ } return destroy.apply(this, args); };
    };
    const list = R.info.programs;
    if (Array.isArray(list) && !list.__ttbWatched) {
      list.__ttbWatched = true;
      for (const p of list) { watch(p); churn.push([+performance.now().toFixed(1), '=', p?.id, p?.name, keyOf(p)]); }
      const push = list.push;
      list.push = function (...ps) {
        try { for (const p of ps) { churn.push([+performance.now().toFixed(1), '+', p?.id, p?.name, keyOf(p)]); watch(p); if (releasedAny) noteStack('acquire after release'); } } catch { /* diagnostics only */ }
        return push.apply(this, ps);
      };
    }
  } catch { /* diagnostics only */ }
  const t0 = performance.now();
  await D.beginBattleEntry(specId, mapId);
  const openMs = performance.now() - t0;
  // the churn's summary: per shader name the programs released and acquired during the entry, and for each released key
  // with a later acquired key of the same name, the cache-key fields that differ (index: old -> new)
  let programChurn = null;
  try {
    const ev = churn.filter(([at]) => at >= t0).map(([at, op, id, name, key]) => [+(at - t0).toFixed(1), op, id, name, key]);
    const diffs = [];
    const released = ev.filter((e) => e[1] === '-'), acquired = ev.filter((e) => e[1] === '+');
    for (const r of released) {
      const later = acquired.find((a) => a[3] === r[3] && a[0] >= r[0] - 2000 && a[4] !== r[4]);
      if (!later || diffs.length >= 40) continue;
      const a = (keys.get(r[4]) ?? '').split(','), b = (keys.get(later[4]) ?? '').split(',');
      const fields = [];
      for (let i = 0; i < Math.max(a.length, b.length) && fields.length < 12; i++) if (a[i] !== b[i]) fields.push(`${i}: ${String(a[i]).slice(0, 60)} -> ${String(b[i]).slice(0, 60)}`);
      diffs.push({ name: r[3], releasedAt: r[0], acquiredAt: later[0], lengths: [a.length, b.length], fields });
    }
    // the opening window (the opening frame's stage and 300 ms before it): each program acquired there against its nearest
    // earlier key of the same shader (built-in id, or custom vertex and fragment ids) — the fields that make it new
    const openRel = performance.now() - t0, winMs = (window.__BATTLE_COUNTDOWN_WARM?.stages?.openingFrame ?? 0) + 300;
    const known = churn.filter(([, op]) => op === '=' || op === '+').map(([at, , , name, key]) => [at - t0, name, key]);
    const late = [];
    for (const e of acquired) {
      if (e[0] < openRel - winMs || late.length >= 80) continue;
      const A = (keys.get(e[4]) ?? '').split(',');
      let best = null;
      const seen = new Set();
      for (const [at, , key] of known) {
        if (at >= e[0] || key === e[4] || seen.has(key)) continue;
        seen.add(key);
        const B = (keys.get(key) ?? '').split(',');
        if (B[0] !== A[0] || (A[0] !== '' && /^\d+$/.test(A[0]) && B[1] !== A[1])) continue;
        let n = 0;
        for (let i = 0; i < Math.max(A.length, B.length); i++) if (A[i] !== B[i]) n++;
        if (!best || n < best.n) best = { n, key, at };
      }
      const fields = [];
      if (best) {
        const B = (keys.get(best.key) ?? '').split(',');
        for (let i = 0; i < Math.max(A.length, B.length) && fields.length < 10; i++) if (A[i] !== B[i]) fields.push(`${i}: ${String(B[i]).slice(0, 48)} -> ${String(A[i]).slice(0, 48)}`);
      }
      late.push({ at: e[0], name: e[3], shader: A.slice(0, 2).join(','), nearestAt: best ? +best.at.toFixed(1) : null, nDiff: best?.n ?? null, fields });
    }
    programChurn = { events: ev.slice(0, 600), released: released.length, acquired: acquired.length, diffs, openWindowMs: winMs, late,
      stacks: [...stacks.values()].map((e) => ({ ...e, at: +(e.at - t0).toFixed(1) })) };
  } catch (error) { programChurn = { error: String(error).slice(0, 200) }; }
  const gl1 = window.__TTB.snapshot();
  const diff = (a, b) => Object.fromEntries(Object.keys(b).map((k) => [k, { n: b[k].n - a[k].n, ms: +(b[k].ms - a[k].ms).toFixed(1) }]));
  const lt = window.__TTB.longTasks.slice(longFrom).filter(([at]) => at >= t0);
  return {
    t0, openMs: Math.round(openMs), phase: D.game.phase, preBattleS: D.game.preBattleS,
    trace: window.__BATTLE_LOAD ?? null, world: window.__WORLD_LOAD ?? null, minimap: window.__MINIMAP_LOAD ?? null,
    prefetch: window.__WORLD_PREFETCH ?? null, startBattle: window.__START_BATTLE_TIMINGS ?? null, combatWarm: window.__COMBAT_WARM ?? null,
    topMask: window.__TOP_MASK_LOAD ?? null,
    programsBefore: programs0, programsAtOpen: R.info.programs?.length ?? null, glAtOpen: diff(gl0, gl1),
    slowProgramQueries: window.__TTB.slowQueries.filter((q) => q.at >= t0), programChurn,
    longTasks: { n: lt.length, ms: Math.round(lt.reduce((s, [, d]) => s + d, 0)), max: lt.reduce((m, [, d]) => Math.max(m, d), 0) },
    tanks: D.game.tanks.length, visualsAtOpen: D.game.tanks.filter((e) => e.visual).length,
    gl0,
  };
}

/** After open: every tank's visual built, the countdown and deferred warms done (or 60 s); per-tank timings, counters. */
async function afterOpen({ gl0, t0 }) {
  const D = window.__DEBUG, R = D.renderer;
  const started = performance.now();
  // the early battle: frame intervals and the terrain LOD stream (streamed geometries over time) after the open
  const terrainStats = () => D.world?.group?.children?.find?.((c) => c.name === 'terrain')?.userData?.streamingStats ?? null;
  const frames = [];
  let last = performance.now(), rafOn = true;
  const tick = (now) => { frames.push([+(now - started).toFixed(1), +(now - last).toFixed(1)]); last = now; if (rafOn) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const stream = [];
  const startCount = terrainStats()?.streamedGeometryCount ?? null;
  let lastCount = startCount, lastChangeAt = 0;
  while (performance.now() - started < 60000) {
    const visuals = D.game.tanks.every((e) => e.visual || e.combat?.destroyed);
    const warm = window.__BATTLE_COUNTDOWN_WARM?.done === true && window.__BATTLE_DEFERRED_WARM?.done === true;
    const count = terrainStats()?.streamedGeometryCount ?? null;
    const t = performance.now() - started;
    if (count !== lastCount) { stream.push([Math.round(t), count]); lastCount = count; lastChangeAt = t; }
    // done when every visual and warm is in and the terrain stream has been quiet for 3 s
    if (visuals && warm && t - lastChangeAt > 3000 && t > 5000) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  rafOn = false;
  const streamEndMs = stream.length ? stream[stream.length - 1][0] : 0;
  const inStream = frames.filter(([at]) => at <= streamEndMs).map(([, d]) => d).sort((a, b) => a - b);
  const after = frames.filter(([at]) => at > streamEndMs).map(([, d]) => d).sort((a, b) => a - b);
  const q = (xs, p) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor(p * xs.length))] : null);
  // the first 10 s of the battle (from the open): frame intervals and hitches (worker contention must not move hitches into
  // the battle start)
  const first = frames.filter(([at]) => at <= 10000).map(([, d]) => d).sort((a, b) => a - b);
  const first10s = { n: first.length, p50: q(first, 0.5), p95: q(first, 0.95), p99: q(first, 0.99), max: first[first.length - 1] ?? null,
    over50: first.filter((d) => d > 50).length, over100: first.filter((d) => d > 100).length, sumOver50: Math.round(first.filter((d) => d > 50).reduce((s2, d) => s2 + d, 0)) };
  const earlyBattle = { first10s, terrainStream: { endMs: streamEndMs, steps: stream.length, geometries: stream.length && Number.isFinite(startCount) ? stream[stream.length - 1][1] - startCount : 0, trace: stream.slice(0, 80) },
    framesDuringStream: { n: inStream.length, p50: q(inStream, 0.5), p95: q(inStream, 0.95), max: inStream[inStream.length - 1] ?? null, over50: inStream.filter((d) => d > 50).length },
    framesAfter: { n: after.length, p50: q(after, 0.5), p95: q(after, 0.95), max: after[after.length - 1] ?? null, over50: after.filter((d) => d > 50).length } };
  const gl2 = window.__TTB.snapshot();
  const diff = (a, b) => Object.fromEntries(Object.keys(b).map((k) => [k, { n: b[k].n - a[k].n, ms: +(b[k].ms - a[k].ms).toFixed(1) }]));
  // (mr3's Caldera profile: matrix multiplies and uniform flattening in the render path) the scene's nodes by top-level
  // subtree: how many still recompose their matrices each frame (matrixAutoUpdate) and how many the world froze
  const matrices = {};
  for (const top of D.scene.children) {
    const key = (top.name || top.type || '?').replace(/^world-[a-z_]+$/, 'world').slice(0, 40);
    const e = matrices[key] ??= { nodes: 0, autoUpdate: 0, worldAutoUpdate: 0, frozenRoot: 0 };
    if (top.userData?.matrixTraversalFrozen) e.frozenRoot++;
    top.traverse((o) => { e.nodes++; if (o.matrixAutoUpdate) e.autoUpdate++; if (o.matrixWorldAutoUpdate !== false) e.worldAutoUpdate++; });
  }
  return {
    earlyBattle,
    matrices,
    // (2026-10-08, the ring worker) where the horizon ring came from and when: the worker's run, its answer, when the
    // terrain build asked for it and took it (horizonRingPrefetch.ts stats; null on a build without the worker)
    horizonRing: D.world?.group?.children?.find?.((c) => c.name === 'terrain')?.userData?.horizonRingLoad ?? null,
    settledMs: Math.round(performance.now() - t0), allVisuals: D.game.tanks.every((e) => e.visual),
    visualTimings: window.__VISUAL_LOAD_TIMINGS ?? [], countdownWarm: window.__BATTLE_COUNTDOWN_WARM ?? null,
    deferredWarm: window.__BATTLE_DEFERRED_WARM ?? null, combatOpeningWarm: window.__COMBAT_OPENING_WARM ?? null,
    programsSettled: R.info.programs?.length ?? null, glSettled: diff(gl0, gl2),
    roster: D.game.tanks.map((e) => ({ specId: e.specId, team: e.team, isPlayer: !!e.isPlayer })),
  };
}

// ---------------------------------------------------------------------------------------------- host side

async function catalogOf(port) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ttb-catalog-'));
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: dir, args: [...MAP_PROBE_BROWSER_ARGS] });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/?nosplash=1&tier=desktop`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction('window.__GAME_READY === true', { timeout: 300000 });
    return await page.evaluate(() => window.__DEBUG.game.allTanks.map((e) => e.specId));
  } finally {
    await browser.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
}

async function pageRun(browser, { port, mapId, specId, opponents, allies, enemies, profile, label, run }) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 300)));
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(installObservers, { preset: 'high', allies, enemies });
  await page.evaluateOnNewDocument(installGlTimers);
  // the network of the entry: requests, transferred bytes, cache hits, by resource type
  const net = { on: false, requests: 0, bytes: 0, fromCache: 0, byType: {}, firstAt: null, lastAt: null };
  await cdp.send('Network.enable');
  const reqType = new Map();
  cdp.on('Network.requestWillBeSent', (e) => { if (net.on) { net.requests++; reqType.set(e.requestId, e.type || 'Other'); net.firstAt ??= e.timestamp; } });
  cdp.on('Network.requestServedFromCache', (e) => { if (net.on && reqType.has(e.requestId)) net.fromCache++; });
  cdp.on('Network.loadingFinished', (e) => {
    if (!net.on || !reqType.has(e.requestId)) return;
    const type = reqType.get(e.requestId); net.bytes += e.encodedDataLength || 0; net.lastAt = e.timestamp;
    const b = net.byType[type] ??= { n: 0, bytes: 0 }; b.n++; b.bytes += e.encodedDataLength || 0;
  });
  const navAt = Date.now();
  await page.goto(`http://127.0.0.1:${port}/?nosplash=1&tier=desktop`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 300000 });
  const bootMs = Date.now() - navAt;
  await sleep(1500); // the garage settles as a player's would before pressing BATTLE
  net.on = true;
  if (profile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
  const wallAt = Date.now();
  const entry = await page.evaluate(enterBattle, { specId, mapId, opponents });
  const wallOpenMs = Date.now() - wallAt;
  let cpu = null;
  if (profile) {
    const { profile: prof } = await cdp.send('Profiler.stop');
    const self = new Map();
    const byId = new Map(prof.nodes.map((n) => [n.id, n]));
    for (let i = 0; i < prof.samples.length; i++) {
      const n = byId.get(prof.samples[i]); const us = prof.timeDeltas[i + 1] ?? 0;
      const k = `${n.callFrame.functionName || '(anon)'} ${String(n.callFrame.url).split('/').pop()}:${n.callFrame.lineNumber}`;
      self.set(k, (self.get(k) || 0) + us);
    }
    cpu = { byChunk: profileSelfByChunk(prof).slice(0, 30),
      topSelf: [...self].map(([k, us]) => ({ fn: k, ms: +(us / 1000).toFixed(1) })).sort((a, b) => b.ms - a.ms).slice(0, 60), raw: prof };
    await cdp.send('Profiler.disable').catch(() => {});
  }
  const settled = await page.evaluate(afterOpen, { gl0: entry.gl0, t0: entry.t0 });
  net.on = false;
  delete entry.gl0;
  await page.close().catch(() => {});
  return { tool: TOOL, label, run, mapId, specId, bootMs, wallOpenMs, ...entry, ...settled,
    network: { ...net, spanS: net.firstAt && net.lastAt ? +(net.lastAt - net.firstAt).toFixed(2) : null }, cpu, pageErrors: errors,
    load1: +os.loadavg()[0].toFixed(1) };
}

async function main(opt) {
  const roots = opt.roots.split(',').map((r) => path.resolve(r));
  const labels = (opt.labels ?? 'base,branch').split(',');
  const maps = (opt.maps ?? 'verdant,titan_gorge,monsoon').split(',');
  const runs = (opt.runs ?? 'cold,warm').split(',');
  const reps = Number(opt.reps ?? 1);
  const specId = opt.spec ?? 't90m_x';
  const [allies, enemies] = (opt.sides ?? '13x14').split('x').map(Number);
  const out = path.resolve(opt.out);
  mkdirSync(out, { recursive: true });
  const port0 = Number(opt.port ?? 5491);
  const startedAt = Date.now();
  const budgetMs = Number(process.env.PERF_BUDGET_MS || opt['budget-ms'] || 3600e3);
  const unitMs = Number(opt['unit-ms'] ?? 330000);
  // --browser-args=<flag>|<flag>: extra Chrome flags for the measured browsers (an experiment's arm, e.g. the GPU
  // program disk cache off); the receipt records them
  const extraBrowserArgs = typeof opt['browser-args'] === 'string' ? opt['browser-args'].split('|').filter(Boolean) : [];
  let left = 0;
  const locks = process.env.COT_LANE_HOLD === '1' ? null : await acquireProbeLocks({ sessionMutex: opt['session-mutex'] ?? null, log });
  const refresh = locks ? setInterval(() => locks.refresh(), 30000) : null;
  const servers = [];
  try {
    for (let i = 0; i < roots.length; i++) {
      if (!existsSync(path.join(roots[i], 'dist', 'index.html'))) throw new Error(`${roots[i]} has no dist`);
      servers.push(await preview({ root: roots[i], configFile: false, logLevel: 'error', preview: { host: '127.0.0.1', port: port0 + i, strictPort: true } }));
    }
    // the opponents both catalogs share (a throwaway profile per build: the measured profiles stay cold)
    // (a resumed run keeps the roster it pinned)
    const rosterFile = opt.roster ? path.resolve(opt.roster) : path.join(out, 'roster.json');
    let opponents;
    if (existsSync(rosterFile)) {
      ({ opponents } = JSON.parse(readFileSync(rosterFile, 'utf8')));
      log(`opponents from ${rosterFile}: ${opponents.join(',')}`);
    } else {
      const catalogs = [];
      for (let i = 0; i < roots.length; i++) catalogs.push(new Set(await catalogOf(port0 + i)));
      const shared = [...catalogs[0]].filter((id) => catalogs.every((c) => c.has(id)));
      opponents = pinnedOpponents(shared, specId, allies + enemies);
      log(`${shared.length} shared catalog ids; opponents ${opponents.join(',')}`);
      writeFileSync(rosterFile, JSON.stringify({ specId, opponents, shared: shared.length }, null, 1));
    }
    for (let rep = 0; rep < reps; rep++) {
      for (const [mi, mapId] of maps.entries()) {
        const order = (mi + rep) % 2 === 0 ? roots.map((_, i) => i) : roots.map((_, i) => roots.length - 1 - i);
        for (const i of order) {
          // resumable by (build, map): the cold and warm runs share one fresh profile, so a unit runs whole or not at all
          const fileOf = (run) => path.join(out, `${mapId}-${labels[i]}-${run}-r${rep}${opt.profile ? '-prof' : ''}.json`);
          if (runs.every((run) => existsSync(fileOf(run)))) continue;
          if (Date.now() - startedAt + unitMs > budgetMs) { log(`budget: ${mapId} ${labels[i]} left for the next run`); left++; continue; }
          const dir = mkdtempSync(path.join(os.tmpdir(), 'ttb-profile-'));
          const launch = () => puppeteer.launch({ headless: 'new', userDataDir: dir, protocolTimeout: 600000,
            args: [...MAP_PROBE_BROWSER_ARGS, '--enable-precise-memory-info', '--window-size=1920,1080', ...extraBrowserArgs] });
          let browser = await launch();
          try {
            for (const run of runs) {
              // --warm=relaunch: a returning player — the browser closed after the cold run and opened again on the same
              // profile (its HTTP and GPU disk caches kept, nothing in memory); the default warm run is a second page of the
              // same browser
              if (run !== runs[0] && opt.warm === 'relaunch') { await browser.close().catch(() => {}); browser = await launch(); }
              let rec;
              try {
                rec = await pageRun(browser, { port: port0 + i, mapId, specId, opponents, allies, enemies, profile: !!opt.profile, label: labels[i], run });
              } catch (error) {
                log(`${mapId} ${labels[i]} ${run} FAILED: ${String(error?.message || error).slice(0, 300)}`);
                writeFileSync(path.join(out, `${mapId}-${labels[i]}-${run}-r${rep}-failed.json`), JSON.stringify({ error: String(error?.stack || error).slice(0, 2000) }, null, 1));
                continue;
              }
              rec.rep = rep;
              if (extraBrowserArgs.length) rec.browserArgs = extraBrowserArgs;
              if (opt.warm === 'relaunch') rec.warmMode = 'relaunch';
              const file = fileOf(run);
              // the whole CPU profile beside the record (call trees: who calls what during the entry), not inside it
              if (rec.cpu?.raw) { writeFileSync(file.replace(/\.json$/, '.cpuprofile'), JSON.stringify(rec.cpu.raw)); delete rec.cpu.raw; }
              writeFileSync(file, JSON.stringify(rec, null, 1));
              const st = rec.trace?.stages ?? {};
              log(`${mapId} ${labels[i]} ${run}: open ${rec.openMs} ms (trace ${rec.trace?.totalMs}) · ${Object.entries(st).map(([k, v]) => `${k} ${v}`).join(' · ')} · programs ${rec.programsBefore}→${rec.programsAtOpen}→${rec.programsSettled} · link ${rec.glAtOpen?.linkProgram?.n}/${rec.glAtOpen?.linkProgram?.ms} ms · net ${rec.network.requests} req ${(rec.network.bytes / 1e6).toFixed(1)} MB · load ${rec.load1}`);
            }
          } finally {
            await browser.close().catch(() => {});
            rmSync(dir, { recursive: true, force: true });
          }
        }
      }
    }
    log(left ? `${left} unit(s) left for the next run` : 'every unit measured');
    if (left) process.exitCode = 3;
  } finally {
    if (refresh) clearInterval(refresh);
    locks?.release();
    await Promise.race([Promise.all(servers.map((s) => s.close().catch(() => {}))), sleep(3000)]);
  }
}

if (isMainModule(import.meta.url)) {
  const opt = {};
  for (const a of process.argv.slice(2)) {
    const m = /^--([a-z-]+)(?:=(.*))?$/s.exec(a);
    if (!m) { console.error(`bad argument ${a}`); process.exit(1); }
    opt[m[1]] = m[2] ?? true;
  }
  if (!opt.roots || !opt.out) { console.error('--roots and --out are required'); process.exit(1); }
  try { await main(opt); process.exit(process.exitCode ?? 0); } catch (error) { console.error(error); process.exit(1); }
}
