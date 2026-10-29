import type { RuntimeValue } from '../runtimeTypes.ts';
import { installResponsiveLayout } from '../ui/responsiveLayout.ts';
import { closeSurface, openSurface, type TransientSurface } from '../ui/components/surfaceStack.ts';
import { importWhenOnline } from '../ui/components/loadFailure.ts';
import { bindStaticI18nAuto } from './staticI18n.ts';
import { getLocale, setLocale, t } from '../ui/i18n.ts';
import {
  currentLocationHrefForLocale,
  hrefForLocale,
  localizeDocumentLinks,
  synchronizeLocaleRoute,
  type SupportedLocale,
} from '../ui/localeRouting.ts';

// The public shell's behaviour (brand-ui BUI-W1). The bar and its menu sheet are static markup
// (src/presentation/publicShell.ts writes them into every public entry), so they paint before this module runs; it
// only localizes links, wires the language links and the phone menu sheet, marks the scrolled bar and mounts the
// deferred GitHub star count.

installResponsiveLayout();
/** True when the page is moving to its other-locale route (the rest of the page then stands down). */
export const localeRouteChanged = synchronizeLocaleRoute(getLocale());
if (!localeRouteChanged) {
  bindStaticI18nAuto();
  localizeDocumentLinks(document, getLocale());
}

// (a count whose module did not arrive stands down as one that did not load: githubStars.ts's 'unavailable' state)
const mountStars = (): Promise<RuntimeValue> => import('../ui/githubStars.ts')
  .then(({ mountGitHubStars }) => mountGitHubStars(document))
  .catch(() => document.querySelectorAll<HTMLElement>('[data-github-stars]').forEach((node) => {
    node.dataset.githubStarsState = 'unavailable';
    node.removeAttribute('aria-busy');
  }));

const isLocale = (value: string | null): value is SupportedLocale => value === 'en-US' || value === 'zh-CN';

/** Language links: each names this page in its locale (a template page learns its own path here) and keeps the choice. */
function mountLanguageLinks(): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[hreflang]')) {
    const locale = link.getAttribute('hreflang');
    if (!isLocale(locale)) continue;
    link.href = currentLocationHrefForLocale(window.location, locale);
    link.addEventListener('click', () => setLocale(locale));
  }
}

/** The phone and tablet menu sheet: the trigger opens it; Escape, a press outside it, a link or a desktop layout closes it. */
function mountMenuSheet(): void {
  const trigger = document.querySelector<HTMLButtonElement>('.public-nav__menu-trigger');
  const menu = document.getElementById('public-nav-menu');
  if (!trigger || !menu) return;
  // a transient surface (src/ui/components/surfaceStack.ts): opening it closes an open menu (the Gallery's rival), opening
  // another closes it, and Escape and a press outside it are the stack's
  const surface: TransientSurface = {
    id: 'public-nav-menu',
    element: () => menu,
    owns: (node) => trigger.contains(node),
    close: (reason) => set(false, reason === 'escape'),
  };
  const set = (open: boolean, restoreFocus = false): void => {
    if (open) openSurface(surface, trigger); else closeSurface(surface);
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    trigger.setAttribute('aria-label', t(open ? 'publicNav.closeMenu' : 'publicNav.openMenu'));
    if (!open && restoreFocus) trigger.focus();
    // the focus moves into the sheet it opened, on its first destination
    if (open) menu.querySelector<HTMLElement>('a[href], button')?.focus({ preventScroll: true });
  };
  trigger.addEventListener('click', () => set(Boolean(menu.hidden)));
  menu.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a')) set(false);
  });
  matchMedia('(width >= 1100px)').addEventListener('change', (event) => { if (event.matches) set(false); });
}

/** The bar knows when the page has scrolled (the landing floats it over its hero until then). */
function mountScrolledState(): void {
  const nav = document.querySelector<HTMLElement>('.public-nav');
  if (!nav) return;
  let frame = 0;
  const update = (): void => {
    frame = 0;
    nav.toggleAttribute('data-scrolled', window.scrollY > 8);
  };
  window.addEventListener('scroll', () => { frame ||= requestAnimationFrame(update); }, { passive: true });
  update();
}

/**
 * Pictograms: the static `svg.cot-i` marks reference the page's inline symbol block; a page whose markup names a glyph
 * that block lacks, or holds `[data-ui-icon]` slots, loads the shared sprite and icon set lazily, off the critical path.
 */
function hydrateIcons(root: ParentNode): void {
  const slots = [...root.querySelectorAll<HTMLElement>('[data-ui-icon]')];
  const missing = [...root.querySelectorAll('svg.cot-i use')].some((use) => {
    const ref = use.getAttribute('href') || '';
    return ref.startsWith('#') && !document.getElementById(ref.slice(1));
  });
  if (!slots.length && !missing) return;
  // (a set that did not arrive leaves the slots empty: its chunk is not asked for again in this document)
  importWhenOnline(() => import('../ui/uiIcons.ts').then(({ uiIconSVG }) => {
    for (const slot of slots) slot.innerHTML = uiIconSVG(slot.dataset.uiIcon || '', 24);
  }));
}

hydrateIcons(document);
mountLanguageLinks();
mountMenuSheet();
mountScrolledState();

// Docs topics and other public modules render some anchors after this module. Update the clicked anchor during
// capture so late content cannot leak back to an unprefixed English route (a language link names its own locale).
document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const anchor = event.target.closest<HTMLAnchorElement>('a[href]');
  if (!anchor || anchor.hasAttribute('hreflang')) return;
  const href = anchor.getAttribute('href');
  if (!href) return;
  const localized = hrefForLocale(href, getLocale());
  if (localized !== href) anchor.setAttribute('href', localized);
}, { capture: true });

window.setTimeout(() => {
  if ('requestIdleCallback' in window) requestIdleCallback(mountStars, { timeout: 2500 });
  else mountStars();
}, 2400);

// the kit's hover tip and the mark's roll act only on a hover: they load once the page is idle, off its first load (and
// once: a page without them works)
const behaviours = (): void => importWhenOnline(() => import('../ui/components/pageBehaviours.ts')
  .then(({ installPageBehaviours }) => installPageBehaviours()));
if ('requestIdleCallback' in window) requestIdleCallback(behaviours, { timeout: 1500 });
else setTimeout(behaviours, 300);
