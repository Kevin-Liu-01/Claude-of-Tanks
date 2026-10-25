/**
 * turretSeatPlane.ts — the plane the turret seat (turretSeatRace.ts) lays a turret's surfaces on round its ring, from the
 * calibration's ring receipt: pure numbers, shared by the drawn seat and by combat anatomy's surface-authored turret plates.
 *
 * Copyright © 2026 Kevin B. Liu. Created, designed and directed by Kevin B. Liu; first-party Reserved Content
 * (LicenseRef-Claude-of-Tanks-Proprietary-Content-1.0, LICENSE-POLICY.md, NOTICE.md). Claude was a development tool for
 * this file, not an author. provenance: urn:claude-of-tanks:vehicle-helper:turret-seat-plane.
 */

/** The seam between the deck round the ring and the turret's lowest surface outside the race (m). */
const TURRET_SEAT_GAP_M = 0.03;
/** Past the race's rim, where the turret's surfaces are seated over the deck (m). */
const SEAT_RIM_CLEAR_M = 0.02;
/** The swept deck's radius band (m), and its value where no hull lies at that radius on any bearing (m under the deck). */
export const TURRET_SWEEP_BIN_M = 0.05;
export const TURRET_SWEEP_FLOOR_M = -1;
/** How far either side of a corner's radius the swept deck under it is read (m): its 2.5 cm grid's cells, and the
 *  reach of the faces round the corner (a face's edge between two seated corners runs straight). */
const SWEEP_READ_M = 0.10;
/** The most the seat rises over the deck round the ring's plane (m). */
const TURRET_SEAT_RISE_M = 0.04;

/** The ring receipt's fields the seat reads (combatAnatomyCalibrationRegistry.ts turretRing). */
export interface TurretSeatRaceReceipt {
  readonly seat: readonly number[];
  readonly deckY: number;
  readonly rimR: number;
  readonly sweepR0?: number;
  readonly sweepDy?: readonly number[];
}

/** A builder's own seat limits (turretG.userData; turretSeatRace.ts's header). */
export interface TurretSeatLimits {
  turretSeatKeepR?: number;
  turretSeatRiseM?: number;
  turretSeatReadM?: number;
  turretSeatMinY?: number;
}

/** The seat's plane round one ring: the keep radius about the ring's axis and the plane a corner at plan radius r comes up
 *  to (rig_hull frame); null for a receipt that names no ring. */
export interface TurretSeatPlane {
  readonly cx: number;
  readonly cz: number;
  readonly keepR: number;
  planeAt(r: number): number;
}

export function turretSeatPlane(receipt: TurretSeatRaceReceipt | null | undefined, limits: TurretSeatLimits = {}): TurretSeatPlane | null {
  if (!receipt || !(receipt.rimR > 0.3) || !Number.isFinite(receipt.deckY)) return null;
  const own = (value: number | undefined, fallback: number): number => typeof value === 'number' ? value : fallback;
  const seatY = receipt.deckY + TURRET_SEAT_GAP_M, keepR = own(limits.turretSeatKeepR, receipt.rimR + SEAT_RIM_CLEAR_M);
  const sweep = receipt.sweepDy, sweepR0 = receipt.sweepR0 ?? Infinity;
  const rise = own(limits.turretSeatRiseM, TURRET_SEAT_RISE_M), read = own(limits.turretSeatReadM, SWEEP_READ_M);
  const floorY = own(limits.turretSeatMinY, -Infinity);
  // the plane a corner at plan radius r comes up to: its gap over the swept deck's highest band within SWEEP_READ_M of
  // r (no higher than TURRET_SEAT_RISE_M over the deck round the ring), or the deck's own plane without a swept deck
  const planeAt = (r: number): number => {
    if (!sweep?.length || r < sweepR0) return Math.max(seatY, floorY);
    const b0 = Math.max(0, Math.floor((r - read - sweepR0) / TURRET_SWEEP_BIN_M));
    const b1 = Math.min(sweep.length - 1, Math.floor((r + read - sweepR0) / TURRET_SWEEP_BIN_M));
    if (Math.floor((r + SWEEP_READ_M - sweepR0) / TURRET_SWEEP_BIN_M) >= sweep.length) return Math.max(seatY, floorY);
    let dy = TURRET_SWEEP_FLOOR_M;
    for (let b = b0; b <= b1; b++) dy = Math.max(dy, sweep[b]);
    return Math.max(seatY + Math.min(dy, rise), floorY);
  };
  return { cx: receipt.seat[0], cz: receipt.seat[2], keepR, planeAt };
}
