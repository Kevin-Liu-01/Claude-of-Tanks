import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FALLBACK_GITHUB_STAR_COUNT, formatGitHubStarCount } from '../ui/githubStars.js';

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
  ['https://github.com/Kevin-Liu-01/claude-of-tanks', `GitHub ${FALLBACK_GITHUB_STAR_COUNT}`],
  ['/', 'Play Now'],
];
const navCss = readFileSync(join(ROOT, 'src/presentation/publicNav.css'), 'utf8');
assert.equal(formatGitHubStarCount(999), '999');
assert.equal(formatGitHubStarCount(1200), '1.2K');
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
  assert.ok(linksBlock.includes('public-nav__icon--docs') && linksBlock.includes('/brand/nav/docs.svg'),
    `${file} must use the shared Docs product mark`);
  assert.ok(linksBlock.includes('public-nav__play-icon'), `${file} Play Now control must use the shared play mark`);
  const github = links.find(({ href }) => href.includes('github.com'));
  assert.ok(github?.attrs.includes('target="_blank"'), `${file} GitHub control opens the repository`);
  assert.ok(linksBlock.includes('data-github-stars'), `${file} GitHub control exposes the live star count`);
}

const gameHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
const gameRepositoryLinks = [...gameHtml.matchAll(/<a[^>]+href="https:\/\/github\.com\/Kevin-Liu-01\/Claude-of-Tanks"[^>]*>([\s\S]*?)<\/a>/g)];
assert.equal(gameRepositoryLinks.length, 2, 'loading and credits screens must retain both repository controls');
for (const [, contents] of gameRepositoryLinks) {
  assert.ok(contents.includes('data-github-stars'), 'every repository control in the loading flow shows stars');
  assert.ok(contents.includes(`data-github-stars>${FALLBACK_GITHUB_STAR_COUNT}`),
    'every repository control in the loading flow starts with the numeric fallback');
}

const garageSource = readFileSync(join(ROOT, 'src/ui/garage.js'), 'utf8');
const githubControl = garageSource.indexOf('class="nv cot-github"');
const settingsSlot = garageSource.indexOf('class="cot-settings-slot"');
assert.ok(githubControl >= 0 && settingsSlot > githubControl,
  'garage GitHub stars must sit immediately before the settings control');
assert.match(garageSource, new RegExp(`class="github-stars" data-github-stars>${FALLBACK_GITHUB_STAR_COUNT}<\\/span>`),
  'garage GitHub control exposes a numeric fallback before the live star count');

for (const file of ['home.html', 'docs.html']) {
  const html = readFileSync(join(ROOT, file), 'utf8');
  const repositoryLinks = [...html.matchAll(/<a[^>]+href="https:\/\/github\.com\/Kevin-Liu-01\/(?:Claude-of-Tanks|claude-of-tanks)"[^>]*>([\s\S]*?)<\/a>/g)];
  assert.ok(repositoryLinks.length >= 2, `${file} must retain navbar and footer repository controls`);
  for (const [, contents] of repositoryLinks) {
    assert.ok(contents.includes('data-github-stars'), `${file} repository control is missing its star count`);
    assert.ok(contents.includes(`data-github-stars>${FALLBACK_GITHUB_STAR_COUNT}`),
      `${file} repository control must render the verified numeric fallback`);
  }
}

console.log('public navigation selftest passed');
