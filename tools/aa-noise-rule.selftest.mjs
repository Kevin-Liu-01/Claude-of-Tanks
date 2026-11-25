// (2026-11-25, tree-breakdown-277) The frame-budget report's A/A noise rule. Same-dist A/A runs on ruinspires desktop
// read up to +21.7 % at chase 1080p from one ABBA (two pairs), and a +9 % verdict at that view had come from one ABBA.
// The rule: the report states each view's A/A spread beside its delta. A delta of fewer than four pairs inside the spread
// is inconclusive, never a pass or a fail, and so is one within twice the spread of the caller's bar.
//   judgeDelta over the cases: inside the spread with two pairs; near the bar with two pairs, and with four; clear of
//   the bar either way; no bar; no spread on record. aaNoiseFor: this map's spread, else another map's widest at the
//   same view, named. judgeReport on a built report: the noise and the verdicts land on the row; a VOID or TAINTED row
//   is judged as such. The committed table parses and names every view the probe measures by default.
//   Planted control: a judge that passes or fails a two-pair delta inside the spread. The rule's judgement must catch it.
import assert from 'node:assert/strict';
import { AA_NOISE_FILE, MIN_PAIRS_NEAR_BAR, aaNoiseFor, buildFrameReport, judgeDelta, judgeReport, readAaNoise } from './frame-budget-probe.mjs';

const failed = [];
const check = (name, body) => { try { body(); console.log(`ok ${name}`); } catch (error) { failed.push(`${name}: ${String(error?.message ?? error).split('\n')[0]}`); } };

/** The rule's judgement over a judge: every case's verdict as the rule wants it. Returns failures. */
function judgeTheJudge(judge) {
  const cases = [
    // [delta, spread, pairs, bar, wanted]
    [9, 21.7, 2, null, 'inconclusive'], // the +9 % single ABBA at chase 1080p
    [9, 21.7, 2, 5, 'inconclusive'],
    [-3, 6, 2, 5, 'inconclusive'], // inside the spread
    [14, 6, 2, 5, 'inconclusive'], // outside the spread, but within 2x the spread of the bar
    [14, 6, 4, 5, 'fail'], // the same delta with four pairs is judged
    [1.7, 6, 4, 5, 'pass'],
    [30, 6, 2, 5, 'fail'], // clear of the bar by more than 2x the spread
    [-20, 6, 2, 5, 'pass'],
    [12, 6, 2, null, 'outside-noise'],
    [3, 6, 4, null, 'inside-noise'],
    [9, null, 2, 5, 'unjudged'],
    [null, 6, 2, 5, 'unjudged'],
  ];
  const failures = [];
  for (const [delta, spread, pairs, bar, wanted] of cases) {
    const got = judge({ delta, spread, pairs, bar }).verdict;
    if (got !== wanted) failures.push(`delta ${delta} spread ${spread} pairs ${pairs} bar ${bar}: ${got}, wanted ${wanted}`);
  }
  return failures;
}

check('judgeDelta: inside the spread or near the bar with fewer than four pairs is inconclusive', () => {
  assert.equal(MIN_PAIRS_NEAR_BAR, 4);
  assert.deepEqual(judgeTheJudge(judgeDelta), []);
});

check('planted control: a judge that passes or fails a two-pair delta inside the spread is caught', () => {
  const eager = ({ delta, spread, pairs, bar }) => (bar !== null && Number.isFinite(delta) && spread >= 0 ? { verdict: delta > bar ? 'fail' : 'pass' } : judgeDelta({ delta, spread, pairs, bar }));
  const failures = judgeTheJudge(eager);
  assert.ok(failures.some((f) => /^delta 9 spread 21.7 pairs 2 bar 5: fail/.test(f)), `the +9 % single ABBA is flagged (${failures.join('; ') || 'nothing'})`);
});

const NOISE = { views: [
  { map: 'ruinspires', tier: 'desktop', viewport: '1920x1080', view: 'chase', gpuFramePct: 21.7, gpuFrameP25Pct: 15.8, cpuFrameMs: 1.1, abbas: 5 },
  { map: 'verdant', tier: 'desktop', viewport: '1920x1080', view: 'chase', gpuFramePct: 8, gpuFrameP25Pct: 7, cpuFrameMs: 0.5, abbas: 3 },
  { map: 'ruinspires', tier: 'desktop', viewport: '1600x900', view: 'chase', gpuFramePct: 3.2, gpuFrameP25Pct: 2.5, cpuFrameMs: 0.95, abbas: 5 },
] };

check('aaNoiseFor: this map\'s spread, else the widest other map\'s at the same view, named; else null', () => {
  assert.equal(aaNoiseFor(NOISE, { mapId: 'verdant', viewport: '1920x1080', view: 'chase' }).gpuFramePct, 8);
  const stand = aaNoiseFor(NOISE, { mapId: 'monsoon', viewport: '1920x1080', view: 'chase' });
  assert.equal(stand.gpuFramePct, 21.7);
  assert.equal(stand.from, 'ruinspires (no A/A of monsoon on record)');
  assert.equal(aaNoiseFor(NOISE, { mapId: 'ruinspires', viewport: '1920x1080', view: 'centre-far' }), null);
  assert.equal(aaNoiseFor(NOISE, { mapId: 'ruinspires', viewport: '1920x1080', view: 'chase', tier: 'phone' }), null);
});

/** A slot record with one chase 1080p sample of `gpu` ms (p25 = gpu - 3, CPU 5 ms). */
const slot = (label, order, gpu, extra = {}) => ({ mapId: 'ruinspires', label, key: `ruinspires-s${order}-${label}`, ...extra,
  samples: [{ viewport: '1920x1080', view: 'chase', scene: { calls: 259, tris: 3721004 },
    summary: { gpuFrame: { med: gpu, p25: gpu - 3 }, cpuFrame: { med: 5 }, calls: { med: 322 }, tris: { med: 3721004 }, interval: { med: 16.7 } } }] });

check('judgeReport: the row carries its noise and verdicts; one ABBA of +9 % at chase 1080p is inconclusive', () => {
  const report = judgeReport(buildFrameReport([slot('base', 0, 22), slot('new', 1, 24), slot('new', 2, 24), slot('base', 3, 22)], ['base', 'new']),
    { noise: NOISE, barPct: 5 });
  const row = Object.values(report)[0];
  assert.deepEqual(row.noise, { from: 'ruinspires', abbas: 5, gpuFramePct: 21.7, gpuFrameP25Pct: 15.8, cpuFrameMs: 1.1 });
  assert.equal(row.judgement.gpuFrame.delta, 9.1);
  assert.equal(row.judgement.gpuFrame.pairs, 2);
  assert.equal(row.judgement.gpuFrame.verdict, 'inconclusive');
  assert.equal(row.judgement.cpuFrame.verdict, 'inconclusive');
});

check('judgeReport: four pairs clear of the spread are judged against the bar; VOID and TAINTED rows are not', () => {
  const four = [slot('base', 0, 20), slot('new', 1, 30), slot('new', 2, 30), slot('base', 3, 20), slot('base', 4, 20), slot('new', 5, 30), slot('new', 6, 30), slot('base', 7, 20)];
  const row = Object.values(judgeReport(buildFrameReport(four, ['base', 'new']), { noise: NOISE, barPct: 5 }))[0];
  assert.equal(row.judgement.gpuFrame.pairs, 4);
  assert.equal(row.judgement.gpuFrame.verdict, 'fail');
  const tainted = four.map((r, i) => (i === 1 ? { ...r, foreignGpu: { tainted: true, during: { maxWindowMean: 80 } } } : r));
  assert.equal(Object.values(judgeReport(buildFrameReport(tainted, ['base', 'new']), { noise: NOISE, barPct: 5 }))[0].judgement.gpuFrame.verdict, 'tainted');
  const voided = four.map((r, i) => (i === 2 ? { ...r, void: 'the scene changed mid-run' } : r));
  assert.equal(Object.values(judgeReport(buildFrameReport(voided, ['base', 'new']), { noise: NOISE, barPct: 5 }))[0].judgement.gpuFrame.verdict, 'void');
});

check('the committed A/A table parses and covers the probe\'s default views on ruinspires desktop', () => {
  const noise = readAaNoise(AA_NOISE_FILE);
  assert.equal(noise.protocol, 'frame-budget-aa-noise-v1');
  for (const viewport of ['1600x900', '1920x1080']) {
    for (const view of ['chase', 'centre-far']) {
      const n = aaNoiseFor(noise, { mapId: 'ruinspires', viewport, view });
      assert.ok(n && n.gpuFramePct > 0 && n.gpuFrameP25Pct > 0 && n.cpuFrameMs > 0 && n.abbas >= 2, `${viewport} ${view}: ${JSON.stringify(n)}`);
    }
  }
  assert.deepEqual(readAaNoise(new URL('./no-such-aa-noise.json', import.meta.url)), { views: [] }, 'a missing table judges nothing');
});

if (failed.length) {
  console.error(`aa-noise-rule: ${failed.length} failed\n- ${failed.join('\n- ')}`);
  process.exit(1);
}
console.log('aa-noise-rule: inconclusive inside the A/A spread or near the bar under four pairs, noise on every row, control caught — ok');
