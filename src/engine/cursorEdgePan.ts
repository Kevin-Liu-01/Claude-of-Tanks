/**
 * cursorEdgePan.ts — the cursor-aim fallback's view turn (cursor-aim-pan-274).
 *
 * Without pointer lock (embedded panes, sandboxed iframes, a player who declines it) the gun aims through the real
 * cursor (input.ts isCursorAim/getCursorNdc), and the mouse yields no movement deltas, so the rig's absolute aim angles
 * never moved: the cursor laid the gun on a fixed world point and a target behind the tank could not be brought into
 * view (tutorial-journey 272, runs 4 and 5). While the cursor sits in an edge band the view pans toward that side, faster
 * the deeper it sits, and stops the moment the cursor leaves the band. The rig applies it in the chase view and the
 * sight; the sight's rate divides by its zoom, so the picture slides the same share of the screen per second at every
 * magnification. Pointer lock and touch never reach it (the rig pans only while cursor aim is on).
 */

/** Outer share of each NDC half-axis that pans the view (0.12: about 96 px each side of a 1600 px canvas). */
export const EDGE_PAN_BAND = 0.12;
/** Yaw rate at the very edge in the chase view, rad/s (a half turn in about 1.3 s). */
const EDGE_PAN_YAW_RATE = 2.4;
/** Pitch rate at the very edge in the chase view, rad/s (the rig clamps pitch to its limits). */
const EDGE_PAN_PITCH_RATE = 1.0;
/** A render hitch never turns the view more than this much frame time at once, s. */
const EDGE_PAN_MAX_DT_S = 0.1;

/** Signed depth of one NDC coordinate in its edge band: 0 outside the band, eased up to ±1 at the edge. */
export function edgeBandDepth(ndc: number, band = EDGE_PAN_BAND): number {
  const inner = 1 - band;
  const a = Math.abs(ndc);
  if (!(a > inner)) return 0; // also NaN
  const depth = Math.min(1, (a - inner) / band);
  return Math.sign(ndc) * depth * depth; // a cursor brushing the band's inner edge barely moves the view
}

interface EdgePanStep {
  yaw: number;
  pitch: number;
}

/**
 * This frame's view turn for a cursor at (x, y) in NDC (+y up). Screen-right is a yaw DECREASE (the rig's sign
 * contract: forwardAxis(yaw) = [sin yaw, 0, cos yaw], so increasing yaw swings the view left); screen-up is a pitch
 * increase. `zoom` is 1 in the chase view and the sight's magnification in the sight.
 */
export function cursorEdgePan(x: number, y: number, dt: number, zoom: number, out: EdgePanStep): EdgePanStep {
  const scale = dt > 0 ? Math.min(dt, EDGE_PAN_MAX_DT_S) / Math.max(1, zoom) : 0;
  out.yaw = -edgeBandDepth(x) * EDGE_PAN_YAW_RATE * scale;
  out.pitch = edgeBandDepth(y) * EDGE_PAN_PITCH_RATE * scale;
  return out;
}
