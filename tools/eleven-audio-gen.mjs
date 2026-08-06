#!/usr/bin/env node
// eleven-audio-gen.mjs — ElevenLabs SFX/TTS candidate probe (EXPLORATION r1).
//
// Generates CANDIDATE audio takes under shots/eleven-probe/ for A/B against
// the shipped procedural sets. This is the audition tool, not the bake:
// integration keeps tools/make-sfx.mjs / make-voices.mjs as the mastering +
// gate owners and would swap only their synthesis stage (see
// docs/research/genai-asset-pipelines.md Part II — incl. the licensing
// gotchas: free tier is NON-commercial + attribution; Starter $6/mo is the
// commercial floor; SFX has NO seed so keepers must be archived immediately).
//
// API facts encoded here (elevenlabs.io/docs, checked 2026-08):
//   - auth: xi-api-key header                      (ELEVENLABS_API_KEY env)
//   - SFX:   POST /v1/sound-generation   model eleven_text_to_sound_v2
//            duration_seconds 0.5–30 (explicit = 11 credits/s, auto = 100),
//            prompt_influence 0–1, loop (v2 seamless loops), NO seed
//   - TTS:   POST /v1/text-to-speech/:voice_id     eleven_v3 (audio tags
//            like [shouts]/[exhales]) or eleven_multilingual_v2 (most stable)
//   - VOICE DESIGN: POST /v1/text-to-voice/design  (eleven_ttv_v3, seeded =
//            reproducible, 3 previews) → POST /v1/text-to-voice saves one
//   - output_format=opus_48000_128 / pcm_48000 are NOT tier-gated
//
// Usage (export ELEVENLABS_API_KEY=... first):
//   node tools/eleven-audio-gen.mjs sfx --id fire_large \
//     --text "Massive 120mm tank cannon firing, sharp concussive muzzle blast \
//             with deep sub-bass thump, dry close-mic, no reverb, no ambience" \
//     --seconds 2.5 [--influence 0.75] [--loop] [--takes 3]
//   node tools/eleven-audio-gen.mjs tts --id enemy_spotted \
//     --voice <voice_id> --text "[shouts] Enemy spotted!" [--model v3|v2] [--takes 3] [--radio]
//   node tools/eleven-audio-gen.mjs design --id commander \
//     --description "Gruff middle-aged male tank commander, gravelly, clipped \
//                    military radio cadence, urgent" [--seed 1911] [--preview-text "..."]
//   node tools/eleven-audio-gen.mjs save-voice --generated <generated_voice_id> --name TankCommander
//   node tools/eleven-audio-gen.mjs voices          # list voices in the account
//
// --radio pipes a PREVIEW copy through a simplified tank-intercom chain
// (bandpass 300–3400 + compression + squelch-ish bed) so takes can be judged
// in-context; the canonical chain stays in make-voices.mjs and is reapplied
// at bake time. Requires local ffmpeg for --radio only.
//
// (Node via nvm on this machine: export NVM_DIR="$HOME/.nvm" &&
//  . "$NVM_DIR/nvm.sh" first. Node ≥18 for global fetch.)

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.elevenlabs.io';
const OUT_ROOT = path.join(ROOT, 'shots', 'eleven-probe');
const FFMPEG = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg';

const [mode, ...rest] = process.argv.slice(2);
const flag = (name) => rest.includes(`--${name}`);
const opt = (name, dflt = null) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 && rest[i + 1] !== undefined && !rest[i + 1].startsWith('--') ? rest[i + 1] : dflt;
};

const KEY = process.env.ELEVENLABS_API_KEY;
const USAGE = `usage:
  ELEVENLABS_API_KEY=... node tools/eleven-audio-gen.mjs <mode>
  modes:
    sfx        --id <slug> --text "<prompt>" [--seconds 0.5-30] [--influence 0-1] [--loop] [--takes n]
    tts        --id <slug> --voice <voice_id> --text "<line, [tags] ok>" [--model v3|v2] [--takes n] [--radio]
    design     --id <slug> --description "<voice description>" [--seed n] [--preview-text "100-1000 chars"]
    save-voice --generated <generated_voice_id> --name <VoiceName> [--description "..."]
    voices`;
if (!mode || !['sfx', 'tts', 'design', 'save-voice', 'voices'].includes(mode) || !KEY) {
  console.error(USAGE);
  process.exit(1);
}

async function api(method, p, body, { binary = false, query = '' } = {}) {
  const res = await fetch(`${API}${p}${query}`, {
    method,
    headers: { 'xi-api-key': KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${p} -> HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  return binary ? Buffer.from(await res.arrayBuffer()) : res.json();
}

const kib = (n) => `${(n / 1024).toFixed(0)} KiB`;
function outDirFor(kind, id) {
  const d = path.join(OUT_ROOT, kind, id);
  mkdirSync(d, { recursive: true });
  return d;
}

// Simplified intercom preview (NOT the canonical make-voices.mjs chain).
function radioPreview(src) {
  const dst = src.replace(/\.(\w+)$/, '.radio.ogg');
  const r = spawnSync(FFMPEG, ['-y', '-i', src,
    '-af', 'highpass=f=300,lowpass=f=3400,acompressor=ratio=4:threshold=-18dB:attack=5:release=120,'
      + 'aeval=val(0)*0.97+0.015*(random(0)-0.5)|val(0)*0.97+0.015*(random(0)-0.5),'
      + 'alimiter=limit=0.79',
    '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', dst], { stdio: 'pipe' });
  if (r.status !== 0) console.error(`  (radio preview skipped: ffmpeg failed — ${r.stderr?.toString().split('\n')[0]})`);
  else console.log(`  radio preview -> ${path.relative(ROOT, dst)}`);
}

// --- modes -------------------------------------------------------------------
if (mode === 'voices') {
  const { voices } = await api('GET', '/v1/voices');
  for (const v of voices) {
    console.log(`${v.voice_id}  ${v.name}${v.category ? `  [${v.category}]` : ''}${v.labels ? `  ${JSON.stringify(v.labels)}` : ''}`);
  }
  process.exit(0);
}

if (mode === 'sfx') {
  const id = opt('id');
  const text = opt('text');
  if (!id || !text) { console.error(USAGE); process.exit(1); }
  const seconds = opt('seconds') ? Number(opt('seconds')) : null;
  const influence = Number(opt('influence', '0.7'));
  const loop = flag('loop');
  const takes = Number(opt('takes', '1'));
  const dir = outDirFor('sfx', id);
  // Loops keep mp3 (the documented loop-safe format); one-shots take opus 48k,
  // which drops straight into the repo's format. NO SEED EXISTS for SFX —
  // every take is unrepeatable, keepers get committed, rejects deleted.
  const fmt = loop ? 'mp3_44100_128' : 'opus_48000_128';
  const ext = loop ? 'mp3' : 'ogg';
  console.log(`[eleven] sfx "${id}" x${takes} — ${seconds ? `${seconds}s (${Math.ceil(seconds * 11)} cr/take)` : 'auto duration (100 cr/take)'}, influence ${influence}${loop ? ', LOOP' : ''}`);
  for (let t = 0; t < takes; t++) {
    const buf = await api('POST', '/v1/sound-generation', {
      text,
      model_id: 'eleven_text_to_sound_v2',
      ...(seconds ? { duration_seconds: seconds } : {}),
      prompt_influence: influence,
      ...(loop ? { loop: true } : {}),
    }, { binary: true, query: `?output_format=${fmt}` });
    const f = path.join(dir, `take_${String(t + 1).padStart(2, '0')}.${ext}`);
    writeFileSync(f, buf);
    console.log(`  ${path.relative(ROOT, f)}  ${kib(buf.length)}`);
  }
  writeFileSync(path.join(dir, 'prompt.json'), JSON.stringify({ text, seconds, influence, loop, fmt, when: new Date().toISOString() }, null, 2));
  console.log(`[eleven] done. A/B against public/audio/sfx/ (loops: decode to AudioBuffer + loopStart/End — mp3 padding clicks under naive <audio> looping)`);
}

if (mode === 'tts') {
  const id = opt('id');
  const text = opt('text');
  const voice = opt('voice');
  if (!id || !text || !voice) { console.error(USAGE); process.exit(1); }
  const model = opt('model', 'v3') === 'v2' ? 'eleven_multilingual_v2' : 'eleven_v3';
  const takes = Number(opt('takes', '1'));
  const dir = outDirFor('tts', id);
  console.log(`[eleven] tts "${id}" x${takes} — ${model}, voice ${voice}`);
  for (let t = 0; t < takes; t++) {
    const buf = await api('POST', `/v1/text-to-speech/${voice}`, {
      text,
      model_id: model,
      // v3 reads stability as a 3-notch switch: 0 creative / 0.5 natural / 1 robust.
      voice_settings: { stability: 0.5, similarity_boost: 0.75, use_speaker_boost: true },
      seed: 191100 + t, // best-effort determinism (not guaranteed)
    }, { binary: true, query: '?output_format=opus_48000_128' });
    const f = path.join(dir, `take_${String(t + 1).padStart(2, '0')}.ogg`);
    writeFileSync(f, buf);
    console.log(`  ${path.relative(ROOT, f)}  ${kib(buf.length)}`);
    if (flag('radio')) radioPreview(f);
  }
  writeFileSync(path.join(dir, 'prompt.json'), JSON.stringify({ text, voice, model, when: new Date().toISOString() }, null, 2));
  console.log('[eleven] done. Bake-time integration reuses the canonical make-voices.mjs intercom chain + LUFS gates.');
}

if (mode === 'design') {
  const id = opt('id');
  const description = opt('description');
  if (!id || !description) { console.error(USAGE); process.exit(1); }
  const seed = Number(opt('seed', '1911')); // design IS seed-reproducible per docs
  const previewText = opt('preview-text',
    "Enemy spotted, three o'clock! Armor piercing, loaded! On the way! Target destroyed — scratch one. Track's gone, we're immobilized! Fall back to the ridge, now!");
  const dir = outDirFor('design', id);
  console.log(`[eleven] voice design "${id}" seed ${seed} — 3 previews`);
  const res = await api('POST', '/v1/text-to-voice/design', {
    voice_description: description,
    model_id: 'eleven_ttv_v3',
    text: previewText,
    seed,
  });
  for (const [i, p] of (res.previews || []).entries()) {
    const f = path.join(dir, `preview_${i + 1}.mp3`);
    writeFileSync(f, Buffer.from(p.audio_base_64, 'base64'));
    console.log(`  ${path.relative(ROOT, f)}  generated_voice_id=${p.generated_voice_id}`);
  }
  writeFileSync(path.join(dir, 'design.json'), JSON.stringify({ description, seed, previewText, previews: (res.previews || []).map((p) => p.generated_voice_id), when: new Date().toISOString() }, null, 2));
  console.log(`[eleven] pick one, then: node tools/eleven-audio-gen.mjs save-voice --generated <id> --name <Name>`);
}

if (mode === 'save-voice') {
  const generated = opt('generated');
  const name = opt('name');
  if (!generated || !name) { console.error(USAGE); process.exit(1); }
  const res = await api('POST', '/v1/text-to-voice', {
    voice_name: name,
    voice_description: opt('description', `${name} (designed for Claude of Tanks crew radio)`),
    generated_voice_id: generated,
  });
  console.log(`[eleven] saved voice "${name}" -> voice_id ${res.voice_id}`);
  console.log('[eleven] use it: node tools/eleven-audio-gen.mjs tts --voice ' + res.voice_id + ' …');
}
