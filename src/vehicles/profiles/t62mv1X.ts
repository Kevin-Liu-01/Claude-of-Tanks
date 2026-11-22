// The T-62MV (obr. 1985) group entry: the lazy fleet group `t62mv1X` registers the T-62 family's MV build
// (t62Family.ts, lane t62-275).
import { buildT62MV } from './t62Family.ts';

export const T62MV1_X_PROFILES = { t62mv1: { build: buildT62MV } } as const;
