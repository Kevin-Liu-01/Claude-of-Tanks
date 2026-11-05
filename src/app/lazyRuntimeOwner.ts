import { createLazyChunk, type LazyChunkOptions, type LazyChunkState } from './lazyChunk.ts';

interface LazyRuntimeOwner<Runtime> {
  preload(): Promise<Runtime>;
  readonly current: Runtime | null;
  /** The load's declared state (app/lazyChunk.ts): idle, loading, ready or failed. */
  readonly state: LazyChunkState;
}

/**
 * Own one dynamic runtime (its chunk and the runtime made from it) without leaking rejected promises or duplicating
 * concurrent imports. Access facades keep their public methods stable while implementation modules remain outside the
 * boot-critical graph.
 *
 * (2026-11-02 audit R6, round 2 U35) the load is one app/lazyChunk.ts chunk, so every facade built on this follows the
 * one lazy-chunk policy: a failure is asked again by the next preload at once after one failure, then past the INFRA-P11
 * backoff (capped at a minute), never while offline; a removed chunk (a hashed chunk that answers 404) is terminal and
 * shows the watchdog's reload action; an opener's failure (`opener: true`) is terminal. Before, a failure was forgotten
 * and asked again at once by every call, with no backoff and no 404 rule. A factory that throws (or returns no runtime)
 * fails the load like its chunk.
 */
export function createLazyRuntimeOwner<Module, Runtime>(
  load: () => Promise<Module>,
  create: (module: Module) => Runtime | PromiseLike<Runtime>,
  options?: LazyChunkOptions,
): LazyRuntimeOwner<Runtime> {
  if (typeof load !== 'function' || typeof create !== 'function') {
    throw new TypeError('lazy runtime owner requires loader and factory functions');
  }

  const chunk = createLazyChunk(() => Promise.resolve()
    .then(load)
    .then(create)
    .then((runtime) => {
      if (!runtime) throw new TypeError('lazy runtime factory returned no runtime');
      return runtime;
    }), options);

  return Object.freeze({
    preload: () => chunk.load(),
    get current() { return chunk.value; },
    get state() { return chunk.state; },
  });
}
