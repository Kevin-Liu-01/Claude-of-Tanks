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
  updateTank,
} from './movement.ts';
import type { MovementCombatState, TankState } from './movement.ts';
import {
  prefersVerticalTankContact,
  resolveTankBodyContacts,
} from './tankBodyContacts.ts';
import { tankContactRect } from './tankContactShape.ts';
import { stepRolloverLifecycle } from './rollover.ts';
import {
  applyDispersion, createShell, guideShellToward, stepShell,
} from './ballistics.ts';
import { tankPoseFromState, traceTank } from './armor.ts';
import type { ArmorIntersection } from './armor.ts';
import {
  createCombatState,
  isHeClass,
  ramDamage,
  repairAllModules,
  resolveHeBurst,
  resolveShellHit,
  selectFirstAvailableShell,
  selectShell,
  magazineReloadDenialReason,
  startMagazineReload,
  startPostShotReload,
  tickReload,
  tickFire,
  tickModuleRepairs,
} from './damage.ts';
import type {
  CombatState,
  DamageShell,
  HitEvent,
} from './damage.ts';
import { createSpottingSystem } from './spotting.ts';
import type {
  ConcealerDisc,
  SpottingRayHit,
  SpottingVector3,
} from './spotting.ts';
import { captureWorldSnapshot } from '../net/snapshot.ts';
import type {
  SnapshotEntitySource,
  SnapshotShellSource,
  WorldSnapshot,
} from '../net/snapshot.ts';
import { pushHullFromHull, pushHullFromObstacle } from '../world/collision.ts';
import type { CollisionRecord } from '../world/collision.ts';
import { pushHullInsidePlayableBounds } from '../world/battlefieldBounds.ts';
import { applyEquipmentToCombat, defaultLoadoutFor } from '../game/equipment.ts';
import type { EquipmentCombatState } from '../game/equipment.ts';
import { botFriendlyFireRisk, createAI, roleOf } from '../game/ai.ts';
import type { AiDifficulty } from '../game/ai.ts';
import { createBotNavigationGrid, planBotRoute } from './botRoutePlanner.ts';
import type { BotRoutePoint } from './botRoutePlanner.ts';
import { CONSUMABLE_RULES, cooldownRemaining } from '../game/consumables.ts';
import { PLAYER_ACTION_BITS } from '../net/protocol.ts';
import { decodeAimIntent } from '../net/aimIntent.ts';
import type { AimIntentInput } from '../net/aimIntent.ts';
import {
  activateSpecialAction,
  createSpecialActionState,
  specialActionGuidesShell,
} from './specialActions.ts';
import { consumeAmmunition, hasAmmunition } from './ammunition.ts';
import { createMatchModeController, normalizeGameMode } from './matchModes.ts';
import type {
  GameModeId,
  MatchModeController,
  MatchModeEntity,
  MatchModeResult,
  MatchModeSpawn,
  ObjectiveTeam,
} from './matchModes.ts';
import type { SpecialActionState } from './specialActionPolicy.ts';

type Team = typeof TEAM_ALPHA | typeof TEAM_BRAVO;
type LobbyTeam = Team | typeof TEAM_SPECTATOR;
type MatchPhase = 'loading' | 'countdown' | 'playing';
type MatchResult = ObjectiveTeam | 'draw';
type Rng = () => number;

export interface AuthoritativeSpawn {
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
  aimLocked?: boolean;
  shellSlot: number;
  actionBits: number;
}

interface AuthoritativeInput {
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

export type AuthoritativeSpec = FleetTankSpec;

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
  notifyUnderFire(entity: AuthoritativeEntity): void;
  notifyPlayerFired(entity: AuthoritativeEntity, rank?: number): void;
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
  modeActive?: boolean;
  modeSpeedMultiplier?: number;
  _modeTargetX?: number;
  _modeTargetZ?: number;
  _deniedShellSlot?: number;
}

export interface AuthoritativeObstacle extends CollisionRecord {
  _pressT?: number;
  _pressS?: number;
}

export interface AuthoritativeWorldRayHit extends SpottingRayHit {
  kind: string;
  record?: AuthoritativeObstacle | null;
  normal?: SpottingVector3 | null;
}

export interface AuthoritativeWorldCollision {
  mapId?: string;
  heightField?: HeightField;
  getObstacles?(): AuthoritativeObstacle[];
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

export interface AuthoritativeMatchOptions {
  players?: AuthoritativePlayerRecord[];
  mapId?: string;
  seed?: number;
  battleLimitS?: number;
  countdownS?: number;
  gameMode?: GameModeId | string;
  worldCollision?: AuthoritativeWorldCollision | null;
}

export interface AuthoritativeEvent extends Record<string, RuntimeValue> {
  type: string;
  timeS: number;
}

export interface AuthoritativeStepOptions {
  dt: number;
  inputs: ReadonlyMap<string, AuthoritativePlayerInput | null | undefined>;
}

export interface AuthoritativeSnapshotOptions {
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
  readonly phase: MatchPhase;
  readonly gameMode: GameModeId;
  readonly modeController: MatchModeController<AuthoritativeEntity>;
  onMatchReady(): void;
  onPeerJoin(event: { peerId: string }): void;
  onPeerLeave(event: { peerId: string }): void;
  step(options: AuthoritativeStepOptions): void;
  snapshot(options: AuthoritativeSnapshotOptions): WorldSnapshot;
  afterSnapshotBroadcast(): void;
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
const _aim = new Vector3();
const _muzzle = new Vector3();
const _gunDir = new Vector3();
const _segmentDir = new Vector3();
const _hullMatrix = new Matrix4();
const _turretMatrix = new Matrix4();
const _localMatrix = new Matrix4();
const _quat = new Quaternion();
const _euler = new Euler();
const _unit = new Vector3(1, 1, 1);
const terrainCache = new Map<string, SharedTerrain>();

function sharedTerrain(mapId: string): SharedTerrain {
  const key = String(mapId || 'verdant');
  let cached = terrainCache.get(key);
  if (cached) return cached;
  const config = getMapConfig(key);
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
  layout: TerrainLayout,
  override?: AuthoritativeSpawn,
): Required<AuthoritativeSpawn> {
  if (override && Number.isFinite(override.x) && Number.isFinite(override.z)) {
    return {
      x: override.x,
      z: override.z,
      yaw: finite(override.yaw, team === TEAM_ALPHA ? 0 : Math.PI),
    };
  }
  if (team === TEAM_ALPHA) {
    const base = layout.spawns.player;
    const row = Math.floor(index / 4);
    const col = index % 4;
    return {
      x: base.x + (col - 1.5) * 8,
      z: base.z - row * 10,
      yaw: finite(base.yaw, 0),
    };
  }
  const base = layout.spawns.enemies[index % layout.spawns.enemies.length]!;
  // World layout already authors every enemy pad toward the opposing spawn.
  // Adding PI here made browser-hosted/dedicated Bravo tanks deploy backwards.
  return { x: base.x, z: base.z, yaw: finite(base.yaw, Math.PI) };
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

function gunWorldPose(entity: AuthoritativeEntity): { muzzle: Vector3; direction: Vector3 } {
  const state = entity.state;
  const armor = entity.spec.armor || {};
  const turretPivot = armor.turretPivot || [0, entity.spec.dims.heightM * 0.7, 0];
  const gunPivot = armor.gunPivot || [0, entity.spec.dims.heightM * 0.15, 0];
  const barrelM = Math.max(0.5, finite(armor.gunBarrel && armor.gunBarrel.lengthM, 3));

  _euler.set(-state.visualPitch, state.yaw, state.visualRoll, 'YXZ');
  _quat.setFromEuler(_euler);
  _hullMatrix.compose(state.pos, _quat, _unit);
  _localMatrix.makeRotationY(state.turretYaw);
  _localMatrix.setPosition(turretPivot[0], turretPivot[1], turretPivot[2]);
  _turretMatrix.multiplyMatrices(_hullMatrix, _localMatrix);

  const sinPitch = Math.sin(state.gunPitch);
  const cosPitch = Math.cos(state.gunPitch);
  _gunDir.set(0, sinPitch, cosPitch).transformDirection(_turretMatrix).normalize();
  _muzzle.set(gunPivot[0], gunPivot[1], gunPivot[2])
    .applyMatrix4(_turretMatrix)
    .addScaledVector(_gunDir, barrelM);
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
    if (target.id === shell.shooterId || target.modeActive === false ||
        !target.state || !target.combat) continue;
    const radius = finite(target.spec.armor && target.spec.armor.boundingRadiusM,
      target.spec.dims.hullLengthM * 0.65);
    const centerDistance = target.state.pos.distanceTo(shell.prevPos);
    if (centerDistance > segmentLength + radius + 2) continue;
    const pose = tankPoseFromState(target.state);
    const hits = traceTank(shell.prevPos, shell.pos, pose, target.spec.armor,
      target.combat.eraSpent);
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
  worldCollision = null,
}: AuthoritativeMatchOptions = {}): AuthoritativeMatch {
  if (!Array.isArray(players) || players.length < 1 || players.length > 14) {
    throw new TypeError('players must contain 1-14 records');
  }
  const ids = new Set<string>();
  if (worldCollision && worldCollision.mapId && worldCollision.mapId !== mapId) {
    throw new Error(`world collision map mismatch: expected ${mapId}, got ${worldCollision.mapId}`);
  }
  const shared = sharedTerrain(mapId);
  const heightField = worldCollision?.heightField || shared.heightField;
  const layout = shared.layout;
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
  let timeS = 0;
  let fireTickAcc = 0;
  let result: MatchResult | null = null;
  let resultReason: string | null = null;
  let phase: MatchPhase = 'loading';
  let countdownRemainingS = Math.max(0, finite(countdownS, 5));
  const staticObstacles = worldCollision && typeof worldCollision.getObstacles === 'function'
    ? worldCollision.getObstacles() : [];
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
    const pad = spawnFor(teamIndex[team]++, team, layout, record.spawn);
    _spawn.set(pad.x, heightField.getHeightAt(pad.x, pad.z), pad.z);
    const state = createTankState(spec, _spawn, pad.yaw);
    const input = makeInput();
    input.aimPoint.copy(state.aimPoint);
    const combat = createCombatState(spec) as AuthoritativeCombatState;
    const bot = !!record.bot;
    const loadout = Array.isArray(record.equipment)
      ? record.equipment.slice() : defaultLoadoutFor(spec);
    const equipment = applyEquipmentToCombat(
      combat,
      loadout,
      spec,
    );
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
  const spotting = createSpottingSystem({
    getTanks: () => entities,
    raycast: spottingRaycast,
    concealers: worldCollision && typeof worldCollision.getConcealment === 'function'
      ? worldCollision.getConcealment() : [],
    getEquipment: (entity) => entityById.get(entity.id)?.equip ?? null,
    getCamoBonus: () => 0,
    rng: mulberry32(seed + 31000),
    teams: [TEAM_ALPHA, TEAM_BRAVO],
  });
  const botNavigation = entities.some((entity) => entity.bot)
    ? createBotNavigationGrid({
      heightField,
      queryObstacles: worldCollision?.queryObstacles || null,
      getObstacles: () => staticObstacles,
    })
    : null;

  function initializeBot(entity: AuthoritativeEntity, index: number): void {
    const opponents = entities.filter((entry) => entry.team !== entity.team);
    const allies = entities.filter((entry) => entry !== entity && entry.team === entity.team);
    const botRng = mulberry32(seed + 41000 + index * 997);
    entity.aiCtl = createAI(entity, {
      difficulty: playerRecordById.get(entity.id)?.difficulty || 'normal',
      rng: botRng,
      deps: {
        heightField,
        raycast: spottingRaycast,
        getEnemies: () => opponents,
        getAllies: () => allies,
        getObstacles: () => staticObstacles,
        queryObstacles: worldCollision?.queryObstacles || null,
        spotting: {
          isSpotted: (targetId, receiver) =>
            spotting.isSpotted(targetId, entity.team, receiver || entity),
        },
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
    if (pendingEvents.length >= MAX_EVENTS) pendingEvents.shift();
    pendingEvents.push({ type, timeS, ...payload });
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
    if (healthScale !== 1) {
      tank.combat.maxHp = Math.max(1, Math.round(tank.combat.maxHp * healthScale));
      tank.combat.hp = tank.combat.maxHp;
    }
    tank.equip = applyEquipmentToCombat(
      tank.combat, tank.loadout || defaultLoadoutFor(tank.spec), tank.spec,
    );
    tank.consumableReadyAt = [0, 0, 0];
    tank.specialAction = createSpecialActionState(tank.spec);
    for (let n = 0; n < 30; n++) updateTank(tank, heightField, SIM_DT);
  }

  const normalizedGameMode = normalizeGameMode(gameMode);
  const modeController = createMatchModeController({
    mode: normalizedGameMode,
    entities,
    seed,
    revive: reviveForMode,
    setActive(entity, active) { entity.modeActive = active; },
    terrainHeight: (x, z) => heightField.getHeightAt(x, z),
    emit,
  });
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
      entity.input.aimLocked = false;
      entity.input.actionBits = 0;
      return;
    }
    entity.input.throttle = input.throttle;
    entity.input.steer = input.steer;
    entity.input.brake = input.brake;
    entity.input.fire = input.fire;
    entity.input.aimLocked = !!input.aimLocked;
    entity.input.actionBits = input.actionBits | 0;
    const shellSlot = Math.max(0, Math.min(
      entity.spec.gun.shells.length - 1,
      input.shellSlot | 0,
    ));
    if (shellSlot !== entity.combat.shellSlot) {
      if (selectShell(entity.combat, shellSlot, entity.spec)) {
        entity._deniedShellSlot = undefined;
      } else if (entity._deniedShellSlot !== shellSlot) {
        emit('ammo_selection_denied', {
          id: entity.id,
          slot: shellSlot,
          reason: 'AMMO_EMPTY',
          guided: entity.spec.gun.shells[shellSlot]?.guided === true,
        });
        entity._deniedShellSlot = shellSlot;
      }
    }
    entity.input.shellSlot = entity.combat.shellSlot;
    decodeAimIntent(input, entity.state.pos, _aim);
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

  function collideWithObstacles(
    entity: AuthoritativeEntity,
    pos: Vector3,
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
    const broadRadius = Math.hypot(halfL, halfW) + 0.01;
    for (const obstacle of obstacleCandidates(centerX, centerZ, broadRadius)) {
      if (obstacle.crushed || pos.y > obstacle.max[1] + 0.5) continue;
      const closestX = Math.max(obstacle.min[0], Math.min(centerX, obstacle.max[0]));
      const closestZ = Math.max(obstacle.min[2], Math.min(centerZ, obstacle.max[2]));
      const dx = centerX - closestX;
      const dz = centerZ - closestZ;
      if (dx * dx + dz * dz >= broadRadius * broadRadius) continue;
      const beforeX = outPush.x;
      const beforeZ = outPush.z;
      const pushed = pushHullFromObstacle(
        _contactCenter, fx, fz, rx, rz, halfL, halfW, obstacle, outPush,
      );
      if (!pushed || !obstacle.crushable || !obstacleIsPressedThrough(entity, obstacle)) continue;
      outPush.x = beforeX;
      outPush.z = beforeZ;
      queueCrushedObstacle(entity, obstacle);
    }
  }

  function queueRamFromPush(
    entity: AuthoritativeEntity,
    other: AuthoritativeEntity,
    fx: number,
    fz: number,
    ofx: number,
    ofz: number,
    pushX: number,
    pushZ: number,
  ): void {
    const pushLength = Math.hypot(pushX, pushZ);
    if (pushLength <= 1e-6) return;
    const nx = pushX / pushLength;
    const nz = pushZ / pushLength;
    const relativeX = fx * entity.state.speed - ofx * other.state.speed;
    const relativeZ = fz * entity.state.speed - ofz * other.state.speed;
    const closing = -(relativeX * nx + relativeZ * nz);
    if (closing > 0) pendingRams.push({ a: entity, b: other, closing });
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
      if (dx * dx + dz * dz > outer * outer || prefersVerticalTankContact(entity, other)) {
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
        entity, other, fx, fz, ofx, ofz,
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
    pushHullInsidePlayableBounds(
      centerX, centerZ, fx, fz, rx, rz, halfL, halfW, outPush,
    );
    collideWithObstacles(
      entity, pos, centerX, centerZ, fx, fz, rx, rz, halfL, halfW, outPush,
    );
    collideWithEntities(
      entity, centerX, centerZ, fx, fz, rx, rz, halfL, halfW, outPush,
    );
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
    emit('world_prop_destroyed', {
      obstacleIndex: destroyedIndex,
      propIdx: obstacle.propIdx,
      treeIdx: obstacle.treeIdx,
      kind: obstacle.kind || (obstacle.treeIdx != null ? 'tree' : 'prop'),
      cause,
      directionX,
      directionZ,
      speedMps,
    });
    return true;
  }

  function resolvePendingCrushes(): void {
    for (const entry of pendingCrush) {
      destroyObstacle(entry.obstacle, entry.entity, entry.cause);
    }
    pendingCrush.length = 0;
    pendingCrushSet.clear();
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
    const damage = ramDamage(a.spec.weightTons, b.spec.weightTons, contact.closing);
    if (damage.total <= 0) return;
    ramPairTime.set(key, timeS);
    const bWasDestroyed = b.combat.destroyed;
    const damageA = damage.toA;
    const damageB = bWasDestroyed ? 0 : damage.toB;
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
    if (bits & PLAYER_ACTION_BITS.RELOAD_MAGAZINE) reloadMagazine(entity);
    if (bits & PLAYER_ACTION_BITS.SPECIAL_ACTION) useSpecialAction(entity);
    for (let slot = 0; slot < CONSUMABLE_RULES.length; slot++) {
      useConsumableSlot(entity, bits, slot);
    }
  }

  function selectedShellForFire(
    entity: AuthoritativeEntity,
  ): AuthoritativeSpec['gun']['shells'][number] | null {
    const combat = entity.combat;
    if (!entity.input.fire || combat.destroyed || combat.reload.t > 0) return null;
    if (combat.modules.gun?.state === 'red') return null;
    const shellSpec = entity.spec.gun.shells[combat.shellSlot];
    if (!shellSpec) return null;
    if (shellSpec.guided !== true && combat.magazine && combat.magazine.rounds <= 0) return null;
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

  function notifyEnemyBotsOfPlayerShot(entity: AuthoritativeEntity): void {
    if (entity.bot) return;
    const respondingBots = entities
      .filter((entry) => entry.bot && entry.team !== entity.team && entry.aiCtl)
      .sort((a, b) => a.state.pos.distanceToSquared(entity.state.pos) -
        b.state.pos.distanceToSquared(entity.state.pos));
    for (let index = 0; index < respondingBots.length; index++) {
      respondingBots[index]?.aiCtl?.notifyPlayerFired(entity, index);
    }
  }

  function emitShellFired(
    entity: AuthoritativeEntity,
    shell: DamageShell,
    shellSpec: AuthoritativeSpec['gun']['shells'][number],
    muzzle: Vector3,
    direction: Vector3,
  ): void {
    emit('shell_fired', {
      shellId: shell.id,
      shooterId: entity.id,
      shellType: shellSpec.type,
      shellName: shellSpec.name,
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
    const gun = gunWorldPose(entity);
    _gunDir.copy(gun.direction);
    const sigma = computeDispersionRadM(entity.spec, entity.state, 100) / 200;
    applyDispersion(_gunDir, sigma, rng);
    const firedSlot = combat.shellSlot;
    if (!consumeAmmunition(combat, firedSlot)) return;
    const shell = createShell(shellSpec, entity.id, true, gun.muzzle, _gunDir, nextShellId++);
    shells.push(shell);
    startPostShotReload(combat, entity.spec);
    selectFallbackAfterShot(entity, firedSlot);
    fireRecoil(entity.state, entity.spec, shellSpec);
    spotting.notifyFired(entity.id, timeS, shellSpec.caliberMm);
    notifyEnemyBotsOfPlayerShot(entity);
    emitShellFired(entity, shell, shellSpec, gun.muzzle, _gunDir);
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
    if (!shooter || !target || hit.damage <= 0) return;
    for (const ally of entities) {
      if (ally.team === target.team && ally.aiCtl) ally.aiCtl.notifyUnderFire(shooter);
    }
  }

  function emitShellHitEvent(
    shell: DamageShell,
    hit: HitEvent,
    target: AuthoritativeEntity | null | undefined,
  ): void {
    emit('shell_hit', {
      ...hit,
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

  function emitWorldShellImpact(shell: DamageShell, worldHit: WorldTrace): void {
    emit('shell_impact', {
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
    emitWorldShellImpact(shell, worldHit);
  }

  function worldHitPrecedesTank(
    worldHit: WorldTrace | null,
    tankHit: TankTrace | null,
    segmentLength: number,
  ): worldHit is WorldTrace {
    return !!worldHit && (!tankHit || worldHit.t * segmentLength < tankHit.distance);
  }

  function resolveTankShellHit(shell: DamageShell, tankHit: TankTrace): void {
    if (isHeClass(shell.spec.type)) {
      resolveHeImpact(shell, tankHit.hits[0]!.point, tankHit.target, tankHit.hits);
      return;
    }
    const wasDestroyed = tankHit.target.combat.destroyed;
    const hit = resolveShellHit(shell, tankHit.target, tankHit.hits, rng);
    recordShellHit(shell, hit, wasDestroyed);
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
      if (shooter && specialActionGuidesShell(shooter, shell)) {
        guideShellToward(shell, shooter.input?.aimPoint, dt);
      }
      stepShell(shell, dt);
      if (modeController.tryHitBall(shell)) continue;
      const worldHit = segmentWorldHit(worldCollision, heightField, shell.prevPos, shell.pos);
      const tankHit = firstTankTrace(shell, entities);
      const segmentLength = shell.prevPos.distanceTo(shell.pos);
      if (worldHitPrecedesTank(worldHit, tankHit, segmentLength)) {
        resolveWorldShellHit(shell, worldHit);
        continue;
      }
      if (!tankHit) continue;
      resolveTankShellHit(shell, tankHit);
    }
    compactLiveShells();
  }

  function updateVisibility(): void {
    for (const event of spotting.update(SIM_DT, timeS)) {
      emit('tank_spotted', { ...event });
    }
  }

  function finishMatch(nextResult: MatchResult, reason: string): void {
    result = nextResult;
    resultReason = reason;
    emit('match_ended', { result, reason: resultReason });
  }

  function winnerFromScores(alpha: number, bravo: number): MatchResult {
    if (alpha === bravo) return 'draw';
    return alpha > bravo ? TEAM_ALPHA : TEAM_BRAVO;
  }

  function determineModeResult(): void {
    if (normalizedGameMode === 'endless_horde' || timeS < battleLimitS) return;
    const score = modeController.state.score;
    finishMatch(winnerFromScores(score.alpha, score.bravo), 'time_limit');
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
    if (!eliminated && timeS < battleLimitS) return;
    finishMatch(
      winnerFromScores(alpha, bravo),
      eliminated ? 'elimination' : 'time_limit',
    );
  }

  function determineResult(modeResult: MatchModeResult | null = null): void {
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
    return normalizedGameMode === 'turbo_ball' || normalizedGameMode === 'endless_horde';
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

  function updateEntityControls(
    dt: number,
    inputs: ReadonlyMap<string, AuthoritativePlayerInput | null | undefined>,
  ): void {
    for (const entity of entities) {
      if (entity.modeActive === false) continue;
      if (entity.bot) {
        entity.aiCtl?.update(dt, timeS);
        reconcileBotShell(entity);
      } else {
        applyNetworkInput(entity, inputs.get(entity.id));
      }
      useConsumables(entity);
    }
  }

  let movingEntity: AuthoritativeEntity | null = null;
  function collideMovingEntity(pos: Vector3, radius: number, out: Vector3): boolean {
    return movingEntity ? collideFor(movingEntity, pos, radius, out) : false;
  }

  function advanceTankMovement(dt: number): void {
    for (const entity of entities) {
      if (entity.modeActive === false || entity.combat.destroyed) continue;
      movingEntity = entity;
      updateTank(entity, heightField, dt, collideMovingEntity);
    }
    movingEntity = null;
  }

  function queueBodyImpact(
    upper: AuthoritativeEntity,
    lower: AuthoritativeEntity,
    closing: number,
  ): void {
    pendingRams.push({ a: upper, b: lower, closing });
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
      if (entity.modeActive === false || entity.combat.destroyed) continue;
      if (stepRolloverLifecycle(entity.state, dt)) emit('tank_autoflip', { id: entity.id });
    }
  }

  function advanceWeapons(dt: number): void {
    for (const entity of entities) {
      if (entity.modeActive === false || entity.combat.destroyed) continue;
      tickReload(entity.combat, dt);
      tryFire(entity);
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
      for (const module of tickModuleRepairs(entity.combat, dt)) {
        emit('module_state', { id: entity.id, module, state: 'yellow', repaired: true });
      }
    }
  }

  function stepPlaying(
    dt: number,
    inputs: ReadonlyMap<string, AuthoritativePlayerInput | null | undefined>,
  ): void {
    timeS += dt;
    refreshModeBotRoutes();
    updateEntityControls(dt, inputs);
    advanceTankMovement(dt);
    advanceTankContacts(dt);
    advanceRollover(dt);
    advanceWeapons(dt);
    advanceFires(dt);
    advanceRepairs(dt);
    updateVisibility();
    determineResult(modeController.step(dt, timeS));
  }

  const simulation: AuthoritativeMatch = {
    entities,
    entityById,
    requiredPeerIds: entities.filter((entity) => !entity.bot).map((entity) => entity.id),
    heightField,
    get timeS() { return timeS; },
    get result() { return result; },
    get resultReason() { return resultReason; },
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
        entity.input.aimLocked = false;
      }
    },

    step({ dt, inputs }: AuthoritativeStepOptions): void {
      if (result) return;
      if (Math.abs(dt - SIM_DT) > 1e-9) {
        throw new Error(`authoritative match requires ${SIM_DT}s fixed steps`);
      }
      if (stepCountdown(dt)) return;
      if (phase !== 'playing') return;
      stepPlaying(dt, inputs);
    },

    snapshot({
      tick,
      serverTimeMs,
      viewerId,
      ackInputSeq,
    }: AuthoritativeSnapshotOptions): WorldSnapshot {
      const viewer = entityById.get(viewerId);
      const canObserve = (_id: string, source: SnapshotEntitySource): boolean => {
        const entity = entityById.get(String(source.id));
        return Boolean(entity && entity.modeActive !== false &&
          (!viewer || entity.team === viewer.team || entity.combat.destroyed ||
            spotting.isSpotted(entity.id, viewer.team, viewer)));
      };
      const canObserveShell = (_id: string, shell: SnapshotShellSource): boolean => {
        const shooter = entityById.get(String(shell.shooterId));
        return !shooter || canObserve(viewerId, shooter);
      };
      const canObserveEvent = (_id: string, value: RuntimeValue): boolean => {
        if (!viewer) return true;
        if (!value || typeof value !== 'object') return false;
        const event = value as Record<string, RuntimeValue>;
        const eventType = typeof event.type === 'string' ? event.type : '';
        if (eventType === 'world_prop_destroyed' || eventType.startsWith('mode_')) return true;
        for (const id of [
          event.id, event.shooterId, event.targetId, event.killerId,
          event.aId, event.bId,
        ]) {
          if (!id) continue;
          const entity = entityById.get(String(id));
          if (entity && canObserve(viewerId, entity)) return true;
        }
        return eventType === 'match_ended';
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
        canObserveEvent,
        meta: {
          phase,
          countdownMs: Math.round(countdownRemainingS * 1000),
          battleTimeMs: Math.round(timeS * 1000),
          result,
          resultReason,
          destructibleRevision,
          destroyedObstacleIndices: destroyedObstacleIndices.slice(),
          ...(normalizedGameMode === 'standard' ? {} : {
            gameMode: normalizedGameMode,
            modeState: modeController.serialize(viewerId),
          }),
        },
      });
    },

    afterSnapshotBroadcast(): void {
      pendingEvents.length = 0;
    },
  };
  updateVisibility();
  return simulation;
}
