// src/world/maps/vehicleSetPiecesWorks.ts — the working vehicles of a station and a mine (the map-content lane,
// 2026-10-09; owner: "some maps like whiteout crossing and mesa mines look unfinished and so empty"), authored as
// vehicle set pieces (vehicleSetPieces.ts): the Hägglunds Bv 206 articulated over-snow carrier (1980s, the Norwegian and
// Swedish armies and the polar stations: 6.9 m over both cars, 1.87 m wide, 2.4 m high), the Tucker Sno-Cat (the 1544:
// four pontoon tracks under a boxy cab, 5.5 × 2.5 m, 2.6 m high, the DEW Line's and the polar expeditions' orange), the
// Caterpillar D8H crawler dozer (6.4 m with its blade, the blade 3.9 m wide, 3.3 m to the canopy) and the WABCO 35C
// Haulpak rear-dump truck of the open cuts in the 1970s (8.0 × 4.3 m, 4.0 m to the canopy, wheels 1.9 m high).
//
// Local frame: +Z the vehicle's nose, +Y up from the ground (y = 0 under its tracks or tyres), centred on its footprint.
// Built in the vehicle toolkit; the dressing (grilles, lamps, rails, stripes) is left out of the collision solid.
import { VehicleMesh, linearHex, material, type Vec3, type VehicleMaterial } from './vehicleMesh.ts';

type Mat = VehicleMaterial;
const ORANGE = material('paint', linearHex(0xc9562b), 0.55, 0.1, 0, 1);
const OLIVE = material('paint', linearHex(0x4c5332), 0.62, 0.1, 0, 1);
const CAT_YELLOW = material('paint', linearHex(0xd2a01e), 0.55, 0.1, 0, 1);
const WHITE = material('paint', linearHex(0xdedcd4), 0.55, 0.05, 0, 1);
const BLACK = material('steel', [0.035, 0.034, 0.032], 0.65, 0.35, 0, 1);
const RUBBER = material('rubber', [0.03, 0.03, 0.03], 0.9, 0, 0, 1);
const STEEL_M = material('steel', [0.12, 0.12, 0.12], 0.55, 0.6, 0, 1);
const RUSTY = material('steel', [0.09, 0.055, 0.035], 0.8, 0.2, 0, 1);
const GLASS = material('glass', [0.02, 0.024, 0.028], 0.06, 0, 0, 0.2);
const LAMP = material('lamp', [0.8, 0.78, 0.7], 0.2, 0, 0, 0.3);
const LAMP_AMBER = material('lampAmber', [0.8, 0.45, 0.08], 0.3, 0, 0, 0.3);
const DARK = material('trim', [0.03, 0.03, 0.032], 0.55, 0, 0, 0.6);
const ORE_LOAD = material('cargo', linearHex(0x6e4430), 0.95, 0, 0, 1);

/** A wheel (axis along x) at (x, y, z): tyre, rim and hub. */
function wheel(mesh: VehicleMesh, x: number, y: number, z: number, r: number, w: number, coarse: boolean, tyre: Mat = RUBBER, rim: Mat = STEEL_M): void {
  mesh.push().translate(x, y, z);
  mesh.lathe([[r * 0.62, -w / 2], [r * 0.95, -w / 2], [r, -w * 0.3], [r, w * 0.3], [r * 0.95, w / 2], [r * 0.62, w / 2]], coarse ? 12 : 18, () => tyre, { flip: true });
  mesh.lathe([[0.0001, -w * 0.42], [r * 0.62, -w * 0.42], [r * 0.62, w * 0.42], [0.0001, w * 0.42]], coarse ? 8 : 12, () => rim);
  mesh.pop();
}

/** A track belt round its end wheels at x: the belt along z from the rear wheel (zr, radius rr) to the front (zf, rf). */
function belt(mesh: VehicleMesh, x: number, width: number, zr: number, rr: number, yr: number, zf: number, rf: number, yf: number, coarse: boolean, m: Mat): void {
  const path: Vec3[] = [], n = coarse ? 5 : 9;
  for (let k = 0; k <= n; k++) { const a = Math.PI / 2 + (k / n) * Math.PI; path.push([x, yr + Math.sin(a) * rr, zr + Math.cos(a) * rr]); }
  for (let k = 0; k <= n; k++) { const a = -Math.PI / 2 + (k / n) * Math.PI; path.push([x, yf + Math.sin(a) * rf, zf + Math.cos(a) * rf]); }
  mesh.sweep(path, [[-width / 2, -0.04], [width / 2, -0.04], [width / 2, 0.04], [-width / 2, 0.04]], () => m,
    { closedPath: true, closedSection: true, creases: [0, 1, 2, 3], up: [1, 0, 0] });
  // the road wheels inside the belt
  const count = Math.max(2, Math.round((zf - zr) / 0.55));
  for (let k = 1; k < count; k++) {
    const z = zr + ((zf - zr) * k) / count, r = Math.min(rr, rf) * 0.8;
    mesh.push().translate(x, r + 0.06, z);
    mesh.lathe([[0.0001, -width * 0.35], [r, -width * 0.35], [r, width * 0.35], [0.0001, width * 0.35]], coarse ? 8 : 10, () => STEEL_M);
    mesh.pop();
  }
}

// ------------------------------------------------------------------------------------------------------------ Bv 206

/** The Bv 206: the front car (engine and cab, its windscreen and doors) and the rear car (the personnel box), each on two
 * rubber band tracks, joined by the steering unit; the roof rack and the lamps. */
export function bv206(mesh: VehicleMesh, coarse: boolean, livery: 'orange' | 'olive'): void {
  const paint = livery === 'olive' ? OLIVE : ORANGE, tw = 0.62, tx = 0.93 - tw / 2;
  for (const [zc, len] of [[1.75, 2.9], [-1.85, 2.9]] as const) {
    for (const sx of [1, -1]) belt(mesh, sx * tx, tw, zc - len / 2 + 0.3, 0.3, 0.32, zc + len / 2 - 0.3, 0.3, 0.36, coarse, RUBBER);
    mesh.box(0, 0.55, zc, 1.0, 0.3, len - 0.4, BLACK, 0.02);
  }
  // the front car: the bonnet sloping to the windscreen, the cab
  mesh.box(0, 1.25, 2.55, 1.84, 0.95, 1.3, paint, coarse ? 0 : 0.08);
  mesh.box(0, 1.55, 1.25, 1.84, 1.55, 1.4, paint, coarse ? 0 : 0.08);
  mesh.box(0, 2.36, 1.25, 1.7, 0.08, 1.3, paint, 0.02);
  mesh.dressing(() => {
    mesh.box(0, 1.95, 1.96, 1.6, 0.6, 0.02, GLASS, 0);
    for (const sx of [1, -1]) mesh.box(sx * 0.925, 1.95, 1.25, 0.02, 0.55, 1.1, GLASS, 0);
    mesh.box(0, 1.25, 3.21, 1.2, 0.35, 0.02, DARK, 0);
    for (const sx of [1, -1]) mesh.box(sx * 0.7, 1.45, 3.21, 0.2, 0.16, 0.03, LAMP, 0);
    mesh.box(0, 2.45, 1.25, 0.12, 0.1, 0.12, LAMP_AMBER, 0);
  });
  // the steering unit between the cars
  mesh.box(0, 0.85, -0.1, 0.5, 0.45, 0.6, BLACK, 0.02);
  // the rear car: the personnel box with its windows and rear door, the roof rack
  mesh.box(0, 1.45, -1.85, 1.84, 1.75, 2.75, paint, coarse ? 0 : 0.08);
  mesh.dressing(() => {
    for (const sx of [1, -1]) for (const z of [-1.2, -2.3]) mesh.box(sx * 0.925, 1.85, z, 0.02, 0.45, 0.7, GLASS, 0);
    mesh.box(0, 1.5, -3.23, 0.9, 1.2, 0.02, DARK, 0);
    for (const sx of [1, -1]) mesh.box(sx * 0.75, 0.95, -3.23, 0.14, 0.12, 0.03, LAMP_AMBER, 0);
    for (const sx of [1, -1]) mesh.box(sx * 0.82, 2.42, -1.85, 0.05, 0.08, 2.5, BLACK, 0);
    for (let k = 0; k < 5; k++) mesh.box(0, 2.42, -2.9 + k * 0.52, 1.64, 0.05, 0.05, BLACK, 0);
  });
}

// ------------------------------------------------------------------------------------------------------------ Sno-Cat

/** The Tucker Sno-Cat 1544: four pontoon tracks on their steering bogies, the frame, the boxy cab with its wide windows,
 * the cargo bed behind it; the lamps and the roof rack. */
export function snocat(mesh: VehicleMesh, coarse: boolean): void {
  const pw = 0.66;
  for (const sx of [1, -1]) for (const zc of [1.6, -1.6]) {
    const x = sx * 0.92;
    belt(mesh, x, pw, zc - 0.7, 0.32, 0.36, zc + 0.7, 0.42, 0.48, coarse, BLACK);
    mesh.box(x, 0.62, zc, 0.22, 0.24, 1.3, ORANGE, 0.02);
  }
  mesh.box(0, 1.05, 0, 1.3, 0.35, 4.8, BLACK, 0.02);
  // the cab forward, its windows; the bed behind
  mesh.box(0, 1.85, 0.9, 2.3, 1.35, 2.4, ORANGE, coarse ? 0 : 0.07);
  mesh.box(0, 2.56, 0.9, 2.2, 0.08, 2.3, WHITE, 0.02);
  mesh.box(0, 1.5, -1.5, 2.3, 0.6, 2.2, ORANGE, coarse ? 0 : 0.05);
  mesh.dressing(() => {
    mesh.box(0, 2.15, 2.11, 2.0, 0.6, 0.02, GLASS, 0);
    for (const sx of [1, -1]) mesh.box(sx * 1.155, 2.15, 0.9, 0.02, 0.55, 1.9, GLASS, 0);
    for (const sx of [1, -1]) mesh.box(sx * 0.8, 1.6, 2.11, 0.2, 0.18, 0.03, LAMP, 0);
    mesh.box(0, 2.66, 0.9, 0.14, 0.12, 0.14, LAMP_AMBER, 0);
    for (let k = 0; k < 4; k++) mesh.box(0, 1.85, -0.6 - k * 0.6, 2.2, 0.06, 0.06, BLACK, 0);
    for (const sx of [1, -1]) mesh.box(sx * 1.1, 1.85, -1.5, 0.06, 0.06, 2.1, BLACK, 0);
  });
  // fuel drums lashed in the bed
  for (const sx of [1, -1]) {
    mesh.push().translate(sx * 0.5, 2.1, -1.5).rotateZ(Math.PI / 2);
    mesh.lathe([[0.0001, -0.42], [0.29, -0.42], [0.29, 0.42], [0.0001, 0.42]], coarse ? 8 : 12, () => RUSTY);
    mesh.pop();
  }
}

// -------------------------------------------------------------------------------------------------------------- D8H

/** The Caterpillar D8H: the tracks on their frames, the engine hood and radiator, the operator's seat under its canopy
 * (ROPS), the straight blade on its push arms and lift rams ahead, the ripper shank astern. */
export function dozer(mesh: VehicleMesh, coarse: boolean): void {
  const tw = 0.56, gauge = 1.0;
  for (const sx of [1, -1]) {
    const x = sx * gauge;
    belt(mesh, x, tw, -1.35, 0.5, 0.55, 1.35, 0.45, 0.5, coarse, BLACK);
    mesh.box(x, 0.55, 0, 0.3, 0.38, 2.4, CAT_YELLOW, 0.02);
    if (!coarse) mesh.dressing(() => { for (let k = 0; k < 16; k++) mesh.box(x, 0.02, -1.6 + k * 0.21, tw, 0.04, 0.06, RUSTY, 0); });
  }
  // the main frame, the engine hood, the radiator guard, the stack
  mesh.box(0, 1.0, 0, 1.4, 0.5, 3.2, CAT_YELLOW, 0.03);
  mesh.box(0, 1.75, 0.55, 1.2, 1.0, 2.0, CAT_YELLOW, coarse ? 0 : 0.06);
  mesh.box(0, 1.8, 1.62, 1.3, 1.1, 0.16, CAT_YELLOW, coarse ? 0 : 0.03);
  mesh.dressing(() => { for (let k = 0; k < 8; k++) mesh.box(-0.5 + k * 0.143, 1.8, 1.71, 0.04, 0.85, 0.02, DARK, 0); });
  mesh.tube([[0.35, 2.25, 0.9], [0.35, 3.0, 0.9]], 0.07, 8, BLACK, { caps: true });
  // the seat, the fuel tank astern, the canopy on its four posts
  mesh.box(0, 1.55, -1.0, 1.5, 0.6, 1.0, CAT_YELLOW, 0.04);
  mesh.box(0, 1.95, -0.7, 0.5, 0.15, 0.5, BLACK, 0.02);
  for (const sx of [1, -1]) for (const z of [-1.4, -0.2]) mesh.box(sx * 0.68, 2.55, z, 0.1, 1.5, 0.1, CAT_YELLOW, 0.01);
  mesh.box(0, 3.3, -0.8, 1.55, 0.1, 1.4, CAT_YELLOW, 0.02);
  // the blade ahead on its arms, the lift rams
  mesh.box(0, 0.75, 2.75, 3.9, 1.45, 0.22, CAT_YELLOW, coarse ? 0 : 0.04);
  mesh.box(0, 0.1, 2.88, 3.9, 0.16, 0.1, RUSTY, 0);
  for (const sx of [1, -1]) {
    mesh.box(sx * 1.25, 0.6, 1.8, 0.16, 0.22, 1.9, CAT_YELLOW, 0.02);
    mesh.tube([[sx * 0.55, 1.95, 1.55], [sx * 0.7, 1.2, 2.6]], 0.07, 8, STEEL_M, { caps: true });
  }
  // the ripper shank astern
  mesh.box(0, 0.9, -1.9, 1.2, 0.25, 0.3, CAT_YELLOW, 0.02);
  mesh.box(0, 0.5, -2.05, 0.18, 1.0, 0.25, RUSTY, 0.02);
}

// ---------------------------------------------------------------------------------------------------------- Haulpak

/** The WABCO 35C Haulpak: the frame on its two front tyres and the rear duals, the engine and radiator at the nose, the
 * cab offset on the left deck, the deck's railings and ladder, the dump body sloping up to its canopy over the cab, the
 * body heaped with ore (or empty). */
export function haulpak(mesh: VehicleMesh, coarse: boolean, laden: boolean): void {
  const R = 0.95, W = 0.62;
  for (const sx of [1, -1]) {
    wheel(mesh, sx * 1.65, R, 2.45, R, W, coarse);
    wheel(mesh, sx * 1.42, R, -1.75, R, W, coarse);
    wheel(mesh, sx * 1.98, R, -1.75, R, W * 0.95, coarse);
  }
  // the frame, the axle housing, the engine bay and radiator, the deck over them
  mesh.box(0, 1.2, 0.3, 1.2, 0.5, 6.4, BLACK, 0.02);
  mesh.box(0, 1.0, -1.75, 2.4, 0.5, 0.6, BLACK, 0.02);
  mesh.box(0, 1.85, 2.6, 1.6, 1.3, 1.6, CAT_YELLOW, coarse ? 0 : 0.05);
  mesh.dressing(() => { for (let k = 0; k < 7; k++) mesh.box(-0.6 + k * 0.2, 1.85, 3.41, 0.05, 1.0, 0.02, DARK, 0); });
  mesh.box(0, 2.55, 2.5, 4.1, 0.12, 1.9, CAT_YELLOW, 0.02);
  // the cab on the left deck
  mesh.box(1.35, 3.25, 2.4, 1.3, 1.3, 1.5, CAT_YELLOW, coarse ? 0 : 0.05);
  mesh.dressing(() => {
    mesh.box(1.35, 3.45, 3.16, 1.15, 0.7, 0.02, GLASS, 0);
    mesh.box(2.01, 3.45, 2.4, 0.02, 0.7, 1.2, GLASS, 0);
    for (const sx of [1, -1]) mesh.box(sx * 0.9, 2.2, 3.41, 0.22, 0.2, 0.03, LAMP, 0);
    // the deck's railings and the ladder down its front
    mesh.box(0, 3.15, 3.43, 4.0, 0.05, 0.05, BLACK, 0);
    for (const x of [-1.95, -0.5, 1.95]) mesh.box(x, 2.88, 3.43, 0.05, 0.6, 0.05, BLACK, 0);
    for (let k = 0; k < 6; k++) mesh.box(-1.6, 0.35 + k * 0.38, 3.5, 0.5, 0.04, 0.05, BLACK, 0);
  });
  // the dump body: floor rising toward the canopy, the sides, the front wall and the canopy over the cab
  const fy = 2.05, tail = -3.95, front = 1.45;
  mesh.box(0, fy + 0.15, (tail + front) / 2, 3.9, 0.3, front - tail, CAT_YELLOW, 0.03);
  for (const sx of [1, -1]) mesh.box(sx * 1.95, fy + 1.0, (tail + front) / 2 + 0.2, 0.14, 1.7, front - tail - 0.4, CAT_YELLOW, coarse ? 0 : 0.03);
  mesh.box(0, fy + 1.3, front, 3.9, 2.3, 0.18, CAT_YELLOW, 0.03);
  mesh.box(0, fy + 2.45, front + 1.05, 3.9, 0.12, 2.2, CAT_YELLOW, 0.02);
  if (laden) mesh.box(0, fy + 1.2, (tail + front) / 2, 3.6, 1.3, front - tail - 0.6, ORE_LOAD, coarse ? 0 : 0.4);
}
