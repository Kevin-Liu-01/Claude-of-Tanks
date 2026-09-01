/**
 * damage.ts — complete hit resolution per docs/research/armor-penetration.md
 * §12 and shells-ballistics.md: ricochet, normalization with overmatch,
 * KE/CE effective thickness with slope exponents, ERA (incl. tandem bypass),
 * spaced-armor absorption with HEAT air-gap decay, the gun barrel as a
 * spaced layer, ±25% pen/damage rolls, module & crew saving throws, fires,
 * ammo-rack detonation, HE/HESH direct hits and blast-sphere splash, and
 * destroyed hulls acting as inert shell-absorbing cover.
 *
 * Pure-logic module (ARCHITECTURE.md §3.5.3). RNG consumption order is fixed
 * for determinism: pen roll, damage roll, then per-intersection
 * (save, moduleDmg, fire) in trace order — module/crew boxes that STRADDLE
 * the penetrated plate (entered before it, exited past it) roll immediately
 * at the pen, still in trace order. HE blast sweeps roll modules (model
 * order) then crew (model order). Wreck hits consume no RNG beyond the
 * once-per-shot pen/dmg rolls.
 */

import { Vector3, Matrix4, Quaternion, Euler } from 'three';
import { penAtDistanceMm } from './ballistics.ts';
import type {
  BallisticShellSpec,
  ShellEntity,
} from './ballistics.ts';
import { tankPoseFromState, traceTank, blastTargets } from './armor.ts';
import type {
  AimArmorInfo as ArmorAimArmorInfo,
  ArmorCrewIntersection,
  ArmorIntersection,
  ArmorModel,
  ArmorModuleIntersection,
  ArmorPlate,
  ArmorPlateIntersection,
  ArmorPoseState,
  TankArmorPose,
} from './armor.ts';
import { CORE_MODULE_IDS, MODULE_DEFS, MODULE_IDS } from './moduleCatalog.ts';
import type { ModuleId } from './moduleCatalog.ts';
import { isPostwarVehicleEra } from '../vehicles/taxonomy.ts';
import { createAmmunitionState } from './ammunition.ts';

type Rng = () => number;
type Vec3Tuple = [number, number, number];
type ShellClass = 'KE' | 'CE' | 'HE';
type ModuleStateName = 'ok' | 'yellow' | 'red';
type ReloadKind = 'ready' | 'shell' | 'intraClip' | 'magazine';

interface ShellBehavior {
  kindClass: ShellClass;
  normDeg: number;
  ricochetDeg: number;
  slopeExp: number;
  spallBonus?: number;
}

export interface DamageShellSpec extends BallisticShellSpec {
  name: string;
  type: string;
  caliberMm: number;
  pen100Mm: number;
  pen1000Mm: number;
  pen2000Mm?: number;
  dmg: number;
  moduleDmg?: number;
  reloadS?: number;
  count?: number | null;
  effectiveOvermatchCaliberMm?: number;
  tandem?: boolean;
  soundProfile?: string;
}

export interface DamageShell extends ShellEntity<DamageShellSpec> {
  freshPenRollMm?: number;
}

export type DamageArmorPlate = ArmorPlate;
export type DamageArmorModel = ArmorModel;

export interface DamageGunSpec {
  reloadS: number;
  shells?: DamageShellSpec[];
  autoloader?: {
    magazineSize: number;
    fullReloadS?: number;
    intraClipS?: number;
  } | null;
}

export interface DamageTankSpec {
  era: string;
  hp: number;
  gun: DamageGunSpec;
  armor?: DamageArmorModel | null;
  dims?: { heightM: number };
}

export interface CombatModuleState {
  hp: number;
  maxHp: number;
  state: ModuleStateName;
  repairT: number;
}

export interface ReloadState {
  t: number;
  totalS: number;
  kind: ReloadKind;
}

export interface CombatState {
  hp: number;
  maxHp: number;
  destroyed: boolean;
  modules: Partial<Record<ModuleId, CombatModuleState>>;
  crew: Record<string, boolean>;
  fire: { burning: boolean; tickTimer: number; ticksLeft: number };
  eraSpent: Set<string>;
  reload: ReloadState;
  /** Shared cannon/feed channel, even while an auxiliary launcher is selected. */
  gunReload?: ReloadState;
  /** Conventional shells share one gun cycle; each guided launcher owns one. */
  reloadChannels?: ReloadState[];
  magazine: { rounds: number; capacity: number } | null;
  shellSlot: number;
  ammo: number[];
  ammoCapacity: number[];
  equipMults?: Partial<Record<string, number>>;
}

export type DamageTankState = ArmorPoseState;

export interface DamageTarget {
  id: string;
  spec: DamageTankSpec & { armor: DamageArmorModel };
  state: DamageTankState;
  combat: CombatState;
}

export type PlateHit = ArmorPlateIntersection;
export type ModuleHit = ArmorModuleIntersection;
export type CrewHit = ArmorCrewIntersection;
export type ArmorHit = ArmorIntersection;

export interface HitEvent {
  kind: string;
  shellId: number;
  shellType: string;
  caliberMm: number;
  attackerId: string;
  targetId: string | null;
  pos: Vec3Tuple;
  normal: Vec3Tuple;
  impactAngleDeg: number;
  effectiveMm: number;
  penRollMm: number;
  damage: number;
  targetHpAfter: number;
  modulesHit: Array<{ module: ModuleId; newState: ModuleStateName; dmg: number }>;
  crewHit: string[];
  fireStarted: boolean;
  ammoRacked: boolean;
  destroyed: boolean;
  eraPlate: string | null;
  eraActivations: Array<{
    plate: string;
    pos: Vec3Tuple;
    normal: Vec3Tuple;
  }>;
  shellName: string;
  penRollFreshMm: number;
  flightDistM: number;
  dmgRoll: number;
  zone: string | null;
  plateKind: string | null;
  physicalMm: number;
  nominalMm: number;
  localPos: Vec3Tuple | null;
  localDir: Vec3Tuple | null;
  impactFrame: string | null;
  impactLocalPos: Vec3Tuple | null;
  impactLocalNormal: Vec3Tuple | null;
  impactLocalDir: Vec3Tuple | null;
}

interface ResolutionContext {
  combat: CombatState;
  shellSpec: DamageShellSpec;
  rng: Rng;
  modulesHit: HitEvent['modulesHit'];
  crewHit: string[];
  chanceScale?: number;
  dmgScale?: number;
}

interface ArmorAabb {
  min: number[];
  max: number[];
}

export type AimArmorInfo = ArmorAimArmorInfo;

function isPlateHit(hit: ArmorHit): hit is PlateHit {
  return hit.kind === 'plate';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

const DEG_TO_RAD = Math.PI / 180;

/**
 * Per-shell-type behavior constants (armor doc §1, §11.3; shells doc §1, §5).
 * kindClass: 'KE' kinetic | 'CE' chemical | 'HE' blast.
 * slopeExp: exponent on cos(effAngle) — 1.4 rewards classic sloped steel,
 * 1.0 makes long rods and jets see plain line-of-sight thickness.
 * spallBonus: through-armor splash multiplier (shells doc §6 — HESH 1.25).
 */
const SHELL_BEHAVIOR = {
  AP: { kindClass: 'KE', normDeg: 5, ricochetDeg: 70, slopeExp: 1.4 },
  APCR: { kindClass: 'KE', normDeg: 2, ricochetDeg: 70, slopeExp: 1.4 },
  APFSDS: { kindClass: 'KE', normDeg: 2, ricochetDeg: 78, slopeExp: 1.0 },
  HEAT: { kindClass: 'CE', normDeg: 0, ricochetDeg: 85, slopeExp: 1.0 },
  HE: { kindClass: 'HE', normDeg: 0, ricochetDeg: Infinity, slopeExp: 1.0, spallBonus: 1.0 },
  HESH: { kindClass: 'HE', normDeg: 0, ricochetDeg: Infinity, slopeExp: 1.0, spallBonus: 1.25 },
} as const satisfies Readonly<Record<string, ShellBehavior>>;

/**
 * Behavior lookup that fails loudly on unknown shell types instead of
 * surfacing later as `undefined.kindClass` deep in a ricochet check.
 * @param {string} type ShellSpec.type
 * @returns {object} SHELL_BEHAVIOR entry
 */
function behaviorOf(type: string): ShellBehavior {
  const b = SHELL_BEHAVIOR[type as keyof typeof SHELL_BEHAVIOR];
  if (!b) throw new Error(`damage.ts: unknown shell type '${type}' — add it to SHELL_BEHAVIOR`);
  return b;
}

/**
 * True when a shell type resolves as a blast round (kind class 'HE'): direct
 * hits and terrain impacts must route through resolveHeBurst. Game-loop
 * routing MUST use this instead of comparing `type === 'HE'` strings so HESH
 * (and any future blast type) detonates instead of silently dying on terrain
 * (shells doc §5–§6).
 * @param {string} type ShellSpec.type
 * @returns {boolean}
 */
export function isHeClass(type: string): boolean {
  return behaviorOf(type).kindClass === 'HE';
}

const CREW_HIT_CHANCE = 0.33;
const CREW_HIT_CHANCE_HE = 0.1;
const ENGINE_FIRE_CHANCE = 0.15;
/** Reload-time multiplier while the ammo rack is damaged (armor doc §9). */
const AMMORACK_RELOAD_MULT = 1.5;
const OVERMATCH_NO_RICOCHET = 3.0;
const OVERMATCH_NORM_BOOST = 2.0; // caliber ≥ 2×T ⇒ norm × 1.4·C/T
const POSTPEN_CALIBERS = 10; // internal sweep length = 10 × caliber
const HEAT_GAP_LOSS_PER_M = 0.5; // 5% pen per 10 cm of air gap
const HE_ARMOR_ABSORB = 1.1;
const RICOCHET_MAX_BOUNCES = 2;
// Gun barrel as spaced armor (armor doc §4/§7): crossing the cylinder costs
// a radius-scaled slice of pen (two steel walls), clamped 30–60 mm.
const BARREL_SCREEN_MIN_MM = 30;
const BARREL_SCREEN_MAX_MM = 60;
const BARREL_SCREEN_MM_PER_RADIUS_M = 500;
const BARREL_DEFAULT_RADIUS_M = 0.08;
/** Red-module repair duration (seconds) — the count-up target consumed by
 * tickModuleRepairs below (the game loop calls it; no duplicate constant). */
export const REPAIR_S = 10;
const FIRE_BASE_TICKS = 10;
const FIRE_TICK_HP_FRAC = 0.005;
const FIRE_TICK_MODULE_DMG = 10;
const FIRE_EXTINGUISH_CHANCE = 0.12;
const DEFAULT_CREW = ['commander', 'gunner', 'driver', 'loader'];

// --- SHOT-INFO ENRICHMENT scratch (additive UI metadata; src/ui/shotInfo.ts).
const _siEuler = new Euler();
const _siQuat = new Quaternion();
const _siMat = new Matrix4();
const _siV = new Vector3();
const _siDir = new Vector3();
const _siOne = new Vector3(1, 1, 1);

// Scratch vectors (module scope — no per-frame allocation).
const _center = new Vector3();
const _reflN = new Vector3();
const _carryDir = new Vector3();
const _carryV = new Vector3();
const _exitPos = new Vector3();

// HE nearest-point splash scratch (resolveHeBurst).
const _heMat = new Matrix4();
const _heInv = new Matrix4();
const _heLocal = new Vector3();
const _heNearest = new Vector3();
const _heTo = new Vector3();
/** Inset (m) pulling the clamped point off AABB edges so the splash trace
 * strikes plate interiors instead of grazing mathematically exact edges. */
const HE_NEAREST_INSET_M = 0.01;

/** ±25% uniform roll. @param {function} rng @param {number} avg @returns {number} */
function rollUniform(rng: Rng, avg: number): number {
  return avg * (0.75 + rng() * 0.5);
}

// ---- RAMMING (gameplay: "add ramming and ram damage") ----------------------
// WoT-style kinetic collision damage. The total pool is the two-body impact
// energy — closing speed squared times the REDUCED mass (mA·mB/(mA+mB), the
// physically meaningful inertia of a two-body crash) — and it splits by mass
// share: the heavier vehicle both DEALS more (its mass dominates the pool)
// and TAKES less (the victim's share scales with the RAMMER's mass fraction).
// The rammer additionally keeps a WoT-style attacker discount so deliberate
// heavy-on-light rams are a real tactic instead of a mutual suicide.
// Tuning anchor: two 45 t mediums meeting at 8 m/s closing (~29 km/h): the
// rammed side takes ~144 hp, the rammer ~94 (of 1500-2600 pools) —
// punishing, not lethal; a 65 t heavy hitting a 20 t light at 12 m/s deals
// ~337 and takes ~67.
const RAM_MIN_CLOSING_MPS = 2.5; // parking bumps and column shuffles: free
const RAM_K = 0.2;               // hp per (m/s)^2 per reduced ton
const RAM_SELF_SCALE = 0.65;     // attacker discount on the rammer's share
const RAM_MAX_TOTAL = 900;       // freight-train cap (60+ km/h closing)

/**
 * Kinetic ram damage split for a tank-tank collision.
 * Pure — safe for selftests. Returns zeros below the closing-speed floor.
 * @param {number} massAT rammer mass (tons; <=0 falls back to 40)
 * @param {number} massBT victim mass (tons; <=0 falls back to 40)
 * @param {number} closingMps closing speed along the contact normal (m/s)
 * @returns {{total:number,toA:number,toB:number}} hp damage (toA = rammer)
 */
export function ramDamage(
  massAT: number,
  massBT: number,
  closingMps: number,
): { total: number; toA: number; toB: number } {
  const mA = massAT > 0 ? massAT : 40;
  const mB = massBT > 0 ? massBT : 40;
  const c = Math.abs(Number(closingMps));
  if (!(c >= RAM_MIN_CLOSING_MPS)) return { total: 0, toA: 0, toB: 0 };
  const mRed = (mA * mB) / (mA + mB);
  const total = Math.min(RAM_MAX_TOTAL, RAM_K * c * c * mRed);
  return {
    total,
    toA: total * (mB / (mA + mB)) * RAM_SELF_SCALE,
    toB: total * (mA / (mA + mB)),
  };
}

/**
 * EQUIPMENT SYSTEM (game/equipment.ts): multiplier off CombatState.equipMults,
 * defaulting to 1 so combat states without a loadout (probes, selftests,
 * throwaway states) resolve exactly as before. The record is attached once
 * per battle by applyEquipmentToCombat; damage.ts stays pure — the loadout
 * travels WITH the combat state.
 * @param {?object} combat CombatState
 * @param {string} key equipMults field
 * @returns {number}
 */
function equipMult(combat: CombatState | null | undefined, key: string): number {
  const m = combat && combat.equipMults;
  const v = m && m[key];
  return typeof v === 'number' && isFinite(v) ? v : 1;
}

/**
 * Build the CombatState for a fresh tank (ARCHITECTURE.md §2.4). Module HP is
 * ×2.5 for modern-era tanks; the crew roster comes from the armor model (e.g.
 * the T-90M carries no loader), defaulting to the classic four.
 *
 * @param {object} spec TankSpec
 * @returns {object} CombatState
 */
export function createCombatState(spec: DamageTankSpec): CombatState {
  const scale = isPostwarVehicleEra(spec.era) ? 2.5 : 1;
  const modules: Partial<Record<ModuleId, CombatModuleState>> = {};
  const authored = spec.armor && Array.isArray(spec.armor.modules) && spec.armor.modules.length
    ? new Set<ModuleId>(spec.armor.modules.map((box) => box.module))
    : new Set([...CORE_MODULE_IDS, 'turretRing']);
  for (const name of MODULE_IDS) {
    if (!authored.has(name)) continue;
    const hp = MODULE_DEFS[name].hp * scale;
    modules[name] = { hp, maxHp: hp, state: 'ok', repairT: 0 };
  }
  const crew: Record<string, boolean> = {};
  const roster =
    spec.armor && Array.isArray(spec.armor.crew) && spec.armor.crew.length
      ? spec.armor.crew.map((c) => c.crew)
      : DEFAULT_CREW;
  for (const name of roster) crew[name] = true;
  const autoloader = spec.gun && spec.gun.autoloader;
  const magazineSize = autoloader
    ? Math.max(1, Math.floor(Number(autoloader.magazineSize) || 1))
    : 0;
  const ammunition = createAmmunitionState(spec.gun.shells || []);
  const gunReload: ReloadState = { t: 0, totalS: spec.gun.reloadS, kind: 'ready' };
  const reloadChannels = (spec.gun.shells || []).map((round) => round.guided === true
    ? { t: 0, totalS: round.reloadS || spec.gun.reloadS, kind: 'ready' as ReloadKind }
    : gunReload);
  return {
    hp: spec.hp,
    maxHp: spec.hp,
    destroyed: false,
    modules,
    crew,
    fire: { burning: false, tickTimer: 0, ticksLeft: 0 },
    eraSpent: new Set(),
    reload: reloadChannels[0] || gunReload,
    gunReload,
    reloadChannels,
    magazine: autoloader ? { rounds: magazineSize, capacity: magazineSize } : null,
    shellSlot: 0,
    ammo: ammunition.ammo,
    ammoCapacity: ammunition.ammoCapacity,
  };
}

/**
 * Caliber used for the §5 overmatch rules. Long-rod APFSDS overmatches with
 * `rodDiameter × 3` as its effective caliber (armor doc §11.3), NOT the full
 * gun bore — a 125 mm gun fires a ~25 mm rod, so its effective overmatch
 * caliber is ~75 mm. Shell specs may pin an exact value via
 * `effectiveOvermatchCaliberMm`; otherwise rods default to rodDia ≈ C/5 ⇒
 * effective caliber 0.6 × bore. All other shells overmatch with full caliber.
 * @param {object} shellSpec ShellSpec
 * @returns {number} caliber in mm for overmatch checks
 */
function overmatchCaliberMm(shellSpec: DamageShellSpec): number {
  if ((shellSpec.effectiveOvermatchCaliberMm ?? 0) > 0) {
    return shellSpec.effectiveOvermatchCaliberMm!;
  }
  if (shellSpec.type === 'APFSDS') return shellSpec.caliberMm * 0.6;
  return shellSpec.caliberMm;
}

/**
 * Effective thickness of a plate versus a shell: normalization (with the
 * 2-caliber overmatch boost for KE), then KE/CE RHAe divided by
 * cos(effAngle)^slopeExponent (armor doc §2–§5, §11).
 *
 * @param {object} shellSpec ShellSpec
 * @param {object} plate Plate
 * @param {number} impactAngleDeg raw angle from the outward normal
 * @returns {{effMm: number, effAngleDeg: number}}
 */
function effectiveThickness(
  shellSpec: DamageShellSpec,
  plate: DamageArmorPlate,
  impactAngleDeg: number,
): { effMm: number; effAngleDeg: number } {
  const b = behaviorOf(shellSpec.type);
  let norm = b.normDeg;
  const T = plate.physicalMm;
  const omCal = overmatchCaliberMm(shellSpec);
  if (b.kindClass === 'KE' && T > 0 && omCal >= OVERMATCH_NORM_BOOST * T) {
    norm = norm * 1.4 * (omCal / T);
  }
  const effAngleDeg = Math.max(0, impactAngleDeg - norm);
  const clampedDeg = Math.min(effAngleDeg, 89);
  const base = b.kindClass === 'KE' ? plate.keMm : plate.ceMm;
  const effMm = base / Math.cos(clampedDeg * DEG_TO_RAD) ** b.slopeExp;
  return { effMm, effAngleDeg };
}

/**
 * Ricochet test on the raw impact angle and physical plate thickness. The
 * 3-caliber overmatch rule suppresses ricochet for kinetic shells; HE never
 * ricochets (armor doc §4–§5).
 *
 * @param {object} shellSpec ShellSpec
 * @param {number} impactAngleDeg raw impact angle
 * @param {object} plate Plate
 * @returns {boolean}
 */
function wouldRicochet(
  shellSpec: DamageShellSpec,
  impactAngleDeg: number,
  plate: DamageArmorPlate,
): boolean {
  const b = behaviorOf(shellSpec.type);
  if (b.kindClass === 'HE') return false;
  if (
    b.kindClass === 'KE' &&
    overmatchCaliberMm(shellSpec) >= OVERMATCH_NO_RICOCHET * plate.physicalMm
  ) {
    return false;
  }
  return impactAngleDeg > b.ricochetDeg;
}

/**
 * Update a module's yellow/red state after an HP change; arms the auto-repair
 * timer on a fresh red. `repairT` is a COUNT-UP accumulator (LOCKED
 * convention, shared with game/state.ts tickRepairs): it starts at 0 when the
 * module goes red and the repair loop adds dt until it reaches REPAIR_S — so a
 * red module stays red for the full repair duration.
 * @param {object} m module record {hp,maxHp,state,repairT}
 * @returns {'ok'|'yellow'|'red'} the new state
 */
function refreshModuleState(m: CombatModuleState): ModuleStateName {
  const prev = m.state;
  m.state = m.hp <= 0 ? 'red' : m.hp <= m.maxHp * 0.5 ? 'yellow' : 'ok';
  if (m.state === 'red' && prev !== 'red') m.repairT = 0; // count-up starts now
  if (m.state !== 'red') m.repairT = 0;
  return m.state;
}

/**
 * Shared per-intersection module damage: saving throw, moduleDmg roll, fire
 * roll (engine/fuel only). RNG order per module: save → moduleDmg → fire.
 *
 * @param {object} ctx resolution context {combat, shellSpec, rng, modulesHit, chanceScale, dmgScale}
 * @param {string} moduleName ModuleName
 * @returns {{fireStarted: boolean, ammoRacked: boolean}}
 */
function rollModuleDamage(
  ctx: ResolutionContext,
  moduleName: ModuleId,
): { fireStarted: boolean; ammoRacked: boolean } {
  const res = { fireStarted: false, ammoRacked: false };
  const m = ctx.combat.modules[moduleName];
  if (!m) return res;
  const save = ctx.rng(); // always consumed — fixed order
  const chance = (MODULE_DEFS[moduleName]?.saveChance ?? 0.45) * (ctx.chanceScale ?? 1);
  if (save >= Math.min(1, chance) || m.hp <= 0) return res;

  const moduleDmg =
    rollUniform(ctx.rng, ctx.shellSpec.moduleDmg ?? ctx.shellSpec.caliberMm) * (ctx.dmgScale ?? 1);
  m.hp = Math.max(0, m.hp - moduleDmg);
  const newState = refreshModuleState(m);
  // dmg is ADDITIVE (killcam_shotinfo r2): the killcam renders the value the
  // sim actually applied instead of fabricating one from the caliber.
  ctx.modulesHit.push({ module: moduleName, newState, dmg: Math.round(moduleDmg) });

  if (moduleName === 'ammoRack' && newState === 'red') res.ammoRacked = true;

  if (moduleName === 'engine' || moduleName === 'fuelTank') {
    // The draw is ALWAYS consumed to keep the fixed replay RNG order, but the
    // ignition rules differ (armor doc §9/§10 — the implementation authority):
    // engines roll ENGINE_FIRE_CHANCE on every damaging hit; fuel tanks have
    // NO fire chance while yellow and ignite at 100% only when destroyed.
    const fireRoll = ctx.rng();
    // EQUIPMENT SYSTEM: safety fuel tanks halve the ENGINE ignition odds
    // (fuel-tank ignition stays the locked 100%-on-red rule — the equipment
    // path to fewer fuel fires is its +50% module HP). Auto extinguishers
    // shorten the burn: fires start with half the tick budget (floor 2 so a
    // fire is never a free no-op).
    const ignite = moduleName === 'engine'
      ? fireRoll < ENGINE_FIRE_CHANCE * equipMult(ctx.combat, 'engineFire')
      : newState === 'red';
    if (ignite) {
      const fire = ctx.combat.fire;
      if (!fire.burning) res.fireStarted = true;
      fire.burning = true;
      fire.ticksLeft = Math.max(2, Math.round(FIRE_BASE_TICKS * equipMult(ctx.combat, 'fireTicks')));
      fire.tickTimer = 0;
    }
  }
  return res;
}

/**
 * Crew saving throw. RNG consumed once per crew intersection (fixed order).
 * @param {object} ctx resolution context
 * @param {string} crewName CrewName
 * @param {boolean} isHe use the reduced HE-splash chance
 * @returns {void}
 */
function rollCrewHit(ctx: ResolutionContext, crewName: string, isHe: boolean): void {
  const roll = ctx.rng(); // always consumed — fixed order
  if (!(crewName in ctx.combat.crew) || ctx.combat.crew[crewName] === false) return;
  // EQUIPMENT SYSTEM: spall liner halves crew hits from HE splash only —
  // direct penetrations bypass the liner.
  const chance = isHe
    ? CREW_HIT_CHANCE_HE * equipMult(ctx.combat, 'crewHe')
    : CREW_HIT_CHANCE;
  if (roll < chance) {
    ctx.combat.crew[crewName] = false;
    ctx.crewHit.push(crewName);
  }
}

/**
 * Post-damage bookkeeping: clamp HP, ammo-rack detonation, all-crew-dead.
 * @param {object} combat CombatState
 * @param {boolean} ammoRacked an ammo rack went red this resolution
 * @returns {boolean} the tank is (now) destroyed
 */
function finalizeTarget(combat: CombatState, ammoRacked: boolean): boolean {
  if (ammoRacked) combat.hp = 0;
  if (combat.hp <= 0) {
    combat.hp = 0;
    combat.destroyed = true;
  }
  const names = Object.keys(combat.crew);
  if (names.length > 0 && names.every((n) => combat.crew[n] === false)) {
    combat.destroyed = true;
    combat.hp = 0;
  }
  if (combat.destroyed) combat.fire.burning = false;
  return combat.destroyed;
}

/**
 * Build a HitEvent skeleton (ARCHITECTURE.md §2.6) — payload positions are
 * plain [x,y,z] so events stay JSON-serializable.
 * @param {object} shell ShellEntity
 * @param {string|null} targetId
 * @returns {object} HitEvent with defaults
 */
function baseEvent(shell: DamageShell, targetId: string | null): HitEvent {
  return {
    kind: 'nonpen',
    shellId: shell.id,
    shellType: shell.spec.type,
    caliberMm: shell.spec.caliberMm,
    attackerId: shell.shooterId,
    targetId,
    pos: [shell.pos.x, shell.pos.y, shell.pos.z],
    normal: [0, 1, 0],
    impactAngleDeg: 0,
    effectiveMm: 0,
    penRollMm: 0,
    damage: 0,
    targetHpAfter: 0,
    modulesHit: [],
    crewHit: [],
    fireStarted: false,
    ammoRacked: false,
    destroyed: false,
    eraPlate: null,
    eraActivations: [],
    // --- SHOT-INFO ENRICHMENT (ADDITIVE ONLY — consumed by src/ui/shotInfo.ts;
    // existing fields/math above are untouched) ------------------------------
    shellName: shell.spec.name || shell.spec.type, // display name of the round
    penRollFreshMm: shell.freshPenRollMm || 0, // pre-ERA/screen ±25% roll
    flightDistM: shell.distM > 0 ? shell.distM : shell.ageS * shell.spec.velocityMps,
    dmgRoll: shell.dmgRoll || 0,   // once-per-shot ±25% damage roll (pre-mitigation)
    zone: null,                    // armor-model plate/box name, e.g. 'lower_glacis'
    plateKind: null,               // 'main' | 'spaced' | 'external' | 'era'
    physicalMm: 0,                 // struck plate physical thickness
    nominalMm: 0,                  // nominal RHAe the shell class sees (ke/ce base)
    localPos: null,                // hit point in HULL-LOCAL space [x,y,z]
    localDir: null,                // shell direction in HULL-LOCAL space [x,y,z]
    // Exact articulation-local contact emitted by armor.ts. Unlike localPos,
    // this remains stable on a traversed turret or elevated gun housing and
    // lets decals attach to the actual rig node without an envelope guess.
    impactFrame: null,             // 'hull' | 'turret' | 'gun' | 'barrel'
    impactLocalPos: null,
    impactLocalNormal: null,
    impactLocalDir: null,
  };
}

/** Preserve every reactive layer crossed by one penetrating shell. */
function recordEraActivation(event: HitEvent, hit: PlateHit): void {
  const plate = hit.plate.name;
  event.eraPlate = plate; // Backward-compatible primary/last activation.
  if (event.eraActivations.some((activation) => activation.plate === plate)) return;
  event.eraActivations.push({
    plate,
    pos: [hit.point.x, hit.point.y, hit.point.z],
    normal: hit.normal
      ? [hit.normal.x, hit.normal.y, hit.normal.z]
      : [0, 1, 0],
  });
}

/**
 * SHOT-INFO ENRICHMENT (additive): stamp zone id, nominal armor and the hit
 * point/shell direction transformed into the target's HULL-LOCAL frame (exact
 * inverse of the tankFactory 'YXZ' visual mapping, same convention as
 * armor.ts buildFrames). Never touches pre-existing event fields.
 * @param {object} event HitEvent being built (event.pos already stamped)
 * @param {object|null} hit the decisive traceTank intersection (plate/module)
 * @param {object} shellSpec ShellSpec
 * @param {object|null} target {state,...} — null skips localization
 * @param {Vector3|null} vel world shell velocity (pre-deflection) or blast dir
 * @returns {void}
 */
function stampShotInfo(
  event: HitEvent,
  hit: ArmorHit | null,
  shellSpec: DamageShellSpec,
  target: DamageTarget | null,
  vel: Vector3 | null,
): void {
  if (hit) {
    if (hit.kind === 'plate') {
      event.zone = hit.plate.name;
      event.plateKind = hit.plate.kind;
      event.physicalMm = hit.plate.physicalMm;
      // Must mirror effectiveThickness's base pick: KE tests keMm, everything
      // else (CE jets AND HE/HESH blast) tests ceMm — an HE event on a
      // composite plate must report the CE rating the pen check actually used.
      const b = behaviorOf(shellSpec.type);
      event.nominalMm = b.kindClass === 'KE' ? hit.plate.keMm : hit.plate.ceMm;
    } else if (hit.kind === 'module' && hit.barrel) {
      event.zone = 'gun_barrel';
    } else if (hit.kind === 'module') {
      event.zone = hit.module;
    }
    if (hit.impactFrame && isFiniteNumber(hit.impactLocalX)
        && isFiniteNumber(hit.impactLocalY) && isFiniteNumber(hit.impactLocalZ)) {
      event.impactFrame = hit.impactFrame;
      event.impactLocalPos = [
        hit.impactLocalX, hit.impactLocalY, hit.impactLocalZ,
      ];
      if (isFiniteNumber(hit.impactLocalNormalX)
          && isFiniteNumber(hit.impactLocalNormalY)
          && isFiniteNumber(hit.impactLocalNormalZ)) {
        event.impactLocalNormal = [
          hit.impactLocalNormalX, hit.impactLocalNormalY, hit.impactLocalNormalZ,
        ];
      }
      if (isFiniteNumber(hit.impactLocalDirX)
          && isFiniteNumber(hit.impactLocalDirY)
          && isFiniteNumber(hit.impactLocalDirZ)) {
        event.impactLocalDir = [
          hit.impactLocalDirX, hit.impactLocalDirY, hit.impactLocalDirZ,
        ];
      }
    }
  }
  const st = target ? target.state : null;
  if (!st || !st.pos) return;
  _siEuler.set(-st.visualPitch, st.yaw, st.visualRoll, 'YXZ');
  _siQuat.setFromEuler(_siEuler);
  _siMat.compose(st.pos, _siQuat, _siOne).invert();
  _siV.set(event.pos[0], event.pos[1], event.pos[2]).applyMatrix4(_siMat);
  event.localPos = [_siV.x, _siV.y, _siV.z];
  if (vel && vel.lengthSq() > 1e-9) {
    _siDir.copy(vel).normalize().applyQuaternion(_siQuat.invert());
    event.localDir = [_siDir.x, _siDir.y, _siDir.z];
  }
}

/** Stamp a plate intersection onto an event. */
function stampImpact(event: HitEvent, hit: PlateHit, effMm: number, penMm: number): void {
  event.pos = [hit.point.x, hit.point.y, hit.point.z];
  if (hit.normal) event.normal = [hit.normal.x, hit.normal.y, hit.normal.z];
  event.impactAngleDeg = hit.impactAngleDeg ?? 0;
  event.effectiveMm = effMm;
  event.penRollMm = penMm;
}

/** Spaced-armor value of a gun-barrel crossing (armor doc §4/§7). */
function barrelScreenMm(hit: ModuleHit): number {
  const r = (hit.barrelRadiusM ?? 0) > 0
    ? hit.barrelRadiusM!
    : BARREL_DEFAULT_RADIUS_M;
  return Math.min(
    BARREL_SCREEN_MAX_MM,
    Math.max(BARREL_SCREEN_MIN_MM, r * BARREL_SCREEN_MM_PER_RADIUS_M)
  );
}

/**
 * Reflect a shell off a plate intersection (shared by live and wreck
 * ricochets): mirror the velocity about the outward normal and restart the
 * swept segment just outside the surface.
 * @param {object} shell ShellEntity
 * @param {object} hit plate intersection with point + normal
 * @returns {void}
 */
function deflectShell(shell: DamageShell, hit: PlateHit): void {
  shell.bounces += 1;
  _reflN.copy(hit.normal);
  const vdotn = shell.vel.dot(_reflN);
  shell.vel.addScaledVector(_reflN, -2 * vdotn);
  shell.pos.copy(hit.point).addScaledVector(_reflN, 0.02);
  shell.prevPos.copy(shell.pos);
}

/**
 * Ensure the shell's once-per-shot pen AND damage rolls exist (±25% each,
 * armor doc §6/§12: both made once per shot, in that order). Consumes rng only
 * on the first resolution of this shell — a ricochet or carry-through reuses
 * the same rolls against the next victim and costs no extra RNG draws.
 * @param {object} shell ShellEntity
 * @param {function} rng
 * @returns {void}
 */
function ensurePenRoll(shell: DamageShell, rng: Rng): void {
  if (shell.penRollDone) return;
  // True arc length accumulated by stepShell (gravity-bent paths are longer
  // than age × muzzle velocity); fall back for shells that never stepped.
  const distM = shell.distM > 0 ? shell.distM : shell.ageS * shell.spec.velocityMps;
  shell.remainingPenMm = rollUniform(rng, penAtDistanceMm(shell.spec, distM));
  // SHOT-INFO ENRICHMENT (additive, killcam_shotinfo r6): keep the original
  // once-per-shot roll — ERA/screens degrade remainingPenMm in-event, and the
  // shot card / killcam print the cut as 'fresh → residual / nominal'.
  shell.freshPenRollMm = shell.remainingPenMm;
  shell.dmgRoll = rollUniform(rng, shell.spec.dmg);
  shell.penRollDone = true;
}

/**
 * Weakest MAIN hull/turret plate (keMm) of an armor model — the nominal
 * thickness charged to a shell that entered through an authored-plate seam
 * (ENVELOPE-SEAM CATCH in resolveShellHit). Cached on the model.
 * @param {object} armorModel ArmorModel
 * @returns {number} mm
 */
function seamArmorMm(armorModel: DamageArmorModel): number {
  if (armorModel._seamMm != null) return armorModel._seamMm;
  let mm = Infinity;
  let plate = null;
  const scan = (plates: DamageArmorPlate[] | undefined): void => {
    if (!plates) return;
    for (const p of plates) {
      if ((p.kind || 'main') !== 'main') continue;
      const ke = p.keMm != null ? p.keMm : (p.physicalMm || 0);
      if (ke > 0 && ke < mm) { mm = ke; plate = p; }
    }
  };
  scan(armorModel.hullPlates);
  scan(armorModel.turretPlates);
  if (!isFinite(mm)) mm = 40;
  armorModel._seamMm = mm;
  // SHOT-INFO (killcam_shotinfo r5): surrogate plate identity, so the seam
  // catch below can stamp WHICH plate the shell was charged with.
  armorModel._seamPlate = plate;
  return mm;
}

/**
 * Resolve a kinetic/HEAT (or direct-fire HE) shell against one tank. Walks the
 * ordered traceTank intersections: ricochet on raw angle (3× overmatch
 * suppression), ERA tiles, spaced screens (HEAT air-gap decay), main-armor pen
 * check, hull damage, then the 10×caliber internal module/crew sweep with
 * saving throws and fire rolls. Mutates `target.combat` and the shell
 * (dead/deflected). Ricochets with bounces < 2 leave the shell alive with a
 * deflected velocity; a KE shell that overpenetrates with pen to spare exits
 * the far side and may strike a second vehicle (one carry-through max).
 *
 * @param {object} shell ShellEntity
 * @param {object} target TankEntity-shaped {id, spec, state, combat}
 * @param {Array<object>} hits traceTank result for the shell's swept segment
 * @param {function} rng () => [0,1)
 * @returns {object} HitEvent
 */
export function resolveShellHit(
  shell: DamageShell,
  target: DamageTarget,
  hits: ArmorHit[],
  rng: Rng,
): HitEvent {
  const spec = shell.spec;
  const combat = target.combat;
  const behavior = behaviorOf(spec.type);

  // Arc-length correction (killcam_shotinfo r2): stepShell accumulated the
  // FULL step before this sweep resolved — trim the unused remainder past the
  // first intersection (up to velocity/60 ≈ 28 m for APFSDS). prevPos-based so
  // synthetic shells that never stepped (prevPos === pos, e.g. the staged
  // killcam_xray shot) are untouched. Restored on the screen-pierce exits
  // where the shell truly keeps flying from shell.pos.
  const overshootM = hits.length > 0
    ? Math.max(0, shell.prevPos.distanceTo(shell.pos) - shell.prevPos.distanceTo(hits[0].point))
    : 0;
  if (overshootM > 0) shell.distM = Math.max(0, shell.distM - overshootM);

  // Fixed RNG order: pen, dmg (both once per shot), then per-intersection rolls.
  ensurePenRoll(shell, rng);
  const dmgRoll = shell.dmgRoll;

  // Destroyed hulls are inert cover: they absorb, deflect or screen the shell
  // with zero damage events and zero extra RNG draws.
  if (combat.destroyed) {
    const wev = resolveWreckHit(shell, hits);
    if (!shell.dead && wev.kind === 'screen_pierce') shell.distM += overshootM;
    return wev;
  }

  if (behavior.kindClass === 'HE') {
    const event = heDirectHit(shell, target, hits, dmgRoll, rng);
    shell.dead = true;
    return event;
  }

  const event = baseEvent(shell, target.id);
  const ctx = { combat, shellSpec: spec, rng, modulesHit: event.modulesHit, crewHit: event.crewHit };

  let pen = shell.remainingPenMm;
  let hullPen = false;
  let entryPoint: Vector3 | null = null;
  const limitM = (spec.caliberMm * POSTPEN_CALIBERS) / 1000;
  let decided = false;
  // STRADDLING-BOX DEFERRAL (module_hitbox r1): internal module/crew boxes are
  // reported once, at their ENTRY t — a box whose entry face sits OUTSIDE the
  // armor (Tiger sponson racks hugging the hull side, Merkava front engines
  // wrapping past the glacis) used to be consumed pre-pen and never rolled,
  // even though the shell crosses the box interior after penetrating. Such
  // boxes are parked here and rolled at the pen when their span (t..tExit)
  // extends past the penetrated plate.
  const straddlers: Array<ModuleHit | CrewHit> = [];

  for (const hit of hits) {
    if (hullPen && entryPoint && hit.point.distanceTo(entryPoint) > limitM) break;

    if (hit.kind === 'module') {
      const external = hit.external === true || hit.module === 'gun';
      if (external || hullPen) {
        const r = rollModuleDamage(ctx, hit.module);
        event.fireStarted = event.fireStarted || r.fireStarted;
        event.ammoRacked = event.ammoRacked || r.ammoRacked;
      } else if (!hit.barrel) {
        straddlers.push(hit);
      }
      // The barrel doubles as a spaced layer (armor doc §4/§7): crossing the
      // cylinder costs pen whether or not the gun-damage save landed.
      if (hit.barrel && !hullPen) {
        pen -= barrelScreenMm(hit);
        if (pen <= 0) {
          event.kind = 'nonpen';
          event.pos = [hit.point.x, hit.point.y, hit.point.z];
          stampShotInfo(event, hit, spec, target, shell.vel); // SHOT-INFO (additive)
          shell.dead = true;
          decided = true;
          break;
        }
      }
      continue;
    }
    if (hit.kind === 'crew') {
      if (hullPen) rollCrewHit(ctx, hit.crew, false);
      else straddlers.push(hit);
      continue;
    }

    const plate = hit.plate;
    const angle = hit.impactAngleDeg;

    // Spent ERA tiles are gone from the model — nothing to bounce off or spend.
    if (plate.kind === 'era' && combat.eraSpent.has(plate.name)) continue;

    // --- 1. Ricochet on the raw angle (outer surfaces only). Checked on
    // EVERY plate — ERA tiles included, per the armor doc §12 consolidated
    // algorithm: a HEAT jet grazing a tile past 85° deflects WITHOUT
    // detonating it. The 3× overmatch rule suppresses this for nearly all
    // KE vs thin tiles, so rods still spend tiles as before.
    if (!hullPen && wouldRicochet(spec, angle, plate)) {
      event.kind = 'ricochet';
      stampImpact(event, hit, 0, pen);
      stampShotInfo(event, hit, spec, target, shell.vel); // SHOT-INFO (pre-deflection)
      deflectShell(shell, hit);
      const isHeat = behavior.kindClass === 'CE';
      if (isHeat || shell.bounces >= RICOCHET_MAX_BOUNCES) shell.dead = true;
      shell.remainingPenMm = pen; // full pen retained through the bounce
      // Screens crossed BEFORE the bouncing plate may have rolled moduleLink
      // damage (a linked ammoRack/fuelTank can go red on this very trace), so
      // the destroyed flag must be re-evaluated on this exit path too.
      event.destroyed = finalizeTarget(combat, event.ammoRacked);
      event.targetHpAfter = combat.hp;
      return event;
    }

    // --- ERA tile: detonates once, cuts pen, never stops processing unless
    // the remaining pen hits zero (armor doc §11.2). A tandem warhead's
    // precursor charge pops the tile and the main jet passes uncut.
    if (plate.kind === 'era') {
      combat.eraSpent.add(plate.name);
      recordEraActivation(event, hit);
      if (spec.tandem) continue;
      const era = plate.era || { keReduction: 0, ceFlatMm: 0 };
      if (behavior.kindClass === 'CE') pen = Math.max(0, pen - era.ceFlatMm);
      else if (behavior.kindClass === 'KE') pen *= 1 - era.keReduction;
      if (pen <= 0 && !hullPen) {
        event.kind = 'era';
        stampImpact(event, hit, 0, 0);
        stampShotInfo(event, hit, spec, target, shell.vel); // SHOT-INFO (additive)
        shell.dead = true;
        decided = true;
        break;
      }
      continue;
    }

    // --- 2–3. Normalization (+overmatch boost) and effective thickness.
    const { effMm } = effectiveThickness(spec, plate, angle);

    // --- Spaced / external screens: absorb pen, HEAT decays over the gap.
    if (plate.kind === 'spaced' || plate.kind === 'external') {
      const penBefore = pen;
      pen -= effMm;
      if (spec.type === 'HEAT' && pen > 0) {
        // Gap measured to the NEXT armor layer of any kind (spaced or main,
        // ERA tiles excluded) so stacked screens never double-count a gap.
        let gapM = 0;
        for (const next of hits) {
          if (next.t > hit.t && next.kind === 'plate' && next.plate.kind !== 'era') {
            gapM = hit.point.distanceTo(next.point);
            break;
          }
        }
        pen *= Math.max(0, 1 - HEAT_GAP_LOSS_PER_M * gapM);
      }
      if (plate.moduleLink) {
        const r = rollModuleDamage(ctx, plate.moduleLink);
        event.fireStarted = event.fireStarted || r.fireStarted;
        event.ammoRacked = event.ammoRacked || r.ammoRacked;
      }
      if (pen <= 0 && !hullPen) {
        event.kind = 'spaced_absorb';
        stampImpact(event, hit, effMm, penBefore);
        stampShotInfo(event, hit, spec, target, shell.vel); // SHOT-INFO (additive)
        shell.dead = true;
        decided = true;
        break;
      }
      continue;
    }

    // --- 4. Main armor pen check (±25% roll already folded into pen).
    if (pen >= effMm) {
      if (!hullPen) {
        hullPen = true;
        entryPoint = hit.point;
        event.kind = 'pen';
        stampImpact(event, hit, effMm, pen);
        stampShotInfo(event, hit, spec, target, shell.vel); // SHOT-INFO (additive)
        event.damage = dmgRoll;
        combat.hp -= dmgRoll;
        decided = true;
        // STRADDLING-BOX FLUSH: deferred boxes whose span extends past this
        // plate lie on the post-pen path — their overlap BEGINS at the pen
        // point (distance 0, so the 10-caliber limit can't exclude them).
        // Rolled in trace order, before any deeper intersection, keeping the
        // per-shot RNG sequence deterministic.
        for (const pb of straddlers) {
          if (!(pb.tExit! > hit.t)) continue;
          if (pb.kind === 'crew') {
            rollCrewHit(ctx, pb.crew, false);
          } else {
            const r = rollModuleDamage(ctx, pb.module);
            event.fireStarted = event.fireStarted || r.fireStarted;
            event.ammoRacked = event.ammoRacked || r.ammoRacked;
          }
        }
      }
      pen -= effMm;
    } else {
      if (!hullPen) {
        event.kind = 'nonpen';
        stampImpact(event, hit, effMm, pen);
        stampShotInfo(event, hit, spec, target, shell.vel); // SHOT-INFO (additive)
        decided = true;
      }
      shell.dead = true;
      break;
    }
  }

  shell.remainingPenMm = Math.max(0, pen);

  // --- Screen pierce (armor doc §7): the trace crossed ONLY spaced/external
  // layers, ERA tiles and/or the barrel (skirt overhang, track-plate edge,
  // bustle rack) without reaching main armor. A kinetic shell with pen to
  // spare subtracts the screens and keeps flying — its swept segment already
  // exits the model, so no teleport is needed and no misleading 'nonpen'
  // clang is emitted. HEAT jets form on the first surface and are spent;
  // anything without pen left is likewise done.
  if (!decided && !hullPen && !shell.dead) {
    const first = hits.length > 0 ? hits[0] : null;
    if (first) event.pos = [first.point.x, first.point.y, first.point.z];
    // SHOT-INFO (additive): zone from the first plate the trace crossed.
    const firstPlate = hits.find((h) => h.kind === 'plate') || first;
    if (firstPlate) stampShotInfo(event, firstPlate, spec, target, shell.vel);
    // ENVELOPE-SEAM CATCH (controls_gunnery r2): the trace crossed INTERIOR
    // module/crew boxes without a single armor plate — the segment slipped
    // through a seam between authored plates (measured on leo2a4: 26/300
    // on-target rays, e.g. the side of the glacis nose wedge and the turret
    // cheek/side joint; gate battle 2 logged THREE consecutive center-mass
    // APFSDS "screen_pierce" hits for 0 damage). A shell inside the fighting
    // compartment did not get there for free: charge it the tank's weakest
    // MAIN plate and resolve as a normal pen/nonpen instead of a free
    // pass-through. True grazes (barrel / skirt edge / external boxes only)
    // still screen_pierce with zero damage.
    const seamInterior = hits.some((h) =>
      h.kind === 'crew' ||
      (h.kind === 'module' && h.external !== true && !h.barrel
        && h.module !== 'gun' && h.module !== 'trackL' && h.module !== 'trackR'));
    // Geometry-derived closed shells make this compatibility catch both
    // unnecessary and actively misleading: a ray that reaches an internal
    // system has already crossed an exact collision face. Keep it only for
    // old hand-built/synthetic armor models that do not expose closed cells.
    const hasClosedCollisionShell = !!(
      target.spec.armor?.collisionShells?.hull?.length
      || target.spec.armor?.collisionShells?.turret?.length
    );
    if (seamInterior && !hasClosedCollisionShell) {
      const seamMm = seamArmorMm(target.spec.armor);
      // SHOT-INFO (killcam_shotinfo r5, ADDITIVE): the seam check charges the
      // tank's weakest MAIN plate — stamp that surrogate plate's armor story
      // onto the event BEFORE resolution so the shot card / killcam never
      // print a PENETRATION with '—' armor, '—' pen roll and '—' zone (the
      // player's most important feedback was blank on every seam catch, r5
      // major). Zone is prefixed 'seam_' so zoneLabel renders e.g.
      // 'seam hull side upper R' — flagged as a seam, never posing as a
      // clean plate hit. event.pos/localPos/localDir were already stamped
      // from the first intersection above. No RNG, no damage math touched.
      const seamPlate = target.spec.armor._seamPlate || null;
      event.zone = `seam_${(seamPlate && seamPlate.name) || 'hull'}`;
      event.plateKind = 'main';
      event.physicalMm = (seamPlate && seamPlate.physicalMm) || seamMm;
      event.nominalMm = seamMm;   // the KE base the seam check actually used
      event.effectiveMm = seamMm; // charged at face value — no normal at a seam
      event.penRollMm = pen;      // the shell's rolled pen tested against it
      if (pen >= seamMm) {
        event.kind = 'pen';
        event.damage = dmgRoll;
        combat.hp -= dmgRoll;
        for (const h of hits) {
          if (h.kind === 'module' && h.external !== true && !h.barrel
              && h.module !== 'gun' && h.module !== 'trackL' && h.module !== 'trackR') {
            const r = rollModuleDamage(ctx, h.module);
            event.fireStarted = event.fireStarted || r.fireStarted;
            event.ammoRacked = event.ammoRacked || r.ammoRacked;
          } else if (h.kind === 'crew') {
            rollCrewHit(ctx, h.crew, false);
          }
        }
      } else {
        event.kind = 'nonpen';
      }
      shell.dead = true;
      event.destroyed = finalizeTarget(combat, event.ammoRacked);
      event.targetHpAfter = combat.hp;
      return event;
    }
    if (behavior.kindClass === 'KE' && shell.remainingPenMm > 0) {
      event.kind = 'screen_pierce';
      event.destroyed = finalizeTarget(combat, event.ammoRacked);
      event.targetHpAfter = combat.hp;
      shell.distM += overshootM; // shell keeps flying from shell.pos
      return event; // shell stays alive on its unchanged trajectory
    }
    event.kind = hits.some((h) => h.kind === 'plate') ? 'spaced_absorb' : 'nonpen';
    shell.dead = true;
  }

  // --- Carry-through (armor doc §7): a kinetic shell that fully penetrated,
  // was not stopped by any deeper layer, and still has pen left may exit and
  // strike a second vehicle. Capped to one carry-through per shell; HEAT jets
  // never survive the target.
  const carries =
    hullPen &&
    !shell.dead &&
    shell.remainingPenMm > 0 &&
    behavior.kindClass === 'KE' &&
    !shell.carriedThrough &&
    entryPoint !== null;
  if (carries) {
    const exitEntryPoint = entryPoint!;
    shell.carriedThrough = true;
    // Exit point just past the target's broadphase sphere so next frame's
    // sweep starts outside the victim.
    _carryDir.copy(shell.vel).normalize();
    const armor = target.spec.armor;
    const boundR = (armor && armor.boundingRadiusM) || 4;
    _center.copy(target.state.pos);
    _center.y += target.spec.dims ? target.spec.dims.heightM * 0.5 : 1.2;
    _carryV.subVectors(_center, exitEntryPoint);
    const proj = _carryV.dot(_carryDir);
    const d2 = Math.max(0, _carryV.lengthSq() - proj * proj);
    const half = Math.sqrt(Math.max(0, boundR * boundR - d2));
    const exitDist = Math.max(0, proj) + half + 0.05;
    _exitPos.copy(exitEntryPoint).addScaledVector(_carryDir, exitDist);

    // The exit is NOT free (armor doc §7: remainingPen after passing through
    // everything): re-trace the exit segment from OUTSIDE back toward the
    // entry point — traceTank only reports front faces, so the reversed ray
    // sees exactly the far-side plates the shell must punch out through.
    // Subtract each one's effective thickness; the shell dies inside the tank
    // if the back armor eats the rest of the pen.
    if (armor && target.state) {
      const exitHits = traceTank(
        _exitPos,
        exitEntryPoint,
        tankPoseFromState(target.state),
        armor,
        combat.eraSpent
      ) as ArmorHit[];
      let exitPen = shell.remainingPenMm;
      for (const eh of exitHits) {
        if (eh.kind !== 'plate' || eh.plate.kind === 'era') continue;
        const { effMm } = effectiveThickness(spec, eh.plate, eh.impactAngleDeg);
        exitPen -= effMm;
        if (exitPen <= 0) break;
      }
      shell.remainingPenMm = Math.max(0, exitPen);
    }
    if (shell.remainingPenMm > 0) {
      shell.pos.copy(_exitPos);
      shell.prevPos.copy(shell.pos);
    } else {
      shell.dead = true; // stopped by the far-side armor
    }
  } else {
    shell.dead = true;
  }
  event.destroyed = finalizeTarget(combat, event.ammoRacked);
  event.targetHpAfter = combat.hp;
  return event;
}

/**
 * HE blast module/crew sweep over the blast SPHERE (armor doc §8 step 3,
 * shells doc §6): every module/crew box of the armor model whose world-space
 * center lies inside `radiusM` of the burst gets a roll — external boxes
 * (gun, optics, tracks) at full odds/full damage, internal boxes at half,
 * crew at the reduced HE chance. Boxes are enumerated from the armor model —
 * NOT the flight ray — so off-axis tracks and engines are reachable, which is
 * what makes HE the reliable de-tracking round. Hand-built probes without an
 * armor model fall back to the ray-intersection sweep.
 *
 * RNG order (fixed): modules in model order, then crew in model order (ray
 * order on the fallback path). `skipModule` dedupes a module already rolled
 * via the struck plate's moduleLink.
 *
 * @param {object} ctx resolution context (chanceScale/dmgScale overwritten)
 * @param {object} event HitEvent being built
 * @param {object} target {spec, state, combat}
 * @param {Vector3} center world burst point
 * @param {number} radiusM blast radius
 * @param {Array<object>|null} hits traceTank result (fallback path)
 * @param {string|null} skipModule module already rolled at full odds
 * @returns {void}
 */
function sweepHeBlast(
  ctx: ResolutionContext,
  event: HitEvent,
  target: DamageTarget,
  center: Vector3,
  radiusM: number,
  hits: ArmorHit[] | null,
  skipModule: ModuleId | null | undefined,
): void {
  const armor = target.spec ? target.spec.armor : null;
  const rolled = new Set(skipModule ? [skipModule] : []);
  const useBoxes =
    armor && target.state && ((armor.modules && armor.modules.length) || (armor.crew && armor.crew.length));
  if (useBoxes) {
    const boxes = blastTargets(tankPoseFromState(target.state), armor);
    for (const box of boxes) {
      if (box.point.distanceTo(center) > radiusM) continue;
      if (box.kind === 'module') {
        const moduleName = box.name as ModuleId;
        if (rolled.has(moduleName)) continue;
        rolled.add(moduleName);
        const external = box.external || moduleName === 'gun';
        ctx.chanceScale = external ? 1 : 0.5;
        ctx.dmgScale = external ? 1 : 0.5;
        const r = rollModuleDamage(ctx, moduleName);
        event.fireStarted = event.fireStarted || r.fireStarted;
        event.ammoRacked = event.ammoRacked || r.ammoRacked;
      } else {
        rollCrewHit(ctx, box.name, true);
      }
    }
  } else {
    for (const hit of hits || []) {
      if (hit.point.distanceTo(center) > radiusM) continue;
      if (hit.kind === 'module') {
        if (rolled.has(hit.module)) continue;
        rolled.add(hit.module);
        const external = hit.external === true || hit.module === 'gun';
        ctx.chanceScale = external ? 1 : 0.5;
        ctx.dmgScale = external ? 1 : 0.5;
        const r = rollModuleDamage(ctx, hit.module);
        event.fireStarted = event.fireStarted || r.fireStarted;
        event.ammoRacked = event.ammoRacked || r.ammoRacked;
      } else if (hit.kind === 'crew') {
        rollCrewHit(ctx, hit.crew, true);
      }
    }
  }
  ctx.chanceScale = 1;
  ctx.dmgScale = 1;
}

/**
 * Resolve a shell against a DESTROYED tank: the wreck is inert cover. Plates
 * still deflect (raw-angle ricochet) and absorb, but nothing takes damage, no
 * module/crew/fire rolls run (zero RNG draws) and every event carries
 * `targetId: null` so HUD damage feedback and AI nonpen counting ignore it.
 * KE/CE shells die with a clang on the first main plate; screens subtract as
 * usual (a kinetic round may pierce a wreck's skirt edge and keep flying);
 * HE-class shells burst on the surface with zero damage.
 *
 * @param {object} shell ShellEntity
 * @param {Array<object>} hits traceTank result against the wreck
 * @returns {object} HitEvent (targetId null, damage 0)
 */
function resolveWreckHit(shell: DamageShell, hits: ArmorHit[]): HitEvent {
  const spec = shell.spec;
  const b = behaviorOf(spec.type);
  const event = baseEvent(shell, null);
  let pen = shell.remainingPenMm;

  if (b.kindClass === 'HE') {
    // Detonates on the first surface of the wreck — fireball, no victims here
    // (the caller's burst resolution splashes live tanks around the point).
    const first = hits.find(isPlateHit) || hits[0] || null;
    event.kind = 'he_splash';
    if (first) event.pos = [first.point.x, first.point.y, first.point.z];
    if (first && first.normal) event.normal = [first.normal.x, first.normal.y, first.normal.z];
    shell.dead = true;
    return event;
  }

  for (const hit of hits) {
    if (hit.kind !== 'plate') {
      if (hit.kind === 'module' && hit.barrel) {
        pen -= barrelScreenMm(hit);
        if (pen <= 0) {
          event.kind = 'nonpen';
          event.pos = [hit.point.x, hit.point.y, hit.point.z];
          shell.dead = true;
          return event;
        }
      }
      continue; // dead modules/crew: nothing to roll
    }
    const plate = hit.plate;
    const angle = hit.impactAngleDeg;

    if (wouldRicochet(spec, angle, plate)) {
      event.kind = 'ricochet';
      stampImpact(event, hit, 0, pen);
      deflectShell(shell, hit);
      shell.remainingPenMm = pen;
      if (b.kindClass === 'CE' || shell.bounces >= RICOCHET_MAX_BOUNCES) shell.dead = true;
      return event;
    }

    const { effMm } = effectiveThickness(spec, plate, angle);
    if (plate.kind === 'main') {
      // Wreck hull swallows the shell outright — spark/clang, no damage.
      event.kind = 'nonpen';
      stampImpact(event, hit, effMm, pen);
      shell.dead = true;
      return event;
    }
    // Spaced/external/ERA layers on a wreck are plain inert steel.
    pen -= effMm;
    if (pen <= 0) {
      event.kind = 'spaced_absorb';
      stampImpact(event, hit, effMm, shell.remainingPenMm);
      shell.dead = true;
      return event;
    }
  }

  // Crossed only screens/barrel with pen to spare.
  shell.remainingPenMm = Math.max(0, pen);
  const first = hits.length > 0 ? hits[0] : null;
  if (first) event.pos = [first.point.x, first.point.y, first.point.z];
  if (b.kindClass === 'KE' && shell.remainingPenMm > 0) {
    event.kind = 'screen_pierce'; // shell keeps flying
    return event;
  }
  event.kind = hits.some((h) => h.kind === 'plate') ? 'spaced_absorb' : 'nonpen';
  shell.dead = true;
  return event;
}

/**
 * Armor layering behind an HE burst surface (armor doc §7/§8): when the blast
 * lands on a spaced/external screen, every deeper non-ERA plate down to (and
 * including) the first 'main' plate joins the absorption term, and the
 * screen→deepest-counted-plate air gap extends the splash falloff distance.
 * SHARED by the direct-hit and area-splash paths so side skirts EAT splash
 * identically whether the shell struck the tank or burst nearby.
 *
 * @param {Array<object>} hits ordered traceTank result
 * @param {object} plateHit the first non-ERA plate the blast reaches
 * @returns {{armorMm: number, gapM: number}} extra armor behind the screen
 *   and the air gap to it (both 0 when plateHit is already main armor)
 */
function heScreenStack(
  hits: ArmorHit[],
  plateHit: PlateHit,
): { armorMm: number; gapM: number } {
  let armorMm = 0;
  let gapM = 0;
  if (plateHit.plate.kind === 'spaced' || plateHit.plate.kind === 'external') {
    for (const next of hits) {
      if (next.t <= plateHit.t || next.kind !== 'plate' || next.plate.kind === 'era') continue;
      armorMm += next.plate.physicalMm;
      gapM = plateHit.point.distanceTo(next.point);
      if (next.plate.kind === 'main') break;
    }
  }
  return { armorMm, gapM };
}

/**
 * HE direct-hit resolution against one tank: full-pen attempt on the struck
 * plate (LOS thickness, no normalization), else a surface burst using the
 * splash formula at dist 0 (armor doc §8, shells doc §6).
 *
 * @param {object} shell ShellEntity (type 'HE')
 * @param {object} target {id, spec, state, combat}
 * @param {Array<object>} hits traceTank result
 * @param {number} dmgRoll pre-rolled ±25% damage
 * @param {function} rng
 * @returns {object} HitEvent (kind 'he_pen' | 'he_splash')
 */
function heDirectHit(
  shell: DamageShell,
  target: DamageTarget,
  hits: ArmorHit[],
  dmgRoll: number,
  rng: Rng,
): HitEvent {
  const spec = shell.spec;
  const combat = target.combat;
  const event = baseEvent(shell, target.id);
  const ctx = { combat, shellSpec: spec, rng, modulesHit: event.modulesHit, crewHit: event.crewHit };

  let plateHit: PlateHit | null = null;
  let eraArmorMm = 0; // popped tiles add their thickness to splash armor (§11.2)
  for (const hit of hits || []) {
    if (hit.kind !== 'plate') continue;
    if (hit.plate.kind === 'era') {
      // HE pops the tile and detonates on it; the tile soaks blast — its
      // physical thickness joins the splash absorption term below.
      if (!combat.eraSpent.has(hit.plate.name)) {
        combat.eraSpent.add(hit.plate.name);
        recordEraActivation(event, hit);
      }
      eraArmorMm += hit.plate.physicalMm;
      continue;
    }
    plateHit = hit;
    break;
  }

  if (!plateHit) {
    event.kind = 'he_splash';
    event.targetHpAfter = combat.hp;
    return event;
  }

  const plate = plateHit.plate;
  const { effMm } = effectiveThickness(spec, plate, plateHit.impactAngleDeg);

  if (plate.kind === 'main' && shell.remainingPenMm >= effMm) {
    // Full HE penetration: full damage + internal blast sweep.
    event.kind = 'he_pen';
    stampImpact(event, plateHit, effMm, shell.remainingPenMm);
    stampShotInfo(event, plateHit, spec, target, shell.vel); // SHOT-INFO (additive)
    event.damage = dmgRoll;
    combat.hp -= dmgRoll;
    const limitM = (spec.caliberMm * POSTPEN_CALIBERS) / 1000;
    for (const hit of hits) {
      // Span-aware skip (module_hitbox r1, mirrors resolveShellHit's
      // straddler flush): a box ENTERED before the burst plate still counts
      // when its span extends past it — the blast crosses its interior.
      const spanEnd = hit.tExit !== undefined ? hit.tExit : hit.t;
      if (spanEnd <= plateHit.t) continue;
      if (hit.t > plateHit.t && hit.point.distanceTo(plateHit.point) > limitM) break;
      if (hit.kind === 'module') {
        const r = rollModuleDamage(ctx, hit.module);
        event.fireStarted = event.fireStarted || r.fireStarted;
        event.ammoRacked = event.ammoRacked || r.ammoRacked;
      } else if (hit.kind === 'crew') {
        rollCrewHit(ctx, hit.crew, false);
      }
    }
  } else {
    // Surface burst on the armor: splash formula at dist = 0. When the burst
    // sits on a spaced/external screen, the screen eats the blast (armor doc
    // §7): the absorption term stacks every armor layer down to the first
    // main plate, and the splash also attenuates over the air gap.
    event.kind = 'he_splash';
    const radiusM = blastRadiusM(spec.caliberMm);
    const stack = heScreenStack(hits, plateHit);
    const armorMm = plate.physicalMm + eraArmorMm + stack.armorMm;
    const distM = stack.gapM;
    const falloff = Math.max(0, 1 - Math.min(1, distM / radiusM));
    const spall = behaviorOf(spec.type).spallBonus ?? 1; // HESH 1.25 (shells doc §6)
    // EQUIPMENT SYSTEM: spall liner soaks NON-PENETRATING blast (×0.75);
    // full HE penetrations above are never reduced (WoT parity).
    const dmg = Math.max(0, 0.5 * dmgRoll * falloff - HE_ARMOR_ABSORB * armorMm) *
      spall * equipMult(combat, 'heSplash');
    stampImpact(event, plateHit, effMm, shell.remainingPenMm);
    stampShotInfo(event, plateHit, spec, target, shell.vel); // SHOT-INFO (additive)
    event.damage = dmg;
    combat.hp -= dmg;
    if (plate.moduleLink) {
      // The struck screen's own gear (tracks) gets shredded at full odds.
      const r = rollModuleDamage(ctx, plate.moduleLink);
      event.fireStarted = event.fireStarted || r.fireStarted;
      event.ammoRacked = event.ammoRacked || r.ammoRacked;
    }
    // Blast reaches crew/modules through hatches even without hull damage —
    // every box inside the blast SPHERE rolls, not just those on the flight
    // ray (armor doc §8 step 3, shells doc §6).
    sweepHeBlast(ctx, event, target, plateHit.point, radiusM, hits, plate.moduleLink);
  }

  event.destroyed = finalizeTarget(combat, event.ammoRacked);
  event.targetHpAfter = combat.hp;
  return event;
}

/**
 * Hull-local AABB over a tank's solid hull plates (ERA tiles excluded),
 * lazily computed once and cached on the armor model. Used by the HE splash
 * nearest-point query. Returns null when the model has no solid hull plates
 * (hand-built probes fall back to the center-ray path).
 * @param {object} armor ArmorModel
 * @returns {null | {min: number[], max: number[]}}
 */
function hullAabbOf(armor: DamageArmorModel): ArmorAabb | null {
  if (armor.__hullAabb !== undefined) return armor.__hullAabb;
  let aabb: ArmorAabb | null = null;
  if (Array.isArray(armor.hullPlates)) {
    for (const plate of armor.hullPlates) {
      if (plate.kind === 'era' || !Array.isArray(plate.verts)) continue;
      for (const v of plate.verts) {
        if (!aabb) {
          aabb = { min: [v[0], v[1], v[2]], max: [v[0], v[1], v[2]] };
        } else {
          for (let a = 0; a < 3; a++) {
            if (v[a] < aabb.min[a]) aabb.min[a] = v[a];
            if (v[a] > aabb.max[a]) aabb.max[a] = v[a];
          }
        }
      }
    }
  }
  armor.__hullAabb = aabb;
  return aabb;
}

/**
 * Find the plate an HE burst reaches on the NEAREST face of the target
 * (armor doc §8 nearest-point approximation): clamp the burst point to the
 * hull AABB in hull-local space (inset off exact edges), then trace
 * burstPoint → just past that surface point. A burst off a rear corner now
 * measures splash to the closest armor instead of wherever a burst→center
 * ray happens to cross — the center ray both overstated distance and could
 * miss wide hulls entirely. Returns null (caller falls back to the center
 * ray) when there is no AABB, the burst sits inside the hull volume, or the
 * trace finds no plate.
 * @param {Vector3} burstPoint world detonation point
 * @param {object} tank {spec, state, combat}
 * @param {object} pose tankPoseFromState result
 * @returns {Array<object>|null} traceTank hits toward the nearest point
 */
function nearestPointTrace(
  burstPoint: Vector3,
  tank: DamageTarget,
  pose: TankArmorPose,
): ArmorHit[] | null {
  const armor = tank.spec.armor;
  const aabb = hullAabbOf(armor);
  if (!aabb) return null;
  const st = tank.state;
  _siEuler.set(-st.visualPitch, st.yaw, st.visualRoll, 'YXZ');
  _siQuat.setFromEuler(_siEuler);
  _heMat.compose(st.pos, _siQuat, _siOne);
  _heInv.copy(_heMat).invert();
  _heLocal.copy(burstPoint).applyMatrix4(_heInv);

  let outside = false;
  for (let a = 0; a < 3; a++) {
    let lo = aabb.min[a] + HE_NEAREST_INSET_M;
    let hi = aabb.max[a] - HE_NEAREST_INSET_M;
    if (lo > hi) lo = hi = (aabb.min[a] + aabb.max[a]) * 0.5;
    const c = _heLocal.getComponent(a);
    const clamped = Math.min(hi, Math.max(lo, c));
    if (clamped !== c) outside = true;
    _heNearest.setComponent(a, clamped);
  }
  if (!outside) return null; // burst inside the hull volume — center ray

  _heNearest.applyMatrix4(_heMat);
  _heTo.subVectors(_heNearest, burstPoint);
  const dLen = _heTo.length();
  if (dLen < 1e-6) return null;
  // Extend 1 m past the nearest surface point so the segment fully crosses
  // the plate it lands on.
  _heTo.multiplyScalar((dLen + 1) / dLen).add(burstPoint);
  const hits = traceTank(
    burstPoint,
    _heTo,
    pose,
    tank.spec.armor,
    tank.combat.eraSpent,
  ) as ArmorHit[];
  for (const hit of hits) {
    if (hit.kind === 'plate' && hit.plate.kind !== 'era') return hits;
  }
  return null;
}

/**
 * Resolve an HE burst: direct-hit pen attempt on `directTarget` (if any),
 * otherwise a surface/terrain burst that splashes every tank whose nearest
 * armor lies inside blastRadiusM(caliber), with the classic
 * `0.5·dmg·(1 − d/R) − 1.1·armor` absorption (shells doc §6). Marks the shell
 * dead. RNG order: pen roll, dmg roll, then per-tank rolls in array order.
 *
 * @param {object} shell ShellEntity (type 'HE')
 * @param {Vector3} burstPoint world detonation point
 * @param {Array<object>} tanks TankEntity[] candidates for splash
 * @param {object|null} directTarget entity directly struck, or null
 * @param {Array<object>|null} directHits traceTank result for the direct hit
 * @param {function} rng
 * @returns {Array<object>} HitEvent[]
 */
export function resolveHeBurst(
  shell: DamageShell,
  burstPoint: Vector3,
  tanks: DamageTarget[],
  directTarget: DamageTarget | null,
  directHits: ArmorHit[] | null,
  rng: Rng,
): HitEvent[] {
  const spec = shell.spec;
  // Arc-length correction (killcam_shotinfo r2): HE shells always die at the
  // burst — trim the unused remainder of the final integration step.
  shell.distM = Math.max(
    0,
    shell.distM - Math.max(0, shell.prevPos.distanceTo(shell.pos) - shell.prevPos.distanceTo(burstPoint)),
  );
  ensurePenRoll(shell, rng);
  const dmgRoll = shell.dmgRoll;
  shell.dead = true;

  const events: HitEvent[] = [];
  let directPen = false;
  let directHadPlate = false;

  if (directTarget && directTarget.combat && directTarget.combat.destroyed) {
    // Direct hit on a wreck: HE detonates on the dead hull's surface (inert
    // cover, no damage there) and the burst splashes live tanks around it.
    // The zero-damage event (targetId null) still drives fireball FX/audio.
    const ev = baseEvent(shell, null);
    ev.kind = 'he_splash';
    ev.pos = [burstPoint.x, burstPoint.y, burstPoint.z];
    const firstPlate = directHits ? directHits.find(isPlateHit) : null;
    if (firstPlate && firstPlate.normal) {
      ev.normal = [firstPlate.normal.x, firstPlate.normal.y, firstPlate.normal.z];
    }
    events.push(ev);
  } else if (directTarget && directTarget.combat && directHits) {
    for (const h of directHits) {
      if (h.kind === 'plate' && h.plate.kind !== 'era') {
        directHadPlate = true;
        break;
      }
    }
    // A barrel-only graze has no plate to burst on: heDirectHit still pops any
    // ERA the trace touched, but the target is then splashed like any other
    // tank in the blast sphere instead of getting a free zero-damage event.
    const ev = heDirectHit(shell, directTarget, directHits, dmgRoll, rng);
    if (directHadPlate) {
      events.push(ev);
      directPen = ev.kind === 'he_pen';
    }
  }

  if (directPen) return events; // blast went inside — no external splash

  const radiusM = blastRadiusM(spec.caliberMm);
  for (const tank of tanks || []) {
    if (!tank || (directHadPlate && tank === directTarget)) continue;
    if (!tank.combat || tank.combat.destroyed) continue;
    const armor = tank.spec.armor;
    _center.copy(tank.state.pos);
    _center.y += armor.turretPivot ? armor.turretPivot[1] : 1.2;
    const centerDist = _center.distanceTo(burstPoint);
    if (centerDist - (armor.boundingRadiusM ?? 4) > radiusM) continue;

    const pose = tankPoseFromState(tank.state);
    // Nearest-point query first (armor doc §8): splash distance is measured
    // to the closest reachable armor, not to wherever the burst→center ray
    // crosses. Center ray remains the fallback for probes without hull
    // plates or bursts inside the hull volume.
    let hits = nearestPointTrace(burstPoint, tank, pose);
    if (!hits) {
      hits = traceTank(
        burstPoint,
        _center,
        pose,
        armor,
        tank.combat.eraSpent,
      ) as ArmorHit[];
    }
    let plateHit: PlateHit | null = null;
    for (const hit of hits) {
      if (hit.kind !== 'plate' || hit.plate.kind === 'era') continue;
      plateHit = hit;
      break;
    }
    if (!plateHit) continue;
    const surfaceDistM = plateHit.point.distanceTo(burstPoint);
    if (surfaceDistM >= radiusM) continue;

    const event = baseEvent(shell, tank.id);
    const ctx = {
      combat: tank.combat,
      shellSpec: spec,
      rng,
      modulesHit: event.modulesHit,
      crewHit: event.crewHit,
      chanceScale: 0.5,
      dmgScale: 0.5,
    };
    event.kind = 'he_splash';
    // Same layering as the direct-hit path (armor doc §7: spaced armor
    // absorbs HE splash almost completely): a burst reaching a side skirt
    // stacks skirt + everything down to the main plate into the absorption
    // term and attenuates over the extra air gap — screens must EAT splash,
    // never amplify it relative to a bare hull.
    const stack = heScreenStack(hits, plateHit);
    const armorMm = plateHit.plate.physicalMm + stack.armorMm;
    const distM = surfaceDistM + stack.gapM;
    const falloff = Math.max(0, 1 - Math.min(1, distM / radiusM));
    const spall = behaviorOf(spec.type).spallBonus ?? 1; // HESH 1.25 (shells doc §6)
    // EQUIPMENT SYSTEM: spall liner soaks blast-sphere splash too (×0.75).
    const dmg = Math.max(0, 0.5 * dmgRoll * falloff - HE_ARMOR_ABSORB * armorMm) *
      spall * equipMult(tank.combat, 'heSplash');
    stampImpact(event, plateHit, armorMm, shell.remainingPenMm);
    // SHOT-INFO (additive): blast direction = burst point toward the plate.
    _siDir.subVectors(plateHit.point, burstPoint);
    stampShotInfo(event, plateHit, spec, tank, _siDir);
    event.damage = dmg;
    tank.combat.hp -= dmg;
    if (plateHit.plate.moduleLink) {
      // Tracks and other external gear get shredded at full odds/full effect.
      ctx.chanceScale = 1;
      ctx.dmgScale = 1;
      const r = rollModuleDamage(ctx, plateHit.plate.moduleLink);
      event.fireStarted = event.fireStarted || r.fireStarted;
      event.ammoRacked = event.ammoRacked || r.ammoRacked;
    }
    // Splash penetrates hatches: every module/crew box inside the blast
    // sphere rolls — crew at the reduced HE chance, internal modules at half
    // chance / half damage, external ones (gun, optics, tracks) at full odds
    // (armor doc §8 step 3, shells doc §6).
    sweepHeBlast(ctx, event, tank, burstPoint, radiusM, hits, plateHit.plate.moduleLink);
    event.destroyed = finalizeTarget(tank.combat, event.ammoRacked);
    event.targetHpAfter = tank.combat.hp;
    if (event.damage > 0 || event.modulesHit.length > 0 || event.crewHit.length > 0) {
      events.push(event);
    }
  }
  return events;
}

/**
 * One 0.5 s fire tick (armor doc §10): 0.5% max HP hull damage, 10 module HP
 * off engine/fuel/ammo, per-tick self-extinguish roll, burn-out after the
 * remaining tick budget. Ammo cooking off to red detonates the tank.
 *
 * @param {object} entity TankEntity-shaped {spec, combat}
 * @param {function} rng
 * @returns {{damage: number, extinguished: boolean, destroyed: boolean}}
 */
export function tickFire(
  entity: { combat?: CombatState | null },
  rng: Rng,
): { damage: number; extinguished: boolean; destroyed: boolean } {
  const combat = entity.combat;
  if (!combat || !combat.fire.burning || combat.destroyed) {
    return { damage: 0, extinguished: false, destroyed: combat ? combat.destroyed : false };
  }
  const damage = combat.maxHp * FIRE_TICK_HP_FRAC;
  combat.hp = Math.max(0, combat.hp - damage);

  let ammoRacked = false;
  for (const name of ['engine', 'fuelTank', 'ammoRack'] as const satisfies readonly ModuleId[]) {
    const m = combat.modules[name];
    if (!m || m.hp <= 0) continue;
    m.hp = Math.max(0, m.hp - FIRE_TICK_MODULE_DMG);
    const state = refreshModuleState(m);
    if (name === 'ammoRack' && state === 'red') ammoRacked = true;
  }

  combat.fire.ticksLeft -= 1;
  let extinguished = false;
  // EQUIPMENT SYSTEM: auto extinguishers double the per-tick self-out roll.
  if (rng() < Math.min(1, FIRE_EXTINGUISH_CHANCE * equipMult(combat, 'extinguish')) ||
      combat.fire.ticksLeft <= 0) {
    combat.fire.burning = false;
    extinguished = true;
  }
  const destroyed = finalizeTarget(combat, ammoRacked);
  if (destroyed) extinguished = true;
  return { damage, extinguished, destroyed };
}

/**
 * Advance red-module auto-repairs one tick (armor doc §9; ARCHITECTURE §2.4
 * locked: a red module self-repairs to YELLOW at 50% HP after REPAIR_S).
 * This is the one module state transition that used to live outside this
 * file — game/state.ts hand-rolled the red→yellow flip next to a duplicate
 * of REPAIR_S (module_hitbox r1 consolidation). The toolbox equipment
 * multiplies the count-up RATE (equipMults.repair, default 1): ×1.25 turns
 * yellow at 8 s while the §2.4 duration stays the unequipped baseline.
 *
 * No RNG. Returns the modules that finished repairing this tick so the
 * caller can broadcast 'module:state' events.
 *
 * @param {object} combat CombatState
 * @param {number} dt seconds since the last tick
 * @returns {string[]} module names that just turned yellow
 */
export function tickModuleRepairs(combat: CombatState | null | undefined, dt: number): string[] {
  const repaired: string[] = [];
  if (!combat || combat.destroyed || !combat.modules) return repaired;
  const rate = equipMult(combat, 'repair');
  for (const name of Object.keys(combat.modules) as ModuleId[]) {
    const m = combat.modules[name];
    if (!m) continue;
    if (m.state !== 'red') continue;
    m.repairT += dt * rate;
    if (m.repairT >= REPAIR_S) {
      m.hp = m.maxHp * 0.5;
      // Route the flip through the shared state machine (hp 50% ⇒ yellow;
      // leaving red also clears repairT).
      if (refreshModuleState(m) !== 'red') repaired.push(name);
    }
  }
  return repaired;
}

/**
 * Repair-kit consumable: every damaged module back to full HP / 'ok'
 * (module_hitbox r1 — main.ts used to hand-roll this transition). Routed
 * through the shared state machine; returns the module names fixed so the
 * caller can broadcast 'module:state' events (and decide whether the kit
 * was consumed at all).
 * @param {object} combat CombatState
 * @returns {string[]} module names restored to 'ok'
 */
export function repairAllModules(combat: CombatState | null | undefined): string[] {
  const fixed: string[] = [];
  if (!combat || !combat.modules) return fixed;
  for (const name of Object.keys(combat.modules) as ModuleId[]) {
    const m = combat.modules[name];
    if (!m) continue;
    if (m.state === 'ok') continue;
    m.hp = m.maxHp;
    refreshModuleState(m); // full HP ⇒ 'ok', repairT cleared
    fixed.push(name);
  }
  return fixed;
}

/**
 * Switch the loaded shell slot. Conventional ammunition changes restart the
 * shared gun load using the NEW shell's duration. A guided launcher is a
 * separate preloaded channel: switching to or from it exposes its preserved
 * cooldown without borrowing the autocannon timer or discarding a magazine.
 * @param {object} combatState CombatState
 * @param {0|1|2} slot shell slot
 * @param {object} [spec] TankSpec — when given, the restart re-derives the
 *   full per-shell/crew/rack/equipment reload for the new slot; legacy
 *   callers without it keep the old same-duration restart.
 * @returns {void}
 */
export function selectShell(
  combatState: CombatState,
  slot: number,
  spec?: DamageTankSpec,
): void {
  if (spec && spec.gun.shells) slot = Math.max(0, Math.min(spec.gun.shells.length - 1, slot | 0));
  if (slot === combatState.shellSlot) return;
  const priorReload = combatState.reload;
  combatState.shellSlot = slot;
  const nextReload = combatState.reloadChannels?.[slot];
  if (nextReload) combatState.reload = nextReload;
  // A launcher is a separate preloaded weapon. Moving between it and the
  // cannon exposes the preserved channel state; it does not discard a cannon
  // magazine or reset an ATGM cooldown already progressing in the background.
  if (nextReload && nextReload !== priorReload) return;
  // Changing the desired cannon round during an existing full magazine load
  // must not discard elapsed work and restart the same feed cycle.
  if (nextReload?.kind === 'magazine' && nextReload.t > 0) return;
  if (spec) startReload(combatState, spec);
  else combatState.reload.t = combatState.reload.totalS;
}

/** Shared crew, module, and equipment multiplier for a new load cycle. */
function reloadMultiplier(
  combatState: CombatState,
  spec: DamageTankSpec,
  loaded = spec.gun.shells && spec.gun.shells[combatState.shellSlot],
): number {
  let mult = 1;
  if ('loader' in combatState.crew && combatState.crew.loader === false) mult *= 1.5;
  const rack = combatState.modules && combatState.modules.ammoRack;
  if (rack && rack.state !== 'ok') mult *= AMMORACK_RELOAD_MULT;
  const loaderMechanism = combatState.modules &&
    (combatState.modules.autoloader || combatState.modules.feedSystem);
  if (loaderMechanism?.state === 'yellow') mult *= 1.35;
  else if (loaderMechanism?.state === 'red') mult *= 2;
  mult *= equipMult(combatState, 'reload');

  const missileRack = combatState.modules && combatState.modules.missileRack;
  // HEAT is a warhead type, not a delivery system: conventional rounds such
  // as the M60A2's M409A1 must not inherit launcher-rack damage penalties.
  const missileRound = loaded?.guided === true;
  if (missileRound && missileRack?.state === 'yellow') mult *= 1.4;
  else if (missileRound && missileRack?.state === 'red') mult *= 1.8;
  return mult;
}

function beginMagazineReload(combatState: CombatState, spec: DamageTankSpec): boolean {
  const magazine = combatState.magazine;
  const autoloader = spec.gun && spec.gun.autoloader;
  if (!magazine || !autoloader) return false;
  magazine.rounds = 0;
  const channel = combatState.gunReload || combatState.reload;
  const cannonRound = spec.gun.shells?.find((round) => round.guided !== true);
  const totalS = Math.max(0.05, Number(autoloader.fullReloadS) || spec.gun.reloadS)
    * reloadMultiplier(combatState, spec, cannonRound);
  channel.totalS = totalS;
  channel.t = totalS;
  channel.kind = 'magazine';
  return true;
}

/** Return the exact reason a manual magazine reload cannot begin. */
export function magazineReloadDenialReason(
  combatState: CombatState | null | undefined,
): 'NO_MAGAZINE' | 'MAGAZINE_RELOADING' | 'MAGAZINE_FULL' | null {
  const magazine = combatState?.magazine;
  if (!magazine) return 'NO_MAGAZINE';
  const channel = combatState.gunReload || combatState.reload;
  if (channel?.kind === 'magazine' && channel.t > 0) {
    return 'MAGAZINE_RELOADING';
  }
  if (magazine.rounds >= magazine.capacity) return 'MAGAZINE_FULL';
  return null;
}

/**
 * Discard a partial magazine and begin a complete magazine load. Returns
 * false when the tank has no magazine, is already loading one, or is full.
 */
export function startMagazineReload(combatState: CombatState, spec: DamageTankSpec): boolean {
  if (magazineReloadDenialReason(combatState)) return false;
  return beginMagazineReload(combatState, spec);
}

/**
 * Advance a reload timer without allocating. Magazine rounds become
 * available atomically when a full magazine reload completes.
 * @returns {boolean} true only on the ready edge
 */
export function tickReload(combatState: CombatState | null | undefined, dt: number): boolean {
  if (!combatState) return false;
  const active = combatState.reload;
  let activeReady = false;
  const channels = combatState.reloadChannels;
  if (Array.isArray(channels) && channels.length) {
    for (let index = 0; index < channels.length; index++) {
      const channel = channels[index];
      let duplicate = false;
      for (let prior = 0; prior < index; prior++) {
        if (channels[prior] === channel) { duplicate = true; break; }
      }
      if (duplicate || channel.t <= 0) continue;
      const remaining = channel.t - dt;
      channel.t = remaining <= 1e-9 ? 0 : remaining;
      if (channel.t > 0) continue;
      if (channel.kind === 'magazine' && combatState.magazine) {
        combatState.magazine.rounds = combatState.magazine.capacity;
      }
      channel.kind = 'ready';
      if (channel === active) activeReady = true;
    }
    return activeReady;
  }
  if (active.t <= 0) return false;
  const remaining = active.t - dt;
  active.t = remaining <= 1e-9 ? 0 : remaining;
  if (active.t > 0) return false;
  if (active.kind === 'magazine' && combatState.magazine) {
    combatState.magazine.rounds = combatState.magazine.capacity;
  }
  active.kind = 'ready';
  return true;
}

/**
 * Begin the correct cycle after a shot: a short intra-magazine delay while
 * rounds remain, otherwise the complete magazine reload. Conventional guns
 * retain their one-shell reload behavior.
 */
export function startPostShotReload(combatState: CombatState, spec: DamageTankSpec): void {
  const loaded = spec.gun.shells?.[combatState.shellSlot];
  // Guided rounds use their external launcher channel even on a vehicle whose
  // cannon has an autoloader. They neither consume nor wait on cannon-magazine
  // state; their authored per-shell duration is the complete launcher cycle.
  if (loaded?.guided === true) {
    beginShellReload(combatState, spec, loaded);
    return;
  }
  const magazine = combatState.magazine;
  const autoloader = spec.gun && spec.gun.autoloader;
  if (!magazine || !autoloader) {
    startReload(combatState, spec);
    return;
  }
  magazine.rounds = Math.max(0, magazine.rounds - 1);
  if (magazine.rounds <= 0) {
    beginMagazineReload(combatState, spec);
    return;
  }
  const totalS = Math.max(0.05, Number(autoloader.intraClipS) || spec.gun.reloadS);
  combatState.reload.totalS = totalS;
  combatState.reload.t = totalS;
  combatState.reload.kind = 'intraClip';
}

/**
 * Begin a reload after firing. Applies the locked crew debuff — a dead loader
 * multiplies reload time ×1.5 (ARCHITECTURE.md §2.4) — and the armor doc §9
 * module debuff: a damaged (yellow) ammo rack adds another ×1.5. The two
 * stack multiplicatively; both are re-derived on every reload start, so a
 * repaired rack recovers on the next shell.
 * @param {object} combatState CombatState
 * @param {object} spec TankSpec
 * @returns {void}
 */
export function startReload(combatState: CombatState, spec: DamageTankSpec): void {
  const loaded = spec.gun.shells && spec.gun.shells[combatState.shellSlot];
  if (combatState.magazine && spec.gun.autoloader && loaded?.guided !== true) {
    beginMagazineReload(combatState, spec);
    return;
  }
  beginShellReload(combatState, spec, loaded);
}

function beginShellReload(
  combatState: CombatState,
  spec: DamageTankSpec,
  loaded: DamageShellSpec | undefined,
): void {
  const mult = reloadMultiplier(combatState, spec, loaded);
  // PER-SHELL RELOAD (IFV support role): a shell carrying its own reloadS
  // governs its slot — autocannon belts cycle in fractions of a second while
  // the ATGM rail on the same vehicle keeps its own 2-3 s cycle. Vehicles
  // without per-shell data keep the single gun-level duration.
  const baseS = (loaded && loaded.reloadS) || spec.gun.reloadS;
  const totalS = baseS * mult;
  combatState.reload.totalS = totalS;
  combatState.reload.t = totalS;
  combatState.reload.kind = 'shell';
}

/**
 * HUD/AI penetration estimate over the WHOLE armor stack the aim ray crosses
 * (no RNG, average rolls): ricochet gate on every non-ERA surface, average
 * ERA reduction, spaced-screen absorption with HEAT air-gap decay, then the
 * remaining pen divided by the gating plate's effective thickness — the same
 * pipeline resolveShellHit runs, so layered sides no longer read as the bare
 * skirt. Falls back to the single-plate estimate when `plateInfo` carries no
 * `layers` (hand-built probes). HE reads the first surface it would burst on.
 * HUD color mapping: ≥1.15 green, 0.85–1.15 orange, <0.85 red.
 *
 * @param {object} shellSpec ShellSpec
 * @param {number} distM range to the aim point in meters
 * @param {object|null} plateInfo queryAimArmor result
 * @returns {number} remainingAvgPen / effectiveMm (0 with no plate, on
 *   ricochet, or when a screen/ERA soaks the whole pen)
 */
export function estimatePenRatio(
  shellSpec: DamageShellSpec,
  distM: number,
  plateInfo: AimArmorInfo | null | undefined,
): number {
  if (!plateInfo || !plateInfo.plate) return 0;
  const layers = plateInfo.layers;
  const b = behaviorOf(shellSpec.type);

  if (!layers || layers.length === 0 || b.kindClass === 'HE') {
    // Single-plate estimate (legacy probes; HE bursts on the first surface).
    if (wouldRicochet(shellSpec, plateInfo.impactAngleDeg, plateInfo.plate)) return 0;
    const { effMm } = effectiveThickness(shellSpec, plateInfo.plate, plateInfo.impactAngleDeg);
    if (!(effMm > 0)) return 99;
    return penAtDistanceMm(shellSpec, distM) / effMm;
  }

  // The gate is the first 'main' plate; with none in the stack (skirt edge,
  // stowage) the last solid layer gates instead.
  let gateIdx = -1;
  for (let i = 0; i < layers.length; i++) {
    if (layers[i].plate.kind === 'main') {
      gateIdx = i;
      break;
    }
    if (layers[i].plate.kind !== 'era') gateIdx = i;
  }
  if (gateIdx < 0) return 0;

  let pen = penAtDistanceMm(shellSpec, distM);
  for (let i = 0; i <= gateIdx; i++) {
    const hit = layers[i];
    const plate = hit.plate;

    // Ricochet gate on EVERY surface — ERA tiles included, mirroring
    // resolveShellHit (armor doc §12): a jet grazing a tile deflects
    // before the tile can spend itself.
    if (wouldRicochet(shellSpec, hit.impactAngleDeg, plate)) return 0;

    if (plate.kind === 'era') {
      // Average ERA effect for the selected shell type (armor doc §11.2);
      // tandem warheads sacrifice the precursor and pass the tile uncut.
      if (!shellSpec.tandem) {
        const era = plate.era || { keReduction: 0, ceFlatMm: 0 };
        if (b.kindClass === 'CE') pen = Math.max(0, pen - era.ceFlatMm);
        else pen *= 1 - era.keReduction;
      }
      if (pen <= 0) return 0;
      continue;
    }

    const { effMm } = effectiveThickness(shellSpec, plate, hit.impactAngleDeg);

    if (i === gateIdx) return effMm > 0 ? Math.max(0, pen) / effMm : 99;

    // Spaced/external screen: absorb, then HEAT decays over the air gap to
    // the next solid layer (mirrors resolveShellHit).
    pen -= effMm;
    if (shellSpec.type === 'HEAT' && pen > 0) {
      for (let j = i + 1; j <= gateIdx; j++) {
        if (layers[j].plate.kind !== 'era') {
          const gapM = hit.point.distanceTo(layers[j].point);
          pen *= Math.max(0, 1 - HEAT_GAP_LOSS_PER_M * gapM);
          break;
        }
      }
    }
    if (pen <= 0) return 0;
  }
  return 0;
}

/**
 * HE blast radius from caliber: 0.66·(caliber/30)^1.3 m, clamped to 1–8 m
 * (shells doc §6). Degenerate calibers clamp to the same floor instead of
 * propagating NaN into splash damage and CombatState HP.
 * @param {number} caliberMm
 * @returns {number} radius in meters
 */
export function blastRadiusM(caliberMm: number): number {
  const caliber = Math.max(0, Number(caliberMm) || 0);
  return Math.min(8, Math.max(1, 0.66 * Math.pow(caliber / 30, 1.3)));
}
