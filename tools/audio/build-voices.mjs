#!/usr/bin/env node
// tools/audio/build-voices.mjs — generate, verify and master the national
// crew radio packs.
//
//   ELEVENLABS_API_KEY_FILE=… node tools/audio/build-voices.mjs [--langs de,ru] [--lines fire,were_hit] [--no-verify] [--budget 25000]
//
// Per take: eleven_v4 speech in the crew language with the line's delivery as
// an audio tag, spoken by the role's cast voice (tools/audio/crew-voices.json:
// commander = voice A, gunner/loader/driver = voice B). Each take is
// round-tripped through speech-to-text; a take whose transcript drifts from
// the script is regenerated (up to three attempts, best kept). Clean takes
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

const tmp = mkdtempSync(join(tmpdir(), 'cot-voices-'));
let spent = 0;
let stop = false;
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const failures = [];

async function bestTake(lang, line, text) {
  const voice = cast[lang][line.role === 'commander' ? 'commander' : 'crew'];
  let best = null;
  for (let attempt = 0; attempt < 3 && !stop; attempt++) {
    const { file, cost } = await speech({
      voiceId: voice.voice_id,
      text: `[${line.delivery}] ${text}`,
      modelId: 'eleven_v4',
      languageCode: LANG_CODE[lang] || lang,
      stability: 0.4,
      similarity: 0.8,
      take: attempt,
      outputFormat: 'pcm_24000',
    });
    spent += cost;
    if (spent >= budget) stop = true;
    const raw = readFileSync(file);
    let sim = 1;
    let heard = '';
    if (verify) {
      const wav = join(tmp, `${lang}-${line.id}-${attempt}.wav`);
      writeFileSync(wav, wavFromS16(raw, 24000));
      try {
        const stt = await transcribe({ file: wav, languageCode: LANG_CODE[lang] || lang });
        spent += stt.cost || 0;
        heard = stt.text;
        sim = similarity(stt.text, text);
      } catch (error) {
        heard = `stt error: ${error.message}`;
      }
    }
    const durS = raw.length / 2 / 24000;
    const candidate = { raw, sim, heard, durS, attempt };
    if (!best || candidate.sim > best.sim) best = candidate;
    // Very short calls ("Up!", "HE!") transcribe loosely; accept a lower bar.
    const bar = normalize(text).length <= 4 ? 0.34 : 0.62;
    if (candidate.sim >= bar && durS < 6) break;
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
    for (const name of readdirSync(dir)) if (name.startsWith(`${line.id}_`)) rmSync(join(dir, name));
    const shipped = [];
    for (let i = 0; i < takes.length && !stop; i++) {
      try {
        const best = await bestTake(lang, line, takes[i]);
        if (!best) continue;
        if (best.sim < 0.34) failures.push(`${lang}/${line.id}#${i}: "${takes[i]}" heard "${best.heard}" (${best.sim.toFixed(2)})`);
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
