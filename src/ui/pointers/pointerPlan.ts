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
 * - follow (where to go: a tutorial waypoint, a thing to look at, the Turbo Ball ball, the objective that matters now):
 *   painted on the ground, never on the screen's rim. ONE follow pointer shows (pickFollow): a chevron trail laid flat on
 *   the terrain from the tank toward it (trailChevrons), and, while it stands out of the camera's view, a curved arrow
 *   painted round the tank sweeping the way to turn (turnArrow). Its destination is its owner's own (the tutorial's
 *   ring, the objective's disc and beacon, the ball).
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

/** waypoint: a place to drive to; look: a thing to turn toward (no trail); ball, objective: the mode's. */
type FollowKind = 'waypoint' | 'look' | 'ball' | 'objective';

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

/** Which follow pointer shows when several do: the tutorial's own first, then the ball, then the objective. */
const FOLLOW_ORDER: Readonly<Record<FollowKind, number>> = Object.freeze({ waypoint: 0, look: 1, ball: 2, objective: 3 });

/** The one follow pointer that shows: by kind, then the nearest, then the id. */
export function pickFollow(pointers: readonly FollowPointer[], player: GroundPoint | null): FollowPointer | null {
  let best: FollowPointer | null = null;
  let bestKey = [Infinity, Infinity] as [number, number];
  for (const pointer of pointers) {
    const key: [number, number] = [FOLLOW_ORDER[pointer.kind], player ? Math.hypot(pointer.x - player.x, pointer.z - player.z) : 0];
    if (!best || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && pointer.id < best.id)))) {
      best = pointer;
      bestKey = key;
    }
  }
  return best;
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
/** Half a chevron's length along its way (m). */
export const CHEVRON_HALF_M = 1.3;

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

/** The turn arrow stands while the destination's bearing is more than TURN_FROM_DEG off the camera's heading. */
export const TURN_FROM_DEG = 55;
/** Its band round the tank (m), and the most of a turn it sweeps (deg). */
export const TURN_RADII_M = Object.freeze({ inner: 5.6, outer: 7.0 });
export const TURN_SWEEP_MAX_DEG = 150;
const TURN_START_DEG = 20;
const TURN_SEGMENTS = 14;
const TURN_HEAD_DEG = 16;

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
 * The curved arrow round the tank toward a destination out of view (null while it is within TURN_FROM_DEG of the camera's
 * heading `viewYaw`): a band from just off the view's heading, the way to turn, toward the destination's bearing, at most
 * `maxSweepDeg` of it (TURN_SWEEP_MAX_DEG; the drawer shortens it where the head would leave the screen or meet the HUD),
 * ending in an arrowhead.
 */
export function turnArrow(tank: GroundPoint, viewYaw: number, to: GroundPoint, maxSweepDeg = TURN_SWEEP_MAX_DEG): TurnArrow | null {
  const off = turnFrom(viewYaw, bearing(tank, to));
  if (Math.abs(off) <= (TURN_FROM_DEG * Math.PI) / 180) return null;
  const turn: 1 | -1 = off >= 0 ? 1 : -1;
  const start = viewYaw + turn * (TURN_START_DEG * Math.PI) / 180;
  const sweep = Math.min(Math.abs(off) - (TURN_START_DEG * Math.PI) / 180, (maxSweepDeg * Math.PI) / 180);
  const head = (TURN_HEAD_DEG * Math.PI) / 180;
  const bodyEnd = Math.max(0, sweep - head);
  const at = (yaw: number, r: number): GroundPoint => ({ x: tank.x + Math.sin(yaw) * r, z: tank.z + Math.cos(yaw) * r });
  const { inner, outer } = TURN_RADII_M;
  const band: GroundPoint[] = [];
  for (let i = 0; i <= TURN_SEGMENTS; i++) band.push(at(start + turn * (bodyEnd * i) / TURN_SEGMENTS, outer));
  for (let i = TURN_SEGMENTS; i >= 0; i--) band.push(at(start + turn * (bodyEnd * i) / TURN_SEGMENTS, inner));
  const base = start + turn * bodyEnd;
  const spread = (outer - inner) * 0.9;
  const tip = start + turn * sweep;
  const mid = (inner + outer) / 2;
  return { band, turn, head: [at(base, outer + spread), at(tip, mid), at(base, inner - spread)] };
}

// ── warn: in the UI ───────────────────────────────────────────────────────────────────────────────────────────────────

export type WarnKind = 'tank' | 'missile' | 'air';

export interface WarnPointer {
  readonly id: string;
  readonly kind: WarnKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** On the ladder (NOTICE_PRIORITY): every warning today is a threat. */
  readonly priority: number;
  /** Within its rung, the more urgent first: a missile 3, an air run 2, a gun on the tank 1, a hull close by 0. */
  readonly rank: number;
  /** Ground distance from the tank (m). */
  readonly distanceM: number;
  /** An air run: the seconds to its landing, and how much of its warning is left (1 just called, 0 landing). */
  readonly countdownS?: number;
  readonly countdownLeft?: number;
}

const WARN_RANK = Object.freeze({ missile: 3, air: 2, gunOn: 1, close: 0 });

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
    const near = merged.find((bubble) => Math.hypot(bubble.x - at.x, bubble.y - at.y) < MERGE_PX);
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
      countdownLeft: bubble.lead.countdownLeft ?? null, countdownS: bubble.lead.countdownS ?? null,
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
  readonly heading?: number;
  readonly countdownS?: number;
  readonly radiusM?: number;
  readonly halfLengthM?: number;
}

/** An air run is a warning while the tank stands within its footprint's reach and this margin (m). */
const STRIKE_MARGIN_M = 40;
/** The warning's countdown ring empties over the last this many seconds before the landing. */
export const STRIKE_RING_S = 10;
/** A run's jet comes in from this far back along its heading (m) and this high (m): where its bubble points. */
const APPROACH_BACK_M = 500;
const APPROACH_UP_M = 120;
/** The call-ins with an aircraft running in along a heading; the rest (the shells, the orbit) point at their mark. */
const RUN_IN = new Set(['strafe', 'bomb', 'missile']);

/**
 * The air runs to warn of (Kevin: "incoming air assaults and weaponry"): every enemy call-in still to land whose footprint
 * the tank stands in or near. Its bubble points where its danger comes from: the jet's run-in for a run along a heading,
 * the mark for the rest; its ring is the warning's time left.
 */
export function strikeWarnings(player: WorldPoint, strikes: readonly WarnStrike[]): WarnPointer[] {
  const out: WarnPointer[] = [];
  strikes.forEach((strike, index) => {
    if (strike.side !== 'enemy' || !(strike.countdownS! > 0) || strike.status === 'recon') return;
    const reach = (strike.radiusM ?? strike.halfLengthM ?? 30) + STRIKE_MARGIN_M;
    const distanceM = Math.hypot(player.x - strike.x, player.z - strike.z);
    if (distanceM > reach) return;
    const runIn = RUN_IN.has(strike.status ?? '') && Number.isFinite(strike.heading);
    const heading = strike.heading ?? 0;
    const from = runIn
      ? { x: strike.x - Math.sin(heading) * APPROACH_BACK_M, y: player.y + APPROACH_UP_M, z: strike.z - Math.cos(heading) * APPROACH_BACK_M }
      : { x: strike.x, y: player.y, z: strike.z };
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

// ── the follow pointers' sources (pure) ───────────────────────────────────────────────────────────────────────────────

/** An objective the mode marks (ui/minimapObjectives.ts ObjectiveMarker): the fields the choice reads. */
interface FollowObjective {
  readonly kind: string;
  readonly x: number;
  readonly z: number;
  readonly side: string;
  readonly status?: string;
  readonly label?: string;
}

/** A capture zone's radius (sim/matchModes.ts ZONE_RADIUS_M): the trail stops at its edge. */
export const OBJECTIVE_ZONE_RADIUS_M = 30;
const FLAG_RADIUS_M = 6;
const BALL_RADIUS_M = 3;

/**
 * The follow pointer a mode's objectives give (Kevin: rings on all, "one trail to the one that matters now"): the ball in
 * Turbo Ball; the sector being fought for in Frontline Assault; a zone being taken from the player's side, else the
 * nearest zone it does not hold; in Capture the Flag the own flag while it is away from home and not carried (recover
 * it), else the enemy flag while it is not carried (take it), else the own base (bring it home). None in a mode with
 * nothing to go to (the standard battle, every zone held).
 */
export function objectiveFollow(markers: readonly FollowObjective[], player: GroundPoint | null): FollowPointer | null {
  const ball = markers.find((marker) => marker.kind === 'ball');
  if (ball) return { id: 'ball', kind: 'ball', x: ball.x, z: ball.z, radiusM: BALL_RADIUS_M, trail: true };
  const sector = markers.find((marker) => marker.kind === 'sector' && (marker.status === 'active' || marker.status === 'holding'));
  if (sector) return objective(`sector:${sector.label ?? ''}`, sector, OBJECTIVE_ZONE_RADIUS_M);
  const zones = markers.filter((marker) => marker.kind === 'zone');
  const contested = zones.filter((zone) => zone.side === 'contested');
  const open = zones.filter((zone) => zone.side !== 'own');
  const zone = nearest(contested.length ? contested : open, player);
  if (zone) return objective(`zone:${zone.label ?? ''}`, zone, OBJECTIVE_ZONE_RADIUS_M);
  const flags = markers.filter((marker) => marker.kind === 'flag');
  const own = flags.find((flag) => flag.side === 'own');
  const enemy = flags.find((flag) => flag.side === 'enemy');
  if (own && own.status === 'dropped') return objective('flag:own', own, FLAG_RADIUS_M);
  if (enemy && enemy.status !== 'carried') return objective('flag:enemy', enemy, FLAG_RADIUS_M);
  const base = markers.find((marker) => marker.kind === 'flagBase' && marker.side === 'own');
  if (enemy && base) return objective('flag:home', base, FLAG_RADIUS_M);
  return null;
}

function objective(id: string, at: GroundPoint, radiusM: number): FollowPointer {
  return { id, kind: 'objective', x: at.x, z: at.z, radiusM, trail: true };
}

function nearest<T extends GroundPoint & { readonly label?: string }>(list: readonly T[], player: GroundPoint | null): T | null {
  let best: T | null = null, bestD = Infinity;
  for (const item of list) {
    const d = player ? Math.hypot(item.x - player.x, item.z - player.z) : 0;
    if (d < bestD || (d === bestD && best && (item.label ?? '') < (best.label ?? ''))) { best = item; bestD = d; }
  }
  return best;
}
