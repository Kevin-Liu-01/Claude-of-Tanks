/**
 * killcamStrikeShot.ts — the kill cam's shot of an Air Support kill (killcam-strike-shot-276; Kevin 2026-11-24: "yes give
 * air strike kills their own replay shot"). A strike's round leaves an aircraft (or the battery off the map), never a
 * hull, so the tank shot's grammar (the cut to the killer on its firing pose) has nothing to frame. Its shot is planned
 * from what the sim already announced: the round's launch (mode:strike_round: where it left, which way, how fast, whether
 * it falls free) and the strike's public record (its mark, heading and timing), from which sim/strikeRuns.ts flies the
 * same run the authority fired from. One planner, every kind, with each kind's framing as data (STRIKE_SHOT_FRAMING):
 *   1. the run: a chase on the aircraft over the last `leadS` of its run before the round leaves, the look easing from
 *      ahead of the nose onto the mark (none for the battery: no aircraft);
 *   2. the round: the kill cam's flight chase along the round's own path (the sim's trace, or the launch's arc when the
 *      trace is sparse), trimmed to its last `trimM` for a round that comes from far off (the battery, the AC-130);
 *   3. the hit and its card, as every replay ends.
 * The aircraft on screen is staged from this run at the replay's own clock (strikeReplayState.ts), never the live one.
 * Pure: no DOM, no WebGL. Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import { AIR_SUPPORT_RULES, airStrikeFlies, type AirStrikeKind } from '../sim/matchRuleset.ts';
import { BOMB_GRAVITY_MPS2, runPose, type RunPose, type RunRecord } from '../sim/strikeRuns.ts';

type Vec3 = [number, number, number];
interface Vec3Like { x: number; y: number; z: number }

/** What a strike kill's shot is planned from: the round's launch and its strike's public record. */
export interface StrikeShotRecord {
  strikeId: number;
  kind: AirStrikeKind;
  /** The strike's public record (its run is flown from it); null when the presentation never saw it. */
  run: RunRecord | null;
  /** The game time the round left the aircraft (or the battery). */
  firedS: number;
  from: Vec3;
  /** The round's launch velocity (m/s). */
  vel: Vec3;
  /** An unpowered store (the bomb): it falls on its arc and draws no tracer. */
  freeFall: boolean;
  /** The strike's clock at the flight shot's first point (the path may be trimmed; set when the kill is snapshotted). */
  flightStartS?: number;
}

/** One kind's framing: the run shot's length and where the camera rides on the aircraft (its run frame: `back` behind the
 *  nose, `up` above, `side` to the port side, negative to starboard), how far ahead of the nose it looks at first, how much
 *  of the way to the mark the look eases by the release, its lens, and how much of the round's path the flight shows. */
interface StrikeShotFraming {
  readonly leadS: number;
  readonly back: number;
  readonly up: number;
  readonly side: number;
  readonly lookAhead: number;
  readonly toMark: number;
  readonly fov: number;
  readonly trimM: number;
}

/** Each kind's framing (the one planner's parameters). The run shot holds its aircraft at about a fifth of a 16:9 frame's
 *  width with the mark in frame throughout (Main 2026-11-24: 15-25 %), on a 40 degree lens; the receipt measures it. */
export const STRIKE_SHOT_FRAMING: Readonly<Record<AirStrikeKind, StrikeShotFraming>> = Object.freeze({
  // the A-10's dive down the lane: dead astern and a little above on a long lens, the lane rising into the frame as the gun
  // opens (astern keeps the airframe whole in a portrait frame, which shares this lens's height but not its width)
  strafe: Object.freeze({ leadS: 1.5, back: 57, up: 9, side: 0, lookAhead: 70, toMark: 0.75, fov: 40, trimM: Infinity }),
  // the fighter's steep dive and the release: astern and above, the mark beyond the nose
  bomb: Object.freeze({ leadS: 1.5, back: 32, up: 6, side: 0, lookAhead: 90, toMark: 0.7, fov: 40, trimM: Infinity }),
  // the Maverick run's shallow dive, astern, the nose on the mark the whole while
  missile: Object.freeze({ leadS: 1.4, back: 34, up: 5, side: 0, lookAhead: 90, toMark: 0.7, fov: 40, trimM: Infinity }),
  // the AC-130's pylon turn (the mark off its port wing): outside the orbit off its starboard wing and above, in the plane
  // across its flight, looking through the airframe down onto the mark
  gunship: Object.freeze({ leadS: 1.6, back: 10, up: 50, side: -108, lookAhead: 0, toMark: 0.45, fov: 40, trimM: 260 }),
  // the recon pass fires nothing; kept for the table's completeness
  recon: Object.freeze({ leadS: 0, back: 30, up: 8, side: 10, lookAhead: 90, toMark: 0.5, fov: 50, trimM: Infinity }),
  // the battery is off the map: no run shot, the round's last plunge onto the mark
  artillery: Object.freeze({ leadS: 0, back: 0, up: 0, side: 0, lookAhead: 0, toMark: 0, fov: 50, trimM: 140 }),
});

const R = AIR_SUPPORT_RULES;
const STEP_S = 1 / 60;
const smooth = (u: number): number => u * u * (3 - 2 * u);

/** The run shot's span (game seconds), or null when the kill has none (no aircraft, no record, no lead). */
export function strikeRunSpan(shot: StrikeShotRecord): { startS: number; durS: number } | null {
  const framing = STRIKE_SHOT_FRAMING[shot.kind];
  if (!shot.run || !airStrikeFlies(shot.kind) || !(framing.leadS > 0)) return null;
  return { startS: shot.firedS - framing.leadS, durS: framing.leadS };
}

/**
 * The run shot at game time `timeS` (`u` its progress 0..1): the aircraft's pose into `pose`, the camera's position and
 * look target into `camPos` and `camLook`. No allocation.
 */
export function strikeRunCamera(shot: StrikeShotRecord, timeS: number, u: number, pose: RunPose,
  camPos: Vec3Like, camLook: Vec3Like): void {
  const framing = STRIKE_SHOT_FRAMING[shot.kind];
  runPose(R, shot.run!, timeS, pose);
  const cp = Math.cos(pose.pitch);
  const fx = Math.sin(pose.yaw) * cp, fy = Math.sin(pose.pitch), fz = Math.cos(pose.yaw) * cp;
  // the port side of a nose +Z airframe (its local +X): (cos yaw, 0, -sin yaw)
  const lx = Math.cos(pose.yaw), lz = -Math.sin(pose.yaw);
  camPos.x = pose.x - fx * framing.back + lx * framing.side;
  camPos.y = pose.y - fy * framing.back + framing.up;
  camPos.z = pose.z - fz * framing.back + lz * framing.side;
  const k = framing.toMark * smooth(Math.max(0, Math.min(1, u)));
  const ax = pose.x + fx * framing.lookAhead, ay = pose.y + fy * framing.lookAhead, az = pose.z + fz * framing.lookAhead;
  const mark = shot.run!;
  camLook.x = ax + (mark.x - ax) * k;
  camLook.y = ay + (mark.y - ay) * k;
  camLook.z = az + (mark.z - az) * k;
}

/**
 * The round's path for the flight shot, as flat x y z triples: the sim's trace when it has the round's flight (at least
 * four points before the impact), else the launch's own path (the free fall's arc, a powered round's line), a point a
 * fixed step, ending on the impact. Trimmed to its last `trimM` metres. Also the game time at its first point.
 */
export function strikeFlightPath(shot: StrikeShotRecord, trace: readonly number[] | null, impact: Vec3,
  hitS: number): { points: number[]; startS: number } {
  let points: number[];
  if (trace && trace.length >= 15) points = trace.slice();
  else {
    points = [];
    const flightS = Math.max(STEP_S, hitS - shot.firedS);
    const steps = Math.max(1, Math.min(2400, Math.ceil(flightS / STEP_S)));
    const [x0, y0, z0] = shot.from;
    const [vx, vy, vz] = shot.vel;
    const g = shot.freeFall ? BOMB_GRAVITY_MPS2 : 0;
    for (let i = 0; i < steps; i++) {
      const t = i * STEP_S;
      points.push(x0 + vx * t, y0 + vy * t - 0.5 * g * t * t, z0 + vz * t);
    }
    // the launch's path meets the impact the sim resolved: its error spread back along the path (none at the launch)
    const t1 = steps * STEP_S;
    const ex = impact[0] - (x0 + vx * t1), ey = impact[1] - (y0 + vy * t1 - 0.5 * g * t1 * t1), ez = impact[2] - (z0 + vz * t1);
    for (let i = 0; i < steps; i++) {
      const w = i / steps;
      points[i * 3] += ex * w; points[i * 3 + 1] += ey * w; points[i * 3 + 2] += ez * w;
    }
    points.push(impact[0], impact[1], impact[2]);
  }
  // trim from the launch end to the last trimM metres (the time at the new start by the share of the path left behind)
  const trimM = STRIKE_SHOT_FRAMING[shot.kind].trimM;
  const n = points.length / 3;
  let total = 0;
  for (let i = 1; i < n; i++) total += Math.hypot(points[i * 3] - points[i * 3 - 3], points[i * 3 + 1] - points[i * 3 - 2], points[i * 3 + 2] - points[i * 3 - 1]);
  if (!(total > trimM) || n < 3) return { points, startS: shot.firedS };
  let fromEnd = 0, cut = n - 1;
  while (cut > 0 && fromEnd < trimM) {
    fromEnd += Math.hypot(points[cut * 3] - points[cut * 3 - 3], points[cut * 3 + 1] - points[cut * 3 - 2], points[cut * 3 + 2] - points[cut * 3 - 1]);
    cut--;
  }
  const left = Math.max(0, total - fromEnd);
  return { points: points.slice(cut * 3), startS: shot.firedS + (hitS - shot.firedS) * (left / total) };
}
