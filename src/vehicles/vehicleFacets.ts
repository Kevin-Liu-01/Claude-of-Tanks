// Player-facing fleet facets: vehicle class, battle role and design status.
//
// Owner ruling 2026-10-17: the fleet may be browsed and reorganized by class and role (the future tech tree reads
// the same table). Nation and era stay where they already live (spec.nation, taxonomy.ts). This module is the one
// authored source for the three new facets:
//
//   class   what the vehicle is: main battle tank, medium, heavy or light tank, IFV, APC, tank destroyer, SPAA,
//           fire support (tank-support fighting vehicles and rocket fire support, which fit none of the others).
//   role    how it plays in this game. Each role is tied to the vehicle's tactical doctrine in roleProfiles.ts
//           (ROLE_DOCTRINES below), so the label a player filters by always matches the handling it was tuned with.
//   status  in service, prototype (a real prototype, demonstrator or pre-series vehicle) or concept (a paper or
//           project-authored design). The owner's "concept / prototype" class is this facet: a prototype MBT stays
//           an MBT for its line and also answers the concept-and-prototype filter (CONCEPT_PROTOTYPE_CLASS_FILTER).
//
// Every playable id appears exactly once per facet (vehicleFacets.selftest.mjs). Pure data: no three, no DOM, no
// spec import, Node-runnable; the internal mechanical `spec.role` is a separate vocabulary (taxonomy.ts).

import type { RuntimeValue } from '../runtimeTypes.ts';

export const VEHICLE_CLASS_ORDER = Object.freeze([
  'mbt', 'medium', 'heavy', 'light', 'ifv', 'apc', 'td', 'spaa', 'fire-support',
] as const);
type VehicleClass = typeof VEHICLE_CLASS_ORDER[number];

export const VEHICLE_BATTLE_ROLE_ORDER = Object.freeze([
  'breakthrough', 'frontline', 'flanker', 'sniper', 'scout', 'support',
] as const);
export type VehicleBattleRole = typeof VEHICLE_BATTLE_ROLE_ORDER[number];

export const VEHICLE_DESIGN_STATUS_ORDER = Object.freeze(['service', 'prototype', 'concept'] as const);
export type VehicleDesignStatus = typeof VEHICLE_DESIGN_STATUS_ORDER[number];

/** The class filter's extra option: every prototype and concept vehicle, whatever its class. */
export const CONCEPT_PROTOTYPE_CLASS_FILTER = 'concept-prototype';
export type VehicleClassFilter = VehicleClass | typeof CONCEPT_PROTOTYPE_CLASS_FILTER;

type VehicleFacetName = 'class' | 'role' | 'status';

export interface VehicleFacetValueMeta {
  /** English fallback label (tools, Node receipts, a missing catalog). */
  readonly label: string;
  readonly shortLabel: string;
  /** i18n keys, spelled as literals so the page catalog scan keeps them. */
  readonly labelKey: string;
  readonly shortKey: string;
  /** Optional one-line explanation (role tooltips). */
  readonly hintKey?: string;
  /** Extra lowercase search words and `class:` / `role:` / `status:` token values. */
  readonly aliases: readonly string[];
}

export const VEHICLE_CLASS_META: Readonly<Record<VehicleClass, VehicleFacetValueMeta>> = Object.freeze({
  mbt: Object.freeze({
    label: 'Main battle tank', shortLabel: 'MBT', labelKey: 'fleet.class.mbt', shortKey: 'fleet.class.mbt.short',
    aliases: Object.freeze(['mbt', 'main battle tank', 'main-battle-tank', 'tank']),
  }),
  medium: Object.freeze({
    label: 'Medium tank', shortLabel: 'Medium', labelKey: 'fleet.class.medium', shortKey: 'fleet.class.medium.short',
    aliases: Object.freeze(['medium', 'medium tank', 'medium-tank', 'mt']),
  }),
  heavy: Object.freeze({
    label: 'Heavy tank', shortLabel: 'Heavy', labelKey: 'fleet.class.heavy', shortKey: 'fleet.class.heavy.short',
    aliases: Object.freeze(['heavy', 'heavy tank', 'heavy-tank', 'ht']),
  }),
  light: Object.freeze({
    label: 'Light tank', shortLabel: 'Light', labelKey: 'fleet.class.light', shortKey: 'fleet.class.light.short',
    aliases: Object.freeze(['light', 'light tank', 'light-tank', 'lt']),
  }),
  ifv: Object.freeze({
    label: 'Infantry fighting vehicle', shortLabel: 'IFV', labelKey: 'fleet.class.ifv', shortKey: 'fleet.class.ifv.short',
    aliases: Object.freeze(['ifv', 'infantry fighting vehicle', 'infantry-fighting-vehicle', 'cfv']),
  }),
  apc: Object.freeze({
    label: 'Armored personnel carrier', shortLabel: 'APC', labelKey: 'fleet.class.apc', shortKey: 'fleet.class.apc.short',
    aliases: Object.freeze(['apc', 'armored personnel carrier', 'armoured personnel carrier', 'carrier']),
  }),
  td: Object.freeze({
    label: 'Tank destroyer', shortLabel: 'TD', labelKey: 'fleet.class.td', shortKey: 'fleet.class.td.short',
    aliases: Object.freeze(['td', 'tank destroyer', 'tank-destroyer', 'destroyer', 'casemate']),
  }),
  spaa: Object.freeze({
    label: 'Self-propelled anti-aircraft', shortLabel: 'SPAA', labelKey: 'fleet.class.spaa', shortKey: 'fleet.class.spaa.short',
    aliases: Object.freeze(['spaa', 'aa', 'anti-aircraft', 'anti-air', 'air defense', 'air defence']),
  }),
  'fire-support': Object.freeze({
    label: 'Fire support vehicle', shortLabel: 'Fire support', labelKey: 'fleet.class.fireSupport',
    shortKey: 'fleet.class.fireSupport.short',
    aliases: Object.freeze(['fire-support', 'fire support', 'fsv', 'bmpt', 'mrl', 'rocket artillery', 'tank support']),
  }),
});

export const CONCEPT_PROTOTYPE_FILTER_META: VehicleFacetValueMeta = Object.freeze({
  label: 'Concept & prototype', shortLabel: 'Concept & prototype', labelKey: 'fleet.filter.conceptPrototype',
  shortKey: 'fleet.filter.conceptPrototype',
  aliases: Object.freeze(['concept-prototype', 'concepts', 'prototypes']),
});

export const VEHICLE_BATTLE_ROLE_META: Readonly<Record<VehicleBattleRole, VehicleFacetValueMeta>> = Object.freeze({
  breakthrough: Object.freeze({
    label: 'Breakthrough', shortLabel: 'Breakthrough', labelKey: 'fleet.role.breakthrough',
    shortKey: 'fleet.role.breakthrough', hintKey: 'fleet.role.breakthrough.hint',
    aliases: Object.freeze(['breakthrough', 'assault', 'brawler', 'spearhead']),
  }),
  frontline: Object.freeze({
    label: 'Frontline', shortLabel: 'Frontline', labelKey: 'fleet.role.frontline',
    shortKey: 'fleet.role.frontline', hintKey: 'fleet.role.frontline.hint',
    aliases: Object.freeze(['frontline', 'front-line', 'line', 'all-rounder', 'allrounder', 'flexible']),
  }),
  flanker: Object.freeze({
    label: 'Flanker', shortLabel: 'Flanker', labelKey: 'fleet.role.flanker',
    shortKey: 'fleet.role.flanker', hintKey: 'fleet.role.flanker.hint',
    aliases: Object.freeze(['flanker', 'flank', 'skirmisher']),
  }),
  sniper: Object.freeze({
    label: 'Sniper', shortLabel: 'Sniper', labelKey: 'fleet.role.sniper',
    shortKey: 'fleet.role.sniper', hintKey: 'fleet.role.sniper.hint',
    aliases: Object.freeze(['sniper', 'precision', 'long-range', 'overwatch']),
  }),
  scout: Object.freeze({
    label: 'Scout', shortLabel: 'Scout', labelKey: 'fleet.role.scout',
    shortKey: 'fleet.role.scout', hintKey: 'fleet.role.scout.hint',
    aliases: Object.freeze(['scout', 'recon', 'reconnaissance', 'spotter']),
  }),
  support: Object.freeze({
    label: 'Support', shortLabel: 'Support', labelKey: 'fleet.role.support',
    shortKey: 'fleet.role.support', hintKey: 'fleet.role.support.hint',
    aliases: Object.freeze(['support', 'escort']),
  }),
});

export const VEHICLE_DESIGN_STATUS_META: Readonly<Record<VehicleDesignStatus, VehicleFacetValueMeta>> = Object.freeze({
  service: Object.freeze({
    label: 'In service', shortLabel: 'In service', labelKey: 'fleet.status.service', shortKey: 'fleet.status.service',
    aliases: Object.freeze(['service', 'in-service', 'production', 'series']),
  }),
  prototype: Object.freeze({
    label: 'Prototype', shortLabel: 'Prototype', labelKey: 'fleet.status.prototype', shortKey: 'fleet.status.prototype',
    aliases: Object.freeze(['prototype', 'proto', 'demonstrator', 'pre-series']),
  }),
  concept: Object.freeze({
    label: 'Concept', shortLabel: 'Concept', labelKey: 'fleet.status.concept', shortKey: 'fleet.status.concept',
    aliases: Object.freeze(['concept', 'paper', 'fictional']),
  }),
});

/**
 * Which tactical doctrines (roleProfiles.ts) each battle role may carry. A role change that contradicts the
 * vehicle's tuning fails the receipt; reorganizing a vehicle changes its doctrine and its role together.
 */
export const ROLE_DOCTRINES: Readonly<Record<VehicleBattleRole, readonly string[]>> = Object.freeze({
  breakthrough: Object.freeze(['assault', 'siege']),
  frontline: Object.freeze(['flexible']),
  flanker: Object.freeze(['flanker']),
  sniper: Object.freeze(['precision', 'missile-support', 'siege']),
  scout: Object.freeze(['scout', 'recon']),
  support: Object.freeze(['support', 'armored-support', 'missile-support', 'siege']),
});

/** Which internal mechanical roles (spec.role, taxonomy.ts) each class may sit on. */
export const CLASS_MECHANICAL_ROLES: Readonly<Record<VehicleClass, readonly string[]>> = Object.freeze({
  mbt: Object.freeze(['mbt']),
  medium: Object.freeze(['medium', 'mbt']),
  heavy: Object.freeze(['heavy']),
  light: Object.freeze(['light', 'mbt']),
  ifv: Object.freeze(['ifv']),
  apc: Object.freeze(['ifv']),
  td: Object.freeze(['td', 'ifv']),
  spaa: Object.freeze(['ifv']),
  'fire-support': Object.freeze(['ifv', 'spg', 'mbt']),
});

// ---------------------------------------------------------------------------------------------------------------
// The authored tables. Alphabetical within each value; a new vehicle is added to one list per facet.
// ---------------------------------------------------------------------------------------------------------------

const CLASS_VEHICLE_IDS: Readonly<Record<VehicleClass, readonly string[]>> = Object.freeze({
  mbt: Object.freeze([
    'abramsx', 'amx30', 'amx30b', 'amx30b2', 'amx40', 'amx40_proto', 'amx56', 'bm_oplot_m', 'bm_oplot_t', 'c1_ariete',
    'c1_ariete_preserie', 'c1_ariete_proto_serie1', 'c2_ariete', 'c2_ariete_proto',
    'challenger1_mk1', 'challenger1_mk2', 'challenger1_mk3', 'challenger2', 'challenger2e', 'challenger3',
    'challenger3_proto', 'challenger3_td', 'challenger3_td_rws', 'challenger_x', 'challenger_x_sleek', 'chieftain3', 'chieftain5', 'chieftain_mk10',
    'chieftain_mk9', 'christian2', 'fv4034', 'k1a1', 'k1e1', 'k2_black_panther', 'k2b', 'kf51_evo', 'kf51_panther',
    'kf51_u', 'leclerc_s1', 'leclerc_s2', 'leclerc_sxxi', 'leclerc_xlr', 'leo1a3dk', 'leo1a5', 'leo1a5dk', 'leo1a5dk1', 'leo2_improved', 'leo2_revolution',
    'leo2_revolution_proto', 'leo2a2', 'leo2a3', 'leo2a4', 'leo2a4_otco', 'leo2a4_v', 'leo2a4m', 'leo2a4m_can',
    'leo2a5', 'leo2a5dk', 'leo2a5m', 'leo2a6', 'leo2a6_ua', 'leo2a6m', 'leo2a7v', 'leopard2_proto', 'm1a1', 'm1a1_abrams_aim',
    'm1a1_abrams_fep', 'm1a1_abrams_hc', 'm1a1_abrams_sa', 'm1a1ha', 'm1a2_abrams', 'm1a2_abrams_sepv2',
    'm1a2_abrams_sepv3', 'm1a2_abrams_tusk', 'm1a3', 'm48a5_patton', 'm60a1', 'm60a2', 'm60a3', 'mbt70', 'merkava1b',
    'merkava2b', 'merkava2d', 'merkava3_baz', 'merkava3c', 'merkava3d', 'merkava4', 'merkava4_barak',
    'merkava4_trophy', 'merkava4b', 'object148_proto', 'pt64_tur', 'pt91a_twardy', 'pt91m', 'sabra_mk2', 'stb1',
    'strv121', 'strv122', 't14_armata', 't62_1975', 't62mv1', 't64b1v_2022', 't64bm1m', 't64bv', 't64bv1',
    't64bv_donbas', 't72_rys', 't72b3', 't72b3_bastion_m', 't72b3_qilin', 't72b3_sich', 't72b3_zubr', 't72b3_zubr_ii',
    't72b3m_2016', 't72b3m_2022', 't72b3m_bulat_m', 't72b3m_hetman', 't72b3m_hetman_ii', 't72b3m_kunlun',
    't72b3m_wilk', 't72b_1987', 't72bu', 't72bu_1989', 't72m1_jaguar', 't80', 't80b', 't80bv', 't80u', 't80u_bars_m',
    't80u_husarz', 't80u_kursk', 't80u_yun', 't80u_zoria', 't80uk', 't84', 't84bm_oplot_m', 't90', 't90_1992', 't90a',
    't90a_2004', 't90a_2006', 't90a_burlak', 't90a_burlak_proto', 't90a_vladimir', 't90am', 't90m', 't90m_proryv',
    't90ms_2011', 't90ms_tagil', 't90sm', 't90sm_2013', 'type10', 'type10_dozer', 'type10_tk_x', 'type10b', 'type74',
    'type90', 'type90_kyumaru', 'type90a', 'type96_72_long', 'type96_72m_lei', 'type96_80_feng', 'type96b',
    'ua_challenger2', 'ua_m1a1', 'ua_m1a2_abrams', 'ua_t80bv', 'vickers_mk1', 'vt4a1', 'xk2_black_panther', 'ztz100',
    'ztz20', 'ztz20_prototype', 'ztz85_iii', 'ztz99_longwei', 'ztz99a', 'ztz99a2',
  ]),
  // First-generation postwar gun tanks designed as medium tanks (Patton M46/M47, Centurion, the T-54-derived
  // Type 59) and the Carro 45t study.
  medium: Object.freeze([
    'carro45t', 'centurion3', 'centurion5_2', 'm46_patton', 'm47_patton', 'strv81', 't55a', 'type59',
  ]),
  heavy: Object.freeze([
    'kv2',
  ]),
  light: Object.freeze([
    'bmp3m_dragun125', 'cv90105_tml', 'm551_sheridan', 'm551a1_tts', 'pl01', 'pl01_105',
  ]),
  // Autocannon-armed fighting vehicles, with the cavalry and reconnaissance types (M3A3 CFV, Ajax).
  ifv: Object.freeze([
    'ajax', 'amx10p', 'amx10p_25', 'bmp2', 'bmp3', 'bmp3_rok', 'borsuk', 'bwp1', 'cv90', 'cv9040c', 'cv90_mk4',
    'cv90_mk4_concept', 'dardo', 'fv510', 'fv510_milan', 'griffin50mm', 'hayate_ifv', 'k21', 'kf41_lynx',
    'kurganets25', 'lrmv_lynx', 'm2a2_bradley', 'm3a3_bradley', 'marder1a3', 'marder2', 'namer_ifv', 'puma_s1',
    'raiju_ifv', 'spz_puma', 'spz_wotan', 'type100', 'type89', 'ua_m2a3_bradley', 'upior', 'warrior_tes_h',
  ]),
  apc: Object.freeze([
    'ares_apc',
  ]),
  // Casemates (Strv 103, UDES 03, Jagdpanzer E100) and missile carriers (AFT-10, Griffin Viper, Object 695).
  td: Object.freeze([
    'aft10', 'griffin_viper', 'jpz_e100', 'object695', 'strv103a', 'strv103b', 'udes03',
  ]),
  spaa: Object.freeze([
    'm6_linebacker',
  ]),
  // Tank-support fighting vehicles (BMPT), the TOS-1A rocket system and the owner-authored ZTZ-100 missile-support
  // prototype: none is a tank, a troop carrier or a dedicated tank destroyer.
  'fire-support': Object.freeze([
    'bmpt_t90', 'bmpt_terminator2', 'tos1a_tagil', 'ztz100_prototype',
  ]),
});

const ROLE_VEHICLE_IDS: Readonly<Record<VehicleBattleRole, readonly string[]>> = Object.freeze({
  // Doctrine assault, plus the two siege breakthrough vehicles (KV-2, Jagdpanzer E100).
  breakthrough: Object.freeze([
    'jpz_e100', 'kv2', 'merkava1b', 'merkava2b', 'merkava2d', 'merkava3_baz', 'merkava3c', 'merkava3d', 'merkava4',
    'merkava4_barak', 'merkava4_trophy', 'merkava4b', 'object148_proto', 'pt64_tur', 'pt91a_twardy', 'pt91m',
    't14_armata', 't55a', 't62_1975', 't62mv1', 't64b1v_2022', 't64bm1m', 't64bv', 't64bv1', 't64bv_donbas', 't72b3',
    't72b3_bastion_m', 't72b3_qilin', 't72b3_sich', 't72b3_zubr', 't72b3_zubr_ii', 't72b3m_2016', 't72b3m_2022',
    't72b3m_bulat_m', 't72b3m_hetman', 't72b3m_hetman_ii', 't72b3m_kunlun', 't72b3m_wilk', 't72b_1987', 't72bu',
    't72bu_1989', 't72m1_jaguar', 't80u_bars_m', 't80u_husarz', 't80u_yun', 't80u_zoria', 't90', 't90_1992', 't90a',
    't90a_2004', 't90a_2006', 't90a_burlak', 't90a_burlak_proto', 't90a_vladimir', 't90am', 't90m', 't90m_proryv',
    't90ms_2011', 't90ms_tagil', 't90sm', 't90sm_2013', 'type10_dozer', 'type59', 'type96_72_long', 'type96_72m_lei',
    'type96b', 'vt4a1', 'ztz100', 'ztz100_prototype', 'ztz20', 'ztz20_prototype', 'ztz85_iii', 'ztz99_longwei',
    'ztz99a', 'ztz99a2',
  ]),
  frontline: Object.freeze([
    'abramsx', 'centurion3', 'centurion5_2', 'kf51_evo', 'kf51_panther', 'kf51_u', 'leo2_improved',
    'leo2_revolution', 'leo2_revolution_proto', 'leo2a2', 'leo2a3', 'leo2a4', 'leo2a4_otco', 'leo2a4_v',
    'leo2a4m', 'leo2a4m_can', 'leo2a5', 'leo2a5dk', 'leo2a5m', 'leo2a6', 'leo2a6_ua', 'leo2a6m', 'leo2a7v', 'm1a1',
    'm1a1_abrams_aim', 'm1a1_abrams_fep', 'm1a1_abrams_hc', 'm1a1_abrams_sa', 'm1a1ha', 'm1a2_abrams',
    'm1a2_abrams_sepv2', 'm1a2_abrams_sepv3', 'm1a2_abrams_tusk', 'm1a3', 'm46_patton', 'm47_patton',
    'm48a5_patton', 'm60a1', 'm60a2', 'm60a3', 'sabra_mk2', 'ua_m1a1', 'ua_m1a2_abrams',
  ]),
  flanker: Object.freeze([
    'amx30', 'amx30b', 'amx30b2', 'amx40', 'amx40_proto', 'amx56', 'bm_oplot_m', 'bm_oplot_t', 'c1_ariete', 'c1_ariete_preserie',
    'c1_ariete_proto_serie1', 'c2_ariete', 'c2_ariete_proto', 'carro45t', 'k1a1', 'k1e1', 'k2_black_panther',
    'k2b', 'leclerc_s1', 'leclerc_s2', 'leclerc_sxxi', 'leclerc_xlr', 'leo1a3dk', 'leo1a5', 'leo1a5dk', 'leo1a5dk1', 'leopard2_proto', 'mbt70',
    'stb1', 't72_rys', 't80', 't80b', 't80bv', 't80u', 't80u_kursk', 't80uk', 't84', 't84bm_oplot_m', 'type10',
    'type10_tk_x', 'type10b', 'type74', 'type90', 'type90_kyumaru', 'type90a', 'type96_80_feng', 'ua_t80bv',
    'vickers_mk1', 'xk2_black_panther',
  ]),
  // Doctrine precision, plus the AFT-10 missile tank destroyer.
  sniper: Object.freeze([
    'aft10', 'challenger1_mk1', 'challenger1_mk2', 'challenger1_mk3', 'challenger2',
    'challenger2e', 'challenger3', 'challenger3_proto', 'challenger3_td', 'challenger3_td_rws', 'challenger_x', 'challenger_x_sleek', 'chieftain3',
    'chieftain5', 'chieftain_mk10', 'chieftain_mk9', 'christian2', 'fv4034', 'strv103a', 'strv103b', 'strv121',
    'strv122', 'strv81', 'ua_challenger2', 'udes03',
  ]),
  scout: Object.freeze([
    'ajax', 'amx10p', 'amx10p_25', 'ares_apc', 'bmp3m_dragun125', 'borsuk', 'cv90105_tml', 'k21', 'lrmv_lynx',
    'm3a3_bradley', 'm551_sheridan', 'm551a1_tts', 'm6_linebacker', 'pl01', 'pl01_105',
  ]),
  // Doctrines support and armored-support, plus the TOS-1A (siege doctrine, rocket fire support).
  support: Object.freeze([
    'bmp2', 'bmp3', 'bmp3_rok', 'bmpt_t90', 'bmpt_terminator2', 'bwp1', 'cv90', 'cv9040c', 'cv90_mk4',
    'cv90_mk4_concept', 'dardo', 'fv510', 'fv510_milan', 'griffin50mm', 'griffin_viper', 'hayate_ifv',
    'kf41_lynx', 'kurganets25', 'm2a2_bradley', 'marder1a3', 'marder2', 'namer_ifv', 'object695', 'puma_s1',
    'raiju_ifv', 'spz_puma', 'spz_wotan', 'tos1a_tagil', 'type100', 'type89', 'ua_m2a3_bradley', 'upior',
    'warrior_tes_h',
  ]),
});

const STATUS_VEHICLE_IDS: Readonly<Record<VehicleDesignStatus, readonly string[]>> = Object.freeze({
  service: Object.freeze([
    'aft10', 'ajax', 'amx10p', 'amx10p_25', 'amx30', 'amx30b', 'amx30b2', 'amx56', 'ares_apc', 'bm_oplot_m',
    'bm_oplot_t', 'bmp2', 'bmp3', 'bmp3_rok', 'bmpt_terminator2', 'borsuk', 'bwp1', 'c1_ariete', 'c2_ariete',
    'centurion3', 'centurion5_2', 'challenger1_mk1', 'challenger1_mk2', 'challenger1_mk3',
    'challenger2', 'challenger3', 'challenger_x', 'challenger_x_sleek', 'chieftain3', 'chieftain5', 'chieftain_mk10', 'chieftain_mk9', 'cv90', 'cv9040c',
    'cv90_mk4', 'dardo', 'fv510', 'fv510_milan', 'hayate_ifv', 'k1a1', 'k1e1', 'k21', 'k2_black_panther', 'kf41_lynx',
    'kv2', 'leclerc_s1', 'leclerc_s2', 'leclerc_sxxi', 'leclerc_xlr', 'leo1a3dk', 'leo1a5', 'leo1a5dk', 'leo1a5dk1', 'leo2_improved', 'leo2_revolution',
    'leo2a2', 'leo2a3', 'leo2a4', 'leo2a4_otco', 'leo2a4_v', 'leo2a4m', 'leo2a4m_can', 'leo2a5', 'leo2a5dk', 'leo2a5m', 'leo2a6',
    'leo2a6_ua', 'leo2a6m', 'leo2a7v', 'lrmv_lynx', 'm1a1', 'm1a1_abrams_aim', 'm1a1_abrams_fep', 'm1a1_abrams_hc',
    'm1a1_abrams_sa', 'm1a1ha', 'm1a2_abrams', 'm1a2_abrams_sepv2', 'm1a2_abrams_sepv3', 'm1a2_abrams_tusk',
    'm2a2_bradley', 'm3a3_bradley', 'm46_patton', 'm47_patton', 'm48a5_patton', 'm551_sheridan', 'm551a1_tts', 'm60a1',
    'm60a2', 'm60a3', 'm6_linebacker', 'marder1a3', 'merkava1b', 'merkava2b', 'merkava2d', 'merkava3_baz', 'merkava3c',
    'merkava3d', 'merkava4', 'merkava4_barak', 'merkava4_trophy', 'merkava4b', 'namer_ifv', 'pt91a_twardy', 'pt91m',
    'puma_s1', 'sabra_mk2', 'spz_puma', 'spz_wotan', 'strv103a', 'strv103b', 'strv121', 'strv122', 'strv81', 't55a',
    't62_1975', 't62mv1', 't64b1v_2022', 't64bm1m', 't64bv', 't64bv1', 't64bv_donbas', 't72b3', 't72b3m_2016',
    't72b3m_2022', 't72b_1987', 't72bu', 't72bu_1989', 't72m1_jaguar', 't80', 't80b', 't80bv', 't80u', 't80u_kursk',
    't80uk', 't84bm_oplot_m', 't90', 't90_1992', 't90a', 't90a_2004', 't90a_2006', 't90a_vladimir', 't90am', 't90m',
    't90m_proryv', 't90ms_2011', 't90ms_tagil', 't90sm', 't90sm_2013', 'tos1a_tagil', 'type10', 'type100',
    'type10_dozer', 'type59', 'type74', 'type89', 'type90', 'type96b', 'ua_challenger2', 'ua_m1a1', 'ua_m1a2_abrams',
    'ua_m2a3_bradley', 'ua_t80bv', 'vickers_mk1', 'vt4a1', 'warrior_tes_h', 'ztz99a', 'ztz99a2',
  ]),
  // Real prototypes, demonstrators and pre-series vehicles that never reached series service in this form. (owner
  // 2026-10-25: the procedural Type 90 pair are the TK-X first-series prototypes STC-1 and STC-2, tankLabels.ts; the K2B
  // and the Type 10B are the K2's and the Type 10's prototype versions.)
  prototype: Object.freeze([
    'abramsx', 'amx40', 'amx40_proto', 'bmp3m_dragun125', 'bmpt_t90', 'c1_ariete_preserie',
    'c1_ariete_proto_serie1', 'c2_ariete_proto', 'challenger2e', 'challenger3_proto', 'challenger3_td', 'cv90105_tml', 'fv4034',
    'griffin50mm', 'k2b', 'kf51_evo', 'kf51_panther', 'kf51_u', 'kurganets25', 'leo2_revolution_proto',
    'leopard2_proto', 'marder2', 'mbt70', 'object148_proto', 'stb1', 't14_armata', 't84', 't90a_burlak',
    't90a_burlak_proto', 'type10_tk_x', 'type10b', 'type90_kyumaru', 'type90a', 'udes03', 'xk2_black_panther',
    'ztz100', 'ztz100_prototype', 'ztz20_prototype', 'ztz85_iii',
  ]),
  // Paper designs and project-authored vehicles: the "(Concept)" national families, the owner's originals
  // (Upiór, Object 695, Griffin Viper, Longwei, Raijū) and the unbuilt studies; 262: the Challenger 3 TD's field fit.
  concept: Object.freeze([
    'carro45t', 'challenger3_td_rws', 'christian2', 'cv90_mk4_concept', 'griffin_viper', 'jpz_e100', 'm1a3', 'object695', 'pl01', 'pl01_105', 'pt64_tur',
    'raiju_ifv', 't72_rys', 't72b3_bastion_m', 't72b3_qilin', 't72b3_sich', 't72b3_zubr', 't72b3_zubr_ii',
    't72b3m_bulat_m', 't72b3m_hetman', 't72b3m_hetman_ii', 't72b3m_kunlun', 't72b3m_wilk', 't80u_bars_m',
    't80u_husarz', 't80u_yun', 't80u_zoria', 'type96_72_long', 'type96_72m_lei',
    'type96_80_feng', 'upior', 'ztz20', 'ztz99_longwei',
  ]),
});

function indexFacet<V extends string>(facet: VehicleFacetName, order: readonly V[],
  table: Readonly<Record<V, readonly string[]>>): ReadonlyMap<string, V> {
  const byId = new Map<string, V>();
  for (const value of order) {
    for (const id of table[value]) {
      const previous = byId.get(id);
      if (previous) throw new Error(`${id}: classified twice in the ${facet} facet (${previous}, ${value})`);
      byId.set(id, value);
    }
  }
  return byId;
}

const CLASS_BY_ID = indexFacet('class', VEHICLE_CLASS_ORDER, CLASS_VEHICLE_IDS);
const ROLE_BY_ID = indexFacet('role', VEHICLE_BATTLE_ROLE_ORDER, ROLE_VEHICLE_IDS);
const STATUS_BY_ID = indexFacet('status', VEHICLE_DESIGN_STATUS_ORDER, STATUS_VEHICLE_IDS);

export interface VehicleFacets {
  readonly vehicleClass: VehicleClass;
  readonly battleRole: VehicleBattleRole;
  readonly designStatus: VehicleDesignStatus;
}

export function vehicleClassForId(id: RuntimeValue): VehicleClass | null {
  return CLASS_BY_ID.get(String(id || '')) ?? null;
}

export function vehicleBattleRoleForId(id: RuntimeValue): VehicleBattleRole | null {
  return ROLE_BY_ID.get(String(id || '')) ?? null;
}

export function vehicleDesignStatusForId(id: RuntimeValue): VehicleDesignStatus | null {
  return STATUS_BY_ID.get(String(id || '')) ?? null;
}

/** All three facets of a classified vehicle, or null when any facet is missing (an unclassified id). */
export function vehicleFacetsForId(id: RuntimeValue): VehicleFacets | null {
  const vehicleClass = vehicleClassForId(id);
  const battleRole = vehicleBattleRoleForId(id);
  const designStatus = vehicleDesignStatusForId(id);
  return vehicleClass && battleRole && designStatus ? { vehicleClass, battleRole, designStatus } : null;
}

/** The authored members of one facet value (receipts, counts, the future tech tree). */
export function vehicleIdsForFacet(facet: 'class', value: VehicleClass): readonly string[];
export function vehicleIdsForFacet(facet: 'role', value: VehicleBattleRole): readonly string[];
export function vehicleIdsForFacet(facet: 'status', value: VehicleDesignStatus): readonly string[];
export function vehicleIdsForFacet(facet: VehicleFacetName, value: string): readonly string[] {
  const table: Readonly<Record<string, readonly string[]>> = facet === 'class' ? CLASS_VEHICLE_IDS
    : facet === 'role' ? ROLE_VEHICLE_IDS : STATUS_VEHICLE_IDS;
  return table[value] ?? [];
}

export function isVehicleClass(value: RuntimeValue): value is VehicleClass {
  return typeof value === 'string' && (VEHICLE_CLASS_ORDER as readonly string[]).includes(value);
}

export function isVehicleBattleRole(value: RuntimeValue): value is VehicleBattleRole {
  return typeof value === 'string' && (VEHICLE_BATTLE_ROLE_ORDER as readonly string[]).includes(value);
}

export function isVehicleDesignStatus(value: RuntimeValue): value is VehicleDesignStatus {
  return typeof value === 'string' && (VEHICLE_DESIGN_STATUS_ORDER as readonly string[]).includes(value);
}

/** True when the vehicle answers a class filter ('all', a class, or the concept-and-prototype cut). */
export function matchesVehicleClassFilter(facets: VehicleFacets | null, filter: RuntimeValue): boolean {
  if (!filter || filter === 'all') return true;
  if (!facets) return false;
  if (filter === CONCEPT_PROTOTYPE_CLASS_FILTER) return facets.designStatus !== 'service';
  return facets.vehicleClass === filter;
}

export function matchesVehicleRoleFilter(facets: VehicleFacets | null, filter: RuntimeValue): boolean {
  if (!filter || filter === 'all') return true;
  return facets?.battleRole === filter;
}

type Translate = (key: string) => string;

function translated(translate: Translate | undefined, key: string, fallback: string): string {
  if (!translate) return fallback;
  const text = translate(key);
  return text && text !== key ? text : fallback;
}

/** Localized label of one facet value (falls back to English without a catalog). */
export function vehicleFacetLabel(meta: VehicleFacetValueMeta, translate?: Translate,
  { short = false }: { short?: boolean } = {}): string {
  return short
    ? translated(translate, meta.shortKey, meta.shortLabel)
    : translated(translate, meta.labelKey, meta.label);
}

/**
 * The words a vehicle's facets add to a search index: English labels and aliases always (so `tank destroyer`,
 * `sniper` or `prototype` work in every locale), plus the localized labels when a translator is given.
 */
export function vehicleFacetSearchWords(facets: VehicleFacets | null, translate?: Translate): string {
  if (!facets) return '';
  const metas = [
    VEHICLE_CLASS_META[facets.vehicleClass],
    VEHICLE_BATTLE_ROLE_META[facets.battleRole],
    VEHICLE_DESIGN_STATUS_META[facets.designStatus],
  ];
  const words: string[] = [];
  for (const meta of metas) {
    words.push(meta.label, meta.shortLabel, ...meta.aliases);
    if (translate) words.push(vehicleFacetLabel(meta, translate), vehicleFacetLabel(meta, translate, { short: true }));
  }
  return words.join(' ').toLocaleLowerCase('en-US');
}
