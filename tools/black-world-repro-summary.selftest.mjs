// black-world-repro-summary.selftest.mjs — the repro summary's arithmetic (black-screen-228): a frame is BLACK-WORLD at
// the part's zero share (0.8 of the world region exactly 0, the owner's frame 0.812), control and injected frames never
// count as natural, the longest stretch is consecutive samples, guard incidents on natural runs are counted, and every
// injected fault lands in the heal table with its class, rung and latency.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { formatSummary, frameIsBlack, longestBlackRun, naturalFrames, sampleCoverage, summarizeParts } from './black-world-repro-summary.mjs';

const frame = (at, zeroFrac, extra = {}) => ({ at, mean: zeroFrac > 0.5 ? 1 : 80, blackFrac: zeroFrac, zeroFrac, st: { hud: true }, ...extra });

assert.equal(frameIsBlack(frame(0, 0.812)), true, "the owner's frame is black");
assert.equal(frameIsBlack(frame(0, 0.79)), false, 'under the zero share');
assert.equal(frameIsBlack({ ...frame(0, 0.95), st: { hud: false } }), false, 'no HUD: a loading or menu frame');
assert.equal(frameIsBlack(frame(0, 0.6), 0.5), true, "a part's own threshold");
assert.equal(longestBlackRun([frame(0, 0.9), frame(1, 0.9), frame(2, 0.1), frame(3, 0.9)]), 2);
assert.equal(naturalFrames([frame(0, 0.9, { ctl: true }), frame(1, 0.1)]).length, 1, 'control frames are never natural');
assert.equal(naturalFrames([frame(0, 0.9, { st: { hud: true, camMask: 2 ** 30 } })], true).length, 0, 'an old control part by its mask');

// a window is watched only with enough readable samples spread over it (a detached page's 100 errors are not a pass)
const detached = Array.from({ length: 100 }, (_, i) => ({ at: i * 0.25, error: 'Execution context is not available in detached frame' }));
assert.equal(sampleCoverage(detached, 25).ok, false, 'every grab failed: unwatched');
assert.equal(sampleCoverage(detached, 25).errors, 100);
assert.equal(sampleCoverage(Array.from({ length: 30 }, (_, i) => frame(i * 0.8, 0.01)), 25).ok, true, '30 samples over 23.2 s');
assert.equal(sampleCoverage(Array.from({ length: 30 }, (_, i) => frame(i * 0.25, 0.01)), 25).ok, false, 'samples over 7 s of 25');
assert.equal(sampleCoverage([frame(0, 0.01), frame(24, 0.01)], 25).ok, false, 'two samples are not a watch');
assert.equal(sampleCoverage([frame(1, 0.01), frame(6, 0.01), frame(22, 0.01)], 25).maxGapS, 16, 'the largest gap between samples');

const root = mkdtempSync(path.join(tmpdir(), 'bwr-summary-'));
try {
  const write = (name, summary, rows) => {
    const dir = mkdtempSync(path.join(root, `${name}-`));
    writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary));
    writeFileSync(path.join(dir, 'report.jsonl'), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
    return dir;
  };
  const healthy = Array.from({ length: 20 }, (_, i) => frame(i * 0.25, 0.01));
  const blackRun = [...healthy.slice(0, 5), frame(1.25, 0.84), frame(1.5, 0.83), frame(1.75, 0.02)];
  const cold = write('cold', { target: 'dev', scenario: 'cold', drive: true, dsf: 2, intervalMs: 250, seconds: 5, zeroFrac: 0.8, runs: [
    { label: '001', map: 'badlands', verdict: 'ok', guard: { incidents: 0 } },
    { label: '002', map: 'badlands', verdict: 'BLACK-WORLD', guard: { incidents: 1, receipts: [{ class: 'camera-layer-mask', healedBy: 'H1' }] } },
    { label: '003', map: 'badlands', verdict: 'harness-error' },
    { label: '004', map: 'verdant', verdict: 'ok', guard: { incidents: 0 } },
    { label: '005', map: 'verdant', verdict: 'ok', guard: { incidents: 0 } },
  ] }, [
    { label: '001', frames: healthy, scenePass: { presentedEmptyInWindow: 0 } }, { label: '002', frames: blackRun, scenePass: { presentedEmptyInWindow: 3 } },
    { label: '003' }, { label: '004', frames: healthy }, { label: '005', frames: detached.slice(0, 20) },
  ]);
  const heal = write('heal', { target: 'dev', scenario: 'session', drive: true, dsf: 2, intervalMs: 250, seconds: 5, runs: [
    { label: '001', map: 'badlands', action: 'boot', verdict: 'ok', guard: { incidents: 0 } },
    { label: '002', map: 'badlands', action: 'inject-layers', verdict: 'ok' },
    { label: '003', map: 'badlands', action: 'inject-persist-layers-5', verdict: 'ok' },
  ] }, [
    { label: '001', frames: healthy },
    { label: '002', frames: [frame(0, 0.99, { ctl: true })], guardHeal: { receipts: [{ class: 'camera-layer-mask', healedBy: 'H1', steps: ['H1'],
      openedAfterMs: 90, healedAfterMs: 160 }], tinySizes: 0, passErrors: [] } },
    { label: '003', frames: [frame(0, 0.99, { ctl: true })], guardHeal: { receipts: [{ class: 'camera-layer-mask', healedBy: 'H1',
      steps: ['H1', 'H2', 'H3', 'H4(skipped)'], repeats: 40, openedAfterMs: 95, healedAfterMs: 120 }], tinySizes: 0, passErrors: [] } },
  ]);
  const { table, injections, totals } = summarizeParts([cold, heal, path.join(root, 'missing')]);
  const badlands = table.find((row) => row.map === 'badlands' && row.scenario === 'cold+drive');
  assert.equal(badlands.runs, 2, 'harness errors are not runs');
  assert.equal(badlands.errors, 1);
  assert.equal(badlands.black, 1);
  assert.equal(badlands.blackFrames, 2);
  assert.equal(badlands.longestS, 0.5, 'two consecutive samples at 250 ms');
  assert.deepEqual(badlands.firstAt, [1.25]);
  assert.equal(badlands.incidents, 1);
  assert.deepEqual(badlands.incidentClasses, ['camera-layer-mask:H1']);
  assert.equal(badlands.emptyPassFrames, 3, 'the presented empty scene passes in the windows');
  const verdant = table.find((row) => row.map === 'verdant');
  assert.equal(verdant.black, 0);
  assert.equal(verdant.runs, 1, 'an unwatched window is not a run');
  assert.equal(verdant.errors, 1);
  assert.equal(verdant.unwatched, 1);
  const session = table.find((row) => row.scenario === 'session+drive');
  assert.equal(session.runs, 1, 'the injected rows never count as natural runs');
  assert.equal(totals.runs, 4);
  assert.equal(totals.black, 1);
  assert.equal(totals.incidents, 1);
  assert.equal(injections.length, 2);
  assert.deepEqual(injections.map((row) => [row.fault, row.class, row.healedBy, row.healedAfterMs]),
    [['layers', 'camera-layer-mask', 'H1', 160], ['persist-layers-5', 'camera-layer-mask', 'H1', 120]]);
  assert.equal(injections[1].repeats, 40);
  const text = formatSummary({ table, injections, totals });
  assert.match(text, /total: 1 BLACK-WORLD runs of 4 \(2 harness errors, 1 of them unwatched windows\); 2 black frames of 68; 3 presented empty scene-pass frames; 1 guard incidents on natural runs/);
  assert.match(text, /\| layers \| camera-layer-mask \| H1 \| H1 \| 90 \| 160 \| 160 \|/);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('black-world-repro-summary.selftest: the zero-share verdict, natural frames, watched windows, longest stretch, guard incidents and the heal table');
