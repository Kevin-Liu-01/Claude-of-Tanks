// tools/garage-switch-probe.mjs — garage tank-switch probe.
//
// Two modes share one headless harness:
//
// CONVERGENCE (default; switch-desync r1). Reproduces the live desync: rapid
// carousel selection could leave the pedestal showing the PREVIOUS tank (or an
// empty stage) while the stats card + card highlight already show the new
// selection, and the final selection never received a __SWITCH_TIMINGS row.
//
// Phase A (desync): per round, clicks 20 random REAL carousel cards (plus
//   occasional country-chip hops across national groups) at 50-150 ms intervals
//   through actual mouse input, then asserts convergence:
//     __DEBUG.pedestalVisual.specId === __DEBUG.selectedSpecId
//       === the DOM '.cot-card.sel' dataset.specId,
//     pedestal root attached + visible + has children + at stage pose.
//   An in-page 90 ms sampler also fails the round if the stage is EVER
//   observed empty (no visible tank root on the pedestal) mid-scrub.
//   On failure the __PED_TRACE / __SWITCH_TIMINGS tails are dumped.
// Phase B (slow clicks): single selections at a human 1.2 s cadence must
//   still be instant on the warm/procedural paths (median guarded).
// Phase C (zero-viewport boot): boots the game with innerWidth/innerHeight
//   stubbed to 0 and #app collapsed (embedded-pane layout), restores the
//   layout WITHOUT dispatching a window resize event, and asserts the canvas
//   recovers to a non-zero size (the boot-hardening guard, not the resize
//   event, must fix it).
//
// PROFILE (`--profile`; FSP-01, 2026-09-25). Causal profile of the Garage
// switch path. Drives the production selection route (__DEBUG.selectGarageTank
// = garage.setSelected: stats card, camo prewarm, onSelect → pedestal.set) for a
// scripted sequence and records per switch:
//   - main-thread long tasks (PerformanceObserver 'longtask') in the switch
//     window (call → reveal + two frames) and in the settle window after it;
//   - the runtime's stage spans (window.__GARAGE_SWITCH: chunk import, paint,
//     build (with the factory's core/tail interval receipts), stage, compile)
//     with a fallback to the legacy __SWITCH_TIMINGS phases on older trees;
//   - renderer.info program / geometry / texture deltas and JS heap delta;
//   - request → reveal (external 8 ms poll), first rAF after reveal ("painted")
//     and the following rAF ("presented"), and the worst rAF interval.
// Long tasks and program deltas are the ground truth on a loaded host; wall
// clock rows are context, not certification.
//
// Usage:
//   node tools/garage-switch-probe.mjs [--rounds 10] [--clicks 20] [--seed N]
//                                      [--root <dir>] [--skip-c] [--skip-a]
//   node tools/garage-switch-probe.mjs --profile [--dist <built dir>]
//        [--sequence fsp01|garage|receipt|id,id,...] [--dwell 2500] [--cpu 1]
//        [--tier desktop|mobile] [--label name] [--out report.json]
//        [--md table.md] [--cache-dir <dir>] [--root <dir>] [--gate]
//
// `--dist` previews an EXISTING production build (never builds); without it an
// isolated Vite dev server serves the tree (module transforms inflate cold
// rows; warm rows are unaffected). `--gate` applies the warm-switch budget.
//
// Exit 0 = all phases pass (convergence) / no errors and, with --gate, budget met.

import { createServer, preview } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nativeBrowserLaunchOptions, verifyNativeBrowserLaunch } from './native-browser-launch.mjs';

const TOOL = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(TOOL), '..');
export const FLEET_COST_CENSUS = 'docs/history/research/fleet-continuation-20260921-census.csv';

/** The five Garage exhibit vehicles named by the FSP-01 brief. */
export const GARAGE_FIVE = Object.freeze(['t90a_burlak', 'm1a2', 'leo2a5_a5nl', 't90m', 'k2']);

/** Receipt warm pass: with the desktop pedestal LRU of four, D C B E after
 * A B C D E are all cache hits (E is the current hero, so D leads). */
export const RECEIPT_WARM_PASS = Object.freeze(['t90m', 'leo2a5_a5nl', 'm1a2', 'k2']);

export const WARM_SWITCH_BUDGET = Object.freeze({ longTaskP95Ms: 120, paintP95Ms: 250, minWarm: 4 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// deterministic per-run rng (seed printed for replays)
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Pure helpers (receipt-tested without a browser)
// ---------------------------------------------------------------------------

/** Heaviest hulls by stored high-LOD triangles from the fleet census CSV. */
export function heaviestHullsFromCensus(csvText, { count = 12, exclude = [], available = null } = {}) {
  const lines = String(csvText).split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new Error('fleet census is empty');
  const header = lines[0].split(',');
  const idIndex = header.indexOf('id');
  const triIndex = header.indexOf('high_triangles');
  if (idIndex < 0 || triIndex < 0) throw new Error('fleet census lacks id/high_triangles columns');
  const excluded = new Set(exclude);
  const allowed = available ? new Set(available) : null;
  return lines.slice(1)
    .map((line) => line.split(','))
    .map((cells) => ({ id: cells[idIndex], triangles: Number(cells[triIndex]) }))
    .filter((row) => row.id && Number.isFinite(row.triangles) && !excluded.has(row.id)
      && (!allowed || allowed.has(row.id)))
    .sort((a, b) => b.triangles - a.triangles || a.id.localeCompare(b.id))
    .slice(0, count);
}

/** Dynamic entries resolved at switch time from the live carousel (garage.getNeighborIds(1)). */
export const NEXT_CARD = '@next';
export const PREV_CARD = '@prev';
export const isDynamicEntry = (id) => id === NEXT_CARD || id === PREV_CARD;

/** Named sequences; `available` (the page's card ids) filters the census. */
export function resolveProfileSequence(name, { censusText = '', available = null } = {}) {
  if (name === 'garage') return [...GARAGE_FIVE];
  if (name === 'receipt') return [...GARAGE_FIVE, ...RECEIPT_WARM_PASS, ...RECEIPT_WARM_PASS];
  // Adjacent navigation inside the selected nation: six cards forward, six back.
  if (name === 'walk') return [...Array(6).fill(NEXT_CARD), ...Array(6).fill(PREV_CARD)];
  if (name === 'fsp01') {
    const heaviest = heaviestHullsFromCensus(censusText, { count: 12, exclude: GARAGE_FIVE, available });
    return [...GARAGE_FIVE, ...heaviest.map((row) => row.id), ...GARAGE_FIVE];
  }
  const ids = String(name).split(',').map((id) => id.trim()).filter(Boolean);
  if (!ids.length) throw new Error(`unknown switch sequence '${name}'`);
  return ids;
}

/** Nearest-rank percentile over a numeric sample. */
export function percentile(values, p) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1];
}

/** cold = first visit built; rebuild = revisit built again (LRU miss); warm = cache hit. */
export function classifySwitches(rows) {
  const seen = new Set();
  return rows.map((row) => {
    let kind = 'failed';
    if (row.revealMs >= 0) {
      if (row.path === 'cached') kind = 'warm';
      else if (row.path === 'procedural') kind = seen.has(row.id) ? 'rebuild' : 'cold';
    }
    seen.add(row.id);
    return { ...row, class: kind };
  });
}

function stats(values) {
  const finite = values.filter((v) => Number.isFinite(v));
  return finite.length
    ? { n: finite.length, p50: percentile(finite, 50), p95: percentile(finite, 95), max: Math.max(...finite) }
    : { n: 0, p50: null, p95: null, max: null };
}

const CLASS_METRICS = ['revealMs', 'paintedMs', 'presentedMs', 'maxFrameGapMs', 'longTaskMaxMs',
  'longTaskTotalMs', 'longTaskCount', 'settleLongTaskTotalMs', 'programsDelta', 'geometriesDelta',
  'texturesDelta', 'heapDeltaMB'];

const STAGE_KEYS = ['importMs', 'paintMs', 'prebakeMs', 'buildWallMs', 'buildWorkMs', 'buildYieldMs',
  'buildSteps', 'buildMaxStepMs', 'stageMs', 'compileMs',
  'core.setupMs', 'core.materialsMs', 'core.authoredMs', 'core.bindMergeMs', 'core.assemblyMs', 'core.totalMs',
  'tail.decorMs', 'tail.decorWorkMs', 'tail.fillsMs', 'tail.normalizeMs', 'tail.batchMs', 'tail.finalizeMs',
  'tail.shadowBatchMs', 'tail.shareMs', 'tail.totalMs',
  'link.waitMs', 'link.slices', 'link.submissionMs', 'link.queryCount', 'link.queryMs', 'link.maxQueryMs',
  'link.uniformCount', 'link.uniformMs', 'link.maxUniformMs', 'link.pending'];

function readPath(object, path) {
  return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), object);
}

/** Per-class distributions plus stage distributions over the built (cold+rebuild) rows. */
export function summarizeProfile(rows) {
  const classified = rows.every((row) => row.class) ? rows : classifySwitches(rows);
  const byClass = {};
  for (const kind of ['cold', 'rebuild', 'warm', 'failed']) {
    const members = classified.filter((row) => row.class === kind);
    if (!members.length) continue;
    byClass[kind] = { n: members.length };
    for (const metric of CLASS_METRICS) byClass[kind][metric] = stats(members.map((row) => row[metric]));
  }
  const built = classified.filter((row) => row.class === 'cold' || row.class === 'rebuild');
  const stages = {};
  for (const key of STAGE_KEYS) {
    const values = built.map((row) => readPath(row.stages, key)).filter((v) => Number.isFinite(v));
    if (values.length) stages[key] = stats(values);
  }
  return { byClass, stages, rows: classified };
}

/** Warm-switch budget: p95 of the worst long task and of the painted frame. */
export function checkWarmSwitchBudget(rows, budget = WARM_SWITCH_BUDGET) {
  const { longTaskP95Ms, paintP95Ms, minWarm } = { ...WARM_SWITCH_BUDGET, ...budget };
  const classified = rows.every((row) => row.class) ? rows : classifySwitches(rows);
  const warm = classified.filter((row) => row.class === 'warm');
  const failures = [];
  if (warm.length < minWarm) failures.push(`only ${warm.length} warm switches observed (need ${minWarm})`);
  for (const row of classified) {
    if (row.class === 'failed') failures.push(`${row.id}: switch never revealed (${row.path || 'no path'})`);
  }
  if (warm.length) {
    const longTask = percentile(warm.map((row) => row.longTaskMaxMs ?? 0), 95);
    if (!(longTask <= longTaskP95Ms)) failures.push(`warm p95 worst long task ${longTask} ms > ${longTaskP95Ms} ms`);
    const painted = percentile(warm.map((row) => row.paintedMs), 95);
    if (!(painted !== null && painted >= 0 && painted <= paintP95Ms)) {
      failures.push(`warm p95 painted ${painted} ms > ${paintP95Ms} ms`);
    }
  }
  return failures;
}

export function garageSwitchUrl(base, { tier = 'desktop' } = {}) {
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Expected HTTP(S) URL');
  for (const [key, value] of [['nosplash', '1'], ['tier', tier], ['gfxreset', '1']]) url.searchParams.set(key, value);
  return url;
}

const fmt = (value, digits = 0) => (value === null || value === undefined || Number.isNaN(value)
  ? '–' : Number(value).toFixed(digits));
const fmtStat = (stat, digits = 0) => (stat && stat.n ? `${fmt(stat.p50, digits)} / ${fmt(stat.p95, digits)} / ${fmt(stat.max, digits)}` : '–');

/** Markdown tables for a profile report (per switch, per class, per stage). */
export function renderProfileMarkdown(report) {
  const { meta, summary } = report;
  const lines = [];
  lines.push(`### ${meta.label} — ${meta.tree || 'tree'} (${meta.serving})`);
  lines.push('');
  lines.push(`Browser ${meta.browser}; ${meta.viewport.width}×${meta.viewport.height} @ DPR ${meta.viewport.deviceScaleFactor}; `
    + `tier ${meta.tier}; CPU ×${meta.cpuRate}; dwell ${meta.dwellMs} ms; host load ${meta.loadAverage.map((v) => v.toFixed(1)).join(' / ')} `
    + `on ${meta.cpus} cores; boot→ready ${fmt(meta.bootMs)} ms; sequence ${meta.sequence.length} switches`
    + (meta.unavailable.length ? ` (not in roster: ${meta.unavailable.join(', ')})` : '') + '.');
  lines.push('');
  lines.push('| # | id | class | reveal | painted | presented | max gap | LT n | LT total | LT max | settle LT | Δprog | Δgeo | Δtex | import | paint | build work | yield | steps | max step | compile | link wait |');
  lines.push('|--:|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
  summary.rows.forEach((row, index) => {
    const s = row.stages || {};
    lines.push(`| ${index + 1} | ${row.id} | ${row.class} | ${fmt(row.revealMs)} | ${fmt(row.paintedMs)} | ${fmt(row.presentedMs)} | `
      + `${fmt(row.maxFrameGapMs)} | ${fmt(row.longTaskCount)} | ${fmt(row.longTaskTotalMs)} | ${fmt(row.longTaskMaxMs)} | `
      + `${fmt(row.settleLongTaskTotalMs)} | ${fmt(row.programsDelta)} | ${fmt(row.geometriesDelta)} | ${fmt(row.texturesDelta)} | `
      + `${fmt(s.importMs)} | ${fmt(s.paintMs)} | ${fmt(s.buildWorkMs)} | ${fmt(s.buildYieldMs)} | ${fmt(s.buildSteps)} | `
      + `${fmt(s.buildMaxStepMs)} | ${fmt(s.compileMs)} | ${s.link ? `${fmt(s.link.waitMs)} (${s.link.status}, ${fmt(s.link.slices)} f)` : '–'} |`);
  });
  lines.push('');
  lines.push('Per class (p50 / p95 / max, ms unless noted):');
  lines.push('');
  lines.push('| class | n | reveal | painted | presented | max gap | LT max | LT total | LT count | settle LT total | Δprograms | Δgeometries | Δtextures | Δheap MB |');
  lines.push('|---|--:|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [kind, entry] of Object.entries(summary.byClass)) {
    lines.push(`| ${kind} | ${entry.n} | ${fmtStat(entry.revealMs)} | ${fmtStat(entry.paintedMs)} | ${fmtStat(entry.presentedMs)} | `
      + `${fmtStat(entry.maxFrameGapMs)} | ${fmtStat(entry.longTaskMaxMs)} | ${fmtStat(entry.longTaskTotalMs)} | ${fmtStat(entry.longTaskCount)} | `
      + `${fmtStat(entry.settleLongTaskTotalMs)} | ${fmtStat(entry.programsDelta)} | ${fmtStat(entry.geometriesDelta)} | `
      + `${fmtStat(entry.texturesDelta)} | ${fmtStat(entry.heapDeltaMB, 1)} |`);
  }
  lines.push('');
  lines.push('Built switches (cold + rebuild) by stage (p50 / p95 / max ms; `build*` from the runtime, `core.*`/`tail.*` from the factory):');
  lines.push('');
  lines.push('| stage | n | p50 / p95 / max |');
  lines.push('|---|--:|---|');
  for (const [key, stat] of Object.entries(summary.stages)) lines.push(`| ${key} | ${stat.n} | ${fmtStat(stat, 1)} |`);
  lines.push('');
  const withPrograms = summary.rows.filter((row) => row.newPrograms?.length);
  if (withPrograms.length) {
    lines.push('Programs created per switch (three.js shader name × count):');
    lines.push('');
    for (const row of withPrograms) {
      const counts = new Map();
      for (const program of row.newPrograms) counts.set(program.name, (counts.get(program.name) || 0) + 1);
      lines.push(`- ${row.id} (${row.class}): ${[...counts].map(([name, n]) => `${name}×${n}`).join(', ')}`);
    }
    lines.push('');
  }
  for (const row of summary.rows.filter((entry) => entry.cpuProfile)) {
    lines.push(`CPU profile ${row.id} (${row.class}; ${row.cpuProfile.totalMs} ms sampled; self time by function):`);
    lines.push('');
    lines.push('| ms | function | source |');
    lines.push('|--:|---|---|');
    for (const frame of row.cpuProfile.top.slice(0, 20)) lines.push(`| ${frame.ms} | ${frame.fn} | ${frame.source} |`);
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Shared harness
// ---------------------------------------------------------------------------

const BROWSER_ARGS = ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'];

async function startServer({ root, dist, cacheDir, portBand, rng }) {
  const port = portBand + Math.floor(rng() * 300);
  if (dist) {
    // Serve an existing production build; never build here. The rewrite plugin
    // resolves the absolute outDir against this root.
    const server = await preview({
      root, logLevel: 'error', build: { outDir: dist },
      preview: { port, strictPort: false, host: '127.0.0.1' },
    });
    return { server, close: () => server.close() };
  }
  const server = await createServer({
    root,
    logLevel: 'error',
    ...(cacheDir ? { cacheDir } : {}),
    // own 7xxx port band (never 5001/5002/5197-5199 — shared servers)
    server: { port, strictPort: false, host: '127.0.0.1', hmr: false, watch: null },
  });
  await server.listen();
  return { server, close: () => server.close() };
}

function serverPort(server) {
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Vite did not expose a listening port');
  return address.port;
}

// ---------------------------------------------------------------------------
// Convergence mode (phases A/B/C)
// ---------------------------------------------------------------------------

async function runConvergence({ root, rounds, clicks, seed, skipA, skipC }) {
  const rng = mulberry32(seed);
  const { server, close } = await startServer({ root, portBand: 7100, rng });
  const url = `http://127.0.0.1:${serverPort(server)}/`;
  console.log(`[garage-switch-probe] vite up at ${url} (root ${root}, seed ${seed})`);
  const browser = await puppeteer.launch({ headless: 'new', args: BROWSER_ARGS });
  let failures = 0;

  async function phaseAB() {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('favicon')) pageErrors.push(m.text());
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });

    // boot hero settled on stage before the clock starts
    await page.waitForFunction(() => {
      const D = window.__DEBUG;
      const v = D && D.pedestalVisual;
      return !!(v && v.root.visible !== false);
    }, { timeout: 60000, polling: 100 });
    await sleep(2500); // post-ready idle (prefetch/thumb queue) — part of the SUT

    // in-page empty-stage sampler: any observed frame with NO visible tank on
    // the pedestal is a violation (the outgoing hero is supposed to cover until
    // the incoming reveals — the stage must never be bare).
    await page.evaluate(() => {
      window.__EMPTY_STAGE = {
        samples: 0, empty: 0, spans: [],
        reset() { this.samples = 0; this.empty = 0; this.spans.length = 0; this._start = 0; },
        _start: 0,
      };
      const visiblePedestalTank = (debug) => {
        for (const child of debug.scene.children) {
          if (!child.name || !child.name.startsWith('tank_')) continue;
          if (child.visible === false) continue;
          if (Math.abs(child.position.x + 1500) > 4
            || Math.abs(child.position.z + 1500) > 4) continue;
          if (child.position.y < -80) continue;
          return true;
        }
        return false;
      };
      setInterval(() => {
        const D = window.__DEBUG;
        if (!D || !D.scene || D.game.phase !== 'garage') return;
        const E = window.__EMPTY_STAGE;
        E.samples++;
        const occupied = visiblePedestalTank(D);
        const now = Math.round(performance.now());
        if (!occupied) {
          E.empty++;
          if (!E._start) E._start = now;
        } else if (E._start) {
          const v = D.pedestalVisual;
          E.spans.push({
            from: E._start, ms: now - E._start,
            pv: v ? `${v.specId}${v.root.visible === false ? '/hidden' : ''}` : null,
          });
          E._start = 0;
        }
      }, 90);
    });

    const clickTarget = async (kind) => {
      // pick + instant-scroll the target in-page, then real mouse click on it
      const box = await page.evaluate((k, r1, r2) => {
        let el = null;
        if (k === 'chip') {
          const chips = [...document.querySelectorAll('.cot-country-chip')];
          el = chips[(r1 * chips.length) | 0];
        } else {
          const cards = [...document.querySelectorAll('.cot-card')]
            .filter((c) => c.style.display !== 'none');
          el = cards[(r1 * cards.length) | 0];
        }
        if (!el) return null;
        el.scrollIntoView({ block: 'nearest', inline: 'center' }); // instant
        const b = el.getBoundingClientRect();
        return {
          x: b.left + b.width * (0.35 + r2 * 0.3),
          y: b.top + b.height * (0.35 + r2 * 0.3),
          id: el.dataset.specId || el.dataset.country || '?',
        };
      }, kind, rng(), rng());
      if (!box) return null;
      await page.mouse.click(box.x, box.y);
      return box.id;
    };

    const converged = () => page.evaluate(() => {
      const D = window.__DEBUG;
      const sel = D.selectedSpecId;
      const dom = document.querySelector('.cot-card.sel');
      const domId = dom ? dom.dataset.specId : null;
      const v = D.pedestalVisual;
      const ok = !!(v && sel && v.specId === sel && domId === sel &&
        v.root.parent && v.root.visible !== false && v.root.children.length > 0 &&
        Math.abs(v.root.position.x + 1500) < 4 && Math.abs(v.root.position.z + 1500) < 4 &&
        v.root.position.y > -80);
      return {
        ok, sel, domId,
        pv: v ? {
          id: v.specId, visible: v.root.visible !== false,
          y: +v.root.position.y.toFixed(1), attached: !!v.root.parent,
          children: v.root.children.length,
        } : null,
      };
    });
    const waitForConvergence = async (timeoutMs, intervalMs, startedAt = Date.now()) => {
      let state = await converged();
      while (!state.ok && Date.now() - startedAt < timeoutMs) {
        await sleep(intervalMs);
        state = await converged();
      }
      return { state, elapsedMs: Date.now() - startedAt };
    };
    let roundsFailed = 0;
    const reportRapidFailure = async (round, lastId, state, emptiness) => {
      roundsFailed++;
      failures++;
      console.error(`  round ${round}: FAIL (last click ${lastId})`);
      console.error(`    selected=${state.sel} domSel=${state.domId} pedestal=${JSON.stringify(state.pv)}`);
      if (emptiness.empty > 0) {
        console.error(`    EMPTY STAGE observed: ${emptiness.empty} samples, spans(ms)=${JSON.stringify(emptiness.spans)}`);
      }
      const trace = await page.evaluate(() => (window.__PED_TRACE || []).slice(-40));
      console.error('    __PED_TRACE tail:');
      for (const row of trace) console.error(`      ${JSON.stringify(row)}`);
      const timings = await page.evaluate(() => (window.__SWITCH_TIMINGS || []).slice(-8));
      console.error(`    __SWITCH_TIMINGS tail: ${JSON.stringify(timings)}`);
    };
    const runRapidRounds = async () => {
      console.log(`[phase A] ${rounds} rounds x ${clicks} rapid clicks (50-150 ms)`);
      for (let round = 1; round <= rounds; round++) {
        await page.evaluate(() => window.__EMPTY_STAGE.reset());
        let lastId = '?';
        for (let i = 0; i < clicks; i++) {
          const kind = rng() < 0.18 ? 'chip' : 'card';
          const id = await clickTarget(kind);
          if (id) lastId = `${kind}:${id}`;
          await sleep(50 + Math.floor(rng() * 100));
        }
        const { state } = await waitForConvergence(10000, 150);
        const emptiness = await page.evaluate(() => {
          const E = window.__EMPTY_STAGE;
          return { empty: E.empty, spans: E.spans.slice(-6) };
        });
        if (!state.ok || emptiness.empty > 0) {
          await reportRapidFailure(round, lastId, state, emptiness);
        } else {
          console.log(`  round ${round}: ok (converged on ${state.sel}, pedestal ${state.pv.id}, empty-samples 0)`);
        }
        await sleep(400);
      }
      console.log(`[phase A] ${rounds - roundsFailed}/${rounds} rounds converged`);
    };
    const runSlowClicks = async () => {
      console.log('[phase B] slow single clicks (1.2 s cadence) stay instant');
      await sleep(1500);
      const slowMs = [];
      for (let i = 0; i < 8; i++) {
        const startedAt = Date.now();
        await clickTarget('card');
        const { state, elapsedMs } = await waitForConvergence(12000, 30, startedAt);
        slowMs.push(state.ok ? elapsedMs : -1);
        if (!state.ok) {
          failures++;
          console.error(`  slow click ${i + 1}: FAIL — never converged (${JSON.stringify(state)})`);
        }
        await sleep(1200);
      }
      const okMs = slowMs.filter((ms) => ms >= 0).sort((a, b) => a - b);
      const median = okMs.length ? okMs[Math.floor(okMs.length / 2)] : -1;
      console.log(`  slow-click reveal ms: ${slowMs.join(', ')} (median ${median})`);
      if (median < 0 || median > 600) {
        failures++;
        console.error(`  [FAIL] slow-click median ${median} ms (budget 600)`);
      }
    };
    await runRapidRounds();
    await runSlowClicks();

    if (pageErrors.length) {
      failures++;
      console.error(`[phase A/B] PAGE ERRORS (${pageErrors.length}):`);
      for (const e of pageErrors.slice(0, 6)) console.error('  - ' + e);
    }
    await page.close();
  }

  async function phaseC() {
    console.log('[phase C] zero-viewport boot -> layout restore (no resize event)');
    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 720, deviceScaleFactor: 1 });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.evaluateOnNewDocument(() => {
      // simulate an embedded pane that lays out at 0x0 during boot: window
      // metrics AND element client sizes report zero until "restored".
      // (Prototype getter stubs are timing-proof — a <style> injected at
      // DOMContentLoaded lands AFTER module scripts have already measured.)
      const cw = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
      const chh = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
      Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => 0 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => 0 });
      Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get() { return 0; } });
      Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get() { return 0; } });
      window.__RESTORE_VIEWPORT = () => {
        delete window.innerWidth;   // configurable stubs — native accessors return
        delete window.innerHeight;
        Object.defineProperty(Element.prototype, 'clientWidth', cw);
        Object.defineProperty(Element.prototype, 'clientHeight', chh);
        const st = document.getElementById('zero-vp-style');
        if (st) st.remove();        // real layout change -> ResizeObserver path
        // deliberately NO window resize event: the boot guard must recover alone
      };
      addEventListener('DOMContentLoaded', () => {
        const st = document.createElement('style');
        st.id = 'zero-vp-style';
        st.textContent = '#app{position:fixed !important;width:0 !important;height:0 !important;overflow:hidden !important;}';
        document.head.appendChild(st);
      });
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction('window.__GAME_READY === true', { timeout: 150000 });
    const before = await page.evaluate(() => {
      const c = document.querySelector('#app canvas');
      return c ? { w: c.width, h: c.height } : null;
    });
    console.log(`  canvas during 0-viewport boot: ${JSON.stringify(before)}`);
    if (before && before.w > 2 && before.h > 2) {
      console.log('  (canvas already non-zero at boot — stub did not take; phase inconclusive)');
    }
    await page.evaluate(() => window.__RESTORE_VIEWPORT());
    let after = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) {
      after = await page.evaluate(() => {
        const c = document.querySelector('#app canvas');
        return c ? { w: c.width, h: c.height } : null;
      });
      if (after && after.w > 2 && after.h > 2) break;
      await sleep(150);
    }
    console.log(`  canvas after layout restore (no resize event): ${JSON.stringify(after)}`);
    if (!after || after.w <= 2 || after.h <= 2) {
      failures++;
      console.error('  [FAIL] canvas stayed zero-sized — boot guard missing/inert');
    } else {
      console.log('  recovered without a resize event: ok');
    }
    const fatal = pageErrors.filter((e) => !/WebGL|GL_|framebuffer/i.test(e));
    if (fatal.length) {
      failures++;
      console.error(`[phase C] PAGE ERRORS (${fatal.length}):`);
      for (const e of fatal.slice(0, 6)) console.error('  - ' + e);
    }
    await page.close();
  }

  try {
    if (!skipA) await phaseAB();
    if (!skipC) await phaseC();
  } finally {
    await browser.close();
    await close();
  }
  console.log(failures ? `[garage-switch-probe] FAIL (${failures} failure(s))` : '[garage-switch-probe] PASS');
  return failures;
}

// ---------------------------------------------------------------------------
// Profile mode (FSP-01)
// ---------------------------------------------------------------------------

/** Normalize the runtime's stage record (or the legacy phase row) into one shape. */
export function normalizeStages(record, legacy) {
  if (record && record.stages) {
    const span = (name) => {
      const stage = record.stages[name];
      return stage ? +(stage.endMs - stage.beginMs).toFixed(1) : undefined;
    };
    const importEnd = record.stages.import?.endMs;
    const paintEnd = record.stages.paint?.endMs;
    return {
      importMs: span('import'), paintMs: span('paint'),
      prebakeMs: Number.isFinite(importEnd) || Number.isFinite(paintEnd)
        ? Math.max(importEnd ?? 0, paintEnd ?? 0) : undefined,
      buildWallMs: span('build'), buildWorkMs: record.build?.workMs, buildYieldMs: record.build?.yieldMs,
      buildSteps: record.build?.checkpointCount, buildMaxStepMs: record.build?.maxStepMs,
      stageMs: span('stage'), compileMs: span('compile'),
      core: record.core, tail: record.tail,
      ...(record.link ? { link: { ...record.link.timing, waitMs: record.link.waitMs, slices: record.link.slices,
        pending: record.link.pending ?? undefined, status: record.link.status } } : {}),
    };
  }
  if (legacy) {
    return {
      prebakeMs: legacy.prebakeMs, buildWorkMs: legacy.buildMs, buildYieldMs: legacy.buildYieldMs,
      buildSteps: legacy.buildCheckpointCount, buildMaxStepMs: legacy.maxBuildStepMs,
      compileMs: legacy.compileMs, tail: Number.isFinite(legacy.decorMs) ? { decorWorkMs: legacy.decorMs } : undefined,
    };
  }
  return {};
}

/** Self time by function and source line from a CDP sampling profile. */
export function summarizeCpuProfile(profile, top = 30) {
  const nodes = new Map((profile.nodes || []).map((node) => [node.id, node]));
  const selfUs = new Map();
  for (let index = 0; index < (profile.samples?.length || 0); index += 1) {
    const nodeId = profile.samples[index];
    selfUs.set(nodeId, (selfUs.get(nodeId) || 0) + (profile.timeDeltas?.[index] || 0));
  }
  const byFrame = new Map();
  let totalUs = 0;
  for (const [nodeId, us] of selfUs) {
    const frame = nodes.get(nodeId)?.callFrame;
    if (!frame) continue;
    totalUs += us;
    const source = frame.url ? `${frame.url.split('/').pop().split('?')[0]}:${frame.lineNumber + 1}` : '(runtime)';
    const key = `${frame.functionName || '(anonymous)'}|${source}`;
    byFrame.set(key, (byFrame.get(key) || 0) + us);
  }
  const rows = [...byFrame.entries()]
    .map(([key, us]) => { const [fn, source] = key.split('|'); return { fn, source, ms: +(us / 1000).toFixed(1) }; })
    .sort((a, b) => b.ms - a.ms)
    .slice(0, top);
  return { totalMs: +(totalUs / 1000).toFixed(1), top: rows };
}

export async function runProfile(options = {}) {
  const {
    root = REPO_ROOT, dist = null, cacheDir = null, label = dist ? 'preview' : 'dev', tier = 'desktop',
    cpuRate = 1, dwellMs = 2500, sequence: sequenceName = 'fsp01', switchTimeoutMs = 30000, cpuProfileIds = [],
    censusText = readFileSync(join(REPO_ROOT, FLEET_COST_CENSUS), 'utf8'),
    viewport = { width: 1440, height: 900, deviceScaleFactor: 1 }, log = console.log,
    tree = null,
  } = options;
  const rng = mulberry32(Date.now() % 100000);
  const { server, close } = await startServer({ root, dist, cacheDir, portBand: 7600, rng });
  const url = garageSwitchUrl(`http://127.0.0.1:${serverPort(server)}/`, { tier }).href;
  const serving = dist ? `production preview of ${dist}` : `vite dev server (root ${root})`;
  log(`[garage-switch-probe] ${serving} at ${url}`);
  const browser = await puppeteer.launch(nativeBrowserLaunchOptions({
    headless: 'new', args: BROWSER_ARGS, protocolTimeout: 240000,
  }));
  const errors = [];
  const rows = [];
  let meta = null;
  try {
    const nativeLaunch = verifyNativeBrowserLaunch(browser);
    const page = await browser.newPage();
    const cdp = await page.createCDPSession();
    await page.setViewport(viewport);
    if (cpuRate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/favicon|github-stars/.test(m.text())) errors.push(m.text());
    });
    await page.evaluateOnNewDocument(() => {
      // Frame ticker + long-task observer installed before any app script.
      const probe = { frames: [], longTasks: [] };
      const tick = (t) => { probe.frames.push(t); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            probe.longTasks.push({
              start: entry.startTime, duration: entry.duration,
              attribution: (entry.attribution || []).map((a) => `${a.name}:${a.containerType || ''}`),
            });
          }
        }).observe({ type: 'longtask', buffered: true });
      } catch { /* frame gaps remain the fallback */ }
      window.__SWITCH_PROBE = probe;
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction('window.__GAME_READY === true', { timeout: 180000 });
    await page.waitForFunction(() => {
      const D = window.__DEBUG;
      const v = D && D.pedestalVisual;
      return !!(v && v.specId === D.selectedSpecId && v.root.visible !== false);
    }, { timeout: 90000, polling: 100 });
    // Post-ready dwell: idle bakes and neighbor prefetch are part of the SUT.
    await sleep(3500);

    const ready = await page.evaluate(() => ({
      bootMs: Number(window.__BOOT_MS || 0) || null,
      cards: [...document.querySelectorAll('.cot-card')].map((card) => card.dataset.specId).filter(Boolean),
      selected: window.__DEBUG.selectedSpecId,
      residentLimits: window.__DEBUG.residentLimits,
      hasSwitchTrace: Array.isArray(window.__GARAGE_SWITCH),
      gpu: (() => {
        try {
          const gl = window.__DEBUG.renderer.getContext();
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
        } catch { return null; }
      })(),
    }));
    const available = new Set(ready.cards);
    const requested = resolveProfileSequence(sequenceName, { censusText, available: ready.cards });
    const unavailable = requested.filter((id) => !isDynamicEntry(id) && !available.has(id));
    const sequence = requested.filter((id) => isDynamicEntry(id) || available.has(id));
    meta = {
      label, tree, serving, url, browser: await browser.version(), nativeLaunch, gpu: ready.gpu,
      viewport, tier, cpuRate, dwellMs, sequenceName, sequence, unavailable, bootMs: ready.bootMs,
      initialSelection: ready.selected, residentLimits: ready.residentLimits,
      switchTrace: ready.hasSwitchTrace ? '__GARAGE_SWITCH' : '__SWITCH_TIMINGS (legacy)',
      loadAverage: os.loadavg(), cpus: os.cpus().length, startedAt: new Date().toISOString(),
    };
    log(`[garage-switch-probe] ${label}: ${sequence.length} switches, trace ${meta.switchTrace}, gpu ${ready.gpu}`);

    for (const entry of sequence) {
      const id = isDynamicEntry(entry)
        ? await page.evaluate((token) => {
          const neighbors = window.__DEBUG.garage.getNeighborIds(1);
          return (token === '@next' ? neighbors[0] : neighbors[1] ?? neighbors[0]) || null;
        }, entry)
        : entry;
      if (!id) {
        rows.push({ id: entry, entry, path: null, revealMs: -1, paintedMs: -1, presentedMs: -1, maxFrameGapMs: 0,
          frameCount: 0, longTaskCount: 0, longTaskTotalMs: 0, longTaskMaxMs: 0, longTasks: [],
          settleLongTaskTotalMs: 0, settleLongTasks: [], programsDelta: 0, geometriesDelta: 0, texturesDelta: 0,
          heapDeltaMB: null, stages: {}, aborted: [], pedestalCacheIds: [], newPrograms: [] });
        log(`  ${String(rows.length).padStart(2)} ${entry}: no adjacent card in the selected nation`);
        continue;
      }
      const before = await page.evaluate(() => {
        const D = window.__DEBUG;
        const info = D.renderer.info;
        return {
          programs: info.programs.length, geometries: info.memory.geometries, textures: info.memory.textures,
          programKeys: info.programs.map((program) => program.cacheKey),
          heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
          switchRecords: (window.__GARAGE_SWITCH || []).length, timings: (window.__SWITCH_TIMINGS || []).length,
        };
      });
      const profileThisSwitch = cpuProfileIds.includes('all') || cpuProfileIds.includes(id);
      if (profileThisSwitch) {
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
        await cdp.send('Profiler.start');
      }
      const timing = await page.evaluate(async (specId, timeoutMs) => {
        const D = window.__DEBUG;
        // Reproduce the pointer activity preceding a real card click so idle
        // background work yields to the interaction under test.
        window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        const t0 = performance.now();
        D.selectGarageTank(specId);
        // The production route can refuse a selection (locked vehicle); the
        // pedestal route then keeps the measurement on the same pipeline.
        if (D.selectedSpecId !== specId) D.stagePedestalTank(specId);
        const revealAt = await new Promise((res) => {
          const check = () => {
            const v = D.pedestalVisual;
            if (v && v.specId === specId && v.root.visible !== false && D.pedestalOnStage) {
              res(performance.now());
              return true;
            }
            return false;
          };
          if (check()) return;
          const iv = setInterval(() => { if (check()) clearInterval(iv); }, 8);
          setTimeout(() => { clearInterval(iv); res(-1); }, timeoutMs);
        });
        // Two frames after reveal: the first is the hero's first submitted
        // frame, the second proves that frame was handed to the compositor.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return { t0, revealAt, doneAt: performance.now() };
      }, id, switchTimeoutMs);
      let cpuProfile = null;
      if (profileThisSwitch) {
        const { profile } = await cdp.send('Profiler.stop');
        await cdp.send('Profiler.disable');
        cpuProfile = summarizeCpuProfile(profile, 30);
      }
      await sleep(dwellMs);
      const after = await page.evaluate((specId, t0, revealAt, doneAt, beforeCounts) => {
        const D = window.__DEBUG;
        const P = window.__SWITCH_PROBE;
        const info = D.renderer.info;
        const settleEnd = performance.now();
        const frames = P.frames.filter((t) => t >= t0 && t <= doneAt + 1);
        let maxGap = 0;
        for (let i = 1; i < frames.length; i++) maxGap = Math.max(maxGap, frames[i] - frames[i - 1]);
        const painted = revealAt >= 0 ? P.frames.find((t) => t >= revealAt) : undefined;
        const presented = painted !== undefined ? P.frames.find((t) => t > painted) : undefined;
        const inWindow = (task, from, to) => task.start >= from && task.start < to;
        const switchTasks = P.longTasks.filter((task) => inWindow(task, t0, doneAt));
        const settleTasks = P.longTasks.filter((task) => inWindow(task, doneAt, settleEnd));
        const records = (window.__GARAGE_SWITCH || []).slice(beforeCounts.switchRecords)
          .filter((record) => record.id === specId);
        const legacy = (window.__SWITCH_TIMINGS || []).slice(beforeCounts.timings)
          .filter((row) => row.id === specId);
        const record = records.find((entry) => entry.path === 'cached' || entry.path === 'procedural')
          || records.at(-1) || null;
        const legacyRow = legacy.at(-1) || null;
        const knownPrograms = new Set(beforeCounts.programKeys || []);
        const newPrograms = info.programs.filter((program) => !knownPrograms.has(program.cacheKey))
          .map((program) => ({ name: program.name, usedTimes: program.usedTimes }));
        return {
          newPrograms,
          programs: info.programs.length, geometries: info.memory.geometries, textures: info.memory.textures,
          heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
          maxFrameGapMs: +maxGap.toFixed(1), frameCount: frames.length,
          paintedMs: painted !== undefined ? +(painted - t0).toFixed(1) : -1,
          presentedMs: presented !== undefined ? +(presented - t0).toFixed(1) : -1,
          switchTasks: switchTasks.map((task) => ({ atMs: +(task.start - t0).toFixed(1), ms: +task.duration.toFixed(1), attribution: task.attribution })),
          settleTasks: settleTasks.map((task) => ({ atMs: +(task.start - t0).toFixed(1), ms: +task.duration.toFixed(1) })),
          record, legacyRow, aborted: records.filter((entry) => entry.path === 'aborted').map((entry) => entry.abortReason),
          pedestalCacheIds: D.pedestalCacheIds,
        };
      }, id, timing.t0, timing.revealAt, timing.doneAt, before);
      const path = after.record?.path ?? after.legacyRow?.path ?? null;
      const row = {
        id, entry, path, revealMs: timing.revealAt >= 0 ? +(timing.revealAt - timing.t0).toFixed(1) : -1,
        inPageRevealMs: after.legacyRow?.ms ?? after.record?.revealMs ?? null,
        paintedMs: after.paintedMs, presentedMs: after.presentedMs, maxFrameGapMs: after.maxFrameGapMs,
        frameCount: after.frameCount,
        longTaskCount: after.switchTasks.length,
        longTaskTotalMs: +after.switchTasks.reduce((sum, task) => sum + task.ms, 0).toFixed(1),
        longTaskMaxMs: after.switchTasks.reduce((max, task) => Math.max(max, task.ms), 0),
        longTasks: after.switchTasks,
        settleLongTaskTotalMs: +after.settleTasks.reduce((sum, task) => sum + task.ms, 0).toFixed(1),
        settleLongTasks: after.settleTasks,
        programsDelta: after.programs - before.programs, geometriesDelta: after.geometries - before.geometries,
        texturesDelta: after.textures - before.textures,
        heapDeltaMB: after.heapMB !== null && before.heapMB !== null ? +(after.heapMB - before.heapMB).toFixed(1) : null,
        stages: normalizeStages(after.record, after.legacyRow), aborted: after.aborted,
        pedestalCacheIds: after.pedestalCacheIds, newPrograms: after.newPrograms,
        ...(cpuProfile ? { cpuProfile } : {}),
      };
      rows.push(row);
      const s = row.stages;
      log(`  ${String(rows.length).padStart(2)} ${id.padEnd(18)} ${String(path || '?').padEnd(10)} reveal ${String(row.revealMs).padStart(7)} ms`
        + `  painted ${String(row.paintedMs).padStart(7)}  LT ${row.longTaskCount}/${row.longTaskTotalMs}/${row.longTaskMaxMs}`
        + `  gap ${row.maxFrameGapMs}  Δprog ${row.programsDelta}`
        + (s.buildWorkMs !== undefined ? `  build ${s.buildWorkMs}(max ${s.buildMaxStepMs}) paint ${s.paintMs ?? s.prebakeMs} compile ${s.compileMs}` : ''));
    }
    meta.idleWork = await page.evaluate(() => (window.__GARAGE_IDLE_WORK
      ? JSON.parse(JSON.stringify(window.__GARAGE_IDLE_WORK)) : null));
    meta.finishedAt = new Date().toISOString();
    meta.loadAverageEnd = os.loadavg();
  } finally {
    await browser.close();
    await close();
  }
  const summary = summarizeProfile(rows);
  return { meta, errors, summary, rows: summary.rows };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const has = (name) => args.includes(`--${name}`);
  const root = resolve(opt('root', process.cwd()));
  if (!has('profile')) {
    const failures = await runConvergence({
      root,
      rounds: parseInt(opt('rounds', '10'), 10),
      clicks: parseInt(opt('clicks', '20'), 10),
      seed: parseInt(opt('seed', String((Date.now() % 100000) | 0)), 10),
      skipA: has('skip-a'), skipC: has('skip-c'),
    });
    process.exit(failures ? 1 : 0);
  }
  const dist = opt('dist', '') ? resolve(opt('dist', '')) : null;
  const ownCache = !dist && !opt('cache-dir', '');
  const cacheDir = dist ? null : resolve(opt('cache-dir', '') || mkdtempSync(join(os.tmpdir(), 'cot-switch-vite-')));
  let report;
  try {
    report = await runProfile({
      root, dist, cacheDir, label: opt('label', dist ? 'preview' : 'dev'), tier: opt('tier', 'desktop'),
      cpuRate: Math.max(1, Number(opt('cpu', '1')) || 1), dwellMs: Math.max(0, Number(opt('dwell', '2500')) || 0),
      sequence: opt('sequence', 'fsp01'), tree: opt('tree', null),
      cpuProfileIds: opt('cpuprofile', '').split(',').map((id) => id.trim()).filter(Boolean),
    });
  } finally {
    if (ownCache) rmSync(cacheDir, { recursive: true, force: true });
  }
  const markdown = renderProfileMarkdown(report);
  console.log(markdown);
  const out = opt('out', '');
  if (out) {
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(resolve(out), JSON.stringify(report, null, 2));
    console.log(`[garage-switch-probe] report ${resolve(out)}`);
  }
  const md = opt('md', '');
  if (md) {
    mkdirSync(dirname(resolve(md)), { recursive: true });
    writeFileSync(resolve(md), markdown);
  }
  let failures = report.errors.length ? [...report.errors] : [];
  if (has('gate')) failures = failures.concat(checkWarmSwitchBudget(report.rows));
  for (const failure of failures) console.error(`[garage-switch-probe] FAIL: ${failure}`);
  console.log(failures.length ? `[garage-switch-probe] FAIL (${failures.length})` : '[garage-switch-probe] PASS');
  process.exit(failures.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
