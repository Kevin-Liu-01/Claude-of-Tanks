// src/game/consumableLoadout.ts — the Garage's half of the consumables (2026-10-26, the catalog): the loadout saved per
// tank, each slot's view (its item, name keys, glyph, cooldown and charges) for the Garage, the HUD tray and the
// settings, and the picker's contents. The rules (the catalog, the gates, the effects) are sim/consumableRules.ts; the
// cooldowns and charges are the ruleset's (sim/matchRuleset.ts CONSUMABLE_TIMING). PURE: no DOM requirement
// (localStorage is feature-detected), runs under plain node (consumableLoadout.selftest.mjs). Copyright © 2026 Kevin B. Liu.
//
// Loadouts persist per spec id in localStorage `cot.cons.<specId>` as the item in each slot. A tank with nothing saved
// carries the default trio (Field Repair Kit, First Aid Kit, Fire Extinguisher), so every save from before the catalog
// reads the same.

import {
  CONSUMABLE_BY_ID, CONSUMABLE_CATALOG, CONSUMABLE_CATEGORIES, CONSUMABLE_SLOTS, DEFAULT_CONSUMABLE_LOADOUT, consumableLock,
  sanitizeConsumableLoadout,
  type ConsumableCategoryId, type ConsumableGateContext, type ConsumableId, type ConsumableLock, type ConsumableSpecLike,
} from '../sim/consumableRules.ts';
import { consumableTiming, rulesetConsumableGate } from '../sim/matchRuleset.ts';
import type { IconId } from '../ui/icons/icon.ts';

export { CONSUMABLE_SLOTS, DEFAULT_CONSUMABLE_LOADOUT, type ConsumableId } from '../sim/consumableRules.ts';

/** The input actions the slots answer to (game/input.ts; keys 4/5/6, gamepad X/Y/B). */
export const CONSUMABLE_SLOT_ACTIONS = Object.freeze(['consumable1', 'consumable2', 'consumable3'] as const);
export type ConsumableSlotAction = typeof CONSUMABLE_SLOT_ACTIONS[number];
/** The bus event the Garage sends at boot and whenever the shown tank or its loadout changes: `{ specId, items }`, each
 *  slot's view (consumableSlotsView); the settings rows read it. */
export const CONSUMABLE_LOADOUT_EVENT = 'ui:consumableLoadout';
/** The bus event a battle sends as it starts: the player's items within the mode's gate (the HUD tray). */
export const BATTLE_CONSUMABLES_EVENT = 'ui:battleConsumables';

/**
 * Each item's glyph (src/ui/icons/sprite.svg, cs*: a 24-unit master and its 16-unit one), the one source every surface
 * draws: the Garage's slots and picker on the item badge (ui/equipIcons.ts consumableIconSVG), the battle tray, the
 * settings rows, the HUD's alerts and the Field Manual. The old three no longer borrow the shared repair, medkit and
 * extinguisher glyphs (261: "much better icons ... represented uniquely").
 */
export const CONSUMABLE_ICONS: Readonly<Record<ConsumableId, IconId>> = Object.freeze({
  repair: 'csRepair',
  repair_large: 'csRepairLarge',
  track_links: 'csTrackLinks',
  first_aid: 'csFirstAid',
  rations: 'csRations',
  extinguisher: 'csExtinguisher',
  fire_suppression: 'csFireSuppression',
  governor_override: 'csGovernor',
  ammo_restock: 'csAmmoRestock',
  smoke_reload: 'csSmokeReload',
  foliage: 'csFoliage',
  aps_charge: 'csAps',
  ir_jammer: 'csIrJammer',
});

/** The i18n key stem of an item (consumable.<stem>.name / .short / .effect); ids keep their snake case. */
const keyStem = (id: string): string => id.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
export const consumableNameKey = (id: string): string => `consumable.${keyStem(id)}.name`;
export const consumableShortKey = (id: string): string => `consumable.${keyStem(id)}.short`;
export const consumableEffectKey = (id: string): string => `consumable.${keyStem(id)}.effect`;
export const consumableCategoryKey = (id: string): string => `consumable.category.${id}`;
export const consumableLockKey = (lock: ConsumableLock): string => `consumable.lock.${keyStem(lock)}`;

/**
 * The vehicle facts a gate reads: its era, its role, and whether it carries smoke dischargers when the caller knows. This
 * module is on the boot path (the Garage, the room selection), so it never reads the auxiliary inventory, a large
 * generated table: the battle and the authority pass `smoke` from it, and the Garage's picker loads it on first open.
 */
export function consumableSpecFor(
  spec: { readonly era?: string; readonly role?: string } | null | undefined,
  smoke?: boolean,
): ConsumableSpecLike & { readonly role?: string } {
  return { era: spec?.era, role: spec?.role, ...(smoke === undefined ? {} : { smoke }) };
}

/** The Garage's gate: the Standard battle's (finite rounds, every item allowed); a battle reads its mode's. */
const GARAGE_CONSUMABLE_GATE: ConsumableGateContext = Object.freeze({ finiteAmmo: true });

/** A battle's gate: its mode's (sim/matchRuleset.ts rulesetConsumableGate), else the Garage's. */
export function battleConsumableGate(
  ruleset: Parameters<typeof rulesetConsumableGate>[0] | null | undefined,
): ConsumableGateContext {
  return ruleset ? rulesetConsumableGate(ruleset) : GARAGE_CONSUMABLE_GATE;
}

const hasStorage = (): boolean => typeof localStorage !== 'undefined';
const storageKey = (specId: string): string => `cot.cons.${specId}`;

/** A tank's saved loadout (localStorage `cot.cons.<specId>`), sanitized and always filled; the default trio if none. */
export function loadConsumables(
  specId: string,
  spec?: ConsumableSpecLike | null,
  gate: ConsumableGateContext = GARAGE_CONSUMABLE_GATE,
): ConsumableId[] {
  let saved: unknown = null;
  if (hasStorage()) {
    try {
      const raw = localStorage.getItem(storageKey(specId));
      saved = raw ? JSON.parse(raw) : null;
    } catch { saved = null; }
  }
  return sanitizeConsumableLoadout(Array.isArray(saved) ? saved : DEFAULT_CONSUMABLE_LOADOUT, spec, gate);
}

/** Save a loadout (sanitized; the default trio clears the key). Returns what was saved. */
export function saveConsumables(specId: string, ids: readonly string[], spec?: ConsumableSpecLike | null): ConsumableId[] {
  const clean = sanitizeConsumableLoadout(ids, spec, GARAGE_CONSUMABLE_GATE);
  if (hasStorage()) {
    try {
      const isDefault = clean.length === DEFAULT_CONSUMABLE_LOADOUT.length
        && clean.every((id, slot) => id === DEFAULT_CONSUMABLE_LOADOUT[slot]);
      if (isDefault) localStorage.removeItem(storageKey(specId));
      else localStorage.setItem(storageKey(specId), JSON.stringify(clean));
    } catch { /* private mode */ }
  }
  return clean;
}

/** Fit an item into a slot: an item already in another slot swaps with the slot's item. */
export function fitConsumable(items: readonly ConsumableId[], slot: number, id: ConsumableId): ConsumableId[] {
  const next = items.slice();
  const from = next.indexOf(id);
  if (from >= 0 && from !== slot) next[from] = next[slot]!;
  next[slot] = id;
  return next;
}

export interface ConsumableSlotView {
  readonly slot: number;
  readonly action: ConsumableSlotAction;
  readonly itemId: ConsumableId;
  readonly nameKey: string;
  readonly shortKey: string;
  readonly effectKey: string;
  readonly iconId: IconId;
  readonly cooldownS: number;
  /** Uses per life; null is unlimited. */
  readonly charges: number | null;
}

/** Each slot's item and how to show it: the Garage's slot boxes, the HUD tray and the settings rows read this. */
export function consumableSlotsView(items: readonly ConsumableId[]): ConsumableSlotView[] {
  const out: ConsumableSlotView[] = [];
  for (let slot = 0; slot < Math.min(CONSUMABLE_SLOTS, items.length); slot++) {
    const itemId = items[slot]!;
    const timing = consumableTiming(itemId);
    out.push({
      slot, action: CONSUMABLE_SLOT_ACTIONS[slot]!, itemId, nameKey: consumableNameKey(itemId),
      shortKey: consumableShortKey(itemId), effectKey: consumableEffectKey(itemId), iconId: CONSUMABLE_ICONS[itemId],
      cooldownS: timing.cooldownS, charges: timing.charges,
    });
  }
  return out;
}

/** A tank's slots as saved (the settings rows' and the HUD tray's convenience); pass the spec to gate by its era. */
export function consumableSlotsFor(
  specId: string,
  spec?: { readonly id?: string; readonly era?: string; readonly role?: string } | null,
): ConsumableSlotView[] {
  return consumableSlotsView(loadConsumables(specId, spec ? consumableSpecFor(spec) : null));
}

export interface ConsumablePickerItem {
  readonly item: (typeof CONSUMABLE_CATALOG)[number];
  /** Why the tank cannot carry it, or null. */
  readonly lock: ConsumableLock | null;
  /** The slot it is fitted in, or -1. */
  readonly fittedSlot: number;
}

/** The picker's groups: the catalog by category, each item's lock and fitted slot. */
export function consumablePickerGroups(
  items: readonly ConsumableId[],
  spec: ConsumableSpecLike | null | undefined,
  gate: ConsumableGateContext = GARAGE_CONSUMABLE_GATE,
): { readonly category: { readonly id: ConsumableCategoryId }; readonly items: readonly ConsumablePickerItem[] }[] {
  return CONSUMABLE_CATEGORIES.map((id) => ({
    category: { id },
    items: CONSUMABLE_CATALOG.filter((item) => item.category === id).map((item) => ({
      item, lock: consumableLock(item.id, spec, gate), fittedSlot: items.indexOf(item.id),
    })),
  }));
}

/** Whether an id names a catalog item. */
export const isConsumableId = (id: unknown): id is ConsumableId => typeof id === 'string' && CONSUMABLE_BY_ID.has(id);
