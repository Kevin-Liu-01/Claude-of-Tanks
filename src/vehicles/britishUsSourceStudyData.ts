// Boot-light source datums. These records do not register or mutate fleet specs.
// The associated GLBs are owner-supplied local comparison inputs only.
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
  readonly rawSha256: string;
  readonly oracleSha256: string;
  readonly groundTranslationY: number;
  readonly sourceFile: string;
}

export const BRITISH_US_SOURCE_STUDIES: readonly SourceStudyRecord[] = Object.freeze([
  {
    id: 'fv510_milan_x', name: 'Warrior MILAN X', donor: 'fv510_milan',
    nation: 'UK', role: 'ifv', tier: 9,
    dimensions: {
      hullLengthM: 6.7793, overallLengthM: 6.7793, widthM: 4.2305, heightM: 3.13,
      silhouetteHullLengthM: 6.7793, silhouetteOverallLengthM: 6.7793,
      silhouetteWidthM: 4.2305, silhouetteHeightM: 3.13,
    },
    turret: [.175, 1.965, -.42], gun: [.114, 2.23, .70], muzzleZ: 3.0793,
    trackWidthM: .453, groundTranslationY: .005,
    rawSha256: '5bb512734139e4beaeaa3775bdc68913431a555a2d1d46f395a47a8fa0a5ea45',
    oracleSha256: 'e568badc436980b9f2b718db9786120fcc7527b7fe6465c3efa66889fa208c04',
    sourceFile: 'fv510_warrior_milan_war_thunder.glb',
  },
  {
    id: 'griffin50_x', name: 'Griffin 50 mm X', donor: 'spz_puma',
    nation: 'USA', role: 'ifv', tier: 10,
    dimensions: {
      hullLengthM: 6.6054, overallLengthM: 6.77934, widthM: 3.8106, heightM: 3.75,
      silhouetteHullLengthM: 6.6054, silhouetteOverallLengthM: 6.77934,
      silhouetteWidthM: 3.8106, silhouetteHeightM: 3.75,
    },
    turret: [0, 2.07, -.36], gun: [0, 2.60, .74], muzzleZ: 3.67194,
    trackWidthM: .575, groundTranslationY: .029,
    rawSha256: 'ab4daa4ba8eed3eff25c77c35bd7082a2de7d188bd0c87e6fc73c57e7076bfca',
    oracleSha256: '62f6e270698d7b218184ada575289da3cc1b362da4d96a8314d6e1277d618d34',
    sourceFile: 'griffin_50mm_armored_warfare.glb',
  },
  {
    id: 'ajax_x', name: 'Ajax X', donor: 'cv90', nation: 'UK', role: 'ifv', tier: 9,
    dimensions: {
      hullLengthM: 8.1036, overallLengthM: 8.1036, widthM: 4.1426, heightM: 3.60,
      silhouetteHullLengthM: 8.1036, silhouetteOverallLengthM: 8.1036,
      silhouetteWidthM: 4.1426, silhouetteHeightM: 3.60,
    },
    turret: [-.05, 2.10, -1.05], gun: [0, 2.506, .67], muzzleZ: 3.099,
    trackWidthM: .597, groundTranslationY: .001,
    rawSha256: '5b2759b557a9d02af059dcf0e03eb6b41bdc6e7ecb62da17c4a8f224e48581f1',
    oracleSha256: '506a31e984730c4ab6a398a4f1305a2fe6220960699842d8ed62ec0b4a2658f0',
    sourceFile: 'ajax_armored_warfare.glb',
  },
]);
