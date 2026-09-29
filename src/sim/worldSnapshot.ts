/**
 * The authority's viewer-specific world snapshot: every visible tank and shell captured as quantized integer rows
 * (centimetres, centimetres per second, 1/32767 π radians), the events the viewer may see and the match's meta. The
 * capture is the security boundary the AGENTS invariant names: `canObserve` omits hidden enemies BEFORE anything is
 * serialized, so no client can mine positions from the wire. The multiplayer host (server/match) turns these rows
 * into its wire rows; the solo battle never captures.
 */
import type { RuntimeValue } from '../runtimeTypes.ts';
import { magazineIndicator } from './magazineIndicator.ts';
import type { MagazineIndicator, MagazineIndicatorSpec } from './magazineIndicator.ts';
const POSITION_SCALE = 100;      // centimeters
const VELOCITY_SCALE = 100;      // centimeters / second
const ANGLE_SCALE = 32767 / Math.PI;
const MAX_ENTITIES = 32;
const MAX_SHELLS = 256;

const SNAPSHOT_RELOAD_KINDS = Object.freeze({
  ready: 0,
  shell: 1,
  intraClip: 2,
  magazine: 3,
});

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
  launcherSalvoShots?: RuntimeValue;
  magazineIndicator?: MagazineIndicator | null;
  ammo?: RuntimeValue[] | null;
  eraSpent?: Set<string> | null;
}

export interface SnapshotEntitySource {
  id?: RuntimeValue;
  specId?: RuntimeValue;
  spec?: ({ id?: RuntimeValue } & MagazineIndicatorSpec) | null;
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

/** One captured tank as the wire carries it (quantized; `eraSpent` only when plates are gone). */
interface QuantizedEntitySnapshot {
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

interface QuantizedShellSnapshot {
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

interface CaptureWorldSnapshotOptions {
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

function quantize(value: RuntimeValue, scale: number): number {
  return Math.round(finite(value) * scale);
}

function quantizeAngle(value: RuntimeValue): number {
  let angle = finite(value);
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return Math.round(angle * ANGLE_SCALE);
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

const snapshotIndicatorScratch: MagazineIndicator = { rounds: 0, capacity: 0, launcher: false };
const indicatorCombatScratch = {
  shellSlot: 0,
  reload: { t: 0, kind: 'ready' as string },
  magazine: null as { rounds: number; capacity: number } | null,
  magazineScratch: { rounds: 0, capacity: 0 },
  launcherSalvoShots: 0,
  magazineIndicator: undefined as MagazineIndicator | null | undefined,
};
/** Coerce the runtime-typed combat source into the indicator's numeric view without allocating. */
function indicatorCombatView(combat: SnapshotCombatSource) {
  const view = indicatorCombatScratch;
  view.shellSlot = Math.max(0, Number(combat.shellSlot) | 0);
  view.reload.t = finite(combat.reload?.t);
  view.reload.kind = typeof combat.reload?.kind === 'string' ? combat.reload.kind : 'ready';
  if (combat.magazine) {
    view.magazineScratch.rounds = Math.max(0, Number(combat.magazine.rounds) | 0);
    view.magazineScratch.capacity = Math.max(0, Number(combat.magazine.capacity) | 0);
    view.magazine = view.magazineScratch;
  } else view.magazine = null;
  view.launcherSalvoShots = Math.max(0, Number(combat.launcherSalvoShots) | 0);
  view.magazineIndicator = combat.magazineIndicator;
  return view;
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
  // The magazine fields carry the reticle's multi-round indicator: the cannon magazine, or the guided rack salvo
  // group while a missile is loaded (round 41, sim/magazineIndicator) — one derivation with the solo aim frame.
  const indicator = magazineIndicator(indicatorCombatView(entity.combat), entity.spec, snapshotIndicatorScratch);
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
    magazineRounds: Math.max(0, Number(indicator?.rounds) | 0),
    magazineCapacity: Math.max(0, Number(indicator?.capacity) | 0),
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
