/**
 * tutorialGuideMath.ts — the tutorial guide's geometry, with no DOM and no Three.js (273). Copyright © 2026 Kevin B. Liu.
 *
 * tutorialGuide.ts draws the step's guidance (a ground ring, an actor's bracket, an aim ghost, the angling arc) over the
 * battle from world points the game projects to the screen. Everything it computes from those points lives here, so
 * tutorialGuide.selftest.mjs can hold it in Node: where on a ground circle to sample, the screen box round an actor, and
 * the arc's sectors. The way to the step's place (its trail on the ground and the turn arrow) is the battle's one pointer
 * layer's since 275 (ui/pointers/pointerPlan.ts), whose screen and world points these share.
 *
 * World axes are the simulation's: y up, a yaw of 0 faces +z, and a yaw turns toward +x (forward = (sin yaw, cos yaw)).
 */
import type { GroundPoint, ScreenPoint, Viewport, WorldPoint } from '../pointers/pointerPlan.ts';

/** Points round a ground circle (the marker's ring), first point repeated last so the outline closes. */
export function ringPoints(center: GroundPoint, radiusM: number, segments = 28): GroundPoint[] {
  const points: GroundPoint[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points.push({ x: center.x + Math.sin(a) * radiusM, z: center.z + Math.cos(a) * radiusM });
  }
  return points;
}

/** Ground distance between two points (m). */
export function groundDistance(a: GroundPoint, b: GroundPoint): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/**
 * A point in an actor's own frame, in the world: `along` its hull axis (forward +), `up`, and `across` it toward the
 * hull's left, (cos yaw, -sin yaw): +x at a yaw of 0, which the battle camera shows on the left (the Proving Ground's
 * lateral offsets run the same way: + toward the shooter's left).
 */
export function actorPoint(pose: WorldPoint & { readonly yaw: number }, along: number, up: number, across: number): WorldPoint {
  const s = Math.sin(pose.yaw), c = Math.cos(pose.yaw);
  return { x: pose.x + s * along + c * across, y: pose.y + up, z: pose.z + c * along - s * across };
}

/** The eight corners of a box round an actor: half length and half width on the ground, and height above its pose. */
export function actorCorners(pose: WorldPoint & { readonly yaw: number }, halfLengthM: number, halfWidthM: number, heightM: number): WorldPoint[] {
  const out: WorldPoint[] = [];
  for (const along of [-halfLengthM, halfLengthM]) for (const across of [-halfWidthM, halfWidthM]) for (const up of [0, heightM]) {
    out.push(actorPoint(pose, along, up, across));
  }
  return out;
}

/** The screen box round projected points, or null when any lies behind the camera (the edge pointer stands in). */
export function screenBox(points: readonly ScreenPoint[]): { left: number; top: number; right: number; bottom: number } | null {
  if (!points.length || points.some((p) => p.behind)) return null;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const p of points) {
    left = Math.min(left, p.x); right = Math.max(right, p.x);
    top = Math.min(top, p.y); bottom = Math.max(bottom, p.y);
  }
  return { left, top, right, bottom };
}

/** True when a projected point stands on the screen, at least `inset` px inside its edges. */
export function onScreen(point: ScreenPoint, view: Viewport, inset = 0): boolean {
  return !point.behind && point.x >= inset && point.x <= view.width - inset && point.y >= inset && point.y <= view.height - inset;
}

/** The angling arc (S9): the hull headings it shows, as offsets from the line to the shooter (deg), every ARC_STEP_DEG
 *  from −ARC_SPAN_DEG to +ARC_SPAN_DEG; and its band on the ground round the player (m). */
export const ARC_SPAN_DEG = 90;
export const ARC_STEP_DEG = 10;
export const ARC_RADII_M = Object.freeze({ inner: 5.5, outer: 7.5 });

/** The arc's headings, nose on (0) to broadside each way: one sector per heading. */
export function arcHeadings(): number[] {
  const out: number[] = [];
  for (let deg = -ARC_SPAN_DEG; deg <= ARC_SPAN_DEG; deg += ARC_STEP_DEG) out.push(deg);
  return out;
}

/**
 * One sector of the arc on the ground: the wedge round `centre` between radii `inner` and `outer`, spanning a half step
 * either side of the heading `bearing + headingDeg` (rad bearing; 0 faces +z, turning toward +x), as a closed outline.
 */
export function arcSector(centre: GroundPoint, bearing: number, headingDeg: number, inner: number, outer: number): GroundPoint[] {
  const half = (ARC_STEP_DEG / 2) * (Math.PI / 180);
  const mid = bearing + headingDeg * (Math.PI / 180);
  const at = (angle: number, r: number): GroundPoint => ({ x: centre.x + Math.sin(angle) * r, z: centre.z + Math.cos(angle) * r });
  const out: GroundPoint[] = [];
  for (let i = 0; i <= 3; i++) out.push(at(mid - half + (2 * half * i) / 3, outer));
  for (let i = 3; i >= 0; i--) out.push(at(mid - half + (2 * half * i) / 3, inner));
  return out;
}

/** The hull's heading relative to the line to `toward` (deg, −180 to 180; + as yaw grows past the line). */
export function headingFromLine(pose: GroundPoint & { readonly yaw: number }, toward: GroundPoint): number {
  const bearing = Math.atan2(toward.x - pose.x, toward.z - pose.z);
  return (Math.atan2(Math.sin(pose.yaw - bearing), Math.cos(pose.yaw - bearing)) * 180) / Math.PI;
}

