// KF51 EVO (`kf51_evo`): Rheinmetall's production Panther for Hungary (development contract 2023-12-15, with N7):
// three crew and an autoloader, the revised EVO turret built for a later 130 mm retrofit, StrikeShield stand-off protection
// and a Bueffel-derived Leopard 2 chassis. Its public form is the "PANTHER EVO UPGRADE" Rheinmetall showed at Eurosatory
// 2024 (the EVO turret on a Leopard 2A4 hull); where that vehicle shows no clear part, the 2022 Panther demonstrator
// supplies it. The game keeps the 130 mm: the Rh-130 L/52 in the EVO turret (the turret's planned retrofit).
//
// Reference packet: ~/cot-lanes/ifv-modern-267-evidence/research/kf51_evo/ (photos, sources.md, notes.md) and
// docs/references/tanks/kf51.md. Frames (all metres, +z forward, +x the vehicle's LEFT, y from the ground):
// - hull: Leopard 2 deck at 1.615 under the turret, long shallow upper glacis to a 3.83 nose, engine deck 1.76 aft; the
//   KF51 running gear (the Leopard 2 6X stations at the Panther's 0.587 track, `leoGear`) with its forged wheel faces.
//   The flank is the Eurosatory vehicle's Leopard 2A4 side (photos 2, 3): the bare upper band over the track with its
//   stowage lids and air grille, the bolted hanging rail (the step line), the large smooth skirt panels under it, the
//   three heavy skirt blocks forward; both rows are the gameplay's reactive flank jacket (kf51Specs.ts). The bow carries
//   the 2A4's box mudguards over the idlers, the standing spare track links, guarded headlights and shackled tow eyes
//   (photos 4, 5); the stern its full-width louvred grille, tail lights under the rail ends and hung mudflaps.
// - turret: the rig sits at hull (0, 1.71, 0.63) and the gun pivot at turret (0, 0.38, 0.90): the measured combat rig
//   (combatGunRigs.generated.ts) both hold. A low six-sided shell (roof 0.815, side crease 0.40) with two arrowhead
//   cheeks either side of a vertical gun-slot face at z 1.10 (x +-0.43, kf51Specs.ts's mantlet plate), a squared bustle
//   whose sides carry the hinged faceted stowage boxes (hinge stacks forward, handles, latches; photo 3), the gunner's
//   sight on the right cheek, the SEOSS panoramic sight behind it, twin-lens sensor heads and the rear-corner camera
//   wedges, the cone countermeasure launchers along the roof edges, the drone box on its mast at the rear centre, the
//   remote weapon station and three whips.
// - gun: a trunnion roll, the EVO's long hexagonal shroud (pointed top and foot, tapering forward to a raked open front,
//   three vents on each upper facet, a joint band), the Rh-130 tube (5.475 m from the pivot) with its thermal sleeve,
//   the stepped muzzle section and the box MRS.
// Copyright (c) 2026 Kevin B. Liu.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { KIT, FITTINGS, convexSlab, orientedSlab } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { lineAt, mirrorRing } from './leopard2Hull.ts';
import { LEOPARD_2_RUNNING_GEAR } from './leopardA6XWheels.ts';
import { leoGear, addLeopardOpenYokeAuxRws } from './leopard.ts';
import { bowShackle } from './leopard2A4Kit.ts';
import { antennaPart } from './antennaPart.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { drainTankBuild, withBuildSteps, type TankProfileBuild } from '../tankBuildCooperation.ts';

type P3 = readonly [number, number, number];
type Side = -1 | 1;

const GEAR = LEOPARD_2_RUNNING_GEAR;
const TRACK_XC = 1.262;
const TRACK_W = 0.587;

/** Hull deck line [z, y] (ascending z): the engine deck, the fighting compartment roof under the turret, the upper glacis. */
const DECK: ReadonlyArray<readonly [number, number]> = [
  [-3.74, 1.765], [-2.66, 1.76], [-2.34, 1.69], [-1.50, 1.62], [0.0, 1.615], [1.80, 1.615],
  [2.05, 1.585], [2.70, 1.475], [3.30, 1.36], [3.70, 1.27], [3.83, 1.235],
];
/** Belly line [z, y]: the rear plate's foot, the flat belly at the Leopard's 0.47 clearance, the lower glacis to the nose. */
const BELLY: ReadonlyArray<readonly [number, number]> = [
  [-3.74, 0.95], [-3.40, 0.62], [-2.95, 0.47], [3.05, 0.47], [3.72, 0.98], [3.83, 1.10],
];
const TUB_HW = 0.94;          // inside the track lane's 0.9685 inner face
const SPONSON_HW = 1.69;
const SPONSON_FLOOR = 1.30;   // over the 1.20 track top and both end wraps
const HULL_REAR = -3.74;
const HULL_NOSE = 3.83;
const SKIRT_HEM = GEAR.skirtHemY;

/**
 * The Leopard 2A4 flank (photos 2, 3): the upper band's panel 10 mm into the sponson wall out to 1.735, the hanging
 * rail along its foot, the thin skirt panels 1.70-1.75 under it and the heavy fore blocks out to the 1.80 width guard.
 */
const BAND_IN = SPONSON_HW - 0.01;
const BAND_OUT = 1.735;
const BAND_FOOT = SPONSON_FLOOR;
const RAIL_X = 1.752;
const RAIL_Y = 1.318;
const RAIL_R = 0.03;
const SKIRT_IN = 1.70;
const SKIRT_OUT = 1.75;
const SKIRT_TOP = 1.325;       // 25 mm up into the band's foot
const BLOCK_OUT = 1.80;        // the 3.60 m width guard (leopard.ts WIDTH GUARD)
/** The upper band's two panels and the skirt's three thin panels (rear to front), the three heavy blocks forward. */
const BAND_PANELS: ReadonlyArray<readonly [number, number]> = [[-3.66, -0.394], [-0.386, 2.98]];
const THIN_PANELS: ReadonlyArray<readonly [number, number]> = [[-3.56, -1.61], [-1.59, 0.23], [0.25, 1.45]];
const HEAVY_BLOCKS: ReadonlyArray<readonly [number, number]> = [[1.44, 1.95], [1.97, 2.47], [2.49, 2.99]];
/** The front mudguard boxes over the idlers: their run, their top falling to the nose, their lip and underside. */
const GUARD_Z0 = 2.975;
const GUARD_Z1 = 3.845;
const GUARD_UNDER = 1.245;     // 4.6 cm over the track's 1.199 top run
const GUARD_LIP = 1.02;
const guardTop = (z: number): number => 1.43 - 0.07 * (z - GUARD_Z0) / (GUARD_Z1 - GUARD_Z0);

/** Turret-local datums. */
const T_ROOF = 0.815;
const T_CREASE = 0.40;
const T_FLOOR = -0.035;
const SLOT_HW = 0.43;         // the gun slot's half width: the cheeks' inner walls (kf51Specs.ts KF51_MANTLET)
const SLOT_FACE_Z = 1.10;     // the vertical gun-slot face (kf51EvoGunFace.selftest.mjs)
/** The cheeks' swept front ridge at the slot: the 266 cheek datum the gun-face receipt's cheek rounds were proven on. */
const CHEEK_RIDGE_Y = 0.40;
const CHEEK_TIP_Z = 2.42;

const deckY = (z: number): number => lineAt(DECK, z);
const bellyY = (z: number): number => lineAt(BELLY, z);
const glacisTilt = (z: number): number => Math.atan2(deckY(z - 0.05) - deckY(z + 0.05), 0.10);
const mirror3 = (s: Side, [x, y, z]: P3): P3 => [s * x, y, z];
/** Every deck and belly break between z0 and z1, so a loft draws both lines exactly. */
function stations(z0: number, z1: number, extra: readonly number[] = []): number[] {
  const zs = new Set<number>([z0, z1, ...extra.filter((z) => z > z0 && z < z1)]);
  for (const [z] of [...DECK, ...BELLY]) if (z > z0 && z < z1) zs.add(z);
  return [...zs].sort((a, b) => a - b);
}
const sideRing = (s: Side, ring: SectionPoint[]): SectionPoint[] => (s > 0 ? ring : mirrorRing(ring));
/** Intermediate stations every `step` metres inside z0..z1 (long flat panels stay finely split, so the proud fittings on
 * them hold their depth order in a perspective raster's screen-space interpolation). */
const every = (z0: number, z1: number, step = 0.45): number[] => {
  const n = Math.ceil((z1 - z0) / step);
  return Array.from({ length: Math.max(0, n - 1) }, (_, i) => z0 + (z1 - z0) * (i + 1) / n);
};
/** A closed convex solid over any corner set (a raked shroud, a faceted box, a wedge head), its uv laid on x-z. */
function hullOf(points: readonly P3[]): THREE.BufferGeometry {
  const geometry = new ConvexGeometry(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const position = geometry.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < position.count; i++) uv.push(position.getX(i), position.getZ(i));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

// ---------------------------------------------------------------------------------------------------------------- hull
/** The welded tub between the tracks (belly, lower glacis, nose) and the two sponsons over the tracks. */
function addHullShell(P: TankBuilderPort): void {
  P.add('hull', sectionSolid(stations(HULL_REAR, HULL_NOSE).map((z): SolidSection => {
    const roof = deckY(z), floor = Math.min(bellyY(z), roof - 0.10);
    const bevel = Math.min(0.06, (roof - floor) * 0.3);
    return { z, ring: [[-TUB_HW + bevel, floor], [TUB_HW - bevel, floor], [TUB_HW, floor + bevel], [TUB_HW, roof],
      [-TUB_HW, roof], [-TUB_HW, floor + bevel]] };
  })));
  for (const s of [-1, 1] as const) {
    // the sponson from the tub wall out over the track, flat-floored, its top the deck line with a rolled outer edge;
    // it ends under the front mudguard where the glacis falls to the idler
    P.add('hull', sectionSolid(stations(HULL_REAR, 3.10).map((z): SolidSection => {
      const top = deckY(z);
      return { z, ring: sideRing(s, [[TUB_HW - 0.02, SPONSON_FLOOR], [SPONSON_HW, SPONSON_FLOOR],
        [SPONSON_HW, top - 0.03], [SPONSON_HW - 0.03, top], [TUB_HW - 0.02, top]]) };
    })));
  }
}

/**
 * The Leopard 2A4's front mudguard boxes over the idlers (photos 1, 4, 5): a deep box from the glacis's edge out to the
 * width guard, its top falling gently to the nose, its front face and outer wall dropping to a lip ahead of and beside
 * the idler's wrap (its underside clears the track's top run), two lugs on its face; a short rubber flap hangs under
 * the face.
 */
function addFrontMudguards(P: TankBuilderPort): void {
  const zs = [GUARD_Z0, 3.30, 3.70, GUARD_Z1];
  for (const s of [-1, 1] as const) {
    // the box's body over the track lane, its outer top edge chamfered
    P.add('hull', sectionSolid(zs.map((z): SolidSection => {
      const top = guardTop(z);
      return { z, ring: sideRing(s, [[TUB_HW - 0.01, GUARD_UNDER], [BLOCK_OUT, GUARD_UNDER], [BLOCK_OUT, top - 0.03],
        [BLOCK_OUT - 0.03, top], [TUB_HW - 0.01, top]]) };
    })));
    // the outer wall and the front face drop to the lip, outboard of and ahead of the idler's wrap
    P.add('hull', sectionSolid(zs.map((z): SolidSection => ({
      z, ring: sideRing(s, [[1.748, GUARD_LIP], [BLOCK_OUT, GUARD_LIP], [BLOCK_OUT, GUARD_UNDER + 0.02], [1.748, GUARD_UNDER + 0.02]]),
    }))));
    P.add('hull', orientedSlab(
      mirror3(s, [TUB_HW - 0.01, GUARD_LIP, 3.79]), mirror3(s, [BLOCK_OUT, GUARD_LIP, 3.79]),
      mirror3(s, [BLOCK_OUT, GUARD_LIP, GUARD_Z1]), mirror3(s, [TUB_HW - 0.01, GUARD_LIP, GUARD_Z1]),
      mirror3(s, [TUB_HW - 0.01, GUARD_UNDER + 0.02, 3.79]), mirror3(s, [BLOCK_OUT, GUARD_UNDER + 0.02, 3.79]),
      mirror3(s, [BLOCK_OUT, GUARD_UNDER + 0.02, GUARD_Z1]), mirror3(s, [TUB_HW - 0.01, GUARD_UNDER + 0.02, GUARD_Z1])));
    // two lugs on the face
    for (const x of [1.22, 1.52]) P.add('hullDetail', KIT.box(0.035, 0.09, 0.03), s * x, 1.24, GUARD_Z1 + 0.008);
    P.hangMudguard(`kf51evo-front-flap-${s < 0 ? 'right' : 'left'}`, 'hullRubber', KIT.box(0.70, 0.16, 0.02),
      s * 1.32, GUARD_LIP - 0.07, GUARD_Z1 - 0.015);
  }
}

/** One spare track link stood on the glacis's front edge, leaning back: its shoe and the X of its cast underside. */
function standingLink(P: TankBuilderPort, x: number, z: number, lean: number): void {
  const { box, xform } = KIT;
  const h = 0.27;
  const foot = deckY(z) - 0.012;
  const cy = foot + (h / 2) * Math.cos(lean), cz = z - (h / 2) * Math.sin(lean);
  P.add('hullDark', box(0.125, h, 0.05), x, cy, cz, -lean, 0, 0);
  const cross = KIT.mergeAll([0.42, -0.42].map((a) => xform(box(0.022, h * 1.02, 0.014), 0, 0, 0.029, 0, 0, a)));
  P.add('hullDark', cross, x, cy, cz, -lean, 0, 0);
}

/** The bow (photos 1, 4, 5): the standing spare-link racks across the glacis's front edge with the two rubber-pad links
 * between them, the headlights in their guards on brackets, the tow eyes with their shackles and the centre clevis; the
 * driver's hatch and periscopes on the glacis. */
function addBowFittings(P: TankBuilderPort): void {
  const { box, cylY, cylZ } = KIT;
  // the spare links: three a side standing on the glacis's front edge, two pad links laid between them, a holder bar
  // under each rack (they stand beyond the shroud's reach at full depression)
  const lean = 0.35, rackZ = 3.735;
  for (const s of [-1, 1] as const) {
    for (const x of [0.40, 0.535, 0.67]) standingLink(P, s * x, rackZ, lean);
    P.add('hullDetail', box(0.42, 0.035, 0.06), s * 0.535, deckY(rackZ + 0.02) + 0.005, rackZ + 0.02, glacisTilt(rackZ), 0, 0);
    const pz = 3.70, py = deckY(pz);
    P.add('hullRubber', box(0.25, 0.085, 0.17), s * 0.155, py + 0.034, pz, glacisTilt(pz), 0, 0);
    P.add('hullDark', box(0.26, 0.05, 0.05), s * 0.155, py + 0.03, pz + 0.10, glacisTilt(pz), 0, 0);
  }
  for (const s of [-1, 1] as const) {
    // the headlight on its bracket at the glacis's edge, a guard hood over it and cheeks either side
    const hx = s * 0.86, hz = 3.84, hy = 1.345, hr = 0.075;
    P.add('hullDetail', box(0.16, 0.09, 0.12), hx, deckY(3.79) + 0.03, 3.79);
    KIT.headlight(P, hx, hy, hz, 0, hr);
    P.add('hullDetail', box(0.20, 0.014, 0.13), hx, hy + hr + 0.002, hz + 0.01);
    for (const dx of [-(hr + 0.012), hr + 0.012]) P.add('hullDetail', box(0.014, 0.14, 0.11), hx + dx, hy + 0.01, hz + 0.005);
    // the tow eye on the nose face with its shackle
    P.add('hullDetail', box(0.13, 0.12, 0.08), s * 0.64, 1.165, HULL_NOSE + 0.012);
    bowShackle(P, s * 0.64, 1.075, HULL_NOSE + 0.052);
  }
  P.add('hullDetail', box(0.16, 0.10, 0.07), 0, 1.17, HULL_NOSE + 0.01);
  bowShackle(P, 0, 1.085, HULL_NOSE + 0.045);
  // the driver (front right, -x) under the turret's right cheek: hatch on the roof's front, three periscopes ahead
  const hz = 1.98, hy = deckY(hz), tilt = glacisTilt(hz);
  P.add('hullDetail', cylY(0.30, 0.31, 0.03, P.q ? 24 : 14), -0.55, hy + 0.008, hz, tilt, 0, 0);
  P.addHatch('hullHatch', cylY(0.25, 0.25, 0.028, P.q ? 20 : 12), -0.55, hy + 0.034, hz, tilt, 0, 0);
  P.add('hullDark', box(0.22, 0.016, 0.03), -0.55, hy + 0.052, hz - 0.10, tilt, 0, 0);
  for (const dx of [-0.16, 0, 0.16]) {
    const z = 2.30, y = deckY(z);
    P.add('hullDetail', box(0.14, 0.07, 0.10), -0.55 + dx, y + 0.03, z, glacisTilt(z), 0, 0);
    P.add('hullGlass', box(0.11, 0.028, 0.012), -0.55 + dx, y + 0.045, z + 0.051, glacisTilt(z), 0, 0);
  }
  // a bolted access plate and the horn on the glacis' left
  P.add('hullDetail', box(0.46, 0.012, 0.36), 0.62, deckY(2.55) + 0.004, 2.55, glacisTilt(2.55), 0, 0);
  P.add('hullDark', cylZ(0.035, 0.05, 10), 1.20, deckY(2.85) + 0.035, 2.85, glacisTilt(2.85), 0, 0);
}

/** The engine deck (fan covers, radiator louvres, access plates) and the stern (photos 2, 3): the full-width louvred
 * grille under the deck's lip, the tail lights under the rail ends, the hung mudflaps, tow hooks and cables. */
function addEngineDeckAndStern(P: TankBuilderPort): void {
  const { box, cylY, torus } = KIT;
  const seg = P.q ? 32 : 18;
  for (const s of [-1, 1] as const) {
    // the two round cooling-fan covers with their rims, three spokes and hubs
    const fx = s * 0.62, fz = -3.18, fy = deckY(fz);
    P.add('hullDark', cylY(0.40, 0.40, 0.008, seg), fx, fy + 0.002, fz);
    P.add('hullDetail', torus(0.40, 0.02, seg), fx, fy + 0.010, fz);
    for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) P.add('hullDetail', box(0.78, 0.014, 0.02), fx, fy + 0.010, fz, 0, a, 0);
    P.add('hullDetail', cylY(0.07, 0.07, 0.025, 12), fx, fy + 0.014, fz);
    // radiator louvres outboard of the fans
    const rx = s * 1.36, rz = -3.10, ry = deckY(rz);
    P.add('hullDark', box(0.40, 0.006, 0.80), rx, ry + 0.003, rz);
    for (let k = 0; k < 8; k++) P.add('hullDetail', box(0.40, 0.012, 0.035), rx, ry + 0.012, rz - 0.35 + k * 0.10, 0.35, 0, 0);
    // a bolted access plate on the deck ahead of the engine (outside the bustle's sweep)
    P.add('hullDetail', box(0.62, 0.010, 0.44), s * 0.70, deckY(-2.86) + 0.005, -2.86);
    // the stern's corners: the tail-light housing under the sponson's end, its two lenses facing aft
    P.add('hullDetail', box(0.16, 0.10, 0.12), s * 1.60, SPONSON_FLOOR - 0.045, HULL_REAR + 0.04);
    P.add('hullGlass', box(0.06, 0.05, 0.012), s * 1.635, SPONSON_FLOOR - 0.045, HULL_REAR - 0.024);
    P.add('hullGlass', box(0.05, 0.05, 0.012), s * 1.565, SPONSON_FLOOR - 0.045, HULL_REAR - 0.024);
    // the tow hook low on the rear plate, its eye standing in the hook
    P.add('hullDetail', box(0.13, 0.11, 0.10), s * 0.78, 1.06, HULL_REAR - 0.045);
    P.add('hullDark', torus(0.055, 0.018, 10), s * 0.78, 1.00, HULL_REAR - 0.11, Math.PI / 2, 0, 0);
    // the mudflap's bracket under the sponson's end and the rubber flap hung from it behind the sprocket
    P.add('hullDetail', box(0.52, 0.05, 0.10), s * 1.30, SPONSON_FLOOR - 0.015, HULL_REAR - 0.01);
    P.hangMudguard(`kf51evo-rear-flap-${s < 0 ? 'right' : 'left'}`, 'hullRubber', KIT.box(0.50, 0.50, 0.022),
      s * 1.30, 1.03, HULL_REAR - 0.045);
    KIT.liftEye(P, 'hullDetail', s * 1.52, deckY(-3.55) + 0.012, -3.55);
    KIT.liftEye(P, 'hullDetail', s * 1.52, deckY(2.45) + 0.012, 2.45);
  }
  P.add('hullDetail', box(0.30, 0.012, 0.86), 0, deckY(-3.18) + 0.006, -3.18);
  // the louvred grille across the upper rear plate under the deck's lip: dark backing, nine slats, its frame and centre
  // post (the Leopard 2's full-width rear grille)
  const g0 = 1.335, g1 = 1.745, gw = 2 * (SPONSON_HW - 0.03);
  P.add('hullDark', box(gw, g1 - g0, 0.012), 0, (g0 + g1) / 2, HULL_REAR - 0.004);
  for (let k = 0; k < 9; k++) P.add('hullDetail', box(gw, 0.016, 0.062), 0, g0 + 0.036 + k * 0.043, HULL_REAR - 0.029, -0.12, 0, 0);
  for (const y of [g0 - 0.005, g1 + 0.004]) P.add('hullDetail', box(gw + 0.04, 0.03, 0.066), 0, y, HULL_REAR - 0.031);
  for (const x of [-(gw / 2 + 0.005), 0, gw / 2 + 0.005]) P.add('hullDetail', box(0.04, g1 - g0, 0.066), x, (g0 + g1) / 2, HULL_REAR - 0.031);
  P.add('hullDetail', box(0.30, 0.09, 0.05), 0, 1.255, HULL_REAR - 0.02);      // convoy light under the grille
  for (const s of [-1, 1] as const) {
    KIT.towCable(P, [[s * 0.78, 1.00, HULL_REAR - 0.06], [s * 0.30, 1.10, HULL_REAR - 0.035], [-s * 0.50, 1.20, HULL_REAR - 0.035],
      [-s * 1.10, 1.24, HULL_REAR - 0.04]], 0.017);
  }
}

/** The KF51 running gear: the Leopard 2 stations at the Panther's own track, and its forged road-wheel faces (the
 * kf51-forged-face construction nationWheelSets.ts names), every layer bound to the suspension. */
function addRunningGear(P: TankBuilderPort): void {
  leoGear(P, {
    xc: TRACK_XC, trackW: TRACK_W, wheelR: GEAR.wheelR, wheelY: GEAR.wheelY,
    span: [GEAR.wheelZs[6], GEAR.wheelZs[0]], wheelZs: GEAR.wheelZs,
    sprocket: GEAR.sprocket, idler: GEAR.idler,
    rollers: GEAR.rollerZs.map((z) => ({ z, y: GEAR.rollerY, r: GEAR.rollerR })),
    topY: GEAR.topY, botY: GEAR.botY, dishR: 0.78,
  });
  const gear = P.gear;
  if (!gear) throw new Error('kf51_evo: running gear must exist before its wheel faces');
  const { box, cylX, torus, xform } = KIT;
  const outset = 0.088;
  gear.addRoadWheelLayer(torus(0.292, 0.018, P.q ? 30 : 20).rotateZ(Math.PI / 2), P.mats.wheels,
    { outset, name: 'gearRoadWheelForgedOuterRims', appearanceRole: 'wheelDish' });
  gear.addRoadWheelLayer(torus(0.226, 0.014, P.q ? 26 : 18).rotateZ(Math.PI / 2), P.mats.dark,
    { outset: outset + 0.004, name: 'gearRoadWheelRecessRings', appearanceRole: 'wheelInset' });
  gear.addRoadWheelLayer(KIT.mergeAll(Array.from({ length: 8 }, (_, i) => {
    const a = i * Math.PI / 4;
    return xform(box(0.022, 0.052, 0.138), 0, Math.sin(a) * 0.205, Math.cos(a) * 0.205, -a);
  })), P.mats.wheels, { outset: outset + 0.008, name: 'gearRoadWheelForgedRibs', appearanceRole: 'wheelDish' });
  gear.addRoadWheelLayer(cylX(0.122, 0.040, P.q ? 22 : 16), P.mats.wheels,
    { outset: outset + 0.012, name: 'gearRoadWheelServiceHubs', appearanceRole: 'wheelDish' });
  gear.addRoadWheelLayer(cylX(0.068, 0.046, P.q ? 16 : 12), P.mats.dark,
    { outset: outset + 0.016, name: 'gearRoadWheelHubCaps', appearanceRole: 'wheelInset' });
  gear.addRoadWheelLayer(KIT.mergeAll(Array.from({ length: 10 }, (_, i) => {
    const a = i * Math.PI / 5 + 0.16;
    return xform(cylX(0.012, 0.034, P.q ? 8 : 6), 0, Math.sin(a) * 0.143, Math.cos(a) * 0.143);
  })), P.mats.dark, { outset: outset + 0.021, name: 'gearRoadWheelServiceBolts', appearanceRole: 'wheelInset' });
  // sprocket and idler drum faces: rim ring, hub, bolt collar (inside the wraps' moving chain)
  for (const s of [-1, 1] as const) {
    const { sprocket: sk, idler: id } = GEAR;
    P.add('hullRunningGearDark', torus(0.193, 0.019, 20), s * 1.492, sk.y, sk.z, 0, 0, Math.PI / 2);
    P.add('hullRunningGearDetail', torus(0.157, 0.015, 18), s * 1.497, sk.y, sk.z, 0, 0, Math.PI / 2);
    P.add('hullRunningGearDark', cylX(0.075, 0.034, 12), s * 1.503, sk.y, sk.z);
    P.add('hullRunningGearDark', torus(0.167, 0.018, 20), s * 1.472, id.y, id.z, 0, 0, Math.PI / 2);
    P.add('hullRunningGearDark', cylX(0.065, 0.032, 12), s * 1.483, id.y, id.z);
  }
  P.hullG.userData.kf51EvoRunningGearReceipt = Object.freeze({
    runningGear: 'leopard-2a6-x-stations', trackCentreXM: TRACK_XC, trackWidthM: TRACK_W,
    roadWheelsPerSide: GEAR.wheelZs.length, wheelConstruction: 'kf51-forged-face', forgedFaceLayers: 6,
    sprocket: 'rear', idler: 'front-raised',
  });
}

/** A flat lid on a vertical face at x (outward s), bevelled 6 mm, from 2 mm inside the face out 10 mm. */
function sideLid(s: Side, x: number, y0: number, y1: number, z0: number, z1: number): THREE.BufferGeometry {
  const b = 0.010, xi = x - 0.002, xo = x + 0.016;
  return convexSlab(
    mirror3(s, [xi, y0, z0]), mirror3(s, [xi, y0, z1]), mirror3(s, [xi, y1, z1]), mirror3(s, [xi, y1, z0]),
    mirror3(s, [xo, y0 + b, z0 - b]), mirror3(s, [xo, y0 + b, z1 + b]), mirror3(s, [xo, y1 - b, z1 + b]), mirror3(s, [xo, y1 - b, z0 - b]));
}

/**
 * The Leopard 2A4 flank, the gameplay's two-row reactive jacket (kf51Specs.ts kf51_skirt_era_L/R): the upper row is the
 * band's two large panels over the sponson wall (its two stowage lids with handles and latches, the air grille), the
 * lower row the skirt hung under the bolted rail: three large smooth thin panels aft and three heavy bolted blocks
 * forward, their foot rising at the leader; lifting handles on the blocks' tops.
 */
function addLeopard2Flank(P: TankBuilderPort): void {
  const { box, cylX, cylZ, torus } = KIT;
  const bandTop = (z: number): number => deckY(z) - 0.006;
  for (const s of [-1, 1] as const) {
    P.visualEraCluster('kf51-evo-leopard2-skirt', 'hull', () => {
      // the upper row: the band's panels, their outer top edge chamfered under the deck's rolled edge
      for (const [z0, z1] of BAND_PANELS) {
        P.add('hull', sectionSolid(stations(z0, z1, every(z0, z1)).map((z): SolidSection => {
          const top = bandTop(z), c = Math.min(0.03, (top - BAND_FOOT) * 0.3);
          return { z, ring: sideRing(s, [[BAND_IN, BAND_FOOT], [BAND_OUT - 0.012, BAND_FOOT], [BAND_OUT, BAND_FOOT + 0.012],
            [BAND_OUT, top - c], [BAND_OUT - c, top], [BAND_IN, top]]) };
        })));
      }
      // its two stowage lids (photo 2): a handle across the top, two latches on the foot
      for (const [z0, z1] of [[-3.28, -2.38], [-2.10, -1.28]] as const) {
        const y1 = Math.min(bandTop(z0), bandTop(z1)) - 0.075, y0 = 1.375, zc = (z0 + z1) / 2;
        P.add('hullDetail', sideLid(s, BAND_OUT, y0, y1, z1, z0));
        P.add('hullDetail', box(0.022, 0.022, 0.20), s * (BAND_OUT + 0.036), y1 - 0.05, zc);
        for (const dz of [-0.085, 0.085]) P.add('hullDetail', box(0.024, 0.02, 0.02), s * (BAND_OUT + 0.024), y1 - 0.05, zc + dz);
        for (const z of [z0 + 0.12, z1 - 0.12]) P.add('hullDetail', box(0.022, 0.05, 0.035), s * (BAND_OUT + 0.022), y0 + 0.02, z);
      }
      // the air grille ahead of them: a dark recess and six upright slats
      P.add('hullDark', box(0.012, 0.18, 0.25), s * (BAND_OUT + 0.001), 1.48, -0.82);
      for (let k = 0; k < 6; k++) P.add('hullDetail', box(0.018, 0.17, 0.012), s * (BAND_OUT + 0.006), 1.48, -0.925 + k * 0.042);
      // the lower row aft: three large thin panels under the rail, the leader's foot rising toward the heavy blocks
      for (const [z0, z1] of THIN_PANELS) {
        const leader = z1 > 1.0;
        const hem = (z: number): number => (leader ? SKIRT_HEM + 0.07 * Math.max(0, z - 0.70) / (z1 - 0.70) : SKIRT_HEM);
        P.add('hull', sectionSolid([...new Set([z0, ...every(z0, z1), ...(leader ? [0.70] : []), z1])].sort((a, b) => a - b).map((z): SolidSection => ({
          z, ring: sideRing(s, [[SKIRT_IN, hem(z)], [SKIRT_OUT - 0.018, hem(z)], [SKIRT_OUT, hem(z) + 0.018],
            [SKIRT_OUT, SKIRT_TOP], [SKIRT_IN, SKIRT_TOP]]),
        }))));
        // the bolt row under the rail and a sparse row lower on the panel
        const n = Math.max(2, Math.round((z1 - z0) / 0.30));
        for (let k = 0; k < n; k++) {
          const z = z0 + (z1 - z0) * (k + 0.5) / n;
          P.add('hullDetail', cylX(0.016, 0.012, 8), s * (SKIRT_OUT + 0.003), RAIL_Y - 0.065, z);
          if (k % 2 === 1) P.add('hullDetail', cylX(0.016, 0.012, 8), s * (SKIRT_OUT + 0.003), hem(z) + 0.16, z);
        }
      }
      // the hanging rail along the band's foot (the step line), its joint bolts and the big nut on its end
      const r0 = THIN_PANELS[0][0], r1 = THIN_PANELS[THIN_PANELS.length - 1][1] - 0.02;
      P.add('hullDetail', cylZ(RAIL_R, r1 - r0, 8), s * RAIL_X, RAIL_Y, (r0 + r1) / 2);
      for (const z of [-1.60, 0.24]) P.add('hullDetail', cylX(0.034, 0.03, 6), s * (BLOCK_OUT - 0.016), RAIL_Y, z);
      P.add('hullDetail', cylZ(0.042, 0.035, 6), s * RAIL_X, RAIL_Y, r0 - 0.012);
      // the lower row forward: three heavy blocks to the width guard, the leader's foot raked up to the mudguard box
      HEAVY_BLOCKS.forEach(([z0, z1], index) => {
        const leader = index === HEAVY_BLOCKS.length - 1;
        const foot = (z: number): number => (leader ? 0.94 + 0.16 * Math.max(0, z - (z1 - 0.28)) / 0.28 : 0.94);
        P.add('hull', sectionSolid((leader ? [z0, z1 - 0.28, z1] : [z0, z1]).map((z): SolidSection => ({
          z, ring: sideRing(s, [[SPONSON_HW, foot(z)], [BLOCK_OUT - 0.022, foot(z)], [BLOCK_OUT, foot(z) + 0.022],
            [BLOCK_OUT, SKIRT_TOP - 0.015], [BLOCK_OUT - 0.015, SKIRT_TOP], [SPONSON_HW, SKIRT_TOP]]),
        }))));
        // its face bolts (heads to 1.807, inside the 1.809 guard) and the two lifting handles standing on its top
        for (const z of [z0 + 0.09, z1 - (leader ? 0.30 : 0.09)]) {
          for (const y of [SKIRT_TOP - 0.06, foot(z) + 0.07]) P.add('hullDetail', cylX(0.02, 0.014, 8), s * BLOCK_OUT, y, z);
        }
        for (const z of [z0 + 0.14, z1 - 0.14]) {
          P.add('hullDetail', torus(0.05, 0.010, 10, 6), s * (BLOCK_OUT - 0.035), SKIRT_TOP + 0.012, z, 0, 0, Math.PI / 2);
        }
      });
    });
  }
  P.hullG.userData.kf51EvoFlankReceipt = Object.freeze({
    profile: 'kf51-evo-leopard2-skirt-r2', protectionRows: 2,
    upperRow: Object.freeze({ panelsPerSide: BAND_PANELS.length, innerFaceX: BAND_IN, outerFaceX: BAND_OUT, footY: BAND_FOOT,
      stowageLidsPerSide: 2 }),
    lowerRow: Object.freeze({ thinPanelsPerSide: THIN_PANELS.length, heavyBlocksPerSide: HEAVY_BLOCKS.length,
      thinOuterFaceX: SKIRT_OUT, heavyOuterFaceX: BLOCK_OUT, hemY: SKIRT_HEM, topY: SKIRT_TOP }),
    modulesPerSide: THIN_PANELS.length + HEAVY_BLOCKS.length,
    rail: Object.freeze({ y: RAIL_Y, outerX: RAIL_X + RAIL_R, z: Object.freeze([THIN_PANELS[0][0], THIN_PANELS[2][1]]) }),
    zSpan: Object.freeze([BAND_PANELS[0][0], HEAVY_BLOCKS[HEAVY_BLOCKS.length - 1][1]]),
    visualEraSector: 'kf51-evo-leopard2-skirt',
  });
}

// -------------------------------------------------------------------------------------------------------------- turret
const bodyRing = (hb: number, hc: number, hr: number, yb: number): SectionPoint[] => [
  [-hb, yb], [hb, yb], [hc, T_CREASE], [hr, T_ROOF], [-hr, T_ROOF], [-hc, T_CREASE],
];
const bustleRing = (hb: number, yb: number, hs: number, ylo: number, yhi: number, hr: number, yr: number): SectionPoint[] => [
  [-hb, yb], [hb, yb], [hs, ylo], [hs, yhi], [hr, yr], [-hr, yr], [-hs, yhi], [-hs, ylo],
];

/** One arrowhead cheek (x >= SLOT_HW for s = 1): the turret's six-sided section at the slot face carried forward to a
 * swept ridge. Its upper face is one plane from the roof edge to the ridge (the ridge rises outward as it sweeps back),
 * its inner wall the gun slot's side. */
function cheekPoints(s: Side): P3[] {
  const upperSlope = (CHEEK_RIDGE_Y - T_ROOF) / (CHEEK_TIP_Z - SLOT_FACE_Z);
  const rOut: P3 = [1.50, T_ROOF + upperSlope * (2.00 - SLOT_FACE_Z), 2.00];
  const pts: P3[] = [
    [SLOT_HW, T_ROOF, SLOT_FACE_Z], [1.24, T_ROOF, SLOT_FACE_Z], [1.50, T_CREASE, SLOT_FACE_Z], [1.30, T_FLOOR, SLOT_FACE_Z],
    [SLOT_HW, T_FLOOR, SLOT_FACE_Z], [SLOT_HW, CHEEK_RIDGE_Y, CHEEK_TIP_Z], rOut,
  ];
  // an interior point completes convexSlab's eight corners without changing the hull
  const c = [0, 1, 2].map((k) => pts.reduce((sum, p) => sum + p[k], 0) / pts.length) as unknown as P3;
  return [...pts, c].map((p) => mirror3(s, p));
}

/**
 * The bustle's side boxes (photo 3): each a faceted case standing out of the side (lower facet, vertical face, upper
 * facet to the roof edge). The big forward box's rear end rakes aft toward its top and the smaller rear box nests
 * behind it on the same rake; the forward box's lid follows the rake, hangs on a hinge stack at its front edge and
 * carries a handle across its top and a latch at its rear corner; the rear box carries a grab handle.
 */
const BOX_RING: SectionPoint[] = [[1.30, 0.13], [1.47, 0.16], [1.58, 0.30], [1.58, 0.60], [1.47, 0.75], [1.20, 0.79]];
const REAR_BOX_RING: SectionPoint[] = [[1.20, 0.20], [1.42, 0.22], [1.52, 0.33], [1.52, 0.58], [1.42, 0.70], [1.16, 0.74]];
/** The rake shared by the forward box's rear end and the rear box's front: z at height y. */
const boxRake = (y: number, dz = 0): number => -2.30 + dz - 0.48 * (y - 0.13) / (0.79 - 0.13);
function addStowageBoxes(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  for (const s of [-1, 1] as const) {
    P.add('turret', hullOf([
      ...BOX_RING.map(([x, y]): P3 => [x, y, -1.40]),
      ...BOX_RING.map(([x, y]): P3 => [x, y, boxRake(y)]),
    ].map((p) => mirror3(s, p))));
    P.add('turret', hullOf([
      ...REAR_BOX_RING.map(([x, y]): P3 => [x, y, boxRake(y, -0.035)]),
      ...REAR_BOX_RING.map(([x, y]): P3 => [x, y, -3.19]),
    ].map((p) => mirror3(s, p))));
    // the forward box's lid: a trapezoid on its face, its rear edge on the rake, 14 mm proud with a 10 mm bevel
    const face = 1.58, lz0 = -1.48, ly0 = 0.33, ly1 = 0.57;
    const lid = (x: number, inset: number): P3[] => [
      [x, ly0 + inset, lz0 - inset], [x, ly1 - inset, lz0 - inset],
      [x, ly1 - inset, boxRake(ly1, 0.07) + inset], [x, ly0 + inset, boxRake(ly0, 0.07) + inset],
    ];
    P.add('turret', hullOf([...lid(face - 0.004, 0), ...lid(face + 0.014, 0.010)].map((p) => mirror3(s, p))));
    // the hinge stack on its front edge: a leaf and three knuckles
    P.add('turretDetail', box(0.024, 0.27, 0.05), s * (face + 0.014), 0.45, lz0 + 0.03);
    for (const y of [0.355, 0.45, 0.545]) P.add('turretDetail', cylY(0.024, 0.024, 0.06, 8), s * (face + 0.03), y, lz0 + 0.035);
    // the handle across the lid's top and the latch at its rear corner
    P.add('turretDetail', box(0.024, 0.024, 0.22), s * (face + 0.040), 0.525, -1.90);
    for (const dz of [-0.095, 0.095]) P.add('turretDetail', box(0.03, 0.022, 0.022), s * (face + 0.026), 0.525, -1.90 + dz);
    P.add('turretDetail', box(0.026, 0.05, 0.05), s * (face + 0.020), 0.52, boxRake(0.52, 0.12));
    // the rear box's grab handle
    P.add('turretDetail', box(0.022, 0.022, 0.18), s * (1.52 + 0.034), 0.52, -2.98);
    for (const dz of [-0.075, 0.075]) P.add('turretDetail', box(0.03, 0.02, 0.02), s * (1.52 + 0.02), 0.52, -2.98 + dz);
  }
}

function addTurretShell(P: TankBuilderPort): void {
  // the main body from the slot face back over the ring, its floor rising behind the ring toward the bustle
  P.add('turret', sectionSolid([
    { z: -2.12, ring: bodyRing(1.24, 1.46, 1.20, 0.05) },
    { z: -1.30, ring: bodyRing(1.30, 1.50, 1.24, T_FLOOR) },
    { z: SLOT_FACE_Z, ring: bodyRing(1.30, 1.50, 1.24, T_FLOOR) },
  ]));
  // the squared bustle: vertical sides between chamfers, its floor clear of the engine deck, a chamfered rear
  P.add('turret', sectionSolid([
    { z: -3.32, ring: bustleRing(1.08, 0.18, 1.30, 0.30, 0.64, 1.10, 0.785) },
    { z: -3.20, ring: bustleRing(1.14, 0.14, 1.40, 0.28, 0.62, 1.18, T_ROOF) },
    { z: -2.05, ring: bustleRing(1.24, 0.05, 1.44, 0.26, 0.60, 1.21, T_ROOF) },
  ]));
  for (const s of [-1, 1] as const) {
    const [a, b, c, d, e, f, g, h] = cheekPoints(s);
    P.add('turret', convexSlab(a, b, c, d, e, f, g, h));
    // the slot's side walls in shadow: a dark liner 4 mm off each cheek's inner wall
    const lx0 = s * (SLOT_HW - 0.008), lx1 = s * (SLOT_HW - 0.004);
    P.add('turretDark', orientedSlab(
      [lx0, 0.0, SLOT_FACE_Z + 0.004], [lx1, 0.0, SLOT_FACE_Z + 0.004], [lx1, 0.27, 1.88], [lx0, 0.27, 1.88],
      [lx0, 0.78, SLOT_FACE_Z + 0.004], [lx1, 0.78, SLOT_FACE_Z + 0.004], [lx1, 0.56, 1.88], [lx0, 0.56, 1.88]));
    // the side door's seam and its two hinges on the body's upper side face, ahead of the boxes (photo 2)
    const faceX = (y: number): number => 1.50 - (1.50 - 1.24) * (y - T_CREASE) / (T_ROOF - T_CREASE);
    P.add('turretDark', orientedSlab(
      [s * (faceX(0.42) - 0.002), 0.42, -0.30], [s * (faceX(0.42) + 0.002), 0.42, -0.30],
      [s * (faceX(0.42) + 0.002), 0.42, -0.31], [s * (faceX(0.42) - 0.002), 0.42, -0.31],
      [s * (faceX(0.80) - 0.002), 0.80, -0.30], [s * (faceX(0.80) + 0.002), 0.80, -0.30],
      [s * (faceX(0.80) + 0.002), 0.80, -0.31], [s * (faceX(0.80) - 0.002), 0.80, -0.31]));
    for (const y of [0.50, 0.68]) {
      P.add('turretDetail', KIT.box(0.04, 0.05, 0.05), s * (faceX(y) - 0.004), y, -0.34, 0, 0, s * 0.56);
    }
  }
  addStowageBoxes(P);
  // the overhanging rear box on the bustle's back
  P.add('turret', convexSlab(
    [-0.90, 0.24, -3.24], [0.90, 0.24, -3.24], [0.82, 0.30, -3.54], [-0.82, 0.30, -3.54],
    [-0.90, 0.70, -3.24], [0.90, 0.70, -3.24], [0.82, 0.63, -3.54], [-0.82, 0.63, -3.54]));
  for (const x of [-0.45, 0.45]) P.add('turretDetail', KIT.box(0.24, 0.03, 0.03), x, 0.47, -3.555);
  // the gun slot's vertical face in shadow (the mantlet plate's face: x +-0.43, z 1.10)
  P.add('turretDark', orientedSlab(
    [-0.424, -0.02, SLOT_FACE_Z + 0.004], [0.424, -0.02, SLOT_FACE_Z + 0.004], [0.424, -0.02, SLOT_FACE_Z + 0.001], [-0.424, -0.02, SLOT_FACE_Z + 0.001],
    [-0.424, 0.80, SLOT_FACE_Z + 0.004], [0.424, 0.80, SLOT_FACE_Z + 0.004], [0.424, 0.80, SLOT_FACE_Z + 0.001], [-0.424, 0.80, SLOT_FACE_Z + 0.001]));
  // the roof's panel seams and the cheeks' roots (12 mm proud strips)
  for (const [z, w] of [[0.62, 1.70], [-0.95, 2.10], [-2.20, 2.30]] as const) {
    P.add('turretDark', KIT.box(w, 0.006, 0.022), 0, T_ROOF + 0.002, z);
  }
  P.turretG.userData.kf51EvoTurretReceipt = Object.freeze({
    profile: 'kf51-evo-faceted-turret-r1',
    rigLocal: Object.freeze([0, 1.71, 0.63]),
    roofY: T_ROOF, creaseY: T_CREASE, floorY: T_FLOOR,
    slotHalfWidthM: SLOT_HW, slotFaceZ: SLOT_FACE_Z, cheekRidgeInner: Object.freeze([SLOT_HW, CHEEK_RIDGE_Y, CHEEK_TIP_Z]),
    cheekRidgeOuterZ: 2.00, bustleRearZ: -3.54, bustleFloorY: 0.14,
    stowageBoxes: Object.freeze({ perSide: 2, outerFaceX: 1.58, rakedRear: true, hingedLid: 'front-hinge-stack' }),
  });
}

/** The right cheek's gunner sight, the SEOSS panoramic sight behind it, twin-lens sensor heads, the rear-corner camera
 * wedges, hatches, lifting eyes. */
function addTurretSights(P: TankBuilderPort): void {
  const { box, cylY, cylZ } = KIT;
  const upperSlope = (CHEEK_RIDGE_Y - T_ROOF) / (CHEEK_TIP_Z - SLOT_FACE_Z);
  const cheekTop = (z: number): number => T_ROOF + upperSlope * Math.max(0, z - SLOT_FACE_Z);
  // gunner's primary sight on the right cheek (-x): an armoured box, its base on the cheek face, a large forward window
  const gx0 = -0.56, gx1 = -1.16, gz0 = 1.00, gz1 = 1.52;
  P.add('turret', convexSlab(
    [gx0, T_ROOF - 0.01, gz0], [gx1, T_ROOF - 0.01, gz0], [gx1, cheekTop(gz1) - 0.01, gz1], [gx0, cheekTop(gz1) - 0.01, gz1],
    [gx0, 1.00, gz0], [gx1, 1.00, gz0], [gx1, 0.955, gz1], [gx0, 0.955, gz1]));
  P.add('turretDark', box(0.42, 0.20, 0.02), (gx0 + gx1) / 2, 0.835, gz1 + 0.004);
  P.add('turretGlass', box(0.34, 0.14, 0.02), (gx0 + gx1) / 2, 0.835, gz1 + 0.012);
  P.add('turretDetail', box(0.50, 0.022, 0.07), (gx0 + gx1) / 2, 0.948, gz1 + 0.02);           // window visor
  // the SEOSS: tall armoured head with a chamfered brow, its window band, a small sensor mast on top
  const sx = -0.58, sz = 0.42;
  P.add('turret', convexSlab(
    [sx - 0.17, T_ROOF - 0.01, sz + 0.17], [sx + 0.17, T_ROOF - 0.01, sz + 0.17], [sx + 0.17, T_ROOF - 0.01, sz - 0.17], [sx - 0.17, T_ROOF - 0.01, sz - 0.17],
    [sx - 0.15, 1.24, sz + 0.12], [sx + 0.15, 1.24, sz + 0.12], [sx + 0.15, 1.30, sz - 0.15], [sx - 0.15, 1.30, sz - 0.15]));
  P.add('turretDark', box(0.26, 0.09, 0.02), sx, 1.10, sz + 0.163);
  P.add('turretGlass', box(0.20, 0.06, 0.02), sx, 1.10, sz + 0.171);
  for (const s of [-1, 1] as const) P.add('turretDark', box(0.02, 0.07, 0.20), sx + s * 0.162, 1.10, sz);
  P.add('turretDark', antennaPart(cylY(0.016, 0.02, 0.12, 8)), sx, 1.35, sz - 0.02);
  P.add('turretDark', cylY(0.045, 0.06, 0.035, 14), sx, 1.425, sz - 0.02);
  // twin-lens situational-awareness heads on the roof edges: forward-left and both sides (photos 1, 2, 5)
  const head = (x: number, z: number, yaw: number): void => {
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const at = (u: number, v: number, w: number): P3 => [x + u * c + w * sn, v, z - u * sn + w * c];
    P.add('turret', convexSlab(at(-0.12, T_ROOF - 0.01, 0.06), at(0.12, T_ROOF - 0.01, 0.06), at(0.12, T_ROOF - 0.01, -0.08), at(-0.12, T_ROOF - 0.01, -0.08),
      at(-0.10, T_ROOF + 0.11, 0.03), at(0.10, T_ROOF + 0.11, 0.03), at(0.10, T_ROOF + 0.11, -0.07), at(-0.10, T_ROOF + 0.11, -0.07)));
    for (const u of [-0.045, 0.045]) {
      const [lx, , lz] = at(u, 0, 0.055);
      P.add('turretDark', cylZ(0.030, 0.012, 14), lx, T_ROOF + 0.06, lz, 0, yaw, 0);
      P.add('turretGlass', cylZ(0.021, 0.012, 14), lx + 0.004 * sn, T_ROOF + 0.06, lz + 0.004 * c, 0, yaw, 0);
    }
  };
  head(0.70, 1.00, 0);
  head(1.13, -0.55, Math.PI / 2);
  head(-1.13, -0.70, -Math.PI / 2);
  // the rear-corner camera wedges (photo 3): a long low housing rising aft to a raked face with one lens looking out
  // behind the corner
  for (const s of [-1, 1] as const) {
    const x0 = s * 0.86, x1 = s * 1.13, zf = -2.80, zr = -3.16, top = T_ROOF + 0.15;
    P.add('turret', hullOf([
      [x0, T_ROOF - 0.01, zf], [x1, T_ROOF - 0.01, zf], [x0, T_ROOF - 0.01, zr], [x1, T_ROOF - 0.01, zr],
      [x0 + s * 0.02, T_ROOF + 0.04, zf], [x1 - s * 0.03, T_ROOF + 0.03, zf],
      [x0 + s * 0.02, top, zr + 0.06], [x1 - s * 0.02, top - 0.01, zr + 0.06],
    ]));
    const yaw = s > 0 ? Math.PI * 0.80 : -Math.PI * 0.80;
    const lx = s * 1.03, lz = zr + 0.025, ly = T_ROOF + 0.085;
    P.add('turretDark', cylZ(0.048, 0.016, 14), lx, ly, lz, 0, yaw, 0);
    P.add('turretGlass', cylZ(0.034, 0.016, 14), lx + Math.sin(yaw) * 0.005, ly, lz + Math.cos(yaw) * 0.005, 0, yaw, 0);
  }
  // the crew hatches (commander right behind the SEOSS, the fourth station left) and a periscope ahead of the left one
  for (const [x, z] of [[-0.60, -0.32], [0.60, -0.42]] as const) {
    P.add('turretDetail', cylY(0.33, 0.33, 0.026, P.q ? 24 : 14), x, T_ROOF + 0.010, z);
    P.addHatch('turretHatch', cylY(0.28, 0.28, 0.03, P.q ? 22 : 12), x, T_ROOF + 0.034, z);
    P.add('turretDark', box(0.30, 0.018, 0.04), x, T_ROOF + 0.055, z + 0.05);
  }
  KIT.periscope(P, 'turretDetail', 0.60, T_ROOF + 0.03, 0.05);
  for (const s of [-1, 1] as const) {
    KIT.liftEye(P, 'turretDetail', s * 1.02, T_ROOF + 0.012, 0.70, s * 0.3);
    KIT.liftEye(P, 'turretDetail', s * 0.62, T_ROOF + 0.012, -2.62, s * 0.3);
  }
}

/** The countermeasure launchers along both roof edges (the game's eight smoke tubes): on a low rail, four cones a side
 * firing out, up and a little forward (photo 3's capped cones). */
function addCountermeasureLaunchers(P: TankBuilderPort): void {
  for (const s of [-1, 1] as const) {
    P.add('turretDark', KIT.box(0.12, 0.04, 0.78), s * 1.12, T_ROOF + 0.016, -1.25);
    for (let k = 0; k < 4; k++) {
      const z = -0.97 - k * 0.185;
      const cone = KIT.xform(markSmokeTube(KIT.cylZ(0.026, 0.13, 10, 0.044)), 0, 0, 0, -0.62, 0, 0);
      P.add('turretDetail', cone, s * 1.13, T_ROOF + 0.07, z, 0, s * (Math.PI / 2 - 0.30), 0);
    }
  }
}

/** The remote weapon station (the spec's roof gun), the drone box on its mast at the rear centre (photo 2), three whips. */
function addRoofEquipment(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  const rws = addLeopardOpenYokeAuxRws(P, {
    x: 0.42, y: T_ROOF, z: -1.72,
    variant: 'kf51-panther', ammoSide: 1, sensorSide: -1, yaw: 0.025,
    weaponRole: 'roof-primary',
  });
  P.turretG.userData.openYokeRwsReceipt = rws;
  // the drone box: a tall armoured case with a chamfered top and a dark hatch band, the mast through its lid and the
  // quadcopter docked on the mast's head
  const dx = -0.12, dz = -2.92, dTop = T_ROOF + 0.36;
  P.add('turret', hullOf([
    [dx - 0.21, T_ROOF - 0.01, dz + 0.17], [dx + 0.21, T_ROOF - 0.01, dz + 0.17], [dx - 0.21, T_ROOF - 0.01, dz - 0.17], [dx + 0.21, T_ROOF - 0.01, dz - 0.17],
    [dx - 0.19, dTop - 0.05, dz + 0.15], [dx + 0.19, dTop - 0.05, dz + 0.15], [dx - 0.19, dTop, dz - 0.15], [dx + 0.19, dTop, dz - 0.15],
    [dx - 0.13, dTop, dz + 0.10], [dx + 0.13, dTop, dz + 0.10],
  ]));
  P.add('turretDark', box(0.30, 0.10, 0.012), dx, dTop - 0.15, dz + 0.158);
  P.add('turretDetail', cylY(0.035, 0.045, 0.04, 10), dx, dTop + 0.015, dz - 0.02);
  P.add('turretDetail', antennaPart(cylY(0.018, 0.018, 0.34, 8)), dx, dTop + 0.20, dz - 0.02);
  const hubY = dTop + 0.39;
  P.add('turretDark', box(0.11, 0.05, 0.11), dx, hubY, dz - 0.02);
  for (const a of [Math.PI / 4, -Math.PI / 4]) P.add('turretDark', box(0.40, 0.016, 0.024), dx, hubY + 0.01, dz - 0.02, 0, a, 0);
  for (const [ax, az] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    const rx = dx + ax * 0.141, rz = dz - 0.02 + az * 0.141;
    P.add('turretDark', cylY(0.012, 0.012, 0.04, 6), rx, hubY + 0.035, rz);
    P.add('turretDark', cylY(0.07, 0.07, 0.006, 14), rx, hubY + 0.058, rz);
  }
  for (const s of [-1, 1] as const) P.add('turretDark', box(0.012, 0.06, 0.09), dx + s * 0.05, hubY - 0.05, dz - 0.02);
  // three whips: one at each rear quarter and the thick-based set on the right roof (photos 1, 2)
  const whips: ReadonlyArray<readonly [number, number, number, number]> = [
    [-0.70, -3.08, 1.45, 5101], [0.70, -3.08, 1.30, 5102], [-0.66, -2.30, 1.55, 5103],
  ];
  for (const [x, z, h, seed] of whips) {
    P.add('turretDetail', cylY(0.032, 0.042, 0.06, 10), x, T_ROOF + 0.025, z);
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h, r: 0.011, rake: (x > 0 ? 1 : -1) * 0.025, seed });
    whip.position.set(x, T_ROOF + 0.055, z);
    P.turretG.add(whip);
  }
  P.decal('turret', 'crossgrey', null, 0.28, [1.555, 0.45, -1.80], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.28, [-1.555, 0.45, -1.80], -Math.PI / 2);
}

// ----------------------------------------------------------------------------------------------------------------- gun
/** The EVO shroud's section (gun-local x, y) at scale k: a hexagon standing on its points (narrow flats at the top and
 * the foot), the shoulders' short vertical sides between its long upper and lower facets (photos 4, 5). */
const SHROUD_HW = 0.30;
const shroudRing = (k: number, ky = k): Array<readonly [number, number]> => [
  [0.035 * k, -0.32 * ky], [SHROUD_HW * k, -0.08 * ky], [SHROUD_HW * k, 0.17 * ky], [0.035 * k, 0.40 * ky],
  [-0.035 * k, 0.40 * ky], [-SHROUD_HW * k, 0.17 * ky], [-SHROUD_HW * k, -0.08 * ky], [-0.035 * k, -0.32 * ky],
];
/** The shroud starts clear of the slot face at full elevation; its pointed foot keeps the full 9 degrees over the sides. */
const SHROUD_Z0 = 0.40;
const SHROUD_KNEE = 1.10;      // the parallel rear half ends here; the front half tapers
const SHROUD_Z1 = 2.04;        // the open front's foot; its top rakes forward to SHROUD_Z1 + SHROUD_RAKE
const SHROUD_RAKE = 0.20;
const SHROUD_TAPER = 0.76;
const SHROUD_TAPER_Y = 0.80;
const GUN_LEN = 5.475;
/** The Rh-130's thermal sleeve and stepped muzzle section radii. */
const RH130_SLEEVE_R = 0.120;
const RH130_MUZZLE_R = 0.136;

/** The raked front's plane: z at height y, the top reaching SHROUD_RAKE past the foot. */
const rakeZ = (y: number): number => SHROUD_Z1 + SHROUD_RAKE * (y + 0.32 * SHROUD_TAPER_Y) / (0.72 * SHROUD_TAPER_Y);
/** A ring of the shroud's section laid on the raked front's plane (dz off it). */
function rakedFront(k: number, ky: number, dz = 0): P3[] {
  return shroudRing(k, ky).map(([x, y]) => [x, y, rakeZ(y) + dz] as P3);
}

function addGun(P: TankBuilderPort): void {
  const { box, cylX, cylZ } = KIT;
  const seg = P.q ? 28 : 14;
  P.gunG.position.set(0, 0.38, 0.90);
  // the trunnion roll: rotation-invariant about the pivot, it fills the slot behind the shroud at every elevation
  P.addGunExtraDark(cylX(0.27, 0.80, P.q ? 20 : 12), 0, 0, 0);
  // the shroud: parallel from the slot to the knee, then tapering to the raked open front
  const ringAt = (z: number, k = 1, ky = k): P3[] => shroudRing(k, ky).map(([x, y]) => [x, y, z] as P3);
  P.addGunExtra(hullOf([...ringAt(SHROUD_Z0), ...ringAt(SHROUD_KNEE)]));
  P.addGunExtra(hullOf([...ringAt(SHROUD_KNEE - 0.01), ...rakedFront(SHROUD_TAPER, SHROUD_TAPER_Y)]));
  // the joint band at the knee, 5 mm proud
  P.addGunExtraDark(hullOf([...ringAt(SHROUD_KNEE - 0.025, 1.015, 1.012), ...ringAt(SHROUD_KNEE + 0.025, 1.012, 1.010)]));
  // the open front frame: a dark hexagon inset on the raked face, 4 mm proud
  P.addGunExtraDark(hullOf([...rakedFront(SHROUD_TAPER * 0.80, SHROUD_TAPER_Y * 0.80, -0.012),
    ...rakedFront(SHROUD_TAPER * 0.80, SHROUD_TAPER_Y * 0.80, 0.004)]));
  // three vent slots on each upper facet, laid in the facet's plane 3 mm proud (photos 1, 6)
  const facetBand = (s: Side, z: number, out: number): P3[] => {
    const t = (z - SHROUD_KNEE) / (SHROUD_Z1 - SHROUD_KNEE);
    const k = 1 - (1 - SHROUD_TAPER) * t, ky = 1 - (1 - SHROUD_TAPER_Y) * t;
    const ax = 0.035 * k, ay = 0.40 * ky, bx = SHROUD_HW * k, by = 0.17 * ky;
    const len = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / len, ny = (bx - ax) / len;
    const mx = (ax + bx) / 2, my = (ay + by) / 2, ux = (bx - ax) / len, uy = (by - ay) / len;
    return [-0.025, 0.025].map((u) => [s * (mx + ux * u + nx * out), my + uy * u + ny * out, z] as P3);
  };
  for (const s of [-1, 1] as const) {
    for (const z of [1.30, 1.56, 1.82]) {
      P.addGunExtraDark(hullOf([-0.09, 0.09].flatMap((dz) => [...facetBand(s, z + dz, -0.003), ...facetBand(s, z + dz, 0.004)])));
    }
  }
  // coaxial machine gun to the right of the gun, rooted in the trunnion roll
  P.addGunExtraDark(cylZ(0.022, 0.30, 8), -0.36, 0.05, 0.40);
  // Rh-130 L/52 (the EVO turret's planned 130 mm retrofit; the game keeps the 130 mm): the tube to its muzzle 5.475 m
  // past the pivot, its thermal sleeve with clamp bands, the stepped muzzle section and the box MRS on top of it
  KIT.buildGun(P, { len: GUN_LEN, r: 0.092, sleeve: false, collar: false, baseR: 0.15 });
  P.add('gun', cylZ(RH130_SLEEVE_R, 2.45, seg), 0, 0, 3.275);
  for (const z of [2.30, 3.05, 3.95]) P.add('gunDark', cylZ(RH130_SLEEVE_R + 0.006, 0.045, seg), 0, 0, z);
  P.add('gun', cylZ(RH130_MUZZLE_R, 0.08, seg, RH130_SLEEVE_R), 0, 0, 4.54);
  P.add('gun', cylZ(RH130_MUZZLE_R, GUN_LEN - 4.58, seg), 0, 0, (4.58 + GUN_LEN) / 2);
  P.add('gunDark', cylZ(RH130_MUZZLE_R + 0.004, 0.035, seg), 0, 0, 4.62);
  P.add('gun', convexSlab(
    [-0.10, 0.118, 5.36], [0.10, 0.118, 5.36], [0.10, 0.118, 5.02], [-0.10, 0.118, 5.02],
    [-0.09, 0.28, 5.30], [0.09, 0.28, 5.30], [0.09, 0.30, 5.06], [-0.09, 0.30, 5.06]));
  P.add('gunDark', box(0.12, 0.07, 0.012), 0, 0.22, 5.335);                                  // MRS mirror window
  P.gunG.userData.kf51EvoGunReceipt = Object.freeze({
    profile: 'kf51-evo-rh130-shroud-r2',
    gun: 'Rh-130 L/52 (the EVO turret\'s planned 130 mm retrofit)',
    gunPivotLocal: Object.freeze([0, 0.38, 0.90]),
    barrelLengthM: GUN_LEN,
    shroud: Object.freeze({ sides: 6, z0: SHROUD_Z0, kneeZ: SHROUD_KNEE, footZ: SHROUD_Z1, topZ: SHROUD_Z1 + SHROUD_RAKE,
      rearWidthM: 2 * SHROUD_HW, rearHeightM: 0.72, frontWidthM: 2 * SHROUD_HW * SHROUD_TAPER,
      frontHeightM: 0.72 * SHROUD_TAPER_Y, footBelowBoreM: 0.32, ventSlotsPerSide: 3, openFrontFrame: true, rakedFront: true,
      jointBand: true, gunOwned: true }),
    trunnionRollRadiusM: 0.27,
    sleeveRadiusM: RH130_SLEEVE_R,
    muzzleSectionRadiusM: RH130_MUZZLE_R,
    mrs: 'box-on-muzzle-section',
  });
}

// ------------------------------------------------------------------------------------------------------------- builder
function* buildKF51EvoSteps(P: TankBuilderPort): TankProfileBuild {
  addHullShell(P);
  addFrontMudguards(P);
  yield 'kf51EvoHull';
  addBowFittings(P);
  addEngineDeckAndStern(P);
  yield 'kf51EvoHullFittings';
  addRunningGear(P);
  yield 'kf51EvoRunningGear';
  addLeopard2Flank(P);
  yield 'kf51EvoFlank';
  P.turretG.position.set(0, 1.71, 0.63);
  addTurretShell(P);
  yield 'kf51EvoTurretShell';
  addTurretSights(P);
  addCountermeasureLaunchers(P);
  addRoofEquipment(P);
  yield 'kf51EvoTurretEquipment';
  addGun(P);
  P.topY = 1.40;
}

export function buildKF51Evo(...args: Parameters<typeof buildKF51EvoSteps>): void {
  drainTankBuild(buildKF51EvoSteps(...args));
}
withBuildSteps(buildKF51Evo, buildKF51EvoSteps);
