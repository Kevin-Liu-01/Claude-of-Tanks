// Real field stowage for turret baskets and racks (owner, 2026-10-14: "make sure we use actual tank equipment/
// decorations in some of our newer tanks, like the ztz-100, m1a2s, TYPE 10, and merkava, especially in lieu of random
// thingies like this", with Gallery markups on the soft lumps, rolls and blank blocks in those baskets).
//
// A welded sheet-steel stowage chest as the crews carry them in a bustle basket or on a rack: the body, a lid that
// overhangs it by a few millimetres, pressed stiffening ribs on the lid and the front, two piano-hinge knuckles on the
// back edge, two over-centre hasp latches on the front at the lid line and a carry handle on each end. The body and lid
// take the vehicle's equipment paint (camouflage-projected like the hull's other fittings); the hardware is dark steel.
// The coarse level keeps the body and lid only.
import * as THREE from 'three';
import { moldedBox } from '../accessoryPrimitives.ts';
import { box, cylX, cylZ, xform } from '../factoryGeometry.ts';

export interface FieldChestParts {
  /** painted body, lid and pressed ribs */
  readonly paint: THREE.BufferGeometry[];
  /** hinges, latches and handles */
  readonly dark: THREE.BufferGeometry[];
}

export interface FieldChestOptions {
  /** full detail (hinges, latches, handles, ribs); false = the coarse level's body and lid */
  readonly high?: boolean;
  /** which local face carries the latches: +1 = +Z (default), -1 = -Z */
  readonly front?: 1 | -1;
  /** handles on the two X ends (default true); off where the chest stands against a neighbour or the basket side */
  readonly handles?: boolean;
}

/**
 * One chest, centred on X and Z with its floor on y = 0, `w` along X, `h` tall, `d` along Z. Metres.
 * Typical crew chests: 0.5-1.0 m long, 0.3-0.45 m tall and deep.
 */
export function fieldChestParts(w: number, h: number, d: number, options: FieldChestOptions = {}): FieldChestParts {
  const high = options.high !== false, f = options.front ?? 1, handles = options.handles !== false;
  const lidH = Math.min(0.07, Math.max(0.04, h * 0.18)), bodyH = h - lidH;
  const paint: THREE.BufferGeometry[] = [
    xform(moldedBox(w, bodyH, d, high ? 0.012 : 0, high ? 1 : 0, 0.006), 0, bodyH / 2, 0),
    xform(moldedBox(w + 0.014, lidH, d + 0.014, high ? 0.014 : 0, high ? 1 : 0, 0.006), 0, bodyH + lidH / 2, 0),
  ];
  const dark: THREE.BufferGeometry[] = [];
  if (!high) return { paint, dark };
  // pressed stiffening: two ribs along the lid and two across the front, a few millimetres proud
  for (const z of [-0.22, 0.22]) paint.push(xform(box(w * 0.86, 0.008, 0.03), 0, h + 0.004, z * d));
  for (const y of [0.33, 0.66]) paint.push(xform(box(w * 0.88, 0.02, 0.008), 0, y * bodyH, f * (d / 2 + 0.004)));
  // piano-hinge knuckles and their leaves on the back edge
  for (const x of [-0.28, 0.28]) {
    dark.push(xform(cylX(0.011, w * 0.22, 10), x * w, bodyH, -f * (d / 2 + 0.010)));
    dark.push(xform(box(w * 0.22, 0.045, 0.004), x * w, bodyH - 0.024, -f * (d / 2 + 0.003)));
  }
  // over-centre hasp latches at the lid line: the base plate on the body, the lever, the catch on the lid
  for (const x of [-0.30, 0.30]) {
    dark.push(xform(box(0.05, 0.06, 0.010), x * w, bodyH - 0.035, f * (d / 2 + 0.006)));
    dark.push(xform(box(0.028, 0.055, 0.012), x * w, bodyH - 0.005, f * (d / 2 + 0.013)));
    dark.push(xform(box(0.044, 0.018, 0.012), x * w, bodyH + lidH * 0.55, f * (d / 2 + 0.013)));
  }
  // a carry handle on each end: two welded lugs and the grip bar between them
  if (handles) for (const s of [-1, 1]) {
    for (const z of [-0.07, 0.07]) dark.push(xform(box(0.026, 0.016, 0.014), s * (w / 2 + 0.013), bodyH * 0.62, z));
    dark.push(xform(cylZ(0.008, 0.16, 8), s * (w / 2 + 0.024), bodyH * 0.62, 0));
  }
  return { paint, dark };
}

/**
 * One M2A1 ammunition can (the .50-calibre can US crews stack in a bustle rack): 0.305 m long (X), 0.155 m wide (Z),
 * 0.19 m tall, floor on y = 0. The lid's rubber-sealed rim, the folding carry handle on the lid, the latch lever on the
 * +X end and a pressed rib round the body. The coarse level keeps body and lid.
 */
export function ammoCanParts(high = true): FieldChestParts {
  const L = 0.305, W = 0.155, H = 0.19, lid = 0.028, body = H - lid;
  const paint: THREE.BufferGeometry[] = [
    xform(box(L, body, W), 0, body / 2, 0),
    xform(box(L + 0.008, lid, W + 0.008), 0, body + lid / 2, 0),
  ];
  const dark: THREE.BufferGeometry[] = [];
  if (!high) return { paint, dark };
  paint.push(xform(box(L + 0.004, 0.012, W + 0.004), 0, body * 0.45, 0));
  // folding carry handle: two hinge lugs and the bar between them, lying flat on the lid
  for (const x of [-0.05, 0.05]) dark.push(xform(box(0.016, 0.012, 0.022), x, H + 0.006, 0));
  dark.push(xform(cylX(0.006, 0.10, 6), 0, H + 0.008, 0.016));
  // the latch lever folded down the +X end, its hinge pin at the lid line
  dark.push(xform(box(0.010, 0.10, 0.06), L / 2 + 0.008, body - 0.04, 0));
  dark.push(xform(cylZ(0.007, 0.07, 6), L / 2 + 0.006, body + 0.004, 0));
  return { paint, dark };
}
