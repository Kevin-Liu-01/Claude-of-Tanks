#!/usr/bin/env node
// Media r5 film soundtrack (owner 2026-10-05: recorded SFX and generated music, nothing synthesized): the music bed
// generated from the film's cue sheet (music.mjs, Eleven Music) under the game's own recorded sound library
// (public/audio/sfx, the ElevenLabs-generated set PR #9 ships; docs/AUDIO.md) — gun reports layered as the game
// layers them (punch, close report, distant report, environment tail), kills, hits, explosions, the tanks' recorded
// engine and track loops with distance, Doppler and pan for a pass-by, and the map's ambience bed under each cut —
// and the crews' recorded radio calls (public/audio/voice) keyed over the engine's intercom chain, the beds ducking
// under speech as the game ducks them. Reverb, levels, filters and the two-pass loudness master only process those
// recordings.
//
//   node tools/media-r5/score/score.mjs --cues=<cues.json> --music=<music-gen.wav> --out=<dir>
//
// Writes dir/music.wav, dir/sfx-raw.wav, dir/mix.wav (48 kHz stereo 24-bit, loudness-normalized) and
// dir/score-receipt.json. Without --music it stops: there is no synthesized stand-in.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { SFX_ASSETS } from '../../../src/audio/sfxManifest.generated.ts';
import { WEAPON_CLASSES } from '../../../src/audio/weaponAudio.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const SR = 48000;
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([a-z-]+)=(.*)$/.exec(a); if (!m) throw Error(a); return [m[1], m[2]]; }));
const cues = JSON.parse(readFileSync(resolve(args.cues ?? join(HERE, 'cues-trailer.json')), 'utf8'));
const OUT = resolve(args.out ?? join(ROOT, 'shots/media-r5/score'));
if (!args.music || !existsSync(resolve(args.music))) throw Error('score: --music=<music-gen.wav> (tools/media-r5/score/music.mjs) is required; nothing is synthesized in its place');
mkdirSync(OUT, { recursive: true });
const DUR = cues.durationSec;
const N = Math.ceil(DUR * SR) + SR * 4;

// ------------------------------------------------------------------ processing kit
const seedOf = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const db = d => Math.pow(10, d / 20);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const ramp = (v, [a, b]) => clamp((v - a) / Math.max(1e-6, b - a), 0, 1);
function mix(dst, src, at = 0, g = 1) { const o = Math.round(at * SR); for (let i = 0; i < src.length; i++) { const j = o + i; if (j >= 0 && j < dst.length) dst[j] += src[i] * g; } return dst; }
// Freeverb (Jezar) — stereo, deterministic: the outdoor reflections under the recorded effects.
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

// ------------------------------------------------------------------ buses
const bus = () => ({ L: new Float32Array(N), R: new Float32Array(N) });
const music = bus(), sfx = bus(), amb = bus(), radio = bus(), sfxVerbSend = bus();
function put(target, src, at, gain = 1, pan = 0, send = 0) {
  const gl = Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2, gr = Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
  mix(target.L, src, at, gain * gl); mix(target.R, src, at, gain * gr);
  if (send) { mix(sfxVerbSend.L, src, at, gain * gl * send); mix(sfxVerbSend.R, src, at, gain * gr * send); }
}
function putStereo(target, L, R, at, gain = 1) { mix(target.L, L, at, gain); mix(target.R, R, at, gain); }

// ------------------------------------------------------------------ the game's recorded library
const decoded = new Map();
/** One recording (public/audio/sfx/<group>/<id>_<k>.webm) at 48 kHz: mono, or [L, R] when `stereo`. */
function recording(id, k = 0, stereo = false) {
  const key = `${id}#${k}#${stereo}`;
  if (decoded.has(key)) return decoded.get(key);
  const record = SFX_ASSETS[id];
  if (!record) throw Error(`score: no recorded asset ${id}`);
  const file = join(ROOT, 'public/audio/sfx', record.g, `${id}_${k % record.n}.webm`);
  if (!existsSync(file)) throw Error(`score: missing recording ${file}`);
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', stereo ? '2' : '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
  const all = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4).slice();
  const out = stereo ? [all.filter((_, i) => i % 2 === 0), all.filter((_, i) => i % 2 === 1)] : all;
  decoded.set(key, out); return out;
}
/** A variant chosen deterministically for this moment (the game picks without repeating; a film is one fixed pick). */
const variant = (id, t) => seedOf(`${id}@${t}`) % (SFX_ASSETS[id]?.n ?? 1);
/** Playback at a rate (the game's playbackRate: pitch and length move together), optionally cut short with a fade. */
function atRate(src, rate = 1, maxDurS = null) {
  const n = Math.max(1, Math.floor(src.length / rate)), limit = maxDurS ? Math.min(n, Math.round(maxDurS * SR)) : n, out = new Float32Array(limit);
  for (let i = 0; i < limit; i++) { const p = i * rate, j = Math.floor(p), f = p - j; out[i] = (src[j] ?? 0) * (1 - f) + (src[j + 1] ?? 0) * f; }
  if (maxDurS && limit < n) { const fade = Math.min(limit, Math.round(0.04 * SR)); for (let i = 0; i < fade; i++) out[limit - 1 - i] *= i / fade; }
  return out;
}
function play(id, t, { gain = 1, pan = 0, rate = 1, maxDurS = null, send = 0.25, delayS = 0 } = {}) {
  put(sfx, atRate(recording(id, variant(id, t)), rate, maxDurS), t + delayS, gain, pan, send);
}
/** The seamless region of a loop asset ([loopStart, loopEnd] inside its wrap-padded file), mono or stereo. */
function loopRegion(id, stereo = false) {
  const record = SFX_ASSETS[id], data = recording(id, 0, stereo);
  const [a, b] = record.l ?? [0, record.d[0]];
  const cut = (x) => x.subarray(Math.round(a * SR), Math.round(b * SR));
  return stereo ? data.map(cut) : cut(data);
}

// ------------------------------------------------------------------ events (as audioEngine.ts plays them)
const WEAPON_CLOSE = { mg_rifle: 'mg_rifle_close', mg_heavy: 'mg_heavy_close', ac_20: 'ac_20_close', ac_25: 'ac_25_close', ac_30: 'ac_30_close',
  ac_40: 'ac_40_close', ac_50: 'ac_50_close', gun_90: 'gun_90_close', gun_105: 'gun_105_close', gun_120: 'gun_120_close', gun_125: 'gun_125_close',
  gun_130: 'gun_130_close', gun_152: 'gun_152_close', atgm: 'atgm_launch', rocket_heavy: 'rocket_salvo' };
const WEAPON_FAR = { mg_rifle: 'mg_far', mg_heavy: 'mg_far', ac_20: 'ac_far_light', ac_25: 'ac_far_light', ac_30: 'ac_far_light', ac_40: 'ac_far_heavy',
  ac_50: 'ac_far_heavy', gun_90: 'gun_far_light', gun_105: 'gun_far_light', gun_120: 'gun_far_medium', gun_125: 'gun_far_medium',
  gun_130: 'gun_far_heavy', gun_152: 'gun_far_heavy', atgm: 'ac_far_light', rocket_heavy: 'gun_far_heavy' };
const BLAST_DB = { cannon: -6, autocannon: -16, mg: -19 };
function punchFor(family, caliberMm) {
  if (family === 'mg') return { id: 'blast_punch_light', rate: clamp(1.12 - (caliberMm - 7.62) / 50, 0.96, 1.12), maxDurS: 0.22 };
  if (family === 'autocannon') return { id: 'blast_punch_medium', rate: clamp(1.15 - (caliberMm - 20) / 60, 0.9, 1.15), maxDurS: 0.32 };
  return { id: 'blast_punch_heavy', rate: clamp(1.1 - (caliberMm - 90) / 200, 0.88, 1.1), maxDurS: 0.5 };
}
/** Level by camera distance: the game's compressed weapon law (reference 25 m, rolloff 0.6), floored for the mix. */
const distanceGain = (m) => clamp(Math.pow(25 / Math.max(25, m), 0.6), 0.18, 1);
function weapon(e) {
  const cls = WEAPON_CLASSES[e.cls] ?? WEAPON_CLASSES.gun_120, d = e.distM ?? 40, rate = e.rate ?? 1, pan = e.pan ?? 0;
  const level = distanceGain(d) * db(e.gainDb ?? 0) * (e.gain ?? 1);
  const closeK = 1 - ramp(d, cls.closeFadeM), farK = ramp(d, cls.farFadeM);
  if (closeK > 0.05 && BLAST_DB[cls.family] != null) {
    const punch = punchFor(cls.family, e.caliberMm ?? 120);
    play(punch.id, e.t, { gain: level * db(BLAST_DB[cls.family]), pan, rate: punch.rate, maxDurS: punch.maxDurS, send: 0.15 });
  }
  if (closeK > 0.03) play(WEAPON_CLOSE[cls.id], e.t, { gain: level * closeK, pan, rate, send: 0.25 });
  if (farK > 0.03) play(WEAPON_FAR[cls.id], e.t, { gain: level * farK * db(-3), pan, rate, send: 0.35 });
  if (e.twin) play(WEAPON_CLOSE[cls.id], e.t, { gain: level * Math.max(closeK, 0.05) * db(-2), pan, rate: rate * 0.97, delayS: 0.016 });
  if (cls.family !== 'mg' || e.burstHead) {
    play(`tail_${e.tail ?? 'open'}`, e.t, { gain: level * cls.tailGain * db(-12), pan, rate: cls.tailRate * rate, delayS: 0.035 + (seedOf(e.t) % 20) / 1000, send: 0.4 });
  }
}
function sfxEvent(e) {
  const g = e.gain ?? 1, p = e.pan ?? 0, level = distanceGain(e.distM ?? 30) * g;
  if (e.kind === 'cannon' || e.kind === 'mg') return weapon(e);
  if (e.kind === 'kill') {
    play(e.pop ? 'tank_explode_ammo' : 'tank_explode', e.t, { gain: level, pan: p, send: 0.3 });
    play('blast_sub', e.t, { gain: level * db(e.pop ? 2 : 1), pan: p, rate: e.pop ? 0.8 : 0.88, send: 0.1 });
    play('debris_metal', e.t, { gain: level * 0.8, pan: p * 0.6, delayS: 0.08, send: 0.3 });
    if (e.pop) play('turret_land', e.t, { gain: level * 0.7, pan: p, delayS: 1.4, send: 0.3 });
    return;
  }
  if (e.kind === 'he') {
    const size = { small: 'small', medium: 'medium', large: 'large', huge: 'large' }[e.size ?? 'medium'] ?? 'medium';
    play(`expl_he_${size}`, e.t, { gain: level, pan: p, send: 0.35 });
    if (e.size === 'large' || e.size === 'huge') play('blast_sub', e.t, { gain: level * db(e.size === 'huge' ? 1 : -1), pan: p, rate: e.size === 'huge' ? 0.85 : 0.97, send: 0.1 });
    return;
  }
  if (e.kind === 'pen') { play(e.heavy === false ? 'pen_light' : 'pen_heavy', e.t, { gain: level, pan: p, send: 0.2 }); return play('hull_thud_sub', e.t, { gain: level * 0.7, pan: p, send: 0.05 }); }
  if (e.kind === 'nonpen') return play('nonpen_heavy', e.t, { gain: level, pan: p, send: 0.2 });
  if (e.kind === 'ricochet') return play(e.heavy === false ? 'ricochet_light' : 'ricochet_heavy', e.t, { gain: level * 0.9, pan: p, send: 0.25 });
  if (e.kind === 'dirt') return play('ground_dirt', e.t, { gain: level, pan: p, send: 0.2 });
  if (e.kind === 'prop') {
    // a hull crushing cover, as audioEngine.ts onProp plays it: the kind's sound at -1 dB, a tall tree's fall after it
    play(e.asset, e.t, { gain: level * db(-1), pan: p, send: 0.25 });
    if (e.follow) play(e.follow, e.t, { gain: level * db(-2), pan: p, delayS: 0.45 + (seedOf(`fall@${e.t}`) % 300) / 1000, send: 0.3 });
    return;
  }
  if (e.kind === 'sample') return play(e.name, e.t, { gain: g, pan: p, send: e.send ?? 0.2 });
  if (e.kind === 'drive') return drive(e);
  if (e.kind === 'bed') return bed(e);
  if (e.kind === 'radio') return transmit(e);
  throw Error(`unknown sfx ${e.kind}`);
}
/** Run a mono buffer through an ffmpeg filter chain at 48 kHz (the radio's intercom and headset stages). */
function filtered(src, chain) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', '-', '-af', chain, '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-'],
    { input: Buffer.from(src.buffer, src.byteOffset, src.byteLength), maxBuffer: 1 << 28 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4).slice();
}
// crewRadio.ts's intercom: a 24 dB/oct 320 Hz–3.4 kHz band, the 1.9 kHz presence peak (+5 dB), the radio compressor
// (−26 dB, 6:1, 3 ms / 120 ms) and the tanh drive (0.25: tanh(3x) / tanh(3)); then the headset speaker every keyed
// element shares (a 4.6 kHz roll-off, ×1.15). The net static is band-passed at 1.9 kHz before the speaker.
const INTERCOM = 'highpass=f=320:width_type=q:width=0.7,highpass=f=320:width_type=q:width=0.7,lowpass=f=3400:width_type=q:width=0.75,'
  + 'lowpass=f=3400:width_type=q:width=0.75,equalizer=f=1900:width_type=q:width=0.9:g=5,acompressor=threshold=0.0501:ratio=6:attack=3:release=120:knee=2,'
  + 'aeval=tanh(3*val(0))/tanh(3)';
const HEADSET = 'lowpass=f=4600:width_type=q:width=0.6,volume=1.15';
const transmissions = [];
/** A crew's recorded take, as the radio plays it at `rate`. */
function take(lang, line, k, rate) {
  const file = join(ROOT, 'public/audio/voice', lang, `${line}_${k}.webm`);
  if (!existsSync(file)) throw Error(`score: missing crew take ${file}`);
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 26 });
  decoded.set(`voice/${lang}/${line}#${k}#false`, true);
  return atRate(new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4).slice(), rate);
}
/**
 * One transmission as crewRadio.ts keys it: the recorded key-up (×0.1), the take through the intercom from 70 % of the
 * click on, the recorded net static gated with the take (×0.07, 20 ms in, 40 ms out), the recorded release (×0.15)
 * 20 ms after the take — all through the headset speaker into the radio bus, centred and dry.
 */
function transmit(e) {
  const rate = 0.99 + (seedOf(`rate@${e.t}`) % 2001) / 100000, keyIn = recording('radio_key_in', variant('radio_key_in', e.t));
  const voice = filtered(take(e.lang, e.line, e.take ?? 0, rate), INTERCOM);
  const start = 0.005 + Math.max(0.04, keyIn.length / SR * 0.7), voiceEnd = start + voice.length / SR;
  const keyOut = recording('radio_key_out', variant('radio_key_out', e.t));
  const n = Math.ceil((voiceEnd + 0.02 + keyOut.length / SR + 0.05) * SR), out = new Float32Array(n);
  mix(out, keyIn, 0.005, 0.1);
  mix(out, voice, start, 1);
  const statik = filtered(loopRegion('radio_static_loop'), 'bandpass=f=1900:width_type=q:width=0.6');
  const s0 = Math.round((start - 0.02) * SR), s1 = Math.round((voiceEnd + 0.05) * SR), off = seedOf(`static@${e.t}`) % statik.length;
  for (let i = Math.max(0, s0); i < Math.min(n, s1 + Math.round(0.12 * SR)); i++) {
    const g = i < s0 + 0.02 * SR ? (i - s0) / (0.02 * SR) : i > s1 ? Math.max(0, 1 - (i - s1) / (0.04 * SR)) : 1;
    out[i] += statik[(off + i) % statik.length] * 0.07 * g;
  }
  mix(out, keyOut, voiceEnd + 0.02, 0.15);
  // a film keeps its crews over the fight (the game's voice bus sits lower, under a nearer world): +6 dB by default
  put(radio, filtered(out, HEADSET), e.t, db(cues.radioDb ?? 6) * (e.gain ?? 1), 0, 0);
  transmissions.push([e.t + start, e.t + voiceEnd]);
}
/**
 * A tank on the move: its engine family's recorded loop (mid or high by speed) over its track set's loop for the
 * map's ground. A pass-by (passAt + d0) gets distance gain, Doppler pitch and a left-to-right pan; else a steady bed.
 */
function drive(e) {
  const speed = e.speed ?? 8, engine = `engine_${e.engine ?? 'diesel_v12_modern'}_${speed > 7 ? 'high' : 'mid'}`;
  const tracks = `tracks_${e.tracks ?? 'heavy'}_${e.surface ?? 'earth'}_${speed > 5 ? 'fast' : 'slow'}`;
  const layers = [[loopRegion(engine), 0.8], [loopRegion(SFX_ASSETS[tracks] ? tracks : `tracks_${e.tracks ?? 'heavy'}_earth_${speed > 5 ? 'fast' : 'slow'}`), 0.7]];
  const n = Math.ceil(e.dur * SR), L = new Float32Array(n), R = new Float32Array(n);
  const tc = e.passAt ?? null, d0 = Math.max(1.5, e.d0 ?? 12);
  const pos = layers.map(() => 0);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let g = 1, ratio = 1, pan = e.pan ?? 0;
    if (tc != null) {
      const x = speed * (t - tc), d = Math.hypot(d0, x), vr = speed * x / d;
      g = Math.min(1.6, (d0 + 4) / (d + 4)); ratio = 343 / (343 + vr); pan = clamp(x / (d0 + 6), -1, 1) * (e.dir ?? 1);
    }
    const fade = Math.min(1, t / 0.08, (e.dur - t) / 0.15);
    let m = 0;
    layers.forEach(([loop, w], k) => {
      const len = loop.length, p = pos[k] % len, j = Math.floor(p), f = p - j;
      m += (loop[j] * (1 - f) + loop[(j + 1) % len] * f) * w;
      pos[k] += ratio;
    });
    m *= g * fade * (e.gain ?? 1);
    L[i] = m * Math.cos((pan + 1) * Math.PI / 4); R[i] = m * Math.sin((pan + 1) * Math.PI / 4);
  }
  putStereo(sfx, L, R, e.t, 1);
}
/** The map's recorded ambience bed (and its layer, a river or the surf) under one cut, faded at the cut points. */
function bed(e) {
  const n = Math.ceil(e.dur * SR), fadeN = Math.round(0.2 * SR);
  for (const [asset, gainDb] of [[e.asset, e.db ?? 0], ...(e.layer ? [[e.layer, e.layerDb ?? -10]] : [])]) {
    if (!SFX_ASSETS[asset]) continue;
    const stereo = SFX_ASSETS[asset].c === 2, loop = loopRegion(asset, stereo), chans = stereo ? loop : [loop, loop];
    const offset = seedOf(`${asset}@${e.t}`) % chans[0].length, g = db(gainDb + (e.level ?? -18));
    const L = new Float32Array(n), R = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const j = (offset + i) % chans[0].length, k = Math.min(1, i / fadeN, (n - 1 - i) / fadeN);
      L[i] = chans[0][j] * g * k; R[i] = chans[1][j] * g * k;
    }
    putStereo(amb, L, R, e.t, 1);
  }
}

// ------------------------------------------------------------------ the music bed (generated: music.mjs)
{
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', resolve(args.music), '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 });
  const all = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  for (let i = 0; i * 2 + 1 < all.length && i < N; i++) { music.L[i] = all[i * 2]; music.R[i] = all[i * 2 + 1]; }
}
for (const s of cues.sfx ?? []) sfxEvent(s);

const [svL, svR] = freeverb(sfxVerbSend.L, sfxVerbSend.R, { room: 0.82, damp: 0.45, width: 0.8 });
mix(sfx.L, svL, 0, 0.45); mix(sfx.R, svR, 0, 0.45);
// The beds duck under speech as the game ducks them (mixPolicy VOICE_DUCK: ambience −10 dB, 40 ms in, 450 ms out); the
// world, −4 dB in the game, gives a film's crews −6 dB (cues.worldDuckDb), and the music, which the game leaves alone,
// gives them room too (cues.musicDuckDb).
{
  const env = new Float32Array(N), atk = 1 - Math.exp(-1 / (0.04 * SR)), rel = 1 - Math.exp(-1 / (0.45 * SR));
  const on = new Uint8Array(N);
  for (const [a, b] of transmissions) for (let i = Math.max(0, Math.round(a * SR)); i < Math.min(N, Math.round(b * SR)); i++) on[i] = 1;
  for (let i = 0, v = 0; i < N; i++) { v += ((on[i] ? 1 : 0) - v) * (on[i] ? atk : rel); env[i] = v; }
  const duck = (b, dB) => { const g = db(dB) - 1; for (let i = 0; i < N; i++) if (env[i] > 1e-4) { const k = 1 + g * env[i]; b.L[i] *= k; b.R[i] *= k; } };
  duck(amb, -10); duck(sfx, cues.worldDuckDb ?? -6); duck(music, cues.musicDuckDb ?? -6);
}
mix(sfx.L, amb.L, 0, 1); mix(sfx.R, amb.R, 0, 1);
// each call's speech against what plays under it (dB RMS over the take), for the mix review
const rmsDb = (b, a0, a1) => { let s = 0, n = 0; for (let i = Math.max(0, a0); i < Math.min(N, a1); i++) { s += b.L[i] * b.L[i] + b.R[i] * b.R[i]; n += 2; } return +(10 * Math.log10(s / Math.max(1, n) + 1e-12)).toFixed(1); };
const radioLevels = transmissions.map(([a, b], i) => { const a0 = Math.round(a * SR), a1 = Math.round(b * SR), cue = (cues.sfx ?? []).filter((e) => e.kind === 'radio')[i];
  return { t: +a.toFixed(2), lang: cue?.lang, line: cue?.line, speechDb: rmsDb(radio, a0, a1), underDb: rmsDb(sfx, a0, a1) }; });
mix(sfx.L, radio.L, 0, 1); mix(sfx.R, radio.R, 0, 1);
// the sheet's hits (kit.mjs, Eleven sound effects): braams in their chords, booms and taiko on their downbeats, risers
// and swells peaking on theirs, all on the frame the generated bed only approximates; a stop cuts the music dead.
// They ride the music bus, so the ducks and the end fade shape them too.
const KIT = resolve(args.kit ?? join(ROOT, 'shots/media-r5/score-kit'));
const kit = existsSync(join(KIT, 'kit.json')) ? JSON.parse(readFileSync(join(KIT, 'kit.json'), 'utf8')) : null;
const kitDecoded = new Map();
/** A kit variant (48 kHz stereo WAV) as [L, R]. */
function kitSound(variant) {
  if (kitDecoded.has(variant.file)) return kitDecoded.get(variant.file);
  if (!existsSync(variant.file)) throw Error(`score: missing kit sound ${variant.file}`);
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', variant.file, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
  const all = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4).slice();
  const out = [all.filter((_, i) => i % 2 === 0), all.filter((_, i) => i % 2 === 1)];
  kitDecoded.set(variant.file, out); return out;
}
const HIT_DB = { braam: -2, boom: 0, taiko: -3, riser: -4, swell: -4 };
const hitsPlayed = [];
for (const h of cues.hits ?? []) {
  if (h.kind === 'stop') {
    const a = Math.round(h.t * SR), fade = Math.round(0.015 * SR);
    for (let i = Math.max(0, a - fade); i < N; i++) { const k = i >= a ? 0 : (a - i) / fade; music.L[i] *= k; music.R[i] *= k; }
    hitsPlayed.push({ t: h.t, kind: 'stop' });
    continue;
  }
  if (!kit) continue;
  const sound = kit.sounds[h.kind === 'braam' ? `braam_${h.chord ?? 'Dm'}` : h.kind] ?? (h.kind === 'braam' ? kit.sounds.braam_Dm : null);
  if (!sound) continue;
  const k = seedOf(`${h.kind}@${h.t}`) % sound.variants.length, variant = sound.variants[k], [L, R] = kitSound(variant);
  const gain = db(HIT_DB[h.kind] ?? 0) * (h.gain ?? 1);
  if (h.kind === 'riser' || h.kind === 'swell') {
    // its peak on the downbeat, cut there; a sheet lead (`sec`) shorter than the build skips the head
    const peak = Math.round(variant.peakS * SR), lead = Math.min(variant.peakS, h.sec ?? variant.peakS), from = peak - Math.round(lead * SR);
    const end = Math.min(L.length, peak + Math.round(0.03 * SR)), cutL = L.slice(from, end), cutR = R.slice(from, end);
    for (let i = 0, f = Math.round(0.03 * SR); i < f; i++) { const g = i / f, j = cutL.length - 1 - i; cutL[j] *= g; cutR[j] *= g; }
    putStereo(music, cutL, cutR, h.t - lead, gain);
  } else {
    // a hit starts on its downbeat, held for the sheet's `sec` and then faded over 0.6 s
    const hold = h.sec != null ? Math.min(L.length, Math.round((h.sec + 0.6) * SR)) : L.length, fade = Math.round(0.6 * SR);
    const cutL = L.slice(0, hold), cutR = R.slice(0, hold);
    if (h.sec != null) for (let i = 0; i < Math.min(fade, hold); i++) { const g = i / fade, j = hold - 1 - i; cutL[j] *= g; cutR[j] *= g; }
    putStereo(music, cutL, cutR, h.t, gain);
  }
  hitsPlayed.push({ t: h.t, kind: h.kind, sound: h.kind === 'braam' ? `braam_${h.chord ?? 'Dm'}` : h.kind, variant: k });
}
// ducks: automation gain windows on the music bus
for (const d of cues.ducks ?? []) {
  const a = Math.round(d.from * SR), b = Math.round(d.to * SR), fade = Math.round((d.fade ?? 0.25) * SR), g = db(d.db);
  for (let i = Math.max(0, a - fade); i < Math.min(N, b + fade); i++) { const k = i < a ? 1 - (a - i) / fade : i > b ? 1 - (i - b) / fade : 1; const gg = 1 + (g - 1) * Math.max(0, Math.min(1, k)); music.L[i] *= gg; music.R[i] *= gg; }
}
// end fade
const endFade = Math.round((cues.fadeOutSec ?? 2.5) * SR), endIdx = Math.round(DUR * SR);
for (const b of [music, sfx]) for (let i = endIdx - endFade; i < N; i++) { const k = i >= endIdx ? 0 : (endIdx - i) / endFade; b.L[i] *= k; b.R[i] *= k; }

// ------------------------------------------------------------------ write + master
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
writeWav(join(OUT, 'radio-raw.wav'), ...pre(radio, sg), frames);
const sum = { L: new Float32Array(frames), R: new Float32Array(frames) };
for (let i = 0; i < frames; i++) { sum.L[i] = music.L[i] * mg + sfx.L[i] * sg; sum.R[i] = music.R[i] * mg + sfx.R[i] * sg; }
writeWav(join(OUT, 'sum-raw.wav'), sum.L, sum.R, frames);
const lufs = cues.lufs ?? -14;
const master = (inp, outp, target = lufs) => {
  // two-pass loudnorm: measure, then apply linear normalization with the measured values, then a true-peak ceiling
  const pre = `acompressor=threshold=-10dB:ratio=1.6:attack=20:release=250:makeup=1,alimiter=limit=0.9:attack=2:release=60:level=false`;
  const m = spawnSync('ffmpeg', ['-hide_banner', '-i', inp, '-af', `${pre},loudnorm=I=${target}:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const j = JSON.parse(m.slice(m.lastIndexOf('{'), m.lastIndexOf('}') + 1));
  if (!Number.isFinite(Number(j.input_i))) return execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', inp, '-c:a', 'pcm_s24le', outp]); // a silent stem
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
  durationSec: DUR, sampleRate: SR, integratedLufs: Number(integrated), truePeakDbfs: Number(truePeak), music: { file: resolve(args.music), sha256: sha(resolve(args.music)) },
  outputs: Object.fromEntries(['mix.wav', 'music.wav', 'sfx-raw.wav'].map(f => [f, sha(join(OUT, f))])),
  recordings: [...new Set([...decoded.keys()].map(k => k.split('#')[0]))].sort(),
  radio: { transmissions: transmissions.length, seconds: +transmissions.reduce((s, [a, b]) => s + b - a, 0).toFixed(2), lines: radioLevels },
  hits: { kit: kit ? join(KIT, 'kit.json') : null, played: hitsPlayed },
  provenance: 'Music: Eleven Music (ElevenLabs), generated from this film\'s cue sheet (music.mjs). Effects and ambience: the game\'s recorded sound library (public/audio/sfx, ElevenLabs sound generation; docs/AUDIO.md). Crew voices: the game\'s recorded crew radio (public/audio/voice, ElevenLabs speech; docs/AUDIO.md) through the engine\'s intercom chain. Hits: Eleven sound effects (ElevenLabs) from the film kit (kit.mjs). Nothing synthesized.' };
writeFileSync(join(OUT, 'score-receipt.json'), JSON.stringify(receipt, null, 2));
console.log(`[score] ${DUR}s · ${integrated} LUFS · true peak ${truePeak} dBFS · ${receipt.recordings.length} recordings -> ${OUT}`);
