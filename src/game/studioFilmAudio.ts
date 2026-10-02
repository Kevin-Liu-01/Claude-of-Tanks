/**
 * studioFilmAudio.ts — the film export's soundtrack (lazy, browser).
 *
 * While a film renders, the Studio logs a cue for every combat sound its
 * timeline produces (gun reports, armour hits, terrain strikes, HE bursts,
 * vehicle destructions) at the exact timeline instant and world position.
 * After the last frame the cues are mixed offline with an OfflineAudioContext
 * from the game's own baked SFX (public/audio/sfx, the audioPolicy.ts catalog,
 * distance gain and air-absorption curves, and the layer recipes of
 * src/audio/audio.ts): each sound is spatialized against the film camera at
 * that instant, arrives after the speed-of-sound delay, and follows the film's
 * speed ramp (a 0.2x beat plays its boom pitched down and stretched, as a
 * high-speed camera's slowed soundtrack would). Deterministic: a seeded RNG
 * picks variants and jitter, so the same film mixes the same samples.
 */
import {
  SFX_FILES,
  SPEED_OF_SOUND_MPS,
  distanceLowpassHz,
  mulberry32,
  worldDistanceGain,
} from '../audio/audioPolicy.ts';
import type { MuxAudioTrack } from './studioFilmMux.ts';

export type FilmSoundKind = 'cannon' | 'pen' | 'nonpen' | 'ricochet' | 'era' | 'he' | 'dirt' | 'tank';

export interface FilmSoundCue {
  readonly timelineMs: number;
  readonly kind: FilmSoundKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly caliberMm: number;
  readonly cause?: 'ammorack' | 'shot' | 'fire';
}

export interface FilmSoundLayer {
  readonly name: string;
  /** Seconds after the cue's arrival. */
  readonly delayS: number;
  readonly gain: number;
  readonly rate: number;
}

export interface FilmSoundVoice {
  readonly gain: number;
  /** Extra air absorption distance for the lowpass (m). */
  readonly lowpassBiasM: number;
  readonly layers: readonly FilmSoundLayer[];
}

/** Arrival delay of a sound over `distanceM` (s), as the live mixer applies it. */
export function filmTravelDelayS(distanceM: number): number {
  return distanceM > 40 ? Math.min(1.6, distanceM / SPEED_OF_SOUND_MPS) : 0;
}

function cannonCarry(distanceM: number): number {
  return 1 + 0.85 * Math.max(0, Math.min(1, (distanceM - 180) / 720));
}

/**
 * The baked layers for one cue heard from `distanceM` (pure; mirrors the
 * baked voices of src/audio/audio.ts for a non-player source). Null when the
 * sound is inaudible at that range.
 */
export function filmSoundVoice(cue: FilmSoundCue, distanceM: number, random: () => number): FilmSoundVoice | null {
  const d = Math.max(0.5, distanceM);
  const jitter = () => 0.96 + random() * 0.08;
  const pick = <T>(options: readonly T[]): T => options[Math.min(options.length - 1, Math.floor(random() * options.length))];
  const base = worldDistanceGain(d);
  switch (cue.kind) {
    case 'cannon': {
      if (base < 0.00075) return null;
      const caliber = cue.caliberMm || 120;
      const cls = caliber > 130 ? 'huge' : caliber > 105 ? 'large' : caliber > 76 ? 'medium' : 'small';
      const crackK = Math.max(0, Math.min(1, 1 - (d - 45) / 135));
      const layers: FilmSoundLayer[] = [{ name: `fire_${cls}_sub`, delayS: 0, gain: 0.72 + 0.28 * crackK, rate: jitter() }];
      if (crackK > 0.02) layers.push({ name: `fire_${cls}_crack`, delayS: random() * 0.006, gain: crackK, rate: jitter() });
      layers.push({ name: `fire_${cls}_tail`, delayS: 0.012 + random() * 0.018, gain: 1, rate: jitter() });
      return { gain: base * cannonCarry(d), lowpassBiasM: 0, layers };
    }
    case 'pen':
      if (base < 0.0015) return null;
      return { gain: base * 0.95, lowpassBiasM: 0, layers: [{ name: pick(['impact_pen_a', 'impact_pen_b']), delayS: 0, gain: 1, rate: jitter() }] };
    case 'nonpen':
      if (base < 0.0015) return null;
      return { gain: base * 0.95, lowpassBiasM: 0, layers: [{ name: pick(['impact_absorb_a', 'impact_absorb_b']), delayS: 0, gain: 1, rate: jitter() }] };
    case 'ricochet':
      if (base < 0.0015) return null;
      return { gain: base * 0.9, lowpassBiasM: 0, layers: [{ name: pick(['ricochet_a', 'ricochet_b', 'ricochet_c']), delayS: 0, gain: 1, rate: 0.94 + random() * 0.12 }] };
    case 'era':
      if (base < 0.0015) return null;
      return { gain: base * 0.9, lowpassBiasM: 0, layers: [{ name: 'era_pop', delayS: 0, gain: 1, rate: jitter() }] };
    case 'dirt':
      if (base < 0.003) return null;
      return { gain: base * 0.75, lowpassBiasM: 60, layers: [{ name: 'impact_dirt', delayS: 0, gain: 1, rate: jitter() }] };
    case 'he': {
      if (base < 0.0015) return null;
      const rate = Math.max(0.82, Math.min(1.18, 0.9 + (122 - (cue.caliberMm || 122)) / 300)) * (0.97 + random() * 0.06);
      return { gain: base * 0.85, lowpassBiasM: 120, layers: [
        { name: pick(['expl_he_a', 'expl_he_b']), delayS: 0, gain: 1, rate },
        { name: 'impact_dirt', delayS: 0.01, gain: 0.9, rate: jitter() },
      ] };
    }
    case 'tank': {
      const gain = Math.pow(Math.min(1, 26 / d), 1.6);
      if (gain < 0.002) return null;
      if (cue.cause === 'fire') {
        return { gain: gain * 0.95, lowpassBiasM: 0, layers: [
          { name: 'expl_burnout', delayS: 0, gain: 1, rate: jitter() },
          { name: 'expl_tank_debris', delayS: 0.12 + random() * 0.08, gain: 0.45, rate: jitter() },
        ] };
      }
      const rack = cue.cause !== 'shot';
      const rate = (rack ? 0.98 : 1.06) * (0.97 + random() * 0.06);
      const layers: FilmSoundLayer[] = [
        { name: pick(['expl_tank_core_a', 'expl_tank_core_b']), delayS: 0, gain: 1, rate },
        { name: 'expl_tank_debris', delayS: 0.06 + random() * 0.09, gain: rack ? 0.9 : 0.7, rate: jitter() },
      ];
      if (rack) layers.push({ name: 'expl_turret_pop', delayS: 0.10 + random() * 0.08, gain: 0.95, rate: jitter() });
      return { gain: gain * (rack ? 1 : 0.85), lowpassBiasM: 0, layers };
    }
    default:
      return null;
  }
}

/** Camera pose at a timeline instant (position, right axis, forward axis). */
export interface FilmListener {
  x: number; y: number; z: number;
  rightX: number; rightY: number; rightZ: number;
}

export interface FilmSoundPorts {
  listenerAt(timelineMs: number, out: FilmListener): void;
  /** Timeline ms -> film ms from the film's first frame (speed ramps included). */
  filmMsAt(timelineMs: number): number;
  /** Playback speed at a timeline instant (1 = real time). */
  speedAt(timelineMs: number): number;
}

export interface FilmSoundOptions {
  readonly durationS: number;
  readonly sampleRate?: number;
  readonly seed?: number;
  readonly baseUrl?: string;
}

/** Mix the cues into a stereo buffer (OfflineAudioContext); null when nothing is audible. */
export async function renderFilmSoundtrack(
  cues: readonly FilmSoundCue[],
  ports: FilmSoundPorts,
  options: FilmSoundOptions,
): Promise<AudioBuffer | null> {
  if (typeof OfflineAudioContext === 'undefined' || !cues.length) return null;
  const sampleRate = options.sampleRate ?? 48000;
  const frames = Math.max(1, Math.ceil(options.durationS * sampleRate));
  const context = new OfflineAudioContext(2, frames, sampleRate);
  const random = mulberry32((options.seed ?? 5000) ^ 0x51ad);
  const listener: FilmListener = { x: 0, y: 0, z: 0, rightX: 1, rightY: 0, rightZ: 0 };
  const planned: { at: number; rate: number; pan: number; lowpassHz: number; voice: FilmSoundVoice }[] = [];
  for (const cue of [...cues].sort((a, b) => a.timelineMs - b.timelineMs)) {
    ports.listenerAt(cue.timelineMs, listener);
    const dx = cue.x - listener.x, dy = cue.y - listener.y, dz = cue.z - listener.z;
    const distance = Math.max(0.5, Math.hypot(dx, dy, dz));
    const voice = filmSoundVoice(cue, distance, random);
    if (!voice) continue;
    const arrivalMs = cue.timelineMs + filmTravelDelayS(distance) * 1000;
    const at = ports.filmMsAt(arrivalMs) / 1000;
    if (!(at < options.durationS)) continue;
    const lateral = (dx * listener.rightX + dy * listener.rightY + dz * listener.rightZ) / distance;
    planned.push({ at: Math.max(0, at), rate: ports.speedAt(arrivalMs), pan: Math.max(-1, Math.min(1, lateral)) * 0.85,
      lowpassHz: distanceLowpassHz(distance + voice.lowpassBiasM), voice });
  }
  if (!planned.length) return null;
  const names = new Set(planned.flatMap((entry) => entry.voice.layers.map((layer) => layer.name)));
  const base = options.baseUrl ?? '/';
  const buffers = new Map<string, AudioBuffer>();
  await Promise.all([...names].map(async (name) => {
    const file = SFX_FILES[name];
    if (!file) return;
    const response = await fetch(`${base}audio/sfx/${file}`);
    if (!response.ok) throw new Error(`Missing film sound ${file}`);
    buffers.set(name, await context.decodeAudioData(await response.arrayBuffer()));
  }));
  // Gentle bus glue, then a final peak normalisation below.
  const bus = context.createDynamicsCompressor();
  bus.threshold.value = -12; bus.knee.value = 10; bus.ratio.value = 3; bus.attack.value = 0.004; bus.release.value = 0.25;
  bus.connect(context.destination);
  for (const entry of planned) {
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = entry.lowpassHz;
    const panner = context.createStereoPanner();
    panner.pan.value = entry.pan;
    const gain = context.createGain();
    gain.gain.value = entry.voice.gain;
    lowpass.connect(gain).connect(panner).connect(bus);
    for (const layer of entry.voice.layers) {
      const buffer = buffers.get(layer.name);
      if (!buffer) continue;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = layer.rate * entry.rate;
      const layerGain = context.createGain();
      layerGain.gain.value = layer.gain;
      source.connect(layerGain).connect(lowpass);
      source.start(entry.at + layer.delayS / entry.rate);
    }
  }
  const mixed = await context.startRendering();
  let peak = 0;
  for (let channel = 0; channel < mixed.numberOfChannels; channel++) {
    const data = mixed.getChannelData(channel);
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  }
  if (peak > 0) {
    const scale = Math.min(4, 0.89 / peak); // −1 dBFS
    for (let channel = 0; channel < mixed.numberOfChannels; channel++) {
      const data = mixed.getChannelData(channel);
      for (let i = 0; i < data.length; i++) data[i] *= scale;
    }
  }
  return mixed;
}

/** OpusHead for WebM CodecPrivate (RFC 7845), when the encoder supplies none. */
function opusHead(channels: number, sampleRate: number, preSkip: number): Uint8Array {
  const out = new Uint8Array(19);
  out.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0);
  const view = new DataView(out.buffer);
  view.setUint8(8, 1);
  view.setUint8(9, channels);
  view.setUint16(10, preSkip, true);
  view.setUint32(12, sampleRate, true);
  return out;
}

/**
 * The encoder's start-up delay in samples, measured rather than assumed
 * (AAC encoders differ: 1024, 2112, ...): a click is encoded, decoded, and
 * found again. The MP4 edit list then hides exactly that priming, so every
 * gun report lands on its frame.
 */
async function measurePriming(config: AudioEncoderConfig): Promise<number> {
  if (typeof AudioDecoder === 'undefined') return 0;
  const rate = config.sampleRate, channels = config.numberOfChannels, frames = Math.round(rate / 4), at = Math.round(rate / 20);
  const chunks: EncodedAudioChunk[] = [];
  let decoderConfig: AudioDecoderConfig | null = null;
  const encoder = new AudioEncoder({
    output(chunk, metadata) { chunks.push(chunk); if (metadata?.decoderConfig && !decoderConfig) decoderConfig = metadata.decoderConfig; },
    error() { /* a failed probe means no priming correction */ },
  });
  try {
    encoder.configure(config);
    const planar = new Float32Array(frames * channels);
    for (let c = 0; c < channels; c++) for (let i = 0; i < 32; i++) planar[c * frames + at + i] = Math.sin((i / 32) * Math.PI) * 0.8;
    const data = new AudioData({ format: 'f32-planar', sampleRate: rate, numberOfFrames: frames, numberOfChannels: channels, timestamp: 0, data: planar });
    encoder.encode(data);
    data.close();
    await encoder.flush();
  } catch {
    return 0;
  } finally {
    try { if (encoder.state !== 'closed') encoder.close(); } catch { /* closed */ }
  }
  const config2 = decoderConfig as AudioDecoderConfig | null;
  if (!config2) return 0;
  let peak = 0, peakAt = -1, total = 0;
  const decoder = new AudioDecoder({
    output(data) {
      const plane = new Float32Array(data.numberOfFrames);
      data.copyTo(plane, { planeIndex: 0, format: 'f32-planar' });
      for (let i = 0; i < plane.length; i++) if (Math.abs(plane[i]) > peak) { peak = Math.abs(plane[i]); peakAt = total + i; }
      total += plane.length;
      data.close();
    },
    error() { /* no correction */ },
  });
  try {
    decoder.configure(config2);
    for (const chunk of chunks) decoder.decode(chunk);
    await decoder.flush();
  } catch {
    return 0;
  } finally {
    try { if (decoder.state !== 'closed') decoder.close(); } catch { /* closed */ }
  }
  const delay = peakAt - (at + 16);
  return peak > 0.2 && delay > 0 && delay < rate / 10 ? delay : 0;
}

/**
 * Encode a soundtrack with WebCodecs (AAC-LC for MP4, Opus for WebM). Null
 * when this browser cannot encode audio; the film then stays silent.
 */
export async function encodeFilmSoundtrack(buffer: AudioBuffer, container: 'mp4' | 'webm'): Promise<MuxAudioTrack | null> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return null;
  const config: AudioEncoderConfig = {
    codec: container === 'mp4' ? 'mp4a.40.2' : 'opus',
    sampleRate: buffer.sampleRate,
    numberOfChannels: buffer.numberOfChannels,
    bitrate: 192_000,
  };
  try {
    if (!(await AudioEncoder.isConfigSupported(config)).supported) return null;
  } catch {
    return null;
  }
  const samples: { data: Uint8Array; key: boolean; frames: number }[] = [];
  let description: Uint8Array | null = null;
  let failure: Error | null = null;
  const encoder = new AudioEncoder({
    output(chunk, metadata) {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      const frames = Math.round((chunk.duration ?? 0) * buffer.sampleRate / 1e6) || (container === 'mp4' ? 1024 : 960);
      samples.push({ data, key: true, frames });
      const source = metadata?.decoderConfig?.description;
      if (source && !description) {
        description = ArrayBuffer.isView(source)
          ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength).slice()
          : new Uint8Array(source).slice();
      }
    },
    error(error) { failure ??= error instanceof Error ? error : new Error(String(error)); },
  });
  try {
    encoder.configure(config);
    const block = 4096;
    for (let offset = 0; offset < buffer.length; offset += block) {
      const count = Math.min(block, buffer.length - offset);
      const planar = new Float32Array(count * buffer.numberOfChannels);
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        planar.set(buffer.getChannelData(channel).subarray(offset, offset + count), channel * count);
      }
      const data = new AudioData({
        format: 'f32-planar', sampleRate: buffer.sampleRate, numberOfFrames: count,
        numberOfChannels: buffer.numberOfChannels, timestamp: Math.round(offset * 1e6 / buffer.sampleRate), data: planar,
      });
      encoder.encode(data);
      data.close();
    }
    await encoder.flush();
    if (failure) throw failure;
  } finally {
    try { if (encoder.state !== 'closed') encoder.close(); } catch { /* closed by an error */ }
  }
  const finalDescription: Uint8Array | null = description ?? (container === 'webm' ? opusHead(buffer.numberOfChannels, buffer.sampleRate, 312) : null);
  if (!finalDescription || !samples.length) return null;
  // WebM signals Opus pre-skip in its header; MP4 needs an explicit edit list.
  const primingFrames = container === 'mp4' ? await measurePriming(config) : 0;
  return { sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels, description: finalDescription, samples, primingFrames };
}
