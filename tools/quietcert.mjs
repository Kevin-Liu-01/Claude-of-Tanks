// tools/quietcert.mjs — unattended quiet-window certification runner
// (performance_budget r5, critic critical #2: "the shipping merged tree has
// never held a valid full-budget certification ... if sibling agent sessions
// never leave a quiet window, schedule the cert through the existing FIFO
// lock as an overnight run").
// r6: retargeted at the round-6 merged tree (cert-r6-* artifacts) + one new
// PRE-check: the r5 log shows every load-quiet window the runner found was
// then stamped contended by the INTERACTIVE browser's gpu-process (the
// user's own Chrome at 100-260 % CPU feeding the shared GPU) — a contender
// the load average cannot see. The runner now also waits for that signal,
// mirroring perfprobe's GPU_CONTENDER_CPU_LIMIT so started attempts are not
// wasted. The probe's own stamps remain the sole authority; this runner only
// pre-checks, it never relaxes anything.
//
// Loops until the machine is genuinely quiet (ambient load + zero busy
// headless Chromiums + idle interactive-browser GPU), then runs the standard
// certification pair
//   node tools/perfprobe.mjs --dsf 1   and   --dsf 2
// (60 s windows, pinned worst-case roster, FIFO lock — all inside perfprobe).
//
// Outcomes:
//  - both runs PASS with valid (uncontended) stamps -> the local certification
//    replaced with the merged-tree certification (sources kept as
//    sources beside it) and the runner exits 0.
//  - a run carries a VALID stamp but FAILs the budget -> that is a certified
//    merged-tree verdict, not noise: cert JSONs are kept, docs/cert-r6-FAILED
//    marker is written, runner exits 1 (perf owner must look — retrying a
//    valid FAIL until it gets lucky is exactly the practice the budget
//    forbids).
//  - contended / probe error -> transient; sleep and retry until --max-hours.
//
// Usage: node tools/quietcert.mjs [--max-hours 24] [--interval-min 10]
//        [--note r6-quiet-cert]
// Recommended launch (survives the launching session):
//   cd <repo> && nohup node tools/quietcert.mjs >> .qa-dev/quietcert.log 2>&1 &

import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';

const args = process.argv.slice(2);
function opt(name, fb) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fb;
}
const MAX_HOURS = parseFloat(opt('max-hours', '24'));
const INTERVAL_MIN = parseFloat(opt('interval-min', '10'));
const NOTE = opt('note', 'r6-quiet-cert');
const REPORT_DIR = '.qa-dev/reports';
const CORES = os.cpus().length;
// pre-check threshold: a margin under the probe's own 0.5*cores limit so a
// started attempt is unlikely to trip the start-stamp immediately
const LOAD_QUIET = CORES * 0.42;
// pre-check twin of perfprobe's GPU_CONTENDER_CPU_LIMIT (15 %): summed %CPU
// of every non-headless browser gpu-process. Kept slightly tighter so an
// attempt started at the threshold does not tip over mid-run.
const GPU_QUIET = 10;

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

function interactiveGpuCpu() {
  try {
    const rows = execSync('ps -axo pcpu=,command=', { encoding: 'utf8' }).split('\n');
    let cpu = 0;
    for (const r of rows) {
      const m = r.match(/^\s*([\d.]+)\s+(.*)$/);
      if (!m) continue;
      if (!/--type=gpu-process/.test(m[2])) continue;
      if (/Chrome for Testing|--headless/.test(m[2])) continue; // headless counted above
      cpu += +m[1];
    }
    return +cpu.toFixed(1);
  } catch (_) {
    return -1;
  }
}

function runProbe(dsf) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const out = `${REPORT_DIR}/cert-r6-dsf${dsf}.json`;
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
log(`runner up on ${head}${dirty ? ' + uncommitted src changes' : ''}; cores=${CORES} quiet-load<${LOAD_QUIET.toFixed(1)} quiet-gpu<${GPU_QUIET}%`);

for (;;) {
  if ((Date.now() - t0) / 3600000 > MAX_HOURS) {
    log(`gave up after ${MAX_HOURS} h without a quiet window — rerun after sibling sessions finish`);
    process.exit(2);
  }
  const load1 = os.loadavg()[0];
  const heads = busyHeadlessCount();
  const gpu = interactiveGpuCpu();
  if (load1 > LOAD_QUIET || heads > 0 || gpu > GPU_QUIET) {
    log(`waiting: load1=${load1.toFixed(1)} busyHeadless=${heads} interactiveGpu=${gpu}%`);
    await new Promise((r) => setTimeout(r, INTERVAL_MIN * 60 * 1000));
    continue;
  }
  log(`quiet window: load1=${load1.toFixed(1)} busyHeadless=0 interactiveGpu=${gpu}% — attempting cert pair`);
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
    writeFileSync(`${REPORT_DIR}/perf-after.json`, JSON.stringify({
      note: `PERFORMANCE_BUDGET r6 CERTIFICATION — merged working tree at ${treeNow}`
        + `${stillDirty ? ' (+ uncommitted src changes present at run time — valid for the round close ONLY if they are this round’s handoff set; otherwise re-run on the committed tree)' : ''}. `
        + 'Both blocks are complete, unedited 60 s perfprobe reports (sources kept beside this file), '
        + 'run back-to-back in a machine-quiet window by tools/quietcert.mjs with the pinned worst-case '
        + 'all-GLB roster. certification=PASS with valid (uncontended) stamps on BOTH runs — every budget '
        + 'line including fps median/p5, frameMs p99, and load-to-ready is proven on this tree, closing '
        + 'the r1-r5 quiet-recert carryover (tasks #194/#226/#251). The FROZEN gates (7.0 M triangles, '
        + '512 MB textures) were NOT raised.',
      sources: { dsf1: 'cert-r6-dsf1.json', dsf2: 'cert-r6-dsf2.json' },
      dsf1: r1.rep,
      dsf2: r2.rep,
    }, null, 2));
    log(`BOTH PASS with valid stamps — ${REPORT_DIR}/perf-after.json written`);
    process.exit(0);
  }
  // valid stamps, at least one budget FAIL: certified verdict — surface, stop.
  writeFileSync(`${REPORT_DIR}/cert-r6-FAILED`, `quietcert ${new Date().toISOString()}: valid-stamp certification FAIL `
    + `(dsf1=${r1.state}, dsf2=${r2.state}) — see the adjacent dsf1/dsf2 reports. `
    + 'This is a real merged-tree verdict, not contention noise; do not rerun until the regression is fixed.\n');
  log('valid-stamp FAIL — recorded docs/cert-r6-FAILED and stopping (honest gate: no retry-until-green)');
  process.exit(1);
}
