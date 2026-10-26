// The frame-stage hook (battle-spikes-253, docs/PERF-SPIKES.md): the rendered frame and the simulation step mark the
// stage they enter, so a spike census can say which stage a long frame spent its time in. Nothing listens in a player's
// session: `frameStages` stays null and each mark is one null test. The battle spike census installs the recorder
// (src/dev/frameStageRecorder.ts, through __DEBUG.frameStages) and reads typed columns back. DOM-free and timing-free on
// purpose: the simulation only names its stages; the recorder owns the clock, so a step's state never reads it.

/** The stages, in frame order. A mark charges the time from it to the next mark (or the frame's end) to its stage. */
export const FRAME_STAGE_NAMES = Object.freeze([
  'other', 'input', 'network', 'countdown',
  // the fixed step (game/state.ts simStep), once per step the frame runs
  'spotting', 'bots', 'aerial', 'movement', 'contacts', 'fire', 'shells', 'damage', 'destruction', 'mode', 'pose',
  // the rendered frame (app/mainFrameRuntime.ts)
  'presentation', 'camera', 'sniperFill', 'world', 'fx', 'matchWorld', 'hud', 'audio', 'night', 'lighting', 'post', 'perfHud',
] as const);

type FrameStageName = (typeof FRAME_STAGE_NAMES)[number];

/** Stage name → its column (FRAME_STAGE.bots …). */
export const FRAME_STAGE = Object.freeze(Object.fromEntries(FRAME_STAGE_NAMES.map((name, index) => [name, index]))) as
  Readonly<Record<FrameStageName, number>>;

export interface FrameStageSink {
  /** A rendered frame begins (the frame loop's timestamp). */
  begin(nowMs: number): void;
  /** The frame enters `stage` (a FRAME_STAGE column). */
  stage(stage: number): void;
  /** The rendered frame ends. */
  end(): void;
}

/** The installed recorder, or null (every player session). */
export let frameStages: FrameStageSink | null = null;

export function setFrameStageSink(sink: FrameStageSink | null): void {
  frameStages = sink;
}
