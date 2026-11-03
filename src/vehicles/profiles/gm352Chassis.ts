// Release 268: the GM-352 tracked chassis, one builder for both air-defence vehicles on it (owner rule: shared parts,
// no forked copies). The 2K22M Tunguska-M's GM-352 and the tracked Pantsir-S1's GM-352M1E differ only in the stern:
// the M1E carries the two raised engine-cooling boxes with their big grilles over the rear corners (Kuzmin's
// Engineering Technologies 2012 rear views, photographs 05-07), so that is an option here, not a second hull.
//
// The long, low, flat-sided hull (gm352Layout.ts GM352_HULL): vertical upper sides over the tracks with the fender
// plate sloping out and down from each side's foot, turned down over the bow, the full-width upper glacis falling 36 degrees from the roof to the nose edge and the steep lower
// glacis under it, the sloped rear deck onto the vertical stern plate, the narrower lower hull between the tracks. The
// driver sits front left under his raised vision box; a second equipment box stands front right; the headlight boxes
// at the bow's corners; the side access panels, the right side's radiator grille and louvres and the left side's long
// exhaust grille (TankBiathlon 2014 side views, photographs 02 and 05); six road wheels a side, three return rollers,
// the rear drive sprocket and the front idler (GM352_GEAR).
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT, FITTINGS } from './kit.ts';
import { mount } from './fittingMount.ts';
import { GM352_GEAR as G, GM352_HULL as H } from './gm352Layout.ts';

type P3 = readonly [number, number, number];

/** A closed convex solid over the given corners, with a plan-projected UV for the camouflage. */
export function convexSolid(points: readonly P3[]): THREE.BufferGeometry {
  const geometry = new ConvexGeometry(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const position = geometry.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < position.count; i++) uv.push(position.getX(i) + position.getY(i), position.getZ(i));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

export interface Gm352ChassisOptions {
  /** 'gm352' (the 2K22M's chassis) or 'gm352m1e' (the Pantsir's: the raised, grilled cooling boxes over the stern) */
  readonly variant: 'gm352' | 'gm352m1e';
}

/** The glacis' height at a station on it (the plane from the roof's front edge down to the nose). */
const glacisY = (z: number): number => H.deckY - (z - H.glacisTopZ) * (H.deckY - H.noseY) / (H.halfLength - H.glacisTopZ);
const GLACIS_RAKE = Math.atan2(H.deckY - H.noseY, H.halfLength - H.glacisTopZ);

function hullShell(P: TankBuilderPort): void {
  const L = H.halfLength, chamfer = 0.035;
  // Upper body over the tracks: the roof's side edges chamfered, the glacis to the nose, the sponson's sloped front
  // under it (2 cm behind the lower glacis' plane, inside the lower hull where they meet), the rear deck onto the stern.
  const upper: P3[] = [];
  for (const side of [-1, 1]) {
    const x = side * H.sideX, xi = side * (H.sideX - chamfer);
    upper.push([x, H.sponsonY, -L], [x, H.sternTopY - chamfer, -L], [xi, H.sternTopY, -L],
      [x, H.deckY - chamfer, H.deckRearZ], [xi, H.deckY, H.deckRearZ],
      [x, H.deckY - chamfer, H.glacisTopZ - 0.02], [xi, H.deckY, H.glacisTopZ],
      [x, H.noseY, L], [x, H.sponsonY, L - (H.noseY - H.sponsonY) * (L - H.lowerFootZ) / (H.noseY - H.bellyY) - 0.02]);
  }
  P.add('hull', convexSolid(upper));
  // The lower hull between the tracks: the steep lower glacis from the nose to the belly, the belly's edges chamfered,
  // the sloped lower stern plate; its top runs inside the upper body.
  const lower: P3[] = [];
  for (const side of [-1, 1]) {
    const x = side * H.tubX, xi = side * (H.tubX - 0.04);
    lower.push([xi, H.bellyY, H.sternBellyZ], [x, H.bellyY + 0.04, H.sternBellyZ - 0.03], [xi, H.bellyY, H.lowerFootZ],
      [x, H.bellyY + 0.04, H.lowerFootZ + 0.026], [x, H.noseY, L], [x, H.sponsonY + 0.04, -L + 0.01],
      [x, H.sternFootY, -L + 0.01]);
  }
  P.add('hull', convexSolid(lower));
  // The fender shelves (photographs 01, 02, 05, 06, 13): a solid bevelled shelf along each side over the track, its top
  // sloping 30 degrees out and down from the hull side to the outer lip, the lip's face standing to the shelf's flat
  // underside; its rear end square at the stern. Over the bow it sweeps down to a point at the nose's corner.
  for (const side of [-1, 1]) {
    const shelf = fenderSection(side);
    P.add('hull', convexSolid([...shelf(-L + 0.035), ...shelf(H.fenderBowZ)]));
    P.add('hull', convexSolid([...shelf(H.fenderBowZ),
      [side * (H.sideX - 0.01), H.fenderTipTopY, H.fenderTipZ], [side * (H.sideX + 0.05), H.fenderTipBottomY, H.fenderTipZ - 0.07],
      [side * (H.sideX - 0.01), H.fenderTipBottomY + 0.05, H.fenderTipZ - 0.10]]));
    // the shelf's butt joints: straps 6 cm wide over its top and its lip
    for (const z of H.fenderJointZs) {
      P.add('hullDetail', convexSolid([z - 0.03, z + 0.03].flatMap((jz) => [
        [side * (H.sideX - 0.004), H.fenderTopY + 0.006, jz], [side * (H.fenderX + 0.006), H.fenderLipY + 0.006, jz],
        [side * (H.fenderX + 0.006), H.fenderBottomY + 0.02, jz], [side * (H.fenderX - 0.03), H.fenderBottomY + 0.02, jz],
        [side * (H.sideX - 0.004), H.fenderTopY - 0.03, jz],
      ] as P3[])));
    }
    // the rear mud flaps behind the sprockets, hung from the sponson's underside, and the rubber flap under the
    // shelf's bow end, ahead of the idler
    P.addMudguard('gm352-rear-flap', 'hullRubber', KIT.box(0.40, 0.48, 0.025), side * 1.30, H.sponsonY - 0.23, -L + 0.03);
    P.addMudguard('gm352-bow-strip', 'hullRubber', KIT.box(0.025, 0.16, 0.30), side * (H.fenderX - 0.04), 0.96, 3.60);
  }
}

/** The fender shelf's section at a station: into the hull side at its top and its foot, the 30-degree top out to the
 * lip, the lip's face down to the flat underside. */
function fenderSection(side: number): (z: number) => P3[] {
  const xi = H.sideX - 0.01;
  return (z) => [
    [side * xi, H.fenderTopY, z], [side * H.fenderX, H.fenderLipY, z], [side * H.fenderX, H.fenderBottomY, z],
    [side * xi, H.fenderBottomY, z],
  ];
}

/** A box with rounded edges in its side (z-y) profile, swept across x from x0 to x1. */
export function roundedSideBox(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, radius: number,
  segments: number): THREE.BufferGeometry {
  return profileSolid(x0, x1, roundedRect(z0, z1, y0, y1, radius), segments);
}

/** The outline of a rectangle with rounded corners in the (z, y) plane, as a shape. */
function roundedRect(z0: number, z1: number, y0: number, y1: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(z0 + radius, y0);
  shape.lineTo(z1 - radius, y0);
  shape.quadraticCurveTo(z1, y0, z1, y0 + radius);
  shape.lineTo(z1, y1 - radius);
  shape.quadraticCurveTo(z1, y1, z1 - radius, y1);
  shape.lineTo(z0 + radius, y1);
  shape.quadraticCurveTo(z0, y1, z0, y1 - radius);
  shape.lineTo(z0, y0 + radius);
  shape.quadraticCurveTo(z0, y0, z0 + radius, y0);
  return shape;
}

/** A side (z-y) outline swept across x from x0 to x1: shape x is the hull's z, the extrusion its x. */
export function profileSolid(x0: number, x1: number, outline: THREE.Shape | readonly (readonly [number, number])[],
  segments = 1): THREE.BufferGeometry {
  const shape = outline instanceof THREE.Shape ? outline
    : new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false, curveSegments: segments, steps: 1 });
  return geometry.rotateY(-Math.PI / 2).translate(x1, 0, 0);
}

/** A raised access panel on a hull side (+x left, -x right): a rounded-corner plate 3 cm proud of the side, 1 cm into
 * it, its two hinge lugs on the front edge (photographs 02, 05: the rounded hinged doors). */
function sidePanel(P: TankBuilderPort, side: number, z: number, y: number, length: number, height: number): void {
  const [x0, x1] = side > 0 ? [H.sideX - 0.01, H.sideX + 0.03] : [-(H.sideX + 0.03), -(H.sideX - 0.01)];
  P.add('hullDetail', roundedSideBox(x0, x1, z - length / 2, z + length / 2, y - height / 2, y + height / 2, 0.07,
    P.q ? 3 : 1));
  if (P.q) for (const dy of [-0.28, 0.28]) {
    P.add('hullDark', KIT.box(0.03, 0.07, 0.05), side * (H.sideX + 0.035), y + dy * height, z + length / 2 + 0.01);
  }
}

/** A recessed grille: the dark louvre field, its frame and its bars, on a hull side. */
function sideGrille(P: TankBuilderPort, side: number, z: number, y: number, length: number, height: number, bars: number,
  vertical: boolean): void {
  const x = side * (H.sideX + 0.004);
  P.add('hullDark', KIT.box(0.02, height - 0.03, length - 0.03), x, y, z);
  // the frame: four strips 1 cm into the side
  P.add('hullDetail', KIT.box(0.03, 0.035, length), x + side * 0.004, y + height / 2 - 0.0175, z);
  P.add('hullDetail', KIT.box(0.03, 0.035, length), x + side * 0.004, y - height / 2 + 0.0175, z);
  P.add('hullDetail', KIT.box(0.03, height, 0.035), x + side * 0.004, y, z + length / 2 - 0.0175);
  P.add('hullDetail', KIT.box(0.03, height, 0.035), x + side * 0.004, y, z - length / 2 + 0.0175);
  for (let i = 1; i < bars; i++) {
    const t = i / bars - 0.5;
    if (vertical) P.add('hullDetail', KIT.box(0.022, height - 0.04, 0.018), x + side * 0.002, y, z + t * length);
    else P.add('hullDetail', KIT.box(0.022, 0.018, length - 0.04), x + side * 0.002, y + t * height, z);
  }
}

function hullSides(P: TankBuilderPort, variant: Gm352ChassisOptions['variant']): void {
  // Right side (-x): the access panels, the radiator grille and the louvres behind it (photograph 02).
  for (const [z, y, l, h] of [[-3.09, 1.61, 0.50, 0.42], [-1.29, 1.65, 0.72, 0.42], [-0.37, 1.62, 0.76, 0.46],
    [1.57, 1.62, 0.58, 0.44], [2.86, 1.64, 0.92, 0.44]] as const) sidePanel(P, -1, z, y, l, h);
  sideGrille(P, -1, -2.16, 1.64, 0.32, 0.50, 6, true);
  sideGrille(P, -1, -1.79, 1.52, 0.20, 0.28, 5, false);
  // Left side (+x): the panels forward, the long exhaust grille along the engine bay (photograph 05).
  for (const [z, y, l, h] of [[2.34, 1.62, 0.84, 0.44], [1.46, 1.64, 0.58, 0.38], [-0.98, 1.63, 0.70, 0.40]] as const) {
    sidePanel(P, 1, z, y, l, h);
  }
  if (variant === 'gm352') sideGrille(P, 1, -2.40, 1.60, 1.66, 0.16, 18, true);
  for (const z of [-1.70, -2.10, -2.50, -2.90, -3.30]) P.add('hullDetail', KIT.box(0.024, 0.11, 0.28), H.sideX + 0.002, 1.84, z);
  // two pairs of round plugs ahead of the right panels' run (the side's fuel and service caps)
  for (const z of [0.45, 0.63]) P.add('hullDetail', KIT.cylX(0.055, 0.03, P.q ? 16 : 10), -(H.sideX + 0.005), 1.42, z);
}

function hullFront(P: TankBuilderPort): void {
  const L = H.halfLength;
  // The driver's hump front left (photographs 01, 06, 13): a raised box standing on the glacis' top edge, its front
  // face raked down onto the plate with the big windscreen in its frame, the flat visor lid overhanging it; his hatch on
  // the roof behind it. Both front boxes stand ahead of the 2.81 m the guns' muzzles reach at any bearing.
  const driverTop = 2.34, faceTopZ = 3.00, faceFootZ = 3.42;
  P.add('hull', convexSolid([0.32, 1.10].flatMap((x) => [
    [x, H.deckY - 0.03, 2.88], [x, driverTop, 2.88], [x, driverTop, faceTopZ], [x, glacisY(faceFootZ) - 0.02, faceFootZ],
    [x, glacisY(faceFootZ) - 0.06, faceFootZ - 0.04], [x, H.deckY - 0.03, H.glacisTopZ],
  ] as P3[])));
  const rake = Math.atan2(driverTop - (glacisY(faceFootZ) - 0.02), faceFootZ - faceTopZ);
  /** a point on the raked face, `down` metres down it from its top edge, `out` metres proud of it */
  const onFace = (down: number, out: number): [number, number] => [
    driverTop - down * Math.sin(rake) + out * Math.cos(rake), faceTopZ + down * Math.cos(rake) + out * Math.sin(rake)];
  const [gy, gz] = onFace(0.17, 0.004), tilt = rake - Math.PI / 2;
  P.add('hullGlass', KIT.box(0.60, 0.20, 0.012), 0.71, gy, gz, tilt, 0, 0);
  // the windscreen's frame and its centre bar
  for (const [dy, w, h] of [[-0.115, 0.68, 0.035], [0.115, 0.68, 0.035]] as const) {
    const [fy, fz] = onFace(0.17 + dy, 0.012);
    P.add('hullDark', KIT.box(w, h, 0.03), 0.71, fy, fz, tilt, 0, 0);
  }
  for (const dx of [-0.32, 0, 0.32]) {
    const [fy, fz] = onFace(0.17, 0.012);
    P.add('hullDark', KIT.box(0.035, 0.26, 0.03), 0.71 + dx, fy, fz, tilt, 0, 0);
  }
  P.add('hullDetail', KIT.box(0.86, 0.035, 0.30), 0.71, driverTop + 0.017, faceTopZ - 0.03);    // the visor lid
  P.add('hullHatch', KIT.cylY(0.24, 0.25, 0.04, P.q ? 24 : 12), 0.71, H.deckY + 0.012, 2.60);
  P.add('hullDark', KIT.torus(0.245, 0.012, P.q ? 24 : 12), 0.71, H.deckY + 0.034, 2.60);
  // The equipment box front right, its top raked forward down onto the glacis, its flat lid overhanging the front.
  const rightTop = 2.26;
  P.add('hull', convexSolid([-1.18, -0.40].flatMap((x) => [
    [x, H.deckY - 0.03, 2.88], [x, rightTop, 2.88], [x, rightTop, 3.02], [x, glacisY(3.40) - 0.02, 3.40],
    [x, glacisY(3.40) - 0.06, 3.36], [x, H.deckY - 0.03, H.glacisTopZ],
  ] as P3[])));
  P.add('hullDetail', KIT.box(0.84, 0.035, 0.26), -0.79, rightTop + 0.017, 2.98);
  // the plate between the two boxes with its stencilled cross (photograph 06)
  P.add('hullDetail', convexSolid([-0.40, 0.32].flatMap((x) => [
    [x, H.deckY - 0.03, 2.90], [x, H.deckY + 0.08, 2.90], [x, glacisY(3.30) + 0.05, 3.30], [x, glacisY(3.30) - 0.03, 3.30],
  ] as P3[])));
  // The headlight pods on the deck's front corners, outboard of the two boxes: each lamp in its housing under a hood.
  for (const side of [-1, 1]) {
    const x = side * 1.28, z = 3.30, foot = glacisY(z + 0.14) - 0.04, top = glacisY(z - 0.18) + 0.24;
    P.add('hull', convexSolid([x - 0.16, x + 0.16].flatMap((bx) => [
      [bx, glacisY(z - 0.18) - 0.04, z - 0.18], [bx, top, z - 0.18], [bx, top, z + 0.10], [bx, foot, z + 0.14],
    ] as P3[])));
    P.add('hullDetail', KIT.box(0.34, 0.03, 0.12), x, top + 0.012, z + 0.14);                     // the hood
    KIT.headlight(P, x + side * 0.05, top - 0.11, z + 0.135, 0, 0.075);
    P.add('hullDark', KIT.box(0.09, 0.06, 0.05), x - side * 0.09, top - 0.11, z + 0.12);
    // tow hook on the lower glacis: a clevis block and its shackle lying out of it
    const hookZ = 3.80, hookY = H.bellyY + (hookZ - H.lowerFootZ) * (H.noseY - H.bellyY) / (L - H.lowerFootZ);
    P.add('hullDetail', KIT.box(0.14, 0.16, 0.10), side * 0.56, hookY, hookZ + 0.02, -0.57, 0, 0);
    P.add('hullDark', KIT.torus(0.055, 0.017, P.q ? 14 : 8), side * 0.56, hookY - 0.05, hookZ + 0.10);
  }
  // the glacis' butt seam and the towing cable laid across it
  P.add('hullDetail', KIT.xform(KIT.box(2.90, 0.02, 0.04), 0, 0, 0, GLACIS_RAKE, 0, 0), 0, glacisY(3.62) + 0.008, 3.62);
  const cy = (z: number): number => glacisY(z) + 0.022;
  mount(P, 'hull', FITTINGS.towCable({ mats: P.mats, seed: 2680, r: 0.020, pts: [
    [-0.92, cy(3.55), 3.55], [-0.40, cy(3.66), 3.66], [0.30, cy(3.66), 3.66], [0.86, cy(3.55), 3.55], [0.50, cy(3.44), 3.44],
    [-0.30, cy(3.44), 3.44], [-0.72, cy(3.50), 3.50],
  ] }), 0, 0, 0);
}

function hullStern(P: TankBuilderPort, variant: Gm352ChassisOptions['variant']): void {
  const L = H.halfLength;
  // the tow eyes on the sloped lower stern plate (photographs 03, 04; 06 on the M1E)
  for (const side of [-1, 1]) for (const x of [0.62, 0.22]) {
    KIT.liftEye(P, 'hullDetail', side * x, H.sternFootY - 0.12, -L + 0.065, Math.PI / 2);
  }
  if (variant === 'gm352m1e') { gm352m1eStern(P); return; }
  // the 2K22M's stern plate: the round access door (right), the strapped stowage box (left), the tail lamps at the
  // upper corners (photographs 03, 04)
  P.add('hullHatch', KIT.cylZ(0.27, 0.03, P.q ? 28 : 14), -0.70, 1.50, -L - 0.005);
  P.add('hullDark', KIT.cylZ(0.04, 0.03, 10), -0.48, 1.50, -L - 0.018);
  P.add('hullDetail', KIT.box(1.00, 0.24, 0.14), 0.52, 1.52, -L - 0.06);
  P.add('hullDetail', KIT.box(1.02, 0.025, 0.16), 0.52, 1.648, -L - 0.06);
  for (const x of [0.22, 0.82]) P.add('hullCloth', KIT.box(0.05, 0.27, 0.15), x, 1.53, -L - 0.065);
  for (const side of [-1, 1]) {
    P.add('hullDark', KIT.box(0.16, 0.06, 0.03), side * 1.24, 1.76, -L - 0.008);
    P.add('hullGlass', KIT.box(0.12, 0.035, 0.01), side * 1.24, 1.76, -L - 0.026);
  }
  // the engine deck's two access hatches and the cooling grille between them, on the flat roof behind the turret
  for (const x of [-0.80, 0.80]) P.add('hullHatch', KIT.box(0.62, 0.025, 0.82), x, H.deckY + 0.008, -2.80);
  P.add('hullDark', KIT.box(0.70, 0.016, 0.80), 0, H.deckY + 0.002, -2.80);
  for (let i = 0; i < 5; i++) P.add('hullDetail', KIT.box(0.72, 0.018, 0.035), 0, H.deckY + 0.008, -3.12 + i * 0.16);
}

/** The GM-352M1E's stern (the Pantsir): the raised cooling box over the right rear corner with its big grilles on the
 * back and the side, the lower box over the left rear corner with its side grille, and the rear-view camera's hood on
 * the deck between them (photographs 04-07). */
function gm352m1eStern(P: TankBuilderPort): void {
  const L = H.halfLength;
  const right: readonly [number, number] = [-1.515, -0.62], left: readonly [number, number] = [0.70, 1.515];
  // right box: from the stern plate (1 cm proud of it) forward over the deck, its front edge chamfered
  P.add('hull', convexSolid(right.flatMap((x) => [
    [x, 1.55, -L - 0.01], [x, 2.42, -L - 0.01], [x, 2.42, -2.70], [x, 2.34, -2.58], [x, H.deckY - 0.03, -2.58], [x, 1.55, -2.58],
  ] as P3[])));
  // left box: lower, its top raked down to the deck at the front
  P.add('hull', convexSolid(left.flatMap((x) => [
    [x, 1.55, -L - 0.01], [x, 2.30, -L - 0.01], [x, 2.30, -3.05], [x, H.deckY - 0.03, -2.74], [x, 1.55, -2.74],
  ] as P3[])));
  // the right box's back grille (most of the plate) and side grille, the left box's side grille
  const backGrille = (x: number, y: number, w: number, h: number): void => {
    P.add('hullDark', KIT.box(w - 0.03, h - 0.03, 0.02), x, y, -L - 0.016);
    for (const [dx, dy, bw, bh] of [[0, h / 2, w, 0.035], [0, -h / 2, w, 0.035], [w / 2, 0, 0.035, h], [-w / 2, 0, 0.035, h]] as const) {
      P.add('hullDetail', KIT.box(bw, bh, 0.03), x + dx, y + dy, -L - 0.018);
    }
    for (let i = 1; i < 7; i++) P.add('hullDetail', KIT.box(w - 0.04, 0.016, 0.022), x, y - h / 2 + i * h / 7, -L - 0.02);
  };
  backGrille(-0.98, 1.98, 0.62, 0.70);
  const sideGrilleAt = (side: number, x: number, z: number, y: number, l: number, h: number): void => {
    P.add('hullDark', KIT.box(0.02, h - 0.03, l - 0.03), x + side * 0.006, y, z);
    for (const [dz, dy, bl, bh] of [[0, h / 2, l, 0.035], [0, -h / 2, l, 0.035], [l / 2, 0, 0.035, h], [-l / 2, 0, 0.035, h]] as const) {
      P.add('hullDetail', KIT.box(0.03, bh, bl), x + side * 0.008, y + dy, z + dz);
    }
    for (let i = 1; i < 8; i++) P.add('hullDetail', KIT.box(0.022, h - 0.04, 0.016), x + side * 0.009, y, z - l / 2 + i * l / 8);
  };
  sideGrilleAt(-1, -1.515, -3.22, 2.00, 1.04, 0.62);
  sideGrilleAt(1, 1.515, -3.48, 1.95, 0.70, 0.46);
  // the tail lamps on the boxes' backs, the plate's square service hatch and the heater's exhaust stub (photograph 06)
  for (const x of [-1.41, 1.38]) {
    P.add('hullDark', KIT.box(0.16, 0.06, 0.03), x, 2.24, -L - 0.018);
    P.add('hullGlass', KIT.box(0.12, 0.035, 0.01), x, 2.24, -L - 0.036);
  }
  P.add('hullHatch', KIT.box(0.40, 0.30, 0.024), -0.36, 1.45, -L - 0.004);
  P.add('hullDark', KIT.cylZ(0.05, 0.10, P.q ? 14 : 8), -1.08, 1.40, -L - 0.04);
  // the deck's hatch between the boxes, ahead of the camera
  P.add('hullHatch', KIT.box(1.10, 0.025, 0.55), 0.04, H.deckY + 0.008, -2.70);
  // the rear-view camera's hood on the deck between the boxes (photograph 04): a hooded box open to the rear, the lens
  P.add('hullDetail', KIT.box(0.34, 0.20, 0.34), 0, H.deckY + 0.08, -3.22);
  P.add('hullDetail', convexSolid([-0.20, 0.20].flatMap((x) => [
    [x, H.deckY + 0.17, -3.06], [x, H.deckY + 0.48, -3.06], [x, H.deckY + 0.48, -3.30], [x, H.deckY + 0.40, -3.42],
    [x, H.deckY + 0.17, -3.42],
  ] as P3[])));
  P.add('hullGlass', KIT.cylZ(0.065, 0.012, P.q ? 16 : 10), 0, H.deckY + 0.30, -3.424);
}

function runningGear(P: TankBuilderPort): void {
  KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: G.wheelR, wheelW: G.wheelW, xc: G.xc, wheelZs: [...G.wheelZs],
    sprocket: { ...G.sprocket }, idler: { ...G.idler },
    rollers: G.rollers.map((z) => ({ z, y: G.rollerY, r: G.rollerR })),
    trackW: G.trackW, topY: G.topY, arms: true, paintedEnds: true,
    contactZF: G.wheelZs[0], contactZR: G.wheelZs[G.wheelZs.length - 1],
  });
}

/** The GM-352 chassis (hull, fittings, running gear) into the rig's hull group. */
export function buildGm352Chassis(P: TankBuilderPort, options: Gm352ChassisOptions): void {
  hullShell(P);
  hullSides(P, options.variant);
  hullFront(P);
  hullStern(P, options.variant);
  runningGear(P);
}
