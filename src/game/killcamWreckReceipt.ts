/**
 * (2026-11-02 audit F10) A restaged wreck's receipt: what the killcam needs to wreck a visual again as the field had it,
 * after the replay lifted it (resetDestroyed) to stage the shot. One receipt for the victim and for an attacker that died
 * after firing: its look (cook-off or plain, from the visual's own declared wreck state) and the pose its authority (a
 * host, the solo step) last held its turret at. The pose is declared again before the re-wreck, so no local body is
 * thrown and settled where the authority's collision turret is not (shells stopping on an invisible turret).
 */

/** The parts of a tank visual a wreck receipt reads and replays (TankVisual's). */
export interface KillcamWreckVisual {
  setDestroyed(options?: { pop?: boolean; ageS?: number }): void;
  isDestroyed?(): boolean;
  /** the visual's declared wreck state (vehicles/wreckLifecycle.ts TankWreckState) */
  wreckState?(): string;
  wreckTurretHeldPose?(out: Float64Array): boolean;
  awaitWreckTurretPose?(): void;
  setWreckTurretPose?(pose: ArrayLike<number> | null): void;
}

export interface KillcamWreckReceipt {
  /** a cook-off (its thrown turret, its char), else a plain wreck */
  pop: boolean;
  /** where the wreck's authority had its turret (world turret frame), or null when none held it */
  turretPose: Float64Array | null;
}

/** The age a restored wreck takes: long settled, its fire and smoke past their first beats. */
export const KILLCAM_REWRECK_AGE_S = 12;

/**
 * The receipt of a wrecked visual, or null for one standing. `popHint` (the killing hit's ammo-rack flag) makes it a
 * cook-off too: a cook-off never un-pops, and a visual that declares no state keeps the hint's look.
 */
export function recordKillcamWreck(visual: KillcamWreckVisual, popHint = false): KillcamWreckReceipt | null {
  if (!visual.isDestroyed?.()) return null;
  const turretPose = new Float64Array(7);
  return {
    pop: popHint || visual.wreckState?.() === 'cookoff',
    turretPose: visual.wreckTurretHeldPose?.(turretPose) ? turretPose : null,
  };
}

/**
 * Wreck a restaged visual again, late, as its receipt had it. A visual the replay lifted declares its authority's held
 * pose first; one the replay never lifted keeps its own turret.
 */
export function restoreKillcamWreck(visual: KillcamWreckVisual, receipt: KillcamWreckReceipt,
  ageS = KILLCAM_REWRECK_AGE_S): void {
  if (receipt.turretPose && !visual.isDestroyed?.() && visual.awaitWreckTurretPose && visual.setWreckTurretPose) {
    visual.awaitWreckTurretPose();
    visual.setWreckTurretPose(receipt.turretPose);
  }
  visual.setDestroyed({ pop: receipt.pop, ageS });
}
