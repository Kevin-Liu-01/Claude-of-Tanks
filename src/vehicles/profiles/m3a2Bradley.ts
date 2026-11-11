// Kevin B. Liu — the M3A2 Bradley (ODS) cavalry fighting vehicle. 268 (owner 2026-11-02: "also make a new variant of the
// bradley based on the old turret we had before doing this") built it as the shared hull under the classic turret; 269
// (owner 2026-11-05: "the m3a2 bradley USA should be m2a2 bradley, and our current m2a2 bradley usa should be the m3a2
// bradley") swapped the two: the M3A2 is the shared hull under the turret measured from the owner's source, with its
// flank dressing and crew bags (modern3.ts buildBradleySourceTurretIfv, the M2A2's 268 build), and the M2A2 carries the
// classic turret (modern3.ts buildM2A2Bradley). docs/references/tanks/m3a2_bradley.md.
import { buildBradleySourceTurretIfv } from '../modern3.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export function buildM3A2Bradley(P: TankBuilderPort): void {
  buildBradleySourceTurretIfv(P);
}
