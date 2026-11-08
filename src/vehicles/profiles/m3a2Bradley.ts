// Kevin B. Liu — the M3A2 Bradley (ODS) cavalry fighting vehicle: the shared Bradley hull under the classic M2A2 turret.
// Owner, 2026-11-02: "also make a new variant of the bradley based on the old turret we had before doing this. i liked the
// shape and all the stuff arounnd it" (docs/references/tanks/m3a2_bradley.md). The M3A2 carried the M2A2's two-man
// turret; the hull is the family's (modern3.ts buildBradleyHull + bradleyFlankDressing, rebuilt in place from the
// owner's measured source), the turret the 7cc204ab32 m2a2_bradley turret (bradleyClassicTurret.ts), seated on that
// hull's ring datum (BRADLEY_TURRET_RING; the spec's armor.turretPivot stands there).
import { buildBradleyHull, bradleyFlankDressing, BRADLEY_TURRET_RING } from '../modern3.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { buildBradleyClassicTurret } from './bradleyClassicTurret.ts';

export function buildM3A2Bradley(P: TankBuilderPort): void {
  buildBradleyHull(P);
  bradleyFlankDressing(P, { turretSeat: false });
  buildBradleyClassicTurret(P, { deckY: BRADLEY_TURRET_RING.deckY - P.spec.armor.turretPivot[1] });
}
