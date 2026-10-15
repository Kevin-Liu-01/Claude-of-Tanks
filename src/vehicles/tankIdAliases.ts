// The tank id alias layer (SSOT 2.19, ID.03).
//
// Ids are renamed so they match the names shown in game (the owner,
// 2026-10-12). A rename can reuse an id another vehicle gave up (a "swap":
// leo2a6m was the Leopard 2A4 OTCO and becomes the Leopard 2A6M), so a bare id
// is only meaningful with the id schema it was written under. Every stored or
// sent id therefore carries `tankIdSchema`; anything without one is schema 1,
// the ids before the first rename, and resolves through each later rename map
// in order. Never apply a rename map to data already in the current schema.
//
// Boot-safe and dependency-free: the maps are small string tables and the
// functions are pure. Simulation, network and Node tools may import it.

/** The tank id schema this build writes. Bump it only by appending a rename map. */
export const TANK_ID_SCHEMA = 3;

/**
 * Append-only rename maps. `TANK_ID_RENAMES[k]` turns schema k+1 ids into
 * schema k+2 ids; an id it does not name keeps its spelling. A landed map is
 * never edited: a later rename appends another map and bumps the schema.
 */
export const TANK_ID_RENAMES: readonly Readonly<Record<string, string>>[] = Object.freeze([
  // Schema 2 (2026-10-13, VEH-11): the Warrior MILAN X becomes its own Warrior type, the Warrior TES(H).
  Object.freeze({ fv510_milan_x: 'warrior_tes_h' }),
  // Schema 3 (ID.04/05): every id becomes a slug of the name shown in game (the owner, 2026-10-12; the rename table of
  // 2026-10-13, tools/tank-id-rename-table.mjs). 27 entries are swaps: their new id is an id another vehicle gave up.
  Object.freeze({
    t62mv1: 't62_1975', t72b3m: 't72b3m_2022', t72bu: 't72bu_1989', t80u: 't80uk',
    t90: 't90_1992', t90a: 't90a_2004', t90a_vladimir: 't90a_2006', t90a_burlak: 't90a_burlak_proto',
    t90sm: 't90sm_2013', t90m: 't90am', t90ms: 't90ms_2011', m1a2: 'm1a1_abrams_hc',
    m1a2_tusk: 'm1a1_abrams_sa', m1a2_sepv2: 'm1a1_abrams_aim', m1a2_sepv3: 'm1a1_abrams_fep', strv103: 'strv103b',
    cv90_x: 'cv9040c', cv90105_tml_x: 'cv90105_tml', strv122: 'strv121', cv90_mkiv: 'cv90_mk4_concept',
    cv90_mkiv_x: 'cv90_mk4', chieftain5: 'chieftain3', chieftain_mk10: 'chieftain_mk9', challenger1: 'challenger1_mk2',
    challenger_3: 'challenger3_proto', challenger_3x: 'challenger3', k2: 'xk2_black_panther', k1a1: 'k1e1',
    type90: 'type90_kyumaru', type10: 'type10_tk_x', spz_puma_s1: 'spz_wotan', type89_light_tiger: 'raiju_ifv',
    type89: 'hayate_ifv', ariete: 'c1_ariete_preserie', ariete_c1: 'c1_ariete_proto_serie1', ariete_c2: 'c2_ariete_proto',
    ariete_c1_x: 'c1_ariete', ariete_c2_x: 'c2_ariete', amx40: 'amx40_proto', leo2a4: 'leo2a2',
    leo2a4_otco: 'leo2a3', leo2a4m: 'leo2a4m_can', leo2a5: 'leo2a4_v', leo2a5_a5nl: 'leo2a4m',
    leo2a6: 'leo2a4', leo2a6m: 'leo2a4_otco', leo2a7v: 'leo2_improved', leclerc: 'leclerc_s2',
    leclerc_xlr: 'leclerc_sxxi', amx56: 'leclerc_s1', type99a: 'ztz99_longwei', type96b_x: 'type96b',
    aft10_x: 'aft10', ztz99a2_prototype: 'ztz99a', ztz100_x: 'ztz100', t14: 'object148_proto',
    kf51: 'kf51_evo', kf51b: 'kf51_u', ajax_x: 'ajax', ares_apc_x: 'ares_apc',
    sabra_mk2_x: 'sabra_mk2', merkava3d: 'merkava3_baz', merkava3d_x: 'merkava3d', merkava4_x: 'merkava4',
    m48: 'm48a5_patton', centurion5: 'centurion5_2', ua_t64bv: 't64bv_donbas', ua_t80u_kursk: 't80u_kursk',
    ua_t84_oplot_m: 't84bm_oplot_m', object695_x: 'object695', pt91_twardy: 'pt91a_twardy', bmp3m_dragun125_x: 'bmp3m_dragun125',
    kurganets25_x: 'kurganets25', leo2a7v_x: 'leo2a7v', leo2a6m_x: 'leo2a6m', leo2a4m_x: 'leo2a5m',
    leo2a5_x: 'leo2a5', k2_x: 'k2_black_panther', kf51_x: 'kf51_panther', t90a_x: 't90a',
    t90a_vladimir_x: 't90a_vladimir', t90m_x: 't90m', t90sm_x: 't90sm', t14_x: 't14_armata',
    griffin50_x: 'griffin50mm', kf41_lynx_x: 'kf41_lynx', k21_x: 'k21', leo2a6_x: 'leo2a6',
    k1a1_x: 'k1a1', amx30_x: 'amx30b', t62mv1_x: 't62mv1', t72b_1987_x: 't72b_1987',
    t80u_x: 't80u', leclerc_x: 'leclerc_xlr', leclerc_classic_x: 'amx56', chieftain_mk10_x: 'chieftain_mk10',
    t72b3_x: 't72b3', jpz_e100_x: 'jpz_e100', type10_x: 'type10', type90_x: 'type90',
    amx40_x: 'amx40', strv122_x: 'strv122', t72b3m_x: 't72b3m_2016', challenger1_x: 'challenger1_mk3',
    t72bu_x: 't72bu', chieftain5_x: 'chieftain5', t90_x: 't90', t90a_burlak_x: 't90a_burlak',
    t90ms_x: 't90ms_tagil', m1a2_x: 'm1a2_abrams', m1a2_tusk_x: 'm1a2_abrams_tusk', m1a2_sepv2_x: 'm1a2_abrams_sepv2',
    m1a2_sepv3_x: 'm1a2_abrams_sepv3', ua_m1a1_x: 'ua_m1a2_abrams', spz_puma_s1_x: 'puma_s1', type89_x: 'type89',
    ua_t80u_modern: 't80u_zoria', ua_t72b3m_modern: 't72b3m_hetman', ua_t72b3m_hetman_ii: 't72b3m_hetman_ii', ua_t72b3_modern: 't72b3_sich',
    pl_t80u_modern: 't80u_husarz', pl_t72b3m_modern: 't72b3m_wilk', pl_t72b3_modern: 't72b3_zubr', pl_t72b3_zubr_ii: 't72b3_zubr_ii',
    cn_t80u_modern: 't80u_yun', cn_t72b3m_modern: 't72b3m_kunlun', cn_t72b3_modern: 't72b3_qilin', ru_t80u_modern: 't80u_bars_m',
    ru_t72b3m_modern: 't72b3m_bulat_m', ru_t72b3_modern: 't72b3_bastion_m',
  }),
]);

/** The URL parameter that stamps a link's id schema (`/gallery?id=…&ids=2`). */
export const TANK_ID_SCHEMA_PARAM = 'ids';

export interface TankIdResolver {
  /** The schema this resolver writes. */
  readonly schema: number;
  /** A stamped schema as this build reads it: missing or malformed is 1; newer than this build reads as current. */
  schemaOf(value: unknown): number;
  /** An id written under `schema` (default 1) in this build's spelling. */
  resolve(id: string, schema?: unknown): string;
  /**
   * An id from a source with no stamp that is almost always current (a room
   * seat chosen on this build): current ids pass, a retired id resolves from
   * the last schema that had it.
   */
  resolveIncoming(id: string): string;
  /** True when no vehicle carries this id in the current schema any more. */
  isRetired(id: string): boolean;
  /**
   * The schema-1 spelling of a current id (itself for a vehicle added later).
   * Everything that hashes a vehicle id into its look or its name (decor
   * layout, texture seeds, AUTO camouflage, hull numbers, track shade, bot
   * names) hashes this, so a rename never changes how a vehicle looks.
   */
  originalOf(id: string): string;
  /** `{ tankIdSchema }` to spread into a record this build writes ({} while schema 1, where missing means 1). */
  stamp(): { tankIdSchema?: number };
  /** `ids=N` for a link this build writes ('' while schema 1). */
  linkParam(): string;
}

export function createTankIdResolver({
  schema, renames,
}: { schema: number; renames: readonly Readonly<Record<string, string>>[] }): TankIdResolver {
  if (!Number.isInteger(schema) || schema < 1) throw new RangeError(`tank id schema must be a positive integer: ${schema}`);
  if (renames.length !== schema - 1) {
    throw new RangeError(`tank id schema ${schema} needs ${schema - 1} rename maps, has ${renames.length}`);
  }
  // The last schema each retired id was valid in: an id renamed away by map k
  // and never spelled again by a later map.
  const retiredAt = new Map<string, number>();
  renames.forEach((map, k) => {
    for (const to of Object.values(map)) retiredAt.delete(to);
    for (const from of Object.keys(map)) if (!Object.values(map).includes(from)) retiredAt.set(from, k + 1);
  });
  const schemaOf = (value: unknown): number => {
    const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return 1;
    return Math.min(n, schema);
  };
  const resolve = (id: string, from: unknown = 1): string => {
    let out = String(id);
    for (let s = schemaOf(from); s < schema; s += 1) out = renames[s - 1]![out] ?? out;
    return out;
  };
  const inverses = renames.map((map) => new Map(Object.entries(map).map(([from, to]) => [to, from])));
  const originalOf = (id: string): string => {
    let out = String(id);
    for (let k = inverses.length - 1; k >= 0; k -= 1) out = inverses[k]!.get(out) ?? out;
    return out;
  };
  return Object.freeze({
    schema,
    schemaOf,
    resolve,
    resolveIncoming: (id: string) => (retiredAt.has(id) ? resolve(id, retiredAt.get(id)) : id),
    isRetired: (id: string) => retiredAt.has(id),
    originalOf,
    stamp: () => (schema > 1 ? { tankIdSchema: schema } : {}),
    linkParam: () => (schema > 1 ? `${TANK_ID_SCHEMA_PARAM}=${schema}` : ''),
  });
}

/** This build's resolver over the landed rename maps. */
export const TANK_IDS = createTankIdResolver({ schema: TANK_ID_SCHEMA, renames: TANK_ID_RENAMES });

/** An id written under `schema` (missing = 1) in this build's spelling. */
export function resolveTankId(id: string, schema?: unknown): string {
  return TANK_IDS.resolve(id, schema);
}

/** The id a vehicle's look and name are seeded from: its schema-1 spelling, stable across renames. */
export function tankSeedId(id: string): string {
  return TANK_IDS.originalOf(id);
}
