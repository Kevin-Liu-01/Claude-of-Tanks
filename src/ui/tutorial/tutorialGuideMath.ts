/**
 * tutorialGuideMath.ts — the tutorial guide's geometry, with no DOM and no Three.js (273). Copyright © 2026 Kevin B. Liu.
 *
 * tutorialGuide.ts draws the step's guidance (a ground ring, path chevrons, an actor's bracket, an edge pointer, an aim
 * ghost) over the battle from world points the game projects to the screen. Everything it computes from those points
 * lives here, so tutorialGuide.selftest.mjs can hold it in Node: where on a ground circle to sample, where along the way
 * to lay the chevrons, the screen box round an actor, and where on the screen's edge a pointer stands for something off
 * screen or behind the camera.
 *
 * World axes are the simulation's: y up, a yaw of 0 faces +z, and a yaw turns toward +x (forward = (sin yaw, cos yaw)).
 */

interface GroundPoint { readonly x: number; readonly z: number }
export interface WorldPoint { readonly x: number; readonly y: number; readonly z: number }
/** A world point on the screen in CSS pixels; `behind` when it lies behind the camera (x, y are then mirrored). */
export interface ScreenPoint { readonly x: number; readonly y: number; readonly behind: boolean }
export interface Viewport { readonly width: number; readonly height: number }

/** Points round a ground circle (the marker's ring), first point repeated last so the outline closes. */
export function ringPoints(center: GroundPoint, radiusM: number, segments = 28): GroundPoint[] {
  const points: GroundPoint[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points.push({ x: center.x + Math.sin(a) * radiusM, z: center.z + Math.cos(a) * radiusM });
  }
  return points;
}

export const PATH_FIRST_M = 7;
export const PATH_STEP_M = 6;
export const PATH_COUNT = 5;
/** The path's chevrons stop this far short of the ring's edge, and none is drawn once the player is this close. */
const PATH_STOP_SHORT_M = 2;
export const PATH_HIDE_WITHIN_M = 15;

/** One path chevron: where it stands and the way it points (a unit ground vector). */
interface PathChevron { readonly at: GroundPoint; readonly dir: GroundPoint; readonly index: number }

/**
 * The chevrons from the player toward a marker: one every PATH_STEP_M from PATH_FIRST_M ahead, at most PATH_COUNT, none
 * inside the ring, and none at all once the player is within PATH_HIDE_WITHIN_M of the marker's edge.
 */
export function pathChevrons(from: GroundPoint, to: GroundPoint, radiusM: number): PathChevron[] {
  const dx = to.x - from.x, dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  if (distance - radiusM <= PATH_HIDE_WITHIN_M) return [];
  const dir = { x: dx / distance, z: dz / distance };
  const last = distance - radiusM - PATH_STOP_SHORT_M;
  const out: PathChevron[] = [];
  for (let i = 0; i < PATH_COUNT; i++) {
    const along = PATH_FIRST_M + i * PATH_STEP_M;
    if (along > last) break;
    out.push({ at: { x: from.x + dir.x * along, z: from.z + dir.z * along }, dir, index: i });
  }
  return out;
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

/** How far inside each screen edge the edge pointer stands (px); the bottom keeps clear of the HUD's controls. */
interface EdgeInsets { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number }

/** The guide's insets for a screen: EDGE px round it, and a fifth of the height at the bottom (the HUD's band). */
export function edgeInsets(view: Viewport, edge: number): EdgeInsets {
  return { top: edge, right: edge, left: edge, bottom: Math.max(edge, Math.round(view.height * 0.2)) };
}

/** A point behind the camera within this share of the half-width of straight behind points down, not to a side. */
const STRAIGHT_BEHIND = 0.08;

/**
 * Where an edge pointer stands for a point off screen, and the angle it points at (radians, 0 = right, + clockwise as
 * screen y grows down). A point in front: on the inset rectangle, on the line from the screen's centre toward it. A
 * point behind the camera (its projection mirrored): on the left or right edge, the side the player turns to, at the
 * screen's middle height; one straight behind: on the inset bottom, pointing down.
 */
export function edgePointer(point: ScreenPoint, view: Viewport, insets: EdgeInsets): { x: number; y: number; angle: number } {
  const cx = view.width / 2, cy = view.height / 2;
  const left = insets.left, right = view.width - insets.right, top = insets.top, bottom = view.height - insets.bottom;
  if (point.behind) {
    const dx = -(point.x - cx);
    if (Math.abs(dx) <= cx * STRAIGHT_BEHIND) return { x: cx, y: bottom, angle: Math.PI / 2 };
    return dx > 0 ? { x: right, y: (top + bottom) / 2, angle: 0 } : { x: left, y: (top + bottom) / 2, angle: Math.PI };
  }
  const dx = point.x - cx, dy = point.y - cy;
  const sx = dx > 1e-9 ? (right - cx) / dx : dx < -1e-9 ? (left - cx) / dx : Infinity;
  const sy = dy > 1e-9 ? (bottom - cy) / dy : dy < -1e-9 ? (top - cy) / dy : Infinity;
  const scale = Math.max(0, Math.min(sx, sy));
  return { x: cx + dx * scale, y: cy + dy * scale, angle: Math.atan2(dy, dx) };
}

/** True when a projected point stands inside the guide's inset rectangle. */
export function insideInsets(point: ScreenPoint, view: Viewport, insets: EdgeInsets): boolean {
  return !point.behind && point.x >= insets.left && point.x <= view.width - insets.right && point.y >= insets.top
    && point.y <= view.height - insets.bottom;
}

/** The angle a chevron points at on the screen: from its projected foot toward a point a metre further on its way. */
export function screenAngle(from: ScreenPoint, toward: ScreenPoint): number {
  return Math.atan2(toward.y - from.y, toward.x - from.x);
}
