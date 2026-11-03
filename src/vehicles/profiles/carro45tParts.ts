// Carro 45t (owner concept) — 267 X rebuild of the turret shell and its kit (buildCarro45TSteps, italy.ts).
//
// The owner's 2026-09-29 design record (docs/references/concepts/carro45t-roof-20260929.json) stays the law: one
// closed crown with an integral bustle and two tapered cheeks flanking an open elevating mantlet bay, on the retained
// hull and running gear; ring, trunnion, gun and envelope unchanged. 267 (owner: "now update the ... carro 45t") turns
// that shell into a welded turret of the OF-40 / C1 Ariete family: every face a real plane (a vertical belt, an upper
// side plate at one lean the whole length, a flat roof, a plan sweep of one angle from the side wall to the cheek
// noses), so no station twists a quad into a crease. Ring-local frame: y up from the ring plane, +z forward,
// +x the vehicle's left.
import * as THREE from 'three';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { FITTINGS, KIT } from './kit.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** Measured datums of the welded shell (ring-local metres). */
export const CARRO_TURRET = Object.freeze({
  /** vertical belt half-width (the side wall from the ring skirt to the belt) */
  wall: 1.51,
  /** belt top: the knuckle where the upper side plate starts */
  belt: 0.28,
  /** flat roof (world 2.35 over the 1.50 ring, the concept plateau the roof receipt pins over the rear) */
  roof: 0.85,
  /** ring skirt (3 cm over the 1.496 deck) */
  bottom: 0.03,
  /** upper side plate: inward run per metre of rise (39 degrees off vertical) */
  lean: 0.80,
  /** mantlet bay half-width (the cheeks' inner walls; the 0.83 m mantlet leaves 15 mm a side) */
  bay: 0.43,
  /** the roof's sloped upper front: flat aft of slopeZ, one plane down to the cheek noses (40 % of the length) */
  slopeZ: 0.50,
  /** plan sweep: from the side wall at sweepZ to the cheek noses at noseZ */
  sweepZ: 0.75,
  frontZ: 1.40,
  noseZ: 2.08,
  noseHalfWidth: 0.66,
  noseTop: 0.54,
  /** bustle: square rear face, undercut start, undercut height */
  rearZ: -1.88,
  bustleZ: -1.62,
  undercutZ: -1.12,
  bustleBottom: 0.13,
});

const T = CARRO_TURRET;
const SWEEP = (T.wall - T.noseHalfWidth) / (T.noseZ - T.sweepZ);

/** Belt half-width at a station (straight walls aft of sweepZ, one plan angle forward of it). */
function carroWallAt(z: number): number {
  return z <= T.sweepZ ? T.wall : T.wall - SWEEP * (z - T.sweepZ);
}

/** Top of the shell at a station: the flat roof, then one sloped plane over crown, cheeks and mantlet to the noses. */
export function carroTopAt(z: number): number {
  return z <= T.slopeZ ? T.roof : T.roof - (T.roof - T.noseTop) * (z - T.slopeZ) / (T.noseZ - T.slopeZ);
}

/** Roof edge half-width: the upper side plate meets the roof (or the cheek top) here. */
function carroRoofEdgeAt(z: number): number {
  return carroWallAt(z) - T.lean * (carroTopAt(z) - T.belt);
}

/** Outer surface x of the side at (y, z) between the belt and the roof edge (the upper plate) or on the belt. */
function carroSideX(y: number, z: number): number {
  const w = carroWallAt(z);
  return y <= T.belt ? w : w - T.lean * (y - T.belt);
}

function crownRing(z: number, bottom: number): SectionPoint[] {
  const w = carroWallAt(z), r = carroRoofEdgeAt(z), top = carroTopAt(z);
  return [[-w, bottom], [w, bottom], [w, T.belt], [r, top], [T.bay, top], [-T.bay, top], [-r, top], [-w, T.belt]];
}

/** The crown: belt, upper plates and roof from the bustle's square rear face to the gun bay's back wall, with a
 *  station wherever the roof slope or the plan sweep begins, so every face between two stations stays one plane. */
export function carroCrownGeometry(): THREE.BufferGeometry {
  const bustle = crownRing(T.bustleZ, T.bustleBottom);
  return sectionSolid([
    { z: T.rearZ, ring: bustle },
    { z: T.bustleZ, ring: bustle },
    { z: T.undercutZ, ring: crownRing(T.undercutZ, T.bottom) },
    { z: T.slopeZ, ring: crownRing(T.slopeZ, T.bottom) },
    { z: T.sweepZ, ring: crownRing(T.sweepZ, T.bottom) },
    { z: T.frontZ, ring: crownRing(T.frontZ, T.bottom) },
  ], { sideQuadDiagonal: 'convex' });
}

/** One cheek (side +1 the vehicle's left): the crown's sweep, side plate and roof plane continued to the nose, so
 *  crown and cheek share every edge at the bay wall. */
export function carroCheekGeometry(side: 1 | -1): THREE.BufferGeometry {
  return sectionSolid([T.frontZ, T.noseZ].map((z) => {
    const ring: SectionPoint[] = [[T.bay, T.bottom], [carroWallAt(z), T.bottom], [carroWallAt(z), T.belt],
      [carroRoofEdgeAt(z), carroTopAt(z)], [T.bay, carroTopAt(z)]];
    return { z, ring: side > 0 ? ring : ring.map(([x, y]): SectionPoint => [-x, y]).reverse() };
  }), { sideQuadDiagonal: 'convex' });
}

/** A side-profile loft: `profile` is a (z, y) contour listed CLOCKWISE (z to the right, y up), swept across x
 *  stations; each station scales the profile uniformly about its centroid (1 = full), so chamfers stay planar. */
function carroSideLoft(profile: readonly (readonly [number, number])[],
  stations: readonly (readonly [x: number, scale: number])[]): THREE.BufferGeometry {
  const cz = profile.reduce((s, p) => s + p[0], 0) / profile.length;
  const cy = profile.reduce((s, p) => s + p[1], 0) / profile.length;
  const geometry = sectionSolid(stations.map(([x, k]) => ({
    z: x,
    ring: profile.map(([z, y]): SectionPoint => [-(cz + (z - cz) * k), cy + (y - cy) * k]),
  })), { sideQuadDiagonal: 'convex' });
  // station axis -> +x, ring (-z, y) -> (z, y)
  return geometry.rotateY(Math.PI / 2);
}

/** r268b (owner: "add more upper glacis and roof details"): a periscope / vision-block head in its own frame (y up from
 *  the plate it sits on, +z the way it looks): a side-profile housing (CLOCKWISE (z, y)) lofted ±halfW with chamfered
 *  ends, and its dark window lying 3 mm proud on the raked face from window[0] (top) to window[1] (bottom). */
function headParts(profile: readonly (readonly [number, number])[],
  window: readonly [readonly [number, number], readonly [number, number]], halfW: number,
): { housing: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
  const housing = carroSideLoft(profile, [[-halfW, 0.9], [-halfW + 0.012, 1], [halfW - 0.012, 1], [halfW, 0.9]]);
  const [[z0, y0], [z1, y1]] = window;
  const len = Math.hypot(z1 - z0, y1 - y0), lean = Math.atan2(z1 - z0, y0 - y1);
  const glass = KIT.xform(KIT.box(halfW * 2 - 0.035, len * 0.74, 0.006), 0,
    (y0 + y1) / 2 + Math.sin(lean) * 0.003, (z0 + z1) / 2 + Math.cos(lean) * 0.003, -lean, 0, 0);
  return { housing, glass };
}

/** A flat plate of w (x) by l (z), t thick and centred on y 0, its corners chamfered by c. */
function roofPlate(w: number, l: number, t: number, c: number): THREE.BufferGeometry {
  const hw = w / 2, hl = l / 2, shape = new THREE.Shape();
  shape.moveTo(-hw + c, -hl);
  for (const [a, b] of [[hw - c, -hl], [hw, -hl + c], [hw, hl - c], [hw - c, hl], [-hw + c, hl], [-hw, hl - c], [-hw, -hl + c]]) {
    shape.lineTo(a, b);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, steps: 1 }).rotateX(-Math.PI / 2).translate(0, -t / 2, 0);
}

/** A hatch lid's hinge on its ring's rim (turret frame): a bracket welded to the rim at yBase, a barrel along z just
 *  over the lid's top, and two straps from the barrel out onto the lid (toward -side in x). */
function carroHatchHinge(P: KitPort, x: number, yBase: number, z: number, side: 1 | -1, lidTop: number): void {
  const yb = lidTop - 0.008;
  P.addHatch('turret', KIT.box(0.05, yb - yBase + 0.006, 0.15), x, (yb + yBase) / 2 - 0.002, z);
  P.add('turretDark', KIT.cylZ(0.022, 0.17, 10), x, yb, z);
  for (const dz of [-0.05, 0.05]) P.addHatch('turret', KIT.box(0.12, 0.012, 0.035), x - side * 0.07, lidTop + 0.004, z + dz);
}

/** A periscope head's housing: 0.10 deep, its window raked back 37 degrees, its foot 8 mm into the plate. */
const PERISCOPE_PROFILE: readonly (readonly [number, number])[] = Object.freeze([
  [-0.05, -0.008], [-0.05, 0.056], [-0.036, 0.070], [0.004, 0.070], [0.046, 0.014], [0.046, -0.008],
]);
const PERISCOPE_WINDOW = [[0.004, 0.070], [0.046, 0.014]] as const;

/** Wedge mantlet in the gun frame (origin on the trunnion, 0.40 over the ring at z 1.30): its top is the roof's
 *  sloped front plane at 0 degrees (h = top(z) - 0.40), so crown, cheeks and mantlet read as one plate with the tube
 *  through it; 0.83 m wide in the 0.86 m bay; the back chamfer and the chin clear the bay wall and the deck from +18 to
 *  -8 degrees at every yaw (it keeps 30 mm over the deck and its louvres at full depression). */
const MANTLET_TOP = (d: number): number => carroTopAt(1.30 + d) - 0.40;
const CARRO_MANTLET_PROFILE: readonly (readonly [number, number])[] = Object.freeze([
  [0.105, 0.235], [0.13, MANTLET_TOP(0.13)], [0.84, MANTLET_TOP(0.84)], [0.84, -0.12], [0.72, -0.25],
  [0.25, -0.32], [0.105, -0.28],
]);

export function carroMantletGeometry(): THREE.BufferGeometry {
  return carroSideLoft(CARRO_MANTLET_PROFILE, [[-0.415, 0.94], [-0.39, 1], [0.39, 1], [0.415, 0.94]]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Turret kit (OF-40 / C1 Ariete vocabulary), all seated on the planar shell above: the gunner's roof sight with its
// visor, the commander's panoramic head and cupola on the right (-x), the left hatch, the armoured roof vent, bustle
// bins on both sides, the rear magazine hatch and the lift eyes. Fittings that the roof receipt pins (smoke banks,
// the Breda pintle, the rear rack) stay in the builder, which owns their seats.

type KitPort = Pick<TankBuilderPort, 'add' | 'addEquipment' | 'addModuleVisual' | 'addHatch' | 'addCupola' | 'q'>;
type BowPort = KitPort & Pick<TankBuilderPort, 'mats' | 'hullG'>;

/** Roof-sight head: a side-profile housing (CLOCKWISE (z, y) relative to the station's z), its raked window and a
 *  lifted visor plate hinged on the window's top edge. */
function sightHead(P: KitPort, x: number, z: number, halfW: number,
  profile: readonly (readonly [number, number])[], glass: readonly [[number, number], [number, number]],
  visor: boolean): void {
  const head = carroSideLoft(profile.map(([dz, y]) => [z + dz, y] as const),
    [[x - halfW, 0.94], [x - halfW + 0.02, 1], [x + halfW - 0.02, 1], [x + halfW, 0.94]]);
  P.addModuleVisual('optics', 'turret', head);
  const [[z0, y0], [z1, y1]] = glass;
  const len = Math.hypot(z1 - z0, y1 - y0), lean = Math.atan2(z1 - z0, y0 - y1);
  // the pane lies on the raked face (top set back), 4 mm proud, its long edges inside the housing's chamfers
  const nz = Math.cos(lean), ny = Math.sin(lean);
  P.addModuleVisual('optics', 'turretGlass', KIT.box(halfW * 2 - 0.07, len * 0.72, 0.010),
    x, (y0 + y1) / 2 + ny * 0.004, z + (z0 + z1) / 2 + nz * 0.004, -lean, 0, 0);
  if (visor) {
    // armoured visor: a plate hinged on the window's top edge, raised 20 degrees above level over the glass
    const vl = len * 0.95, up = 0.35, t = 0.022;
    const dirY = Math.sin(up), dirZ = Math.cos(up);
    P.addEquipment('turret', KIT.box(halfW * 2 - 0.02, t, vl),
      x, y0 + dirY * vl / 2 + t / 2 - 0.004, z + z0 + dirZ * vl / 2 - 0.012, -up, 0, 0);
    P.add('turretDark', KIT.box(halfW * 2 - 0.04, 0.030, 0.030), x, y0 + 0.002, z + z0 - 0.006); // hinge bar
  }
}

export function addCarroRoofOptics(P: KitPort): void {
  // gunner's sight (TURMS-style box, right front) on the sloped front: its base sits 12 mm under the roof at the
  // housing's front edge (the lowest roof under it) and sinks deeper aft as the roof rises; raked window, visor up
  const gx = -0.68, gz = 1.02, gBase = carroTopAt(gz + 0.15) - 0.012, gTop = gBase + 0.215;
  sightHead(P, gx, gz, 0.18,
    [[-0.22, gBase], [-0.22, gTop], [0.04, gTop], [0.15, gTop - 0.155], [0.15, gBase]],
    [[0.04, gTop], [0.15, gTop - 0.155]], true);
  // commander's stabilized panoramic sight, right front of the roof inboard of the gunner's box: a 0.22 m drum and
  // a 0.21 m head, 0.40 m over the roof, its forward field clear past the gunner's housing and over the mantlet
  const px = -0.30, pz = 0.62, roof = carroTopAt(pz + 0.13) - 0.015, seg = P.q ? 20 : 12;
  P.addModuleVisual('optics', 'turret', KIT.cylY(0.125, 0.14, 0.22, seg), px, roof + 0.11, pz);
  P.add('turretDark', KIT.torus(0.128, 0.010, seg), px, roof + 0.205, pz);
  const hb = roof + 0.19, ht = roof + 0.40;
  sightHead(P, px, pz, 0.14,
    [[-0.15, hb], [-0.15, ht], [0.06, ht], [0.15, ht - 0.12], [0.15, hb]],
    [[0.06, ht], [0.15, ht - 0.12]], false);
  P.add('turretDark', KIT.box(0.24, 0.016, 0.16), px, ht + 0.004, pz - 0.04);    // armoured head cover seam
}

export function addCarroHatches(P: KitPort): void {
  const { cylY, box, torus } = KIT;
  const seg = P.q ? 24 : 12, roof = T.roof;
  // commander's cupola (right rear): a low drum with seven vision blocks round its crown and a domed split lid
  const cx = -0.56, cz = -0.30;
  P.addCupola('turret', cylY(0.30, 0.33, 0.09, seg), cx, roof + 0.035, cz);
  for (let k = 0; k < 7; k++) {
    const a = Math.PI + (k - 3) * 0.44;                                           // the arc faces forward and outboard
    const px = cx + Math.sin(a + Math.PI) * 0.285, pz = cz + Math.cos(a + Math.PI) * 0.285;
    P.addModuleVisual('optics', 'turretDark', box(0.10, 0.055, 0.05), px, roof + 0.085, pz, 0, a, 0);
    P.addModuleVisual('optics', 'turretGlass', box(0.075, 0.030, 0.052), px, roof + 0.088, pz, 0, a, 0);
  }
  P.addHatch('turret', cylY(0.24, 0.255, 0.035, seg), cx, roof + 0.095, cz);
  P.add('turretDark', torus(0.248, 0.008, seg), cx, roof + 0.081, cz);
  P.add('turretDark', box(0.40, 0.012, 0.022), cx, roof + 0.114, cz);           // split-lid seam
  // r268b: the split lids' hinges, outboard on the drum's rim: a bracket welded to the rim, a barrel along z and two
  // straps out onto each lid half (the old 9 x 5 x 12 cm block)
  carroHatchHinge(P, cx - 0.262, roof + 0.080, cz, -1, roof + 0.1125);
  P.add('turretDetail', box(0.16, 0.022, 0.022), cx + 0.06, roof + 0.124, cz - 0.10); // grab handle
  // left hatch: flush ring, single lid, two fixed periscopes ahead of it
  const lx = 0.56, lz = -0.18;
  P.addCupola('turret', cylY(0.30, 0.315, 0.04, seg), lx, roof + 0.012, lz);
  P.addHatch('turret', cylY(0.26, 0.27, 0.03, seg), lx, roof + 0.045, lz);
  P.add('turretDark', torus(0.265, 0.008, seg), lx, roof + 0.033, lz);
  carroHatchHinge(P, lx + 0.285, roof + 0.032, lz, 1, roof + 0.060);             // r268b: on the ring, outboard
  P.add('turretDetail', box(0.022, 0.022, 0.16), lx - 0.06, roof + 0.072, lz);   // grab handle
  // r268b: the two fixed periscopes are heads with raked dark windows looking forward and out (were plain blocks)
  for (const dx of [-0.11, 0.11]) {
    const { housing, glass } = headParts(PERISCOPE_PROFILE, PERISCOPE_WINDOW, 0.07);
    P.addModuleVisual('optics', 'turretDark', housing, lx + dx, roof, lz + 0.36, 0, dx * 0.9, 0);
    P.addModuleVisual('optics', 'turretGlass', glass, lx + dx, roof, lz + 0.36, 0, dx * 0.9, 0);
  }
  // r268b: the whips' mounts are square base plates under their pots (italy.ts seats the pots at x ±0.82, z -1.42)
  for (const s of [-1, 1]) {
    P.add('turretDetail', roofPlate(0.17, 0.17, 0.014, 0.025), s * 0.82, roof + 0.002, -1.42);
  }
  // crosswind sensor mast at the rear of the roof (C1 Ariete pattern): pot, mast and a horizontal probe head
  P.add('turretDetail', cylY(0.045, 0.055, 0.05, 12), -0.34, roof + 0.015, -1.56);
  P.add('turretDetail', cylY(0.016, 0.018, 0.30, 8), -0.34, roof + 0.18, -1.56);
  P.add('turretDark', KIT.cylX(0.030, 0.12, 10), -0.34, roof + 0.345, -1.56);
  // armoured roof vent over the bustle magazine: a low domed cover on its ring
  P.add('turretDetail', cylY(0.15, 0.17, 0.035, seg), 0.10, roof + 0.012, -1.02);
  P.add('turretDetail', cylY(0.11, 0.15, 0.04, seg), 0.10, roof + 0.045, -1.02);
  P.add('turretDark', torus(0.152, 0.008, seg), 0.10, roof + 0.030, -1.02);
}

/** Bustle bins: one closed box a side, its inner faces 20 mm into the belt and the upper plate, a chamfered lid edge,
 *  a dark lid seam and two latches on the outer face. */
export function addCarroBustleBins(P: KitPort): void {
  const z0 = -1.56, z1 = -0.64, y0 = 0.14, y1 = 0.62, out = 1.69, ch = 0.035;
  for (const side of [-1, 1] as const) {
    const ring: SectionPoint[] = [[T.wall - 0.02, y0], [out, y0], [out, y1 - ch], [out - ch, y1],
      [carroSideX(y1, 0) - 0.02, y1], [T.wall - 0.02, T.belt]];
    const r = side > 0 ? ring : ring.map(([x, y]): SectionPoint => [-x, y]).reverse();
    P.addEquipment('turret', sectionSolid([{ z: z0, ring: r }, { z: z1, ring: r }]));
    P.add('turretDark', KIT.box(0.012, 0.014, z1 - z0 - 0.06), side * (out + 0.002), y1 - ch - 0.03, (z0 + z1) / 2);
    for (const lz of [z0 + 0.22, z1 - 0.22]) {
      P.add('turretDark', KIT.box(0.016, 0.07, 0.05), side * (out + 0.006), y1 - ch - 0.075, lz);
    }
  }
}

/** Rear face: the autoloader magazine's replenishment hatch above the basket, on the raked bustle face. */
export function addCarroRearHatch(P: KitPort): void {
  const z = T.rearZ - 0.006;
  P.addHatch('turret', KIT.box(0.78, 0.20, 0.024), 0, 0.66, z);
  P.add('turretDark', KIT.box(0.70, 0.012, 0.012), 0, 0.58, z - 0.012);
  for (const x of [-0.26, 0.26]) P.add('turretDark', KIT.box(0.10, 0.04, 0.03), x, 0.765, z - 0.006);
}

/** Lay an object flat on a side's upper plate: its local +y turned to the plate's outward normal, the middle of its
 *  underside on the plate at (y, z), sunk `embed` into it. */
export function seatOnCarroUpperPlate(object: THREE.Object3D, side: 1 | -1, y: number, z: number, embed = 0.006): void {
  object.position.set(0, 0, 0);
  object.rotation.set(0, 0, 0);
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  const foot = new THREE.Vector3((bounds.min.x + bounds.max.x) / 2, bounds.min.y, (bounds.min.z + bounds.max.z) / 2);
  const angle = -side * Math.atan2(1, T.lean);
  object.rotation.set(0, 0, angle);
  const normal = new THREE.Vector3(0, 1, 0).applyEuler(object.rotation);
  const surface = new THREE.Vector3(side * carroSideX(y, z), y, z).addScaledVector(normal, -embed);
  object.position.copy(surface.sub(foot.applyEuler(object.rotation)));
}

// ---------------------------------------------------------------------------------------------------------------------
// Hull kit on the retained print-measured hull: bolted skirt panels (the C1 Ariete's run, cut to this hull's fender
// line), the driver's hatch and periscopes on the upper glacis, lamp clusters on the nose corners, tow clevises, and a
// louvred exhaust grille, tail-light clusters and rear clevises on the stern, all under the 105's -8 degree sweep
// (tools/gun-depression-sweep.mjs: the gun keeps 26 mm over them at every yaw).

/** Skirt run a side: inner/outer faces, bottom bevel, panels with 10 mm joints. Rear to front: [z, bottom, top]. The
 *  bottom line rides just over the road wheels' tops (0.78), hiding the return rollers as the C1 Ariete's run does; the
 *  front panel runs over the raised idler to the fender's end, its top stepping down under the bow fender bays and
 *  its lower front corner cut at 45 degrees. */
const SKIRT_IN = 1.670, SKIRT_OUT = 1.706, SKIRT_BEVEL = 0.014, SKIRT_BOTTOM = 0.82;
const SKIRT_PANELS: readonly (readonly (readonly [number, number, number])[])[] = [
  [[-3.20, 1.10, 1.44], [-2.92, SKIRT_BOTTOM, 1.44], [-2.645, SKIRT_BOTTOM, 1.44]],         // over the sprocket, raked
  [[-2.635, SKIRT_BOTTOM, 1.44], [-1.55, SKIRT_BOTTOM, 1.44]],
  [[-1.54, SKIRT_BOTTOM, 1.44], [-0.46, SKIRT_BOTTOM, 1.44]],
  [[-0.45, SKIRT_BOTTOM, 1.44], [0.63, SKIRT_BOTTOM, 1.44]],
  [[0.64, SKIRT_BOTTOM, 1.44], [1.72, SKIRT_BOTTOM, 1.44]],
  [[1.73, SKIRT_BOTTOM, 1.44], [2.17, SKIRT_BOTTOM, 1.44], [2.18, SKIRT_BOTTOM, 1.42], [2.63, SKIRT_BOTTOM, 1.42],
    [2.64, SKIRT_BOTTOM, 1.36], [2.72, SKIRT_BOTTOM, 1.36], [3.05, SKIRT_BOTTOM + 0.33, 1.36]],  // over the idler
];

export function addCarroSkirts(P: KitPort): void {
  const { cylX } = KIT;
  for (const side of [-1, 1] as const) {
    for (const panel of SKIRT_PANELS) {
      const geometry = sectionSolid(panel.map(([z, bottom, top]) => {
        const ring: SectionPoint[] = [[SKIRT_IN, bottom], [SKIRT_OUT - SKIRT_BEVEL, bottom],
          [SKIRT_OUT, bottom + SKIRT_BEVEL], [SKIRT_OUT, top], [SKIRT_IN, top]];
        return { z, ring: side > 0 ? ring : ring.map(([x, y]): SectionPoint => [-x, y]).reverse() };
      }), { sideQuadDiagonal: 'convex' });
      P.add('hull', geometry);
      // bolt heads along the top hanger line, 35 mm under the panel's own top, flush-headed (6 mm proud)
      const z0 = panel[0][0], z1 = panel[panel.length - 1][0], n = z1 - z0 > 0.8 ? 4 : 3;
      const topAt = (z: number): number => panel.reduce((top, [sz, , st]) => (sz <= z ? st : top), panel[0][2]);
      for (let k = 0; k < n; k++) {
        const z = z0 + (z1 - z0) * (k + 0.5) / n;
        P.add('hullDetail', cylX(0.016, 0.014, 8), side * (SKIRT_OUT + 0.001), topAt(z) - 0.035, z);  // outer face 1.714, inside the 1.715 hem
      }
    }
  }
}

/** Upper glacis line (the retained frustum's top): y at z on the plate from (2.24, 1.468) to (3.10, 1.24). */
const glacisY = (z: number): number => 1.468 - (z - 2.24) * (0.228 / 0.86);
const GLACIS_TILT = Math.atan2(0.228, 0.86);

export function addCarroBowKit(P: BowPort): void {
  const { box, cylY, cylX } = KIT;
  const seg = P.q ? 22 : 12;
  // driver's hatch (right front) on the upper glacis, its three periscopes ahead of it
  const hx = -0.48, hz = 2.42, hy = glacisY(hz);
  const nY = Math.cos(GLACIS_TILT), nZ = Math.sin(GLACIS_TILT);
  // r268b (owner: "add more upper glacis and roof details"): the lid sits in a raised welded coaming ring
  P.addCupola('hull', cylY(0.305, 0.315, 0.018, seg), hx, hy + nY * 0.001, hz + nZ * 0.001, GLACIS_TILT, 0, 0);
  P.addHatch('hull', cylY(0.25, 0.262, 0.034, seg), hx, hy + nY * 0.012, hz + nZ * 0.012, GLACIS_TILT, 0, 0);
  P.add('hullDark', KIT.torus(0.256, 0.008, seg), hx, hy + nY * 0.004, hz + nZ * 0.004, GLACIS_TILT, 0, 0);
  // r268b: the lid lifts and swings on an outboard pivot (OF-40 / Leopard 1 pattern): a pivot boss on the coaming, the
  // swing arm over the lid's edge onto its centre boss, and a spring housing along the coaming (was a plain block)
  // plate frame at the hatch centre: x across, h along the glacis normal, lz down the slope (forward)
  const onPlate = (g: THREE.BufferGeometry, lx: number, h: number, lz: number): THREE.BufferGeometry =>
    g.translate(lx, h, lz).applyMatrix4(new THREE.Matrix4().makeRotationX(GLACIS_TILT)).translate(hx, hy, hz);
  P.addHatch('hull', onPlate(cylY(0.045, 0.05, 0.06, 12), -0.29, 0.025, 0), 0, 0, 0);              // pivot boss
  P.addHatch('hull', onPlate(box(0.21, 0.022, 0.06), -0.20, 0.058, 0), 0, 0, 0);                   // swing arm
  P.addHatch('hull', onPlate(cylY(0.05, 0.05, 0.024, 12), -0.10, 0.038, 0), 0, 0, 0);              // lid boss
  P.add('hullDark', onPlate(KIT.cylZ(0.022, 0.18, 10), -0.30, 0.018, -0.14), 0, 0, 0);             // spring housing
  P.add('hullDetail', box(0.15, 0.02, 0.02), hx + 0.05, hy + nY * 0.040, hz + nZ * 0.040 - 0.06, GLACIS_TILT, 0, 0); // grab
  // r268b: the three driver's periscopes are heads with raked dark windows looking forward (were plain blocks)
  for (const k of [-1, 0, 1]) {
    const px = hx + k * 0.155, pz = 2.78 - Math.abs(k) * 0.03, py = glacisY(pz);
    const { housing, glass } = headParts(PERISCOPE_PROFILE, PERISCOPE_WINDOW, 0.07);
    P.addModuleVisual('optics', 'hull', housing, px, py, pz, GLACIS_TILT, k * 0.22, 0);
    P.addModuleVisual('optics', 'hullGlass', glass, px, py, pz, GLACIS_TILT, k * 0.22, 0);
  }
  addCarroGlacisJoints(P);
  // r268b: a course of five spare links of the vehicle's own 0.56 m track across the left half of the upper glacis (the
  // C1 Ariete carries its spare links across the glacis front), its carrier's feet 6 mm into the plate, clear of the
  // driver's periscopes (x -0.69..-0.27) and the left lift eye (x 1.05), 4 cm under the 105's -8 degree line
  const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 5, width: 0.56, seed: 4507 });
  links.updateMatrixWorld(true);
  const lift = -new THREE.Box3().setFromObject(links).min.y - 0.006, lz = 2.76;   // the carrier's underside, local
  links.rotation.set(GLACIS_TILT, Math.PI / 2, 0);                                 // the course along x, on the slope
  links.position.set(0.50, glacisY(lz) + Math.cos(GLACIS_TILT) * lift, lz + Math.sin(GLACIS_TILT) * lift);
  P.hullG.add(links);
  // lamp clusters on the nose corners: a squared housing, two lenses and a bar guard (C1 Ariete pattern), its
  // underside on the nose wedge's lowest point under it (the back sinks into the sloping plate). The lenses are the
  // vehicle's driving lights (vehicle-controls-inventory requires them; night lighting emits from them)
  for (const side of [-1, 1] as const) {
    const lx = side * 1.14, lz = 3.15, base = 1.25 - (lz + 0.06 - 3.08) * (0.19 / 0.29) - 0.004;
    P.add('hullDetail', box(0.30, 0.13, 0.12), lx, base + 0.065, lz);
    for (const dx of [-0.075, 0.075]) {
      P.add('hullGlass', markVehicleNightLens(KIT.cylZ(0.042, 0.012, 14), 'headlight'), lx + dx, base + 0.072, lz + 0.061);
      P.add('hullDark', KIT.cylZ(0.050, 0.010, 14), lx + dx, base + 0.072, lz + 0.057);
    }
    const foot = 1.25 - (lz + 0.098 - 3.08) * (0.19 / 0.29) - 0.008, head = base + 0.148;  // uprights stand on the nose
    for (const dx of [-0.13, 0.0, 0.13]) P.add('hullDark', box(0.016, head - foot, 0.016), lx + dx, (head + foot) / 2, lz + 0.098);
    P.add('hullDark', box(0.29, 0.016, 0.016), lx, base + 0.14, lz + 0.098);
    for (const dx of [-0.13, 0.13]) P.add('hullDark', box(0.016, 0.016, 0.05), lx + dx, base + 0.14, lz + 0.07);
  }
  // tow clevises on the lower glacis (face (2.70, 0.49) -> (3.47, 0.96)): two lugs and a pin each
  const chinTilt = Math.atan2(0.47, 0.77), cny = -Math.cos(chinTilt), cnz = Math.sin(chinTilt);
  for (const side of [-1, 1] as const) {
    const cz = 3.28, cy = 0.49 + (cz - 2.70) * (0.47 / 0.77), cx = side * 0.55;
    for (const dx of [-0.055, 0.055]) {
      P.add('hullDetail', box(0.03, 0.10, 0.13), cx + dx, cy + cny * 0.04, cz + cnz * 0.04, Math.PI - chinTilt, 0, 0);
    }
    P.add('hullDark', cylX(0.022, 0.15, 10), cx, cy + cny * 0.065, cz + cnz * 0.065);
  }
}

/** r268b: the bow's tow eyes (OF-40 pattern): one on the nose plate either side of centre, a lug welded to the plate
 *  with its ring. (No raised weld beads across the plate joints: the photographs show clean plates, and the round's
 *  first blind A/B read joint strips over a glacis as clutter.) */
function addCarroGlacisJoints(P: KitPort): void {
  const knuckleY = glacisY(3.08);
  // nose plate (3.08, 1.245) -> (3.37, 1.06): 32.5 degrees; each eye 0.12 m down it, its lug 10 mm into the plate
  const nose = Math.atan2(knuckleY - 1.06, 3.37 - 3.08), dirZ = Math.cos(nose), dirY = -Math.sin(nose);
  const z0 = 3.08 + dirZ * 0.12, y0 = knuckleY + dirY * 0.12, tilt = new THREE.Matrix4().makeRotationX(nose);
  // inboard of the lamp housings (x 0.99..1.29): a cast lug 9 cm tall, 15 mm into the plate, its ring through it
  for (const side of [-1, 1] as const) {
    const at = (g: THREE.BufferGeometry, h: number): THREE.BufferGeometry =>
      g.translate(0, h, 0).applyMatrix4(tilt).translate(side * 0.84, y0, z0);
    P.add('hullDetail', at(KIT.box(0.055, 0.09, 0.15), 0.030), 0, 0, 0);
    P.add('hullDark', at(new THREE.TorusGeometry(0.062, 0.020, 6, P.q ? 16 : 10).rotateY(Math.PI / 2), 0.092), 0, 0, 0);
  }
}

export function addCarroSternKit(P: KitPort): void {
  const { box, cylX, cylZ } = KIT;
  // louvred exhaust grille on the centre block's face (z -3.46): dark backing, a frame, eight slats raked down
  const face = -3.46, gy = 1.02;
  P.add('hullDark', box(1.78, 0.46, 0.012), 0, gy, face - 0.004);
  for (const dy of [-0.245, 0.245]) P.add('hull', box(1.84, 0.035, 0.03), 0, gy + dy, face - 0.010);
  for (const dx of [-0.905, 0.905]) P.add('hull', box(0.035, 0.525, 0.03), dx, gy, face - 0.010);
  P.add('hull', box(0.03, 0.455, 0.024), 0, gy, face - 0.010);                   // centre mullion
  for (let k = 0; k < 8; k++) {
    P.add('hullDetail', box(1.76, 0.052, 0.010), 0, gy - 0.20 + k * 0.057, face - 0.016, -0.60, 0, 0);
  }
  // tail-light clusters on the upper band (face z -3.43): housing, two lenses, a guard bar
  for (const side of [-1, 1] as const) {
    const tx = side * 1.15, ty = 1.30, tz = -3.43;
    P.add('hullDetail', box(0.22, 0.10, 0.05), tx, ty, tz - 0.02);
    for (const dx of [-0.05, 0.05]) P.add('hullGlass', cylZ(0.030, 0.010, 12), tx + dx, ty, tz - 0.047);
    P.add('hullDark', box(0.24, 0.014, 0.014), tx, ty + 0.064, tz - 0.026);       // hood bar over the lenses
    // rear tow clevis hanging under the centre block (bottom y 0.71)
    const cx = side * 0.62, cz = -3.415;
    for (const dx of [-0.055, 0.055]) P.add('hullDetail', box(0.03, 0.13, 0.09), cx + dx, 0.655, cz);
    P.add('hullDark', cylX(0.022, 0.15, 10), cx, 0.63, cz);
  }
}

/** Engine deck: one plate at 1.455 over the engine bay, 41 mm under the fighting-compartment deck (it replaces four
 *  stepped boxes, 1.474-1.556, whose seams cut the grille slats); its louvres stay under 1.48, inside the 105's -8
 *  degree sweep over the stern. */
export function addCarroEngineDeck(P: KitPort): void {
  P.add('hull', KIT.box(2.80, 0.06, 1.07), 0, 1.425, -2.785);                   // engine deck plate 1.395..1.455 (z -3.32..-2.25)
  // r268b (owner: "add more upper glacis and roof details"): the engine's side access plates either side of the
  // louvre field (x 1.07..1.37, z -3.17..-2.51, aft of the fuel caps), each with a folded lifting handle in a welded
  // guard (no bolt rows: the round's first A/B read them as a rivet grid); 9 mm proud, under the louvre frames' 1.470
  for (const side of [-1, 1] as const) {
    const px = side * 1.22, pz = -2.84;
    P.add('hull', roofPlate(0.30, 0.66, 0.012, 0.03), px, 1.458, pz);
    P.add('hullDetail', KIT.box(0.11, 0.010, 0.014), px, 1.468, pz + 0.17);       // folded handle bar
    for (const dx of [-0.05, 0.05]) P.add('hullDetail', KIT.box(0.012, 0.014, 0.03), px + dx, 1.466, pz + 0.17);
  }
}

/** The deck's two framed louvre fields (the caller tags them as grille, no seat for spare links). */
export function addCarroDeckLouvres(P: Pick<TankBuilderPort, 'add'>): void {
  const { box } = KIT;
  const field = (z0: number, z1: number, halfW: number, y: number, slats: number): void => {
    const zc = (z0 + z1) / 2, len = z1 - z0;
    P.add('hullDark', box(halfW * 2 - 0.04, 0.010, len - 0.04), 0, y + 0.002, zc);
    for (const dz of [-len / 2, len / 2]) P.add('hull', box(halfW * 2 + 0.04, 0.018, 0.04), 0, y + 0.006, zc + dz);
    for (const dx of [-halfW, 0, halfW]) P.add('hull', box(0.04, 0.018, len), dx, y + 0.006, zc);
    const step = (len - 0.08) / slats;
    for (const side of [-1, 1]) for (let k = 0; k < slats; k++) {
      P.add('hullDetail', box(halfW - 0.05, 0.008, step * 0.78), side * halfW / 2, y + 0.004, z0 + 0.04 + step * (k + 0.5), 0.40, 0, 0);
    }
  };
  field(-3.22, -2.42, 1.00, 1.455, 8);                                          // engine louvres
  field(-1.95, -1.45, 0.90, 1.490, 5);                                          // cooling intake ahead of the engine, under the mantlet's sweep
}

/** Upper glacis and nose wedge as one side-profile loft (the retained frustum and wedge lines), cut every 0.35 m
 *  across and in thirds along the slope so the hull's baked shading has no long diagonal seam across the plate. */
export function carroGlacisGeometry(): THREE.BufferGeometry {
  const profile: (readonly [number, number])[] = [[2.20, 1.24], [2.20, 1.468], [2.24, 1.468], [2.52, glacisY(2.52)],
    [2.80, glacisY(2.80)], [3.08, glacisY(3.08)], [3.37, 1.06], [3.06, 1.06], [3.06, 1.24]];
  const stations: [number, number][] = [];
  for (let k = 0; k <= 8; k++) stations.push([-1.40 + k * 0.35, 1]);
  return carroSideLoft(profile, stations);
}
