import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pages = [
  ['home.html', '/home'],
  ['gallery.html', '/gallery'],
  ['docs.html', '/docs'],
  ['docs-topic.html', '/docs'],
];
const expectedLinks = [
  ['/home', 'Home'],
  ['/gallery', 'Tank Gallery'],
  ['/docs', 'Docs'],
  ['/studio', 'Studio'],
  ['https://github.com/Kevin-Liu-01/claude-of-tanks', 'GitHub Stars'],
  ['/', 'Play Now'],
];
const navCss = readFileSync(join(ROOT, 'src/presentation/publicNav.css'), 'utf8');
assert.match(navCss, /\.public-nav__links\{display:flex;align-items:center;gap:8px\}/,
  'desktop navigation controls must retain visible spacing');
assert.doesNotMatch(navCss, /\.public-nav__links\{[^}]*align-items:stretch/,
  'navigation controls must not stretch from the top to the bottom of the bar');

for (const [file, activeHref] of pages) {
  const html = readFileSync(join(ROOT, file), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="\/src\/presentation\/publicNav\.css">/);
  assert.match(html, /<script type="module" src="\/src\/presentation\/publicNav\.js"><\/script>/);
  const nav = /<nav class="public-nav"[\s\S]*?<\/nav>/.exec(html)?.[0];
  assert.ok(nav, `${file} must contain the shared public nav`);
  const linksBlock = /<div class="public-nav__links">([\s\S]*?)<\/div>/.exec(nav)?.[1];
  assert.ok(linksBlock, `${file} must contain the shared public nav links`);
  const links = [];
  for (const match of linksBlock.matchAll(/<a([^>]*)href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g)) {
    links.push({
      attrs: `${match[1]}${match[3]}`,
      href: match[2],
      label: match[4].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    });
  }
  const actualLinks = [];
  const activeLinks = [];
  for (const link of links) {
    actualLinks.push([link.href, link.label]);
    if (link.attrs.includes('aria-current="page"')) activeLinks.push(link.href);
  }
  assert.deepEqual(actualLinks, expectedLinks, `${file} nav links drifted`);
  assert.deepEqual(activeLinks, [activeHref]);
  assert.ok(links.find(({ href }) => href === '/studio'), `${file} must link Scene Studio`);
  const github = links.find(({ href }) => href.includes('github.com'));
  assert.ok(github?.attrs.includes('target="_blank"'), `${file} GitHub control opens the repository`);
  assert.ok(linksBlock.includes('data-github-stars'), `${file} GitHub control exposes the live star count`);
}

console.log('public navigation selftest passed');
