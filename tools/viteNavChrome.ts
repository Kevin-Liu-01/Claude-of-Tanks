// Build-time public top bar chrome (2026-10-22, nav-perf-240; the owner's web rule "keep static elements as part of the
// layout").
//
// The language switch and the phone menu button were created by publicNav.ts after the first paint, so every public
// page painted its bar without them and then moved its links (about 100 px on a desktop, 77 px on a phone). This
// plugin writes src/presentation/publicNavChrome.ts's markup into each built page that carries the shared bar: the
// switch before the GitHub link, the menu button after Play. publicNav.ts binds them. A page whose own markup already
// holds either control is left as it is, so a static nav partial in the source supersedes the plugin.
import type { Plugin } from 'vite';
import { localeSwitchMarkup, MENU_TRIGGER_MARKUP } from '../src/presentation/publicNavChrome.ts';

/** `html` with the switch and the menu button in its `.public-nav__links` (unchanged without the bar). */
export function injectNavChrome(html: string): string {
  if (!html.includes('class="public-nav__links"')) return html;
  let out = html;
  if (!out.includes('public-nav__locale')) {
    out = out.replace(/<a class="public-nav__github"/, (anchor) => `${localeSwitchMarkup('en-US')}${anchor}`);
  }
  if (!out.includes('public-nav__menu-trigger')) {
    const cta = out.indexOf('<a class="public-nav__cta"');
    const close = cta >= 0 ? out.indexOf('</a>', cta) : -1;
    if (close >= 0) out = `${out.slice(0, close + 4)}${MENU_TRIGGER_MARKUP}${out.slice(close + 4)}`;
  }
  return out;
}

export function navChrome(): Plugin {
  return {
    name: 'cot-nav-chrome',
    transformIndexHtml: { order: 'pre', handler: (html) => injectNavChrome(html) },
  };
}
