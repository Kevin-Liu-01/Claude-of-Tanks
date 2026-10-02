/**
 * Pure acoustics for the sound engine: level conversion, distance law, air
 * absorption, propagation delay, Doppler, crossfades and seeded variation.
 *
 * No DOM, no WebAudio. Everything here is deterministic and runs under node,
 * so the selftests pin the physical behaviour the mixer relies on.
 */

/** Seeded 0..1 generator. Presentation-only variation, never simulation. */
export function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return function random(): number {
    state = state + 0x6D2B79F5 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  return gain <= 1e-9 ? -180 : 20 * Math.log10(gain);
}

/**
 * The medium the battle is fought in. Mars has a thin CO2 atmosphere: sound
 * travels at ~240 m/s, arrives ~20 dB quieter and loses its upper octaves
 * within metres. The Moon has none, so only the occupied hull carries sound.
 */
export interface AtmosphereProfile {
  readonly id: 'earth' | 'mars' | 'vacuum';
  readonly speedOfSoundMps: number;
  /** Extra level loss applied to every airborne world sound. */
  readonly transmissionDb: number;
  /** Multiplier on the air-absorption distance scale (smaller = darker sooner). */
  readonly absorptionScale: number;
  /** Ceiling of the airborne band, before distance. */
  readonly ceilingHz: number;
}

export const ATMOSPHERES: Readonly<Record<AtmosphereProfile['id'], AtmosphereProfile>> = Object.freeze({
  earth: Object.freeze({ id: 'earth', speedOfSoundMps: 343, transmissionDb: 0, absorptionScale: 1, ceilingHz: 20000 }),
  mars: Object.freeze({ id: 'mars', speedOfSoundMps: 240, transmissionDb: -14, absorptionScale: 0.22, ceilingHz: 3200 }),
  vacuum: Object.freeze({ id: 'vacuum', speedOfSoundMps: 343, transmissionDb: -60, absorptionScale: 0.05, ceilingHz: 420 }),
});

export function atmosphereForMap(mapId: string | null | undefined): AtmosphereProfile {
  if (mapId === 'mars') return ATMOSPHERES.mars;
  if (mapId === 'moon') return ATMOSPHERES.vacuum;
  return ATMOSPHERES.earth;
}

/**
 * Inverse-distance attenuation (−6 dB per doubling past the reference
 * distance) scaled by a per-cue rolloff, plus excess ground/foliage loss that
 * grows slowly with range. Returns decibels (≤ 0).
 */
export function distanceAttenuationDb(distanceM: number, refM: number, rolloff = 1, excessDbPerKm = 6): number {
  const distance = Math.max(0.25, distanceM);
  const ref = Math.max(0.25, refM);
  if (distance <= ref) return 0;
  return -20 * rolloff * Math.log10(distance / ref) - excessDbPerKm * (distance - ref) / 1000;
}

/**
 * Lowpass cutoff modelling frequency-dependent air absorption (ISO 9613-1,
 * 20 °C / 50 % RH, folded into one curve): ~6.5 kHz at 100 m, ~2.9 kHz at
 * 300 m, ~1.1 kHz at 1 km. `absorb` scales a cue's sensitivity (cracks and
 * ricochets lose their top faster than a subsonic rumble).
 */
export function airAbsorptionCutoffHz(distanceM: number, atmosphere: AtmosphereProfile = ATMOSPHERES.earth, absorb = 1): number {
  const scale = 40 * atmosphere.absorptionScale / Math.max(0.05, absorb);
  const distance = Math.max(0, distanceM);
  const cutoff = atmosphere.ceilingHz * Math.pow(scale / (scale + distance), 0.9);
  return clamp(cutoff, 140, atmosphere.ceilingHz);
}

/** Seconds for a sound to reach the listener; the flash precedes the boom. */
export function propagationDelayS(distanceM: number, atmosphere: AtmosphereProfile = ATMOSPHERES.earth, maxS = 4): number {
  if (distanceM <= 18) return 0;
  return Math.min(maxS, distanceM / atmosphere.speedOfSoundMps);
}

/**
 * Doppler playback ratio for a source approaching at `radialMps` (positive =
 * closing). Clamped so a glitchy velocity can never warp a sample absurdly.
 */
export function dopplerRatio(radialMps: number, atmosphere: AtmosphereProfile = ATMOSPHERES.earth): number {
  const c = atmosphere.speedOfSoundMps;
  return clamp(c / Math.max(c * 0.25, c - radialMps), 0.7, 1.4);
}

/** Equal-power crossfade pair for t ∈ [0, 1]. */
export function equalPowerFade(t: number): [number, number] {
  const x = clamp(t, 0, 1) * Math.PI * 0.5;
  return [Math.cos(x), Math.sin(x)];
}

/**
 * Weight of one layer in an ordered band set (idle/low/mid/high loops): each
 * layer peaks at its centre and crossfades with its neighbours. The weights of
 * adjacent layers sum to unit power.
 */
export function bandWeight(position: number, centres: readonly number[], index: number): number {
  const last = centres.length - 1;
  const value = clamp(position, centres[0], centres[last]);
  const centre = centres[index];
  if (index > 0 && value < centre) {
    const lo = centres[index - 1];
    if (value <= lo) return 0;
    return equalPowerFade((value - lo) / (centre - lo))[1];
  }
  if (index < last && value > centre) {
    const hi = centres[index + 1];
    if (value >= hi) return 0;
    return equalPowerFade((value - centre) / (hi - centre))[0];
  }
  return 1;
}

/** Linear ramp of `value` between `a` (→0) and `b` (→1). */
export function rampBetween(value: number, a: number, b: number): number {
  if (a === b) return value >= b ? 1 : 0;
  return clamp((value - a) / (b - a), 0, 1);
}

/** Exponential smoothing factor for a time constant, independent of frame rate. */
export function smoothingAlpha(dtS: number, tauS: number): number {
  if (tauS <= 0) return 1;
  return 1 - Math.exp(-Math.max(0, dtS) / tauS);
}

/** Listener-relative bearing helpers in the game's XZ plane (forward = +Z at yaw 0). */
export interface ListenerFrame {
  x: number;
  y: number;
  z: number;
  /** Unit forward on XZ. */
  fx: number;
  fz: number;
}

export interface RelativePosition {
  /** Right of the listener, metres. */
  right: number;
  up: number;
  /** Ahead of the listener, metres. */
  ahead: number;
  distance: number;
}

/** Rotate a world point into the listener frame. Mutates and returns `out`. */
export function toListenerFrame(
  frame: ListenerFrame, x: number, y: number, z: number, out: RelativePosition,
): RelativePosition {
  const dx = x - frame.x;
  const dy = y - frame.y;
  const dz = z - frame.z;
  // Screen-right of a three.js view looking along (fx, 0, fz) is forward × up
  // = (−fz, 0, fx). (The hull's locked rightAxis in ARCHITECTURE §1.1 is a
  // simulation naming convention, not the side a viewer hears; the previous
  // engine used it and panned every sound in mirror image.)
  out.right = dz * frame.fx - dx * frame.fz;
  out.ahead = dx * frame.fx + dz * frame.fz;
  out.up = dy;
  out.distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return out;
}

/** Stereo pan in [-1, 1] from a listener-relative position (equal-power law upstream). */
export function panFromRelative(rel: RelativePosition, width = 0.9): number {
  if (rel.distance < 0.001) return 0;
  return clamp(rel.right / rel.distance, -1, 1) * width;
}
