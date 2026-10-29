import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatGitHubStarCount,
  mountGitHubStars,
  repositoryStatsEndpointAvailable,
} from '../ui/githubStars.ts';
import { staleEntries } from '../../tools/public-shell.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pages = [
  ['site/home.html', '/home'],
  ['site/gallery.html', '/gallery'],
  ['site/docs.html', '/docs'],
  ['site/docs-topic.html', '/docs'],
  ['site/docs-build.html', '/docs'],
  ['site/docs-models.html', '/docs'],
  ['site/docs-simulation.html', '/docs'],
  ['site/docs-rendering.html', '/docs'],
  ['site/docs-ai.html', '/docs'],
  ['site/docs-multiplayer.html', '/docs'],
  ['site/docs-audio.html', '/docs'],
  ['site/docs-studio.html', '/docs'],
  // every Field Manual chapter marks the manual, the Filming chapter too (Media is its #library section, not a page)
  ['site/docs-filming.html', '/docs'],
];
const navCss = readFileSync(join(ROOT, 'src/presentation/publicNav.css'), 'utf8');
const navSource = readFileSync(join(ROOT, 'src/presentation/publicNav.ts'), 'utf8');
const shellSource = readFileSync(join(ROOT, 'src/presentation/publicShell.ts'), 'utf8');
const homeCss = readFileSync(join(ROOT, 'src/presentation/home.css'), 'utf8');
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

// The shared shell (brand-ui BUI-W1): one bar, written into every public entry from src/presentation/publicShell.ts.
assert.deepEqual(staleEntries(), [], 'every public entry carries the current shell (node tools/public-shell.mjs --write)');
assert.match(navCss, /\.public-nav__links\{position:relative;display:flex;align-items:center;gap:var\(--s6\)/,
  'desktop navigation links keep visible spacing');
assert.doesNotMatch(navCss, /\.public-nav__links\{[^}]*align-items:stretch/,
  'navigation controls must not stretch from the top to the bottom of the bar');
assert.match(navCss, /@media \(width < 1100px\)\{\s*\.public-nav__links\{display:none\}\s*\.public-nav__menu-trigger\{display:inline-grid\}/,
  'below the laptop band the page links collapse into the menu sheet');
assert.match(navCss, /^@import url\('\.\.\/ui\/tokens\/tokens\.css'\);/, 'the shell reads the design tokens on every public page');
// the bar and its primary keep one size relation at every width: the bar is the primary's height and one inset above and
// below, the primary is the kit's 48 px button from 768 px up and the 44 px touch target on a phone, and the bar's rule
// hangs under its box, so the space under the primary equals the space over it
assert.match(navCss, /--shell-nav-h:calc\(var\(--shell-nav-cta-h\) \+ 2 \* var\(--shell-nav-pad\)\)/, 'the bar is its primary plus one inset each side');
assert.match(navCss, /:root\{--shell-nav-cta-h:var\(--btn-h-m\);/, 'the primary is the kit\'s 48 px button');
assert.match(navCss, /@media \(width < 768px\)\{:root\{--shell-nav-cta-h:var\(--target-min\);--shell-nav-pad:calc\(var\(--s3\) \/ 2\)\}\}/, 'a phone keeps the 44 px touch target in the 56 px bar (6 px each side)');
assert.match(navCss, /\.public-nav__cta\{--h:var\(--shell-nav-cta-h\);/, 'the bar\'s Play takes the primary height');
assert.equal((navCss.match(/--shell-nav-h:/g) ?? []).length, 1, 'no band sets the bar\'s height apart from its primary');
assert.equal((navCss.match(/\.public-nav__cta\{--h:/g) ?? []).length, 1, 'no band or pointer resizes the primary apart from the bar');
assert.doesNotMatch(navCss.match(/\.public-nav\{[^}]*\}/)?.[0] ?? '', /border/, 'the bar\'s rule takes none of its height');
assert.match(navCss, /\.public-nav::after\{content:'';position:absolute;inset:100% 0 auto;height:1px;background:var\(--line-1\)/,
  'the bar\'s rule hangs under it');
assert.match(shellSource, /class="public-nav__menu-trigger" type="button" aria-expanded="false" aria-controls="public-nav-menu"/,
  'the phone menu trigger is static markup');
// the sheet is a transient surface: Escape and a press outside it are the surface stack's (components/surfaceStack.ts)
assert.match(navSource, /id: 'public-nav-menu',[\s\S]*?close: \(reason\) => set\(false, reason === 'escape'\)/, 'the menu sheet closes with Escape, its focus back on the trigger');
assert.match(navSource, /if \(open\) openSurface\(surface, trigger\); else closeSurface\(surface\);/, 'the menu sheet stands on the surface stack');
assert.match(navSource, /setLocale\(locale\)/, 'the language links persist the choice through the canonical i18n owner');
assert.match(shellSource, /\/brand\/partners\/general-translation\.png/, 'the footer credits General Translation with its packaged mark');
assert.ok(existsSync(join(ROOT, 'public/brand/mark.svg')), 'the Bracket Chevron mark ships for the public pages');
for (const [surface, css] of [
  ['shared public navigation', navCss],
  ['Home', homeCss],
  ['Docs', docsCss],
  ['Gallery', galleryCss],
]) {
  assert.doesNotMatch(css, /cot-warning-tape/,
    `${surface} must leave the warning-tape motif exclusively to the 404 page`);
}

const expectedLinks = [
  ['/gallery', 'Tank Gallery'],
  ['/docs', 'Field Manual'],
  ['/studio', 'Studio'],
  ['/docs/filming#library', 'Media'],
];
for (const [file, activeHref] of pages) {
  const html = readFileSync(join(ROOT, file), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="\/src\/presentation\/publicNav\.css">/);
  assert.match(html, /<script type="module" src="\/src\/presentation\/publicNav\.ts"><\/script>/);
  assert.doesNotMatch(html, /logo-mark(?:-metal|-bw)?\.svg/, `${file} must not show the retired crest`);
  const nav = /<!--cot:nav-->([\s\S]*?)<!--\/cot:nav-->/.exec(html)?.[1];
  assert.ok(nav, `${file} must carry the shared public nav`);
  assert.match(nav, /<a class="public-nav__brand" href="\/home"[^>]*><svg class="cot-mark"[\s\S]*?<span class="cot-wordmark"><svg class="wm" viewBox="[^"]+" aria-hidden="true" focusable="false">[\s\S]*?<\/svg><\/span><\/a>/,
    `${file} bar opens with the mark and the wordmark`);
  const linksBlock = /<div class="public-nav__links">([\s\S]*?)<\/div>/.exec(nav)?.[1] ?? '';
  const links = [...linksBlock.matchAll(/<a href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: m[1], attrs: m[2], label: m[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  }));
  assert.deepEqual(links.map(({ href, label }) => [href, label]), expectedLinks, `${file} nav links drifted`);
  const active = links.filter(({ attrs }) => attrs.includes('aria-current="page"')).map(({ href }) => href);
  assert.deepEqual(active, activeHref === '/home' ? [] : [activeHref], `${file} marks its own destination`);
  if (activeHref === '/home') assert.match(nav, /class="public-nav__brand" href="\/home" aria-current="page"/, 'the landing marks the brand link');
  assert.match(linksBlock, /href="#i-manual(?:-s)?"/, `${file} must use the shared Field Manual glyph`);
  assert.match(nav, /<a class="cot-c-btn cot-c-btn--primary cot-c-btn--36 public-nav__cta" href="\/">[\s\S]*?Play Now/, `${file} has one primary Play Now`);
  assert.match(nav, /class="public-nav__icon-link public-nav__github" href="https:\/\/github\.com\/Kevin-Liu-01\/claude-of-tanks" target="_blank"/,
    `${file} GitHub control opens the repository`);
  assert.match(nav, /hreflang="en-US"[^>]*>EN<\/a><a href="\/cn[^"]*" hreflang="zh-CN"/, `${file} names both locales`);
  const symbols = /<!--cot:symbols-->([\s\S]*?)<!--\/cot:symbols-->/.exec(html)?.[1] ?? '';
  for (const [, id] of nav.matchAll(/href="#(i-[A-Za-z0-9-]+)"/g)) {
    assert.ok(symbols.includes(`<symbol id="${id}"`), `${file} inlines ${id} so the bar paints without the sprite chunk`);
  }
}

const notFoundHtml = readFileSync(join(ROOT, '404.html'), 'utf8');
// brand-ui SPEC 12.3.4: the missing page carries the shared bar and footer (tools/public-shell.mjs lists it), and no
// destination is current on it
assert.match(notFoundHtml, /<link rel="stylesheet" href="\/src\/presentation\/publicNav\.css">/, 'the 404 links the shell sheet');
assert.match(notFoundHtml, /<!--cot:nav--><a class="public-skip"[\s\S]*?<nav class="public-nav"/, 'the 404 carries the shared bar');
assert.doesNotMatch(/<!--cot:nav-->([\s\S]*?)<!--\/cot:nav-->/.exec(notFoundHtml)?.[1] ?? '', /aria-current/, 'no destination is current on the 404');
assert.match(notFoundHtml, /<script type="module" src="\/src\/presentation\/notFound\.ts"><\/script>/,
  'the 404 keeps its own runtime (it imports the shell\'s)');

const gameHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
assert.match(gameHtml, /:is\(\.cot-boot-links, \.cot-boot-nav\)\s*\{[^}]*display: flex; gap: 4px;/,
  'boot utility controls are one row of quiet buttons in the foot, and the site pages one at the head (the 2026-10-26 boot redesign)');
assert.match(gameHtml,
  /:is\(\.cot-boot-links, \.cot-boot-nav\) > \.cot-boot-link\s*\{[^}]*width: auto; min-width: 0;[^}]*padding: 0 12px;/,
  'boot utility controls must keep balanced content-driven horizontal padding');
assert.doesNotMatch(gameHtml, /\.cot-boot-(?:links|nav)\) > \.cot-boot-link\s*\{[^}]*width: 132px;/,
  'boot utility controls must not return to the fixed width that cramped GitHub');
// the boot screen's way out (owner 2026-10-27): the site's pages as plain same-tab anchors in the splash's controls
const bootNav = /<!--cot:bootnav-->([\s\S]*?)<!--\/cot:bootnav-->/.exec(gameHtml)?.[1] ?? '';
assert.deepEqual([...bootNav.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => m[1]), ['/home', '/gallery', '/docs'],
  'the boot screen links home, the Tank Gallery and the Field Manual');
assert.match(bootNav, /^<nav class="cot-boot-nav" data-cot-boot-control /, 'the boot links are splash controls, never an entry gesture');
assert.doesNotMatch(bootNav, /\starget=|<script|<use\b|\son[a-z]+=/, 'plain same-tab anchors with their glyphs inline');
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
// the Premiere top bar (bui01 05-garage): the wordmark leads and returns Home; Record is one of the workspace tabs
const homeControl = garageSource.indexOf('class="cot-wordmark" data-nav="home"');
const workspaceTabs = garageSource.indexOf('class="cot-gbar cot-header-nav"');
const recordControl = garageSource.indexOf('cot-record-trigger"');
const utilities = garageSource.indexOf('class="cot-nav cot-header-nav"');
assert.ok(homeControl >= 0 && workspaceTabs > homeControl && recordControl > workspaceTabs && utilities > recordControl,
  'the garage wordmark returns Home ahead of the workspace tabs, Record is one of those tabs, and the utilities follow');
const galleryControl = garageSource.indexOf('data-nav="gallery"');
const docsControl = garageSource.indexOf('data-nav="docs"');
const githubControl = garageSource.indexOf('class="nv cot-github"');
assert.ok(galleryControl > workspaceTabs && docsControl > galleryControl && githubControl > docsControl,
  'the workspace tabs run Gallery before Docs, and GitHub sits with the utilities after them');
const settingsSlot = garageSource.indexOf('class="cot-settings-slot"');
const mobileMenuTrigger = garageSource.indexOf('class="nv cot-mobile-nav-trigger"');
assert.ok(githubControl >= 0 && settingsSlot > githubControl && mobileMenuTrigger > settingsSlot,
  'garage mobile utilities must resolve to GitHub, settings, then the menu trigger');
for (const destination of ['home', 'garage', 'studio', 'gallery', 'docs', 'record']) {
  assert.ok(garageSource.includes(`data-mobile-nav="${destination}"`),
    `garage mobile menu must expose ${destination}`);
}
assert.match(garageCss, /body\[data-cot-panels='overlay'\] \.cot-nav \.cot-nav-desktop\{display:none\}/,
  'overlay panel layouts collapse the desktop utilities');
assert.match(readFileSync(join(ROOT, 'src/ui/showroom.css'), 'utf8'), /body\[data-cot-panels='overlay'\] \.cot-gbar,/,
  'overlay panel layouts collapse the workspace tabs (the menu carries them)');
assert.match(garageSource,
  /class="github-stars" data-github-stars data-github-stars-state="loading" aria-busy="true"/,
  'garage GitHub control exposes the shared loading state before the verified live star count');
assert.doesNotMatch(garageSource, /data-github-stars[^>]*>\s*\d+\s*<\/span>/,
  'garage GitHub control must not ship a stale numeric fallback');

for (const file of ['site/home.html']) {
  const html = readFileSync(join(ROOT, file), 'utf8');
  const repositoryLinks = [...html.matchAll(/<a[^>]+href="https:\/\/github\.com\/Kevin-Liu-01\/(?:Claude-of-Tanks|claude-of-tanks)"[^>]*>([\s\S]*?)<\/a>/g)];
  assert.ok(repositoryLinks.length >= 2, `${file} must retain navbar and footer repository controls`);
  for (const [, contents] of repositoryLinks.filter(([tag]) => !tag.includes('public-nav__github'))) {
    assert.ok(contents.includes('data-github-stars'), `${file} repository control is missing its star count`);
    assert.ok(contents.includes('data-github-stars-state="loading"'),
      `${file} repository control must render the shared loading state`);
    assert.doesNotMatch(contents, /data-github-stars[^>]*>\s*\d+\s*<\/span>/,
      `${file} repository control must not ship a stale numeric fallback`);
  }
}

console.log('public navigation selftest passed');
