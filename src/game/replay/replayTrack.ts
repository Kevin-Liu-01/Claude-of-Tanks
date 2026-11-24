/**
 * The replay viewer's track (replay-system-275, docs/REPLAY.md §3 P2): a recording re-simulated once, off the page
 * (replayIndexer.ts in a Worker), sampled every TRACK_EVERY steps (20 Hz) into flat arrays the viewer poses from. Playing,
 * scrubbing and seeking are lookups into it, never a simulation: the viewer draws each hull at the track's pose for the
 * moment shown (trackPose, the kill cam's ReplayPose), and each shell in flight at its sampled point.
 *
 * Per sample and hull: TRACK_FIELDS as Float32 (positions keep ~0.03 mm at the field's edge, more than a drawn pose
 * needs). Shells: per sample, the live shells' id and position, packed with an offset per sample. Node-runnable.
 */
import type { ReplayPose } from '../replayPose.ts';

/** Steps per sample: 20 samples a second at the 60 Hz step. */
export const TRACK_EVERY = 3;
export const TRACK_FIELDS = ['x', 'y', 'z', 'yaw', 'pitch', 'roll', 'turretYaw', 'gunPitch', 'speed', 'hp', 'flags'] as const;
export const TRACK_STRIDE = TRACK_FIELDS.length;
export const TRACK_FLAG_DESTROYED = 1;
export const TRACK_FLAG_BURNING = 2;
const F = Object.fromEntries(TRACK_FIELDS.map((name, index) => [name, index])) as Record<typeof TRACK_FIELDS[number], number>;
/** A shell's numbers in the shells' data: id, then its position. */
const SHELL_STRIDE = 4;

export interface ReplayTrackHull {
  id: string;
  specId: string;
  team: string;
  maxHp: number;
}

export interface ReplayTrack {
  everySteps: number;
  sampleHz: number;
  hulls: ReplayTrackHull[];
  /** Samples taken; sample i is the battle after step (i + 1) * everySteps. */
  samples: number;
  /** samples × hulls × TRACK_STRIDE. */
  data: Float32Array;
  /** Sample i's shells are shellData[shellOffsets[i] * SHELL_STRIDE, shellOffsets[i + 1] * SHELL_STRIDE). */
  shellOffsets: Uint32Array;
  shellData: Float32Array;
}

interface TrackHull {
  id: string;
  specId: string;
  team: string;
  state: { pos: { x: number; y: number; z: number }; yaw: number; visualPitch?: number; visualRoll?: number; turretYaw: number;
    gunPitch: number; speed: number } | null;
  combat: { hp: number; maxHp?: number; destroyed?: boolean; fire?: { burning?: boolean } } | null;
}

interface TrackGame {
  tanks: readonly TrackHull[];
  shells: ReadonlyArray<{ id: number; dead?: boolean; pos: { x: number; y: number; z: number } }>;
  tick: number;
}

export interface ReplayTrackBuilder {
  /** After a step: samples the battle when its tick is a multiple of TRACK_EVERY. */
  afterStep(game: TrackGame): void;
  finish(): ReplayTrack;
}

/** A growable Float32 column. */
function column(initial: number) {
  let data = new Float32Array(initial);
  let used = 0;
  return {
    push(value: number) {
      if (used === data.length) { const grown = new Float32Array(data.length * 2); grown.set(data); data = grown; }
      data[used++] = value;
    },
    get used() { return used; },
    take(): Float32Array { return data.slice(0, used); },
  };
}

export function createReplayTrackBuilder(game: TrackGame): ReplayTrackBuilder {
  const hulls: ReplayTrackHull[] = game.tanks.map((hull) => ({ id: hull.id, specId: hull.specId, team: hull.team,
    maxHp: hull.combat?.maxHp ?? hull.combat?.hp ?? 0 }));
  const data = column(hulls.length * TRACK_STRIDE * 1024);
  const shells = column(SHELL_STRIDE * 1024);
  const offsets: number[] = [0];
  let samples = 0;
  return {
    afterStep(battle) {
      if (battle.tick % TRACK_EVERY !== 0) return;
      for (const hull of battle.tanks) {
        const s = hull.state, c = hull.combat;
        if (!s || !c) { for (let i = 0; i < TRACK_STRIDE; i++) data.push(Number.NaN); continue; }
        data.push(s.pos.x); data.push(s.pos.y); data.push(s.pos.z); data.push(s.yaw); data.push(s.visualPitch ?? 0); data.push(s.visualRoll ?? 0);
        data.push(s.turretYaw); data.push(s.gunPitch); data.push(s.speed); data.push(c.hp);
        data.push((c.destroyed ? TRACK_FLAG_DESTROYED : 0) | (c.fire?.burning ? TRACK_FLAG_BURNING : 0));
      }
      let live = 0;
      for (const shell of battle.shells) {
        if (shell.dead) continue;
        shells.push(shell.id); shells.push(shell.pos.x); shells.push(shell.pos.y); shells.push(shell.pos.z);
        live++;
      }
      offsets.push(offsets[offsets.length - 1]! + live);
      samples++;
    },
    finish() {
      return { everySteps: TRACK_EVERY, sampleHz: 60 / TRACK_EVERY, hulls, samples, data: data.take(),
        shellOffsets: Uint32Array.from(offsets), shellData: shells.take() };
    },
  };
}

/** The battle time (seconds) of sample `index`. */
export function trackSampleTimeS(track: ReplayTrack, index: number): number {
  return ((index + 1) * track.everySteps) / 60;
}

/** The track's length in battle seconds. */
export function trackDurationS(track: ReplayTrack): number {
  return track.samples ? trackSampleTimeS(track, track.samples - 1) : 0;
}

const wrap = (a: number): number => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

/** The sample pair and blend for `timeS` (clamped to the track). */
function sampleAt(track: ReplayTrack, timeS: number): { a: number; b: number; t: number } {
  const exact = (timeS * 60) / track.everySteps - 1;
  if (!(exact > 0)) return { a: 0, b: 0, t: 0 };
  const last = track.samples - 1;
  if (exact >= last) return { a: last, b: last, t: 0 };
  const a = Math.floor(exact);
  return { a, b: a + 1, t: exact - a };
}

/** A hull's numbers at `timeS`, blended between its two samples (angles the short way round); NaN fields when unfielded. */
export function trackValue(track: ReplayTrack, hullIndex: number, field: typeof TRACK_FIELDS[number], timeS: number): number {
  const { a, b, t } = sampleAt(track, timeS);
  const stride = track.hulls.length * TRACK_STRIDE, at = hullIndex * TRACK_STRIDE + F[field];
  const va = track.data[a * stride + at]!, vb = track.data[b * stride + at]!;
  if (field === 'flags') return t < 0.5 ? va : vb;
  if (field === 'yaw' || field === 'turretYaw') return va + wrap(vb - va) * t;
  return va + (vb - va) * t;
}

/** A hull's drawn pose at `timeS` (the kill cam's ReplayPose); false when it is not on the field then. */
export function trackPose(track: ReplayTrack, hullIndex: number, timeS: number, out: ReplayPose): boolean {
  const x = trackValue(track, hullIndex, 'x', timeS);
  if (!Number.isFinite(x)) return false;
  out.pos[0] = x;
  out.pos[1] = trackValue(track, hullIndex, 'y', timeS);
  out.pos[2] = trackValue(track, hullIndex, 'z', timeS);
  out.yaw = trackValue(track, hullIndex, 'yaw', timeS);
  out.pitch = trackValue(track, hullIndex, 'pitch', timeS);
  out.roll = trackValue(track, hullIndex, 'roll', timeS);
  out.turretYaw = trackValue(track, hullIndex, 'turretYaw', timeS);
  out.gunPitch = trackValue(track, hullIndex, 'gunPitch', timeS);
  return true;
}

/** Each shell in flight at `timeS`: its id and point, blended between the samples it appears in (visit returns nothing). */
export function forEachTrackShell(track: ReplayTrack, timeS: number, visit: (id: number, x: number, y: number, z: number) => void): void {
  const { a, b, t } = sampleAt(track, timeS);
  const from = track.shellOffsets[a]!, to = track.shellOffsets[a + 1]!;
  const nextFrom = track.shellOffsets[b]!, nextTo = track.shellOffsets[b + 1]!;
  const d = track.shellData;
  for (let i = from; i < to; i++) {
    const id = d[i * SHELL_STRIDE]!;
    let x = d[i * SHELL_STRIDE + 1]!, y = d[i * SHELL_STRIDE + 2]!, z = d[i * SHELL_STRIDE + 3]!;
    if (b !== a) {
      for (let j = nextFrom; j < nextTo; j++) {
        if (d[j * SHELL_STRIDE] !== id) continue;
        x += (d[j * SHELL_STRIDE + 1]! - x) * t; y += (d[j * SHELL_STRIDE + 2]! - y) * t; z += (d[j * SHELL_STRIDE + 3]! - z) * t;
        break;
      }
    }
    visit(id, x, y, z);
  }
}
