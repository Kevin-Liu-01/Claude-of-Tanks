import type { RuntimeValue } from '../runtimeTypes.ts';
const POSITION_SCALE = 100;      // centimeters
const VELOCITY_SCALE = 100;      // centimeters / second
const ANGLE_SCALE = 32767 / Math.PI;
const MAX_ENTITIES = 32;
const MAX_SHELLS = 256;
const REST_SPEED_MPS = 0.08;
const REST_HORIZONTAL_DEADZONE_M = 0.025;
const REST_VERTICAL_DEADZONE_M = 0.025;
const REST_YAW_DEADZONE_RAD = 0.00035;
const REST_TILT_DEADZONE_RAD = 0.0035;
const DELAY_ATTACK_FRACTION = 0.5;
const DELAY_RELEASE_FRACTION = 0.1;
const MAX_SAMPLE_DELTA_MS = 250;
const IMMEDIATE_CORRECTION_RATE_MPS = 6;
const IMMEDIATE_CORRECTION_STEP_M = 0.2;
const IMMEDIATE_TELEPORT_M = 8;
const OBJECTIVE_TELEPORT_FLOOR_M = 8;
const OBJECTIVE_TELEPORT_SPEED_MULTIPLIER = 3;
const REST_POSE = Symbol('networkRestPose');
const ENTITY_DELTA_FIELDS = Object.freeze([
  'id', 'specId', 'team',
  'x', 'y', 'z', 'vx', 'vy', 'vz',
  'yaw', 'pitch', 'roll', 'turretYaw', 'gunPitch',
  'hp', 'maxHp', 'reloadMs', 'reloadTotalMs', 'reloadKind',
  'gunReloadMs', 'gunReloadTotalMs', 'gunReloadKind',
  'magazineRounds', 'magazineCapacity', 'shellSlot',
  'ammo0', 'ammo1', 'ammo2', 'flags', 'eraSpent',
] as const);

const SNAPSHOT_RELOAD_KINDS = Object.freeze({
  ready: 0,
  shell: 1,
  intraClip: 2,
  magazine: 3,
});
const SNAPSHOT_RELOAD_KIND_NAMES = Object.freeze([
  'ready', 'shell', 'intraClip', 'magazine',
] as const);

export const SNAPSHOT_FLAGS = Object.freeze({
  DESTROYED: 1 << 0,
  BURNING: 1 << 1,
  FIRING: 1 << 2,
  SPOTTED: 1 << 3,
  SPECIAL_ACTIVE: 1 << 4,
  SPECIAL_PENDING: 1 << 5,
  AIRBORNE: 1 << 6,
  OVERTURNED: 1 << 7,
  AUTO_RIGHTING: 1 << 8,
});

type ReloadKindName = 'ready' | 'shell' | 'intraClip' | 'magazine';
type VectorAxis = 0 | 1 | 2;

interface SnapshotStateSource {
  pos?: RuntimeValue;
  speed?: RuntimeValue;
  yaw?: RuntimeValue;
  verticalSpeed?: RuntimeValue;
  visualPitch?: RuntimeValue;
  visualRoll?: RuntimeValue;
  turretYaw?: RuntimeValue;
  gunPitch?: RuntimeValue;
  grounded?: boolean;
  overturned?: boolean;
  _body?: { autoRighting?: boolean } | null;
  _ride?: { v?: RuntimeValue } | null;
}

interface SnapshotCombatSource {
  destroyed?: boolean;
  fire?: { burning?: boolean } | null;
  hp?: RuntimeValue;
  maxHp?: RuntimeValue;
  reload?: { t?: RuntimeValue; totalS?: RuntimeValue; kind?: RuntimeValue } | null;
  gunReload?: { t?: RuntimeValue; totalS?: RuntimeValue; kind?: RuntimeValue } | null;
  magazine?: { rounds?: RuntimeValue; capacity?: RuntimeValue } | null;
  shellSlot?: RuntimeValue;
  ammo?: RuntimeValue[] | null;
  eraSpent?: Set<string> | null;
}

export interface SnapshotEntitySource {
  id?: RuntimeValue;
  specId?: RuntimeValue;
  spec?: { id?: RuntimeValue } | null;
  team?: RuntimeValue;
  spotted?: boolean;
  state?: SnapshotStateSource | null;
  combat?: SnapshotCombatSource | null;
  input?: { fire?: boolean } | null;
  specialAction?: { active?: boolean } | null;
}

export interface SnapshotShellSource {
  id?: RuntimeValue;
  shooterId?: RuntimeValue;
  dead?: boolean;
  pos?: RuntimeValue;
  vel?: RuntimeValue;
  spec?: { type?: RuntimeValue; guided?: boolean } | null;
}

export interface QuantizedEntitySnapshot {
  id: string;
  specId: string;
  team: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  roll: number;
  turretYaw: number;
  gunPitch: number;
  hp: number;
  maxHp: number;
  reloadMs: number;
  reloadTotalMs: number;
  reloadKind: number;
  gunReloadMs: number;
  gunReloadTotalMs: number;
  gunReloadKind: number;
  magazineRounds: number;
  magazineCapacity: number;
  shellSlot: number;
  ammo0: number;
  ammo1: number;
  ammo2: number;
  flags: number;
  eraSpent?: string[];
}

export interface QuantizedShellSnapshot {
  id: number;
  shooterId: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  type: string;
  guided: boolean;
}

export interface WorldSnapshot {
  tick: number;
  serverTimeMs: number;
  ackInputSeq: number | null;
  entities: QuantizedEntitySnapshot[];
  shells: QuantizedShellSnapshot[];
  events: RuntimeValue[];
  meta: Record<string, RuntimeValue> | null;
}

export interface SnapshotPacket extends WorldSnapshot {
  baseTick?: number;
  removedEntityIds?: string[];
}

export interface DecodedEntitySnapshot {
  id: string;
  specId: string;
  team: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  roll: number;
  turretYaw: number;
  gunPitch: number;
  hp: number;
  maxHp: number;
  reloadS: number;
  reloadTotalS: number;
  reloadKind: ReloadKindName;
  gunReloadS: number;
  gunReloadTotalS: number;
  gunReloadKind: ReloadKindName;
  magazineRounds: number;
  magazineCapacity: number;
  shellSlot: number;
  ammo0: number;
  ammo1: number;
  ammo2: number;
  flags: number;
  eraSpent: string[];
  [REST_POSE]?: RestPose;
}

interface RestPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
}

export interface ImmediateAuthoritySnapshot {
  tick: number;
  serverTimeMs: number;
  ackInputSeq: number | null;
  entity: DecodedEntitySnapshot;
}

export interface SampledSnapshotFrame {
  tick: number;
  serverTimeMs: number;
  ackInputSeq: number | null;
  entities: DecodedEntitySnapshot[];
  shells: QuantizedShellSnapshot[];
  events: RuntimeValue[];
  meta: Record<string, RuntimeValue> | null;
  immediateAuthority: ImmediateAuthoritySnapshot | null;
}

export interface CaptureWorldSnapshotOptions {
  tick?: number;
  serverTimeMs?: number;
  entities?: Iterable<SnapshotEntitySource> | null;
  shells?: Iterable<SnapshotShellSource> | null;
  events?: RuntimeValue[] | null;
  viewerId?: RuntimeValue;
  ackInputSeq?: number | null;
  canObserve?: (viewerId: string, entity: SnapshotEntitySource) => boolean;
  canObserveShell?: (viewerId: string, shell: SnapshotShellSource) => boolean;
  canObserveEvent?: (viewerId: string, event: RuntimeValue) => boolean;
  meta?: Record<string, RuntimeValue> | null;
}

function finite(value: RuntimeValue, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function runtimeRecord(value: RuntimeValue): Record<string, RuntimeValue> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, RuntimeValue>
    : null;
}

function overwriteRecord(
  target: Record<string, RuntimeValue>,
  source: Record<string, RuntimeValue>,
): void {
  for (const key in target) {
    if (!Object.hasOwn(source, key)) delete target[key];
  }
  Object.assign(target, source);
}

function quantize(value: RuntimeValue, scale: number): number {
  return Math.round(finite(value) * scale);
}

function quantizeAngle(value: RuntimeValue): number {
  let angle = finite(value);
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return Math.round(angle * ANGLE_SCALE);
}

function dequantizeAngle(value: number): number {
  return value / ANGLE_SCALE;
}

function vectorAxis(vector: RuntimeValue, axis: VectorAxis): number {
  if (Array.isArray(vector)) return finite(vector[axis]);
  if (!vector || typeof vector !== 'object') return 0;
  return finite((vector as Record<string, RuntimeValue>)[axis === 0 ? 'x' : axis === 1 ? 'y' : 'z']);
}

function entityFlags(entity: SnapshotEntitySource): number {
  let flags = 0;
  const combat = entity.combat || {};
  if (combat.destroyed) flags |= SNAPSHOT_FLAGS.DESTROYED;
  if (combat.fire && combat.fire.burning) flags |= SNAPSHOT_FLAGS.BURNING;
  if (entity.input && entity.input.fire) flags |= SNAPSHOT_FLAGS.FIRING;
  if (entity.spotted) flags |= SNAPSHOT_FLAGS.SPOTTED;
  if (entity.specialAction?.active) flags |= SNAPSHOT_FLAGS.SPECIAL_ACTIVE;
  if (entity.state?.grounded === false) flags |= SNAPSHOT_FLAGS.AIRBORNE;
  if (entity.state?.overturned) flags |= SNAPSHOT_FLAGS.OVERTURNED;
  if (entity.state?._body?.autoRighting) flags |= SNAPSHOT_FLAGS.AUTO_RIGHTING;
  return flags;
}

/** Capture one active tank without retaining mutable simulation objects. */
export function captureEntitySnapshot(
  entity: SnapshotEntitySource | null | undefined,
): QuantizedEntitySnapshot | null {
  if (!entity || !entity.state || !entity.combat) return null;
  const state = entity.state;
  const speed = finite(state.speed);
  const yaw = finite(state.yaw);
  const reloadKind = typeof entity.combat.reload?.kind === 'string'
    ? entity.combat.reload.kind
    : 'ready';
  const gunReload = entity.combat.gunReload || entity.combat.reload;
  const gunReloadKind = typeof gunReload?.kind === 'string' ? gunReload.kind : 'ready';
  const snapshot: QuantizedEntitySnapshot = {
    id: String(entity.id),
    specId: String(entity.specId || (entity.spec && entity.spec.id) || ''),
    team: String(entity.team || ''),
    x: quantize(vectorAxis(state.pos, 0), POSITION_SCALE),
    y: quantize(vectorAxis(state.pos, 1), POSITION_SCALE),
    z: quantize(vectorAxis(state.pos, 2), POSITION_SCALE),
    vx: quantize(Math.sin(yaw) * speed, VELOCITY_SCALE),
    vy: quantize(finite(state.verticalSpeed, finite(state._ride?.v)), VELOCITY_SCALE),
    vz: quantize(Math.cos(yaw) * speed, VELOCITY_SCALE),
    yaw: quantizeAngle(yaw),
    pitch: quantizeAngle(state.visualPitch),
    roll: quantizeAngle(state.visualRoll),
    turretYaw: quantizeAngle(state.turretYaw),
    gunPitch: quantizeAngle(state.gunPitch),
    hp: Math.max(0, Math.round(finite(entity.combat.hp))),
    maxHp: Math.max(1, Math.round(finite(entity.combat.maxHp, 1))),
    reloadMs: Math.max(0, Math.round(finite(entity.combat.reload && entity.combat.reload.t) * 1000)),
    reloadTotalMs: Math.max(0, Math.round(finite(
      entity.combat.reload && entity.combat.reload.totalS,
    ) * 1000)),
    reloadKind: SNAPSHOT_RELOAD_KINDS[reloadKind as keyof typeof SNAPSHOT_RELOAD_KINDS] ?? 0,
    gunReloadMs: Math.max(0, Math.round(finite(gunReload?.t) * 1000)),
    gunReloadTotalMs: Math.max(0, Math.round(finite(gunReload?.totalS) * 1000)),
    gunReloadKind:
      SNAPSHOT_RELOAD_KINDS[gunReloadKind as keyof typeof SNAPSHOT_RELOAD_KINDS] ?? 0,
    magazineRounds: Math.max(0, Number(entity.combat.magazine?.rounds) | 0),
    magazineCapacity: Math.max(0, Number(entity.combat.magazine?.capacity) | 0),
    shellSlot: Math.max(0, Math.min(2, Number(entity.combat.shellSlot) | 0)),
    ammo0: Math.max(0, Number(entity.combat.ammo?.[0]) | 0),
    ammo1: Math.max(0, Number(entity.combat.ammo?.[1]) | 0),
    ammo2: Math.max(0, Number(entity.combat.ammo?.[2]) | 0),
    flags: entityFlags(entity),
  };
  if (entity.combat.eraSpent?.size) {
    snapshot.eraSpent = [...entity.combat.eraSpent].sort();
  }
  return snapshot;
}

function captureShellSnapshot(
  shell: SnapshotShellSource | null | undefined,
): QuantizedShellSnapshot | null {
  if (!shell || shell.dead || !shell.pos) return null;
  return {
    id: Number(shell.id) || 0,
    shooterId: String(shell.shooterId || ''),
    x: quantize(vectorAxis(shell.pos, 0), POSITION_SCALE),
    y: quantize(vectorAxis(shell.pos, 1), POSITION_SCALE),
    z: quantize(vectorAxis(shell.pos, 2), POSITION_SCALE),
    vx: quantize(vectorAxis(shell.vel, 0), VELOCITY_SCALE),
    vy: quantize(vectorAxis(shell.vel, 1), VELOCITY_SCALE),
    vz: quantize(vectorAxis(shell.vel, 2), VELOCITY_SCALE),
    type: String((shell.spec && shell.spec.type) || ''),
    guided: shell.spec?.guided === true,
  };
}

function requireUnsignedTick(tick: number | undefined): asserts tick is number {
  if (typeof tick !== 'number' || !Number.isSafeInteger(tick) || tick < 0) {
    throw new TypeError('tick must be unsigned');
  }
}

function requireServerTime(serverTimeMs: number | undefined): asserts serverTimeMs is number {
  if (typeof serverTimeMs !== 'number' || !Number.isFinite(serverTimeMs) || serverTimeMs < 0) {
    throw new TypeError('serverTimeMs must be non-negative');
  }
}

function captureVisibleEntities(
  entities: Iterable<SnapshotEntitySource> | null | undefined,
  viewer: string,
  canObserve: (viewerId: string, entity: SnapshotEntitySource) => boolean,
): QuantizedEntitySnapshot[] {
  const visible: QuantizedEntitySnapshot[] = [];
  for (const entity of entities || []) {
    if (visible.length >= MAX_ENTITIES) break;
    if (!entity || (entity.id !== viewer && !canObserve(viewer, entity))) continue;
    const captured = captureEntitySnapshot(entity);
    if (captured) visible.push(captured);
  }
  return visible;
}

function captureVisibleShells(
  shells: Iterable<SnapshotShellSource> | null | undefined,
  viewer: string,
  canObserveShell: (viewerId: string, shell: SnapshotShellSource) => boolean,
): QuantizedShellSnapshot[] {
  const visible: QuantizedShellSnapshot[] = [];
  for (const shell of shells || []) {
    if (visible.length >= MAX_SHELLS) break;
    if (!canObserveShell(viewer, shell)) continue;
    const captured = captureShellSnapshot(shell);
    if (captured) visible.push(captured);
  }
  return visible;
}

/**
 * Build a viewer-specific authoritative snapshot.
 *
 * `canObserve` is a security policy, not a rendering optimization: hidden
 * enemies are omitted before serialization so clients cannot mine positions.
 */
export function captureWorldSnapshot({
  tick,
  serverTimeMs,
  entities,
  shells = [],
  events = [],
  viewerId,
  ackInputSeq = 0,
  canObserve = () => true,
  canObserveShell = () => true,
  canObserveEvent = () => true,
  meta = null,
}: CaptureWorldSnapshotOptions = {}): WorldSnapshot {
  requireUnsignedTick(tick);
  requireServerTime(serverTimeMs);
  const viewer = String(viewerId || '');
  return {
    tick,
    serverTimeMs: Math.round(serverTimeMs),
    ackInputSeq,
    entities: captureVisibleEntities(entities, viewer, canObserve),
    shells: captureVisibleShells(shells, viewer, canObserveShell),
    events: (events || []).filter((event) => canObserveEvent(viewer, event)),
    meta: meta && typeof meta === 'object' ? { ...meta } : null,
  };
}

function sameStringArray(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function sameEntitySnapshot(
  a: QuantizedEntitySnapshot | null | undefined,
  b: QuantizedEntitySnapshot | null | undefined,
): boolean {
  if (!a || !b) return false;
  for (const field of ENTITY_DELTA_FIELDS) {
    if (field === 'eraSpent') {
      if (!sameStringArray(a.eraSpent, b.eraSpent)) return false;
      continue;
    }
    if (a[field] !== b[field]) return false;
  }
  return true;
}

function requireSnapshotPacket(packetValue: object): SnapshotPacket {
  const candidate = packetValue as { tick?: number; entities?: object[] };
  if (!Number.isSafeInteger(candidate.tick) || !Array.isArray(candidate.entities)) {
    throw new TypeError('invalid snapshot packet');
  }
  return packetValue as SnapshotPacket;
}

function requireBaselineTick(baseTick: number, packetTick: number): void {
  if (!Number.isSafeInteger(baseTick) || baseTick < 0 || baseTick >= packetTick) {
    throw new TypeError('invalid snapshot baseline tick');
  }
}

function applyEntityDelta(
  baseline: WorldSnapshot,
  packet: SnapshotPacket,
): QuantizedEntitySnapshot[] {
  const byId = new Map(baseline.entities.map((entity) => [entity.id, entity]));
  for (const id of packet.removedEntityIds || []) byId.delete(String(id));
  for (const entity of packet.entities) byId.set(entity.id, entity);
  return [...byId.values()];
}

/**
 * Encode a viewer-specific full snapshot against an acknowledged full
 * baseline. Shells and events stay self-contained because they are transient;
 * stable tank state is reduced to changed rows plus explicit removals.
 */
export function createSnapshotDelta(
  current: WorldSnapshot,
  baseline: WorldSnapshot | null = null,
): SnapshotPacket {
  if (!current || !Number.isSafeInteger(current.tick) || !Array.isArray(current.entities)) {
    throw new TypeError('current full snapshot is required');
  }
  if (!baseline) {
    return { ...current, baseTick: -1, removedEntityIds: [] };
  }
  if (!Number.isSafeInteger(baseline.tick) || !Array.isArray(baseline.entities) ||
      baseline.tick >= current.tick) {
    throw new TypeError('baseline must be an older full snapshot');
  }
  const baselineById = new Map(baseline.entities.map((entity) => [entity.id, entity]));
  const currentIds = new Set<string>();
  const changed: QuantizedEntitySnapshot[] = [];
  for (const entity of current.entities) {
    currentIds.add(entity.id);
    if (!sameEntitySnapshot(entity, baselineById.get(entity.id))) changed.push(entity);
  }
  const removedEntityIds: string[] = [];
  for (const entity of baseline.entities) {
    if (!currentIds.has(entity.id)) removedEntityIds.push(entity.id);
  }
  return {
    ...current,
    baseTick: baseline.tick,
    entities: changed,
    removedEntityIds,
  };
}

/** Reconstruct ACK-based deltas into full snapshots for the jitter buffer. */
export class SnapshotAssembler {
  readonly capacity: number;
  private readonly history = new Map<number, WorldSnapshot>();

  constructor({ capacity = 96 }: { capacity?: number } = {}) {
    if (!Number.isInteger(capacity) || capacity < 2) {
      throw new TypeError('snapshot assembler capacity must be at least two');
    }
    this.capacity = capacity;
  }

  accept(packetValue: RuntimeValue): WorldSnapshot | null {
    if (!packetValue || typeof packetValue !== 'object' || Array.isArray(packetValue)) {
      throw new TypeError('invalid snapshot packet');
    }
    // The packet is an untrusted transport boundary. The assembler validates
    // the framing fields it consumes before adopting the typed wire shape;
    // entity decoding performs the remaining finite/range normalization.
    const packet = requireSnapshotPacket(packetValue);
    const baseTick = packet.baseTick == null ? -1 : packet.baseTick;
    let entities: QuantizedEntitySnapshot[];
    if (baseTick === -1) {
      entities = packet.entities.slice();
    } else {
      requireBaselineTick(baseTick, packet.tick);
      const baseline = this.history.get(baseTick);
      if (!baseline) return null;
      entities = applyEntityDelta(baseline, packet);
    }
    const full = {
      tick: packet.tick,
      serverTimeMs: packet.serverTimeMs,
      ackInputSeq: packet.ackInputSeq,
      entities,
      shells: Array.isArray(packet.shells) ? packet.shells : [],
      events: Array.isArray(packet.events) ? packet.events : [],
      meta: packet.meta && typeof packet.meta === 'object' ? packet.meta : null,
    };
    this.history.set(full.tick, full);
    this.trimHistory();
    return full;
  }

  private trimHistory(): void {
    while (this.history.size > this.capacity) {
      const oldestTick = this.history.keys().next().value;
      if (oldestTick == null) return;
      this.history.delete(oldestTick);
    }
  }

  clear(): void { this.history.clear(); }
}

export function decodeEntitySnapshot(
  entity: QuantizedEntitySnapshot,
  target: DecodedEntitySnapshot | null = null,
): DecodedEntitySnapshot {
  const out = target || {} as DecodedEntitySnapshot;
  out.id = entity.id;
  out.specId = entity.specId;
  out.team = entity.team;
  out.x = entity.x / POSITION_SCALE;
  out.y = entity.y / POSITION_SCALE;
  out.z = entity.z / POSITION_SCALE;
  out.vx = entity.vx / VELOCITY_SCALE;
  out.vy = finite(entity.vy) / VELOCITY_SCALE;
  out.vz = entity.vz / VELOCITY_SCALE;
  out.yaw = dequantizeAngle(entity.yaw);
  out.pitch = dequantizeAngle(entity.pitch);
  out.roll = dequantizeAngle(entity.roll);
  out.turretYaw = dequantizeAngle(entity.turretYaw);
  out.gunPitch = dequantizeAngle(entity.gunPitch);
  out.hp = entity.hp;
  out.maxHp = entity.maxHp;
  out.reloadS = finite(entity.reloadMs) / 1000;
  out.reloadTotalS = finite(entity.reloadTotalMs, entity.reloadMs) / 1000;
  out.reloadKind = SNAPSHOT_RELOAD_KIND_NAMES[entity.reloadKind | 0] || 'ready';
  out.gunReloadS = finite(entity.gunReloadMs, entity.reloadMs) / 1000;
  out.gunReloadTotalS = finite(
    entity.gunReloadTotalMs,
    entity.gunReloadMs ?? entity.reloadTotalMs,
  ) / 1000;
  out.gunReloadKind = SNAPSHOT_RELOAD_KIND_NAMES[
    (entity.gunReloadKind ?? entity.reloadKind) | 0
  ] || 'ready';
  out.magazineRounds = Math.max(0, entity.magazineRounds | 0);
  out.magazineCapacity = Math.max(0, entity.magazineCapacity | 0);
  out.shellSlot = entity.shellSlot;
  out.ammo0 = Math.max(0, entity.ammo0 | 0);
  out.ammo1 = Math.max(0, entity.ammo1 | 0);
  out.ammo2 = Math.max(0, entity.ammo2 | 0);
  out.flags = entity.flags;
  out.eraSpent = Array.isArray(entity.eraSpent) ? entity.eraSpent : [];
  return out;
}

function shortestAngleDelta(from: number, to: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function lerpAngle(a: number, b: number, t: number): number {
  return a + shortestAngleDelta(a, b) * t;
}

function hermite(
  p0: number,
  v0: number,
  p1: number,
  v1: number,
  t: number,
  durationS: number,
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * p0 + h10 * durationS * v0 + h01 * p1 + h11 * durationS * v1;
}

function sameObjectiveScore(
  a: Record<string, RuntimeValue>,
  b: Record<string, RuntimeValue>,
): boolean {
  const aScore = runtimeRecord(a.score);
  const bScore = runtimeRecord(b.score);
  return !!aScore && !!bScore && finite(aScore.alpha) === finite(bScore.alpha) &&
    finite(aScore.bravo) === finite(bScore.bravo);
}

function canInterpolateBall(
  a: Record<string, RuntimeValue>,
  b: Record<string, RuntimeValue>,
  durationS: number,
): boolean {
  if (!(durationS > 0)) return false;
  const distance = Math.hypot(
    finite(b.x) - finite(a.x),
    finite(b.y) - finite(a.y),
    finite(b.z) - finite(a.z),
  );
  const speed = Math.max(
    Math.hypot(finite(a.vx), finite(a.vy), finite(a.vz)),
    Math.hypot(finite(b.vx), finite(b.vy), finite(b.vz)),
  );
  return distance <= Math.max(
    OBJECTIVE_TELEPORT_FLOOR_M,
    speed * durationS * OBJECTIVE_TELEPORT_SPEED_MULTIPLIER,
  );
}

// Grounded support samples can change which wheel/track probe owns the
// chassis floor. Their reported vertical velocity remains useful as a tangent
// but is not allowed to overshoot the two authoritative heights. Airborne
// motion keeps ordinary Hermite so ballistic arcs remain velocity-correct.
function monotoneHermite(
  p0: number,
  v0: number,
  p1: number,
  v1: number,
  t: number,
  durationS: number,
): number {
  if (!(durationS > 0)) return p1;
  const slope = (p1 - p0) / durationS;
  if (Math.abs(slope) < 1e-8) return p0;
  let m0 = v0 * slope > 0 ? v0 : 0;
  let m1 = v1 * slope > 0 ? v1 : 0;
  const alpha = m0 / slope;
  const beta = m1 / slope;
  const magnitude = alpha * alpha + beta * beta;
  if (magnitude > 9) {
    const scale = 3 / Math.sqrt(magnitude);
    m0 = scale * alpha * slope;
    m1 = scale * beta * slope;
  }
  return hermite(p0, m0, p1, m1, t, durationS);
}

function interpolateEntity(
  aRaw: QuantizedEntitySnapshot,
  bRaw: QuantizedEntitySnapshot,
  t: number,
  durationS: number,
  target: DecodedEntitySnapshot | null = null,
  scratchA: DecodedEntitySnapshot | null = null,
  scratchB: DecodedEntitySnapshot | null = null,
): DecodedEntitySnapshot {
  const a = decodeEntitySnapshot(aRaw, scratchA);
  const b = decodeEntitySnapshot(bRaw, scratchB);
  const out = decodeEntitySnapshot(bRaw, target);
  // Snapshot velocity is a tangent, not permission to leave the interval.
  // Contacts can stop or redirect a tank between packets while the older
  // sample still carries its pre-impact speed. Monotone axes prevent that
  // stale tangent from overshooting and then visibly reversing the chassis.
  out.x = monotoneHermite(a.x, a.vx, b.x, b.vx, t, durationS);
  const grounded = !(a.flags & SNAPSHOT_FLAGS.AIRBORNE) &&
    !(b.flags & SNAPSHOT_FLAGS.AIRBORNE);
  out.y = grounded
    ? monotoneHermite(a.y, a.vy, b.y, b.vy, t, durationS)
    : hermite(a.y, a.vy, b.y, b.vy, t, durationS);
  out.z = monotoneHermite(a.z, a.vz, b.z, b.vz, t, durationS);
  out.vx = a.vx + (b.vx - a.vx) * t;
  out.vy = a.vy + (b.vy - a.vy) * t;
  out.vz = a.vz + (b.vz - a.vz) * t;
  out.yaw = lerpAngle(a.yaw, b.yaw, t);
  out.pitch = lerpAngle(a.pitch, b.pitch, t);
  out.roll = lerpAngle(a.roll, b.roll, t);
  out.turretYaw = lerpAngle(a.turretYaw, b.turretYaw, t);
  out.gunPitch = lerpAngle(a.gunPitch, b.gunPitch, t);
  out.reloadS = a.reloadS + (b.reloadS - a.reloadS) * t;
  return out;
}

function extrapolateEntity(
  raw: QuantizedEntitySnapshot,
  extraS: number,
  target: DecodedEntitySnapshot | null = null,
): DecodedEntitySnapshot {
  const entity = decodeEntitySnapshot(raw, target);
  entity.x += entity.vx * extraS;
  entity.y += entity.vy * extraS;
  entity.z += entity.vz * extraS;
  entity.reloadS = Math.max(0, entity.reloadS - extraS);
  return entity;
}

/**
 * Keep a non-rendering client's owned sample continuous when a newly arrived
 * authority packet corrects the prior extrapolation. The full browser runtime
 * adds deterministic local prediction on top of this sample, but lightweight
 * consumers (lobby probes, spectators promoted into a seat, and headless
 * clients) otherwise expose the entire 20 Hz packet correction in one frame.
 * The untouched raw pose remains available through `immediateAuthority` for
 * reconciliation and anti-cheat decisions.
 */
function limitImmediatePresentation(
  target: DecodedEntitySnapshot,
  presentation: DecodedEntitySnapshot,
  elapsedMs: number,
  initialized: boolean,
): void {
  const priorX = presentation.x;
  const priorY = presentation.y;
  const priorZ = presentation.z;
  const priorSpeed = initialized
    ? Math.hypot(presentation.vx || 0, presentation.vy || 0, presentation.vz || 0)
    : 0;
  Object.assign(presentation, target);
  if (!initialized) return;

  const dx = target.x - priorX;
  const dy = target.y - priorY;
  const dz = target.z - priorZ;
  const distanceM = Math.hypot(dx, dy, dz);
  if (!(distanceM > 0) || distanceM >= IMMEDIATE_TELEPORT_M) return;

  const elapsedS = Math.max(0, Math.min(MAX_SAMPLE_DELTA_MS, elapsedMs)) / 1000;
  const targetSpeed = Math.hypot(target.vx || 0, target.vy || 0, target.vz || 0);
  const expectedMotionM = Math.max(priorSpeed, targetSpeed) * elapsedS;
  const correctionM = Math.min(
    IMMEDIATE_CORRECTION_STEP_M,
    IMMEDIATE_CORRECTION_RATE_MPS * elapsedS,
  );
  const maxStepM = expectedMotionM + correctionM;
  if (distanceM <= maxStepM) return;
  const scale = maxStepM / distanceM;
  presentation.x = priorX + dx * scale;
  presentation.y = priorY + dy * scale;
  presentation.z = priorZ + dz * scale;
}

function stabilizeRestPose(entity: DecodedEntitySnapshot): DecodedEntitySnapshot {
  let rest = entity[REST_POSE];
  if (!rest) {
    rest = {
      x: entity.x,
      y: entity.y,
      z: entity.z,
      yaw: entity.yaw,
      pitch: entity.pitch,
      roll: entity.roll,
    };
    Object.defineProperty(entity, REST_POSE, { value: rest });
    return entity;
  }
  const moving = Math.hypot(entity.vx || 0, entity.vy || 0, entity.vz || 0) > REST_SPEED_MPS;
  if (moving) {
    rest.x = entity.x;
    rest.y = entity.y;
    rest.z = entity.z;
    rest.yaw = entity.yaw;
    rest.pitch = entity.pitch;
    rest.roll = entity.roll;
    return entity;
  }

  if (Math.hypot(entity.x - rest.x, entity.z - rest.z) <=
      REST_HORIZONTAL_DEADZONE_M) {
    entity.x = rest.x;
    entity.z = rest.z;
  } else {
    rest.x = entity.x;
    rest.z = entity.z;
  }
  if (Math.abs(entity.y - rest.y) <= REST_VERTICAL_DEADZONE_M) {
    entity.y = rest.y;
  } else {
    rest.y = entity.y;
  }
  if (Math.abs(shortestAngleDelta(rest.yaw, entity.yaw)) <= REST_YAW_DEADZONE_RAD) {
    entity.yaw = rest.yaw;
  } else {
    rest.yaw = entity.yaw;
  }
  if (Math.abs(shortestAngleDelta(rest.pitch, entity.pitch)) <= REST_TILT_DEADZONE_RAD) {
    entity.pitch = rest.pitch;
  } else {
    rest.pitch = entity.pitch;
  }
  if (Math.abs(shortestAngleDelta(rest.roll, entity.roll)) <= REST_TILT_DEADZONE_RAD) {
    entity.roll = rest.roll;
  } else {
    rest.roll = entity.roll;
  }
  return entity;
}

/**
 * Client-side jitter buffer. It renders slightly behind authority, uses
 * Hermite motion for tracked vehicles, and bounds extrapolation during loss.
 */
export interface SnapshotBufferOptions {
  interpolationDelayMs?: number;
  maxExtrapolationMs?: number;
  capacity?: number;
  immediateEntityId?: string | null;
  adaptiveDelay?: boolean;
  maxInterpolationDelayMs?: number;
}

export interface SnapshotBufferStats {
  interpolationDelayMs: number;
  targetInterpolationDelayMs: number;
  arrivalJitterMs: number;
  acceptedSnapshots: number;
  rejectedSnapshots: number;
  sampleCount: number;
  extrapolatedSamples: number;
  bufferedSnapshots: number;
}

export class SnapshotBuffer {
  readonly baseInterpolationDelayMs: number;
  interpolationDelayMs: number;
  targetInterpolationDelayMs: number;
  readonly maxInterpolationDelayMs: number;
  readonly adaptiveDelay: boolean;
  readonly maxExtrapolationMs: number;
  readonly capacity: number;
  readonly immediateEntityId: string | null;
  readonly snapshots: WorldSnapshot[] = [];
  latestTick = -1;
  arrivalJitterMs = 0;
  private lastArrivalMs: number | null = null;
  private lastServerTimeMs: number | null = null;
  private lastSampleServerTimeMs: number | null = null;
  private lastRenderTimeMs: number | null = null;
  private acceptedSnapshots = 0;
  private rejectedSnapshots = 0;
  private sampleCount = 0;
  private extrapolatedSamples = 0;
  private readonly sampleFrame: SampledSnapshotFrame;
  private readonly sampleEntities = new Map<string, DecodedEntitySnapshot>();
  private readonly olderById = new Map<string, QuantizedEntitySnapshot>();
  private readonly sampleShells: QuantizedShellSnapshot[] = [];
  private readonly olderShellById = new Map<number, QuantizedShellSnapshot>();
  private readonly decodeScratchA = {} as DecodedEntitySnapshot;
  private readonly decodeScratchB = {} as DecodedEntitySnapshot;
  private readonly immediateScratch = {} as DecodedEntitySnapshot;
  private readonly immediatePresentation = {} as DecodedEntitySnapshot;
  private readonly sampleMeta: Record<string, RuntimeValue> = {};
  private readonly sampleModeState: Record<string, RuntimeValue> = {};
  private readonly sampleModeBall: Record<string, RuntimeValue> = {};
  private readonly sampleModeFlags: Record<string, RuntimeValue>[] = [];
  private readonly sampleModeZones: Record<string, RuntimeValue>[] = [];
  private readonly sampleModeHorde: Record<string, RuntimeValue> = {};
  private immediatePresentationReady = false;
  private lastImmediatePresentationTimeMs: number | null = null;
  private readonly immediateAuthority: ImmediateAuthoritySnapshot;

  constructor({
    interpolationDelayMs = 100,
    maxExtrapolationMs = 250,
    capacity = 32,
    immediateEntityId = null,
    adaptiveDelay = interpolationDelayMs > 0,
    maxInterpolationDelayMs = Math.max(interpolationDelayMs, 220),
  }: SnapshotBufferOptions = {}) {
    if (interpolationDelayMs < 0 || maxExtrapolationMs < 0 || capacity < 2 ||
        maxInterpolationDelayMs < interpolationDelayMs) {
      throw new TypeError('invalid snapshot buffer configuration');
    }
    this.baseInterpolationDelayMs = interpolationDelayMs;
    this.interpolationDelayMs = interpolationDelayMs;
    this.targetInterpolationDelayMs = interpolationDelayMs;
    this.maxInterpolationDelayMs = maxInterpolationDelayMs;
    this.adaptiveDelay = !!adaptiveDelay && interpolationDelayMs > 0;
    this.maxExtrapolationMs = maxExtrapolationMs;
    this.capacity = capacity;
    this.immediateEntityId = immediateEntityId == null ? null : String(immediateEntityId);
    // Presentation sampling runs once per render frame. Reuse its output
    // graph so 120 Hz multiplayer does not allocate a frame plus N entity
    // objects and a lookup Map every tick.
    this.sampleFrame = {
      tick: 0,
      serverTimeMs: 0,
      ackInputSeq: 0,
      entities: [],
      shells: [],
      events: [],
      meta: null,
      immediateAuthority: null,
    };
    this.immediateAuthority = {
      tick: 0,
      serverTimeMs: 0,
      ackInputSeq: 0,
      entity: {} as DecodedEntitySnapshot,
    };
  }

  push(snapshot: WorldSnapshot, receivedAtMs: number | null = null): boolean {
    if (!snapshot || !Number.isSafeInteger(snapshot.tick) ||
        !Number.isFinite(snapshot.serverTimeMs) || !Array.isArray(snapshot.entities)) {
      throw new TypeError('invalid snapshot');
    }
    if (snapshot.tick <= this.latestTick) {
      this.rejectedSnapshots++;
      return false;
    }
    this.latestTick = snapshot.tick;
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.capacity) this.snapshots.shift();
    this.acceptedSnapshots++;
    this.#observeArrival(snapshot.serverTimeMs, receivedAtMs);
    return true;
  }

  #observeArrival(serverTimeMs: number, receivedAtMs: number | null): void {
    if (!this.adaptiveDelay || typeof receivedAtMs !== 'number' ||
        !Number.isFinite(receivedAtMs)) return;
    if (this.lastArrivalMs != null && this.lastServerTimeMs != null &&
        receivedAtMs >= this.lastArrivalMs && serverTimeMs > this.lastServerTimeMs) {
      const arrivalSpacing = receivedAtMs - this.lastArrivalMs;
      const authoritySpacing = serverTimeMs - this.lastServerTimeMs;
      const variation = Math.abs(arrivalSpacing - authoritySpacing);
      // Faster attack than release: absorb a burst before it drains the
      // interpolation queue, then recover latency gradually after the link
      // has actually stayed quiet.
      const jitterAlpha = variation > this.arrivalJitterMs ? 0.25 : 0.05;
      this.arrivalJitterMs += (variation - this.arrivalJitterMs) * jitterAlpha;
      this.targetInterpolationDelayMs = Math.min(
        this.maxInterpolationDelayMs,
        this.baseInterpolationDelayMs + this.arrivalJitterMs * 2,
      );
    }
    this.lastArrivalMs = receivedAtMs;
    this.lastServerTimeMs = serverTimeMs;
  }

  clear(): void {
    this.snapshots.length = 0;
    this.latestTick = -1;
    this.interpolationDelayMs = this.baseInterpolationDelayMs;
    this.targetInterpolationDelayMs = this.baseInterpolationDelayMs;
    this.arrivalJitterMs = 0;
    this.lastArrivalMs = null;
    this.lastServerTimeMs = null;
    this.lastSampleServerTimeMs = null;
    this.lastRenderTimeMs = null;
    this.sampleEntities.clear();
    this.olderById.clear();
    this.sampleShells.length = 0;
    this.olderShellById.clear();
    this.sampleModeFlags.length = 0;
    this.sampleModeZones.length = 0;
    this.immediatePresentationReady = false;
    this.lastImmediatePresentationTimeMs = null;
  }

  getStats(): SnapshotBufferStats {
    return {
      interpolationDelayMs: this.interpolationDelayMs,
      targetInterpolationDelayMs: this.targetInterpolationDelayMs,
      arrivalJitterMs: this.arrivalJitterMs,
      acceptedSnapshots: this.acceptedSnapshots,
      rejectedSnapshots: this.rejectedSnapshots,
      sampleCount: this.sampleCount,
      extrapolatedSamples: this.extrapolatedSamples,
      bufferedSnapshots: this.snapshots.length,
    };
  }

  private sampleEntity(id: string): DecodedEntitySnapshot {
    let entity = this.sampleEntities.get(id);
    if (!entity) {
      entity = {} as DecodedEntitySnapshot;
      this.sampleEntities.set(id, entity);
    }
    return entity;
  }

  private advanceInterpolationDelay(localServerTimeMs: number): void {
    if (!this.adaptiveDelay) return;
    if (this.lastSampleServerTimeMs != null) {
      const elapsedMs = Math.max(0, Math.min(
        MAX_SAMPLE_DELTA_MS,
        localServerTimeMs - this.lastSampleServerTimeMs,
      ));
      const delayErrorMs = this.targetInterpolationDelayMs - this.interpolationDelayMs;
      if (delayErrorMs > 0) {
        // Grow the safety buffer by slowing presentation, never by seeking
        // backward through already-rendered authority poses.
        this.interpolationDelayMs += Math.min(
          delayErrorMs,
          elapsedMs * DELAY_ATTACK_FRACTION,
        );
      } else if (delayErrorMs < 0) {
        // Recover latency more gently than it is acquired. The render clock
        // runs at at most 1.1x until it reaches the new target.
        this.interpolationDelayMs += Math.max(
          delayErrorMs,
          -elapsedMs * DELAY_RELEASE_FRACTION,
        );
      }
    }
    this.lastSampleServerTimeMs = localServerTimeMs;
  }

  private resolveRenderTime(localServerTimeMs: number): number {
    const desiredTime = localServerTimeMs - this.interpolationDelayMs;
    const renderTime = this.lastRenderTimeMs == null
      ? desiredTime : Math.max(desiredTime, this.lastRenderTimeMs);
    this.lastRenderTimeMs = renderTime;
    return renderTime;
  }

  private findSnapshotPair(renderTime: number): [WorldSnapshot, WorldSnapshot] {
    let older: WorldSnapshot | undefined;
    let newer: WorldSnapshot | undefined;
    for (const snapshot of this.snapshots) {
      if (snapshot.serverTimeMs <= renderTime) older = snapshot;
      if (snapshot.serverTimeMs >= renderTime) {
        newer = snapshot;
        break;
      }
    }
    return [older || this.snapshots[0], newer || this.snapshots[this.snapshots.length - 1]];
  }

  private presentEntity(
    id: string,
    sampled: DecodedEntitySnapshot,
  ): DecodedEntitySnapshot {
    return id === this.immediateEntityId ? sampled : stabilizeRestPose(sampled);
  }

  private extrapolateEntities(
    snapshot: WorldSnapshot,
    renderTime: number,
    entities: DecodedEntitySnapshot[],
  ): void {
    const extraMs = Math.max(0, Math.min(
      this.maxExtrapolationMs,
      renderTime - snapshot.serverTimeMs,
    ));
    if (extraMs > 0) this.extrapolatedSamples++;
    for (const raw of snapshot.entities) {
      const sampled = extrapolateEntity(raw, extraMs / 1000, this.sampleEntity(raw.id));
      entities.push(this.presentEntity(raw.id, sampled));
    }
  }

  private interpolateEntities(
    older: WorldSnapshot,
    newer: WorldSnapshot,
    renderTime: number,
    entities: DecodedEntitySnapshot[],
  ): void {
    const durationMs = newer.serverTimeMs - older.serverTimeMs;
    const t = Math.max(0, Math.min(1, (renderTime - older.serverTimeMs) / durationMs));
    this.olderById.clear();
    for (const entity of older.entities) this.olderById.set(entity.id, entity);
    for (const current of newer.entities) {
      const previous = this.olderById.get(current.id);
      const sampled = previous
        ? interpolateEntity(previous, current, t, durationMs / 1000,
          this.sampleEntity(current.id), this.decodeScratchA, this.decodeScratchB)
        : decodeEntitySnapshot(current, this.sampleEntity(current.id));
      entities.push(this.presentEntity(current.id, sampled));
    }
  }

  private sampleBufferedEntities(
    older: WorldSnapshot,
    newer: WorldSnapshot,
    renderTime: number,
    entities: DecodedEntitySnapshot[],
  ): void {
    entities.length = 0;
    if (older === newer || newer.serverTimeMs === older.serverTimeMs) {
      this.extrapolateEntities(newer, renderTime, entities);
      return;
    }
    this.interpolateEntities(older, newer, renderTime, entities);
  }

  private sampleBufferedShells(
    older: WorldSnapshot,
    newer: WorldSnapshot,
    renderTime: number,
  ): QuantizedShellSnapshot[] {
    const durationMs = newer.serverTimeMs - older.serverTimeMs;
    const interpolating = older !== newer && durationMs > 0;
    const t = interpolating
      ? Math.max(0, Math.min(1, (renderTime - older.serverTimeMs) / durationMs))
      : 1;
    const extraS = interpolating ? 0 : Math.max(0, Math.min(
      this.maxExtrapolationMs,
      renderTime - newer.serverTimeMs,
    )) / 1000;
    this.olderShellById.clear();
    if (interpolating) {
      for (const shell of older.shells || []) this.olderShellById.set(shell.id, shell);
    }
    let count = 0;
    for (const current of newer.shells || []) {
      let target = this.sampleShells[count];
      if (!target) target = this.sampleShells[count] = {} as QuantizedShellSnapshot;
      Object.assign(target, current);
      const previous = interpolating ? this.olderShellById.get(current.id) : null;
      if (previous && previous.shooterId === current.shooterId &&
          previous.type === current.type) {
        const durationS = durationMs / 1000;
        target.x = hermite(previous.x, previous.vx, current.x, current.vx, t, durationS);
        target.y = hermite(previous.y, previous.vy, current.y, current.vy, t, durationS);
        target.z = hermite(previous.z, previous.vz, current.z, current.vz, t, durationS);
        target.vx = previous.vx + (current.vx - previous.vx) * t;
        target.vy = previous.vy + (current.vy - previous.vy) * t;
        target.vz = previous.vz + (current.vz - previous.vz) * t;
      } else if (extraS > 0) {
        target.x = current.x + current.vx * extraS;
        target.y = current.y + current.vy * extraS;
        target.z = current.z + current.vz * extraS;
      }
      count++;
    }
    this.sampleShells.length = count;
    return this.sampleShells;
  }

  private sampleMetadataClock(
    older: WorldSnapshot,
    newer: WorldSnapshot,
    renderTime: number,
    key: 'battleTimeMs' | 'countdownMs',
  ): void {
    const newerMeta = newer.meta;
    if (!newerMeta || typeof newerMeta[key] !== 'number' ||
        !Number.isFinite(newerMeta[key])) return;
    const newerValue = newerMeta[key] as number;
    const olderValue = older.meta?.[key];
    if (older !== newer && newer.serverTimeMs > older.serverTimeMs &&
        typeof olderValue === 'number' && Number.isFinite(olderValue) &&
        older.meta?.phase === newerMeta.phase) {
      const t = Math.max(0, Math.min(1,
        (renderTime - older.serverTimeMs) /
          (newer.serverTimeMs - older.serverTimeMs),
      ));
      this.sampleMeta[key] = olderValue + (newerValue - olderValue) * t;
      return;
    }
    const clockAdvances = key === 'battleTimeMs'
      ? newerMeta.phase === 'playing'
      : newerMeta.phase === 'countdown';
    if (renderTime > newer.serverTimeMs && clockAdvances) {
      const extraMs = Math.min(this.maxExtrapolationMs, renderTime - newer.serverTimeMs);
      this.sampleMeta[key] = key === 'countdownMs'
        ? Math.max(0, newerValue - extraMs)
        : newerValue + extraMs;
    }
  }

  private sampleModeBallState(
    olderMode: Record<string, RuntimeValue> | null,
    newerMode: Record<string, RuntimeValue>,
    older: WorldSnapshot,
    newer: WorldSnapshot,
    renderTime: number,
  ): void {
    const current = runtimeRecord(newerMode.ball);
    if (!current) return;
    overwriteRecord(this.sampleModeBall, current);
    const previous = runtimeRecord(olderMode?.ball);
    const durationMs = newer.serverTimeMs - older.serverTimeMs;
    if (previous && olderMode && sameObjectiveScore(olderMode, newerMode) &&
        older !== newer && canInterpolateBall(previous, current, durationMs / 1000)) {
      const durationS = durationMs / 1000;
      const t = Math.max(0, Math.min(1, (renderTime - older.serverTimeMs) / durationMs));
      this.sampleModeBall.x = hermite(
        finite(previous.x), finite(previous.vx), finite(current.x), finite(current.vx), t, durationS,
      );
      this.sampleModeBall.y = hermite(
        finite(previous.y), finite(previous.vy), finite(current.y), finite(current.vy), t, durationS,
      );
      this.sampleModeBall.z = hermite(
        finite(previous.z), finite(previous.vz), finite(current.z), finite(current.vz), t, durationS,
      );
      this.sampleModeBall.vx = finite(previous.vx) +
        (finite(current.vx) - finite(previous.vx)) * t;
      this.sampleModeBall.vy = finite(previous.vy) +
        (finite(current.vy) - finite(previous.vy)) * t;
      this.sampleModeBall.vz = finite(previous.vz) +
        (finite(current.vz) - finite(previous.vz)) * t;
    } else if (renderTime > newer.serverTimeMs) {
      const extraS = Math.min(this.maxExtrapolationMs,
        renderTime - newer.serverTimeMs) / 1000;
      this.sampleModeBall.x = finite(current.x) + finite(current.vx) * extraS;
      this.sampleModeBall.y = finite(current.y) + finite(current.vy) * extraS;
      this.sampleModeBall.z = finite(current.z) + finite(current.vz) * extraS;
    }
    this.sampleModeState.ball = this.sampleModeBall;
  }

  private sampleModeFlagsState(
    olderMode: Record<string, RuntimeValue> | null,
    newerMode: Record<string, RuntimeValue>,
    older: WorldSnapshot,
    newer: WorldSnapshot,
    renderTime: number,
  ): void {
    if (!Array.isArray(newerMode.flags)) return;
    const previousFlags = Array.isArray(olderMode?.flags) ? olderMode.flags : [];
    const durationMs = newer.serverTimeMs - older.serverTimeMs;
    const t = older !== newer && durationMs > 0
      ? Math.max(0, Math.min(1, (renderTime - older.serverTimeMs) / durationMs))
      : 1;
    let count = 0;
    for (const rawFlag of newerMode.flags) {
      const current = runtimeRecord(rawFlag);
      if (!current) continue;
      let target = this.sampleModeFlags[count];
      if (!target) target = this.sampleModeFlags[count] = {};
      overwriteRecord(target, current);
      const previous = runtimeRecord(previousFlags[count]);
      if (previous && t < 1 && previous.team === current.team &&
          previous.status === current.status && previous.carrierId === current.carrierId &&
          Math.hypot(
            finite(current.x) - finite(previous.x),
            finite(current.y) - finite(previous.y),
            finite(current.z) - finite(previous.z),
          ) <= OBJECTIVE_TELEPORT_FLOOR_M) {
        target.x = finite(previous.x) + (finite(current.x) - finite(previous.x)) * t;
        target.y = finite(previous.y) + (finite(current.y) - finite(previous.y)) * t;
        target.z = finite(previous.z) + (finite(current.z) - finite(previous.z)) * t;
      }
      count++;
    }
    this.sampleModeFlags.length = count;
    this.sampleModeState.flags = this.sampleModeFlags;
  }

  private sampleModeZonesState(
    olderMode: Record<string, RuntimeValue> | null,
    newerMode: Record<string, RuntimeValue>,
    older: WorldSnapshot,
    newer: WorldSnapshot,
    renderTime: number,
  ): void {
    if (!Array.isArray(newerMode.zones)) return;
    const previousZones = Array.isArray(olderMode?.zones) ? olderMode.zones : [];
    const durationMs = newer.serverTimeMs - older.serverTimeMs;
    const t = older !== newer && durationMs > 0
      ? Math.max(0, Math.min(1, (renderTime - older.serverTimeMs) / durationMs))
      : 1;
    let count = 0;
    for (const rawZone of newerMode.zones) {
      const current = runtimeRecord(rawZone);
      if (!current) continue;
      let target = this.sampleModeZones[count];
      if (!target) target = this.sampleModeZones[count] = {};
      overwriteRecord(target, current);
      const previous = runtimeRecord(previousZones[count]);
      if (previous && t < 1 && previous.id === current.id) {
        target.control = finite(previous.control) +
          (finite(current.control) - finite(previous.control)) * t;
      }
      count++;
    }
    this.sampleModeZones.length = count;
    this.sampleModeState.zones = this.sampleModeZones;
  }

  private sampleModeHordeState(
    olderMode: Record<string, RuntimeValue> | null,
    newerMode: Record<string, RuntimeValue>,
    older: WorldSnapshot,
    newer: WorldSnapshot,
    renderTime: number,
  ): void {
    const current = runtimeRecord(newerMode.horde);
    if (!current) return;
    overwriteRecord(this.sampleModeHorde, current);
    const previous = runtimeRecord(olderMode?.horde);
    const durationMs = newer.serverTimeMs - older.serverTimeMs;
    if (previous && older !== newer && durationMs > 0 && previous.wave === current.wave) {
      const t = Math.max(0, Math.min(1, (renderTime - older.serverTimeMs) / durationMs));
      this.sampleModeHorde.nextWaveInS = finite(previous.nextWaveInS) +
        (finite(current.nextWaveInS) - finite(previous.nextWaveInS)) * t;
    } else if (renderTime > newer.serverTimeMs) {
      const extraS = Math.min(this.maxExtrapolationMs,
        renderTime - newer.serverTimeMs) / 1000;
      this.sampleModeHorde.nextWaveInS = Math.max(0,
        finite(current.nextWaveInS) - extraS);
    }
    this.sampleModeState.horde = this.sampleModeHorde;
  }

  private sampleMetadata(
    older: WorldSnapshot,
    newer: WorldSnapshot,
    renderTime: number,
  ): Record<string, RuntimeValue> | null {
    if (!newer.meta) return null;
    overwriteRecord(this.sampleMeta, newer.meta);
    this.sampleMetadataClock(older, newer, renderTime, 'battleTimeMs');
    this.sampleMetadataClock(older, newer, renderTime, 'countdownMs');

    const newerMode = runtimeRecord(newer.meta.modeState);
    if (!newerMode) return this.sampleMeta;
    const olderMode = runtimeRecord(older.meta?.modeState);
    overwriteRecord(this.sampleModeState, newerMode);
    this.sampleModeBallState(olderMode, newerMode, older, newer, renderTime);
    this.sampleModeFlagsState(olderMode, newerMode, older, newer, renderTime);
    this.sampleModeZonesState(olderMode, newerMode, older, newer, renderTime);
    this.sampleModeHordeState(olderMode, newerMode, older, newer, renderTime);
    this.sampleMeta.modeState = this.sampleModeState;
    return this.sampleMeta;
  }

  private resetImmediatePresentation(): null {
    this.immediatePresentationReady = false;
    this.lastImmediatePresentationTimeMs = null;
    return null;
  }

  private sampleImmediateAuthority(
    localServerTimeMs: number,
    entities: DecodedEntitySnapshot[],
  ): ImmediateAuthoritySnapshot | null {
    if (!this.immediateEntityId) return null;
    const latest = this.snapshots[this.snapshots.length - 1];
    const raw = latest.entities.find((entity) => entity.id === this.immediateEntityId);
    if (!raw) return this.resetImmediatePresentation();
    const extraMs = Math.max(0, Math.min(
      this.maxExtrapolationMs,
      localServerTimeMs - latest.serverTimeMs,
    ));
    const target = extrapolateEntity(raw, extraMs / 1000, this.immediateScratch);
    const elapsedMs = this.lastImmediatePresentationTimeMs == null
      ? 0 : localServerTimeMs - this.lastImmediatePresentationTimeMs;
    limitImmediatePresentation(
      target,
      this.immediatePresentation,
      elapsedMs,
      this.immediatePresentationReady,
    );
    this.immediatePresentationReady = true;
    this.lastImmediatePresentationTimeMs = localServerTimeMs;
    const immediate = this.immediatePresentation;
    const index = entities.findIndex((entity) => entity.id === this.immediateEntityId);
    if (index >= 0) entities[index] = immediate;
    else entities.push(immediate);
    const authority = this.immediateAuthority;
    authority.tick = latest.tick;
    authority.serverTimeMs = latest.serverTimeMs;
    authority.ackInputSeq = latest.ackInputSeq;
    decodeEntitySnapshot(raw, authority.entity);
    return authority;
  }

  sample(localServerTimeMs: number): SampledSnapshotFrame | null {
    if (!this.snapshots.length) return null;
    this.sampleCount++;
    this.advanceInterpolationDelay(localServerTimeMs);
    const renderTime = this.resolveRenderTime(localServerTimeMs);
    const [older, newer] = this.findSnapshotPair(renderTime);
    const frame = this.sampleFrame;
    this.sampleBufferedEntities(older, newer, renderTime, frame.entities);

    // The locally controlled tank must not inherit the remote-entity jitter
    // delay. Render it from the newest authority sample with the same bounded
    // extrapolator; opponents and teammates remain safely buffered. This is
    // still server truth—there is no client-side collision or damage sim—and
    // corrections remain small because snapshots arrive at 20 Hz.
    frame.tick = newer.tick;
    frame.serverTimeMs = renderTime;
    frame.ackInputSeq = newer.ackInputSeq;
    frame.shells = this.sampleBufferedShells(older, newer, renderTime);
    frame.events = newer.events || [];
    frame.meta = this.sampleMetadata(older, newer, renderTime);
    frame.immediateAuthority = this.sampleImmediateAuthority(localServerTimeMs, frame.entities);
    return frame;
  }
}
