// black-world-repro-summary.selftest.mjs — the repro summary's arithmetic (black-screen-228): a frame is BLACK-WORLD at
// the part's zero share (0.8 of the world region exactly 0, the owner's frame 0.812), control and injected frames never
// count as natural, the longest stretch is consecutive samples, guard incidents on natural runs are counted, and every
// injected fault lands in the heal table with its class, rung and latency.
// Round 2 (2026-10-20, critic D3): a JPEG sample near-black past 0.8 is BLACK-WORLD (the samples never keep exact zeros),
// as is a PNG re-read past the zero share; an unwatched window still reports its guard incidents; a production build
// served on this machine is never labelled 'dev'; a fault that cleared at its own end is never a heal.
// Round 3 (2026-10-21): sun-scan rows (a day sun circled in frame) and the guard's own measured cost get their tables,
// and both rows stay natural rows (an incident in a sun scan is a false positive the totals count).
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { formatSummary, frameIsBlack, longestBlackRun, naturalFrames, sampleCoverage, summarizeParts, targetKind } from './black-world-repro-summary.mjs';

const frame = (at, zeroFrac, extra = {}) => ({ at, mean: zeroFrac > 0.5 ? 1 : 80, blackFrac: zeroFrac, zeroFrac, st: { hud: true }, ...extra });

assert.equal(frameIsBlack(frame(0, 0.812)), true, "the owner's frame is black");
assert.equal(frameIsBlack(frame(0, 0.79)), false, 'under the zero share');
assert.equal(frameIsBlack({ ...frame(0, 0.95), st: { hud: false } }), false, 'no HUD: a loading or menu frame');
assert.equal(frameIsBlack(frame(0, 0.6), 0.5), true, "a part's own threshold");
// (round 2, D3) the positive control's JPEG sample: near-black 0.98, exact-zero 0.000 (q70 keeps no exact zeros)
assert.equal(frameIsBlack({ at: 0, mean: 1, blackFrac: 0.98, zeroFrac: 0, st: { hud: true } }), true, 'a near-black JPEG sample is black');
assert.equal(frameIsBlack({ at: 0, mean: 30, blackFrac: 0.3, zeroFrac: 0, st: { hud: true } }), false, 'a dark night map is not');
assert.equal(frameIsBlack({ at: 0, mean: 9, blackFrac: 0.7, zeroFrac: 0, pngZeroFrac: 0.927, st: { hud: true } }), true, 'the PNG re-read decides');
assert.equal(targetKind({ target: 'http://127.0.0.1:4173/' }), 'local', 'a production build served here is not dev');
assert.equal(targetKind({ target: 'http://127.0.0.1:5391/', targetKind: 'dev' }), 'dev', 'the recorded build kind wins');
assert.equal(targetKind({ target: 'prod' }), 'prod');
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
    { label: '003', map: 'badlands', verdict: 'harness-error', guard: { total: 2, incidents: 1, receipts: [{ class: 'gl-masked', healedBy: 'H2' }] } },
    { label: '004', map: 'verdant', verdict: 'ok', guard: { incidents: 0 } },
    { label: '005', map: 'verdant', verdict: 'ok', guard: { incidents: 0 } },
  ] }, [
    { label: '001', frames: healthy, scenePass: { presentedEmptyInWindow: 0 } }, { label: '002', frames: blackRun, scenePass: { presentedEmptyInWindow: 3 } },
    { label: '003' }, { label: '004', frames: healthy }, { label: '005', frames: detached.slice(0, 20) },
  ]);
  const heal = write('heal', { target: 'http://127.0.0.1:5391/', targetKind: 'dev', scenario: 'session', drive: true, dsf: 2, intervalMs: 250, seconds: 5, runs: [
    { label: '001', map: 'badlands', action: 'boot', verdict: 'ok', guard: { incidents: 0 } },
    { label: '002', map: 'badlands', action: 'inject-layers', verdict: 'ok' },
    { label: '003', map: 'badlands', action: 'inject-persist-layers-5', verdict: 'ok' },
    { label: '004', map: 'badlands', action: 'inject-persist-nanscene-1', verdict: 'ok' },
    { label: '005', map: 'badlands', action: 'inject-persist-emptypass-3', verdict: 'ok' },
  ] }, [
    { label: '001', frames: healthy },
    { label: '002', frames: [frame(0, 0.99, { ctl: true })], guardHeal: { receipts: [{ class: 'camera-layer-mask', healedBy: 'H1', steps: ['H1'],
      openedAfterMs: 90, healedAfterMs: 160 }], tinySizes: 0, passErrors: [] } },
    { label: '003', frames: [frame(0, 0.99, { ctl: true })], guardHeal: { receipts: [{ class: 'camera-layer-mask', healedBy: 'H1',
      steps: ['H1', 'H2', 'H3', 'H4(skipped)'], repeats: 40, openedAfterMs: 95, healedAfterMs: 120 }], tinySizes: 0, passErrors: [] } },
    { label: '004', frames: [frame(0, 0.99, { ctl: true })], nanLanded: { target: 'scene target', nonFinite: true, px: ['NaN', 'NaN', 'NaN', 'NaN'] },
      guardHeal: { receipts: [{ class: 'nan-history', healedBy: 'H2', steps: ['H1', 'H2'], openedAfterMs: 120, healedAfterMs: 230 }], tinySizes: 0, passErrors: [] } },
    { label: '005', frames: [frame(0, 0.99, { ctl: true })], guardHeal: { receipts: [{ class: 'empty-scene-pass', healedBy: 'self',
      clearedBy: 'fault-end', steps: ['H1', 'H2'], openedAfterMs: 140, healedAfterMs: null, confirmedAfterMs: 3270, afterFaultEndMs: 270 }],
    tinySizes: 0, passErrors: [] } },
  ]);
  const sun = write('sun', { target: 'dev', scenario: 'session', drive: true, dsf: 2, intervalMs: 250, seconds: 5, runs: [
    { label: '001', map: 'badlands', action: 'sunscan-12s', verdict: 'ok', guard: { total: 0, incidents: 0 } },
    { label: '002', map: 'desert', action: 'guardtiming', verdict: 'ok', guard: { total: 0, incidents: 0 } },
  ] }, [
    { label: '001', frames: healthy, sunscan: { started: true, elevationDeg: 30.1, after: { elevationDeg: 30.1, maxSeen: 65504, over6e4Texels: 812,
      nonFiniteTexels: 0, frames: 700, guard: { probes: 58, incidents: 0 } } } },
    { label: '002', frames: healthy, guardTiming: { started: true, after: { timedFrames: 1400, selfCpuMsMean: 0.0123, selfCpuMsMax: 0.41,
      timedProbes: 110, probeGpuMsMean: 0.0311 } } },
  ]);
  const probes = summarizeParts([sun]);
  assert.deepEqual(probes.sunScans.map((r) => [r.map, r.maxSeen, r.over6e4Texels, r.incidents, r.rowIncidents]), [['badlands', 65504, 812, 0, 0]]);
  assert.deepEqual(probes.timings.map((r) => [r.map, r.frames, r.cpuMean, r.gpuMean]), [['desert', 1400, 0.0123, 0.0311]]);
  assert.equal(probes.totals.runs, 2, 'a sun scan and a timing row are natural rows');
  const probeText = formatSummary(probes);
  assert.match(probeText, /\| sun-\S+ \| badlands \| 30\.1 \| 65504 \| 812 \| 0 \| 700 \| 58 \| 0 \| 0 \|/);
  assert.match(probeText, /\| desert \| 1400 \| 0\.0123 \| 0\.410 \| 110 \| 0\.0311 \|/);
  const { table, injections, totals } = summarizeParts([cold, heal, path.join(root, 'missing')]);
  const badlands = table.find((row) => row.map === 'badlands' && row.scenario === 'cold+drive');
  assert.equal(badlands.runs, 2, 'harness errors are not runs');
  assert.equal(badlands.errors, 1);
  assert.equal(badlands.black, 1);
  assert.equal(badlands.blackFrames, 2);
  assert.equal(badlands.longestS, 0.5, 'two consecutive samples at 250 ms');
  assert.deepEqual(badlands.firstAt, [1.25]);
  assert.equal(badlands.incidents, 2, 'the harness-error row still reports its incident');
  assert.deepEqual(badlands.incidentClasses, ['camera-layer-mask:H1', 'gl-masked:H2']);
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
  assert.equal(totals.incidents, 2);
  assert.equal(injections.length, 4);
  assert.deepEqual(injections.map((row) => [row.fault, row.class, row.healedBy, row.healedAfterMs, row.landed]),
    [['layers', 'camera-layer-mask', 'H1', 160, null], ['persist-layers-5', 'camera-layer-mask', 'H1', 120, null],
      ['persist-nanscene-1', 'nan-history', 'H2', 230, 'non-finite scene target'], ['persist-emptypass-3', 'empty-scene-pass', 'self', null, null]]);
  assert.equal(session.target, 'dev');
  assert.equal(injections[1].repeats, 40);
  const text = formatSummary({ table, injections, totals });
  assert.match(text, /total: 1 BLACK-WORLD runs of 4 \(2 harness errors, 1 of them unwatched windows\); 2 black frames of 68; 3 presented empty scene-pass frames; 2 guard incidents on natural runs/);
  assert.match(text, /\| layers \| camera-layer-mask \| H1 \| H1 \| 90 \| 160 \| 160 \| - \|/);
  assert.match(text, /\| persist-nanscene-1 \| nan-history \| H2 \| H1 H2 \| 120 \| 230 \| 230 \| - \| 0 \| 0 \| non-finite scene target \|/,
    'a NaN fault names whether its value landed');
  assert.match(text, /\| persist-emptypass-3 \| empty-scene-pass \| self \| H1 H2 \| 140 \| - \| 3270 \| 270 \|/,
    "a fault that cleared at its own end is never a heal: the world came back 270 ms after the fault's own end");
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('black-world-repro-summary.selftest: the zero-share and near-black verdicts, natural frames, watched windows, longest stretch, guard incidents (unwatched rows too), the build kind and the heal table; round 3: sun scans and the guard\'s own cost');
