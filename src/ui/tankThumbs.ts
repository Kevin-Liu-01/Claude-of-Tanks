import type { RuntimeValue } from '../runtimeTypes.ts';
// src/ui/tankThumbs.ts — stable garage tank portraits.
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
import {
  containedPortraitPlacement,
  measurePortraitCoreBounds,
  type PortraitPixelBounds,
} from './portraitFraming.ts';
// TOP-DOWN MASK RIG (damage panel r9) — see the section at the bottom of this
// file: an offscreen orthographic render of the ACTUAL built vehicle (hull
// layer and turret+gun layer separately), replacing the baked one-piece
// top_silhouette.png the damage panel used to stretch.
import * as THREE from 'three';
import { createTank, ensureTankBuilder } from '../vehicles/fleetFactory.ts';

const PORTRAIT_SOURCES = ['thumb-angle', 'angle', 'side', 'side_silhouette'] as const;
let errorGuardInstalled = false;
let portraitObserver: IntersectionObserver | null = null;
let portraitResizeObserver: ResizeObserver | null = null;

interface PortraitBounds extends PortraitPixelBounds {
  naturalWidth: number;
  naturalHeight: number;
}

const portraitBoundsByUrl = new Map<string, Promise<PortraitBounds | null>>();

interface TopMaskEngineContext {
  renderer: THREE.WebGLRenderer;
}

export interface TankMaskVisual {
  root: THREE.Object3D;
  dispose(): void;
}

export interface TankMaskSpec {
  id: string;
  dims?: {
    overallLengthM?: number;
    hullLengthM?: number;
  };
  armor?: {
    turretPivot?: readonly [number, number, number];
    gunBarrel?: {
      lengthM?: number;
    };
  };
}

interface MaskPassResult {
  canvas: HTMLCanvasElement;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface TopDownMaskEntry {
  ready: true;
  hull: {
    canvas: HTMLCanvasElement;
    camX: number;
    camZ: number;
    halfM: number;
    cx: number;
    cz: number;
    radiusM: number;
    widthM: number;
    lengthM: number;
  };
  turret: {
    canvas: HTMLCanvasElement;
    camX: number;
    camZ: number;
    halfM: number;
    radiusM: number;
  };
  pivot: [number, number];
  pxPerM: number;
}

type MaskCacheValue = TopDownMaskEntry | 'pending' | 'failed';

function canvas2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('tankThumbs.ts: Canvas2D is unavailable');
  return context;
}

function asTopMaskEngineContext(value: RuntimeValue): TopMaskEngineContext | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { renderer?: RuntimeValue };
  return candidate.renderer instanceof THREE.WebGLRenderer
    ? { renderer: candidate.renderer }
    : null;
}

function errorMessage(error: RuntimeValue): string {
  return error instanceof Error ? error.message : String(error);
}

/** Stable portrait URL for a tank. @param {string} specId */
export function getTankThumb(specId: string): string {
  return `/icons/thumbs/${specId}_angle.webp`;
}

function portraitUrl(specId: string, index: number): string {
  const source = PORTRAIT_SOURCES[index] || PORTRAIT_SOURCES[0];
  return source === 'thumb-angle' ? getTankThumb(specId) : iconUrl(specId, source);
}

function measurePortraitBounds(img: HTMLImageElement): PortraitBounds | null {
  if (!(img.naturalWidth > 0) || !(img.naturalHeight > 0)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const context = canvas2d(canvas);
  context.drawImage(img, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  // Fit the load-bearing visual mass rather than the full alpha envelope.
  // Sparse cannon tips, antennae, cage corners and the generated grounding
  // shadow used to make Tagil/Burlak/Bradley cards shrink by 25-40 percent.
  const bounds = measurePortraitCoreBounds(pixels, canvas.width, canvas.height);
  if (!bounds) return null;
  return {
    ...bounds,
    naturalWidth: canvas.width,
    naturalHeight: canvas.height,
  };
}

function applyPortraitFrame(img: HTMLImageElement, bounds: PortraitBounds): void {
  const boxWidth = img.clientWidth;
  const boxHeight = img.clientHeight;
  if (!(boxWidth > 0) || !(boxHeight > 0)) return;
  const { x, y, scale } = containedPortraitPlacement(
    bounds,
    bounds.naturalWidth,
    bounds.naturalHeight,
    boxWidth,
    boxHeight,
  );
  img.style.setProperty('--cot-thumb-x', `${x.toFixed(2)}px`);
  img.style.setProperty('--cot-thumb-y', `${y.toFixed(2)}px`);
  img.style.setProperty('--cot-thumb-scale', scale.toFixed(4));
  img.dataset.cotPortraitFramed = 'true';
}

async function normalizePortrait(img: HTMLImageElement): Promise<void> {
  if (!(img.complete && img.naturalWidth > 0)) return;
  const url = img.currentSrc || img.src;
  let pending = portraitBoundsByUrl.get(url);
  if (!pending) {
    pending = Promise.resolve().then(() => measurePortraitBounds(img)).catch(() => null);
    portraitBoundsByUrl.set(url, pending);
  }
  const bounds = await pending;
  if (!bounds || (img.currentSrc || img.src) !== url) return;
  applyPortraitFrame(img, bounds);
  if (typeof ResizeObserver === 'function') {
    portraitResizeObserver ||= new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (!(entry.target instanceof HTMLImageElement)) continue;
        const currentUrl = entry.target.currentSrc || entry.target.src;
        void portraitBoundsByUrl.get(currentUrl)?.then((currentBounds) => {
          if (currentBounds) applyPortraitFrame(entry.target as HTMLImageElement, currentBounds);
        });
      }
    });
    portraitResizeObserver.observe(img);
  }
}

function queuePortraitNormalization(img: HTMLImageElement): void {
  if (img.dataset.cotPortraitListener !== 'true') {
    img.dataset.cotPortraitListener = 'true';
    img.addEventListener('load', () => { void normalizePortrait(img); }, { passive: true });
  }
  if (img.complete && img.naturalWidth > 0) void normalizePortrait(img);
}

function advanceFallback(img: HTMLImageElement): void {
  const id = img && img.dataset && img.dataset.cotThumb;
  if (!id) return;
  const next = Number(img.dataset.cotIconFallback || 0) + 1;
  if (next < PORTRAIT_SOURCES.length) {
    img.dataset.cotPortraitFramed = 'false';
    img.style.removeProperty('--cot-thumb-x');
    img.style.removeProperty('--cot-thumb-y');
    img.style.removeProperty('--cot-thumb-scale');
    img.dataset.cotIconFallback = String(next);
    img.src = portraitUrl(id, next);
    return;
  }

  // A missing asset should never expose the browser's broken-image glyph or
  // a blank rectangular plate. Preserve layout while hiding only the image.
  img.dataset.cotIconFallback = String(PORTRAIT_SOURCES.length);
  img.style.visibility = 'hidden';
}

function installErrorGuard(): void {
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
function revealTankThumb(img: HTMLImageElement): void {
  installErrorGuard();
  const id = img.dataset.cotThumb;
  if (!id) return;
  portraitObserver?.unobserve(img);
  const savedFallback = Number(img.dataset.cotIconFallback || 0);
  const fallback = Math.min(Math.max(savedFallback, 0), PORTRAIT_SOURCES.length - 1);
  const expected = portraitUrl(id, fallback);
  if ((img.getAttribute('src') || '') !== expected) {
    img.dataset.cotIconFallback = String(fallback);
    img.style.visibility = '';
    img.src = expected;
  }
  img.decoding = 'async';
  img.draggable = false;
  queuePortraitNormalization(img);
  if (img.complete && !img.naturalWidth) advanceFallback(img);
}

function observeTankThumb(img: HTMLImageElement): void {
  if (img.getAttribute('src')) return;
  if (typeof IntersectionObserver !== 'function') {
    revealTankThumb(img);
    return;
  }
  portraitObserver ||= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && entry.target instanceof HTMLImageElement) {
        revealTankThumb(entry.target);
      }
    }
  }, { rootMargin: '240px 420px' });
  portraitObserver.observe(img);
}

function observeTankThumbs(root: ParentNode): void {
  if (!root || !root.querySelectorAll) return;
  installErrorGuard();
  for (const img of root.querySelectorAll<HTMLImageElement>('img[data-cot-thumb]')) {
    observeTankThumb(img);
  }
}

function applyTankThumbs(root: ParentNode): void {
  if (!root || !root.querySelectorAll) return;
  for (const img of root.querySelectorAll<HTMLImageElement>('img[data-cot-thumb]')) {
    revealTankThumb(img);
  }
}

/** Re-apply one portrait (or all portraits) without doing any GPU work. */
export function requeueTankThumbs(specId: string | null = null): void {
  if (typeof document === 'undefined') return;
  installErrorGuard();
  for (const img of document.querySelectorAll<HTMLImageElement>('img[data-cot-thumb]')) {
    if (specId != null && img.dataset.cotThumb !== specId) continue;
    if (specId == null) observeTankThumb(img);
    else revealTankThumb(img);
  }
}

/** Screenshot compatibility: packaged icons need no render queue to drain. */
export function drainTankThumbs(): void {
  if (typeof document !== 'undefined') applyTankThumbs(document);
}

/**
 * Compatibility entry point used by garage setup. The specs/options are kept
 * in the signature so callers do not need special cases.
 */
export function ensureTankThumbs(_specs: RuntimeValue, _opts: RuntimeValue = {}): void {
  if (typeof document === 'undefined') return;
  observeTankThumbs(document);
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

let maskEngineCtx: TopMaskEngineContext | null = null; // main.ts hands over its engineCtx once at boot

/** Wire the shared engine context (renderer + shadow hook) for mask renders.
 *  Without it, getTopDownMasks reports 'failed' and the damage panel keeps
 *  its vector fallback (harness/booth contexts). @param {object} engineCtx */
export function initTopMaskRig(engineCtx: RuntimeValue): void {
  maskEngineCtx = asTopMaskEngineContext(engineCtx);
}

const MASK_RT_SIZE = 384;  // supersampled render
const MASK_SIZE = 192;     // cached layer canvas (downscale = cheap AA)
const MASK_MARGIN_M = 0.35;
const maskCache = new Map<string, MaskCacheValue>();
const MASK_CACHE_MAX = 10;
let maskRT: THREE.WebGLRenderTarget | null = null;
let maskPixels: Uint8Array | null = null;

interface MaskPixelBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface MaskRenderResources {
  target: THREE.WebGLRenderTarget;
  pixels: Uint8Array;
}

interface MaskCanvasResult {
  canvas: HTMLCanvasElement;
  bounds: MaskPixelBounds;
}

function ensureMaskRenderResources(): MaskRenderResources {
  if (!maskRT) {
    maskRT = new THREE.WebGLRenderTarget(MASK_RT_SIZE, MASK_RT_SIZE, {
      depthBuffer: true, stencilBuffer: false,
    });
    maskPixels = new Uint8Array(MASK_RT_SIZE * MASK_RT_SIZE * 4);
  }
  if (!maskPixels) maskPixels = new Uint8Array(MASK_RT_SIZE * MASK_RT_SIZE * 4);
  return { target: maskRT, pixels: maskPixels };
}

function renderMaskPixels(
  renderer: THREE.WebGLRenderer,
  target: THREE.WebGLRenderTarget,
  pixels: Uint8Array,
  scene: THREE.Scene,
  camera: THREE.OrthographicCamera,
): void {
  const previousTarget = renderer.getRenderTarget();
  const previousColor = new THREE.Color();
  renderer.getClearColor(previousColor);
  const previousAlpha = renderer.getClearAlpha();
  try {
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, MASK_RT_SIZE, MASK_RT_SIZE, pixels);
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousColor, previousAlpha);
  }
}

function maskCanvasFromPixels(pixels: Uint8Array): MaskCanvasResult | null {
  const size = MASK_RT_SIZE;
  const big = document.createElement('canvas');
  big.width = size;
  big.height = size;
  const context = canvas2d(big);
  const image = context.createImageData(size, size);
  const data = image.data;
  const bounds: MaskPixelBounds = { minX: size, maxX: -1, minY: size, maxY: -1 };
  for (let y = 0; y < size; y++) {
    const sourceRow = (size - 1 - y) * size * 4;
    const targetRow = y * size * 4;
    for (let x = 0; x < size; x++) {
      const alpha = pixels[sourceRow + x * 4 + 3];
      if (alpha <= 8) continue;
      const offset = targetRow + x * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = alpha;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  if (bounds.maxX < 0) return null;
  context.putImageData(image, 0, 0);
  return { canvas: big, bounds };
}

function downscaleMask(source: HTMLCanvasElement): HTMLCanvasElement {
  const output = document.createElement('canvas');
  output.width = MASK_SIZE;
  output.height = MASK_SIZE;
  canvas2d(output).drawImage(source, 0, 0, MASK_SIZE, MASK_SIZE);
  return output;
}

function maskPassResult(
  rendered: MaskCanvasResult,
  camX: number,
  camZ: number,
  halfM: number,
): MaskPassResult {
  const metresPerPixel = (halfM * 2) / MASK_RT_SIZE;
  const { bounds } = rendered;
  return {
    canvas: downscaleMask(rendered.canvas),
    minX: camX + halfM - (bounds.maxX + 1) * metresPerPixel,
    maxX: camX + halfM - bounds.minX * metresPerPixel,
    minZ: camZ + halfM - (bounds.maxY + 1) * metresPerPixel,
    maxZ: camZ + halfM - bounds.minY * metresPerPixel,
  };
}

/** One alpha-coverage pass -> white mask canvas (also reports plan bounds).
 *  @returns {{canvas:HTMLCanvasElement,minX:number,maxX:number,minZ:number,maxZ:number}|null} */
function renderMaskPass(
  scene: THREE.Scene,
  camX: number,
  camZ: number,
  halfM: number,
): MaskPassResult | null {
  const engine = maskEngineCtx;
  if (!engine) return null;
  const renderer = engine.renderer;
  const { target, pixels } = ensureMaskRenderResources();
  const cam = new THREE.OrthographicCamera(-halfM, halfM, halfM, -halfM, 0.1, 80);
  cam.position.set(camX, 40, camZ);
  cam.up.set(0, 0, 1);
  cam.lookAt(camX, 0, camZ);
  cam.updateMatrixWorld(true);
  renderMaskPixels(renderer, target, pixels, scene, cam);
  // Alpha coverage becomes a white mask. readPixels rows are bottom-up, so
  // maskCanvasFromPixels flips them while collecting exact plan bounds.
  const rendered = maskCanvasFromPixels(pixels);
  if (!rendered) return null;
  // opaque pixel bounds back in METERS (pixel x = camX-half..camX+half maps
  // world -x; pixel y top = camZ+half): used for tight panel scaling.
  return maskPassResult(rendered, camX, camZ, halfM);
}

/** Render both layers for a built visual. @returns {object|null} entry */
function renderMaskEntry(
  visual: TankMaskVisual,
  spec: TankMaskSpec,
): TopDownMaskEntry | null {
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
export function getTopDownMasks(
  spec: TankMaskSpec,
  onReady: (() => void) | null,
  sourceVisual: TankMaskVisual | null = null,
): TopDownMaskEntry | null {
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
    let visual: TankMaskVisual | null = null;
    let entry: TopDownMaskEntry | null = null;
    try {
      // Exact fleet chunks can still be in flight when the damage panel asks
      // for its first mask. Join that same demand-load promise before the
      // synchronous factory call instead of permanently caching a race as
      // `failed` and dropping to the generic vector silhouette.
      if (!clonedRoot) await ensureTankBuilder(id);
      visual = clonedRoot
        ? { root: clonedRoot, dispose() {} }
        : createTank(id, maskEngineCtx, { camoSeed: 4000, quality: 'high' }) as TankMaskVisual;
      entry = renderMaskEntry(visual, spec);
    } catch (error) {
      console.warn(`[tankThumbs] top-down mask build failed for ${id}:`, errorMessage(error));
    }
    if (!entry) {
      maskCache.set(id, 'failed');
      if (visual) { try { visual.dispose(); } catch (_) { /* released */ } }
      return;
    }
    maskCache.set(id, entry);
    while (maskCache.size > MASK_CACHE_MAX) {
      const oldest = maskCache.keys().next().value as string | undefined;
      if (oldest === id) break;
      if (oldest === undefined) break;
      maskCache.delete(oldest);
    }
    if (onReady) onReady();
    // First-party procedural geometry is final at construction time; there
    // is no asynchronous sourced-model swap to poll or capture again.
    try { visual?.dispose(); } catch { /* released */ }
  }, 0);
  return null;
}
