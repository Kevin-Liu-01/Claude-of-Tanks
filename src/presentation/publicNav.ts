import type { RuntimeValue } from '../runtimeTypes.ts';
import { installResponsiveLayout } from '../ui/responsiveLayout.ts';
import { bindStaticI18nAuto } from './staticI18n.ts';
import { t } from '../ui/i18n.ts';

installResponsiveLayout();
bindStaticI18nAuto();

const mountStars = (): Promise<RuntimeValue> => import('../ui/githubStars.ts')
  .then(({ mountGitHubStars }) => mountGitHubStars(document));

function mountMobileNavigation(): void {
  const links = document.querySelector<HTMLElement>('.public-nav__links');
  if (!links || links.querySelector('.public-nav__menu-trigger')) return;

  const directLinks = [...links.children].filter((node) => node.matches?.('a'));
  const pageLinks = directLinks.filter((node) =>
    !node.classList.contains('public-nav__github') && !node.classList.contains('public-nav__cta'));
  const home = pageLinks.find((node) => node.getAttribute('href') === '/home');

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
  garage.href = '/';
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

mountMobileNavigation();

window.setTimeout(() => {
  if ('requestIdleCallback' in window) requestIdleCallback(mountStars, { timeout: 2500 });
  else mountStars();
}, 2400);
