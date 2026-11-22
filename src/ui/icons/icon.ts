// The one icon component (brand-ui SPEC section 7). Copyright © 2026 Kevin B. Liu.
//
// Every glyph lives once, as a <symbol> in ./sprite.svg; icon() returns a small host <svg> that references it with
// <use>. The host carries what the glyphs leave out: the viewBox of the optical master (24-unit, or the 16-unit one at
// 18 px and below when the sprite has it), the one stroke per optical size (1.5 / 1.25), square caps, mitre joins and
// currentColor, so a glyph inherits its colour from the text around it.
//
// The sprite mounts on first use: the boot slice (spriteIndex.ts, about a dozen game-bar glyphs) synchronously, the main
// sprite (spriteMain.svg, every glyph a battle can draw) from its own lazy chunk right after, and the garage, gallery,
// Field Manual and camo glyphs (spriteLazy.svg) from a second chunk once the main one is in, into a host of their own.
// Both chunks are generated from ./sprite.svg (tools/gen-icon-sprite.mjs). A <use> rendered before its symbol arrives
// fills in when it does. Node (receipts) never mounts anything and gets the same markup.

import { ACTIVE_MASTERS, BOOT_SYMBOLS, SMALL_MASTERS, type IconId } from './spriteIndex.ts';
import { STYLE_LAYER_ORDER } from '../styleLayers.ts';

export type { IconId };

interface IconOptions {
  /** Rendered square size in CSS px (default 24). At 18 px and below the 16-unit optical master is used when drawn. */
  readonly size?: number;
  /** Accessible name. Without one the icon is decorative (aria-hidden), which is right next to visible text. */
  readonly label?: string;
  readonly className?: string;
  /** A CSS colour for the glyph; by default it inherits the surrounding text colour. */
  readonly color?: string;
  /** The filled active state; only the navigation and mode glyphs are drawn for it (others ignore it). */
  readonly active?: boolean;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const SMALL_MAX_PX = 18;
const SPRITE_ID = 'cot-icon-sprite';
const LAZY_SPRITE_ID = 'cot-icon-sprite-lazy';
/** Selected states fill the glyphs drawn for it; CSS fill beats the host's fill="none" and inherits into <use>. */
const ACTIVE_CSS = '[aria-pressed=true] .cot-i[data-af],[aria-selected=true] .cot-i[data-af],'
  + '[aria-current=page] .cot-i[data-af],[aria-current=true] .cot-i[data-af],.is-active .cot-i[data-af],'
  + '.cot-i[data-af].is-active{fill:currentColor;fill-rule:evenodd}';

let spriteHost: SVGSVGElement | null = null;
let fullSprite: Promise<void> | null = null;
let lazyHost: SVGSVGElement | null = null;

/** A real DOM to mount into (receipts may stub `document` without SVG support). */
const canMount = (): boolean => typeof document !== 'undefined' && typeof document.createElementNS === 'function';

const escapeAttr = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function attachHost(host: SVGSVGElement | null = spriteHost): void {
  if (!host) return;
  (document.body ?? document.documentElement).append(host);
}

/** A hidden <svg> that holds symbols for <use> to reference. */
function hiddenHost(id: string): SVGSVGElement {
  const host = document.createElementNS(SVG_NS, 'svg');
  host.id = id;
  host.setAttribute('aria-hidden', 'true');
  host.setAttribute('focusable', 'false');
  host.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
  return host;
}

/** The garage, gallery, Field Manual and camo glyphs (spriteLazy.svg), their own chunk in their own host, so the main
 *  sprite's swap-in never drops them. */
function mountLazySymbols(text: string): void {
  const start = text.indexOf('<symbol');
  try {
    lazyHost ??= hiddenHost(LAZY_SPRITE_ID);
    if (start >= 0) lazyHost.innerHTML = text.slice(start, text.lastIndexOf('</svg>'));
    if (!lazyHost.isConnected) attachHost(lazyHost);
  } catch { /* a partial DOM: nothing to mount into */ }
}

/**
 * Mount the sprite into the document (idempotent; a no-op outside a browser). Resolves when both chunks are in (the
 * main sprite, then the lazy one), which capture tools await before a screenshot.
 */
export function mountIconSprite(): Promise<void> {
  if (!canMount()) return Promise.resolve();
  try {
    if (!spriteHost) {
      spriteHost = hiddenHost(SPRITE_ID);
      spriteHost.innerHTML = `<style>${STYLE_LAYER_ORDER}@layer components{${ACTIVE_CSS}}</style>${BOOT_SYMBOLS}`;
    }
    if (!spriteHost.isConnected) attachHost();
    if (lazyHost && !lazyHost.isConnected) attachHost(lazyHost);
  } catch {
    return Promise.resolve(); // a partial DOM (receipt stubs): markup still renders, nothing to mount into
  }
  // The sprite is two Vite chunks; outside Vite (Node receipts with a stub DOM) the boot slice is all there is.
  if (!import.meta.env) return Promise.resolve();
  // (one memo for both chunks, the main sprite's: it is the known site app/lazyChunkSites.selftest.mjs lists, since a
  // sprite every page's boot holds must not pull app/lazyChunk.ts onto the docs, pad and landing pages; mobile-hud-274d.
  // The lazy glyphs follow the main ones, so a capture that awaits this has every glyph; either failing clears it and the
  // next icon asks both again, the main one from the cache)
  fullSprite ??= import('./spriteMain.svg?raw').then(({ default: text }) => {
    const start = text.indexOf('<symbol');
    if (spriteHost && start >= 0) {
      spriteHost.innerHTML = `<style>${STYLE_LAYER_ORDER}@layer components{${ACTIVE_CSS}}</style>${text.slice(start, text.lastIndexOf('</svg>'))}`;
    }
    return import('./spriteLazy.svg?raw');
  }).then(({ default: text }) => mountLazySymbols(text), (error: unknown) => {
    fullSprite = null; // a failed chunk load retries on the next icon
    console.warn('[icons] sprite failed to load', error);
  });
  return fullSprite;
}

/** Markup for one icon: a host <svg> referencing the sprite symbol. Empty for an empty id. */
export function icon(id: IconId, options: IconOptions = {}): string {
  if (!id) return '';
  if (!spriteHost?.isConnected && canMount()) void mountIconSprite();
  const size = options.size ?? 24;
  const small = size <= SMALL_MAX_PX && SMALL_MASTERS.includes(` ${id} `);
  const grid = small ? 16 : 24;
  const fillable = ACTIVE_MASTERS.includes(` ${id} `);
  const filled = fillable && options.active;
  const cls = options.className ? `cot-i ${options.className}` : 'cot-i';
  const a11y = options.label ? ` role="img" aria-label="${escapeAttr(options.label)}"` : ' aria-hidden="true"';
  const color = options.color && options.color !== 'currentColor' ? ` style="color:${escapeAttr(options.color)}"` : '';
  return `<svg class="${cls}" viewBox="0 0 ${grid} ${grid}" width="${size}" height="${size}"${a11y} focusable="false"`
    + ` data-icon="${id}"${fillable ? ' data-af=""' : ''}${color}`
    + ` fill="${filled ? 'currentColor" fill-rule="evenodd' : 'none'}" stroke="currentColor"`
    + ` stroke-width="${small ? 1.25 : 1.5}" stroke-linecap="square" stroke-linejoin="miter">`
    + `<use href="#i-${id}${small ? '-s' : ''}"/></svg>`;
}

/**
 * A glyph placed inside another SVG drawing (an equipment plate, a medallion): a group in the drawing's own units
 * at (x, y), `size` units square, so no nested <svg> is exposed to page CSS. Always the 24-unit master.
 */
export function iconInSvg(id: IconId, x: number, y: number, size: number, color = ''): string {
  if (!id) return '';
  if (!spriteHost?.isConnected && canMount()) void mountIconSprite();
  const scale = +(size / 24).toFixed(4);
  const tint = color && color !== 'currentColor' ? ` color="${escapeAttr(color)}"` : '';
  return `<g transform="translate(${+x.toFixed(2)} ${+y.toFixed(2)}) scale(${scale})" data-icon="${id}"${tint} fill="none"`
    + ' stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter">'
    + `<use href="#i-${id}"/></g>`;
}

if (canMount()) void mountIconSprite();
