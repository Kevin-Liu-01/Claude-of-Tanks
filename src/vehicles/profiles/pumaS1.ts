// SPz Wotan: the game's own modernised Puma (Schützenpanzer Puma S1 family), an independent first-party procedural build.
//
// 267 (ifv-modern-267, the owner: "completely upgrade and modernize"): rebuilt from the measured Puma S1 (the source
// oracle spz_puma_s1_x_source.glb for dimensions only, and the photographs in the lane's research packet). Authoring
// frame metres, +Z forward, +X the vehicle's left, ground y = 0; applyAdvancedIfvScale bakes the whole build to 90 %.
// Measured stations: hull 7.60 m with the tall flat troop roof (1.95 m), the shallow 14-degree upper glacis from z 1.40
// to the nose bumper and the 28-degree lower glacis, the raked rear ramp; six 0.72 m road wheels per side at the S1's
// uneven stations, the raised front sprocket and the rear tension idler, the track lane at 1.31 m. The turret is the
// unmanned RCT30 class offset to the left over its ring: the MK30-2/ABM in a tapered armoured housing on its right
// half, the gunner's sight on its left cheek, the PERI RTWL on its roof, the smoke stacks at its rear corners.
// The Wotan stays its own vehicle (not the puma_s1 replica): its bevelled side cassettes, its twin MELLS cells on the
// right flank, its hard-kill protection set (four radar faces and two launcher heads), its four 360-degree camera
// heads, its rear stowage bins and slat quarters.
//
// The local owner-supplied GLBs are proportion oracles only; this builder shares no donor geometry and never calls the
// legacy SPz Puma builder.

import * as THREE from 'three';
import { KIT, FITTINGS, orientedSlab, convexSlab, muzzleTipDot } from './kit.ts';
import { ADVANCED_IFV_SCALE, applyAdvancedIfvScale, type AdvancedIfvScalePort } from './advancedIfvScale.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { mountRotated as mount } from './fittingMount.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import { reserveDecorVolume } from './fieldChest.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { mirrorX } from '../runningGearPrimitives.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { weaponAssembly } from './weaponStock.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';

type Vec3 = [number, number, number];
type Owner = 'hull' | 'turret';

interface PumaS1BuilderPort extends AdvancedIfvScalePort {
  readonly gunG: THREE.Group;
  readonly mats: Record<string, THREE.Material> & {
    readonly canvasCloth: THREE.MeshStandardMaterial;
    readonly wheels?: THREE.MeshStandardMaterial;
  };
  readonly q?: boolean;
  readonly disposables: Array<{ dispose(): void }>;
  readonly geometryReceipt?: boolean;
  readonly spec: { readonly id: string; readonly visual: { readonly number?: string } };
  muzzleZ: number;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addCupola(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addEquipment(owner: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addExternalArmor(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addHatch(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addModuleVisual(module: string, slot: string, geometry: THREE.BufferGeometry,
    ...transform: number[]): void;
  decal(owner: Owner, kind: string, label: string | null, scale: number,
    position: Vec3, ...orientation: number[]): void;
  /** Registered like addMudguard, then hung from the hull stock above its top edge (mudguardHangers.ts). */
  hangMudguard(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
}

const { box, cylX, cylY, cylZ } = KIT;

// ---- measured hull stations (authoring frame) ----
/** The troop-cell roof (the S1 oracle: 1.93-1.97 over the cell). */
const ROOF_Y = 1.95;
/** The upper glacis: the roof breaks at z 1.40 and falls 0.255 m per metre (14.3 degrees) to the nose. */
const GLACIS_Z = 1.40;
const GLACIS_FALL = 0.255;
const GLACIS_RX = Math.atan(GLACIS_FALL);
const glacisY = (z: number): number => (z <= GLACIS_Z ? ROOF_Y : ROOF_Y - GLACIS_FALL * (z - GLACIS_Z));
/** The belly and the 28-degree lower glacis from z 2.40 up to the bumper's foot at z 3.68. */
const BELLY_Y = 0.48;
/** The rear ramp plane: z = -3.06 at the belly, raked 0.456 m back per metre up (24.5 degrees). */
const RAMP_RAKE = 0.4557;
const rampZ = (y: number): number => -3.06 - (y - BELLY_Y) * RAMP_RAKE;
const RAMP_RX = -Math.atan(RAMP_RAKE);
/** The hull's own side over the tracks, the cassettes' seat. */
const HULL_SIDE_X = 1.64;
/** The tub between the tracks. */
const TUB_X = 0.98;
/** The sponson floor over the track's return run. */
const SPONSON_Y = 1.30;
/** The cassettes' outer face. */
const ARMOUR_X = 1.905;
/** The modules' foot (the S1 photographs: the skirt covers the road wheels' crowns). */
const SKIRT_Y = 0.70;

/** A closed prism along z from a CCW (x, y) contour, its four end edges bevelled by `bevel` toward the contour's middle. */
function bevelledPrism(ring: readonly SectionPoint[], z0: number, z1: number, bevel: number,
  ringAt?: (t: number) => readonly SectionPoint[]): THREE.BufferGeometry {
  const at = ringAt ?? (() => ring);
  const shrink = (pts: readonly SectionPoint[], k: number): SectionPoint[] => {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return pts.map(([x, y]) => {
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
      return [x - (dx / d) * k, y - (dy / d) * k] as const;
    });
  };
  if (!(bevel > 0)) return sectionSolid([{ z: z0, ring: at(0) }, { z: z1, ring: at(1) }]);
  const t0 = bevel / (z1 - z0);
  return sectionSolid([
    { z: z0, ring: shrink(at(0), bevel) },
    { z: z0 + bevel, ring: at(t0) },
    { z: z1 - bevel, ring: at(1 - t0) },
    { z: z1, ring: shrink(at(1), bevel) },
  ]);
}

/** A box-section plate along z, its four long edges chamfered by `c` (an armour plate's flame-cut edge). */
function chamferedPlate(w: number, h: number, len: number, c = 0.012): THREE.BufferGeometry {
  const x = w / 2, y = h / 2;
  return sectionSolid([-len / 2, len / 2].map((z) => ({ z, ring: [
    [-x + c, -y], [x - c, -y], [x, -y + c], [x, y - c], [x - c, y], [-x + c, y], [-x, y - c], [-x, -y + c],
  ] as SectionPoint[] })));
}

/** A part authored for the vehicle's left (+X) side, and its mirror on the right. */
function bothSides(geometry: () => THREE.BufferGeometry, add: (g: THREE.BufferGeometry, side: 1 | -1) => void): void {
  add(geometry(), 1);
  add(mirrorX(geometry()), -1);
}

// =====================================================================================================================
// Hull
// =====================================================================================================================

function addHullShell(P: PumaS1BuilderPort): void {
  // Lower tub between the tracks: flat belly, the 28-degree lower glacis to the bumper and the raked plate that the
  // rear ramp lies on. Its top runs inside the upper body (1.33, rising to 1.47 under the front fenders).
  const tub = (z: number, floor: number, top: number) => ({ z,
    ring: [[-TUB_X, floor], [TUB_X, floor], [TUB_X, top], [-TUB_X, top]] as SectionPoint[] });
  P.add('hull', sectionSolid([
    tub(rampZ(1.28), 1.28, 1.33),
    tub(-3.06, BELLY_Y, 1.33),
    tub(1.70, BELLY_Y, 1.33),
    tub(2.20, BELLY_Y, 1.47),
    tub(2.40, BELLY_Y, 1.47),
    tub(3.68, 1.11, 1.47),
  ]));

  // Upper body: the full-width troop cell over the tracks (sponson floor 1.30), its roof edge chamfered into the
  // cassettes, the glacis falling from z 1.40, the sponson floor stepping up over the raised sprocket, and the raked
  // stern under the roof's rear edge. Contour: [x, y] CCW from +Z.
  const body = (z: number, floor: number, roof: number, edge = 0.06) => ({ z, ring: [
    [-HULL_SIDE_X, floor], [HULL_SIDE_X, floor], [HULL_SIDE_X, roof - edge],
    [HULL_SIDE_X - edge, roof], [-(HULL_SIDE_X - edge), roof], [-HULL_SIDE_X, roof - edge],
  ] as SectionPoint[] });
  P.add('hull', sectionSolid([
    // the roof's rear edge chamfered down 6 cm over its last 0.12 m (the gun keeps its full depression over the stern)
    body(rampZ(1.83), 1.83, ROOF_Y - 0.06, 0.03),
    body(-3.56, BELLY_Y + (3.56 - 3.06) / RAMP_RAKE, ROOF_Y),
    body(rampZ(SPONSON_Y), SPONSON_Y, ROOF_Y),
    body(GLACIS_Z, SPONSON_Y, ROOF_Y),
    body(1.75, SPONSON_Y, glacisY(1.75), 0.08),
    body(2.20, 1.42, glacisY(2.20), 0.10),
    body(3.25, 1.42, glacisY(3.25), 0.025),
  ]));
  // The nose: the glacis carried over the tub to the bumper, its last 0.16 m chamfered steeper.
  P.add('hull', sectionSolid([
    tub(3.10, 1.30, glacisY(3.10)),
    tub(3.40, 1.30, glacisY(3.40)),
    tub(3.70, 1.30, 1.35),
  ]));
  // Bumper beam across the nose: a deep box with its upper front edge chamfered (the S1's number-plate beam).
  P.add('hull', sectionSolid([
    { z: 3.44, ring: [[-1.02, 1.09], [1.02, 1.09], [1.02, 1.34], [-1.02, 1.34]] },
    { z: 3.685, ring: [[-1.02, 1.09], [1.02, 1.09], [1.02, 1.34], [-1.02, 1.34]] },
    { z: 3.705, ring: [[-1.0, 1.11], [1.0, 1.11], [1.0, 1.32], [-1.0, 1.32]] },
  ]));
  // Front corners over the sprockets: the glacis' fender plates carried round the hull's front corner, raked back in
  // plan, their feet lifting clear in front of the track wrap; the headlights stand on their faces.
  bothSides(() => convexSlab(
    [TUB_X + 0.005, 1.425, 2.92], [HULL_SIDE_X + 0.005, 1.425, 2.92], [1.59, 1.20, 3.36], [TUB_X + 0.005, 1.16, 3.50],
    [TUB_X + 0.005, glacisY(2.92) - 0.010, 2.92], [HULL_SIDE_X + 0.005, glacisY(2.92) - 0.05, 2.92],
    [1.57, glacisY(3.36) - 0.06, 3.36], [TUB_X + 0.005, glacisY(3.50) - 0.025, 3.50],
  ), (g) => P.add('hull', g));
}

// Side armour: the Wotan's bevelled cassettes (its 2026-09-25 line: "chamfered side cassettes") in the S1's two rows:
// twelve narrow upper modules of the measured section (a face at 1.905 leaning in above 1.425 and chamfered down onto the
// roof edge; their tops follow the glacis forward of z 1.40) over six broad lower modules, every vertical edge bevelled.
// (the modules' crown stands 4 cm under the roof plane over the hull's own edge chamfer: the gun keeps its full
// depression where the offset ring swings it low over the right front corner)
const UPPER_RING: readonly SectionPoint[] = [
  [HULL_SIDE_X - 0.005, 1.425], [ARMOUR_X, 1.425], [1.86, 1.80], [1.70, 1.91], [HULL_SIDE_X - 0.005, 1.91],
];
const LOWER_RING: readonly SectionPoint[] = [
  [HULL_SIDE_X - 0.005, SKIRT_Y], [1.87, SKIRT_Y], [ARMOUR_X - 0.01, SKIRT_Y + 0.03], [ARMOUR_X - 0.01, 1.425],
  [HULL_SIDE_X - 0.005, 1.425],
];
const CASSETTE_REAR_Z = -2.62;
const CASSETTE_FRONT_Z = 2.62;
const UPPER_COUNT = 12;
const LOWER_COUNT = 6;
const CASSETTE_GAP = 0.022;
const UPPER_PITCH = (CASSETTE_FRONT_Z - CASSETTE_REAR_Z) / UPPER_COUNT;
const LOWER_PITCH = (CASSETTE_FRONT_Z - CASSETTE_REAR_Z) / LOWER_COUNT;
/** The upper face's x at height y (it leans in 45 mm over its 375 mm). */
const upperFaceX = (y: number): number => ARMOUR_X - (y - 1.425) * 0.12;
const UPPER_LEAN = Math.atan(0.12);

/** The upper module contour at station z: its top rows lowered with the glacis (a module never stands over the roof). */
function upperRingAt(z: number): SectionPoint[] {
  const drop = Math.max(0, 1.91 - (glacisY(z) - 0.04));
  return UPPER_RING.map(([x, y], i) => (i >= 2 ? [x, Math.max(y - drop, 1.425 + (i === 2 ? 0.05 : 0.08))] : [x, y]) as SectionPoint);
}

function addSideArmour(P: PumaS1BuilderPort): void {
  const row = (count: number, pitch: number, ring: readonly SectionPoint[], at?: (z: number) => SectionPoint[]): void => {
    for (let i = 0; i < count; i++) {
      const z0 = CASSETTE_REAR_Z + i * pitch + CASSETTE_GAP / 2, z1 = z0 + pitch - CASSETTE_GAP;
      bothSides(() => bevelledPrism(ring, z0, z1, 0.016, at ? (t) => at(z0 + (z1 - z0) * t) : undefined),
        (g) => P.addExternalArmor('hull', g));
    }
  };
  row(UPPER_COUNT, UPPER_PITCH, UPPER_RING, upperRingAt);
  row(LOWER_COUNT, LOWER_PITCH, LOWER_RING);
  for (const side of [-1, 1]) {
    // the dark carrier behind every seam, and the paired retaining bolts at each upper module's rear edge
    for (let i = 1; i < UPPER_COUNT; i++) {
      const zs = CASSETTE_REAR_Z + i * UPPER_PITCH, top = Math.min(1.80, glacisY(zs) - 0.15);
      P.add('hullDark', box(0.03, top - 1.43, CASSETTE_GAP + 0.004), side * (ARMOUR_X - 0.06), (top + 1.43) / 2, zs);
    }
    for (let i = 1; i < LOWER_COUNT; i++) {
      P.add('hullDark', box(0.03, 0.62, CASSETTE_GAP + 0.004), side * (ARMOUR_X - 0.05), 1.10, CASSETTE_REAR_Z + i * LOWER_PITCH);
    }
    for (let i = 0; i < UPPER_COUNT; i++) {
      const z = CASSETTE_REAR_Z + i * UPPER_PITCH + 0.055;
      for (const y of [1.50, Math.min(1.70, glacisY(z) - 0.20)]) {
        P.add('hullDetail', cylX(0.017, 0.016, 8), side * (upperFaceX(y) + 0.004), y, z, 0, 0, side * UPPER_LEAN);
      }
    }
  }
  // The front cheek module: the cassette section carried to the hull's front corner, raked back in plan, its foot
  // rising over the sprocket, the glacis line over it.
  bothSides(() => convexSlab(
    [HULL_SIDE_X - 0.005, SKIRT_Y + 0.04, CASSETTE_FRONT_Z + 0.004], [ARMOUR_X - 0.01, SKIRT_Y + 0.04, CASSETTE_FRONT_Z + 0.004],
    [1.665, 1.17, 3.12], [HULL_SIDE_X - 0.005, 1.17, 3.12],
    [HULL_SIDE_X - 0.005, glacisY(CASSETTE_FRONT_Z) - 0.04, CASSETTE_FRONT_Z + 0.004],
    [1.86, glacisY(CASSETTE_FRONT_Z) - 0.13, CASSETTE_FRONT_Z + 0.004],
    [1.665, glacisY(3.12) - 0.09, 3.12], [HULL_SIDE_X - 0.005, glacisY(3.12) - 0.04, 3.12],
  ), (g) => P.addExternalArmor('hull', g));
  // A continuous lower rail (the modules' foot strip with its step recesses) and the rubber hem behind it.
  for (const side of [-1, 1]) {
    P.addExternalArmor('hull', chamferedPlate(0.05, 0.07, CASSETTE_FRONT_Z - CASSETTE_REAR_Z - 0.04, 0.012),
      side * (ARMOUR_X - 0.005), SKIRT_Y + 0.055, (CASSETTE_FRONT_Z + CASSETTE_REAR_Z) / 2);
    for (const z of [-1.65, 0.05, 1.70]) {
      P.add('hullDark', box(0.012, 0.035, 0.22), side * (ARMOUR_X + 0.017), SKIRT_Y + 0.055, z);
    }
    P.hangMudguard('wotan-skirt-hem', 'hullRubber', box(0.03, 0.08, CASSETTE_FRONT_Z - CASSETTE_REAR_Z - 0.10),
      side * 1.80, SKIRT_Y - 0.03, (CASSETTE_FRONT_Z + CASSETTE_REAR_Z) / 2);
  }
  // The S1's right-side cooling louvre (the powerpack sits front right) on the upper row's leaning face: a framed grille,
  // its slats angled down.
  const lz = 1.15, lLen = 1.20, ly = 1.555, lx = -(upperFaceX(ly) + 0.004);
  P.addEquipment('hullDark', box(0.012, 0.22, lLen), lx, ly, lz, 0, 0, -UPPER_LEAN);
  for (let k = 0; k < 6; k++) {
    const y = 1.46 + k * 0.038;
    P.addEquipment('hullDetail', box(0.03, 0.012, lLen - 0.04), -(upperFaceX(y) + 0.016), y, lz, 0, 0, -UPPER_LEAN - 0.6);
  }
  for (const dz of [-1, 1]) P.addEquipment('hull', box(0.036, 0.26, 0.03), lx - 0.012, ly, lz + dz * (lLen / 2 + 0.012), 0, 0, -UPPER_LEAN);
  for (const dy of [-1, 1]) {
    const y = ly + dy * 0.125;
    P.addEquipment('hull', box(0.036, 0.03, lLen + 0.054), -(upperFaceX(y) + 0.016), y, lz, 0, 0, -UPPER_LEAN);
  }
  // Flank sensor heads (the S1's side cameras, kept from the Wotan's 2026-09-25 design): an armoured camera on a bracket
  // plate standing out of each upper module face, fore and aft, its lens looking outward.
  for (const side of [-1, 1]) {
    for (const z of [1.05, -2.52]) {
      const y = 1.75, face = upperFaceX(y);
      P.addEquipment('hull', box(0.05, 0.17, 0.20), side * (face + 0.012), y, z, 0, 0, side * UPPER_LEAN);
      P.addEquipment('hull', box(0.15, 0.11, 0.15), side * (face + 0.095), y, z);
      P.addEquipment('hull', box(0.17, 0.02, 0.17), side * (face + 0.095), y + 0.064, z);
      P.addModuleVisual('optics', 'hullGlass', cylX(0.034, 0.012, 14), side * (face + 0.172), y - 0.005, z);
    }
  }
}

/** Slat quarters over the idlers: a welded bar cage on each rear corner, wrapping the hull's rear face outboard of the
 *  ramp (the S1's rear protection), its posts on the cassette rail and the sponson's rear face. */
function addSlatQuarters(P: PumaS1BuilderPort): void {
  const zf = CASSETTE_REAR_Z - 0.01, zr = -3.78, xo = ARMOUR_X - 0.02, xi = 1.08, yb = 0.82, yt = 1.80;
  for (const side of [-1, 1]) {
    const s = side;
    // frame: posts and rails (square tube), flat bars between
    for (const [x, z] of [[xo, zf], [xo, -3.20], [xo, zr], [1.50, zr], [xi, zr]] as const) {
      P.add('hullOpenLattice', box(0.04, yt - yb, 0.04), s * x, (yt + yb) / 2, z);
    }
    P.add('hullOpenLattice', box(0.04, 0.04, zf - zr), s * xo, yt, (zf + zr) / 2);
    P.add('hullOpenLattice', box(0.04, 0.04, zf - zr), s * xo, yb, (zf + zr) / 2);
    P.add('hullOpenLattice', box(xo - xi + 0.04, 0.04, 0.04), s * (xo + xi) / 2, yt, zr);
    P.add('hullOpenLattice', box(xo - xi + 0.04, 0.04, 0.04), s * (xo + xi) / 2, yb, zr);
    for (let k = 1; k < 10; k++) {
      const y = yb + k * (yt - yb) / 10;
      P.add('hullOpenLattice', box(0.010, 0.05, zf - zr - 0.04), s * xo, y, (zf + zr) / 2);
      P.add('hullOpenLattice', box(xo - xi - 0.04, 0.05, 0.010), s * (xo + xi) / 2, y, zr);
    }
    // stand-off brackets from the rear face and the sponson into the frame
    for (const y of [1.30, 1.75]) {
      P.add('hullDetail', box(0.05, 0.04, Math.abs(zr - rampZ(y)) + 0.03), s * 1.30, y, (zr + rampZ(y)) / 2);
    }
    for (const z of [-2.95, -3.45]) P.add('hullDetail', box(xo - HULL_SIDE_X + 0.02, 0.04, 0.05), s * (xo + HULL_SIDE_X) / 2, 1.75, z);
    // the cage's top cover: a chamfered plate over the side bay and the rear bay, seated on the top rails and into the
    // hull side and rear face (the plan reads closed over the quarters)
    P.addEquipment('hull', chamferedPlate(xo + 0.02 - (HULL_SIDE_X - 0.02), 0.02, zf - zr + 0.03, 0.006),
      s * (xo + 0.02 + HULL_SIDE_X - 0.02) / 2, yt + 0.02, (zf + zr) / 2);
    P.addEquipment('hull', chamferedPlate(HULL_SIDE_X - 0.02 - (xi - 0.02), 0.02, rampZ(yt + 0.02) + 0.012 - (zr - 0.015), 0.006),
      s * (HULL_SIDE_X - 0.02 + xi - 0.02) / 2, yt + 0.02, (rampZ(yt + 0.02) + 0.012 + zr - 0.015) / 2);
  }
}

function addRunningGear(P: PumaS1BuilderPort): void {
  // The S1's measured course: six 0.72 m road wheels at its uneven stations, the raised front sprocket, the rear
  // tension idler, three return rollers behind the cassettes.
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: 0.36, wheelW: 0.26, wheelY: 0.43, xc: 1.31,
    wheelZs: [1.79, 1.01, 0.25, -0.68, -1.43, -2.17],
    sprocket: { z: 2.65, y: 0.96, r: 0.345 },
    idler: { z: -2.81, y: 0.835, r: 0.30 },
    rollerR: 0.085,
    rollers: [{ z: 1.38, y: 1.08 }, { z: -0.21, y: 1.08 }, { z: -1.80, y: 1.08 }],
    trackW: 0.52, trackTh: 0.092, topY: 1.20, botY: 0.055,
    trackPattern: 'compact-ifv', linkPitchM: 0.155, shoeWidthScale: 0.99,
    paintedEnds: true, arms: true, coveredTop: false,
  });
}

function addHullEquipment(P: PumaS1BuilderPort): void {
  // Driver's station, front left: a low rectangular hatch with its hinge to the rear and three periscopes ahead.
  const dx = 0.64, dz = 1.02;
  P.addHatch('hull', chamferedPlate(0.60, 0.045, 0.54, 0.014), dx, ROOF_Y + 0.010, dz);
  P.add('hullDark', box(0.64, 0.012, 0.58), dx, ROOF_Y + 0.003, dz);
  P.add('hullDark', box(0.30, 0.04, 0.06), dx, ROOF_Y + 0.022, dz - 0.30);
  P.add('hullDetail', box(0.14, 0.022, 0.04), dx - 0.12, ROOF_Y + 0.040, dz + 0.10);
  for (const x of [dx - 0.20, dx, dx + 0.20]) KIT.periscope(P, 'hullDetail', x, ROOF_Y + 0.012, 1.35);
  // Engine bay, front right: the air intake grille laid on the glacis, its slats across the slope, and the bolted
  // access plate beside it.
  const gz = 2.30, gy = glacisY(gz);
  P.add('hullDark', box(0.98, 0.012, 0.64), -0.62, gy + 0.004, gz, GLACIS_RX, 0, 0);
  for (let k = 0; k < 9; k++) {
    const z = gz - 0.28 + k * 0.07;
    P.add('hullDetail', box(0.94, 0.018, 0.022), -0.62, glacisY(z) + 0.014, z, GLACIS_RX - 0.5, 0, 0);
  }
  P.add('hullDetail', box(1.02, 0.02, 0.03), -0.62, glacisY(gz - 0.335) + 0.012, gz - 0.335, GLACIS_RX, 0, 0);
  P.add('hullDetail', box(1.02, 0.02, 0.03), -0.62, glacisY(gz + 0.335) + 0.012, gz + 0.335, GLACIS_RX, 0, 0);
  P.addHatch('hull', chamferedPlate(0.86, 0.022, 0.70, 0.008), 0.55, glacisY(2.35) + 0.008, 2.35, GLACIS_RX, 0, 0);
  for (const [x, z] of [[0.17, 2.05], [0.93, 2.05], [0.17, 2.65], [0.93, 2.65]] as const) {
    P.add('hullDetail', cylY(0.022, 0.022, 0.016, 8), x, glacisY(z) + 0.022, z, GLACIS_RX, 0, 0);
  }
  // Lifting eyes at the glacis' front corners.
  for (const side of [-1, 1]) KIT.liftEye(P, 'hullDetail', side * 1.42, glacisY(2.80) + 0.02, 2.80);
  // Bumper: towing eyes under it, the number plate on its face; the corner headlights on the fender corners.
  for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.10, 0.12, 0.10), side * 0.62, 1.04, 3.66);
    P.add('hullDark', cylX(0.032, 0.11, 10), side * 0.62, 1.02, 3.70);
    mount(P, 'hull', FITTINGS.lightCluster({ nightKind: 'headlight', mats: P.mats, pods: 2, spacing: 0.13, r: 0.046,
      shield: true, rake: -0.10, seed: side < 0 ? 110 : 111 }), side * 1.30, 1.26, 3.44, [0, side * 0.45, 0]);
  }
  P.add('hullDetail', box(0.52, 0.12, 0.012), -0.20, 1.24, 3.711);
  // 360-degree camera heads at the hull's four corners (the S1's all-round vision), each in an armoured hood.
  const camera = (x: number, y: number, z: number, ry: number): void => {
    P.addEquipment('hull', box(0.13, 0.12, 0.11), x, y, z, 0, ry, 0);
    P.addEquipment('hull', box(0.15, 0.025, 0.14), x, y + 0.07, z + 0.01 * Math.cos(ry), 0, ry, 0);
    P.addModuleVisual('optics', 'hullGlass', cylZ(0.032, 0.012, 14), x + 0.055 * Math.sin(ry), y, z + 0.055 * Math.cos(ry), 0, ry, 0);
  };
  for (const side of [-1, 1]) {
    camera(side * 1.78, glacisY(2.70) - 0.02, 2.62, side * 0.55);
    camera(side * 0.92, 1.74, rampZ(1.74) - 0.035, Math.PI - side * 0.30);
  }
  // Rear: the troop ramp on the raked plate, its hinge knuckles at the foot, the vision block and the grab handle;
  // the tail-light clusters and the Wotan's two stowage bins on the rear face outboard of the ramp.
  const rampLo = 0.56, rampHi = 1.84, rampLen = (rampHi - rampLo) * Math.hypot(1, RAMP_RAKE);
  const rampMidY = (rampLo + rampHi) / 2;
  P.addHatch('hull', chamferedPlate(1.42, 0.06, rampLen, 0.014), 0, rampMidY, rampZ(rampMidY) - 0.026,
    Math.PI / 2 + RAMP_RX, 0, 0);
  for (const x of [-0.55, 0, 0.55]) P.add('hullDark', cylX(0.05, 0.22, 12), x, rampLo + 0.02, rampZ(rampLo + 0.02) - 0.04);
  P.add('hullDetail', box(0.42, 0.035, 0.03), 0.28, 1.34, rampZ(1.34) - 0.072, RAMP_RX, 0, 0);
  P.addModuleVisual('optics', 'hullGlass', box(0.20, 0.10, 0.012), -0.30, 1.52, rampZ(1.52) - 0.062, RAMP_RX, 0, 0);
  for (const side of [-1, 1]) {
    P.addEquipment('hull', box(0.26, 0.20, 0.08), side * 1.30, 1.62, rampZ(1.62) - 0.035, RAMP_RX, 0, 0);
    P.addModuleVisual('optics', 'hullGlass', box(0.16, 0.08, 0.012), side * 1.30, 1.64, rampZ(1.64) - 0.078, RAMP_RX, 0, 0);
  }
  for (const side of [-1, 1]) {
    // a stowage bin on the rear face over each track, its lid hinged at the top
    P.addEquipment('hull', chamferedPlate(0.48, 0.34, 0.26, 0.02), side * 1.26, 1.36, rampZ(1.36) - 0.12, RAMP_RX, 0, 0);
    // the lid seam: 10 cm up the bin's outer face (its local +y runs up the rake, its local -z outward), 4 mm proud
    P.add('hullDark', box(0.44, 0.012, 0.012), side * 1.26, 1.36 + 0.0354, rampZ(1.36) - 0.12 - 0.1634, RAMP_RX, 0, 0);
  }
  // Troop roof: the rear roof hatch pair (no hull whip: every roof point lies inside the barrel's sweep).
  P.addHatch('hull', chamferedPlate(1.10, 0.04, 0.78, 0.012), -0.10, ROOF_Y + 0.015, -3.05);
  P.add('hullDark', box(0.012, 0.012, 0.74), -0.10, ROOF_Y + 0.036, -3.05);
  for (const side of [-1, 1]) P.add('hullDark', box(0.20, 0.035, 0.06), -0.10 + side * 0.36, ROOF_Y + 0.02, -2.63);
}

// =====================================================================================================================
// Turret (local frame: the ring seat at the origin; the spec's pivot [0.32, 1.93, -1.10])
// =====================================================================================================================

/** The RCT30 body (local): right flank -0.66, left flank +0.98, roof 0.82, its face at +1.30 and its bustle to -1.50.
 *  The underside stands 4.5 cm over the deck over the ring and 0.25 m up under the bustle (the S1 oracle's 2.24). */
const T_RIGHT = -0.66, T_LEFT = 0.98, T_ROOF = 0.82, T_FLOOR = 0.065, T_REAR = -1.50, T_FRONT = 1.30;
const T_BUSTLE_FLOOR = 0.25, T_BUSTLE_Z = -0.82;

function turretRing(inset: number, floor: number, roof: number): SectionPoint[] {
  return [
    [T_RIGHT + inset, floor], [T_LEFT - inset, floor], [T_LEFT + 0.02 - inset, floor + 0.12],
    [T_LEFT - 0.01 - inset, roof - 0.07], [T_LEFT - 0.08 - inset, roof], [T_RIGHT + 0.08 + inset, roof],
    [T_RIGHT + 0.01 + inset, roof - 0.07], [T_RIGHT - 0.02 + inset, floor + 0.12],
  ];
}

function addTurret(P: PumaS1BuilderPort): void {
  // ring basket skirt inside the race (the dark band in the seam under the turret's walls)
  P.add('turretDark', cylY(0.72, 0.74, 0.12, P.q ? 40 : 20), 0, 0.03, 0);
  P.add('turret', sectionSolid([
    { z: T_REAR, ring: turretRing(0.05, T_BUSTLE_FLOOR + 0.05, T_ROOF - 0.05) },
    { z: T_REAR + 0.06, ring: turretRing(0, T_BUSTLE_FLOOR, T_ROOF) },
    { z: T_BUSTLE_Z - 0.10, ring: turretRing(0, T_BUSTLE_FLOOR, T_ROOF) },
    { z: T_BUSTLE_Z, ring: turretRing(0, T_FLOOR, T_ROOF) },
    { z: T_FRONT - 0.25, ring: turretRing(0, T_FLOOR, T_ROOF) },
    { z: T_FRONT, ring: turretRing(0.09, T_FLOOR + 0.06, T_ROOF - 0.13) },
  ]));

  // Bolted flank armour panels, two a side, 30 mm proud.
  const panel = (x0: number, side: 1 | -1, z0: number, z1: number, y0: number, y1: number): void => {
    P.addExternalArmor('turret', chamferedPlate(0.03, y1 - y0, z1 - z0, 0.01), x0 + side * 0.012, (y0 + y1) / 2, (z0 + z1) / 2);
  };
  panel(T_LEFT + 0.02, 1, -1.34, -0.30, 0.36, 0.72);
  panel(T_LEFT + 0.02, 1, -0.24, 0.92, 0.20, 0.72);
  panel(T_RIGHT - 0.02, -1, -1.34, -0.30, 0.36, 0.72);
  panel(T_RIGHT - 0.02, -1, -0.24, 0.46, 0.20, 0.72);

  // The right flank's round gun-cradle bearing housing (the S1's big disc on the right face, beside the gun).
  P.addEquipment('turret', cylX(0.25, 0.07, P.q ? 28 : 14), T_RIGHT - 0.035, 0.40, 0.78);
  P.addEquipment('turret', cylX(0.17, 0.03, P.q ? 24 : 12), T_RIGHT - 0.085, 0.40, 0.78);
  P.add('turretDark', box(0.012, 0.10, 0.16), T_RIGHT - 0.103, 0.40, 0.78);
  // A roof access plate ahead of the PERI and the left-front corner camera (the S1's all-round vision).
  P.addHatch('turret', chamferedPlate(0.50, 0.022, 0.44, 0.008), -0.20, T_ROOF + 0.009, 0.52);
  P.addEquipment('turret', box(0.12, 0.12, 0.11), T_LEFT - 0.12, T_ROOF - 0.20, T_FRONT - 0.05, 0, 0.45, 0);
  P.addModuleVisual('optics', 'turretGlass', cylZ(0.034, 0.012, 14), T_LEFT - 0.12 + 0.058 * Math.sin(0.45),
    T_ROOF - 0.20, T_FRONT - 0.05 + 0.058 * Math.cos(0.45), 0, 0.45, 0);

  // Gunner's sight (WAO) on the left cheek: an armoured head standing out of the face, its day and thermal windows in a
  // recessed frame under a ballistic brow.
  const wx = 0.56, wy = 0.48, wz = T_FRONT + 0.10;
  P.addEquipment('turret', convexSlab(
    [wx - 0.27, wy - 0.20, T_FRONT - 0.30], [wx + 0.27, wy - 0.20, T_FRONT - 0.30],
    [wx + 0.25, wy - 0.18, wz + 0.16], [wx - 0.25, wy - 0.18, wz + 0.16],
    [wx - 0.27, wy + 0.20, T_FRONT - 0.30], [wx + 0.27, wy + 0.20, T_FRONT - 0.30],
    [wx + 0.25, wy + 0.13, wz + 0.16], [wx - 0.25, wy + 0.13, wz + 0.16],
  ));
  P.add('turretDark', box(0.42, 0.20, 0.02), wx, wy - 0.025, wz + 0.165);
  P.addModuleVisual('optics', 'turretGlass', cylZ(0.068, 0.014, 20), wx - 0.10, wy - 0.025, wz + 0.178);
  P.addModuleVisual('optics', 'turretGlass', cylZ(0.060, 0.014, 20), wx + 0.10, wy - 0.025, wz + 0.178);
  P.addEquipment('turret', orientedSlab(
    [wx - 0.27, wy + 0.13, wz + 0.10], [wx + 0.27, wy + 0.13, wz + 0.10], [wx + 0.27, wy + 0.10, wz + 0.24],
    [wx - 0.27, wy + 0.10, wz + 0.24],
    [wx - 0.27, wy + 0.17, wz + 0.10], [wx + 0.27, wy + 0.17, wz + 0.10], [wx + 0.27, wy + 0.13, wz + 0.24],
    [wx - 0.27, wy + 0.13, wz + 0.24],
  ));
  P.turretG.userData.wotanGunnerSightReceipt = Object.freeze({ sight: 'WAO-class gunner sight', windows: 2,
    mountLocal: Object.freeze([wx, wy, wz]) });
}

/** Commander's PERI RTWL on the roof (the S1 photographs): a base housing with its two fixed windows inside a tubular
 *  hoop frame, a short neck on the azimuth bearing and the stabilised drum head with its own window on top. */
function addPeri(P: PumaS1BuilderPort): void {
  const px = 0.30, pz = -0.06, base = T_ROOF, seg = P.q ? 28 : 14;
  P.addEquipment('turret', chamferedPlate(0.48, 0.05, 0.46, 0.012), px, base + 0.02, pz);
  P.addEquipment('turret', convexSlab(
    [px - 0.20, base + 0.04, pz - 0.17], [px + 0.20, base + 0.04, pz - 0.17], [px + 0.20, base + 0.04, pz + 0.17],
    [px - 0.20, base + 0.04, pz + 0.17],
    [px - 0.19, base + 0.30, pz - 0.16], [px + 0.19, base + 0.30, pz - 0.16], [px + 0.19, base + 0.30, pz + 0.15],
    [px - 0.19, base + 0.30, pz + 0.15],
  ));
  P.add('turretDark', box(0.32, 0.13, 0.02), px, base + 0.18, pz + 0.163);
  P.addModuleVisual('optics', 'turretGlass', box(0.13, 0.10, 0.012), px - 0.075, base + 0.18, pz + 0.175);
  P.addModuleVisual('optics', 'turretGlass', box(0.12, 0.10, 0.012), px + 0.08, base + 0.18, pz + 0.175);
  P.addEquipment('turret', cylY(0.13, 0.14, 0.10, seg), px, base + 0.34, pz);
  P.addEquipment('turret', cylY(0.19, 0.19, 0.30, seg), px, base + 0.53, pz);
  P.addEquipment('turret', cylY(0.15, 0.19, 0.05, seg), px, base + 0.705, pz);
  P.add('turretDark', box(0.21, 0.13, 0.05), px, base + 0.54, pz + 0.17);
  P.addModuleVisual('optics', 'turretGlass', box(0.17, 0.10, 0.012), px, base + 0.54, pz + 0.197);
  // hoop frame: two inverted U's of tube standing on the base plate round the housing
  for (const dz of [-0.19, 0.19]) {
    for (const dx of [-0.235, 0.235]) P.addEquipment('turretDetail', beamBetween([px + dx, base + 0.04, pz + dz], [px + dx, base + 0.36, pz + dz], 0.021, 10));
    P.addEquipment('turretDetail', beamBetween([px - 0.235, base + 0.36, pz + dz], [px + 0.235, base + 0.36, pz + dz], 0.021, 10));
  }
  P.turretG.userData.pumaS1RoofOpticsReceipt = Object.freeze({
    sight: 'PERI RTWL commander panoramic periscope',
    mountLocal: Object.freeze([px, base, pz]),
    headSizeM: Object.freeze([0.38, 0.30, 0.38]),
    windows: 3,
    hasWeapon: false,
    turretOwned: true,
  });
}

/** Rear-corner smoke stacks: four 76 mm tubes in a vertical column on a bracket at each rear corner, splayed outward. */
function addSmokeStacks(P: PumaS1BuilderPort): void {
  for (const side of [1, -1] as const) {
    const x = side > 0 ? T_LEFT + 0.08 : T_RIGHT - 0.08, z = -1.20;
    P.addEquipment('turret', box(0.08, 0.50, 0.24), x - side * 0.03, 0.47, z);
    for (let k = 0; k < 4; k++) {
      P.addEquipment('turretDetail', markSmokeTube(cylZ(0.042, 0.26, 12)), x + side * 0.06, 0.29 + k * 0.115, z + 0.04,
        -0.25, side * 0.85, 0);
    }
  }
}

/** The Wotan's twin MELLS cells on the right flank: an armoured two-cell box on a bracket arm (the cells' launch faces at
 *  the published mouth stations, x -1.02, y 0.36 and 0.59, z 0.839). */
function addMells(P: PumaS1BuilderPort): void {
  const lx = -1.02, mouthZ = 0.839, rearZ = -0.20;
  weaponAssembly(P, () => {
    P.addEquipment('turret', chamferedPlate(0.31, 0.50, mouthZ - rearZ - 0.025, 0.02), lx, 0.475, (mouthZ - 0.025 + rearZ) / 2);
    P.addEquipment('turret', box(0.36, 0.06, 0.40), (lx + T_RIGHT) / 2 - 0.02, 0.26, 0.30);
    P.addEquipment('turret', box(0.36, 0.06, 0.30), (lx + T_RIGHT) / 2 - 0.02, 0.64, 0.10);
    for (const y of [0.36, 0.59]) {
      P.add('turretDark', box(0.205, 0.135, 0.024), lx, y, mouthZ - 0.025);
      P.add('turretDetail', box(0.245, 0.17, 0.016), lx, y, mouthZ - 0.022);
      P.add('turretDark', box(0.168, 0.105, 0.018), lx, y, mouthZ - 0.009);
    }
  });
  P.turretG.userData.pumaS1MellsLauncherReceipt = Object.freeze({
    architecture: 'twin-square-armored-cells-v2',
    launchCells: 2,
    circularLaunchTubes: 0,
    mountSide: 'vehicle-right',
    turretOwned: true,
  });
}

/** The Wotan's hard-kill protection set: four flat radar faces on the turret's corners and two launcher heads on the
 *  roof's rear corners, plus the S1's soft-kill (MUSS) warners and jammer. */
function addProtection(P: PumaS1BuilderPort): void {
  const radar = (x: number, z: number, ry: number): void => {
    P.addEquipment('turret', chamferedPlate(0.30, 0.24, 0.06, 0.012), x, T_ROOF - 0.10, z, 0, ry, 0);
    P.add('turretDark', box(0.25, 0.19, 0.01), x + 0.031 * Math.sin(ry), T_ROOF - 0.10, z + 0.031 * Math.cos(ry), 0, ry, 0);
  };
  radar(T_LEFT - 0.06, T_FRONT - 0.30, 0.785);
  radar(T_RIGHT + 0.06, T_FRONT - 0.30, -0.785);
  radar(T_LEFT - 0.06, T_REAR + 0.14, Math.PI - 0.785);
  radar(T_RIGHT + 0.06, T_REAR + 0.14, Math.PI + 0.785);
  for (const side of [1, -1] as const) {
    const x = side > 0 ? 0.74 : -0.42, z = -1.12;
    P.addEquipment('turret', cylY(0.15, 0.17, 0.08, P.q ? 20 : 10), x, T_ROOF + 0.04, z);
    P.addEquipment('turret', convexSlab(
      [x - 0.13, T_ROOF + 0.08, z - 0.16], [x + 0.13, T_ROOF + 0.08, z - 0.16], [x + 0.11, T_ROOF + 0.08, z + 0.16],
      [x - 0.11, T_ROOF + 0.08, z + 0.16],
      [x - 0.12, T_ROOF + 0.30, z - 0.14], [x + 0.12, T_ROOF + 0.30, z - 0.14], [x + 0.10, T_ROOF + 0.26, z + 0.15],
      [x - 0.10, T_ROOF + 0.26, z + 0.15],
    ), 0, 0, 0);
    P.add('turretDark', box(0.17, 0.12, 0.012), x, T_ROOF + 0.18, z + 0.158);
  }
  // MUSS: a jammer head on the roof's rear centre, a warner on each roof corner looking outward
  P.addEquipment('turret', cylY(0.035, 0.05, 0.12, 10), 0.16, T_ROOF + 0.06, -1.32);
  P.addEquipment('turret', cylY(0.10, 0.10, 0.18, P.q ? 20 : 10), 0.16, T_ROOF + 0.21, -1.32);
  P.add('turretDark', cylY(0.104, 0.104, 0.05, P.q ? 20 : 10), 0.16, T_ROOF + 0.21, -1.32);
  for (const [x, z, ry] of [[T_LEFT - 0.16, T_FRONT - 0.10, 0.6], [T_RIGHT + 0.16, T_FRONT - 0.10, -0.6],
    [T_LEFT - 0.20, T_REAR + 0.10, Math.PI - 0.6], [T_RIGHT + 0.20, T_REAR + 0.10, Math.PI + 0.6]] as const) {
    P.addEquipment('turret', box(0.11, 0.10, 0.09), x, T_ROOF + 0.045, z, 0, ry, 0);
    P.addModuleVisual('optics', 'turretGlass', cylZ(0.028, 0.012, 12), x + 0.045 * Math.sin(ry), T_ROOF + 0.05, z + 0.045 * Math.cos(ry), 0, ry, 0);
  }
  P.turretG.userData.wotanProtectionReceipt = Object.freeze({ hardKillRadarFaces: 4, hardKillLaunchers: 2,
    softKillWarners: 4, jammer: 1 });
}

function addTurretStowage(P: PumaS1BuilderPort): void {
  mount(P, 'turret', FITTINGS.stowageRack({ mats: P.mats, w: 1.30, d: 0.32, h: 0.20, fill: 0.5, rails: 3, seed: 210 }),
    0.16, T_BUSTLE_FLOOR + 0.06, T_REAR - 0.17);
  for (const [x, h, seed] of [[0.84, 0.80, 190], [-0.50, 0.70, 191]] as const) {
    P.add('turretDark', cylY(0.040, 0.055, 0.09, 10), x, T_ROOF + 0.045, -1.38);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h, r: 0.010, seed }), x, T_ROOF + 0.07, -1.38);
  }
}

function addGun(P: PumaS1BuilderPort): void {
  // MK30-2/ABM in its armoured housing: a tapered closed box that elevates with the gun, the trunnion at the turret face;
  // ahead of it the perforated barrel cradle and the ABM muzzle programmer.
  P.addGunExtra(convexSlab(
    [-0.20, -0.15, -0.36], [0.20, -0.15, -0.36], [0.13, -0.09, 1.08], [-0.13, -0.09, 1.08],
    [-0.20, 0.30, -0.36], [0.20, 0.30, -0.36], [0.13, 0.13, 1.08], [-0.13, 0.13, 1.08],
  ));
  const housingTop = (z: number): number => 0.30 - (z + 0.36) * (0.17 / 1.44);
  for (let k = 0; k < 6; k++) {
    const z = -0.22 + k * 0.085;
    P.addGunExtraDark(box(0.31 - k * 0.006, 0.018, 0.03), 0, housingTop(z) + 0.004, z, Math.atan(0.17 / 1.44), 0, 0);
  }
  P.addGunExtra(chamferedPlate(0.15, 0.13, 1.42, 0.02), 0, 0.005, 1.78);
  for (const side of [-1, 1]) {
    for (let k = 0; k < 9; k++) P.addGunExtraDark(cylX(0.027, 0.006, 12), side * 0.076, 0.012, 1.19 + k * 0.148);
  }
  KIT.buildGun(P, { len: 2.85, r: 0.056, sleeve: false, collar: true, baseR: 0.112 });
  P.add('gun', cylZ(0.076, 0.28, P.q ? 24 : 12), 0, 0, 2.63);
  // coaxial MG4 beside the housing, its sleeve on the housing's left wall
  P.addGunExtra(box(0.07, 0.07, 0.42), 0.165, -0.04, 0.80);
  P.addGunExtraDark(cylZ(0.016, 0.30, 10), 0.165, -0.04, 1.15);
  P.addGunExtraDark(cylZ(0.022, 0.05, 10), 0.165, -0.04, 1.30);
  muzzleTipDot(P, 0.165, -0.04, 1.326, 0.011, { parent: 'gunG' });
  P.gunG.userData.pumaS1GunHousingReceipt = Object.freeze({
    architecture: 'tapered-armoured-housing-perforated-cradle-v1',
    movingWithGun: true,
    housingLengthM: 1.44,
    perforatedCradleHolesPerSide: 9,
    coaxSide: 'left',
  });
}

function buildPumaS1(P: PumaS1BuilderPort): void {
  // 2026-10-09 (owner): the field net and garnish (ghillieFleetSuits.ts), laid on the assembled build
  addVehicleGhillieSuit(P);
  addHullShell(P);
  addSideArmour(P);
  addSlatQuarters(P);
  addRunningGear(P);
  addHullEquipment(P);
  addTurret(P);
  addPeri(P);
  addSmokeStacks(P);
  addMells(P);
  addProtection(P);
  addTurretStowage(P);
  addGun(P);
  // The decor (decorations.ts) seats its loads after the 90 % bake, in the groups' final frames: it keeps them off the
  // protection set's launcher heads and the PERI hoop, and out of the slat quarters (whose rear wraps lie inside the
  // lattice's side bands).
  const k = ADVANCED_IFV_SCALE;
  const reserve = (group: THREE.Object3D, min: Vec3, max: Vec3): void =>
    reserveDecorVolume(group, [min[0] * k, min[1] * k, min[2] * k], [max[0] * k, max[1] * k, max[2] * k]);
  reserve(P.turretG, [-0.58, T_ROOF, -1.30], [0.90, T_ROOF + 0.32, -0.94]);
  reserve(P.turretG, [-0.10, T_ROOF, -0.30], [0.62, T_ROOF + 0.78, 0.18]);
  // (and off both flanks' rear quarters, where the smoke stacks fire, and the right flank behind the MELLS cells)
  reserve(P.turretG, [-1.34, 0, -1.62], [T_RIGHT, T_ROOF + 0.10, -0.18]);
  reserve(P.turretG, [T_LEFT, 0, -1.62], [1.40, T_ROOF + 0.10, -0.86]);
  for (const side of [-1, 1]) {
    const [x0, x1] = side > 0 ? [1.04, 1.95] : [-1.95, -1.04];
    reserve(P.hullG, [x0, 0.78, -3.84], [x1, 1.86, -2.58]);
  }
  P.decal('turret', 'crossgrey', null, 0.27, [T_LEFT + 0.05, 0.44, -0.80], Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || 'S1-481', 0.21, [0.30, 1.24, 3.711], 0);
  if (P.geometryReceipt) {
    P.hullG.userData.pumaS1Receipt = Object.freeze({
      independentFromLegacyPuma: true,
      hullConstruction: 'puma-s1-measured-troop-cell-v8',
      roofY: ROOF_Y,
      glacisBreakZ: GLACIS_Z,
      glacisFallPerM: GLACIS_FALL,
      lowerGlacis: 'section-solid-28deg',
      rearRampRakePerM: RAMP_RAKE,
      roadWheelsPerSide: 6,
      canonicalTrackCourses: 1,
      trackCenterlineM: 1.31,
      sideArmorUpperModulesPerSide: UPPER_COUNT,
      sideArmorLowerModulesPerSide: LOWER_COUNT,
      sideArmorOuterFaceM: ARMOUR_X,
      sideArmorFootY: SKIRT_Y,
      skirtArchitecture: 'two-row-bevelled-cassettes-v1',
      rightSideCoolingLouvre: true,
      slatQuarters: 2,
      cornerCameras: 4,
      rearStowageBins: 2,
      crewLocation: 'protected-hull-cell',
      rearTroopRamp: true,
    });
    P.turretG.userData.pumaS1TurretReceipt = Object.freeze({
      unmanned: true,
      gun: 'MK30-2/ABM',
      launcher: 'MELLS-Spike-LR2',
      stabilizedPanoramicSight: true,
      gunnerSight: 'left-cheek',
      turretBodyM: Object.freeze([T_LEFT - T_RIGHT, T_ROOF - T_FLOOR, T_FRONT - T_REAR].map((v) => Math.round(v * 1000) / 1000)),
      ringOffsetSide: 'vehicle-left',
      remoteSecondaryWeapon: null,
      smokeStacks: 2,
      hardKillProtection: true,
    });
  }
  P.topY = Math.max(P.topY || 0, 1.86);
  applyAdvancedIfvScale(P, 'cot-spz-puma-s1-compact-r1');
}

export const PUMA_S1_PROFILES = Object.freeze({
  spz_wotan: Object.freeze({ build: buildPumaS1 }),
}) satisfies VehicleProfileRecord;
