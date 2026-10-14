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
// (Lane C, #8 r2) the ore's darker lumps, the glass's rubber, the seats, the engine seen through an open panel
const HAUL_ORE_DARK = material('cargo', linearHex(0x4e3122), 0.95, 0, 0, 1);
const GASKET = material('rubber', [0.025, 0.025, 0.025], 0.85, 0, 0, 0.6);
const SEAT = material('interior', linearHex(0x2f2a24), 0.85, 0, 0, 0.6);
const ENGINE = material('under', [0.05, 0.048, 0.045], 0.7, 0.3, 0, 1);

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

// (Lane C, #8 r2, 2026-10-14) the Bv 206 and the Sno-Cat rebuilt to the r2 bar within Whiteout's budget: the band tracks'
// cleats and road wheels, glass set into gaskets behind framed openings, doors with hinges and handles, lamps in bezels,
// the roof rack on stanchions; each with a wreck of its own (see below).

/** The cleats across a band track's ground and top runs (rubber on the Bv 206, steel on the Sno-Cat's pontoons). */
function trackCleats(mesh: VehicleMesh, x: number, width: number, z0: number, z1: number, yLow: number, yTop: number, n: number, m: Mat): void {
  for (let k = 0; k < n; k++) {
    const z = z0 + (k + 0.5) * ((z1 - z0) / n);
    mesh.box(x, yLow, z, width, 0.04, 0.06, m, 0);
    mesh.box(x, yTop, z, width, 0.04, 0.06, m, 0);
  }
}

/** The Bv 206: the front car (engine and cab, its windscreen and doors) and the rear car (the personnel box), each on two
 * rubber band tracks, joined by the steering unit; the roof rack and the lamps. Wrecked: burnt out, the tracks burnt off
 * the road wheels, the glass gone, the front car's door down on the snow, the rear car twisted on the steering unit with
 * its roof sagging. */
export function bv206(mesh: VehicleMesh, coarse: boolean, livery: 'orange' | 'olive', wrecked = false): void {
  const paint = livery === 'olive' ? OLIVE : ORANGE, tw = 0.62, tx = 0.93 - tw / 2;
  const cars: [number, number, number][] = [[1.75, 2.9, 0], [-1.85, 2.9, wrecked ? 0.07 : 0]];
  for (const [zc, len, roll] of cars) {
    mesh.push().translate(0, 0, zc).rotateZ(roll).translate(0, 0, -zc);
    for (const sx of [1, -1]) {
      if (!wrecked) {
        belt(mesh, sx * tx, tw, zc - len / 2 + 0.3, 0.3, 0.32, zc + len / 2 - 0.3, 0.3, 0.36, coarse, RUBBER);
        if (!coarse) trackCleats(mesh, sx * tx, tw, zc - len / 2 + 0.3, zc + len / 2 - 0.3, 0.02, 0.68, 9, RUBBER);
      } else {
        // the band burnt away: the road wheels and the sprocket bare on the snow, a strip of the belt's steel cord
        for (let k = 0; k < 4; k++) {
          mesh.push().translate(sx * tx, 0.24, zc - len / 2 + 0.45 + k * (len - 0.9) / 3);
          mesh.lathe([[0.0001, -0.1], [0.24, -0.1], [0.24, 0.1], [0.0001, 0.1]], coarse ? 6 : 10, () => RUSTY);
          mesh.pop();
        }
        if (!coarse) mesh.box(sx * tx, 0.02, zc, tw * 0.8, 0.02, len - 0.6, RUSTY, 0);
      }
    }
    mesh.box(0, 0.55 - (wrecked ? 0.08 : 0), zc, 1.0, 0.3, len - 0.4, BLACK, 0.02);
    mesh.pop();
  }
  const sink = wrecked ? 0.08 : 0;
  mesh.push().translate(0, -sink, 0);
  // the front car: the bonnet sloping down to the grille, the cab behind it with its glass and doors
  mesh.box(0, 1.2, 2.6, 1.84, 0.85, 1.2, paint, coarse ? 0 : 0.08);
  mesh.push().translate(0, 1.63, 2.45).rotateX(0.18);
  mesh.box(0, 0, 0, 1.8, 0.06, 0.95, paint, 0.02);
  mesh.pop();
  const cz = 1.25, cw = 1.84, cd = 1.4, c0 = 0.78, belt0 = 1.6, roof = 2.32;
  mesh.box(0, (c0 + belt0) / 2, cz, cw, belt0 - c0, cd, paint, coarse ? 0 : 0.06);
  for (const [px, pz] of [[0.88, 0.66], [-0.88, 0.66], [0.88, -0.66], [-0.88, -0.66]] as const) {
    strut(mesh, [px, belt0, cz + pz], [px, roof, cz + pz], 0.08, 0.08, paint);
  }
  mesh.box(0, roof + 0.04, cz, 1.84, 0.08, 1.4, paint, 0.03);
  const gy = (belt0 + roof) / 2;
  glazed(mesh, 0, gy, cz + cd / 2, 'z', 1.6, roof - belt0 - 0.12, 1, 0.03, !wrecked);
  for (const sx of [1, -1] as const) glazed(mesh, sx * cw / 2, gy, cz, 'x', 1.2, roof - belt0 - 0.12, sx, 0.03, !wrecked);
  // the doors (the right one down on the snow in the wreck), their hinges and handles; the grille and the lamps
  if (!coarse) mesh.dressing(() => {
    for (const sx of [1, -1]) {
      if (wrecked && sx < 0) continue;
      const x = sx * (cw / 2 + 0.006);
      for (const z of [cz - 0.55, cz + 0.55]) mesh.box(x, (c0 + 0.1 + roof) / 2, z, 0.012, roof - c0 - 0.15, 0.016, DARK, 0);
      for (const y of [c0 + 0.35, roof - 0.3]) mesh.box(x + sx * 0.012, y, cz + 0.55, 0.025, 0.09, 0.05, BLACK, 0);
      mesh.box(x + sx * 0.015, belt0 - 0.08, cz - 0.4, 0.03, 0.04, 0.12, STEEL_M, 0);
    }
  });
  mesh.box(0, 1.15, 3.21, 1.2, 0.36, 0.04, DARK, 0);
  if (!coarse) for (let k = 0; k < 4; k++) mesh.box(0, 1.03 + k * 0.08, 3.23, 1.1, 0.025, 0.03, wrecked ? RUSTY : BLACK, 0);
  for (const sx of [1, -1]) {
    mesh.push().translate(sx * 0.7, 1.45, 3.2).rotateY(-Math.PI / 2);
    mesh.lathe([[0.0001, -0.02], [0.09, -0.02], [0.09, 0.05], [0.0001, 0.05]], coarse ? 6 : 10, () => (wrecked ? DARK : LAMP));
    mesh.pop();
  }
  mesh.box(0, 0.78, 3.24, 1.7, 0.14, 0.14, BLACK, 0.02);
  mesh.tube([[-0.8, 1.0, 2.1], [-0.95, 1.5, 2.1], [-0.95, 2.5, 2.1]], 0.04, coarse ? 5 : 8, wrecked ? RUSTY : BLACK, { caps: true });
  if (!wrecked) mesh.dressing(() => mesh.box(0, roof + 0.13, cz, 0.12, 0.1, 0.12, LAMP_AMBER, 0));
  // the steering unit between the cars: its housing and the two steering rams
  mesh.box(0, 0.85, -0.1, 0.5, 0.45, 0.6, BLACK, 0.02);
  for (const sx of [1, -1]) mesh.tube([[sx * 0.3, 0.9, 0.2], [sx * 0.35, 0.85, -0.4]], 0.04, coarse ? 5 : 8, STEEL_M, { caps: true });
  mesh.pop();
  // the rear car: the personnel box, its windows set in, the rear door with its window, the roof rack on stanchions;
  // wrecked, twisted on the steering unit with its roof sagging
  const rz = -1.85, rl = 2.75, r0 = 0.72, rTop = 2.32, sag = wrecked ? 0.18 : 0;
  mesh.push().translate(0, -sink, rz).rotateZ(wrecked ? 0.07 : 0).translate(0, 0, -rz);
  mesh.box(0, (r0 + 1.6) / 2, rz, 1.84, 1.6 - r0, rl, paint, coarse ? 0 : 0.06);
  for (const sx of [1, -1]) for (const z of [rz + rl / 2 - 0.06, rz - rl / 2 + 0.06, rz]) strut(mesh, [sx * 0.88, 1.6, z], [sx * 0.88, rTop - (z === rz ? sag : 0), z], 0.08, 0.08, paint);
  // the roof: its two halves meeting low over the middle when it sags
  for (const half of [1, -1]) {
    const zA = rz + half * rl / 2, zB = rz;
    mesh.push().translate(0, rTop + 0.04, (zA + zB) / 2).rotateX(half * Math.atan2(sag, rl / 2));
    mesh.box(0, -sag / 2, 0, 1.84, 0.08, rl / 2 + 0.02, paint, 0.02);
    mesh.pop();
  }
  for (const sx of [1, -1] as const) for (const z of [rz + 0.62, rz - 0.62]) glazed(mesh, sx * 0.92, (1.6 + rTop) / 2 - sag / 3, z, 'x', 1.0, rTop - 1.6 - 0.14, sx, 0.03, !wrecked);
  glazed(mesh, 0, (1.6 + rTop) / 2, rz - rl / 2, 'z', 0.7, 0.42, -1, 0.03, !wrecked);
  if (!coarse) mesh.dressing(() => {
    // the rear door's seams, hinges and handle
    for (const x of [-0.45, 0.45]) mesh.box(x, 1.45, rz - rl / 2 - 0.006, 0.016, 1.45, 0.012, DARK, 0);
    for (const y of [1.0, 1.9]) mesh.box(-0.47, y, rz - rl / 2 - 0.02, 0.05, 0.1, 0.03, BLACK, 0);
    mesh.box(0.35, 1.45, rz - rl / 2 - 0.02, 0.12, 0.04, 0.03, STEEL_M, 0);
    for (const sx of [1, -1]) mesh.box(sx * 0.75, 0.95, rz - rl / 2 - 0.01, 0.14, 0.12, 0.03, wrecked ? DARK : LAMP_AMBER, 0);
  });
  // the rack: stanchions, rails and slats
  if (!wrecked) {
    for (const sx of [1, -1]) for (const z of [rz - 1.1, rz, rz + 1.1]) strut(mesh, [sx * 0.8, rTop + 0.08, z], [sx * 0.8, rTop + 0.22, z], 0.04, 0.04, BLACK);
    for (const sx of [1, -1]) mesh.box(sx * 0.8, rTop + 0.24, rz, 0.05, 0.05, 2.4, BLACK, 0);
    if (!coarse) for (let k = 0; k < 5; k++) mesh.box(0, rTop + 0.24, rz - 1.04 + k * 0.52, 1.6, 0.035, 0.04, BLACK, 0);
  }
  mesh.pop();
  if (wrecked) mesh.dressing(() => {
    // the right door, down on the snow beside the cab
    mesh.push().translate(-1.42, 0.05, 1.4).rotateY(0.3).rotateZ(1.53);
    mesh.box(0, 0, 0, 0.05, 1.1, 1.0, paint, 0.01);
    mesh.pop();
  });
}

// ------------------------------------------------------------------------------------------------------------ Sno-Cat

/** The Tucker Sno-Cat 1544: four pontoon tracks on their steering bogies, the frame, the boxy cab with its wide windows,
 * the cargo bed behind it; the lamps and the roof rack. Wrecked: burnt out, the right front pontoon torn off its bogie and
 * lying canted beside it, the cab's glass gone and its roof caved, the drums thrown down. */
export function snocat(mesh: VehicleMesh, coarse: boolean, wrecked = false): void {
  // (the map-content lane's first capture: the pontoons read as four wheels on stalks under a floating box) each pontoon
  // long and low, the track wrapped round it under an orange pontoon body, the frame and the cab sitting down on them
  const pw = 0.62;
  for (const sx of [1, -1]) for (const zc of [1.45, -1.45]) {
    const x = sx * 0.92, torn = wrecked && sx < 0 && zc > 0;
    mesh.push();
    if (torn) mesh.translate(-0.35, -0.05, 0.25).translate(x, 0, zc).rotateY(0.35).rotateZ(-0.28).translate(-x, 0, -zc);
    belt(mesh, x, pw, zc - 0.62, 0.36, 0.38, zc + 0.62, 0.38, 0.40, coarse, wrecked ? RUSTY : BLACK);
    if (!coarse) trackCleats(mesh, x, pw + 0.04, zc - 0.62, zc + 0.62, 0.0, 0.8, 6, wrecked ? RUSTY : STEEL_M);
    mesh.box(x, 0.62, zc, pw - 0.08, 0.34, 1.3, ORANGE, coarse ? 0 : 0.06);
    if (!torn) mesh.box(x * 0.55, 0.86, zc, 0.6, 0.16, 0.3, BLACK, 0.02);
    mesh.pop();
  }
  const sink = wrecked ? 0.06 : 0;
  mesh.push();
  if (wrecked) mesh.translate(0, -sink, 0).rotateZ(-0.05).rotateX(0.03);
  mesh.box(0, 0.98, 0, 1.2, 0.26, 4.4, BLACK, 0.02);
  // the cab: lower panels, the pillars, the roof (caved in the wreck), its wide windows set in behind gaskets
  const cz = 0.85, cw = 2.3, cd = 2.3, c0 = 1.11, beltY = 1.62, roof = 2.33, cave = wrecked ? 0.2 : 0;
  mesh.box(0, (c0 + beltY) / 2, cz, cw, beltY - c0, cd, ORANGE, coarse ? 0 : 0.05);
  for (const [px, pz] of [[1.1, 1.1], [-1.1, 1.1], [1.1, -1.1], [-1.1, -1.1]] as const) strut(mesh, [px, beltY, cz + pz], [px, roof, cz + pz], 0.09, 0.09, ORANGE);
  mesh.push().translate(0, roof + 0.03, cz);
  mesh.box(0, 0, 0, cw, 0.06, cd, WHITE, 0.02);
  if (cave) mesh.box(0, -cave / 2, 0, cw * 0.6, cave, cd * 0.6, WHITE, 0);
  mesh.pop();
  const gy = (beltY + roof) / 2;
  glazed(mesh, 0, gy, cz + cd / 2, 'z', 2.0, roof - beltY - 0.12, 1, 0.03, !wrecked);
  glazed(mesh, 0, gy, cz - cd / 2, 'z', 1.4, roof - beltY - 0.2, -1, 0.03, !wrecked);
  for (const sx of [1, -1] as const) glazed(mesh, sx * cw / 2, gy, cz, 'x', 1.9, roof - beltY - 0.12, sx, 0.03, !wrecked);
  if (!coarse) mesh.dressing(() => {
    for (const sx of [1, -1]) {
      const x = sx * (cw / 2 + 0.006);
      for (const z of [cz - 0.2, cz + 0.85]) mesh.box(x, (c0 + roof) / 2, z, 0.012, roof - c0 - 0.1, 0.016, DARK, 0);
      mesh.box(x + sx * 0.015, beltY - 0.08, cz - 0.05, 0.03, 0.04, 0.12, STEEL_M, 0);
    }
  });
  for (const sx of [1, -1]) {
    mesh.push().translate(sx * 0.8, 1.45, cz + cd / 2 + 0.01).rotateY(-Math.PI / 2);
    mesh.lathe([[0.0001, -0.02], [0.1, -0.02], [0.1, 0.05], [0.0001, 0.05]], coarse ? 6 : 10, () => (wrecked ? DARK : LAMP));
    mesh.pop();
  }
  if (!wrecked) mesh.dressing(() => mesh.box(0, 2.45, 0.85, 0.14, 0.12, 0.14, LAMP_AMBER, 0));
  // the bed behind the cab, its low sides; the drums standing in it (thrown down in the wreck)
  mesh.box(0, 1.22, -1.45, 2.3, 0.22, 2.2, ORANGE, 0.03);
  for (const sx of [1, -1]) mesh.box(sx * 1.12, 1.48, -1.45, 0.06, 0.32, 2.2, ORANGE, 0);
  mesh.box(0, 1.48, -2.52, 2.3, 0.32, 0.06, ORANGE, 0);
  if (!coarse) for (const sx of [1, -1]) for (const z of [-0.75, -1.45, -2.15]) mesh.box(sx * 1.16, 1.48, z, 0.05, 0.36, 0.06, BLACK, 0);
  const drums: [number, number, number, number][] = wrecked
    ? [[0.5, 1.33, -1.0, 0], [-0.55, 1.62, -1.8, 1]]
    : [[0.5, 1.33, -1.0, 0], [0.5, 1.33, -1.9, 0], [-0.5, 1.33, -1.0, 0], [-0.5, 1.33, -1.9, 0]];
  for (const [x, y, z, lying] of drums) {
    mesh.push().translate(x, y, z).rotateZ(Math.PI / 2);
    if (lying) mesh.rotateY(Math.PI / 2);
    mesh.lathe([[0.0001, 0.0], [0.29, 0.0], [0.29, 0.86], [0.0001, 0.86]], coarse ? 8 : 12, () => RUSTY);
    mesh.pop();
  }
  mesh.pop();
  if (wrecked) mesh.dressing(() => {
    for (const [x, z, a] of [[-1.7, -1.9, 0.6], [1.75, -2.3, -0.3]] as const) {
      mesh.push().translate(x, 0.29, z).rotateY(a);
      mesh.lathe([[0.0001, -0.43], [0.29, -0.43], [0.29, 0.43], [0.0001, 0.43]], coarse ? 8 : 12, () => RUSTY);
      mesh.pop();
    }
  });
}

// -------------------------------------------------------------------------------------------------------------- D8H

// (Lane C, #8 r2, 2026-10-14: graded 0 by the census) the Caterpillar D8H rebuilt in members: each track's belt with its
// grousers on the ground and top runs, the toothed sprocket, the idler, the bottom and carrier rollers on the track
// frame; the hood with its louvred side doors, the radiator guard's bars before the core, the stack and the precleaner;
// the operator's seat, levers and fuel tank under the ROPS canopy on its four posts; the curved moldboard with its
// cutting edge, end bits and back ribs on the push arms, the tilt brace and the lift rams; the ripper. The wreck is its
// own: the right track thrown and lying on the ground beside it, the machine down on its rollers on that side, the
// blade dropped and canted, the canopy's posts buckled with its roof slumped onto the seat, a hood door off.

/** One track: the belt round the sprocket (rear) and the idler (front), its grousers, the rollers and the frame. */
function dozerTrack(mesh: VehicleMesh, x: number, tw: number, coarse: boolean, burnt: boolean): void {
  const zr = -1.35, rr = 0.5, yr = 0.55, zf = 1.35, rf = 0.45, yf = 0.5;
  belt(mesh, x, tw, zr, rr, yr, zf, rf, yf, coarse, BLACK);
  const shoe = burnt ? RUSTY : BLACK;
  if (!coarse) {
    // the grousers across the shoes on the ground run and the top run
    for (let k = 0; k < 14; k++) mesh.box(x, 0.0, zr + 0.1 + k * ((zf - zr - 0.2) / 13), tw, 0.045, 0.045, shoe, 0);
    for (let k = 0; k < 13; k++) {
      const t = (k + 0.5) / 13, z = zr + (zf - zr) * t, y = (yr + rr) + ((yf + rf) - (yr + rr)) * t + 0.06;
      mesh.box(x, y, z, tw, 0.045, 0.045, shoe, 0);
    }
  }
  // the sprocket (toothed) at the rear, the idler at the front, both inboard of the belt's run
  mesh.push().translate(x, yr, zr);
  mesh.lathe([[0.0001, -0.12], [rr * 0.88, -0.12], [rr * 0.88, 0.12], [0.0001, 0.12]], coarse ? 8 : 12, () => (burnt ? RUSTY : STEEL_M));
  if (!coarse) for (let k = 0; k < 10; k++) {
    mesh.push().rotateX((k / 10) * Math.PI * 2);
    mesh.box(0, rr * 0.9, 0, 0.1, 0.1, 0.12, burnt ? RUSTY : STEEL_M, 0);
    mesh.pop();
  }
  mesh.pop();
  mesh.push().translate(x, yf, zf);
  mesh.lathe([[0.0001, -0.2], [rf * 0.86, -0.2], [rf * 0.92, -0.06], [rf * 0.92, 0.06], [rf * 0.86, 0.2], [0.0001, 0.2]], coarse ? 8 : 12,
    () => (burnt ? RUSTY : STEEL_M));
  mesh.pop();
  // the bottom rollers on the track frame and the two carrier rollers over it
  for (let k = 0; k < (coarse ? 3 : 6); k++) {
    const z = zr + 0.45 + k * ((zf - zr - 0.9) / (coarse ? 2 : 5));
    mesh.push().translate(x, 0.2, z);
    mesh.lathe([[0.0001, -0.16], [0.17, -0.16], [0.13, -0.08], [0.13, 0.08], [0.17, 0.16], [0.0001, 0.16]], coarse ? 6 : 10, () => STEEL_M);
    mesh.pop();
  }
  for (const z of [-0.45, 0.45]) {
    mesh.push().translate(x, 0.98, z);
    mesh.lathe([[0.0001, -0.1], [0.1, -0.1], [0.1, 0.1], [0.0001, 0.1]], coarse ? 6 : 8, () => STEEL_M);
    mesh.pop();
  }
  // the track frame between them and the recoil spring's housing ahead
  mesh.box(x, 0.42, 0, 0.32, 0.3, zf - zr - 0.3, burnt ? RUSTY : CAT_YELLOW, 0.02);
  mesh.box(x, 0.5, 0.95, 0.24, 0.22, 0.5, burnt ? RUSTY : CAT_YELLOW, 0);
}

export function dozer(mesh: VehicleMesh, coarse: boolean, wrecked = false): void {
  const tw = 0.56, gauge = 1.07, paint = CAT_YELLOW;
  // the left track on its rollers; the right one thrown in the wreck (its belt laid out on the ground beside it)
  dozerTrack(mesh, gauge, tw, coarse, wrecked);
  if (!wrecked) dozerTrack(mesh, -gauge, tw, coarse, false);
  mesh.push();
  // wrecked: down on its bare right rollers, rolled toward the thrown track
  if (wrecked) mesh.rotateZ(0.035).translate(0, -0.04, 0);
  if (wrecked) {
    // the right side's bare rollers, sprocket and frame, the frame now on the ground
    mesh.push().translate(-gauge, 0.2, 0);
    for (let k = 0; k < 6; k++) {
      mesh.push().translate(0, 0, -0.9 + k * 0.36);
      mesh.lathe([[0.0001, -0.16], [0.17, -0.16], [0.13, -0.08], [0.13, 0.08], [0.17, 0.16], [0.0001, 0.16]], coarse ? 6 : 10, () => RUSTY);
      mesh.pop();
    }
    mesh.pop();
    mesh.push().translate(-gauge, 0.55, -1.35);
    mesh.lathe([[0.0001, -0.12], [0.44, -0.12], [0.44, 0.12], [0.0001, 0.12]], coarse ? 8 : 12, () => RUSTY);
    mesh.pop();
    mesh.box(-gauge, 0.42, 0, 0.32, 0.3, 2.4, RUSTY, 0.02);
  }
  // the main frame, the engine and its hood with louvred side doors (a door off in the wreck), the radiator guard
  mesh.box(0, 0.95, 0.1, 1.5, 0.5, 3.3, BLACK, 0.03);
  mesh.box(0, 1.45, 0.55, 1.0, 0.6, 1.9, ENGINE, 0.03);
  mesh.box(0, 2.27, 0.55, 1.24, 0.08, 2.0, paint, 0.02);
  for (const sx of [1, -1]) {
    const off = wrecked && sx < 0;
    if (!off) {
      mesh.box(sx * 0.6, 1.73, 0.55, 0.05, 1.0, 1.96, paint, 0.01);
      if (!coarse) mesh.dressing(() => {
        for (let k = 0; k < 5; k++) mesh.box(sx * 0.63, 1.45 + k * 0.12, 0.85, 0.02, 0.035, 0.9, DARK, 0);
        mesh.box(sx * 0.63, 1.73, 0.55, 0.015, 0.95, 0.015, DARK, 0);
      });
    }
  }
  // the guard: its posts and top, the bars before the radiator's core (dark, 0.12 m back)
  const gz = 1.62;
  mesh.box(0, 1.75, gz - 0.12, 1.08, 0.95, 0.04, DARK, 0);
  for (const sx of [1, -1]) mesh.box(sx * 0.62, 1.7, gz, 0.14, 1.2, 0.22, paint, 0.02);
  mesh.box(0, 2.32, gz, 1.38, 0.16, 0.24, paint, 0.02);
  mesh.box(0, 1.1, gz + 0.02, 1.38, 0.2, 0.26, paint, 0.02);
  if (!coarse) for (let k = 0; k < 7; k++) mesh.box(-0.45 + k * 0.15, 1.72, gz + 0.04, 0.05, 0.92, 0.05, wrecked ? RUSTY : BLACK, 0);
  // the stack with its muffler, the precleaner bowl beside it
  mesh.tube([[0.32, 2.3, 1.0], [0.32, 3.05, 1.0]], 0.07, coarse ? 6 : 10, wrecked ? RUSTY : BLACK, { caps: true });
  mesh.push().translate(0.32, 2.55, 1.0).rotateZ(Math.PI / 2);
  mesh.lathe([[0.0001, -0.2], [0.13, -0.2], [0.13, 0.2], [0.0001, 0.2]], coarse ? 6 : 10, () => (wrecked ? RUSTY : BLACK));
  mesh.pop();
  mesh.push().translate(-0.3, 2.45, 1.25).rotateZ(Math.PI / 2);
  mesh.lathe([[0.0001, -0.14], [0.1, -0.14], [0.12, 0.0], [0.08, 0.14], [0.0001, 0.14]], coarse ? 6 : 10, () => (wrecked ? DARK : GLASS));
  mesh.pop();
  // the operator's station: the fenders over the tracks, the seat, the levers, the fuel tank behind
  for (const sx of [1, -1]) {
    mesh.box(sx * gauge, 1.18, -0.75, tw + 0.1, 0.05, 1.6, paint, 0.01);
    mesh.box(sx * (gauge + tw / 2 + 0.03), 1.07, -0.75, 0.04, 0.24, 1.6, paint, 0);
  }
  mesh.box(0, 1.35, -0.6, 1.3, 0.3, 1.0, paint, 0.02);
  mesh.box(0, 1.62, -0.75, 0.55, 0.12, 0.5, wrecked ? RUSTY : SEAT, 0.02);
  mesh.box(0, 1.95, -0.98, 0.55, 0.55, 0.1, wrecked ? RUSTY : SEAT, 0.02);
  if (!coarse) for (const sx of [1, -1]) strut(mesh, [sx * 0.22, 1.5, -0.25], [sx * 0.22, 2.0, -0.32], 0.03, 0.03, BLACK);
  mesh.box(0, 1.45, -0.18, 1.1, 0.5, 0.12, BLACK, 0.02);
  mesh.box(0, 1.6, -1.55, 1.5, 0.75, 0.6, paint, 0.04);
  if (!coarse) mesh.dressing(() => mesh.box(0.45, 2.0, -1.55, 0.14, 0.06, 0.14, STEEL_M, 0));
  // the ROPS canopy on its four posts (wrecked: the posts buckled, the roof slumped back onto the tank and the seat)
  const roofY = 3.3;
  const posts: [number, number][] = [[0.7, -0.2], [-0.7, -0.2], [0.7, -1.75], [-0.7, -1.75]];
  for (const [px, pz] of posts) {
    if (!wrecked) { strut(mesh, [px, 1.25, pz], [px, roofY - 0.05, pz], 0.12, 0.12, paint); continue; }
    const front = pz > -1, top = front ? roofY - 0.35 : 2.25, kink: Vec3 = [px * 1.12, front ? 2.3 : 1.85, pz + (front ? -0.12 : 0.18)];
    strut(mesh, [px, 1.25, pz], kink, 0.12, 0.12, paint);
    strut(mesh, kink, [px, top, pz - (front ? 0.05 : 0.0)], 0.12, 0.12, paint);
  }
  mesh.push();
  if (wrecked) mesh.translate(0, roofY - 0.35, -0.2).rotateX(-0.42).rotateZ(-0.08).translate(0, -roofY, 0.2);
  mesh.box(0, roofY, -0.97, 1.6, 0.09, 1.75, paint, 0.02);
  mesh.box(0, roofY - 0.08, -0.97, 1.66, 0.12, 0.08, paint, 0);
  for (const sx of [1, -1]) mesh.box(sx * 0.8, roofY - 0.08, -0.97, 0.08, 0.12, 1.75, paint, 0);
  mesh.pop();
  // the blade on its push arms (the C-frame from the track frames' trunnions), the tilt brace, the lift rams
  const bz = 2.72, bw = 3.86, bh = 1.45, bladeDrop = wrecked ? 0.12 : 0, cant = wrecked ? -0.05 : 0;
  mesh.push().translate(0, -bladeDrop, 0).translate(0, 0, bz).rotateZ(cant).translate(0, 0, -bz);
  // the moldboard: a curved plate (its section an arc concave forward), the cutting edge, the end bits, the top rail
  const nx = coarse ? 2 : 4, ny = coarse ? 4 : 8;
  for (const face of [0, 1]) {
    mesh.grid(nx, ny, (i, j, out) => {
      const x = -bw / 2 + bw * (i / nx), t = j / ny, a = -0.55 + 1.1 * t;
      out[0] = x; out[1] = 0.12 + bh * 0.5 + Math.sin(a) * bh * 0.5 / Math.sin(0.55);
      out[2] = bz - 0.18 + (1 - Math.cos(a)) * 0.55 - (face ? 0.06 : 0);
    }, () => paint, { flip: face === 1 });
  }
  mesh.box(0, 0.1, bz + 0.0, bw, 0.14, 0.12, RUSTY, 0);
  for (const sx of [1, -1]) mesh.box(sx * (bw / 2 - 0.04), 0.82, bz - 0.04, 0.08, 1.45, 0.34, paint, 0);
  mesh.box(0, bh + 0.12, bz - 0.12, bw, 0.12, 0.18, paint, 0);
  if (!coarse) for (let k = 0; k < 5; k++) mesh.box(-1.6 + k * 0.8, 0.82, bz - 0.36, 0.08, 1.2, 0.2, paint, 0);
  mesh.pop();
  for (const sx of [1, -1]) {
    strut(mesh, [sx * (gauge + 0.3), 0.55, -0.1], [sx * 1.55, 0.6 - bladeDrop, bz - 0.32], 0.18, 0.24, paint);
    // the lift rams from the guard's top down to the blade's back
    const top: Vec3 = [sx * 0.62, 2.35, gz - 0.05], foot: Vec3 = [sx * 0.95, 1.3 - bladeDrop, bz - 0.36];
    const mid: Vec3 = [top[0] + (foot[0] - top[0]) * 0.55, top[1] + (foot[1] - top[1]) * 0.55, top[2] + (foot[2] - top[2]) * 0.55];
    mesh.tube([top, mid], 0.1, coarse ? 6 : 10, BLACK, { caps: true });
    mesh.tube([mid, foot], 0.055, coarse ? 6 : 8, wrecked ? RUSTY : STEEL_M, { caps: true });
  }
  strut(mesh, [1.35, 1.2, gz - 0.2], [1.6, 0.95 - bladeDrop, bz - 0.36], 0.1, 0.1, paint);
  // the ripper astern: its beam on the hitch, the shank and tip, the ram
  mesh.box(0, 1.0, -1.95, 1.3, 0.22, 0.28, paint, 0.02);
  for (const sx of [1, -1]) strut(mesh, [sx * 0.5, 0.95, -1.75], [sx * 0.5, 1.0, -2.0], 0.12, 0.16, paint);
  mesh.box(0, 0.62, -2.1, 0.16, 0.95, 0.26, wrecked ? RUSTY : BLACK, 0);
  mesh.box(0, 0.1, -2.02, 0.12, 0.2, 0.3, RUSTY, 0);
  mesh.tube([[0, 1.45, -1.62], [0, 1.08, -1.95]], 0.07, coarse ? 6 : 8, STEEL_M, { caps: true });
  mesh.pop();
  // the wreck's ground (the machine's own frame): the thrown right track laid out beside it, a hood door down
  if (wrecked) mesh.dressing(() => {
    const path: Vec3[] = [];
    for (let k = 0; k <= 8; k++) path.push([-gauge - 0.7 - Math.sin(k * 0.6) * 0.12, 0.035, -2.2 + k * 0.62]);
    mesh.sweep(path, [[-tw / 2, -0.035], [tw / 2, -0.035], [tw / 2, 0.035], [-tw / 2, 0.035]], () => RUSTY,
      { closedSection: true, creases: [0, 1, 2, 3], up: [0, 1, 0] });
    if (!coarse) for (let k = 0; k < 16; k++) {
      const p = path[Math.min(8, Math.floor(k / 2))], q = path[Math.min(8, Math.floor(k / 2) + 1)], t = (k % 2) * 0.5;
      mesh.box(p[0] + (q[0] - p[0]) * t, 0.08, p[2] + (q[2] - p[2]) * t, tw, 0.04, 0.045, RUSTY, 0);
    }
    mesh.push().translate(-1.05, 0.06, 1.55).rotateY(-0.5).rotateZ(1.5);
    mesh.box(0, 0, 0, 0.05, 0.95, 1.4, paint, 0);
    mesh.pop();
  });
}

// ---------------------------------------------------------------------------------------------------------- Haulpak

// (Lane C, #8 r2, 2026-10-14: the census graded the Haulpak 0 — "boxes, painted windows, a paint-swap wreck") the WABCO
// 35C rebuilt in members to the bunker r2 bar: lugged earthmover tyres on bolted disc rims, the frame rails and
// crossmembers, the Hydrair struts over the front spindles, the radiator grille in its surround with its core set back,
// the deck on its railings and the ladder, the cab framed in pillars with its glass set into gaskets behind them (a door,
// hinges and handle, the seat and wheel inside), the dump body's ribbed sides, its headboard and the ribbed canopy over
// the cab, the hoist rams, the tanks on their straps; and a wreck of its own: the tyres burnt off the rims, the chassis
// down on them and rolled, the glass gone from a cab burnt hollow with its roof sagging, the hood's side panel off on
// the ground, a hoist ram failed with the body half raised and twisted, the load spilt.


/** An earthmover tyre with its lugs (axis along x) and its bolted disc rim, its disc on the outboard side (`side`);
 *  burnt: the rim and the bead's wire only. */
function haulWheel(mesh: VehicleMesh, x: number, y: number, z: number, r: number, w: number, coarse: boolean, side: 1 | -1,
  burnt: boolean, seed: number): void {
  const rimR = r * 0.63;
  mesh.push().translate(x, y, z).scale(side, 1, 1);
  if (!burnt) {
    // the tread in the tyre's own surface: the crown's two halves carry their lugs a half pitch apart (the chevron of an
    // E-3 rock tyre), raised 4 cm over the grooves between them
    const segs = coarse ? 14 : 24;
    mesh.lathe([[rimR, -w / 2], [r * 0.9, -w / 2], [r * 0.955, -w * 0.45], [r * 0.985, -w * 0.36], [r * 0.985, -w * 0.04],
      [r * 0.985, w * 0.04], [r * 0.985, w * 0.36], [r * 0.955, w * 0.45], [r * 0.9, w / 2], [rimR, w / 2]],
      segs, () => RUBBER, { flip: true, radial: coarse ? undefined : (k, sIdx) => {
        if (k >= 3 && k <= 4) return sIdx % 2 === 0 ? 1.035 : 1;
        if (k >= 5 && k <= 6) return sIdx % 2 === 1 ? 1.035 : 1;
        return 1;
      } });
  } else {
    // the beads' steel wire, slumped round the rim's flanges where the carcass burnt away
    for (const f of [-1, 1]) {
      const ring: Vec3[] = [];
      const n = coarse ? 8 : 12;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2, rr = rimR * (1.07 + (hashW(k, seed + f) - 0.5) * 0.08);
        ring.push([f * w * 0.43, Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      mesh.tube(ring, 0.028, 4, RUSTY, { closed: true });
    }
  }
  // the rim: its barrel between the bead seats, the dished disc and the hub on the outboard face, the nuts round it
  const rim = burnt ? RUSTY : STEEL_M;
  mesh.lathe([[rimR * 1.06, -w * 0.47], [rimR, -w * 0.44], [rimR, w * 0.44], [rimR * 1.06, w * 0.47]], coarse ? 10 : 12, () => rim, { flip: true });
  mesh.lathe([[0.0001, w * 0.3], [rimR * 0.34, w * 0.3], [rimR * 0.42, w * 0.2], [rimR * 0.97, w * 0.1], [rimR * 0.97, w * 0.02],
    [0.0001, w * 0.02]], coarse ? 8 : 10, () => rim, { flip: true });
  if (!coarse) mesh.dressing(() => {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      mesh.box(w * 0.31, Math.cos(a) * rimR * 0.27, Math.sin(a) * rimR * 0.27, 0.05, 0.055, 0.055, burnt ? RUSTY : BLACK, 0);
    }
  });
  mesh.pop();
}

function hashW(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A straight member between two points (a box section w x d, its long axis along a -> b). */
function strut(mesh: VehicleMesh, a: Vec3, b: Vec3, w: number, d: number, m: Mat): void {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return;
  mesh.push().translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  mesh.rotateY(Math.atan2(dx, dz));
  mesh.rotateX(-Math.atan2(dy, Math.hypot(dx, dz)));
  mesh.box(0, 0, 0, w, d, len, m, 0);
  mesh.pop();
}

/** A pane of glass set `inset` behind a framed opening in the plane normal to `axis`, with its gasket round it. */
function glazed(mesh: VehicleMesh, cx: number, cy: number, cz: number, axis: 'x' | 'z', width: number, height: number, outward: 1 | -1,
  inset: number, glass: boolean): void {
  const t = 0.025;
  if (!glass) return; // a burnt cab: the glass and its rubber gone, the opening empty between the pillars
  if (axis === 'z') {
    const z = cz - outward * inset;
    if (glass) mesh.box(cx, cy, z, width, height, 0.02, GLASS, 0);
    mesh.dressing(() => {
      mesh.box(cx, cy + height / 2 + t / 2, z, width + 2 * t, t, 0.04, GASKET, 0);
      mesh.box(cx, cy - height / 2 - t / 2, z, width + 2 * t, t, 0.04, GASKET, 0);
      for (const s of [-1, 1]) mesh.box(cx + s * (width / 2 + t / 2), cy, z, t, height, 0.04, GASKET, 0);
    });
  } else {
    const x = cx - outward * inset;
    if (glass) mesh.box(x, cy, cz, 0.02, height, width, GLASS, 0);
    mesh.dressing(() => {
      mesh.box(x, cy + height / 2 + t / 2, cz, 0.04, t, width + 2 * t, GASKET, 0);
      mesh.box(x, cy - height / 2 - t / 2, cz, 0.04, t, width + 2 * t, GASKET, 0);
      for (const s of [-1, 1]) mesh.box(x, cy, cz + s * (width / 2 + t / 2), 0.04, height, t, GASKET, 0);
    });
  }
}

/** The WABCO 35C Haulpak (see above); `laden` heaps ore in the body, `wrecked` builds its burnt-out wreck. */
export function haulpak(mesh: VehicleMesh, coarse: boolean, laden: boolean, wrecked = false): void {
  const R = 0.95, W = 0.62, rimR = R * 0.63;
  const paint = CAT_YELLOW;
  // ---- the wheels: on their tyres; wrecked, on the rims (the chassis comes down by the tyres' depth and rolls a little)
  const axleY = wrecked ? rimR + 0.03 : R;
  const wheels: [number, number, number][] = [];
  for (const sx of [1, -1]) wheels.push([sx * 1.65, 2.45, W], [sx * 1.42, -1.75, W], [sx * 1.98, -1.75, W * 0.95]);
  wheels.forEach(([x, z, w], k) => haulWheel(mesh, x, axleY, z, R, w, coarse, x > 0 ? 1 : -1, wrecked, 11 + k));
  const drop = R - axleY;
  mesh.push();
  if (wrecked) mesh.translate(0, -drop, 0).rotateZ(0.035).rotateX(-0.012);
  // ---- the frame: two rails, crossmembers, the front bumper on its horns, the tow hooks, the rear horns and lamps
  for (const sx of [1, -1]) mesh.box(sx * 0.58, 1.25, -0.1, 0.26, 0.52, 6.9, BLACK, 0.02);
  for (const z of [3.05, 1.2, -0.4, -2.6, -3.35]) mesh.box(0, 1.22, z, 0.92, 0.36, 0.24, BLACK, 0);
  mesh.box(0, 1.0, 3.48, 3.5, 0.38, 0.26, BLACK, 0.03);
  for (const sx of [1, -1]) {
    mesh.box(sx * 1.62, 1.0, 3.48, 0.26, 0.5, 0.3, BLACK, 0.02);
    if (!coarse) mesh.dressing(() => mesh.box(sx * 0.4, 0.9, 3.63, 0.12, 0.2, 0.08, RUSTY, 0));
  }
  for (const sx of [1, -1]) mesh.dressing(() => mesh.box(sx * 0.58, 1.05, -3.6, 0.2, 0.14, 0.04, wrecked ? DARK : LAMP_AMBER, 0));
  // the front axle beam and spindles, the Hydrair struts from them up to the frame's front horns
  mesh.box(0, R * 0.98, 2.45, 2.6, 0.32, 0.34, BLACK, 0.03);
  for (const sx of [1, -1]) {
    mesh.tube([[sx * 1.08, 1.05, 2.45], [sx * 0.98, 1.82, 2.45]], 0.09, coarse ? 6 : 10, STEEL_M, { caps: true });
    mesh.tube([[sx * 0.98, 1.72, 2.45], [sx * 0.9, 2.42, 2.45]], 0.15, coarse ? 6 : 10, BLACK, { caps: true });
  }
  // the rear axle housing, the differential and the planetary hubs outboard of the duals
  mesh.box(0, R * 0.98, -1.75, 3.3, 0.46, 0.5, BLACK, 0.04);
  mesh.box(0, R * 0.98, -1.75, 0.9, 0.78, 0.8, BLACK, coarse ? 0 : 0.12);
  for (const sx of [1, -1]) {
    mesh.push().translate(sx * 2.25, R * 0.98, -1.75).scale(sx, 1, 1);
    mesh.lathe([[0.0001, -0.08], [0.3, -0.08], [0.3, 0.02], [0.22, 0.1], [0.0001, 0.1]], coarse ? 8 : 10, () => (wrecked ? RUSTY : STEEL_M));
    mesh.pop();
  }
  // the tanks on their straps outboard of the rails: diesel on the left, hydraulic oil on the right
  for (const sx of [1, -1]) {
    mesh.box(sx * 1.08, 1.32, 0.35, 0.7, 0.72, 1.5, sx > 0 ? BLACK : paint, coarse ? 0 : 0.1);
    if (!coarse) mesh.dressing(() => {
      for (const z of [-0.15, 0.85]) mesh.box(sx * 1.08, 1.32, z, 0.74, 0.76, 0.05, DARK, 0);
      mesh.box(sx * 1.08, 1.72, 0.85, 0.16, 0.08, 0.16, STEEL_M, 0);
    });
  }
  // ---- the engine under its hood, the radiator grille in its surround (the core dark behind the bars)
  const hoodZ0 = 1.8, hoodZ1 = 3.4, hoodX = 0.82, hoodY0 = 1.5, hoodY1 = 2.5;
  mesh.box(0, (hoodY0 + hoodY1) / 2 + 0.05, hoodZ1 - 0.06, hoodX * 2, hoodY1 - hoodY0 + 0.1, 0.12, paint, 0.02);
  mesh.box(0, hoodY1 - 0.04, (hoodZ0 + hoodZ1) / 2, hoodX * 2, 0.08, hoodZ1 - hoodZ0, paint, 0.02);
  // the side panels, louvred; wrecked, the left one is off (it lies on the ground below) and the engine shows
  for (const sx of [1, -1]) {
    const off = wrecked && sx > 0;
    if (!off) {
      mesh.box(sx * (hoodX - 0.03), (hoodY0 + hoodY1) / 2, (hoodZ0 + hoodZ1) / 2 - 0.06, 0.06, hoodY1 - hoodY0, hoodZ1 - hoodZ0 - 0.12, paint, 0.01);
      if (!coarse) mesh.dressing(() => {
        for (let k = 0; k < 4; k++) mesh.box(sx * (hoodX + 0.005), hoodY0 + 0.35 + k * 0.13, 2.85, 0.02, 0.035, 0.8, DARK, 0);
      });
    }
  }
  // the engine block, its head and the radiator's back (seen through a missing panel or under the hood's edge)
  mesh.box(0, 1.75, 2.35, 1.1, 0.7, 1.4, ENGINE, 0.04);
  mesh.box(0, 2.18, 2.35, 0.8, 0.16, 1.2, ENGINE, 0);
  // the grille: a heavy surround, horizontal bars, the core set 0.12 m back behind them
  const gz = hoodZ1 + 0.02, gw = 1.36, gh = 0.86, gy = 1.98;
  mesh.box(0, gy, gz - 0.14, gw, gh, 0.04, DARK, 0);
  for (const s of [-1, 1]) {
    mesh.box(s * (gw / 2 + 0.06), gy, gz, 0.12, gh + 0.24, 0.1, paint, 0.02);
    mesh.box(0, gy + s * (gh / 2 + 0.06), gz, gw + 0.24, 0.12, 0.1, paint, 0.02);
  }
  if (!coarse) for (let k = 0; k < 7; k++) mesh.box(0, gy - gh / 2 + 0.07 + k * (gh - 0.14) / 6, gz - 0.02, gw, 0.04, 0.05, wrecked ? RUSTY : BLACK, 0);
  // the exhaust stack behind the hood with its rain cap
  mesh.tube([[-0.55, hoodY1, 1.92], [-0.55, 3.55, 1.92]], 0.085, coarse ? 6 : 10, wrecked ? RUSTY : BLACK, { caps: true });
  if (!coarse) mesh.box(-0.55, 3.6, 1.97, 0.2, 0.03, 0.22, wrecked ? RUSTY : BLACK, 0);
  // ---- the deck over the engine and the front wheels, its railings, the ladder down the front
  const deckY = 2.55, deckZ0 = 1.52, deckZ1 = 3.5;
  mesh.box(0, deckY, (deckZ0 + deckZ1) / 2, 4.1, 0.1, deckZ1 - deckZ0, paint, 0.02);
  if (!coarse) mesh.dressing(() => {
    for (let k = 0; k < 9; k++) mesh.box(-1.8 + k * 0.45, deckY + 0.055, (deckZ0 + deckZ1) / 2, 0.03, 0.012, deckZ1 - deckZ0 - 0.1, DARK, 0);
  });
  for (const sx of [1, -1]) mesh.box(sx * 1.95, deckY - 0.28, (deckZ0 + deckZ1) / 2, 0.12, 0.46, deckZ1 - deckZ0, paint, 0.02);
  const railY0 = deckY + 0.05, railTop = deckY + 1.0;
  const posts: [number, number][] = [[-1.98, 3.42], [-1.0, 3.42], [-0.05, 3.42], [0.62, 3.42], [-1.98, 2.5], [-1.98, 1.6]];
  posts.forEach(([x, z], k) => {
    const lean = wrecked && (k === 1 || k === 2) ? 0.16 * (k === 1 ? 1 : 0.6) : 0;
    strut(mesh, [x, railY0, z], [x, railTop, z + lean], 0.05, 0.05, paint);
  });
  const leanAt = (x: number) => (wrecked && x > -1.5 && x < 0.3 ? 0.13 : 0);
  for (const y of [railTop, deckY + 0.55]) {
    const fr = y === railTop ? 1 : 0.55;
    strut(mesh, [-1.98, y, 3.42], [-1.0, y, 3.42 + leanAt(-1.0) * fr], 0.045, 0.045, paint);
    strut(mesh, [-1.0, y, 3.42 + leanAt(-1.0) * fr], [-0.05, y, 3.42 + leanAt(-0.05) * fr * 0.6], 0.045, 0.045, paint);
    strut(mesh, [-0.05, y, 3.42 + leanAt(-0.05) * fr * 0.6], [0.62, y, 3.42], 0.045, 0.045, paint);
    strut(mesh, [-1.98, y, 3.42], [-1.98, y, 1.6], 0.045, 0.045, paint);
  }
  // the ladder from the bumper to the deck's right front, its stiles and rungs
  for (const s of [-1, 1]) strut(mesh, [-1.32 + s * 0.24, 0.55, 3.66], [-1.32 + s * 0.24, deckY, 3.52], 0.05, 0.05, paint);
  if (!coarse) for (let k = 0; k < 6; k++) {
    const t = (k + 0.5) / 6;
    mesh.box(-1.32, 0.55 + (deckY - 0.55) * t, 3.66 - 0.14 * t, 0.48, 0.035, 0.05, BLACK, 0);
  }
  // ---- the cab on the left deck: the lower panels, the pillars, the roof, the glass set back behind its gaskets
  const cx = 1.35, cz = 2.4, cw = 1.3, cd = 1.5, c0 = deckY + 0.05, belt = c0 + 0.45, roofY = c0 + 1.28;
  const sag = wrecked ? 0.16 : 0;
  mesh.box(cx, (c0 + belt) / 2, cz, cw, belt - c0, cd, paint, 0.02);
  const pillar = 0.08, hx = cw / 2 - pillar / 2, hz = cd / 2 - pillar / 2;
  for (const [px, pz] of [[hx, hz], [-hx, hz], [hx, -hz], [-hx, -hz]] as const) {
    const bent = wrecked && px > 0 && pz > 0;
    if (bent) {
      strut(mesh, [cx + px, belt, cz + pz], [cx + px + 0.06, (belt + roofY) / 2, cz + pz + 0.04], pillar, pillar, paint);
      strut(mesh, [cx + px + 0.06, (belt + roofY) / 2, cz + pz + 0.04], [cx + px, roofY - sag, cz + pz], pillar, pillar, paint);
    } else {
      strut(mesh, [cx + px, belt, cz + pz], [cx + px, roofY - (px > 0 ? sag : 0), cz + pz], pillar, pillar, paint);
    }
  }
  // the roof (wrecked: down on the burnt side), its drip rails
  mesh.push().translate(cx, roofY + 0.04 - sag / 2, cz).rotateZ(wrecked ? -Math.atan2(sag, cw) : 0);
  mesh.box(0, 0, 0, cw + 0.08, 0.08, cd + 0.08, paint, 0.025);
  if (!coarse) mesh.dressing(() => { for (const s of [-1, 1]) mesh.box(s * (cw / 2 + 0.045), -0.02, 0, 0.025, 0.04, cd + 0.08, DARK, 0); });
  mesh.pop();
  // the glass behind the pillars: the windscreen, the outer side (the door's window), the rear, the inner side
  const gh2 = roofY - belt - 0.14, gy2 = (belt + roofY) / 2 - 0.02 - sag / 3;
  glazed(mesh, cx, gy2, cz + cd / 2, 'z', cw - 0.2, gh2, 1, 0.035, !wrecked);
  glazed(mesh, cx, gy2, cz - cd / 2, 'z', cw - 0.2, gh2, -1, 0.035, !wrecked);
  glazed(mesh, cx + cw / 2, gy2, cz, 'x', cd - 0.2, gh2, 1, 0.035, !wrecked);
  glazed(mesh, cx - cw / 2, gy2, cz, 'x', cd - 0.2, gh2, -1, 0.035, !wrecked);
  // the door in the outer side: its seams, the hinges forward, the handle aft; the step below it
  if (!coarse) mesh.dressing(() => {
    const dx = cx + cw / 2 + 0.006, dz0 = cz - 0.5, dz1 = cz + 0.5;
    for (const z of [dz0, dz1]) mesh.box(dx, (c0 + roofY) / 2, z, 0.012, roofY - c0 - 0.06, 0.018, DARK, 0);
    mesh.box(dx, c0 + 0.03, cz, 0.012, 0.018, 1.0, DARK, 0);
    for (const y of [c0 + 0.25, roofY - 0.25]) mesh.box(dx + 0.012, y, dz1 - 0.04, 0.03, 0.1, 0.06, BLACK, 0);
    mesh.box(dx + 0.015, belt - 0.05, dz0 + 0.12, 0.03, 0.04, 0.14, STEEL_M, 0);
    // the wipers on the windscreen
    if (!wrecked) for (const s of [-1, 1]) strut(mesh, [cx + s * 0.25, belt + 0.06, cz + cd / 2 - 0.02], [cx + s * 0.1, belt + 0.5, cz + cd / 2 - 0.02], 0.015, 0.015, DARK);
  });
  // inside: the seat, the wheel on its column, the dash (burnt: the seat's frame only)
  mesh.box(cx + 0.1, c0 + 0.55, cz - 0.25, 0.5, 0.12, 0.5, wrecked ? RUSTY : SEAT, 0);
  mesh.box(cx + 0.1, c0 + 0.9, cz - 0.48, 0.5, 0.6, 0.1, wrecked ? RUSTY : SEAT, 0);
  mesh.box(cx, belt + 0.02, cz + cd / 2 - 0.2, cw - 0.16, 0.12, 0.3, BLACK, 0.02);
  if (!coarse) {
    mesh.push().translate(cx + 0.1, belt + 0.25, cz + 0.32).rotateX(-0.7);
    mesh.push().rotateZ(Math.PI / 2);
    mesh.lathe([[0.2, -0.015], [0.22, 0], [0.2, 0.015], [0.18, 0]], 14, () => BLACK);
    mesh.pop();
    mesh.pop();
  }
  // the mirror out on its arm from the deck's left front corner
  mesh.outboard(() => {
    strut(mesh, [2.0, deckY + 0.3, 3.4], [2.25, deckY + 0.95, 3.45], 0.04, 0.04, BLACK);
    mesh.box(2.27, deckY + 1.12, 3.45, 0.06, 0.38, 0.24, BLACK, 0);
  });
  // headlamps in their bezels on the deck's front face
  for (const sx of [1, -1]) {
    mesh.push().translate(sx * 1.45, deckY - 0.22, deckZ1 + 0.02).rotateY(-Math.PI / 2);
    mesh.lathe([[0.0001, -0.02], [0.13, -0.02], [0.13, 0.06], [0.0001, 0.06]], coarse ? 8 : 10, () => (wrecked ? DARK : LAMP));
    mesh.pop();
    if (!coarse) mesh.box(sx * 1.45, deckY - 0.22, deckZ1 - 0.01, 0.3, 0.3, 0.05, BLACK, 0);
  }
  // ---- the dump body on its sills and the tail hinge, the hoist rams; wrecked: one ram failed, the body half raised
  //      on the other and twisted, the load spilt behind it
  const fy = 2.05, tail = -3.95, front = 1.45, hingeZ = -3.35, hingeY = 1.9;
  const raise = wrecked ? 0.105 : 0, twist = wrecked ? -0.05 : 0;
  // the hoist rams: from the frame forward to the body's floor; wrecked, the right one extended, the left one broken
  const ramFoot: Vec3[] = [[0.92, 1.42, 1.0], [-0.92, 1.42, 1.0]];
  const ramHead = (sx: number): Vec3 => {
    const z = -0.5, y = fy - 0.02;
    if (!wrecked) return [sx * 0.92, y, z];
    const dz = z - hingeZ, dy = y - hingeY;
    return [sx * 0.92, hingeY + dy * Math.cos(raise) + dz * Math.sin(raise) + sx * 0.92 * Math.sin(twist),
      hingeZ + dz * Math.cos(raise) - dy * Math.sin(raise)];
  };
  ramFoot.forEach((foot, k) => {
    const sx = k === 0 ? 1 : -1, head = ramHead(sx);
    const broken = wrecked && sx > 0;
    const mid: Vec3 = [foot[0], foot[1] + (head[1] - foot[1]) * 0.55, foot[2] + (head[2] - foot[2]) * 0.55];
    mesh.tube([foot, mid], 0.13, coarse ? 6 : 10, BLACK, { caps: true });
    if (!broken) mesh.tube([mid, head], 0.08, coarse ? 6 : 10, wrecked ? RUSTY : STEEL_M, { caps: true });
    else mesh.tube([mid, [mid[0] + 0.05, mid[1] - 0.25, mid[2] - 0.55]], 0.08, coarse ? 6 : 10, RUSTY, { caps: true });
  });
  for (const sx of [1, -1]) mesh.box(sx * 0.58, hingeY, hingeZ, 0.34, 0.3, 0.3, BLACK, 0.03);
  mesh.push().translate(0, hingeY, hingeZ).rotateZ(twist).rotateX(-raise).translate(0, -hingeY, -hingeZ);
  // the floor and its sills, the tail rising, the sides with their ribs and top rails, the headboard, the canopy
  mesh.box(0, fy + 0.12, (tail + 0.6 + front) / 2, 3.9, 0.24, front - tail - 0.6, paint, 0.03);
  mesh.push().translate(0, fy + 0.12, tail + 0.3).rotateX(-0.42);
  mesh.box(0, 0.09, 0, 3.9, 0.24, 0.66, paint, 0.03);
  mesh.pop();
  for (const sx of [1, -1]) mesh.box(sx * 0.58, fy - 0.08, (tail + front) / 2, 0.24, 0.18, front - tail - 0.4, BLACK, 0.02);
  const sideTop = fy + 1.75;
  for (const sx of [1, -1]) {
    mesh.box(sx * 1.93, (fy + sideTop) / 2 + 0.1, (tail + front) / 2 + 0.15, 0.07, sideTop - fy - 0.2, front - tail - 0.3, paint, 0.01);
    mesh.box(sx * 1.97, sideTop, (tail + front) / 2 + 0.15, 0.17, 0.17, front - tail - 0.3, paint, 0.03);
    const ribs = coarse ? 3 : 6;
    for (let k = 0; k < ribs; k++) {
      const z = tail + 0.7 + k * (front - tail - 1.2) / (ribs - 1);
      mesh.box(sx * 2.02, (fy + sideTop) / 2 + 0.05, z, 0.1, sideTop - fy - 0.15, 0.13, paint, 0);
    }
    mesh.box(sx * 2.0, fy + 0.62, (tail + front) / 2 + 0.15, 0.08, 0.12, front - tail - 0.5, paint, 0.02);
  }
  const canopyY = 4.42, canopyZ1 = 3.62;
  mesh.box(0, (fy + canopyY) / 2 + 0.08, front, 3.9, canopyY - fy - 0.1, 0.16, paint, 0.02);
  for (let k = 0; k < (coarse ? 3 : 5); k++) mesh.box(-1.5 + k * (3.0 / (coarse ? 2 : 4)), (fy + canopyY) / 2 + 0.1, front + 0.11, 0.12, canopyY - fy - 0.4, 0.1, paint, 0);
  mesh.box(0, canopyY, (front + canopyZ1) / 2, 3.9, 0.09, canopyZ1 - front, paint, 0.02);
  for (let k = 0; k < (coarse ? 3 : 6); k++) {
    const x = -1.75 + k * (3.5 / (coarse ? 2 : 5));
    mesh.box(x, canopyY - 0.11, (front + canopyZ1) / 2, 0.08, 0.14, canopyZ1 - front - 0.05, paint, 0);
  }
  mesh.box(0, canopyY - 0.05, canopyZ1, 3.9, 0.2, 0.1, paint, 0);
  // the load: a heaped mound of broken ore, darker and lighter by lumps (wrecked: most of it spilt)
  if (laden || wrecked) {
    const nx = coarse ? 5 : 8, nz = coarse ? 6 : 12, x0 = -1.84, x1 = 1.84, z0 = tail + 0.45, z1 = front - 0.12;
    const peak = wrecked ? 0.45 : 1.25;
    mesh.grid(nx, nz, (i, j, out) => {
      const u = i / nx, v = j / nz, x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * v;
      const ex = 1 - Math.pow(2 * u - 1, 4), ez = 1 - Math.pow(2 * v - 1, 4);
      const lump = (hashW(i * 31 + j, 77) - 0.5) * 0.18 * ex * ez;
      const slope = wrecked ? (1 - v) * 0.2 : 0;
      out[0] = x; out[1] = fy + 0.25 + (peak * Math.sqrt(Math.max(0, ex * ez)) + lump) * (1 - slope); out[2] = z;
    }, (i, j) => (hashW(i * 7 + j * 13, 5) < 0.4 ? HAUL_ORE_DARK : ORE_LOAD), { flip: true });
  }
  mesh.pop();
  mesh.pop();
  // the wreck's ground (the vehicle's own frame, not the slumped chassis'): the hood's left side panel thrown down by the
  // front wheel, the spilt ore behind the tail
  if (wrecked) mesh.dressing(() => {
    mesh.push().translate(2.55, 0.09, 1.55).rotateY(0.35).rotateZ(1.45);
    mesh.box(0, 0, 0, 0.06, 0.95, 1.45, paint, 0);
    mesh.pop();
    const nx = coarse ? 5 : 9, nz = coarse ? 4 : 6;
    mesh.grid(nx, nz, (i, j, out) => {
      const u = i / nx, v = j / nz, x = -1.6 + 3.2 * u, z = tail - 0.05 - 0.9 * v;
      const e = (1 - Math.pow(2 * u - 1, 2)) * (1 - v);
      out[0] = x; out[1] = Math.max(0, 0.42 * e + (hashW(i * 5 + j, 91) - 0.5) * 0.1 * e); out[2] = z;
    }, (i, j) => (hashW(i + j * 3, 9) < 0.45 ? HAUL_ORE_DARK : ORE_LOAD), { flip: true });
  });
}
