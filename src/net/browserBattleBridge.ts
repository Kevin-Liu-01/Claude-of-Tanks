import { Vector3 } from 'three';
import { createCombatState } from '../sim/damage.js';
import { createTankState, shotRecoilScale } from '../sim/movement.js';
import { getSpec } from '../vehicles/specs.js';
import { createTank, ensureTankBuilder } from '../vehicles/fleetFactory.js';
import { prebakeSharedTextures } from '../vehicles/materials.js';
import { tankContactRect } from '../sim/tankContactShape.ts';
import { pushHullFromHull, pushHullFromObstacle } from '../world/collision.js';
import { LocalTankPredictor } from './localTankPrediction.ts';
import {
  PresentationEventQueue,
  type PresentationEvent,
} from './presentationEventQueue.ts';
import {
  SNAPSHOT_FLAGS,
  type DecodedEntitySnapshot,
  type ImmediateAuthoritySnapshot,
  type QuantizedShellSnapshot,
  type SampledSnapshotFrame,
} from './snapshot.ts';
import type {
  LocalPredictionStats,
  PredictionInput,
  PredictionSimEntity,
  PredictionTankState,
} from './localTankPrediction.ts';
import { createSpecialActionState } from '../sim/specialActions.ts';

type Unsubscribe = () => void;
type Team = string | null;

interface ShellSpec extends Record<string, unknown> {
  name?: string;
  type?: string;
  soundProfile?: string;
  guided?: boolean;
}

interface TankSpec extends Record<string, unknown> {
  id: string;
  name?: string;
  dims: { widthM: number; hullLengthM: number; heightM: number };
  armor?: { bodyContactPoints?: { hull?: number[] } };
  gun?: {
    shells?: ShellSpec[];
    soundProfile?: string;
  };
}

interface BridgeTankState extends PredictionTankState {
  suspensionAim?: boolean;
}

interface BridgeCombatState {
  hp: number;
  maxHp: number;
  destroyed: boolean;
  shellSlot: number;
  reload: { t: number; totalS: number; kind: string };
  magazine: { rounds: number; capacity: number } | null;
  fire: { burning: boolean };
}

interface BridgeSpecialActionState {
  kind?: string;
  active: boolean;
  pendingFire: boolean;
}

interface TankVisual {
  root: unknown;
  contactGeom?: unknown;
  setVisible(visible: boolean): void;
  syncFromState(state: BridgeTankState, dt: number): void;
  dispose(): void;
  recoilKick?(dt: number, scale: number): number | null;
  gunMuzzleWorld?(target: Vector3, muzzleIndex: number): Vector3;
  stripEra?(plateName: string): void;
  resetEra?(): void;
  setDestroyed?(options: { pop: boolean }): void;
  resetDestroyed?(): void;
  setGroundSampler?(sampler: (x: number, z: number) => unknown): void;
}

interface BridgeInput {
  throttle: number;
  steer: number;
  brake: boolean;
  fire: boolean;
  shellSlot: number;
  aimPoint: Vector3;
}

interface BridgeEntity extends PredictionSimEntity {
  id: string;
  specId: string;
  spec: TankSpec;
  camo: string;
  displayName: string | null;
  networkTeam: string;
  team: 'player' | 'enemy';
  isPlayer: boolean;
  state: BridgeTankState;
  combat: BridgeCombatState;
  specialAction: BridgeSpecialActionState;
  input: BridgeInput;
  visual: TankVisual;
  networkVisible: boolean;
  predictor?: LocalTankPredictor;
  _networkPoseReady: boolean;
  _networkDestroyed: boolean;
  _networkDestroyPop?: boolean;
  _networkEraSpent?: Set<string>;
  _lastX: number;
  _lastZ: number;
}

interface RosterPlayer {
  id: string;
  name?: string;
  specId: string;
  camo?: string;
  team?: string;
}

interface EntitySeed extends RosterPlayer {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

interface CollisionObstacle {
  min: [number, number, number];
  max: [number, number, number];
  crushed?: boolean;
  crushable?: boolean;
  crushMin?: number;
}

interface HeightField {
  getHeightAt(x: number, z: number): number;
}

interface WorldCollision {
  heightField?: HeightField;
  queryObstacles?(
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    target: CollisionObstacle[],
  ): CollisionObstacle[];
  getObstacles?(): CollisionObstacle[];
  crushObstacle?(
    obstacle: CollisionObstacle,
    directionX: number,
    directionZ: number,
    speedMps: number,
  ): void;
}

interface EngineContext {
  scene: { add(object: unknown): void };
  anisotropy?: number;
}

interface SpottingFacade {
  isSpotted(targetId: string): boolean;
  getConcealment(): Record<string, number | boolean>;
}

interface BrowserGameState {
  tanks: BridgeEntity[];
  tankById: Map<string, BridgeEntity>;
  player: BridgeEntity | null;
  shells: BridgeShell[];
  spotting: SpottingFacade | null;
  allTanks?: Array<{ visual?: TankVisual | null }>;
  timeS: number;
  preBattleS: number;
  result?: string | null;
  resultReason?: string | null;
  mapId?: string;
  gameMode?: unknown;
  matchModeState?: unknown;
}

interface EventBus {
  emit(type: string, payload: Record<string, unknown>): void;
}

interface BridgeShell {
  id: number;
  shooterId: string;
  pos: Vector3;
  prevPos: Vector3;
  vel: Vector3;
  spec: { type: string; tracer: string; guided: boolean };
  dead: boolean;
  ageS: number;
  distM: number;
  spawnedAtS?: number;
}

interface LegacyGameState {
  tanks: BridgeEntity[];
  tankById: Map<string, BridgeEntity>;
  player: BridgeEntity | null;
  shells: BridgeShell[];
  spotting: SpottingFacade | null;
}

interface BridgeEvent extends PresentationEvent {
  id?: string;
  shooterId?: string;
  attackerId?: string;
  killerId?: string;
  cause?: string;
  shellId?: number;
  shellType?: string;
  shellName?: string;
  weaponSound?: string;
  caliberMm?: number;
  velocityMps?: number;
  timeS?: number;
  x?: number;
  y?: number;
  z?: number;
  dx?: number;
  dy?: number;
  dz?: number;
  nx?: number;
  ny?: number;
  nz?: number;
  kind?: string;
  surfaceKind?: string;
  obstacleIndex?: number;
  directionX?: number;
  directionZ?: number;
  speedMps?: number;
  result?: string;
  reason?: string;
  slot?: unknown;
  cooldownS?: unknown;
  readyAt?: unknown;
  remainingS?: unknown;
  active?: boolean;
  module?: unknown;
  state?: unknown;
  source?: unknown;
  burning?: boolean;
  aId?: string;
  bId?: string;
  damageA?: number;
  damageB?: number;
  closingMps?: number;
}

type CreateTankVisual = (
  specId: string,
  engineCtx: EngineContext,
  options: { camoSeed: number; camoPattern: string; quality: string },
) => TankVisual;

type PrepareVisualTextures = (
  spec: TankSpec,
  anisotropy: number,
  quality: string,
  tick: () => Promise<void>,
  camo: string,
) => Promise<unknown>;

export interface BrowserBattleBridgeOptions {
  engineCtx: EngineContext;
  game: BrowserGameState;
  bus: EventBus;
  viewerId: unknown;
  spectator?: boolean;
  worldCollision?: WorldCollision | null;
  createTankVisual?: CreateTankVisual;
  prepareVisualTextures?: PrepareVisualTextures;
  clearVehicleDecals?: ((visual: TankVisual) => void) | null;
}

export interface BrowserBattleBridge {
  entities: Map<string, BridgeEntity>;
  roster: BridgeEntity[];
  prepareRoster(
    players: RosterPlayer[],
    onProgress?: ((fraction: number, specId: string) => void) | null,
  ): Promise<void>;
  mount(): void;
  apply(snapshot: SampledSnapshotFrame, dt?: number, reliableEvents?: PresentationEvent[]): boolean;
  endDisconnected(): boolean;
  recordInput(input: PredictionInput | null, dt: number, inputSeq: number): boolean;
  getPredictionStats(): LocalPredictionStats | null;
  getPresentationEventStats(): Record<string, unknown>;
  setPerspective(entityId: unknown): boolean;
  unmount(): void;
  dispose(): void;
}

const readSpec = getSpec as unknown as (id: string) => TankSpec;
const makeTankState = createTankState as unknown as (
  spec: TankSpec,
  position: Vector3,
  yaw: number,
) => BridgeTankState;
const makeCombatState = createCombatState as unknown as (spec: TankSpec) => BridgeCombatState;
const makeSpecialActionState = createSpecialActionState;
const defaultCreateTankVisual = createTank as unknown as CreateTankVisual;
const defaultPrepareVisualTextures = prebakeSharedTextures as unknown as PrepareVisualTextures;
const recoilScale = shotRecoilScale as unknown as (
  spec: TankSpec,
  shell: ShellSpec | null,
) => number;

const POS_SCALE = 100;
const VEL_SCALE = 100;
const MAP_HALF_M = 508;
const _muzzleTip = new Vector3(); // §5.362 twin-plant flash-origin scratch
const _predictionContactCenter = new Vector3();

function hashString(value: unknown): number {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/**
 * Reconcile viewer-filtered network snapshots into first-party tank visuals.
 * No local gameplay is simulated here; interpolation output is presentation
 * state only and every combat value comes from authority.
 */
export function createBrowserBattleBridge({
  engineCtx,
  game,
  bus,
  viewerId,
  spectator = false,
  worldCollision = null,
  createTankVisual = defaultCreateTankVisual,
  prepareVisualTextures = defaultPrepareVisualTextures,
  clearVehicleDecals = null,
}: BrowserBattleBridgeOptions): BrowserBattleBridge {
  if (!engineCtx || !engineCtx.scene || !game) throw new TypeError('engineCtx and game are required');
  const id = String(viewerId || '');
  if (!id) throw new TypeError('viewerId is required');
  const entities = new Map<string, BridgeEntity>();
  const roster: BridgeEntity[] = [];
  const shellById = new Map<number, BridgeShell>();
  const visibleRoster: BridgeEntity[] = [];
  const liveShells: BridgeShell[] = [];
  let viewerTeam: Team = null;
  let perspectiveTeam: Team = null;
  let snapshotPhase: string | null = null;
  let mounted = false;
  let legacyState: LegacyGameState | null = null;
  const destructionCause = new Map<string, string>();
  const nearbyPredictionObstacles: CollisionObstacle[] = [];
  let appliedDestructibleRevision = -1;
  let visualDestroyCount = 0;
  let visualDestroyTotalMs = 0;
  let visualDestroyMaxMs = 0;

  function collidePrediction(
    entity: PredictionSimEntity,
    pos: Vector3,
    _radius: number,
    outPush: Vector3,
  ): boolean {
    outPush.set(0, 0, 0);
    const safeX = Math.max(-MAP_HALF_M, Math.min(MAP_HALF_M, pos.x));
    const safeZ = Math.max(-MAP_HALF_M, Math.min(MAP_HALF_M, pos.z));
    outPush.x = safeX - pos.x;
    outPush.z = safeZ - pos.z;
    if (!worldCollision) return outPush.x !== 0 || outPush.z !== 0;
    const contactRect = tankContactRect(entity.spec as unknown as TankSpec);
    const halfL = contactRect.halfLength;
    const halfW = contactRect.halfWidth;
    const yaw = entity.state.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = fz, rz = -fx;
    const centerX = pos.x + rx * contactRect.centerX + fx * contactRect.centerZ;
    const centerZ = pos.z + rz * contactRect.centerX + fz * contactRect.centerZ;
    _predictionContactCenter.set(centerX, pos.y, centerZ);
    const broadRadius = Math.hypot(halfL, halfW) + 0.01;
    const candidates = typeof worldCollision.queryObstacles === 'function'
      ? worldCollision.queryObstacles(
        centerX - broadRadius, centerZ - broadRadius,
        centerX + broadRadius, centerZ + broadRadius,
        nearbyPredictionObstacles,
      )
      : (typeof worldCollision.getObstacles === 'function' ? worldCollision.getObstacles() : []);
    for (const obstacle of candidates) {
      if (obstacle.crushed || pos.y > obstacle.max[1] + 0.5) continue;
      // Fast overruns are resolved by authority. Let prediction continue
      // through crushable dressing instead of visibly stopping at a fence
      // that the next snapshot is about to destroy.
      if (obstacle.crushable &&
          Math.abs(entity.state.speed) > (obstacle.crushMin ?? 2.8)) continue;
      const closestX = Math.max(obstacle.min[0], Math.min(centerX, obstacle.max[0]));
      const closestZ = Math.max(obstacle.min[2], Math.min(centerZ, obstacle.max[2]));
      const dx = centerX - closestX, dz = centerZ - closestZ;
      if (dx * dx + dz * dz >= broadRadius * broadRadius) continue;
      if (pushHullFromObstacle(
        _predictionContactCenter, fx, fz, rx, rz, halfL, halfW, obstacle, outPush,
      )) {
        entity._predictionStaticContacts = (entity._predictionStaticContacts || 0) + 1;
      }
    }

    // Mirror authority's exact-shell OBB narrow phase against currently
    // disclosed snapshot poses; never consult hidden entities. Parity here is
    // what prevents a teammate contact from becoming a correction loop.
    for (const other of entities.values()) {
      if (other.id === id || !other.state ||
          (!other.networkVisible && !other.combat?.destroyed)) continue;
      const otherRect = tankContactRect(other.spec);
      const otherHalfL = otherRect.halfLength;
      const otherHalfW = otherRect.halfWidth;
      const ofx = Math.sin(other.state.yaw);
      const ofz = Math.cos(other.state.yaw);
      const orx = ofz, orz = -ofx;
      const otherCenterX = other.state.pos.x +
        orx * otherRect.centerX + ofx * otherRect.centerZ;
      const otherCenterZ = other.state.pos.z +
        orz * otherRect.centerX + ofz * otherRect.centerZ;
      const dx = centerX - otherCenterX;
      const dz = centerZ - otherCenterZ;
      const outer = Math.hypot(halfL, halfW) + Math.hypot(otherHalfL, otherHalfW);
      if (dx * dx + dz * dz > outer * outer) continue;
      if (!pushHullFromHull(
        centerX, centerZ, fx, fz, rx, rz, halfL, halfW,
        otherCenterX, otherCenterZ, ofx, ofz, orx, orz, otherHalfL, otherHalfW,
        outPush,
      )) continue;
      entity._predictionDynamicContacts = (entity._predictionDynamicContacts || 0) + 1;
    }
    return outPush.x !== 0 || outPush.z !== 0;
  }

  function ensureEntity(snapshot: EntitySeed | DecodedEntitySnapshot): BridgeEntity {
    const existing = entities.get(snapshot.id);
    const displayName = 'name' in snapshot && typeof snapshot.name === 'string'
      ? snapshot.name : null;
    const camo = 'camo' in snapshot && typeof snapshot.camo === 'string'
      ? snapshot.camo : 'factory';
    if (existing) {
      if (displayName) existing.displayName = displayName;
      return existing;
    }
    const spec = readSpec(snapshot.specId);
    const pos = new Vector3(snapshot.x, snapshot.y, snapshot.z);
    const state = makeTankState(spec, pos, snapshot.yaw);
    const combat = makeCombatState(spec);
    const visual = createTankVisual(spec.id, engineCtx, {
      camoSeed: 4000 + (hashString(snapshot.id) % 100000),
      camoPattern: camo,
      quality: snapshot.id === id ? 'high' : 'ai',
    });
    engineCtx.scene.add(visual.root);
    visual.setVisible(false);
    const entity: BridgeEntity = {
      id: snapshot.id,
      specId: spec.id,
      spec,
      camo,
      displayName,
      networkTeam: String(snapshot.team || ''),
      team: 'enemy',
      isPlayer: !spectator && snapshot.id === id,
      state,
      combat,
      specialAction: makeSpecialActionState(spec),
      input: {
        throttle: 0,
        steer: 0,
        brake: false,
        fire: false,
        shellSlot: 0,
        aimPoint: state.aimPoint.clone(),
      },
      visual,
      contactGeom: visual.contactGeom || null,
      rigidGear: false,
      networkVisible: false,
      _networkPoseReady: false,
      _networkDestroyed: false,
      _lastX: snapshot.x,
      _lastZ: snapshot.z,
    };
    if (!spectator && snapshot.id === id && worldCollision?.heightField) {
      entity.predictor = new LocalTankPredictor({
        entity,
        heightField: worldCollision.heightField,
        collide: collidePrediction,
      });
    }
    entities.set(entity.id, entity);
    roster.push(entity);
    return entity;
  }

  async function prepareRoster(
    players: RosterPlayer[],
    onProgress: ((fraction: number, specId: string) => void) | null = null,
  ): Promise<void> {
    const active = (players || []).filter((player) => player.team !== 'spectator');
    const warmed = new Set();
    for (let index = 0; index < active.length; index++) {
      const player = active[index];
      await ensureTankBuilder(player.specId);
      const quality = !spectator && player.id === id ? 'high' : 'ai';
      const camo = player.camo || 'factory';
      const warmKey = `${player.specId}:${camo}:${quality}`;
      if (!warmed.has(warmKey)) {
        warmed.add(warmKey);
        try {
          await prepareVisualTextures(
            readSpec(player.specId),
            engineCtx.anisotropy ?? 4,
            quality,
            nextFrame,
            camo,
          );
        } catch (_) { /* createTank retains its synchronous compatibility path */ }
      }
      ensureEntity({
        id: player.id,
        name: player.name,
        specId: player.specId,
        camo,
        team: player.team,
        x: 0, y: 0, z: 0, yaw: 0,
      });
      if (onProgress) onProgress((index + 1) / Math.max(1, active.length), player.specId);
      await nextFrame();
    }
  }

  function updateEntity(
    entity: BridgeEntity,
    snapshot: DecodedEntitySnapshot,
    dt: number,
    immediateAuthority: ImmediateAuthoritySnapshot | null = null,
  ): void {
    entity.networkTeam = snapshot.team;
    if (!spectator && entity.id === id) viewerTeam = snapshot.team;
    const referenceTeam = spectator ? perspectiveTeam : viewerTeam;
    entity.team = snapshot.team === referenceTeam ? 'player' : 'enemy';
    entity.isPlayer = !spectator && entity.id === id;
    entity.networkVisible = true;
    const state = entity.state;
    const combat = entity.combat;
    combat.hp = snapshot.hp;
    combat.maxHp = snapshot.maxHp;
    combat.reload.t = snapshot.reloadS;
    combat.reload.totalS = Math.max(snapshot.reloadTotalS || 0, snapshot.reloadS);
    combat.reload.kind = snapshot.reloadKind || 'ready';
    if (snapshot.magazineCapacity > 0) {
      if (!combat.magazine) combat.magazine = { rounds: 0, capacity: 0 };
      combat.magazine.rounds = snapshot.magazineRounds;
      combat.magazine.capacity = snapshot.magazineCapacity;
    } else {
      combat.magazine = null;
    }
    combat.shellSlot = snapshot.shellSlot;
    combat.fire.burning = !!(snapshot.flags & SNAPSHOT_FLAGS.BURNING);
    const destroyed = !!(snapshot.flags & SNAPSHOT_FLAGS.DESTROYED);
    combat.destroyed = destroyed;
    entity.input.fire = !!(snapshot.flags & SNAPSHOT_FLAGS.FIRING);
    entity.input.shellSlot = snapshot.shellSlot;
    entity.specialAction.active = !!(snapshot.flags & SNAPSHOT_FLAGS.SPECIAL_ACTIVE);
    entity.specialAction.pendingFire = !!(snapshot.flags & SNAPSHOT_FLAGS.SPECIAL_PENDING);
    state.suspensionAim = entity.specialAction.kind === 'hydropneumatic_aim' &&
      entity.specialAction.active;
    const spentEra = Array.isArray(snapshot.eraSpent) ? snapshot.eraSpent : [];
    const shownEra = entity._networkEraSpent || (entity._networkEraSpent = new Set());
    let resetEra = false;
    for (const plateName of shownEra) {
      if (!spentEra.includes(plateName)) { resetEra = true; break; }
    }
    if (resetEra) {
      entity.visual.resetEra?.();
      shownEra.clear();
    }
    for (const plateName of spentEra) {
      if (shownEra.has(plateName)) continue;
      entity.visual.stripEra?.(plateName);
      shownEra.add(plateName);
    }
    if (destroyed) visualDestroy(entity);
    else if (!destroyed && entity._networkDestroyed) {
      if (entity.visual.resetDestroyed) entity.visual.resetDestroyed();
      entity._networkDestroyed = false;
      entity._networkDestroyPop = false;
    }
    if (entity.predictor && immediateAuthority) {
      entity.predictor.reconcile({
        ...immediateAuthority,
        sampledEntity: snapshot,
      }, dt, destroyed);
    } else {
      const dx = snapshot.x - entity._lastX;
      const dz = snapshot.z - entity._lastZ;
      const forwardDistance = dx * Math.sin(snapshot.yaw) + dz * Math.cos(snapshot.yaw);
      state.trackScroll.l += forwardDistance;
      state.trackScroll.r += forwardDistance;
      state.pos.set(snapshot.x, snapshot.y, snapshot.z);
      state.verticalSpeed = snapshot.vy || 0;
      state.grounded = !(snapshot.flags & SNAPSHOT_FLAGS.AIRBORNE);
      if (state._ride) {
        state._ride.y = snapshot.y;
        state._ride.v = state.verticalSpeed;
        state._ride.grounded = state.grounded;
      }
      state.yaw = snapshot.yaw;
      state.visualPitch = snapshot.pitch;
      state.visualRoll = snapshot.roll;
      state.turretYaw = snapshot.turretYaw;
      state.gunPitch = snapshot.gunPitch;
      const speed = Math.hypot(snapshot.vx, snapshot.vz);
      const direction = snapshot.vx * Math.sin(snapshot.yaw) + snapshot.vz * Math.cos(snapshot.yaw);
      state.speed = direction < 0 ? -speed : speed;
    }
    entity._lastX = state.pos.x;
    entity._lastZ = state.pos.z;
    // Prepared network visuals live at a hidden staging origin. Seed the
    // renderer from authority exactly once before revealing them; the normal
    // main-loop sync remains the sole per-frame owner after this point.
    if (!entity._networkPoseReady) {
      entity.visual.syncFromState(state, 0);
      entity._networkPoseReady = true;
    }
    entity.visual.setVisible(true);
  }

  function visualDestroy(entity: BridgeEntity): void {
    const pop = destructionCause.get(entity.id) === 'ammo_rack';
    if (entity._networkDestroyed && entity._networkDestroyPop === pop) return;
    entity._networkDestroyed = true;
    entity._networkDestroyPop = pop;
    if (entity.visual.setDestroyed) {
      const startedAt = performance.now();
      // Match the local destruction contract: impact scars are transient
      // children of the live tank and must detach before the wreck material
      // traversal. Network snapshots arrive before their reliable event is
      // flushed, so relying on the effects listener alone converted those
      // normal-less decal quads into opaque burnt meshes and linked two new
      // programs on the first kill frame.
      if (typeof clearVehicleDecals === 'function') clearVehicleDecals(entity.visual);
      entity.visual.setDestroyed({ pop });
      const elapsedMs = performance.now() - startedAt;
      visualDestroyCount += 1;
      visualDestroyTotalMs += elapsedMs;
      visualDestroyMaxMs = Math.max(visualDestroyMaxMs, elapsedMs);
    }
  }

  function updateShells(rawShells: QuantizedShellSnapshot[]): void {
    const live = new Set();
    for (const raw of rawShells || []) {
      const shellId = Number(raw.id);
      live.add(shellId);
      let shell = shellById.get(shellId);
      if (!shell) {
        shell = {
          id: shellId,
          shooterId: raw.shooterId,
          pos: new Vector3(),
          prevPos: new Vector3(),
          vel: new Vector3(),
          spec: {
            type: raw.type,
            tracer: raw.guided ? 'ATGM' : raw.type,
            guided: !!raw.guided,
          },
          dead: false,
          ageS: 0,
          distM: 0,
        };
        shellById.set(shellId, shell);
      }
      shell.prevPos.copy(shell.pos);
      shell.pos.set(raw.x / POS_SCALE, raw.y / POS_SCALE, raw.z / POS_SCALE);
      if (shell.prevPos.lengthSq() === 0) shell.prevPos.copy(shell.pos);
      else shell.distM += shell.prevPos.distanceTo(shell.pos);
      shell.vel.set(raw.vx / VEL_SCALE, raw.vy / VEL_SCALE, raw.vz / VEL_SCALE);
      shell.spec.type = raw.type;
      shell.spec.guided = !!raw.guided;
      shell.spec.tracer = raw.guided ? 'ATGM' : raw.type;
      shell.ageS = Math.max(0, game.timeS - (shell.spawnedAtS || game.timeS));
      if (shell.spawnedAtS == null) shell.spawnedAtS = game.timeS;
    }
    for (const [shellId, shell] of shellById) {
      if (!live.has(shellId)) { shell.dead = true; shellById.delete(shellId); }
    }
    liveShells.length = 0;
    for (const shell of shellById.values()) liveShells.push(shell);
    game.shells = liveShells;
  }

  function emitEvent(event: BridgeEvent): void {
    if (typeof event.type !== 'string') return;
    if (event.type === 'shell_fired') {
        const shooter = entities.get(String(event.shooterId || ''));
        // §5.362 fleet recoil in networked battles: the authoritative sim
        // fires server-side, so play the same presentation recuperator
        // stroke the local sim would (state.js tryFire wiring) on the
        // shooter's first-party visual — flash and barrel throw share this
        // one event. Belt rounds resolve the shared rapid scale from the
        // fired shell exactly like the local path.
        let muzzlePos = [event.x, event.y, event.z];
        let shellSpec = null;
        let muzzleIndex: number | null = -1;
        if (shooter && shooter.visual && shooter.visual.recoilKick) {
          const shells = (shooter.spec && shooter.spec.gun && shooter.spec.gun.shells) || [];
          shellSpec = shells.find((s) => s.name === event.shellName)
            || shells.find((s) => s.type === event.shellType) || null;
          muzzleIndex = shooter.visual.recoilKick(
            0, recoilScale(shooter.spec, shellSpec));
          // Twin-plant ids: the flash spawns at the firing barrel's tip
          // (the visual owns the alternation cursor here — the server's
          // center-bore ballistics stay authoritative for the shell).
          if (muzzleIndex != null && shooter.visual.gunMuzzleWorld) {
            shooter.visual.gunMuzzleWorld(_muzzleTip, muzzleIndex);
            muzzlePos = [_muzzleTip.x, _muzzleTip.y, _muzzleTip.z];
          }
        }
        bus.emit('shell:fired', {
          shellId: event.shellId,
          shooterId: event.shooterId,
          isPlayer: event.shooterId === id,
          shellType: event.shellType,
          shellName: event.shellName,
          weaponSound: event.weaponSound || shellSpec?.soundProfile
            || shooter?.spec?.gun?.soundProfile || null,
          muzzleIndex,
          caliberMm: event.caliberMm,
          velocityMps: event.velocityMps,
          timeS: event.timeS,
          muzzlePos,
          dir: [event.dx, event.dy, event.dz],
          shooterSpecId: shooter?.specId,
        });
    } else if (event.type === 'shell_hit') {
        bus.emit('shell:hit', {
          ...event,
          attackerId: event.attackerId || event.shooterId,
        });
    } else if (event.type === 'shell_impact') {
        bus.emit('shell:expired', {
          shellId: event.shellId,
          shooterId: event.shooterId,
          hitTerrain: event.kind === 'terrain',
          hitKind: event.kind,
          surfaceKind: event.surfaceKind || event.kind,
          normal: [event.nx || 0, event.ny ?? 1, event.nz || 0],
          shellType: event.shellType,
          caliberMm: event.caliberMm,
          pos: [event.x, event.y, event.z],
        });
    } else if (event.type === 'tank_destroyed') {
        const entity = entities.get(String(event.id || ''));
        bus.emit('tank:destroyed', {
          id: event.id,
          specId: entity && entity.specId,
          killerId: event.killerId,
          cause: event.cause === 'ammo_rack' ? 'ammorack' : event.cause,
          pos: entity ? [entity.state.pos.x, entity.state.pos.y, entity.state.pos.z] : null,
        });
    } else if (event.type === 'world_prop_destroyed') {
        const collision = worldCollision;
        const obstacleIndex = Number(event.obstacleIndex);
        const obstacle = collision && typeof collision.getObstacles === 'function' &&
            Number.isSafeInteger(obstacleIndex) && obstacleIndex >= 0
          ? collision.getObstacles()[obstacleIndex]
          : null;
        if (obstacle && !obstacle.crushed && typeof collision?.crushObstacle === 'function') {
          collision.crushObstacle(
            obstacle,
            Number(event.directionX) || 0,
            Number(event.directionZ) || 0,
            Number(event.speedMps) || 0,
          );
        }
        bus.emit('prop:crushed', {
          kind: event.kind,
          speedMps: event.speedMps,
          cause: event.cause,
          pos: obstacle ? [
            (obstacle.min[0] + obstacle.max[0]) * 0.5,
            obstacle.min[1],
            (obstacle.min[2] + obstacle.max[2]) * 0.5,
          ] : null,
          dir: [event.directionX, 0, event.directionZ],
        });
    } else if (event.type === 'consumable_used' && event.id === id) {
        bus.emit('ui:consumableUsed', {
          slot: event.slot,
          cooldownS: event.cooldownS,
          readyAt: event.readyAt,
        });
    } else if (event.type === 'consumable_denied' && event.id === id) {
        bus.emit('ui:consumableDenied', {
          slot: event.slot,
          reason: event.reason,
          remainingS: event.remainingS,
        });
    } else if (event.type === 'magazine_reload' && event.id === id) {
        bus.emit('ui:magazineReloadStarted', {});
    } else if (event.type === 'magazine_reload_denied' && event.id === id) {
        bus.emit('ui:magazineReloadDenied', { reason: event.reason });
    } else if (event.type === 'special_action' && event.id === id) {
        bus.emit('ui:specialActionResult', {
          kind: event.kind,
          active: !!event.active,
          reason: event.reason || null,
        });
    } else if (event.type === 'special_action_denied' && event.id === id) {
        bus.emit('ui:specialActionDenied', {
          kind: event.kind,
          reason: event.reason,
        });
    } else if (event.type === 'module_state') {
        bus.emit('module:state', {
          id: event.id,
          module: event.module,
          state: event.state,
          source: event.source,
        });
    } else if (event.type === 'tank_fire') {
        bus.emit('tank:fire', { id: event.id, burning: event.burning });
    } else if (event.type === 'tank_ram') {
        bus.emit('tank:ram', {
          aId: event.aId,
          bId: event.bId,
          dmgA: event.damageA,
          dmgB: event.damageB,
          closingMps: event.closingMps,
          aIsPlayer: event.aId === id,
          bIsPlayer: event.bId === id,
          pos: [event.x, event.y, event.z],
        });
    } else if (event.type === 'match_ended') {
        const result = spectator ? 'draw' : event.result === 'draw' ? 'draw'
          : event.result === viewerTeam ? 'victory' : 'defeat';
        game.result = result;
        game.resultReason = event.reason || 'elimination';
        bus.emit('battle:ended', {
          result,
          reason: game.resultReason,
          timeS: game.timeS,
          map: game.mapId,
          roster: resultRoster(),
        });
    } else if (event.type?.startsWith('mode_')) {
        bus.emit(event.type.replace(/^mode_/, 'mode:'), event);
    }
  }

  const presentationEvents = new PresentationEventQueue({
    emit: (event) => emitEvent(event as BridgeEvent),
  });

  function resultRoster(): Array<Record<string, unknown>> {
    return [...entities.values()].map((entity) => ({
      id: entity.id,
      name: entity.displayName || entity.spec?.name || entity.specId,
      vehicle: entity.displayName || entity.spec?.name || entity.specId,
      specId: entity.specId,
      team: entity.team === 'enemy' ? 'enemy' : 'ally',
      alive: !entity.combat?.destroyed,
      isPlayer: !!entity.isPlayer,
    }));
  }

  function reconcileDestructibles(meta: Record<string, unknown> | null): void {
    const revision = Number(meta?.destructibleRevision);
    if (!Number.isSafeInteger(revision) || revision < 0 ||
        revision <= appliedDestructibleRevision) return;
    const destroyed = meta?.destroyedObstacleIndices;
    if (!Array.isArray(destroyed) || !worldCollision ||
        typeof worldCollision.getObstacles !== 'function') {
      appliedDestructibleRevision = revision;
      return;
    }
    const obstacles = worldCollision.getObstacles();
    for (const rawIndex of destroyed) {
      const index = Number(rawIndex);
      if (!Number.isSafeInteger(index) || index < 0 || index >= obstacles.length) continue;
      const obstacle = obstacles[index];
      if (!obstacle || obstacle.crushed) continue;
      if (typeof worldCollision.crushObstacle === 'function') {
        worldCollision.crushObstacle(obstacle, 0, 1, 0);
      }
      obstacle.crushed = true;
    }
    appliedDestructibleRevision = revision;
  }

  function mount(): void {
    if (mounted) return;
    mounted = true;
    legacyState = {
      tanks: game.tanks,
      tankById: game.tankById,
      player: game.player,
      shells: game.shells,
      spotting: game.spotting,
    };
    for (const entity of game.allTanks || []) {
      if (entity.visual) entity.visual.setVisible(false);
    }
    visibleRoster.length = 0;
    for (const entity of entities.values()) visibleRoster.push(entity);
    game.tanks = visibleRoster;
    game.tankById = entities;
    game.player = spectator ? null : entities.get(id) || null;
    game.shells = [];
    game.spotting = {
      isSpotted: (targetId) => !!entities.get(targetId)?.networkVisible,
      getConcealment: () => ({
        camo: 0, base: 0, paint: 0, equip: 0, bush: 0, bloom: 0,
        moving: false, fired: false, inBush: false, spotted: false,
      }),
    };
  }

  function apply(
    snapshot: SampledSnapshotFrame,
    dt = 1 / 60,
    reliableEvents: PresentationEvent[] = [],
  ): boolean {
    if (!snapshot) return false;
    if (typeof snapshot.meta?.phase === 'string') snapshotPhase = snapshot.meta.phase;
    // Index destruction causes before state reconciliation so an ammo-rack
    // turret pop is staged once, with the correct variant, instead of first
    // creating a generic wreck and rebuilding it when the event arrives.
    for (const event of reliableEvents) {
      if (event.type === 'tank_destroyed' && typeof event.id === 'string' &&
          typeof event.cause === 'string') {
        destructionCause.set(event.id, event.cause);
      }
    }
    for (const entity of entities.values()) entity.networkVisible = false;
    // Establish the viewer's team before classifying any other entity.
    const own = spectator ? null : snapshot.entities.find((entry) => entry.id === id);
    if (own) viewerTeam = own.team;
    for (const entry of snapshot.entities) updateEntity(
      ensureEntity(entry),
      entry,
      dt,
      entry.id === id ? snapshot.immediateAuthority : null,
    );
    for (const entity of entities.values()) {
      const referenceTeam = spectator ? perspectiveTeam : viewerTeam;
      entity.team = entity.networkTeam === referenceTeam ? 'player' : 'enemy';
      if (!entity.networkVisible) entity.visual.setVisible(false);
    }
    if (!mounted) mount();
    visibleRoster.length = 0;
    for (const entity of entities.values()) {
      if (entity.networkVisible || entity.combat.destroyed) visibleRoster.push(entity);
    }
    game.tanks = visibleRoster;
    game.tankById = entities;
    game.player = spectator ? null : entities.get(id) || null;
    game.timeS = Number.isFinite(snapshot.meta?.battleTimeMs)
      ? Number(snapshot.meta?.battleTimeMs) / 1000
      : snapshot.serverTimeMs / 1000;
    game.preBattleS = Number.isFinite(snapshot.meta?.countdownMs)
      ? Number(snapshot.meta?.countdownMs) / 1000
      : 0;
    game.gameMode = snapshot.meta?.gameMode || 'standard';
    game.matchModeState = snapshot.meta?.modeState || null;
    updateShells(snapshot.shells);
    presentationEvents.enqueue(reliableEvents);
    presentationEvents.flush();
    reconcileDestructibles(snapshot.meta);

    // The verdict is persistent snapshot state. Reliable events preserve the
    // cinematic chronology, but reconnects/keyframes must still converge if
    // the original match_ended event predates this client.
    if (!game.result && snapshot.meta?.result &&
        !presentationEvents.hasType('match_ended')) {
      const authorityResult = snapshot.meta.result;
      game.result = spectator ? 'draw' : authorityResult === 'draw' ? 'draw'
        : authorityResult === viewerTeam ? 'victory' : 'defeat';
      game.resultReason = typeof snapshot.meta.resultReason === 'string'
        ? snapshot.meta.resultReason : 'elimination';
      bus.emit('battle:ended', {
        result: game.result,
        reason: game.resultReason,
        timeS: game.timeS,
        map: game.mapId,
        roster: resultRoster(),
      });
    }
    return true;
  }

  function endDisconnected(): boolean {
    if (game.result) return false;
    game.result = 'draw';
    game.resultReason = 'network_disconnect';
    bus.emit('battle:ended', {
      result: game.result,
      reason: game.resultReason,
      timeS: game.timeS,
      map: game.mapId,
      roster: resultRoster(),
    });
    return true;
  }

  function setPerspective(entityId: unknown): boolean {
    if (!spectator) return false;
    const target = entities.get(String(entityId || ''));
    if (!target) return false;
    perspectiveTeam = target.networkTeam;
    for (const entity of entities.values()) {
      entity.team = entity.networkTeam === perspectiveTeam ? 'player' : 'enemy';
    }
    return true;
  }

  function recordInput(input: PredictionInput | null, dt: number, inputSeq: number): boolean {
    if (spectator || snapshotPhase !== 'playing') return false;
    const own = entities.get(id);
    return own?.predictor?.recordInput(input, dt, inputSeq) || false;
  }

  function getPredictionStats(): LocalPredictionStats | null {
    return entities.get(id)?.predictor?.getStats() || null;
  }

  function unmount(): void {
    if (!mounted || !legacyState) return;
    game.tanks = legacyState.tanks;
    game.tankById = legacyState.tankById;
    game.player = legacyState.player;
    game.shells = legacyState.shells;
    game.spotting = legacyState.spotting;
    for (const entity of game.allTanks || []) {
      if (entity.visual) entity.visual.setVisible(true);
    }
    mounted = false;
    legacyState = null;
  }

  function dispose(): void {
    unmount();
    for (const entity of entities.values()) entity.visual.dispose();
    entities.clear();
    roster.length = 0;
    visibleRoster.length = 0;
    liveShells.length = 0;
    shellById.clear();
    destructionCause.clear();
    presentationEvents.clear();
  }

  return {
    entities,
    roster,
    prepareRoster,
    mount,
    apply,
    endDisconnected,
    recordInput,
    getPredictionStats,
    getPresentationEventStats: () => ({
      ...presentationEvents.getStats(),
      visualDestroyCount,
      visualDestroyTotalMs: Math.round(visualDestroyTotalMs * 10) / 10,
      visualDestroyMaxMs: Math.round(visualDestroyMaxMs * 10) / 10,
    }),
    setPerspective,
    unmount,
    dispose,
  };
}
