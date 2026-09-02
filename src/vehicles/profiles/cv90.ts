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
  // Keep the belly within 20 mm of the inner shoe faces.  The previous
  // 2.04 m tub left a bright slot above both tracks and made the side armor
  // read as a detached wall.
  P.add('hull', box(2.12, 0.66, 6.42), 0, 0.61, -0.10);
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
    [-1.49, 1.90], [1.49, 1.90], [1.52, 1.56], [1.52, -3.12],
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
    contactZF: 2.65, contactZR: -2.61,
  });
  for (const side of [-1, 1]) {
    // CV9040 has a shallow structural fender rather than a separate applique
    // wall. The hem clears the 1.54 m shoe edge by only 35 mm, its upper rail
    // keys into the monocoque shoulder, and the nose folds into the glacis.
    P.addExternalArmor('hull', orientedSlab(
      [side * 1.73, 0.72, 2.34], [side * 1.825, 0.72, 2.34],
      [side * 1.745, 0.72, 3.28], [side * 1.695, 0.72, 3.28],
      [side * 1.73, 1.39, 2.34], [side * 1.825, 1.39, 2.34],
      [side * 1.735, 1.39, 2.66], [side * 1.72, 1.39, 2.66],
    ));
    P.addExternalArmor('hull', orientedSlab(
      [side * 1.73, 1.39, 2.34], [side * 1.825, 1.39, 2.34],
      [side * 1.735, 1.39, 2.66], [side * 1.72, 1.39, 2.66],
      [side * 1.48, 1.82, 1.82], [side * 1.825, 1.82, 1.82],
      [side * 1.715, 1.76, 2.66], [side * 1.18, 1.76, 2.66],
    ));
    // Continuous inboard carrier, top fender and low rubber lip close the
    // section before the individual armor doors are applied.
    P.addExternalArmor('hull', KIT.box(0.095, 0.92, 6.02), side * 1.74, 1.18, -0.68);
    P.add('hull', KIT.box(0.25, 0.16, 6.08), side * 1.54, 1.66, -0.65);
    // The inner bridge overlaps the hull shoulder and the armor carrier, so
    // plan and front views no longer reveal sky between body and skirt.
    P.add('hull', KIT.box(0.25, 0.22, 5.92), side * 1.39, 1.53, -0.55);
    for (let index = 0; index < 9; index++) {
      const z = 2.34 - index * 0.72;
      // Let adjacent doors share a narrow structural seam. The old 60 mm
      // daylight slots were visible from above even though the carrier sat
      // behind them, so the skirt read as separate floating plates.
      P.addExternalArmor('hull', KIT.box(0.085, 0.70, 0.73),
        side * 1.81, 1.14, z, 0, 0, side * (index % 2 ? 0.010 : -0.010));
      P.add('hullDark', KIT.box(0.018, 0.60, 0.65), side * 1.861, 1.14, z);
      P.add('hullDetail', KIT.cylX(0.018, 0.11, 8), side * 1.875, 1.12, z);
    }
    P.add('hullRubber', KIT.box(0.030, 0.17, 6.00), side * 1.88, 0.60, -0.68);
  }
}

function addCv90ScaffoldedCradle(P: CvBuilderPort): void {
  const point = (side: -1 | 1, t: number, vertical: number): Vec3 => [
    side * THREE.MathUtils.lerp(0.37, 0.20, t),
    vertical * THREE.MathUtils.lerp(0.23, 0.13, t),
    THREE.MathUtils.lerp(0.10, 1.42, t),
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
    for (const center of [0.26, 0.52, 0.78]) {
      P.addGunExtra(panelGeometry([
        point(side, center - 0.035, -0.40), point(side, center + 0.035, -0.40),
        point(side, center + 0.105, 0.40), point(side, center + 0.035, 0.40),
      ], 0.027));
    }
    P.addGunExtra(beamGeometry(point(side, 0.03, -0.40), point(side, 0.03, 0.40), 0.035));
    P.addGunExtra(beamGeometry(point(side, 0.97, -0.40), point(side, 0.97, 0.40), 0.035));
  }
}

function buildCv90Turret(P: CvBuilderPort): void {
  const { box, cylY, cylZ, polyMultiLoft } = KIT;
  // Conventional CV9040 crew turret: narrow cannon mask, long planar cheeks,
  // parallel side walls and a separate bustle. This is intentionally unlike
  // the Mk IV's wide unmanned mission module.
  const plan: [number, number][] = [
    [-0.24, 1.34], [0.24, 1.34], [0.72, 1.06], [1.02, 0.48],
    [1.00, -1.22], [0.78, -1.68], [-0.78, -1.68], [-1.00, -1.22],
    [-1.02, 0.48], [-0.72, 1.06],
  ];
  P.add('turretDark', polyMultiLoft(plan, [
    { height: 0.00, inset: 1.00 },
    { height: 0.34, inset: 0.97 },
    { height: 0.70, inset: 0.84 },
  ]), 0, -0.04, 0);
  P.add('turret', polyMultiLoft(plan, [
    { height: 0.00, inset: 1.00 },
    { height: 0.36, inset: 0.96 },
    { height: 0.72, inset: 0.82 },
  ]));
  for (const side of [-1, 1]) {
    // The upper nose retreats behind the lower trunnion line, producing the
    // pronounced reclined CV90 front instead of a near-vertical turret face.
    P.addExternalArmor('turret', orientedSlab(
      [side * 0.29, 0.05, 1.15], [side * 1.10, 0.07, 0.51],
      [side * 1.08, 0.08, -0.34], [side * 0.60, 0.06, -0.39],
      [side * 0.24, 0.72, 0.90], [side * 0.74, 0.69, 0.22],
      [side * 0.91, 0.65, -0.34], [side * 0.54, 0.66, -0.39],
    ));
    // Three shallow, reclined cheek laminates make the side transition read
    // as overlapping armor facets rather than one flat wall. They remain
    // inside the primary silhouette and are fully seated into the citadel.
    for (const z of [0.28, -0.28, -0.84]) {
      P.add('turret', orientedSlab(
        [side * 0.84, 0.20, z + 0.20], [side * 1.02, 0.23, z + 0.16],
        [side * 1.00, 0.23, z - 0.18], [side * 0.82, 0.20, z - 0.22],
        [side * 0.77, 0.50, z + 0.18], [side * 0.94, 0.53, z + 0.14],
        [side * 0.92, 0.51, z - 0.16], [side * 0.75, 0.48, z - 0.20],
      ));
    }
    P.add('turret', orientedSlab(
      [side * 0.26, 0.50, 0.78], [side * 0.56, 0.53, 0.69],
      [side * 0.53, 0.51, 0.35], [side * 0.24, 0.48, 0.42],
      [side * 0.23, 0.65, 0.72], [side * 0.49, 0.68, 0.64],
      [side * 0.47, 0.65, 0.39], [side * 0.21, 0.62, 0.45],
    ));
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 4, r: 0.040, len: 0.25, spacing: 0.09,
      splay: side * 0.50, pitch: -0.39, seed: 920 + side,
    }), side * 1.09, 0.47, 0.02, [0, side * 0.96, 0]);
  }
  P.addGunExtraDark(cylZ(0.135, 0.44, 20), 0, 0, 0.39);
  addCv90ScaffoldedCradle(P);
  KIT.buildGun(P, { len: 3.12, r: 0.064, sleeve: false, collar: true, baseR: 0.13 });
  P.addGunExtraDark(cylZ(0.018, 2.08, 12), 0.22, -0.035, 1.72);
  muzzleTipDot(P, 0.22, -0.035, 2.77, 0.011, { parent: 'gunG' });
  muzzleBore(P, { len: 3.12, r: 0.064, seg: 18 });
  P.muzzleZ = 3.12;
  P.addEquipment('turret', box(0.36, 0.34, 0.36), 0.47, 0.51, 0.64, 0, -0.08, 0);
  P.addModuleVisual('optics', 'turretDark', box(0.29, 0.22, 0.022),
    0.47, 0.51, 0.84, 0, -0.08, 0);
  P.addModuleVisual('optics', 'turretGlass', box(0.21, 0.14, 0.014),
    0.47, 0.51, 0.855, 0, -0.08, 0);
  const rws = FITTINGS.openYokeRws({
    mats: P.mats, bodySlot: 'turret', sizeStandard: 'k2b-compact-tower',
    scale: 0.86, towerRise: 0.11, variant: 'korean-twin', ammoSide: 1,
    sensorSide: -1, elev: 0.055, caliberMm: 12.7,
    weaponName: 'CV90 Ksp 88 RWS', seed: 934,
  });
  rws.name = 'cv90K2bStyleRws';
  rws.userData.hostVariant = 'cv90';
  mount(P, 'turret', rws, 0.55, 0.80, -0.82, [0, -0.04, 0]);
  P.add('turret', cylY(0.20, 0.23, 0.11, 18), -0.48, 0.88, -0.48);
  P.addEquipment('turret', box(0.34, 0.29, 0.32), -0.48, 1.07, -0.48);
  P.addModuleVisual('optics', 'turretGlass', box(0.20, 0.13, 0.016),
    -0.48, 1.08, -0.31);
  P.add('turretDark', box(0.28, 0.020, 0.28), -0.48, 1.23, -0.48);
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 1.35, d: 0.40, h: 0.22, fill: 0.45, rails: 3, seed: 941,
  }), 0, 0.48, -1.46);
  P.addEquipment('turret', box(0.52, 0.30, 0.42), -0.46, 0.42, -1.55);
  P.addEquipment('turret', box(0.52, 0.30, 0.42), 0.46, 0.42, -1.55);
  P.add('turretDark', box(1.34, 0.12, 0.18), 0, 0.33, -1.72);
  for (const [x, height, seed] of [[-0.82, 0.88, 955], [0.83, 0.72, 956]] as const) {
    P.add('turretDark', cylY(0.040, 0.052, 0.08, 10), x, 0.88, -1.24);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: height, r: 0.010, seed }),
      x, 0.90, -1.24);
  }
  P.decal('turret', 'crossgrey', null, 0.23, [-1.125, 0.48, -0.76], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.82);
  if (P.geometryReceipt) {
    P.turretG.userData.cv90IndependentTurretReceipt = Object.freeze({
      sharedStructuralBuilder: false, turretConstruction: 'cv9040-planar-faceted-crew-citadel-v4',
      gunAssembly: 'hollow-scaffolded-40mm-slash-port-cradle',
      remoteMachineGunTower: 'k2b-style-complete-open-yoke-rws', allAroundOptics: true,
      planarRoofCrown: true, monotonicArmorInset: true, concaveSurfaceCount: 0,
      integratedRearBustle: true,
    });
    P.gunG.userData.cv90GunAssemblyReceipt = Object.freeze({
      host: 'cv90', architecture: 'hollow-trapezoid-40mm-slash-port-cradle-v2',
      movingWithGun: true, surroundsMainBarrel: true, openFrontRear: true,
      diagonalSidePortsPerSide: 3, mainGunCaliberMm: 40, barrelLengthM: 3.12,
    });
    P.turretG.userData.cv90RoofRwsReceipt = Object.freeze({
      host: 'cv90', designFamily: rws.userData.designFamily,
      variant: rws.userData.stationVariant, mountLocal: Object.freeze([0.55, 0.80, -0.82]),
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
      hullConstruction: 'cv9040-planar-roof-glacis-monocoque-v4', roadWheelsPerSide: 7,
      canonicalTrackCourses: 1, duplicateTrackMeshes: 0,
      suspensionPlacement: 'inboard-behind-road-wheel', sideArmorStationsPerSide: 9,
      planarRoofCell: true, upperGlacisConstruction: 'separate-planar-wedge',
      monotonicArmorInset: true, concaveSurfaceCount: 0,
      fenderBridge: 'continuous-hull-skirt-seat', tracksExtendedForRearHull: false,
      rearHullExtensionM: 0.15, rearTroopRamp: true,
    });
  }
}

// -------------------------------------------------------------------------
// Tier X CV90 Mk IV — independently authored heavy hull and mission turret.

function buildCv90MkivHull(P: CvBuilderPort): void {
  const { box, cylX, cylY, polyMultiLoft } = KIT;
  P.add('hull', box(2.24, 0.72, 6.78), 0, 0.63, -0.12);
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
    [-1.61, 1.86], [1.61, 1.86], [1.65, 1.50], [1.65, -2.76],
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
    contactZF: 2.78, contactZR: -2.72,
  });
  for (const side of [-1, 1]) {
    // Mk IV's armored side wall is nearly full height. The 1.67 m shoe edge,
    // 1.70 m inner hem, 1.78 m carrier and deck bevel form one closed section.
    P.addExternalArmor('hull', orientedSlab(
      [side * 1.85, 0.74, 2.48], [side * 2.01, 0.74, 2.48],
      [side * 1.90, 0.74, 3.49], [side * 1.83, 0.74, 3.49],
      [side * 1.85, 1.42, 2.48], [side * 2.01, 1.42, 2.48],
      [side * 1.88, 1.42, 2.87], [side * 1.82, 1.42, 2.87],
    ));
    P.addExternalArmor('hull', orientedSlab(
      [side * 1.85, 1.42, 2.48], [side * 2.01, 1.42, 2.48],
      [side * 1.88, 1.42, 2.87], [side * 1.82, 1.42, 2.87],
      [side * 1.60, 1.96, 1.91], [side * 2.01, 1.96, 1.91],
      [side * 1.88, 1.89, 2.87], [side * 1.28, 1.89, 2.87],
    ));
    P.addExternalArmor('hull', KIT.box(0.12, 1.11, 6.20), side * 1.86, 1.30, -0.70);
    P.addExternalArmor('hull', KIT.box(0.24, 0.20, 6.26), side * 1.65, 1.78, -0.68);
    P.add('hull', KIT.box(0.27, 0.24, 6.08), side * 1.49, 1.63, -0.60);
    for (let index = 0; index < 9; index++) {
      const z = 2.50 - index * 0.70;
      P.addExternalArmor('hull', KIT.box(0.18, 0.86, 0.72),
        side * 1.97, 1.30, z, 0, 0, side * (index % 2 ? 0.012 : -0.012));
      P.add('hullDark', KIT.box(0.026, 0.75, 0.65), side * 2.075, 1.30, z);
      for (const y of [1.08, 1.52]) P.add('hullDetail', KIT.cylX(0.019, 0.20, 8), side * 2.09, y, z);
    }
    P.add('hullRubber', KIT.box(0.034, 0.19, 6.20), side * 2.10, 0.60, -0.70);
    P.addExternalArmor('hull', KIT.box(0.15, 0.22, 6.20), side * 1.89, 1.91, -0.70);
    for (const z of [1.25, -0.15, -1.55]) {
      P.addEquipment('hull', KIT.box(0.10, 0.24, 0.30), side * 2.09, 1.68, z);
      P.addModuleVisual('optics', 'hullGlass', KIT.box(0.014, 0.13, 0.18), side * 2.15, 1.68, z);
    }
  }
  for (const x of [-1.47, 1.47]) {
    for (const y of [2.02, 2.37]) P.add('hullDetail', KIT.box(0.035, 0.035, 2.26), x, y, -1.57);
    for (const z of [-2.67, -2.12, -1.57, -1.02, -0.47]) {
      P.add('hullDetail', KIT.box(0.035, 0.38, 0.035), x, 2.19, z);
    }
  }
}

function buildCv90MkivTurret(P: CvBuilderPort): void {
  const { box, cylY, cylZ, polyMultiLoft } = KIT;
  const citadelPlan: [number, number][] = [
    [-0.34, 1.70], [0.34, 1.70], [0.90, 1.44], [1.34, 0.70],
    [1.34, -1.24], [1.08, -1.82], [0.66, -1.98], [-0.66, -1.98],
    [-1.08, -1.82], [-1.34, -1.24], [-1.34, 0.70], [-0.90, 1.44],
  ];
  P.add('turretDark', polyMultiLoft(citadelPlan, [
    { height: 0.00, inset: 1.00 },
    { height: 0.44, inset: 0.97 },
    { height: 0.92, inset: 0.83 },
  ]), 0, -0.06, 0);
  P.add('turret', polyMultiLoft(citadelPlan, [
    { height: 0.00, inset: 1.00 },
    { height: 0.46, inset: 0.96 },
    { height: 0.96, inset: 0.81 },
  ]));
  for (const side of [-1, 1]) {
      P.add('turret', orientedSlab(
      [side * 0.38, 0.02, 1.38], [side * 1.43, 0.08, 0.62],
      [side * 1.46, 0.11, -0.46], [side * 0.72, 0.04, -0.55],
      [side * 0.30, 0.84, 1.00], [side * 0.90, 0.82, 0.25],
      [side * 1.14, 0.77, -0.46], [side * 0.63, 0.78, -0.55],
    ));
    P.addExternalArmor('turret', box(0.18, 0.52, 1.08), side * 1.39, 0.52, -0.98);
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 6, r: 0.041, len: 0.27, spacing: 0.09,
      splay: side * 0.54, pitch: -0.42, seed: 930 + side,
    }), side * 1.38, 0.55, 0.12, [0, side * 0.98, 0]);
  }
  P.addGunExtra(orientedSlab(
    [-0.48, -0.27, 0.04], [0.48, -0.27, 0.04],
    [0.27, -0.17, 1.70], [-0.27, -0.17, 1.70],
    [-0.48, 0.30, 0.04], [0.48, 0.30, 0.04],
    [0.25, 0.18, 1.70], [-0.25, 0.18, 1.70],
  ));
  P.addGunExtraDark(cylZ(0.170, 0.62, 24), 0, 0, 0.48);
  KIT.buildGun(P, { len: 3.76, r: 0.082, sleeve: true,
    evac: 0.55, evacR: 1.60, collar: true, baseR: 0.16 });
  muzzleBore(P, { len: 3.76, r: 0.082, seg: 20 });
  P.muzzleZ = 3.76;
  P.addEquipment('turret', box(0.44, 0.42, 0.46), 0.53, 0.58, 0.69, 0, -0.08, 0);
  P.addModuleVisual('optics', 'turretDark', box(0.35, 0.29, 0.024),
    0.53, 0.58, 0.945, 0, -0.08, 0);
  P.addModuleVisual('optics', 'turretGlass', box(0.27, 0.19, 0.015),
    0.53, 0.58, 0.962, 0, -0.08, 0);
  const rws = FITTINGS.openYokeRws({
    mats: P.mats, bodySlot: 'turret', sizeStandard: 'k2b-compact-tower',
    scale: 0.98, towerRise: 0.14, variant: 'korean-twin', ammoSide: 1,
    sensorSide: -1, elev: 0.055, caliberMm: 12.7,
    weaponName: 'CV90 Mk IV Ksp 88 RWS', seed: 944,
  });
  rws.name = 'cv90MkivK2bStyleRws';
  rws.userData.hostVariant = 'cv90_mkiv';
  mount(P, 'turret', rws, 0.72, 0.98, -1.05, [0, -0.04, 0]);
  P.add('turret', cylY(0.22, 0.25, 0.12, 20), -0.58, 1.00, -0.46);
  P.addEquipment('turret', box(0.38, 0.37, 0.35), -0.58, 1.24, -0.46);
  P.addModuleVisual('optics', 'turretGlass', box(0.23, 0.16, 0.018), -0.58, 1.25, -0.27);
  P.add('turretDark', box(0.31, 0.022, 0.31), -0.58, 1.44, -0.46);
  P.add('turret', box(0.30, 0.54, 0.72), -1.24, 0.56, -0.08, 0, 0, -0.08);
  P.add('turretDark', box(0.17, 0.18, 0.62), -1.02, 0.56, -0.08, 0, 0, -0.48);
  for (const y of [0.42, 0.70]) {
    P.add('turretDark', cylZ(0.115, 1.06, 18), -1.24, y, 0.46);
    P.add('turretDetail', KIT.torus(0.117, 0.012, 18), -1.24, y, 1.00, Math.PI / 2, 0, 0);
  }
  for (const [x, z, yaw] of [
    [-1.25, 0.68, -0.18], [1.25, 0.68, 0.18],
    [-1.14, -1.28, -2.96], [1.14, -1.28, 2.96],
  ] as const) {
    P.addEquipment('turret', box(0.25, 0.21, 0.18), x, 0.82, z, 0, yaw, 0);
    P.addModuleVisual('optics', 'turretGlass', box(0.17, 0.11, 0.014),
      x, 0.82, z + (z > 0 ? 0.10 : -0.10), 0, yaw, 0);
  }
  for (const x of [-0.86, 0, 0.86]) {
    mount(P, 'turret', FITTINGS.lightCluster({
      mats: P.mats, pods: 1, r: 0.037, guard: true, rake: 0, seed: 970 + x,
    }), x, 0.80, 1.20);
  }
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 1.84, d: 0.44, h: 0.24, fill: 0.52, rails: 4, seed: 951,
  }), 0, 0.52, -1.91);
  for (const side of [-1, 1]) {
    P.addEquipment('turret', box(0.70, 0.34, 0.46), side * 0.56, 0.45, -1.90);
  }
  P.add('turretDark', box(1.80, 0.14, 0.20), 0, 0.34, -2.08);
  for (const [x, height, seed] of [[-0.92, 0.95, 975], [0.94, 0.80, 976]] as const) {
    P.add('turretDark', cylY(0.042, 0.054, 0.085, 10), x, 1.00, -1.47);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: height, r: 0.010, seed }),
      x, 1.03, -1.47);
  }
  P.decal('turret', 'crossgrey', null, 0.26, [-1.49, 0.52, -0.82], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 2.12);
  if (P.geometryReceipt) {
    P.turretG.userData.cv90MkivIndependentTurretReceipt = Object.freeze({
      sharedStructuralBuilder: false,
      turretConstruction: 'cv90-mkiv-planar-faceted-unmanned-citadel-v4',
      gunAssembly: 'massive-faceted-50mm-trunnion-shroud-v1',
      remoteMachineGunTower: 'k2b-style-complete-open-yoke-rws',
      spikeLauncherTubes: 2, apsRadarFaces: 4,
      planarRoofCrown: true, monotonicArmorInset: true, concaveSurfaceCount: 0,
      integratedRearBustle: true,
    });
    P.gunG.userData.cv90GunAssemblyReceipt = Object.freeze({
      host: 'cv90_mkiv', architecture: 'faceted-closed-50mm-trunnion-shroud-v2',
      movingWithGun: true, surroundsMainBarrel: true, openFrontRear: false,
      diagonalSidePortsPerSide: 0, mainGunCaliberMm: 50, barrelLengthM: 3.76,
    });
    P.turretG.userData.cv90RoofRwsReceipt = Object.freeze({
      host: 'cv90_mkiv', designFamily: rws.userData.designFamily,
      variant: rws.userData.stationVariant, mountLocal: Object.freeze([0.72, 0.98, -1.05]),
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
      hullConstruction: 'cv90-mkiv-planar-roof-glacis-side-cell-v4', roadWheelsPerSide: 7,
      canonicalTrackCourses: 1, duplicateTrackMeshes: 0,
      suspensionPlacement: 'inboard-behind-road-wheel', sideArmorStationsPerSide: 9,
      sideArmorLayers: 3, planarRoofCell: true,
      upperGlacisConstruction: 'separate-planar-wedge', monotonicArmorInset: true,
      concaveSurfaceCount: 0, fenderBridge: 'continuous-hull-skirt-seat',
      tracksExtendedForRearHull: false, rearHullExtensionM: 0.08, rearTroopRamp: true,
    });
  }
}

export const CV90_PROFILES = Object.freeze({
  cv90: Object.freeze({ build: buildCv90 }),
  cv90_mkiv: Object.freeze({ build: buildCv90Mkiv }),
}) satisfies VehicleProfileRecord;
