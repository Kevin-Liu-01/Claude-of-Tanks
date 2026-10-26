#!/usr/bin/env node
// frontend-budget.mjs — the frontend's budgets on every surface (UI-LOCKDOWN E, 2026-10-25; the owner: "i want the frontend
// to be totally perfect and performant as well").
//
// Scores recorded runs, surface by surface, on both rigs (desktop at 1440; a 390x844 phone at 4x CPU):
// - public pages (tools/nav-timeline.mjs steps in a 'public' journey): LCP, CLS, total blocking time, INP;
// - app screens (tools/click-timeline.mjs presses, and nav-timeline's 'game' steps): the shell within a frame of the
//   press's paint, useful content, INP p98, no long task over 50 ms, dropped frames;
// - everywhere: console errors and warnings (click-timeline --census) and memory over twenty open/close cycles
//   (click-timeline's memory-cycle path).
// - bundles (a built dist, --dist): each route's brotli bytes and requests before its entry runs, and the game entry's
//   own brotli bytes, against BUNDLE_BUDGETS (2026-10-25, Main: "so growth needs a named ruling").
// A surface's value is its worst sample (INP: the 98th percentile). Each miss names the lane that owns the surface.
//
//   node tools/frontend-budget.mjs --nav=<run>/<label> [--click=<run>/<label> …] [--dist=<dir>]     the table, misses first
//   node tools/frontend-budget.mjs … --check     exit 1 on a miss tools/frontend-budget.json does not list, or on a listed
//                                                miss that got worse than its recorded value (by 25 % and the metric's slack)
//   node tools/frontend-budget.mjs … --write     record this run's misses as the known list (a reviewed decision; a
//                                                bundle miss is never recorded: it needs a named ruling, written by hand)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUDGET_PATH = fileURLToPath(new URL('./frontend-budget.json', import.meta.url));

/** UI-LOCKDOWN.md part E, per surface class and rig. */
export const BUDGETS = Object.freeze({
  public: { lcpMs: { desktop: 1200, phone: 2500 }, cls: 0.01, tbtMs: 100, inpMs: 100 },
  app: { shellMs: 100, contentMs: { desktop: 200, phone: 600 }, inpP98Ms: 100, longTaskMs: 50, droppedFrames: { desktop: 0, phone: 1 } },
  everywhere: { consoleErrors: 0, consoleWarnings: 0, heapGrowthMb: 5, nodeGrowth: 100, canvasViolations: 0 },
});
/** Lower is better for every metric; a regression is past the known value by 25 % and this much. */
/**
 * Each route's boot bytes (brotli, quality 11) and requests before its entry runs, and the game's entry chunk (tools/
 * bundle-budget.mjs measures them). Pinned at a reviewed build with no headroom: a route that grows past its pin fails
 * check:frontend until the known list carries the miss with a `ruling` (who decided, when, why). Lowering a pin needs
 * nothing; raising one is that same named ruling, here on the line above the number.
 */
export const BUNDLE_BUDGETS = Object.freeze({
  // 2026-10-25 (nav-perf, UI-LOCKDOWN E): first pinned at the lane's public build of release 252 (the turret seat plane, the
  // tier table and the deterministic math in one boot chunk, the Garage's equipment preview lazy).
  // 2026-10-25 (integrator 253, re-pinned at the release build of 253 after its npm ci, under these named rulings):
  // - Main: "253: riding-parts prebuild trigger, moves into a lazy chunk in 254" (frontend-budgets-252 e297944861 +
  //   8cc6be8301: +170 B brotli on the game, +259 B on its entry, accepted for 253);
  // - Main's no-extra-request ruling: canvas-ui's uiCanvas and equipment-rules' vehicleEras ride in the turretSeatPlane
  //   chunk and equipmentRules with vehicleActions (vite.config.ts), so the game is at 129 requests, cn 130, the Gallery 75;
  // - home +714 / docs +1,361 / 404 +545 brotli over the lane's pins: the Premiere lead's /home and 404 rounds 17 and 18
  //   and the mode hues (brand-ui-home-252 024b0c5ff6, c6ebdd8eec), primitives' Field Manual r13/r14 with its mode glyphs
  //   (brand-ui-primitives-250 2c6c740125), the registry's data-datum markers (surface-registry-253 6837baa487).
  game: { brotliBytes: 1072654, requests: 129, entryBrotliBytes: 236546 },
  cn: { brotliBytes: 1115783, requests: 130, entryBrotliBytes: 236546 },
  gallery: { brotliBytes: 665390, requests: 75 },
  home: { brotliBytes: 24863, requests: 8 },
  docs: { brotliBytes: 32949, requests: 12 },
  notFound: { brotliBytes: 16362, requests: 7 },
});
/** Byte noise between two builds of the same code (chunk hashes in import specifiers); requests have none. */
const BUNDLE_SLACK = { brotliBytes: 160, entryBrotliBytes: 96, requests: 0 };

const SLACK = { lcpMs: 150, cls: 0.005, tbtMs: 50, inpMs: 24, shellMs: 24, contentMs: 50, inpP98Ms: 24, longTaskMs: 30,
  droppedFrames: 2, consoleErrors: 0, consoleWarnings: 0, heapGrowthMb: 2, nodeGrowth: 50, canvasViolations: 0 };

/** The screen a recorded press or step belongs to. */
export function surfaceOf(kind) {
  const canvas = /^canvas:([^:]+)/.exec(String(kind));
  if (canvas) return canvas[1];
  const id = String(kind).replace(/^(sweep|pick|memory):/, '$1-');
  if (/^(home|cn-home)/.test(id)) return 'home';
  if (/^(docs|manual|home-to-docs|gallery-to-docs)/.test(id)) return 'docs';
  if (id === 'not-found') return '404';
  if (/^(gallery|home-to-gallery)/.test(id)) return 'gallery';
  if (/^(studio|home-to-studio)/.test(id)) return 'studio';
  if (/^(settings|garage-settings)/.test(id)) return 'settings';
  if (/^(deploy-launch|garage-to-battle)/.test(id)) return 'battle-load';
  if (/^(deploy|garage-battle-setup|battle-setup)/.test(id)) return 'deploy';
  if (/^record/.test(id)) return 'record';
  if (/^(garage-private-lobby|lobby)/.test(id)) return 'rooms';
  if (/^(end-to-garage|battle-end)/.test(id)) return 'battle-end';
  if (/^watch/.test(id)) return 'watch';
  if (/^battle-steady/.test(id)) return 'battle-hud';
  if (/^(game-boot|gate-to-garage)/.test(id)) return 'boot';
  if (/^memory-/.test(id)) return id.slice('memory-'.length);
  if (/^(recover|context-restore|chunk-)/.test(id)) return 'recovery';
  return 'garage';
}

/** The lane a surface's misses go to (UI-LOCKDOWN Owners). */
export function ownerOf(surface) {
  if (['home', 'docs', '404', 'deploy', 'settings', 'record', 'rooms', 'boot'].includes(surface)) return 'premiere-site';
  if (['gallery', 'studio', 'garage'].includes(surface)) return 'premiere-gallery-studio';
  if (['battle-load', 'battle-end', 'watch'].includes(surface)) return 'premiere-battle';
  if (surface === 'battle-hud') return 'perf';
  return 'nav-perf';
}

const quantile = (values, q) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
};
const worst = (values) => (values.length ? Math.max(...values) : null);
const rigOf = (file) => (/\.phone[.]/.test(file) ? 'phone' : 'desktop');
const listJson = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('programs.') && !f.startsWith('boot.')) : []);

/** Every measurable value by class/surface/rig/metric, from nav-timeline and click-timeline run directories. */
export function collect({ nav = [], click = [], bundle = null } = {}) {
  const values = new Map();
  const add = (cls, surface, rig, metric, value) => {
    if (value == null || Number.isNaN(value)) return;
    const key = `${cls}/${surface}/${rig}/${metric}`;
    if (!values.has(key)) values.set(key, { cls, surface, rig, metric, values: [] });
    values.get(key).values.push(value);
  };
  // a built dist's routes (tools/bundle-budget.mjs measureDist*: { route: { brotli, requests, entryBrotli } })
  for (const [route, page] of Object.entries(bundle ?? {})) {
    add('bundle', route, 'any', 'brotliBytes', page.brotli);
    add('bundle', route, 'any', 'requests', page.requests);
    // only the game documents start with an application entry (a public page's first chunk is arbitrary: bundle-budget.mjs)
    if (page.entryBrotli != null && (route === 'game' || route === 'cn')) add('bundle', route, 'any', 'entryBrotliBytes', page.entryBrotli);
  }
  for (const dir of nav) {
    for (const file of listJson(dir)) {
      const step = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      if (step.error || !step.step) continue;
      const rig = rigOf(file), surface = surfaceOf(step.step);
      // runs before 2026-10-25 carry no journey group: a public page by its surface
      const group = step.group ?? (['home', 'docs', '404'].includes(surface) || /^(home-to-gallery|gallery-dossier)$/.test(step.step) ? 'public' : 'game');
      if (Array.isArray(step.consoleErrors)) add('everywhere', surface, rig, 'consoleErrors', step.consoleErrors.length);
      if (Array.isArray(step.consoleWarnings)) add('everywhere', surface, rig, 'consoleWarnings', step.consoleWarnings.length);
      if (group === 'public') {
        add('public', surface, rig, 'lcpMs', step.lcp);
        add('public', surface, rig, 'cls', step.cls);
        add('public', surface, rig, 'tbtMs', step.tbt);
        add('public', surface, rig, 'inpMs', step.inp);
      } else if (group === 'game') {
        add('app', surface, rig, 'contentMs', step.content == null ? null : Math.max(step.content, step.fcp ?? 0));
        add('app', surface, rig, 'inpP98Ms', step.inp);
        add('everywhere', surface, rig, 'cls', step.cls);
      }
    }
  }
  for (const dir of click) {
    for (const file of listJson(dir)) {
      const run = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      if (!Array.isArray(run.samples)) continue;
      const rig = run.profile === 'phone' || rigOf(file) === 'phone' ? 'phone' : 'desktop';
      for (const sample of run.samples) {
        const surface = surfaceOf(sample.kind);
        // (UI-LOCKDOWN A) the canvas rule: each check's violations, from canvasProbe and from --canvas presses
        const canvasResult = sample.canvas ?? sample.census?.canvas;
        if (canvasResult && !canvasResult.error) add('everywhere', surface, rig, 'canvasViolations', canvasResult.violations?.length ?? 0);
        if (/^canvas:/.test(sample.kind)) continue;
        if (/^memory:/.test(sample.kind)) {
          if (sample.error) continue;
          add('everywhere', surface, rig, 'heapGrowthMb', Number((sample.heapDeltaBytes / 1048576).toFixed(2)));
          add('everywhere', surface, rig, 'nodeGrowth', sample.nodeDelta);
          continue;
        }
        if (sample.error) continue;
        const census = sample.census;
        if (census && !census.error) {
          add('everywhere', surface, rig, 'consoleErrors', census.consoleErrors?.length ?? 0);
          add('everywhere', surface, rig, 'consoleWarnings', census.consoleWarnings ?? 0);
        }
        // the recovery probes and the idle windows score their console only; a battle's live frames are the perf lane's
        if (surface === 'recovery' || sample.duration == null || /^battle-steady|^garage-idle/.test(sample.kind)) continue;
        add('app', surface, rig, 'inpP98Ms', Math.round(sample.duration));
        if (sample.shownMs != null) add('app', surface, rig, 'shellMs', sample.shownMs);
        add('app', surface, rig, 'contentMs', sample.doneMs ?? sample.shownMs);
        if (census && !census.error) {
          add('app', surface, rig, 'longTaskMs', census.worstLong ?? 0);
          add('app', surface, rig, 'droppedFrames', census.droppedFrames ?? census.frames33 ?? 0);
        }
      }
    }
  }
  return values;
}

const budgetFor = (cls, metric, rig, surface) => {
  if (cls === 'bundle') return BUNDLE_BUDGETS[surface]?.[metric] ?? null;
  const value = BUDGETS[cls === 'everywhere' && metric === 'cls' ? 'public' : cls]?.[metric];
  return value != null && typeof value === 'object' ? value[rig] : value;
};

/** Scored rows: { key, cls, surface, rig, metric, value, budget, pass, samples, owner }, misses first. */
export function evaluate(values) {
  const rows = [];
  for (const [key, entry] of values) {
    const budget = budgetFor(entry.cls, entry.metric, entry.rig, entry.surface);
    if (budget == null) continue;
    const value = entry.metric === 'inpP98Ms' ? quantile(entry.values, 0.98) : worst(entry.values);
    rows.push({ key, cls: entry.cls, surface: entry.surface, rig: entry.rig, metric: entry.metric, value, budget,
      // canvas rule misses go to the canvas-ui migration (UI-LOCKDOWN A), not the surface's lane
      pass: value <= budget + (entry.cls === 'bundle' ? BUNDLE_SLACK[entry.metric] ?? 0 : 0), samples: entry.values.length,
      // canvas misses go to the canvas-ui migration (UI-LOCKDOWN A); bundle growth to the integrator, who splits it by head
      owner: entry.metric === 'canvasViolations' ? 'canvas-ui' : entry.cls === 'bundle' ? 'integrator' : ownerOf(entry.surface) });
  }
  return rows.sort((a, b) => Number(a.pass) - Number(b.pass) || a.key.localeCompare(b.key));
}

/** --check: misses the known list lacks, and listed misses past their recorded value; and listed ones now passing. */
export function compare(rows, known = {}) {
  const regressions = [], fixed = [];
  for (const row of rows) {
    const was = known[row.key];
    if (row.pass) { if (was) fixed.push(row); continue; }
    if (!was) { regressions.push({ ...row, why: 'new miss' }); continue; }
    // bundle growth holds only under a named ruling, and only up to the bytes that ruling recorded
    if (row.cls === 'bundle') {
      if (typeof was.ruling !== 'string' || !was.ruling.trim()) regressions.push({ ...row, why: 'growth without a named ruling' });
      else if (row.value > was.value + (BUNDLE_SLACK[row.metric] ?? 0)) regressions.push({ ...row, why: `past its ruling's ${was.value}` });
      continue;
    }
    const slack = SLACK[row.metric] ?? 0;
    if (row.value > was.value * 1.25 + slack) regressions.push({ ...row, why: `worse than ${was.value}` });
  }
  return { regressions, fixed };
}

function table(rows) {
  const lines = ['| surface | class | rig | metric | value | budget | samples | owner |', '|---|---|---|---|---:|---:|---:|---|'];
  for (const r of rows) lines.push(`| ${r.pass ? '' : '**MISS** '}${r.surface} | ${r.cls} | ${r.rig} | ${r.metric} | ${r.value} | ${r.budget} | ${r.samples} | ${r.owner} |`);
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const many = (name) => argv.filter((a) => a.startsWith(`--${name}=`)).map((a) => resolve(a.slice(name.length + 3)));
  const [dist] = many('dist');
  const bundle = dist ? (await import('./bundle-budget.mjs').then((m) => m.measureDistAsync(dist))).measures : null;
  const rows = evaluate(collect({ nav: many('nav'), click: many('click'), bundle }));
  if (!rows.length) { console.error('frontend-budget: nothing recorded (pass --nav=<run>/<label>, --click=<run>/<label> and/or --dist=<dir>)'); process.exit(2); }
  const misses = rows.filter((r) => !r.pass);
  console.log(table(rows));
  console.log(`\nfrontend-budget: ${rows.length - misses.length} within budget, ${misses.length} misses`
    + ` (${[...new Set(misses.map((r) => r.owner))].join(', ') || 'none'})`);
  if (argv.includes('--write')) {
    const kept = existsSync(BUDGET_PATH) ? JSON.parse(readFileSync(BUDGET_PATH, 'utf8')).known ?? {} : {};
    // bundle rows are never written here: each needs its ruling by hand (the ones already ruled are kept)
    const known = Object.fromEntries([...misses.filter((r) => r.cls !== 'bundle').map((r) => [r.key, { value: r.value, owner: r.owner }]),
      ...Object.entries(kept).filter(([key, row]) => key.startsWith('bundle/') && row.ruling)]);
    writeFileSync(BUDGET_PATH, `${JSON.stringify({ note: 'Known frontend budget misses (tools/frontend-budget.mjs --write); each names its owning lane. Remove a row when its surface passes.', known }, null, 1)}\n`);
    console.log(`frontend-budget: wrote ${misses.length} known misses to ${basename(BUDGET_PATH)}`);
  } else if (argv.includes('--check')) {
    const known = existsSync(BUDGET_PATH) ? JSON.parse(readFileSync(BUDGET_PATH, 'utf8')).known ?? {} : {};
    const { regressions, fixed } = compare(rows, known);
    for (const r of fixed) console.log(`  now within budget: ${r.key} (${r.value} <= ${r.budget}); remove its known row`);
    for (const r of regressions) console.log(`  REGRESSION ${r.key}: ${r.value} (budget ${r.budget}; ${r.why}) -> ${r.owner}`);
    console.log(`frontend-budget --check: ${regressions.length ? `FAIL (${regressions.length})` : 'PASS'}`);
    if (regressions.length) process.exitCode = 1;
  }
}
