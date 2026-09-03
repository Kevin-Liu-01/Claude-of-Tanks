// Two independent first-party procedural Swedish IFVs.
//
// The owner-provided archive and photographs are measurement, proportion, and
// silhouette references only. No external mesh, texture, material, node, or
// runtime asset is loaded. CV90 and CV90 Mk IV deliberately have separate hull,
// turret, running-gear, gun, armor, and equipment builders; neither is a scaled
// or configured derivative of the other.

import * as THREE from 'three';
import { KIT, FITTINGS, muzzleBore, muzzleTipDot, orientedSlab } from './kit.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';

type Vec3 = [number, number, number];
type Owner = 'hull' | 'turret';

interface CvBuilderPort {
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly mats: Record<string, THREE.Material>;
  readonly geometryReceipt?: boolean;
  readonly spec: { readonly id: string; readonly visual: { readonly number?: string } };
  muzzleZ: number;
  topY?: number;
  gear?: unknown;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addCupola(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addEquipment(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addExternalArmor(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addModuleVisual(module: string, slot: string, geometry: THREE.BufferGeometry,
    ...transform: number[]): unknown;
  decal(owner: Owner, kind: string, label: string | null, scale: number,
    position: Vec3, ...orientation: number[]): unknown;
}

function mount(
  P: CvBuilderPort,
  owner: Owner,
  object: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  rotation: Vec3 = [0, 0, 0],
): void {
  object.position.set(x, y, z);
  object.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(object);
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
  const { box, cylX, cylY, polyMultiLoft } = KIT;
  // The belly now rises into the upper cell instead of ending below it. Its
  // sides stop just inboard of the shoe faces, closing the former transverse
  // daylight slot without intersecting the animated track course.
  P.add('hull', box(2.12, 1.06, 6.42), 0, 0.77, -0.10);
  P.add('hull', orientedSlab(
    [-0.96, 0.32, 2.18], [0.96, 0.32, 2.18],
    [0.82, 0.55, 3.28], [-0.82, 0.55, 3.28],
    [-1.05, 1.18, 2.32], [1.05, 1.18, 2.32],
    [0.96, 1.05, 3.28], [-0.96, 1.05, 3.28],
  ));
  // A dedicated planar upper-glacis wedge now carries the bow into the roof
  // break.  It replaces the old non-planar loft cap whose center fan folded
  // into a visible saddle/concavity.
  P.add('hull', orientedSlab(
    [-0.96, 1.00, 3.28], [0.96, 1.00, 3.28], [1.49, 1.66, 1.82], [-1.49, 1.66, 1.82],
    [-1.02, 1.12, 3.28], [1.02, 1.12, 3.28], [1.49, 1.79, 1.82], [-1.49, 1.79, 1.82],
  ));
  const upperPlan: [number, number][] = [
    [-1.49, 1.76], [1.49, 1.76], [1.52, 1.50], [1.52, -3.12],
    [1.34, -3.45], [-1.34, -3.45], [-1.52, -3.12], [-1.52, 1.56],
  ];
  P.add('hull', polyMultiLoft(upperPlan, [
    { height: 0.00, inset: 1.00 },
    { height: 0.22, inset: 0.96 },
    { height: 0.46, inset: 0.89 },
  ]), 0, 1.28, 0);

  P.add('hullDark', box(1.92, 1.00, 0.045), 0, 1.09, -3.48);
  P.add('hull', box(1.72, 0.84, 0.050), 0, 1.09, -3.51);
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
    mount(P, 'hull', FITTINGS.lightCluster({
      mats: P.mats, pods: 1, spacing: 0.13, r: 0.050,
      guard: true, rake: -0.30, seed: 900 + side,
    }), side * 1.06, 1.39, 2.72, [-0.30, 0, 0]);
    P.addEquipment('hull', box(0.28, 0.20, 0.26), side * 1.08, 1.43, 2.49, -0.22, 0, 0);
    P.addModuleVisual('optics', 'hullGlass', box(0.17, 0.080, 0.016),
      side * 1.08, 1.47, 2.63, -0.22, 0, 0);
    P.add('hullDetail', KIT.torus(0.075, 0.018, 12), side * 0.78, 0.78, 3.30,
      Math.PI / 2, 0, 0);
  }
  KIT.towCable(P, [[-1.17, 1.36, 2.50], [-0.58, 1.20, 2.99],
    [0.58, 1.20, 2.99], [1.17, 1.36, 2.50]]);
}

function buildCv90RunningGear(P: CvBuilderPort): void {
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
    P.addExternalArmor('hull', orientedSlab(
      [side * 1.02, 1.25, 3.28], [side * 1.49, 1.78, 1.76],
      [side * 1.71, 1.42, 2.28], [side * 1.70, 1.25, 3.28],
      [side * 1.12, 1.27, 3.28], [side * 1.73, 1.81, 1.76],
      [side * 1.83, 1.42, 2.28], [side * 1.82, 1.25, 3.28],
    ));
    // The carrier and fender begin inside that shoulder cell. Eight doors
    // continue aft; the shoulder itself is the ninth protected station.
    P.addExternalArmor('hull', KIT.box(0.095, 0.92, 5.96), side * 1.74, 1.18, -0.74);
    P.add('hull', KIT.box(0.25, 0.16, 5.98), side * 1.54, 1.66, -0.73);
    // The inner bridge overlaps the hull shoulder and the armor carrier, so
    // plan and front views no longer reveal sky between body and skirt.
    P.add('hull', KIT.box(0.25, 0.22, 5.90), side * 1.39, 1.53, -0.69);
    for (let index = 0; index < 8; index++) {
      const z = 1.87 - index * 0.78;
      // Let adjacent doors share a narrow structural seam. The old 60 mm
      // daylight slots were visible from above even though the carrier sat
      // behind them, so the skirt read as separate floating plates.
      P.addExternalArmor('hull', KIT.box(0.085, 0.70, 0.79),
        side * 1.81, 1.14, z, 0, 0, side * (index % 2 ? 0.010 : -0.010));
      P.add('hullDark', KIT.box(0.018, 0.60, 0.70), side * 1.861, 1.14, z);
      P.add('hullDetail', KIT.cylX(0.018, 0.11, 8), side * 1.875, 1.12, z);
    }
    // A tapered rear corner closes the carrier into the troop-ramp surround.
    P.addExternalArmor('hull', orientedSlab(
      [side * 1.32, 0.70, -3.68], [side * 1.48, 1.66, -3.68],
      [side * 1.50, 1.66, -3.39], [side * 1.34, 0.70, -3.54],
      [side * 1.82, 0.70, -3.68], [side * 1.82, 1.66, -3.68],
      [side * 1.82, 1.66, -3.39], [side * 1.82, 0.70, -3.54],
    ));
  }
}

function addCv90ScaffoldedCradle(P: CvBuilderPort): void {
  // A solid root casting joins the cradle to the turret face. Forward of it,
  // the barrel sits inside a restrained four-rail truss with three side-only
  // diagonal openings per side; there are no broad perforated top panels.
  P.addGunExtra(orientedSlab(
    [-0.39, -0.24, 0.04], [0.39, -0.24, 0.04], [0.31, -0.18, 0.42], [-0.31, -0.18, 0.42],
    [-0.39, 0.24, 0.04], [0.39, 0.24, 0.04], [0.31, 0.18, 0.42], [-0.31, 0.18, 0.42],
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

function buildCv90Turret(P: CvBuilderPort): void {
  const { box, cylY, cylZ, polyMultiLoft } = KIT;
  // Compact Swedish arrow-wedge. The narrow gun channel opens into two hard
  // cheek breaks, then a nearly parallel crew cell and clipped bustle. This
  // is a new CV9040 shell, not a scaled mission-module or donor-family mesh.
  const lowerPlan: [number, number][] = [
    [-0.27, 1.52], [0.27, 1.52], [0.80, 1.12], [1.14, 0.44],
    [1.10, -0.92], [0.90, -1.56], [0.64, -1.72], [-0.64, -1.72],
    [-0.90, -1.56], [-1.10, -0.92], [-1.14, 0.44], [-0.80, 1.12],
  ];
  P.add('turretDark', cylY(1.01, 1.08, 0.12, 24), 0, -0.05, -0.30);
  P.add('turret', polyMultiLoft(lowerPlan, [
    { height: 0.00, inset: 1.00 },
    { height: 0.25, inset: 0.96 },
    { height: 0.72, inset: 0.72 },
  ]));
  for (const side of [-1, 1]) {
    // The arrow nose, two cheek breaks and roof are now one continuous
    // monotonic shell. Only the aft side belt remains an applique layer.
    P.addExternalArmor('turret', orientedSlab(
      [side * 1.08, 0.13, -0.22], [side * 1.11, 0.15, -1.30],
      [side * 0.90, 0.16, -1.55], [side * 0.86, 0.13, -0.34],
      [side * 0.91, 0.57, -0.22], [side * 0.96, 0.58, -1.20],
      [side * 0.79, 0.55, -1.43], [side * 0.76, 0.55, -0.32],
    ));
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 4, r: 0.040, len: 0.25, spacing: 0.09,
      splay: side * 0.50, pitch: -0.39, seed: 920 + side,
    }), side * 1.03, 0.46, 0.05, [0, side * 0.94, 0]);
    P.addEquipment('turret', box(0.18, 0.13, 0.17), side * 0.86, 0.66, 0.28,
      0, side * 0.18, 0);
    P.addModuleVisual('optics', 'turretGlass', box(0.105, 0.070, 0.014),
      side * 0.86, 0.66, 0.375, 0, side * 0.18, 0);
  }
  P.addGunExtraDark(cylZ(0.135, 0.48, 20), 0, 0, 0.41);
  addCv90ScaffoldedCradle(P);
  KIT.buildGun(P, { len: 3.12, r: 0.064, sleeve: false, collar: true, baseR: 0.13 });
  P.addGunExtraDark(cylZ(0.018, 2.08, 12), 0.22, -0.035, 1.72);
  muzzleTipDot(P, 0.22, -0.035, 2.77, 0.011, { parent: 'gunG' });
  muzzleBore(P, { len: 3.12, r: 0.064, seg: 18 });
  P.muzzleZ = 3.12;
  // Gunner sight, commander panorama and RWS are now seated on the new roof
  // stations instead of retaining coordinates from the superseded shell.
  P.addEquipment('turret', box(0.34, 0.31, 0.34), 0.48, 0.69, 0.51, 0, -0.08, 0);
  P.addModuleVisual('optics', 'turretDark', box(0.29, 0.22, 0.022),
    0.48, 0.69, 0.70, 0, -0.08, 0);
  P.addModuleVisual('optics', 'turretGlass', box(0.21, 0.14, 0.014),
    0.48, 0.69, 0.715, 0, -0.08, 0);
  const rws = FITTINGS.openYokeRws({
    mats: P.mats, bodySlot: 'turret', sizeStandard: 'k2b-compact-tower',
    scale: 0.80, towerRise: 0.09, variant: 'korean-twin', ammoSide: 1,
    sensorSide: -1, elev: 0.055, caliberMm: 12.7,
    weaponName: 'CV90 Ksp 88 RWS', seed: 934,
  });
  rws.name = 'cv90K2bStyleRws';
  rws.userData.hostVariant = 'cv90';
  mount(P, 'turret', rws, 0.50, 0.74, -0.91, [0, -0.04, 0]);
  P.add('turret', cylY(0.20, 0.23, 0.10, 18), -0.47, 0.73, -0.50);
  P.addEquipment('turret', box(0.32, 0.27, 0.30), -0.47, 0.92, -0.50);
  P.addModuleVisual('optics', 'turretGlass', box(0.20, 0.13, 0.016),
    -0.47, 0.93, -0.335);
  P.add('turretDark', box(0.27, 0.020, 0.27), -0.47, 1.07, -0.50);
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 1.42, d: 0.38, h: 0.20, fill: 0.45, rails: 3, seed: 941,
  }), 0, 0.43, -1.58);
  P.addEquipment('turret', box(0.50, 0.27, 0.36), -0.43, 0.39, -1.58);
  P.addEquipment('turret', box(0.50, 0.27, 0.36), 0.43, 0.39, -1.58);
  P.add('turretDark', box(1.38, 0.11, 0.16), 0, 0.31, -1.76);
  for (const [x, height, seed] of [[-0.82, 0.88, 955], [0.83, 0.72, 956]] as const) {
    P.add('turretDark', cylY(0.040, 0.052, 0.08, 10), x, 0.70, -1.20);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: height, r: 0.010, seed }),
      x, 0.73, -1.20);
  }
  P.decal('turret', 'crossgrey', null, 0.22, [-1.135, 0.43, -0.72], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.70);
  if (P.geometryReceipt) {
    P.turretG.userData.cv90IndependentTurretReceipt = Object.freeze({
      sharedStructuralBuilder: false, identityFamily: 'cv90-native',
      foreignFamilyGeometryReused: false,
      turretConstruction: 'cv9040-integrated-arrow-wedge-crew-citadel-v6',
      gunAssembly: 'rooted-hollow-40mm-diagonal-truss-cradle-v3',
      remoteMachineGunTower: 'k2b-style-complete-open-yoke-rws', allAroundOptics: true,
      planarRoofCrown: true, monotonicArmorInset: true, concaveSurfaceCount: 0,
      integratedRearBustle: true, structuralChevronCoursesPerSide: 2,
      frontArmorShell: 'single-monotonic-arrow-shell', equipmentReseatedForShell: true,
    });
    P.gunG.userData.cv90GunAssemblyReceipt = Object.freeze({
      host: 'cv90', architecture: 'rooted-hollow-trapezoid-40mm-diagonal-truss-v3',
      movingWithGun: true, surroundsMainBarrel: true, openFrontRear: true,
      rootJoinedToTurretFace: true, sideOnlyOpenings: true,
      diagonalSidePortsPerSide: 3, mainGunCaliberMm: 40, barrelLengthM: 3.12,
    });
    P.turretG.userData.cv90RoofRwsReceipt = Object.freeze({
      host: 'cv90', designFamily: rws.userData.designFamily,
      variant: rws.userData.stationVariant, mountLocal: Object.freeze([0.50, 0.74, -0.91]),
      scale: rws.userData.scale, sizeStandard: rws.userData.sizeStandard,
      towerRiseM: rws.userData.towerRise, caliberMm: rws.userData.caliberMm,
      visibleFeedBelt: rws.userData.hasVisibleFeedBelt, turretOwned: true,
    });
  }
}

function buildCv90(P: CvBuilderPort): void {
  buildCv90Hull(P);
  buildCv90RunningGear(P);
  buildCv90Turret(P);
  P.decal('hull', 'roundel', null, 0.27, [-1.89, 1.35, -1.36], -Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '9040', 0.22,
    [1.89, 1.16, 0.78], Math.PI / 2);
  if (P.geometryReceipt) {
    P.hullG.userData.cv90IndependentHullReceipt = Object.freeze({
      id: 'cv90', firstPartyProceduralOnly: true, externalGeometryLoaded: false,
      sharedStructuralBuilder: false, designLineage: 'independent-tier9-cv9040-v2',
      hullConstruction: 'cv9040-fused-belly-glacis-monocoque-v5', roadWheelsPerSide: 7,
      canonicalTrackCourses: 1, duplicateTrackMeshes: 0,
      suspensionPlacement: 'inboard-behind-road-wheel', sideArmorStationsPerSide: 9,
      planarRoofCell: true, upperGlacisConstruction: 'overlapped-planar-wedge',
      monotonicArmorInset: true, concaveSurfaceCount: 0,
      lowerHullFusion: 'belly-to-upper-cell-overlap-v1',
      bowShoulderJoin: 'single-cell-glacis-to-skirt-v1',
      rearSkirtClosure: 'tapered-armored-rear-corner-v1', lowerRubberStripRemoved: true,
      rearTrackDeparture: 'rear-wheel-tangent-forward-v1', rearTrackDepartureZM: -2.48,
      fenderBridge: 'continuous-glacis-shoulder-skirt-seat-v2', tracksExtendedForRearHull: false,
      rearHullExtensionM: 0.15, rearTroopRamp: true,
    });
  }
}

// -------------------------------------------------------------------------
// Tier X CV90 Mk IV — independently authored heavy hull and mission turret.

function buildCv90MkivHull(P: CvBuilderPort): void {
  const { box, cylX, cylY, polyMultiLoft } = KIT;
  // Raise and widen the armored belly into the mission cell while retaining
  // a narrow mechanical clearance to the inner track faces.
  P.add('hull', box(2.24, 1.10, 6.78), 0, 0.75, -0.12);
  P.add('hull', orientedSlab(
    [-1.02, 0.31, 2.29], [1.02, 0.31, 2.29],
    [0.88, 0.59, 3.49], [-0.88, 0.59, 3.49],
    [-1.12, 1.26, 2.45], [1.12, 1.26, 2.45],
    [1.02, 1.12, 3.49], [-1.02, 1.12, 3.49],
  ));
  P.add('hull', orientedSlab(
    [-1.02, 1.07, 3.49], [1.02, 1.07, 3.49], [1.61, 1.78, 1.77], [-1.61, 1.78, 1.77],
    [-1.09, 1.20, 3.49], [1.09, 1.20, 3.49], [1.61, 1.93, 1.77], [-1.61, 1.93, 1.77],
  ));
  const armoredCellPlan: [number, number][] = [
    [-1.61, 1.72], [1.61, 1.72], [1.65, 1.46], [1.65, -2.76],
    [1.50, -3.55], [1.02, -3.66], [-1.02, -3.66], [-1.50, -3.55],
    [-1.65, -2.76], [-1.65, 1.50],
  ];
  P.add('hull', polyMultiLoft(armoredCellPlan, [
    { height: 0.00, inset: 1.00 },
    { height: 0.28, inset: 0.96 },
    { height: 0.58, inset: 0.89 },
  ]), 0, 1.30, 0);
  P.add('hullDark', box(2.12, 1.09, 0.050), 0, 1.14, -3.69);
  P.add('hull', box(1.92, 0.91, 0.055), 0, 1.14, -3.725);
  for (const x of [-0.74, -0.25, 0.25, 0.74]) P.add('hullDark', cylX(0.052, 0.16, 12), x, 1.66, -3.76);
  for (const side of [-1, 1]) {
    P.addEquipment('hull', box(0.38, 0.46, 0.34), side * 1.30, 1.48, -3.50);
    P.add('hullDark', box(0.23, 0.24, 0.022), side * 1.30, 1.46, -3.744);
    P.addModuleVisual('optics', 'hullGlass', box(0.13, 0.090, 0.012),
      side * 1.30, 1.54, -3.758);
    P.addEquipment('hull', box(0.52, 0.22, 0.56), side * 1.04, 1.86, -3.08);
  }
  // Twin full-width auxiliary-fuel drums are nested into a structural rear
  // rack, with visible retaining bands and service boxes rather than floating
  // beyond the ramp plate. Their end caps reach the rear shoulder silhouette
  // so both cylinders remain legible from side and three-quarter views.
  for (const y of [1.08, 1.72]) {
    P.addEquipment('hull', cylX(0.305, 3.72, 28), 0, y, -3.91);
    for (const x of [-1.38, -0.46, 0.46, 1.38]) {
      P.add('hullDark', cylX(0.322, 0.050, 28), x, y, -3.91);
    }
  }
  for (const x of [-0.96, 0.96]) {
    P.add('hullDark', box(0.075, 1.02, 0.085), x, 1.39, -3.87);
    P.addEquipment('hull', box(0.30, 0.28, 0.24), x, 1.91, -3.78);
    P.addModuleVisual('optics', 'hullGlass', box(0.15, 0.075, 0.014),
      x, 1.91, -3.91);
  }
  P.add('hullDark', box(2.08, 0.085, 0.10), 0, 0.82, -3.82);
  P.addCupola('hull', cylY(0.31, 0.34, 0.060, 20), 0.66, 1.84, 1.47);
  P.add('hullDark', KIT.torus(0.315, 0.015, 20), 0.66, 1.88, 1.47);
  for (const x of [0.45, 0.66, 0.87]) KIT.periscope(P, 'hullDetail', x, 1.91, 1.76);
  P.add('hullDark', box(1.44, 0.025, 1.78), -0.75, 1.842, -0.06);
  for (let index = 0; index < 12; index++) {
    P.add('hullDetail', box(1.32, 0.020, 0.052), -0.75, 1.859, 0.75 - index * 0.145);
  }
  for (const side of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({
      mats: P.mats, pods: 2, spacing: 0.14, r: 0.052,
      guard: true, rake: -0.34, seed: 904 + side,
    }), side * 1.15, 1.47, 2.91, [-0.33, 0, 0]);
    P.addEquipment('hull', box(0.34, 0.23, 0.31), side * 1.20, 1.50, 2.63, -0.24, 0, 0);
    P.addModuleVisual('optics', 'hullGlass', box(0.21, 0.10, 0.018),
      side * 1.20, 1.55, 2.79, -0.24, 0, 0);
    P.add('hullDetail', KIT.torus(0.082, 0.020, 12), side * 0.86, 0.81, 3.51,
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
    P.addExternalArmor('hull', orientedSlab(
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
      P.addExternalArmor('hull', KIT.box(0.18, 0.86, 0.81),
        side * 1.97, 1.30, z, 0, 0, side * (index % 2 ? 0.012 : -0.012));
      P.add('hullDark', KIT.box(0.026, 0.75, 0.72), side * 2.075, 1.30, z);
      for (const y of [1.08, 1.52]) P.add('hullDetail', KIT.cylX(0.019, 0.20, 8), side * 2.09, y, z);
    }
    P.add('hull', KIT.box(0.15, 0.18, 6.20), side * 1.89, 1.87, -0.70);
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
  for (const x of [-1.47, 1.47]) {
    for (const y of [1.97, 2.37]) P.add('hullDetail', KIT.box(0.035, 0.035, 2.26), x, y, -1.57);
    for (const z of [-2.67, -2.12, -1.57, -1.02, -0.47]) {
      P.add('hullDetail', KIT.box(0.035, 0.38, 0.035), x, 2.19, z);
    }
  }
}

function buildCv90MkivTurret(P: CvBuilderPort): void {
  const { box, cylY, cylZ, polyMultiLoft } = KIT;
  // Seat the complete moving cannon farther inside the mission module. Moving
  // the articulated rig preserves the authored shroud/barrel/bore relationship
  // and shifts the recoil and muzzle anchors with it.
  const gunTrunnionRecessM = 0.18;
  P.gunG.position.z -= gunTrunnionRecessM;
  // Mk IV uses its own broad low-profile mission module. A split arrow nose,
  // shoulder cells and long clipped bustle make the Tier X silhouette more
  // assertive without scaling the crew turret used by the Tier IX vehicle.
  const citadelPlan: [number, number][] = [
    [-0.28, 1.82], [0.28, 1.82], [0.90, 1.27], [1.46, 0.46],
    [1.42, -1.18], [1.16, -1.82], [0.72, -2.08], [-0.72, -2.08],
    [-1.16, -1.82], [-1.42, -1.18], [-1.46, 0.46], [-0.90, 1.27],
  ];
  P.add('turretDark', cylY(1.24, 1.32, 0.13, 28), 0, -0.055, -0.34);
  P.add('turret', polyMultiLoft(citadelPlan, [
    { height: 0.00, inset: 1.00 },
    { height: 0.30, inset: 0.94 },
    { height: 0.86, inset: 0.62 },
  ]));
  for (const side of [-1, 1]) {
    // The highly sloped arrow nose and roof are one shell. Removing the old
    // overlay cheeks eliminates the clipped/concave-looking front surfaces.
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
  P.addGunExtra(orientedSlab(
    [-0.44, -0.25, 0.05], [0.44, -0.25, 0.05],
    [0.26, -0.16, 1.62], [-0.26, -0.16, 1.62],
    [-0.44, 0.28, 0.05], [0.44, 0.28, 0.05],
    [0.24, 0.17, 1.62], [-0.24, 0.17, 1.62],
  ));
  P.addGunExtraDark(cylZ(0.170, 0.62, 24), 0, 0, 0.48);
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
    mats: P.mats, bodySlot: 'turret', sizeStandard: 'k2b-compact-tower',
    scale: 0.90, towerRise: 0.11, variant: 'korean-twin', ammoSide: 1,
    sensorSide: -1, elev: 0.055, caliberMm: 12.7,
    weaponName: 'CV90 Mk IV Ksp 88 RWS', seed: 944,
  });
  rws.name = 'cv90MkivK2bStyleRws';
  rws.userData.hostVariant = 'cv90_mkiv';
  mount(P, 'turret', rws, 0.68, 0.88, -1.19, [0, -0.04, 0]);
  P.add('turret', cylY(0.22, 0.25, 0.11, 20), -0.58, 0.88, -0.50);
  P.addEquipment('turret', box(0.37, 0.34, 0.34), -0.58, 1.10, -0.50);
  P.addModuleVisual('optics', 'turretGlass', box(0.23, 0.16, 0.018), -0.58, 1.11, -0.31);
  P.add('turretDark', box(0.30, 0.022, 0.30), -0.58, 1.28, -0.50);
  // Flush twin-cell missile box: the forward shoulder overlaps the armor
  // course while the tubes remain visually distinct and turret-owned.
  P.addEquipment('turret', box(0.28, 0.50, 0.68), -1.20, 0.52, -0.28, 0, 0, -0.08);
  P.add('turretDark', box(0.16, 0.17, 0.57), -0.99, 0.52, -0.28, 0, 0, -0.48);
  for (const y of [0.42, 0.70]) {
    P.add('turretDark', cylZ(0.105, 0.94, 18), -1.20, y, 0.20);
    P.add('turretDetail', KIT.torus(0.107, 0.012, 18), -1.20, y, 0.68, Math.PI / 2, 0, 0);
  }
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
      turretConstruction: 'cv90-mkiv-integrated-steep-arrow-mission-module-v6',
      gunAssembly: 'massive-faceted-50mm-trunnion-shroud-v1',
      remoteMachineGunTower: 'k2b-style-complete-open-yoke-rws',
      spikeLauncherTubes: 2, apsRadarFaces: 4,
      planarRoofCrown: true, monotonicArmorInset: true, concaveSurfaceCount: 0,
      integratedRearBustle: true, structuralChevronCoursesPerSide: 2,
      frontArmorShell: 'single-extreme-slope-arrow-shell',
      sideEquipmentSeat: 'rolled-plinth-on-armor-normal-v1',
      equipmentReseatedForShell: true,
    });
    P.gunG.userData.cv90GunAssemblyReceipt = Object.freeze({
      host: 'cv90_mkiv', architecture: 'faceted-closed-50mm-trunnion-shroud-v2',
      movingWithGun: true, surroundsMainBarrel: true, openFrontRear: false,
      diagonalSidePortsPerSide: 0, mainGunCaliberMm: 50, barrelLengthM: 3.76,
      trunnionRecessM: gunTrunnionRecessM,
    });
    P.turretG.userData.cv90RoofRwsReceipt = Object.freeze({
      host: 'cv90_mkiv', designFamily: rws.userData.designFamily,
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
      id: 'cv90_mkiv', firstPartyProceduralOnly: true, externalGeometryLoaded: false,
      sharedStructuralBuilder: false, designLineage: 'independent-tier10-cv90-mkiv-v2',
      hullConstruction: 'cv90-mkiv-fused-belly-glacis-side-cell-v5', roadWheelsPerSide: 7,
      canonicalTrackCourses: 1, duplicateTrackMeshes: 0,
      suspensionPlacement: 'inboard-behind-road-wheel', sideArmorStationsPerSide: 9,
      sideArmorLayers: 3, planarRoofCell: true,
      upperGlacisConstruction: 'overlapped-planar-wedge', monotonicArmorInset: true,
      concaveSurfaceCount: 0, lowerHullFusion: 'belly-to-upper-cell-overlap-v1',
      bowShoulderJoin: 'single-cell-glacis-to-skirt-v1',
      rearSkirtClosure: 'tapered-armored-rear-corner-v1', lowerRubberStripRemoved: true,
      rearTrackDeparture: 'rear-wheel-tangent-forward-v1', rearTrackDepartureZM: -2.56,
      auxiliaryFuelDrums: 2,
      fenderBridge: 'continuous-glacis-shoulder-skirt-seat-v2',
      tracksExtendedForRearHull: false, rearHullExtensionM: 0.08, rearTroopRamp: true,
    });
  }
}

export const CV90_PROFILES = Object.freeze({
  cv90: Object.freeze({ build: buildCv90 }),
  cv90_mkiv: Object.freeze({ build: buildCv90Mkiv }),
}) satisfies VehicleProfileRecord;
