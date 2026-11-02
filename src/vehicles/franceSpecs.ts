// Boot-light combat-data registration for the French AMX-40. The procedural
// geometry implementation is demand-loaded from france.ts when selected.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import { shell, apfsdsPenetration as apfsdsPens, modernArmor } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';
import { bindFleetRegistries, registerFleetSpecs } from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const BLOOM_MODERN = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 2.2 };

// 267 (Main's ruling, 2026-11-01): its measured gun stops (tools/gun-depression-sweep.mjs at 26 mm): the barrel over the
// bow-corner width poles (1.775 m, yaw 15-19) and lamp housings (yaw 20-26) and aft over the engine plateau; over the bow
// spare-track links (yaw 5-13) at -4, where the stowage seat pass keeps them (spareTrackSeat.ts: 5 cm from the gun; at
// -4.3 it leaves them unbuilt; the barrel alone keeps 26 mm to -6). The mantlet stands in a known conflict with the
// deck there (nationalGunClearance.selftest.mjs holds the barrel there).
const AMX40_PROTO_GUN_PITCH_BY_YAW_DEG = Object.freeze([[0, -8], [2, -8], [4, -7.7], [5, -4], [13, -4], [14, -1.6],
  [15, -0.5], [16, -0.3], [18, -0.3], [19, -0.5], [21, -2.2], [24, -2.3], [25, -2.5], [26, -3.1], [27, -5.2],
  [28, -6.7], [32, -6.2], [34, -6.2], [35, -6.7], [37, -8], [70, -8], [71, 0.1], [73, 0.1], [74, -8], [125, -8],
  [127, -6.7], [128, -6.3], [130, -6.3], [132, -6.1], [134, -5.6], [135, -5.4], [142, -5.4], [143, -3], [144, -1.9],
  [145, -1.6], [149, -1.3], [150, -0.6], [151, -0.5], [157, -0.4], [180, -0.4]] as const);

const FRANCE_SPECS = {
  amx40_proto: {
    id: 'amx40_proto', name: 'AMX-40 Prototype', nation: 'France', era: 'modern', role: 'mbt',
    hp: 2000,
    enginePowerHp: 1100, weightTons: 43.7, topSpeedKmh: 70, reverseSpeedKmh: 22,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.4 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 40, gunPitchDegS: 30, gunElevationDeg: 20, gunDepressionDeg: 8,
    gunPitchByYawDeg: AMX40_PROTO_GUN_PITCH_BY_YAW_DEG,
    gun: {
      caliberMm: 120, reloadS: 6.5, baseAccuracy: 0.30, aimTimeS: 1.9,
      bloom: BLOOM_MODERN,
      shells: [
        shell('OFL 120 F1 APFSDS', 'APFSDS', 120, apfsdsPens(460)[0], apfsdsPens(460)[1], 510, 1650, { pen2000Mm: apfsdsPens(460)[2] }),
        shell('OECC 120 F1 HEAT', 'HEAT', 120, 600, 600, 470, 1100),
        shell('OE 120 F1 HE', 'HE', 120, 45, 45, 560, 950),
      ],
    },
    dims: { hullLengthM: 6.8, overallLengthM: 10.04, widthM: 3.36, heightM: 2.62 },
    armor: modernArmor({
      hl: 3.4, hw: 1.66, inW: 1.00, floor: 0.44, trkTop: 1.28, roofY: 1.66,
      turretPivot: [-0.001, 1.545, -0.421],
      gunPivot: [0.001, 0.395, 1.721],
      barrelLenM: 5.322, barrelRadM: 0.075,
      glacis: [80, 380, 480], lower: [60, 120, 150], side: [40, 60, 70],
      skirt: [15, 40, 120], rear: 30, roof: 30,
      tw: 1.55, tFrontZ: 1.96, tRearZ: -1.97, tH: 1.08,
      cheek: [420, 430, 620], tSide: [180, 200, 280], tRear: 45, tRoof: 35,
      mantlet: [320, 340, 430], loader: true, bustleAmmo: false,
    }),
    visual: {
      scheme: 'solid', base: '#96835a', weather: '#a4916a', patches: [],
      marking: 'number', number: '02', trackWidthM: 0.57, camoScale: 0.5,
    },
  },
} satisfies Record<string, FleetTankSpec>;

registerFleetSpecs(registries, Object.keys(FRANCE_SPECS), FRANCE_SPECS);
