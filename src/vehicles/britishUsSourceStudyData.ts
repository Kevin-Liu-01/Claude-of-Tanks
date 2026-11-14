// Boot-light measured datums. These records do not register or mutate fleet specs.
import type { FleetDimensions } from './specContracts.ts';

interface SourceStudyRecord {
  readonly id: string;
  readonly name: string;
  readonly donor: string;
  readonly nation: string;
  readonly role: 'ifv';
  readonly tier: number;
  readonly dimensions: FleetDimensions;
  readonly turret: readonly [number, number, number];
  readonly gun: readonly [number, number, number];
  readonly muzzleZ: number;
  readonly trackWidthM: number;
  readonly groundTranslationY: number;
}

export const BRITISH_US_SOURCE_STUDIES: readonly SourceStudyRecord[] = Object.freeze([
  {
    // VEH-11 (2026-10-13): the Warrior MILAN X is its own Warrior type, the Warrior TES(H), at tier X.
    id: 'warrior_tes_h', name: 'Warrior TES(H)', donor: 'fv510_milan',
    nation: 'UK', role: 'ifv', tier: 10,
    dimensions: {
      hullLengthM: 6.7793, overallLengthM: 6.7793, widthM: 4.2305, heightM: 3.13,
      silhouetteHullLengthM: 6.7793, silhouetteOverallLengthM: 6.7793,
      silhouetteWidthM: 4.2305, silhouetteHeightM: 3.13,
    },
    turret: [.175, 1.965, -.42], gun: [.114, 2.23, .70], muzzleZ: 3.0793,
    trackWidthM: .453, groundTranslationY: .005,
  },
  {
    id: 'griffin50mm', name: 'Griffin 50 mm', donor: 'spz_puma',
    nation: 'USA', role: 'ifv', tier: 10,
    dimensions: {
      hullLengthM: 6.6054, overallLengthM: 6.77934, widthM: 3.8106, heightM: 3.75,
      silhouetteHullLengthM: 6.6054, silhouetteOverallLengthM: 6.77934,
      silhouetteWidthM: 3.8106, silhouetteHeightM: 3.75,
    },
    turret: [0, 2.07, -.36], gun: [0, 2.60, .74], muzzleZ: 3.67194,
    trackWidthM: .575, groundTranslationY: .029,
  },
  {
    id: 'ajax', name: 'Ajax', donor: 'cv90', nation: 'UK', role: 'ifv', tier: 9,
    dimensions: {
      hullLengthM: 8.1036, overallLengthM: 8.1036, widthM: 4.1426, heightM: 3.60,
      silhouetteHullLengthM: 8.1036, silhouetteOverallLengthM: 8.1036,
      silhouetteWidthM: 4.1426, silhouetteHeightM: 3.60,
    },
    turret: [-.05, 2.10, -1.05], gun: [0, 2.506, .67], muzzleZ: 3.099,
    trackWidthM: .597, groundTranslationY: .001,
  },
]);
