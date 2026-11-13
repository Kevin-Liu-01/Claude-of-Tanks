#!/usr/bin/env node
// Regenerate only what changed: the fleet generators in dependency order, each on the tank ids whose inputs or outputs
// moved since it last ran (tools/changed-ids.mjs), to a fixpoint. First-party tooling: Kevin B. Liu.
//
//   npm run tank:regen:changed                      # changed ids only (CPU steps, ledger, manual, GPU steps)
//   npm run tank:regen:changed -- --dry-run         # print what would run and why
//   npm run tank:regen:changed -- --all             # every step on the whole fleet first (bootstrap, explicit full)
//   npm run tank:regen:changed -- --check --all     # nightly: every step's whole-fleet --check; writes nothing
//   npm run tank:regen:changed -- --verify          # then each step's --check on the ids it ran (whole fleet if it ran full)
//   npm run tank:regen:changed -- --ids=a,b         # every step on exactly these ids (a lane's own tanks), the world steps
//                                                   # on the maps that cast them as wreck donors; their rows are recorded
//                                                   # only when release/fingerprints.tsv exists
//   npm run tank:regen:changed -- --help
//   Without release/fingerprints.tsv, or with one recorded on another toolchain (Node, the platform, package-lock.json),
//   the chain refuses unless --ids, --all or --check says what to run (266: either way every id resolves as changed, so
//   the default run used to plan the whole fleet silently); --ids then records no rows (268). A node_modules that is not
//   the lock's install refuses every run but --dry-run (268).
//   options: --steps=controls,fills  --no-gpu  --no-world  --jobs=4 (parallel parts of fills, seats, spare track, anatomy, gun lines)  --max-passes=3  --root=<tree>
//            --table=<module> (a fixture step table: tools/changed-only/chain.selftest.mjs)
//   npm run tank:regen:changed -- --steps=wreckPlan,collision,trenches    # the world steps alone (maps whose keys moved)
//
// Order: aggregates that feed the shared core (paint catalog, legacy specs); then the CPU fixpoint, at most
// --max-passes passes over controls, fills, seats, spare-track, anatomy, marking (seats read the fills and roof guns,
// missionDockSeats feeds the spare-track dock keep-out); the geometry ledger; the manual reference; then centering and
// icons under the capture lock in holds of at most 20 minutes. Centering moves the presentation anchors every build
// reads, so the CPU fixpoint (and the ledger) runs again for any id they moved, and the GPU steps repeat until stable.
// Then the pages built from what ran (steps.mjs DEPENDENTS: after icons the Field Manual prerender, after a prerender
// write the public shell), each checked and rewritten only when stale. Then the world steps, per map (tools/changed-only/world.mjs): the wreck bake plan, the collision shards and the
// assault-trench shards, on the maps whose config, world core or wreck donors moved (a donor's build reads the fleet's
// settled rows, so they run last), repeated until a pass moves nothing (a plan's new donors re-key its map).
// Each step's keys are written to release/fingerprints.tsv as soon as it finishes (inKeys taken before the run, outKeys
// after; a step's own input rows as the run recorded them, stampedInKeys), so the chain resumes after a crash. The final resolve must report 0 changed for every step; otherwise the chain fails and names the ids.
//
// Resource rules: every CPU child runs `nice -n 10 node --max-old-space-size=4096` after `headroom can-start --gb N`,
// with a limit that stops only that child and its own children; GPU children are not niced and run inside the capture
// lock, under a wall-clock limit.
// Under COT_CAPTURE_PRIORITY=release (the integrator's release chain) CPU children run un-niced too
// (tools/changed-only/childPriority.mjs, 267). A CPU child's limit is a budget of its process tree's CPU, not of wall
// time, with a 30-minute no-progress cap for a hang (tools/changed-only/childBudget.mjs, 267).
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { emptyManifest, computeState, installDrift, MANIFEST_PATH, readManifest, readRowsAsync, recordStep, refreshComponents,
  resolveChanged, stampedInKeys, toolchainChange, toolchainOf, writeManifest } from './changed-only/fingerprint.mjs';
import { loadTable } from './changed-only/table.mjs';
import { cpuChildCommand } from './changed-only/childPriority.mjs';
import { watchChild } from './changed-only/childBudget.mjs';
import { gpuChunks } from './changed-only/steps.mjs';
import { expandGlobs } from './changed-only/globs.mjs';
import { movedShared, sharedDigests, sharedOutputs } from './changed-only/parts.mjs';
import { browserIdCap } from './browser-id-chunks.mjs';
import { uniqueIds } from './id-list.mjs';
import { createChildGroups, isChainStop, runInCaptureHold, stopOnSignal, takeChainLock } from './chain-lifecycle.mjs';
import { releaseAllCaptureHolds } from './capture-lock.mjs';

const args = process.argv.slice(2);
const value = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
if (args.includes('--help') || args.includes('-h')) {
  const text = readFileSync(new URL(import.meta.url), 'utf8').split('\n');
  console.log(text.slice(1, text.findIndex((line, index) => index > 0 && !line.startsWith('//'))).map((line) => line.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}
/** A refusal before anything runs: exit 2, one line, nothing written. */
const refuse = (message) => { console.error(`[regen] ${message}`); process.exit(2); };
const ALL = args.includes('--all'), CHECK = args.includes('--check'), DRY = args.includes('--dry-run');
const NO_GPU = args.includes('--no-gpu'), VERIFY = args.includes('--verify'), NO_WORLD = args.includes('--no-world');
const JOBS = Math.max(1, Number(value('jobs') ?? 4) | 0);
const MAX_PASSES = Math.max(1, Number(value('max-passes') ?? 3) | 0);
const ONLY = value('steps')?.split(',').filter(Boolean) ?? null;
const root = resolve(value('root') ?? process.cwd());
let IDS = null;
if (value('ids') !== undefined) {
  try { IDS = uniqueIds(value('ids').split(',').map((id) => id.trim()).filter(Boolean), 'tank:regen:changed --ids'); }
  catch (error) { refuse(error.message); }
  if (!IDS.length) refuse('--ids needs at least one tank id');
  if (ALL || CHECK) refuse('--ids runs those ids alone: drop --all/--check (or drop --ids for the whole fleet)');
}
// No table: every id would resolve as changed (no manifest), so a plain run would silently plan the whole fleet.
const TABLE_PRESENT = existsSync(resolve(root, MANIFEST_PATH));
if (!TABLE_PRESENT && !ALL && !CHECK && !IDS) refuse('no fingerprints table: pass --ids=<ids> for a lane-scoped regen, or --all to bootstrap');
// (268) The toolchain keys the lock (fingerprint.mjs toolchainOf), so the tools must be the lock's: a run on any other
// install refuses before a tool runs.
const DRIFT = DRY ? [] : installDrift(root);
if (DRIFT.length) {
  refuse(`node_modules is not package-lock.json's install (${DRIFT.length}: ${DRIFT.slice(0, 4).join('; ')}${DRIFT.length > 4 ? '; ...' : ''}): `
    + 'run npm ci, or link a node_modules installed from this lock');
}
// (268) --ids records rows only into a table taken on this run's toolchain: rows taken on another would move the table's
// toolchain and so mark every other id. On another one it runs its ids and records nothing, as without a table.
const TOOLCHAIN = toolchainOf(root), RECORDED = TABLE_PRESENT ? readManifest(root) : null;
const TABLE_CURRENT = TABLE_PRESENT && (!IDS || RECORDED?.toolchain === TOOLCHAIN.toolchain);
const UNRECORDED = TABLE_CURRENT ? null : TABLE_PRESENT ? `the table is on another toolchain: ${toolchainChange(RECORDED, TOOLCHAIN.parts)}`
  : 'no fingerprints table';
const table = await loadTable(value('table') ?? null);
const { STEPS, CPU_FIXPOINT_STEPS, PRE_AGGREGATES, POST_AGGREGATES, DEPENDENTS, WORLD_STEPS, stepByName } = table;
const WORLD_NAMES = WORLD_STEPS.map((entry) => entry.name);
/** A world step's resolver view is the state's per-map half; a tank step's is the state itself. */
const viewOf = (definition, state) => (definition.universe === 'maps' ? state.world : state);
const qaDir = join(root, '.qa-dev/changed-only');
mkdirSync(qaDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const logPath = join(qaDir, `${stamp}.log`);
const summary = { stamp, root, mode: CHECK ? 'check' : ALL ? 'all' : IDS ? 'ids' : 'changed', ...(IDS ? { ids: IDS } : {}), dryRun: DRY,
  runs: [], passes: 0, final: null, verify: [], dependents: [], resolveSeconds: [] };
const log = (line) => { console.log(line); appendFileSync(logPath, `${line}\n`); };
// The summary is rewritten after every step, so a chain stopped part-way still records what it ran.
const saveSummary = () => writeFileSync(join(qaDir, `${stamp}.json`), `${JSON.stringify(summary, null, 1)}\n`);
const selected = (name) => !ONLY || ONLY.includes(name);
for (const name of ONLY ?? []) if (!stepByName(name)) throw new Error(`unknown step ${name}`);
/** (268) A chain that leaves some step out (--steps, --no-gpu, --no-world): it writes only the lines of the steps it ran. */
const PARTIAL = [...STEPS, ...WORLD_STEPS].some((entry) => !selected(entry.name) || (NO_GPU && entry.device === 'gpu')
  || (NO_WORLD && WORLD_NAMES.includes(entry.name)));
// Flags that make a tool read a file the step key cannot see (a git revision, a hints file) are refused.
for (const step of [...STEPS, ...WORLD_STEPS]) if (step.flags.some((flag) => /^--(?:uniform-from|hints)\b/.test(flag))) {
  throw new Error(`${step.name}: ${step.flags.join(' ')} reads an unkeyed input; the chain never passes it`);
}

// One chain per tree (2026-11-02 audit S5, tools/chain-lifecycle.mjs): an owned lock directory, so two chains launched
// together cannot both pass (the old check-then-write pid file let them), and only a dead owner's lock is reaped. An older
// chain's pid file at chain.lock is honoured while its pid lives.
const lockPath = join(qaDir, 'chain.lock.d');
const chainLock = takeChainLock(lockPath, { legacyFile: join(qaDir, 'chain.lock'), log: (line) => console.error(line) });
if (!chainLock.held) { console.error(`[regen] another chain (pid ${chainLock.owner.pid ?? 'unknown'}) holds ${lockPath}`); process.exit(2); }
const unlock = () => chainLock.release();
process.on('exit', unlock);
// Every child of the chain (its steps, its rows reads, its headroom probes) leads its own process group: a stop signals
// them all, waits for them, SIGKILLs what is left, then releases the GPU step's capture hold and the chain lock, so
// nothing of this chain writes once the lock is free. From the signal on the groups refuse to start a child
// (chain-lifecycle 'stopping').
const children = createChildGroups();
stopOnSignal(children, { log: (line) => console.error(`[regen] ${line}`),
  cleanup: (signal) => {
    summary.ok = false; summary.stopped = signal;
    try { saveSummary(); } catch { /* the stop goes on */ }
    releaseAllCaptureHolds(`regen chain stopped by ${signal}`); unlock();
  } });

const childEnv = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' };

/**
 * Whether headroom lets a `gb` GB child start (`headroom can-start`, exit 0). The probe is a child of the chain like its
 * steps (round 8 Y10 fix-up r1): it starts through the chain's groups and is awaited, so the stop handler never waits on
 * it and no probe starts once the stop began (the spawn throws the stop marker). No headroom CLI on this machine: yes.
 */
function headroomReady(gb) {
  return new Promise((done, fail) => {
    const probe = children.spawn('headroom', ['can-start', '--gb', String(gb)], { stdio: 'ignore' });
    probe.once('error', (error) => { if (!probe.pid) done(error.code === 'ENOENT'); });
    probe.once('close', (code, signal) => {
      if (children.stopping) fail(children.stopMarker(`the headroom probe ended (${signal ?? `exit ${code}`})`));
      else done(code === 0);
    });
  });
}
async function gate(gb) {
  const started = Date.now();
  while (!(await headroomReady(gb))) {
    if (Date.now() - started > 4 * 3600_000) throw new Error(`headroom never allowed ${gb} GB in 4 h`);
    log(`[regen] waiting for headroom (${gb} GB)`);
    await new Promise((done) => setTimeout(done, 30_000));
  }
}

/**
 * Run one child; resolves with its exit code (124 when the runner stopped it). A CPU child's limit is a budget of the CPU
 * its process tree spends (tools/changed-only/childBudget.mjs, 267): a starved child keeps running, one that burns past
 * its budget or makes no CPU progress for HANG_S is stopped by exact pids, the reason named. A GPU child (never niced:
 * it runs inside a capture hold) keeps a wall-clock limit, which bounds the hold (TERM, then KILL after 15 s).
 */
function runChild(argv, { niced, timeoutS, label, env = childEnv }) {
  return new Promise((done) => {
    const { command, args: fullArgs, prefix } = cpuChildCommand(process.execPath, argv, { niced });
    log(`[regen] ${label}: ${prefix}node ${argv.join(' ').slice(0, 400)}`);
    const out = join(qaDir, `${stamp}-${label.replace(/[^\w.-]+/g, '_')}.out`);
    const child = children.spawn(command, fullArgs, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const sink = (chunk) => appendFileSync(out, chunk);
    child.stdout.on('data', sink); child.stderr.on('data', sink);
    let killed = false, timer = null, watch = null;
    if (niced) {
      watch = watchChild(child.pid, { budgetS: timeoutS, hangS: HANG_S, onStop: (verdict) => {
        killed = true;
        log(`[regen] ${label}: ${verdict.message}; stopping pid ${child.pid} and its children`);
      } });
    } else {
      timer = setTimeout(() => {
        killed = true;
        log(`[regen] ${label}: wall-clock limit ${timeoutS} s (a GPU child: its capture hold); stopping pid ${child.pid}`);
        try { process.kill(child.pid, 'SIGTERM'); } catch {}
        setTimeout(() => { try { process.kill(child.pid, 'SIGKILL'); } catch {} }, 15_000).unref();
      }, timeoutS * 1000);
    }
    child.on('close', (code, signal) => {
      clearTimeout(timer); watch?.stop();
      done({ code: killed ? 124 : code ?? (signal ? 128 : 1), out });
    });
  });
}
/** A CPU child with no CPU progress in its tree for this long is hung (its CPU budget is the step's limit). */
const HANG_S = 1800;

const timeoutFor = (step, count) => Math.round(step.timeoutS + step.perIdS * count);

/** Ids a step's tool reported it could not run in this checkout (steps.mjs `skipped`: the gate's absent inputs), by
 *  step: never recorded as run. Stamped with their reason when the step names it (268: current until what would make
 *  them runnable moves), else left due for a checkout that can run them; this chain does not try them again. */
const notRunHere = {};
/** A run's skip report: the file the chain passed in a step's `skipped` flag, `{ id: reason }` ({} when none). */
const skipFile = (step, label) => (step.skipped ? join(qaDir, `${stamp}-${step.name}-${label}.skipped.json`) : null);
const readSkipped = (file) => (file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {});

/** Run a CPU step on `ids` (null: whole fleet). A `parts` step (fills, anatomy, seats, spare track, gun lines) runs as
 *  parallel parts merged by the tool itself; its report and json flags go to the run that writes them (the merge). */
async function runCpuStep(step, ids, state) {
  const count = ids?.length ?? state.ids.length;
  const scopedArgs = ids ? step.scoped(ids) : step.full;
  const extra = [];
  let jsonPath = null;
  if (step.report) extra.push(`${step.report}=${join(qaDir, `${stamp}-${step.name}-report.json`)}`);
  if (step.json) { jsonPath = join(qaDir, `${stamp}-${step.name}-${Date.now()}.json`); extra.push(`${step.json}=${jsonPath}`); }
  // a step that reports skipped ids runs whole: its parts would each report apart (267)
  const run = step.parts && !step.skipped && count >= 8 && JOBS > 1
    ? await runParts(step, ids, state, scopedArgs, extra) : await runWhole(step, scopedArgs, extra, count);
  if (run.code === 0 && jsonPath) {
    // spare-track --update exits 0 when a build fails and keeps the old row: every requested id must have a fresh row.
    const report = JSON.parse(readFileSync(jsonPath, 'utf8'));
    const wanted = ids ?? state.ids;
    const missing = wanted.filter((id) => !report.results?.[id]);
    const errors = (report.problems ?? []).filter((problem) => /build\/analysis error/.test(problem));
    if (missing.length || errors.length) {
      log(`[regen] ${step.name}: ${missing.length} id(s) without a fresh row (${missing.slice(0, 8).join(',')}); ${errors.slice(0, 4).join(' | ')}`);
      return { ...run, code: 3 };
    }
  }
  return run;
}

async function runWhole(step, scopedArgs, extra, count) {
  const skippedFile = skipFile(step, Date.now());
  await gate(step.gb);
  return { ...await runChild([step.tool, ...step.flags, ...scopedArgs, ...extra, ...(skippedFile ? [`${step.skipped}=${skippedFile}`] : [])],
    { niced: true, timeoutS: timeoutFor(step, count), label: step.name }), skipped: readSkipped(skippedFile) };
}

async function runParts(step, ids, state, scopedArgs, extra) {
  const count = ids?.length ?? state.ids.length;
  const parts = Math.min(JOBS, Math.ceil(count / 4));
  const all = ids ?? Object.keys(state.groupById); // a whole-fleet run covers every fleet-manifest id
  const scratch = mkdtempSync(join(tmpdir(), `cot-${step.name}-parts-`));
  const lists = Array.from({ length: parts }, () => []);
  all.forEach((id, index) => lists[index % parts].push(id));
  // The step's shared outputs (its tables, `files`, `writes` and `sharedWrites`) are the merge's alone: held to their
  // digests across the parts, so a part that writes one fails the step instead of racing another part for it (268).
  const shared = sharedOutputs(step, table.TABLES);
  const before = sharedDigests(root, expandGlobs(root, shared));
  const runs = await Promise.all(lists.map(async (list, k) => {
    await gate(step.gb);
    return runChild([step.tool, ...step.flags, `--ids=${list.join(',')}`, ...step.parts(join(scratch, `part${k}`))],
      { niced: true, timeoutS: timeoutFor(step, list.length), label: `${step.name}-part${k}` });
  }));
  const failed = runs.find((run) => run.code !== 0);
  if (failed) return failed;
  const moved = movedShared(before, sharedDigests(root, expandGlobs(root, shared)));
  if (moved.length) {
    log(`[regen] ${step.name}: a part wrote ${moved.join(', ')}; only the merge writes the step's shared outputs`);
    return { code: 1, out: runs[0].out };
  }
  const dirs = lists.map((_, k) => join(scratch, `part${k}`)).join(',');
  await gate(step.gb);
  // the merge serializes every row and holds the step's own checks (anatomy's sim floors, with a blame build per
  // drift); it alone takes the report and json flags
  return runChild([step.tool, ...step.flags, ...scopedArgs, ...extra, `--merge-from=${dirs}`],
    { niced: true, timeoutS: step.timeoutS, label: `${step.name}-merge` });
}

/** Run a GPU step on `ids` in capture-lock holds, each one browser within the step's time and renderer caps (gpuChunks). */
async function runGpuStep(step, ids, state) {
  const list = ids ?? state.ids;
  const skipped = {};
  // A whole-fleet run larger than one hold is chunked too; the chunks together cover every id, written by the tool's
  // own --ids merge.
  const chunks = gpuChunks(step, list);
  for (const [index, chunk] of chunks.entries()) {
    log(`[regen] ${step.name}: waiting for the capture lock (chunk ${index + 1}/${chunks.length}, ${chunk.length} ids)`);
    // the GPU child runs inside this hold: a tool of it that takes the lock itself nests in it (runInCaptureHold's env)
    const run = await runInCaptureHold(async (env) => {
      await gate(step.gb);
      // A whole-fleet run that fits one hold runs the tool's own whole-fleet mode (no --ids), exactly as a full regen.
      const scope = !ids && chunks.length === 1 ? step.full : step.scoped(chunk);
      const skippedFile = skipFile(step, index + 1);
      const result = await runChild([step.tool, ...step.flags, ...scope, ...(skippedFile ? [`${step.skipped}=${skippedFile}`] : [])],
        { niced: false, timeoutS: Math.min(1200, timeoutFor(step, chunk.length)), label: `${step.name}-${index + 1}`, env });
      if (result.code === 0) Object.assign(skipped, readSkipped(skippedFile));
      return result;
    }, { label: `regen ${step.name}-${index + 1}`, baseEnv: childEnv, log });
    if (run.code !== 0) return run;
  }
  return { code: 0, skipped };
}

let manifest = readManifest(root) ?? emptyManifest();
/** Write the table after a step ran (268): that step's own component lines move; the shared ones only in a chain that
 *  selects every step, so a partial chain leaves every step it did not run as its keys were taken. */
const persist = (state, ran) => { refreshComponents(manifest, state, { ran, shared: !PARTIAL }); writeManifest(root, manifest); };
/** The tree's fingerprint state. (round 8 Y10 s6-06) Its rows are read by a child of the chain's groups, awaited
 *  (readRowsAsync): the synchronous read held the event loop, so a stop waited for the whole read, and zero-change steps
 *  chained their reads through microtasks without a turn of the loop between them. Every call is a real yield now; a
 *  stop during the read rejects with a stop marker. The rest (the graph, the keys) is still synchronous. */
const fresh = async () => {
  const started = Date.now();
  const rows = await readRowsAsync(root, childEnv, table.path, { groups: children });
  const state = computeState({ root, steps: STEPS, worldSteps: WORLD_STEPS, env: childEnv, config: table.config, tableModule: table.path, rows });
  summary.resolveSeconds.push(Math.round((Date.now() - started) / 100) / 10);
  return state;
};

/** --ids: a tank step's exact ids; a world step's maps that cast any of them as a wreck donor. */
function idsScope(definition, fullState, state) {
  if (definition.universe !== 'maps') return { mode: 'ids', ids: [...IDS], reasons: { '*': ['--ids'] } };
  const maps = state.ids.filter((map) => state.donorsOf(definition.name, map).some((id) => IDS.includes(id)));
  return { mode: maps.length ? 'ids' : 'none', ids: maps, reasons: { '*': ['--ids: the maps casting them as wreck donors'] } };
}

/** --ids after its first pass, with a table: what the resolver still finds due among the ids (or their donor maps). */
function idsResolve(definition, fullState, state) {
  const scope = new Set(idsScope(definition, fullState, state).ids);
  const due = resolveChanged(state, readManifest(root), { steps: [definition.name] })[definition.name];
  const ids = due.ids.filter((id) => scope.has(id));
  return { mode: ids.length ? 'ids' : 'none', ids, reasons: due.reasons };
}

/**
 * Resolve and run one step; returns true when it ran (its keys may have moved others). Under --ids the first touch of a
 * step runs it on every id (`restrict` false); later passes re-run only what is still due among the ids, which needs the
 * table (without one a step runs once).
 */
async function step(name, { forceFull = false, restrict = false } = {}) {
  const definition = stepByName(name);
  const fullState = await fresh();
  const state = viewOf(definition, fullState);
  if (!state) throw new Error(`${name}: this tree has no world rows (${fullState.errors.join('; ') || 'no map registry'})`);
  const resolved = IDS ? (restrict && TABLE_CURRENT ? idsResolve(definition, fullState, state) : idsScope(definition, fullState, state))
    : forceFull ? { mode: 'full', ids: [...state.ids], reasons: { '*': ['--all'] } }
    : resolveChanged(state, readManifest(root), { steps: [name] })[name];
  const tried = notRunHere[name] ?? {};
  // (268) by membership: a reason may be empty (a stamp refuses it; the id is still tried)
  if (resolved.ids.some((id) => Object.hasOwn(tried, id))) {
    const left = resolved.ids.filter((id) => !Object.hasOwn(tried, id));
    log(`[regen] ${name}: ${resolved.ids.length - left.length} id(s) not runnable here stay due (tried this chain)`);
    resolved.ids = left;
    if (!left.length) resolved.mode = 'none';
    else if (resolved.mode !== 'ids') resolved.mode = 'ids';
  }
  if (resolved.mode === 'none') { log(`[regen] ${name}: 0 changed`); return false; }
  const why = resolved.reasons['*'] ?? [...new Set(Object.values(resolved.reasons).flat())].slice(0, 6);
  log(`[regen] ${name}: ${resolved.mode} ${resolved.ids.length} id(s) (${why.join('; ')})`);
  if (DRY) {
    const chunks = definition.device === 'gpu' ? gpuChunks(definition, resolved.ids).map((chunk) => chunk.length) : null;
    if (chunks) log(`[regen] ${name}: would run ${chunks.length} browser chunk(s) of ${chunks.join(', ')} id(s) (at most ${browserIdCap(definition.tool)} per browser, ${definition.chunkS} s per hold)`);
    summary.runs.push({ step: name, mode: resolved.mode, count: resolved.ids.length, ids: resolved.ids, dryRun: true, ...(chunks ? { chunks } : {}) });
    return false;
  }
  const scoped = resolved.mode === 'ids' ? resolved.ids : null;
  const inKeys = Object.fromEntries((scoped ?? state.ids).map((id) => [id, state.inKey(name, id)]));
  if (!state.steps[name].decomposed) log(`[regen] ${name}: not decomposable (${state.steps[name].reasons.join('; ')})`);
  const started = Date.now();
  const run = definition.device === 'gpu' ? await runGpuStep(definition, scoped, state) : await runCpuStep(definition, scoped, state);
  const seconds = Math.round((Date.now() - started) / 1000);
  // (268) the ids the tool reported it could not run are named apart: nothing of theirs was regenerated
  summary.runs.push({ step: name, mode: resolved.mode, count: (scoped ?? state.ids).length, ids: scoped ?? ['*'], seconds, code: run.code,
    ...(Object.keys(run.skipped ?? {}).length ? { notRun: Object.keys(run.skipped).sort() } : {}) });
  saveSummary();
  if (run.code !== 0) throw new Error(`${name} failed (exit ${run.code}); output in ${run.out ?? qaDir}`);
  // --ids with no table: the rows are not recorded (a partial table would mark every other id unrecorded)
  if (IDS && !TABLE_CURRENT) { log(`[regen] ${name}: done in ${seconds} s (rows not recorded: ${UNRECORDED})`); return true; }
  const after = await fresh();
  manifest = readManifest(root) ?? manifest;
  const afterView = viewOf(definition, after);
  if (!afterView) throw new Error(`${name}: the world rows no longer read after the run (${after.errors.join('; ')})`);
  const skipped = run.skipped ?? {};
  // (268) each one the step can name (steps.mjs `stamp`: an absent or unpinned input, a page error) is stamped with its
  // reason, so it reads current until what would make it runnable moves; one it cannot name stays due
  const stamps = {}, unnamed = [];
  for (const [id, why] of Object.entries(skipped)) {
    const stamp = typeof why === 'string' && why.trim() ? definition.stamp?.(why) : null;
    if (stamp) stamps[id] = { ...stamp, reason: why };
    else unnamed.push(`${id} (${why || 'no reason'})`);
  }
  if (Object.keys(skipped).length) {
    Object.assign(notRunHere[name] ??= {}, skipped);
    log(`[regen] ${name}: ${Object.keys(skipped).length} id(s) not run here: ${Object.keys(stamps).length} stamped`
      + `${unnamed.length ? `, ${unnamed.length} left due (no stamp names the reason): ${unnamed.slice(0, 6).join(', ')}` : ''}`);
  }
  recordStep(manifest, name, scoped, stampedInKeys(state, afterView, name, inKeys), afterView, { skip: new Set(Object.keys(skipped)), stamps });
  persist(after, [name]);
  log(`[regen] ${name}: done in ${seconds} s`);
  return true;
}

async function aggregates(list, label) {
  for (const [tool, ...extra] of list) {
    const run = await runChild([tool, ...extra, ...(CHECK ? ['--check'] : [])], { niced: true, timeoutS: 600, label: `${label}-${tool.split('/').pop()}` });
    if (run.code !== 0) throw new Error(`${tool} failed (exit ${run.code})`);
  }
}

/**
 * The pages built from the steps this chain ran (steps.mjs DEPENDENTS): a dependent whose `after` step ran (or whose
 * earlier dependent wrote) runs its check, and when that finds its output stale its write and the check again. In a dry
 * run each one that would be checked is listed.
 */
async function dependents() {
  const moved = new Set(summary.runs.filter((run) => run.code === 0 || run.dryRun).map((run) => run.step));
  for (const dependent of DEPENDENTS) {
    const after = dependent.after.filter((name) => moved.has(name));
    if (!after.length) continue;
    const entry = { step: dependent.name, after };
    summary.dependents.push(entry);
    if (DRY) { log(`[regen] ${dependent.name}: would check ${dependent.tool} (after ${after.join(', ')})`); entry.dryRun = true; moved.add(dependent.name); continue; }
    const check = () => runChild([dependent.tool, ...dependent.check], { niced: true, timeoutS: 900, label: `${dependent.name}-check` });
    if ((await check()).code === 0) { log(`[regen] ${dependent.name}: current (after ${after.join(', ')})`); entry.wrote = false; continue; }
    const write = await runChild([dependent.tool, ...dependent.write], { niced: true, timeoutS: 900, label: dependent.name });
    if (write.code !== 0) throw new Error(`${dependent.name} failed (exit ${write.code}); output in ${write.out}`);
    const recheck = await check();
    if (recheck.code !== 0) throw new Error(`${dependent.name}: still stale after ${dependent.write.join(' ')}; output in ${recheck.out}`);
    log(`[regen] ${dependent.name}: rewritten (after ${after.join(', ')})`);
    entry.wrote = true;
    moved.add(dependent.name);
    saveSummary();
  }
}

async function cpuFixpoint(firstPassFull) {
  if (IDS) {
    // the fixpoint over the ids alone: one pass without a table (nothing to resolve against)
    for (let pass = 1; pass <= MAX_PASSES; pass++) {
      summary.passes++;
      let moved = false;
      for (const name of CPU_FIXPOINT_STEPS.filter(selected)) if (await step(name, { restrict: !(firstPassFull && pass === 1) })) moved = true;
      if (!moved || !TABLE_CURRENT) return;
    }
    return;
  }
  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    summary.passes++;
    let moved = false;
    for (const name of CPU_FIXPOINT_STEPS.filter(selected)) {
      if (await step(name, { forceFull: firstPassFull && pass === 1 })) moved = true;
    }
    if (!moved) return;
  }
  const state = await fresh();
  const left = resolveChanged(state, readManifest(root), { steps: CPU_FIXPOINT_STEPS.filter(selected) });
  const moving = Object.entries(left).filter(([, entry]) => entry.mode !== 'none');
  if (moving.length && !DRY) {
    throw new Error(`CPU steps still moving after ${MAX_PASSES} passes: ${moving.map(([name, entry]) => `${name}[${entry.ids.slice(0, 8).join(',')}]`).join(' ')}`);
  }
}

/** Run one step's check form (`check` on the whole fleet, `checkScoped(ids)` on some); resolves with the child's result. */
async function runCheck(definition, ids) {
  const flags = definition.checkFlags ?? definition.flags;
  const scope = ids ? definition.checkScoped(ids) : definition.check;
  const runArgs = [definition.checkTool ?? definition.tool, ...flags, ...scope];
  const label = `${definition.name}-check${ids ? '-ids' : ''}`;
  if (definition.device === 'gpu') {
    // (round 2 U38) the check child carries the hold's token too, as runGpuStep's children do
    return runInCaptureHold((env) => runChild(runArgs, { niced: false, timeoutS: 1200, label, env }), { label: `regen ${label}`, baseEnv: childEnv, log });
  }
  await gate(definition.gb);
  return runChild(runArgs, { niced: true, timeoutS: timeoutFor(definition, ids?.length ?? (definition.universe === 'maps' ? 40 : 220)), label });
}

/** --verify: each step's check on exactly the ids this chain ran it on (the whole fleet when it ran full). */
async function verifyRuns() {
  for (const definition of [...STEPS, ...WORLD_STEPS]) {
    const runs = summary.runs.filter((run) => run.step === definition.name && run.code === 0 && !run.dryRun);
    if (!runs.length) continue;
    const whole = runs.some((run) => run.ids.includes('*'));
    const ids = whole ? null : [...new Set(runs.flatMap((run) => run.ids))];
    if (!(whole ? definition.check : definition.checkScoped)) {
      log(`[regen] verify ${definition.name}: no check form`); summary.verify.push({ step: definition.name, check: 'none' }); continue;
    }
    const started = Date.now();
    const run = await runCheck(definition, ids);
    const seconds = Math.round((Date.now() - started) / 1000);
    summary.verify.push({ step: definition.name, ids: ids ?? ['*'], check: run.code === 0 ? 'pass' : 'fail', code: run.code, seconds });
    log(`[regen] verify ${definition.name} (${ids ? `${ids.length} id(s)` : 'whole fleet'}): ${run.code === 0 ? 'PASS' : `FAIL (${run.out})`} in ${seconds} s`);
  }
  const failed = summary.verify.filter((entry) => entry.check === 'fail');
  if (failed.length) throw new Error(`verify failed: ${failed.map((entry) => entry.step).join(', ')}`);
}

async function checkAll() {
  // Nightly: each step's whole-fleet --check (no writes). Steps without a check form are listed, not skipped silently.
  await aggregates(PRE_AGGREGATES, 'pre');
  for (const definition of [...STEPS, ...(NO_WORLD ? [] : WORLD_STEPS)].filter((entry) => selected(entry.name) && (!NO_GPU || entry.device !== 'gpu'))) {
    if (!definition.check) { log(`[regen] ${definition.name}: no --check form (compare with a scratch --all run)`); summary.runs.push({ step: definition.name, check: 'none' }); continue; }
    const run = await runCheck(definition, null);
    summary.runs.push({ step: definition.name, check: run.code === 0 ? 'pass' : 'fail', code: run.code });
    log(`[regen] ${definition.name} --check: ${run.code === 0 ? 'PASS' : `FAIL (${run.out})`}`);
  }
  await aggregates(POST_AGGREGATES, 'post');
  for (const dependent of DEPENDENTS) {
    const run = await runChild([dependent.tool, ...dependent.check], { niced: true, timeoutS: 900, label: `${dependent.name}-check` });
    summary.dependents.push({ step: dependent.name, check: run.code === 0 ? 'pass' : 'fail', code: run.code });
    log(`[regen] ${dependent.name} check: ${run.code === 0 ? 'PASS' : `FAIL (${run.out})`}`);
  }
  const state = await fresh();
  summary.final = { ...resolveChanged(state, readManifest(root)),
    ...(state.world && !NO_WORLD ? resolveChanged(state.world, readManifest(root), { steps: WORLD_NAMES.filter(selected) }) : {}) };
  const failed = [...summary.runs, ...summary.dependents].filter((run) => run.check === 'fail');
  if (failed.length) throw new Error(`--check failed: ${failed.map((run) => run.step).join(', ')}`);
}

// Steps after the CPU fixpoint (the geometry ledger measures settled builds) and the GPU steps, in table order.
const AFTER_STEPS = STEPS.filter((entry) => entry.device === 'cpu' && entry.after).map((entry) => entry.name);
const GPU_STEPS = STEPS.filter((entry) => entry.device === 'gpu').map((entry) => entry.name);
async function afterSteps(forceFull) {
  for (const name of AFTER_STEPS.filter(selected)) await step(name, { forceFull, restrict: !forceFull });
}

const started = Date.now();
try {
  if (IDS) {
    const roster = (await fresh()).ids; // one read, not one per id
    const unknown = IDS.filter((id) => !roster.includes(id));
    if (unknown.length) throw Object.assign(new Error(`--ids names ids the roster does not hold: ${unknown.join(', ')}`), { refusal: true });
    if (TABLE_PRESENT && !TABLE_CURRENT) log(`[regen] --ids: ${UNRECORDED}; these ids run and no rows are recorded`);
  }
  // A table recorded on another toolchain marks every id on every step: a plain run would plan the fleet as surely as
  // no table at all (266: the bootstrap's 576f5e32ebc3c262 was taken on Homebrew's Node 26, which a login shell finds first).
  if (!ALL && !CHECK && !IDS && RECORDED?.toolchain && RECORDED.toolchain !== TOOLCHAIN.toolchain) {
    throw Object.assign(new Error(`the fingerprints table was recorded on another toolchain (${RECORDED.toolchain}; this run ${TOOLCHAIN.toolchain}: `
      + `${toolchainChange(RECORDED, TOOLCHAIN.parts)}), so every id would be marked: run on the table's (Node from .nvmrc: nvm use), `
      + 'pass --ids=<ids> for a lane-scoped regen (rows not recorded), or --all to re-record'), { refusal: true });
  }
  if (CHECK) await checkAll();
  else {
    if (!DRY) await aggregates(PRE_AGGREGATES, 'pre');
    await cpuFixpoint(ALL || !!IDS);
    await afterSteps(ALL || !!IDS);
    if (!DRY) await aggregates(POST_AGGREGATES, 'post');
    // A GPU step can write a table every build reads (centering: the presentation anchors), so after each one that ran
    // the CPU steps and the ledger are re-resolved (a no-op when it moved nothing), and the GPU steps repeat until a round
    // runs none, at most --max-passes rounds.
    if (!NO_GPU) for (let round = 1; round <= MAX_PASSES; round++) {
      let ran = false;
      for (const name of GPU_STEPS.filter(selected)) {
        if (!await step(name, { forceFull: ALL && round === 1, restrict: round > 1 })) continue;
        ran = true;
        // --ids: the CPU steps run again only after a GPU step whose tables a build reads (centering's anchors); one read
        // per GPU step that ran, not one per output
        if (IDS) {
          const { buildReadTables } = await fresh();
          if (!stepByName(name).outputs.some((output) => buildReadTables.includes(output))) continue;
        }
        await cpuFixpoint(false);
        await afterSteps(false);
      }
      if (!ran || DRY || IDS) break;
    }
    await dependents();
    // The world steps last: a wreck donor's build reads the fleet's settled rows. A pass that moves nothing ends it (a
    // wreck plan whose donors changed re-keys its own map and its collision shards once more).
    if (!NO_WORLD && WORLD_NAMES.some(selected)) for (let pass = 1; pass <= MAX_PASSES; pass++) {
      let moved = false;
      for (const name of WORLD_NAMES.filter(selected)) if (await step(name, { forceFull: ALL && pass === 1, restrict: pass > 1 })) moved = true;
      if (!moved || DRY || IDS) break;
    }
    const state = await fresh();
    const names = STEPS.filter((entry) => selected(entry.name) && (!NO_GPU || entry.device !== 'gpu')).map((entry) => entry.name);
    const worldNames = NO_WORLD ? [] : WORLD_NAMES.filter(selected);
    if (worldNames.length && !state.world) throw new Error(`this tree has no world rows (${state.errors.join('; ') || 'no map registry'})`);
    summary.final = { ...resolveChanged(state, readManifest(root), { steps: names }),
      ...(worldNames.length ? resolveChanged(state.world, readManifest(root), { steps: worldNames }) : {}) };
    if (IDS) {
      // --ids answers for its own ids (and the maps it ran): other ids may still be due, which the plain chain resolves
      const mine = new Set([...IDS, ...summary.runs.filter((run) => WORLD_NAMES.includes(run.step)).flatMap((run) => run.ids)]);
      for (const [name, entry] of Object.entries(summary.final)) {
        const ids = TABLE_CURRENT ? entry.ids.filter((id) => mine.has(id)) : [];
        summary.final[name] = { mode: ids.length ? 'ids' : 'none', ids, reasons: {}, ...(TABLE_CURRENT ? {} : { unrecorded: true }) };
      }
      if (!TABLE_CURRENT) log(`[regen] ${UNRECORDED}: no rows recorded, no final resolve; run the release check for these ids next`);
    }
    // ids a tool could not run in this checkout stay due without failing the chain; the summary names them
    for (const [name, tried] of Object.entries(notRunHere)) {
      const entry = summary.final[name];
      if (!entry || entry.mode === 'none') continue;
      const notRunnable = entry.ids.filter((id) => Object.hasOwn(tried, id));
      if (!notRunnable.length) continue;
      entry.notRunHere = Object.fromEntries(notRunnable.map((id) => [id, tried[id]]));
      entry.ids = entry.ids.filter((id) => !Object.hasOwn(tried, id));
      if (!entry.ids.length) entry.mode = 'none';
      log(`[regen] final ${name}: ${notRunnable.length} id(s) not runnable here stay due (${notRunnable.slice(0, 6).join(', ')})`);
    }
    const open = Object.entries(summary.final).filter(([, entry]) => entry.mode !== 'none');
    for (const [name, entry] of Object.entries(summary.final)) {
      const stamped = Object.keys(entry.stamped ?? {}).length;
      log(`[regen] final ${name}: ${entry.mode} ${entry.ids.length}${stamped ? ` (${stamped} stamped not runnable here)` : ''}`);
    }
    if (open.length && !DRY) throw new Error(`final resolve not empty: ${open.map(([name, entry]) => `${name}=${entry.ids.length}`).join(' ')}`);
    if (VERIFY && !DRY) await verifyRuns();
    // The release check takes the union of the tank ids this chain regenerated (every id when a step ran whole-fleet).
    const ran = summary.runs.filter((run) => (run.code === 0 || run.dryRun) && !WORLD_NAMES.includes(run.step));
    summary.changedMaps = [...new Set(summary.runs.filter((run) => WORLD_NAMES.includes(run.step) && (run.code === 0 || run.dryRun))
      .flatMap((run) => run.ids))].sort();
    summary.changedIds = ran.some((run) => run.ids.includes('*')) ? ['*']
      : [...new Set(ran.flatMap((run) => run.ids.filter((id) => !run.notRun?.includes(id))))].sort();
    if (summary.changedIds.length && !summary.changedIds.includes('*')) {
      log(`[regen] release check for the regenerated ids: npm run tank:release:check -- --ids=${summary.changedIds.join(',')} --gate`);
    }
  }
  summary.seconds = Math.round((Date.now() - started) / 1000);
  summary.ok = true;
  log(`[regen] ${DRY ? 'dry run' : 'done'} in ${summary.seconds} s`);
} catch (error) {
  summary.seconds = Math.round((Date.now() - started) / 1000);
  summary.ok = false; summary.error = String(error.message ?? error);
  if (children.stopping || isChainStop(error)) {
    // (round 8 Y10 s6-06) the stop ended what was in flight (a step's child, a rows read) or refused what came next: no
    // failure; stopOnSignal exits 128 + the signal's number once the child groups have closed
    summary.stopped = children.stopping ?? error.signal;
    log(`[regen] stopped by ${summary.stopped}: ${summary.error}`);
  } else {
    log(`[regen] FAILED: ${summary.error}`);
    process.exitCode = error.refusal ? 2 : 1; // a refusal ran nothing
  }
} finally {
  saveSummary();
}
