// The technical drawings' data (258): per tank, its side, top and front plates (text-free rasters, 2x and 1x) and one
// JSON file of the vector overlays traced from the anatomy (tools/drawing-page.ts): for each view its frame, its scale
// and the armour, module and crew polygons with their keys, tones and values. Shared by the viewer
// (technicalDrawing.ts), the Field Manual's prerender and the receipts (technicalDrawing.selftest.mjs). Pure; no DOM.
// First-party: Kevin B. Liu (NOTICE.md).
import type { TechnicalKind } from './technicalDiagramLegend.ts';

export type TechnicalView = 'side' | 'top' | 'front';
export const TECHNICAL_VIEWS: readonly TechnicalView[] = Object.freeze(['side', 'top', 'front']);
export const TECHNICAL_KINDS: readonly TechnicalKind[] = Object.freeze(['armor', 'modules', 'crew']);
/** Badges a kind numbers at most (its largest elements with a label point); the rest name themselves on hover. */
export const TECHNICAL_NUMBERED: Readonly<Record<TechnicalKind, number>> = Object.freeze({ armor: 12, modules: 16, crew: 12 });

/** The smallest element a badge marks (px² of the 2x frame: 4 x 4 px at 1x); smaller ones name themselves on hover. */
export const TECHNICAL_MIN_NUMBERED_AREA = 64;

/** The elements a view numbers, in badge order: the largest with a label point, at least TECHNICAL_MIN_NUMBERED_AREA, and
 * for armour one per distinct protection (a skirt's four 7 mm panels take one badge, on the largest); the rest name
 * themselves on hover. */
export function numberedElements(view: TechnicalDrawingViewData, kind: TechnicalKind): TechnicalDrawingElement[] {
  const seen = new Set<string>(), numbered: TechnicalDrawingElement[] = [];
  for (const element of view.layers[kind]) {
    if (!element.at || element.area < TECHNICAL_MIN_NUMBERED_AREA) continue;
    if (kind === 'armor') {
      const value = `${element.kind ?? ''}|${element.keMm ?? ''}|${element.ceMm ?? ''}`;
      if (seen.has(value)) continue;
      seen.add(value);
    }
    numbered.push(element);
    if (numbered.length === TECHNICAL_NUMBERED[kind]) break;
  }
  return numbered;
}

/** One traced element in a view: an SVG path in the frame's pixels (y down), its badge point and area (px, px²), and the
 * values its label is composed from (technicalDiagramLabels.ts technicalLabelText). */
export interface TechnicalDrawingElement {
  readonly key: string;
  readonly tone: string | null;
  readonly d: string;
  readonly at: readonly [number, number] | null;
  readonly area: number;
  readonly keMm?: number;
  readonly ceMm?: number;
  readonly kind?: string;
  readonly plate?: string;
  readonly module?: string;
  readonly crew?: string;
  readonly title?: string;
}

export interface TechnicalDrawingViewData {
  /** The frame (the 2x plate's pixels); the 1x plate is half of it. */
  readonly size: readonly [number, number];
  /** The drawing's scale: frame pixels per metre. */
  readonly pxPerM: number;
  /** The plate's measured extent (frame px: x0, y0, x1, y1), its body's (below any whip or mast that runs off the top;
   * the frame is fitted to it) and the 2x and 1x files' hashes (sha-256, 16 hex). */
  readonly plate: {
    readonly box: readonly [number, number, number, number];
    readonly body: readonly [number, number, number, number];
    readonly sha: readonly [string, string];
  };
  readonly layers: Readonly<Record<TechnicalKind, readonly TechnicalDrawingElement[]>>;
}

export interface TechnicalDrawingData {
  readonly schema: 2;
  readonly id: string;
  readonly views: Readonly<Partial<Record<TechnicalView, TechnicalDrawingViewData>>>;
}

export function technicalDrawingFile(id: string): string { return `${id}_drawing.json`; }
export function technicalPlateFile(id: string, view: TechnicalView, density: 1 | 2): string {
  return `${id}_drawing_${view}${density === 1 ? '_1x' : ''}.webp`;
}
/** The drawings' files are served from `base` (the published icons by default; a review page passes its own folder). */
export function technicalDrawingUrl(id: string, base = '/icons/'): string { return `${base}${technicalDrawingFile(id)}`; }
export function technicalPlateUrl(id: string, view: TechnicalView, density: 1 | 2, base = '/icons/'): string {
  return `${base}${technicalPlateFile(id, view, density)}`;
}

const PATH = /^(?:M-?[\d.]+ -?[\d.]+(?:L-?[\d.]+ -?[\d.]+)+Z)+$/;

/** The parsed drawing, or an error naming what is wrong (the viewer refuses a malformed file rather than drawing it). */
export function parseTechnicalDrawing(value: unknown, id: string): TechnicalDrawingData {
  const fail = (why: string): never => { throw new Error(`technical drawing ${id}: ${why}`); };
  const data = value as TechnicalDrawingData | null;
  if (!data || data.schema !== 2) fail('not a schema-2 drawing');
  if (data!.id !== id) fail(`names ${String(data!.id)}`);
  const views = data!.views && typeof data!.views === 'object' ? data!.views : fail('no views');
  for (const view of Object.keys(views!)) {
    if (!TECHNICAL_VIEWS.includes(view as TechnicalView)) fail(`unknown view ${view}`);
    const v = views![view as TechnicalView]!;
    const [w, h] = Array.isArray(v.size) ? v.size : fail(`${view}: no size`);
    if (!(w! > 0 && h! > 0) || !(v.pxPerM > 0)) fail(`${view}: bad frame`);
    for (const box of [v.plate?.box, v.plate?.body]) {
      if (!Array.isArray(box) || box.length !== 4 || !(box[0] >= 0 && box[1] >= 0 && box[2] <= w! && box[3] <= h! && box[0] < box[2] && box[1] < box[3])) {
        fail(`${view}: bad plate extent`);
      }
    }
    if (!Array.isArray(v.plate.sha) || v.plate.sha.length !== 2 || !v.plate.sha.every((sha) => /^[0-9a-f]{16}$/.test(sha))) fail(`${view}: no plate hashes`);
    for (const kind of TECHNICAL_KINDS) {
      const layer = v.layers?.[kind];
      if (!Array.isArray(layer)) fail(`${view}: no ${kind} layer`);
      for (const element of layer!) {
        if (typeof element.key !== 'string' || !PATH.test(element.d)) fail(`${view} ${kind} ${String(element.key)}: bad path`);
        if (element.at && !(element.at[0] >= 0 && element.at[0] <= w! && element.at[1] >= 0 && element.at[1] <= h!)) {
          fail(`${view} ${kind} ${element.key}: label point off the frame`);
        }
      }
    }
  }
  return data!;
}
