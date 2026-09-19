// Boot-light gameplay registration for the independently generated ARES APC.
// FV510 is a balance/data donor only; its visual builder is never imported by
// this module and no donor geometry participates in the ARES runtime.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS, fitArmorToDims } from './specs.ts';
import {
  bindFleetRegistries,
  cloneFleetVariant,
  registerFleetSpecs,
  stripSilhouetteDimensions,
} from './fleetSpecRegistry.ts';
import { ARES_APC_X_DATUMS } from './aresApcXFrame.ts';
import {
  crewBox,
  frontPlate,
  leftSidePlate,
  moduleBox,
  rearPlate,
  rightSidePlate,
  roofPlate,
  type ArmorPlate,
} from './specHelpers.ts';

export const ARES_APC_X_ID = 'ares_apc_x' as const;
const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
const donor = registries.tankSpecs.fv510;
if (!donor) throw new Error('ARES APC balance donor missing: fv510');

const spec = cloneFleetVariant(registries.tankSpecs, ARES_APC_X_ID, 'fv510', {
  name: 'Ares APC', nation: 'UK', era: 'modern', role: 'ifv',
});
delete spec.variantOf;
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;

const previousDims = { ...spec.dims };
stripSilhouetteDimensions(spec.dims);
Object.assign(spec.dims, ARES_APC_X_DATUMS.dims);
fitArmorToDims(spec.armor, previousDims, spec.dims);

Object.assign(spec, {
  hp: 1800,
  enginePowerHp: 800,
  weightTons: 42,
  topSpeedKmh: 70,
  reverseSpeedKmh: 30,
  hullTraverseDegS: 45,
  terrainResistance: { hard: 0.69, medium: 0.80, soft: 1.38 },
  pivotStyle: 'neutral',
  turretTraverseDegS: 60,
  gunPitchDegS: 65,
  gunElevationDeg: 50,
  gunDepressionDeg: 10,
});

spec.gun = {
  caliberMm: 12.7,
  reloadS: 0.14,
  baseAccuracy: 0.27,
  aimTimeS: 0.75,
  soundProfile: 'heavy-machine-gun',
  bloom: { move: 0.08, hullRot: 0.10, turret: 0.06, afterShot: 0.35 },
  shells: [
    {
      name: 'L111A1 AP-T', type: 'AP', caliberMm: 12.7,
      pen100Mm: 34, pen1000Mm: 24, pen2000Mm: 17,
      dmg: 24, velocityMps: 890, moduleDmg: 10, tracer: 'AP',
      reloadS: 0.14, count: 400,
    },
    {
      name: 'L111A1 API-T', type: 'AP', caliberMm: 12.7,
      pen100Mm: 30, pen1000Mm: 21, pen2000Mm: 15,
      dmg: 27, velocityMps: 860, moduleDmg: 12, tracer: 'AP',
      reloadS: 0.14, count: 300,
    },
    {
      name: 'L111A1 Ball', type: 'HE', caliberMm: 12.7,
      pen100Mm: 8, pen1000Mm: 8, pen2000Mm: 8,
      dmg: 32, velocityMps: 820, moduleDmg: 10, tracer: 'HE',
      reloadS: 0.14, count: 200,
    },
  ],
};

spec.armor.turretPivot = [...ARES_APC_X_DATUMS.turretPivot];
spec.armor.gunPivot = [
  ARES_APC_X_DATUMS.trunnion[0] - ARES_APC_X_DATUMS.turretPivot[0],
  ARES_APC_X_DATUMS.trunnion[1] - ARES_APC_X_DATUMS.turretPivot[1],
  ARES_APC_X_DATUMS.trunnion[2] - ARES_APC_X_DATUMS.turretPivot[2],
];
spec.armor.gunBarrel = {
  lengthM: ARES_APC_X_DATUMS.muzzleZ - ARES_APC_X_DATUMS.trunnion[2],
  radiusM: 0.016,
};

// Replace the donor's manned-cannon turret internals with the real compact
// remote station. ARES has a two-person vehicle crew; carried specialists are
// not invented as combat crew damage roles.
const rwsProtection = { keMm: 32, ceMm: 42 };
spec.armor.turretPlates = [
  frontPlate('rws_front', 20, 0.46, 0.08, 0.30, 0.84, 0.26, rwsProtection),
  rightSidePlate('rws_side_R', 20, 0.46, 0.08, 0.44, 0.84, -0.32, 0.30, rwsProtection),
  leftSidePlate('rws_side_L', 20, 0.46, 0.08, 0.44, 0.84, -0.32, 0.30, rwsProtection),
  rearPlate('rws_rear', 20, 0.44, 0.08, -0.32, 0.84, -0.32, rwsProtection),
  roofPlate('rws_roof', 16, 0.44, 0.84, -0.32, 0.28, { keMm: 25, ceMm: 34 }),
  frontPlate('l111a1_receiver', 15, 0.18, -0.13, 0.34, 0.13, 0.34,
    { kind: 'spaced', keMm: 22, ceMm: 28, gunFollow: true }),
];
spec.armor.modules = [
  moduleBox('engine', [-1.15, 0.48, 1.48], [1.12, 1.58, 3.12]),
  moduleBox('fuelTank', [-1.30, 0.55, -2.25], [-0.58, 1.55, -0.55]),
  // Ready-use belts sit on the exposed RWS, but the damageable ammunition
  // reserve is stowed inside the protected mission compartment.
  moduleBox('ammoRack', [0.25, 1.25, 0.25], [0.55, 1.45, 0.45]),
  moduleBox('turretRing', [-0.68, 2.12, 0.18], [-0.08, 2.38, 0.82]),
  moduleBox('radio', [-1.18, 0.86, -1.65], [-0.46, 1.50, -0.62]),
  moduleBox('optics', [-0.46, 0.18, -0.18], [-0.10, 0.72, 0.42], true),
  // The damageable gun volume represents the receiver and feed cradle inside
  // the protected remote station; the exposed barrel remains visual geometry.
  moduleBox('gun', [-0.30, 0.10, -0.18], [0.22, 0.62, 0.18], true),
  moduleBox('trackL', [-1.55, 0, -2.62], [-0.99, 1.11, 3.33]),
  moduleBox('trackR', [0.99, 0, -2.62], [1.55, 1.11, 3.33]),
];
spec.armor.crew = [
  crewBox('driver', [0.18, 0.58, 1.25], [1.05, 1.57, 2.45]),
  crewBox('commander', [-1.05, 0.72, 0.10], [-0.18, 1.57, 1.30]),
];

// Public protection values for ARES are not available. These deliberately
// modest values are game-balance abstractions, not claims about classified
// armor performance. External tracks remain external module screens.
function applyGameplayProtection(plate: ArmorPlate): void {
  if (plate.kind === 'external') return;
  const name = plate.name.toLowerCase();
  if (name.includes('roof') || name.includes('rear')) {
    plate.physicalMm = 25; plate.keMm = 30; plate.ceMm = 40;
  } else if (name.includes('side') || name.includes('skirt')) {
    plate.physicalMm = 35; plate.keMm = 55; plate.ceMm = 75;
  } else if (name.includes('turret') || name.includes('mantlet') || name.includes('rws') || name.includes('l111')) {
    plate.physicalMm = 20; plate.keMm = 32; plate.ceMm = 42;
  } else {
    plate.physicalMm = 45; plate.keMm = 90; plate.ceMm = 120;
  }
}
for (const plate of [...spec.armor.hullPlates, ...spec.armor.turretPlates]) applyGameplayProtection(plate);

spec.visual = {
  scheme: 'nato',
  base: '#4e5940',
  weather: '#60694f',
  patches: ['#252a22', '#544233', '#72745d'],
  marking: 'roundel',
  number: '93',
  trackWidthM: ARES_APC_X_DATUMS.trackW,
  camoScale: 0.44,
};

registerFleetSpecs(registries, [ARES_APC_X_ID], { [ARES_APC_X_ID]: spec });
