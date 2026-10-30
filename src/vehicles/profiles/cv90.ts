import { sectionSolid } from './sectionSolid.ts';
import { armorLoft } from './europeSourcePrimitives.ts';
import { weaponAssembly } from './weaponStock.ts';
// Two independent first-party procedural Swedish IFVs.
//
// The owner-provided archive and photographs are measurement, proportion, and
// silhouette references only. No external mesh, texture, material, node, or
// runtime asset is loaded. CV90 and CV90 Mk IV deliberately have separate hull,
// turret, running-gear, gun, armor, and equipment builders; neither is a scaled
// or configured derivative of the other.

import * as THREE from 'three';
import { KIT, FITTINGS, muzzleBore, muzzleTipDot, orientedSlab, convexSlab } from './kit.ts';
import {
  ADVANCED_IFV_SCALE,
  applyAdvancedIfvScale,
  type AdvancedIfvScalePort,
} from './advancedIfvScale.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { mountRotated as mount } from './fittingMount.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import { hatchParts, reserveDecorVolume } from './fieldChest.ts';

type Vec3 = [number, number, number];
type Owner = 'hull' | 'turret';

export interface CvBuilderPort extends AdvancedIfvScalePort {
  readonly snapGroup: TankBuilderPort['snapGroup'];
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
  addEquipment(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addExternalArmor(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addModuleVisual(module: string, slot: string, geometry: THREE.BufferGeometry,
    ...transform: number[]): void;
  decal(owner: Owner, kind: string, label: string | null, scale: number,
    position: Vec3, ...orientation: number[]): void;
}

function beamGeometry(from: Vec3, to: Vec3, thickness: number): THREE.BufferGeometry {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const geometry = new THREE.BoxGeometry(thickness, thickness, direction.length());
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1), direction.clone().normalize(),
  ));
  geometry.translate(
    (from[0] + to[0]) * 0.5,
    (from[1] + to[1]) * 0.5,
    (from[2] + to[2]) * 0.5,
  );
  return geometry;
}

function panelGeometry(corners: [Vec3, Vec3, Vec3, Vec3], thickness: number): THREE.BufferGeometry {
  const points = corners.map((corner) => new THREE.Vector3(...corner));
  const normal = points[1].clone().sub(points[0])
    .cross(points[3].clone().sub(points[0])).normalize().multiplyScalar(thickness * 0.5);
  const positions = points.flatMap((point) => [
    ...point.clone().add(normal).toArray(), ...point.clone().sub(normal).toArray(),
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1,
  ], 2));
  geometry.setIndex([
    0, 2, 4, 0, 4, 6, 1, 7, 5, 1, 5, 3,
    0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4,
    4, 5, 7, 4, 7, 6, 6, 7, 1, 6, 1, 0,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

// -------------------------------------------------------------------------
// Tier IX CV90 — independent low Swedish monocoque and compact crew turret.

function buildCv90Hull(P: CvBuilderPort): void {
  const { box, cylX, cylY } = KIT;
  // The belly and lower glacis are one closed longitudinal solid. The old
  // full-length box pierced the sloping bow and exposed a metre-tall end cap.
  // Only the short 120 mm nose return is vertical; the belly rises to it.
  const belly = sectionSolid([
    { z: -3.31, ring: [[-1.06,.24],[1.06,.24],[1.06,1.30],[-1.06,1.30]] },
    { z: 1.82, ring: [[-1.06,.24],[1.06,.24],[1.06,1.70],[-1.06,1.70]] },
    { z: 2.14, ring: [[-1.06,.24],[1.06,.24],[1.06,1.573],[-1.06,1.573]] },
    { z: 3.28, ring: [[-1.02,1.00],[1.02,1.00],[1.02,1.12],[-1.02,1.12]] },
  ]);
  belly.userData.cv90HullRole = 'continuous-raked-lower-glacis';
  P.add('hull', belly);
  // A dedicated planar upper-glacis wedge now carries the bow into the roof
  // break.  It replaces the old non-planar loft cap whose center fan folded
  // into a visible saddle/concavity.
  P.add('hull', orientedSlab(
    [-0.96, 1.00, 3.28], [0.96, 1.00, 3.28], [1.49, 1.66, 1.82], [-1.49, 1.66, 1.82],
    [-1.02, 1.12, 3.28], [1.02, 1.12, 3.28], [1.49, 1.79, 1.82], [-1.49, 1.79, 1.82],
  ));
  // Swedish low roof: long level troop deck, clipped stern and a short,
  // steep shoulder break. Independent longitudinal sections retain the roof
  // length instead of shrinking every horizontal contour toward its center.
  P.add('hull', armorLoft([
    [-3.45, 1.25, 1.34, 1.21, 1.24, 1.47, 1.67],
    [-3.10, 1.43, 1.52, 1.37, 1.24, 1.49, 1.74],
    [ 1.48, 1.43, 1.52, 1.37, 1.24, 1.49, 1.74],
    [ 1.83, 1.39, 1.49, 1.36, 1.24, 1.50, 1.79],
  ]));

  P.add('hullDark', box(1.92, 1.00, 0.045), 0, 1.09, -3.48);
  P.add('hull', box(1.72, 0.84, 0.050), 0, 1.09, -3.51);
  // lower stern wall: the belly ended at z -3.31 and the rear plates start at -3.4575 with their feet at 0.59, so the
  // 0.15 m between them stood open from below up to the troop deck (owner 2026-10-19, "the empty gaps in hulls")
  P.add('hull', box(2.12, 0.40, 0.20), 0, 0.44, -3.38);
  for (const x of [-0.64, 0, 0.64]) P.add('hullDark', cylX(0.050, 0.18, 12), x, 1.58, -3.54);
  // Rear corner boxes, marker lamps and deck stowage close the formerly empty
  // overhang without lengthening the suspension course.
  for (const side of [-1, 1]) {
    P.addEquipment('hull', box(0.31, 0.42, 0.28), side * 1.14, 1.39, -3.37);
    P.add('hullDark', box(0.20, 0.22, 0.020), side * 1.14, 1.38, -3.525);
    P.addModuleVisual('optics', 'hullGlass', box(0.11, 0.085, 0.012),
      side * 1.14, 1.45, -3.539);
    P.addEquipment('hull', box(0.44, 0.18, 0.48), side * 0.92, 1.72, -2.93);
  }
  P.addCupola('hull', cylY(0.30, 0.32, 0.055, 20), 0.62, 1.70, 1.34);
  P.add('hullDark', KIT.torus(0.295, 0.014, 20), 0.62, 1.735, 1.34);
  for (const x of [0.44, 0.62, 0.80]) KIT.periscope(P, 'hullDetail', x, 1.76, 1.63);
  P.add('hullDark', box(1.26, 0.022, 1.62), -0.72, 1.712, -0.08);
  for (let index = 0; index < 10; index++) {
    P.add('hullDetail', box(1.15, 0.018, 0.050), -0.72, 1.728, 0.65 - index * 0.15);
  }
  P.add('hullDark', box(0.38, 0.25, 0.50), 1.26, 1.39, -2.43);
  for (let index = 0; index < 5; index++) {
    P.add('hullDetail', box(0.020, 0.18, 0.40), 1.455, 1.39, -2.63 + index * 0.10);
  }
  for (const side of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({ nightKind: 'headlight',
      mats: P.mats, pods: 1, spacing: 0.13, r: 0.050,
      guard: true, rake: -0.30, seed: 900 + side,
    }), side * 1.06, 1.39, 2.72, [-0.30, 0, 0]);
    P.addEquipment('hull', box(0.28, 0.20, 0.26), side * 1.08, 1.43, 2.49, -0.22, 0, 0);
    P.addModuleVisual('optics', 'hullGlass', box(0.17, 0.080, 0.016),
      side * 1.08, 1.47, 2.63, -0.22, 0, 0);
    // 2026-10-19 (owner float sweep): the tow eyes hung 114 mm clear of the nose; each seats on it.
    P.snapGroup(`cv90-tow-eye-${side}`, () => P.add('hullDetail', KIT.torus(0.075, 0.018, 12), side * 0.78, 0.78, 3.30,
      Math.PI / 2, 0, 0), { reachM: 0.14 });
  }
  KIT.towCable(P, [[-1.17, 1.36, 2.50], [-0.58, 1.20, 2.99],
    [0.58, 1.20, 2.99], [1.17, 1.36, 2.50]]);
}

function buildCv90RunningGear(P: CvBuilderPort, danish = false): void {
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', dishR: 0.75, wheelR: 0.325, wheelW: 0.23,
    // Source section: the shoe inner face nearly kisses the 2.04 m belly.
    // Keeping the course here removes the old daylight slot while leaving
    // the suspension arms visibly inboard of the road-wheel discs.
    wheelY: 0.405, xc: 1.41,
    wheelZs: [2.47, 1.65, 0.83, 0.01, -0.81, -1.63, -2.45],
    sprocket: { z: 2.97, y: 0.80, r: 0.32 }, idler: { z: -2.93, y: 0.76, r: 0.29 },
    rollers: [{ z: 2.16, y: 1.00 }, { z: 1.02, y: 1.02 },
      { z: -0.12, y: 1.02 }, { z: -1.26, y: 1.01 }, { z: -2.24, y: 0.98 }],
    rollerR: 0.082, trackW: 0.50, trackTh: 0.088,
    trackPattern: 'compact-ifv', linkPitchM: 0.142, shoeWidthScale: 0.99,
    topY: 1.17, botY: 0.045, paintedEnds: true, arms: true, coveredTop: false,
    // Bring the rear departure knee onto the rear-road-wheel tangent instead
    // of letting the flat run continue behind the wheel before it rises.
    contactZF: 2.65, contactZR: -2.48,
  });
  for (const side of [-1, 1]) {
    // One closed shoulder cell replaces the two detached bow panels. Its
    // inner upper edge shares the upper-glacis/roof break and its aft edge
    // shares the skirt carrier nose, producing one continuous Swedish bow.
    P.addExternalArmor('hull', convexSlab(                                    // sealed check 2026-09-13: twisted rings → convex hull
      [side * 1.02, 1.25, 3.28], [side * 1.49, 1.78, 1.76],
      [side * 1.71, 1.42, 2.28], [side * 1.70, 1.25, 3.28],
      [side * 1.12, 1.27, 3.28], [side * 1.73, 1.81, 1.76],
      [side * 1.83, 1.42, 2.28], [side * 1.82, 1.25, 3.28],
    ));
    // The carrier and fender begin inside that shoulder cell. Eight doors
    // continue aft; the shoulder itself is the ninth protected station.
    // (release 265: the CV9035 DK's carrier, bridges and rear corner end flush with the rear plate; r8 critics, both: on
    // the CV9040's hull they stood 0.15 m past the stern as stacked fins)
    const trim = danish ? 0.14 : 0;
    P.addExternalArmor('hull', KIT.box(0.095, 0.92, 5.96 - trim), side * 1.74, 1.18, -0.74 + trim / 2);
    P.add('hull', KIT.box(0.25, 0.16, 5.98 - trim), side * 1.54, 1.66, -0.73 + trim / 2);
    // The inner bridge overlaps the hull shoulder and the armor carrier, so
    // plan and front views no longer reveal sky between body and skirt.
    P.add('hull', KIT.box(0.25, 0.22, 5.90 - trim), side * 1.39, 1.53, -0.69 + trim / 2);
    for (let index = 0; index < 8; index++) {
      const z = 1.87 - index * 0.78;
      // Let adjacent doors share a narrow structural seam. The old 60 mm
      // daylight slots were visible from above even though the carrier sat
      // behind them, so the skirt read as separate floating plates.
      P.addExternalArmor('hull', KIT.box(0.085, 0.70, 0.79),
        side * 1.81, 1.14, z, 0, 0, side * (index % 2 ? 0.010 : -0.010));
      P.add('hull', KIT.box(0.018, 0.60, 0.70), side * 1.861, 1.14, z);
      P.add('hullDetail', KIT.cylX(0.018, 0.11, 8), side * 1.875, 1.12, z);
    }
    // A tapered rear corner closes the carrier into the troop-ramp surround.
    P.addExternalArmor('hull', orientedSlab(
      [side * 1.32, 0.70, -3.68 + trim], [side * 1.48, 1.66, -3.68 + trim],
      [side * 1.50, 1.66, -3.39 + trim], [side * 1.34, 0.70, -3.54 + trim],
      [side * 1.82, 0.70, -3.68 + trim], [side * 1.82, 1.66, -3.68 + trim],
      [side * 1.82, 1.66, -3.39 + trim], [side * 1.82, 0.70, -3.54 + trim],
    ));
  }
}

function addCv90ScaffoldedCradle(P: CvBuilderPort): void {
  // A solid root casting joins the cradle to the turret face. Forward of it,
  // the barrel sits inside a restrained four-rail truss with three side-only
  // diagonal openings per side; there are no broad perforated top panels.
  // 227 gun-gaps (owner 2026-10-17, "the IX cv90 ... the part of its assembly that looks like its sticking out above
  // the turret and its not coming from the turret"): the casting never reached the shell. Its rear face stood 20 mm
  // ahead of the shell's front face (gun z 0.04 against 0.02), so a slot open to the sky separated them between the
  // cheeks, with the recoiling base showing through it; and its top rose from 0.18 at the truss to 0.24 at that rear
  // face, a box perched up to 8 cm above the cheeks' raked front edges. The casting now runs back 0.12 m into the
  // shell (rear face at gun z -0.10, inside the loft at rest, full elevation and full depression) with its top level
  // with the truss's top panel (0.18), so it leaves the turret face instead of standing in front of it.
  P.addGunExtra(orientedSlab(
    [-0.39, -0.24, -0.10], [0.39, -0.24, -0.10], [0.31, -0.18, 0.42], [-0.31, -0.18, 0.42],
    [-0.39, 0.18, -0.10], [0.39, 0.18, -0.10], [0.31, 0.18, 0.42], [-0.31, 0.18, 0.42],
  ));
  const point = (side: -1 | 1, t: number, vertical: number): Vec3 => [
    side * THREE.MathUtils.lerp(0.31, 0.18, t),
    vertical * THREE.MathUtils.lerp(0.18, 0.115, t),
    THREE.MathUtils.lerp(0.36, 1.40, t),
  ];
  P.addGunExtra(panelGeometry([
    point(-1, 0, 1), point(1, 0, 1), point(1, 1, 1), point(-1, 1, 1),
  ], 0.026));
  P.addGunExtra(panelGeometry([
    point(-1, 0, -1), point(-1, 1, -1), point(1, 1, -1), point(1, 0, -1),
  ], 0.026));
  for (const side of [-1, 1] as const) {
    for (const vertical of [-1, 1] as const) {
      P.addGunExtra(beamGeometry(point(side, 0, vertical), point(side, 1, vertical), 0.040));
    }
    for (const [rear, front] of [[0.08, 0.29], [0.38, 0.59], [0.68, 0.89]] as const) {
      P.addGunExtra(beamGeometry(point(side, rear, -0.82), point(side, front, 0.82), 0.032));
    }
    P.addGunExtra(beamGeometry(point(side, 0.02, -0.82), point(side, 0.02, 0.82), 0.034));
    P.addGunExtra(beamGeometry(point(side, 0.98, -0.82), point(side, 0.98, 0.82), 0.034));
  }
}

function buildCv90Turret(P: CvBuilderPort, danish = false): void {
  const { box, cylY, cylZ } = KIT;
  // Compact two-man CV9040 fighting compartment: upright crew walls,
  // a raked broad face and short squared bustle. It is not the Mk IV's
  // wide low shoulder shelf or a uniformly inset twelve-sided pyramid.
  P.add('turretDark', cylY(1.01, 1.08, 0.12, 24), 0, -0.05, -0.30);
  P.add('turret', armorLoft([
    [-1.64, .75, .89, .80, .04, .42, .65],
    [-1.34, 1.01, 1.10, 1.00, .00, .44, .72],
    [ .24, 1.03, 1.14, .97, .00, .44, .72],
    [ .94, .84, .98, .83, .00, .30, .68],
    [1.17, .70, .83, .72, .02, .22, .54],
  ]));
  // Cheeks flank an actual central gun throat; the trunnion mask closes it.
  for (const side of [-1, 1]) P.add('turret', convexSlab(
    [side*.33,.02,1.14], [side*.88,.02,1.09],
    [side*.76,.05,1.42], [side*.33,.05,1.42],
    [side*.33,.65,.89], [side*.86,.65,.89],
    [side*.72,.48,1.29], [side*.33,.48,1.29],
  ));
  for (const side of [-1, 1]) {
    // A separate aft armor belt protects the crew cell and bustle.
    P.addExternalArmor('turret', orientedSlab(
      [side * 1.08, 0.13, -0.22], [side * 1.11, 0.15, -1.30],
      [side * 0.90, 0.16, -1.55], [side * 0.86, 0.13, -0.34],
      [side * 0.91, 0.57, -0.22], [side * 0.96, 0.58, -1.20],
      [side * 0.79, 0.55, -1.43], [side * 0.76, 0.55, -0.32],
    ));
    // (the CV9035 DK's: six larger tubes, r4 critics on the Holstebro photograph: three tiny cups read as rivets)
    mount(P, 'turret', FITTINGS.smokeBank(danish
      ? { mats: P.mats, count: 6, r: 0.048, len: 0.30, spacing: 0.105, splay: side * 0.50, pitch: -0.39, seed: 920 + side }
      : { mats: P.mats, count: 4, r: 0.040, len: 0.25, spacing: 0.09, splay: side * 0.50, pitch: -0.39, seed: 920 + side },
    ), side * 1.03, 0.46, 0.05, [0, side * 0.94, 0]);
    P.addEquipment('turret', box(0.18, 0.13, 0.17), side * 0.86, 0.66, 0.28,
      0, side * 0.18, 0);
    // (the CV9035 DK's cheek boxes carry no window: its corner heads are the laser warners)
    if (!danish) P.addModuleVisual('optics', 'turretGlass', box(0.105, 0.070, 0.014),
      side * 0.86, 0.66, 0.375, 0, side * 0.18, 0);
  }
  P.addGunExtraDark(cylZ(0.135, 0.48, 20), 0, 0, 0.41);
  if (!danish) addCv90ScaffoldedCradle(P);
  else {
    // the CV9035 DK's solid armoured shroud from the root casting along the barrel (the Holstebro photograph), in place of
    // the CV9040's open truss
    P.addGunExtra(orientedSlab(
      [-0.39, -0.24, -0.10], [0.39, -0.24, -0.10], [0.31, -0.18, 0.42], [-0.31, -0.18, 0.42],
      [-0.39, 0.18, -0.10], [0.39, 0.18, -0.10], [0.31, 0.18, 0.42], [-0.31, 0.18, 0.42],
    ));
    // (r3, the Latvia side photograph: a compact wedge at the turret face, the barrel bare beyond it)
    P.addGunExtra(orientedSlab(
      [-0.31, -0.18, 0.40], [0.31, -0.18, 0.40], [0.13, -0.10, 0.74], [-0.13, -0.10, 0.74],
      [-0.31, 0.18, 0.40], [0.31, 0.18, 0.40], [0.13, 0.10, 0.74], [-0.13, 0.10, 0.74],
    ));
  }
  // (release 265: the Danish CV9035 DK's 35 mm Bushmaster III: a heavier barrel than the 40 mm's and its long slotted
  // muzzle brake, about twice the barrel's diameter; r4 (critics on the Latvia side photograph: the brake ends at the bow,
  // the barrel 29% of the hull's length): 0.40 m shorter)
  // r7 (critics, both, three rounds: the muzzle stood past the bow; in the Latvia photograph it stops about 0.3 m short):
  // 0.35 m shorter again
  // r8 (critics on the Latvia side photograph: the barrel 1.5x thick, the brake a squat dark drum; the photograph's is a
  // sleeve about 1.4x the barrel, four times as long as wide, in the vehicle's light finish): slimmer, longer, painted
  const gunLen = danish ? 2.45 : 3.12, gunR = danish ? 0.062 : 0.064;
  KIT.buildGun(P, { len: gunLen, r: gunR, sleeve: false, collar: true, baseR: 0.13 });
  if (danish) {
    // the brake in plain steel, stepped (r3: camouflage over slots read as hazard stripes)
    const seg = P.q ? 20 : 12, brakeL = 0.52, z0 = gunLen - brakeL;
    P.add('gun', cylZ(0.094, brakeL, seg), 0, 0, z0 + brakeL / 2);
    for (const [r, dz] of [[0.100, 0.05], [0.100, 0.22], [0.100, 0.39]] as const) P.add('gunDark', cylZ(r, 0.025, seg), 0, 0, z0 + dz);
    P.add('gun', cylZ(0.100, 0.04, seg), 0, 0, gunLen - 0.02);
    P.add('gunDark', cylZ(0.072, 0.02, seg), 0, 0, gunLen + 0.002);
    P.addGunExtraDark(cylZ(0.018, 0.30, 12), 0.22, -0.035, 1.47);
    muzzleTipDot(P, 0.22, -0.035, 1.62, 0.011, { parent: 'gunG' });
  } else {
    P.addGunExtraDark(cylZ(0.018, 2.08, 12), 0.22, -0.035, 1.72);
    muzzleTipDot(P, 0.22, -0.035, 2.77, 0.011, { parent: 'gunG' });
  }
  muzzleBore(P, { len: gunLen, r: danish ? 0.035 : gunR, seg: 18 });
  P.muzzleZ = gunLen;
  // Gunner sight, commander panorama and RWS are now seated on the new roof
  // stations instead of retaining coordinates from the superseded shell.
  // (the CV9035 DK's gunner's sight head stands taller: r5 critics on the Latvia photograph)
  // (r7 critics: the taller head made the turret read tall: halfway back)
  const gsY = danish ? 0.715 : 0.69;
  P.addEquipment('turret', box(0.34, danish ? 0.36 : 0.31, 0.34), 0.48, gsY, 0.51, 0, -0.08, 0);
  P.addModuleVisual('optics', 'turretDark', box(0.29, 0.22, 0.022),
    0.48, gsY + (danish ? 0.06 : 0), 0.70, 0, -0.08, 0);
  P.addModuleVisual('optics', 'turretGlass', box(0.21, 0.14, 0.014),
    0.48, gsY + (danish ? 0.06 : 0), 0.715, 0, -0.08, 0);
  const rws = FITTINGS.openYokeRws({
    mats: P.mats, bodySlot: 'hull', sizeStandard: 'k2b-compact-tower',
    scale: 0.80, towerRise: 0.09, variant: 'korean-twin', ammoSide: 1,
    sensorSide: -1, elev: 0.055, caliberMm: 12.7,
    weaponName: 'CV90 Ksp 88 RWS', seed: 934,
  });
  rws.name = 'cv90K2bStyleRws';
  rws.userData.hostVariant = 'cv90';
  if (!danish) mount(P, 'turret', rws, 0.50, 0.74, -0.91, [0, -0.04, 0]);
  else {
    // the CV9035 DK's defensive aids suite: laser warning heads on the turret's four corners, wired to the dischargers
    for (const [x, z] of [[-0.82, 0.70], [0.82, 0.70], [-0.80, -1.30], [0.80, -1.30]] as const) {
      P.add('turretDark', cylY(0.07, 0.08, 0.10, 12), x, 0.79, z);
      P.add('turretDark', KIT.sph(0.055, 10), x, 0.86, z);
    }
  }
  P.add('turret', cylY(0.20, 0.23, 0.10, 18), -0.47, 0.73, -0.50);
  // (r8 critics on the Holstebro photograph: the CV9035 DK's commander's sight head stands large, its lens big)
  const csW = danish ? 0.37 : 0.32, csH = danish ? 0.31 : 0.27, csD = danish ? 0.35 : 0.30, csY = 0.92 + (csH - 0.27) / 2;
  P.addEquipment('turret', box(csW, csH, csD), -0.47, csY, -0.50);
  P.addModuleVisual('optics', 'turretGlass', box(danish ? 0.26 : 0.20, danish ? 0.16 : 0.13, 0.016),
    -0.47, csY + 0.01, -0.50 + csD / 2 + 0.015);
  P.add('turretDark', box(csW - 0.05, 0.020, csD - 0.03), -0.47, csY + csH / 2 + 0.01, -0.50);
  if (danish) {
    // the commander's hatch behind his sight (r5 critics: the sight alone on its ring read as a weapon station's bump)
    P.addCupola('turret', cylY(0.30, 0.31, 0.05, 20), -0.42, 0.735, -1.06);
    P.add('turretDark', box(0.08, 0.04, 0.10), -0.42, 0.77, -1.38);
    // the gunner's hatch on the roof's left (r7 critics: the CV90 turret has two)
    P.addCupola('turret', cylY(0.27, 0.28, 0.05, 20), 0.42, 0.735, -1.00);
    P.add('turretDark', box(0.08, 0.04, 0.10), 0.42, 0.77, -1.29);
    // their lids, stepped up from the rings with a grab handle each (r8 critics: flush rings read as painted circles)
    for (const [x, z, r] of [[-0.42, -1.06, 0.26], [0.42, -1.00, 0.23]] as const) {
      P.add('turret', cylY(r - 0.02, r, 0.05, 20), x, 0.785, z);
      P.add('turretDark', box(0.18, 0.025, 0.025), x, 0.822, z + 0.08);
    }
  }
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 1.42, d: 0.38, h: 0.20, fill: 0.45, rails: 3, seed: 941,
  }), 0, 0.43, -1.58);
  P.addEquipment('turret', box(0.50, 0.27, 0.36), -0.43, 0.39, -1.58);
  P.addEquipment('turret', box(0.50, 0.27, 0.36), 0.43, 0.39, -1.58);
  P.add('turretDark', box(1.38, 0.11, 0.16), 0, 0.31, -1.76);
  // (the CV9035 DK's whips stand forward of its rear laser warning heads: r8 critics saw them touch)
  const whipZ = danish ? -1.02 : -1.20;
  for (const [x, height, seed] of [[-0.82, 0.88, 955], [0.83, 0.72, 956]] as const) {
    P.add('turretDark', cylY(0.040, 0.052, 0.08, 10), x, 0.70, whipZ);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: height, r: 0.010, seed }),
      x, 0.73, whipZ);
  }
  if (!danish) P.decal('turret', 'crossgrey', null, 0.22, [-1.135, 0.43, -0.72], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.70);
  if (P.geometryReceipt) {
    P.turretG.userData.cv90IndependentTurretReceipt = Object.freeze({
      sharedStructuralBuilder: false, identityFamily: 'cv90-native',
      foreignFamilyGeometryReused: false,
      turretConstruction: 'cv9040-upright-crew-raked-face-v7',
      gunAssembly: 'rooted-hollow-40mm-diagonal-truss-cradle-v3',
      remoteMachineGunTower: 'k2b-style-complete-open-yoke-rws', allAroundOptics: true,
      planarRoofCrown: true, monotonicArmorInset: true, concaveSurfaceCount: 0,
      integratedRearBustle: true, structuralChevronCoursesPerSide: 2,
      frontArmorShell: 'raked-cheeks-open-gun-throat', equipmentReseatedForShell: true,
    });
    P.gunG.userData.cv90GunAssemblyReceipt = Object.freeze({
      host: 'cv90', architecture: 'rooted-hollow-trapezoid-40mm-diagonal-truss-v3',
      movingWithGun: true, surroundsMainBarrel: true, openFrontRear: true,
      rootJoinedToTurretFace: true, sideOnlyOpenings: true,
      diagonalSidePortsPerSide: 3, mainGunCaliberMm: danish ? 35 : 40, barrelLengthM: gunLen,
    });
    if (!danish) P.turretG.userData.cv90RoofRwsReceipt = Object.freeze({
      host: 'cv90', designFamily: rws.userData.designFamily,
      variant: rws.userData.stationVariant, mountLocal: Object.freeze([0.50, 0.74, -0.91]),
      scale: rws.userData.scale, sizeStandard: rws.userData.sizeStandard,
      towerRiseM: rws.userData.towerRise, caliberMm: rws.userData.caliberMm,
      visibleFeedBelt: rws.userData.hasVisibleFeedBelt, turretOwned: true,
    });
  }
}

/** The CV9035 DK's bow and flanks (the Holstebro photograph; r3 critics): boxy mudguards hung under each shoulder's tip
 * in place of the bare blade, their bracket frames, two heavy shackles on the nose plate, and a cap over the sliver
 * between the skirt carrier and the inner bridge that showed sky from above. */
function addCv9035DkBowKit(P: CvBuilderPort): void {
  const { box, torus } = KIT;
  for (const side of [-1, 1] as const) {
    P.add('hull', box(0.60, 0.06, 0.42), side * 1.50, 1.24, 3.08);
    P.add('hull', box(0.60, 0.34, 0.04), side * 1.50, 1.04, 3.29);
    P.add('hull', box(0.04, 0.34, 0.40), side * 1.80, 1.04, 3.09);
    // (r8 critics: sky through the box's open inboard side at the glacis lip)
    P.add('hull', box(0.04, 0.34, 0.40), side * 1.20, 1.04, 3.09);
    // (r8 critics on the Holstebro photograph: the lamp guards' frames sand-coloured and heavier, the shackles large
    // and pale)
    for (const x of [1.28, 1.72]) P.add('hullCanvasPale', box(0.055, 0.32, 0.045), side * x, 1.05, 3.32);
    P.add('hullCanvasPale', box(0.50, 0.045, 0.045), side * 1.50, 0.91, 3.32);
    P.add('hullFittingPaint', torus(0.095, 0.030, 16, 8), side * 0.62, 0.88, 3.19, 0, 0, 0); // on the raked lower glacis
    P.add('hullDark', KIT.cylX(0.026, 0.26, 10), side * 0.62, 0.97, 3.19);
  }
  // the Danish Army's registration plate, black with white figures (the Holstebro photograph's "75.177"), on the glacis's
  // front lip left of centre (r4 critics: not on the mudguard)
  const slope = Math.atan2(1.79 - 1.12, 3.28 - 1.82), glacisY = (z: number): number => 1.79 - Math.tan(slope) * (z - 1.82);
  const nY = Math.cos(slope), nZ = Math.sin(slope);
  P.add('hullDark', box(0.40, 0.008, 0.11), 0.35, glacisY(3.15) + 0.004 * nY, 3.15 + 0.004 * nZ, slope, 0, 0);
  P.decal('hull', 'stencilWhite', '75.145', 0.34, [0.35, glacisY(3.15) + 0.010 * nY, 3.15 + 0.010 * nZ], 0, -(Math.PI / 2 - slope));
  // the engine's air louvres on the front right of the roof, in a frame on the upper glacis's plane (r4 critics on the
  // Holstebro photograph: the front deck read bare)
  const gx = -0.59, gz = 2.18;
  P.add('hullDark', box(0.62, 0.010, 0.60), gx, glacisY(gz) + 0.005 * nY, gz + 0.005 * nZ, slope, 0, 0);
  for (let k = 0; k < 9; k++) {
    const z = gz - 0.26 + k * 0.065;
    P.add('hullDetail', box(0.56, 0.012, 0.036), gx, glacisY(z) + 0.011 * nY, z + 0.011 * nZ, slope, 0, 0);
  }
  for (const dz of [-0.31, 0.31]) P.add('hull', box(0.66, 0.016, 0.03), gx, glacisY(gz + dz) + 0.008 * nY, gz + dz + 0.008 * nZ, slope, 0, 0);
  for (const dx of [-0.32, 0.32]) P.add('hull', box(0.03, 0.016, 0.62), gx + dx, glacisY(gz) + 0.008 * nY, gz + 0.008 * nZ, slope, 0, 0);
  // the roof's edge closed over the skirt carriers (r4 and r5 critics, both models: from above the ground showed through
  // a 3 cm slit from the stern to the bow bridge; rayed down at 1 cm on the built tank, whose CV90 geometry stands at 0.9
  // of these builder metres, world x 1.50-1.52 from z -3.04 to 1.60): a strip just under the carrier's top
  for (const side of [-1, 1] as const) P.add('hull', box(0.04, 0.02, 5.16), side * 1.678, 1.62, -0.80);
  // the skirts' foot lowered over the road wheels' upper quarter (r7 critics on the Holstebro photograph), ending ahead of
  // the idler (r8 critics: it hid the idler and stood past the stern)
  for (const side of [-1, 1] as const) P.add('hull', box(0.095, 0.13, 4.84), side * 1.74, 0.655, -0.18);
  // the add-on armour's V braces along each side's upper doors (r8 critics on the Holstebro photograph: the sides read
  // as plain panels)
  const vArm = Math.hypot(0.30, 0.36), vRake = Math.atan2(0.36, 0.30);
  for (const side of [-1, 1] as const) {
    for (let index = 0; index < 8; index++) {
      const z = 1.87 - index * 0.78;
      for (const dir of [-1, 1] as const) {
        P.add('hull', box(0.025, 0.04, vArm), side * 1.882, 1.27, z + dir * 0.15, dir * vRake, 0, 0);
      }
    }
  }
  // the troop door's outline and hinges on the rear plate (r7 critics: the plate read blank)
  const dw = 0.46, dh = 0.40, dz = -3.538;
  for (const sy of [-1, 1] as const) P.add('hullDark', box(dw * 2, 0.025, 0.012), 0, 1.09 + sy * dh, dz);
  for (const sx of [-1, 1] as const) P.add('hullDark', box(0.025, dh * 2, 0.012), sx * dw, 1.09, dz);
  for (const y of [0.83, 1.09, 1.35]) P.add('hullDark', box(0.05, 0.10, 0.03), -dw - 0.03, y, dz - 0.008);
  P.add('hullDark', box(0.12, 0.04, 0.03), dw - 0.14, 1.09, dz - 0.008);
}

/** The CV90 (release 265: `danish` builds the CV9035 DK, profiles/denmark.ts). */
export function buildCv90(P: CvBuilderPort, kit: { readonly danish?: boolean } = {}): void {
  buildCv90Hull(P);
  buildCv90RunningGear(P, kit.danish);
  buildCv90Turret(P, kit.danish);
  if (kit.danish) addCv9035DkBowKit(P);
  if (!kit.danish) P.decal('hull', 'roundel', null, 0.27, [-1.89, 1.35, -1.36], -Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '9040', 0.22,
    [1.89, 1.16, 0.78], Math.PI / 2);
  if (P.geometryReceipt) {
    P.hullG.userData.cv90IndependentHullReceipt = Object.freeze({
      id: 'cv90', firstPartyProceduralOnly: true, externalGeometryLoaded: false,
      sharedStructuralBuilder: false, designLineage: 'independent-tier9-cv9040-v2',
      hullConstruction: 'cv9040-long-roof-clipped-stern-v7', roadWheelsPerSide: 7,
      canonicalTrackCourses: 1, duplicateTrackMeshes: 0,
      suspensionPlacement: 'inboard-behind-road-wheel', sideArmorStationsPerSide: 9,
      planarRoofCell: true, upperGlacisConstruction: 'overlapped-planar-wedge',
      monotonicArmorInset: true, concaveSurfaceCount: 0,
      lowerHullFusion: 'continuous-raked-belly-to-nose-v2',
      bowShoulderJoin: 'single-cell-glacis-to-skirt-v1',
      rearSkirtClosure: 'tapered-armored-rear-corner-v1', lowerRubberStripRemoved: true,
      rearTrackDeparture: 'rear-wheel-tangent-wrap-v2', rearTrackDepartureZM: -2.45, // 2026-09-14: under the aft axle
      fenderBridge: 'continuous-glacis-shoulder-skirt-seat-v2', tracksExtendedForRearHull: false,
      rearHullExtensionM: 0.15, rearTroopRamp: true,
    });
  }
  applyAdvancedIfvScale(P, 'cot-cv90-compact-r1');
  // 2026-10-09 (owner): the field net and garnish (ghillieFleetSuits.ts), laid on the scaled, assembled build
  addVehicleGhillieSuit(P);
}

// -------------------------------------------------------------------------
// Tier X CV90 Mk IV — independently authored heavy hull and mission turret.

function buildCv90MkivHull(P: CvBuilderPort): void {
  const { box, cylY, cylZ } = KIT;
  // The heavier hull uses its own bow stations. Terminate the belly at
  // the glacis break instead of carrying a square full-height box through it.
  const belly = sectionSolid([
    { z: -3.51, ring: [[-1.12,.20],[1.12,.20],[1.12,1.30],[-1.12,1.30]] },
    { z: 1.77, ring: [[-1.12,.20],[1.12,.20],[1.12,1.83],[-1.12,1.83]] },
    { z: 2.24, ring: [[-1.12,.20],[1.12,.20],[1.12,1.658],[-1.12,1.658]] },
    { z: 3.49, ring: [[-1.09,1.07],[1.09,1.07],[1.09,1.20],[-1.09,1.20]] },
  ]);
  belly.userData.cv90HullRole = 'continuous-raked-lower-glacis';
  P.add('hull', belly);
  P.add('hull', orientedSlab(
    [-1.02, 1.07, 3.49], [1.02, 1.07, 3.49], [1.61, 1.78, 1.77], [-1.61, 1.78, 1.77],
    [-1.09, 1.20, 3.49], [1.09, 1.20, 3.49], [1.61, 1.93, 1.77], [-1.61, 1.93, 1.77],
  ));
  // Mk IV keeps the Swedish shallow prow, but a raised aft troop roof and
  // broad beveled shoulders distinguish its heavier protection package.
  P.add('hull', armorLoft([
    [-3.66, 1.28, 1.50, 1.33, 1.25, 1.57, 1.82],
    [-2.82, 1.54, 1.65, 1.50, 1.25, 1.59, 1.89],
    [-.46, 1.54, 1.65, 1.50, 1.25, 1.59, 1.89],
    [1.47, 1.54, 1.65, 1.46, 1.25, 1.58, 1.88],
    [1.78, 1.48, 1.61, 1.44, 1.25, 1.60, 1.93],
  ]));
  P.add('hullDark', box(2.12, 1.09, 0.050), 0, 1.14, -3.69);
  P.add('hull', box(1.92, 0.91, 0.055), 0, 1.14, -3.725);
  // stern floor: the belly ends at z -3.51 (its rear face carries the towing hooks) and the rear plates stand from
  // -3.665 with their feet at 0.595, so the slot between them stood open from below up to the troop roof (owner
  // 2026-10-19, "the empty gaps in hulls"); a floor at the plates' feet closes it over the hooks
  P.add('hull', box(2.24, 0.04, 0.21), 0, 0.58, -3.605);
  // critic panel 2026-10-15: the four bare cylinders over the door were the fuel drums' band mounts and read as spools
  // on a rail once the drums went; they go with them.
  for (const side of [-1, 1]) {
    P.addEquipment('hull', box(0.38, 0.46, 0.34), side * 1.30, 1.48, -3.50);
    // 2026-10-19 (owner float sweep): the lamp plate stood 63 mm behind its box (outboard of the rear plates); set on it.
    P.add('hullDark', box(0.23, 0.24, 0.022), side * 1.30, 1.46, -3.679);
    P.addModuleVisual('optics', 'hullGlass', box(0.13, 0.090, 0.012),
      side * 1.30, 1.54, -3.693);
    P.addEquipment('hull', box(0.52, 0.22, 0.56), side * 1.04, 1.86, -3.08);
  }
  // Owner markup 2026-10-14 ("actual tank equipment ... in lieu of random thingies", on this bare rear): the two
  // invented 3.7 m fuel drums and their rack posts hid the CV90's real rear, its large troop door. The door now shows
  // with its three hinge knuckles on the right edge, the handle and locking bar, and the vision block; the lower rear
  // plate carries the two towing hooks and the tow pintle.
  for (const y of [0.80, 1.14, 1.48]) {
    P.add('hullDark', cylY(0.034, 0.034, 0.13, 12), 0.93, y, -3.765);
    P.add('hullDark', box(0.10, 0.10, 0.012), 0.86, y, -3.757);
  }
  P.add('hullDark', box(0.20, 0.045, 0.045), -0.62, 1.14, -3.78);
  P.add('hullDark', box(0.04, 0.07, 0.05), -0.70, 1.14, -3.765);
  P.add('hullDark', box(0.90, 0.03, 0.02), -0.10, 0.70, -3.762);
  P.add('hullDark', box(0.20, 0.13, 0.020), 0, 1.42, -3.758);
  P.addModuleVisual('optics', 'hullGlass', box(0.14, 0.075, 0.012), 0, 1.42, -3.770);
  for (const x of [-0.62, 0.62]) {
    P.add('hullDark', box(0.13, 0.15, 0.030), x, 0.50, -3.525);
    P.add('hullDark', cylZ(0.036, 0.10, 12), x, 0.52, -3.585);
    P.add('hullDark', box(0.075, 0.032, 0.05), x, 0.475, -3.62);
  }
  P.add('hullDark', box(0.16, 0.12, 0.030), 0, 0.46, -3.525);
  P.add('hullDark', cylY(0.032, 0.032, 0.10, 12), 0, 0.46, -3.585);
  // critic panel 2026-10-15: the decor's rear-rack tray hung off the door once the drums were gone. The decor keeps out
  // of the band behind the door, its hinges and its handle (fieldChest.ts reserveDecorVolume; hull frame), so the door
  // stays clear and opens.
  reserveDecorVolume(P.hullG, [-0.80, 0.60, -4.05], [1.00, 1.70, -3.70]);
  for (const x of [-0.96, 0.96]) {
    P.addEquipment('hull', box(0.30, 0.28, 0.24), x, 1.91, -3.78);
    P.addModuleVisual('optics', 'hullGlass', box(0.15, 0.075, 0.014),
      x, 1.91, -3.91);
  }
  P.add('hullDark', box(2.08, 0.085, 0.10), 0, 0.82, -3.82);
  // the driver's hatch as a real closed hatch, not a bare disc (owner markup 2026-10-14 on the same class elsewhere)
  {
    const hatch = hatchParts(0.31, !!P.q, -1);
    for (const g of hatch.lid) P.addCupola('hull', g, 0.66, 1.81, 1.47);
    for (const g of hatch.dark) P.add('hullDark', g, 0.66, 1.81, 1.47);
  }
  for (const x of [0.45, 0.66, 0.87]) KIT.periscope(P, 'hullDetail', x, 1.91, 1.76);
  P.add('hullDark', box(1.44, 0.025, 1.78), -0.75, 1.842, -0.06);
  for (let index = 0; index < 12; index++) {
    P.add('hullDetail', box(1.32, 0.020, 0.052), -0.75, 1.859, 0.75 - index * 0.145);
  }
  for (const side of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({ nightKind: 'headlight',
      mats: P.mats, pods: 2, spacing: 0.14, r: 0.052,
      guard: true, rake: -0.34, seed: 904 + side,
    }), side * 1.15, 1.47, 2.91, [-0.33, 0, 0]);
    P.addEquipment('hull', box(0.34, 0.23, 0.31), side * 1.20, 1.50, 2.63, -0.24, 0, 0);
    P.addModuleVisual('optics', 'hullGlass', box(0.21, 0.10, 0.018),
      side * 1.20, 1.55, 2.79, -0.24, 0, 0);
    // 2026-10-19 (owner float sweep): the tow eyes hung 0.14 m ahead of/below the raked lower glacis; hung from it.
    P.add('hullDetail', KIT.torus(0.082, 0.020, 12), side * 0.86, 0.90, 3.40,
      Math.PI / 2, 0, 0);
  }
  KIT.towCable(P, [[-1.29, 1.43, 2.67], [-0.66, 1.27, 3.20],
    [0.66, 1.27, 3.20], [1.29, 1.43, 2.67]]);
}

function buildCv90MkivRunningGear(P: CvBuilderPort): void {
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', dishR: 0.78, wheelR: 0.335, wheelW: 0.25,
    wheelY: 0.405, xc: 1.50,
    wheelZs: [2.62, 1.77, 0.91, 0.05, -0.81, -1.67, -2.53],
    sprocket: { z: 3.12, y: 0.80, r: 0.34 }, idler: { z: -3.08, y: 0.76, r: 0.31 },
    rollers: [{ z: 2.16, y: 1.00 }, { z: 1.02, y: 1.02 },
      { z: -0.12, y: 1.02 }, { z: -1.26, y: 1.01 }, { z: -2.24, y: 0.98 }],
    rollerR: 0.084, trackW: 0.57, trackTh: 0.096,
    trackPattern: 'compact-ifv', linkPitchM: 0.148, shoeWidthScale: 0.99,
    topY: 1.22, botY: 0.045, paintedEnds: true, arms: true, coveredTop: false,
    contactZF: 2.78, contactZR: -2.56,
  });
  for (const side of [-1, 1]) {
    // A single deep shoulder replaces the detached upper and lower panels.
    // It shares vertices with the upper glacis, deck cell, fender and skirt.
    P.addExternalArmor('hull', convexSlab(                                    // sealed check 2026-09-13: twisted rings → convex hull
      [side * 1.07, 1.30, 3.49], [side * 1.61, 1.91, 1.72],
      [side * 1.85, 1.43, 2.44], [side * 1.82, 1.30, 3.49],
      [side * 1.16, 1.32, 3.49], [side * 1.88, 1.95, 1.72],
      [side * 2.02, 1.43, 2.44], [side * 1.99, 1.30, 3.49],
    ));
    P.addExternalArmor('hull', KIT.box(0.12, 1.11, 6.16), side * 1.86, 1.30, -0.72);
    P.addExternalArmor('hull', KIT.box(0.24, 0.20, 6.20), side * 1.65, 1.78, -0.70);
    P.add('hull', KIT.box(0.27, 0.24, 6.06), side * 1.49, 1.63, -0.64);
    for (let index = 0; index < 8; index++) {
      const z = 2.02 - index * 0.80;
      // Chamfered add-on modules, distinct from the base CV90's thin doors.
      P.addExternalArmor('hull', convexSlab(
        [side*1.86,.87,z-.405], [side*1.86,.87,z+.405],
        [side*2.06,.99,z+.405], [side*2.06,.99,z-.405],
        [side*1.86,1.73,z-.405], [side*1.86,1.73,z+.405],
        [side*2.06,1.60,z+.405], [side*2.06,1.60,z-.405],
      ));
      P.add('hull', KIT.box(.026,.59,.72), side*2.073,1.30,z);
      for (const y of [1.08, 1.52]) P.add('hullDetail', KIT.cylX(0.019, 0.20, 8), side * 2.09, y, z);
    }
    // (release 240: 3 cm lower, under the turret's side armour, 1.757 after the vehicle scale, which grazed it)
    P.add('hull', KIT.box(0.15, 0.18, 6.20), side * 1.89, 1.84, -0.70);
    for (const z of [1.25, -0.15, -1.55]) {
      P.addEquipment('hull', KIT.box(0.10, 0.24, 0.30), side * 2.09, 1.68, z);
      P.addModuleVisual('optics', 'hullGlass', KIT.box(0.014, 0.13, 0.18), side * 2.15, 1.68, z);
    }
    // Close the heavy skirt into the rear ramp surround instead of stopping
    // the armor wall in open space ahead of the hull back plate.
    P.addExternalArmor('hull', orientedSlab(
      [side * 1.46, 0.72, -3.76], [side * 1.62, 1.84, -3.76],
      [side * 1.65, 1.84, -3.43], [side * 1.48, 0.72, -3.59],
      [side * 2.06, 0.72, -3.76], [side * 2.06, 1.84, -3.76],
      [side * 2.06, 1.84, -3.43], [side * 2.06, 0.72, -3.59],
    ));
  }
  // Release 240 (the owner: "make sure all tank turrets are clear of hulls"): no rails and posts on the troop roof. They
  // stood 0.49 m over it from -0.47 to -2.67, all inside the sweep of the turret's bustle and its own rack (2.18 m off
  // the ring's axis), which skims that roof: buried 38 cm in the turret at rest, run through at every other bearing.
}

function addCv90MkivScaffoldedCradle(P: CvBuilderPort): void {
  // The back of the rocking housing penetrates the crew shell. Its actual
  // transverse trunnion engages both cheeks at the pitch axis; a long open
  // cradle carries the visible cannon forward of this compact armor mask.
  const root = sectionSolid([
    { z: -.34, ring: [[-.33,-.14],[.33,-.14],[.41,-.06],[.41,.08],[.33,.16],[-.33,.16],[-.41,.08],[-.41,-.06]] },
    { z: .27, ring: [[-.30,-.21],[.30,-.21],[.36,-.15],[.36,.15],[.30,.21],[-.30,.21],[-.36,.15],[-.36,-.15]] },
  ]);
  root.userData.cv90GunRole = 'buried-trunnion-mask';
  P.addGunExtra(root);
  P.addGunExtra(KIT.cylX(.18, .90, 24), 0, 0, 0);
  const point = (side: -1 | 1, t: number, vertical: number): Vec3 => [
    side * THREE.MathUtils.lerp(.36, .235, t),
    vertical * THREE.MathUtils.lerp(.21, .12, t),
    THREE.MathUtils.lerp(.24, 1.18, t),
  ];
  for (const vertical of [-1, 1]) {
    P.addGunExtra(panelGeometry([
      point(-1,0,vertical), point(1,0,vertical),
      point(1,1,vertical), point(-1,1,vertical),
    ], .028));
  }
  for (const side of [-1, 1] as const) {
    for (const vertical of [-1, 1])
      P.addGunExtra(beamGeometry(point(side,0,vertical),point(side,1,vertical),.046));
    for (const [rear, front] of [[.04,.30],[.36,.62],[.68,.94]])
      P.addGunExtra(beamGeometry(point(side,rear,-.90),point(side,front,.90),.036));
    for (const t of [.015,.985])
      P.addGunExtra(beamGeometry(point(side,t,-1),point(side,t,1),.040));
  }
  // 2026-10-11 (fleet-weapons lane, round 4; waves 345-386's critics: "a dark rectangular gap beside the barrel where no
  // coaxial muzzle shows"; the coordinator, keeping the owner's no-coax rule: close empty openings with armour): the
  // cradle's nose carries a closed armour face round the cannon (a 15 mm clearance ring on its 90 mm barrel), so the
  // front no longer opens beside the barrel; the side bays stay open between their diagonal members.
  {
    const [hx, hy, nz] = point(1, 1, 1);
    const hw = hx + .012, hh = hy + .012;
    const face = new THREE.Shape([new THREE.Vector2(-hw, -hh), new THREE.Vector2(hw, -hh),
      new THREE.Vector2(hw, hh), new THREE.Vector2(-hw, hh)]);
    face.holes.push(new THREE.Path().absarc(0, 0, .105, 0, Math.PI * 2, true));
    const plate = new THREE.ExtrudeGeometry(face, { depth: .022, bevelEnabled: false, curveSegments: 24 });
    plate.translate(0, 0, nz - .011);
    P.addGunExtra(plate.index ? plate.toNonIndexed() : plate);
  }
}

function buildCv90MkivTurret(P: CvBuilderPort): void {
  const { box, cylY, cylZ } = KIT;
  // The authored combat frame seats the complete cannon 18 cm farther into
  // the turret; the visual pivot must use that same frame without an offset.
  const gunTrunnionRecessM = 0.18 * ADVANCED_IFV_SCALE;
  // D-series-inspired protection: low broad shoulder modules carry a
  // narrower crew citadel and a long ammunition bustle. Width and roof height
  // change independently at the cheek, trunnion, crew and bustle stations.
  P.add('turretDark', cylY(1.24, 1.32, 0.13, 28), 0, -0.055, -0.34);
  P.add('turret', armorLoft([
    [-2.06, 1.00, 1.16, .96, .08, .32, .73],
    [-1.71, 1.29, 1.42, 1.10, .03, .33, .86],
    [-.35, 1.29, 1.46, 1.08, .00, .34, .86],
    [ .62, 1.21, 1.39, .99, .00, .34, .86],
    [1.05, .98, 1.20, .76, .03, .29, .67],
    [1.22, .70, .91, .60, .06, .22, .47],
  ]));
  for (const side of [-1, 1]) P.addExternalArmor('turret', convexSlab(
    [side*.40,.04,1.12], [side*1.22,.04,.58],
    [side*.99,.05,1.22], [side*.40,.05,1.67],
    [side*.40,.66,.99], [side*1.10,.73,.48],
    [side*.89,.54,1.03], [side*.40,.40,1.51],
  ));
  for (const side of [-1, 1]) {
    // Independent side modules bridge the shoulder shelf into the bustle.
    P.addExternalArmor('turret', orientedSlab(
      [side * 1.39, 0.14, -0.28], [side * 1.43, 0.16, -1.40],
      [side * 1.16, 0.17, -1.80], [side * 1.08, 0.14, -0.42],
      [side * 1.12, 0.65, -0.28], [side * 1.18, 0.66, -1.32],
      [side * 0.98, 0.62, -1.67], [side * 0.94, 0.62, -0.40],
    ));
    // A rolled mounting plinth follows the armor normal; the APS/LWR head and
    // smoke bank sit on the plinth instead of intersecting the side course.
    P.add('turret', box(0.24, 0.15, 0.27), side * 1.02, 0.62, 0.11,
      0, side * 0.20, side * -0.30);
    P.addEquipment('turret', box(0.22, 0.18, 0.20), side * 1.10, 0.68, 0.10,
      0, side * 0.20, side * -0.30);
    P.addModuleVisual('optics', 'turretGlass', box(0.14, 0.09, 0.014),
      side * 1.11, 0.69, 0.215, 0, side * 0.20, side * -0.30);
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 6, r: 0.041, len: 0.27, spacing: 0.09,
      splay: side * 0.54, pitch: -0.42, seed: 930 + side,
    }), side * 1.20, 0.58, -0.04, [0, side * 0.98, side * -0.27]);
  }
  addCv90MkivScaffoldedCradle(P);
  P.addGunExtraDark(cylZ(0.170, 0.62, 24), 0, 0, 0.28);
  KIT.buildGun(P, { len: 3.76, r: 0.082, sleeve: true,
    evac: 0.55, evacR: 1.60, collar: true, baseR: 0.16 });
  muzzleBore(P, { len: 3.76, r: 0.082, seg: 20 });
  P.muzzleZ = 3.76;
  // All mission equipment is re-indexed to the new roof and side courses.
  P.addEquipment('turret', box(0.41, 0.37, 0.42), 0.55, 0.78, 0.58, 0, -0.08, 0);
  P.addModuleVisual('optics', 'turretDark', box(0.33, 0.25, 0.024),
    0.55, 0.78, 0.815, 0, -0.08, 0);
  P.addModuleVisual('optics', 'turretGlass', box(0.27, 0.19, 0.015),
    0.55, 0.78, 0.832, 0, -0.08, 0);
  const rws = FITTINGS.openYokeRws({
    mats: P.mats, bodySlot: 'hull', sizeStandard: 'k2b-compact-tower',
    scale: 0.90, towerRise: 0.11, variant: 'korean-twin', ammoSide: 1,
    sensorSide: -1, elev: 0.055, caliberMm: 12.7,
    weaponName: 'CV90 Mk IV Ksp 88 RWS', seed: 944,
  });
  rws.name = 'cv90MkivK2bStyleRws';
  rws.userData.hostVariant = 'cv90_mk4_concept';
  mount(P, 'turret', rws, 0.68, 0.858, -1.19, [0, -0.04, 0]);                  // 2026-10-19 (owner float sweep): was 20 mm over the roof
  P.add('turret', cylY(0.22, 0.25, 0.11, 20), -0.58, 0.88, -0.50);
  P.addEquipment('turret', box(0.37, 0.34, 0.34), -0.58, 1.10, -0.50);
  P.addModuleVisual('optics', 'turretGlass', box(0.23, 0.16, 0.018), -0.58, 1.11, -0.31);
  P.add('turretDark', box(0.30, 0.022, 0.30), -0.58, 1.28, -0.50);
  // Flush twin-cell missile box: the forward shoulder overlaps the armor
  // course while the tubes remain visually distinct and turret-owned.
  weaponAssembly(P, () => {
    P.addEquipment('turret', box(0.28, 0.50, 0.68), -1.20, 0.52, -0.28, 0, 0, -0.08);
    P.add('turretDark', box(0.16, 0.17, 0.57), -0.99, 0.52, -0.28, 0, 0, -0.48);
    for (const y of [0.42, 0.70]) {
      P.add('turretDark', cylZ(0.105, 0.94, 18), -1.20, y, 0.20);
      P.add('turretDetail', KIT.torus(0.107, 0.012, 18), -1.20, y, 0.68, Math.PI / 2, 0, 0);
    }
  });
  for (const [x, z, yaw] of [
    [-1.13, 0.40, -0.18], [1.13, 0.40, 0.18],
    [-1.02, -1.38, -2.96], [1.02, -1.38, 2.96],
  ] as const) {
    P.addEquipment('turret', box(0.24, 0.20, 0.18), x, 0.73, z, 0, yaw, 0);
    P.addModuleVisual('optics', 'turretGlass', box(0.17, 0.11, 0.014),
      x, 0.73, z + (z > 0 ? 0.10 : -0.10), 0, yaw, 0);
  }
  for (const x of [-0.78, 0, 0.78]) {
    mount(P, 'turret', FITTINGS.lightCluster({
      mats: P.mats, pods: 1, r: 0.037, guard: true, rake: 0, seed: 970 + x,
    }), x, 0.72, 1.00);
  }
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 1.90, d: 0.43, h: 0.23, fill: 0.52, rails: 4, seed: 951,
  }), 0, 0.46, -2.02);
  for (const side of [-1, 1]) {
    P.addEquipment('turret', box(0.72, 0.31, 0.42), side * 0.57, 0.42, -2.00);
  }
  P.add('turretDark', box(1.84, 0.13, 0.18), 0, 0.32, -2.16);
  for (const [x, height, seed] of [[-0.92, 0.95, 975], [0.94, 0.80, 976]] as const) {
    P.add('turretDark', cylY(0.042, 0.054, 0.085, 10), x, 0.84, -1.55);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: height, r: 0.010, seed }),
      x, 0.87, -1.55);
  }
  P.decal('turret', 'crossgrey', null, 0.25, [-1.47, 0.46, -0.88], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 2.02);
  if (P.geometryReceipt) {
    P.turretG.userData.cv90MkivIndependentTurretReceipt = Object.freeze({
      sharedStructuralBuilder: false, identityFamily: 'cv90-native',
      foreignFamilyGeometryReused: false,
      turretConstruction: 'cv90-mkiv-shoulder-citadel-bustle-v7',
      gunAssembly: 'buried-mask-open-50mm-truss-cradle-v3',
      remoteMachineGunTower: 'k2b-style-complete-open-yoke-rws',
      spikeLauncherTubes: 2, launcherTubes: 2, apsRadarFaces: 4,
      planarRoofCrown: true, monotonicArmorInset: true, concaveSurfaceCount: 0,
      integratedRearBustle: true, structuralChevronCoursesPerSide: 2,
      frontArmorShell: 'split-shoulders-open-gun-throat',
      sideEquipmentSeat: 'rolled-plinth-on-armor-normal-v1',
      equipmentReseatedForShell: true,
    });
    P.gunG.userData.cv90GunAssemblyReceipt = Object.freeze({
      host: 'cv90_mk4_concept', architecture: 'buried-mask-open-50mm-diagonal-truss-v3',
      movingWithGun: true, surroundsMainBarrel: true, openFrontRear: false, closedNoseFace: true,
      rootJoinedToTurretFace: true, sideOnlyOpenings: true, rootRearZM: -.34,
      diagonalSidePortsPerSide: 3, mainGunCaliberMm: 50, barrelLengthM: 3.76,
      trunnionRecessM: gunTrunnionRecessM,
    });
    P.turretG.userData.cv90RoofRwsReceipt = Object.freeze({
      host: 'cv90_mk4_concept', designFamily: rws.userData.designFamily,
      variant: rws.userData.stationVariant, mountLocal: Object.freeze([0.68, 0.88, -1.19]),
      scale: rws.userData.scale, sizeStandard: rws.userData.sizeStandard,
      towerRiseM: rws.userData.towerRise, caliberMm: rws.userData.caliberMm,
      visibleFeedBelt: rws.userData.hasVisibleFeedBelt, turretOwned: true,
    });
  }
}

function buildCv90Mkiv(P: CvBuilderPort): void {
  buildCv90MkivHull(P);
  buildCv90MkivRunningGear(P);
  buildCv90MkivTurret(P);
  P.decal('hull', 'roundel', null, 0.30, [-2.11, 1.48, -1.48], -Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '904-IV', 0.23,
    [2.11, 1.28, 0.84], Math.PI / 2);
  if (P.geometryReceipt) {
    P.hullG.userData.cv90MkivIndependentHullReceipt = Object.freeze({
      id: 'cv90_mk4_concept', firstPartyProceduralOnly: true, externalGeometryLoaded: false,
      sharedStructuralBuilder: false, designLineage: 'independent-tier10-cv90-mkiv-v2',
      hullConstruction: 'cv90-mkiv-raised-troop-roof-v7', roadWheelsPerSide: 7,
      canonicalTrackCourses: 1, duplicateTrackMeshes: 0,
      suspensionPlacement: 'inboard-behind-road-wheel', sideArmorStationsPerSide: 9,
      sideArmorLayers: 3, planarRoofCell: true,
      upperGlacisConstruction: 'overlapped-planar-wedge', monotonicArmorInset: true,
      concaveSurfaceCount: 0, lowerHullFusion: 'continuous-raked-belly-to-nose-v2',
      bowShoulderJoin: 'single-cell-glacis-to-skirt-v1',
      rearSkirtClosure: 'tapered-armored-rear-corner-v1', lowerRubberStripRemoved: true,
      rearTrackDeparture: 'rear-wheel-tangent-wrap-v2', rearTrackDepartureZM: -2.53, // 2026-09-14: under the aft axle
      auxiliaryFuelDrums: 2,
      fenderBridge: 'continuous-glacis-shoulder-skirt-seat-v2',
      tracksExtendedForRearHull: false, rearHullExtensionM: 0.08, rearTroopRamp: true,
    });
  }
  applyAdvancedIfvScale(P, 'cot-cv90-mkiv-compact-r1');
}

export const CV90_PROFILES = Object.freeze({
  // (the factory passes the profile record second; the Swedish row takes the default kit)
  cv90: Object.freeze({ build: (P: CvBuilderPort) => buildCv90(P) }),
  cv90_mk4_concept: Object.freeze({ build: buildCv90Mkiv }),
}) satisfies VehicleProfileRecord;
