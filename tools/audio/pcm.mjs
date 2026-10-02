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
