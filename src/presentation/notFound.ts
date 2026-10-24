import { t } from '../ui/i18n.ts';
import { localeRouteChanged } from './publicNav.ts';

// The missing page carries the public shell (its bar, menu sheet and footer are static markup written by
// tools/public-shell.mjs); publicNav.ts localizes it, its links and the page's static copy, so this module only sets
// the tab title. The meta description is localized before JavaScript: the build writes /cn/404.html and the
// middleware serves the localized shell for other /cn misses (src/presentation/localizedHtml.ts).
document.title = t('notFound.metaTitle');

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
