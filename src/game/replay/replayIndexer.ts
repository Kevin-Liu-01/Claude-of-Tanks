/**
 * The replay viewer's indexer (replay-system-275, docs/REPLAY.md §3 P2): a recording re-simulated headless once, start
 * to end, into its track (replayTrack.ts), which the viewer then plays, scrubs and seeks without simulating. Runs in a
 * Worker on the page (replayIndexerWorker.ts, driven by replayIndexerClient.ts) and in Node (the receipts). Never
 * renders and never fetches: the caller hands it the recording and the battle's collision world.
 *
 * A recording from another build is refused before it runs (Kevin's choice: refuse cleanly, keep the timeline): the
 * index then has no track but keeps the header and the marks. A replay that drifts stops at the checksum that caught
 * it; the index keeps the track up to there and says where.
 */
import type { ReplayEnd, ReplayEventMark, ReplayHeader, ReplayRecording } from '../../sim/replayFormat.ts';
import { createReplayRun, ReplayMismatch } from './replayRunner.ts';
import { createReplayTrackBuilder, type ReplayTrack } from './replayTrack.ts';
import { replayCueOf, type ReplayCue } from './replayCues.ts';

export interface ReplayIndex {
  header: ReplayHeader;
  end: ReplayEnd;
  events: ReplayEventMark[];
  /** Null when the recording was refused. */
  track: ReplayTrack | null;
  /** Steps re-simulated. */
  indexedSteps: number;
  /** The last step the recording can replay. */
  lastTick: number;
  /** Why the track stops short (refused, a drift, a roster the run could not seat), or null. */
  problem: { code: string; tick: number; message: string } | null;
  /** The effects' events as the re-simulation emitted them, in order (replayCues.ts; replay-fixes-277); none when refused. */
  cues: ReplayCue[];
}

export interface IndexOptions {
  /** Called every `progressEvery` steps with the steps done and the last step. */
  onProgress?(tick: number, lastTick: number): void;
  progressEvery?: number;
  /** The build the indexer stands for (replayRunner.ts ReplayRunHooks): its own by default. */
  localDigest?: string;
}

export function indexReplay(recording: ReplayRecording, world: Parameters<typeof createReplayRun>[1], options: IndexOptions = {}): ReplayIndex {
  const { header, end, events } = recording;
  const lastTickOf = () => Math.min(recording.seatSteps.length, end.stagedAtTick != null ? end.stagedAtTick - 1 : Infinity);
  let run: ReturnType<typeof createReplayRun>;
  const cues: ReplayCue[] = [];
  try {
    run = createReplayRun(recording, world, { localDigest: options.localDigest, onEvent: (type, payload, tick) => {
      // (an event in the step past the last replayable one is the battle the recording does not hold)
      const cue = replayCueOf(type, payload, tick);
      if (cue) cues.push(cue);
    } });
  } catch (error) {
    if (!(error instanceof ReplayMismatch)) throw error;
    return { header, end, events, track: null, indexedSteps: 0, lastTick: lastTickOf(), problem: { code: error.code, tick: 0, message: error.message }, cues: [] };
  }
  const every = Math.max(1, options.progressEvery ?? 600);
  try {
    const builder = createReplayTrackBuilder(run.game as never);
    while (run.step()) {
      builder.afterStep(run.game as never);
      if (run.tick % every === 0) options.onProgress?.(run.tick, run.lastTick);
    }
    options.onProgress?.(run.tick, run.lastTick);
    const mismatch = run.mismatch;
    return { header, end, events, track: builder.finish(), indexedSteps: run.tick, lastTick: run.lastTick,
      problem: mismatch ? { code: mismatch.code, tick: mismatch.tick, message: mismatch.message } : null,
      cues: cues.filter((cue) => cue.tick <= run.tick) };
  } finally {
    run.dispose();
  }
}
