const POSITION_SCALE = 100;      // centimeters
const VELOCITY_SCALE = 100;      // centimeters / second
const ANGLE_SCALE = 32767 / Math.PI;
const MAX_ENTITIES = 32;
const MAX_SHELLS = 256;

export const SNAPSHOT_FLAGS = Object.freeze({
  DESTROYED: 1 << 0,
  BURNING: 1 << 1,
  FIRING: 1 << 2,
  SPOTTED: 1 << 3,
});

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function quantize(value, scale) {
  return Math.round(finite(value) * scale);
}

function quantizeAngle(value) {
  let angle = finite(value);
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return Math.round(angle * ANGLE_SCALE);
}

function dequantizeAngle(value) {
  return value / ANGLE_SCALE;
}

function vectorAxis(vector, axis) {
  if (Array.isArray(vector)) return finite(vector[axis]);
  if (!vector || typeof vector !== 'object') return 0;
  return finite(vector[axis === 0 ? 'x' : axis === 1 ? 'y' : 'z']);
}

function entityFlags(entity) {
  let flags = 0;
  const combat = entity.combat || {};
  if (combat.destroyed) flags |= SNAPSHOT_FLAGS.DESTROYED;
  if (combat.fire && combat.fire.burning) flags |= SNAPSHOT_FLAGS.BURNING;
  if (entity.input && entity.input.fire) flags |= SNAPSHOT_FLAGS.FIRING;
  if (entity.spotted) flags |= SNAPSHOT_FLAGS.SPOTTED;
  return flags;
}

/** Capture one active tank without retaining mutable simulation objects. */
export function captureEntitySnapshot(entity) {
  if (!entity || !entity.state || !entity.combat) return null;
  const state = entity.state;
  const speed = finite(state.speed);
  const yaw = finite(state.yaw);
  return {
    id: String(entity.id),
    specId: String(entity.specId || (entity.spec && entity.spec.id) || ''),
    team: String(entity.team || ''),
    x: quantize(vectorAxis(state.pos, 0), POSITION_SCALE),
    y: quantize(vectorAxis(state.pos, 1), POSITION_SCALE),
    z: quantize(vectorAxis(state.pos, 2), POSITION_SCALE),
    vx: quantize(Math.sin(yaw) * speed, VELOCITY_SCALE),
    vz: quantize(Math.cos(yaw) * speed, VELOCITY_SCALE),
    yaw: quantizeAngle(yaw),
    pitch: quantizeAngle(state.visualPitch),
    roll: quantizeAngle(state.visualRoll),
    turretYaw: quantizeAngle(state.turretYaw),
    gunPitch: quantizeAngle(state.gunPitch),
    hp: Math.max(0, Math.round(finite(entity.combat.hp))),
    maxHp: Math.max(1, Math.round(finite(entity.combat.maxHp, 1))),
    reloadMs: Math.max(0, Math.round(finite(entity.combat.reload && entity.combat.reload.t) * 1000)),
    shellSlot: Math.max(0, Math.min(2, entity.combat.shellSlot | 0)),
    flags: entityFlags(entity),
  };
}

function captureShellSnapshot(shell) {
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
  };
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
} = {}) {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new TypeError('tick must be unsigned');
  if (!Number.isFinite(serverTimeMs) || serverTimeMs < 0) {
    throw new TypeError('serverTimeMs must be non-negative');
  }
  const viewer = String(viewerId || '');
  const visibleEntities = [];
  for (const entity of entities || []) {
    if (visibleEntities.length >= MAX_ENTITIES) break;
    if (!entity) continue;
    if (entity.id !== viewer && !canObserve(viewer, entity)) continue;
    const captured = captureEntitySnapshot(entity);
    if (captured) visibleEntities.push(captured);
  }
  const visibleShells = [];
  for (const shell of shells || []) {
    if (visibleShells.length >= MAX_SHELLS) break;
    if (!canObserveShell(viewer, shell)) continue;
    const captured = captureShellSnapshot(shell);
    if (captured) visibleShells.push(captured);
  }
  return {
    tick,
    serverTimeMs: Math.round(serverTimeMs),
    ackInputSeq,
    entities: visibleEntities,
    shells: visibleShells,
    events: (events || []).filter((event) => canObserveEvent(viewer, event)),
  };
}

export function decodeEntitySnapshot(entity) {
  return {
    id: entity.id,
    specId: entity.specId,
    team: entity.team,
    x: entity.x / POSITION_SCALE,
    y: entity.y / POSITION_SCALE,
    z: entity.z / POSITION_SCALE,
    vx: entity.vx / VELOCITY_SCALE,
    vz: entity.vz / VELOCITY_SCALE,
    yaw: dequantizeAngle(entity.yaw),
    pitch: dequantizeAngle(entity.pitch),
    roll: dequantizeAngle(entity.roll),
    turretYaw: dequantizeAngle(entity.turretYaw),
    gunPitch: dequantizeAngle(entity.gunPitch),
    hp: entity.hp,
    maxHp: entity.maxHp,
    reloadS: entity.reloadMs / 1000,
    shellSlot: entity.shellSlot,
    flags: entity.flags,
  };
}

function shortestAngleDelta(from, to) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function lerpAngle(a, b, t) {
  return a + shortestAngleDelta(a, b) * t;
}

function hermite(p0, v0, p1, v1, t, durationS) {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * p0 + h10 * durationS * v0 + h01 * p1 + h11 * durationS * v1;
}

function interpolateEntity(aRaw, bRaw, t, durationS) {
  const a = decodeEntitySnapshot(aRaw);
  const b = decodeEntitySnapshot(bRaw);
  return {
    ...b,
    x: hermite(a.x, a.vx, b.x, b.vx, t, durationS),
    y: a.y + (b.y - a.y) * t,
    z: hermite(a.z, a.vz, b.z, b.vz, t, durationS),
    vx: a.vx + (b.vx - a.vx) * t,
    vz: a.vz + (b.vz - a.vz) * t,
    yaw: lerpAngle(a.yaw, b.yaw, t),
    pitch: lerpAngle(a.pitch, b.pitch, t),
    roll: lerpAngle(a.roll, b.roll, t),
    turretYaw: lerpAngle(a.turretYaw, b.turretYaw, t),
    gunPitch: lerpAngle(a.gunPitch, b.gunPitch, t),
    reloadS: a.reloadS + (b.reloadS - a.reloadS) * t,
  };
}

function extrapolateEntity(raw, extraS) {
  const entity = decodeEntitySnapshot(raw);
  entity.x += entity.vx * extraS;
  entity.z += entity.vz * extraS;
  entity.reloadS = Math.max(0, entity.reloadS - extraS);
  return entity;
}

/**
 * Client-side jitter buffer. It renders slightly behind authority, uses
 * Hermite motion for tracked vehicles, and bounds extrapolation during loss.
 */
export class SnapshotBuffer {
  constructor({ interpolationDelayMs = 100, maxExtrapolationMs = 250, capacity = 32 } = {}) {
    if (interpolationDelayMs < 0 || maxExtrapolationMs < 0 || capacity < 2) {
      throw new TypeError('invalid snapshot buffer configuration');
    }
    this.interpolationDelayMs = interpolationDelayMs;
    this.maxExtrapolationMs = maxExtrapolationMs;
    this.capacity = capacity;
    this.snapshots = [];
    this.latestTick = -1;
  }

  push(snapshot) {
    if (!snapshot || !Number.isSafeInteger(snapshot.tick) ||
        !Number.isFinite(snapshot.serverTimeMs) || !Array.isArray(snapshot.entities)) {
      throw new TypeError('invalid snapshot');
    }
    if (snapshot.tick <= this.latestTick) return false;
    this.latestTick = snapshot.tick;
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.capacity) this.snapshots.shift();
    return true;
  }

  clear() {
    this.snapshots.length = 0;
    this.latestTick = -1;
  }

  sample(localServerTimeMs) {
    if (!this.snapshots.length) return null;
    const renderTime = localServerTimeMs - this.interpolationDelayMs;
    let older = null;
    let newer = null;
    for (const snapshot of this.snapshots) {
      if (snapshot.serverTimeMs <= renderTime) older = snapshot;
      if (snapshot.serverTimeMs >= renderTime) {
        newer = snapshot;
        break;
      }
    }
    if (!older) older = this.snapshots[0];
    if (!newer) newer = this.snapshots[this.snapshots.length - 1];

    const entities = [];
    if (older === newer || newer.serverTimeMs === older.serverTimeMs) {
      const extraMs = Math.max(0, Math.min(this.maxExtrapolationMs,
        renderTime - newer.serverTimeMs));
      for (const raw of newer.entities) entities.push(extrapolateEntity(raw, extraMs / 1000));
    } else {
      const durationMs = newer.serverTimeMs - older.serverTimeMs;
      const t = Math.max(0, Math.min(1, (renderTime - older.serverTimeMs) / durationMs));
      const olderById = new Map(older.entities.map((entity) => [entity.id, entity]));
      for (const current of newer.entities) {
        const previous = olderById.get(current.id);
        entities.push(previous
          ? interpolateEntity(previous, current, t, durationMs / 1000)
          : decodeEntitySnapshot(current));
      }
    }
    return {
      tick: newer.tick,
      serverTimeMs: renderTime,
      ackInputSeq: newer.ackInputSeq,
      entities,
      shells: newer.shells || [],
      events: newer.events || [],
    };
  }
}
