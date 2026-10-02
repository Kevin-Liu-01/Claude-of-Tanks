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

const PUNCHY = new Set(['weapon-close', 'impact', 'foley', 'ui', 'radio']);
// Takes judged on low-end weight, and groups judged on staying dark (no bright, jingly takes).
const WEIGHTY = new Set(['weapon-close', 'weapon-far', 'impact']);
const DARK_GROUPS = new Set(['ui', 'stingers', 'mechanism', 'equipment', 'edge']);

/** Assets played once per round fired/struck: one report each, never a burst. */
const SINGLE_SHOT = /^(mg_|ac_\d+_close|ac_far_|bullet_|ricochet_light|radio_key_in)/;

/**
 * Cut a single-shot take before its second report (some generations answer a
 * "single shot" prompt with a short burst). Leaves the first report and its
 * own tail; the master's fade-out closes the cut.
 */
function firstShotOnly(channels, sr, entry) {
  if (!SINGLE_SHOT.test(entry.id)) return channels;
  const mono = channels.length > 1 ? channels[0].map((v, i) => 0.5 * (v + channels[1][i])) : channels[0];
  const on = onsets(mono);
  if (on.length < 2) return channels;
  const gap = on[1] - on[0];
  if (gap > 1.2) return channels;
  const cut = Math.max(Math.round((on[0] + 0.06) * sr), Math.round((on[1] - 0.008) * sr));
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
  // Dead air: a "4 s" take whose energy is over in 0.2 s is usually a misfire.
  if (!entry.loop && m.decayS < 0.08) s -= 1;
  // Weight: a serious war game wants the low end in its guns and blasts, and
  // nothing bright or jingly in its interface, stings and mechanisms.
  const [low, lowMid, , high] = m.bands || [0, 0, 0, 0];
  if (WEIGHTY.has(entry.proc)) s += 4 * low - 1.5 * high;
  else if (DARK_GROUPS.has(entry.group)) s += 1.5 * (low + lowMid) - 3 * high;
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
  const chosen = pinned ? pinned.map((t) => ranked.find((r) => r.take === t)).filter(Boolean) : ranked.slice(0, entry.variants);
  const dir = join(OUT, entry.group);
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) if (takeFileOf(entry.id).test(name)) rmSync(join(dir, name));
  const files = [];
  chosen.forEach((pick, i) => {
    const channels = firstShotOnly(deinterleave(readFileSync(pick.file), 2), SR, entry);
    const facts = masterTake({ channels, sr: SR, preset: entry.proc, outBase: join(dir, `${entry.id}_${i}`), aac });
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
