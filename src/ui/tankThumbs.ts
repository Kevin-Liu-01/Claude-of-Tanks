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
import { beginTopMaskReadback } from './topMaskReadback.ts';
import { waitForTopMaskPrograms, type TopMaskProgram } from './topMaskProgramWarm.ts';

const PORTRAIT_SOURCES = ['thumb-angle', 'angle', 'side', 'side_silhouette'] as const;
let errorGuardInstalled = false;
let portraitObserver: IntersectionObserver | null = null;
let portraitResizeObserver: ResizeObserver | null = null;
let portraitNormalizationScheduled = false;
const portraitNormalizationQueue: HTMLImageElement[] = [];
const queuedPortraits = new WeakSet<HTMLImageElement>();

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

type MaskCacheValue = TopDownMaskEntry | 'failed';

type TopMaskLoadStage = 'clone' | 'build' | 'hullCompile' | 'hullRender' | 'hullReadback' | 'hullCanvas'
  | 'turretCompile' | 'turretRender' | 'turretReadback' | 'turretCanvas';

interface TopMaskLoadInterval {
  stage: TopMaskLoadStage;
  /** Page performance.now() timebase, matching long-task startTime. */
  startTime: number;
  endTime?: number;
}

export interface TopMaskLoadTrace {
  status: 'pending' | 'complete' | 'failed';
  startedAt: number;
  endedAt?: number;
  intervals: TopMaskLoadInterval[];
}

declare global {
  interface Window { __TOP_MASK_LOAD?: TopMaskLoadTrace }
}

function beginTopMaskLoad(): TopMaskLoadTrace {
  const trace: TopMaskLoadTrace = { status: 'pending', startedAt: performance.now(), intervals: [] };
  // Only the latest new bake is published. Older pending callbacks retain their
  // own trace and cannot replace it; cache hits do not erase useful timings.
  try { if (typeof window !== 'undefined') window.__TOP_MASK_LOAD = trace; }
  catch { /* Diagnostics must not prevent the mask build. */ }
  return trace;
}

function finishTopMaskLoad(trace: TopMaskLoadTrace, status: 'complete' | 'failed'): void {
  trace.status = status;
  trace.endedAt = performance.now();
}

function measureTopMaskStage<Value>(
  trace: TopMaskLoadTrace,
  stage: TopMaskLoadStage,
  operation: () => Value,
): Value {
  const interval: TopMaskLoadInterval = { stage, startTime: performance.now() };
  trace.intervals.push(interval);
  try { return operation(); }
  finally { interval.endTime = performance.now(); }
}

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

function revealPortrait(img: HTMLImageElement): void {
  img.dataset.cotPortraitReady = 'true';
}

function applyPortraitFrame(img: HTMLImageElement, bounds: PortraitBounds): boolean {
  const boxWidth = img.clientWidth;
  const boxHeight = img.clientHeight;
  if (!(boxWidth > 0) || !(boxHeight > 0)) return false;
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
  revealPortrait(img);
  return true;
}

async function normalizePortrait(img: HTMLImageElement): Promise<void> {
  if (!(img.complete && img.naturalWidth > 0)) return;
  const url = img.currentSrc || img.src;
  try {
    await img.decode();
  } catch (_) {
    // A completed same-origin image can still be measured when decode() is
    // unavailable or rejects after the load event. The error guard owns true
    // resource failures and advances to the next packaged portrait.
  }
  if (!(img.complete && img.naturalWidth > 0) || (img.currentSrc || img.src) !== url) return;
  let pending = portraitBoundsByUrl.get(url);
  if (!pending) {
    pending = Promise.resolve().then(() => measurePortraitBounds(img)).catch(() => null);
    portraitBoundsByUrl.set(url, pending);
  }
  const bounds = await pending;
  if ((img.currentSrc || img.src) !== url) return;
  // Same-origin generated portraits always provide measurable alpha bounds.
  // If a browser blocks canvas readback, reveal the already loaded image with
  // the CSS fallback frame rather than leaving a permanent empty card.
  if (!bounds) {
    img.dataset.cotPortraitFramed = 'fallback';
    revealPortrait(img);
    return;
  }
  const framed = applyPortraitFrame(img, bounds);
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
  } else if (!framed) {
    // Legacy browsers without ResizeObserver cannot retry after a hidden card
    // gains dimensions, so keep their loaded portrait available at the stable
    // CSS frame instead of leaving it transparent forever.
    img.dataset.cotPortraitFramed = 'fallback';
    revealPortrait(img);
  }
}

function scheduleNextPortraitNormalization(): void {
  if (portraitNormalizationScheduled || portraitNormalizationQueue.length === 0) return;
  portraitNormalizationScheduled = true;
  const run = (): void => {
    portraitNormalizationScheduled = false;
    const img = portraitNormalizationQueue.shift();
    if (!img) return;
    queuedPortraits.delete(img);
    // Pixel readback and alpha-bound measurement are deliberately serialized.
    // Revealing a national fleet can load dozens of portraits together; doing
    // every 256x256 canvas scan in one microtask burst used to block the menu.
    void normalizePortrait(img).finally(scheduleNextPortraitNormalization);
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 500 });
  } else {
    setTimeout(run, 0);
  }
}

function enqueuePortraitNormalization(img: HTMLImageElement): void {
  if (queuedPortraits.has(img)) return;
  queuedPortraits.add(img);
  portraitNormalizationQueue.push(img);
  scheduleNextPortraitNormalization();
}

function queuePortraitNormalization(img: HTMLImageElement): void {
  if (img.dataset.cotPortraitListener !== 'true') {
    img.dataset.cotPortraitListener = 'true';
    img.addEventListener('load', () => enqueuePortraitNormalization(img), { passive: true });
  }
  if (img.complete && img.naturalWidth > 0) enqueuePortraitNormalization(img);
}

function advanceFallback(img: HTMLImageElement): void {
  const id = img && img.dataset && img.dataset.cotThumb;
  if (!id) return;
  const next = Number(img.dataset.cotIconFallback || 0) + 1;
  if (next < PORTRAIT_SOURCES.length) {
    img.dataset.cotPortraitFramed = 'false';
    img.dataset.cotPortraitReady = 'false';
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
  img.dataset.cotPortraitReady = 'false';
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
    img.dataset.cotPortraitFramed = 'false';
    img.dataset.cotPortraitReady = 'false';
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
// Pending work is separate from the bounded completed cache: eviction must
// never schedule a second render into the same shared target/pixel buffer.
const pendingMasks = new Map<string, Promise<TopDownMaskEntry | null>>();
let maskWorkTail = Promise.resolve();
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

interface MaskSourceLifetime {
  readonly invalidated: boolean;
  assertAlive(): void;
  release(): void;
}

const MASK_BATCH_CONTROL_KEYS = ['_matricesTexture', '_indirectTexture', '_colorsTexture'] as const;
type MaskBatchControlKey = typeof MASK_BATCH_CONTROL_KEYS[number];
type MaskBatchControls = Record<MaskBatchControlKey, THREE.DataTexture | null>;
interface MaskBatchControlSnapshot {
  key: MaskBatchControlKey;
  texture: THREE.DataTexture | null;
  image: THREE.DataTexture['image'] | null;
  data: THREE.DataTexture['image']['data'];
  sourceVersion: number;
}

function snapshotMaskBatchControls(root: THREE.Object3D): MaskBatchControlSnapshot[][] {
  const snapshots: MaskBatchControlSnapshot[][] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.BatchedMesh)) return;
    const controls = object as THREE.BatchedMesh & MaskBatchControls;
    snapshots.push(MASK_BATCH_CONTROL_KEYS.map((key) => {
      const texture = controls[key];
      const image = texture?.image ?? null;
      const data = image?.data ?? null;
      if (texture && !data) throw new Error('top_mask_batch_control_unavailable');
      return { key, texture, image, data, sourceVersion: texture?.source.version ?? 0 };
    }));
  });
  return snapshots;
}

function detachMaskBatchControls(batch: THREE.BatchedMesh, snapshots: MaskBatchControlSnapshot[]): void {
  const controls = batch as THREE.BatchedMesh & MaskBatchControls;
  for (const snapshot of snapshots) {
    const { key, texture, image, data } = snapshot;
    if (!texture || !image || !data) continue;
    // Pinned BatchedMesh.copy drops colors when its fresh destination has none.
    // Reuse copied wrappers where present, but explicitly preserve source colors.
    const detached = controls[key] ?? texture.clone();
    detached.source = new THREE.Source({ ...image, data: data.slice() });
    controls[key] = detached;
  }
}

function restoreMaskBatchControls(snapshots: MaskBatchControlSnapshot[][]): void {
  for (const batch of snapshots) {
    for (const snapshot of batch) {
      if (snapshot.image && snapshot.image.data !== snapshot.data) snapshot.image.data = snapshot.data;
      // Texture.copy also bumps the shared Source version. The native clone
      // transaction is synchronous; restore it before any caller can render.
      if (snapshot.texture) (snapshot.texture.source as { version: number }).version = snapshot.sourceVersion;
    }
  }
}

function cloneMaskSource(root: THREE.Object3D): THREE.Object3D {
  const snapshots = snapshotMaskBatchControls(root);
  let clone: THREE.Object3D | null = null;
  try {
    clone = root.clone(true);
    let batchIndex = 0;
    clone.traverse((object) => {
      if (!(object instanceof THREE.BatchedMesh)) return;
      const snapshot = snapshots[batchIndex++];
      if (!snapshot) throw new Error('top_mask_batch_clone_mismatch');
      detachMaskBatchControls(object, snapshot);
    });
    if (batchIndex !== snapshots.length) throw new Error('top_mask_batch_clone_mismatch');
    return clone;
  } catch (error) {
    disposeMaskClone(clone);
    throw error;
  } finally {
    // Native texture clones share Source; BatchedMesh.copy temporarily replaces
    // its image.data array. Restore original identities even when cloning fails.
    restoreMaskBatchControls(snapshots);
  }
}

function disposeMaskClone(root: THREE.Object3D | null): void {
  root?.traverse((object) => {
    // These mesh classes copy per-object GPU allocations when cloned. Their
    // own disposer leaves shared material (and ordinary mesh geometry) alone.
    if (object instanceof THREE.InstancedMesh || object instanceof THREE.BatchedMesh) {
      try { object.dispose(); } catch { /* Continue releasing the other clones. */ }
    }
  });
}

function watchMaskSourceLifetime(root: THREE.Object3D): MaskSourceLifetime {
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  let disposed = false;
  const onDispose = (): void => { disposed = true; };
  const release = (): void => {
    for (const resource of resources) {
      try { resource.removeEventListener('dispose', onDispose); }
      catch { /* Continue detaching the other borrowed resources. */ }
    }
    resources.clear();
  };
  try {
    root.traverse((object) => {
      const renderable = object as THREE.Object3D & {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };
      if (renderable.geometry instanceof THREE.BufferGeometry) resources.add(renderable.geometry);
      const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
      for (const material of materials) {
        if (material instanceof THREE.Material) resources.add(material);
      }
    });
    for (const resource of resources) resource.addEventListener('dispose', onDispose);
  } catch (error) {
    release();
    throw error;
  }
  return {
    get invalidated() { return disposed; },
    assertAlive() {
      if (disposed) throw new Error('top_mask_source_disposed');
    },
    release,
  };
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

async function compileMaskPass(
  renderer: THREE.WebGLRenderer,
  target: THREE.WebGLRenderTarget,
  scene: THREE.Scene,
  camera: THREE.OrthographicCamera,
  sourceLifetime: MaskSourceLifetime | null,
): Promise<void> {
  sourceLifetime?.assertAlive();
  const previousTarget = renderer.getRenderTarget();
  const face = renderer.getActiveCubeFace();
  const mip = renderer.getActiveMipmapLevel();
  const programs: TopMaskProgram[] = [];
  let failed = false;
  try {
    renderer.setRenderTarget(target);
    const materials = renderer.compile(scene, camera);
    sourceLifetime?.assertAlive();
    // Pin the submitted identities before an ordinary frame can replace each
    // shared material's currentProgram with its world-rendering variant.
    for (const material of materials) {
      const properties = renderer.properties.get(material) as { currentProgram?: TopMaskProgram };
      const program = properties.currentProgram;
      if (!program?.program || typeof program.isReady !== 'function') {
        throw new Error('top_mask_program_unavailable');
      }
      programs.push(program);
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try { renderer.setRenderTarget(previousTarget, face, mip); }
    catch (error) { if (!failed) throw error; }
  }
  const context = renderer.getContext();
  await waitForTopMaskPrograms(programs, {
    isContextLost() {
      sourceLifetime?.assertAlive();
      return context.isContextLost();
    },
  });
}

async function renderMaskPixels(
  renderer: THREE.WebGLRenderer,
  target: THREE.WebGLRenderTarget,
  pixels: Uint8Array,
  scene: THREE.Scene,
  camera: THREE.OrthographicCamera,
  trace: TopMaskLoadTrace,
  layer: 'hull' | 'turret',
): Promise<void> {
  const previousTarget = renderer.getRenderTarget();
  const previousFace = renderer.getActiveCubeFace();
  const previousMip = renderer.getActiveMipmapLevel();
  const previousColor = new THREE.Color();
  renderer.getClearColor(previousColor);
  const previousAlpha = renderer.getClearAlpha();
  let readback: Promise<void> | null = null;
  let failure: { reason: RuntimeValue } | null = null;
  const interval: TopMaskLoadInterval = { stage: `${layer}Readback`, startTime: 0 };
  try {
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    measureTopMaskStage(trace, `${layer}Render`, () => renderer.render(scene, camera));
    interval.startTime = performance.now();
    trace.intervals.push(interval);
    // Submit while the exact mask framebuffer is bound. The helper restores
    // its PBO binding synchronously; normal renderer frames can run while the
    // fence completes, without a blocking GPU readPixels on the reveal frame.
    const gl = renderer.getContext();
    if (!('fenceSync' in gl)) throw new Error('top-down masks require WebGL2 readback');
    readback = beginTopMaskReadback(gl, MASK_RT_SIZE, MASK_RT_SIZE, pixels);
  } catch (error) {
    failure = { reason: error };
  }
  // Attempt both restores even if a context/renderer failure interrupts one.
  // Always join an already-submitted copy before releasing shared pixels to
  // the next tank; a restore failure must not leave a late writer behind.
  try { renderer.setRenderTarget(previousTarget, previousFace, previousMip); }
  catch (error) { failure ??= { reason: error }; }
  try { renderer.setClearColor(previousColor, previousAlpha); }
  catch (error) { failure ??= { reason: error }; }
  if (readback) {
    try { await readback; }
    catch (error) { failure ??= { reason: error }; }
    finally { interval.endTime = performance.now(); }
  }
  if (failure) throw failure.reason;
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
async function renderMaskPass(
  scene: THREE.Scene,
  camX: number,
  camZ: number,
  halfM: number,
  trace: TopMaskLoadTrace,
  layer: 'hull' | 'turret',
  sourceLifetime: MaskSourceLifetime | null,
): Promise<MaskPassResult | null> {
  sourceLifetime?.assertAlive();
  const engine = maskEngineCtx;
  if (!engine) return null;
  const renderer = engine.renderer;
  const { target, pixels } = ensureMaskRenderResources();
  const cam = new THREE.OrthographicCamera(-halfM, halfM, halfM, -halfM, 0.1, 80);
  cam.position.set(camX, 40, camZ);
  cam.up.set(0, 0, 1);
  cam.lookAt(camX, 0, camZ);
  cam.updateMatrixWorld(true);
  const compile: TopMaskLoadInterval = { stage: `${layer}Compile`, startTime: performance.now() };
  trace.intervals.push(compile);
  try { await compileMaskPass(renderer, target, scene, cam, sourceLifetime); }
  finally { compile.endTime = performance.now(); }
  sourceLifetime?.assertAlive();
  await renderMaskPixels(renderer, target, pixels, scene, cam, trace, layer);
  sourceLifetime?.assertAlive();
  // Alpha coverage becomes a white mask. readPixels rows are bottom-up, so
  // maskCanvasFromPixels flips them while collecting exact plan bounds.
  return measureTopMaskStage(trace, `${layer}Canvas`, () => {
    const rendered = maskCanvasFromPixels(pixels);
    if (!rendered) return null;
    // opaque pixel bounds back in METERS (pixel x = camX-half..camX+half maps
    // world -x; pixel y top = camZ+half): used for tight panel scaling.
    return maskPassResult(rendered, camX, camZ, halfM);
  });
}

/** Render both layers for a built visual. @returns {object|null} entry */
async function renderMaskEntry(
  visual: TankMaskVisual,
  spec: TankMaskSpec,
  trace: TopMaskLoadTrace,
  sourceLifetime: MaskSourceLifetime | null,
): Promise<TopDownMaskEntry | null> {
  sourceLifetime?.assertAlive();
  const root = visual.root;
  const scene = new THREE.Scene();
  scene.add(root);
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.updateMatrixWorld(true);
  const hullG = root.getObjectByName('rig_hull');
  const turretG = root.getObjectByName('rig_turret');
  if (!hullG || !turretG) { scene.remove(root); return null; }
  try {
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
  const hull = await renderMaskPass(scene, 0, 0, hullHalf, trace, 'hull', sourceLifetime);
  sourceLifetime?.assertAlive();

  // turret pass (hull hidden), centered on the PIVOT; the frustum must reach
  // the muzzle: gun length from the pivot + bustle margin
  turretG.visible = true;
  hullG.visible = false;
  const gunReach = Math.max(
    (spec.armor && spec.armor.gunBarrel && spec.armor.gunBarrel.lengthM) || 4,
    overall - (dims.hullLengthM || overall) / 2 - tp[2]);
  const turretHalf = Math.max(2.2, gunReach + 1.6) + MASK_MARGIN_M;
  const turret = await renderMaskPass(scene, tp[0], tp[2], turretHalf, trace, 'turret', sourceLifetime);
  sourceLifetime?.assertAlive();
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
  } finally {
    hullG.visible = true;
    turretG.visible = true;
    scene.remove(root);
  }
}

/**
 * Per-tank top-down layer masks for the damage panel. Returns the cached
 * entry, or null while building/unavailable. The caller keeps its vector
 * fallback on failure. Every pending subscriber receives its own callback.
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
  const got = maskCache.get(spec.id);
  if (got && got !== 'failed') return got;
  if (got === 'failed' || !maskEngineCtx) return null;
  void prepareTopDownMasks(spec, sourceVisual).then((entry) => {
    if (entry && onReady) {
      try { onReady(); }
      catch (error) { console.warn('[tankThumbs] mask subscriber failed:', errorMessage(error)); }
    }
  });
  return null;
}

function cacheMaskResult(id: string, entry: TopDownMaskEntry | null): void {
  maskCache.delete(id);
  maskCache.set(id, entry || 'failed');
  while (maskCache.size > MASK_CACHE_MAX) {
    const oldest = maskCache.keys().next().value;
    if (oldest === undefined) break;
    maskCache.delete(oldest);
  }
}

async function buildTopDownMasks(
  spec: TankMaskSpec,
  clonedRoot: THREE.Object3D | null,
  trace: TopMaskLoadTrace,
  sourceLifetime: MaskSourceLifetime | null,
): Promise<TopDownMaskEntry | null> {
  let visual: TankMaskVisual | null = null;
  let entry: TopDownMaskEntry | null = null;
  try {
    // Preserve lazy setTank semantics, but expose a promise for covered entry.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    sourceLifetime?.assertAlive();
    const id = spec.id;
    const build: TopMaskLoadInterval = { stage: 'build', startTime: performance.now() };
    trace.intervals.push(build);
    try {
      if (!clonedRoot) await ensureTankBuilder(id);
      sourceLifetime?.assertAlive();
      visual = clonedRoot
        ? { root: clonedRoot, dispose() {} }
        : createTank(id, maskEngineCtx, { camoSeed: 4000, quality: 'high' }) as TankMaskVisual;
    } finally { build.endTime = performance.now(); }
    const prepared = await renderMaskEntry(visual, spec, trace, sourceLifetime);
    sourceLifetime?.assertAlive();
    entry = prepared;
  } catch (error) {
    console.warn(`[tankThumbs] top-down mask build failed for ${spec.id}:`, errorMessage(error));
  } finally {
    // Full factory builds own their resources. The queue finalizer separately
    // releases only the per-mesh allocations owned by borrowed hierarchies.
    try { visual?.dispose(); } catch { /* released */ }
  }
  // A cancelled source belongs to an old match, not a permanently bad spec.
  // Preserve ordinary failed-GPU negative caching, but let a new live source retry.
  if (entry || !sourceLifetime?.invalidated) cacheMaskResult(spec.id, entry);
  finishTopMaskLoad(trace, entry ? 'complete' : 'failed');
  return entry;
}

/** Cache-only preparation; never changes the current tank or damage-panel DOM. */
export function prepareTopDownMasks(
  spec: TankMaskSpec,
  sourceVisual: TankMaskVisual | null = null,
): Promise<TopDownMaskEntry | null> {
  if (!spec || typeof document === 'undefined' || !maskEngineCtx) return Promise.resolve(null);
  const id = spec.id;
  const got = maskCache.get(id);
  if (got) {
    // Touch completed entries, while keeping pending ownership out of the LRU.
    maskCache.delete(id);
    maskCache.set(id, got);
    return Promise.resolve(got === 'failed' ? null : got);
  }
  const pending = pendingMasks.get(id);
  if (pending) return pending;
  const trace = beginTopMaskLoad();
  // Clone the already-built battle/garage hierarchy while it is known alive.
  // Object3D cloning shares immutable geometry/material resources but avoids
  // constructing and texture-baking a duplicate tank during a transition.
  let clonedRoot: THREE.Object3D | null = null;
  let sourceLifetime: MaskSourceLifetime | null = null;
  try {
    clonedRoot = measureTopMaskStage(trace, 'clone', () => sourceVisual ? cloneMaskSource(sourceVisual.root) : null);
    // Watch the original resources, including queued time. Some cloned mesh
    // classes copy geometry, but disposal of their live source still cancels
    // this borrowed-source job instead of reacquiring it on a later pass.
    if (clonedRoot && sourceVisual) sourceLifetime = watchMaskSourceLifetime(sourceVisual.root);
  } catch (error) {
    disposeMaskClone(clonedRoot);
    finishTopMaskLoad(trace, 'failed');
    cacheMaskResult(id, null);
    console.warn('[tankThumbs] mask clone failed:', errorMessage(error));
    return Promise.resolve(null);
  }
  const work = maskWorkTail.then(() => buildTopDownMasks(spec, clonedRoot, trace, sourceLifetime))
    .finally(() => {
      disposeMaskClone(clonedRoot);
      sourceLifetime?.release();
      pendingMasks.delete(id);
    });
  pendingMasks.set(id, work);
  // Shared target/pixel storage is exclusively owned through BOTH passes and
  // their canvas copies, including failures. Different tanks cannot interleave.
  maskWorkTail = work.then(() => undefined, () => undefined);
  return work;
}
