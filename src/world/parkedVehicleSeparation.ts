// src/world/parkedVehicleSeparation.ts — parked vehicles never stand inside each other (the map-vehicles lane,
// 2026-10-05).
//
// The roadside traffic (props.ts placeMilitaryClutter) seats every vehicle through findRoadsideSpot, which proposes a
// road station, a side and an offset and accepts any clear verge; nothing reserved a seat once a vehicle took it, so
// two picks on one station and side parked one vehicle inside another (17 pairs on 11 maps). This pass runs once every
// placement and relocation is done and before the pools' collider refit and indexing. It walks the vehicles in
// placement order and moves only the LATER vehicle of an overlapping pair, along its own heading: forward, back, then
// half again, twice and three times as far each way, by the pair's half-lengths and a gap, onto a seat that clears every other vehicle and that the
// caller judges clear (the roadside rules, the road core, every other obstacle). A vehicle with no clear seat is
// dropped. It draws nothing from any stream, so every other record, and every map without an overlap, stays
// byte-identical.
import type { CollisionRecord, SimpleCollisionShape } from './collision.ts';

/** A placed vehicle: its centre, heading (local +Z = sin/cos of yaw), and scale. */
export interface ParkedVehicle { kind: string; x: number; z: number; yaw: number; sc: number }

/** A vehicle's half-width and half-length at scale 1 (its role's box). */
export interface ParkedFootprint { hw: number; hl: number }

/** The gap every placed vehicle keeps from every other, metres between their footprints. */
export const PARKED_VEHICLE_CLEARANCE = 0.4;
/** The gap a moved vehicle leaves to the one it overlapped, nose to tail. */
const SLIDE_GAP = 1.2;
/** The seats tried, in multiples of the slide: forward, back, then a little and further on each way (a lamp, a crate
 * or a doorway on the verge can hold the first seats). */
const SLIDES = [1, -1, 1.5, -1.5, 2, -2, 3, -3] as const;

/** Whether two vehicles' footprints come within `clearance` of each other (a separating-axis test on their boxes). */
export function parkedFootprintsOverlap(a: ParkedVehicle, fa: ParkedFootprint, b: ParkedVehicle, fb: ParkedFootprint,
  clearance = PARKED_VEHICLE_CLEARANCE): boolean {
  const g = clearance / 2;
  const ahw = fa.hw * a.sc + g, ahl = fa.hl * a.sc + g, bhw = fb.hw * b.sc + g, bhl = fb.hl * b.sc + g;
  const dx = b.x - a.x, dz = b.z - a.z;
  // each box's axes: along (sin yaw, cos yaw), across (cos yaw, -sin yaw)
  const axes = [
    [Math.sin(a.yaw), Math.cos(a.yaw)], [Math.cos(a.yaw), -Math.sin(a.yaw)],
    [Math.sin(b.yaw), Math.cos(b.yaw)], [Math.cos(b.yaw), -Math.sin(b.yaw)],
  ];
  const project = (hw: number, hl: number, yaw: number, ax: number, az: number) =>
    hl * Math.abs(Math.sin(yaw) * ax + Math.cos(yaw) * az) + hw * Math.abs(Math.cos(yaw) * ax - Math.sin(yaw) * az);
  for (const [ax, az] of axes) {
    const distance = Math.abs(dx * ax + dz * az);
    if (distance >= project(ahw, ahl, a.yaw, ax, az) + project(bhw, bhl, b.yaw, ax, az)) return false;
  }
  return true;
}

export interface ParkedSeparationOptions<T extends ParkedVehicle> {
  /** The footprint of a vehicle kind (its role's box). */
  footprint(kind: string): ParkedFootprint;
  /** Whether a seat suits the vehicle on everything but the other vehicles (the roadside rules, the road core, the
   * obstacles that are not vehicles). */
  seatClear(vehicle: T, x: number, z: number): boolean;
  /** Move the vehicle to a seat (its record, matrix, obstacle and collider). */
  move(vehicle: T, x: number, z: number): void;
  /** Remove the vehicle (no seat cleared). */
  drop(vehicle: T): void;
}

export interface ParkedSeparationReceipt {
  vehicles: number;
  overlapping: number;
  moved: { kind: string; from: [number, number]; to: [number, number] }[];
  dropped: { kind: string; at: [number, number] }[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Separate the vehicles (in placement order): the later of every overlapping pair moves, or is dropped. */
export function separateParkedVehicles<T extends ParkedVehicle>(vehicles: readonly T[],
  o: ParkedSeparationOptions<T>): ParkedSeparationReceipt {
  const receipt: ParkedSeparationReceipt = { vehicles: vehicles.length, overlapping: 0, moved: [], dropped: [] };
  const standing = new Set<T>(vehicles);
  const fp = (v: T) => o.footprint(v.kind);
  for (let j = 0; j < vehicles.length; j++) {
    const v = vehicles[j];
    const earlier = vehicles.slice(0, j).filter((u) => standing.has(u) && parkedFootprintsOverlap(u, fp(u), v, fp(v)));
    if (!earlier.length) continue;
    receipt.overlapping++;
    const reach = Math.max(...earlier.map((u) => fp(u).hl * u.sc));
    const slide = reach + fp(v).hl * v.sc + SLIDE_GAP;
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    let seat: [number, number] | null = null;
    for (const k of SLIDES) {
      const x = v.x + fx * slide * k, z = v.z + fz * slide * k;
      const at = { ...v, x, z };
      // clear of every other standing vehicle, earlier or later: a move never makes a new overlap
      if (vehicles.some((u) => u !== v && standing.has(u) && parkedFootprintsOverlap(u, fp(u), at, fp(v)))) continue;
      if (!o.seatClear(v, x, z)) continue;
      seat = [x, z];
      break;
    }
    if (seat) {
      receipt.moved.push({ kind: v.kind, from: [round2(v.x), round2(v.z)], to: [round2(seat[0]), round2(seat[1])] });
      o.move(v, seat[0], seat[1]);
    } else {
      receipt.dropped.push({ kind: v.kind, at: [round2(v.x), round2(v.z)] });
      standing.delete(v);
      o.drop(v);
    }
  }
  return receipt;
}

// ---------------------------------------------------------------------------------------------------- the carts
// 2026-10-06 (the integrator's ruling): no cart stands inside anything. A cart whose body meets an obstacle, a tree, a
// vehicle or a cart seated before it slides the smallest way that clears it, within CART_SLIDE_MAX_M and on its own
// lot, or is dropped.

/** A convex footprint: its [x, z] corners in order (either winding). */
export type FootprintPolygon = readonly (readonly [number, number])[];

/**
 * The separation of two convex polygons along their edge normals: `gap` positive is the clearance between them,
 * negative how far they overlap; (`nx`, `nz`) is that axis, pointing from `b` towards `a` (the way `a` leaves `b`).
 */
export function polygonGap(a: FootprintPolygon, b: FootprintPolygon): { gap: number; nx: number; nz: number } {
  let gap = -Infinity, nx = 0, nz = 0;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      let ex = q[1] - p[1], ez = p[0] - q[0];
      const l = Math.hypot(ex, ez);
      if (l < 1e-9) continue;
      ex /= l; ez /= l;
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const [x, z] of a) { const d = x * ex + z * ez; if (d < aMin) aMin = d; if (d > aMax) aMax = d; }
      for (const [x, z] of b) { const d = x * ex + z * ez; if (d < bMin) bMin = d; if (d > bMax) bMax = d; }
      // a beyond b along +e, or a before b along -e
      if (aMin - bMax > gap) { gap = aMin - bMax; nx = ex; nz = ez; }
      if (bMin - aMax > gap) { gap = bMin - aMax; nx = -ex; nz = -ez; }
    }
  }
  return { gap, nx, nz };
}

/** A collision record's footprint as convex polygons: its OBB, a circle as a twelve-gon, its hull, each compound part. */
export function shapePolygons(record: CollisionRecord): FootprintPolygon[] {
  const simple = (shape: SimpleCollisionShape): FootprintPolygon => {
    if (shape.kind === 'obb') {
      const s = Math.sin(shape.yaw), c = Math.cos(shape.yaw);
      return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) =>
        [shape.cx + u * shape.hw * c + v * shape.hl * s, shape.cz - u * shape.hw * s + v * shape.hl * c] as const);
    }
    if (shape.kind === 'circle') {
      return Array.from({ length: 12 }, (_, k) => [shape.cx + shape.r * Math.cos((k * Math.PI) / 6),
        shape.cz + shape.r * Math.sin((k * Math.PI) / 6)] as const);
    }
    const out: [number, number][] = [];
    for (let k = 0; k + 1 < shape.points.length; k += 2) out.push([shape.points[k], shape.points[k + 1]]);
    return out;
  };
  const shape = record.shape2;
  if (!shape) {
    return [[[record.min[0], record.min[2]], [record.max[0], record.min[2]], [record.max[0], record.max[2]], [record.min[0], record.max[2]]]];
  }
  return shape.kind === 'compound' ? shape.parts.map(simple) : [simple(shape)];
}

/** How far a cart may slide off its seat before it is dropped instead. */
export const CART_SLIDE_MAX_M = 3;
/**
 * How far a parked vehicle may slide off its seat (2026-10-08, the map-vehicles lane's placement audit over the merge:
 * the cart ruling extended to the vehicles — a lamp post stood through a box truck at Ruinspires, a flatbed 3 m into
 * rubble, a truck 0.9 m into a sandbag emplacement at Verdant): a vehicle is longer than a cart, so it may go further.
 */
export const VEHICLE_SLIDE_MAX_M = 6;
const CART_SLIDE_STEP_M = 0.25;
const CART_SLIDE_HEADINGS = 16;

export interface CartSeatOptions<T extends ParkedVehicle> {
  /** Whether the cart standing at (x, z) meets anything: an obstacle, a tree, a vehicle or a cart already seated. */
  blocked(cart: T, x: number, z: number): boolean;
  /** The way out of its seat (away from what it meets), or null: the headings are tried nearest it first. */
  away(cart: T): readonly [number, number] | null;
  /** Whatever else a new seat needs: firm, gentle ground off the spawns and the road core, on the cart's own lot. */
  seatOk(cart: T, x: number, z: number): boolean;
  /** Move the cart to a seat (its record, matrix, obstacle and collider). */
  move(cart: T, x: number, z: number): void;
  /** Remove the cart (no seat within reach). */
  drop(cart: T): void;
  /** How far this one may slide (CART_SLIDE_MAX_M unless given: a vehicle's VEHICLE_SLIDE_MAX_M). */
  maxSlide?(cart: T): number;
}

export interface CartSeatReceipt {
  carts: number;
  blocked: number;
  slid: { kind: string; from: [number, number]; to: [number, number]; by: number }[];
  dropped: { kind: string; at: [number, number] }[];
}

/**
 * Seat the carts clear, in placement order: a cart that meets something slides the smallest way that clears it, in
 * rings of a quarter metre out to CART_SLIDE_MAX_M, sixteen headings a ring tried nearest its way out first; a cart
 * with no clear seat within reach is dropped. It draws nothing from any stream.
 */
export function seatCartsClear<T extends ParkedVehicle>(carts: readonly T[], o: CartSeatOptions<T>): CartSeatReceipt {
  const receipt: CartSeatReceipt = { carts: carts.length, blocked: 0, slid: [], dropped: [] };
  for (const cart of carts) {
    if (!o.blocked(cart, cart.x, cart.z)) continue;
    receipt.blocked++;
    const away = o.away(cart);
    const base = away && Math.hypot(away[0], away[1]) > 1e-6 ? Math.atan2(away[0], away[1]) : cart.yaw;
    const step = (Math.PI * 2) / CART_SLIDE_HEADINGS;
    const headings: number[] = [];
    for (let k = 0; k < CART_SLIDE_HEADINGS; k++) headings.push(base + Math.ceil(k / 2) * (k % 2 ? 1 : -1) * step);
    let seat: [number, number] | null = null, by = 0;
    const reach = o.maxSlide?.(cart) ?? CART_SLIDE_MAX_M;
    for (let ring = 1; !seat && ring * CART_SLIDE_STEP_M <= reach + 1e-9; ring++) {
      const r = ring * CART_SLIDE_STEP_M;
      for (const h of headings) {
        const x = cart.x + Math.sin(h) * r, z = cart.z + Math.cos(h) * r;
        if (o.blocked(cart, x, z) || !o.seatOk(cart, x, z)) continue;
        seat = [x, z]; by = r;
        break;
      }
    }
    if (seat) {
      receipt.slid.push({ kind: cart.kind, from: [round2(cart.x), round2(cart.z)], to: [round2(seat[0]), round2(seat[1])], by });
      o.move(cart, seat[0], seat[1]);
    } else {
      receipt.dropped.push({ kind: cart.kind, at: [round2(cart.x), round2(cart.z)] });
      o.drop(cart);
    }
  }
  return receipt;
}
