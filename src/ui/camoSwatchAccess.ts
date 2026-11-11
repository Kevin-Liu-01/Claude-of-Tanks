import type { RuntimeValue } from '../runtimeTypes.ts';
import { createLazyChunk } from '../app/lazyChunk.ts';
interface CamoSwatchAccessOptions<T> {
  load: () => Promise<T>;
  isPlayable: () => boolean;
  schedule?: (callback: () => void, delayMs: number) => RuntimeValue;
  cancel?: (handle: RuntimeValue) => void;
  readyPollMs?: number;
  postReadyDelayMs?: number;
}

interface CamoSwatchAccess<T> {
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

  // (2026-11-02 audit R6) the painter's chunk under the one lazy-chunk policy (app/lazyChunk.ts): a failed module is
  // asked again by the next request, a failed stylesheet never
  const chunk = createLazyChunk(load);
  let scheduled: Promise<T> | null = null;
  let timer: RuntimeValue = null;
  let promote: (() => void) | null = null;

  const begin = (): Promise<T> => chunk.load();

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
      if (chunk.state === 'ready' || chunk.state === 'loading') return begin();
      const request = arm();
      if (immediate) promote?.();
      return request;
    },
    isReady: () => chunk.state === 'ready',
  };
}
