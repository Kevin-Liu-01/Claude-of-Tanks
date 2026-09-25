/**
 * Typed message shapes of the Multiplayer v2 wire. Every numeric field is the
 * quantized integer that travels on the wire (see constants.ts and
 * quantize.ts); the simulation-unit conversions are the caller's.
 */
import type { CloseReasonId, MESSAGE_TYPE, MessageTypeId, PhaseId, TeamId, VerdictId } from './constants.ts';

export interface HelloMessage {
  type: typeof MESSAGE_TYPE.HELLO;
  protocolVersion: number;
  /** Bit set from HELLO_CAPABILITY. */
  capabilities: number;
  /** Seat token issued by the room service. */
  token: string;
  /** Free-form build stamp for logs (<= MAX_BUILD_BYTES). */
  clientBuild: string;
}

/** One tick of controls; ticks inside an INPUT frame are consecutive. */
export interface ControlFrame {
  /** i8: -127..127 (throttle / CONTROL_AXIS_SCALE). */
  throttle: number;
  steer: number;
  /** CONTROL_FLAGS bit set. */
  flags: number;
  /** u16 turn. */
  aimYaw: number;
  /** i16 over +-pi/2. */
  aimPitch: number;
  /** u16 in AIM_DISTANCE_SCALE units. */
  aimDistance: number;
  shellSlot: number;
  /** Monotonic per trigger press; the server fires once per new value. */
  fireSeq: number;
  /** Monotonic per action press; the server applies actionBits once per new value. */
  actionSeq: number;
  actionBits: number;
}

export interface InputMessage {
  type: typeof MESSAGE_TYPE.INPUT;
  /** Tick of the newest control; older controls are clientTick - n. */
  clientTick: number;
  /** Newest snapshot tick the client has assembled, or NO_TICK. */
  snapshotAckTick: number;
  /** The client's current interpolation delay (0..255 ms) for lag compensation. */
  interpDelayMs: number;
  /** Oldest first; 1..MAX_CONTROLS_PER_INPUT entries. */
  controls: ControlFrame[];
}

export interface SnapshotAckMessage {
  type: typeof MESSAGE_TYPE.SNAPSHOT_ACK;
  /** The newest assembled snapshot tick, or NO_TICK to drop the baseline and request a keyframe. */
  tick: number;
}

export interface PingMessage {
  type: typeof MESSAGE_TYPE.PING;
  clientTimeMs: number;
  snapshotAckTick: number;
}

export interface ChatMessage {
  type: typeof MESSAGE_TYPE.CHAT;
  text: string;
}

export interface LeaveMessage {
  type: typeof MESSAGE_TYPE.LEAVE;
  reason: CloseReasonId;
}

export interface RosterEntry {
  entityId: number;
  /** NO_SEAT for bots. */
  seat: number;
  team: TeamId;
  bot: boolean;
  connected: boolean;
  playerId: string;
  name: string;
  specId: string;
}

export interface WelcomeMessage {
  type: typeof MESSAGE_TYPE.WELCOME;
  protocolVersion: number;
  tickHz: number;
  snapshotHz: number;
  seat: number;
  /** NO_ENTITY for spectators. */
  entityId: number;
  team: TeamId;
  serverTick: number;
  serverTimeMs: number;
  seed: number;
  /** Capabilities the server honours (subset of HELLO's). */
  capabilities: number;
  roomId: string;
  mapId: string;
  mode: string;
  /** JSON text of the match ruleset (sim/matchRuleset.ts shape). */
  rulesetJson: string;
  roster: RosterEntry[];
}

/** Full quantized state of one entity as the wire carries it. */
export interface EntityRow {
  entityId: number;
  /** mm */
  x: number;
  y: number;
  z: number;
  /** cm/s along the hull yaw (signed) and vertical. */
  speed: number;
  verticalSpeed: number;
  /** u16 turns */
  yaw: number;
  pitch: number;
  roll: number;
  turretYaw: number;
  gunPitch: number;
  hp: number;
  maxHp: number;
  /** RELOAD_MS_UNITS steps */
  reload: number;
  reloadTotal: number;
  reloadKind: number;
  gunReload: number;
  gunReloadTotal: number;
  gunReloadKind: number;
  magazineRounds: number;
  magazineCapacity: number;
  shellSlot: number;
  ammo0: number;
  ammo1: number;
  ammo2: number;
  /** ENTITY_FLAGS bit set. */
  flags: number;
  /** Sorted spec-order ERA plate indices that have been spent. */
  eraSpent: number[];
}

/** A row as decoded from a snapshot: only the groups present on the wire. */
export interface EntityRowPatch {
  entityId: number;
  mask: number;
  fields: Partial<Omit<EntityRow, 'entityId' | 'eraSpent'>>;
  /** Status-word mirror bit (gun reload channel equals the main channel); null when STATUS is absent. */
  mirrors: boolean | null;
  /** With ROW_GROUP.ERA_ADD: indices to add; with ERA_RESET: the whole set. */
  era: number[] | null;
}

export interface ShellRow {
  id: number;
  shooterEntityId: number;
  x: number;
  y: number;
  z: number;
  /** SHELL_VELOCITY_SCALE units */
  vx: number;
  vy: number;
  vz: number;
  /** Index into SHELL_TYPE_NAMES or SHELL_TYPE_OTHER. */
  shellType: number;
  flags: number;
}

/** Viewer-only prediction authority for the seated player's own tank. */
export interface ViewerState {
  entityId: number;
  /** MODULE_STATE_NAMES index per VIEWER_MODULES entry. */
  modules: number[];
  /** bit i set = VIEWER_CREW[i] is able. */
  crewBits: number;
  /** MULTIPLIER_SCALE units per VIEWER_EQUIPMENT entry. */
  equipment: number[];
  modeSpeedMultiplier: number;
  modeGravityScale: number;
  /** Versioned movement integrator checkpoint (0 = absent). */
  movementVersion: number;
  movementFlags: number;
  movementValues: number[];
}

/** Match-wide state every snapshot carries. */
export interface SnapshotMeta {
  phase: PhaseId;
  countdownMs: number;
  battleTimeMs: number;
  verdict: VerdictId;
  verdictReason: string;
  destructibleRevision: number;
}

/** A snapshot as it travels: keyframe rows or patches against `baseTick`. */
export interface SnapshotPacket {
  type: typeof MESSAGE_TYPE.SNAPSHOT;
  tick: number;
  serverTimeMs: number;
  keyframe: boolean;
  /** NO_TICK on keyframes. */
  baseTick: number;
  ackedInputTick: number;
  ackedFireSeq: number;
  ackedActionSeq: number;
  /** Ticks of margin the newest input arrived with (negative = late); INPUT_MARGIN_UNKNOWN when unmeasured. */
  inputMarginTicks: number;
  meta: SnapshotMeta;
  /** Keyframe: the whole destroyed list; delta: indices destroyed since the baseline. */
  destroyed: number[];
  entities: EntityRowPatch[];
  /** Entity ids present in the baseline but hidden now (delta only). */
  removed: number[];
  shells: ShellRow[];
  viewer: ViewerState | null;
  /** JSON text of the mode presentation state, or null in standard mode. */
  modeStateJson: string | null;
}

/** A fully resolved snapshot (keyframe, or a delta applied to its baseline). */
export interface SnapshotFrame {
  tick: number;
  serverTimeMs: number;
  ackedInputTick: number;
  ackedFireSeq: number;
  ackedActionSeq: number;
  inputMarginTicks: number;
  meta: SnapshotMeta;
  /** Sorted destroyed obstacle indices (persistent within the round). */
  destroyed: number[];
  entities: EntityRow[];
  shells: ShellRow[];
  viewer: ViewerState | null;
  modeStateJson: string | null;
}

export interface WireEvent {
  /** Event type name (EVENT_KIND_NAMES entry or any other short name). */
  kind: string;
  /** Plain JSON object payload (<= MAX_EVENT_JSON_BYTES encoded). */
  payload: Record<string, unknown>;
}

export interface EventMessage {
  type: typeof MESSAGE_TYPE.EVENT;
  tick: number;
  events: WireEvent[];
}

export interface PongMessage {
  type: typeof MESSAGE_TYPE.PONG;
  clientTimeMs: number;
  serverTimeMs: number;
  serverTick: number;
}

export interface CloseMessage {
  type: typeof MESSAGE_TYPE.CLOSE;
  reason: CloseReasonId;
  detail: string;
}

export interface ErrorMessage {
  type: typeof MESSAGE_TYPE.ERROR;
  reason: CloseReasonId;
  detail: string;
}

export type ClientMessage =
  | HelloMessage | InputMessage | SnapshotAckMessage | PingMessage | ChatMessage | LeaveMessage;
export type ServerMessage =
  | WelcomeMessage | SnapshotPacket | EventMessage | PongMessage | CloseMessage | ErrorMessage;
export type WireMessage = ClientMessage | ServerMessage;

export type MessageOfType<T extends MessageTypeId> = Extract<WireMessage, { type: T }>;
