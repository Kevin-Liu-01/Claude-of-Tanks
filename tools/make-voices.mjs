#!/usr/bin/env node
// make-voices.mjs — generate the crew radio voice lines (VOICE round r1:
// human-like neural TTS, replacing the original robotic macOS `say` chain).
//
// Engine: Piper TTS (https://github.com/OHF-voice/piper1-gpl, the maintained
// line of rhasspy/piper) running 100% LOCALLY — pip-installed into a private
// venv under ~/.cache/cot-piper, voice models pulled anonymously from
// huggingface.co/rhasspy/piper-voices. No accounts, no API keys, no cloud.
//
// Four neural voices = four crew roles, so exchanges feel like a real crew
// on one intercom net (licenses verified per MODEL_CARD — see
// docs/ATTRIBUTION.md "Crew radio voice lines"; all four are public-domain /
// CC0 / CC BY-SA datasets — deliberately NO NonCommercial voices, so the
// voice payload never joins the NC quarantine):
//
//   COMMANDER  en_GB-northern_english_male-medium  (OpenSLR 83, CC BY-SA 4.0)
//   GUNNER     en_US-joe-medium                    (OHF voice-datasets, CC0)
//   DRIVER     en_US-john-medium                   (LibriVox, public domain)
//   LOADER     en_US-kristin-medium                (LibriVox, public domain)
//
// Pipeline per line:  piper (22 kHz mono wav, per-line pace/energy params)
//   → ffmpeg "tank intercom" chain: silence trim, speechnorm, 300–3400 Hz
//     bandpass, mild 4:1 compression, light bit-crush grit, seeded pink-noise
//     static bed, squelch clicks top and tail
//   → 2-pass loudness normalize to TARGET_LUFS (measured on looped audio so
//     sub-second calls gate correctly) with a -2 dBFS limiter ceiling
//   → mono 24 kHz Opus (.ogg, 24 kbps) under public/audio/voice/.
//
// Re-runnable end-to-end: missing venv / piper / models are bootstrapped
// automatically (anonymous downloads only). Output differs slightly run-to-run
// (VITS sampling noise) — loudness is re-normalized every run, so that's fine.
//
// Usage:
//   node tools/make-voices.mjs              # generate everything + verify
//   node tools/make-voices.mjs --only fire  # regenerate one line id (+verify)
//   node tools/make-voices.mjs --verify     # checks only, no synthesis
//
// (Node is via nvm on this machine: export NVM_DIR="$HOME/.nvm" &&
//  . "$NVM_DIR/nvm.sh" first. Requires ffmpeg with libopus + python3 ≥3.9.)

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'audio', 'voice');
const FFMPEG = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg';
const FFPROBE = process.env.FFPROBE || '/opt/homebrew/bin/ffprobe';
const CACHE = process.env.COT_PIPER_CACHE || path.join(homedir(), '.cache', 'cot-piper');
const VENV = path.join(CACHE, 'venv');
const PIPER = path.join(VENV, 'bin', 'piper');
const VOICE_DIR = path.join(CACHE, 'voices');

// Loudness target: matched to the pre-existing mix (old set ≈ -19 LUFS int).
const TARGET_LUFS = -19.0;
const LUFS_TOL = 1.5;        // verify gate: ± this many LU
const PEAK_CEIL_DB = -1.0;   // verify gate: no sample above this (limiter at -2)
const DUR_MIN_S = 0.4;
const DUR_MAX_S = 2.5;

// ---------------------------------------------------------------------------
// Crew personas. length/noise scales lean "clipped radio discipline" — a bit
// faster than audiobook pace, moderate energy so the compressor does the rest.
const CREW = {
  commander: { model: 'en_GB-northern_english_male-medium', tag: 'CMD' },
  gunner:    { model: 'en_US-joe-medium',                   tag: 'GNR' },
  driver:    { model: 'en_US-john-medium',                  tag: 'DRV' },
  loader:    { model: 'en_US-kristin-medium',               tag: 'LDR' },
};

// Line table: file id → { role, text, ls (length_scale: lower = faster/more
// urgent), ns (noise_scale: expressiveness), pad (extra tail pad seconds) }.
// File ids MUST stay in sync with src/audio/voices.js VOICE_LINES (verified
// below by importing it). Variants (_b/_c) give repeat plays a fresh read.
const LINES = [
  // spotting / kills — commander calls contacts, gunner confirms kills
  ['enemy_spotted',      'commander', 'Enemy spotted.',        { ls: 0.92 }],
  ['enemy_spotted_b',    'commander', 'Contact! Enemy armor.', { ls: 0.90 }],
  ['enemy_spotted_c',    'gunner',    'Enemy in sight.',       { ls: 0.92 }],
  ['target_destroyed',   'gunner',    'Target destroyed.',     { ls: 0.95 }],
  ['target_destroyed_b', 'commander', 'Enemy down. Good kill.',{ ls: 0.95 }],
  ['target_destroyed_c', 'gunner',    "Got him! Target's down.", { ls: 0.90 }],
  // taking hits
  ['were_hit',           'driver',    "We're hit!",            { ls: 0.85, ns: 0.75 }],
  ['were_hit_b',         'loader',    'We took a hit!',        { ls: 0.85, ns: 0.75 }],
  ['bounced_us',         'driver',    'They bounced us!',      { ls: 0.87 }],
  ['bounced_us_b',       'commander', 'Armor held!',           { ls: 0.90 }],
  // our shell bounced off the enemy (gunner's report)
  ['ricochet',           'gunner',    'Ricochet!',             { ls: 0.88, ns: 0.75 }],
  ['ricochet_b',         'gunner',    'No penetration!',       { ls: 0.88 }],
  // module damage / survival
  ['ammo_rack',          'loader',    "Ammo rack's hit!",      { ls: 0.84, ns: 0.75 }],
  ['fire',               'driver',    'Fire! Put it out!',     { ls: 0.84, ns: 0.75 }],
  ['fire_b',             'loader',    "We're burning!",        { ls: 0.84, ns: 0.75 }],
  ['fire_out',           'loader',    "Fire's out.",           { ls: 0.97 }],
  ['engine_damaged',     'driver',    "Engine's hit.",         { ls: 0.92 }],
  ['engine_damaged_b',   'driver',    'Losing power!',         { ls: 0.88 }],
  ['track_gone',         'driver',    "Track's gone!",         { ls: 0.87 }],
  ['track_gone_b',       'driver',    'We lost a track!',      { ls: 0.88 }],
  ['gun_damaged',        'gunner',    "Gun's damaged!",        { ls: 0.88 }],
  // loading / movement / flavor
  ['reloaded',           'loader',    'Loaded!',               { ls: 0.90, pad: 0.06 }],
  ['reloaded_b',         'loader',    'Up!',                   { ls: 0.92, pad: 0.14 }],
  ['reloaded_c',         'loader',    'Round loaded.',         { ls: 0.95 }],
  ['on_the_move',        'driver',    'On the move.',          { ls: 0.95 }],
  ['on_the_move_b',      'driver',    'Rolling out.',          { ls: 0.93 }],
  ['firing',             'gunner',    'Firing!',               { ls: 0.88, pad: 0.06 }],
  ['firing_b',           'gunner',    'On the way!',           { ls: 0.90 }],
  ['repairs',            'driver',    'Repairs done.',         { ls: 0.96 }],
  ['repairs_b',          'loader',    "We're patched up.",     { ls: 0.95 }],
];

// The intercom chain (pre-gain). Kept from the original SOUND overhaul and
// tuned for neural input: bandpass widened to 3.4 kHz, compression eased to
// 4:1, bit-crush grit dialed down (mix .10) so it flavors the radio without
// re-robotizing the voice. Squelch click in, speech over a faint static bed,
// squelch tail out. All noise seeds fixed.
function chain(extraPad) {
  const pad = (0.06 + (extraPad || 0)).toFixed(2);
  return (
    '[0:a]aresample=24000,' +
    'silenceremove=start_periods=1:start_threshold=-42dB,' +
    'areverse,silenceremove=start_periods=1:start_threshold=-42dB,areverse,' +
    'speechnorm=e=3:r=0.0001:l=1,' +
    'highpass=f=300,lowpass=f=3400,' +
    'acompressor=threshold=-17dB:ratio=4:attack=3:release=80:makeup=3dB,' +
    'acrusher=level_in=2:level_out=0.9:bits=10:mode=log:aa=1:mix=0.10,' +
    `apad=pad_dur=${pad}[v];` +
    'anoisesrc=color=pink:amplitude=1:seed=42[n0];' +
    '[n0]highpass=f=350,lowpass=f=2800,volume=0.021[nb];' +
    '[v][nb]amix=inputs=2:duration=first:dropout_transition=0[body];' +
    'anoisesrc=color=white:amplitude=1:seed=7:duration=0.026[c0];' +
    '[c0]highpass=f=1200,lowpass=f=3400,volume=0.45,afade=t=out:st=0.010:d=0.016[k1];' +
    'anoisesrc=color=white:amplitude=1:seed=9:duration=0.05[c1];' +
    '[c1]highpass=f=900,lowpass=f=3200,volume=0.40,afade=t=out:st=0.015:d=0.035[k2];' +
    '[k1][body][k2]concat=n=3:v=0:a=1[out]'
  );
}

// --- helpers -----------------------------------------------------------------
function run(cmd, args, opts) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts });
}

function ffmpeg(args) { return run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...args]); }

/** Integrated LUFS of a file, measured on N+1 concatenated copies so ebur128
 *  gating has enough material even for half-second calls. */
function measureLufs(file, loops = 5) {
  const out = spawnSync(FFMPEG, ['-hide_banner', '-stream_loop', String(loops), '-i', file,
    '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /I:\s*(-?[\d.]+)\s*LUFS/.exec(out.stderr);
  if (!m) throw new Error(`ebur128 failed for ${file}`);
  return parseFloat(m[1]);
}

/** Peak sample level in dBFS via astats. */
function measurePeakDb(file) {
  const out = spawnSync(FFMPEG, ['-hide_banner', '-i', file,
    '-af', 'astats=metadata=0:measure_overall=Peak_level:measure_perchannel=none',
    '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /Peak level dB:\s*(-?[\d.]+|-inf)/.exec(out.stderr);
  if (!m) throw new Error(`astats failed for ${file}`);
  return m[1] === '-inf' ? -Infinity : parseFloat(m[1]);
}

function probeMeta(file) {
  const dur = parseFloat(run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', file]).trim());
  const codec = run(FFPROBE, ['-v', 'error', '-select_streams', 'a:0', '-show_entries',
    'stream=codec_name,channels', '-of', 'csv=p=0', file]).trim();
  return { dur, codec };
}

/** Node-side decode check: full decode to null, any decoder complaint fails. */
function decodeCheck(file) {
  const out = spawnSync(FFMPEG, ['-v', 'error', '-i', file, '-f', 'null', '-'], { encoding: 'utf8' });
  if (out.status !== 0 || (out.stderr && out.stderr.trim())) {
    throw new Error(`decode check failed for ${file}: ${out.stderr.trim() || 'exit ' + out.status}`);
  }
}

// --- bootstrap: venv + piper + models (all anonymous downloads) ---------------
function ensurePiper() {
  if (!existsSync(PIPER)) {
    console.log('[voices] bootstrapping piper venv at', VENV);
    mkdirSync(CACHE, { recursive: true });
    run('python3', ['-m', 'venv', VENV]);
    run(path.join(VENV, 'bin', 'pip'), ['install', '-q', 'piper-tts']);
  }
  mkdirSync(VOICE_DIR, { recursive: true });
  const models = [...new Set(Object.values(CREW).map((c) => c.model))];
  for (const m of models) {
    if (!existsSync(path.join(VOICE_DIR, `${m}.onnx`))) {
      console.log('[voices] downloading voice model', m);
      run(path.join(VENV, 'bin', 'python'), ['-m', 'piper.download_voices', m, '--data-dir', VOICE_DIR]);
    }
  }
}

// --- generation ----------------------------------------------------------------
function synthesize(only) {
  ensurePiper();
  mkdirSync(OUT_DIR, { recursive: true });
  const tmp = mkdtempSync(path.join(tmpdir(), 'cot-voices-'));
  let total = 0;
  let made = 0;
  console.log(`\nid                   role  pace  LUFS(pre→post)  bytes  text`);
  for (const [id, role, text, o] of LINES) {
    if (only && id !== only && !id.startsWith(only + '_')) continue;
    const crew = CREW[role];
    const raw = path.join(tmp, `${id}.raw.wav`);
    const proc = path.join(tmp, `${id}.proc.wav`);
    const out = path.join(OUT_DIR, `${id}.ogg`);
    // 1) neural synthesis (stdin text → wav)
    const args = ['-m', path.join(VOICE_DIR, `${crew.model}.onnx`), '-f', raw,
      '--length-scale', String(o.ls ?? 1.0),
      '--noise-scale', String(o.ns ?? 0.667),
      '--sentence-silence', '0'];
    const p = spawnSync(PIPER, args, { input: text, encoding: 'utf8' });
    if (p.status !== 0) throw new Error(`piper failed for ${id}: ${p.stderr}`);
    // 2) radio chain (pre-gain)
    ffmpeg(['-i', raw, '-filter_complex', chain(o.pad), '-map', '[out]', '-ac', '1', proc]);
    // 3) 2-pass loudness: measure looped, apply gain, limit, encode opus
    const pre = measureLufs(proc);
    const gain = (TARGET_LUFS - pre).toFixed(2);
    ffmpeg(['-i', proc, '-af', `volume=${gain}dB,alimiter=limit=0.79:level=false:attack=1:release=20`,
      '-ac', '1', '-ar', '24000', '-c:a', 'libopus', '-b:a', '24k', out]);
    const post = measureLufs(out);
    const size = statSync(out).size;
    total += size;
    made++;
    console.log(`${id.padEnd(20)} ${crew.tag}   ${String(o.ls ?? 1).padEnd(5)} ${pre.toFixed(1)}→${post.toFixed(1)}  ${String(size).padStart(6)}  "${text}"`);
  }
  rmSync(tmp, { recursive: true, force: true });
  console.log(`\n[voices] ${made} line(s) written, batch total ${(total / 1024).toFixed(1)} KiB → ${OUT_DIR}`);
}

// --- verification ----------------------------------------------------------------
async function verify() {
  // The shipped mapping is the source of truth — import it so this can never
  // drift from what the game actually loads.
  const { VOICE_LINES } = await import(path.join(ROOT, 'src', 'audio', 'voices.js'));
  const mapped = new Set();
  for (const id of Object.keys(VOICE_LINES)) for (const f of VOICE_LINES[id].files) mapped.add(f);
  const tableIds = new Set(LINES.map(([id]) => `${id}.ogg`));
  const problems = [];
  // every mapped file must be generated by this script, and vice versa
  for (const f of mapped) if (!tableIds.has(f)) problems.push(`voices.js maps ${f} but generator table lacks it`);
  for (const f of tableIds) if (!mapped.has(f)) problems.push(`generator produces ${f} but voices.js never plays it`);
  let total = 0;
  console.log(`\nverify: ${mapped.size} mapped files  (target ${TARGET_LUFS} LUFS ±${LUFS_TOL}, peak ≤ ${PEAK_CEIL_DB} dBFS, ${DUR_MIN_S}–${DUR_MAX_S}s)`);
  for (const f of [...mapped].sort()) {
    const file = path.join(OUT_DIR, f);
    if (!existsSync(file)) { problems.push(`${f}: MISSING`); continue; }
    const { dur, codec } = probeMeta(file);
    const lufs = measureLufs(file);
    const peak = measurePeakDb(file);
    total += statSync(file).size;
    try { decodeCheck(file); } catch (e) { problems.push(String(e.message)); }
    const flags = [];
    if (!codec.startsWith('opus') || !codec.endsWith('1')) flags.push(`codec=${codec}`);
    if (dur < DUR_MIN_S || dur > DUR_MAX_S) flags.push(`dur=${dur.toFixed(2)}s`);
    if (Math.abs(lufs - TARGET_LUFS) > LUFS_TOL) flags.push(`I=${lufs.toFixed(1)}LUFS`);
    if (peak > PEAK_CEIL_DB) flags.push(`peak=${peak.toFixed(2)}dB`);
    if (flags.length) problems.push(`${f}: ${flags.join(' ')}`);
    console.log(`  ${flags.length ? 'FAIL' : ' ok '} ${f.padEnd(24)} ${dur.toFixed(2)}s  I=${lufs.toFixed(1)}  peak=${peak.toFixed(1)}dB`);
  }
  console.log(`[voices] payload: ${mapped.size} files, ${(total / 1024).toFixed(1)} KiB total`);
  if (problems.length) {
    console.error(`\n[voices] VERIFY FAILED:`);
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  console.log('[voices] VERIFY GREEN');
}

// --- main ----------------------------------------------------------------------
const argv = process.argv.slice(2);
const onlyI = argv.indexOf('--only');
const only = onlyI >= 0 ? argv[onlyI + 1] : null;
if (!argv.includes('--verify')) synthesize(only);
await verify();
