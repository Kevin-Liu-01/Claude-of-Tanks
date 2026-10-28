// Boot-light combat record for the independent VT-4A1 procedural build.
// The owner-supplied GLB is a local measurement oracle only; no runtime model
// or source payload participates in this tank.

import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { shell, apfsdsPenetration, modernArmor, crewBox as cbox, moduleBox } from './specHelpers.ts';
import { createType99Armor } from './profiles/type99Armor.ts';
import { bindFleetRegistries, registerFleetSpecs } from './fleetSpecRegistry.ts';
import type { FleetTankSpec } from './specContracts.ts';

const p = apfsdsPenetration(720);

const CHINESE_FRONTLINE_SPECS = {
  vt4a1: {
    id: 'vt4a1', name: 'VT-4A1', nation: 'China', era: 'modern', role: 'mbt',
    hp: 2650,
    enginePowerHp: 1300, weightTons: 52, topSpeedKmh: 70, reverseSpeedKmh: 18,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.70, medium: 0.80, soft: 1.45 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 40, gunPitchDegS: 31, gunElevationDeg: 14, gunDepressionDeg: 7,
    // Release 240 (gun-hull fleet, tools/gun-depression-sweep.mjs --no-suit at 26 mm): the gun's measured stop by turret
    // yaw; ahead the full 7 degrees, over the front quarters' ERA and fittings -3.8 to -6, over the stern kit +4.9.
    gunPitchByYawDeg: [[0, -7], [20, -7], [21, -6.5], [22, -6.3], [25, -6.3], [27, -7], [29, -7], [31, -4.7], [32, -4.1],
      [33, -3.8], [38, -3.8], [44, -4.2], [45, -3.9], [51, -3.8], [59, -4.9], [61, -4.9], [66, -6], [94, -6], [126, -3.5],
      [127, -2.7], [128, -2.4], [129, -2.2], [133, -2], [142, -2], [143, -1.6], [144, -1.4], [146, -1.3], [154, -1],
      [163, -0.8], [164, 2.5], [165, 4.3], [167, 4.8], [170, 4.9], [180, 4.9]],
    gun: {
      caliberMm: 125, reloadS: 6.4, baseAccuracy: 0.29, aimTimeS: 1.85,
      bloom: { move: 0.055, hullRot: 0.075, turret: 0.055, afterShot: 2.1 },
      shells: [
        shell('BTA4 APFSDS', 'APFSDS', 125, p[0], p[1], 550, 1780, { pen2000Mm: p[2] }),
        shell('BK-125 HEAT-MP', 'HEAT', 125, 700, 700, 490, 980),
        shell('DTB-125 HE', 'HE', 125, 55, 55, 600, 900),
      ],
    },
    // The VT-4A1 now uses the ZTZ-99A2 chassis as an exact shared build. Its
    // gameplay dimensions and collision body intentionally match that tank;
    // only the same-envelope turret shell and its equipment are independent.
    dims: {
      hullLengthM: 7.6, overallLengthM: 11.0, widthM: 3.7, heightM: 2.45,
      silhouetteHullLengthM: 8.18, silhouetteOverallLengthM: 11.60,
      // Slightly taller 0.82-scale turret and re-seated roof equipment P95 datum.
      silhouetteHeightM: 2.97,
    },
    armor: createType99Armor('vt4a1'),
    visual: {
      scheme: 'digital', base: '#4b563a', weather: '#59644b',
      patches: ['#6f6b4b', '#313b2b', '#242820'],
      marking: 'number', number: '401', trackWidthM: 0.63, camoScale: 0.46,
    },
  },
  // Owner-directed original Chinese IFV, 2026-09-19. Photo-informed body
  // language, authored dimensions and unmanned layout; see the design contract.
  type100: {
    id: 'type100', name: 'Type 100 IFV', nation: 'China', era: 'next-generation', role: 'ifv',
    hp: 2700,
    enginePowerHp: 1100, weightTons: 38, topSpeedKmh: 76, reverseSpeedKmh: 32,
    hullTraverseDegS: 54,
    terrainResistance: { hard: 0.64, medium: 0.74, soft: 1.24 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 70, gunPitchDegS: 54, gunElevationDeg: 45, gunDepressionDeg: 10,
    gun: {
      caliberMm: 30, reloadS: 0.40, baseAccuracy: 0.24, aimTimeS: 1.0,
      muzzleBoreSegments: 14,
      soundProfile: 'mk30-2',
      launcherMuzzles: [-1.18, 1.18].flatMap(x => [.12, .44].map(y => ({ x, y, z: 1.00 }))),
      bloom: { move: 0.036, hullRot: 0.050, turret: 0.034, afterShot: 1.30 },
      shells: [
        shell('DTW-30 APFSDS-T', 'APFSDS', 30, 235, 215, 92, 1400, { pen2000Mm: 195, reloadS: 0.40, count: 220 }),
        shell('HJ-10 ATGM', 'HEAT', 170, 1100, 1100, 700, 190,
          { reloadS: 2.2, count: 8, guided: true, soundProfile: 'spike-launch', launcherTubes: 4 }),
        shell('DTB-30 ABM', 'HE', 30, 14, 14, 105, 1100, { reloadS: 0.40, count: 220 }),
      ],
    },
    dims: { hullLengthM: 7.13, overallLengthM: 7.30, widthM: 3.70, heightM: 2.80, silhouetteHeightM: 3.56 },
    armor: (() => {
      const a = modernArmor({
        hl: 3.565, hw: 1.83, inW: 1.05, floor: 0.40, trkTop: 1.30, roofY: 2.00,
        turretPivot: [0, 2.02, -0.15], gunPivot: [0, 0.53, 0.65],
        barrelLenM: 2.35, barrelRadM: 0.045,
        glacis: [80, 300, 420], lower: [60, 220, 290], side: [50, 150, 210],
        skirt: [70, 250, 460], rear: 40, roof: 46,
        tw: 0.96, tFrontZ: 1.20, tRearZ: -1.16, tH: 0.78,
        cheek: [110, 280, 370], tSide: [75, 175, 255], tRear: 50, tRoof: 44,
        mantlet: [120, 290, 380], loader: false,
      });
      // Unmanned combat module: the three operating stations stay below the hull roof, clear of the turret.
      a.crew = [
        cbox('driver', [-.98, .58, .70], [-.30, 1.81, 1.62]),
        cbox('gunner', [.25, .56, -.80], [.92, 1.84, .20]),
        cbox('commander', [-.92, .56, -.80], [-.25, 1.84, .20]),
      ];
      // Authored front-right powerpack and front final drive leave the driver
      // lane and rear troop compartment clear; no generic rear-engine remap.
      a.modules = a.modules.filter(m => !['engine', 'transmission', 'ammoRack', 'fuelTank'].includes(m.module));
      a.modules.push(
        moduleBox('engine', [.10, .48, .48], [1.00, 1.82, 1.72]),
        moduleBox('transmission', [-.90, .50, 1.82], [.95, 1.32, 2.36]),
        moduleBox('ammoRack', [-.20, .65, -1.35], [.20, 1.65, -.75]),
        moduleBox('fuelTank', [-.98, .50, -2.55], [-.60, 1.55, -1.55]),
      );
      return a;
    })(),
    visual: {
      scheme: 'digital', base: '#526044', weather: '#626d50',
      patches: ['#737e5b', '#73624a', '#2e3b2f'],
      marking: 'number', number: 'LZ83', trackWidthM: 0.58, camoScale: 0.38, digitalCellK: 2.4,
    },
  },
  // ZTZ-20 (release 262, owner 2026-10-27): the production type of the ZTZ-100 programme, an owner-authored concept
  // (docs/references/concepts/ztz20-family-20261027.json) measured from the "[OD]ZTZ-20 Test-3" oracle and built from
  // scratch on the ZTZ-20 family base (profiles/ztz20Family.ts). The pre-production ZTZ-100 and the ZTZ-100 Prototype
  // testbed are its earlier stages. Against the ZTZ-100: the matured high-pressure 105 mm round, the faster autoloader
  // and fire control, the composite glacis tiles, the hard-kill launchers and the slat cage.
  ztz20: {
    id: 'ztz20', name: 'ZTZ-20', nation: 'China', era: 'next-generation', role: 'mbt',
    hp: 2650,
    enginePowerHp: 1300, weightTons: 45, topSpeedKmh: 72, reverseSpeedKmh: 30,
    hullTraverseDegS: 48,
    terrainResistance: { hard: 0.66, medium: 0.76, soft: 1.28 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 52, gunPitchDegS: 40, gunElevationDeg: 15, gunDepressionDeg: 8,
    // Release 262 (tools/gun-depression-sweep.mjs at 26 mm, the measured 0.34 m thermal sleeve): the gun's stop by turret
    // yaw; over the glacis tiles and the bow lamps -5.6 to -5, the full 8 degrees across the flanks, over the engine deck
    // astern -4.7 to -3.5.
    gunPitchByYawDeg: [[0, -5.6], [17, -5.5], [22, -5.1], [27, -5], [31, -5], [37, -5.3], [38, -5.5], [39, -6.6], [43, -6.6],
      [51, -8], [105, -8], [136, -4.7], [147, -4], [148, -3.8], [153, -3.5], [170, -3.5], [171, -4.1], [180, -4]],
    gun: {
      // fire control inside the next-generation Tier X ceiling (balanceAudit: 1.44x the peer median after the pass)
      caliberMm: 105, reloadS: 4.6, baseAccuracy: 0.23, aimTimeS: 1.45,
      bloom: { move: 0.042, hullRot: 0.060, turret: 0.042, afterShot: 1.7 },
      shells: [
        shell('DTW-105A APFSDS', 'APFSDS', 105, 870, 810, 440, 1650, { pen2000Mm: 710 }),
        shell('DTP-105A HEAT-MP', 'HEAT', 105, 490, 490, 430, 1150),
        shell('DTB-105A HE', 'HE', 105, 44, 44, 510, 760),
      ],
    },
    // the concept row's spec dimensions (hull, gun to cage, skirt planes); the complete envelope is 3.81 x 9.24 x 3.035
    dims: { hullLengthM: 7.13, overallLengthM: 9.24, widthM: 3.70, heightM: 2.30, silhouetteHeightM: 3.03 },
    armor: modernArmor({
      hl: 3.565, hw: 1.85, inW: 1.15, floor: 0.35, trkTop: 1.05, roofY: 1.41,
      turretPivot: [0, 1.41, -0.55], gunPivot: [0, 0.35, 1.10],
      // the combat barrel is the drawn gun: its muzzle measures 0.08 m at the brake's end cap (gun-barrel-align census)
      barrelLenM: 4.625, barrelRadM: 0.08,
      glacis: [90, 560, 760], lower: [70, 340, 460], side: [55, 250, 370],
      skirt: [40, 120, 260], rear: 40, roof: 38,
      tw: 1.20, tFrontZ: 1.52, tRearZ: -2.00, tH: 0.89,
      cheek: [150, 640, 860], tSide: [90, 310, 410], tRear: 55, tRoof: 40,
      mantlet: [170, 570, 750], loader: false, bustleAmmo: true,
    }),
    visual: {
      scheme: 'digital', base: '#49593f', weather: '#5c684c',
      patches: ['#707d58', '#695f48', '#29372d'],
      marking: 'number', number: '201', trackWidthM: 0.515, camoScale: 0.36, digitalCellK: 2.4,
    },
  },
  // ZTZ-20 Prototype (release 262, owner 2026-10-27: "keep the ztz 100 prototype then add the ztz 20 and then have a ztz
  // 20 prototype"): the first ZTZ-20 turret, a testbed fit on the family hull between the ZTZ-100 and the ZTZ-20: the new
  // high-pressure 105 mm in an early bolted mount without its sleeve, trial ballast where the armour pods go, a fixed
  // periscope for the commander, no weapon station, hard-kill system or smoke banks yet. At or below the ZTZ-20 throughout.
  ztz20_prototype: {
    id: 'ztz20_prototype', name: 'ZTZ-20 Prototype', nation: 'China', era: 'next-generation', role: 'mbt',
    hp: 2450,
    enginePowerHp: 1300, weightTons: 46, topSpeedKmh: 70, reverseSpeedKmh: 28,
    hullTraverseDegS: 46,
    terrainResistance: { hard: 0.66, medium: 0.76, soft: 1.30 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 48, gunPitchDegS: 38, gunElevationDeg: 15, gunDepressionDeg: 8,
    // Release 262 (tools/gun-depression-sweep.mjs at 26 mm): the testbed's early box mount is wide, so ahead its corners
    // stop over the crew hatches at -4.2; the full 8 degrees across the flanks; over the engine deck astern -3.7 to -2.9.
    gunPitchByYawDeg: [[0, -4.2], [34, -4.2], [35, -4.4], [36, -6.7], [39, -8], [127, -8], [142, -3.7], [147, -3.4], [164, -2.9],
      [177, -3], [180, -3.4]],
    gun: {
      caliberMm: 105, reloadS: 4.8, baseAccuracy: 0.24, aimTimeS: 1.5,
      bloom: { move: 0.045, hullRot: 0.064, turret: 0.045, afterShot: 1.8 },
      shells: [
        shell('DTW-105A APFSDS (trials lot)', 'APFSDS', 105, 855, 795, 435, 1640, { pen2000Mm: 700 }),
        shell('DTP-105A HEAT-MP', 'HEAT', 105, 480, 480, 425, 1150),
        shell('DTB-105A HE', 'HE', 105, 42, 42, 505, 760),
      ],
    },
    // the concept row's spec dimensions; the complete envelope is measured in docs/references/tanks/ztz20.md
    dims: { hullLengthM: 7.13, overallLengthM: 9.32, widthM: 3.70, heightM: 2.30, silhouetteHeightM: 2.89 },
    armor: modernArmor({
      hl: 3.565, hw: 1.85, inW: 1.15, floor: 0.35, trkTop: 1.05, roofY: 1.41,
      turretPivot: [0, 1.41, -0.55], gunPivot: [0, 0.35, 1.10],
      barrelLenM: 4.625, barrelRadM: 0.072,
      glacis: [90, 540, 740], lower: [70, 340, 460], side: [55, 240, 360],
      skirt: [40, 120, 260], rear: 40, roof: 38,
      tw: 1.20, tFrontZ: 1.52, tRearZ: -2.00, tH: 0.89,
      cheek: [150, 630, 850], tSide: [70, 240, 320], tRear: 50, tRoof: 38,
      mantlet: [150, 520, 700], loader: false, bustleAmmo: true,
    }),
    visual: {
      scheme: 'digital', base: '#49593f', weather: '#5c684c',
      patches: ['#707d58', '#695f48', '#29372d'],
      marking: 'number', number: '20-02', trackWidthM: 0.515, camoScale: 0.36, digitalCellK: 2.4,
    },
  },
  // ZTZ-100 (owner 2026-09-17): the PLA's next-generation main battle tank, generated from the owner's supplied
  // "[OD]ZTZ-20 Test-3" reference model (a local comparison oracle only, see
  // docs/references/tanks/ztz100_x.source-measurements.json). Seven road wheels, a 105 mm autoloaded gun in a
  // faceted unmanned turret with two sensor towers, a rear weapon station, a right-cheek missile bank and a stern
  // slat cage. First-party procedural build (profiles/ztz100X.ts). 262 (owner 2026-10-27, "the ztz 100 is its prototype"):
  // the pre-production stage of the ZTZ-20 family (profiles/ztz20Family.ts ZTZ20_STAGES.ztz100), its combat record kept.
  ztz100: {
    id: 'ztz100', name: 'ZTZ-100', nation: 'China', era: 'next-generation', role: 'mbt',
    hp: 2600,
    enginePowerHp: 1200, weightTons: 42, topSpeedKmh: 72, reverseSpeedKmh: 30,
    hullTraverseDegS: 48,
    terrainResistance: { hard: 0.66, medium: 0.76, soft: 1.30 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 50, gunPitchDegS: 40, gunElevationDeg: 15, gunDepressionDeg: 8,
    // Release 262 (tools/gun-depression-sweep.mjs at 26 mm, the measured thermal sleeve): over the bare glacis and bow lamps
    // -5.6 to -5.5, -6.5 off the bow quarters, the full 8 degrees across the flanks, over the engine deck astern -5.7 to
    // -3.5, and -0.7 over the stern trials basket.
    gunPitchByYawDeg: [[0, -5.6], [20, -5.5], [23, -5.5], [26, -5.8], [30, -6.5], [37, -6.5], [43, -6.6], [51, -8], [123, -8],
      [128, -5.7], [129, -5.4], [138, -4.6], [146, -4.1], [148, -3.8], [153, -3.5], [161, -3.6], [163, -1.2], [164, -0.7],
      [169, -0.7], [172, -1.1], [173, -0.7], [178, -0.7], [180, -1.1]],
    gun: {
      caliberMm: 105, reloadS: 4.8, baseAccuracy: 0.24, aimTimeS: 1.5,
      bloom: { move: 0.045, hullRot: 0.065, turret: 0.045, afterShot: 1.8 },
      shells: [
        shell('DTW-105 APFSDS', 'APFSDS', 105, 840, 780, 430, 1600, { pen2000Mm: 680 }),
        shell('DTP-105 HEAT-MP', 'HEAT', 105, 470, 470, 420, 1150),
        shell('DTB-105 HE', 'HE', 105, 42, 42, 500, 760),
      ],
    },
    // 262: the family hull (stern plate to nose 7.13) and the stern bin's basket to the muzzle
    dims: { hullLengthM: 7.13, overallLengthM: 9.35, widthM: 3.70, heightM: 2.30, silhouetteHeightM: 2.91 },
    armor: modernArmor({
      hl: 3.47, hw: 1.85, inW: 1.15, floor: 0.35, trkTop: 1.05, roofY: 1.41,
      turretPivot: [0, 1.41, -0.55], gunPivot: [0, 0.35, 1.10],
      // the combat barrel is the drawn gun: its thermal sleeve measures 0.104 m (gun-barrel-align census)
      barrelLenM: 4.625, barrelRadM: 0.104,
      glacis: [90, 540, 740], lower: [70, 340, 460], side: [55, 240, 360],
      skirt: [35, 110, 240], rear: 40, roof: 38,
      tw: 1.20, tFrontZ: 1.68, tRearZ: -2.05, tH: 0.90,
      cheek: [150, 620, 840], tSide: [85, 300, 400], tRear: 55, tRoof: 40,
      mantlet: [170, 560, 740], loader: false, bustleAmmo: true,
    }),
    visual: {
      scheme: 'digital', base: '#49593f', weather: '#5c684c',
      patches: ['#707d58', '#695f48', '#29372d'],
      marking: 'number', number: '100', trackWidthM: 0.515, camoScale: 0.36, digitalCellK: 2.4,
    },
  },
  // Owner-authored missile-support prototype (2026-09-19): retained chassis,
  // new unmanned eight-cell armored turret; the service ZTZ-100 is unchanged.
  ztz100_prototype: {
    id: 'ztz100_prototype', name: 'ZTZ-100 Prototype', nation: 'China', era: 'next-generation', role: 'mbt',
    hp: 2250,
    enginePowerHp: 1100, weightTons: 44, topSpeedKmh: 64, reverseSpeedKmh: 24,
    hullTraverseDegS: 40,
    terrainResistance: { hard: 0.66, medium: 0.76, soft: 1.30 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 40, gunPitchDegS: 32, gunElevationDeg: 20, gunDepressionDeg: 6,
    // Release 262 (tools/gun-depression-sweep.mjs at 26 mm): on the ZTZ-20 family hull's flat testbed deck the 35 mm L/90
    // keeps its full 6 degrees all round (the 240 curve rode the old hull's rear-deck stowage).
    gun: {
      caliberMm: 35, reloadS: 12, baseAccuracy: 0.30, aimTimeS: 1.7,
      launcherSalvo: { rounds: 2, intervalS: .35 },
      primaryGuided: true, soundProfile: 'konkurs-launch',
      // The collar mouths of the round-canister pods (profiles/ztz100Prototype.ts ZTZ100_PROTOTYPE_LAUNCHER, 2026-10-21).
      launcherMuzzles: [-1.23, -.93, .93, 1.23].flatMap(x => [.12, .42].map(y => ({ x, y, z: 1.00 }))),
      bloom: { move: 0.055, hullRot: 0.075, turret: 0.050, afterShot: 1.8 },
      shells: [
        shell('HJ-P9 Tandem', 'HEAT', 152, 950, 950, 500, 320,
          { pen2000Mm: 950, reloadS: 12, count: 16, guided: true, soundProfile: 'konkurs-launch', launcherTubes: 8 }),
        shell('HJ-P9 Blast', 'HE', 152, 65, 65, 620, 320,
          { reloadS: 12, count: 8, guided: true, soundProfile: 'konkurs-launch', launcherTubes: 8 }),
        shell('35 mm APFSDS-T', 'APFSDS', 35, 145, 130, 44, 1180,
          { pen2000Mm: 112, reloadS: 0.30, count: 180, soundProfile: 'kde-35' }),
      ],
    },
    // 2026-10-22 (lane 240, owner-approved): the backup gun's calibre-true 35 mm L/90 tube carries the muzzle 2.05 m
    // further forward (3.75 m ahead of the hull datum), past the bow.
    // 262: the ZTZ-20 family hull under the unchanged turret (7.13 hull, the stern bin to the muzzle 7.90)
    dims: { hullLengthM: 7.13, overallLengthM: 7.90, widthM: 3.726, heightM: 1.90, silhouetteHeightM: 2.64 },
    armor: modernArmor({
      hl: 3.47, hw: 1.85, inW: 1.15, floor: 0.35, trkTop: 1.05, roofY: 1.41,
      turretPivot: [0, 1.41, -0.55], gunPivot: [0, 0.64, 0.80],
      barrelLenM: 3.50, barrelRadM: 0.045,
      glacis: [90, 540, 740], lower: [70, 340, 460], side: [55, 240, 360],
      skirt: [35, 110, 240], rear: 40, roof: 38,
      tw: 1.50, tFrontZ: 1.15, tRearZ: -1.25, tH: 0.50,
      cheek: [130, 420, 560], tSide: [70, 230, 310], tRear: 45, tRoof: 35,
      mantlet: [100, 280, 360], loader: false, bustleAmmo: false,
    }),
    visual: {
      scheme: 'digital', base: '#49593f', weather: '#5c684c',
      patches: ['#707d58', '#695f48', '#29372d'],
      marking: 'number', number: '100', trackWidthM: 0.515, camoScale: 0.36, digitalCellK: 2.4,
    },
  },
} satisfies Readonly<Record<string, FleetTankSpec>>;

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
registerFleetSpecs(registries, Object.keys(CHINESE_FRONTLINE_SPECS), CHINESE_FRONTLINE_SPECS);
