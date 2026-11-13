import { createLazyChunk } from '../../app/lazyChunk.ts';

interface CompositionAccess<T> {
  readonly current: T | null;
  preload(): Promise<T>;
}

/**
 * Own a retryable, coalesced import/construction boundary for browser network
 * orchestration. The access object is safe to keep in the Garage graph; the
 * supplied loader is not invoked until explicit multiplayer intent.
 */
export function createCompositionAccess<T>(
  load: () => Promise<T>,
): CompositionAccess<T> {
  if (typeof load !== 'function') {
    throw new TypeError('network composition access requires a loader');
  }

  let current: T | null = null;
  // (2026-11-02 audit R6, round 2 U35) one app/lazyChunk.ts chunk: a failed transfer is asked again under the one policy
  // (at once after one failure, then past its backoff; a removed chunk shows the reload action), not at once by every call.
  // The chunk turns a loader that throws into a failure like a rejection.
  const chunk = createLazyChunk(() => Promise.resolve(load()).then((runtime) => {
    if (runtime === null || runtime === undefined) {
      throw new TypeError('network composition loader returned no runtime');
    }
    current = runtime;
    return runtime;
  }));
  const preload = (): Promise<T> => chunk.load();

  return {
    get current() { return current; },
    preload,
  };
}
