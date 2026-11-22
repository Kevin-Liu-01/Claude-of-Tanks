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
/** 274: the foot band's read (m): its faces are read along their edges every 2.5 cm (turretSeatRace.ts), so the plane
 *  under a point needs only its own bin and the next; the corner read's 10 cm lifted a foot over hull kit a band further
 *  out (the BWP-1's hull cupola). */
const FOOT_READ_M = 0.03;
/** The most the seat rises over the deck round the ring's plane (m), away from the turret's foot (turretSeatRace.ts). */
const TURRET_SEAT_RISE_M = 0.04;
/** The smallest ring the plane is read for (m). 274 (turret-deck-gate): 0.3 m left the ARES APC's 0.22 m ring with no seat
 *  at all and its turret's foot 7 cm into its deck; the drawn race keeps its own 0.3 m guard (turretSeatRace.ts). */
const SEAT_MIN_RIM_M = 0.15;

/** The ring receipt's fields the seat reads (combatAnatomyCalibrationRegistry.ts turretRing). */
export interface TurretSeatRaceReceipt {
  readonly seat: readonly number[];
  readonly deckY: number;
  readonly rimR: number;
  /** The turret base's inscribed reach over the deck (m; tools/gen-combat-anatomy.mjs). */
  readonly footR?: number;
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
  /** 274: the plane at plan radius r with no rise limit: the gap over the swept deck's highest band within FOOT_READ_M
   *  of r, however high it stands (the turret's foot band is seated to it, turretSeatRace.ts). */
  liveAt(r: number): number;
}

export function turretSeatPlane(receipt: TurretSeatRaceReceipt | null | undefined, limits: TurretSeatLimits = {}): TurretSeatPlane | null {
  if (!receipt || !(receipt.rimR > SEAT_MIN_RIM_M) || !Number.isFinite(receipt.deckY)) return null;
  const own = (value: number | undefined, fallback: number): number => typeof value === 'number' ? value : fallback;
  const seatY = receipt.deckY + TURRET_SEAT_GAP_M, keepR = own(limits.turretSeatKeepR, receipt.rimR + SEAT_RIM_CLEAR_M);
  const sweep = receipt.sweepDy, sweepR0 = receipt.sweepR0 ?? Infinity;
  const rise = own(limits.turretSeatRiseM, TURRET_SEAT_RISE_M), read = own(limits.turretSeatReadM, SWEEP_READ_M);
  const floorY = own(limits.turretSeatMinY, -Infinity);
  // the swept deck's highest band within the read of plan radius r (over the deck round the ring), or null where there is
  // no swept deck there
  const sweptAt = (r: number, reach: number): number | null => {
    if (!sweep?.length || r < sweepR0) return null;
    if (Math.floor((r + SWEEP_READ_M - sweepR0) / TURRET_SWEEP_BIN_M) >= sweep.length) return null;
    const b0 = Math.max(0, Math.floor((r - reach - sweepR0) / TURRET_SWEEP_BIN_M));
    const b1 = Math.min(sweep.length - 1, Math.floor((r + reach - sweepR0) / TURRET_SWEEP_BIN_M));
    let dy = TURRET_SWEEP_FLOOR_M;
    for (let b = b0; b <= b1; b++) dy = Math.max(dy, sweep[b]);
    return dy;
  };
  // the plane a corner at plan radius r comes up to: its gap over that band (no higher than TURRET_SEAT_RISE_M over the
  // deck round the ring), or the deck's own plane without a swept deck
  const planeAt = (r: number): number => {
    const dy = sweptAt(r, read);
    return Math.max(dy === null ? seatY : seatY + Math.min(dy, rise), floorY);
  };
  const liveAt = (r: number): number => {
    const dy = sweptAt(r, FOOT_READ_M);
    return Math.max(dy === null ? seatY : seatY + dy, floorY);
  };
  return { cx: receipt.seat[0], cz: receipt.seat[2], keepR, planeAt, liveAt };
}
