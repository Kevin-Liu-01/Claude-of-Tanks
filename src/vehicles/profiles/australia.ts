// The Australian line's own builders (release 269, australiaSpecs.ts), with the US M113A3 on the same M113 build: one
// demand-loaded pack. First-party procedural
// geometry: Kevin B. Liu (NOTICE.md).
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { buildM113A1Fsv, buildM113A1Mrv, buildM113A3, buildM113AS4 } from './m113.ts';
import { buildLeopardAS1 } from './leopard1Dk.ts';
import { buildRedback } from './redback.ts';
import { buildM1A1AimSaAus } from './abramsAus.ts';
import { buildAbramsX } from './abramsSourceX.ts';

export const AUSTRALIA_PROFILES = {
  m113a1_fsv: { build: buildM113A1Fsv },
  m113a1_mrv: { build: buildM113A1Mrv },
  m113as4: { build: buildM113AS4 },
  // (the US Army's M113A3 on the same M113 build, demand-loaded with the line's pack)
  m113a3: { build: buildM113A3 },
  // the Leopard AS1 on the Danish line's welded 1A3 turret (the 'as1' mark)
  leopard_as1: { build: buildLeopardAS1 },
  redback: { build: buildRedback },
  // the M1A1 AIM SA on the plain M1A1 build with its Australian kit; the M1A2 SEPv3 on the source study's SEPv3 with the
  // 'mounts' Trophy fit, the stock skirts and no ARAT (abramsSourceX.ts)
  m1a1_aim_sa_aus: { build: buildM1A1AimSaAus },
  m1a2_sepv3_aus: { build: buildAbramsX },
} satisfies VehicleProfileRecord;
