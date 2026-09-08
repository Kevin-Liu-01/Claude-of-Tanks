import './publicNav.ts';
import { t } from '../ui/i18n.ts';

const requestedPath = document.querySelector<HTMLElement>('[data-not-found-path]');
if (requestedPath) {
  try {
    requestedPath.textContent = decodeURI(window.location.pathname);
  } catch (_) {
    requestedPath.textContent = window.location.pathname;
  }
}

document.title = t('notFound.metaTitle');
document.querySelector<HTMLMetaElement>('meta[name="description"]')
  ?.setAttribute('content', t('notFound.metaDescription'));
