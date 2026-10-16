import { getLocale, t } from '../ui/i18n.ts';
import { installResponsiveLayout } from '../ui/responsiveLayout.ts';
import { localizeDocumentLinks, synchronizeLocaleRoute } from '../ui/localeRouting.ts';
import { bindStaticI18nAuto } from './staticI18n.ts';

installResponsiveLayout();

const locale = getLocale();
const localeRouteChanged = synchronizeLocaleRoute(locale);
if (!localeRouteChanged) {
  bindStaticI18nAuto();
  localizeDocumentLinks(document, locale);
}

document.title = t('notFound.metaTitle');
document.querySelector<HTMLMetaElement>('meta[name="description"]')
  ?.setAttribute('content', t('notFound.metaDescription'));

// GA4 as on the other public non-game pages (../googleAnalytics.ts gates the production host and Consent Mode), on
// src/analytics.ts's after-idle schedule; this page carries no Vercel Analytics. Self-hosted builds compile it out.
if (import.meta.env.VITE_SELF_HOSTED !== '1' && !localeRouteChanged) {
  window.setTimeout(() => {
    const mountGoogleAnalytics = (): void => void import('../googleAnalytics.ts')
      .then((analytics) => analytics.mountGoogleAnalytics());
    if ('requestIdleCallback' in window) requestIdleCallback(mountGoogleAnalytics, { timeout: 4000 });
    else mountGoogleAnalytics();
  }, 3800);
}
