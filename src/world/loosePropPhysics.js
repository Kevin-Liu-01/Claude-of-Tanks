// Deterministic lightweight rigid-body motion for small world dressing.
//
// This is deliberately narrower than a general physics engine: loose props
// are circles in the horizontal plane with a spherical terrain support. The
// approximation is stable for cans, churns, cones and other hull-kicked
// clutter, while preserving the game's fixed-step/no-allocation hot-loop
// rules. Rendering still uses the full authored mesh and quaternion tumble.

export const LOOSE_PROP_STEP_S = 1 / 60;

const GRAVITY = 9.81;
const EPS = 1e-8;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** Create one sleeping body. `baseY` is the authored mesh's ground origin. */
export function createLoosePropBody({
  x, baseY, z, radius, height,
  mass = 1, restitution = 0.32, friction = 2.2,
  airDrag = 0.16, angularDrag = 0.42, spinBias = 1,
}) {
  const h = Math.max(0.12, height);
  const r = Math.max(0.08, Math.min(radius, h * 0.62));
  return {
    homeX: x, homeBaseY: baseY, homeZ: z,
    x, y: baseY + h * 0.5, z,
    radius: r, height: h,
    invMass: 1 / Math.max(0.25, mass),
    restitution: clamp(restitution, 0.05, 0.75),
    friction: Math.max(0.2, friction),
    airDrag: Math.max(0, airDrag),
    angularDrag: Math.max(0, angularDrag),
    spinBias: spinBias < 0 ? -1 : 1,
    vx: 0, vy: 0, vz: 0,
    wx: 0, wy: 0, wz: 0,
    qx: 0, qy: 0, qz: 0, qw: 1,
    active: false,
    cooldownS: 0,
    sleepS: 0,
  };
}

export function resetLoosePropBody(b) {
  b.x = b.homeX; b.y = b.homeBaseY + b.height * 0.5; b.z = b.homeZ;
  b.vx = 0; b.vy = 0; b.vz = 0;
  b.wx = 0; b.wy = 0; b.wz = 0;
  b.qx = 0; b.qy = 0; b.qz = 0; b.qw = 1;
  b.active = false; b.cooldownS = 0; b.sleepS = 0;
  return b;
}

/**
 * Apply a repeatable hull/shell/blast kick. Returns false during the short
 * contact debounce so one overlapping tank does not inject energy at 60 Hz.
 */
export function kickLooseProp(b, dx, dz, speed = 0, cause = 'ram') {
  if (b.cooldownS > 0) return false;
  const ll = Math.hypot(dx, dz);
  const ux = ll > EPS ? dx / ll : 0;
  const uz = ll > EPS ? dz / ll : 1;
  const base = cause === 'blast' ? 7.4 : cause === 'shell' ? 6.2
    : clamp(1.7 + Math.max(0, speed) * 0.46, 2.2, 7.8);
  const kick = base * b.invMass;
  b.vx += ux * kick;
  b.vz += uz * kick;
  const planar = Math.hypot(b.vx, b.vz);
  if (planar > 12) {
    const k = 12 / planar;
    b.vx *= k; b.vz *= k;
  }
  b.vy = Math.max(b.vy, (cause === 'ram' ? 0.7 + Math.min(speed, 14) * 0.08 : 1.7) * b.invMass);
  // direction x up: the same hinge polarity as toppled trees/poles
  const spin = (5.2 + Math.min(Math.max(speed, 0), 14) * 0.42) * b.invMass;
  b.wx += uz * spin * b.spinBias;
  b.wy += 0.55 * spin * b.spinBias;
  b.wz -= ux * spin * b.spinBias;
  b.active = true;
  b.sleepS = 0;
  b.cooldownS = cause === 'ram' ? 0.16 : 0.08;
  return true;
}

function integrateQuaternion(b, dt) {
  const qx = b.qx, qy = b.qy, qz = b.qz, qw = b.qw;
  const hx = b.wx * dt * 0.5, hy = b.wy * dt * 0.5, hz = b.wz * dt * 0.5;
  b.qx = qx + hx * qw + hy * qz - hz * qy;
  b.qy = qy - hx * qz + hy * qw + hz * qx;
  b.qz = qz + hx * qy - hy * qx + hz * qw;
  b.qw = qw - hx * qx - hy * qy - hz * qz;
  const inv = 1 / Math.max(EPS, Math.hypot(b.qx, b.qy, b.qz, b.qw));
  b.qx *= inv; b.qy *= inv; b.qz *= inv; b.qw *= inv;
}

/**
 * Advance one fixed step. Return bits: 1 moved, 2 bounced, 4 went to sleep.
 * `normalAt` may return a reused scratch object.
 */
export function stepLoosePropBody(b, dt, heightAt, normalAt = null, bounds = 486) {
  if (!b.active || dt <= 0) return 0;
  b.cooldownS = Math.max(0, b.cooldownS - dt);
  b.vy -= GRAVITY * dt;
  const air = Math.max(0, 1 - b.airDrag * dt);
  b.vx *= air; b.vz *= air;
  const ad = Math.max(0, 1 - b.angularDrag * dt);
  b.wx *= ad; b.wy *= ad; b.wz *= ad;

  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  integrateQuaternion(b, dt);
  let flags = 1;

  // Battlefield edge is a soft invisible curb for loose presentation props.
  if (b.x < -bounds || b.x > bounds) {
    b.x = clamp(b.x, -bounds, bounds); b.vx *= -b.restitution; flags |= 2;
  }
  if (b.z < -bounds || b.z > bounds) {
    b.z = clamp(b.z, -bounds, bounds); b.vz *= -b.restitution; flags |= 2;
  }

  const floorY = heightAt(b.x, b.z) + b.radius;
  let grounded = false;
  if (b.y <= floorY) {
    grounded = true;
    b.y = floorY;
    const n = normalAt ? normalAt(b.x, b.z) : null;
    const nx = n ? n.x : 0, ny = n ? Math.max(0.25, n.y) : 1, nz = n ? n.z : 0;
    const vn = b.vx * nx + b.vy * ny + b.vz * nz;
    if (vn < -0.48) {
      b.vx -= (1 + b.restitution) * vn * nx;
      b.vy -= (1 + b.restitution) * vn * ny;
      b.vz -= (1 + b.restitution) * vn * nz;
      b.vx *= 0.86; b.vz *= 0.86;
      flags |= 2;
    } else {
      if (b.vy < 0) b.vy = 0;
      // Gravity projected into the terrain plane lets clutter roll down a
      // bank instead of freezing on a sloped height sample.
      b.vx += GRAVITY * nx * ny * dt;
      b.vz += GRAVITY * nz * ny * dt;
    }
    const grip = Math.max(0, 1 - b.friction * dt);
    b.vx *= grip; b.vz *= grip;
    // Blend toward rolling angular velocity without erasing impact tumble.
    const rollX = b.vz / b.radius, rollZ = -b.vx / b.radius;
    b.wx += (rollX - b.wx) * Math.min(1, dt * 3.2);
    b.wz += (rollZ - b.wz) * Math.min(1, dt * 3.2);
  }

  const planar = Math.hypot(b.vx, b.vz);
  const angular = Math.hypot(b.wx, b.wy, b.wz);
  if (grounded && Math.abs(b.vy) < 0.08 && planar < 0.11 && angular < 0.72) {
    b.sleepS += dt;
    if (b.sleepS >= 0.72) {
      b.vx = 0; b.vy = 0; b.vz = 0;
      b.wx = 0; b.wy = 0; b.wz = 0;
      b.active = false; b.cooldownS = 0; b.sleepS = 0;
      flags |= 4;
    }
  } else b.sleepS = 0;
  return flags;
}

function applyWallBounce(b, nx, nz, depth) {
  b.x += nx * depth; b.z += nz * depth;
  const vn = b.vx * nx + b.vz * nz;
  if (vn < 0) {
    const e = Math.max(0.12, b.restitution * 0.72);
    b.vx -= (1 + e) * vn * nx;
    b.vz -= (1 + e) * vn * nz;
    b.vx *= 0.82; b.vz *= 0.82;
    b.wy += (nx * b.vz - nz * b.vx) * 0.8 * b.spinBias;
  }
  b.active = true; b.sleepS = 0;
  return true;
}

/** Resolve a loose body's circle against one authored static obstacle. */
export function resolveLoosePropObstacle(b, ob) {
  if (!ob || ob.crushed || ob.dead) return false;
  if (b.y + b.radius < ob.min[1] || b.y - b.radius > ob.max[1]) return false;
  const sh = ob.shape2;
  if (sh && sh.kind === 'circle') {
    const dx = b.x - sh.cx, dz = b.z - sh.cz;
    const rr = b.radius + sh.r, d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr) return false;
    const d = Math.sqrt(Math.max(d2, EPS));
    return applyWallBounce(b, d2 > EPS ? dx / d : 1, d2 > EPS ? dz / d : 0, rr - d);
  }

  let cx, cz, hw, hl, yaw;
  if (sh && sh.kind === 'obb') {
    cx = sh.cx; cz = sh.cz; hw = sh.hw; hl = sh.hl; yaw = sh.yaw;
  } else {
    cx = (ob.min[0] + ob.max[0]) * 0.5;
    cz = (ob.min[2] + ob.max[2]) * 0.5;
    hw = (ob.max[0] - ob.min[0]) * 0.5;
    hl = (ob.max[2] - ob.min[2]) * 0.5;
    yaw = 0;
  }
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const dx = b.x - cx, dz = b.z - cz;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const qx = clamp(lx, -hw, hw), qz = clamp(lz, -hl, hl);
  let vx = lx - qx, vz = lz - qz;
  let d2 = vx * vx + vz * vz, depth;
  if (d2 >= b.radius * b.radius) return false;
  if (d2 <= EPS) {
    const px = hw + b.radius - Math.abs(lx);
    const pz = hl + b.radius - Math.abs(lz);
    if (px < pz) { vx = lx >= 0 ? 1 : -1; vz = 0; depth = px; }
    else { vx = 0; vz = lz >= 0 ? 1 : -1; depth = pz; }
  } else {
    const d = Math.sqrt(d2); vx /= d; vz /= d; depth = b.radius - d;
  }
  return applyWallBounce(b, vx * c + vz * s, -vx * s + vz * c, depth);
}

/** Resolve two loose circles. Return wake bits: 1 for a, 2 for b. */
export function resolveLoosePropPair(a, b) {
  if ((!a.active && !b.active) || Math.abs(a.y - b.y) > a.radius + b.radius) return 0;
  const dx = b.x - a.x, dz = b.z - a.z;
  const rr = a.radius + b.radius, d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr) return 0;
  const d = Math.sqrt(Math.max(d2, EPS));
  const nx = d2 > EPS ? dx / d : 1, nz = d2 > EPS ? dz / d : 0;
  const overlap = rr - d;
  const wa = a.active ? a.invMass : 0;
  const wb = b.active ? b.invMass : 0;
  const inv = 1 / Math.max(EPS, wa + wb);
  if (wa > 0) { a.x -= nx * overlap * wa * inv; a.z -= nz * overlap * wa * inv; }
  if (wb > 0) { b.x += nx * overlap * wb * inv; b.z += nz * overlap * wb * inv; }
  const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  if (rel >= 0) return 0;
  const impulse = -(1 + Math.min(a.restitution, b.restitution)) * rel
    / Math.max(EPS, a.invMass + b.invMass);
  a.vx -= impulse * a.invMass * nx; a.vz -= impulse * a.invMass * nz;
  b.vx += impulse * b.invMass * nx; b.vz += impulse * b.invMass * nz;
  let wakes = 0;
  if (!a.active && impulse > 0.16) { a.active = true; a.sleepS = 0; wakes |= 1; }
  if (!b.active && impulse > 0.16) { b.active = true; b.sleepS = 0; wakes |= 2; }
  return wakes;
}
