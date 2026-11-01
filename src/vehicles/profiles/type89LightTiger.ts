import { weaponAssembly } from './weaponStock.ts';
// Independent first-party procedural Raijū IFV (the "Type 89 Light Tiger" line).
//
// 267 rebuild (ifv-kf51-modern-267, Builder C): a modern JGSDF-style successor of the Mitsubishi Type 89 FV. Its
// frame is measured from the real vehicle (the local Type 89 source oracle and published dimensions, research packet
// ~/cot-lanes/ifv-modern-267-evidence/research/raiju_ifv): the long low hull with the sharp wedge bow (a 33-degree
// lower glacis and a raked nose plate under a shallow 12-degree upper glacis), vertical upper sides under a bevelled
// roof edge, six road wheels with a raised front sprocket and three return rollers, side-hinged twin rear doors and
// the steep-sided compact turret with the 35 mm KDE and a launcher on each flank. The modernisation follows the Type
// 10 / Type 16 generation: bolted add-on modules on the glacis, the nose, the hull sides and the turret cheeks, twin
// launcher pods (four cells), a gunner's sight and a stalked panoramic commander's sight, laser warners, four-tube
// smoke banks, a light remote weapon station and the commander's pintle M2.
//
// The owner-supplied Type 89 GLB is a measurement reference only. No mesh, texture, node or legacy Type 89 builder is
// consumed here: every plate, module, wheel course and fitting is authored from the repository's primitives. The
// whole vehicle is authored in that measured metre frame and published at 90 % (applyAdvancedIfvScale).

import * as THREE from 'three';
import { KIT, FITTINGS, muzzleBore, muzzleTipDot, orientedSlab, convexSlab } from './kit.ts';
import {
  applyAdvancedIfvScale,
  type AdvancedIfvScalePort,
} from './advancedIfvScale.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { mountRotated as mount } from './fittingMount.ts';
import { launchCellParts, perforatedPlate } from './missileCanisterStock.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { mirrorX } from '../runningGearPrimitives.ts';
import { hatchParts } from './fieldChest.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';

type Vec3 = [number, number, number];
type Owner = 'hull' | 'turret';

interface LightTigerBuilderPort extends AdvancedIfvScalePort {
  readonly gunG: THREE.Group;
  readonly mats: Record<string, THREE.Material>;
  readonly geometryReceipt?: boolean;
  readonly q?: boolean;
  readonly spec: { readonly id: string; readonly visual: { readonly number?: string } };
  muzzleZ: number;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addEquipment(owner: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addExternalArmor(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addHatch(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addModuleVisual(module: string, slot: string, geometry: THREE.BufferGeometry,
    ...transform: number[]): void;
  hangMudguard(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  decal(owner: Owner, kind: string, label: string | null, scale: number,
    position: Vec3, ...orientation: number[]): void;
}

const { box, cylX, cylY, cylZ } = KIT;

// ---------------------------------------------------------------------------------------------------------------------
// Measured frame (authoring metres; the published vehicle is 90 % of it). Real Type 89 FV: hull 6.8 m, width 3.2 m,
// roof 1.78 m, belly 0.48 m; the Raijū raises the roof to the 1.93 m turret seat (its spec pivot) and hangs 0.135 m
// add-on modules outside the 1.56 m sides.
// ---------------------------------------------------------------------------------------------------------------------
const ROOF_Y = 1.93;            // the turret seat: spec turret pivot [0, 1.93, -0.50]
const SIDE_X = 1.56;            // upper hull side
const SPONSON_Y = 1.22;         // sponson floor over the track's return run
const KNEE_Y = 1.56;            // top of the vertical side, foot of the roof bevel
const ROOF_HALF = 1.28;         // roof edge
const TUB_X = 1.06;             // lower hull between the tracks
const BELLY_Y = 0.47;
const GLACIS_Z = 1.05;          // upper glacis break
const NOSE_Z = 3.30;            // sharp nose edge
const NOSE_Y = 1.45;
const REAR_Z = -3.26;
const GLACIS_SLOPE = (ROOF_Y - NOSE_Y) / (NOSE_Z - GLACIS_Z);
const GLACIS_RX = Math.atan(GLACIS_SLOPE);
const glacisY = (z: number): number => z <= GLACIS_Z ? ROOF_Y : ROOF_Y - GLACIS_SLOPE * (z - GLACIS_Z);

// Module stations (z0 rear, z1 front, bottom-rear, bottom-front) of the bolted side armour, front to back.
const SIDE_MODULES: readonly (readonly [number, number, number, number])[] = Object.freeze([
  [1.76, 2.98, 0.74, 1.02],
  [0.52, 1.73, 0.74, 0.74],
  [-0.72, 0.49, 0.74, 0.74],
  [-1.96, -0.75, 0.74, 0.74],
  [-3.20, -1.99, 0.96, 0.74],
]);
const MODULE_IN = 1.585, MODULE_OUT = 1.72, MODULE_TOP = 1.36;

const hullRing = (s: number, f: number, k: number, r: number, t: number): SectionPoint[] =>
  [[-s, f], [s, f], [s, k], [r, t], [-r, t], [-s, k]];

/** One +X solid and its mirrored -X twin in the same bucket. */
function pair(P: LightTigerBuilderPort, slot: string, geometry: THREE.BufferGeometry,
  add: (slot: string, g: THREE.BufferGeometry) => void = (s, g) => P.add(s, g)): void {
  add(slot, geometry);
  add(slot, mirrorX(geometry.clone()));
}

// ---------------------------------------------------------------------------------------------------------------------
// Hull
// ---------------------------------------------------------------------------------------------------------------------
function addHullShell(P: LightTigerBuilderPort): void {
  // Upper body: vertical sides, bevelled roof edge, flat roof, the shallow upper glacis to the sharp nose edge and a
  // chamfered stern edge. Its floor is the sponson over the tracks.
  P.add('hull', sectionSolid([
    { z: REAR_Z, ring: hullRing(SIDE_X, SPONSON_Y, 1.50, 1.18, 1.78) },
    { z: -2.62, ring: hullRing(SIDE_X, SPONSON_Y, KNEE_Y, ROOF_HALF, ROOF_Y) },
    { z: GLACIS_Z, ring: hullRing(SIDE_X, SPONSON_Y, KNEE_Y, ROOF_HALF, ROOF_Y) },
    { z: NOSE_Z, ring: hullRing(SIDE_X, SPONSON_Y, 1.31, 1.40, NOSE_Y) },
  ]));
  // Lower tub between the tracks: the raked stern belly, flat floor, the 33-degree lower glacis and the raked nose plate
  // that meets the upper body's nose band (the wedge bow).
  const tub = (f: number, t = 1.30): SectionPoint[] =>
    [[-1.00, f], [1.00, f], [TUB_X, f + 0.06], [TUB_X, t], [-TUB_X, t], [-TUB_X, f + 0.06]];
  P.add('hull', sectionSolid([
    { z: -3.235, ring: tub(0.72) },
    { z: -2.62, ring: tub(BELLY_Y) },
    { z: 2.50, ring: tub(BELLY_Y) },
    { z: 3.06, ring: tub(0.84) },
    { z: 3.285, ring: tub(1.20) },
  ]));
}

function addGlacisArmour(P: LightTigerBuilderPort): void {
  // Three bolted composite modules lie on the front of the upper glacis (Type 10 practice: flat bolted cassettes with
  // their seams and heads showing), and a thick wedge plate caps the raked nose plate below the nose edge.
  const t = 0.075, sink = 0.010, z0 = 2.34, z1 = 3.24;
  const lay = (x0: number, x1: number): THREE.BufferGeometry => {
    const yb0 = glacisY(z0) - sink, yb1 = glacisY(z1) - sink;
    const lift = t / Math.cos(GLACIS_RX);
    return orientedSlab(
      [x0, yb0, z0], [x1, yb0, z0], [x1, yb1, z1], [x0, yb1, z1],
      [x0 + 0.015, yb0 + lift, z0 + 0.012], [x1 - 0.015, yb0 + lift, z0 + 0.012],
      [x1 - 0.015, yb1 + lift, z1 - 0.030], [x0 + 0.015, yb1 + lift, z1 - 0.030],
    );
  };
  for (const [x0, x1] of [[-1.22, -0.43], [-0.41, 0.41], [0.43, 1.22]] as const) {
    P.addExternalArmor('hull', lay(x0, x1));
    // bolt heads in two rows, sunk 5 mm into the module face
    for (const z of [z0 + 0.10, z1 - 0.12]) {
      for (const f of [0.18, 0.82]) {
        const x = x0 + (x1 - x0) * f, y = glacisY(z) - sink + t / Math.cos(GLACIS_RX) - 0.004;
        P.add('hullDetail', cylY(0.024, 0.024, 0.022, P.q ? 10 : 6), x, y + 0.006, z, GLACIS_RX, 0, 0);
      }
    }
  }
  // Nose wedge: a 70 mm plate over the raked nose plate, its top edge tucked under the nose band.
  P.addExternalArmor('hull', convexSlab(
    [-0.98, 0.86, 3.045], [0.98, 0.86, 3.045], [0.98, 1.215, 3.27], [-0.98, 1.215, 3.27],
    [-0.94, 0.88, 3.105], [0.94, 0.88, 3.105], [0.94, 1.215, 3.335], [-0.94, 1.215, 3.335],
  ));
  // Tow clevises on the lower glacis (33.5 degrees), each with its shackle ring looped through the clevis.
  const lowerRx = -Math.atan2(0.84 - BELLY_Y, 3.06 - 2.50);
  const n = new THREE.Vector3(0, -(3.06 - 2.50), 0.84 - BELLY_Y).normalize();   // outward, forward and down
  for (const x of [-0.62, 0.62]) {
    const sz = 2.84, sy = BELLY_Y + (sz - 2.50) * (0.84 - BELLY_Y) / (3.06 - 2.50);
    P.add('hullDetail', box(0.12, 0.10, 0.11), x, sy + n.y * 0.035, sz + n.z * 0.035, lowerRx, 0, 0);
    P.add('hullDark', KIT.torus(0.050, 0.016, P.q ? 14 : 8), x, sy + n.y * 0.10, sz + n.z * 0.10, 0, 0, Math.PI / 2);
  }
}

function addSideArmour(P: LightTigerBuilderPort): void {
  // Six bolted side modules per side replace the Type 89's thin skirt: 135 mm cassettes from the wheel tops to just
  // under the roof bevel, the first rising over the sprocket and the last over the idler. Each hangs on a full-length
  // rail bolted to the hull side; their outer edges are chamfered and a lifting handle sits in each.
  const ring = (bottom: number): SectionPoint[] => [
    [MODULE_IN, bottom], [MODULE_OUT - 0.028, bottom], [MODULE_OUT, bottom + 0.028],
    [MODULE_OUT, MODULE_TOP - 0.03], [MODULE_OUT - 0.03, MODULE_TOP], [MODULE_IN, MODULE_TOP],
  ];
  for (const [z0, z1, b0, b1] of SIDE_MODULES) {
    const stations: SolidSection[] = b0 === b1
      ? [{ z: z0, ring: ring(b0) }, { z: z1, ring: ring(b1) }]
      : b1 > b0
        ? [{ z: z0, ring: ring(b0) }, { z: z1 - 0.58, ring: ring(b0) }, { z: z1, ring: ring(b1) }]
        : [{ z: z0, ring: ring(b0) }, { z: z0 + 0.36, ring: ring(b1) }, { z: z1, ring: ring(b1) }];
    pair(P, 'hullExternalArmor', sectionSolid(stations));
    const mid = (z0 + z1) / 2;
    for (const side of [-1, 1]) {
      // recessed lifting handle and four bolt heads
      P.add('hullDark', box(0.020, 0.050, 0.20), side * (MODULE_OUT + 0.002), 1.16, mid);
      P.add('hullDetail', box(0.030, 0.022, 0.20), side * (MODULE_OUT + 0.012), 1.186, mid);
      for (const dz of [-0.45, 0.45]) {
        for (const y of [0.86, 1.28]) {
          if (Math.abs(mid + dz) > 3.0) continue;
          P.add('hullDetail', cylX(0.022, 0.024, P.q ? 10 : 6), side * (MODULE_OUT + 0.008), y, mid + dz);
        }
      }
    }
  }
  // Hanger rail: buried in the hull side and in every module's inner face.
  pair(P, 'hull', sectionSolid([
    { z: -3.20, ring: [[SIDE_X - 0.008, 1.235], [MODULE_IN + 0.008, 1.235], [MODULE_IN + 0.008, 1.335], [SIDE_X - 0.008, 1.335]] },
    { z: 2.98, ring: [[SIDE_X - 0.008, 1.235], [MODULE_IN + 0.008, 1.235], [MODULE_IN + 0.008, 1.335], [SIDE_X - 0.008, 1.335]] },
  ]));
}

function addBowFittings(P: LightTigerBuilderPort): void {
  for (const side of [-1, 1]) {
    // Armoured headlight boxes at the nose corners over the track (the Type 89's caged lamps), a grille over their
    // lamps, and a rubber mudflap hung from each.
    // The box sits flush with the nose, clear of the track's wrap round the sprocket below it.
    const x = side * 1.36, fz = 3.34;
    P.add('hull', box(0.40, 0.32, 0.24), x, 1.24, fz - 0.12);
    P.add('hullDark', box(0.32, 0.18, 0.020), x, 1.23, fz + 0.003);
    P.addEquipment('hullDark', markVehicleNightLens(cylZ(0.050, 0.020, P.q ? 16 : 10), 'headlight'), x - side * 0.07, 1.23, fz + 0.010);
    P.addEquipment('hullGlass', markVehicleNightLens(cylZ(0.040, 0.010, P.q ? 16 : 10), 'headlight'), x - side * 0.07, 1.23, fz + 0.018);
    P.addEquipment('hullGlass', box(0.050, 0.040, 0.012), x + side * 0.09, 1.23, fz + 0.015);
    for (let i = 0; i < 4; i++) P.add('hullDetail', box(0.012, 0.18, 0.018), x - 0.12 + i * 0.08, 1.23, fz + 0.018);
    P.hangMudguard(`raiju-front-${side}`, 'hullRubber', box(0.40, 0.28, 0.025), x, 0.93, fz - 0.06, -0.10, 0, 0);
  }
  // Driver's hatch (vehicle left, over the spec's driver station) and its three forward periscopes, on the glacis.
  const hz = 1.78, hx = 0.64;
  const hatch = hatchParts(0.30, !!P.q, -1);
  const hy = glacisY(hz);
  for (const g of hatch.lid) P.addHatch('hull', g, hx, hy - 0.006, hz, GLACIS_RX, 0, 0);
  for (const g of hatch.dark) P.addEquipment('hullDark', g, hx, hy - 0.006, hz, GLACIS_RX, 0, 0);
  for (const dx of [-0.17, 0, 0.17]) {
    const z = hz + 0.40, y = glacisY(z);
    P.addModuleVisual('optics', 'hullDetail', box(0.14, 0.08, 0.11), hx + dx, y + 0.03, z, GLACIS_RX, 0, 0);
    P.addModuleVisual('optics', 'hullGlass', box(0.11, 0.030, 0.012), hx + dx, y + 0.045, z + 0.052, GLACIS_RX, 0, 0);
  }
  // Engine deck (vehicle right): the framed intake grille on the glacis and the louvred exhaust on the right side.
  const gz0 = 1.18, gz1 = 2.22, gx = -0.74, gw = 0.82;
  const gm = (gz0 + gz1) / 2, gy = glacisY(gm), glen = (gz1 - gz0) / Math.cos(GLACIS_RX);
  P.add('hullDetail', box(gw + 0.08, 0.035, glen + 0.08), gx, gy + 0.010, gm, GLACIS_RX, 0, 0);
  P.add('hullDark', box(gw, 0.030, glen), gx, gy + 0.020, gm, GLACIS_RX, 0, 0);
  for (let i = 0; i < (P.q ? 12 : 6); i++) {
    const z = gz0 + 0.05 + i * (gz1 - gz0 - 0.10) / ((P.q ? 12 : 6) - 1);
    P.add('hullDetail', box(gw, 0.014, 0.022), gx, glacisY(z) + 0.036, z, GLACIS_RX, 0, 0);
  }
  // exhaust louvres on the right side wall, just under the roof bevel (the Type 89's side outlet, mirrored with the
  // engine): a framed panel standing 15 mm proud, a dark outlet and its slats
  const ex = -SIDE_X, ez = 1.18, el = 0.92;
  P.add('hullDetail', box(0.030, 0.17, el + 0.06), ex - 0.008, 1.455, ez);
  P.add('hullDark', box(0.020, 0.13, el), ex - 0.020, 1.455, ez);
  for (let i = 0; i < (P.q ? 9 : 5); i++) {
    P.add('hullDetail', box(0.018, 0.13, 0.016), ex - 0.026, 1.455, ez - el / 2 + 0.05 + i * (el - 0.10) / ((P.q ? 9 : 5) - 1));
  }
}

function addRoofAndStern(P: LightTigerBuilderPort): void {
  // Troop compartment roof: two low rectangular hatches behind the turret's sweep, clear of the gun at depression.
  // Their hinges are on the forward edge and the lids stand 20 mm proud, under the gun's line at full depression.
  for (const x of [-0.52, 0.52]) {
    P.addHatch('hull', box(0.82, 0.024, 0.50), x, ROOF_Y + 0.008, -2.36);
    P.add('hullDark', box(0.86, 0.008, 0.54), x, ROOF_Y + 0.002, -2.36);
    P.addEquipment('hullDetail', box(0.30, 0.012, 0.030), x, ROOF_Y + 0.024, -2.54);
    P.addEquipment('hullDark', cylX(0.018, 0.70, 10), x, ROOF_Y + 0.012, -2.09);
  }
  for (const [x, z] of [[-1.12, 0.90], [1.12, 0.90]] as const) {
    KIT.liftEye(P, 'hullDetail', x, ROOF_Y, z);
  }
  // Twin side-hinged rear doors (the Type 89's), each with a vision block and a firing port, the hinges on the outer
  // edges, and a lever handle; stowage boxes and tail lights over the tracks.
  const dz = REAR_Z - 0.012;
  for (const side of [-1, 1]) {
    const cx = side * 0.47;
    P.addHatch('hull', box(0.84, 0.98, 0.045), cx, 1.23, dz);
    P.add('hullDark', box(0.006, 0.96, 0.050), side * 0.04, 1.23, dz - 0.002);
    for (const y of [0.86, 1.56]) {
      P.add('hullDetail', cylY(0.034, 0.034, 0.16, 10), side * 0.90, y, REAR_Z - 0.03);
      P.add('hullDetail', box(0.10, 0.10, 0.040), side * 0.84, y, REAR_Z - 0.028);
    }
    P.add('hullDetail', cylZ(0.11, 0.050, P.q ? 20 : 10), cx, 1.20, dz - 0.040);
    P.add('hullDark', cylZ(0.060, 0.030, P.q ? 16 : 8), cx, 1.20, dz - 0.062);
    P.addModuleVisual('optics', 'hullGlass', box(0.16, 0.070, 0.012), cx, 1.50, dz - 0.028);
    P.add('hullDetail', box(0.050, 0.20, 0.050), cx + side * 0.30, 1.06, dz - 0.040);
    // rear corner stowage box and tail light
    const bx = side * 1.33;
    P.addEquipment('hullDetail', box(0.42, 0.34, 0.30), bx, 1.40, REAR_Z - 0.13);
    P.addEquipment('hullGlass', box(0.12, 0.060, 0.012), bx, 1.30, REAR_Z - 0.285);
    P.hangMudguard(`raiju-rear-${side}`, 'hullRubber', box(0.40, 0.34, 0.025), bx, 1.02, REAR_Z - 0.10, 0.06, 0, 0);
  }
  for (const x of [-0.75, 0.75]) {
    P.add('hullDark', KIT.torus(0.050, 0.017, P.q ? 14 : 8), x, 0.70, REAR_Z + 0.02, 0, 0, Math.PI / 2);
  }
  // Firing-port bosses: the Type 89's three ball ports per side, kept on the roof bevel behind the turret.
  const bevelRz = Math.atan2(SIDE_X - ROOF_HALF, ROOF_Y - KNEE_Y);
  for (const z of [-1.40, -1.95, -2.50]) {
    for (const side of [-1, 1]) {
      const x = side * (SIDE_X - 0.10), y = KNEE_Y + 0.13;
      P.add('hullDetail', cylY(0.15, 0.17, 0.060, P.q ? 20 : 10), x, y, z, 0, 0, -side * bevelRz);
      P.add('hullDark', cylY(0.085, 0.085, 0.070, P.q ? 16 : 8), x + side * 0.004, y + 0.004, z, 0, 0, -side * bevelRz);
    }
  }
}

function addRunningGear(P: LightTigerBuilderPort): void {
  // Type 89 course: six road wheels at 0.788 m, raised front sprocket and rear idler, three return rollers behind the
  // module skirt. Wheel stations are the measured Type 89 stations.
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', dishR: 0.88, wheelR: 0.325, wheelW: 0.25,
    wheelY: 0.404, xc: 1.34,
    wheelZs: [1.89, 1.10, 0.32, -0.47, -1.26, -2.05],
    sprocket: { z: 2.79, y: 0.82, r: 0.285 },
    idler: { z: -2.80, y: 0.78, r: 0.275 },
    rollers: [{ z: 1.50, y: 0.99 }, { z: -0.08, y: 0.99 }, { z: -1.66, y: 0.99 }],
    rollerR: 0.080, trackW: 0.45, trackTh: 0.070,
    trackPattern: 'japanese-modular', linkPitchM: 0.145, shoeWidthScale: 0.985,
    topY: 1.10, botY: 0.050, paintedEnds: true, arms: true,
    coveredTop: true,
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Turret (local frame: origin at the pivot, roof at y 0.65)
// ---------------------------------------------------------------------------------------------------------------------
const T_ROOF = 0.65;
const T_HALF = 0.96;

function addTurretShell(P: LightTigerBuilderPort): void {
  // Race collar.
  P.add('turret', cylY(0.92, 0.96, 0.06, P.q ? 48 : 24), 0, 0.01, 0);
  // Main crew box: steep sides with a crease (Type 89), flat roof, short bustle with a raked back.
  const ring = (b: number, k: number, r: number, t: number): SectionPoint[] =>
    [[-b, 0.02], [b, 0.02], [k, 0.30], [r, t], [-r, t], [-k, 0.30]];
  P.add('turret', sectionSolid([
    { z: -1.64, ring: ring(0.80, 0.84, 0.76, 0.55) },
    { z: -1.44, ring: ring(T_HALF - 0.02, T_HALF, 0.88, T_ROOF) },
    { z: 0.88, ring: ring(T_HALF - 0.02, T_HALF, 0.88, T_ROOF) },
  ]));
  // Front: two angled cheeks either side of the open gun slot, on a low chin under the mantlet (an arrowhead in plan).
  const front = (o: number, ot: number): SectionPoint[] => [
    [-o, 0.02], [o, 0.02], [o + 0.02, 0.30], [ot, T_ROOF], [0.37, T_ROOF], [0.37, 0.10],
    [-0.37, 0.10], [-0.37, T_ROOF], [-ot, T_ROOF], [-o - 0.02, 0.30],
  ];
  P.add('turret', sectionSolid([
    { z: 0.60, ring: front(T_HALF - 0.02, 0.88) },
    { z: 0.92, ring: front(T_HALF - 0.02, 0.88) },
    { z: 1.20, ring: front(0.41, 0.40) },
  ]));
}

function addTurretArmour(P: LightTigerBuilderPort): void {
  // Type 10-style bolted cheek modules: 150 mm wedges laid on each angled cheek, with a chamfered crown.
  const a = new THREE.Vector2(0.41, 1.20), b = new THREE.Vector2(T_HALF, 0.92);
  const along = b.clone().sub(a).normalize(), normal = new THREE.Vector2(along.y, -along.x);  // outward-forward
  if (normal.y < 0) normal.multiplyScalar(-1);
  const t = 0.15, sink = 0.012;
  const pt = (s: number, n: number, y: number): number[] => {
    const p = a.clone().addScaledVector(b.clone().sub(a), s).addScaledVector(normal, n);
    return [p.x, y, p.y];
  };
  const cheek = convexSlab(
    pt(0.06, -sink, 0.05), pt(1.02, -sink, 0.05), pt(1.02, t, 0.08), pt(0.06, t, 0.08),
    pt(0.06, -sink, 0.64), pt(1.02, -sink, 0.64), pt(1.02, t - 0.04, 0.60), pt(0.06, t - 0.04, 0.60),
  );
  pair(P, 'turretExternalArmor', cheek);
  for (const side of [-1, 1]) {
    for (const s of [0.25, 0.75]) {
      for (const y of [0.18, 0.50]) {
        const [x, , z] = pt(s, t + 0.004, y);
        P.add('turretDetail', cylZ(0.022, 0.020, P.q ? 10 : 6), side * x, y, z, 0, side * Math.atan2(normal.x, normal.y), 0);
      }
    }
  }
  // a recessed lifting handle on each cheek module
  for (const side of [-1, 1]) {
    const [x, , z] = pt(0.52, t - 0.004, 0.40);
    const yaw = side * Math.atan2(normal.x, normal.y);
    P.add('turretDark', box(0.20, 0.045, 0.020), side * x, 0.40, z, 0, yaw, 0);
    P.add('turretDetail', box(0.20, 0.018, 0.030), side * x, 0.425, z, 0, yaw, 0);
  }
  // Bolted side panels on the forward turret walls, ahead of the launcher pods.
  pair(P, 'turretExternalArmor', sectionSolid([
    { z: 0.06, ring: [[T_HALF - 0.01, 0.06], [T_HALF + 0.06, 0.06], [T_HALF + 0.06, 0.56], [T_HALF - 0.01, 0.56]] },
    { z: 0.86, ring: [[T_HALF - 0.01, 0.06], [T_HALF + 0.06, 0.06], [T_HALF + 0.06, 0.56], [T_HALF - 0.01, 0.56]] },
  ]));
  for (const side of [-1, 1]) {
    P.add('turretDark', box(0.020, 0.045, 0.20), side * (T_HALF + 0.061), 0.48, 0.30);
    P.add('turretDetail', box(0.030, 0.018, 0.20), side * (T_HALF + 0.068), 0.505, 0.30);
    for (const z of [0.14, 0.78]) for (const y of [0.12, 0.50]) {
      P.add('turretDetail', cylX(0.020, 0.016, P.q ? 10 : 6), side * (T_HALF + 0.062), y, z);
    }
  }
}

function addMantletAndGun(P: LightTigerBuilderPort): void {
  // Flat gun mask and compact rocking mantlet in the gun slot: the KDE-35's shield moves with the gun and clears the
  // slot walls (±0.37) and back wall (z 0.88) at every pitch.
  P.addGunExtra(box(0.62, 0.40, 0.40), 0, 0, 0.04);
  P.addGunExtra(orientedSlab(
    [-0.30, -0.19, 0.24], [0.30, -0.19, 0.24], [0.30, -0.19, 0.30], [-0.30, -0.19, 0.30],
    [-0.30, 0.19, 0.24], [0.30, 0.19, 0.24], [0.27, 0.15, 0.30], [-0.27, 0.15, 0.30],
  ));
  P.addGunExtra(cylZ(0.105, 0.30, P.q ? 24 : 12), 0, 0, 0.44);
  P.addGunExtraDark(cylZ(0.080, 0.030, P.q ? 24 : 12), 0, 0, 0.596);
  for (const x of [-0.24, 0.24]) {
    for (const y of [-0.14, 0.14]) P.addGunExtraDark(cylZ(0.020, 0.016, 8), x, y, 0.305);
  }
  KIT.buildGun(P, { len: 3.10, r: 0.058, sleeve: false, collar: true, baseR: 0.115 });
  muzzleBore(P, { len: 3.10, r: 0.058, boreR: 0.036 });
  // 7.62 mm coax on the gun's left, its barrel standing 0.25 m proud of the mask with its flash hider.
  P.addGunExtraDark(cylZ(0.040, 0.050, 12), 0.19, -0.05, 0.315);
  P.addGunExtraDark(cylZ(0.020, 0.28, 12), 0.19, -0.05, 0.44);
  P.addGunExtraDark(cylZ(0.026, 0.05, 12), 0.19, -0.05, 0.585);
  muzzleTipDot(P, 0.19, -0.05, 0.612, 0.013, { parent: 'gunG' });
  P.gunG.userData.type89GunMantletReceipt = Object.freeze({
    architecture: 'slot-mounted-flat-mask-rocking-mantlet-v2',
    movingWithGun: true,
    verticalOffsetM: 0,
    lengthM: 0.60,
    slotHalfWidthM: 0.37,
    slotBackWallZM: 0.88,
    surroundsMainBarrel: true,
    surroundsCoax: true,
  });
}

/** Twin-cell launcher pod (two stacked Jyu-MAT Kai cells) on its trunnion arm, outboard of the turret wall. */
function addLauncherPods(P: LightTigerBuilderPort): void {
  weaponAssembly(P, () => {
    const cell = { bore: 0.088, wall: 0.020, proud: 0.050, behind: 0.02, depth: 0.36, segments: [24, 12] as const };
    const w = 0.38, h = 0.56, len = 1.40, face = 0.40, cy = 0.46, gap = 0.128;
    for (const side of [-1, 1]) {
      const cx = side * 1.30;
      const at = [cx, cy, face - len / 2, 0, 0, 0] as const;
      // walls (inner, outer), roof and floor, back plate; front plate 35 mm inside the walls
      for (const x of [-(w / 2 - 0.015), w / 2 - 0.015]) {
        P.addEquipment('turret', KIT.xform(box(0.030, h, len), x, 0, 0), ...at);
      }
      for (const y of [-(h / 2 - 0.015), h / 2 - 0.015]) {
        P.addEquipment('turret', KIT.xform(box(w, 0.030, len), 0, y, 0), ...at);
      }
      P.addEquipment('turret', KIT.xform(box(w - 0.02, h - 0.02, 0.030), 0, 0, -len / 2 + 0.015), ...at);
      P.addEquipment('turret', KIT.xform(perforatedPlate(w - 0.04, h - 0.04, 0.02, [[0, -gap], [0, gap]],
        cell.bore + cell.wall + 0.004, P.q ? 24 : 12), 0, 0, len / 2 - 0.035), ...at);
      for (const y of [-gap, gap]) {
        const parts = launchCellParts(cell, P.q, 0, y, len / 2 - 0.035);
        P.addEquipment('turret', parts.rim, ...at);
        P.add('turretDark', parts.bore, ...at);
      }
      // two clamp straps round the pod and a cable conduit along its crown
      for (const z of [-0.36, 0.30]) P.addEquipment('turret', KIT.xform(box(w + 0.016, h + 0.016, 0.05), 0, 0, z), ...at);
      P.add('turretDark', KIT.xform(cylZ(0.016, len - 0.20, 8), side * -0.08, h / 2 + 0.014, -0.02), ...at);
      // trunnion arm and its bearing housing on the turret wall
      P.addEquipment('turret', box(0.24, 0.16, 0.30), side * (T_HALF + 0.11), cy, -0.42);
      P.addEquipment('turret', cylX(0.085, 0.10, P.q ? 16 : 8), side * (T_HALF + 0.19), cy, -0.42);
    }
  });
}

function addTurretSensors(P: LightTigerBuilderPort): void {
  // Gunner's primary sight (vehicle right, front): an armoured head with a shaded window and twin panes.
  const gx = -0.56, gz = 0.40, gy = T_ROOF;
  P.addEquipment('turret', box(0.30, 0.06, 0.34), gx, gy + 0.03, gz);
  P.addEquipment('turret', box(0.38, 0.28, 0.42), gx, gy + 0.20, gz);
  P.addEquipment('turret', box(0.40, 0.035, 0.46), gx, gy + 0.352, gz + 0.01);
  P.addModuleVisual('optics', 'turretDark', box(0.30, 0.15, 0.020), gx, gy + 0.21, gz + 0.212);
  P.addModuleVisual('optics', 'turretGlass', box(0.13, 0.10, 0.012), gx - 0.06, gy + 0.21, gz + 0.222);
  P.addModuleVisual('optics', 'turretGlass', box(0.08, 0.10, 0.012), gx + 0.08, gy + 0.21, gz + 0.222);
  // Commander's panoramic sight (vehicle left): a Type 10-style stacked head on a short stalk, ahead of the hatch.
  const cx = 0.32, cz = 0.66, cy = T_ROOF;
  P.addEquipment('turret', cylY(0.15, 0.17, 0.08, P.q ? 20 : 10), cx, cy + 0.04, cz);
  P.addEquipment('turret', cylY(0.09, 0.10, 0.24, P.q ? 16 : 8), cx, cy + 0.20, cz);
  P.addEquipment('turret', box(0.36, 0.20, 0.36), cx, cy + 0.42, cz);
  P.addEquipment('turret', orientedSlab(
    [cx - 0.16, cy + 0.52, cz - 0.16], [cx + 0.16, cy + 0.52, cz - 0.16], [cx + 0.16, cy + 0.52, cz + 0.16], [cx - 0.16, cy + 0.52, cz + 0.16],
    [cx - 0.12, cy + 0.66, cz - 0.12], [cx + 0.12, cy + 0.66, cz - 0.12], [cx + 0.12, cy + 0.66, cz + 0.06], [cx - 0.12, cy + 0.66, cz + 0.06],
  ));
  P.addModuleVisual('optics', 'turretDark', box(0.26, 0.10, 0.020), cx, cy + 0.585, cz + 0.155, -0.44, 0, 0);
  P.addModuleVisual('optics', 'turretGlass', box(0.20, 0.06, 0.012), cx, cy + 0.588, cz + 0.164, -0.44, 0, 0);
  // Laser warning receivers at the four roof corners.
  for (const [x, z] of [[-0.80, 0.70], [0.80, 0.70], [-0.72, -1.40], [0.72, -1.40]] as const) {
    P.addEquipment('turret', cylY(0.055, 0.065, 0.05, P.q ? 12 : 8), x, T_ROOF + 0.025, z);
    P.addModuleVisual('optics', 'turretDark', KIT.sph(0.050, P.q ? 12 : 8, Math.PI / 2), x, T_ROOF + 0.05, z);
  }
}

function addTurretWeaponsAndKit(P: LightTigerBuilderPort): void {
  // Commander's hatch (vehicle left, behind the panoramic sight) with the pintle M2 on its ring.
  const hx = 0.50, hz = -0.80;
  const hatch = hatchParts(0.29, !!P.q, -1);
  for (const g of hatch.lid) P.addHatch('turret', g, hx, T_ROOF - 0.005, hz);
  for (const g of hatch.dark) P.addEquipment('turretDark', g, hx, T_ROOF - 0.005, hz);
  const pintle = FITTINGS.pintleMG({
    mats: P.mats, cls: 'm2', tone: 'two-tone', working: true, ridingCradle: true, scale: 0.92,
    elev: 0.06, ammo: true, seed: 905,
  });
  pintle.name = 'raijuCommanderPintleM2';
  pintle.userData.hostVariant = 'raiju_ifv';
  mount(P, 'turret', pintle, hx + 0.30, T_ROOF, hz + 0.02, [0, 0, 0]);

  // Light remote weapon station (7.62 mm) on the rear roof, vehicle right.
  const rws = FITTINGS.openYokeRws({
    mats: P.mats,
    bodySlot: 'hull',
    sizeStandard: 'k2b-compact-tower',
    scale: 0.78,
    towerRise: 0.06,
    variant: 'korean-twin',
    ammoSide: 1,
    sensorSide: -1,
    elev: 0.055,
    caliberMm: 7.62,
    weaponName: 'Raiju light remote weapon station',
    seed: 900,
  });
  rws.name = 'type89LightTigerCompactRoofRws';
  rws.userData.hostVariant = 'raiju_ifv';
  mount(P, 'turret', rws, -0.44, T_ROOF, -0.98, [0, 0, 0]);
  P.turretG.userData.type89RoofRwsReceipt = Object.freeze({
    designFamily: rws.userData.designFamily,
    variant: rws.userData.stationVariant,
    mountLocal: Object.freeze([-0.44, T_ROOF, -0.98]),
    scale: rws.userData.scale,
    caliberMm: rws.userData.caliberMm,
    turretOwned: true,
  });

  // Four-tube smoke banks on the turret walls behind the cheek modules, aimed forward and outward.
  for (const side of [-1, 1]) {
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 4, r: 0.040, len: 0.24, spacing: 0.090,
      splay: side * 0.30, pitch: -0.42, arc: 0.30, seed: side < 0 ? 901 : 902,
    }), side * (T_HALF + 0.07), 0.24, 0.62, [0, side * 0.55, 0]);
  }
  // Antennas on the bustle corners and the rear stowage basket.
  for (const [x, h, seed] of [[-0.70, 0.95, 910], [0.70, 0.80, 911]] as const) {
    P.add('turretDark', cylY(0.040, 0.055, 0.08, 10), x, T_ROOF - 0.06 + 0.04, -1.50);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h, r: 0.010, seed }), x, T_ROOF - 0.02, -1.50);
  }
  // Bustle side bins behind the launcher pods (crew stowage welded to the bustle walls) and a closed gunner's hatch
  // and roof ventilator on the vehicle's right.
  for (const side of [-1, 1]) {
    const bx = side * (T_HALF + 0.135), bz = -1.22;
    P.addEquipment('turret', box(0.28, 0.36, 0.40), bx, 0.28, bz);
    P.addEquipment('turret', box(0.30, 0.04, 0.42), bx, 0.475, bz);
    for (const dz of [-0.11, 0.11]) P.add('turretDark', box(0.020, 0.06, 0.035), side * (T_HALF + 0.283), 0.40, bz + dz);
  }
  const gh = hatchParts(0.26, !!P.q, -1);
  for (const g of gh.lid) P.addHatch('turret', g, -0.46, T_ROOF - 0.005, -0.30);
  for (const g of gh.dark) P.addEquipment('turretDark', g, -0.46, T_ROOF - 0.005, -0.30);
  P.addEquipment('turret', cylY(0.10, 0.12, 0.07, P.q ? 16 : 8), 0.02, T_ROOF + 0.03, -0.88);
  P.addEquipment('turretDark', cylY(0.085, 0.085, 0.012, P.q ? 16 : 8), 0.02, T_ROOF + 0.068, -0.88);
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 1.50, d: 0.38, h: 0.24, fill: 0.55, rails: 3, seed: 920,
  }), 0, 0.14, -1.84);
}

function addTurret(P: LightTigerBuilderPort): void {
  addTurretShell(P);
  addTurretArmour(P);
  addMantletAndGun(P);
  addLauncherPods(P);
  addTurretSensors(P);
  addTurretWeaponsAndKit(P);
  P.decal('turret', 'roundel', null, 0.22, [-(T_HALF + 0.065), 0.30, 0.42], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, ROOF_Y);
}

function buildType89LightTiger(P: LightTigerBuilderPort): void {
  addHullShell(P);
  addGlacisArmour(P);
  addSideArmour(P);
  addBowFittings(P);
  addRoofAndStern(P);
  addRunningGear(P);
  addTurret(P);
  P.decal('hull', 'roundel', null, 0.30, [-(MODULE_OUT + 0.004), 0.98, -1.02], -Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '89-LT', 0.20,
    [MODULE_OUT + 0.004, 0.96, 1.42], Math.PI / 2);
  P.decal('hull', 'number', 'LT-10', 0.15, [-0.62, 1.335, NOSE_Z + 0.002], 0, 0);

  if (P.geometryReceipt) {
    P.hullG.userData.type89LightTigerReceipt = Object.freeze({
      independentFromLegacyType89: true,
      referenceUsage: 'measurement-and-silhouette-only',
      hullConstruction: 'measured-type89-wedge-bow-modular-r267',
      roadWheelsPerSide: 6,
      returnRollersPerSide: 3,
      sprocket: 'front-raised',
      canonicalTrackCourses: 1,
      nativeTrackPattern: 'japanese-modular',
      upperGlacisDeg: Math.round(GLACIS_RX * 180 / Math.PI * 10) / 10,
      glacisArmourModules: 3,
      sideArmourModulesPerSide: SIDE_MODULES.length,
      rearDoors: 2,
      firingPortsPerSide: 3,
    });
    P.turretG.userData.type89LightTigerTurretReceipt = Object.freeze({
      gun: 'KDE-35 Light Tiger',
      launcher: 'Type-01 Jyu-MAT Kai',
      launcherPods: 2,
      launcherTubes: 4,
      gunnerSight: true,
      panoramicCommanderSight: true,
      laserWarners: 4,
      smokeTubesPerSide: 4,
      roofMachineGuns: 2,
      cheekModules: 2,
      turretConstruction: 'steep-sided-slot-mantlet-modular-r267',
    });
  }
  applyAdvancedIfvScale(P, 'cot-type89-light-tiger-compact-r1');
}

export const TYPE89_LIGHT_TIGER_PROFILES = Object.freeze({
  raiju_ifv: Object.freeze({ build: buildType89LightTiger }),
}) satisfies VehicleProfileRecord;
