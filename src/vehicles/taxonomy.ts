// Canonical public vehicle taxonomy and private simulation-role vocabulary.
//
// Era is the only fleet category exposed to players. `role` exists solely for
// mechanics that genuinely need a platform distinction (AI doctrine, spotting
// baselines, weapon-feed behavior); it is not a gallery or garage category.

export const VEHICLE_ERAS = Object.freeze({
  INTERWAR: 'interwar',
  WORLD_WAR_II: 'ww2',
  COLD_WAR: 'cold-war',
  MODERN: 'modern',
  NEXT_GENERATION: 'next-generation',
} as const);

export type VehicleEra = typeof VEHICLE_ERAS[keyof typeof VEHICLE_ERAS];

export const VEHICLE_ERA_ORDER: readonly VehicleEra[] = Object.freeze([
  VEHICLE_ERAS.INTERWAR,
  VEHICLE_ERAS.WORLD_WAR_II,
  VEHICLE_ERAS.COLD_WAR,
  VEHICLE_ERAS.MODERN,
  VEHICLE_ERAS.NEXT_GENERATION,
]);

export interface VehicleEraMetadata {
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
  [VEHICLE_ERAS.INTERWAR]: Object.freeze([
    'leichttraktor',
  ]),
  [VEHICLE_ERAS.WORLD_WAR_II]: Object.freeze([
    'm4a3e8', 'tiger1', 't34_85', 'is2', 'panther_g', 'is3', 'is3_bergman', 't34_85_cad',
    'newc_tiger', 'newc_pziii', 'pziii_konserwa', 'q_heavy', 'kv2', 'tiger2',
    'sherman_jumbo', 'jagdtiger', 'jpz_e100', 'sturmtiger', 't95', 't30',
    'is6b', 'is1', 't44', 'comet', 'challenger_cruiser', 'isu152', 'isu122s',
    'm26_pershing', 'm45_patton',
  ]),
  [VEHICLE_ERAS.COLD_WAR]: Object.freeze([
    't62mv1', 't64bv1', 't72b_1987', 't72bu', 't80', 't80b', 't80bv',
    't80u', 'strv81', 'udes03', 'strv103a', 'strv103', 'is7', 'object279',
    'chieftain5', 'chieftain_mk10', 'challenger1', 'fv4034', 'stb1', 'type74', 'type90',
    'type90a', 'm2a2_bradley', 'bmp1', 'bmp2', 'bmp3', 'type89', 'carro45t',
    'amx40', 'leo1a5', 'leopard2_proto', 'leo2a4', 'mbt70', 'm1a1', 'fv510',
    'm1a1ha', 'm60a1', 'merkava1b', 'merkava2b', 'merkava2d', 'fv510_milan',
    't54', 'amx30', 'amx30b2', 'm48', 'm60a2', 'm60a3', 'vickers_mk1',
    'centurion3', 'centurion5', 'charioteer', 'm46_patton', 'm47_patton',
    'type59', 'ztz85_iii', 'bwp1', 'marder1a3', 'm551_sheridan',
  ]),
  [VEHICLE_ERAS.MODERN]: Object.freeze([
    'm1a2_legacy', 'm1a2', 't72b3m', 'pt91m', 't84', 't90', 't90a',
    't90a_vladimir', 't90a_burlak', 't90sm', 't90ms', 't90m', 't90m_proryv', 't72b3',
    'leo2a7', 'strv122', 'challenger2', 'challenger2e', 'ua_challenger2', 'k2', 'k1a1', 'type10', 'recon_tank',
    'spz_puma', 'spz_puma_s1', 'ariete', 'ariete_c1', 'leo2a4_otco', 'leo2a4m', 'leo2a5', 'leo2a5_a5nl',
    'leo2a6', 'leo2a6m', 'leo2a6_ua', 'leo2_revolution', 'leo2a7v', 'leclerc', 'leclerc_xlr',
    'amx56', 'type99a', 'ztz99a2', 'merkava4', 'm1a2_tusk', 'm1a2_sepv2',
    'm1a2_sepv3', 'merkava3c', 'merkava3d', 'merkava4b', 't72m1_jaguar',
    'pt91_twardy', 'k2b', 'bmp3_rok', 'ua_t64bv', 'ua_t80bv', 'ua_t80u_kursk',
    'ua_t84_oplot_m', 'ua_m1a1', 'ua_m2a3_bradley', 'bmpt_terminator2',
    'm3a3_bradley', 'bmpt_t90', 'm1128', 'm1296',
  ]),
  [VEHICLE_ERAS.NEXT_GENERATION]: Object.freeze([
    'challenger_3', 'challenger_3x', 'type10b', 'ariete_c2', 't14', 'kf51', 'kf51b', 'm1a3', 'abramsx',
    'pl01', 'pl01_105', 'upior', 'm551a1_tts', 'type89_light_tiger',
  ]),
});

const ERA_BY_VEHICLE_ID = new Map<string, VehicleEra>();
for (const era of VEHICLE_ERA_ORDER) {
  for (const id of ERA_VEHICLE_IDS[era]) {
    if (ERA_BY_VEHICLE_ID.has(id)) throw new Error(`Duplicate vehicle era assignment: ${id}`);
    ERA_BY_VEHICLE_ID.set(id, era);
  }
}

export const VEHICLE_ROLES = Object.freeze([
  'light', 'medium', 'heavy', 'td', 'mbt', 'ifv', 'spg',
] as const);

export type VehicleRole = typeof VEHICLE_ROLES[number];

const VEHICLE_ROLE_SET = new Set<string>(VEHICLE_ROLES);

export function vehicleEraForId(id: unknown): VehicleEra | null {
  return ERA_BY_VEHICLE_ID.get(String(id || '')) || null;
}

export function vehicleEraLabel(era: unknown, { short = false }: { short?: boolean } = {}): string {
  const meta = typeof era === 'string'
    ? VEHICLE_ERA_META[era as VehicleEra]
    : undefined;
  return meta ? (short ? meta.shortLabel : meta.label) : 'Unclassified Era';
}

export function compareVehicleEras(a: VehicleEra, b: VehicleEra): number {
  return VEHICLE_ERA_ORDER.indexOf(a) - VEHICLE_ERA_ORDER.indexOf(b);
}

/** Postwar vehicle technologies shared by Cold War and newer platforms. */
export function isPostwarVehicleEra(era: unknown): boolean {
  return era === VEHICLE_ERAS.COLD_WAR
    || era === VEHICLE_ERAS.MODERN
    || era === VEHICLE_ERAS.NEXT_GENERATION;
}

/** Modern presentation family used by contemporary and demonstrator designs. */
export function isContemporaryVehicleEra(era: unknown): boolean {
  return era === VEHICLE_ERAS.MODERN || era === VEHICLE_ERAS.NEXT_GENERATION;
}

export function isVehicleRole(role: unknown): role is VehicleRole {
  return typeof role === 'string' && VEHICLE_ROLE_SET.has(role);
}

export interface VehicleTaxonomySpec {
  id?: unknown;
  role?: unknown;
  era?: unknown;
  class?: unknown;
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
