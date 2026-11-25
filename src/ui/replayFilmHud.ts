/**
 * Include HUD (replay-fixes-277; Kevin 11-24, approved: the film with the HUD optional, off by default): each film frame
 * the 3D frame is composited with the HUD drawn from the live HUD itself, never from copied constants, so the film cannot
 * drift from what the game shows (Main 11-24: "one source"). The HUD is laid out by its own CSS (the layout tokens,
 * battleHudLayout.ts) at the page's size; per frame the overlay reads it as it stands: the minimap's own canvas, every
 * shown element's plate (its computed background and radius) and every text run (its computed font, colour and box), and
 * redraws them at the film's size. A box keeps its edge: one in the left third of the page stays that far from the
 * film's left edge, the right third from its right, the middle from its centre, all scaled by the heights' ratio, so the
 * corners stay in the corners at any aspect. The viewer's controls (the strip, the Watch bar and every button) are not
 * the battle's picture and are left out. Icons drawn as SVG or as CSS masks are left out too, and a plate's clip-path
 * slant is drawn square (v1).
 */
import { scratchCanvas } from './uiCanvas.ts';

/** The viewer's controls and other interactive parts: not drawn into a film. */
const LEFT_OUT = '.cot-replay, .cot-watch, .cot-watch-rail, button, .cot-touch, svg, input, select, textarea';

interface Box { x: number; y: number; w: number; h: number }

/** A page box at the film's size (`vw` x `vh` page, `width` x `height` film), kept to its edge of the screen. */
export function filmBox(box: Box, vw: number, vh: number, width: number, height: number): Box {
  const s = height / Math.max(1, vh);
  const cx = box.x + box.w / 2;
  let x: number;
  if (cx < vw / 3) x = box.x * s;
  else if (cx > (vw * 2) / 3) x = width - (vw - box.x) * s;
  else x = width / 2 + (box.x - vw / 2) * s;
  return { x, y: box.y * s, w: box.w * s, h: box.h * s };
}

const transparent = (color: string): boolean => !color || color === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(color);

/** The compositor exportReplayFilm hands the film session (replayFilm.ts ReplayFilmPorts.overlay). */
export function createReplayFilmHud(root: () => HTMLElement | null) {
  const range = typeof document !== 'undefined' ? document.createRange() : null;

  function drawElement(ctx: CanvasRenderingContext2D, el: Element, vw: number, vh: number, width: number, height: number, s: number): void {
    if (el.matches(LEFT_OUT)) return;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return;
    const rect = el.getBoundingClientRect();
    // a screen reader's label (clipped to nothing) and a masked glyph (a silhouette or icon drawn as a CSS mask, which a
    // plain fill would draw as a block) are not drawn
    if ((rect.width <= 2 && rect.height <= 2) || (style.clip && style.clip !== 'auto')
      || /inset\(50%\)/.test(style.clipPath)) return;
    const masked = (style.maskImage && style.maskImage !== 'none') || ((style as unknown as { webkitMaskImage?: string }).webkitMaskImage ?? 'none') !== 'none';
    if (masked) return;
    const alpha = Number(style.opacity);
    if (rect.width > 0 && rect.height > 0) {
      const box = filmBox({ x: rect.left, y: rect.top, w: rect.width, h: rect.height }, vw, vh, width, height);
      ctx.globalAlpha = alpha;
      if (el instanceof HTMLCanvasElement) {
        if (el.width > 0 && el.height > 0) ctx.drawImage(el, box.x, box.y, box.w, box.h);
      } else if (el instanceof HTMLImageElement) {
        if (el.complete && el.naturalWidth > 0) ctx.drawImage(el, box.x, box.y, box.w, box.h);
      } else if (!transparent(style.backgroundColor)) {
        ctx.fillStyle = style.backgroundColor;
        const radius = Math.min(box.w, box.h) / 2, r = Math.min(radius, (parseFloat(style.borderTopLeftRadius) || 0) * s);
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(box.x, box.y, box.w, box.h, r);
        else ctx.rect(box.x, box.y, box.w, box.h);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    for (const child of el.childNodes) {
      if (child.nodeType === 3) drawText(ctx, child as Text, style, alpha, vw, vh, width, height, s);
      else if (child.nodeType === 1) drawElement(ctx, child as Element, vw, vh, width, height, s);
    }
  }

  function drawText(ctx: CanvasRenderingContext2D, node: Text, style: CSSStyleDeclaration, alpha: number,
    vw: number, vh: number, width: number, height: number, s: number): void {
    const raw = node.data;
    if (!raw || !raw.trim() || !range) return;
    const text = style.textTransform === 'uppercase' ? raw.trim().toUpperCase() : style.textTransform === 'lowercase' ? raw.trim().toLowerCase() : raw.trim();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return;
    const box = filmBox({ x: rect.left, y: rect.top, w: rect.width, h: rect.height }, vw, vh, width, height);
    const size = (parseFloat(style.fontSize) || 12) * s;
    ctx.globalAlpha = alpha;
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
    ctx.fillStyle = style.color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const spacing = parseFloat(style.letterSpacing);
    if (Number.isFinite(spacing) && 'letterSpacing' in ctx) (ctx as { letterSpacing: string }).letterSpacing = `${spacing * s}px`;
    ctx.fillText(text, box.x, box.y + box.h / 2, Math.max(1, box.w * 1.05));
    if ('letterSpacing' in ctx) (ctx as { letterSpacing: string }).letterSpacing = '0px';
    ctx.globalAlpha = 1;
  }

  return {
    makeCanvas: (width: number, height: number) => scratchCanvas(width, height),
    /** One film frame: the 3D frame, then the HUD as it stands, at the film's size. */
    overlay(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, width: number, height: number): void {
      ctx.globalAlpha = 1;
      ctx.drawImage(source, 0, 0, width, height);
      const hud = root();
      if (!hud) return;
      const vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
      drawElement(ctx, hud, vw, vh, width, height, height / vh);
    },
  };
}
