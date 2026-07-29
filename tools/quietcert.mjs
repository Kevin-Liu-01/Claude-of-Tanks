// tools/quietcert.mjs — unattended quiet-window certification runner
// (performance_budget r5, critic critical #2: "the shipping merged tree has
// never held a valid full-budget certification ... if sibling agent sessions
// never leave a quiet window, schedule the cert through the existing FIFO
// lock as an overnight run").
//
// Loops until the machine is genuinely quiet (ambient load + zero busy
// headless Chromiums), then runs the standard certification pair
//   node tools/perfprobe.mjs --dsf 1   and   --dsf 2
// (60 s windows, pinned worst-case roster, FIFO lock — all inside perfprobe).
// The probe's own contention stamps remain the authority: this runner only
// PRE-checks so attempts are not wasted, it never relaxes anything.
//
// Outcomes:
//  - both runs PASS with valid (uncontended) stamps -> docs/perf-after.json is
//    replaced with the merged-tree certification (sources kept as
//    docs/cert-r5-dsf1.json / -dsf2.json) and the runner exits 0.
//  - a run carries a VALID stamp but FAILs the budget -> that is a certified
//    merged-tree verdict, not noise: cert JSONs are kept, docs/cert-r5-FAILED
//    marker is written, runner exits 1 (perf owner must look — retrying a
//    valid FAIL until it gets lucky is exactly the practice the budget
//    forbids).
//  - contended / probe error -> transient; sleep and retry until --max-hours.
//
// Usage: node tools/quietcert.mjs [--max-hours 12] [--interval-min 10]
//        [--note r5-quiet-cert]
// Recommended launch (survives the launching session):
//   cd <repo> && nohup node tools/quietcert.mjs >> docs/quietcert-r5.log 2>&1 &

import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';

const args = process.argv.slice(2);
function opt(name, fb) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fb;
}
const MAX_HOURS = parseFloat(opt('max-hours', '12'));
const INTERVAL_MIN = parseFloat(opt('interval-min', '10'));
const NOTE = opt('note', 'r5-quiet-cert');
const CORES = os.cpus().length;
// pre-check threshold: a margin under the probe's own 0.5*cores limit so a
// started attempt is unlikely to trip the start-stamp immediately
const LOAD_QUIET = CORES * 0.42;

const log = (m) => console.log(`[quietcert ${new Date().toISOString()}] ${m}`);

function busyHeadlessCount() {
  try {
    const rows = execSync('ps -axo pcpu=,command=', { encoding: 'utf8' }).split('\n');
    let n = 0;
    for (const r of rows) {
      const m = r.match(/^\s*([\d.]+)\s+(.*)$/);
      if (!m) continue;
      if (!/Chrome for Testing|--headless/.test(m[2]) || !/[Cc]hrom/.test(m[2])) continue;
      if (+m[1] >= 5) n++;
    }
    return n;
  } catch (_) {
    return -1;
  }
}

function runProbe(dsf) {
  const out = `docs/cert-r5-dsf${dsf}.json`;
  log(`starting perfprobe --dsf ${dsf} (60 s cert window)`);
  const r = spawnSync('node', ['tools/perfprobe.mjs', '--dsf', String(dsf), '--note', NOTE, '--out', out],
    { stdio: ['ignore', 'ignore', 'inherit'], timeout: 30 * 60 * 1000 });
  if (r.status !== 0 || !existsSync(out)) {
    log(`probe dsf${dsf} did not produce a report (exit ${r.status}) — transient`);
    return { state: 'error' };
  }
  let rep;
  try { rep = JSON.parse(readFileSync(out, 'utf8')); } catch (_) { return { state: 'error' }; }
  const cert = rep.budget && rep.budget.certification;
  log(`probe dsf${dsf}: certification=${cert} fps=${rep.fps.median}/${rep.fps.p5} p99=${rep.frameMs.p99} tris=${rep.triangles.median} load=${rep.loadToReadyMs}`);
  if (typeof cert === 'string' && cert.startsWith('REFUSED')) return { state: 'contended' };
  return { state: cert === 'PASS' ? 'pass' : 'fail', rep };
}

const t0 = Date.now();
const head = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
const dirty = execSync('git status --porcelain -- src/ index.html', { encoding: 'utf8' }).trim() !== '';
log(`runner up on ${head}${dirty ? ' + uncommitted src changes' : ''}; cores=${CORES} quiet-load<${LOAD_QUIET.toFixed(1)}`);

for (;;) {
  if ((Date.now() - t0) / 3600000 > MAX_HOURS) {
    log(`gave up after ${MAX_HOURS} h without a quiet window — rerun after sibling sessions finish`);
    process.exit(2);
  }
  const load1 = os.loadavg()[0];
  const heads = busyHeadlessCount();
  if (load1 > LOAD_QUIET || heads > 0) {
    log(`waiting: load1=${load1.toFixed(1)} busyHeadless=${heads}`);
    await new Promise((r) => setTimeout(r, INTERVAL_MIN * 60 * 1000));
    continue;
  }
  log(`quiet window: load1=${load1.toFixed(1)} busyHeadless=0 — attempting cert pair`);
  const r1 = runProbe(1);
  if (r1.state === 'contended' || r1.state === 'error') {
    await new Promise((r) => setTimeout(r, INTERVAL_MIN * 60 * 1000));
    continue;
  }
  const r2 = runProbe(2);
  if (r2.state === 'contended' || r2.state === 'error') {
    await new Promise((r) => setTimeout(r, INTERVAL_MIN * 60 * 1000));
    continue; // dsf1 result stays on disk; the PAIR must land in one stretch
  }
  if (r1.state === 'pass' && r2.state === 'pass') {
    const treeNow = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const stillDirty = execSync('git status --porcelain -- src/ index.html', { encoding: 'utf8' }).trim() !== '';
    writeFileSync('docs/perf-after.json', JSON.stringify({
      note: `PERFORMANCE_BUDGET r5 CERTIFICATION — merged working tree at ${treeNow}`
        + `${stillDirty ? ' (+ uncommitted src changes present at run time — re-run on the committed round-close tree if they were not this round’s handoffs)' : ''}. `
        + 'Both blocks are complete, unedited 60 s perfprobe reports (sources kept beside this file), '
        + 'run back-to-back in a machine-quiet window by tools/quietcert.mjs with the pinned worst-case '
        + 'all-GLB roster. certification=PASS with valid (uncontended) stamps on BOTH runs — every budget '
        + 'line including fps median/p5, frameMs p99, and load-to-ready is proven on this tree, closing '
        + 'the r1/r2/r3 quiet-recert carryover. The FROZEN gates (7.0 M triangles, 512 MB textures) were '
        + 'NOT raised.',
      sources: { dsf1: 'cert-r5-dsf1.json', dsf2: 'cert-r5-dsf2.json' },
      dsf1: r1.rep,
      dsf2: r2.rep,
    }, null, 2));
    log('BOTH PASS with valid stamps — docs/perf-after.json replaced with merged-tree certification');
    process.exit(0);
  }
  // valid stamps, at least one budget FAIL: certified verdict — surface, stop.
  writeFileSync('docs/cert-r5-FAILED', `quietcert ${new Date().toISOString()}: valid-stamp certification FAIL `
    + `(dsf1=${r1.state}, dsf2=${r2.state}) — see docs/cert-r5-dsf1.json / -dsf2.json. `
    + 'This is a real merged-tree verdict, not contention noise; do not rerun until the regression is fixed.\n');
  log('valid-stamp FAIL — recorded docs/cert-r5-FAILED and stopping (honest gate: no retry-until-green)');
  process.exit(1);
}
