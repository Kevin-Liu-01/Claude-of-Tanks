// Canonical public vehicle eras and the private simulation-role vocabulary.
//
// Era is one of the player-facing fleet facets; class, battle role and design
// status live in vehicleFacets.ts (owner ruling 2026-10-17). `role` here exists
// solely for mechanics that genuinely need a platform distinction (AI doctrine,
// spotting baselines, weapon-feed behavior); players filter by the class facet.

import type { RuntimeValue } from '../runtimeTypes.ts';

// The era ids and the postwar gate live in a DOM-free slice the rooms Worker's rules can reach (sim/vehicleEras.ts).
import { VEHICLE_ERAS, type VehicleEra } from '../sim/vehicleEras.ts';
export { VEHICLE_ERAS, isPostwarVehicleEra, type VehicleEra } from '../sim/vehicleEras.ts';

export const VEHICLE_ERA_ORDER: readonly VehicleEra[] = Object.freeze([
  VEHICLE_ERAS.INTERWAR,
  VEHICLE_ERAS.WORLD_WAR_II,
  VEHICLE_ERAS.COLD_WAR,
  VEHICLE_ERAS.MODERN,
  VEHICLE_ERAS.NEXT_GENERATION,
]);

interface VehicleEraMetadata {
  label: string;
  shortLabel: string;
}

export const VEHICLE_ERA_META: Readonly<Record<VehicleEra, VehicleEraMetadata>> = Object.freeze({
  [VEHICLE_ERAS.INTERWAR]: Object.freeze({ label: 'Interwar', shortLabel: 'Interwar' }),
  [VEHICLE_ERAS.WORLD_WAR_II]: Object.freeze({ label: 'World War II', shortLabel: 'WWII' }),
  [VEHICLE_ERAS.COLD_WAR]: Object.freeze({ label: 'Cold War', shortLabel: 'Cold War' }),
  [VEHICLE_ERAS.MODERN]: Object.freeze({ label: 'Modern', shortLabel: 'Modern' }),
  [VEHICLE_ERAS.NEXT_GENERATION]: Object.freeze({ label: 'Next Generation', shortLabel: 'Next Gen' }),
});

const ERA_VEHICLE_IDS: Readonly<Record<VehicleEra, readonly string[]>> = Object.freeze({
  // No first-party hull occupies the interwar era since the Leichttraktor study
  // retired with the hidden fleet (2026-09-23); the era stays in the public
  // taxonomy for future vehicles.
  [VEHICLE_ERAS.INTERWAR]: Object.freeze([]),
  [VEHICLE_ERAS.WORLD_WAR_II]: Object.freeze([
    'kv2', 'jpz_e100',
  ]),
  [VEHICLE_ERAS.COLD_WAR]: Object.freeze([
    'amx10p', 'amx10p_25', 'amx30b', 'amx40', 't62mv1',
    'challenger1_mk3',
    't72bu',
    'chieftain5',
    't55a', 't62_1975', 't64bv1', 't64bv', 't72bu_1989', 't80', 't80b', 't80bv',
    't80uk', 'strv81', 'strv105', 'udes03', 'strv103a', 'strv103b',
    'chieftain3', 'chieftain_mk9', 'challenger1_mk1', 'challenger1_mk2', 'challenger_x', 'challenger_x_sleek', 'fv4034', 'stb1', 'type74', 'type90_kyumaru',
    'type90a', 'm2a2_bradley', 'bmp2', 'bmp3', 'hayate_ifv', 'carro45t',
    'amx40_proto', 'leo1a5', 'leo1a2a1', 'leopard2_proto', 'leo2a2', 'mbt70', 'm1a1', 'fv510',
    'm1a1ha', 'm60a1', 'merkava1b', 'merkava2b', 'merkava2d', 'fv510_milan',
    'amx30', 'amx30b2', 'm48a5_patton', 'm48a3_patton', 'magach3', 'm48a2ga2', 'm48_super', 'm60a2', 'm60a3',
    'vickers_mk1',
    'centurion3', 'centurion5_2', 'shot_kal', 'centurion13', 'centurion5_avre', 'centurion5_1_aus', 'm46_patton', 'm47_patton',
    'type59', 'ztz85_iii', 'bwp1', 'marder1a3', 'm551_sheridan',
  ]),
  [VEHICLE_ERAS.MODERN]: Object.freeze([
    // 2026-10-13 (VEH-11, coordinator ruling): the Warrior TES(H) is a 2000s Afghanistan fit at tier X.
    'warrior_tes_h',
    // release 262: the Olifant Mk 2 (2007)
    'olifant_mk2',
    'type96_72_long', 'type96_80_feng', 'type96_72m_lei', 't72_rys',
    'tos1a_tagil', 'griffin_viper', 'ares_apc',
    'leo2a6', 'c1_ariete', 'c2_ariete', 'strv122', 't72b3m_2016',
    't90', 't90a_burlak', 't90ms_tagil',
    'k1a1',
    'leclerc_xlr', 'amx56', 't72b_1987', 't80u', 'chieftain_mk10', 't72b3', 'type10', 'type90',
    'leo2a7v', 'leo2a6m', 'leo2a5m', 'leo2a5', 'merkava4', 'merkava3d',
    'merkava4_trophy', 'merkava4_barak', 'namer_ifv',
    'k2_black_panther', 't90a', 't90a_vladimir', 't90m', 't90sm',
    'm1a2_abrams', 'm1a2_abrams_tusk', 'm1a2_abrams_sepv2', 'm1a2_abrams_sepv3', 'ua_m1a2_abrams',
    'm1a1_abrams_hc', 't72b3m_2022', 'pt91m', 't84', 't90_1992', 't90a_2004',
    't90a_2006', 't90a_burlak_proto', 't90sm_2013', 't90ms_2011', 't90am', 't90m_proryv',
    'strv121', 'challenger2', 'challenger2e', 'ua_challenger2', 'xk2_black_panther', 'k1e1', 'type10_tk_x', 'type10_dozer', 'christian2',
    'm6_linebacker', 'marder2', 'dardo', 'puma_s1', 'cv9040c', 'spz_puma', 'spz_wotan', 'c1_ariete_preserie', 'c1_ariete_proto_serie1', 'leo2a3', 'leo2a3_b4', 'leo2a4m_can', 'leo2a4_v', 'leo2a4m',
    'leo2a4', 'leo2a4_otco', 'leo2a6_ua', 'leo2_revolution_proto', 'leo2_revolution', 'leo2_improved', 'leclerc_s2', 'leclerc_sxxi',
    'leclerc_s1', 'ztz99_longwei', 'ztz99a', 'ztz99a2', 'vt4a1', 'm1a1_abrams_sa', 'm1a1_abrams_aim',
    'm1a1_abrams_fep', 'merkava3c', 'merkava3_baz', 'merkava4b', 't72m1_jaguar',
    'pt91a_twardy', 'k2b', 'bmp3_rok', 't64bv_donbas', 't64bm1m', 't64b1v_2022', 'pt64_tur', 'ua_t80bv', 't80u_kursk', 't84bm_oplot_m', 'bm_oplot_m', 'bm_oplot_t',
    'pt84_orzel', 'pt84_sokol', 'pt84_zbik', 'ua_m1a1', 'ua_m2a3_bradley', 'bmpt_terminator2',
    'm3a3_bradley', 'bmpt_t90', 'cv90',
    'ajax', 'aft10', 'k21', 'type96b', 'cv90105_tml', 'sabra_mk2',
    // 2026-10-25 (owner: "properly label next gen vs modern"): upgrades and new builds of in-service families are
    // modern however recent. The T-72B3 and T-80U national modernizations, the Challenger 3 (a rebuilt Challenger 2),
    // the C2 Ariete and Type 10B prototypes, the CV90 Mk IV, the KF41 Lynx and its Italian build, the Borsuk, and the
    // 1989 Type 89 and M551A1 TTS left next generation.
    't72b3m_hetman_ii', 't72b3_zubr_ii', 't80u_zoria', 't72b3m_hetman', 't72b3_sich', 't80u_husarz', 't72b3m_wilk',
    't72b3_zubr', 't80u_yun', 't72b3m_kunlun', 't72b3_qilin', 't80u_bars_m', 't72b3m_bulat_m', 't72b3_bastion_m',
    'challenger3_proto', 'challenger3', 'challenger3_td', 'challenger3_td_rws', 'c2_ariete_proto', 'type10b', 'cv90_mk4', 'cv90_mk4_concept', 'kf41_lynx',
    'lrmv_lynx', 'borsuk', 'type89', 'm551a1_tts',
    // release 264: the Longwei family, fleet hulls under a modernized Longwei turret
    'ztz99a2_qinglong', 'vt4a1_baihu', 't72b3_zhuque', 't72b3m_xuanwu',
  ]),
  // A new generation: clean-sheet architectures past the third-generation tank (uncrewed turrets and crew capsules,
  // 130 mm-class guns, hybrid drives), whether fielded, prototypes or concepts. The T-14 Armata is the yardstick.
  [VEHICLE_ERAS.NEXT_GENERATION]: Object.freeze([
    't14_armata', 'object148_proto', 'kurganets25', 'object695', 'bmp3m_dragun125',
    'kf51_panther', 'kf51_evo', 'kf51_u', 'm1a3', 'abramsx', 'griffin50mm',
    'type100', 'ztz100', 'ztz100_prototype', 'ztz20', 'ztz20_prototype', 'pl01', 'pl01_105', 'upior', 'raiju_ifv',
  ]),
});

const ERA_BY_VEHICLE_ID = new Map<string, VehicleEra>();
for (const era of VEHICLE_ERA_ORDER) {
  for (const id of ERA_VEHICLE_IDS[era]) {
    if (ERA_BY_VEHICLE_ID.has(id)) throw new Error(`Duplicate vehicle era assignment: ${id}`);
    ERA_BY_VEHICLE_ID.set(id, era);
  }
}

const VEHICLE_ROLES = Object.freeze([
  'light', 'medium', 'heavy', 'td', 'mbt', 'ifv', 'spg',
] as const);

type VehicleRole = typeof VEHICLE_ROLES[number];

const VEHICLE_ROLE_SET = new Set<string>(VEHICLE_ROLES);

export function vehicleEraForId(id: RuntimeValue): VehicleEra | null {
  return ERA_BY_VEHICLE_ID.get(String(id || '')) || null;
}

/**
 * The era a vehicle's cosmetic kit is drawn from when it differs from its gameplay era (decorations.ts decorEra).
 * A gameplay re-classification must not restyle a vehicle: look changes stay deliberate.
 */
const DECOR_ERA_OVERRIDES: ReadonlyMap<string, VehicleEra> = new Map([
  // 2026-10-13 (VEH-11): the Warrior TES(H) plays in the modern era and keeps the Cold War stowage it shipped with as
  // the Warrior MILAN X.
  ['warrior_tes_h', VEHICLE_ERAS.COLD_WAR],
]);

export function decorEraOverrideForId(id: RuntimeValue): VehicleEra | null {
  return DECOR_ERA_OVERRIDES.get(String(id || '')) ?? null;
}

export function vehicleEraLabel(era: RuntimeValue, { short = false }: { short?: boolean } = {}): string {
  const meta = typeof era === 'string'
    ? VEHICLE_ERA_META[era as VehicleEra]
    : undefined;
  return meta ? (short ? meta.shortLabel : meta.label) : 'Unclassified Era';
}

// Era-to-i18n-key mapping. The garage and gallery display the era as a short
// tag on vehicle cards and as a long label in the dossier header. When the
// i18n catalog has a translation, callers should prefer `vehicleEraLabelI18n`.
const ERA_I18N: Readonly<Record<string, { short: string; long: string }>> = Object.freeze({
  'next-generation': Object.freeze({ short: 'garage.era.nextGen', long: 'garage.era.nextGen' }),
  modern: Object.freeze({ short: 'garage.era.modern', long: 'garage.era.modern' }),
  'cold-war': Object.freeze({ short: 'garage.era.coldWar', long: 'garage.era.coldWar' }),
  ww2: Object.freeze({ short: 'garage.era.worldWar2', long: 'garage.era.worldWar2' }),
  interwar: Object.freeze({ short: 'garage.era.interwar', long: 'garage.era.interwar' }),
});

/** Returns a translated era label when an i18n key exists, else falls back
 *  to the canonical English label. */
export function vehicleEraLabelI18n(
  era: RuntimeValue,
  translate: (key: string) => string,
  options: { short?: boolean } = {},
): string {
  if (typeof era !== 'string') return vehicleEraLabel(era, options);
  const keyMap = ERA_I18N[era];
  if (!keyMap) return vehicleEraLabel(era, options);
  return translate(keyMap[options.short ? 'short' : 'long']);
}

export function compareVehicleEras(a: VehicleEra, b: VehicleEra): number {
  return VEHICLE_ERA_ORDER.indexOf(a) - VEHICLE_ERA_ORDER.indexOf(b);
}

/** Modern presentation family used by contemporary and demonstrator designs. */
export function isContemporaryVehicleEra(era: RuntimeValue): boolean {
  return era === VEHICLE_ERAS.MODERN || era === VEHICLE_ERAS.NEXT_GENERATION;
}

export function isVehicleRole(role: RuntimeValue): role is VehicleRole {
  return typeof role === 'string' && VEHICLE_ROLE_SET.has(role);
}

interface VehicleTaxonomySpec {
  id?: RuntimeValue;
  role?: RuntimeValue;
  era?: RuntimeValue;
  class?: RuntimeValue;
}

/**
 * Seal one registered spec against the canonical taxonomy.
 * Throws on drift so a newly registered tank cannot silently fall into a
 * generic UI bucket or reintroduce the retired `class` field.
 */
export function applyVehicleTaxonomy<T extends VehicleTaxonomySpec>(
  spec: T,
): T & { era: VehicleEra; role: VehicleRole } {
  if (!spec?.id) throw new Error('Cannot classify a vehicle without an id');
  if (Object.prototype.hasOwnProperty.call(spec, 'class')) {
    throw new Error(`${spec.id}: retired vehicle class field is not allowed; use mechanical role`);
  }
  const era = vehicleEraForId(spec.id);
  if (!era) throw new Error(`${spec.id}: missing canonical vehicle era assignment`);
  if (!isVehicleRole(spec.role)) throw new Error(`${spec.id}: invalid mechanical role ${String(spec.role)}`);
  spec.era = era;
  return spec as T & { era: VehicleEra; role: VehicleRole };
}
