// src/game/equipment.ts — the Garage's half of the equipment system: the
// picker's categories and contents, the saved loadouts and the stat card. The
// rules — the catalog, the hull gates, the multipliers and the bots' default
// loadouts — live in the DOM-free slice sim/equipmentRules.ts, which the mode
// rulesets, the authority and the rooms Worker read; this module re-exports
// what its readers take from it. PURE data/logic module: no three import, no
// DOM requirement (localStorage is feature-detected), runs under plain node
// (selftest: src/game/equipment.selftest.mjs).
//
// Loadouts persist per spec id in localStorage `cot.equip.<specId>` (same key
// the camo_spotting r1 3-item picker used — old saves stay valid;
// unknown/era-illegal ids are dropped on load and the array is clamped to the
// slot count).

import {
  EQUIPMENT_CATALOG, computeEquipMults, equipIneligibility, sanitizeLoadout,
  type EquipmentCategoryId, type EquipmentIneligibility, type EquipmentItem, type EquipmentSpecLike,
} from '../sim/equipmentRules.ts';

export {
  EQUIP_SLOTS, EQUIPMENT_BY_ID, EQUIPMENT_CATALOG, applyEquipmentToCombat, computeEquipMults, defaultLoadoutFor,
  sanitizeLoadout, type EquipmentItem,
} from '../sim/equipmentRules.ts';

interface EquipmentCategory {
  id: EquipmentCategoryId;
  label: string;
}

interface EquipmentStatsSpec extends EquipmentSpecLike {
  gun: {
    autoloader?: object;
    reloadS: number;
    aimTimeS: number;
  };
  hullTraverseDegS: number;
}

interface ModifiedEquipmentStat {
  base: number;
  mod: number;
}

interface EquipmentModifiedStats {
  reloadS: ModifiedEquipmentStat;
  aimTimeS: ModifiedEquipmentStat;
  traverseDegS: ModifiedEquipmentStat;
}

/** Picker categories in display order. */
export const EQUIP_CATEGORIES: readonly EquipmentCategory[] = [
  { id: 'all', label: 'All' },
  { id: 'fire', label: 'Firepower' },
  { id: 'mobility', label: 'Mobility' },
  { id: 'protection', label: 'Protection' },
  { id: 'survival', label: 'Survivability' },
  { id: 'recon', label: 'Scouting' },
];

/** Why the picker cannot fit an item: the hull's gate (equipIneligibility) or the mode's rules. */
export type EquipmentLock = EquipmentIneligibility | 'mode';

export interface EquipmentPickerItem {
  readonly item: EquipmentItem;
  /** null when the item can be fitted. */
  readonly lock: EquipmentLock | null;
  /** The slot it is fitted in, or -1. */
  readonly fittedSlot: number;
}

interface EquipmentPickerGroup {
  readonly category: EquipmentCategory;
  readonly items: readonly EquipmentPickerItem[];
}

/**
 * The picker's contents for one hull and its loadout: each category in catalog order (the "All" chip is the caller's)
 * with every item, its lock and the slot it sits in. `allows` is the mode's filter, rulesetAllowsEquipment bound to the
 * ruleset the loadout will play (matchRuleset.ts); the Garage, which picks for every mode, passes none. The same gates
 * run at spawn, so a fittable tile here is an item the authority keeps.
 */
export function equipmentPicker(
  spec: EquipmentSpecLike | null | undefined,
  loadout: readonly string[],
  allows?: (id: string) => boolean,
): EquipmentPickerGroup[] {
  return EQUIP_CATEGORIES.filter((category) => category.id !== 'all').map((category) => ({
    category,
    items: EQUIPMENT_CATALOG.filter((item) => item.cat === category.id).map((item) => ({
      item,
      lock: equipIneligibility(item, spec) ?? (allows && !allows(item.id) ? 'mode' : null),
      fittedSlot: loadout.indexOf(item.id),
    })),
  }));
}

const storageKey = (specId: string): string => `cot.equip.${specId}`;
const hasStorage = (): boolean => typeof localStorage !== 'undefined';

/**
 * Per-tank saved loadout (localStorage `cot.equip.<specId>`), sanitized.
 * @param {string} specId
 * @param {?object} [spec] optional spec for era validation
 * @returns {Array<string>} equipped ids (possibly empty)
 */
export function loadEquipment(specId: string, spec?: EquipmentSpecLike | null): string[] {
  if (!hasStorage()) return [];
  try {
    const raw = localStorage.getItem(storageKey(specId));
    if (!raw) return [];
    return sanitizeLoadout(JSON.parse(raw), spec);
  } catch {
    return [];
  }
}

/**
 * Persist a loadout (sanitized; empty array clears the key).
 * @param {string} specId
 * @param {Array<string>} ids
 * @param {?object} [spec]
 * @returns {Array<string>} the sanitized array actually saved
 */
export function saveEquipment(
  specId: string,
  ids: readonly string[],
  spec?: EquipmentSpecLike | null,
): string[] {
  const clean = sanitizeLoadout(ids, spec);
  if (hasStorage()) {
    try {
      if (clean.length) localStorage.setItem(storageKey(specId), JSON.stringify(clean));
      else localStorage.removeItem(storageKey(specId));
    } catch { /* private mode */ }
  }
  return clean;
}

// ---------------------------------------------------------------------------
// Garage stat-card helpers — displayed stats with equipment folded in.
// View/camo math delegates to the spotting table so the card can never
// disagree with the battle sim.
// ---------------------------------------------------------------------------

/**
 * Displayed gun/mobility stats for a spec + loadout. Returns base and
 * modified values so the card can tint changed numbers.
 * @param {object} spec TankSpec
 * @param {?Array<string>} ids equipped ids
 * @returns {{reloadS:{base:number,mod:number}, aimTimeS:{base:number,mod:number},
 *            traverseDegS:{base:number,mod:number}}}
 */
export function equipModifiedStats(
  spec: EquipmentStatsSpec,
  ids: readonly string[] | null | undefined,
): EquipmentModifiedStats {
  const m = computeEquipMults(sanitizeLoadout(ids, spec));
  return {
    reloadS: { base: spec.gun.reloadS, mod: spec.gun.reloadS * m.reload },
    aimTimeS: { base: spec.gun.aimTimeS, mod: spec.gun.aimTimeS * m.aimTime },
    traverseDegS: {
      base: spec.hullTraverseDegS,
      mod: spec.hullTraverseDegS * m.traverse,
    },
  };
}
