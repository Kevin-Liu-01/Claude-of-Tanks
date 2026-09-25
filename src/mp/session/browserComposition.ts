/**
 * The Multiplayer v2 browser launch: the v2 counterpart of
 * src/net/networkBattleComposition.ts (charter §3 "presentation/", §6 rule 3:
 * no client can block a start; a client joins when it is ready).
 *
 * The Play menu hands a v2 room connection here (`beginRoom`, its
 * `onNetworkStart`). The composition adopts the room's session, builds one
 * `MatchSession` on the room's `RoomClient`, and for every `match_start` the
 * session asks it for a presentation: the round's map is loaded through the
 * same app ports v1 uses (the loader cover, the battle-only modules, the
 * world, the roster paint), the battle presentation is created on the world's
 * collision, prediction is enabled once the roster is ready, the first frame
 * warms the terrain/wrecks/panel/programs under the cover, the activation
 * runtime transfers the world into the live battle phase, the reveal barrier
 * and the loader fade end the entry. The verdict reaches the end overlay
 * through the presentation's `battle:ended`; the room stays for a rematch
 * (the lobby re-attaches to the Play menu once the result is up or the player
 * is back in the Garage), an explicit leave closes the seat, and failures —
 * a load that fails, the match link exhausted (`lost`), the room gone — reach
 * the existing failure surfaces (covered Garage restore, the menu's room
 * failure panel) instead of a spinner.
 *
 * Node-runnable: every app surface is a port, the session owner and the
 * presentation factory are injectable (browserComposition.selftest.mjs drives
 * a scripted session and a recorded presentation).
 */
import { MatchSession } from './matchSession.ts';
import type { MatchSessionOptions, MatchSessionStats, SessionPhase, SessionPresentation, SessionRound } from './matchSession.ts';
import { isMultiplayerV2Session } from './playMenuAdapter.ts';
import type { V2RoomSession } from './playMenuAdapter.ts';
import { createBattlePresentation } from '../presentation/battlePresentation.ts';
import type {
  BattlePresentation, BattlePresentationOptions, EngineContext, EventBus, MatchActor, PresentationGameState, TankVisual,
} from '../presentation/battlePresentation.ts';
import type { WorldCollisionLike } from '../presentation/predictionWorld.ts';
import type { ControlSample } from '../match/inputStream.ts';
import type { MatchFrame } from '../match/matchClient.ts';
import type { Unsubscribe } from '../transport/transport.ts';
import { ACTION_BITS, VERDICT } from '../wire/index.ts';
import type { VerdictId, WelcomeMessage } from '../wire/index.ts';
import type { RoomSnapshot } from '../room/protocol.ts';
import { getSpec } from '../../vehicles/specs.ts';
import type { SerializedLobby } from '../../net/lobby.ts';

type MaybePromise<T> = T | PromiseLike<T>;
type RuntimeValue = {} | null | undefined;
type TerrainVariant = 'assault-trenches' | null;
type RoomMode = 'private' | 'lan';

// ------------------------------------------------------------ ports

export interface BrowserRosterRow {
  readonly id: string;
  readonly tier?: string;
  readonly name?: string;
  readonly isPlayer?: boolean;
}

export interface BrowserRosterPlayer {
  id: string;
  specId: string;
  team?: string;
  name?: string;
}

export interface BrowserLoadScreen {
  readonly visible: boolean;
  show(info: {
    mapName: string; thumb?: string; biome?: string; mode?: string;
    allies: readonly BrowserRosterRow[]; enemies: readonly BrowserRosterRow[];
  }): void;
  rosters(allies: readonly BrowserRosterRow[], enemies: readonly BrowserRosterRow[]): void;
  progress(fraction: number, label?: string): void;
  hide(): Promise<void>;
}

export interface BrowserEntryLifecycle {
  run<T>(task: () => Promise<T>, busyValue: T): Promise<T>;
  coverRendering(): void;
  uncoverRendering(): void;
  primeReveal(): Promise<RuntimeValue>;
  readonly pending: boolean;
}

export interface BrowserLoadTrace {
  version: 2;
  mode: string;
  map: string;
  round: number;
  stages: Record<string, number>;
  startedAt: number;
  endedAt?: number;
  status: 'pending' | 'complete' | 'failed';
  totalMs?: number;
  blackCheck?: RuntimeValue;
}

export interface BrowserEntryFailure {
  message: string;
  matchId: string | null;
  stage: string;
  reason: string;
}

export interface BrowserLoadPorts {
  battleLoad: BrowserLoadScreen;
  audio: { resume(): RuntimeValue; loadingOn(active: boolean): RuntimeValue; ambientOn(active: boolean): RuntimeValue };
  lighting: { setFarCascadeDormant(dormant: boolean): void };
  ensureBattleVisuals(): MaybePromise<RuntimeValue>;
  /** The battle-only modules a round needs before it presents (HUD, touch controls, FX, killcam, warm owners). */
  loadModules(): MaybePromise<RuntimeValue>;
  loadWorld(mapId: string, onProgress: (fraction: number, label: string) => void, terrainVariant?: TerrainVariant): MaybePromise<RuntimeValue>;
  nextFrame(): MaybePromise<RuntimeValue>;
  setAdaptiveSuspended(suspended: boolean): void;
  now?(): number;
  recordTrace?(trace: BrowserLoadTrace): void;
  recordEntryFailure?(failure: BrowserEntryFailure | null): void;
}

export interface BrowserRosterPorts {
  getMap(mapId: string): { name: string; thumb: string; biome: string };
  rows(players: BrowserRosterPlayer[], team: string, viewerId: string): BrowserRosterRow[];
  vehicleName(specId: string): string;
  emitBattleStart(payload: { playerId: string; specId: string; mapId: string }): void;
  setCamoBiome(mapId: string): void;
}

export interface BrowserFxPort {
  setFrozen(frozen: boolean): void;
  resetAll(): void;
}

/** The roster as the warm owners see it: v1's bridge entities and v2's actors share this shape. */
export interface BrowserWarmEntity {
  specId: string;
  spec: RuntimeValue;
  visual?: RuntimeValue;
}

export interface BrowserWarmView {
  entities: Map<string, BrowserWarmEntity>;
}

export interface BrowserWarmPorts {
  atmosphere?(initial: { meta: { weatherSeed?: RuntimeValue } | null }): MaybePromise<void>;
  nightLighting?(): MaybePromise<void>;
  terrain?(view: BrowserWarmView): MaybePromise<RuntimeValue>;
  wrecks?(view: BrowserWarmView, signal?: AbortSignal): MaybePromise<RuntimeValue>;
  playerPanel?(view: BrowserWarmView, viewerId: string): MaybePromise<RuntimeValue>;
  compile?(signal?: AbortSignal): MaybePromise<{ preparation?: { status?: string; pending?: number | null } | null } | null | undefined>;
  openingEffects?(fx: BrowserFxPort, view: BrowserWarmView, signal?: AbortSignal): MaybePromise<RuntimeValue>;
  shotCards?(specIds: string[]): void;
  /** The opening ground cover around the final camera (after activation). */
  presentation?(signal?: AbortSignal): MaybePromise<RuntimeValue>;
  finalShadows?(signal?: AbortSignal): MaybePromise<RuntimeValue>;
}

export interface BrowserScenePorts {
  engineCtx: EngineContext;
  game: PresentationGameState & { phase?: string };
  bus: EventBus;
  getWorldCollision(): WorldCollisionLike | null;
  groundSampler(x: number, z: number): RuntimeValue;
  getFx(): BrowserFxPort;
  /** Remove the previous result before any new network frame can render. */
  resetRoundState(): void;
  clearVehicleDecals?(visual: TankVisual): void;
  onVisualReady?(actor: MatchActor): void;
}

export interface BrowserActivationRequest {
  viewerId: string;
  own: { id: string; specId: string };
  spectator: boolean;
  mapId: string;
  bridge: { setPerspective(entityId: string | null | undefined): void };
  fx: BrowserFxPort;
}

export interface BrowserPresentationPorts {
  /** v1's activation runtime: the prepared world becomes the one live battle phase. */
  activate(request: BrowserActivationRequest): void;
  setWaitingForPeers(waiting: boolean): void;
  setGarageLighting(active: boolean): void;
  runBlackWatchdog?(signal?: AbortSignal): MaybePromise<RuntimeValue>;
}

export interface BrowserActiveRoomAdapter {
  state: SerializedLobby;
  playerId: string;
  role: 'host' | 'client';
  version: 2;
  command(command: Record<string, RuntimeValue>): RuntimeValue;
  leave(reason?: string): RuntimeValue;
}

export interface BrowserRoomMenu {
  attachActiveRoom(adapter: BrowserActiveRoomAdapter): void;
  updateActiveRoom(state: SerializedLobby): boolean;
  detachActiveRoom(): void;
  showRoomFailure(reason: string, mode?: RoomMode): void;
}

export interface BrowserGarageRoomStatus {
  roomCode: string;
  mode: string;
  ready: boolean;
  canSetReady: boolean;
  readyCount: number;
  total: number;
}

export interface BrowserRoomPorts {
  getMenu(): Promise<BrowserRoomMenu> | null;
  setGarageStatus(status: BrowserGarageRoomStatus | null): void;
  emitRoomState(payload: RuntimeValue): void;
  clearInput(): void;
  /** The covered Garage restore after an entry failure (v1's launcher `enterGarage`). */
  enterGarage(): MaybePromise<void>;
  /** The transition out of a live battle (the Garage return's `leave`). */
  returnToGarage(): Promise<void>;
  getPhase(): string;
  hasResult(): boolean;
}

export interface BrowserCompositionPorts {
  lifecycle: BrowserEntryLifecycle;
  load: BrowserLoadPorts;
  roster: BrowserRosterPorts;
  scene: BrowserScenePorts;
  warm?: BrowserWarmPorts;
  presentation: BrowserPresentationPorts;
  room: BrowserRoomPorts;
}

/** The session owner as the composition drives it (MatchSession, or the receipt's scripted one). */
export interface SessionOwner {
  readonly phase: SessionPhase;
  readonly round: SessionRound | null;
  start(): void;
  onPhase(listener: (change: { phase: SessionPhase; detail: string }) => void): Unsubscribe;
  onVerdict(listener: (change: { verdict: VerdictId; reason: string; matchId: string }) => void): Unsubscribe;
  onFrame(listener: (frame: MatchFrame) => void): Unsubscribe;
  update(nowMs: number, elapsedS: number): MatchFrame | null;
  leaveMatch(reason?: string): Promise<void>;
  dispose(): void;
  stats(): MatchSessionStats;
}

export interface BrowserCompositionFactories {
  createSession(options: MatchSessionOptions): SessionOwner;
  createPresentation(options: BattlePresentationOptions): BattlePresentation;
}

export interface BrowserLaunchRequest {
  role?: string;
  session?: RuntimeValue;
  lobbyState?: {
    mode?: string;
    mapId?: string;
    round?: number;
    players?: ReadonlyArray<{ id: string; specId?: string | null; team?: string; name?: string }>;
  } | null;
}

export interface BrowserCompositionOptions {
  ports: BrowserCompositionPorts;
  factories?: Partial<BrowserCompositionFactories>;
  clock?: () => number;
  clientBuild?: string;
  /** How long `beginRoom` waits for the room's match_start before restoring the Garage (charter §6.4). */
  entryTimeoutMs?: number;
  schedule?: (callback: () => void) => void;
  reportError?: (scope: string, error: RuntimeValue) => void;
}

export interface BrowserRoundStats {
  matchId: string;
  round: number;
  mapId: string;
  mode: string;
  spectator: boolean;
  welcomed: boolean;
  activated: boolean;
  revealed: boolean;
  frames: number;
  actors: number;
  events: Record<string, number>;
  ownShots: number;
}

export interface BrowserCompositionStats {
  version: 2;
  active: boolean;
  inMatch: boolean;
  room: { roomCode: string; mode: RoomMode; adminId: string; phase: string; players: number; playerId: string } | null;
  session: MatchSessionStats | null;
  round: BrowserRoundStats | null;
  rounds: number;
  lastFailure: BrowserEntryFailure | null;
}

export interface BrowserComposition {
  /** The Play menu's `onNetworkStart` for a v2 room: enter the room's match (resolves true once the battle is revealed, false when it could not). */
  beginRoom(request: BrowserLaunchRequest): Promise<boolean>;
  /** A round is loading or live: the battle frame is network-owned. */
  readonly active: boolean;
  /** The round has been activated into the live battle phase. */
  readonly inMatch: boolean;
  readonly room: V2RoomSession | null;
  readonly session: SessionOwner | null;
  /** One display frame (the app's network pump, every phase). */
  pump(dtSeconds: number, nowMs: number): void;
  /** The hidden-tab cadence: the socket keeps its pings and acks. */
  pumpBackground(nowMs: number): void;
  queueConsumable(slot: number): void;
  queueAction(action: 'reloadMagazine' | 'specialAction' | 'selfRight'): void;
  /** The Garage return's network port: keep the room across the return? */
  shouldPreserveRoom(): boolean;
  /** Leave the match, keep the seat (the Garage return with a preserved room). */
  disposePresentation(): void;
  /** Leave the match and the room (the Garage return without one, or an explicit leave). */
  closeMatch(reason?: string): void;
  /** An explicit leave from the lobby or the battle: the seat goes and the admin migrates at once. */
  leaveRoom(reason?: string): void;
  stats(): BrowserCompositionStats;
  dispose(): void;
}

// ------------------------------------------------------------ controls

const NAMED_ACTION_BITS: Readonly<Record<'reloadMagazine' | 'specialAction' | 'selfRight', number>> = Object.freeze({
  reloadMagazine: ACTION_BITS.RELOAD_MAGAZINE,
  specialAction: ACTION_BITS.SPECIAL_ACTION,
  selfRight: ACTION_BITS.SELF_RIGHT,
});
const CONSUMABLE_BITS = ACTION_BITS.REPAIR | ACTION_BITS.FIRST_AID | ACTION_BITS.EXTINGUISHER;
const DEFAULT_AIM_DISTANCE_M = 1000;
const MIN_AIM_DISTANCE_M = 0.01;
const MAX_AIM_DISTANCE_M = 2000;

function clampAimDistance(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AIM_DISTANCE_M;
  return Math.max(MIN_AIM_DISTANCE_M, Math.min(MAX_AIM_DISTANCE_M, value));
}

export interface ControlSampler {
  /** The viewer's controls for a tick from the own actor's input record (the rig writes its aim point every frame). */
  sample(tick: number): Readonly<ControlSample> | null;
  queueConsumable(slot: number): void;
  queueAction(action: 'reloadMagazine' | 'specialAction' | 'selfRight'): void;
  reset(): void;
}

/** v1's browser input frame over the own actor: throttle/steer/brake/fire/aim from the input record, action edges queued by the HUD. */
export function createControlSampler(getOwn: () => MatchActor | null): ControlSampler {
  let pendingBits = 0;
  const scratch: ControlSample = {
    throttle: 0, steer: 0, brake: false, fire: false, aimLocked: false,
    aimYaw: 0, aimPitch: 0, aimDistance: DEFAULT_AIM_DISTANCE_M, shellSlot: 0, actionPresses: 0,
  };
  return {
    sample() {
      const own = getOwn();
      if (!own || own.combat.destroyed) return null;
      const { input, state } = own;
      const pos = state.pos;
      const target = input.aimPoint;
      const dx = target ? target.x - pos.x : Math.sin(state.yaw) * DEFAULT_AIM_DISTANCE_M;
      const dy = target ? target.y - pos.y : 0;
      const dz = target ? target.z - pos.z : Math.cos(state.yaw) * DEFAULT_AIM_DISTANCE_M;
      const horizontal = Math.hypot(dx, dz);
      scratch.throttle = input.throttle || 0;
      scratch.steer = input.steer || 0;
      scratch.brake = !!input.brake;
      scratch.fire = !!input.fire;
      scratch.aimLocked = !!input.aimLocked;
      scratch.aimYaw = Math.atan2(dx, dz);
      scratch.aimPitch = Math.atan2(dy, Math.max(1e-6, horizontal));
      scratch.aimDistance = clampAimDistance(Math.hypot(horizontal, dy));
      scratch.shellSlot = input.shellSlot | 0;
      scratch.actionPresses = pendingBits;
      pendingBits = 0;
      return scratch;
    },
    queueConsumable(slot) {
      if (!Number.isInteger(slot) || slot < 0 || slot > 2) return;
      pendingBits |= (1 << slot) & CONSUMABLE_BITS;
    },
    queueAction(action) {
      const bit = NAMED_ACTION_BITS[action];
      if (bit) pendingBits |= bit;
    },
    reset() { pendingBits = 0; },
  };
}

// ------------------------------------------------------------ composition

interface ActiveRound {
  matchId: string;
  round: number;
  mapId: string;
  mode: string;
  spectator: boolean;
  viewerId: string;
  ownSpecId: string;
  presentation: BattlePresentation | null;
  controls: ControlSampler;
  welcome: WelcomeMessage | null;
  welcomed: boolean;
  activating: boolean;
  activated: boolean;
  revealed: boolean;
  failed: boolean;
  abort: AbortController;
  frames: number;
  ownShots: number;
  events: Record<string, number>;
  trace: BrowserLoadTrace;
  stageAt: number;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

function messageOf(error: RuntimeValue): string {
  return error instanceof Error ? error.message : String(error);
}

function reasonOf(error: RuntimeValue): string {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code: RuntimeValue }).code === 'string') {
    return (error as { code: string }).code;
  }
  return 'entry_failed';
}

class RoundSupersededError extends Error {
  readonly superseded = true;
  constructor(detail: string) { super(`multiplayer v2 round superseded: ${detail}`); this.name = 'RoundSupersededError'; }
}

function isSuperseded(error: RuntimeValue): boolean {
  return error instanceof RoundSupersededError;
}

const defaultFactories: BrowserCompositionFactories = {
  createSession: (options) => new MatchSession(options),
  createPresentation: (options) => createBattlePresentation(options),
};

function validatePorts(ports: BrowserCompositionPorts): void {
  const required: Array<[string, RuntimeValue]> = [
    ['lifecycle.run', ports.lifecycle?.run], ['lifecycle.coverRendering', ports.lifecycle?.coverRendering],
    ['lifecycle.uncoverRendering', ports.lifecycle?.uncoverRendering], ['lifecycle.primeReveal', ports.lifecycle?.primeReveal],
    ['load.battleLoad.show', ports.load?.battleLoad?.show], ['load.battleLoad.progress', ports.load?.battleLoad?.progress],
    ['load.battleLoad.hide', ports.load?.battleLoad?.hide], ['load.audio.resume', ports.load?.audio?.resume],
    ['load.audio.loadingOn', ports.load?.audio?.loadingOn], ['load.audio.ambientOn', ports.load?.audio?.ambientOn],
    ['load.lighting.setFarCascadeDormant', ports.load?.lighting?.setFarCascadeDormant],
    ['load.ensureBattleVisuals', ports.load?.ensureBattleVisuals], ['load.loadModules', ports.load?.loadModules],
    ['load.loadWorld', ports.load?.loadWorld], ['load.nextFrame', ports.load?.nextFrame],
    ['load.setAdaptiveSuspended', ports.load?.setAdaptiveSuspended],
    ['roster.getMap', ports.roster?.getMap], ['roster.rows', ports.roster?.rows], ['roster.vehicleName', ports.roster?.vehicleName],
    ['roster.emitBattleStart', ports.roster?.emitBattleStart], ['roster.setCamoBiome', ports.roster?.setCamoBiome],
    ['scene.getWorldCollision', ports.scene?.getWorldCollision], ['scene.groundSampler', ports.scene?.groundSampler],
    ['scene.getFx', ports.scene?.getFx], ['scene.resetRoundState', ports.scene?.resetRoundState],
    ['presentation.activate', ports.presentation?.activate], ['presentation.setWaitingForPeers', ports.presentation?.setWaitingForPeers],
    ['presentation.setGarageLighting', ports.presentation?.setGarageLighting],
    ['room.getMenu', ports.room?.getMenu], ['room.setGarageStatus', ports.room?.setGarageStatus], ['room.emitRoomState', ports.room?.emitRoomState],
    ['room.clearInput', ports.room?.clearInput], ['room.enterGarage', ports.room?.enterGarage], ['room.returnToGarage', ports.room?.returnToGarage],
    ['room.getPhase', ports.room?.getPhase], ['room.hasResult', ports.room?.hasResult],
  ];
  for (const [name, port] of required) {
    if (typeof port !== 'function') throw new TypeError(`multiplayer v2 browser composition requires the ${name} port`);
  }
  if (!ports.scene?.engineCtx || !ports.scene.game || !ports.scene.bus) throw new TypeError('multiplayer v2 browser composition requires engineCtx, game and bus');
}

function modeLabelFor(mode: string, round: number): string {
  const base = mode === 'lan' ? 'LAN Battle · Direct Wi-Fi' : 'Private Battle · Room Code';
  return round > 1 ? `${base} · Round ${round}` : base;
}

export function createBrowserComposition({
  ports,
  factories = {},
  clock = () => (typeof performance === 'object' ? performance.now() : Date.now()),
  clientBuild = 'dev',
  entryTimeoutMs = 120_000,
  schedule = (callback) => queueMicrotask(callback),
  reportError = (scope, error) => console.error(`[${scope}]`, error),
}: BrowserCompositionOptions): BrowserComposition {
  validatePorts(ports);
  const { lifecycle, load, roster, scene, presentation: activation, room: roomPorts } = ports;
  const warm = ports.warm ?? {};
  const createSession = factories.createSession ?? defaultFactories.createSession;
  const createPresentation = factories.createPresentation ?? defaultFactories.createPresentation;
  const now = load.now ?? clock;

  let roomSession: V2RoomSession | null = null;
  let session: SessionOwner | null = null;
  let round: ActiveRound | null = null;
  let latestLobby: SerializedLobby | null = null;
  let latestRoom: RoomSnapshot | null = null;
  let menuAttached = false;
  let roundsEntered = 0;
  let lastFailure: BrowserEntryFailure | null = null;
  let lastPumpMs: number | null = null;
  let disposed = false;
  let roomGeneration = 0;
  const subscriptions: Unsubscribe[] = [];
  const entryWaiters: Array<Deferred<boolean>> = [];

  const settleEntry = (entered: boolean): void => {
    for (const waiter of entryWaiters.splice(0)) waiter.resolve(entered);
  };

  const playerId = (): string => roomSession?.roomInfo.peerId ?? '';
  const roleOf = (): 'host' | 'client' => (latestRoom && latestRoom.adminId === playerId() ? 'host' : 'client');
  const roomMode = (): RoomMode => (roomSession?.roomInfo.mode === 'lan' ? 'lan' : 'private');

  // ------------------------------------------------------------ menu / garage presence

  const roomStatus = (snapshot: RoomSnapshot): BrowserGarageRoomStatus | null => {
    const me = snapshot.players.find((player) => player.id === playerId());
    if (!me) return null;
    const active = snapshot.players.filter((player) => player.team !== 'spectator');
    return {
      roomCode: snapshot.roomCode,
      mode: snapshot.mode,
      ready: me.ready,
      canSetReady: snapshot.phase === 'waiting' && me.team !== 'spectator' && !!me.specId && me.connected,
      readyCount: active.filter((player) => player.ready).length,
      total: active.length,
    };
  };

  /**
   * Show the lobby on the Play menu. Deferred while a battle is live without a
   * result (v1's rule: the invisible lobby DOM is not rebuilt at the final
   * combat snapshot); the attach releases the menu's acquisition so the
   * composition alone owns the seat from here on.
   */
  const syncMenu = (): void => {
    const current = roomSession;
    const lobby = latestLobby;
    if (!current || !lobby) return;
    if (roomPorts.getPhase() === 'battle' && !roomPorts.hasResult()) return;
    const menuPromise = roomPorts.getMenu();
    if (!menuPromise) return;
    const generation = roomGeneration;
    menuPromise.then((menu) => {
      if (roomSession !== current || generation !== roomGeneration || !latestLobby) return;
      if (menuAttached) { menu.updateActiveRoom(latestLobby); return; }
      menu.attachActiveRoom({
        state: latestLobby,
        playerId: playerId(),
        role: roleOf(),
        version: 2,
        command: (command) => (roomSession === current ? current.command(command) : false),
        leave: (reason) => { if (roomSession === current) leaveRoom(reason || 'left_room'); },
      });
      menuAttached = true;
    }).catch((error: RuntimeValue) => reportError('multiplayer v2 lobby', error));
  };

  const handleLobby = (lobby: SerializedLobby, snapshot: RoomSnapshot): void => {
    latestLobby = lobby;
    latestRoom = snapshot;
    roomPorts.setGarageStatus(roomStatus(snapshot));
    roomPorts.emitRoomState({ state: lobby, playerId: playerId(), role: roleOf() });
    syncMenu();
  };

  // ------------------------------------------------------------ the room's lifetime

  /**
   * Drop the room: the session owner (and with it the round's presentation), the
   * menu's lobby, the Garage status. A pending entry is settled here unless the
   * caller still owes it a covered Garage restore.
   */
  const releaseRoom = ({ settle = true }: { settle?: boolean } = {}): void => {
    const current = roomSession;
    if (!current) return;
    roomGeneration++;
    for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
    const owner = session;
    session = null;
    round = null;
    roomSession = null;
    latestLobby = null;
    latestRoom = null;
    owner?.dispose();
    if (settle) settleEntry(false);
    const wasAttached = menuAttached;
    menuAttached = false;
    roomPorts.setGarageStatus(null);
    roomPorts.emitRoomState(null);
    if (wasAttached) {
      roomPorts.getMenu()?.then((menu) => menu.detachActiveRoom()).catch(() => { /* the menu is optional */ });
    }
  };

  const closeRoom = (reason: string, release: { settle?: boolean } = {}): void => {
    const current = roomSession;
    if (!current) return;
    releaseRoom(release);
    const client = current.client;
    void client.leave().catch(() => { /* the socket may already be gone */ }).finally(() => { client.dispose(); void reason; });
  };

  const presentRoomFailure = (reason: string, mode: RoomMode): void => {
    const menuPromise = roomPorts.getMenu();
    if (!menuPromise) return;
    menuPromise.then((menu) => {
      // A newly joined room must never inherit a previous room's failure UI (the menu also skips intentional reasons).
      if (!roomSession) menu.showRoomFailure(reason, mode);
    }).catch((error: RuntimeValue) => reportError('multiplayer v2 failure', error));
  };

  /** The room went away under a loading round: restore the Garage under the cover, then settle the entry. */
  const restoreAfterLostRoom = (): Promise<void> => stopLoading()
    .catch((error: RuntimeValue) => reportError('multiplayer v2 room', error))
    .finally(() => settleEntry(false));

  /** The room is gone for this seat (kicked, expired, resume denied, transport exhausted, an explicit leave). */
  const handleRoomClosed = (reason: string): void => {
    const current = roomSession;
    if (!current) return;
    const mode = roomMode();
    const active = round;
    const loading = !!active && !active.revealed;
    const inBattle = roomPorts.getPhase() === 'battle' && !!active && active.revealed;
    lastFailure = active ? { message: reason, matchId: active.matchId, stage: loading ? 'loading' : 'battle', reason } : lastFailure;
    releaseRoom({ settle: !loading });
    current.client.dispose();
    if (loading) {
      void restoreAfterLostRoom().then(() => presentRoomFailure(reason, mode));
      return;
    }
    if (inBattle) {
      roomPorts.clearInput();
      void Promise.resolve(roomPorts.returnToGarage()).then(() => presentRoomFailure(reason, mode))
        .catch((error: RuntimeValue) => reportError('multiplayer v2 room', error));
      return;
    }
    presentRoomFailure(reason, mode);
  };

  const leaveRoom = (reason = 'left_room'): void => {
    const active = round;
    const loading = !!active && !active.revealed;
    const inBattle = roomPorts.getPhase() === 'battle' && !!active && active.revealed;
    if (loading || inBattle) roomPorts.clearInput();
    closeRoom(reason, { settle: !loading });
    if (loading) void restoreAfterLostRoom();
    else if (inBattle) {
      void Promise.resolve(roomPorts.returnToGarage()).catch((error: RuntimeValue) => reportError('multiplayer v2 leave', error));
    }
  };

  const adoptRoom = (next: V2RoomSession): SessionOwner => {
    roomGeneration++;
    roomSession = next;
    latestLobby = next.lobby;
    latestRoom = next.client.room;
    menuAttached = false;
    subscriptions.push(next.onLobby(handleLobby));
    subscriptions.push(next.onClosed(handleRoomClosed));
    const owner = createSession({
      room: next.client,
      createPresentation: createRoundPresentation,
      clock,
      clientBuild,
    });
    session = owner;
    subscriptions.push(owner.onPhase(handlePhase));
    subscriptions.push(owner.onVerdict(handleVerdict));
    subscriptions.push(owner.onFrame(handleFrame));
    owner.start();
    if (latestRoom) roomPorts.setGarageStatus(roomStatus(latestRoom));
    return owner;
  };

  // ------------------------------------------------------------ entry

  const showRoundLoad = (viewerId: string, players: BrowserRosterPlayer[], own: { team?: string } | null, mapId: string | null, mode: string, roundNumber: number, fallback: string): void => {
    const map = mapId ? roster.getMap(mapId) : { name: fallback, thumb: '', biome: 'none' };
    const displayTeam = own?.team === 'spectator' ? 'alpha' : String(own?.team || 'alpha');
    load.battleLoad.show({
      mapName: map.name,
      thumb: map.thumb,
      biome: mapId ? map.biome : 'none',
      mode: modeLabelFor(mode, roundNumber),
      allies: roster.rows(players, displayTeam, viewerId),
      enemies: roster.rows(players, displayTeam === 'alpha' ? 'bravo' : 'alpha', viewerId),
    });
  };

  const lobbyPlayers = (players: ReadonlyArray<{ id: string; specId?: string | null; team?: string; name?: string }> | undefined): BrowserRosterPlayer[] => (
    (players ?? []).filter((player) => !!player.specId).map((player) => ({ id: player.id, specId: String(player.specId), team: player.team, name: player.name }))
  );

  /** v1's `stopLoading`: reacquire opaque coverage, restore the Garage under it, then fade the loader. */
  const stopLoading = async (): Promise<void> => {
    if (!load.battleLoad.visible) {
      load.battleLoad.show({ mapName: 'Returning to Garage', thumb: '', biome: 'none', mode: 'Deployment ended', allies: [], enemies: [] });
    }
    load.battleLoad.progress(1, 'Restoring Garage');
    lifecycle.coverRendering();
    load.audio.loadingOn(false);
    await roomPorts.enterGarage();
    lifecycle.uncoverRendering();
    await load.nextFrame();
    await load.battleLoad.hide();
  };

  const finishTrace = (active: ActiveRound, status: 'complete' | 'failed'): void => {
    const at = now();
    active.trace.status = status;
    active.trace.endedAt = at;
    active.trace.totalMs = Math.round(at - active.trace.startedAt);
  };

  const markStage = (active: ActiveRound, stage: string): void => {
    const at = now();
    active.trace.stages[stage] = Math.round(at - active.stageAt);
    active.stageAt = at;
  };

  const failRound = async (active: ActiveRound, error: RuntimeValue, stage: string): Promise<void> => {
    if (active.failed) return;
    active.failed = true;
    if (!active.abort.signal.aborted) active.abort.abort(error);
    finishTrace(active, 'failed');
    const superseded = isSuperseded(error);
    if (!superseded) {
      lastFailure = { message: messageOf(error), matchId: active.matchId, stage, reason: reasonOf(error) };
      load.recordEntryFailure?.(lastFailure);
      reportError('multiplayer v2 entry', error);
    }
    if (round !== active) { settleEntry(false); return; }
    round = null;
    try {
      if (session) await session.leaveMatch(superseded ? 'superseded' : 'entry_failed');
      await stopLoading();
    } catch (restoreError) {
      reportError('multiplayer v2 entry', restoreError);
    } finally {
      settleEntry(false);
      if (!superseded) syncMenu();
    }
  };

  /** The MatchSession's `createPresentation`: the round's map, the battle presentation, the controls. */
  async function createRoundPresentation(sessionRound: SessionRound): Promise<SessionPresentation> {
    const current = roomSession;
    if (!current || disposed) throw new Error('multiplayer v2 room is not held');
    const { matchStart } = sessionRound;
    const viewerId = sessionRound.playerId;
    const ownPlayer = sessionRound.room.players.find((player) => player.id === viewerId) ?? null;
    const startedAt = now();
    const active: ActiveRound = {
      matchId: matchStart.matchId, round: matchStart.round, mapId: matchStart.mapId, mode: matchStart.mode,
      spectator: sessionRound.spectator, viewerId, ownSpecId: ownPlayer?.specId || (sessionRound.spectator ? 'spectator' : ''),
      presentation: null, controls: createControlSampler(() => active.presentation?.ownActor ?? null),
      welcome: null, welcomed: false, activating: false, activated: false, revealed: false, failed: false,
      abort: new AbortController(), frames: 0, ownShots: 0, events: {},
      trace: { version: 2, mode: modeLabelFor(sessionRound.room.mode, matchStart.round), map: matchStart.mapId, round: matchStart.round, stages: {}, startedAt, status: 'pending' },
      stageAt: startedAt,
    };
    round = active;
    roundsEntered++;
    load.recordEntryFailure?.(null);
    load.recordTrace?.(active.trace);
    const check = (detail: string): void => {
      if (active.abort.signal.aborted || round !== active || disposed) throw new RoundSupersededError(detail);
    };
    try {
      if (!active.spectator && !active.ownSpecId) throw new Error('The lobby vehicle selection is unavailable.');
      const terrainVariant: TerrainVariant = active.mode === 'frontline_assault' ? 'assault-trenches' : null;
      scene.resetRoundState();
      roster.setCamoBiome(active.mapId);
      roster.emitBattleStart({ playerId: viewerId, specId: active.ownSpecId, mapId: active.mapId });
      showRoundLoad(viewerId, lobbyPlayers(sessionRound.room.players), ownPlayer, active.mapId, sessionRound.room.mode, active.round, 'Battle');
      load.audio.resume();
      load.audio.loadingOn(true);
      load.lighting.setFarCascadeDormant(false);
      load.battleLoad.progress(0.02, 'Securing match channel');
      await load.nextFrame();
      check('cover');
      load.battleLoad.progress(0.08, 'Loading battlefield');
      await Promise.all([
        load.loadModules(),
        load.ensureBattleVisuals(),
        load.loadWorld(active.mapId, (fraction, label) => {
          if (round === active) load.battleLoad.progress(0.08 + fraction * 0.48, label);
        }, terrainVariant),
      ]);
      check('world');
      markStage(active, 'modulesAndWorld');
      const camoOf = new Map(sessionRound.room.players.map((player) => [player.id, player.camo || 'factory']));
      const battlePresentation = createPresentation({
        engineCtx: scene.engineCtx,
        game: scene.game,
        bus: scene.bus,
        spectator: active.spectator,
        worldCollision: scene.getWorldCollision(),
        clock,
        ...(scene.clearVehicleDecals ? { clearVehicleDecals: scene.clearVehicleDecals } : {}),
        ...(scene.onVisualReady ? { onVisualReady: scene.onVisualReady } : {}),
        camoFor: (entry) => camoOf.get(entry.playerId) ?? 'factory',
        onRosterProgress: (fraction, specId) => {
          if (round === active) load.battleLoad.progress(0.56 + fraction * 0.27, `Painting ${roster.vehicleName(specId)}`);
        },
      });
      active.presentation = battlePresentation;
      load.battleLoad.progress(0.56, 'Opening match channel');
      const sessionPresentation: SessionPresentation = {
        adapter: battlePresentation,
        controls: active.spectator ? null : active.controls.sample,
        prediction: null,
        onWelcome: async (welcome) => {
          try {
            active.welcome = welcome;
            await battlePresentation.rosterReady();
            check('roster');
            for (const actor of battlePresentation.actors.values()) actor.visual.setGroundSampler?.(scene.groundSampler);
            if (!active.spectator) {
              const own = battlePresentation.ownActor;
              if (!own) throw new Error('The local network vehicle is unavailable.');
              const world = battlePresentation.predictionWorld();
              if (world) sessionPresentation.prediction = { world, specFor: (specId) => (specId === own.specId ? own.spec : getSpec(specId)) };
            }
            markStage(active, 'roster');
            active.welcomed = true;
            load.battleLoad.progress(0.84, 'Synchronizing authority');
          } catch (error) {
            await failRound(active, error, 'roster');
            throw error;
          }
        },
        onVerdict: (verdict, reason) => { if (verdict !== VERDICT.NONE) battlePresentation.applyVerdict(verdict, reason); },
        dispose: () => {
          battlePresentation.dispose();
          if (round === active) round = null;
          if (!active.revealed) settleEntry(false);
        },
      };
      return sessionPresentation;
    } catch (error) {
      await failRound(active, error, 'world');
      throw error;
    }
  }

  /** The first frame with the roster in place: warm under the cover, activate, prove the frame, reveal. */
  const activateRound = async (active: ActiveRound): Promise<void> => {
    const battlePresentation = active.presentation;
    if (!battlePresentation) return;
    const signal = active.abort.signal;
    const view: BrowserWarmView = { entities: battlePresentation.actors };
    const check = (detail: string): void => {
      if (signal.aborted || round !== active || disposed) throw new RoundSupersededError(detail);
    };
    try {
      activation.setGarageLighting(false);
      await warm.atmosphere?.({ meta: { weatherSeed: active.welcome?.seed } });
      check('atmosphere');
      await warm.nightLighting?.();
      check('nightLighting');
      markStage(active, 'atmosphere');
      load.battleLoad.progress(0.845, 'Warming suspension terrain');
      await warm.terrain?.(view);
      check('terrain');
      markStage(active, 'terrainGrid');
      load.battleLoad.progress(0.85, 'Priming wreck variants');
      await warm.wrecks?.(view, signal);
      check('wrecks');
      markStage(active, 'wreckWarm');
      if (!active.spectator && battlePresentation.ownActor) {
        load.battleLoad.progress(0.86, 'Preparing player panel');
        await warm.playerPanel?.(view, active.viewerId);
        check('panel');
      }
      markStage(active, 'panel');
      load.battleLoad.progress(0.87, 'Compiling combat shaders');
      await load.nextFrame();
      check('compile');
      const compiled = await warm.compile?.(signal);
      check('compile');
      const preparation = compiled?.preparation;
      if (preparation && (preparation.status !== 'complete' || (preparation.pending ?? 0) !== 0)) {
        throw new Error('Battle shaders could not finish preparing. Please retry from the Garage.');
      }
      markStage(active, 'compile');
      load.battleLoad.progress(0.88, 'Priming combat effects');
      const fx = scene.getFx();
      await warm.openingEffects?.(fx, view, signal);
      check('openingEffects');
      warm.shotCards?.([...battlePresentation.actors.values()].map((actor) => actor.specId));
      markStage(active, 'combatWarm');
      activation.activate({
        viewerId: active.viewerId,
        own: { id: active.viewerId, specId: active.ownSpecId },
        spectator: active.spectator,
        mapId: active.mapId,
        bridge: {
          setPerspective: (entityId) => {
            const actor = entityId ? battlePresentation.actors.get(String(entityId)) : null;
            if (actor) battlePresentation.setPerspective(actor.entityId);
          },
        },
        fx,
      });
      active.activated = true;
      activation.setWaitingForPeers(false);
      markStage(active, 'activation');
      await warm.presentation?.(signal);
      check('openingGroundCover');
      if (!active.spectator) {
        await warm.finalShadows?.(signal);
        check('finalShadows');
      }
      markStage(active, 'finalShadows');
      if (activation.runBlackWatchdog) {
        let blackCheck: RuntimeValue;
        try {
          blackCheck = await activation.runBlackWatchdog(signal);
        } catch (error) {
          blackCheck = { failed: true, error: messageOf(error) };
        }
        active.trace.blackCheck = blackCheck;
        check('blackWatchdog');
        if (blackCheck && typeof blackCheck === 'object' && 'failed' in blackCheck && (blackCheck as { failed: RuntimeValue }).failed === true) {
          throw new Error('Battle graphics could not be verified. Please retry from the Garage.');
        }
      }
      markStage(active, 'blackWatchdog');
      load.audio.loadingOn(false);
      load.audio.ambientOn(true);
      load.battleLoad.progress(1, 'Ready');
      await lifecycle.primeReveal();
      check('reveal');
      markStage(active, 'primeReveal');
      await load.battleLoad.hide();
      check('loaderFade');
      markStage(active, 'loaderFade');
      load.setAdaptiveSuspended(false);
      active.revealed = true;
      finishTrace(active, 'complete');
      settleEntry(true);
    } catch (error) {
      await failRound(active, error, active.activated ? 'reveal' : 'warm');
    }
  };

  const countEvents = (active: ActiveRound, frame: MatchFrame): void => {
    active.frames++;
    for (const shot of frame.ownShots) {
      active.ownShots++;
      active.events[shot.event.kind] = (active.events[shot.event.kind] ?? 0) + 1;
    }
    for (const event of frame.events) active.events[event.kind] = (active.events[event.kind] ?? 0) + 1;
  };

  const handleFrame = (frame: MatchFrame): void => {
    const active = round;
    if (!active || !active.presentation) return;
    countEvents(active, frame);
    if (active.activating || !active.welcomed || active.failed) return;
    if (!active.spectator && !active.presentation.ownActor) return;
    active.activating = true;
    void activateRound(active);
  };

  const handlePhase = ({ phase, detail }: { phase: SessionPhase; detail: string }): void => {
    if (phase !== 'lost') return;
    const active = round;
    if (!active) return;
    if (active.revealed) {
      // A live round whose match link is exhausted ends as a disconnect once (the end overlay offers the Garage; the room stays).
      lastFailure = { message: detail || 'match_lost', matchId: active.matchId, stage: 'battle', reason: 'match_lost' };
      active.presentation?.endDisconnected();
      return;
    }
    void failRound(active, new Error(detail || 'The match link was lost while loading.'), 'connect');
  };

  const handleVerdict = (): void => {
    // The presentation already presented the verdict; the lobby follows on the room's next state.
    schedule(syncMenu);
  };

  const beginRoom = (request: BrowserLaunchRequest): Promise<boolean> => {
    if (disposed) return Promise.resolve(false);
    const candidate = request?.session;
    if (!isMultiplayerV2Session(candidate)) throw new TypeError('multiplayer v2 launch requires a v2 room session');
    if (roomSession && roomSession !== candidate) closeRoom('room_connection_superseded');
    return lifecycle.run(async () => {
      // The synchronous prefix mounts the opaque cover before the first await, like v1's launcher.
      lifecycle.coverRendering();
      scene.resetRoundState();
      const viewerId = candidate.roomInfo.peerId;
      const lobby = request.lobbyState ?? null;
      const players = lobbyPlayers(lobby?.players);
      const own = lobby?.players?.find((player) => player.id === viewerId) ?? null;
      const requestedMap = String(lobby?.mapId || candidate.lobby?.mapId || 'random');
      showRoundLoad(viewerId, players, own, requestedMap === 'random' ? null : requestedMap, String(lobby?.mode || candidate.roomInfo.mode), Number(lobby?.round) || 0, 'Random battlefield');
      load.battleLoad.progress(0.01, 'Opening battle channel');
      if (!roomSession) adoptRoom(candidate);
      if (round?.revealed) return true;
      const waiter = deferred<boolean>();
      entryWaiters.push(waiter);
      let timer: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), entryTimeoutMs); });
      const outcome = await Promise.race([waiter.promise, timeout]);
      if (timer) clearTimeout(timer);
      if (outcome !== 'timeout') return outcome;
      const active = round;
      if (active) {
        await failRound(active, new Error('The match did not present in time. Please retry from the room.'), 'timeout');
      } else {
        lastFailure = { message: 'The room did not start a match in time.', matchId: null, stage: 'start', reason: 'match_start_timeout' };
        load.recordEntryFailure?.(lastFailure);
        try { await stopLoading(); } catch (error) { reportError('multiplayer v2 entry', error); }
        settleEntry(false);
        syncMenu();
      }
      return false;
    }, false);
  };

  // ------------------------------------------------------------ frame hooks and garage return

  const pump = (dtSeconds: number, nowMs: number): void => {
    lastPumpMs = nowMs;
    session?.update(nowMs, Math.max(0, Math.min(0.25, dtSeconds)));
  };

  const pumpBackground = (nowMs: number): void => {
    const elapsedS = lastPumpMs === null ? 0 : Math.max(0, Math.min(0.25, (nowMs - lastPumpMs) / 1000));
    lastPumpMs = nowMs;
    session?.update(nowMs, elapsedS);
  };

  const disposePresentation = (): void => {
    const active = round;
    round = null;
    if (active) {
      active.abort.abort('returned_to_garage');
      if (!active.revealed) settleEntry(false);
    }
    if (session) void session.leaveMatch('returned_to_garage');
    // The Garage return sets the phase after this port; the lobby attaches once it has.
    schedule(syncMenu);
  };

  return {
    beginRoom,
    get active() { return round !== null; },
    get inMatch() { return !!round && round.activated; },
    get room() { return roomSession; },
    get session() { return session; },
    pump,
    pumpBackground,
    queueConsumable: (slot) => { round?.controls.queueConsumable(slot); },
    queueAction: (action) => { round?.controls.queueAction(action); },
    shouldPreserveRoom: () => !!roomSession && roomSession.client.phase !== 'closed',
    disposePresentation,
    closeMatch: (reason = 'network_match_closed') => { closeRoom(reason); },
    leaveRoom,
    stats: () => ({
      version: 2,
      active: round !== null,
      inMatch: !!round && round.activated,
      room: roomSession ? {
        roomCode: roomSession.roomInfo.roomCode,
        mode: roomMode(),
        adminId: latestRoom?.adminId ?? roomSession.roomInfo.hostId,
        phase: latestRoom?.phase ?? 'waiting',
        players: latestRoom?.players.length ?? 0,
        playerId: playerId(),
      } : null,
      session: session?.stats() ?? null,
      round: round ? {
        matchId: round.matchId, round: round.round, mapId: round.mapId, mode: round.mode, spectator: round.spectator,
        welcomed: round.welcomed, activated: round.activated, revealed: round.revealed, frames: round.frames,
        actors: round.presentation?.actors.size ?? 0, events: { ...round.events }, ownShots: round.ownShots,
      } : null,
      rounds: roundsEntered,
      lastFailure,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      closeRoom('dispose');
    },
  };
}
