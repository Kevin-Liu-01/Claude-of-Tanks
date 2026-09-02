// Boot-light combat record for the independent VT-4A1 procedural build.
// The owner-supplied GLB is a local measurement oracle only; no runtime model
// or source payload participates in this tank.

import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { modernArmor, shell, apfsdsPenetration } from './specHelpers.ts';
import { bindFleetRegistries, registerFleetSpecs } from './fleetSpecRegistry.ts';
import type { FleetTankSpec } from './specContracts.ts';

const p = apfsdsPenetration(720);

export const CHINESE_FRONTLINE_SPECS = {
  vt4a1: {
    id: 'vt4a1', name: 'VT-4A1', nation: 'China', era: 'modern', role: 'mbt',
    hp: 2650,
    enginePowerHp: 1300, weightTons: 52, topSpeedKmh: 70, reverseSpeedKmh: 18,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.70, medium: 0.80, soft: 1.45 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 40, gunPitchDegS: 31, gunElevationDeg: 14, gunDepressionDeg: 7,
    gun: {
      caliberMm: 125, reloadS: 6.4, baseAccuracy: 0.29, aimTimeS: 1.85,
      bloom: { move: 0.055, hullRot: 0.075, turret: 0.055, afterShot: 2.1 },
      shells: [
        shell('BTA4 APFSDS', 'APFSDS', 125, p[0], p[1], 550, 1780, { pen2000Mm: p[2] }),
        shell('BK-125 HEAT-MP', 'HEAT', 125, 700, 700, 490, 980),
        shell('DTB-125 HE', 'HE', 125, 55, 55, 600, 900),
      ],
    },
    // Directly measured from the supplied reference: 3.50 m broad envelope,
    // 7.6 m hull course and 10.1 m stern-to-muzzle silhouette. Thin whips are
    // excluded from the height datum.
    dims: {
      hullLengthM: 7.64, overallLengthM: 10.10, widthM: 3.50, heightM: 3.15,
      // The source's substantial 12%-thickness body trace is 7.491 m; the
      // published 7.64 m envelope includes thin rear and bow fittings.
      silhouetteHullLengthM: 7.49,
    },
    armor: modernArmor({
      hl: 3.82, hw: 1.75, inW: 1.13, floor: 0.42, trkTop: 1.08, roofY: 1.62,
      turretPivot: [0, 1.62, -0.18], gunPivot: [0, 0.32, 1.47],
      barrelLenM: 5.02, barrelRadM: 0.076,
      glacis: [650, 690, 980], lower: [180, 240, 320], side: [80, 120, 180],
      skirt: [95, 170, 420], rear: 50, roof: 45,
      tw: 1.64, tFrontZ: 1.72, tRearZ: -2.66, tH: 0.98,
      cheek: [720, 760, 1120], tSide: [300, 360, 520], tRear: 70, tRoof: 50,
      mantlet: [420, 480, 620], loader: false, bustleAmmo: true,
    }),
    visual: {
      scheme: 'digital', base: '#4b563a', weather: '#59644b',
      patches: ['#6f6b4b', '#313b2b', '#242820'],
      marking: 'number', number: '401', trackWidthM: 0.60, camoScale: 0.46,
    },
  },
} satisfies Readonly<Record<string, FleetTankSpec>>;

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
registerFleetSpecs(registries, Object.keys(CHINESE_FRONTLINE_SPECS), CHINESE_FRONTLINE_SPECS);
