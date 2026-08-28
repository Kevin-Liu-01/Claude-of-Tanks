// Canonical garage order for related native vehicle families.
//
// Registration is intentionally distributed across the modern packs and the
// recovered-spec waves, so append order is an implementation detail rather
// than a useful player-facing lineage.  Keep each family contiguous and sort
// its members by historical/design progression after every pack has loaded.
// This changes no builder or gameplay spec; it only normalizes ALL_TANK_IDS.

import { ALL_TANK_IDS } from './specs.js';

export const NATIVE_VARIANT_FAMILIES = Object.freeze({
  t72: Object.freeze([
    // The base T-72B3 was explicitly delisted and has no active comparison
    // oracle. Keep only battle-playable members in this progression.
    't72b_1987', 't72b3m', 't72bu', 'pt91m',
  ]),
  t80: Object.freeze([
    't80', 't80b', 't80bv', 't80u', 't84',
  ]),
  t90: Object.freeze([
    't90', 't90a', 't90a_vladimir', 't90a_burlak', 't90sm', 't90m', 't90ms', 't90m_proryv',
  ]),
} as const);

export const NATIVE_FAMILY_ORDER = Object.freeze({
  sheridan: Object.freeze([
    'm551_sheridan', 'm551a1_tts',
  ]),
  soviet_modern_mbt: Object.freeze([
    't62mv1', 't64bv1',
    ...NATIVE_VARIANT_FAMILIES.t72,
    ...NATIVE_VARIANT_FAMILIES.t80,
    ...NATIVE_VARIANT_FAMILIES.t90,
  ]),
  leopard: Object.freeze([
    'leo1a5', 'leopard2_proto', 'leo2a4', 'leo2a4_otco', 'leo2a4m',
    'leo2a5', 'leo2a6', 'leo2a6m',
    'leo2_revolution', 'leo2a7v',
  ]),
  challenger: Object.freeze([
    'chieftain5', 'chieftain_mk10', 'challenger1', 'fv4034', 'challenger2',
    'challenger2e', 'ua_challenger2', 'challenger_3',
  ]),
  japan_mbt: Object.freeze([
    'stb1', 'type74', 'type90', 'type90a', 'type10', 'type10b',
  ]),
  italy: Object.freeze([
    'carro45t', 'ariete', 'ariete_c1', 'ariete_c2',
  ]),
  ukraine: Object.freeze([
    'ua_t64bv', 'ua_t80bv', 'ua_t80u_kursk', 'ua_t84_oplot_m', 'ua_m1a1', 'leo2a6_ua',
  ]),
  china: Object.freeze([
    'type59', 'ztz85_iii', 'type99a', 'ztz99a2',
  ]),
  sweden: Object.freeze([
    'strv81', 'udes03', 'strv103a', 'strv103', 'strv122',
  ]),
  poland: Object.freeze([
    't72m1_jaguar', 'pt91_twardy', 'pl01',
  ]),
} as const);

export function applyNativeFamilyOrder(ids: string[] = ALL_TANK_IDS): string[] {
  for (const family of Object.values(NATIVE_FAMILY_ORDER)) {
    const present = family.filter((id) => ids.includes(id));
    if (present.length < 2) continue;
    const familySet = new Set(present);
    const first = ids.findIndex((id) => familySet.has(id));
    const rest = ids.filter((id) => !familySet.has(id));
    rest.splice(first, 0, ...present);
    ids.splice(0, ids.length, ...rest);
  }
  return ids;
}
