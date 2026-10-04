#!/usr/bin/env node
// tools/audio/sfx-qa.mjs — measure raw sound-effect takes and render contact
// sheets (spectrogram + waveform per take) so a take can be judged on
// evidence: onset count (a "single shot" that came back as a burst), decay,
// band balance, loop-seam continuity, dead air.
//
//   node tools/audio/sfx-qa.mjs --ids gun_120_close,ui_click [--sheets out/] [--json out.json]

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SFX_CATALOG } from './sfx-catalog.mjs';
import { CACHE_ROOT } from './elevenlabs.mjs';
import { deinterleave, wavFromS16, ffmpeg, bandEnergy, peakDb, rmsDb, transientAnatomy, lowToneGlide } from './pcm.mjs';

const SR = 48000;

/** Mono mix of a raw stereo s16 48 kHz take. */
export function loadTake(file) {
  const [l, r] = deinterleave(readFileSync(file), 2);
  const mono = new Float32Array(l.length);
  for (let i = 0; i < l.length; i++) mono[i] = 0.5 * (l[i] + r[i]);
  return { mono, l, r };
}

function envelope(samples, winS = 0.005) {
  const win = Math.max(1, Math.round(SR * winS));
  const out = new Float32Array(Math.floor(samples.length / win));
  for (let w = 0; w < out.length; w++) {
    let peak = 0;
    for (let i = w * win; i < (w + 1) * win; i++) peak = Math.max(peak, Math.abs(samples[i]));
    out[w] = peak;
  }
  return { env: out, win };
}

/** Transient onsets: envelope rises > 9 dB within 15 ms above a −30 dB floor, ≥ 70 ms apart. */
export function onsets(samples) {
  const { env, win } = envelope(samples);
  const peak = Math.max(...env);
  const floor = peak * 0.0316;
  const found = [];
  const look = 3;
  // Silence is assumed before the file starts (a report at sample 0 is an
  // onset), and the last 20 ms are ignored (encoder/edge artefacts).
  const last = env.length - Math.ceil((0.02 * SR) / win);
  for (let i = 0; i < last; i++) {
    const prev = i >= look ? Math.max(1e-6, env[i - look]) : 1e-6;
    if (env[i] > floor && env[i] / prev > 2.8) {
      const t = (i * win) / SR;
      if (!found.length || t - found[found.length - 1] > 0.07) found.push(t);
    }
  }
  return found;
}

/** Seconds from the peak until the envelope stays below −30 dB re peak. */
export function decayS(samples) {
  const { env, win } = envelope(samples, 0.01);
  let peakI = 0;
  for (let i = 1; i < env.length; i++) if (env[i] > env[peakI]) peakI = i;
  const thresh = env[peakI] * 0.0316;
  let last = peakI;
  for (let i = peakI; i < env.length; i++) if (env[i] > thresh) last = i;
  return ((last - peakI) * win) / SR;
}

/** Loop seam: level step and spectral distance between the last and first 60 ms. */
export function seam(samples) {
  const n = Math.round(SR * 0.06);
  const head = samples.subarray(0, n);
  const tail = samples.subarray(samples.length - n);
  const levelStepDb = Math.abs(rmsDb(head) - rmsDb(tail));
  const jump = Math.abs(samples[0] - samples[samples.length - 1]);
  const bands = [[20, 200], [200, 1000], [1000, 4000], [4000, 16000]];
  const a = bandEnergy(head, SR, bands);
  const b = bandEnergy(tail, SR, bands);
  const spectral = a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0);
  return { levelStepDb: +levelStepDb.toFixed(2), jump: +jump.toFixed(4), spectral: +spectral.toFixed(3) };
}

export function measure(file, entry) {
  const { mono } = loadTake(file);
  const bands = bandEnergy(mono, SR, [[20, 150], [150, 800], [800, 4000], [4000, 20000]]);
  const on = onsets(mono);
  const result = {
    durS: +(mono.length / SR).toFixed(2),
    peakDb: +peakDb(mono).toFixed(1),
    rmsDb: +rmsDb(mono).toFixed(1),
    onsets: on.length,
    firstOnsetS: on.length ? +on[0].toFixed(3) : null,
    decayS: +decayS(mono).toFixed(2),
    bands: bands.map((v) => +v.toFixed(3)),
  };
  if (entry?.loop) result.seam = seam(mono);
  if (entry?.proc === 'gunshot' || entry?.proc === 'punch') {
    const a = transientAnatomy(mono, SR);
    result.anatomy = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, +v.toFixed(3)]));
  }
  if (entry?.proc === 'punch' || entry?.proc === 'sub') {
    const g = lowToneGlide(mono, SR);
    result.glide = { ms: g.ms, ratio: +g.ratio.toFixed(3) };
  }
  return result;
}

function contactSheet(entry, files, outDir) {
  mkdirSync(outDir, { recursive: true });
  const parts = [];
  files.forEach((file, i) => {
    const wav = join(outDir, `${entry.id}_${i}.wav`);
    writeFileSync(wav, wavFromS16(readFileSync(file), SR, 2));
    const png = join(outDir, `${entry.id}_${i}.png`);
    ffmpeg(['-i', wav, '-filter_complex',
      `[0:a]asplit=2[a][b];[a]showspectrumpic=s=900x260:legend=0:scale=log:fscale=log:color=intensity[s];[b]pan=mono|c0=0.5*c0+0.5*c1,showwavespic=s=900x90:colors=white[w];[s][w]vstack=2[out]`,
      '-map', '[out]', png]);
    parts.push(png);
  });
  const sheet = join(outDir, `${entry.id}.png`);
  if (parts.length === 1) ffmpeg(['-i', parts[0], sheet]);
  else ffmpeg([...parts.flatMap((p) => ['-i', p]), '-filter_complex', `${parts.map((_, i) => `[${i}:v]`).join('')}vstack=${parts.length}[out]`, '-map', '[out]', sheet]);
  return sheet;
}

const args = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}`) {
  const opt = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : null);
  const ids = opt('ids')?.split(',') ?? null;
  const groups = opt('groups')?.split(',') ?? null;
  const sheets = opt('sheets');
  const jsonOut = opt('json');
  const raw = opt('raw')?.split(',') ?? null;
  if (raw && sheets) {
    const files = raw.map((f) => (f.includes('/') ? f : join(CACHE_ROOT, 'sfx', `${f}.pcm`)));
    console.log(contactSheet({ id: opt('name') || 'raw' }, files, sheets));
    process.exit(0);
  }
  const index = JSON.parse(readFileSync(join(CACHE_ROOT, 'sfx-index.json'), 'utf8'));
  const report = {};
  for (const entry of SFX_CATALOG) {
    if (ids && !ids.includes(entry.id)) continue;
    if (groups && !groups.includes(entry.group)) continue;
    const files = (index[entry.id] || []).filter((f) => existsSync(f));
    if (!files.length) continue;
    report[entry.id] = files.map((f) => measure(f, entry));
    const line = report[entry.id].map((m, i) => `#${i} ${m.durS}s pk${m.peakDb} on${m.onsets}@${m.firstOnsetS} dec${m.decayS} b[${m.bands.join(',')}]${m.seam ? ` seam${JSON.stringify(m.seam)}` : ''}`).join(' | ');
    console.log(`${entry.id.padEnd(30)} ${line}`);
    if (sheets) contactSheet(entry, files, sheets);
  }
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 1));
}
