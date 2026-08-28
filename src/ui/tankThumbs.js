// src/ui/tankThumbs.js — stable garage tank portraits.
//
// The old implementation rebuilt every portrait in an offscreen WebGL
// renderer after the garage opened. It created a WebGL context per vehicle,
// adding avoidable garage stalls and making the result GPU/driver dependent.
//
// The icon generator already renders the final, fully loaded vehicle models
// into transparent PNGs in public/icons/. Use those deterministic assets in
// every UI surface and keep this module as the small compatibility layer used
// by the garage and screenshot harness.

import { iconUrl } from './icons.ts';
// TOP-DOWN MASK RIG (damage panel r9) — see the section at the bottom of this
// file: an offscreen orthographic render of the ACTUAL built vehicle (hull
// layer and turret+gun layer separately), replacing the baked one-piece
// top_silhouette.png the damage panel used to stretch.
import * as THREE from 'three';
import { createTank, ensureTankBuilder } from '../vehicles/fleetFactory.js';

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
  // garage cards created after the initial setup.
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
function applyTankThumbs(root) {
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

// ---------------------------------------------------------------------------
// TOP-DOWN MASK RIG (damage panel r9) — real per-tank plan-view layers.
//
// The damage panel needs orthographic top-down masks of the vehicle THE
// PLAYER ACTUALLY FIELDS (the first-party procedural build), split into a
// HULL layer and a TURRET+GUN layer so the panel can
// rotate them independently (hull with true heading, turret with hull+turret
// bearing). Baked icons can't do that — they are one fused nose-up image —
// so this rig builds the vehicle offscreen via the real tankFactory and
// renders each layer's ALPHA coverage into a cached white-on-transparent
// canvas.
//
// Render specifics:
//  - Uses the game's own renderer via a WebGLRenderTarget (no second GL
//    context). Materials render UNLIT/black — only alpha coverage is read —
//    which also keeps the shadow-proxy meshes out (their colorWrite:false is
//    respected; a scene.overrideMaterial would have painted their fat
//    stand-in boxes into the mask).
//  - Camera: y-down ortho with up=+Z, so the mask is nose-up with the
//    vehicle's RIGHT side on the image's right (screen-x = -world-x — the
//    same handedness the live top-down view has).
//  - Hull pass: turret hidden, frustum centered on the hull's plan bbox
//    center. Turret pass: hull hidden, turret+gun at neutral yaw/pitch,
//    frustum centered on the TURRET PIVOT so rotating the canvas about its
//    center IS rotating the turret about its ring.
//  - Procedural geometry is final at construction time. The rig renders once,
//    disposes the temporary build, and caches masks per specId (small LRU).
// ---------------------------------------------------------------------------

let maskEngineCtx = null; // main.ts hands over its engineCtx once at boot

/** Wire the shared engine context (renderer + shadow hook) for mask renders.
 *  Without it, getTopDownMasks reports 'failed' and the damage panel keeps
 *  its vector fallback (harness/booth contexts). @param {object} engineCtx */
export function initTopMaskRig(engineCtx) {
  maskEngineCtx = engineCtx || null;
}

const MASK_RT_SIZE = 384;  // supersampled render
const MASK_SIZE = 192;     // cached layer canvas (downscale = cheap AA)
const MASK_MARGIN_M = 0.35;
const maskCache = new Map(); // specId -> entry | 'pending' | 'failed'
const MASK_CACHE_MAX = 10;
let maskRT = null;
let maskPixels = null;

/** One alpha-coverage pass -> white mask canvas (also reports plan bounds).
 *  @returns {{canvas:HTMLCanvasElement,minX:number,maxX:number,minZ:number,maxZ:number}|null} */
function renderMaskPass(scene, camX, camZ, halfM) {
  const renderer = maskEngineCtx.renderer;
  if (!maskRT) {
    maskRT = new THREE.WebGLRenderTarget(MASK_RT_SIZE, MASK_RT_SIZE, {
      depthBuffer: true, stencilBuffer: false,
    });
    maskPixels = new Uint8Array(MASK_RT_SIZE * MASK_RT_SIZE * 4);
  }
  const prevTarget = renderer.getRenderTarget();
  const prevColor = new THREE.Color();
  renderer.getClearColor(prevColor);
  const prevAlpha = renderer.getClearAlpha();
  const cam = new THREE.OrthographicCamera(-halfM, halfM, halfM, -halfM, 0.1, 80);
  cam.position.set(camX, 40, camZ);
  cam.up.set(0, 0, 1);
  cam.lookAt(camX, 0, camZ);
  cam.updateMatrixWorld(true);
  try {
    renderer.setRenderTarget(maskRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(maskRT, 0, 0, MASK_RT_SIZE, MASK_RT_SIZE, maskPixels);
  } finally {
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevAlpha);
  }
  // alpha coverage -> white mask (readPixels rows are bottom-up: flip)
  const S = MASK_RT_SIZE;
  const big = document.createElement('canvas');
  big.width = S; big.height = S;
  const bctx = big.getContext('2d');
  const img = bctx.createImageData(S, S);
  const d = img.data;
  let px0 = S, px1 = -1, py0 = S, py1 = -1;
  for (let y = 0; y < S; y++) {
    const src = (S - 1 - y) * S * 4;
    const dst = y * S * 4;
    for (let x = 0; x < S; x++) {
      const a = maskPixels[src + x * 4 + 3];
      if (a > 8) {
        const o = dst + x * 4;
        d[o] = 255; d[o + 1] = 255; d[o + 2] = 255; d[o + 3] = a;
        if (x < px0) px0 = x; if (x > px1) px1 = x;
        if (y < py0) py0 = y; if (y > py1) py1 = y;
      }
    }
  }
  if (px1 < 0) return null; // nothing rendered
  bctx.putImageData(img, 0, 0);
  const out = document.createElement('canvas');
  out.width = MASK_SIZE; out.height = MASK_SIZE;
  out.getContext('2d').drawImage(big, 0, 0, MASK_SIZE, MASK_SIZE);
  // opaque pixel bounds back in METERS (pixel x = camX-half..camX+half maps
  // world -x; pixel y top = camZ+half): used for tight panel scaling.
  const mPerPx = (halfM * 2) / S;
  return {
    canvas: out,
    minX: camX + halfM - (px1 + 1) * mPerPx,
    maxX: camX + halfM - px0 * mPerPx,
    minZ: camZ + halfM - (py1 + 1) * mPerPx,
    maxZ: camZ + halfM - py0 * mPerPx,
  };
}

/** Render both layers for a built visual. @returns {object|null} entry */
function renderMaskEntry(visual, spec) {
  const root = visual.root;
  const scene = new THREE.Scene();
  scene.add(root);
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.updateMatrixWorld(true);
  const hullG = root.getObjectByName('rig_hull');
  const turretG = root.getObjectByName('rig_turret');
  if (!hullG || !turretG) { scene.remove(root); return null; }
  // neutral articulation for the canonical masks
  turretG.rotation.y = 0;
  const gunG = root.getObjectByName('rig_gun');
  if (gunG) gunG.rotation.x = 0;
  root.updateMatrixWorld(true);

  const dims = spec.dims || {};
  const overall = Math.max(dims.overallLengthM || 8, dims.hullLengthM || 6);
  const tp = (spec.armor && spec.armor.turretPivot) || [0, 1.5, 0];

  // hull pass (turret hidden) — generous frustum, bounds measured from pixels
  turretG.visible = false;
  hullG.visible = true;
  const hullHalf = overall * 0.62 + MASK_MARGIN_M;
  const hull = renderMaskPass(scene, 0, 0, hullHalf);

  // turret pass (hull hidden), centered on the PIVOT; the frustum must reach
  // the muzzle: gun length from the pivot + bustle margin
  turretG.visible = true;
  hullG.visible = false;
  const gunReach = Math.max(
    (spec.armor && spec.armor.gunBarrel && spec.armor.gunBarrel.lengthM) || 4,
    overall - (dims.hullLengthM || overall) / 2 - tp[2]);
  const turretHalf = Math.max(2.2, gunReach + 1.6) + MASK_MARGIN_M;
  const turret = renderMaskPass(scene, tp[0], tp[2], turretHalf);

  hullG.visible = true;
  turretG.visible = true;
  scene.remove(root);
  if (!hull || !turret) return null;

  // plan-space layout facts for the panel (meters)
  const hullCx = (hull.minX + hull.maxX) / 2;
  const hullCz = (hull.minZ + hull.maxZ) / 2;
  return {
    ready: true,
    hull: {
      canvas: hull.canvas, camX: 0, camZ: 0, halfM: hullHalf,
      cx: hullCx, cz: hullCz,
      // swept radius when the layer rotates about the hull content center
      radiusM: Math.hypot((hull.maxX - hull.minX) / 2, (hull.maxZ - hull.minZ) / 2),
      widthM: hull.maxX - hull.minX, lengthM: hull.maxZ - hull.minZ,
    },
    turret: {
      canvas: turret.canvas, camX: tp[0], camZ: tp[2], halfM: turretHalf,
      // swept radius about the pivot (canvas center)
      radiusM: Math.max(
        Math.hypot(turret.minX - tp[0], turret.minZ - tp[2]),
        Math.hypot(turret.maxX - tp[0], turret.maxZ - tp[2])),
    },
    pivot: [tp[0], tp[2]],
    pxPerM: MASK_SIZE / (hullHalf * 2), // hull layer scale (turret differs)
  };
}

/**
 * Per-tank top-down layer masks for the damage panel. Returns the cached
 * entry, or null while building/unavailable ('failed' stays null forever —
 * the caller keeps its vector fallback). `onReady` fires when the entry first
 * becomes available.
 * @param {TankSpec} spec full tank spec (dims + armor needed)
 * @param {?Function} onReady
 * @param {?object} sourceVisual optional already-built first-party visual
 * @returns {?object}
 */
export function getTopDownMasks(spec, onReady, sourceVisual = null) {
  if (!spec || typeof document === 'undefined') return null;
  const id = spec.id;
  const got = maskCache.get(id);
  if (got && got !== 'pending' && got !== 'failed') return got;
  if (got === 'failed' || got === 'pending' || !maskEngineCtx) return null;
  maskCache.set(id, 'pending');
  // Clone the already-built battle/garage hierarchy while it is known alive.
  // Object3D cloning shares immutable geometry/material resources but avoids
  // constructing and texture-baking a duplicate tank during a transition.
  const clonedRoot = sourceVisual?.root?.clone?.(true) || null;
  // defer off the caller's frame (setTank runs on the boot path)
  setTimeout(async () => {
    let visual = null;
    let entry = null;
    try {
      // Exact fleet chunks can still be in flight when the damage panel asks
      // for its first mask. Join that same demand-load promise before the
      // synchronous factory call instead of permanently caching a race as
      // `failed` and dropping to the generic vector silhouette.
      if (!clonedRoot) await ensureTankBuilder(id);
      visual = clonedRoot
        ? { root: clonedRoot, dispose() {} }
        : createTank(id, maskEngineCtx, { camoSeed: 4000, quality: 'high' });
      entry = renderMaskEntry(visual, spec);
    } catch (e) {
      console.warn(`[tankThumbs] top-down mask build failed for ${id}:`, e.message);
    }
    if (!entry) {
      maskCache.set(id, 'failed');
      if (visual) { try { visual.dispose(); } catch (_) { /* released */ } }
      return;
    }
    maskCache.set(id, entry);
    while (maskCache.size > MASK_CACHE_MAX) {
      const oldest = maskCache.keys().next().value;
      if (oldest === id) break;
      maskCache.delete(oldest);
    }
    if (onReady) onReady();
    // First-party procedural geometry is final at construction time; there
    // is no asynchronous sourced-model swap to poll or capture again.
    try { visual.dispose(); } catch (_) { /* released */ }
  }, 0);
  return null;
}
