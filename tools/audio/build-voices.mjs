#!/usr/bin/env node
// tools/audio/build-voices.mjs — generate, verify and master the national
// crew radio packs.
//
//   ELEVENLABS_API_KEY_FILE=… node tools/audio/build-voices.mjs [--langs de,ru] [--lines fire,were_hit] [--no-verify] [--budget 25000] [--attempts 3]
//
// Per take: eleven_v4 speech in the crew language with the line's delivery as
// an audio tag, spoken by the role's cast voice (tools/audio/crew-voices.json:
// commander = voice A, gunner/loader/driver = voice B). Each take is
// round-tripped through speech-to-text; a take whose transcript drifts from
// the script, or that says the call twice, is regenerated (three attempts by
// default, best kept; earlier attempts come from the cache, so a re-run with
// --attempts 8 on the flagged lines only pays for the new ones). Clean takes
// are mastered dry (−18 LUFS, 24 kHz mono Opus) — the radio/intercom chain
// is real-time DSP in the engine so it can degrade with the radio module.
//
// Writes public/audio/voice/<lang>/<line>_<n>.webm and
// src/audio/voiceManifest.generated.ts.

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { speech, transcribe, ElevenLabsError } from './elevenlabs.mjs';
import { s16ToFloat, wavFromS16 } from './pcm.mjs';
import { masterTake } from './master.mjs';

/** Exactly one asset's take files (`<id>_<n>.webm|m4a`): never a longer id sharing the prefix. */
const takeFileOf = (id) => new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_\\d+\\.(webm|m4a)$`);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(ROOT, 'public', 'audio', 'voice');
const MANIFEST = join(ROOT, 'src', 'audio', 'voiceManifest.generated.ts');
const STATE = join(HERE, '.voice-manifest.json');

const args = process.argv.slice(2);
const opt = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : null);
const langsArg = opt('langs')?.split(',') ?? null;
const linesArg = opt('lines')?.split(',') ?? null;
const verify = !args.includes('--no-verify');
const budget = Number(opt('budget') || Infinity);
const attempts = Number(opt('attempts') || 3);

const script = JSON.parse(readFileSync(join(HERE, 'crew-lines.json'), 'utf8'));
const { cast } = JSON.parse(readFileSync(join(HERE, 'crew-voices.json'), 'utf8'));
const LANG_CODE = { 'en-US': 'en', 'en-GB': 'en' };

function normalize(text) {
  return String(text).toLowerCase().normalize('NFKC').replace(/[\s\p{P}\p{S}]+/gu, '');
}

function similarity(a, b) {
  const x = [...normalize(a)];
  const y = [...normalize(b)];
  if (!x.length && !y.length) return 1;
  const prev = new Array(y.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (x[i - 1] === y[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length);
}

/** The longest unit repeated back to back, in characters ("abab" → 2). */
function tandemUnit(chars) {
  let best = 0;
  for (let len = 1; len * 2 <= chars.length; len++) {
    for (let i = 0; i + 2 * len <= chars.length; i++) {
      if (chars.slice(i, i + len).join('') === chars.slice(i + len, i + 2 * len).join('')) { best = len; break; }
    }
  }
  return best;
}

/**
 * Whether a transcript says the call twice back to back ("HE. HE.", a
 * stuttered restart) where the script does not. The speech model does this
 * often on very short calls, and by edit distance alone a doubled short call
 * scores 0.5, which would pass the loose bar for short calls.
 */
function repeatsCall(heard, text) {
  const want = [...normalize(text)];
  const unit = tandemUnit([...normalize(heard)]);
  return unit >= Math.max(2, Math.ceil(want.length / 2)) && unit > tandemUnit(want);
}

/** A clean take beats one that repeats the call, then the closer transcript wins. */
const betterTake = (a, b) => (a.repeated !== b.repeated ? !a.repeated : a.sim > b.sim);

const tmp = mkdtempSync(join(tmpdir(), 'cot-voices-'));
let spent = 0;
let stop = false;
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const failures = [];
const trims = [];

/** Transcribe a take and score it against the script. */
async function check(lang, line, text, raw, name) {
  const wav = join(tmp, `${lang}-${line.id}-${name}.wav`);
  writeFileSync(wav, wavFromS16(raw, 24000));
  try {
    const stt = await transcribe({ file: wav, languageCode: LANG_CODE[lang] || lang });
    spent += stt.cost || 0;
    const repeated = repeatsCall(stt.text, text);
    return { heard: stt.text, repeated, sim: repeated ? Math.min(similarity(stt.text, text), 0.2) : similarity(stt.text, text) };
  } catch (error) {
    return { heard: `stt error: ${error.message}`, repeated: false, sim: 0 };
  }
}

/** The speech span of 24 kHz PCM and the pauses inside it (≥ 90 ms, 32 dB under the loudest 10 ms), in samples. */
function pauses(samples) {
  const frame = 240;
  const n = Math.floor(samples.length / frame);
  const db = new Float64Array(n);
  let peak = -120;
  for (let f = 0; f < n; f++) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i++) sum += samples[i] * samples[i];
    db[f] = 10 * Math.log10(sum / frame + 1e-12);
    peak = Math.max(peak, db[f]);
  }
  const quiet = (f) => db[f] < peak - 32;
  let first = 0;
  while (first < n && quiet(first)) first++;
  let last = n - 1;
  while (last > first && quiet(last)) last--;
  const gaps = [];
  for (let f = first; f <= last; f++) {
    if (!quiet(f)) continue;
    let g = f;
    while (g <= last && quiet(g)) g++;
    if (g - f >= 9) gaps.push([f * frame, g * frame]);
    f = g;
  }
  return { start: first * frame, end: (last + 1) * frame, gaps };
}

/**
 * The speech model often says a very short call twice ("Loading. Loading"),
 * however many takes it is given. Such a take is cut at each pause, keeping
 * the part before or after it, and a cut is kept only when its own transcript
 * reads as the script (0.75, stricter than the take bar, so a fragment of a
 * longer call never passes).
 */
async function trimmedTake(lang, line, text, best) {
  const { start, end, gaps } = pauses(s16ToFloat(best.raw));
  const pad = 960;
  let found = null;
  for (const [a, b] of gaps) {
    for (const [from, to] of [[start, Math.min(end, a + pad)], [Math.max(start, b - pad), end]]) {
      const raw = best.raw.subarray(from * 2, to * 2);
      const result = await check(lang, line, text, raw, `${best.attempt}-cut-${from}-${to}`);
      if (result.repeated || result.sim < 0.75 || (found && result.sim <= found.sim)) continue;
      found = { ...result, raw: Buffer.from(raw), durS: raw.length / 2 / 24000, attempt: best.attempt, trimmed: true };
    }
  }
  return found;
}

async function bestTake(lang, line, text) {
  const voice = cast[lang][line.role === 'commander' ? 'commander' : 'crew'];
  // Very short calls ("Up!", "HE!") transcribe loosely; accept a lower bar.
  const bar = normalize(text).length <= 4 ? 0.34 : 0.62;
  let best = null;
  const tried = [];
  for (let attempt = 0; attempt < attempts && !stop; attempt++) {
    const { file, cost } = await speech({
      voiceId: voice.voice_id,
      text: `[${line.delivery}] ${text}`,
      modelId: 'eleven_v4',
      languageCode: LANG_CODE[lang] || lang,
      stability: 0.6,
      similarity: 0.8,
      take: attempt,
      outputFormat: 'pcm_24000',
    });
    spent += cost;
    if (spent >= budget) stop = true;
    const raw = readFileSync(file);
    const result = verify ? await check(lang, line, text, raw, `${attempt}`) : { heard: '', repeated: false, sim: 1 };
    const durS = raw.length / 2 / 24000;
    const candidate = { ...result, raw, durS, attempt };
    tried.push(candidate);
    if (!best || betterTake(candidate, best)) best = candidate;
    if (candidate.sim >= bar && durS < 6) break;
  }
  // No attempt passed: cut each at its pauses until one reads as the script
  // (a short cut can transcribe as a near-homophone, so one attempt is not enough).
  if (verify && best && best.sim < bar && !stop) {
    for (const candidate of tried) {
      const cut = await trimmedTake(lang, line, text, candidate);
      if (!cut) continue;
      trims.push(`${lang}/${line.id}: "${candidate.heard}" → "${cut.heard}"`);
      return cut;
    }
  }
  return best;
}

const languages = (langsArg || script.languages);
for (const lang of languages) {
  if (!cast[lang]) { console.warn(`no cast for ${lang}`); continue; }
  const dir = join(OUT, lang);
  mkdirSync(dir, { recursive: true });
  state[lang] ||= {};
  const jobs = script.lines.filter((line) => !linesArg || linesArg.includes(line.id)).map(async (line) => {
    const takes = line[lang];
    if (!Array.isArray(takes) || !takes.length) { failures.push(`${lang}/${line.id}: no script`); return; }
    for (const name of readdirSync(dir)) if (takeFileOf(line.id).test(name)) rmSync(join(dir, name));
    const shipped = [];
    for (let i = 0; i < takes.length && !stop; i++) {
      try {
        const best = await bestTake(lang, line, takes[i]);
        if (!best) continue;
        if (best.sim < 0.34) failures.push(`${lang}/${line.id}#${i}: "${takes[i]}" heard "${best.heard}" (${best.sim.toFixed(2)}${best.repeated ? ', repeats' : ''})`);
        const facts = masterTake({ channels: [s16ToFloat(best.raw)], sr: 24000, preset: 'voice', outBase: join(dir, `${line.id}_${shipped.length}`) });
        shipped.push(+facts.dur.toFixed(3));
      } catch (error) {
        failures.push(`${lang}/${line.id}#${i}: ${error.message}`);
        if (error instanceof ElevenLabsError && error.quota) stop = true;
      }
    }
    state[lang][line.id] = shipped;
  });
  await Promise.all(jobs);
  console.log(`${lang}: ${Object.values(state[lang]).reduce((a, t) => a + t.length, 0)} takes shipped; spent so far ${spent}`);
  writeFileSync(STATE, JSON.stringify(state, null, 1));
  if (stop) break;
}

rmSync(tmp, { recursive: true, force: true });
// A line dropped from the script leaves the manifest and the disk, in every language.
const scriptIds = new Set(script.lines.map((line) => line.id));
let pruned = 0;
for (const lang of Object.keys(state)) {
  for (const id of Object.keys(state[lang])) {
    if (scriptIds.has(id)) continue;
    const dir = join(OUT, lang);
    if (existsSync(dir)) for (const name of readdirSync(dir)) if (takeFileOf(id).test(name)) rmSync(join(dir, name));
    delete state[lang][id];
    pruned++;
  }
}
if (pruned) {
  writeFileSync(STATE, JSON.stringify(state, null, 1));
  console.log(`pruned ${pruned} line packs no longer in the script`);
}
const body = Object.keys(state).sort().map((lang) => {
  const lines = Object.keys(state[lang]).sort().map((id) => `    ${JSON.stringify(id)}: ${JSON.stringify(state[lang][id])},`);
  return `  ${JSON.stringify(lang)}: {\n${lines.join('\n')}\n  },`;
});
writeFileSync(MANIFEST, `// Generated by tools/audio/build-voices.mjs — do not edit by hand.
// Crew radio packs: language → line id → take durations (s); the files are
// public/audio/voice/<language>/<line>_<n>.webm in this order.

export const VOICE_PACKS: Readonly<Record<string, Readonly<Record<string, readonly number[]>>>> = {
${body.join('\n')}
};
`);
console.log(`billed ${spent} credits; ${failures.length} flagged takes`);
for (const f of failures.slice(0, 60)) console.log(`  ! ${f}`);
if (trims.length) console.log(`trimmed ${trims.length} repeated or padded takes at a pause:`);
for (const t of trims) console.log(`  ✂ ${t}`);
