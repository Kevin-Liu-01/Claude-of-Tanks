// 262 (owner: "we should upgrade the hulls and everything about the tanks too"): the hull fittings the STB-1 prototype
// and the production Type 74 carry, each placed by its builder on its own measured faces. Sources and photographs:
// docs/references/tanks/type74.md and stb1.md, "Hull (262 rebuild)". Program frame (BUILD-STANDARD §A): +x is the
// vehicle's right, +z its front.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';

export interface HullKitPort {
  readonly q?: boolean;
  add(slot: string, geometry: THREE.BufferGeometry, x?: number, y?: number, z?: number, rx?: number, ry?: number, rz?: number): void;
}

type Lamp = 'head' | 'ir' | 'marker';

/**
 * A lamp box at a hull front corner: the housing with its recessed dark face, its lamps from the outboard end in (a
 * marker is the amber lamp over the blackout lamp), and the tubular cage over its front, its bars welded to the housing's top and
 * foot. `x` is the box's centre, `y` its foot, `z` its face; `bars` the cage's upright count.
 */
export function cagedLampBox(P: HullKitPort, o: {
  x: number; y: number; z: number; w: number; h: number; d: number; side: number; lamps: readonly Lamp[]; bars: number;
}): void {
  const { box, cylZ, torus } = KIT;
  const seg = P.q ? 18 : 10, { x, y, z, w, h, d, side } = o, cy = y + h / 2;
  P.add('hull', box(w, h, d), x, cy, z - d / 2);
  P.add('hullDark', box(w - 0.04, h - 0.04, 0.012), x, cy, z - 0.012);              // the recess behind the lamps
  for (const dy of [-1, 1]) P.add('hull', box(w, 0.02, 0.03), x, cy + dy * (h / 2 - 0.01), z + 0.002);
  for (const dx of [-1, 1]) P.add('hull', box(0.02, h, 0.03), x + dx * (w / 2 - 0.01), cy, z + 0.002);
  // lamps from the outboard end (the box's -side·x end) inward
  const pitch = (w - 0.06) / o.lamps.length;
  o.lamps.forEach((kind, i) => {
    const lx = x - side * (w / 2 - 0.03 - pitch * (i + 0.5));
    if (kind === 'head') {
      P.add('hullDetail', cylZ(0.072, 0.05, seg), lx, cy, z - 0.012);
      P.add('hullGlass', markVehicleNightLens(cylZ(0.062, 0.012, seg), 'headlight'), lx, cy, z + 0.018);
    } else if (kind === 'ir') {
      P.add('hullDark', torus(0.064, 0.009, seg, 8).rotateX(Math.PI / 2), lx, cy, z + 0.012);
      P.add('hullDark', cylZ(0.058, 0.03, seg), lx, cy, z - 0.004);
    } else {
      // the amber marker over the small blackout lamp
      P.add('hullGlass', markVehicleNightLens(cylZ(0.036, 0.03, seg), 'marker', { tint: 'warm' }), lx, cy + 0.03, z + 0.003);
      P.add('hullGlass', markVehicleNightLens(box(0.05, 0.026, 0.02), 'marker', { tint: 'warm' }), lx, cy - 0.045, z + 0.004);
    }
  });
  // the cage: a top and a foot rail round the front and returns, uprights between them
  const r = 0.008, front = z + 0.075, top = y + h + 0.005, foot = y + 0.012, half = w / 2 + 0.012;
  for (const yy of [top, foot]) {
    P.add('hullDetail', beamBetween([x - half, yy, front], [x + half, yy, front], r));
    for (const dx of [-1, 1]) P.add('hullDetail', beamBetween([x + dx * half, yy, front], [x + dx * half, yy, z - 0.02], r));
  }
  for (let k = 0; k < o.bars; k++) {
    const bx = x - half + (2 * half * (k + 0.5)) / o.bars;
    P.add('hullDetail', beamBetween([bx, foot, front], [bx, top, front], r));
  }
}

/** A front mudguard: the angled plate hung from the fender's end, stiffened by two ribs. */
export function ribbedMudguard(P: HullKitPort, x: number, y: number, z: number, w: number, len: number, rake: number): void {
  const { box } = KIT;
  P.add('hull', box(w, 0.012, len), x, y - Math.sin(rake) * len / 2, z + Math.cos(rake) * len / 2, rake, 0, 0);
  for (const dx of [-0.25, 0.25]) P.add('hull', box(0.02, 0.022, len - 0.04),
    x + dx * w, y - Math.sin(rake) * len / 2 + 0.016 * Math.cos(rake), z + Math.cos(rake) * len / 2 + 0.016 * Math.sin(rake), rake, 0, 0);
}

/** A clevis tow shackle on a plate whose outward normal is `face` (+z ahead, -z astern): the lug pair and its pin. */
export function towShackle(P: HullKitPort, x: number, y: number, z: number, face: 1 | -1, tilt = 0): void {
  const { box, cylX, torus } = KIT;
  for (const dx of [-0.032, 0.032]) P.add('hullDetail', box(0.02, 0.085, 0.07), x + dx, y, z + face * 0.03, tilt, 0, 0);
  P.add('hullDark', cylX(0.016, 0.1, 10), x, y - 0.012, z + face * 0.05, tilt, 0, 0);
  P.add('hullDetail', torus(0.042, 0.012, 12, 8).rotateZ(Math.PI / 2), x, y - 0.06, z + face * 0.055, tilt, 0, 0); // the bow, hanging under the pin
}

/** A big tow eye standing on a top edge, its ring along z and half sunk in its foot block. */
export function uTowEye(P: HullKitPort, x: number, y: number, z: number): void {
  const { box, torus } = KIT;
  P.add('hullDetail', torus(0.06, 0.017, 14, 8).rotateZ(Math.PI / 2), x, y + 0.02, z);
  P.add('hull', box(0.05, 0.04, 0.17), x, y + 0.02, z);
}

/** A long tubular muffler cover along a rear fender run, its end bands, its feet, and the short outlet turned rearward
 * and outward (`side` ±1). */
export function mufflerCover(P: HullKitPort, x: number, y: number, z0: number, z1: number, r: number, side: number): void {
  const { box, cylZ } = KIT;
  const seg = P.q ? 20 : 12, len = z0 - z1, zc = (z0 + z1) / 2, cy = y + r;
  P.add('hull', cylZ(r, len, seg), x, cy, zc);
  for (const z of [z0 - 0.02, z1 + 0.02]) P.add('hullDark', cylZ(r + 0.006, 0.025, seg), x, cy, z);
  for (const z of [z0 - 0.15, zc, z1 + 0.15]) P.add('hull', box(0.05, 0.03, 0.05), x, y + 0.012, z);
  // the outlet: a short pipe from the cover's rear cap, turned outward
  P.add('hullDark', beamBetween([x, cy, z1 + 0.01], [x + side * 0.07, cy, z1 - 0.11], 0.045, seg));
  P.add('hullDark', cylZ(0.035, 0.012, seg), x + side * 0.072, cy, z1 - 0.115, 0, side * 0.55, 0);
}

/** The prototype's exhaust: one silencer cylinder in a mesh guard (hoops and longitudinal bars) on a rear fender. */
export function guardedSilencer(P: HullKitPort, x: number, y: number, z0: number, z1: number, r: number, side: number): void {
  const { box, cylZ, torus } = KIT;
  const seg = P.q ? 20 : 12, len = z0 - z1, zc = (z0 + z1) / 2, cy = y + r + 0.03;
  P.add('hullDark', cylZ(r, len - 0.08, seg), x, cy, zc);
  for (let k = 0; k < 4; k++) P.add('hullDetail', torus(r + 0.025, 0.008, seg, 6).rotateX(Math.PI / 2), x, cy, z1 + 0.05 + k * (len - 0.1) / 3);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    P.add('hullDetail', box(0.012, 0.012, len - 0.06), x + Math.cos(a) * (r + 0.025), cy + Math.sin(a) * (r + 0.025), zc);
  }
  for (const z of [z0 - 0.12, z1 + 0.12]) P.add('hull', box(0.06, 0.03 + 0.012, 0.06), x, y + 0.02, z);
  P.add('hullDark', beamBetween([x, cy - 0.02, z1 + 0.02], [x + side * 0.05, cy - 0.04, z1 - 0.08], 0.038, seg));
}

/** A round tail lamp on its bracket at a rear fender's top outer corner. */
export function tailLamp(P: HullKitPort, x: number, y: number, z: number): void {
  const { box, cylZ } = KIT;
  P.add('hull', box(0.10, 0.10, 0.04), x, y + 0.05, z + 0.02);
  P.add('hullDetail', cylZ(0.04, 0.04, 12), x, y + 0.055, z - 0.02);
  P.add('hullGlass', markVehicleNightLens(cylZ(0.032, 0.012, 12), 'marker', { tint: 'red' }), x, y + 0.055, z - 0.042);
}
