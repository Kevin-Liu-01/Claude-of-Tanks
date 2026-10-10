#!/usr/bin/env node
// tools/audio/build-sfx.mjs — choose the shipped variants among each asset's
// generated takes, master them, write public/audio/sfx/<group>/<id>_<n>.webm
// and regenerate src/audio/sfxManifest.generated.ts.
//
//   node tools/audio/build-sfx.mjs [--ids a,b] [--groups g] [--aac] [--report out.json]
//
// Selection is on evidence (tools/audio/sfx-qa.mjs measurements): signal
// level, a transient where the preset needs one, a single report for single
// shots, loop-seam continuity, no clipping runs. A pinned choice in
// tools/audio/sfx-picks.json overrides the ranking for an asset.

import { readFileSync, existsSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SFX_CATALOG } from './sfx-catalog.mjs';
import { CACHE_ROOT } from './elevenlabs.mjs';
import { deinterleave } from './pcm.mjs';
import { measure, onsets } from './sfx-qa.mjs';
import { masterTake } from './master.mjs';

/** Exactly one asset's take files (`<id>_<n>.webm|m4a`): never a longer id sharing the prefix. */
const takeFileOf = (id) => new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_\\d+\\.(webm|m4a)$`);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(ROOT, 'public', 'audio', 'sfx');
const MANIFEST = join(ROOT, 'src', 'audio', 'sfxManifest.generated.ts');
const PICKS = join(HERE, 'sfx-picks.json');
const SR = 48000;

const args = process.argv.slice(2);
const opt = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : null);
const ids = opt('ids')?.split(',') ?? null;
const groups = opt('groups')?.split(',') ?? null;
const aac = args.includes('--aac');
const reportFile = opt('report');

function clippedRun(file) {
  const buf = readFileSync(file);
  let run = 0;
  let worst = 0;
  for (let i = 0; i + 1 < buf.length; i += 2) {
    const v = Math.abs(buf.readInt16LE(i));
    run = v >= 32700 ? run + 1 : 0;
    worst = Math.max(worst, run);
  }
  return worst;
}

const PUNCHY = new Set(['weapon-close', 'gunshot', 'punch', 'sub', 'impact', 'foley', 'ui', 'radio']);
// Takes judged on low-end weight, and groups judged on staying dark (no bright, jingly takes).
// Loading machinery is judged on weight plus a clean steel transient: dark, but not dull.
const WEIGHTY = new Set(['weapon-close', 'weapon-far', 'impact', 'sub']);
const DARK_GROUPS = new Set(['ui', 'stingers', 'equipment', 'edge']);
const MECHANICAL = new Set(['mechanism']);
/** Groups whose takes may pause between events: animal calls and distant spot sounds, beds, stings. */
const SPARSE_GROUPS = new Set(['spots', 'ambience', 'stingers']);

/** Assets played once per round fired/struck: one report each, never a burst. */
const SINGLE_SHOT = /^(mg_|ac_\d+_close|ac_far_|ac_own|bullet_|ricochet_light|radio_key_in|blast_punch_)/;

/**
 * Cut a single-shot take before its second report (some generations answer a
 * "single shot" prompt with a short burst). Leaves the first report and its
 * own tail; the master's fade-out closes the cut. Only a report within 8 dB of
 * the first counts: a much quieter onset is the shot's own echo and stays.
 */
function firstShotOnly(channels, sr, entry) {
  if (!SINGLE_SHOT.test(entry.id)) return channels;
  const mono = channels.length > 1 ? channels[0].map((v, i) => 0.5 * (v + channels[1][i])) : channels[0];
  const on = onsets(mono);
  if (on.length < 2) return channels;
  const level = (t) => {
    let peak = 0;
    const from = Math.round(t * sr);
    for (let i = from; i < Math.min(mono.length, from + Math.round(0.02 * sr)); i++) peak = Math.max(peak, Math.abs(mono[i]));
    return peak;
  };
  const first = level(on[0]);
  const second = on.slice(1).find((t) => t - on[0] <= 1.2 && level(t) >= first * 0.4);
  if (second == null) return channels;
  const cut = Math.max(Math.round((on[0] + 0.06) * sr), Math.round((second - 0.008) * sr));
  return channels.map((ch) => ch.slice(0, cut));
}

/** Higher is better. */
function score(m, entry, clip) {
  let s = 0;
  s += 2 * Math.max(0, Math.min(1, (m.peakDb + 40) / 25));
  s -= clip > 24 ? 2 : clip > 6 ? 0.6 : 0;
  if (entry.loop) {
    s += 3 - Math.min(3, m.seam.levelStepDb) - 6 * m.seam.spectral;
  } else if (PUNCHY.has(entry.proc)) {
    s += m.firstOnsetS != null && m.firstOnsetS < 0.4 ? 2 : -1;
    if (SINGLE_SHOT.test(entry.id)) s -= 1.5 * Math.max(0, m.onsets - 1);
    else if (entry.proc === 'weapon-close' || /single|one single|isolated/i.test(entry.prompt)) s -= 0.3 * Math.max(0, m.onsets - 3);
  }
  // A real gun report (2026-10-02): an instant crack (energy in its first 10 ms, its loudest millisecond within
  // a few of the onset), crest, and a body that decays instead of swelling into low boom. Scoring guns on
  // low-end weight had picked exactly the cinematic blasts; a clipped crack sounds like old film.
  if (entry.proc === 'gunshot' && m.anatomy) {
    const a = m.anatomy;
    s += 3 * Math.max(0, 1 - Math.max(0, a.riseMs - 2) / 20);
    s += 8 * Math.min(0.3, a.e10);
    s += 1.5 * Math.max(0, Math.min(1, (a.crestDb - 10) / 10));
    s -= 3 * Math.max(0, a.e600 - 0.35);
    s -= 2.5 * Math.max(0, a.lowBody - 0.55);
    if (clip > 3) s -= 3;
  }
  // The punch under a report (2026-10-03): one instant air slam, over within 200 ms, all weight and no crack.
  if (entry.proc === 'punch' && m.anatomy) {
    const a = m.anatomy;
    const [low, lowMid, , high] = m.bands || [0, 0, 0, 0];
    s += 3 * Math.max(0, 1 - Math.max(0, a.riseMs - 3) / 25);
    s -= Math.min(4, 2 * Math.max(0, a.riseMs - 60) / 60);
    s += 4 * Math.min(0.85, a.e10 + a.e50 + a.e200);
    s -= 4 * Math.max(0, a.e600 - 0.15);
    s += 3 * (low + lowMid) - 4 * high;
    if (clip > 3) s -= 3;
  }
  // No boings (2026-10-03): a weight layer must be rumble, never a pitched tone falling away under the hit.
  if ((entry.proc === 'punch' || entry.proc === 'sub') && m.glide && m.glide.ms >= 60 && (m.glide.ratio >= 1.12 || m.glide.ms >= 150)) s -= 8;
  // One event, not two (2026-10-04): a take split by silence plays its opening as a lone pop or blip and its body
  // late (the AC-130 missile's ignition pop, 1.5 s of nothing, then the motor). Calls, beds and stings may pause.
  if (!entry.loop && m.split?.gapMs >= 400 && !SPARSE_GROUPS.has(entry.group)) s -= 4 + 4 * Math.min(1, (m.split.gapMs - 400) / 800);
  // Dead air: a "4 s" take whose energy is over in 0.2 s is usually a misfire.
  if (!entry.loop && m.decayS < 0.08) s -= 1;
  // A clunk or clack is one event, not a rattle of them.
  if (!entry.loop && entry.proc === 'foley' && (MECHANICAL.has(entry.group) || entry.group === 'vehicle')) s -= 0.15 * Math.max(0, m.onsets - 3);
  // Weight: a serious war game wants the low end in its guns and blasts, and
  // nothing bright or jingly in its interface, stings and mechanisms.
  const [low, lowMid, mid, high] = m.bands || [0, 0, 0, 0];
  if (WEIGHTY.has(entry.proc)) s += 4 * low - 1.5 * high;
  else if (MECHANICAL.has(entry.group)) s += 1.5 * (low + lowMid) + 0.5 * mid - 3 * Math.max(0, high - 0.3);
  else if (DARK_GROUPS.has(entry.group)) s += 1.5 * (low + lowMid) - 3 * high;
  // A battlefield bed wants body under its air: no take that is all hiss.
  else if (entry.group === 'ambience' && entry.loop) s += 1.2 * (low + lowMid) - 2 * Math.max(0, high - 0.55);
  return s;
}

const index = existsSync(join(CACHE_ROOT, 'sfx-index.json')) ? JSON.parse(readFileSync(join(CACHE_ROOT, 'sfx-index.json'), 'utf8')) : {};
const picks = existsSync(PICKS) ? JSON.parse(readFileSync(PICKS, 'utf8')) : {};
const manifestPrev = existsSync(join(HERE, '.sfx-manifest.json')) ? JSON.parse(readFileSync(join(HERE, '.sfx-manifest.json'), 'utf8')) : {};
const manifest = { ...manifestPrev };
const report = {};

for (const entry of SFX_CATALOG) {
  if (ids && !ids.includes(entry.id)) continue;
  if (groups && !groups.includes(entry.group)) continue;
  const takes = (index[entry.id] || []).filter((f) => existsSync(f));
  if (!takes.length) { console.warn(`${entry.id}: no takes`); continue; }
  const ranked = takes.map((file, take) => {
    const m = measure(file, entry);
    const clip = clippedRun(file);
    return { file, take, m, clip, s: score(m, entry, clip) };
  }).sort((a, b) => b.s - a.s);
  const pinned = picks[entry.id];
  // A single-shot gun take that was really a burst is cut to its first report; one cut to a bare click
  // (under 0.25 s) is a lost take. Ship fewer variants rather than a click, while two usable takes remain.
  const usable = (entry.proc === 'gunshot' || entry.proc === 'punch') && SINGLE_SHOT.test(entry.id)
    ? ranked.filter((r) => firstShotOnly(deinterleave(readFileSync(r.file), 2), SR, entry)[0].length >= 0.25 * SR)
    : ranked;
  const pool = usable.length >= 2 ? usable : ranked;
  const chosen = pinned ? pinned.map((t) => ranked.find((r) => r.take === t)).filter(Boolean) : pool.slice(0, entry.variants);
  const dir = join(OUT, entry.group);
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) if (takeFileOf(entry.id).test(name)) rmSync(join(dir, name));
  const files = [];
  chosen.forEach((pick, i) => {
    const channels = firstShotOnly(deinterleave(readFileSync(pick.file), 2), SR, entry);
    const facts = masterTake({ channels, sr: SR, preset: entry.proc, outBase: join(dir, `${entry.id}_${i}`), aac, shape: entry.shape });
    files.push({ ...facts, take: pick.take });
  });
  manifest[entry.id] = {
    g: entry.group,
    n: files.length,
    d: files.map((f) => f.dur),
    c: files[0].ch,
    r: files.every((f) => f.hf < 0.008) ? 24000 : 48000,
    ...(files[0].loop ? { l: [files[0].loop.start, +(files[0].loop.end).toFixed(6)] } : {}),
    kb: Math.round(files.reduce((a, f) => a + f.bytes, 0) / 1024),
  };
  report[entry.id] = { ranked: ranked.map((r) => ({ take: r.take, s: +r.s.toFixed(2), clip: r.clip, ...r.m })), shipped: files };
  console.log(`${entry.id.padEnd(34)} ${files.length} × [${files.map((f) => `${f.dur}s ${f.mMax ?? f.lufs}LU tp${f.truePeak}`).join(' | ')}] picks ${chosen.map((c) => c.take).join(',')}`);
}

// An asset dropped from the catalog leaves the manifest and the disk.
const catalogIds = new Set(SFX_CATALOG.map((entry) => entry.id));
for (const id of Object.keys(manifest)) {
  if (catalogIds.has(id)) continue;
  const dir = join(OUT, manifest[id].g);
  if (existsSync(dir)) for (const name of readdirSync(dir)) if (takeFileOf(id).test(name)) rmSync(join(dir, name));
  delete manifest[id];
  console.log(`${id.padEnd(34)} removed (no longer in the catalog)`);
}

writeFileSync(join(HERE, '.sfx-manifest.json'), JSON.stringify(manifest, null, 1));

const lines = Object.keys(manifest).sort().map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(manifest[id])},`);
writeFileSync(MANIFEST, `// Generated by tools/audio/build-sfx.mjs — do not edit by hand.
// One record per shipped sound-effect asset: g = group directory, n = variant
// count (files <id>_<0..n-1>.webm), d = durations (s), c = channels,
// r = decode sample rate (24 kHz when the asset has no energy above 10 kHz),
// l = [loopStart, loopEnd] inside the wrap-padded loop file, kb = payload.

export interface SfxAssetRecord {
  readonly g: string;
  readonly n: number;
  readonly d: readonly number[];
  readonly c: 1 | 2;
  readonly r: 24000 | 48000;
  readonly l?: readonly [number, number];
  readonly kb: number;
}

export const SFX_ASSETS: Readonly<Record<string, SfxAssetRecord>> = {
${lines.join('\n')}
};
`);
if (reportFile) writeFileSync(reportFile, JSON.stringify(report, null, 1));
const totalKb = Object.values(manifest).reduce((a, m) => a + m.kb, 0);
console.log(`manifest: ${Object.keys(manifest).length} assets, ${(totalKb / 1024).toFixed(1)} MB → ${MANIFEST}`);
