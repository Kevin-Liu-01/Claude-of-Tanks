// Boot-light combat-data registration for the French AMX-40. The procedural
// geometry implementation is demand-loaded from france.js when selected.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';
import { shell, apfsdsPenetration as apfsdsPens, modernArmor } from './specHelpers.ts';
import type {
  FleetTankSpec,
  ModelSourceRegistry,
  TankSpecRegistry,
} from './specContracts.ts';

const tankSpecs = TANK_SPECS as unknown as TankSpecRegistry;
const modelSources = MODEL_SOURCE as unknown as ModelSourceRegistry;
const allTankIds = ALL_TANK_IDS as unknown as string[];

const BLOOM_MODERN = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 2.2 };

export const FRANCE_SPECS = {
  amx40: {
    id: 'amx40', name: 'AMX-40', nation: 'France', era: 'modern', role: 'mbt',
    hp: 2000,
    enginePowerHp: 1100, weightTons: 43.7, topSpeedKmh: 70, reverseSpeedKmh: 22,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.4 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 40, gunPitchDegS: 30, gunElevationDeg: 20, gunDepressionDeg: 8,
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

for (const [id, spec] of Object.entries(FRANCE_SPECS)) {
  tankSpecs[id] ||= spec;
  modelSources[id] ||= { source: 'procedural' };
  if (!allTankIds.includes(id)) allTankIds.push(id);
}
