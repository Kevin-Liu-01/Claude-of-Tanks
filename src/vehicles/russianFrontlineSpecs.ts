// Combat records for the independent Russian frontline procedural builds. The owner-supplied reference GLBs are
// local measurement oracles only; no runtime model or source payload participates in these tanks.

import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { shell, modernArmor, moduleBox, crewBox as cbox } from './specHelpers.ts';
import { bindFleetRegistries, registerFleetSpecs } from './fleetSpecRegistry.ts';
import type { FleetTankSpec } from './specContracts.ts';

const RUSSIAN_FRONTLINE_SPECS = {
  // Owner-authored missile hunter (2026-09-19): retained Object chassis with
  // a raised twelve-cell launcher and a 30 mm backup cannon. This concept
  // deliberately differs from the source-based Kurganets-25 Epokha module.
  object695_x: {
    id: 'object695_x', name: 'Object 695', nation: 'Russia', era: 'next-generation', role: 'ifv',
    // Missile-primary output is not an autocannon-belt peer; explicit concept budgets are regression-tested.
    balanceCohort: 'missile-carrier',
    hp: 2150,
    enginePowerHp: 800, weightTons: 25, topSpeedKmh: 84, reverseSpeedKmh: 36,
    hullTraverseDegS: 60,
    terrainResistance: { hard: 0.62, medium: 0.72, soft: 1.20 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 84, gunPitchDegS: 60, gunElevationDeg: 35, gunDepressionDeg: 8,
    gun: {
      caliberMm: 30, reloadS: 14, baseAccuracy: 0.26, aimTimeS: 1.1,
      muzzleBoreSegments: 14, primaryGuided: true,
      launcherSalvo: { rounds: 4, intervalS: .65 },
      soundProfile: 'konkurs-launch',
      launcherMuzzles: [-1, 1].flatMap(side => [-.285, 0, .285].flatMap(dx => [.25, .55].map(y => ({ x: side * 1.10 + dx, y, z: .82 })))),
      bloom: { move: 0.040, hullRot: 0.055, turret: 0.032, afterShot: 1.10 },
      shells: [
        shell('9M-695 Tandem', 'HEAT', 152, 880, 880, 320, 380,
          { pen2000Mm: 880, reloadS: 14, count: 24, guided: true, soundProfile: 'konkurs-launch', launcherTubes: 12 }),
        shell('9M-695 Blast', 'HE', 152, 60, 60, 420, 380,
          { reloadS: 14, count: 12, guided: true, soundProfile: 'konkurs-launch', launcherTubes: 12 }),
        shell('30 mm APFSDS-T', 'APFSDS', 30, 135, 120, 34, 1120,
          { pen2000Mm: 105, reloadS: 0.22, count: 240, soundProfile: '2a42' }),
      ],
    },
    dims: { hullLengthM: 7.08, overallLengthM: 7.23, widthM: 3.985, heightM: 2.47, silhouetteHeightM: 3.90 },
    armor: (() => {
      const a = modernArmor({
        hl: 3.54, hw: 1.99, inW: 1.15, floor: 0.56, trkTop: 1.00, roofY: 2.13,
        turretPivot: [0, 2.15, -1.10], gunPivot: [0, .88, .20],
        barrelLenM: 1.35, barrelRadM: .04,
        glacis: [60, 260, 380], lower: [50, 200, 260], side: [45, 140, 200],
        skirt: [80, 300, 520], rear: 35, roof: 40,
        tw: .88, tFrontZ: .85, tRearZ: -.85, tH: .32,
        cheek: [55, 140, 190], tSide: [40, 95, 140], tRear: 30, tRoof: 28,
        mantlet: [60, 150, 210], loader: false,
      });
      // Unmanned module: the driver sits front-left beside the engine, the two operators under the module ring.
      a.crew = [
        cbox('driver', [-1.45, 0.75, 1.55], [-0.75, 1.95, 2.65]),
        cbox('gunner', [0.15, 0.75, -0.90], [0.95, 1.95, 0.20]),
        cbox('commander', [-0.95, 0.75, -0.90], [-0.15, 1.95, 0.20]),
      ];
      // The crew-operated radio belongs in the hull equipment space, aft of
      // the operators and above the fuel cells. A generic turret radio gets
      // compressed into the shallow unmanned base by anatomy calibration.
      a.modules = a.modules.map(module => module.module === 'radio'
        ? moduleBox('radio', [-.95, 1.55, -1.60], [-.55, 1.86, -1.22]) : module);
      return a;
    })(),
    visual: {
      scheme: 'digital', base: '#4f5a44', weather: '#5c6647',
      patches: ['#7d8664', '#33402c', '#6f7570'],
      marking: 'number', number: '225', trackWidthM: 0.37, camoScale: 0.34,
    },
  },
} satisfies Readonly<Record<string, FleetTankSpec>>;

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
registerFleetSpecs(registries, Object.keys(RUSSIAN_FRONTLINE_SPECS), RUSSIAN_FRONTLINE_SPECS);
