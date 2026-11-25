// tools/garage-picker-images.mjs — the Garage environment picker's thumbnails, settled before qa:garage times anything
// (garage-env-276).
//
// The picker's thumbnails are loading="lazy" in a scrolled popover: the ones past its fold never load on their own, so
// a wait on every one of them (the old step) hung until the protocol timeout (180 s) and qa:garage took no stills. The
// wait makes each lazy thumbnail eager, then waits for load or error, and fails with a named reason (the sources that
// never settled) at its own timeout. It runs in the page: it is serialized with toString, so it may use nothing outside
// its own body.

/**
 * Settle these image elements: resolves { images, waitedOn } once each has loaded or failed; rejects naming the sources
 * still pending after `timeoutMs`.
 * @param {ArrayLike<{complete:boolean, loading?:string, currentSrc?:string, src?:string, getAttribute?:(n:string)=>string|null,
 *   addEventListener:(type:string, fn:()=>void, options?:object)=>void}>} images
 * @param {{ timeoutMs?: number }} [options]
 */
export function awaitPickerImages(images, { timeoutMs = 15000 } = {}) {
  const list = Array.from(images);
  const pending = new Set();
  for (const image of list) {
    if (image.complete) continue;
    pending.add(image);
  }
  if (!pending.size) return Promise.resolve({ images: list.length, waitedOn: 0 });
  const waitedOn = pending.size;
  return new Promise((resolve, reject) => {
    let timer = null;
    const settle = (image) => {
      if (!pending.delete(image)) return;
      if (!pending.size) { if (timer !== null) clearTimeout(timer); resolve({ images: list.length, waitedOn }); }
    };
    for (const image of [...pending]) {
      image.addEventListener('load', () => settle(image), { once: true });
      image.addEventListener('error', () => settle(image), { once: true });
      // a lazy thumbnail past the popover's fold never starts: ask for it now
      if (image.loading === 'lazy') image.loading = 'eager';
    }
    if (!pending.size) return;
    timer = setTimeout(() => {
      const names = [...pending].map((image) => image.currentSrc || image.src || image.getAttribute?.('data-src') || '(no source)');
      reject(new Error(`picker thumbnails never settled in ${timeoutMs} ms: ${pending.size} of ${list.length} (${names.join(', ')})`));
    }, timeoutMs);
  });
}
