#!/usr/bin/env node
// make-sfx.mjs — bake the combat SFX sample set (COMBAT-SFX r2).
//
// Owner directive: cannon fire / hits / deflections / tank explosions must be
// "so much better and bass-y and explosiony". The old combat one-shots were
// synthesized live in WebAudio (cheap graphs, no saturation, whisper-level
// explosions). This script synthesizes DENSE layered Float32 PCM offline in
// node — 100% procedural, seeded, deterministic, zero downloads, CC0 by
// construction (same license posture as the voice pipeline,
// tools/make-voices.mjs) — then masters each file through the local ffmpeg
// (character EQ, tanh soft-clip saturation for weight, compression, peak
// normalize, limiter) and encodes mono 48 kHz Opus into public/audio/sfx/.
//
// The runtime (src/audio/audio.js) plays these as LAYERS: cannon fire is
// sub + crack + tail per caliber class, so distance can rebalance toward the
// tail and the player's own gun can run a hotter sub. Layer loudness balance
// is therefore baked as per-file PEAK targets here, and verified on rendered
// "preview mixes" (runtime default gains/offsets) so the gates measure what
// the player actually hears.
//
// Self-gates (all must pass or exit 1):
//   - every file: clean full decode, duration window, true peak <= -1 dBTP
//   - every preview mix: integrated LUFS (looped measure) inside its window
//   - BASS-ENERGY: energy below 120 Hz as % of total (24 dB/oct lowpass,
//     astats RMS ratio) — the whole point of the round:
//       fire mixes >= 25% (small class >= 20%), explosions >= 35%,
//       hit-received whump >= 55%, absorb thunk >= 22%, dirt >= 25%,
//       penetration >= 6% … and ricochet <= 4% MAX: a deflection must stay
//       a bright whining piiing, never a thud — that contrast is the read.
//   - payload: sum of public/audio/sfx/*.ogg <= 900 KiB
//   - manifest sync: SFX_FILES in src/audio/audio.js maps exactly this set
//     (imported live, like make-voices.mjs imports VOICE_LINES); orphans in
//     the output dir are deleted on full runs and fail --verify.
//
// Usage:
//   node tools/make-sfx.mjs                 # bake everything + verify
//   node tools/make-sfx.mjs --only fire_large  # rebake matching files (+verify)
//   node tools/make-sfx.mjs --verify        # checks only, no synthesis
//
// (Node via nvm on this machine: export NVM_DIR="$HOME/.nvm" &&
//  . "$NVM_DIR/nvm.sh" first. Requires ffmpeg with libopus.)

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'audio', 'sfx');
const PREVIEW_DIR = path.join(ROOT, 'shots', 'sfx-r2', 'bake-previews');
const FFMPEG = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg';
const FFPROBE = process.env.FFPROBE || '/opt/homebrew/bin/ffprobe';

const SR = 48000;
const PEAK_CEIL_DB = -1.0;        // gate: true peak of shipped opus
const NORM_PEAK_DB = -2.0;        // normalization headroom pre-encode
const PAYLOAD_BUDGET_B = 900 * 1024;
const OPUS_KBPS = '96k';

// ---------------------------------------------------------------- DSP kit ---

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function seedOf(name) { let h = 2166136261; for (const c of name) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const buf = (sec) => new Float32Array(Math.ceil(sec * SR));

/** dst += src * gain, src starting at atSec into dst. */
function mixAt(dst, src, atSec = 0, gain = 1) {
  const o = Math.round(atSec * SR);
  for (let i = 0; i < src.length && o + i < dst.length; i++) dst[o + i] += src[i] * gain;
  return dst;
}
function scale(b, k) { for (let i = 0; i < b.length; i++) b[i] *= k; return b; }
function normPeak(b, peak = 1) {
  let p = 0;
  for (let i = 0; i < b.length; i++) { const a = Math.abs(b[i]); if (a > p) p = a; }
  if (p > 0) scale(b, peak / p);
  return b;
}
/** Soft saturation: tanh drive, renormalized to ~unity for drive ~1. */
function sat(b, drive) {
  const k = Math.tanh(drive);
  for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * drive) / k;
  return b;
}
function white(n, rng) { const b = new Float32Array(n); for (let i = 0; i < n; i++) b[i] = rng() * 2 - 1; return b; }
/** Brown-ish noise: leaky integration of white, peak-normalized. */
function brown(n, rng, leak = 0.998) {
  const b = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) { y = y * leak + (rng() * 2 - 1) * 0.05; b[i] = y; }
  return normPeak(b);
}
/** RBJ biquad, processed out-of-place-safe (returns same buffer). */
function biquad(b, type, f0, Q, gainDb = 0) {
  const w0 = 2 * Math.PI * Math.min(f0, SR * 0.49) / SR;
  const alpha = Math.sin(w0) / (2 * Q);
  const cw = Math.cos(w0);
  const A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lowpass') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
  else if (type === 'highpass') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
  else if (type === 'bandpass') { b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
  else if (type === 'lowshelf') {
    const s = 2 * Math.sqrt(A) * alpha;
    b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
    a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s;
  } else throw new Error('biquad type ' + type);
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < b.length; i++) {
    const x = b[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    b[i] = y;
  }
  return b;
}
/** Time-varying one-pole lowpass: cutoff sweeps c0 -> c1 with time const tau. */
function tvLowpass(b, c0, c1, tau) {
  let y = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    const c = c1 + (c0 - c1) * Math.exp(-t / tau);
    const k = 1 - Math.exp(-2 * Math.PI * c / SR);
    y += (b[i] - y) * k;
    b[i] = y;
  }
  return b;
}
/** Attack (linear) + exponential-decay envelope applied in place. */
function envAD(b, atkS, decTau, holdS = 0) {
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    const a = atkS > 0 ? Math.min(1, t / atkS) : 1;
    const d = t > holdS ? Math.exp(-(t - holdS) / decTau) : 1;
    b[i] *= a * d;
  }
  return b;
}
/** Exponential pitch sweep sine f0 -> f1 (tau = sweep time const), + harmonic. */
function subSweep(sec, f0, f1, tau, harm2 = 0.3, rng = null, wobble = 0) {
  const b = buf(sec);
  let ph = 0;
  let wob = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    let f = f1 + (f0 - f1) * Math.exp(-t / tau);
    if (wobble && rng) { wob = wob * 0.999 + (rng() * 2 - 1) * 0.001; f *= 1 + wob * wobble; }
    ph += 2 * Math.PI * f / SR;
    b[i] = Math.sin(ph) + harm2 * Math.sin(2 * ph + 0.4);
  }
  return b;
}
/** Damped inharmonic modes (metal): freqs/decays(tau s)/gains, optional bend. */
function modal(sec, modes, rng, detune = 0.012, bend = 0) {
  const b = buf(sec);
  for (const [f, tau, g] of modes) {
    const det = 1 + (rng() - 0.5) * 2 * detune;
    let ph = rng() * Math.PI * 2;
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      const fr = f * det * (1 + bend * t);
      ph += 2 * Math.PI * fr / SR;
      b[i] += Math.sin(ph) * g * Math.exp(-t / tau);
    }
  }
  return b;
}
/** Sine sweep with vibrato through a static bandpass — the ricochet whine. */
function zing(sec, f0, f1, vibHz, vibAmt, rng) {
  const b = buf(sec);
  let ph = 0;
  const lnR = Math.log(f1 / f0);
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    const x = Math.min(1, t / sec);
    const f = f0 * Math.exp(lnR * x) * (1 + vibAmt * Math.sin(2 * Math.PI * vibHz * t + rng() * 0.5));
    ph += 2 * Math.PI * f / SR;
    b[i] = Math.sin(ph) + 0.32 * Math.sin(1.5 * ph + 0.7);
  }
  biquad(b, 'bandpass', Math.sqrt(f0 * f1), 0.8);
  return b;
}
/** Sparse ringing impulses (debris/crackle): density startPerS -> endPerS. */
function crackleRing(sec, startPerS, endPerS, fLo, fHi, q, rng, ampDecTau) {
  const b = buf(sec);
  const n = b.length;
  // schedule impulses by decaying density
  let t = 0.005;
  while (t < sec) {
    const dens = endPerS + (startPerS - endPerS) * Math.exp(-t / (sec * 0.3));
    t += -Math.log(1 - rng()) / Math.max(0.5, dens);
    if (t >= sec) break;
    const at = Math.floor(t * SR);
    const amp = (0.25 + rng() * 0.75) * Math.exp(-t / ampDecTau);
    const len = 12 + (rng() * 90) | 0;
    const sign = rng() < 0.5 ? -1 : 1;
    for (let i = 0; i < len && at + i < n; i++) {
      b[at + i] += sign * amp * Math.exp(-i / (len * 0.3)) * (rng() * 2 - 1);
    }
  }
  biquad(b, 'bandpass', Math.sqrt(fLo * fHi), q);
  return b;
}
/** Baked slapback echoes: add filtered delayed copies of src into dst. */
function echoes(dst, src, taps) {
  for (const [atS, gDb, lpHz] of taps) {
    const copy = Float32Array.from(src);
    if (lpHz) biquad(copy, 'lowpass', lpHz, 0.7);
    mixAt(dst, copy, atS, Math.pow(10, gDb / 20));
  }
  return dst;
}

// ---------------------------------------------------------------- recipes ---
// Caliber classes (runtime boundaries in src/audio/audio.js gunshot()):
//   small <=76 mm | medium 76-105 | large 105-130 | huge >130 (152 KV-2/ISU)
const FIRE = {
  small:  { subF0: 78, subF1: 50, subTau: 0.10, subDec: 0.14, atk: 0.005, harm: 0.42,
            crackDec: 0.030, blastC0: 4200, blastTau: 0.045, bark: 330, barkDec: 0.045, crackSec: 0.30,
            tailSec: 0.9, tailTau: 0.24, tailLp: 900, echo: [] },
  medium: { subF0: 66, subF1: 42, subTau: 0.14, subDec: 0.22, atk: 0.006, harm: 0.38,
            crackDec: 0.042, blastC0: 3800, blastTau: 0.06, bark: 235, barkDec: 0.062, crackSec: 0.38,
            tailSec: 1.3, tailTau: 0.34, tailLp: 800, echo: [[0.16, -12, 500]] },
  large:  { subF0: 56, subF1: 35, subTau: 0.18, subDec: 0.30, atk: 0.008, harm: 0.34,
            crackDec: 0.055, blastC0: 3300, blastTau: 0.08, bark: 172, barkDec: 0.085, crackSec: 0.48,
            tailSec: 1.7, tailTau: 0.45, tailLp: 720, echo: [[0.18, -10, 480], [0.39, -16, 360]] },
  huge:   { subF0: 46, subF1: 28, subTau: 0.26, subDec: 0.44, atk: 0.010, harm: 0.30,
            crackDec: 0.075, blastC0: 2800, blastTau: 0.11, bark: 118, barkDec: 0.115, crackSec: 0.62,
            tailSec: 2.3, tailTau: 0.60, tailLp: 640, echo: [[0.21, -9, 460], [0.47, -14, 340], [0.85, -19, 260]] },
};

function fireSub(P, rng) {
  const sec = P.subDec * 4 + 0.15;
  const b = subSweep(sec, P.subF0, P.subF1, P.subTau, P.harm, rng, 0.4);
  envAD(b, P.atk, P.subDec);
  // punch transient: one hard 90 Hz half-cycle knock at t0
  const punch = subSweep(0.03, 110, 70, 0.01, 0.2);
  envAD(punch, 0.001, 0.009);
  mixAt(b, punch, 0, 0.8);
  sat(b, 1.9);
  biquad(b, 'lowpass', 300, 0.8); biquad(b, 'lowpass', 380, 0.8);
  return b;
}
function fireCrack(P, rng) {
  const b = buf(P.crackSec);
  // 1) whip transient
  const tr = white(Math.round(0.008 * SR), rng);
  envAD(tr, 0.0005, 0.0035);
  mixAt(b, tr, 0, 1.0);
  // 2) muzzle blast: noise through collapsing lowpass
  const bl = white(b.length, rng);
  tvLowpass(bl, P.blastC0, 320, P.blastTau);
  envAD(bl, 0.001, P.crackDec * 2.2);
  mixAt(b, bl, 0.001, 0.95);
  // 3) resonant bark: 150-900 Hz body of the report
  const bk = white(b.length, rng);
  biquad(bk, 'bandpass', P.bark, 1.3);
  envAD(bk, 0.002, P.barkDec);
  mixAt(b, bk, 0.002, 1.5);
  const bkTone = modal(P.barkDec * 5, [[P.bark, P.barkDec, 1], [P.bark * 1.53, P.barkDec * 0.7, 0.45]], rng, 0.02);
  mixAt(b, bkTone, 0.001, 0.55);
  sat(b, 2.3);
  biquad(b, 'highpass', 105, 0.7);
  biquad(b, 'lowpass', 4300, 0.7);
  return b;
}
function fireTail(P, rng) {
  const b = brown(Math.round(P.tailSec * SR), rng);
  // thunder-roll AM: slow random swell so the rumble tumbles instead of hissing
  let s = 0;
  for (let i = 0; i < b.length; i++) {
    if (i % 16 === 0) s = s * 0.995 + (rng() * 2 - 1) * 0.02;
    b[i] *= 1 + 1.1 * s;
  }
  biquad(b, 'lowpass', P.tailLp, 0.6);
  biquad(b, 'lowshelf', 110, 0.8, 5);
  envAD(b, 0.012, P.tailTau);
  echoes(b, Float32Array.from(b.subarray(0, Math.round(0.25 * SR))), P.echo);
  sat(b, 1.5);
  return b;
}

function penImpact(rng, variant) {
  const sec = 0.7;
  const b = buf(sec);
  // strike
  const tr = white(Math.round(0.006 * SR), rng);
  envAD(tr, 0.0004, 0.0028);
  mixAt(b, tr, 0, 1.0);
  // clang: bright inharmonic modes 2-5 kHz, SHORT decays (shell in a steel box)
  const det = variant === 'b' ? 1.06 : 1.0;
  const cl = modal(0.5, [
    [2280 * det, 0.115, 1.0], [3140 * det, 0.085, 0.62],
    [4230 * det, 0.062, 0.44], [5460 * det, 0.045, 0.30], [640 * det, 0.09, 0.55],
  ], rng, 0.015);
  mixAt(b, cl, 0.0015, 0.85);
  // deep body thud (60-120 Hz) — what the old clang never had
  const th = subSweep(0.4, 105, 62, 0.05, 0.35);
  envAD(th, 0.003, 0.085);
  mixAt(b, th, 0.006, 1.1);
  const thn = white(Math.round(0.09 * SR), rng);
  biquad(thn, 'lowpass', 320, 0.8);
  envAD(thn, 0.002, 0.045);
  mixAt(b, thn, 0.004, 0.7);
  // spall hiss + debris shimmer
  const sp = white(Math.round(0.2 * SR), rng);
  biquad(sp, 'bandpass', 4100, 1.2);
  envAD(sp, 0.004, 0.09);
  mixAt(b, sp, 0.012, 0.28);
  const dbr = crackleRing(0.42, 60, 6, 1900, 5600, 4, rng, 0.16);
  mixAt(b, dbr, 0.03, 0.4);
  sat(b, 1.8);
  return b;
}

function hitWhump(rng) {
  const sec = 0.9;
  const b = buf(sec);
  const sub = subSweep(0.62, 54, 31, 0.12, 0.25);
  envAD(sub, 0.007, 0.22);
  mixAt(b, sub, 0, 1.0);
  const kn = white(Math.round(0.07 * SR), rng);
  biquad(kn, 'lowpass', 260, 0.8);
  envAD(kn, 0.002, 0.035);
  mixAt(b, kn, 0, 0.65);
  const rum = brown(Math.round(0.8 * SR), rng);
  biquad(rum, 'lowpass', 190, 0.7);
  envAD(rum, 0.01, 0.24);
  mixAt(b, rum, 0.02, 0.55);
  sat(b, 2.0);
  biquad(b, 'lowpass', 320, 0.8);
  return b;
}

function ricochet(rng, variant) {
  const sec = variant === 'b' ? 0.85 : variant === 'c' ? 0.6 : 0.8;
  const b = buf(sec);
  // light strike tick (no deep thud — deflections must read bright)
  const tr = white(Math.round(0.004 * SR), rng);
  envAD(tr, 0.0004, 0.002);
  mixAt(b, tr, 0, 0.75);
  if (variant === 'a') {
    const z = zing(0.6, 2650, 820, 27, 0.022, rng);
    envAD(z, 0.004, 0.26);
    mixAt(b, z, 0.004, 1.0);
  } else if (variant === 'b') {
    // double-skip: two falling whines, second higher/fainter
    const z1 = zing(0.24, 2420, 980, 30, 0.02, rng);
    envAD(z1, 0.004, 0.11);
    mixAt(b, z1, 0.004, 1.0);
    const tick = white(Math.round(0.003 * SR), rng);
    envAD(tick, 0.0004, 0.0016);
    mixAt(b, tick, 0.265, 0.5);
    const z2 = zing(0.34, 3160, 1290, 33, 0.02, rng);
    envAD(z2, 0.004, 0.15);
    mixAt(b, z2, 0.27, 0.55);
  } else {
    const z = zing(0.34, 3880, 1420, 36, 0.018, rng);
    envAD(z, 0.003, 0.13);
    mixAt(b, z, 0.003, 1.0);
  }
  // light clank partials + spark ticks
  const cl = modal(0.28, [[1760, 0.06, 0.5], [2890, 0.045, 0.3]], rng, 0.02);
  mixAt(b, cl, 0.001, 0.5);
  const shards = crackleRing(0.4, 26, 4, 2400, 5200, 5, rng, 0.15);
  mixAt(b, shards, 0.04, 0.3);
  sat(b, 1.5);
  biquad(b, 'highpass', 400, 0.7); biquad(b, 'highpass', 420, 0.7);
  return b;
}

function absorb(rng, variant) {
  const sec = 0.55;
  const b = buf(sec);
  const det = variant === 'b' ? 1.12 : 1.0;
  // blunt shell shatter: dull knock, no ring stack, real body
  const kn = white(Math.round(0.12 * SR), rng);
  biquad(kn, 'lowpass', 520 * det, 0.8);
  envAD(kn, 0.0015, 0.055);
  mixAt(b, kn, 0, 1.0);
  const th = subSweep(0.35, 128 * det, 74, 0.05, 0.3);
  envAD(th, 0.003, 0.1);
  mixAt(b, th, 0.004, 0.95);
  const ring = modal(0.3, [[860 * det, 0.1, 1]], rng, 0.02);
  mixAt(b, ring, 0.004, 0.10);
  const frag = crackleRing(0.3, 20, 4, 800, 1900, 3, rng, 0.12);
  mixAt(b, frag, 0.05, 0.3);
  sat(b, 1.7);
  biquad(b, 'lowpass', 2400, 0.8);
  return b;
}

function tankCore(rng, variant) {
  const sec = 3.0;
  const b = buf(sec);
  const dt = variant === 'b' ? 1.07 : 1.0;
  // THE sub drop: 80 -> 30 Hz over ~1.2 s
  const sub = subSweep(1.7, 82 * dt, 29, 0.34, 0.3, rng, 0.3);
  envAD(sub, 0.012, 0.6);
  mixAt(b, sub, 0, 1.05);
  // double boom
  const b1 = white(Math.round(0.9 * SR), rng);
  tvLowpass(b1, 1500, 110, 0.09);
  envAD(b1, 0.002, 0.30);
  mixAt(b, b1, 0, 1.0);
  const b2 = white(Math.round(1.1 * SR), rng);
  tvLowpass(b2, 950 * dt, 72, 0.13);
  envAD(b2, 0.004, 0.42);
  mixAt(b, b2, variant === 'b' ? 0.15 : 0.12, 1.0);
  // saturated body rumble
  const body = brown(Math.round(2.4 * SR), rng);
  biquad(body, 'lowpass', 330, 0.7);
  let s = 0;
  for (let i = 0; i < body.length; i++) {
    if (i % 16 === 0) s = s * 0.995 + (rng() * 2 - 1) * 0.02;
    body[i] *= 1 + 1.2 * s;
  }
  envAD(body, 0.015, 0.85);
  mixAt(b, body, 0.03, 0.8);
  // echoing tail: slapbacks of the booms rolling off terrain
  const boomMix = buf(0.7);
  mixAt(boomMix, b1, 0, 0.7); mixAt(boomMix, b2, 0.06, 0.6);
  echoes(b, boomMix, [[0.26, -8, 420], [0.55, -13, 300], [0.95, -17, 240], [1.5, -22, 200]]);
  sat(b, 2.2);
  biquad(b, 'lowshelf', 90, 0.8, 4);
  return b;
}

function tankDebris(rng) {
  const sec = 3.4;
  const b = buf(sec);
  // burning crackle + fragment patter, density decaying
  const cr = crackleRing(sec, 42, 2.5, 850, 4300, 5, rng, 1.3);
  mixAt(b, cr, 0.02, 0.85);
  // metal tinks raining back down
  for (let k = 0; k < 9; k++) {
    const at = 0.35 + rng() * 2.3;
    const tk = modal(0.16, [[1900 + rng() * 3400, 0.045, 1]], rng, 0.03);
    envAD(tk, 0.001, 0.05);
    mixAt(b, tk, at, 0.16 + rng() * 0.2);
  }
  // heavy clods thudding into the dirt
  for (let k = 0; k < 11; k++) {
    const at = 0.5 + rng() * 2.4;
    const th = subSweep(0.16, 120 + rng() * 70, 55, 0.03, 0.3);
    envAD(th, 0.003, 0.045);
    mixAt(b, th, at, 0.3 + rng() * 0.25);
    const tn = white(Math.round(0.03 * SR), rng);
    biquad(tn, 'lowpass', 420, 0.8);
    envAD(tn, 0.001, 0.014);
    mixAt(b, tn, at, 0.22);
  }
  envAD(b, 0.02, 1.6);
  sat(b, 1.4);
  return b;
}

function turretPop(rng) {
  const sec = 1.7;
  const b = buf(sec);
  // deep launch chuff — the rack lifting a 12-tonne turret
  const ch = white(Math.round(1.0 * SR), rng);
  tvLowpass(ch, 820, 110, 0.2);
  envAD(ch, 0.015, 0.33);
  mixAt(b, ch, 0, 0.95);
  const sub = subSweep(1.1, 50, 29, 0.3, 0.28, rng, 0.3);
  envAD(sub, 0.012, 0.42);
  mixAt(b, sub, 0, 1.05);
  // hull groan: low creaking modes bending down
  const gr = modal(1.2, [[138, 0.5, 1], [205, 0.36, 0.6], [311, 0.26, 0.35]], rng, 0.02, -0.06);
  mixAt(b, gr, 0.05, 0.3);
  sat(b, 2.4);
  biquad(b, 'lowpass', 900, 0.7);
  biquad(b, 'lowshelf', 80, 0.8, 4);
  return b;
}

function burnout(rng) {
  const sec = 2.4;
  const b = buf(sec);
  const wh = subSweep(1.0, 64, 33, 0.22, 0.3, rng, 0.3);
  envAD(wh, 0.02, 0.4);
  mixAt(b, wh, 0, 1.0);
  const bo = white(Math.round(1.0 * SR), rng);
  tvLowpass(bo, 620, 85, 0.14);
  envAD(bo, 0.012, 0.4);
  mixAt(b, bo, 0, 0.95);
  const body = brown(Math.round(1.9 * SR), rng);
  biquad(body, 'lowpass', 260, 0.7);
  envAD(body, 0.02, 0.6);
  mixAt(b, body, 0.05, 0.6);
  // secondary cook-off pop + fizzing
  const p2 = white(Math.round(0.35 * SR), rng);
  tvLowpass(p2, 480, 90, 0.08);
  envAD(p2, 0.004, 0.16);
  mixAt(b, p2, 0.48, 0.55);
  const fz = crackleRing(1.8, 16, 2, 1200, 2600, 4, rng, 0.8);
  mixAt(b, fz, 0.15, 0.18);
  sat(b, 1.9);
  biquad(b, 'lowpass', 1300, 0.7);
  return b;
}

function heExpl(rng, variant) {
  const sec = 1.8;
  const b = buf(sec);
  const dt = variant === 'b' ? 1.08 : 1.0;
  const sub = subSweep(0.8, 74 * dt, 30, 0.16, 0.32, rng, 0.3);
  envAD(sub, 0.006, 0.3);
  mixAt(b, sub, 0, 1.05);
  const bo = white(Math.round(0.8 * SR), rng);
  tvLowpass(bo, 1700, 120, 0.07);
  envAD(bo, 0.0015, 0.26);
  mixAt(b, bo, 0, 1.0);
  const body = brown(Math.round(1.2 * SR), rng);
  biquad(body, 'lowpass', 380, 0.7);
  envAD(body, 0.01, 0.4);
  mixAt(b, body, 0.02, 0.6);
  const sz = crackleRing(1.0, 30, 4, 1600, 3400, 4, rng, 0.4);
  mixAt(b, sz, 0.03, 0.3);
  echoes(b, Float32Array.from(bo.subarray(0, Math.round(0.4 * SR))), [[0.21, -10, 380], [0.5, -16, 280]]);
  sat(b, 2.1);
  biquad(b, 'lowshelf', 85, 0.8, 4);
  return b;
}

function dirtImpact(rng) {
  const sec = 1.0;
  const b = buf(sec);
  const sl = white(Math.round(0.25 * SR), rng);
  biquad(sl, 'lowpass', 400, 0.8);
  envAD(sl, 0.002, 0.09);
  mixAt(b, sl, 0, 1.0);
  const th = subSweep(0.4, 72, 42, 0.08, 0.3);
  envAD(th, 0.004, 0.16);
  mixAt(b, th, 0.003, 0.9);
  const gr = crackleRing(0.6, 34, 5, 900, 1900, 3, rng, 0.2);
  mixAt(b, gr, 0.02, 0.4);
  const rum = brown(Math.round(0.6 * SR), rng);
  biquad(rum, 'lowpass', 240, 0.7);
  envAD(rum, 0.01, 0.2);
  mixAt(b, rum, 0.03, 0.45);
  sat(b, 1.7);
  biquad(b, 'lowpass', 2600, 0.8);
  return b;
}

function eraPop(rng) {
  const sec = 0.75;
  const b = buf(sec);
  const po = white(Math.round(0.2 * SR), rng);
  tvLowpass(po, 2900, 260, 0.035);
  envAD(po, 0.001, 0.06);
  mixAt(b, po, 0, 1.0);
  const th = subSweep(0.25, 76, 47, 0.06, 0.3);
  envAD(th, 0.003, 0.1);
  mixAt(b, th, 0.002, 0.8);
  const cl = modal(0.4, [[1640, 0.14, 1], [2620, 0.08, 0.5]], rng, 0.02);
  mixAt(b, cl, 0.002, 0.3);
  sat(b, 1.8);
  return b;
}

// --------------------------------------------------------------- manifest ---
// One row per shipped file. peakDb = post-chain normalization target (the
// baked layer balance). durS is the synthesized duration (gate window ±25%).
// ff = per-file ffmpeg character chain (mastering EQ / compression polish).
const FF_SUB = 'lowpass=f=300,lowpass=f=380';
const FF_CRACK = 'highpass=f=100,acompressor=threshold=-15dB:ratio=2.5:attack=2:release=60:makeup=1dB';
const FF_TAIL = 'lowpass=f=1000,bass=g=3:f=85:w=0.6';
const FF_BOOM = 'bass=g=3.5:f=75:w=0.6,acompressor=threshold=-13dB:ratio=2.5:attack=4:release=140:makeup=1dB';
const FF_HIT = 'acompressor=threshold=-15dB:ratio=2:attack=1:release=90';

function fireRows(cls, peakSub, peakCrack, peakTail) {
  const P = FIRE[cls];
  return [
    { name: `fire_${cls}_sub`, durS: P.subDec * 4 + 0.15, peakDb: peakSub, ff: FF_SUB, synth: (r) => fireSub(P, r) },
    { name: `fire_${cls}_crack`, durS: P.crackSec, peakDb: peakCrack, ff: FF_CRACK, synth: (r) => fireCrack(P, r) },
    { name: `fire_${cls}_tail`, durS: P.tailSec, peakDb: peakTail, ff: FF_TAIL, synth: (r) => fireTail(P, r) },
  ];
}

const MANIFEST = [
  ...fireRows('small', -6.5, -2.0, -10.0),
  ...fireRows('medium', -5.0, -2.0, -9.0),
  ...fireRows('large', -3.5, -2.0, -8.0),
  ...fireRows('huge', -2.0, -2.0, -7.0),
  { name: 'impact_pen_a', durS: 0.7, peakDb: -2.5, ff: FF_HIT, synth: (r) => penImpact(r, 'a') },
  { name: 'impact_pen_b', durS: 0.7, peakDb: -2.5, ff: FF_HIT, synth: (r) => penImpact(r, 'b') },
  { name: 'hit_whump', durS: 0.9, peakDb: -3.0, ff: FF_SUB, synth: (r) => hitWhump(r) },
  { name: 'ricochet_a', durS: 0.8, peakDb: -3.5, ff: 'highpass=f=380', synth: (r) => ricochet(r, 'a') },
  { name: 'ricochet_b', durS: 0.85, peakDb: -3.5, ff: 'highpass=f=380', synth: (r) => ricochet(r, 'b') },
  { name: 'ricochet_c', durS: 0.6, peakDb: -3.5, ff: 'highpass=f=380', synth: (r) => ricochet(r, 'c') },
  { name: 'impact_absorb_a', durS: 0.55, peakDb: -3.0, ff: FF_HIT, synth: (r) => absorb(r, 'a') },
  { name: 'impact_absorb_b', durS: 0.55, peakDb: -3.0, ff: FF_HIT, synth: (r) => absorb(r, 'b') },
  { name: 'expl_tank_core_a', durS: 3.0, peakDb: -2.0, ff: FF_BOOM, synth: (r) => tankCore(r, 'a') },
  { name: 'expl_tank_core_b', durS: 3.0, peakDb: -2.0, ff: FF_BOOM, synth: (r) => tankCore(r, 'b') },
  { name: 'expl_tank_debris', durS: 3.4, peakDb: -9.0, ff: 'highpass=f=90', synth: (r) => tankDebris(r) },
  { name: 'expl_turret_pop', durS: 1.7, peakDb: -4.0, ff: FF_BOOM, synth: (r) => turretPop(r) },
  { name: 'expl_burnout', durS: 2.4, peakDb: -3.0, ff: FF_BOOM, synth: (r) => burnout(r) },
  { name: 'expl_he_a', durS: 1.8, peakDb: -2.5, ff: FF_BOOM, synth: (r) => heExpl(r, 'a') },
  { name: 'expl_he_b', durS: 1.8, peakDb: -2.5, ff: FF_BOOM, synth: (r) => heExpl(r, 'b') },
  { name: 'impact_dirt', durS: 1.0, peakDb: -5.0, ff: FF_HIT, synth: (r) => dirtImpact(r) },
  { name: 'era_pop', durS: 0.75, peakDb: -4.0, ff: FF_HIT, synth: (r) => eraPop(r) },
];

// Preview mixes = what the runtime layers together at default gains/offsets.
// Gates run on THESE (bass-energy is meaningless per-layer).
const PREVIEWS = [
  ...['small', 'medium', 'large', 'huge'].map((cls) => ({
    name: `mix_fire_${cls}`,
    layers: [[`fire_${cls}_sub`, 1, 0], [`fire_${cls}_crack`, 1, 0.004], [`fire_${cls}_tail`, 1, 0.018]],
    bassMin: cls === 'small' ? 20 : 25, lufs: [-23, -14],
  })),
  { name: 'mix_pen', layers: [['impact_pen_a', 1, 0]], bassMin: 6, lufs: [-17, -9] },
  { name: 'mix_hit_received', layers: [['impact_pen_a', 1, 0], ['hit_whump', 0.9, 0.01]], bassMin: 25, lufs: [-18, -10] },
  { name: 'mix_ricochet', layers: [['ricochet_a', 1, 0]], bassMax: 4, lufs: [-17, -9] },
  { name: 'mix_absorb', layers: [['impact_absorb_a', 1, 0]], bassMin: 22, lufs: [-19, -10] },
  { name: 'mix_tank_explosion', layers: [['expl_tank_core_a', 1, 0], ['expl_tank_debris', 0.9, 0.10], ['expl_turret_pop', 0.9, 0.12]], bassMin: 35, lufs: [-19, -11] },
  { name: 'mix_burnout', layers: [['expl_burnout', 1, 0], ['expl_tank_debris', 0.45, 0.15]], bassMin: 35, lufs: [-20, -11] },
  { name: 'mix_he', layers: [['expl_he_a', 1, 0]], bassMin: 35, lufs: [-20, -11] },
  { name: 'mix_dirt', layers: [['impact_dirt', 1, 0]], bassMin: 25, lufs: [-23, -14] },
  { name: 'mix_era', layers: [['era_pop', 1, 0]], lufs: [-22, -12] },
];

// ---------------------------------------------------------------- ffmpeg ----
function ffmpeg(fargs) {
  const out = spawnSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...fargs], { encoding: 'utf8' });
  if (out.status !== 0) throw new Error(`ffmpeg ${fargs.join(' ')}\n${out.stderr}`);
  return out;
}
function measurePeakDb(file) {
  const out = spawnSync(FFMPEG, ['-hide_banner', '-i', file,
    '-af', 'astats=metadata=0:measure_overall=Peak_level:measure_perchannel=none', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /Peak level dB:\s*(-?[\d.]+|-inf)/.exec(out.stderr);
  if (!m) throw new Error(`astats failed for ${file}`);
  return m[1] === '-inf' ? -Infinity : parseFloat(m[1]);
}
/** True peak (dBTP) via ebur128. */
function measureTruePeakDb(file) {
  const out = spawnSync(FFMPEG, ['-hide_banner', '-i', file,
    '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /True peak:\s*\n\s*Peak:\s*(-?[\d.]+)\s*dBFS/.exec(out.stderr);
  if (!m) throw new Error(`ebur128 true-peak failed for ${file}`);
  return parseFloat(m[1]);
}
/** Integrated LUFS measured on looped copies (short-sample gating fix). */
function measureLufs(file, loops = 5) {
  const out = spawnSync(FFMPEG, ['-hide_banner', '-stream_loop', String(loops), '-i', file,
    '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /I:\s*(-?[\d.]+)\s*LUFS/.exec(out.stderr);
  if (!m) throw new Error(`ebur128 failed for ${file}`);
  return parseFloat(m[1]);
}
function measureBandRmsDb(file, af) {
  const out = spawnSync(FFMPEG, ['-hide_banner', '-i', file,
    '-af', `${af}astats=metadata=0:measure_overall=RMS_level:measure_perchannel=none`, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /RMS level dB:\s*(-?[\d.]+|-inf)/.exec(out.stderr);
  if (!m) throw new Error(`astats failed for ${file}`);
  return m[1] === '-inf' ? -Infinity : parseFloat(m[1]);
}
/** Energy below 120 Hz as % of total (24 dB/oct lowpass, RMS ratio). */
function bassEnergyPct(file) {
  const full = measureBandRmsDb(file, '');
  const low = measureBandRmsDb(file, 'lowpass=f=120,lowpass=f=120,');
  if (!isFinite(full) || !isFinite(low)) return 0;
  return Math.pow(10, (low - full) / 10) * 100;
}
function probeMeta(file) {
  const dur = parseFloat(spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim());
  const codec = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'a:0', '-show_entries',
    'stream=codec_name,channels', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim();
  return { dur, codec };
}
function decodeCheck(file) {
  const out = spawnSync(FFMPEG, ['-v', 'error', '-i', file, '-f', 'null', '-'], { encoding: 'utf8' });
  if (out.status !== 0 || (out.stderr && out.stderr.trim())) {
    throw new Error(`decode check failed for ${file}: ${out.stderr.trim() || 'exit ' + out.status}`);
  }
}
/** Decode any audio file to mono Float32 at SR. */
function decodeToF32(file) {
  const out = spawnSync(FFMPEG, ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'],
    { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  if (out.status !== 0) throw new Error(`decode ${file}: ${out.stderr.toString()}`);
  return new Float32Array(out.stdout.buffer, out.stdout.byteOffset, out.stdout.length / 4);
}

/** Write mono float32 WAV. */
function writeWavF32(file, f32) {
  const dataBytes = f32.length * 4;
  const b = Buffer.alloc(44 + dataBytes);
  b.write('RIFF', 0); b.writeUInt32LE(36 + dataBytes, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(32, 34);
  b.write('data', 36); b.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < f32.length; i++) b.writeFloatLE(f32[i], 44 + i * 4);
  writeFileSync(file, b);
}

// --------------------------------------------------------------- generate ---
function synthesize(only) {
  mkdirSync(OUT_DIR, { recursive: true });
  const tmp = mkdtempSync(path.join(tmpdir(), 'cot-sfx-'));
  let made = 0;
  console.log(`\nname                    dur     peak(dBTP)  bass%   bytes`);
  for (const row of MANIFEST) {
    if (only && !row.name.includes(only)) continue;
    const rng = mulberry32(seedOf(row.name));
    const pcm = row.synth(rng);
    normPeak(pcm, 0.9);
    const raw = path.join(tmp, `${row.name}.raw.wav`);
    const proc = path.join(tmp, `${row.name}.proc.wav`);
    const out = path.join(OUT_DIR, `${row.name}.ogg`);
    writeWavF32(raw, pcm);
    // 1) character chain
    ffmpeg(['-i', raw, '-af', row.ff, proc]);
    // 2) peak-normalize to the layer's designed level, limit, encode opus.
    // Opus reconstruction can overshoot sample peaks on dense transients —
    // re-trim until the SHIPPED file's true peak clears the gate with margin.
    const pk = measurePeakDb(proc);
    let gain = row.peakDb - pk;
    let tp = Infinity;
    for (let pass = 0; pass < 4; pass++) {
      ffmpeg(['-i', proc, '-af',
        `volume=${gain.toFixed(2)}dB,alimiter=limit=${Math.pow(10, NORM_PEAK_DB / 20).toFixed(3)}:level=false:attack=1:release=30`,
        '-ac', '1', '-ar', String(SR), '-c:a', 'libopus', '-b:a', OPUS_KBPS, out]);
      tp = measureTruePeakDb(out);
      if (tp <= PEAK_CEIL_DB - 0.2) break;
      gain -= (tp - (PEAK_CEIL_DB - 0.5));
    }
    const size = statSync(out).size;
    const bass = bassEnergyPct(out);
    made++;
    console.log(`${row.name.padEnd(22)} ${probeMeta(out).dur.toFixed(2)}s  ${tp.toFixed(1).padStart(8)}  ${bass.toFixed(1).padStart(6)}  ${String(size).padStart(7)}`);
  }
  rmSync(tmp, { recursive: true, force: true });
  // Orphan sweep on full runs: nothing unmapped ships.
  if (!only) {
    const keep = new Set(MANIFEST.map((r) => `${r.name}.ogg`));
    for (const f of readdirSync(OUT_DIR)) {
      if (f.endsWith('.ogg') && !keep.has(f)) {
        unlinkSync(path.join(OUT_DIR, f));
        console.log(`[sfx] removed orphan ${f}`);
      }
    }
  }
  console.log(`\n[sfx] ${made} file(s) baked → ${OUT_DIR}`);
}

// ---------------------------------------------------------------- verify ----
async function verify() {
  const problems = [];
  // Runtime mapping is the source of truth — import it (make-voices pattern).
  let SFX_FILES = null;
  try {
    ({ SFX_FILES } = await import(path.join(ROOT, 'src', 'audio', 'audio.js')));
  } catch (err) {
    problems.push(`could not import SFX_FILES from src/audio/audio.js: ${err.message}`);
  }
  const tableIds = new Set(MANIFEST.map((r) => `${r.name}.ogg`));
  if (SFX_FILES) {
    const mapped = new Set(Object.values(SFX_FILES));
    for (const f of mapped) if (!tableIds.has(f)) problems.push(`audio.js maps ${f} but generator table lacks it`);
    for (const f of tableIds) if (!mapped.has(f)) problems.push(`generator produces ${f} but audio.js never plays it`);
  }
  for (const f of readdirSync(OUT_DIR)) {
    if (f.endsWith('.ogg') && !tableIds.has(f)) problems.push(`${f}: orphan in ${OUT_DIR}`);
  }

  // Per-file gates.
  let total = 0;
  console.log(`\nverify: ${MANIFEST.length} files (true peak <= ${PEAK_CEIL_DB} dBTP, dur ±25%)`);
  const fileInfo = new Map();
  for (const row of MANIFEST) {
    const file = path.join(OUT_DIR, `${row.name}.ogg`);
    if (!existsSync(file)) { problems.push(`${row.name}.ogg: MISSING`); continue; }
    const { dur, codec } = probeMeta(file);
    const tp = measureTruePeakDb(file);
    const size = statSync(file).size;
    total += size;
    fileInfo.set(row.name, { dur, tp, size });
    try { decodeCheck(file); } catch (e) { problems.push(String(e.message)); }
    const flags = [];
    if (!codec.startsWith('opus')) flags.push(`codec=${codec}`);
    if (dur < row.durS * 0.75 || dur > row.durS * 1.25 + 0.15) flags.push(`dur=${dur.toFixed(2)}s (want ~${row.durS.toFixed(2)})`);
    if (tp > PEAK_CEIL_DB) flags.push(`truePeak=${tp.toFixed(2)}dBTP`);
    if (flags.length) problems.push(`${row.name}.ogg: ${flags.join(' ')}`);
  }
  console.log(`[sfx] payload: ${MANIFEST.length} files, ${(total / 1024).toFixed(1)} KiB (budget ${(PAYLOAD_BUDGET_B / 1024).toFixed(0)} KiB)`);
  if (total > PAYLOAD_BUDGET_B) problems.push(`payload ${(total / 1024).toFixed(1)} KiB exceeds budget`);

  // Preview mixes + the BASS-ENERGY gates (the point of the round).
  mkdirSync(PREVIEW_DIR, { recursive: true });
  console.log(`\npreview mixes (runtime-default layer gains):`);
  console.log(`name                    LUFS(looped)   bass<120Hz   gate`);
  for (const pv of PREVIEWS) {
    let n = 0;
    const decoded = [];
    for (const [name, gain, atS] of pv.layers) {
      const f = path.join(OUT_DIR, `${name}.ogg`);
      if (!existsSync(f)) { decoded.length = 0; break; }
      const pcm = decodeToF32(f);
      decoded.push([pcm, gain, atS]);
      n = Math.max(n, Math.ceil(atS * SR) + pcm.length);
    }
    if (!decoded.length) { problems.push(`${pv.name}: layer file(s) missing`); continue; }
    const mix = new Float32Array(n);
    for (const [pcm, gain, atS] of decoded) mixAt(mix, pcm, atS, gain);
    // renormalize the preview only if it clips as a naive sum
    let p = 0;
    for (let i = 0; i < mix.length; i++) { const a = Math.abs(mix[i]); if (a > p) p = a; }
    if (p > 0.99) scale(mix, 0.99 / p);
    const wav = path.join(PREVIEW_DIR, `${pv.name}.wav`);
    writeWavF32(wav, mix);
    const lufs = measureLufs(wav);
    const bass = bassEnergyPct(wav);
    const flags = [];
    if (pv.lufs && (lufs < pv.lufs[0] || lufs > pv.lufs[1])) flags.push(`LUFS ${lufs.toFixed(1)} outside [${pv.lufs}]`);
    if (pv.bassMin != null && bass < pv.bassMin) flags.push(`bass ${bass.toFixed(1)}% < ${pv.bassMin}% MIN`);
    if (pv.bassMax != null && bass > pv.bassMax) flags.push(`bass ${bass.toFixed(1)}% > ${pv.bassMax}% MAX (must stay bright)`);
    const gateStr = pv.bassMin != null ? `>=${pv.bassMin}%` : pv.bassMax != null ? `<=${pv.bassMax}%` : '-';
    console.log(`  ${flags.length ? 'FAIL' : ' ok '} ${pv.name.padEnd(20)} ${lufs.toFixed(1).padStart(8)}       ${bass.toFixed(1).padStart(6)}%     ${gateStr}`);
    if (flags.length) problems.push(`${pv.name}: ${flags.join('; ')}`);
  }

  if (problems.length) {
    console.error(`\n[sfx] VERIFY FAILED:`);
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  console.log('[sfx] VERIFY GREEN');
}

// ------------------------------------------------------------------ main ----
const argv = process.argv.slice(2);
const onlyI = argv.indexOf('--only');
const only = onlyI >= 0 ? argv[onlyI + 1] : null;
if (!argv.includes('--verify')) synthesize(only);
await verify();
