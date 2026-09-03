/**
 * ai.ts — Shared allied/enemy tank AI controller (pure logic, node-runnable).
 *
 * Implements ARCHITECTURE.md §3.6: waypoint navigation on the terrain heightfield,
 * line-of-sight target acquisition, hull-down / cover seeking, shell-travel-time
 * aim lead with gravity compensation, dispersion-gated firing, weak-spot probing,
 * flanking on repeated non-penetrations, and three difficulty tiers.
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
import { computeDispersionRadM } from '../sim/movement.ts';
import { solveBallisticGunLay } from '../sim/ballistics.ts';
import { tankPoseFromState, queryAimArmor } from '../sim/armor.ts';
import { blastRadiusM, estimatePenRatio, isHeClass } from '../sim/damage.ts';
import { terrainTravelCostFactor } from '../sim/terrainMobility.ts';
import { PLAYER_ACTION_BITS } from '../net/protocol.ts';
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
export type AiRole = 'scout' | 'sniper' | 'brawler' | 'flanker';
type AiMode = 'patrol' | 'engage' | 'seekCover' | 'flank';
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
  armor?: ArmorModel;
  dims: MovementSpec['dims'] & { lengthM?: number };
};

type AiDebugValue = string | number | boolean | null;

interface AiControllerDebugInfo {
  [key: string]: AiDebugValue;
  mode: string;
  targetId: string | null;
}

export interface FriendlyFireRisk {
  allyId: string;
  kind: 'corridor' | 'blast';
  clearanceM: number;
}

export interface AiController {
  update(dt: number, timeS: number): void;
  setWaypoints(points: Array<[number, number]>, options?: { loop?: boolean }): void;
  notifyShellResult(hitEvent: Pick<HitEvent, 'targetId' | 'kind'>): void;
  notifyUnderFire(shooter: AiEntity): void;
  notifyPlayerFired(shooter: AiEntity, rank?: number): void;
  notifyFriendlyBlocked(risk: FriendlyFireRisk): void;
  readonly targetId: string | null;
  debugInfo(): AiControllerDebugInfo;
  state: string;
}

export interface AiEntity {
  id: string;
  team: string;
  isPlayer?: boolean;
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

interface AiSupportContext {
  safeToReloadMagazine?: boolean;
  wantsSuspensionAim?: boolean;
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
  for (const [name, module] of Object.entries(combat.modules || {})) {
    if (!module || module.state === 'ok') continue;
    damagedModules++;
    if (module.state === 'red' && CRITICAL_REPAIR_MODULES.has(name)) return true;
  }
  return damagedModules >= 2;
}

function hasInjuredCrew(combat: CombatState): boolean {
  return Object.values(combat.crew || {}).some((alive) => alive === false);
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
  min: [number, number, number];
  max: [number, number, number];
  shape2?: CollisionShape;
  crushed?: boolean;
  crushable?: boolean;
}

interface AiHeightField {
  getHeightAt(x: number, z: number): number;
  getHeightAtFast?(x: number, z: number): number;
  getNormalAt?(x: number, z: number): { y: number };
  getGroundType?(x: number, z: number): string;
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

// Shared fire-discipline constants. Both teams run the same controller and
// therefore obey the same corridor, moving-friendly prediction and HE splash
// rules. The authoritative simulation repeats this check immediately before
// spawning a bot shell (state.ts), so a stale controller decision cannot hit
// a teammate that crossed the muzzle between AI and fire phases.
const FRIENDLY_CORRIDOR_PAD_M = 1.25;
const FRIENDLY_HE_PAD_M = 1.5;
const FRIENDLY_PREDICT_MAX_S = 1.5;
const FRIENDLY_LANE_RELOCATE_S = 1.2;
const FRIENDLY_SEPARATION_LOOK_M = 26;
const FRIENDLY_SEPARATION_PREDICT_S = 1.8;
const FRIENDLY_STOP_DECEL_MPS2 = 4.0;

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
const EYE_FRAC          = 0.85;   // eye/turret-top height as fraction of heightM
const ARRIVE_DIST_M     = 6.0;
const MAX_FIRE_RANGE_M  = 620;
// UNDER-FIRE REACTION + PLAYER THREAT (controls_gunnery r2): being shot
// reveals the shooter for a chase window, and the PLAYER's distance is
// weighted down during target selection so enemy aggression doesn't all
// drain onto the allied bots pushing ahead of the player (r2 critic: enemies
// fired 21-34 shells across three battles, zero directed at the player).
const UNDER_FIRE_WINDOW_S = 15;       // chase/engage window after a team hit
const UNDER_FIRE_RANGE_BONUS_M = 180; // engage-envelope extension toward the shooter
const PLAYER_THREAT_DIST_MULT = 0.35; // player counts as 35% of its true d² when ranking targets
// PLAYER ATTACKER-OF-RECORD (controls_gunnery r4): the single underFire slot
// was overwritten within a second or two by whichever ALLIED bot landed the
// next teammate hit, so the player's aggro claim evaporated before the next
// LOS tick — measured live: 3 player hits, underFire pointing at an allied
// Leo 2A7 on every snapshot, zero shells returned at the player across 90 s.
// A PLAYER shooter now also claims a dedicated sticky slot with a longer
// window (muzzle flash + tracer are intel). camo_spotting r2: the slot no
// longer bypasses the spotting gate — the firing-player reveal itself now
// lives in the sim (spotting.ts muzzle-flash branch resolves it through the
// camo formula); the slot keeps the position intel + priority sticky.
const PLAYER_AGGRO_WINDOW_S = 25;
// PLAYER MUZZLE-FLASH INTEL (controls_gunnery r5): r4's playerAggro only
// armed on a LANDED player hit (shell:hit) — a player sniping from outside
// the bots' 350-380 m view range was revealed for one aggro window and then
// went dark again while the aggro'd bot stalled in a losBlockedT>5 chase.
// Decisive r5 probe: 3 penetrating player hits, 29+ enemy shells over two
// 60 s runs, ZERO aimed within 4° of the player — functionally invulnerable.
// Now every player SHOT (state.ts fans out shell:fired to notifyPlayerFired)
// re-reveals the player to all enemies within earshot for this window, the
// aggro'd bots hard-commit (2 s vantage threshold, unconditional engage-range
// bonus), and a stalemate breaker forces silent bots with a known contact to
// push a firing position instead of idling in patrol/seekCover.
const MUZZLE_INTEL_WINDOW_S = 18;
// REPEAT-OFFENDER MEMORY (controls_gunnery r4): a player who fires 2+ times
// from one position is a FIXED KNOWN position, and converting a blocked-LOS
// commit at 300-400 m into a firing position is a 30-60 s drive — the 18 s
// base window died mid-reposition and every committed bot reverted to
// patrol (unstaged probe: 3 player shots, all 4 bots back in patrol with
// zero shells returned). Repeat shots escalate the window so the chase
// survives the drive.
const MUZZLE_INTEL_REPEAT_WINDOW_S = 45;
const STALEMATE_SILENT_S = 12;   // no shot fired this long w/ contact → push
const STALEMATE_PUSH_S = 8;      // duration of one forced push window
// RETURN-FIRE LOCK (controls_gunnery r4): three rounds of aggro plumbing
// (r4 sticky slot, r5 muzzle intel + hard-commit) still measured 76 enemy
// shells / 2 aimed at the player / 0 hits across 5 battles. Two remaining
// holes closed here: (1) notifyUnderFire CLOBBERED lastSeen — the shared
// chase point — with the latest ALLIED shooter's position, so every
// "player-committed" bot was actually driving at the player's escorts; and
// (2) nothing ever forced a bot that could ALREADY see the player to convert
// commitment into trigger time ranked above the closer allied brawl. Now
// state.ts distance-ranks the shell:fired fan-out, and the nearest ranked
// bots (rank <= PLAYER_LOCK_RANK) with a clear personal ray LOCK the player
// as target outright for PLAYER_LOCK_S — no d² ally bias, no cover roll, no
// memory expiry — refreshed on every subsequent player shot.
const PLAYER_LOCK_S = 9;
const PLAYER_LOCK_RANK = 2;      // the three nearest earshot enemies qualify
// PLAYER PRIORITY BUMP + FIRST-AIMED-SHOT BUDGET (controls_gunnery r6): with
// the player parked FULLY BROADSIDE in the open at 196 m, botPressure showed
// aimedAtPlayer stuck at 0 for 30+ s while the bots put 11 shells into the
// allied brawl — a 100 m bot still out-ranked a 200 m player on d² even with
// playerDistMult. Inside PLAYER_NEAR_BONUS range the player's weighted d² is
// halved again (threat x2), and a per-controller budget guarantees that a
// team-spotted player inside PLAYER_BUDGET range with a clear personal ray is
// CLAIMED as target within PLAYER_ENGAGE_BUDGET_S — WoT bots punish a
// stationary flank at 200 m in seconds, not minutes.
const PLAYER_NEAR_BONUS_D2 = 300 * 300; // priority x2 (d² x0.5) inside 300 m
const PLAYER_ENGAGE_BUDGET_S = 8;       // max s a visible near player goes unclaimed
const PLAYER_BUDGET_D2 = 250 * 250;     // budget applies inside 250 m

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
  return spec.gunArcDeg != null && spec.gunArcDeg <= 30;
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
  // bush-sniper play). The underFire/playerAggro slots keep only their
  // POSITIONAL roles: lastSeen chase intel, target priority, and the
  // engage-envelope extension.
  const isVisibleToTeam = (e: AiEntity): boolean =>
    !spotting || spotting.isSpotted(e.id, entity);

  // Ensure the shared input record exists (integration normally creates it).
  ensureAiInput(entity);

  const spec = entity.spec;
  // BATTLE-AI r7 doctrine wiring (see roleOf/ROLE_TUNE above).
  const role = roleOf(spec);
  const tune = ROLE_TUNE[role];
  // Casemate: the gun aims with the HULL (movement.ts §7 auto hull-traverse)
  // — angling would swing the gun off target, so casemates always face in.
  const casemate = isCasemate(spec);
  // r7: the spec's REAL HE-class slot (not a blind index 2 — the sturmtiger
  // carries [HE, HEAT] and `shells[2]` crashed tryFire; probed by class so
  // splash fallbacks and the no-pen fire gate work on every magazine).
  const heSlot = findHeShellSlot(spec);
  const slotHasAmmo = (slot: number): boolean =>
    !Array.isArray(entity.combat?.ammo) || (entity.combat!.ammo[slot] || 0) > 0;
  const firstAvailableSlot = (): number => {
    for (let slot = 0; slot < spec.gun.shells.length; slot++) {
      if (slotHasAmmo(slot)) return slot;
    }
    return -1;
  };
  const angleRad = casemate ? 0 : tune.angle;
  const roleEngageR = () => tier.engageRangeM * tune.engage;
  const roleHoldR = () =>
    Math.min(tier.holdRangeM * tune.hold, roleEngageR() - 60);
  const getAllies = selectAllies(deps);
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
  let lastPlayerEngageS = 0;
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
  let lastFriendlyRisk: FriendlyFireRisk | null = null;
  let underFire: AiEntity | null = null; // shooter revealed by hitting us/a teammate
  let underFireUntilS = -Infinity; // reaction window end (sim seconds)
  let playerAggro: AiEntity | null = null; // sticky PLAYER attacker-of-record (r4)
  let playerAggroUntilS = -Infinity;
  let playerShotsInWindow = 0;     // player shots inside the live intel window (r2)
  let playerLockUntilS = -Infinity; // RETURN-FIRE LOCK window (r4, see tuning)
  // PLAYER-HUNTER BIAS (controls_gunnery r4): r3's flat 0.35 d² weighting
  // still let every bot farm the closer allied escorts while the player
  // plinked from 350 m (probe: 26 enemy shells, zero at the player). A
  // persistent fraction of controllers (~40%) now treats a SPOTTED player
  // as a priority mark — 0.12 d² ranks a 350 m player like a 121 m bot —
  // so somebody always turns on the human without the whole team tunneling.
  const playerHunter = rng() < 0.4;
  const playerDistMult = playerHunter ? 0.12 : PLAYER_THREAT_DIST_MULT;

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
  // STALEMATE BREAKER (controls_gunnery r5): mid-battle enemy fire rate
  // collapsed to 1-2 shells/10 s (bots posturing in patrol/seekCover with
  // live contacts). Track the last time the trigger was actually pulled;
  // a long silent stretch WITH a contact forces a vantage push and
  // suspends cover-seeking for STALEMATE_PUSH_S.
  let lastFiredAtS = 0;
  let pressUntilS = -1;
  let dispGateT = 0; // time spent otherwise-ready but dispersion-gated (r5)
  // coverIQ hesitation decays over the battle so late-game bots commit
  // instead of endlessly rolling hull-down/cover searches between shots.
  // BATTLE-AI r7: role-scaled — snipers/flankers duck between shots more
  // (reload discipline), brawlers hold the line they pushed.
  const effCoverIQ = () => (nowS < pressUntilS
    ? 0
    : clamp(tier.coverIQ * tune.cover, 0, 1) * clamp(1.15 - nowS / 240, 0.35, 1));

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
    return list; // filtered inline at use sites to avoid allocation
  }

  function enemyAlive(e: AiEntity | null | undefined): e is AiEntity {
    return !!e && e !== entity && (!e.combat || !e.combat.destroyed);
  }

  const focusCounts = new Map<string, number>();
  function refreshFocusCounts() {
    focusCounts.clear();
    if (!getAllies) return;
    const friends = getAllies();
    for (let i = 0; i < friends.length; i++) {
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
    // The player remains a high-priority threat, but ordinary visibility may
    // assign only one default attacker. Extra bots join when the player fires
    // or damages the team through the return-fire paths above.
    if (e.isPlayer && focus === 1) return 4.5;
    if (e.isPlayer && focus >= 2) return 8;
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

  function tryLockedPlayer(
    timeS: number,
    eyeX: number,
    eyeYPosition: number,
    eyeZ: number,
  ): boolean {
    if (!playerAggro || !enemyAlive(playerAggro)) return false;
    const lockActive = timeS < playerLockUntilS;
    const repeatedShooter = playerShotsInWindow >= 2 && timeS < playerAggroUntilS;
    if (!lockActive && !repeatedShooter) return false;
    const position = playerAggro.state.pos;
    const clearLine = hasLos(
      eyeX, eyeYPosition, eyeZ,
      position.x, eyeY(playerAggro), position.z,
    );
    claimTarget(playerAggro, timeS, clearLine, isVisibleToTeam(playerAggro));
    return true;
  }

  function tryPlayerEngagementBudget(
    enemies: AiEntity[],
    timeS: number,
    eyeX: number,
    eyeYPosition: number,
    eyeZ: number,
  ): boolean {
    if (target?.isPlayer || timeS - lastPlayerEngageS <= PLAYER_ENGAGE_BUDGET_S) {
      return false;
    }
    for (let index = 0; index < enemies.length; index++) {
      const player = enemies[index];
      if (!player?.isPlayer) continue;
      if (!enemyAlive(player) || !isVisibleToTeam(player)) return false;
      if ((focusCounts.get(player.id) || 0) >= 1) return false;
      const position = player.state.pos;
      const dx = position.x - eyeX;
      const dz = position.z - eyeZ;
      const deploymentRangeSq = deploymentEngageM * deploymentEngageM;
      const budgetDistanceSq = timeS < deploymentUntilS
        ? Math.min(PLAYER_BUDGET_D2, deploymentRangeSq)
        : PLAYER_BUDGET_D2;
      if (dx * dx + dz * dz > budgetDistanceSq) return false;
      if (!hasLos(eyeX, eyeYPosition, eyeZ, position.x, eyeY(player), position.z)) {
        return false;
      }
      claimTarget(player, timeS, true, true);
      return true;
    }
    return false;
  }

  function activeAggressor(timeS: number): AiEntity | null {
    if (playerAggro && timeS < playerAggroUntilS && enemyAlive(playerAggro)) {
      return playerAggro;
    }
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
    if (!aggressor || aggressor === target) return false;
    const position = aggressor.state.pos;
    const seen = isVisibleToTeam(aggressor)
      && hasLos(eyeX, eyeYPosition, eyeZ, position.x, eyeY(aggressor), position.z);
    const hardClaim = !seen && aggressor === playerAggro && playerShotsInWindow >= 2;
    if (!seen && !hardClaim) return false;
    claimTarget(aggressor, timeS, seen, seen);
    return true;
  }

  function tryPrioritizePlayer(
    enemies: AiEntity[],
    timeS: number,
    eyeX: number,
    eyeYPosition: number,
    eyeZ: number,
  ): boolean {
    if (!target || target.isPlayer || !losClear) return false;
    const currentPosition = target.state.pos;
    const currentDx = currentPosition.x - eyeX;
    const currentDz = currentPosition.z - eyeZ;
    const currentDistanceSq = currentDx * currentDx + currentDz * currentDz;
    for (let index = 0; index < enemies.length; index++) {
      const player = enemies[index];
      if (!player?.isPlayer) continue;
      if (!enemyAlive(player) || !isVisibleToTeam(player)) return false;
      if ((focusCounts.get(player.id) || 0) >= 1) return false;
      const position = player.state.pos;
      const dx = position.x - eyeX;
      const dz = position.z - eyeZ;
      const distanceSq = dx * dx + dz * dz;
      const effectiveDistanceSq = distanceSq * playerDistMult
        * (distanceSq < PLAYER_NEAR_BONUS_D2 ? 0.5 : 1);
      if (effectiveDistanceSq >= currentDistanceSq) return false;
      if (!hasLos(eyeX, eyeYPosition, eyeZ, position.x, eyeY(player), position.z)) {
        return false;
      }
      claimTarget(player, timeS, true, true);
      return true;
    }
    return false;
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
    if (!target || target.isPlayer || !losClear) return false;
    const currentHealth = targetHealthFraction(target);
    if (currentHealth == null || currentHealth <= 0.4) return false;
    const currentPosition = target.state.pos;
    const currentDx = currentPosition.x - eyeX;
    const currentDz = currentPosition.z - eyeZ;
    const currentDistanceSq = currentDx * currentDx + currentDz * currentDz;
    for (let index = 0; index < enemies.length; index++) {
      const candidate = enemies[index];
      if (!candidate || candidate === target || candidate.isPlayer || !enemyAlive(candidate)) {
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
    if (!enemyAlive(target)) {
      target = null;
      losClear = false;
      return false;
    }
    const position = target.state.pos;
    const visible = isVisibleToTeam(target);
    losClear = visible
      && hasLos(eyeX, eyeYPosition, eyeZ, position.x, eyeY(target), position.z);
    if (visible) rememberPosition(target, timeS);
    if (tryPrioritizePlayer(enemies, timeS, eyeX, eyeYPosition, eyeZ)) return true;
    if (tryPrioritizeWeakTarget(enemies, timeS, eyeX, eyeYPosition, eyeZ)) return true;
    const memoryActive = timeS - lastSeenAtS <= TARGET_MEMORY_S;
    const aggressorMemory = target === playerAggro && timeS < playerAggroUntilS;
    if (memoryActive || aggressorMemory) return true;
    target = null;
    return false;
  }

  function targetPriority(candidate: AiEntity, distanceSq: number): number {
    const health = targetHealthFraction(candidate);
    const healthWeight = health == null ? 1 : 0.55 + 0.45 * Math.max(0, health);
    const threatDistance = candidate.isPlayer
      ? distanceSq * playerDistMult * (distanceSq < PLAYER_NEAR_BONUS_D2 ? 0.5 : 1)
      : distanceSq;
    return threatDistance * healthWeight * focusWeight(candidate);
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

  function acquireTarget(timeS: number): void {
    const enemies = aliveEnemies();
    refreshFocusCounts();
    const position = entity.state.pos;
    const eyeX = position.x;
    const eyeYPosition = position.y + selfEyeM;
    const eyeZ = position.z;

    if (tryLockedPlayer(timeS, eyeX, eyeYPosition, eyeZ)) return;
    if (tryPlayerEngagementBudget(enemies, timeS, eyeX, eyeYPosition, eyeZ)) return;
    if (tryAggressor(timeS, eyeX, eyeYPosition, eyeZ)) return;
    if (refreshCurrentTarget(enemies, timeS, eyeX, eyeYPosition, eyeZ)) return;
    if (scanVisibleTarget(enemies, timeS, eyeX, eyeYPosition, eyeZ)) return;
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

  function evaluateProbeSlot(
    slot: number,
    shell: DamageShellSpec,
    pose: ReturnType<typeof tankPoseFromState>,
    armor: ArmorModel,
    lateralX: number,
    lateralZ: number,
  ): void {
    if (!target) return;
    const targetPosition = target.state.pos;
    const targetHeight = target.spec.dims.heightM;
    const targetWidth = target.spec.dims.widthM;
    const source = entity.state.pos;
    const candidates = PROBE_SETS[tier.probeLevel];
    for (let i = 0; i < candidates.length; i++) {
      const heightFraction = candidates[i][0];
      const lateralFraction = candidates[i][1];
      const candidateX = targetPosition.x + lateralX * lateralFraction * targetWidth;
      const candidateY = targetPosition.y + heightFraction * targetHeight;
      const candidateZ = targetPosition.z + lateralZ * lateralFraction * targetWidth;
      _vA.set(source.x, source.y + selfEyeM, source.z);
      _vB.set(candidateX - source.x, candidateY - _vA.y, candidateZ - source.z);
      const distance = _vB.length();
      if (distance < 1e-3) continue;
      _vB.multiplyScalar(1 / distance);
      const info = queryAimArmor(_vA, _vB, distance + 10, pose, armor);
      if (!info) continue;
      const ratio = estimatePenRatio(shell, distance, info);
      const score = Math.min(ratio, 1.6) - slot * 0.08 -
        Math.abs(lateralFraction) * 0.02;
      if (score <= probeResult.score) continue;
      probeResult.score = score;
      probeResult.ratio = ratio;
      probeResult.heightFraction = heightFraction;
      probeResult.lateralFraction = lateralFraction;
      probeResult.slot = slot;
    }
  }

  function applyProbeResult(): void {
    if (probeResult.ratio >= 0.9) {
      aimHFrac = probeResult.heightFraction;
      aimLatFrac = probeResult.lateralFraction;
      chosenSlot = probeResult.slot;
      cachedPenRatio = probeResult.ratio;
      penGateOk = true;
      probeMiss = false;
      return;
    }
    aimLatFrac = 0;
    chosenSlot = slotHasAmmo(heSlot) ? heSlot : firstAvailableSlot();
    penGateOk = false;
    if (probeResult.score > -Infinity) {
      aimHFrac = 0.5;
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
    for (let slot = 0; slot < spec.gun.shells.length; slot++) {
      const shell = spec.gun.shells[slot];
      if (!shell || !slotHasAmmo(slot)) continue;
      evaluateProbeSlot(slot, shell, pose, armor, lateralX, lateralZ);
      if (probeResult.ratio >= 1.05 && probeResult.slot === 0) break;
    }
    applyProbeResult();
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
        if (hasLos(cx, hC + selfEyeM, cz, tp.x, eyeY(target), tp.z)) {
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

  function startFlank(timeS: number): void {
    if (!target) return;
    const st = entity.state;
    const tp = target.state.pos;
    const dx = st.pos.x - tp.x, dz = st.pos.z - tp.z;
    const dist = Math.hypot(dx, dz) || 1;
    const r = clamp(dist, 80, 200);
    const baseAng = Math.atan2(dx, dz);            // bearing target → self
    const side = rng() < 0.5 ? 1 : -1;
    for (let i = 0; i < 3; i++) {
      const a = baseAng + side * (0.6 + 0.6 * i);  // 34°, 69°, 103° around the target
      flankPoints[i].x = tp.x + Math.sin(a) * r;
      flankPoints[i].z = tp.z + Math.cos(a) * r;
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
      if (o.crushed) continue; // gameplay_feel r6: felled crushables don't block
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
    return score;
  }

  function scanAllyRisk(input: AiInput): boolean {
    if (!getAllies) return false;
    const st = entity.state;
    allyRisk.motionSign = input.throttle >= 0 ? 1 : -1;
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
      if (!ally || !ally.state || (ally.combat && ally.combat.destroyed)) continue;
      bestScore = considerAllyRisk(
        ally, forwardX, forwardZ, look, ownHalfLength, bestScore,
      );
    }
    return allyRisk.ally !== null;
  }

  function applyAllySteering(input: AiInput): boolean {
    const best = allyRisk.ally;
    if (!best) return false;
    allyAvoidingId = best.id;
    allyClosestM = allyRisk.distance;
    const following = allyRisk.headingDot > 0.55 && allyRisk.along > 0;
    const headOn = allyRisk.headingDot < -0.25;
    const hasPriority = String(entity.id) < String(best.id);
    const mustYield = following || !hasPriority;
    allyYielding = mustYield;
    const side = headOn ? 1 : Math.sign(
      (Math.abs(allyRisk.predictedCross) > 0.2
        ? -allyRisk.predictedCross : -allyRisk.cross) ||
      (hasPriority ? -1 : 1));
    input.steer = clamp(input.steer + side * (headOn ? 1.0 : 0.9), -1, 1);
    return mustYield;
  }

  function aftCorridorClear(best: AiEntity): boolean {
    const st = entity.state;
    const backX = -Math.sin(st.yaw);
    const backZ = -Math.cos(st.yaw);
    for (let i = 0; i < allyRisk.friends.length; i++) {
      const other = allyRisk.friends[i];
      if (!other || other === best || !other.state ||
          (other.combat && other.combat.destroyed)) continue;
      const relativeX = other.state.pos.x - st.pos.x;
      const relativeZ = other.state.pos.z - st.pos.z;
      const along = relativeX * backX + relativeZ * backZ;
      const cross = backZ * relativeX - backX * relativeZ;
      if (along > 0 && along < 10 && Math.abs(cross) < allyRisk.ownHalfWidth + 2.4) {
        return false;
      }
    }
    return true;
  }

  function resolveAllyEmergency(input: AiInput, dt: number, mustYield: boolean): boolean {
    const best = allyRisk.ally;
    if (!best) return false;
    const longitudinalGap = allyRisk.along - allyRisk.longSafe;
    const emergency = allyRisk.distance < allyRisk.ownRadius +
      tankSafetyRadius(best) * 0.74 + 0.55 ||
      (allyRisk.along > 0 && longitudinalGap < 0.8);
    if (!emergency) return false;
    if (!allyEmergencyActive) allyEmergencyStops++;
    allyEmergencyActive = true;
    input.throttle = 0;
    input.brake = allyRisk.speed > 0.45;
    allyDeadlockT += allyRisk.speed < 0.7 ? dt : 0;
    if (mustYield && allyDeadlockT > 0.9 && allyRisk.speed < 0.45 &&
        aftCorridorClear(best)) {
      input.throttle = -0.42;
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

  function avoidAllies(input: AiInput, dt: number): void {
    if (Math.abs(input.throttle) <= 0.05 || !scanAllyRisk(input)) {
      decayAllyAvoidance(dt);
      return;
    }
    const mustYield = applyAllySteering(input);
    if (mustYield) allyYieldT += dt;
    else allyYieldT = Math.max(0, allyYieldT - dt);
    if (resolveAllyEmergency(input, dt, mustYield)) return;
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
    let previousH = startH;
    let worstCost = 1;
    const debuff = entity.state._debuff;
    const powerMult = debuff?.powerMult ?? 1;
    const accelMult = debuff?.accelMult ?? 1;
    for (let distance = TERRAIN_ROUTE_STEP_M;
      distance <= TERRAIN_ROUTE_LOOK_M; distance += TERRAIN_ROUTE_STEP_M) {
      const x = sx + ux * distance;
      const z = sz + uz * distance;
      const height = hf.getHeightAt(x, z);
      const rise = (height - previousH) / TERRAIN_ROUTE_STEP_M;
      const ground = typeof hf.getGroundType === 'function'
        ? hf.getGroundType(x, z)
        : 'medium';
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
    const startH = hf.getHeightAt(sx, sz);
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
      if (o.crushed || o.crushable) continue;
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
      if (Math.max(Math.abs(cx), Math.abs(cz)) > 500) continue;
      const d1 = Math.hypot(cx - sourceX, cz - sourceZ);
      if (d1 < 2) continue; // standing on this corner already
      if (nowS < lastCorner.untilS &&
          Math.hypot(cx - lastCorner.x, cz - lastCorner.z) < 3) continue;
      if (routeSegmentHitsBox(sourceX, sourceZ, cx, cz, box, margin)) continue;
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
      chooseRouteCorner(
        box, sourceX, sourceZ, gx, gz, directionX, directionZ, margin,
      );
      return;
    }
    if (nowS < terrainRouteUntilS) {
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
        if (o.crushed || o.crushable) continue;
        const entry = rayCollisionFootprintEntry2(
          o as CollisionRecord, sx, sz, ux, uz, clear, margin,
        );
        if (entry != null) clear = entry;
      }
      if (clear < 12) continue;
      const ex = sx + ux * clear, ez = sz + uz * clear;
      if (Math.max(Math.abs(ex), Math.abs(ez)) > 470) continue;
      const h0 = hf.getHeightAt(sx, sz);
      const terrainCost = terrainLineCost(sx, sz, h0, ux, uz);
      if (!Number.isFinite(terrainCost)) continue;
      const score = clear - (terrainCost - 1) * 4 + rng() * 3;
      if (score > bestScore) { bestScore = score; bx = ex; bz = ez; }
    }
    if (bestScore === -Infinity) return false;
    scootPoint.x = bx;
    scootPoint.z = bz;
    scootUntilS = nowS + 6;
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
  function driveToXZ(input: AiInput, x: number, z: number, speedScale: number): boolean {
    const st = entity.state;
    let dx = x - st.pos.x, dz = z - st.pos.z;
    let dist = Math.hypot(dx, dz);
    trackNavProgress(x, z, dist); // r6 wedge watchdog (see update())
    if (dist < ARRIVE_DIST_M) {
      input.throttle = 0;
      input.steer = 0;
      input.brake = Math.abs(st.speed) > 0.5;
      return true;
    }
    // r7 CORNER-HOP ROUTER (see planRoute): re-plan when the goal moved or
    // the recheck timer lapsed; while a solid blocker sits on the straight
    // line, the steering goal becomes the corner around it.
    if (routeTimer <= 0 ||
        Math.abs(x - routeGoalX) > 12 || Math.abs(z - routeGoalZ) > 12) {
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
    const vantageAfterS = target && (target.isPlayer || timeS < pressUntilS) ? 2 : 5;
    if (losBlockedT > vantageAfterS && findVantage()) {
      hasVantage = true;
      driveToXZ(input, vantage.x, vantage.z, 1.0);
      return;
    }
    if (!target) return;
    if (chaseToXZ(input, lastSeen.x, lastSeen.z, target.isPlayer ? 1.0 : 0.9)) {
      setVantageTowardEnemySector();
    }
  }

  function updateEngagementSettle(timeS: number): void {
    const reload = entity.combat && entity.combat.reload;
    if (timeS - lastFiredAtS <= 8 || timeS < settleUntilS ||
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
      (target && target.isPlayer && timeS < playerAggroUntilS) ||
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
    const gunOut = modules && modules.gun && modules.gun.state === 'red';
    const shouldReverse = (reload && reload.t > 1.2 && role !== 'brawler' && !casemate) || gunOut;
    if (shouldReverse && distToTarget > 55) {
      reverseFacing(input, bearing, -0.45);
      return;
    }
    const ringOut = modules && modules.turretRing && modules.turretRing.state !== 'ok';
    faceYaw(input, bearing + (ringOut ? 0 : angleRad * angleSide));
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
    if (hasMoveTarget) {
      if (driveToXZ(input, moveTarget.x, moveTarget.z, 0.6)) hasMoveTarget = false;
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
      if (!enemyAlive(e)) continue;
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
      const candidateX = st.pos.x + Math.sin(angle) * radius;
      const candidateZ = st.pos.z + Math.cos(angle) * radius;
      if (Math.max(Math.abs(candidateX), Math.abs(candidateZ)) > 470) continue;
      const normalY = hf.getNormalAt ? hf.getNormalAt(candidateX, candidateZ).y : 1;
      if (normalY < 0.94) continue;
      const candidateY = hf.getHeightAt(candidateX, candidateZ) + selfEyeM;
      const hasSight = hasLos(
        candidateX, candidateY, candidateZ, targetX, targetY, targetZ,
      );
      const score = (hasSight ? 100 : 0) + normalY * 10 - radius * 0.1;
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
      if (flatCandidate.found && flatCandidate.score >= 100) break;
    }
    if (!flatCandidate.found) return false;
    scootPoint.x = flatCandidate.x;
    scootPoint.z = flatCandidate.z;
    return true;
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
    if ((combat?.reload?.t ?? 0) > 1e-3 && loadingSlot != null && slotHasAmmo(loadingSlot)) {
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

  function blindFireActive(timeS: number, distance: number): boolean {
    return !!target && !losClear && target.isPlayer === true
      && playerShotsInWindow >= 2 && timeS < playerAggroUntilS
      && losBlockedT > 15 && distance <= MAX_FIRE_RANGE_M;
  }

  function blindLockActive(timeS: number): boolean {
    if (!target || !losClear || !target.isPlayer || !spotting || isVisibleToTeam(target)) {
      return false;
    }
    return timeS < playerLockUntilS
      || (playerShotsInWindow >= 2 && timeS < playerAggroUntilS);
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
    input.shellSlot = clamp(chosenSlot, 0, Math.min(2, spec.gun.shells.length - 1));
  }

  function updateBasicFireGates(distance: number, timeS: number): void {
    const combat = entity.combat;
    const gunDisabled = combat?.modules?.gun?.state === 'red';
    fireGate.distance = distance;
    fireGate.reactionReady = timeS - acquiredAtS >= tier.reactionS;
    fireGate.reloadReady = !combat || (
      !!combat.reload && combat.reload.t <= 1e-3 && !combat.destroyed && !gunDisabled
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
      if (pickFlatCell()) beginScoot(10);
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
  }

  function aimAndFire(input: AiInput, dt: number, timeS: number): void {
    if (!target || !enemyAlive(target)) {
      setIdleScan(input, timeS);
      return;
    }
    const shell = selectedShell(entity.combat);
    if (!shell) {
      input.fire = false;
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
    const ordinaryShot = gunReady && accurateEnough && fireGate.aligned
      && (penGateOk || chosenSlot === heSlot);
    const blindShot = fireGate.blindFire && fireGate.reactionReady
      && fireGate.reloadReady && fireGate.rangeReady && fireGate.aligned;
    const friendlyRisk = updateFriendlyFireGate(
      input,
      shell,
      dt,
      ordinaryShot || blindShot,
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
    if (timeS <= flankUntilS && aspectAngle() <= FLANK_ASPECT_RAD && flankIndex < 3) {
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
    nudgeUntilS = timeS + 1.2;
    gunLimitT = 0;
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
    if (target?.isPlayer) lastPlayerEngageS = timeS;
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
    for (let index = 0; index < enemies.length; index++) {
      const candidate = enemies[index];
      if (!enemyAlive(candidate)) continue;
      const dx = candidate.state.pos.x - position.x;
      const dz = candidate.state.pos.z - position.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= nearestDistanceSq) continue;
      nearestDistanceSq = distanceSq;
      nearest = candidate;
    }
    return nearest;
  }

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

  function updateStalematePolicy(timeS: number): void {
    const hasContact = !!(target && enemyAlive(target))
      || timeS - lastSeenAtS < TARGET_MEMORY_S + 6;
    if (hasContact && timeS - lastFiredAtS > STALEMATE_SILENT_S
        && timeS >= pressUntilS) {
      pressUntilS = timeS + STALEMATE_PUSH_S;
      hasMoveTarget = false;
      hasCoverPoint = false;
      if (mode === 'seekCover' || mode === 'patrol') mode = 'engage';
      if (target && !losClear && findVantage()) hasVantage = true;
      if (target && losClear) settleUntilS = timeS + 3.5;
      return;
    }
    const maySearch = timeS >= deploymentUntilS && !hasContact
      && timeS - lastFiredAtS > 25 && timeS >= pressUntilS;
    if (!maySearch) return;
    const enemy = nearestLivingEnemy();
    if (!enemy) return;
    pressUntilS = timeS + STALEMATE_PUSH_S;
    routeTowardEnemySector(enemy);
  }

  function currentTargetDistance(): number {
    if (!target) return Infinity;
    const position = entity.state.pos;
    return Math.hypot(
      target.state.pos.x - position.x,
      target.state.pos.z - position.z,
    );
  }

  function beginScoot(durationS: number): void {
    scootUntilS = nowS + durationS;
    hasMoveTarget = false;
    hasCoverPoint = false;
    if (mode === 'seekCover') mode = 'engage';
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
      const shouldScoot = tune.scootAfter > 0
        && shotsFromSpot >= tune.scootAfter
        && timeS >= scootUntilS;
      if (shouldScoot && pickScoot()) beginScoot(14);
    }
    prevReloadT = reloadTime;
  }

  function updateProbeRelocation(dt: number, timeS: number): void {
    probeMissT = probeMiss && target && losClear ? probeMissT + dt : 0;
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
    fallbackReverse = Math.abs(wrapAngle(supportYaw - entity.state.yaw)) > Math.PI * 0.55;
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

  function updateDoctrine(
    combat: CombatState | undefined,
    dt: number,
    timeS: number,
    targetDistance: number,
  ): void {
    updateShotRelocation(combat, timeS);
    updateProbeRelocation(dt, timeS);
    maybeStartFallback(combat, timeS, targetDistance);
  }

  function updateFriendlyLaneRelocation(timeS: number): void {
    const shouldRelocate = friendlyBlockT >= FRIENDLY_LANE_RELOCATE_S
      && target && losClear && timeS >= scootUntilS;
    if (!shouldRelocate || !pickFriendlyFireLane()) return;
    beginScoot(7);
    friendlyBlockT = 0;
    friendlyLaneMoves++;
  }

  function driveCurrentMode(input: AiInput, timeS: number, targetDistance: number): void {
    input.brake = false;
    driveIntent = false;
    if (timeS < settleUntilS && target && losClear) {
      faceYaw(input, Math.atan2(
        target.state.pos.x - entity.state.pos.x,
        target.state.pos.z - entity.state.pos.z,
      ));
      return;
    }
    if (timeS < scootUntilS) {
      if (driveToXZ(input, scootPoint.x, scootPoint.z, 0.95)) {
        scootUntilS = -1;
        spotPos.x = entity.state.pos.x;
        spotPos.z = entity.state.pos.z;
        shotsFromSpot = 0;
        relocations++;
      }
      return;
    }
    if (mode === 'patrol') drivePatrol(input);
    else if (mode === 'engage') driveEngage(input, timeS, targetDistance);
    else if (mode === 'seekCover') driveToXZ(input, coverPoint.x, coverPoint.z, 0.9);
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
    avoidAllies(input, dt);
    input.actionBits = chooseAiSupportActionBits(entity, timeS, {
      safeToReloadMagazine: !target || !losClear || mode === 'seekCover',
      wantsSuspensionAim: !!target && losClear
        && Math.abs(entity.state.speed) < 1.5
        && Math.abs(input.throttle) < 0.2,
    });
    aimAndFire(input, dt, timeS);
    controller.state = mode;
  }

  // ---- main update ----------------------------------------------------------

  function update(dt: number, timeS: number): void {
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

    updateDoctrine(cb, dt, timeS, distToTarget);

    // A stable friendly obstruction should produce a better firing angle,
    // not a blocked trigger forever. Movement begins on the tick after the
    // fire-discipline gate observes the corridor, keeping AI/fire ordering
    // deterministic and identical for both teams.
    updateFriendlyLaneRelocation(timeS);

    driveCurrentMode(input, timeS, distToTarget);

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
  function setWaypoints(
    points: Array<[number, number]>,
    { loop = true }: { loop?: boolean } = {},
  ): void {
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
  function notifyShellResult(hitEvent: Pick<HitEvent, 'targetId' | 'kind'>): void {
    if (!hitEvent) return;
    if (target && hitEvent.targetId === target.id) {
      const k = hitEvent.kind;
      if (k === 'nonpen' || k === 'ricochet' || k === 'spaced_absorb' || k === 'era') {
        nonPenCount++;
        probeTimer = 0; // re-evaluate aim zone / shell slot immediately
        if (nonPenCount >= 2 && mode !== 'flank') startFlank(nowS);
      } else if (k === 'pen' || k === 'he_pen') {
        nonPenCount = 0;
      }
    }
    resampleAimError();
  }

  /**
   * Reaction to this tank (or a nearby teammate) taking an enemy hit: acquire
   * the shooter past the spotting gate, remember its position, and extend the
   * engage envelope toward it for UNDER_FIRE_WINDOW_S. A PLAYER shooter always
   * steals the target slot — return fire at the protagonist is the point.
   * @param {object} shooterEnt TankEntity that fired the shell
   */
  function notifyUnderFire(shooterEnt: AiEntity): void {
    if (!shooterEnt || !shooterEnt.state || !shooterEnt.combat ||
        shooterEnt.combat.destroyed || shooterEnt.team === entity.team) return;
    if (shooterEnt.isPlayer) {
      // sticky attacker-of-record slot (r4) — teammate hits can't erase it
      playerAggro = shooterEnt;
      playerAggroUntilS = nowS + PLAYER_AGGRO_WINDOW_S;
    }
    underFire = shooterEnt;
    underFireUntilS = nowS + UNDER_FIRE_WINDOW_S;
    // RETURN-FIRE LOCK (controls_gunnery r4) ROOT-CAUSE FIX: lastSeen is the
    // CHASE POINT for the CURRENT target, but this unconditional write
    // teleported it onto whichever ALLIED bot landed the latest teammate hit
    // — so every bot "committed" to the player was measurably driving at the
    // player's escorts instead (r5 probe: aggro'd bots stalled mid-chase,
    // 76 enemy shells / 2 aimed at the player). The intel position now only
    // updates when the shooter IS — or here BECOMES — the target.
    const takesSlot = !target || !enemyAlive(target) ||
        shooterEnt === target ||
        (shooterEnt.isPlayer && target !== shooterEnt);
    if (takesSlot) {
      lastSeen.x = shooterEnt.state.pos.x;
      lastSeen.z = shooterEnt.state.pos.z;
      lastSeenAtS = nowS;
    }
    if (!target || !enemyAlive(target) ||
        (shooterEnt.isPlayer && target !== shooterEnt)) {
      target = shooterEnt;
      acquiredAtS = nowS;
      nonPenCount = 0;
      probeTimer = 0;
      if (mode === 'patrol') mode = 'engage';
    }
  }

  /**
   * PLAYER MUZZLE-FLASH INTEL (controls_gunnery r5): the player FIRED within
   * earshot (state.ts fans this out to enemies within 420 m on every player
   * shell:fired). Muzzle flash + tracer reveal the shooter — the player
   * claims the sticky attacker-of-record slot and idle bots commit to the
   * contact immediately. camo_spotting r2: actual VISIBILITY of the shooter
   * resolves through the spotting sim (notifyFired forces a bloom-hot check;
   * canSpot's flash branch covers beyond-view-range open-ground shots), so
   * this slot carries position intel and priority, never gate immunity.
   * Unlike notifyUnderFire this never steals an ENGAGED bot's living target
   * outright — acquireTarget's aggro path (clear personal ray) and the
   * threat-weighted re-rank handle that on the next LOS tick.
   * @param {object} shooterEnt the player TankEntity that fired
   * @param {number} [rank=99] distance rank among this shot's earshot
   *   receivers (0 = nearest enemy to the player; state.ts sorts the fan-out)
   */
  function recordPlayerShotIntel(shooter: AiEntity): void {
    if (nowS > playerAggroUntilS) playerShotsInWindow = 0;
    playerShotsInWindow++;
    playerAggro = shooter;
    playerAggroUntilS = Math.max(playerAggroUntilS, nowS +
      (playerShotsInWindow >= 2 ? MUZZLE_INTEL_REPEAT_WINDOW_S : MUZZLE_INTEL_WINDOW_S));
  }

  function rememberShooterPosition(shooter: AiEntity): void {
    const position = shooter.state.pos;
    lastSeen.x = position.x;
    lastSeen.z = position.z;
    lastSeenAtS = nowS;
  }

  function assignShooterTarget(shooter: AiEntity): void {
    if (target !== shooter) {
      target = shooter;
      acquiredAtS = nowS;
      nonPenCount = 0;
      probeTimer = 0;
    }
    rememberShooterPosition(shooter);
  }

  function tryLockFiringPlayer(shooter: AiEntity, rank: number): boolean {
    if (rank > PLAYER_LOCK_RANK ||
        (!isVisibleToTeam(shooter) && playerShotsInWindow < 2)) return false;
    const st = entity.state;
    const position = shooter.state.pos;
    if (!hasLos(
      st.pos.x, st.pos.y + selfEyeM, st.pos.z,
      position.x, eyeY(shooter), position.z,
    )) return false;
    playerLockUntilS = nowS + PLAYER_LOCK_S;
    assignShooterTarget(shooter);
    losClear = true;
    hasMoveTarget = false;
    hasCoverPoint = false;
    hasVantage = false;
    if (mode !== 'engage' && mode !== 'flank') mode = 'engage';
    return true;
  }

  function claimIdleFiringPlayer(shooter: AiEntity): boolean {
    if (target && enemyAlive(target)) return false;
    if (!isVisibleToTeam(shooter) && playerShotsInWindow < 2) return true;
    assignShooterTarget(shooter);
    if (mode === 'patrol') mode = 'engage';
    return true;
  }

  function claimRepeatFiringPlayer(shooter: AiEntity): void {
    if (playerShotsInWindow < 2 || target === shooter || target?.isPlayer) return;
    assignShooterTarget(shooter);
    losClear = false;
    if (mode === 'patrol' || mode === 'seekCover') mode = 'engage';
  }

  function notifyPlayerFired(shooterEnt: AiEntity, rank = 99): void {
    if (!shooterEnt || !shooterEnt.state || !shooterEnt.combat ||
        shooterEnt.combat.destroyed || shooterEnt.team === entity.team) return;
    recordPlayerShotIntel(shooterEnt);
    if (tryLockFiringPlayer(shooterEnt, rank)) return;
    if (target === shooterEnt) rememberShooterPosition(shooterEnt);
    if (claimIdleFiringPlayer(shooterEnt)) return;
    claimRepeatFiringPlayer(shooterEnt);
  }

  /** Authoritative fire path callback when a same-tick friendly crossing was
   * caught after the controller update. It feeds the same relocation timer. */
  function notifyFriendlyBlocked(risk: FriendlyFireRisk | null | undefined): void {
    if (!risk) return;
    if (friendlyBlockT <= 0) friendlyBlockCount++;
    friendlyBlockT = Math.max(friendlyBlockT, 0.25);
    lastFriendlyRisk = risk;
  }

  const controller: AiController = {
    update,
    setWaypoints,
    notifyShellResult,
    notifyUnderFire,
    notifyPlayerFired,
    notifyFriendlyBlocked,
    get targetId() { return target ? target.id : null; },
    /** Headless-probe introspection (controls_gunnery r5): gate snapshot. */
    debugInfo: () => ({
      mode, targetId: target ? target.id : null,
      targetIsPlayer: !!(target && target.isPlayer),
      // BATTLE-AI r7 doctrine surface: class role + measurable signals
      // (sniper relocations, live scoot/kite/fallback windows) for probes.
      role, relocations, shotsFromSpot,
      scooting: nowS < scootUntilS,
      kiting: nowS < kiteUntilS,
      fallingBack: nowS < fallbackUntilS,
      hpFrac: entity.combat && entity.combat.maxHp
        ? +(entity.combat.hp / entity.combat.maxHp).toFixed(2) : 1,
      burstDamage: Math.round(burstDamage),
      friendlyBlockT: +friendlyBlockT.toFixed(2),
      friendlyBlockCount,
      friendlyLaneMoves,
      friendlyBlockKind: lastFriendlyRisk ? lastFriendlyRisk.kind : null,
      friendlyBlockId: lastFriendlyRisk ? lastFriendlyRisk.allyId : null,
      allyYielding, allyAvoidingId,
      allyClosestM: Number.isFinite(allyClosestM) ? +allyClosestM.toFixed(2) : null,
      allyYieldT: +allyYieldT.toFixed(2),
      allyEmergencyStops, allyReverseEscapes,
      losBlockedT: +losBlockedT.toFixed(1), hasVantage,
      navT: +navNoProgressT.toFixed(1), strikes: stuckStrikes, // r6 watchdog
      playerBudgetT: +(nowS - lastPlayerEngageS).toFixed(1),   // r6 budget arm
      pressing: nowS < pressUntilS,
      playerShotsInWindow, // r2: repeat-offender aggro count (intel window)
      playerLocked: nowS < playerLockUntilS, // r4 RETURN-FIRE LOCK live
      // camo_spotting r7: chase-intel snapshot for the acquisition selftest —
      // asserts a hardClaim keeps the MUZZLE stamp, never the live position,
      // while the spotting sim hides the shooter.
      lastSeenX: lastSeen.x, lastSeenZ: lastSeen.z, lastSeenAtS,
      targetTrackLagS: +targetTrackLagS.toFixed(3),
      targetLeadScale: +targetLeadScale.toFixed(3),
      ..._dbg,
    }),
    state: mode,
  };
  (entity as ControllerOwnedEntity).ai = controller;
  return controller;
}
