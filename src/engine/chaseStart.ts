/**
 * The chase camera's first look at a battle (couch-panes-272; the solo start, the reveal, each couch pane): under the
 * hull's own pitch, not under the horizon, and no deeper than the gun can follow. On a slope the old 10 degrees under the horizon laid the sight on
 * the ground a few metres ahead of a nose-up hull, past its gun's depression, and the battle opened on GUN TRAVEL LIMIT
 * (the mid-range couch seats on Verdant's slopes, and the solo player wherever a spawn slope met a shallow depression).
 * Leaf module: no imports, so every battle start can read it.
 */

const DEG = Math.PI / 180;
/** The look under the hull's pitch at a battle's start, at most. */
const START_UNDER_HULL = 10 * DEG;
/** The chase camera's place at a battle's start, metres (measured on Verdant's couch panes: about 6 m over the hull's
 *  base and 20 m behind it), the muzzle's height over the hull's base, and the margin kept inside the gun's depression. */
const CAMERA_RISE_M = 6;
const CAMERA_BACK_M = 20;
const MUZZLE_RISE_M = 2.5;
const DEPRESSION_MARGIN = 2 * DEG;
/** The chase rig's own pitch range (engine/cameraRig.ts PITCH_MIN, PITCH_MAX). */
const LOOK_MIN = -65 * DEG;
const LOOK_MAX = 30 * DEG;

/**
 * The start pitch (radians, positive up) for a hull pitched `hullPitch` (radians, positive nose up) whose gun depresses
 * `depressionDeg` (degrees, the spec's gunDepressionDeg): 10 degrees under the hull, or shallower where the ground that
 * look lands on would sit past the gun's depression (a 5 degree gun cannot reach the ground 20 m ahead from its 2.5 m
 * muzzle), and never deeper under the hull than the gun's depression less the margin.
 */
export function chaseStartPitch(hullPitch: number | null | undefined, depressionDeg?: number | null): number {
  const pitch = Number.isFinite(hullPitch) ? Number(hullPitch) : 0;
  let under = START_UNDER_HULL;
  if (Number.isFinite(depressionDeg)) {
    const reach = Math.max(1 * DEG, Number(depressionDeg) * DEG - DEPRESSION_MARGIN);
    // the ground point the gun reaches at `reach`, from the camera: CAMERA_BACK_M behind plus the muzzle's reach ahead;
    // and never deeper under the hull than the gun itself depresses (a hull nose-up on a mound over level ground: the
    // look under the hull would sit past the gun's reach whatever the ground ahead)
    under = Math.min(under, Math.atan(CAMERA_RISE_M / (CAMERA_BACK_M + MUZZLE_RISE_M / Math.tan(reach))), reach);
  }
  return Math.max(LOOK_MIN, Math.min(LOOK_MAX, pitch - under));
}
