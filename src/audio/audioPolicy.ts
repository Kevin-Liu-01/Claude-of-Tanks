/**
 * Pure audio catalogs and timing policy.
 *
 * This module contains no DOM or WebAudio access. It is safe to import from
 * tests, tools, and boot-time policy code without acquiring the lazy mixer.
 */

export const SFX_FILES: Record<string, string> = {};
for (const cls of ['small', 'medium', 'large', 'huge']) {
  for (const layer of ['sub', 'crack', 'tail']) {
    SFX_FILES[`fire_${cls}_${layer}`] = `fire_${cls}_${layer}.ogg`;
  }
}
for (const name of [
  'impact_pen_a', 'impact_pen_b', 'hit_whump',
  'ricochet_a', 'ricochet_b', 'ricochet_c',
  'impact_absorb_a', 'impact_absorb_b',
  'expl_tank_core_a', 'expl_tank_core_b', 'expl_tank_debris',
  'expl_turret_pop', 'expl_burnout',
  'expl_he_a', 'expl_he_b', 'impact_dirt', 'era_pop',
]) SFX_FILES[name] = `${name}.ogg`;

export function mulberry32(seed: number): () => number {
  return function random(): number {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

/** Web Audio rejects negative/past automation times, including at startup. */
export function safeAudioStart(now: unknown, scheduled: unknown, leadS = 0.001): number {
  return Math.max(0, Number(now) + leadS, Number(scheduled));
}

export const MAX_VOICES = 24;
export const SPEED_OF_SOUND_MPS = 340;

// The battlefield must retain an audible horizon. Distance still lowers and
// darkens sources aggressively, but it must not hard-mute a tank just beyond
// brawling range.
export const AUDIO_DISTANCE_MODEL = Object.freeze({
  referenceM: 22,
  rolloff: 1.5,
  engineHearInM: 900,
  engineHearOutM: 1000,
  maxEngineVoices: 10,
  activeEngineBiasM: 24,
});

export const AUDIO_PERSPECTIVE_MIX = Object.freeze({
  arcade: Object.freeze({
    engineGain: 1,
    engineCutoffHz: 18000,
    enginePanScale: 1,
    cannonGain: 1,
    cannonDistanceBiasM: 0,
  }),
  // Scope is an interior/headset perspective, never a volume mute.
  sniper: Object.freeze({
    engineGain: 1.18,
    engineCutoffHz: 650,
    enginePanScale: 0.15,
    cannonGain: 0.98,
    cannonDistanceBiasM: 220,
  }),
});

export const AUDIO_MIX_PROFILE = Object.freeze({
  compressorThresholdDb: -8,
  compressorRatio: 3,
  compressorAttackS: 0.012,
  compressorReleaseS: 0.18,
  limiterKnee: 0.78,
  combatBodyHz: 360,
  combatBodyGainDb: 1.5,
  combatPresenceHz: 2700,
  combatPresenceGainDb: -2.4,
  combatCeilingHz: 14500,
});

export interface EngineSoundProfile {
  kind: string;
  baseHz: number;
  toneCutoffHz: number;
  pulseGain: number;
  subGain: number;
  intakeHz: number;
  intakeGain: number;
  wobbleDepthHz: number;
  trackHz: number;
  trackQ: number;
  trackGain: number;
  clatterHz: number;
  clatterGain: number;
  whineGain: number;
}

export const ENGINE_SOUND_PROFILES: Readonly<Record<string, Readonly<EngineSoundProfile>>> = Object.freeze({
  legacyDiesel: Object.freeze({
    kind: 'legacyDiesel', baseHz: 38, toneCutoffHz: 620,
    pulseGain: 0.10, subGain: 0.13, intakeHz: 155, intakeGain: 0.17,
    wobbleDepthHz: 2.8, trackHz: 470, trackQ: 0.72, trackGain: 0.13,
    clatterHz: 350, clatterGain: 0.18, whineGain: 0,
  }),
  modernDiesel: Object.freeze({
    kind: 'modernDiesel', baseHz: 46, toneCutoffHz: 780,
    pulseGain: 0.085, subGain: 0.12, intakeHz: 230, intakeGain: 0.19,
    wobbleDepthHz: 1.5, trackHz: 540, trackQ: 0.72, trackGain: 0.11,
    clatterHz: 410, clatterGain: 0.15, whineGain: 0,
  }),
  lightDiesel: Object.freeze({
    kind: 'lightDiesel', baseHz: 54, toneCutoffHz: 920,
    pulseGain: 0.075, subGain: 0.09, intakeHz: 290, intakeGain: 0.21,
    wobbleDepthHz: 1.2, trackHz: 620, trackQ: 0.78, trackGain: 0.09,
    clatterHz: 480, clatterGain: 0.13, whineGain: 0,
  }),
  turbine: Object.freeze({
    kind: 'turbine', baseHz: 62, toneCutoffHz: 1080,
    pulseGain: 0.035, subGain: 0.09, intakeHz: 420, intakeGain: 0.25,
    wobbleDepthHz: 0.35, trackHz: 520, trackQ: 0.74, trackGain: 0.10,
    clatterHz: 400, clatterGain: 0.14, whineGain: 0.065,
  }),
});

interface VehicleAudioSpec {
  role?: unknown;
  weightTons?: unknown;
  era?: unknown;
}

/** Resolve an audible powertrain family without adding fields to simulation. */
export function resolveEngineSoundProfile(
  specId: unknown,
  spec: VehicleAudioSpec | null = null,
): Readonly<EngineSoundProfile> {
  const id = String(specId || '').toLowerCase();
  if (/(^|_)(m1a\d?|abrams|t80|strv103)/.test(id) || /^(m1a|abrams|t80|strv103)/.test(id)) {
    return ENGINE_SOUND_PROFILES.turbine;
  }
  const role = String(spec?.role || '').toLowerCase();
  const mass = Number(spec?.weightTons);
  if (role === 'light' || role === 'ifv' || role === 'spaa' || (Number.isFinite(mass) && mass < 28)) {
    return ENGINE_SOUND_PROFILES.lightDiesel;
  }
  const era = String(spec?.era || '').toLowerCase();
  if (era === 'modern' || era === 'coldwar') return ENGINE_SOUND_PROFILES.modernDiesel;
  return ENGINE_SOUND_PROFILES.legacyDiesel;
}

export function worldDistanceGain(distanceM: unknown): number {
  const distance = Math.max(0.5, Number(distanceM) || 0.5);
  const gain = Math.min(AUDIO_DISTANCE_MODEL.referenceM / distance, 1);
  return Math.pow(gain, AUDIO_DISTANCE_MODEL.rolloff);
}

export function distanceLowpassHz(distanceM: unknown): number {
  const distance = Math.max(0, Number(distanceM) || 0);
  return Math.max(450, Math.min(18000, 18000 * (40 / (40 + distance))));
}

export function engineAudibleAtDistance(distanceM: unknown, alreadyActive = false): boolean {
  if (typeof distanceM !== 'number' || !Number.isFinite(distanceM)) return false;
  const limit = alreadyActive
    ? AUDIO_DISTANCE_MODEL.engineHearOutM
    : AUDIO_DISTANCE_MODEL.engineHearInM;
  return distanceM <= limit;
}

export const MAX_ENGINE_VOICES = AUDIO_DISTANCE_MODEL.maxEngineVoices;
export const MIN_WHIZZ_SPEED_MPS = 300;
export const WHIZZ_MAX_MISS_M = 15;
export const LANDING_VY_MPS = 2.8;
export const TRAVERSE_RATE_FULL = 0.45;
export const HEARTBEAT_HP_FRAC = 0.25;
export const HEARTBEAT_WINDOW_S = 6;

export const WHIZZ_VEL_MPS: Readonly<Record<string, number>> = Object.freeze({
  AP: 800,
  APCR: 1080,
  HEAT: 1000,
  HE: 790,
  APFSDS: 1700,
});

export interface WeaponReportProfile {
  kind: string;
  rate: number;
  gain: number;
  crackGain: number;
  tailGain: number;
  mechanicalHz: number;
  mechanicalGain: number;
  toneHz: number;
  hissGain: number;
  durationS: number;
  twin: boolean;
}

export const DEFAULT_WEAPON_REPORT: Readonly<WeaponReportProfile> = Object.freeze({
  kind: 'cannon', rate: 1, gain: 1, crackGain: 1, tailGain: 1,
  mechanicalHz: 0, mechanicalGain: 0, toneHz: 0, hissGain: 0,
  durationS: 0, twin: false,
});

export const WEAPON_REPORT_PROFILES: Readonly<Record<string, Readonly<WeaponReportProfile>>> = Object.freeze({
  'm242-bushmaster': Object.freeze({ kind: 'autocannon', rate: 1.10, gain: 0.88, crackGain: 1.10, tailGain: 0.68, mechanicalHz: 1180, mechanicalGain: 0.22, toneHz: 0, hissGain: 0, durationS: 0.34, twin: false }),
  '2a42': Object.freeze({ kind: 'autocannon', rate: 0.97, gain: 0.96, crackGain: 1.02, tailGain: 0.78, mechanicalHz: 820, mechanicalGain: 0.25, toneHz: 0, hissGain: 0, durationS: 0.40, twin: false }),
  'mk30-2': Object.freeze({ kind: 'autocannon', rate: 0.92, gain: 1.03, crackGain: 1.08, tailGain: 0.86, mechanicalHz: 690, mechanicalGain: 0.22, toneHz: 0, hissGain: 0, durationS: 0.43, twin: false }),
  'kde-35': Object.freeze({ kind: 'autocannon', rate: 0.86, gain: 1.10, crackGain: 1.04, tailGain: 0.94, mechanicalHz: 610, mechanicalGain: 0.20, toneHz: 0, hissGain: 0, durationS: 0.47, twin: false }),
  'bofors-40': Object.freeze({ kind: 'autocannon', rate: 0.82, gain: 1.14, crackGain: 1.03, tailGain: 0.98, mechanicalHz: 560, mechanicalGain: 0.22, toneHz: 0, hissGain: 0, durationS: 0.51, twin: false }),
  'xm913-50': Object.freeze({ kind: 'autocannon', rate: 0.76, gain: 1.20, crackGain: 1.06, tailGain: 1.04, mechanicalHz: 470, mechanicalGain: 0.24, toneHz: 0, hissGain: 0, durationS: 0.58, twin: false }),
  'rarden-l21a1': Object.freeze({ kind: 'autocannon', rate: 0.80, gain: 1.12, crackGain: 0.96, tailGain: 0.92, mechanicalHz: 520, mechanicalGain: 0.30, toneHz: 0, hissGain: 0, durationS: 0.54, twin: false }),
  '2a72': Object.freeze({ kind: 'autocannon', rate: 1.02, gain: 0.91, crackGain: 0.98, tailGain: 0.70, mechanicalHz: 910, mechanicalGain: 0.20, toneHz: 0, hissGain: 0, durationS: 0.37, twin: false }),
  'twin-2a42': Object.freeze({ kind: 'autocannon', rate: 0.94, gain: 1.06, crackGain: 1.06, tailGain: 0.82, mechanicalHz: 740, mechanicalGain: 0.32, toneHz: 0, hissGain: 0, durationS: 0.44, twin: true }),
  'rh202': Object.freeze({ kind: 'autocannon', rate: 1.18, gain: 0.76, crackGain: 1.14, tailGain: 0.56, mechanicalHz: 1360, mechanicalGain: 0.18, toneHz: 0, hissGain: 0, durationS: 0.30, twin: false }),
  'bmp3-100mm': Object.freeze({ kind: 'cannon', rate: 1.05, gain: 0.96, crackGain: 0.92, tailGain: 0.84, mechanicalHz: 360, mechanicalGain: 0.12, toneHz: 0, hissGain: 0, durationS: 0.62, twin: false }),
  'tow-launch': Object.freeze({ kind: 'launcher', rate: 0.92, gain: 0.92, crackGain: 0, tailGain: 0, mechanicalHz: 260, mechanicalGain: 0.12, toneHz: 118, hissGain: 0.82, durationS: 1.15, twin: false }),
  'konkurs-launch': Object.freeze({ kind: 'launcher', rate: 0.86, gain: 0.88, crackGain: 0, tailGain: 0, mechanicalHz: 230, mechanicalGain: 0.10, toneHz: 104, hissGain: 0.76, durationS: 1.28, twin: false }),
  'spike-launch': Object.freeze({ kind: 'launcher', rate: 1.08, gain: 0.78, crackGain: 0, tailGain: 0, mechanicalHz: 410, mechanicalGain: 0.16, toneHz: 154, hissGain: 0.68, durationS: 0.94, twin: false }),
  'jyu-mat-launch': Object.freeze({ kind: 'launcher', rate: 0.98, gain: 0.84, crackGain: 0, tailGain: 0, mechanicalHz: 330, mechanicalGain: 0.14, toneHz: 132, hissGain: 0.72, durationS: 1.04, twin: false }),
  'milan-launch': Object.freeze({ kind: 'launcher', rate: 0.82, gain: 0.86, crackGain: 0, tailGain: 0, mechanicalHz: 210, mechanicalGain: 0.11, toneHz: 96, hissGain: 0.74, durationS: 1.34, twin: false }),
  'arkan-launch': Object.freeze({ kind: 'launcher', rate: 1.02, gain: 0.90, crackGain: 0, tailGain: 0, mechanicalHz: 290, mechanicalGain: 0.13, toneHz: 142, hissGain: 0.78, durationS: 1.02, twin: false }),
  'ataka-launch': Object.freeze({ kind: 'launcher', rate: 0.95, gain: 0.98, crackGain: 0, tailGain: 0, mechanicalHz: 300, mechanicalGain: 0.18, toneHz: 126, hissGain: 0.88, durationS: 1.18, twin: true }),
});

export function resolveWeaponReportProfile(id: unknown): Readonly<WeaponReportProfile> {
  return WEAPON_REPORT_PROFILES[String(id || '')] || DEFAULT_WEAPON_REPORT;
}

export type ReloadCueType = 'motor' | 'index' | 'breechOpen' | 'extract'
  | 'shellLift' | 'ram' | 'breechClose';

export interface ReloadCue {
  at: number;
  type: ReloadCueType;
}

export interface ReloadCuePlan {
  profile: 'rapid' | 'magazine' | 'intraClip' | 'shell';
  ready: boolean;
  cues: ReloadCue[];
}

/** Build the mechanical cue sequence for one authoritative reload cycle. */
export function resolveReloadCuePlan(
  totalS: unknown,
  kind = 'shell',
  caliberMm: unknown = 100,
): ReloadCuePlan {
  const total = Math.max(0.05, Number(totalS) || 0.05);
  const caliber = Math.max(12, Number(caliberMm) || 100);
  if (total < 0.55) return { profile: 'rapid', ready: false, cues: [] };
  if (kind === 'magazine') {
    return { profile: 'magazine', ready: true, cues: [
      { at: 0.02, type: 'motor' }, { at: 0.22, type: 'index' },
      { at: 0.48, type: 'index' }, { at: 0.74, type: 'index' },
      { at: 0.92, type: 'breechClose' },
    ] };
  }
  if (kind === 'intraClip') {
    return { profile: 'intraClip', ready: true, cues: [
      { at: 0.10, type: 'motor' }, { at: 0.48, type: 'index' },
      { at: 0.86, type: 'breechClose' },
    ] };
  }
  const cues: ReloadCue[] = [
    { at: 0.015, type: 'breechOpen' },
    { at: Math.min(0.20, 0.72 / total), type: 'extract' },
    { at: 0.40, type: 'shellLift' },
  ];
  if (caliber >= 105 && total >= 4) cues.push({ at: 0.64, type: 'shellLift' });
  cues.push(
    { at: Math.max(0.72, 1 - 0.70 / total), type: 'ram' },
    { at: Math.max(0.86, 1 - 0.22 / total), type: 'breechClose' },
  );
  return { profile: 'shell', ready: true, cues };
}
