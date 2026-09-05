/**
 * staticI18n.ts — apply translations to static HTML markup on public pages.
 *
 * Public pages (`gallery.html`, etc.) ship the visible English text directly
 * in the HTML so the document renders even if the JS bundle fails. This helper
 * walks the document for elements tagged with `data-i18n` (and a few other
 * attribute keys), replaces the visible text/attributes via `t()`, and
 * re-runs whenever the active locale changes.
 *
 * Supported attributes on the host element:
 *   - `data-i18n="some.key"` → `textContent`
 *   - `data-i18n-placeholder="some.key"` → `placeholder`
 *   - `data-i18n-title="some.key"` → `title`
 *   - `data-i18n-aria-label="some.key"` → `aria-label`
 *   - `data-i18n-aria="some.key"` → `aria-label`
 *   - `data-i18n-html="some.key"` → `innerHTML` (use only for vetted copy)
 *
 * Single-quoted placeholders (`{name}`) are interpolated through `t()`'s
 * `vars` map by the same key on the host element via `data-i18n-vars` (JSON).
 */

import { onLocaleChange, t } from '../ui/i18n.ts';

type Attr = 'placeholder' | 'title' | 'aria-label';

const APPLIERS: Array<{ attr: string; mode: 'text' | 'html'; key: (el: HTMLElement) => string | null; }> = [
  { attr: 'data-i18n', mode: 'text', key: (el) => el.dataset.i18n ?? null },
  { attr: 'data-i18n-html', mode: 'html', key: (el) => el.dataset.i18nHtml ?? null },
  { attr: 'data-i18n-placeholder', mode: 'text', key: (el) => el.dataset.i18nPlaceholder ?? null },
  { attr: 'data-i18n-title', mode: 'text', key: (el) => el.dataset.i18nTitle ?? null },
  { attr: 'data-i18n-aria-label', mode: 'text', key: (el) => el.dataset.i18nAriaLabel ?? null },
  { attr: 'data-i18n-aria', mode: 'text', key: (el) => el.dataset.i18nAria ?? null },
];

function varsFor(el: HTMLElement): Record<string, string | number> | undefined {
  const raw = el.dataset.i18nVars;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, string | number>;
  } catch (_) {
    return undefined;
  }
}

function applyToElement(el: HTMLElement): void {
  for (const { mode, key } of APPLIERS) {
    const translationKey = key(el);
    if (!translationKey) continue;
    const value = t(translationKey, varsFor(el));
    if (mode === 'html') el.innerHTML = value;
    else el.textContent = value;
  }
}

export function applyStaticI18n(root: ParentNode = document): void {
  const elements = root.querySelectorAll<HTMLElement>(
    '[data-i18n],[data-i18n-html],[data-i18n-placeholder],[data-i18n-title],[data-i18n-aria-label],[data-i18n-aria]',
  );
  for (const el of elements) applyToElement(el);
}

export function bindStaticI18nAuto(root: ParentNode = document): () => void {
  applyStaticI18n(root);
  return onLocaleChange(() => applyStaticI18n(root));
}
