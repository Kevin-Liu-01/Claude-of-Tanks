/**
 * studioFilmAudio.ts — the film export's soundtrack (lazy, browser).
 *
 * While a film renders, the Studio logs a cue for every combat sound its
 * timeline produces (gun reports, armour hits, terrain strikes, HE bursts,
 * vehicle destructions) at the exact timeline instant and world position.
 * After the last frame the cues are mixed offline with an OfflineAudioContext
 * from the game's recorded sound library (public/audio/sfx, PR #9's generated
 * set; docs/AUDIO.md), layered as src/audio/audioEngine.ts layers them: a shot
 * is the bore's punch, close report, distant report and the map's echo tail;
 * a kill is the blast, its sub, the debris (and the turret landing after an
 * ammunition fire). Each sound is spatialized against the film camera at that
 * instant, arrives after the speed-of-sound delay, and follows the film's
 * speed ramp (a 0.2x beat plays its boom pitched down and stretched, as a
 * high-speed camera's slowed soundtrack would). Deterministic: a seeded RNG
 * picks variants and jitter, so the same film mixes the same recordings.
 * Nothing is synthesized and no recording stands in for another: a missing
 * file fails the soundtrack.
 */
import type { MuxAudioTrack } from './studioFilmMux.ts';

/**
 * The film's seeded variant picks: audioMath.ts's mulberry32, written here because a Studio import of audioMath.ts
 * splits it out of the sound engine's chunk (one more request whenever the game's audio loads).
 */
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return function random(): number {
    state = state + 0x6D2B79F5 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

// The engine's data this module plays by, copied rather than imported: the Studio's chunks must not import a module
// of the game's audio chunk (Rolldown would split it into a request of its own whenever the game's audio loads).
// studioFilmAudio.selftest.mjs holds each copy to its source: the recordings and their variant counts to
// sfxManifest.generated.ts, the weapon classes to weaponAudio.ts, the echo tails to environmentScenes.ts.
const SPEED_OF_SOUND_MPS = 340;
/** The recordings a film plays: [group directory, variant count] (public/audio/sfx/<group>/<id>_<k>.webm). */
export const FILM_SFX: Readonly<Record<string, readonly [string, number]>> = Object.freeze({
  blast_punch_light: ['weapons', 3], blast_punch_medium: ['weapons', 3], blast_punch_heavy: ['weapons', 3],
  mg_rifle_close: ['weapons', 3], mg_heavy_close: ['weapons', 4],
  ac_20_close: ['weapons', 4], ac_25_close: ['weapons', 4], ac_30_close: ['weapons', 4], ac_40_close: ['weapons', 4], ac_50_close: ['weapons', 4],
  gun_90_close: ['weapons', 3], gun_105_close: ['weapons', 3], gun_120_close: ['weapons', 3], gun_125_close: ['weapons', 3],
  gun_130_close: ['weapons', 3], gun_152_close: ['weapons', 3], atgm_launch: ['weapons', 3], rocket_salvo: ['weapons', 2],
  mg_far: ['weapons', 3], ac_far_light: ['weapons', 3], ac_far_heavy: ['weapons', 3],
  gun_far_light: ['weapons', 2], gun_far_medium: ['weapons', 2], gun_far_heavy: ['weapons', 2],
  tail_open: ['weapons', 2], tail_forest: ['weapons', 2], tail_urban: ['weapons', 2], tail_mountain: ['weapons', 2],
  pen_heavy: ['impacts', 3], pen_light: ['impacts', 3], hull_thud_sub: ['impacts', 3], nonpen_heavy: ['impacts', 3],
  ricochet_heavy: ['impacts', 4], ricochet_light: ['impacts', 4], era_det: ['impacts', 2], ground_dirt: ['impacts', 3],
  expl_he_small: ['impacts', 3], expl_he_medium: ['impacts', 3], expl_he_large: ['impacts', 2], blast_sub: ['impacts', 3],
  burnout_blast: ['destruction', 1], debris_metal: ['destruction', 2], tank_explode: ['destruction', 2],
  tank_explode_ammo: ['destruction', 2], turret_land: ['destruction', 2],
});

type WeaponFamily = 'mg' | 'autocannon' | 'cannon' | 'launcher';
interface FilmWeapon {
  readonly family: WeaponFamily;
  /** Close report fades out across these ranges (m), the distant one fades in across the next. */
  readonly closeFadeM: readonly [number, number];
  readonly farFadeM: readonly [number, number];
  readonly tailRate: number;
  readonly tailGain: number;
  readonly close: string;
  readonly far: string;
}
const W = (family: WeaponFamily, closeFadeM: readonly [number, number], farFadeM: readonly [number, number], tailRate: number, tailGain: number,
  close: string, far: string): FilmWeapon => Object.freeze({ family, closeFadeM, farFadeM, tailRate, tailGain, close, far });
/** weaponAudio.ts WEAPON_CLASSES with audioEngine.ts WEAPON_CLOSE / WEAPON_FAR, by class id. */
export const FILM_WEAPONS: Readonly<Record<string, FilmWeapon>> = Object.freeze({
  mg_rifle: W('mg', [30, 140], [40, 160], 1.45, 0.12, 'mg_rifle_close', 'mg_far'),
  mg_heavy: W('mg', [40, 190], [50, 220], 1.3, 0.18, 'mg_heavy_close', 'mg_far'),
  ac_20: W('autocannon', [45, 210], [60, 260], 1.22, 0.3, 'ac_20_close', 'ac_far_light'),
  ac_25: W('autocannon', [50, 230], [65, 280], 1.16, 0.34, 'ac_25_close', 'ac_far_light'),
  ac_30: W('autocannon', [55, 250], [70, 300], 1.1, 0.38, 'ac_30_close', 'ac_far_light'),
  ac_40: W('autocannon', [60, 270], [80, 320], 1.04, 0.44, 'ac_40_close', 'ac_far_heavy'),
  ac_50: W('autocannon', [65, 290], [85, 340], 0.98, 0.5, 'ac_50_close', 'ac_far_heavy'),
  gun_90: W('cannon', [140, 330], [90, 360], 0.96, 0.62, 'gun_90_close', 'gun_far_light'),
  gun_105: W('cannon', [145, 360], [95, 400], 0.93, 0.72, 'gun_105_close', 'gun_far_light'),
  gun_120: W('cannon', [150, 390], [100, 440], 0.9, 0.82, 'gun_120_close', 'gun_far_medium'),
  gun_125: W('cannon', [150, 400], [100, 450], 0.88, 0.86, 'gun_125_close', 'gun_far_medium'),
  gun_130: W('cannon', [155, 420], [110, 480], 0.85, 0.92, 'gun_130_close', 'gun_far_heavy'),
  gun_152: W('cannon', [160, 450], [120, 520], 0.8, 1, 'gun_152_close', 'gun_far_heavy'),
  rocket_heavy: W('launcher', [80, 360], [100, 460], 0.9, 0.85, 'rocket_salvo', 'gun_far_heavy'),
});
/** weaponAudio.ts weaponClassForCaliber. */
export function filmWeaponClass(caliberMm: number): string {
  const mm = Number.isFinite(caliberMm) ? caliberMm : 100;
  if (mm < 9) return 'mg_rifle';
  if (mm < 16) return 'mg_heavy';
  if (mm < 23) return 'ac_20';
  if (mm < 27) return 'ac_25';
  if (mm < 33) return 'ac_30';
  if (mm < 45) return 'ac_40';
  if (mm < 61) return 'ac_50';
  if (mm < 95) return 'gun_90';
  if (mm < 111) return 'gun_105';
  if (mm < 123) return 'gun_120';
  if (mm < 128) return 'gun_125';
  if (mm < 146) return 'gun_130';
  if (mm < 200) return 'gun_152';
  return 'rocket_heavy';
}
/** environmentScenes.ts MAP_SCENES[map].tail: the echo a shot leaves on each battlefield ('open' when unlisted). */
export const FILM_TAILS: Readonly<Record<string, 'urban' | 'forest' | 'mountain' | 'none'>> = Object.freeze({
  urban: 'urban', railyard: 'urban', foundry: 'urban', ruinspires: 'urban', blackglass: 'urban',
  autumn: 'forest', delta: 'forest', monsoon: 'forest', orchard: 'forest', longleaf: 'forest', mangrove: 'forest',
  fjord: 'mountain', badlands: 'mountain', alpine: 'mountain', caldera: 'mountain', titan_gorge: 'mountain',
  skybridge: 'mountain', copper_mesa: 'mountain', reservoir: 'mountain', cliffbridge: 'mountain',
  moon: 'none',
});
type FilmTail = 'open' | 'urban' | 'forest' | 'mountain' | 'none';
/** audioEngine.ts punchFor and BLAST_DB: the punch under a close report (a recording by bore, cut short). */
function punchFor(family: WeaponFamily, caliberMm: number): { id: string; rate: number; maxDurS: number; db: number } | null {
  if (family === 'mg') return { id: 'blast_punch_light', rate: clamp(1.12 - (caliberMm - 7.62) / 50, 0.96, 1.12), maxDurS: 0.22, db: -19 };
  if (family === 'autocannon') return { id: 'blast_punch_medium', rate: clamp(1.15 - (caliberMm - 20) / 60, 0.9, 1.15), maxDurS: 0.32, db: -16 };
  if (family === 'cannon') return { id: 'blast_punch_heavy', rate: clamp(1.1 - (caliberMm - 90) / 200, 0.88, 1.1), maxDurS: 0.5, db: -6 };
  return null;
}
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const ramp = (v: number, [a, b]: readonly [number, number]): number => clamp((v - a) / Math.max(1e-6, b - a), 0, 1);
const fromDb = (db: number): number => Math.pow(10, db / 20);
/** A gun carries: the engine's compressed weapon law (25 m reference, rolloff 0.6). */
const weaponDistanceGain = (distanceM: number): number => Math.pow(25 / Math.max(25, distanceM), 0.6);
/** Everything else falls off as a point source (the old film law, kept for hits, bursts and kills). */
const worldDistanceGain = (distanceM: number): number => Math.pow(Math.min(22 / Math.max(0.5, distanceM || 0.5), 1), 1.5);
const distanceLowpassHz = (distanceM: number): number => Math.max(450, Math.min(18000, 18000 * (40 / (40 + Math.max(0, distanceM || 0)))));

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
  /** A recording id of FILM_SFX. */
  readonly name: string;
  /** Which of its variants (public/audio/sfx/<group>/<name>_<variant>.webm). */
  readonly variant: number;
  /** Seconds after the cue's arrival. */
  readonly delayS: number;
  readonly gain: number;
  readonly rate: number;
  /** Cut the recording short (seconds of its own time), as the engine cuts the punch under a report. */
  readonly maxDurS?: number;
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

/**
 * The recorded layers for one cue heard from `distanceM` (pure; the layering of src/audio/audioEngine.ts for a source
 * that is not the player's own tank). Null when the sound is inaudible at that range.
 */
export function filmSoundVoice(cue: FilmSoundCue, distanceM: number, random: () => number, tail: FilmTail = 'open'): FilmSoundVoice | null {
  const d = Math.max(0.5, distanceM);
  const jitter = () => 0.96 + random() * 0.08;
  const layer = (name: string, gain: number, rate = jitter(), delayS = 0, maxDurS?: number): FilmSoundLayer => ({
    name, variant: Math.min(FILM_SFX[name]![1] - 1, Math.floor(random() * FILM_SFX[name]![1])), delayS, gain, rate, ...(maxDurS ? { maxDurS } : {}),
  });
  const base = worldDistanceGain(d);
  const heavy = (cue.caliberMm || 120) >= 100;
  switch (cue.kind) {
    case 'cannon': {
      const caliber = cue.caliberMm || 120;
      const weapon = FILM_WEAPONS[filmWeaponClass(caliber)]!;
      const gain = weaponDistanceGain(d);
      if (gain < 0.004) return null;
      const closeK = 1 - ramp(d, weapon.closeFadeM), farK = ramp(d, weapon.farFadeM);
      const layers: FilmSoundLayer[] = [];
      const punch = closeK > 0.05 ? punchFor(weapon.family, caliber) : null;
      if (punch) layers.push(layer(punch.id, fromDb(punch.db), punch.rate, 0, punch.maxDurS));
      if (closeK > 0.03) layers.push(layer(weapon.close, closeK));
      // the distant banks are loudness-mastered booms, the close reports peak-mastered cracks: the boom sits under
      if (farK > 0.03) layers.push(layer(weapon.far, farK * fromDb(-3)));
      if (tail !== 'none') layers.push(layer(`tail_${tail}`, weapon.tailGain * fromDb(-12), weapon.tailRate * jitter(), 0.035 + random() * 0.02));
      return { gain, lowpassBiasM: 0, layers };
    }
    case 'pen':
      if (base < 0.0015) return null;
      return { gain: base * 0.95, lowpassBiasM: 0, layers: [layer(heavy ? 'pen_heavy' : 'pen_light', 1), layer('hull_thud_sub', 0.7)] };
    case 'nonpen':
      if (base < 0.0015) return null;
      return { gain: base * 0.95, lowpassBiasM: 0, layers: [layer('nonpen_heavy', 1)] };
    case 'ricochet':
      if (base < 0.0015) return null;
      return { gain: base * 0.9, lowpassBiasM: 0, layers: [layer(heavy ? 'ricochet_heavy' : 'ricochet_light', 1, 0.94 + random() * 0.12)] };
    case 'era':
      if (base < 0.0015) return null;
      return { gain: base * 0.9, lowpassBiasM: 0, layers: [layer('era_det', 1)] };
    case 'dirt':
      if (base < 0.003) return null;
      return { gain: base * 0.75, lowpassBiasM: 60, layers: [layer('ground_dirt', 1)] };
    case 'he': {
      if (base < 0.0015) return null;
      const caliber = cue.caliberMm || 122;
      const size = caliber >= 120 ? 'large' : caliber >= 85 ? 'medium' : 'small';
      const layers = [layer(`expl_he_${size}`, 1, Math.max(0.85, Math.min(1.12, 0.94 + (122 - caliber) / 400)) * jitter())];
      if (size === 'large') layers.push(layer('blast_sub', 0.8, 0.97));
      return { gain: base * 0.85, lowpassBiasM: 120, layers };
    }
    case 'tank': {
      const gain = Math.pow(Math.min(1, 26 / d), 1.6);
      if (gain < 0.002) return null;
      if (cue.cause === 'fire') {
        return { gain: gain * 0.95, lowpassBiasM: 0, layers: [layer('burnout_blast', 1), layer('debris_metal', 0.45, jitter(), 0.12 + random() * 0.08)] };
      }
      // an ammunition fire throws the turret: the blast lower and heavier, the turret landing after it
      const rack = cue.cause !== 'shot';
      const layers: FilmSoundLayer[] = [
        layer(rack ? 'tank_explode_ammo' : 'tank_explode', 1),
        layer('blast_sub', rack ? fromDb(2) : fromDb(1), rack ? 0.8 : 0.88),
        layer('debris_metal', rack ? 0.9 : 0.7, jitter(), 0.06 + random() * 0.09),
      ];
      if (rack) layers.push(layer('turret_land', 0.85, jitter(), 1.3 + random() * 0.3));
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
  /** The battlefield, for its gun echo (FILM_TAILS). */
  readonly mapId?: string | null;
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
    const voice = filmSoundVoice(cue, distance, random, FILM_TAILS[options.mapId ?? ''] ?? 'open');
    if (!voice) continue;
    const arrivalMs = cue.timelineMs + filmTravelDelayS(distance) * 1000;
    const at = ports.filmMsAt(arrivalMs) / 1000;
    if (!(at < options.durationS)) continue;
    const lateral = (dx * listener.rightX + dy * listener.rightY + dz * listener.rightZ) / distance;
    planned.push({ at: Math.max(0, at), rate: ports.speedAt(arrivalMs), pan: Math.max(-1, Math.min(1, lateral)) * 0.85,
      lowpassHz: distanceLowpassHz(distance + voice.lowpassBiasM), voice });
  }
  if (!planned.length) return null;
  const base = options.baseUrl ?? '/';
  const fileOf = (layer: FilmSoundLayer): string => `${base}audio/sfx/${FILM_SFX[layer.name]![0]}/${layer.name}_${layer.variant}.webm`;
  const files = new Set(planned.flatMap((entry) => entry.voice.layers.map(fileOf)));
  const buffers = new Map<string, AudioBuffer>();
  await Promise.all([...files].map(async (file) => {
    const response = await fetch(file);
    if (!response.ok) throw new Error(`Missing film sound ${file}`);
    buffers.set(file, await context.decodeAudioData(await response.arrayBuffer()));
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
      const buffer = buffers.get(fileOf(layer));
      if (!buffer) continue;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = layer.rate * entry.rate;
      const layerGain = context.createGain();
      layerGain.gain.value = layer.gain;
      source.connect(layerGain).connect(lowpass);
      const at = entry.at + layer.delayS / entry.rate;
      source.start(at);
      if (layer.maxDurS) {
        // cut short with a 40 ms fade, as the engine cuts the punch under a report
        const end = at + layer.maxDurS / (layer.rate * entry.rate);
        layerGain.gain.setValueAtTime(layer.gain, Math.max(at, end - 0.04));
        layerGain.gain.linearRampToValueAtTime(0, end);
        source.stop(end + 0.005);
      }
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
