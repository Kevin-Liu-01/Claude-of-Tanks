// Independent first-party procedural SPz Puma S1.
//
// The local owner-supplied GLB is used only as a proportion/anatomy oracle.
// This builder shares no donor geometry and never calls the legacy SPz Puma
// builder; every hull station, running-gear course, RCT30 surface and fitting
// below is authored from repository primitives.

import * as THREE from 'three';
import { KIT, FITTINGS, orientedSlab, muzzleTipDot } from './kit.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';

type Vec3 = [number, number, number];
type Owner = 'hull' | 'turret';

interface PumaS1BuilderPort {
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly mats: Record<string, THREE.Material>;
  readonly q?: boolean;
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
  P: PumaS1BuilderPort,
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

function addHullShell(P: PumaS1BuilderPort): void {
  const { box, frustum } = KIT;
  // Deep mine-protected tub and continuously connected shoulder course. The
  // bow has three real planes (lower nose, central glacis, shallow roof
  // break) rather than a rectangular IFV placeholder.
  P.add('hull', box(2.10, 0.66, 7.18), 0, 0.73, 0);
  P.add('hull', frustum(1.10, 3.50, -3.48, 1.10, 2.74, -3.48, 0.78, 1.42));
  P.add('hull', orientedSlab(
    [-1.10, 0.43, 2.18], [1.10, 0.43, 2.18], [1.10, 0.43, 3.55], [-1.10, 0.43, 3.55],
    [-1.18, 1.50, 1.92], [1.18, 1.50, 1.92], [1.05, 1.10, 3.55], [-1.05, 1.10, 3.55],
  ));
  P.add('hull', orientedSlab(
    [-1.28, 1.50, 1.90], [1.28, 1.50, 1.90], [1.05, 1.10, 3.55], [-1.05, 1.10, 3.55],
    [-1.40, 1.91, 1.54], [1.40, 1.91, 1.54], [1.12, 1.68, 2.54], [-1.12, 1.68, 2.54],
  ));
  P.add('hull', box(3.32, 0.42, 4.70), 0, 1.82, -0.78);
  P.add('hull', orientedSlab(
    [-1.66, 1.49, -3.54], [1.66, 1.49, -3.54], [1.66, 1.49, -2.90], [-1.66, 1.49, -2.90],
    [-1.54, 2.04, -3.76], [1.54, 2.04, -3.76], [1.66, 2.03, -2.90], [-1.66, 2.03, -2.90],
  ));
  P.add('hull', box(2.12, 0.54, 0.16), 0, 1.02, 3.72, -0.08, 0, 0);
  P.add('hullDark', box(2.64, 0.035, 2.44), 0, 2.045, -1.52);
  for (let index = 0; index < 12; index++) {
    P.add('hullDetail', box(2.42, 0.018, 0.052), 0, 2.069, -2.57 + index * 0.16);
  }

  // Driver hatch, hull camera pods and tow/lift hardware are sunk into the
  // roof/glacis planes. Equipment uses camouflage-aware buckets.
  P.addCupola('hull', KIT.cylY(0.32, 0.34, 0.055, 20), 0.68, 2.075, 1.48);
  P.add('hullDark', KIT.torus(0.31, 0.014, 20), 0.68, 2.108, 1.48);
  for (const x of [0.48, 0.68, 0.88]) KIT.periscope(P, 'hullDetail', x, 2.095, 1.80);
  for (const side of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({
      mats: P.mats, pods: 2, spacing: 0.135, r: 0.047, shield: true,
      rake: -0.28, seed: side < 0 ? 110 : 111,
    }), side * 1.04, 1.52, 2.72, [-0.35, 0, 0]);
    P.addEquipment('hull', box(0.34, 0.24, 0.31), side * 1.10, 1.54, 2.40, -0.24, 0, 0);
    P.addModuleVisual('optics', 'hullGlass', box(0.21, 0.105, 0.018),
      side * 1.10, 1.58, 2.58, -0.24, 0, 0);
    KIT.liftEye(P, 'hullDetail', side * 1.00, 1.34, 3.11);
  }
  KIT.towCable(P, [[-1.20, 1.49, 2.58], [-0.62, 1.31, 3.02],
    [0.62, 1.31, 3.02], [1.20, 1.49, 2.58]]);

  // Rear troop ramp and its physical hinges/locks.
  P.add('hullDark', box(1.72, 1.12, 0.045), 0, 1.14, -3.755);
  P.add('hull', box(1.56, 0.92, 0.055), 0, 1.15, -3.785);
  P.add('hullDetail', box(1.38, 0.035, 0.020), 0, 1.15, -3.818);
  for (const x of [-0.58, 0, 0.58]) {
    P.add('hullDark', KIT.cylX(0.055, 0.19, 12), x, 1.66, -3.82);
    P.add('hullDetail', box(0.08, 0.21, 0.035), x, 0.87, -3.82);
  }
}

function addRunningGear(P: PumaS1BuilderPort): void {
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', dishR: 0.72, wheelR: 0.345, wheelW: 0.24, wheelY: 0.42, xc: 1.55,
    wheelZs: [2.15, 1.37, 0.61, -0.32, -1.07, -1.81],
    sprocket: { z: 2.88, y: 0.965, r: 0.34 },
    idler: { z: -2.82, y: 0.84, r: 0.29 },
    rollerR: 0.09,
    rollers: [{ z: 1.72, y: 1.02 }, { z: 0.52, y: 1.03 }, { z: -0.70, y: 1.03 },
      { z: -1.82, y: 1.01 }],
    trackW: 0.56, trackTh: 0.092, topY: 1.28, botY: 0.055,
    trackPattern: 'compact-ifv', linkPitchM: 0.155, shoeWidthScale: 0.99,
    paintedEnds: true, arms: true, coveredTop: false,
    contactZF: 2.40, contactZR: -2.29,
  });

  // S1 level-C flank package. A faceted front shoulder carries the skirt into
  // the same upper-glacis break as the bow, so the protection is a connected
  // armored volume rather than a flat panel stopping beside the idler. The
  // straight course is built as a structural NERA carrier, a spaced stand-off
  // plate and two independent outer ERA bricks at every station. All three
  // layers remain beyond the widened native shoe envelope.
  for (const side of [-1, 1]) {
    P.addExternalArmor('hull', orientedSlab(
      [side * 1.28, 1.50, 2.34], [side * 1.94, 1.50, 2.34],
      [side * 1.22, 1.50, 3.52], [side * 1.04, 1.50, 3.52],
      [side * 1.64, 2.03, 2.34], [side * 1.98, 1.92, 2.34],
      [side * 1.23, 1.63, 3.52], [side * 1.08, 1.68, 3.52],
    ));
    // A raised shoulder cap seals the protection into the deck edge and gives
    // the bow/skirt junction the continuous PL-01-style folded silhouette.
    P.addExternalArmor('hull', orientedSlab(
      [side * 1.64, 1.91, 2.30], [side * 1.98, 1.88, 2.30],
      [side * 1.23, 1.60, 3.50], [side * 1.09, 1.65, 3.50],
      [side * 1.64, 2.06, 2.30], [side * 1.93, 2.03, 2.30],
      [side * 1.19, 1.72, 3.50], [side * 1.08, 1.72, 3.50],
    ));
    for (let index = 0; index < 9; index++) {
      const z = 2.12 - index * 0.66;
      const edge = index === 8;
      const moduleH = edge ? 0.91 : 1.04;
      const moduleY = edge ? 1.47 : 1.50;
      const roll = side * (edge ? 0.038 : 0.012);
      // Inner carrier and spaced middle plate touch one another at their
      // mating faces; the outer bricks then sit proud on that real foundation.
      P.addExternalArmor('hull', KIT.box(0.16, moduleH, 0.66),
        side * 1.93, moduleY, z, 0, 0, roll);
      P.addExternalArmor('hull', KIT.box(0.060, moduleH - 0.08, 0.66),
        side * 2.04, moduleY, z, 0, 0, roll);
      for (const [row, y] of [-1, 1].map((row) => [row,
        moduleY + row * (moduleH * 0.235)] as const)) {
        P.addExternalArmor('hull', KIT.box(0.075, moduleH * 0.43, 0.66),
          side * 2.108, y, z, 0, 0, roll + row * side * 0.006);
        P.add('hullDark', KIT.box(0.012, moduleH * 0.31, 0.54),
          side * 2.151, y, z, 0, 0, roll);
      }
      P.add('hullDark', KIT.box(0.014, moduleH - 0.16, 0.026),
        side * 2.149, moduleY, z + 0.287);
      for (const y of [moduleY - moduleH * 0.27, moduleY + moduleH * 0.27]) {
        P.add('hullDetail', KIT.cylX(0.017, 0.026, 8), side * 2.155, y, z,
          0, 0, side * Math.PI / 2);
      }
    }
    // Two continuous seating rails bind every outer brick back into the
    // cassette course. They close the service-line sight holes without
    // becoming a second track proxy or entering the shoe envelope.
    for (const y of [1.25, 1.76]) {
      P.addExternalArmor('hull', KIT.box(0.075, 0.10, 5.88),
        side * 2.108, y, -0.52);
    }
    P.add('hullRubber', KIT.box(0.035, 0.20, 5.64), side * 2.135, 0.82, -0.30);
    P.add('hull', KIT.box(0.16, 0.13, 5.78), side * 1.84, 2.05, -0.30);

    // Recessed flank camera and paired marker lamps remain readable above the
    // armor instead of being texture-only marks compressed across the tiles.
    for (const z of [1.05, -1.34]) {
      P.addEquipment('hull', KIT.box(0.095, 0.25, 0.32),
        side * 1.72, 1.88, z, 0, 0, side * 0.04);
      P.addModuleVisual('optics', 'hullDark', KIT.box(0.024, 0.17, 0.23),
        side * 1.775, 1.88, z);
      P.addModuleVisual('optics', 'hullGlass', KIT.box(0.013, 0.10, 0.15),
        side * 1.795, 1.88, z);
    }
    for (const z of [2.17, -2.72]) {
      P.addEquipment('hull', KIT.box(0.090, 0.14, 0.20), side * 2.155, 1.94, z);
      P.addModuleVisual('optics', 'hullGlass', KIT.box(0.012, 0.075, 0.105),
        side * 2.208, 1.94, z);
    }
  }
}

function addTurret(P: PumaS1BuilderPort): void {
  const { box, cylY, cylZ, polyMultiLoft, polyTurret, buildGun } = KIT;
  const plan = [
    [-0.20, 1.65], [0.20, 1.65], [0.62, 1.48], [0.88, 1.06],
    [0.98, 0.20], [0.94, -1.18], [0.70, -1.55], [-0.70, -1.55],
    [-0.94, -1.18], [-0.98, 0.20], [-0.88, 1.06], [-0.62, 1.48],
  ];
  P.add('turretDark', polyTurret(plan, 0.12, 1.04, 1.00), 0, -0.065, -0.02);
  P.add('turret', polyMultiLoft(plan, [
    { height: 0.02, inset: 1.00 },
    { height: [0.46, 0.46, 0.52, 0.58, 0.62, 0.65, 0.61, 0.61, 0.65, 0.62, 0.58, 0.52], inset: 0.98 },
    { height: [0.61, 0.61, 0.68, 0.72, 0.74, 0.77, 0.73, 0.73, 0.77, 0.74, 0.72, 0.68],
      inset: [0.72, 0.72, 0.80, 0.86, 0.89, 0.91, 0.92, 0.92, 0.91, 0.89, 0.86, 0.80] },
  ]));

  // Angular MK30 cradle with perforated heat shield and a genuine coax bore.
  P.addGunExtra(orientedSlab(
    [-0.42, -0.25, -0.04], [0.42, -0.25, -0.04], [0.32, -0.25, 0.46], [-0.32, -0.25, 0.46],
    [-0.34, 0.24, -0.02], [0.34, 0.24, -0.02], [0.25, 0.20, 0.52], [-0.25, 0.20, 0.52],
  ), 0, 0, 0.18);
  P.addGunExtraDark(cylZ(0.105, 0.30, 18), 0, 0, 0.53);
  P.addGunExtra(box(0.34, 0.23, 1.02), 0, 0, 1.02);
  for (const side of [-1, 1]) for (let index = 0; index < 5; index++) {
    P.addGunExtraDark(KIT.cylX(0.028, 0.022, 10), side * 0.19, 0.075,
      0.64 + index * 0.17);
  }
  // The 30 mm tube has a substantial external jacket at the muzzle. The
  // factory's canonical measured bore assembly seats against its real cap;
  // avoiding a second authored bore keeps the small-caliber throat perfectly
  // concentric instead of letting two independently segmented discs compete.
  buildGun(P, { len: 2.25, r: 0.045, sleeve: false, collar: true, baseR: 0.080 });
  P.addGunExtraDark(cylZ(0.016, 1.50, 10), 0.18, -0.02, 1.38);
  muzzleTipDot(P, 0.18, -0.02, 2.14, 0.010, { parent: 'gunG' });

  // Gunner primary sight, commander panoramic mast and four-camera 360 ring.
  P.addEquipment('turret', box(0.40, 0.42, 0.42), 0.58, 0.57, 0.47, 0, -0.08, 0);
  P.addModuleVisual('optics', 'turretDark', box(0.34, 0.30, 0.025),
    0.58, 0.58, 0.695, 0, -0.08, 0);
  P.addModuleVisual('optics', 'turretGlass', box(0.25, 0.20, 0.014),
    0.58, 0.58, 0.712, 0, -0.08, 0);
  P.addCupola('turret', cylY(0.24, 0.27, 0.10, 18), -0.40, 0.79, -0.42);
  P.addEquipment('turret', box(0.25, 0.34, 0.23), -0.40, 1.00, -0.42);
  P.addModuleVisual('optics', 'turretDark', box(0.28, 0.23, 0.25),
    -0.40, 1.26, -0.42, 0, 0.10, 0);
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const x = -0.40 + Math.sin(yaw) * 0.145;
    const z = -0.42 + Math.cos(yaw) * 0.145;
    P.addModuleVisual('optics', 'turretGlass', box(0.105, 0.095, 0.014),
      x, 1.26, z, 0, yaw, 0);
  }
  P.addEquipment('turret', box(0.34, 0.09, 0.30), -0.40, 1.47, -0.42);
  P.addModuleVisual('optics', 'turretDark', box(0.28, 0.23, 0.25),
    -0.40, 1.61, -0.42, 0, -0.12, 0);
  P.addModuleVisual('optics', 'turretGlass', box(0.20, 0.14, 0.014),
    -0.40, 1.61, -0.275, 0, -0.12, 0);

  // Compact S1 remote secondary station. It is physically seated on the
  // bustle roof and uses the shared detailed weapon grammar (bearing, fork,
  // receiver, feed box and bored barrel) instead of an anonymous prism.
  P.addCupola('turret', cylY(0.24, 0.28, 0.10, 20), 0.56, 0.79, -0.94);
  P.addEquipment('turret', orientedSlab(
    [-0.18, -0.08, -0.16], [0.18, -0.08, -0.16], [0.18, -0.08, 0.16], [-0.18, -0.08, 0.16],
    [-0.15, 0.13, -0.13], [0.15, 0.13, -0.13], [0.15, 0.13, 0.13], [-0.15, 0.13, 0.13],
  ), 0.56, 0.93, -0.94);
  P.addModuleVisual('optics', 'turretGlass', box(0.16, 0.075, 0.014),
    0.56, 0.96, -0.795);
  mount(P, 'turret', FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'dark', scale: 0.76, elev: 0.08,
    shield: 'low', ammo: true, seed: 172,
  }), 0.56, 1.06, -0.94, [0, 0.08, 0]);

  // Twin MELLS/Spike LR2 tubes on a braced left launcher. Tubes are separated,
  // capped and visibly founded on the turret wall; they pitch with the turret
  // but remain independent of the cannon recoil tree.
  const launcherX = 1.10;
  P.add('turret', box(0.22, 0.42, 0.62), launcherX, 0.43, -0.02, 0, 0, 0.10);
  P.add('turretDark', box(0.14, 0.16, 0.60), 0.91, 0.43, -0.02, 0, 0, 0.52);
  for (const y of [0.34, 0.58]) {
    P.add('turretDark', cylZ(0.105, 0.94, 16), launcherX, y, 0.37);
    P.add('turretDetail', KIT.torus(0.108, 0.012, 16), launcherX, y, 0.84,
      -Math.PI / 2, 0, 0);
    P.add('turretDark', cylZ(0.079, 0.018, 16), launcherX, y, 0.852);
  }

  for (const side of [-1, 1]) {
    P.add('turret', box(0.24, 0.16, 0.40), side * 1.01, 0.34, 0.06, 0, 0, -side * 0.14);
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 6, r: 0.041, len: 0.27, spacing: 0.095,
      splay: side * 0.46, pitch: -0.40, arc: 0.56, seed: side < 0 ? 180 : 181,
    }), side * 1.08, 0.44, 0.11, [0, side * 0.98, 0]);
    P.addModuleVisual('optics', 'turretDark', box(0.20, 0.16, 0.18),
      side * 0.88, 0.72, -0.70);
    P.addModuleVisual('optics', 'turretGlass', box(0.13, 0.09, 0.012),
      side * 0.88, 0.72, -0.60);
  }
  for (const [x, z, h, seed] of [[-0.78, -1.16, 0.88, 190], [0.76, -1.16, 0.74, 191]] as const) {
    P.add('turretDark', cylY(0.040, 0.055, 0.09, 10), x, 0.78, z);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h, r: 0.010, seed }),
      x, 0.80, z);
  }
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 1.30, d: 0.36, h: 0.18, fill: 0.45, rails: 3, seed: 210,
  }), 0, 0.42, -1.52);

  P.decal('turret', 'crossgrey', null, 0.27, [-1.15, 0.44, -0.70], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.86);
}

function buildPumaS1(P: PumaS1BuilderPort): void {
  addHullShell(P);
  addRunningGear(P);
  addTurret(P);
  P.decal('hull', 'crossgrey', null, 0.34, [-1.96, 1.47, 0.12], -Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || 'S1-481', 0.23,
    [1.96, 1.21, 1.05], Math.PI / 2);
  P.decal('hull', 'number', 'Y-481', 0.21, [-0.54, 1.33, 3.48], 0, -0.34);

  if (P.geometryReceipt) {
    P.hullG.userData.pumaS1Receipt = Object.freeze({
      independentFromLegacyPuma: true,
      hullConstruction: 'connected-faceted-s1-shell-v2',
      turretConstruction: 'independent-unmanned-rct30-loft-v1',
      roadWheelsPerSide: 6,
      canonicalTrackCourses: 1,
      duplicateTrackMeshes: 0,
      suspensionPlacement: 'inboard-behind-road-wheel',
      sideArmorCassettesPerSide: 9,
      sideArmorLayers: 3,
      frontSkirtTransition: 'upper-glacis-connected-wedge-v1',
      nativeTrackPattern: 'compact-ifv',
      baseGunAssembly: 'preserved-mk30-cradle-v1',
      mellsLaunchTubes: 2,
      panoramicOpticStages: 2,
      crewLocation: 'protected-hull-cell',
      rearTroopRamp: true,
    });
    P.turretG.userData.pumaS1TurretReceipt = Object.freeze({
      unmanned: true,
      gun: 'MK30-2/ABM',
      launcher: 'MELLS-Spike-LR2',
      stabilizedPanoramicSight: true,
      allAroundCameraCount: 4,
      remoteSecondaryWeapon: 'MG4-class',
    });
  }
}

export const PUMA_S1_PROFILES = Object.freeze({
  spz_puma_s1: Object.freeze({ build: buildPumaS1 }),
}) satisfies VehicleProfileRecord;
