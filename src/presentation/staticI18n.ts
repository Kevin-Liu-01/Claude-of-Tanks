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
 *   - `data-i18n-alt="some.key"` → `alt`
 *   - `data-i18n-aria-label="some.key"` → `aria-label`
 *   - `data-i18n-aria="some.key"` → `aria-label`
 *   - `data-i18n-html="some.key"` → `innerHTML` (use only for vetted copy)
 *
 * Single-quoted placeholders (`{name}`) are interpolated through `t()`'s
 * `vars` map by the same key on the host element via `data-i18n-vars` (JSON).
 */

import { onLocaleChange, t } from '../ui/i18n.ts';

/** Host attribute (its dataset name) and what it sets: `0` the text, `1` vetted HTML, else the named attribute. */
const HOSTS: readonly (readonly [string, 0 | 1 | string])[] = [
  ['i18n', 0], ['i18nHtml', 1], ['i18nPlaceholder', 'placeholder'], ['i18nTitle', 'title'], ['i18nAlt', 'alt'],
  ['i18nAriaLabel', 'aria-label'], ['i18nAria', 'aria-label'],
];
const SELECTOR = HOSTS.map(([name]) => `[data-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`).join();

function varsFor(el: HTMLElement): Record<string, string | number> | undefined {
  try {
    return el.dataset.i18nVars ? JSON.parse(el.dataset.i18nVars) as Record<string, string | number> : undefined;
  } catch (_) {
    return undefined;
  }
}

function applyToElement(el: HTMLElement): void {
  for (const [name, target] of HOSTS) {
    const key = el.dataset[name];
    if (!key) continue;
    const value = t(key, varsFor(el));
    if (target === 0) el.textContent = value;
    else if (target === 1) el.innerHTML = value;
    else el.setAttribute(target, value);
  }
}

function applyStaticI18n(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>(SELECTOR)) applyToElement(el);
}

export function bindStaticI18nAuto(root: ParentNode = document): () => void {
  applyStaticI18n(root);
  return onLocaleChange(() => applyStaticI18n(root));
}
