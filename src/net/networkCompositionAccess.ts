export interface NetworkCompositionAccess<T> {
  readonly current: T | null;
  preload(): Promise<T>;
}

/**
 * Own a retryable, coalesced import/construction boundary for browser network
 * orchestration. The access object is safe to keep in the Garage graph; the
 * supplied loader is not invoked until explicit multiplayer intent.
 */
export function createNetworkCompositionAccess<T>(
  load: () => Promise<T>,
): NetworkCompositionAccess<T> {
  if (typeof load !== 'function') {
    throw new TypeError('network composition access requires a loader');
  }

  let current: T | null = null;
  let pending: Promise<T> | null = null;

  const preload = (): Promise<T> => {
    if (current) return Promise.resolve(current);
    if (pending) return pending;
    let loaded: Promise<T>;
    try {
      loaded = Promise.resolve(load());
    } catch (error) {
      loaded = Promise.reject(error);
    }
    const request = loaded.then((runtime) => {
      if (runtime === null || runtime === undefined) {
        throw new TypeError('network composition loader returned no runtime');
      }
      current = runtime;
      return runtime;
    });
    pending = request;
    request.catch(() => {
      if (pending === request) pending = null;
    });
    return request;
  };

  return {
    get current() { return current; },
    preload,
  };
}
