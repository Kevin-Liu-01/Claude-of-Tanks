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
for (const key of [
  'notFound.eyebrow',
  'notFound.status',
  'notFound.title',
  'notFound.lede',
  'notFound.requested',
  'notFound.garage',
  'notFound.home',
  'notFound.docs',
  'notFound.footer',
]) {
  assert.ok(html.includes(`data-i18n="${key}"`), `404 copy must localize ${key}`);
}
assert.match(html, /data-not-found-path/, 'the error page must disclose the requested route');
assert.match(runtime, /decodeURI\(window\.location\.pathname\)/,
  'requested coordinates must come from the address bar without HTML injection');
assert.match(runtime, /document\.title = t\('notFound\.metaTitle'\)/,
  'the localized 404 must update its browser title');
assert.match(css, /f10_studio_urban_crossfire\.webp/,
  'the branded 404 must use an in-engine battle capture');
assert.match(css, /@media \(max-width:800px\)/,
  'the error composition must have a dedicated compact layout');
assert.match(vite, /notFound: resolve\(process\.cwd\(\), '404\.html'\)/,
  'the 404 page must ship as a production build entry');
assert.match(vite, /function forceNotFoundStatus\([\s\S]*?res\.statusCode = 404;[\s\S]*?args\[0\] = 404;/,
  'local preview must preserve a real 404 status through Vite static serving');
assert.match(vite, /forceNotFoundStatus\(res\);\s*req\.url = '\/404\.html'/,
  'missing document routes must use the status-preserving 404 rewrite');
assert.doesNotMatch(vercel, /"source":\s*"\/\(\.\*\)"/,
  'a catch-all production rewrite must not mask Vercel static 404 handling');

console.log('notFound.selftest: branded localized missing-route contract passed');
