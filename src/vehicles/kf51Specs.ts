// Boot-light combat data for the repository-authored KF51 family. The
// recovered GRIP420 asset is retained only as an attributed authoring oracle;
// neither it nor the retired T-80U comparison participates in this registry.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import {
  shell,
  apfsdsPenetration as apfsdsPens,
  communityArmor,
  frontPlate,
  reactivePlate,
} from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';
import { bindFleetRegistries } from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const BLOOM_MODERN = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 2.2 };


// ---------------------------------------------------------------------------
// NEW VEHICLE — KF51 Panther (class-template spec, communityArmor rule)
// ---------------------------------------------------------------------------
// KF51 Panther: Rheinmetall's 130 mm Future Gun System demonstrator on a
// Leopard 2 hull — the harder-hitting, slightly softer sibling of the 2A7 at
// the top of the German MBT ladder.
const KF51_SPEC = {
    id: 'kf51_evo', name: 'KF51 EVO', nation: 'Germany', era: 'modern', role: 'mbt',
    variantOf: 'kf51_evo',      // self-marker (m1a1 rule): stays on the nation tab
    hp: 2500,
    enginePowerHp: 1475, weightTons: 59, topSpeedKmh: 70, reverseSpeedKmh: 30,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 42, gunPitchDegS: 32, gunElevationDeg: 20, gunDepressionDeg: 9,
    gun: {
      // Rh-130 L/52 autoloader: 20-round carousel — fast for the caliber
      caliberMm: 130, reloadS: 5.8, baseAccuracy: 0.28, aimTimeS: 1.7,
      bloom: BLOOM_MODERN,
      shells: [
        shell('DM13 130mm APFSDS', 'APFSDS', 130, apfsdsPens(750)[0], apfsdsPens(750)[1], 610, 1750, { pen2000Mm: apfsdsPens(750)[2] }),
        shell('130mm HEAT-MP', 'HEAT', 130, 680, 680, 540, 1300),
        shell('130mm HE-ABM', 'HE', 130, 50, 50, 660, 1000),
      ],
    },
    // hullLengthM matches the raw asset's gun-excluded span (7.70) so the
    // loader normalizes at s=1.0; heightM covers the sensor head (raw 3.58
    // after the offline antenna compress — under the 1.30x clamp headroom)
    dims: { hullLengthM: 7.70, overallLengthM: 10.73, widthM: 3.60, heightM: 3.00 },
    armor: communityArmor({
      // The procedural turret rig moves forward 180 mm as one assembly. The
      // authoritative pivot follows it so armor, modules, shot origins, and
      // wreck/replay poses remain registered with the visible vehicle.
      lenM: 7.70, widM: 3.60, hgtM: 2.90, turretPivot: [0, 1.86, 0.70],
      gunPivot: [0, 0.23, 0.83], barrelLenM: 6.63, barrelRadM: 0.07,
      frontMm: 650, sideMm: 90, rearMm: 45, roofMm: 45,
      tFrontMm: 750, tSideMm: 320, tRearMm: 70, mantletMm: 500,
    }),
    visual: {
      // Bundeswehr woodland (GLB ships baked woodland — this drives the camo
      // overlay composite + the procedural stand-in while the GLB streams)
      scheme: 'nato', base: '#49543c', weather: '#515e44',
      patches: ['#23261f', '#4a3a2c'],
      marking: 'cross', number: '51', trackWidthM: 0.65, camoScale: 0.34, patchK: 1.75,
    },
} satisfies FleetTankSpec;

// 266 (FAIRNESS-265 §8): the KF51 EVO's mantlet is the turret's gun face, a main plate on the gun slot's vertical front
// (measured on the build: x +-0.430 between the cheeks' inner walls, y 0.01-0.79, z 1.088 at its foot to 1.100 at its
// head), which gunFacePlate and the gun-face split read the faces in front of the gun as. The communityArmor template's
// mantlet was a spaced plate riding the gun, behind the bridged 74-degree face the round met first
// (gen-combat-anatomy.mjs TURRET_LATERAL_CUTS cuts that face away); `drawn` keeps the envelope calibration from moving
// this one onto the cheeks' noses, and a variant on its own build (the source-X KF51 Panther) takes the template back.
const KF51_MANTLET = KF51_SPEC.armor.turretPlates.findIndex((plate) => plate.name === 'mantlet');
if (KF51_MANTLET >= 0) {
  const template = KF51_SPEC.armor.turretPlates[KF51_MANTLET];
  KF51_SPEC.armor.turretPlates[KF51_MANTLET] = { ...frontPlate('mantlet', 500, 0.43, 0.01, 1.088, 0.79, 1.1), drawn: true, template };
}

// The procedural KF51 now carries a reactive two-row flank jacket. Keep its
// combat zones in the boot-light spec registry so the visible cassettes are
// hittable, consumable and depleted by the same ERA path as the KF51B set.
KF51_SPEC.armor.hullPlates.push(
  reactivePlate('kf51_skirt_era_R', 'right'),
  reactivePlate('kf51_skirt_era_L', 'left'),
);

// The owner-source rebuild is intentionally additive. Keep the graduate KF51
// stable for saves and existing scenes while exposing the rebuilt woodland
// vehicle as KF51B with its measured palette and geometry.
const KF51B_SPEC = {
  ...KF51_SPEC,
  id: 'kf51_u', name: 'KF51-U', variantOf: 'kf51_u',
  // §5.299 fleet-integration truth-up (kf51_u row ONLY — kf51_evo's shared armor
  // object is untouched, this is a fresh communityArmor instance). The
  // rebuilt Panther is installed at 1.05x, so these are the final rendered
  // turret/gun coordinates rather than the unscaled authoring coordinates.
  // Keeping the authoritative frame on the installed transform makes armor,
  // modules, shot origins and wreck restaging coincide with the visible rig.
  // Track decal width follows the built 0.587 course.
  armor: communityArmor({
    lenM: 7.70, widM: 3.60, hgtM: 2.90, turretPivot: [0, 1.806, 0.6825],
    // The complete gun assembly is seated 0.40 m farther into the turret,
    // or 0.42 m in the installed frame; barrel length/caliber stay unchanged.
    gunPivot: [0, 0.231, 1.239], barrelLenM: 5.565, barrelRadM: 0.0672,
    frontMm: 650, sideMm: 90, rearMm: 45, roofMm: 45,
    tFrontMm: 750, tSideMm: 320, tRearMm: 70, mantletMm: 500,
  }),
  visual: {
    ...KF51_SPEC.visual,
    base: '#56573e', weather: '#51533f', patches: ['#303c30', '#473729'],
    number: '52', patchK: 1.28, trackWidthM: 0.587,
  },
} satisfies FleetTankSpec;

KF51B_SPEC.armor.hullPlates.push(
  reactivePlate('kf51b_skirt_era_R', 'right'),
  reactivePlate('kf51b_skirt_era_L', 'left'),
);

const KF51_SPECS = {
  kf51_evo: KF51_SPEC,
  kf51_u: KF51B_SPEC,
} satisfies Readonly<Record<string, FleetTankSpec>>;

// ---------------------------------------------------------------------------
// Registration (idempotent — vite HMR can re-evaluate this module)
// ---------------------------------------------------------------------------
for (const id of ['kf51_evo', 'kf51_u'] as const) {
  registries.tankSpecs[id] ||= KF51_SPECS[id];
  if (!registries.allTankIds.includes(id)) registries.allTankIds.push(id);
}

export { KF51_SPEC, KF51B_SPEC };
