import type { RuntimeValue } from '../runtimeTypes.ts';
import { Vector3, type Object3D } from 'three';
import { createCombatState, type CombatState } from '../sim/damage.ts';
import { createTankState, shotRecoilScale } from '../sim/movement.ts';
import type {
  MovementContactGeometry,
  MovementHeightField,
} from '../sim/movement.ts';
import { getSpec } from '../vehicles/specs.ts';
import type { FleetTankSpec } from '../vehicles/specContracts.ts';
import { createTank, ensureTankBuilder } from '../vehicles/fleetFactory.ts';
import { prebakeSharedTextures } from '../vehicles/materials.ts';
import { tankContactRect } from '../sim/tankContactShape.ts';
import { pushHullFromHull, pushHullFromObstacle } from '../world/collision.ts';
import { pushHullInsidePlayableBounds } from '../world/battlefieldBounds.ts';
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
import type { SpecialActionState } from '../sim/specialActionPolicy.ts';

type Team = string | null;

type TankSpec = FleetTankSpec;

type BridgeTankState = PredictionTankState;
type BridgeCombatState = CombatState;
type BridgeSpecialActionState = SpecialActionState;

interface TankVisual {
  root: Object3D;
  contactGeom?: MovementContactGeometry | null;
  setVisible(visible: boolean): void;
  syncFromState(state: BridgeTankState, dt: number): void;
  dispose(): void;
  recoilKick?(dt: number, scale: number): number | null;
  gunMuzzleWorld?(target: Vector3, muzzleIndex: number): Vector3;
  stripEra?(plateName: string): void;
  resetEra?(): void;
  setDestroyed?(options: { pop: boolean }): void;
  resetDestroyed?(): void;
  setGroundSampler?(sampler: (x: number, z: number) => RuntimeValue): void;
}

interface BridgeInput {
  throttle: number;
  steer: number;
  brake: boolean;
  fire: boolean;
  aimLocked: boolean;
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
  _networkShellSlot?: number;
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

interface PredictionContactFrame {
  centerX: number;
  centerZ: number;
  halfLength: number;
  halfWidth: number;
  forwardX: number;
  forwardZ: number;
  rightX: number;
  rightZ: number;
  broadRadius: number;
}

interface HeightField extends MovementHeightField {}

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
  scene: { add(object: RuntimeValue): void };
  anisotropy?: number;
}

interface SpottingFacade {
  isSpotted(targetId: string): boolean;
  getConcealment(): Record<string, number | boolean>;
}

interface BrowserGameState<TLegacyEntity, TLegacyShell, TLegacySpotting> {
  tanks: TLegacyEntity[] | BridgeEntity[];
  tankById: Map<string, TLegacyEntity> | Map<string, BridgeEntity>;
  player: TLegacyEntity | BridgeEntity | null;
  shells: TLegacyShell[] | BridgeShell[];
  spotting: TLegacySpotting | SpottingFacade | null;
  allTanks?: Array<{ visual?: { setVisible?(visible: boolean): void } | null }>;
  timeS: number;
  preBattleS: number;
  result?: string | null;
  resultReason?: string | null;
  mapId?: string;
  gameMode?: RuntimeValue;
  matchModeState?: RuntimeValue;
}

interface EventBus {
  emit(type: string, payload: Record<string, RuntimeValue>): void;
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

type LegacyGameState<TLegacyEntity, TLegacyShell, TLegacySpotting> = Pick<
  BrowserGameState<TLegacyEntity, TLegacyShell, TLegacySpotting>,
  'tanks' | 'tankById' | 'player' | 'shells' | 'spotting'
>;

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
  slot?: RuntimeValue;
  cooldownS?: RuntimeValue;
  readyAt?: RuntimeValue;
  remainingS?: RuntimeValue;
  active?: boolean;
  module?: RuntimeValue;
  state?: RuntimeValue;
  source?: RuntimeValue;
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
  options: {
    camoSeed: number;
    camoPattern: string;
    quality: 'high' | 'ai' | 'low' | 'preview';
  },
) => TankVisual;

type PrepareVisualTextures = (
  spec: TankSpec,
  anisotropy: number,
  quality: string,
  tick: () => Promise<void>,
  camo: string,
) => Promise<RuntimeValue>;

export interface BrowserBattleBridgeOptions<
  TLegacyEntity = RuntimeValue,
  TLegacyShell = RuntimeValue,
  TLegacySpotting = RuntimeValue,
> {
  engineCtx: EngineContext;
  game: BrowserGameState<TLegacyEntity, TLegacyShell, TLegacySpotting>;
  bus: EventBus;
  viewerId: RuntimeValue;
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
  getPresentationEventStats(): Record<string, RuntimeValue>;
  setPerspective(entityId: RuntimeValue): boolean;
  unmount(): void;
  dispose(): void;
}

const readSpec = getSpec;
const makeTankState = createTankState;
const makeCombatState = createCombatState;
const makeSpecialActionState = createSpecialActionState;
const defaultCreateTankVisual: CreateTankVisual = createTank;
const defaultPrepareVisualTextures: PrepareVisualTextures = prebakeSharedTextures;
const recoilScale = shotRecoilScale;

const POS_SCALE = 100;
const VEL_SCALE = 100;
const _muzzleTip = new Vector3(); // §5.362 twin-plant flash-origin scratch
const _predictionContactCenter = new Vector3();

function hashString(value: RuntimeValue): number {
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
export function createBrowserBattleBridge<
  TLegacyEntity,
  TLegacyShell,
  TLegacySpotting,
>({
  engineCtx,
  game,
  bus,
  viewerId,
  spectator = false,
  worldCollision = null,
  createTankVisual = defaultCreateTankVisual,
  prepareVisualTextures = defaultPrepareVisualTextures,
  clearVehicleDecals = null,
}: BrowserBattleBridgeOptions<
  TLegacyEntity,
  TLegacyShell,
  TLegacySpotting
>): BrowserBattleBridge {
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
  let legacyState: LegacyGameState<
    TLegacyEntity,
    TLegacyShell,
    TLegacySpotting
  > | null = null;
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
    const frame = predictionContactFrame(entity, pos);
    _predictionContactCenter.set(frame.centerX, pos.y, frame.centerZ);
    pushHullInsidePlayableBounds(
      frame.centerX,
      frame.centerZ,
      frame.forwardX,
      frame.forwardZ,
      frame.rightX,
      frame.rightZ,
      frame.halfLength,
      frame.halfWidth,
      outPush,
    );
    if (!worldCollision) return outPush.x !== 0 || outPush.z !== 0;
    collidePredictionObstacles(entity, pos.y, frame, outPush);
    collidePredictionEntities(entity, frame, outPush);
    return outPush.x !== 0 || outPush.z !== 0;
  }

  function predictionContactFrame(
    entity: PredictionSimEntity,
    pos: Vector3,
  ): PredictionContactFrame {
    const contactRect = tankContactRect(entity.spec);
    const forwardX = Math.sin(entity.state.yaw);
    const forwardZ = Math.cos(entity.state.yaw);
    const rightX = forwardZ;
    const rightZ = -forwardX;
    const centerX = pos.x + rightX * contactRect.centerX + forwardX * contactRect.centerZ;
    const centerZ = pos.z + rightZ * contactRect.centerX + forwardZ * contactRect.centerZ;
    return {
      centerX,
      centerZ,
      halfLength: contactRect.halfLength,
      halfWidth: contactRect.halfWidth,
      forwardX,
      forwardZ,
      rightX,
      rightZ,
      broadRadius: Math.hypot(contactRect.halfLength, contactRect.halfWidth) + 0.01,
    };
  }

  function predictionObstacles(frame: PredictionContactFrame): CollisionObstacle[] {
    if (!worldCollision) return [];
    const candidates = typeof worldCollision.queryObstacles === 'function'
      ? worldCollision.queryObstacles(
        frame.centerX - frame.broadRadius,
        frame.centerZ - frame.broadRadius,
        frame.centerX + frame.broadRadius,
        frame.centerZ + frame.broadRadius,
        nearbyPredictionObstacles,
      )
      : (typeof worldCollision.getObstacles === 'function' ? worldCollision.getObstacles() : []);
    return candidates;
  }

  function collidePredictionObstacles(
    entity: PredictionSimEntity,
    height: number,
    frame: PredictionContactFrame,
    outPush: Vector3,
  ): void {
    for (const obstacle of predictionObstacles(frame)) {
      if (obstacle.crushed || height > obstacle.max[1] + 0.5) continue;
      // Fast overruns are resolved by authority. Let prediction continue
      // through crushable dressing instead of visibly stopping at a fence
      // that the next snapshot is about to destroy.
      if (obstacle.crushable &&
          Math.abs(entity.state.speed) > (obstacle.crushMin ?? 2.8)) continue;
      const closestX = Math.max(obstacle.min[0], Math.min(frame.centerX, obstacle.max[0]));
      const closestZ = Math.max(obstacle.min[2], Math.min(frame.centerZ, obstacle.max[2]));
      const dx = frame.centerX - closestX;
      const dz = frame.centerZ - closestZ;
      if (dx * dx + dz * dz >= frame.broadRadius * frame.broadRadius) continue;
      if (pushHullFromObstacle(
        _predictionContactCenter,
        frame.forwardX,
        frame.forwardZ,
        frame.rightX,
        frame.rightZ,
        frame.halfLength,
        frame.halfWidth,
        obstacle,
        outPush,
      )) {
        entity._predictionStaticContacts = (entity._predictionStaticContacts || 0) + 1;
      }
    }
  }

  function collidePredictionEntities(
    entity: PredictionSimEntity,
    frame: PredictionContactFrame,
    outPush: Vector3,
  ): void {
    // Mirror authority's exact-shell OBB narrow phase against currently
    // disclosed snapshot poses; never consult hidden entities. Parity here is
    // what prevents a teammate contact from becoming a correction loop.
    for (const other of entities.values()) {
      if (other.id === id || !other.state ||
          (!other.networkVisible && !other.combat?.destroyed)) continue;
      const otherFrame = predictionContactFrame(other, other.state.pos);
      const dx = frame.centerX - otherFrame.centerX;
      const dz = frame.centerZ - otherFrame.centerZ;
      const outer = frame.broadRadius + otherFrame.broadRadius - 0.02;
      if (dx * dx + dz * dz > outer * outer) continue;
      if (!pushHullFromHull(
        frame.centerX,
        frame.centerZ,
        frame.forwardX,
        frame.forwardZ,
        frame.rightX,
        frame.rightZ,
        frame.halfLength,
        frame.halfWidth,
        otherFrame.centerX,
        otherFrame.centerZ,
        otherFrame.forwardX,
        otherFrame.forwardZ,
        otherFrame.rightX,
        otherFrame.rightZ,
        otherFrame.halfLength,
        otherFrame.halfWidth,
        outPush,
      )) continue;
      entity._predictionDynamicContacts = (entity._predictionDynamicContacts || 0) + 1;
    }
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
        aimLocked: false,
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
    const destroyed = updateEntityCombat(entity, snapshot);
    updateEntityEra(entity, snapshot);
    updateEntityDestruction(entity, destroyed);
    updateEntityPose(entity, snapshot, dt, immediateAuthority);
    entity._lastX = entity.state.pos.x;
    entity._lastZ = entity.state.pos.z;
    revealEntity(entity);
  }

  function updateEntityCombat(
    entity: BridgeEntity,
    snapshot: DecodedEntitySnapshot,
  ): boolean {
    const { combat } = entity;
    combat.hp = snapshot.hp;
    combat.maxHp = snapshot.maxHp;
    if (snapshot.magazineCapacity > 0) {
      if (!combat.magazine) combat.magazine = { rounds: 0, capacity: 0 };
      combat.magazine.rounds = snapshot.magazineRounds;
      combat.magazine.capacity = snapshot.magazineCapacity;
    } else {
      combat.magazine = null;
    }
    const gunReload = combat.gunReload || combat.reload;
    const gunReloadS = Number.isFinite(snapshot.gunReloadS)
      ? snapshot.gunReloadS : snapshot.reloadS;
    const gunReloadTotalS = Number.isFinite(snapshot.gunReloadTotalS)
      ? snapshot.gunReloadTotalS : snapshot.reloadTotalS;
    gunReload.t = gunReloadS;
    gunReload.totalS = Math.max(gunReloadTotalS || 0, gunReloadS);
    gunReload.kind = snapshot.gunReloadKind || snapshot.reloadKind || 'ready';
    const priorAuthorityShellSlot = entity._networkShellSlot;
    const requestedShellSlot = entity.input.shellSlot;
    const hasPendingLocalShellSelection = entity.isPlayer &&
      priorAuthorityShellSlot != null &&
      requestedShellSlot !== priorAuthorityShellSlot;
    combat.shellSlot = snapshot.shellSlot;
    if (combat.reloadChannels?.[snapshot.shellSlot]) {
      combat.reload = combat.reloadChannels[snapshot.shellSlot];
    }
    combat.reload.t = snapshot.reloadS;
    combat.reload.totalS = Math.max(snapshot.reloadTotalS || 0, snapshot.reloadS);
    combat.reload.kind = snapshot.reloadKind || 'ready';
    combat.ammo[0] = snapshot.ammo0;
    combat.ammo[1] = snapshot.ammo1;
    combat.ammo[2] = snapshot.ammo2;
    combat.fire.burning = !!(snapshot.flags & SNAPSHOT_FLAGS.BURNING);
    const destroyed = !!(snapshot.flags & SNAPSHOT_FLAGS.DESTROYED);
    combat.destroyed = destroyed;
    entity.input.fire = !!(snapshot.flags & SNAPSHOT_FLAGS.FIRING);
    // The local input slot is player intent, not presentation state. Preserve
    // a selection that diverged from the last authoritative snapshot until a
    // newer input frame reaches the host. Otherwise one delayed snapshot can
    // erase the edge before upload and strand firing on a depleted channel.
    // Initial snapshots and server-side resets still seed the input whenever
    // there is no outstanding local request.
    if (!hasPendingLocalShellSelection) entity.input.shellSlot = snapshot.shellSlot;
    entity._networkShellSlot = snapshot.shellSlot;
    entity.specialAction.active = !!(snapshot.flags & SNAPSHOT_FLAGS.SPECIAL_ACTIVE);
    entity.state.suspensionAim = entity.specialAction.kind === 'hydropneumatic_aim' &&
      entity.specialAction.active;
    return destroyed;
  }

  function updateEntityEra(
    entity: BridgeEntity,
    snapshot: DecodedEntitySnapshot,
  ): void {
    const spentEra = Array.isArray(snapshot.eraSpent) ? snapshot.eraSpent : [];
    const shownEra = entity._networkEraSpent || (entity._networkEraSpent = new Set());
    if ([...shownEra].some((plateName) => !spentEra.includes(plateName))) {
      entity.visual.resetEra?.();
      shownEra.clear();
    }
    for (const plateName of spentEra) {
      if (shownEra.has(plateName)) continue;
      entity.visual.stripEra?.(plateName);
      shownEra.add(plateName);
    }
  }

  function updateEntityDestruction(entity: BridgeEntity, destroyed: boolean): void {
    if (destroyed) visualDestroy(entity);
    else if (entity._networkDestroyed) resetVisualDestruction(entity);
  }

  function resetVisualDestruction(entity: BridgeEntity): void {
    entity.visual.resetDestroyed?.();
    entity._networkDestroyed = false;
    entity._networkDestroyPop = false;
  }

  function updateEntityPose(
    entity: BridgeEntity,
    snapshot: DecodedEntitySnapshot,
    dt: number,
    immediateAuthority: ImmediateAuthoritySnapshot | null,
  ): void {
    if (entity.predictor && immediateAuthority) {
      entity.predictor.reconcile({
        ...immediateAuthority,
        sampledEntity: snapshot,
      }, dt, entity.combat.destroyed);
      return;
    }
    applySnapshotPose(entity, snapshot);
  }

  function applySnapshotPose(
    entity: BridgeEntity,
    snapshot: DecodedEntitySnapshot,
  ): void {
    const { state } = entity;
    const dx = snapshot.x - entity._lastX;
    const dz = snapshot.z - entity._lastZ;
    const forwardDistance = dx * Math.sin(snapshot.yaw) + dz * Math.cos(snapshot.yaw);
    state.trackScroll.l += forwardDistance;
    state.trackScroll.r += forwardDistance;
    state.pos.set(snapshot.x, snapshot.y, snapshot.z);
    state.verticalSpeed = snapshot.vy || 0;
    state.grounded = !(snapshot.flags & SNAPSHOT_FLAGS.AIRBORNE);
    state.overturned = !!(snapshot.flags & SNAPSHOT_FLAGS.OVERTURNED);
    state._body.tumbling = state.overturned || !!(snapshot.flags & SNAPSHOT_FLAGS.AUTO_RIGHTING);
    state._body.autoRighting = !!(snapshot.flags & SNAPSHOT_FLAGS.AUTO_RIGHTING);
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

  function revealEntity(entity: BridgeEntity): void {
    // Prepared network visuals live at a hidden staging origin. Seed the
    // renderer from authority exactly once before revealing them; the normal
    // main-loop sync remains the sole per-frame owner after this point.
    if (!entity._networkPoseReady) {
      entity.visual.syncFromState(entity.state, 0);
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

  function emitShellFired(event: BridgeEvent): void {
    const shooter = entities.get(String(event.shooterId || ''));
    let muzzlePos = [event.x, event.y, event.z];
    let shellSpec = null;
    let muzzleIndex: number | null = -1;
    if (shooter?.visual.recoilKick) {
      const shells = shooter.spec?.gun?.shells || [];
      shellSpec = shells.find((shell) => shell.name === event.shellName)
        || shells.find((shell) => shell.type === event.shellType) || null;
      muzzleIndex = shooter.visual.recoilKick(0, recoilScale(shooter.spec, shellSpec));
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
  }

  function emitShellImpact(event: BridgeEvent): void {
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
  }

  function emitTankDestroyed(event: BridgeEvent): void {
    const entity = entities.get(String(event.id || ''));
    bus.emit('tank:destroyed', {
      id: event.id,
      specId: entity?.specId,
      killerId: event.killerId,
      cause: event.cause === 'ammo_rack' ? 'ammorack' : event.cause,
      pos: entity ? [entity.state.pos.x, entity.state.pos.y, entity.state.pos.z] : null,
    });
  }

  function emitWorldPropDestroyed(event: BridgeEvent): void {
    const obstacleIndex = Number(event.obstacleIndex);
    const obstacle = worldCollision?.getObstacles &&
        Number.isSafeInteger(obstacleIndex) && obstacleIndex >= 0
      ? worldCollision.getObstacles()[obstacleIndex]
      : null;
    if (obstacle && !obstacle.crushed && worldCollision?.crushObstacle) {
      worldCollision.crushObstacle(
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
  }

  function emitLocalPlayerEvent(event: BridgeEvent): void {
    if (event.id !== id) return;
    if (event.type === 'consumable_used') {
      bus.emit('ui:consumableUsed', {
        slot: event.slot,
        cooldownS: event.cooldownS,
        readyAt: event.readyAt,
      });
    } else if (event.type === 'consumable_denied') {
      bus.emit('ui:consumableDenied', {
        slot: event.slot,
        reason: event.reason,
        remainingS: event.remainingS,
      });
    } else if (event.type === 'magazine_reload') {
      bus.emit('ui:magazineReloadStarted', {});
    } else if (event.type === 'magazine_reload_denied') {
      bus.emit('ui:magazineReloadDenied', { reason: event.reason });
    } else if (event.type === 'special_action') {
      bus.emit('ui:specialActionResult', {
        kind: event.kind,
        active: !!event.active,
        reason: event.reason || null,
      });
    } else if (event.type === 'special_action_denied') {
      bus.emit('ui:specialActionDenied', {
        kind: event.kind,
        reason: event.reason,
        slot: event.slot,
      });
    } else if (event.type === 'ammo_empty') {
      bus.emit('ammo:empty', event);
    } else if (event.type === 'ammo_selection_denied') {
      bus.emit('ui:ammoSelectionDenied', event);
    } else if (event.type === 'ammo_depleted') {
      bus.emit('ammo:depleted', event);
    } else if (event.type === 'tank_self_right') {
      bus.emit('tank:selfRight', event);
    }
  }

  function emitMatchEnded(event: BridgeEvent): void {
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
  }

  const localPlayerEventTypes = new Set([
    'consumable_used',
    'consumable_denied',
    'magazine_reload',
    'magazine_reload_denied',
    'special_action',
    'special_action_denied',
    'ammo_empty',
    'ammo_selection_denied',
    'ammo_depleted',
    'tank_self_right',
  ]);

  function emitEvent(event: BridgeEvent): void {
    if (typeof event.type !== 'string') return;
    if (event.type === 'shell_fired') emitShellFired(event);
    else if (event.type === 'shell_hit') {
      bus.emit('shell:hit', { ...event, attackerId: event.attackerId || event.shooterId });
    } else if (event.type === 'shell_impact') emitShellImpact(event);
    else if (event.type === 'tank_destroyed') emitTankDestroyed(event);
    else if (event.type === 'world_prop_destroyed') emitWorldPropDestroyed(event);
    else if (localPlayerEventTypes.has(event.type)) emitLocalPlayerEvent(event);
    else if (event.type === 'module_state') {
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
    } else if (event.type === 'match_ended') emitMatchEnded(event);
    else if (event.type.startsWith('mode_')) {
      bus.emit(event.type.replace(/^mode_/, 'mode:'), event);
    }
  }

  const presentationEvents = new PresentationEventQueue({
    emit: (event) => emitEvent(event as BridgeEvent),
  });

  function resultRoster(): Array<Record<string, RuntimeValue>> {
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

  function reconcileDestructibles(meta: Record<string, RuntimeValue> | null): void {
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
      entity.visual?.setVisible?.(false);
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
    indexDestructionCauses(reliableEvents);
    reconcileSnapshotEntities(snapshot, dt);
    publishSnapshotState(snapshot);
    updateShells(snapshot.shells);
    presentationEvents.enqueue(reliableEvents);
    presentationEvents.flush();
    reconcileDestructibles(snapshot.meta);
    reconcilePersistentResult(snapshot);
    return true;
  }

  function indexDestructionCauses(events: PresentationEvent[]): void {
    // Index causes before entity reconciliation so ammo-rack turret pop is
    // staged once instead of rebuilding a generic wreck after the event.
    for (const event of events) {
      if (event.type === 'tank_destroyed' && typeof event.id === 'string' &&
          typeof event.cause === 'string') destructionCause.set(event.id, event.cause);
    }
  }

  function reconcileSnapshotEntities(snapshot: SampledSnapshotFrame, dt: number): void {
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
    classifyAndHideEntities();
    if (!mounted) mount();
    publishVisibleRoster();
  }

  function classifyAndHideEntities(): void {
    for (const entity of entities.values()) {
      const referenceTeam = spectator ? perspectiveTeam : viewerTeam;
      entity.team = entity.networkTeam === referenceTeam ? 'player' : 'enemy';
      if (!entity.networkVisible) entity.visual.setVisible(false);
    }
  }

  function publishVisibleRoster(): void {
    visibleRoster.length = 0;
    for (const entity of entities.values()) {
      if (entity.networkVisible || entity.combat.destroyed) visibleRoster.push(entity);
    }
    game.tanks = visibleRoster;
    game.tankById = entities;
    game.player = spectator ? null : entities.get(id) || null;
  }

  function publishSnapshotState(snapshot: SampledSnapshotFrame): void {
    game.timeS = Number.isFinite(snapshot.meta?.battleTimeMs)
      ? Number(snapshot.meta?.battleTimeMs) / 1000
      : snapshot.serverTimeMs / 1000;
    game.preBattleS = Number.isFinite(snapshot.meta?.countdownMs)
      ? Number(snapshot.meta?.countdownMs) / 1000
      : 0;
    game.gameMode = snapshot.meta?.gameMode || 'standard';
    game.matchModeState = snapshot.meta?.modeState || null;
  }

  function reconcilePersistentResult(snapshot: SampledSnapshotFrame): void {
    // The verdict is persistent snapshot state. Reliable events preserve the
    // cinematic chronology, but reconnects/keyframes must still converge if
    // the original match_ended event predates this client.
    if (game.result || !snapshot.meta?.result ||
        presentationEvents.hasType('match_ended')) return;
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

  function setPerspective(entityId: RuntimeValue): boolean {
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
      entity.visual?.setVisible?.(true);
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
