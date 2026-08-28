/**
 * Share image fetch/decode work across UI surfaces without retaining decoded
 * bitmaps in JavaScript. Browser cache ownership remains with the browser;
 * this module only coalesces concurrent requests and records successful URLs.
 */

export type ImagePriority = 'low' | 'auto' | 'high';

export interface ImagePreloadOptions {
  readonly priority?: ImagePriority;
  readonly decode?: boolean;
}

interface ImagePreloadRecord {
  readonly image: HTMLImageElement;
  priority: ImagePriority;
  readonly promise: Promise<string | null>;
}

type IdleCapableGlobal = typeof globalThis & {
  requestIdleCallback?: (callback: IdleRequestCallback) => number;
};

const inFlight = new Map<string, ImagePreloadRecord>();
const loaded = new Set<string>();
const idleScheduled = new Set<string>();
const PRIORITY = Object.freeze({ low: 0, auto: 1, high: 2 });

/** @returns {boolean} whether the URL completed a prior load. */
export function isImagePreloaded(url: string): boolean {
  return loaded.has(url);
}

/**
 * Fetch and optionally decode an image once. A later higher-priority caller
 * promotes an in-flight request rather than starting a duplicate transfer.
 * Failures resolve null and remain retryable.
 *
 * @param {string} url
 * @param {{priority?:'low'|'auto'|'high', decode?:boolean}} [options]
 * @returns {Promise<string|null>}
 */
export function preloadImage(
  url: string,
  { priority = 'auto', decode = true }: ImagePreloadOptions = {},
): Promise<string | null> {
  if (!url || typeof Image === 'undefined') return Promise.resolve(null);
  if (loaded.has(url)) return Promise.resolve(url);

  const existing = inFlight.get(url);
  if (existing) {
    if ((PRIORITY[priority] ?? 1) > (PRIORITY[existing.priority] ?? 1)) {
      existing.priority = priority;
      existing.image.fetchPriority = priority;
    }
    return existing.promise;
  }

  const image = new Image();
  image.decoding = 'async';
  image.fetchPriority = priority;
  let record: ImagePreloadRecord;
  const promise = new Promise<string | null>((resolve) => {
    const finish = (result: string | null): void => {
      image.onload = null;
      image.onerror = null;
      if (inFlight.get(url) === record) inFlight.delete(url);
      if (result) loaded.add(url);
      resolve(result);
    };
    image.onload = async () => {
      if (decode && typeof image.decode === 'function') {
        try { await image.decode(); } catch { /* a completed load is usable */ }
      }
      finish(url);
    };
    image.onerror = () => finish(null);
  });
  record = { image, priority, promise };
  inFlight.set(url, record);
  image.src = url;
  return promise;
}

/**
 * Queue speculative image work only when the browser reports genuine idle
 * time. Unsupported browsers simply keep the normal on-demand path.
 *
 * @param {string} url
 * @returns {number|null} requestIdleCallback handle when scheduled
 */
export function preloadImageWhenIdle(url: string): number | null {
  const idleGlobal = globalThis as IdleCapableGlobal;
  if (!url || loaded.has(url) || inFlight.has(url) || idleScheduled.has(url) ||
      typeof idleGlobal.requestIdleCallback !== 'function') return null;
  idleScheduled.add(url);
  return idleGlobal.requestIdleCallback(() => {
    idleScheduled.delete(url);
    preloadImage(url, { priority: 'low' });
  });
}
