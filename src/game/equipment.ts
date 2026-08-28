// src/game/equipment.ts — WoT-style equipment catalog + loadout logic.
// PURE data/logic module: no three import, no DOM requirement (localStorage
// is feature-detected), runs under plain node (selftest:
// src/game/equipment.selftest.mjs).
//
// Every tank carries EQUIP_SLOTS equipment slots, persisted per spec id in
// localStorage `cot.equip.<specId>` (same key the camo_spotting r1 3-item
// picker used — old saves stay valid; unknown/era-illegal ids are dropped on
// load and the array is clamped to the slot count).
//
// EFFECT WIRING MAP — which effects are REAL (wired into the live sim):
//   reload      × on reload time        sim/damage.js startReload
//   aimTime     × on aim-settle tau     sim/movement.js readDebuffs
//   bloom       × on movement-bloom     sim/movement.js (dispersion excess
//                 excess                 while moving/rotating)
//   traverse    × on hull traverse      sim/movement.js readDebuffs
//   turret      × on turret traverse    sim/movement.js readDebuffs
//   repair      × on auto-repair RATE   sim/damage.js tickModuleRepairs
//   heSplash    × on HE splash dmg IN   sim/damage.js (non-pen HE burst +
//                                        blast-sphere splash; full HE pens
//                                        are NOT reduced — WoT parity)
//   crewHe      × on HE crew-hit odds   sim/damage.js rollCrewHit
//   engineFire  × on fire IGNITE odds   sim/damage.js applyModuleDamage
//   fireTicks   × on fire duration      sim/damage.js applyModuleDamage
//   extinguish  × on self-extinguish    sim/damage.js tickFire
//   moduleHp    × per-module max HP     applyEquipmentToCombat (below)
//   view/viewStill/camo/camoStill       sim/spotting.js EQUIPMENT table
//                                        (same ids — spotting owns vision)
// Nothing in the catalog is cosmetic-only.


import { isPostwarVehicleEra } from '../vehicles/taxonomy.js';

export type EquipmentEra = 'all' | 'modern';
export type EquipmentCategoryId = 'all' | 'fire' | 'recon' | 'mobility' | 'survival';
export type EquipmentModuleId = 'trackL' | 'trackR' | 'ammoRack' | 'fuelTank';

export interface EquipmentEffects {
  reload?: number;
  aimTime?: number;
  bloom?: number;
  traverse?: number;
  turret?: number;
  repair?: number;
  heSplash?: number;
  crewHe?: number;
  engineFire?: number;
  fireTicks?: number;
  extinguish?: number;
  moduleHp?: Partial<Record<EquipmentModuleId, number>>;
}

export interface EquipmentItem {
  id: string;
  name: string;
  short: string;
  cat: Exclude<EquipmentCategoryId, 'all'>;
  era: EquipmentEra;
  desc: string;
  effects: EquipmentEffects;
  spot?: boolean;
}

export interface EquipmentCategory {
  id: EquipmentCategoryId;
  label: string;
}

export interface EquipmentSpecLike {
  era?: unknown;
  role?: string;
  gun?: {
    autoloader?: unknown;
  };
}

export interface EquipmentStatsSpec extends EquipmentSpecLike {
  gun: {
    autoloader?: unknown;
    reloadS: number;
    aimTimeS: number;
  };
  hullTraverseDegS: number;
}

export interface EquipmentMultipliers {
  reload: number;
  aimTime: number;
  bloom: number;
  traverse: number;
  turret: number;
  repair: number;
  heSplash: number;
  crewHe: number;
  engineFire: number;
  fireTicks: number;
  extinguish: number;
  moduleHp: Partial<Record<EquipmentModuleId, number>>;
}

export interface EquipmentCombatState {
  equip?: string[];
  equipMults?: EquipmentMultipliers;
  modules?: Record<string, {
    maxHp: number;
    hp: number;
  }>;
}

export interface ModifiedEquipmentStat {
  base: number;
  mod: number;
}

export interface EquipmentModifiedStats {
  reloadS: ModifiedEquipmentStat;
  aimTimeS: ModifiedEquipmentStat;
  traverseDegS: ModifiedEquipmentStat;
}

/** Equipment slots per vehicle (WoT standard). */
export const EQUIP_SLOTS = 3;

/**
 * The catalog. Order = garage picker order (grouped by category).
 * `era`: 'all' | 'modern' — modern-only gear never mounts on WWII tanks.
 * `effects` use the wiring vocabulary above; `spot` marks items whose
 * view/camo numbers live in spotting.js EQUIPMENT (kept there so the
 * spotting selftest keeps owning its constants).
 */
export const EQUIPMENT_CATALOG: readonly EquipmentItem[] = [
  // --- FIREPOWER -----------------------------------------------------------
  {
    id: 'rammer', name: 'Gun Rammer', short: 'Rammer', cat: 'fire', era: 'all',
    desc: '-10% reload time',
    effects: { reload: 0.90 },
  },
  {
    id: 'vstab', name: 'Vertical Stabilizer', short: 'V-Stab', cat: 'fire', era: 'modern',
    desc: '-20% dispersion on the move',
    effects: { bloom: 0.80 },
  },
  {
    id: 'gld', name: 'Gun Laying Drive', short: 'GLD', cat: 'fire', era: 'all',
    desc: '-10% aim time',
    effects: { aimTime: 0.90 },
  },
  {
    id: 'vents', name: 'Improved Ventilation', short: 'Vents', cat: 'fire', era: 'all',
    desc: '+2.5% crew: reload, aim, view, camo',
    effects: { reload: 0.975, aimTime: 0.975 }, // view/camo via spotting table
    spot: true,
  },
  // --- RECON ---------------------------------------------------------------
  {
    id: 'optics', name: 'Coated Optics', short: 'Optics', cat: 'recon', era: 'all',
    desc: '+10% view range',
    effects: {}, spot: true,
  },
  {
    id: 'binoculars', name: 'Binocular Telescope', short: 'Binocs', cat: 'recon', era: 'all',
    desc: '+25% view range while stationary',
    effects: {}, spot: true,
  },
  {
    id: 'camo_net', name: 'Camouflage Net', short: 'Camo Net', cat: 'recon', era: 'all',
    desc: '+12% concealment while stationary',
    effects: {}, spot: true,
  },
  // --- MOBILITY ------------------------------------------------------------
  {
    id: 'rotation', name: 'Improved Rotation', short: 'Rotation', cat: 'mobility', era: 'all',
    desc: '+10% hull and turret traverse',
    effects: { traverse: 1.10, turret: 1.10 },
  },
  {
    id: 'susp', name: 'Enhanced Suspension', short: 'Suspension', cat: 'mobility', era: 'all',
    desc: '+50% track durability',
    effects: { moduleHp: { trackL: 1.5, trackR: 1.5 } },
  },
  // --- SURVIVABILITY -------------------------------------------------------
  {
    id: 'toolbox', name: 'Toolbox', short: 'Toolbox', cat: 'survival', era: 'all',
    desc: '+25% repair speed',
    effects: { repair: 1.25 },
  },
  {
    id: 'spall_liner', name: 'Spall Liner', short: 'Spall Liner', cat: 'survival', era: 'all',
    desc: '-25% HE splash damage, -50% crew hits from splash',
    effects: { heSplash: 0.75, crewHe: 0.5 },
  },
  {
    id: 'wet_rack', name: 'Wet Ammo Rack', short: 'Wet Rack', cat: 'survival', era: 'all',
    desc: '+50% ammo rack durability',
    effects: { moduleHp: { ammoRack: 1.5 } },
  },
  {
    id: 'fuel_safety', name: 'Safety Fuel Tanks', short: 'Safe Fuel', cat: 'survival', era: 'all',
    desc: '+50% fuel tank durability, -50% engine fire chance',
    effects: { engineFire: 0.5, moduleHp: { fuelTank: 1.5 } },
  },
  {
    id: 'auto_ext', name: 'Auto Extinguishers', short: 'Auto Ext', cat: 'survival', era: 'modern',
    desc: 'Fires burn half as long and self-extinguish 2x as often',
    effects: { fireTicks: 0.5, extinguish: 2.0 },
  },
];

/** id -> catalog item. */
export const EQUIPMENT_BY_ID: ReadonlyMap<string, EquipmentItem> = new Map(
  EQUIPMENT_CATALOG.map((item) => [item.id, item]),
);

/** Picker categories in display order. */
export const EQUIP_CATEGORIES: readonly EquipmentCategory[] = [
  { id: 'all', label: 'All' },
  { id: 'fire', label: 'Firepower' },
  { id: 'recon', label: 'Recon' },
  { id: 'mobility', label: 'Mobility' },
  { id: 'survival', label: 'Survival' },
];

/**
 * Era gate: can this item mount on this spec?
 * @param {object|string} item catalog item or id
 * @param {object} spec TankSpec-like ({ era })
 * @returns {boolean}
 */
export function equipEligible(
  item: EquipmentItem | string,
  spec?: EquipmentSpecLike | null,
): boolean {
  const it = typeof item === 'string' ? EQUIPMENT_BY_ID.get(item) : item;
  if (!it) return false;
  // Magazine autoloaders cannot mount a gun rammer in the WoT equipment
  // model. Vents can still improve the full magazine load; the intra-clip
  // mechanism delay remains fixed.
  if (it.id === 'rammer' && spec?.gun?.autoloader) return false;
  if (it.era === 'all') return true;
  return !!spec && it.era === 'modern' && isPostwarVehicleEra(spec.era);
}

/**
 * Validate a raw id array against the catalog (+ optional era gate) and the
 * slot cap. Order-preserving, de-duplicated.
 * @param {?Array<string>} ids
 * @param {?object} [spec] when given, era-illegal items are dropped
 * @returns {Array<string>}
 */
export function sanitizeLoadout(
  ids: readonly string[] | null | undefined,
  spec?: EquipmentSpecLike | null,
): string[] {
  const out: string[] = [];
  if (Array.isArray(ids)) {
    for (const id of ids) {
      if (!EQUIPMENT_BY_ID.has(id) || out.includes(id)) continue;
      if (spec && !equipEligible(id, spec)) continue;
      out.push(id);
      if (out.length >= EQUIP_SLOTS) break;
    }
  }
  return out;
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

/**
 * Fold a loadout into the combat/movement/repair multiplier record the sim
 * hooks read off CombatState.equipMults. Every field defaults to 1 (or {})
 * so hooks can multiply blindly.
 * @param {?Array<string>} ids equipped item ids
 * @returns {object} equipMults
 */
export function computeEquipMults(
  ids: readonly string[] | null | undefined,
): EquipmentMultipliers {
  const m: EquipmentMultipliers = {
    reload: 1, aimTime: 1, bloom: 1, traverse: 1, turret: 1, repair: 1,
    heSplash: 1, crewHe: 1, engineFire: 1, fireTicks: 1, extinguish: 1,
    moduleHp: {},
  };
  if (!Array.isArray(ids)) return m;
  for (const id of ids) {
    const it = EQUIPMENT_BY_ID.get(id);
    if (!it || !it.effects) continue;
    const e = it.effects;
    if (e.reload) m.reload *= e.reload;
    if (e.aimTime) m.aimTime *= e.aimTime;
    if (e.bloom) m.bloom *= e.bloom;
    if (e.traverse) m.traverse *= e.traverse;
    if (e.turret) m.turret *= e.turret;
    if (e.repair) m.repair *= e.repair;
    if (e.heSplash) m.heSplash *= e.heSplash;
    if (e.crewHe) m.crewHe *= e.crewHe;
    if (e.engineFire) m.engineFire *= e.engineFire;
    if (e.fireTicks) m.fireTicks *= e.fireTicks;
    if (e.extinguish) m.extinguish *= e.extinguish;
    if (e.moduleHp) {
      for (const mod of Object.keys(e.moduleHp) as EquipmentModuleId[]) {
        const factor = e.moduleHp[mod];
        if (factor === undefined) continue;
        m.moduleHp[mod] = (m.moduleHp[mod] || 1) * factor;
      }
    }
  }
  return m;
}

/**
 * Attach a loadout to a freshly created CombatState: stores the sanitized id
 * list + multiplier record and scales module max HP (wet rack / suspension /
 * safety fuel). Call ONCE per battle, right after createCombatState.
 * @param {object} combat CombatState (mutated)
 * @param {?Array<string>} ids equipped item ids
 * @param {?object} [spec] spec for era validation
 * @returns {Array<string>} the sanitized ids that took effect
 */
export function applyEquipmentToCombat(
  combat: EquipmentCombatState,
  ids: readonly string[] | null | undefined,
  spec?: EquipmentSpecLike | null,
): string[] {
  const clean = sanitizeLoadout(ids, spec);
  const mults = computeEquipMults(clean);
  combat.equip = clean;
  combat.equipMults = mults;
  for (const mod of Object.keys(mults.moduleHp) as EquipmentModuleId[]) {
    const factor = mults.moduleHp[mod];
    if (factor === undefined) continue;
    const rec = combat.modules && combat.modules[mod];
    if (!rec) continue;
    rec.maxHp *= factor;
    rec.hp *= factor;
  }
  return clean;
}

// ---------------------------------------------------------------------------
// AI parity — per-role default loadouts so bots fight with the same tools.
// Era-illegal picks are filtered per spec.
// ---------------------------------------------------------------------------
export const AI_DEFAULT_LOADOUTS: Readonly<Record<string, readonly string[]>> = {
  heavy:  ['rammer', 'spall_liner', 'toolbox'],
  medium: ['rammer', 'vents', 'gld'],
  light:  ['optics', 'vents', 'camo_net'],
  td:     ['rammer', 'camo_net', 'binoculars'],
  mbt:    ['rammer', 'vstab', 'optics'],
  ifv:    ['optics', 'vents', 'susp'],
  spg:    ['gld', 'camo_net', 'toolbox'],
};

/**
 * Default loadout for an AI tank (mechanical-role table, era-filtered).
 * @param {object} spec TankSpec-like ({ role, era })
 * @returns {Array<string>}
 */
export function defaultLoadoutFor(spec: EquipmentSpecLike): string[] {
  if (spec?.gun?.autoloader && spec.role === 'mbt') {
    return sanitizeLoadout(['vents', 'vstab', 'optics'], spec);
  }
  const list = AI_DEFAULT_LOADOUTS[spec.role ?? ''] || AI_DEFAULT_LOADOUTS.medium;
  return sanitizeLoadout(list, spec);
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
