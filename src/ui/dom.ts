import type { IconId } from './icons/icon.ts';
import type { DatumKey } from './surfaceRegistry.ts';
import { uiIconSVG } from './uiIcons.ts';

/** Create an element, optionally assign its class and append it to a parent. */
export function createElement<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className = '',
  parent: ParentNode | null = null,
): HTMLElementTagNameMap[Tag] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (parent) parent.appendChild(element);
  return element;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for an HTML template string: player names and host event fields are peer-chosen, never markup. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]!);
}

// The surface registry's helpers (src/ui/surfaceRegistry.ts, UI-LOCKDOWN part B). They live here, beside the DOM helpers
// the battle and menu surfaces already load, so the registry's table stays out of the bundle (only its census reads it)
// and the helpers cost no request of their own.

/** The glyph that stands for each datum that has one. */
export const DATUM_GLYPHS = Object.freeze({ link: 'signal', clock: 'clock' } as const satisfies Readonly<Record<string, IconId>>);

/** The attribute for a datum's element in markup: `<b class="tm num"${datumAttr('clock')}>`. */
export function datumAttr(key: DatumKey): string {
  return ` data-datum="${key}"`;
}

/** Marks a built element as a datum's readout (through setAttribute where a receipt's stand-in element has no dataset). */
export function markDatum<T extends HTMLElement | SVGElement>(element: T, key: DatumKey): T {
  if (element.dataset) element.dataset.datum = key;
  else element.setAttribute('data-datum', key);
  return element;
}

/** The datum's glyph, the one way to place it. */
export function datumGlyph(key: keyof typeof DATUM_GLYPHS, size: number, color?: string, className?: string): string {
  return uiIconSVG(DATUM_GLYPHS[key], size, color, className);
}
