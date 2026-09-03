import type { RuntimeValue } from '../runtimeTypes.ts';
export interface DeadlineClock {
  setTimeout(callback: () => void, delayMs: number): RuntimeValue;
  clearTimeout(handle: RuntimeValue): void;
}

export interface DeferredDeadline<T> {
  readonly promise: Promise<T>;
  settle(value: T): boolean;
  readonly settled: boolean;
}

const DEFAULT_CLOCK: DeadlineClock = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(
    handle as ReturnType<typeof globalThis.setTimeout>,
  ),
};

/**
 * Create a deferred value that cannot wait forever on an optional browser
 * worker or transport. The first explicit result wins; otherwise the lazy
 * fallback resolves the same promise at the deadline.
 */
export function createDeferredDeadline<T>(
  timeoutMs: number,
  fallback: () => T,
  clock: DeadlineClock = DEFAULT_CLOCK,
): DeferredDeadline<T> {
  if (!(timeoutMs > 0) || !Number.isFinite(timeoutMs)) {
    throw new TypeError('deferred deadline requires a positive finite timeout');
  }
  if (typeof fallback !== 'function'
      || typeof clock?.setTimeout !== 'function'
      || typeof clock?.clearTimeout !== 'function') {
    throw new TypeError('deferred deadline requires fallback and clock ports');
  }

  let resolvePromise: (value: T) => void = () => {};
  let rejectPromise: (reason: RuntimeValue) => void = () => {};
  let isSettled = false;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const handle = clock.setTimeout(() => {
    if (isSettled) return;
    isSettled = true;
    try {
      resolvePromise(fallback());
    } catch (error) {
      rejectPromise(error);
    }
  }, timeoutMs);

  return Object.freeze({
    promise,
    settle(value: T): boolean {
      if (isSettled) return false;
      isSettled = true;
      clock.clearTimeout(handle);
      resolvePromise(value);
      return true;
    },
    get settled() { return isSettled; },
  });
}
