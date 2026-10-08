#!/usr/bin/env node
// tools/audio/loudness-receipt.mjs — measure shipped sound-effect files as they ship (the decoded WebM/Opus, on the
// same EBU R128 meter build-sfx masters with) and record each variant's loudness, true peak, channels, duration and
// SHA-256 in tools/audio/sfx-loudness.json. src/audio/sfxLoudness.selftest.mjs checks that record against the files
// (by hash), the manifest and the mastering preset's target, with no ffmpeg needed.
//
//   node tools/audio/loudness-receipt.mjs --ids a,b,c      measure these assets and merge them into the record
//   node tools/audio/loudness-receipt.mjs --check          re-measure every recorded asset and fail on any drift
//
// Run it after build-sfx for every asset a round adds or rebuilds (2026-10-06: the 2.0 revival's twenty).

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SFX_CATALOG } from './sfx-catalog.mjs';
import { measureLoudness } from './master.mjs';
import { decodeMono } from './pcm.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const RECORD = join(HERE, 'sfx-loudness.json');
const MANIFEST = join(HERE, '.sfx-manifest.json');

const args = process.argv.slice(2);
const opt = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : null);
const check = args.includes('--check');
const record = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, 'utf8')) : {};
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const ids = check ? Object.keys(record) : (opt('ids')?.split(',').filter(Boolean) ?? []);
if (!ids.length) {
  console.log('usage: loudness-receipt.mjs --ids a,b | --check');
  process.exit(1);
}

const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

function measureFile(file) {
  const bytes = readFileSync(file);
  const loud = measureLoudness(file);
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    durS: +(decodeMono(file, 48000).length / 48000).toFixed(3),
    mMax: round1(loud.mMax),
    integrated: round1(loud.integrated),
    truePeak: round1(loud.truePeak),
  };
}

let drift = 0;
for (const id of ids) {
  const entry = SFX_CATALOG.find((e) => e.id === id);
  const rec = manifest[id];
  if (!entry || !rec) throw new Error(`${id}: not in the catalog and the manifest`);
  const variants = [];
  for (let i = 0; i < rec.n; i++) variants.push(measureFile(join(ROOT, 'public', 'audio', 'sfx', rec.g, `${id}_${i}.webm`)));
  const next = { group: rec.g, preset: entry.proc, channels: rec.c, variants };
  if (check) {
    const prev = record[id];
    const same = JSON.stringify(prev) === JSON.stringify(next);
    if (!same) { drift++; console.log(`${id.padEnd(22)} DRIFT`); } else console.log(`${id.padEnd(22)} ok`);
    continue;
  }
  record[id] = next;
  console.log(`${id.padEnd(22)} ${entry.proc.padEnd(9)} ${variants.map((v) => `M${v.mMax} I${v.integrated} tp${v.truePeak} ${v.durS}s`).join(' | ')}`);
}
if (check) {
  console.log(drift ? `${drift} recorded assets drifted` : `${ids.length} recorded assets match their files`);
  process.exit(drift ? 1 : 0);
}
const sorted = Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]]));
writeFileSync(RECORD, `${JSON.stringify(sorted, null, 1)}\n`);
console.log(`${Object.keys(sorted).length} assets recorded → ${RECORD}`);
