// The Australian line's own builders (release 269, australiaSpecs.ts): one demand-loaded pack. First-party procedural
// geometry: Kevin B. Liu (NOTICE.md).
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { buildM113A1Fsv, buildM113A1Mrv, buildM113AS4 } from './m113.ts';
import { buildLeopardAS1 } from './leopard1Dk.ts';

export const AUSTRALIA_PROFILES = {
  m113a1_fsv: { build: buildM113A1Fsv },
  m113a1_mrv: { build: buildM113A1Mrv },
  m113as4: { build: buildM113AS4 },
  // the Leopard AS1 on the Danish line's welded 1A3 turret (the 'as1' mark)
  leopard_as1: { build: buildLeopardAS1 },
} satisfies VehicleProfileRecord;
