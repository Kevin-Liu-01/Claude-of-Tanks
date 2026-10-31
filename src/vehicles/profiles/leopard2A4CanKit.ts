// The kit of the Leopard 2A4M CAN (leo2a4m_can): the MEXAS-style cheek and flank appliqué, the two-band module skirt, the
// stand-off cassettes, the slat cages on hull and turret, the Canadian smoke, the FLW 200 and the stowage (inventory
// leo2a4m_can.md), re-seated on the release hull and the 2A4 turret (leopard2A4Family.ts; the turret draws the C6).
//
// The build it replaces (leopard.ts buildLeo2A4MSteps, its wrap* helpers and leoFLW200) drew this kit on the old hull and
// the pre-wedge welded turret, mirrored (its driver and commander at +X): every asymmetric item is mirrored here, so the
// real vehicle's right stays the world's right (-X). Hull metres on the hull (+Z forward, y up from the ground); turret
// metres from the ring's centre on the deck (leopard2A4FamilyArmor.ts LEO2A4_TURRET). Only the add-on armour is armour
// (addExternalArmor: the cheek wedges, the flank modules, the skirt modules and panels, the stand-off cassettes, the
// glacis blocks, the belly plate); cages, rails, racks, bins, stowage, tools, lights, smoke, antennas and the station are
// equipment or detail.
//
// The hull leaves its own skirts and their hanging rails off for this id (leopard2Hull.ts skirts: 'none'): the CAN's side
// stack hangs from rails carried on the sponson's wall (SIDE).
import * as THREE from 'three';
import { KIT, FITTINGS, convexSlab } from './kit.ts';
import { tankSeedId } from '../tankIdAliases.ts';
import { addLeopardFlw200, turretRoofY } from './leopard2A4Flw200.ts';
import { leopard2A4FaceZ } from './leopard2A4Turret.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { LEO2A4_CHEEK_FRONT, LEO2A4_TURRET } from '../leopard2A4FamilyArmor.ts';
import { cheekCornerZ } from '../leopard2CheekFrontDatums.ts';
import { HULL_SURFACES as HS, TURRET_SURFACES as TS, deckFrame, deckY } from './leopard2A4KitParts.ts';
import { laidCable, type Leopard2A4KitContext } from './leopard2A4Kit.ts';

const T = LEO2A4_TURRET;
const SIDES = [-1, 1] as const;

// ---------------------------------------------------------------------------------------------------------------------
// Hull
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The side stack, inboard to outboard (|x|). The CAN's mounting rails stand off the sponson's wall on gussets; the fore
 * module course and the rear paneled course hang from them just outside the track (its outer edge 1.68: their inner faces
 * on the front mudguard's outer face, 4 cm of air), the stand-off cassettes and the slat cage hang from the shelf over them.
 */
const SIDE = Object.freeze({
  wall: HS.sponsonX,                 // the sponson's outer wall
  railY0: 1.38, railY1: 1.402,       // the CAN's mounting rail plates
  shelfY1: 1.437,                    // the shelf (inboard lip and cage seat) on the rails
  modIn: 1.72, modOut: 1.765,        // the fore module course (its proud tiles to 1.775)
  modY0: 0.88,
  rearIn: 1.72, rearOut: 1.767,      // the rear paneled course
  rearEndZ: 0.33,                    // where it meets the fore course
  casIn: 1.78, casOut: 1.84,         // the stand-off cassettes (clear of the tiles' seam ticks)
  cageOut: 1.95,                     // the slat cage's rails
  hemFoot: 0.55,                     // the rubber hems' foot
});

/** The hull's top at (x, z): the glacis and decks over the tub, the sponsons' tops (held at 1.42 to z 3.30) outboard. */
function hullTopY(x: number, z: number): number {
  const d = deckY(z);
  return Math.abs(x) > 0.98 && z <= 3.30 ? Math.max(d, 1.42) : d;
}

/** A part laid on the glacis or deck at (x, z), lifted `lift` along the plate's normal (local offsets ride the slope). */
function onDeck(P: TankBuilderPort, bucket: string, geometry: THREE.BufferGeometry, x: number, z: number, lift: number,
  external = false): void {
  const f = deckFrame(x, z);
  const g = KIT.xform(geometry, 0, lift, 0);
  if (external) P.addExternalArmor('hull', g, x, f.point.y, z, f.rotation.x, 0, 0);
  else P.add(bucket, g, x, f.point.y, z, f.rotation.x, 0, 0);
}

/** The mine-protection belly plate (2A4M kit) under the flat belly, short of the lower glacis's rise from z 2.45. */
function minePlate(P: TankBuilderPort): void {
  const { box } = KIT;
  const y1 = HS.bellyY, y0 = y1 - 0.06, z0 = -2.30, z1 = 2.40;
  P.addExternalArmor('hull', box(1.86, y1 - y0, z1 - z0), 0, (y0 + y1) / 2, (z0 + z1) / 2);
  P.add('hullDark', box(1.90, 0.02, 0.06), 0, y0 - 0.01, z1 - 0.03);                       // the front lip under its edge
  for (const s of SIDES) {
    P.add('hullDark', box(0.03, 0.05, 4.40), s * 0.945, y1 - 0.035, (z0 + z1) / 2);       // side rails
    for (let k = 0; k < 5; k++) P.add('hullDetail', box(0.05, 0.016, 0.05), s * 0.80, y0 - 0.008, 2.15 - k * 1.05);
  }
}

/**
 * The fore course (the 2A4M CAN's two bands: five armour modules a side over a rubber hem), each module's face an
 * ERA-style grid of two rows of tiles, some proud, one pulled on modules 2 and 4; the hem hangs under each module.
 */
function foreCourse(P: TankBuilderPort, s: number): void {
  const { box } = KIT;
  const y0 = SIDE.modY0, y1 = SIDE.railY0, yc = (y0 + y1) / 2, face = SIDE.modOut, mid = (SIDE.modIn + SIDE.modOut) / 2;
  for (let i = 0; i < 5; i++) {
    const short = i === 0, z = short ? 3.39 : 2.85 - (i - 1) * 0.72, len = short ? 0.42 : 0.66;
    P.addExternalArmor('hull', box(SIDE.modOut - SIDE.modIn, y1 - y0, len), s * mid, yc, z);
    for (const dz of [-len * 0.36, len * 0.36]) P.add('hullDetail', box(0.06, 0.05, 0.05), s * (mid + 0.003), y1 - 0.01, z + dz);
    // the grid: columns 0.22 (0.21 on the short module) wide, two rows; joints proud of the face, tiles prouder
    const cols = short ? [-0.105, 0.105] : [-0.22, 0, 0.22], cw = short ? 0.21 : 0.22;
    for (let c = 1; c < cols.length; c++) {
      P.add('hullDark', box(0.006, y1 - y0 - 0.06, 0.014), s * (face + 0.0015), yc, z + (cols[c - 1] + cols[c]) / 2);
    }
    P.add('hullDark', box(0.006, 0.014, len - 0.06), s * (face + 0.0015), yc, z);
    const proud: ReadonlyArray<readonly [number, number]> = short ? [[1, 0]] : i % 2 ? [[1, 2], [-1, 0], [1, 1]] : [[-1, 2], [1, 0]];
    for (const [row, col] of proud) {
      const ty = yc + row * 0.12, tz = z + cols[col];
      P.addExternalArmor('hull', box(0.010, 0.20, cw - 0.03), s * (face + 0.005), ty, tz);
      P.add('hullDark', box(0.004, 0.16, 0.014), s * (face + 0.012), ty, tz);                  // the tile's seam tick
    }
    if (i === 2 || i === 4) {
      // a pulled tile: its dark backing where the cassette came off
      P.add('hullDark', box(0.003, 0.20, cw - 0.03), s * (face + 0.0015), yc - 0.12, z + cols[i === 2 ? 1 : 0]);
    }
    P.hangMudguard('leo2a4m-can-skirt-hem', 'hullRubber', box(0.028, y0 - SIDE.hemFoot, len), s * (SIDE.modIn + 0.021),
      (y0 + SIDE.hemFoot) / 2, z);
  }
  P.add('hullDark', box(0.012, 0.024, 3.24), s * (face - 0.003), y0, 1.98);                   // the hems' hanger strip
}

/** The rear paneled course (six bays: a proud mounting band over a recessed panel and a rubber hem), outboard of the aft panels. */
function rearCourse(P: TankBuilderPort, s: number): void {
  const { box } = KIT;
  const z0 = -2.82, z1 = SIDE.rearEndZ, n = 6, L = (z1 - z0) / n, band0 = 1.25, panel0 = 0.86;
  const x0 = SIDE.rearIn, x1 = SIDE.rearOut, xp = x0 + 0.035;
  for (let k = 0; k < n; k++) {
    const zc = z0 + L * (k + 0.5);
    P.addExternalArmor('hull', box(x1 - x0, SIDE.railY0 - band0, L - 0.02), s * (x0 + x1) / 2, (SIDE.railY0 + band0) / 2, zc);
    P.addExternalArmor('hull', box(xp - x0, band0 - panel0, L - 0.02), s * (x0 + xp) / 2, (band0 + panel0) / 2, zc);
    P.hangMudguard('leo2a4m-can-skirt-hem', 'hullRubber', box(0.028, panel0 - SIDE.hemFoot, L - 0.02), s * (x0 + 0.017),
      (panel0 + SIDE.hemFoot) / 2, zc);
    P.add('hullDark', box(0.010, 0.06, 0.05), s * (x1 + 0.005), (SIDE.railY0 + band0) / 2, zc);   // the band's latch
  }
  for (let k = 1; k < n; k++) P.add('hullDark', box(0.012, SIDE.railY0 - panel0 - 0.02, 0.014), s * (xp + 0.0035), (SIDE.railY0 + panel0) / 2, z0 + L * k);
  P.add('hullDark', box(0.010, 0.014, z1 - z0 - 0.04), s * (xp + 0.005), band0 - 0.007, (z0 + z1) / 2);   // the band's shadow line
}

/**
 * The mounting rails the courses hang from (on the hull's hanging rails, against the sponson), the seven stand-off
 * cassettes (the owner's 5f26bfde restore) with their dividers, shoes and the recessed bridges between them, the shelf
 * that ties them to the sponson, and the five-bay slat cage on its seat.
 */
function sideArmour(P: TankBuilderPort, s: number): void {
  const { box } = KIT;
  const w = SIDE.wall, ry = (SIDE.railY0 + SIDE.railY1) / 2, rh = SIDE.railY1 - SIDE.railY0;
  // the rails: the fore one to the modules' face (outboard of the front mudguard over the idler), the rear one to the
  // rear course's face
  P.add('hullDetail', box(SIDE.modOut - w, rh, 3.16 - 0.36), s * (w + SIDE.modOut) / 2, ry, (0.36 + 3.16) / 2);
  P.add('hullDetail', box(SIDE.modOut - HS.mudguard.x1, rh, 3.60 - 3.16), s * (HS.mudguard.x1 + SIDE.modOut) / 2, ry, (3.16 + 3.60) / 2);
  P.add('hullDetail', box(SIDE.rearOut + 0.005 - w, rh, 0.36 + 2.85), s * (w + SIDE.rearOut + 0.005) / 2, ry, (0.36 - 2.85) / 2);
  // the rails' gussets on the sponson's wall, under the plates, above the track
  for (let k = 0; k < 13; k++) P.add('hullDetail', box(0.05, 0.05, 0.02), s * (w + 0.025), SIDE.railY0 - 0.025, -2.80 + k * 0.49);
  // the shelf: the inboard lip from the sponson to the cassettes' face, the cage's seat outboard of it
  const sh0 = SIDE.railY1, sh = SIDE.shelfY1 - sh0, cage0 = -2.95, cage1 = 1.30;
  P.add('hullDetail', box(SIDE.casOut - w, sh, 2.77 - cage0), s * (w + SIDE.casOut) / 2, sh0 + sh / 2, (cage0 + 2.77) / 2);
  P.add('hullDark', box(SIDE.cageOut + 0.012 - SIDE.casOut, sh, cage1 - cage0), s * (SIDE.casOut + SIDE.cageOut + 0.012) / 2,
    sh0 + sh / 2, (cage0 + cage1) / 2);
  // the cassettes, 0.82 apart from the idler back
  const cy0 = 0.922, cy1 = SIDE.railY1, cyc = (cy0 + cy1) / 2, cx = (SIDE.casIn + SIDE.casOut) / 2;
  for (let i = 0; i < 7; i++) {
    const z = 2.43 - i * 0.82;
    P.addExternalArmor('hull', box(SIDE.casOut - SIDE.casIn, cy1 - cy0, 0.68), s * cx, cyc, z);
    P.add('hullDark', box(0.012, cy1 - cy0 - 0.02, 0.018), s * (SIDE.casOut + 0.003), cyc, z - 0.34);     // divider
    P.add('hullDetail', box(0.08, 0.022, 0.10), s * cx, SIDE.shelfY1 + 0.011, z);                        // shoe
    if (i < 6) P.add('hullDark', box(0.04, 0.44, 0.16), s * (SIDE.casIn + 0.02), cyc, z - 0.41);          // bridge
  }
  // the slat cage: five bays of four rails between end posts, two stand-off arms top and foot in each bay
  const n = 5, len = (cage1 - cage0) / n, y0 = 0.95, y1 = SIDE.railY1 - 0.012, ox = SIDE.cageOut;
  for (let k = 0; k < n; k++) {
    const a = cage0 + len * k + 0.025, b = cage0 + len * (k + 1) - 0.025, l = b - a, m = (a + b) / 2;
    for (let row = 0; row < 4; row++) P.add('hullDetail', box(0.024, 0.028, l), s * ox, y0 + (y1 - y0) * row / 3, m);
    for (const z of [a, b]) P.add('hullDetail', box(0.028, SIDE.shelfY1 - 0.005 - (y0 - 0.03), 0.028), s * ox, (SIDE.shelfY1 - 0.005 + y0 - 0.03) / 2, z);
    for (const z of [a + l * 0.18, b - l * 0.18]) {
      for (const y of [y0, y1]) P.add('hullDark', box(ox - SIDE.casOut + 0.02, 0.038, 0.040), s * (ox + SIDE.casOut - 0.02) / 2, y, z);
    }
  }
}

/**
 * The glacis: ten appliqué blocks ahead of the splash board (between it and the headlight pods, clear of the driver's
 * periscopes), a pulled block's recess, the spare links on its right, the tow cable laid behind the board on the left;
 * the horn on the left shoulder, brush guards over the headlights, pins through the bow's tow eyes, the width rods.
 */
function glacisKit(P: TankBuilderPort, ctx: Leopard2A4KitContext): void {
  const { box, cylX, cylZ, sph, xform } = KIT;
  const blocks: ReadonlyArray<readonly [number, number, number]> = [
    // [x, z, extra height]: a row across the lower plate, two left of the board's apex, one each side behind the board's ends
    [-0.73, 3.23, 0.012], [-0.44, 3.23, 0], [-0.15, 3.23, 0], [0.15, 3.23, 0], [0.44, 3.23, 0.012], [0.73, 3.23, 0],
    [0.55, 2.88, 0], [0.84, 2.88, 0.012],
    [-0.92, 2.60, 0], [0.92, 2.60, 0.012],
  ];
  for (const [x, z, extra] of blocks) {
    const h = 0.045 + extra;
    onDeck(P, 'hull', box(0.26, h, 0.17), x, z, h / 2 - 0.003, true);
    onDeck(P, 'hullDark', xform(box(0.22, 0.012, 0.014), 0, h / 2 + 0.004, 0.062), x, z, h / 2 - 0.003);   // lip
  }
  onDeck(P, 'hullDark', box(0.015, 0.038, 0.15), 0, 3.23, 0.016);                             // centre joints
  onDeck(P, 'hullDark', box(0.015, 0.038, 0.15), 0.695, 2.88, 0.016);
  onDeck(P, 'hullDark', box(0.26, 0.010, 0.16), -0.25, 3.05, 0.002);                           // the pulled block
  // the spare links laid across the glacis's right bay, between the splash board and the lower row (along the plate's
  // run they crossed its break at z 3.00, and down the slope their rear clamp met the board)
  {
    const x = -0.68, z = 2.92, f = deckFrame(x, z);
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 3, width: 0.10, pitch: 0.16, seed: ctx.seed + 71,
      rotation: [f.rotation.x, Math.PI / 2, 0] });
    const at = f.point.clone().addScaledVector(f.normal, 0.0405);
    links.position.copy(at);
    P.hullG.add(links);
  }
  // the tow cable laid in a loop on the left half of the upper glacis, behind the splash board
  laidCable(P, [[0.12, 1.72], [0.18, 2.32], [0.45, 2.46], [0.80, 2.38], [0.95, 1.80]], 0.026, [[0.16, 2.05], [0.62, 2.45], [0.90, 2.05]]);
  // the horn on the left shoulder outboard of the headlight pod
  {
    const x = 1.48, z = 2.95, y = hullTopY(x, z);
    P.add('hullDark', box(0.09, 0.07, 0.11), x, y + 0.035, z);
    P.add('hullDark', xform(cylZ(0.035, 0.02, 10), 0, 0, 0.062), x, y + 0.04, z);
  }
  for (const s of SIDES) {
    // brush guards: a base bar on the sponson's top ahead of the pod, three bars up to the pod guard's top bar
    const px = s * HS.pods[0], bz = HS.pods[1] + 0.135, by = hullTopY(px, bz);
    P.add('hullDetail', box(0.33, 0.02, 0.04), px, by + 0.01, bz);
    for (const d of [-0.105, 0, 0.105]) P.add('hullDetail', box(0.016, 0.13, 0.016), px + d, by + 0.083, bz + 0.018, 0.28, 0, 0);
    // a pin through each bow tow eye's lug
    P.add('hullDark', cylX(0.022, 0.16, 8), s * 0.70, 1.02, 3.40);
    // the width rods folded aft along the fore rail's top from their hinge blocks at its nose (the field posture: stood
    // up on the CAN's high rail, they held the gun 7 degrees short of its depression over the front quarters)
    const rx = s * (HS.mudguard.x1 + SIDE.modOut) / 2;
    P.add('hullDetail', box(0.03, 0.026, 0.03), rx, SIDE.railY1 + 0.013, 3.565);
    P.add('hullDetail', cylZ(0.008, 0.30, 6), rx, SIDE.railY1 + 0.008, 3.40);
    P.add('hullDetail', sph(0.016, 8), rx, SIDE.railY1 + 0.016, 3.25);
    // the front mudflaps at the skirt line ahead of the idler, hinged into the short module's front
    P.hangMudguard('leo2a4m-can-front-flap', 'hullRubber', box(0.18, 0.36, 0.028), s * 1.79, 0.73, 3.66);
    P.add('hullDetail', box(0.18, 0.04, 0.034), s * 1.79, 0.93, 3.66);
    P.add('hullDetail', box(0.04, 0.04, 0.09), s * (SIDE.modIn + 0.02), 0.93, 3.615);
  }
}

/**
 * The deck: the transverse grille between the forward access plates, the fender bins (low lockers forward under the
 * turret's front body, bins aft under the bustle's floor and the cage, clear of its sweep), the pioneer tools on the
 * radiator louvres.
 */
function deckKit(P: TankBuilderPort): void {
  const { box } = KIT;
  // the centre grille: a dark recess, a four-bar frame, a ladder of four ribs
  const gz = -2.10;
  onDeck(P, 'hullDark', box(0.34, 0.006, 0.56), 0, gz, 0.003);
  for (const dz of [-0.29, 0.29]) onDeck(P, 'hullDetail', box(0.38, 0.016, 0.03), 0, gz + dz, 0.008);
  for (const dx of [-0.175, 0.175]) onDeck(P, 'hullDetail', box(0.03, 0.016, 0.60), dx, gz, 0.008);
  for (const dz of [-0.18, -0.06, 0.06, 0.18]) onDeck(P, 'hullDetail', box(0.32, 0.012, 0.04), 0, gz + dz, 0.009);
  for (const s of SIDES) {
    for (const [z0, z1, h] of [[0.12, 1.18, 0.02], [-2.55, -1.60, 0.09]] as const) {
      const zc = (z0 + z1) / 2, l = z1 - z0, lid = h > 0.05 ? 0.024 : 0.016, latch = h > 0.05 ? 0.05 : 0.012, x = s * 1.52;
      onDeck(P, 'hullDetail', box(0.27, h, l), x, zc, h / 2);
      onDeck(P, 'hullDetail', box(0.29, lid, l + 0.02), x, zc, h + lid / 2);
      for (const dz of [-l * 0.28, l * 0.28]) onDeck(P, 'hullDark', KIT.xform(box(0.012, latch, 0.08), s * 0.141, 0, dz), x, zc, h * 0.45);
    }
  }
  // the pioneer tools strapped on the radiator louvres: the shovel left, the axe right
  const lz = -3.10, top = deckY(lz) + 0.026;
  KIT.shovelTool(P, 1.36, top + 0.016, lz, 0.60);
  P.add('hullWood', box(0.03, 0.022, 0.52), -1.36, top + 0.011, lz - 0.02);
  P.add('hullDark', box(0.05, 0.028, 0.15), -1.36, top + 0.014, lz + 0.20);
  for (const x of [-1.36, 1.36]) for (const dz of [-0.24, 0.16]) P.add('hullDark', box(0.06, 0.04, 0.03), x, top + 0.02, lz + dz);   // straps
}

/**
 * The stern: the tall CAN rack behind the rear plate (two full-width rails, the centre-left basket rail, tall posts, side
 * posts braced to the plate) with its basket floor on the hull's own stern rack and its load, the service boxes in its
 * outer bays, the slat cage under it on drop brackets between the tracks; the convoy plate, pins through the tow hooks,
 * the rear-corner light pods with their guards, the rear mudflaps hung from them.
 */
function sternKit(P: TankBuilderPort): void {
  const { box, cylX } = KIT;
  const zr = -4.19, plate = HS.rearZ, rail = 0.045;
  P.add('hullDetail', box(2.30, rail, rail), 0, 1.00, zr);
  P.add('hullDetail', box(2.30, rail, rail), 0, 1.72, zr);
  P.add('hullDetail', box(1.30, rail, rail), 0.20, 2.12, zr);
  for (const x of [0.80, 0.20, -0.40]) P.add('hullDetail', box(0.035, 1.16, 0.035), x, 1.56, zr);
  for (const x of [-1.10, 1.10]) {
    P.add('hullDetail', box(0.035, 0.76, 0.035), x, 1.36, zr);
    P.add('hullDark', box(0.04, 0.04, plate - zr), x, 1.30, (plate + zr) / 2);
  }
  // the basket's floor on the hull's stern rack (its rails' top 1.835), and the load: a bundle and a strapped kit box in
  // the basket, a bundle on the lower rail
  const floorY = 1.855, fz0 = -3.84, fz1 = zr + 0.0175;
  P.add('hullDark', box(1.24, 0.02, fz0 - fz1), 0.20, floorY - 0.01, (fz0 + fz1) / 2);
  // the outer bays' floors on the lower full-width rail, out to the end posts (open, the bays read through to the ground
  // from above: the standard check's contiguity, release 264's gate)
  for (const [x0, x1] of [[-1.13, -0.42], [0.82, 1.13]] as const) {
    P.add('hullDark', box(x1 - x0, 0.02, fz0 - fz1), (x0 + x1) / 2, 1.72 + rail / 2 + 0.01, (fz0 + fz1) / 2);
  }
  KIT.stowage(P, 'hullCloth', P.rng, [
    [0.45, floorY + 0.20, -4.01, 0.70, 0.40, 0.28],
    [0.05, 1.0225 + 0.20, -4.04, 0.72, 0.40, 0.25],
  ]);
  P.add('hullCloth', box(0.48, 0.28, 0.24), -0.16, floorY + 0.14, -4.01);
  // the service boxes on the lower rail's outer bays
  for (const s of SIDES) {
    P.add('hullDark', box(0.30, 0.22, 0.10), s * 0.85, 1.0225 + 0.11, zr + 0.07);
    P.add('hullDetail', box(0.32, 0.020, 0.11), s * 0.85, 1.0225 + 0.23, zr + 0.07);
    P.add('hullDark', box(0.05, 0.05, 0.010), s * 0.85, 1.0225 + 0.12, zr + 0.015);
  }
  // the stern slat cage: five bars and seven posts under the rack's lower rail, braced to the plate between the tracks
  for (let row = 0; row < 5; row++) P.add('hullDetail', box(2.90, 0.020, 0.020), 0, 0.70 + row * 0.06, zr);
  for (let i = 0; i < 7; i++) P.add('hullDetail', box(0.024, 0.32, 0.024), -1.363 + i * (2.726 / 6), 0.84, zr);
  const lowerFace = plate + (HS.rearFootY - 0.74) * (0.18 / 0.20);                           // the lower rear plate at y 0.74
  for (const x of [-0.55, 0, 0.55]) {
    P.add('hullDark', box(0.036, 0.036, plate - zr), x, 0.86, (plate + zr) / 2);
    P.add('hullDark', box(0.036, 0.036, lowerFace - zr), x, 0.74, (lowerFace + zr) / 2);
  }
  P.add('hullDetail', box(0.30, 0.11, 0.012), 0, 1.19, plate - 0.006);                         // the convoy plate
  for (const s of SIDES) {
    P.add('hullDark', cylX(0.024, 0.18, 8), s * 0.80, 0.90, -3.87);                           // a pin through the tow hook
    // the rear-corner pod on a bracket off the sponson's end, its guard bar, the flap hung from it on a post
    const px = s * 1.76, pz = -3.66;
    P.add('hullDark', box(0.14, 0.14, 0.10), px, 1.44, pz);
    P.add('hullGlass', box(0.05, 0.04, 0.014), px, 1.46, pz - 0.057);
    P.add('hullDark', box(0.05, 0.06, 0.08), s * (SIDE.wall + 0.005), 1.47, pz);
    P.add('hullDetail', box(0.16, 0.022, 0.11), px, 1.521, pz);
    P.hangMudguard('leo2a4m-can-rear-flap', 'hullRubber', box(0.18, 0.40, 0.028), s * 1.79, 0.72, -3.70);
    P.add('hullDetail', box(0.18, 0.04, 0.034), s * 1.79, 0.94, -3.70);
    P.add('hullDetail', box(0.04, 1.37 - 0.96, 0.04), s * 1.79, (1.37 + 0.96) / 2, -3.70);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Turret
// ---------------------------------------------------------------------------------------------------------------------

/** The cheek wedges: their foot and crest (the faces' top), the tip ahead of the faces at the slot, the front's sweep back. */
const WEDGE = Object.freeze({ foot: 0.12, crest: T.faceTopY, tipZ: T.faceZ + 0.45, sweep: Math.tan(22 * Math.PI / 180) });
/** The flank modules and the cheek wedges' sides stand this far out from the walls. */
const FLANK_OUT = 0.21;
const wallOf = (sx: number): number => (sx < 0 ? T.wallRightM : T.wallLeftM);
const edgeOf = (sx: number): number => (sx < 0 ? T.faceRightM : T.faceLeftM);
const frontZ = (ax: number): number => WEDGE.tipZ - WEDGE.sweep * (ax - T.slotHalfWidthM);

/** A wedge piece between |x| a and b, y0 to y1, from its back (on the turret, at |x|) to the wedge's vertical front. */
function wedgePiece(sx: number, a: number, b: number, y0: number, y1: number, back: (ax: number) => number): THREE.BufferGeometry {
  const pts: number[][] = [];
  for (const ax of [a, b]) for (const y of [y0, y1]) pts.push([sx * ax, y, back(ax)], [sx * ax, y, frontZ(ax)]);
  return convexSlab(...pts);
}

/**
 * The MEXAS-style cheek wedges over the cheeks' faces: vertical fronts swept back 22 degrees from the gun slot to the
 * corners, their backs on the faces (themselves swept 27 degrees, the shared cheek front; the fronts stand where they did
 * on the 6-degree faces), wrapping the corner cuts and running back along the walls, their
 * tops the faces' top under the bevel. The right one leaves the EMES 15 notch open: under the notch only a sill as high as
 * the notch's own, so the sight sees forward and up over it. Seams part the fronts into tiles, bolted caps and a lifting
 * eye on the tops.
 */
function cheekWedges(P: TankBuilderPort): void {
  const { box, cylY, cylZ } = KIT;
  const { foot, crest } = WEDGE, e = T.emes, slot = T.slotHalfWidthM, seg = P.q ? 8 : 6;
  const ex1 = -e.x + e.halfW;                                                          // the notch's outer wall, |x|
  const yaw = Math.atan(WEDGE.sweep);
  const onFace = (ax: number): number => leopard2A4FaceZ(ax) + 0.002;
  for (const sx of SIDES) {
    const wall = wallOf(sx), edge = edgeOf(sx), out = wall + FLANK_OUT;
    // the chamfer runs from the face's outer edge back to the wall (the shared cheek front's corner)
    const corner = cheekCornerZ(LEO2A4_CHEEK_FRONT, sx < 0 ? LEO2A4_CHEEK_FRONT.right : LEO2A4_CHEEK_FRONT.left);
    const onCut = (ax: number): number =>
      THREE.MathUtils.lerp(leopard2A4FaceZ(edge), corner, (ax - edge) / (wall - edge)) + 0.002;
    const behindCorner = T.blockZ - 0.02;
    // [a, b, top] of each piece over the face, then the corner and the side
    const facePieces: ReadonlyArray<readonly [number, number, number]> = sx < 0
      ? [[slot, ex1, e.y0], [ex1, edge, crest]] : [[slot, (slot + edge) / 2, crest], [(slot + edge) / 2, edge, crest]];
    for (const [a, b, top] of facePieces) P.addExternalArmor('turret', wedgePiece(sx, a, b, foot, top, onFace));
    P.addExternalArmor('turret', wedgePiece(sx, edge, wall, foot, crest, onCut));
    P.addExternalArmor('turret', wedgePiece(sx, wall, out, foot, crest, () => behindCorner));
    // the fronts' tiles: a horizontal seam across each, a vertical seam at each joint, three bolts each
    const tiles = [...facePieces, [edge, wall, crest], [wall, out, crest]] as const;
    for (const [a, b, top] of tiles) {
      const m = (a + b) / 2, l = (b - a) / Math.cos(yaw), my = (foot + top) / 2;
      P.addEquipment('turretDark', box(l - 0.03, 0.012, 0.006), sx * m, my, frontZ(m) + 0.002, 0, sx * yaw, 0);
      for (const [t, y] of [[0.25, top - 0.06], [0.75, top - 0.06], [0.5, foot + 0.06]] as const) {
        const ax = a + (b - a) * t;
        P.addEquipment('turretDetail', cylZ(0.016, 0.012, seg), sx * ax, y, frontZ(ax) + 0.005, 0, sx * yaw, 0);
      }
      if (a > slot) {
        P.addEquipment('turretDark', box(0.014, crest - foot - 0.04, 0.006), sx * a, (foot + crest) / 2, frontZ(a) + 0.002, 0, sx * yaw, 0);
      }
    }
    // bolted caps on the tops (four a side), a lifting eye on the side piece
    const caps: ReadonlyArray<readonly [number, number, number, number]> = sx < 0
      ? [[0.60, 0.14, 1.88, e.y0], [(ex1 + edge) / 2, 0.12, 1.76, crest], [(edge + wall) / 2, 0.12, 1.70, crest], [(wall + out) / 2, 0.16, 1.46, crest]]
      : [[0.62, 0.16, 1.88, crest], [0.88, 0.16, 1.80, crest], [(edge + wall) / 2, 0.12, 1.72, crest], [(wall + out) / 2, 0.16, 1.46, crest]];
    for (const [ax, w, z, top] of caps) {
      P.addEquipment('turretDark', box(w, 0.016, 0.12), sx * ax, top + 0.008, z);
      P.addEquipment('turretDetail', cylY(0.02, 0.02, 0.012, seg), sx * ax, top + 0.022, z);
    }
    KIT.liftEye(P, 'turretDetail', sx * (wall + out) / 2, crest + 0.025, 1.20);
  }
}

/** One flank module's seat: its centre z, its inner face's |x| at its ends (on the wall, held off it), its height band. */
interface FlankSeat { readonly z: number; readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number }

/** The five flank modules a side: 0.44 apart from the wedge's side back, held 8 cm off the wall, alternating in height. */
function flankSeats(sx: number): FlankSeat[] {
  const seats: FlankSeat[] = [];
  for (let i = 0; i < 5; i++) {
    const z = 0.86 - i * 0.44, y = 0.42 + (i & 1) * 0.022;
    seats.push({ z, x0: TS.wallAt(sx, z + 0.20) + 0.08, x1: TS.wallAt(sx, z - 0.20) + 0.08, y0: y - 0.22, y1: y + 0.22 });
  }
  return seats;
}

/**
 * The MEXAS-style flank modules on the walls (following the right wall's step in over the bustle), each on two stand-off
 * brackets with a cap strip and four bolts; grab rails over the modules' tops and along the bustle wall behind them.
 */
function flankModules(P: TankBuilderPort): void {
  const { box, cylX } = KIT;
  const seg = P.q ? 8 : 6;
  for (const sx of SIDES) {
    const seats = flankSeats(sx);
    for (const m of seats) {
      const ry = sx * Math.atan2(m.x0 - m.x1, 0.40), xc = (m.x0 + m.x1) / 2 + 0.065, yc = (m.y0 + m.y1) / 2;
      P.addExternalArmor('turret', box(0.13, m.y1 - m.y0, 0.40), sx * xc, yc, m.z, 0, ry, 0);
      P.addEquipment('turretDark', box(0.094, 0.014, 0.04), sx * xc, m.y1 + 0.007, m.z + 0.08, 0, ry, 0);
      for (const dy of [-0.15, 0.15]) for (const dz of [-0.15, 0.15]) {
        P.addEquipment('turretDetail', KIT.xform(cylX(0.016, 0.012, seg), sx * 0.066, dy, dz), sx * xc, yc, m.z, 0, ry, 0);
      }
      // the brackets: from the wall (or the welded ammunition hatch's face on the left) to the module's inner face
      const hatch = sx > 0 && Math.abs(m.z + 0.42) < 0.245;               // the bracket's z over the hatch plate
      for (const y of [m.y0 + 0.07, m.y1 - 0.07]) {
        const from = hatch && y < 0.56 ? 0.04 : -0.01;
        const wall = TS.wallAt(sx, m.z);
        P.addEquipment('turretDark', box(0.08 - from + 0.005, 0.04, 0.06), sx * (wall + (from + 0.085) / 2), y, m.z);
      }
    }
    // grab rails: over the second module, over the third to fifth, along the bustle wall behind them
    const rail = (x0: number, z0: number, x1: number, z1: number, y: number, feet: ReadonlyArray<readonly [number, number, number]>): void => {
      const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0);
      P.addEquipment('turretDetail', box(0.022, 0.022, len), (x0 + x1) / 2, y, (z0 + z1) / 2, 0, ry, 0);
      for (const [fx, fz, fy] of feet) P.addEquipment('turretDetail', box(0.02, y - fy, 0.02), fx, (y + fy) / 2, fz);
    };
    const over = (m: FlankSeat, t: number): readonly [number, number, number] =>
      [sx * (THREE.MathUtils.lerp(m.x0, m.x1, t) + 0.10), m.z + 0.20 - 0.40 * t, m.y1];
    const ry = 0.72;
    {
      const m = seats[1], f0 = over(m, 0.1), f1 = over(m, 0.9);
      rail(f0[0], f0[1], f1[0], f1[1], ry, [f0, f1]);
    }
    {
      const f0 = over(seats[2], 0.1), f1 = over(seats[3], 0.5), f2 = over(seats[4], 0.9);
      rail(f0[0], f0[1], f2[0], f2[1], ry, [f0, [f1[0], f1[1], f1[2]], f2]);
    }
    {
      const z0 = -1.25, z1 = -2.20, x0 = sx * (TS.wallAt(sx, z0) + 0.055), x1 = sx * (TS.wallAt(sx, z1) + 0.055), y = 0.55;
      rail(x0, z0, x1, z1, y, []);
      for (const z of [z0 - 0.04, (z0 + z1) / 2, z1 + 0.04]) {
        P.addEquipment('turretDetail', box(0.065, 0.02, 0.02), sx * (TS.wallAt(sx, z) + 0.0275), y, z);
      }
    }
  }
}

/** The Canadian six-tube smoke banks on brackets at the roof's front corners, over the first flank modules. */
function canadianSmoke(P: TankBuilderPort, ctx: Leopard2A4KitContext): void {
  const { box } = KIT;
  const z = 0.86;
  for (const sx of SIDES) {
    const wall = wallOf(sx), top = T.roofY;
    P.addEquipment('turretDetail', box(0.30, top - 0.64, 0.34), sx * (wall + 0.14), (top + 0.64) / 2, z);
    const bank = FITTINGS.smokeBank({ mats: P.mats, count: 6, r: 0.043, len: 0.29, splay: sx * 1.04, pitch: -0.44, arc: 0.58,
      spacing: 0.095, slot: 'detail', seed: ctx.seed + (sx > 0 ? 31 : 30) });
    bank.position.set(sx * (wall + 0.20), top + 0.085, z);
    P.turretG.add(bank);
  }
}

/**
 * The slat cages: three bays a side from the last flank module back past the bustle, standing off the modules, the walls
 * and the rack, and one across the back behind the bustle rack, braced to its back rails.
 */
function turretCages(P: TankBuilderPort, rack: Rack): void {
  const { box } = KIT;
  const y0 = 0.27, y1 = 0.69, z0 = -0.72, z1 = rack.backZ - 0.08, n = 3, len = (z0 - z1) / n;
  const armY = [rack.low, rack.top];
  const outer = (sx: number): number => wallOf(sx) + FLANK_OUT + 0.10;
  for (const sx of SIDES) {
    const ox = outer(sx), last = flankSeats(sx)[4];
    const seat = (z: number): number => (z > last.z - 0.20 ? (last.x0 + last.x1) / 2 + 0.13
      : z > T.rearZ ? TS.wallAt(sx, z) : rack.halfW);
    for (let k = 0; k < n; k++) {
      const a = z0 - len * k - 0.025, b = z0 - len * (k + 1) + 0.025, l = a - b, m = (a + b) / 2;
      for (let row = 0; row < 4; row++) P.addEquipment('turretDetail', box(0.024, 0.028, l), sx * ox, y0 + (y1 - y0) * row / 3, m);
      for (const z of [a, b]) P.addEquipment('turretDetail', box(0.028, y1 - y0 + 0.06, 0.028), sx * ox, (y0 + y1) / 2, z);
      for (const z of [a - l * 0.18, b + l * 0.18]) {
        const sxw = seat(z);
        for (const y of armY) P.addEquipment('turretDark', box(ox - sxw + 0.02, 0.038, 0.040), sx * (ox + sxw) / 2, y, z);
      }
    }
  }
  // across the back: four rails between the side cages, nine posts, arms from every other post to the rack's back rails
  const xr = -outer(-1), xl = outer(1), w = xl - xr, zc = z1 + 0.025;                   // through the side cages' end posts
  for (let row = 0; row < 4; row++) P.addEquipment('turretDetail', box(w, 0.028, 0.026), (xl + xr) / 2, y0 + (y1 - y0) * row / 3, zc);
  for (let i = 0; i < 9; i++) {
    const x = THREE.MathUtils.lerp(xr + 0.03, xl - 0.03, i / 8);
    P.addEquipment('turretDetail', box(0.028, y1 - y0 + 0.06, 0.028), x, (y0 + y1) / 2, zc);
    if (i % 2 === 0 && Math.abs(x) < rack.halfW) {
      for (const y of armY) P.addEquipment('turretDark', box(0.036, 0.036, rack.backZ - zc), x, y, (rack.backZ + zc) / 2);
    }
  }
}

/** The bustle rack as drawn: its half-width, back, rails' heights, floor. */
interface Rack { readonly halfW: number; readonly backZ: number; readonly low: number; readonly top: number; readonly floorY: number }

/**
 * The full-width slatted bustle rack (the A4's rear basket): three rails across its back, eleven posts, three end rails a
 * side running forward to the bustle's chamfered corners with a post into each, a slatted floor and a mesh back; its
 * load (three bundles, the jerrycan pair, the ammunition can, a tarp across the top) and the radio base drums on its end
 * rails.
 */
function bustleRack(P: TankBuilderPort): Rack {
  const { box, cylY } = KIT;
  const halfW = 1.08, depth = 0.42, low = 0.28, top = 0.66, mid = (low + top) / 2, back = T.rearZ - depth;
  const rack: Rack = { halfW, backZ: back, low, top, floorY: low + 0.022 };
  for (const y of [low, mid, top]) P.addEquipment('turretDetail', box(halfW * 2, 0.03, 0.03), 0, y, back);
  for (let k = 0; k <= 10; k++) P.addEquipment('turretDetail', box(0.026, top - low, 0.026), -halfW + 0.013 + k * (2 * halfW - 0.026) / 10, mid, back);
  for (const sx of SIDES) {
    // the end rails run forward to the chamfered corner at |x| halfW
    const r0 = sx < 0 ? T.rearRightM : T.rearLeftM, r1 = sx < 0 ? 1.10 : 1.16;
    const zc = T.rearZ + (T.bustleEndZ - T.rearZ) * (halfW - r0) / (r1 - r0);
    for (const y of [low, mid, top]) P.addEquipment('turretDetail', box(0.03, 0.03, zc - back), sx * halfW, y, (zc + back) / 2);
    P.addEquipment('turretDetail', box(0.03, top - low, 0.03), sx * halfW, mid, zc - 0.012);
    // the radio base drum on the end rail
    P.addEquipment('turretDetail', cylY(0.035, 0.045, 0.06, 10), sx * halfW, top + 0.015 + 0.03, back + 0.30);
    P.addEquipment('turretDark', cylY(0.030, 0.030, 0.016, 10), sx * halfW, top + 0.015 + 0.068, back + 0.30);
  }
  P.addEquipment('turretDark', KIT.openRackGrid(halfW * 2 - 0.04, depth - 0.02, 0.014, 5, 11), 0, low + 0.015, T.rearZ - depth / 2);
  for (let k = 0; k < 11; k++) P.addEquipment('turretDark', box(0.026, top - low - 0.14, 0.014), -1.05 + k * 0.21, mid, back - 0.025);
  // the load, its feet on the floor
  const f = rack.floorY, zc = T.rearZ - depth / 2 - 0.01;
  KIT.jerryCan(P, 'turretCloth', -0.85, f + 0.24, zc, 0);
  KIT.stowage(P, 'turretCloth', P.rng, [
    [-0.36, f + 0.17, zc, 0.50, 0.34, 0.30], [0.16, f + 0.16, zc, 0.48, 0.32, 0.30], [0.62, f + 0.15, zc, 0.40, 0.30, 0.28],
  ]);
  KIT.ammoCan(P, 'turretDark', 0.96, f + 0.10, zc, 0);
  KIT.tarpRoll(P, 'turretCloth', 0.32, f + 0.32 + 0.085, zc, 0.95, 0.085, true, P.q ? 12 : 8);
  return rack;
}

/**
 * The roof: the SEM 25 whips on the bustle's antenna bases, the crosswind sensor's mast, the rear-shoulder latch blocks
 * and the rear plate's lugs, the two spare links laid on the rear roof.
 */
function roofKit(P: TankBuilderPort, ctx: Leopard2A4KitContext): void {
  const { box, cylY } = KIT;
  for (const [ax, seed] of [[-0.88017, ctx.seed + 7], [0.91495, ctx.seed + 5]] as const) {
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 1.39, r: 0.011, seed, rotation: [0, 0, Math.sign(ax) * 0.035] });
    whip.position.set(ax, T.roofY + 0.10, -1.98);
    P.turretG.add(whip);
  }
  {
    const x = 0.85, z = -2.14, y = turretRoofY(z);
    P.addEquipment('turretDetail', cylY(0.012, 0.016, 0.25, 8), x, y + 0.115, z);
    P.addEquipment('turretDark', box(0.04, 0.04, 0.11), x, y + 0.25, z);
  }
  for (const sx of SIDES) {
    const z = -2.20, y = turretRoofY(z);
    P.addEquipment('turretDetail', box(0.08, 0.040, 0.12), sx * 0.55, y + 0.018, z);
    P.addEquipment('turretDark', box(0.045, 0.030, 0.035), sx * 0.55, y + 0.045, z + 0.05);
    P.addEquipment('turretDetail', box(0.055, 0.12, 0.025), sx * 0.55, 0.45, T.rearZ - 0.012);
  }
  KIT.spareTrackStrip(P, 'turret', 0.30, T.roofY + 0.0405, -1.62, 2, 0, 0);
}

/** The crosses on the middle flank modules' faces, the tactical number on the right's fourth. */
function turretMarkings(P: TankBuilderPort): void {
  for (const sx of SIDES) {
    const seats = flankSeats(sx), m = seats[2], x = (m.x0 + m.x1) / 2 + 0.13 + 0.002;
    P.decal('turret', 'crossgrey', null, 0.30, [sx * x, (m.y0 + m.y1) / 2, m.z], sx * Math.PI / 2);
    if (sx < 0) {
      const n = seats[3], nx = (n.x0 + n.x1) / 2 + 0.13 + 0.002;
      P.decal('turret', 'number', 'A4M', 0.21, [sx * nx, (n.y0 + n.y1) / 2, n.z], sx * Math.PI / 2);
    }
  }
}

/** The Leopard 2A4M CAN's kit, after the hull and the turret. */
export function addLeo2A4MCanKit(P: TankBuilderPort, ctx: Leopard2A4KitContext): void {
  P.mats.rubber.color.setHex(0x33352b);                                      // the weathered rubber of the old build
  minePlate(P);
  for (const s of SIDES) {
    foreCourse(P, s);
    rearCourse(P, s);
    sideArmour(P, s);
  }
  glacisKit(P, ctx);
  deckKit(P);
  sternKit(P);
  cheekWedges(P);
  flankModules(P);
  canadianSmoke(P, ctx);
  const rack = bustleRack(P);
  turretCages(P, rack);
  roofKit(P, ctx);
  // the FLW 200's compact fit (leopard2A4Flw200.ts), a working station, behind the commander's ring and outboard of it
  // (the old build's seat, mirrored with the commander)
  addLeopardFlw200(P, { fit: 'compact', x: -1.05, z: -0.55, seed: ctx.seed + 13, name: `${tankSeedId(ctx.id)}Flw200Gun` });
  turretMarkings(P);
}
