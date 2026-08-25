import { installResponsiveLayout } from '../ui/responsiveLayout.js';

installResponsiveLayout();

const mountStars = () => import('../ui/githubStars.js')
  .then(({ mountGitHubStars }) => mountGitHubStars(document));

function mountMobileNavigation() {
  const links = document.querySelector('.public-nav__links');
  if (!links || links.querySelector('.public-nav__menu-trigger')) return;

  const directLinks = [...links.children].filter((node) => node.matches?.('a'));
  const pageLinks = directLinks.filter((node) =>
    !node.classList.contains('public-nav__github') && !node.classList.contains('public-nav__cta'));
  const home = pageLinks.find((node) => node.getAttribute('href') === '/home');

  const trigger = document.createElement('button');
  trigger.className = 'public-nav__menu-trigger';
  trigger.type = 'button';
  trigger.setAttribute('aria-label', 'Open navigation menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', 'public-nav-menu');
  trigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16M4 12h16M4 17.5h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  const menu = document.createElement('div');
  menu.className = 'public-nav__menu';
  menu.id = 'public-nav-menu';
  menu.setAttribute('role', 'group');
  menu.setAttribute('aria-label', 'Site pages');
  menu.hidden = true;

  const addPageLink = (source) => {
    if (!source) return;
    const item = source.cloneNode(true);
    item.classList.add('public-nav__menu-item');
    menu.append(item);
  };
  addPageLink(home);

  const garage = document.createElement('a');
  garage.className = 'public-nav__menu-item';
  garage.href = '/';
  garage.innerHTML = '<img class="public-nav__icon public-nav__icon--home" src="/brand/nav/garage.svg" alt="">Garage';
  menu.append(garage);

  for (const page of pageLinks) {
    if (page !== home) addPageLink(page);
  }

  const close = ({ restoreFocus = false } = {}) => {
    if (menu.hidden) return;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'Open navigation menu');
    if (restoreFocus) trigger.focus();
  };
  const open = () => {
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-label', 'Close navigation menu');
  };

  trigger.addEventListener('click', () => {
    if (menu.hidden) open();
    else close();
  });
  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) close();
  });
  document.addEventListener('pointerdown', (event) => {
    if (menu.hidden || links.contains(event.target)) return;
    close();
  });
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Escape' || menu.hidden) return;
    event.preventDefault();
    close({ restoreFocus: true });
  });
  window.addEventListener('cot:layoutchange', (event) => {
    if (!event.detail?.overlayPanels) close();
  });

  links.append(trigger, menu);
}

mountMobileNavigation();

window.setTimeout(() => {
  if ('requestIdleCallback' in window) requestIdleCallback(mountStars, { timeout: 2500 });
  else mountStars();
}, 2400);
