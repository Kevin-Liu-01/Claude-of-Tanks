// Swedish family gameplay/spec registration. Geometry lives in
// profiles/sweden.ts.

import {
  TANK_SPECS,
  MODEL_SOURCE,
  ALL_TANK_IDS,
  fitArmorToDims,
} from './specs.ts';
import {
  crewBox,
  frontPlate,
  leftSidePlate,
  moduleBox,
  rearPlate,
  rightSidePlate,
  roofPlate,
  type ArmorEnvelope,
  type PlateOptions,
} from './specHelpers.ts';
import type {
  FleetDimensions,
  FleetGunSpec,
  FleetTankSpec,
  HydropneumaticAim,
  TerrainResistance,
} from './specContracts.ts';
import {
  bindFleetRegistries,
  cloneFleetVariant,
  cloneFleetVariantFrom,
  registerFleetSpecs,
  scaleNonExternalArmor,
} from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
const SWEDEN_IDS = Object.freeze(['strv81', 'udes03', 'strv103a', 'strv121'] as const);

interface SiegeGunOptions {
  name: string;
  reloadS: number;
  accuracy: number;
  aimTimeS: number;
  damage: number;
  apcrPen: number;
  apcrPenFar: number;
  heatPen: number;
  velocityMps: number;
  heDamage: number;
}

function siegeGun({
  name,
  reloadS,
  accuracy,
  aimTimeS,
  damage,
  apcrPen,
  apcrPenFar,
  heatPen,
  velocityMps,
  heDamage,
}: SiegeGunOptions): FleetGunSpec {
  const gun = structuredClone(registries.tankSpecs.strv103b.gun);
  gun.reloadS = reloadS;
  gun.baseAccuracy = accuracy;
  gun.aimTimeS = aimTimeS;
  gun.shells[0] = {
    ...gun.shells[0],
    name: `${name} APDS`, pen100Mm: apcrPen, pen1000Mm: apcrPenFar,
    dmg: damage, velocityMps,
  };
  gun.shells[1] = {
    ...gun.shells[1],
    name: `${name} HEAT`, pen100Mm: heatPen, pen1000Mm: heatPen,
    dmg: damage,
  };
  gun.shells[2] = { ...gun.shells[2], name: `${name} HE`, dmg: heDamage };
  return gun;
}

type SwedishStatOverrides = Partial<Pick<FleetTankSpec,
  | 'hp'
  | 'enginePowerHp'
  | 'weightTons'
  | 'topSpeedKmh'
  | 'reverseSpeedKmh'
  | 'hullTraverseDegS'
  | 'terrainResistance'
  | 'turretTraverseDegS'
  | 'gunPitchDegS'
  | 'gunElevationDeg'
  | 'gunDepressionDeg'
  | 'hydropneumaticAim'
>> & {
  gunArcDeg?: number;
  gun?: FleetGunSpec;
};

interface SwedishVariantOptions {
  name: string;
  number: string;
  role?: string;
  era?: string;
  scheme?: string;
  base: string;
  weather: string;
  patches: string[];
  camoScale: number;
  dims?: Partial<FleetDimensions>;
  fitArmor?: boolean;
  stats?: SwedishStatOverrides;
  reloadS?: number;
  armorFactor?: number;
}

function variant(
  id: string,
  donorId: string,
  options: SwedishVariantOptions,
): FleetTankSpec {
  const donor = registries.tankSpecs[donorId];
  if (!donor) throw new Error(`Swedish family donor missing: ${donorId}`);
  const donorDims = { ...donor.dims };
  const spec = cloneFleetVariant(registries.tankSpecs, id, donorId, {
    name: options.name,
    nation: 'Sweden',
    era: options.era,
    role: options.role,
  });
  Object.assign(spec, options.stats || {});
  if (options.reloadS !== undefined && Number.isFinite(options.reloadS)) {
    spec.gun.reloadS = options.reloadS;
  }
  spec.visual = {
    ...spec.visual,
    scheme: options.scheme || 'nato',
    base: options.base,
    weather: options.weather,
    patches: options.patches,
    marking: 'number',
    number: options.number,
    camoScale: options.camoScale,
  };
  if (options.dims) {
    spec.dims = { ...spec.dims, ...options.dims };
    if (options.fitArmor) fitArmorToDims(spec.armor, donorDims, spec.dims);
  }
  if (options.armorFactor) scaleNonExternalArmor(spec, options.armorFactor);
  return spec;
}

function enforceTurretlessArmor(spec: FleetTankSpec): FleetTankSpec {
  spec.armor.turretless = true;
  spec.armor.turretPlates = [];
  return spec;
}

interface SiegeArmorRatings {
  frontPhysicalMm: number;
  frontKeMm: number;
  frontCeMm: number;
  lowerPhysicalMm: number;
  lowerKeMm: number;
  lowerCeMm: number;
  sideMm: number;
  sideKeMm: number;
  sideCeMm: number;
  rearMm: number;
  roofMm: number;
  trackMm: number;
}

/** The hull gun as profiles/sweden.ts draws it: bore axis height, mouth station and tube radius (hull frame). */
interface SiegeGunMount {
  axisY: number;
  muzzleZ: number;
  radiusM: number;
  /** The drawn casemate (the anatomy receipt's hull box: its half-width, deck and length) the calibrated reconcile
   * stretches this envelope's main plates onto; the interior boxes are authored in its frame (drawnBox). */
  deckY: number;
  halfW: number;
  zMin: number;
  zMax: number;
}

/** Combat envelope for the hull-aimed Swedish wedge. Every module remains in
 * hull space so armor, reticle, module hits and server authority agree. */
function siegeArmor(
  dims: FleetDimensions,
  ratings: SiegeArmorRatings,
  mount: SiegeGunMount,
): ArmorEnvelope {
  const hl = dims.hullLengthM * 0.5;
  const hw = dims.widthM * 0.5;
  const bodyW = hw * 0.73;
  const floor = 0.20;
  const trackTop = Math.min(0.88, dims.heightM * 0.43);
  const roofY = dims.heightM * 0.68;
  const bowZ = hl * 0.99;
  const roofNoseZ = hl * 0.48;
  // 230 gun-barrel alignment: the barrel runs down the drawn hull gun (tools/gun-barrel-align-census.mjs). The old
  // derived axis (0.73 of the roof height) sat ~0.5 m under it and the barrel ran 0.5-0.8 m past its mouth.
  const gunY = mount.axisY;
  const gunZ = hl * 0.54;
  const toAuthoredY = (y: number): number => floor + (y - floor) * (roofY - floor) / (mount.deckY - floor);
  // 274 (module-outside-share): the reconcile maps the main plates' box ([±bodyW, floor..roofY, -0.96 hl..bowZ]) onto
  // the drawn casemate's, so an interior box drawn in the casemate's own frame is authored through the inverse map. The
  // casemate is a T in section (profiles/strv103Hull.ts): the tub ±0.94 m from the 0.40 m belly to the 1.38 m seam, the
  // body over the tracks out to ±1.68 m from the seam to the deck; the old full-width boxes from the 0.2 m floor hung
  // 30-68 % into the track recesses.
  const toAuthoredX = (x: number): number => x * bodyW / mount.halfW;
  const toAuthoredZ = (z: number): number => -hl * 0.96 + (z - mount.zMin) * (bowZ + hl * 0.96) / (mount.zMax - mount.zMin);
  const drawnBox = (name: Parameters<typeof moduleBox>[0], min: readonly [number, number, number], max: readonly [number, number, number]) =>
    moduleBox(name, [toAuthoredX(min[0]), toAuthoredY(min[1]), toAuthoredZ(min[2])],
      [toAuthoredX(max[0]), toAuthoredY(max[1]), toAuthoredZ(max[2])]);
  const plateRatings = (keMm: number, ceMm: number): PlateOptions => ({ keMm, ceMm });
  return {
    turretless: true,
    boundingRadiusM: hl + 3.2,
    turretPivot: [0, 0, 0],
    gunPivot: [0, gunY, gunZ],
    gunBarrel: {
      lengthM: Math.round((mount.muzzleZ - gunZ) * 1e4) / 1e4,
      radiusM: mount.radiusM,
    },
    hullPlates: [
      frontPlate('upper_glacis', ratings.frontPhysicalMm, bodyW, trackTop * 0.57,
        bowZ, roofY, roofNoseZ, { ...plateRatings(ratings.frontKeMm, ratings.frontCeMm), frontZone: 'upper' }),
      // (inherited-reds-276) the wedge is zoned by height: a beak's underside over the lower plate's edge is the wedge's
      frontPlate('lower_front', ratings.lowerPhysicalMm, bodyW, floor, hl * 0.86,
        trackTop * 0.57, bowZ, { ...plateRatings(ratings.lowerKeMm, ratings.lowerCeMm), frontZone: 'lower' }),
      rightSidePlate('hull_side_upper_R', ratings.sideMm, bodyW, trackTop * 0.70,
        bodyW * 0.96, roofY, -hl * 0.96, roofNoseZ,
        plateRatings(ratings.sideKeMm, ratings.sideCeMm)),
      leftSidePlate('hull_side_upper_L', ratings.sideMm, bodyW, trackTop * 0.70,
        bodyW * 0.96, roofY, -hl * 0.96, roofNoseZ,
        plateRatings(ratings.sideKeMm, ratings.sideCeMm)),
      rightSidePlate('hull_side_lower_R', ratings.sideMm, bodyW * 0.88, floor,
        bodyW, trackTop * 0.70, -hl * 0.94, hl * 0.86,
        plateRatings(ratings.sideKeMm, ratings.sideCeMm)),
      leftSidePlate('hull_side_lower_L', ratings.sideMm, bodyW * 0.88, floor,
        bodyW, trackTop * 0.70, -hl * 0.94, hl * 0.86,
        plateRatings(ratings.sideKeMm, ratings.sideCeMm)),
      rightSidePlate('track_R', ratings.trackMm, hw * 0.88, 0.10, hw * 0.88,
        trackTop, -hl, hl, { kind: 'external', moduleLink: 'trackR' }),
      leftSidePlate('track_L', ratings.trackMm, hw * 0.88, 0.10, hw * 0.88,
        trackTop, -hl, hl, { kind: 'external', moduleLink: 'trackL' }),
      rearPlate('hull_rear', ratings.rearMm, bodyW, floor, -hl * 0.96, roofY,
        -hl * 0.96),
      roofPlate('hull_roof', ratings.roofMm, bodyW * 0.96, roofY, -hl * 0.96,
        roofNoseZ),
    ],
    turretPlates: [],
    modules: [
      // the twin front powerpack in the tub under the glacis, ahead of the crew (internalLayoutRegistry fixedAuto); the
      // gun's magazine in the rear of the tub behind them, its ram loader derived from it; the fuel in the body over the
      // magazine, sponson to sponson under the rear deck
      drawnBox('engine', [-0.86, 0.56, 0.95], [0.86, 1.30, 2.15]),
      drawnBox('fuelTank', [-1.56, 1.46, -2.30], [1.56, 1.80, -1.10]),
      drawnBox('ammoRack', [-0.86, 0.90, -2.30], [0.86, 1.36, -1.10]),
      // the radio sets in a sponson behind the crew, clear of the tub wall (finalize seats it on the layout's side)
      drawnBox('radio', [-1.50, 1.42, -1.05], [-0.98, 1.80, -0.45]),
      moduleBox('optics', [bodyW * 0.18, roofY * 0.66, hl * 0.12],
        [bodyW * 0.78, roofY * 1.02, roofNoseZ]),
      // 274: the calibrated reconcile maps the hull frame from this envelope's roof (0.68 of the height) onto the drawn
      // deck, so a box authored at the drawn axis rode 0.5-0.7 m up out of the hull (module-visual-align volume-out).
      // The gun box is authored in the pre-stretch frame and lands on the drawn axis, 0.24 m either side.
      moduleBox('gun', [-0.22, toAuthoredY(gunY - 0.24), -hl * 0.08],
        [0.22, toAuthoredY(gunY + 0.24), gunZ]),
      moduleBox('trackL', [-hw, 0, -hl], [-bodyW * 0.86, trackTop, hl]),
      moduleBox('trackR', [bodyW * 0.86, 0, -hl], [hw, trackTop, hl]),
    ],
    crew: [
      crewBox('driver', [-bodyW * 0.72, floor + 0.12, hl * 0.30],
        [-0.08, roofY * 0.92, hl * 0.66]),
      crewBox('gunner', [0.08, floor + 0.12, hl * 0.24],
        [bodyW * 0.72, roofY * 0.90, hl * 0.62]),
      crewBox('commander', [0.10, floor + 0.12, -hl * 0.18],
        [bodyW * 0.74, roofY * 0.92, hl * 0.17]),
    ],
  };
}

const udesAim: HydropneumaticAim = {
  noseDownDeg: 14, noseUpDeg: 20, rateDegS: 12,
  compressionM: 0.50, droopM: 0.50,
};
const udesTerrain: TerrainResistance = { hard: 0.66, medium: 0.82, soft: 1.28 };
const strv103aAim: HydropneumaticAim = {
  noseDownDeg: 13, noseUpDeg: 12, rateDegS: 10,
  compressionM: 0.44, droopM: 0.44,
};
const strv103aTerrain: TerrainResistance = { hard: 0.62, medium: 0.78, soft: 1.20 };

const SWEDEN_SPECS = {
  strv81: variant('strv81', 'centurion3', {
    name: 'Strv 81', number: '81', scheme: 'woodland',
    base: '#39483b', weather: '#4f5948', patches: ['#263129', '#62634a', '#74664c'],
    camoScale: 0.55,
    // release 262: the Strv 81's Mk 3/5 hull is 7.55 m (Svenska Wikipedia); 7.82 m is the later marks' longer deck
    dims: { hullLengthM: 7.56, overallLengthM: 9.85, widthM: 3.39, heightM: 3.01 },
    stats: { hp: 1450, enginePowerHp: 650, weightTons: 51.8, topSpeedKmh: 35,
      reverseSpeedKmh: 12, turretTraverseDegS: 24, gunPitchDegS: 20 },
    reloadS: 7.1, armorFactor: 1.05,
  }),
  udes03: variant('udes03', 'strv103b', {
    name: 'UDES 03', number: '03', role: 'td', scheme: 'solid',
    base: '#45513f', weather: '#55614d', patches: [], camoScale: 0.46,
    // 274 (owner 2026-11-20: "redesign the udes to be more like a prototype of the strv 103a"): the S-tank's trials
    // prototype on the family casemate (profiles/strv103Family.ts mark p): the A frame with its shorter test tube
    dims: { hullLengthM: 7.04, overallLengthM: 7.65, widthM: 3.60, heightM: 2.14 },
    fitArmor: true,
    stats: {
      // 274 (owner 2026-11-20, via Main: "match the S-tank"): the trials prototype on the 103A frame weighs and runs like it
      hp: 1400, enginePowerHp: 340, weightTons: 37.0, topSpeedKmh: 58,
      reverseSpeedKmh: 52, hullTraverseDegS: 48, terrainResistance: udesTerrain,
      turretTraverseDegS: 32, gunPitchDegS: 30, gunElevationDeg: 20,
      gunDepressionDeg: 14, gunArcDeg: 3, hydropneumaticAim: udesAim,
      gun: siegeGun({
        name: '10,5 cm kan m/59', reloadS: 6.6, accuracy: 0.23, aimTimeS: 1.4,
        damage: 430, apcrPen: 315, apcrPenFar: 292, heatPen: 355,
        velocityMps: 1420, heDamage: 510,
      }),
    },
  }),
  strv103a: variant('strv103a', 'strv103b', {
    name: 'Strv 103A', number: '103A', role: 'td', scheme: 'solid',
    base: '#46503b', weather: '#525a44', patches: [], camoScale: 0.5,
    dims: { hullLengthM: 7.04, overallLengthM: 8.99, widthM: 3.60, heightM: 2.14 },
    stats: {
      hp: 1850, enginePowerHp: 650, weightTons: 37.0, topSpeedKmh: 58,
      reverseSpeedKmh: 44, hullTraverseDegS: 48,
      terrainResistance: strv103aTerrain, turretTraverseDegS: 38,
      gunPitchDegS: 34, gunElevationDeg: 12, gunDepressionDeg: 13,
      gunArcDeg: 4, hydropneumaticAim: strv103aAim,
      gun: siegeGun({
        name: '10,5 cm kan Strv 103 L/74', reloadS: 5.4,
        accuracy: 0.21, aimTimeS: 1.25, damage: 480, apcrPen: 345,
        apcrPenFar: 318, heatPen: 390, velocityMps: 1530, heDamage: 560,
      }),
    },
  }),
  strv121: variant('strv121', 'leo2a4_v', {
    name: 'Stridsvagn 121', number: '122', scheme: 'splinter',
    base: '#34493c', weather: '#4b5b4c', patches: ['#202b26', '#5c644c', '#81745a'],
    camoScale: 0.42,
    dims: { hullLengthM: 7.72, overallLengthM: 9.97, widthM: 3.75, heightM: 3.02 },
    stats: { hp: 2850, enginePowerHp: 1500, weightTons: 62.5, topSpeedKmh: 68,
      reverseSpeedKmh: 31, turretTraverseDegS: 38, gunPitchDegS: 32 },
    reloadS: 6.0, armorFactor: 1.14,
  }),
} satisfies Record<string, FleetTankSpec>;

SWEDEN_SPECS.udes03.armor = siegeArmor(SWEDEN_SPECS.udes03.dims, {
  frontPhysicalMm: 45, frontKeMm: 90, frontCeMm: 125,
  lowerPhysicalMm: 35, lowerKeMm: 65, lowerCeMm: 85,
  sideMm: 25, sideKeMm: 35, sideCeMm: 45,
  rearMm: 25, roofMm: 25, trackMm: 20,
}, { axisY: 1.59, muzzleZ: 4.13, radiusM: 0.088, deckY: 1.90, halfW: 1.80, zMin: -3.53, zMax: 3.52 });
SWEDEN_SPECS.strv103a.armor = siegeArmor(SWEDEN_SPECS.strv103a.dims, {
  frontPhysicalMm: 65, frontKeMm: 180, frontCeMm: 240,
  lowerPhysicalMm: 55, lowerKeMm: 140, lowerCeMm: 180,
  sideMm: 40, sideKeMm: 55, sideCeMm: 70,
  rearMm: 35, roofMm: 35, trackMm: 25,
}, { axisY: 1.59, muzzleZ: 5.47, radiusM: 0.089, deckY: 1.90, halfW: 1.80, zMin: -3.502, zMax: 3.52 });
enforceTurretlessArmor(SWEDEN_SPECS.udes03);
enforceTurretlessArmor(SWEDEN_SPECS.strv103a);

// Upgrade the stable Strv 103 public ID to the supplied 103B identity while
// preserving saves and protocol keys.
const strv103b = registries.tankSpecs.strv103b;
if (strv103b) {
  Object.assign(strv103b, {
    name: 'Strv 103B', nation: 'Sweden', hp: 2400,
    enginePowerHp: 900, weightTons: 39.7, topSpeedKmh: 65, reverseSpeedKmh: 50,
    hullTraverseDegS: 54,
    terrainResistance: { hard: 0.55, medium: 0.70, soft: 1.08 },
    turretTraverseDegS: 44, gunPitchDegS: 40,
    gunElevationDeg: 12, gunDepressionDeg: 13, gunArcDeg: 4,
    hydropneumaticAim: {
      noseDownDeg: 13, noseUpDeg: 12, rateDegS: 11,
      compressionM: 0.46, droopM: 0.46,
    },
    gun: siegeGun({
      name: '10,5 cm kan Strv 103 L/74B', reloadS: 4.4,
      accuracy: 0.18, aimTimeS: 1.05, damage: 520, apcrPen: 380,
      apcrPenFar: 350, heatPen: 425, velocityMps: 1600, heDamage: 620,
    }),
    armor: siegeArmor(strv103b.dims, {
      frontPhysicalMm: 75, frontKeMm: 220, frontCeMm: 300,
      lowerPhysicalMm: 65, lowerKeMm: 170, lowerCeMm: 220,
      sideMm: 50, sideKeMm: 65, sideCeMm: 90,
      rearMm: 40, roofMm: 40, trackMm: 30,
    // the shared family casemate (profiles/strv103Family.ts): the 103A's bore and muzzle
    }, { axisY: 1.59, muzzleZ: 5.47, radiusM: 0.089, deckY: 1.90, halfW: 1.815, zMin: -3.502, zMax: 3.52 }),
  });
  delete strv103b.community;
  strv103b.visual = {
    ...strv103b.visual,
    scheme: 'splinter', base: '#384b3d', weather: '#4e5b49',
    patches: ['#263329', '#62644b', '#776b50'], marking: 'number',
    number: '103B', camoScale: 0.48,
  };
  enforceTurretlessArmor(strv103b);
  registries.modelSources.strv103b = { source: 'procedural' };
}

// Strv 103E (concept, tier X; owner 2026-11-20: "a new modernized souped up version in tier X with a new modern design
// better armor etc"): the project's own design on the family casemate (profiles/strv103Family.ts). Real basis: the 103C's
// laser fire control, diesel and bar armour, the 103D's thermal sight, the 1980s 120 mm S-tank studies; the rest is
// invented (docs/references/tanks/strv103e.md). Tier X numbers sit with the Challenger 3 TD, the tier X casemate-role
// peer, and the tier X 120 mm rounds; fleetBalancePass applies the shown-tier floors.
const strv103e = cloneFleetVariant(registries.tankSpecs, 'strv103e', 'strv103b', {
  name: 'Strv 103E', nation: 'Sweden', era: 'modern', role: 'td',
});
Object.assign(strv103e, {
  hp: 2550, enginePowerHp: 1100, weightTons: 45.0, topSpeedKmh: 65, reverseSpeedKmh: 55,
  hullTraverseDegS: 50,
  terrainResistance: { hard: 0.58, medium: 0.72, soft: 1.12 },
  turretTraverseDegS: 42, gunPitchDegS: 38,
  gunElevationDeg: 12, gunDepressionDeg: 13, gunArcDeg: 4,
  hydropneumaticAim: { noseDownDeg: 13, noseUpDeg: 12, rateDegS: 12, compressionM: 0.46, droopM: 0.46 },
});
strv103e.gun = siegeGun({
  name: '12 cm kan Strv 103E', reloadS: 5.5, accuracy: 0.21, aimTimeS: 1.40, damage: 525,
  apcrPen: 860, apcrPenFar: 790, heatPen: 600, velocityMps: 1740, heDamage: 590,
});
strv103e.gun.caliberMm = 120;
strv103e.gun.shells = strv103e.gun.shells.map((shell) => ({ ...shell, caliberMm: 120, moduleDmg: 120 }));
strv103e.gun.shells[0] = { ...strv103e.gun.shells[0], name: '12 cm slpprj APFSDS', type: 'APFSDS', tracer: 'APFSDS', pen2000Mm: 720 };
strv103e.gun.shells[1] = { ...strv103e.gun.shells[1], name: '12 cm HEAT-MP', dmg: 480, velocityMps: 1400 };
strv103e.gun.shells[2] = { ...strv103e.gun.shells[2], name: '12 cm HE', velocityMps: 1000 };
// the nose module (z 3.68) to the rear boxes (-3.52), the 120 mm's muzzle at 5.70, the side modules at 3.80 m
strv103e.dims = { hullLengthM: 7.20, overallLengthM: 9.22, widthM: 3.80, heightM: 2.14 };
strv103e.armor = siegeArmor(strv103e.dims, {
  frontPhysicalMm: 150, frontKeMm: 520, frontCeMm: 720,
  lowerPhysicalMm: 120, lowerKeMm: 380, lowerCeMm: 520,
  sideMm: 80, sideKeMm: 120, sideCeMm: 200,
  rearMm: 40, roofMm: 45, trackMm: 30,
}, { axisY: 1.59, muzzleZ: 5.70, radiusM: 0.092, deckY: 1.90, halfW: 1.90, zMin: -3.502, zMax: 3.68 });
strv103e.visual = {
  ...strv103e.visual,
  scheme: 'splinter', base: '#3b4a3a', weather: '#4f5a49',
  patches: ['#1f2a22', '#5e6a4d', '#8a7e5d'], marking: 'number', number: '103E', camoScale: 0.42,
};
enforceTurretlessArmor(strv103e);

// The 103B's two builds (owner 2026-11-20: "make the 103b and 103b netted two variants"): the plain tank, and its
// twin in the field net and garnish (ghillieFleetSuits.ts); one spec.
const strv103bNet = cloneFleetVariant(registries.tankSpecs, 'strv103b_net', 'strv103b', {
  name: 'Strv 103B (Netted)', nation: 'Sweden', era: 'cold-war', role: 'td',
});
enforceTurretlessArmor(strv103bNet);

// Strv 152 (concept, tier X; owner 2026-11-20: "make a strv 152 with a 152mm and designed hull to accommodate that cannon
// to complement the strv 103 e"): the 103E's fit on a casemate rebuilt round a fixed 152 mm (strv103Family.ts mark x).
// Its numbers sit in the 152 mm line's tier X band (t14_152, object195: 1,000 mm, 740-820 damage, 8.5 s) a step
// slower to aim than the 103E, with the S-tank's autoloader cycle.
const strv152 = cloneFleetVariantFrom(strv103e, 'strv152', 'strv103e', {
  name: 'Strv 152', nation: 'Sweden', era: 'modern', role: 'td',
});
Object.assign(strv152, {
  hp: 2600, enginePowerHp: 1500, weightTons: 52.0, topSpeedKmh: 60, reverseSpeedKmh: 50,
  hullTraverseDegS: 44,
  terrainResistance: { hard: 0.62, medium: 0.78, soft: 1.22 },
  turretTraverseDegS: 38, gunPitchDegS: 34,
  gunElevationDeg: 12, gunDepressionDeg: 12, gunArcDeg: 4,
  hydropneumaticAim: { noseDownDeg: 12, noseUpDeg: 12, rateDegS: 11, compressionM: 0.46, droopM: 0.46 },
});
strv152.gun = siegeGun({
  name: '15,2 cm kan Strv 152', reloadS: 8.2, accuracy: 0.23, aimTimeS: 1.60, damage: 760,
  apcrPen: 1000, apcrPenFar: 920, heatPen: 760, velocityMps: 1780, heDamage: 900,
});
strv152.gun.caliberMm = 152;
strv152.gun.shells = strv152.gun.shells.map((shell) => ({ ...shell, caliberMm: 152, moduleDmg: 152 }));
strv152.gun.shells[0] = { ...strv152.gun.shells[0], name: '15,2 cm slpprj APFSDS', type: 'APFSDS', tracer: 'APFSDS', pen2000Mm: 840 };
strv152.gun.shells[1] = { ...strv152.gun.shells[1], name: '15,2 cm HEAT-MP', dmg: 680, velocityMps: 1300 };
strv152.gun.shells[2] = { ...strv152.gun.shells[2], name: '15,2 cm HE', velocityMps: 950 };
// the nose module (z 3.68) to the bustle (-4.12); the brake's mouth at 6.30; the side modules at 3.80 m
strv152.dims = { hullLengthM: 7.80, overallLengthM: 10.42, widthM: 3.80, heightM: 2.14 };
strv152.armor = siegeArmor(strv152.dims, {
  frontPhysicalMm: 160, frontKeMm: 600, frontCeMm: 800,
  lowerPhysicalMm: 130, lowerKeMm: 420, lowerCeMm: 560,
  sideMm: 85, sideKeMm: 130, sideCeMm: 210,
  rearMm: 45, roofMm: 45, trackMm: 30,
}, { axisY: 1.70, muzzleZ: 6.30, radiusM: 0.118, deckY: 1.98, halfW: 1.90, zMin: -4.13, zMax: 3.68 });
strv152.visual = {
  ...strv152.visual,
  scheme: 'splinter', base: '#3a4838', weather: '#4e5847',
  patches: ['#1e281f', '#5b674b', '#857a5a'], marking: 'number', number: '152', camoScale: 0.42,
};
enforceTurretlessArmor(strv152);

registerFleetSpecs(registries, [...SWEDEN_IDS, 'strv103e', 'strv103b_net', 'strv152'],
  { ...SWEDEN_SPECS, strv103e, strv103b_net: strv103bNet, strv152 });
