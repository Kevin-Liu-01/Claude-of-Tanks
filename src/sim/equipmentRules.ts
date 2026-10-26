// src/sim/equipmentRules.ts — the equipment rules: the catalog, the hull gates, the multipliers a loadout folds
// into and the bots' default loadouts. DOM-free and vehicle-free: the mode rulesets (matchRuleset.ts equipmentBan)
// and the network authority read it, and the rooms Worker reaches the rulesets through src/mp/room/protocol.ts, so
// this must never import from src/game or src/vehicles (src/mp/room/roomWorkerProgram.selftest.mjs).
// `game/equipment.ts` re-exports it beside the Garage's half: the picker, the saved loadouts and the stat card.
// Selftest: src/game/equipment.selftest.mjs.
//
// Every tank carries EQUIP_SLOTS equipment slots; sanitizeLoadout drops
// unknown and hull-illegal ids and clamps a loadout to the slot count.
//
// EFFECT WIRING MAP — which effects are REAL (wired into the live sim):
//   reload      × on reload time        sim/damage.ts startReload
//   aimTime     × on aim-settle tau     sim/movement.ts readDebuffs
//   bloom       × on movement-bloom     sim/movement.ts (dispersion excess
//                 excess                 while moving/rotating)
//   traverse    × on hull traverse      sim/movement.ts readDebuffs
//   turret      × on turret traverse    sim/movement.ts readDebuffs
//   repair      × on auto-repair RATE   sim/damage.ts tickModuleRepairs
//   heSplash    × on HE splash dmg IN   sim/damage.ts (non-pen HE burst +
//                                        blast-sphere splash; full HE pens
//                                        are NOT reduced — WoT parity)
//   crewHe      × on HE crew-hit odds   sim/damage.ts rollCrewHit
//   engineFire  × on fire IGNITE odds   sim/damage.ts applyModuleDamage
//   fireTicks   × on fire duration      sim/damage.ts applyModuleDamage
//   extinguish  × on self-extinguish    sim/damage.ts tickFire
//   moduleHp    × per-module max HP     applyEquipmentToCombat (below): the
//                                        tracks, ammo rack, fuel tank, gun, gun
//                                        mount, turret ring, engine, transmission,
//                                        autoloader, feed and optics
//   view/viewStill/camo/camoStill       sim/spotting.ts EQUIPMENT table
//                                        (same ids — spotting owns vision)
// Nothing in the catalog is cosmetic-only. Every effect is authority-side or
// already on the wire (VIEWER_EQUIPMENT), so the catalog never changes the
// wire. Stacked effects are bounded (EQUIP_LIMITS), and a mode can ban
// categories or items (matchRuleset.ts equipmentBan).
//
// The catalog (owner 2026-10-24: "make equipment have a lot more options"):
// 25 items in five categories, firepower, mobility, protection, survivability
// and scouting. An item may need a turret, an autoloader or a hand-loaded gun.

import { isPostwarVehicleEra } from './vehicleEras.ts';

type EquipmentEra = 'all' | 'modern';
export type EquipmentCategoryId = 'all' | 'fire' | 'mobility' | 'protection' | 'survival' | 'recon';
type EquipmentModuleId = 'trackL' | 'trackR' | 'ammoRack' | 'fuelTank' | 'gun' | 'gunMount' | 'turretRing'
  | 'engine' | 'transmission' | 'autoloader' | 'feedSystem' | 'optics';
/** What a vehicle must have for an item to mount: a turret, an autoloader, or a hand-loaded gun. */
type EquipmentNeed = 'turret' | 'autoloader' | 'manualLoader';

interface EquipmentEffects {
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
  needs?: EquipmentNeed;
}

export interface EquipmentSpecLike {
  era?: string | null;
  role?: string;
  gun?: {
    autoloader?: object;
  };
  armor?: { turretless?: boolean } | null;
}

interface EquipmentMultipliers {
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
  /** Replaced atomically by applyEquipmentToCombat; callers may carry a
   * narrower simulation-facing multiplier view before this boundary. */
  equipMults?: object;
  modules?: Partial<Record<EquipmentModuleId, {
    maxHp: number;
    hp: number;
  }>>;
}

/** Equipment slots per vehicle (WoT standard). */
export const EQUIP_SLOTS = 3;

type ScalarEquipmentMultiplier = Exclude<keyof EquipmentEffects, 'moduleHp'>;

const SCALAR_EQUIPMENT_MULTIPLIERS: readonly ScalarEquipmentMultiplier[] = [
  'reload', 'aimTime', 'bloom', 'traverse', 'turret', 'repair',
  'heSplash', 'crewHe', 'engineFire', 'fireTicks', 'extinguish',
];

/**
 * The catalog. Order = garage picker order (grouped by category).
 * `era`: 'all' | 'modern' — modern-only gear never mounts on WWII tanks.
 * `effects` use the wiring vocabulary above; `spot` marks items whose
 * view/camo numbers live in spotting.ts EQUIPMENT (kept there so the
 * spotting selftest keeps owning its constants).
 */
export const EQUIPMENT_CATALOG: readonly EquipmentItem[] = [
  // --- FIREPOWER -----------------------------------------------------------
  {
    id: 'rammer', name: 'Gun Rammer', short: 'Rammer', cat: 'fire', era: 'all', needs: 'manualLoader',
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
  {
    // a trade: rounds stowed by the breech load faster and burn sooner
    id: 'ready_rack', name: 'Ready-Rack Stowage', short: 'Ready Rack', cat: 'fire', era: 'all', needs: 'manualLoader',
    desc: '-6% reload time, -15% ammo rack durability',
    effects: { reload: 0.94, moduleHp: { ammoRack: 0.85 } },
  },
  {
    id: 'fire_control', name: 'Fire-Control Computer', short: 'FCS', cat: 'fire', era: 'modern',
    desc: '-6% aim time, -10% dispersion on the move',
    effects: { aimTime: 0.94, bloom: 0.90 },
  },
  {
    id: 'loader_kit', name: 'Autoloader Service Kit', short: 'Loader Kit', cat: 'fire', era: 'all', needs: 'autoloader',
    desc: '-6% magazine reload, +50% autoloader and feed durability',
    effects: { reload: 0.94, moduleHp: { autoloader: 1.5, feedSystem: 1.5 } },
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
  {
    id: 'turret_drive', name: 'Powered Turret Drive', short: 'Traverse', cat: 'mobility', era: 'modern', needs: 'turret',
    desc: '+20% turret traverse',
    effects: { turret: 1.20 },
  },
  {
    id: 'drivetrain', name: 'Reinforced Drivetrain', short: 'Drivetrain', cat: 'mobility', era: 'all',
    desc: '+40% engine and +60% transmission durability',
    effects: { moduleHp: { engine: 1.4, transmission: 1.6 } },
  },
  // --- PROTECTION ----------------------------------------------------------
  {
    id: 'spall_liner', name: 'Spall Liner', short: 'Liner', cat: 'protection', era: 'all',
    desc: '-25% HE splash damage, -50% crew hits from splash',
    effects: { heSplash: 0.75, crewHe: 0.5 },
  },
  {
    id: 'skirts', name: 'Side Skirts', short: 'Skirts', cat: 'protection', era: 'all',
    desc: '-12% HE splash damage, +25% track durability',
    effects: { heSplash: 0.88, moduleHp: { trackL: 1.25, trackR: 1.25 } },
  },
  {
    id: 'ring_guard', name: 'Turret Ring Guard', short: 'Ring Guard', cat: 'protection', era: 'all', needs: 'turret',
    desc: '+60% turret ring and +30% gun mount durability',
    effects: { moduleHp: { turretRing: 1.6, gunMount: 1.3 } },
  },
  {
    id: 'mantlet_shield', name: 'Mantlet Shield', short: 'Mantlet', cat: 'protection', era: 'all',
    desc: '+40% gun and +30% optics durability',
    effects: { moduleHp: { gun: 1.4, optics: 1.3 } },
  },
  // --- SURVIVABILITY -------------------------------------------------------
  {
    id: 'toolbox', name: 'Toolbox', short: 'Toolbox', cat: 'survival', era: 'all',
    desc: '+25% repair speed',
    effects: { repair: 1.25 },
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
  {
    id: 'fire_blankets', name: 'Fire Blankets', short: 'Blankets', cat: 'survival', era: 'all',
    desc: 'Fires burn 25% shorter and self-extinguish 1.5x as often',
    effects: { fireTicks: 0.75, extinguish: 1.5 },
  },
  // --- SCOUTING ------------------------------------------------------------
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
  {
    id: 'exhaust_baffles', name: 'Exhaust Baffles', short: 'Baffles', cat: 'recon', era: 'all',
    desc: '+4% concealment, moving or still',
    effects: {}, spot: true,
  },
  {
    id: 'thermal_sight', name: 'Thermal Sight', short: 'Thermal', cat: 'recon', era: 'modern',
    desc: '+15% view range',
    effects: {}, spot: true,
  },
];

/** id -> catalog item. */
export const EQUIPMENT_BY_ID: ReadonlyMap<string, EquipmentItem> = new Map(
  EQUIPMENT_CATALOG.map((item) => [item.id, item]),
);

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
  return equipIneligibility(item, spec) === null;
}

/** Why an item cannot mount on a vehicle, or null when it can. */
export type EquipmentIneligibility = 'unknown' | 'era' | EquipmentNeed;

/**
 * The reason an item cannot mount on this spec (null: it can). The checks run without a spec too, as a catalog
 * listing does: then only the item's existence is checked.
 */
export function equipIneligibility(
  item: EquipmentItem | string,
  spec?: EquipmentSpecLike | null,
): EquipmentIneligibility | null {
  const it = typeof item === 'string' ? EQUIPMENT_BY_ID.get(item) : item;
  if (!it) return 'unknown';
  if (!spec) return it.era === 'modern' ? 'era' : null; // a modern item needs a postwar spec, as it always has
  // Magazine autoloaders cannot mount a gun rammer or a ready rack in the WoT
  // equipment model (vents still improve the full magazine load); the
  // autoloader's own kit needs one.
  const autoloader = !!spec.gun?.autoloader;
  if (it.needs === 'manualLoader' && autoloader) return 'manualLoader';
  if (it.needs === 'autoloader' && !autoloader) return 'autoloader';
  if (it.needs === 'turret' && spec.armor?.turretless) return 'turret';
  if (it.era === 'modern' && !isPostwarVehicleEra(spec.era)) return 'era';
  return null;
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

function applyScalarEquipmentEffects(
  multipliers: EquipmentMultipliers,
  effects: EquipmentEffects,
): void {
  for (const key of SCALAR_EQUIPMENT_MULTIPLIERS) {
    const factor = effects[key];
    if (factor) multipliers[key] *= factor;
  }
}

function applyModuleEquipmentEffects(
  multipliers: EquipmentMultipliers,
  effects: EquipmentEffects,
): void {
  if (!effects.moduleHp) return;
  for (const moduleId of Object.keys(effects.moduleHp) as EquipmentModuleId[]) {
    const factor = effects.moduleHp[moduleId];
    if (factor === undefined) continue;
    multipliers.moduleHp[moduleId] = (multipliers.moduleHp[moduleId] || 1) * factor;
  }
}

/**
 * The bounds a loadout's stacked effects stay in (a multiplier past them is
 * held at the bound). Every loadout the catalog allowed before 2026-10-24, and
 * every bot loadout, sits inside them, so their numbers are unchanged.
 */
export const EQUIP_LIMITS = Object.freeze({
  reload: 0.85, aimTime: 0.82, bloom: 0.70, heSplash: 0.60, crewHe: 0.45, engineFire: 0.40, fireTicks: 0.40,
  traverse: 1.25, turret: 1.35, repair: 1.50, extinguish: 2.50, moduleHpMax: 2.00,
} as const);

function boundEquipmentMultipliers(m: EquipmentMultipliers): void {
  m.reload = Math.max(EQUIP_LIMITS.reload, m.reload);
  m.aimTime = Math.max(EQUIP_LIMITS.aimTime, m.aimTime);
  m.bloom = Math.max(EQUIP_LIMITS.bloom, m.bloom);
  m.heSplash = Math.max(EQUIP_LIMITS.heSplash, m.heSplash);
  m.crewHe = Math.max(EQUIP_LIMITS.crewHe, m.crewHe);
  m.engineFire = Math.max(EQUIP_LIMITS.engineFire, m.engineFire);
  m.fireTicks = Math.max(EQUIP_LIMITS.fireTicks, m.fireTicks);
  m.traverse = Math.min(EQUIP_LIMITS.traverse, m.traverse);
  m.turret = Math.min(EQUIP_LIMITS.turret, m.turret);
  m.repair = Math.min(EQUIP_LIMITS.repair, m.repair);
  m.extinguish = Math.min(EQUIP_LIMITS.extinguish, m.extinguish);
  for (const moduleId of Object.keys(m.moduleHp) as EquipmentModuleId[]) {
    const factor = m.moduleHp[moduleId];
    if (factor !== undefined) m.moduleHp[moduleId] = Math.min(EQUIP_LIMITS.moduleHpMax, factor);
  }
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
    applyScalarEquipmentEffects(m, it.effects);
    applyModuleEquipmentEffects(m, it.effects);
  }
  boundEquipmentMultipliers(m);
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
