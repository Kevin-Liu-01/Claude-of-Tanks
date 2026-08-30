// Abrams-family concept rows. The former M1A2 remains available as
// m1a2_legacy while AbramsX uses the first-party procedural family builder.
import { TANK_SPECS, ALL_TANK_IDS } from './specs.ts';
import {
  plate as par,
  frontPlate as fr,
  rearPlate as rr,
  rightSidePlate as sR,
  leftSidePlate as sL,
  roofPlate as rf,
  rightCheekPlate as chR,
  leftCheekPlate as chL,
  moduleBox as mbox,
  crewBox as cbox,
  shell,
  apfsdsPenetration as apfsdsPens,
} from './specHelpers.ts';
import type { ArmorEnvelope } from './specHelpers.ts';
import type { FleetTankSpec, FleetVisualSpec } from './specContracts.ts';

type AbramsConceptSpec = FleetTankSpec & {
  variantOf?: string;
  visual: FleetVisualSpec & { patchK?: number };
};

const tankSpecs = TANK_SPECS as typeof TANK_SPECS & Record<string, AbramsConceptSpec>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function armorM1A3(): ArmorEnvelope {
  const hullPlates = [
    fr('integrated_upper_glacis', 260, 1.77, 0.84, 4.00, 1.64, 2.08,
      { keMm: 930, ceMm: 1280 }),
    fr('lower_glacis', 125, 1.72, 0.43, 3.70, 0.84, 4.00,
      { keMm: 330, ceMm: 390 }),
    par('glacis_nxra_face', 48,
      [-1.58, 1.40, 2.65], [1.58, 1.40, 2.65], [-1.68, 1.69, 1.95],
      { keMm: 330, ceMm: 620, kind: 'spaced' }),
    sR('hull_side_upper_R', 105, 1.78, 1.00, 1.73, 1.66, -3.86, 2.14,
      { keMm: 165, ceMm: 250 }),
    sL('hull_side_upper_L', 105, 1.78, 1.00, 1.73, 1.66, -3.86, 2.14,
      { keMm: 165, ceMm: 250 }),
    sR('hull_side_lower_R', 85, 1.15, 0.43, 1.15, 1.02, -3.74, 3.62,
      { keMm: 105, ceMm: 145 }),
    sL('hull_side_lower_L', 85, 1.15, 0.43, 1.15, 1.02, -3.74, 3.62,
      { keMm: 105, ceMm: 145 }),
    sR('modular_skirt_R', 42, 2.03, 0.52, 2.03, 1.54, -3.74, 3.72,
      { keMm: 155, ceMm: 420, kind: 'spaced' }),
    sL('modular_skirt_L', 42, 2.03, 0.52, 2.03, 1.54, -3.74, 3.72,
      { keMm: 155, ceMm: 420, kind: 'spaced' }),
    sR('slat_cage_R', 12, 2.16, 0.70, 2.16, 1.56, -3.96, -2.08,
      { keMm: 12, ceMm: 230, kind: 'spaced' }),
    sL('slat_cage_L', 12, 2.16, 0.70, 2.16, 1.56, -3.96, -2.08,
      { keMm: 12, ceMm: 230, kind: 'spaced' }),
    sR('track_R', 24, 1.75, 0.08, 1.75, 1.16, -3.88, 3.88,
      { kind: 'external', moduleLink: 'trackR' }),
    sL('track_L', 24, 1.75, 0.08, 1.75, 1.16, -3.88, 3.88,
      { kind: 'external', moduleLink: 'trackL' }),
    rr('hybrid_powerpack_rear', 65, 1.68, 0.56, -3.98, 1.63, -4.04,
      { keMm: 75, ceMm: 100 }),
    rf('hull_roof', 55, 1.70, 1.66, -3.86, 2.08,
      { keMm: 65, ceMm: 90 }),
  ];

  const turretPlates = [
    chR('integrated_cheek_R', 720, 0.27, 2.18, 1.59, 1.05, -0.10, 0.78, 0.16, 0.11,
      { keMm: 1010, ceMm: 1380 }),
    chL('integrated_cheek_L', 720, 0.27, 2.18, 1.59, 1.05, -0.10, 0.78, 0.16, 0.11,
      { keMm: 1010, ceMm: 1380 }),
    fr('gun_cradle', 410, 0.31, 0.06, 2.22, 0.65, 2.17,
      { keMm: 520, ceMm: 690, gunFollow: true }),
    sR('turret_side_R', 330, 1.60, -0.08, 1.48, 0.73, -3.12, 1.10,
      { keMm: 470, ceMm: 720 }),
    sL('turret_side_L', 330, 1.60, -0.08, 1.48, 0.73, -3.12, 1.10,
      { keMm: 470, ceMm: 720 }),
    sR('turret_cage_R', 12, 1.86, 0.12, 1.86, 0.84, -3.34, -1.08,
      { keMm: 12, ceMm: 230, kind: 'spaced' }),
    sL('turret_cage_L', 12, 1.86, 0.12, 1.86, 0.84, -3.34, -1.08,
      { keMm: 12, ceMm: 230, kind: 'spaced' }),
    rr('isolated_autoloader_bustle', 85, 1.48, 0.04, -3.13, 0.73, -3.20,
      { keMm: 95, ceMm: 125 }),
    rf('turret_roof', 65, 1.47, 0.79, -3.12, 1.10,
      { keMm: 75, ceMm: 105 }),
  ];

  return {
    boundingRadiusM: 7.65,
    turretPivot: [0, 1.67, -0.15],
    gunPivot: [0, 0.28, 0.78],
    gunBarrel: { lengthM: 5.65, radiusM: 0.115 },
    hullPlates,
    turretPlates,
    modules: [
      mbox('engine', [-1.16, 0.43, -3.84], [1.16, 1.58, -1.98]),
      mbox('transmission', [-1.22, 0.43, -3.92], [1.22, 0.94, -2.92]),
      mbox('fuelTank', [0.48, 0.45, -1.90], [1.17, 1.21, -0.54]),
      mbox('turretRing', [-1.18, 1.53, -1.20], [1.18, 1.75, 0.90]),
      mbox('radio', [-1.05, 0.86, 0.64], [-0.28, 1.48, 1.74]),
      mbox('optics', [-1.22, 0.52, 0.10], [1.22, 1.36, 1.55], true),
      mbox('gun', [-0.24, 0.03, -0.48], [0.24, 0.69, 2.22], true),
      mbox('ammoRack', [-1.24, 0.10, -3.06], [1.24, 0.67, -1.58], true),
      mbox('autoloader', [-1.08, 0.18, -2.84], [1.08, 0.62, -1.46], true),
      mbox('missileRack', [-0.88, 0.20, -2.95], [0.88, 0.58, -1.74], true),
      mbox('trackL', [-2.02, 0, -3.90], [-1.12, 1.18, 3.90]),
      mbox('trackR', [1.12, 0, -3.90], [2.02, 1.18, 3.90]),
    ],
    crew: [
      cbox('commander', [-1.02, 0.55, 0.94], [-0.38, 1.28, 1.93]),
      cbox('driver', [-0.34, 0.53, 1.96], [0.34, 1.25, 3.20]),
      cbox('gunner', [0.38, 0.55, 0.94], [1.02, 1.28, 1.93]),
    ],
  };
}

const m1a3: AbramsConceptSpec = {
  id: 'm1a3', name: 'M1A3 Abrams', nation: 'USA', era: 'next-generation', role: 'mbt',
  variantOf: 'm1a2',
  hp: 2950,
  enginePowerHp: 1800, weightTons: 61.5, topSpeedKmh: 75, reverseSpeedKmh: 40,
  hullTraverseDegS: 48,
  terrainResistance: { hard: 0.62, medium: 0.72, soft: 1.28 },
  pivotStyle: 'neutral',
  turretTraverseDegS: 54, gunPitchDegS: 40, gunElevationDeg: 24, gunDepressionDeg: 10,
  hybridDrive: {
    architecture: 'series-parallel', motorPowerKw: 1340, silentWatch: true,
    regenerativeBraking: true, electricPivotAssist: true,
  },
  protectionSuite: {
    integratedNxra: true, hardKillAps: true, softKillAps: true,
    distributedWarningReceivers: 8,
  },
  networkSuite: {
    openArchitecture: true, cooperativeTargeting: true, crewStations: 3,
    sensorFusion: true, unmannedAerialSystemLink: true,
  },
  gun: {
    caliberMm: 130, reloadS: 17.5, baseAccuracy: 0.23, aimTimeS: 1.25,
    autoloader: { magazineSize: 4, intraClipS: 2.25, fullReloadS: 17.5 },
    bloom: { ...tankSpecs.m1a2.gun.bloom, move: 0.045, hullRot: 0.055, turret: 0.04, afterShot: 1.8 },
    shells: [
      shell('XM1301 APFSDS-T', 'APFSDS', 130,
        apfsdsPens(840)[0], apfsdsPens(840)[1], 620, 1900,
        { pen2000Mm: apfsdsPens(840)[2], count: 24 }),
      shell('XM1210 MRM-H Hypersonic GATGM', 'HEAT', 130,
        1050, 1050, 650, 2050,
        { guided: true, guidanceTurnRateRadS: 0.34, reloadS: 2.8, count: 6, soundProfile: 'spike-launch' }),
      shell('XM1302 AMP', 'HE', 130, 82, 82, 760, 1050, { count: 18 }),
    ],
  },
  dims: { hullLengthM: 8.08, overallLengthM: 10.85, widthM: 4.32, heightM: 3.46 },
  armor: armorM1A3(),
  visual: {
    scheme: 'solid', base: '#464b3c', weather: '#555b49', patches: [],
    marking: 'star', number: 'A3', trackWidthM: 0.64, camoScale: 0.46,
  },
};

const abramsx: AbramsConceptSpec = clone(tankSpecs.m1a2);
abramsx.id = 'abramsx';
abramsx.name = 'AbramsX';
// The procedural shell spans world z -2.481..2.404, placing its structural
// center at z=-0.0385.  The inherited M1A2 pivot and the old visual-only
// -0.39 m override made the turret orbit around a point deep in the bustle.
// Publish the centered AbramsX ring and its unchanged world-space gun axis
// so simulation, armor, killcam and the rendered rig all yaw about one datum.
abramsx.armor.turretPivot = [0, 1.95, -0.04];
abramsx.armor.gunPivot = [0, -0.02, 2.189];
// §5.73-1 / §5.82 P95 datum: the mandatory XM914/RWS is a broad roof-kit
// band, not an antenna outlier. Both independent local Mortavex kits measure
// its crest at 3.4694 m after the committed 3.66 m width registration; the
// twin 4.131 m whips remain p95-excluded spikes. The old inherited 2.44 m
// value described only the bare turret roof and caused batch-20 to crush the
// defining AbramsX superstructure into a box.
abramsx.dims = { ...abramsx.dims, heightM: 3.47 };
abramsx.variantOf = 'm1a2';
abramsx.hp = 2750;
abramsx.weightTons = 49;
abramsx.enginePowerHp = 1500;
abramsx.topSpeedKmh = 72;
abramsx.reverseSpeedKmh = 35;
abramsx.hullTraverseDegS = 46;
abramsx.turretTraverseDegS = 48;
abramsx.gun.reloadS = 5.2;
abramsx.gun.aimTimeS = 1.5;
abramsx.gun.baseAccuracy = 0.25;
abramsx.gun.shells[0].name = 'XM1203 APFSDS';
abramsx.gun.shells[1].name = 'XM1203 AMP';
abramsx.visual = {
  ...abramsx.visual,
  // Matched from the registered 14-view evidence rather than the inherited
  // bright M1 palette: source median RGB is ~55/59/48 and its brown fields
  // are broad, subdued shapes.  The prior 60/68/56 base + bright weather
  // layer made an objectively aligned shell read 3-9 luminance points
  // larger/taller in every shaded comparison.
  scheme: 'nato', base: '#373b30', weather: '#4b5144',
  // The source atlas uses a few sweeping fields, not the default fleet's
  // many small islands. camoScale <=.5 is world-normalized; patchK is the
  // effective field-size control (measured against the 14-view crops).
  patches: ['#232720', '#5b4d40'], marking: 'star', number: 'X1',
  camoScale: 0.45, patchK: 1.55,
};

// Keep the procedural gameplay rows available in every build.
for (const spec of [tankSpecs.m1a2_legacy, m1a3, abramsx] satisfies AbramsConceptSpec[]) {
  tankSpecs[spec.id] = tankSpecs[spec.id] || spec;
  if (!ALL_TANK_IDS.includes(spec.id)) ALL_TANK_IDS.push(spec.id);
}
