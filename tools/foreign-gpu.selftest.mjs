// (2026-11-25, tree-breakdown-277) The frame-budget probe's foreign-GPU reading, its run gate, and the taint marking.
// probe-fresh-browser-276's second A/A of one dist had two samples at +164 % and +71 % GPU while the 1-min load stayed
// under 15. Each lined up with another program's GPU process, which the load average cannot see. foreignGpuCpu also
// counted the probe's own GPU process as foreign: it left out only the probe's direct children, and Chrome's GPU process
// is a grandchild (probe -> Chrome -> GPU).
//   Stub `ps` rows: the probe's own GPU process at any depth is its own; a sibling session's, the user's browser's, and
//   one whose parent chain loops are foreign. The gate (fake clock) waits for a quiet 10 s window, waits out a busy
//   spell, and gives up at its limit. A stubbed probe run in which one slot sees foreign GPU taints that slot and the
//   report marks its pair. The planted control is the old direct-child rule, and the own-tree judgement must fail it.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFrameReport, foreignGpuCpu, gpuWindow, parseCpuRows, parseFrameProbeArgs, runFrameProbe, waitForQuietGpu } from './frame-budget-probe.mjs';

const PROBE = 70000;
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/** A `ps -axo pid=,ppid=,pcpu=,command=` table: the probe's tree, a sibling session's probe, the user's browser, a loop. */
const PS = [
  [1, 0, 0, 'launchd'],
  [69000, 1, 0.5, 'zsh'],
  [PROBE, 69000, 12, 'node tools/frame-budget-probe.mjs'],
  [PROBE + 1, PROBE, 3, `${chrome} --headless=new`],
  [PROBE + 2, PROBE + 1, 40, `${chrome} Helper (GPU) --type=gpu-process`], // own: a grandchild
  [PROBE + 3, PROBE + 2, 1, 'chrome_crashpad_handler'],
  [PROBE + 4, PROBE + 3, 6, `${chrome} Helper (GPU) --type=gpu-process (deeper)`], // own: four levels down
  [80000, 1, 10, 'node tools/frame-budget-probe.mjs (another session)'],
  [80001, 80000, 2, `${chrome} --headless=new`],
  [80002, 80001, 55, `${chrome} Helper (GPU) --type=gpu-process`], // foreign: a sibling session's
  [90000, 1, 4, `${chrome}`],
  [90001, 90000, 20, `${chrome} Helper (GPU) --type=gpu-process`], // foreign: the user's browser
  [95000, 95001, 1, 'a'],
  [95001, 95000, 7, `${chrome} Helper (GPU) --type=gpu-process (parent loop)`], // foreign: its chain loops, never reaches the probe
].map(([pid, ppid, cpu, command]) => `${String(pid).padStart(6)} ${String(ppid).padStart(6)} ${cpu.toFixed(1).padStart(5)} ${command}`).join('\n');

/** The judgement: the probe's GPU processes at any depth are its own; every other GPU process is foreign. Returns failures. */
function judgeOwnTree(reading) {
  const failures = [];
  if (reading.cpu !== 82) failures.push(`foreign GPU ${reading.cpu}% over ${reading.processes} process(es), not the sibling's 55 + the browser's 20 + the loop's 7`);
  if (reading.processes !== 3) failures.push(`${reading.processes} foreign GPU processes, not 3`);
  if (reading.own?.cpu !== 46 || reading.own?.processes !== 2) failures.push(`own ${JSON.stringify(reading.own)}, not 46% over the grandchild and the deeper one`);
  return failures;
}

const failed = [];
const check = async (name, body) => { try { await body(); console.log(`ok ${name}`); } catch (error) { failed.push(`${name}: ${String(error?.message ?? error).split('\n')[0]}`); } };

await check('the probe\'s own GPU processes at any depth are its own; a sibling session\'s is foreign', () => {
  const rows = parseCpuRows(PS);
  assert.equal(rows.length, 14);
  assert.deepEqual(judgeOwnTree(foreignGpuCpu({ rows, ownPid: PROBE })), []);
  // seen from the sibling session, the probe's GPU processes are the foreign ones
  const sibling = foreignGpuCpu({ rows, ownPid: 80000 });
  assert.deepEqual([sibling.cpu, sibling.processes, sibling.own.cpu], [73, 4, 55]);
});

await check('planted control: the old direct-child rule counts the grandchild as foreign', () => {
  const rows = parseCpuRows(PS);
  let cpu = 0, processes = 0;
  for (const r of rows) if (/--type=gpu-process/.test(r.command) && r.ppid !== PROBE) { cpu += r.cpu; processes++; }
  const failures = judgeOwnTree({ cpu, processes, own: { cpu: 0, processes: 0 } });
  assert.ok(failures.some((f) => /not the sibling/.test(f)), `the judgement flags the old rule (${failures.join('; ') || 'nothing'})`);
});

await check('the window: full after 10 s; one over-limit 10 s mean taints, a brief spike inside a quiet window does not', () => {
  const w = gpuWindow({ limit: 25, windowMs: 10_000 });
  for (let t = 0; t <= 20_000; t += 2000) w.add(t, t === 12_000 ? 90 : 5); // a spike: its 5-sample window means 22
  assert.equal(w.summary().tainted, false, `a 2 s spike in a quiet window (${w.summary().maxWindowMean}%)`);
  for (let t = 22_000; t <= 34_000; t += 2000) w.add(t, 60);
  assert.equal(w.summary().tainted, true);
  assert.equal(w.summary().max, 90);
  assert.equal(gpuWindow({ limit: 0 }).summary().tainted, false, 'a limit of 0 never taints');
  assert.equal(gpuWindow({ limit: 25 }).add(0, -1), null, 'detection unavailable');
});

/** The gate on a fake clock: `series(t)` is the foreign GPU CPU at t ms. */
async function gate(series, { limit = 25, maxWaitMs = 60_000 } = {}) {
  let t = 0;
  return waitForQuietGpu({ limit, maxWaitMs, sample: () => ({ cpu: series(t) }), now: () => t, pause: async (ms) => { t += ms; } });
}

await check('the gate: quiet after one window; waits out a busy spell; gives up at its limit; off at 0', async () => {
  assert.deepEqual(await gate(() => 3), { quiet: true, waitedMs: 10_000, mean: 3 });
  const busyThenQuiet = await gate((t) => (t < 20_000 ? 80 : 2));
  assert.ok(busyThenQuiet.quiet && busyThenQuiet.waitedMs > 20_000 && busyThenQuiet.waitedMs <= 30_000 && busyThenQuiet.mean <= 25, JSON.stringify(busyThenQuiet));
  assert.deepEqual(await gate(() => 80, { maxWaitMs: 30_000 }), { quiet: false, waitedMs: 30_000, mean: 80 });
  assert.deepEqual(await gate(() => 80, { limit: 0 }), { quiet: true, waitedMs: 0, skipped: 'off' });
  assert.equal((await gate(() => -1)).skipped, 'unavailable');
});

const dirs = [];
await check('a probe run: the slot that saw foreign GPU is tainted, and the report marks its pair only', async () => {
  const out = mkdtempSync(join(tmpdir(), 'cot-foreign-gpu-')), root = mkdtempSync(join(tmpdir(), 'cot-foreign-gpu-root-'));
  dirs.push(out, root);
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'dist', 'index.html'), '');
  const options = { ...parseFrameProbeArgs([`--roots=${root},${root}`, '--labels=a1,a2', '--maps=ruinspires', '--pattern=ABBA', `--out=${out}`,
    '--scene-check=off', '--tag=t']), gpuWindowMs: 40 };
  let busy = false;
  const gates = [];
  const sample = { viewport: '1600x900', view: 'chase', result: null, summary: null };
  const measure = async (_open, _options, slot) => {
    busy = slot.key.includes('-s1-'); // another program takes the GPU while s1 measures
    await new Promise((resolve) => { setTimeout(resolve, 200); });
    busy = false;
    return { mapId: slot.mapId, readyMs: 0, entryMs: 0, scene: null, pageErrors: [], samples: [{ ...sample }] };
  };
  const log = console.log;
  console.log = () => {};
  try {
    await runFrameProbe(options, { acquireLocks: async () => ({ signal: new AbortController().signal, refresh() { return true; }, release: async () => {} }),
      openServer: async () => ({ close: async () => {} }), launchBrowser: async () => ({ close: async () => {} }), guardOf: () => null, measure,
      gpuSample: () => ({ cpu: busy ? 90 : 3, processes: 1 }), gpuEveryMs: 5,
      quietGpu: async (o) => { gates.push(o.limit); return { quiet: true, waitedMs: 0, mean: 3 }; } });
  } finally { console.log = log; }
  assert.deepEqual(gates, [25, 25, 25, 25], 'every slot passes the gate at the default limit first');
  const records = ['s0-a1', 's1-a2', 's2-a2', 's3-a1'].map((k) => JSON.parse(readFileSync(join(out, `t-ruinspires-${k}.json`), 'utf8')));
  assert.deepEqual(records.map((r) => r.foreignGpu?.tainted), [false, true, false, false], JSON.stringify(records.map((r) => r.foreignGpu ?? r.failed)));
  // the report over the same records, each given a frame so the row exists
  const frame = { gpuFrame: { med: 20, p25: 17 }, cpuFrame: { med: 5 }, calls: { med: 322 }, tris: { med: 3721004 }, interval: { med: 16 } };
  const withFrames = records.map((r) => ({ ...r, samples: [{ ...sample, summary: frame, scene: { calls: 259, tris: 3721004 } }] }));
  const row = Object.values(buildFrameReport(withFrames, ['a1', 'a2']))[0];
  assert.equal(row.tainted?.length, 1, `one tainted pair (${JSON.stringify(row.tainted)})`);
  assert.match(row.tainted[0], /^a1 s0 \/ a2 s1 \(foreign GPU \d+(\.\d)?%\)$/);
});

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
if (failed.length) {
  console.error(`foreign-gpu: ${failed.length} failed\n- ${failed.join('\n- ')}`);
  process.exit(1);
}
console.log('foreign-gpu: own tree at any depth, quiet-GPU gate, tainted pairs marked, control caught — ok');
