/**
 * Mix policy: bus levels, the settings channel each bus answers to, mix
 * snapshots (scope interior, pause, kill-cam, concussion, spectating), the
 * HDR loudness window, voice ducking, voice/vehicle budgets per device tier
 * and the procedural reverb presets. Pure data; the mixer applies it.
 */

import type { BusId } from './soundCues.ts';

/** Settings channels exposed by the SOUND tab (cot.settings.v1). */
export type SettingsChannel = 'engine' | 'combat' | 'ambience' | 'ui' | 'voice';

export const BUS_CHANNEL: Readonly<Record<BusId, SettingsChannel>> = Object.freeze({
  weapons: 'combat',
  impacts: 'combat',
  environment: 'combat',
  cinematic: 'combat',
  vehicles: 'engine',
  own: 'engine',
  // The occupied hull's own gun, its interior report and hits on it are gunfire, not engine noise.
  ownCombat: 'combat',
  interior: 'engine',
  ambience: 'ambience',
  ui: 'ui',
  music: 'ui',
  voice: 'voice',
  alarm: 'voice',
});

/**
 * Nominal linear bus levels before settings and snapshots. Gunfire and
 * impacts lead the mix; the constant layers (engines, ambience, radio, the
 * interface) sit under them so a cannon is never masked by an idling engine.
 */
export const BUS_LEVELS: Readonly<Record<BusId, number>> = Object.freeze({
  // Measured on the master by tools/audio-mix-balance.mjs: gunfire must stand
  // well clear of the idle battle bed (our engine, the ambience, idling tanks),
  // and the radio under a near cannon. Gun reports are cracks now (2026-10-02),
  // their energy in tens of milliseconds, so the gun bus runs hotter and the
  // master's limiter takes the crack's peak.
  weapons: 1.3,
  impacts: 1.3,
  environment: 0.85,
  cinematic: 1,
  vehicles: 0.31,
  // Our own tank leads: its engine and running gear, its gun, and the loading
  // and turret machinery inside it sit above everyone else's.
  own: 0.36,
  ownCombat: 1.3,
  interior: 0.95,
  ambience: 0.18,
  ui: 0.6,
  music: 0.6,
  voice: 0.09,
  alarm: 0.55,
});

/** Buses whose level the HDR window rides (world sound, not the hull or the HUD). */
export const HDR_BUSES: readonly BusId[] = Object.freeze(['weapons', 'impacts', 'environment', 'vehicles']);

/**
 * DICE-style HDR window on logical loudness. The loudest recent event sets
 * the window top (instant attack, steady release). A new voice is trimmed by
 * how far it falls below the top beyond the knee, so small sounds give way
 * to a cannon while the cannon itself plays at full level; anything below
 * `top − windowDb` is not started.
 */
export const HDR = Object.freeze({
  floorDb: 100,
  windowDb: 50,
  kneeDb: 18,
  slope: 0.5,
  maxTrimDb: 12,
  releaseDbPerS: 12,
  /** Priority at or above which a cue is never culled by the window. */
  protectPriority: 88,
});

/**
 * The listener's own hits. A crew watches its own round land, so the impact at
 * the target (still delayed by the speed of sound, darkened by the air and
 * coming from the target's bearing) follows a gentler law: three times the
 * cue's reference distance, rolloff at most 0.55, carried to at least 2.6 km
 * and never culled by the HDR window. It replaces an interface hit marker.
 */
export const OWN_HIT_FOCUS = Object.freeze({ refScale: 3, maxRolloff: 0.55, minRangeM: 2600, priority: 90 });

/** Crew speech ducks the beds so it stays intelligible; gunfire barely moves. */
export const VOICE_DUCK = Object.freeze({ ambienceDb: -6, worldDb: -1, attackS: 0.04, releaseS: 0.45 });

export interface MixSnapshot {
  /** World (HDR buses) lowpass and level. */
  readonly worldHz: number;
  readonly worldDb: number;
  /** Own hull (engine, tracks heard from inside) lowpass and level. */
  readonly ownHz: number;
  readonly ownDb: number;
  readonly interiorDb: number;
  readonly ambienceDb: number;
  readonly reverbDb: number;
  /** Interior hum/rattle bed level (−inf = off). */
  readonly cabinDb: number;
}

const S = (value: MixSnapshot): MixSnapshot => Object.freeze(value);

export const SNAPSHOTS = Object.freeze({
  battle: S({ worldHz: 20000, worldDb: 0, ownHz: 20000, ownDb: 0, interiorDb: 0, ambienceDb: 0, reverbDb: 0, cabinDb: -120 }),
  // Gunner's sight: inside the turret. The world is muffled through armour,
  // the hull's own machinery and the crew compartment come forward.
  scoped: S({ worldHz: 1700, worldDb: -4, ownHz: 900, ownDb: 1.5, interiorDb: 3, ambienceDb: -10, reverbDb: -8, cabinDb: -4 }),
  paused: S({ worldHz: 900, worldDb: -28, ownHz: 900, ownDb: -28, interiorDb: -28, ambienceDb: -14, reverbDb: -20, cabinDb: -120 }),
  killcam: S({ worldHz: 9000, worldDb: -9, ownHz: 9000, ownDb: -9, interiorDb: -12, ambienceDb: -6, reverbDb: 0, cabinDb: -120 }),
  // A close blast: deafened, then hearing returns over the recovery time.
  concussion: S({ worldHz: 650, worldDb: -12, ownHz: 650, ownDb: -10, interiorDb: -8, ambienceDb: -14, reverbDb: -6, cabinDb: -120 }),
  spectating: S({ worldHz: 20000, worldDb: -1, ownHz: 20000, ownDb: -2, interiorDb: -6, ambienceDb: 0, reverbDb: 0, cabinDb: -120 }),
  garage: S({ worldHz: 20000, worldDb: 0, ownHz: 20000, ownDb: 0, interiorDb: 0, ambienceDb: 0, reverbDb: -2, cabinDb: -120 }),
});

export type SnapshotId = keyof typeof SNAPSHOTS;

/**
 * Concussion: recovery (s), re-trigger cooldown (s), and the blast radius (m)
 * around the occupied hull per 100 mm of HE (scaled by bore, capped).
 * Explicit triggers only — the engine's own gun never concusses its crew.
 */
export const CONCUSSION = Object.freeze({ recoverS: 4.5, cooldownS: 6, radiusPer100mmM: 9, maxRadiusM: 16 });

export type DeviceTier = 'desktop' | 'mobile';

export const BUDGETS = Object.freeze({
  // maxDecodedMb is a soft cap above the pinned battle set (desktop ~120–140 MB,
  // mobile ~65–80 MB at 24 kHz with one variant per asset).
  desktop: Object.freeze({ voices: 32, nearVehicles: 5, farVehicles: 8, reverb: true, maxDecodedMb: 200, maxVariants: 4 }),
  mobile: Object.freeze({ voices: 16, nearVehicles: 3, farVehicles: 4, reverb: false, maxDecodedMb: 96, maxVariants: 1 }),
});

/** Vehicle rig level of detail by distance (m), with hysteresis. */
export const VEHICLE_LOD = Object.freeze({ nearInM: 140, nearOutM: 165, farInM: 900, farOutM: 1000 });

export type ReverbId = 'open' | 'forest' | 'urban' | 'mountain' | 'canyon' | 'desert' | 'snow' | 'hangar' | 'mars' | 'none';

interface ReverbPreset {
  readonly decayS: number;
  readonly preDelayS: number;
  /** Lowpass the tail closes towards (Hz) — high frequencies die first outdoors. */
  readonly dampHz: number;
  /** Discrete echoes [delay s, gain] — terrain and façade reflections. */
  readonly taps: readonly (readonly [number, number])[];
  /** Wet return level. */
  readonly wet: number;
}

const R = (value: ReverbPreset): ReverbPreset => Object.freeze(value);

export const REVERB_PRESETS: Readonly<Record<ReverbId, ReverbPreset>> = Object.freeze({
  open: R({ decayS: 0.9, preDelayS: 0.03, dampHz: 3200, taps: [[0.18, 0.18], [0.41, 0.1]], wet: 0.32 }),
  forest: R({ decayS: 1.25, preDelayS: 0.015, dampHz: 2400, taps: [[0.06, 0.22], [0.11, 0.16], [0.17, 0.1]], wet: 0.42 }),
  urban: R({ decayS: 1.9, preDelayS: 0.02, dampHz: 4200, taps: [[0.045, 0.34], [0.09, 0.26], [0.16, 0.2], [0.27, 0.12]], wet: 0.5 }),
  mountain: R({ decayS: 2.6, preDelayS: 0.05, dampHz: 2800, taps: [[0.62, 0.3], [1.15, 0.18], [1.9, 0.1]], wet: 0.45 }),
  canyon: R({ decayS: 2.2, preDelayS: 0.04, dampHz: 3600, taps: [[0.34, 0.32], [0.7, 0.2], [1.2, 0.12]], wet: 0.48 }),
  desert: R({ decayS: 0.7, preDelayS: 0.04, dampHz: 3600, taps: [[0.5, 0.12]], wet: 0.22 }),
  snow: R({ decayS: 0.8, preDelayS: 0.02, dampHz: 2000, taps: [[0.3, 0.08]], wet: 0.2 }),
  hangar: R({ decayS: 1.8, preDelayS: 0.012, dampHz: 5200, taps: [[0.035, 0.3], [0.07, 0.2]], wet: 0.55 }),
  mars: R({ decayS: 0.5, preDelayS: 0.05, dampHz: 900, taps: [], wet: 0.18 }),
  none: R({ decayS: 0.05, preDelayS: 0, dampHz: 400, taps: [], wet: 0 }),
});
