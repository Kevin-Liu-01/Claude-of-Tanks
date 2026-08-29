// Boot-light combat-data registration for the Type 74 family. The authored
// visual implementation remains in misc.js and is loaded only when a matching
// vehicle is requested; Japan's derivative spec registration still receives
// the exact same donor row during the eager roster pass.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from '../specs.ts';
import { shell, communityArmor as buildCommunityArmor } from '../specHelpers.ts';
import type {
  CommunityArmorInput,
  CommunityArmorOptions,
} from '../specHelpers.ts';
import type { FleetTankSpec } from '../specContracts.ts';
import { bindFleetRegistries, registerFleetSpecs } from '../fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const BLOOM_MODERN = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 2.2 };
const communityArmor = (
  options: CommunityArmorInput,
) => buildCommunityArmor(options, {
  exposeTurretless: false,
  allowTurretless: false,
} satisfies CommunityArmorOptions);

// Same authored combat row as the quarantined user-drop fallback. No external
// model or visual builder participates in this module.
const TYPE74_SPEC = {
  id: 'type74', name: 'Type 74', nation: 'Japan', era: 'modern', role: 'mbt',
  variantOf: 'type74',
  hp: 1950,
  enginePowerHp: 720, weightTons: 38, topSpeedKmh: 53, reverseSpeedKmh: 20,
  hullTraverseDegS: 38,
  terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.4 },
  pivotStyle: 'neutral',
  hydropneumaticAim: {
    noseDownDeg: 8, noseUpDeg: 8, rateDegS: 7,
    compressionM: 0.32, droopM: 0.32,
  },
  turretTraverseDegS: 36, gunPitchDegS: 30, gunElevationDeg: 15, gunDepressionDeg: 10,
  gun: {
    caliberMm: 105, reloadS: 5.6, baseAccuracy: 0.29, aimTimeS: 1.7,
    bloom: BLOOM_MODERN,
    shells: [
      shell('Type 93 APFSDS', 'APFSDS', 105, 540, 500, 430, 1455, { pen2000Mm: 450 }),
      shell('Type 91 HEAT-MP', 'HEAT', 105, 520, 520, 430, 1173),
      shell('M393 HEP', 'HE', 105, 45, 45, 500, 730),
    ],
  },
  dims: { hullLengthM: 6.7, overallLengthM: 9.42, widthM: 3.18, heightM: 2.70 },
  armor: communityArmor({
    lenM: 6.7, widM: 3.18, hgtM: 2.25, turretPivot: [0, 1.42, 0.50],
    gunPivot: [0, 0.18, 1.15], barrelLenM: 4.42, barrelRadM: 0.062,
    frontMm: 110, sideMm: 45, rearMm: 25, roofMm: 20,
    tFrontMm: 195, tSideMm: 80, tRearMm: 40, mantletMm: 195,
  }),
  visual: {
    scheme: 'stripes', base: '#44503a', weather: '#4e5a44',
    patches: ['#4d4133', '#37432f'],
    marking: 'number', number: '74', trackWidthM: 0.55, camoScale: 0.6,
  },
} satisfies FleetTankSpec;

registerFleetSpecs(registries, ['type74'], { type74: TYPE74_SPEC });

export { TYPE74_SPEC };
