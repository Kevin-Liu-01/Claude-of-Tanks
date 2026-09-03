import type { RuntimeValue } from './runtimeTypes.ts';
const mountAnalytics = (): Promise<RuntimeValue> => import('@vercel/analytics').then(({ inject }) => inject({
  mode: import.meta.env.PROD ? 'production' : 'development',
}));

window.setTimeout(() => {
  if ('requestIdleCallback' in window) requestIdleCallback(mountAnalytics, { timeout: 4000 });
  else mountAnalytics();
}, 3800);
