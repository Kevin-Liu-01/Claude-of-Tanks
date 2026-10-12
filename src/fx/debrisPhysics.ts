/**
 * debrisPhysics.ts — a collapsing building's pieces as rigid bodies in the presentation (physics lane, 2026-10-10; the
 * owner: "same with building destruction, just let physics work for these kinds of things").
 *
 * The destruction core decides what falls and when (sim/collapsePieces.ts: wall panels, piers, roof and floor slabs,
 * chimney drums, seeded by the structure and the blow); this pool lets them fall. Pieces are cosmetic and deterministic:
 * every peer runs the same pool from the same stage event over its own world (the same records on every tier, the
 * ground with the battle's craters and heaps in it), so they come down alike without a byte on the wire; the heap and
 * the openings stay the authoritative collision.
 *
 * - The pool is the engine's (sim/rigidBody.ts): fixed 1/60 s steps from an accumulator fed by the caller's clock (pass
 *   the fx clock's delta, so a pinned or stepped capture holds or steps it), at most MAX_STEPS_PER_ADVANCE a frame.
 * - A piece is a handle from spawn(); with a release delay it waits where it stands (framePoseAt gives its spawn pose)
 *   until its time — a progressive collapse releases the struck wall first, the far walls last.
 * - The presented hulls are kinematic boxes (setHulls each frame): a slab lands on a tank's deck, a panel is pushed
 *   aside by a hull driving through.
 * - Hard landings are reported (onImpact: point, speed, mass, handle) for the dust and the rubble's sound.
 * - Full: the oldest sleeper gives way; onEvict hands its final pose to the caller to freeze it as a static instance.
 *
 * Allocation: the tables are sized at creation (handles, pending releases, the engine's arrays); spawn, advance and
 * reads allocate nothing. Shapes are the caller's (createRigidBox / createRigidShape, cached by size).
 */
import { RIGID_STEP_S, createRigidWorld, type RigidEnvironment, type RigidShape, type RigidSpawn, type RigidWorld } from '../sim/rigidBody.ts';
import { hullQuaternion, wreckTurretProfile, type WreckTurretTank } from '../sim/wreckTurrets.ts';

/** Fixed steps one advance may run (a long frame catches up this far, then drops the rest). */
const MAX_STEPS_PER_ADVANCE = 4;
const HANDLE_NONE = -1;

export type DebrisImpactListener = (x: number, y: number, z: number, speedMps: number, massKg: number, handle: number) => void;
/** A sleeper evicted from a full pool: its final pose [x, y, z, qx, qy, qz, qw] (the caller freezes it there). */
export type DebrisEvictListener = (handle: number, pose: Float64Array) => void;

export interface DebrisPhysicsOptions {
  /** Live bodies (default 128). */
  capacity?: number;
  /** Handles alive at once, released or waiting (default 4 × capacity). */
  handles?: number;
  /** Contact spheres across all bodies (default capacity × 56). */
  spherePool?: number;
  /** Gravity (m/s², default 9.81: the ruleset's scale is the caller's). */
  gravity?: number;
}

export interface DebrisPhysics {
  readonly world: RigidWorld;
  /** What the pieces meet (the ground as drawn, the records; skip a falling structure's own records in isSolid). */
  bind(environment: RigidEnvironment | null): void;
  gravity: number;
  /**
   * A piece: its shape and spawn pose/velocity; released now or `releaseDelayS` later (it waits where it stands).
   * With `spawn.asleep` a waiting piece is in the world at once, solid and asleep — released pieces rest on it and
   * strike it — and at its release it wakes with its spawn velocities, unless a hit or a lost support woke it sooner
   * (then it falls as it was struck). Returns its handle, or -1 when the handle table is full.
   */
  spawn(shape: RigidShape, spawn: RigidSpawn, releaseDelayS?: number): number;
  /** An impulse (N s) at a world point on a piece; wakes it (a waiting piece is released first). */
  impulse(handle: number, jx: number, jy: number, jz: number, px: number, py: number, pz: number): void;
  /** A piece's velocity [vx, vy, vz, wx, wy, wz] (m/s, rad/s; a waiting piece's spawn velocities); false if unknown. */
  velocity(handle: number, out: Float64Array | number[]): boolean;
  /** The presented hulls this frame, as kinematic boxes (hull and turret boxes from their armour). */
  setHulls(tanks: readonly (WreckTurretTank | null | undefined)[]): void;
  /** Advance by the caller's clock delta (s): fixed steps; returns the interpolation alpha for framePoseAt. */
  advance(dtS: number): number;
  /** A piece's authoring-frame pose interpolated to this frame; false for an unknown handle. */
  framePoseAt(handle: number, out: Float64Array | number[]): boolean;
  /** Whether a piece's body sleeps: come to rest, or a resting piece still waiting for its release (a waiting piece
   *  outside the world does not). */
  asleep(handle: number): boolean;
  onImpact(listener: DebrisImpactListener): () => void;
  onEvict(listener: DebrisEvictListener): () => void;
  /** Drop a piece (its body and handle). */
  release(handle: number): void;
  /** Drop everything (a new battle, a Studio scene load). */
  reset(): void;
  stats(): { bodies: number; awake: number; waiting: number; handles: number; timeS: number };
}

export function createDebrisPhysics(options: DebrisPhysicsOptions = {}): DebrisPhysics {
  const capacity = Math.max(1, options.capacity ?? 128) | 0;
  const handleCapacity = Math.max(capacity, options.handles ?? capacity * 4) | 0;
  const world = createRigidWorld({
    capacity,
    kinematicCapacity: 2 * 64 + 8,
    gravity: options.gravity ?? 9.81,
    velocityIterations: 8,
    positionIterations: 3,
    contactsPerBody: 28,
    spherePool: options.spherePool ?? capacity * 56,
  });
  // handles: slot (-1 waiting or retired), the waiting spawn's data, the release time
  const handleSlot = new Int32Array(handleCapacity).fill(HANDLE_NONE);
  const handleLive = new Uint8Array(handleCapacity);
  const handleShape: (RigidShape | null)[] = new Array(handleCapacity).fill(null);
  const handleRelease = new Float64Array(handleCapacity);
  /** 1: the piece waits in the world asleep (spawn.asleep); its spawn velocities wait for its release. */
  const handleResting = new Uint8Array(handleCapacity);
  // the waiting spawn: x, y, z, qx, qy, qz, qw, vx, vy, vz, wx, wy, wz
  const handleSpawn = new Float64Array(handleCapacity * 13);
  const slotHandle = new Int32Array(capacity).fill(HANDLE_NONE);
  let nextHandle = 0;
  let waiting = 0;
  let handles = 0;
  let timeS = 0;
  let accumulator = 0;
  let alpha = 1;
  const impactListeners: DebrisImpactListener[] = [];
  const evictListeners: DebrisEvictListener[] = [];
  const evictPose = new Float64Array(7);
  const q = new Float64Array(8);
  const r = new Float64Array(3);
  const spawnScratch: RigidSpawn = { x: 0, y: 0, z: 0 };

  function rotate(qo: number, x: number, y: number, z: number): void {
    const qx = q[qo], qy = q[qo + 1], qz = q[qo + 2], qw = q[qo + 3];
    const cx = qy * z - qz * y + qw * x, cy = qz * x - qx * z + qw * y, cz = qx * y - qy * x + qw * z;
    r[0] = x + 2 * (qy * cz - qz * cy);
    r[1] = y + 2 * (qz * cx - qx * cz);
    r[2] = z + 2 * (qx * cy - qy * cx);
  }

  function evictOldestSleeper(): boolean {
    let oldest = -1, age = -1;
    for (let slot = 0; slot < capacity; slot++) {
      if (!world.active[slot] || !world.asleep[slot]) continue;
      if (world.age[slot] > age) { age = world.age[slot]; oldest = slot; }
    }
    if (oldest < 0) return false;
    const handle = slotHandle[oldest];
    world.framePose(oldest, evictPose);
    world.remove(oldest);
    slotHandle[oldest] = HANDLE_NONE;
    if (handle >= 0) {
      handleSlot[handle] = HANDLE_NONE;
      handleLive[handle] = 0;
      handleShape[handle] = null;
      handles--;
      for (let i = 0; i < evictListeners.length; i++) evictListeners[i](handle, evictPose);
    }
    return true;
  }

  function releaseHandle(handle: number): void {
    const o = handle * 13;
    spawnScratch.x = handleSpawn[o]; spawnScratch.y = handleSpawn[o + 1]; spawnScratch.z = handleSpawn[o + 2];
    spawnScratch.qx = handleSpawn[o + 3]; spawnScratch.qy = handleSpawn[o + 4]; spawnScratch.qz = handleSpawn[o + 5]; spawnScratch.qw = handleSpawn[o + 6];
    spawnScratch.vx = handleSpawn[o + 7]; spawnScratch.vy = handleSpawn[o + 8]; spawnScratch.vz = handleSpawn[o + 9];
    spawnScratch.wx = handleSpawn[o + 10]; spawnScratch.wy = handleSpawn[o + 11]; spawnScratch.wz = handleSpawn[o + 12];
    const shape = handleShape[handle]!;
    // a resting piece enters at once, asleep and still (its velocities wait for its release)
    const resting = handleResting[handle] === 1;
    spawnScratch.asleep = resting;
    if (resting) { spawnScratch.vx = spawnScratch.vy = spawnScratch.vz = 0; spawnScratch.wx = spawnScratch.wy = spawnScratch.wz = 0; }
    let slot = world.spawn(shape, spawnScratch);
    if (slot < 0 && evictOldestSleeper()) slot = world.spawn(shape, spawnScratch);
    if (slot < 0) return; // still full of moving pieces: it waits a step more
    handleSlot[handle] = slot;
    slotHandle[slot] = handle;
    if (!resting) waiting--;
  }

  function releaseDue(): void {
    if (waiting === 0) return;
    for (let handle = 0; handle < handleCapacity; handle++) {
      if (!handleLive[handle] || handleRelease[handle] > timeS + 1e-9) continue;
      if (handleSlot[handle] === HANDLE_NONE) releaseHandle(handle);
      else if (handleResting[handle]) wakeResting(handle);
    }
  }

  /** A resting piece's release: asleep still, it takes its spawn velocities; woken sooner, it keeps its own motion. */
  function wakeResting(handle: number): void {
    handleResting[handle] = 0;
    waiting--;
    const slot = handleSlot[handle];
    if (slot === HANDLE_NONE || !world.asleep[slot]) return;
    const o = handle * 13;
    world.setVelocity(slot, handleSpawn[o + 7], handleSpawn[o + 8], handleSpawn[o + 9], handleSpawn[o + 10], handleSpawn[o + 11], handleSpawn[o + 12]);
  }

  function dispatchImpacts(): void {
    if (impactListeners.length === 0) return;
    for (let k = 0; k < world.impactCount; k++) {
      const handle = slotHandle[world.impactSlot[k]];
      if (handle < 0) continue;
      for (let i = 0; i < impactListeners.length; i++) {
        impactListeners[i](world.impactX[k], world.impactY[k], world.impactZ[k], world.impactSpeed[k], world.impactMass[k], handle);
      }
    }
  }

  const pool: DebrisPhysics = {
    world,
    bind(environment) { world.bindEnvironment(environment); },
    get gravity() { return world.gravity; },
    set gravity(value: number) { world.gravity = value; },
    spawn(shape, spawn, releaseDelayS = 0) {
      // the next free handle (a ring: the oldest retired ones come round first)
      let handle = -1;
      for (let n = 0; n < handleCapacity; n++) {
        const candidate = (nextHandle + n) % handleCapacity;
        if (!handleLive[candidate]) { handle = candidate; break; }
      }
      if (handle < 0) return -1;
      nextHandle = (handle + 1) % handleCapacity;
      const o = handle * 13;
      handleSpawn[o] = spawn.x; handleSpawn[o + 1] = spawn.y; handleSpawn[o + 2] = spawn.z;
      let qx = spawn.qx ?? 0, qy = spawn.qy ?? 0, qz = spawn.qz ?? 0, qw = spawn.qw ?? 1;
      const n = 1 / (Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw) || 1);
      qx *= n; qy *= n; qz *= n; qw *= n;
      handleSpawn[o + 3] = qx; handleSpawn[o + 4] = qy; handleSpawn[o + 5] = qz; handleSpawn[o + 6] = qw;
      handleSpawn[o + 7] = spawn.vx ?? 0; handleSpawn[o + 8] = spawn.vy ?? 0; handleSpawn[o + 9] = spawn.vz ?? 0;
      handleSpawn[o + 10] = spawn.wx ?? 0; handleSpawn[o + 11] = spawn.wy ?? 0; handleSpawn[o + 12] = spawn.wz ?? 0;
      handleShape[handle] = shape;
      handleLive[handle] = 1;
      handleSlot[handle] = HANDLE_NONE;
      handleRelease[handle] = timeS + Math.max(0, releaseDelayS);
      handleResting[handle] = spawn.asleep && releaseDelayS > 0 ? 1 : 0;
      handles++;
      waiting++;
      // released now, or (resting) in the world now and woken at its time
      if (releaseDelayS <= 0 || handleResting[handle]) releaseHandle(handle);
      return handle;
    },
    impulse(handle, jx, jy, jz, x, y, z) {
      if (handle < 0 || handle >= handleCapacity || !handleLive[handle]) return;
      if (handleSlot[handle] === HANDLE_NONE) { handleRelease[handle] = timeS; releaseHandle(handle); }
      else if (handleResting[handle]) { handleResting[handle] = 0; waiting--; }
      const slot = handleSlot[handle];
      if (slot !== HANDLE_NONE) world.applyImpulse(slot, jx, jy, jz, x, y, z);
    },
    velocity(handle, out) {
      if (handle < 0 || handle >= handleCapacity || !handleLive[handle]) return false;
      const slot = handleSlot[handle];
      if (slot === HANDLE_NONE || handleResting[handle]) {
        const o = handle * 13;
        for (let k = 0; k < 6; k++) out[k] = handleSpawn[o + 7 + k];
        return true;
      }
      out[0] = world.vx[slot]; out[1] = world.vy[slot]; out[2] = world.vz[slot];
      out[3] = world.wx[slot]; out[4] = world.wy[slot]; out[5] = world.wz[slot];
      return true;
    },
    setHulls(tanks) {
      let k = 0;
      for (const tank of tanks) {
        if (!tank || !tank.state || tank.modeActive === false || tank.aerial?.active || k >= 128) continue;
        const state = tank.state;
        const profile = wreckTurretProfile(tank.spec, state.modeScale ?? 1);
        const s = profile.scale;
        hullQuaternion(state.yaw, state.visualPitch, state.visualRoll, q, 0);
        const vx = Math.sin(state.yaw) * state.speed, vz = Math.cos(state.yaw) * state.speed;
        const vy = Number.isFinite(state.verticalSpeed) ? state.verticalSpeed! : 0;
        const yawRate = Number.isFinite(state.yawRate) ? state.yawRate! : 0;
        rotate(0, profile.hullCenter[0] * s, profile.hullCenter[1] * s, profile.hullCenter[2] * s);
        const hullIndex = k++;
        world.setKinematic(hullIndex, hullIndex + 1, state.pos.x + r[0], state.pos.y + r[1], state.pos.z + r[2], q[0], q[1], q[2], q[3],
          profile.hullHalf[0] * s, profile.hullHalf[1] * s, profile.hullHalf[2] * s, vx, vy, vz, 0, yawRate, 0);
        if (profile.shape && !tank.combat?.destroyed && k < 128) {
          rotate(0, profile.pivot[0] * s, profile.pivot[1] * s, profile.pivot[2] * s);
          const ox = state.pos.x + r[0], oy = state.pos.y + r[1], oz = state.pos.z + r[2];
          // q · Ry(turretYaw) into q[4..7]
          const sh = Math.sin(state.turretYaw * 0.5), ch = Math.cos(state.turretYaw * 0.5);
          q[4] = q[0] * ch - q[2] * sh; q[5] = q[1] * ch + q[3] * sh; q[6] = q[2] * ch + q[0] * sh; q[7] = q[3] * ch - q[1] * sh;
          rotate(4, profile.turretCenter[0] * s, profile.turretCenter[1] * s, profile.turretCenter[2] * s);
          const turretIndex = k++;
          world.setKinematic(turretIndex, hullIndex + 1, ox + r[0], oy + r[1], oz + r[2], q[4], q[5], q[6], q[7],
            profile.turretHalf[0] * s, profile.turretHalf[1] * s, profile.turretHalf[2] * s, vx, vy, vz, 0, yawRate, 0);
        }
      }
      world.setKinematicCount(k);
    },
    advance(dtS) {
      if (!(dtS > 0)) return alpha;
      accumulator += Math.min(dtS, 0.25);
      let steps = 0;
      while (accumulator >= RIGID_STEP_S && steps < MAX_STEPS_PER_ADVANCE) {
        releaseDue();
        world.step(RIGID_STEP_S);
        timeS += RIGID_STEP_S;
        dispatchImpacts();
        accumulator -= RIGID_STEP_S;
        steps++;
      }
      if (steps === MAX_STEPS_PER_ADVANCE && accumulator > RIGID_STEP_S) accumulator = RIGID_STEP_S * 0.5;
      alpha = Math.min(1, accumulator / RIGID_STEP_S);
      return alpha;
    },
    framePoseAt(handle, out) {
      if (handle < 0 || handle >= handleCapacity || !handleLive[handle]) return false;
      const slot = handleSlot[handle];
      if (slot === HANDLE_NONE) {
        const o = handle * 13;
        for (let k = 0; k < 7; k++) out[k] = handleSpawn[o + k];
        return true;
      }
      world.framePoseAt(slot, alpha, out);
      return true;
    },
    asleep(handle) {
      if (handle < 0 || handle >= handleCapacity || !handleLive[handle]) return false;
      const slot = handleSlot[handle];
      return slot !== HANDLE_NONE && world.asleep[slot] === 1;
    },
    onImpact(listener) {
      impactListeners.push(listener);
      return () => { const i = impactListeners.indexOf(listener); if (i >= 0) impactListeners.splice(i, 1); };
    },
    onEvict(listener) {
      evictListeners.push(listener);
      return () => { const i = evictListeners.indexOf(listener); if (i >= 0) evictListeners.splice(i, 1); };
    },
    release(handle) {
      if (handle < 0 || handle >= handleCapacity || !handleLive[handle]) return;
      const slot = handleSlot[handle];
      if (slot !== HANDLE_NONE) { world.remove(slot); slotHandle[slot] = HANDLE_NONE; } else waiting--;
      if (handleResting[handle]) { handleResting[handle] = 0; waiting--; }
      handleLive[handle] = 0;
      handleSlot[handle] = HANDLE_NONE;
      handleShape[handle] = null;
      handles--;
    },
    reset() {
      world.clear();
      handleLive.fill(0);
      handleResting.fill(0);
      handleSlot.fill(HANDLE_NONE);
      slotHandle.fill(HANDLE_NONE);
      handleShape.fill(null);
      waiting = 0; handles = 0; nextHandle = 0; timeS = 0; accumulator = 0; alpha = 1;
    },
    stats() {
      return { bodies: world.count, awake: world.awakeCount, waiting, handles, timeS };
    },
  };
  return pool;
}
