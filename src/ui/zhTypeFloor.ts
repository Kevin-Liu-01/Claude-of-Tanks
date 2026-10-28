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
  '.nv .nav-label', '.cot-locale-options span', '.cot-battle-mode span', '.cot-multiplayer-entry span',
  '.cot-sidebar-section-title span',
  "body[data-cot-width='phone'][data-cot-orientation='portrait'] .cot-garage .cot-performance-section .cot-stat-title>span",
  '.cot-garage .sub>span', '.cot-garage .srow .lr>span', "body[data-cot-panels='persistent'] .cot-garage .srow .lr>span",
  '.cot-garage .eqslot .sl', '.cot-action>span',
  '.cot-technical-figure figcaption', '.cot-technical-expand-label', '.cot-technical-gallery span',
  // Deploy
  '.cot-settings .cot-time-name', '.cot-battle-menu .cot-battle-times legend', '.cot-nation-field span',
  // settings
  '.cot-set-group', '.cot-set-colhdr span', '.lb .cot-setting-label-text', '.cot-set-btn',
  // service record
  '.cot-service-record .cot-record-stat-label', '.cot-record-metric small', '.cot-record-card-head small',
  '.cot-record-card-head strong', '.cot-record-reason small', '.cot-record-reason strong', '.cot-record-plate small',
  '.cot-service-record .cot-record-tab', "body[data-cot-width='phone'] .cot-modal__subtitle",
  // mission brief
  '.cot-brief .kicker', '.cot-brief .objectives', '.cot-brief .enemy',
];

/** The public navigation every public page shares. */
const PUBLIC_NAV: readonly string[] = [
  '.public-nav__links a', '.public-nav__lang a', '.public-footer__links a', '.public-footer__credit',
];

/** The field manual's overview and topic pages (src/docs/docs.css). */
const DOCS: readonly string[] = [
  ...PUBLIC_NAV,
  '.docs-hero-actions a', '.docs-evidence dt',
  '.docs-evidence dd', '.kicker', '.docs-chapters-heading>p', '.docs-chapter-grid span', '.docs-chapter-grid strong', '.toc-head',
  '.docs-toc a', '.docs-toc a span', '.toc-footer',
  '.aside-card p:first-child', '.aside-card strong', '.aside-card p:last-child', '.aside-card-kicker',
  '.aside-card-action', '.dm-side a', '.dm-grp', '.dm-crumb', '.dm-meta', '.dm-banner__cap', '.dm-toc a', '.topic-figure figcaption',
  '.footer-links a', '.footer-mark',
];

/** The landing page (src/presentation/home.css). */
const HOME: readonly string[] = [
  ...PUBLIC_NAV,
  '.btn', '.hero__stats li', '.press__stats dt', '.v5-social-card__identity small', '.v5-social-metrics',
  '.press__date',
];

/** The 404 page (src/presentation/notFound.css): the search hits' chapter line (12 px); its other labels are 14 px and up. */
const NOT_FOUND: readonly string[] = [...PUBLIC_NAV, '.nf-hit small'];

const ROUTES: Readonly<Record<string, readonly string[]>> = {
  game: SHELL,
  studio: SHELL,
  home: HOME,
  notFound: NOT_FOUND,
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
  return `${tokens}${floor}`;
}

/** The block a zh-CN document's head carries. */
export function zhTypeFloorStyle(routeId: string): string {
  // In the surfaces layer with the rules it lifts (src/ui/styleLayers.ts), so specificity still decides between them.
  return `<style id="cot-zh-type">${LAYER_ORDER}@layer surfaces{${zhTypeFloorCss(routeId)}}</style>`;
}
