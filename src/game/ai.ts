/**
 * ai.ts — Shared allied/enemy tank AI controller (pure logic, node-runnable).
 *
 * Implements ARCHITECTURE.md §3.6: waypoint navigation on the terrain heightfield,
 * line-of-sight target acquisition, hull-down / cover seeking, shell-travel-time
 * aim lead with gravity compensation, dispersion-gated firing, weak-spot probing,
 * flanking on repeated non-penetrations, and three difficulty tiers.
 *
 * Bot philosophy r1 (owner 2026-09-17, docs/history/research/bot-philosophy-20260917.md):
 * bots are soldiers with a mission, not turrets. Targets rank mission objective
 * → closest → weakest; a bot fires only at a SPOTTED enemy and answers a hit
 * from an unseen gun with cover or a jink and a hull turn, never a blind shot;
 * a hit on its own hull picks a reaction (cover, reverse to cover with the bow
 * on the shooter, re-angle a flanked hull, jink while reloading in the open).
 *
 * The controller drives its tank exclusively through the shared TankInput
 * (`entity.input`) — the exact same interface the player uses. It reads enemy
 * state read-only and never touches the scene graph.
 *
 * Imports are restricted to three.js math classes and the pure-logic sim modules,
 * per §1.3. All randomness flows through the injected `rng`; all time arrives as
 * `dt` / `timeS` parameters.
 */

import { Euler, Quaternion, Vector3 } from 'three';
import type { BotMission } from '../sim/matchModes.ts';
import { createBotAbilityPlanner, type BotAbilityContext } from './botAbilities.ts';
import { computeDispersionRadM, IMPACT_SOURCE_COLLIDER } from '../sim/movement.ts';
import { createBotTerrainSafety } from '../sim/botTerrainSafety.ts';
import type { RulesetPhysics } from '../sim/matchRuleset.ts';
import type { NavigationBridgeDeck } from '../sim/bridgeDeckNavigation.ts';
import { createNavigationLiquidSafety } from '../sim/navigationLiquidSafety.ts';
import { solveBallisticGunLay } from '../sim/ballistics.ts';
import { botNominalGunLaneClear } from '../sim/botGunLane.ts';
import { tankPoseFromState, queryAimArmor } from '../sim/armor.ts';
import {
  blastRadiusM,
  estimatePenRatio,
  isHeClass,
  mainWeaponModuleState,
  selectedWeaponModuleState,
  ramDamage,
} from '../sim/damage.ts';
import { driveGroundTypeAt, terrainTravelCostFactor } from '../sim/terrainMobility.ts';
import { PLAYER_ACTION_BITS } from '../sim/playerActions.ts';
import {
  collisionFootprintContainsPoint,
  rayCollisionFootprintEntry2,
  type CollisionRecord,
  type CollisionShape,
} from '../world/collision.ts';
import type { ArmorModel } from '../sim/armor.ts';
import type { DamageShellSpec, CombatState, HitEvent } from '../sim/damage.ts';
import type {
  MovementGunSpec,
  MovementInput,
  MovementSpec,
  TankState,
} from '../sim/movement.ts';

export type AiDifficulty = 'easy' | 'normal' | 'hard';
type AiRole = 'scout' | 'sniper' | 'brawler' | 'flanker';
type AiMode = 'patrol' | 'engage' | 'seekCover' | 'flank';
/** Hit reaction (bot philosophy r1): what a struck hull does for the next few seconds. */
type Reaction = 'cover' | 'backoff' | 'angle' | 'jink';
type RandomSource = () => number;

interface Position2 {
  x: number;
  z: number;
}

interface AllyAvoidanceRisk {
  ally: AiEntity | null;
  friends: AiEntity[];
  along: number;
  cross: number;
  distance: number;
  longSafe: number;
  headingDot: number;
  predictedCross: number;
  /** The ally stands in this hull's lane (not only on a predicted crossing). */
  inLane: boolean;
  ownRadius: number;
  ownHalfWidth: number;
  speed: number;
  stoppingDistance: number;
  motionSign: number;
}

interface AiInput extends MovementInput {
  throttle: number;
  steer: number;
  brake: boolean;
  fire: boolean;
  aimPoint: Vector3;
  shellSlot: number;
  actionBits: number;
}

interface AiGunSpec extends MovementGunSpec {
  shells: DamageShellSpec[];
}

type AiSpec = Omit<MovementSpec, 'gun' | 'armor' | 'dims'> & {
  id: string;
  gun: AiGunSpec;
  armor?: ArmorModel & NonNullable<MovementSpec['armor']>;
  dims: MovementSpec['dims'] & { lengthM?: number };
};

type AiDebugValue = string | number | boolean | null;

interface AiControllerDebugInfo {
  [key: string]: AiDebugValue;
  mode: string;
  targetId: string | null;
}

interface FriendlyFireRisk {
  allyId: string;
  kind: 'corridor' | 'blast';
  clearanceM: number;
}

interface AiController {
  update(dt: number, timeS: number): void;
  setWaypoints(points: Array<[number, number]>, options?: { loop?: boolean }): void;
  notifyShellResult(hitEvent: Pick<HitEvent, 'targetId' | 'kind'> & Partial<Pick<HitEvent, 'shellName'>>): void;
  notifyUnderFire(shooter: AiEntity, info?: HitReactionInfo): void;
  notifyEnemyFired(shooter: AiEntity): void;
  notifyFriendlyBlocked(risk: FriendlyFireRisk): void;
  /** Take (or clear) a commander's standing order; see AiOrder. */
  setOrder(order: AiOrder | null): void;
  hasClearShot(targetId: string): boolean;
  readonly terrainBlocked: boolean;
  readonly targetId: string | null;
  debugInfo(): AiControllerDebugInfo;
  state: string;
}

interface AiEntity {
  id: string;
  team: string;
  isPlayer?: boolean;
  modeActive?: boolean;
  modeJumpMps?: number | null;
  modeGravityScale?: number;
  modePhysics?: RulesetPhysics | null;
  spec: AiSpec;
  state: TankState;
  combat?: CombatState;
  consumableReadyAt?: number[];
  specialAction?: { kind: string; active: boolean } | null;
  input: AiInput;
}

type ControllerOwnedEntity = AiEntity & {
  ai?: AiController | null;
  aiCtl?: AiController | null;
};

/** The mode's live objective for this bot's team (zone centre, flag, ball, sector). */
interface AiObjective {
  mission?: BotMission;
  x: number;
  z: number;
  radiusM: number;
}

/** What the integration knows about a hit that reached this bot's team. */
interface HitReactionInfo {
  /** The struck hull is this bot's own (a teammate's hit only carries intel). */
  selfHit?: boolean;
  /** The shell did damage (a bounce still counts as being shot at). */
  damaging?: boolean;
  kind?: string;
}

interface AiSupportContext {
  safeToReloadMagazine?: boolean;
  wantsSuspensionAim?: boolean;
}

/** Postures a commander can order (game/jevCommander.ts; docs/JEV-COMMANDER.md). */
export type AiOrderPosture = 'hold' | 'push' | 'flank_left' | 'flank_right' | 'retreat' | 'capture' | 'support';

/**
 * A commander's standing order: what this controller does until `untilS`, after
 * which the classic brain resumes on its own (the fallback when the commander
 * is slow, fails or runs out of budget). With no order set the controller is
 * byte-identical to the classic brain — every use below is gated on it.
 */
export interface AiOrder {
  /** The posture, or null for a target-only order (no band, cover or driving change). */
  posture: AiOrderPosture | null;
  /** Enemy to engage (entity id); null keeps the classic pick. */
  targetId: string | null;
  /** Fire discipline: 'press' fires whenever the lay is ready, 'hold' saves rounds; null keeps the classic gate. */
  fire: 'press' | 'hold' | null;
  /** The commander's threat read, 0 (safe) to 3 (about to die): raises cover discipline when high. */
  threat: number;
  /** The point a capture or support posture drives to (world metres). */
  point: { x: number; z: number } | null;
  /** Sim second the order expires. */
  untilS: number;
}

const CRITICAL_REPAIR_MODULES = new Set([
  'trackL', 'trackR', 'engine', 'gun', 'turretRing', 'gunMount',
  'ammoRack', 'autoloader', 'feedSystem', 'missileRack',
]);

function supportActionReady(entity: AiEntity, slot: number, timeS: number): boolean {
  const readyAt = entity.consumableReadyAt;
  return !Array.isArray(readyAt) || (Number(readyAt[slot]) || 0) <= timeS;
}

function needsModuleRepair(combat: CombatState): boolean {
  let damagedModules = 0;
  const modules = combat.modules;
  for (const name in modules) {
    if (!Object.prototype.hasOwnProperty.call(modules, name)) continue;
    const module = modules[name as keyof typeof modules];
    if (!module || module.state === 'ok') continue;
    damagedModules++;
    if (module.state === 'red' && CRITICAL_REPAIR_MODULES.has(name)) return true;
  }
  return damagedModules >= 2;
}

function hasInjuredCrew(combat: CombatState): boolean {
  const crew = combat.crew;
  for (const name in crew) {
    if (Object.prototype.hasOwnProperty.call(crew, name) && crew[name] === false) return true;
  }
  return false;
}

function wantsSpecialAction(entity: AiEntity, context: AiSupportContext): boolean {
  const action = entity.specialAction;
  return action?.kind === 'hydropneumatic_aim' &&
    action.active !== !!context.wantsSuspensionAim;
}

function wantsMagazineReload(combat: CombatState, context: AiSupportContext): boolean {
  const magazine = combat.magazine;
  if (!context.safeToReloadMagazine || !magazine || magazine.rounds <= 0 ||
      magazine.rounds > Math.ceil(magazine.capacity / 2)) return false;
  const channel = combat.gunReload || combat.reload;
  return channel.kind !== 'magazine' || channel.t <= 0;
}

/** Pick one validated, edge-triggered support action from the bot's own state. */
export function chooseAiSupportActionBits(
  entity: AiEntity | null | undefined,
  timeS: number,
  context: AiSupportContext = {},
): number {
  const combat = entity?.combat;
  if (!entity || !combat || combat.destroyed) return 0;
  // Round 60 pacing (2026-09-24, Caldera seed 3): a bot that rolled onto its roof at 20 s lay there for the
  // rest of the battle — the rollover lifecycle rights a settled hull after five seconds, but the bot's unstick
  // throttle and steer kept resetting the settle, and no bot ever asked for the self-right a player has. An
  // overturned hull asks for it (both authorities consume the bit) and finishStep holds its drive still.
  if (entity.state?.overturned === true) return PLAYER_ACTION_BITS.SELF_RIGHT;
  if (combat.fire?.burning && supportActionReady(entity, 2, timeS)) {
    return PLAYER_ACTION_BITS.EXTINGUISHER;
  }
  if (needsModuleRepair(combat) && supportActionReady(entity, 0, timeS)) {
    return PLAYER_ACTION_BITS.REPAIR;
  }
  if (hasInjuredCrew(combat) && supportActionReady(entity, 1, timeS)) {
    return PLAYER_ACTION_BITS.FIRST_AID;
  }
  if (wantsSpecialAction(entity, context)) {
    return PLAYER_ACTION_BITS.SPECIAL_ACTION;
  }
  if (wantsMagazineReload(combat, context)) return PLAYER_ACTION_BITS.RELOAD_MAGAZINE;
  return 0;
}

interface AiObstacle {
  kind?: string;
  min: [number, number, number];
  max: [number, number, number];
  shape2?: CollisionShape;
  crushed?: boolean;
  crushable?: boolean;
}

interface AiHeightField {
  readonly navigationWaterPolicy?: 'avoid-liquid';
  readonly bridgeDecks?: readonly NavigationBridgeDeck[];
  getWaterMaskAt?(x: number, z: number): number;
  getHeightAt(x: number, z: number): number;
  getHeightAtFast?(x: number, z: number): number;
  getNormalAt?(x: number, z: number): { x?: number; y: number; z?: number };
  getGroundType?(x: number, z: number): string;
  getDriveGroundType?(x: number, z: number): string;
}

interface AiDependencies {
  heightField: AiHeightField;
  raycast(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDistance: number,
  ): { dist: number } | null | undefined;
  getEnemies(): AiEntity[];
  getAllies?(): AiEntity[];
  getObstacles(): AiObstacle[];
  queryObstacles?: ((
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    out: AiObstacle[],
  ) => AiObstacle[]) | null;
  spotting?: { isSpotted(id: string, receiver: AiEntity): boolean };
  /** Mission objective for this bot (bot philosophy r1: objective → closest → weakest). */
  getObjective?(): AiObjective | null;
  /**
   * Round 62 pacing: a route over the match's navigation grid (botRoutePlanner.planBotRoute with the shared
   * grid, no role detour). Empty when the goal lies in another connected component. Absent in headless
   * fixtures, where the search falls back to the local corner-hop router.
   */
  planRoute?(start: { x: number; z: number }, goal: { x: number; z: number; y?: number },
    options?: { requireGoalLevel?: boolean }): ReadonlyArray<readonly [number, number]>;
}

interface CreateAiOptions {
  difficulty?: AiDifficulty;
  rng?: RandomSource;
  deps: AiDependencies;
}

interface RoleSpec {
  role?: string;
  topSpeedKmh?: number;
  enginePowerHp?: number;
  weightTons?: number;
}

/**
 * Canonical deterministic PRNG (ARCHITECTURE.md §1.4, copied verbatim).
 * @param {number} a seed
 * @returns {() => number} generator of floats in [0,1)
 */
export function mulberry32(a: number): RandomSource {return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;
const DEFAULT_SEED = 7001;

/**
 * Difficulty tiers (§3.6 locked values):
 *  - fireFactor: dispersion gate — fire when r(dist) < targetWidth/2 × fireFactor.
 *  - reactionS:  delay between first sighting a target and being allowed to fire.
 *  - aimErrMult: inflates effective sigma; extra aim-point error so the combined
 *                sigma equals baseSigma × aimErrMult.
 *  - trackLagS/leadSigma: persistent human fire-control estimation error. The
 *                barrel visibly follows the estimate; shells are never bent.
 *  - probeLevel: index into PROBE_SETS (easy center-mass, hard weak-spot hunting).
 */
const DIFFICULTY_TIERS = {
  // engageRangeM must exceed the typical spawn-to-spawn LOS distance
  // (~350-450 m on every map) or bots idle outside it while spotted targets
  // trade: r7 raised normal 330→400 and hard 420→500 so a known contact is
  // always worth advancing on at full throttle.
  easy:   { fireFactor: 0.55, reactionS: 1.65, aimErrMult: 5.0, playerSpreadMult: 1.5, probeLevel: 0, engageRangeM: 300, holdRangeM: 180, coverIQ: 0.35, trackLagS: 0.46, leadSigma: 0.34 },
  // Normal is the live-battle default: competent target confirmation and
  // cover discipline, with deliberately imperfect tracking/lead so a moving
  // opponent is threatened rather than hit with robotic consistency.
  normal: { fireFactor: 0.80, reactionS: 1.35, aimErrMult: 4.25, playerSpreadMult: 1.1, probeLevel: 1, engageRangeM: 450, holdRangeM: 260, coverIQ: 0.82, trackLagS: 0.38, leadSigma: 0.30 },
  hard:   { fireFactor: 1.0, reactionS: 0.8, aimErrMult: 2.5, playerSpreadMult: 0.4, probeLevel: 2, engageRangeM: 500, holdRangeM: 300, coverIQ: 1.0, trackLagS: 0.18, leadSigma: 0.16 },
};

type DifficultyTier = (typeof DIFFICULTY_TIERS)[AiDifficulty];

const DEPLOYMENT_TUNING: Record<AiRole, { untilS: number; engageM: number }> = {
  scout: { untilS: 120, engageM: 100 },
  flanker: { untilS: 135, engageM: 95 },
  brawler: { untilS: 150, engageM: 90 },
  sniper: { untilS: 165, engageM: 85 },
};

/**
 * Aim-zone probe candidates as [heightFraction, lateralFraction] of the target's
 * height/width. Easy aims center mass; hard probes lower glacis, turret, and
 * side offsets via queryAimArmor and picks the best estimatePenRatio.
 */
const PROBE_SETS = [
  [[0.48, 0]],
  [[0.48, 0], [0.28, 0]],
  [[0.48, 0], [0.28, 0], [0.72, 0], [0.5, 0.28], [0.5, -0.28], [0.32, 0.28], [0.32, -0.28]],
];

/**
 * BATTLE-AI r7 — platform-role doctrine ("good ideas of their tank").
 * Tactical behavior is derived from the bot's OWN mechanical role, never
 * from its public era category or an external assignment:
 *  - scout   (light/IFV): spotting runs, keeps range, never brawls;
 *  - sniper  (TD/SPG):    sightline posts, hold-until-fired, shoot-and-scoot;
 *  - brawler (heavy + slow/armored MBTs): leads pushes, angles the hull,
 *            trades when the enemy gun is cycling;
 *  - flanker (medium + fast MBTs): wide lanes, keeps moving between cover,
 *            support fire on spotted targets.
 * Modern MBTs split by their own mobility numbers: a 66+ km/h hull with
 * 21+ hp/t fights like a medium, the rest anchor like heavies.
 * @param {object} spec TankSpec-like ({ role, topSpeedKmh, enginePowerHp, weightTons })
 * @returns {'scout'|'sniper'|'brawler'|'flanker'}
 */
export function roleOf(spec: RoleSpec | null | undefined): AiRole {
  const c = spec?.role;
  if (c === 'light' || c === 'ifv') return 'scout';
  if (c === 'td' || c === 'spg') return 'sniper';
  if (c === 'heavy') return 'brawler';
  if (c === 'mbt') {
    const pw = (spec?.enginePowerHp || 0) / Math.max(1, spec?.weightTons || 1);
    return ((spec?.topSpeedKmh || 0) >= 66 && pw >= 21) ? 'flanker' : 'brawler';
  }
  return 'flanker'; // medium + unknown roles
}

/**
 * Role tuning applied over the difficulty tier:
 *  - hold:   holdRangeM multiplier (class engagement band — TDs long,
 *            heavies close), capped under the engage envelope;
 *  - engage: engageRangeM multiplier (snipers commit from further out);
 *  - cover:  coverIQ multiplier (reload discipline — snipers/mediums duck
 *            between shots more, heavies hold the line);
 *  - angle:  hull-angling radians while holding (turreted hulls only —
 *            casemates must keep the bow on the target);
 *  - scootAfter: shots from one position before a TD relocates (0 = never).
 */
const ROLE_TUNE = {
  brawler: { hold: 0.72, engage: 1.0, cover: 0.75, angle: 0.5, scootAfter: 2 },
  flanker: { hold: 1.0, engage: 1.0, cover: 1.15, angle: 0.18, scootAfter: 1 },
  sniper:  { hold: 1.5, engage: 1.15, cover: 1.3, angle: 0, scootAfter: 1 },
  scout:   { hold: 1.15, engage: 1.0, cover: 0.9, angle: 0, scootAfter: 1 },
};
// scout kiting: closer than this to any live opponent → break off and orbit
const SCOUT_KITE_M = 130;
// retreat-toward-support (universal): hp fraction / window / cooldown
const FALLBACK_HP_FRAC = {
  brawler: 0.38,
  flanker: 0.48,
  sniper: 0.52,
  scout: 0.55,
};
const FALLBACK_S = 8;
const FALLBACK_CD_S = 14;
const BURST_RETREAT_FRAC = 0.12;
const BURST_RETREAT_WINDOW_S = 4;

// ---- bot philosophy r1 (owner 2026-09-17: "think through the whole enemy bot philosophy") ----
// TARGET HIERARCHY: enemies on the mission objective first, then the closest (in
// TARGET_BAND_M distance bands, weighted by fire-team focus),
// and inside a band the weakest — kills finish, threats come first, the mission
// decides where the fight is.
const TARGET_BAND_M = 60;
const OBJECTIVE_MARGIN_M = 12;
// HIT REACTIONS: one reaction per REACT_COOLDOWN_S. An unseen shooter is a
// SUSPECT (hull turn + cover or jink), never a target; a penetrating hit on a
// hull under REACT_BACKOFF_HP (or a burst) sends it BACKWARDS to cover with the
// bow on the shooter; a shooter more than REACT_ANGLE_RAD off the bow re-angles
// the hull; a frontal hit while reloading in the open jinks to spoil the lead.
const REACT_COOLDOWN_S = 5;
const REACT_BACKOFF_HP = 0.42;
const REACT_ANGLE_RAD = 0.75;
const REACT_ANGLE_OFFSET_RAD = 0.42;
const REACT_BACKOFF_M = 32;
// A scout's armor is its speed (physics lane, 2026-10-04; Tidegate Polders pacing seed 41002 on the merged tree, with
// the settled-shot halt fixed): a BMP-3 kiting past an enemy Bradley 58 m off its flank was hit, stopped to angle its
// hull onto the shot for 2 s, took its second hit at rest and died. Angling buys a light hull's plates little against
// the guns and missiles that hit it; struck from the side, a scout keeps the movement it had (the kite, the orbit, the
// fallback) rather than park to turn.
// A casemate lays its gun with the hull (bots lane, 2026-10-03; Aegis Crossing pacing seed 53002, the Strv 103 alone
// against two T-90Ms): every move that turned the hull turned the gun off its target. Its shoot-and-scoot drove to a
// spot 94-152 degrees off the bearing, its hit jink turned the bow onto the shooter (a second tank on its flank), its
// moves into cover drove forward to crests behind it, and a blocked corridor swung it to an escape heading: the gun
// stood 19-24 degrees off for seconds at a time and it died 12 s into the fight. Engaged, a casemate keeps the bow on
// its target: it scoots along the line of fire, CASEMATE_SCOOT_M back off its spot and then up to it again (the
// S-tank's hull-down drill, so the legs do not walk it out of the fight), backs into cover, jinks with the bow on the
// target, falls back in reverse and stops at a blocked corridor instead of turning.
const CASEMATE_SCOOT_M = 25;
const CASEMATE_SCOOT_S = 8;
const REACT_JINK_PERIOD_S = 0.8;
const REACT_DURATION_S: Readonly<Record<Reaction, number>> = Object.freeze({
  cover: 7, backoff: 5, angle: 2.5, jink: 3.2,
});

// Shared fire-discipline constants. Both teams run the same controller and
// therefore obey the same corridor, moving-friendly prediction and HE splash
// rules. The authoritative simulation repeats this check immediately before
// spawning a bot shell (state.ts), so a stale controller decision cannot hit
// a teammate that crossed the muzzle between AI and fire phases.
const FRIENDLY_CORRIDOR_PAD_M = 1.25;
const FRIENDLY_HE_PAD_M = 1.5;
const FRIENDLY_PREDICT_MAX_S = 1.5;
const FRIENDLY_LANE_RELOCATE_S = 1.2;
// The lane search (bots lane, 2026-10-02; Steinburg 7v7 seed 88677, profiled: 18.8 s of the authority's 77.8 s of
// step CPU over 300 s). A blocked trigger with no lateral lane in sight re-ran the whole search (six candidate points,
// a terrain sight line each) on every tick for as long as the block lasted. A search that finds no lane now waits
// FRIENDLY_LANE_RETRY_S before the next one; the block, the trigger hold and every other use of the dwell are unchanged.
const FRIENDLY_LANE_RETRY_S = 1.2;
const FRIENDLY_SEPARATION_LOOK_M = 26;
const FRIENDLY_SEPARATION_PREDICT_S = 1.8;
const FRIENDLY_STOP_DECEL_MPS2 = 4.0;
// The bounded yield (bots lane, 2026-10-02): right-of-way waits for traffic, not for a hull that never moves. A bot
// held behind a PARKED ally (an idle human, a teammate holding its band) for ALLY_HOLD_LIMIT_S gives way: a passing
// path on a wider lane, or the shared stuck escalation (reverse burst, detour side flip, waypoint skip, pocket
// escape). Cinder Junction 7v7 seed 72839 waited 239 s behind the idle host while the yield disarmed every stuck
// watchdog.
const ALLY_HOLD_LIMIT_S = 8;
const ALLY_HOLD_CLEAR_M = 12;   // a hold ends once the hull has got this far from where it began…
const ALLY_HOLD_FORGET_S = 3;   // …or once nothing has held it for this long
const ALLY_PARKED_MPS = 0.5;
// The give-way's passing path tries these lanes beyond the ordinary one (both sides each).
const TRAFFIC_DETOUR_WIDE_EXTRA_M = Object.freeze([4, 9]);

const LOS_INTERVAL_S    = 0.14;   // target-acquisition / LOS cadence
const PROBE_INTERVAL_S  = 0.55;   // weak-spot + shell-slot probe cadence
const COVER_INTERVAL_S  = 6.0;    // hull-down re-search cadence
const OBSTACLE_REFRESH_S = 5.0;   // static AABB cache refresh
const TARGET_MEMORY_S   = 5.0;    // chase last-seen position this long after LOS loss
const FLANK_TIMEOUT_S   = 20.0;
const FLANK_ASPECT_RAD  = Math.PI / 3;  // 60° off target nose = flank achieved
const STUCK_TIME_S      = 2.0;
const UNSTICK_TIME_S    = 1.4;
const SLOPE_BLOCK_RECOVERY_S = 0.35;
// A collider stop (physics lane, 2026-10-04; Tidegate Polders pacing seed 41002 on the merged tree): a UA M1A1 turning a
// route corner ran into a farm building's wall at 6 m/s and stayed against it for 7.6 s, pivoting where it stood to
// fight the enemy it saw half a second later, until it was hit; nothing counted the wall, as the low-speed watchdog
// counts only a drive that wants to move. The movement solve reports a hull a solid primitive stopped (impactSource
// collider; impactMps, the speed the contact took that step). A contact that took at least COLLIDER_STOP_MPS and most
// of the hull's speed (COLLIDER_STOP_FRAC) within COLLIDER_STOP_WINDOW_S of its first step (the obstacle push is capped
// per step, so a stop can span steps; the authority prices a crash over the same window), against a world obstacle
// rather than another hull, is definitive feedback, as a slope block is: the hull backs off at once for UNSTICK_TIME_S,
// its bow swinging along the face toward the side its goal lies on. It counts as a stuck strike, which escalates (the
// detour, the waypoint skip, the pocket escape) only on a repeat before the hull drives free, as the low-speed
// watchdog's do: the pacing battles stop 250 of their 396 bots 871 times, mostly once or twice each, and escalating
// every stop sent a lone bump down a detour. A scrape along a face keeps its speed and is no stop; a crawl into one is
// the low-speed watchdog's.
const COLLIDER_STOP_MPS = 2;
const COLLIDER_STOP_FRAC = 0.75;
const COLLIDER_STOP_WINDOW_S = 0.3;
const TERRAIN_ROUTE_LOOK_M = 28;
const TERRAIN_ROUTE_STEP_M = 4;
const TERRAIN_ROUTE_FAN_RAD = Object.freeze([
  0.42, -0.42, 0.78, -0.78, 1.12, -1.12, 1.48, -1.48,
]);
const VANTAGE_NEAR_RINGS_M = Object.freeze([35, 65, 100]);
const VANTAGE_WIDE_RINGS_M = Object.freeze([35, 65, 100, 150]);
const VANTAGE_CONTACT_RINGS_M = Object.freeze([70, 110]);
const FLAT_CELL_RINGS_M = Object.freeze([18, 30, 45]);
const FRIENDLY_LANE_RINGS_M = Object.freeze([22, 34, 46]);
const GUN_LIMIT_NUDGE_S = 1.5;    // gun pinned this long → back up for depression
// A leg that goes nowhere (physics lane round 8; Reservoir pacing seed 50001 on the track-contact parity tree): the last
// bravo T-64BV stood rolled 17.5 degrees on a bank's flank with its stern against a building and its gun on the
// depression stop, 54 m from the idle host, for the last 610 s of the 900 s cap. Its back-up for the gun (1.2 s at
// -0.6 throttle every 1.5 s on the stop) drove into the building and went nowhere, the arc limit's flat-cell leg was
// never driven (the press owned the hull and ran the back-up too), and nothing counted any of it as stuck. A back-up
// or a relocation leg that ends with less displacement and turn than this went nowhere: it is a stuck strike, and the
// next legs go another way.
const LEG_DEAD_M = 0.3;
const LEG_DEAD_TURN_RAD = 0.35;
const LEG_DEAD_CHECK_S = 4;        // a relocation leg is judged this long after it began (a back-up at its end)
const DEAD_LEG_AWAY_S = 20;        // how long the travel a dead leg tried is kept out of the next legs…
const DEAD_LEG_AWAY_COS = 0.5;     // …within 60 degrees of its bearing (no back-up at all for that long)
const EYE_FRAC          = 0.85;   // eye/turret-top height as fraction of heightM
const ARRIVE_DIST_M     = 6.0;
const MAX_FIRE_RANGE_M  = 620;
const UNDER_FIRE_WINDOW_S = 15;       // chase/engage window after a team hit
const UNDER_FIRE_RANGE_BONUS_M = 180; // engage-envelope extension toward the shooter

const STALEMATE_SILENT_S = 12;   // no shot fired this long w/ contact → push
const STALEMATE_PUSH_S = 8;      // duration of one forced push window
// The settled-shot halt (r7's direct trigger, updateEngagementSettle: a starved trigger with a clear ray halts the hull
// for a clean shot) waits for a trigger that has starved: SETTLE_STARVED_S of contact with its target without a shot
// (physics lane, 2026-10-04; Tidegate Polders pacing seed 41002 on the merged tree). It counted the silence from the
// bot's last shot, so a bot that had not fired since it spawned halted the moment it saw an enemy: a BMP-3 kiting at
// 8 m/s braked to a stop 100 m from an enemy Bradley at 48.75 s and sat facing it, hit from 50.1 s on, through the
// fallback (50.5 s) and the flank (50.75 s) its own state machine chose, until a backoff took the hull at 51.25 s; it
// died at 54 s. The stalemate press, which arms a settle with its push on 12 s of silence, halts only once the gun may
// fire on the contact (the reaction gate): a press begins on a fresh contact when the bot was not pressing before it.
// Nor does a settle, either one, hold a hull under fire in the open (exposedUnderFire): there the hull keeps the
// movement its state chose (the scout's kite, the fallback, the flank, cover). In cover, where the gun that hit it no
// longer sees its body, it still halts to shoot.
const SETTLE_STARVED_S = 8;
// A hull stands in the open to a gun that sees it at this fraction of its height off its root: the hull below the
// turret (findCrestAlong's hull-down crest stands 0.45 of it high).
const EXPOSED_BODY_FRAC = 0.3;
// Round 48 pacing (2026-09-24): seconds of a closed penetration gate (no zone at or above the 0.9 ratio, no HE
// left to fall back on) against a live, visible target before the bot changes the geometry with a flank.
const PEN_DENIED_FLANK_S = 8;
// Round 60 pacing (2026-09-24): the last bot against a PASSIVE target — see updatePassivePress. A target whose
// hull has held still and whose gun has stayed silent this long is pressed to a point-blank side aspect.
const PASSIVE_TARGET_STILL_S = 15;
const PASSIVE_TARGET_SILENT_S = 15;
const PASSIVE_PRESS_NO_PEN_S = 15;     // this bot's own shells have not penetrated it for this long
const PASSIVE_PRESS_STANDOFF_M = 70;   // the press point's distance from the target
const PASSIVE_PRESS_ASPECT_RAD = 1.3;  // ~75° off the target's nose: a side plate, not a glacis
// Round 67 (2026-09-24): when both side points fail — Tidegate Polders seed 2 under round 62: both stood on the polder
// water and the bot pressed straight in at the glacis — the ring tries land-only bearings around each side aspect
// (90°, 60°, 105°, 45° off the nose, alternating sides) before it falls back to the straight approach; a point on
// water is no press point on a map that avoids liquid (the same corridor test the local brake uses).
const PASSIVE_PRESS_FALLBACKS: readonly (readonly [number, number])[] = [
  [1, 0.26], [-1, 0.26], [1, -0.26], [-1, -0.26], [1, 0.52], [-1, 0.52], [1, -0.52], [-1, -0.52],
];
const PASSIVE_PRESS_BEARINGS = 2 + PASSIVE_PRESS_FALLBACKS.length + 1; // per ring: the two sides, the fallbacks, straight in
const PASSIVE_PRESS_REPICK_S = 3;
const PRESS_VETO_SLOTS = 4;                 // press points (and missed-out spots) kept out of the picks at once
const PASSIVE_PRESS_LANE_HULL_FRAC = 0.4; // the press point must reach the HULL with the gun, not only the turret top
const PASSIVE_PRESS_DENIED_S = 6;          // closed penetration gate held at the press point before it is given up
const PASSIVE_PRESS_ARC_S = 3;             // gun pinned at a pitch stop at the press point before it is given up
// An unreachable press point (bots lane, 2026-10-02; Reservoir pacing seed 50003 on the maps lane's tree with the
// liquid-start fix): the last bravo T-90M's press point lay below a bank the terrain guard would not let it descend,
// and the press gave a point up only once the hull stood on it, so for 540 s it drove at the bank, reversed and drove
// again, firing a round now and then. A press point the hull has not reached within its distance at
// PRESS_REACH_SPEED_MPS plus PRESS_REACH_SLACK_S (kept across the press restarts a flickering sight line makes) is
// given up like a masked one and another is picked.
const PRESS_REACH_SPEED_MPS = 4;
const PRESS_REACH_SLACK_S = 20;
// Missing an idle target (bots lane, 2026-10-02; Winter pacing seed 23000 on the maps lane's tree): a T-90M stood
// 57-66 m off the idle host's flank for five minutes while its HEAT rounds dug into a crest 16 m short of the hull or
// passed over the turret. The press held off because the hull stood "already on its flank at point-blank", and the
// shoot-and-scoot is off against a passive target, so nothing moved it. PASSIVE_PRESS_MISSES main-gun rounds in a row
// that leave the gun without a hit on the target (judged MISS_SETTLE_S after the last one, once its shell has landed)
// are a verdict on the spot: the press starts from it, or the press point it stands on is given up, exactly as a
// masked probe gives one up. The rounds count from one spot (within MISS_SPOT_M), so fire on the move never adds up to a
// verdict on the point the hull arrives at. The flank exemption also takes the press point's own test: from where the
// hull stands the gun must reach the hull (PASSIVE_PRESS_LANE_HULL_FRAC), re-tested every FLANK_LANE_RECHECK_S.
const PASSIVE_PRESS_MISSES = 3;
const MISS_SETTLE_S = 1.5;
const MISS_SPOT_M = 10;                    // rounds fired farther apart than this are from different spots
const FLANK_LANE_RECHECK_S = 1;
const GUN_ARC_MARGIN_RAD = 0.026;          // 1.5° inside the mechanical elevation / depression stops
// Round 60: a flank whose side aspect leaves the gate closed carries on round toward the rear.
const FLANK_REAR_ASPECT_RAD = 2.35;        // 135° off the nose
// Probe candidate the tier set falls back to when terrain hides every zone in it (the visible turret).
const PROBE_TURRET_FALLBACK: readonly [number, number] = [0.72, 0];
// Round 62 pacing (2026-09-24): the search for a lost enemy (see beginSearchLeg) and the ammunition economy
// (see expectedHitChance, applyProbeResult, aimAndFire).
const SEARCH_SWEEP_RING_M = 110;           // ring around the enemy's sector the sweep legs stand on
const SEARCH_WIDE_RING_M = 220;            // the wider ring a failed sweep escalates to
const SEARCH_LEG_MIN_S = 15;               // a leg's time budget: this plus the route length at 2.5 m/s
const SEARCH_LEG_MAX_S = 150;              // (Amberford seed 1: a 550 m cross-map route on a 90 s budget timed out
const SEARCH_LEG_SPEED_MPS = 2.5;          // 200 m short of the host; a leg that halved its distance carries on)
const SEARCH_SEEN_MAX_AGE_S = 45;          // a sighting older than this is no search goal
const SEARCH_LEG_STRIKES = 3;              // stuck strikes on one leg before it is given up for the next goal
const SEARCH_GOAL_ARRIVE_M = 30;           // a goal this close is not worth a leg
const SEARCH_PROJECTION_M = 60;            // a dry-policy route may end this far from its goal and still count
const SEARCH_CHECK_S = 2;                  // cadence of the leg lifecycle checks
const PEN_GATE_RATIO_NEAR = 1.0;           // the gate ratio at point-blank range: the historical 0.9 answered the
const PEN_GATE_RATIO_FAR = 1.15;           // penetration roll, not the lay — even at 76 m the tier's 0.47 m error
const PEN_GATE_NEAR_M = 80;                // lands a round priced on a 0.9-1.0 lower-front strip on the glacis
const PEN_GATE_FAR_M = 320;                // beside it (Polders seed 2: eleven of thirteen HEAT rounds non-pens)
const HE_SPLASH_WORTH_HP = 80;             // an HE fallback round must be worth this much surface burst
const HE_ARMOR_ABSORB_PER_MM = 1.1;        // damage.ts HE_ARMOR_ABSORB (the surface-burst law)
const CONSERVE_HIT_CHANCE_FULL = 0.35;     // hold fire under this expected hit chance with a full rack…
const CONSERVE_HIT_CHANCE_EMPTY = 0.6;     // …and under this one with the last rounds
const CONSERVE_CLOSE_MARGIN = 0.1;         // close until the chance clears the threshold by this much
const RAM_APPROACH_EFFICIENCY = 0.85;      // closing speed reached over a straight run, as a share of top speed
const RAM_MAX_CLOSING_MPS = 14;
const RAM_SELF_BUDGET_FRAC = 0.8;          // the rams a kill needs may cost at most this share of own hull
const RAM_RUN_UP_M = 45;                   // a stalled ram backs off to this range before the next run
const EMPTY_RETIRE_M = 240;                // an empty bot that cannot ram keeps at least this far from its enemies
// The last run (bots lane, 2026-10-07; Tidegate Polders pacing tail seed 41000 on the scenery lane's stone-free tree):
// the last bravo bot, an AFT-10 at 8 % of its hull, spent its eight HJ-10s (the K2 killed, one hit on the idle host),
// the ram law refused every run, and the retirement parked it 248 m from the host, the host in sight and its gun silent,
// from 330 s to the 900 s cap. The retirement leaves the finish to the team. With no teammate left that can fire there
// is no finish to leave, and a passive target (PASSIVE_TARGET_*_S) never comes to it, so the run is taken whatever the
// ram law says: judged, and driven, at full speed. It ends the match one way or the other. A teammate with rounds
// aboard, or a target that moves or fires, keeps the retirement (see lastRunDue).
// The finishing run (bots lane, 2026-10-02; Ruinspires pacing seed 37001 on the maps lane's tree): the last bravo M1A2
// emptied its rack with the idle host at 320 hp and retired for the last 325 s, to the 900 s cap. The ram law splits a
// run's pool by mass and discounts the rammer, so what the rammer pays per point it deals is fixed, and a full-speed
// run spends the overkill on both hulls: one 14 m/s run would deal 1516 to the host and 985 to the 803 hp rammer.
// Against a passive target the run that finishes it is driven no faster than the slowest closing speed whose share
// still deals RAM_FINISH_MARGIN times the target's hp (the margin covers a blow on the glacis, which takes 0.7 of the
// pool's share), never under RAM_CAP_MIN_MPS, and the exchange is judged at that speed. Runs that cannot finish the
// target alone are judged, and driven, at full speed, as before. Three more things kept the runs from landing: the
// run aimed 20 m past the hull, so the corner router rounded whatever stood beyond it and the hull swerved off (inside
// RAM_STRAIGHT_M a clear line to the hull is now driven straight at it); the empty rack's probe finds no zone with no
// round aboard, and that probe miss scooted the hull off the run every few seconds (it no longer does); and the run's
// own contact moved the host, which restarted its still clock, so the plan lapsed to the full-speed judgement and the
// hull retired for 15 s (the bump of a run in contact no longer counts as the target moving).
const RAM_FINISH_MARGIN = 1.8;
const RAM_CAP_MIN_MPS = 6;
const RAM_CAP_BRAKE_MPS = 0.75;            // over the run's cap the hull coasts; this far over it brakes
const RAM_STRAIGHT_M = 60;
const RAM_LINE_RECHECK_S = 0.5;
const RAM_CONTACT_HOLD_S = 4;              // after a contact the target's motion is the run's own push
// The spent rack (bots lane, 2026-10-02, Frontier Basin 7v7 seed 88677): the last bravo Challenger 2 had only its
// L34 WP smoke rounds left against the idle M1A2 — no zone opened the gate, no burst was worth a round — and the
// press, the closed-gate flank and the press repicks cycled for six minutes without a shot until the 900 s cap.
// Seconds in sight of a target, from inside RACK_SPENT_RANGE_M (where range no longer shuts the gate), that no
// loaded round can hurt (zones visible, gate shut, no worthwhile burst) end the attempt: the rack counts as spent
// against that target (ram when the ram law allows, otherwise the retirement), any other spotted enemy outranks
// it, and the verdict lapses after RACK_SPENT_FOR_S.
const RACK_SPENT_S = 60;
const RACK_SPENT_RANGE_M = 90;
const RACK_SPENT_FOR_S = 90;
// On-objective geometry (bots lane, 2026-10-02, Cinder Junction and Steinburg frontline seed 72839): a zone mission
// drives the hull to the zone's centre and holds it there, and the mission owns the hull — so with a target the
// turret could not fight from that spot (no sight of it, or a gate no loaded round opens) the vantage seek, the
// closed-gate flank and the press never ran. Attackers and defenders held the last line 17 m apart, silent, for
// 640 s; a defender at 44 % held 119 s without a sight line. A zone holder that has not been able to fight its
// target for OBJECTIVE_SHIFT_DWELL_S shifts inside the zone instead: to a point on the OBJECTIVE_SHIFT_RINGS ×
// radius rings in sight of the target, as far round toward its side as the zone allows. It holds that point while it
// can fight from it and picks another once it has not been able to for the same dwell; leaving the zone or losing
// the target ends it.
const OBJECTIVE_SHIFT_DWELL_S = 4;
const OBJECTIVE_SHIFT_RINGS = Object.freeze([0.6, 0.8]);
// A zone's hold point (bots lane, 2026-10-03; Redrock Divide frontline): line 3's centre (52.9, 274.6) lies on the
// plateau's 55-63 degree south face, and a zone mission drove every holder to that centre. Hulls climbed onto the face,
// pivoted there for half a minute while the terrain guard flickered, slid off and fell; one M1A2 slid onto a wreck
// and dropped 12 m (24 seeds: 45 damaging falls, 44 of them off that face). A zone mission holds the ground nearest
// the centre a hull can stand on: the centre itself when its footprint is level enough to hold (the relocation
// cell's SPOT_NORMAL_Y_MIN at the centre and over a hull's length round it, and dry), else the first such point on
// the ZONE_HOLD_RINGS_M rings (inside ZONE_HOLD_MAX_FRAC of the zone's radius), the hull's own side of the zone first.
// A zone on holdable ground is held at its centre as before.
const ZONE_HOLD_RINGS_M = Object.freeze([4, 8, 12, 16, 20]);
const ZONE_HOLD_BEARINGS = 16;
const ZONE_HOLD_FOOTPRINT_M = 5;
const ZONE_HOLD_MAX_FRAC = 0.7;
// The on-objective shift's points obey the same rule (their old test sampled the leg twice, and a defender on the
// plateau picked shift points on the floor beyond the face, drove onto it and pivoted there for a minute): holdable
// ground, reached by a straight leg sampled every ZONE_LEG_STEP_M no steeper than LEG_NORMAL_Y_MIN.
const ZONE_LEG_STEP_M = 3;
// A route used up short of the objective (the mission's own plan ends in another connected component for this
// hull or comes back empty, or a search leg took the waypoints) releases the hull to the classic drivers for this
// long before the mission plans again (Cinder Junction frontline seed 72839: a Challenger 2 stood 494 s at its route
// end, 192 m short of the line, its target in sight, the gate shut).
const MISSION_RELEASE_S = 20;
// Another level (bots lane, 2026-10-02; Cliffbridge pacing seed 53003: a T-90M on the gorge floor under the bridge
// and one on its deck, 40 m apart vertically and 17-45 m on the map, stood engaged 570 s, neither gun able to lay
// on the other, until the 900 s cap). A target on another level the gun cannot be laid on from here — more than
// ELEVATION_LEVEL_M above or below, outside the elevation/depression arc at this distance — for ELEVATION_LOCK_S
// is a verdict: a free hull changes level by a route to the target's own level when the grid has one within
// LEVEL_ROUTE_MAX_M (driven until the hull stands on that level with the target in sight, for at most the route's
// length at LEVEL_ROUTE_SPEED_MPS plus LEVEL_ROUTE_SLACK_S or LEVEL_ROUTE_STRIKES stuck strikes), and otherwise (no
// route, a mission holding the hull, or the route spent short of the level) leaves that target alone for
// UNBEARABLE_S: another spotted enemy takes the slot, or the mission and the no-contact search take the hull.
const ELEVATION_LEVEL_M = 8;
const ELEVATION_LOCK_S = 6;
const LEVEL_ROUTE_MAX_M = 900;
const LEVEL_ROUTE_SPEED_MPS = 5;
const LEVEL_ROUTE_SLACK_S = 25;
const LEVEL_ROUTE_STRIKES = 4;
const UNBEARABLE_S = 75;
const LEVEL_ROUTE_OPTIONS = Object.freeze({ requireGoalLevel: true });
// Search goal order by how many legs have ended without contact: straight at the enemy first, then the last
// sighting and the ring round the sector, then the ring from other sides.
const SEARCH_ORDER: ReadonlyArray<readonly string[]> = Object.freeze([
  Object.freeze(['sector', 'seen', 'objective', 'sweep', 'wide']),
  Object.freeze(['seen', 'sweep', 'sector', 'wide']),
  Object.freeze(['sweep', 'wide', 'sector', 'seen']),
]);
const searchScratch = { x: 0, z: 0 };      // beginSearchLeg's candidate goal (controllers run sequentially)
// HEADING COMMITMENT (controls_gunnery r3): approach/chase legs used to steer
// at the LIVE target position every tick, so bots wove continuously (speed
// oscillating 1-14 m/s) and a constant-velocity lead solution NEVER converged
// — a settled 14-shell volley went 0/14 on a 415 m mover. Bots now commit to
// a chase point for 3-5 s (re-picked early only if the target displaces far),
// so leading a distant mover is learnable, exactly like WoT bots.
const CHASE_COMMIT_MIN_S = 3.0;
const CHASE_COMMIT_VAR_S = 2.0;
const CHASE_REPICK_DIST_M = 60;

// Module-scope scratch vectors (no per-frame allocation, §1.3).
const _vA = new Vector3();
const _vB = new Vector3();
const _vC = new Vector3();
const _vD = new Vector3();
const _vE = new Vector3();
const _vF = new Vector3();
const _vG = new Vector3();
const _vH = new Vector3();
const _hullEuler = new Euler(0, 0, 0, 'YXZ');
const _hullQuat = new Quaternion();

// ---------------------------------------------------------------------------
// Small math helpers
// ---------------------------------------------------------------------------

function clamp(x: number, lo: number, hi: number): number { return x < lo ? lo : x > hi ? hi : x; }

function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Standard-normal sample via Box–Muller from the injected rng. */
function gauss(rng: RandomSource): number {
  let u = rng();
  while (u <= 1e-9) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rng());
}

/** Error function (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7): P(|X| < a) = erf(a / (σ√2)) for X ~ N(0, σ). */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const poly = ((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592;
  return sign * (1 - poly * t * Math.exp(-ax * ax));
}

function tankSafetyRadius(ent: AiEntity | null | undefined): number {
  if (!ent || !ent.spec) return 2.5;
  const dims = ent.spec.dims || {};
  const hullR = Math.hypot(dims.widthM || 3, dims.lengthM || 6) * 0.38;
  const armorR = ent.spec.armor && ent.spec.armor.boundingRadiusM;
  return Math.max(2.2, hullR, armorR ? armorR * 0.72 : 0);
}

/**
 * Predict whether a bot's intended shot can intersect a living teammate.
 * This is deliberately team-symmetric and pure so both the controller and
 * the authoritative fire path can use exactly the same rule.
 *
 * @param {object} shooter TankEntity-like shooter
 * @param {{x:number,y:number,z:number}} aimPoint intended impact point
 * @param {object} shellSpec gun shell spec
 * @param {object[]} candidates tanks to inspect (all tanks or teammates)
 * @returns {null|{allyId:string,kind:'corridor'|'blast',clearanceM:number}}
 */
export function botFriendlyFireRisk(
  shooter: AiEntity | null | undefined,
  aimPoint: { x: number; y: number; z: number } | null | undefined,
  shellSpec: DamageShellSpec | null | undefined,
  candidates: AiEntity[] | null | undefined,
): FriendlyFireRisk | null {
  if (!shooter || !shooter.state || !aimPoint || !shellSpec) return null;
  const sp = shooter.state.pos;
  let dx = aimPoint.x - sp.x;
  let dz = aimPoint.z - sp.z;
  const shotLen = Math.hypot(dx, dz);
  if (shotLen < 4) return null;
  dx /= shotLen;
  dz /= shotLen;
  const velocity = Math.max(100, shellSpec.velocityMps || 700);
  const heRadius = isHeClass(shellSpec.type)
    ? blastRadiusM(shellSpec.caliberMm || 0) : 0;
  const list = candidates || [];

  for (let i = 0; i < list.length; i++) {
    const ally = list[i];
    if (!friendlyFireCandidate(shooter, ally)) continue;
    const risk = friendlyFireRiskForAlly(
      ally, aimPoint, sp.x, sp.z, dx, dz, shotLen, velocity, heRadius,
    );
    if (risk) return risk;
  }
  return null;
}

function friendlyFireCandidate(shooter: AiEntity, ally: AiEntity | null | undefined): ally is AiEntity {
  if (!ally || ally === shooter || !ally.state || !ally.spec ||
      (ally.combat && ally.combat.destroyed)) return false;
  return shooter.team == null || ally.team == null || ally.team === shooter.team;
}

function friendlyFireRiskForAlly(
  ally: AiEntity,
  aimPoint: { x: number; y: number; z: number },
  sourceX: number,
  sourceZ: number,
  dirX: number,
  dirZ: number,
  shotLength: number,
  velocity: number,
  heRadius: number,
): FriendlyFireRisk | null {
  const position = ally.state.pos;
  const relativeX = position.x - sourceX;
  const relativeZ = position.z - sourceZ;
  const initialAlong = relativeX * dirX + relativeZ * dirZ;
  const travelS = Math.min(
    FRIENDLY_PREDICT_MAX_S,
    Math.max(0, initialAlong) / velocity,
  );
  const speed = ally.state.speed || 0;
  const predictedX = position.x + Math.sin(ally.state.yaw || 0) * speed * travelS;
  const predictedZ = position.z + Math.cos(ally.state.yaw || 0) * speed * travelS;
  const pathX = predictedX - sourceX;
  const pathZ = predictedZ - sourceZ;
  const along = pathX * dirX + pathZ * dirZ;
  const radius = tankSafetyRadius(ally);
  if (along > 2 && along < shotLength - 1) {
    const clearance = Math.abs(pathX * dirZ - pathZ * dirX) - radius;
    if (clearance < FRIENDLY_CORRIDOR_PAD_M) {
      return { allyId: ally.id || '', kind: 'corridor', clearanceM: clearance };
    }
  }
  if (heRadius <= 0) return null;
  const blastClearance = Math.hypot(
    predictedX - aimPoint.x,
    predictedZ - aimPoint.z,
  ) - radius - heRadius;
  return blastClearance < FRIENDLY_HE_PAD_M
    ? { allyId: ally.id || '', kind: 'blast', clearanceM: blastClearance }
    : null;
}

function validateCreateAiInputs(entity: AiEntity, opts: CreateAiOptions): void {
  if (!entity || !entity.spec || !entity.state) {
    throw new Error('createAI: entity must carry spec and state');
  }
  const deps = opts?.deps;
  if (!deps || !deps.heightField || typeof deps.raycast !== 'function' ||
      typeof deps.getEnemies !== 'function' || typeof deps.getObstacles !== 'function') {
    throw new Error('createAI: opts.deps must provide heightField, raycast, getEnemies, getObstacles');
  }
}

function selectDifficultyTier(difficulty: AiDifficulty | undefined): DifficultyTier {
  const tier = DIFFICULTY_TIERS[difficulty ?? 'normal'];
  if (!tier) throw new Error(`createAI: unknown difficulty '${difficulty}'`);
  return tier;
}

function selectRandomSource(rng: RandomSource | undefined): RandomSource {
  return typeof rng === 'function' ? rng : mulberry32(DEFAULT_SEED);
}

function createAiHeightField(source: AiHeightField): AiHeightField {
  if (typeof source.getHeightAtFast !== 'function') return source;
  return Object.create(source, {
    getHeightAt: {
      value: (x: number, z: number) => source.getHeightAtFast!(x, z),
    },
  }) as AiHeightField;
}

function selectSpotting(deps: AiDependencies): AiDependencies['spotting'] | null {
  return deps.spotting && typeof deps.spotting.isSpotted === 'function'
    ? deps.spotting
    : null;
}

function ensureAiInput(entity: AiEntity): void {
  if (!entity.input) {
    entity.input = {
      throttle: 0,
      steer: 0,
      brake: false,
      fire: false,
      aimPoint: new Vector3(),
      shellSlot: 0,
      actionBits: 0,
    };
  } else if (!entity.input.aimPoint) {
    entity.input.aimPoint = new Vector3();
  }
  entity.input.actionBits = 0;
}

function isCasemate(spec: AiSpec): boolean {
  // movement.ts gives a turretless hull a fixed arc even when the spec authors none (gunArcRadFor)
  return !!spec.armor?.turretless || (spec.gunArcDeg != null && spec.gunArcDeg <= 30);
}

function findHeShellSlot(spec: AiSpec): number {
  for (let slot = 0; slot < spec.gun.shells.length; slot++) {
    const shell = spec.gun.shells[slot];
    if (shell && isHeClass(shell.type)) return slot;
  }
  return spec.gun.shells.length - 1;
}

function selectAllies(deps: AiDependencies): (() => AiEntity[]) | null {
  return typeof deps.getAllies === 'function' ? deps.getAllies : null;
}

function gunPivotHeight(spec: AiSpec): number {
  const armor = spec.armor;
  return armor?.turretPivot && armor.gunPivot
    ? armor.turretPivot[1] + armor.gunPivot[1]
    : spec.dims.heightM * 0.85;
}

function combatHitPoints(entity: AiEntity): number {
  return entity.combat?.hp ?? 0;
}

// ---------------------------------------------------------------------------
// Controller factory
// ---------------------------------------------------------------------------

/**
 * Create the shared AI controller for one non-player tank on either team.
 *
 * @param {object} entity TankEntity (§2.4) — `{ id, spec, state, combat, input, ai }`.
 *   The controller writes `entity.input` (movement, fire, aim, shell slot and action bits)
 *   and nothing else; it also claims `entity.ai` as its opaque state slot.
 * @param {object} opts
 * @param {'easy'|'normal'|'hard'} [opts.difficulty='normal'] behavior tier
 * @param {() => number} [opts.rng] deterministic PRNG in [0,1); defaults to mulberry32(7001)
 * @param {object} opts.deps injected world access:
 *   `{ heightField, raycast(origin,dir,maxDist), getEnemies(): TankEntity[], getObstacles(): AABB[],
 *      spotting?: { isSpotted(id): boolean } }`
 *   When `spotting` is provided, target ACQUISITION goes through the
 *   concealment sim (src/sim/spotting.ts): tanks the AI's team has not
 *   spotted are invisible to it — exactly like the player's minimap/HUD.
 *   Raw raycast LOS is still required to actually FIRE.
 * @returns {{ update(dt:number, timeS:number): void,
 *             setWaypoints(points: Array<[number, number]>): void,
 *             notifyShellResult(hitEvent: object): void,
 *             state: string }} AIController (§3.6)
 */
export function createAI(entity: AiEntity, opts: CreateAiOptions): AiController {
  validateCreateAiInputs(entity, opts);
  const deps = opts.deps;
  const tier = selectDifficultyTier(opts.difficulty);
  const rng = selectRandomSource(opts.rng);
  const abilities = createBotAbilityPlanner(entity.spec);
  const abilityContext: BotAbilityContext = { hitBearing: 0, hitAtS: -Infinity, retreating: false, reloadS: 0, contactM: Infinity, safeJump: false };
  const jumpOrigin = new Vector3(), jumpDirection = new Vector3();
  const supportContext: AiSupportContext = {
    safeToReloadMagazine: false,
    wantsSuspensionAim: false,
  };
  // perf-r3b: AI terrain probes (cover eval, hull-down checks, LOS eyelines)
  // are pure reads that never seat geometry — serve them from the baked 1 m
  // grid when the heightfield provides one (headless fixtures don't).
  // Prototype delegation (NOT a spread): the live proxy's getters must keep
  // resolving against the active world.
  const hf = createAiHeightField(deps.heightField);
  // SPOTTING WIRING: optional concealment gate (absent in headless fixtures)
  const spotting = selectSpotting(deps);
  // camo_spotting r2: the under-fire/muzzle-intel windows NO LONGER bypass
  // the concealment formula. Fire reveal now resolves INSIDE the spotting sim
  // (spotting.ts: notifyFired pulls the shooter's next check in, and the
  // muzzle-flash branch of canSpot reveals a bloom-hot shooter with no real
  // foliage cover even beyond the camo-formula spot range) — so a revealed
  // shooter arrives through isSpotted like any other contact, while a deep
  // double-bush ambusher the formula still hides STAYS hidden (WoT
  // bush-sniper play). The underFire slot keep only their
  // POSITIONAL roles: lastSeen chase intel, target priority, and the
  // engage-envelope extension.
  const isVisibleToTeam = (e: AiEntity): boolean =>
    !spotting || spotting.isSpotted(e.id, entity);

  // Ensure the shared input record exists (integration normally creates it).
  ensureAiInput(entity);

  let spec = entity.spec;
  const liquidSafe = createNavigationLiquidSafety(hf, spec);
  const terrainSafety = createBotTerrainSafety(hf);
  let terrainCheckAtS = -Infinity, terrainBlocked = false;
  let terrainAvoidUntilS = -Infinity, terrainEscapeYaw = 0;
  // BATTLE-AI r7 doctrine wiring (see roleOf/ROLE_TUNE above).
  const role = roleOf(spec);
  const tune = ROLE_TUNE[role];
  // Casemate: the gun aims with the HULL (movement.ts §7 auto hull-traverse)
  // — angling would swing the gun off target, so casemates always face in.
  const casemate = isCasemate(spec);
  // r7: the spec's REAL HE-class slot (not a blind index 2 — the sturmtiger
  // carries [HE, HEAT] and `shells[2]` crashed tryFire; probed by class so
  // splash fallbacks and the no-pen fire gate work on every magazine).
  let heSlot = findHeShellSlot(spec);
  const slotHasAmmo = (slot: number): boolean =>
    !Array.isArray(entity.combat?.ammo) || (entity.combat!.ammo[slot] || 0) > 0;
  const slotReloadS = (slot: number): number =>
    (entity.combat?.reloadChannels?.[slot] ?? entity.combat?.reload)?.t ?? 0;
  const firstAvailableSlot = (): number => {
    for (let slot = 0; slot < spec.gun.shells.length; slot++) {
      if (slotHasAmmo(slot)) return slot;
    }
    return -1;
  };
  const angleRad = casemate ? 0 : tune.angle;
  const roleEngageR = () => tier.engageRangeM * tune.engage;
  const roleHoldR = () => {
    const base = Math.min(tier.holdRangeM * tune.hold, roleEngageR() - 60);
    // a commander's posture widens or shrinks the hold band (order gated: classic value otherwise)
    if (order === null || nowS >= order.untilS) return base;
    if (order.posture === 'push') return base * 0.55;
    if (order.posture === 'hold') return Math.min(base * 1.35, roleEngageR() - 40);
    return base;
  };
  const getAllies = selectAllies(deps);
  const getObjective = typeof deps.getObjective === 'function' ? deps.getObjective : null;
  const selfEyeM = spec.dims.heightM * EYE_FRAC;
  // A real match opens with a deployment/read phase, not both teams driving
  // straight into an immediate DPM check.  Roles release progressively:
  // scouts establish first contact, then flankers, line tanks, and finally
  // overwatch.  Close contacts still trigger a fight, and return-fire/aggro
  // paths intentionally bypass this gate, so this is tactics rather than an
  // invulnerability timer.
  const deploymentUntilS = DEPLOYMENT_TUNING[role].untilS;
  const deploymentEngageM = DEPLOYMENT_TUNING[role].engageM;
  // Gun trunnion height above ground contact — the movement sim aims the
  // barrel from here (movement.ts gunPivotHeight), so the alignment gate must
  // measure the wanted pitch from the same origin, not from the eye point.
  const selfGunM = gunPivotHeight(spec);

  // ---- persistent controller state ----------------------------------------
  let mode: AiMode = 'patrol';               // 'patrol'|'engage'|'seekCover'|'flank'
  let target: AiEntity | null = null;         // TankEntity or null
  let losClear = false;
  let gunLaneClear = true;
  let gunLaneNextCheckS = -Infinity;
  let gunLaneTargetId: string | null = null;
  let gunLaneBlockedT = 0;
  let gunLaneChecks = 0;
  let gunLaneMoves = 0;
  let acquiredAtS = -Infinity;               // when current target was first seen
  let lastSeenAtS = -Infinity;
  const lastSeen = { x: 0, z: 0 };

  const waypoints: Position2[] = [];          // [{x,z}] patrol route
  let wpIndex = 0;
  let autoPatrolBuilt = false;
  let loopWaypoints = true;

  const moveTarget = { x: 0, z: 0 };         // hull-down / approach point
  let hasMoveTarget = false;
  // LOS vantage seek: when the bot KNOWS where the enemy is (team intel)
  // but its own ray is blocked for a while, beelining lastSeen just parks
  // it against the blocking building. Sample a ring of candidate positions
  // around lastSeen and drive to the nearest one with a clear sightline.
  const vantage = { x: 0, z: 0 };
  let hasVantage = false;
  let losBlockedT = 0;
  // r7 UNREACHABLE-VANTAGE VETO: a vantage the nav layer failed to reach
  // (wedge strikes) is blacklisted for 20 s — the deterministic ring search
  // otherwise re-picks the exact same cell and the bot loops {pick, wedge,
  // drop, re-pick} for half a minute (winter is1 trace: 29 s at one wall).
  const vantageVeto = [
    { x: 0, z: 0, untilS: -1 }, { x: 0, z: 0, untilS: -1 },
    { x: 0, z: 0, untilS: -1 }, { x: 0, z: 0, untilS: -1 },
  ];
  let vantageVetoIdx = 0;
  function vetoVantage() {
    const v = vantageVeto[vantageVetoIdx];
    v.x = vantage.x;
    v.z = vantage.z;
    v.untilS = nowS + 20;
    vantageVetoIdx = (vantageVetoIdx + 1) % vantageVeto.length;
  }
  function vantageVetoed(cx: number, cz: number): boolean {
    for (let i = 0; i < vantageVeto.length; i++) {
      const v = vantageVeto[i];
      if (nowS < v.untilS && Math.hypot(v.x - cx, v.z - cz) < 15) return true;
    }
    return false;
  }
  // controls_gunnery r3 (§7 return-fire watchdog): battles with 5-6 landed
  // player shots drew ZERO enemy shells aimed back — idle bots without
  // personal LOS never rotate into engagement. If this long passes with a
  // spotted opposing tank inside engage range and no target committed,
  // force-commit to the nearest spotted enemy and let the vantage-seek
  // machinery drive toward a firing position.
  const ENGAGE_WATCHDOG_S = 15;
  let lastEngagedS = 0;
  // r6: last sim time this controller HELD the player as target (stamped per
  // update tick) — arms the FIRST-AIMED-SHOT BUDGET claim in acquireTarget.
  const coverPoint = { x: 0, z: 0 };
  let hasCoverPoint = false;
  let coverRollPassed = false;               // coverIQ roll for the current reload cycle
  let coverRolled = false;

  const flankPoints = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }];
  let flankIndex = 0;
  let flankUntilS = 0;
  let nonPenCount = 0;
  // ---- BATTLE-AI r7 doctrine state ----
  const angleSide = rng() < 0.5 ? 1 : -1; // stable hull-angling side per bot
  // sniper shoot-and-scoot: shots fired from the current position; after
  // ROLE_TUNE.scootAfter the TD relocates to a fresh sightline 40-85 m away.
  const spotPos = { x: entity.state.pos.x, z: entity.state.pos.z };
  let shotsFromSpot = 0;
  const scootPoint = { x: 0, z: 0 };
  let scootUntilS = -1;
  let scootLine = 0;          // a casemate's scoot along its line of fire: -1 back, +1 up, 0 a free leg
  let lineScootUp = false;    // the casemate's next scoot goes up the line (it last backed off it)
  let relocations = 0;   // probe-visible shoot-and-scoot counter
  let prevReloadT = 0;   // reload-edge watch (a jump up = a shot left the gun)
  // universal retreat-toward-support (tracked/low): time-boxed reverse window
  const fallbackPoint = { x: 0, z: 0 };
  let fallbackUntilS = -1;
  let fallbackCdS = -1;
  let fallbackReverse = true;
  let lastHp = combatHitPoints(entity);
  let burstDamage = 0;
  let burstDamageUntilS = -1;
  // ---- hit reactions (bot philosophy r1) ----
  let reaction: Reaction | null = null;
  let reactUntilS = -1;
  let reactCdUntilS = -1;
  let reactSide = 1;
  let threatBearing = 0;          // world bearing self → the gun that last hit the team
  const reactPoint = { x: 0, z: 0 };
  let reactions = 0;              // probe-visible count
  // an UNSEEN shooter is a suspect, not a target: remembered for the hull turn and the cover pick
  let suspect: AiEntity | null = null;
  let suspectUntilS = -1;
  // scout kite/orbit: keep moving between cover, never brawl
  const kitePoint = { x: 0, z: 0 };
  let kiteUntilS = -1;
  let orbitSide = rng() < 0.5 ? 1 : -1;
  let orbitFlipS = 0;
  // no-suicide guard bookkeeping (see outnumberedSolo)
  let guardT = 0;
  let guardLastS = -1;
  let guardReleaseUntilS = -1;
  // hull-down stare-down breaker (see runProbes miss branch)
  let probeMiss = false;
  let probeMissT = 0;
  let penDeniedT = 0;                        // round 48 pacing: closed pen gate dwell (see updatePenDeniedManeuver)
  // round 60 pacing: what the current target has been DOING (still hull, silent gun) and whether this bot's
  // own shells still penetrate it; the press point once the target has proven passive
  let targetActivityId: string | null = null;
  let targetStillS = 0;
  let targetLastShotS = -Infinity;
  let prevTargetReloadT = 0;
  let lastPenAtS = -Infinity;
  const pressPoint = { x: 0, z: 0 };
  let passivePressing = false;
  let passivePressRepickS = -1;
  let passivePresses = 0;                    // probe-visible count of press starts
  let passivePressRepicks = 0;               // probe-visible count of masked press points given up
  let passivePressCandidate = -1;            // probe-visible: ring * 16 + bearing index of the chosen press point
  let passivePressArcT = 0;                  // gun pinned at a pitch stop while standing on the press point
  // press points given up (masked, missed out, pinned, unreached) and the spots misses came from, each kept out of the
  // next picks for 120 s. One slot let two unreachable points take turns, each given up 30 s after it was picked, for
  // 580 s (Reservoir pacing seed 50001 on the track-contact parity tree; see LEG_DEAD_M).
  const pressVetoes = Array.from({ length: PRESS_VETO_SLOTS }, () => ({ x: 0, z: 0, untilS: -1 }));
  // missing an idle target (see PASSIVE_PRESS_MISSES)
  let missStreak = 0;                        // main-gun rounds in a row at missStreakTargetId without a hit on it…
  let missStreakTargetId: string | null = null;
  const missSpot = { x: 0, z: 0 };           // …all fired from within MISS_SPOT_M of this spot
  let missLastShotS = -Infinity;
  let missVerdicts = 0;                      // probe-visible count of spots given up for their misses
  let pressPickS = -Infinity;                // when the press point was last picked…
  let pressReachByS = Infinity;              // …and the time it must be reached by (PRESS_REACH_SLACK_S)
  let pressUnreached = 0;                    // probe-visible count of press points given up unreached
  let flankLaneCheckS = -Infinity;
  let flankLaneClear = false;                // the flank exemption's gun-to-hull lane at the last check
  // round 62 pacing: the search for a lost enemy (beginSearchLeg / updateSearchLeg)
  let searching = false;                     // a search leg's route is in the waypoints
  let searchKind = '';                       // probe-visible: sector | seen | objective | sweep | wide | direct
  const searchGoal = { x: 0, z: 0 };
  let searchLegs = 0;                        // probe-visible count of legs begun
  let searchFailures = 0;                    // legs ended without contact since contact was last held
  let searchLegStartS = -1;
  let searchLegBudgetS = 0;
  let searchLegStartDistM = 0;               // straight-line distance to the goal when the leg began
  let searchStrikesAtStart = 0;
  let searchSweepIndex = 0;                  // rotates the sweep bearings across legs
  let searchNextCheckS = -1;
  let strikeEvents = 0;                      // monotonic count of stuck strikes (stuckStrikes itself is reset)
  let colliderStops = 0;                     // probe-visible count of collider stops backed off (COLLIDER_STOP_MPS)
  // round 62 pacing: the ammunition economy — expected hit chance, the HE fallback's worth, the empty rack
  let heWorth = false;                       // the HE fallback round would burst for HE_SPLASH_WORTH_HP or more
  let heBurstBest = 0;                       // best surface-burst estimate of the HE slot in the last probe pass
  let heBurstHFrac = 0.5;                    // the zone that estimate was made on: the fallback round is laid there
  let heBurstLatFrac = 0;
  let hitChance = 1;                         // expected hit chance of the current lay (tier error + dispersion)
  let conserving = false;                    // holding fire at a bot / passive target the lay is unlikely to hit
  let conserveHolds = 0;                     // probe-visible count of ticks a loaded gun held fire to conserve
  let emptyRack = false;
  let rackSpentT = 0;                        // the spent-rack dwell against rackDwellId (see updateSpentRack)
  let rackDwellId: string | null = null;
  let rackSpentId: string | null = null;     // the target the rack was last found unable to hurt…
  let rackSpentUntilS = -1;                  // …until this sim second
  let rackSpentVerdicts = 0;                 // probe-visible count
  // the on-objective shift (see OBJECTIVE_SHIFT_DWELL_S)
  let cannotFightT = 0;
  const objectiveShiftPoint = { x: 0, z: 0 };
  let objectiveShifting = false;
  let objectiveShifts = 0;                   // probe-visible count
  // the zone's hold point (see ZONE_HOLD_RINGS_M), kept for the zone centre it was found for
  const zoneHold = { x: 0, z: 0 };
  let zoneHoldForX = NaN, zoneHoldForZ = NaN;
  let zoneHoldMoves = 0;                     // probe-visible count of zone centres held from ground beside them
  let missionReleaseUntilS = -1;             // a blocked mission route has released the hull until then
  let missionReleases = 0;                   // probe-visible count
  // another level (see ELEVATION_LOCK_S)
  let elevationLockT = 0;
  let levelRouting = false;
  let levelRouteTargetId: string | null = null;
  let levelRouteUntilS = -1;
  let levelRouteStrikes = 0;
  let levelRoutes = 0;                       // probe-visible count
  let unbearableId: string | null = null;    // the target no gun angle or route reaches…
  let unbearableUntilS = -1;                 // …until this sim second
  let unbearableVerdicts = 0;                // probe-visible count
  const levelGoal = { x: 0, z: 0, y: 0 };
  const enemyScratch: AiEntity[] = [];
  let ramming = false;
  let ramRuns = 0;                           // probe-visible count of ram runs begun
  let lastRun = false;                       // the run under way is the last run (see EMPTY_RETIRE_M)…
  let lastRuns = 0;                          // …and the probe-visible count of them
  let ramCommitUntilS = -1;
  let ramBackoffUntilS = -1;                 // a stalled run backs off for the next run-up
  let ramCapMps = Infinity;                  // the run's closing-speed cap (see RAM_FINISH_MARGIN)
  let ramLineCheckS = -Infinity;
  let ramLineClear = false;                  // the straight line to the rammed hull at the last check
  let ramContactUntilS = -1;                 // the run touched the hull: its motion until then is our push…
  let ramContactId: string | null = null;    // …on this hull
  const ramPoint = { x: 0, z: 0 };
  // geometry-hard blocked commit → follow the authored lane a while
  let laneFallbackUntilS = -1;
  // starved trigger + clear ray → forced clean halt (settled-shot window)
  let settleUntilS = -1;
  let settleStreak = 0;
  let settleCdUntilS = -1;
  // A friendly holding the shell corridor is a maneuver problem, not a reason
  // to shoot through them or stare forever. Sustained blocks trigger a short
  // lateral firing-lane relocation shared by both teams.
  let friendlyBlockT = 0;
  let friendlyBlockCount = 0;
  let friendlyLaneMoves = 0;
  let friendlyLaneRetryS = -Infinity;        // a lane search that found nothing waits until then (FRIENDLY_LANE_RETRY_S)
  let friendlyLaneSearches = 0;              // probe-visible count of lane searches run
  let lastFriendlyRisk: FriendlyFireRisk | null = null;
  let underFire: AiEntity | null = null; // shooter revealed by hitting us/a teammate
  let underFireUntilS = -Infinity; // reaction window end (sim seconds)
  let directlyUnderFire = false;
  // Aim solution (updated by probes at PROBE_INTERVAL_S).
  let aimHFrac = 0.48;
  let aimLatFrac = 0;
  let chosenSlot = 0;
  let cachedPenRatio = 1;
  let penGateOk = true;

  // Persistent aim error (resampled periodically and after every shot result).
  let errYawRad = 0;
  let errPitchRad = 0;
  let targetTrackLagS = 0;
  let targetLeadScale = 1;
  // Blind-fire spread (camo_spotting r5) — see resampleAimError.
  let blindYawRad = 0;
  let blindPitchRad = 0;
  let playerYawRad = 0;
  let playerPitchRad = 0;

  // Timers (count down with dt).
  let losTimer = rng() * LOS_INTERVAL_S;     // stagger AI work across ticks
  let probeTimer = rng() * PROBE_INTERVAL_S;
  let coverTimer = 0;
  let errTimer = 0;
  let obstacleTimer = 0;

  // Formation deconfliction is a movement authority, not a cosmetic steer
  // nudge. It survives route/unstick logic and is exposed to headless soaks.
  let allyYielding = false;
  let allyAvoidingId: string | null = null;
  let allyClosestM = Infinity;
  let allyYieldT = 0;
  let allyDeadlockT = 0;
  let allyEmergencyActive = false;
  let allyEmergencyStops = 0;
  let allyReverseEscapes = 0;
  let allyEscapeUntilS = -1;
  let allyEscapeSteer = 0;
  let trafficDetourUntilS = -1;
  let trafficDetourStage = 0;
  let trafficDetourAllyId: string | null = null; // the parked ally the committed passing path goes round
  const trafficNear = { x: 0, z: 0 }, trafficFar = { x: 0, z: 0 };
  // the bounded yield (see updateAllyHold): time held behind a parked ally, where the hold began, give-ways
  let allyHoldT = 0;
  let allyHoldLastS = -Infinity;
  const allyHoldAnchor = { x: 0, z: 0 };
  let allyHoldGiveWays = 0;

  // Stuck / gun-limit recovery.
  let lowSpeedT = 0;
  let slopeBlockT = 0;
  let unstickUntilS = -1;
  let unstickSteer = 1;
  // PROGRESS-based stuck sensing: `state.speed` is the DRIVETRAIN speed and
  // stays high while the collision pushback exactly cancels the motion
  // against a wall/rock — the old |speed|<0.3 test never fired and bots
  // ground against the first obstacle on their opening push for the whole
  // battle (r7 dead-air root cause). Track actual displacement instead.
  let progX = entity.state.pos.x;
  let progZ = entity.state.pos.z;
  let progressRate = 2; // m/s EMA of real displacement
  let stuckStrikes = 0; // consecutive unstick cycles without real progress
  let freeMoveT = 0;    // r7: sustained-free-movement clock (strike clearing)
  // Blocked-route detour: after repeated strikes the straight line is a
  // wall/rock face — drive at a sideways-offset ghost target for a few
  // seconds (side flips on the next strike) so the route bends around the
  // blocker instead of ramming it forever.
  let detourUntilS = -1;
  let detourSide = 1;
  let gunLimitT = 0;
  let nudgeUntilS = -1;
  let arcLimitedT = 0;              // gun pinned at an elevation/depression stop
  let arcScoot = false;             // the running scoot leg is the arc limit's: it owns the hull (see LEG_DEAD_M)
  // the back-up or relocation leg under way (see LEG_DEAD_M): its kind (0 none, 1 a back-up, 2 a scoot leg), where it
  // began, the travel it tries (a unit vector) and whether the scoot drive has run it
  let legKind = 0;
  const leg = { x: 0, z: 0, yaw: 0, atS: -Infinity, dirX: 0, dirZ: 0, driven: false };
  let deadLegs = 0;                 // probe-visible count of legs that went nowhere
  const blockedTravel = { x: 0, z: 0, untilS: -Infinity }; // the last dead leg's travel, kept out of the next legs
  // STALEMATE BREAKER (controls_gunnery r5): mid-battle enemy fire rate
  // collapsed to 1-2 shells/10 s (bots posturing in patrol/seekCover with
  // live contacts). Track the last time the trigger was actually pulled;
  // a long silent stretch WITH a contact forces a vantage push and
  // suspends cover-seeking for STALEMATE_PUSH_S.
  let lastFiredAtS = 0;
  let pressUntilS = -1;
  // ---- commander orders (game/jevCommander.ts) ----
  let order: AiOrder | null = null;
  let ordersTaken = 0;                       // probe-visible count of orders taken
  const orderActive = (): boolean => order !== null && nowS < order.untilS;
  let dispGateT = 0; // time spent otherwise-ready but dispersion-gated (r5)
  // coverIQ hesitation decays over the battle so late-game bots commit
  // instead of endlessly rolling hull-down/cover searches between shots.
  // BATTLE-AI r7: role-scaled — snipers/flankers duck between shots more
  // (reload discipline), brawlers hold the line they pushed.
  const effCoverIQ = () => {
    if (nowS < pressUntilS) return 0;
    const classic = clamp(tier.coverIQ * tune.cover, 0, 1) * clamp(1.15 - nowS / 240, 0.35, 1);
    if (!orderActive()) return classic;
    // a holding posture and a high threat read both raise the cover discipline
    let iq = classic;
    if (order!.posture === 'hold') iq = Math.min(1, iq * 1.25);
    if (order!.threat >= 2.5) iq = Math.min(1, iq * 1.3);
    return iq;
  };

  const scanPhase = rng() * TAU;             // idle turret sweep phase
  // r4: per-controller vantage fan bias — clustered bots hunting the same
  // contact used to fan identical bearings, converge on one candidate and
  // wedge against each other at full throttle (probe: thr=1.0, spd=0.1).
  const vantageBias = (rng() - 0.5) * 0.9;
  let obstacles = deps.getObstacles();
  const nearbyObstacles: AiObstacle[] = [];
  let nowS = 0;                              // last timeS seen by update()

  resampleAimError();

  // ---- helpers -------------------------------------------------------------

  function resampleAimError() {
    const m = tier.aimErrMult;
    const extra = Math.sqrt(Math.max(0, m * m - 1));
    // Fully-aimed sigma in radians: baseAccuracy is 2σ @ 100 m (§3.5.1 lock).
    const sigma = ((spec.gun.baseAccuracy / 2) / 100) * extra;
    errYawRad = gauss(rng) * sigma;
    errPitchRad = gauss(rng) * sigma;
    targetTrackLagS = Math.max(0.02,
      tier.trackLagS * (0.72 + rng() * 0.56));
    targetLeadScale = clamp(1 + gauss(rng) * tier.leadSigma, 0.55, 1.35);
    // camo_spotting r5: blind-fire spread — shelling a REMEMBERED muzzle
    // position is area fire, not a lay on a seen hull. Sampled separately
    // (additive with the tier error) because the hard tier's aimErrMult of
    // 1.0 makes the tier sigma exactly zero; ~10 mrad yaw / 6 mrad pitch
    // puts a 2.5 m sigma on a 250 m blind shot — real suppression, not a
    // laser.
    blindYawRad = gauss(rng) * 0.010;
    blindPitchRad = gauss(rng) * 0.006;
    playerYawRad = gauss(rng) * 0.0045;
    playerPitchRad = gauss(rng) * 0.0030;
    // Hold one imperfect estimate long enough to read as a human correction,
    // not per-frame aim jitter or omniscient tracking.
    errTimer = 1.8 + rng() * 1.25;
  }

  function aliveEnemies(): AiEntity[] {
    const list = deps.getEnemies();
    if (unbearableId === null) return list; // filtered inline at use sites to avoid allocation
    // a target on a level no gun angle or route reaches is out of the ranking while the verdict lasts
    enemyScratch.length = 0;
    for (let i = 0; i < list.length; i++) if (list[i].id !== unbearableId) enemyScratch.push(list[i]);
    return enemyScratch;
  }

  function enemyAlive(e: AiEntity | null | undefined): e is AiEntity {
    return !!e && e !== entity && (e.team == null || entity.team == null || e.team !== entity.team)
      && e.modeActive !== false && (!e.combat || !e.combat.destroyed);
  }

  const focusCounts = new Map<string, number>();
  function refreshFocusCounts() {
    focusCounts.clear();
    if (!getAllies) return;
    const friends = getAllies();
    for (let i = 0; i < friends.length; i++) {
      if (friends[i] === entity || friends[i]?.combat?.destroyed) continue;
      const ctl = (friends[i] as ControllerOwnedEntity | undefined)?.aiCtl;
      const id = ctl && ctl.targetId;
      if (id) focusCounts.set(id, (focusCounts.get(id) || 0) + 1);
    }
  }

  // Fire-team allocation: one ally already laying on a target is a signal to
  // cover the other lane, not to dog-pile the same hull. This removes the
  // two-volley snowball that ended small-team matches in under two minutes.
  // A bot still returns fire immediately and can finish its own target.
  function focusWeight(e: AiEntity | null | undefined): number {
    if (!e) return 1;
    const focus = focusCounts.get(e.id) || 0;
    if (focus === 1) return 1.35;
    if (focus === 2) return 1.7;
    if (focus === 3) return 2.05;
    if (focus >= 4) return 2.4;
    return 1;
  }

  /** Line of sight between two eye points via the world raycast. */
  function hasLos(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
  ): boolean {
    _vA.set(ax, ay, az);
    _vB.set(bx - ax, by - ay, bz - az);
    const dist = _vB.length();
    if (dist < 1e-3) return true;
    _vB.multiplyScalar(1 / dist);
    const hit = deps.raycast(_vA, _vB, dist);
    return !hit || hit.dist > dist - 2.0;
  }

  function eyeY(e: AiEntity): number {
    return e.state.pos.y + e.spec.dims.heightM * EYE_FRAC;
  }

  function rememberPosition(candidate: AiEntity, timeS: number): void {
    lastSeen.x = candidate.state.pos.x;
    lastSeen.z = candidate.state.pos.z;
    lastSeenAtS = timeS;
  }

  function claimTarget(
    candidate: AiEntity,
    timeS: number,
    clearLine: boolean,
    remember: boolean,
  ): void {
    const changed = target !== candidate;
    target = candidate;
    losClear = clearLine;
    if (changed) {
      acquiredAtS = timeS;
      nonPenCount = 0;
      probeTimer = 0;
    }
    if (remember) rememberPosition(candidate, timeS);
  }

  function activeAggressor(timeS: number): AiEntity | null {
    if (underFire && timeS < underFireUntilS && enemyAlive(underFire)) return underFire;
    return null;
  }

  function tryAggressor(
    timeS: number,
    eyeX: number,
    eyeYPosition: number,
    eyeZ: number,
  ): boolean {
    const aggressor = activeAggressor(timeS);
    if (!aggressor || aggressor === target || aggressor.id === unbearableId) return false;
    if (target && enemyAlive(target) && isVisibleToTeam(target)) {
      const current = target.state.pos;
      const currentClear = hasLos(eyeX, eyeYPosition, eyeZ, current.x, eyeY(target), current.z);
      if (currentClear && (!directlyUnderFire ||
          entity.state.pos.distanceToSquared(aggressor.state.pos) >
          Math.max(25 * 25, entity.state.pos.distanceToSquared(current) * 1.3))) return false;
    }
    const position = aggressor.state.pos;
    const seen = isVisibleToTeam(aggressor)
      && hasLos(eyeX, eyeYPosition, eyeZ, position.x, eyeY(aggressor), position.z);
    // bot philosophy r1: an unseen aggressor (even a repeat-firing player) is a
    // suspect — the hull turns onto the shot and seeks cover; it never becomes a
    // target to fire at until the team spots it.
    if (!seen) {
      noteSuspect(aggressor, timeS, false);
      return false;
    }
    claimTarget(aggressor, timeS, true, true);
    return true;
  }

  /** Keep a fight stable, but do not tunnel past a much closer visible hull. */
  function tryPrioritizeLocalThreat(enemies: AiEntity[], timeS: number,
    eyeX: number, eyeYPosition: number, eyeZ: number): boolean {
    if (!target) return false;
    const currentDistanceSq = entity.state.pos.distanceToSquared(target.state.pos);
    const localRange = timeS < deploymentUntilS ? Math.min(120, deploymentEngageM) : 120;
    let best: AiEntity | null = null;
    let bestPriority = Infinity;
    for (const candidate of enemies) {
      if (candidate === target || !enemyAlive(candidate) || !isVisibleToTeam(candidate)) continue;
      const distanceSq = entity.state.pos.distanceToSquared(candidate.state.pos);
      if (distanceSq > localRange * localRange || distanceSq >= currentDistanceSq * .36) continue;
      if (onObjective(target) && !onObjective(candidate) && distanceSq > 25 * 25) continue;
      const p = candidate.state.pos;
      const priority = targetPriority(candidate, distanceSq);
      if (priority >= bestPriority || !hasLos(eyeX, eyeYPosition, eyeZ, p.x, eyeY(candidate), p.z)) continue;
      best = candidate; bestPriority = priority;
    }
    if (!best) return false;
    claimTarget(best, timeS, true, true);
    return true;
  }

  function targetHealthFraction(candidate: AiEntity): number | null {
    const combat = candidate.combat;
    return combat?.maxHp ? combat.hp / combat.maxHp : null;
  }

  function tryPrioritizeWeakTarget(
    enemies: AiEntity[],
    timeS: number,
    eyeX: number,
    eyeYPosition: number,
    eyeZ: number,
  ): boolean {
    if (!target || !losClear) return false;
    const currentHealth = targetHealthFraction(target);
    if (currentHealth == null || currentHealth <= 0.4) return false;
    const currentPosition = target.state.pos;
    const currentDx = currentPosition.x - eyeX;
    const currentDz = currentPosition.z - eyeZ;
    const currentDistanceSq = currentDx * currentDx + currentDz * currentDz;
    for (let index = 0; index < enemies.length; index++) {
      const candidate = enemies[index];
      if (!candidate || candidate === target || !enemyAlive(candidate)) {
        continue;
      }
      const health = targetHealthFraction(candidate);
      if (health == null || health >= 0.25) continue;
      if ((focusCounts.get(candidate.id) || 0) >= 1 || !isVisibleToTeam(candidate)) continue;
      const position = candidate.state.pos;
      const dx = position.x - eyeX;
      const dz = position.z - eyeZ;
      if (dx * dx + dz * dz > currentDistanceSq * 1.3) continue;
      if (!hasLos(eyeX, eyeYPosition, eyeZ, position.x, eyeY(candidate), position.z)) {
        continue;
      }
      claimTarget(candidate, timeS, true, true);
      return true;
    }
    return false;
  }

  function refreshCurrentTarget(
    enemies: AiEntity[],
    timeS: number,
    eyeX: number,
    eyeYPosition: number,
    eyeZ: number,
  ): boolean {
    if (!target) return false;
    if (target.id === unbearableId) {
      // left alone (see ELEVATION_LOCK_S): its sighting is no chase point, so the search can begin at once
      target = null;
      losClear = false;
      lastSeenAtS = -Infinity;
      return false;
    }
    if (!enemyAlive(target)) {
      target = null;
      losClear = false;
      // round 62 pacing (Amberford seed 1): a dead target's last sighting is no chase point and no search goal
      // — the survivor drove 180 s back to where its kill had stood. Forgetting it also lets the search begin
      // at once instead of after the memory window.
      lastSeenAtS = -Infinity;
      return false;
    }
    const position = target.state.pos;
    const visible = isVisibleToTeam(target);
    losClear = visible
      && hasLos(eyeX, eyeYPosition, eyeZ, position.x, eyeY(target), position.z);
    if (visible) rememberPosition(target, timeS);
    // the rack is spent on this one: any other spotted enemy in sight takes the slot (the ranking puts it first)
    if (target.id === rackSpentId && scanVisibleTarget(enemies, timeS, eyeX, eyeYPosition, eyeZ)) return true;
    if (tryPrioritizeLocalThreat(enemies, timeS, eyeX, eyeYPosition, eyeZ)) return true;
    if (tryPrioritizeWeakTarget(enemies, timeS, eyeX, eyeYPosition, eyeZ)) return true;
    const memoryActive = timeS - lastSeenAtS <= TARGET_MEMORY_S;
    if (memoryActive) return true;
    target = null;
    return false;
  }

  /** True when the candidate stands on (or within OBJECTIVE_MARGIN_M of) this bot's mission objective. */
  function onObjective(candidate: AiEntity): boolean {
    const objective = getObjective ? getObjective() : null;
    if (!objective) return false;
    const dx = candidate.state.pos.x - objective.x;
    const dz = candidate.state.pos.z - objective.z;
    const reach = objective.radiusM + OBJECTIVE_MARGIN_M;
    return dx * dx + dz * dz <= reach * reach;
  }

  /**
   * Bot philosophy r1 target hierarchy (lower = better): mission objective →
   * closest → weakest. A lane an ally already covers reads farther — fire-team
   * allocation, then bucketed into TARGET_BAND_M bands so that inside one band
   * the weakest hull leads; the raw threat distance is the final tiebreak.
   */
  function targetPriority(candidate: AiEntity, distanceSq: number): number {
    const health = targetHealthFraction(candidate);
    const threatDistance = Math.sqrt(distanceSq) * focusWeight(candidate);
    const band = Math.floor(threatDistance / TARGET_BAND_M);
    // a target this rack has been found unable to hurt ranks after every other (see RACK_SPENT_S)
    return (candidate.id === rackSpentId ? 2e9 : 0) + (onObjective(candidate) ? 0 : 1e9) + band * 1e6
      + (health == null ? 1 : Math.max(0, Math.min(1, health))) * 1e5 + threatDistance;
  }

  function scanVisibleTarget(
    enemies: AiEntity[],
    timeS: number,
    eyeX: number,
    eyeYPosition: number,
    eyeZ: number,
  ): boolean {
    let best: AiEntity | null = null;
    let bestPriority = Infinity;
    const deploymentRangeSq = deploymentEngageM * deploymentEngageM;
    for (let index = 0; index < enemies.length; index++) {
      const candidate = enemies[index];
      if (!enemyAlive(candidate) || !isVisibleToTeam(candidate)) continue;
      const position = candidate.state.pos;
      const dx = position.x - eyeX;
      const dz = position.z - eyeZ;
      const distanceSq = dx * dx + dz * dz;
      if (timeS < deploymentUntilS && distanceSq > deploymentRangeSq) continue;
      const priority = targetPriority(candidate, distanceSq);
      if (priority >= bestPriority) continue;
      if (!hasLos(eyeX, eyeYPosition, eyeZ, position.x, eyeY(candidate), position.z)) {
        continue;
      }
      best = candidate;
      bestPriority = priority;
    }
    if (!best) return false;
    claimTarget(best, timeS, true, true);
    return true;
  }

  function nearestSpottedEnemy(enemies: AiEntity[], eyeX: number, eyeZ: number): AiEntity | null {
    let nearest: AiEntity | null = null;
    let nearestDistanceSq = Infinity;
    for (let index = 0; index < enemies.length; index++) {
      const candidate = enemies[index];
      if (!enemyAlive(candidate) || !isVisibleToTeam(candidate)) continue;
      const dx = candidate.state.pos.x - eyeX;
      const dz = candidate.state.pos.z - eyeZ;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= nearestDistanceSq) continue;
      nearest = candidate;
      nearestDistanceSq = distanceSq;
    }
    return nearest;
  }

  function tryEngagementWatchdog(
    enemies: AiEntity[],
    timeS: number,
    eyeX: number,
    eyeZ: number,
  ): void {
    if (timeS - lastEngagedS <= ENGAGE_WATCHDOG_S) return;
    const candidate = nearestSpottedEnemy(enemies, eyeX, eyeZ);
    if (!candidate) return;
    const dx = candidate.state.pos.x - eyeX;
    const dz = candidate.state.pos.z - eyeZ;
    const range = timeS < deploymentUntilS ? deploymentEngageM : roleEngageR();
    if (dx * dx + dz * dz >= range * range) return;
    claimTarget(candidate, timeS, false, true);
    losBlockedT = Math.max(losBlockedT, 5);
  }

  /** A commander's target order: the named enemy, when it is alive and the team has it spotted, takes the slot. */
  function tryOrderedTarget(
    enemies: AiEntity[],
    timeS: number,
    eyeX: number,
    eyeYPosition: number,
    eyeZ: number,
  ): boolean {
    if (!orderActive() || !order!.targetId) return false;
    let candidate: AiEntity | null = null;
    for (let index = 0; index < enemies.length; index++) {
      if (enemies[index].id === order!.targetId) { candidate = enemies[index]; break; }
    }
    if (!candidate || !enemyAlive(candidate) || !isVisibleToTeam(candidate)) return false;
    const position = candidate.state.pos;
    const clearLine = hasLos(eyeX, eyeYPosition, eyeZ, position.x, eyeY(candidate), position.z);
    claimTarget(candidate, timeS, clearLine, true);
    if (!clearLine) losBlockedT = Math.max(losBlockedT, 5); // no line yet: the vantage search moves the hull
    return true;
  }

  function acquireTarget(timeS: number): void {
    const enemies = aliveEnemies();
    refreshFocusCounts();
    const position = entity.state.pos;
    const eyeX = position.x;
    const eyeYPosition = position.y + selfEyeM;
    const eyeZ = position.z;

    if (tryOrderedTarget(enemies, timeS, eyeX, eyeYPosition, eyeZ)) return;
    if (directlyUnderFire && tryAggressor(timeS, eyeX, eyeYPosition, eyeZ)) return;
    if (refreshCurrentTarget(enemies, timeS, eyeX, eyeYPosition, eyeZ)) return;
    if (scanVisibleTarget(enemies, timeS, eyeX, eyeYPosition, eyeZ)) return;
    if (tryAggressor(timeS, eyeX, eyeYPosition, eyeZ)) return;
    losClear = false;
    tryEngagementWatchdog(enemies, timeS, eyeX, eyeZ);
  }
  /**
   * Probe candidate aim zones on the current target with queryAimArmor +
   * estimatePenRatio; choose aim fractions and shell slot. Escalates from the
   * standard round to the special round, and to HE when nothing penetrates.
   */
  const probeResult = {
    score: -Infinity,
    ratio: 0,
    heightFraction: 0.48,
    lateralFraction: 0,
    slot: 0,
  };

  function resetProbeResult(): void {
    probeResult.score = -Infinity;
    probeResult.ratio = 0;
    probeResult.heightFraction = 0.48;
    probeResult.lateralFraction = 0;
    probeResult.slot = 0;
  }

  // Round 60 pacing (2026-09-24): the probe used to score hull zones the terrain hides. Two Copper Mesa bots at the
  // foot of the host's plateau probed the lower hull (ratio 14-21, gate open) and put 66 rounds into the rim in
  // front of it: the eye-to-eye LOS and the turret-top gun lane both cleared while the hull zones sat behind the
  // crest. A zone the shell cannot reach from the gun is not a zone. Visibility is cast once per candidate per
  // probe pass (cached across the shell slots); when the tier's whole set is masked the probe falls back to the
  // visible turret, and when that is masked too the round-48 probe-miss relocation moves the hull.
  const probeVisible = [0, 0, 0, 0, 0, 0, 0, 0]; // per candidate index: 0 unknown, 1 visible, -1 masked

  function probeCandidateVisible(
    index: number,
    candidateX: number,
    candidateY: number,
    candidateZ: number,
  ): boolean {
    if (probeVisible[index] !== 0) return probeVisible[index] > 0;
    const source = entity.state.pos;
    _vG.set(source.x, source.y + selfGunM, source.z);
    _vH.set(candidateX - _vG.x, candidateY - _vG.y, candidateZ - _vG.z);
    const distance = _vH.length();
    let visible = withinGunArc(Math.atan2(_vH.y, Math.hypot(_vH.x, _vH.z) || 1e-6));
    if (visible && distance > 1e-3) {
      _vH.multiplyScalar(1 / distance);
      const hit = deps.raycast(_vG, _vH, distance);
      visible = !hit || hit.dist > distance - 2.0; // the eye-LOS allowance for target-adjacent cover
    }
    probeVisible[index] = visible ? 1 : -1;
    return visible;
  }

  /** @returns true when the candidate zone is in the gun's reach (scored or not). */
  function evaluateProbeCandidate(
    slot: number,
    shell: DamageShellSpec,
    pose: ReturnType<typeof tankPoseFromState>,
    armor: ArmorModel,
    lateralX: number,
    lateralZ: number,
    heightFraction: number,
    lateralFraction: number,
    index: number,
  ): boolean {
    if (!target) return false;
    const targetPosition = target.state.pos;
    const targetHeight = target.spec.dims.heightM;
    const targetWidth = target.spec.dims.widthM;
    const source = entity.state.pos;
    const candidateX = targetPosition.x + lateralX * lateralFraction * targetWidth;
    const candidateY = targetPosition.y + heightFraction * targetHeight;
    const candidateZ = targetPosition.z + lateralZ * lateralFraction * targetWidth;
    if (!probeCandidateVisible(index, candidateX, candidateY, candidateZ)) return false;
    _vA.set(source.x, source.y + selfEyeM, source.z);
    _vB.set(candidateX - source.x, candidateY - _vA.y, candidateZ - source.z);
    const distance = _vB.length();
    if (distance < 1e-3) return true;
    _vB.multiplyScalar(1 / distance);
    const info = queryAimArmor(_vA, _vB, distance + 10, pose, armor);
    if (!info) return true;
    const ratio = estimatePenRatio(shell, distance, info);
    if (isHeClass(shell.type)) {
      // Round 62 pacing: what the HE fallback round is worth as a SURFACE BURST on this zone (damage.ts
      // applyHeSurfaceBurst: half the roll minus the armour stack's absorption). Urban seed 2's bots put ten HE
      // rounds into turret cheeks and mantlets for nothing; a round that bursts for less than
      // HE_SPLASH_WORTH_HP is kept for a side, a roof or a track.
      let stackMm = 0;
      const layers = info.layers;
      if (layers.length) {
        for (let i = 0; i < layers.length; i++) stackMm += layers[i].plate.physicalMm || 0;
      } else {
        stackMm = info.plate.physicalMm || 0;
      }
      const burst = 0.5 * (shell.dmg || 0) - HE_ARMOR_ABSORB_PER_MM * stackMm;
      if (burst > heBurstBest) {
        heBurstBest = burst;
        heBurstHFrac = heightFraction; // the fallback round is laid on THIS zone, not on centre mass (Alpine
        heBurstLatFrac = lateralFraction; // seed 0: eleven HE rounds into a turret cheek the lower plate had priced)
      }
    }
    const score = Math.min(ratio, 1.6) - slot * 0.08 -
      Math.abs(lateralFraction) * 0.02;
    if (score <= probeResult.score) return true;
    probeResult.score = score;
    probeResult.ratio = ratio;
    probeResult.heightFraction = heightFraction;
    probeResult.lateralFraction = lateralFraction;
    probeResult.slot = slot;
    return true;
  }

  function evaluateProbeSlot(
    slot: number,
    shell: DamageShellSpec,
    pose: ReturnType<typeof tankPoseFromState>,
    armor: ArmorModel,
    lateralX: number,
    lateralZ: number,
  ): void {
    if (!target) return;
    const candidates = PROBE_SETS[tier.probeLevel];
    let anyVisible = false;
    for (let i = 0; i < candidates.length; i++) {
      if (evaluateProbeCandidate(slot, shell, pose, armor, lateralX, lateralZ,
        candidates[i][0], candidates[i][1], i)) anyVisible = true;
    }
    if (!anyVisible) {
      evaluateProbeCandidate(slot, shell, pose, armor, lateralX, lateralZ,
        PROBE_TURRET_FALLBACK[0], PROBE_TURRET_FALLBACK[1], probeVisible.length - 1);
    }
  }

  /**
   * Round 62 pacing: the ratio a zone needs for the gate to open grows with range. At point-blank the shell
   * lands where the probe looked; at 300 m the tier's persistent error (σ ≈ 6 mrad on the normal tier: 1.8 m)
   * lands it on the plate beside the probed one, and a 0.9-1.0 zone there is a coin toss the rack cannot afford
   * (Saltwind seed 0: ratio 0.86-0.90 on the M1A2's lower front, every round a non-pen).
   */
  function penGateRatio(distance: number): number {
    const t = clamp((distance - PEN_GATE_NEAR_M) / (PEN_GATE_FAR_M - PEN_GATE_NEAR_M), 0, 1);
    return PEN_GATE_RATIO_NEAR + (PEN_GATE_RATIO_FAR - PEN_GATE_RATIO_NEAR) * t;
  }

  function applyProbeResult(distance: number): void {
    if (probeResult.ratio >= penGateRatio(distance)) {
      aimHFrac = probeResult.heightFraction;
      aimLatFrac = probeResult.lateralFraction;
      chosenSlot = probeResult.slot;
      cachedPenRatio = probeResult.ratio;
      penGateOk = true;
      probeMiss = false;
      heWorth = false;
      return;
    }
    aimLatFrac = 0;
    // The HE fallback is a REAL HE round that would burst for something on the zone the probe saw; a magazine
    // without one (findHeShellSlot answers the last slot) or a burst the armour would absorb keeps the gate shut
    // and lets the closed-gate flank and the press change the geometry instead.
    heWorth = heSlot >= 0 && isHeClass(spec.gun.shells[heSlot]?.type ?? '') && slotHasAmmo(heSlot)
      && heBurstBest >= HE_SPLASH_WORTH_HP;
    chosenSlot = heWorth ? heSlot : (probeResult.score > -Infinity ? probeResult.slot : firstAvailableSlot());
    if (!slotHasAmmo(chosenSlot)) chosenSlot = firstAvailableSlot();
    penGateOk = false;
    if (probeResult.score > -Infinity) {
      aimHFrac = heWorth ? heBurstHFrac : 0.5;
      aimLatFrac = heWorth ? heBurstLatFrac : 0;
      cachedPenRatio = probeResult.ratio;
      probeMiss = false;
      return;
    }
    aimHFrac = 0.82;
    cachedPenRatio = 0;
    probeMiss = true;
  }

  function applyFixtureProbe(): void {
    aimHFrac = 0.48;
    aimLatFrac = 0;
    chosenSlot = firstAvailableSlot();
    cachedPenRatio = 1;
    penGateOk = chosenSlot >= 0;
    heWorth = false;
  }

  function runProbes(): void {
    if (!target) return;
    const armor = target.spec.armor;
    if (!armor) {
      applyFixtureProbe();
      return;
    }
    const source = entity.state.pos;
    const targetPosition = target.state.pos;
    let lateralX = targetPosition.z - source.z;
    let lateralZ = -(targetPosition.x - source.x);
    const lateralLength = Math.hypot(lateralX, lateralZ) || 1;
    lateralX /= lateralLength;
    lateralZ /= lateralLength;
    const pose = tankPoseFromState(target.state);
    resetProbeResult();
    probeVisible.fill(0);
    heBurstBest = 0;
    heBurstHFrac = 0.5;
    heBurstLatFrac = 0;
    const distance = currentTargetDistance();
    let readyWeapon = false;
    for (let slot = 0; slot < spec.gun.shells.length; slot++) {
      if (slotHasAmmo(slot) && slotReloadS(slot) <= 1e-3) { readyWeapon = true; break; }
    }
    for (let slot = 0; slot < spec.gun.shells.length; slot++) {
      const shell = spec.gun.shells[slot];
      if (!shell || !slotHasAmmo(slot) || (readyWeapon && slotReloadS(slot) > 1e-3)) continue;
      evaluateProbeSlot(slot, shell, pose, armor, lateralX, lateralZ);
      if (probeResult.ratio >= Math.max(1.05, penGateRatio(distance)) && probeResult.slot === 0) break;
    }
    applyProbeResult(distance);
  }

  /**
   * Search the retreat ray (away from the target) for a crest position.
   * `full=false` → hull-down: hull covered, turret retains LOS.
   * `full=true`  → complete cover for reloading.
   * @returns {boolean} true if `out` was filled
   */
  function findCrest(out: Position2, full: boolean): boolean {
    if (!target) return false;
    const st = entity.state;
    const tp = target.state.pos;
    let ax = st.pos.x - tp.x, az = st.pos.z - tp.z;
    const al = Math.hypot(ax, az) || 1;
    ax /= al; az /= al;
    return findCrestAlong(ax, az, tp.x, eyeY(target), tp.z, out, full);
  }

  /**
   * Crest search along a unit retreat direction (ax, az) with the threat's eye
   * at (lookX, lookY, lookZ): the reaction picker uses it for unseen shooters
   * (a bearing, no target) and for the reverse-to-cover pullback.
   */
  function findCrestAlong(
    ax: number,
    az: number,
    lookX: number,
    lookY: number,
    lookZ: number,
    out: Position2,
    full: boolean,
  ): boolean {
    const st = entity.state;
    const hSelf = spec.dims.heightM;
    for (let d = 3; d <= 27; d += 3) {
      const cx = st.pos.x + ax * d;
      const cz = st.pos.z + az * d;
      const hC = hf.getHeightAt(cx, cz);
      const h1 = hf.getHeightAt(cx - ax * 5, cz - az * 5);
      const h2 = hf.getHeightAt(cx - ax * 10, cz - az * 10);
      const crest = Math.max(h1, h2) - hC;
      if (full) {
        if (crest > hSelf * 0.9 + 0.3) { out.x = cx; out.z = cz; return true; }
      } else if (crest > hSelf * 0.45 && crest < hSelf * 0.95) {
        if (hasLos(cx, hC + selfEyeM, cz, lookX, lookY, lookZ)) {
          out.x = cx; out.z = cz; return true;
        }
      }
    }
    return false;
  }

  /**
   * Find a position with a clear sightline to lastSeen: candidates on two
   * rings around the contact point, nearest-to-self first. Writes `vantage`.
   * @returns {boolean} true when a sightline position was found
   */
  function scanVantageRing(
    centerX: number,
    centerZ: number,
    radius: number,
    baseAngle: number,
    firstIndex: number,
    count: number,
    angleStep: number,
    targetY: number,
  ): boolean {
    const st = entity.state;
    let bestDistanceSq = Infinity;
    let found = false;
    for (let offset = 0; offset < count; offset++) {
      const angle = baseAngle + (firstIndex + offset) * angleStep;
      const candidateX = centerX + Math.sin(angle) * radius;
      const candidateZ = centerZ + Math.cos(angle) * radius;
      if (vantageVetoed(candidateX, candidateZ)) continue;
      if (!reachableSpot(candidateX, candidateZ)) continue; // round 48 pacing: a vantage the hull can hold
      const candidateY = hf.getHeightAt(candidateX, candidateZ) + selfEyeM;
      if (!hasLos(
        candidateX, candidateY, candidateZ,
        lastSeen.x, targetY, lastSeen.z,
      )) continue;
      const dx = candidateX - st.pos.x;
      const dz = candidateZ - st.pos.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= bestDistanceSq) continue;
      bestDistanceSq = distanceSq;
      vantage.x = candidateX;
      vantage.z = candidateZ;
      found = true;
    }
    return found;
  }

  function findVantage(): boolean {
    const st = entity.state;
    const targetY = hf.getHeightAt(lastSeen.x, lastSeen.z) + 1.5;
    const bearing = Math.atan2(lastSeen.x - st.pos.x, lastSeen.z - st.pos.z) +
      vantageBias;
    const nearRings = losBlockedT > 10 ? VANTAGE_WIDE_RINGS_M : VANTAGE_NEAR_RINGS_M;
    for (let i = 0; i < nearRings.length; i++) {
      if (scanVantageRing(
        st.pos.x, st.pos.z, nearRings[i], bearing, -3, 7, 0.35, targetY,
      )) return true;
    }
    const startAngle = rng() * TAU;
    for (let i = 0; i < VANTAGE_CONTACT_RINGS_M.length; i++) {
      if (scanVantageRing(
        lastSeen.x, lastSeen.z, VANTAGE_CONTACT_RINGS_M[i],
        startAngle, 0, 8, TAU / 8, targetY,
      )) return true;
    }
    return false;
  }

  function startFlank(timeS: number, forcedSide = 0): void {
    if (!target || !isVisibleToTeam(target)) return;
    const st = entity.state;
    const tp = target.state.pos;
    const dx = st.pos.x - tp.x, dz = st.pos.z - tp.z;
    const dist = Math.hypot(dx, dz) || 1;
    const baseAng = Math.atan2(dx, dz);            // bearing target → self
    let preferred = rng() < 0.5 ? 1 : -1;
    // Round 60: a hull already off the nose prefers the side whose first ring point lies further round toward the
    // rear (the symmetric front case keeps the random side; the RNG draw above stays for stream stability).
    const aspectPlus = Math.abs(wrapAngle(baseAng + 0.6 - target.state.yaw));
    const aspectMinus = Math.abs(wrapAngle(baseAng - 0.6 - target.state.yaw));
    if (Math.abs(aspectPlus - aspectMinus) > 0.2) preferred = aspectPlus > aspectMinus ? 1 : -1;
    // a commander's flank order names the side (+1 = the bot's left while it faces the target)
    if (forcedSide) preferred = forcedSide;
    // Round 48 pacing (2026-09-24): a flank ring drawn blind put Frosthollow's third point past the border
    // wall (z −525) and the other side's points on the west ridge's flank; the bot drove at them for three
    // 20 s windows and never changed the target's aspect. Score both sides by how many of the three points
    // lie inside the arena on ground the hull can hold and reach (reachableSpot), shrink the ring before
    // giving a side up, and keep the random side when the scores tie.
    let bestSide = preferred;
    let bestR = clamp(dist, 80, 200);
    let bestScore = -1;
    for (let s = 0; s < 2 && bestScore < 3; s++) {
      const side = s === 0 ? preferred : -preferred;
      const radii = [clamp(dist, 80, 200), clamp(dist * 0.7, 80, 200), 80];
      for (let k = 0; k < radii.length && bestScore < 3; k++) {
        let score = 0;
        for (let i = 0; i < 3; i++) {
          const a = baseAng + side * (0.6 + 0.6 * i);
          const x = tp.x + Math.sin(a) * radii[k];
          const z = tp.z + Math.cos(a) * radii[k];
          if (Math.max(Math.abs(x), Math.abs(z)) <= 470 && reachableSpot(x, z)) score++;
        }
        if (score > bestScore) { bestScore = score; bestSide = side; bestR = radii[k]; }
      }
    }
    for (let i = 0; i < 3; i++) {
      const a = baseAng + bestSide * (0.6 + 0.6 * i);  // 34°, 69°, 103° around the target
      flankPoints[i].x = clamp(tp.x + Math.sin(a) * bestR, -470, 470);
      flankPoints[i].z = clamp(tp.z + Math.cos(a) * bestR, -470, 470);
    }
    flankIndex = 0;
    flankUntilS = timeS + FLANK_TIMEOUT_S;
    mode = 'flank';
  }

  /** Aspect angle between the target's nose and the bearing target→self. */
  function aspectAngle(): number {
    if (!target) return 0;
    const st = entity.state;
    const tp = target.state.pos;
    const bearing = Math.atan2(st.pos.x - tp.x, st.pos.z - tp.z);
    return Math.abs(wrapAngle(bearing - target.state.yaw));
  }

  // ---- driving -------------------------------------------------------------

  /** Steer toward the first blocking obstacle's clear side; damp throttle. */
  function avoidObstacles(input: AiInput): void {
    const st = entity.state;
    const look = 6 + Math.abs(st.speed) * 1.5;
    const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
    const px = st.pos.x + fx * look;
    const pz = st.pos.z + fz * look;
    const margin = spec.dims.widthM * 0.5 + 1.2;
    const candidates = deps.queryObstacles
      ? deps.queryObstacles(px - margin, pz - margin, px + margin, pz + margin, nearbyObstacles)
      : obstacles;
    for (let i = 0; i < candidates.length; i++) {
      const o = candidates[i];
      if (o.crushed || o.kind === 'bridge') continue; // decks are road; edge safety owns parapets
      // gameplay_feel r6: felled crushables don't block
      if (!collisionFootprintContainsPoint(o as CollisionRecord, px, pz, margin)) continue;
      // BATTLE-AI r7: a CRUSHABLE in the lane is driven THROUGH, not around —
      // and with authority. The old ×0.6 damping (and the ease-in) parked
      // bots at 0.4 throttle against saplings forever, just under the
      // held-press crush threshold (coastal trace: spawn-exit wedge, 30 s at
      // spd 0). WoT hulls flatten small trees on the move.
      if (o.crushable) {
        if (input.throttle > 0.05) input.throttle = Math.max(input.throttle, 0.7);
        continue;
      }
      const cx = (o.min[0] + o.max[0]) * 0.5 - st.pos.x;
      const cz = (o.min[2] + o.max[2]) * 0.5 - st.pos.z;
      const crossY = fz * cx - fx * cz;          // >0 → obstacle to the right
      input.steer = clamp(input.steer - Math.sign(crossY || 1) * 1.0, -1, 1);
      input.throttle *= 0.6;
      return;
    }
  }

  /**
   * Formation separation with deterministic right-of-way. It predicts
   * crossing traffic, gives a following tank responsibility for the gap,
   * makes one tank yield in head-on/crossing deadlocks, and performs a short
   * reverse escape only after both hulls have settled. The final guard runs
   * after stuck recovery so an unstick burst can never drive through an ally.
   */
  const allyRisk: AllyAvoidanceRisk = {
    ally: null,
    friends: [],
    along: 0,
    cross: 0,
    distance: Infinity,
    longSafe: 0,
    headingDot: 1,
    predictedCross: 0,
    inLane: false,
    ownRadius: 0,
    ownHalfWidth: 0,
    speed: 0,
    stoppingDistance: 0,
    motionSign: 1,
  };

  function decayAllyAvoidance(dt: number): void {
    allyYieldT = Math.max(0, allyYieldT - dt * 2);
    allyDeadlockT = Math.max(0, allyDeadlockT - dt * 2);
    allyEmergencyActive = false;
  }

  function considerAllyRisk(
    ally: AiEntity,
    fx: number,
    fz: number,
    look: number,
    ownHalfLength: number,
    bestScore: number,
  ): number {
    const st = entity.state;
    const rx = ally.state.pos.x - st.pos.x;
    const rz = ally.state.pos.z - st.pos.z;
    const distance = Math.hypot(rx, rz);
    if (distance >= look) return bestScore;
    const along = rx * fx + rz * fz;
    const cross = fz * rx - fx * rz;
    const allyFx = Math.sin(ally.state.yaw);
    const allyFz = Math.cos(ally.state.yaw);
    const allyMotionSign = (ally.state.speed || 0) < -0.2 ? -1 : 1;
    const headingDot = fx * allyFx * allyMotionSign + fz * allyFz * allyMotionSign;
    const rvx = allyFx * (ally.state.speed || 0) - Math.sin(st.yaw) * (st.speed || 0);
    const rvz = allyFz * (ally.state.speed || 0) - Math.cos(st.yaw) * (st.speed || 0);
    const relativeSpeedSq = rvx * rvx + rvz * rvz;
    const closestT = relativeSpeedSq > 0.01
      ? clamp(-(rx * rvx + rz * rvz) / relativeSpeedSq, 0, FRIENDLY_SEPARATION_PREDICT_S)
      : 0;
    const predictedX = rx + rvx * closestT;
    const predictedZ = rz + rvz * closestT;
    const predictedAlong = predictedX * fx + predictedZ * fz;
    const predictedCross = fz * predictedX - fx * predictedZ;
    const allyHalfLength = (ally.spec.dims.hullLengthM || ally.spec.dims.lengthM || 6) * 0.5;
    const allyHalfWidth = (ally.spec.dims.widthM || 3) * 0.5;
    const longSafe = ownHalfLength + allyHalfLength + 2.2;
    const laneSafe = allyRisk.ownHalfWidth + allyHalfWidth + 1.6;
    const radialSafe = allyRisk.ownRadius + tankSafetyRadius(ally) * 0.74 + 1.4;
    const aheadRisk = along > -1 && along < look && Math.abs(cross) < laneSafe;
    const crossingRisk = closestT > 0 && predictedAlong > -longSafe &&
      Math.hypot(predictedX, predictedZ) < radialSafe;
    if (!aheadRisk && !crossingRisk) return bestScore;
    const score = Math.min(
      aheadRisk ? Math.max(0, along) : Infinity,
      crossingRisk ? Math.hypot(predictedX, predictedZ) + closestT * 2 : Infinity,
    );
    if (score >= bestScore) return bestScore;
    allyRisk.ally = ally;
    allyRisk.along = along;
    allyRisk.cross = cross;
    allyRisk.distance = distance;
    allyRisk.longSafe = longSafe;
    allyRisk.headingDot = headingDot;
    allyRisk.predictedCross = predictedCross;
    allyRisk.inLane = aheadRisk;
    return score;
  }

  function scanAllyRisk(input: AiInput): boolean {
    if (!getAllies) return false;
    const st = entity.state;
    // Braking/reversing input does not instantly reverse a moving hull.
    allyRisk.motionSign = Math.abs(st.speed) > 0.5
      ? Math.sign(st.speed) : input.throttle >= 0 ? 1 : -1;
    const forwardX = Math.sin(st.yaw) * allyRisk.motionSign;
    const forwardZ = Math.cos(st.yaw) * allyRisk.motionSign;
    allyRisk.speed = Math.abs(st.speed || 0);
    allyRisk.stoppingDistance = allyRisk.speed * allyRisk.speed /
      (2 * FRIENDLY_STOP_DECEL_MPS2);
    const look = FRIENDLY_SEPARATION_LOOK_M + allyRisk.stoppingDistance +
      allyRisk.speed * 0.8;
    allyRisk.friends = getAllies();
    allyRisk.ownRadius = tankSafetyRadius(entity) * 0.74;
    const ownHalfLength = (spec.dims.hullLengthM || spec.dims.lengthM || 6) * 0.5;
    allyRisk.ownHalfWidth = (spec.dims.widthM || 3) * 0.5;
    allyRisk.ally = null;
    let bestScore = Infinity;
    for (let i = 0; i < allyRisk.friends.length; i++) {
      const ally = allyRisk.friends[i];
      if (!ally || ally === entity || !ally.state || ally.modeActive === false ||
          (ally.combat && ally.combat.destroyed)) continue;
      bestScore = considerAllyRisk(
        ally, forwardX, forwardZ, look, ownHalfLength, bestScore,
      );
    }
    return allyRisk.ally !== null;
  }

  /** The committed passing path is going round this ally, and the ally is still stopped. */
  function passingStoppedAlly(best: AiEntity): boolean {
    return nowS < trafficDetourUntilS && best.id === trafficDetourAllyId && Math.abs(best.state.speed || 0) <= 1;
  }

  function applyAllySteering(input: AiInput): boolean {
    const best = allyRisk.ally;
    if (!best) return false;
    allyAvoidingId = best.id;
    allyClosestM = allyRisk.distance;
    const following = allyRisk.headingDot > 0.55 && allyRisk.along > 0;
    const headOn = allyRisk.headingDot < -0.25;
    // Human drivers cannot participate in our deterministic bot ID handshake.
    const hasPriority = !best.isPlayer && String(entity.id) < String(best.id);
    const mustYield = following || !hasPriority;
    allyYielding = mustYield;
    // The committed passing path already steers round this ally. An evasive nudge on top of it cancelled the
    // detour's pivot (Cinder Junction 7v7 seed 72839: the detour's -1 plus the head-on +1 left the hull at 0 for
    // 239 s behind the idle host). The speed cap and the emergency stop still apply to it and to everyone else.
    if (passingStoppedAlly(best)) return mustYield;
    const side = headOn ? 1 : Math.sign(
      (Math.abs(allyRisk.predictedCross) > 0.2
        ? -allyRisk.predictedCross : -allyRisk.cross) ||
      (hasPriority ? -1 : 1));
    input.steer = clamp(input.steer + side * (headOn ? 1.0 : 0.9), -1, 1);
    return mustYield;
  }

  function aftCorridorClear(): boolean {
    const st = entity.state;
    const backX = -Math.sin(st.yaw);
    const backZ = -Math.cos(st.yaw);
    for (let i = 0; i < allyRisk.friends.length; i++) {
      const other = allyRisk.friends[i];
      if (!other || other === entity || !other.state || other.modeActive === false ||
          (other.combat && other.combat.destroyed)) continue;
      const relativeX = other.state.pos.x - st.pos.x;
      const relativeZ = other.state.pos.z - st.pos.z;
      const along = relativeX * backX + relativeZ * backZ;
      const cross = backZ * relativeX - backX * relativeZ;
      if (along > 0 && along < 10 && Math.abs(cross) < allyRisk.ownHalfWidth + 2.4) {
        return false;
      }
    }
    return !findBlockingObstacle(st.pos.x, st.pos.z, backX, backZ, 8,
      (spec.dims.widthM || 3) * 0.5 + 1) &&
      terrainSafety.corridorSafe(entity, st.yaw, -8) &&
      (!liquidSafe || liquidSafe(st.pos.x, st.pos.z, st.yaw, -8));
  }

  /**
   * Too close to turn in place: a pivot sweeps the hull's corners round its centre, so the gap must hold both
   * hulls' half-diagonals. Inside it the reverse escape, not a pivot onto a passing path, opens the gap.
   */
  function allyTooCloseToPivot(best: AiEntity): boolean {
    const own = spec.dims, other = best.spec.dims;
    const ownHalfDiagonal = Math.hypot((own.hullLengthM || own.lengthM || 6) * 0.5, (own.widthM || 3) * 0.5);
    const allyHalfDiagonal = Math.hypot((other.hullLengthM || other.lengthM || 6) * 0.5, (other.widthM || 3) * 0.5);
    const gap = Math.hypot(best.state.pos.x - entity.state.pos.x, best.state.pos.z - entity.state.pos.z);
    return gap < ownHalfDiagonal + allyHalfDiagonal + 0.5;
  }

  function resolveAllyEmergency(input: AiInput, dt: number, mustYield: boolean, timeS: number): boolean {
    const best = allyRisk.ally;
    if (!best) return false;
    const longitudinalGap = allyRisk.along - allyRisk.longSafe;
    // The nose-to-nose gap is a lane rule: a hull that will pass beside this one (a crossing risk outside the
    // lane) keeps the radial guard and the speed cap, but an along-gap stop on it froze both hulls of a
    // side-by-side pass in a stop-and-go loop (each stop ends the predicted crossing, each restart re-arms it).
    const emergency = allyRisk.distance < allyRisk.ownRadius +
      tankSafetyRadius(best) * 0.74 + 0.55 ||
      (allyRisk.inLane && allyRisk.along > 0 && longitudinalGap < 0.8);
    if (!emergency) return false;
    if (!allyEmergencyActive) allyEmergencyStops++;
    allyEmergencyActive = true;
    input.throttle = 0;
    input.brake = allyRisk.speed > 0.45;
    allyDeadlockT += allyRisk.speed < 0.7 ? dt : 0;
    // a committed passing path round this ally turns the hull in place here: no reverse escape out of it
    // while there is room to turn
    const passing = passingStoppedAlly(best) && !allyTooCloseToPivot(best);
    if (mustYield && !passing && allyDeadlockT > 0.9 && allyRisk.speed < 0.45 &&
        aftCorridorClear()) {
      // A one-frame reverse impulse was immediately overwritten by the
      // waypoint driver. Commit briefly, but recheck the rear every tick.
      allyEscapeUntilS = timeS + 1.25;
      allyEscapeSteer = -Math.sign(input.steer || 1);
      input.throttle = -0.42;
      input.steer = allyEscapeSteer;
      input.brake = false;
      allyReverseEscapes++;
      allyDeadlockT = 0;
    }
    return true;
  }

  function applyAllySpeedCap(input: AiInput, mustYield: boolean): void {
    const best = allyRisk.ally;
    if (!best) return;
    allyEmergencyActive = false;
    const stopBuffer = allyRisk.stoppingDistance + allyRisk.longSafe;
    let cap = allyRisk.along < stopBuffer ? 0.1
      : allyRisk.along < stopBuffer + 8 ? 0.32 : 0.58;
    if (!mustYield) cap = Math.max(cap, 0.38);
    if (mustYield && allyRisk.along > 0 && allyRisk.along < stopBuffer &&
        allyRisk.speed > 1.5) {
      input.throttle = 0;
      input.brake = true;
      return;
    }
    const closing = Math.max(0, allyRisk.speed -
      Math.max(0, Math.abs(best.state.speed || 0) * allyRisk.headingDot));
    if (allyRisk.motionSign > 0) {
      input.throttle = Math.min(input.throttle, Math.max(0.06, cap - closing * 0.035));
      return;
    }
    input.throttle = Math.max(input.throttle, -Math.max(0.08, cap * 0.7));
  }

  function trafficLegSafe(x: number, z: number, tx: number, tz: number): boolean {
    const distance = Math.hypot(tx - x, tz - z);
    const yaw = Math.atan2(tx - x, tz - z);
    return !findBlockingObstacle(x, z, Math.sin(yaw), Math.cos(yaw), distance,
      (spec.dims.widthM || 3) * .5 + 1) &&
      Number.isFinite(terrainLineCost(x, z, terrainSafety.surfaceY(x, z), Math.sin(yaw), Math.cos(yaw))) &&
      (!liquidSafe || liquidSafe(x, z, yaw, distance));
  }

  /**
   * The committed passing path round a stopped ally: a leg sideways off the line to it, then a leg past it, both
   * checked against solid cover, terrain and water. It starts once the bot has yielded to the ally for 1.25 s or
   * has stood in the emergency gap behind it, with room to turn, for half the reverse escape's dwell: for a parked
   * hull the passing path, not a reverse escape that re-approaches the same hull, is the answer. The legs lie on
   * the line from the bot to the ally, so a hull an escape left angled off that line still passes beside the ally.
   * `wide` (the bounded yield's give-way, see updateAllyHold) tries the wider lanes of TRAFFIC_DETOUR_WIDE_EXTRA_M.
   */
  function startTrafficDetour(timeS: number, wide = false): boolean {
    const best = allyRisk.ally;
    if (!best || Math.abs(best.state.speed) > 1 || allyRisk.speed > 3) return false;
    if (!wide && allyYieldT < 1.25 &&
        (!allyYielding || allyDeadlockT < 0.45 || allyTooCloseToPivot(best))) return false;
    const st = entity.state;
    let ux = best.state.pos.x - st.pos.x, uz = best.state.pos.z - st.pos.z;
    const gap = Math.hypot(ux, uz) || 1;
    ux /= gap; uz /= gap;
    const base = (spec.dims.widthM + best.spec.dims.widthM) * .5 + 5;
    const preferred = Math.sign(-allyRisk.cross || 1);
    const lanes = wide ? TRAFFIC_DETOUR_WIDE_EXTRA_M.length : 1;
    for (let lane = 0; lane < lanes; lane++) {
      const width = base + (wide ? TRAFFIC_DETOUR_WIDE_EXTRA_M[lane] : 0);
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? preferred : -preferred;
        const nx = st.pos.x + uz * width * side, nz = st.pos.z - ux * width * side;
        const advance = gap + allyRisk.longSafe + 6;
        const tx = nx + ux * advance, tz = nz + uz * advance;
        if (!trafficLegSafe(st.pos.x, st.pos.z, nx, nz) || !trafficLegSafe(nx, nz, tx, tz)) continue;
        trafficNear.x = nx; trafficNear.z = nz;
        trafficFar.x = tx; trafficFar.z = tz;
        trafficDetourStage = 0;
        trafficDetourUntilS = timeS + 24;
        trafficDetourAllyId = best.id;
        allyEscapeUntilS = -1;
        return true;
      }
    }
    return false;
  }

  function driveTrafficDetour(input: AiInput, timeS: number): void {
    if (timeS >= trafficDetourUntilS) return;
    const st = entity.state;
    let point = trafficDetourStage === 0 ? trafficNear : trafficFar;
    if (Math.hypot(point.x - st.pos.x, point.z - st.pos.z) < 2) {
      if (trafficDetourStage === 1) { trafficDetourUntilS = -1; return; }
      trafficDetourStage = 1;
      point = trafficFar;
    }
    const error = wrapAngle(Math.atan2(point.x - st.pos.x, point.z - st.pos.z) - st.yaw);
    input.steer = clamp(error * 2.2, -1, 1);
    input.throttle = Math.abs(error) < .45 ? .65 : 0;
    input.brake = Math.abs(error) >= .45 && Math.abs(st.speed) > .5;
    // the pivot onto a leg turns the hull in place like faceYaw: only the legs themselves are drive intent, or the
    // low-speed watchdog reads a 2-3 s pivot as a wedge and reverses the hull out of its own passing path
    driveIntent = input.throttle > 0;
  }

  /**
   * The bounded yield. A hold begins on a tick the drive wants to move but yields to a parked ally (a reverse
   * escape from one counts) and its clock runs until the hull is ALLY_HOLD_CLEAR_M from where it began or nothing
   * has held it for ALLY_HOLD_FORGET_S, so an escape that backs off and re-approaches the same hull stays one
   * hold. At ALLY_HOLD_LIMIT_S the yield gives way: the passing path and the escape in hand are dropped for a
   * passing path on a wider lane (backing straight off first when the hulls are too close to turn), and with
   * none safe the shared stuck escalation takes over, its side flipped away from the parked hull and the reverse
   * burst swinging the bow that way. Each further hold is another strike, so a lane the parked hull closes ends
   * in the pocket escape and the search's next goal.
   */
  function updateAllyHold(dt: number, timeS: number, held: boolean): void {
    const st = entity.state;
    if (allyHoldT > 0 && (timeS - allyHoldLastS > ALLY_HOLD_FORGET_S ||
        Math.hypot(st.pos.x - allyHoldAnchor.x, st.pos.z - allyHoldAnchor.z) > ALLY_HOLD_CLEAR_M)) allyHoldT = 0;
    const holding = held && driveIntent;
    if (holding) {
      if (allyHoldT === 0) {
        allyHoldAnchor.x = st.pos.x;
        allyHoldAnchor.z = st.pos.z;
      }
      allyHoldLastS = timeS;
    } else if (allyHoldT === 0) {
      return;
    }
    allyHoldT += dt;
    if (allyHoldT < ALLY_HOLD_LIMIT_S || !holding) return;
    allyHoldT = 0;
    allyHoldGiveWays++;
    allyYieldT = 0;
    trafficDetourUntilS = -1;
    allyEscapeUntilS = -1;
    const parked = allyRisk.ally;
    if (parked && startTrafficDetour(timeS, true)) {
      if (allyTooCloseToPivot(parked)) {
        unstickUntilS = timeS + UNSTICK_TIME_S;
        unstickSteer = 0;
      }
      return;
    }
    // no wider lane either: escalateStuckRecovery flips detourSide, so leave it on the side away from the hull
    detourSide = Math.sign(allyRisk.cross) || detourSide;
    escalateStuckRecovery(timeS, false);
    unstickUntilS = timeS + UNSTICK_TIME_S;
    unstickSteer = -detourSide; // reversing flips the steer: the bow swings toward the detour side
  }

  function avoidAllies(input: AiInput, dt: number, timeS: number): void {
    if (!entity.state.grounded) return;
    if (timeS < allyEscapeUntilS && getAllies) {
      allyRisk.friends = getAllies();
      updateAllyHold(dt, timeS, true);
      if (timeS < allyEscapeUntilS && aftCorridorClear()) {
        input.throttle = -0.42;
        input.steer = allyEscapeSteer;
        input.brake = false;
        allyYielding = true;
        return;
      }
      allyEscapeUntilS = -1;
      input.throttle = 0;
      input.brake = Math.abs(entity.state.speed) > 0.45;
      return;
    }
    if (!scanAllyRisk(input)) {
      decayAllyAvoidance(dt);
      updateAllyHold(dt, timeS, false);
      return;
    }
    const mustYield = applyAllySteering(input);
    if (mustYield) allyYieldT += dt;
    else allyYieldT = Math.max(0, allyYieldT - dt);
    updateAllyHold(dt, timeS, mustYield && Math.abs(allyRisk.ally!.state.speed || 0) < ALLY_PARKED_MPS);
    if (timeS >= trafficDetourUntilS) startTrafficDetour(timeS);
    if (resolveAllyEmergency(input, dt, mustYield, timeS)) return;
    allyDeadlockT = Math.max(0, allyDeadlockT - dt * 2);
    applyAllySpeedCap(input, mustYield);
  }

  // BATTLE-AI r7 CORNER-HOP ROUTER: reactive avoidance + unstick could not
  // navigate the urban block grid — the r7 flow probe measured BOTH teams
  // wedged against building faces for 30-90 s (losBlockedT 45 s, strikes
  // cycling, ~1 m/10 s displacement) because every drive helper steered at a
  // goal BEHIND a 60 m rect it could only graze along. When the straight
  // segment to the goal crosses a solid obstacle AABB within ROUTE_LOOK_M,
  // steer for the cheapest expanded-box corner first (one hop; the recheck
  // cadence chains hops around consecutive blocks). Crushables are ignored —
  // hulls drive through those. Plans are cached ROUTE_RECHECK_S so the cost
  // is a few hundred slab tests per bot every ~0.6 s, not per tick.
  const ROUTE_RECHECK_S = 0.6;
  const ROUTE_LOOK_M = 85;
  const routeCorner = { x: 0, z: 0 };
  const routeCandidates: Position2[] = [
    { x: 0, z: 0 },
    { x: 0, z: 0 },
    { x: 0, z: 0 },
    { x: 0, z: 0 },
  ];
  let routeActive = false;
  let routeTimer = 0;
  let routeGoalX = 1e9;
  let routeGoalZ = 1e9;
  // Corner hold (bots lane, 2026-10-03; Coastal pacing seed 25003 on the physics lane's tree): a T-90M Proryv pressed
  // against a boulder's north-west corner re-chose its corner at every recheck, and each choice undid the last.
  // Pressed to the rock, the north-east corner's lane ran inside the rock's margin, so it turned for the north-west
  // one; the turn swung its centre 0.36 m off the rock, the north-east lane cleared and its score won it back. It
  // jinked every 0.6 s and never left the rock. A recheck that would take back the corner the hull gave up less than
  // ROUTE_CORNER_FLIP_S ago is a flip: the hull keeps its current corner instead, while that corner's lane stays clear
  // and the destination stays put, for ROUTE_CORNER_SETTLE_S; a reached corner hands over to the next as before, and a
  // stuck strike drops the plan. Only a flip is held: a hold on every new corner (or on every corner the hull pivoted
  // toward) reshuffled the routes of every battle and added two sub-120 s battlePacing matches.
  const ROUTE_CORNER_FLIP_S = 2;
  const ROUTE_CORNER_SETTLE_S = 6;
  const routeCornerGivenUp = { x: NaN, z: NaN, atS: -Infinity }; // the corner the last switch left
  let routeCornerSettledUntilS = -Infinity;  // a flip was refused: the current corner is kept until then
  let routeCornerFlips = 0;                  // probe-visible count of refused flips
  let terrainRouteUntilS = -1;
  // a corner just reached is vetoed briefly so the replan hops to the NEXT
  // corner along the box instead of re-offering the same cell (the crawl
  // loop the autumn rock-cluster trace measured)
  const lastCorner = { x: 1e9, z: 1e9, untilS: -1 };
  function terrainLineCost(
    sx: number,
    sz: number,
    startH: number,
    ux: number,
    uz: number,
  ): number {
    if (liquidSafe && !liquidSafe(sx,sz,Math.atan2(ux,uz),TERRAIN_ROUTE_LOOK_M)) return Infinity;
    let previousH = startH;
    let worstCost = 1;
    const debuff = entity.state._debuff;
    const powerMult = debuff?.powerMult ?? 1;
    const accelMult = debuff?.accelMult ?? 1;
    for (let distance = TERRAIN_ROUTE_STEP_M;
      distance <= TERRAIN_ROUTE_LOOK_M; distance += TERRAIN_ROUTE_STEP_M) {
      const x = sx + ux * distance;
      const z = sz + uz * distance;
      const height = terrainSafety.surfaceY(x, z);
      const rise = (height - previousH) / TERRAIN_ROUTE_STEP_M;
      const ground = driveGroundTypeAt(hf, x, z);
      const cost = terrainTravelCostFactor(
        spec, ground, rise, powerMult, accelMult,
      );
      if (!Number.isFinite(cost)) return Infinity;
      if (cost > worstCost) worstCost = cost;
      previousH = height;
    }
    return worstCost;
  }

  function planTerrainRoute(
    sx: number,
    sz: number,
    dirx: number,
    dirz: number,
    goalX: number,
    goalZ: number,
  ): boolean {
    const startH = terrainSafety.surfaceY(sx, sz);
    if (Number.isFinite(terrainLineCost(sx, sz, startH, dirx, dirz))) {
      return false;
    }

    let bestScore = Infinity;
    let bestX = 0;
    let bestZ = 0;
    for (let index = 0; index < TERRAIN_ROUTE_FAN_RAD.length; index++) {
      const angle = TERRAIN_ROUTE_FAN_RAD[index];
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const ux = dirx * c + dirz * s;
      const uz = -dirx * s + dirz * c;
      if (liquidSafe && findBlockingObstacle(sx,sz,ux,uz,TERRAIN_ROUTE_LOOK_M,spec.dims.widthM*0.5+1.4)) continue;
      const terrainCost = terrainLineCost(sx, sz, startH, ux, uz);
      if (!Number.isFinite(terrainCost)) continue;
      const cx = sx + ux * TERRAIN_ROUTE_LOOK_M;
      const cz = sz + uz * TERRAIN_ROUTE_LOOK_M;
      if (Math.max(Math.abs(cx), Math.abs(cz)) > 480) continue;
      const side = Math.sign(angle) || 1;
      const score = Math.hypot(goalX - cx, goalZ - cz) + (terrainCost - 1) * 7 +
        Math.abs(angle) * 5 + (side === detourSide ? 0 : 8);
      if (score < bestScore) {
        bestScore = score;
        bestX = cx;
        bestZ = cz;
      }
    }
    if (bestScore === Infinity) return false;
    routeCorner.x = bestX;
    routeCorner.z = bestZ;
    routeActive = true;
    return true;
  }

  function findBlockingObstacle(
    sourceX: number,
    sourceZ: number,
    directionX: number,
    directionZ: number,
    limit: number,
    margin: number,
  ): AiObstacle | null {
    let bestT = Infinity;
    let box: AiObstacle | null = null;
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (o.crushed || o.crushable || o.kind === 'bridge') continue;
      const entry = rayCollisionFootprintEntry2(
        o as CollisionRecord,
        sourceX, sourceZ, directionX, directionZ,
        limit, margin,
      );
      if (entry != null && entry < bestT) { bestT = entry; box = o; }
    }
    return box;
  }

  function routeSegmentHitsBox(
    sourceX: number,
    sourceZ: number,
    endX: number,
    endZ: number,
    box: AiObstacle,
    margin: number,
  ): boolean {
      let ddx = endX - sourceX, ddz = endZ - sourceZ;
      const len = Math.hypot(ddx, ddz) || 1e-9;
      ddx /= len; ddz /= len;
      return rayCollisionFootprintEntry2(
        box as CollisionRecord,
        sourceX,
        sourceZ,
        ddx,
        ddz,
        len,
        margin * 0.85,
      ) != null;
  }

  function populateRouteCandidates(box: AiObstacle, clearance: number): void {
    routeCandidates[0].x = box.min[0] - clearance;
    routeCandidates[0].z = box.min[2] - clearance;
    routeCandidates[1].x = box.max[0] + clearance;
    routeCandidates[1].z = box.min[2] - clearance;
    routeCandidates[2].x = box.min[0] - clearance;
    routeCandidates[2].z = box.max[2] + clearance;
    routeCandidates[3].x = box.max[0] + clearance;
    routeCandidates[3].z = box.max[2] + clearance;
  }

  /** A corner's lane from the hull: on the map, not underfoot, dry, not just vetoed, clear of `box` by `margin`. */
  function cornerOpen(
    box: AiObstacle, sourceX: number, sourceZ: number, cx: number, cz: number, margin: number,
  ): boolean {
    if (Math.max(Math.abs(cx), Math.abs(cz)) > 500) return false;
    const d1 = Math.hypot(cx - sourceX, cz - sourceZ);
    if (d1 < 2) return false; // standing on this corner already
    if (liquidSafe && !liquidSafe(sourceX,sourceZ,Math.atan2(cx-sourceX,cz-sourceZ),d1)) return false;
    if (nowS < lastCorner.untilS &&
        Math.hypot(cx - lastCorner.x, cz - lastCorner.z) < 3) return false;
    return !routeSegmentHitsBox(sourceX, sourceZ, cx, cz, box, margin);
  }

  function chooseRouteCorner(
    box: AiObstacle,
    sourceX: number,
    sourceZ: number,
    goalX: number,
    goalZ: number,
    directionX: number,
    directionZ: number,
    margin: number,
  ): boolean {
    populateRouteCandidates(box, margin + 2.8);
    let best = Infinity, bx = 0, bz = 0;
    for (let i = 0; i < routeCandidates.length; i++) {
      const cx = routeCandidates[i].x;
      const cz = routeCandidates[i].z;
      if (!cornerOpen(box, sourceX, sourceZ, cx, cz, margin)) continue;
      const d1 = Math.hypot(cx - sourceX, cz - sourceZ);
      const score = d1 + Math.hypot(goalX - cx, goalZ - cz) +
        cornerBias(sourceX, sourceZ, directionX, directionZ, cx, cz);
      if (score < best) { best = score; bx = cx; bz = cz; }
    }
    if (best === Infinity) return false;
    routeCorner.x = bx;
    routeCorner.z = bz;
    routeActive = true;
    return true;
  }

  function planRoute(gx: number, gz: number): void {
    // the corner the hull is on its way to (see ROUTE_CORNER_FLIP_S)
    const wasActive = routeActive, heldX = routeCorner.x, heldZ = routeCorner.z;
    routeActive = false;
    const st = entity.state;
    const sourceX = st.pos.x;
    const sourceZ = st.pos.z;
    let directionX = gx - sourceX;
    let directionZ = gz - sourceZ;
    const distance = Math.hypot(directionX, directionZ);
    if (distance < 12) return;
    directionX /= distance;
    directionZ /= distance;
    const limit = Math.min(distance, ROUTE_LOOK_M);
    const margin = spec.dims.widthM * 0.5 + 1.4;
    const box = findBlockingObstacle(
      sourceX, sourceZ, directionX, directionZ, limit, margin,
    );
    if (box) {
      const heldOpen = wasActive && cornerOpen(box, sourceX, sourceZ, heldX, heldZ, margin);
      if (heldOpen && nowS < routeCornerSettledUntilS) {
        routeCorner.x = heldX;
        routeCorner.z = heldZ;
        routeActive = true;
        return;
      }
      chooseRouteCorner(
        box, sourceX, sourceZ, gx, gz, directionX, directionZ, margin,
      );
      if (routeActive && wasActive && Math.hypot(routeCorner.x - heldX, routeCorner.z - heldZ) > 1) {
        const takesBack = nowS - routeCornerGivenUp.atS < ROUTE_CORNER_FLIP_S
          && Math.hypot(routeCorner.x - routeCornerGivenUp.x, routeCorner.z - routeCornerGivenUp.z) < 1;
        if (takesBack && heldOpen) {
          // a flip: keep the corner the hull is on its way to
          routeCorner.x = heldX;
          routeCorner.z = heldZ;
          routeCornerSettledUntilS = nowS + ROUTE_CORNER_SETTLE_S;
          routeCornerFlips++;
          return;
        }
        routeCornerGivenUp.x = heldX;
        routeCornerGivenUp.z = heldZ;
        routeCornerGivenUp.atS = nowS;
      }
      if (!liquidSafe || routeActive) return;
    }
    if (liquidSafe || nowS < terrainRouteUntilS) {
      planTerrainRoute(sourceX, sourceZ, directionX, directionZ, gx, gz);
    }
  }
  // r7: corner preference bias — repeated strikes flip detourSide, and the
  // replan then prefers corners on the OTHER flank of the advance line, so
  // consecutive plans try genuinely different ways around a stubborn block.
  function cornerBias(
    sx: number,
    sz: number,
    dirx: number,
    dirz: number,
    cx: number,
    cz: number,
  ): number {
    const side = Math.sign(dirz * (cx - sx) - dirx * (cz - sz)) || 1;
    return side === detourSide ? 0 : 25;
  }

  /**
   * BATTLE-AI r7 POCKET ESCAPE (last-resort nav): five wedge cycles on one
   * leg means the hull sits in a multi-box pocket (rock-outcrop clusters,
   * town courtyards) that per-box corner hops cannot solve. Sample 8
   * bearings for the clearest 30 m escape lane — no solid box on the
   * segment, no sharp terrain rise — and commit to it via the scoot drive
   * for a few seconds before resuming the mission.
   * @returns {boolean} true when an escape leg was committed
   */
  function escapePocket() {
    const st = entity.state;
    const sx = st.pos.x, sz = st.pos.z;
    const margin = spec.dims.widthM * 0.5 + 1.0;
    let bestScore = -Infinity, bx = 0, bz = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + scanPhase;
      const ux = Math.sin(a), uz = Math.cos(a);
      // clear length against solid boxes (crushables are drive-through)
      let clear = 34;
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (o.crushed || o.crushable || o.kind === 'bridge') continue;
        const entry = rayCollisionFootprintEntry2(
          o as CollisionRecord, sx, sz, ux, uz, clear, margin,
        );
        if (entry != null) clear = entry;
      }
      if (clear < 12) continue;
      const ex = sx + ux * clear, ez = sz + uz * clear;
      if (Math.max(Math.abs(ex), Math.abs(ez)) > 470) continue;
      // a lane the final liquid brake would refuse is no escape (a hull already in the liquid keeps the ways out)
      if (liquidSafe && !liquidSafe(sx, sz, a, clear)) continue;
      const h0 = terrainSafety.surfaceY(sx, sz);
      const terrainCost = terrainLineCost(sx, sz, h0, ux, uz);
      if (!Number.isFinite(terrainCost)) continue;
      const score = clear - (terrainCost - 1) * 4 + rng() * 3;
      if (score > bestScore) { bestScore = score; bx = ex; bz = ez; }
    }
    if (bestScore === -Infinity) return false;
    scootPoint.x = bx;
    scootPoint.z = bz;
    scootUntilS = nowS + 6;
    scootLine = 0;
    routeTimer = 0;
    return true;
  }

  // r6 NAV-PROGRESS WATCHDOG (engagement-starvation root cause): the r7
  // displacement-EMA stuck test is blind to two wedge modes measured in the
  // r6 probe — (a) obstacle ORBITING, where pivot->drive->avoid->pivot cycles
  // around a spawn prop cluster produce 1-2 m/s of continuous displacement
  // (the flanker danced 115 s at its spawn, obs=3, yaw churning end to end),
  // and (b) damped-throttle GRINDS, where avoidObstacles' x0.6 and the
  // arrival ease-in push throttle under the old |throttle|>0.25 arming term
  // so exactly the bots pressing against props never armed the stuck timer.
  // Track progress toward the CURRENT drive goal instead: driveIntent marks
  // every tick a drive helper actually wants motion (any throttle), and
  // navNoProgressT accumulates while the goal distance refuses to shrink.
  let navGoalX = 1e9;
  let navGoalZ = 1e9;
  let navBestD = Infinity;
  let navNoProgressT = 0;
  let driveIntent = false;
  function trackNavProgress(x: number, z: number, dist: number): void {
    driveIntent = true;
    if (Math.abs(x - navGoalX) > 15 || Math.abs(z - navGoalZ) > 15) {
      navGoalX = x; navGoalZ = z;   // new leg — fresh baseline
      navBestD = dist;
      navNoProgressT = 0;
    } else if (dist < navBestD - 1.5) {
      navBestD = dist;              // genuine approach — reset the clock
      navNoProgressT = 0;
    }
  }

  /**
   * Drive toward (x,z). Returns true when within ARRIVE_DIST_M.
   * Steering = signed angle to the point; throttle eases off in tight turns.
   */
  let combatRoute: ReadonlyArray<readonly [number, number]> = [];
  let combatRouteIndex = 0, combatRouteAtS = -Infinity;
  let combatGoalX = Infinity, combatGoalZ = Infinity;
  const combatGoal = { x: 0, z: 0 };
  function crossesBridgeTo(x: number, z: number): boolean {
    const st = entity.state;
    for (const deck of hf.bridgeDecks ?? []) {
      const start = (st.pos.x - deck.x) * deck.ux + (st.pos.z - deck.z) * deck.uz;
      const end = (x - deck.x) * deck.ux + (z - deck.z) * deck.uz;
      if (Math.abs(start - end) > 25 && Math.min(start, end) < deck.halfLength &&
          Math.max(start, end) > -deck.halfLength) return true;
    }
    return false;
  }

  function combatBridgeWaypoint(x: number, z: number): readonly [number, number] | null {
    const planner = deps.planRoute;
    if (!planner) return null;
    const st = entity.state;
    if (nowS - combatRouteAtS > 4 || Math.hypot(x - combatGoalX, z - combatGoalZ) > 35) {
      combatGoal.x = combatGoalX = x; combatGoal.z = combatGoalZ = z;
      combatRoute = planner(st.pos, combatGoal);
      combatRouteIndex = 0; combatRouteAtS = nowS;
    }
    while (combatRouteIndex < combatRoute.length - 1 &&
        Math.hypot(combatRoute[combatRouteIndex][0] - st.pos.x, combatRoute[combatRouteIndex][1] - st.pos.z) < 7) combatRouteIndex++;
    return combatRoute[combatRouteIndex] ?? null;
  }

  function driveToXZ(input: AiInput, x: number, z: number, speedScale: number): boolean {
    const st = entity.state;
    // Combat chase/flank destinations need the same bridge ingress as mission
    // routes. Local steering alone tried to cross gorge walls at target bearing.
    // When nothing plans from where the hull stands, the local router drives on toward the destination (bots lane,
    // 2026-10-03; Aegis Crossing pacing seed 53001 on the physics lane's plane attitude): the gate used to hold the
    // hull with zero input, a hold with no drive intent, so neither wedge watchdog ever armed, and the no-contact
    // search, which hands exactly this case to the local router, got the same hold back on every leg. A Type 96 that
    // slid into a gorge pocket the grid cannot leave sat at rest for 798 s and the match ended in a draw.
    const crossBridge = !!deps.planRoute && crossesBridgeTo(x, z);
    if (crossBridge) {
      const point = combatBridgeWaypoint(x, z);
      if (point) { x = point[0]; z = point[1]; }
    }
    let dx = x - st.pos.x, dz = z - st.pos.z;
    let dist = Math.hypot(dx, dz);
    if (dist < ARRIVE_DIST_M) {
      // an arrival holds the hull on purpose: no drive intent, or the low-speed watchdog read every hold at a
      // destination as a wedge and reversed the hull off it (a zone holder jiggled on its line every 4-5 s)
      input.throttle = 0;
      input.steer = 0;
      input.brake = Math.abs(st.speed) > 0.5;
      if (crossBridge && combatRouteIndex < combatRoute.length - 1) { combatRouteIndex++; return false; }
      return true;
    }
    trackNavProgress(x, z, dist); // r6 wedge watchdog (see update())
    // r7 CORNER-HOP ROUTER (see planRoute): re-plan when the goal moved or
    // the recheck timer lapsed; while a solid blocker sits on the straight
    // line, the steering goal becomes the corner around it.
    const goalMoved = Math.abs(x - routeGoalX) > 12 || Math.abs(z - routeGoalZ) > 12;
    if (routeTimer <= 0 || goalMoved) {
      if (goalMoved) { // a new destination chooses its corner afresh
        routeCornerSettledUntilS = -Infinity;
        routeCornerGivenUp.atS = -Infinity;
      }
      routeGoalX = x;
      routeGoalZ = z;
      routeTimer = ROUTE_RECHECK_S;
      planRoute(x, z);
    }
    let viaCorner = false;
    if (routeActive) {
      const cdx = routeCorner.x - st.pos.x;
      const cdz = routeCorner.z - st.pos.z;
      if (Math.hypot(cdx, cdz) < 4.5) {
        // corner reached — veto it briefly and replan (next hop or straight)
        lastCorner.x = routeCorner.x;
        lastCorner.z = routeCorner.z;
        lastCorner.untilS = nowS + 4;
        routeActive = false;
        routeTimer = 0;
      } else {
        viaCorner = true;
        x = routeCorner.x;
        z = routeCorner.z;
        dx = cdx;
        dz = cdz;
        dist = Math.hypot(dx, dz);
      }
    } else if (nowS < detourUntilS && dist > 25) {
      // Blocked-route detour (see detourUntilS): steer for a point offset
      // sideways from the real target so the hull clears the blocking face.
      // (Fallback for wedges the router cannot see — tank pile-ups.)
      const px = dz / dist, pz = -dx / dist; // perp of the bearing
      x += px * 55 * detourSide;
      z += pz * 55 * detourSide;
      dx = x - st.pos.x; dz = z - st.pos.z;
      dist = Math.hypot(dx, dz);
    }
    const bearing = Math.atan2(dx, dz);
    const err = wrapAngle(bearing - st.yaw);
    input.steer = clamp(err * 2.2, -1, 1);
    input.brake = false;
    if (Math.abs(err) > 1.2) {
      // r4 PIVOT DEADLOCK FIX: the old near-pivot (0.15 throttle, then
      // avoidObstacles damping it to 0.09 AND counter-steering against the
      // bearing steer every tick) left hulls parked next to spawn props
      // wobbling at spd=0 for 60+ s (unstaged probe traces: thr=0.1, zero
      // rotation, blkT growing forever). A rotating-in-place hull neither
      // needs obstacle avoidance nor moves enough to hit anything — skip
      // it, and give the pivot enough drive to actually break friction.
      input.throttle = 0.3;
      return false;
    }
    input.throttle = clamp(1 - Math.abs(err) * 0.55, 0.25, 1) * speedScale;
    // ease into ARRIVALS only — an intermediate route corner is a waypoint,
    // not a destination (the ease floor made bots crawl corner chains at
    // 0.2 throttle and wedge; r7 autumn trace)
    if (!viaCorner) input.throttle *= clamp(dist / 10, 0.35, 1);
    avoidObstacles(input);
    return false;
  }

  // HEADING COMMITMENT (r3): committed chase point for moving-destination
  // legs. driveToXZ keeps its per-tick steering; only the DESTINATION is
  // frozen for the commit window so the hull holds a near-constant velocity.
  const chasePoint = { x: 0, z: 0 };
  let chaseUntilS = -1;
  function chaseToXZ(input: AiInput, x: number, z: number, speedScale: number): boolean {
    if (nowS >= chaseUntilS ||
        Math.hypot(x - chasePoint.x, z - chasePoint.z) > CHASE_REPICK_DIST_M) {
      chasePoint.x = x;
      chasePoint.z = z;
      chaseUntilS = nowS + CHASE_COMMIT_MIN_S + rng() * CHASE_COMMIT_VAR_S;
    }
    const arrived = driveToXZ(input, chasePoint.x, chasePoint.z, speedScale);
    if (arrived) chaseUntilS = -1; // reached the frozen point — re-pick now
    return arrived;
  }

  /** Pivot in place to face a world yaw. */
  function faceYaw(input: AiInput, wantYaw: number): void {
    const st = entity.state;
    const err = wrapAngle(wantYaw - st.yaw);
    input.steer = Math.abs(err) > 0.06 ? clamp(err * 2.5, -1, 1) : 0;
    input.throttle = 0;
    input.brake = Math.abs(st.speed) > 0.5;
  }

  /**
   * A casemate's leg along its line of fire with the bow on `facing`: back onto (x, z) for a negative throttle, up to
   * it for a positive one. True once within 4 m of the point or once the hull has passed it.
   */
  function driveOnLine(input: AiInput, x: number, z: number, facing: number, throttle: number): boolean {
    const st = entity.state;
    const dx = x - st.pos.x, dz = z - st.pos.z;
    const ahead = dx * Math.sin(facing) + dz * Math.cos(facing);
    if (dx * dx + dz * dz < 16 || ahead * throttle <= 0) return true;
    if (throttle < 0) {
      reverseFacing(input, facing, throttle);
    } else {
      faceYaw(input, facing);
      input.throttle = throttle;
      input.brake = false;
    }
    return false;
  }

  /** True when (x, z) lies behind the hull's line to its target, within 45 degrees of straight back. */
  function behindOnLine(x: number, z: number): boolean {
    const st = entity.state;
    const bearing = targetBearing();
    const dx = x - st.pos.x, dz = z - st.pos.z;
    const length = Math.hypot(dx, dz);
    return length > 1e-3 && -(dx * Math.sin(bearing) + dz * Math.cos(bearing)) / length > Math.SQRT1_2;
  }

  /** The bearing to the target (the hull's own heading without one). */
  function targetBearing(): number {
    const st = entity.state;
    return target && target.state
      ? Math.atan2(target.state.pos.x - st.pos.x, target.state.pos.z - st.pos.z)
      : st.yaw;
  }

  /**
   * BATTLE-AI r7: back up while keeping the BOW on a bearing. movement.ts
   * flips the steering sign while reversing (reversing-car semantics, §
   * "Reverse-steer flip") — plain faceYaw+negative throttle therefore spun
   * hulls AWAY from the target (probe: 800-2700 mrad yaw errors mid-pullback,
   * bots reversing in circles). Compensate the flip once the hull actually
   * rolls backwards.
   */
  function reverseFacing(input: AiInput, wantYaw: number, throttle: number): void {
    const st = entity.state;
    const err = wrapAngle(wantYaw - st.yaw);
    const sign = st.speed < -0.15 ? -1 : 1; // movement.ts reverse-steer flip
    input.steer = Math.abs(err) > 0.06 ? clamp(err * 2.5, -1, 1) * sign : 0;
    input.throttle = throttle;
    input.brake = false;
  }

  function buildAutoPatrol() {
    const st = entity.state;
    const r = 45 + rng() * 40;
    const a0 = rng() * TAU;
    for (let i = 0; i < 4; i++) {
      const a = a0 + (i / 4) * TAU + (rng() - 0.5) * 0.5;
      waypoints.push({
        x: clamp(st.pos.x + Math.sin(a) * r, -500, 500),
        z: clamp(st.pos.z + Math.cos(a) * r, -500, 500),
      });
    }
    wpIndex = 0;
    autoPatrolBuilt = true;
    loopWaypoints = true;
  }

  function drivePatrol(input: AiInput): void {
    if (waypoints.length === 0) {
      if (!autoPatrolBuilt) buildAutoPatrol();
      if (waypoints.length === 0) { input.throttle = 0; input.steer = 0; return; }
    }
    const wp = waypoints[wpIndex];
    // Full throttle before first contact (nowS is sim time): the opening
    // push is a transit, not a patrol — WoT rounds reach contact in
    // 30-60 s and every second of dawdling here is dead air. After the
    // first minute (contact made or not) drop back to patrol pace.
    if (driveToXZ(input, wp.x, wp.z, nowS < 60 ? 1.0 : 0.85)) {
      if (wpIndex < waypoints.length - 1) wpIndex++;
      else if (loopWaypoints) wpIndex = 0;
    }
  }

  function driveRememberedContact(input: AiInput, timeS: number): void {
    if (timeS - lastSeenAtS < TARGET_MEMORY_S + 6 &&
        !chaseToXZ(input, lastSeen.x, lastSeen.z, 0.9)) return;
    mode = 'patrol';
    drivePatrol(input);
  }

  function driveGunNudge(input: AiInput): void {
    input.throttle = -0.6;
    input.steer = 0;
    input.brake = false;
  }

  function driveFallback(input: AiInput, navX: number, navZ: number): void {
    const st = entity.state;
    if (fallbackReverse) {
      reverseFacing(input, Math.atan2(navX - st.pos.x, navZ - st.pos.z), -0.75);
      return;
    }
    driveToXZ(input, fallbackPoint.x, fallbackPoint.z, 1.0);
  }

  function beginLaneFallback(input: AiInput, timeS: number): void {
    laneFallbackUntilS = timeS + 12;
    losBlockedT = 0;
    hasVantage = false;
    drivePatrol(input);
  }

  function setVantageTowardEnemySector(): void {
    const list = deps.getEnemies();
    let cx = 0;
    let cz = 0;
    let count = 0;
    for (let i = 0; i < list.length; i++) {
      const enemy = list[i];
      if (!enemyAlive(enemy)) continue;
      cx += enemy.state.pos.x;
      cz += enemy.state.pos.z;
      count++;
    }
    if (count === 0) return;
    const st = entity.state;
    const qx = Math.round(cx / count / 50) * 50;
    const qz = Math.round(cz / count / 50) * 50;
    const bearing = Math.atan2(qx - st.pos.x, qz - st.pos.z) + (rng() - 0.5) * 0.6;
    vantage.x = st.pos.x + Math.sin(bearing) * 90;
    vantage.z = st.pos.z + Math.cos(bearing) * 90;
    hasVantage = true;
  }

  function driveBlockedContact(input: AiInput, timeS: number): void {
    if (timeS < laneFallbackUntilS) {
      drivePatrol(input);
      return;
    }
    if ((losBlockedT > 14 && stuckStrikes >= 2) || losBlockedT > 18) {
      beginLaneFallback(input, timeS);
      return;
    }
    if (hasVantage) {
      if (driveToXZ(input, vantage.x, vantage.z, 1.0)) hasVantage = false;
      return;
    }
    const vantageAfterS = timeS < pressUntilS ? 2 : 5;
    if (losBlockedT > vantageAfterS && findVantage()) {
      hasVantage = true;
      driveToXZ(input, vantage.x, vantage.z, 1.0);
      return;
    }
    if (!target) return;
    if (chaseToXZ(input, lastSeen.x, lastSeen.z, 0.9)) {
      setVantageTowardEnemySector();
    }
  }

  /** The trigger has starved (SETTLE_STARVED_S): that long in contact with the current target without a shot. A fresh
   * contact has not, however long ago the bot last fired. */
  function triggerStarved(timeS: number): boolean {
    return timeS - Math.max(lastFiredAtS, acquiredAtS) > SETTLE_STARVED_S;
  }

  // the last exposedUnderFire sight test, re-cast every LOS_INTERVAL_S while it is asked
  let openExposedAtS = -Infinity;
  let openExposed = false;
  /**
   * Under fire in the open (SETTLE_STARVED_S): a direct hit inside the under-fire window from a gun that still sees the
   * hull's body (EXPOSED_BODY_FRAC), with no crest or wall between them.
   */
  function exposedUnderFire(timeS: number): boolean {
    const shooter = directlyUnderFire && timeS < underFireUntilS && underFire && enemyAlive(underFire) ? underFire : null;
    if (!shooter) return false;
    if (timeS - openExposedAtS < LOS_INTERVAL_S) return openExposed;
    openExposedAtS = timeS;
    const st = entity.state, sp = shooter.state.pos;
    openExposed = hasLos(sp.x, eyeY(shooter), sp.z, st.pos.x, st.pos.y + spec.dims.heightM * EXPOSED_BODY_FRAC, st.pos.z);
    return openExposed;
  }

  function updateEngagementSettle(timeS: number): void {
    const reload = entity.combat && entity.combat.reload;
    if (conserving || emptyRack) return; // round 62: the silence is a held round or an empty rack, not a bad lay
    if (!triggerStarved(timeS) || timeS < settleUntilS ||
        timeS < settleCdUntilS || !reload || reload.t > 0.5) return;
    settleStreak = timeS - settleUntilS < 1.5 ? settleStreak + 1 : 0;
    if (settleStreak < 3) {
      settleUntilS = timeS + 3.5;
      return;
    }
    settleStreak = 0;
    settleCdUntilS = timeS + 8;
  }

  function effectiveEngageRange(timeS: number): number {
    const pressure = timeS < underFireUntilS ||
      timeS < pressUntilS;
    return roleEngageR() + (pressure ? UNDER_FIRE_RANGE_BONUS_M : 0);
  }

  function faceNavigationTarget(input: AiInput, navX: number, navZ: number): void {
    const st = entity.state;
    faceYaw(input, Math.atan2(navX - st.pos.x, navZ - st.pos.z));
  }

  function driveToEngagementEnvelope(
    input: AiInput,
    timeS: number,
    distToTarget: number,
    navX: number,
    navZ: number,
  ): boolean {
    const engageR = effectiveEngageRange(timeS);
    if (distToTarget <= engageR) return false;
    const shouldHold = role !== 'scout' && timeS >= pressUntilS &&
      distToTarget < engageR + 90 && outnumberedSolo();
    if (shouldHold) faceNavigationTarget(input, navX, navZ);
    else chaseToXZ(input, navX, navZ, 1.0);
    return true;
  }

  function driveFlankingReload(input: AiInput, navX: number, navZ: number): void {
    const st = entity.state;
    const lateralX = navZ - st.pos.z;
    const lateralZ = -(navX - st.pos.x);
    const length = Math.hypot(lateralX, lateralZ) || 1;
    chaseToXZ(input, navX + (lateralX / length) * 48 * angleSide,
      navZ + (lateralZ / length) * 48 * angleSide, 0.7);
  }

  function driveReloadApproach(
    input: AiInput,
    timeS: number,
    navX: number,
    navZ: number,
  ): void {
    if (role === 'sniper' || (timeS >= pressUntilS && outnumberedSolo())) {
      faceNavigationTarget(input, navX, navZ);
      return;
    }
    if (role === 'flanker') {
      driveFlankingReload(input, navX, navZ);
      return;
    }
    chaseToXZ(input, navX, navZ, 0.6);
  }

  function driveMidRange(
    input: AiInput,
    timeS: number,
    navX: number,
    navZ: number,
  ): void {
    const reload = entity.combat && entity.combat.reload;
    const targetReload = target && target.combat && target.combat.reload;
    if (role === 'brawler' && targetReload && targetReload.t > 1.5 &&
        (!reload || reload.t <= 0.3)) {
      chaseToXZ(input, navX, navZ, 0.85);
      return;
    }
    if (reload && reload.t > 1.2) {
      driveReloadApproach(input, timeS, navX, navZ);
      return;
    }
    faceNavigationTarget(input, navX, navZ);
  }

  function driveHoldBand(
    input: AiInput,
    distToTarget: number,
    navX: number,
    navZ: number,
  ): void {
    const st = entity.state;
    const bearing = Math.atan2(navX - st.pos.x, navZ - st.pos.z);
    const reload = entity.combat && entity.combat.reload;
    const modules = entity.combat && entity.combat.modules;
    const gunOut = mainWeaponModuleState(entity.combat) === 'red';
    const shouldReverse = (reload && reload.t > 1.2 && role !== 'brawler' && !casemate) || gunOut;
    if (shouldReverse && distToTarget > 55) {
      reverseFacing(input, bearing, -0.45);
      return;
    }
    const ringOut = modules && modules.turretRing && modules.turretRing.state !== 'ok';
    faceYaw(input, bearing + (ringOut ? 0 : angleRad * angleSide));
  }

  /** Round 62 pacing: the empty rack drives — a ram run when the ram law allows it, otherwise the retirement. */
  function driveEmptyRack(input: AiInput, timeS: number, navX: number, navZ: number): void {
    const st = entity.state;
    if (ramming && target) {
      const dx = navX - st.pos.x;
      const dz = navZ - st.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      const bearing = Math.atan2(dx, dz);
      // a run that has stalled against the hull (no closing speed left) backs off for the next run-up
      if (timeS >= ramBackoffUntilS && dist < 12 && Math.abs(st.speed) < 2.5) ramBackoffUntilS = timeS + 3.5;
      if (timeS < ramBackoffUntilS && dist < RAM_RUN_UP_M) {
        reverseFacing(input, bearing, -0.8);
        return;
      }
      // in contact with the hull: what it moves now is the run's own push (see RAM_CONTACT_HOLD_S)
      if (dist < (spec.dims.hullLengthM + target.spec.dims.hullLengthM) * 0.5 + 1.5) {
        ramContactUntilS = timeS + RAM_CONTACT_HOLD_S;
        ramContactId = target.id;
      }
      if (timeS - ramLineCheckS >= RAM_LINE_RECHECK_S) {
        ramLineCheckS = timeS;
        ramLineClear = dist <= RAM_STRAIGHT_M && !findBlockingObstacle(st.pos.x, st.pos.z, dx / dist, dz / dist,
          Math.max(0, dist - target.spec.dims.hullLengthM * 0.5), spec.dims.widthM * 0.5 + 0.3);
      }
      if (ramLineClear) {
        // a clear line: straight at the hull (the router would round whatever stands beyond it)
        const err = wrapAngle(bearing - st.yaw);
        input.steer = clamp(err * 2.2, -1, 1);
        input.throttle = Math.abs(err) > 1.2 ? 0.3 : 1;
        trackNavProgress(navX, navZ, dist); // the wedge and orbit watchdogs judge the run against the hull itself
      } else {
        // straight through the target: the arrive test must not stop the hull short of contact
        ramPoint.x = navX + (dx / dist) * 20;
        ramPoint.z = navZ + (dz / dist) * 20;
        driveToXZ(input, ramPoint.x, ramPoint.z, 1.0);
      }
      input.brake = false;
      // a finishing run against a passive hull closes no faster than the speed it was judged at
      if (st.speed > ramCapMps) input.throttle = 0;
      if (st.speed > ramCapMps + RAM_CAP_BRAKE_MPS) input.brake = true;
      return;
    }
    const enemy = nearestLivingEnemy();
    if (!enemy) {
      input.throttle = 0;
      input.steer = 0;
      return;
    }
    const ex = enemy.state.pos.x - st.pos.x;
    const ez = enemy.state.pos.z - st.pos.z;
    const dist = Math.hypot(ex, ez) || 1;
    if (dist >= EMPTY_RETIRE_M) {
      faceYaw(input, Math.atan2(ex, ez)); // keep the enemy lit for the team from here
      return;
    }
    const support = nearestSupport();
    if (support) {
      driveToXZ(input, support.state.pos.x, support.state.pos.z, 1.0);
      return;
    }
    driveToXZ(input, clamp(st.pos.x - (ex / dist) * 90, -470, 470), clamp(st.pos.z - (ez / dist) * 90, -470, 470), 1.0);
  }

  function driveEngage(input: AiInput, timeS: number, distToTarget: number): void {
    if (!target) {
      driveRememberedContact(input, timeS);
      return;
    }
    const targetPos = target.state.pos;
    const targetVisible = isVisibleToTeam(target);
    const navX = targetVisible ? targetPos.x : lastSeen.x;
    const navZ = targetVisible ? targetPos.z : lastSeen.z;
    if (emptyRack) {
      driveEmptyRack(input, timeS, navX, navZ);
      return;
    }
    if (timeS < nudgeUntilS) {
      driveGunNudge(input);
      return;
    }
    if (timeS < fallbackUntilS) {
      driveFallback(input, navX, navZ);
      return;
    }
    if (!losClear) {
      driveBlockedContact(input, timeS);
      return;
    }
    hasVantage = false;
    updateEngagementSettle(timeS);
    if (driveToEngagementEnvelope(input, timeS, distToTarget, navX, navZ)) return;
    if (driveOrderedPosture(input, distToTarget, navX, navZ)) return;
    // round 62 pacing: a lay the rack cannot afford at this range is closed on, not taken (see shouldConserve)
    if (conserving && timeS >= deploymentUntilS && !outnumberedSolo()) {
      chaseToXZ(input, navX, navZ, 0.9);
      return;
    }
    if (hasMoveTarget) {
      const arrived = casemate && behindOnLine(moveTarget.x, moveTarget.z)
        ? driveOnLine(input, moveTarget.x, moveTarget.z, targetBearing(), -0.6)
        : driveToXZ(input, moveTarget.x, moveTarget.z, 0.6);
      if (arrived) hasMoveTarget = false;
      return;
    }
    if (role === 'scout') {
      scoutMove(input, timeS, distToTarget, navX, navZ);
      return;
    }
    if (distToTarget > roleHoldR()) {
      driveMidRange(input, timeS, navX, navZ);
      return;
    }
    driveHoldBand(input, distToTarget, navX, navZ);
  }

  /**
   * A push closes only with local support and beyond the hold band. Capture
   * and support follow terrain-safe waypoints while fighting en route.
   */
  function driveOrderedPosture(input: AiInput, distToTarget: number, navX: number, navZ: number): boolean {
    if (!orderActive()) return false;
    const posture = order!.posture;
    if (posture === 'push') {
      if (distToTarget <= roleHoldR() || outnumberedSolo()) return false;
      chaseToXZ(input, navX, navZ, 1.0);
      return true;
    }
    const point = order!.point;
    if ((posture === 'capture' || posture === 'support') && point) {
      if (Math.hypot(point.x - entity.state.pos.x, point.z - entity.state.pos.z) < ARRIVE_DIST_M) return false;
      setWaypoints([[point.x, point.z]], { loop: false });
      const waypoint = waypoints[wpIndex];
      if (!waypoint) return false;
      if (driveToXZ(input, waypoint.x, waypoint.z, 1.0) && wpIndex < waypoints.length - 1) wpIndex++;
      return true;
    }
    return false;
  }

  /**
   * BATTLE-AI r7: true when diving the current target alone is suicide —
   * 2+ live opponents inside 200 m of the target and this hull is a genuine
   * LONE SPEARHEAD: no living teammate within 170 m AND nobody at least as
   * far forward (within 40 m of my target distance). The "as far forward"
   * arm is the deadlock breaker — the first cut froze whole battle lines
   * because every bot in a spread formation read its >130 m neighbors as
   * absent support and mutually held (r7 flow probe: 12-bot idle stalls).
   * A line advancing abreast is support; only the man way out front waits.
   * A continuous 10 s hold also self-releases for 15 s — WoT bots commit.
   * Headless fixtures without getAllies never trigger the guard.
   * @returns {boolean}
   */
  function outnumberedSolo(): boolean {
    if (!target || !target.state || !getAllies) return false;
    if (nowS < guardReleaseUntilS) return false;
    const list = deps.getEnemies();
    let near = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!enemyAlive(e) || !isVisibleToTeam(e)) continue;
      const dx = e.state.pos.x - target.state.pos.x;
      const dz = e.state.pos.z - target.state.pos.z;
      if (dx * dx + dz * dz < 200 * 200) near++;
      if (near >= 2) break;
    }
    if (near < 2) { guardT = 0; return false; }
    const st = entity.state;
    const tp = target.state.pos;
    const myD = Math.hypot(tp.x - st.pos.x, tp.z - st.pos.z);
    const friends = getAllies();
    for (let i = 0; i < friends.length; i++) {
      const f = friends[i];
      if (!f || !f.state) continue;
      const dx = f.state.pos.x - st.pos.x;
      const dz = f.state.pos.z - st.pos.z;
      if (dx * dx + dz * dz < 170 * 170) { guardT = 0; return false; }
      const fd = Math.hypot(tp.x - f.state.pos.x, tp.z - f.state.pos.z);
      if (fd < myD + 40) { guardT = 0; return false; } // line abreast = support
    }
    const step = nowS - guardLastS;
    guardT = step < 0.12 ? guardT + Math.max(0, step) : 0; // consecutive ticks only
    guardLastS = nowS;
    if (guardT > 10) {
      guardT = 0;
      guardReleaseUntilS = nowS + 15;
      return false;
    }
    return true;
  }

  /**
   * BATTLE-AI r7 scout movement: kite out of knife range through a lateral
   * escape point (never a straight reverse — speed is the scout's armor),
   * otherwise orbit the engagement band tangentially, flipping sides every
   * 9-15 s and spiraling out when too close / in when too far. The scout
   * stays lit-up-proof and keeps feeding the team's spotting net.
   */
  function scoutMove(
    input: AiInput,
    timeS: number,
    dist: number,
    navX: number,
    navZ: number,
  ): void {
    const st = entity.state;
    if (timeS >= kiteUntilS) {
      let nd2 = Infinity;
      let nearest: AiEntity | null = null;
      const list = deps.getEnemies();
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!enemyAlive(e)) continue;
        const dx = e.state.pos.x - st.pos.x, dz = e.state.pos.z - st.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < nd2) { nd2 = d2; nearest = e; }
      }
      if (nearest && nd2 < SCOUT_KITE_M * SCOUT_KITE_M) {
        const away = Math.atan2(st.pos.x - nearest.state.pos.x,
          st.pos.z - nearest.state.pos.z);
        const esc = away + orbitSide * 0.7;
        kitePoint.x = st.pos.x + Math.sin(esc) * 150;
        kitePoint.z = st.pos.z + Math.cos(esc) * 150;
        kiteUntilS = timeS + 5;
      }
    }
    if (timeS < kiteUntilS) {
      if (driveToXZ(input, kitePoint.x, kitePoint.z, 1.0)) kiteUntilS = -1;
      return;
    }
    if (timeS >= orbitFlipS) {
      orbitSide = -orbitSide;
      orbitFlipS = timeS + 9 + rng() * 6;
    }
    const holdR = roleHoldR();
    const bearing = Math.atan2(navX - st.pos.x, navZ - st.pos.z);
    // tangential orbit with a spiral bias: >90° off the bearing when inside
    // the band (opens distance), <90° when outside (closes it)
    const orb = bearing + orbitSide * (Math.PI / 2) * (dist < holdR ? 1.2 : 0.8);
    driveToXZ(input, st.pos.x + Math.sin(orb) * 60, st.pos.z + Math.cos(orb) * 60, 0.95);
  }

  /**
   * BATTLE-AI r7 ARC-PIN REPOSITION: the gun has been pitch-pinned for
   * seconds (hull nose-up/down on a fold face — steppe diag measured
   * visualPitch +17-21° vs 5-7° of gun depression, 260+ mrad of pitch error
   * held for 60+ s while the 1.2 s reverse nudge cycled uselessly on the
   * same slope). Sample a ring of nearby FLAT cells (normal.y >= 0.94),
   * prefer one that keeps a sightline to the target, and drive there via
   * the scoot slot. A tank that knows its gun arcs finds ground that lets
   * the gun work — core "good ideas of their tank".
   * @returns {boolean} true when scootPoint was filled
   */
  const flatCandidate = { x: 0, z: 0, score: -Infinity, found: false };

  function evaluateFlatRing(radius: number, targetX: number, targetY: number, targetZ: number): void {
    const st = entity.state;
    for (let k = 0; k < 8; k++) {
      const angle = (k / 8) * TAU;
      // no cell along the travel a dead leg tried (see LEG_DEAD_M)
      if (travelBlocked(Math.sin(angle), Math.cos(angle))) continue;
      const candidateX = st.pos.x + Math.sin(angle) * radius;
      const candidateZ = st.pos.z + Math.cos(angle) * radius;
      if (Math.max(Math.abs(candidateX), Math.abs(candidateZ)) > 470) continue;
      const normal = hf.getNormalAt ? hf.getNormalAt(candidateX, candidateZ) : null;
      const normalX = normal?.x ?? 0, normalZ = normal?.z ?? 0;
      const normalLength = normal ? Math.hypot(normalX, normal.y, normalZ) : 1;
      const normalY = normal ? normal.y : 1;
      if (normalY < 0.94) continue;
      const candidateY = hf.getHeightAt(candidateX, candidateZ) + selfEyeM;
      const hasSight = hasLos(
        candidateX, candidateY, candidateZ, targetX, targetY, targetZ,
      );
      // The gun lays from there (see LEG_DEAD_M): the target's elevation off the ground the hull will stand on is
      // inside its arc. A hull on a planar face meets the target at the same elevation off the face whatever its
      // heading (its up is the face's normal), so a turn on the spot never brings a target the face takes out of the
      // arc back into it: the cell has to be other ground.
      let reach = true;
      if (normal && normalLength > 1e-6) {
        const dx = targetX - candidateX, dy = targetY - candidateY, dz = targetZ - candidateZ;
        const distance = Math.hypot(dx, dy, dz);
        if (distance > 1e-6) {
          const along = (dx * normalX + dy * normal.y + dz * normalZ) / (distance * normalLength);
          reach = withinGunArc(Math.asin(clamp(along, -1, 1)));
        }
      }
      const score = (hasSight ? 100 : 0) + (reach ? 100 : 0) + normalY * 10 - radius * 0.1;
      if (score <= flatCandidate.score) continue;
      flatCandidate.x = candidateX;
      flatCandidate.z = candidateZ;
      flatCandidate.score = score;
      flatCandidate.found = true;
    }
  }

  function pickFlatCell(): boolean {
    if (!target || !target.state) return false;
    const position = target.state.pos;
    flatCandidate.score = -Infinity;
    flatCandidate.found = false;
    for (let i = 0; i < FLAT_CELL_RINGS_M.length; i++) {
      evaluateFlatRing(
        FLAT_CELL_RINGS_M[i], position.x, eyeY(target), position.z,
      );
      if (flatCandidate.found && flatCandidate.score >= 200) break;
    }
    if (!flatCandidate.found) return false;
    scootPoint.x = flatCandidate.x;
    scootPoint.z = flatCandidate.z;
    return true;
  }

  // Round 48 pacing (2026-09-24, Frosthollow redesign): the last bravo bot chained 14 s scoot legs for 160 s on
  // the west ridge's flanks — every candidate 45-85 m out stood on a 25-30 deg face (normal.y 0.86-0.90) that the
  // hull crawled and slid on; it never arrived (relocations frozen at 18), never fired (each probe-miss window
  // re-armed the next leg) and the idle host survived the 15 min cap. A relocation cell must be ground a tank can
  // hold and reach: the cell itself flat enough to fire from (pickFlatCell's ring uses 0.94; a hair looser here)
  // and the leg's two interior samples no steeper than a comfortable climb. Terrain without normals passes.
  const SPOT_NORMAL_Y_MIN = 0.90;
  const LEG_NORMAL_Y_MIN = 0.86;
  // A casemate lays its gun with the hull: on Tarkhan's border rim (~15 deg) the Strv 103 sat at +12 deg of
  // elevation with 63 mrad still to go for four minutes, so its cells must be near-level (normal.y >= 0.975).
  const CASEMATE_SPOT_NORMAL_Y_MIN = 0.975;
  // Round 60 pacing (2026-09-24, Copper Mesa seed 2 / Coastal seed 3): bots at the foot of the host's rise had the
  // hull in view and the gate open but the gun pinned at its elevation stop — the arc-limit relaxation let rounds
  // go with 60 mrad of pitch error (29 rounds from 50 m, no damage) and the press ignored the relocation. A zone
  // or a press point the gun cannot be laid on is out of reach exactly like one behind a crest.
  function withinGunArc(pitchRad: number): boolean {
    const low = -(spec.gunDepressionDeg * (Math.PI / 180)) + GUN_ARC_MARGIN_RAD;
    const high = spec.gunElevationDeg * (Math.PI / 180) - GUN_ARC_MARGIN_RAD;
    return pitchRad >= low && pitchRad <= high;
  }

  function reachableSpot(cx: number, cz: number): boolean {
    if (!hf.getNormalAt) return true;
    if (hf.getNormalAt(cx, cz).y < (casemate ? CASEMATE_SPOT_NORMAL_Y_MIN : SPOT_NORMAL_Y_MIN)) return false;
    const st = entity.state;
    for (let i = 1; i <= 2; i++) {
      const f = i / 3;
      const sx = st.pos.x + (cx - st.pos.x) * f;
      const sz = st.pos.z + (cz - st.pos.z) * f;
      if (hf.getNormalAt(sx, sz).y < LEG_NORMAL_Y_MIN) return false;
    }
    return true;
  }

  /**
   * A casemate's scoot spot on its line of fire: CASEMATE_SCOOT_M back, or up again after a leg back (a shorter leg,
   * then the other way, when that ground does not serve). Returns the leg's direction (-1 back, +1 up), 0 for none.
   */
  function pickLineScoot(): number {
    const st = entity.state;
    const bearing = targetBearing();
    const first = lineScootUp ? 1 : -1;
    for (const direction of [first, -first]) {
      for (const distance of [CASEMATE_SCOOT_M, CASEMATE_SCOOT_M * 0.5]) {
        const cx = st.pos.x + Math.sin(bearing) * distance * direction;
        const cz = st.pos.z + Math.cos(bearing) * distance * direction;
        if (Math.max(Math.abs(cx), Math.abs(cz)) > 470) continue;
        if (!reachableSpot(cx, cz) || !legDrivable(st.pos.x, st.pos.z, cx, cz)) continue;
        scootPoint.x = cx;
        scootPoint.z = cz;
        lineScootUp = direction < 0;
        return direction;
      }
    }
    return 0;
  }

  /**
   * BATTLE-AI r7: sample a relocation cell 45-85 m out, biased to the rear
   * quarters of the target bearing; prefer one that keeps a sightline to the
   * last known contact so the next shot is already set up.
   * @returns {boolean} true when scootPoint was filled
   */
  function pickScoot(): boolean {
    const st = entity.state;
    const tb = target && target.state
      ? Math.atan2(target.state.pos.x - st.pos.x, target.state.pos.z - st.pos.z)
      : st.yaw;
    const ty = hf.getHeightAt(lastSeen.x, lastSeen.z) + 1.5;
    let fx = 0, fz = 0, found = false;
    for (let k = 0; k < 6; k++) {
      // ±(94°..152°) off the contact bearing — sideways-to-rear arcs
      const a = tb + (k % 2 ? -1 : 1) * (1.65 + 0.5 * ((k / 2) | 0));
      const r = 45 + rng() * 40;
      const cx = st.pos.x + Math.sin(a) * r;
      const cz = st.pos.z + Math.cos(a) * r;
      if (Math.max(Math.abs(cx), Math.abs(cz)) > 470) continue;
      if (!reachableSpot(cx, cz)) continue; // round 48 pacing: no scoot onto a ridge flank
      const cy = hf.getHeightAt(cx, cz) + selfEyeM;
      const sight = hasLos(cx, cy, cz, lastSeen.x, ty, lastSeen.z);
      if (!found || sight) { fx = cx; fz = cz; found = true; }
      if (sight) break;
    }
    if (found) { scootPoint.x = fx; scootPoint.z = fz; }
    return found;
  }

  /** Move sideways out of a teammate-blocked gun lane. Short, flat, LOS-safe
   * candidates beat the normal 45-85 m shoot-and-scoot because this is a
   * formation adjustment, not a full relocation. */
  const friendlyLaneCandidate = { x: 0, z: 0, score: -Infinity };

  function friendlyLaneClearance(x: number, z: number, friends: AiEntity[]): number {
    let clearance = 80;
    for (let i = 0; i < friends.length; i++) {
      const friend = friends[i];
      if (!friend || !friend.state) continue;
      clearance = Math.min(
        clearance,
        Math.hypot(friend.state.pos.x - x, friend.state.pos.z - z),
      );
    }
    return clearance;
  }

  function evaluateFriendlyLaneSide(
    radius: number,
    side: number,
    directionX: number,
    directionZ: number,
    perpendicularX: number,
    perpendicularZ: number,
    targetX: number,
    targetY: number,
    targetZ: number,
    friends: AiEntity[],
  ): void {
    const st = entity.state;
    const candidateX = st.pos.x + perpendicularX * radius * side - directionX * 4;
    const candidateZ = st.pos.z + perpendicularZ * radius * side - directionZ * 4;
    if (Math.max(Math.abs(candidateX), Math.abs(candidateZ)) > 470) return;
    if (hf.getNormalAt && hf.getNormalAt(candidateX, candidateZ).y < 0.9) return;
    const candidateY = hf.getHeightAt(candidateX, candidateZ) + selfEyeM;
    if (!hasLos(
      candidateX, candidateY, candidateZ, targetX, targetY, targetZ,
    )) return;
    const clearance = friendlyLaneClearance(candidateX, candidateZ, friends);
    const score = Math.min(40, clearance) - radius * 0.12 +
      (side === angleSide ? 1 : 0);
    if (score <= friendlyLaneCandidate.score) return;
    friendlyLaneCandidate.score = score;
    friendlyLaneCandidate.x = candidateX;
    friendlyLaneCandidate.z = candidateZ;
  }

  function pickFriendlyFireLane(): boolean {
    if (!target || !target.state) return false;
    const st = entity.state;
    const targetPosition = target.state.pos;
    let directionX = targetPosition.x - st.pos.x;
    let directionZ = targetPosition.z - st.pos.z;
    const distance = Math.hypot(directionX, directionZ) || 1;
    directionX /= distance;
    directionZ /= distance;
    const friends = getAllies ? getAllies() : [];
    friendlyLaneCandidate.score = -Infinity;
    for (let i = 0; i < FRIENDLY_LANE_RINGS_M.length; i++) {
      const radius = FRIENDLY_LANE_RINGS_M[i];
      evaluateFriendlyLaneSide(
        radius, angleSide, directionX, directionZ, directionZ, -directionX,
        targetPosition.x, eyeY(target), targetPosition.z, friends,
      );
      evaluateFriendlyLaneSide(
        radius, -angleSide, directionX, directionZ, directionZ, -directionX,
        targetPosition.x, eyeY(target), targetPosition.z, friends,
      );
      if (friendlyLaneCandidate.score > 18) break;
    }
    if (friendlyLaneCandidate.score === -Infinity) return false;
    scootPoint.x = friendlyLaneCandidate.x;
    scootPoint.z = friendlyLaneCandidate.z;
    return true;
  }

  // ---- aiming & firing -----------------------------------------------------

  const fireGate = {
    distance: 0,
    blindFire: false,
    blindLock: false,
    reactionReady: false,
    reloadReady: false,
    rangeReady: false,
    dispersionReady: false,
    aligned: false,
    yawError: 0,
    pitchError: 0,
  };
  let aimLateralX = 0;
  let aimLateralZ = 0;

  function setIdleScan(input: AiInput, timeS: number): void {
    const state = entity.state;
    const scanYaw = state.yaw + Math.sin(timeS * 0.3 + scanPhase) * 0.9;
    const scanX = state.pos.x + Math.sin(scanYaw) * 160;
    const scanZ = state.pos.z + Math.cos(scanYaw) * 160;
    input.aimPoint.set(scanX, hf.getHeightAt(scanX, scanZ) + selfEyeM, scanZ);
    input.fire = false;
  }

  function selectedShell(combat: CombatState | undefined): DamageShellSpec | null {
    const loadingSlot = combat?.shellSlot;
    if ((combat?.reload?.t ?? 0) > 1e-3 && loadingSlot != null && slotHasAmmo(loadingSlot)
        && (combat?.reloadChannels?.[chosenSlot] ?? combat?.reload) === combat?.reload) {
      chosenSlot = loadingSlot;
    } else if (!slotHasAmmo(chosenSlot)) {
      chosenSlot = firstAvailableSlot();
    }
    if (chosenSlot < 0) return null;
    return spec.gun.shells[clamp(chosenSlot, 0, spec.gun.shells.length - 1)] ?? null;
  }

  function prepareLeadAim(shell: DamageShellSpec): number {
    if (!target) return 0;
    const self = entity.state;
    const targetState = target.state;
    const targetPosition = targetState.pos;
    const height = target.spec.dims.heightM;
    const width = target.spec.dims.widthM;
    const eyeX = self.pos.x;
    const eyeYPosition = self.pos.y + selfEyeM;
    const eyeZ = self.pos.z;
    aimLateralX = targetPosition.z - eyeZ;
    aimLateralZ = -(targetPosition.x - eyeX);
    const lateralLength = Math.hypot(aimLateralX, aimLateralZ) || 1;
    aimLateralX /= lateralLength;
    aimLateralZ /= lateralLength;
    _vC.set(
      targetPosition.x + aimLateralX * aimLatFrac * width,
      targetPosition.y + aimHFrac * height,
      targetPosition.z + aimLateralZ * aimLatFrac * width,
    );
    const velocityX = Math.sin(targetState.yaw) * targetState.speed;
    const velocityZ = Math.cos(targetState.yaw) * targetState.speed;
    _vC.x -= velocityX * targetTrackLagS;
    _vC.z -= velocityZ * targetTrackLagS;
    _vD.copy(_vC);
    let distance = 0;
    for (let iteration = 0; iteration < 2; iteration++) {
      _vE.set(_vD.x - eyeX, _vD.y - eyeYPosition, _vD.z - eyeZ);
      distance = _vE.length();
      const travelTime = distance / shell.velocityMps;
      _vD.set(
        _vC.x + velocityX * travelTime * targetLeadScale,
        _vC.y,
        _vC.z + velocityZ * travelTime * targetLeadScale,
      );
    }
    return distance;
  }

  // bot philosophy r1: no blind fire. A shell leaves the gun only at a spotted
  // target with a clear personal ray; a remembered muzzle flash moves the hull,
  // never the trigger. Both gates stay in the fire-debug surface as false.
  function blindFireActive(_timeS: number, _distance: number): boolean {
    return false;
  }

  function blindLockActive(_timeS: number): boolean {
    return false;
  }

  function applyBlindAim(): void {
    _vD.set(
      lastSeen.x,
      hf.getHeightAt(lastSeen.x, lastSeen.z) + 1.2,
      lastSeen.z,
    );
  }

  function applyAimError(distance: number, blind: boolean): void {
    _vD.x += aimLateralX * errYawRad * distance;
    _vD.z += aimLateralZ * errYawRad * distance;
    _vD.y += errPitchRad * distance;
    if (target?.isPlayer && tier.playerSpreadMult > 0 && distance > 150) {
      const ramp = Math.min(1, (distance - 150) / 150) * tier.playerSpreadMult;
      _vD.x += aimLateralX * playerYawRad * distance * ramp;
      _vD.z += aimLateralZ * playerYawRad * distance * ramp;
      _vD.y += playerPitchRad * distance * ramp;
    }
    if (!blind) return;
    _vD.x += aimLateralX * blindYawRad * distance;
    _vD.z += aimLateralZ * blindYawRad * distance;
    _vD.y += blindPitchRad * distance;
  }

  function applyBallisticGunLay(shell: DamageShellSpec): void {
    const state = entity.state;
    _vE.set(state.pos.x, state.pos.y + selfGunM, state.pos.z);
    const layDistance = _vE.distanceTo(_vD);
    if (solveBallisticGunLay(_vF, _vE, _vD, shell)) {
      _vD.copy(_vE).addScaledVector(_vF, layDistance);
    }
  }

  function setShotInput(input: AiInput): void {
    input.aimPoint.copy(_vD);
    input.shellSlot = clamp(chosenSlot, 0, spec.gun.shells.length - 1);
  }

  function updateBasicFireGates(distance: number, timeS: number): void {
    const combat = entity.combat;
    const round = spec.gun.shells[chosenSlot];
    const gunDisabled = combat && round ? selectedWeaponModuleState(combat, spec.gun, round) === 'red' : false;
    fireGate.distance = distance;
    fireGate.reactionReady = timeS - acquiredAtS >= tier.reactionS;
    fireGate.reloadReady = !combat || (
      !!combat.reload && slotReloadS(chosenSlot) <= 1e-3 && !combat.destroyed && !gunDisabled
    );
    fireGate.rangeReady = distance <= MAX_FIRE_RANGE_M;
    fireGate.dispersionReady = computeDispersionRadM(
      spec,
      entity.state,
      distance,
    ) < (target?.spec.dims.widthM ?? 0) * 0.5 * tier.fireFactor;
  }

  function calculateGunAlignment(input: AiInput, distance: number): void {
    const state = entity.state;
    const gunY = state.pos.y + selfGunM;
    const dx = input.aimPoint.x - state.pos.x;
    const dy = input.aimPoint.y - gunY;
    const dz = input.aimPoint.z - state.pos.z;
    const horizontal = Math.hypot(dx, dz) || 1e-6;
    const desiredYaw = Math.atan2(dx, dz);
    const desiredPitch = Math.atan2(dy, horizontal);
    _hullEuler.set(-(state.visualPitch || 0), state.yaw, state.visualRoll || 0, 'YXZ');
    _hullQuat.setFromEuler(_hullEuler);
    _vF.set(
      Math.sin(state.turretYaw) * Math.cos(state.gunPitch),
      Math.sin(state.gunPitch),
      Math.cos(state.turretYaw) * Math.cos(state.gunPitch),
    ).applyQuaternion(_hullQuat).normalize();
    const gunYaw = Math.atan2(_vF.x, _vF.z);
    const gunPitch = Math.atan2(_vF.y, Math.hypot(_vF.x, _vF.z));
    fireGate.yawError = Math.abs(wrapAngle(desiredYaw - gunYaw));
    fireGate.pitchError = Math.abs(desiredPitch - gunPitch);
    fireGate.distance = distance;
  }

  function updateArcLimit(dt: number, timeS: number, tolerance: number): number {
    const state = entity.state;
    const pitchError = fireGate.pitchError;
    const gunReady = losClear && fireGate.reactionReady
      && fireGate.reloadReady && fireGate.rangeReady;
    if ((state.atGunLimit || pitchError > 0.1) && gunReady && pitchError >= tolerance * 1.5) {
      arcLimitedT += dt;
    } else if ((!state.atGunLimit && pitchError <= 0.1) || pitchError < tolerance * 1.5) {
      arcLimitedT = 0;
    }
    const pitchTolerance = arcLimitedT > 2.5
      ? Math.min(0.06, tolerance * 4)
      : tolerance * 1.5;
    if (arcLimitedT > 3 && pitchError > pitchTolerance && timeS >= scootUntilS) {
      if (pickFlatCell()) beginScoot(10, 0, true);
      arcLimitedT = 0;
    }
    return pitchTolerance;
  }

  function updateAlignment(input: AiInput, dt: number, timeS: number, distance: number): void {
    calculateGunAlignment(input, distance);
    const width = target?.spec.dims.widthM ?? 0;
    const tolerance = Math.max(0.0015, Math.atan2(width * 0.3, distance));
    const pitchTolerance = updateArcLimit(dt, timeS, tolerance);
    fireGate.aligned = fireGate.yawError < tolerance
      && fireGate.pitchError < pitchTolerance;
  }

  function dispersionPass(dt: number): boolean {
    const gunReady = losClear && fireGate.reactionReady
      && fireGate.reloadReady && fireGate.rangeReady;
    if (gunReady && fireGate.aligned && !fireGate.dispersionReady) dispGateT += dt;
    else dispGateT = Math.max(0, dispGateT - dt * 2);
    return fireGate.dispersionReady || dispGateT > 2.5;
  }

  function updateFriendlyFireGate(
    input: AiInput,
    shell: DamageShellSpec,
    dt: number,
    wouldFire: boolean,
  ): FriendlyFireRisk | null {
    const risk = wouldFire && getAllies
      ? botFriendlyFireRisk(entity, input.aimPoint, shell, getAllies())
      : null;
    if (risk) {
      if (friendlyBlockT <= 0) friendlyBlockCount++;
      friendlyBlockT += dt;
      lastFriendlyRisk = risk;
    } else {
      friendlyBlockT = Math.max(0, friendlyBlockT - dt * 2);
      if (friendlyBlockT === 0) lastFriendlyRisk = null;
    }
    input.fire = wouldFire && !risk;
    return risk;
  }

  function publishFireDebug(risk: FriendlyFireRisk | null): void {
    _dbg.losClear = losClear;
    _dbg.reactionOk = fireGate.reactionReady;
    _dbg.reloadReady = fireGate.reloadReady;
    _dbg.rangeOk = fireGate.rangeReady;
    _dbg.dispersionOk = fireGate.dispersionReady;
    _dbg.dispGateT = +dispGateT.toFixed(1);
    _dbg.alignOk = fireGate.aligned;
    _dbg.penGateOk = penGateOk;
    _dbg.slot = chosenSlot;
    _dbg.friendlyBlocked = !!risk;
    _dbg.friendlyBlockKind = risk?.kind ?? null;
    _dbg.friendlyBlockId = risk?.allyId ?? null;
    _dbg.penRatio = +cachedPenRatio.toFixed(2);
    _dbg.yawErrMrad = +(fireGate.yawError * 1000).toFixed(1);
    _dbg.pitchErrMrad = +(fireGate.pitchError * 1000).toFixed(1);
    _dbg.distM = Math.round(fireGate.distance);
    _dbg.gunLaneClear = gunLaneClear;
    _dbg.gunLaneChecks = gunLaneChecks;
    _dbg.gunLaneMoves = gunLaneMoves;
    // round 62 pacing: the ammunition economy
    _dbg.hitChance = +hitChance.toFixed(2);
    _dbg.conserving = conserving;
    _dbg.heWorth = heWorth;
    _dbg.heBurst = Math.round(heBurstBest);
  }

  function nominalGunLanePass(shell: DamageShellSpec, dt: number, timeS: number,
    ordinaryShot: boolean): boolean {
    // Blind fire retains its remembered-point policy; do not query hidden
    // transforms or let this gate remove intentionally sampled aim errors.
    if (!ordinaryShot || fireGate.blindFire || fireGate.blindLock || !target) {
      gunLaneBlockedT = Math.max(0, gunLaneBlockedT - dt * 2);
      return true;
    }
    if (target.id !== gunLaneTargetId || timeS >= gunLaneNextCheckS) {
      gunLaneClear = botNominalGunLaneClear(entity, target, shell, deps.raycast);
      gunLaneTargetId = target.id;
      gunLaneNextCheckS = timeS + LOS_INTERVAL_S;
      gunLaneChecks++;
    }
    gunLaneBlockedT = gunLaneClear ? 0 : gunLaneBlockedT + dt;
    return gunLaneClear;
  }

  /**
   * Round 62 pacing (2026-09-24): the expected chance that the current lay lands on the target's silhouette —
   * the tier's persistent fire-control error (resampleAimError's σ, held for seconds) and the gun's own
   * dispersion, both in metres at this range, against the hull's width and most of its height. Steppe seed 1's
   * T-90M put eleven HEAT rounds at a bot 270-340 m away and hit none; a rack is finite and a bot that can close
   * should close before it fires.
   */
  function expectedHitChance(distance: number): number {
    if (!target || distance < 1) return 1;
    const m = tier.aimErrMult;
    const sigmaTierRad = ((spec.gun.baseAccuracy / 2) / 100) * Math.sqrt(Math.max(0, m * m - 1));
    const sigmaM = Math.hypot(sigmaTierRad * distance,
      computeDispersionRadM(spec, entity.state, distance) * 0.5); // the reticle radius is 2σ
    if (sigmaM < 1e-3) return 1;
    const dims = target.spec.dims;
    const k = 1 / (sigmaM * Math.SQRT2);
    return erf((dims.widthM || 3) * 0.5 * k) * erf((dims.heightM || 2.4) * 0.4 * k);
  }

  /** The hit chance a shot needs: CONSERVE_HIT_CHANCE_FULL with a full rack, rising as the rounds go. */
  function conserveThreshold(): number {
    const combat = entity.combat;
    let fraction = 1;
    if (combat && Array.isArray(combat.ammo) && Array.isArray(combat.ammoCapacity)) {
      let have = 0;
      let capacity = 0;
      for (let slot = 0; slot < combat.ammo.length; slot++) {
        have += combat.ammo[slot] || 0;
        capacity += combat.ammoCapacity[slot] || 0;
      }
      if (capacity > 0) fraction = clamp(have / capacity, 0, 1);
    }
    return CONSERVE_HIT_CHANCE_FULL + (CONSERVE_HIT_CHANCE_EMPTY - CONSERVE_HIT_CHANCE_FULL) * (1 - fraction);
  }

  /**
   * Hold the round and close instead? Only at a bot or a passive target: the player-facing doctrine (a live
   * player is threatened from range, "threatened rather than hit") is untouched. Blind fire keeps its own rules.
   */
  function shouldConserve(timeS: number): boolean {
    if (!target || fireGate.blindFire || fireGate.blindLock || emptyRack) return false;
    if (orderActive() && order!.fire) {
      // a commander's fire discipline: 'press' takes every ready lay, 'hold' wants a likely hit
      if (order!.fire === 'press') return false;
      return hitChance < Math.max(conserveThreshold(), 0.7) + (conserving ? CONSERVE_CLOSE_MARGIN : 0);
    }
    if (target.isPlayer && !targetPassive(timeS)) return false;
    return hitChance < conserveThreshold() + (conserving ? CONSERVE_CLOSE_MARGIN : 0);
  }

  function aimAndFire(input: AiInput, dt: number, timeS: number): void {
    if (!target || !enemyAlive(target)) {
      setIdleScan(input, timeS);
      conserving = false;
      return;
    }
    const shell = selectedShell(entity.combat);
    if (!shell) {
      input.fire = false;
      conserving = false;
      return;
    }

    const distance = prepareLeadAim(shell);
    fireGate.blindFire = blindFireActive(timeS, distance);
    fireGate.blindLock = blindLockActive(timeS);
    if (fireGate.blindFire || fireGate.blindLock) applyBlindAim();
    applyAimError(distance, fireGate.blindFire || fireGate.blindLock);
    applyBallisticGunLay(shell);
    setShotInput(input);

    updateBasicFireGates(distance, timeS);
    updateAlignment(input, dt, timeS, distance);
    const accurateEnough = dispersionPass(dt);
    const gunReady = losClear && fireGate.reactionReady
      && fireGate.reloadReady && fireGate.rangeReady;
    hitChance = expectedHitChance(distance);
    conserving = shouldConserve(timeS);
    // the HE bypass of the penetration gate fires a real HE round only where its surface burst is worth a shell
    const gateOpen = penGateOk || (chosenSlot === heSlot && heWorth);
    const layReady = gunReady && accurateEnough && fireGate.aligned;
    const ordinaryShot = layReady && gateOpen && !conserving;
    if (layReady && gateOpen && conserving) conserveHolds++;
    const blindShot = fireGate.blindFire && fireGate.reactionReady
      && fireGate.reloadReady && fireGate.rangeReady && fireGate.aligned;
    // the physical gun lane is judged on the lay, not on the gate: a muzzle held behind a berm still schedules
    // the lane relocation while the probe (which casts from the same gun) finds no zone to open the gate for
    const clearGunLane = nominalGunLanePass(shell, dt, timeS, layReady);
    const friendlyRisk = updateFriendlyFireGate(
      input,
      shell,
      dt,
      (ordinaryShot && clearGunLane) || blindShot,
    );
    if (input.fire) lastFiredAtS = timeS;
    publishFireDebug(friendlyRisk);
  }
  const _dbg: Record<string, AiDebugValue> = {};

  // ---- state machine -------------------------------------------------------

  function stepPatrolState(): void {
    if (!target || !losClear) return;
    mode = 'engage';
    hasMoveTarget = false;
    coverTimer = 0;
  }

  function updateEngageCoverSearch(): void {
    if (!target || !losClear || coverTimer > 0) return;
    coverTimer = COVER_INTERVAL_S;
    if (rng() < effCoverIQ() && findCrest(moveTarget, false)) hasMoveTarget = true;
  }

  function updateEngageReloadCover(): void {
    const cb = entity.combat;
    const reload = cb && cb.reload;
    if (!reload) return;
    if (reload.t <= 1e-3) {
      coverRolled = false;
      return;
    }
    if (!target || reload.t <= 2) return;
    if (!coverRolled) {
      coverRolled = true;
      coverRollPassed = rng() < effCoverIQ();
    }
    if (!coverRollPassed || !findCrest(coverPoint, true)) return;
    hasCoverPoint = true;
    mode = 'seekCover';
  }

  function stepEngageState(timeS: number): void {
    if (!target && timeS - lastSeenAtS > TARGET_MEMORY_S + 6) {
      mode = 'patrol';
      return;
    }
    updateEngageCoverSearch();
    updateEngageReloadCover();
  }

  function stepSeekCoverState(): void {
    const reload = entity.combat && entity.combat.reload;
    if (reload && reload.t > 0.6 && hasCoverPoint) return;
    mode = 'engage';
    hasMoveTarget = false;
    hasCoverPoint = false;
    coverRolled = false;
  }

  function stepFlankState(timeS: number): void {
    if (!target || !enemyAlive(target)) {
      mode = target ? 'engage' : 'patrol';
      nonPenCount = 0;
      return;
    }
    // Round 60: Coastal seed 3's Strv 103 stood at 69° on the M1A2's side with the gate still closed, and every
    // flank it started "completed" at once — the ring now carries on toward the rear while the gate stays shut.
    const aspect = aspectAngle();
    const flankOpen = aspect > FLANK_ASPECT_RAD && (penGateOk || aspect > FLANK_REAR_ASPECT_RAD);
    if (timeS <= flankUntilS && !flankOpen && flankIndex < 3) {
      return;
    }
    mode = 'engage';
    nonPenCount = 0;
    hasMoveTarget = false;
    probeTimer = 0;
  }

  function updateGunLimitNudge(dt: number, timeS: number): void {
    const st = entity.state;
    const aimPoint = entity.input.aimPoint;
    const yawPinned = st.atGunLimit && aimPoint && Math.abs(wrapAngle(
      Math.atan2(aimPoint.x - st.pos.x, aimPoint.z - st.pos.z) -
      st.yaw - st.turretYaw,
    )) > 0.02;
    if (mode !== 'engage' || !target || !losClear || !st.atGunLimit || yawPinned) {
      gunLimitT = 0;
      return;
    }
    gunLimitT += dt;
    if (gunLimitT <= GUN_LIMIT_NUDGE_S || timeS < nudgeUntilS) return;
    gunLimitT = 0;
    // no back-up while the arc limit's leg runs, nor into a face that stopped the last leg (see LEG_DEAD_M)
    const backX = -Math.sin(st.yaw), backZ = -Math.cos(st.yaw);
    if ((arcScoot && timeS < scootUntilS) || travelBlocked(backX, backZ)) return;
    nudgeUntilS = timeS + 1.2;
    beginLeg(1, backX, backZ);
  }

  function stepStateMachine(dt: number, timeS: number): void {

    switch (mode) {
      case 'patrol':
        stepPatrolState();
        break;
      case 'engage':
        stepEngageState(timeS);
        break;
      case 'seekCover':
        stepSeekCoverState();
        break;
      case 'flank':
        stepFlankState(timeS);
        break;
    }
    updateGunLimitNudge(dt, timeS);
  }

  // Both the low-speed detector and orbit watchdog escalate through this
  // same recovery policy. Low-speed wedges wait for a repeated strike;
  // orbiting proves a bad route immediately and skips that first-strike hold.
  function escalateStuckRecovery(timeS: number, requireRepeatedStrike: boolean): void {
    stuckStrikes++;
    strikeEvents++;
    if (requireRepeatedStrike && stuckStrikes < 2) return;

    detourSide = -detourSide;
    detourUntilS = timeS + UNSTICK_TIME_S + 6;
    // A live corner plan caused the wedge, so replace it immediately. With
    // no plan, let the wide detour own steering for the recovery window.
    if (routeActive) {
      routeActive = false;
      routeTimer = 0;
    } else {
      routeTimer = UNSTICK_TIME_S + 6;
    }
    if (mode === 'patrol' && waypoints.length > 1) {
      if (wpIndex < waypoints.length - 1) wpIndex++;
      else if (loopWaypoints) wpIndex = 0;
    } else if (hasMoveTarget) {
      hasMoveTarget = false;
    }
    if (hasVantage) vetoVantage();
    hasVantage = false;

    // Four failed legs mean the bot is pocketed rather than merely wedged.
    if (stuckStrikes >= 4) {
      if (timeS >= scootUntilS && escapePocket()) stuckStrikes = 0;
      else stuckStrikes = 2;
    }
  }

  function resetStepIntent(input: AiInput): boolean {
    allyYielding = false;
    allyAvoidingId = null;
    allyClosestM = Infinity;
    input.actionBits = 0;
    const combat = entity.combat;
    if (!combat?.destroyed) return false;
    input.throttle = 0;
    input.steer = 0;
    input.brake = false;
    input.fire = false;
    return true;
  }

  function updateSurvivalMemory(timeS: number): void {
    const combat = entity.combat;
    if (combat?.hp == null) return;
    if (timeS > burstDamageUntilS) burstDamage = 0;
    if (combat.hp < lastHp) {
      burstDamage += lastHp - combat.hp;
      burstDamageUntilS = timeS + BURST_RETREAT_WINDOW_S;
    }
    lastHp = combat.hp;
  }

  function updatePerception(dt: number, timeS: number): void {
    losTimer -= dt;
    probeTimer -= dt;
    coverTimer -= dt;
    errTimer -= dt;
    obstacleTimer -= dt;
    routeTimer -= dt;
    if (obstacleTimer <= 0) {
      obstacles = deps.getObstacles();
      obstacleTimer = OBSTACLE_REFRESH_S;
    }
    if (losTimer <= 0) {
      acquireTarget(timeS);
      losTimer = LOS_INTERVAL_S * (0.8 + rng() * 0.4);
    }
    if (target) lastEngagedS = timeS;
    if (probeTimer <= 0 && target) {
      runProbes();
      probeTimer = PROBE_INTERVAL_S * (0.8 + rng() * 0.4);
    }
    if (errTimer <= 0) resampleAimError();
    if (mode === 'engage' && target && !losClear) {
      losBlockedT += dt;
      return;
    }
    losBlockedT = 0;
    if (losClear) hasVantage = false;
  }

  function nearestLivingEnemy(): AiEntity | null {
    const enemies = deps.getEnemies();
    const position = entity.state.pos;
    let nearest: AiEntity | null = null;
    let nearestDistanceSq = Infinity;
    // a target left alone for its level is searched for only when no other enemy lives
    let others = false;
    for (let index = 0; index < enemies.length && !others; index++) {
      others = enemyAlive(enemies[index]) && enemies[index].id !== unbearableId;
    }
    for (let index = 0; index < enemies.length; index++) {
      const candidate = enemies[index];
      if (!enemyAlive(candidate) || (others && candidate.id === unbearableId)) continue;
      const dx = candidate.state.pos.x - position.x;
      const dz = candidate.state.pos.z - position.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= nearestDistanceSq) continue;
      nearestDistanceSq = distanceSq;
      nearest = candidate;
    }
    return nearest;
  }

  /** The pre-round-62 leg: the midpoint, then the enemy's 50 m sector, for the local corner-hop router. */
  function routeTowardEnemySector(enemy: AiEntity): void {
    const position = entity.state.pos;
    const sectorX = Math.round(enemy.state.pos.x / 50) * 50;
    const sectorZ = Math.round(enemy.state.pos.z / 50) * 50;
    waypoints.length = 0;
    waypoints.push({ x: (position.x + sectorX) / 2, z: (position.z + sectorZ) / 2 });
    waypoints.push({ x: sectorX, z: sectorZ });
    wpIndex = 0;
    autoPatrolBuilt = true;
    loopWaypoints = false;
    if (mode === 'seekCover') mode = 'engage';
  }

  // Round 62 pacing (2026-09-24, server/battlePacing: Urban seeds 0 and 2, Ruinspires seed 3). The survivor had
  // no target for 200-400 s and the 8 s no-contact search re-routed it every window to the same midpoint it
  // could not reach among the blocks and ruins — the corner-hop router sees one box 85 m ahead, and the
  // midpoint of Urban seed 0's search stood inside a building. A search leg is now planned over the match's
  // navigation grid (deps.planRoute: the same planner that lays the opening routes), so its waypoints are cells
  // the hull can actually reach; a goal in another connected component is skipped, not driven at. The goals
  // rotate — the enemy's sector, the last sighting, the mission objective, then a sweep ring round the sector
  // whose bearing turns with every leg, then a wider ring — and a leg is given up only on its own evidence:
  // its route consumed without contact, SEARCH_LEG_STRIKES stuck strikes, or its time budget spent. Contact
  // resets the escalation; a bot without contact therefore keeps moving toward where the enemy can be.
  function searchCandidateGoal(kind: string, enemy: AiEntity, out: Position2): boolean {
    const position = entity.state.pos;
    if (kind === 'sector') {
      out.x = Math.round(enemy.state.pos.x / 50) * 50;
      out.z = Math.round(enemy.state.pos.z / 50) * 50;
      return true;
    }
    if (kind === 'seen') {
      if (nowS - lastSeenAtS > SEARCH_SEEN_MAX_AGE_S) return false;
      out.x = lastSeen.x;
      out.z = lastSeen.z;
      return true;
    }
    if (kind === 'objective') {
      const objective = getObjective ? getObjective() : null;
      if (!objective) return false;
      out.x = objective.x;
      out.z = objective.z;
      return true;
    }
    // 'sweep' / 'wide': a ring round the enemy's sector; the first bearing faces the hull, the next ones
    // alternate sides further round (0, +45°, -45°, +90°, …) so consecutive legs look from different sides
    const radius = kind === 'wide' ? SEARCH_WIDE_RING_M : SEARCH_SWEEP_RING_M;
    const base = Math.atan2(position.x - enemy.state.pos.x, position.z - enemy.state.pos.z);
    const k = searchSweepIndex++;
    const angle = base + Math.ceil(k / 2) * (TAU / 8) * (k % 2 ? 1 : -1);
    out.x = clamp(enemy.state.pos.x + Math.sin(angle) * radius, -470, 470);
    out.z = clamp(enemy.state.pos.z + Math.cos(angle) * radius, -470, 470);
    return !hf.getNormalAt || hf.getNormalAt(out.x, out.z).y >= SPOT_NORMAL_Y_MIN;
  }

  function setSearchWaypoints(route: ReadonlyArray<readonly [number, number]>): void {
    waypoints.length = 0;
    for (let i = 0; i < route.length; i++) waypoints.push({ x: route[i][0], z: route[i][1] });
    wpIndex = 0;
    autoPatrolBuilt = true;
    loopWaypoints = false;
  }

  function startSearchLeg(kind: string, goalX: number, goalZ: number, routeLengthM: number, timeS: number): void {
    searching = true;
    searchKind = kind;
    searchGoal.x = goalX;
    searchGoal.z = goalZ;
    searchLegs++;
    searchLegStartS = timeS;
    searchLegBudgetS = clamp(SEARCH_LEG_MIN_S + routeLengthM / SEARCH_LEG_SPEED_MPS, SEARCH_LEG_MIN_S, SEARCH_LEG_MAX_S);
    searchLegStartDistM = Math.hypot(goalX - entity.state.pos.x, goalZ - entity.state.pos.z);
    searchStrikesAtStart = strikeEvents;
    searchNextCheckS = timeS + SEARCH_CHECK_S;
    pressUntilS = timeS + STALEMATE_PUSH_S;
    hasMoveTarget = false;
    hasCoverPoint = false;
    hasVantage = false;
    if (mode === 'seekCover' || mode === 'engage') mode = 'patrol';
  }

  function beginSearchLeg(enemy: AiEntity, timeS: number): void {
    const position = entity.state.pos;
    const order = SEARCH_ORDER[Math.min(searchFailures, SEARCH_ORDER.length - 1)];
    const goal = searchScratch;
    for (let i = 0; i < order.length; i++) {
      const kind = order[i];
      if (!searchCandidateGoal(kind, enemy, goal)) continue;
      let routeLength = Math.hypot(goal.x - position.x, goal.z - position.z);
      if (routeLength < SEARCH_GOAL_ARRIVE_M) continue;
      if (deps.planRoute) {
        const route = deps.planRoute(position, goal);
        if (!route.length) continue; // another connected component: not a goal
        const end = route[route.length - 1];
        if (kind !== 'wide' && Math.hypot(end[0] - goal.x, end[1] - goal.z) > SEARCH_PROJECTION_M) continue;
        setSearchWaypoints(route);
        routeLength = 0;
        let previousX = position.x;
        let previousZ = position.z;
        for (let p = 0; p < route.length; p++) {
          routeLength += Math.hypot(route[p][0] - previousX, route[p][1] - previousZ);
          previousX = route[p][0];
          previousZ = route[p][1];
        }
      } else {
        waypoints.length = 0;
        waypoints.push({ x: (position.x + goal.x) / 2, z: (position.z + goal.z) / 2 });
        waypoints.push({ x: goal.x, z: goal.z });
        wpIndex = 0;
        autoPatrolBuilt = true;
        loopWaypoints = false;
      }
      startSearchLeg(kind, goal.x, goal.z, routeLength, timeS);
      return;
    }
    // nothing plans from here (a courtyard the 25 m grid reads as solid): the local router gets the old leg
    routeTowardEnemySector(enemy);
    const sector = waypoints[waypoints.length - 1];
    startSearchLeg('direct', sector.x, sector.z, Math.hypot(sector.x - position.x, sector.z - position.z), timeS);
  }

  function updateSearchLeg(enemy: AiEntity, timeS: number): void {
    if (timeS < searchNextCheckS) return;
    searchNextCheckS = timeS + SEARCH_CHECK_S;
    pressUntilS = timeS + STALEMATE_PUSH_S; // the search keeps the pressure semantics of the old push windows
    const position = entity.state.pos;
    const last = waypoints.length ? waypoints[waypoints.length - 1] : null;
    const consumed = !last || (wpIndex >= waypoints.length - 1
      && Math.hypot(last.x - position.x, last.z - position.z) < ARRIVE_DIST_M * 2);
    const stuck = strikeEvents - searchStrikesAtStart >= SEARCH_LEG_STRIKES;
    const overBudget = timeS - searchLegStartS > searchLegBudgetS;
    const enemyMoved = searchKind === 'sector'
      && Math.hypot(enemy.state.pos.x - searchGoal.x, enemy.state.pos.z - searchGoal.z) > 120;
    if (!consumed && !stuck && !overBudget && !enemyMoved) return;
    // a leg that ran out of time but halved its distance to the goal is progress, not a failure: it is
    // re-planned from here toward the same goals rather than rotated away from them
    const progressed = overBudget && !stuck && !consumed
      && Math.hypot(searchGoal.x - position.x, searchGoal.z - position.z) < searchLegStartDistM * 0.5;
    if ((consumed || stuck || overBudget) && !progressed) searchFailures++; // the leg ended without contact
    beginSearchLeg(enemy, timeS);
  }

  function updateStalematePolicy(timeS: number): void {
    const hasContact = !!(target && enemyAlive(target))
      || timeS - lastSeenAtS < TARGET_MEMORY_S + 6;
    if (hasContact) {
      if (searching) {
        searching = false;
        searchFailures = 0;
      }
      if (timeS - lastFiredAtS > STALEMATE_SILENT_S && timeS >= pressUntilS) {
        pressUntilS = timeS + STALEMATE_PUSH_S;
        hasMoveTarget = false;
        hasCoverPoint = false;
        if (mode === 'seekCover' || mode === 'patrol') mode = 'engage';
        if (target && !losClear && findVantage()) hasVantage = true;
        // the push's halt waits until the gun may fire on the contact (the reaction gate; see SETTLE_STARVED_S)
        if (target && losClear && !conserving && !emptyRack && timeS - acquiredAtS >= tier.reactionS) {
          settleUntilS = timeS + 3.5;
        }
      }
      return;
    }
    // Deployment limits distant opening shots, not movement toward the battle.
    const maySearch = timeS >= 25 && timeS - lastFiredAtS > 25 && !emptyRack; // an empty rack
    if (!maySearch) return;                                                                   // retires, it does not hunt
    const enemy = nearestLivingEnemy();
    if (!enemy) return;
    if (!searching) beginSearchLeg(enemy, timeS);
    else updateSearchLeg(enemy, timeS);
  }

  function currentTargetDistance(): number {
    if (!target) return Infinity;
    const position = entity.state.pos;
    return Math.hypot(
      target.state.pos.x - position.x,
      target.state.pos.z - position.z,
    );
  }

  function beginScoot(durationS: number, line = 0, arc = false): void {
    scootUntilS = nowS + durationS;
    scootLine = line;
    arcScoot = arc;
    hasMoveTarget = false;
    hasCoverPoint = false;
    if (mode === 'seekCover') mode = 'engage';
    beginLeg(2, scootPoint.x - entity.state.pos.x, scootPoint.z - entity.state.pos.z);
    if (arc) nudgeUntilS = -1; // the arc limit's leg owns the hull: a back-up under way ends (see LEG_DEAD_M)
  }

  /** A back-up (kind 1) or a scoot leg (kind 2) begins here, trying the travel (dx, dz) (see LEG_DEAD_M). */
  function beginLeg(kind: number, dx: number, dz: number): void {
    const st = entity.state;
    const length = Math.hypot(dx, dz);
    legKind = kind;
    leg.x = st.pos.x;
    leg.z = st.pos.z;
    leg.yaw = st.yaw;
    leg.atS = nowS;
    leg.dirX = length > 1e-6 ? dx / length : 0;
    leg.dirZ = length > 1e-6 ? dz / length : 0;
    leg.driven = kind === 1;
  }

  /** Is travel along the unit vector (dx, dz) one a dead leg tried, while that is kept out of the legs? */
  function travelBlocked(dx: number, dz: number): boolean {
    return nowS < blockedTravel.untilS && dx * blockedTravel.x + dz * blockedTravel.z > DEAD_LEG_AWAY_COS;
  }

  /**
   * Judge the leg under way once it is due (a back-up at its end, a scoot leg LEG_DEAD_CHECK_S in or at its end): one
   * that went nowhere is a stuck strike, its travel is kept out of the next legs for DEAD_LEG_AWAY_S (no back-up into
   * the same face, no relocation cell that way), and a scoot leg ends so the next pick can go another way. A scoot leg
   * nothing drove is not judged.
   */
  function updateDeadLegs(timeS: number): void {
    if (arcScoot && timeS >= scootUntilS) arcScoot = false;
    if (legKind === 0) return;
    if (legKind === 2) {
      const ended = timeS >= scootUntilS;
      if (!leg.driven) {
        if (ended) legKind = 0;
        return;
      }
      if (!ended && timeS - leg.atS < LEG_DEAD_CHECK_S) return;
    } else if (timeS < nudgeUntilS) {
      return;
    }
    const st = entity.state;
    const kind = legKind;
    legKind = 0;
    if (Math.hypot(st.pos.x - leg.x, st.pos.z - leg.z) >= LEG_DEAD_M
      || Math.abs(wrapAngle(st.yaw - leg.yaw)) >= LEG_DEAD_TURN_RAD) return;
    deadLegs++;
    stuckStrikes++;
    strikeEvents++;
    blockedTravel.x = leg.dirX;
    blockedTravel.z = leg.dirZ;
    blockedTravel.untilS = timeS + DEAD_LEG_AWAY_S;
    if (kind === 2 && timeS < scootUntilS) {
      scootUntilS = -1;
      arcScoot = false;
    }
  }

  function updateShotRelocation(combat: CombatState | undefined, timeS: number): void {
    const reloadTime = combat?.reload?.t ?? 0;
    if (reloadTime > prevReloadT + 1) {
      const position = entity.state.pos;
      if (Math.hypot(position.x - spotPos.x, position.z - spotPos.z) > 22) {
        spotPos.x = position.x;
        spotPos.z = position.z;
        shotsFromSpot = 0;
      }
      shotsFromSpot++;
      if (target) { // a round left the gun at the target: it counts against this spot until a hit reports back
        if (target.id !== missStreakTargetId
            || Math.hypot(position.x - missSpot.x, position.z - missSpot.z) > MISS_SPOT_M) {
          missStreakTargetId = target.id;
          missStreak = 0;
          missSpot.x = position.x;
          missSpot.z = position.z;
        }
        missStreak++;
        missLastShotS = timeS;
      }
      const shouldScoot = tune.scootAfter > 0
        && shotsFromSpot >= tune.scootAfter
        && timeS >= scootUntilS
        && !targetPassive(timeS); // round 60 pacing: a solution on a passive target is kept, not scooted away from
      if (shouldScoot && casemate) {
        const line = pickLineScoot();
        if (line) beginScoot(CASEMATE_SCOOT_S, line);
      } else if (shouldScoot && pickScoot()) beginScoot(14);
    }
    prevReloadT = reloadTime;
  }

  function updateProbeRelocation(dt: number, timeS: number): void {
    // an empty rack's probe finds no zone because no round is aboard, not because the hull is masked: its scoots cut
    // every ram run short (see RAM_FINISH_MARGIN)
    probeMissT = probeMiss && target && losClear && !emptyRack ? probeMissT + dt : 0;
    if (probeMissT <= 6 || timeS < scootUntilS) return;
    if (pickScoot()) beginScoot(10);
    probeMissT = 0;
  }

  function hasDisabledTrack(combat: CombatState | undefined): boolean {
    const modules = combat?.modules;
    return modules?.trackL?.state === 'red' || modules?.trackR?.state === 'red';
  }

  function shouldFallback(
    combat: CombatState | undefined,
    opponent: AiEntity,
    timeS: number,
    distance: number,
  ): boolean {
    if (timeS < fallbackUntilS || timeS < fallbackCdS || mode !== 'engage' || !getAllies) {
      return false;
    }
    // round 60 pacing: nothing is shooting — a passive target is finished, not retreated from
    if (targetPassive(timeS) && timeS >= underFireUntilS) return false;
    const targetHealth = opponent.combat;
    if (targetHealth?.maxHp && targetHealth.hp / targetHealth.maxHp < 0.18) return false;
    if (distance >= roleHoldR() * 1.35) return false;
    const hpFraction = combat?.maxHp ? combat.hp / combat.maxHp : 1;
    const reloading = !!combat?.reload && combat.reload.t > 0.8;
    const burstHit = !!combat?.maxHp && timeS <= burstDamageUntilS
      && burstDamage / combat.maxHp >= BURST_RETREAT_FRAC
      && (reloading || outnumberedSolo());
    return hpFraction < FALLBACK_HP_FRAC[role] || hasDisabledTrack(combat) || burstHit;
  }

  function nearestSupport(): AiEntity | null {
    if (!getAllies) return null;
    const position = entity.state.pos;
    let nearest: AiEntity | null = null;
    let nearestDistanceSq = Infinity;
    const friends = getAllies();
    for (let index = 0; index < friends.length; index++) {
      const friend = friends[index];
      if (!friend?.state) continue;
      const dx = friend.state.pos.x - position.x;
      const dz = friend.state.pos.z - position.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq <= 25 * 25 || distanceSq >= nearestDistanceSq) continue;
      nearestDistanceSq = distanceSq;
      nearest = friend;
    }
    return nearestDistanceSq < 400 * 400 ? nearest : null;
  }

  function setUnsupportedFallback(opponent: AiEntity): void {
    const position = entity.state.pos;
    let awayX = position.x - opponent.state.pos.x;
    let awayZ = position.z - opponent.state.pos.z;
    const length = Math.hypot(awayX, awayZ) || 1;
    awayX /= length;
    awayZ /= length;
    fallbackPoint.x = clamp(position.x + awayX * 75, -470, 470);
    fallbackPoint.z = clamp(position.z + awayZ * 75, -470, 470);
    fallbackReverse = true;
  }

  function setSupportedFallback(support: AiEntity): void {
    const position = entity.state.pos;
    fallbackPoint.x = support.state.pos.x;
    fallbackPoint.z = support.state.pos.z;
    const supportYaw = Math.atan2(
      fallbackPoint.x - position.x,
      fallbackPoint.z - position.z,
    );
    fallbackReverse = casemate || Math.abs(wrapAngle(supportYaw - entity.state.yaw)) > Math.PI * 0.55;
  }

  function maybeStartFallback(
    combat: CombatState | undefined,
    timeS: number,
    distance: number,
  ): void {
    if (!target || !shouldFallback(combat, target, timeS, distance)) return;
    const support = nearestSupport();
    if (support) setSupportedFallback(support);
    else setUnsupportedFallback(target);
    fallbackUntilS = timeS + FALLBACK_S;
    fallbackCdS = timeS + FALLBACK_CD_S;
    burstDamage = 0;
    hasMoveTarget = false;
    hasCoverPoint = false;
  }

  /**
   * Round 62 pacing (2026-09-24): the empty rack. The standard ruleset resupplies nothing (matchRuleset.ts:
   * ammo 'spec', no respawn), so a bot whose slots are all at zero has two options the rules already model —
   * the kinetic ram law both authorities apply to enemy contacts (damage.ts ramDamage), or retiring. It rams
   * only when the law says the exchange is survivable: the rams a kill needs, at the closing speed a straight
   * run reaches, cost at most RAM_SELF_BUDGET_FRAC of its own hull. Otherwise it keeps EMPTY_RETIRE_M from
   * every enemy and leaves the finish to its team. Against a passive target the run that finishes it is judged,
   * and capped (ramCapMps), at the slowest closing speed that still finishes it (see RAM_FINISH_MARGIN).
   */
  function ramWorthAgainst(opponent: AiEntity): boolean {
    ramCapMps = Infinity;
    const mine = entity.combat;
    const theirs = opponent.combat;
    if (!mine || !theirs || theirs.destroyed) return false;
    const closing = Math.min(RAM_MAX_CLOSING_MPS,
      ((spec.topSpeedKmh || 0) / 3.6) * RAM_APPROACH_EFFICIENCY);
    const split = ramDamage(spec.weightTons, opponent.spec.weightTons, closing);
    if (!(split.toB > 0)) return false;
    const hp = Math.max(1, theirs.hp);
    const ramsNeeded = Math.ceil(hp / split.toB);
    if (ramsNeeded === 1 && opponent === target && targetPassive(nowS)) {
      const need = hp * RAM_FINISH_MARGIN;
      if (need < split.toB) {
        // the pool grows monotonically with the closing speed: bisect for the slowest run whose share reaches `need`
        let lo = 0, hi = closing;
        for (let i = 0; i < 16; i++) {
          const mid = (lo + hi) * 0.5;
          if (ramDamage(spec.weightTons, opponent.spec.weightTons, mid).toB >= need) hi = mid;
          else lo = mid;
        }
        const cap = Math.min(closing, Math.max(hi, RAM_CAP_MIN_MPS));
        const run = ramDamage(spec.weightTons, opponent.spec.weightTons, cap);
        if (!(run.toA < mine.hp * RAM_SELF_BUDGET_FRAC)) return false;
        ramCapMps = cap;
        return true;
      }
    }
    return ramsNeeded * split.toA < mine.hp * RAM_SELF_BUDGET_FRAC;
  }

  /** The spent-rack dwell and verdict (see RACK_SPENT_S). */
  function updateSpentRack(dt: number, timeS: number): void {
    if (rackSpentId !== null && timeS >= rackSpentUntilS) rackSpentId = null;
    if (!target || !enemyAlive(target)) return;
    if (target.id !== rackDwellId) {
      rackDwellId = target.id;
      rackSpentT = 0;
    }
    if (target.id === rackSpentId) return;
    // a shut gate on visible zones is evidence against the rack; an open one clears it; no sight proves nothing
    if (penGateOk || heWorth) rackSpentT = 0;
    else if (losClear && !probeMiss && currentTargetDistance() <= RACK_SPENT_RANGE_M) rackSpentT += dt;
    if (rackSpentT < RACK_SPENT_S) return;
    rackSpentT = 0;
    rackSpentId = target.id;
    rackSpentUntilS = timeS + RACK_SPENT_FOR_S;
    rackSpentVerdicts++;
  }

  /** A living teammate with a round aboard: the retirement leaves the finish to it (wrecks and empty racks cannot). */
  function teammateCanFire(): boolean {
    if (!getAllies) return false;
    const friends = getAllies();
    for (let i = 0; i < friends.length; i++) {
      const friend = friends[i];
      if (!friend || friend === entity || friend.modeActive === false || friend.combat?.destroyed) continue;
      const ammo = friend.combat?.ammo;
      if (!Array.isArray(ammo)) return true; // no rack ledger: an armed hull
      for (let slot = 0; slot < ammo.length; slot++) if ((ammo[slot] || 0) > 0) return true;
    }
    return false;
  }

  /** The last run (see EMPTY_RETIRE_M): nobody left to finish the target, and it will not come to this hull. */
  function lastRunDue(timeS: number): boolean {
    return targetPassive(timeS) && !teammateCanFire();
  }

  function updateEmptyRack(dt: number, timeS: number): void {
    updateSpentRack(dt, timeS);
    emptyRack = firstAvailableSlot() < 0 || (!!target && target.id === rackSpentId);
    if (!emptyRack) {
      ramming = false;
      lastRun = false;
      ramCapMps = Infinity;
      return;
    }
    if (ramming && timeS < ramCommitUntilS && target && enemyAlive(target)) return; // a run is committed
    const wasRamming = ramming;
    const canRun = !!target && enemyAlive(target) && losClear;
    ramming = canRun && ramWorthAgainst(target!);
    // ramWorthAgainst left the cap at Infinity on a refusal: the last run is driven at full speed
    lastRun = canRun && !ramming && lastRunDue(timeS);
    if (lastRun) {
      ramming = true;
      if (!wasRamming) lastRuns++;
    }
    if (ramming) {
      if (!wasRamming) ramRuns++;
      ramCommitUntilS = timeS + 4; // re-judge the exchange every few seconds, not every tick
      hasMoveTarget = false;
      hasCoverPoint = false;
      hasVantage = false;
      scootUntilS = -1;
      settleUntilS = -1;
      passivePressing = false;
      if (mode === 'seekCover' || mode === 'flank') mode = 'engage';
    }
  }

  let squadThinkAtS = 0, squadFlankAtS = -Infinity;
  function updateSquadManeuver(timeS: number, distance: number): void {
    if (timeS < squadThinkAtS) return;
    squadThinkAtS = timeS + 1;
    if (!target || !losClear || !getAllies || orderActive() || getObjective?.()?.mission || emptyRack
        || mode !== 'engage' || distance < 70 || distance > 280
        || timeS < squadFlankAtS + 22 || (entity.combat?.hp ?? 1) / (entity.combat?.maxHp ?? 1) < .45) return;
    // The slow/armoured hull pins the target while one faster teammate changes
    // angle. Elect by mobility then ID, so controllers agree without messages
    // or random side choices. Existing flanks count as a commitment.
    let partners = 0, betterFlankers = 0, alreadyFlanking = false;
    const mobility = (spec.topSpeedKmh ?? 40) + (role === 'flanker' ? 20 : 0);
    for (const friend of getAllies()) {
      if (!friend || friend === entity || friend.modeActive === false || friend.combat?.destroyed) continue;
      const ctl = (friend as ControllerOwnedEntity).aiCtl ?? (friend as ControllerOwnedEntity).ai;
      if (ctl?.targetId !== target.id || Math.hypot(friend.state.pos.x - entity.state.pos.x, friend.state.pos.z - entity.state.pos.z) > 220) continue;
      partners++;
      if (ctl.state === 'flank') alreadyFlanking = true;
      if ((friend.combat?.hp ?? 1) / (friend.combat?.maxHp ?? 1) < .45) continue;
      const rank = (friend.spec.topSpeedKmh ?? 40) + (roleOf(friend.spec) === 'flanker' ? 20 : 0);
      if (rank > mobility || (rank === mobility && friend.id < entity.id)) betterFlankers++;
    }
    if (!partners || betterFlankers || alreadyFlanking) return;
    squadFlankAtS = timeS;
    startFlank(timeS);
  }

  /** Is the target on another level the gun cannot be laid on from here (see ELEVATION_LOCK_S)? */
  function targetOffLevel(candidate: AiEntity): boolean {
    const position = entity.state.pos, other = candidate.state.pos;
    const rise = other.y - position.y;
    if (Math.abs(rise) < ELEVATION_LEVEL_M) return false;
    return !withinGunArc(Math.atan2(rise, Math.max(1, Math.hypot(other.x - position.x, other.z - position.z))));
  }

  function endLevelRoute(): void {
    levelRouting = false;
    levelRouteTargetId = null;
    waypoints.length = 0;
    wpIndex = 0;
  }

  function markUnbearable(candidate: AiEntity, timeS: number): void {
    unbearableId = candidate.id;
    unbearableUntilS = timeS + UNBEARABLE_S;
    unbearableVerdicts++;
  }

  /** A route to the target's own level, when the grid has one short enough: the hull drives it (driveCurrentMode). */
  function beginLevelRoute(candidate: AiEntity, timeS: number): boolean {
    if (!deps.planRoute) return false;
    const position = entity.state.pos;
    levelGoal.x = candidate.state.pos.x;
    levelGoal.z = candidate.state.pos.z;
    levelGoal.y = candidate.state.pos.y;
    const route = deps.planRoute(position, levelGoal, LEVEL_ROUTE_OPTIONS);
    if (!route.length) return false;
    let length = 0, previousX = position.x, previousZ = position.z;
    for (let i = 0; i < route.length; i++) {
      length += Math.hypot(route[i][0] - previousX, route[i][1] - previousZ);
      previousX = route[i][0];
      previousZ = route[i][1];
    }
    if (length > LEVEL_ROUTE_MAX_M) return false;
    setSearchWaypoints(route);
    levelRouting = true;
    levelRouteTargetId = candidate.id;
    levelRouteUntilS = timeS + length / LEVEL_ROUTE_SPEED_MPS + LEVEL_ROUTE_SLACK_S;
    levelRouteStrikes = strikeEvents;
    levelRoutes++;
    hasMoveTarget = false;
    hasCoverPoint = false;
    hasVantage = false;
    scootUntilS = -1;
    settleUntilS = -1;
    passivePressing = false;
    return true;
  }

  /** The other-level verdict and the route that changes level (see ELEVATION_LOCK_S). */
  function updateElevationLock(dt: number, timeS: number): void {
    if (unbearableId !== null && timeS >= unbearableUntilS) unbearableId = null;
    if (levelRouting) {
      const lost = !target || !enemyAlive(target) || target.id !== levelRouteTargetId;
      // the route ends on the target's level with the target in sight (the gun fires on the way whenever it bears;
      // walking away from a cliff brings the angle into the arc long before the deck comes into view, and the top
      // of a ramp is no place to stop)
      const onLevel = !lost && Math.abs(target!.state.pos.y - entity.state.pos.y) < ELEVATION_LEVEL_M;
      if (lost || (onLevel && losClear)) {
        endLevelRoute();
        return;
      }
      const last = waypoints[waypoints.length - 1];
      const usedUp = !last || (wpIndex >= waypoints.length - 1
        && Math.hypot(last.x - entity.state.pos.x, last.z - entity.state.pos.z) < ARRIVE_DIST_M * 2);
      if (usedUp || timeS >= levelRouteUntilS || strikeEvents - levelRouteStrikes >= LEVEL_ROUTE_STRIKES) {
        endLevelRoute();
        // arrived on its level, the ordinary engagement takes over; short of it, the target is left alone
        if (!onLevel) markUnbearable(target!, timeS);
      }
      return;
    }
    if (!target || !enemyAlive(target) || !targetOffLevel(target)) {
      elevationLockT = 0;
      return;
    }
    elevationLockT += dt;
    if (elevationLockT < ELEVATION_LOCK_S) return;
    elevationLockT = 0;
    // a mission objective keeps the hull; only a free hull takes the long way to another level
    if (getObjective?.()?.mission || !beginLevelRoute(target, timeS)) markUnbearable(target, timeS);
  }

  function updateDoctrine(
    combat: CombatState | undefined,
    dt: number,
    timeS: number,
    targetDistance: number,
  ): void {
    updateElevationLock(dt, timeS);
    updateEmptyRack(dt, timeS);
    updateObjectiveShift(dt);
    updatePassivePress(dt, timeS, targetDistance);
    updateShotRelocation(combat, timeS);
    updateProbeRelocation(dt, timeS);
    updatePenDeniedManeuver(dt, timeS);
    maybeStartFallback(combat, timeS, targetDistance);
    updateSquadManeuver(timeS, targetDistance);
  }

  // Round 48 pacing (2026-09-24, Frosthollow seed 3 of server/battlePacing): a lone Strv 103 stood 263 m from
  // the idle host for six minutes. Every probed zone of the M1A2's front came back under the 0.9 penetration
  // gate, its two HE rounds were spent, and since no shell left the gun no non-penetration event ever reached
  // notifyShellResult to start the flank — a stalemate the fire discipline itself created. A tanker who cannot
  // beat the armour he is shown changes the geometry: after PEN_DENIED_FLANK_S of a closed gate against a live,
  // visible target the bot starts the same flank two non-pens would (a side aspect, and the kinetic round comes
  // inside 200 m). The dwell restarts after each flank window, so a target that keeps its nose on the bot is
  // flanked again from the other side rather than stared at. Only a target that HOLDS its aspect (hull speed
  // under 0.5 m/s) arms the dwell: a moving hull shows new plates on its own, and flanking it on every closed
  // probe turned the casemates into perpetual pivots (the 124-battle receipt: no fewer timeouts, more churn).
  function updatePenDeniedManeuver(dt: number, timeS: number): void {
    const canShootHe = chosenSlot === heSlot && slotHasAmmo(heSlot) && heWorth;
    const targetHolds = !!target && Math.abs(target.state.speed ?? 0) < 0.5;
    // an empty or spent rack rams or retires (driveEmptyRack): a flank to open the gate has nothing to fire
    const denied = targetHolds && losClear && !penGateOk && !canShootHe && mode !== 'flank' && !emptyRack;
    penDeniedT = denied ? penDeniedT + dt : 0;
    if (penDeniedT < PEN_DENIED_FLANK_S || timeS < scootUntilS || passivePressing) return;
    penDeniedT = 0;
    startFlank(timeS);
  }

  // Round 60 pacing (2026-09-24, server/battlePacing: Tidegate Polders 3/4, Whiteout 2/4, one seed on eight other
  // maps). The receipt's idle host never moves and never fires, and the last bot fought it from its hold band at
  // 165-300 m: with the tier's fire-control error the shells flew over the turret or dug in short (winter seed 2:
  // 25 rounds, 8 on the hull; ruinspires seed 2: 33 rounds, 3 on the hull), the rest plinked the glacis, and nine
  // of the fourteen capped battles ended with the survivor's racks empty — two bots with no ammunition circling a
  // hull they could never finish. Shoot-and-scoot legs, the low-health fallback and the stalemate settle holds all
  // exist to survive RETURN FIRE; against a target that has held its hull still and its gun silent for
  // PASSIVE_TARGET_*_S there is nothing to survive, so a bot whose own shells have stopped penetrating drives to a
  // point-blank side aspect (PASSIVE_PRESS_STANDOFF_M, PASSIVE_PRESS_ASPECT_RAD) and finishes it from there. The
  // moment the target moves or fires the press ends and every ordinary rule resumes — an active player is never
  // charged, and the deployment window keeps the opening intact.
  function updateTargetActivity(dt: number, timeS: number): void {
    if (!target || !enemyAlive(target)) {
      targetActivityId = null;
      targetStillS = 0;
      return;
    }
    if (target.id !== targetActivityId) {
      targetActivityId = target.id;
      targetStillS = 0;
      targetLastShotS = timeS;
      lastPenAtS = timeS;
      prevTargetReloadT = target.combat?.reload?.t ?? 0;
    }
    // a hull this bot's ram run is pushing has not moved itself (see RAM_CONTACT_HOLD_S)
    const still = (Math.abs(target.state.speed ?? 0) < 0.5 && Math.abs(target.state.yawRate ?? 0) < 0.05)
      || (ramming && timeS < ramContactUntilS && ramContactId === target.id);
    targetStillS = still ? targetStillS + dt : 0;
    const reloadT = target.combat?.reload?.t ?? 0;
    if (reloadT > prevTargetReloadT + 1) targetLastShotS = timeS; // a shell left its gun
    prevTargetReloadT = reloadT;
  }

  function targetPassive(timeS: number): boolean {
    return !!target && targetStillS >= PASSIVE_TARGET_STILL_S
      && timeS - targetLastShotS >= PASSIVE_TARGET_SILENT_S;
  }

  /** The press point's lane: the gun, standing at (x, z) `distance` m from the target, reaches its hull. */
  function pressLaneClear(x: number, z: number, distance: number): boolean {
    if (!target) return false;
    const tp = target.state.pos;
    const gunY = hf.getHeightAt(x, z) + selfGunM;
    const hullY = tp.y + target.spec.dims.heightM * PASSIVE_PRESS_LANE_HULL_FRAC;
    return withinGunArc(Math.atan2(hullY - gunY, distance)) && hasLos(x, gunY, z, tp.x, hullY, tp.z);
  }

  /** The flank exemption's lane from where the hull stands (see PASSIVE_PRESS_MISSES), re-tested at a fixed cadence. */
  function flankLaneHolds(timeS: number, distance: number): boolean {
    if (timeS - flankLaneCheckS >= FLANK_LANE_RECHECK_S) {
      flankLaneCheckS = timeS;
      flankLaneClear = pressLaneClear(entity.state.pos.x, entity.state.pos.z, distance);
    }
    return flankLaneClear;
  }

  /** Main-gun rounds in a row have left the gun without reaching the target (see PASSIVE_PRESS_MISSES). */
  function missedOut(timeS: number): boolean {
    const st = entity.state;
    return !!target && missStreakTargetId === target.id && missStreak >= PASSIVE_PRESS_MISSES
      && timeS - missLastShotS >= MISS_SETTLE_S && Math.hypot(st.pos.x - missSpot.x, st.pos.z - missSpot.z) <= MISS_SPOT_M;
  }

  /** Keep (x, z) out of the press picks until untilS, in the veto slot that frees soonest. */
  function vetoPressPoint(x: number, z: number, untilS: number): void {
    let slot = pressVetoes[0];
    for (const veto of pressVetoes) if (veto.untilS < slot.untilS) slot = veto;
    slot.x = x;
    slot.z = z;
    slot.untilS = untilS;
  }

  function pressPointVetoed(x: number, z: number): boolean {
    for (const veto of pressVetoes) if (nowS < veto.untilS && Math.hypot(x - veto.x, z - veto.z) < 12) return true;
    return false;
  }

  /** Give up the spot the misses were fired from: no press point near it for a while, and a fresh count. */
  function giveUpMissedSpot(x: number, z: number, timeS: number): void {
    vetoPressPoint(x, z, timeS + 120);
    missStreak = 0;
    missVerdicts++;
  }

  /** The side-aspect point nearer to where this hull already stands; the far side, then (round 67) land-only
   * bearings around each side aspect, then the straight approach. */
  function pickPressPoint(): boolean {
    if (!target) return false;
    const st = entity.state;
    const tp = target.state.pos;
    const bearing = Math.atan2(st.pos.x - tp.x, st.pos.z - tp.z);   // target → self
    const nose = target.state.yaw;
    const nearSide = Math.abs(wrapAngle(nose + PASSIVE_PRESS_ASPECT_RAD - bearing))
      <= Math.abs(wrapAngle(nose - PASSIVE_PRESS_ASPECT_RAD - bearing)) ? 1 : -1;
    // two rings (the standoff, then closer); on each: near side, far side, the fallback bearings, straight in
    for (let ring = 0; ring < 2; ring++) {
      const radius = PASSIVE_PRESS_STANDOFF_M * (ring === 0 ? 1 : 0.65);
      for (let k = 0; k < PASSIVE_PRESS_BEARINGS; k++) {
        let a: number;
        if (k < 2) a = nose + nearSide * (k === 0 ? 1 : -1) * PASSIVE_PRESS_ASPECT_RAD;
        else if (k === PASSIVE_PRESS_BEARINGS - 1) a = bearing;
        else {
          const [side, delta] = PASSIVE_PRESS_FALLBACKS[k - 2];
          a = nose + side * nearSide * (PASSIVE_PRESS_ASPECT_RAD + delta);
        }
        const x = clamp(tp.x + Math.sin(a) * radius, -470, 470);
        const z = clamp(tp.z + Math.cos(a) * radius, -470, 470);
        if (pressPointVetoed(x, z)) continue;
        if (!reachableSpot(x, z)) continue;
        // round 67: a point on water is no press point where the map avoids liquid (the hull faces the target there)
        if (liquidSafe && !liquidSafe(x, z, Math.atan2(tp.x - x, tp.z - z), 0)) continue;
        // Copper Mesa seeds 0/1/3 after the first press: the point at the foot of the host's plateau masked the
        // hull behind the rim — the gun, not the eye, must reach the hull from the press point.
        if (!pressLaneClear(x, z, radius)) continue;
        // the reach deadline survives a restart onto the same point, or a flickering sight line would reset it forever
        const samePoint = Math.hypot(x - pressPoint.x, z - pressPoint.z) <= 12 && nowS - pressPickS < 30;
        if (!samePoint) {
          pressReachByS = nowS + PRESS_REACH_SLACK_S + Math.hypot(x - st.pos.x, z - st.pos.z) / PRESS_REACH_SPEED_MPS;
        }
        pressPickS = nowS;
        pressPoint.x = x;
        pressPoint.z = z;
        passivePressCandidate = ring * 16 + k; // round 67: 0/1 the sides, 2–9 the fallbacks, 10 straight in
        return true;
      }
    }
    return false;
  }

  function updatePassivePress(dt: number, timeS: number, distance: number): void {
    updateTargetActivity(dt, timeS);
    const eligible = targetPassive(timeS) && !!target && losClear && timeS >= deploymentUntilS && !emptyRack;
    if (!eligible) {
      passivePressing = false;
      return;
    }
    const missed = missedOut(timeS);
    if (!passivePressing) {
      if (timeS - lastPenAtS < PASSIVE_PRESS_NO_PEN_S) return;
      // already on its flank at point-blank, with the gun on the hull and its rounds arriving
      if (!missed && distance <= PASSIVE_PRESS_STANDOFF_M + ARRIVE_DIST_M
          && aspectAngle() >= PASSIVE_PRESS_ASPECT_RAD * 0.7 && flankLaneHolds(timeS, distance)) return;
      if (missed) giveUpMissedSpot(missSpot.x, missSpot.z, timeS);
      if (outnumberedSolo() || !pickPressPoint()) return;
      passivePressing = true;
      passivePressRepickS = timeS + PASSIVE_PRESS_REPICK_S;
      passivePresses++;
      if (mode === 'flank' || mode === 'seekCover') mode = 'engage';
      hasMoveTarget = false;
      hasCoverPoint = false;
      hasVantage = false;
      if (!arcScoot) scootUntilS = -1; // (the arc limit's leg runs on: the gun cannot finish anything where it stands)
      settleUntilS = -1;
      return;
    }
    const st = entity.state;
    const atPoint = Math.hypot(pressPoint.x - st.pos.x, pressPoint.z - st.pos.z) < ARRIVE_DIST_M * 2;
    passivePressArcT = atPoint && st.atGunLimit ? passivePressArcT + dt : 0;
    if (timeS >= passivePressRepickS) {
      passivePressRepickS = timeS + PASSIVE_PRESS_REPICK_S;
      // Saltwind seed 3: the casemate stood on its press point with every probed zone masked by the berm the
      // lane ray had cleared. A point whose probe finds no zone is given up for a while and another is picked.
      // Saltwind seed 0: both side points failed and the straight-in point left the gate closed (ratio 0.7 on the
      // glacis) with the hull in plain view — a closed gate held at the press point is the same verdict, and so
      // is a gun pinned at its pitch stop there (Coastal seed 3).
      // A press point its rounds do not reach from (missedOut) is given up the same way.
      // So is a point the hull has not reached in time (see PRESS_REACH_SLACK_S).
      const unreached = !atPoint && timeS >= pressReachByS;
      if (((atPoint && (probeMiss || penDeniedT >= PASSIVE_PRESS_DENIED_S || passivePressArcT >= PASSIVE_PRESS_ARC_S
          || missed)) || unreached) && firstAvailableSlot() >= 0) {
        passivePressArcT = 0;
        if (missed) giveUpMissedSpot(missSpot.x, missSpot.z, timeS);
        vetoPressPoint(pressPoint.x, pressPoint.z, timeS + 120);
        passivePressRepicks++;
        if (unreached) pressUnreached++;
        if (!pickPressPoint()) passivePressing = false;
      }
    }
  }

  function drivePassivePress(input: AiInput): void {
    if (!target) return;
    if (nowS < nudgeUntilS) { // the gun-limit back-up for depression / elevation keeps its meaning while pressing
      driveGunNudge(input);
      return;
    }
    const st = entity.state;
    const tp = target.state.pos;
    if (driveToXZ(input, pressPoint.x, pressPoint.z, 1.0)) {
      faceYaw(input, Math.atan2(tp.x - st.pos.x, tp.z - st.pos.z));
    }
  }

  function updateFriendlyLaneRelocation(timeS: number): void {
    const shouldRelocate = friendlyBlockT >= FRIENDLY_LANE_RELOCATE_S
      && target && losClear && timeS >= scootUntilS && timeS >= friendlyLaneRetryS;
    if (!shouldRelocate) return;
    friendlyLaneSearches++;
    if (!pickFriendlyFireLane()) {
      friendlyLaneRetryS = timeS + FRIENDLY_LANE_RETRY_S;
      return;
    }
    beginScoot(7);
    friendlyBlockT = 0;
    friendlyLaneMoves++;
  }

  function updateGunLaneRelocation(timeS: number): void {
    if (gunLaneBlockedT < 1.5 || !target || !losClear || timeS < scootUntilS) return;
    // Reuse the established gun-limit relocation rather than a new route
    // planner or an accuracy/ammunition bonus. Clear the settle latch so a
    // genuine cover obstruction cannot hold this move in place.
    // Failed searches also require fresh blocked dwell before scanning again.
    gunLaneBlockedT = 0;
    if (!pickFlatCell()) return;
    beginScoot(10);
    settleUntilS = -1;
    gunLaneMoves++;
  }

  // ---- hit reactions (bot philosophy r1) -----------------------------------

  /**
   * Remember an unseen gun as a SUSPECT — never a target. `stampIntel` is true
   * only for event-driven calls (a shot fired, a hit landed): they stamp the
   * shooter's position AT THAT MOMENT as the hull-turn bearing and, when no
   * living target holds the slot, as the remembered contact the hull moves on.
   * The periodic acquisition ticks pass false so a hidden shooter's LIVE
   * position never leaks into the intel while it stays unspotted.
   */
  function noteSuspect(shooter: AiEntity, timeS: number, stampIntel: boolean): void {
    if (!shooter.state) return;
    suspect = shooter;
    suspectUntilS = timeS + UNDER_FIRE_WINDOW_S;
    if (!stampIntel) return;
    const st = entity.state;
    const position = shooter.state.pos;
    threatBearing = Math.atan2(position.x - st.pos.x, position.z - st.pos.z);
    if (!target || !enemyAlive(target)) {
      lastSeen.x = position.x;
      lastSeen.z = position.z;
      lastSeenAtS = timeS;
      if (mode === 'patrol') mode = 'engage'; // move to contact on the flash, gun waits for a spot
    }
  }

  /**
   * Pick what this hull does about the shot that just struck it.
   *  - unseen shooter → COVER behind a crest on the far side from the shot, or a
   *    JINK in the open (both turn the bow onto the shot);
   *  - seen shooter, penetrating hit on a hull under REACT_BACKOFF_HP or a burst
   *    → BACKOFF: reverse to cover (or REACT_BACKOFF_M straight back) with the
   *    bow on the shooter — never turn a flank to it;
   *  - seen shooter more than REACT_ANGLE_RAD off the bow → ANGLE the hull onto
   *    it (REACT_ANGLE_OFFSET_RAD sidescrape offset; casemates face square; a
   *    scout keeps moving, see REACT_BACKOFF_M);
   *  - seen frontal shooter while reloading in the open → JINK.
   */
  function reactToHit(shooter: AiEntity, seen: boolean, info: HitReactionInfo): void {
    if (nowS < reactCdUntilS || !shooter.state) return;
    const st = entity.state;
    const sp = shooter.state.pos;
    threatBearing = Math.atan2(sp.x - st.pos.x, sp.z - st.pos.z);
    const away = threatBearing + Math.PI;
    const ax = Math.sin(away), az = Math.cos(away);
    const cb = entity.combat;
    const hpFrac = cb && cb.maxHp ? cb.hp / cb.maxHp : 1;
    const burst = cb && cb.maxHp ? burstDamage / cb.maxHp : 0;
    const aspect = Math.abs(wrapAngle(threatBearing - st.yaw));
    let pick: Reaction | null = null;
    if (!seen) {
      pick = findCrestAlong(ax, az, sp.x, eyeY(shooter), sp.z, reactPoint, true) ? 'cover' : 'jink';
    } else if (info.damaging !== false && (hpFrac < REACT_BACKOFF_HP || burst >= BURST_RETREAT_FRAC)) {
      pick = 'backoff';
      if (!findCrestAlong(ax, az, sp.x, eyeY(shooter), sp.z, reactPoint, true)) {
        reactPoint.x = st.pos.x + ax * REACT_BACKOFF_M;
        reactPoint.z = st.pos.z + az * REACT_BACKOFF_M;
      }
    } else if (aspect > REACT_ANGLE_RAD && !casemate && role !== 'scout') {
      pick = 'angle';
    } else if (cb && cb.reload && cb.reload.t > 1.0 && !hasCoverPoint) {
      pick = 'jink';
    }
    if (!pick) return;
    reaction = pick;
    reactSide = rng() < 0.5 ? 1 : -1;
    reactUntilS = nowS + REACT_DURATION_S[pick];
    reactCdUntilS = reactUntilS + REACT_COOLDOWN_S;
    reactions++;
    hasMoveTarget = false;
    hasCoverPoint = false;
    if (mode === 'seekCover') mode = 'engage';
  }

  /** Drive the live reaction; true while it owns the hull this tick. */
  function driveReaction(input: AiInput, timeS: number): boolean {
    if (!reaction) return false;
    if (timeS >= reactUntilS) {
      reaction = null;
      return false;
    }
    const st = entity.state;
    switch (reaction) {
      case 'cover':
        if (casemate ? driveOnLine(input, reactPoint.x, reactPoint.z, threatBearing, -0.85)
          : driveToXZ(input, reactPoint.x, reactPoint.z, 1)) reaction = null;
        return true;
      case 'backoff': {
        const dx = reactPoint.x - st.pos.x, dz = reactPoint.z - st.pos.z;
        if (dx * dx + dz * dz < 36) {
          reaction = null;
          return false;
        }
        reverseFacing(input, threatBearing, -0.85);
        return true;
      }
      case 'angle': {
        const want = threatBearing + reactSide * REACT_ANGLE_OFFSET_RAD;
        faceYaw(input, want);
        if (Math.abs(wrapAngle(want - st.yaw)) < 0.08) reaction = null;
        return true;
      }
      case 'jink': {
        // short back-and-forth jinks spoil the shooter's lead while the bow
        // turns onto the shot (movement.ts flips steering in reverse)
        const phase = Math.floor((reactUntilS - timeS) / REACT_JINK_PERIOD_S) % 2 === 0 ? 1 : -1;
        const bow = casemate && target && losClear ? targetBearing() : threatBearing;
        const err = wrapAngle(bow - st.yaw);
        const steerSign = st.speed < -0.15 ? -1 : 1;
        input.steer = Math.abs(err) > 0.06 ? clamp(err * 2.0, -1, 1) * steerSign : 0;
        input.throttle = 0.8 * phase * reactSide;
        input.brake = false;
        return true;
      }
    }
    return false;
  }

  /** A zone mission's hold point and radius, or null for other missions and modes. */
  function zoneObjective(): AiObjective | null {
    const objective = getObjective?.();
    return objective && (objective.mission === 'capture' || objective.mission === 'assault') ? objective : null;
  }

  /** Ground a hull can stand and hold on: level enough at the point and round its footprint, and dry. */
  function holdableGround(x: number, z: number): boolean {
    const min = casemate ? CASEMATE_SPOT_NORMAL_Y_MIN : SPOT_NORMAL_Y_MIN;
    if (hf.getNormalAt!(x, z).y < min) return false;
    for (let k = 0; k < 8; k++) {
      const a = k * (TAU / 8);
      if (hf.getNormalAt!(x + Math.sin(a) * ZONE_HOLD_FOOTPRINT_M, z + Math.cos(a) * ZONE_HOLD_FOOTPRINT_M).y < min) {
        return false;
      }
    }
    return !liquidSafe || liquidSafe(x, z, 0, 0);
  }

  /** The straight leg from (x0, z0) to (x1, z1) is no steeper than a comfortable climb (every ZONE_LEG_STEP_M). */
  function legDrivable(x0: number, z0: number, x1: number, z1: number): boolean {
    const length = Math.hypot(x1 - x0, z1 - z0);
    for (let d = ZONE_LEG_STEP_M; d < length; d += ZONE_LEG_STEP_M) {
      const f = d / length;
      if (hf.getNormalAt!(x0 + (x1 - x0) * f, z0 + (z1 - z0) * f).y < LEG_NORMAL_Y_MIN) return false;
    }
    return true;
  }

  /** Where a zone mission holds the zone centred at (x, z): its centre, or holdable ground beside it. */
  function zoneHoldPoint(x: number, z: number, radiusM: number): { x: number; z: number } {
    if (Math.abs(x - zoneHoldForX) < 1 && Math.abs(z - zoneHoldForZ) < 1) return zoneHold;
    zoneHoldForX = x;
    zoneHoldForZ = z;
    zoneHold.x = x;
    zoneHold.z = z;
    if (!hf.getNormalAt || holdableGround(x, z)) return zoneHold;
    const st = entity.state;
    const own = Math.atan2(st.pos.x - x, st.pos.z - z);
    for (let ring = 0; ring < ZONE_HOLD_RINGS_M.length; ring++) {
      const r = ZONE_HOLD_RINGS_M[ring];
      if (r > radiusM * ZONE_HOLD_MAX_FRAC) break;
      for (let k = 0; k < ZONE_HOLD_BEARINGS; k++) {
        // the hull's own side first, then alternately either way round
        const step = (k + 1) >> 1;
        const a = own + (k & 1 ? step : -step) * (TAU / ZONE_HOLD_BEARINGS);
        const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
        if (!holdableGround(px, pz)) continue;
        zoneHold.x = px;
        zoneHold.z = pz;
        zoneHoldMoves++;
        return zoneHold;
      }
    }
    return zoneHold; // nothing holdable inside the zone: the centre, as before
  }

  /** Pick the shift point: on the ring round the zone, in sight of the target, as far round its side as possible. */
  function pickObjectiveShift(objective: AiObjective): boolean {
    if (!target) return false;
    const st = entity.state;
    const tp = target.state.pos;
    const ty = eyeY(target);
    let bestScore = -Infinity;
    for (let k = 0; k < 8 * OBJECTIVE_SHIFT_RINGS.length; k++) {
      const radius = objective.radiusM * OBJECTIVE_SHIFT_RINGS[k >> 3];
      const a = (k & 7) * (TAU / 8) + (k >> 3) * (TAU / 16); // the outer ring sits between the inner ring's bearings
      const x = objective.x + Math.sin(a) * radius;
      const z = objective.z + Math.cos(a) * radius;
      if (Math.hypot(x - st.pos.x, z - st.pos.z) < ARRIVE_DIST_M * 1.5) continue; // where it already stands
      if (!reachableSpot(x, z)) continue;
      // the shift point is holdable ground the hull reaches without crossing a face (see ZONE_HOLD_RINGS_M)
      if (hf.getNormalAt && (!holdableGround(x, z) || !legDrivable(st.pos.x, st.pos.z, x, z))) continue;
      if (liquidSafe && !liquidSafe(x, z, Math.atan2(tp.x - x, tp.z - z), 0)) continue;
      if (!hasLos(x, hf.getHeightAt(x, z) + selfEyeM, z, tp.x, ty, tp.z)) continue;
      // 0 at the target's bow, π at its rear: a gate the front shuts is opened from the side
      // (capped at the beam: a side plate is enough, and the rear would mean driving round the target)
      const aspect = Math.min(Math.PI / 2, Math.abs(wrapAngle(Math.atan2(x - tp.x, z - tp.z) - target.state.yaw)));
      const score = aspect * 10 - Math.hypot(x - st.pos.x, z - st.pos.z) * 0.1;
      if (score <= bestScore) continue;
      bestScore = score;
      objectiveShiftPoint.x = x;
      objectiveShiftPoint.z = z;
    }
    return bestScore > -Infinity;
  }

  function updateObjectiveShift(dt: number): void {
    const objective = zoneObjective();
    const onObjective = !!objective && Math.hypot(objective.x - entity.state.pos.x, objective.z - entity.state.pos.z)
      <= objective.radiusM;
    if (!onObjective || !target || !enemyAlive(target) || emptyRack) {
      cannotFightT = 0;
      objectiveShifting = false;
      return;
    }
    if (losClear && (penGateOk || heWorth) && isVisibleToTeam(target)) {
      cannotFightT = 0; // fighting: the hull holds where it stands (the shift point, or the zone's centre)
      return;
    }
    cannotFightT += dt;
    if (cannotFightT < OBJECTIVE_SHIFT_DWELL_S) return;
    cannotFightT = 0;
    if (!pickObjectiveShift(objective!)) return;
    objectiveShifting = true;
    objectiveShifts++;
  }

  /** Drive the live shift; true while it owns the hull (the point reached, the hull faces the target there). */
  function driveObjectiveShift(input: AiInput): boolean {
    if (!objectiveShifting || !target) return false;
    if (driveToXZ(input, objectiveShiftPoint.x, objectiveShiftPoint.z, 0.8)) {
      const st = entity.state;
      faceYaw(input, Math.atan2(target.state.pos.x - st.pos.x, target.state.pos.z - st.pos.z));
      driveIntent = false; // holding the firing point is the point: the low-speed watchdog must not back it off
    }
    return true;
  }

  function driveMission(input: AiInput): boolean {
    const objective = getObjective?.();
    if (!objective?.mission) return false;
    const destination = objective.mission === 'capture' && orderActive() && order!.point
      && (order!.posture === 'capture' || order!.posture === 'support') ? order!.point! : objective;
    // A flag carrier and a striker must keep doing their job under contact.
    // Other roles may briefly retreat at critical health, then resume it.
    const critical = (entity.combat?.hp ?? 1) / (entity.combat?.maxHp ?? 1) < .25;
    if (critical && objective.mission !== 'carrier' && objective.mission !== 'striker'
        && nowS < fallbackUntilS) return false;
    if (objective.mission === 'striker' && Math.hypot(destination.x - entity.state.pos.x, destination.z - entity.state.pos.z) < 55) {
      // The last ball approach follows its live position, not a coarse grid
      // waypoint or a several-second target commitment.
      driveToXZ(input, destination.x, destination.z, 1);
      return true;
    }
    if (nowS < missionReleaseUntilS) return false;
    const offObjective = Math.hypot(destination.x - entity.state.pos.x, destination.z - entity.state.pos.z)
      > objective.radiusM;
    missionOffObjective = offObjective;
    // a zone is held from ground a hull can stand on (see ZONE_HOLD_RINGS_M)
    const hold = objective.mission === 'capture' || objective.mission === 'assault'
      ? zoneHoldPoint(destination.x, destination.z, objective.radiusM) : destination;
    if (missionRouteNeedsRefresh(hold.x, hold.z)) {
      setWaypoints([[hold.x, hold.z]], { loop: false });
    }
    // a route used up short of the objective (the mission's own, or a search leg that took the waypoints) is no
    // reason to park: the classic drivers take the hull for a while (Sirocco Wadi frontline seed 57001: a defender
    // stood 254 s at a search leg's end 116 m from the idle host, its gate shut on the host's front)
    if (offObjective && routeUsedUp()) {
      missionReleaseUntilS = nowS + MISSION_RELEASE_S;
      missionReleases++;
      return false;
    }
    if (!offObjective && driveObjectiveShift(input)) return true;
    drivePatrol(input);
    return true;
  }

  /** Drive the scoot leg under way; where it arrives is the new firing spot. */
  function driveScootLeg(input: AiInput): void {
    if (legKind === 2) leg.driven = true;
    const arrived = scootLine !== 0
      ? driveOnLine(input, scootPoint.x, scootPoint.z, targetBearing(), 0.8 * scootLine)
      : driveToXZ(input, scootPoint.x, scootPoint.z, 0.95);
    if (arrived) {
      scootUntilS = -1;
      arcScoot = false;
      spotPos.x = entity.state.pos.x;
      spotPos.z = entity.state.pos.z;
      shotsFromSpot = 0;
      relocations++;
    }
  }

  function driveCurrentMode(input: AiInput, timeS: number, targetDistance: number): void {
    input.brake = false;
    driveIntent = false;
    if (driveMission(input)) return;
    if (driveReaction(input, timeS)) return;
    // the route to the target's level owns the hull while it runs (see ELEVATION_LOCK_S)
    if (levelRouting) {
      drivePatrol(input);
      return;
    }
    // a gun pinned at its stop finishes nothing from where it stands: the arc limit's leg owns the hull over the press
    // and the press's back-up (see LEG_DEAD_M)
    if (arcScoot && timeS < scootUntilS) {
      driveScootLeg(input);
      return;
    }
    if (passivePressing && target && losClear) {
      drivePassivePress(input);
      return;
    }
    // the settled-shot halt, but not under fire in the open (SETTLE_STARVED_S)
    if (timeS < settleUntilS && target && losClear && !conserving && !emptyRack && !exposedUnderFire(timeS)) {
      faceYaw(input, Math.atan2(
        target.state.pos.x - entity.state.pos.x,
        target.state.pos.z - entity.state.pos.z,
      ));
      return;
    }
    if (timeS < scootUntilS) {
      driveScootLeg(input);
      return;
    }
    if (mode === 'patrol') drivePatrol(input);
    else if (mode === 'engage') driveEngage(input, timeS, targetDistance);
    else if (mode === 'seekCover') {
      if (casemate && behindOnLine(coverPoint.x, coverPoint.z)) {
        driveOnLine(input, coverPoint.x, coverPoint.z, targetBearing(), -0.9);
      } else driveToXZ(input, coverPoint.x, coverPoint.z, 0.9);
    }
    else {
      const flankPoint = flankPoints[Math.min(flankIndex, 2)];
      if (driveToXZ(input, flankPoint.x, flankPoint.z, 1)) flankIndex++;
    }
  }

  function updateProgressRate(dt: number): void {
    const position = entity.state.pos;
    const dx = position.x - progX;
    const dz = position.z - progZ;
    progX = position.x;
    progZ = position.z;
    const instantaneous = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
    progressRate += (instantaneous - progressRate) * Math.min(1, dt * 2.5);
  }

  function updateSlopeRecovery(dt: number, timeS: number): void {
    if (!driveIntent || !entity.state.slopeBlocked || timeS < unstickUntilS) {
      slopeBlockT = 0;
      return;
    }
    terrainRouteUntilS = timeS + 6;
    routeTimer = 0;
    slopeBlockT += dt;
    if (slopeBlockT < SLOPE_BLOCK_RECOVERY_S) return;
    slopeBlockT = 0;
    unstickUntilS = timeS + UNSTICK_TIME_S;
    navNoProgressT = 0;
    navBestD = Infinity;
    escalateStuckRecovery(timeS, false);
    unstickSteer = detourSide;
  }

  // the speed a collider contact has taken since its first step (COLLIDER_STOP_WINDOW_S)
  let colliderLostMps = 0;
  let colliderContactAtS = -Infinity;
  function updateColliderRecovery(timeS: number): void {
    const st = entity.state;
    if (st.impactSource !== IMPACT_SOURCE_COLLIDER) {
      colliderLostMps = 0;
      return;
    }
    if (colliderLostMps === 0 || timeS - colliderContactAtS > COLLIDER_STOP_WINDOW_S) {
      colliderLostMps = 0;
      colliderContactAtS = timeS;
    }
    colliderLostMps += st.impactMps;
    if (timeS < unstickUntilS || ramming) return;
    const lost = colliderLostMps;
    if (lost < COLLIDER_STOP_MPS || lost < (lost + Math.abs(st.speed)) * COLLIDER_STOP_FRAC) return;
    const nx = st.impactNx, nz = st.impactNz; // off the face, toward the hull
    // a world primitive on that side, not a hull (the traffic and ram rules own those)
    if (!findBlockingObstacle(st.pos.x, st.pos.z, -nx, -nz,
      spec.dims.hullLengthM * 0.5 + 1.5, spec.dims.widthM * 0.5)) return;
    // the face's tangent on the side of the drive's goal (of the heading, with no drive)
    let tx = nz, tz = -nx;
    const goalX = navGoalX - st.pos.x, goalZ = navGoalZ - st.pos.z;
    const toGoal = driveIntent && Math.abs(navGoalX) < 1e8;
    if ((toGoal ? tx * goalX + tz * goalZ : tx * Math.sin(st.yaw) + tz * Math.cos(st.yaw)) < 0) {
      tx = -tx;
      tz = -tz;
    }
    escalateStuckRecovery(timeS, true);
    // reversing flips the steer (movement.ts): the opposite command swings the bow toward the tangent
    unstickSteer = wrapAngle(Math.atan2(tx, tz) - st.yaw) >= 0 ? -1 : 1;
    // and the detour (driveToXZ) goes round on that side (+1 offsets the goal to its bearing's right)
    if (toGoal) detourSide = tx * goalZ - tz * goalX >= 0 ? 1 : -1;
    unstickUntilS = timeS + UNSTICK_TIME_S;
    lowSpeedT = 0;
    navNoProgressT = 0;
    navBestD = Infinity;
    colliderLostMps = 0;
    colliderStops++;
  }

  function applyActiveUnstick(input: AiInput): void {
    input.throttle = -0.7;
    input.steer = unstickSteer;
    input.brake = false;
    lowSpeedT = 0;
    navNoProgressT = 0;
    navBestD = Infinity;
  }

  function updateLowSpeedRecovery(
    input: AiInput,
    dt: number,
    timeS: number,
    yieldedLastStep: boolean,
  ): void {
    if (timeS < unstickUntilS) {
      applyActiveUnstick(input);
      return;
    }
    const movingTooSlowly = driveIntent && !yieldedLastStep
      && (Math.abs(entity.state.speed) < 0.3 || progressRate < 0.45);
    if (movingTooSlowly) {
      lowSpeedT += dt;
      if (lowSpeedT <= STUCK_TIME_S) return;
      unstickUntilS = timeS + UNSTICK_TIME_S;
      unstickSteer = rng() < 0.5 ? -1 : 1;
      lowSpeedT = 0;
      escalateStuckRecovery(timeS, true);
      return;
    }
    lowSpeedT = 0;
    if (progressRate <= 2.5) {
      freeMoveT = 0;
      return;
    }
    freeMoveT += dt;
    if (freeMoveT > 2.2) stuckStrikes = 0;
  }

  function updateOrbitRecovery(dt: number, timeS: number, yieldedLastStep: boolean): void {
    if (driveIntent && !yieldedLastStep && timeS >= unstickUntilS) {
      navNoProgressT += dt;
      if (navNoProgressT <= 6) return;
      navNoProgressT = 0;
      navBestD = Infinity;
      unstickUntilS = timeS + UNSTICK_TIME_S;
      unstickSteer = rng() < 0.5 ? -1 : 1;
      escalateStuckRecovery(timeS, false);
      return;
    }
    if (!driveIntent) navNoProgressT = 0;
  }

  function finishStep(input: AiInput, dt: number, timeS: number): void {
    avoidAllies(input, dt, timeS);
    if (liquidSafe && entity.state.grounded) {
      const st = entity.state;
      const speed = Math.abs(st.speed);
      const sign = speed > 0.2 ? Math.sign(st.speed) : Math.sign(input.throttle);
      // Controller safety can only brake after allied avoidance, never add a reverse ram.
      // Conservative 2m/s² nominal stop envelope; collision impulses still obey shared physics.
      const stopM = sign * (1.5 + speed * 0.2 + speed * speed / 4);
      if (!liquidSafe(st.pos.x,st.pos.z,st.yaw,stopM)) {
        input.throttle = 0;
        input.brake = true;
        routeTimer = Math.min(routeTimer,0.1);
      }
    }
    // Braking belongs only to grounded driving. Airborne controls must never
    // turn a jump into an accidental persistent handbrake on landing.
    if (entity.state.grounded && (Math.abs(input.throttle) > .1 || Math.abs(entity.state.speed) > .5 || timeS < terrainAvoidUntilS)) {
      const st = entity.state;
      const speed = Math.abs(st.speed), direction = speed > .5 ? Math.sign(st.speed) : Math.sign(input.throttle);
      if (timeS >= terrainCheckAtS) {
        terrainCheckAtS = timeS + .1;
        terrainBlocked = !terrainSafety.corridorSafe(entity, st.yaw, direction * (2 + speed * .35 + speed * speed / 4));
      }
      if (terrainBlocked && timeS >= terrainAvoidUntilS) {
        const waypoint = waypoints[wpIndex];
        const goalYaw = waypoint ? Math.atan2(waypoint.x - st.pos.x, waypoint.z - st.pos.z) : st.yaw + Math.PI;
        let bestCost = Infinity;
        terrainEscapeYaw = st.yaw + Math.PI;
        // Find an actually drivable escape direction. Fixed left/right turns
        // can send a tank from one bridge parapet directly toward the other.
        for (let i = 0; i < 16; i++) {
          const yaw = goalYaw + i * TAU / 16;
          if (!terrainSafety.corridorSafe(entity, yaw, 10)) continue;
          const cost = Math.abs(wrapAngle(yaw - goalYaw)) + .15 * Math.abs(wrapAngle(yaw - st.yaw));
          if (cost < bestCost) { bestCost = cost; terrainEscapeYaw = yaw; }
        }
        terrainAvoidUntilS = timeS + 3;
        routeTimer = 0;
      }
      if ((terrainBlocked || timeS < terrainAvoidUntilS) && casemate && target && losClear) {
        // an engaged casemate stops at the blocked corridor: the escape turn would swing its gun off the target
        input.throttle = 0;
        input.brake = speed > 0.3;
        input.steer = 0;
      } else if (terrainBlocked || timeS < terrainAvoidUntilS) {
        // Hold the escape turn long enough to complete it. Handing the hull
        // back to its old waypoint on the first safe sample oscillated along
        // the gorge edge instead of turning away from it.
        const error = wrapAngle(terrainEscapeYaw - st.yaw);
        input.throttle = speed <= 3 && Math.abs(error) < .2 && terrainSafety.corridorSafe(entity, st.yaw, 8) ? .4 : 0;
        input.brake = speed > 3;
        input.steer = clamp(error * 2, -1, 1);
      }
    } else if (!entity.state.grounded) {
      terrainBlocked = false;
      terrainCheckAtS = -Infinity;
    }
    supportContext.safeToReloadMagazine = !target || !losClear || mode === 'seekCover';
    supportContext.wantsSuspensionAim = !!target && losClear
      && Math.abs(entity.state.speed) < 1.5
      && Math.abs(input.throttle) < 0.2;
    input.actionBits = chooseAiSupportActionBits(entity, timeS, supportContext);
    abilityContext.retreating = mode === 'seekCover' || timeS < fallbackUntilS
      || (reaction !== null && timeS < reactUntilS) || (orderActive() && order!.posture === 'retreat');
    abilityContext.reloadS = slotReloadS(chosenSlot);
    abilityContext.contactM = target && losClear && isVisibleToTeam(target) ? currentTargetDistance() : Infinity;
    abilityContext.safeJump = false;
    if (abilities.jumpEligible(entity, timeS, abilityContext) && input.throttle > 0.2 && !input.brake) {
      const st = entity.state;
      const travel = st.speed * 2 * entity.modeJumpMps! / (9.81 * Math.max(0.1, entity.modeGravityScale ?? 1));
      let safe = travel > 0 && travel <= 120 && terrainSafety.jumpLandingSafe(entity, travel) && (!liquidSafe || liquidSafe(st.pos.x, st.pos.z, st.yaw, travel));
      const baseY = hf.getHeightAt(st.pos.x, st.pos.z);
      for (let d = 5; safe && d <= travel + 5; d += 5) {
        const distance = Math.min(travel, d);
        const y = hf.getHeightAt(st.pos.x + Math.sin(st.yaw) * distance, st.pos.z + Math.cos(st.yaw) * distance);
        if (!Number.isFinite(y) || Math.abs(y - baseY) > 3) safe = false;
      }
      if (safe) {
        jumpOrigin.set(st.pos.x, st.pos.y + 1, st.pos.z);
        jumpDirection.set(Math.sin(st.yaw), 0, Math.cos(st.yaw));
        safe = !deps.raycast(jumpOrigin, jumpDirection, travel + 5);
      }
      abilityContext.safeJump = safe;
    }
    input.actionBits |= abilities.update(entity, timeS, abilityContext);
    if (entity.state.overturned === true) {
      // round 60 pacing: on its roof the drive only resets the rollover settle (see chooseAiSupportActionBits)
      input.throttle = 0;
      input.steer = 0;
      input.brake = false;
    }
    aimAndFire(input, dt, timeS);
    controller.state = mode;
  }

  // ---- main update ----------------------------------------------------------

  function update(dt: number, timeS: number): void {
    if (spec !== entity.spec) { spec = entity.spec; heSlot = findHeShellSlot(spec); chosenSlot = 0; }
    nowS = timeS;
    const input = entity.input;
    const cb = entity.combat;
    const allyYieldingPrev = allyYielding;
    if (resetStepIntent(input)) return;
    updateSurvivalMemory(timeS);
    updatePerception(dt, timeS);
    updateStalematePolicy(timeS);
    const distToTarget = currentTargetDistance();

    stepStateMachine(dt, timeS);
    updateDeadLegs(timeS);

    updateDoctrine(cb, dt, timeS, distToTarget);

    // A stable friendly obstruction should produce a better firing angle,
    // not a blocked trigger forever. Movement begins on the tick after the
    // fire-discipline gate observes the corridor, keeping AI/fire ordering
    // deterministic and identical for both teams.
    updateFriendlyLaneRelocation(timeS);
    updateGunLaneRelocation(timeS);

    driveCurrentMode(input, timeS, distToTarget);
    driveTrafficDetour(input, timeS);

    // ---- stuck detection & recovery ----
    // Real displacement rate (EMA). The drivetrain `st.speed` lies when the
    // collision pushback cancels the motion against an obstacle, so the
    // stuck test uses BOTH: no wheel speed OR no ground actually covered.
    updateProgressRate(dt);
    // movement.ts reports an engine/traction capability rejection explicitly. Waiting
    // for the generic two-second low-speed heuristic made bots repeatedly
    // grind into short cliffs that the coarse 25 m route grid cannot see.
    // A sustained slope block is definitive terrain feedback: reverse and
    // invalidate the leg promptly so the existing seeded detour/replan policy
    // can route around it. The short dwell filters one-tick ridge contacts.
    updateSlopeRecovery(dt, timeS);
    updateColliderRecovery(timeS);
    updateLowSpeedRecovery(input, dt, timeS, allyYieldingPrev);

    // r6 ORBIT WATCHDOG (see trackNavProgress): continuous displacement with
    // NO approach to the nav goal — a bot circling a spawn prop cluster keeps
    // progressRate at 1-2 m/s, so the stuck test above never fires (probe:
    // the flanker orbited its spawn for 115 s, obs=3, yaw churning end to
    // end, and the whole enemy team contributed 0 shells for 60 s). Six
    // seconds without closing on the goal is a strike through the SAME
    // unstick/detour/waypoint-skip machinery.
    updateOrbitRecovery(dt, timeS, allyYieldingPrev);

    // Last movement authority: applies to ordinary routes, fallback reverse,
    // and generic unstick bursts alike.
    finishStep(input, dt, timeS);
  }

  /**
   * Replace the patrol route.
   * @param {Array<[number, number]>} points [x,z] pairs in world meters
   * @param {{loop?: boolean}} options route behavior; patrol routes loop by default
   */
  let missionRouteX = Infinity, missionRouteZ = Infinity, missionRouteAtS = -Infinity;
  let missionRouteEndX = NaN, missionRouteEndZ = NaN; // the planned mission route's last waypoint
  let missionOffObjective = false;                    // the hull stood off its objective at the last mission step
  function missionRouteNeedsRefresh(x: number, z: number): boolean {
    return Math.hypot(x - missionRouteX, z - missionRouteZ) >= 12
      || (nowS - missionRouteAtS >= 6 && (waypoints.length === 0 || terrainBlocked || navNoProgressT > 4
        || (missionOffObjective && missionRouteEnded())));
  }

  /** The route in the waypoints is used up: none left, or the hull stands at the last one. */
  function routeUsedUp(): boolean {
    const last = waypoints[waypoints.length - 1];
    return !last || (wpIndex >= waypoints.length - 1
      && Math.hypot(last.x - entity.state.pos.x, last.z - entity.state.pos.z) < ARRIVE_DIST_M * 2);
  }

  /**
   * The mission's own route is used up: its plan came back empty, or the hull stands at its last waypoint. A route
   * that has since taken the waypoints (a search leg) is not the mission's: it keeps them, as it always has.
   */
  function missionRouteEnded(): boolean {
    const last = waypoints[waypoints.length - 1];
    if (!last) return missionRouteAtS > -Infinity && Number.isNaN(missionRouteEndX);
    return last.x === missionRouteEndX && last.z === missionRouteEndZ && routeUsedUp();
  }

  function setWaypoints(
    points: readonly (readonly [number, number])[],
    { loop = true }: { loop?: boolean } = {},
  ): void {
    // Live modes and Jev supply destinations, not terrain-safe paths. Resolve
    // those through the same navigation grid as opening/search routes. Keep an
    // unchanged route's cursor between frequent moving-objective refreshes.
    if (!loop && points.length === 1) {
      const [x, z] = points[0];
      if (!missionRouteNeedsRefresh(x, z)) return;
      missionRouteX = x; missionRouteZ = z; missionRouteAtS = nowS;
      // the grid has no way the widest hull fits from here (a passage two wrecks narrow, a zone centre against a
      // wall): the destination itself stays the waypoint, for the local router to approach, never no route at all
      if (deps.planRoute) {
        const planned = deps.planRoute(entity.state.pos, { x, z });
        if (planned.length) points = planned;
      }
      const end = points[points.length - 1];
      missionRouteEndX = end ? end[0] : NaN;
      missionRouteEndZ = end ? end[1] : NaN;
    } else {
      missionRouteX = missionRouteZ = Infinity;
      missionRouteEndX = missionRouteEndZ = NaN;
    }
    waypoints.length = 0;
    for (let i = 0; i < points.length; i++) {
      waypoints.push({ x: points[i][0], z: points[i][1] });
    }
    wpIndex = 0;
    autoPatrolBuilt = true; // user route supersedes the auto loop
    loopWaypoints = !!loop;
  }

  /**
   * Feedback for shells this tank fired (integration calls this per §3.6 lock).
   * Two consecutive non-penetrating results on the current target trigger a flank;
   * every result also resamples the aim error and forces a fresh weak-spot probe.
   * @param {object} hitEvent HitEvent (§2.6)
   */
  function notifyShellResult(hitEvent: Pick<HitEvent, 'targetId' | 'kind'> & Partial<Pick<HitEvent, 'shellName'>>): void {
    // A roof-gun bounce says nothing about the cannon's penetration solution.
    // Do not re-roll main aim or trigger a flank for each automatic-gun bullet.
    if (!hitEvent) return;
    if (hitEvent.shellName && !spec.gun.shells.some(shell => shell.name === hitEvent.shellName)) return;
    if (target && hitEvent.targetId === target.id) {
      missStreak = 0; // the round reached the target: the spot's lay holds (see PASSIVE_PRESS_MISSES)
      const k = hitEvent.kind;
      if (k === 'nonpen' || k === 'ricochet' || k === 'spaced_absorb' || k === 'era') {
        nonPenCount++;
        probeTimer = 0; // re-evaluate aim zone / shell slot immediately
        if (nonPenCount >= 2 && mode !== 'flank' && !passivePressing) startFlank(nowS);
      } else if (k === 'pen' || k === 'he_pen') {
        nonPenCount = 0;
        lastPenAtS = nowS; // round 60 pacing: the press arms only while this bot's shells stop penetrating
      }
    }
    resampleAimError();
  }

  /** Direct hits provoke retaliation; nearby team reports provide awareness.
   * Neither event overrides a closer fight merely because its shooter is human. */
  function notifyUnderFire(shooter: AiEntity, info: HitReactionInfo = {}): void {
    if (!shooter?.state || !shooter.combat || shooter.combat.destroyed || shooter.team === entity.team) return;
    // A teammate's report must not overwrite the attacker hitting this hull.
    if (info.selfHit || nowS >= underFireUntilS || !directlyUnderFire) {
      underFire = shooter;
      underFireUntilS = nowS + UNDER_FIRE_WINDOW_S;
      directlyUnderFire = !!info.selfHit;
    }
    if (info.selfHit) {
      abilityContext.hitAtS = nowS;
      abilityContext.hitBearing = Math.atan2(shooter.state.pos.x - entity.state.pos.x, shooter.state.pos.z - entity.state.pos.z);
      reactToHit(shooter, isVisibleToTeam(shooter), info);
    }
    if (!isVisibleToTeam(shooter)) {
      if (!target || !enemyAlive(target)) noteSuspect(shooter, nowS, true);
      return;
    }
    // Use the common selection path, including personal LOS and fire-team allocation.
    acquireTarget(nowS);
  }

  /** An audible gunshot is a contact hint, not an order to abandon a fight.
   * Both teams and human/bot shooters use this same policy. */
  function notifyEnemyFired(shooter: AiEntity): void {
    if (!shooter?.state || !shooter.combat || shooter.combat.destroyed || shooter.team === entity.team) return;
    if (target && enemyAlive(target)) {
      if (target === shooter && isVisibleToTeam(shooter)) rememberPosition(shooter, nowS);
      return;
    }
    if (!isVisibleToTeam(shooter)) { noteSuspect(shooter, nowS, true); return; }
    acquireTarget(nowS);
  }

  /** Authoritative fire path callback when a same-tick friendly crossing was
   * caught after the controller update. It feeds the same relocation timer. */
  function notifyFriendlyBlocked(risk: FriendlyFireRisk | null | undefined): void {
    if (!risk) return;
    if (friendlyBlockT <= 0) friendlyBlockCount++;
    friendlyBlockT = Math.max(friendlyBlockT, 0.25);
    lastFriendlyRisk = risk;
  }

  /** The ordered retreat: the low-health fallback's own machinery, started on the commander's word. */
  function beginOrderedFallback(): void {
    const support = nearestSupport();
    if (target && enemyAlive(target)) {
      if (support) setSupportedFallback(support);
      else setUnsupportedFallback(target);
      fallbackUntilS = nowS + FALLBACK_S;
      fallbackCdS = nowS + FALLBACK_CD_S;
      burstDamage = 0;
      hasMoveTarget = false;
      hasCoverPoint = false;
      if (mode === 'seekCover' || mode === 'flank') mode = 'engage'; // driveFallback lives in the engage driver
      return;
    }
    if (!support) return;
    // no target to fall back from: drive to the support as a route
    setWaypoints([[support.state.pos.x, support.state.pos.z]], { loop: false });
    mode = 'patrol';
  }

  /**
   * Take a commander's order (game/jevCommander.ts). The posture's immediate effects start here; the
   * gated reads above (hold band, cover discipline, target claim, fire discipline, engage driving)
   * carry it until `untilS`, when the classic brain resumes by itself.
   */
  function setOrder(next: AiOrder | null): void {
    if (!next || nowS >= next.untilS) {
      order = null;
      return;
    }
    order = next;
    ordersTaken++;
    switch (next.posture) {
      case 'flank_left':
      case 'flank_right':
        if (target && enemyAlive(target) && mode !== 'flank' && !passivePressing) {
          startFlank(nowS, next.posture === 'flank_left' ? 1 : -1);
        }
        break;
      case 'retreat':
        if (nowS >= fallbackUntilS) beginOrderedFallback();
        break;
      case 'push':
        pressUntilS = Math.max(pressUntilS, next.untilS);
        hasMoveTarget = false;
        hasCoverPoint = false;
        if (mode === 'seekCover') mode = 'engage';
        break;
      case 'capture':
      case 'support':
        if (next.point && (!target || !enemyAlive(target) || mode === 'patrol')) {
          setWaypoints([[next.point.x, next.point.z]], { loop: false });
          if (mode !== 'patrol' && mode !== 'engage') mode = 'engage';
        }
        break;
      default:
        break; // hold (or a target-only order): the gated reads do the work
    }
  }

  const controller: AiController = {
    update,
    setWaypoints,
    notifyShellResult,
    notifyUnderFire,
    notifyEnemyFired,
    notifyFriendlyBlocked,
    setOrder,
    get terrainBlocked() { return terrainBlocked; },
    hasClearShot: (id) => target?.id === id && losClear && friendlyBlockT <= 0 && gunLaneBlockedT <= 0 && penGateOk,
    get targetId() { return target ? target.id : null; },
    /** Headless-probe introspection (controls_gunnery r5): gate snapshot. */
    debugInfo: () => ({
      mode, targetId: target ? target.id : null,
      targetIsPlayer: !!(target && target.isPlayer),
      // BATTLE-AI r7 doctrine surface: class role + measurable signals
      // (sniper relocations, live scoot/kite/fallback windows) for probes.
      role, relocations, shotsFromSpot, terrainBlocked, terrainAvoiding: nowS < terrainAvoidUntilS,
      // bot philosophy r1: live hit reaction, count, and the unseen gun the hull is turning onto
      reaction, reactions, suspectId: suspect && nowS < suspectUntilS ? suspect.id : null,
      scooting: nowS < scootUntilS,
      kiting: nowS < kiteUntilS,
      settling: nowS < settleUntilS,
      colliderStops,
      fallingBack: nowS < fallbackUntilS,
      hpFrac: entity.combat && entity.combat.maxHp
        ? +(entity.combat.hp / entity.combat.maxHp).toFixed(2) : 1,
      burstDamage: Math.round(burstDamage),
      friendlyBlockT: +friendlyBlockT.toFixed(2),
      friendlyBlockCount,
      friendlyLaneMoves, friendlyLaneSearches,
      friendlyBlockKind: lastFriendlyRisk ? lastFriendlyRisk.kind : null,
      friendlyBlockId: lastFriendlyRisk ? lastFriendlyRisk.allyId : null,
      allyYielding, allyAvoidingId,
      allyClosestM: Number.isFinite(allyClosestM) ? +allyClosestM.toFixed(2) : null,
      allyYieldT: +allyYieldT.toFixed(2),
      allyEmergencyStops, allyReverseEscapes,
      allyHoldT: +allyHoldT.toFixed(2), allyHoldGiveWays,
      losBlockedT: +losBlockedT.toFixed(1), hasVantage,
      navT: +navNoProgressT.toFixed(1), strikes: stuckStrikes, // r6 watchdog
      penDeniedT: +penDeniedT.toFixed(1), // round 48 pacing: closed pen gate dwell
      // round 60 pacing: how long the target has been passive (still hull, silent gun) and the press state
      targetPassiveS: target ? +Math.min(targetStillS, nowS - targetLastShotS).toFixed(1) : 0,
      passivePress: passivePressing,
      passivePresses,
      passivePressRepicks,
      passivePressCandidate,
      passivePressArcT: +passivePressArcT.toFixed(1),
      // round 62 pacing: the search for a lost enemy and the empty rack
      searching, searchKind, searchLegs, searchFailures,
      searchGoalX: Math.round(searchGoal.x), searchGoalZ: Math.round(searchGoal.z),
      wpIndex, wpCount: waypoints.length,
      waypointX: waypoints[wpIndex]?.x ?? null, waypointZ: waypoints[wpIndex]?.z ?? null,
      conserveHolds, emptyRack, ramming, ramRuns, ramCapMps: Number.isFinite(ramCapMps) ? +ramCapMps.toFixed(2) : null,
      lastRun, lastRuns,
      missStreak, missVerdicts, pressUnreached, deadLegs,
      arcScoot: arcScoot && nowS < scootUntilS,
      pressReachInS: passivePressing && Number.isFinite(pressReachByS) ? +(pressReachByS - nowS).toFixed(1) : null,
      pressRepickInS: passivePressing ? +(passivePressRepickS - nowS).toFixed(1) : null,
      rackSpent: !!target && target.id === rackSpentId, rackSpentT: +rackSpentT.toFixed(1), rackSpentVerdicts,
      objectiveShifts, objectiveShifting, zoneHoldMoves,
      routeCornerX: routeActive ? +routeCorner.x.toFixed(2) : null,
      routeCornerZ: routeActive ? +routeCorner.z.toFixed(2) : null, routeCornerFlips,
      objectiveShiftX: objectiveShifting ? +objectiveShiftPoint.x.toFixed(1) : null,
      objectiveShiftZ: objectiveShifting ? +objectiveShiftPoint.z.toFixed(1) : null,
      zoneHoldX: Number.isFinite(zoneHoldForX) ? +zoneHold.x.toFixed(1) : null,
      zoneHoldZ: Number.isFinite(zoneHoldForZ) ? +zoneHold.z.toFixed(1) : null,
      missionReleases, missionReleased: nowS < missionReleaseUntilS,
      levelRouting, levelRoutes, unbearableVerdicts, unbearable: unbearableId, elevationLockT: +elevationLockT.toFixed(1),
      pressing: nowS < pressUntilS,
      pressPointX: passivePressing ? pressPoint.x : NaN, // round 67: the chosen press point (NaN while not pressing)
      pressPointZ: passivePressing ? pressPoint.z : NaN,
      // camo_spotting r7: chase-intel snapshot for the acquisition selftest —
      // asserts a suspect keeps the MUZZLE stamp, never the live position,
      // while the spotting sim hides the shooter.
      lastSeenX: lastSeen.x, lastSeenZ: lastSeen.z, lastSeenAtS,
      // commander orders (game/jevCommander.ts): the live order and how many were taken
      orderPosture: orderActive() ? order!.posture : null,
      orderTarget: orderActive() ? order!.targetId : null,
      orderFire: orderActive() ? order!.fire : null,
      ordersTaken,
      targetTrackLagS: +targetTrackLagS.toFixed(3),
      targetLeadScale: +targetLeadScale.toFixed(3),
      ..._dbg,
    }),
    state: mode,
  };
  (entity as ControllerOwnedEntity).ai = controller;
  return controller;
}
