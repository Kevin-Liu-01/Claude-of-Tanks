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
