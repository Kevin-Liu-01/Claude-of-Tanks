/**
 * canvasText.ts — a canvas's words and figures as DOM text over it (UI-LOCKDOWN A). Copyright © 2026 Kevin B. Liu.
 *
 * UI text is DOM, never canvas text: the kit's type, i18n, the zh floor and assistive tech all reach a span, and none
 * reaches a glyph painted into a bitmap. A canvas keeps its graphics and measures its words as before (ctx.measureText
 * lays out its readouts); where it drew a run with fillText it places one here instead, at the same anchor, in the same
 * font, ink, alignment, baseline, alpha and halo:
 * - a run is a span in a layer over the canvas (inset 0, no input), left where the run's alignment puts it and its top the
 *   anchor less the font's ascent for that baseline, its line box the font's ascent + descent (so the span's baseline is
 *   the canvas's to the font's own metrics);
 * - a halo (the canvas's strokeText under the fill) is -webkit-text-stroke at the same width, painted under the fill;
 * - a repaint is begin(), the runs it places, end(): a run not placed again hides; a run writes only what changed (text,
 *   font, place, ink, alpha, halo), and its metrics are measured once per text and font (and again when a font loads).
 * src/ui/uiCanvasCensus.selftest.mjs pins the canvas text left anywhere else; the readouts' data-datum marks go on
 * their runs (run()).
 */
import { createElement as el } from './dom.ts';
import { ensureStyle } from './styleLayers.ts';
import { scratchCanvas } from './uiCanvas.ts';

/** How one run is set (a caller keeps one and rewrites its fields: nothing allocates per run). */
export interface CanvasTextStyle {
  font: string;
  color: string;
  align: CanvasTextAlign;
  baseline: CanvasTextBaseline;
  alpha: number;
  /** The halo's width in px (a dark stroke under the glyphs), 0 for none, and its ink. */
  haloWidth: number;
  halo: string;
}

/** A placed run as the canvas would have drawn it (receipts read these in the canvas's terms). */
export interface CanvasTextRecord {
  text: string;
  x: number;
  y: number;
  font: string;
  align: CanvasTextAlign;
  baseline: CanvasTextBaseline;
  color: string;
  alpha: number;
}

export interface CanvasText {
  readonly root: HTMLElement;
  /** A repaint begins: every run is unplaced until placed again. */
  begin(): void;
  /** Place run `slot`: `text` at the canvas anchor (x, y) in CSS px, set as `style` says. */
  place(slot: number, text: string, x: number, y: number, style: Readonly<CanvasTextStyle>): void;
  /** Place run `slot` as `ctx` would draw it now (its font, align, baseline, fillStyle, globalAlpha; with a halo of
   *  `haloWidth` in its strokeStyle). */
  placeAs(slot: number, text: string, x: number, y: number, ctx: CanvasRenderingContext2D, haloWidth?: number): void;
  /** The repaint ends: runs not placed hide. */
  end(): void;
  /** Hide every run (the canvas is hidden or cleared). */
  clear(): void;
  /** Run `slot`'s element (made on first use), to mark it as a datum's readout. */
  run(slot: number): HTMLElement;
  /** The runs the last repaint placed. */
  placed(): readonly CanvasTextRecord[];
}

const CSS = `.cot-ctext{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.cot-ctext>span{position:absolute;left:0;top:0;white-space:pre;paint-order:stroke fill}`;

interface Run {
  readonly el: HTMLElement;
  readonly record: CanvasTextRecord;
  used: boolean;
  shown: boolean;
  text: string;
  font: string;
  baseline: string;
  align: string;
  epoch: number;
  width: number;
  ascent: number;
  descent: number;
  left: number;
  top: number;
  color: string;
  alpha: number;
  halo: string;
  haloWidth: number;
}

let measurer: CanvasRenderingContext2D | null = null;
/** Bumped when a font finishes loading: a run measured against a fallback face measures again. */
let fontEpoch = 0;
let fontsWatched = false;

function measuring(): CanvasRenderingContext2D | null {
  if (!measurer) measurer = scratchCanvas(1, 1).getContext('2d');
  if (!fontsWatched && typeof document !== 'undefined') {
    fontsWatched = true;
    document.fonts?.addEventListener?.('loadingdone', () => { fontEpoch++; });
  }
  return measurer;
}

const alignShare = (align: string): number => (align === 'center' ? 0.5 : align === 'right' || align === 'end' ? 1 : 0);

/** A text layer for the canvas under `parent` (appended there, over the canvas when it follows it). */
export function createCanvasText(parent: Element, className: string): CanvasText {
  ensureStyle('cot-canvas-text-style', CSS, 'components');
  const root = el('div', className ? `cot-ctext ${className}` : 'cot-ctext', parent);
  const runs: Run[] = [];
  const last: CanvasTextRecord[] = [];
  const scratch: CanvasTextStyle = { font: '', color: '', align: 'left', baseline: 'alphabetic', alpha: 1, haloWidth: 0, halo: '' };

  function runAt(slot: number): Run {
    let run = runs[slot];
    if (run) return run;
    const span = el('span', '', root);
    span.style.display = 'none';
    run = {
      el: span, used: false, shown: false, text: '', font: '', baseline: '', align: '', epoch: -1,
      width: 0, ascent: 0, descent: 0, left: NaN, top: NaN, color: '', alpha: 1, halo: '', haloWidth: 0,
      record: { text: '', x: 0, y: 0, font: '', align: 'left', baseline: 'alphabetic', color: '', alpha: 1 },
    };
    runs[slot] = run;
    return run;
  }

  function place(slot: number, text: string, x: number, y: number, style: Readonly<CanvasTextStyle>): void {
    const run = runAt(slot);
    const span = run.el;
    run.used = true;
    if (text !== run.text) { run.text = text; span.textContent = text; run.epoch = -1; }
    if (style.font !== run.font) {
      run.font = style.font;
      span.style.font = style.font; // (resets line-height: written again below)
      run.epoch = -1;
      run.ascent = -1;
    }
    if (style.baseline !== run.baseline || style.align !== run.align) {
      run.baseline = style.baseline;
      run.align = style.align;
      run.epoch = -1;
    }
    if (run.epoch !== fontEpoch) {
      const ctx = measuring();
      let ascent = 0, descent = 0, width = 0;
      if (ctx) {
        ctx.font = style.font;
        ctx.textBaseline = style.baseline;
        const m = ctx.measureText(text);
        width = m.width;
        ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent ?? 0;
        descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent ?? 0;
      }
      run.epoch = fontEpoch;
      run.width = width;
      if (ascent !== run.ascent || descent !== run.descent || span.style.lineHeight === '') {
        run.ascent = ascent;
        run.descent = descent;
        span.style.lineHeight = `${ascent + descent}px`;
      }
    }
    const left = x - run.width * alignShare(style.align);
    const top = y - run.ascent;
    if (!(Math.abs(left - run.left) <= 0.01 && Math.abs(top - run.top) <= 0.01)) { // (NaN before the first placement)
      run.left = left;
      run.top = top;
      span.style.transform = `translate(${left.toFixed(2)}px,${top.toFixed(2)}px)`;
    }
    if (style.color !== run.color) { run.color = style.color; span.style.color = style.color; }
    if (style.alpha !== run.alpha) { run.alpha = style.alpha; span.style.opacity = style.alpha < 1 ? String(style.alpha) : ''; }
    if (style.haloWidth !== run.haloWidth || style.halo !== run.halo) {
      run.haloWidth = style.haloWidth;
      run.halo = style.halo;
      span.style.setProperty('-webkit-text-stroke', style.haloWidth > 0 ? `${style.haloWidth}px ${style.halo}` : '');
    }
    if (!run.shown) { run.shown = true; span.style.display = ''; }
    const record = run.record;
    record.text = text; record.x = x; record.y = y; record.font = style.font; record.align = style.align;
    record.baseline = style.baseline; record.color = style.color; record.alpha = style.alpha;
  }

  function hide(run: Run): void {
    if (!run.shown) return;
    run.shown = false;
    run.el.style.display = 'none';
  }

  return {
    root,
    begin() {
      for (const run of runs) if (run) run.used = false;
    },
    place,
    placeAs(slot, text, x, y, ctx, haloWidth = 0) {
      scratch.font = ctx.font;
      scratch.color = String(ctx.fillStyle);
      scratch.align = ctx.textAlign;
      scratch.baseline = ctx.textBaseline;
      scratch.alpha = ctx.globalAlpha;
      scratch.haloWidth = haloWidth;
      scratch.halo = haloWidth > 0 ? String(ctx.strokeStyle) : '';
      place(slot, text, x, y, scratch);
    },
    end() {
      last.length = 0;
      for (const run of runs) {
        if (!run) continue;
        if (run.used) last.push(run.record);
        else hide(run);
      }
    },
    clear() {
      last.length = 0;
      for (const run of runs) if (run) { run.used = false; hide(run); }
    },
    run: (slot) => runAt(slot).el,
    placed: () => last,
  };
}
