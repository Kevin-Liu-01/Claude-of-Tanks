import type { RuntimeValue } from '../runtimeTypes.ts';
import { installResponsiveLayout } from '../ui/responsiveLayout.ts';
import { localeSwitchMarkup, MENU_TRIGGER_MARKUP } from './publicNavChrome.ts';
import { bindStaticI18nAuto } from './staticI18n.ts';
import { getLocale, setLocale, t } from '../ui/i18n.ts';
import {
  currentLocationHrefForLocale,
  hrefForLocale,
  localizeDocumentLinks,
  resolveLocalePath,
  synchronizeLocaleRoute,
} from '../ui/localeRouting.ts';

installResponsiveLayout();
const localeRouteChanged = synchronizeLocaleRoute(getLocale());
if (!localeRouteChanged) {
  bindStaticI18nAuto();
  localizeDocumentLinks(document, getLocale());
}

const mountStars = (): Promise<RuntimeValue> => import('../ui/githubStars.ts')
  .then(({ mountGitHubStars }) => mountGitHubStars(document));

function mountLocaleSwitcher(): void {
  const links = document.querySelector<HTMLElement>('.public-nav__links');
  if (!links || links.querySelector('.public-nav__locale-credit')) return;

  const current = getLocale();
  const next = current === 'zh-CN' ? 'en-US' : 'zh-CN';
  // The build writes the switch into the bar (tools/viteNavChrome.ts); a page without it gets it here.
  if (!links.querySelector('.public-nav__locale')) {
    links.insertBefore(document.createRange().createContextualFragment(localeSwitchMarkup(current)),
      links.querySelector('.public-nav__github, .public-nav__cta'));
  }
  const wrapper = links.querySelector<HTMLElement>('.public-nav__locale-wrap');
  const button = links.querySelector<HTMLButtonElement>('.public-nav__locale');
  if (!wrapper || !button) return;
  button.dataset.locale = current;
  button.setAttribute('aria-label', t(next === 'zh-CN'
    ? 'publicNav.language.switchToChinese'
    : 'publicNav.language.switchToEnglish'));
  button.title = button.getAttribute('aria-label') || '';
  for (const option of button.querySelectorAll<HTMLElement>('[data-locale-option]')) {
    option.classList.toggle('is-current', option.dataset.localeOption === current);
  }
  button.addEventListener('click', () => {
    setLocale(next);
    window.location.assign(currentLocationHrefForLocale(window.location, next));
  });

  const credit = document.createElement('a');
  credit.className = 'public-nav__locale-credit';
  credit.href = 'https://generaltranslation.com/';
  credit.target = '_blank';
  credit.rel = 'noreferrer';
  credit.setAttribute('aria-label', `${t('publicNav.language.creditEyebrow')} ${t('publicNav.language.creditName')}`);
  credit.innerHTML =
    '<img src="/brand/partners/general-translation.png" alt="" draggable="false">' +
    `<span><small>${t('publicNav.language.creditEyebrow')}</small>` +
    `<strong>${t('publicNav.language.creditName')}</strong></span>`;
  wrapper.append(credit);
}

function mountMobileNavigation(): void {
  const links = document.querySelector<HTMLElement>('.public-nav__links');
  if (!links || links.querySelector('.public-nav__menu')) return;

  const directLinks = [...links.children].filter((node) => node.matches?.('a'));
  const pageLinks = directLinks.filter((node) =>
    !node.classList.contains('public-nav__github') && !node.classList.contains('public-nav__cta'));
  const home = pageLinks.find((node) =>
    resolveLocalePath(node.getAttribute('href') || '').pathname === '/home');

  // The build writes the button into the bar (tools/viteNavChrome.ts); a page without it gets it here.
  if (!links.querySelector('.public-nav__menu-trigger')) {
    links.append(document.createRange().createContextualFragment(MENU_TRIGGER_MARKUP));
  }
  const trigger = links.querySelector<HTMLButtonElement>('.public-nav__menu-trigger');
  if (!trigger) return;
  trigger.setAttribute('aria-label', t('publicNav.openMenu'));

  const menu = document.createElement('div');
  menu.className = 'public-nav__menu';
  menu.id = 'public-nav-menu';
  menu.setAttribute('role', 'group');
  menu.setAttribute('aria-label', t('publicNav.menuAria'));
  menu.hidden = true;

  const addPageLink = (source: Element | undefined): void => {
    if (!source) return;
    const item = source.cloneNode(true) as HTMLElement;
    item.classList.add('public-nav__menu-item');
    menu.append(item);
  };
  addPageLink(home);

  const garage = document.createElement('a');
  garage.className = 'public-nav__menu-item';
  garage.href = hrefForLocale('/', getLocale());
  garage.innerHTML = `<span class="public-nav__icon public-nav__icon--home" data-ui-icon="garage" aria-hidden="true"></span>${t('publicNav.garage')}`;
  hydrateIcons(garage);
  menu.append(garage);

  for (const page of pageLinks) {
    if (page !== home) addPageLink(page);
  }

  const close = ({ restoreFocus = false }: { restoreFocus?: boolean } = {}): void => {
    if (menu.hidden) return;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', t('publicNav.openMenu'));
    if (restoreFocus) trigger.focus();
  };
  const open = (): void => {
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-label', t('publicNav.closeMenu'));
  };

  trigger.addEventListener('click', () => {
    if (menu.hidden) open();
    else close();
  });
  menu.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a')) close();
  });
  document.addEventListener('pointerdown', (event) => {
    if (menu.hidden || (event.target instanceof Node && links.contains(event.target))) return;
    close();
  });
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Escape' || menu.hidden) return;
    event.preventDefault();
    close({ restoreFocus: true });
  });
  window.addEventListener('cot:layoutchange', (event) => {
    const layoutEvent = event as CustomEvent<{ overlayPanels?: boolean }>;
    if (!layoutEvent.detail?.overlayPanels) close();
  });

  links.append(menu);
}

/**
 * Public-page icons: the static `svg.cot-i` marks reference the shared sprite, and `[data-ui-icon]` slots (the home
 * mode cards, script-built menu items) take their glyph from the shared set. Both load lazily, off the critical path.
 */
function hydrateIcons(root: ParentNode): void {
  const slots = [...root.querySelectorAll<HTMLElement>('[data-ui-icon]')];
  if (!slots.length && !root.querySelector('svg.cot-i')) return;
  void import('../ui/uiIcons.ts').then(({ uiIconSVG }) => {
    for (const slot of slots) slot.innerHTML = uiIconSVG(slot.dataset.uiIcon || '', 24);
  });
}

hydrateIcons(document);
mountLocaleSwitcher();
mountMobileNavigation();

// Docs topics and other public modules render some anchors after this module.
// Update the clicked anchor during capture so late content cannot leak back to
// an unprefixed English route.
document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const anchor = event.target.closest<HTMLAnchorElement>('a[href]');
  if (!anchor) return;
  const href = anchor.getAttribute('href');
  if (!href) return;
  const localized = hrefForLocale(href, getLocale());
  if (localized !== href) anchor.setAttribute('href', localized);
}, { capture: true });

window.setTimeout(() => {
  if ('requestIdleCallback' in window) requestIdleCallback(mountStars, { timeout: 2500 });
  else mountStars();
}, 2400);
