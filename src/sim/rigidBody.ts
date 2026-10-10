/**
 * rigidBody.ts — the game's own deterministic rigid bodies (physics lane, 2026-10-10; the owner: "make turret popping a
 * lot better bc it blows up nicely but then the turret snaps into a pre-ordained resting position. same with building
 * destruction, just let physics work for these kinds of things").
 *
 * A small first-party engine, sized for what the battlefield throws: a popped turret with its gun, a building's wall
 * panels and roof slabs, a toppling chimney, blocks and beams. No dependency, no DOM, no wall clock, no Math.random:
 * the same inputs give the same poses bit for bit, so the authority (solo step, browser host, dedicated actor) owns
 * every resting pose and the peers draw what it decided.
 *
 * Model
 *  - A body is a rigid frame with a mass, a diagonal inertia about its centre of mass and two descriptions of its
 *    shape: CONTACT SPHERES (points with a radius, laid over its surface by createRigidShape) that meet the world, and
 *    SOLIDS (boxes and capsules) that the world's corners and other bodies' spheres meet. A box is a rounded box (its
 *    corners, edge midpoints and a face grid), a cylinder a chain of spheres along its axis (it rolls) plus rings on
 *    its caps (it stands), a gun barrel a chain of thin spheres.
 *  - The world it meets: the ground (`groundAt`, the drawn contact surface with the battle's craters and rubble in it;
 *    the normal by central differences of the same sampler), the static collision records (`queryStatic`: vertical
 *    prisms — obb, circle, convex or compound parts with their own heights; the same records the shards carry), the
 *    kinematic boxes the caller sets every step (tank hulls and turrets, with their velocities) and the other bodies.
 *  - Contacts resolve by sequential impulses (accumulated normal impulse >= 0, Coulomb friction in a box cone,
 *    restitution above an approach speed, warm started per sphere and partner) and penetration by a split impulse
 *    (pseudo velocities that move the body without adding energy). Semi-implicit Euler at a fixed step; quaternion
 *    orientation; linear and angular drag; rolling resistance while touching.
 *  - A body whose speed stays under the sleep thresholds for SLEEP_STEPS sleeps: its pose freezes where the physics
 *    put it. A moving kinematic box, an awake body or a kick wakes it; a sleeper re-checks its support every
 *    SUPPORT_CHECK_STEPS (a crater dug or a building gone under it wakes it).
 *  - Hard landings are reported (`impact*` arrays: point, approach speed, mass, partner kind) for dust and sound.
 *
 * Budget: every array is allocated at creation (struct of arrays); a step allocates nothing. Bodies, contacts per body,
 * iterations and the sphere pool are bounded; sleeping bodies cost a support check every SUPPORT_CHECK_STEPS.
 * Iteration order is slot order and generation order throughout, so two runs agree to the bit.
 */
import type { CollisionRecord, SimpleCollisionShape } from '../world/collision.ts';

export const RIGID_STEP_S = 1 / 60;

/** Penetration the split impulse leaves alone (m) and the share of the rest it removes a step. */
const SLOP_M = 0.004;
const BAUMGARTE = 0.3;
/** Restitution applies to approaches faster than this (m/s): slower contacts come to rest instead of chattering. */
const RESTITUTION_MIN_MPS = 1.1;
/** Contacts are generated this far before touching (m), so a resting body keeps its contacts between steps. */
const CONTACT_MARGIN_M = 0.02;
/** Sleep: below these speeds (m/s, rad/s) for this many steps while touching something. */
const SLEEP_LINEAR_MPS = 0.07;
const SLEEP_ANGULAR_RADS = 0.12;
const SLEEP_STEPS = 36;
/** A body that never settles (pinned between movers, a numerical edge) sleeps anyway after this many steps (25 s). */
const FORCE_SLEEP_STEPS = 1500;
/** A sleeper checks it still stands on something this often (steps). */
const SUPPORT_CHECK_STEPS = 30;
/** Wake a sleeper when something meets it faster than this (m/s). */
const WAKE_MPS = 0.25;
const MAX_LINEAR_MPS = 70;
const MAX_ANGULAR_RADS = 28;
/** Central-difference half step of the ground normal (m): about the drawn mesh's lattice. */
const GROUND_NORMAL_EPS_M = 0.45;
/** Impacts below this approach speed are not reported (m/s); one report per body per cooldown. */
const IMPACT_MIN_MPS = 1.6;
const IMPACT_COOLDOWN_STEPS = 9;
const MAX_IMPACTS_PER_STEP = 64;

/** Partner kinds, as reported with an impact. */
export const RIGID_PARTNER = Object.freeze({ GROUND: 0, STATIC: 1, KINEMATIC: 2, BODY: 3 } as const);

// Ground and static-record surface constants (a body's own material is combined with these).
const GROUND_FRICTION = 0.85;
const GROUND_RESTITUTION = 0.12;
const STATIC_FRICTION = 0.7;
const STATIC_RESTITUTION = 0.28;
const KINEMATIC_FRICTION = 0.6;
const KINEMATIC_RESTITUTION = 0.22;

// Solid layout: SOLID_STRIDE floats per solid.
//   box:     [0, cx, cy, cz, qx, qy, qz, qw, hx, hy, hz, 0, 0, 0]
//   capsule: [1, ax, ay, az, bx, by, bz, r, 0, ...]
const SOLID_STRIDE = 14;
const SOLID_BOX = 0;
const SOLID_CAPSULE = 1;

type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number];

/** One part of a shape, in the shape's authoring frame (metres, kilograms). */
export type RigidPartSpec =
  | {
    kind: 'box';
    center: Vec3;
    half: Vec3;
    rotation?: Quat;
    mass: number;
    /** Largest gap between face contact points (m); default scales with the box (0.9 m up to longest / 5). */
    spacing?: number;
    /** Rounding of the corners (m); default min(0.04, a third of the thinnest half extent). */
    edgeRadius?: number;
    /** false: the part has mass and a solid but lays no contact spheres (a part inside another). */
    contacts?: boolean;
  }
  | { kind: 'capsule'; a: Vec3; b: Vec3; radius: number; mass: number; spacing?: number; contacts?: boolean }
  | {
    kind: 'cylinder';
    center: Vec3;
    /** Along the local Y axis, before `rotation`. */
    halfHeight: number;
    radius: number;
    rotation?: Quat;
    mass: number;
    /** Points on each cap ring (default 10). */
    segments?: number;
    contacts?: boolean;
  };

export interface RigidShapeOptions {
  /** Body restitution (0..1, default 0.3) and friction (default 0.6). */
  restitution?: number;
  friction?: number;
  /** Rolling resistance while touching (1/s, default 0.15): angular speed decays at this rate. Keep it small for boxes
   * (their corners stop them; a large value holds a toppling body up on its edge), larger for what rolls. */
  rolling?: number;
  /** A round body (a drum, a shaft on its side) rests on a line: it may sleep without support on both sides. */
  rolls?: boolean;
  /** Air drag (1/s): linear (default 0.02) and angular (default 0.08). */
  linearDrag?: number;
  angularDrag?: number;
  /** At most this many contact spheres (default 64): a dense face grid widens until it fits. */
  maxSpheres?: number;
}

/** An immutable shape: mass properties about the centre of mass, its contact spheres and solids. */
export interface RigidShape {
  readonly mass: number;
  readonly invMass: number;
  /** Diagonal inverse inertia in the body frame (1/(kg m^2)). */
  readonly invInertia: Float64Array;
  /** The centre of mass in the authoring frame: the frame's origin stands at p − R·com. */
  readonly com: Float64Array;
  /** x, y, z, r per contact sphere, relative to the centre of mass. */
  readonly spheres: Float64Array;
  readonly sphereCount: number;
  /** The solid each contact sphere was laid on (a box part's spheres meet other boxes along one shared axis). */
  readonly sphereSolid: Int16Array;
  /** SOLID_STRIDE floats per solid, relative to the centre of mass. */
  readonly solids: Float64Array;
  readonly solidCount: number;
  /** Bounding radius about the centre of mass (m). */
  readonly radius: number;
  readonly restitution: number;
  readonly friction: number;
  readonly rolling: number;
  readonly rolls: boolean;
  readonly linearDrag: number;
  readonly angularDrag: number;
}

/** What the bodies stand on and hit. */
export interface RigidEnvironment {
  /** The ground's contact height at x, z (m). */
  groundAt(x: number, z: number): number;
  /** Static collision records whose footprint AABB overlaps the rectangle, into `out` (cleared first). */
  queryStatic?(minX: number, minZ: number, maxX: number, maxZ: number, out: CollisionRecord[]): CollisionRecord[];
  /** Whether a static record is solid to bodies (default: every record that is neither crushed nor dead). */
  isSolid?(record: CollisionRecord): boolean;
}

export interface RigidWorldOptions {
  /** Body slots (default 32). */
  capacity?: number;
  /** Kinematic box slots (default 128). */
  kinematicCapacity?: number;
  /** Gravity (m/s^2, default 9.81). */
  gravity?: number;
  /** Velocity iterations (default 10) and position (split impulse) iterations (default 4). */
  velocityIterations?: number;
  positionIterations?: number;
  /** Contacts kept per body and step (default 32: the deepest win). */
  contactsPerBody?: number;
  /** Contact spheres across all bodies (default capacity × 64). */
  spherePool?: number;
}

export interface RigidSpawn {
  /** The authoring frame's origin and orientation (the shape's com is applied for you). */
  x: number; y: number; z: number;
  qx?: number; qy?: number; qz?: number; qw?: number;
  /** Velocity of the centre of mass (m/s) and angular velocity (rad/s, world frame). */
  vx?: number; vy?: number; vz?: number;
  wx?: number; wy?: number; wz?: number;
  /** Who it belongs to: kinematic boxes with the same owner are ignored while `ignoreOwnerSteps` lasts (0: never). */
  owner?: number;
  ignoreOwnerSteps?: number;
  /** Spawn asleep at its pose (a settled body restored from a log, a migration). */
  asleep?: boolean;
}

export interface RigidWorld {
  readonly capacity: number;
  gravity: number;
  /** Per-slot state (centre of mass pose, velocities). Read freely; write only through the methods. */
  readonly px: Float64Array; readonly py: Float64Array; readonly pz: Float64Array;
  readonly qx: Float64Array; readonly qy: Float64Array; readonly qz: Float64Array; readonly qw: Float64Array;
  readonly vx: Float64Array; readonly vy: Float64Array; readonly vz: Float64Array;
  readonly wx: Float64Array; readonly wy: Float64Array; readonly wz: Float64Array;
  /** The pose before the last step (presentation interpolates prev → current). */
  readonly ppx: Float64Array; readonly ppy: Float64Array; readonly ppz: Float64Array;
  readonly pqx: Float64Array; readonly pqy: Float64Array; readonly pqz: Float64Array; readonly pqw: Float64Array;
  /** 1 while the slot holds a body. */
  readonly active: Uint8Array;
  /** 1 while the body sleeps. */
  readonly asleep: Uint8Array;
  /** Steps the body has lived. */
  readonly age: Uint32Array;
  /** Impacts reported by the last step: count and SoA fields. */
  readonly impactCount: number;
  readonly impactX: Float64Array; readonly impactY: Float64Array; readonly impactZ: Float64Array;
  readonly impactSpeed: Float64Array; readonly impactMass: Float64Array;
  readonly impactSlot: Int32Array; readonly impactPartner: Uint8Array;
  /** Bodies in the world, awake bodies. */
  readonly count: number;
  readonly awakeCount: number;
  shape(slot: number): RigidShape | null;
  /** What the bodies stand on and hit (null: nothing steps). The world outlives a match's ground. */
  bindEnvironment(env: RigidEnvironment | null): void;
  spawn(shape: RigidShape, spawn: RigidSpawn): number;
  remove(slot: number): void;
  clear(): void;
  /** Kinematic boxes for the coming steps: set `kinematicCount` boxes, then step. */
  setKinematicCount(count: number): void;
  setKinematic(
    index: number, owner: number,
    cx: number, cy: number, cz: number, qx: number, qy: number, qz: number, qw: number,
    hx: number, hy: number, hz: number,
    vx: number, vy: number, vz: number, wx: number, wy: number, wz: number,
  ): void;
  /** An impulse at a world point (N s); wakes the body. */
  applyImpulse(slot: number, jx: number, jy: number, jz: number, px: number, py: number, pz: number): void;
  /** Set a body's velocity (centre of mass, m/s) and angular velocity (rad/s); wakes it. */
  setVelocity(slot: number, vx: number, vy: number, vz: number, wx: number, wy: number, wz: number): void;
  wake(slot: number): void;
  /** Wake every sleeper whose bounds meet the box (the ground or a building changed there). */
  wakeInBox(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void;
  /** One fixed step. */
  step(dt?: number): void;
  /** The authoring frame's pose of a slot (origin = p − R·com), into `out` [x, y, z, qx, qy, qz, qw]. */
  framePose(slot: number, out: Float64Array | number[]): void;
  /** The same, interpolated between the previous and the current step (t in 0..1). */
  framePoseAt(slot: number, t: number, out: Float64Array | number[]): void;
}

// ---------------------------------------------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------------------------------------------

function rotateBy(q: Quat | undefined, x: number, y: number, z: number, out: number[]): number[] {
  if (!q) { out[0] = x; out[1] = y; out[2] = z; return out; }
  const [qx, qy, qz, qw] = q;
  // v + 2 q × (q × v + w v)
  const cx = qy * z - qz * y + qw * x;
  const cy = qz * x - qx * z + qw * y;
  const cz = qx * y - qy * x + qw * z;
  out[0] = x + 2 * (qy * cz - qz * cy);
  out[1] = y + 2 * (qz * cx - qx * cz);
  out[2] = z + 2 * (qx * cy - qy * cx);
  return out;
}

/** Inertia tensor (row-major 3×3) of a solid with principal moments (ix, iy, iz) rotated by q. */
function rotatedInertia(q: Quat | undefined, ix: number, iy: number, iz: number, out: number[]): void {
  const ax: number[] = [0, 0, 0], ay: number[] = [0, 0, 0], az: number[] = [0, 0, 0];
  rotateBy(q, 1, 0, 0, ax); rotateBy(q, 0, 1, 0, ay); rotateBy(q, 0, 0, 1, az);
  // I = Σ i_k a_k a_kᵀ
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    out[r * 3 + c] = ix * ax[r] * ax[c] + iy * ay[r] * ay[c] + iz * az[r] * az[c];
  }
}

interface ShapeBuild {
  spheres: number[];
  solids: number[];
  /** the solid the spheres being laid now belong to, and each sphere's */
  part: number;
  sphereParts: number[];
}

function pushSphere(build: ShapeBuild, x: number, y: number, z: number, r: number): void {
  const s = build.spheres;
  for (let i = 0; i < s.length; i += 4) {
    const dx = s[i] - x, dy = s[i + 1] - y, dz = s[i + 2] - z;
    if (dx * dx + dy * dy + dz * dz < 1e-8 && Math.abs(s[i + 3] - r) < 1e-6) return;
  }
  s.push(x, y, z, r);
  build.sphereParts.push(build.part);
}

function boxSpheres(build: ShapeBuild, part: Extract<RigidPartSpec, { kind: 'box' }>, spacing: number): void {
  const [hx, hy, hz] = part.half;
  const e = part.edgeRadius ?? Math.min(0.04, Math.min(hx, hy, hz) / 3);
  const ex = Math.max(0, hx - e), ey = Math.max(0, hy - e), ez = Math.max(0, hz - e);
  const steps = (h: number): number => Math.max(1, Math.ceil((2 * h) / spacing));
  const nx = steps(ex), ny = steps(ey), nz = steps(ez);
  const at = (h: number, n: number, i: number): number => (n <= 0 ? 0 : -h + (2 * h * i) / n);
  const v: number[] = [0, 0, 0];
  // the six faces' grids (their shared edges and corners once)
  for (let face = 0; face < 6; face++) {
    const axis = face >> 1, sign = face & 1 ? 1 : -1;
    const nu = axis === 0 ? ny : nx, nv = axis === 2 ? ny : nz;
    for (let iu = 0; iu <= nu; iu++) for (let iv = 0; iv <= nv; iv++) {
      let x: number, y: number, z: number;
      if (axis === 0) { x = sign * ex; y = at(ey, ny, iu); z = at(ez, nz, iv); }
      else if (axis === 1) { y = sign * ey; x = at(ex, nx, iu); z = at(ez, nz, iv); }
      else { z = sign * ez; x = at(ex, nx, iu); y = at(ey, ny, iv); }
      rotateBy(part.rotation, x, y, z, v);
      pushSphere(build, part.center[0] + v[0], part.center[1] + v[1], part.center[2] + v[2], e);
    }
  }
}

function capsuleSpheres(build: ShapeBuild, a: Vec3, b: Vec3, radius: number, spacing: number): void {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const n = Math.max(1, Math.ceil(length / Math.max(0.05, spacing)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pushSphere(build, a[0] + dx * t, a[1] + dy * t, a[2] + dz * t, radius);
  }
}

function cylinderSpheres(build: ShapeBuild, part: Extract<RigidPartSpec, { kind: 'cylinder' }>): void {
  const r = part.radius, h = part.halfHeight;
  const v: number[] = [0, 0, 0];
  // the side: a chain of spheres of the cylinder's radius along its axis, inset by the radius (it rolls)
  const inner = Math.max(0, h - r);
  const chain = Math.max(1, Math.ceil((2 * inner) / Math.max(0.12, r * 0.5)));
  for (let i = 0; i <= chain; i++) {
    const y = inner === 0 ? 0 : -inner + (2 * inner * i) / chain;
    rotateBy(part.rotation, 0, y, 0, v);
    pushSphere(build, part.center[0] + v[0], part.center[1] + v[1], part.center[2] + v[2], r);
  }
  // the caps: rings of small spheres at the rim (it stands on an end, it catches an edge)
  const segments = Math.max(6, part.segments ?? 10);
  const e = Math.min(0.04, r / 4, h / 3);
  for (let cap = -1; cap <= 1; cap += 2) {
    for (let k = 0; k < segments; k++) {
      // the ring's directions from a rotation recurrence (no trigonometry per point beyond the first)
      const angle = (2 * Math.PI * k) / segments;
      rotateBy(part.rotation, (r - e) * Math.cos(angle), cap * (h - e), (r - e) * Math.sin(angle), v);
      pushSphere(build, part.center[0] + v[0], part.center[1] + v[1], part.center[2] + v[2], e);
    }
  }
}

/**
 * Build a shape from parts (boxes, capsules, cylinders) in an authoring frame. Mass properties sum the parts (their
 * inertia about the combined centre of mass by the parallel axis; the off-diagonal products are dropped, a diagonal
 * body inertia). Build time only: allocates.
 */
export function createRigidShape(parts: readonly RigidPartSpec[], options: RigidShapeOptions = {}): RigidShape {
  if (!parts.length) throw new Error('a rigid shape needs at least one part');
  let mass = 0, cx = 0, cy = 0, cz = 0;
  const centers: number[][] = [];
  for (const part of parts) {
    if (!(part.mass > 0)) throw new Error('rigid parts need a positive mass');
    const c = part.kind === 'capsule'
      ? [(part.a[0] + part.b[0]) / 2, (part.a[1] + part.b[1]) / 2, (part.a[2] + part.b[2]) / 2]
      : [part.center[0], part.center[1], part.center[2]];
    centers.push(c);
    mass += part.mass; cx += part.mass * c[0]; cy += part.mass * c[1]; cz += part.mass * c[2];
  }
  cx /= mass; cy /= mass; cz /= mass;
  // inertia about the combined centre
  const total = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const local = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    const m = part.mass;
    let ix: number, iy: number, iz: number;
    let q: Quat | undefined;
    if (part.kind === 'box') {
      const a = 2 * part.half[0], b = 2 * part.half[1], c = 2 * part.half[2];
      ix = (m / 12) * (b * b + c * c); iy = (m / 12) * (a * a + c * c); iz = (m / 12) * (a * a + b * b);
      q = part.rotation;
    } else if (part.kind === 'cylinder') {
      const r = part.radius, h = 2 * part.halfHeight;
      ix = iz = (m / 12) * (3 * r * r + h * h); iy = (m / 2) * r * r;
      q = part.rotation;
    } else {
      // a capsule as a cylinder along a → b
      const dx = part.b[0] - part.a[0], dy = part.b[1] - part.a[1], dz = part.b[2] - part.a[2];
      const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const r = part.radius, h = length + r;
      ix = iz = (m / 12) * (3 * r * r + h * h); iy = (m / 2) * r * r;
      // the rotation taking +Y onto the axis
      if (length > 1e-9) {
        const ux = dx / length, uy = dy / length, uz = dz / length;
        const dot = uy;
        if (dot < -0.999999) q = [1, 0, 0, 0];
        else {
          // q = (y × u, 1 + y·u) normalized
          const qx0 = uz, qy0 = 0, qz0 = -ux, qw0 = 1 + dot;
          const n = Math.sqrt(qx0 * qx0 + qy0 * qy0 + qz0 * qz0 + qw0 * qw0);
          q = [qx0 / n, qy0 / n, qz0 / n, qw0 / n];
        }
      }
    }
    rotatedInertia(q, ix, iy, iz, local);
    const d = centers[index];
    const ddx = d[0] - cx, ddy = d[1] - cy, ddz = d[2] - cz;
    const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
    // parallel axis: I + m (|d|² E − d dᵀ)
    const dv = [ddx, ddy, ddz];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      total[r * 3 + c] += local[r * 3 + c] + m * ((r === c ? d2 : 0) - dv[r] * dv[c]);
    }
  }
  const invInertia = new Float64Array([1 / Math.max(total[0], 1e-6), 1 / Math.max(total[4], 1e-6), 1 / Math.max(total[8], 1e-6)]);

  // contact spheres and solids, re-centred on the centre of mass
  const maxSpheres = Math.max(8, options.maxSpheres ?? 64);
  let build: ShapeBuild = { spheres: [], solids: [], part: 0, sphereParts: [] };
  for (let widen = 1; widen < 64; widen *= 1.4) {
    build = { spheres: [], solids: [], part: 0, sphereParts: [] };
    for (const part of parts) {
      // this part's solid is the next one pushed: its spheres carry its index
      build.part = build.solids.length / SOLID_STRIDE;
      if (part.kind === 'box') {
        const longest = 2 * Math.max(part.half[0], part.half[1], part.half[2]);
        const spacing = (part.spacing ?? Math.max(0.9, longest / 5)) * widen;
        if (part.contacts !== false) boxSpheres(build, part, spacing);
        const q = part.rotation ?? [0, 0, 0, 1];
        build.solids.push(SOLID_BOX, part.center[0], part.center[1], part.center[2], q[0], q[1], q[2], q[3],
          part.half[0], part.half[1], part.half[2], 0, 0, 0);
      } else if (part.kind === 'capsule') {
        if (part.contacts !== false) capsuleSpheres(build, part.a, part.b, part.radius, (part.spacing ?? Math.max(0.25, part.radius)) * widen);
        build.solids.push(SOLID_CAPSULE, part.a[0], part.a[1], part.a[2], part.b[0], part.b[1], part.b[2], part.radius,
          0, 0, 0, 0, 0, 0);
      } else {
        if (part.contacts !== false) cylinderSpheres(build, part);
        const v: number[] = [0, 0, 0];
        rotateBy(part.rotation, 0, part.halfHeight, 0, v);
        build.solids.push(SOLID_CAPSULE, part.center[0] - v[0], part.center[1] - v[1], part.center[2] - v[2],
          part.center[0] + v[0], part.center[1] + v[1], part.center[2] + v[2], part.radius, 0, 0, 0, 0, 0, 0);
      }
    }
    if (build.spheres.length / 4 <= maxSpheres) break;
  }
  const spheres = new Float64Array(build.spheres.length);
  let radius = 0;
  for (let i = 0; i < build.spheres.length; i += 4) {
    spheres[i] = build.spheres[i] - cx; spheres[i + 1] = build.spheres[i + 1] - cy; spheres[i + 2] = build.spheres[i + 2] - cz;
    spheres[i + 3] = build.spheres[i + 3];
    radius = Math.max(radius, Math.hypot(spheres[i], spheres[i + 1], spheres[i + 2]) + spheres[i + 3]);
  }
  const solids = new Float64Array(build.solids.length);
  for (let i = 0; i < build.solids.length; i += SOLID_STRIDE) {
    for (let k = 0; k < SOLID_STRIDE; k++) solids[i + k] = build.solids[i + k];
    if (solids[i] === SOLID_BOX) {
      solids[i + 1] -= cx; solids[i + 2] -= cy; solids[i + 3] -= cz;
      const q: Quat = [solids[i + 4], solids[i + 5], solids[i + 6], solids[i + 7]];
      // the box's farthest corner
      const v: number[] = [0, 0, 0];
      for (let corner = 0; corner < 8; corner++) {
        rotateBy(q, (corner & 1 ? 1 : -1) * solids[i + 8], (corner & 2 ? 1 : -1) * solids[i + 9], (corner & 4 ? 1 : -1) * solids[i + 10], v);
        radius = Math.max(radius, Math.hypot(solids[i + 1] + v[0], solids[i + 2] + v[1], solids[i + 3] + v[2]));
      }
    } else {
      solids[i + 1] -= cx; solids[i + 2] -= cy; solids[i + 3] -= cz;
      solids[i + 4] -= cx; solids[i + 5] -= cy; solids[i + 6] -= cz;
      radius = Math.max(radius, Math.hypot(solids[i + 1], solids[i + 2], solids[i + 3]) + solids[i + 7],
        Math.hypot(solids[i + 4], solids[i + 5], solids[i + 6]) + solids[i + 7]);
    }
  }
  return Object.freeze({
    mass,
    invMass: 1 / mass,
    invInertia,
    com: new Float64Array([cx, cy, cz]),
    spheres,
    sphereCount: spheres.length / 4,
    sphereSolid: Int16Array.from(build.sphereParts),
    solids,
    solidCount: solids.length / SOLID_STRIDE,
    radius,
    restitution: Math.max(0, Math.min(0.9, options.restitution ?? 0.3)),
    friction: Math.max(0.05, options.friction ?? 0.6),
    rolling: Math.max(0, options.rolling ?? 0.15),
    rolls: !!options.rolls,
    linearDrag: Math.max(0, options.linearDrag ?? 0.02),
    angularDrag: Math.max(0, options.angularDrag ?? 0.08),
  });
}

/** A plain box shape of a uniform density (kg/m^3) around its own centre. */
export function createRigidBox(hx: number, hy: number, hz: number, density: number, options: RigidShapeOptions = {}): RigidShape {
  const mass = Math.max(1, 8 * hx * hy * hz * density);
  return createRigidShape([{ kind: 'box', center: [0, 0, 0], half: [hx, hy, hz], mass }], options);
}

/** A plain cylinder (axis along local Y) of a uniform density around its own centre. */
export function createRigidCylinder(radius: number, halfHeight: number, density: number, options: RigidShapeOptions = {}): RigidShape {
  const mass = Math.max(1, Math.PI * radius * radius * 2 * halfHeight * density);
  return createRigidShape([{ kind: 'cylinder', center: [0, 0, 0], halfHeight, radius, mass }],
    { rolling: 0.6, rolls: true, ...options });
}

// ---------------------------------------------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------------------------------------------

const PARTNER_NONE = -1;
/** The static records' partner id in the sphere warm-start cache (bodies and kinematic boxes take 1 + their index). */
const STATIC_PARTNER = 0x7fffffff;
/** Feature contacts (a corner into a body, no sphere of its own) kept per body for the next step's warm start. */
const FEATURE_CACHE = 12;
/** A feature contact matches last step's within this distance (m) and normal agreement. */
const FEATURE_MATCH_M = 0.03;
const FEATURE_MATCH_DOT = 0.95;

export function createRigidWorld(options: RigidWorldOptions = {}): RigidWorld {
  const capacity = Math.max(1, options.capacity ?? 32) | 0;
  const kinematicCapacity = Math.max(0, options.kinematicCapacity ?? 128) | 0;
  const velocityIterations = Math.max(1, options.velocityIterations ?? 10) | 0;
  const positionIterations = Math.max(0, options.positionIterations ?? 4) | 0;
  const contactsPerBody = Math.max(4, options.contactsPerBody ?? 32) | 0;
  const spherePool = Math.max(64, options.spherePool ?? capacity * 64) | 0;
  const maxContacts = capacity * contactsPerBody;

  // ---- bodies ----
  const px = new Float64Array(capacity), py = new Float64Array(capacity), pz = new Float64Array(capacity);
  const qx = new Float64Array(capacity), qy = new Float64Array(capacity), qz = new Float64Array(capacity);
  const qw = new Float64Array(capacity).fill(1);
  const vx = new Float64Array(capacity), vy = new Float64Array(capacity), vz = new Float64Array(capacity);
  const wx = new Float64Array(capacity), wy = new Float64Array(capacity), wz = new Float64Array(capacity);
  const ppx = new Float64Array(capacity), ppy = new Float64Array(capacity), ppz = new Float64Array(capacity);
  const pqx = new Float64Array(capacity), pqy = new Float64Array(capacity), pqz = new Float64Array(capacity);
  const pqw = new Float64Array(capacity).fill(1);
  // split-impulse pseudo velocities (this step only)
  const pvx = new Float64Array(capacity), pvy = new Float64Array(capacity), pvz = new Float64Array(capacity);
  const pwx = new Float64Array(capacity), pwy = new Float64Array(capacity), pwz = new Float64Array(capacity);
  // rotation matrix (row-major) and world inverse inertia (symmetric: xx xy xz yy yz zz) per body
  const rot = new Float64Array(capacity * 9);
  const iiw = new Float64Array(capacity * 6);
  const active = new Uint8Array(capacity);
  const asleep = new Uint8Array(capacity);
  const age = new Uint32Array(capacity);
  const restSteps = new Uint16Array(capacity);
  const supportClock = new Uint16Array(capacity);
  const impactCooldown = new Uint8Array(capacity);
  const owner = new Int32Array(capacity).fill(-1);
  const ignoreOwnerSteps = new Uint32Array(capacity);
  const touching = new Uint8Array(capacity);
  const shapes: (RigidShape | null)[] = new Array(capacity).fill(null);
  // the sphere pool: each body's world sphere centres this step (x, y, z) and its warm-start cache per sphere
  const sphereBase = new Int32Array(capacity);
  const sphereCount = new Int32Array(capacity);
  const sphereWorld = new Float64Array(spherePool * 3);
  const warmPartner = new Int32Array(spherePool).fill(PARTNER_NONE);
  const warmN = new Float64Array(spherePool), warmT1 = new Float64Array(spherePool), warmT2 = new Float64Array(spherePool);
  // per body: last step's feature contacts (point, normal, impulses) for a match by place
  const featureCache = new Float64Array(capacity * FEATURE_CACHE * 9);
  const featureCount = new Int32Array(capacity);
  let sphereTop = 0;
  // body bounds this step
  const bminX = new Float64Array(capacity), bminY = new Float64Array(capacity), bminZ = new Float64Array(capacity);
  const bmaxX = new Float64Array(capacity), bmaxY = new Float64Array(capacity), bmaxZ = new Float64Array(capacity);

  // ---- kinematic boxes ----
  let kinematicCount = 0;
  const kOwner = new Int32Array(kinematicCapacity);
  const kc = new Float64Array(kinematicCapacity * 3);
  const kr = new Float64Array(kinematicCapacity * 9);
  const kh = new Float64Array(kinematicCapacity * 3);
  const kv = new Float64Array(kinematicCapacity * 6);
  const kRadius = new Float64Array(kinematicCapacity);

  // ---- contacts (SoA) ----
  let contactCount = 0;
  const cA = new Int32Array(maxContacts);
  /** >= 0 a body; -1 ground; -2 static; -3 - k kinematic box k. */
  const cB = new Int32Array(maxContacts);
  const cSphere = new Int32Array(maxContacts);
  const cPartner = new Int32Array(maxContacts);
  const cNx = new Float64Array(maxContacts), cNy = new Float64Array(maxContacts), cNz = new Float64Array(maxContacts);
  const cDepth = new Float64Array(maxContacts);
  const cPx = new Float64Array(maxContacts), cPy = new Float64Array(maxContacts), cPz = new Float64Array(maxContacts);
  const cFriction = new Float64Array(maxContacts), cRestitution = new Float64Array(maxContacts);
  const cRax = new Float64Array(maxContacts), cRay = new Float64Array(maxContacts), cRaz = new Float64Array(maxContacts);
  const cRbx = new Float64Array(maxContacts), cRby = new Float64Array(maxContacts), cRbz = new Float64Array(maxContacts);
  const cT1x = new Float64Array(maxContacts), cT1y = new Float64Array(maxContacts), cT1z = new Float64Array(maxContacts);
  const cT2x = new Float64Array(maxContacts), cT2y = new Float64Array(maxContacts), cT2z = new Float64Array(maxContacts);
  const cMassN = new Float64Array(maxContacts), cMassT1 = new Float64Array(maxContacts), cMassT2 = new Float64Array(maxContacts);
  const cBias = new Float64Array(maxContacts), cBiasP = new Float64Array(maxContacts);
  const cJn = new Float64Array(maxContacts), cJt1 = new Float64Array(maxContacts), cJt2 = new Float64Array(maxContacts);
  const cJp = new Float64Array(maxContacts);
  const cKvx = new Float64Array(maxContacts), cKvy = new Float64Array(maxContacts), cKvz = new Float64Array(maxContacts);

  // ---- impacts ----
  let impactCount = 0;
  const impactX = new Float64Array(MAX_IMPACTS_PER_STEP), impactY = new Float64Array(MAX_IMPACTS_PER_STEP);
  const impactZ = new Float64Array(MAX_IMPACTS_PER_STEP), impactSpeed = new Float64Array(MAX_IMPACTS_PER_STEP);
  const impactMass = new Float64Array(MAX_IMPACTS_PER_STEP);
  const impactSlot = new Int32Array(MAX_IMPACTS_PER_STEP);
  const impactPartner = new Uint8Array(MAX_IMPACTS_PER_STEP);
  // the strongest approach of each body this step (reported once per cooldown)
  const bestImpact = new Float64Array(capacity);
  const bestImpactContact = new Int32Array(capacity);

  // sweep order for the body pairs (insertion sort on min x every step)
  const order = new Int32Array(capacity);
  let orderCount = 0;

  let gravity = Math.max(0, options.gravity ?? 9.81);
  let environment: RigidEnvironment | null = null;
  const staticOut: CollisionRecord[] = [];

  // ---- small math on the arrays (module-free scratch, no allocation) ----
  function updateRotation(i: number): void {
    const x = qx[i], y = qy[i], z = qz[i], w = qw[i];
    const o = i * 9;
    const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx0 = w * x, wy0 = w * y, wz0 = w * z;
    rot[o] = 1 - 2 * (yy + zz); rot[o + 1] = 2 * (xy - wz0); rot[o + 2] = 2 * (xz + wy0);
    rot[o + 3] = 2 * (xy + wz0); rot[o + 4] = 1 - 2 * (xx + zz); rot[o + 5] = 2 * (yz - wx0);
    rot[o + 6] = 2 * (xz - wy0); rot[o + 7] = 2 * (yz + wx0); rot[o + 8] = 1 - 2 * (xx + yy);
    const shape = shapes[i]!;
    const ix = shape.invInertia[0], iy = shape.invInertia[1], iz = shape.invInertia[2];
    // R diag(i) Rᵀ
    const r00 = rot[o], r01 = rot[o + 1], r02 = rot[o + 2];
    const r10 = rot[o + 3], r11 = rot[o + 4], r12 = rot[o + 5];
    const r20 = rot[o + 6], r21 = rot[o + 7], r22 = rot[o + 8];
    const m = i * 6;
    iiw[m] = r00 * r00 * ix + r01 * r01 * iy + r02 * r02 * iz;
    iiw[m + 1] = r00 * r10 * ix + r01 * r11 * iy + r02 * r12 * iz;
    iiw[m + 2] = r00 * r20 * ix + r01 * r21 * iy + r02 * r22 * iz;
    iiw[m + 3] = r10 * r10 * ix + r11 * r11 * iy + r12 * r12 * iz;
    iiw[m + 4] = r10 * r20 * ix + r11 * r21 * iy + r12 * r22 * iz;
    iiw[m + 5] = r20 * r20 * ix + r21 * r21 * iy + r22 * r22 * iz;
  }

  // world positions of a body's spheres and its bounds
  function updateSpheres(i: number): void {
    const shape = shapes[i]!;
    const o = i * 9, base = sphereBase[i] * 3;
    const r00 = rot[o], r01 = rot[o + 1], r02 = rot[o + 2];
    const r10 = rot[o + 3], r11 = rot[o + 4], r12 = rot[o + 5];
    const r20 = rot[o + 6], r21 = rot[o + 7], r22 = rot[o + 8];
    const s = shape.spheres;
    for (let k = 0, n = shape.sphereCount; k < n; k++) {
      const sx = s[k * 4], sy = s[k * 4 + 1], sz = s[k * 4 + 2];
      const j = base + k * 3;
      sphereWorld[j] = px[i] + r00 * sx + r01 * sy + r02 * sz;
      sphereWorld[j + 1] = py[i] + r10 * sx + r11 * sy + r12 * sz;
      sphereWorld[j + 2] = pz[i] + r20 * sx + r21 * sy + r22 * sz;
    }
    const r = shape.radius + CONTACT_MARGIN_M;
    bminX[i] = px[i] - r; bmaxX[i] = px[i] + r;
    bminY[i] = py[i] - r; bmaxY[i] = py[i] + r;
    bminZ[i] = pz[i] - r; bmaxZ[i] = pz[i] + r;
  }

  // ---- contact pool ----
  let bodyContactStart = 0;
  /** Add a contact on body a (normal pushes a out of b). Within a body's budget the shallowest gives way. */
  function addContact(a: number, b: number, sphere: number, partner: number,
    x: number, y: number, z: number, nx: number, ny: number, nz: number, depth: number,
    friction: number, restitution: number, kvx0: number, kvy0: number, kvz0: number): void {
    let c = contactCount;
    if (contactCount - bodyContactStart >= contactsPerBody || contactCount >= maxContacts) {
      // replace the shallowest of this body's contacts if this one is deeper
      let shallow = -1, least = depth;
      for (let k = bodyContactStart; k < contactCount; k++) if (cDepth[k] < least) { least = cDepth[k]; shallow = k; }
      if (shallow < 0) return;
      c = shallow;
    } else contactCount++;
    cA[c] = a; cB[c] = b; cSphere[c] = sphere; cPartner[c] = partner;
    cPx[c] = x; cPy[c] = y; cPz[c] = z;
    cNx[c] = nx; cNy[c] = ny; cNz[c] = nz; cDepth[c] = depth;
    cFriction[c] = friction; cRestitution[c] = restitution;
    cKvx[c] = kvx0; cKvy[c] = kvy0; cKvz[c] = kvz0;
  }

  // ---- ground ----
  function groundContacts(i: number): void {
    const env = environment!;
    const shape = shapes[i]!;
    const base = sphereBase[i];
    const friction = Math.sqrt(shape.friction * GROUND_FRICTION);
    const restitution = 0.5 * (shape.restitution + GROUND_RESTITUTION);
    for (let k = 0, n = shape.sphereCount; k < n; k++) {
      const j = (base + k) * 3;
      const x = sphereWorld[j], y = sphereWorld[j + 1], z = sphereWorld[j + 2];
      const r = shape.spheres[k * 4 + 3];
      const h = env.groundAt(x, z);
      if (!(y - r - h < CONTACT_MARGIN_M)) continue;
      const hx0 = env.groundAt(x - GROUND_NORMAL_EPS_M, z), hx1 = env.groundAt(x + GROUND_NORMAL_EPS_M, z);
      const hz0 = env.groundAt(x, z - GROUND_NORMAL_EPS_M), hz1 = env.groundAt(x, z + GROUND_NORMAL_EPS_M);
      let nx = hx0 - hx1, ny = 2 * GROUND_NORMAL_EPS_M, nz = hz0 - hz1;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= inv; ny *= inv; nz *= inv;
      const depth = r - (y - h) * ny;
      if (!(depth > -CONTACT_MARGIN_M)) continue;
      // the contact point on the ground's surface under the sphere
      const toSurface = r - depth;
      addContact(i, -1, base + k, 0, x - nx * toSurface, y - ny * toSurface, z - nz * toSurface, nx, ny, nz, depth,
        friction, restitution, 0, 0, 0);
    }
  }

  // ---- static prisms ----
  // closest-point scratch of one 2D footprint part
  let fpInside = false, fpBx = 0, fpBz = 0, fpNx = 0, fpNz = 0, fpDist = 0;

  function footprintClosest(part: SimpleCollisionShape | null, record: CollisionRecord, x: number, z: number): void {
    if (part === null || part.kind === 'obb') {
      let lx: number, lz: number, hw: number, hl: number, rx = 1, rz = 0, fx = 0, fz = 1, ox: number, oz: number;
      if (part === null) {
        ox = (record.min[0] + record.max[0]) * 0.5; oz = (record.min[2] + record.max[2]) * 0.5;
        hw = (record.max[0] - record.min[0]) * 0.5; hl = (record.max[2] - record.min[2]) * 0.5;
        lx = x - ox; lz = z - oz;
      } else {
        ox = part.cx; oz = part.cz; hw = part.hw; hl = part.hl;
        fx = Math.sin(part.yaw); fz = Math.cos(part.yaw); rx = fz; rz = -fx;
        const dx = x - ox, dz = z - oz;
        lx = dx * rx + dz * rz; lz = dx * fx + dz * fz;
      }
      const ax = Math.abs(lx), az = Math.abs(lz);
      if (ax <= hw && az <= hl) {
        fpInside = true;
        if (hw - ax < hl - az) {
          const s = lx < 0 ? -1 : 1;
          fpDist = hw - ax; fpNx = rx * s; fpNz = rz * s;
          fpBx = ox + rx * s * hw + fx * lz; fpBz = oz + rz * s * hw + fz * lz;
        } else {
          const s = lz < 0 ? -1 : 1;
          fpDist = hl - az; fpNx = fx * s; fpNz = fz * s;
          fpBx = ox + fx * s * hl + rx * lx; fpBz = oz + fz * s * hl + rz * lx;
        }
        return;
      }
      fpInside = false;
      const cxl = lx < -hw ? -hw : lx > hw ? hw : lx;
      const czl = lz < -hl ? -hl : lz > hl ? hl : lz;
      fpBx = ox + rx * cxl + fx * czl; fpBz = oz + rz * cxl + fz * czl;
      const dx = x - fpBx, dz = z - fpBz;
      fpDist = Math.sqrt(dx * dx + dz * dz);
      if (fpDist > 1e-12) { fpNx = dx / fpDist; fpNz = dz / fpDist; } else { fpNx = 1; fpNz = 0; }
      return;
    }
    if (part.kind === 'circle') {
      const dx = x - part.cx, dz = z - part.cz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 1e-12) { fpNx = dx / d; fpNz = dz / d; } else { fpNx = 1; fpNz = 0; }
      fpInside = d <= part.r;
      fpDist = Math.abs(part.r - d);
      fpBx = part.cx + fpNx * part.r; fpBz = part.cz + fpNz * part.r;
      return;
    }
    // convex: winding, then the nearest edge
    const p = part.points;
    const n = p.length >> 1;
    let area2 = 0;
    for (let a = 0; a < n; a++) {
      const b = a + 1 < n ? a + 1 : 0;
      area2 += p[2 * a] * p[2 * b + 1] - p[2 * b] * p[2 * a + 1];
    }
    const winding = area2 < 0 ? -1 : 1;
    let maxSigned = -Infinity, maxNx = 0, maxNz = 0;
    let best = Infinity, bestX = x, bestZ = z;
    for (let a = 0; a < n; a++) {
      const b = a + 1 < n ? a + 1 : 0;
      const ax = p[2 * a], az = p[2 * a + 1];
      const ex = p[2 * b] - ax, ez = p[2 * b + 1] - az;
      const length = Math.sqrt(ex * ex + ez * ez);
      if (length < 1e-9) continue;
      // outward normal = winding (ez, −ex) / length
      const onx = (winding * ez) / length, onz = (-winding * ex) / length;
      const signed = (x - ax) * onx + (z - az) * onz;
      if (signed > maxSigned) { maxSigned = signed; maxNx = onx; maxNz = onz; }
      // the segment's closest point
      let t = ((x - ax) * ex + (z - az) * ez) / (length * length);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx0 = ax + ex * t, qz0 = az + ez * t;
      const dx = x - qx0, dz = z - qz0;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; bestX = qx0; bestZ = qz0; }
    }
    if (maxSigned <= 0) {
      fpInside = true; fpDist = -maxSigned; fpNx = maxNx; fpNz = maxNz;
      fpBx = x + maxNx * fpDist; fpBz = z + maxNz * fpDist;
      return;
    }
    fpInside = false;
    fpBx = bestX; fpBz = bestZ;
    fpDist = Math.sqrt(best);
    if (fpDist > 1e-12) { fpNx = (x - bestX) / fpDist; fpNz = (z - bestZ) / fpDist; } else { fpNx = maxNx; fpNz = maxNz; }
  }

  function prismContacts(i: number, part: SimpleCollisionShape | null, record: CollisionRecord, y0: number, y1: number,
    friction: number, restitution: number): void {
    const shape = shapes[i]!;
    const base = sphereBase[i];
    for (let k = 0, n = shape.sphereCount; k < n; k++) {
      const j = (base + k) * 3;
      const x = sphereWorld[j], y = sphereWorld[j + 1], z = sphereWorld[j + 2];
      const r = shape.spheres[k * 4 + 3];
      if (y + r < y0 - CONTACT_MARGIN_M || y - r > y1 + CONTACT_MARGIN_M) continue;
      footprintClosest(part, record, x, z);
      let nx: number, ny: number, nz: number, depth: number, cx0: number, cy0: number, cz0: number;
      if (fpInside) {
        if (y >= y1) {
          // over the top
          depth = r - (y - y1); nx = 0; ny = 1; nz = 0; cx0 = x; cy0 = y1; cz0 = z;
        } else if (y <= y0) {
          depth = r - (y0 - y); nx = 0; ny = -1; nz = 0; cx0 = x; cy0 = y0; cz0 = z;
        } else {
          // inside: out by the nearest of the side, the top and the bottom
          const up = y1 - y, down = y - y0;
          if (fpDist <= up && fpDist <= down) {
            depth = r + fpDist; nx = fpNx; ny = 0; nz = fpNz; cx0 = fpBx; cy0 = y; cz0 = fpBz;
          } else if (up <= down) {
            depth = r + up; nx = 0; ny = 1; nz = 0; cx0 = x; cy0 = y1; cz0 = z;
          } else {
            depth = r + down; nx = 0; ny = -1; nz = 0; cx0 = x; cy0 = y0; cz0 = z;
          }
        }
      } else {
        const cy1 = y < y0 ? y0 : y > y1 ? y1 : y;
        const dx = x - fpBx, dy = y - cy1, dz = z - fpBz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d >= r + CONTACT_MARGIN_M) continue;
        if (d > 1e-9) { nx = dx / d; ny = dy / d; nz = dz / d; } else { nx = fpNx; ny = 0; nz = fpNz; }
        depth = r - d; cx0 = fpBx; cy0 = cy1; cz0 = fpBz;
      }
      if (!(depth > -CONTACT_MARGIN_M)) continue;
      // warm started by sphere like the ground (the static world is one partner: a sphere rarely touches two parts)
      addContact(i, -2, base + k, STATIC_PARTNER, cx0, cy0, cz0, nx, ny, nz, depth, friction, restitution, 0, 0, 0);
    }
    // the part's corners into the body (a wall's top edge under a slab's middle)
    if (part !== null && part.kind === 'convex') {
      const p = part.points;
      for (let a = 0; a < p.length; a += 2) {
        featureIntoBody(i, p[a], y1, p[a + 1], -2, friction, restitution, 0, 0, 0);
        if (y0 > bminY[i]) featureIntoBody(i, p[a], y0, p[a + 1], -2, friction, restitution, 0, 0, 0);
      }
    } else if (part !== null && part.kind === 'obb') {
      const fx = Math.sin(part.yaw), fz = Math.cos(part.yaw), rx = fz, rz = -fx;
      for (let corner = 0; corner < 4; corner++) {
        const sw = corner & 1 ? part.hw : -part.hw, sl = corner & 2 ? part.hl : -part.hl;
        const x = part.cx + rx * sw + fx * sl, z = part.cz + rz * sw + fz * sl;
        featureIntoBody(i, x, y1, z, -2, friction, restitution, 0, 0, 0);
      }
    } else if (part === null) {
      for (let corner = 0; corner < 4; corner++) {
        featureIntoBody(i, corner & 1 ? record.max[0] : record.min[0], y1, corner & 2 ? record.max[2] : record.min[2], -2,
          friction, restitution, 0, 0, 0);
      }
    }
  }

  function staticContacts(i: number): void {
    const env = environment!;
    if (!env.queryStatic) return;
    const shape = shapes[i]!;
    const friction = Math.sqrt(shape.friction * STATIC_FRICTION);
    const restitution = 0.5 * (shape.restitution + STATIC_RESTITUTION);
    const records = env.queryStatic(bminX[i], bminZ[i], bmaxX[i], bmaxZ[i], staticOut);
    for (let index = 0; index < records.length; index++) {
      const record = records[index];
      if (env.isSolid ? !env.isSolid(record) : (record.crushed || record.dead)) continue;
      if (record.max[1] < bminY[i] || record.min[1] > bmaxY[i]) continue;
      const shape2 = record.shape2;
      if (shape2 && shape2.kind === 'compound') {
        for (let p = 0; p < shape2.parts.length; p++) {
          const part = shape2.parts[p];
          const y0 = part.y0 ?? record.min[1], y1 = part.y1 ?? record.max[1];
          if (y1 < bminY[i] || y0 > bmaxY[i]) continue;
          prismContacts(i, part, record, y0, y1, friction, restitution);
        }
      } else {
        const part = shape2 ?? null;
        const y0 = part?.y0 ?? record.min[1], y1 = part?.y1 ?? record.max[1];
        prismContacts(i, part, record, y0, y1, friction, restitution);
      }
    }
    staticOut.length = 0;
  }

  // ---- solids (a point into a body; a sphere against a box or a capsule) ----
  // result scratch: depth, normal (out of the solid), closest point
  let sDepth = 0, sNx = 0, sNy = 0, sNz = 0, sPx = 0, sPy = 0, sPz = 0;

  /**
   * A sphere (centre x, y, z, radius r) against a box (centre c, rotation matrix m row-major at mo in mArr, half
   * extents h). Sets the scratch and returns true on contact (normal out of the box, toward the sphere).
   */
  function sphereBox(x: number, y: number, z: number, r: number,
    bcx: number, bcy: number, bcz: number, mArr: Float64Array, mo: number, hx: number, hy: number, hz: number): boolean {
    const dx = x - bcx, dy = y - bcy, dz = z - bcz;
    // local = Rᵀ d (columns of R are the box axes)
    const lx = mArr[mo] * dx + mArr[mo + 3] * dy + mArr[mo + 6] * dz;
    const ly = mArr[mo + 1] * dx + mArr[mo + 4] * dy + mArr[mo + 7] * dz;
    const lz = mArr[mo + 2] * dx + mArr[mo + 5] * dy + mArr[mo + 8] * dz;
    const ax = Math.abs(lx), ay = Math.abs(ly), az = Math.abs(lz);
    if (ax > hx + r + CONTACT_MARGIN_M || ay > hy + r + CONTACT_MARGIN_M || az > hz + r + CONTACT_MARGIN_M) return false;
    if (ax <= hx && ay <= hy && az <= hz) {
      // the centre is inside: out by the nearest face
      const ex = hx - ax, ey = hy - ay, ez = hz - az;
      let nlx = 0, nly = 0, nlz = 0;
      if (ex <= ey && ex <= ez) { nlx = lx < 0 ? -1 : 1; sDepth = r + ex; }
      else if (ey <= ez) { nly = ly < 0 ? -1 : 1; sDepth = r + ey; }
      else { nlz = lz < 0 ? -1 : 1; sDepth = r + ez; }
      sNx = mArr[mo] * nlx + mArr[mo + 1] * nly + mArr[mo + 2] * nlz;
      sNy = mArr[mo + 3] * nlx + mArr[mo + 4] * nly + mArr[mo + 5] * nlz;
      sNz = mArr[mo + 6] * nlx + mArr[mo + 7] * nly + mArr[mo + 8] * nlz;
      sPx = x - sNx * (sDepth - r); sPy = y - sNy * (sDepth - r); sPz = z - sNz * (sDepth - r);
      return true;
    }
    const cxl = lx < -hx ? -hx : lx > hx ? hx : lx;
    const cyl = ly < -hy ? -hy : ly > hy ? hy : ly;
    const czl = lz < -hz ? -hz : lz > hz ? hz : lz;
    sPx = bcx + mArr[mo] * cxl + mArr[mo + 1] * cyl + mArr[mo + 2] * czl;
    sPy = bcy + mArr[mo + 3] * cxl + mArr[mo + 4] * cyl + mArr[mo + 5] * czl;
    sPz = bcz + mArr[mo + 6] * cxl + mArr[mo + 7] * cyl + mArr[mo + 8] * czl;
    const ox = x - sPx, oy = y - sPy, oz = z - sPz;
    const d = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (d >= r + CONTACT_MARGIN_M || d < 1e-12) return false;
    sNx = ox / d; sNy = oy / d; sNz = oz / d; sDepth = r - d;
    return true;
  }

  /** A sphere against a capsule a → b of radius cr (normal out of the capsule). */
  function sphereCapsule(x: number, y: number, z: number, r: number,
    ax: number, ay: number, az: number, bx: number, by: number, bz: number, cr: number): boolean {
    const ex = bx - ax, ey = by - ay, ez = bz - az;
    const len2 = ex * ex + ey * ey + ez * ez;
    let t = len2 > 1e-12 ? ((x - ax) * ex + (y - ay) * ey + (z - az) * ez) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx0 = ax + ex * t, cy0 = ay + ey * t, cz0 = az + ez * t;
    const ox = x - cx0, oy = y - cy0, oz = z - cz0;
    const d = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (d >= r + cr + CONTACT_MARGIN_M) return false;
    if (d > 1e-9) { sNx = ox / d; sNy = oy / d; sNz = oz / d; } else { sNx = 0; sNy = 1; sNz = 0; }
    sDepth = r + cr - d;
    sPx = cx0 + sNx * cr; sPy = cy0 + sNy * cr; sPz = cz0 + sNz * cr;
    return true;
  }

  // a body's solid in the world: box centre and rotation, or capsule ends (scratch)
  const solidRot = new Float64Array(9);
  let solidCx = 0, solidCy = 0, solidCz = 0, solidBx = 0, solidBy = 0, solidBz = 0;
  function solidToWorld(i: number, s: Float64Array, o: number): void {
    const m = i * 9;
    const r00 = rot[m], r01 = rot[m + 1], r02 = rot[m + 2];
    const r10 = rot[m + 3], r11 = rot[m + 4], r12 = rot[m + 5];
    const r20 = rot[m + 6], r21 = rot[m + 7], r22 = rot[m + 8];
    const x = s[o + 1], y = s[o + 2], z = s[o + 3];
    solidCx = px[i] + r00 * x + r01 * y + r02 * z;
    solidCy = py[i] + r10 * x + r11 * y + r12 * z;
    solidCz = pz[i] + r20 * x + r21 * y + r22 * z;
    if (s[o] === SOLID_BOX) {
      // R_body · R_part
      const qx0 = s[o + 4], qy0 = s[o + 5], qz0 = s[o + 6], qw0 = s[o + 7];
      const xx = qx0 * qx0, yy = qy0 * qy0, zz = qz0 * qz0, xy = qx0 * qy0, xz = qx0 * qz0, yz = qy0 * qz0;
      const wx0 = qw0 * qx0, wy0 = qw0 * qy0, wz0 = qw0 * qz0;
      const p00 = 1 - 2 * (yy + zz), p01 = 2 * (xy - wz0), p02 = 2 * (xz + wy0);
      const p10 = 2 * (xy + wz0), p11 = 1 - 2 * (xx + zz), p12 = 2 * (yz - wx0);
      const p20 = 2 * (xz - wy0), p21 = 2 * (yz + wx0), p22 = 1 - 2 * (xx + yy);
      solidRot[0] = r00 * p00 + r01 * p10 + r02 * p20; solidRot[1] = r00 * p01 + r01 * p11 + r02 * p21; solidRot[2] = r00 * p02 + r01 * p12 + r02 * p22;
      solidRot[3] = r10 * p00 + r11 * p10 + r12 * p20; solidRot[4] = r10 * p01 + r11 * p11 + r12 * p21; solidRot[5] = r10 * p02 + r11 * p12 + r12 * p22;
      solidRot[6] = r20 * p00 + r21 * p10 + r22 * p20; solidRot[7] = r20 * p01 + r21 * p11 + r22 * p21; solidRot[8] = r20 * p02 + r21 * p12 + r22 * p22;
    } else {
      const bx0 = s[o + 4], by0 = s[o + 5], bz0 = s[o + 6];
      solidBx = px[i] + r00 * bx0 + r01 * by0 + r02 * bz0;
      solidBy = py[i] + r10 * bx0 + r11 * by0 + r12 * bz0;
      solidBz = pz[i] + r20 * bx0 + r21 * by0 + r22 * bz0;
    }
  }

  /** A body's box solid in the world into caller arrays: centre (3 at co) and rotation (9 at ro, row-major; columns =
   *  axes). */
  function boxPartToWorld(i: number, s: Float64Array, o: number, outC: Float64Array, co: number, outR: Float64Array, ro: number): void {
    const m = i * 9;
    const r00 = rot[m], r01 = rot[m + 1], r02 = rot[m + 2];
    const r10 = rot[m + 3], r11 = rot[m + 4], r12 = rot[m + 5];
    const r20 = rot[m + 6], r21 = rot[m + 7], r22 = rot[m + 8];
    const x = s[o + 1], y = s[o + 2], z = s[o + 3];
    outC[co] = px[i] + r00 * x + r01 * y + r02 * z;
    outC[co + 1] = py[i] + r10 * x + r11 * y + r12 * z;
    outC[co + 2] = pz[i] + r20 * x + r21 * y + r22 * z;
    const qx0 = s[o + 4], qy0 = s[o + 5], qz0 = s[o + 6], qw0 = s[o + 7];
    const xx = qx0 * qx0, yy = qy0 * qy0, zz = qz0 * qz0, xy = qx0 * qy0, xz = qx0 * qz0, yz = qy0 * qz0;
    const wx0 = qw0 * qx0, wy0 = qw0 * qy0, wz0 = qw0 * qz0;
    const p00 = 1 - 2 * (yy + zz), p01 = 2 * (xy - wz0), p02 = 2 * (xz + wy0);
    const p10 = 2 * (xy + wz0), p11 = 1 - 2 * (xx + zz), p12 = 2 * (yz - wx0);
    const p20 = 2 * (xz - wy0), p21 = 2 * (yz + wx0), p22 = 1 - 2 * (xx + yy);
    outR[ro] = r00 * p00 + r01 * p10 + r02 * p20; outR[ro + 1] = r00 * p01 + r01 * p11 + r02 * p21; outR[ro + 2] = r00 * p02 + r01 * p12 + r02 * p22;
    outR[ro + 3] = r10 * p00 + r11 * p10 + r12 * p20; outR[ro + 4] = r10 * p01 + r11 * p11 + r12 * p21; outR[ro + 5] = r10 * p02 + r11 * p12 + r12 * p22;
    outR[ro + 6] = r20 * p00 + r21 * p10 + r22 * p20; outR[ro + 7] = r20 * p01 + r21 * p11 + r22 * p21; outR[ro + 8] = r20 * p02 + r21 * p12 + r22 * p22;
  }

  // the separating axis of two boxes (scratch): unit normal from box B toward box A, its overlap (m, < 0 apart), and
  // B's half extent along it
  const satN = new Float64Array(3);
  let satOverlap = 0, satReachB = 0;
  /**
   * Two oriented boxes' axis of least overlap over the fifteen candidate axes (three faces each, nine edge pairs; an
   * edge pair wins only clearly, faces give steadier contact). All of one pair's contacts push along it, so a box that
   * sank into a thin slab is pushed out one way — the spheres' own nearest faces would push half of it out of each
   * side and clamp the two together (dcore's wedge creep, 2026-10-10).
   */
  // the candidate the axis search is on (module-free scratch: no closure per call)
  let axisBest = Infinity, axisX = 0, axisY = 1, axisZ = 0, axisReach = 0;
  let axTx = 0, axTy = 0, axTz = 0, axAo = 0, axBo = 0, axAhx = 0, axAhy = 0, axAhz = 0, axBhx = 0, axBhy = 0, axBhz = 0;
  let axAR: Float64Array = rot, axBR: Float64Array = rot;
  function considerAxis(lx: number, ly: number, lz: number, edge: boolean): void {
    const len = Math.sqrt(lx * lx + ly * ly + lz * lz);
    if (len < 1e-6) return;
    lx /= len; ly /= len; lz /= len;
    const aR = axAR, bR = axBR, ao = axAo, bo = axBo;
    const ra = axAhx * Math.abs(aR[ao] * lx + aR[ao + 3] * ly + aR[ao + 6] * lz)
      + axAhy * Math.abs(aR[ao + 1] * lx + aR[ao + 4] * ly + aR[ao + 7] * lz)
      + axAhz * Math.abs(aR[ao + 2] * lx + aR[ao + 5] * ly + aR[ao + 8] * lz);
    const rb = axBhx * Math.abs(bR[bo] * lx + bR[bo + 3] * ly + bR[bo + 6] * lz)
      + axBhy * Math.abs(bR[bo + 1] * lx + bR[bo + 4] * ly + bR[bo + 7] * lz)
      + axBhz * Math.abs(bR[bo + 2] * lx + bR[bo + 5] * ly + bR[bo + 8] * lz);
    const dist = axTx * lx + axTy * ly + axTz * lz;
    const overlap = ra + rb - Math.abs(dist);
    const score = edge ? overlap * 1.05 + 0.01 : overlap;
    if (score < axisBest) {
      axisBest = score;
      const sign = dist < 0 ? -1 : 1;
      axisX = lx * sign; axisY = ly * sign; axisZ = lz * sign;
      satOverlap = overlap;
      axisReach = rb;
    }
  }
  function boxBoxAxis(ac: Float64Array, aco: number, aR: Float64Array, ao: number, ahx: number, ahy: number, ahz: number,
    bc: Float64Array, bR: Float64Array, bo: number, bhx: number, bhy: number, bhz: number): void {
    axTx = ac[aco] - bc[0]; axTy = ac[aco + 1] - bc[1]; axTz = ac[aco + 2] - bc[2];
    axAR = aR; axBR = bR; axAo = ao; axBo = bo;
    axAhx = ahx; axAhy = ahy; axAhz = ahz; axBhx = bhx; axBhy = bhy; axBhz = bhz;
    axisBest = Infinity; axisX = 0; axisY = 1; axisZ = 0; axisReach = 0;
    for (let k = 0; k < 3; k++) considerAxis(aR[ao + k], aR[ao + 3 + k], aR[ao + 6 + k], false);
    for (let k = 0; k < 3; k++) considerAxis(bR[bo + k], bR[bo + 3 + k], bR[bo + 6 + k], false);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const ax = aR[ao + i], ay = aR[ao + 3 + i], az = aR[ao + 6 + i];
      const ex = bR[bo + j], ey = bR[bo + 3 + j], ez = bR[bo + 6 + j];
      considerAxis(ay * ez - az * ey, az * ex - ax * ez, ax * ey - ay * ex, true);
    }
    satN[0] = axisX; satN[1] = axisY; satN[2] = axisZ;
    satReachB = axisReach;
  }

  // a body's box parts in the world this pair (scratch, up to MAX_PARTS per body), and their axes against one box
  const MAX_PARTS = 16;
  const partC = new Float64Array(MAX_PARTS * 3), partR = new Float64Array(MAX_PARTS * 9);
  const partAxis = new Float64Array(MAX_PARTS * 5); // nx, ny, nz, overlap, reach of B along n
  const partState = new Uint8Array(MAX_PARTS); // 0 not computed, 1 axis ready, 2 not a box
  const otherC = new Float64Array(3), otherR = new Float64Array(9);

  /**
   * Sphere k of body a against box (otherC, otherR, half extents) with a's box parts' shared axes: when the sphere's own
   * part is a box, its contact keeps the sphere's own geometric depth (sphereBox's: a contact exists exactly where the
   * spheres meet the box) but pushes along that part's shared axis against the box, the depth no more than the boxes'
   * overlap; otherwise the sphere's own nearest point stands (the scratch from sphereBox).
   */
  function sharedAxisContact(a: number, k: number, x: number, y: number, z: number, r: number,
    bhx: number, bhy: number, bhz: number): void {
    const shape = shapes[a]!;
    const part = shape.sphereSolid[k];
    if (part < 0 || part >= MAX_PARTS) return;
    if (partState[part] === 0) {
      const o = part * SOLID_STRIDE;
      if (shape.solids[o] !== SOLID_BOX) { partState[part] = 2; return; }
      boxPartToWorld(a, shape.solids, o, partC, part * 3, partR, part * 9);
      boxBoxAxis(partC, part * 3, partR, part * 9, shape.solids[o + 8], shape.solids[o + 9], shape.solids[o + 10],
        otherC, otherR, 0, bhx, bhy, bhz);
      partAxis[part * 5] = satN[0]; partAxis[part * 5 + 1] = satN[1]; partAxis[part * 5 + 2] = satN[2];
      partAxis[part * 5 + 3] = satOverlap; partAxis[part * 5 + 4] = satReachB;
      partState[part] = 1;
    }
    if (partState[part] !== 1) return;
    const nx = partAxis[part * 5], ny = partAxis[part * 5 + 1], nz = partAxis[part * 5 + 2];
    // (a plane's depth along the axis would give a sphere beside the box's face a phantom penetration — a slab resting on
    // a panel's edge flickered on and off it: the sphere's own depth stands, capped at the boxes' overlap)
    const depth = Math.min(sDepth, Math.max(partAxis[part * 5 + 3], 0) + 0.002);
    sNx = nx; sNy = ny; sNz = nz;
    sDepth = depth;
    sPx = x - nx * r; sPy = y - ny * r; sPz = z - nz * r;
  }

  /**
   * A world point of something else (a static corner, a kinematic box's corner) inside one of body i's solids: a
   * contact pushing the body off it.
   */
  function featureIntoBody(i: number, x: number, y: number, z: number, b: number,
    friction: number, restitution: number, kvx0: number, kvy0: number, kvz0: number): void {
    if (x < bminX[i] || x > bmaxX[i] || y < bminY[i] || y > bmaxY[i] || z < bminZ[i] || z > bmaxZ[i]) return;
    const shape = shapes[i]!;
    const s = shape.solids;
    for (let o = 0; o < s.length; o += SOLID_STRIDE) {
      solidToWorld(i, s, o);
      let hit: boolean;
      if (s[o] === SOLID_BOX) hit = sphereBox(x, y, z, 0, solidCx, solidCy, solidCz, solidRot, 0, s[o + 8], s[o + 9], s[o + 10]);
      else hit = sphereCapsule(x, y, z, 0, solidCx, solidCy, solidCz, solidBx, solidBy, solidBz, s[o + 7]);
      // speculative like the spheres' contacts: a corner within the margin outside keeps its contact (no flicker on/off
      // as the solver holds a slab a millimetre off a pier's corner)
      if (!hit || !(sDepth > -CONTACT_MARGIN_M)) continue;
      // the point leaves the solid along +n: the body moves along −n
      addContact(i, b, -1, PARTNER_NONE, x, y, z, -sNx, -sNy, -sNz, sDepth, friction, restitution, kvx0, kvy0, kvz0);
      return;
    }
  }

  // ---- kinematic boxes ----
  function kinematicPointVelocity(k: number, x: number, y: number, z: number, out: Float64Array): void {
    const o = k * 6, c = k * 3;
    const rx = x - kc[c], ry = y - kc[c + 1], rz = z - kc[c + 2];
    out[0] = kv[o] + kv[o + 4] * rz - kv[o + 5] * ry;
    out[1] = kv[o + 1] + kv[o + 5] * rx - kv[o + 3] * rz;
    out[2] = kv[o + 2] + kv[o + 3] * ry - kv[o + 4] * rx;
  }
  const kvScratch = new Float64Array(3);

  function kinematicContacts(i: number): void {
    const shape = shapes[i]!;
    const base = sphereBase[i];
    const friction = Math.sqrt(shape.friction * KINEMATIC_FRICTION);
    const restitution = 0.5 * (shape.restitution + KINEMATIC_RESTITUTION);
    const ignoreOwner = ignoreOwnerSteps[i] > 0 ? owner[i] : -2;
    for (let k = 0; k < kinematicCount; k++) {
      if (kOwner[k] === ignoreOwner) continue;
      const c = k * 3;
      const rr = kRadius[k] + shape.radius + CONTACT_MARGIN_M;
      const dx = px[i] - kc[c], dy = py[i] - kc[c + 1], dz = pz[i] - kc[c + 2];
      if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
      const hx = kh[c], hy = kh[c + 1], hz = kh[c + 2];
      otherC[0] = kc[c]; otherC[1] = kc[c + 1]; otherC[2] = kc[c + 2];
      for (let m = 0; m < 9; m++) otherR[m] = kr[k * 9 + m];
      partState.fill(0);
      for (let s = 0, n = shape.sphereCount; s < n; s++) {
        const j = (base + s) * 3;
        const x = sphereWorld[j], y = sphereWorld[j + 1], z = sphereWorld[j + 2];
        const r = shape.spheres[s * 4 + 3];
        if (!sphereBox(x, y, z, r, kc[c], kc[c + 1], kc[c + 2], kr, k * 9, hx, hy, hz)) continue;
        sharedAxisContact(i, s, x, y, z, r, hx, hy, hz);
        if (!(sDepth > -CONTACT_MARGIN_M)) continue;
        kinematicPointVelocity(k, sPx, sPy, sPz, kvScratch);
        addContact(i, -3 - k, base + s, 1 + k, sPx, sPy, sPz, sNx, sNy, sNz, sDepth, friction, restitution,
          kvScratch[0], kvScratch[1], kvScratch[2]);
      }
      // the box's corners and edge midpoints into the body (a deck edge under a turret's floor)
      const m = k * 9;
      for (let ux = -1; ux <= 1; ux++) for (let uy = -1; uy <= 1; uy++) for (let uz = -1; uz <= 1; uz++) {
        if ((ux !== 0 ? 1 : 0) + (uy !== 0 ? 1 : 0) + (uz !== 0 ? 1 : 0) < 2) continue;
        const lx = ux * hx, ly = uy * hy, lz = uz * hz;
        const x = kc[c] + kr[m] * lx + kr[m + 1] * ly + kr[m + 2] * lz;
        const y = kc[c + 1] + kr[m + 3] * lx + kr[m + 4] * ly + kr[m + 5] * lz;
        const z = kc[c + 2] + kr[m + 6] * lx + kr[m + 7] * ly + kr[m + 8] * lz;
        kinematicPointVelocity(k, x, y, z, kvScratch);
        featureIntoBody(i, x, y, z, -3 - k, friction, restitution, kvScratch[0], kvScratch[1], kvScratch[2]);
      }
    }
  }

  // ---- body pairs ----
  function pairContacts(i: number, j: number): void {
    // i's spheres against j's solids, then j's spheres against i's solids (both as contacts on the pair, normal
    // pushing the sphere's body)
    sphereSolids(i, j);
    sphereSolids(j, i);
  }

  function sphereSolids(a: number, b: number): void {
    const shapeA = shapes[a]!, shapeB = shapes[b]!;
    const friction = Math.sqrt(shapeA.friction * shapeB.friction);
    const restitution = 0.5 * (shapeA.restitution + shapeB.restitution);
    const base = sphereBase[a];
    const s = shapeB.solids;
    for (let o = 0; o < s.length; o += SOLID_STRIDE) {
      solidToWorld(b, s, o);
      const box = s[o] === SOLID_BOX;
      if (box) {
        // b's box for the shared axes of a's box parts (computed on a sphere's first hit)
        otherC[0] = solidCx; otherC[1] = solidCy; otherC[2] = solidCz;
        for (let m = 0; m < 9; m++) otherR[m] = solidRot[m];
        partState.fill(0);
      }
      for (let k = 0, n = shapeA.sphereCount; k < n; k++) {
        const j = (base + k) * 3;
        const x = sphereWorld[j], y = sphereWorld[j + 1], z = sphereWorld[j + 2];
        if (x < bminX[b] || x > bmaxX[b] || y < bminY[b] || y > bmaxY[b] || z < bminZ[b] || z > bmaxZ[b]) continue;
        const r = shapeA.spheres[k * 4 + 3];
        const hit = box
          ? sphereBox(x, y, z, r, otherC[0], otherC[1], otherC[2], otherR, 0, s[o + 8], s[o + 9], s[o + 10])
          : sphereCapsule(x, y, z, r, solidCx, solidCy, solidCz, solidBx, solidBy, solidBz, s[o + 7]);
        if (!hit) continue;
        if (box) sharedAxisContact(a, k, x, y, z, r, s[o + 8], s[o + 9], s[o + 10]);
        if (!(sDepth > -CONTACT_MARGIN_M)) continue;
        addContact(a, b, base + k, 1 + kinematicCapacity + b, sPx, sPy, sPz, sNx, sNy, sNz, sDepth, friction, restitution, 0, 0, 0);
      }
    }
  }

  // ---- solver ----
  function relativeVelocity(c: number, out: Float64Array): void {
    const a = cA[c], b = cB[c];
    const rax = cRax[c], ray = cRay[c], raz = cRaz[c];
    let x = vx[a] + wy[a] * raz - wz[a] * ray;
    let y = vy[a] + wz[a] * rax - wx[a] * raz;
    let z = vz[a] + wx[a] * ray - wy[a] * rax;
    if (b >= 0) {
      const rbx = cRbx[c], rby = cRby[c], rbz = cRbz[c];
      x -= vx[b] + wy[b] * rbz - wz[b] * rby;
      y -= vy[b] + wz[b] * rbx - wx[b] * rbz;
      z -= vz[b] + wx[b] * rby - wy[b] * rbx;
    } else { x -= cKvx[c]; y -= cKvy[c]; z -= cKvz[c]; }
    out[0] = x; out[1] = y; out[2] = z;
  }
  const rv = new Float64Array(3);

  /** k = 1/m + n·(I⁻¹ (r × n)) × r, summed over the dynamic sides. */
  function effectiveMass(c: number, nx: number, ny: number, nz: number): number {
    const a = cA[c], b = cB[c];
    let k = shapes[a]!.invMass;
    k += angularTerm(a, cRax[c], cRay[c], cRaz[c], nx, ny, nz);
    if (b >= 0) {
      k += shapes[b]!.invMass;
      k += angularTerm(b, cRbx[c], cRby[c], cRbz[c], nx, ny, nz);
    }
    return k > 1e-12 ? 1 / k : 0;
  }

  function angularTerm(i: number, rx: number, ry: number, rz: number, nx: number, ny: number, nz: number): number {
    // u = r × n; return u · (I⁻¹ u)
    const ux = ry * nz - rz * ny, uy = rz * nx - rx * nz, uz = rx * ny - ry * nx;
    const m = i * 6;
    const ix = iiw[m] * ux + iiw[m + 1] * uy + iiw[m + 2] * uz;
    const iy = iiw[m + 1] * ux + iiw[m + 3] * uy + iiw[m + 4] * uz;
    const iz = iiw[m + 2] * ux + iiw[m + 4] * uy + iiw[m + 5] * uz;
    return ux * ix + uy * iy + uz * iz;
  }

  /** Apply impulse j (world) at the contact: +j on a, −j on b. `pseudo` writes the split-impulse velocities. */
  function applyContactImpulse(c: number, jx: number, jy: number, jz: number, pseudo: boolean): void {
    const a = cA[c], b = cB[c];
    applyBodyImpulse(a, jx, jy, jz, cRax[c], cRay[c], cRaz[c], pseudo);
    if (b >= 0) applyBodyImpulse(b, -jx, -jy, -jz, cRbx[c], cRby[c], cRbz[c], pseudo);
  }

  function applyBodyImpulse(i: number, jx: number, jy: number, jz: number, rx: number, ry: number, rz: number, pseudo: boolean): void {
    const im = shapes[i]!.invMass;
    // torque impulse r × j, then I⁻¹
    const tx = ry * jz - rz * jy, ty = rz * jx - rx * jz, tz = rx * jy - ry * jx;
    const m = i * 6;
    const ax = iiw[m] * tx + iiw[m + 1] * ty + iiw[m + 2] * tz;
    const ay = iiw[m + 1] * tx + iiw[m + 3] * ty + iiw[m + 4] * tz;
    const az = iiw[m + 2] * tx + iiw[m + 4] * ty + iiw[m + 5] * tz;
    if (pseudo) {
      pvx[i] += jx * im; pvy[i] += jy * im; pvz[i] += jz * im;
      pwx[i] += ax; pwy[i] += ay; pwz[i] += az;
    } else {
      vx[i] += jx * im; vy[i] += jy * im; vz[i] += jz * im;
      wx[i] += ax; wy[i] += ay; wz[i] += az;
    }
  }

  function prepareContacts(dt: number): void {
    for (let c = 0; c < contactCount; c++) {
      const a = cA[c], b = cB[c];
      cRax[c] = cPx[c] - px[a]; cRay[c] = cPy[c] - py[a]; cRaz[c] = cPz[c] - pz[a];
      if (b >= 0) { cRbx[c] = cPx[c] - px[b]; cRby[c] = cPy[c] - py[b]; cRbz[c] = cPz[c] - pz[b]; }
      else { cRbx[c] = 0; cRby[c] = 0; cRbz[c] = 0; }
      const nx = cNx[c], ny = cNy[c], nz = cNz[c];
      // a fixed tangent basis from the normal
      let t1x: number, t1y: number, t1z: number;
      if (Math.abs(ny) < 0.9) { t1x = nz; t1y = 0; t1z = -nx; } else { t1x = 0; t1y = -nz; t1z = ny; }
      const tl = 1 / Math.sqrt(t1x * t1x + t1y * t1y + t1z * t1z);
      t1x *= tl; t1y *= tl; t1z *= tl;
      const t2x = ny * t1z - nz * t1y, t2y = nz * t1x - nx * t1z, t2z = nx * t1y - ny * t1x;
      cT1x[c] = t1x; cT1y[c] = t1y; cT1z[c] = t1z;
      cT2x[c] = t2x; cT2y[c] = t2y; cT2z[c] = t2z;
      cMassN[c] = effectiveMass(c, nx, ny, nz);
      cMassT1[c] = effectiveMass(c, t1x, t1y, t1z);
      cMassT2[c] = effectiveMass(c, t2x, t2y, t2z);
      relativeVelocity(c, rv);
      const vn = rv[0] * nx + rv[1] * ny + rv[2] * nz;
      // a contact still apart (inside the margin) lets the body close its gap this step and no more (speculative);
      // a touching one bounces back faster approaches
      cBias[c] = cDepth[c] < 0 ? cDepth[c] / dt : vn < -RESTITUTION_MIN_MPS ? -cRestitution[c] * vn : 0;
      cBiasP[c] = (BAUMGARTE / dt) * Math.max(0, cDepth[c] - SLOP_M);
      cJp[c] = 0;
      // the strongest approach of the body (impact reports)
      if (-vn > bestImpact[a]) { bestImpact[a] = -vn; bestImpactContact[a] = c; }
      // warm start from the same sphere on the same partner last step
      const sphere = cSphere[c];
      let warm = false;
      if (sphere >= 0) {
        if (cPartner[c] !== PARTNER_NONE && warmPartner[sphere] === cPartner[c]) {
          cJn[c] = warmN[sphere] * 0.85; cJt1[c] = warmT1[sphere] * 0.85; cJt2[c] = warmT2[sphere] * 0.85;
          warm = true;
        }
      } else {
        // a feature contact: last step's at the same place on the same body, by distance and normal
        const base = a * FEATURE_CACHE * 9;
        let bestD2 = FEATURE_MATCH_M * FEATURE_MATCH_M, best = -1;
        for (let f = 0, n = featureCount[a]; f < n; f++) {
          const o = base + f * 9;
          if (featureCache[o + 3] * nx + featureCache[o + 4] * ny + featureCache[o + 5] * nz < FEATURE_MATCH_DOT) continue;
          const dx = featureCache[o] - cPx[c], dy = featureCache[o + 1] - cPy[c], dz = featureCache[o + 2] - cPz[c];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < bestD2) { bestD2 = d2; best = o; }
        }
        if (best >= 0) {
          cJn[c] = featureCache[best + 6] * 0.85; cJt1[c] = featureCache[best + 7] * 0.85; cJt2[c] = featureCache[best + 8] * 0.85;
          warm = true;
        }
      }
      if (warm) {
        applyContactImpulse(c,
          cJn[c] * nx + cJt1[c] * t1x + cJt2[c] * t2x,
          cJn[c] * ny + cJt1[c] * t1y + cJt2[c] * t2y,
          cJn[c] * nz + cJt1[c] * t1z + cJt2[c] * t2z, false);
      } else { cJn[c] = 0; cJt1[c] = 0; cJt2[c] = 0; }
    }
  }

  function solveVelocities(): void {
    for (let iteration = 0; iteration < velocityIterations; iteration++) {
      for (let c = 0; c < contactCount; c++) {
        const nx = cNx[c], ny = cNy[c], nz = cNz[c];
        relativeVelocity(c, rv);
        const vn = rv[0] * nx + rv[1] * ny + rv[2] * nz;
        let dj = cMassN[c] * (cBias[c] - vn);
        const j0 = cJn[c];
        cJn[c] = Math.max(0, j0 + dj);
        dj = cJn[c] - j0;
        if (dj !== 0) applyContactImpulse(c, dj * nx, dj * ny, dj * nz, false);
        // friction in the box cone
        const limit = cFriction[c] * cJn[c];
        relativeVelocity(c, rv);
        const vt1 = rv[0] * cT1x[c] + rv[1] * cT1y[c] + rv[2] * cT1z[c];
        let d1 = -cMassT1[c] * vt1;
        const t10 = cJt1[c];
        cJt1[c] = Math.max(-limit, Math.min(limit, t10 + d1));
        d1 = cJt1[c] - t10;
        const vt2 = rv[0] * cT2x[c] + rv[1] * cT2y[c] + rv[2] * cT2z[c];
        let d2 = -cMassT2[c] * vt2;
        const t20 = cJt2[c];
        cJt2[c] = Math.max(-limit, Math.min(limit, t20 + d2));
        d2 = cJt2[c] - t20;
        if (d1 !== 0 || d2 !== 0) {
          applyContactImpulse(c,
            d1 * cT1x[c] + d2 * cT2x[c], d1 * cT1y[c] + d2 * cT2y[c], d1 * cT1z[c] + d2 * cT2z[c], false);
        }
      }
    }
  }

  function solvePositions(): void {
    for (let iteration = 0; iteration < positionIterations; iteration++) {
      for (let c = 0; c < contactCount; c++) {
        if (cBiasP[c] <= 0) continue;
        const a = cA[c], b = cB[c];
        const nx = cNx[c], ny = cNy[c], nz = cNz[c];
        const rax = cRax[c], ray = cRay[c], raz = cRaz[c];
        let x = pvx[a] + pwy[a] * raz - pwz[a] * ray;
        let y = pvy[a] + pwz[a] * rax - pwx[a] * raz;
        let z = pvz[a] + pwx[a] * ray - pwy[a] * rax;
        if (b >= 0) {
          const rbx = cRbx[c], rby = cRby[c], rbz = cRbz[c];
          x -= pvx[b] + pwy[b] * rbz - pwz[b] * rby;
          y -= pvy[b] + pwz[b] * rbx - pwx[b] * rbz;
          z -= pvz[b] + pwx[b] * rby - pwy[b] * rbx;
        }
        const vn = x * nx + y * ny + z * nz;
        let dj = cMassN[c] * (cBiasP[c] - vn);
        const j0 = cJp[c];
        cJp[c] = Math.max(0, j0 + dj);
        dj = cJp[c] - j0;
        if (dj !== 0) applyContactImpulse(c, dj * nx, dj * ny, dj * nz, true);
      }
    }
  }

  function storeWarmStart(): void {
    // clear the caches of this step's spheres, then keep each sphere's first contact
    for (let c = 0; c < contactCount; c++) { const s = cSphere[c]; if (s >= 0) warmPartner[s] = PARTNER_NONE; }
    for (let c = 0; c < contactCount; c++) {
      const s = cSphere[c];
      if (s < 0 || warmPartner[s] !== PARTNER_NONE) continue;
      warmPartner[s] = cPartner[c]; warmN[s] = cJn[c]; warmT1[s] = cJt1[c]; warmT2[s] = cJt2[c];
    }
    // the feature contacts by body (awake bodies' caches are rewritten; a sleeper's keeps its last)
    for (let i = 0; i < capacity; i++) if (active[i] && !asleep[i]) featureCount[i] = 0;
    for (let c = 0; c < contactCount; c++) {
      if (cSphere[c] >= 0) continue;
      const a = cA[c];
      const n = featureCount[a];
      if (n >= FEATURE_CACHE) continue;
      const o = (a * FEATURE_CACHE + n) * 9;
      featureCache[o] = cPx[c]; featureCache[o + 1] = cPy[c]; featureCache[o + 2] = cPz[c];
      featureCache[o + 3] = cNx[c]; featureCache[o + 4] = cNy[c]; featureCache[o + 5] = cNz[c];
      featureCache[o + 6] = cJn[c]; featureCache[o + 7] = cJt1[c]; featureCache[o + 8] = cJt2[c];
      featureCount[a] = n + 1;
    }
  }

  // ---- integration and sleep ----
  function integrate(i: number, dt: number): void {
    const shape = shapes[i]!;
    let lx = vx[i] + pvx[i], ly = vy[i] + pvy[i], lz = vz[i] + pvz[i];
    px[i] += lx * dt; py[i] += ly * dt; pz[i] += lz * dt;
    const ax = wx[i] + pwx[i], ay = wy[i] + pwy[i], az = wz[i] + pwz[i];
    // q += ½ dt (ω, 0) ⊗ q
    const x = qx[i], y = qy[i], z = qz[i], w = qw[i];
    const h = 0.5 * dt;
    let nx = x + h * (ax * w + ay * z - az * y);
    let ny = y + h * (ay * w + az * x - ax * z);
    let nz = z + h * (az * w + ax * y - ay * x);
    let nw = w - h * (ax * x + ay * y + az * z);
    const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
    nx *= inv; ny *= inv; nz *= inv; nw *= inv;
    qx[i] = nx; qy[i] = ny; qz[i] = nz; qw[i] = nw;
    pvx[i] = pvy[i] = pvz[i] = 0;
    pwx[i] = pwy[i] = pwz[i] = 0;
    // drag (rolling resistance while touching)
    const linear = 1 / (1 + shape.linearDrag * dt);
    const angular = 1 / (1 + (shape.angularDrag + (touching[i] ? shape.rolling : 0)) * dt);
    vx[i] *= linear; vy[i] *= linear; vz[i] *= linear;
    wx[i] *= angular; wy[i] *= angular; wz[i] *= angular;
    lx = vx[i]; ly = vy[i]; lz = vz[i];
    const speed2 = lx * lx + ly * ly + lz * lz;
    if (speed2 > MAX_LINEAR_MPS * MAX_LINEAR_MPS) {
      const k = MAX_LINEAR_MPS / Math.sqrt(speed2);
      vx[i] *= k; vy[i] *= k; vz[i] *= k;
    }
    const spin2 = wx[i] * wx[i] + wy[i] * wy[i] + wz[i] * wz[i];
    if (spin2 > MAX_ANGULAR_RADS * MAX_ANGULAR_RADS) {
      const k = MAX_ANGULAR_RADS / Math.sqrt(spin2);
      wx[i] *= k; wy[i] *= k; wz[i] *= k;
    }
  }

  function sleepCheck(i: number): void {
    const v2 = vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i];
    const w2 = wx[i] * wx[i] + wy[i] * wy[i] + wz[i] * wz[i];
    if (touching[i] && v2 < SLEEP_LINEAR_MPS * SLEEP_LINEAR_MPS && w2 < SLEEP_ANGULAR_RADS * SLEEP_ANGULAR_RADS) {
      if (restSteps[i] < 65535) restSteps[i]++;
    } else restSteps[i] = 0;
    if (restSteps[i] >= SLEEP_STEPS || age[i] >= FORCE_SLEEP_STEPS) putToSleep(i);
  }

  function putToSleep(i: number): void {
    asleep[i] = 1;
    vx[i] = vy[i] = vz[i] = 0;
    wx[i] = wy[i] = wz[i] = 0;
    supportClock[i] = 0;
    restSteps[i] = 0;
  }

  function wake(i: number): void {
    if (!active[i] || !asleep[i]) return;
    asleep[i] = 0;
    restSteps[i] = 0;
    // a body woken in the middle of a long life gets its full time again before the force-sleep
    if (age[i] >= FORCE_SLEEP_STEPS) age[i] = FORCE_SLEEP_STEPS - SLEEP_STEPS * 8;
  }

  // ---- the step ----
  function sortOrder(): void {
    orderCount = 0;
    for (let i = 0; i < capacity; i++) if (active[i]) order[orderCount++] = i;
    // insertion sort by min x, slot order on ties (deterministic, near-linear for coherent motion)
    for (let a = 1; a < orderCount; a++) {
      const v = order[a];
      const key = bminX[v];
      let b = a - 1;
      while (b >= 0 && (bminX[order[b]] > key || (bminX[order[b]] === key && order[b] > v))) { order[b + 1] = order[b]; b--; }
      order[b + 1] = v;
    }
  }

  /** A sleeper a moving kinematic box reaches wakes (a hull shoving a resting turret). */
  function sleeperMetByMover(i: number): boolean {
    const r = shapes[i]!.radius + CONTACT_MARGIN_M;
    for (let k = 0; k < kinematicCount; k++) {
      const o = k * 6;
      const moving = kv[o] * kv[o] + kv[o + 1] * kv[o + 1] + kv[o + 2] * kv[o + 2]
        + kv[o + 3] * kv[o + 3] + kv[o + 4] * kv[o + 4] + kv[o + 5] * kv[o + 5];
      if (moving < 0.0025) continue;
      const c = k * 3;
      const rr = kRadius[k] + r;
      const dx = px[i] - kc[c], dy = py[i] - kc[c + 1], dz = pz[i] - kc[c + 2];
      if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
      // the exact test: any contact sphere inside the box (or the box's corners in the body)
      const start = contactCount;
      bodyContactStart = start;
      kinematicContacts(i);
      let met = false;
      for (let n = start; n < contactCount; n++) if (cDepth[n] > 0) { met = true; break; }
      contactCount = start;
      if (met) return true;
    }
    return false;
  }

  /** Whether a sleeper lies on another body (a stacked block, a turret on a fallen slab). */
  function restsOnBody(i: number): boolean {
    for (let j = 0; j < capacity; j++) {
      if (j === i || !active[j]) continue;
      updateRotation(j);
      updateSpheres(j);
      if (bmaxX[j] < bminX[i] || bminX[j] > bmaxX[i] || bmaxY[j] < bminY[i] || bminY[j] > bmaxY[i]
        || bmaxZ[j] < bminZ[i] || bminZ[j] > bmaxZ[i]) continue;
      const start = contactCount;
      bodyContactStart = start;
      sphereSolids(i, j);
      sphereSolids(j, i);
      let under = false;
      for (let c = start; c < contactCount; c++) {
        // i's sphere pushed up off j, or j's sphere pushed down off i
        if ((cA[c] === i && cNy[c] > 0.3) || (cA[c] === j && cNy[c] < -0.3)) { under = true; break; }
      }
      contactCount = start;
      if (under) return true;
    }
    return false;
  }

  let lastAwake = 0;
  function step(dt = RIGID_STEP_S): void {
    impactCount = 0;
    contactCount = 0;
    if (!environment) return;
    let any = false;
    for (let i = 0; i < capacity; i++) {
      if (!active[i]) continue;
      ppx[i] = px[i]; ppy[i] = py[i]; ppz[i] = pz[i];
      pqx[i] = qx[i]; pqy[i] = qy[i]; pqz[i] = qz[i]; pqw[i] = qw[i];
      age[i]++;
      if (impactCooldown[i] > 0) impactCooldown[i]--;
      if (ignoreOwnerSteps[i] > 0) ignoreOwnerSteps[i]--;
      if (asleep[i]) {
        updateRotation(i);
        updateSpheres(i);
        if (sleeperMetByMover(i)) wake(i);
        else if (++supportClock[i] >= SUPPORT_CHECK_STEPS) {
          // a sleeper re-checks its support now and then (a crater dug or a building gone under it)
          supportClock[i] = 0;
          const start = contactCount;
          bodyContactStart = start;
          groundContacts(i); staticContacts(i); kinematicContacts(i);
          let supported = false;
          for (let c = start; c < contactCount; c++) if (cNy[c] > 0.3) { supported = true; break; }
          contactCount = start;
          if (!supported) supported = restsOnBody(i);
          if (!supported) wake(i);
        }
        if (asleep[i]) continue;
      }
      any = true;
      vy[i] -= gravity * dt;
    }
    if (!any) { lastAwake = 0; return; }
    for (let i = 0; i < capacity; i++) {
      if (!active[i]) continue;
      updateRotation(i);
      updateSpheres(i);
      bestImpact[i] = 0;
      bestImpactContact[i] = -1;
      touching[i] = 0;
    }
    sortOrder();
    // the ground, the static records and the kinematic boxes, for every awake body (its own budget each)
    for (let n = 0; n < orderCount; n++) {
      const i = order[n];
      if (asleep[i]) continue;
      bodyContactStart = contactCount;
      groundContacts(i);
      staticContacts(i);
      kinematicContacts(i);
    }
    // body pairs by the sweep on min x (each overlapping pair once, its own budget)
    for (let n = 0; n < orderCount; n++) {
      const i = order[n];
      for (let m = n + 1; m < orderCount; m++) {
        const j = order[m];
        if (bminX[j] > bmaxX[i]) break;
        if (asleep[i] && asleep[j]) continue;
        if (bmaxY[j] < bminY[i] || bminY[j] > bmaxY[i] || bmaxZ[j] < bminZ[i] || bminZ[j] > bmaxZ[i]) continue;
        const start = contactCount;
        bodyContactStart = start;
        pairContacts(i, j);
        if (contactCount === start || (!asleep[i] && !asleep[j])) continue;
        // a sleeper met hard (or slid out from under) wakes; one only rested on stays asleep and acts as fixed ground
        let hard = false;
        for (let c = start; c < contactCount; c++) {
          relativeVelocityRaw(c, rv);
          const speed2 = rv[0] * rv[0] + rv[1] * rv[1] + rv[2] * rv[2];
          if (speed2 > WAKE_MPS * WAKE_MPS || cDepth[c] > 0.05) { hard = true; break; }
        }
        if (hard) { wake(i); wake(j); continue; }
        for (let c = start; c < contactCount; c++) {
          const a = cA[c];
          if (asleep[a]) {
            // the sleeper's sphere in the awake body: the same contact seen from the awake side
            cA[c] = cB[c]; cNx[c] = -cNx[c]; cNy[c] = -cNy[c]; cNz[c] = -cNz[c];
          }
          cB[c] = -2; cSphere[c] = -1; cPartner[c] = PARTNER_NONE;
        }
      }
    }
    for (let c = 0; c < contactCount; c++) {
      touching[cA[c]] = 1;
      if (cB[c] >= 0) touching[cB[c]] = 1;
    }
    prepareContacts(dt);
    solveVelocities();
    solvePositions();
    storeWarmStart();
    let awake = 0;
    for (let i = 0; i < capacity; i++) {
      if (!active[i] || asleep[i]) continue;
      integrate(i, dt);
      // impact report: the body's strongest approach this step
      if (bestImpactContact[i] >= 0 && bestImpact[i] > IMPACT_MIN_MPS && impactCooldown[i] === 0 && impactCount < MAX_IMPACTS_PER_STEP) {
        const c = bestImpactContact[i];
        const n = impactCount++;
        impactX[n] = cPx[c]; impactY[n] = cPy[c]; impactZ[n] = cPz[c];
        impactSpeed[n] = bestImpact[i]; impactMass[n] = shapes[i]!.mass; impactSlot[n] = i;
        const b = cB[c];
        impactPartner[n] = b >= 0 ? RIGID_PARTNER.BODY : b === -1 ? RIGID_PARTNER.GROUND : b === -2 ? RIGID_PARTNER.STATIC : RIGID_PARTNER.KINEMATIC;
        impactCooldown[i] = IMPACT_COOLDOWN_STEPS;
      }
      sleepCheck(i);
      if (!asleep[i]) awake++;
    }
    lastAwake = awake;
  }

  /** Relative normal velocity before the solve (used to decide whether a sleeper was hit). */
  function relativeVelocityRaw(c: number, out: Float64Array): void {
    const a = cA[c], b = cB[c];
    const rax = cPx[c] - px[a], ray = cPy[c] - py[a], raz = cPz[c] - pz[a];
    let x = vx[a] + wy[a] * raz - wz[a] * ray;
    let y = vy[a] + wz[a] * rax - wx[a] * raz;
    let z = vz[a] + wx[a] * ray - wy[a] * rax;
    if (b >= 0) {
      const rbx = cPx[c] - px[b], rby = cPy[c] - py[b], rbz = cPz[c] - pz[b];
      x -= vx[b] + wy[b] * rbz - wz[b] * rby;
      y -= vy[b] + wz[b] * rbx - wx[b] * rbz;
      z -= vz[b] + wx[b] * rby - wy[b] * rbx;
    }
    out[0] = x; out[1] = y; out[2] = z;
  }


  // ---- slots ----
  function compactSpheres(): void {
    // move the live bodies' spheres down to the front of the pool (rare: a spawn that does not fit)
    let top = 0;
    for (let i = 0; i < capacity; i++) {
      if (!active[i]) continue;
      const n = sphereCount[i], from = sphereBase[i];
      if (from !== top) {
        for (let k = 0; k < n; k++) {
          warmPartner[top + k] = warmPartner[from + k];
          warmN[top + k] = warmN[from + k]; warmT1[top + k] = warmT1[from + k]; warmT2[top + k] = warmT2[from + k];
        }
        sphereBase[i] = top;
      }
      top += n;
    }
    sphereTop = top;
  }

  function spawn(shape: RigidShape, s: RigidSpawn): number {
    let slot = -1;
    for (let i = 0; i < capacity; i++) if (!active[i]) { slot = i; break; }
    if (slot < 0) return -1;
    if (sphereTop + shape.sphereCount > spherePool) compactSpheres();
    if (sphereTop + shape.sphereCount > spherePool) return -1;
    shapes[slot] = shape;
    sphereBase[slot] = sphereTop;
    sphereCount[slot] = shape.sphereCount;
    for (let k = 0; k < shape.sphereCount; k++) warmPartner[sphereTop + k] = PARTNER_NONE;
    sphereTop += shape.sphereCount;
    let x = s.qx ?? 0, y = s.qy ?? 0, z = s.qz ?? 0, w = s.qw ?? 1;
    const n = Math.sqrt(x * x + y * y + z * z + w * w) || 1;
    x /= n; y /= n; z /= n; w /= n;
    qx[slot] = x; qy[slot] = y; qz[slot] = z; qw[slot] = w;
    active[slot] = 1;
    updateRotation(slot);
    // the centre of mass = frame origin + R·com
    const o = slot * 9, c = shape.com;
    px[slot] = s.x + rot[o] * c[0] + rot[o + 1] * c[1] + rot[o + 2] * c[2];
    py[slot] = s.y + rot[o + 3] * c[0] + rot[o + 4] * c[1] + rot[o + 5] * c[2];
    pz[slot] = s.z + rot[o + 6] * c[0] + rot[o + 7] * c[1] + rot[o + 8] * c[2];
    ppx[slot] = px[slot]; ppy[slot] = py[slot]; ppz[slot] = pz[slot];
    pqx[slot] = x; pqy[slot] = y; pqz[slot] = z; pqw[slot] = w;
    vx[slot] = s.vx ?? 0; vy[slot] = s.vy ?? 0; vz[slot] = s.vz ?? 0;
    wx[slot] = s.wx ?? 0; wy[slot] = s.wy ?? 0; wz[slot] = s.wz ?? 0;
    pvx[slot] = pvy[slot] = pvz[slot] = 0; pwx[slot] = pwy[slot] = pwz[slot] = 0;
    asleep[slot] = s.asleep ? 1 : 0;
    featureCount[slot] = 0;
    age[slot] = 0;
    restSteps[slot] = 0;
    supportClock[slot] = 0;
    impactCooldown[slot] = 0;
    owner[slot] = s.owner ?? -1;
    ignoreOwnerSteps[slot] = Math.max(0, s.ignoreOwnerSteps ?? 0) | 0;
    touching[slot] = 0;
    updateSpheres(slot);
    return slot;
  }

  function remove(slot: number): void {
    if (slot < 0 || slot >= capacity || !active[slot]) return;
    active[slot] = 0;
    asleep[slot] = 0;
    shapes[slot] = null;
    // the pool's top shrinks when the last block goes; holes are reclaimed by compaction
    if (sphereBase[slot] + sphereCount[slot] === sphereTop) sphereTop = sphereBase[slot];
    sphereCount[slot] = 0;
  }

  function framePoseFrom(slot: number, x: number, y: number, z: number, a: number, b: number, c: number, d: number,
    out: Float64Array | number[]): void {
    const shape = shapes[slot];
    const com = shape ? shape.com : null;
    let ox = x, oy = y, oz = z;
    if (com) {
      // origin = p − R·com
      const cx0 = com[0], cy0 = com[1], cz0 = com[2];
      const tx = b * cz0 - c * cy0 + d * cx0;
      const ty = c * cx0 - a * cz0 + d * cy0;
      const tz = a * cy0 - b * cx0 + d * cz0;
      const rx = cx0 + 2 * (b * tz - c * ty);
      const ry = cy0 + 2 * (c * tx - a * tz);
      const rz = cz0 + 2 * (a * ty - b * tx);
      ox -= rx; oy -= ry; oz -= rz;
    }
    out[0] = ox; out[1] = oy; out[2] = oz; out[3] = a; out[4] = b; out[5] = c; out[6] = d;
  }

  const world: RigidWorld = {
    capacity,
    get gravity() { return gravity; },
    set gravity(value: number) { gravity = Math.max(0, value); },
    px, py, pz, qx, qy, qz, qw, vx, vy, vz, wx, wy, wz,
    ppx, ppy, ppz, pqx, pqy, pqz, pqw,
    active, asleep, age,
    get impactCount() { return impactCount; },
    impactX, impactY, impactZ, impactSpeed, impactMass, impactSlot, impactPartner,
    get count() { let n = 0; for (let i = 0; i < capacity; i++) n += active[i]; return n; },
    get awakeCount() { return lastAwake; },
    shape: (slot) => (slot >= 0 && slot < capacity ? shapes[slot] : null),
    bindEnvironment(env) { environment = env; },
    spawn,
    remove,
    clear() {
      for (let i = 0; i < capacity; i++) { active[i] = 0; asleep[i] = 0; shapes[i] = null; sphereCount[i] = 0; }
      sphereTop = 0; kinematicCount = 0; contactCount = 0; impactCount = 0; lastAwake = 0;
    },
    setKinematicCount(count) { kinematicCount = Math.max(0, Math.min(kinematicCapacity, count | 0)); },
    setKinematic(index, kOwner0, cx0, cy0, cz0, qx0, qy0, qz0, qw0, hx, hy, hz, vx0, vy0, vz0, wx0, wy0, wz0) {
      if (index < 0 || index >= kinematicCapacity) return;
      kOwner[index] = kOwner0;
      const c = index * 3, m = index * 9, o = index * 6;
      kc[c] = cx0; kc[c + 1] = cy0; kc[c + 2] = cz0;
      kh[c] = hx; kh[c + 1] = hy; kh[c + 2] = hz;
      const n = Math.sqrt(qx0 * qx0 + qy0 * qy0 + qz0 * qz0 + qw0 * qw0) || 1;
      const x = qx0 / n, y = qy0 / n, z = qz0 / n, w = qw0 / n;
      const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx1 = w * x, wy1 = w * y, wz1 = w * z;
      kr[m] = 1 - 2 * (yy + zz); kr[m + 1] = 2 * (xy - wz1); kr[m + 2] = 2 * (xz + wy1);
      kr[m + 3] = 2 * (xy + wz1); kr[m + 4] = 1 - 2 * (xx + zz); kr[m + 5] = 2 * (yz - wx1);
      kr[m + 6] = 2 * (xz - wy1); kr[m + 7] = 2 * (yz + wx1); kr[m + 8] = 1 - 2 * (xx + yy);
      kv[o] = vx0; kv[o + 1] = vy0; kv[o + 2] = vz0; kv[o + 3] = wx0; kv[o + 4] = wy0; kv[o + 5] = wz0;
      kRadius[index] = Math.sqrt(hx * hx + hy * hy + hz * hz);
    },
    applyImpulse(slot, jx, jy, jz, x, y, z) {
      if (slot < 0 || slot >= capacity || !active[slot]) return;
      wake(slot);
      updateRotation(slot);
      applyBodyImpulse(slot, jx, jy, jz, x - px[slot], y - py[slot], z - pz[slot], false);
    },
    setVelocity(slot, lx, ly, lz, ax, ay, az) {
      if (slot < 0 || slot >= capacity || !active[slot]) return;
      wake(slot);
      vx[slot] = lx; vy[slot] = ly; vz[slot] = lz;
      wx[slot] = ax; wy[slot] = ay; wz[slot] = az;
    },
    wake,
    wakeInBox(minX, minY, minZ, maxX, maxY, maxZ) {
      for (let i = 0; i < capacity; i++) {
        if (!active[i] || !asleep[i]) continue;
        const r = shapes[i]!.radius;
        if (px[i] + r < minX || px[i] - r > maxX || py[i] + r < minY || py[i] - r > maxY || pz[i] + r < minZ || pz[i] - r > maxZ) continue;
        wake(i);
      }
    },
    step,
    framePose(slot, out) { framePoseFrom(slot, px[slot], py[slot], pz[slot], qx[slot], qy[slot], qz[slot], qw[slot], out); },
    framePoseAt(slot, t, out) {
      const u = t < 0 ? 0 : t > 1 ? 1 : t;
      const x = ppx[slot] + (px[slot] - ppx[slot]) * u;
      const y = ppy[slot] + (py[slot] - ppy[slot]) * u;
      const z = ppz[slot] + (pz[slot] - ppz[slot]) * u;
      // nlerp on the short arc
      let a = qx[slot], b = qy[slot], c = qz[slot], d = qw[slot];
      if (pqx[slot] * a + pqy[slot] * b + pqz[slot] * c + pqw[slot] * d < 0) { a = -a; b = -b; c = -c; d = -d; }
      a = pqx[slot] + (a - pqx[slot]) * u; b = pqy[slot] + (b - pqy[slot]) * u;
      c = pqz[slot] + (c - pqz[slot]) * u; d = pqw[slot] + (d - pqw[slot]) * u;
      const n = 1 / Math.sqrt(a * a + b * b + c * c + d * d);
      framePoseFrom(slot, x, y, z, a * n, b * n, c * n, d * n, out);
    },
  };
  return world;
}
