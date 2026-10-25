/**
 * trueScale.ts — vehicles at one scale (brand-ui SPEC 12.5: compare at true scale; the stage's plan inset with a 1.75 m
 * scale figure). Copyright © 2026 Kevin B. Liu.
 *
 * Each vehicle is its side silhouette (public/icons/<id>_side_silhouette.png: a white alpha mask, drawn gun to the right
 * and fitted to its image), so the mask's alpha bounds are measured once per vehicle and stretched to the vehicle's
 * overall length: two vehicles share metres per pixel, and the figure stands 1.75 m tall beside them. Colours are read
 * from the canvas's design tokens, so the presets (contrast, colour vision) reach the drawing.
 */
import { iconUrl } from '../ui/icons.ts';
import { formatNumber, t } from '../ui/i18n.ts';

interface TrueScaleEntry {
  readonly id: string;
  readonly lengthM: number;
  /** The custom property that colours this vehicle (--ink-1, --ink-3...). */
  readonly tone: string;
  /** The silhouettes are drawn facing right; 'left' mirrors one. */
  readonly facing: 'left' | 'right';
}

interface TrueScaleOptions {
  /** 'apart': side by side; 'overlay': from one origin, the later entries over the earlier ones. */
  readonly layout: 'apart' | 'overlay';
  /** A 1.75 m figure at the left edge. */
  readonly human?: boolean;
  /** The drawing's accessible name. */
  readonly label: string;
}

interface Mask { readonly image: HTMLImageElement; readonly x: number; readonly y: number; readonly w: number; readonly h: number }

const HUMAN_M = 1.75;
const masks = new Map<string, Promise<Mask | null>>();
const draws = new WeakMap<HTMLCanvasElement, number>();
// (2026-10-25, lockdown-251) a canvas with no CSS box (the stage's inset, hidden on a phone) keeps its latest drawing
// here until it gets one. Its width used to fall back to the backing store's, which the device ratio then doubled at
// every selection: 268 px to 17 152 px in six picks, and a 49 s task on the 4x phone census.
const deferred = new WeakMap<HTMLCanvasElement, () => void>();
let boxes: ResizeObserver | null = null;
function drawWhenBoxed(canvas: HTMLCanvasElement, redraw: () => void): void {
  deferred.set(canvas, redraw);
  boxes ??= new ResizeObserver((records) => {
    for (const record of records) {
      const target = record.target as HTMLCanvasElement;
      const pending = record.contentRect.width > 0 ? deferred.get(target) : undefined;
      if (!pending) continue;
      deferred.delete(target);
      pending();
    }
  });
  boxes.observe(canvas);
}

function loadMask(id: string): Promise<Mask | null> {
  let pending = masks.get(id);
  if (pending) return pending;
  pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = iconUrl(id, 'side_silhouette');
  }).then((image) => {
    const probe = document.createElement('canvas');
    probe.width = image.naturalWidth;
    probe.height = image.naturalHeight;
    const context = probe.getContext('2d', { willReadFrequently: true });
    if (!context || !probe.width || !probe.height) return null;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, probe.width, probe.height);
    let x0 = probe.width, y0 = probe.height, x1 = -1, y1 = -1;
    for (let y = 0; y < probe.height; y++) {
      for (let x = 0; x < probe.width; x++) {
        if (data[(y * probe.width + x) * 4 + 3] < 96) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    return x1 < x0 ? null : { image, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }, () => null);
  masks.set(id, pending);
  return pending;
}

/** Draw the entries into the canvas at one scale (its CSS box sets the size; its width/height attributes its aspect). */
export async function drawTrueScale(canvas: HTMLCanvasElement, entries: readonly TrueScaleEntry[], options: TrueScaleOptions): Promise<void> {
  const draw = (draws.get(canvas) ?? 0) + 1;
  draws.set(canvas, draw);
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', options.label);
  const loaded = await Promise.all(entries.map((entry) => loadMask(entry.id)));
  if (draws.get(canvas) !== draw) return; // a newer drawing replaced this one
  const aspect = Number(canvas.dataset.aspect) || canvas.height / Math.max(1, canvas.width);
  canvas.dataset.aspect = String(aspect);
  const cssWidth = canvas.clientWidth;
  if (!cssWidth) {
    drawWhenBoxed(canvas, () => { void drawTrueScale(canvas, entries, options); });
    return;
  }
  deferred.delete(canvas);
  const cssHeight = cssWidth * aspect;
  const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(cssWidth * ratio));
  canvas.height = Math.max(1, Math.round(cssHeight * ratio));
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);
  const style = getComputedStyle(canvas);
  const colour = (token: string): string => style.getPropertyValue(token).trim();
  const pad = 6;
  const gap = 14;
  const humanWidth = options.human ? 34 : 0;
  const items = entries.map((entry, index) => ({ entry, mask: loaded[index] }))
    .filter((item): item is { entry: TrueScaleEntry; mask: Mask } => !!item.mask && item.entry.lengthM > 0);
  if (!items.length) return;
  const heightM = (item: { entry: TrueScaleEntry; mask: Mask }): number => item.entry.lengthM * (item.mask.h / item.mask.w);
  const spanM = options.layout === 'apart' ? items.reduce((sum, item) => sum + item.entry.lengthM, 0)
    : Math.max(...items.map((item) => item.entry.lengthM));
  const gaps = options.layout === 'apart' ? gap * (items.length - 1) : 0;
  const tallestM = Math.max(options.human ? HUMAN_M : 0, ...items.map(heightM));
  const scale = Math.min((cssWidth - pad * 2 - humanWidth - gaps) / spanM, (cssHeight - pad * 2) / tallestM);
  const ground = cssHeight - pad;
  context.fillStyle = colour('--line-2');
  context.fillRect(pad, ground, cssWidth - pad * 2, 1);
  const tint = document.createElement('canvas');
  let x = pad + humanWidth;
  if (options.layout === 'apart') x += (cssWidth - pad * 2 - humanWidth - gaps - spanM * scale) / 2;
  for (const item of items) {
    const width = item.entry.lengthM * scale;
    const height = width * (item.mask.h / item.mask.w);
    tint.width = Math.max(1, Math.round(width * ratio));
    tint.height = Math.max(1, Math.round(height * ratio));
    const brush = tint.getContext('2d');
    if (!brush) continue;
    brush.drawImage(item.mask.image, item.mask.x, item.mask.y, item.mask.w, item.mask.h, 0, 0, tint.width, tint.height);
    brush.globalCompositeOperation = 'source-in';
    brush.fillStyle = colour(item.entry.tone);
    brush.fillRect(0, 0, tint.width, tint.height);
    context.save();
    if (item.entry.facing === 'left') {
      context.translate(x + width, 0);
      context.scale(-1, 1);
      context.drawImage(tint, 0, ground - height, width, height);
    } else {
      context.drawImage(tint, x, ground - height, width, height);
    }
    context.restore();
    if (options.layout === 'apart') x += width + gap;
  }
  if (options.human) {
    // the 1.75 m figure: a head and a body, and its height beside it
    const tall = HUMAN_M * scale;
    const cx = pad + 8;
    const head = Math.max(1.5, tall * 0.07);
    context.fillStyle = colour('--accent');
    context.beginPath();
    context.arc(cx, ground - tall + head, head, 0, Math.PI * 2);
    context.fill();
    context.fillRect(cx - head * 0.8, ground - tall + head * 2.3, head * 1.6, tall - head * 2.3);
    context.fillStyle = colour('--ink-3');
    context.font = `500 11px ${colour('--font-mono') || 'monospace'}`;
    context.textBaseline = 'top';
    context.fillText(`${formatNumber(HUMAN_M)} ${t('gallery.unit.m')}`, pad, pad);
  }
}
