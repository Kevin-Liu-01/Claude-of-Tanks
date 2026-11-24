// (2026-11-24, tree-breakdown-277) The browser guard names what its tree peak is made of. probe-fresh-browser-276's A/A
// on one dist saw fresh browsers' tree peaks rise 8.7 -> 9.4 GB slot by slot while their renderers stayed flat, and the
// guard could not say which process grew. It now keeps, at its tree-peak sample, MB per Chrome process type and the
// largest processes (treeBreakdown), with the caller's companions beside the tree (the probe's vite server), and
// frame-budget-probe prints it on each slot's line (formatTreePeak).
//   Stub process samples (ps rows, no browser) through the real measureTree -> treeBreakdown -> notePeakSample path:
//   the breakdown sums each type and leaves out processes outside the tree; a series that climbs in the GPU process,
//   peaks, then falls keeps the peak sample's breakdown and companions, and two fresh trees' peaks name the type that
//   grew. The planted control keeps the LAST sample's breakdown instead of the peak's: the peak judgement must fail it.
import assert from 'node:assert/strict';
import { measureTree, notePeakSample, parsePsRows, treeBreakdown } from './browser-launch.mjs';
import { formatTreePeak } from './frame-budget-probe.mjs';

const ROOT = 41000;
const KB = 1024;

/** One `ps -o pid=,pgid=,ppid=,rss=,command=` sample of a stub Chrome tree (MB per process), plus an outsider. */
function psSample({ browser = 300, gpu = 3000, renderer = 4000, renderer2 = 120, utility = 90, crashpad = 8, outsider = 5000 } = {}) {
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const rows = [
    [ROOT, ROOT, 1, browser, `${chrome} --headless=new --remote-debugging-pipe`],
    [ROOT + 1, ROOT, ROOT, gpu, `${chrome} Helper (GPU) --type=gpu-process --use-angle=metal`],
    [ROOT + 2, ROOT, ROOT, renderer, `${chrome} Helper (Renderer) --type=renderer --renderer-client-id=5`],
    [ROOT + 3, ROOT, ROOT, renderer2, `${chrome} Helper (Renderer) --type=renderer --renderer-client-id=6`],
    [ROOT + 4, ROOT, ROOT, utility, `${chrome} Helper --type=utility --utility-sub-type=network.mojom.NetworkService`],
    // a descendant in a process group of its own is still the tree's
    [ROOT + 5, ROOT + 5, ROOT + 1, crashpad, `${chrome} chrome_crashpad_handler --type=crashpad-handler`],
    // another browser on the machine is not
    [52000, 52000, 1, outsider, `${chrome} --type=gpu-process (another tool's)`],
  ];
  return parsePsRows(rows.map(([pid, pgid, ppid, mb, command]) => `${pid} ${pgid} ${ppid} ${mb * KB} ${command}`).join('\n'));
}

const freshGuard = () => ({ peakRendererMb: 0, peakTreeMb: 0, peakBreakdown: null, peakCompanionsMb: {} });

/** The judgement: the guard's breakdown is the tree-peak sample's (its total, types and companions). Returns failures. */
function judgePeakBreakdown(guard, samples) {
  const failures = [];
  const peak = samples.reduce((a, b) => (b.sample.treeMb > a.sample.treeMb ? b : a));
  const want = { ...treeBreakdown(peak.sample), companionsMb: peak.companionsMb };
  if (guard.peakBreakdown?.treeMb !== Math.round(guard.peakTreeMb)) {
    failures.push(`breakdown total ${guard.peakBreakdown?.treeMb} MB is not the tree peak ${Math.round(guard.peakTreeMb)} MB`);
  }
  try { assert.deepEqual(guard.peakBreakdown, want); } catch { failures.push(`breakdown ${JSON.stringify(guard.peakBreakdown)} is not the peak sample's ${JSON.stringify(want)}`); }
  return failures;
}

/** A guard's run over a series of (sample, companions); `note` is the peak update under test. */
function run(series, note = notePeakSample) {
  const guard = freshGuard();
  const samples = series.map(([ps, companionsMb]) => ({ sample: measureTree(ps, ROOT), companionsMb }));
  for (const { sample, companionsMb } of samples) note(guard, sample, companionsMb);
  return { guard, samples };
}

const failed = [];
const check = (name, body) => { try { body(); console.log(`ok ${name}`); } catch (error) { failed.push(`${name}: ${String(error?.message ?? error).split('\n')[0]}`); } };

check('a sample breaks down by process type, the outsider left out', () => {
  const b = treeBreakdown(measureTree(psSample(), ROOT));
  assert.deepEqual(b.byType, { browser: 300, 'gpu-process': 3000, renderer: 4120, utility: 90, 'crashpad-handler': 8 });
  assert.equal(b.treeMb, 7518, 'the total is the tree, without the other browser');
  assert.equal(Object.values(b.byType).reduce((a, mb) => a + mb, 0), b.treeMb, 'the types add up to the tree');
  assert.deepEqual(b.top, [{ pid: ROOT + 2, type: 'renderer', mb: 4000 }, { pid: ROOT + 1, type: 'gpu-process', mb: 3000 },
    { pid: ROOT, type: 'browser', mb: 300 }], 'the largest processes, largest first');
});

// the GPU process climbs, peaks at the third sample, then falls; the renderer stays flat; vite moves on its own
const series = [
  [psSample({ gpu: 3000 }), { vite: 380 }],
  [psSample({ gpu: 3600 }), { vite: 395 }],
  [psSample({ gpu: 4400 }), { vite: 402 }],
  [psSample({ gpu: 3200 }), { vite: 420 }],
];

check('the guard keeps the tree-peak sample\'s breakdown and companions', () => {
  const { guard, samples } = run(series);
  assert.deepEqual(judgePeakBreakdown(guard, samples), []);
  assert.equal(guard.peakBreakdown.byType['gpu-process'], 4400, 'the peak names the GPU process at its height');
  assert.deepEqual(guard.peakBreakdown.companionsMb, { vite: 402 }, 'vite as it was at the tree peak');
  assert.deepEqual(guard.peakCompanionsMb, { vite: 420 }, 'and its own peak beside it');
  assert.equal(guard.peakRendererMb, 4000);
});

check('two fresh trees\' peaks name the type that grew', () => {
  const first = run([[psSample({ gpu: 3000 }), { vite: 400 }]]).guard;
  const later = run([[psSample({ gpu: 3700 }), { vite: 410 }]]).guard;
  const grew = Object.keys(later.peakBreakdown.byType)
    .map((type) => [type, later.peakBreakdown.byType[type] - (first.peakBreakdown.byType[type] ?? 0)])
    .filter(([, mb]) => mb > 0);
  assert.deepEqual(grew, [['gpu-process', 700]], 'the climb outside the renderer has a name');
});

check('the slot line prints the breakdown, largest first, then vite', () => {
  const { guard } = run(series);
  const record = { peakTreeMb: Math.round(guard.peakTreeMb), peakBreakdown: guard.peakBreakdown };
  assert.equal(formatTreePeak([{ peakTreeMb: 100, peakBreakdown: null }, record]),
    '8.71 GB (gpu-process 4.30, renderer 4.02, browser 0.29, utility 0.09, crashpad-handler 0.01; vite 0.39)');
  assert.equal(formatTreePeak([{ peakTreeMb: 2048 }]), '2.00 GB', 'a record without a breakdown keeps the bare peak');
  assert.equal(formatTreePeak([{ peakTreeMb: null, unwatched: true }]), 'unwatched');
});

check('planted control: the last sample\'s breakdown, not the peak\'s', () => {
  const lastWins = (guard, sample, companionsMb) => {
    notePeakSample(guard, sample, companionsMb);
    guard.peakBreakdown = { ...treeBreakdown(sample), companionsMb };
  };
  const { guard, samples } = run(series, lastWins);
  const failures = judgePeakBreakdown(guard, samples);
  assert.ok(failures.some((f) => /is not the tree peak/.test(f)), `the judgement flags the wrong sample (${failures.join('; ') || 'nothing'})`);
});

if (failed.length) {
  console.error(`tree-breakdown: ${failed.length} failed\n- ${failed.join('\n- ')}`);
  process.exit(1);
}
console.log('tree-breakdown: per-type breakdown at the tree peak, vite beside it, control caught — ok');
