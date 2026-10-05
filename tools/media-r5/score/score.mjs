#!/usr/bin/env node
// Media r5 original trailer score + sound design. 100% procedural DSP in node,
// seeded and deterministic, plus the game's own baked combat SFX
// (public/audio/sfx, themselves procedural — docs/ATTRIBUTION.md). No samples,
// recordings or models from anywhere else.
//
//   node tools/media-r5/score/score.mjs --cues=cues.json --out=dir
//
// Writes dir/music.wav, dir/sfx.wav, dir/mix.wav (48 kHz stereo 24-bit,
// loudness-normalized master) and dir/score-receipt.json.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const SR = 48000;
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([a-z-]+)=(.*)$/.exec(a); if (!m) throw Error(a); return [m[1], m[2]]; }));
const cues = JSON.parse(readFileSync(resolve(args.cues ?? join(HERE, 'cues-trailer.json')), 'utf8'));
const OUT = resolve(args.out ?? join(ROOT, 'shots/media-r5/score'));
mkdirSync(OUT, { recursive: true });
const DUR = cues.durationSec;
const N = Math.ceil(DUR * SR) + SR * 4;

// ------------------------------------------------------------------ DSP kit
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const seedOf = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const buf = sec => new Float32Array(Math.max(1, Math.ceil(sec * SR)));
const db = d => Math.pow(10, d / 20);
const NOTE = (() => { const names = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  return n => { const m = /^([A-G][b#]?)(-?\d)$/.exec(n); const midi = 12 * (Number(m[2]) + 1) + names[m[1]]; return 440 * Math.pow(2, (midi - 69) / 12); }; })();
function biquadCoef(type, f0, Q, gainDb = 0) {
  const w0 = 2 * Math.PI * Math.min(f0, SR * 0.45) / SR, alpha = Math.sin(w0) / (2 * Q), cw = Math.cos(w0), A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
  else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
  else if (type === 'bp') { b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
  else if (type === 'peak') { b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; }
  else if (type === 'ls' || type === 'hs') {
    const s = 2 * Math.sqrt(A) * alpha, sg = type === 'ls' ? 1 : -1;
    b0 = A * ((A + 1) - sg * (A - 1) * cw + s); b1 = sg * 2 * A * ((A - 1) - sg * (A + 1) * cw); b2 = A * ((A + 1) - sg * (A - 1) * cw - s);
    a0 = (A + 1) + sg * (A - 1) * cw + s; a1 = -sg * 2 * ((A - 1) + sg * (A + 1) * cw); a2 = (A + 1) + sg * (A - 1) * cw - s;
  } else throw Error(type);
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function biquad(b, type, f0, Q = 0.707, gainDb = 0) {
  const [b0, b1, b2, a1, a2] = biquadCoef(type, f0, Q, gainDb); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < b.length; i++) { const x = b[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; b[i] = y; }
  return b;
}
/** Time-varying biquad: cutoff(tSec) re-evaluated every 32 samples. */
function tvBiquad(b, type, cutoff, Q = 0.707) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, c = null;
  for (let i = 0; i < b.length; i++) {
    if (!(i & 31)) c = biquadCoef(type, Math.max(20, cutoff(i / SR)), Q);
    const x = b[i], y = c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; b[i] = y;
  }
  return b;
}
function sat(b, drive) { const k = Math.tanh(drive); for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * drive) / k; return b; }
function scale(b, k) { for (let i = 0; i < b.length; i++) b[i] *= k; return b; }
function peak(b) { let p = 0; for (let i = 0; i < b.length; i++) p = Math.max(p, Math.abs(b[i])); return p; }
function norm(b, to = 1) { const p = peak(b); return p > 0 ? scale(b, to / p) : b; }
function mix(dst, src, at = 0, g = 1) { const o = Math.round(at * SR); for (let i = 0; i < src.length; i++) { const j = o + i; if (j >= 0 && j < dst.length) dst[j] += src[i] * g; } return dst; }
function env(b, { a = 0.005, h = 0, d = 0.3, curve = 1 } = {}) {
  for (let i = 0; i < b.length; i++) { const t = i / SR; const att = a > 0 ? Math.min(1, t / a) : 1; const dec = t > a + h ? Math.exp(-Math.pow((t - a - h) / d, curve)) : 1; b[i] *= att * dec; }
  return b;
}
function adsr(b, a, d, s, r, gateSec) {
  for (let i = 0; i < b.length; i++) { const t = i / SR; let e;
    if (t < a) e = t / a; else if (t < a + d) e = 1 - (1 - s) * (t - a) / d; else if (t < gateSec) e = s; else e = s * Math.exp(-(t - gateSec) / Math.max(1e-3, r));
    b[i] *= e; }
  return b;
}
const polyblep = (t, dt) => { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; };
function saw(sec, freq, phase0 = 0) {
  const b = buf(sec); let ph = phase0; const f = typeof freq === 'function' ? freq : () => freq;
  for (let i = 0; i < b.length; i++) { const dt = f(i / SR) / SR; ph += dt; if (ph >= 1) ph -= 1; b[i] = 2 * ph - 1 - polyblep(ph, dt); }
  return b;
}
function sine(sec, freq, phase0 = 0) { const b = buf(sec); let ph = phase0; const f = typeof freq === 'function' ? freq : () => freq; for (let i = 0; i < b.length; i++) { ph += 2 * Math.PI * f(i / SR) / SR; b[i] = Math.sin(ph); } return b; }
function tri(sec, freq, phase0 = 0) { const b = buf(sec); let ph = phase0; for (let i = 0; i < b.length; i++) { ph += freq / SR; ph -= Math.floor(ph); b[i] = 4 * Math.abs(ph - 0.5) - 1; } return b; }
function noise(sec, rng) { const b = buf(sec); for (let i = 0; i < b.length; i++) b[i] = rng() * 2 - 1; return b; }
function pink(sec, rng) { const b = buf(sec); let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < b.length; i++) { const w = rng() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; b[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; } return b; }
const cents = c => Math.pow(2, c / 1200);

// Freeverb (Jezar) — stereo, deterministic.
function freeverb(inL, inR, { room = 0.86, damp = 0.35, wet = 1, width = 1 } = {}) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], alls = [556, 441, 341, 225], spread = 23, scaleSR = SR / 44100;
  const mk = (n) => ({ buf: new Float32Array(Math.round(n * scaleSR)), i: 0, store: 0 });
  const chans = [0, 1].map(c => ({ combs: combs.map(n => mk(n + c * spread)), alls: alls.map(n => mk(n + c * spread)) }));
  const fb = room * 0.28 + 0.7, d1 = damp * 0.4, d2 = 1 - d1;
  const outL = new Float32Array(inL.length), outR = new Float32Array(inL.length);
  for (let n = 0; n < inL.length; n++) {
    const input = (inL[n] + inR[n]) * 0.015;
    for (let c = 0; c < 2; c++) {
      const ch = chans[c]; let s = 0;
      for (const cb of ch.combs) { const y = cb.buf[cb.i]; cb.store = y * d2 + cb.store * d1; cb.buf[cb.i] = input + cb.store * fb; if (++cb.i >= cb.buf.length) cb.i = 0; s += y; }
      for (const ap of ch.alls) { const y = ap.buf[ap.i]; ap.buf[ap.i] = s + y * 0.5; if (++ap.i >= ap.buf.length) ap.i = 0; s = y - s; }
      (c ? outR : outL)[n] = s;
    }
  }
  const w1 = wet * (width / 2 + 0.5), w2 = wet * ((1 - width) / 2);
  for (let n = 0; n < inL.length; n++) { const l = outL[n], r = outR[n]; outL[n] = l * w1 + r * w2; outR[n] = r * w1 + l * w2; }
  return [outL, outR];
}

// ---------------------------------------------------------------- buses
const bus = () => ({ L: new Float32Array(N), R: new Float32Array(N) });
const music = bus(), sfx = bus(), verbSend = bus(), sfxVerbSend = bus();
function put(target, src, at, gain = 1, pan = 0, send = 0, sendBus = verbSend) {
  const gl = Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2, gr = Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
  mix(target.L, src, at, gain * gl); mix(target.R, src, at, gain * gr);
  if (send) { mix(sendBus.L, src, at, gain * gl * send); mix(sendBus.R, src, at, gain * gr * send); }
}
function putStereo(target, L, R, at, gain = 1, send = 0) {
  mix(target.L, L, at, gain); mix(target.R, R, at, gain);
  if (send) { mix(verbSend.L, L, at, gain * send); mix(verbSend.R, R, at, gain * send); }
}

// ---------------------------------------------------------------- instruments
function braam(freqs, sec, seed, { bright = 1, attack = 0.03 } = {}) {
  const rng = mulberry32(seed), out = buf(sec);
  for (const f of freqs) for (const det of [-9, 0, 8]) {
    const v = saw(sec, f * cents(det + (rng() - 0.5) * 4), rng());
    mix(out, v, 0, 1 / (freqs.length * 2.2));
  }
  const n = biquad(noise(sec, rng), 'bp', 320, 0.7); mix(out, n, 0, 0.12);
  tvBiquad(out, 'lp', t => 160 + 2400 * bright * Math.exp(-Math.pow(Math.max(0, t - 0.12) / 0.9, 1.2)) * Math.min(1, t / 0.12) + 260 * Math.exp(-t / 3), 1.1);
  sat(out, 2.4);
  env(out, { a: attack, h: 0.35, d: sec * 0.42, curve: 1.3 });
  return norm(out, 0.9);
}
function boom(sec, seed, { f0 = 105, f1 = 31, tau = 0.32 } = {}) {
  const rng = mulberry32(seed);
  const s = sine(sec, t => f1 + (f0 - f1) * Math.exp(-t / tau)); env(s, { a: 0.002, d: sec * 0.45, curve: 1.1 });
  const h = sine(sec, t => 2 * (f1 + (f0 - f1) * Math.exp(-t / tau)), 0.4); env(h, { a: 0.002, d: 0.35 }); mix(s, h, 0, 0.25);
  const n = biquad(noise(sec, rng), 'lp', 1100, 0.6); env(n, { a: 0.001, d: 0.09 }); mix(s, n, 0, 0.45);
  sat(s, 1.8); return norm(s, 0.95);
}
function taiko(f, seed, { body = 1, sec = 1.6 } = {}) {
  const rng = mulberry32(seed);
  const s = sine(sec, t => f * (1 + 1.4 * Math.exp(-t / 0.018))); env(s, { a: 0.0015, d: 0.42 * body, curve: 1.05 });
  const m = biquad(noise(sec, rng), 'bp', f * 2.2, 1.6); env(m, { a: 0.001, d: 0.16 }); mix(s, m, 0, 0.35);
  const k = biquad(noise(0.05, rng), 'bp', 1500, 0.9); env(k, { a: 0.0005, d: 0.006 }); mix(s, k, 0, 0.35);
  sat(s, 1.6); return norm(s, 0.9);
}
function tick(seed, { f = 2600, gain = 1 } = {}) {
  const rng = mulberry32(seed), sec = 0.12, b = buf(sec);
  for (const [mf, tau, g] of [[f, 0.018, 1], [f * 1.52, 0.011, 0.55], [f * 2.31, 0.006, 0.35]]) { const v = sine(sec, mf, rng() * 6); env(v, { a: 0.0004, d: tau }); mix(b, v, 0, g); }
  const n = biquad(noise(sec, rng), 'hp', 3500, 0.8); env(n, { a: 0.0002, d: 0.003 }); mix(b, n, 0, 0.9);
  return norm(b, 0.8 * gain);
}
function hat(seed, open = false) { const rng = mulberry32(seed), sec = open ? 0.5 : 0.09; const n = biquad(biquad(noise(sec, rng), 'hp', 7200, 0.9), 'peak', 10500, 1.2, 4); env(n, { a: 0.0005, d: open ? 0.16 : 0.022 }); return norm(n, 0.5); }
function rim(seed) { const rng = mulberry32(seed), sec = 0.3; const b = biquad(noise(sec, rng), 'bp', 1900, 2.2); env(b, { a: 0.0005, d: 0.045 }); const t = sine(sec, 410); env(t, { a: 0.0005, d: 0.03 }); mix(b, t, 0, 0.5); return norm(b, 0.7); }
function pluck(f, sec, seed, cutoff = 1400) {
  const rng = mulberry32(seed), b = buf(sec);
  for (const det of [-6, 6]) mix(b, saw(sec, f * cents(det), rng()), 0, 0.5);
  const sub = sine(sec, f / 2); mix(b, sub, 0, 0.35);
  tvBiquad(b, 'lp', t => 120 + cutoff * Math.exp(-t / 0.09), 2.0); env(b, { a: 0.002, d: 0.16 }); sat(b, 1.4); return b;
}
function pad(freqs, sec, seed, { cutoff = 900, attack = 1.6 } = {}) {
  const rng = mulberry32(seed), b = buf(sec);
  for (const f of freqs) for (const det of [-11, -3, 4, 12]) { const v = saw(sec, (t => f * cents(det + 3 * Math.sin(2 * Math.PI * (0.11 + rng() * 0.1) * t))), rng()); mix(b, v, 0, 1 / (freqs.length * 4)); }
  biquad(b, 'lp', cutoff, 0.6); biquad(b, 'hp', 70, 0.7);
  adsr(b, attack, 0.6, 0.85, 1.4, sec - 1.4); return b;
}
function drone(f, sec, seed, { cutoff = 260 } = {}) {
  const rng = mulberry32(seed), b = buf(sec);
  for (const det of [-7, 0, 7]) mix(b, saw(sec, f * cents(det), rng()), 0, 0.3);
  biquad(b, 'hp', f * 0.9, 0.7);
  mix(b, sine(sec, f / 2), 0, 0.22);
  tvBiquad(b, 'lp', t => cutoff * (1 + 0.45 * Math.sin(2 * Math.PI * 0.07 * t + 1)), 0.9);
  sat(b, 1.3); adsr(b, 2.5, 1, 1, 2.5, sec - 2.5); return b;
}
function riser(sec, seed, { top = 7000 } = {}) {
  const rng = mulberry32(seed), b = pink(sec, rng);
  tvBiquad(b, 'bp', t => 180 * Math.pow(top / 180, Math.pow(t / sec, 1.6)), 2.4);
  const s = saw(sec, t => 110 * Math.pow(2, 1.5 * Math.pow(t / sec, 2))); tvBiquad(s, 'lp', t => 300 + 5000 * Math.pow(t / sec, 2), 1); mix(b, s, 0, 0.18);
  for (let i = 0; i < b.length; i++) { const x = i / b.length; b[i] *= Math.pow(x, 2.6); }
  return norm(b, 0.8);
}
function reverseSwell(sec, seed) {
  const rng = mulberry32(seed), b = biquad(pink(sec, rng), 'lp', 2400, 0.7); const s = sine(sec, NOTE('D2')); mix(b, s, 0, 0.3);
  for (let i = 0; i < b.length; i++) { const x = i / b.length; b[i] *= Math.pow(x, 3.2); }
  return norm(b, 0.8);
}
function bell(f, sec, seed) {
  const b = buf(sec); let pc = 0, pm = 0; const rng = mulberry32(seed); pc = rng() * 6;
  for (let i = 0; i < b.length; i++) { const t = i / SR, idx = 3.2 * Math.exp(-t / 0.6); pm += 2 * Math.PI * f * 3.5 / SR; pc += 2 * Math.PI * f / SR; b[i] = Math.sin(pc + idx * Math.sin(pm)) * Math.exp(-t / 1.4); }
  const s = sine(sec, f * 2.01); env(s, { a: 0.001, d: 0.5 }); mix(b, s, 0, 0.18); return norm(b, 0.6);
}
function heartbeat(seed) { const b = buf(1.2); mix(b, taiko(48, seed, { body: 0.5, sec: 0.6 }), 0, 0.9); mix(b, taiko(44, seed + 1, { body: 0.4, sec: 0.6 }), 0.24, 0.6); biquad(b, 'lp', 220, 0.7); return norm(b, 0.9); }
function shimmer(sec, seed) { const rng = mulberry32(seed), b = buf(sec); for (const [f, g] of [[NOTE('A5'), 0.5], [NOTE('D6'), 0.35], [NOTE('E6'), 0.25], [NOTE('A6'), 0.18]]) { const v = sine(sec, t => f * (1 + 0.003 * Math.sin(2 * Math.PI * (0.3 + rng()) * t))); mix(b, v, 0, g); } for (let i = 0; i < b.length; i++) { const t = i / SR; b[i] *= (0.6 + 0.4 * Math.sin(2 * Math.PI * 4.5 * t)); } adsr(b, sec * 0.4, 0.5, 0.8, sec * 0.3, sec * 0.7); return b; }
function stop(seed) { const b = buf(1.4); mix(b, tick(seed, { f: 1500, gain: 1.4 }), 0, 1); mix(b, boom(1.4, seed + 3, { f0: 70, f1: 28, tau: 0.2 }), 0, 0.7); return norm(b, 0.9); }

// ---------------------------------------------------------------- game SFX
const sampleCache = new Map();
function sample(name) {
  if (sampleCache.has(name)) return sampleCache.get(name);
  const file = join(ROOT, 'public/audio/sfx', `${name}.ogg`);
  if (!existsSync(file)) throw Error(`missing game sfx ${name}`);
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
  const b = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4).slice();
  sampleCache.set(name, b); return b;
}
// a tank on the move (synthesized; the game bakes no engine samples): diesel firing harmonics or a
// turbine whine, exhaust roar, track-link clatter at speed / link pitch, ground rumble. A pass-by
// (passAt + d0) gets distance gain, Doppler pitch and a left-to-right pan; else a steady bed.
function drive(e) {
  const sec = e.dur, n = Math.ceil(sec * SR), rng = mulberry32(seedOf(`drive${e.t}`));
  const v = e.speed ?? 8, f0 = e.f0 ?? (e.turbine ? 52 : 34), tc = e.passAt ?? null, d0 = Math.max(1.5, e.d0 ?? 12);
  const L = new Float32Array(n), R = new Float32Array(n);
  const ph = new Float64Array(12); let clk = 0, nextClick = 0, burst = 0, burstAmp = 0, jit = 0, rough = 0, roarLp = 0, roarLp2 = 0, sub = 0;
  const bp = biquadCoef('bp', 2200, 1.4), st = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let g = 1, ratio = 1, pan = e.pan ?? 0;
    if (tc != null) {
      const x = v * (t - tc), d = Math.hypot(d0, x), vr = v * x / d;
      g = Math.min(1.6, (d0 + 4) / (d + 4)); ratio = 343 / (343 + vr); pan = Math.max(-1, Math.min(1, x / (d0 + 6))) * (e.dir ?? 1);
    }
    const fade = Math.min(1, t / 0.06, (sec - t) / 0.12);
    // engine: firing harmonics with roughness
    rough += ((rng() * 2 - 1) - rough) * 0.004; jit = 1 + rough * 0.9;
    let eng = 0;
    for (let h = 1; h <= 10; h++) { ph[h] += 2 * Math.PI * f0 * h * ratio * (1 + rough * 0.04) / SR; eng += Math.sin(ph[h]) / Math.pow(h, 0.85); }
    eng *= 0.16 * jit;
    if (e.turbine) { ph[11] += 2 * Math.PI * 2350 * ratio * (1 + 0.004 * Math.sin(2 * Math.PI * 0.7 * t)) / SR; eng += 0.05 * Math.sin(ph[11]) + 0.025 * Math.sin(ph[11] * 1.62); }
    // exhaust roar: low-passed noise
    const w = rng() * 2 - 1; roarLp += (w - roarLp) * 0.03 * ratio; roarLp2 += (roarLp - roarLp2) * 0.05; const roar = roarLp2 * 1.6;
    // track links: clicks at speed / 0.17 m, short metallic bursts
    clk += 1 / SR;
    if (clk >= nextClick) { clk = 0; nextClick = (0.17 / Math.max(0.5, v)) * (0.92 + rng() * 0.16) / ratio; burst = Math.round(SR * 0.0016); burstAmp = 0.5 + rng() * 0.5; }
    let link = 0; if (burst > 0) { link = (rng() * 2 - 1) * burstAmp * (burst / (SR * 0.0016)); burst--; }
    const y = bp[0] * link + bp[1] * st[0] + bp[2] * st[1] - bp[3] * st[2] - bp[4] * st[3]; st[1] = st[0]; st[0] = link; st[3] = st[2]; st[2] = y;
    sub += ((rng() * 2 - 1) - sub) * 0.0025;
    const m = (eng + roar * 0.5 + y * 0.55 * Math.min(1, v / 6) + sub * 2.2) * g * fade * (e.gain ?? 1);
    const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
    L[i] = m * gl; R[i] = m * gr;
  }
  putStereo(sfx, L, R, e.t, 1, tc != null ? 0.12 : 0.05);
}
// a cannon report = sub + crack + tail, as the runtime layers it
function cannon(at, cls = 'huge', gain = 1, pan = 0, dist = 0) {
  put(sfx, sample(`fire_${cls}_sub`), at, gain * (1 - dist * 0.6), pan);
  put(sfx, sample(`fire_${cls}_crack`), at, gain * (1 - dist * 0.7), pan, 0.25, sfxVerbSend);
  put(sfx, sample(`fire_${cls}_tail`), at + dist * 0.12, gain * (0.85 + dist * 0.4), pan, 0.4, sfxVerbSend);
}
function sfxEvent(e) {
  const g = e.gain ?? 1, p = e.pan ?? 0;
  if (e.kind === 'cannon') return cannon(e.t, e.cls ?? 'huge', g, p, e.dist ?? 0);
  if (e.kind === 'kill') { put(sfx, sample('expl_tank_core_a'), e.t, g, p, 0.3, sfxVerbSend); put(sfx, sample('expl_tank_debris'), e.t + 0.08, g * 0.8, p * 0.6, 0.3, sfxVerbSend); if (e.pop) put(sfx, sample('expl_turret_pop'), e.t + 0.02, g * 0.9, p, 0.2, sfxVerbSend); return; }
  if (e.kind === 'he') return put(sfx, sample(e.alt ? 'expl_he_b' : 'expl_he_a'), e.t, g, p, 0.35, sfxVerbSend);
  if (e.kind === 'pen') return put(sfx, sample(e.alt ? 'impact_pen_b' : 'impact_pen_a'), e.t, g, p, 0.2, sfxVerbSend);
  if (e.kind === 'ricochet') return put(sfx, sample(['ricochet_a', 'ricochet_b', 'ricochet_c'][(e.alt ?? 0) % 3]), e.t, g, p, 0.25, sfxVerbSend);
  if (e.kind === 'dirt') return put(sfx, sample('impact_dirt'), e.t, g, p, 0.2, sfxVerbSend);
  if (e.kind === 'burn') return put(sfx, sample('expl_burnout'), e.t, g, p, 0.3, sfxVerbSend);
  if (e.kind === 'sample') return put(sfx, sample(e.name), e.t, g, p, e.send ?? 0.2, sfxVerbSend);
  if (e.kind === 'drive') return drive(e);
  throw Error(`unknown sfx ${e.kind}`);
}

// ---------------------------------------------------------------- the score
const bpm = cues.bpm, beat = 60 / bpm, bar = beat * 4, step = beat / 4;
const CH = { Dm: ['D2', 'A2', 'D3', 'F3'], Bb: ['Bb1', 'F2', 'Bb2', 'D3'], F: ['F2', 'C3', 'F3', 'A3'], C: ['C2', 'G2', 'C3', 'E3'], Gm: ['G1', 'D2', 'G2', 'Bb2'], A: ['A1', 'E2', 'A2', 'C#3'] };
const prog = cues.progression ?? ['Dm', 'Dm', 'Bb', 'Bb', 'F', 'F', 'C', 'C'];
const chordAt = barIdx => CH[prog[barIdx % prog.length]];
const layersAt = barIdx => { const s = cues.sections.find(s => barIdx >= s.fromBar && barIdx <= s.toBar); return s ? new Set(s.layers) : new Set(); };
const totalBars = Math.ceil(DUR / bar);
let seq = 1;
for (let bi = 0; bi < totalBars; bi++) {
  const L = layersAt(bi), t0 = cues.offsetSec ?? 0;
  const at = t0 + bi * bar, chord = chordAt(bi).map(NOTE);
  if (at >= DUR) break;
  if (L.has('ticks')) for (let k = 0; k < 4; k++) put(music, tick(seq++, { f: k ? 2600 : 2100, gain: k ? 0.75 : 1 }), at + k * beat, 0.32, k % 2 ? 0.25 : -0.25, 0.25);
  if (L.has('ticks8')) for (let k = 0; k < 8; k++) put(music, tick(seq++, { f: k % 2 ? 3100 : 2400, gain: k % 2 ? 0.55 : 0.8 }), at + k * beat / 2, 0.26, k % 2 ? 0.3 : -0.3, 0.2);
  if (L.has('drone') && bi % 2 === 0) put(music, drone(chord[0] / 2, bar * 2 + 2.5, seq++, { cutoff: L.has('open') ? 520 : 240 }), at, 0.26, 0, 0.3);
  if (L.has('pad') && bi % 2 === 0) { const p = pad(chord.slice(1).map(f => f * 2), bar * 2 + 1.5, seq++, { cutoff: L.has('open') ? 1700 : 950 }); put(music, p, at, 0.34, -0.15, 0.55); put(music, p, at + 0.011, 0.3, 0.2, 0.55); }
  if (L.has('pulse') || L.has('pulse16')) {
    const div = L.has('pulse16') ? 16 : 8, cut = L.has('open') ? 2600 : 1100;
    for (let k = 0; k < div; k++) { const f = (k % 4 === 3 ? chord[2] : chord[1]); put(music, pluck(f, 0.3, seq++, cut), at + k * bar / div, (k % 2 ? 0.16 : 0.22), k % 2 ? 0.35 : -0.35, 0.12); }
  }
  if (L.has('taiko')) for (const s of [0, 10]) put(music, taiko(64, seq++), at + s * step, 0.62, -0.05, 0.25);
  if (L.has('taiko2')) for (const s of [0, 3, 6, 10, 12, 14]) put(music, taiko(s % 4 ? 82 : 60, seq++, { body: s ? 0.7 : 1 }), at + s * step, s ? 0.48 : 0.7, (s % 3 - 1) * 0.3, 0.25);
  if (L.has('toms')) for (const s of [4, 12, 14, 15]) put(music, taiko(118 + s * 3, seq++, { body: 0.45, sec: 0.7 }), at + s * step, 0.32, s > 13 ? 0.45 : -0.4, 0.2);
  if (L.has('hats')) for (let s = 0; s < 16; s += 2) put(music, hat(seq++, s === 14), at + s * step, s % 4 ? 0.12 : 0.17, 0.5, 0.05);
  if (L.has('hats16')) for (let s = 0; s < 16; s++) put(music, hat(seq++), at + s * step, s % 4 ? 0.08 : 0.15, s % 2 ? 0.55 : -0.2, 0.04);
  if (L.has('rim')) for (const s of [4, 12]) put(music, rim(seq++), at + s * step, 0.32, 0.1, 0.3);
  if (L.has('heartbeat')) put(music, heartbeat(seq++), at, 0.7, 0, 0.15), put(music, heartbeat(seq++), at + bar / 2, 0.55, 0, 0.15);
  if (L.has('motif')) { const m = cues.motif ?? ['A4', 'D5', 'C5', 'A4']; for (let k = 0; k < m.length; k++) put(music, bell(NOTE(m[k]), 3, seq++), at + k * beat, 0.24, (k - 1.5) * 0.25, 0.7); }
  if (L.has('shimmer') && bi % 2 === 0) put(music, shimmer(bar * 2, seq++), at, 0.2, 0, 0.8);
}
for (const h of cues.hits ?? []) {
  const g = h.gain ?? 1;
  if (h.kind === 'braam') { const chord = (CH[h.chord ?? 'Dm']).map(NOTE); put(music, braam(chord, h.sec ?? 4.5, seq++, { bright: h.bright ?? 1 }), h.t, 0.72 * g, -0.08, 0.35); put(music, braam(chord.map(f => f * cents(7)), h.sec ?? 4.5, seq++, { bright: h.bright ?? 1 }), h.t + 0.009, 0.5 * g, 0.1, 0.35); }
  else if (h.kind === 'boom') put(music, boom(h.sec ?? 3, seq++, h), h.t, 0.85 * g, 0, 0.4);
  else if (h.kind === 'riser') put(music, riser(h.sec ?? 3, seq++), h.t - (h.sec ?? 3), 0.5 * g, 0, 0.3);
  else if (h.kind === 'swell') put(music, reverseSwell(h.sec ?? 2.5, seq++), h.t - (h.sec ?? 2.5), 0.5 * g, 0, 0.2);
  else if (h.kind === 'stop') put(music, stop(seq++), h.t, 0.9 * g, 0, 0.5);
  else if (h.kind === 'taiko') put(music, taiko(h.f ?? 58, seq++), h.t, 0.8 * g, 0, 0.3);
  else throw Error(`unknown hit ${h.kind}`);
}
// silence windows (duck everything but listed layers)
for (const s of cues.sfx ?? []) sfxEvent(s);

// reverbs
const [mvL, mvR] = freeverb(verbSend.L, verbSend.R, { room: 0.9, damp: 0.3, width: 1 });
mix(music.L, mvL, 0, 0.55); mix(music.R, mvR, 0, 0.55);
const [svL, svR] = freeverb(sfxVerbSend.L, sfxVerbSend.R, { room: 0.82, damp: 0.45, width: 0.8 });
mix(sfx.L, svL, 0, 0.45); mix(sfx.R, svR, 0, 0.45);
// section dynamics: smooth per-section gain (dB) on the music bus, ramped over rampSec
{
  const secs = cues.sections.filter(x => Number.isFinite(x.gainDb));
  if (secs.length) {
    const ramp = (cues.rampSec ?? 0.6) * SR, pts = secs.map(x => [Math.round(((cues.offsetSec ?? 0) + x.fromBar * bar) * SR), db(x.gainDb)]);
    for (let i = 0, k = 0; i < N; i++) {
      while (k + 1 < pts.length && i >= pts[k + 1][0]) k++;
      let g = pts[k][1];
      const next = pts[k + 1];
      if (next && i > next[0] - ramp) { const u = 1 - (next[0] - i) / ramp; g = g + (next[1] - g) * u * u * (3 - 2 * u); }
      music.L[i] *= g; music.R[i] *= g;
    }
  }
}
// ducks: automation gain windows on the music bus
for (const d of cues.ducks ?? []) {
  const a = Math.round(d.from * SR), b = Math.round(d.to * SR), fade = Math.round((d.fade ?? 0.25) * SR), g = db(d.db);
  for (let i = Math.max(0, a - fade); i < Math.min(N, b + fade); i++) { const k = i < a ? 1 - (a - i) / fade : i > b ? 1 - (i - b) / fade : 1; const gg = 1 + (g - 1) * Math.max(0, Math.min(1, k)); music.L[i] *= gg; music.R[i] *= gg; }
}
// end fade
const endFade = Math.round((cues.fadeOutSec ?? 2.5) * SR), endIdx = Math.round(DUR * SR);
for (const b of [music, sfx]) for (let i = endIdx - endFade; i < N; i++) { const k = i >= endIdx ? 0 : (endIdx - i) / endFade; b.L[i] *= k; b.R[i] *= k; }

// ---------------------------------------------------------------- write + master
function writeWav(path, L, R, frames) {
  const n = frames, data = Buffer.alloc(n * 2 * 4);
  for (let i = 0; i < n; i++) { data.writeFloatLE(L[i], i * 8); data.writeFloatLE(R[i], i * 8 + 4); }
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
}
const frames = Math.round(DUR * SR);
const pre = (b, g) => { const L = b.L.subarray(0, frames).map(x => x * g), R = b.R.subarray(0, frames).map(x => x * g); return [L, R]; };
const mg = db(cues.musicDb ?? -4), sg = db(cues.sfxDb ?? -2);
writeWav(join(OUT, 'music-raw.wav'), ...pre(music, mg), frames);
writeWav(join(OUT, 'sfx-raw.wav'), ...pre(sfx, sg), frames);
const sum = { L: new Float32Array(frames), R: new Float32Array(frames) };
for (let i = 0; i < frames; i++) { sum.L[i] = music.L[i] * mg + sfx.L[i] * sg; sum.R[i] = music.R[i] * mg + sfx.R[i] * sg; }
writeWav(join(OUT, 'sum-raw.wav'), sum.L, sum.R, frames);
const lufs = cues.lufs ?? -14;
const master = (inp, outp, target = lufs) => {
  // two-pass loudnorm: measure, then apply linear normalization with the measured values, then a true-peak ceiling
  const pre = `acompressor=threshold=-10dB:ratio=1.6:attack=20:release=250:makeup=1,alimiter=limit=0.9:attack=2:release=60:level=false`;
  const m = spawnSync('ffmpeg', ['-hide_banner', '-i', inp, '-af', `${pre},loudnorm=I=${target}:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const j = JSON.parse(m.slice(m.lastIndexOf('{'), m.lastIndexOf('}') + 1));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', inp, '-af',
    `${pre},loudnorm=I=${target}:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=192000,alimiter=limit=0.83:attack=1:release=40:level=false,aresample=48000`,
    '-c:a', 'pcm_s24le', outp]);
};
master(join(OUT, 'sum-raw.wav'), join(OUT, 'mix.wav'));
master(join(OUT, 'music-raw.wav'), join(OUT, 'music.wav'), lufs - 2);
const meter = spawnSync('ffmpeg', ['-hide_banner', '-i', join(OUT, 'mix.wav'), '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const integrated = /I:\s+(-?[\d.]+) LUFS/.exec(meter.split('Summary:').pop())?.[1], truePeak = /Peak:\s+(-?[\d.]+) dBFS/.exec(meter.split('Summary:').pop())?.[1];
const sha = f => createHash('sha256').update(readFileSync(f)).digest('hex');
const receipt = { tool: 'media-r5 score', toolSha256: sha(fileURLToPath(import.meta.url)), cuesSha256: createHash('sha256').update(JSON.stringify(cues)).digest('hex'),
  durationSec: DUR, sampleRate: SR, integratedLufs: Number(integrated), truePeakDbfs: Number(truePeak),
  outputs: Object.fromEntries(['mix.wav', 'music.wav', 'sfx-raw.wav'].map(f => [f, sha(join(OUT, f))])),
  provenance: '100% procedural synthesis (this tool) + the project\'s own procedural combat SFX set (public/audio/sfx). No third-party audio.' };
writeFileSync(join(OUT, 'score-receipt.json'), JSON.stringify(receipt, null, 2));
console.log(`[score] ${DUR}s · ${integrated} LUFS · true peak ${truePeak} dBFS -> ${OUT}`);
