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
  /** (round 2 U32) an authority poses the wreck's turret, placed or still awaited (TankVisual's) */
  wreckTurretAuthority?(): boolean;
  awaitWreckTurretPose?(): void;
  setWreckTurretPose?(pose: ArrayLike<number> | null): void;
}

export interface KillcamWreckReceipt {
  /** a cook-off (its thrown turret, its char), else a plain wreck */
  pop: boolean;
  /** where the wreck's authority had its turret (world turret frame), or null when none had placed it yet */
  turretPose: Float64Array | null;
  /** (round 2 U32) an authority posed the turret: a fresh kill's (the replay's own tick, its host's pose still awaited)
   *  has none placed yet, and its re-wreck still awaits the host instead of throwing a local body */
  authority: boolean;
}

/** The entity's combat record at the killcam's teardown (the live one: a network battle applies frames during the
 *  replay, so a respawn shows here). */
export interface KillcamWreckCombat { destroyed?: boolean }

/** The age a restored wreck takes: long settled, its fire and smoke past their first beats. */
export const KILLCAM_REWRECK_AGE_S = 12;

/**
 * The receipt of a wrecked visual, or null for one standing. `popHint` (the killing hit's ammo-rack flag) makes it a
 * cook-off too: a cook-off never un-pops, and a visual that declares no state keeps the hint's look.
 */
export function recordKillcamWreck(visual: KillcamWreckVisual, popHint = false): KillcamWreckReceipt | null {
  if (!visual.isDestroyed?.()) return null;
  const turretPose = new Float64Array(7);
  const held = !!visual.wreckTurretHeldPose?.(turretPose);
  return {
    pop: popHint || visual.wreckState?.() === 'cookoff',
    turretPose: held ? turretPose : null,
    authority: held || !!visual.wreckTurretAuthority?.(),
  };
}

/**
 * Wreck a restaged visual again, late, as its receipt had it, while its entity is still dead (`combat`: the live record;
 * (round 2 U32) one that respawned during the replay is alive, and a re-wreck drew a living tank as the old death's
 * wreck that nothing reset). A visual the replay lifted declares its authority first, and its held pose when it had
 * one; one the replay never lifted keeps its own turret. Returns whether it re-wrecked.
 */
export function restoreKillcamWreck(visual: KillcamWreckVisual, receipt: KillcamWreckReceipt,
  combat: KillcamWreckCombat | null = null, ageS = KILLCAM_REWRECK_AGE_S): boolean {
  if (combat?.destroyed === false) return false;
  if (receipt.authority && !visual.isDestroyed?.() && visual.awaitWreckTurretPose) {
    visual.awaitWreckTurretPose();
    if (receipt.turretPose) visual.setWreckTurretPose?.(receipt.turretPose);
  }
  visual.setDestroyed({ pop: receipt.pop, ageS });
  return true;
}
