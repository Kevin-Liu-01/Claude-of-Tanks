// tools/audio/pcm.mjs — small PCM helpers shared by the audio tools: WAV
// framing, s16 <-> float, level/pitch/silence measurements and an ffmpeg
// runner. Node-only, no dependencies.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

export function s16ToFloat(buf) {
  const n = buf.length >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(i * 2) / 32768;
  return out;
}

/** Interleaved s16 -> per-channel float arrays. */
export function deinterleave(buf, channels) {
  const frames = Math.floor(buf.length / 2 / channels);
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < channels; c++) out[c][f] = buf.readInt16LE((f * channels + c) * 2) / 32768;
  }
  return out;
}

export function wavFromS16(pcm, sampleRate, channels = 1) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function writeWav(file, pcm, sampleRate, channels = 1) {
  writeFileSync(file, wavFromS16(pcm, sampleRate, channels));
}

/** Run ffmpeg; throws with stderr on failure. */
export function ffmpeg(args, { quiet = true } = {}) {
  const res = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', quiet ? 'error' : 'info', '-y', ...args], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0) throw new Error(`ffmpeg failed: ${res.stderr}`);
  return res.stderr;
}

/** Decode any audio file to mono float at `sampleRate` (via ffmpeg). */
export function decodeMono(file, sampleRate = 48000) {
  const res = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file,
    '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', 'pipe:1'], { maxBuffer: 512 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`decode failed: ${res.stderr}`);
  const b = res.stdout;
  return new Float32Array(b.buffer, b.byteOffset, b.length / 4).slice();
}

/** Integrated loudness / true peak / LRA by ffmpeg's EBU R128 meter. */
export function loudness(file) {
  const res = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const text = res.stderr || '';
  const tail = text.slice(text.lastIndexOf('Summary:'));
  const num = (re) => { const m = tail.match(re); return m ? Number(m[1]) : null; };
  return {
    lufs: num(/I:\s+(-?[\d.]+) LUFS/),
    lra: num(/LRA:\s+(-?[\d.]+) LU/),
    truePeak: num(/Peak:\s+(-?[\d.]+) dBFS/),
  };
}

export function rmsDb(samples, from = 0, to = samples.length) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / Math.max(1, to - from));
  return rms <= 1e-9 ? -180 : 20 * Math.log10(rms);
}

export function peakDb(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  return peak <= 1e-9 ? -180 : 20 * Math.log10(peak);
}

/** Leading/trailing silence (s) below `thresholdDb` relative to the peak, 10 ms windows. */
export function silenceBounds(samples, sampleRate, thresholdDb = -45) {
  const win = Math.max(1, Math.round(sampleRate * 0.01));
  const peak = peakDb(samples);
  const floor = peak + thresholdDb;
  let start = 0;
  while (start + win < samples.length && rmsDb(samples, start, start + win) < floor) start += win;
  let end = samples.length;
  while (end - win > start && rmsDb(samples, end - win, end) < floor) end -= win;
  return { startS: start / sampleRate, endS: end / sampleRate, durS: samples.length / sampleRate };
}

/**
 * Median fundamental frequency (Hz) of voiced 40 ms frames by normalised
 * autocorrelation, 60–400 Hz. Good enough to rank voices deep vs bright.
 */
export function medianPitchHz(samples, sampleRate) {
  const frame = Math.round(sampleRate * 0.04);
  const minLag = Math.floor(sampleRate / 400);
  const maxLag = Math.ceil(sampleRate / 60);
  const pitches = [];
  const gate = peakDb(samples) - 30;
  for (let start = 0; start + frame + maxLag < samples.length; start += frame) {
    if (rmsDb(samples, start, start + frame) < gate) continue;
    let best = 0;
    let bestLag = 0;
    let energy0 = 0;
    for (let i = 0; i < frame; i++) energy0 += samples[start + i] * samples[start + i];
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      let energy1 = 0;
      for (let i = 0; i < frame; i++) {
        corr += samples[start + i] * samples[start + i + lag];
        energy1 += samples[start + i + lag] * samples[start + i + lag];
      }
      const norm = corr / Math.sqrt(energy0 * energy1 + 1e-12);
      if (norm > best) { best = norm; bestLag = lag; }
    }
    if (best > 0.55 && bestLag) pitches.push(sampleRate / bestLag);
  }
  if (!pitches.length) return null;
  pitches.sort((a, b) => a - b);
  return pitches[pitches.length >> 1];
}

/** In-place iterative radix-2 FFT. `re`/`im` length must be a power of two. */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/**
 * Average magnitude spectrum of Hann-windowed frames (power-of-two `size`).
 * Returns { bins: Float64Array(size/2), hzPerBin }.
 */
export function averageSpectrum(samples, sampleRate, size = 2048, from = 0, to = samples.length) {
  const bins = new Float64Array(size / 2);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  let frames = 0;
  for (let start = from; start + size <= to; start += size >> 1) {
    for (let i = 0; i < size; i++) {
      re[i] = samples[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < size / 2; k++) bins[k] += Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    frames++;
  }
  if (frames) for (let k = 0; k < bins.length; k++) bins[k] /= frames;
  return { bins, hzPerBin: sampleRate / size };
}

/** Spectral centroid (Hz) of the average magnitude spectrum. */
export function spectralCentroid(samples, sampleRate) {
  const { bins, hzPerBin } = averageSpectrum(samples, sampleRate);
  let num = 0;
  let den = 0;
  for (let k = 1; k < bins.length; k++) { num += k * hzPerBin * bins[k]; den += bins[k]; }
  return den > 0 ? num / den : 0;
}

/** Share of spectral energy (0..1) in each of the given [loHz, hiHz) bands. */
export function bandEnergy(samples, sampleRate, bands) {
  const { bins, hzPerBin } = averageSpectrum(samples, sampleRate, 4096);
  let total = 0;
  const sums = bands.map(() => 0);
  for (let k = 1; k < bins.length; k++) {
    const e = bins[k] * bins[k];
    total += e;
    const hz = k * hzPerBin;
    bands.forEach(([lo, hi], i) => { if (hz >= lo && hz < hi) sums[i] += e; });
  }
  return sums.map((s) => (total > 0 ? s / total : 0));
}

export function readS16File(file) {
  return s16ToFloat(readFileSync(file));
}

/**
 * The anatomy of a gunshot (2026-10-02): a real report is an instant pressure
 * crack with a decaying body, while a cinematic "blast" swells into its peak
 * and sits on low boom. Onset = where the 1 ms envelope first climbs to within
 * 30 dB of its loudest window (walked back from the first window within 20 dB);
 * riseMs = onset → loudest 1 ms window; e10/e50/e200/e600 = share of the first
 * 2 s of energy in 0–10, 10–50, 50–200 and 200–600 ms after onset; crestDb =
 * peak over the loudest 400 ms RMS; lowBody = share below 100 Hz in 50–600 ms.
 */
/** Two-pole RBJ low/high-pass, for analysis only. */
function biquad(samples, sampleRate, type, hz, q = Math.SQRT1_2) {
  const w = (2 * Math.PI * hz) / sampleRate;
  const c = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha, a1 = -2 * c, a2 = 1 - alpha;
  const [b0, b1, b2] = type === 'lowpass' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  const out = new Float32Array(samples.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const y = (b0 * samples[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = samples[i]; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

/**
 * The longest pitched tone in the low band (25–250 Hz) and how far its pitch moves: a falling sine under a boom
 * is a cartoon boing, a rumble is not. Per 50 ms frame (hop 10 ms, within 20 dB of the loudest), the upward zero
 * crossings of the band-passed signal: a tone, even a fast sweep, crosses at regular intervals (spread < 10 %);
 * rumble does not. Returns { ms, ratio } of the longest run of regular frames (ratio = highest/lowest pitch).
 */
export function lowToneGlide(samples, sampleRate) {
  const band = biquad(biquad(biquad(samples, sampleRate, 'lowpass', 250), sampleRate, 'lowpass', 250), sampleRate, 'highpass', 25);
  const ups = [];
  for (let i = 1; i < band.length; i++) if (band[i - 1] < 0 && band[i] >= 0) ups.push(i);
  const win = Math.round(0.05 * sampleRate);
  const hop = Math.round(0.01 * sampleRate);
  const energy = [];
  let top = 0;
  for (let s = 0; s + win <= band.length; s += hop) {
    let e = 0;
    for (let i = s; i < s + win; i++) e += band[i] * band[i];
    energy.push(e);
    top = Math.max(top, e);
  }
  let run = [];
  let best = [];
  let u = 0;
  for (let s = 0, k = 0; s + win <= band.length; s += hop, k++) {
    while (u < ups.length && ups[u] < s) u++;
    const inside = [];
    for (let j = u; j < ups.length && ups[j] < s + win; j++) inside.push(ups[j]);
    let hz = 0;
    if (energy[k] >= top * 1e-2 && inside.length >= 3) {
      const iv = [];
      for (let j = 1; j < inside.length; j++) iv.push(inside[j] - inside[j - 1]);
      const mean = iv.reduce((a, v) => a + v, 0) / iv.length;
      const sd = Math.sqrt(iv.reduce((a, v) => a + (v - mean) ** 2, 0) / iv.length);
      if (sd / mean < 0.1) hz = sampleRate / mean;
    }
    if (hz) { run.push(hz); if (run.length > best.length) best = run.slice(); } else run = [];
  }
  return { ms: best.length * 10, ratio: best.length ? Math.max(...best) / Math.min(...best) : 1 };
}

export function transientAnatomy(samples, sampleRate) {
  const w1 = Math.max(1, Math.round(0.001 * sampleRate));
  const windows = Math.floor(samples.length / w1);
  const env = new Float32Array(windows);
  let peak = 0;
  let loudest = -Infinity;
  let loudestAt = 0;
  for (let k = 0; k < windows; k++) {
    let e = 0;
    for (let i = k * w1; i < (k + 1) * w1; i++) { e += samples[i] * samples[i]; peak = Math.max(peak, Math.abs(samples[i])); }
    env[k] = 10 * Math.log10(e / w1 + 1e-24);
    if (env[k] > loudest) { loudest = env[k]; loudestAt = k; }
  }
  let first = 0;
  while (first < windows && env[first] < loudest - 20) first++;
  let onsetK = first;
  while (onsetK > 0 && env[onsetK - 1] > loudest - 30) onsetK--;
  const onset = onsetK * w1;
  const block = Math.round(0.4 * sampleRate);
  let best = 0;
  for (let s = 0; s + block <= samples.length; s += Math.round(0.005 * sampleRate)) {
    let e = 0;
    for (let i = s; i < s + block; i++) e += samples[i] * samples[i];
    best = Math.max(best, e / block);
  }
  if (!best) best = Math.pow(10, rmsDb(samples) / 10);
  const energy = (a, b) => {
    let e = 0;
    const end = Math.min(samples.length, onset + Math.round(b * sampleRate));
    for (let i = onset + Math.round(a * sampleRate); i < end; i++) e += samples[i] * samples[i];
    return e;
  };
  const total = energy(0, 2) || 1e-24;
  const bodyFrom = onset + Math.round(0.05 * sampleRate);
  const bodyTo = Math.min(samples.length, onset + Math.round(0.6 * sampleRate));
  const body = new Float32Array(Math.max(4096, bodyTo - bodyFrom));
  if (bodyTo > bodyFrom) body.set(samples.subarray(bodyFrom, bodyTo));
  const [lowBody] = bandEnergy(body, sampleRate, [[20, 100]]);
  const peakDbValue = peak <= 1e-12 ? -240 : 20 * Math.log10(peak);
  return {
    riseMs: loudestAt - onsetK,
    e10: energy(0, 0.01) / total,
    e50: energy(0.01, 0.05) / total,
    e200: energy(0.05, 0.2) / total,
    e600: energy(0.2, 0.6) / total,
    crestDb: peakDbValue - 10 * Math.log10(best),
    lowBody,
  };
}
