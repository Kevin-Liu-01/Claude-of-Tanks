/**
 * The zh-CN label floor (the type rules: Chinese labels go one step up, 13 px floor). Copyright © 2026 Kevin B. Liu.
 *
 * Chinese glyphs fill the em box and carry far more strokes than Latin capitals, so the 11-12 px caps labels that read
 * cleanly in English turn into blots in Chinese. Every Chinese view is a `/cn/` document (src/ui/localeBootstrap.ts sends
 * a saved or browser-chosen Chinese locale there before the Garage starts), so this block ships only inside those
 * documents: localizeHtmlDocument (src/presentation/localizedHtml.ts) adds it to a zh-CN document's head, English
 * documents carry none of it, and the game entry gains no bytes. Each list names the label elements of one route's
 * screens that a Chinese string fills below 13 px; one rule per route lifts them to 13 px. Each selector is the base
 * rule's own selector, so `:lang(zh)` adds one class of specificity over it; a matched-styles probe checked that no listed
 * element is larger than 13 px at any captured viewport (the floor never shrinks a label).
 * The type scale's label tokens step up the same way, for surfaces built on `--fs-11` / `--fs-12`.
 * Keep this module dependency-free: the build's document transform imports it.
 */

/** styleLayers.ts STYLE_LAYER_ORDER, repeated so this module stays dependency-free (styleLayers.selftest pins it). */
const LAYER_ORDER = '@layer reset,tokens,base,components,surfaces,utilities,overrides;';

/** The Garage, Deploy, settings, service record and mission brief (the game document and the Studio's). */
const SHELL: readonly string[] = [
  // game bar and garage
  '.nv .nav-label', '.cot-locale-options span', '.cot-battle-mode span', '.cot-multiplayer-entry span', '.cot-garage .hint',
  '.cot-garage-variant-trigger-copy strong', '.cot-garage-variant-trigger-copy small span', '.cot-garage-variant-action span',
  '.cot-sidebar-section-title span',
  "body[data-cot-width='phone'][data-cot-orientation='portrait'] .cot-garage .cot-performance-section .cot-stat-title>span",
  '.cot-map-card .mname', '.cot-camo-tag span', '.cot-camo-collection', '.cot-camo-card .cl',
  '.cot-garage .sub>span', '.cot-garage .srow .lr>span', "body[data-cot-panels='persistent'] .cot-garage .srow .lr>span",
  '.cot-garage .eqslot .sl', '.cot-system-control>span',
  '.cot-technical-figure figcaption', '.cot-technical-expand-label', '.cot-technical-gallery span',
  // Deploy
  '.cot-battle-choice .choice-name', '.cot-battle-choice .choice-description', '.cot-sides-choice', '.cot-time-name',
  '.cot-battle-menu .cot-battle-times legend', '.cot-battle-menu .cot-battle-times small', '.cot-nation-field span',
  '.cot-custom-select-copy', '.cot-battle-preview small', '.cot-battle-preview p', '.cot-battle-menu-foot>span',
  '.cot-battle-menu-foot button',
  // settings
  '.cot-set-group', '.cot-set-colhdr span', '.lb .cot-setting-label-text', '.cot-set-btn', '.cot-set-btn.resume',
  // service record
  '.cot-service-record .cot-record-stat-label', '.cot-record-metric small', '.cot-record-chip small', '.cot-record-card-head small',
  '.cot-record-card-head strong', '.cot-record-reason small', '.cot-record-reason strong', '.cot-record-footnote',
  '.cot-modal-root.cot-service-record .cot-modal__button', "body[data-cot-width='phone'] .cot-modal__subtitle",
  // mission brief
  '.cot-brief .kicker', '.cot-brief .objectives', '.cot-brief .enemy',
];

/** The public navigation every public page shares. */
const PUBLIC_NAV: readonly string[] = [
  '.public-nav__links a', "body[data-cot-panels='overlay'] .public-nav__links a", "body[data-cot-width='phone'] .public-nav__links a",
  '.public-nav__links .public-nav__menu a', '.public-nav__locale', "body[data-cot-width='phone'] .public-nav__locale",
];

/** The field manual's overview and topic pages (src/docs/docs.css). */
const DOCS: readonly string[] = [
  ...PUBLIC_NAV,
  '.docs-hero-actions a', '.docs-hero-route', '.doc-hero-reel figcaption', '.doc-hero-reel figcaption strong', '.docs-evidence dt',
  '.docs-evidence dd', '.kicker', '.docs-chapters-heading>p', '.docs-chapter-grid span', '.docs-chapter-grid strong', '.toc-head',
  '.docs-toc a', '.docs-toc a span', '.toc-footer', '.section-index', '.callout', '.callout strong', '.principle p',
  '.aside-card p:first-child', '.aside-card strong', '.aside-card p:last-child', '.aside-card-kicker', '.aside-card-copy',
  '.aside-card-action', '.topic-nav a', '.topic-section-map strong', '.topic-figure figcaption', '.topic-layout>aside p',
  '.topic-layout>aside>span:not(.topic-aside-icon)', '.topic-layout>aside a', '.footer-links a', '.footer-mark',
];

/** The landing page (src/presentation/home.css). */
const HOME: readonly string[] = [
  ...PUBLIC_NAV,
  '.btn', '.v5-maker', '.v5-social-proof__signals dt', '.v5-social-card__identity em', '.v5-social-proof__reddit>header small',
  '.v5-social-proof__reddit>header p', '.v5-social-proof__snapshot',
];

/** The 404 page (src/presentation/notFound.css). */
const NOT_FOUND: readonly string[] = [...PUBLIC_NAV, '.not-found__actions a'];

const ROUTES: Readonly<Record<string, readonly string[]>> = {
  game: SHELL,
  studio: SHELL,
  home: HOME,
  notFound: NOT_FOUND,
};

/**
 * Where a lifted label sits in a fixed-height card, the card keeps its height: the label takes back the leading the
 * larger size added (one line of Chinese needs no Latin descender room). The battlefield cards' names stay inside the
 * panel at 1440x900 as the English ones do.
 */
const LEADING: Readonly<Record<string, string>> = {
  game: ':lang(zh) .cot-map-card .mname{line-height:1;margin-top:2px}',
  studio: ':lang(zh) .cot-map-card .mname{line-height:1;margin-top:2px}',
};

/** The label selectors a route's Chinese document lifts (docs topics share the overview's list). */
export function zhTypeFloorSelectors(routeId: string): readonly string[] {
  return ROUTES[routeId] ?? (routeId.startsWith('docs') ? DOCS : PUBLIC_NAV);
}

/** The zh-CN floor rules a route's Chinese document carries (an empty string when it has none). */
export function zhTypeFloorCss(routeId: string): string {
  const selectors = zhTypeFloorSelectors(routeId);
  const tokens = ':root:lang(zh-CN){--fs-11:calc(13px*var(--cot-type-scale,1));--fs-12:calc(13px*var(--cot-type-scale,1))}';
  // A selector list, not :is(): each entry keeps its own base specificity plus the one class :lang() adds.
  const floor = selectors.length ? `\n${selectors.map((selector) => `:lang(zh) ${selector}`).join(',')}{font-size:13px}` : '';
  return `${tokens}${floor}${LEADING[routeId] ? `\n${LEADING[routeId]}` : ''}`;
}

/** The block a zh-CN document's head carries. */
export function zhTypeFloorStyle(routeId: string): string {
  // In the surfaces layer with the rules it lifts (src/ui/styleLayers.ts), so specificity still decides between them.
  return `<style id="cot-zh-type">${LAYER_ORDER}@layer surfaces{${zhTypeFloorCss(routeId)}}</style>`;
}
