// Release 268, the twin-cannon air-defence round (owner 2026-11-02, "we should add more double barrel vehicels"): the
// PLA's PGZ-95 (Type 95 SPAAA, four 25 mm and four QW-2) and PGZ-09 (Type 09 SPAAA, twin 35 mm)
// (docs/references/tanks/pgz95.md, pgz09.md).
//
// The combat rows (hit points, mobility, the guns' rounds and handling, the QW-2) are the registrar's final intent; the
// armour envelope, the modules, the crew and every spatial datum follow the measured builds (profiles/chineseAirDefense.ts
// on profiles/plaAirDefenseChassis.ts), read from the one layout both share (profiles/chineseAirDefenseLayout.ts). Both
// hulls are light: welded high-hardness steel against small arms and splinters, the PGZ-09's frontal arc against 14.5 mm
// (Wikipedia; Army Technology). Combat numbers are game tuning on published figures, not weapon specifications.
// First-party: Kevin B. Liu (NOTICE.md).
import './afvFamily.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { crewBox, frontPlate, leftSidePlate, moduleBox, plate, rearPlate, rightSidePlate, roofPlate, shell,
  type ArmorPlate, type PlateOptions } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';
import { PGZ09_GUNS, PGZ09_LAYOUT, PGZ95_GUNS, PGZ95_LAUNCHER_MUZZLES, PGZ95_LAYOUT } from './profiles/chineseAirDefenseLayout.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
type Armour = readonly [ke: number, ce: number];
const mm = ([ke, ce]: Armour) => ({ keMm: ke, ceMm: ce });

/** Both sides of a plate pair (the helpers' `_R` is the +x plate, `_L` its mirror). */
function sidePair(name: string, a: Armour, xB: number, yB: number, xT: number, yT: number, zR: number, zF: number,
  options: PlateOptions = {}): ArmorPlate[] {
  return [rightSidePlate(`${name}_R`, a[0], xB, yB, xT, yT, zR, zF, { ...mm(a), ...options }),
    leftSidePlate(`${name}_L`, a[0], xB, yB, xT, yT, zR, zF, { ...mm(a), ...options })];
}

function plaVariant(id: string, name: string): FleetTankSpec {
  const spec = cloneFleetVariant(registries.tankSpecs, id, 'bmp3', { name, nation: 'China', era: 'modern', role: 'ifv' });
  for (const key of ['balancePeerOf', 'publicVisualFallback', 'label', 'roster', 'variantOf'] as const) delete spec[key];
  stripSilhouetteDimensions(spec.dims);
  for (const key of ['launcherSalvo', 'autoloader', 'fixedLaunchCanisters', 'primaryGuided', 'muzzleBoreSegments',
    'launcherMuzzles', 'gunPitchByYawDeg'] as const) {
    delete spec.gun[key];
  }
  return spec;
}

// ------------------------------------------------------------------------------------------------------- PGZ-95 --
// Wikipedia (Type 95 SPAAA) and Army Technology: 22.5 t, 6.71 m, 3.20 m, 3.40 m radar down (4.82 m up), crew 3, four
// Type 87 25 mm (two a side), about 1,000 rounds, four QW-2 (two a side), 53 km/h, in service from 1999. The engine's
// power is not published: 600 hp is the estimate. The guns' -5 to +85 degrees is the only listing (a game wiki).
const pgz95 = plaVariant('pgz95', 'PGZ-95');
{
  const L = PGZ95_LAYOUT, G = PGZ95_GUNS, T = L.turret, gp = L.gunPivot;
  const front: Armour = [18, 20], side: Armour = [12, 14], rear: Armour = [10, 12], roof: Armour = [8, 9];
  const turretFront: Armour = [14, 16], turretSide: Armour = [10, 12];
  pgz95.armor.turretPivot = [...L.turretPivot];
  pgz95.armor.gunPivot = [...gp];
  pgz95.armor.gunBarrel = { lengthM: G.muzzleZ, radiusM: G.barrelR, collision: false };
  // the pods' reach from the hull origin (trunnion plus muzzle) is the farthest any part goes
  pgz95.armor.boundingRadiusM = Math.hypot(G.podX, L.turretPivot[1] + gp[1], L.turretPivot[2] + gp[2]) + G.muzzleZ;
  pgz95.armor.hullPlates = [
    frontPlate('upper_glacis', front[0], L.roofHalf + 0.06, L.deckFrontY, L.deckFrontZ, L.roofY, L.deckBreakZ, mm(front)),
    frontPlate('lower_front', front[0], L.tubHalf, L.noseBottomY, L.noseZ, L.deckFrontY, L.deckFrontZ, mm(front)),
    ...sidePair('hull_side_upper', side, L.fenderHalf, L.fenderY, L.roofHalf, L.roofY, L.rearZ, L.deckFrontZ),
    ...sidePair('hull_side_lower', side, L.tubHalf, L.bellyY, L.tubHalf, L.fenderY, L.rearChinZ, L.chinZ),
    rightSidePlate('track_R', 20, L.gear.xc, 0.10, L.gear.xc, L.gear.topY, -3.30, 3.30, { kind: 'external', moduleLink: 'trackR' }),
    leftSidePlate('track_L', 20, L.gear.xc, 0.10, L.gear.xc, L.gear.topY, -3.30, 3.30, { kind: 'external', moduleLink: 'trackL' }),
    rearPlate('hull_rear', rear[0], L.fenderHalf - 0.10, L.rearPlateBottomY, L.rearZ, L.roofY, L.rearZ, mm(rear)),
    roofPlate('hull_roof', roof[0], L.roofHalf, L.roofY, L.rearZ, L.deckBreakZ, mm(roof)),
  ];
  pgz95.armor.turretPlates = [
    frontPlate('turret_front', turretFront[0], T.sideX, 0.02, T.frontZ, T.noseY, T.frontZ, mm(turretFront)),
    frontPlate('turret_glacis', turretFront[0], T.sideX - 0.04, T.noseY, T.frontZ, T.roofY, T.roofFrontZ, mm(turretFront)),
    ...sidePair('turret_side', turretSide, T.sideX, 0.02, T.sideX, 0.74, T.rearZ, T.frontZ),
    rearPlate('turret_rear', rear[0], T.sideX, 0.02, T.rearZ, T.roofY, T.rearZ, mm(rear)),
    roofPlate('turret_roof', roof[0], T.roofHalf, T.roofY, T.rearZ, T.roofFrontZ, mm(roof)),
    // the EO director's armoured box on the front left
    plate('eo_box_front', 10, [0.60, 0.04, 1.25], [0.10, 0.04, 1.25], [0.60, 0.70, 1.25], { keMm: 10, ceMm: 12, kind: 'external' }),
  ];
  const [, ty, tz] = L.turretPivot;
  pgz95.armor.modules = [
    // the front engine under the deck grilles (right of the driver), the fuel aft, the turret basket's ring
    moduleBox('engine', [-1.05, 0.45, 1.45], [0.30, 1.18, 2.95]),
    moduleBox('fuelTank', [-1.05, 0.45, -3.25], [1.05, 1.20, -2.60]),
    moduleBox('turretRing', [-0.88, ty - 0.16, tz - 0.88], [0.88, ty + 0.04, tz + 0.88]),
    moduleBox('trackL', [-1.58, 0, -3.30], [-1.18, L.gear.topY, 3.30]),
    moduleBox('trackR', [1.18, 0, -3.30], [1.58, L.gear.topY, 3.30]),
    // belt-fed rounds in the turret basket under the gunner (internalLayoutRegistry.ts spaaPgz95: ifvAmmoBoxes)
    moduleBox('ammoRack', [-0.70, -0.55, -0.85], [0.70, 0.20, 0.10], true),
    moduleBox('radio', [0.20, 0.25, -1.05], [0.70, 0.65, -0.70], true),
    moduleBox('optics', [0.10, 0.04, 0.60], [0.60, 0.74, 1.25], true),
    // the two pods and the QW-2 stacks, pitching with the trunnion
    { ...moduleBox('gun', [-1.21, gp[1] - 0.32, gp[2] + G.receiverRearZ - 0.07], [1.21, gp[1] + 0.35, gp[2] + G.jacketFrontZ], true),
      gunFollow: true, external: true },
    { ...moduleBox('missileRack', [-1.18, gp[1] + 0.36, gp[2] + G.tubeRearZ], [1.18, gp[1] + 0.63, gp[2] + G.launchZ], true),
      gunFollow: true, external: true },
  ];
  // the published crew of three: the driver front left (internalLayoutRegistry.ts: IFV_TWO_MAN_TURRET's stations)
  pgz95.armor.crew = [
    crewBox('driver', [0.36, 0.50, 0.80], [1.00, 1.55, 1.60]),
    crewBox('gunner', [-0.72, -0.30, -0.10], [-0.10, 0.80, 0.60], true),
    crewBox('commander', [-0.72, -0.30, -0.90], [-0.10, 0.80, -0.15], true),
  ];
  pgz95.gun = {
    ...pgz95.gun,
    // the upper bore of each pair; the lower bores recoil with them (profiles/chineseAirDefense.ts pgz95Pods)
    muzzles: [{ x: -G.podX, y: G.boreY[0] }, { x: G.podX, y: G.boreY[0] }],
    launcherMuzzles: PGZ95_LAUNCHER_MUZZLES.map((tube) => ({ ...tube })),
  };
}
Object.assign(pgz95, {
  hp: 2000, enginePowerHp: 600, weightTons: 22.5, topSpeedKmh: 53, reverseSpeedKmh: 16, hullTraverseDegS: 44,
  turretTraverseDegS: 65, gunPitchDegS: 45, gunElevationDeg: 85, gunDepressionDeg: 5,
});
// published length and width; the height is the build's with the search antenna raised on its short pedestal as
// photographed (3.91 m; the published figures are 3.40 m folded, 4.82 m raised)
pgz95.dims = { hullLengthM: 6.71, overallLengthM: 6.71, widthM: 3.20, heightM: 3.91 };
// The Terminator 2's twin 2A42 package (afvFamily.ts) scaled by calibre to 25 mm (x 25/30): damage and the cycle down
// (43 and 0.25 s). The calibre-scaled penetration (104 mm) would sit at 0.56 of the tier-V IFV median (balanceAudit.ts,
// floor 0.65), so the round takes the shown-tier floor fleetBalancePass applyShownTierFloors lifted the Terminator to.
pgz95.gun = {
  ...pgz95.gun, caliberMm: 25, reloadS: .25, baseAccuracy: .28, aimTimeS: 1.15, soundProfile: 'm242-bushmaster',
  shells: [
    shell('25 mm APDS-T', 'APFSDS', 25, 125, 112, 43, 1150, { pen2000Mm: 100, reloadS: .25, count: 500 }),
    // the M6 Linebacker's Stinger handling (m6LinebackerSpecs.ts) for the QW-2's smaller warhead and ~650 m/s
    shell('QW-2', 'HE', 72, 15, 15, 300, 650,
      { pen2000Mm: 15, reloadS: 3.0, count: 4, guided: true, launcherTubes: 4, soundProfile: 'tow-launch' }),
    shell('25 mm HEI-T', 'HE', 25, 8, 8, 40, 1050, { pen2000Mm: 8, reloadS: .25, count: 500 }),
  ],
};
// The PLA green-and-sand organic coat of the museum PGZ-95: the Type 59's Signature recipe (camoPolicy.ts sig_type59),
// worn as stock
pgz95.visual = { ...pgz95.visual, scheme: 'nato', base: '#374836', weather: '#49573f',
  patches: ['#2a3629', '#5c6349', '#6f684e'], camoScale: .52, marking: 'number', number: '951',
  trackWidthM: PGZ95_LAYOUT.gear.trackW };

// ------------------------------------------------------------------------------------------------------- PGZ-09 --
// Wikipedia (PGZ-09): 35 t, 3.2 m wide, 3.4 m radar down (4.82 m up), crew 3, two PG99 35 mm (1,100 rpm combined), the
// 8V150 diesel at 800 hp, 55 km/h, in service from 2009. The page's 6.7 m length repeats the PGZ-95's: the 2017 side
// photograph scaled by the published height gives the 7.06 m hull built here (the packet records the conflict). No
// ammunition load or elevation is published: the Gepard's 40 + 640 for the same Oerlikon-pattern twin 35 mm, and -5 to
// +85 degrees.
const pgz09 = plaVariant('pgz09', 'PGZ-09');
{
  const L = PGZ09_LAYOUT, G = PGZ09_GUNS, T = L.turret, gp = L.gunPivot;
  const glacis: Armour = [30, 34], nose: Armour = [28, 32], side: Armour = [15, 17], rear: Armour = [12, 14],
    roof: Armour = [10, 11], turretFront: Armour = [30, 34], turretSide: Armour = [15, 17];
  pgz09.armor.turretPivot = [...L.turretPivot];
  pgz09.armor.gunPivot = [...gp];
  pgz09.armor.gunBarrel = { lengthM: G.muzzleZ, radiusM: G.barrelR, collision: false };
  pgz09.armor.boundingRadiusM = Math.hypot(G.gunX, L.turretPivot[1] + gp[1], L.turretPivot[2] + gp[2]) + G.muzzleZ;
  pgz09.armor.hullPlates = [
    frontPlate('upper_glacis', glacis[0], L.fenderHalf, L.glacisFrontY, L.glacisFrontZ, L.roofY, L.glacisZ, mm(glacis)),
    frontPlate('lower_front', nose[0], L.tubHalf, L.chinY, L.chinZ, L.noseY, L.noseZ, mm(nose)),
    frontPlate('nose_upper', nose[0], L.tubHalf, L.noseY, L.noseZ, L.glacisFrontY, L.glacisFrontZ, mm(nose)),
    ...sidePair('hull_side_upper', side, L.fenderHalf, L.fenderY, L.fenderHalf, L.roofY, L.rearZ, L.glacisFrontZ),
    ...sidePair('hull_side_lower', side, L.tubHalf, L.bellyY, L.tubHalf, L.fenderY, L.rearChinZ, 3.00),
    // the deep side plates over the sprockets
    ...sidePair('front_side_plate', side, 1.628, 0.85, 1.628, L.fenderY, 2.06, 3.40),
    rightSidePlate('track_R', 20, L.gear.xc, 0.10, L.gear.xc, L.gear.topY, -3.70, 3.30, { kind: 'external', moduleLink: 'trackR' }),
    leftSidePlate('track_L', 20, L.gear.xc, 0.10, L.gear.xc, L.gear.topY, -3.70, 3.30, { kind: 'external', moduleLink: 'trackL' }),
    rearPlate('hull_rear', rear[0], L.fenderHalf - 0.05, L.rearPlateBottomY, L.rearZ, L.roofY, L.rearZ, mm(rear)),
    roofPlate('hull_roof', roof[0], L.fenderHalf - 0.04, L.roofY, L.rearZ, L.glacisZ, mm(roof)),
  ];
  pgz09.armor.turretPlates = [
    frontPlate('turret_chin', turretFront[0], T.baseHalf, 0.02, T.baseFrontZ, T.beltY, T.beltFrontZ, mm(turretFront)),
    frontPlate('turret_front', turretFront[0], T.bodyHalf, T.beltY, T.frontZ, T.frontRoofY, T.frontZ, mm(turretFront)),
    frontPlate('turret_step', turretSide[0], T.bodyHalf, T.frontRoofY, T.stepZ, T.roofY, T.stepZ, mm(turretSide)),
    frontPlate('eo_column_front', turretFront[0], 0.34, T.beltY, T.beltFrontZ, T.frontRoofY, 1.70, mm(turretFront)),
    ...sidePair('turret_band', turretSide, T.baseHalf, 0.02, T.beltHalf, T.beltY, T.rearZ + 0.08, T.baseFrontZ),
    ...sidePair('turret_side', turretSide, T.bodyHalf, T.beltY, T.bodyHalf, T.shoulderY, T.rearZ, T.frontZ),
    rearPlate('turret_rear', rear[0], T.bodyHalf, 0.02, T.rearZ, T.roofY, T.rearZ, mm(rear)),
    roofPlate('turret_roof', roof[0], T.roofHalf, T.roofY, T.rearZ + 0.04, T.stepZ - 0.04, mm(roof)),
    roofPlate('turret_front_roof', roof[0], T.bodyHalf - 0.06, T.frontRoofY, T.stepZ, T.frontZ - 0.05, mm(roof)),
  ];
  const [, ty, tz] = L.turretPivot;
  pgz09.armor.modules = [
    // the front engine (the 8V150) under the right-hand grille, the fuel aft, the turret ring
    moduleBox('engine', [-1.02, 0.50, 1.20], [0.20, 1.55, 3.20]),
    moduleBox('fuelTank', [-1.00, 0.50, -3.40], [1.00, 1.30, -2.60]),
    moduleBox('turretRing', [-1.02, ty - 0.16, tz - 1.02], [1.02, ty + 0.04, tz + 1.02]),
    moduleBox('trackL', [-1.58, 0, -3.70], [-1.10, L.gear.topY, 3.30]),
    moduleBox('trackR', [1.10, 0, -3.70], [1.58, L.gear.topY, 3.30]),
    moduleBox('ammoRack', [-0.85, -0.50, -1.40], [0.85, 0.40, -0.30], true),
    moduleBox('radio', [0.30, 0.50, -1.70], [0.85, 1.10, -1.20], true),
    moduleBox('optics', [-0.34, T.beltY, 1.18], [0.34, 1.24, T.beltFrontZ], true),
    { ...moduleBox('gun', [-G.housingOuter, gp[1] + G.housingKeelY, gp[2] + G.housingRearZ],
      [G.housingOuter, gp[1] + G.housingTopY, gp[2] + G.collarFrontZ], true), gunFollow: true, external: true },
  ];
  pgz09.armor.crew = [
    crewBox('driver', [0.30, 0.55, 1.70], [1.00, 1.70, 2.70]),
    crewBox('gunner', [-0.80, -0.30, -0.20], [-0.10, 1.00, 0.70], true),
    crewBox('commander', [-0.80, -0.30, -1.10], [-0.10, 1.05, -0.25], true),
  ];
  pgz09.gun = { ...pgz09.gun, muzzles: [{ x: -G.gunX, y: 0 }, { x: G.gunX, y: 0 }] };
}
Object.assign(pgz09, {
  hp: 2400, enginePowerHp: 800, weightTons: 35, topSpeedKmh: 55, reverseSpeedKmh: 18, hullTraverseDegS: 40,
  turretTraverseDegS: 70, gunPitchDegS: 50, gunElevationDeg: 85, gunDepressionDeg: 5,
});
// the measured hull (7.06 m), the length over the idlers' track wraps behind it, the published width and height
pgz09.dims = { hullLengthM: 7.06, overallLengthM: 7.31, widthM: 3.20, heightM: 3.40 };
// The BMPT T-90's twin 2A42 package (afvFamily.ts, tier VI) scaled by calibre to 35 mm (x 35/30)
pgz09.gun = {
  ...pgz09.gun, caliberMm: 35, reloadS: .33, baseAccuracy: .25, aimTimeS: 1.05, soundProfile: 'kde-35',
  shells: [
    shell('35 mm APDS-T', 'APFSDS', 35, 142, 128, 58, 1385, { pen2000Mm: 114, reloadS: .33, count: 40 }),
    shell('35 mm HEI-T', 'HE', 35, 8, 8, 54, 1175, { pen2000Mm: 8, reloadS: .33, count: 640 }),
  ],
};
// The PLA digital woodland of the 2017 parade photographs: the ZTZ-100's Signature recipe (camoPolicy.ts sig_ztz100_x,
// the ZTZ-20's stock), worn as stock
pgz09.visual = { ...pgz09.visual, scheme: 'digital', base: '#49593f', weather: '#5c684c',
  patches: ['#707d58', '#695f48', '#29372d'], camoScale: .36, digitalCellK: 2.4, marking: 'number', number: '091',
  trackWidthM: PGZ09_LAYOUT.gear.trackW };

registerFleetSpecs(registries, ['pgz95', 'pgz09'], { pgz95, pgz09 });
