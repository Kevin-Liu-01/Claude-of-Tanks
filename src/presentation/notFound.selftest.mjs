import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const html = readFileSync(join(ROOT, '404.html'), 'utf8');
const css = readFileSync(join(ROOT, 'src/presentation/notFound.css'), 'utf8');
const runtime = readFileSync(join(ROOT, 'src/presentation/notFound.ts'), 'utf8');
const vite = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
const vercel = readFileSync(join(ROOT, 'vercel.json'), 'utf8');

assert.match(html, /<meta name="robots" content="noindex, nofollow">/,
  'missing routes must never enter the search index');
assert.match(html, /<main class="not-found" id="main" aria-labelledby="not-found-title">/,
  'the error page must expose one semantic main landmark');
// brand-ui SPEC 12.3.4 (the Premiere direction, 242; 246: no outline type, the search, the destinations' own pictures):
// the shared bar and footer, the code in the accent over one solid sentence, the search, the site's destinations.
assert.match(html, /<h1 class="not-found__title" id="not-found-title"><span class="not-found__code t-accent num" lang="en">404<\/span><span class="not-found__line" data-i18n="notFound\.title">[^<]+<\/span><\/h1>/,
  'the code and one solid sentence, the sentence localized');
assert.doesNotMatch(html, /t-hollow/, 'no outline type on the missing page');
assert.match(html, /<form class="not-found__search" role="search" data-nf-search>[\s\S]*?<input type="search" name="q" placeholder="[^"]+" data-i18n-placeholder="notFound\.searchPlaceholder" aria-label="[^"]+" data-i18n-aria-label="notFound\.searchAria"/,
  'a search over the fleet and the manual, its field named in both locales');
assert.match(runtime, /import\('\.\.\/docs\/docsSearch\.ts'\), index, import\('\.\/fleetWall\.json'\)/, 'the search indexes load with the field, never at first paint');
assert.match(runtime, /import\('\.\.\/docs\/searchIndex\.zh-CN\.json'/, 'the manual\'s prebuilt index in the reader\'s locale');
assert.doesNotMatch(runtime, /^import (?!type )[^;]*(?:docsSearch|fleetWall|searchIndex)/m, 'no index in the page\'s first bytes');
assert.match(html, /data-i18n-aria-label="publicNav\.menuAria"/,
  'the recovery navigation keeps an accessible localized name');
assert.match(html, /<!--cot:nav--><a class="public-skip"[\s\S]*?<nav class="public-nav"[\s\S]*?<!--\/cot:nav-->/,
  'the shared bar (tools/public-shell.mjs)');
assert.match(html, /<!--cot:footer--><footer class="public-footer"/, 'the shared footer');
const recovery = /<nav class="not-found__go"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
const recoveryLinks = [...recovery.matchAll(/<a class="([^"]+)" href="([^"]+)">([\s\S]*?)<\/a>/g)]
  .map((match) => ({ classes: match[1], href: match[2], contents: match[3] }));
assert.deepEqual(recoveryLinks.map(({ href }) => href), ['/', '/gallery', '/docs', '/studio', '/docs/filming#library'],
  'the destinations: Play, Tank Gallery, Field Manual, Studio, Media');
assert.ok(recoveryLinks[0]?.classes.includes('nf-go--play'), 'Play is the one primary action');
for (const link of recoveryLinks.slice(1)) assert.match(link.contents, /^<img src="\/media\/[^"]+" alt="" width="640" height="360"/, `${link.href} shows its own picture, dimensioned`);
for (const [i, key] of ['publicNav.playNow', 'publicNav.tankGallery', 'publicNav.fieldManual', 'publicNav.studio', 'publicNav.media'].entries()) {
  assert.ok(recoveryLinks[i]?.contents.includes(`data-i18n="${key}"`) && recoveryLinks[i].contents.includes('<use href="#i-'),
    `${key}: its icon and its localized name`);
}
assert.match(html, /data-i18n="notFound\.report"/, 'a broken link can be reported');
assert.match(runtime, /from '\.\/publicNav\.ts'/,
  'the shell runtime binds the static copy, keeps links in the active locale and preserves locale-prefixed routes');
assert.match(runtime, /document\.title = t\('notFound\.metaTitle'\)/,
  'the localized 404 must update its browser title');
// (the site media, 7acc117fd: the site fifty replaced the old gameplay stills; 246: take s29's fjord road, its sky and grass
// on the left for the words, its tank on the right)
assert.match(html, /<img class="not-found__still" src="\/media\/site50-r14\/stills\/s29-fjord-road-kill\.webp" srcset="[^"]+-thumb\.webp 640w, [^"]+ 1920w" sizes="100vw" alt="" width="1920" height="1080"/,
  'the branded 404 must use an in-engine battle capture, dimensioned, with its 640 rung');
assert.match(css, /@import url\('\.\.\/ui\/components\/components\.css'\)/, 'the 404 wears the shared kit');
assert.match(css, /\.not-found__grade\{[^}]*background:var\(--home-closing-grade\)/, 'the landing closing\'s grade: the words\' side darkened');
assert.doesNotMatch(css, /(?:^|\})\s*(?:html|body)\b[^{}]*\{[^}]*overflow:hidden/m, 'no overflow trap on the page (the root and body scroll)');
assert.match(vite, /notFound: resolve\(process\.cwd\(\), '404\.html'\)/,
  'the 404 page must ship as a production build entry');
assert.match(vite, /function forceNotFoundStatus\([\s\S]*?res\.statusCode = 404;[\s\S]*?args\[0\] = 404;/,
  'local preview must preserve a real 404 status through Vite static serving');
assert.match(vite, /forceNotFoundStatus\(res\);[\s\S]*?const entry = localePath\.route\.sourceHtml;[\s\S]*?const source = existsSync[\s\S]*?req\.url = `\/\$\{source\}/,
  'missing document routes must use the centralized status-preserving 404 rewrite');
assert.doesNotMatch(vercel, /"source":\s*"\/\(\.\*\)"/,
  'a catch-all production rewrite must not mask Vercel static 404 handling');

console.log('notFound.selftest: the missing page in the landing grammar passed');
