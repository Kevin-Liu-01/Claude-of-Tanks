// tools/viteNavChrome.ts (2026-10-22, nav-perf-240): every built page with the shared bar carries the language switch
// before GitHub and the menu button after Play, once; a page without the bar, or with its own controls, is unchanged.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { injectNavChrome, navChrome } from './viteNavChrome.ts';

const home = readFileSync(new URL('../site/home.html', import.meta.url), 'utf8');
const built = injectNavChrome(home);
const links = built.slice(built.indexOf('<div class="public-nav__links">'), built.indexOf('</nav>'));
const at = (needle) => links.indexOf(needle);
assert.equal(links.split('class="public-nav__locale"').length - 1, 1, 'one language switch');
assert.equal(links.split('class="public-nav__menu-trigger"').length - 1, 1, 'one menu button');
assert.ok(at('a href="/docs"') < at('public-nav__locale-wrap') && at('public-nav__locale-wrap') < at('public-nav__github'),
  'the switch sits between the page links and GitHub, where publicNav.ts mounted it');
assert.ok(at('public-nav__cta') < at('public-nav__menu-trigger'), 'the menu button follows Play');
assert.match(links, /data-locale-option="en-US" class="is-current"/, 'the English build marks EN');
assert.equal(injectNavChrome(built), built, 'idempotent: a page with the controls is left as it is');
const game = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.equal(injectNavChrome(game), game, 'the game document has no public bar');
assert.equal(navChrome().transformIndexHtml.handler(home), built);
console.log('viteNavChrome.selftest: the public bar is built with its language switch and menu button in place, once, and nowhere else');
