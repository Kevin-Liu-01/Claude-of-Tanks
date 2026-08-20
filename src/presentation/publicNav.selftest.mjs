import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pages = [
  ['home.html', '/home'],
  ['gallery.html', '/gallery'],
  ['docs.html', '/docs'],
];
const expectedLinks = [
  ['/home', 'Home'],
  ['/gallery', 'Tank Gallery'],
  ['/docs', 'Docs'],
  ['/studio', 'Studio'],
  ['/', 'Play Now'],
];

for (const [file, activeHref] of pages) {
  const html = readFileSync(join(ROOT, file), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="\/src\/presentation\/publicNav\.css">/);
  const nav = /<nav class="public-nav"[\s\S]*?<\/nav>/.exec(html)?.[0];
  assert.ok(nav, `${file} must contain the shared public nav`);
  const linksBlock = /<div class="public-nav__links">([\s\S]*?)<\/div>/.exec(nav)?.[1];
  assert.ok(linksBlock, `${file} must contain the shared public nav links`);
  const links = [...linksBlock.matchAll(/<a([^>]*)href="([^"]+)"([^>]*)>([^<]+)<\/a>/g)]
    .map((match) => ({ attrs: `${match[1]}${match[3]}`, href: match[2], label: match[4].trim() }));
  assert.deepEqual(links.map(({ href, label }) => [href, label]), expectedLinks, `${file} nav links drifted`);
  assert.deepEqual(links.filter(({ attrs }) => attrs.includes('aria-current="page"')).map(({ href }) => href), [activeHref]);
  assert.ok(links.find(({ href }) => href === '/studio'), `${file} must link Scene Studio`);
}

console.log('public navigation selftest passed');
