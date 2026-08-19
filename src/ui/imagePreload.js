/**
 * Share image fetch/decode work across UI surfaces without retaining decoded
 * bitmaps in JavaScript. Browser cache ownership remains with the browser;
 * this module only coalesces concurrent requests and records successful URLs.
 */

const inFlight = new Map();
const loaded = new Set();
const idleScheduled = new Set();
const PRIORITY = Object.freeze({ low: 0, auto: 1, high: 2 });

/** @returns {boolean} whether the URL completed a prior load. */
export function isImagePreloaded(url) {
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
export function preloadImage(url, { priority = 'auto', decode = true } = {}) {
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
  const record = { image, priority, promise: null };
  record.promise = new Promise((resolve) => {
    const finish = (result) => {
      image.onload = null;
      image.onerror = null;
      if (inFlight.get(url) === record) inFlight.delete(url);
      if (result) loaded.add(url);
      resolve(result);
    };
    image.onload = async () => {
      if (decode && typeof image.decode === 'function') {
        try { await image.decode(); } catch (_) { /* a completed load is usable */ }
      }
      finish(url);
    };
    image.onerror = () => finish(null);
  });
  inFlight.set(url, record);
  image.src = url;
  return record.promise;
}

/**
 * Queue speculative image work only when the browser reports genuine idle
 * time. Unsupported browsers simply keep the normal on-demand path.
 *
 * @param {string} url
 * @returns {number|null} requestIdleCallback handle when scheduled
 */
export function preloadImageWhenIdle(url) {
  if (!url || loaded.has(url) || inFlight.has(url) || idleScheduled.has(url) ||
      typeof globalThis.requestIdleCallback !== 'function') return null;
  idleScheduled.add(url);
  return globalThis.requestIdleCallback(() => {
    idleScheduled.delete(url);
    preloadImage(url, { priority: 'low' });
  });
}
