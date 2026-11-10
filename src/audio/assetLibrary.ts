/**
 * Sound asset library: fetch, decode and hold the generated sample banks.
 *
 * - Format: Opus in WebM (Chrome, Firefox, Safari ≥ 17.4). A 650-byte probe
 *   is decoded first — `canPlayType` disagreed with decoding on older iOS —
 *   and an engine that cannot decode it keeps the procedural fallbacks.
 * - Memory: each asset decodes at the rate its manifest record asks for
 *   (24 kHz for assets with nothing above 10 kHz, always 24 kHz on the mobile
 *   tier) through a cached OfflineAudioContext; AudioBuffers play in any
 *   context, so the realtime context resamples on playback.
 * - Loading is lazy, deduplicated and concurrency-limited; groups of assets
 *   load on demand (a battle's roster, its map's scene, a crew language) and
 *   least-recently-used banks are evicted past the tier's decoded budget.
 * - Two lanes share the decode slots (2026-10-14): the front lane is served
 *   before the bulk. An asset joins it when loaded `{ front: true }` (the
 *   sounds of a battle's countdown) or the first time something asks to play
 *   it before it has decoded, so a sound wanted now never waits behind a
 *   battle's worth of banks queued for later.
 * - Failure is local: a missing or undecodable file mutes that one variant. (improve-271, plan 018) A file the network
 *   failed (the fetch or its body threw) is not missing: it is asked for again on a later load (or pick, for a sound with
 *   nothing decoded), after a backoff, up to SOUND_FETCH_TRIES tries in all; an HTTP status or a decode error is final.
 */

import { SFX_ASSETS, type SfxAssetRecord } from './sfxManifest.generated.ts';
import { VOICE_PACKS } from './voiceManifest.generated.ts';

const PROBE_WEBM_B64 = 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAJaEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHGTbuMU6uEElTDZ1OsggEwTbuMU6uEHFO7a1OsggJE7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmoCrXsYMPQkBNgIRMYXZmV0GETGF2ZkSJiEBRAAAAAAAAFlSua+WuAQAAAAAAAFzXgQFzxYgAAAAAAAAAAZyBACK1nIN1bmSIgQCGhkFfT1BVU1aqg2MuoFa7hATEtACDgQLhkZ+BAbWIQOdwAAAAAABiZIEQY6KTT3B1c0hlYWQBATgBgLsAAAAAABJUw2fRc3POY8CLY8WIAAAAAAAAAAFnyJlFo4dFTkNPREVSRIeMTGF2YyBsaWJvcHVzZ8ihRaOIRFVSQVRJT05Eh5MwMDowMDowMC4wNjgwMDAwMDAAH0O2dUC454EAo7aBAACASIIut2xWt/QAAeXNngFGUIWXtzyTyRdZwxGaQd8AnvLXOrYji9/f7ABDXS1wlpp/VmSjqYEAFYBIpIhXrJiFA1wmCZMxJ/E6Sew3zKC9w+kbkzg5GqXIpP7pdWvgo6qBACmASJwbUlFFAKzi1LSrmF5J5U7LjWfTJzCwN3ATRwGLKpwcQ7ZED/agpKGYgQA9AEgGV2aBMUjSeumVrXp/vdBZnsCUm4EHdaKEAM3+YBxTu2uRu4+zgQC3iveBAfGCAYbwgQM=';

type DecodeContext = Pick<BaseAudioContext, 'decodeAudioData'>;

interface AssetLibraryOptions {
  context: AudioContext;
  /** Base URL of the deployed public directory (import.meta.env.BASE_URL). */
  base?: string;
  /** Mobile tier: decode everything at 24 kHz and keep a smaller budget. */
  lowMemory?: boolean;
  /** Soft cap for decoded sound effects: only unpinned, idle assets are evicted past it. */
  maxDecodedMb?: number;
  /** Variants decoded per asset (mobile keeps one; pitch jitter supplies the variety). */
  maxVariants?: number;
  fetchImpl?: typeof fetch;
  createDecoder?: (sampleRate: number) => DecodeContext | null;
  /** Assets decoded before this library existed (predecodeAssets: the interface set at boot idle), ready from the start. */
  seed?: ReadonlyMap<string, readonly AudioBuffer[]> | null;
}

export interface AssetLibrary {
  /** Resolves once the format probe has run; false = samples unavailable. */
  readonly ready: Promise<boolean>;
  readonly supported: boolean | null;
  record(id: string): SfxAssetRecord | undefined;
  /** At least one variant decoded. */
  has(id: string): boolean;
  /** A decoded variant, avoiding an immediate repeat; asked for before it has decoded, the asset joins the front lane. */
  pick(id: string, random: () => number): AudioBuffer | null;
  variant(id: string, index: number): AudioBuffer | null;
  /**
   * Hold each named asset's picks on one variant (a receipt's capture: tools/audio-mix-balance.mjs judges every moment
   * at its loudest take, so a gate never rides on the take the seeded stream drew); null lets the stream choose again.
   */
  holdVariants(held: Readonly<Record<string, number>> | null): void;
  /** Decode assets (deduplicated); `front` puts them in the front lane, ahead of every bulk load queued before or after. */
  load(ids: Iterable<string>, options?: { front?: boolean }): Promise<void>;
  /**
   * Keep assets decoded for the current context (the battle set, the garage
   * set, live loops): eviction never drops a pinned asset, so a sound that
   * waited minutes for its moment still plays. `replace` starts a new set.
   */
  pin(ids: Iterable<string>, replace?: boolean): void;
  /** Mark assets as in use (LRU eviction never drops what played recently). */
  touch(id: string): void;
  loadVoice(language: string): Promise<void>;
  /**
   * Forget a crew pack and stop its load (crew-languages-270): the radio speaks one language at a time, so a phone holds
   * one pack's ~40 MB decoded however many of the 38 crews a player tries. A later loadVoice fetches it again.
   */
  dropVoice(language: string): void;
  voiceReady(language: string): boolean;
  /** A decoded take of a crew line: the given take when it exists, else a random one (no immediate repeat). */
  voice(language: string, line: string, random: () => number, take?: number): AudioBuffer | null;
  voiceTakes(language: string, line: string): number;
  /** The take voice() last returned for a crew line (its index in the script), or -1 before any: the caption names it. */
  voiceTake(language: string, line: string): number;
  stats(): { assets: number; decodedMb: number; sfxMb: number; voiceMb: number; pinned: number; pending: number; failed: number; voices: string[] };
  /**
   * Resolves once every load in flight (sound effects and voice packs) has settled, the loads those start included: the
   * real completion a caller can await instead of polling `stats().pending` (a debug and receipt seam; play never waits).
   */
  idle(): Promise<void>;
}

interface Entry {
  buffers: (AudioBuffer | null)[];
  state: 'idle' | 'loading' | 'ready' | 'failed';
  promise: Promise<void> | null;
  last: number;
  bytes: number;
  lastVariant: number;
  /** (plan 018) Variants the network failed, fetched again on a later load (a sound that has others to play meanwhile). */
  refill: number[] | null;
  /** Tries the network failed so far, and when the next may start (performance.now(); 0: no backoff). */
  netFails: number;
  retryAt: number;
}

/** (plan 018) Tries a sound file gets when the network fails it, and the wait before the next (doubling). */
const SOUND_FETCH_TRIES = 3;
const SOUND_RETRY_MS = 2000;

/** A fetched file: its buffer, or null and whether the network failed it (worth another try) rather than a final miss. */
interface Fetched { buffer: AudioBuffer | null; network: boolean }
const NOT_FETCHED: Fetched = Object.freeze({ buffer: null, network: false });

function decodeBase64(b64: string): ArrayBuffer {
  const binary = typeof atob === 'function' ? atob(b64) : '';
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out.buffer;
}

function defaultDecoder(sampleRate: number): DecodeContext | null {
  const scope = globalThis as typeof globalThis & { OfflineAudioContext?: typeof OfflineAudioContext };
  if (!scope.OfflineAudioContext) return null;
  try { return new scope.OfflineAudioContext(1, 1, sampleRate); } catch { return null; }
}

/**
 * Crew speech decode rate. Every take plays through the radio's 320 Hz–3.4 kHz
 * band and a headset speaker rolling off from 4.6 kHz, so 16 kHz (8 kHz
 * Nyquist) keeps all of it at two thirds of a 24 kHz decode's memory: a
 * 371-take pack is about 40 MB decoded (crew-lines-269).
 */
const VOICE_DECODE_HZ = 16000;

function bufferBytes(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * 4;
}

/**
 * Decode assets with no audio device yet (an OfflineAudioContext per decode rate): the interface set at boot idle, so the
 * first press anywhere finds its sound ready (2026-10-13). The files and rates are the library's own; a failure leaves
 * that asset out (the library loads it later as usual).
 */
export async function predecodeAssets(ids: Iterable<string>, { base = '/', fetchImpl = (...args: Parameters<typeof fetch>) => fetch(...args),
  createDecoder = defaultDecoder }: Pick<AssetLibraryOptions, 'base' | 'fetchImpl' | 'createDecoder'> = {}): Promise<Map<string, AudioBuffer[]>> {
  const root = base.endsWith('/') ? base : `${base}/`;
  const out = new Map<string, AudioBuffer[]>();
  await Promise.all([...ids].map(async (id) => {
    const rec = SFX_ASSETS[id];
    const decoder = rec ? createDecoder(rec.r) : null;
    if (!rec || !decoder) return;
    try {
      const buffers = await Promise.all(Array.from({ length: rec.n }, async (_, i) => {
        const res = await fetchImpl(`${root}audio/sfx/${rec.g}/${id}_${i}.webm`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return decoder.decodeAudioData(await res.arrayBuffer());
      }));
      out.set(id, buffers);
    } catch { /* left to the library's own load */ }
  }));
  return out;
}

export function createAssetLibrary({
  context,
  base = '/',
  lowMemory = false,
  maxDecodedMb = lowMemory ? 96 : 200,
  maxVariants = lowMemory ? 1 : Infinity,
  fetchImpl = (...args) => fetch(...args),
  createDecoder = defaultDecoder,
  seed = null,
}: AssetLibraryOptions): AssetLibrary {
  const entries = new Map<string, Entry>();
  const voiceEntries = new Map<string, Entry>();
  const voiceLanguages = new Map<string, Promise<void>>();
  const readyVoices = new Set<string>();
  /** Load promises seen to settle (idle()): a settled load is never waited on again. */
  const settledLoads = new WeakSet<Promise<void>>();
  const decoders = new Map<number, DecodeContext | null>();
  let supported: boolean | null = null;
  let active = 0;
  /** Decoded sound-effect bytes (the evictable pool); crew packs count separately. */
  let decodedBytes = 0;
  let voiceBytes = 0;
  let failed = 0;
  const pinned = new Set<string>();
  // Files waiting for a decode slot, by asset: the front lane is always served first.
  interface Waiter { readonly id: string; readonly resolve: () => void }
  const frontWaiting: Waiter[] = [];
  const bulkWaiting: Waiter[] = [];
  const frontIds = new Set<string>();
  const CONCURRENCY = 6;
  const root = base.endsWith('/') ? base : `${base}/`;
  for (const [id, decoded] of seed ?? []) {
    const buffers = decoded.slice(0, Math.max(1, maxVariants));
    if (!SFX_ASSETS[id] || !buffers.length) continue;
    const bytes = buffers.reduce((sum, b) => sum + bufferBytes(b), 0);
    entries.set(id, { buffers, state: 'ready', promise: Promise.resolve(), last: performance.now(), bytes, lastVariant: -1, refill: null, netFails: 0, retryAt: 0 });
    decodedBytes += bytes;
  }

  function decoderFor(rate: number): DecodeContext {
    const r = lowMemory ? Math.min(rate, 24000) : rate;
    if (r === context.sampleRate) return context;
    if (!decoders.has(r)) decoders.set(r, createDecoder(r));
    return decoders.get(r) ?? context;
  }

  async function decode(bytes: ArrayBuffer, rate: number): Promise<AudioBuffer> {
    const decoder = decoderFor(rate);
    try {
      return await decoder.decodeAudioData(bytes.slice(0));
    } catch (error) {
      if (decoder === context) throw error;
      return context.decodeAudioData(bytes);
    }
  }

  /** One file, told apart by why it failed: the network (the fetch or its body threw) or for good (a status, a decode). */
  async function fetchOne(url: string, rate: number): Promise<Fetched> {
    let bytes: ArrayBuffer;
    try {
      const res = await fetchImpl(url);
      if (!res.ok) { failed++; return NOT_FETCHED; }
      bytes = await res.arrayBuffer();
    } catch {
      failed++;
      return { buffer: null, network: true };
    }
    try {
      return { buffer: await decode(bytes, rate), network: false };
    } catch {
      failed++;
      return NOT_FETCHED;
    }
  }

  /** After a fetch: the variants the network failed are kept for another try while tries remain (plan 018). */
  function afterFetch(entry: Entry, network: number[]): void {
    if (!network.length) { entry.refill = null; return; }
    entry.netFails++;
    if (entry.netFails >= SOUND_FETCH_TRIES) { entry.refill = null; return; }
    entry.retryAt = performance.now() + SOUND_RETRY_MS * 2 ** (entry.netFails - 1);
    entry.refill = network;
  }

  async function slot<T>(id: string, task: () => Promise<T>): Promise<T> {
    if (active >= CONCURRENCY) {
      await new Promise<void>((resolve) => (frontIds.has(id) ? frontWaiting : bulkWaiting).push({ id, resolve }));
    }
    active++;
    try { return await task(); } finally {
      active--;
      (frontWaiting.shift() ?? bulkWaiting.shift())?.resolve();
    }
  }

  /** Move an asset into the front lane, its files already queued in the bulk included (once per asset). */
  function promote(id: string): void {
    if (frontIds.has(id) || !SFX_ASSETS[id]) return;
    frontIds.add(id);
    for (let i = 0; i < bulkWaiting.length;) {
      if (bulkWaiting[i].id === id) frontWaiting.push(bulkWaiting.splice(i, 1)[0]);
      else i++;
    }
  }

  // The crew pack has its own lane: the first radio call must not wait
  // behind a battle's worth of sound-effect banks.
  let voiceActive = 0;
  const voiceWaiting: (() => void)[] = [];
  async function voiceSlot<T>(task: () => Promise<T>): Promise<T> {
    if (voiceActive >= 4) await new Promise<void>((resolve) => voiceWaiting.push(resolve));
    voiceActive++;
    try { return await task(); } finally {
      voiceActive--;
      voiceWaiting.shift()?.();
    }
  }

  const ready = (async () => {
    try {
      await context.decodeAudioData(decodeBase64(PROBE_WEBM_B64));
      supported = true;
    } catch {
      supported = false;
      console.warn('[audio] this browser cannot decode Opus/WebM — procedural sound fallback active');
    }
    return supported;
  })();

  function evictIfNeeded(): void {
    const budget = maxDecodedMb * 1024 * 1024;
    if (decodedBytes <= budget) return;
    const now = performance.now();
    const candidates = [...entries.entries()]
      .filter(([id, e]) => e.state === 'ready' && !pinned.has(id) && now - e.last > 45000)
      .sort((a, b) => a[1].last - b[1].last);
    for (const [, entry] of candidates) {
      if (decodedBytes <= budget * 0.85) break;
      decodedBytes -= entry.bytes;
      entry.buffers = [];
      entry.bytes = 0;
      entry.state = 'idle';
      entry.promise = null;
      entry.refill = null;
      entry.netFails = 0;
      entry.retryAt = 0;
    }
  }

  function loadOne(id: string): Promise<void> {
    const rec = SFX_ASSETS[id];
    if (!rec) return Promise.resolve();
    let entry = entries.get(id);
    if (!entry) {
      entry = { buffers: [], state: 'idle', promise: null, last: 0, bytes: 0, lastVariant: -1, refill: null, netFails: 0, retryAt: 0 };
      entries.set(id, entry);
    }
    const url = (i: number): string => `${root}audio/sfx/${rec.g}/${id}_${i}.webm`;
    if (entry.promise) {
      // (plan 018) a sound playing while some of its variants failed on the network: those variants, once the wait is over
      if (entry.refill && entry.state === 'ready' && performance.now() >= entry.retryAt) entry.promise = refillSfx(id, rec.r, entry, url);
      return entry.promise;
    }
    if (entry.retryAt && performance.now() < entry.retryAt) return Promise.resolve();
    const target = entry;
    target.state = 'loading';
    target.promise = (async () => {
      if (!(await ready)) { target.state = 'failed'; return; }
      const count = Math.max(1, Math.min(rec.n, maxVariants));
      const fetched = await Promise.all(Array.from({ length: count }, (_, i) => slot(id, () => fetchOne(url(i), rec.r))));
      const buffers = fetched.map((f) => f.buffer);
      target.buffers = buffers;
      target.bytes = buffers.reduce((sum, b) => sum + (b ? bufferBytes(b) : 0), 0);
      decodedBytes += target.bytes;
      target.state = buffers.some(Boolean) ? 'ready' : 'failed';
      target.last = performance.now();
      afterFetch(target, fetched.flatMap((f, i) => (f.network ? [i] : [])));
      // nothing decoded and the network to blame: idle again, so the next load or pick asks once the wait is over
      if (target.state === 'failed' && target.refill) { target.refill = null; target.state = 'idle'; target.promise = null; }
      evictIfNeeded();
    })();
    return target.promise;
  }

  /** (plan 018) The variants of a playing sound the network failed: merged into the same buffers, their bytes counted
   *  once; a sound evicted or reloaded meanwhile takes nothing from this pass. */
  function refillSfx(id: string, rate: number, entry: Entry, url: (i: number) => string): Promise<void> {
    const missing = entry.refill ?? [];
    entry.refill = null;
    const buffers = entry.buffers;
    return (async () => {
      const fetched = await Promise.all(missing.map((i) => slot(id, () => fetchOne(url(i), rate))));
      if (entry.buffers !== buffers || entry.state !== 'ready') return;
      let added = 0;
      for (let k = 0; k < missing.length; k++) {
        const buffer = fetched[k].buffer;
        if (!buffer) continue;
        buffers[missing[k]] = buffer;
        added += bufferBytes(buffer);
      }
      entry.bytes += added;
      decodedBytes += added;
      afterFetch(entry, missing.filter((_, k) => fetched[k].network));
      evictIfNeeded();
    })();
  }

  /** Variants a receipt holds its picks on (holdVariants), by asset id. */
  let held: Record<string, number> | null = null;

  function choose(entry: Entry, random: () => number): AudioBuffer | null {
    const n = entry.buffers.length;
    if (!n) return null;
    let index = Math.floor(random() * n);
    if (n > 1 && index === entry.lastVariant) index = (index + 1 + Math.floor(random() * (n - 1))) % n;
    for (let step = 0; step < n; step++) {
      const buffer = entry.buffers[(index + step) % n];
      if (buffer) {
        entry.lastVariant = (index + step) % n;
        entry.last = performance.now();
        return buffer;
      }
    }
    return null;
  }

  function voiceKey(language: string, line: string): string {
    return `${language}/${line}`;
  }

  const voiceUrl = (language: string, line: string, take: number): string => `${root}audio/voice/${language}/${line}_${take}.webm`;
  /** (plan 018) Packs whose first load has settled, and per pack the lines with takes the network failed. */
  const voiceSettled = new Set<string>();
  const voiceRefills = new Map<string, Set<string>>();
  function voiceRefillsOf(language: string): Set<string> {
    let lines = voiceRefills.get(language);
    if (!lines) { lines = new Set(); voiceRefills.set(language, lines); }
    return lines;
  }

  /** The takes of a loaded pack the network failed, whose wait is over: fetched into the same lines (null: none due). */
  function refillVoice(language: string): Promise<void> | null {
    const lines = voiceRefills.get(language);
    if (!lines) return null;
    const now = performance.now();
    const due = [...lines].filter((line) => (voiceEntries.get(voiceKey(language, line))?.retryAt ?? 0) <= now);
    if (!due.length) return null;
    for (const line of due) lines.delete(line);
    const current = (): boolean => voiceLanguages.get(language) === promise;
    const promise: Promise<void> = (async () => {
      await Promise.resolve(); // (this pass is the pack's current load before its first take starts)
      await Promise.all(due.map(async (line) => {
        const entry = voiceEntries.get(voiceKey(language, line));
        const missing = entry?.refill;
        if (!entry || !missing) return;
        entry.refill = null;
        const fetched = await Promise.all(missing.map((i) => voiceSlot(async () => (current() ? fetchOne(voiceUrl(language, line, i), VOICE_DECODE_HZ) : NOT_FETCHED))));
        if (!current()) return;
        let added = 0;
        for (let k = 0; k < missing.length; k++) {
          const buffer = fetched[k].buffer;
          if (!buffer) continue;
          entry.buffers[missing[k]] = buffer;
          added += bufferBytes(buffer);
        }
        entry.bytes += added;
        voiceBytes += added;
        if (added) entry.state = 'ready';
        afterFetch(entry, missing.filter((_, k) => fetched[k].network));
        if (entry.refill) voiceRefillsOf(language).add(line);
      }));
    })();
    voiceLanguages.set(language, promise);
    return promise;
  }

  return {
    ready,
    get supported() { return supported; },
    record: (id) => SFX_ASSETS[id],
    has(id) {
      const entry = entries.get(id);
      return !!entry && entry.state === 'ready';
    },
    pick(id, random) {
      const entry = entries.get(id);
      if (!entry || entry.state !== 'ready') {
        // wanted now: ahead of whatever is queued for later
        if (entry?.state !== 'failed') promote(id);
        // (plan 018) a sound the network failed is asked for again once its wait is over: a field read until then
        if (!entry || (entry.state === 'idle' && (entry.retryAt === 0 || performance.now() >= entry.retryAt))) void loadOne(id);
        return null;
      }
      const hold = held?.[id];
      if (hold != null && entry.buffers[hold]) return entry.buffers[hold];
      return choose(entry, random);
    },
    holdVariants(next) {
      held = next ? { ...next } : null;
    },
    variant(id, index) {
      const entry = entries.get(id);
      if (!entry || entry.state !== 'ready') return null;
      return entry.buffers[index] ?? null;
    },
    async load(ids, options) {
      const unique = [...new Set(ids)];
      if (options?.front) for (const id of unique) promote(id);
      await Promise.all(unique.map(loadOne));
    },
    pin(ids, replace = false) {
      if (replace) pinned.clear();
      for (const id of ids) pinned.add(id);
    },
    touch(id) {
      const entry = entries.get(id);
      if (entry) entry.last = performance.now();
    },
    loadVoice(language) {
      const pack = VOICE_PACKS[language];
      if (!pack) return Promise.resolve();
      let promise = voiceLanguages.get(language);
      if (promise) {
        // (plan 018) a settled pack whose takes the network failed: those takes again, once the wait is over
        if (voiceSettled.has(language) && voiceRefills.get(language)?.size) promise = refillVoice(language) ?? promise;
        return promise;
      }
      const current = (): boolean => voiceLanguages.get(language) === promise;
      promise = (async () => {
        if (!(await ready) || !current()) return;
        await Promise.all(Object.entries(pack).map(async ([line, takes]) => {
          const entry: Entry = { buffers: [], state: 'loading', promise: null, last: 0, bytes: 0, lastVariant: -1, refill: null, netFails: 0, retryAt: 0 };
          voiceEntries.set(voiceKey(language, line), entry);
          const fetched = await Promise.all(takes.map((_, i) => voiceSlot(async () => (current() ? fetchOne(voiceUrl(language, line, i), VOICE_DECODE_HZ) : NOT_FETCHED))));
          if (!current()) return;
          entry.buffers = fetched.map((f) => f.buffer);
          entry.bytes = entry.buffers.reduce((sum, b) => sum + (b ? bufferBytes(b) : 0), 0);
          voiceBytes += entry.bytes;
          entry.state = entry.buffers.some(Boolean) ? 'ready' : 'failed';
          afterFetch(entry, fetched.flatMap((f, i) => (f.network ? [i] : [])));
          if (entry.refill) voiceRefillsOf(language).add(line);
        }));
        if (current()) { readyVoices.add(language); voiceSettled.add(language); }
      })();
      voiceLanguages.set(language, promise);
      return promise;
    },
    async idle() {
      // every load promise already observed to settle; a pass that finds none new in flight ends the wait
      for (;;) {
        const inFlight: Promise<void>[] = [];
        for (const entry of entries.values()) if (entry.promise && !settledLoads.has(entry.promise)) inFlight.push(entry.promise);
        for (const promise of voiceLanguages.values()) if (!settledLoads.has(promise)) inFlight.push(promise);
        if (!inFlight.length) return;
        await Promise.all(inFlight.map((promise) => promise.then(() => { settledLoads.add(promise); }, () => { settledLoads.add(promise); })));
      }
    },
    dropVoice(language) {
      if (!voiceLanguages.delete(language)) return;
      readyVoices.delete(language);
      voiceSettled.delete(language);
      voiceRefills.delete(language);
      for (const line of Object.keys(VOICE_PACKS[language] ?? {})) {
        const key = voiceKey(language, line);
        voiceBytes -= voiceEntries.get(key)?.bytes ?? 0;
        voiceEntries.delete(key);
      }
    },
    voiceReady: (language) => readyVoices.has(language),
    voice(language, line, random, take) {
      const entry = voiceEntries.get(voiceKey(language, line));
      if (!entry || entry.state !== 'ready') return null;
      const exact = take != null ? entry.buffers[take] : null;
      if (take != null && exact) {
        entry.lastVariant = take;
        entry.last = performance.now();
        return exact;
      }
      return choose(entry, random);
    },
    voiceTakes(language, line) {
      return VOICE_PACKS[language]?.[line]?.length ?? 0;
    },
    voiceTake(language, line) {
      return voiceEntries.get(voiceKey(language, line))?.lastVariant ?? -1;
    },
    stats() {
      let pending = 0;
      for (const e of entries.values()) if (e.state === 'loading') pending++;
      return {
        assets: [...entries.values()].filter((e) => e.state === 'ready').length,
        decodedMb: +((decodedBytes + voiceBytes) / 1048576).toFixed(1),
        sfxMb: +(decodedBytes / 1048576).toFixed(1),
        voiceMb: +(voiceBytes / 1048576).toFixed(1),
        pinned: pinned.size,
        pending,
        failed,
        voices: [...readyVoices],
      };
    },
  };
}
