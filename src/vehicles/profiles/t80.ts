// The T-80 line's profile registry. Release 274 (lane t80-family-274, the owner 2026-11-20): the T-80, T-80B and
// T-80BV build on the T-80U X hull with their own early casting and era kits (profiles/t80Marks.ts), and the T-84
// (Object 478DU2) on the same hull with its welded turret and 6TD-2 deck (profiles/t84.ts); the August print fits and
// the T-72B3M-hull Oplot concept that lived here are retired.
import {buildT84} from './t84.ts';
import {T80_MARK_PROFILES} from './t80Marks.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';

export const T80_PROFILES = {
  ...T80_MARK_PROFILES,
  t84: { build: buildT84 },
} satisfies VehicleProfileRecord;
