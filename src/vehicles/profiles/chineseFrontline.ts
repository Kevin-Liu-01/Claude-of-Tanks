// First-party VT-4A1 construction on the exact ZTZ-99A2 chassis.
//
// The supplied VT-4A1 GLB remains a comparison instrument only. Playable
// geometry comes from the shared procedural A2 hull and a new lower,
// deep-bustle VT turret authored in the game's native +Z-forward frame.

import {addChineseThroatStock,addChineseMovingMantlet} from './chineseGunOpening.ts';
import { tankSeedId } from '../tankIdAliases.ts';
import * as THREE from 'three';
import { KIT, FITTINGS, orientedSlab, muzzleTipDot } from './kit.ts';
import {
  chevronSurfacePanel,
  chineseArrowCassette,
  closedIntegratedChevron,
  interpolateChevronStation,
  type ChevronStation,
} from './chineseChevron.ts';
import { buildZTZ99A2Hull, type ChinaBuilderPort } from './china.ts';
import { buildLongwei } from './longwei.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { TYPE100_PROFILES } from './type100.ts';
import { ZTZ20_PROFILES } from './ztz20.ts';
import { ZTZ100_PROTOTYPE_PROFILES } from './ztz100Prototype.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';

type Vec3 = [number, number, number];
type Owner = 'hull' | 'turret';

interface FrontlinePort extends ChinaBuilderPort {}

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
  // cylZ maps its first radius to the +Z/front cap and its second radius to
  // the -Z/turret cap. Keep both frustums broad where they enter the turret
  // and narrow toward the barrel; the former ordering inverted that taper.
  P.addGunExtraDark(cylZ(config.rootR * 0.98, 0.18, P.q ? 12 : 8,
    config.rootR * 1.05), 0, 0, 0.09);
  P.addGunExtra(cylZ(config.rootR * 0.56, 0.68, P.q ? 12 : 8,
    config.rootR * 0.94), 0, 0, 0.47);
  P.addGunExtraDark(cylZ(config.rootR * 0.59, 0.08, 12), 0, 0, 0.85);
  if(P.spec.id==='vt4a1'){
    P.clear('gunMount','gunMountDark');addChineseMovingMantlet(P,.39,.98);
  }
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
  buildZTZ99A2Hull(P);
}

type VtFamilyVariant = 'vt4a1';

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
    // release 240 (the gun-hull lane): the bustle's underside rises aft as the ZTZ-99A2's does, so it clears the engine
    // deck and its louvres as the turret traverses (it ran flat at 0.02, under the deck)
    rearExtensionM: 0, rearUndersideLiftM: 0.30, rearCrownLiftM: 0,
    gunY: 0.3198,
    gunZ: 0.75, gunLength: 5.95,
  }),
});

function addVtFamilyChevronFoundation(P: FrontlinePort, config: VtFamilyTurretConfig): void {
  const { box, cylY, polyMultiLoft } = KIT;
  const { variant, heightScale, widthScale, depthScale } = config;
  const heightRatio = heightScale / 0.75;
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
  const shell = polyMultiLoft(plan, [
    { height: lowerHeights, inset: 1.00 },
    { height: midHeights, inset: 1.00 },
    { height: shellHeight,
      inset: [0.66, 0.72, 0.80, 0.87, 0.91, 0.94, 0.95, 0.95,
        0.95, 0.95, 0.94, 0.91, 0.87, 0.80, 0.72, 0.66],
      centerHeight: shellHeight },
  ]);
  if (variant === 'vt4a1') addChineseThroatStock(P, shell); else P.add('turret', shell);
  P.add('turret', cylY(sx(1.10), sx(1.16), 0.11, P.q ? 20 : 14), 0, -0.04, shellZ(-0.30));
  // A low roof bridge overlaps the primary shell and the inner chevron roots.
  const bridge = orientedSlab(
    [sx(-0.80), sy(0.59), shellZ(0.48)], [sx(0.80), sy(0.59), shellZ(0.48)],
    [sx(1.18), rearTopY(0.60, -2.30), rearZ(-2.30)],
    [sx(-1.18), rearTopY(0.60, -2.30), rearZ(-2.30)],
    [sx(-0.68), sy(0.69), shellZ(0.34)], [sx(0.68), sy(0.69), shellZ(0.34)],
    [sx(1.03), rearTopY(0.70, -2.26), rearZ(-2.26)],
    [sx(-1.03), rearTopY(0.70, -2.26), rearZ(-2.26)],
  );
  if (variant === 'vt4a1') addChineseThroatStock(P, bridge); else P.add('turret', bridge);
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
  // The closed chevron is the welded carrier/front casting. It must survive
  // an ERA detonation; only the raised surface cassettes belong to the visual
  // ERA cluster. Keeping the carrier in the primary turret also prevents the
  // spent state from exposing the deliberately truncated shell behind it.
  for (const side of [-1, 1] as const) {
    const stock=closedIntegratedChevron(chevronStations, side);
    if (variant==='vt4a1') addChineseThroatStock(P,stock); else P.add('turret',stock);
  }
  P.visualEraCluster(`${tankSeedId(variant)}-integrated-chevron-front`, 'turret', () => { // schema-1 name (tankIdAliases.ts)
    for (const side of [-1, 1] as const) {
      for (const [startT, endT] of panelBands) {
        const startX = THREE.MathUtils.lerp(chevronStations[0].x,
          chevronStations.at(-1)!.x, startT);
        const endX = THREE.MathUtils.lerp(chevronStations[0].x,
          chevronStations.at(-1)!.x, endT);
        const panel=variant==='vt4a1'?chineseArrowCassette(chevronStations,side,startX,endX):chevronSurfacePanel(
          interpolateChevronStation(chevronStations, startX),
          interpolateChevronStation(chevronStations, endX),
          side,
        );
        if(variant==='vt4a1')addChineseThroatStock(P,panel,'turretExternalArmor');
        else P.addExternalArmor('turret',panel);
      }
    }
  });
  addChinese125Gun(P, {
    length: config.gunLength,
    rootR: 0.25,
    sleeveStart: 1.55,
    sleeveEnd: 3.62,
  });

  // The bustle is structural volume, not a detached basket. These overlapping
  // armored panniers continue the primary shell to a deep rear service wall;
  // the racks and bins below are all seated on those volumes.
  {
    for (const side of [-1, 1] as const) {
      P.add('turret', orientedSlab(
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
    P.add('turret', orientedSlab(
      [-sx(0.67), rearBottomY(0.11, -2.23), rearZ(-2.23)],
      [sx(0.67), rearBottomY(0.11, -2.23), rearZ(-2.23)],
      [sx(0.64), rearBottomY(0.10, -2.70), rearZ(-2.70)],
      [-sx(0.64), rearBottomY(0.10, -2.70), rearZ(-2.70)],
      [-sx(0.62), rearTopY(0.57, -2.23), rearZ(-2.23)],
      [sx(0.62), rearTopY(0.57, -2.23), rearZ(-2.23)],
      [sx(0.58), rearTopY(0.57, -2.70), rearZ(-2.70)],
      [-sx(0.58), rearTopY(0.57, -2.70), rearZ(-2.70)],
    ));
  }
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: sx(2.65), d: sz(0.62), h: sy(0.48), posts: 8,
    fill: 0.78, rails: 3, mesh: false, rotation: [0, Math.PI, 0],
    seed: 438,
  }), [0, rearBottomY(0.14, -2.78), rearZ(-2.78)]);
}

/**
 * A flat-faced machined ring race (rectangular section with chamfered top edges) seated with its underside at `y`, in
 * the fitting paint, with `bolts` dark bolt heads round its face (tank-accessories round 4, 2026-10-07).
 */
function addMachinedRace(P: FrontlinePort, rIn: number, rOut: number, h: number, x: number, y: number, z: number,
  bolts: number): void {
  const c = Math.min(0.004, (rOut - rIn) * 0.3);
  const race = new THREE.LatheGeometry([[rIn, 0], [rOut, 0], [rOut, h - c], [rOut - c, h], [rIn + c, h], [rIn, h - c], [rIn, 0]]
    .map(([r, yy]) => new THREE.Vector2(r, yy)), P.q ? 32 : 18);
  P.add('turretDetail', race, x, y, z);
  const rm = (rIn + rOut) / 2;
  for (let k = 0; k < bolts; k++) {
    const a = (k + 0.5) * (Math.PI * 2 / bolts);
    P.add('turretDark', KIT.cylY(0.006, 0.006, 0.006, 6), x + Math.cos(a) * rm, y + h + 0.002, z + Math.sin(a) * rm);
  }
}

function addVtFamilyChevronRoof(P: FrontlinePort, config: VtFamilyTurretConfig): void {
  const { box } = KIT;
  const { variant, heightScale, widthScale, depthScale } = config;
  const heightRatio = heightScale / 0.75;
  const roofLift = 0.89 * heightScale - 0.6675;
  const sx = (value: number): number => value * widthScale;
  const sz = (value: number): number => value * depthScale;
  const sy = (value: number): number => value * heightRatio;
  const rearProgress = (value: number): number => THREE.MathUtils.clamp(
    (-value - 1.58) / (2.68 - 1.58), 0, 1,
  );
  const shellZ = (value: number): number => sz(value >= -0.58
    ? -0.58 + (value + 0.58) * config.frontShellLengthScale
    : value);
  const rearZ = (value: number): number => (
    shellZ(value) - config.rearExtensionM * rearProgress(value)
  );
  const rearTopY = (value: number, z: number): number => (
    sy(value) + config.rearCrownLiftM * rearProgress(z)
  );

  // Roof equipment is re-seated to the lower 3/4-height crown. Sights,
  // warning heads and the RWS preserve their own dimensions but no longer
  // hover at the old full-height roof datum.
  const sightX = -0.50;
  const sightZ = 0.16;
  P.addEquipment('turret', box(0.44, 0.34, 0.40), sightX, 0.83 + roofLift, sightZ, 0, -0.05, 0);
  P.addModuleVisual('optics', 'turretGlass', box(0.25, 0.17, 0.020),
    sightX, 0.85 + roofLift, sightZ + 0.21, 0, -0.05, 0);
  P.addEquipment('turret', box(0.48, 0.18, 0.43), 0.47, 0.78 + roofLift, -0.02);
  // KIT.torus already lies flat; the extra quarter turn stood this hatch ring on edge as a 0.44 m hoop over the roof
  // (round 3, 2026-10-07: it framed the commander's gun in the critics' stow view and trapped interior-fill boxes)
  // 2026-10-07 (round 4, wave 215: "the dark rings on the hatch and round the MG pedestal read as loose rubber hoses,
  // not machined ring mounts"): the round dark tube becomes a flat machined race seated on the hatch block, in the
  // fitting paint, with its bolt circle.
  addMachinedRace(P, 0.178, 0.208, 0.014, 0.47, 0.87 + roofLift, -0.02, 10);
  addSmokeAndWarningSuite(P, {
    warningX: sx(1.02),
    warningZ: sz(-1.52),
    warningY: 0.72 + roofLift,
    smokeX: sx(1.18),
    smokeZ: sz(-0.08),
    smokeY: sy(0.39),
  });
  if (variant === 'vt4a1') {
    mount(P, 'turret', FITTINGS.openYokeRws({
      mats: P.mats, bodySlot: 'hull', sizeStandard: 'k2b-compact-tower',
      scale: 0.70, towerRise: 0.08, variant: 'korean-twin', sensorHead: true,
      sensorMount: 'roof', weapon: true, caliberMm: 12.7, cls: 'qjc88',
      weaponName: 'QJC-88 remote weapon station', seed: 430,
    }), [0.38, 0.73 + roofLift, -0.86], [0, 0.03, 0]);
    P.addEquipment('turret', box(0.38, 0.15, 0.32), 0.38, 0.69 + roofLift, -0.86);
  }
  for (const side of [-1, 1] as const) {
    mount(P, 'turret', FITTINGS.stowageRack({
      mats: P.mats, w: sz(1.38), d: sx(0.42), h: sy(0.34), rails: 3, fill: 0.58,
      seed: 432 + side,
    }), [side * sx(1.28), rearTopY(0.35, -1.94), rearZ(-1.94)], [0, side * Math.PI / 2, 0]);
    mount(P, 'turret', FITTINGS.antennaWhip({
      mats: P.mats, h: side < 0 ? 1.18 : 1.05, r: 0.011,
      seed: 434 + side,
    }), [side * sx(0.76), 0.70 + roofLift + config.rearCrownLiftM * rearProgress(-2.12),
      rearZ(-2.12)]);
  }
  const marking = 'VT4';
  P.decal('turret', 'number', marking, 0.23,
    [-sx(1.59), sy(0.36), sz(-0.72)], -Math.PI / 2);
  P.decal('turret', 'number', marking, 0.23,
    [sx(1.59), sy(0.36), sz(-0.72)], Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.28);
}

function addVtFamilyChevronReceipt(P: FrontlinePort, config: VtFamilyTurretConfig): void {
  const { variant, heightScale, widthScale, depthScale } = config;
  const sz = (value: number): number => value * depthScale;
  const rearProgress = (value: number): number => THREE.MathUtils.clamp(
    (-value - 1.58) / (2.68 - 1.58), 0, 1,
  );
  const shellZ = (value: number): number => sz(value >= -0.58
    ? -0.58 + (value + 0.58) * config.frontShellLengthScale
    : value);
  const rearZ = (value: number): number => (
    shellZ(value) - config.rearExtensionM * rearProgress(value)
  );
  const shellHeight = 0.89 * heightScale;

  const commonReceipt = Object.freeze({
    architecture: 'vt-integrated-chevron-family-r5',
    variant, pivotLocalM: Object.freeze([0, config.pivotY, config.pivotZ]),
    pivotShiftForwardM: 0.55,
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
    permanentChevronCarriers: 2, detonatingChevronFacePanels: 8,
    spentStateRetainsClosedFront: true,
    permanentArmoredBustle: true,
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
  }
}

/** The VT4A1 a stage a slice (UI-LOCKDOWN E): the hull, the turret's foundation, its roof (the open-yoke station), the
 *  receipt and markings. */
const buildVT4A1 = steppedBuilder(function* (P: FrontlinePort): TankProfileBuild {
  buildVT4A1Hull(P);
  yield 'hull';
  const config = VT_FAMILY_TURRETS.vt4a1;
  addVtFamilyChevronFoundation(P, config);
  yield 'turret-foundation';
  addVtFamilyChevronRoof(P, config);
  yield 'turret-roof';
  addVtFamilyChevronReceipt(P, config);
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
});

export const CHINESE_FRONTLINE_PROFILES = Object.freeze({
  vt4a1: Object.freeze({ build: buildVT4A1 }),
  ztz99_longwei: Object.freeze({ build: buildLongwei }),
  ...TYPE100_PROFILES,
  ...ZTZ20_PROFILES,
  ...ZTZ100_PROTOTYPE_PROFILES,
}) satisfies VehicleProfileRecord;
