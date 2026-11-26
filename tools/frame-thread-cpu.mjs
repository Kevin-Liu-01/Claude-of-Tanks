#!/usr/bin/env node
// Frame thread-CPU A/B (world-pools-272, 2026-11-13): the main thread's CPU time per game frame, by the thread clock,
// so a loaded machine's descheduling does not count (the frame-budget probe's wall-clock render path cannot certify a
// sub-millisecond change on a shared Mac). Per slot: a fresh browser, the frame-budget probe's staging (the preset pinned
// before boot, the pinned 14 v 14 roster, every bot frozen and hidden, the governor pinned at 1, the textures awaited), a
// still pose, the terrain stream settled, then a Chrome trace (toplevel + devtools.timeline) over --frames frames: every
// top-level task on the page's renderer main thread, its thread time (`tdur`, the thread clock) and wall time (`dur`).
// A slot's statistic is the main thread's thread time per frame (the tasks' sum over the frames counted by rAF); the
// events carrying the most thread time are listed with it. One browser at a time; the capture FIFO for the whole run.
//
//   node tools/frame-thread-cpu.mjs --roots=<a>,<b>[,...] --labels=a,b[,...] [--queries=,propBatch=0] --maps=verdant
//     [--pattern=ABCCBA] [--view=chase] [--tier=desktop|mobile] [--viewport=1920x1080] [--frames=300] [--port=<n>]
//     [--out=<dir>] [--tag=<tag>] [--lean] [--bots] [--place=<queue key>]
// --bots (far-hull-273): the frozen bots stay drawn (their hulls' draws, the far LOD's among them); --view takes the far
// poses too (tools/far-poses.mjs: far-allies, far-low, far-side), which wait for the far LOD to have built on every
// vehicle past its range before the trace. --place keeps one queue place per hold (capture-hold).
import path from 'node:path';
import os from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold } from './capture-hold.mjs';
import { MAP_PROBE_BROWSER_ARGS, beginSoloBattle, sleep } from './map-probe-runtime.mjs';
import { BOOT_LOADED_EXPRESSION } from './game-readiness.mjs';
import { settleResidencyTerrain } from './world-residency-acquisition.mjs';
import { awaitTextures, freezeBattle, grassSettled, hideOtherVehicles, installObservers, openPreview, pinnedOpponents, poseView } from './frame-budget-probe.mjs';
import { FAR_POSES, farLodCensus, farPose } from './far-poses.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const roots = arg('roots', '').split(',').filter(Boolean).map((r) => path.resolve(r));
const labels = arg('labels', '').split(',').filter(Boolean);
const queries = arg('queries', roots.map(() => '').join(',')).split(',');
const maps = arg('maps', 'verdant').split(',');
const pattern = arg('pattern', 'ABBA');
/** --warm (far-hull-278 PASS-RULE addendum 3): one slot of the pattern's first root before the pattern, a fresh browser and
 * the same settings as every slot; recorded in report.warm with judged: false, never in report.slots (the first slot of a
 * hold ran cold, slower than the same build later in the hold, in 5 of 5 holds). */
const warm = process.argv.includes('--warm');
const view = arg('view', 'chase');
const tier = arg('tier', 'desktop');
const preset = arg('preset', tier === 'desktop' ? 'high' : 'mobile');
const [width, height] = arg('viewport', tier === 'desktop' ? '1920x1080' : '1280x720').split('x').map(Number);
const frames = Number(arg('frames', 300));
/** 0 (the default): the capture slot's port block, else an OS-assigned port (tools/capture-ports.mjs; never a fixed one). */
const port = Number(arg('port', 0));
const out = path.resolve(arg('out', '.qa-dev/frame-thread-cpu'));
const tag = arg('tag', 'cpu');
/** --lean: the toplevel category alone (every top-level task with its thread time; no per-event breakdown), a smaller
 * trace buffer for a page near the browser guard's tree cap. */
const showBots = process.argv.includes('--bots');
const CATEGORIES = process.argv.includes('--lean') ? ['toplevel'] : ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline'];
if (!roots.length || roots.length !== labels.length || queries.length !== roots.length) throw new Error('--roots, --labels and --queries must match');
mkdirSync(out, { recursive: true });

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const round = (v, d = 3) => (v === null ? null : +v.toFixed(d));

/** Trace `n` frames of the page; per-frame FireAnimationFrame thread and wall time (ms) on its renderer main thread. */
async function traceFrames(browser, page, n) {
  const cdp = await browser.target().createCDPSession();
  const events = [];
  cdp.on('Tracing.dataCollected', ({ value }) => { for (const e of value) events.push(e); });
  const complete = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: {
    includedCategories: CATEGORIES, recordMode: 'recordContinuously' } });
  const draws = await page.evaluate((count) => new Promise((resolve) => {
    const R = window.__DEBUG.renderer; const calls = [];
    let left = count;
    const tick = () => { calls.push(R.info.render.calls); if (--left > 0) requestAnimationFrame(tick); else resolve(calls); };
    requestAnimationFrame(tick);
  }), n);
  await cdp.send('Tracing.end');
  await complete;
  await cdp.detach().catch(() => {});
  const threadNames = new Map();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') threadNames.set(`${e.pid}:${e.tid}`, e.args?.name);
  // the page's main thread: the CrRendererMain whose events carry the most thread time (one page per browser)
  const main = new Map();
  for (const e of events) {
    if (e.ph !== 'X' || threadNames.get(`${e.pid}:${e.tid}`) !== 'CrRendererMain') continue;
    const key = `${e.pid}:${e.tid}`;
    const m = main.get(key) ?? { tasks: [], names: new Map() };
    main.set(key, m);
    if (e.name === 'ThreadControllerImpl::RunTask' || e.name === 'RunTask') m.tasks.push(e);
    if (Number.isFinite(e.tdur)) m.names.set(e.name, (m.names.get(e.name) ?? 0) + e.tdur);
  }
  const [, thread] = [...main.entries()].sort((a, b) => b[1].tasks.reduce((s, e) => s + (e.tdur ?? 0), 0) - a[1].tasks.reduce((s, e) => s + (e.tdur ?? 0), 0))[0] ?? [null, null];
  if (!thread) return { traced: 0, threadTimed: 0, frames: draws.length, perFrameThreadMs: null, perFrameWallMs: null, drawsMedian: median(draws), top: [] };
  // top-level tasks only (a task nested in another is counted by its parent)
  const tasks = thread.tasks.sort((a, b) => a.ts - b.ts);
  let end = -Infinity, threadUs = 0, wallUs = 0, timed = 0, counted = 0, first = Infinity, last = -Infinity;
  for (const e of tasks) {
    if (e.ts < end) continue;
    end = e.ts + e.dur;
    counted++; wallUs += e.dur; first = Math.min(first, e.ts); last = Math.max(last, e.ts + e.dur);
    if (Number.isFinite(e.tdur)) { threadUs += e.tdur; timed++; }
  }
  const spanFrames = draws.length;
  return {
    traced: counted, threadTimed: timed, frames: spanFrames,
    perFrameThreadMs: timed ? threadUs / 1000 / spanFrames : null, perFrameWallMs: wallUs / 1000 / spanFrames,
    spanMs: (last - first) / 1000, drawsMedian: median(draws),
    top: [...thread.names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, us]) => [n, round(us / 1000 / spanFrames)]),
  };
}

const report = { roots, labels, queries, maps, pattern, view, tier, preset, viewport: `${width}x${height}`, frames, slots: [], warm: [] };
let hold = null;
try {
  hold = await openCaptureHold({ label: 'frame-thread-cpu', place: arg('place', undefined), timeoutMs: 6 * 60 * 60 * 1000, lockClass: 'timing', command: 'tools/frame-thread-cpu.mjs' });
  const startedAt = Date.now();
  for (const mapId of maps) {
    const plan = [...(warm ? [{ s: 'warm', k: pattern.charCodeAt(0) - 65 }] : []), ...[...pattern].map((c, s) => ({ s, k: c.charCodeAt(0) - 65 }))];
    for (const { s, k } of plan) {
      if (Date.now() - startedAt > 18 * 60 * 1000) { report.stopped = 'past 18 minutes of hold'; break; }
      const label = labels[k];
      const server = await openPreview(roots[k], port);
      const origin = `http://127.0.0.1:${server.port}`;
      const browser = await launchGuardedBrowser(puppeteer, { headless: true, timeout: 120000, protocolTimeout: 600000,
        args: [...MAP_PROBE_BROWSER_ARGS, '--use-angle=metal', '--enable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] }, { label: 'frame-thread-cpu' });
      const slot = { mapId, slot: s, label, query: queries[k], loadBefore: +os.loadavg()[0].toFixed(1) };
      try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 200)));
        await page.setViewport({ width, height, deviceScaleFactor: 1 });
        await page.evaluateOnNewDocument(installObservers, { preset, allies: 13, enemies: 14 });
        await page.goto(`${origin}/?${['nosplash=1', `tier=${tier}`, queries[k]].filter(Boolean).join('&')}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
        await page.waitForFunction(BOOT_LOADED_EXPRESSION, { timeout: 300000 });
        const catalog = await page.evaluate(() => window.__DEBUG.game.allTanks.map((e) => e.specId));
        await page.evaluate((ids) => { const f = window.__DEBUG.flags; f.forceRoster = ids; f.rosterExact = true; }, pinnedOpponents(catalog, 't90m', 27));
        await beginSoloBattle(page, { specId: 't90m', mapId, timeoutMs: 420000 });
        await page.evaluate(awaitTextures, 90000);
        await page.evaluate(freezeBattle, 'pinned');
        if (!showBots) await page.evaluate(hideOtherVehicles);
        if (view in FAR_POSES) {
          await page.evaluate(farPose, FAR_POSES[view]);
          let last = -1, still = 0;
          // (the far LOD builds one vehicle at a time: wait for the full-far count and its builds to stand still)
          let census = null;
          for (let i = 0; i < 60 && still < 4; i++) {
            await sleep(500); census = await page.evaluate(farLodCensus);
            const n = census.far * 1000 + census.built; still = n === last ? still + 1 : 0; last = n;
          }
          slot.farShowing = census.far;
          slot.farDrawsBuilt = census.built;
          slot.farRefused = census.refused;
          slot.farMissing = census.missing;
          slot.gearStage = census.gear;
        } else await poseView(page, view);
        await sleep(1500);
        await page.waitForFunction(grassSettled, { timeout: 20000, polling: 250 }).catch(() => {});
        await page.evaluate(settleResidencyTerrain).catch(() => null);
        await sleep(3000);
        const batches = await page.evaluate(() => window.__DRAW_BATCH_DEBUG?.batches ?? null);
        const t = await traceFrames(browser, page, frames);
        Object.assign(slot, { batches, traced: t.traced, threadTimed: t.threadTimed, frames: t.frames, spanMs: round(t.spanMs, 1), drawsMedian: t.drawsMedian,
          threadMsPerFrame: round(t.perFrameThreadMs), wallMsPerFrame: round(t.perFrameWallMs), top: t.top, loadAfter: +os.loadavg()[0].toFixed(1), errors });
      } catch (error) {
        slot.error = String(error?.message ?? error).slice(0, 300);
      } finally {
        await browser.close().catch(() => {});
        await server.close().catch(() => {});
      }
      if (s === 'warm') { slot.judged = false; report.warm.push(slot); } else report.slots.push(slot);
      console.log(`${mapId} s${s} ${label}: far ${slot.farShowing ?? '-'} (built ${slot.farDrawsBuilt ?? '-'}, gear stage ${slot.gearStage ?? '-'}), thread ${slot.threadMsPerFrame} ms/frame (${slot.threadTimed}/${slot.traced} tasks timed, ${slot.frames} frames in ${slot.spanMs} ms), wall-in-task ${slot.wallMsPerFrame} ms/frame, draws ${slot.drawsMedian}, batches ${slot.batches}, load ${slot.loadBefore}→${slot.loadAfter}${slot.error ? ` ERROR ${slot.error}` : ''}`);
    }
  }
} finally {
  await hold?.release?.();
  writeFileSync(path.join(out, `${tag}.json`), JSON.stringify(report, null, 1));
}
process.exit(0);
