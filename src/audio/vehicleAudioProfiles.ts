/**
 * Vehicle audio identity: which powertrain, running gear, turret drive,
 * loader and crew language a fleet row sounds like.
 *
 * Pure and boot-light: it reads only the plain spec fields every fleet row
 * already carries (id, nation, era, role, mass, power, gun) and never imports
 * the fleet builders. The families follow the real installations — an Abrams
 * whines because the AGT1500 is a gas turbine, a T-64 howls because the 5TDF
 * is a two-stroke opposed-piston diesel, an M60 hisses through the cooling
 * fans of its air-cooled AVDS-1790.
 */

export type EngineFamilyId =
  | 'turbine_agt'
  | 'turbine_gtd'
  | 'diesel_v12_soviet'
  | 'diesel_two_stroke'
  | 'diesel_v12_modern'
  | 'diesel_aircooled'
  | 'diesel_ifv'
  | 'gasoline_v12';

export const ENGINE_FAMILY_IDS: readonly EngineFamilyId[] = Object.freeze([
  'turbine_agt', 'turbine_gtd', 'diesel_v12_soviet', 'diesel_two_stroke',
  'diesel_v12_modern', 'diesel_aircooled', 'diesel_ifv', 'gasoline_v12',
]);

export type CrewLanguage =
  | 'en-US' | 'en-GB' | 'de' | 'ru' | 'uk' | 'zh' | 'fr'
  | 'sv' | 'ja' | 'ko' | 'it' | 'pl' | 'he';

export const CREW_LANGUAGES: readonly CrewLanguage[] = Object.freeze([
  'en-US', 'en-GB', 'de', 'ru', 'uk', 'zh', 'fr', 'sv', 'ja', 'ko', 'it', 'pl', 'he',
]);

export type TrackClass = 'light' | 'heavy';
export type TurretDrive = 'electric' | 'hydraulic';
export type LoaderKind = 'manual' | 'carousel' | 'bustle' | 'autocannon' | 'missile';
export type ShiftStyle = 'manual' | 'automatic' | 'none';

/** Powertrain behaviour the RPM model and the layer mixer read. */
export interface EngineFamilyProfile {
  readonly id: EngineFamilyId;
  /** Engine is a gas turbine: no gears, slow spool, whine follows N2. */
  readonly turbine: boolean;
  readonly idleRpm: number;
  readonly maxRpm: number;
  /** Forward gears simulated for audible shifts (0 = continuous). */
  readonly gears: number;
  readonly shift: ShiftStyle;
  /** Time constants for RPM rise and fall (seconds). */
  readonly spoolUpS: number;
  readonly spoolDownS: number;
  /** Procedural overlays mixed on top of the sampled bank. */
  readonly whine: number;
  readonly fan: number;
}

export const ENGINE_FAMILIES: Readonly<Record<EngineFamilyId, EngineFamilyProfile>> = Object.freeze({
  turbine_agt: Object.freeze({ id: 'turbine_agt', turbine: true, idleRpm: 0.35, maxRpm: 1, gears: 0, shift: 'none', spoolUpS: 1.25, spoolDownS: 2.4, whine: 0.9, fan: 0 }),
  turbine_gtd: Object.freeze({ id: 'turbine_gtd', turbine: true, idleRpm: 0.32, maxRpm: 1, gears: 0, shift: 'none', spoolUpS: 1.6, spoolDownS: 2.8, whine: 0.75, fan: 0 }),
  diesel_v12_soviet: Object.freeze({ id: 'diesel_v12_soviet', turbine: false, idleRpm: 0.3, maxRpm: 1, gears: 6, shift: 'manual', spoolUpS: 0.32, spoolDownS: 0.55, whine: 0.1, fan: 0.12 }),
  diesel_two_stroke: Object.freeze({ id: 'diesel_two_stroke', turbine: false, idleRpm: 0.34, maxRpm: 1, gears: 6, shift: 'manual', spoolUpS: 0.26, spoolDownS: 0.42, whine: 0.18, fan: 0.1 }),
  diesel_v12_modern: Object.freeze({ id: 'diesel_v12_modern', turbine: false, idleRpm: 0.28, maxRpm: 1, gears: 4, shift: 'automatic', spoolUpS: 0.36, spoolDownS: 0.6, whine: 0.22, fan: 0.16 }),
  diesel_aircooled: Object.freeze({ id: 'diesel_aircooled', turbine: false, idleRpm: 0.3, maxRpm: 1, gears: 2, shift: 'automatic', spoolUpS: 0.4, spoolDownS: 0.7, whine: 0.12, fan: 0.55 }),
  diesel_ifv: Object.freeze({ id: 'diesel_ifv', turbine: false, idleRpm: 0.3, maxRpm: 1, gears: 5, shift: 'automatic', spoolUpS: 0.22, spoolDownS: 0.4, whine: 0.28, fan: 0.08 }),
  gasoline_v12: Object.freeze({ id: 'gasoline_v12', turbine: false, idleRpm: 0.26, maxRpm: 1, gears: 5, shift: 'manual', spoolUpS: 0.28, spoolDownS: 0.5, whine: 0.08, fan: 0.1 }),
});

export interface VehicleAudioIdentity {
  readonly engine: EngineFamilyId;
  /** Playback-rate trim of the whole engine bank (heavier = lower). */
  readonly enginePitch: number;
  /** Extra procedural layers for installations the bank doesn't cover. */
  readonly turboWhistle: number;
  readonly turbineAux: number;
  readonly electricDrive: number;
  readonly tracks: TrackClass;
  readonly turretDrive: TurretDrive;
  readonly hydropneumatic: boolean;
  readonly loader: LoaderKind;
  readonly crew: CrewLanguage;
  /** 0 (light IFV) .. 1 (130 t superheavy): scales impacts, landings, rams. */
  readonly mass: number;
}

/** The plain spec fields this module reads; every fleet row satisfies it. */
export interface VehicleAudioSpecInput {
  readonly id?: unknown;
  readonly nation?: unknown;
  readonly era?: unknown;
  readonly role?: unknown;
  readonly weightTons?: unknown;
  readonly enginePowerHp?: unknown;
  readonly hydropneumaticAim?: unknown;
  readonly gun?: {
    readonly caliberMm?: unknown;
    readonly autoloader?: unknown;
    readonly soundProfile?: unknown;
    readonly reloadS?: unknown;
  } | null;
}

const NATION_LANGUAGE: Readonly<Record<string, CrewLanguage>> = Object.freeze({
  usa: 'en-US', 'united states': 'en-US', us: 'en-US',
  uk: 'en-GB', 'united kingdom': 'en-GB', britain: 'en-GB',
  germany: 'de', 'west germany': 'de',
  russia: 'ru', ussr: 'ru', 'ussr/russia': 'ru', 'soviet union': 'ru',
  ukraine: 'uk',
  china: 'zh', prc: 'zh',
  france: 'fr',
  sweden: 'sv',
  japan: 'ja',
  'south korea': 'ko', korea: 'ko',
  italy: 'it',
  poland: 'pl',
  israel: 'he',
});

/** The language a row's crew speaks: the nation that operates it. */
export function crewLanguageForNation(nation: unknown): CrewLanguage {
  const key = String(nation ?? '').trim().toLowerCase();
  return NATION_LANGUAGE[key] ?? 'en-US';
}

function idOf(spec: VehicleAudioSpecInput): string {
  return String(spec.id ?? '').toLowerCase();
}

function numberOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Powertrain family by installation. Patterns are anchored on the fleet's own
 * id vocabulary; anything unrecognised falls back on role, era and mass.
 */
export function resolveEngineFamily(spec: VehicleAudioSpecInput): EngineFamilyId {
  const id = idOf(spec);
  const role = String(spec.role ?? '').toLowerCase();
  const era = String(spec.era ?? '').toLowerCase();
  const mass = numberOr(spec.weightTons, 45);
  if (/^(ua_)?m1a\d|^m1a3/.test(id)) return 'turbine_agt';
  if (id === 'abramsx') return 'diesel_v12_modern';
  if (/t80|type96_80/.test(id)) return 'turbine_gtd';
  if (/strv103|t64|t84|oplot|chieftain|vickers|type74|type90|stb1|m551|aft10|sheridan/.test(id)) return 'diesel_two_stroke';
  if (/^m48|^m60|^m46|^m47|merkava[123]|sabra|mbt70/.test(id)) return 'diesel_aircooled';
  if (/centurion|e100/.test(id)) return 'gasoline_v12';
  if (/kv2/.test(id)) return 'diesel_v12_soviet';
  if (/namer|bmpt|tos1a/.test(id)) return /namer/.test(id) ? 'diesel_v12_modern' : 'diesel_v12_soviet';
  if (role === 'ifv' || role === 'light' || mass < 30) return 'diesel_ifv';
  if (/t72|t90|t62|t14|type59|ztz85|type96_72|pt91|jaguar|t72_rys|zubr/.test(id)) return 'diesel_v12_soviet';
  if (era === 'ww2') return 'gasoline_v12';
  return 'diesel_v12_modern';
}

function resolveLoader(spec: VehicleAudioSpecInput, engine: EngineFamilyId): LoaderKind {
  const gun = spec.gun || {};
  const caliber = numberOr(gun.caliberMm, 100);
  const profile = String(gun.soundProfile ?? '');
  if (/launch/.test(profile) && numberOr(gun.reloadS, 5) > 4) return 'missile';
  if (caliber < 61) return 'autocannon';
  if (gun.autoloader) return 'bustle';
  const id = idOf(spec);
  // Soviet-lineage 125 mm hulls feed from the carousel under the turret floor.
  if (caliber >= 123 && caliber <= 127 && (engine === 'diesel_v12_soviet' || engine === 'turbine_gtd'
      || engine === 'diesel_two_stroke' || /t14|type99|ztz99|vt4|type96|type100/.test(id))) return 'carousel';
  if (/leclerc|amx56|type90|type10|k2|pl01|carro45t/.test(id)) return 'bustle';
  return 'manual';
}

/** Mass in [0, 1] from 12 t (light IFV) to 130 t (superheavy). */
export function massClass(weightTons: unknown): number {
  const t = numberOr(weightTons, 45);
  return Math.max(0, Math.min(1, (t - 12) / 118));
}

export function resolveVehicleAudioIdentity(spec: VehicleAudioSpecInput | null | undefined): VehicleAudioIdentity {
  const safe: VehicleAudioSpecInput = spec || {};
  const id = idOf(safe);
  const engine = resolveEngineFamily(safe);
  const tons = numberOr(safe.weightTons, 45);
  const power = numberOr(safe.enginePowerHp, 900);
  // Heavier hulls run slightly lower; high specific power slightly higher.
  const specificPower = power / Math.max(10, tons);
  const enginePitch = Math.max(0.86, Math.min(1.14, 1 + (specificPower - 22) * 0.006 - (tons - 50) * 0.0018));
  const soviet = engine === 'diesel_v12_soviet' || engine === 'turbine_gtd' || engine === 'diesel_two_stroke';
  const legacy = String(safe.era ?? '').toLowerCase() === 'cold-war' || String(safe.era ?? '').toLowerCase() === 'ww2';
  return Object.freeze({
    engine,
    enginePitch,
    turboWhistle: /leclerc|amx56/.test(id) ? 0.8 : engine === 'diesel_v12_modern' ? 0.18 : 0,
    turbineAux: /strv103/.test(id) ? 0.55 : 0,
    electricDrive: id === 'abramsx' ? 0.85 : /m1a3|kf51|pl01/.test(id) ? 0.25 : 0,
    tracks: tons < 33 ? 'light' : 'heavy',
    turretDrive: soviet || (legacy && !/m1a|leo2/.test(id)) ? 'hydraulic' : 'electric',
    hydropneumatic: !!safe.hydropneumaticAim || /k2|type10|type90|type74|strv103/.test(id),
    loader: resolveLoader(safe, engine),
    crew: crewLanguageForNation(safe.nation),
    mass: massClass(tons),
  });
}
