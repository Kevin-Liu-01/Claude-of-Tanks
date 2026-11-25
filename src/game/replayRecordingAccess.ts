/**
 * The page's one battle recorder (game/replay/replayRecorder.ts, docs/REPLAY.md) behind its lazy chunk
 * (game/replay/replayChunk.ts): the recorder, the saved-replay store and the format's decoder are battle and replay-screen
 * code, so the boot loads none of them (tools/boot-static-closure.selftest.mjs).
 *
 * `recorder` is the composition root's stable port, the recorder's own interface: until the chunk has loaded each tap
 * does nothing and reads as idle, which loses nothing, as the recorder records only a battle armed by `beginSetup`, and
 * main.ts awaits `preload` with the solo authority's (preloadSoloBattleRuntime), so every solo battle's setup finds it
 * loaded. A setup that does not is reported, never silently unrecorded. The rules ports the recorder wraps are wrapped
 * at boot and bound to the recorder's own wrapper once it has loaded (each call reads the binding).
 *
 * Only `import type` reaches the chunk from here. Node-runnable: the loader is injectable.
 */
import { createLazyRuntimeOwner } from '../app/lazyRuntimeOwner.ts';
import type { LazyChunkLoadOptions } from '../app/lazyChunk.ts';
import type * as ReplayChunk from './replay/replayChunk.ts';
import type { FinishedRecording, RecorderGame, ReplayRecorder, ReplaySetupOptions } from './replay/replayRecorder.ts';

type ReplayChunkModule = typeof ReplayChunk;

/** The loaded chunk and the page's recorder made from it. */
export interface ReplayRecording {
  readonly module: ReplayChunkModule;
  readonly recorder: ReplayRecorder;
}

export interface ReplayRecordingAccess {
  /** The chunk and the recorder (app/lazyChunk.ts policy; `{ backoff: false }` for a lifecycle edge's ask). */
  preload(options?: LazyChunkLoadOptions): Promise<ReplayRecording>;
  /** The loaded chunk and recorder, or null before it has loaded. */
  readonly current: ReplayRecording | null;
  /** The stable port: the loaded recorder's taps, idle until it has loaded. */
  readonly recorder: ReplayRecorder;
}

// the rules' own signatures pass through unchanged
type AnyRule = (...args: any[]) => any;

export function createReplayRecordingAccess({
  load = () => import('./replay/replayChunk.ts'),
  reportError = (message: string) => console.error(message),
}: {
  load?: () => Promise<ReplayChunkModule>;
  reportError?: (message: string) => void;
} = {}): ReplayRecordingAccess {
  const owner = createLazyRuntimeOwner(load, (module): ReplayRecording => ({ module, recorder: module.createReplayRecorder() }));
  const live = (): ReplayRecorder | null => owner.current?.recorder ?? null;

  /** `rules` whose functions each call the recorder's wrapper of `rules` once it has loaded, `rules` itself before. */
  function lateBound<TRules extends object>(rules: TRules, wrap: (recorder: ReplayRecorder, rules: TRules) => TRules): TRules {
    let bound: TRules | null = null;
    const target = (): Readonly<Record<string, unknown>> => {
      if (bound) return bound as Readonly<Record<string, unknown>>;
      const recorder = live();
      if (!recorder) return rules as Readonly<Record<string, unknown>>;
      bound = wrap(recorder, rules);
      return bound as Readonly<Record<string, unknown>>;
    };
    const port: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rules)) {
      port[key] = typeof value === 'function' ? (...args: unknown[]) => (target()[key] as AnyRule)(...args) : value;
    }
    return port as TRules;
  }

  const recorder: ReplayRecorder = {
    get active() { return live()?.active ?? false; },
    get trace() { return live()?.trace ?? false; },
    set trace(on: boolean) {
      const recorder = live();
      if (recorder) recorder.trace = on;
    },
    probeCost: (iterations, clock) => live()?.probeCost(iterations, clock) ?? null,
    beginSetup(game: RecorderGame, playerSpecId: string, options: ReplaySetupOptions) {
      const recorder = live();
      if (recorder) recorder.beginSetup(game, playerSpecId, options);
      else reportError('[replay] the recorder had not loaded before the battle\'s setup: this battle is not recorded');
    },
    endSetup: () => { live()?.endSetup(); },
    beforeStep: () => { live()?.beforeStep(); },
    afterStep: () => { live()?.afterStep(); },
    wrapRules: (rules) => lateBound(rules, (loaded, plain) => loaded.wrapRules(plain)),
    wrapBattleRules: (rules) => lateBound(rules, (loaded, plain) => loaded.wrapBattleRules(plain)),
    recordSeatWrite: (kind, args) => { live()?.recordSeatWrite(kind, args); },
    onEvent: (type, payload) => { live()?.onEvent(type, payload); },
    markStaged: () => { live()?.markStaged(); },
    finish: (): FinishedRecording | null => live()?.finish() ?? null,
    cancel: () => { live()?.cancel(); },
  };

  return Object.freeze({
    preload: (options?: LazyChunkLoadOptions) => owner.preload(options),
    get current() { return owner.current; },
    recorder,
  });
}
