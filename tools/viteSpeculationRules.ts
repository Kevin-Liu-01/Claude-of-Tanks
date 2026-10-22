// Build-only: speculation rules on every public page (2026-10-22, nav-perf-240; the owner's web rule "never block a
// navigation").
//
// A public page is static, so the next one can be ready before the click. Each built public document gets one
// `<script type="speculationrules">` that Chrome reads (other browsers ignore it): moderate eagerness, which a desktop
// starts on a 200 ms hover or a pointer down and a phone on a pointer down.
//   - prerender: the light documents (the landing page, the manual and its topics, both locales). The next page has
//     painted by the time it is clicked; src/analytics.ts waits for activation before it counts a visit.
//   - prefetch: the WebGL documents (the game, the Studio, the Gallery). Only their HTML is fetched early, so a hover
//     never builds a renderer in the background.
// The game document gets none: its Garage links leave the game rarely, and its boot owns the network.
import type { Plugin } from 'vite';

/** The public entries (site/*.html and the 404); the game document and the HUD preview stay out. */
export function isSpeculationEntry(filename: string): boolean {
  const name = filename.split(/[\\/]/).at(-1) || '';
  if (name === 'index.html' || name === 'hud-preview.html') return false;
  return /[\\/]site[\\/][^\\/]+\.html$/.test(filename) || name === '404.html';
}

const LIGHT_PAGES = ['/home', '/docs', '/docs/*'];
const WEBGL_PAGES = ['/', '/studio', '/gallery'];
const both = (paths: readonly string[]): Array<{ href_matches: string }> =>
  paths.flatMap((path) => [{ href_matches: path }, { href_matches: path === '/' ? '/cn' : `/cn${path}` }]);

export const SPECULATION_RULES = Object.freeze({
  prerender: [{ where: { or: both(LIGHT_PAGES) }, eagerness: 'moderate' }],
  prefetch: [{ where: { or: both(WEBGL_PAGES) }, eagerness: 'moderate' }],
});

export const SPECULATION_RULES_TAG = `<script type="speculationrules">${JSON.stringify(SPECULATION_RULES)}</script>`;

export function speculationRules(): Plugin {
  return {
    name: 'cot-speculation-rules',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!isSpeculationEntry(ctx.filename) || html.includes('type="speculationrules"')) return html;
        return html.replace('</head>', `  ${SPECULATION_RULES_TAG}\n</head>`);
      },
    },
  };
}
