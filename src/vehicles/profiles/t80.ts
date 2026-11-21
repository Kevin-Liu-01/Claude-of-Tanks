// The T-80 line's profile registry. Release 274 (lane t80-family-274, the owner 2026-11-20): the T-80, T-80B and
// T-80BV build on the T-80U X hull with their own early casting and era kits (profiles/t80Marks.ts); the August print
// fits that lived here are retired. The T-84 slot keeps its Oplot modernization (profiles/oplotModern.ts).
import {buildOplotModern} from './oplotModern.ts';
import {T80_MARK_PROFILES} from './t80Marks.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';

export const T80_PROFILES = {
  ...T80_MARK_PROFILES,
  t84: { build: buildOplotModern },
} satisfies VehicleProfileRecord;
