/**
 * pointerPlan.ts — the battle's one pointer primitive, planned with no DOM and no Three.js (guidance-pointers-275).
 * Copyright © 2026 Kevin B. Liu.
 *
 * Kevin, 2026-11-22: "makr arrows in tutorial on the ground as well so its easieer to follow and have actual ui stuff in
 * the ui of arrows or the bubbles with arrows where to go, and we can actually reuse that system all over game for
 * incoming missile, tanks to your flank or in your rear, incoming air assaults and weaponry, the ball in turbo ball,
 * anything else"; and the rule that splits them: "for stuff for you to follow, its on ground. for the warnings /
 * indicators thats in the ui".
 *
 * Before 275 the tutorial's guide (ui/tutorial/tutorialGuide.ts) drew the battle's only arrows (five thin chevrons and an
 * edge arrow, its own), and a threat's direction showed on the minimap alone. Now every surface hands this plan a pointer,
 * and its MODE picks the look:
 * - follow (where to go, and only where the player could not otherwise know: the tutorial's waypoint, a thing it asks
 *   them to look at; Kevin, 2026-11-23: "remove the arrows on ground for obvious stuff. like capturing bases"):
 *   painted on the ground, never on the screen's rim, planned against the camera (planFollow): while its destination
 *   stands on the screen a chevron trail laid flat on the terrain from the tank toward it (trailChevrons); while it does
 *   not, a curved arrow painted on the ground ahead of the tank in the camera's view, bending the way to turn until its
 *   head points along the destination's bearing (turnArrow), sized down until the whole of it fits the screen ("they get
 *   clipped off if you aim to ur side"). A piece that does not fit whole is not drawn. Its destination is the tutorial's
 *   own (its ring).
 * - warn (what is coming at the tank: a missile, an air run, a tank on the flank or in the rear with its gun on it or
 *   close): a bubble on the screen's rim pointing at it, never on the ground (planBubbles). One the camera already shows
 *   gets none; the rest are ranked, merged where they meet on the rim, capped (4, or 3 on a phone), and moved along the
 *   rim off the HUD's controls and instruments.
 * The ladder is the battle notices' own (battleNotices.ts NOTICE_PRIORITY; Kevin's P4 can't play .. P-1 hints): while
 * the sight is up only P >= 3 shows, so a follow pointer (a hint, P-1) stands down in the sight and a warning (a threat,
 * P3) does not.
 *
 * Deterministic: the same inputs plan the same pointers (ties fall to the id). pointerPlan.selftest.mjs holds it.
 * World axes are the simulation's: y up, a yaw of 0 faces +z, and a yaw turns toward +x (forward = (sin yaw, cos yaw)).
 */
import { NOTICE_PRIORITY } from '../battleNotices.ts';

export interface GroundPoint { readonly x: number; readonly z: number }
export interface WorldPoint { readonly x: number; readonly y: number; readonly z: number }
/** A world point on the screen in CSS pixels; `behind` when it lies behind the camera (x, y are then mirrored). */
export interface ScreenPoint { readonly x: number; readonly y: number; readonly behind: boolean }
export interface Viewport { readonly width: number; readonly height: number }
export interface ScreenBox { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }

// ── follow: on the ground ─────────────────────────────────────────────────────────────────────────────────────────────

/** waypoint: a place to drive to; look: a thing to turn toward (no trail). The tutorial's two, and no other: a mode's
 *  objective has its own disc, beacon and icon, and the Turbo Ball ball its own rim indicator (ballIndicator). */
type FollowKind = 'waypoint' | 'look';

export interface FollowPointer {
  readonly id: string;
  readonly kind: FollowKind;
  readonly x: number;
  readonly z: number;
  /** The destination's radius (m): the trail stops at its edge. */
  readonly radiusM: number;
  /** Lay a trail toward it (a `look` pointer only turns the player). */
  readonly trail: boolean;
}

/** The trail: a chevron every TRAIL_STEP_M from TRAIL_FIRST_M ahead of the tank, at most TRAIL_COUNT, none inside the
 *  destination, and none once the tank is within TRAIL_HIDE_WITHIN_M of its edge (the destination is in plain view). */
export const TRAIL_FIRST_M = 8;
export const TRAIL_STEP_M = 6;
export const TRAIL_COUNT = 7;
export const TRAIL_HIDE_WITHIN_M = 4;
/** A chevron's outline in its own frame (m): `along` its way (+ ahead) and `across` it; 4 m wide, 2.6 m long, broad
 *  enough to stay a chevron where the chase camera's low look flattens the ground ahead. */
const CHEVRON_OUTLINE: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [1.3, 0], [-0.8, 2.0], [-1.3, 1.5], [0.25, 0], [-1.3, -1.5], [-0.8, -2.0],
] as const);

interface TrailChevron {
  /** Its outline on the ground, closed by the drawer. */
  readonly outline: readonly GroundPoint[];
  /** 0 nearest the tank. */
  readonly index: number;
  /** Its centre's distance from the tank along the way (m). */
  readonly alongM: number;
}

/** The chevrons from the tank toward a destination of radius `radiusM`, each laid flat along the way. */
export function trailChevrons(from: GroundPoint, to: GroundPoint, radiusM: number): TrailChevron[] {
  const dx = to.x - from.x, dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  if (distance - radiusM <= TRAIL_HIDE_WITHIN_M) return [];
  const fx = dx / distance, fz = dz / distance;
  // across the way: (cos, -sin) of its heading
  const rx = fz, rz = -fx;
  const last = distance - radiusM - 1;
  const out: TrailChevron[] = [];
  for (let i = 0; i < TRAIL_COUNT; i++) {
    const along = TRAIL_FIRST_M + i * TRAIL_STEP_M;
    if (along > last) break;
    const cx = from.x + fx * along, cz = from.z + fz * along;
    out.push({ index: i, alongM: along, outline: CHEVRON_OUTLINE.map(([a, c]) => ({ x: cx + fx * a + rx * c, z: cz + fz * a + rz * c })) });
  }
  return out;
}

/** Where the turn arrow may start (m along the camera's heading from the tank, m toward the turn's side); the plan keeps
 *  the largest on the screen that fits. Beside the hull on the turn's side: that ground stands at the hull's own depth,
 *  the nearest to the camera the arrow can lie without the hull over it, so the arrow is large, and a portrait phone's
 *  tank can stand over all the ground ahead. Ahead of the hull: the chase camera looks down over the turret, so the ground
 *  just ahead stands behind the hull on the screen, and behind a tall hull (3 m) all of it to 18 m does. The battle's
 *  stills found both: a marker aside got no arrow on a phone, and on a desktop only a sliver 30 m out. */
export const TURN_PLACES = Object.freeze([
  { aheadM: 0, besideM: 4 }, { aheadM: 4, besideM: 4 }, { aheadM: -4, besideM: 4 },
  { aheadM: 10, besideM: 0 }, { aheadM: 14, besideM: 0 }, { aheadM: 18, besideM: 0 }, { aheadM: 24, besideM: 0 }, { aheadM: 30, besideM: 0 },
] as const);
/** The px round the arrowhead that keeps clear of the HUD and the hull, so a head never sits in a gap between buttons. */
export const TURN_HEAD_PAD_PX = 6;
/** Its bend's radii tried in turn (m), the largest first, until the whole arrow fits the screen (a portrait phone's
 *  narrow view takes the small ones). */
export const TURN_RADII_M = Object.freeze([6, 4.5, 3.2, 2.2] as const);
/** It bends at least this far (deg), so a destination just off the screen still reads as a turn; at most a U-turn. */
export const TURN_MIN_SWEEP_DEG = 30;
const TURN_SEGMENTS = 14;
/** The arrowhead's length along the bend (rad). */
const TURN_HEAD_RAD = 0.55;

interface TurnArrow {
  /** The band's outline (outer edge out, inner edge back), closed by the drawer. */
  readonly band: readonly GroundPoint[];
  /** The arrowhead at the band's end, pointing the way to turn. */
  readonly head: readonly GroundPoint[];
  /** +1: turn the way the yaw grows (toward +x), -1 the other way. */
  readonly turn: 1 | -1;
}

/** Signed angle from yaw `a` to yaw `b`, in (-pi, pi]. */
function turnFrom(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

/** The ground bearing (yaw) from one point to another. */
export function bearing(from: GroundPoint, to: GroundPoint): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

/**
 * The curved arrow toward a destination, painted on the ground in the camera's frame: it starts `aheadM` ahead of the
 * tank along the camera's heading `viewYaw` and `besideM` toward the side it turns to, running along the heading, and bends on a circle of radius `radiusM` the shorter way
 * to the destination until its head points along the destination's bearing (at least TURN_MIN_SWEEP_DEG, at most a
 * U-turn). Its band is a fifth of its radius wide, so a smaller arrow keeps its shape.
 */
export function turnArrow(tank: GroundPoint, viewYaw: number, to: GroundPoint, radiusM: number, aheadM: number, besideM = 0): TurnArrow {
  const off = turnFrom(viewYaw, bearing(tank, to));
  const turn: 1 | -1 = off >= 0 ? 1 : -1;
  const sweep = Math.min(Math.PI, Math.max(Math.abs(off), (TURN_MIN_SWEEP_DEG * Math.PI) / 180));
  const fx = Math.sin(viewYaw), fz = Math.cos(viewYaw);
  // the side the yaw turns toward: d(forward)/d(yaw) = (cos, -sin), times the way to turn
  const sx = turn * Math.cos(viewYaw), sz = -turn * Math.sin(viewYaw);
  const cx = tank.x + fx * aheadM + sx * (besideM + radiusM), cz = tank.z + fz * aheadM + sz * (besideM + radiusM);
  // a point `r` from the bend's centre, `phi` along the bend (0 at the start, heading along the view)
  const at = (phi: number, r: number): GroundPoint => ({
    x: cx - sx * r * Math.cos(phi) + fx * r * Math.sin(phi), z: cz - sz * r * Math.cos(phi) + fz * r * Math.sin(phi),
  });
  const half = radiusM * 0.1;
  const headPhi = Math.min(sweep * 0.45, TURN_HEAD_RAD);
  const bodyEnd = sweep - headPhi;
  const outer = radiusM + half, inner = radiusM - half;
  const band: GroundPoint[] = [];
  for (let i = 0; i <= TURN_SEGMENTS; i++) band.push(at((bodyEnd * i) / TURN_SEGMENTS, inner));
  for (let i = TURN_SEGMENTS; i >= 0; i--) band.push(at((bodyEnd * i) / TURN_SEGMENTS, outer));
  const spread = half * 1.9;
  return { band, turn, head: [at(bodyEnd, inner - spread), at(sweep, radiusM), at(bodyEnd, outer + spread)] };
}

/** The paint's lift off the ground (m), so it never sinks into the terrain between its corners. */
export const PAINT_LIFT_M = 0.12;
/** How far inside the screen's edge a destination must stand to count as on the screen (px). */
export const FOLLOW_EDGE_PX = 24;

/** What planFollow reads for one frame. */
export interface FollowInput {
  /** The tutorial's follow pointer (pointerBoard.ts), or null. */
  readonly follow: FollowPointer | null;
  /** The player's tank on the ground. */
  readonly player: GroundPoint;
  /** The camera's heading on the ground (yaw). */
  readonly viewYaw: number;
  /** The gunner's sight is up: the follow pointer (a hint, P-1) stands down. */
  readonly scoped: boolean;
  readonly project: (point: WorldPoint) => ScreenPoint | null;
  readonly view: Viewport;
  readonly groundY: (x: number, z: number) => number;
  /** The HUD the turn arrow's head never covers. */
  readonly noCover: readonly ScreenBox[];
  /** The player's own tank on the screen, which the turn arrow's head never covers; null when unknown. */
  readonly hull: ScreenBox | null;
}

/** The follow pointer's pieces on the screen, each wholly on it. */
export interface FollowPlan {
  readonly chevrons: ReadonlyArray<{ readonly index: number; readonly points: readonly ScreenPoint[] }>;
  readonly turn: { readonly band: readonly ScreenPoint[]; readonly head: readonly ScreenPoint[]; readonly turn: 1 | -1; readonly radiusM: number } | null;
  /** Its destination stands on the screen. */
  readonly inView: boolean;
}

const NO_FOLLOW: FollowPlan = Object.freeze({ chevrons: [], turn: null, inView: false });

/** A screen point inside the view, `inset` px clear of its edge. */
export function onScreen(point: ScreenPoint | null, view: Viewport, inset = 0): point is ScreenPoint {
  return !!point && !point.behind && point.x >= inset && point.x <= view.width - inset && point.y >= inset && point.y <= view.height - inset;
}

/** A screen point inside a box grown by `pad` px. */
const inside = (p: { readonly x: number; readonly y: number }, b: ScreenBox, pad: number): boolean =>
  p.x >= b.x0 - pad && p.x <= b.x1 + pad && p.y >= b.y0 - pad && p.y <= b.y1 + pad;
/** Two boxes that meet, `a` grown by `pad` px. */
const overlaps = (a: ScreenBox, b: ScreenBox, pad: number): boolean =>
  a.x0 - pad <= b.x1 && a.x1 + pad >= b.x0 && a.y0 - pad <= b.y1 && a.y1 + pad >= b.y0;

/**
 * The follow pointer for this frame, against the camera: the trail while the destination stands on the screen (only its
 * chevrons wholly on the screen and clear of the HUD), else the turn arrow largest on the screen (its band's diagonal)
 * among those from every place (TURN_PLACES) and radius wholly on the screen, its band clear of the HUD and the hull and
 * its head with TURN_HEAD_PAD_PX round it too, else nothing. Never a piece cut by the screen's edge, the camera's plane, a control or the hull's cut-out.
 */
export function planFollow(input: FollowInput): FollowPlan {
  const follow = input.scoped ? null : input.follow;
  if (!follow) return NO_FOLLOW;
  const { view } = input;
  const ground = (outline: readonly GroundPoint[]): ScreenPoint[] | null => {
    const out: ScreenPoint[] = [];
    for (const p of outline) {
      const at = input.project({ x: p.x, y: input.groundY(p.x, p.z) + PAINT_LIFT_M, z: p.z });
      if (!onScreen(at, view)) return null;
      out.push(at);
    }
    return out;
  };
  const dest = input.project({ x: follow.x, y: input.groundY(follow.x, follow.z) + PAINT_LIFT_M, z: follow.z });
  if (onScreen(dest, view, FOLLOW_EDGE_PX)) {
    const chevrons: { index: number; points: ScreenPoint[] }[] = [];
    if (follow.trail) {
      for (const chevron of trailChevrons(input.player, follow, follow.radiusM)) {
        const points = ground(chevron.outline);
        if (points && !points.some((p) => input.noCover.some((b) => inside(p, b, 0)))) chevrons.push({ index: chevron.index, points });
      }
    }
    return { chevrons, turn: null, inView: true };
  }
  const boxes = input.hull ? [...input.noCover, input.hull] : input.noCover;
  let best: FollowPlan | null = null, bestSpan = 0;
  for (const place of TURN_PLACES) {
    for (const radiusM of TURN_RADII_M) {
      const arrow = turnArrow(input.player, input.viewYaw, follow, radiusM, place.aheadM, place.besideM);
      const band = ground(arrow.band), head = ground(arrow.head);
      if (!band || !head) continue;
      if (band.some((p) => boxes.some((b) => inside(p, b, 0)))) continue;
      const headBox: ScreenBox = { x0: Math.min(...head.map((p) => p.x)), y0: Math.min(...head.map((p) => p.y)),
        x1: Math.max(...head.map((p) => p.x)), y1: Math.max(...head.map((p) => p.y)) };
      if (boxes.some((b) => overlaps(headBox, b, TURN_HEAD_PAD_PX))) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of band) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      const span = Math.hypot(x1 - x0, y1 - y0);
      if (span > bestSpan) { bestSpan = span; best = { chevrons: [], turn: { band, head, turn: arrow.turn, radiusM }, inView: false }; }
    }
  }
  return best ?? NO_FOLLOW;
}

// ── warn: in the UI ───────────────────────────────────────────────────────────────────────────────────────────────────

/** The rim's bubbles: the warnings (a tank, a missile, an air run, a drone) and the moving objectives' indicators (the Turbo
 *  Ball ball, a carried flag, the juggernaut; Kevin, 2026-11-23: "you know how the bases have indicators in ui tho, we
 *  should add that for the ball too if it out of view", "same for flag holders and juggernaut"). */
export type WarnKind = 'tank' | 'missile' | 'air' | 'drone' | 'ball' | 'flag' | 'boss';
/** Whose colour a bubble wears: the enemy's (every warning), the viewer's side's, or the neutral one (the ball). */
export type WarnSide = 'enemy' | 'own' | 'neutral';

export interface WarnPointer {
  readonly id: string;
  readonly kind: WarnKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** On the ladder (NOTICE_PRIORITY): every warning is a threat, an objective's indicator ambient. */
  readonly priority: number;
  /** Within its rung, the more urgent first: a missile 3, an air run or a drone 2, a gun on the tank 1, a hull close by 0. */
  readonly rank: number;
  /** Ground distance from the tank (m). */
  readonly distanceM: number;
  /** An air run: the seconds to its landing, and how much of its warning is left (1 just called, 0 landing). */
  readonly countdownS?: number;
  readonly countdownLeft?: number;
  /** Its colour (absent: the enemy's). */
  readonly side?: WarnSide;
}

const WARN_RANK = Object.freeze({ missile: 3, air: 2, drone: 2, gunOn: 1, close: 0 });

/** How many bubbles show at once: 4, or 3 on a phone (the narrower side under 500 px). */
export function bubbleCap(view: Viewport): number {
  return Math.min(view.width, view.height) < 500 ? 3 : 4;
}

/** The bubble's radius (px): 18, or 15 on a phone. */
export function bubbleRadius(view: Viewport): number {
  return Math.min(view.width, view.height) < 500 ? 15 : 18;
}

/** How far inside each screen edge a bubble's centre stands (px); a fifth of the height at the bottom (the HUD's band). */
interface EdgeInsets { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number }

export function edgeInsets(view: Viewport, edge: number): EdgeInsets {
  return { top: edge, right: edge, left: edge, bottom: Math.max(edge, Math.round(view.height * 0.2)) };
}

/** A point behind the camera within this share of the half-width of straight behind points down, not to a side. */
const STRAIGHT_BEHIND = 0.08;

/**
 * Where on the inset rectangle a pointer stands for a point off screen, and the angle it points at (radians, 0 = right,
 * + clockwise as screen y grows down). A point in front: on the line from the screen's centre toward it. A point behind
 * the camera (its projection mirrored): on the left or right edge, the side to turn to, at the middle height; one
 * straight behind: on the inset bottom, pointing down.
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

/** True when a projected point stands inside the inset rectangle (the camera shows it). */
export function insideInsets(point: ScreenPoint, view: Viewport, insets: EdgeInsets): boolean {
  return !point.behind && point.x >= insets.left && point.x <= view.width - insets.right && point.y >= insets.top
    && point.y <= view.height - insets.bottom;
}

export interface Bubble {
  readonly id: string;
  readonly kind: WarnKind;
  readonly x: number;
  readonly y: number;
  /** The way its arrow points (radians, 0 = right, + clockwise). */
  readonly angle: number;
  /** How many warnings it stands for (merged where they met on the rim). */
  readonly count: number;
  readonly distanceM: number;
  /** An air run's warning left (1..0), or null. */
  readonly countdownLeft: number | null;
  readonly countdownS: number | null;
  readonly side: WarnSide;
}

interface BubbleInput {
  readonly warns: readonly WarnPointer[];
  readonly project: (point: WorldPoint) => ScreenPoint | null;
  readonly view: Viewport;
  /** The gunner's sight is up: only P >= threat shows. */
  readonly scoped: boolean;
  /** The HUD a bubble never covers: its controls, its instruments, the tutorial's card, the notices. */
  readonly noCover: readonly ScreenBox[];
}

/** The bubbles' inset from the screen's edges (px). */
const BUBBLE_EDGE_PX = 40;
/** Two bubbles closer than this on the rim merge into one (px). */
const MERGE_PX = 52;
/** The rim is searched this far each way (px) for a place off the HUD, in steps of BUBBLE_STEP_PX. */
const BUBBLE_SLIDE_MAX_PX = 360;
const BUBBLE_STEP_PX = 8;
/** Kept between a bubble and the HUD or another bubble (px). */
const BUBBLE_GAP_PX = 4;

/** A bubble's box at (x, y): its disc and arrow, and its distance label under it. */
function bubbleBox(x: number, y: number, radius: number): ScreenBox {
  const reach = radius + 11;
  return { x0: x - Math.max(reach, 30), y0: y - reach, x1: x + Math.max(reach, 30), y1: y + reach + 16 };
}

const crosses = (a: ScreenBox, b: ScreenBox, gap: number): boolean =>
  a.x0 < b.x1 + gap && a.x1 > b.x0 - gap && a.y0 < b.y1 + gap && a.y1 > b.y0 - gap;

/** The inset rectangle's perimeter as a loop: its length, a point at a distance along it, and the distance of a point. */
function rim(view: Viewport, insets: EdgeInsets) {
  const x0 = insets.left, x1 = view.width - insets.right, y0 = insets.top, y1 = view.height - insets.bottom;
  const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0);
  const length = 2 * (w + h);
  const at = (s: number): { x: number; y: number } => {
    let t = ((s % length) + length) % length;
    if (t < w) return { x: x0 + t, y: y0 };
    t -= w;
    if (t < h) return { x: x1, y: y0 + t };
    t -= h;
    if (t < w) return { x: x1 - t, y: y1 };
    t -= w;
    return { x: x0, y: y1 - t };
  };
  const of = (x: number, y: number): number => {
    const dTop = Math.abs(y - y0), dRight = Math.abs(x - x1), dBottom = Math.abs(y - y1), dLeft = Math.abs(x - x0);
    const least = Math.min(dTop, dRight, dBottom, dLeft);
    if (least === dTop) return Math.min(Math.max(x - x0, 0), w);
    if (least === dRight) return w + Math.min(Math.max(y - y0, 0), h);
    if (least === dBottom) return w + h + Math.min(Math.max(x1 - x, 0), w);
    return 2 * w + h + Math.min(Math.max(y1 - y, 0), h);
  };
  return { length, at, of };
}

/**
 * The warnings' bubbles: those the camera does not show, the most urgent first (rung, rank, nearest, id), merged where
 * they meet on the rim, at most bubbleCap, each slid along the rim (the nearer way first) off the HUD and the bubbles
 * already placed. A bubble with no free place on the rim stays where it points (it may lie on an instrument, never
 * hidden: a threat is never dropped for want of room).
 */
export function planBubbles(input: BubbleInput): Bubble[] {
  const { view } = input;
  const insets = edgeInsets(view, BUBBLE_EDGE_PX);
  const radius = bubbleRadius(view);
  const ranked = input.warns
    .filter((warn) => !input.scoped || warn.priority >= NOTICE_PRIORITY.threat)
    .map((warn) => ({ warn, point: input.project(warn) }))
    .filter((entry): entry is { warn: WarnPointer; point: ScreenPoint } => !!entry.point && !insideInsets(entry.point, view, insets))
    .sort((a, b) => b.warn.priority - a.warn.priority || b.warn.rank - a.warn.rank || a.warn.distanceM - b.warn.distanceM
      || (a.warn.id < b.warn.id ? -1 : a.warn.id > b.warn.id ? 1 : 0));
  const merged: Array<{ lead: WarnPointer; x: number; y: number; angle: number; count: number }> = [];
  for (const { warn, point } of ranked) {
    const at = edgePointer(point, view, insets);
    // warnings merge with warnings; an objective's indicator only with its own kind (a ball never hides under a tank)
    const near = merged.find((bubble) => Math.hypot(bubble.x - at.x, bubble.y - at.y) < MERGE_PX
      && (bubble.lead.kind === warn.kind || (bubble.lead.priority >= NOTICE_PRIORITY.threat && warn.priority >= NOTICE_PRIORITY.threat)));
    if (near) { near.count += 1; continue; }
    merged.push({ lead: warn, x: at.x, y: at.y, angle: at.angle, count: 1 });
  }
  const loop = rim(view, insets);
  const placed: ScreenBox[] = [];
  const out: Bubble[] = [];
  for (const bubble of merged.slice(0, bubbleCap(view))) {
    const home = loop.of(bubble.x, bubble.y);
    let x = bubble.x, y = bubble.y;
    const free = (px: number, py: number): boolean => {
      const box = bubbleBox(px, py, radius);
      return !input.noCover.some((hud) => crosses(box, hud, BUBBLE_GAP_PX)) && !placed.some((other) => crosses(box, other, BUBBLE_GAP_PX));
    };
    if (!free(x, y)) {
      for (let slide = BUBBLE_STEP_PX; slide <= BUBBLE_SLIDE_MAX_PX; slide += BUBBLE_STEP_PX) {
        const ahead = loop.at(home + slide), back = loop.at(home - slide);
        if (free(ahead.x, ahead.y)) { ({ x, y } = ahead); break; }
        if (free(back.x, back.y)) { ({ x, y } = back); break; }
      }
    }
    placed.push(bubbleBox(x, y, radius));
    // the arrow keeps pointing at the warning from where the bubble stands now
    const angle = x === bubble.x && y === bubble.y ? bubble.angle : slidAngle(bubble, x, y, view);
    out.push({
      id: bubble.lead.id, kind: bubble.lead.kind, x, y, angle, count: bubble.count, distanceM: bubble.lead.distanceM,
      countdownLeft: bubble.lead.countdownLeft ?? null, countdownS: bubble.lead.countdownS ?? null, side: bubble.lead.side ?? 'enemy',
    });
  }
  return out;
}

/** A slid bubble's arrow: from where it stands toward the point its unslid place was on the way to (the line from the
 *  screen's centre through it, carried well past the rim). */
function slidAngle(bubble: { x: number; y: number; angle: number }, x: number, y: number, view: Viewport): number {
  const far = Math.max(view.width, view.height);
  const tx = bubble.x + Math.cos(bubble.angle) * far, ty = bubble.y + Math.sin(bubble.angle) * far;
  return Math.atan2(ty - y, tx - x);
}

// ── the warnings' sources (pure) ──────────────────────────────────────────────────────────────────────────────────────

/** A hull the client draws: its pose, its gun's yaw in the world, and whether the viewer's side sees it. */
export interface WarnTank {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The gun's yaw in the world (hull yaw + turret yaw). */
  readonly gunYaw: number;
  readonly enemy: boolean;
  readonly alive: boolean;
  /** Spotted by the viewer's side (a hull the viewer cannot see is never warned of: the warning reveals nothing). */
  readonly spotted: boolean;
}

/** A gun is on the tank while the tank stands within this of its line (m), out to GUN_REACH_M. */
export const GUN_ON_M = 3;
const GUN_REACH_M = 900;
/** A hull this close is a warning whatever its gun does (m). */
export const CLOSE_M = 50;
/** The tank's middle above its pose (m): what a gun lays on, and where the bubble points. */
const HULL_MID_M = 1.6;

/**
 * The tanks to warn of (Kevin: "tanks to your flank or in your rear"): every spotted, living enemy whose gun's line
 * passes within GUN_ON_M of the player's tank, ahead of it and within GUN_REACH_M, or that stands within CLOSE_M. Which of
 * them the camera shows (and so gets no bubble) is planBubbles'.
 */
export function tankWarnings(player: WorldPoint, tanks: readonly WarnTank[]): WarnPointer[] {
  const out: WarnPointer[] = [];
  for (const tank of tanks) {
    if (!tank.enemy || !tank.alive || !tank.spotted) continue;
    const dx = player.x - tank.x, dz = player.z - tank.z;
    const distanceM = Math.hypot(dx, dz);
    const along = dx * Math.sin(tank.gunYaw) + dz * Math.cos(tank.gunYaw);
    const across = Math.abs(dx * Math.cos(tank.gunYaw) - dz * Math.sin(tank.gunYaw));
    const gunOn = along > 0 && along <= GUN_REACH_M && across <= GUN_ON_M;
    if (!gunOn && distanceM > CLOSE_M) continue;
    out.push({
      id: `tank:${tank.id}`, kind: 'tank', x: tank.x, y: tank.y + HULL_MID_M, z: tank.z, priority: NOTICE_PRIORITY.threat,
      rank: gunOn ? WARN_RANK.gunOn : WARN_RANK.close, distanceM,
    });
  }
  return out;
}

/** An enemy strike in progress (ui/minimapObjectives.ts ObjectiveMarker, kind 'strike'). */
export interface WarnStrike {
  readonly x: number;
  readonly z: number;
  readonly side: string;
  /** The call-in's kind (sim/matchRuleset.ts AirStrikeKind). */
  readonly status?: string;
  readonly countdownS?: number;
  readonly radiusM?: number;
  readonly halfLengthM?: number;
}

/** An air run is a warning while the tank stands within its footprint's reach and this margin (m). */
const STRIKE_MARGIN_M = 40;
/** The warning's countdown ring empties over the last this many seconds before the landing. */
export const STRIKE_RING_S = 10;
/** An aircraft in the air from its call (ui/minimapObjectives.ts ObjectiveMarker, kind 'aircraft'): where its run has it now. */
export interface WarnAircraft {
  readonly x: number;
  readonly y?: number;
  readonly z: number;
  readonly side: string;
  /** The call-in's kind, as its strike's. */
  readonly status?: string;
  /** While it is inbound on the viewer's side: the mark it is coming for (its strike's). */
  readonly toX?: number;
  readonly toZ?: number;
}

/**
 * The air runs to warn of (Kevin: "incoming air assaults and weaponry"): every enemy call-in still to land whose footprint
 * the tank stands in or near. Its bubble points where its danger is now: the aircraft flying it (its live pose, so the
 * bubble moves round the rim as the aircraft does), or the mark for a call-in nothing flies (the shells); its ring is the
 * warning's time left.
 */
export function strikeWarnings(player: WorldPoint, strikes: readonly WarnStrike[], aircraft: readonly WarnAircraft[] = []): WarnPointer[] {
  const out: WarnPointer[] = [];
  strikes.forEach((strike, index) => {
    if (strike.side !== 'enemy' || !(strike.countdownS! > 0) || strike.status === 'recon') return;
    const reach = (strike.radiusM ?? strike.halfLengthM ?? 30) + STRIKE_MARGIN_M;
    const distanceM = Math.hypot(player.x - strike.x, player.z - strike.z);
    if (distanceM > reach) return;
    const plane = aircraft.find((a) => a.side === 'enemy' && a.status === strike.status && a.toX === strike.x && a.toZ === strike.z);
    const from = plane ? { x: plane.x, y: plane.y ?? player.y, z: plane.z } : { x: strike.x, y: player.y, z: strike.z };
    out.push({
      id: `air:${index}:${strike.status ?? ''}`, kind: 'air', ...from, priority: NOTICE_PRIORITY.threat, rank: WARN_RANK.air,
      distanceM, countdownS: strike.countdownS, countdownLeft: Math.max(0, Math.min(1, strike.countdownS! / STRIKE_RING_S)),
    });
  });
  return out;
}

/** A guided round in flight the client draws: where it is, which way it flies, and whose it is. */
export interface WarnMissile {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vz: number;
  readonly enemy: boolean;
}

/** A missile is coming at the tank while its course passes within this of it (m), and it is within MISSILE_REACH_M. */
const MISSILE_ON_M = 8;
const MISSILE_REACH_M = 1500;

/** The missiles to warn of (Kevin: "incoming missile"): an enemy's guided round in flight whose course comes at the tank. */
export function missileWarnings(player: WorldPoint, missiles: readonly WarnMissile[]): WarnPointer[] {
  const out: WarnPointer[] = [];
  for (const missile of missiles) {
    if (!missile.enemy) continue;
    const speed = Math.hypot(missile.vx, missile.vz);
    const dx = player.x - missile.x, dz = player.z - missile.z;
    const distanceM = Math.hypot(dx, dz);
    if (distanceM > MISSILE_REACH_M) continue;
    // a guided round turns onto its target: one already close is coming whatever its course is now
    if (speed > 1e-6 && distanceM > MISSILE_ON_M * 2) {
      const along = (dx * missile.vx + dz * missile.vz) / speed;
      const across = Math.abs(dx * missile.vz - dz * missile.vx) / speed;
      if (along <= 0 || across > MISSILE_ON_M + along * 0.05) continue;
    }
    out.push({ id: `missile:${missile.id}`, kind: 'missile', x: missile.x, y: missile.y, z: missile.z, priority: NOTICE_PRIORITY.threat,
      rank: WARN_RANK.missile, distanceM });
  }
  return out;
}

/** An enemy drone in the air (a carrier's `aerial`, sim/matchModes.ts AerialState kind 'drone'): where it flies, whether
 *  its carrier is spotted by the viewer's side (a drone whose carrier the viewer cannot see is never warned of). */
export interface WarnDrone {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly enemy: boolean;
  readonly spotted: boolean;
}

/** A drone is a warning while it flies within this of the tank, on the ground (m): about its own spotting reach. */
export const DRONE_REACH_M = 400;

/** The drones to warn of (Kevin, 2026-11-23: "lets also add warnings for drones, not just airstrikes and missiles"): an
 *  enemy drone in the air near the tank, its carrier spotted. Its bubble points at the drone where it flies. */
export function droneWarnings(player: WorldPoint, drones: readonly WarnDrone[]): WarnPointer[] {
  const out: WarnPointer[] = [];
  for (const drone of drones) {
    if (!drone.enemy || !drone.spotted) continue;
    const distanceM = Math.hypot(player.x - drone.x, player.z - drone.z);
    if (distanceM > DRONE_REACH_M) continue;
    out.push({ id: `drone:${drone.id}`, kind: 'drone', x: drone.x, y: drone.y, z: drone.z, priority: NOTICE_PRIORITY.threat,
      rank: WARN_RANK.drone, distanceM });
  }
  return out;
}

// ── the moving objectives' indicators (pure) ──────────────────────────────────────────────────────────────────────────

/** An objective as the mode marks it (ui/minimapObjectives.ts ObjectiveMarker): the fields the indicators read. */
export interface RimObjective {
  readonly kind: string;
  readonly x: number;
  readonly z: number;
  readonly side: string;
  readonly status?: string;
}

/** The juggernaut as the viewer's client draws it (the mode state's `boss`, found among the frame's hulls). */
export interface RimBoss {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly enemy: boolean;
  readonly alive: boolean;
  /** Spotted by the viewer's side: the indicator reveals nothing the viewer cannot see. */
  readonly spotted: boolean;
}

/** Where an indicator points above the ground (m): the ball's centre (sim/matchModes.ts, a 2.2 m buoy), a flag on its
 *  carrier, a hull's turret. */
const BALL_UP_M = 2.2;
const FLAG_UP_M = 4;
const HULL_UP_M = 2;

const indicatorSide = (side: string): WarnSide => (side === 'own' ? 'own' : side === 'enemy' ? 'enemy' : 'neutral');

/**
 * The moving objectives' rim indicators: the Turbo Ball ball, each carried flag (its flag's colour, on its carrier), the
 * juggernaut while the viewer's side sees it (never the viewer's own hull). Each is ambient on the ladder, so the sight
 * stands it down and a warning outranks it; planBubbles drops it while the camera shows it. The world's floating icons
 * (game/matchModeWorldPresentation.ts) mark the same objectives on the screen.
 */
export function objectiveIndicators(
  player: WorldPoint & { readonly id?: string }, markers: readonly RimObjective[], boss: RimBoss | null,
  groundY: (x: number, z: number) => number,
): WarnPointer[] {
  const out: WarnPointer[] = [];
  const at = (id: string, kind: WarnKind, x: number, y: number, z: number, side: WarnSide): void => {
    out.push({ id, kind, x, y, z, side, priority: NOTICE_PRIORITY.ambient, rank: 0, distanceM: Math.hypot(player.x - x, player.z - z) });
  };
  for (const marker of markers) {
    if (marker.kind === 'ball') at('ball', 'ball', marker.x, groundY(marker.x, marker.z) + BALL_UP_M, marker.z, 'neutral');
    else if (marker.kind === 'flag' && marker.status === 'carried') {
      at(`flag:${marker.side}`, 'flag', marker.x, groundY(marker.x, marker.z) + FLAG_UP_M, marker.z, indicatorSide(marker.side));
    }
  }
  if (boss && boss.alive && boss.spotted && boss.id !== player.id) at('boss', 'boss', boss.x, boss.y + HULL_UP_M, boss.z, boss.enemy ? 'enemy' : 'own');
  return out;
}
