// reverbImpulse.selftest.mjs — the mixer's room impulses: built with stepped envelopes and once per room (2026-10-24,
// lockdown-251).
//
// mixer.ts buildImpulse wrote every sample of a 2.4 s stereo tail with three Math.exp (the envelope, the lowpass
// cutoff's fall, its coefficient), and setReverb built it again at every ambience change (the Garage's hangar, each
// battle's map and the return). The envelope and the fall are geometric per-sample steps now, and each room's impulse
// is kept per context. This receipt runs the shipped builder from mixer.ts beside the three-exp version over every
// room at 44.1 and 48 kHz (the normalised Float32 samples agree to 1e-6) and pins the per-room reuse in setReverb.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { mulberry32 } from './audioMath.ts';
import { REVERB_PRESETS } from './mixPolicy.ts';

const source = readFileSync(new URL('./mixer.ts', import.meta.url), 'utf8');
const from = source.indexOf('function buildImpulse(');
const to = source.indexOf('export function createMixer(', from);
assert.ok(from >= 0 && to > from, 'mixer.ts carries buildImpulse');
const shipped = new Function('REVERB_PRESETS', 'mulberry32', `${stripTypeScriptTypes(source.slice(from, to))}\nreturn buildImpulse;`)(REVERB_PRESETS, mulberry32);

/** The three-exp builder this replaces, verbatim but for its types. */
function threeExpImpulse(ctx, id, maxS = 2.4) {
  const preset = REVERB_PRESETS[id];
  const sr = ctx.sampleRate;
  const length = Math.max(1, Math.round(Math.min(maxS, preset.preDelayS + preset.decayS * 1.3) * sr));
  const buffer = ctx.createBuffer(2, length, sr);
  const random = mulberry32(0x5eed + id.length * 977);
  const pre = Math.round(preset.preDelayS * sr);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    let lp = 0;
    for (let i = pre; i < length; i++) {
      const t = (i - pre) / sr;
      const env = Math.exp((-6.91 * t) / Math.max(0.05, preset.decayS));
      const cutoff = preset.dampHz + (12000 - preset.dampHz) * Math.exp(-t * 3.2);
      const alpha = 1 - Math.exp((-2 * Math.PI * cutoff) / sr);
      lp += alpha * ((random() * 2 - 1) - lp);
      const fadeIn = Math.min(1, (i - pre) / (0.004 * sr));
      data[i] = lp * env * fadeIn;
    }
    for (const [delay, gain] of preset.taps) {
      const at = pre + Math.round((delay + (c ? 0.0035 : 0)) * sr);
      for (let k = 0; k < 96 && at + k < length; k++) data[at + k] += (random() * 2 - 1) * gain * Math.exp(-k / 18);
    }
    let energy = 0;
    for (let i = 0; i < length; i++) energy += data[i] * data[i];
    const norm = energy > 0 ? 1 / Math.sqrt(energy) : 0;
    for (let i = 0; i < length; i++) data[i] *= norm * 1.6;
  }
  return buffer;
}

const context = (sampleRate) => ({ sampleRate, createBuffer: (channels, length) => {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return { length, getChannelData: (c) => data[c] };
} });
let rooms = 0;
for (const sampleRate of [44100, 48000]) {
  for (const id of Object.keys(REVERB_PRESETS).filter((room) => room !== 'none')) {
    const a = shipped(context(sampleRate), id), b = threeExpImpulse(context(sampleRate), id);
    assert.equal(a.length, b.length, `${id} @ ${sampleRate}: the same length`);
    for (let c = 0; c < 2; c++) {
      const x = a.getChannelData(c), y = b.getChannelData(c);
      let worst = 0;
      for (let i = 0; i < x.length; i++) worst = Math.max(worst, Math.abs(x[i] - y[i]));
      assert.ok(worst < 1e-6, `${id} @ ${sampleRate} channel ${c}: the stepped tail matches (worst ${worst})`);
    }
    rooms++;
  }
}
assert.match(source, /let impulse = id === 'none' \? null : impulses\.get\(id\) \?\? null;\s*if \(id !== 'none' && !impulse\) impulses\.set\(id, impulse = buildImpulse\(ctx, id\)\);/,
  'setReverb builds a room once per context and reuses it');
console.log(`reverbImpulse.selftest: ${rooms} room impulses match the three-exp builder; each built once per context PASS`);
