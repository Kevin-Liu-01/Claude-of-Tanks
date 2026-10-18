import type { RuntimeValue } from './runtimeTypes.ts';

const selfHostedBuild = import.meta.env.VITE_SELF_HOSTED === '1';
const mountAnalytics = (): Promise<RuntimeValue> => import('@vercel/analytics').then(({ inject }) => inject({
  mode: import.meta.env.PROD ? 'production' : 'development',
}));
// GA4 (src/googleAnalytics.ts gates the production host and Consent Mode) loads in the same idle slot.
const mountGoogleAnalytics = (): Promise<boolean> => import('./googleAnalytics.ts')
  .then((analytics) => analytics.mountGoogleAnalytics());
const mountAll = (): void => {
  void mountAnalytics();
  void mountGoogleAnalytics();
};

if (!selfHostedBuild) {
  window.setTimeout(() => {
    if ('requestIdleCallback' in window) requestIdleCallback(mountAll, { timeout: 4000 });
    else mountAll();
  }, 3800);
}
