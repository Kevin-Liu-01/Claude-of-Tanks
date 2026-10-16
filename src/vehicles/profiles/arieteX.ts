// Independent supplied-file X target; no photo-draft or family builder is used.
import { buildArieteXSupplied } from './arieteXSupplied.ts';
import { ARIETE_C1_X_DATUMS, ARIETE_C2_X_DATUMS, ARIETE_X_FAMILY_SCALE } from './arieteXFamilyFrame.ts';
import { enlargeArieteXFamily } from './arieteXFamilyScale.ts';
import { buildArieteC2X } from './arieteC2X.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

function buildEnlargedArieteC1(P: TankBuilderPort): void {
  // Keep the enlarged exterior but retain the weapon's actual120mm aperture.
  buildArieteXSupplied(P, ARIETE_C1_X_DATUMS.boreRadiusM / ARIETE_X_FAMILY_SCALE);
  enlargeArieteXFamily(P);
}

export const ARIETE_X_DATUMS = Object.freeze({ c1_ariete: ARIETE_C1_X_DATUMS,
  c2_ariete: ARIETE_C2_X_DATUMS });
export const ARIETE_X_PROFILES = Object.freeze({ c1_ariete: { build: buildEnlargedArieteC1 },
  c2_ariete: { build: buildArieteC2X } });
