import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatGitHubStarCount,
  mountGitHubStars,
  repositoryStatsEndpointAvailable,
} from '../ui/githubStars.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pages = [
  ['home.html', '/home'],
  ['gallery.html', '/gallery'],
  ['docs.html', '/docs'],
  ['docs-topic.html', '/docs'],
  ['docs-build.html', '/docs'],
  ['docs-models.html', '/docs'],
  ['docs-simulation.html', '/docs'],
  ['docs-vehicles.html', '/docs'],
  ['docs-rendering.html', '/docs'],
  ['docs-performance.html', '/docs'],
  ['docs-worlds.html', '/docs'],
  ['docs-ai.html', '/docs'],
  ['docs-multiplayer.html', '/docs'],
  ['docs-audio.html', '/docs'],
  ['docs-interface.html', '/docs'],
  ['docs-studio.html', '/docs'],
];
const expectedLinks = [
  ['/home', 'Home'],
  ['/studio', 'Studio'],
  ['/gallery', 'Gallery'],
  ['/docs', 'Docs'],
  ['https://github.com/Kevin-Liu-01/claude-of-tanks', 'GitHub'],
  ['/', 'Play Now'],
];
const navCss = readFileSync(join(ROOT, 'src/presentation/publicNav.css'), 'utf8');
const navSource = readFileSync(join(ROOT, 'src/presentation/publicNav.ts'), 'utf8');
const homeCss = readFileSync(join(ROOT, 'public/home.css'), 'utf8');
const docsCss = readFileSync(join(ROOT, 'src/docs/docs.css'), 'utf8');
const galleryCss = readFileSync(join(ROOT, 'src/gallery/gallery.css'), 'utf8');
assert.equal(formatGitHubStarCount(999), '999');
assert.equal(formatGitHubStarCount(1200), '1.2K');
assert.equal(repositoryStatsEndpointAvailable({ hostname: '127.0.0.1', protocol: 'http:' }), false);
assert.equal(repositoryStatsEndpointAvailable({ hostname: 'localhost', protocol: 'https:' }), false);
assert.equal(repositoryStatsEndpointAvailable({ hostname: 'cot.kevinliu.studio', protocol: 'https:' }), true);

// A fresh surface immediately starts one non-blocking same-origin refresh.
// Explicit GitHub-link intent joins that request and remains a retry path.
const githubIntentHandlers = {};
const githubControlAttributes = new Map();
const githubControlProbe = {
  dataset: {},
  getAttribute: () => 'Claude of Tanks on GitHub',
  setAttribute(name, value) { githubControlAttributes.set(name, value); },
  addEventListener(type, handler) { githubIntentHandlers[type] = handler; },
};
const githubStarAttributes = new Map();
const githubStarProbe = {
  dataset: {},
  textContent: '',
  closest: () => githubControlProbe,
  setAttribute(name, value) { githubStarAttributes.set(name, value); },
  removeAttribute(name) { githubStarAttributes.delete(name); },
};
const originalFetch = globalThis.fetch;
let githubFetches = 0;
let resolveGitHubFetch;
globalThis.fetch = async (url) => {
  githubFetches++;
  assert.equal(url, '/api/github-stars');
  await new Promise((resolve) => { resolveGitHubFetch = resolve; });
  return { ok: true, json: async () => ({ stargazers_count: 321 }) };
};
const githubMount = mountGitHubStars({
  matches: () => false,
  querySelectorAll: () => [githubStarProbe],
});
assert.equal(githubFetches, 1, 'first mount starts the live star request without hover intent');
assert.equal(githubStarProbe.dataset.githubStarsState, 'loading');
assert.equal(githubStarProbe.textContent, '');
assert.equal(githubStarAttributes.get('aria-busy'), 'true');
assert.equal(githubStarAttributes.get('aria-label'), 'Loading GitHub star count');
assert.equal(typeof githubIntentHandlers.pointerenter, 'function');
assert.equal(typeof githubIntentHandlers.focus, 'function');
const githubIntent = githubIntentHandlers.pointerenter();
assert.equal(githubFetches, 1, 'GitHub intent joins the active first-load request');
resolveGitHubFetch();
await Promise.all([githubMount, githubIntent]);
assert.equal(githubStarProbe.dataset.githubStarsState, 'ready');
assert.equal(githubStarProbe.textContent, '321');
assert.equal(githubStarAttributes.get('aria-label'), '321 GitHub stars');
assert.equal(githubControlAttributes.get('aria-label'), 'Claude of Tanks on GitHub, 321 stars');
globalThis.fetch = originalFetch;
assert.match(navCss, /\.public-nav__links\{position:relative;display:flex;align-items:center;gap:8px\}/,
  'desktop navigation controls must retain visible spacing');
assert.doesNotMatch(navCss, /\.public-nav__links\{[^}]*align-items:stretch/,
  'navigation controls must not stretch from the top to the bottom of the bar');
assert.match(navCss,
  /\[data-github-stars\]\[data-github-stars-state='loading'\]::before\{[^}]*animation:cot-github-star-spin/,
  'the shared public surface must render a compact loading indicator instead of a numeric guess');
assert.match(navCss, /\.public-nav__links>a:not\(\.public-nav__github\):not\(\.public-nav__cta\)\{display:none\}/,
  'mobile public navigation must collapse page links while retaining GitHub and Play Now');
assert.match(navSource, /className = 'public-nav__menu-trigger'/,
  'public pages must mount a shared mobile menu trigger');
assert.match(navSource, /garage\.href = hrefForLocale\('\/', getLocale\(\)\)/,
  'the public mobile menu must expose the locale-matched Garage alongside every public page');
assert.match(navSource, /resolveLocalePath\(node\.getAttribute\('href'\)/,
  'the mobile Home control must survive localized link rewriting');
assert.match(navSource, /event\.code !== 'Escape'/,
  'the public mobile navigation must close with Escape');
assert.match(navSource, /className = 'public-nav__locale'/,
  'public pages must expose a visible locale switcher in the shared navigation');
assert.match(navSource, /className = 'public-nav__locale-credit'/,
  'the public locale switcher must expose General Translation attribution');
assert.match(navSource, /\/brand\/partners\/general-translation\.png/,
  'the public locale attribution must use the packaged GT mark');
assert.match(navSource, /setLocale\(next\)/,
  'the public locale switcher must persist through the canonical i18n owner');
assert.match(navCss, /\.public-nav__locale\{[^}]*display:flex;[^}]*height:34px;/,
  'the public locale switcher must be a first-class desktop navigation control');
assert.match(navCss, /\.public-nav__locale-wrap:hover \.public-nav__locale-credit,[\s\S]*?\.public-nav__locale-wrap:focus-within \.public-nav__locale-credit/,
  'the GT credit must appear for both pointer hover and keyboard focus');
for (const [surface, css] of [
  ['shared public navigation', navCss],
  ['Home', homeCss],
  ['Docs', docsCss],
  ['Gallery', galleryCss],
]) {
  assert.doesNotMatch(css, /cot-warning-tape/,
    `${surface} must leave the warning-tape motif exclusively to the 404 page`);
}

for (const [file, activeHref] of pages) {
  const html = readFileSync(join(ROOT, file), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="\/src\/presentation\/publicNav\.css">/);
  assert.match(html, /<script type="module" src="\/src\/presentation\/publicNav\.ts"><\/script>/);
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
  assert.deepEqual(activeLinks, activeHref ? [activeHref] : []);
  assert.ok(links.find(({ href }) => href === '/studio'), `${file} must link Scene Studio`);
  assert.ok(linksBlock.includes('public-nav__icon--docs') && linksBlock.includes('/brand/nav/docs.svg'),
    `${file} must use the shared Docs product mark`);
  assert.ok(linksBlock.includes('public-nav__play-icon'), `${file} Play Now control must use the shared play mark`);
  const github = links.find(({ href }) => href.includes('github.com'));
  assert.ok(github?.attrs.includes('target="_blank"'), `${file} GitHub control opens the repository`);
  assert.ok(linksBlock.includes('data-github-stars'), `${file} GitHub control exposes the live star count`);
  assert.ok(linksBlock.includes('data-github-stars-state="loading"'),
    `${file} GitHub control starts in the shared loading state`);
  assert.doesNotMatch(linksBlock, /data-github-stars[^>]*>\s*\d+\s*<\/span>/,
    `${file} GitHub control must not ship a stale numeric fallback`);
}

const notFoundHtml = readFileSync(join(ROOT, '404.html'), 'utf8');
assert.doesNotMatch(notFoundHtml, /publicNav\.(?:css|ts)|<nav class="public-nav"/,
  'the intentionally minimal 404 must stay independent of the full public navigation');
assert.match(notFoundHtml, /<script type="module" src="\/src\/presentation\/notFound\.ts"><\/script>/,
  'the standalone 404 must keep its focused localization runtime');

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
  assert.ok(contents.includes('data-github-stars-state="loading"'),
    'every repository control in the loading flow starts with the shared loading state');
  assert.doesNotMatch(contents, /data-github-stars[^>]*>\s*\d+\s*<\/span>/,
    'loading-flow repository controls must not ship a stale numeric fallback');
}

const garageSource = readFileSync(join(ROOT, 'src/ui/garage.ts'), 'utf8');
const garageCss = readFileSync(join(ROOT, 'src/ui/garage.css'), 'utf8');
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
assert.match(garageCss,
  /body\[data-cot-panels='overlay'\] \.cot-brand-utilities,\s*body\[data-cot-panels='overlay'\] \.cot-nav \.cot-nav-desktop\{display:none\}/,
  'overlay panel layouts must collapse left utilities and desktop workspace links');
assert.match(garageSource,
  /class="github-stars" data-github-stars data-github-stars-state="loading" aria-busy="true"/,
  'garage GitHub control exposes the shared loading state before the verified live star count');
assert.doesNotMatch(garageSource, /data-github-stars[^>]*>\s*\d+\s*<\/span>/,
  'garage GitHub control must not ship a stale numeric fallback');

for (const file of ['home.html', 'docs.html']) {
  const html = readFileSync(join(ROOT, file), 'utf8');
  const repositoryLinks = [...html.matchAll(/<a[^>]+href="https:\/\/github\.com\/Kevin-Liu-01\/(?:Claude-of-Tanks|claude-of-tanks)"[^>]*>([\s\S]*?)<\/a>/g)];
  assert.ok(repositoryLinks.length >= 2, `${file} must retain navbar and footer repository controls`);
  for (const [, contents] of repositoryLinks) {
    assert.ok(contents.includes('data-github-stars'), `${file} repository control is missing its star count`);
    assert.ok(contents.includes('data-github-stars-state="loading"'),
      `${file} repository control must render the shared loading state`);
    assert.doesNotMatch(contents, /data-github-stars[^>]*>\s*\d+\s*<\/span>/,
      `${file} repository control must not ship a stale numeric fallback`);
  }
}

console.log('public navigation selftest passed');
