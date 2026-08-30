export interface LazyRuntimeOwner<Runtime> {
  preload(): Promise<Runtime>;
  readonly current: Runtime | null;
}

/**
 * Own one retryable dynamic runtime without leaking rejected promises or
 * duplicating concurrent imports. Access facades keep their public methods
 * stable while implementation modules remain outside the boot-critical graph.
 */
export function createLazyRuntimeOwner<Module, Runtime>(
  load: () => Promise<Module>,
  create: (module: Module) => Runtime,
): LazyRuntimeOwner<Runtime> {
  if (typeof load !== 'function' || typeof create !== 'function') {
    throw new TypeError('lazy runtime owner requires loader and factory functions');
  }

  let current: Runtime | null = null;
  let pending: Promise<Runtime> | null = null;

  const preload = (): Promise<Runtime> => {
    if (current) return Promise.resolve(current);
    if (pending) return pending;

    const request = Promise.resolve()
      .then(load)
      .then((module) => {
        const runtime = create(module);
        if (!runtime) throw new TypeError('lazy runtime factory returned no runtime');
        current = runtime;
        return runtime;
      });
    pending = request;
    request.then(
      () => { if (pending === request) pending = null; },
      () => { if (pending === request) pending = null; },
    );
    return request;
  };

  return Object.freeze({
    preload,
    get current() { return current; },
  });
}
