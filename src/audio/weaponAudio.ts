/**
 * Weapon audio classes: which report bank, mechanical action and reload
 * choreography a gun uses. Pure data and policy, no WebAudio.
 *
 * The class comes from the bore (a 57 mm round is not a 30 mm round, whatever
 * report id an older row carries); the per-weapon report id only trims rate,
 * level and the twin-barrel stagger. Guided launchers are their own class.
 */

import type { LoaderKind } from './vehicleAudioProfiles.ts';

export type WeaponClassId =
  | 'mg_rifle' | 'mg_heavy'
  | 'ac_20' | 'ac_25' | 'ac_30' | 'ac_40' | 'ac_50'
  | 'gun_90' | 'gun_105' | 'gun_120' | 'gun_125' | 'gun_130' | 'gun_152'
  | 'atgm' | 'rocket_heavy'
  | 'gunship_30' | 'gunship_howitzer' | 'gunship_missile';

type WeaponFamily = 'mg' | 'autocannon' | 'cannon' | 'launcher';

interface WeaponClassProfile {
  readonly id: WeaponClassId;
  readonly family: WeaponFamily;
  /** Reference loudness of the report at 1 m (dB, engine-internal scale). */
  readonly loudDb: number;
  /** Close (exterior) report fades out between these ranges (m)… */
  readonly closeFadeM: readonly [number, number];
  /** …while the distant report fades in across these. */
  readonly farFadeM: readonly [number, number];
  /** Playback-rate pitch applied to the shared outdoor tail. */
  readonly tailRate: number;
  readonly tailGain: number;
  /** Mechanical action after the report: recoil latch / feed (s). */
  readonly actionDelayS: number;
}

const P = (value: WeaponClassProfile): WeaponClassProfile => Object.freeze(value);

export const WEAPON_CLASSES: Readonly<Record<WeaponClassId, WeaponClassProfile>> = Object.freeze({
  mg_rifle: P({ id: 'mg_rifle', family: 'mg', loudDb: 118, closeFadeM: [30, 140], farFadeM: [40, 160], tailRate: 1.45, tailGain: 0.12, actionDelayS: 0 }),
  mg_heavy: P({ id: 'mg_heavy', family: 'mg', loudDb: 124, closeFadeM: [40, 190], farFadeM: [50, 220], tailRate: 1.3, tailGain: 0.18, actionDelayS: 0 }),
  ac_20: P({ id: 'ac_20', family: 'autocannon', loudDb: 128, closeFadeM: [45, 210], farFadeM: [60, 260], tailRate: 1.22, tailGain: 0.3, actionDelayS: 0.03 }),
  ac_25: P({ id: 'ac_25', family: 'autocannon', loudDb: 130, closeFadeM: [50, 230], farFadeM: [65, 280], tailRate: 1.16, tailGain: 0.34, actionDelayS: 0.035 }),
  ac_30: P({ id: 'ac_30', family: 'autocannon', loudDb: 132, closeFadeM: [55, 250], farFadeM: [70, 300], tailRate: 1.1, tailGain: 0.38, actionDelayS: 0.04 }),
  ac_40: P({ id: 'ac_40', family: 'autocannon', loudDb: 135, closeFadeM: [60, 270], farFadeM: [80, 320], tailRate: 1.04, tailGain: 0.44, actionDelayS: 0.05 }),
  ac_50: P({ id: 'ac_50', family: 'autocannon', loudDb: 137, closeFadeM: [65, 290], farFadeM: [85, 340], tailRate: 0.98, tailGain: 0.5, actionDelayS: 0.06 }),
  gun_90: P({ id: 'gun_90', family: 'cannon', loudDb: 141, closeFadeM: [140, 330], farFadeM: [90, 360], tailRate: 0.96, tailGain: 0.62, actionDelayS: 0.14 }),
  gun_105: P({ id: 'gun_105', family: 'cannon', loudDb: 144, closeFadeM: [145, 360], farFadeM: [95, 400], tailRate: 0.93, tailGain: 0.72, actionDelayS: 0.15 }),
  gun_120: P({ id: 'gun_120', family: 'cannon', loudDb: 147, closeFadeM: [150, 390], farFadeM: [100, 440], tailRate: 0.9, tailGain: 0.82, actionDelayS: 0.16 }),
  gun_125: P({ id: 'gun_125', family: 'cannon', loudDb: 148, closeFadeM: [150, 400], farFadeM: [100, 450], tailRate: 0.88, tailGain: 0.86, actionDelayS: 0.16 }),
  gun_130: P({ id: 'gun_130', family: 'cannon', loudDb: 150, closeFadeM: [155, 420], farFadeM: [110, 480], tailRate: 0.85, tailGain: 0.92, actionDelayS: 0.18 }),
  gun_152: P({ id: 'gun_152', family: 'cannon', loudDb: 152, closeFadeM: [160, 450], farFadeM: [120, 520], tailRate: 0.8, tailGain: 1, actionDelayS: 0.2 }),
  atgm: P({ id: 'atgm', family: 'launcher', loudDb: 132, closeFadeM: [50, 220], farFadeM: [60, 280], tailRate: 1.1, tailGain: 0.3, actionDelayS: 0.05 }),
  rocket_heavy: P({ id: 'rocket_heavy', family: 'launcher', loudDb: 145, closeFadeM: [80, 360], farFadeM: [100, 460], tailRate: 0.9, tailGain: 0.85, actionDelayS: 0.05 }),
  // The AC-130's guns: their crew hears them inside the cabin, the ground hears them from the sky (orbit ≈ 250 m).
  gunship_30: P({ id: 'gunship_30', family: 'autocannon', loudDb: 134, closeFadeM: [40, 160], farFadeM: [60, 220], tailRate: 1.1, tailGain: 0.38, actionDelayS: 0.04 }),
  gunship_howitzer: P({ id: 'gunship_howitzer', family: 'cannon', loudDb: 150, closeFadeM: [60, 200], farFadeM: [80, 240], tailRate: 0.85, tailGain: 0.9, actionDelayS: 0.2 }),
  gunship_missile: P({ id: 'gunship_missile', family: 'launcher', loudDb: 136, closeFadeM: [50, 220], farFadeM: [60, 280], tailRate: 1.1, tailGain: 0.3, actionDelayS: 0.05 }),
});

/** Per-weapon trims keyed by the fleet's existing `soundProfile` ids. */
interface WeaponReportTrim {
  readonly rate: number;
  readonly gainDb: number;
  readonly twin?: boolean;
  readonly launcher?: boolean;
  /** A weapon with its own report class rather than its bore's. */
  readonly cls?: WeaponClassId;
}

const REPORT_TRIMS: Readonly<Record<string, WeaponReportTrim>> = Object.freeze({
  'heavy-machine-gun': { rate: 1, gainDb: 0 },
  'm2-roof': { rate: 1, gainDb: -1 },
  rh202: { rate: 1.06, gainDb: -0.5 },
  'm242-bushmaster': { rate: 1, gainDb: 0 },
  '2a42': { rate: 1.03, gainDb: 0.5 },
  '2a72': { rate: 1.01, gainDb: 0 },
  'twin-2a42': { rate: 1.03, gainDb: 1, twin: true },
  'mk30-2': { rate: 0.97, gainDb: 0.5 },
  'rarden-l21a1': { rate: 0.94, gainDb: 0.5 },
  'kde-35': { rate: 1.05, gainDb: 0 },
  'bofors-40': { rate: 0.96, gainDb: 0.5 },
  'xm913-50': { rate: 1, gainDb: 0.5 },
  // BMP-3's 2A70 is a low-pressure 100 mm gun-launcher: a softer, shorter boom.
  'bmp3-100mm': { rate: 1.12, gainDb: -3 },
  'tow-launch': { rate: 0.96, gainDb: 0, launcher: true },
  'konkurs-launch': { rate: 0.92, gainDb: 0.5, launcher: true },
  'spike-launch': { rate: 1.06, gainDb: -0.5, launcher: true },
  'jyu-mat-launch': { rate: 1, gainDb: 0, launcher: true },
  'milan-launch': { rate: 0.9, gainDb: 0, launcher: true },
  'arkan-launch': { rate: 1.03, gainDb: 0, launcher: true },
  'ataka-launch': { rate: 0.97, gainDb: 0.5, launcher: true, twin: true },
  'shillelagh-launch': { rate: 0.88, gainDb: 0.5, launcher: true },
  'gunship-autocannon': { rate: 1, gainDb: 0, cls: 'gunship_30' },
  'gunship-howitzer': { rate: 1, gainDb: 0, cls: 'gunship_howitzer' },
  'gunship-missile': { rate: 1, gainDb: 0, cls: 'gunship_missile' },
});

export function weaponClassForCaliber(caliberMm: number): WeaponClassId {
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

interface ResolvedWeaponReport {
  readonly cls: WeaponClassProfile;
  readonly rate: number;
  readonly gainDb: number;
  readonly twin: boolean;
}

/** One report for one shot: bore class, then the weapon's own trims. */
export function resolveWeaponReport(caliberMm: number, soundProfile: string | null | undefined): ResolvedWeaponReport {
  const trim = soundProfile ? REPORT_TRIMS[soundProfile] : undefined;
  const id = trim?.cls ?? (trim?.launcher ? (caliberMm >= 200 ? 'rocket_heavy' : 'atgm') : weaponClassForCaliber(caliberMm));
  return {
    cls: WEAPON_CLASSES[id],
    rate: trim?.rate ?? 1,
    gainDb: trim?.gainDb ?? 0,
    twin: !!trim?.twin,
  };
}

// ---------------------------------------------------------------- reloads ---

export type ReloadCueType =
  | 'caseEject' | 'breechOpen' | 'ammoDoorOpen' | 'shellGrab' | 'ammoDoorClose' | 'ram' | 'chargeRam' | 'breechClose'
  | 'carouselTurn' | 'cassetteLift' | 'chainRam' | 'stubEject'
  | 'bustleIndex' | 'clipIndex' | 'drumRotate' | 'drumLoad' | 'feedClank' | 'magazineSwap'
  | 'tubeLoad' | 'launcherRaise' | 'latch'
  | 'gunshipLoad';

interface ReloadCue {
  readonly at: number;
  readonly type: ReloadCueType;
}

export interface ReloadCuePlan {
  readonly profile: 'rapid' | 'magazine' | 'intraClip' | LoaderKind;
  readonly ready: boolean;
  readonly cues: readonly ReloadCue[];
}

const RAPID: ReloadCuePlan = Object.freeze({ profile: 'rapid', ready: false, cues: Object.freeze([]) });

function plan(profile: ReloadCuePlan['profile'], cues: ReloadCue[]): ReloadCuePlan {
  return Object.freeze({ profile, ready: true, cues: Object.freeze(cues) });
}

/**
 * The mechanical choreography of one authoritative reload cycle, as fractions
 * of its duration. Cues hold their absolute timing near the ends of the cycle
 * (a breech always closes ~0.2 s before "Loaded!") however long the cycle is.
 */
export function resolveReloadCuePlan(
  totalS: number,
  kind: string,
  caliberMm: number,
  loader: LoaderKind = 'manual',
): ReloadCuePlan {
  const total = Math.max(0.05, Number(totalS) || 0.05);
  if (total < 0.55) return RAPID;
  const late = (seconds: number, floor: number): number => Math.max(floor, 1 - seconds / total);
  const early = (seconds: number, ceil: number): number => Math.min(ceil, seconds / total);
  if (kind === 'magazine') {
    // A drum refill: the drum turns to its first empty chamber, the loader feeds
    // the rounds in one by one, the drum indexes to the first and the breech closes.
    return plan('magazine', [
      { at: 0.03, type: 'drumRotate' },
      { at: 0.14, type: 'drumLoad' }, { at: 0.3, type: 'drumLoad' },
      { at: 0.46, type: 'drumLoad' }, { at: 0.62, type: 'drumLoad' },
      { at: late(0.5, 0.72), type: 'drumRotate' }, { at: late(0.22, 0.86), type: 'breechClose' },
    ]);
  }
  if (kind === 'intraClip') {
    return plan('intraClip', [
      { at: 0.08, type: 'clipIndex' }, { at: late(0.3, 0.6), type: 'ram' }, { at: late(0.12, 0.82), type: 'breechClose' },
    ]);
  }
  if (loader === 'autocannon') {
    return plan('autocannon', [
      { at: 0.03, type: 'magazineSwap' }, { at: 0.55, type: 'feedClank' }, { at: late(0.15, 0.85), type: 'latch' },
    ]);
  }
  if (loader === 'gunship') {
    // The AC-130's howitzer, loaded by hand in the cabin: the breech drops open (its spent case already thrown
    // onto the deck after the shot), a round is hefted and rammed home, and the breech closes on it.
    return plan('gunship', [
      { at: 0.03, type: 'breechOpen' }, { at: early(1, 0.4), type: 'gunshipLoad' }, { at: late(0.25, 0.85), type: 'breechClose' },
    ]);
  }
  if (loader === 'missile') {
    return plan('missile', [
      { at: 0.05, type: 'tubeLoad' }, { at: late(0.4, 0.7), type: 'tubeLoad' },
      { at: late(0.25, 0.8), type: 'launcherRaise' }, { at: late(0.12, 0.88), type: 'latch' },
    ]);
  }
  if (loader === 'carousel') {
    return plan('carousel', [
      { at: 0.015, type: 'stubEject' },
      { at: early(0.5, 0.2), type: 'carouselTurn' },
      { at: late(2.2, 0.42), type: 'cassetteLift' },
      { at: late(1.3, 0.6), type: 'chainRam' },
      { at: late(0.75, 0.75), type: 'chainRam' },
      { at: late(0.22, 0.88), type: 'breechClose' },
    ]);
  }
  if (loader === 'bustle') {
    return plan('bustle', [
      { at: 0.015, type: 'caseEject' },
      { at: early(0.6, 0.3), type: 'bustleIndex' },
      { at: late(0.9, 0.65), type: 'ram' },
      { at: late(0.22, 0.86), type: 'breechClose' },
    ]);
  }
  const caliber = Math.max(12, Number(caliberMm) || 100);
  // The loader's cycle: the breech drops open, the case is thrown out, the
  // ready-rack door slides open, a round comes out, the door shuts, the round is
  // rammed home and the breech closes on it.
  const cues: ReloadCue[] = [
    { at: 0.015, type: 'breechOpen' },
    { at: early(0.45, 0.15), type: 'caseEject' },
    { at: 0.24, type: 'ammoDoorOpen' },
    { at: 0.38, type: 'shellGrab' },
    { at: 0.5, type: 'ammoDoorClose' },
    { at: late(0.85, 0.66), type: 'ram' },
  ];
  // Separate-loading heavy rounds: a second ram for the propellant charge.
  if (caliber >= 146) cues.push({ at: late(0.55, 0.78), type: 'chargeRam' });
  cues.push({ at: late(0.22, 0.86), type: 'breechClose' });
  return plan('manual', cues);
}
