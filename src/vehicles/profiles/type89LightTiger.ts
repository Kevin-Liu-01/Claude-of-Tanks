// Independent first-party procedural Type 89 Light Tiger.
//
// The owner-supplied Type 89 GLB is a measurement and silhouette reference
// only. No mesh, texture, node, or legacy Type 89 builder is consumed here:
// every armored plane, running-gear course, weapon and fitting is authored
// from the repository's procedural primitives.

import * as THREE from 'three';
import { KIT, FITTINGS, muzzleBore, muzzleTipDot, orientedSlab } from './kit.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';

type Vec3 = [number, number, number];
type Owner = 'hull' | 'turret';

interface LightTigerBuilderPort {
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
  P: LightTigerBuilderPort,
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

function addHull(P: LightTigerBuilderPort): void {
  const { box, frustum, polyMultiLoft } = KIT;

  // Compact six-wheel Japanese IFV tub. The four connected bow planes retain
  // the Type 89's high shoulder and clipped nose while the deeper belly,
  // faceted roof break and modular flanks identify the Light Tiger rebuild.
  P.add('hull', box(2.16, 0.62, 6.64), 0, 0.68, -0.08);
  P.add('hull', frustum(1.01, 3.20, -3.18, 1.01, 2.62, -3.18, 0.73, 1.34));
  P.add('hull', orientedSlab(
    [-1.01, 0.39, 2.02], [1.01, 0.39, 2.02], [0.92, 0.59, 3.25], [-0.92, 0.59, 3.25],
    [-1.21, 1.47, 1.66], [1.21, 1.47, 1.66], [1.02, 1.19, 3.25], [-1.02, 1.19, 3.25],
  ));
  P.add('hull', orientedSlab(
    [-1.02, 1.19, 3.25], [1.02, 1.19, 3.25], [1.46, 1.75, 1.60], [-1.46, 1.75, 1.60],
    [-1.10, 1.32, 3.25], [1.10, 1.32, 3.25], [1.46, 1.91, 1.60], [-1.46, 1.91, 1.60],
  ));
  // The Japanese hull keeps its compact footprint but replaces the vertical
  // troop box with a stepped shoulder loft. The bow, side shoulders and roof
  // rise at different rates, giving the Light Tiger its own sharp silhouette.
  const troopCellPlan: [number, number][] = [
    [-1.46, 1.68], [1.46, 1.68], [1.54, 1.42], [1.54, -3.12],
    [1.38, -3.38], [-1.38, -3.38], [-1.54, -3.12], [-1.54, 1.42],
  ];
  P.add('hull', polyMultiLoft(troopCellPlan, [
    { height: 0.00, inset: 1.00 },
    { height: 0.34, inset: 0.96 },
    { height: 0.64, inset: 0.88 },
  ]), 0, 1.34, -0.02);

  // Low-observable roof panels, engine louvers and recessed driver station.
  P.add('hullDark', box(1.36, 0.030, 1.74), -0.74, 1.955, 1.18);
  for (let index = 0; index < 9; index++) {
    P.add('hullDetail', box(1.18, 0.018, 0.050), -0.74, 1.982, 0.51 + index * 0.16);
  }
  P.addCupola('hull', KIT.cylY(0.30, 0.32, 0.052, 20), 0.71, 1.975, 1.31);
  P.add('hullDark', KIT.torus(0.30, 0.014, 20), 0.71, 2.005, 1.31);
  for (const x of [0.52, 0.71, 0.90]) KIT.periscope(P, 'hullDetail', x, 2.016, 1.61);

  for (const side of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({
      mats: P.mats, pods: 2, spacing: 0.13, r: 0.048, shield: true,
      rake: -0.30, seed: side < 0 ? 891 : 892,
    }), side * 1.00, 1.45, 2.68, [-0.30, 0, 0]);
    // Deep shoulder ventilation boxes make the fender volume explicit at the
    // bow. Their inner edges overlap the glacis side plane while their outer
    // edges terminate above the newly inboard tread course.
    P.addEquipment('hull', box(0.44, 0.36, 0.18), side * 1.32, 1.58, 2.34,
      -0.24, 0, 0);
    P.add('hullDark', box(0.36, 0.28, 0.025), side * 1.32, 1.58, 2.446,
      -0.24, 0, 0);
    for (let row = 0; row < 6; row++) {
      P.add('hullDetail', box(0.34, 0.018, 0.018), side * 1.32,
        1.475 + row * 0.041, 2.466, -0.24, 0, 0);
    }
    P.addEquipment('hull', box(0.31, 0.21, 0.28), side * 1.05, 1.48, 2.42, -0.22, 0, 0);
    P.addModuleVisual('optics', 'hullGlass', box(0.19, 0.09, 0.016),
      side * 1.05, 1.52, 2.57, -0.22, 0, 0);
    KIT.liftEye(P, 'hullDetail', side * 0.95, 1.31, 3.00);
  }
  KIT.towCable(P, [[-1.25, 1.34, 2.54], [-0.62, 1.18, 2.96],
    [0.62, 1.18, 2.96], [1.25, 1.34, 2.54]]);

  // Full-width troop ramp with a smaller emergency door and visible hinges.
  P.add('hullDark', box(1.76, 1.06, 0.045), 0, 1.14, -3.385);
  P.add('hull', box(1.60, 0.90, 0.055), 0, 1.14, -3.415);
  P.add('hullDark', box(0.64, 0.70, 0.020), 0.40, 1.13, -3.448);
  for (const x of [-0.59, 0, 0.59]) {
    P.add('hullDark', KIT.cylX(0.050, 0.18, 12), x, 1.62, -3.45);
    P.add('hullDetail', box(0.075, 0.20, 0.030), x, 0.87, -3.45);
  }
  for (const side of [-1, 1]) {
    P.addEquipment('hull', box(0.33, 0.42, 0.30), side * 1.17, 1.43, -3.27);
    P.add('hullDark', box(0.20, 0.22, 0.022), side * 1.17, 1.42, -3.438);
    P.addModuleVisual('optics', 'hullGlass', box(0.11, 0.080, 0.012),
      side * 1.17, 1.49, -3.452);
  }
}

function addRunningGear(P: LightTigerBuilderPort): void {
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', dishR: 0.88, wheelR: 0.325, wheelW: 0.225,
    wheelY: 0.405, xc: 1.42,
    wheelZs: [2.25, 1.42, 0.57, -0.30, -1.16, -2.00],
    sprocket: { z: 3.00, y: 0.84, r: 0.32 },
    idler: { z: -2.96, y: 0.77, r: 0.29 },
    rollers: [{ z: 1.92, y: 0.99 }, { z: 0.63, y: 1.01 },
      { z: -0.67, y: 1.00 }, { z: -1.86, y: 0.98 }],
    rollerR: 0.082, trackW: 0.46, trackTh: 0.086,
    trackPattern: 'japanese-modular', linkPitchM: 0.145, shoeWidthScale: 0.985,
    topY: 1.20, botY: 0.050, paintedEnds: true, arms: true,
    coveredTop: false, contactZF: 2.54, contactZR: -2.45,
  });

  // The layered skirt begins at the real track envelope and folds into the
  // upper-glacis shoulder, keeping the side profile sealed without shoe clips.
  for (const side of [-1, 1]) {
    P.addExternalArmor('hull', orientedSlab(
      [side * 1.71, 0.91, 2.42], [side * 1.87, 0.91, 2.42],
      [side * 1.69, 0.45, 3.27], [side * 1.85, 0.45, 3.27],
      [side * 1.71, 1.82, 2.42], [side * 1.87, 1.82, 2.42],
      [side * 1.69, 1.27, 3.27], [side * 1.85, 1.27, 3.27],
    ));
    P.addExternalArmor('hull', orientedSlab(
      // This shoulder is deliberately keyed through the glacis edge instead
      // of merely touching it. It produces one continuous Swedish-style
      // fender/body plane and removes the narrow sky pocket beside the bow.
      [side * 1.30, 1.79, 2.39], [side * 1.70, 1.79, 2.39],
      [side * 1.02, 1.35, 3.25], [side * 0.90, 1.35, 3.25],
      [side * 1.30, 2.00, 2.39], [side * 1.68, 1.97, 2.39],
      [side * 1.01, 1.50, 3.25], [side * 0.89, 1.50, 3.25],
    ));
    for (let index = 0; index < 9; index++) {
      const z = 2.22 - index * 0.64;
      const end = index === 8;
      const moduleH = end ? 0.82 : 0.96;
      const moduleY = end ? 1.42 : 1.43;
      const roll = side * (end ? 0.050 : 0.016);
      P.addExternalArmor('hull', KIT.box(0.10, moduleH, 0.64),
        side * 1.77, moduleY, z, 0, 0, roll);
      P.addExternalArmor('hull', KIT.box(0.050, moduleH - 0.08, 0.64),
        side * 1.84, moduleY, z, 0, 0, roll);
      for (const [row, y] of [-1, 1].map((row) => [row,
        moduleY + row * moduleH * 0.225] as const)) {
        const stagger = row * 0.010 * (index % 2 ? -1 : 1);
        P.addExternalArmor('hull', KIT.box(0.070, moduleH * 0.42, 0.64),
          side * 1.895, y, z + stagger, 0, 0, roll - row * side * 0.008);
        P.add('hullDark', KIT.box(0.012, moduleH * 0.30, 0.55),
          side * 1.934, y, z + stagger);
      }
      P.add('hullDark', KIT.box(0.014, moduleH - 0.15, 0.027),
        side * 1.933, moduleY, z + 0.292);
      for (const y of [moduleY - moduleH * 0.26, moduleY + moduleH * 0.26]) {
        P.add('hullDetail', KIT.cylX(0.016, 0.025, 8), side * 1.940, y, z,
          0, 0, side * Math.PI / 2);
      }
    }
    for (const y of [1.22, 1.65]) {
      P.addExternalArmor('hull', KIT.box(0.072, 0.095, 5.76),
        side * 1.895, y, -0.34);
    }
    P.add('hullRubber', KIT.box(0.034, 0.18, 5.78), side * 1.930, 0.80, -0.33);
    // Broad structural shoulders overlap the troop cell, fender and skirt
    // carrier. From every review angle they read as one body over the tread,
    // rather than three parallel strips with sky between them.
    P.add('hull', KIT.box(0.46, 0.23, 5.80), side * 1.43, 1.70, -0.33);
    P.add('hull', KIT.box(0.25, 0.16, 5.80), side * 1.64, 1.88, -0.33);
    P.add('hullDark', KIT.box(0.34, 0.035, 5.68), side * 1.48, 1.835, -0.33);

    // Inset EO windows and separate marker lamps provide actual depth cues on
    // the hull flanks without painting stretched rectangles over the armor.
    for (const z of [0.88, -1.22]) {
      P.addEquipment('hull', KIT.box(0.090, 0.24, 0.30),
        side * 1.64, 1.83, z, 0, 0, side * 0.04);
      P.addModuleVisual('optics', 'hullDark', KIT.box(0.022, 0.16, 0.22),
        side * 1.692, 1.83, z);
      P.addModuleVisual('optics', 'hullGlass', KIT.box(0.012, 0.095, 0.14),
        side * 1.711, 1.83, z);
    }
    for (const z of [2.04, -2.53]) {
      P.addEquipment('hull', KIT.box(0.085, 0.13, 0.19), side * 1.895, 1.88, z);
      P.addModuleVisual('optics', 'hullGlass', KIT.box(0.012, 0.070, 0.100),
        side * 1.946, 1.88, z);
    }
  }
}

function addTurret(P: LightTigerBuilderPort): void {
  const { box, cylY, cylZ, polyMultiLoft, polyTurret, buildGun } = KIT;
  // Compact Type 89-derived fighting box: a broad, genuinely flat front,
  // short chamfered shoulders and a square bustle replace the former pointed
  // wedge. The upper ring stays slightly inset, preserving crisp welded
  // planes without creating a concave crown.
  const plan = [
    [-0.82, 1.34], [0.82, 1.34], [1.12, 1.02], [1.18, 0.54],
    [1.18, -1.08], [0.88, -1.46], [-0.88, -1.46], [-1.18, -1.08],
    [-1.18, 0.54], [-1.12, 1.02],
  ];
  // Fine-segment machined bearing skirt: a real structural transition at the
  // unmanned module's yaw ring, not a coarse decorative puck. It remains
  // tucked under the faceted shell while retaining a clean circular seat in
  // close Gallery views and the vehicle's bounded authored shadow source.
  P.add('turret', cylY(0.92, 0.98, 0.07, 64), 0, -0.02, -0.02);
  P.add('turretDark', polyTurret(plan, 0.10, 0.96, 1.00), 0, -0.055, -0.02);
  P.add('turret', polyMultiLoft(plan, [
    { height: 0.02, inset: 1.00 },
    { height: 0.38, inset: 0.98 },
    { height: 0.72, inset: 0.90 },
  ]));
  P.add('turret', box(1.62, 0.62, 0.18), 0, 0.36, 1.29);
  for (const side of [-1, 1]) {
    P.add('turret', orientedSlab(
      [side * 0.80, 0.05, 1.33], [side * 1.19, 0.08, 1.02],
      [side * 1.16, 0.08, 0.34], [side * 0.82, 0.05, 0.34],
      [side * 0.74, 0.68, 1.24], [side * 1.05, 0.66, 0.95],
      [side * 1.04, 0.64, 0.34], [side * 0.75, 0.66, 0.34],
    ));
    // Bradley-like flank equipment boxes are structurally seated into the
    // shoulder and bustle rather than hanging beyond the turret outline.
    P.addEquipment('turret', box(0.30, 0.48, 0.82), side * 1.12, 0.43, 0.28,
      0, 0, side * 0.025);
    P.addEquipment('turret', box(0.25, 0.36, 0.60), side * 1.10, 0.40, -0.58,
      0, 0, -side * 0.020);
    P.add('turretDark', box(0.018, 0.27, 0.45), side * 1.258, 0.42, -0.58);
  }

  // Wide flat gun mask and compact rocking mantlet. All parts remain gun-owned
  // so the seal pitches with the KDE-35 while staying visibly buried in the
  // turret's frontal plate.
  P.addGunExtra(box(0.92, 0.52, 0.22), 0, 0, 0.12);
  P.addGunExtraDark(box(0.72, 0.36, 0.035), 0, 0, 0.244);
  P.addGunExtra(cylZ(0.170, 0.34, 24), 0, 0, 0.34);
  P.addGunExtraDark(cylZ(0.128, 0.12, 24), 0, 0, 0.56);
  for (const x of [-0.36, 0.36]) {
    for (const y of [-0.18, 0.18]) {
      P.addGunExtraDark(cylZ(0.022, 0.018, 10), x, y, 0.252);
    }
  }
  buildGun(P, { len: 3.10, r: 0.062, sleeve: false, collar: true, baseR: 0.120 });
  muzzleBore(P, { len: 3.10, r: 0.062, boreR: 0.038 });
  P.addGunExtraDark(cylZ(0.021, 2.15, 12), 0.22, -0.028, 1.82);
  muzzleTipDot(P, 0.22, -0.028, 2.90, 0.013, { parent: 'gunG' });
  P.gunG.userData.type89GunMantletReceipt = Object.freeze({
    architecture: 'flat-mask-compact-rocking-mantlet-v1',
    movingWithGun: true,
    verticalOffsetM: 0,
    scaleFromInitialCompactEnvelope: 0.48,
    lengthM: 0.56,
    diagonalSidePortsPerSide: 0,
    topBottomSkins: false,
    sideSkinPanelsPerSide: 1,
    openFrontRear: false,
    surroundsMainBarrel: true,
    surroundsCoax: true,
  });

  // Signature Jyu-MAT Kai channels remain inside squared armored side boxes;
  // the dark launch mouths keep the guided armament legible without reverting
  // to the former exposed round-tube silhouette.
  for (const side of [-1, 1]) {
    P.addEquipment('turret', box(0.28, 0.46, 0.62), side * 1.13, 0.46, 0.38,
      0, 0, side * 0.035);
    for (const y of [0.32, 0.56]) {
      P.add('turretDark', box(0.18, 0.14, 0.025), side * 1.13, y, 0.705);
    }
  }

  // Twin large square roof optics echo the Type 89's paired sight boxes. The
  // housings straddle the gun instead of blocking it, with deep dark bezels
  // and inset glass rather than painted rectangles.
  for (const side of [-1, 1]) {
    P.addEquipment('turret', box(0.38, 0.44, 0.36), side * 0.47, 0.88, 0.48);
    P.addModuleVisual('optics', 'turretDark', box(0.30, 0.31, 0.030),
      side * 0.47, 0.88, 0.676);
    P.addModuleVisual('optics', 'turretGlass', box(0.23, 0.23, 0.014),
      side * 0.47, 0.88, 0.699);
    P.add('turretDetail', box(0.42, 0.045, 0.40), side * 0.47, 1.115, 0.47);
  }
  // Compact K2B-derived panoramic station. The weapon hardware is deliberately
  // omitted and the highest EO head sits centered on the station roof.
  const tigerRoofOptics = FITTINGS.openYokeRws({
    mats: P.mats,
    bodySlot: 'turret',
    sizeStandard: 'k2b-compact-tower',
    scale: 0.88,
    towerRise: 0.12,
    variant: 'korean-twin',
    sensorHead: true,
    sensorMount: 'roof',
    weapon: false,
    seed: 899,
  });
  tigerRoofOptics.name = 'type89K2bStyleRoofOptics';
  tigerRoofOptics.userData.hostVariant = 'type89_light_tiger';
  tigerRoofOptics.userData.sensorRole = 'commander-panoramic';
  mount(P, 'turret', tigerRoofOptics, -0.36, 0.76, -0.56, [0, 0.04, 0]);
  P.turretG.userData.type89RoofOpticsReceipt = Object.freeze({
    designFamily: tigerRoofOptics.userData.designFamily,
    variant: tigerRoofOptics.userData.stationVariant,
    mountLocal: Object.freeze([-0.36, 0.76, -0.56]),
    scale: tigerRoofOptics.userData.scale,
    sizeStandard: tigerRoofOptics.userData.sizeStandard,
    towerRiseM: tigerRoofOptics.userData.towerRise,
    hasWeapon: tigerRoofOptics.userData.hasWeapon,
    sensorMount: tigerRoofOptics.userData.sensorMount,
    integratedSensorHead: tigerRoofOptics.userData.hasIntegratedSensorHead,
    turretOwned: true,
  });

  // The former weapon seat now carries a distinct low Japanese-pattern RWS.
  // Split shoulders and clipped guards keep it visually separate from Puma's
  // arrow-brow station; the positive-X firing line clears the roof optics.
  const tigerRoofRws = FITTINGS.openYokeRws({
    mats: P.mats,
    bodySlot: 'turret',
    sizeStandard: 'light-tiger-compact-rws',
    scale: 0.66,
    towerRise: 0.09,
    variant: 'light-tiger-compact',
    ammoSide: -1,
    sensorHead: false,
    elev: 0.060,
    caliberMm: 12.7,
    weaponName: 'Light Tiger compact remote machine gun',
    seed: 900,
  });
  tigerRoofRws.name = 'type89LightTigerCompactRoofRws';
  tigerRoofRws.userData.hostVariant = 'type89_light_tiger';
  mount(P, 'turret', tigerRoofRws, 0.42, 0.76, -0.94, [0, 0.04, 0]);
  P.turretG.userData.type89RoofRwsReceipt = Object.freeze({
    designFamily: tigerRoofRws.userData.designFamily,
    variant: tigerRoofRws.userData.stationVariant,
    mountLocal: Object.freeze([0.42, 0.76, -0.94]),
    scale: tigerRoofRws.userData.scale,
    sizeStandard: tigerRoofRws.userData.sizeStandard,
    towerRiseM: tigerRoofRws.userData.towerRise,
    caliberMm: tigerRoofRws.userData.caliberMm,
    visibleFeedBelt: tigerRoofRws.userData.hasVisibleFeedBelt,
    integratedSensorHead: tigerRoofRws.userData.hasIntegratedSensorHead,
    turretOwned: true,
  });
  for (const side of [-1, 1]) {
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 6, r: 0.041, len: 0.27, spacing: 0.092,
      splay: side * 0.48, pitch: -0.39, arc: 0.54, seed: side < 0 ? 901 : 902,
    }), side * 1.16, 0.54, -0.48, [0, side * 0.96, 0]);
    P.addEquipment('turret', box(0.22, 0.23, 0.28), side * 0.92, 0.82, -0.72);
    P.addModuleVisual('optics', 'turretDark', box(0.16, 0.13, 0.030),
      side * 0.92, 0.83, -0.56);
    P.addModuleVisual('optics', 'turretGlass', box(0.11, 0.075, 0.014),
      side * 0.92, 0.83, -0.541);
    for (const x of [0.73, 0.98]) {
      P.addEquipment('turret', cylZ(0.050, 0.30, 10), side * x, 0.74, -1.02,
        -0.18, side * 0.30, 0);
    }
  }
  for (const [x, z, h, seed] of [[-0.76, -1.17, 0.90, 910], [0.76, -1.17, 0.78, 911]] as const) {
    P.add('turretDark', cylY(0.040, 0.055, 0.09, 10), x, 0.78, z);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h, r: 0.010, seed }),
      x, 0.80, z);
  }
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 1.34, d: 0.38, h: 0.18, fill: 0.48, rails: 3, seed: 920,
  }), 0, 0.43, -1.50);

  P.decal('turret', 'roundel', null, 0.24, [-1.10, 0.46, -0.66], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.88);
}

function buildType89LightTiger(P: LightTigerBuilderPort): void {
  addHull(P);
  addRunningGear(P);
  addTurret(P);
  P.decal('hull', 'roundel', null, 0.32, [-1.84, 1.40, 0.02], -Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '89-LT', 0.22,
    [1.84, 1.19, 0.98], Math.PI / 2);
  P.decal('hull', 'number', 'LT-10', 0.19, [-0.50, 1.31, 3.20], 0, -0.33);

  if (P.geometryReceipt) {
    P.hullG.userData.type89LightTigerReceipt = Object.freeze({
      independentFromLegacyType89: true,
      referenceUsage: 'measurement-and-silhouette-only',
      hullConstruction: 'planar-roof-light-tiger-glacis-shell-v5',
      turretConstruction: 'flat-front-bradley-equipment-citadel-v5',
      roadWheelsPerSide: 6,
      canonicalTrackCourses: 1,
      duplicateTrackMeshes: 0,
      suspensionPlacement: 'inboard-behind-road-wheel',
      sideArmorCassettesPerSide: 9,
      sideArmorLayers: 3,
      frontSkirtTransition: 'inboard-glacis-shoulder-downfold-v3',
      nativeTrackPattern: 'japanese-modular',
      baseGunAssembly: 'flat-mask-kde35-mantlet-v8',
      jyuMatLaunchTubes: 4,
      panoramicOpticStages: 2,
      planarRoofCell: true,
      upperGlacisConstruction: 'separate-planar-wedge',
      monotonicArmorInset: true,
      concaveSurfaceCount: 0,
      fenderBridge: 'broad-over-track-shoulder-and-skirt-seat-v2',
      rearTroopRamp: true,
    });
    P.turretG.userData.type89LightTigerTurretReceipt = Object.freeze({
      unmanned: true,
      gun: 'KDE-35 Light Tiger',
      launcher: 'Type-01 Jyu-MAT Kai',
      launcherTubes: 4,
      stabilizedPanoramicSight: true,
      allAroundCameraCount: 4,
      hardKillAps: true,
      remoteSecondaryWeapon: '12.7mm Light Tiger compact RWS',
      mantletConstruction: 'flat-mask-compact-rocking-block',
      pairedRoofOpticBoxes: true,
      planarRoofCrown: true,
      monotonicArmorInset: true,
      concaveSurfaceCount: 0,
    });
  }
}

export const TYPE89_LIGHT_TIGER_PROFILES = Object.freeze({
  type89_light_tiger: Object.freeze({ build: buildType89LightTiger }),
}) satisfies VehicleProfileRecord;
