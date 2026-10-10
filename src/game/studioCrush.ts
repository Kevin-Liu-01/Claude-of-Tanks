/**
 * Hulls on the Scene Studio's timeline crush what they overrun (2026-10-06; the media review's engine clips showed
 * tanks at 9–15 m/s passing through standing fences, stone walls, carts and stalls; owner: "if our tanks run through
 * props that are destructible, they should properly destruct"). A battle hull destroys props two ways, and the Studio
 * plans both from its tracks:
 * - a crushable collision record it overruns faster than the record's overrun speed (state.ts shouldCrushObstacle →
 *   world.crushObstacle: the prop topples, breaks or flies with its debris and sound; a tree falls);
 * - a crushable the battle topples by presentation — utility poles and loop-class dressing — whose centre comes within
 *   half the hull's length plus half a metre at more than 1.2 m/s (battlePresentationRuntime.ts crushNearbyProps →
 *   world.crushProp, then the effects' crush burst).
 * Each is an event at the first such moment. Playback fires each event as the clock crosses it; a seek restores the
 * battlefield's destructibles when an applied event lies past the new time (or one is still falling), then lays every
 * event up to it at its final pose.
 */
import { pushHullFromObstacle, type CollisionRecord, type ObstacleQuery } from '../world/collision.ts';

/** The overrun speed of a crushable record without its own (state.ts CRUSH_MIN_MPS, about 6 km/h). */
const CRUSH_MIN_MPS = 6 / 3.6;
/** The speed above which a hull topples the presentation crushables (battlePresentationRuntime.ts crushNearbyProps). */
const PROP_CRUSH_MIN_MPS = 1.2;
/** The plan's step, the simulation's: a 15 m/s hull moves 0.25 m per step, under any crushable record's width. */
const PLAN_STEP_MS = 1000 / 60;
/** A seek runs the presentation crushables' falls to their end at once: crushProp has no settled pose (a topple
 * takes 1.1 s, a toss 1.5 s, a felled trunk about 1.27 s). */
const SETTLE_S = 1.6;

export interface StudioCrushPose { x: number; z: number; yawRad: number }

/** A hull on the timeline: its contact rectangle's half extents and its pose along its track. */
export interface StudioCrushHull {
  readonly halfLength: number;
  readonly halfWidth: number;
  /** The presentation crush's reach from the hull's centre (the battle's half hull length + 0.5 m). */
  readonly crushReach?: number;
  /** The hull's pose at a timeline time (ms); false where it has no track. */
  poseAt(tMs: number, out: StudioCrushPose): boolean;
}

/** A presentation crushable (props.ts CrushableRecord): utility poles and loop-class dressing. */
export interface StudioCrushable {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly h: number;
  readonly kind?: string;
  readonly dynamic?: boolean;
}

export interface StudioCrushEvent {
  readonly tMs: number;
  /** The collision record crushed (crushObstacle), or null for a presentation crushable. */
  readonly record: CollisionRecord | null;
  /** The presentation crushable's index in world.crushables (crushProp), or -1 for a record. */
  readonly crushable: number;
  /** The hull's travel direction at the overrun (unit). */
  readonly dirX: number;
  readonly dirZ: number;
  readonly speedMps: number;
}

/** The battlefield the crushes land on (map.ts WorldRuntime). */
export interface StudioCrushWorld {
  crushObstacle(
    record: CollisionRecord, dx: number, dz: number, speedMps?: number, cause?: 'ram' | 'shell',
    options?: { settled?: boolean },
  ): boolean;
  crushProp(index: number, dx: number, dz: number, speedMps?: number): boolean;
  resetDestructibles(): void;
  advanceDestruction(dt: number): void;
}

/**
 * Every crush the hulls' tracks make over `durationMs`, in time order. Each record and each crushable is crushed once,
 * by the first hull to overrun it; the plan reads the battlefield as intact (applying it starts from a reset).
 */
export function planStudioCrushes(
  hulls: readonly StudioCrushHull[], durationMs: number, query: ObstacleQuery,
  crushables: readonly StudioCrushable[] = [], stepMs = PLAN_STEP_MS,
): StudioCrushEvent[] {
  const candidates: StudioCrushEvent[] = [];
  const met = new Set<CollisionRecord>(), metProp = new Set<number>();
  const near: CollisionRecord[] = [];
  const pose: StudioCrushPose = { x: 0, z: 0, yawRad: 0 };
  const push = { x: 0, z: 0 };
  const steps = Math.floor(durationMs / stepMs);
  for (const hull of hulls) {
    const reach = Math.hypot(hull.halfLength, hull.halfWidth), propReach = hull.crushReach ?? hull.halfLength + 0.5;
    // the crushables near this hull's path (its bounds, padded by the reach)
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let step = 0; step <= steps; step++) {
      if (!hull.poseAt(step * stepMs, pose)) continue;
      x0 = Math.min(x0, pose.x); x1 = Math.max(x1, pose.x); z0 = Math.min(z0, pose.z); z1 = Math.max(z1, pose.z);
    }
    const props: number[] = [];
    for (let i = 0; i < crushables.length; i++) {
      const c = crushables[i];
      if (c.x > x0 - propReach && c.x < x1 + propReach && c.z > z0 - propReach && c.z < z1 + propReach) props.push(i);
    }
    let prevX = 0, prevZ = 0, havePrev = false;
    met.clear(); metProp.clear();
    for (let step = 0; step <= steps; step++) {
      const tMs = step * stepMs;
      if (!hull.poseAt(tMs, pose)) { havePrev = false; continue; }
      const dx = pose.x - prevX, dz = pose.z - prevZ, dist = Math.hypot(dx, dz);
      const speed = havePrev ? dist / (stepMs / 1000) : 0;
      prevX = pose.x; prevZ = pose.z; havePrev = true;
      if (!(speed > Math.min(CRUSH_MIN_MPS * 0.5, PROP_CRUSH_MIN_MPS))) continue;
      const dirX = dx / dist, dirZ = dz / dist;
      if (speed > PROP_CRUSH_MIN_MPS) {
        for (const i of props) {
          if (metProp.has(i)) continue;
          const c = crushables[i], ox = c.x - pose.x, oz = c.z - pose.z;
          if (ox * ox + oz * oz > propReach * propReach) continue;
          metProp.add(i);
          candidates.push({ tMs, record: null, crushable: i, dirX, dirZ, speedMps: speed });
        }
      }
      const fx = Math.sin(pose.yawRad), fz = Math.cos(pose.yawRad);
      near.length = 0;
      query(pose.x - reach, pose.z - reach, pose.x + reach, pose.z + reach, near);
      for (const record of near) {
        if (!record.crushable || met.has(record)) continue;
        if (!(speed > (record.crushMin ?? CRUSH_MIN_MPS))) continue;
        push.x = 0; push.z = 0;
        if (!pushHullFromObstacle(pose, fx, fz, fz, -fx, hull.halfLength, hull.halfWidth, record, push)) continue;
        met.add(record);
        candidates.push({ tMs, record, crushable: -1, dirX, dirZ, speedMps: speed });
      }
    }
  }
  // each hull's first overrun of each record or crushable is a candidate; the earliest one crushes it (a stable sort
  // keeps the hulls' order on a tie)
  candidates.sort((a, b) => a.tMs - b.tMs);
  const taken = new Set<CollisionRecord | number>();
  return candidates.filter((event) => {
    const key = event.record ?? event.crushable;
    return !taken.has(key) && !!taken.add(key);
  });
}

export interface StudioCrushes {
  /** A new plan (the tracks, the hulls or the battlefield changed): what the old one crushed stands again. */
  setPlan(world: StudioCrushWorld | null, events: readonly StudioCrushEvent[]): void;
  /**
   * Playback crossed `tMs`: fire every event up to it with the world's fall, debris and sound; `onProp` adds a
   * presentation crushable's burst (the battle's fx.propCrush / fx.loosePropHit). Returns how many fired.
   */
  advanceTo(world: StudioCrushWorld, tMs: number, onProp?: (event: StudioCrushEvent) => void): number;
  /** A seek to `tMs`: every event up to it lies at its final pose and nothing after it is crushed. */
  settleTo(world: StudioCrushWorld, tMs: number): void;
  /** Leave the battlefield as the Studio found it. */
  restore(world: StudioCrushWorld | null): void;
  /** The time of the next event not yet applied (Infinity when none). */
  nextTime(): number;
  readonly events: readonly StudioCrushEvent[];
}

export function createStudioCrushes(): StudioCrushes {
  let events: readonly StudioCrushEvent[] = [];
  let applied = 0; // events[0, applied) stand crushed in the world
  let live = false; // one of them was fired live: its fall may still be running
  let touched = false; // the world holds a crush of ours
  const reset = (world: StudioCrushWorld | null) => {
    if (touched) world?.resetDestructibles();
    applied = 0; live = false; touched = false;
  };
  return {
    setPlan(world, next) { reset(world); events = next; },
    advanceTo(world, tMs, onProp) {
      const start = applied;
      while (applied < events.length && events[applied].tMs <= tMs) {
        const e = events[applied++];
        if (e.record) world.crushObstacle(e.record, e.dirX, e.dirZ, e.speedMps, 'ram');
        else if (world.crushProp(e.crushable, e.dirX, e.dirZ, e.speedMps)) onProp?.(e);
        live = true; touched = true;
      }
      return applied - start;
    },
    settleTo(world, tMs) {
      if (live || (applied > 0 && events[applied - 1].tMs > tMs)) reset(world);
      let felled = 0;
      while (applied < events.length && events[applied].tMs <= tMs) {
        const e = events[applied++];
        if (e.record) world.crushObstacle(e.record, e.dirX, e.dirZ, e.speedMps, 'ram', { settled: true });
        else if (world.crushProp(e.crushable, e.dirX, e.dirZ, e.speedMps)) felled++;
        touched = true;
      }
      // settled records write their final poses on the next step; the crushables' falls run to their end
      world.advanceDestruction(felled ? SETTLE_S : 0);
    },
    restore(world) { reset(world); },
    nextTime: () => (applied < events.length ? events[applied].tMs : Infinity),
    get events() { return events; },
  };
}
