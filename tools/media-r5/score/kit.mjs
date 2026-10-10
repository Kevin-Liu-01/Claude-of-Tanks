#!/usr/bin/env node
// The films' sound-design kit, generated (owner 2026-10-06: "use this api key for music and sound effects for media";
// 2026-10-05: recorded SFX and generated music, nothing synthesized). The cue sheets place trailer hits — a braam in
// the sheet's chord, a sub boom, a riser or a reverse swell into a downbeat, taiko — and the music model only
// approximates them: the trailer's 7.5 s title braam measured +0.9 dB on its generated bed, its strongest accents
// 100–300 ms off the beat grid. Each hit kind here is an Eleven sound effect: several takes of one prompt (cached by
// request with the credits on the ledger, tools/audio/elevenlabs.mjs), every take measured (its attack, where its peak
// falls, the pitch classes a braam rings in, a boom's low end), the best one mastered to a 48 kHz stereo WAV with its
// measurements in kit.json. score.mjs plays the sheets' hits from the kit, on the frame.
//   ELEVENLABS_API_KEY_FILE=… node tools/media-r5/score/kit.mjs [--out=shots/media-r5/score-kit] [--ids=braam_Dm,boom]
//     [--dry=1] (the plan and the credit estimate, no call)
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { soundEffect } from '../../audio/elevenlabs.mjs';
import { averageSpectrum, bandEnergy, lowToneGlide } from '../../audio/pcm.mjs';
import { fades, measureLoudness, trim } from '../../audio/master.mjs';

const SR = 48000;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([a-z-]+)=(.*)$/.exec(a); if (!m) throw Error(a); return [m[1], m[2]]; }));
const OUT = resolve(args.out ?? 'shots/media-r5/score-kit');
const ONLY = args.ids?.split(',') ?? null;

const NO = 'No music bed, no melody, no voices.';
const CHORDS = { Dm: ['D minor', [2, 5, 9]], Bb: ['B-flat major', [10, 2, 5]], F: ['F major', [5, 9, 0]], C: ['C major', [0, 4, 7]],
  Gm: ['G minor', [7, 10, 2]], A: ['A major', [9, 1, 4]] };
/** The kit: one entry per sound, a prompt (at most 450 characters), its length, the takes generated and how a take is
 * judged (`kind`). Hits peak at their start; a riser or a swell peaks at its end, on the downbeat it leads into. */
export const KIT = [
  ...Object.entries(CHORDS).map(([chord, [name, tones]]) => ({
    // (2026-10-06: in five takes the model rang G minor on C and A major on E-flat; ten give the pick a true root)
    id: `braam_${chord}`, kind: 'braam', tones, durationS: 5.5, takes: chord === 'Gm' || chord === 'A' ? 10 : 5, influence: 0.6,
    prompt: `Movie trailer braam: one enormous low brass blast holding a ${name} chord, tubas, trombones and French horns `
      + `together, dark and massive, an instant attack that swells for a beat and decays into a long hall reverb. A single hit, `
      + `no percussion. ${NO}`,
  })),
  { id: 'boom', kind: 'boom', durationS: 4, takes: 6, influence: 0.5,
    prompt: `Cinematic trailer boom: one enormous sub-bass impact, a deep low thump with a long rumbling decay, very loud, with an `
      + `immediate hard attack. A single hit. ${NO}` },
  { id: 'riser', kind: 'riser', durationS: 5, takes: 5, influence: 0.5,
    prompt: `Cinematic trailer riser: a tense rising swell of filtered noise and bowed strings climbing steadily in pitch and `
      + `volume for five seconds and cutting off sharply at its loudest point. No hit at the end, no drums. ${NO}` },
  { id: 'swell', kind: 'swell', durationS: 3, takes: 5, influence: 0.6,
    prompt: `Reverse cymbal swell: a reversed crash cymbal rising out of silence into an abrupt cut-off at its loudest, a `
      + `cinematic transition sound. Nothing after the cut-off. ${NO}` },
  { id: 'taiko', kind: 'taiko', durationS: 2.5, takes: 6, influence: 0.5, variants: 2,
    prompt: `One single huge taiko drum hit, deep and powerful, struck once with a heavy mallet in a large wooden hall, with a `
      + `natural decay. Exactly one hit, no other drums. ${NO}` },
];

/** A take's PCM (48 kHz stereo s16 from the API) as [L, R] floats. */
function stereoOf(file) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-f', 's16le', '-ar', String(SR), '-ac', '2', '-i', file, '-f', 'f32le', '-ac', '2', '-'], { maxBuffer: 1 << 28 });
  const all = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const L = new Float32Array(all.length / 2), R = new Float32Array(all.length / 2);
  for (let i = 0; i < L.length; i++) { L[i] = all[2 * i]; R[i] = all[2 * i + 1]; }
  return [L, R];
}
const db = (v) => 20 * Math.log10(Math.max(v, 1e-9));
/** The 20 ms RMS envelope (dB). */
function envelope(mono) {
  const win = SR / 50, out = [];
  for (let i = 0; i + win <= mono.length; i += win) { let s = 0; for (let k = i; k < i + win; k++) s += mono[k] * mono[k]; out.push(10 * Math.log10(s / win + 1e-12)); }
  return out;
}
/** The pitch-class profile (C = 0) of 55–1100 Hz, normalised to sum 1. */
function chroma(mono) {
  const { bins, hzPerBin } = averageSpectrum(mono, SR, 8192), pcs = new Array(12).fill(0);
  for (let b = 1; b < bins.length; b++) {
    const f = b * hzPerBin;
    if (f < 55 || f > 1100) continue;
    const pc = ((Math.round(12 * Math.log2(f / 440)) % 12) + 12 + 9) % 12;
    pcs[pc] += bins[b];
  }
  const sum = pcs.reduce((a, b) => a + b, 0) || 1;
  return pcs.map((v) => v / sum);
}

/** Measurements and a score for one take (higher is better; a rejected take scores -Infinity). */
function judge(entry, [L, R]) {
  const mono = L.map((v, i) => (v + R[i]) / 2), env = envelope(mono);
  let peak = 0; for (const v of mono) peak = Math.max(peak, Math.abs(v));
  const peakIdx = env.indexOf(Math.max(...env)), peakS = peakIdx / 50, lenS = mono.length / SR;
  const loud = env.findIndex((v) => v > env[peakIdx] - 40), attackS = Math.max(0, (peakIdx - Math.max(0, loud)) / 50);
  const tail = env.slice(peakIdx).findIndex((v) => v < env[peakIdx] - 30), decayS = tail < 0 ? lenS - peakS : tail / 50;
  const [low, lowMid, mid, high] = bandEnergy(mono, SR, [[20, 150], [150, 800], [800, 4000], [4000, 20000]]);
  const m = { lenS: +lenS.toFixed(2), peakDb: +db(peak).toFixed(1), peakS: +peakS.toFixed(2), attackS: +attackS.toFixed(2), decayS: +decayS.toFixed(2),
    lowShare: +(low / (low + lowMid + mid + high || 1)).toFixed(2) };
  const clipped = peak > 0.999;
  let score = clipped ? -2 : 0;
  if (entry.kind === 'braam') {
    const pcs = chroma(mono), share = entry.tones.reduce((a, pc) => a + pcs[pc], 0);
    m.chordShare = +share.toFixed(2);
    m.topPitch = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][pcs.indexOf(Math.max(...pcs))];
    score += 4 * share - 2 * Math.max(0, attackS - 0.35) - (peakS > 1.5 ? 2 : 0) + Math.min(decayS, 3) / 3;
  } else if (entry.kind === 'boom' || entry.kind === 'taiko') {
    // a falling sine in the low band is a cartoon boing, never a boom (build-sfx.mjs's rule for its punch and sub layers)
    const glide = lowToneGlide(mono, SR);
    m.glide = glide.ms >= 60 && (glide.ratio >= 1.12 || glide.ms >= 150);
    if (m.glide) return { m, score: -Infinity };
    score += 3 * m.lowShare - 6 * Math.max(0, attackS - (entry.kind === 'taiko' ? 0.03 : 0.06)) - (peakS > 0.4 ? 3 : 0) + Math.min(decayS, 2) / 2;
  } else {
    // a riser or a swell climbs to its peak at its very end and cuts off there
    const head = env.slice(0, Math.max(1, Math.floor(env.length * 0.25))), headDb = Math.max(...head);
    m.rise = +(env[peakIdx] - headDb).toFixed(1);
    m.peakAt = +(peakS / lenS).toFixed(2);
    score += m.rise / 10 + 4 * m.peakAt - (m.peakAt < 0.75 ? 5 : 0);
  }
  return { m, score: +score.toFixed(3) };
}

/** Master a take: trim the tail, fade, a −14 LUFS momentary-max hit (−16 for risers and swells) under a −1 dBTP limiter,
 * written as a 48 kHz stereo float WAV. A riser or a swell keeps its head (it leads into its peak). */
function master(entry, channels, outFile) {
  const kept = entry.kind === 'riser' || entry.kind === 'swell' ? channels : trim(channels, SR, { tailDb: -54, maxS: entry.durationS + 1 });
  const faded = fades(kept, SR, 0.002, entry.kind === 'riser' || entry.kind === 'swell' ? 0.02 : 0.3);
  const tmp = mkdtempSync(join(tmpdir(), 'cot-kit-'));
  try {
    const raw = join(tmp, 'raw.f32'), pre = join(tmp, 'pre.wav');
    const inter = new Float32Array(faded[0].length * 2);
    for (let i = 0; i < faded[0].length; i++) { inter[2 * i] = faded[0][i]; inter[2 * i + 1] = faded[1][i]; }
    writeFileSync(raw, Buffer.from(inter.buffer));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', raw, '-af', 'highpass=f=22:p=2', '-c:a', 'pcm_f32le', pre]);
    const before = measureLoudness(pre), target = entry.kind === 'riser' || entry.kind === 'swell' ? -16 : -14;
    const gainDb = before.mMax == null ? 0 : Math.max(-30, Math.min(30, target - before.mMax));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', pre, '-af', `volume=${gainDb.toFixed(2)}dB,alimiter=limit=${(10 ** (-1 / 20)).toFixed(4)}:attack=1:release=40:level=false`,
      '-c:a', 'pcm_f32le', outFile]);
    return { gainDb: +gainDb.toFixed(1), ...measureLoudness(outFile) };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

const entries = KIT.filter((e) => !ONLY || ONLY.includes(e.id));
const takes = entries.reduce((a, e) => a + e.takes, 0);
console.log(`[kit] ${entries.length} sounds, ${takes} takes, about ${Math.round(entries.reduce((a, e) => a + e.takes * e.durationS, 0) * 40)} credits if nothing is cached`);
if (args.dry) process.exit(0);
mkdirSync(OUT, { recursive: true });
// a run over some ids keeps the other sounds of an earlier run
const earlier = ONLY && existsSync(join(OUT, 'kit.json')) ? JSON.parse(readFileSync(join(OUT, 'kit.json'), 'utf8')) : null;
const manifest = { generated: new Date().toISOString(), provenance: 'Eleven sound effects (ElevenLabs eleven_text_to_sound_v2), generated from tools/media-r5/score/kit.mjs',
  sounds: { ...(earlier?.sounds ?? {}) } };
let credits = 0;
for (const entry of entries) {
  const judged = [];
  for (let take = 0; take < entry.takes; take++) {
    const { file, cost, cached } = await soundEffect({ text: entry.prompt, durationS: entry.durationS, promptInfluence: entry.influence, take });
    credits += cost ?? 0;
    const channels = stereoOf(file);
    judged.push({ take, file, cached, channels, ...judge(entry, channels) });
  }
  judged.sort((a, b) => b.score - a.score);
  const picks = judged.filter((j) => Number.isFinite(j.score)).slice(0, entry.variants ?? 1);
  if (!picks.length) { console.log(`[kit] ${entry.id}: no take passed`); continue; }
  manifest.sounds[entry.id] = { kind: entry.kind, prompt: entry.prompt, durationS: entry.durationS, variants: [] };
  for (const [v, pick] of picks.entries()) {
    const out = join(OUT, `${entry.id}_${v}.wav`), level = master(entry, pick.channels, out);
    manifest.sounds[entry.id].variants.push({ file: out, take: pick.take, score: pick.score, ...pick.m, ...level });
  }
  console.log(`[kit] ${entry.id}: picked take ${picks.map((p) => p.take).join('+')} of ${judged.length} (${judged.map((j) => `${j.take}:${Number.isFinite(j.score) ? j.score : 'n/a'}`).join(' ')})`
    + ` · ${JSON.stringify(picks[0].m)}`);
}
manifest.credits = credits;
writeFileSync(join(OUT, 'kit.json'), JSON.stringify(manifest, null, 1));
console.log(`[kit] ${Object.keys(manifest.sounds).length} sounds -> ${OUT}/kit.json (${credits} credits this run)`);
