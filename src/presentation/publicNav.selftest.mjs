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
  ['/studio', 'Studio'],
  ['/gallery', 'Tank Gallery'],
  ['/docs', 'Docs'],
  ['https://github.com/Kevin-Liu-01/claude-of-tanks', `GitHub ${FALLBACK_GITHUB_STAR_COUNT}`],
  ['/', 'Play Now'],
];
const navCss = readFileSync(join(ROOT, 'src/presentation/publicNav.css'), 'utf8');
const navSource = readFileSync(join(ROOT, 'src/presentation/publicNav.js'), 'utf8');
assert.equal(formatGitHubStarCount(999), '999');
assert.equal(formatGitHubStarCount(1200), '1.2K');
assert.match(navCss, /\.public-nav__links\{position:relative;display:flex;align-items:center;gap:8px\}/,
  'desktop navigation controls must retain visible spacing');
assert.doesNotMatch(navCss, /\.public-nav__links\{[^}]*align-items:stretch/,
  'navigation controls must not stretch from the top to the bottom of the bar');
assert.match(navCss, /\.public-nav__links>a:not\(\.public-nav__github\):not\(\.public-nav__cta\)\{display:none\}/,
  'mobile public navigation must collapse page links while retaining GitHub and Play Now');
assert.match(navSource, /className = 'public-nav__menu-trigger'/,
  'public pages must mount a shared mobile menu trigger');
assert.match(navSource, /garage\.href = '\/'/,
  'the public mobile menu must expose the garage alongside every public page');
assert.match(navSource, /event\.code !== 'Escape'/,
  'the public mobile navigation must close with Escape');

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
assert.match(gameHtml,
  /\.cot-boot-links\s*\{[^}]*display: grid; grid-template-columns: repeat\(2, 1fr\); width: max-content;/,
  'boot utility controls must share the widest control\'s intrinsic width');
assert.match(gameHtml,
  /\.cot-boot-links > \.cot-boot-link\s*\{[^}]*width: auto; min-width: 0;[^}]*padding: 0 16px;/,
  'boot utility controls must keep balanced content-driven horizontal padding');
assert.doesNotMatch(gameHtml, /\.cot-boot-links > \.cot-boot-link\s*\{[^}]*width: 132px;/,
  'boot utility controls must not return to the fixed width that cramped GitHub');
const gameRepositoryLinks = [...gameHtml.matchAll(/<a[^>]+href="https:\/\/github\.com\/Kevin-Liu-01\/Claude-of-Tanks"[^>]*>([\s\S]*?)<\/a>/g)];
assert.equal(gameRepositoryLinks.length, 2, 'loading and credits screens must retain both repository controls');
for (const [, contents] of gameRepositoryLinks) {
  assert.ok(contents.includes('data-github-stars'), 'every repository control in the loading flow shows stars');
  assert.ok(contents.includes(`data-github-stars>${FALLBACK_GITHUB_STAR_COUNT}`),
    'every repository control in the loading flow starts with the numeric fallback');
}

const garageSource = readFileSync(join(ROOT, 'src/ui/garage.js'), 'utf8');
const brandUtilities = garageSource.indexOf('class="cot-brand-utilities cot-header-nav"');
const homeControl = garageSource.indexOf('data-nav="home"');
const recordControl = garageSource.indexOf('class="nv cot-record-trigger"');
const garageNavigation = garageSource.indexOf('class="cot-nav cot-header-nav"');
assert.ok(brandUtilities >= 0 && homeControl > brandUtilities && recordControl > homeControl &&
  garageNavigation > recordControl,
  'garage Home and Record controls must live with the left-side brand before workspace navigation');
const galleryControl = garageSource.indexOf('data-nav="gallery"');
const docsControl = garageSource.indexOf('data-nav="docs"');
const githubControl = garageSource.indexOf('class="nv cot-github"');
assert.ok(galleryControl > garageNavigation && docsControl > galleryControl && githubControl > docsControl,
  'garage Docs control must sit immediately after Gallery and before GitHub');
const settingsSlot = garageSource.indexOf('class="cot-settings-slot"');
const mobileMenuTrigger = garageSource.indexOf('class="nv cot-mobile-nav-trigger"');
assert.ok(githubControl >= 0 && settingsSlot > githubControl && mobileMenuTrigger > settingsSlot,
  'garage mobile utilities must resolve to GitHub, settings, then the menu trigger');
for (const destination of ['home', 'garage', 'studio', 'gallery', 'docs', 'record']) {
  assert.ok(garageSource.includes(`data-mobile-nav="${destination}"`),
    `garage mobile menu must expose ${destination}`);
}
assert.match(garageSource, /\.cot-brand-utilities,\.cot-nav \.cot-nav-desktop\{display:none;\}/,
  'phone layouts must collapse left utilities and desktop workspace links');
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
