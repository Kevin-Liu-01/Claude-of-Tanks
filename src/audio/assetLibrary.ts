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
 * - Failure is local: a missing or undecodable file mutes that one variant.
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
}

export interface AssetLibrary {
  /** Resolves once the format probe has run; false = samples unavailable. */
  readonly ready: Promise<boolean>;
  readonly supported: boolean | null;
  record(id: string): SfxAssetRecord | undefined;
  /** At least one variant decoded. */
  has(id: string): boolean;
  /** A decoded variant, avoiding an immediate repeat. */
  pick(id: string, random: () => number): AudioBuffer | null;
  variant(id: string, index: number): AudioBuffer | null;
  load(ids: Iterable<string>): Promise<void>;
  /**
   * Keep assets decoded for the current context (the battle set, the garage
   * set, live loops): eviction never drops a pinned asset, so a sound that
   * waited minutes for its moment still plays. `replace` starts a new set.
   */
  pin(ids: Iterable<string>, replace?: boolean): void;
  /** Mark assets as in use (LRU eviction never drops what played recently). */
  touch(id: string): void;
  loadVoice(language: string): Promise<void>;
  voiceReady(language: string): boolean;
  /** A decoded take of a crew line: the given take when it exists, else a random one (no immediate repeat). */
  voice(language: string, line: string, random: () => number, take?: number): AudioBuffer | null;
  voiceTakes(language: string, line: string): number;
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
}

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

function bufferBytes(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * 4;
}

export function createAssetLibrary({
  context,
  base = '/',
  lowMemory = false,
  maxDecodedMb = lowMemory ? 96 : 200,
  maxVariants = lowMemory ? 1 : Infinity,
  fetchImpl = (...args) => fetch(...args),
  createDecoder = defaultDecoder,
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
  const waiting: (() => void)[] = [];
  const CONCURRENCY = 6;
  const root = base.endsWith('/') ? base : `${base}/`;

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

  async function slot<T>(task: () => Promise<T>): Promise<T> {
    if (active >= CONCURRENCY) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try { return await task(); } finally {
      active--;
      waiting.shift()?.();
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
    }
  }

  function loadOne(id: string): Promise<void> {
    const rec = SFX_ASSETS[id];
    if (!rec) return Promise.resolve();
    let entry = entries.get(id);
    if (!entry) {
      entry = { buffers: [], state: 'idle', promise: null, last: 0, bytes: 0, lastVariant: -1 };
      entries.set(id, entry);
    }
    if (entry.promise) return entry.promise;
    const target = entry;
    target.state = 'loading';
    target.promise = (async () => {
      if (!(await ready)) { target.state = 'failed'; return; }
      const files = Array.from({ length: Math.max(1, Math.min(rec.n, maxVariants)) }, (_, i) => `${root}audio/sfx/${rec.g}/${id}_${i}.webm`);
      const buffers = await Promise.all(files.map((url) => slot(async () => {
        try {
          const res = await fetchImpl(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await decode(await res.arrayBuffer(), rec.r);
        } catch {
          failed++;
          return null;
        }
      })));
      target.buffers = buffers;
      target.bytes = buffers.reduce((sum, b) => sum + (b ? bufferBytes(b) : 0), 0);
      decodedBytes += target.bytes;
      target.state = buffers.some(Boolean) ? 'ready' : 'failed';
      target.last = performance.now();
      evictIfNeeded();
    })();
    return target.promise;
  }

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
        if (!entry || entry.state === 'idle') void loadOne(id);
        return null;
      }
      return choose(entry, random);
    },
    variant(id, index) {
      const entry = entries.get(id);
      if (!entry || entry.state !== 'ready') return null;
      return entry.buffers[index] ?? null;
    },
    async load(ids) {
      await Promise.all([...new Set(ids)].map(loadOne));
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
      if (promise) return promise;
      promise = (async () => {
        if (!(await ready)) return;
        await Promise.all(Object.entries(pack).map(async ([line, takes]) => {
          const entry: Entry = { buffers: [], state: 'loading', promise: null, last: 0, bytes: 0, lastVariant: -1 };
          voiceEntries.set(voiceKey(language, line), entry);
          entry.buffers = await Promise.all(takes.map((_, i) => voiceSlot(async () => {
            try {
              const res = await fetchImpl(`${root}audio/voice/${language}/${line}_${i}.webm`);
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              // Speech is band-limited by the radio chain anyway: 24 kHz decode.
              return await decode(await res.arrayBuffer(), 24000);
            } catch {
              failed++;
              return null;
            }
          })));
          entry.bytes = entry.buffers.reduce((sum, b) => sum + (b ? bufferBytes(b) : 0), 0);
          voiceBytes += entry.bytes;
          entry.state = entry.buffers.some(Boolean) ? 'ready' : 'failed';
        }));
        readyVoices.add(language);
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
