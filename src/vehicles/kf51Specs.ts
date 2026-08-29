// Boot-light combat data for the repository-authored KF51 family. The
// recovered GRIP420 asset is retained only as an attributed authoring oracle;
// neither it nor the retired T-80U comparison participates in this registry.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import {
  shell,
  apfsdsPenetration as apfsdsPens,
  communityArmor,
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
    id: 'kf51', name: 'KF51 Panther', nation: 'Germany', era: 'modern', role: 'mbt',
    variantOf: 'kf51',      // self-marker (m1a1 rule): stays on the nation tab
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
      lenM: 7.70, widM: 3.60, hgtM: 2.90, turretPivot: [0, 1.86, 0.52],
      gunPivot: [0, 0.31, 0.83], barrelLenM: 6.63, barrelRadM: 0.07,
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

// The owner-source rebuild is intentionally additive. Keep the graduate KF51
// stable for saves and existing scenes while exposing the rebuilt woodland
// vehicle as KF51B with its measured palette and geometry.
const KF51B_SPEC = {
  ...KF51_SPEC,
  id: 'kf51b', name: 'KF51B Panther', variantOf: 'kf51b',
  // §5.299 fleet-integration truth-up (kf51b row ONLY — kf51's shared armor
  // object is untouched, this is a fresh communityArmor instance): the
  // b-variant builder seats its ring at 1.72/0.20 and the gun axis at 1.94
  // with the measured 5.30 m Rh-130 tube (source muzzle world 6.88). The
  // inherited kf51 row carried the GLB-era 6.63 m barrel + 1.86/0.52
  // pivots — a §C shadow proxy 1.33 m too long and an aim rig offset from
  // the visual trunnion. Track decal width follows the built 0.587 course.
  armor: communityArmor({
    lenM: 7.70, widM: 3.60, hgtM: 2.90, turretPivot: [0, 1.72, 0.20],
    gunPivot: [0, 0.22, 1.58], barrelLenM: 5.30, barrelRadM: 0.064,
    frontMm: 650, sideMm: 90, rearMm: 45, roofMm: 45,
    tFrontMm: 750, tSideMm: 320, tRearMm: 70, mantletMm: 500,
  }),
  visual: {
    ...KF51_SPEC.visual,
    base: '#56573e', weather: '#51533f', patches: ['#303c30', '#473729'],
    number: '52', patchK: 1.28, trackWidthM: 0.587,
  },
} satisfies FleetTankSpec;

const KF51_SPECS = {
  kf51: KF51_SPEC,
  kf51b: KF51B_SPEC,
} satisfies Readonly<Record<string, FleetTankSpec>>;

// ---------------------------------------------------------------------------
// Registration (idempotent — vite HMR can re-evaluate this module)
// ---------------------------------------------------------------------------
for (const id of ['kf51', 'kf51b'] as const) {
  registries.tankSpecs[id] ||= KF51_SPECS[id];
  if (!registries.allTankIds.includes(id)) registries.allTankIds.push(id);
}

export { KF51_SPEC, KF51B_SPEC };
