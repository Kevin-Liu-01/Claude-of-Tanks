/**
 * The battle presentation: MatchClient frames and events into the existing
 * renderer, HUD, FX and audio through the surfaces the game already owns —
 * the battle game state (`tanks`, `tankById`, `player`, `shells`,
 * `spotting`, clocks, result), the shared event bus, the first-party tank
 * visuals and the world collision. It is deliberately thin: no game rule
 * lives here and no authoritative state is reconstructed. Remote actors show
 * the interpolated samples; the viewer's actor shows the client's predicted,
 * corrected `TankState`; combat values are the authority's rows; one-shot
 * effects are the authority's events mapped to the bus vocabulary the
 * consumers (killcam, HUD, shot info, profile, FX, audio) already speak.
 */
import { Vector3 } from 'three';
import type { Object3D } from 'three';
import { createOpaqueLoadingYielder } from '../../engine/frameScheduler.ts';
import type { FrameSchedulerOptions } from '../../engine/frameScheduler.ts';
import { createCombatState, mainWeaponModuleState } from '../../sim/damage.ts';
import type { CombatState } from '../../sim/damage.ts';
import { isUnguidedRocket, usesLauncherMuzzles } from '../../sim/launcherPolicy.ts';
import { createTankState, shotRecoilScale } from '../../sim/movement.ts';
import type { TankState } from '../../sim/movement.ts';
import { SPECIAL_ACTION_KINDS, createSpecialActionState } from '../../sim/specialActionPolicy.ts';
import type { SpecialActionState } from '../../sim/specialActionPolicy.ts';
import { createTank, ensureTankBuilder } from '../../vehicles/fleetFactory.ts';
import { prebakeSharedTextures } from '../../vehicles/materials.ts';
import type { FleetTankSpec } from '../../vehicles/specContracts.ts';
import { getSpec } from '../../vehicles/specs.ts';
import {
  ENTITY_FLAGS, MODULE_STATE_NAMES, NO_ENTITY, PHASE, TEAM, VERDICT, VIEWER_CREW, VIEWER_EQUIPMENT, VIEWER_MODULES,
  dequantizeMultiplier, eraPlateNames,
} from '../wire/index.ts';
import type { RosterEntry, TeamId, VerdictId, WireEvent } from '../wire/index.ts';
import { createEntitySample, decodeRow } from '../match/interpolation.ts';
import type { EntitySample, ShellSample } from '../match/interpolation.ts';
import type { MatchFrame } from '../match/matchClient.ts';
import type { PredictionWorld } from '../match/prediction.ts';
import type { EventContext, PresentationAdapter, RosterContext } from './adapter.ts';
import { createPredictionWorld } from './predictionWorld.ts';
import type { WorldCollisionLike } from './predictionWorld.ts';

type RuntimeValue = {} | null | undefined;

/** The first-party tank visual surface this presentation drives. */
export interface TankVisual {
  root: Object3D;
  setVisible(visible: boolean): void;
  syncFromState(state: TankState, dt: number): void;
  dispose(): void;
  recoilKick?(dt: number, scale: number, muzzleIndex?: number, guided?: boolean): number | null;
  gunMuzzleWorld?(target: Vector3, muzzleIndex: number, guided?: boolean): Vector3;
  gunDirWorld?(target: Vector3): Vector3;
  stripEra?(plateName: string): void;
  resetEra?(): void;
  setDestroyed?(options: { pop: boolean }): void;
  resetDestroyed?(): void;
  setGroundSampler?(sampler: (x: number, z: number) => RuntimeValue): void;
}

export interface MatchActorInput {
  throttle: number;
  steer: number;
  brake: boolean;
  fire: boolean;
  aimLocked: boolean;
  shellSlot: number;
  aimPoint: Vector3;
}

/** One roster entity as the game-side modules see it (the shape of a solo TankEntity). */
export interface MatchActor {
  id: string;
  entityId: number;
  specId: string;
  spec: FleetTankSpec;
  camo: string;
  displayName: string | null;
  networkTeam: TeamId;
  team: 'player' | 'enemy';
  isPlayer: boolean;
  bot: boolean;
  state: TankState;
  combat: CombatState;
  specialAction: SpecialActionState;
  input: MatchActorInput;
  visual: TankVisual;
  contactGeom: null;
  rigidGear: false;
  networkVisible: boolean;
  modeSpeedMultiplier: number;
  modeGravityScale: number;
  eraNames: string[];
  _networkPoseReady: boolean;
  _networkDestroyed: boolean;
  _networkDestroyPop: boolean;
  _networkEraSpent: Set<string>;
  _lastX: number;
  _lastZ: number;
}

export interface MatchShell {
  rocket: boolean;
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

export interface PresentationGameState {
  tanks: RuntimeValue[];
  tankById: Map<string, RuntimeValue>;
  player: RuntimeValue;
  shells: RuntimeValue[];
  spotting: RuntimeValue;
  allTanks?: Array<{ visual?: { setVisible?(visible: boolean): void } | null }>;
  timeS: number;
  preBattleS: number;
  result?: string | null;
  /** battle endings (2026-09-25): the killcam facade main composes (typed loosely); every observable lethal shell_hit feeds it. */
  killcam?: RuntimeValue;
  resultReason?: string | null;
  mapId?: string;
  gameMode?: RuntimeValue;
  matchModeState?: RuntimeValue;
}

export interface EventBus {
  emit(type: string, payload: Record<string, RuntimeValue>): void;
}

export interface EngineContext {
  scene: { add(object: RuntimeValue): void };
  anisotropy?: number;
}

type CreateTankVisual = (
  specId: string,
  engineCtx: EngineContext,
  options: { camoSeed: number; camoPattern: string; quality: 'high' | 'ai' | 'low' | 'preview'; eraVisualBindingReceipt: false },
) => TankVisual;

type PrepareVisualTextures = (
  spec: FleetTankSpec, anisotropy: number, quality: string, tick: () => Promise<void>, camo: string,
) => Promise<RuntimeValue>;

export interface BattlePresentationOptions {
  engineCtx: EngineContext;
  game: PresentationGameState;
  bus: EventBus;
  spectator?: boolean;
  worldCollision?: WorldCollisionLike | null;
  createTankVisual?: CreateTankVisual;
  prepareVisualTextures?: PrepareVisualTextures;
  rosterScheduling?: FrameSchedulerOptions;
  clearVehicleDecals?: ((visual: TankVisual) => void) | null;
  onVisualReady?: (actor: MatchActor) => void;
  /** The paint an actor wears (the wire carries none; the room service will). */
  camoFor?: (entry: RosterEntry) => string;
  onRosterProgress?: (fraction: number, specId: string) => void;
  /** How long a verdict may sit in snapshot meta before it is presented without its `match_ended` event. */
  verdictGraceMs?: number;
  clock?: () => number;
}

export interface BattlePresentation extends PresentationAdapter {
  readonly actors: Map<string, MatchActor>;
  readonly roster: MatchActor[];
  /** The prediction world for MatchClient.enablePrediction (null until the viewer's spec and the map are known). */
  predictionWorld(): PredictionWorld | null;
  /** Resolves once every roster actor announced so far has its builder, textures and visual (the session owner waits here after WELCOME). */
  rosterReady(): Promise<void>;
  mount(): void;
  unmount(): void;
  /** A terminal network failure: the match resolves as a disconnect once. */
  endDisconnected(): boolean;
  /** Spectators: which team reads as "player" (allies) in the HUD. */
  setPerspective(entityId: number): boolean;
  readonly ownActor: MatchActor | null;
}

const POS_SCALE = 1;
const scratchSample = createEntitySample();
const muzzleTip = new Vector3();
const shotDirection = new Vector3();
const VERDICT_RESULTS: Readonly<Record<number, string>> = Object.freeze({ [VERDICT.ALPHA]: 'alpha', [VERDICT.BRAVO]: 'bravo', [VERDICT.DRAW]: 'draw' });
const LOCAL_PLAYER_EVENT_KINDS: ReadonlySet<string> = new Set([
  'consumable_used', 'consumable_denied', 'magazine_reload', 'magazine_reload_denied', 'special_action',
  'special_action_denied', 'ammo_empty', 'ammo_selection_denied', 'ammo_depleted', 'tank_self_right',
]);

function hashString(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function textureQuality(isViewer: boolean): 'high' | 'ai' {
  return isViewer ? 'high' : 'ai';
}

export function createBattlePresentation({
  engineCtx,
  game,
  bus,
  spectator = false,
  worldCollision = null,
  createTankVisual = createTank as CreateTankVisual,
  prepareVisualTextures = prebakeSharedTextures as PrepareVisualTextures,
  rosterScheduling,
  clearVehicleDecals = null,
  onVisualReady,
  camoFor = () => 'factory',
  onRosterProgress,
  verdictGraceMs = 500,
  clock = () => (typeof performance === 'object' ? performance.now() : Date.now()),
}: BattlePresentationOptions): BattlePresentation {
  if (!engineCtx || !engineCtx.scene || !game || !bus) throw new TypeError('engineCtx, game and bus are required');
  const actors = new Map<string, MatchActor>();
  const actorsByEntity = new Map<number, MatchActor>();
  const roster: MatchActor[] = [];
  const visibleRoster: MatchActor[] = [];
  const shellById = new Map<number, MatchShell>();
  const liveShells: MatchShell[] = [];
  const destructionCause = new Map<string, string>();
  let context: RosterContext | null = null;
  let viewerTeam: TeamId | null = null;
  let perspectiveTeam: TeamId | null = null;
  let mounted = false;
  let disposed = false;
  let legacy: Pick<PresentationGameState, 'tanks' | 'tankById' | 'player' | 'shells' | 'spotting'> | null = null;
  let snapshotPhase: number | null = null;
  let appliedDestructibleRevision = -1;
  let lastModeStateJson: string | null = null;
  let verdictSeenAtMs: number | null = null;
  let lastPredictedFireSeq = -1;
  let predictionWorldCache: PredictionWorld | null = null;
  let predictionWorldSpec: FleetTankSpec | null = null;
  let disconnected = false;
  let rosterReady: Promise<void> = Promise.resolve();

  const ownActor = (): MatchActor | null => (context && !spectator ? actorsByEntity.get(context.ownEntityId) ?? null : null);

  // ------------------------------------------------------------ roster

  function ensureActor(entry: RosterEntry, isViewer: boolean): MatchActor {
    const existing = actors.get(entry.playerId);
    if (existing) {
      existing.displayName = entry.name || existing.displayName;
      existing.networkTeam = entry.team;
      return existing;
    }
    const spec = getSpec(entry.specId);
    const camo = camoFor(entry);
    const state = createTankState(spec, new Vector3(), 0);
    const visual = createTankVisual(spec.id, engineCtx, {
      camoSeed: 4000 + (hashString(entry.playerId) % 100000),
      camoPattern: camo,
      quality: textureQuality(isViewer),
      // Generated anatomy and live strip/reset clusters already own gameplay; the authoring audit stays off.
      eraVisualBindingReceipt: false,
    });
    engineCtx.scene.add(visual.root);
    visual.setVisible(false);
    const actor: MatchActor = {
      id: entry.playerId, entityId: entry.entityId, specId: spec.id, spec, camo,
      displayName: entry.name || null, networkTeam: entry.team, team: 'enemy', isPlayer: isViewer, bot: entry.bot,
      state, combat: createCombatState(spec), specialAction: createSpecialActionState(spec),
      input: { throttle: 0, steer: 0, brake: false, fire: false, aimLocked: false, shellSlot: 0, aimPoint: state.aimPoint.clone() },
      visual,
      // Authority uses the spec-derived contact footprint; the visual's measured one stays presentation-only.
      contactGeom: null, rigidGear: false, networkVisible: false, modeSpeedMultiplier: 1, modeGravityScale: 1,
      eraNames: eraPlateNames(spec.armor),
      _networkPoseReady: false, _networkDestroyed: false, _networkDestroyPop: false, _networkEraSpent: new Set(),
      _lastX: 0, _lastZ: 0,
    };
    actors.set(actor.id, actor);
    actorsByEntity.set(actor.entityId, actor);
    roster.push(actor);
    onVisualReady?.(actor);
    return actor;
  }

  async function prepareRoster(entries: readonly RosterEntry[], rosterContext: RosterContext): Promise<void> {
    const assertActive = () => { if (disposed) throw new Error('battle presentation disposed'); };
    assertActive();
    const active = entries.filter((entry) => entry.team !== TEAM.SPECTATOR && entry.entityId !== NO_ENTITY);
    const schedule = createOpaqueLoadingYielder(8, 50, rosterScheduling);
    const yieldWork = async (force = false) => { await schedule(force); assertActive(); };
    const textureTick = async () => { await schedule(); };
    if (active.some((entry) => !actors.has(entry.playerId))) await yieldWork(true);
    const warmed = new Set<string>();
    for (let index = 0; index < active.length; index++) {
      const entry = active[index]!;
      const isViewer = !spectator && entry.entityId === rosterContext.ownEntityId;
      await ensureTankBuilder(entry.specId);
      assertActive();
      const camo = camoFor(entry);
      const quality = textureQuality(isViewer);
      const key = `${entry.specId}:${camo}:${quality}`;
      if (!warmed.has(key)) {
        warmed.add(key);
        try { await prepareVisualTextures(getSpec(entry.specId), engineCtx.anisotropy ?? 4, quality, textureTick, camo); }
        catch { /* createTank keeps its synchronous compatibility path */ }
      }
      assertActive();
      ensureActor(entry, isViewer);
      onRosterProgress?.((index + 1) / Math.max(1, active.length), entry.specId);
      await yieldWork();
    }
  }

  function applyRoster(entries: readonly RosterEntry[], rosterContext: RosterContext): Promise<void> {
    context = rosterContext;
    const own = entries.find((entry) => entry.entityId === rosterContext.ownEntityId);
    if (own && !spectator) viewerTeam = own.team;
    game.gameMode = rosterContext.mode || 'standard';
    rosterReady = rosterReady.then(() => prepareRoster(entries, rosterContext));
    return rosterReady;
  }

  // ------------------------------------------------------------ actors

  function classify(actor: MatchActor): void {
    const reference = spectator ? perspectiveTeam : viewerTeam;
    actor.team = actor.networkTeam === reference ? 'player' : 'enemy';
  }

  function updateCombat(actor: MatchActor, sample: EntitySample): boolean {
    const { combat } = actor;
    combat.hp = sample.hp;
    combat.maxHp = sample.maxHp;
    // The row's magazine fields are the authority's multi-round indicator (sim/magazineIndicator): the cannon
    // magazine, or the guided rack salvo group while a missile is loaded. `combat.magazine` stays the cannon's.
    const loadedShell = actor.spec.gun.shells[sample.shellSlot];
    const salvoGroup = loadedShell?.guided === true && (actor.spec.gun.launcherSalvo?.rounds ?? 0) > 1;
    if (sample.magazineCapacity > 0) {
      combat.magazineIndicator ??= { rounds: 0, capacity: 0, launcher: false };
      combat.magazineIndicator.rounds = sample.magazineRounds;
      combat.magazineIndicator.capacity = sample.magazineCapacity;
      combat.magazineIndicator.launcher = salvoGroup;
    } else combat.magazineIndicator = null;
    if (sample.magazineCapacity > 0 && !salvoGroup) {
      combat.magazine ??= { rounds: 0, capacity: 0 };
      combat.magazine.rounds = sample.magazineRounds;
      combat.magazine.capacity = sample.magazineCapacity;
    } else if (!salvoGroup) combat.magazine = null;
    const gunReload = combat.gunReload || combat.reload;
    gunReload.t = sample.gunReloadS;
    gunReload.totalS = Math.max(sample.gunReloadTotalS || 0, sample.gunReloadS);
    gunReload.kind = (sample.gunReloadKind || sample.reloadKind || 'ready') as typeof gunReload.kind;
    combat.shellSlot = sample.shellSlot;
    if (combat.reloadChannels?.[sample.shellSlot]) combat.reload = combat.reloadChannels[sample.shellSlot]!;
    combat.reload.t = sample.reloadS;
    combat.reload.totalS = Math.max(sample.reloadTotalS || 0, sample.reloadS);
    combat.reload.kind = (sample.reloadKind || 'ready') as typeof combat.reload.kind;
    combat.ammo[0] = sample.ammo0;
    combat.ammo[1] = sample.ammo1;
    combat.ammo[2] = sample.ammo2;
    combat.fire.burning = (sample.flags & ENTITY_FLAGS.BURNING) !== 0;
    const destroyed = (sample.flags & ENTITY_FLAGS.DESTROYED) !== 0;
    combat.destroyed = destroyed;
    actor.input.fire = (sample.flags & ENTITY_FLAGS.FIRING) !== 0;
    actor.input.shellSlot = sample.shellSlot;
    actor.specialAction.active = (sample.flags & ENTITY_FLAGS.SPECIAL_ACTIVE) !== 0;
    actor.state.suspensionAim = actor.specialAction.kind === SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM && actor.specialAction.active;
    return destroyed;
  }

  function updateEra(actor: MatchActor, spent: readonly number[]): void {
    const shown = actor._networkEraSpent;
    const names = spent.map((index) => actor.eraNames[index]).filter((name): name is string => typeof name === 'string');
    if ([...shown].some((name) => !names.includes(name))) {
      actor.visual.resetEra?.();
      shown.clear();
    }
    for (const name of names) {
      if (shown.has(name)) continue;
      actor.visual.stripEra?.(name);
      shown.add(name);
    }
  }

  function updateDestruction(actor: MatchActor, destroyed: boolean): void {
    if (destroyed) {
      const pop = destructionCause.get(actor.id) === 'ammo_rack';
      if (actor._networkDestroyed && actor._networkDestroyPop === pop) return;
      actor._networkDestroyed = true;
      actor._networkDestroyPop = pop;
      if (actor.visual.setDestroyed) {
        // Impact scars are transient children of the live tank: detach them before the wreck material traversal.
        clearVehicleDecals?.(actor.visual);
        actor.visual.setDestroyed({ pop });
      }
    } else if (actor._networkDestroyed) {
      actor.visual.resetDestroyed?.();
      actor._networkDestroyed = false;
      actor._networkDestroyPop = false;
    }
  }

  function applySamplePose(actor: MatchActor, sample: EntitySample, resetTrackMotion: boolean): void {
    const { state } = actor;
    const dx = sample.x - actor._lastX;
    const dz = sample.z - actor._lastZ;
    const forward = dx * Math.sin(sample.yaw) + dz * Math.cos(sample.yaw);
    if (actor._networkPoseReady && !resetTrackMotion && !actor.combat.destroyed) {
      // The shared movement model uses a 1.5 m outer-track arm; integrating the observed hull turn keeps the
      // opposing track motion of a pivot without a second simulation clock.
      const yawDelta = Math.atan2(Math.sin(sample.yaw - state.yaw), Math.cos(sample.yaw - state.yaw));
      const turn = yawDelta * 1.5;
      state.trackScroll.l += forward + turn;
      state.trackScroll.r += forward - turn;
    }
    state.pos.set(sample.x * POS_SCALE, sample.y * POS_SCALE, sample.z * POS_SCALE);
    state.verticalSpeed = sample.vy;
    state.grounded = (sample.flags & ENTITY_FLAGS.AIRBORNE) === 0;
    state.overturned = (sample.flags & ENTITY_FLAGS.OVERTURNED) !== 0;
    state._body.autoRighting = (sample.flags & ENTITY_FLAGS.AUTO_RIGHTING) !== 0;
    state._body.tumbling = state.overturned || state._body.autoRighting;
    state._ride.y = sample.y;
    state._ride.v = sample.vy;
    state._ride.grounded = state.grounded;
    state.yaw = sample.yaw;
    state.visualPitch = sample.pitch;
    state.visualRoll = sample.roll;
    state.turretYaw = sample.turretYaw;
    state.gunPitch = sample.gunPitch;
    const speed = Math.hypot(sample.vx, sample.vz);
    const along = sample.vx * Math.sin(sample.yaw) + sample.vz * Math.cos(sample.yaw);
    state.speed = along < 0 ? -speed : speed;
    actor._lastX = sample.x;
    actor._lastZ = sample.z;
  }

  function reveal(actor: MatchActor): void {
    // Prepared visuals live at a hidden staging origin: seed the renderer from authority once before revealing.
    if (!actor._networkPoseReady) {
      actor.visual.syncFromState(actor.state, 0);
      actor._networkPoseReady = true;
    }
    actor.visual.setVisible(true);
  }

  function updateRemote(actor: MatchActor, sample: EntitySample): void {
    const wasDestroyed = actor.combat.destroyed;
    classify(actor);
    actor.networkVisible = true;
    const destroyed = updateCombat(actor, sample);
    updateEra(actor, sample.eraSpent);
    updateDestruction(actor, destroyed);
    applySamplePose(actor, sample, wasDestroyed !== destroyed || sample.snapped);
    reveal(actor);
  }

  function updateOwn(actor: MatchActor, frame: MatchFrame): void {
    const viewer = frame.viewer;
    classify(actor);
    actor.networkVisible = true;
    if (viewer.state && actor.state !== viewer.state) {
      // The renderer reads the client's predicted, corrected state directly: no per-frame copy.
      const previous = actor.state;
      actor.state = viewer.state;
      actor.state.suspensionAim = previous.suspensionAim;
    }
    if (viewer.row) {
      const sample = decodeRow(viewer.row, scratchSample);
      const destroyed = updateCombat(actor, sample);
      updateEra(actor, viewer.row.eraSpent);
      updateDestruction(actor, destroyed);
      if (!viewer.state) applySamplePose(actor, sample, false);
    }
    const state = viewer.viewer;
    if (state) {
      VIEWER_MODULES.forEach((name, index) => {
        const module = actor.combat.modules[name];
        if (module) module.state = MODULE_STATE_NAMES[state.modules[index] ?? 0] ?? 'ok';
      });
      VIEWER_CREW.forEach((name, index) => { actor.combat.crew[name] = (state.crewBits & (1 << index)) !== 0; });
      actor.combat.equipMults ??= {};
      VIEWER_EQUIPMENT.forEach((name, index) => { actor.combat.equipMults![name] = dequantizeMultiplier(state.equipment[index] ?? 1000); });
      actor.modeSpeedMultiplier = dequantizeMultiplier(state.modeSpeedMultiplier);
      actor.modeGravityScale = dequantizeMultiplier(state.modeGravityScale);
    }
    actor._lastX = actor.state.pos.x;
    actor._lastZ = actor.state.pos.z;
    reveal(actor);
  }

  // ------------------------------------------------------------ frame

  function publishRoster(): void {
    visibleRoster.length = 0;
    for (const actor of actors.values()) if (actor.networkVisible || actor.combat.destroyed) visibleRoster.push(actor);
    game.tanks = visibleRoster;
    game.tankById = actors;
    game.player = ownActor();
  }

  function applyShells(samples: readonly ShellSample[]): void {
    const live = new Set<number>();
    for (const raw of samples) {
      live.add(raw.id);
      let shell = shellById.get(raw.id);
      if (!shell) {
        shell = {
          rocket: false, id: raw.id, shooterId: actorsByEntity.get(raw.shooterEntityId)?.id ?? '',
          pos: new Vector3(), prevPos: new Vector3(), vel: new Vector3(),
          spec: { type: raw.shellType, tracer: raw.guided ? 'ATGM' : raw.shellType, guided: raw.guided },
          dead: false, ageS: 0, distM: 0,
        };
        shellById.set(raw.id, shell);
      }
      shell.prevPos.copy(shell.pos);
      shell.pos.set(raw.x, raw.y, raw.z);
      if (shell.prevPos.lengthSq() === 0) shell.prevPos.copy(shell.pos);
      else shell.distM += shell.prevPos.distanceTo(shell.pos);
      shell.vel.set(raw.vx, raw.vy, raw.vz);
      const shooter = actorsByEntity.get(raw.shooterEntityId);
      shell.rocket = !raw.guided && isUnguidedRocket(shooter?.spec.gun, { guided: raw.guided });
      shell.spec.type = raw.shellType;
      shell.spec.guided = raw.guided;
      shell.spec.tracer = raw.guided ? 'ATGM' : raw.shellType;
      shell.spawnedAtS ??= game.timeS;
      shell.ageS = Math.max(0, game.timeS - shell.spawnedAtS);
    }
    for (const [id, shell] of shellById) if (!live.has(id)) { shell.dead = true; shellById.delete(id); }
    liveShells.length = 0;
    for (const shell of shellById.values()) liveShells.push(shell);
    game.shells = liveShells;
  }

  function applyDestroyed(indices: readonly number[], revision: number): void {
    if (revision <= appliedDestructibleRevision) return;
    appliedDestructibleRevision = revision;
    if (!worldCollision || typeof worldCollision.getObstacles !== 'function') return;
    const obstacles = worldCollision.getObstacles();
    for (const index of indices) {
      const obstacle = obstacles[index];
      if (!obstacle || obstacle.crushed) continue;
      worldCollision.crushObstacle?.(obstacle, 0, 1, 0);
      obstacle.crushed = true;
    }
  }

  function resultRoster(): Array<Record<string, RuntimeValue>> {
    return roster.map((actor) => ({
      id: actor.id, name: actor.displayName || actor.spec.name || actor.specId, vehicle: actor.displayName || actor.spec.name || actor.specId,
      specId: actor.specId, team: actor.team === 'enemy' ? 'enemy' : 'ally', alive: !actor.combat.destroyed, isPlayer: actor.isPlayer,
    }));
  }

  /** battle endings (2026-09-25): the killcam facade (typed loosely by main) — every observable lethal shell_hit feeds it. */
  function feedKillcam(hit: Record<string, RuntimeValue>, target: RuntimeValue): void {
    const killcam = game.killcam as { onShellHit?: (event: RuntimeValue, target: RuntimeValue) => void } | null | undefined;
    if (killcam && typeof killcam.onShellHit === 'function') killcam.onShellHit(hit, target);
  }

  /** battle endings (2026-09-25): the Horde wave the last stand fell on, for the report milestone */
  function hordeWave(): number | null {
    const mode = game.matchModeState as { horde?: { wave?: number } | null } | null | undefined;
    const wave = mode?.horde?.wave;
    return typeof wave === 'number' && Number.isFinite(wave) ? wave : null;
  }

  function endMatch(result: string, reason: string): void {
    game.result = result;
    game.resultReason = reason;
    // The match keeps publishing the field through the ruleset's post-verdict hold (authoritativeMatch endingHoldS),
    // so the ending director's replay or camera beat plays over a live field, as in solo play.
    bus.emit('battle:ended', {
      result, reason, timeS: game.timeS, map: game.mapId, mapId: game.mapId, durationS: game.timeS, network: true,
      gameMode: game.gameMode, roster: resultRoster(), hordeWave: hordeWave(),
    });
  }

  function applyVerdict(verdict: VerdictId, reason: string): void {
    if (game.result || verdict === VERDICT.NONE) return;
    const winner = VERDICT_RESULTS[verdict];
    const result = spectator || winner === 'draw' ? 'draw'
      : winner === (viewerTeam === TEAM.ALPHA ? 'alpha' : 'bravo') ? 'victory' : 'defeat';
    endMatch(result, reason || 'elimination');
  }

  function applyFrame(frame: MatchFrame): void {
    if (disposed) return;
    snapshotPhase = frame.meta.phase;
    const own = ownActor();
    for (const actor of actors.values()) actor.networkVisible = false;
    for (const sample of frame.entities) {
      const actor = actorsByEntity.get(sample.entityId);
      if (!actor || actor === own) continue;
      updateRemote(actor, sample);
    }
    if (own) updateOwn(own, frame);
    for (const actor of actors.values()) {
      classify(actor);
      if (!actor.networkVisible) actor.visual.setVisible(false);
    }
    if (!mounted) mount();
    publishRoster();
    game.timeS = frame.meta.battleTimeMs / 1000;
    game.preBattleS = frame.meta.phase === PHASE.COUNTDOWN ? frame.meta.countdownMs / 1000 : 0;
    if (frame.modeStateJson !== lastModeStateJson) {
      lastModeStateJson = frame.modeStateJson;
      try { game.matchModeState = frame.modeStateJson ? JSON.parse(frame.modeStateJson) as RuntimeValue : null; }
      catch { game.matchModeState = null; }
    }
    applyShells(frame.shells);
    applyDestroyed(frame.destroyed, frame.destructibleRevision);
    const predicted = frame.viewer.predictedShot;
    if (predicted && predicted.fireSeq !== lastPredictedFireSeq && own) {
      lastPredictedFireSeq = predicted.fireSeq;
      emitPredictedShot(own, predicted.shellSlot);
    }
    // The verdict is persistent snapshot state: a reconnect or a late joiner converges on it even when the
    // `match_ended` event predates this client; the event keeps the cinematic order when it does arrive.
    if (frame.meta.verdict !== VERDICT.NONE && !game.result) {
      verdictSeenAtMs ??= clock();
      if (clock() - verdictSeenAtMs >= verdictGraceMs) applyVerdict(frame.meta.verdict, frame.meta.verdictReason);
    }
    if (frame.phase === 'failed') endDisconnected();
  }

  function setVisibility(entityId: number, visible: boolean): void {
    const actor = actorsByEntity.get(entityId);
    if (!actor) return;
    actor.networkVisible = visible;
    actor.visual.setVisible(visible);
  }

  // ------------------------------------------------------------ events

  function launcherIndex(shooter: MatchActor, payload: Record<string, RuntimeValue>): number | null {
    const count = shooter.spec.gun.launcherMuzzles?.length ?? 0;
    const round = shooter.spec.gun.shells.find((shell) => shell.name === payload.shellName);
    const index = payload.muzzleIndex;
    return count > 0 && usesLauncherMuzzles(shooter.spec.gun, round) && typeof index === 'number' && Number.isInteger(index) &&
      index >= 0 && index < count ? index : null;
  }

  function emitPredictedShot(own: MatchActor, slot: number): void {
    if (!mounted || snapshotPhase !== PHASE.PLAYING || game.result || own.combat.destroyed ||
        !own.visual.gunMuzzleWorld || !own.visual.gunDirWorld || mainWeaponModuleState(own.combat) === 'red') return;
    const shell = own.spec.gun.shells[slot];
    if (!shell) return;
    const launcher = usesLauncherMuzzles(own.spec.gun, shell) ? own.combat.launcherCursor ?? 0 : undefined;
    const muzzleIndex = own.visual.recoilKick?.(0, shotRecoilScale(own.spec, shell), launcher, usesLauncherMuzzles(own.spec.gun, shell)) ?? -1;
    own.visual.gunMuzzleWorld(muzzleTip, muzzleIndex, usesLauncherMuzzles(own.spec.gun, shell));
    own.visual.gunDirWorld(shotDirection);
    bus.emit('weapon:predicted', {
      fireIntentSeq: lastPredictedFireSeq, shooterId: own.id, isPlayer: true, shooterSpecId: own.specId,
      shellType: shell.type, shellName: shell.name, weaponSound: shell.soundProfile || own.spec.gun.soundProfile || null,
      caliberMm: shell.caliberMm, velocityMps: shell.velocityMps, timeS: game.timeS, muzzleIndex,
      rocket: isUnguidedRocket(own.spec.gun, shell),
      muzzlePos: [muzzleTip.x, muzzleTip.y, muzzleTip.z], dir: [shotDirection.x, shotDirection.y, shotDirection.z],
    });
  }

  function emitShellFired(payload: Record<string, RuntimeValue>, feedbackPredicted: boolean): void {
    const shooter = actors.get(String(payload.shooterId ?? ''));
    if (shooter && payload.shooterId === ownActor()?.id) {
      const index = launcherIndex(shooter, payload);
      if (index !== null) shooter.combat.launcherCursor = (index + 1) % shooter.spec.gun.launcherMuzzles!.length;
    }
    let muzzlePos: RuntimeValue[] = [payload.x, payload.y, payload.z];
    let shellSpec: FleetTankSpec['gun']['shells'][number] | null = null;
    let muzzleIndex: number | null = -1;
    if (shooter?.visual.recoilKick) {
      const shells = shooter.spec.gun.shells;
      shellSpec = shells.find((shell) => shell.name === payload.shellName) || shells.find((shell) => shell.type === payload.shellType) || null;
      const authoritative = launcherIndex(shooter, payload);
      const launcher = usesLauncherMuzzles(shooter.spec.gun, shellSpec);
      muzzleIndex = feedbackPredicted ? authoritative ?? -1
        : shooter.visual.recoilKick(0, shotRecoilScale(shooter.spec, shellSpec), authoritative ?? undefined, launcher);
      if (muzzleIndex != null && shooter.visual.gunMuzzleWorld) {
        shooter.visual.gunMuzzleWorld(muzzleTip, muzzleIndex, launcher);
        muzzlePos = [muzzleTip.x, muzzleTip.y, muzzleTip.z];
      }
    }
    bus.emit('shell:fired', {
      shellId: payload.shellId, shooterId: payload.shooterId, isPlayer: payload.shooterId === ownActor()?.id,
      shellType: payload.shellType, shellName: payload.shellName,
      weaponSound: payload.weaponSound || shellSpec?.soundProfile || shooter?.spec.gun.soundProfile || null,
      muzzleIndex, caliberMm: payload.caliberMm, velocityMps: payload.velocityMps, timeS: payload.timeS ?? game.timeS,
      muzzlePos, dir: [payload.dx, payload.dy, payload.dz], shooterSpecId: shooter?.specId,
      feedbackPredicted, rocket: isUnguidedRocket(shooter?.spec.gun, shellSpec), fireIntentSeq: payload.fireIntentSeq,
    });
  }

  function emitLocalPlayerEvent(kind: string, payload: Record<string, RuntimeValue>): void {
    switch (kind) {
      case 'consumable_used': bus.emit('ui:consumableUsed', { slot: payload.slot, cooldownS: payload.cooldownS, readyAt: payload.readyAt }); break;
      case 'consumable_denied': bus.emit('ui:consumableDenied', { slot: payload.slot, reason: payload.reason, remainingS: payload.remainingS }); break;
      case 'magazine_reload': bus.emit('ui:magazineReloadStarted', {}); break;
      case 'magazine_reload_denied': bus.emit('ui:magazineReloadDenied', { reason: payload.reason }); break;
      case 'special_action': bus.emit('ui:specialActionResult', { kind: payload.kind, active: !!payload.active, reason: payload.reason || null }); break;
      case 'special_action_denied': bus.emit('ui:specialActionDenied', { kind: payload.kind, reason: payload.reason, slot: payload.slot }); break;
      case 'ammo_empty': bus.emit('ammo:empty', { type: kind, ...payload }); break;
      case 'ammo_selection_denied': bus.emit('ui:ammoSelectionDenied', { type: kind, ...payload }); break;
      case 'ammo_depleted': bus.emit('ammo:depleted', { type: kind, ...payload }); break;
      case 'tank_self_right': bus.emit('tank:selfRight', { type: kind, ...payload }); break;
      default: break;
    }
  }

  function applyEvent(event: WireEvent, eventContext: EventContext): void {
    if (disposed) return;
    const { kind, payload } = event;
    const own = ownActor();
    switch (kind) {
      case 'shell_fired':
        if (eventContext.own && (!own || !mounted || snapshotPhase !== PHASE.PLAYING || game.result || own.combat.destroyed)) return;
        emitShellFired(payload, eventContext.feedbackPredicted);
        return;
      case 'shell_hit': {
        const hit = { type: kind, ...payload, attackerId: payload.attackerId || payload.shooterId };
        // battle endings (2026-09-25): the killcam captures the lethal chain for any pair the match let this viewer
        // observe (the authority's reveal rules already filtered the event), so a verdict can replay the final
        // kill whoever fired it — the hook state.ts calls in solo play and the v1 bridge calls for its rooms
        feedKillcam(hit, actors.get(String(payload.targetId ?? '')) ?? null);
        bus.emit('shell:hit', hit);
        return;
      }
      case 'shell_impact':
        bus.emit('shell:expired', {
          shellId: payload.shellId, shooterId: payload.shooterId, hitTerrain: payload.kind === 'terrain', hitKind: payload.kind,
          surfaceKind: payload.surfaceKind || payload.kind, normal: [payload.nx || 0, payload.ny ?? 1, payload.nz || 0],
          shellType: payload.shellType, caliberMm: payload.caliberMm, pos: [payload.x, payload.y, payload.z],
        });
        return;
      case 'tank_destroyed': {
        const id = String(payload.id ?? '');
        if (typeof payload.cause === 'string') destructionCause.set(id, payload.cause);
        const actor = actors.get(id);
        bus.emit('tank:destroyed', {
          id, specId: actor?.specId, killerId: payload.killerId, cause: payload.cause === 'ammo_rack' ? 'ammorack' : payload.cause,
          pos: actor ? [actor.state.pos.x, actor.state.pos.y, actor.state.pos.z] : null,
        });
        return;
      }
      case 'world_prop_destroyed': {
        const index = Number(payload.obstacleIndex);
        const obstacle = worldCollision?.getObstacles && Number.isSafeInteger(index) && index >= 0 ? worldCollision.getObstacles()[index] : null;
        if (obstacle && !obstacle.crushed && worldCollision?.crushObstacle) {
          worldCollision.crushObstacle(obstacle, Number(payload.directionX) || 0, Number(payload.directionZ) || 0, Number(payload.speedMps) || 0);
          obstacle.crushed = true;
        }
        bus.emit('prop:crushed', {
          kind: payload.kind, speedMps: payload.speedMps, cause: payload.cause,
          pos: obstacle ? [(obstacle.min[0] + obstacle.max[0]) * 0.5, obstacle.min[1], (obstacle.min[2] + obstacle.max[2]) * 0.5] : null,
          dir: [payload.directionX, 0, payload.directionZ],
        });
        return;
      }
      case 'module_state':
        bus.emit('module:state', { id: payload.id, module: payload.module, state: payload.state, source: payload.source });
        return;
      case 'tank_fire':
        bus.emit('tank:fire', { id: payload.id, burning: payload.burning });
        return;
      case 'tank_ram':
        bus.emit('tank:ram', {
          aId: payload.aId, bId: payload.bId, dmgA: payload.damageA, dmgB: payload.damageB, closingMps: payload.closingMps,
          aIsPlayer: payload.aId === own?.id, bIsPlayer: payload.bId === own?.id, pos: [payload.x, payload.y, payload.z],
        });
        return;
      case 'match_ended': {
        const result = payload.result;
        const verdict = result === 'alpha' ? VERDICT.ALPHA : result === 'bravo' ? VERDICT.BRAVO : result === 'draw' ? VERDICT.DRAW : VERDICT.NONE;
        applyVerdict(verdict, String(payload.reason ?? 'elimination'));
        return;
      }
      default:
        if (LOCAL_PLAYER_EVENT_KINDS.has(kind)) {
          if (own && payload.id === own.id) emitLocalPlayerEvent(kind, payload);
        } else if (kind.startsWith('mode_')) bus.emit(kind.replace(/^mode_/, 'mode:'), { type: kind, ...payload });
    }
  }

  // ------------------------------------------------------------ lifecycle

  function mount(): void {
    if (mounted) return;
    mounted = true;
    legacy = { tanks: game.tanks, tankById: game.tankById, player: game.player, shells: game.shells, spotting: game.spotting };
    for (const entity of game.allTanks || []) entity.visual?.setVisible?.(false);
    publishRoster();
    game.shells = [];
    game.spotting = {
      isSpotted: (targetId: string) => !!actors.get(targetId)?.networkVisible,
      getConcealment: () => ({ camo: 0, base: 0, paint: 0, equip: 0, bush: 0, bloom: 0, moving: false, fired: false, inBush: false, spotted: false }),
    };
  }

  function unmount(): void {
    if (!mounted || !legacy) return;
    game.tanks = legacy.tanks;
    game.tankById = legacy.tankById;
    game.player = legacy.player;
    game.shells = legacy.shells;
    game.spotting = legacy.spotting;
    for (const entity of game.allTanks || []) entity.visual?.setVisible?.(true);
    mounted = false;
    legacy = null;
  }

  function endDisconnected(): boolean {
    if (disconnected || game.result) return false;
    disconnected = true;
    endMatch('draw', 'network_disconnect');
    return true;
  }

  function setPerspective(entityId: number): boolean {
    if (!spectator) return false;
    const target = actorsByEntity.get(entityId);
    if (!target) return false;
    perspectiveTeam = target.networkTeam;
    for (const actor of actors.values()) classify(actor);
    return true;
  }

  function predictionWorld(): PredictionWorld | null {
    const own = ownActor();
    if (!own || !worldCollision) return null;
    if (predictionWorldCache && predictionWorldSpec === own.spec) return predictionWorldCache;
    predictionWorldSpec = own.spec;
    predictionWorldCache = createPredictionWorld({
      worldCollision,
      ownSpec: own.spec,
      ownState: () => own.state,
      others: () => collidableActors(own),
    });
    return predictionWorldCache;
  }

  function* collidableActors(own: MatchActor): Iterable<{ spec: FleetTankSpec; state: TankState; collidable: boolean }> {
    for (const actor of actors.values()) {
      if (actor === own) continue;
      yield { spec: actor.spec, state: actor.state, collidable: actor.networkVisible || actor.combat.destroyed };
    }
  }

  function dispose(): void {
    disposed = true;
    unmount();
    for (const actor of actors.values()) actor.visual.dispose();
    actors.clear();
    actorsByEntity.clear();
    roster.length = 0;
    visibleRoster.length = 0;
    liveShells.length = 0;
    shellById.clear();
    destructionCause.clear();
  }

  return {
    actors,
    roster,
    applyRoster,
    applyFrame,
    applyEvent,
    applyVerdict,
    setVisibility,
    predictionWorld,
    rosterReady: () => rosterReady,
    mount,
    unmount,
    endDisconnected,
    setPerspective,
    get ownActor() { return ownActor(); },
    dispose,
  };
}
