import type { RuntimeValue } from '../runtimeTypes.ts';
export interface CamoSwatchAccessOptions<T> {
  load: () => Promise<T>;
  isPlayable: () => boolean;
  schedule?: (callback: () => void, delayMs: number) => RuntimeValue;
  cancel?: (handle: RuntimeValue) => void;
  readyPollMs?: number;
  postReadyDelayMs?: number;
}

export interface CamoSwatchAccess<T> {
  preload(options?: { immediate?: boolean }): Promise<T>;
  isReady(): boolean;
}

/**
 * Retryable, intent-promotable module boundary for decorative garage paint.
 * A normal request cannot start before the explicit playable-ready contract;
 * direct pointer/focus intent may promote the same shared request immediately.
 */
export function createCamoSwatchAccess<T>({
  load,
  isPlayable,
  schedule = (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  cancel = (handle) => globalThis.clearTimeout(handle as number),
  readyPollMs = 120,
  postReadyDelayMs = 400,
}: CamoSwatchAccessOptions<T>): CamoSwatchAccess<T> {
  if (typeof load !== 'function' || typeof isPlayable !== 'function') {
    throw new TypeError('camo swatch access requires load and playable ports');
  }

  let module: T | null = null;
  let pending: Promise<T> | null = null;
  let scheduled: Promise<T> | null = null;
  let timer: RuntimeValue = null;
  let promote: (() => void) | null = null;

  const begin = (): Promise<T> => {
    if (module) return Promise.resolve(module);
    if (pending) return pending;
    const request = load().then((loaded) => {
      module = loaded;
      return loaded;
    });
    pending = request;
    request.catch(() => {
      if (pending === request) pending = null;
    });
    return request;
  };

  const arm = (): Promise<T> => {
    if (scheduled) return scheduled;
    scheduled = new Promise<T>((resolve, reject) => {
      let started = false;
      const start = () => {
        if (started) return;
        started = true;
        if (timer !== null) cancel(timer);
        timer = null;
        promote = null;
        begin().then(resolve, reject);
      };
      promote = start;
      const waitForPlayable = () => {
        if (started) return;
        timer = schedule(
          isPlayable() ? start : waitForPlayable,
          isPlayable() ? postReadyDelayMs : readyPollMs,
        );
      };
      waitForPlayable();
    });
    scheduled.catch(() => {
      scheduled = null;
      promote = null;
      timer = null;
    });
    return scheduled;
  };

  return {
    preload({ immediate = false } = {}) {
      if (module || pending) return begin();
      const request = arm();
      if (immediate) promote?.();
      return request;
    },
    isReady: () => module !== null,
  };
}
