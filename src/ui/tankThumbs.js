// src/ui/tankThumbs.js — stable garage and tech-tree tank portraits.
//
// The old implementation rebuilt every portrait in an offscreen WebGL
// renderer after the garage opened. GLB-backed tanks were captured before
// their asynchronous model swap completed, so some cards were replaced with
// the procedural three-box stand-in. It also created a WebGL context per
// vehicle, adding avoidable garage stalls and making the result GPU/driver
// dependent.
//
// The icon generator already renders the final, fully loaded vehicle models
// into transparent PNGs in public/icons/. Use those deterministic assets in
// every UI surface and keep this module as the small compatibility layer used
// by the garage, tech tree, and screenshot harness.

import { iconUrl } from './icons.js';

const FALLBACK_VIEWS = ['angle', 'side', 'side_silhouette'];
let errorGuardInstalled = false;

/** Stable portrait URL for a tank. @param {string} specId */
export function getTankThumb(specId) {
  return iconUrl(specId, FALLBACK_VIEWS[0]);
}

function advanceFallback(img) {
  const id = img && img.dataset && img.dataset.cotThumb;
  if (!id) return;
  const next = Number(img.dataset.cotIconFallback || 0) + 1;
  if (next < FALLBACK_VIEWS.length) {
    img.dataset.cotIconFallback = String(next);
    img.src = iconUrl(id, FALLBACK_VIEWS[next]);
    return;
  }

  // A missing asset should never expose the browser's broken-image glyph or
  // a blank rectangular plate. Preserve layout while hiding only the image.
  img.dataset.cotIconFallback = String(FALLBACK_VIEWS.length);
  img.style.visibility = 'hidden';
}

function installErrorGuard() {
  if (errorGuardInstalled || typeof document === 'undefined') return;
  errorGuardInstalled = true;
  // Resource errors do not bubble, so listen during capture. This also covers
  // tech-tree nodes created after the initial garage setup.
  document.addEventListener('error', (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.cotThumb) return;
    advanceFallback(img);
  }, true);
}

/**
 * Normalize every tank portrait under `root` to its packaged transparent PNG.
 * @param {Document|Element} root
 */
export function applyTankThumbs(root) {
  if (!root || !root.querySelectorAll) return;
  installErrorGuard();
  for (const img of root.querySelectorAll('img[data-cot-thumb]')) {
    const id = img.dataset.cotThumb;
    const savedFallback = Number(img.dataset.cotIconFallback || 0);
    const fallback = Math.min(Math.max(savedFallback, 0), FALLBACK_VIEWS.length - 1);
    const expected = iconUrl(id, FALLBACK_VIEWS[fallback]);
    const rawSrc = img.getAttribute('src') || '';
    if (rawSrc !== expected) {
      img.dataset.cotIconFallback = String(fallback);
      img.style.visibility = '';
      img.src = expected;
    }
    img.decoding = 'async';
    img.draggable = false;
    // Handle a cached failure that may have completed before the guard was
    // installed. Successful cached images have a non-zero natural width.
    if (img.complete && !img.naturalWidth) advanceFallback(img);
  }
}

/** Re-apply one portrait (or all portraits) without doing any GPU work. */
export function requeueTankThumbs(specId = null) {
  if (typeof document === 'undefined') return;
  installErrorGuard();
  for (const img of document.querySelectorAll('img[data-cot-thumb]')) {
    if (specId != null && img.dataset.cotThumb !== specId) continue;
    if (!img.getAttribute('src')) {
      img.dataset.cotIconFallback = '0';
      img.style.visibility = '';
      img.src = getTankThumb(img.dataset.cotThumb);
    }
  }
}

/** Screenshot compatibility: packaged icons need no render queue to drain. */
export function drainTankThumbs() {
  if (typeof document !== 'undefined') applyTankThumbs(document);
}

/**
 * Compatibility entry point used by garage setup. The specs/options are kept
 * in the signature so callers do not need special cases.
 */
export function ensureTankThumbs(_specs, _opts = {}) {
  if (typeof document === 'undefined') return;
  applyTankThumbs(document);
  document.dispatchEvent(new CustomEvent('cot:tank-thumbs'));
}
