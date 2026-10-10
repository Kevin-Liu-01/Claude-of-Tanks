import type { ModeCheckpoint } from './matchModes.ts';
import { initializeAerial, stepAerial, isGunship, captureAerial, restoreAerial, type AerialCheckpoint, type AerialView } from './aerialCombat.ts';
import { setModeWeapon } from './modeLoadout.ts';
import { packSmokeScreen } from './smokeReceipt.ts';
import { requestAuxiliary, stepRoofGun, auxiliaryShot, smokeBlocks, type SmokeScreen } from './auxiliarySystems.ts';
import { bridgeBallFloor } from './bridgeBallSupport.ts';
import { usesLauncherMuzzles, isUnguidedRocket, launcherMuzzleIndex } from './launcherPolicy.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';
/**
 * Headless authoritative battle simulation.
 *
 * This is the multiplayer-safe composition seam for the existing pure combat
 * modules. It deliberately owns no Three.js scene objects, DOM state, camera,
 * audio, localStorage, or presentation events. Browser-hosted private rooms,
 * solo loopback, and dedicated Node servers can all run the same instance.
 */

import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { getSpec } from '../vehicles/specs.ts';
import type { FleetTankSpec } from '../vehicles/specContracts.ts';
import { getMapConfig } from '../world/maps/index.ts';
import type { BattlefieldMapConfig } from '../world/maps/index.ts';
import { createHeightField, createLayout } from '../world/terrain.ts';
import type { HeightField, TerrainLayout } from '../world/terrain.ts';
import {
  SIM_DT,
  computeDispersionRadM,
  createTankState,
  fireRecoil,
  requestTankJump,
  applyShellKnock,
  shellKnockMps,
  updateTank,
  IMPACT_SOURCE_CLIFF,
  IMPACT_SOURCE_COLLIDER,
} from './movement.ts';
import type { MovementCombatState, TankState } from './movement.ts';
import {
  exchangeRamMomentum, fallAttitudeFactor, hullVelocityAlong, ramAggression, ramShares, resolveHullImpact,
  type HullImpactKind, type HullImpactResult,
} from './impact.ts';
import { createHullSupportPose, createStructureSupportField, hullSupportPose } from './structureSupport.ts';
import {
  prefersVerticalTankContact,
  tanksVerticallyClear,
  resolveTankBodyContacts,
} from './tankBodyContacts.ts';
import { tankBodyTopM, tankContactRect } from './tankContactShape.ts';
import { requestTankSelfRight, stepRolloverLifecycle } from './rollover.ts';
import {
  applyDispersion, createShell, guideShellToward, stepShell,
} from './ballistics.ts';
import { tankPoseFromState, traceTank } from './armor.ts';
import type { ArmorIntersection } from './armor.ts';
import {
  createCombatState,
  isHeClass,
  repairAllModules,
  resolveHeBurst,
  resolveShellHit,
  selectFirstAvailableShell,
  selectShell,
  selectedWeaponModuleState,
  magazineReloadDenialReason,
  startMagazineReload,
  startPostShotReload,
  tickReload,
  tickFire,
  tickModuleRepairs,
  hullDamageTaken,
} from './damage.ts';
import type {
  CombatState,
  DamageShell,
  DamageShellSpec,
  HitEvent,
} from './damage.ts';
import { createSpottingSystem } from './spotting.ts';
import type {
  ConcealerDisc,
  SpottingRayHit,
  SpottingVector3,
} from './spotting.ts';
import { captureWorldSnapshot } from './worldSnapshot.ts';
import { capturePredictionAuthorityState } from './predictionAuthorityState.ts';
import type {
  SnapshotEntitySource,
  SnapshotShellSource,
  WorldSnapshot,
} from './worldSnapshot.ts';
import {
  pushHullFromHull, createHullFootprint, hullFootprint,
  hullPassesObstacleTop, hullUndersideOver, pushHullFromObstacle,
  shellPassesThroughCollisionRecord,
} from '../world/collision.ts';
import type { CollisionRecord } from '../world/collision.ts';
import { pushHullInsidePlayableBounds } from '../world/battlefieldBounds.ts';
import { applyEquipmentToCombat, defaultLoadoutFor } from '../game/equipment.ts';
import type { EquipmentCombatState } from '../game/equipment.ts';
import { botFriendlyFireRisk, createAI, roleOf } from '../game/ai.ts';
import type { AiDifficulty } from '../game/ai.ts';
import {
  collectNavigationWrecks, createBotNavigationGrid, planBotRoute, syncNavigationWrecks, type NavigationWreck,
} from './botRoutePlanner.ts';
import type { BotRoutePoint } from './botRoutePlanner.ts';
import { CONSUMABLE_RULES, cooldownRemaining } from '../game/consumables.ts';
import { PLAYER_ACTION_BITS } from './playerActions.ts';
import { decodeAimIntent } from './aimIntent.ts';
import type { AimIntentInput } from './aimIntent.ts';
import {
  activateSpecialAction,
  bindSpecialActionState,
  createSpecialActionState,
  specialActionGuidesShell,
} from './specialActions.ts';
import { consumeAmmunition, hasAmmunition } from './ammunition.ts';
import { createMatchModeController, normalizeGameMode } from './matchModes.ts';
import {
  applyRulesetToCombat, endingHoldExpired, matchRulesetFor, refillUnlimitedAmmunition, rulesetLoadout, type MatchRuleset,
  type RulesetPhysics,
} from './matchRuleset.ts';
import { createMatchPlacement, matchPlacementAnchors, placementTankRadius, type MatchPlacement } from './matchPlacement.ts';
import type {
  GameModeId,
  MatchModeController,
  MatchModeEntity,
  MatchModeResult,
  MatchModeSpawn,
  ObjectiveTeam,
} from './matchModes.ts';
import type { SpecialActionState } from './specialActionPolicy.ts';
import { createDestructionMatch } from './destructionMatch.ts';
import type {
  DestructionLogEntry, StructureBreachEvent, StructureStageEvent, TerrainCraterEvent,
} from './destructionEvents.ts';
import { shellHitsWater } from './shellSurface.ts';
import { architectureStyleOf, wallMaterialForStyle } from './structureMaterial.ts';
import { PROP_FELL_PER_BLAST, PROP_FELL_PER_TICK, munitionChargeKg, munitionClassForShell, propFellRadiusM } from './munitionBlast.ts';
import { createDeformedHeightField, createTerrainDeformation, rubbleFalloffM, rubbleHeightFor } from './terrainDeformation.ts';
import { fellConcealersAt } from './spotting.ts';

type Team = typeof TEAM_ALPHA | typeof TEAM_BRAVO;
type LobbyTeam = Team | typeof TEAM_SPECTATOR;
type MatchPhase = 'loading' | 'countdown' | 'playing';
type MatchResult = ObjectiveTeam | 'draw';
type Rng = () => number;

interface AuthoritativeSpawn {
  x: number;
  z: number;
  yaw?: number;
}

export interface AuthoritativePlayerRecord {
  id: string;
  specId: string;
  team?: LobbyTeam | string;
  spawn?: AuthoritativeSpawn;
  bot?: boolean;
  equipment?: readonly string[] | null;
  difficulty?: AiDifficulty;
}

export interface AuthoritativePlayerInput extends AimIntentInput {
  throttle: number;
  steer: number;
  brake: boolean;
  fire: boolean;
  fireIntentSeq?: number | null;
  aimLocked?: boolean;
  shellSlot: number;
  actionBits: number;
  auxiliaryBits?: number;
}

interface AuthoritativeInput {
  auxiliaryBits?: number;
  throttle: number;
  steer: number;
  brake: boolean;
  fire: boolean;
  aimLocked: boolean;
  shellSlot: number;
  actionBits: number;
  aimPoint: Vector3;
  [name: string]: RuntimeValue;
}

type AuthoritativeSpec = FleetTankSpec;

type AuthoritativeCombatState = CombatState & EquipmentCombatState &
  MovementCombatState & MatchModeEntity['combat'];

interface AIFriendlyRisk {
  allyId: string;
  kind: string;
  clearanceM: number;
}

interface AuthoritativeAIController {
  update(dt: number, timeS: number): void;
  setWaypoints(points: readonly BotRoutePoint[], options?: { loop?: boolean }): void;
  notifyShellResult(event: HitEvent): void;
  notifyUnderFire(entity: AuthoritativeEntity, info?: { selfHit?: boolean; damaging?: boolean; kind?: string }): void;
  notifyEnemyFired(entity: AuthoritativeEntity): void;
  notifyFriendlyBlocked(risk: AIFriendlyRisk): void;
}

export interface AuthoritativeEntity {
  id: string;
  specId: string;
  spec: AuthoritativeSpec;
  team: Team;
  state: TankState;
  combat: AuthoritativeCombatState;
  input: AuthoritativeInput;
  equip: string[];
  loadout: string[];
  bot: boolean;
  isPlayer: boolean;
  connected: boolean;
  kills: number;
  damage: number;
  consumableReadyAt: number[];
  specialAction: SpecialActionState;
  aiCtl?: AuthoritativeAIController;
  aerial?: AerialView;
  modeActive?: boolean;
  modeSpeedMultiplier?: number;
  modeGravityScale?: number;
  modeJumpMps?: number | null;
  modeRecoilLaunchScale?: number;
  modeShellKnockScale?: number;
  /** Ruleset impact physics block (matchRuleset.ts) the movement reads for the landing rebound. */
  modePhysics?: RulesetPhysics | null;
  _modeTargetX?: number;
  _modeTargetZ?: number;
  _deniedShellSlot?: number;
  /** Impact physics: closing speed already priced in the crash still resolving, and when it last grew. */
  _impactAccumMps?: number;
  _impactAccumT?: number;
  /** Destruction: the structure record this hull met hard this tick (a crash prices a ram on it). */
  _ramRecord?: AuthoritativeObstacle | null;
  /** Destruction: the share of its speed the hull keeps after rammed structures yielded this tick (applied after the
   * move, as a crushed prop's crushKeep is). */
  _ramKeep?: number;
}

export interface AuthoritativeObstacle extends CollisionRecord {
  _pressT?: number;
  _pressS?: number;
}

interface AuthoritativeWorldRayHit extends SpottingRayHit {
  kind: string;
  record?: AuthoritativeObstacle | null;
  normal?: SpottingVector3 | null;
}

export interface AuthoritativeWorldCollision {
  mapId?: string;
  heightField?: HeightField;
  getObstacles?(): AuthoritativeObstacle[];
  /** Shell and sight records (destruction reads the structures' shell bands). */
  getColliders?(): AuthoritativeObstacle[];
  queryObstacles?(
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    out: AuthoritativeObstacle[],
  ): AuthoritativeObstacle[];
  raycast?(
    origin: SpottingVector3,
    direction: SpottingVector3,
    maxDistance: number,
  ): AuthoritativeWorldRayHit | null;
  crushObstacle?(
    obstacle: AuthoritativeObstacle,
    directionX: number,
    directionZ: number,
    speedMps: number,
  ): boolean | void;
  getConcealment?(): ConcealerDisc[];
}

/**
 * Lag-compensation seam (Multiplayer v2, server/match). `begin` may move every
 * entity except the shooter to the pose the shooter was looking at when it
 * fired; the shell's whole sweep and hit resolution then read those poses;
 * `end` restores the live poses before the next shell. Nothing inside the
 * sweep writes pose fields, so the swap is exact. Null keeps live poses.
 */
export interface ShellRewindHook {
  begin(shell: DamageShell): void;
  end(shell: DamageShell): void;
}

/** Roster limit: 14v14 plus bots and headroom, bounded by the wire's 64 entity ids. */
export const MAX_AUTHORITATIVE_PLAYERS = 64;

export interface NewModeCheckpoint {
  mode: ModeCheckpoint;
  flights: { id: string; flight: AerialCheckpoint }[];
}

export interface AuthoritativeMatchOptions {
  players?: AuthoritativePlayerRecord[];
  mapId?: string;
  seed?: number;
  battleLimitS?: number;
  countdownS?: number;
  gameMode?: GameModeId | string;
  /** Rules the match plays by; derived from gameMode when absent (campaign operations pass theirs). */
  ruleset?: MatchRuleset;
  worldCollision?: AuthoritativeWorldCollision | null;
  shellRewind?: ShellRewindHook | null;
}

interface AuthoritativeEvent extends Record<string, RuntimeValue> {
  type: string;
  timeS: number;
}

interface AuthoritativeStepOptions {
  dt: number;
  /** Injected by authority for pregame only; direct fixed-step callers omit it. */
  countdownElapsedS?: number;
  inputs: ReadonlyMap<string, AuthoritativePlayerInput | null | undefined>;
}

interface AuthoritativeSnapshotOptions {
  tick: number;
  serverTimeMs: number;
  viewerId: string;
  ackInputSeq: number | null;
}

export interface AuthoritativeMatch {
  readonly entities: AuthoritativeEntity[];
  readonly entityById: Map<string, AuthoritativeEntity>;
  readonly requiredPeerIds: string[];
  readonly heightField: HeightField;
  readonly timeS: number;
  readonly result: MatchResult | null;
  readonly resultReason: string | null;
  /** Sim time of the verdict; the ruleset's post-verdict hold (endingHoldS) counts from here. */
  readonly resultTimeS: number | null;
  /** The ruleset's post-verdict hold in seconds: the room's post-match transition waits for it. */
  readonly endingHoldS: number;
  readonly phase: MatchPhase;
  readonly gameMode: GameModeId;
  readonly pendingEventCount: number;
  readonly shotFeedbackVersion: 1;
  readonly modeController: MatchModeController<AuthoritativeEntity>;
  onMatchReady(): void;
  onPeerJoin(event: { peerId: string }): void;
  onPeerLeave(event: { peerId: string }): void;
  step(options: AuthoritativeStepOptions): void;
  snapshot(options: AuthoritativeSnapshotOptions): WorldSnapshot;
  eventsForViewer(viewerId: string): AuthoritativeEvent[];
  afterEventBroadcast(): void;
  afterSnapshotBroadcast(): void;
  /**
   * A resumed match (a host migration, 2026-10-01): the props the previous authority had destroyed — its persistent
   * destroyed list — are crushed in this world without an event (every seat already saw them fall), and the
   * destructible revision continues past the previous host's so every client's persistent-state check stays
   * monotonic. Indices this world does not have are counted, never applied.
   */
  captureModeCheckpoint(): NewModeCheckpoint | null;
  restoreModeCheckpoint(checkpoint: NewModeCheckpoint): void;
  restoreDestroyedObstacles(indices: readonly number[], revision: number): { restored: number; unknown: number };
  /**
   * A resumed match (destruction, docs/DESTRUCTION.md §8.3): the previous authority's destruction log laid down without
   * events — stages and collapses (records, heaps, the route grid), later breaches and craters — and kept as this
   * match's log, so every peer's settled reading converges. Returns the entries this world applied.
   */
  restoreDestruction(entries: readonly DestructionLogEntry[]): { applied: number };
}

interface SharedTerrain {
  config: BattlefieldMapConfig;
  heightField: HeightField;
  layout: TerrainLayout;
}

interface TankTrace {
  target: AuthoritativeEntity;
  hits: ArmorIntersection[];
  distance: number;
}

interface WorldTrace {
  t: number;
  kind: string;
  record?: AuthoritativeObstacle | null;
  normal?: SpottingVector3 | null;
}

interface PendingCrush {
  obstacle: AuthoritativeObstacle;
  entity: AuthoritativeEntity;
  cause: string;
}

interface PendingRam {
  a: AuthoritativeEntity;
  b: AuthoritativeEntity;
  closing: number;
  /** Contact normal from b to a (the push on a); zero for a roof landing. */
  nx: number;
  nz: number;
  /** Each hull's velocity along the normal at detection (impact physics). */
  vAn: number;
  vBn: number;
  /** A roof landing (tankBodyContacts): the vertical module owns its impulse; no horizontal exchange. */
  vertical: boolean;
}

const BATTLE_LIMIT_S = 15 * 60;
const FIRE_TICK_S = 0.5;
const MAX_EVENTS = 128;
const CRUSH_MIN_MPS = 6 / 3.6;
const CRUSH_PRESS_S = 0.45;
const CRUSH_PRESS_GAP_S = 0.2;
const CRUSH_SPEED_KEEP = 0.94;
const RAM_PAIR_COOLDOWN_S = 0.5;
const TEAM_ALPHA = 'alpha';
const TEAM_BRAVO = 'bravo';
const TEAM_SPECTATOR = 'spectator';

const _spawn = new Vector3();
const _contactCenter = new Vector3();
const _obstacleCenter = new Vector3();
const _obstacleFoot = createHullFootprint();
const _aim = new Vector3();
const _muzzle = new Vector3();
const _gunDir = new Vector3();
const _segmentDir = new Vector3();
const _worldTraceOrigin = new Vector3();
const _hullMatrix = new Matrix4();
const _turretMatrix = new Matrix4();
const _localMatrix = new Matrix4();
const _quat = new Quaternion();
const _euler = new Euler();
const _unit = new Vector3(1, 1, 1);
const terrainCache = new Map<string, SharedTerrain>();
const TERRAIN_IDLE_LIMIT = 2;
let terrainBuilds = 0;

export function authoritativeTerrainCacheStats() {
  return { retainedMaps: terrainCache.size, limit: TERRAIN_IDLE_LIMIT, builds: terrainBuilds };
}

function sharedTerrain(mapId: string, assaultTrenches = false): SharedTerrain {
  // the trench variant is its own cache entry (the browser's world build keys it the same way)
  const key = `${String(mapId || 'verdant')}${assaultTrenches ? '#assault-trenches' : ''}`;
  let cached = terrainCache.get(key);
  if (cached) {
    terrainCache.delete(key);
    terrainCache.set(key, cached);
    return cached;
  }
  const baseConfig = getMapConfig(String(mapId || 'verdant'));
  const config = assaultTrenches ? { ...baseConfig, assaultTrenches: true } : baseConfig;
  // The rendered battlefields use seed 1337 unless explicitly overridden.
  // Height fields are immutable after construction, so dedicated matches can
  // safely share this expensive 1 km terrain bake while keeping combat state
  // and future destructible overlays match-local.
  const configuredSeed = (config as { seed?: RuntimeValue }).seed;
  const terrainSeed = typeof configuredSeed === 'number' && Number.isSafeInteger(configuredSeed)
    ? configuredSeed : 1337;
  cached = {
    config,
    heightField: createHeightField(terrainSeed, config),
    layout: createLayout(config),
  };
  terrainCache.set(key, cached);
  terrainBuilds++;
  while (terrainCache.size > TERRAIN_IDLE_LIMIT) {
    terrainCache.delete(terrainCache.keys().next().value!);
  }
  return cached;
}

function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function finite(value: RuntimeValue, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeTeam(value: RuntimeValue): LobbyTeam {
  return value === TEAM_BRAVO ? TEAM_BRAVO
    : value === TEAM_SPECTATOR ? TEAM_SPECTATOR : TEAM_ALPHA;
}

function makeInput(): AuthoritativeInput {
  return {
    throttle: 0,
    steer: 0,
    brake: false,
    fire: false,
    aimLocked: false,
    shellSlot: 0,
    actionBits: 0,
    aimPoint: new Vector3(),
  };
}

function spawnFor(
  index: number,
  team: Team,
  placement: MatchPlacement,
  override?: AuthoritativeSpawn,
): Required<AuthoritativeSpawn> {
  if (override && Number.isFinite(override.x) && Number.isFinite(override.z)) {
    return {
      x: override.x,
      z: override.z,
      yaw: finite(override.yaw, team === TEAM_ALPHA ? 0 : Math.PI),
    };
  }
  // Symmetric deployments (sim/deployment.ts, modes lane 2026-10-08): slot k of a side, the exact rotation of the other
  // side's slot k about the anchors' midpoint, resolved on this world by the match placement. The solo sim
  // (game/state.ts) seats its tanks through the same placement call.
  const slot = placement.deploymentSlot(team, index);
  return { x: slot.x, z: slot.z, yaw: slot.yaw };
}

function botOpeningGoal(
  entity: AuthoritativeEntity,
  teamSlot: number,
  entities: readonly AuthoritativeEntity[],
  opponents: readonly AuthoritativeEntity[],
): { x: number; z: number } {
  const allies = entities.filter((entry) => entry.team === entity.team);
  let ownX = 0;
  let ownZ = 0;
  for (const ally of allies) {
    ownX += ally.state.pos.x;
    ownZ += ally.state.pos.z;
  }
  ownX /= Math.max(1, allies.length);
  ownZ /= Math.max(1, allies.length);
  let enemyX = 0;
  let enemyZ = 0;
  for (const opponent of opponents) {
    enemyX += opponent.state.pos.x;
    enemyZ += opponent.state.pos.z;
  }
  enemyX /= Math.max(1, opponents.length);
  enemyZ /= Math.max(1, opponents.length);
  let dx = enemyX - ownX;
  let dz = enemyZ - ownZ;
  const distance = Math.max(1, Math.hypot(dx, dz));
  dx /= distance;
  dz /= distance;

  // Deploy into distinct lanes on our side of the battlefield instead of
  // plotting every bot straight through a random enemy spawn. Roles shape
  // the opening, but both teams use the exact same deterministic doctrine.
  const role = roleOf(entity.spec);
  // Keep a genuine deployment line between the teams.  The former fixed
  // fraction sent both sides toward the same point on compact maps, so the
  // opening regularly became an 80 m ram-fight inside 30 seconds.  Advance
  // only the distance the map can spare while retaining a ~340 m front;
  // faster roles may probe beyond it and snipers remain slightly behind.
  const spareAdvance = Math.max(0, (distance - 340) * 0.5);
  const roleAdvance = role === 'scout' ? 1.16
    : role === 'flanker' ? 1.07
      : role === 'brawler' ? 0.94 : 0.82;
  const advanceM = Math.min(distance * 0.34, spareAdvance * roleAdvance);
  const laneOrder = allies.length <= 1 ? [1] : [-1, 1, -0.35, 0.35, -1.5, 1.5, 0];
  const laneScale = role === 'flanker' || role === 'scout' ? 1.2
    : role === 'sniper' ? 1 : 0.85;
  const laneM = Math.min(110, Math.max(55, distance * 0.14));
  const lane = laneOrder[teamSlot % laneOrder.length]! * laneM * laneScale;
  return {
    x: Math.max(-440, Math.min(440, ownX + dx * advanceM + dz * lane)),
    z: Math.max(-440, Math.min(440, ownZ + dz * advanceM - dx * lane)),
  };
}

function gunWorldPose(entity: AuthoritativeEntity, shellSpec?: DamageShellSpec): { muzzle: Vector3; direction: Vector3 } {
  const state = entity.state;
  const armor = entity.spec.armor || {};
  const turretPivot = armor.turretPivot || [0, entity.spec.dims.heightM * 0.7, 0];
  const gunPivot = armor.gunPivot || [0, entity.spec.dims.heightM * 0.15, 0];
  const barrelM = Math.max(0.5, finite(armor.gunBarrel && armor.gunBarrel.lengthM, 3));

  _euler.set(-state.visualPitch, state.yaw, state.visualRoll, 'YXZ');
  _quat.setFromEuler(_euler);
  _unit.setScalar(state.modeScale??1);
  _hullMatrix.compose(state.pos, _quat, _unit);
  _localMatrix.makeRotationY(state.turretYaw);
  _localMatrix.setPosition(turretPivot[0], turretPivot[1], turretPivot[2]);
  _turretMatrix.multiplyMatrices(_hullMatrix, _localMatrix);

  const sinPitch = Math.sin(state.gunPitch);
  const cosPitch = Math.cos(state.gunPitch);
  _gunDir.set(0, sinPitch, cosPitch).transformDirection(_turretMatrix).normalize();
  _muzzle.set(gunPivot[0], gunPivot[1], gunPivot[2])
    .applyMatrix4(_turretMatrix)
    .addScaledVector(_gunDir, barrelM*(state.modeScale??1));
  const launchers = usesLauncherMuzzles(entity.spec.gun, shellSpec) ? entity.spec.gun.launcherMuzzles : undefined;
  if (launchers?.length) {
    const index = launcherMuzzleIndex(entity.spec.gun, shellSpec, entity.combat.launcherCursor ?? 0);
    const tip = launchers[index]!;
    _muzzle.set(tip.x, tip.y, tip.z);
    const mouthPitch = tip.pitch ?? 0, mouthYaw = tip.yaw ?? 0;
    _gunDir.set(Math.sin(mouthYaw) * Math.cos(mouthPitch), Math.sin(mouthPitch),
      Math.cos(mouthYaw) * Math.cos(mouthPitch));
    if (tip.frame !== 'turret') {
      _muzzle.set(gunPivot[0] + tip.x, gunPivot[1] + tip.y * cosPitch + tip.z * sinPitch,
        gunPivot[2] - tip.y * sinPitch + tip.z * cosPitch);
      const dy = _gunDir.y, dz = _gunDir.z;
      _gunDir.y = dy * cosPitch + dz * sinPitch;
      _gunDir.z = -dy * sinPitch + dz * cosPitch;
    }
    _muzzle.applyMatrix4(_turretMatrix);
    _gunDir.transformDirection(_turretMatrix);
  }
  return { muzzle: _muzzle, direction: _gunDir };
}

function segmentTerrainHit(
  heightField: HeightField,
  from: SpottingVector3,
  to: SpottingVector3,
): number | null {
  const STEPS = 8;
  let priorT = 0;
  let priorGap = from.y - heightField.getHeightAt(from.x, from.z);
  for (let i = 1; i <= STEPS; i++) {
    const t = i / STEPS;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    const z = from.z + (to.z - from.z) * t;
    const gap = y - heightField.getHeightAt(x, z);
    if (gap <= 0 && priorGap > 0) {
      let lo = priorT;
      let hi = t;
      for (let n = 0; n < 8; n++) {
        const mid = (lo + hi) * 0.5;
        const mx = from.x + (to.x - from.x) * mid;
        const my = from.y + (to.y - from.y) * mid;
        const mz = from.z + (to.z - from.z) * mid;
        if (my > heightField.getHeightAt(mx, mz)) lo = mid;
        else hi = mid;
      }
      return hi;
    }
    priorT = t;
    priorGap = gap;
  }
  return null;
}

function firstTankTrace(
  shell: DamageShell,
  entities: readonly AuthoritativeEntity[],
): TankTrace | null {
  let best: TankTrace | null = null;
  let bestDistance = Infinity;
  const segmentLength = shell.prevPos.distanceTo(shell.pos);
  for (const target of entities) {
    if (target.id === shell.shooterId || target.modeActive === false || isGunship(target) ||
        !target.state || !target.combat) continue;
    const radius = finite(target.spec.armor && target.spec.armor.boundingRadiusM,
      target.spec.dims.hullLengthM * 0.65);
    const centerDistance = target.state.pos.distanceTo(shell.prevPos);
    if (centerDistance > segmentLength + radius + 2) continue;
    const pose = tankPoseFromState(target.state);
    const hits = traceTank(shell.prevPos, shell.pos, pose, target.spec.armor,
      target.combat.eraSpent, shell.spec.tracer === 'DRONE');
    if (!hits.length) continue;
    const distance = shell.prevPos.distanceTo(hits[0]!.point);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { target, hits, distance };
    }
  }
  return best;
}

function segmentWorldHit(
  worldCollision: AuthoritativeWorldCollision | null,
  heightField: HeightField,
  from: Vector3,
  to: Vector3,
): WorldTrace | null {
  if (worldCollision && typeof worldCollision.raycast === 'function') {
    _segmentDir.subVectors(to, from);
    const distance = _segmentDir.length();
    if (distance <= 1e-9) return null;
    _segmentDir.multiplyScalar(1 / distance);
    const hit = worldCollision.raycast(from, _segmentDir, distance);
    return hit ? {
      t: Math.max(0, Math.min(1, hit.dist / distance)),
      kind: hit.kind,
      record: hit.record || null,
      normal: hit.normal || null,
    } : null;
  }
  const t = segmentTerrainHit(heightField, from, to);
  return t == null ? null : { t, kind: 'terrain' };
}

/**
 * Create one deterministic headless battle.
 *
 * Player records are `{id,specId,team}` with optional test/tooling `spawn`.
 * IDs are match identities and may never be inferred from `specId`.
 */
export function createAuthoritativeMatch({
  players = [],
  mapId = 'verdant',
  seed = 6000,
  battleLimitS = BATTLE_LIMIT_S,
  countdownS = 5,
  gameMode = 'standard',
  ruleset: rulesetOption,
  worldCollision = null,
  shellRewind = null,
}: AuthoritativeMatchOptions = {}): AuthoritativeMatch {
  if (!Array.isArray(players) || players.length < 1 || players.length > MAX_AUTHORITATIVE_PLAYERS) {
    throw new TypeError(`players must contain 1-${MAX_AUTHORITATIVE_PLAYERS} records`);
  }
  const ids = new Set<string>();
  if (worldCollision && worldCollision.mapId && worldCollision.mapId !== mapId) {
    throw new Error(`world collision map mismatch: expected ${mapId}, got ${worldCollision.mapId}`);
  }
  // A browser world or dedicated collision lease already owns the exact field.
  // Do not bake a second 5.5 MB field merely to obtain its existing layout.
  const suppliedHeightField = worldCollision?.heightField;
  // batch 27: a Frontline Assault authority bakes the trench variant so its sectors sit in the carved lines
  const normalizedGameMode = normalizeGameMode(gameMode);
  const shared = suppliedHeightField ? null : sharedTerrain(mapId, normalizedGameMode === 'frontline_assault');
  // destruction (docs/DESTRUCTION.md §7): the match's ground is the shared field plus this match's overlay (rubble
  // mounds, craters); the base is never touched, so a shared terrain carries no stamp into another match
  const ground = createTerrainDeformation();
  const baseHeightField = suppliedHeightField || shared!.heightField;
  const heightField = createDeformedHeightField(baseHeightField, ground);
  const layout = heightField._layout || shared?.layout || createLayout(getMapConfig(mapId));
  const rng = mulberry32(seed);
  const entities: AuthoritativeEntity[] = [];
  const entityById = new Map<string, AuthoritativeEntity>();
  const playerRecordById = new Map<string, AuthoritativePlayerRecord>();
  const teamIndex: Record<Team, number> = { [TEAM_ALPHA]: 0, [TEAM_BRAVO]: 0 };
  const pendingEvents: AuthoritativeEvent[] = [];
  const destroyedObstacleIndices: number[] = [];
  let destructibleRevision = 0;
  const shells: DamageShell[] = [];
  const destroyedBeforeBurst = new Map<string, boolean>();
  let nextShellId = 1;
  const nextAerialShellId = () => nextShellId++;
  const launchAerialShell = (shell: DamageShell) => { shells.push(shell); };
  let timeS = 0;
  let modeTimeOffsetS = 0;
  let fireTickAcc = 0;
  let result: MatchResult | null = null;
  let resultReason: string | null = null;
  let resultTimeS: number | null = null;
  let phase: MatchPhase = 'loading';
  let countdownRemainingS = Math.max(0, finite(countdownS, 5));
  const staticObstacles = worldCollision && typeof worldCollision.getObstacles === 'function'
    ? worldCollision.getObstacles() : [];
  // RULESETS (sim/matchRuleset.ts, 2026-09-14): the same pure rules the browser sim applies — hull,
  // damage-taken, reload, ammunition and equipment at spawn / revive, gravity at the muzzle, the clock.
  const ruleset: MatchRuleset = rulesetOption && rulesetOption.mode === normalizedGameMode
    ? rulesetOption : matchRulesetFor(normalizedGameMode);
  // an explicit battleLimitS (tests, tooling) wins; otherwise the ruleset's clock (null = no clock)
  const clockLimitS = battleLimitS !== BATTLE_LIMIT_S ? battleLimitS : (ruleset.timeLimitS ?? Infinity);
  // destruction (docs/DESTRUCTION.md, 2026-10-07): the match's structures, priced by the munition catalog; the solo
  // step owns the same object (game/state.ts) and calls it at the same moments
  const destruction = createDestructionMatch({
    rules: ruleset.destruction, obstacles: staticObstacles,
    colliders: worldCollision && typeof worldCollision.getColliders === 'function' ? worldCollision.getColliders() : [],
    ground,
    // the bots' grid re-reads the ground round the heap (botRoutePlanner refreshArea), as the solo step's does
    onCollapse: (structure) => {
      const reach = rubbleFalloffM(structure.hw, structure.hd, rubbleHeightFor(structure.topY - structure.baseY));
      const ex = Math.abs(Math.sin(structure.yaw)) * structure.hd + Math.abs(Math.cos(structure.yaw)) * structure.hw + reach;
      const ez = Math.abs(Math.cos(structure.yaw)) * structure.hd + Math.abs(Math.sin(structure.yaw)) * structure.hw + reach;
      botNavigation?.refreshArea?.(structure.cx - ex, structure.cz - ez, structure.cx + ex, structure.cz + ez);
    },
    onBlast: (x, y, z, chargeKg) => { pendingBlasts.push(x, y, z, chargeKg); },
    // P3: no crater on hard ground (roads, bridge decks, ice), as the solo step reads it
    groundTypeAt: (x, z) => (heightField as { getGroundType?(x: number, z: number): string }).getGroundType?.(x, z) ?? 'medium',
    // the map's walls price a ram (§4.4: timber and mudbrick give sooner than masonry and concrete)
    wallMaterial: wallMaterialForStyle(architectureStyleOf(getMapConfig(String(mapId || 'verdant')))),
  });
  /** The tick's blasts (x, y, z, kg), felling their light props at the end of the step (advanceDestruction). */
  const pendingBlasts: number[] = [];
  const destructionEvents: StructureStageEvent[] = [];
  const breachEvents: StructureBreachEvent[] = [];
  const craterEvents: TerrainCraterEvent[] = [];
  const trenchLines = (heightField as { assaultTrenchLines?: { sectors?: RuntimeValue; lines?: RuntimeValue } }).assaultTrenchLines;
  const placement = createMatchPlacement({
    mapId,
    heightField, obstacles: staticObstacles, queryObstacles: worldCollision?.queryObstacles,
    anchors: matchPlacementAnchors(layout.spawns), mode: normalizedGameMode,
    // index-aligned carved sectors (null where the terrain dropped a line), exactly as the solo path passes them
    assaultLines: (trenchLines?.sectors ?? trenchLines?.lines ?? null) as never,
  });
  const nearbyObstacles: AuthoritativeObstacle[] = [];
  const obstacleIndex = new Map<AuthoritativeObstacle, number>(
    staticObstacles.map((obstacle, index) => [obstacle, index]),
  );
  const obstacleByPropIdx = new Map<number, AuthoritativeObstacle>();
  const obstacleByTreeIdx = new Map<number, AuthoritativeObstacle>();
  const pendingCrush: PendingCrush[] = [];
  const pendingCrushSet = new Set<AuthoritativeObstacle>();
  const pendingRams: PendingRam[] = [];
  const ramPairTime = new Map<string, number>();
  const bestRamPairs = new Map<string, PendingRam>();
  const activeBodyEntities: AuthoritativeEntity[] = [];
  const repairedModules: string[] = [];
  const survivingTeams: Record<Team, number> = { [TEAM_ALPHA]: 0, [TEAM_BRAVO]: 0 };

  function indexWorldObstacles(): void {
    for (const obstacle of staticObstacles) {
      if (obstacle.propIdx != null && !obstacleByPropIdx.has(obstacle.propIdx)) {
        obstacleByPropIdx.set(obstacle.propIdx, obstacle);
      }
      if (obstacle.treeIdx != null && !obstacleByTreeIdx.has(obstacle.treeIdx)) {
        obstacleByTreeIdx.set(obstacle.treeIdx, obstacle);
      }
    }
  }

  function createPlayerEntity(record: AuthoritativePlayerRecord): void {
    const id = String(record && record.id || '').trim();
    if (!id || ids.has(id)) throw new TypeError('player ids must be non-empty and unique');
    ids.add(id);
    playerRecordById.set(id, record);
    const team = normalizeTeam(record.team);
    if (team === TEAM_SPECTATOR) return;
    const spec = getSpec(String(record.specId || ''));
    if (!spec) throw new TypeError(`unknown vehicle spec: ${String(record.specId)}`);
    const preferred = spawnFor(teamIndex[team]++, team, placement, record.spawn);
    const explicit = !!record.spawn && Number.isFinite(record.spawn.x) && Number.isFinite(record.spawn.z);
    const pad = placement.spawn(preferred, id, placementTankRadius(spec), explicit);
    _spawn.set(pad.x, heightField.getHeightAt(pad.x, pad.z), pad.z);
    const state = createTankState(spec, _spawn, pad.yaw);
    const input = makeInput();
    input.aimPoint.copy(state.aimPoint);
    const combat = createCombatState(spec) as AuthoritativeCombatState;
    const bot = !!record.bot;
    const loadout = rulesetLoadout(ruleset, Array.isArray(record.equipment)
      ? record.equipment.slice() : defaultLoadoutFor(spec));
    const equipment = applyEquipmentToCombat(
      combat,
      loadout,
      spec,
    );
    applyRulesetToCombat(combat, spec.gun.shells, ruleset);
    const entity: AuthoritativeEntity = {
      id,
      specId: spec.id,
      spec,
      team,
      state,
      combat,
      equip: equipment,
      loadout,
      input,
      bot,
      isPlayer: !bot,
      connected: true,
      kills: 0,
      damage: 0,
      consumableReadyAt: [0, 0, 0],
      specialAction: createSpecialActionState(spec),
    };
    bindSpecialActionState(entity); // round 34: fixed hydraulic guns spawn with suspension aim engaged
    entities.push(entity);
    entityById.set(id, entity);
    for (let n = 0; n < 30; n++) updateTank(entity, heightField, SIM_DT);
  }

  function createPlayerEntities(): void {
    for (const record of players) createPlayerEntity(record);
  }

  indexWorldObstacles();
  createPlayerEntities();

  const spottingRaycast: (
    origin: SpottingVector3,
    direction: SpottingVector3,
    maxDistance: number,
  ) => SpottingRayHit | null = worldCollision && typeof worldCollision.raycast === 'function'
    ? (origin, direction, maxDistance) => worldCollision.raycast!(origin, direction, maxDistance)
    : (origin, direction, maxDistance) => {
      _aim.set(
        origin.x + direction.x * maxDistance,
        origin.y + direction.y * maxDistance,
        origin.z + direction.z * maxDistance,
      );
      const hitT = segmentTerrainHit(heightField, origin, _aim);
      return hitT == null ? null : { dist: hitT * maxDistance, kind: 'terrain' };
    };
  const auxiliarySmokeScreens: SmokeScreen[] = [];
  const worldConcealers = worldCollision && typeof worldCollision.getConcealment === 'function'
    ? worldCollision.getConcealment() ?? [] : [];
  const spotting = createSpottingSystem({
    getTanks: () => entities,
    alwaysVisible: !!ruleset.alwaysVisible,
    raycast: spottingRaycast,
    opticalBlocked: (a,b) => smokeBlocks(auxiliarySmokeScreens,a,b,timeS,heightField.getHeightAt),
    concealers: worldConcealers,
    getEquipment: (entity) => entityById.get(entity.id)?.equip ?? null,
    getCamoBonus: () => 0,
    rng: mulberry32(seed + 31000),
    teams: [TEAM_ALPHA, TEAM_BRAVO],
  });
  const botNavigation = placement.navigation ?? (entities.some((entity) => entity.bot)
    ? createBotNavigationGrid({
      heightField,
      queryObstacles: worldCollision?.queryObstacles || null,
      getObstacles: () => staticObstacles,
    })
    : null);

  function initializeBot(entity: AuthoritativeEntity, index: number): void {
    const opponents = entities.filter((entry) => entry.team !== entity.team);
    const allies = entities.filter((entry) => entry !== entity && entry.team === entity.team);
    const botRng = mulberry32(seed + 41000 + index * 997);
    // round 62 pacing: the no-contact search plans its legs over the shared navigation grid; its own seeded
    // stream keeps the controller's draws where they were
    const searchRng = mulberry32(seed + 43000 + index * 991);
    const navigation = botNavigation;
    entity.aiCtl = createAI(entity, {
      difficulty: playerRecordById.get(entity.id)?.difficulty || 'normal',
      rng: botRng,
      deps: {
        heightField,
        raycast: spottingRaycast,
        getEnemies: () => {
          opponents.length = 0;
          for (const candidate of entities) if (candidate.team !== entity.team && candidate.modeActive !== false && !isGunship(candidate)) opponents.push(candidate);
          return opponents;
        },
        getAllies: () => {
          allies.length = 0;
          for (const candidate of entities) if (candidate !== entity && candidate.team === entity.team) allies.push(candidate);
          return allies;
        },
        getObstacles: () => staticObstacles,
        queryObstacles: worldCollision?.queryObstacles || null,
        spotting: {
          isSpotted: (targetId, receiver) =>
            spotting.isSpotted(targetId, entity.team, receiver || entity),
        },
        // bot philosophy r1: the mode's live objective ranks targets (objective → closest → weakest)
        getObjective: () => modeController.botObjective(entity),
        ...(navigation ? {
          planRoute: (start: { x: number; z: number }, goal: { x: number; z: number; y?: number },
            options?: { requireGoalLevel?: boolean }) => planBotRoute({
            start, goal, navigation, rng: searchRng, role: roleOf(entity.spec), spec: entity.spec,
            useRoleDetour: false, requireGoalLevel: options?.requireGoalLevel === true,
          }),
        } : {}),
      },
    });
    const teamSlot = entities.filter((entry) => entry.team === entity.team).indexOf(entity);
    const goal = opponents.length
      ? botOpeningGoal(entity, teamSlot, entities, opponents)
      : null;
    if (!goal) return;
    entity.aiCtl.setWaypoints(planBotRoute({
      start: entity.state.pos,
      goal,
      navigation: botNavigation,
      rng: botRng,
      role: roleOf(entity.spec),
      spec: entity.spec,
    }), { loop: false });
  }

  function initializeBots(): void {
    for (let index = 0; index < entities.length; index++) {
      const entity = entities[index]!;
      if (entity.bot) initializeBot(entity, index);
    }
  }

  initializeBots();

  function emit(type: string, payload: Record<string, RuntimeValue>): void {
    if (type === 'tank_destroyed') modeController.recordDestruction(String(payload.id),
      typeof payload.killerId==='string'?payload.killerId:null);
    if (type === 'tank_destroyed' && destruction.enabled) {
      // a cook-off or a fuel fire bursts on the structures beside the hull (never on the tanks)
      const dead = entityById.get(String(payload.id));
      if (dead) destruction.tankDeath(String(payload.cause), dead.spec.weightTons, dead.state.pos.x, dead.state.pos.y, dead.state.pos.z);
    }
    if (pendingEvents.length >= MAX_EVENTS) pendingEvents.shift();
    const event: AuthoritativeEvent = { type, timeS, ...payload };
    // Where the hull died (ghost-crunch lane, 2026-10-02), as tank_ram and tank_impact carry theirs: a peer presents the
    // death one interpolation step from the pose it shows that frame — mid-fall, mid-slide — and its explosion, wreck
    // smoke and killcam sat 0.3–0.8 m from the authority's hull (the world-events audit's p2 fall death).
    if (type === 'tank_destroyed' && typeof payload.x !== 'number') {
      const dead = entityById.get(String(payload.id));
      if (dead) { event.x = dead.state.pos.x; event.y = dead.state.pos.y; event.z = dead.state.pos.z; }
    }
    pendingEvents.push(event);
  }

  function reviveForMode(
    tank: AuthoritativeEntity,
    spawn: MatchModeSpawn,
    healthScale = 1,
  ): void {
    _spawn.set(spawn.x, heightField.getHeightAt(spawn.x, spawn.z), spawn.z);
    tank.state = createTankState(tank.spec, _spawn, spawn.yaw);
    tank.input = makeInput();
    tank.input.aimPoint.copy(tank.state.aimPoint);
    tank.combat = createCombatState(tank.spec) as AuthoritativeCombatState;
    tank.equip = applyEquipmentToCombat(
      tank.combat, tank.loadout || rulesetLoadout(ruleset, defaultLoadoutFor(tank.spec)), tank.spec,
    );
    // the wave's health scale folds into the ruleset stamp (hull, damage-taken, reload, ammunition)
    applyRulesetToCombat(tank.combat, tank.spec.gun.shells, ruleset, healthScale);
    tank.consumableReadyAt = [0, 0, 0];
    initializeAerial(tank, ruleset);
    tank.specialAction = createSpecialActionState(tank.spec);
    bindSpecialActionState(tank);
    if (!isGunship(tank)) for (let n = 0; n < 30; n++) updateTank(tank, heightField, SIM_DT);
  }

  const modeController = createMatchModeController<AuthoritativeEntity>({
    mode: normalizedGameMode,
    entities,
    seed,
    placement,
    ruleset,
    revive: reviveForMode,
    setWeaponStage: setModeWeapon,
    setActive(entity, active) { entity.modeActive = active; },
    terrainHeight: (x, z) => heightField.getHeightAt(x, z),
    ballFloorHeight: (x, z, previousBottomY) => bridgeBallFloor(heightField, x, z, previousBottomY),
    emit,
  });
  for (const entity of entities) {
    initializeAerial(entity, ruleset);
    if (isGunship(entity)) setModeWeapon(entity, 'gunship');
  }
  let nextModeRouteS = 0;

  function applyNetworkInput(
    entity: AuthoritativeEntity,
    input: AuthoritativePlayerInput | null | undefined,
  ): void {
    if (!input || entity.modeActive === false || entity.combat.destroyed) {
      entity.input.throttle = 0;
      entity.input.steer = 0;
      entity.input.brake = true;
      entity.input.fire = false;
      // No driver must also stop sight-driven hull traverse/hydraulic lay.
      entity.input.aimLocked = true;
      entity.input.actionBits = 0;
      return;
    }
    entity.input.throttle = input.throttle;
    entity.input.steer = input.steer;
    entity.input.brake = input.brake;
    entity.input.fire = input.fire;
    entity.input.fireIntentSeq = Number.isSafeInteger(input.fireIntentSeq) ? input.fireIntentSeq : null;
    entity.input.aimLocked = !!input.aimLocked;
    entity.input.actionBits = input.actionBits | 0;
    const shellSlot = Math.max(0, Math.min(
      entity.spec.gun.shells.length - 1,
      input.shellSlot | 0,
    ));
    if (shellSlot !== entity.combat.shellSlot) {
      if (selectShell(entity.combat, shellSlot, entity.spec)) {
        entity._deniedShellSlot = undefined;
      } else {
        // A stale/depleted ammo request must not fire a different, ready
        // weapon merely because its fallback no longer starts a reload.
        entity.input.fire = false;
        if (entity._deniedShellSlot !== shellSlot) {
          emit('ammo_selection_denied', {
            id: entity.id,
            slot: shellSlot,
            reason: 'AMMO_EMPTY',
            guided: entity.spec.gun.shells[shellSlot]?.guided === true,
          });
          entity._deniedShellSlot = shellSlot;
        }
      }
    }
    entity.input.shellSlot = entity.combat.shellSlot;
    decodeAimIntent(input, entity.aerial?.active ? entity.aerial : entity.state.pos, _aim);
    entity.input.aimPoint.copy(_aim);
  }

  function obstacleCandidates(
    centerX: number,
    centerZ: number,
    broadRadius: number,
  ): AuthoritativeObstacle[] {
    if (!worldCollision?.queryObstacles) return staticObstacles;
    return worldCollision.queryObstacles(
      centerX - broadRadius,
      centerZ - broadRadius,
      centerX + broadRadius,
      centerZ + broadRadius,
      nearbyObstacles,
    );
  }

  function obstacleIsPressedThrough(
    entity: AuthoritativeEntity,
    obstacle: AuthoritativeObstacle,
  ): boolean {
    if (Math.abs(entity.state.speed) > (obstacle.crushMin ?? CRUSH_MIN_MPS)) return true;
    if (Math.abs(entity.input.throttle || 0) <= 0.35) return false;
    if (timeS - (obstacle._pressT || -1e9) > CRUSH_PRESS_GAP_S) obstacle._pressS = 0;
    obstacle._pressT = timeS;
    obstacle._pressS = (obstacle._pressS || 0) + SIM_DT;
    return obstacle._pressS >= CRUSH_PRESS_S;
  }

  function queueCrushedObstacle(
    entity: AuthoritativeEntity,
    obstacle: AuthoritativeObstacle,
  ): void {
    if (pendingCrushSet.has(obstacle)) return;
    pendingCrushSet.add(obstacle);
    pendingCrush.push({ obstacle, entity, cause: 'ram' });
  }

  /** The contacts the first obstacle sweep found hard, swept again (collideWithObstacles). */
  const hardObstacles: AuthoritativeObstacle[] = [];

  /** Destruction: the speed share a hull keeps through a structure that yields to its ram, or null (it holds). */
  function structureYield(entity: AuthoritativeEntity, obstacle: AuthoritativeObstacle, pushX: number, pushZ: number): number | null {
    const length = Math.hypot(pushX, pushZ);
    if (length <= 1e-9) return null;
    const state = entity.state;
    const closing = Math.max(0, -state.speed * (Math.sin(state.yaw) * pushX + Math.cos(state.yaw) * pushZ) / length);
    return destruction.ramThrough(obstacle, entity.spec.weightTons, closing, Math.abs(state.speed),
      state.pos.x, state.pos.y, state.pos.z, -pushX / length, -pushZ / length);
  }

  function collideWithObstacles(
    entity: AuthoritativeEntity,
    pos: Vector3,
    outPush: Vector3,
  ): boolean {
    // the obstacle solver pushes the hull's footprint at its attitude and reads its underside there
    // (world/collision.ts hullFootprint): a hull standing on its tail is not 7 m long against a wall
    const state = entity.state;
    const foot = hullFootprint(tankContactRect(entity.spec), pos.x, pos.z, state.yaw, state.visualPitch || 0,
      state.visualRoll || 0, _obstacleFoot);
    const centerX = foot.centerX, centerZ = foot.centerZ;
    const broadRadius = Math.hypot(foot.halfLength, foot.halfWidth) + 0.01;
    const spanTop = pos.y + tankBodyTopM(entity.spec);
    let hard = false;
    // Each record meets the hull where the records before it have pushed it (physics lane, 2026-10-03; Foundry field
    // audit), as a compound's parts already do: summed from one position, two contacts that push opposite ways (a hull
    // pivoting across a fence line, a rail under each end) each corrected the whole overlap, so the hull overshot by
    // the other's share every step and flipped from side to side until one contact won with a 0.65 m jump.
    const startX = outPush.x, startZ = outPush.z;
    let hardCount = 0;
    for (const obstacle of obstacleCandidates(centerX, centerZ, broadRadius)) {
      if (obstacle.crushed) continue;
      foot.centerX = centerX + outPush.x - startX;
      foot.centerZ = centerZ + outPush.z - startZ;
      _obstacleCenter.set(foot.centerX, pos.y, foot.centerZ);
      const spanBottom = hullUndersideOver(obstacle, foot, pos.y);
      const clearBottom = foot.clearBottom;
      if (hullPassesObstacleTop(spanBottom, obstacle.max[1], obstacle.min[1], !obstacle.crushable, clearBottom)) continue;
      const closestX = Math.max(obstacle.min[0], Math.min(foot.centerX, obstacle.max[0]));
      const closestZ = Math.max(obstacle.min[2], Math.min(foot.centerZ, obstacle.max[2]));
      const dx = foot.centerX - closestX;
      const dz = foot.centerZ - closestZ;
      if (dx * dx + dz * dz >= broadRadius * broadRadius) continue;
      const beforeX = outPush.x;
      const beforeZ = outPush.z;
      const pushed = pushHullFromObstacle(
        _obstacleCenter, foot.forwardX, foot.forwardZ, foot.rightX, foot.rightZ, foot.halfLength, foot.halfWidth,
        obstacle, outPush, spanBottom, spanTop, clearBottom,
      );
      if (!pushed) continue;
      if (!obstacle.crushable || !obstacleIsPressedThrough(entity, obstacle)) {
        // destruction (docs/DESTRUCTION.md §4.4): a structure this ram brings down yields, as a crushed prop does
        if (obstacle.structureIdx !== undefined && destruction.enabled) {
          const keep = structureYield(entity, obstacle, outPush.x - beforeX, outPush.z - beforeZ);
          if (keep !== null) {
            outPush.x = beforeX;
            outPush.z = beforeZ;
            entity._ramKeep = Math.min(entity._ramKeep ?? 1, keep);
            continue;
          }
        }
        hard = true; // a solid primitive (or a trunk too slow to fell) is a hard surface
        hardObstacles[hardCount++] = obstacle;
        if (obstacle.structureIdx !== undefined && !entity._ramRecord) entity._ramRecord = obstacle;
        continue;
      }
      outPush.x = beforeX;
      outPush.z = beforeZ;
      queueCrushedObstacle(entity, obstacle);
    }
    // a second sweep over the contacts that pushed, from where the first left the hull: contacts that meet at an angle (a
    // V of walls the hull is driven into) settle against both instead of leaving the first one's overlap behind
    for (let index = 0; index < hardCount; index++) {
      const obstacle = hardObstacles[index]!;
      foot.centerX = centerX + outPush.x - startX;
      foot.centerZ = centerZ + outPush.z - startZ;
      _obstacleCenter.set(foot.centerX, pos.y, foot.centerZ);
      const spanBottom = hullUndersideOver(obstacle, foot, pos.y);
      if (hullPassesObstacleTop(spanBottom, obstacle.max[1], obstacle.min[1], !obstacle.crushable, foot.clearBottom)) continue;
      pushHullFromObstacle(
        _obstacleCenter, foot.forwardX, foot.forwardZ, foot.rightX, foot.rightZ, foot.halfLength, foot.halfWidth,
        obstacle, outPush, spanBottom, spanTop, foot.clearBottom,
      );
    }
    hardObstacles.length = 0;
    return hard;
  }

  function queueRamFromPush(
    entity: AuthoritativeEntity,
    other: AuthoritativeEntity,
    pushX: number,
    pushZ: number,
  ): void {
    const pushLength = Math.hypot(pushX, pushZ);
    if (pushLength <= 1e-6) return;
    const nx = pushX / pushLength;
    const nz = pushZ / pushLength;
    // impact physics: the same pre-contact normal velocities the solo step records (game/state.ts queueRamFromPush)
    const vAn = hullVelocityAlong(entity.state, nx, nz);
    const vBn = hullVelocityAlong(other.state, nx, nz);
    const closing = vBn - vAn;
    if (closing > 0) pendingRams.push({ a: entity, b: other, closing, nx, nz, vAn, vBn, vertical: false });
  }

  function collideWithEntities(
    entity: AuthoritativeEntity,
    centerX: number,
    centerZ: number,
    fx: number,
    fz: number,
    rx: number,
    rz: number,
    halfL: number,
    halfW: number,
    outPush: Vector3,
  ): void {
    // Match the local simulation's exact-shell OBB contact. Shared geometry
    // keeps private rooms and solo from disagreeing at rectangular shoulders.
    for (const other of entities) {
      if (other === entity || other.modeActive === false || !other.state) continue;
      const otherRect = tankContactRect(other.spec);
      const otherHalfW = otherRect.halfWidth;
      const otherHalfL = otherRect.halfLength;
      const ofx = Math.sin(other.state.yaw);
      const ofz = Math.cos(other.state.yaw);
      const orx = ofz;
      const orz = -ofx;
      const otherCenterX = other.state.pos.x + orx * otherRect.centerX + ofx * otherRect.centerZ;
      const otherCenterZ = other.state.pos.z + orz * otherRect.centerX + ofz * otherRect.centerZ;
      const dx = centerX - otherCenterX;
      const dz = centerZ - otherCenterZ;
      const outer = Math.hypot(halfL, halfW) + Math.hypot(otherHalfL, otherHalfW);
      if (dx * dx + dz * dz > outer * outer || prefersVerticalTankContact(entity, other)
        || tanksVerticallyClear(entity, other)) {
        continue;
      }
      const beforeX = outPush.x;
      const beforeZ = outPush.z;
      const pushed = pushHullFromHull(
        centerX, centerZ, fx, fz, rx, rz, halfL, halfW,
        otherCenterX, otherCenterZ, ofx, ofz, orx, orz, otherHalfL, otherHalfW,
        outPush,
      );
      if (!pushed) continue;
      queueRamFromPush(
        entity, other,
        outPush.x - beforeX, outPush.z - beforeZ,
      );
    }
  }

  function collideFor(
    entity: AuthoritativeEntity,
    pos: Vector3,
    _radius: number,
    outPush: Vector3,
  ): boolean {
    outPush.set(0, 0, 0);
    const contactRect = tankContactRect(entity.spec);
    const halfL = contactRect.halfLength;
    const halfW = contactRect.halfWidth;
    const yaw = entity.state.yaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = fz;
    const rz = -fx;
    const centerX = pos.x + rx * contactRect.centerX + fx * contactRect.centerZ;
    const centerZ = pos.z + rz * contactRect.centerX + fz * contactRect.centerZ;
    _contactCenter.set(centerX, pos.y, centerZ);
    const boundsPushed = pushHullInsidePlayableBounds(
      centerX, centerZ, fx, fz, rx, rz, halfL, halfW, outPush,
    );
    const obstaclesPushed = collideWithObstacles(entity, pos, outPush);
    collideWithEntities(
      entity, centerX, centerZ, fx, fz, rx, rz, halfL, halfW, outPush,
    );
    // impact physics: the movement step's blocked closing speed is priced as a crash only against a hard surface
    hardContact = boundsPushed || obstaclesPushed;
    return outPush.x !== 0 || outPush.z !== 0;
  }

  function destroyObstacle(
    obstacle: AuthoritativeObstacle | null | undefined,
    entity: AuthoritativeEntity | null,
    cause = 'ram',
    impactDirectionX?: number,
    impactDirectionZ?: number,
    impactSpeedMps?: number,
  ): boolean {
    if (!obstacle || obstacle.crushed) return false;
    const directionSign = entity?.state ? Math.sign(entity.state.speed || 1) : 1;
    const directionX = impactDirectionX ?? (
      entity?.state ? Math.sin(entity.state.yaw) * directionSign : 0
    );
    const directionZ = impactDirectionZ ?? (
      entity?.state ? Math.cos(entity.state.yaw) * directionSign : 1
    );
    const speedMps = impactSpeedMps ?? (entity?.state ? Math.abs(entity.state.speed) : 0);
    const destroyed = worldCollision && typeof worldCollision.crushObstacle === 'function'
      ? worldCollision.crushObstacle(obstacle, directionX, directionZ, speedMps)
      : true;
    if (destroyed === false) return false;
    obstacle.crushed = true;
    const destroyedIndex = obstacleIndex.get(obstacle);
    if (typeof destroyedIndex === 'number' && Number.isSafeInteger(destroyedIndex)) {
      destroyedObstacleIndices.push(destroyedIndex);
      destructibleRevision++;
    }
    if (entity?.state) entity.state.speed *= obstacle.crushKeep ?? CRUSH_SPEED_KEEP;
    // a felled tree stops concealing (destruction, docs/DESTRUCTION.md §6)
    if (obstacle.treeIdx != null && obstacle.shape2) fellConcealersAt(worldConcealers, obstacle.shape2.cx, obstacle.shape2.cz);
    emit('world_prop_destroyed', {
      obstacleIndex: destroyedIndex,
      propIdx: obstacle.propIdx,
      treeIdx: obstacle.treeIdx,
      kind: obstacle.kind || (obstacle.treeIdx != null ? 'tree' : 'prop'),
      cause,
      directionX,
      directionZ,
      speedMps,
      // What fell in any world (ghost-crunch lane, 2026-10-02): the record's box centre at its base. The index is this
      // authority's (the map's collision manifest); a peer whose world is laid out otherwise — the mobile tier's lighter
      // placements, Frontline Assault's trench works — finds its own record of the prop by this, or none.
      x: (obstacle.min[0] + obstacle.max[0]) * 0.5,
      y: obstacle.min[1],
      z: (obstacle.min[2] + obstacle.max[2]) * 0.5,
    });
    return true;
  }

  /** Destruction: a blast fells the light props within its reach (trees, fences, crates, huts), nearest first. */
  const blastCandidates: AuthoritativeObstacle[] = [];
  const blastFelled: AuthoritativeObstacle[] = [];
  function fellPropsByBlast(x: number, y: number, z: number, chargeKg: number, budget: number): number {
    const radius = propFellRadiusM(chargeKg);
    if (!(radius > 0) || budget <= 0 || !worldCollision || typeof worldCollision.queryObstacles !== 'function') return 0;
    worldCollision.queryObstacles(x - radius, z - radius, x + radius, z + radius, blastCandidates);
    blastFelled.length = 0;
    for (const obstacle of blastCandidates) {
      if (!obstacle.crushable || obstacle.crushed || obstacle.min[1] > y + radius) continue;
      const cx = (obstacle.min[0] + obstacle.max[0]) * 0.5, cz = (obstacle.min[2] + obstacle.max[2]) * 0.5;
      if (Math.hypot(cx - x, cz - z) <= radius) blastFelled.push(obstacle);
    }
    // nearest first, then authority order: the same props fall on every run
    blastFelled.sort((a, b) => {
      const da = Math.hypot((a.min[0] + a.max[0]) * 0.5 - x, (a.min[2] + a.max[2]) * 0.5 - z);
      const db = Math.hypot((b.min[0] + b.max[0]) * 0.5 - x, (b.min[2] + b.max[2]) * 0.5 - z);
      return da - db || (obstacleIndex.get(a) ?? 0) - (obstacleIndex.get(b) ?? 0);
    });
    const fell = Math.min(blastFelled.length, PROP_FELL_PER_BLAST, budget);
    for (let i = 0; i < fell; i++) {
      const obstacle = blastFelled[i];
      const dx = (obstacle.min[0] + obstacle.max[0]) * 0.5 - x, dz = (obstacle.min[2] + obstacle.max[2]) * 0.5 - z;
      const length = Math.hypot(dx, dz) || 1;
      destroyObstacle(obstacle, null, 'blast', dx / length, dz / length, 6);
    }
    blastCandidates.length = 0;
    blastFelled.length = 0;
    return fell;
  }

  function resolvePendingCrushes(): void {
    for (const entry of pendingCrush) {
      destroyObstacle(entry.obstacle, entry.entity, entry.cause);
    }
    pendingCrush.length = 0;
    pendingCrushSet.clear();
  }

  function restoreDestroyedObstacles(indices: readonly number[], revision: number): { restored: number; unknown: number } {
    let restored = 0;
    let unknown = 0;
    for (const index of indices) {
      const obstacle = Number.isSafeInteger(index) && index >= 0 ? staticObstacles[index] : undefined;
      if (!obstacle) { unknown++; continue; }
      if (!obstacle.crushed) {
        if (worldCollision && typeof worldCollision.crushObstacle === 'function') worldCollision.crushObstacle(obstacle, 0, 1, 0);
        obstacle.crushed = true;
      }
      if (!destroyedObstacleIndices.includes(index)) destroyedObstacleIndices.push(index);
      restored++;
    }
    destructibleRevision = Math.max(destructibleRevision, Math.floor(finite(revision, 0)), destroyedObstacleIndices.length);
    return { restored, unknown };
  }

  function ramPairKey(contact: PendingRam): string {
    return contact.a.id < contact.b.id
      ? `${contact.a.id}|${contact.b.id}` : `${contact.b.id}|${contact.a.id}`;
  }

  function collectBestRamPairs(): void {
    bestRamPairs.clear();
    for (const contact of pendingRams) {
      const key = ramPairKey(contact);
      const current = bestRamPairs.get(key);
      if (!current || contact.closing > current.closing) bestRamPairs.set(key, contact);
    }
    pendingRams.length = 0;
  }

  function ramPairCanDamage(key: string, contact: PendingRam): boolean {
    const last = ramPairTime.get(key);
    if (last != null && timeS - last < RAM_PAIR_COOLDOWN_S) return false;
    const { a, b } = contact;
    if (!a.combat || !b.combat || a.combat.destroyed) return false;
    // Teammates still resolve physical separation, but contact can never
    // become friendly-fire damage or a kill credit.
    return a.team !== b.team;
  }

  function recordRamDestructions(
    a: AuthoritativeEntity,
    b: AuthoritativeEntity,
    bWasDestroyed: boolean,
  ): void {
    if (!bWasDestroyed && b.combat.destroyed) {
      a.kills += 1;
      emit('tank_destroyed', { id: b.id, killerId: a.id, cause: 'ram' });
    }
    if (!a.combat.destroyed) return;
    if (!bWasDestroyed) b.kills += 1;
    emit('tank_destroyed', {
      id: a.id,
      killerId: bWasDestroyed ? null : b.id,
      cause: 'ram',
    });
  }

  function resolveRamPair(key: string, contact: PendingRam): void {
    if (!ramPairCanDamage(key, contact)) return;
    const { a, b } = contact;
    // impact physics: the pool splits by mass, by who brought the closing speed and by the face each hull took it on
    const afx = Math.sin(a.state.yaw), afz = Math.cos(a.state.yaw);
    const bfx = Math.sin(b.state.yaw), bfz = Math.cos(b.state.yaw);
    const damage = ramShares(
      ruleset.physics, a.spec.weightTons, b.spec.weightTons, contact.closing,
      ramAggression(contact.closing, -contact.vAn), ramAggression(contact.closing, contact.vBn),
      contact.vertical ? 0 : -(contact.nx * afx + contact.nz * afz),
      contact.vertical ? 0 : contact.nx * bfx + contact.nz * bfz,
    );
    if (damage.total <= 0) return;
    ramPairTime.set(key, timeS);
    const bWasDestroyed = b.combat.destroyed;
    const damageA = hullDamageTaken(a.combat, damage.toA);
    const damageB = bWasDestroyed ? 0 : hullDamageTaken(b.combat, damage.toB);
    a.combat.hp = Math.max(0, a.combat.hp - damageA);
    if (!bWasDestroyed) b.combat.hp = Math.max(0, b.combat.hp - damageB);
    a.combat.destroyed = a.combat.hp <= 0;
    if (!bWasDestroyed) b.combat.destroyed = b.combat.hp <= 0;
    emit('tank_ram', {
      aId: a.id,
      bId: b.id,
      damageA,
      damageB,
      closingMps: contact.closing,
      x: (a.state.pos.x + b.state.pos.x) * 0.5,
      y: (a.state.pos.y + b.state.pos.y) * 0.5,
      z: (a.state.pos.z + b.state.pos.z) * 0.5,
    });
    recordRamDestructions(a, b, bWasDestroyed);
  }

  function resolvePendingRams(): void {
    if (!pendingRams.length) return;
    collectBestRamPairs();
    for (const [key, contact] of bestRamPairs) {
      // impact physics: every horizontal contact exchanges momentum — teammates and cooled-down pairs included,
      // the damage gate is separate; a roof landing already had its vertical impulse
      if (!contact.vertical) {
        exchangeRamMomentum(contact.a.state, contact.b.state, contact.nx, contact.nz,
          contact.a.spec.weightTons, contact.b.spec.weightTons, contact.vAn, contact.vBn, ruleset.physics.ramRestitution);
      }
      resolveRamPair(key, contact);
    }
  }

  function reloadMagazine(entity: AuthoritativeEntity): void {
    const reason = magazineReloadDenialReason(entity.combat);
    if (!reason && startMagazineReload(entity.combat, entity.spec)) {
      emit('magazine_reload', { id: entity.id });
      return;
    }
    emit('magazine_reload_denied', {
      id: entity.id,
      reason: reason || 'NO_MAGAZINE',
    });
  }

  function useSpecialAction(entity: AuthoritativeEntity): void {
    const action = activateSpecialAction(entity);
    emit(action.ok ? 'special_action' : 'special_action_denied', {
      id: entity.id,
      kind: action.kind,
      active: !!action.active,
      slot: action.slot ?? null,
      reason: action.reason || null,
    });
  }

  function repairConsumable(entity: AuthoritativeEntity): boolean {
    const modules = repairAllModules(entity.combat);
    for (const module of modules) emit('module_state', {
      id: entity.id,
      module,
      state: 'ok',
    });
    return modules.length > 0;
  }

  function firstAidConsumable(entity: AuthoritativeEntity): boolean {
    let used = false;
    for (const crew of Object.keys(entity.combat.crew)) {
      if (entity.combat.crew[crew] !== false) continue;
      entity.combat.crew[crew] = true;
      used = true;
    }
    return used;
  }

  function extinguisherConsumable(entity: AuthoritativeEntity): boolean {
    if (!entity.combat.fire.burning) return false;
    entity.combat.fire.burning = false;
    entity.combat.fire.ticksLeft = 0;
    entity.combat.fire.tickTimer = 0;
    emit('tank_fire', { id: entity.id, burning: false });
    return true;
  }

  function applyConsumable(entity: AuthoritativeEntity, bit: number): boolean {
    if (bit === PLAYER_ACTION_BITS.REPAIR) return repairConsumable(entity);
    if (bit === PLAYER_ACTION_BITS.FIRST_AID) return firstAidConsumable(entity);
    if (bit === PLAYER_ACTION_BITS.EXTINGUISHER) return extinguisherConsumable(entity);
    return false;
  }

  function useConsumableSlot(
    entity: AuthoritativeEntity,
    bits: number,
    slot: number,
  ): void {
    const bit = 1 << slot;
    if (!(bits & bit)) return;
    const remainingS = cooldownRemaining(timeS, entity.consumableReadyAt[slot]);
    if (remainingS > 0) {
      emit('consumable_denied', { id: entity.id, slot, reason: 'COOLDOWN', remainingS });
      return;
    }
    if (!applyConsumable(entity, bit)) {
      emit('consumable_denied', { id: entity.id, slot, reason: 'NOTHING' });
      return;
    }
    const cooldownS = CONSUMABLE_RULES[slot].cooldownS;
    const readyAt = timeS + cooldownS;
    entity.consumableReadyAt[slot] = readyAt;
    emit('consumable_used', { id: entity.id, slot, cooldownS, readyAt });
  }

  function useConsumables(entity: AuthoritativeEntity): void {
    const bits = entity.input.actionBits | 0;
    entity.input.actionBits = 0;
    if (!bits || entity.combat.destroyed) return;
    if (!result) {
      if(bits&PLAYER_ACTION_BITS.SUPPLY_AMMO)modeController.requestSupply(entity.id,'ammo',timeS+modeTimeOffsetS);
      if(bits&PLAYER_ACTION_BITS.SUPPLY_HEAL)modeController.requestSupply(entity.id,'heal',timeS+modeTimeOffsetS);
      if (bits & PLAYER_ACTION_BITS.SMOKE && requestAuxiliary(entity, 'smoke', timeS, heightField.getHeightAt)) {
        auxiliarySmokeScreens.push(entity.combat.auxiliary!.smoke!);
        if(auxiliarySmokeScreens.length>84)auxiliarySmokeScreens.shift();
      }
      if (bits & PLAYER_ACTION_BITS.DRONE) entity.input.auxiliaryBits = (entity.input.auxiliaryBits ?? 0) | PLAYER_ACTION_BITS.DRONE;
      if (bits & PLAYER_ACTION_BITS.LIGHTS_OFF) requestAuxiliary(entity, 'lightsOff', timeS);
      if (bits & PLAYER_ACTION_BITS.LIGHTS) requestAuxiliary(entity, 'lights', timeS);
      if (bits & PLAYER_ACTION_BITS.ROOF_GUN) requestAuxiliary(entity, 'roofGun', timeS);
    }
    if (bits & PLAYER_ACTION_BITS.RELOAD_MAGAZINE) reloadMagazine(entity);
    if (bits & PLAYER_ACTION_BITS.SPECIAL_ACTION) useSpecialAction(entity);
    if (bits & PLAYER_ACTION_BITS.SELF_RIGHT) {
      if (requestTankSelfRight(entity.state, entity.modeGravityScale ?? 1)) emit('tank_self_right', { id: entity.id });
      else requestTankJump(entity.state, entity.modeJumpMps, entity.modeGravityScale ?? 1);
    }
    for (let slot = 0; slot < CONSUMABLE_RULES.length; slot++) {
      useConsumableSlot(entity, bits, slot);
    }
  }

  function selectedShellForFire(
    entity: AuthoritativeEntity,
  ): AuthoritativeSpec['gun']['shells'][number] | null {
    if (entity.aerial?.kind === 'drone' && entity.aerial.active) return null;
    const combat = entity.combat;
    if (!entity.input.fire || combat.destroyed || combat.reload.t > 0) return null;
      const shellSpec = entity.spec.gun.shells[combat.shellSlot];
    if (!shellSpec) return null;
    if (selectedWeaponModuleState(combat, entity.spec.gun, shellSpec) === 'red') return null;
    if (shellSpec.guided !== true && !shellSpec.reloadGroup && combat.magazine && combat.magazine.rounds <= 0) return null;
    if (!hasAmmunition(combat, combat.shellSlot)) {
      if (!entity.bot) emit('ammo_empty', { id: entity.id, slot: combat.shellSlot });
      return null;
    }
    return shellSpec;
  }

  function botShotIsClear(
    entity: AuthoritativeEntity,
    shellSpec: AuthoritativeSpec['gun']['shells'][number],
  ): boolean {
    if (!entity.bot) return true;
    const friendlyRisk = botFriendlyFireRisk(
      entity, entity.input.aimPoint, shellSpec, entities,
    );
    if (!friendlyRisk) return true;
    entity.aiCtl?.notifyFriendlyBlocked?.(friendlyRisk);
    return false;
  }

  function selectFallbackAfterShot(
    entity: AuthoritativeEntity,
    firedSlot: number,
  ): void {
    if (hasAmmunition(entity.combat, firedSlot)) return;
    const fallbackSlot = selectFirstAvailableShell(entity.combat, entity.spec);
    if (fallbackSlot >= 0) entity.input.shellSlot = fallbackSlot;
    entity._deniedShellSlot = undefined;
    if (!entity.bot) emit('ammo_depleted', { id: entity.id, slot: firedSlot, fallbackSlot });
  }

  function notifyEnemyBotsOfShot(entity: AuthoritativeEntity): void {
    if(isGunship(entity))return;
    for (const other of entities) {
      if (!other.bot || other.team === entity.team || other.combat.destroyed || !other.aiCtl) continue;
      if (other.state.pos.distanceToSquared(entity.state.pos) <= 500 * 500) other.aiCtl.notifyEnemyFired(entity);
    }
  }

  function emitShellFired(
    entity: AuthoritativeEntity,
    shell: DamageShell,
    shellSpec: AuthoritativeSpec['gun']['shells'][number],
    muzzle: Vector3,
    direction: Vector3,
    firedSlot: number,
  ): void {
    emit('shell_fired', {
      shellId: shell.id,
      shooterId: entity.id,
      fireIntentSeq: entity.input.fireIntentSeq ?? null,
      shellSlot: firedSlot,
      shellType: shellSpec.type,
      shellName: shellSpec.name,
      muzzleIndex: usesLauncherMuzzles(entity.spec.gun, shellSpec)
        ? ((entity.combat.launcherCursor ?? 1) - 1) % entity.spec.gun.launcherMuzzles!.length : -1,
      weaponSound: shellSpec.soundProfile || entity.spec.gun.soundProfile || null,
      caliberMm: shellSpec.caliberMm,
      velocityMps: shellSpec.velocityMps,
      x: muzzle.x,
      y: muzzle.y,
      z: muzzle.z,
      dx: direction.x,
      dy: direction.y,
      dz: direction.z,
    });
  }

  function tryFire(entity: AuthoritativeEntity): void {
    const shellSpec = selectedShellForFire(entity);
    if (!shellSpec || !botShotIsClear(entity, shellSpec)) return;
    const combat = entity.combat;
    const gun = gunWorldPose(entity, shellSpec);
    if (isGunship(entity)) { gun.muzzle.copy(entity.state.pos); gun.direction.copy(entity.input.aimPoint).sub(gun.muzzle).normalize(); }
    _gunDir.copy(gun.direction);
    const sigma = computeDispersionRadM(entity.spec, entity.state, 100) / 200;
    applyDispersion(_gunDir, sigma, rng);
    const firedSlot = combat.shellSlot;
    if (!consumeAmmunition(combat, firedSlot)) return;
    const shell = createShell(shellSpec, entity.id, true, gun.muzzle, _gunDir, nextShellId++);
    shell.rocket = isUnguidedRocket(entity.spec.gun, shellSpec);
    if (usesLauncherMuzzles(entity.spec.gun, shellSpec)) {
      combat.launcherCursor = launcherMuzzleIndex(entity.spec.gun, shellSpec, combat.launcherCursor ?? 0) + 1;
    }
    // ruleset gravity rides the shooter's stamp (Turbo Ball: 0.6 g lobs); unlimited rounds refill the channel
    shell.gravityMps2 *= Number.isFinite(entity.modeGravityScale) ? entity.modeGravityScale! : 1;
    if(ruleset.aerial!=='gunship'||isGunship(entity))refillUnlimitedAmmunition(ruleset, combat, firedSlot);
    shells.push(shell);
    startPostShotReload(combat, entity.spec);
    selectFallbackAfterShot(entity, firedSlot);
    const launchScale = entity.bot ? 1 : (entity.modeRecoilLaunchScale ?? 1); // crews only, as in the solo sim
    fireRecoil(entity.state, entity.spec, shellSpec, launchScale > 1 ? { scale: launchScale, dirX: _gunDir.x, dirY: _gunDir.y, dirZ: _gunDir.z } : null);
    spotting.notifyFired(entity.id, timeS, shellSpec.caliberMm);
    notifyEnemyBotsOfShot(entity);
    emitShellFired(entity, shell, shellSpec, gun.muzzle, _gunDir, firedSlot);
  }

  function notifyShellHitAI(
    shooter: AuthoritativeEntity | undefined,
    target: AuthoritativeEntity | null | undefined,
    hit: HitEvent,
  ): void {
    if (shooter && hit.damage > 0) shooter.damage += hit.damage;
    if (shooter?.aiCtl) shooter.aiCtl.notifyShellResult({
      ...hit,
      targetId: target?.id || null,
    });
    // bot philosophy r1: a bounce is still a shot at the team — the struck hull reacts, teammates gain intel
    if (!shooter || !target || isGunship(shooter)) return;
    for (const ally of entities) {
      if (ally.team === target.team && ally.aiCtl && !ally.combat.destroyed &&
          (ally === target || ally.state.pos.distanceToSquared(target.state.pos) <= 200 * 200)) ally.aiCtl.notifyUnderFire(shooter, {
        selfHit: ally === target, damaging: hit.damage > 0, kind: hit.kind,
      });
    }
  }

  /**
   * A round detonating on a hull (destruction §11): its point and normal ride the first shell_hit it makes (the direct
   * hit's), so every peer raises one munition:blast where it burst, as the solo step does; splash hits carry none.
   */
  let pendingTankBlast: { shellId: number; blast: number[] } | null = null;

  function emitShellHitEvent(
    shell: DamageShell,
    hit: HitEvent,
    target: AuthoritativeEntity | null | undefined,
  ): void {
    const munition = munitionClassForShell(shell.spec);
    const chargeKg = munitionChargeKg(shell.spec, munition);
    const blast = pendingTankBlast?.shellId === shell.id && chargeKg > 0 ? pendingTankBlast.blast : null;
    if (blast) pendingTankBlast = null;
    emit('shell_hit', {
      ...hit,
      munition, chargeKg, ...(blast ? { blast } : {}),
      shooterId: shell.shooterId,
      attackerId: shell.shooterId,
      targetName: target?.spec.name,
      targetSpecId: target?.specId,
      targetMaxHp: target?.combat.maxHp || 0,
      damage: Math.max(0, Math.round(hit.damage || 0)),
      targetHp: Math.max(0, Math.round(target?.combat.hp || 0)),
    });
  }

  function emitShellDamageState(
    target: AuthoritativeEntity | null | undefined,
    hit: HitEvent,
  ): void {
    if (!target) return;
    for (const module of hit.modulesHit || []) emit('module_state', {
      id: target.id,
      module: module.module,
      state: module.newState,
      source: 'hit',
    });
    if (hit.fireStarted) emit('tank_fire', { id: target.id, burning: true });
  }

  function recordShotDestruction(
    shell: DamageShell,
    hit: HitEvent,
    shooter: AuthoritativeEntity | undefined,
    target: AuthoritativeEntity | null | undefined,
    wasDestroyed: boolean,
  ): void {
    if (!target || wasDestroyed || !target.combat.destroyed) return;
    if (shooter) shooter.kills += 1;
    emit('tank_destroyed', {
      id: target.id,
      killerId: shell.shooterId,
      cause: hit.ammoRacked ? 'ammo_rack' : 'shot',
    });
  }

  function recordShellHit(
    shell: DamageShell,
    hit: HitEvent,
    wasDestroyed = false,
  ): void {
    const target = hit.targetId ? entityById.get(hit.targetId) : null;
    const shooter = entityById.get(shell.shooterId);
    notifyShellHitAI(shooter, target, hit);
    emitShellHitEvent(shell, hit, target);
    emitShellDamageState(target, hit);
    recordShotDestruction(shell, hit, shooter, target, wasDestroyed);
  }

  function captureDestroyedBeforeBurst(): void {
    destroyedBeforeBurst.clear();
    for (const entity of entities) {
      destroyedBeforeBurst.set(entity.id, entity.combat.destroyed);
    }
  }

  function resolveHeImpact(
    shell: DamageShell,
    burstPoint: Vector3,
    directTarget: AuthoritativeEntity | null,
    directHits: ArmorIntersection[] | null,
  ): void {
    captureDestroyedBeforeBurst();
    const hits = resolveHeBurst(
      shell,
      burstPoint,
      entities,
      directTarget,
      directHits,
      rng,
    );
    for (const hit of hits) {
      const wasDestroyed = hit.targetId
        ? destroyedBeforeBurst.get(hit.targetId) ?? false
        : false;
      recordShellHit(shell, hit, wasDestroyed);
    }
  }

  function obstacleForWorldHit(worldHit: WorldTrace): AuthoritativeObstacle | null {
    const record = worldHit.record;
    if (record?.treeIdx != null) return obstacleByTreeIdx.get(record.treeIdx) || null;
    if (record?.propIdx != null) return obstacleByPropIdx.get(record.propIdx) || null;
    return null;
  }

  function destroyShellObstacle(shell: DamageShell, worldHit: WorldTrace): void {
    const obstacle = obstacleForWorldHit(worldHit);
    if (!obstacle?.crushable) return;
    const shotX = shell.pos.x - shell.prevPos.x;
    const shotZ = shell.pos.z - shell.prevPos.z;
    const shotLength = Math.hypot(shotX, shotZ) || 1;
    destroyObstacle(
      obstacle,
      null,
      'shell',
      shotX / shotLength,
      shotZ / shotLength,
      shell.spec.velocityMps,
    );
  }

  function traceBlockingWorldShellHit(
    shell: DamageShell,
    tankHit: TankTrace | null,
    segmentLength: number,
  ): WorldTrace | null {
    _worldTraceOrigin.copy(shell.prevPos);
    let travelled = 0;
    const tankDistance = tankHit?.distance ?? Infinity;
    for (let pass = 0; pass < 32; pass++) {
      const remaining = segmentLength - travelled;
      if (remaining <= 0) return null;
      const worldHit = segmentWorldHit(
        worldCollision,
        heightField,
        _worldTraceOrigin,
        shell.pos,
      );
      if (!worldHit) return null;
      const localDistance = Math.max(0, worldHit.t * remaining);
      const distance = travelled + localDistance;
      if (distance >= tankDistance) return null;
      if (!shellPassesThroughCollisionRecord(worldHit.record)) {
        worldHit.t = distance / segmentLength;
        return worldHit;
      }

      destroyShellObstacle(shell, worldHit);
      const advance = Math.min(remaining, Math.max(0.01, localDistance + 0.01));
      travelled += advance;
      _worldTraceOrigin.addScaledVector(_segmentDir, advance);
    }
    return null;
  }

  function emitWorldShellImpact(shell: DamageShell, worldHit: WorldTrace, craterId: number | null = null): void {
    // destruction (docs/DESTRUCTION.md §11): the round's class and charge, the structure it struck and the crater it dug,
    // for the peers' explosions and their munition:blast
    const munition = munitionClassForShell(shell.spec);
    const structureId = worldHit.record?.structureIdx;
    emit('shell_impact', {
      munition, chargeKg: munitionChargeKg(shell.spec, munition),
      ...(typeof structureId === 'number' ? { structureId } : {}),
      ...(craterId !== null ? { craterId } : {}),
      shellId: shell.id,
      shooterId: shell.shooterId,
      kind: worldHit.kind,
      surfaceKind: worldHit.record?.kind || worldHit.kind,
      x: shell.pos.x,
      y: shell.pos.y,
      z: shell.pos.z,
      nx: worldHit.normal?.x || 0,
      ny: worldHit.normal?.y || 1,
      nz: worldHit.normal?.z || 0,
      shellType: shell.spec.type,
      caliberMm: shell.spec.caliberMm,
    });
  }

  function resolveWorldShellHit(shell: DamageShell, worldHit: WorldTrace): void {
    shell.pos.lerpVectors(shell.prevPos, shell.pos, worldHit.t);
    if (isHeClass(shell.spec.type)) resolveHeImpact(shell, shell.pos, null, null);
    else shell.dead = true;
    destroyShellObstacle(shell, worldHit);
    // destruction: the struck structure takes the strike and the round's blast (docs/DESTRUCTION.md §4); a burst on
    // the ground (not on water) may dig a crater (§7, P3)
    const groundBurst = worldHit.kind === 'terrain' && !worldHit.record
      && !shellHitsWater({ heightField }, { kind: 'terrain', point: shell.pos });
    const craterId = destruction.shellWorldHit(shell.spec, worldHit.record, shell.pos.x, shell.pos.y, shell.pos.z,
      shell.pos.x - shell.prevPos.x, shell.pos.z - shell.prevPos.z, groundBurst);
    emitWorldShellImpact(shell, worldHit, craterId);
  }

  function knockTargetFromShell(target: AuthoritativeEntity, shell: DamageShell): void {
    const speed = Math.hypot(shell.vel.x, shell.vel.y, shell.vel.z) || shell.spec.velocityMps || 800;
    const knock = shellKnockMps(shell.spec.caliberMm, speed, target.spec.weightTons, target.modeShellKnockScale ?? 1);
    if (knock > 0) applyShellKnock(target.state, shell.vel.x / speed, shell.vel.y / speed, shell.vel.z / speed, knock);
  }

  function resolveTankShellHit(shell: DamageShell, tankHit: TankTrace): void {
    knockTargetFromShell(tankHit.target, shell);
    const strike = tankHit.hits[0]?.point;
    if (strike) destruction.shellBurst(shell.spec, strike.x, strike.y, strike.z, shell.vel.x, shell.vel.z);
    if (strike) {
      const normal = (tankHit.hits[0] as { normal?: { x: number; y: number; z: number } }).normal;
      pendingTankBlast = { shellId: shell.id, blast: [strike.x, strike.y, strike.z, normal?.x ?? 0, normal?.y ?? 1, normal?.z ?? 0] };
    }
    try {
      if (isHeClass(shell.spec.type)) {
        resolveHeImpact(shell, tankHit.hits[0]!.point, tankHit.target, tankHit.hits);
        return;
      }
      const wasDestroyed = tankHit.target.combat.destroyed;
      const hit = resolveShellHit(shell, tankHit.target, tankHit.hits, rng);
      recordShellHit(shell, hit, wasDestroyed);
    } finally {
      pendingTankBlast = null;
    }
  }

  function compactLiveShells(): void {
    let live = 0;
    for (const shell of shells) {
      if (!shell.dead) shells[live++] = shell;
    }
    shells.length = live;
  }

  function stepShells(dt: number): void {
    for (const shell of shells) {
      if (shell.dead) continue;
      const shooter = entityById.get(shell.shooterId);
      if (shooter && (specialActionGuidesShell(shooter, shell) || (isGunship(shooter) && shell.spec.guided))) {
        guideShellToward(shell, shooter.input?.aimPoint, dt);
      }
      stepShell(shell, dt);
      if (modeController.tryHitBall(shell)) continue;
      // mp v2 lag compensation: the sweep and its resolution read the poses the shooter saw
      shellRewind?.begin(shell);
      try {
        resolveShellSweep(shell);
      } finally {
        shellRewind?.end(shell);
      }
    }
    compactLiveShells();
  }

  function resolveShellSweep(shell: DamageShell): void {
    const tankHit = firstTankTrace(shell, entities);
    const segmentLength = shell.prevPos.distanceTo(shell.pos);
    const worldHit = traceBlockingWorldShellHit(shell, tankHit, segmentLength);
    if (worldHit) {
      resolveWorldShellHit(shell, worldHit);
      return;
    }
    if (tankHit) resolveTankShellHit(shell, tankHit);
  }

  function updateVisibility(): void {
    for (const event of spotting.update(SIM_DT, timeS)) {
      emit('tank_spotted', { ...event });
    }
  }

  function finishMatch(nextResult: MatchResult, reason: string): void {
    result = nextResult;
    resultReason = reason;
    resultTimeS = timeS;
    emit('match_ended', { result, reason: resultReason });
  }

  function winnerFromScores(alpha: number, bravo: number): MatchResult {
    if (alpha === bravo) return 'draw';
    return alpha > bravo ? TEAM_ALPHA : TEAM_BRAVO;
  }

  function determineModeResult(): void {
    if (timeS < clockLimitS) return;
    const score = modeController.state.score;
    const winner = winnerFromScores(score.alpha, score.bravo);
    // a level score resolves by the ruleset: Standard rules draw, a campaign sortie is lost by the attackers
    finishMatch(winner === 'draw' && ruleset.timeout === 'defeat' ? TEAM_BRAVO : winner, 'time_limit');
  }

  function countSurvivingTeams(): void {
    survivingTeams.alpha = 0;
    survivingTeams.bravo = 0;
    for (const entity of entities) {
      if (entity.combat.destroyed) continue;
      survivingTeams[entity.team]++;
    }
  }

  function determineEliminationResult(): void {
    countSurvivingTeams();
    const alpha = survivingTeams.alpha;
    const bravo = survivingTeams.bravo;
    const eliminated = alpha === 0 || bravo === 0;
    if (!eliminated && timeS < clockLimitS) return;
    finishMatch(
      winnerFromScores(alpha, bravo),
      eliminated ? 'elimination' : 'time_limit',
    );
  }

  function determineResult(modeResult: MatchModeResult | null = null): void {
    if (result) return; // one verdict: the hold keeps stepping the mode controller, never re-finishing
    if (modeResult) {
      finishMatch(modeResult.result, modeResult.reason);
      return;
    }
    if (!modeController.usesElimination) determineModeResult();
    else determineEliminationResult();
  }

  function stepCountdown(dt: number): boolean {
    if (phase !== 'countdown') return false;
    countdownRemainingS = Math.max(0, countdownRemainingS - dt);
    for (const entity of entities) applyNetworkInput(entity, null);
    if (countdownRemainingS === 0) {
      phase = 'playing';
      emit('match_started', { countdownMs: 0 });
    }
    updateVisibility();
    return true;
  }

  function isFastRouteMode(): boolean {
    return normalizedGameMode === 'turbo_ball' || normalizedGameMode === 'endless_horde' || normalizedGameMode === 'mars';
  }

  function refreshModeBotRoutes(): void {
    if (normalizedGameMode === 'standard' || timeS < nextModeRouteS) return;
    const fastRouteMode = isFastRouteMode();
    nextModeRouteS = timeS + (fastRouteMode ? 1.25 : 3);
    for (const entity of entities) {
      if (!entity.bot || entity.modeActive === false || entity.combat.destroyed) continue;
      const target = modeController.botTarget(entity);
      if (!target) continue;
      const moved = Math.hypot(
        target.x - (entity._modeTargetX ?? Infinity),
        target.z - (entity._modeTargetZ ?? Infinity),
      );
      if (moved < 12 && !fastRouteMode) continue;
      entity._modeTargetX = target.x;
      entity._modeTargetZ = target.z;
      entity.aiCtl?.setWaypoints([[target.x, target.z]], { loop: false });
    }
  }

  function reconcileBotShell(entity: AuthoritativeEntity): void {
    const shellSlot = Math.max(0, Math.min(
      entity.spec.gun.shells.length - 1,
      entity.input.shellSlot | 0,
    ));
    if (shellSlot === entity.combat.shellSlot) return;
    if (!selectShell(entity.combat, shellSlot, entity.spec)) {
      entity.input.shellSlot = entity.combat.shellSlot;
    }
  }

  // wrecks narrow streets: the bots' grid re-tests the edges round them a few times a second (the solo step too)
  const navigationWrecks: NavigationWreck[] = [];
  let navigationWreckTicks = 0;

  function updateEntityControls(
    dt: number,
    inputs: ReadonlyMap<string, AuthoritativePlayerInput | null | undefined>,
  ): void {
    if (botNavigation && navigationWreckTicks++ % 15 === 0) {
      syncNavigationWrecks(botNavigation, navigationWrecks, collectNavigationWrecks(entities, navigationWrecks));
    }
    for (const entity of entities) {
      if (entity.modeActive === false) continue;
      if (entity.bot) {
        // Countdown holds every gun through applyNetworkInput(null). Unlike
        // humans, bots have no incoming frame to release that safety hold;
        // hand aiming back to the shared solo AI before it writes this tick.
        if (!entity.combat.destroyed) entity.input.aimLocked = false;
        entity.aiCtl?.update(dt, timeS);
        reconcileBotShell(entity);
      } else {
        applyNetworkInput(entity, inputs.get(entity.id));
      }
      useConsumables(entity);
    }
    // battle endings (2026-09-25): the verdict silences every trigger — bots and humans — while the ruleset's
    // hold keeps the field alive (the solo step does the same in state.ts silenceGunsAfterVerdict)
    if (result) for (const entity of entities) entity.input.fire = false;
  }

  let movingEntity: AuthoritativeEntity | null = null;
  /** Impact physics: the last collideFor() was pushed by the map edge or a solid obstacle. */
  let hardContact = false;
  function collideMovingEntity(pos: Vector3, radius: number, out: Vector3): boolean {
    hardContact = false;
    return movingEntity ? collideFor(movingEntity, pos, radius, out) : false;
  }

  /** A crash is priced on the closing speed its contact ticks lose within this window of its first tick. */
  const IMPACT_CRASH_WINDOW_S = 0.3;
  /** A tick that loses less than this is the drive pressing against the surface, not a blow. */
  const IMPACT_TICK_MIN_MPS = 0.5;
  /** Landings slower than this are not worth an event. */
  const LANDING_EVENT_MIN_MPS = 3;

  function publishEntityImpact(
    entity: AuthoritativeEntity,
    kind: HullImpactKind,
    closingMps: number,
    result: HullImpactResult | null,
  ): void {
    emit('tank_impact', {
      id: entity.id,
      cause: kind,
      closingMps,
      damage: result?.damage ?? 0,
      destroyed: !!result?.destroyed,
      modulesHit: result?.modulesHit ?? [],
      crewHit: result?.crewHit ?? [],
      x: entity.state.pos.x, y: entity.state.pos.y, z: entity.state.pos.z,
    });
    if (!result) return;
    for (const hit of result.modulesHit) {
      emit('module_state', { id: entity.id, module: hit.module, state: hit.newState, source: 'impact' });
    }
    // self-inflicted, as a burn-out is: the hull is its own killer (no kill is credited)
    if (result.destroyed) emit('tank_destroyed', { id: entity.id, killerId: entity.id, cause: kind });
  }

  /**
   * Impact physics (owner 2026-09-25): the same pricing the solo step applies (game/state.ts resolveTankImpacts)
   * — a blocked drive against a hard surface is a crash on the accumulated closing speed, a landing is a fall on
   * the vertical closing speed; tank-on-tank pushes are the ram resolution's.
   */
  function resolveEntityImpacts(entity: AuthoritativeEntity): void {
    const state = entity.state;
    const physics = ruleset.physics;
    const impact = state.impactMps;
    const hard = impact >= IMPACT_TICK_MIN_MPS && (state.impactSource === IMPACT_SOURCE_CLIFF ||
      (state.impactSource === IMPACT_SOURCE_COLLIDER && hardContact));
    if (hard) {
      const fresh = timeS - (entity._impactAccumT ?? -1e9) > IMPACT_CRASH_WINDOW_S;
      const prior = fresh ? 0 : (entity._impactAccumMps ?? 0);
      const closing = prior + impact;
      entity._impactAccumMps = closing;
      if (fresh) entity._impactAccumT = timeS;
      const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw);
      const faceForward = -(state.impactNx * fx + state.impactNz * fz);
      const sideSign = Math.sign(-(state.impactNx * fz - state.impactNz * fx));
      const result = resolveHullImpact({
        combat: entity.combat, massTons: entity.spec.weightTons, physics, kind: 'impact',
        closingMps: closing, priorClosingMps: prior, faceForward, sideSign, attitudeFactor: 1, rng,
      });
      if (result || (impact > 1.5 && fresh)) publishEntityImpact(entity, 'impact', closing, result);
      // destruction: the structure the hull struck takes the crash's energy (docs/DESTRUCTION.md §4.4)
      if (entity._ramRecord && state.impactSource === IMPACT_SOURCE_COLLIDER) {
        destruction.ram(entity._ramRecord, entity.spec.weightTons, closing, prior,
          state.pos.x, state.pos.y, state.pos.z, -state.impactNx, -state.impactNz);
      }
    }
    // the fall the hull made (movement.ts fallImpactMps: the landing less the height the solver gave it, by energy)
    const landing = Number.isFinite(state.fallImpactMps) ? state.fallImpactMps : state.landingImpactMps;
    if (landing > 0) {
      // the landing's attitude is the tracks' (the attitude spring's): the posture a hull holds over them on a grade
      // (movement.ts state._hold) is no part of how it meets the ground
      const upY = Math.cos(state._spring.pitch) * Math.cos(state._spring.roll);
      const attitudeFactor = fallAttitudeFactor(state._spring.pitch - state._terr.pitch, state._spring.roll - state._terr.roll, upY);
      const result = resolveHullImpact({
        combat: entity.combat, massTons: entity.spec.weightTons, physics, kind: 'fall',
        closingMps: landing, priorClosingMps: 0, faceForward: 0, sideSign: 0, attitudeFactor, rng,
      });
      if (result || landing >= LANDING_EVENT_MIN_MPS) publishEntityImpact(entity, 'fall', landing, result);
    }
  }

  // round 30: hulls stand on the primitives they are above (structureSupport.ts), the same field the solo sim rides
  const _supportPose = createHullSupportPose();
  const structureSupport = createStructureSupportField(heightField, {
    queryObstacles: worldCollision && typeof worldCollision.queryObstacles === 'function'
      ? worldCollision.queryObstacles.bind(worldCollision) : undefined,
    getObstacles: worldCollision && typeof worldCollision.getObstacles === 'function'
      ? worldCollision.getObstacles.bind(worldCollision) : undefined,
  });
  function advanceTankMovement(dt: number): void {
    for (const entity of entities) {
      // wrecks keep moving (2026-09-19): applyNetworkInput already zeroes their input; readDebuffs skids them
      if (entity.modeActive === false) continue;
      if (isGunship(entity)) continue;
      movingEntity = entity;
      // the authority has no rendered contact geometry: the hull origin is its belly line (movement's default); a part
      // is a floor by the hull's underside over it, the obstacle solver's standing rule (structureSupport.ts)
      structureSupport.beginHull(entity.state.pos.x, entity.state.pos.z, entity.state.pos.y,
        hullSupportPose(entity.spec, entity.state, _supportPose));
      // Park the carrier only during ground integration; preserve held flight controls
      // for additional fixed steps when rendering slower than the simulation.
      const parking = entity.aerial?.kind === 'drone' && entity.aerial.active;
      const { throttle, steer, brake, aimLocked } = entity.input;
      if (parking) { entity.input.throttle = 0; entity.input.steer = 0; entity.input.brake = true; entity.input.aimLocked = true; }
      entity._ramRecord = null;
      entity._ramKeep = undefined;
      try { updateTank(entity, structureSupport, dt, collideMovingEntity); }
      finally { if (parking) { entity.input.throttle = throttle; entity.input.steer = steer; entity.input.brake = brake; entity.input.aimLocked = aimLocked; } }
      if (entity._ramKeep !== undefined) entity.state.speed *= entity._ramKeep;
      resolveEntityImpacts(entity);
    }
    movingEntity = null;
  }

  function queueBodyImpact(
    upper: AuthoritativeEntity,
    lower: AuthoritativeEntity,
    closing: number,
  ): void {
    // the upper hull is the aggressor of a vertical closing speed; the vertical module exchanged the impulse
    pendingRams.push({ a: upper, b: lower, closing, nx: 0, nz: 0, vAn: -closing, vBn: 0, vertical: true });
  }

  function advanceTankContacts(dt: number): void {
    activeBodyEntities.length = 0;
    for (const entity of entities) {
      if (entity.modeActive !== false) activeBodyEntities.push(entity);
    }
    resolveTankBodyContacts(activeBodyEntities, dt, queueBodyImpact);
    resolvePendingCrushes();
    resolvePendingRams();
  }

  function advanceRollover(dt: number): void {
    for (const entity of entities) {
      if (entity.modeActive === false || entity.combat.destroyed || !entity.bot) continue;
      if (stepRolloverLifecycle(entity.state, dt)) emit('tank_autoflip', { id: entity.id });
    }
  }

  const auxRay = new Vector3();
  const auxContext = {
    entities,
    visible: (target: {id:string}, shooter: import('./spotting.ts').SpottingTank) => spotting.isSpotted(target.id,shooter.team, shooter),
    clear: (a:Vector3,b:Vector3) => {
      if(smokeBlocks(auxiliarySmokeScreens,a,b,timeS,heightField.getHeightAt)) return false;
      auxRay.copy(b).sub(a); const distance=auxRay.length(); auxRay.normalize();
      const hit=spottingRaycast(a,auxRay,distance); return !hit || hit.dist>=distance-.5;
    },
  };
  function advanceWeapons(dt: number): void {
    for(let i=auxiliarySmokeScreens.length-1;i>=0;i--)if(timeS-auxiliarySmokeScreens[i]!.born>18)auxiliarySmokeScreens.splice(i,1);
    for (const entity of entities) {
      if (entity.modeActive === false || entity.combat.destroyed) continue;
      tickReload(entity.combat, dt);
      tryFire(entity);
      if (!result && stepRoofGun(entity,timeS,dt,auxContext)) {
        const shell=createShell(auxiliaryShot.shell,entity.id,!entity.bot,auxiliaryShot.origin,auxiliaryShot.direction,nextShellId++);
        shell.gravityMps2*=entity.modeGravityScale??1;shells.push(shell);
        spotting.notifyFired(entity.id,timeS,auxiliaryShot.shell.caliberMm);
      }
    }
    stepShells(dt);
  }

  function advanceFires(dt: number): void {
    fireTickAcc += dt;
    if (fireTickAcc < FIRE_TICK_S) return;
    fireTickAcc -= FIRE_TICK_S;
    for (const entity of entities) {
      if (entity.modeActive === false || entity.combat.destroyed) continue;
      const fire = tickFire(entity, rng);
      if (fire.extinguished) emit('tank_fire', { id: entity.id, burning: false });
      if (fire.destroyed) emit('tank_destroyed', {
        id: entity.id,
        killerId: entity.id,
        cause: 'fire',
      });
    }
  }

  function advanceRepairs(dt: number): void {
    for (const entity of entities) {
      if (entity.modeActive === false) continue;
      for (const module of tickModuleRepairs(entity.combat, dt, repairedModules)) {
        emit('module_state', { id: entity.id, module, state: 'yellow', repaired: true });
      }
    }
  }

  function stepPlaying(
    dt: number,
    inputs: ReadonlyMap<string, AuthoritativePlayerInput | null | undefined>,
  ): void {
    // past the ruleset's post-verdict hold the field stands still (snapshots keep publishing the frozen state)
    if (endingHoldExpired(ruleset, resultTimeS, timeS)) return;
    timeS += dt;
    refreshModeBotRoutes();
    updateEntityControls(dt, inputs);
    for (const entity of entities) stepAerial(entity, timeS + modeTimeOffsetS, dt, nextAerialShellId, launchAerialShell);
    advanceTankMovement(dt);
    advanceTankContacts(dt);
    advanceRollover(dt);
    advanceWeapons(dt);
    advanceFires(dt);
    advanceRepairs(dt);
    advanceDestruction();
    updateVisibility();
    determineResult(modeController.step(dt, timeS + modeTimeOffsetS));
  }

  /** Destruction's end of step: queued collapses swap their collision, stage events go out (every viewer). */
  function advanceDestruction(): void {
    if (destruction.enabled) {
      // the tick's blasts fell their light props, in report order (the solo step's stepDestruction alike)
      let budget = PROP_FELL_PER_TICK;
      for (let b = 0; b < pendingBlasts.length && budget > 0; b += 4) {
        budget -= fellPropsByBlast(pendingBlasts[b], pendingBlasts[b + 1], pendingBlasts[b + 2], pendingBlasts[b + 3], budget);
      }
      pendingBlasts.length = 0;
    }
    destruction.step();
    destructionEvents.length = 0;
    destruction.drainEvents(destructionEvents);
    for (const event of destructionEvents) emit('structure_stage', { ...event });
    // P2: holes and section falls, after the stages of the same tick (the log's order)
    breachEvents.length = 0;
    destruction.drainBreaches(breachEvents);
    for (const event of breachEvents) emit('structure_breach', { ...event });
    craterEvents.length = 0;
    destruction.drainCraters(craterEvents);
    for (const event of craterEvents) emit('terrain_crater', { ...event });
  }

  function canObserveEntity(viewer: AuthoritativeEntity | undefined, entityId: string): boolean {
    const entity = entityById.get(entityId);
    return Boolean(entity && entity.modeActive !== false &&
      (!viewer || entity.team === viewer.team || entity.combat.destroyed ||
        spotting.isSpotted(entity.id, viewer.team, viewer)));
  }

  function canObserveEvent(viewer: AuthoritativeEntity | undefined, value: RuntimeValue): boolean {
    if (!viewer) return true;
    if (!value || typeof value !== 'object') return false;
    const event = value as Record<string, RuntimeValue>;
    const eventType = typeof event.type === 'string' ? event.type : '';
    if (eventType === 'world_prop_destroyed' || eventType.startsWith('mode_')) return true;
    // destruction: a building breaking or the ground cratering is world state; the events name no shooter
    if (eventType === 'structure_stage' || eventType === 'structure_breach' || eventType === 'terrain_crater') return true;
    for (const id of [event.id, event.shooterId, event.targetId, event.killerId, event.aId, event.bId]) {
      if (id && canObserveEntity(viewer, String(id))) return true;
    }
    return eventType === 'match_ended';
  }

  const simulation: AuthoritativeMatch = {
    shotFeedbackVersion: 1,
    entities,
    entityById,
    requiredPeerIds: entities.filter((entity) => !entity.bot).map((entity) => entity.id),
    // the supplied (or shared) field itself; the match's own ground, the overlay on top of it, stays inside
    heightField: baseHeightField,
    get timeS() { return timeS; },
    get result() { return result; },
    get resultReason() { return resultReason; },
    get resultTimeS() { return resultTimeS; },
    endingHoldS: ruleset.endingHoldS,
    get phase() { return phase; },
    gameMode: normalizedGameMode,
    modeController,

    onMatchReady(): void {
      if (phase !== 'loading') return;
      phase = countdownRemainingS > 0 ? 'countdown' : 'playing';
      emit(phase === 'countdown' ? 'match_countdown' : 'match_started', {
        countdownMs: Math.round(countdownRemainingS * 1000),
      });
    },

    onPeerJoin({ peerId }: { peerId: string }): void {
      const entity = entityById.get(peerId);
      if (entity) entity.connected = true;
    },

    onPeerLeave({ peerId }: { peerId: string }): void {
      const entity = entityById.get(peerId);
      if (entity) {
        entity.connected = false;
        entity.input.throttle = 0;
        entity.input.steer = 0;
        entity.input.brake = true;
        entity.input.fire = false;
        entity.input.aimLocked = true;
        entity.input.actionBits = 0;
      }
    },

    step({ dt, countdownElapsedS = dt, inputs }: AuthoritativeStepOptions): void {
      // battle endings (2026-09-25): the verdict no longer freezes the field on the spot — stepPlaying keeps the
      // world alive (guns silent) through the ruleset's hold and stands still once it expires
      if (Math.abs(dt - SIM_DT) > 1e-9) {
        throw new Error(`authoritative match requires ${SIM_DT}s fixed steps`);
      }
      if (!Number.isFinite(countdownElapsedS) || countdownElapsedS < 0) {
        throw new TypeError('countdown elapsed seconds must be finite and non-negative');
      }
      if (stepCountdown(countdownElapsedS)) return;
      if (phase !== 'playing') return;
      stepPlaying(dt, inputs);
    },

    get pendingEventCount(): number { return pendingEvents.length; },

    eventsForViewer(viewerId: string): AuthoritativeEvent[] {
      const viewer = entityById.get(viewerId);
      return pendingEvents.filter((event) => canObserveEvent(viewer, event));
    },

    afterEventBroadcast(): void { pendingEvents.length = 0; },

    snapshot({
      tick,
      serverTimeMs,
      viewerId,
      ackInputSeq,
    }: AuthoritativeSnapshotOptions): WorldSnapshot {
      const viewer = entityById.get(viewerId);
      const canObserve = (_id: string, source: SnapshotEntitySource): boolean => {
        return canObserveEntity(viewer, String(source.id));
      };
      const canObserveShell = (_id: string, shell: SnapshotShellSource): boolean => {
        const shooter = entityById.get(String(shell.shooterId));
        return !shooter || canObserve(viewerId, shooter);
      };
      return captureWorldSnapshot({
        tick,
        serverTimeMs,
        entities,
        shells,
        events: pendingEvents,
        viewerId,
        ackInputSeq,
        canObserve,
        canObserveShell,
        canObserveEvent: (_id, event) => canObserveEvent(viewer, event),
        meta: {
          phase,
          smokeScreens: auxiliarySmokeScreens.filter(screen=>timeS-screen.born<=18).map(packSmokeScreen),
          // Stable presentation seed: no draw from the combat RNG stream.
          weatherSeed: seed >>> 0,
          countdownMs: Math.round(countdownRemainingS * 1000),
          battleTimeMs: Math.round(timeS * 1000),
          result,
          resultReason,
          destructibleRevision,
          destroyedObstacleIndices: destroyedObstacleIndices.slice(),
          // the destruction log (append-only; the host actor copies it when it grows)
          destructionLog: destruction.log,
          ...(viewer ? { localPrediction: capturePredictionAuthorityState(viewer) } : {}),
          ...(normalizedGameMode === 'standard' ? {} : {
            gameMode: normalizedGameMode,
            modeState: {
              ...modeController.serialize(viewerId),
              ...(normalizedGameMode === 'drone' ? {missionPayloads: entities
                .filter(entity => canObserveEntity(viewer,entity.id))
                .map(entity => ({id:entity.id,ready:!entity.aerial?.active && (entity.aerial?.cooldownS ?? 0)<=0}))} : {}),
            },
          }),
        },
      });
    },

    afterSnapshotBroadcast(): void {
      pendingEvents.length = 0;
    },

    captureModeCheckpoint() {
      if (!['juggernaut', 'infected', 'realistic', 'gun_game', 'drone', 'ac130'].includes(normalizedGameMode)) return null;
      const flightStates: NewModeCheckpoint['flights'] = [];
      for (const entity of entities) { const flight = captureAerial(entity); if (flight) flightStates.push({ id: entity.id, flight }); }
      return { mode: modeController.captureCheckpoint(timeS + modeTimeOffsetS), flights: flightStates };
    },
    restoreModeCheckpoint(checkpoint) {
      modeTimeOffsetS = Math.max(0, checkpoint.mode.elapsedS);
      modeController.restoreCheckpoint(checkpoint.mode);
      for (const entry of checkpoint.flights) { const entity = entityById.get(entry.id); if (entity) restoreAerial(entity, entry.flight, nextAerialShellId, launchAerialShell); }
    },
    restoreDestroyedObstacles,
    restoreDestruction(entries: readonly DestructionLogEntry[]): { applied: number } {
      return { applied: destruction.restore(entries) };
    },
  };
  updateVisibility();
  return simulation;
}
