#!/usr/bin/env node
// make-voices.mjs — generate the battle announcer voice lines (VOICE round r3).
//
// r2 DESIGN CHANGE (kept in r3): ONE American male voice for everything,
// in the classic tank-game announcer style — the r1 four-persona crew is
// retired (preserved at shots/voices-r2/r1-full/, A/B pairs in
// shots/voices-r2/ab/). Same engine and pipeline as r1.
//
// Engine: Piper TTS (https://github.com/OHF-voice/piper1-gpl, the maintained
// line of rhasspy/piper) running 100% LOCALLY — pip-installed into a private
// venv under ~/.cache/cot-piper, voice models pulled anonymously from
// huggingface.co/rhasspy/piper-voices. No accounts, no API keys, no cloud.
//
// THE VOICE: en_US-joe-medium (OHF voice-datasets "Joe", CC0). Chosen over
// en_US-john-medium (LibriVox, public domain) by a measured bake-off on the
// battle-start line (`node tools/make-voices.mjs --bakeoff` re-runs it):
//   - gravitas: mean spectral centroid 1952 Hz vs john 2909 Hz raw,
//     1784 vs 1983 Hz after the radio chain — joe reads much darker/deeper.
//   - spectral fullness through the 300–3400 Hz intercom band: body band
//     (300–800 Hz) −25.3 dB RMS vs john −27.0 dB at ~equal full-band level —
//     joe keeps ~+1.7 dB more chest in the band that survives the radio.
//   - pace: joe says "The battle has begun!" in 1.25 s at length_scale 0.92
//     where john needs 2.01 s — joe is naturally clipped/urgent, no extreme
//     length-scale forcing needed.
// The r1 crew models (northern_english_male, john, kristin) stay cached in
// ~/.cache/cot-piper/voices for future use; only joe is required to build.
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
// Full runs also DELETE orphan .ogg files in the output dir that no longer
// appear in the line table, so retired sets never ride along as dead payload.
//
// Usage:
//   node tools/make-voices.mjs              # generate everything + verify
//   node tools/make-voices.mjs --only fire  # regenerate one line id (+verify)
//   node tools/make-voices.mjs --only fire,gun_damaged # comma-separated ids
//   node tools/make-voices.mjs --verify     # checks only, no synthesis
//   node tools/make-voices.mjs --bakeoff    # re-run the joe-vs-john metrics
//
// (Node is via nvm on this machine: export NVM_DIR="$HOME/.nvm" &&
//  . "$NVM_DIR/nvm.sh" first. Requires ffmpeg with libopus + python3 ≥3.9.)

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, unlinkSync } from 'node:fs';
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
const PAYLOAD_BUDGET_B = 600 * 1024;   // verify gate: whole voice payload

// The announcer (see bake-off notes in the header).
const ANNOUNCER = 'en_US-joe-medium';
// Runner-up kept for the re-runnable --bakeoff comparison.
const BAKEOFF_RIVAL = 'en_US-john-medium';

// ---------------------------------------------------------------------------
// Line table: file id → text + { ls (length_scale: lower = faster/more
// urgent), ns (noise_scale: expressiveness), pad (extra tail pad seconds) }.
// ONE voice, classic announcer register. Scripts are ORIGINAL — short stock
// military phrases ("Enemy spotted!", "On the way!") are generic crew
// vernacular; nothing is copied wholesale from another game's script.
// File ids MUST stay in sync with src/audio/voices.ts VOICE_LINES (verified
// below by importing it). Variants (_b/_c) give repeat plays a fresh read.
const LINES = [
  // ---- battle flow -----------------------------------------------------------
  ['battle_start',       'The battle has begun!',              { ls: 0.92 }],
  ['battle_start_b',     'Battle! Give them hell!',            { ls: 0.88, ns: 0.75 }],
  ['battle_start_c',     'All units, advance!',                 { ls: 0.88, ns: 0.72 }],
  ['on_the_move',        'Move out!',                          { ls: 0.88, pad: 0.06 }],
  ['on_the_move_b',      'Forward! Roll out!',                 { ls: 0.88 }],
  ['victory',            'Victory!',                           { ls: 0.95, ns: 0.8, pad: 0.08 }],
  ['victory_b',          'Victory is ours! Well fought!',      { ls: 0.95, ns: 0.75 }],
  ['defeat',             "We've been defeated...",             { ls: 1.08, ns: 0.55 }],
  ['defeat_b',           "We've lost this one...",             { ls: 1.08, ns: 0.55 }],
  ['draw',               "Cease fire... it's a draw.",         { ls: 1.02, ns: 0.55 }],
  // ---- gunnery ---------------------------------------------------------------
  ['firing',             'On the way!',                        { ls: 0.88 }],
  ['firing_b',           'Firing!',                            { ls: 0.86, pad: 0.06 }],
  ['firing_c',           "Shot's away!",                       { ls: 0.88 }],
  ['penetration',        'Penetration!',                       { ls: 0.88, ns: 0.75 }],
  ['penetration_b',      'Right through their armor!',         { ls: 0.87 }],
  ['penetration_c',      'Solid hit! We punched through!',     { ls: 0.86, ns: 0.72 }],
  ['ricochet',           "Didn't go through!",                 { ls: 0.88 }],
  ['ricochet_b',         'Bounced off!',                       { ls: 0.88, pad: 0.06 }],
  ['enemy_crit',         'That one hurt them!',                { ls: 0.9 }],
  ['enemy_crit_b',       'Critical hit!',                      { ls: 0.9, pad: 0.06 }],
  ['enemy_crit_c',       'Enemy systems damaged!',             { ls: 0.88, ns: 0.72 }],
  ['enemy_ammo_rack',    'We hit their ammo rack!',            { ls: 0.89, ns: 0.75 }],
  ['target_destroyed',   'Enemy vehicle destroyed!',           { ls: 0.92 }],
  ['target_destroyed_b', 'Target eliminated!',                 { ls: 0.92 }],
  ['target_destroyed_c', "That's a kill! Well done!",          { ls: 0.9, ns: 0.75 }],
  ['target_destroyed_d', 'Hostile armor knocked out!',         { ls: 0.89, ns: 0.72 }],
  // ---- survival --------------------------------------------------------------
  ['were_hit',           "We're hit!",                         { ls: 0.84, ns: 0.75 }],
  ['were_hit_b',         'They got through!',                  { ls: 0.85, ns: 0.75 }],
  ['were_hit_c',         'Hit taken! Still fighting!',         { ls: 0.86, ns: 0.72 }],
  ['bounced_us',         'Ricochet!',                          { ls: 0.87, ns: 0.75, pad: 0.06 }],
  ['bounced_us_b',       'Glanced right off!',                 { ls: 0.88 }],
  ['bounced_us_c',       'Armor held! No damage!',             { ls: 0.87, ns: 0.72 }],
  ['ammo_rack',          "Ammo rack's hit!",                   { ls: 0.84, ns: 0.75 }],
  ['ammo_rack_b',        'Ammo stowage damaged! Watch it!',    { ls: 0.84, ns: 0.78 }],
  ['fuel_tank',          "Fuel tank's hit!",                   { ls: 0.85, ns: 0.75 }],
  ['fuel_tank_b',        'Fuel system damaged!',               { ls: 0.86, ns: 0.72 }],
  ['fire',               "We're on fire! Put it out!",         { ls: 0.84, ns: 0.75 }],
  ['fire_b',             'Fire! Fire!',                        { ls: 0.84, ns: 0.8, pad: 0.06 }],
  ['fire_out',           "Fire's out.",                        { ls: 0.97 }],
  ['fire_out_b',         'Fire suppressed!',                   { ls: 0.93, ns: 0.7 }],
  ['engine_damaged',     "Engine's damaged!",                  { ls: 0.9 }],
  ['engine_damaged_b',   "Engine's hit! We're losing power!",  { ls: 0.87 }],
  ['track_gone',         "Track's gone!",                      { ls: 0.87 }],
  ['track_gone_b',       "We've lost a track!",                { ls: 0.88 }],
  ['gun_damaged',        "Gun's damaged!",                     { ls: 0.88 }],
  ['gun_damaged_b',      "Main gun's hit!",                    { ls: 0.86, ns: 0.74 }],
  ['low_hp',             'Critical damage! Hold together!',    { ls: 0.86, ns: 0.75 }],
  ['low_hp_b',           'Armor failing! Stay sharp!',         { ls: 0.86, ns: 0.75 }],
  ['optics_damaged',     'Optics are damaged!',                { ls: 0.88 }],
  ['optics_damaged_b',   'Sights are hit! Visibility reduced!', { ls: 0.86, ns: 0.72 }],
  ['radio_damaged',      "Radio's damaged!",                   { ls: 0.88 }],
  ['radio_damaged_b',    'Comms are hit! Signal is weak!',     { ls: 0.86, ns: 0.72 }],
  ['commander_down',     "Commander's down!",                  { ls: 0.84, ns: 0.76 }],
  ['commander_down_b',   "Commander hit! I'm taking over!",    { ls: 0.84, ns: 0.78 }],
  ['gunner_down',        "Gunner's down!",                     { ls: 0.84, ns: 0.76 }],
  ['gunner_down_b',      'Gunner hit! Get on the sights!',     { ls: 0.84, ns: 0.78 }],
  ['driver_down',        "Driver's down!",                     { ls: 0.84, ns: 0.76 }],
  ['driver_down_b',      'Driver hit! Controls are sluggish!', { ls: 0.84, ns: 0.78 }],
  ['loader_down',        "Loader's down!",                     { ls: 0.84, ns: 0.76 }],
  ['loader_down_b',      'Loader hit! Reload will be slower!', { ls: 0.84, ns: 0.78 }],
  ['repairs',            'Repairs complete.',                  { ls: 0.96 }],
  ['repairs_b',          "We're back in action!",              { ls: 0.92 }],
  ['repairs_c',          'Systems restored.',                  { ls: 0.94 }],
  ['crew_recovered',     'Crew is back in action!',            { ls: 0.92 }],
  ['crew_recovered_b',   'Crew stations restored!',            { ls: 0.92 }],
  ['track_repaired',     "Track's back on!",                   { ls: 0.9 }],
  ['track_repaired_b',   'Mobility restored!',                 { ls: 0.92 }],
  ['gun_repaired',       'Gun is operational!',                { ls: 0.92 }],
  ['gun_repaired_b',     "Main gun's back up!",                { ls: 0.9 }],
  ['engine_repaired',    "Engine's running again!",            { ls: 0.92 }],
  ['engine_repaired_b',  'Power restored! We can move!',       { ls: 0.9 }],
  // ---- awareness -------------------------------------------------------------
  ['enemy_spotted',      'Enemy spotted!',                     { ls: 0.9 }],
  ['enemy_spotted_b',    'Enemy vehicle spotted!',             { ls: 0.9 }],
  ['enemy_spotted_c',    'Contact! Enemy armor!',              { ls: 0.88, ns: 0.75 }],
  ['sixth_sense',        'They see us!',                       { ls: 0.86, ns: 0.75 }],
  ['sixth_sense_b',      "We've been spotted!",                { ls: 0.86 }],
  ['sixth_sense_c',      "Contact! We're detected!",           { ls: 0.85, ns: 0.75 }],
  ['reloading',          'Reloading!',                         { ls: 0.9, pad: 0.06 }],
  ['reloading_b',        'Loading another round!',             { ls: 0.9 }],
  ['reloaded',           'Loaded!',                            { ls: 0.9, pad: 0.06 }],
  ['reloaded_b',         'Up!',                                { ls: 0.92, pad: 0.14 }],
  ['reloaded_c',         'Round loaded! Ready!',               { ls: 0.92 }],
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

/** Band-limited RMS level in dBFS (bake-off fullness metric). */
function measureBandRmsDb(file, lowHz, highHz) {
  const band = (lowHz ? `highpass=f=${lowHz},` : '') + (highHz ? `lowpass=f=${highHz},` : '');
  const out = spawnSync(FFMPEG, ['-hide_banner', '-i', file,
    '-af', `${band}astats=metadata=0:measure_overall=RMS_level:measure_perchannel=none`,
    '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /RMS level dB:\s*(-?[\d.]+|-inf)/.exec(out.stderr);
  if (!m) throw new Error(`astats failed for ${file}`);
  return m[1] === '-inf' ? -Infinity : parseFloat(m[1]);
}

/** Mean spectral centroid in Hz (bake-off gravitas metric — lower = darker). */
function measureCentroidHz(file) {
  const out = spawnSync(FFMPEG, ['-hide_banner', '-i', file,
    '-af', 'aspectralstats=measure=centroid,ametadata=mode=print:file=-', '-f', 'null', '-'],
  { encoding: 'utf8' });
  let sum = 0, n = 0;
  for (const m of out.stdout.matchAll(/centroid=([\d.]+)/g)) { sum += parseFloat(m[1]); n++; }
  if (!n) throw new Error(`aspectralstats failed for ${file}`);
  return sum / n;
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
function ensurePiper(models) {
  if (!existsSync(PIPER)) {
    console.log('[voices] bootstrapping piper venv at', VENV);
    mkdirSync(CACHE, { recursive: true });
    run('python3', ['-m', 'venv', VENV]);
    run(path.join(VENV, 'bin', 'pip'), ['install', '-q', 'piper-tts']);
  }
  mkdirSync(VOICE_DIR, { recursive: true });
  for (const m of models) {
    if (!existsSync(path.join(VOICE_DIR, `${m}.onnx`))) {
      console.log('[voices] downloading voice model', m);
      run(path.join(VENV, 'bin', 'python'), ['-m', 'piper.download_voices', m, '--data-dir', VOICE_DIR]);
    }
  }
}

/** One piper synthesis (text → wav at `out`). */
function piperSynth(model, text, out, o = {}) {
  const args = ['-m', path.join(VOICE_DIR, `${model}.onnx`), '-f', out,
    '--length-scale', String(o.ls ?? 1.0),
    '--noise-scale', String(o.ns ?? 0.667),
    '--sentence-silence', '0'];
  const p = spawnSync(PIPER, args, { input: text, encoding: 'utf8' });
  if (p.status !== 0) throw new Error(`piper failed (${model}): ${p.stderr}`);
}

// --- generation ----------------------------------------------------------------
function synthesize(only) {
  const onlyIds = only ? String(only).split(',').map((s) => s.trim()).filter(Boolean) : null;
  ensurePiper([ANNOUNCER]);
  mkdirSync(OUT_DIR, { recursive: true });
  const tmp = mkdtempSync(path.join(tmpdir(), 'cot-voices-'));
  let total = 0;
  let made = 0;
  console.log(`\nannouncer: ${ANNOUNCER}\n`);
  console.log(`id                   pace  LUFS(pre→post)  bytes  text`);
  for (const [id, text, o] of LINES) {
    if (onlyIds && !onlyIds.some((pick) => id === pick || id.startsWith(pick + '_'))) continue;
    const raw = path.join(tmp, `${id}.raw.wav`);
    const proc = path.join(tmp, `${id}.proc.wav`);
    const out = path.join(OUT_DIR, `${id}.ogg`);
    // 1) neural synthesis (stdin text → wav)
    piperSynth(ANNOUNCER, text, raw, o);
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
    console.log(`${id.padEnd(20)} ${String(o.ls ?? 1).padEnd(5)} ${pre.toFixed(1)}→${post.toFixed(1)}  ${String(size).padStart(6)}  "${text}"`);
  }
  rmSync(tmp, { recursive: true, force: true });
  // Full runs sweep orphans: any .ogg in OUT_DIR that the table no longer
  // names is retired payload (e.g. the r1 crew set) and must not ship.
  if (!only) {
    const keep = new Set(LINES.map(([id]) => `${id}.ogg`));
    for (const f of readdirSync(OUT_DIR)) {
      if (f.endsWith('.ogg') && !keep.has(f)) {
        unlinkSync(path.join(OUT_DIR, f));
        console.log(`[voices] removed orphan ${f}`);
      }
    }
  }
  console.log(`\n[voices] ${made} line(s) written, batch total ${(total / 1024).toFixed(1)} KiB → ${OUT_DIR}`);
}

// --- bake-off ------------------------------------------------------------------
// Re-runnable evidence for the r2 voice choice: synthesizes the battle-start
// line in the announcer and the runner-up, then prints gravitas (spectral
// centroid — lower is darker) and fullness (band RMS) raw AND through the
// radio chain. Writes nothing under public/.
function bakeoff() {
  ensurePiper([ANNOUNCER, BAKEOFF_RIVAL]);
  const tmp = mkdtempSync(path.join(tmpdir(), 'cot-bakeoff-'));
  const text = 'The battle has begun!';
  console.log(`\nbake-off line: "${text}" (length_scale 0.92)\n`);
  for (const model of [ANNOUNCER, BAKEOFF_RIVAL]) {
    const raw = path.join(tmp, `${model}.wav`);
    const proc = path.join(tmp, `${model}.chained.wav`);
    piperSynth(model, text, raw, { ls: 0.92 });
    ffmpeg(['-i', raw, '-filter_complex', chain(0), '-map', '[out]', '-ac', '1', proc]);
    const { dur } = probeMeta(raw);
    console.log(`${model}`);
    console.log(`  raw:     centroid ${measureCentroidHz(raw).toFixed(0)} Hz · low band 80-300 Hz ${measureBandRmsDb(raw, 80, 300).toFixed(1)} dB (full ${measureBandRmsDb(raw, 0, 0).toFixed(1)} dB) · ${dur.toFixed(2)} s`);
    console.log(`  chained: centroid ${measureCentroidHz(proc).toFixed(0)} Hz · body band 300-800 Hz ${measureBandRmsDb(proc, 300, 800).toFixed(1)} dB (full ${measureBandRmsDb(proc, 0, 0).toFixed(1)} dB)`);
  }
  rmSync(tmp, { recursive: true, force: true });
  console.log(`\npick: ${ANNOUNCER} — lower centroid (gravitas) + more body through the radio band + clipped pace.`);
}

// --- verification ----------------------------------------------------------------
async function verify() {
  // The shipped mapping is the source of truth — import it so this can never
  // drift from what the game actually loads.
  const { VOICE_LINES } = await import(path.join(ROOT, 'src', 'audio', 'voices.ts'));
  const mapped = new Set();
  for (const id of Object.keys(VOICE_LINES)) for (const f of VOICE_LINES[id].files) mapped.add(f);
  const tableIds = new Set(LINES.map(([id]) => `${id}.ogg`));
  const problems = [];
  // every mapped file must be generated by this script, and vice versa
  for (const f of mapped) if (!tableIds.has(f)) problems.push(`voices.ts maps ${f} but generator table lacks it`);
  for (const f of tableIds) if (!mapped.has(f)) problems.push(`generator produces ${f} but voices.ts never plays it`);
  // orphan sweep gate: nothing unmapped may sit in the shipped folder
  for (const f of readdirSync(OUT_DIR)) {
    if (f.endsWith('.ogg') && !mapped.has(f)) problems.push(`${f}: orphan in ${OUT_DIR} (not in voices.ts mapping)`);
  }
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
  console.log(`[voices] payload: ${mapped.size} files, ${(total / 1024).toFixed(1)} KiB total (budget ${(PAYLOAD_BUDGET_B / 1024).toFixed(0)} KiB)`);
  if (total > PAYLOAD_BUDGET_B) problems.push(`payload ${(total / 1024).toFixed(1)} KiB exceeds ${(PAYLOAD_BUDGET_B / 1024).toFixed(0)} KiB budget`);
  if (problems.length) {
    console.error(`\n[voices] VERIFY FAILED:`);
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  console.log('[voices] VERIFY GREEN');
}

// --- main ----------------------------------------------------------------------
const argv = process.argv.slice(2);
if (argv.includes('--bakeoff')) {
  bakeoff();
} else {
  const onlyI = argv.indexOf('--only');
  const only = onlyI >= 0 ? argv[onlyI + 1] : null;
  if (!argv.includes('--verify')) synthesize(only);
  await verify();
}
