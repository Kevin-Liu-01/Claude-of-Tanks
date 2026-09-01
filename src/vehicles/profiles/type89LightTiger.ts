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
  const { box, frustum } = KIT;

  // Compact six-wheel Japanese IFV tub. The four connected bow planes retain
  // the Type 89's high shoulder and clipped nose while the deeper belly,
  // faceted roof break and modular flanks identify the Light Tiger rebuild.
  P.add('hull', box(2.02, 0.62, 6.64), 0, 0.68, -0.08);
  P.add('hull', frustum(1.01, 3.20, -3.18, 1.01, 2.62, -3.18, 0.73, 1.34));
  P.add('hull', orientedSlab(
    [-1.01, 0.39, 2.02], [1.01, 0.39, 2.02], [0.92, 0.59, 3.25], [-0.92, 0.59, 3.25],
    [-1.21, 1.47, 1.66], [1.21, 1.47, 1.66], [1.02, 1.19, 3.25], [-1.02, 1.19, 3.25],
  ));
  P.add('hull', orientedSlab(
    [-1.21, 1.47, 1.66], [1.21, 1.47, 1.66], [1.02, 1.19, 3.25], [-1.02, 1.19, 3.25],
    [-1.48, 1.83, 1.30], [1.48, 1.83, 1.30], [1.15, 1.66, 2.42], [-1.15, 1.66, 2.42],
  ));
  P.add('hull', box(3.18, 0.39, 4.38), 0, 1.74, -0.82);
  P.add('hull', orientedSlab(
    [-1.59, 1.43, -3.24], [1.59, 1.43, -3.24], [1.59, 1.43, -2.76], [-1.59, 1.43, -2.76],
    [-1.47, 1.94, -3.37], [1.47, 1.94, -3.37], [1.59, 1.94, -2.76], [-1.59, 1.94, -2.76],
  ));

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
}

function addRunningGear(P: LightTigerBuilderPort): void {
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', dishR: 0.82, wheelR: 0.325, wheelW: 0.205,
    wheelY: 0.405, xc: 1.43,
    wheelZs: [2.05, 1.29, 0.53, -0.24, -1.01, -1.78],
    sprocket: { z: 2.70, y: 0.84, r: 0.31 },
    idler: { z: -2.64, y: 0.77, r: 0.28 },
    rollers: [{ z: 1.55, y: 0.99 }, { z: 0.48, y: 1.01 },
      { z: -0.62, y: 1.00 }, { z: -1.66, y: 0.98 }],
    rollerR: 0.082, trackW: 0.48, trackTh: 0.080,
    topY: 1.20, botY: 0.050, paintedEnds: true, arms: true,
    coveredTop: false, contactZF: 2.25, contactZR: -2.16,
  });

  // Split NERA/ERA cassette course. Each module is physically seated outside
  // the moving track, leaving service gaps and the lower rubber dust lip.
  for (const side of [-1, 1]) {
    for (let index = 0; index < 8; index++) {
      const z = 2.45 - index * 0.69;
      const end = index === 0 || index === 7;
      P.addExternalArmor('hull', KIT.box(0.14, end ? 0.76 : 0.96, 0.64),
        side * 1.77, end ? 1.46 : 1.43, z, 0, 0, side * (end ? 0.055 : 0.015));
      P.add('hullDark', KIT.box(0.018, end ? 0.58 : 0.77, 0.034),
        side * 1.848, end ? 1.46 : 1.43, z + 0.27);
      for (const y of [1.19, 1.67]) {
        P.add('hullDetail', KIT.cylX(0.015, 0.024, 8), side * 1.853, y, z,
          0, 0, side * Math.PI / 2);
      }
    }
    P.add('hullRubber', KIT.box(0.034, 0.18, 5.38), side * 1.835, 0.80, -0.02);
    P.add('hull', KIT.box(0.15, 0.12, 5.52), side * 1.70, 1.98, -0.02);
  }
}

function addTurret(P: LightTigerBuilderPort): void {
  const { box, cylY, cylZ, polyMultiLoft, polyTurret, buildGun } = KIT;
  const plan = [
    [-0.22, 1.48], [0.22, 1.48], [0.70, 1.25], [1.03, 0.70],
    [1.08, -0.82], [0.82, -1.30], [0.56, -1.48], [-0.56, -1.48],
    [-0.82, -1.30], [-1.08, -0.82], [-1.03, 0.70], [-0.70, 1.25],
  ];
  // Fine-segment machined bearing skirt: a real structural transition at the
  // unmanned module's yaw ring, not a coarse decorative puck. It remains
  // tucked under the faceted shell while retaining a clean circular seat in
  // close Gallery views and the vehicle's bounded authored shadow source.
  P.add('turret', cylY(0.92, 0.98, 0.07, 64), 0, -0.02, -0.02);
  P.add('turretDark', polyTurret(plan, 0.10, 0.96, 1.00), 0, -0.055, -0.02);
  P.add('turret', polyMultiLoft(plan, [
    { height: 0.02, inset: 1.00 },
    { height: [0.43, 0.43, 0.49, 0.55, 0.59, 0.62, 0.60, 0.60, 0.62, 0.59, 0.55, 0.49], inset: 0.98 },
    { height: [0.59, 0.59, 0.65, 0.70, 0.73, 0.76, 0.72, 0.72, 0.76, 0.73, 0.70, 0.65],
      inset: [0.74, 0.74, 0.81, 0.86, 0.90, 0.92, 0.93, 0.93, 0.92, 0.90, 0.86, 0.81] },
  ]));

  // Enlarged angular KDE-35 cradle: layered recoil cheeks, ventilated jacket,
  // coax and a real recessed muzzle. Everything follows gun pitch/recoil.
  P.addGunExtra(orientedSlab(
    [-0.46, -0.27, -0.02], [0.46, -0.27, -0.02], [0.35, -0.25, 0.54], [-0.35, -0.25, 0.54],
    [-0.36, 0.27, 0.00], [0.36, 0.27, 0.00], [0.27, 0.22, 0.58], [-0.27, 0.22, 0.58],
  ), 0, 0, 0.18);
  P.addGunExtraDark(cylZ(0.115, 0.34, 20), 0, 0, 0.57);
  P.addGunExtra(box(0.38, 0.25, 1.12), 0, 0, 1.08);
  for (const side of [-1, 1]) for (let index = 0; index < 5; index++) {
    P.addGunExtraDark(KIT.cylX(0.030, 0.024, 10), side * 0.21, 0.078,
      0.68 + index * 0.18);
  }
  buildGun(P, { len: 2.62, r: 0.050, sleeve: false, collar: true, baseR: 0.088 });
  muzzleBore(P, { len: 2.62, r: 0.050, boreR: 0.031 });
  P.addGunExtraDark(cylZ(0.017, 1.65, 10), 0.20, -0.025, 1.48);
  muzzleTipDot(P, 0.20, -0.025, 2.36, 0.011, { parent: 'gunG' });

  // Signature twin Jyu-MAT Kai pods: two tubes per side, armored and visibly
  // braced into the turret shoulder instead of floating beside it.
  for (const side of [-1, 1]) {
    P.addEquipment('turret', box(0.31, 0.48, 0.66), side * 1.12, 0.43, -0.02,
      0, 0, side * 0.09);
    P.add('turretDark', box(0.15, 0.18, 0.64), side * 0.91, 0.43, -0.02,
      0, 0, -side * 0.50);
    for (const y of [0.32, 0.56]) {
      P.add('turretDark', cylZ(0.108, 0.93, 18), side * 1.12, y, 0.38);
      P.add('turretDetail', KIT.torus(0.111, 0.012, 18), side * 1.12, y, 0.845,
        -Math.PI / 2, 0, 0);
      P.add('turretDark', cylZ(0.080, 0.018, 18), side * 1.12, y, 0.856);
    }
  }

  // Panoramic hunter-killer sight with a two-axis radar/EO crown and four
  // flush corner cameras for all-around situational awareness.
  P.addEquipment('turret', box(0.41, 0.43, 0.41), 0.55, 0.58, 0.31, 0, -0.08, 0);
  P.addModuleVisual('optics', 'turretDark', box(0.34, 0.30, 0.024),
    0.55, 0.59, 0.53, 0, -0.08, 0);
  P.addModuleVisual('optics', 'turretGlass', box(0.25, 0.20, 0.013),
    0.55, 0.59, 0.546, 0, -0.08, 0);
  P.addCupola('turret', cylY(0.25, 0.27, 0.10, 20), -0.43, 0.78, -0.35);
  P.addEquipment('turret', box(0.28, 0.38, 0.25), -0.43, 1.02, -0.35);
  P.addModuleVisual('optics', 'turretDark', box(0.31, 0.24, 0.27),
    -0.43, 1.31, -0.35, 0, 0.12, 0);
  P.addModuleVisual('optics', 'turretGlass', box(0.21, 0.14, 0.014),
    -0.43, 1.31, -0.195, 0, 0.12, 0);
  P.addEquipment('turret', box(0.39, 0.10, 0.34), -0.43, 1.50, -0.35);
  P.addModuleVisual('optics', 'turretDark', box(0.34, 0.21, 0.29),
    -0.43, 1.65, -0.35, 0, -0.12, 0);
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const x = -0.43 + Math.sin(yaw) * 0.16;
    const z = -0.35 + Math.cos(yaw) * 0.16;
    P.addModuleVisual('optics', 'turretGlass', box(0.105, 0.09, 0.013),
      x, 1.65, z, 0, yaw, 0);
  }

  // Compact roof RWS, APS interceptors, smoke banks and bustle service rack.
  mount(P, 'turret', FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.70, elev: 0.09,
    shield: 'low', ammo: true, seed: 899,
  }), 0.52, 0.76, -0.93, [0, 0.07, 0]);
  for (const side of [-1, 1]) {
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 6, r: 0.041, len: 0.27, spacing: 0.092,
      splay: side * 0.48, pitch: -0.39, arc: 0.54, seed: side < 0 ? 901 : 902,
    }), side * 1.11, 0.49, -0.44, [0, side * 0.96, 0]);
    P.addEquipment('turret', box(0.22, 0.23, 0.28), side * 0.86, 0.81, -0.72);
    P.addModuleVisual('optics', 'turretDark', box(0.16, 0.13, 0.030),
      side * 0.86, 0.82, -0.56);
    P.addModuleVisual('optics', 'turretGlass', box(0.11, 0.075, 0.014),
      side * 0.86, 0.82, -0.541);
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
      hullConstruction: 'connected-faceted-light-tiger-shell-v1',
      turretConstruction: 'independent-low-profile-kde35-loft-v1',
      roadWheelsPerSide: 6,
      canonicalTrackCourses: 1,
      duplicateTrackMeshes: 0,
      suspensionPlacement: 'inboard-behind-road-wheel',
      sideArmorCassettesPerSide: 8,
      jyuMatLaunchTubes: 4,
      panoramicOpticStages: 2,
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
      remoteSecondaryWeapon: '5.56mm RWS',
    });
  }
}

export const TYPE89_LIGHT_TIGER_PROFILES = Object.freeze({
  type89_light_tiger: Object.freeze({ build: buildType89LightTiger }),
}) satisfies VehicleProfileRecord;
