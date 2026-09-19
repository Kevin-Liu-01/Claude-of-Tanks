// Combat records for the independent Russian frontline procedural builds. The owner-supplied reference GLBs are
// local measurement oracles only; no runtime model or source payload participates in these tanks.

import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { shell, modernArmor, crewBox as cbox } from './specHelpers.ts';
import { bindFleetRegistries, registerFleetSpecs } from './fleetSpecRegistry.ts';
import type { FleetTankSpec } from './specContracts.ts';

const RUSSIAN_FRONTLINE_SPECS = {
  // Object 695 (owner 2026-09-17; named 2026-09-18 — the Codex-built `kurganets25_x` is the Kurganets-25, this build is
  // fielded under the factory index): Russia's next-generation tracked IFV, generated from the owner's supplied
  // Armored Warfare reference model (a local comparison oracle only, see
  // docs/references/tanks/object695_x.source-measurements.json). Seven paired road wheels, full-length side armour
  // modules, an unmanned module with the 30 mm autocannon on the centreline — the owner's "machine gun like machine gun
  // that's very powerful": the fastest, hardest-hitting belt in the fleet — twin Kornet-EM launchers and three masts.
  // First-party procedural build (profiles/object695X.ts).
  object695_x: {
    id: 'object695_x', name: 'Object 695', nation: 'Russia', era: 'next-generation', role: 'ifv',
    hp: 2650,
    enginePowerHp: 800, weightTons: 25, topSpeedKmh: 80, reverseSpeedKmh: 34,
    hullTraverseDegS: 56,
    terrainResistance: { hard: 0.62, medium: 0.72, soft: 1.20 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 72, gunPitchDegS: 56, gunElevationDeg: 60, gunDepressionDeg: 8,
    gun: {
      caliberMm: 30, reloadS: 0.26, baseAccuracy: 0.22, aimTimeS: 0.9,
      muzzleBoreSegments: 14,
      soundProfile: '2a42',
      bloom: { move: 0.034, hullRot: 0.048, turret: 0.032, afterShot: 1.10 },
      shells: [
        shell('3UBR11 APFSDS-T', 'APFSDS', 30, 265, 245, 88, 1300, { pen2000Mm: 225, reloadS: 0.26, count: 500 }),
        shell('9M133M-2 Kornet-EM', 'HEAT', 152, 1200, 1200, 760, 300,
          { reloadS: 2.6, count: 8, guided: true, soundProfile: 'konkurs-launch' }),
        shell('3UOF8 HE-I', 'HE', 30, 14, 14, 100, 960, { reloadS: 0.26, count: 500 }),
      ],
    },
    dims: { hullLengthM: 7.08, overallLengthM: 7.23, widthM: 3.985, heightM: 2.19, silhouetteHeightM: 3.49 },
    armor: (() => {
      const a = modernArmor({
        hl: 3.54, hw: 1.99, inW: 1.15, floor: 0.56, trkTop: 1.00, roofY: 2.13,
        turretPivot: [0, 2.15, -1.10], gunPivot: [0, 0.66, 0.65],
        barrelLenM: 3.65, barrelRadM: 0.032,
        glacis: [60, 260, 380], lower: [50, 200, 260], side: [45, 140, 200],
        skirt: [80, 300, 520], rear: 35, roof: 40,
        tw: 1.05, tFrontZ: 0.85, tRearZ: -1.57, tH: 0.90,
        cheek: [90, 240, 320], tSide: [60, 150, 220], tRear: 40, tRoof: 36,
        mantlet: [100, 250, 330], loader: false,
      });
      // Unmanned module: the driver sits front-left beside the engine, the two operators under the module ring.
      a.crew = [
        cbox('driver', [-1.45, 0.75, 1.55], [-0.75, 1.95, 2.65]),
        cbox('gunner', [0.15, 0.75, -0.90], [0.95, 1.95, 0.20]),
        cbox('commander', [-0.95, 0.75, -0.90], [-0.15, 1.95, 0.20]),
      ];
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
