// Google Analytics 4 for the public non-game pages only: home, the docs, the gallery and the 404. src/analytics.ts and
// src/presentation/notFound.ts import this module after idle; the game entry (index.html) never reaches it, a standing
// latency rule that src/presentation/analytics.selftest.mjs enforces together with the gates below.

// GA4 web-stream measurement ID for cot.kevinliu.studio: public by design (every hit carries it).
const GA_MEASUREMENT_ID = 'G-0ZV67MX92H';
const PRODUCTION_HOST = 'cot.kevinliu.studio';

/** The browser surface this module touches (the selftest passes a stand-in). */
type GtagTarget = {
  location: Pick<Location, 'hostname' | 'origin' | 'pathname'>;
  navigator: Pick<Navigator, 'webdriver'>;
  document: Pick<Document, 'referrer' | 'head' | 'createElement'>;
  dataLayer?: IArguments[];
};

/** A URL without its query string or fragment: `?room=…&host=<player name>` never leaves the browser. */
const withoutQuery = (url: string): string | undefined => {
  try {
    const { protocol, host, pathname } = new URL(url);
    return `${protocol}//${host}${pathname}`;
  } catch {
    return undefined;
  }
};

/** Queues the Consent Mode v2 defaults and the config, then loads gtag.js. Returns whether it mounted. */
export function mountGoogleAnalytics(target: GtagTarget = window): boolean {
  // Production only: previews, localhost and automated browsers (e2e, probes) send nothing.
  if (target.location.hostname !== PRODUCTION_HOST || target.navigator.webdriver) return false;
  const dataLayer = (target.dataLayer ??= []);
  // gtag.js reads Arguments objects from the data layer; an array of the same values is not a command.
  function gtag(..._command: unknown[]): void {
    dataLayer.push(arguments);
  }
  // No banner: the EEA, the UK and Switzerland are measured without analytics cookies; no ad storage anywhere.
  gtag('consent', 'default', {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied',
    region: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'LV', 'LI',
      'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'CH', 'GB'],
  });
  gtag('consent', 'default', {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted',
  });
  gtag('js', new Date());
  // The referrer is stripped too: a visit from the game would otherwise carry its room and player name.
  const referrer = withoutQuery(target.document.referrer);
  gtag('config', GA_MEASUREMENT_ID, {
    page_location: target.location.origin + target.location.pathname,
    ...(referrer ? { page_referrer: referrer } : {}),
  });
  // gtag.js loads only after the consent defaults are queued.
  const script = target.document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  target.document.head.append(script);
  return true;
}
