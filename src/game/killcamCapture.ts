import { captureReplayPose, type ReplayPose, type ReplayPoseState } from './replayPose.ts';

/**
 * The killcam's capture records (killcam.ts): a hull's combat frame, taken every fixed step and on every hit, and a
 * shell's trace. A step at a full field (a room's 14 v 14) allocates nothing: each hull's step frame is held and
 * refreshed in place, a hit's snapshot takes its own copy of it, and traces fill pooled buffers.
 */

type ModuleStateName = 'ok' | 'yellow' | 'red';
type ModuleStates = Partial<Record<string, ModuleStateName>>;

interface CaptureEntity {
  state?: ReplayPoseState | null;
  combat?: {
    destroyed: boolean;
    modules: Partial<Record<string, { state: ModuleStateName }>>;
    crew: Record<string, boolean>;
    eraSpent: Set<string>;
  } | null;
}

export interface EntityFrame {
  pose: ReplayPose;
  crewAlive: Record<string, boolean> | null;
  moduleStates: ModuleStates | null;
  eraSpent: string[];
  destroyed: boolean;
}

/** @param into a held record refreshed in place (the step capture); absent, a new record */
export function copyModules(ent: CaptureEntity | null, into?: ModuleStates | null): ModuleStates | null {
  const modules = ent?.combat?.modules;
  if (!modules) return null;
  const states: ModuleStates = into ?? {};
  for (const key in modules) {
    const value = modules[key];
    if (value) states[key] = value.state;
  }
  return states;
}

// the step capture's ERA copy: Set.forEach into the held list (a spread or a for-of builds an array or an iterator)
let eraInto: string[] = [];
const pushEraTile = (tile: string): void => { eraInto.push(tile); };

/**
 * A hull's combat frame for a replay. `into`, the step capture's held frame for this hull, is refreshed in place;
 * absent, a new frame.
 */
export function captureEntityFrame(ent: CaptureEntity | null, into?: EntityFrame): EntityFrame | null {
  if (!ent || !ent.state) return null;
  const combat = ent.combat;
  if (!into) {
    return {
      pose: captureReplayPose(ent.state),
      crewAlive: combat && combat.crew ? { ...combat.crew } : null,
      moduleStates: copyModules(ent),
      eraSpent: combat && combat.eraSpent ? [...combat.eraSpent] : [],
      destroyed: !!(combat && combat.destroyed),
    };
  }
  captureReplayPose(ent.state, into.pose);
  if (combat && combat.crew) {
    const crew = into.crewAlive ?? {};
    for (const key in combat.crew) crew[key] = combat.crew[key];
    into.crewAlive = crew;
  } else {
    into.crewAlive = null;
  }
  into.moduleStates = copyModules(ent, into.moduleStates);
  // spent tiles only accumulate through a life (a respawn empties the set), so an unchanged count is an unchanged list
  const spent = combat && combat.eraSpent;
  if (!spent) into.eraSpent.length = 0;
  else if (spent.size !== into.eraSpent.length) {
    into.eraSpent.length = 0;
    eraInto = into.eraSpent;
    spent.forEach(pushEraTile);
  }
  into.destroyed = !!(combat && combat.destroyed);
  return into;
}

/** A snapshot's own copy of a held step frame (the held one is refreshed in place next step). */
export function copyEntityFrame(frame: EntityFrame): EntityFrame {
  return {
    pose: { ...frame.pose, pos: [frame.pose.pos[0], frame.pose.pos[1], frame.pose.pos[2]] },
    crewAlive: frame.crewAlive ? { ...frame.crewAlive } : null,
    moduleStates: frame.moduleStates ? { ...frame.moduleStates } : null,
    eraSpent: frame.eraSpent.slice(),
    destroyed: frame.destroyed,
  };
}

/** A shell's trace for a replay: the `count` numbers its pooled buffer holds (x y z a step), then the impact. */
export function tracePoints(
  trace: { pts: Float64Array; count: number } | undefined,
  impact: readonly [number, number, number],
): number[] | null {
  if (!trace || trace.count < 3) return null;
  const points: number[] = [];
  for (let i = 0; i < trace.count; i++) points.push(trace.pts[i]);
  points.push(impact[0], impact[1], impact[2]);
  return points;
}
