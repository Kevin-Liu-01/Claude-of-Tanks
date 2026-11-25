/**
 * The replay viewer's controller (replay-system, docs/REPLAY.md §5): one owner per watched replay that turns the
 * index into what the page shows. Each frame it moves the clock on, poses the battle's hulls from the track
 * (replayPosing.ts), hands the hulls' edges to the visuals (a wreck set or reset, a hull shown or hidden), puts the
 * kills it crossed into the kill feed, and gives the bar its state. A click on a mark seeks before it and rides the
 * shooter; the keys are the transport's (replayPlayback.ts) and leave the camera's alone. A refused or drifted replay
 * keeps its timeline (Kevin's decision 4): with no track the clock still runs over the recorded marks, nothing is
 * posed, and the bar says why.
 *
 * It never re-emits gameplay events on the battle's bus: the service record, the profile and the battle's ending
 * listen there, and a replay must award nothing. The kill feed takes its kills through its own port. DOM-free; the
 * runtime (app/replayViewerRuntime.ts) wires the ports.
 */
import type { ReplayIndex } from './replayIndexer.ts';
import { createReplayClock, crossedMarks, applyReplayKey, type ReplayClock, type ReplayKeyAction } from './replayPlayback.ts';
import { createTrackPoser, type PosedHull, type TrackPoser } from './replayPosing.ts';
import { trackDurationS } from './replayTrack.ts';
import { firstCueFrom, type ReplayCue } from './replayCues.ts';
import { filterMarks, markSeek, timelineMarks, REPLAY_STEP_HZ, type TimelineFilter, type TimelineMark } from './replayTimeline.ts';

/** Why the replay plays short or not at all, as the bar words it (the i18n key's parameters beside it). */
export type ReplayNotice =
  | { readonly kind: 'refused'; readonly version: string }
  | { readonly kind: 'drifted'; readonly timeS: number }
  | { readonly kind: 'unavailable' }
  | null;

/** What the bar draws, refreshed in place each frame (no allocation per frame). */
export interface ReplayBarState {
  timeS: number;
  durationS: number;
  /** How far the track reaches: the bar shades the rest and a seek stops there. */
  availableS: number;
  playing: boolean;
  speed: number;
  speedIndex: number;
  filter: TimelineFilter;
  marks: readonly TimelineMark[];
  /** The ridden tank (its own lane and the filter's 'this tank'), or null on the drone. */
  focusId: string | null;
  notice: ReplayNotice;
}

export interface ReplayViewerPorts<THull extends PosedHull> {
  /** The battle's hulls (the page's game.tanks). */
  hulls: readonly THull[];
  /** Watch mode's controller: ride a hull, fly the drone, and whom it rides. */
  watch: { rideId(id: string): boolean; drone(): void; readonly focusId: string | null };
  visuals: {
    setPresent(hull: THull, present: boolean): void;
    setCondition(hull: THull, destroyed: boolean, burning: boolean): void;
  };
  /** The HUD's kill feed: a kill the playback crossed (never the bus's tank:destroyed). */
  feed: { kill(mark: TimelineMark): void };
  /** (replay-fixes-277) The battle's effects: each cue a forward play crosses, in order (replayCues.ts); never on a seek. */
  cue?(cue: ReplayCue): void;
}

export interface ReplayViewer {
  readonly clock: ReplayClock;
  readonly bar: ReplayBarState;
  readonly marks: readonly TimelineMark[];
  /** The battle frame has posed the replay at least once: the battle is in view (its entry's load screen gone), so the
   *  transport is offered. Until then a key, a scrub or a mark is refused: a Play pressed under the load screen would run
   *  a clock nobody sees, and a click there never reaches the bar. */
  readonly posing: boolean;
  /** Per rendered frame (the battle frame's replay port): the clock, the poses, the feed and the bar. */
  advance(realS: number): void;
  key(action: ReplayKeyAction): void;
  /** A press on the bar's track: seek there. */
  scrub(timeS: number): void;
  /** A press on a mark: seek before it and ride its shooter. */
  pickMark(mark: TimelineMark): void;
  setFilter(filter: TimelineFilter): void;
}

function noticeOf(index: ReplayIndex): ReplayNotice {
  const problem = index.problem;
  if (!problem) return index.track ? null : { kind: 'unavailable' };
  if (problem.code === 'refused') {
    const version = /recorded on (.*)$/.exec(problem.message)?.[1] ?? '';
    return { kind: 'refused', version };
  }
  if (problem.code === 'checksum') return { kind: 'drifted', timeS: problem.tick / REPLAY_STEP_HZ };
  return { kind: 'unavailable' };
}

export function createReplayViewer<THull extends PosedHull>(index: ReplayIndex, ports: ReplayViewerPorts<THull>): ReplayViewer {
  const marks = timelineMarks(index.events, index.header.roster);
  const recordedS = index.lastTick / REPLAY_STEP_HZ;
  const durationS = index.track ? Math.min(recordedS, trackDurationS(index.track)) : recordedS;
  // with a track the clock stops where it does; without one the marks still play over the recorded span
  const clock = createReplayClock(durationS, durationS);
  const poser: TrackPoser | null = index.track ? createTrackPoser(index.track, ports.hulls, {
    onPresence: (hull, present) => ports.visuals.setPresent(hull, present),
    onCondition: (hull, destroyed, burning) => ports.visuals.setCondition(hull, destroyed, burning),
  }) : null;
  let filter: TimelineFilter = 'all';
  let shown = marks;
  let shownTimes = shown.map((mark) => mark.timeS);
  const bar: ReplayBarState = {
    timeS: 0, durationS, availableS: durationS, playing: false, speed: clock.speed, speedIndex: clock.speedIndex,
    filter, marks: shown, focusId: null, notice: noticeOf(index),
  };
  const refreshBar = (): void => {
    bar.timeS = clock.timeS;
    bar.availableS = clock.availableS;
    bar.playing = clock.playing;
    bar.speed = clock.speed;
    bar.speedIndex = clock.speedIndex;
    bar.focusId = ports.watch.focusId;
    // a 'this tank' filter follows the ridden tank
    if (typeof filter === 'object' && bar.focusId && filter.hull !== bar.focusId) setFilter({ hull: bar.focusId });
  };
  function setFilter(next: TimelineFilter): void {
    filter = next;
    shown = filterMarks(marks, filter);
    shownTimes = shown.map((mark) => mark.timeS);
    bar.filter = filter;
    bar.marks = shown;
  }
  poser?.apply(0);
  refreshBar();
  let posing = false;
  return {
    clock,
    bar,
    marks,
    get posing() { return posing; },
    advance(realS) {
      posing = true;
      const step = clock.advance(realS);
      poser?.apply(clock.timeS);
      // the battle's kills as they happen on screen (every kill, whatever the filter shows)
      for (const mark of crossedMarks(marks, step)) if (mark.category === 'kill') ports.feed.kill(mark);
      // its shots, hits, kills, fires and the rest as the battle emitted them, at their steps (a play, never a seek)
      if (ports.cue && step.continuous && step.toS > step.fromS) {
        const cues = index.cues ?? [];
        const fromTick = Math.floor(step.fromS * REPLAY_STEP_HZ + 1e-6), toTick = Math.floor(step.toS * REPLAY_STEP_HZ + 1e-6);
        for (let i = firstCueFrom(cues, fromTick + 1); i < cues.length && cues[i]!.tick <= toTick; i++) ports.cue(cues[i]!);
      }
      refreshBar();
    },
    key(action) {
      if (!posing) return;
      applyReplayKey(clock, action, shownTimes);
      poser?.apply(clock.timeS);
      refreshBar();
    },
    scrub(timeS) {
      if (!posing) return;
      clock.seek(timeS);
      poser?.apply(clock.timeS);
      refreshBar();
    },
    pickMark(mark) {
      if (!posing) return;
      const seek = markSeek(mark);
      clock.seek(seek.timeS);
      poser?.apply(clock.timeS);
      // the hull is alive and posed at the seek, so the ride takes; a hull the battle does not have flies the drone
      if (!seek.ride || !ports.watch.rideId(seek.ride)) ports.watch.drone();
      refreshBar();
    },
    setFilter(next) {
      setFilter(next);
      refreshBar();
    },
  };
}
