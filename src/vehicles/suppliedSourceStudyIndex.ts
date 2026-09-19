// Source-study scalar contracts shared by registration and offline comparison.
// Importing this module never registers a vehicle or loads source geometry.
import { BRITISH_US_SOURCE_STUDIES } from './britishUsSourceStudyData.ts';
import { EUROPE_SOURCE_STUDIES } from './europeSourceStudyData.ts';
import { EASTERN_SOURCE_STUDIES } from './easternSourceStudyData.ts';
import type { FleetDimensions } from './specContracts.ts';

export interface SuppliedSourceStudy {
  readonly id: string;
  readonly name: string;
  readonly donor: string;
  readonly nation: string;
  readonly role: string;
  readonly tier: number;
  readonly dimensions: FleetDimensions;
  readonly turret: readonly [number, number, number];
  readonly gun: readonly [number, number, number];
  readonly muzzleZ: number;
  readonly trackWidthM: number;
  readonly rawSha256: string;
  readonly oracleSha256: string;
  readonly sourceFile: string;
}

export const ADDITIONAL_SUPPLIED_SOURCE_STUDIES: readonly SuppliedSourceStudy[] = Object.freeze([
  ...BRITISH_US_SOURCE_STUDIES,
  ...EUROPE_SOURCE_STUDIES,
  ...Object.entries(EASTERN_SOURCE_STUDIES).map(([id, study]) => ({
    id, name: study.name, donor: study.donor, nation: study.nation,
    role: study.role === 'tank_destroyer' ? 'td' : study.role === 'light_tank' ? 'light' : study.role,
    tier: study.tier, dimensions: study.dims,
    turret: study.frame.turret, gun: study.frame.gun, muzzleZ: study.frame.muzzleZ,
    trackWidthM: study.trackWidthM, rawSha256: study.sourceSha256,
    oracleSha256: study.canonicalSha256, sourceFile: study.sourceFile,
  })),
]);
