#!/usr/bin/env node
// make-voices.mjs — generate the crew radio voice lines (SOUND overhaul).
//
// 100% original synthesis: macOS `say` text-to-speech (three distinct system
// voices = three crew roles) piped through an ffmpeg "tank intercom" chain —
// silence trim, speech normalize, 300–3000 Hz bandpass, compression, bit-crush
// grit, pink-noise static bed, squelch clicks top and tail — encoded to tiny
// mono 24 kHz Opus (.ogg) files under public/audio/voice/.
//
// No third-party recordings are used anywhere in this pipeline, so there is
// nothing to license; the method is recorded in docs/ATTRIBUTION.md.
//
// Usage: node tools/make-voices.mjs   (re-run any time; output is deterministic
//        modulo the say engine). Requires macOS `say` + ffmpeg with libopus.

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'audio', 'voice');
const FFMPEG = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg';

// Crew roles → macOS voices (all ship with macOS, no downloads):
//   commander = Daniel (en_GB), gunner = Ralph (deep en_US), driver = Fred
//   (classic clipped en_US). The radio chain unifies them into one net.
const LINES = [
  // id                 role/voice   rate  text (short, dry, military)
  ['enemy_spotted',     'Daniel',    195, 'Enemy spotted.'],
  ['target_destroyed',  'Daniel',    195, 'Target destroyed.'],
  ['target_destroyed_b','Ralph',     200, 'Enemy tank down.'],
  ['were_hit',          'Ralph',     215, "We're hit!"],
  ['ricochet',          'Ralph',     215, 'Ricochet!'],
  ['bounced_us',        'Fred',      205, 'They bounced us!'],
  ['ammo_rack',         'Daniel',    215, "Ammo rack's hit!"],
  ['fire',              'Ralph',     220, 'Fire! Put it out!'],
  ['fire_out',          'Fred',      195, "Fire's out."],
  ['engine_damaged',    'Fred',      200, "Engine's damaged."],
  ['track_gone',        'Fred',      210, "Track's gone!"],
  ['gun_damaged',       'Ralph',     210, "Gun's damaged!"],
  ['reloaded',          'Ralph',     205, 'Reloaded.'],
  ['reloaded_b',        'Ralph',     235, 'Up!'],
  ['on_the_move',       'Fred',      195, 'On the move.'],
  ['firing',            'Ralph',     220, 'Firing!'],
  ['repairs',           'Fred',      195, 'Repairs complete.'],
];

// The intercom chain. Squelch click in, speech body over a faint static bed,
// squelch click out. All seeds fixed so re-runs are stable.
const CHAIN =
  '[0:a]aresample=24000,' +
  'silenceremove=start_periods=1:start_threshold=-42dB,' +
  'areverse,silenceremove=start_periods=1:start_threshold=-42dB,areverse,' +
  'speechnorm=e=4:r=0.0001:l=1,' +
  'highpass=f=300,lowpass=f=3000,' +
  'acompressor=threshold=-18dB:ratio=6:attack=2:release=70:makeup=4dB,' +
  'acrusher=level_in=3:level_out=0.9:bits=9:mode=log:aa=1:mix=0.22,' +
  'apad=pad_dur=0.05[v];' +
  'anoisesrc=color=pink:amplitude=1:seed=42[n0];' +
  '[n0]highpass=f=350,lowpass=f=2800,volume=0.026[nb];' +
  '[v][nb]amix=inputs=2:duration=first:dropout_transition=0,' +
  'alimiter=limit=0.85:level=false[body];' +
  'anoisesrc=color=white:amplitude=1:seed=7:duration=0.028[c0];' +
  '[c0]highpass=f=1200,lowpass=f=3400,volume=0.5,afade=t=out:st=0.012:d=0.016[k1];' +
  'anoisesrc=color=white:amplitude=1:seed=9:duration=0.045[c1];' +
  '[c1]highpass=f=900,lowpass=f=3200,volume=0.42,afade=t=out:st=0.015:d=0.03[k2];' +
  '[k1][body][k2]concat=n=3:v=0:a=1[out]';

mkdirSync(OUT_DIR, { recursive: true });
const tmp = mkdtempSync(path.join(tmpdir(), 'cot-voices-'));

let total = 0;
const rows = [];
for (const [id, voice, rate, text] of LINES) {
  const raw = path.join(tmp, `${id}.wav`);
  const out = path.join(OUT_DIR, `${id}.ogg`);
  execFileSync('say', ['-v', voice, '-r', String(rate), '-o', raw,
    '--data-format=LEI16@22050', text]);
  execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error',
    '-i', raw, '-filter_complex', CHAIN, '-map', '[out]',
    '-ac', '1', '-ar', '24000', '-c:a', 'libopus', '-b:a', '24k', out]);
  const size = statSync(out).size;
  total += size;
  rows.push({ id, voice, rate, text, bytes: size });
  console.log(`${id.padEnd(20)} ${voice.padEnd(7)} r=${rate}  ${String(size).padStart(6)} B  "${text}"`);
}
rmSync(tmp, { recursive: true, force: true });
console.log(`\n${rows.length} lines, total ${(total / 1024).toFixed(1)} KiB → ${OUT_DIR}`);
