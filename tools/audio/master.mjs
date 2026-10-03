// tools/audio/master.mjs — shared mastering for generated audio: mono fold,
// onset-aware trimming, fades, seamless-loop repair, wrap padding, loudness
// normalisation (momentary-max for one-shots, integrated for beds), a true
// peak ceiling, and dual encoding (WebM/Opus primary, AAC fallback for
// Safari < 17.4, which cannot decode Opus in either container it ships).
//
// Every step is deterministic: the same raw take always masters to the same
// bytes, so a re-run never churns the repository.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { bandEnergy } from './pcm.mjs';

/** Wrap padding (samples at 48 kHz) either side of a loop body. */
export const WRAP_PAD = 4096;

/**
 * Mastering presets. `mMax` = target momentary-maximum loudness (LUFS) for
 * one-shots; `integrated` = target integrated loudness for loops and beds.
 * `maxS` caps the kept length; `tailDb` is where the trimmed tail ends.
 */
export const PRESETS = {
  'weapon-close': { mono: true, mMax: -9, peak: -1, maxS: 4.5, tailDb: -54, fadeOutS: 0.14, highpass: 22, opusKbps: 80 },
  'weapon-far': { mono: true, mMax: -14, peak: -1, maxS: 5.5, tailDb: -50, fadeOutS: 0.25, highpass: 30, opusKbps: 56 },
  tail: { mono: true, mMax: -16, peak: -2, maxS: 4.5, tailDb: -50, fadeOutS: 0.4, fadeInS: 0.03, highpass: 35, opusKbps: 56 },
  impact: { mono: true, mMax: -10, peak: -1, maxS: 6, tailDb: -54, fadeOutS: 0.15, highpass: 25, opusKbps: 80 },
  foley: { mono: true, mMax: -14, peak: -1, maxS: 6, tailDb: -52, fadeOutS: 0.08, highpass: 40, opusKbps: 64 },
  oneshot: { mono: true, mMax: -12, peak: -1, maxS: 8, tailDb: -52, fadeOutS: 0.12, highpass: 30, opusKbps: 64 },
  spot: { mono: true, mMax: -18, peak: -3, maxS: 6, tailDb: -48, fadeOutS: 0.2, highpass: 60, opusKbps: 48 },
  ui: { mono: true, mMax: -16, peak: -2, maxS: 3, tailDb: -50, fadeOutS: 0.05, highpass: 60, opusKbps: 64 },
  sting: { mono: false, mMax: -14, peak: -1.5, maxS: 8, tailDb: -54, fadeOutS: 0.4, highpass: 30, opusKbps: 96 },
  radio: { mono: true, mMax: -20, peak: -3, maxS: 5, tailDb: -48, fadeOutS: 0.03, highpass: 150, opusKbps: 48 },
  loop: { mono: true, integrated: -18, peak: -1.5, loop: true, highpass: 20, opusKbps: 64 },
  ambience: { mono: false, integrated: -21, peak: -2, loop: true, highpass: 25, opusKbps: 80 },
  voice: { mono: true, integrated: -18, peak: -1.5, maxS: 6, tailDb: -42, fadeOutS: 0.04, fadeInS: 0.004, highpass: 85, opusKbps: 32, sampleRate: 24000 },
};

function run(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`${cmd} ${args.slice(0, 6).join(' ')} … failed: ${res.stderr}`);
  return res;
}

/** Fold stereo to mono without phase cancellation (fall back to the stronger side when L/R oppose). */
export function foldMono(l, r) {
  let corr = 0;
  let el = 0;
  let er = 0;
  for (let i = 0; i < l.length; i++) { corr += l[i] * r[i]; el += l[i] * l[i]; er += r[i] * r[i]; }
  const rho = corr / Math.sqrt(el * er + 1e-12);
  const out = new Float32Array(l.length);
  if (rho < -0.2) {
    const src = el >= er ? l : r;
    out.set(src);
  } else {
    for (let i = 0; i < l.length; i++) out[i] = 0.5 * (l[i] + r[i]);
  }
  return out;
}

function envelopeDb(channels, i0, i1) {
  let peak = 0;
  for (const ch of channels) for (let i = i0; i < i1; i++) peak = Math.max(peak, Math.abs(ch[i]));
  return peak <= 1e-9 ? -180 : 20 * Math.log10(peak);
}

function peakAll(channels) {
  let peak = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  return peak;
}

/**
 * Trim to the first onset (−40 dB re peak, minus a 4 ms pre-roll) and to the
 * point where the tail stays below `tailDb` re peak, capped at `maxS`.
 */
export function trim(channels, sr, { tailDb = -52, maxS = 8 } = {}) {
  const n = channels[0].length;
  const peak = peakAll(channels);
  const peakDb = peak <= 1e-9 ? -180 : 20 * Math.log10(peak);
  const win = Math.round(sr * 0.002);
  let start = 0;
  while (start + win < n && envelopeDb(channels, start, start + win) < peakDb - 40) start += win;
  start = Math.max(0, start - Math.round(sr * 0.004));
  let end = n;
  const tailWin = Math.round(sr * 0.02);
  while (end - tailWin > start && envelopeDb(channels, end - tailWin, end) < peakDb + tailDb) end -= tailWin;
  end = Math.min(n, end + Math.round(sr * 0.04), start + Math.round(maxS * sr));
  return channels.map((ch) => ch.slice(start, end));
}

/** Raised-cosine fades in place. */
export function fades(channels, sr, fadeInS = 0.0015, fadeOutS = 0.1) {
  const n = channels[0].length;
  const fi = Math.min(n, Math.round(fadeInS * sr));
  const fo = Math.min(n, Math.round(fadeOutS * sr));
  for (const ch of channels) {
    for (let i = 0; i < fi; i++) ch[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fi);
    for (let i = 0; i < fo; i++) ch[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fo);
  }
  return channels;
}

/**
 * Seamless-loop repair: crossfade the last X samples into the first X and
 * drop them, so the body's end flows into its start. Generated "loop" takes
 * are usually close already; this guarantees it.
 */
export function repairLoop(channels, sr, crossfadeS = 0.08) {
  const n = channels[0].length;
  const x = Math.min(Math.round(crossfadeS * sr), Math.floor(n / 4));
  return channels.map((ch) => {
    const out = ch.slice(0, n - x);
    for (let i = 0; i < x; i++) {
      const w = 0.5 - 0.5 * Math.cos((Math.PI * i) / x);
      // Head sample i is replaced by a blend of the tail (fading out) and head (fading in).
      out[i] = ch[n - x + i] * (1 - w) + ch[i] * w;
    }
    return out;
  });
}

/** [last P | body | first P] so any decoder offset < P still loops seamlessly. */
export function wrapPad(channels, pad = WRAP_PAD) {
  return channels.map((ch) => {
    const n = ch.length;
    const p = Math.min(pad, n);
    const out = new Float32Array(n + 2 * p);
    out.set(ch.subarray(n - p), 0);
    out.set(ch, p);
    out.set(ch.subarray(0, p), p + n);
    return out;
  });
}

function writeF32Wav(file, channels, sr) {
  const n = channels[0].length;
  const ch = channels.length;
  const data = Buffer.alloc(n * ch * 4);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) data.writeFloatLE(channels[c][i], (i * ch + c) * 4);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20);
  header.writeUInt16LE(ch, 22);
  header.writeUInt32LE(sr, 24);
  header.writeUInt32LE(sr * ch * 4, 28);
  header.writeUInt16LE(ch * 4, 32);
  header.writeUInt16LE(32, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([header, data]));
}

/** Momentary-max and integrated loudness of a wav (ffmpeg EBU R128, verbose frame log). */
export function measureLoudness(file) {
  const res = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-loglevel', 'verbose', '-i', file,
    '-af', 'apad=pad_dur=0.4,ebur128=framelog=verbose:peak=true', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const text = res.stderr || '';
  let mMax = -Infinity;
  for (const m of text.matchAll(/ M:\s*(-?[\d.]+)/g)) mMax = Math.max(mMax, Number(m[1]));
  const summary = text.slice(text.lastIndexOf('Summary:'));
  const integrated = Number((summary.match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]);
  const truePeak = Number((summary.match(/Peak:\s+(-?[\d.]+) dBFS/) || [])[1]);
  return { mMax: Number.isFinite(mMax) ? mMax : null, integrated: Number.isFinite(integrated) ? integrated : null, truePeak: Number.isFinite(truePeak) ? truePeak : null };
}

/** Share of energy above 10 kHz — decides whether a 24 kHz decode loses anything audible. */
export function highShare(mono, sr) {
  return bandEnergy(mono, sr, [[10000, sr / 2]])[0];
}

/**
 * Master one take and write `${outBase}.webm` and `${outBase}.m4a`.
 * Returns the manifest facts: duration, loop points, channel count, loudness.
 */
export function masterTake({ channels, sr, preset, outBase, aac = false }) {
  const p = PRESETS[preset];
  if (!p) throw new Error(`unknown preset ${preset}`);
  let work = p.mono && channels.length > 1 ? [foldMono(channels[0], channels[1])] : channels.map((c) => c.slice());
  let loop = null;
  if (p.loop) {
    work = repairLoop(work, sr);
    const bodyS = work[0].length / sr;
    work = wrapPad(work);
    const padS = WRAP_PAD / sr;
    loop = { start: +padS.toFixed(6), end: +(padS + bodyS).toFixed(6) };
  } else {
    work = trim(work, sr, p);
    work = fades(work, sr, p.fadeInS ?? 0.0015, p.fadeOutS ?? 0.1);
  }
  const tmp = mkdtempSync(join(tmpdir(), 'cot-master-'));
  try {
    const raw = join(tmp, 'raw.wav');
    writeF32Wav(raw, work, sr);
    const filt = `highpass=f=${p.highpass}:p=2`;
    const pre = join(tmp, 'pre.wav');
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-af', filt, '-c:a', 'pcm_f32le', pre]);
    const before = measureLoudness(pre);
    // Integrated loudness gates out clips shorter than one 400 ms block; fall
    // back on the momentary maximum (≈ integrated + 3 LU for short speech).
    const measured = p.integrated != null
      ? (before.integrated ?? (before.mMax != null ? before.mMax - 3 : null))
      : before.mMax;
    const target = p.integrated != null ? p.integrated : p.mMax;
    const gainDb = measured == null ? 0 : Math.max(-30, Math.min(30, target - measured));
    const ceiling = Math.pow(10, p.peak / 20);
    const outRate = p.sampleRate || 48000;
    const chain = `volume=${gainDb.toFixed(2)}dB,alimiter=limit=${ceiling.toFixed(4)}:attack=1:release=40:level=false${outRate !== sr ? `,aresample=${outRate}:filter_size=64:cutoff=0.95` : ''}`;
    const fin = join(tmp, 'final.wav');
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', pre, '-af', chain, '-c:a', 'pcm_f32le', fin]);
    const after = measureLoudness(fin);
    mkdirSync(dirname(outBase), { recursive: true });
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', fin, '-c:a', 'libopus', '-b:a', `${p.opusKbps}k`, '-vbr', 'on',
      '-application', preset === 'voice' ? 'voip' : 'audio', '-frame_duration', '20', '-map_metadata', '-1', `${outBase}.webm`]);
    // AAC fallback only on request: Safari decodes Opus-in-WebM from 17.4, and
    // older engines keep the procedural fallback rather than double the payload.
    if (aac) {
      run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', fin, '-c:a', 'aac', '-b:a', `${Math.round(p.opusKbps * 1.25)}k`,
        '-movflags', '+faststart', '-map_metadata', '-1', `${outBase}.m4a`]);
    }
    const durS = work[0].length / sr;
    return {
      dur: +durS.toFixed(4),
      ch: work.length,
      loop,
      gainDb: +gainDb.toFixed(2),
      lufs: after.integrated,
      mMax: after.mMax,
      truePeak: after.truePeak,
      bytes: statSync(`${outBase}.webm`).size,
      hf: +highShare(work[0], sr).toFixed(4),
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
