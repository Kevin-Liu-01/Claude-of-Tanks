/**
 * The replay viewer's posing step (replay-system, docs/REPLAY.md §5): each frame, the track's moment written onto the
 * battle's hulls the way the online client writes a remote tank, so the presentation draws them with its own sync and
 * nothing simulates. It writes the pose (position, yaw, the visual pitch and roll, turret, gun), the speed, the hp and
 * the destroyed and burning flags, and reports the edges the page acts on: a hull that left or rejoined the field (its
 * visual hidden or shown) and a hull whose destroyed or burning flag changed (its wreck set or reset, so a seek back
 * across a kill shows the living tank). The viewer's own copy of the posing, not src/mp's, to keep the driver boundary.
 * Node-runnable, no DOM; allocates nothing per frame.
 */
import type { ReplayPose } from '../replayPose.ts';
import { TRACK_FLAG_BURNING, TRACK_FLAG_DESTROYED, trackPose, trackValue, type ReplayTrack } from './replayTrack.ts';

/** What the poser writes on a hull: the fields the presentation's sync reads. */
export interface PosedHull {
  readonly id: string;
  state: {
    pos: { x: number; y: number; z: number };
    yaw: number; visualPitch: number; visualRoll: number; turretYaw: number; gunPitch: number; speed: number;
  } | null;
  combat: { hp: number; destroyed: boolean; fire?: { burning: boolean } | null } | null;
}

export interface PoserEdges<THull extends PosedHull> {
  /** The hull is on the field (posed) or not (before it spawned, between a death and a respawn when parked). */
  onPresence?(hull: THull, present: boolean): void;
  /** Its destroyed or burning flag changed since the last frame (or since the first). */
  onCondition?(hull: THull, destroyed: boolean, burning: boolean): void;
}

export interface TrackPoser {
  /** Pose every hull at `timeS`. */
  apply(timeS: number): void;
  /** The track's hull index of `id`, or -1 (a hull of the battle the track does not carry). */
  indexOf(id: string): number;
}

export function createTrackPoser<THull extends PosedHull>(track: ReplayTrack, hulls: readonly THull[], edges: PoserEdges<THull> = {}): TrackPoser {
  const byId = new Map(hulls.map((hull) => [hull.id, hull]));
  const indexById = new Map(track.hulls.map((hull, index) => [hull.id, index]));
  // the track's hulls in its order, matched to the battle's (a hull missing on either side is skipped)
  const posed = track.hulls.map((entry) => byId.get(entry.id) ?? null);
  const present = new Int8Array(posed.length).fill(-1);
  const condition = new Int8Array(posed.length).fill(-1);
  const pose: ReplayPose = { pos: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0 };
  return {
    apply(timeS) {
      for (let i = 0; i < posed.length; i++) {
        const hull = posed[i];
        if (!hull) continue;
        const onField = trackPose(track, i, timeS, pose);
        if (onField && hull.state) {
          const state = hull.state;
          state.pos.x = pose.pos[0]; state.pos.y = pose.pos[1]; state.pos.z = pose.pos[2];
          state.yaw = pose.yaw; state.visualPitch = pose.pitch; state.visualRoll = pose.roll;
          state.turretYaw = pose.turretYaw; state.gunPitch = pose.gunPitch;
          state.speed = trackValue(track, i, 'speed', timeS);
        }
        const nowPresent = onField ? 1 : 0;
        if (present[i] !== nowPresent) { present[i] = nowPresent; edges.onPresence?.(hull, onField); }
        if (!onField) continue;
        const flags = trackValue(track, i, 'flags', timeS);
        const destroyed = (flags & TRACK_FLAG_DESTROYED) !== 0, burning = (flags & TRACK_FLAG_BURNING) !== 0;
        if (hull.combat) {
          hull.combat.hp = trackValue(track, i, 'hp', timeS);
          hull.combat.destroyed = destroyed;
          if (hull.combat.fire) hull.combat.fire.burning = burning;
        }
        const nowCondition = (destroyed ? 1 : 0) | (burning ? 2 : 0);
        if (condition[i] !== nowCondition) { condition[i] = nowCondition; edges.onCondition?.(hull, destroyed, burning); }
      }
    },
    indexOf: (id) => indexById.get(id) ?? -1,
  };
}
