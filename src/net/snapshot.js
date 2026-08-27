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
const REST_POSE = Symbol('networkRestPose');
const ENTITY_DELTA_FIELDS = Object.freeze([
  'id', 'specId', 'team',
  'x', 'y', 'z', 'vx', 'vy', 'vz',
  'yaw', 'pitch', 'roll', 'turretYaw', 'gunPitch',
  'hp', 'maxHp', 'reloadMs', 'reloadTotalMs', 'reloadKind',
  'magazineRounds', 'magazineCapacity', 'shellSlot', 'flags', 'eraSpent',
]);

const SNAPSHOT_RELOAD_KINDS = Object.freeze({
  ready: 0,
  shell: 1,
  intraClip: 2,
  magazine: 3,
});
const SNAPSHOT_RELOAD_KIND_NAMES = Object.freeze([
  'ready', 'shell', 'intraClip', 'magazine',
]);

export const SNAPSHOT_FLAGS = Object.freeze({
  DESTROYED: 1 << 0,
  BURNING: 1 << 1,
  FIRING: 1 << 2,
  SPOTTED: 1 << 3,
  SPECIAL_ACTIVE: 1 << 4,
  SPECIAL_PENDING: 1 << 5,
  AIRBORNE: 1 << 6,
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
  if (entity.specialAction?.active) flags |= SNAPSHOT_FLAGS.SPECIAL_ACTIVE;
  if (entity.specialAction?.pendingFire || entity.specialAction?.inFlightShellId != null) {
    flags |= SNAPSHOT_FLAGS.SPECIAL_PENDING;
  }
  if (entity.state?.grounded === false) flags |= SNAPSHOT_FLAGS.AIRBORNE;
  return flags;
}

/** Capture one active tank without retaining mutable simulation objects. */
export function captureEntitySnapshot(entity) {
  if (!entity || !entity.state || !entity.combat) return null;
  const state = entity.state;
  const speed = finite(state.speed);
  const yaw = finite(state.yaw);
  const snapshot = {
    id: String(entity.id),
    specId: String(entity.specId || (entity.spec && entity.spec.id) || ''),
    team: String(entity.team || ''),
    x: quantize(vectorAxis(state.pos, 0), POSITION_SCALE),
    y: quantize(vectorAxis(state.pos, 1), POSITION_SCALE),
    z: quantize(vectorAxis(state.pos, 2), POSITION_SCALE),
    vx: quantize(Math.sin(yaw) * speed, VELOCITY_SCALE),
    vy: quantize(finite(state.verticalSpeed, state._ride?.v), VELOCITY_SCALE),
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
    reloadKind: SNAPSHOT_RELOAD_KINDS[entity.combat.reload?.kind] ?? 0,
    magazineRounds: Math.max(0, entity.combat.magazine?.rounds | 0),
    magazineCapacity: Math.max(0, entity.combat.magazine?.capacity | 0),
    shellSlot: Math.max(0, Math.min(2, entity.combat.shellSlot | 0)),
    flags: entityFlags(entity),
  };
  if (entity.combat.eraSpent?.size) {
    snapshot.eraSpent = [...entity.combat.eraSpent].sort();
  }
  return snapshot;
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
    guided: shell.spec?.guided === true,
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
  meta = null,
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
    meta: meta && typeof meta === 'object' ? { ...meta } : null,
  };
}

function sameEntitySnapshot(a, b) {
  if (!a || !b) return false;
  for (const field of ENTITY_DELTA_FIELDS) {
    if (field === 'eraSpent') {
      const aSpent = a.eraSpent;
      const bSpent = b.eraSpent;
      if (aSpent === bSpent) continue;
      if (!Array.isArray(aSpent) || !Array.isArray(bSpent) ||
          aSpent.length !== bSpent.length) return false;
      let same = true;
      for (let index = 0; index < aSpent.length; index++) {
        if (aSpent[index] !== bSpent[index]) { same = false; break; }
      }
      if (!same) return false;
      continue;
    }
    if (a[field] !== b[field]) return false;
  }
  return true;
}

/**
 * Encode a viewer-specific full snapshot against an acknowledged full
 * baseline. Shells and events stay self-contained because they are transient;
 * stable tank state is reduced to changed rows plus explicit removals.
 */
export function createSnapshotDelta(current, baseline = null) {
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
  const currentIds = new Set();
  const changed = [];
  for (const entity of current.entities) {
    currentIds.add(entity.id);
    if (!sameEntitySnapshot(entity, baselineById.get(entity.id))) changed.push(entity);
  }
  const removedEntityIds = [];
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
  constructor({ capacity = 96 } = {}) {
    if (!Number.isInteger(capacity) || capacity < 2) {
      throw new TypeError('snapshot assembler capacity must be at least two');
    }
    this.capacity = capacity;
    this.history = new Map();
  }

  accept(packet) {
    if (!packet || !Number.isSafeInteger(packet.tick) || !Array.isArray(packet.entities)) {
      throw new TypeError('invalid snapshot packet');
    }
    const baseTick = packet.baseTick == null ? -1 : packet.baseTick;
    let entities;
    if (baseTick === -1) {
      entities = packet.entities.slice();
    } else {
      if (!Number.isSafeInteger(baseTick) || baseTick < 0 || baseTick >= packet.tick) {
        throw new TypeError('invalid snapshot baseline tick');
      }
      const baseline = this.history.get(baseTick);
      if (!baseline) return null;
      const byId = new Map(baseline.entities.map((entity) => [entity.id, entity]));
      for (const id of packet.removedEntityIds || []) byId.delete(String(id));
      for (const entity of packet.entities) byId.set(entity.id, entity);
      entities = [...byId.values()];
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
    while (this.history.size > this.capacity) {
      this.history.delete(this.history.keys().next().value);
    }
    return full;
  }

  clear() { this.history.clear(); }
}

export function decodeEntitySnapshot(entity, target = null) {
  const out = target || {};
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
  out.magazineRounds = Math.max(0, entity.magazineRounds | 0);
  out.magazineCapacity = Math.max(0, entity.magazineCapacity | 0);
  out.shellSlot = entity.shellSlot;
  out.flags = entity.flags;
  out.eraSpent = Array.isArray(entity.eraSpent) ? entity.eraSpent : [];
  return out;
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

// Grounded support samples can change which wheel/track probe owns the
// chassis floor. Their reported vertical velocity remains useful as a tangent
// but is not allowed to overshoot the two authoritative heights. Airborne
// motion keeps ordinary Hermite so ballistic arcs remain velocity-correct.
function monotoneHermite(p0, v0, p1, v1, t, durationS) {
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

function interpolateEntity(aRaw, bRaw, t, durationS, target = null,
  scratchA = null, scratchB = null) {
  const a = decodeEntitySnapshot(aRaw, scratchA);
  const b = decodeEntitySnapshot(bRaw, scratchB);
  const out = decodeEntitySnapshot(bRaw, target);
  out.x = hermite(a.x, a.vx, b.x, b.vx, t, durationS);
  const grounded = !(a.flags & SNAPSHOT_FLAGS.AIRBORNE) &&
    !(b.flags & SNAPSHOT_FLAGS.AIRBORNE);
  out.y = grounded
    ? monotoneHermite(a.y, a.vy, b.y, b.vy, t, durationS)
    : hermite(a.y, a.vy, b.y, b.vy, t, durationS);
  out.z = hermite(a.z, a.vz, b.z, b.vz, t, durationS);
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

function extrapolateEntity(raw, extraS, target = null) {
  const entity = decodeEntitySnapshot(raw, target);
  entity.x += entity.vx * extraS;
  entity.y += entity.vy * extraS;
  entity.z += entity.vz * extraS;
  entity.reloadS = Math.max(0, entity.reloadS - extraS);
  return entity;
}

function stabilizeRestPose(entity) {
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
export class SnapshotBuffer {
  constructor({
    interpolationDelayMs = 100,
    maxExtrapolationMs = 250,
    capacity = 32,
    immediateEntityId = null,
    adaptiveDelay = interpolationDelayMs > 0,
    maxInterpolationDelayMs = Math.max(interpolationDelayMs, 220),
  } = {}) {
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
    this.snapshots = [];
    this.latestTick = -1;
    this.arrivalJitterMs = 0;
    this.lastArrivalMs = null;
    this.lastServerTimeMs = null;
    this.lastSampleServerTimeMs = null;
    this.lastRenderTimeMs = null;
    this.acceptedSnapshots = 0;
    this.rejectedSnapshots = 0;
    this.sampleCount = 0;
    this.extrapolatedSamples = 0;
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
    this.sampleEntities = new Map();
    this.olderById = new Map();
    this.decodeScratchA = {};
    this.decodeScratchB = {};
    this.immediateAuthority = { tick: 0, serverTimeMs: 0, ackInputSeq: 0, entity: {} };
  }

  push(snapshot, receivedAtMs = null) {
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

  #observeArrival(serverTimeMs, receivedAtMs) {
    if (!this.adaptiveDelay || !Number.isFinite(receivedAtMs)) return;
    if (this.lastArrivalMs != null && receivedAtMs >= this.lastArrivalMs &&
        serverTimeMs > this.lastServerTimeMs) {
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

  clear() {
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
  }

  getStats() {
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

  sampleEntity(id) {
    let entity = this.sampleEntities.get(id);
    if (!entity) {
      entity = {};
      this.sampleEntities.set(id, entity);
    }
    return entity;
  }

  sample(localServerTimeMs) {
    if (!this.snapshots.length) return null;
    this.sampleCount++;
    if (this.adaptiveDelay) {
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
    let renderTime = localServerTimeMs - this.interpolationDelayMs;
    if (this.lastRenderTimeMs != null && renderTime < this.lastRenderTimeMs) {
      renderTime = this.lastRenderTimeMs;
    }
    this.lastRenderTimeMs = renderTime;
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

    const frame = this.sampleFrame;
    const entities = frame.entities;
    entities.length = 0;
    if (older === newer || newer.serverTimeMs === older.serverTimeMs) {
      const extraMs = Math.max(0, Math.min(this.maxExtrapolationMs,
        renderTime - newer.serverTimeMs));
      if (extraMs > 0) this.extrapolatedSamples++;
      for (const raw of newer.entities) {
        const sampled = extrapolateEntity(raw, extraMs / 1000, this.sampleEntity(raw.id));
        entities.push(raw.id === this.immediateEntityId ? sampled : stabilizeRestPose(sampled));
      }
    } else {
      const durationMs = newer.serverTimeMs - older.serverTimeMs;
      const t = Math.max(0, Math.min(1, (renderTime - older.serverTimeMs) / durationMs));
      const olderById = this.olderById;
      olderById.clear();
      for (const entity of older.entities) olderById.set(entity.id, entity);
      for (const current of newer.entities) {
        const previous = olderById.get(current.id);
        const sampled = previous
          ? interpolateEntity(previous, current, t, durationMs / 1000,
            this.sampleEntity(current.id), this.decodeScratchA, this.decodeScratchB)
          : decodeEntitySnapshot(current, this.sampleEntity(current.id));
        entities.push(current.id === this.immediateEntityId ? sampled : stabilizeRestPose(sampled));
      }
    }

    // The locally controlled tank must not inherit the remote-entity jitter
    // delay. Render it from the newest authority sample with the same bounded
    // extrapolator; opponents and teammates remain safely buffered. This is
    // still server truth—there is no client-side collision or damage sim—and
    // corrections remain small because snapshots arrive at 20 Hz.
    let immediateAuthority = null;
    if (this.immediateEntityId) {
      const latest = this.snapshots[this.snapshots.length - 1];
      const raw = latest.entities.find((entity) => entity.id === this.immediateEntityId);
      if (raw) {
        const extraMs = Math.max(0, Math.min(
          this.maxExtrapolationMs,
          localServerTimeMs - latest.serverTimeMs,
        ));
        const immediate = extrapolateEntity(raw, extraMs / 1000, this.sampleEntity(raw.id));
        const index = entities.findIndex((entity) => entity.id === this.immediateEntityId);
        if (index >= 0) entities[index] = immediate;
        else entities.push(immediate);
        immediateAuthority = this.immediateAuthority;
        immediateAuthority.tick = latest.tick;
        immediateAuthority.serverTimeMs = latest.serverTimeMs;
        immediateAuthority.ackInputSeq = latest.ackInputSeq;
        decodeEntitySnapshot(raw, immediateAuthority.entity);
      }
    }
    frame.tick = newer.tick;
    frame.serverTimeMs = renderTime;
    frame.ackInputSeq = newer.ackInputSeq;
    frame.shells = newer.shells || [];
    frame.events = newer.events || [];
    frame.meta = newer.meta || null;
    frame.immediateAuthority = immediateAuthority;
    return frame;
  }
}
