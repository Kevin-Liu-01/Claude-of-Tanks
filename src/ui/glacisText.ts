/**
 * Glacis as outlines (DECISIONS 2026-11-03, "Glacis for markings and HUD numerals"). Copyright © 2026 Kevin B. Liu.
 *
 * Baked markings (hull and tactical numbers, serials, stencils, plates) and the HUD's measured numerals take Glacis's
 * own outlines from glacis.js (vendored byte for byte, OFL 1.1), not a canvas font: a bake is then the same on every
 * machine and in the painter worker, with no font to load and no re-bake when one arrives. Text Glacis cannot set as
 * written (lowercase it would capitalise, a script it lacks) keeps the caller's own face. Locale text never reaches the
 * module: the HUD's words set in the document, where the face's unicode-range hands every letter to the shell face and
 * CSS upper-cases by the element's language (a module call on locale text would upper-case it with
 * toLocaleUpperCase(lang) first, since the module's own upper-casing ignores locale and passes a Turkish i as I).
 * Node-safe: no DOM at import; a trace writes into any CanvasPath (a Path2D, a 2D context, a recording mock).
 */
import { layout, supports, type GlacisLayout, type GlacisOptions } from './glacis.js';

export type { GlacisOptions };

/** The CSS family name of the face (public/fonts/glacis/Glacis.woff2, declared by the cot:type marker's `num`). */
export const GLACIS_FAMILY = 'Glacis';

/** What a trace writes into: Path2D and both 2D contexts implement it. */
export interface GlacisPathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

const NUMBER = /-?\d+(?:\.\d+)?/g;

/** Write a laid-out run's outlines into `sink`, its anchor at (x, y). The outlines are straight lines only. */
export function traceGlacisRun(sink: GlacisPathSink, run: GlacisLayout, x: number, y: number): void {
  for (const contour of run.d.split('Z')) {
    let at = 0;
    let px = 0;
    NUMBER.lastIndex = 0;
    for (let match = NUMBER.exec(contour); match; match = NUMBER.exec(contour)) {
      if (at % 2 === 0) px = Number(match[0]);
      else if (at === 1) sink.moveTo(x + px, y + Number(match[0]));
      else sink.lineTo(x + px, y + Number(match[0]));
      at++;
    }
    if (at) sink.closePath();
  }
}

/** Lay `text` out and write its outlines into `sink`; returns the run (its width, cap height, missing characters). */
export function traceGlacis(sink: GlacisPathSink, text: string, x: number, y: number, options?: GlacisOptions): GlacisLayout {
  const run = layout(text, options);
  traceGlacisRun(sink, run, x, y);
  return run;
}

/** One Path2D for one marking: fill it, stroke it, or hand it to a wrapped fill (the camo painters' fillWrapped). */
export function glacisPath(text: string, x: number, y: number, options?: GlacisOptions): Path2D {
  const path = new Path2D();
  traceGlacis(path, text, x, y, options);
  return path;
}

/** The run's advance width at `options` (tracking and tabular figures included), without tracing it. */
export function glacisWidth(text: string, options?: GlacisOptions): number {
  return layout(text, options).width;
}

/**
 * Whether Glacis sets a marking exactly as written: every character drawn and no letter it would capitalise (a
 * stencil's `CTEx` keeps its lowercase x in the marking face). Markings are authored text, never locale text.
 */
export function glacisSetsMarking(text: string): boolean {
  return text === text.toUpperCase() && supports(text);
}

/** The characters the numerals face sets in a document too (TYPE_NUMERALS.range, less what the face lacks). */
const NUMERAL_TEXT = /^[ !"#%&'()*+,\-./0-9:;=?\u00a0\u00b0\u00b7\u00d7\u2007\u2009\u202f]*$/;

/**
 * Whether a document run in FONT_NUM sets every character of `text` in Glacis (figures and signs only), so the module's
 * layout measures exactly what the DOM draws. A word falls through to the shell face, which the canvas must measure.
 */
export function glacisSetsNumerals(text: string): boolean {
  return NUMERAL_TEXT.test(text);
}
