import type { RuntimeValue } from '../runtimeTypes.ts';
import { installResponsiveLayout } from '../ui/responsiveLayout.ts';
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
  if (!links || links.querySelector('.public-nav__locale')) return;

  const current = getLocale();
  const next = current === 'zh-CN' ? 'en-US' : 'zh-CN';
  const wrapper = document.createElement('div');
  wrapper.className = 'public-nav__locale-wrap';
  const button = document.createElement('button');
  button.className = 'public-nav__locale';
  button.type = 'button';
  button.dataset.locale = current;
  button.setAttribute('aria-label', t(next === 'zh-CN'
    ? 'publicNav.language.switchToChinese'
    : 'publicNav.language.switchToEnglish'));
  button.title = button.getAttribute('aria-label') || '';
  button.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/>' +
    '<path d="M3.8 12h16.4M12 3.5c2.2 2.4 3.3 5.2 3.3 8.5S14.2 18.1 12 20.5M12 3.5C9.8 5.9 8.7 8.7 8.7 12s1.1 6.1 3.3 8.5"/></svg>' +
    `<span data-locale-option="en-US"${current === 'en-US' ? ' class="is-current"' : ''}>EN</span>` +
    '<i aria-hidden="true">/</i>' +
    `<span data-locale-option="zh-CN"${current === 'zh-CN' ? ' class="is-current"' : ''}>中文</span>`;
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
  wrapper.append(button, credit);

  links.insertBefore(wrapper, links.querySelector('.public-nav__github, .public-nav__cta'));
}

function mountMobileNavigation(): void {
  const links = document.querySelector<HTMLElement>('.public-nav__links');
  if (!links || links.querySelector('.public-nav__menu-trigger')) return;

  const directLinks = [...links.children].filter((node) => node.matches?.('a'));
  const pageLinks = directLinks.filter((node) =>
    !node.classList.contains('public-nav__github') && !node.classList.contains('public-nav__cta'));
  const home = pageLinks.find((node) =>
    resolveLocalePath(node.getAttribute('href') || '').pathname === '/home');

  const trigger = document.createElement('button');
  trigger.className = 'public-nav__menu-trigger';
  trigger.type = 'button';
  trigger.setAttribute('aria-label', t('publicNav.openMenu'));
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', 'public-nav-menu');
  trigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16M4 12h16M4 17.5h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

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
  garage.innerHTML = `<img class="public-nav__icon public-nav__icon--home" src="/brand/nav/garage.svg" alt="">${t('publicNav.garage')}`;
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

  links.append(trigger, menu);
}

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
