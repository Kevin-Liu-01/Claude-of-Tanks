#!/usr/bin/env node
// The receipt audit of release 266 as a document: every registered receipt (and every one the audit retired) with its
// run time, decision, reason and where its coverage lives. First-party tooling: Kevin B. Liu.
//
//   node tools/test-audit.mjs            # the summary: counts, CPU-minutes and simulated wall time per tier
//   node tools/test-audit.mjs --write    # rewrite docs/TEST-AUDIT.md (each receipt keeps the run time the page states)
//   node tools/test-audit.mjs --write --retime   # ... with every run time read again
//
// The page's counts (decisions, suites, sections, each receipt's decision) are held to the tiers by
// tools/selftest-tiers.selftest.mjs (auditCounts): a stale page fails it with "run node tools/test-audit.mjs --write".
// Run times are tools/selftest-durations.json's, else this machine's latest observation (the runner's runtime index). A
// --write keeps the times the page already states (a receipt new to it takes the current one), so a lane that adds a
// receipt moves only that row and the totals, not every time its own machine's load changed; --retime re-reads them all.
// Wall time is the runner's schedule replayed on them (the exclusive CPU receipts alone and first, the rest longest-first
// on the pool, the judge and the browser receipts alone and last), on an otherwise idle machine.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SELFTEST_SUITES } from './selftest-suites.mjs';
import { MANUAL_SUITES, MERGED_RECEIPTS, MUST_KEEP, RETIRED_RECEIPTS, defaultTierFiles, manualSuiteOf, namedIds } from './selftest-tiers.mjs';
import { MAX_SELFTEST_WORKERS, SELFTEST_EXCLUSIVE_CPU_FILES, SELFTEST_LAST_FILES, SELFTEST_OWNED_LEASE_FILES } from './run-selftests.mjs';
import { receiptRunTimes, TOOLS_ROOT } from './test-diff.mjs';

/** Replay of the runner's schedule: { wallMs, cpuMs } for `files` with run times from `runMsOf`. */
export function simulateWall(files, runMsOf, { workers = MAX_SELFTEST_WORKERS } = {}) {
  const ms = (file) => runMsOf(file) ?? 0;
  const exclusive = files.filter((file) => SELFTEST_EXCLUSIVE_CPU_FILES.includes(file) && !SELFTEST_OWNED_LEASE_FILES.includes(file));
  const last = files.filter((file) => SELFTEST_LAST_FILES.includes(file) || SELFTEST_OWNED_LEASE_FILES.includes(file));
  const pool = files.filter((file) => !exclusive.includes(file) && !last.includes(file)).map(ms).sort((a, b) => b - a);
  const lanes = new Array(workers).fill(0);
  for (const cost of pool) { let low = 0; for (let index = 1; index < workers; index++) if (lanes[index] < lanes[low]) low = index; lanes[low] += cost; }
  const serial = (list) => list.reduce((sum, file) => sum + ms(file), 0);
  return { wallMs: serial(exclusive) + Math.max(...lanes) + serial(last), cpuMs: files.reduce((sum, file) => sum + ms(file), 0),
    exclusiveMs: serial(exclusive), poolMs: Math.max(...lanes), lastMs: serial(last) };
}

/** Receipts this lane added: not part of the audited registry's 'before'. */
const LANE_ADDED = Object.freeze(['tools/selftest-tiers.selftest.mjs']);

const AREAS = [
  [/^src\/sim\//, 'simulation rule'], [/^src\/mp\//, 'multiplayer wire, session or host'], [/^server\/match\//, 'match authority'],
  [/^server\//, 'server service'], [/^src\/ui\//, 'interface contract'], [/^src\/game\//, 'game flow'], [/^src\/engine\//, 'renderer contract'],
  [/^src\/fx\//, 'effects contract'], [/^src\/audio\//, 'audio contract'], [/^src\/world\//, 'world rule'], [/^src\/vehicles\//, 'vehicle rule'],
  [/^src\/(docs|gallery|presentation|app|dev|entry|techTree)\//, 'site, manual or app contract'], [/\.browser\.selftest\.mjs$/, 'GPU regression'],
  [/^tools\/(changed-only|selftest|run-selftests|gate|release|shared-main)/, 'test, gate or release tooling'], [/^tools\//, 'tool contract'],
];
const area = (file) => AREAS.find(([pattern]) => pattern.test(file))?.[1] ?? 'contract';
const seconds = (ms) => (ms === null || ms === undefined ? 'n/a' : (ms / 1000).toFixed(ms < 10_000 ? 1 : 0));
const minutes = (ms) => (ms / 60_000).toFixed(1);
const cell = (text) => String(text).replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

function registryNotes() {
  const notes = new Map();
  let pending = [];
  for (const line of readFileSync(join(TOOLS_ROOT, 'tools/selftest-suites.mjs'), 'utf8').split('\n')) {
    const text = line.trim();
    if (text.startsWith('//')) { pending.push(text.replace(/^\/\/\s?/, '')); continue; }
    const match = /^'([^']+\.mjs)',?\s*(?:\/\/\s*(.*))?$/.exec(text);
    if (match) { const note = [...pending, match[2] ?? ''].join(' ').trim(); if (note) notes.set(match[1], note); pending = []; continue; }
    if (text) pending = [];
  }
  return notes;
}

function headerOf(file) {
  let text = '';
  try { text = readFileSync(join(TOOLS_ROOT, file), 'utf8'); } catch { return { text, header: '' }; }
  const line = (text.match(/^(?:\s*\/\/.*\n)+/) ?? text.match(/^\s*\/\*\*?([\s\S]*?)\*\//) ?? [''])[0];
  return { text, header: line.replace(/^\s*(\/\/|\/\*\*?|\*\/?)\s?/gm, ' ').replace(/\s+/g, ' ').trim() };
}

/** Every receipt's audit row. `details: false` leaves out what only the reasons hold (receipt headers, registry notes, the
 *  ids a pin names), for a count check that needs no fleet load; `runMsOf` replaces the run-time index. */
export async function auditRows({ runMsOf = null, details = true } = {}) {
  const registered = Object.values(SELFTEST_SUITES).flat();
  runMsOf ??= await receiptRunTimes();
  const notes = details ? registryNotes() : new Map();
  let idSet = new Set();
  if (details) {
    await import('../src/vehicles/fleetRegistration.ts');
    idSet = new Set((await import('../src/vehicles/specs.ts')).ALL_TANK_IDS);
  }
  const rows = [];
  for (const file of registered) {
    const ms = runMsOf(file);
    const suite = manualSuiteOf(file);
    const { text, header } = details ? headerOf(file) : { text: '', header: '' };
    const what = cell((notes.get(file) || header).slice(0, 110));
    const ids = [...namedIds(text, idSet)];
    let decision = 'KEEP', reason, coverage;
    if (RETIRED_RECEIPTS[file]) { decision = 'RETIRE'; reason = RETIRED_RECEIPTS[file].reason; coverage = RETIRED_RECEIPTS[file].coverage; }
    else if (MERGED_RECEIPTS[file]) { decision = 'MERGE'; reason = MERGED_RECEIPTS[file].reason; coverage = MERGED_RECEIPTS[file].into; }
    else if (suite) {
      decision = 'MANUAL';
      const scope = MANUAL_SUITES[suite].idScoped
        ? (ids.length ? `per-tank pin (${ids.slice(0, 4).join(', ')}${ids.length > 4 ? ', ...' : ''})` : 'per-family pin')
        : `${suite}: ${MANUAL_SUITES[suite].about.split(':')[0]}`;
      reason = `${scope}, ${seconds(ms)} s${what ? `: ${what}` : ''}`;
      coverage = MANUAL_SUITES[suite].idScoped
        ? `test:heavy -- ${suite}; lane mode and tank:release:check run it for its ids`
        : `test:heavy -- ${suite}; test:recommend flags it when its inputs change`;
    } else {
      reason = MUST_KEEP[file] ?? `${area(file)}, ${seconds(ms)} s${what ? `: ${what}` : ''}`;
      coverage = 'default tier (npm test, the release gate; lane mode by its closure)';
    }
    rows.push({ file, ms, decision, suite, reason: cell(reason), coverage: cell(coverage) });
  }
  for (const [file, entry] of Object.entries(RETIRED_RECEIPTS)) if (!registered.includes(file)) {
    rows.push({ file, ms: runMsOf(file), decision: 'RETIRE', suite: null, reason: cell(entry.reason), coverage: cell(entry.coverage) });
  }
  return { rows, registered, runMsOf };
}

export function summary({ rows, registered, runMsOf }) {
  const by = (decision) => rows.filter((row) => row.decision === decision);
  const total = (list) => list.reduce((sum, row) => sum + (row.ms ?? 0), 0);
  const retiredRegistered = registered.filter((file) => RETIRED_RECEIPTS[file]);
  // before: the registry at ccb2041c41 (this lane's own receipt was not there; the retired ones were)
  const all = [...new Set([...registered, ...Object.keys(RETIRED_RECEIPTS)])].filter((file) => !LANE_ADDED.includes(file));
  const before = simulateWall(all, runMsOf);
  const defaults = defaultTierFiles(registered).filter((file) => !RETIRED_RECEIPTS[file] && !MERGED_RECEIPTS[file]);
  const after = simulateWall(defaults, runMsOf);
  const suites = Object.keys(MANUAL_SUITES).map((name) => {
    const files = registered.filter((file) => manualSuiteOf(file) === name);
    return { name, receipts: files.length, cpuMs: files.reduce((sum, file) => sum + (runMsOf(file) ?? 0), 0), wall: simulateWall(files, runMsOf) };
  });
  return { decisions: ['KEEP', 'MERGE', 'MANUAL', 'RETIRE'].map((decision) => ({ decision, count: by(decision).length, cpuMs: total(by(decision)) })),
    before, after, beforeReceipts: all.length, afterReceipts: defaults.length, suites, retiredRegistered,
    unknown: rows.filter((row) => row.ms === null || row.ms === undefined).length };
}

export function documentText({ rows }, s) {
  const lines = [];
  lines.push('# Receipt audit, release 266 (2026-10-30)', '',
    'The owner, 2026-10-30: "pick apart and cut down this testing suitte SIGNIFICANTLY and make super strenuous suites like balance and other testing to be not for every deploy annd manually recommended annd triggered by ME".', '',
    'Every receipt registered at ccb2041c41 (2,122) has one decision; this lane adds one, `tools/selftest-tiers.selftest.mjs` (default tier: the tiers, their callers, lane mode and the recommender, with negative controls). The tiers live in `tools/selftest-tiers.mjs`; this page is generated from it (`node tools/test-audit.mjs --write`, never by hand): `tools/selftest-tiers.selftest.mjs` fails when its counts or decisions differ from the tiers (run times, which differ by machine, are not compared).', '',
    '- **KEEP**: the default tier. `npm test`, the release gate (`tools/gate.mjs`) and tank:release:check\'s embedded suite run it; lane mode (`npm run test:lane`) runs the part a diff reaches.',
    '- **MANUAL**: a named suite, run only by `npm run test:heavy -- <suite>`. `npm run test:recommend` says which suites a diff warrants and why; Main relays it and the owner triggers the run. `tanks` is id-scoped: lane mode and tank:release:check run the receipts naming or reading their ids.',
    '- **MERGE**: folded into a named receipt with no coverage lost.',
    '- **RETIRE**: removed with `git rm` (history keeps it), with the reason and where its coverage lives.', '',
    'Run times: `tools/selftest-durations.json`, else this machine\'s latest observation (265 receipts registered since the snapshot; observed under load 150-400, so they read high). Wall time replays the runner\'s schedule on an idle machine with 8 workers.', '');
  lines.push('## Summary', '', '| Decision | Receipts | CPU-min |', '|---|---:|---:|');
  for (const row of s.decisions) lines.push(`| ${row.decision} | ${row.count} | ${minutes(row.cpuMs)} |`);
  lines.push('', '| Suite run | Receipts | CPU-min | Simulated wall (min) |', '|---|---:|---:|---:|',
    `| Before: every receipt (npm test without the tiers) | ${s.beforeReceipts} | ${minutes(s.before.cpuMs)} | ${minutes(s.before.wallMs)} |`,
    `| After: the default tier | ${s.afterReceipts} | ${minutes(s.after.cpuMs)} | ${minutes(s.after.wallMs)} |`);
  lines.push('', `Default tier: ${(100 * s.after.cpuMs / s.before.cpuMs).toFixed(1)} % of the whole registry's CPU; ${(100 * s.after.cpuMs / (916 * 60_000)).toFixed(1)} % of the 916 CPU-min the snapshot gave for the 1,863 receipts it timed. Its wall: ${minutes(s.after.exclusiveMs)} min exclusive receipts, ${minutes(s.after.poolMs)} min pool, ${minutes(s.after.lastMs)} min browser receipts.`, '');
  lines.push('## Manual suites', '', '| Suite | Receipts | CPU-min | What it covers |', '|---|---:|---:|---|');
  for (const suite of s.suites) lines.push(`| \`${suite.name}\` | ${suite.receipts} | ${minutes(suite.cpuMs)} | ${cell(MANUAL_SUITES[suite.name].about)}${MANUAL_SUITES[suite.name].commands.length ? `; then ${MANUAL_SUITES[suite.name].commands.map((command) => `\`${command.join(' ')}\``).join(', ')}` : ''} |`);
  lines.push('', '## Must-keep receipts (default tier, never manual)', '', 'Sim determinism and driver boundaries, the authority rules, armour/ballistics/damage on a representative sample, and the typecheck, build, budget, attribution, security, i18n and changed-only guards. `tools/selftest-tiers.selftest.mjs` fails if one leaves the default tier. The guards with their own commands (`npm run typecheck`, `npm run build`, `npm run check:bundle`, `check:frontend`, `attribution:check`) are not receipts and are unchanged.', '');
  for (const [file, why] of Object.entries(MUST_KEEP)) lines.push(`- \`${file}\`: ${why}`);
  for (const decision of ['RETIRE', 'MERGE', 'MANUAL', 'KEEP']) {
    const list = rows.filter((row) => row.decision === decision).sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0) || a.file.localeCompare(b.file, 'en'));
    lines.push('', `## ${decision} (${list.length})`, '');
    if (!list.length) { lines.push(decision === 'MERGE' ? 'None. Folding receipts saves only process starts (about a second each) and would need a per-assertion coverage review; the CPU is in the receipts that build tanks and maps, which moved to manual suites instead.' : 'None.'); continue; }
    lines.push('| Receipt | Run (s) | Decision | Reason | Coverage now |', '|---|---:|---|---|---|');
    for (const row of list) lines.push(`| \`${row.file}\` | ${seconds(row.ms)} | ${row.decision}${row.suite ? ` (${row.suite})` : ''} | ${row.reason} | ${row.coverage} |`);
  }
  return lines.join('\n') + '\n';
}

/**
 * The lines of an audit page that hold counts and decisions, sorted: each decision's and each suite's receipt count, the
 * before and after receipt counts, each section's count and each receipt's decision. Run times (CPU-minutes, wall,
 * seconds, the share line and the reasons that quote them) are left out: they differ by machine (266, Main: two lanes
 * hand-edited the same count lines, MANUAL 667->668 and ui 4->5, for two receipts; identical hunks merge as one).
 */
export function auditCounts(text) {
  const out = [];
  for (const line of text.split('\n')) {
    let match;
    if ((match = /^\| (KEEP|MERGE|MANUAL|RETIRE) \| (\d+) \|/.exec(line))) out.push(`decision ${match[1]}: ${match[2]}`);
    else if ((match = /^\| (Before|After)\b[^|]*\| (\d+) \|/.exec(line))) out.push(`${match[1].toLowerCase()}: ${match[2]}`);
    else if ((match = /^\| `([a-z]+)` \| (\d+) \|/.exec(line))) out.push(`suite ${match[1]}: ${match[2]}`);
    else if ((match = /^## (KEEP|MERGE|MANUAL|RETIRE) \((\d+)\)$/.exec(line))) out.push(`section ${match[1]}: ${match[2]}`);
    else if ((match = /^\| `([^`]+)` \| [^|]* \| ([A-Z]+(?: \([a-z]+\))?) \|/.exec(line))) out.push(`receipt ${match[1]}: ${match[2]}`);
  }
  return out.sort();
}

/** file -> run time in ms, as an audit page's receipt rows state it ('n/a' rows are absent). */
function pageRunTimes(text) {
  const out = new Map();
  for (const line of text.split('\n')) {
    const match = /^\| `([^`]+)` \| ([\d.]+) \| [A-Z]/.exec(line);
    if (match) out.set(match[1], Number(match[2]) * 1000);
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('test-audit.mjs')) {
  const page = join(TOOLS_ROOT, 'docs/TEST-AUDIT.md');
  let stated = new Map();
  if (process.argv.includes('--write') && !process.argv.includes('--retime')) { try { stated = pageRunTimes(readFileSync(page, 'utf8')); } catch {} }
  const observed = await receiptRunTimes();
  const audit = await auditRows({ runMsOf: (file) => stated.get(file) ?? observed(file) });
  const s = summary(audit);
  for (const row of s.decisions) console.log(`${row.decision.padEnd(7)} ${String(row.count).padStart(5)} receipts ${minutes(row.cpuMs).padStart(7)} CPU-min`);
  console.log(`before: ${s.beforeReceipts} receipts, ${minutes(s.before.cpuMs)} CPU-min, ~${minutes(s.before.wallMs)} min wall; after (default tier): ${s.afterReceipts} receipts, ${minutes(s.after.cpuMs)} CPU-min, ~${minutes(s.after.wallMs)} min wall (${minutes(s.after.exclusiveMs)} exclusive + ${minutes(s.after.poolMs)} pool + ${minutes(s.after.lastMs)} browser)`);
  for (const suite of s.suites) console.log(`  ${suite.name.padEnd(8)} ${String(suite.receipts).padStart(4)} ${minutes(suite.cpuMs).padStart(7)} CPU-min ~${minutes(suite.wall.wallMs)} min wall`);
  if (process.argv.includes('--write')) {
    writeFileSync(page, documentText(audit, s));
    console.log('wrote docs/TEST-AUDIT.md');
  }
}
