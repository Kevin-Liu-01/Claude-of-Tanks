/**
 * uiCanvas.ts — the one primitive behind every on-screen UI canvas (UI-LOCKDOWN part A). Copyright © 2026 Kevin B. Liu.
 *
 * Each canvas used to read devicePixelRatio and size itself, and nothing kept the rule: the Gallery's hidden inset fell
 * back to its own backing store for a width and doubled it at every pick (268 px to 17,152 px in six, a 49 s task on the
 * 4x phone), the sight kept its old store after a resize and held 1680x1050 while hidden, the damage panel kept a fixed
 * 2x store at DPR 1, and the Garage's swatches kept 128x44 on boxes from 40x56 to 112x56. Here the rule holds by
 * construction:
 * - the backing store is the CSS content box × min(devicePixelRatio, cap), the box from one shared ResizeObserver
 *   (device-pixel-content-box where the browser reports it, so a shown store is the snapped device size exactly);
 * - a hidden or zero box sizes nothing: the store is released to 1 px and the drawing redrawn when the box returns;
 * - the size never comes from the store, and a box that follows its own store (a canvas with no CSS size takes its
 *   width/height attributes) is pinned at the box it had, so a store can never compound;
 * - a resolution media query follows the device ratio (a window dragged to another screen, a browser zoom), with a
 *   half-second check behind it (an emulated device scale factor at an unchanged viewport size, as the canvas probe
 *   flips it, changes devicePixelRatio and fires no query, resize or observer event);
 * - a retained drawing redraws only on a size, ratio or data change (redraw()), a per-frame painter sizes in begin();
 * - a lost context redraws when it is restored, and begin() allocates nothing.
 * UI text is DOM over the canvas, never canvas text (the kit's type, i18n, the zh floor, assistive tech): a canvas places
 * its words and figures through canvasText.ts. src/ui/uiCanvasCensus.selftest.mjs fails on an on-screen canvas built
 * outside this module and on canvas text on screen. Texture canvases (world/, vehicles/, fx/, the garage's and the
 * renderer's baked textures) are listed there by path; an offscreen scratch canvas anywhere else comes from
 * scratchCanvas().
 */

/** The device-pixel cap a UI canvas's store takes (the probe's CANVAS_CAP, tools/click-timeline.mjs). */
export const UI_CANVAS_DPR_CAP = 2;

type UiCanvasImage = HTMLCanvasElement | HTMLImageElement | ImageBitmap;

/** A retained drawing: the context's transform is set (CSS px, the design space or device px, per `units`), the store
 *  clear when it was just made; `width`/`height` are the box in CSS px. */
export type UiCanvasDraw = (context: CanvasRenderingContext2D, width: number, height: number, surface: UiCanvas) => void;

interface UiCanvasOptions {
  /** The drawing, redrawn on every size and ratio change and on redraw(). Omit for a per-frame painter (begin()). */
  readonly draw?: UiCanvasDraw;
  /** Called when the box or the ratio changes the store (a painter that skips frames marks itself dirty here). */
  readonly onResize?: (surface: UiCanvas) => void;
  /** Device-pixel cap (default UI_CANVAS_DPR_CAP). */
  readonly cap?: number;
  /** A ceiling on the store's pixels (the full-screen sight keeps the renderer's 4K budget on very large windows). */
  readonly maxPixels?: number;
  /** The drawing's coordinates: 'css' (default) the box in CSS px, 'device' the store's pixels, or a fixed design
   *  space [width, height] stretched over the box (a 220-unit minimap on any plate size). */
  readonly units?: 'css' | 'device' | readonly [number, number];
  /** The canvas's CSS size when no stylesheet sets one (written inline once): its box never follows its store. */
  readonly box?: readonly [number, number];
  /** A per-frame painter's box before the observer first measures it (the full-screen sight: the viewport). */
  readonly initialBox?: () => readonly [number, number];
  readonly alpha?: boolean;
  readonly willReadFrequently?: boolean;
}

export interface UiCanvas {
  readonly canvas: HTMLCanvasElement;
  /** The 2D context (made on first use: a canvas never drawn holds no store). */
  readonly context: CanvasRenderingContext2D;
  /** The CSS content box (0 while hidden or not yet measured). */
  readonly width: number;
  readonly height: number;
  /** Store pixels per CSS px across (the transform 'css' units apply). */
  readonly ratio: number;
  /** Whether the store is live: measured, shown and not lost. */
  readonly shown: boolean;
  /** The image a retained drawing shows (setImage), for the image draws below. */
  readonly image: UiCanvasImage | null;
  /** A per-frame painter's frame: sizes the store to its box, sets the transform; false while hidden (draw nothing). */
  begin(): boolean;
  /** The retained drawing's data changed: draw now when shown, else when the box returns. */
  redraw(): void;
  /** Read the box now (one layout read) rather than at the observer's next report: for an owner that has just shown the
   *  canvas and paints in the same task (a HUD mode switch, a screenshot frame). Never per frame. */
  measureNow(): void;
  /** Show an image through the drawing (a swatch's painted tile, a film's frame). */
  setImage(image: UiCanvasImage | null): void;
  /** Stop observing and release the store. */
  dispose(): void;
}

const deviceRatio = (): number => {
  const ratio = Number((globalThis as { readonly devicePixelRatio?: number }).devicePixelRatio);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
};

/** Each canvas's surface, by its canvas (a canvas the document drops is collected with its surface: the observer holds
 *  its targets weakly, and a detached canvas is reported at 0 and releases its store first). */
const surfaces = new WeakMap<Element, Surface>();
/** The live surfaces for a ratio change, held weakly. */
const live = new Set<WeakRef<Surface>>();
let observer: ResizeObserver | null = null;
/** False once observing the device-pixel box throws (Safari): the content box × ratio then. */
let devicePixelBox = true;
let ratioQuery: MediaQueryList | null = null;
/** The ratio the query watches; the backstop check compares against it. */
let watchedRatio = 0;
/** How often the backstop reads devicePixelRatio (one property read: nothing allocates). */
const RATIO_CHECK_MS = 500;
/** Boxes that followed their own store and were pinned (the census reads it: it should stay 0). */
let pinnedBoxes = 0;

function onResize(entries: readonly ResizeObserverEntry[]): void {
  for (const entry of entries) {
    const surface = surfaces.get(entry.target);
    if (!surface) continue;
    const css = entry.contentBoxSize?.[0];
    const device = entry.devicePixelContentBoxSize?.[0];
    surface.measure(css ? css.inlineSize : entry.contentRect.width, css ? css.blockSize : entry.contentRect.height,
      device ? device.inlineSize : 0, device ? device.blockSize : 0);
  }
}

function onRatioChange(): void {
  for (const ref of live) {
    const surface = ref.deref();
    if (surface) surface.ratioChanged();
    else live.delete(ref);
  }
  watchRatio();
}

/** One resolution query at a time, for the ratio now: it changes once, and the next one is armed for the new ratio. */
function watchRatio(): void {
  watchedRatio = deviceRatio();
  if (typeof matchMedia !== 'function') return;
  ratioQuery?.removeEventListener?.('change', onRatioChange);
  ratioQuery = matchMedia(`(resolution: ${deviceRatio()}dppx)`);
  ratioQuery.addEventListener?.('change', onRatioChange);
}

/** Observe `canvas`'s content box; false where there is no observer (Node receipts, an old browser). */
function observe(canvas: HTMLCanvasElement): boolean {
  if (typeof ResizeObserver !== 'function') return false;
  if (!observer) {
    observer = new ResizeObserver(onResize);
    watchRatio();
    if (typeof setInterval === 'function') {
      const timer = setInterval(() => { if (deviceRatio() !== watchedRatio) onRatioChange(); }, RATIO_CHECK_MS);
      (timer as { unref?: () => void }).unref?.(); // (Node receipts exit with it running)
    }
  }
  if (devicePixelBox) {
    try {
      observer.observe(canvas, { box: 'device-pixel-content-box' });
      return true;
    } catch {
      devicePixelBox = false;
    }
  }
  observer.observe(canvas);
  return true;
}

class Surface implements UiCanvas {
  readonly canvas: HTMLCanvasElement;
  image: UiCanvasImage | null = null;
  width = 0;
  height = 0;
  ratio = 1;
  private ratioY = 1;
  private ctx: CanvasRenderingContext2D | null = null;
  private readonly options: UiCanvasOptions;
  /** The retained drawing (a canvas its host made may take its drawing from a lazy module: adopt()). */
  private drawing: UiCanvasDraw | null;
  private readonly cap: number;
  /** The store the box asks for (0: hidden, -1: not yet measured). */
  private targetW = -1;
  private targetH = -1;
  private deviceW = 0;
  private deviceH = 0;
  private measured = false;
  /** The store before the last one this surface made, for the compounding check. */
  private priorW = -1;
  private priorH = -1;
  private dirty = true;
  private lost = false;
  private pinned = false;
  private readonly ref: WeakRef<Surface> | null;
  private readonly onLost = (): void => { this.lost = true; };
  private readonly onRestored = (): void => {
    this.lost = false;
    this.dirty = true;
    this.flush();
    this.options.onResize?.(this);
  };

  constructor(canvas: HTMLCanvasElement, options: UiCanvasOptions) {
    this.canvas = canvas;
    this.options = options;
    this.drawing = options.draw ?? null;
    this.cap = options.cap ?? UI_CANVAS_DPR_CAP;
    if (options.box && canvas.style) {
      canvas.style.width = `${options.box[0]}px`;
      canvas.style.height = `${options.box[1]}px`;
    }
    // no store before a box is measured (a fresh canvas holds 300x150, markup its width/height attributes)
    this.release();
    if (canvas.dataset) canvas.dataset.uiCanvas = '';
    canvas.addEventListener?.('contextlost', this.onLost);
    canvas.addEventListener?.('contextrestored', this.onRestored);
    surfaces.set(canvas, this);
    this.ref = typeof WeakRef === 'function' ? new WeakRef(this) : null;
    if (this.ref) live.add(this.ref);
    // without an observer a fixed box is the box (Node receipts draw through the same path, from the first redraw())
    if (!observe(canvas) && options.box) {
      this.measured = true;
      this.width = options.box[0];
      this.height = options.box[1];
      this.resolve(false);
    }
  }

  get context(): CanvasRenderingContext2D {
    if (this.ctx) return this.ctx;
    const attributes: CanvasRenderingContext2DSettings = {};
    if (this.options.alpha === false) attributes.alpha = false;
    if (this.options.willReadFrequently) attributes.willReadFrequently = true;
    const context = this.canvas.getContext('2d', attributes);
    if (!context) throw new Error('[uiCanvas] Canvas2D context unavailable');
    this.ctx = context;
    return context;
  }

  get shown(): boolean {
    return this.targetW > 0 && !this.lost;
  }

  /** The observer's report: the content box in CSS px and, where reported, in device pixels. */
  measure(width: number, height: number, deviceWidth: number, deviceHeight: number): void {
    this.measured = true;
    if (!(width > 0 && height > 0)) {
      this.width = this.height = 0;
      this.deviceW = this.deviceH = 0;
      this.targetW = this.targetH = 0;
      this.release();
      return;
    }
    // A box that follows its store (no CSS size: the width/height attributes are the box) would grow with every ratio
    // step: pin it at the box it had, so the store is the box × the ratio once and for all.
    if (this.width > 0 && this.width === this.priorW && this.height === this.priorH
      && width === this.canvas.width && height === this.canvas.height && (width !== this.width || height !== this.height)) {
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      if (!this.pinned) pinnedBoxes++;
      this.pinned = true;
      return;
    }
    this.width = width;
    this.height = height;
    this.deviceW = deviceWidth;
    this.deviceH = deviceHeight;
    this.resolve();
  }

  ratioChanged(): void {
    // the device box reported for the old ratio no longer holds; the observer reports the new one if it can
    this.deviceW = this.deviceH = 0;
    if (this.width > 0) this.resolve();
  }

  /** The store this box asks for at the ratio now; a retained drawing redraws at once, a painter in its next begin(). */
  private resolve(notify = true): void {
    const ratio = Math.min(deviceRatio(), this.cap);
    let width = Math.max(1, Math.round(this.width * ratio));
    let height = Math.max(1, Math.round(this.height * ratio));
    // the snapped device box where it is this box at this ratio (an emulated scale factor reports CSS px there)
    if (this.deviceW > 0 && this.deviceH > 0 && ratio === deviceRatio()
      && Math.abs(this.deviceW - this.width * ratio) <= 1 && Math.abs(this.deviceH - this.height * ratio) <= 1) {
      width = this.deviceW;
      height = this.deviceH;
    }
    const budget = this.options.maxPixels ?? 0;
    if (budget > 0 && width * height > budget) {
      const k = Math.sqrt(budget / (width * height));
      width = Math.max(1, Math.floor(width * k));
      height = Math.max(1, Math.floor(height * k));
    }
    if (width === this.targetW && height === this.targetH) return;
    this.targetW = width;
    this.targetH = height;
    this.dirty = true;
    if (!notify) return;
    if (this.drawing) this.flush();
    this.options.onResize?.(this);
  }

  private applyStore(): void {
    const canvas = this.canvas;
    if (canvas.width !== this.targetW || canvas.height !== this.targetH) {
      this.priorW = canvas.width;
      this.priorH = canvas.height;
      canvas.width = this.targetW;
      canvas.height = this.targetH;
    }
    this.ratio = this.targetW / Math.max(1e-6, this.width);
    this.ratioY = this.targetH / Math.max(1e-6, this.height);
  }

  private transform(): void {
    const units = this.options.units ?? 'css';
    if (units === 'device') this.context.setTransform(1, 0, 0, 1, 0, 0);
    else if (units === 'css') this.context.setTransform(this.ratio, 0, 0, this.ratioY, 0, 0);
    else this.context.setTransform(this.targetW / units[0], 0, 0, this.targetH / units[1], 0, 0);
  }

  private release(): void {
    this.dirty = true;
    const canvas = this.canvas;
    if (canvas.width > 1 || canvas.height > 1) {
      canvas.width = 1;
      canvas.height = 1;
    }
    this.priorW = this.priorH = -1;
  }

  /** Draw the retained drawing when it is due and shown. */
  private flush(): void {
    const draw = this.drawing;
    if (!draw || !this.dirty || this.lost || this.targetW <= 0) return;
    this.applyStore();
    this.transform();
    this.dirty = false;
    draw(this.context, this.width, this.height, this);
  }

  begin(): boolean {
    if (!this.measured && this.targetW < 0 && this.options.initialBox) {
      const [width, height] = this.options.initialBox();
      if (width > 0 && height > 0) {
        this.width = width;
        this.height = height;
        this.resolve();
      }
    }
    if (this.targetW <= 0 || this.lost) return false;
    this.applyStore();
    this.transform();
    return true;
  }

  redraw(): void {
    this.dirty = true;
    this.flush();
  }

  measureNow(): void {
    if (!this.canvas.isConnected) return;
    // a box it can see (a hidden one is the observer's to report, and a stand-in DOM reads 0 here)
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    if (width > 0 && height > 0) this.measure(width, height, 0, 0);
  }

  /** Take the drawing a host's canvas was made without (its drawer loads later). */
  adopt(draw: UiCanvasDraw): void {
    if (this.drawing) return;
    this.drawing = draw;
    this.dirty = true;
  }

  setImage(image: UiCanvasImage | null): void {
    this.image = image;
    this.redraw();
  }

  dispose(): void {
    observer?.unobserve(this.canvas);
    surfaces.delete(this.canvas);
    if (this.ref) live.delete(this.ref);
    this.release();
    this.canvas.removeEventListener?.('contextlost', this.onLost);
    this.canvas.removeEventListener?.('contextrestored', this.onRestored);
    if (this.canvas.dataset) delete this.canvas.dataset.uiCanvas;
  }
}

/** Mount `canvas`, or return the surface it already has (one owner per canvas: the first mount's options, except that
 *  a surface made without a drawing takes this one's). */
export function uiCanvas(canvas: HTMLCanvasElement, options: UiCanvasOptions = {}): UiCanvas {
  const surface = surfaces.get(canvas);
  if (!surface) return new Surface(canvas, options);
  if (options.draw) surface.adopt(options.draw);
  return surface;
}

/** Make an on-screen canvas under `parent` (with `className`) and mount it. */
export function createUiCanvas(parent: Element | null, className: string, options: UiCanvasOptions = {}): UiCanvas {
  const canvas = document.createElement('canvas');
  if (className) canvas.className = className;
  parent?.appendChild(canvas);
  return new Surface(canvas, options);
}

/** The surface a canvas was mounted with, if any (a shared painter presents through it when there is one). */
export function uiCanvasOf(canvas: HTMLCanvasElement): UiCanvas | undefined {
  return surfaces.get(canvas);
}

/** An offscreen canvas (a bake, a mask, a tint, an export frame): sized by its caller, never put on screen. */
export function scratchCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

const imageWidth = (image: UiCanvasImage): number =>
  ('naturalWidth' in image ? image.naturalWidth : 0) || image.width;
const imageHeight = (image: UiCanvasImage): number =>
  ('naturalHeight' in image ? image.naturalHeight : 0) || image.height;

/** Draw `image` over a width × height box: 'cover' crops it to fill (object-fit: cover), 'contain' fits it whole. */
export function drawImageFit(context: CanvasRenderingContext2D, image: UiCanvasImage, width: number, height: number,
  fit: 'cover' | 'contain' = 'cover'): void {
  const sw = imageWidth(image), sh = imageHeight(image);
  if (!(sw > 0 && sh > 0 && width > 0 && height > 0)) return;
  const scale = fit === 'cover' ? Math.max(width / sw, height / sh) : Math.min(width / sw, height / sh);
  const dw = sw * scale, dh = sh * scale;
  context.drawImage(image, (width - dw) / 2, (height - dh) / 2, dw, dh);
}

/** A retained drawing that shows the surface's image covering its box (swatches). */
export const coverImage: UiCanvasDraw = (context, width, height, surface) => {
  context.clearRect(0, 0, width, height);
  if (surface.image) drawImageFit(context, surface.image, width, height, 'cover');
};

/** Probes and receipts: every live surface's box and store, and how many boxes were pinned. */
export function uiCanvasCensus(): { readonly pinned: number; readonly surfaces: readonly UiCanvasRecord[] } {
  const records: UiCanvasRecord[] = [];
  for (const ref of live) {
    const surface = ref.deref();
    if (surface) records.push({ canvas: surface.canvas, box: [surface.width, surface.height], store: [surface.canvas.width, surface.canvas.height] });
  }
  return { pinned: pinnedBoxes, surfaces: records };
}

interface UiCanvasRecord {
  readonly canvas: HTMLCanvasElement;
  readonly box: readonly [number, number];
  readonly store: readonly [number, number];
}
