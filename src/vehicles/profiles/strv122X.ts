// Independent owner-selected supplied-file X target; no family/photo builder.
import { buildStrv122XSupplied } from './strv122XSupplied.ts';
import { STRV122_SUPPLIED_DATUMS } from './strv122XSuppliedFrame.ts';
export const STRV122_X_DATUMS = Object.freeze({ strv122_x: STRV122_SUPPLIED_DATUMS });
export const STRV122_X_PROFILES = Object.freeze({ strv122_x: { build: buildStrv122XSupplied } });
