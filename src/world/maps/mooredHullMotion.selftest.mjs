// Round 67 (2026-09-24): the moored hull's render-side bob and sway (mooredHullMotion.ts). The pose is a pure
// function of the world clock and a phase from the mooring point: a few centimetres of heave, a degree of roll, half
// a degree of pitch, zero-mean, never repeating inside a minute, allocation-free, and the module draws from no stream
// and reads no clock of its own — so the sim, the authority and the dedicated shards never see the hull move.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MOORED_HULL_CHOP_M, MOORED_HULL_HEAVE_M, MOORED_HULL_PERIODS_S, MOORED_HULL_PITCH_RAD, MOORED_HULL_ROLL_RAD,
  mooredHullPhase, mooredHullPose,
} from './mooredHullMotion.ts';

const source = readFileSync(new URL('./mooredHullMotion.ts', import.meta.url), 'utf8');
assert.ok(!/Math\.random|Date\.now|performance\.now/.test(source), 'no stream, no wall clock: the pose is a function of the world clock alone');
assert.ok(MOORED_HULL_HEAVE_M + MOORED_HULL_CHOP_M <= 0.05, 'a few centimetres of heave');
assert.ok(MOORED_HULL_ROLL_RAD <= 0.03 && MOORED_HULL_PITCH_RAD <= 0.01, 'a degree of roll, half a degree of pitch');
const periods = Object.values(MOORED_HULL_PERIODS_S);
for (let i = 0; i < periods.length; i++) for (let j = 0; j < periods.length; j++) {
  if (i === j) continue;
  const ratio = periods[i] / periods[j];
  assert.ok(Math.abs(ratio - Math.round(ratio)) > 0.05, `no period is a multiple of another (${periods[i]} / ${periods[j]})`);
}

// bounds, determinism and a zero mean over a long window, on several phases
const out = { heave: 0, roll: 0, pitch: 0 };
for (const phase of [0, 1.1, 2.9, 5.7]) {
  let sumH = 0, sumR = 0, sumP = 0, n = 0, maxH = 0, maxR = 0, maxP = 0;
  for (let t = 0; t < 600; t += 1 / 60) {
    const pose = mooredHullPose(t, phase, out);
    assert.equal(pose, out, 'allocation-free: the caller\'s record is returned');
    assert.ok(Math.abs(pose.heave) <= MOORED_HULL_HEAVE_M + MOORED_HULL_CHOP_M + 1e-12);
    assert.ok(Math.abs(pose.roll) <= MOORED_HULL_ROLL_RAD + 1e-12 && Math.abs(pose.pitch) <= MOORED_HULL_PITCH_RAD + 1e-12);
    sumH += pose.heave; sumR += pose.roll; sumP += pose.pitch; n++;
    maxH = Math.max(maxH, Math.abs(pose.heave)); maxR = Math.max(maxR, Math.abs(pose.roll)); maxP = Math.max(maxP, Math.abs(pose.pitch));
  }
  assert.ok(Math.abs(sumH / n) < 0.002 && Math.abs(sumR / n) < 0.001 && Math.abs(sumP / n) < 0.0005, `zero-mean over ten minutes (phase ${phase})`);
  assert.ok(maxH > 0.03 && maxR > 0.018 && maxP > 0.006, 'the hull actually moves through most of its range');
  const a = { ...mooredHullPose(123.4, phase, out) }, b = { ...mooredHullPose(123.4, phase, out) };
  assert.deepEqual(a, b, 'deterministic: the same clock and phase give the same pose');
}
// the pose never repeats inside a minute (the periods are incommensurate)
{ const start = { ...mooredHullPose(0, 0.7, out) };
  for (let t = 0.5; t < 60; t += 0.5) {
    const p = mooredHullPose(t, 0.7, out);
    assert.ok(Math.abs(p.heave - start.heave) + Math.abs(p.roll - start.roll) + Math.abs(p.pitch - start.pitch) > 1e-4, `no repeat at ${t} s`);
  } }
// phases: in [0, 2π), spread by the mooring point, stable per point
const phases = new Set();
for (let i = 0; i < 200; i++) { const ph = mooredHullPhase(-300 + i * 3.7, 20 + i * 1.3); assert.ok(ph >= 0 && ph < Math.PI * 2); phases.add(Math.round(ph * 10)); }
assert.ok(phases.size > 40, `phases spread over the circle (${phases.size} tenths)`);
assert.equal(mooredHullPhase(12.5, -7.25), mooredHullPhase(12.5, -7.25)); assert.notEqual(mooredHullPhase(12.5, -7.25), mooredHullPhase(13.5, -7.25), 'a metre apart, out of step');
{ const p1 = { ...mooredHullPose(10, mooredHullPhase(12.5, -7.25), out) }, p2 = { ...mooredHullPose(10, mooredHullPhase(13.5, -7.25), out) };
  assert.ok(Math.abs(p1.heave - p2.heave) > 1e-3 || Math.abs(p1.roll - p2.roll) > 1e-3, 'two hulls never move in step'); }
console.log(`mooredHullMotion.selftest: heave ≤ ${((MOORED_HULL_HEAVE_M + MOORED_HULL_CHOP_M) * 100).toFixed(1)} cm, roll ≤ ${(MOORED_HULL_ROLL_RAD * 180 / Math.PI).toFixed(2)}°, pitch ≤ ${(MOORED_HULL_PITCH_RAD * 180 / Math.PI).toFixed(2)}°, zero-mean, deterministic, no repeat inside a minute, phases spread`);
