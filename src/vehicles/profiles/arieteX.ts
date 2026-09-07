// Independent supplied-file X target; no photo-draft or family builder is used.
import { buildArieteXSupplied } from './arieteXSupplied.ts';
import { ARIETE_SUPPLIED_X_DATUMS } from './arieteXSuppliedFrame.ts';
export const ARIETE_X_DATUMS = Object.freeze({ ariete_c1_x: ARIETE_SUPPLIED_X_DATUMS });
export const ARIETE_X_PROFILES = Object.freeze({ ariete_c1_x: { build: buildArieteXSupplied } });
