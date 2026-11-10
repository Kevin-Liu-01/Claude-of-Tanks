// src/sim/consumableRules.ts — the battle consumables (owner 2026-10-26: "where are my new equipments? still just
// wrrench, medicine, and fire extinguisher, have a much larger variety"): the catalog, the era and hull gates, the
// loadout a crew carries in its three slots, the bots' picks, and every item's effect. Copyright © 2026 Kevin B. Liu.
//
// DOM-free and vehicle-free like equipmentRules.ts: the mode rulesets (matchRuleset.ts CONSUMABLE_TIMING,
// consumableBan) read it, and the rooms Worker reaches the rulesets, so this never imports from src/game or
// src/vehicles. The authority (sim/authoritativeMatch.ts) and the page battle (game/state.ts for bots,
// game/playerBattleActions.ts for the player) apply every item through applyConsumable and tickConsumables, so an item
// does the same thing wherever the battle runs. Cooldowns and charges are the ruleset's (CONSUMABLE_TIMING); this
// module holds what an item does. Catalog and grounding: ~/cot-launch-state/streams/CONSUMABLES-259.md.
//
// EFFECT WIRING MAP — where each effect lands:
//   repair, repair_large, track_links   modules to full HP (damage.ts repairAllModules / repairModules)
//   repair_large (60 s)                 equipMults.repair x1.5: the module self-repair rate (damage.ts)
//   first_aid                           every injured crew member back
//   rations (40 s)                      equipMults.reload x0.95, equipMults.aimTime x0.92 (aimTime is on the wire)
//   extinguisher                        the fire out
//   fire_suppression (45 s armed)       a fire that starts is put out at once (the caller's fire hook)
//   governor_override (10 s)            equipMults.power x1.25 (movement.ts; VIEWER_EQUIPMENT carries it), then a
//                                       one-in-three engine strain from the caller's seeded rng
//   ammo_restock                        every round type refilled by 30 % of its stowage (ammunition.ts)
//   smoke_reload                        one more smoke salvo, up to the kit's three (auxiliarySystems.ts)
//   foliage (60 s)                      CONSUMABLE_FOLIAGE_EQUIPMENT joins the spotting equipment ids (spottingStats.ts)
//   aps_charge (20 s armed)             the next guided missile or HEAT round from the front arc is intercepted
//   ir_jammer (12 s)                    a missile steered at this tank flies unguided (the caller's guidance hook)
// Each equipMults key an item bends is the product of named layers (MultiplierLayers below): the equipment's own value,
// the mode's stamps and the items', composed by one function (audit M5).

import * as detMath from './detMath.ts';
import { isPostwarVehicleEra } from './vehicleEras.ts';

export type ConsumableId = 'repair' | 'repair_large' | 'track_links' | 'first_aid' | 'rations' | 'extinguisher'
  | 'fire_suppression' | 'governor_override' | 'ammo_restock' | 'smoke_reload' | 'foliage' | 'aps_charge' | 'ir_jammer';
export type ConsumableCategoryId = 'repair' | 'crew' | 'fire' | 'mobility' | 'ammunition' | 'protection';
/** 'all': every era; 'postwar': Cold War and later; 'modern': modern and next-generation vehicles. */
type ConsumableEra = 'all' | 'postwar' | 'modern';
/** What a vehicle or a mode must have for an item to be carried: smoke dischargers, or finite ammunition. */
export type ConsumableNeed = 'smoke' | 'finiteAmmo';
export type ConsumableLock = 'unknown' | 'era' | ConsumableNeed | 'mode';

export interface ConsumableItem {
  readonly id: ConsumableId;
  readonly category: ConsumableCategoryId;
  readonly era: ConsumableEra;
  readonly needs?: readonly ConsumableNeed[];
  /** Seconds a timed item stays active (or armed); absent for an instant item. */
  readonly durationS?: number;
}

/** The slots a crew fills (keys 4/5/6, the input actions consumable1..3). */
export const CONSUMABLE_SLOTS = 3;
/** The loadout every tank carried before the catalog grew, and the one a crew that chose nothing still carries. */
export const DEFAULT_CONSUMABLE_LOADOUT: readonly ConsumableId[] = Object.freeze(['repair', 'first_aid', 'extinguisher']);

export const CONSUMABLE_CATALOG: readonly ConsumableItem[] = Object.freeze([
  { id: 'repair', category: 'repair', era: 'all' },
  { id: 'repair_large', category: 'repair', era: 'all', durationS: 60 },
  { id: 'track_links', category: 'repair', era: 'all' },
  { id: 'first_aid', category: 'crew', era: 'all' },
  { id: 'rations', category: 'crew', era: 'all', durationS: 40 },
  { id: 'extinguisher', category: 'fire', era: 'all' },
  { id: 'fire_suppression', category: 'fire', era: 'postwar', durationS: 45 },
  { id: 'governor_override', category: 'mobility', era: 'all', durationS: 10 },
  { id: 'ammo_restock', category: 'ammunition', era: 'all', needs: ['finiteAmmo'] },
  { id: 'smoke_reload', category: 'ammunition', era: 'all', needs: ['smoke'] },
  { id: 'foliage', category: 'protection', era: 'all', durationS: 60 },
  { id: 'aps_charge', category: 'protection', era: 'modern', durationS: 20 },
  { id: 'ir_jammer', category: 'protection', era: 'modern', durationS: 12 },
].map((item) => Object.freeze(item as ConsumableItem)));

export const CONSUMABLE_BY_ID: ReadonlyMap<string, ConsumableItem> = new Map(CONSUMABLE_CATALOG.map((item) => [item.id, item]));
export const CONSUMABLE_CATEGORIES: readonly ConsumableCategoryId[] =
  Object.freeze(['repair', 'crew', 'fire', 'mobility', 'ammunition', 'protection']);

// Effect sizes (CONSUMABLES-259.md).
export const RATIONS_RELOAD_MULT = 0.95;
export const RATIONS_AIM_MULT = 0.92;
export const LARGE_REPAIR_RATE_MULT = 1.5;
export const GOVERNOR_POWER_MULT = 1.25;
/** The chance the engine is strained when an override ends (the caller's seeded rng decides). */
export const GOVERNOR_ENGINE_RISK = 1 / 3;
/** The engine's HP share after a strain: under the module's yellow line, so it reads and drives damaged. */
export const GOVERNOR_STRAIN_HP_FRACTION = 0.45;
export const RESTOCK_CAPACITY_FRACTION = 0.3;
export const SMOKE_SALVO_MAX = 3;
/** The spotting equipment id Fresh Foliage adds while it is active (spottingStats.ts EQUIPMENT). */
export const CONSUMABLE_FOLIAGE_EQUIPMENT = 'cs_foliage';
/** An APS charge meets a round inside this front arc (degrees, centred on the hull's nose). */
export const APS_ARC_DEG = 120;
/** The interceptor meets the round this far off the face it was meant for (metres, along that face's normal). */
export const APS_BURST_OFFSET_M = 2;
/** A missile is "steered at" a jamming tank when its steering point lies this close to the tank (metres, plan). */
export const JAMMER_RADIUS_M = 8;

/** What a gate needs to know about a vehicle (the caller resolves capabilities; this module reads no fleet). */
export interface ConsumableSpecLike {
  readonly era?: string;
  /**
   * The vehicle carries smoke grenade dischargers (auxiliaryInventory.ts). Absent: not known here (the boot code keeps
   * the large inventory table out), and the smoke gate waits for the battle and the authority, which always pass it.
   */
  readonly smoke?: boolean;
}
export interface ConsumableGateContext {
  /** The mode's rounds run out (matchRuleset ammo is not 'unlimited'). */
  readonly finiteAmmo: boolean;
  /** The mode refuses the item (matchRuleset rulesetAllowsConsumable); absent allows everything. */
  readonly allows?: (id: string) => boolean;
}

/** Why a vehicle in a mode cannot carry an item, or null when it can. */
export function consumableLock(id: string, spec: ConsumableSpecLike | null | undefined, gate: ConsumableGateContext): ConsumableLock | null {
  const item = CONSUMABLE_BY_ID.get(id);
  if (!item) return 'unknown';
  if (gate.allows && !gate.allows(id)) return 'mode';
  // no vehicle named (a settings row, a preview): nothing to gate on; every battle and Garage passes the vehicle
  if (!spec) return null;
  const era = spec.era;
  if (item.era === 'postwar' && !isPostwarVehicleEra(era)) return 'era';
  if (item.era === 'modern' && era !== 'modern' && era !== 'next-generation') return 'era';
  for (const need of item.needs ?? []) {
    if (need === 'smoke' && spec.smoke === false) return 'smoke';
    if (need === 'finiteAmmo' && !gate.finiteAmmo) return 'finiteAmmo';
  }
  return null;
}

/**
 * The loadout a crew carries: its chosen items in slot order, unknown, refused and repeated ids dropped, then every
 * empty slot filled from the default trio (and, past it, the catalog) with an item the vehicle may carry. Always
 * CONSUMABLE_SLOTS long when the catalog allows it, so every key does something.
 */
export function sanitizeConsumableLoadout(
  ids: readonly (string | null | undefined)[] | null | undefined,
  spec: ConsumableSpecLike | null | undefined,
  gate: ConsumableGateContext,
): ConsumableId[] {
  const out: (ConsumableId | null)[] = new Array(CONSUMABLE_SLOTS).fill(null);
  const taken = new Set<string>();
  for (let slot = 0; slot < CONSUMABLE_SLOTS; slot++) {
    const id = Array.isArray(ids) ? String(ids[slot] ?? '') : '';
    if (!id || taken.has(id) || consumableLock(id, spec, gate)) continue;
    out[slot] = id as ConsumableId;
    taken.add(id);
  }
  const fill = [...DEFAULT_CONSUMABLE_LOADOUT, ...CONSUMABLE_CATALOG.map((item) => item.id)];
  for (let slot = 0; slot < CONSUMABLE_SLOTS; slot++) {
    if (out[slot]) continue;
    const next = fill.find((id) => !taken.has(id) && !consumableLock(id, spec, gate));
    if (!next) continue;
    out[slot] = next;
    taken.add(next);
  }
  return out.filter((id): id is ConsumableId => !!id);
}

/** The bots' loadouts by role: every one keeps a repair and a fire kit (Automatic Fire Suppression puts out a fire that
 *  burns as it discharges), with the role's own third: the light's track links, the TD's foliage, the IFV's smoke. */
const BOT_LOADOUTS: Readonly<Record<string, readonly ConsumableId[]>> = Object.freeze({
  heavy: ['repair_large', 'first_aid', 'fire_suppression'],
  mbt: ['repair', 'first_aid', 'fire_suppression'],
  medium: ['repair', 'first_aid', 'extinguisher'],
  light: ['track_links', 'first_aid', 'extinguisher'],
  td: ['repair', 'foliage', 'extinguisher'],
  ifv: ['repair', 'smoke_reload', 'extinguisher'],
});
/** A modern heavy takes an APS charge in place of its first aid, a modern IFV an IR jammer in place of its smoke. */
const BOT_MODERN_SWAP: Readonly<Record<string, readonly [number, ConsumableId]>> = Object.freeze({
  heavy: [1, 'aps_charge'], ifv: [1, 'ir_jammer'],
});
/** A next-generation MBT is built around its APS (Afganit, StrikeShield, Trophy): it takes the charge in place of its
 *  first aid; a modern MBT keeps the crew's kit. */
const BOT_NEXT_GENERATION_SWAP: Readonly<Record<string, readonly [number, ConsumableId]>> = Object.freeze({
  mbt: [1, 'aps_charge'],
});

/** A bot's loadout: its role's picks (with its era's swap where the vehicle may carry it), then sanitized. */
export function botConsumableLoadout(
  spec: ConsumableSpecLike & { readonly role?: string } | null | undefined,
  gate: ConsumableGateContext,
): ConsumableId[] {
  const role = String(spec?.role || 'mbt');
  const picks = [...(BOT_LOADOUTS[role] ?? BOT_LOADOUTS.mbt!)];
  const swap = (spec?.era === 'next-generation' ? BOT_NEXT_GENERATION_SWAP[role] : undefined) ?? BOT_MODERN_SWAP[role];
  if (swap && !consumableLock(swap[1], spec, gate)) picks[swap[0]] = swap[1];
  return sanitizeConsumableLoadout(picks, spec, gate);
}

// ---------------------------------------------------------------------------
// Runtime: one crew's consumables for one life.
// ---------------------------------------------------------------------------

export interface ConsumableTiming {
  readonly cooldownS: number;
  /** Uses per life; null is unlimited. */
  readonly charges: number | null;
}

/** The multipliers an item may bend (combat.equipMults keys); `power` is the engine's. */
type ConsumableMultKey = 'reload' | 'aimTime' | 'repair' | 'power';
const MULT_KEYS: readonly ConsumableMultKey[] = Object.freeze(['reload', 'aimTime', 'repair', 'power']);

/**
 * The named layers a combat state's equipMults key is the product of (audit M5, 2026-11-02). A key any layer writes is
 * written by composeMultiplier alone, from:
 *   equipment    the life's own value: what applyEquipmentToCombat and the ruleset's reload fold (applyRulesetToCombat)
 *                left in equipMults, read when a layer first touches the key, and again whenever another hand changed it.
 *                The fold is recorded on the state (rulesetReload) and a re-equip folds it into its new object, so this
 *                layer is the kit times the fold whichever ran last (round 3 B7 review)
 *   mode         the mode's stamps, one factor per source and key (the Juggernaut boss's reload, the wave hostiles',
 *                the infected's, the AC-130 convoy's): setting a source again replaces its factor, so a stamp needs no
 *                "already applied" latch
 *   consumables  the active items' factors (applyConsumableMultipliers)
 * Before, the consumables rebuilt equipMults from a snapshot taken when their state was made, and a mode stamp
 * multiplied in afterwards was lost at the first timed item's use or end (the boss's x0.5 reload, for good).
 * The layers live and die with the combat state: a revive's fresh state starts its own.
 *
 * The equipment layer takes the equipment writers' word in any order (round 2 U10, 2026-11-04). They write equipMults
 * directly and know nothing of the layers; the drivers happen to run both on a fresh combat state before any layer
 * exists, and the layers relied on that order: a ruleset fold or a re-equip after the layers existed was overwritten
 * at the next item's use or end. Now the layers remember the equipMults object they read (`source`) and the value they
 * last composed for each key (`composed`). A replaced object (applyEquipmentToCombat on a live state: a re-equip) is a
 * new equipment layer, read afresh; a key whose value changed since the last composition (the ruleset's reload fold)
 * folds that change into the equipment layer. The mode and item layers are kept on both. The re-equip hands its new
 * object over at once (reseatEquipmentLayer, round 3 B7), so no composed key waits for the next item or stamp.
 */
export interface MultiplierLayers {
  readonly equipment: Record<string, number>;
  readonly mode: Record<string, Record<string, number>>;
  readonly consumables: Record<string, number>;
  /** The equipMults object the equipment layer was read from. */
  source: Record<string, unknown> | null;
  /** What composeMultiplier last wrote for each key. */
  readonly composed: Record<string, number>;
}
/** A combat state as the layers see it (damage.ts CombatState and the mode controller's entities are structurally one). */
export interface LayeredCombat {
  equipMults?: Record<string, unknown>;
  multiplierLayers?: MultiplierLayers;
}

function multiplierLayers(combat: LayeredCombat): MultiplierLayers {
  return combat.multiplierLayers ??= { equipment: {}, mode: {}, consumables: {}, source: null, composed: {} };
}

/**
 * The equipment layer's value of `key`: taken from equipMults the first time a layer touches it, read afresh from a
 * replaced equipMults object (a re-equip), and with any change another hand made since the last composition folded in
 * (the ruleset's reload fold after the layers exist; MultiplierLayers).
 */
function equipmentFactor(combat: LayeredCombat, layers: MultiplierLayers, key: string): number {
  const mults = combat.equipMults;
  if (mults && layers.source !== mults) {
    if (layers.source) {
      for (const name in layers.equipment) delete layers.equipment[name];
      for (const name in layers.composed) delete layers.composed[name];
    }
    layers.source = mults;
  }
  const current = mults?.[key];
  const value = typeof current === 'number' && Number.isFinite(current) ? current : 1;
  const known = layers.equipment[key];
  if (known === undefined) return layers.equipment[key] = value;
  const composed = layers.composed[key];
  if (composed === undefined || composed === value) return known;
  return layers.equipment[key] = composed !== 0 ? known * (value / composed) : value;
}

/** The one writer of a layered equipMults key: equipment x every mode source x the consumables. */
export function composeMultiplier(combat: LayeredCombat, key: string): number {
  const layers = multiplierLayers(combat);
  let value = equipmentFactor(combat, layers, key);
  for (const source in layers.mode) {
    const factor = layers.mode[source]![key];
    if (factor !== undefined) value *= factor;
  }
  const item = layers.consumables[key];
  if (item !== undefined) value *= item;
  const mults = combat.equipMults ??= {};
  mults[key] = value;
  layers.source = mults;
  layers.composed[key] = value;
  return value;
}

/**
 * A re-equip's hand-over to the layers (round 3 B7, 2026-11-06): applyEquipmentToCombat calls this right after it
 * replaced equipMults on a combat state. The new object is the equipment layer (equipmentFactor reads it afresh) and
 * every key a layer bends is composed again at once, the mode's stamps and the active items on the new equipment.
 * Before, the replaced object was noticed only at the next composition, so until the next item's use or end or the
 * next stamp equipMults held the bare equipment (a Juggernaut boss re-equipped live reloaded at 1x, not x0.5). A state
 * no layer has touched, or one whose equipMults is still the object the layers read, has nothing to recompose. The
 * ruleset's reload fold reaches the new object before this runs: applyRulesetToCombat records it (rulesetReload) and
 * applyEquipmentToCombat folds the record into the kit it writes, so the equipment layer read here is the kit times the
 * fold (before, a Mars tank re-equipped live kept its new kit but lost the ruleset's x0.9 for the rest of its life). A
 * fold applied after the layers exist multiplies the composed value in place, and equipmentFactor folds that change in.
 */
export function reseatEquipmentLayer(combat: { equipMults?: object; multiplierLayers?: MultiplierLayers }): void {
  const layers = combat.multiplierLayers;
  if (!layers || !combat.equipMults || layers.source === combat.equipMults) return;
  const keys = Object.keys(layers.composed);
  for (const source in layers.mode) for (const key in layers.mode[source]) if (!keys.includes(key)) keys.push(key);
  for (const key in layers.consumables) if (!keys.includes(key)) keys.push(key);
  for (const key of keys) composeMultiplier(combat as LayeredCombat, key);
}

/** A mode's stamp: `source`'s factor on `key` (replacing that source's last one), composed into equipMults. */
export function setModeMultiplier(combat: LayeredCombat, source: string, key: string, factor: number): void {
  (multiplierLayers(combat).mode[source] ??= {})[key] = factor;
  composeMultiplier(combat, key);
}

export interface ConsumableState {
  /** The item in each slot. */
  readonly items: ConsumableId[];
  /** Sim second each slot is ready again. */
  readonly readyAt: number[];
  /** Uses left in each slot this life; null is unlimited. */
  readonly charges: (number | null)[];
  /** Sim second each timed item ends (0 = inactive), by item. */
  readonly until: Record<ConsumableId, number>;
  /** The equipment layer's multipliers as these consumables were made (MultiplierLayers: before any mode stamp or item
   *  bent them). A record of that moment, read by no rule: a later re-equip changes the layer, not this. */
  readonly base: Record<ConsumableMultKey, number>;
  /** The spotting equipment ids with Fresh Foliage's, kept so a spotting pass allocates nothing. */
  readonly spotIds: string[];
  /** The equipment array spotIds was built from: consumableSpottingIds rebuilds spotIds in place when it is handed
   *  another one (a live re-equip; round 3 B7 review), so Fresh Foliage never reports a kit the crew no longer has. */
  spotSource: readonly string[] | null;
}

/** The parts of a combat state the effects read and write (damage.ts CombatState is structurally one). */
export interface ConsumableCombat {
  crew: Record<string, boolean>;
  fire: { burning: boolean; ticksLeft: number; tickTimer: number };
  equipMults?: Record<string, unknown>;
  multiplierLayers?: MultiplierLayers;
  equip?: readonly string[];
  ammo?: number[];
  ammoCapacity?: number[];
  destroyed?: boolean;
}

/** The caller's side of an effect: module repair, ammunition, smoke, and the events a use emits. */
export interface ConsumableHost {
  readonly timeS: number;
  /** Repairs every damaged module and returns the ones repaired (damage.ts repairAllModules). */
  repairAll(): readonly string[];
  /** Repairs the named modules and returns the ones repaired (damage.ts repairModules). */
  repair(names: readonly string[]): readonly string[];
  /** Refills ammunition by a share of its stowage and returns the rounds added (ammunition.ts replenishAmmunition). */
  restock(fraction: number): number;
  /** The smoke kit's salvo state, or null when the vehicle has no dischargers. */
  readonly smoke: { smokeCharges: number } | null;
  moduleRepaired(name: string): void;
  fireOut(): void;
}

export function createConsumableState(
  items: readonly ConsumableId[],
  timing: (id: ConsumableId) => ConsumableTiming,
  combat: ConsumableCombat,
): ConsumableState {
  const until = {} as Record<ConsumableId, number>;
  for (const item of CONSUMABLE_CATALOG) until[item.id] = 0;
  const layers = multiplierLayers(combat);
  const base = {} as Record<ConsumableMultKey, number>;
  for (const key of MULT_KEYS) base[key] = equipmentFactor(combat, layers, key);
  const state: ConsumableState = {
    items: items.slice(),
    readyAt: items.map(() => 0),
    charges: items.map((id) => timing(id).charges),
    until,
    base,
    spotIds: [...(combat.equip ?? []), CONSUMABLE_FOLIAGE_EQUIPMENT],
    spotSource: combat.equip ?? null,
  };
  applyConsumableMultipliers(state, combat, 0);
  return state;
}

/** Whether a timed item is active at a sim second. */
export function consumableActive(state: ConsumableState | null | undefined, id: ConsumableId, timeS: number): boolean {
  return !!state && state.until[id] > timeS;
}

/** The consumables layer from the items active at `timeS`, composed with the equipment and mode layers. */
export function applyConsumableMultipliers(state: ConsumableState, combat: ConsumableCombat, timeS: number): void {
  const items = multiplierLayers(combat).consumables;
  const rations = consumableActive(state, 'rations', timeS);
  items.reload = rations ? RATIONS_RELOAD_MULT : 1;
  items.aimTime = rations ? RATIONS_AIM_MULT : 1;
  items.repair = consumableActive(state, 'repair_large', timeS) ? LARGE_REPAIR_RATE_MULT : 1;
  items.power = consumableActive(state, 'governor_override', timeS) ? GOVERNOR_POWER_MULT : 1;
  for (const key of MULT_KEYS) composeMultiplier(combat, key);
}

/**
 * The ids the spotting system reads for a crew: its equipment, with Fresh Foliage's while it is active. The foliage list
 * is the `equip` handed in plus Foliage's id, rebuilt in place when that array is not the one it was built from (a live
 * re-equip replaces combat.equip; round 3 B7 review): before, it kept the kit the consumables were made with for the
 * rest of the life. Reusing the array keeps a spotting pass free of allocation.
 */
export function consumableSpottingIds(
  state: ConsumableState | null | undefined,
  equip: readonly string[] | null | undefined,
  timeS: number,
): readonly string[] | null {
  if (!state || !consumableActive(state, 'foliage', timeS)) return equip ?? null;
  const source = equip ?? null;
  if (state.spotSource !== source) {
    const ids = state.spotIds;
    ids.length = 0;
    if (source) for (const id of source) ids.push(id);
    ids.push(CONSUMABLE_FOLIAGE_EQUIPMENT);
    state.spotSource = source;
  }
  return state.spotIds;
}

type ConsumableUse =
  | { readonly ok: true; readonly item: ConsumableId; readonly cooldownS: number; readonly readyAt: number; readonly charges: number | null }
  | { readonly ok: false; readonly item: ConsumableId | null; readonly reason: 'COOLDOWN' | 'NOTHING' | 'EMPTY'; readonly remainingS?: number };

/**
 * Use the item in a slot. A slot on cooldown or out of charges refuses; an item with nothing to do (no damaged module,
 * no fire, full ammunition) refuses free of cooldown and charge, as the kits always have.
 */
export function useConsumableSlot(
  state: ConsumableState,
  slot: number,
  combat: ConsumableCombat,
  host: ConsumableHost,
  timing: (id: ConsumableId) => ConsumableTiming,
): ConsumableUse {
  const item = state.items[slot];
  if (!item || combat.destroyed) return { ok: false, item: item ?? null, reason: 'NOTHING' };
  const remainingS = Math.max(0, state.readyAt[slot]! - host.timeS);
  if (remainingS > 0) return { ok: false, item, reason: 'COOLDOWN', remainingS };
  const left = state.charges[slot];
  if (left !== null && left !== undefined && left <= 0) return { ok: false, item, reason: 'EMPTY' };
  if (!applyConsumable(state, item, combat, host)) return { ok: false, item, reason: 'NOTHING' };
  const { cooldownS } = timing(item);
  state.readyAt[slot] = host.timeS + cooldownS;
  if (left !== null && left !== undefined) state.charges[slot] = left - 1;
  return { ok: true, item, cooldownS, readyAt: state.readyAt[slot]!, charges: state.charges[slot] ?? null };
}

/** One item's effect; false when it had nothing to do. */
export function applyConsumable(state: ConsumableState, id: ConsumableId, combat: ConsumableCombat, host: ConsumableHost): boolean {
  const item = CONSUMABLE_BY_ID.get(id);
  if (!item) return false;
  const timeS = host.timeS;
  switch (id) {
    case 'repair': {
      const fixed = host.repairAll();
      for (const name of fixed) host.moduleRepaired(name);
      return fixed.length > 0;
    }
    case 'repair_large': {
      const fixed = host.repairAll();
      for (const name of fixed) host.moduleRepaired(name);
      if (!fixed.length) return false;
      break;
    }
    case 'track_links': {
      const fixed = host.repair(['trackL', 'trackR']);
      for (const name of fixed) host.moduleRepaired(name);
      return fixed.length > 0;
    }
    case 'first_aid': {
      let used = false;
      for (const crew of Object.keys(combat.crew)) {
        if (combat.crew[crew] !== false) continue;
        combat.crew[crew] = true;
        used = true;
      }
      return used;
    }
    case 'extinguisher': {
      if (!combat.fire.burning) return false;
      putOutFire(combat);
      host.fireOut();
      return true;
    }
    case 'fire_suppression': {
      // armed now; a fire already burning goes out with the discharge
      if (combat.fire.burning) { putOutFire(combat); host.fireOut(); }
      break;
    }
    case 'ammo_restock':
      return host.restock(RESTOCK_CAPACITY_FRACTION) > 0;
    case 'smoke_reload': {
      const smoke = host.smoke;
      if (!smoke || smoke.smokeCharges >= SMOKE_SALVO_MAX) return false;
      smoke.smokeCharges = Math.min(SMOKE_SALVO_MAX, smoke.smokeCharges + 1);
      return true;
    }
    case 'rations': case 'governor_override': case 'foliage': case 'aps_charge': case 'ir_jammer':
      if (state.until[id] > timeS) return false;
      break;
  }
  if (item.durationS) state.until[id] = timeS + item.durationS;
  applyConsumableMultipliers(state, combat, timeS);
  return true;
}

function putOutFire(combat: ConsumableCombat): void {
  combat.fire.burning = false;
  combat.fire.ticksLeft = 0;
  combat.fire.tickTimer = 0;
}

/**
 * Advance one crew's timed items: an item that ended drops its multipliers, and a Governor Override that ended strains
 * the engine one time in three (`rng`, the battle's seeded stream; `strainEngine` does it and says whether the engine
 * changed). True when the engine was strained, so the caller emits its state. Allocation-free.
 */
export function tickConsumables<C extends ConsumableCombat>(
  state: ConsumableState,
  combat: C,
  timeS: number,
  rng: () => number,
  strainEngine: (combat: C) => boolean,
): boolean {
  let changed = false;
  let strained = false;
  for (const item of CONSUMABLE_CATALOG) {
    const end = state.until[item.id];
    if (!end || end > timeS) continue;
    state.until[item.id] = 0;
    changed = true;
    if (item.id === 'governor_override' && !combat.destroyed && rng() < GOVERNOR_ENGINE_RISK) strained = strainEngine(combat);
  }
  if (changed) applyConsumableMultipliers(state, combat, timeS);
  return strained;
}

/** A fire that started on a crew with Automatic Fire Suppression armed goes out at once; true when it did. */
export function suppressNewFire(state: ConsumableState | null | undefined, combat: ConsumableCombat, timeS: number): boolean {
  if (!combat.fire.burning || !consumableActive(state, 'fire_suppression', timeS)) return false;
  putOutFire(combat);
  return true;
}

/**
 * An APS charge meets an incoming round: a guided missile or a HEAT round arriving inside the front arc of the hull
 * (`yaw`, the hull's heading; `fromX/fromZ`, the round's direction of travel) while armed. The charge is spent.
 */
export function apsIntercepts(
  state: ConsumableState | null | undefined,
  timeS: number,
  round: { readonly guided?: boolean; readonly type?: string },
  hullYaw: number,
  travelX: number,
  travelZ: number,
): boolean {
  if (!state || !consumableActive(state, 'aps_charge', timeS)) return false;
  if (!round.guided && round.type !== 'HEAT') return false;
  const len = detMath.hypot(travelX, travelZ);
  if (!(len > 1e-6)) return false;
  // the round arrives from the direction opposite its travel; the hull's nose points along (sin yaw, cos yaw)
  const fromX = -travelX / len, fromZ = -travelZ / len;
  const cos = fromX * detMath.sin(hullYaw) + fromZ * detMath.cos(hullYaw);
  if (cos < detMath.cos((APS_ARC_DEG / 2) * Math.PI / 180)) return false;
  state.until.aps_charge = 0;
  return true;
}

/** Whether a missile steered at a point is jammed: a tank with its IR Jammer on stands within JAMMER_RADIUS_M of it. */
export function jammerCovers(
  state: ConsumableState | null | undefined,
  timeS: number,
  tankX: number,
  tankZ: number,
  aimX: number,
  aimZ: number,
): boolean {
  if (!state || !consumableActive(state, 'ir_jammer', timeS)) return false;
  const dx = aimX - tankX, dz = aimZ - tankZ;
  return dx * dx + dz * dz <= JAMMER_RADIUS_M * JAMMER_RADIUS_M;
}
