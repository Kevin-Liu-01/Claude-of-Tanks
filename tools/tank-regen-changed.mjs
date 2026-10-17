#!/usr/bin/env node
// Regenerate only what changed: the fleet generators in dependency order, each on the tank ids whose inputs or outputs
// moved since it last ran (tools/changed-ids.mjs), to a fixpoint. First-party tooling: Kevin B. Liu.
//
//   npm run tank:regen:changed                      # changed ids only (CPU steps, ledger, manual, GPU steps)
//   npm run tank:regen:changed -- --dry-run         # print what would run and why
//   npm run tank:regen:changed -- --all             # every step on the whole fleet first (bootstrap, explicit full)
//   npm run tank:regen:changed -- --check --all     # nightly: every step's whole-fleet --check; writes nothing
//   options: --steps=controls,fills  --no-gpu  --jobs=4 (parallel fill parts)  --max-passes=3
//
// Order: aggregates that feed the shared core (paint catalog, legacy specs); then the CPU fixpoint, at most
// --max-passes passes over controls, fills, seats, spare-track, anatomy, marking (seats read the fills and roof guns,
// missionDockSeats feeds the spare-track dock keep-out); the geometry ledger; the manual reference; then centering and
// icons under the capture lock in holds of at most 20 minutes. Centering moves the presentation anchors every build
// reads, so the CPU fixpoint runs again for any id they moved. Each step's keys are written to
// release/fingerprints.tsv as soon as it finishes (inKeys taken before the run, outKeys after), so the chain resumes
// after a crash. The final resolve must report 0 changed for every step; otherwise the chain fails and names the ids.
//
// Resource rules: every CPU child runs `nice -n 10 node --max-old-space-size=4096` after `headroom can-start --gb N`,
// with a wall-clock limit that kills only that child; GPU children are not niced and run inside the capture lock.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { emptyManifest, computeState, readManifest, recordStep, refreshComponents, resolveChanged, writeManifest }
  from './changed-only/fingerprint.mjs';
import { CPU_FIXPOINT_STEPS, POST_AGGREGATES, PRE_AGGREGATES, STEPS, stepByName } from './changed-only/steps.mjs';

const args = process.argv.slice(2);
const value = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const ALL = args.includes('--all'), CHECK = args.includes('--check'), DRY = args.includes('--dry-run');
const NO_GPU = args.includes('--no-gpu');
const JOBS = Math.max(1, Number(value('jobs') ?? 4) | 0);
const MAX_PASSES = Math.max(1, Number(value('max-passes') ?? 3) | 0);
const ONLY = value('steps')?.split(',').filter(Boolean) ?? null;
const root = resolve(value('root') ?? process.cwd());
const qaDir = join(root, '.qa-dev/changed-only');
mkdirSync(qaDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const logPath = join(qaDir, `${stamp}.log`);
const summary = { stamp, root, mode: CHECK ? 'check' : ALL ? 'all' : 'changed', dryRun: DRY, runs: [], passes: 0, final: null };
const log = (line) => { console.log(line); appendFileSync(logPath, `${line}\n`); };
const selected = (name) => !ONLY || ONLY.includes(name);
for (const name of ONLY ?? []) if (!stepByName(name)) throw new Error(`unknown step ${name}`);
// Flags that make a tool read a file the step key cannot see (a git revision, a hints file) are refused.
for (const step of STEPS) if (step.flags.some((flag) => /^--(?:uniform-from|hints)\b/.test(flag))) {
  throw new Error(`${step.name}: ${step.flags.join(' ')} reads an unkeyed input; the chain never passes it`);
}

// One chain per tree.
const lockPath = join(qaDir, 'chain.lock');
if (existsSync(lockPath)) {
  const pid = Number(readFileSync(lockPath, 'utf8'));
  let alive = false;
  try { process.kill(pid, 0); alive = true; } catch (error) { alive = error.code === 'EPERM'; }
  if (alive) { console.error(`[regen] another chain (pid ${pid}) holds ${lockPath}`); process.exit(2); }
}
writeFileSync(lockPath, String(process.pid));
const unlock = () => { try { if (readFileSync(lockPath, 'utf8') === String(process.pid)) renameSync(lockPath, `${lockPath}.done`); } catch {} };
process.on('exit', unlock);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { unlock(); process.exit(130); });

const childEnv = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' };

function headroomReady(gb) {
  const probe = spawnSync('headroom', ['can-start', '--gb', String(gb)], { encoding: 'utf8' });
  if (probe.error?.code === 'ENOENT') return true; // no headroom on this machine
  return probe.status === 0;
}
async function gate(gb) {
  const started = Date.now();
  while (!headroomReady(gb)) {
    if (Date.now() - started > 4 * 3600_000) throw new Error(`headroom never allowed ${gb} GB in 4 h`);
    log(`[regen] waiting for headroom (${gb} GB)`);
    await new Promise((done) => setTimeout(done, 30_000));
  }
}

/** Run one child; resolves with its exit code. A timeout kills exactly that child (TERM, then KILL after 15 s). */
function runChild(argv, { niced, timeoutS, label }) {
  return new Promise((done) => {
    const command = niced ? 'nice' : process.execPath;
    const fullArgs = niced ? ['-n', '10', process.execPath, ...argv] : argv;
    log(`[regen] ${label}: ${niced ? 'nice -n 10 ' : ''}node ${argv.join(' ').slice(0, 400)}`);
    const out = join(qaDir, `${stamp}-${label.replace(/[^\w.-]+/g, '_')}.out`);
    const child = spawn(command, fullArgs, { cwd: root, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    const sink = (chunk) => appendFileSync(out, chunk);
    child.stdout.on('data', sink); child.stderr.on('data', sink);
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      log(`[regen] ${label}: wall-clock limit ${timeoutS} s; stopping pid ${child.pid}`);
      try { process.kill(child.pid, 'SIGTERM'); } catch {}
      setTimeout(() => { try { process.kill(child.pid, 'SIGKILL'); } catch {} }, 15_000).unref();
    }, timeoutS * 1000);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      done({ code: killed ? 124 : code ?? (signal ? 128 : 1), out });
    });
  });
}

const timeoutFor = (step, count) => Math.round(step.timeoutS + step.perIdS * count);

/** Run a CPU step on `ids` (null: whole fleet). Fills run as parallel parts merged by the tool itself. */
async function runCpuStep(step, ids, state) {
  const count = ids?.length ?? state.ids.length;
  const scopedArgs = ids ? step.scoped(ids) : step.full;
  if (step.name === 'fills' && count >= 8 && JOBS > 1) {
    const parts = Math.min(JOBS, Math.ceil(count / 4));
    const all = ids ?? Object.keys(state.groupById); // --all fills every fleet-manifest id
    const scratch = mkdtempSync(join(tmpdir(), 'cot-fills-parts-'));
    const lists = Array.from({ length: parts }, () => []);
    all.forEach((id, index) => lists[index % parts].push(id));
    const runs = await Promise.all(lists.map(async (list, k) => {
      await gate(step.gb);
      const dir = join(scratch, `part${k}`);
      return runChild([step.tool, ...step.flags, `--ids=${list.join(',')}`, `--out-dir=${dir}`, `--loader=${join(dir, 'loader.ts')}`],
        { niced: true, timeoutS: timeoutFor(step, list.length), label: `fills-part${k}` });
    }));
    const failed = runs.find((run) => run.code !== 0);
    if (failed) return failed;
    const dirs = lists.map((_, k) => join(scratch, `part${k}`)).join(',');
    await gate(step.gb);
    return runChild([step.tool, ...step.flags, ...scopedArgs, `--merge-from=${dirs}`], { niced: true, timeoutS: 900, label: 'fills-merge' });
  }
  const extra = [];
  let jsonPath = null;
  if (step.report) extra.push(`${step.report}=${join(qaDir, `${stamp}-${step.name}-report.json`)}`);
  if (step.json) { jsonPath = join(qaDir, `${stamp}-${step.name}-${Date.now()}.json`); extra.push(`${step.json}=${jsonPath}`); }
  await gate(step.gb);
  const run = await runChild([step.tool, ...step.flags, ...scopedArgs, ...extra], { niced: true, timeoutS: timeoutFor(step, count), label: step.name });
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

/** Run a GPU step on `ids` in capture-lock holds of at most step.chunkS seconds of estimated work. */
async function runGpuStep(step, ids, state) {
  const { createCaptureLock } = await import('./capture-lock.mjs');
  const list = ids ?? state.ids;
  const perChunk = Math.max(1, Math.floor(step.chunkS / step.perIdS));
  const chunks = [];
  // A whole-fleet run is chunked too; the chunks together cover every id, written by the tool's own --ids merge.
  for (let index = 0; index < list.length; index += perChunk) chunks.push(list.slice(index, index + perChunk));
  for (const [index, chunk] of chunks.entries()) {
    const lock = createCaptureLock();
    log(`[regen] ${step.name}: waiting for the capture lock (chunk ${index + 1}/${chunks.length}, ${chunk.length} ids)`);
    await lock.acquire(Number(process.env.COT_SHOTS_LOCK_TIMEOUT_MS) || 3 * 3600_000);
    const refresh = setInterval(() => lock.refresh(), 60_000);
    try {
      await gate(step.gb);
      const run = await runChild([step.tool, ...step.flags, ...step.scoped(chunk)],
        { niced: false, timeoutS: Math.min(1200, timeoutFor(step, chunk.length)), label: `${step.name}-${index + 1}` });
      if (run.code !== 0) return run;
    } finally { clearInterval(refresh); lock.release(); }
  }
  return { code: 0 };
}

let manifest = readManifest(root) ?? emptyManifest();
const persist = (state) => { refreshComponents(manifest, state); writeManifest(root, manifest); };
const fresh = () => computeState({ root, steps: STEPS, env: childEnv });

/** Resolve and run one step; returns true when it ran (its keys may have moved others). */
async function step(name, { forceFull = false } = {}) {
  const definition = stepByName(name);
  const state = fresh();
  const resolved = forceFull ? { mode: 'full', ids: [...state.ids], reasons: { '*': ['--all'] } }
    : resolveChanged(state, readManifest(root), { steps: [name] })[name];
  if (resolved.mode === 'none') { log(`[regen] ${name}: 0 changed`); return false; }
  const why = resolved.reasons['*'] ?? [...new Set(Object.values(resolved.reasons).flat())].slice(0, 6);
  log(`[regen] ${name}: ${resolved.mode} ${resolved.ids.length} id(s) (${why.join('; ')})`);
  if (DRY) { summary.runs.push({ step: name, mode: resolved.mode, count: resolved.ids.length, ids: resolved.ids, dryRun: true }); return false; }
  const scoped = resolved.mode === 'ids' ? resolved.ids : null;
  const inKeys = Object.fromEntries((scoped ?? state.ids).map((id) => [id, state.inKey(name, id)]));
  if (!state.steps[name].decomposed) log(`[regen] ${name}: not decomposable (${state.steps[name].reasons.join('; ')})`);
  const started = Date.now();
  const run = definition.device === 'gpu' ? await runGpuStep(definition, scoped, state) : await runCpuStep(definition, scoped, state);
  const seconds = Math.round((Date.now() - started) / 1000);
  summary.runs.push({ step: name, mode: resolved.mode, count: (scoped ?? state.ids).length, ids: scoped ?? ['*'], seconds, code: run.code });
  if (run.code !== 0) throw new Error(`${name} failed (exit ${run.code}); output in ${run.out ?? qaDir}`);
  const after = fresh();
  manifest = readManifest(root) ?? manifest;
  recordStep(manifest, name, scoped, inKeys, after);
  persist(after);
  log(`[regen] ${name}: done in ${seconds} s`);
  return true;
}

async function aggregates(list, label) {
  for (const [tool, ...extra] of list) {
    const run = await runChild([tool, ...extra, ...(CHECK ? ['--check'] : [])], { niced: true, timeoutS: 600, label: `${label}-${tool.split('/').pop()}` });
    if (run.code !== 0) throw new Error(`${tool} failed (exit ${run.code})`);
  }
}

async function cpuFixpoint(firstPassFull) {
  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    summary.passes++;
    let moved = false;
    for (const name of CPU_FIXPOINT_STEPS.filter(selected)) {
      if (await step(name, { forceFull: firstPassFull && pass === 1 })) moved = true;
    }
    if (!moved) return;
  }
  const state = fresh();
  const left = resolveChanged(state, readManifest(root), { steps: CPU_FIXPOINT_STEPS.filter(selected) });
  const moving = Object.entries(left).filter(([, entry]) => entry.mode !== 'none');
  if (moving.length && !DRY) {
    throw new Error(`CPU steps still moving after ${MAX_PASSES} passes: ${moving.map(([name, entry]) => `${name}[${entry.ids.slice(0, 8).join(',')}]`).join(' ')}`);
  }
}

async function checkAll() {
  // Nightly: each step's whole-fleet --check (no writes). Steps without a check form are listed, not skipped silently.
  await aggregates(PRE_AGGREGATES, 'pre');
  for (const definition of STEPS.filter((entry) => selected(entry.name) && (!NO_GPU || entry.device !== 'gpu'))) {
    if (!definition.check) { log(`[regen] ${definition.name}: no --check form (compare with a scratch --all run)`); summary.runs.push({ step: definition.name, check: 'none' }); continue; }
    const flags = definition.checkFlags ?? definition.flags;
    const runArgs = [definition.tool, ...flags, ...definition.check];
    let run;
    if (definition.device === 'gpu') {
      const { createCaptureLock } = await import('./capture-lock.mjs');
      const lock = createCaptureLock();
      await lock.acquire(Number(process.env.COT_SHOTS_LOCK_TIMEOUT_MS) || 3 * 3600_000);
      try { run = await runChild(runArgs, { niced: false, timeoutS: 1200, label: `${definition.name}-check` }); }
      finally { lock.release(); }
    } else {
      await gate(definition.gb);
      run = await runChild(runArgs, { niced: true, timeoutS: timeoutFor(definition, 220), label: `${definition.name}-check` });
    }
    summary.runs.push({ step: definition.name, check: run.code === 0 ? 'pass' : 'fail', code: run.code });
    log(`[regen] ${definition.name} --check: ${run.code === 0 ? 'PASS' : `FAIL (${run.out})`}`);
  }
  await aggregates(POST_AGGREGATES, 'post');
  const state = fresh();
  summary.final = resolveChanged(state, readManifest(root));
}

const started = Date.now();
try {
  if (CHECK) await checkAll();
  else {
    if (!DRY) await aggregates(PRE_AGGREGATES, 'pre');
    await cpuFixpoint(ALL);
    if (selected('ledger')) await step('ledger', { forceFull: ALL });
    if (!DRY) await aggregates(POST_AGGREGATES, 'post');
    if (!NO_GPU) {
      const ranCentering = selected('centering') && await step('centering', { forceFull: ALL });
      // The anchors are read by every build: re-key the CPU steps and the ledger for any id they moved.
      if (ranCentering) { await cpuFixpoint(false); if (selected('ledger')) await step('ledger'); }
      if (selected('icons')) await step('icons', { forceFull: ALL });
    }
    const state = fresh();
    const names = STEPS.filter((entry) => selected(entry.name) && (!NO_GPU || entry.device !== 'gpu')).map((entry) => entry.name);
    summary.final = resolveChanged(state, readManifest(root), { steps: names });
    const open = Object.entries(summary.final).filter(([, entry]) => entry.mode !== 'none');
    for (const [name, entry] of Object.entries(summary.final)) log(`[regen] final ${name}: ${entry.mode} ${entry.ids.length}`);
    if (open.length && !DRY) throw new Error(`final resolve not empty: ${open.map(([name, entry]) => `${name}=${entry.ids.length}`).join(' ')}`);
  }
  summary.seconds = Math.round((Date.now() - started) / 1000);
  summary.ok = true;
  log(`[regen] ${DRY ? 'dry run' : 'done'} in ${summary.seconds} s`);
} catch (error) {
  summary.seconds = Math.round((Date.now() - started) / 1000);
  summary.ok = false; summary.error = String(error.message ?? error);
  log(`[regen] FAILED: ${summary.error}`);
  process.exitCode = 1;
} finally {
  writeFileSync(join(qaDir, `${stamp}.json`), `${JSON.stringify(summary, null, 1)}\n`);
}
