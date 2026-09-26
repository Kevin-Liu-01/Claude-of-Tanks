/**
 * impact.ts — speed-based collision damage shared by the solo step (game/state.ts) and the network authority
 * (sim/authoritativeMatch.ts): hard-obstacle impacts, fall damage, the tank-on-tank ram split and the momentum
 * exchange of a ram. Owner 2026-09-25: "add more speed based damage — running into something hard super fast
 * like a rock or building or other tank, fall damage, etc."
 *
 * Every law is energy based. A hull's kinetic energy above the threshold speed, ½ · m · (v − v_min)² in
 * kilojoules, becomes hull hit points through the ruleset's hp-per-kJ rate (sim/matchRuleset.ts RulesetPhysics),
 * so a heavier hull takes more from the same speed, the onset at the threshold is smooth and a mode tunes the
 * whole curve with two numbers. The face that struck matters: a glacis takes 70 % of a broadside, a stern 85 %.
 * Modules follow the shape of the crash (tracks and suspension first, the engine on a frontal hit, crew shock
 * above a high closing speed); every draw is deterministic through the caller's seeded RNG.
 *
 * Pure and DOM-free — runs under plain node; allocates only on an event that actually deals damage.
 */
import { hullDamageTaken, type CombatState, type ModuleStateName } from './damage.ts';
import type { ModuleId } from './moduleCatalog.ts';
import { ramDamage } from './damage.ts';
import type { RulesetPhysics } from './matchRuleset.ts';

export type HullImpactKind = 'impact' | 'fall';

export interface ImpactModuleHit {
  module: ModuleId;
  newState: ModuleStateName;
  dmg: number;
}

export interface HullImpactResult {
  kind: HullImpactKind;
  /** Hull hit points lost, after the ruleset's damage-taken scale. */
  damage: number;
  destroyed: boolean;
  modulesHit: ImpactModuleHit[];
  crewHit: string[];
}

/** The slice of a combat state an impact writes (damage.ts CombatState and the authority's state both satisfy it). */
export type ImpactCombatState = Pick<CombatState, 'hp' | 'maxHp' | 'destroyed' | 'modules' | 'crew' | 'modeDamageTakenScale' | 'modeCriticalDamage'>;

export interface HullImpactInput {
  combat: ImpactCombatState;
  massTons: number;
  physics: RulesetPhysics;
  kind: HullImpactKind;
  /** Closing speed along the contact normal (an obstacle) or against the ground (a landing), m/s. For a crash
   * spread over consecutive ticks the caller passes the ACCUMULATED closing speed here. */
  closingMps: number;
  /** The part of closingMps a previous tick of the same crash already priced (0 for a new blow). */
  priorClosingMps?: number;
  /** +1 square on the glacis, −1 square on the stern, 0 broadside (impacts only; a landing reads 0). */
  faceForward: number;
  /** Which track carries the blow: +1 right, −1 left, 0 both (impacts only). */
  sideSign: number;
  /** Landing attitude factor from fallAttitudeFactor (falls only; an impact reads 1). */
  attitudeFactor: number;
  /** Seeded RNG for the crew-shock draw (the caller's combat RNG keeps replay order). */
  rng: () => number;
}

/** A glacis takes this share of a broadside's damage; a stern this share. */
const FRONT_ZONE_FACTOR = 0.7;
const REAR_ZONE_FACTOR = 0.85;
/** Attitude factor: a nose-first landing (20° off the ground plane) costs up to +60 %, a tilted one +30 %, an
 * inverted one +50 % — the load lands on one end, one side, or the roof instead of the running gear. */
const NOSE_LANDING_GAIN = 0.6;
const TILT_LANDING_GAIN = 0.3;
const INVERTED_LANDING_GAIN = 0.5;
const ATTITUDE_FULL_RAD = 0.35;
const INVERTED_UP_Y = 0.55;
/** Module shares of the hull damage. Tracks and suspension first; the engine on a frontal crash or a hard landing. */
const IMPACT_NEAR_TRACK_SHARE = 0.8;
const IMPACT_FAR_TRACK_SHARE = 0.3;
const IMPACT_HEAD_ON_TRACK_SHARE = 0.6;
const IMPACT_ENGINE_SHARE = 0.35;
const FALL_TRACK_SHARE = 0.5;
const FALL_ENGINE_SHARE = 0.15;
/** A head-on contact (|faceForward| past this) loads both tracks and the engine. */
const HEAD_ON_FACE = 0.7;
/** Crew shock: above these closing speeds one crew member may be knocked out with this chance. */
export const CREW_SHOCK_IMPACT_MPS = 16;
export const CREW_SHOCK_FALL_MPS = 14;
const CREW_SHOCK_CHANCE = 0.4;
/** A blow under half a hit point is not an event. */
const MIN_REPORTED_DAMAGE = 0.5;
/** The rammer's discount on its own share scales with how much of the closing speed it brought. */
const RAM_AGGRESSOR_DISCOUNT = 0.35;

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

/** Kinetic energy of a hull in kilojoules: ½ · tons · 1000 kg/t · v² / 1000 J/kJ = ½ · tons · v². */
export function impactEnergyKj(massTons: number, speedMps: number): number {
  const tons = massTons > 0 ? massTons : 40;
  const v = Math.abs(Number(speedMps)) || 0;
  return 0.5 * tons * v * v;
}

/** Energy above the threshold speed: the square of the excess, so damage starts from zero at the threshold. */
export function excessEnergyKj(massTons: number, closingMps: number, minMps: number): number {
  const c = Math.abs(Number(closingMps)) || 0;
  if (!(c > minMps)) return 0;
  return impactEnergyKj(massTons, c - minMps);
}

/**
 * Which face struck, from the contact normal in the hull frame: +1 square on the glacis (frontal armour and the
 * hull's long axis take the load), −1 square on the stern, 0 broadside (the tracks and side plates fold).
 */
export function impactZoneFactor(faceForward: number): number {
  const f = clamp(Number(faceForward) || 0, -1, 1);
  return f >= 0 ? 1 - (1 - FRONT_ZONE_FACTOR) * f : 1 - (1 - REAR_ZONE_FACTOR) * -f;
}

/** Hull hit points a hard-obstacle impact costs before the ruleset's damage-taken scale. */
export function hardImpactDamage(
  physics: RulesetPhysics,
  massTons: number,
  closingMps: number,
  faceForward: number,
): number {
  return excessEnergyKj(massTons, closingMps, physics.impactMinMps) * physics.impactHpPerKj * impactZoneFactor(faceForward);
}

/**
 * Landing attitude factor: how far the hull's pitch and roll sit from the ground plane at touchdown and whether it
 * came down on its side or roof. 1 for a flat landing on the tracks.
 */
export function fallAttitudeFactor(pitchErrorRad: number, rollErrorRad: number, upY: number): number {
  const nose = Math.min(1, Math.abs(Number(pitchErrorRad) || 0) / ATTITUDE_FULL_RAD);
  const tilt = Math.min(1, Math.abs(Number(rollErrorRad) || 0) / ATTITUDE_FULL_RAD);
  const inverted = Number.isFinite(upY) && upY < INVERTED_UP_Y ? 1 : 0;
  return 1 + NOSE_LANDING_GAIN * nose + TILT_LANDING_GAIN * tilt + INVERTED_LANDING_GAIN * inverted;
}

/** Hull hit points a landing costs before the ruleset's damage-taken scale. */
export function fallDamage(
  physics: RulesetPhysics,
  massTons: number,
  landingMps: number,
  attitudeFactor = 1,
): number {
  const factor = Number.isFinite(attitudeFactor) && attitudeFactor > 0 ? attitudeFactor : 1;
  return excessEnergyKj(massTons, landingMps, physics.fallMinMps) * physics.fallHpPerKj * factor;
}

function damageModule(
  combat: ImpactCombatState,
  name: ModuleId,
  amount: number,
  out: ImpactModuleHit[],
): void {
  const module = combat.modules[name];
  if (!module || !(amount > 0) || module.hp <= 0) return;
  const previous = module.state;
  module.hp = Math.max(0, module.hp - amount);
  module.state = module.hp <= 0 ? 'red' : module.hp <= module.maxHp * 0.5 ? 'yellow' : 'ok';
  // damage.ts refreshModuleState: the repair count-up restarts unless the module was already red
  if (module.state !== 'red' || previous !== 'red') module.repairT = 0;
  out.push({ module: name, newState: module.state, dmg: Math.round(amount) });
}

/** Module damage in the shape of the crash. */
function applyImpactModules(
  combat: ImpactCombatState,
  kind: HullImpactKind,
  hullDamage: number,
  faceForward: number,
  sideSign: number,
  out: ImpactModuleHit[],
): void {
  if (kind === 'fall') {
    damageModule(combat, 'trackL', hullDamage * FALL_TRACK_SHARE, out);
    damageModule(combat, 'trackR', hullDamage * FALL_TRACK_SHARE, out);
    damageModule(combat, 'engine', hullDamage * FALL_ENGINE_SHARE, out);
    return;
  }
  const headOn = Math.abs(faceForward) >= HEAD_ON_FACE;
  if (headOn || sideSign === 0) {
    damageModule(combat, 'trackL', hullDamage * IMPACT_HEAD_ON_TRACK_SHARE, out);
    damageModule(combat, 'trackR', hullDamage * IMPACT_HEAD_ON_TRACK_SHARE, out);
  } else {
    const near: ModuleId = sideSign > 0 ? 'trackR' : 'trackL';
    const far: ModuleId = sideSign > 0 ? 'trackL' : 'trackR';
    damageModule(combat, near, hullDamage * IMPACT_NEAR_TRACK_SHARE, out);
    damageModule(combat, far, hullDamage * IMPACT_FAR_TRACK_SHARE, out);
  }
  if (faceForward >= HEAD_ON_FACE) damageModule(combat, 'engine', hullDamage * IMPACT_ENGINE_SHARE, out);
}

/** Crew shock: one draw above the threshold; the driver first, then the roster in order. */
function applyCrewShock(
  combat: ImpactCombatState,
  kind: HullImpactKind,
  closingMps: number,
  rng: () => number,
  out: string[],
): void {
  const threshold = kind === 'fall' ? CREW_SHOCK_FALL_MPS : CREW_SHOCK_IMPACT_MPS;
  if (!(closingMps >= threshold) || !combat.crew) return;
  if (rng() >= CREW_SHOCK_CHANCE) return;
  if (combat.crew.driver === true) {
    combat.crew.driver = false;
    out.push('driver');
    return;
  }
  for (const name of Object.keys(combat.crew)) {
    if (combat.crew[name] !== true) continue;
    combat.crew[name] = false;
    out.push(name);
    return;
  }
}

/**
 * Resolve one hull impact or landing against a combat state: hull hit points through the ruleset's damage-taken
 * scale, then modules and crew when the ruleset breaks them (Turbo Ball keeps every system intact). A wreck takes
 * nothing (it keeps its momentum, that is all). Returns null when the blow is under the threshold.
 */
export function resolveHullImpact(input: HullImpactInput): HullImpactResult | null {
  const { combat, physics, kind } = input;
  if (!combat || combat.destroyed) return null;
  const prior = input.priorClosingMps ?? 0;
  // a crash priced across ticks: only the energy the new closing speed adds over what was already charged
  const raw = kind === 'fall'
    ? fallDamage(physics, input.massTons, input.closingMps, input.attitudeFactor)
    : hardImpactDamage(physics, input.massTons, input.closingMps, input.faceForward) -
      (prior > 0 ? hardImpactDamage(physics, input.massTons, prior, input.faceForward) : 0);
  const damage = hullDamageTaken(combat, raw);
  if (!(damage >= MIN_REPORTED_DAMAGE)) return null;
  combat.hp = Math.max(0, combat.hp - damage);
  const destroyed = combat.hp <= 0;
  if (destroyed) combat.destroyed = true;
  const modulesHit: ImpactModuleHit[] = [];
  const crewHit: string[] = [];
  if (combat.modeCriticalDamage !== false) {
    applyImpactModules(combat, kind, damage, input.faceForward, input.sideSign, modulesHit);
    applyCrewShock(combat, kind, input.closingMps, input.rng, crewHit);
  }
  return { kind, damage, destroyed, modulesHit, crewHit };
}

// ---- tank on tank -----------------------------------------------------------------------------------------

/** The slice of a movement state a ram reads and shoves. */
export interface RamBodyState {
  yaw: number;
  speed: number;
  _spring: { recoilVX: number; recoilVZ: number };
}

/** A hull's velocity component along a world XZ direction: the drive along its heading plus the decaying shove. */
export function hullVelocityAlong(state: RamBodyState, nx: number, nz: number): number {
  const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw);
  return (fx * state.speed + state._spring.recoilVX) * nx + (fz * state.speed + state._spring.recoilVZ) * nz;
}

/**
 * Change a hull's velocity along a world direction: the part along its heading joins the drive speed (the tracks
 * carry it), the lateral remainder rides the decaying translation shove (tracks resist sliding sideways).
 */
export function shiftHullVelocityAlong(state: RamBodyState, nx: number, nz: number, delta: number): void {
  if (!(Math.abs(delta) > 1e-9)) return;
  const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw);
  const along = fx * nx + fz * nz;
  state.speed += delta * along;
  state._spring.recoilVX += delta * (nx - along * fx);
  state._spring.recoilVZ += delta * (nz - along * fz);
}

/** How much of a contact's closing speed one hull brought: 0 for a hull that was hit standing, 1 for the rammer. */
export function ramAggression(closingMps: number, ownApproachMps: number): number {
  if (!(closingMps > 0)) return 0;
  return clamp(Math.max(0, ownApproachMps) / closingMps, 0, 1);
}

/**
 * Ram damage split for a tank-tank contact under a ruleset: the kinetic pool of damage.ts ramDamage (closing speed
 * squared × reduced mass × the progressive speed gain) times the mode's ram scale, shared by mass (the heavier hull
 * deals more and takes less), discounted for each hull by how much of the closing speed it brought (a deliberate
 * ram stays a tactic; a head-on meeting discounts both a little) and weighted by the face each hull took the blow on.
 * @param aggressionA / aggressionB share of the closing speed each hull brought (ramAggression)
 * @param faceForwardA / faceForwardB the face each hull was struck on (+1 glacis, −1 stern, 0 broadside)
 */
export function ramShares(
  physics: RulesetPhysics,
  massAT: number,
  massBT: number,
  closingMps: number,
  aggressionA: number,
  aggressionB: number,
  faceForwardA: number,
  faceForwardB: number,
): { total: number; toA: number; toB: number } {
  const pool = ramDamage(massAT, massBT, closingMps);
  const total = pool.total * (physics.ramScale > 0 ? physics.ramScale : 1);
  if (!(total > 0)) return { total: 0, toA: 0, toB: 0 };
  const mA = massAT > 0 ? massAT : 40;
  const mB = massBT > 0 ? massBT : 40;
  const sum = mA + mB;
  const toA = total * (mB / sum) * (1 - RAM_AGGRESSOR_DISCOUNT * clamp(aggressionA, 0, 1)) * impactZoneFactor(faceForwardA);
  const toB = total * (mA / sum) * (1 - RAM_AGGRESSOR_DISCOUNT * clamp(aggressionB, 0, 1)) * impactZoneFactor(faceForwardB);
  return { total, toA, toB };
}

/**
 * Momentum exchange of a horizontal ram: with n the contact normal from B to A and vAn / vBn the two hulls'
 * velocity components along n BEFORE the contact (closing = vBn − vAn > 0), the pair leaves at the centre-of-mass
 * velocity plus a rebound of `restitution` × closing split by mass — momentum is conserved and kinetic energy never
 * grows. The targets are written against each hull's current velocity, so the drive-blocked bleed the movement
 * already applied to the rammer is folded in rather than doubled.
 */
export function exchangeRamMomentum(
  a: RamBodyState,
  b: RamBodyState,
  nx: number,
  nz: number,
  massAT: number,
  massBT: number,
  vAn: number,
  vBn: number,
  restitution: number,
): boolean {
  const closing = vBn - vAn;
  if (!(closing > 1e-6) || !(nx * nx + nz * nz > 0.5)) return false;
  const mA = massAT > 0 ? massAT : 40;
  const mB = massBT > 0 ? massBT : 40;
  const sum = mA + mB;
  const e = clamp(Number(restitution) || 0, 0, 1);
  const centre = (mA * vAn + mB * vBn) / sum;
  const targetA = centre + e * closing * (mB / sum);
  const targetB = centre - e * closing * (mA / sum);
  shiftHullVelocityAlong(a, nx, nz, targetA - hullVelocityAlong(a, nx, nz));
  shiftHullVelocityAlong(b, nx, nz, targetB - hullVelocityAlong(b, nx, nz));
  return true;
}
