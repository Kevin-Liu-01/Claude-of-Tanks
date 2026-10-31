// Boot-light combat-data registration for the Type 74 family. The authored
// visual implementation remains in misc.ts and is loaded only when a matching
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

// 262: measured by tools/gun-depression-sweep.mjs on the family hull at the owner's model's own proportions (26 mm, the
// whole gun, every degree of yaw; profiles/type74Family.ts): -6 over the front and sides, the gun riding up over the
// rear deck's edge, the stern's rail, clamps and tow eyes over the rear quarters; 266: re-swept with the 4.27 m tube
const TYPE74_GUN_PITCH_BY_YAW_DEG: readonly (readonly [number, number])[] = [[0, -6], [146, -6], [151, -4.7], [155, -4.7], [156, -4.3], [157, -4.1], [160, -4.1], [161, -2.8], [162, -2.4], [164, -2.4], [168, -2.9], [169, -4], [178, -4.4], [180, -5]];

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
  // 262 (Main's ruling on the owner's STB-1 / Type 74 rebuild): the gun's own source travel, −6/+9 (JGSDF; ArmedConflicts
  // −6.5/+9.5); the hydropneumatic hull pitch below (the special action, which bots engage when halted on a target)
  // carries it to −14/+17. It was −10/+15 at the gun.
  turretTraverseDegS: 36, gunPitchDegS: 30, gunElevationDeg: 9, gunDepressionDeg: 6,
  gunPitchByYawDeg: TYPE74_GUN_PITCH_BY_YAW_DEG,
  gun: {
    caliberMm: 105, reloadS: 5.6, baseAccuracy: 0.29, aimTimeS: 1.7,
    bloom: BLOOM_MODERN,
    shells: [
      shell('Type 93 APFSDS', 'APFSDS', 105, 540, 500, 430, 1455, { pen2000Mm: 450 }),
      shell('Type 91 HEAT-MP', 'HEAT', 105, 520, 520, 430, 1173),
      shell('M393 HEP', 'HE', 105, 45, 45, 500, 730),
    ],
  },
  // 262 (Main's ruling): heightM is the P95 combat height the geometry gate measures on the build (the STB-1's rule too);
  // at the owner's model's proportions it overrides the sources' 2.25 m with the cupola (docs/references/tanks/type74.md).
  // 263 (Main's ruling): it is the body's height, hull and turret without roof weapons, antennas or whips (bots aim at
  // 0.85 of it, the eye height reads it), so the roof M2 leaves it; the gate's p95 counts the gun and reads 2.93 m
  dims: { hullLengthM: 6.7, overallLengthM: 9.42, widthM: 3.18, heightM: 2.83 },
  armor: communityArmor({
    // 262: the Type 74 family at the owner's model's own proportions (profiles/type74Family.ts): the ring datum 1.60 m up,
    // the mask's trunnion 0.29 m over it; the armour seed's height is the old 2.25 m at those proportions
    lenM: 6.7, widM: 3.18, hgtM: 2.54, turretPivot: [0, 1.60, 0.50],
    gunPivot: [0, 0.29, 1.18], barrelLenM: 4.42, barrelRadM: 0.062,
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
