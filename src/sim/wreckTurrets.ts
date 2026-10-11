/**
 * wreckTurrets.ts — a destroyed tank's turret as a rigid body the simulation owns (physics lane, 2026-10-10; the owner:
 * "it blows up nicely but then the turret snaps into a pre-ordained resting position ... just let physics work").
 *
 * Until now the turret pop was a presentation clip: a closed-form arc in the hull's frame, then a fixed table pose
 * (settleTurret) written in one frame — a ~175° yaw snap at landing, a turret riding its skidding hull through the
 * air, and a wreck whose armour kept the turret seated (shells stopped on an invisible turret while the visible one
 * had no collision). Here the kill launches the turret as a body (rigidBody.ts): an ammunition cook-off throws it,
 * any other death unseats it; it flies, tumbles, lands on the ground, the buildings, the hulls and other turrets, rolls
 * and slides, and sleeps where the physics put it. The authority steps it at SIM_DT; its pose travels to the peers
 * (the WRECK_BODY row group) and to the presentation (the visual's turret follows it); a shell meets the turret's own
 * plates at that pose (armor.ts TankArmorPose.turretWorld).
 *
 * Determinism: the launch draws from its own stream, seeded by the match seed, the hull's id and the kill tick (the
 * match's streams are untouched); the step is rigidBody's. Two runs of one authority agree to the bit.
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import {
  createObstacleGrid, shellPassesThroughCollisionRecord, type CollisionRecord, type ObstacleQuery,
} from '../world/collision.ts';
import { createRigidShape, createRigidWorld, type RigidEnvironment, type RigidShape, type RigidWorld } from './rigidBody.ts';

/** The turret frame's gun droop on a wreck (rad, the barrel's line below the turret's horizontal): a dead gun's tube
 * sags on its trunnions, shallow enough that the barrel clears its own deck. */
export const WRECK_GUN_DROOP_RAD = 0.06;
/** Turret bodies a match keeps at once (the oldest settled one gives way). */
const DEFAULT_CAPACITY = 24;
/** Steps a cook-off's turret ignores its own hull (it leaves the ring before the hull's box can catch it). */
const POP_IGNORE_HULL_STEPS = 8;

type Vec3 = readonly [number, number, number];

interface PlateLike { readonly verts: readonly Vec3[] }
interface CellLike { readonly min: Vec3; readonly max: Vec3 }

/** The slice of a vehicle spec the turret body reads. */
export interface WreckTurretSpec {
  readonly id?: string;
  readonly weightTons?: number;
  readonly armor?: {
    readonly turretless?: boolean;
    readonly turretPivot?: readonly number[];
    readonly gunPivot?: readonly number[];
    readonly hullPlates?: readonly PlateLike[];
    readonly turretPlates?: readonly PlateLike[];
    readonly collisionShells?: { readonly hull?: readonly CellLike[]; readonly turret?: readonly CellLike[] };
    readonly gunBarrel?: { readonly lengthM: number; readonly radiusM: number; readonly collision?: boolean };
  } | null;
  readonly dims?: { readonly widthM?: number; readonly hullLengthM?: number; readonly heightM?: number };
}

/** The slice of a tank entity the turrets read every step (both simulations' entities fit it). */
export interface WreckTurretTank {
  readonly id: string;
  readonly spec: WreckTurretSpec;
  readonly state: {
    readonly pos: { readonly x: number; readonly y: number; readonly z: number };
    readonly yaw: number;
    readonly visualPitch: number;
    readonly visualRoll: number;
    readonly turretYaw: number;
    readonly speed: number;
    readonly verticalSpeed?: number;
    readonly yawRate?: number;
    readonly modeScale?: number;
  } | null;
  readonly combat: { readonly destroyed?: boolean } | null;
  readonly modeActive?: boolean;
  readonly aerial?: { readonly active?: boolean } | null;
}

/** A vehicle's turret body and boxes, derived once per spec and scale. */
export interface WreckTurretProfile {
  /** The body (null: a turretless vehicle); its authoring frame is the turret frame (origin on the ring). */
  readonly shape: RigidShape | null;
  /** The turret's mount in the hull frame (unscaled). */
  readonly pivot: Vec3;
  /** The hull's box in the hull frame, its top on the ring plane. */
  readonly hullCenter: Vec3;
  readonly hullHalf: Vec3;
  /** The turret's box in the turret frame (a live tank's kinematic turret). */
  readonly turretCenter: Vec3;
  readonly turretHalf: Vec3;
  readonly scale: number;
}

const profiles = new Map<WreckTurretSpec, Map<number, WreckTurretProfile>>();

function boundsOf(plates: readonly PlateLike[] | undefined, cells: readonly CellLike[] | undefined): [number[], number[]] | null {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let any = false;
  for (const plate of plates ?? []) {
    for (const v of plate.verts) {
      for (let k = 0; k < 3; k++) { if (v[k] < min[k]) min[k] = v[k]; if (v[k] > max[k]) max[k] = v[k]; }
      any = true;
    }
  }
  for (const cell of cells ?? []) {
    for (let k = 0; k < 3; k++) { if (cell.min[k] < min[k]) min[k] = cell.min[k]; if (cell.max[k] > max[k]) max[k] = cell.max[k]; }
    any = true;
  }
  return any && min.every(Number.isFinite) && max.every(Number.isFinite) ? [min, max] : null;
}

/**
 * Directions for the turret armour's extreme points: an icosahedron's 12 vertices and its 30 edge midpoints (42 unit
 * vectors, the six axis directions among them).
 */
const ENVELOPE_DIRECTIONS: readonly Vec3[] = (() => {
  const phi = (1 + Math.sqrt(5)) / 2;
  const vertices: [number, number, number][] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) vertices.push([0, a, b * phi], [a, b * phi, 0], [b * phi, 0, a]);
  const unit = (x: number, y: number, z: number): Vec3 => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
  const out: Vec3[] = vertices.map((v) => unit(v[0], v[1], v[2]));
  for (let i = 0; i < vertices.length; i++) for (let j = i + 1; j < vertices.length; j++) {
    const a = vertices[i], b = vertices[j];
    if (Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) - 2) < 1e-9) out.push(unit(a[0] + b[0], a[1] + b[1], a[2] + b[2]));
  }
  return out;
})();
/** The contact spheres' radius on the turret's outline (m, before the vehicle's scale). */
const ENVELOPE_RADIUS_M = 0.04;

/**
 * The turret's contact points: where its armour really reaches (plates and collision cells, floored on the ring
 * plane), not its box. The extreme point along each direction, inset by the sphere radius along it, and a grid inside
 * the ring-plane footprint (it sits flat on its base over rubble). A real turret's cheeks slope, its bustle is smaller
 * than its box's end, a sight stands on its roof: on the box it rested on faces it does not have (on its side "like a
 * coin", upright on its bustle with the gun skyward); on its outline it rests where a turret can.
 */
function envelopePoints(plates: readonly PlateLike[] | undefined, cells: readonly CellLike[] | undefined, s: number): Vec3[] {
  const cloud: [number, number, number][] = [];
  for (const plate of plates ?? []) for (const v of plate.verts) cloud.push([v[0] * s, Math.max(0.02, v[1]) * s, v[2] * s]);
  for (const cell of cells ?? []) {
    for (let k = 0; k < 8; k++) {
      cloud.push([
        (k & 1 ? cell.max[0] : cell.min[0]) * s,
        Math.max(0.02, k & 2 ? cell.max[1] : cell.min[1]) * s,
        (k & 4 ? cell.max[2] : cell.min[2]) * s,
      ]);
    }
  }
  if (cloud.length < 4) return [];
  const e = ENVELOPE_RADIUS_M * s;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of cloud) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  // a sphere stays inside the outline: inset along the direction that found its point, and off every face of the
  // bounds it lies on (a point on the base's rim found sideways must not hang below the base)
  const inset = (v: number, k: number): number => (hi[k] - lo[k] > 2 * e ? Math.min(hi[k] - e, Math.max(lo[k] + e, v)) : (lo[k] + hi[k]) / 2);
  const points: Vec3[] = [];
  const taken = new Set<number>();
  for (const d of ENVELOPE_DIRECTIONS) {
    let best = -Infinity, at = -1;
    for (let i = 0; i < cloud.length; i++) {
      const q = cloud[i][0] * d[0] + cloud[i][1] * d[1] + cloud[i][2] * d[2];
      if (q > best + 1e-9) { best = q; at = i; }
    }
    if (at < 0 || taken.has(at)) continue;
    taken.add(at);
    const c = cloud[at];
    points.push([inset(c[0] - d[0] * e, 0), inset(c[1] - d[1] * e, 1), inset(c[2] - d[2] * e, 2)]);
  }
  // the ends are no footings: a bustle's top slopes or rounds into the roof and its stowage racks crush, a turret's
  // face is its mantlet and wedges. The upper points of either end stand back from it, so a turret come down on an end
  // stands on that end's lower edge alone, out of balance toward its roof, and goes over instead of balancing gun-up
  const mid = (lo[1] + hi[1]) / 2, back = Math.max(0.2 * s, 0.07 * (hi[2] - lo[2]));
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p[1] <= mid) continue;
    if (p[2] <= lo[2] + e + 0.1 * s) points[i] = [p[0], p[1], Math.max(p[2], lo[2] + e + back)];
    else if (p[2] >= hi[2] - e - 0.1 * s) points[i] = [p[0], p[1], Math.min(p[2], hi[2] - e - back)];
  }
  // the footprint on the ring plane: a grid inside the hull of the floored points
  const floor = 0.02 * s + 1e-6;
  const base = cloud.filter((p) => p[1] <= floor).map((p) => [p[0], p[2]] as [number, number]);
  const hull = convexHull2d(base);
  if (hull.length >= 3) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of hull) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const spacing = Math.max(0.9 * s, Math.max(x1 - x0, z1 - z0) / 4);
    const nx = Math.max(1, Math.round((x1 - x0) / spacing)), nz = Math.max(1, Math.round((z1 - z0) / spacing));
    for (let i = 1; i < nx; i++) {
      for (let j = 1; j < nz; j++) {
        const x = x0 + ((x1 - x0) * i) / nx, z = z0 + ((z1 - z0) * j) / nz;
        if (insideConvex2d(hull, x, z, e)) points.push([x, 0.02 * s + e, z]);
      }
    }
  }
  return points;
}

/** A convex hull (counter-clockwise, monotone chain) of 2D points. */
function convexHull2d(input: readonly [number, number][]): [number, number][] {
  const pts = input.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-12) lower.pop();
    lower.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-12) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Whether (x, z) lies inside a counter-clockwise convex polygon by at least `margin`. */
function insideConvex2d(hull: readonly [number, number][], x: number, z: number, margin: number): boolean {
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ex = b[0] - a[0], ez = b[1] - a[1];
    const len = Math.hypot(ex, ez);
    if (len < 1e-9) continue;
    // left of each edge (inside) by the margin
    if ((ex * (z - a[1]) - ez * (x - a[0])) / len < margin) return false;
  }
  return true;
}

/**
 * A vehicle's boxes and turret body: the hull's box from its hull armour (its top on the ring plane), the turret's box
 * from its turret armour (plates and collision cells, floored on the ring plane) and the body — that box and the gun
 * barrel (a capsule, drooped), the mass a share of the vehicle's by the boxes' volumes. A turretless vehicle has a
 * hull box and no body. Cached per spec and scale (a Juggernaut's hull is scaled).
 */
export function wreckTurretProfile(spec: WreckTurretSpec, scale = 1): WreckTurretProfile {
  const key = Math.round((Number.isFinite(scale) && scale > 0 ? scale : 1) * 100) / 100;
  let bySpec = profiles.get(spec);
  if (!bySpec) { bySpec = new Map(); profiles.set(spec, bySpec); }
  if (bySpec.has(key)) return bySpec.get(key)!;
  const profile = buildProfile(spec, key);
  bySpec.set(key, profile);
  return profile;
}

function buildProfile(spec: WreckTurretSpec, s: number): WreckTurretProfile {
  const armor = spec.armor;
  const pivot: Vec3 = [armor?.turretPivot?.[0] ?? 0, armor?.turretPivot?.[1] ?? (spec.dims?.heightM ?? 2.2) * 0.7, armor?.turretPivot?.[2] ?? 0];
  const hull = boundsOf(armor?.hullPlates, armor?.collisionShells?.hull);
  const hMin = hull ? hull[0] : [-(spec.dims?.widthM ?? 3.4) / 2, 0.4, -(spec.dims?.hullLengthM ?? 6.5) / 2];
  const hMax = hull ? hull[1] : [(spec.dims?.widthM ?? 3.4) / 2, pivot[1], (spec.dims?.hullLengthM ?? 6.5) / 2];
  const turret = armor && !armor.turretless ? boundsOf(armor.turretPlates, armor.collisionShells?.turret) : null;
  // the hull box's top on the ring plane: a turret starts on it, never in it
  if (turret) hMax[1] = Math.min(hMax[1], pivot[1]);
  if (hMax[1] - hMin[1] < 0.4) hMin[1] = hMax[1] - 0.4;
  const hullHalf: Vec3 = [Math.max(0.5, (hMax[0] - hMin[0]) / 2), Math.max(0.2, (hMax[1] - hMin[1]) / 2), Math.max(0.8, (hMax[2] - hMin[2]) / 2)];
  const hullCenter: Vec3 = [(hMin[0] + hMax[0]) / 2, (hMin[1] + hMax[1]) / 2, (hMin[2] + hMax[2]) / 2];
  if (!turret) {
    return { shape: null, pivot, hullCenter, hullHalf, turretCenter: [0, 0, 0], turretHalf: [0, 0, 0], scale: s };
  }
  const [tMin, tMax] = turret;
  // the turret box sits on the ring plane (its basket below the roof is inside the hull; the box must not start in
  // the hull's own box)
  tMin[1] = Math.max(tMin[1], 0.02);
  if (tMax[1] - tMin[1] < 0.3) tMax[1] = tMin[1] + 0.3;
  const half: [number, number, number] = [
    Math.max(0.25, (tMax[0] - tMin[0]) / 2) * s, Math.max(0.15, (tMax[1] - tMin[1]) / 2) * s, Math.max(0.3, (tMax[2] - tMin[2]) / 2) * s,
  ];
  const center: [number, number, number] = [(tMin[0] + tMax[0]) / 2 * s, (tMin[1] + tMax[1]) / 2 * s, (tMin[2] + tMax[2]) / 2 * s];
  // mass: an MBT's turret and gun are about a quarter of it (M1A1 15 t of 57, T-72 11.5 of 41.5, Leopard 2 16 of 55),
  // a little more for a big turret on a small hull
  const tons = Number.isFinite(spec.weightTons) && spec.weightTons! > 0 ? spec.weightTons! : 40;
  const turretVolume = 8 * half[0] * half[1] * half[2];
  const hullVolume = 8 * hullHalf[0] * hullHalf[1] * hullHalf[2] * s * s * s;
  const share = Math.max(0.18, Math.min(0.34, 0.18 + 0.25 * turretVolume / Math.max(1, turretVolume + hullVolume)));
  const mass = Math.max(400, tons * 1000 * share * s * s * s);
  // the turret meets the world where its armour reaches (its box keeps the mass, the inertia and the solid)
  const outline = envelopePoints(armor!.turretPlates, armor!.collisionShells?.turret, s);
  const parts: Parameters<typeof createRigidShape>[0][number][] = [
    outline.length >= 8
      ? { kind: 'box', center, half, mass: mass * 0.86, points: outline, edgeRadius: ENVELOPE_RADIUS_M * s }
      : { kind: 'box', center, half, mass: mass * 0.86 },
  ];
  const barrel = armor!.gunBarrel;
  if (barrel && barrel.collision !== false && barrel.lengthM > 0.4) {
    const gp: Vec3 = [(armor!.gunPivot?.[0] ?? 0) * s, (armor!.gunPivot?.[1] ?? 0) * s, (armor!.gunPivot?.[2] ?? 0) * s];
    // the barrel frame: turret · T(gunPivot) · Rx(droop) — +Z dipping by the droop
    const c = Math.cos(WRECK_GUN_DROOP_RAD), sn = Math.sin(WRECK_GUN_DROOP_RAD);
    const from = Math.min(barrel.lengthM * s * 0.5, Math.max(0.3 * s, half[2] + center[2] - gp[2] - 0.15 * s));
    const to = barrel.lengthM * s;
    parts.push({
      kind: 'capsule',
      a: [gp[0], gp[1] - sn * from, gp[2] + c * from],
      b: [gp[0], gp[1] - sn * to, gp[2] + c * to],
      radius: Math.max(0.06, barrel.radiusM) * s,
      mass: mass * 0.14,
      spacing: 0.45 * s,
    });
  }
  const shape = createRigidShape(parts, { restitution: 0.32, friction: 0.62, rolling: 0.3, linearDrag: 0.015, angularDrag: 0.06, maxSpheres: 72 });
  return {
    shape, pivot, hullCenter, hullHalf,
    turretCenter: [center[0] / s, center[1] / s, center[2] / s], turretHalf: [half[0] / s, half[1] / s, half[2] / s],
    scale: s,
  };
}

/** A 32-bit stream (mulberry32), the turret launch's own. */
function launchRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashLaunch(seed: number, id: string, tick: number): number {
  let h = (0x811c9dc5 ^ (seed >>> 0)) >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  h = Math.imul(h ^ (tick >>> 0), 0x01000193) >>> 0;
  return Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
}

/** The way a hull died, as the launch reads it. */
export type WreckTurretCause = 'ammorack' | 'ammo_rack' | 'shot' | 'fire' | 'ram' | string;

/** The cook-off's work on the turret per kilogram of its charge (J/kg): a 66.8 t M1A2's 10 kg throws its 16.6 t
 * turret at about 14 m/s, some 10 m over the ring (6–14 m by the draw). */
const COOK_OFF_J_PER_KG = 160_000;
const COOK_OFF_MIN_MPS = 8;
const COOK_OFF_MAX_MPS = 19;

/**
 * The launch of a turret (world frame velocities, m/s and rad/s): a cook-off throws it high over its fireball and well
 * off its hull, tumbling end over end; any other death unseats it (a jolt that lifts it off the ring and drops it
 * askew on the deck). The cook-off's speed is its work on the turret's mass: the charge (munitionBlast.ts
 * cookOffChargeKg: 0.15 kg a tonne, 3–12 kg) against the turret body's own mass (a quarter of the vehicle's when the
 * caller has none), so a light tank's turret flies higher than a heavy's on the same rack.
 */
export function turretLaunchVelocity(
  cause: WreckTurretCause, weightTons: number, random: () => number, out: Float64Array, turretKg = 0,
): void {
  const rack = cause === 'ammorack' || cause === 'ammo_rack';
  const burn = cause === 'fire';
  const tons = Number.isFinite(weightTons) && weightTons > 0 ? weightTons : 40;
  const charge = Math.max(3, Math.min(12, 0.15 * tons));
  const mass = Number.isFinite(turretKg) && turretKg > 0 ? turretKg : 250 * tons;
  // a horizontal direction from the stream (rejection keeps it uniform without trigonometry)
  let dx = 0, dz = 0, d2 = 0;
  for (let n = 0; n < 16 && !(d2 > 0.04 && d2 <= 1); n++) { dx = random() * 2 - 1; dz = random() * 2 - 1; d2 = dx * dx + dz * dz; }
  if (!(d2 > 0.04 && d2 <= 1)) { dx = 1; dz = 0; d2 = 1; }
  const dl = 1 / Math.sqrt(d2);
  dx *= dl; dz *= dl;
  // a tumble axis, mostly horizontal
  let ax = random() * 2 - 1, ay = (random() * 2 - 1) * 0.35, az = random() * 2 - 1;
  const al = 1 / (Math.sqrt(ax * ax + ay * ay + az * az) || 1);
  ax *= al; ay *= al; az *= al;
  let up: number, side: number, tumble: number, spin: number;
  if (rack) {
    // v = sqrt(2 E / m), the work 0.6–1.4 of the mean: 6–14 m over the ring for an MBT, 2.5–3.8 s in the air, landing
    // 5–15 m off its hull with one or two turns in it
    const work = COOK_OFF_J_PER_KG * charge * (0.6 + 0.8 * random());
    up = Math.max(COOK_OFF_MIN_MPS, Math.min(COOK_OFF_MAX_MPS, Math.sqrt((2 * work) / mass)));
    side = 1.8 + 2.6 * random();
    tumble = 1.4 + 2.2 * random();
    spin = (random() * 2 - 1) * 3.0;
  } else if (burn) {
    up = 0.9 + 0.5 * random();
    side = 0.1 + 0.25 * random();
    tumble = 0.15 + 0.3 * random();
    spin = (random() * 2 - 1) * 0.4;
  } else {
    // the ring breaks: the turret jumps a hand's breadth or two and comes down slewed on its deck (never a zero slew:
    // every kill reads)
    up = 1.6 + 1.0 * random();
    side = 0.25 + 0.55 * random();
    tumble = 0.3 + 0.6 * random();
    spin = (random() < 0.5 ? -1 : 1) * (0.7 + 1.0 * random());
  }
  out[0] = dx * side; out[1] = up; out[2] = dz * side;
  out[3] = ax * tumble; out[4] = ay * tumble + spin; out[5] = az * tumble;
}

/** The hull frame's rotation (three's Euler 'YXZ' of (−pitch, yaw, roll), as armor.ts and the visual compose it). */
export function hullQuaternion(yaw: number, pitch: number, roll: number, out: Float64Array, offset = 0): void {
  const x = -pitch * 0.5, y = yaw * 0.5, z = roll * 0.5;
  const c1 = Math.cos(x), s1 = Math.sin(x), c2 = Math.cos(y), s2 = Math.sin(y), c3 = Math.cos(z), s3 = Math.sin(z);
  out[offset] = s1 * c2 * c3 + c1 * s2 * s3;
  out[offset + 1] = c1 * s2 * c3 - s1 * c2 * s3;
  out[offset + 2] = c1 * c2 * s3 - s1 * s2 * c3;
  out[offset + 3] = c1 * c2 * c3 + s1 * s2 * s3;
}

/** q · Ry(angle) into out. */
function yawAfter(q: Float64Array, qo: number, angle: number, out: Float64Array, oo: number): void {
  const s = Math.sin(angle * 0.5), c = Math.cos(angle * 0.5);
  const x = q[qo], y = q[qo + 1], z = q[qo + 2], w = q[qo + 3];
  // (x, y, z, w) ⊗ (0, s, 0, c)
  out[oo] = x * c - z * s;
  out[oo + 1] = y * c + w * s;
  out[oo + 2] = z * c + x * s;
  out[oo + 3] = w * c - y * s;
}

/** Rotate (x, y, z) by q (at qo) into out. */
function rotate(q: Float64Array, qo: number, x: number, y: number, z: number, out: Float64Array): void {
  const qx = q[qo], qy = q[qo + 1], qz = q[qo + 2], qw = q[qo + 3];
  const cx = qy * z - qz * y + qw * x, cy = qz * x - qx * z + qw * y, cz = qx * y - qy * x + qw * z;
  out[0] = x + 2 * (qy * cz - qz * cy);
  out[1] = y + 2 * (qz * cx - qx * cz);
  out[2] = z + 2 * (qx * cy - qy * cx);
}

/**
 * The static world a turret meets, from a world's records: the structures' shell bands (their exact heights, the
 * roofs' strips) and every other record a shell stops on (stones, walls, sandbags, hulks, set pieces). Light cover
 * (fences, trees, bushes, wire) does not stop a 15-tonne turret's flight. Crushed or dead records drop out as they
 * break. Build time: one grid over the chosen records.
 */
export function createWreckEnvironment(
  ground: (x: number, z: number) => number,
  obstacles: readonly CollisionRecord[],
  colliders: readonly CollisionRecord[],
): RigidEnvironment {
  const solids: CollisionRecord[] = [];
  for (const record of colliders) if (record.structureIdx !== undefined) solids.push(record);
  for (const record of obstacles) {
    if (record.structureIdx !== undefined) continue;
    if (shellPassesThroughCollisionRecord(record)) continue;
    solids.push(record);
  }
  const query: ObstacleQuery = createObstacleGrid(solids, 16);
  return {
    groundAt: ground,
    queryStatic: query,
    isSolid: (record) => !record.crushed && !record.dead,
  };
}

/** The ground sampler a height field offers the bodies: the drawn contact surface first (craters and mounds in it). */
export function wreckGroundSampler(field: {
  getHeightAt(x: number, z: number): number;
  getHeightAtFast?(x: number, z: number): number;
  getContactHeightAt?(x: number, z: number): number;
}): (x: number, z: number) => number {
  if (field.getContactHeightAt) return field.getContactHeightAt.bind(field);
  if (field.getHeightAtFast) return field.getHeightAtFast.bind(field);
  return field.getHeightAt.bind(field);
}

export interface WreckTurretBodyState {
  /** The turret frame's world pose (origin on the ring) and whether it lies settled. */
  x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number;
  asleep: boolean;
}

export interface WreckTurrets {
  readonly world: RigidWorld;
  /** What the turrets meet (null: they hold still). */
  bind(environment: RigidEnvironment | null): void;
  gravity: number;
  /** Launch a dead hull's turret at its seat. False when the vehicle has no turret or it already flew. */
  launch(tank: WreckTurretTank, cause: WreckTurretCause, tick: number): boolean;
  /** One fixed step: the hulls as kinematic boxes, then the bodies. Removes the turret of a hull that lives again. */
  step(tanks: readonly (WreckTurretTank | null | undefined)[]): void;
  has(id: string): boolean;
  /** The turret frame's world pose now (false: no body). `out` = [x, y, z, qx, qy, qz, qw]. */
  framePose(id: string, out: Float64Array | number[]): boolean;
  /** The same between the last two steps (presentation, alpha in 0..1). */
  framePoseAt(id: string, alpha: number, out: Float64Array | number[]): boolean;
  /** The turret frame as a world matrix with the hull's scale (armor.ts traces the turret's plates at it). */
  frameMatrix(id: string, out: Matrix4): boolean;
  settled(id: string): boolean;
  /** Put a body back as a log or a migration knew it (settled, or awake to fall from there). */
  restore(tank: WreckTurretTank, pose: WreckTurretBodyState): boolean;
  release(id: string): void;
  reset(): void;
  /** Every body's pose, rounded to the millimetre (the determinism audit hashes it). */
  digest(): string;
  /** Ids with a body, in launch order. */
  ids(): readonly string[];
}

export interface WreckTurretOptions {
  seed?: number;
  gravity?: number;
  capacity?: number;
}

export function createWreckTurrets(options: WreckTurretOptions = {}): WreckTurrets {
  const capacity = Math.max(1, options.capacity ?? DEFAULT_CAPACITY);
  const world = createRigidWorld({
    capacity, kinematicCapacity: 2 * 64 + 8, gravity: options.gravity ?? 9.81,
    velocityIterations: 10, positionIterations: 4, contactsPerBody: 40,
  });
  const seed = (options.seed ?? 0) >>> 0;
  /** id → body slot, in launch order */
  const slots = new Map<string, number>();
  /** id → its kinematic owner number (first seen, deterministic) */
  const owners = new Map<string, number>();
  /** id → the scale its body flew with (a Juggernaut's turret is scaled with its hull) */
  const bodyScale = new Map<string, number>();
  let nextOwner = 1;
  const ownerOf = (id: string): number => {
    let owner = owners.get(id);
    if (owner === undefined) { owner = nextOwner++; owners.set(id, owner); }
    return owner;
  };
  const q = new Float64Array(8);
  const v = new Float64Array(6);
  const r = new Float64Array(3);
  const pose = new Float64Array(7);
  const _p = new Vector3(), _q = new Quaternion(), _s = new Vector3();
  const released: string[] = [];

  function evictOldestSettled(): boolean {
    for (const [id, slot] of slots) {
      if (world.asleep[slot]) { world.remove(slot); slots.delete(id); return true; }
    }
    return false;
  }

  function turretSeat(tank: WreckTurretTank, profile: WreckTurretProfile, outPos: Float64Array, outQ: Float64Array): void {
    const state = tank.state!;
    const s = profile.scale;
    hullQuaternion(state.yaw, state.visualPitch, state.visualRoll, q, 0);
    rotate(q, 0, profile.pivot[0] * s, profile.pivot[1] * s, profile.pivot[2] * s, r);
    outPos[0] = state.pos.x + r[0]; outPos[1] = state.pos.y + r[1]; outPos[2] = state.pos.z + r[2];
    yawAfter(q, 0, state.turretYaw, outQ, 0);
  }

  const seatPos = new Float64Array(3);
  const seatQ = new Float64Array(4);

  const turrets: WreckTurrets = {
    world,
    bind(environment) { world.bindEnvironment(environment); },
    get gravity() { return world.gravity; },
    set gravity(value: number) { world.gravity = value; },
    launch(tank, cause, tick) {
      if (!tank.state || slots.has(tank.id)) return false;
      const profile = wreckTurretProfile(tank.spec, tank.state.modeScale ?? 1);
      if (!profile.shape) return false;
      turretSeat(tank, profile, seatPos, seatQ);
      const random = launchRandom(hashLaunch(seed, tank.id, tick));
      turretLaunchVelocity(cause, (tank.spec.weightTons ?? 40) * profile.scale ** 3, random, v, profile.shape.mass);
      const state = tank.state;
      // the hull's own motion carries into the throw
      const hvx = Math.sin(state.yaw) * state.speed, hvz = Math.cos(state.yaw) * state.speed;
      const hvy = Number.isFinite(state.verticalSpeed) ? state.verticalSpeed! : 0;
      let slot = world.spawn(profile.shape!, {
        x: seatPos[0], y: seatPos[1], z: seatPos[2], qx: seatQ[0], qy: seatQ[1], qz: seatQ[2], qw: seatQ[3],
        vx: v[0] + hvx, vy: v[1] + Math.max(0, hvy), vz: v[2] + hvz, wx: v[3], wy: v[4] + (state.yawRate ?? 0), wz: v[5],
        owner: ownerOf(tank.id),
        ignoreOwnerSteps: cause === 'ammorack' || cause === 'ammo_rack' ? POP_IGNORE_HULL_STEPS : 0,
      });
      if (slot < 0 && evictOldestSettled()) {
        slot = world.spawn(profile.shape!, {
          x: seatPos[0], y: seatPos[1], z: seatPos[2], qx: seatQ[0], qy: seatQ[1], qz: seatQ[2], qw: seatQ[3],
          vx: v[0] + hvx, vy: v[1] + Math.max(0, hvy), vz: v[2] + hvz, wx: v[3], wy: v[4], wz: v[5],
          owner: ownerOf(tank.id), ignoreOwnerSteps: 0,
        });
      }
      if (slot < 0) return false;
      slots.set(tank.id, slot);
      bodyScale.set(tank.id, profile.scale);
      return true;
    },
    step(tanks) {
      if (slots.size === 0) return;
      // a hull that lives again (a respawn) takes its turret back
      released.length = 0;
      let k = 0;
      for (const tank of tanks) {
        if (!tank || !tank.state || tank.modeActive === false || tank.aerial?.active) continue;
        const flown = slots.has(tank.id);
        if (flown && tank.combat && !tank.combat.destroyed) { released.push(tank.id); continue; }
        const profile = wreckTurretProfile(tank.spec, tank.state.modeScale ?? 1);
        const state = tank.state;
        const s = profile.scale;
        hullQuaternion(state.yaw, state.visualPitch, state.visualRoll, q, 0);
        const vx0 = Math.sin(state.yaw) * state.speed, vz0 = Math.cos(state.yaw) * state.speed;
        const vy0 = Number.isFinite(state.verticalSpeed) ? state.verticalSpeed! : 0;
        const yawRate = Number.isFinite(state.yawRate) ? state.yawRate! : 0;
        const owner = ownerOf(tank.id);
        // the hull's box (its top on the ring plane)
        const hc = profile.hullCenter, hh = profile.hullHalf;
        rotate(q, 0, hc[0] * s, hc[1] * s, hc[2] * s, r);
        if (k < 128) world.setKinematic(k++, owner, state.pos.x + r[0], state.pos.y + r[1], state.pos.z + r[2], q[0], q[1], q[2], q[3],
          hh[0] * s, hh[1] * s, hh[2] * s, vx0, vy0, vz0, 0, yawRate, 0);
        // a turret still on its ring is a box of its own
        if (profile.shape && !flown && k < 128) {
          rotate(q, 0, profile.pivot[0] * s, profile.pivot[1] * s, profile.pivot[2] * s, r);
          const ox = state.pos.x + r[0], oy = state.pos.y + r[1], oz = state.pos.z + r[2];
          yawAfter(q, 0, state.turretYaw, q, 4);
          rotate(q, 4, profile.turretCenter[0] * s, profile.turretCenter[1] * s, profile.turretCenter[2] * s, r);
          world.setKinematic(k++, owner, ox + r[0], oy + r[1], oz + r[2], q[4], q[5], q[6], q[7],
            profile.turretHalf[0] * s, profile.turretHalf[1] * s, profile.turretHalf[2] * s, vx0, vy0, vz0, 0, yawRate, 0);
        }
      }
      world.setKinematicCount(k);
      for (const id of released) turrets.release(id);
      world.step();
    },
    has: (id) => slots.has(id),
    framePose(id, out) {
      const slot = slots.get(id);
      if (slot === undefined) return false;
      world.framePose(slot, out);
      return true;
    },
    framePoseAt(id, alpha, out) {
      const slot = slots.get(id);
      if (slot === undefined) return false;
      world.framePoseAt(slot, alpha, out);
      return true;
    },
    frameMatrix(id, out) {
      const slot = slots.get(id);
      if (slot === undefined) return false;
      world.framePose(slot, pose);
      const scale = bodyScale.get(id) ?? 1;
      _p.set(pose[0], pose[1], pose[2]);
      _q.set(pose[3], pose[4], pose[5], pose[6]);
      _s.set(scale, scale, scale);
      out.compose(_p, _q, _s);
      return true;
    },
    settled(id) {
      const slot = slots.get(id);
      return slot !== undefined && world.asleep[slot] === 1;
    },
    restore(tank, state) {
      if (!tank.state) return false;
      const profile = wreckTurretProfile(tank.spec, tank.state.modeScale ?? 1);
      if (!profile.shape) return false;
      turrets.release(tank.id);
      const slot = world.spawn(profile.shape, {
        x: state.x, y: state.y, z: state.z, qx: state.qx, qy: state.qy, qz: state.qz, qw: state.qw,
        owner: ownerOf(tank.id), asleep: state.asleep,
      });
      if (slot < 0) return false;
      slots.set(tank.id, slot);
      bodyScale.set(tank.id, profile.scale);
      return true;
    },
    release(id) {
      const slot = slots.get(id);
      if (slot === undefined) return;
      world.remove(slot);
      slots.delete(id);
      bodyScale.delete(id);
    },
    reset() {
      world.clear();
      slots.clear();
      bodyScale.clear();
    },
    digest() {
      let text = '';
      for (const [id, slot] of slots) {
        world.framePose(slot, pose);
        text += `${id}:${pose.map((value) => Math.round(value * 1000)).join(',')}:${world.asleep[slot]}\n`;
      }
      return text;
    },
    ids: () => [...slots.keys()],
  };
  return turrets;
}
