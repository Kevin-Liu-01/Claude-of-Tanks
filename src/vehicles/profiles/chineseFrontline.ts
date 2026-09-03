// First-party VT-4A1 construction on the exact ZTZ-99A2 chassis.
//
// The supplied VT-4A1 GLB remains a comparison instrument only. Playable
// geometry comes from the shared procedural A2 hull and a new lower,
// deep-bustle VT turret authored in the game's native +Z-forward frame.

import * as THREE from 'three';
import { KIT, FITTINGS, orientedSlab, muzzleTipDot } from './kit.ts';
import {
  chevronSurfacePanel,
  closedIntegratedChevron,
  interpolateChevronStation,
  type ChevronStation,
} from './chineseChevron.ts';
import { buildType99AHullOnly } from '../modern2.ts';
import { addRearFuelDrums, buildZTZ99A2Hull, type ChinaBuilderPort } from './china.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';

type Vec3 = [number, number, number];
type Owner = 'hull' | 'turret';

interface FrontlinePort {
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly mats: Record<string, THREE.Material>;
  readonly q?: boolean;
  readonly geometryReceipt?: boolean;
  readonly spec: { readonly id: string; readonly visual: { readonly number?: string } };
  muzzleZ: number;
  topY?: number;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addEquipment(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addExternalArmor(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addModuleVisual(module: string, slot: string, geometry: THREE.BufferGeometry,
    ...transform: number[]): unknown;
  visualEraCluster(name: string, owner: Owner, fill: () => void): void;
  decal(owner: Owner, kind: string, label: string | null, scale: number,
    position: Vec3, ...orientation: number[]): unknown;
}

function mount(
  P: FrontlinePort,
  owner: Owner,
  object: THREE.Object3D,
  position: Vec3,
  rotation: Vec3 = [0, 0, 0],
): void {
  object.position.set(...position);
  object.rotation.set(...rotation);
  (owner === 'hull' ? P.hullG : P.turretG).add(object);
}

function addChinese125Gun(
  P: FrontlinePort,
  config: { length: number; rootR: number; sleeveStart: number; sleeveEnd: number },
): void {
  const { cylZ, torus } = KIT;
  // The trunnion and the barrel share local +Z.  Keep the collar faceted so
  // it reads as a welded Chinese gun cradle instead of a round cast mantlet.
  // (A transverse cylinder here creates the false twin-bar silhouette this
  // replacement is specifically intended to remove.)
  P.addGunExtraDark(cylZ(config.rootR * 1.05, 0.18, P.q ? 12 : 8,
    config.rootR * 0.98), 0, 0, 0.09);
  P.addGunExtra(cylZ(config.rootR * 0.94, 0.68, P.q ? 12 : 8,
    config.rootR * 0.56), 0, 0, 0.47);
  P.addGunExtraDark(cylZ(config.rootR * 0.59, 0.08, 12), 0, 0, 0.85);
  KIT.buildGun(P, { len: config.length, r: 0.071, sleeve: false, collar: false, baseR: 0.105 });
  P.add('gun', cylZ(0.105, config.sleeveEnd - config.sleeveStart, 18, 0.090),
    0, 0, (config.sleeveStart + config.sleeveEnd) * 0.5);
  for (const z of [config.sleeveStart, config.sleeveStart + 0.72, config.sleeveEnd]) {
    P.add('gunDark', torus(z === config.sleeveEnd ? 0.090 : 0.104, 0.012, 16),
      0, 0, z, Math.PI / 2, 0, 0);
  }
  P.add('gunDark', cylZ(0.080, 0.22, 18), 0, 0, config.length - 0.11);
  muzzleTipDot(P, 0, 0, config.length + 0.012, 0.057, { parent: 'gunG' });
  P.muzzleZ = config.length;
}

function addSmokeAndWarningSuite(
  P: FrontlinePort,
  config: {
    warningX: number;
    warningZ: number;
    warningY: number;
    smokeX: number;
    smokeZ: number;
    smokeY?: number;
  },
): void {
  const { box, cylY, cylZ } = KIT;
  for (const side of [-1, 1] as const) {
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 6, r: 0.046, len: 0.30, spacing: 0.105,
      splay: side * 0.52, pitch: -0.42, arc: 0.54,
      seed: side < 0 ? 410 : 411,
    }), [side * config.smokeX, config.smokeY ?? 0.50, config.smokeZ], [0, side * 0.98, 0]);

    // VT-family roof warning/APS pedestal: broad base, vertical yoke, paired
    // circular apertures and a visible cable/service box at the rear.
    P.addEquipment('turret', box(0.28, 0.08, 0.27),
      side * config.warningX, config.warningY, config.warningZ);
    P.add('turret', box(0.24, 0.32, 0.20),
      side * config.warningX, config.warningY + 0.20, config.warningZ);
    P.add('turretDark', box(0.26, 0.20, 0.030),
      side * config.warningX, config.warningY + 0.23, config.warningZ + 0.115);
    for (const dx of [-0.060, 0.060]) {
      P.addModuleVisual('optics', 'turretGlass', cylZ(0.041, 0.022, 14),
        side * config.warningX + dx, config.warningY + 0.24, config.warningZ + 0.137);
    }
    P.add('turretDetail', cylY(0.030, 0.038, 0.09, 10),
      side * config.warningX, config.warningY + 0.40, config.warningZ);
  }
}

// -------------------------------------------------------------------------
// VT-4A1 — exact A2 chassis with an independent low chevron turret
// -------------------------------------------------------------------------

function buildVT4A1Hull(P: FrontlinePort): void {
  // The owner-requested VT-4A1 chassis is the certified ZTZ-99A2 chassis,
  // including its running gear, lofted hull, glacis, fenders, skirts, rear
  // deck, transom and fuel-rack structure. Keeping one shared builder makes
  // that relationship exact and prevents either hull from silently drifting.
  buildZTZ99A2Hull(P as unknown as ChinaBuilderPort);
}

type VtFamilyVariant = 'vt4a1' | 'type99a';

interface VtFamilyTurretConfig {
  readonly variant: VtFamilyVariant;
  readonly pivotY: number;
  readonly pivotZ: number;
  readonly heightScale: number;
  readonly widthScale: number;
  readonly depthScale: number;
  readonly chevronDepthScale: number;
  readonly frontShellLengthScale: number;
  readonly chevronInnerAdvanceM: number;
  readonly chevronOuterAdvanceM: number;
  readonly chevronLiftM: number;
  readonly rearExtensionM: number;
  readonly rearUndersideLiftM: number;
  readonly rearCrownLiftM: number;
  readonly gunY: number;
  readonly gunZ: number;
  readonly gunLength: number;
}

const VT_FAMILY_TURRETS: Readonly<Record<VtFamilyVariant, VtFamilyTurretConfig>> = Object.freeze({
  vt4a1: Object.freeze({
    variant: 'vt4a1', pivotY: 1.56, pivotZ: 0.40,
    heightScale: 0.82, widthScale: 1, depthScale: 1, chevronDepthScale: 1,
    frontShellLengthScale: 1,
    chevronInnerAdvanceM: 0, chevronOuterAdvanceM: 0, chevronLiftM: 0.07,
    rearExtensionM: 0, rearUndersideLiftM: 0, rearCrownLiftM: 0,
    gunY: 0.3198,
    gunZ: 0.75, gunLength: 5.95,
  }),
  type99a: Object.freeze({
    variant: 'type99a', pivotY: 1.57, pivotZ: 0.64,
    heightScale: 0.82, widthScale: 0.96, depthScale: 0.94, chevronDepthScale: 0.94,
    frontShellLengthScale: 0.90,
    chevronInnerAdvanceM: 0.18, chevronOuterAdvanceM: 0.04, chevronLiftM: 0,
    rearExtensionM: 0.50, rearUndersideLiftM: 0.42, rearCrownLiftM: 0.10,
    gunY: 0.3198,
    gunZ: 0.74, gunLength: 6.454,
  }),
});

function buildVtFamilyChevronTurret(P: FrontlinePort, config: VtFamilyTurretConfig): void {
  const { box, cylY, polyMultiLoft, torus } = KIT;
  const { variant, heightScale, widthScale, depthScale } = config;
  const heightRatio = heightScale / 0.75;
  const roofLift = 0.89 * heightScale - 0.6675;
  const sx = (value: number): number => value * widthScale;
  const sz = (value: number): number => value * depthScale;
  const cz = (value: number): number => value * config.chevronDepthScale;
  const sy = (value: number): number => value * heightRatio;
  const rearProgress = (value: number): number => THREE.MathUtils.clamp(
    (-value - 1.58) / (2.68 - 1.58), 0, 1,
  );
  // Shorten only the selected forward shell course around the cheek; the
  // bustle and turret-ring footprint retain their established dimensions.
  // Compressing toward the sidewall station (z=-0.58) avoids the global
  // depth-scale shortcut that would also shrink the rear bustle.
  const shellZ = (value: number): number => sz(value >= -0.58
    ? -0.58 + (value + 0.58) * config.frontShellLengthScale
    : value);
  const rearZ = (value: number): number => (
    shellZ(value) - config.rearExtensionM * rearProgress(value)
  );
  const rearBottomY = (value: number, z: number): number => (
    sy(value) + config.rearUndersideLiftM * rearProgress(z)
  );
  const rearTopY = (value: number, z: number): number => (
    sy(value) + config.rearCrownLiftM * rearProgress(z)
  );
  P.turretG.position.set(0, config.pivotY, config.pivotZ);
  P.gunG.position.set(0, config.gunY, config.gunZ);
  const basePlan: [number, number][] = [
    // The armored shell stops behind the arrow ridge so the chevrons are the
    // actual turret front, not applique over a second protruding nose. The
    // long rear stations form a proper integral bustle at the same time.
    [0.52, 0.48], [1.08, 0.22], [1.46, -0.10], [1.60, -0.58],
    [1.54, -1.58], [1.38, -2.22], [0.82, -2.48], [0.52, -2.52],
    [-0.52, -2.52], [-0.82, -2.48], [-1.38, -2.22], [-1.54, -1.58],
    [-1.60, -0.58], [-1.46, -0.10], [-1.08, 0.22], [-0.52, 0.48],
  ];
  const plan: [number, number][] = basePlan.map(([x, z]) => [sx(x), rearZ(z)]);
  const lowerHeights = basePlan.map(([, z]) => 0.02
    + config.rearUndersideLiftM * rearProgress(z));
  const midHeights = [0.34, 0.40, 0.48, 0.55, 0.62, 0.66, 0.67, 0.67,
    0.67, 0.67, 0.66, 0.62, 0.55, 0.48, 0.40, 0.34].map((height, index) => (
    height * heightScale + config.rearCrownLiftM * rearProgress(basePlan[index][1])
  ));
  const shellHeight = 0.89 * heightScale;
  if (config.rearUndersideLiftM > 0) {
    P.add('turretDark', polyMultiLoft(plan, [
      { height: lowerHeights.map((height) => height - 0.025), inset: 0.985 },
      { height: lowerHeights.map((height) => height + 0.035), inset: 0.970 },
    ]));
  } else {
    P.add('turretDark', KIT.polyTurret(plan, 0.09, 0.97, 0.98), 0, -0.04, 0);
  }
  P.add('turret', polyMultiLoft(plan, [
    { height: lowerHeights, inset: 1.00 },
    { height: midHeights, inset: 1.00 },
    { height: shellHeight,
      inset: [0.66, 0.72, 0.80, 0.87, 0.91, 0.94, 0.95, 0.95,
        0.95, 0.95, 0.94, 0.91, 0.87, 0.80, 0.72, 0.66],
      centerHeight: shellHeight },
  ]));
  P.add('turret', cylY(sx(1.10), sx(1.16), 0.11, P.q ? 20 : 14), 0, -0.04, shellZ(-0.30));
  // A low roof bridge overlaps the primary shell and the inner chevron roots.
  P.add('turret', orientedSlab(
    [sx(-0.80), sy(0.59), shellZ(0.48)], [sx(0.80), sy(0.59), shellZ(0.48)],
    [sx(1.18), rearTopY(0.60, -2.30), rearZ(-2.30)],
    [sx(-1.18), rearTopY(0.60, -2.30), rearZ(-2.30)],
    [sx(-0.68), sy(0.69), shellZ(0.34)], [sx(0.68), sy(0.69), shellZ(0.34)],
    [sx(1.03), rearTopY(0.70, -2.26), rearZ(-2.26)],
    [sx(-1.03), rearTopY(0.70, -2.26), rearZ(-2.26)],
  ));
  // Leopard-style chevrons now provide the complete frontal volume. Their
  // outer stations penetrate the shell shoulder and their inner stations
  // close around the gun throat, leaving no legacy frontal wedge underneath.
  const chevronStations = Object.freeze(([
    { x: 0.22, upperX: 0.22, ridgeX: 0.22, lowerX: 0.22,
      upperY: 0.615, upperZ: 0.46, ridgeY: 0.300, ridgeZ: 1.68, lowerY: 0.030, lowerZ: 0.78 },
    { x: 0.38, upperX: 0.34, ridgeX: 0.38, lowerX: 0.40,
      upperY: 0.615, upperZ: 0.39, ridgeY: 0.300, ridgeZ: 1.61, lowerY: 0.030, lowerZ: 0.79 },
    { x: 0.82, upperX: 0.62, ridgeX: 0.82, lowerX: 0.78,
      upperY: 0.608, upperZ: 0.14, ridgeY: 0.293, ridgeZ: 1.36, lowerY: 0.030, lowerZ: 0.68 },
    { x: 1.18, upperX: 0.86, ridgeX: 1.18, lowerX: 1.18,
      upperY: 0.593, upperZ: -0.12, ridgeY: 0.278, ridgeZ: 1.10, lowerY: 0.038, lowerZ: 0.44 },
    { x: 1.50, upperX: 1.04, ridgeX: 1.50, lowerX: 1.58,
      upperY: 0.570, upperZ: -0.40, ridgeY: 0.255, ridgeZ: 0.82, lowerY: 0.053, lowerZ: 0.30 },
    // The terminal cap is the physical side join. Its rear upper/lower roots
    // now finish inside the x=1.46..1.60 turret wall instead of both ending
    // ahead of it; the cap therefore closes the former daylight seam on
    // either side while the ridge remains the visible arrow shoulder.
    { x: 1.68, upperX: 1.48, ridgeX: 1.68, lowerX: 1.60,
      upperY: 0.560, upperZ: -0.54, ridgeY: 0.245, ridgeZ: 0.54, lowerY: 0.075, lowerZ: -0.12 },
  ] satisfies readonly ChevronStation[]).map((station) => ({
    ...station,
    x: sx(station.x),
    upperX: sx(station.upperX), ridgeX: sx(station.ridgeX), lowerX: sx(station.lowerX),
    upperY: sy(station.upperY) + config.chevronLiftM,
    ridgeY: sy(station.ridgeY) + config.chevronLiftM,
    lowerY: sy(station.lowerY) + config.chevronLiftM,
    ...(() => {
      const progress = THREE.MathUtils.clamp((station.x - 0.22) / (1.68 - 0.22), 0, 1);
      const advance = THREE.MathUtils.lerp(
        config.chevronInnerAdvanceM, config.chevronOuterAdvanceM, progress);
      return {
        upperZ: cz(station.upperZ) + advance,
        ridgeZ: cz(station.ridgeZ) + advance,
        lowerZ: cz(station.lowerZ) + advance,
      };
    })(),
  })));
  const panelBands = Object.freeze([
    [0.055, 0.270], [0.300, 0.505], [0.535, 0.755], [0.785, 0.955],
  ] as const);
  P.visualEraCluster(`${variant}-integrated-chevron-front`, 'turret', () => {
    for (const side of [-1, 1] as const) {
      P.addExternalArmor('turret', closedIntegratedChevron(chevronStations, side));
      for (const [startT, endT] of panelBands) {
        const startX = THREE.MathUtils.lerp(chevronStations[0].x,
          chevronStations.at(-1)!.x, startT);
        const endX = THREE.MathUtils.lerp(chevronStations[0].x,
          chevronStations.at(-1)!.x, endT);
        P.addExternalArmor('turret', chevronSurfacePanel(
          interpolateChevronStation(chevronStations, startX),
          interpolateChevronStation(chevronStations, endX),
          side,
        ));
      }
    }
  });
  addChinese125Gun(P, {
    length: config.gunLength,
    rootR: variant === 'type99a' ? 0.26 : 0.25,
    sleeveStart: variant === 'type99a' ? 1.68 : 1.55,
    sleeveEnd: variant === 'type99a' ? 3.86 : 3.62,
  });

  // The bustle is structural volume, not a detached basket. These overlapping
  // armored panniers continue the primary shell to a deep rear service wall;
  // the racks and bins below are all seated on those volumes.
  P.visualEraCluster(`${variant}-integral-bustle`, 'turret', () => {
    for (const side of [-1, 1] as const) {
      P.addExternalArmor('turret', orientedSlab(
        [side * sx(0.54), rearBottomY(0.08, -1.76), rearZ(-1.76)],
        [side * sx(1.38), rearBottomY(0.10, -1.66), rearZ(-1.66)],
        [side * sx(1.42), rearBottomY(0.12, -2.56), rearZ(-2.56)],
        [side * sx(0.52), rearBottomY(0.10, -2.68), rearZ(-2.68)],
        [side * sx(0.48), rearTopY(0.60, -1.76), rearZ(-1.76)],
        [side * sx(1.20), rearTopY(0.58, -1.72), rearZ(-1.72)],
        [side * sx(1.24), rearTopY(0.54, -2.52), rearZ(-2.52)],
        [side * sx(0.46), rearTopY(0.57, -2.66), rearZ(-2.66)],
      ));
      P.addEquipment('turret', box(sx(0.30), sy(0.34), sz(0.58)),
        side * sx(1.22), rearTopY(0.40, -2.28), rearZ(-2.28));
      P.add('turretDark', box(sx(0.32), 0.036, sz(0.62)),
        side * sx(1.22), rearTopY(0.58, -2.28), rearZ(-2.28));
      P.add('turretDetail', box(0.035, sy(0.42), 0.035),
        side * sx(1.40), rearBottomY(0.35, -2.58), rearZ(-2.58));
    }
    P.addExternalArmor('turret', orientedSlab(
      [-sx(0.67), rearBottomY(0.11, -2.23), rearZ(-2.23)],
      [sx(0.67), rearBottomY(0.11, -2.23), rearZ(-2.23)],
      [sx(0.64), rearBottomY(0.10, -2.70), rearZ(-2.70)],
      [-sx(0.64), rearBottomY(0.10, -2.70), rearZ(-2.70)],
      [-sx(0.62), rearTopY(0.57, -2.23), rearZ(-2.23)],
      [sx(0.62), rearTopY(0.57, -2.23), rearZ(-2.23)],
      [sx(0.58), rearTopY(0.57, -2.70), rearZ(-2.70)],
      [-sx(0.58), rearTopY(0.57, -2.70), rearZ(-2.70)],
    ));
  });
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: sx(2.65), d: sz(0.62), h: sy(0.48), posts: 8,
    fill: 0.78, rails: 3, mesh: false, rotation: [0, Math.PI, 0],
    seed: variant === 'type99a' ? 9940 : 438,
  }), [0, rearBottomY(0.14, -2.78), rearZ(-2.78)]);

  // Roof equipment is re-seated to the lower 3/4-height crown. Sights,
  // warning heads and the RWS preserve their own dimensions but no longer
  // hover at the old full-height roof datum.
  const sightX = variant === 'type99a' ? -0.56 : -0.50;
  const sightZ = variant === 'type99a' ? 0.06 : 0.16;
  P.addEquipment('turret', box(0.44, 0.34, 0.40), sightX, 0.83 + roofLift, sightZ, 0, -0.05, 0);
  P.addModuleVisual('optics', 'turretGlass', box(0.25, 0.17, 0.020),
    sightX, 0.85 + roofLift, sightZ + 0.21, 0, -0.05, 0);
  P.addEquipment('turret', box(0.48, 0.18, 0.43), 0.47, 0.78 + roofLift, -0.02);
  P.add('turretDark', torus(0.22, 0.016, 18), 0.47, 0.88 + roofLift, -0.02,
    Math.PI / 2, 0, 0);
  addSmokeAndWarningSuite(P, {
    warningX: sx(variant === 'type99a' ? 1.08 : 1.02),
    warningZ: sz(variant === 'type99a' ? -1.38 : -1.52),
    warningY: 0.72 + roofLift,
    smokeX: sx(variant === 'type99a' ? 1.24 : 1.18),
    smokeZ: sz(variant === 'type99a' ? -0.18 : -0.08),
    smokeY: sy(variant === 'type99a' ? 0.42 : 0.39),
  });
  if (variant === 'vt4a1') {
    mount(P, 'turret', FITTINGS.openYokeRws({
      mats: P.mats, bodySlot: 'turret', sizeStandard: 'k2b-compact-tower',
      scale: 0.70, towerRise: 0.08, variant: 'korean-twin', sensorHead: true,
      sensorMount: 'roof', weapon: true, caliberMm: 12.7,
      weaponName: 'QJC-88 remote weapon station', seed: 430,
    }), [0.38, 0.73 + roofLift, -0.86], [0, 0.03, 0]);
    P.addEquipment('turret', box(0.38, 0.15, 0.32), 0.38, 0.69 + roofLift, -0.86);
  } else {
    // Type 99A derivative keeps the same roof load path but a distinct PLA
    // commander station. The broad pedestal, armored panoramic cabinet and
    // cap are one continuous seated stack; this restores the Type 99A's tall
    // command silhouette without reintroducing its discarded legacy turret.
    P.addEquipment('turret', box(0.42, 0.12, 0.40), 0.48, 0.75 + roofLift, -0.72);
    P.add('turretDark', torus(0.19, 0.014, 18), 0.48, 0.83 + roofLift, -0.72,
      Math.PI / 2, 0, 0);
    mount(P, 'turret', FITTINGS.pintleMG({
      mats: P.mats, cls: 'nsvt', tone: 'two-tone', scale: 0.72,
      ammo: true, elev: 0.03, rotation: [0, 0.08, 0], seed: 9944,
    }), [0.48, 0.82 + roofLift, -0.62]);
    P.addEquipment('turret', box(0.48, 0.30, 0.44), 0.72, 0.82 + roofLift, -1.06);
    P.addEquipment('turret', box(0.46, 0.36, 0.42), 0.72, 1.12 + roofLift, -1.06,
      0, -0.03, 0);
    P.add('turretDark', box(0.38, 0.11, 0.035), 0.72, 1.12 + roofLift, -0.835);
    P.addModuleVisual('optics', 'turretGlass', box(0.30, 0.075, 0.018),
      0.72, 1.12 + roofLift, -0.814);
    P.addEquipment('turret', cylY(0.055, 0.065, 0.31, 12),
      0.72, 1.47 + roofLift, -1.06);
    P.addEquipment('turret', box(0.34, 0.18, 0.34),
      0.72, 1.65 + roofLift, -1.06, 0, -0.03, 0);
    P.addModuleVisual('optics', 'turretGlass', box(0.22, 0.075, 0.018),
      0.72, 1.65 + roofLift, -0.878);
    P.add('turretDetail', cylY(0.025, 0.032, 0.22, 10),
      0.72, 1.85 + roofLift, -1.06);
  }
  for (const side of [-1, 1] as const) {
    mount(P, 'turret', FITTINGS.stowageRack({
      mats: P.mats, w: sz(1.38), d: sx(0.42), h: sy(0.34), rails: 3, fill: 0.58,
      seed: (variant === 'type99a' ? 9950 : 432) + side,
    }), [side * sx(1.28), rearTopY(0.35, -1.94), rearZ(-1.94)], [0, side * Math.PI / 2, 0]);
    mount(P, 'turret', FITTINGS.antennaWhip({
      mats: P.mats, h: side < 0 ? 1.18 : 1.05, r: 0.011,
      seed: (variant === 'type99a' ? 9960 : 434) + side,
    }), [side * sx(0.76), 0.70 + roofLift + config.rearCrownLiftM * rearProgress(-2.12),
      rearZ(-2.12)]);
  }
  const marking = variant === 'type99a' ? '99A' : 'VT4';
  P.decal('turret', 'number', marking, 0.23,
    [-sx(1.59), sy(0.36), sz(-0.72)], -Math.PI / 2);
  P.decal('turret', 'number', marking, 0.23,
    [sx(1.59), sy(0.36), sz(-0.72)], Math.PI / 2);
  P.topY = Math.max(P.topY || 0, variant === 'type99a' ? 2.12 : 1.28);

  const commonReceipt = Object.freeze({
    architecture: 'vt-integrated-chevron-family-r4',
    variant, pivotLocalM: Object.freeze([0, config.pivotY, config.pivotZ]),
    pivotShiftForwardM: variant === 'vt4a1' ? 0.55 : 0.66,
    turretHeightScale: heightScale, primaryShellHeightM: shellHeight,
    widthScale, depthScale, chevronDepthScale: config.chevronDepthScale,
    frontShellLengthScale: config.frontShellLengthScale,
    chevronInnerAdvanceM: config.chevronInnerAdvanceM,
    chevronOuterAdvanceM: config.chevronOuterAdvanceM,
    chevronLiftM: config.chevronLiftM,
    rearExtensionM: config.rearExtensionM,
    rearUndersideLiftM: config.rearUndersideLiftM,
    rearCrownLiftM: config.rearCrownLiftM,
    integratedChevronFront: true,
    chevronsArePrimaryFront: true, chevronTerminalBuriedInSideBelt: true,
    mirroredChevronSideJoins: true, chevronSideJoinGapM: 0,
    chevronProfile: 'leopard-2a6-derived', sharedPhysicalRidge: true,
    surfacePanelsPerSide: 4, compoundShoulderTerminal: true,
    gunCenterlineLocalY: config.gunY,
    muzzleWorldZM: config.pivotZ + config.gunZ + config.gunLength,
    warningSensorPedestals: 2, reseatedRoofEquipment: true,
    armoredBustleRearZM: rearZ(-2.68), giantIntegratedBustle: true,
  });
  P.turretG.userData.vtFamilyTurretReceipt = commonReceipt;
  if (variant === 'vt4a1') {
    P.turretG.userData.vt4a1TurretReceipt = Object.freeze({
      ...commonReceipt,
      independentTurret: true, previousTurretHeightScale: 0.75,
      previousPrimaryShellHeightM: 0.6675, slightlyTallerTurret: true,
      forwardCenteredTurret: true, legacyFrontalWedgeRemoved: true,
      upperSlopeDeg: 19, dominantUpperChevron: true,
      upperRootSetbackM: 1.22, lowerReturnMaxSetbackM: 0.90,
      roofRws: true, supportedBustleCages: true,
    });
  } else {
    P.turretG.userData.type99aVtDerivativeReceipt = Object.freeze({
      ...commonReceipt,
      derivativeOf: 'vt4a1', independentGeometry: true,
      previousTurretHeightScale: 1.12, matchedVt4a1TurretHeight: true,
      legacyType99aTurretRemoved: true, oldTurretEquipmentRemoved: true,
      turretEquipmentReseated: true, dedicatedPlaCommanderStation: true,
      continuousCommanderSightStack: true, commandSightTopWorldYM: 3.55,
      exactHullRetained: true, selectedForwardCheekShorteningPct: 10,
      turretMovedForwardM: 0.42, turretRaisedM: 0.09,
      slopedBustleUnderside: true, rearHullOverlapEliminated: true,
      minimumRearDeckClearanceM: 0.02,
      chevronsReseatedForward: true,
    });
  }
}

function buildVT4A1Turret(P: FrontlinePort): void {
  buildVtFamilyChevronTurret(P, VT_FAMILY_TURRETS.vt4a1);
}

function buildVT4A1(P: FrontlinePort): void {
  buildVT4A1Hull(P);
  buildVT4A1Turret(P);
  // All primary widths are authored at their installed dimensions.
  const installedWidthScale = 1;
  P.decal('hull', 'number', P.spec.visual.number || '401', 0.25, [1.82, 1.30, 0.84], Math.PI / 2);
  if (P.geometryReceipt) {
    P.hullG.userData.vt4a1GeometryReceipt = Object.freeze({
      exactHullCloneOf: 'ztz99a2', sourceGeometryImported: false,
      measuredEnvelopeM: Object.freeze([7.60, 3.70, 2.45]),
      installedWidthScale, installedTrackWidthM: 0.63,
      roadWheelsPerSide: 6, sharedHullBuilder: 'buildZTZ99A2Hull',
      fenderRunsJoined: true, comparisonRegistry: 'ztz99a2',
      qualityGateFloor: 92, duplicateTrackMeshes: 0,
    });
  }
}

function buildType99AWithVtDerivative(P: FrontlinePort): void {
  buildType99AHullOnly(P as never);
  addRearFuelDrums(P as unknown as ChinaBuilderPort, 1.56, -3.68, 9910, {
    radius: 0.25, length: 1.12, centerX: 0.61, cradleDepth: 0.34,
    rearPlateZ: -3.52,
  });
  buildVtFamilyChevronTurret(P, VT_FAMILY_TURRETS.type99a);
}

export const CHINESE_FRONTLINE_PROFILES = Object.freeze({
  vt4a1: Object.freeze({ build: buildVT4A1 }),
  type99a: Object.freeze({ build: buildType99AWithVtDerivative }),
}) satisfies VehicleProfileRecord;
