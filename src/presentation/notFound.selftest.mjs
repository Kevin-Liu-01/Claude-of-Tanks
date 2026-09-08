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
assert.match(html, /<main class="not-found" aria-labelledby="not-found-title">/,
  'the error page must expose one semantic main landmark');
assert.match(html, /<h1 id="not-found-title">404<\/h1>/,
  'the error page must reduce its visible message to a centered 404');
assert.match(html, /data-i18n-aria-label="publicNav\.menuAria"/,
  'the standalone recovery navigation must keep an accessible localized name');
for (const key of ['publicNav.garage', 'publicNav.home', 'publicNav.docs']) {
  assert.ok(html.includes(`data-i18n="${key}"`), `404 recovery link must localize ${key}`);
}
assert.doesNotMatch(html, /public-nav|not-found__(?:eyebrow|panel|status|lede|coordinate|footer|reticle)/,
  'the minimal 404 must not bring back global navigation, diagnostics, cards, or decoration');
const recovery = /<nav class="not-found__actions"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
const recoveryLinks = [...recovery.matchAll(/<a(?: class="([^"]+)")? href="([^"]+)">([\s\S]*?)<\/a>/g)]
  .map((match) => ({ classes: match[1] ?? '', href: match[2], contents: match[3] }));
assert.deepEqual(recoveryLinks.map(({ href }) => href), ['/', '/home', '/docs'],
  'the minimal 404 must expose exactly Garage, Home, and Docs recovery actions');
assert.ok(recoveryLinks[0]?.classes.includes('not-found__primary'),
  'Return to Garage must remain the primary recovery action');
for (const icon of ['garage', 'home', 'docs']) {
  assert.ok(recovery.includes(`not-found__icon--${icon}`), `the ${icon} recovery action must carry its icon`);
}
assert.match(runtime, /bindStaticI18nAuto\(\)/,
  'the standalone 404 runtime must bind localized static copy');
assert.match(runtime, /localizeDocumentLinks\(document, locale\)/,
  'the standalone 404 runtime must keep recovery links inside the active locale');
assert.match(runtime, /synchronizeLocaleRoute\(locale\)/,
  'the standalone 404 runtime must preserve locale-prefixed missing routes');
assert.match(runtime, /document\.title = t\('notFound\.metaTitle'\)/,
  'the localized 404 must update its browser title');
assert.match(css, /f10_studio_urban_crossfire\.webp/,
  'the branded 404 must use an in-engine battle capture');
assert.match(css, /place-items:center/,
  'the minimal 404 composition must remain centered in the viewport');
assert.match(css, /\.not-found h1\{[^}]*color:transparent;[^}]*-webkit-text-stroke:2px/,
  'the 404 numerals must render as an outline instead of a solid fill');
assert.match(css, /\.not-found__actions \.not-found__primary\{[^}]*background:var\(--nf-amber\);[^}]*color:#171006/,
  'Return to Garage must use the full solid-orange primary treatment');
assert.doesNotMatch(css, /\.not-found__content::before/,
  'the 404 warning tape must not sit directly above the centered copy');
assert.match(css, /body\.not-found-page::after\{[^}]*right:0;[^}]*bottom:0;[^}]*left:0;[^}]*background:var\(--cot-warning-tape\)/,
  'the minimal 404 must use warning tape as a full-width viewport boundary');
assert.match(css, /@media \(max-width:480px\)/,
  'the error composition must have a dedicated compact layout');
assert.match(vite, /notFound: resolve\(process\.cwd\(\), '404\.html'\)/,
  'the 404 page must ship as a production build entry');
assert.match(vite, /function forceNotFoundStatus\([\s\S]*?res\.statusCode = 404;[\s\S]*?args\[0\] = 404;/,
  'local preview must preserve a real 404 status through Vite static serving');
assert.match(vite, /forceNotFoundStatus\(res\);[\s\S]*?req\.url = `\/\$\{localePath\.route\.sourceHtml\}/,
  'missing document routes must use the centralized status-preserving 404 rewrite');
assert.doesNotMatch(vercel, /"source":\s*"\/\(\.\*\)"/,
  'a catch-all production rewrite must not mask Vercel static 404 handling');

console.log('notFound.selftest: minimal centered localized missing-route contract passed');
