// Types for glacis.js, the Glacis outline module vendored byte for byte from Princeton-Powerlifting
// (`pnpm font`, public/fonts/glacis/glacis.js at 8eb6c4f). Copyright © 2026 Kevin B. Liu; the module and the font are
// SIL Open Font License 1.1 (public/fonts/glacis/OFL.txt). The module is never edited here: re-copy it on a Glacis
// release and keep these declarations equal to its JSDoc.

export interface GlacisOptions {
  /** Font size (the em) in output units, as in CSS. Caps stand 0.7 × size. Default 1000 (font units). */
  readonly size?: number;
  /** Extra space between glyphs, in thousandths of the em (CSS letter-spacing × 1000). Default 0. */
  readonly tracking?: number;
  /** Set the figures on one shared advance (the font's tnum). Default false. */
  readonly tabular?: boolean;
  /** Where the anchor sits on the run. Default 'left'. */
  readonly align?: 'left' | 'center' | 'right';
  /** The anchor's y: the baseline, the top of the caps, or halfway up the caps. Default 'alphabetic'. */
  readonly baseline?: 'alphabetic' | 'top' | 'middle';
}

export interface GlacisPlaced {
  readonly char: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly advance: number;
}

export interface GlacisLayout {
  /** SVG path data for the whole run, y down, relative to the anchor. */
  readonly d: string;
  readonly width: number;
  readonly capHeight: number;
  readonly glyphs: readonly GlacisPlaced[];
  /** Characters Glacis does not have; each set as a space. */
  readonly missing: readonly string[];
}

export interface GlacisShape {
  readonly char: string;
  readonly outer: Array<[number, number]>;
  readonly holes: Array<Array<[number, number]>>;
}

export const UPM: number;
export const CAP_HEIGHT: number;
export const ASCENDER: number;
export const DESCENDER: number;
export const GLYPHS: Readonly<Record<string, { readonly advance: number; readonly d: string }>>;
export const CMAP: Readonly<Record<number, string>>;
export function layout(text: string, opts?: GlacisOptions): GlacisLayout;
export function drawText(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string, x: number, y: number, opts?: GlacisOptions,
): GlacisLayout;
export function shapes(text: string, opts?: GlacisOptions): GlacisShape[];
export function supports(text: string): boolean;
