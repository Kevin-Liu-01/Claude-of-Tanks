/**
 * The couch battle's shared camera (docs/COUCH-MODE.md "The shared camera"): one view that frames every living seat's
 * hull, looking down along a bearing fixed for the battle so the ground never swings under the players. Pure maths, no
 * three.js: the couch runtime moves the page's camera toward the pose this solves, smoothed.
 *
 * The seats' hulls are fitted as a circle round their middle (the farthest hull plus the margin), and the camera stands
 * back along the bearing until that circle fits both the view's height (foreshortened by the pitch) and its width. The
 * distance holds between the rules' nearest and farthest; past the farthest, the view keeps the largest group of seats
 * that fits, so a straggler never pulls everyone off the screen.
 */
import type { CouchRules } from '../sim/matchRuleset.ts';

export interface CouchPoint {
  x: number;
  y: number;
  z: number;
}

export interface CouchPose {
  /** Where the camera stands and the point it looks at. */
  x: number; y: number; z: number;
  targetX: number; targetY: number; targetZ: number;
  /** How far it stands back, and how many of the hulls it frames. */
  distance: number;
  framed: number;
}

/** The circle round `points` (their middle and the farthest of them from it, in the ground plane). */
function enclose(points: readonly CouchPoint[]): { x: number; y: number; z: number; radius: number } {
  let x = 0, y = 0, z = 0;
  for (const point of points) { x += point.x; y += point.y; z += point.z; }
  x /= points.length; y /= points.length; z /= points.length;
  let radius = 0;
  for (const point of points) radius = Math.max(radius, Math.hypot(point.x - x, point.z - z));
  return { x, y, z, radius };
}

/** The distance at which a ground circle of `radius` fits the view (vertical field of view `fovDeg`, `aspect`). */
function fitDistance(radius: number, rules: CouchRules, fovDeg: number, aspect: number): number {
  const halfV = (fovDeg * Math.PI) / 360;
  const halfH = Math.atan(Math.tan(halfV) * Math.max(0.1, aspect));
  // the circle's depth is foreshortened by the downward look: sin(pitch) of it shows in the view's height
  const pitch = Math.abs(rules.cameraPitchDeg) * Math.PI / 180;
  const byHeight = (radius * Math.sin(pitch)) / Math.tan(halfV) + radius * Math.cos(pitch);
  const byWidth = radius / Math.tan(halfH);
  return Math.max(byHeight, byWidth);
}

/**
 * The pose that frames `points` (the living seats' hulls) along `yaw` (the bearing the camera looks, atan2(x, z)),
 * or null with none to frame.
 */
export function solveCouchPose(points: readonly CouchPoint[], rules: CouchRules, yaw: number, fovDeg: number,
  aspect: number): CouchPose | null {
  if (!points.length) return null;
  let group = points;
  let circle = enclose(group);
  let distance = fitDistance(circle.radius + rules.frameMarginM, rules, fovDeg, aspect);
  // too spread to fit: keep the largest group round one hull that does (ties: the earlier hull, seat order)
  if (distance > rules.cameraMaxDistanceM && points.length > 1) {
    let best: readonly CouchPoint[] = [points[0]!];
    for (const anchor of points) {
      const near = points.filter((point) => Math.hypot(point.x - anchor.x, point.z - anchor.z) <= 2 * rules.cameraMaxDistanceM);
      let candidate = near;
      while (candidate.length > 1 && fitDistance(enclose(candidate).radius + rules.frameMarginM, rules, fovDeg, aspect) > rules.cameraMaxDistanceM) {
        // drop the hull farthest from this group's middle until the rest fits
        const middle = enclose(candidate);
        let far = 0;
        for (let i = 1; i < candidate.length; i++) {
          if (Math.hypot(candidate[i]!.x - middle.x, candidate[i]!.z - middle.z) > Math.hypot(candidate[far]!.x - middle.x, candidate[far]!.z - middle.z)) far = i;
        }
        candidate = candidate.filter((_, i) => i !== far);
      }
      if (candidate.length > best.length) best = candidate;
    }
    group = best;
    circle = enclose(group);
    distance = fitDistance(circle.radius + rules.frameMarginM, rules, fovDeg, aspect);
  }
  distance = Math.max(rules.cameraMinDistanceM, Math.min(rules.cameraMaxDistanceM, distance));
  const pitch = Math.abs(rules.cameraPitchDeg) * Math.PI / 180;
  const back = Math.cos(pitch) * distance;
  return {
    x: circle.x - Math.sin(yaw) * back,
    y: circle.y + Math.sin(pitch) * distance,
    z: circle.z - Math.cos(yaw) * back,
    targetX: circle.x, targetY: circle.y, targetZ: circle.z,
    distance,
    framed: group.length,
  };
}
