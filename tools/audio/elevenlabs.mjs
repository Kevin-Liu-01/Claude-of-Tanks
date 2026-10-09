// tools/audio/elevenlabs.mjs — the ElevenLabs client shared by the audio
// generators (sound effects, crew voices, casting, the media films' music).
//
// - The key comes from ELEVENLABS_API_KEY or the file named by
//   ELEVENLABS_API_KEY_FILE. It is never printed, logged or written anywhere
//   else, and nothing here ever ships to the browser (API terms forbid it).
// - Every successful generation is content-addressed in a durable cache
//   (~/.cache/cot-elevenlabs by default, COT_ELEVENLABS_CACHE to override):
//   the sound-effects model has no seed, so a take can never be regenerated —
//   a re-run must reuse the archived bytes instead of spending credits.
// - Every billed call appends one JSON line to the cache ledger with the
//   `character-cost` the API reported, the plan concurrency it advertised and
//   the time, so provenance (paid-plan generation date) is auditable.
// - Concurrency is limited client-side; 429 / 5xx retry with backoff; quota
//   and permission errors fail loudly with the API's own message.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const API = 'https://api.elevenlabs.io';

export const CACHE_ROOT = process.env.COT_ELEVENLABS_CACHE || join(homedir(), '.cache', 'cot-elevenlabs');

let cachedKey = null;
function apiKey() {
  if (cachedKey) return cachedKey;
  let key = process.env.ELEVENLABS_API_KEY || '';
  if (!key && process.env.ELEVENLABS_API_KEY_FILE) {
    key = readFileSync(process.env.ELEVENLABS_API_KEY_FILE, 'utf8').trim();
  }
  if (!key) {
    throw new Error('Set ELEVENLABS_API_KEY or ELEVENLABS_API_KEY_FILE (the key is read, never printed).');
  }
  cachedKey = key;
  return key;
}

export class ElevenLabsError extends Error {
  constructor(status, detail) {
    const message = typeof detail === 'object' && detail
      ? `${detail.code || detail.status || 'error'}: ${detail.message || JSON.stringify(detail)}`
      : String(detail);
    super(`ElevenLabs ${status} ${message}`);
    this.status = status;
    this.code = typeof detail === 'object' && detail ? (detail.code || detail.status || '') : '';
  }

  get quota() {
    return /quota|insufficient_credits/.test(this.code) || this.status === 402;
  }
}

// ---------------------------------------------------------------- limiter ---

function createLimiter(max) {
  let active = 0;
  const waiting = [];
  const next = () => {
    if (active >= max || !waiting.length) return;
    active++;
    const { task, resolve, reject } = waiting.shift();
    task().then(resolve, reject).finally(() => { active--; next(); });
  };
  return (task) => new Promise((resolve, reject) => { waiting.push({ task, resolve, reject }); next(); });
}

const limit = createLimiter(Number(process.env.COT_ELEVENLABS_CONCURRENCY || 4));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function ledger(entry) {
  mkdirSync(CACHE_ROOT, { recursive: true });
  appendFileSync(join(CACHE_ROOT, 'ledger.jsonl'), `${JSON.stringify({ t: new Date().toISOString(), ...entry })}\n`);
}

async function request(method, path, { query, json, form, binary = false, attempts = 5, label = path } = {}) {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(query || {})) if (v != null) url.searchParams.set(k, String(v));
  for (let attempt = 1; ; attempt++) {
    const headers = { 'xi-api-key': apiKey() };
    let body;
    if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) body = form;
    let res;
    try {
      res = await fetch(url, { method, headers, body });
    } catch (error) {
      if (attempt >= attempts) throw error;
      await sleep(800 * attempt);
      continue;
    }
    if (res.ok) {
      const cost = Number(res.headers.get('character-cost') || 0);
      const meta = {
        cost,
        maxConcurrency: Number(res.headers.get('maximum-concurrent-requests') || 0) || null,
        requestId: res.headers.get('request-id') || res.headers.get('x-trace-id') || null,
      };
      const data = binary ? Buffer.from(await res.arrayBuffer()) : await res.json();
      return { data, meta };
    }
    const text = await res.text();
    let detail = text;
    try { detail = JSON.parse(text).detail ?? JSON.parse(text); } catch { /* raw text */ }
    const err = new ElevenLabsError(res.status, detail);
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || err.quota || attempt >= attempts) throw err;
    const wait = Math.min(20000, 1000 * 2 ** (attempt - 1)) + Math.random() * 400;
    console.warn(`[elevenlabs] ${label}: ${res.status} ${err.code || ''} — retry ${attempt}/${attempts - 1} in ${Math.round(wait)} ms`);
    await sleep(wait);
  }
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}

function cached(kind, key, ext) {
  const dir = join(CACHE_ROOT, kind);
  mkdirSync(dir, { recursive: true });
  return join(dir, `${key}.${ext}`);
}

function extensionFor(outputFormat) {
  if (outputFormat.startsWith('pcm')) return 'pcm';
  if (outputFormat.startsWith('opus')) return 'opus';
  if (outputFormat.startsWith('wav')) return 'wav';
  return 'mp3';
}

/**
 * One sound-effect take. `take` distinguishes repeated generations of the
 * same prompt (the model is unseeded): take 0, 1, 2 … are separate archived
 * files. Returns { file, cost, cached }.
 */
export async function soundEffect({ text, durationS = null, promptInfluence = 0.4, loop = false, take = 0, outputFormat = 'pcm_48000' }) {
  const body = {
    text,
    duration_seconds: durationS,
    prompt_influence: promptInfluence,
    model_id: 'eleven_text_to_sound_v2',
    ...(loop ? { loop: true } : {}),
  };
  const key = digest({ body, outputFormat, take });
  const file = cached('sfx', key, extensionFor(outputFormat));
  if (existsSync(file)) return { file, cost: 0, cached: true };
  const { data, meta } = await limit(() => request('POST', '/v1/sound-generation', {
    query: { output_format: outputFormat }, json: body, binary: true, label: `sfx ${text.slice(0, 40)}`,
  }));
  writeFileSync(file, data);
  writeFileSync(`${file}.json`, JSON.stringify({ body, outputFormat, take, ...meta, generatedAt: new Date().toISOString() }, null, 1));
  ledger({ kind: 'sfx', key, cost: meta.cost, maxConcurrency: meta.maxConcurrency, seconds: durationS, loop });
  return { file, cost: meta.cost, cached: false };
}

/**
 * One text-to-speech take. Returns { file, cost, cached }.
 */
export async function speech({ voiceId, text, modelId = 'eleven_v4', languageCode = null, stability = 0.5, similarity = 0.8, seed = null, previousText = null, nextText = null, take = 0, outputFormat = 'pcm_24000' }) {
  const body = {
    text,
    model_id: modelId,
    ...(languageCode ? { language_code: languageCode } : {}),
    voice_settings: { stability, similarity_boost: similarity },
    ...(seed != null ? { seed } : {}),
    ...(previousText ? { previous_text: previousText } : {}),
    ...(nextText ? { next_text: nextText } : {}),
  };
  const key = digest({ voiceId, body, outputFormat, take });
  const file = cached('tts', key, extensionFor(outputFormat));
  if (existsSync(file)) return { file, cost: 0, cached: true };
  const { data, meta } = await limit(() => request('POST', `/v1/text-to-speech/${voiceId}`, {
    query: { output_format: outputFormat }, json: body, binary: true, label: `tts ${text.slice(0, 30)}`,
  }));
  writeFileSync(file, data);
  writeFileSync(`${file}.json`, JSON.stringify({ voiceId, body, outputFormat, take, ...meta, generatedAt: new Date().toISOString() }, null, 1));
  ledger({ kind: 'tts', key, cost: meta.cost, maxConcurrency: meta.maxConcurrency, model: modelId, chars: text.length });
  return { file, cost: meta.cost, cached: false };
}

/**
 * A composition plan from a prompt (free of credits, rate-limited). The media films build their own plans from their
 * cue sheets; this is for checking a plan's shape against the model. Returns the plan.
 */
export async function musicPlan({ prompt, lengthMs = null, modelId = 'music_v2_5', sourcePlan = null }) {
  const body = { prompt, model_id: modelId, ...(lengthMs ? { music_length_ms: lengthMs } : {}), ...(sourcePlan ? { source_composition_plan: sourcePlan } : {}) };
  const { data } = await limit(() => request('POST', '/v1/music/plan', { json: body, label: 'music plan' }));
  return data;
}

/**
 * One music take (Eleven Music) from a composition plan: { chunks } for music_v2 / music_v2_5, { positive_global_styles,
 * negative_global_styles, sections } for music_v1. `seed` makes a plan reproducible; `take` separates retries of the
 * same request in the cache. Returns { file, cost, cached }.
 */
export async function music({ plan, modelId = 'music_v2_5', seed = null, take = 0, outputFormat = 'mp3_48000_320' }) {
  const body = { composition_plan: plan, model_id: modelId, ...(seed != null ? { seed } : {}) };
  const key = digest({ body, outputFormat, take });
  const file = cached('music', key, extensionFor(outputFormat));
  if (existsSync(file)) return { file, cost: 0, cached: true };
  const { data, meta } = await limit(() => request('POST', '/v1/music', {
    query: { output_format: outputFormat }, json: body, binary: true, label: 'music',
  }));
  writeFileSync(file, data);
  writeFileSync(`${file}.json`, JSON.stringify({ body, outputFormat, take, ...meta, generatedAt: new Date().toISOString() }, null, 1));
  const lengthMs = (plan.chunks ?? plan.sections ?? []).reduce((sum, part) => sum + (part.duration_ms || 0), 0);
  ledger({ kind: 'music', key, cost: meta.cost, maxConcurrency: meta.maxConcurrency, model: modelId, ms: lengthMs });
  return { file, cost: meta.cost, cached: false };
}

/** Speech-to-text round trip for QA (scribe). Returns { text, languageCode, cost }. */
export async function transcribe({ file, modelId = 'scribe_v2', languageCode = null }) {
  const key = digest({ content: createHash('sha256').update(readFileSync(file)).digest('hex'), modelId, languageCode });
  const out = cached('stt', key, 'json');
  if (existsSync(out)) return { ...JSON.parse(readFileSync(out, 'utf8')), cost: 0, cached: true };
  const form = new FormData();
  form.append('model_id', modelId);
  if (languageCode) form.append('language_code', languageCode);
  form.append('file', new Blob([readFileSync(file)]), 'take.wav');
  const { data, meta } = await limit(() => request('POST', '/v1/speech-to-text', { form, label: 'stt' }));
  const result = { text: data.text || '', languageCode: data.language_code || null, cost: meta.cost };
  writeFileSync(out, JSON.stringify(result));
  ledger({ kind: 'stt', key, cost: meta.cost });
  return result;
}

export async function listVoices() {
  const { data } = await request('GET', '/v1/voices');
  return data.voices || [];
}

export async function searchSharedVoices(query) {
  const { data } = await request('GET', '/v1/shared-voices', { query });
  return data.voices || [];
}

export async function addSharedVoice(publicOwnerId, voiceId, newName) {
  const { data } = await request('POST', `/v1/voices/add/${publicOwnerId}/${voiceId}`, { json: { new_name: newName } });
  return data.voice_id;
}

/** Sum of billed credits recorded in the ledger since an ISO timestamp. */
export function ledgerSpend(sinceIso = '1970-01-01') {
  const file = join(CACHE_ROOT, 'ledger.jsonl');
  if (!existsSync(file)) return { total: 0, byKind: {} };
  const byKind = {};
  let total = 0;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line);
    if (entry.t < sinceIso) continue;
    total += entry.cost || 0;
    byKind[entry.kind] = (byKind[entry.kind] || 0) + (entry.cost || 0);
  }
  return { total, byKind };
}
