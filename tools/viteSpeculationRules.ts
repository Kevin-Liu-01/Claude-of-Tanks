// Build-only: speculation rules on every public page (2026-10-22, nav-perf-240; the owner's web rule "never block a
// navigation").
//
// A public page is static, so the next one can be ready before the click. Each built public document gets a small
// inline script that adds one `<script type="speculationrules">` in Chrome (other browsers ignore both):
//   - with a hovering pointer, the light documents (the landing page, the manual and its topics, both locales)
//     prerender on a 200 ms hover, so the next page has painted by the click; src/analytics.ts counts a prerendered
//     page only once it is shown;
//   - on touch, those documents prerender on the touch itself: a phone never prerenders pages in the background,
//     where every prerender would share its slower CPU and network with the page the visitor is reading;
//   - the WebGL documents (the game, the Studio, the Gallery) only prefetch their HTML, at the same moments, so a hover
//     never builds a renderer in the background.
// The game document gets none: its Garage links leave the game rarely, and its boot owns the network.
import type { Plugin } from 'vite';

/** The public entries (site/*.html and the 404); the game document, the HUD preview and the phone controller's page (a
 *  controller held in the hand prefetches nothing) stay out. */
export function isSpeculationEntry(filename: string): boolean {
  const name = filename.split(/[\\/]/).at(-1) || '';
  if (name === 'index.html' || name === 'hud-preview.html' || name === 'pad.html') return false;
  return /[\\/]site[\\/][^\\/]+\.html$/.test(filename) || name === '404.html';
}

const LIGHT_PAGES = ['/home', '/docs', '/docs/*'];
const WEBGL_PAGES = ['/', '/studio', '/gallery'];
const both = (paths: readonly string[]): Array<{ href_matches: string }> =>
  paths.flatMap((path) => [{ href_matches: path }, { href_matches: path === '/' ? '/cn' : `/cn${path}` }]);

/** The rules for a pointer that hovers (`moderate`: a 200 ms hover or a press) or only touches (`conservative`). */
export function speculationRulesFor(eagerness: 'moderate' | 'conservative') {
  return {
    prerender: [{ where: { or: both(LIGHT_PAGES) }, eagerness }],
    prefetch: [{ where: { or: both(WEBGL_PAGES) }, eagerness }],
  };
}

/** The inline script: picks the rules by `(hover: hover)` and adds them before the page's links are interactive. */
export const SPECULATION_RULES_TAG = `<script id="cot-speculation">(()=>{if(!HTMLScriptElement.supports?.('speculationrules'))return;`
  + `const s=document.createElement('script');s.type='speculationrules';s.textContent=JSON.stringify(matchMedia('(hover: hover)').matches?`
  + `${JSON.stringify(speculationRulesFor('moderate'))}:${JSON.stringify(speculationRulesFor('conservative'))});`
  + 'document.head.append(s)})()</script>';

export function speculationRules(): Plugin {
  return {
    name: 'cot-speculation-rules',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!isSpeculationEntry(ctx.filename) || html.includes('id="cot-speculation"')) return html;
        return html.replace('</head>', `  ${SPECULATION_RULES_TAG}\n</head>`);
      },
    },
  };
}
