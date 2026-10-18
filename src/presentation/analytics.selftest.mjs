import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';
import { runtimeImportSpecifiers } from '../../tools/static-import-closure.mjs';

const entrypoints = [
  'site/home.html',
  'site/docs.html',
  'site/docs-topic.html',
  'site/docs-build.html',
  'site/docs-models.html',
  'site/docs-simulation.html',
  'site/docs-vehicles.html',
  'site/docs-rendering.html',
  'site/docs-performance.html',
  'site/docs-worlds.html',
  'site/docs-ai.html',
  'site/docs-multiplayer.html',
  'site/docs-audio.html',
  'site/docs-interface.html',
  'site/docs-studio.html',
  'site/docs-filming.html',
  'site/gallery.html',
];
// GA4 runs on every public non-game page: the Vercel Analytics pages above plus the 404 (GA only).
const googleAnalyticsPages = [...entrypoints, '404.html'];
const GA_MEASUREMENT_ID = 'G-0ZV67MX92H';
const GA_LOADERS = { 'src/analytics.ts': '/src/analytics.ts', 'src/presentation/notFound.ts': '/src/presentation/notFound.ts' };

const gameEntry = await readFile('index.html', 'utf8');
assert.doesNotMatch(
  gameEntry,
  /src=["']\/src\/analytics\.ts["']/,
  'the latency-sensitive game entry must not schedule third-party analytics',
);
assert.doesNotMatch(gameEntry, /googletagmanager|google-analytics|gtag|G-0ZV67MX92H|\/src\/presentation\/notFound\.ts/,
  'the game entry must never load Google Analytics');

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(
  packageJson.dependencies?.['@vercel/analytics'],
  '^2.0.1',
  'Vercel Analytics must remain a production dependency',
);

const analyticsSource = await readFile('src/analytics.ts', 'utf8');
assert.match(analyticsSource, /import\(['"]@vercel\/analytics['"]\)/,
  'analytics module lazily imports the Vercel client');
assert.match(analyticsSource, /\binject\s*\(/,
  'analytics module injects the Vercel client');
assert.match(analyticsSource, /import\.meta\.env\.PROD/,
  'analytics mode follows the Vite production environment');
assert.match(analyticsSource, /requestIdleCallback/,
  'analytics stays outside the page critical path');
assert.match(analyticsSource, /VITE_SELF_HOSTED\s*===\s*['"]1['"]/,
  'self-hosted builds can compile out hosted telemetry');

for (const entrypoint of entrypoints) {
  const html = await readFile(entrypoint, 'utf8');
  const references = html.match(/src=["']\/src\/analytics\.ts["']/g) ?? [];
  assert.equal(references.length, 1, `${entrypoint} must load analytics exactly once`);
  assert.doesNotMatch(html,
    /<(?:script|img|audio|video|source)\b[^>]*\bsrc=["']https?:\/\//i,
    `${entrypoint} must package every automatic subresource locally`);
}

// --- Google Analytics 4: the listed public non-game pages only --------------------------------------------------
// Every HTML build entry: GA reaches a page only through one of its two loaders, and exactly the listed pages load one.
const viteConfig = await readFile('vite.config.ts', 'utf8');
const rollupInput = /\binput:\s*\{([\s\S]*?)\n\s*\},/.exec(viteConfig)?.[1] ?? '';
const htmlEntries = [...rollupInput.matchAll(/resolve\(process\.cwd\(\), '([^']+\.html)'\)/g)].map((match) => match[1]);
assert.ok(htmlEntries.includes('index.html'), 'the build entries were read from vite.config.ts');
for (const page of googleAnalyticsPages) assert.ok(htmlEntries.includes(page), `${page} must be a build entry`);
for (const entry of htmlEntries) {
  const html = await readFile(entry, 'utf8');
  const loaders = Object.values(GA_LOADERS).filter((src) => html.includes(`src="${src}"`) || html.includes(`src='${src}'`));
  assert.equal(loaders.length, googleAnalyticsPages.includes(entry) ? 1 : 0,
    `${entry}: ${googleAnalyticsPages.includes(entry) ? 'must load GA4 exactly once' : 'must not load GA4'}`);
  assert.doesNotMatch(html, /googleAnalytics|googletagmanager|google-analytics|gtag|G-0ZV67MX92H/,
    `${entry}: GA4 loads only through src/googleAnalytics.ts`);
}

// The module graph: src/googleAnalytics.ts is imported by its two loaders only, and nothing imports a loader, so no
// other page (the game included) can reach it. The ID and the gtag.js host live in that one module.
const repoFiles = (needle, pathspecs = ['src', '*.html']) => {
  let listing = '';
  try {
    listing = execFileSync('git', ['grep', '-I', '-l', '-F', '--untracked', '-e', needle, '--', ...pathspecs],
      { encoding: 'utf8', maxBuffer: 8_000_000 });
  } catch (error) {
    if (error.status !== 1) throw error; // git grep exits 1 when nothing matches
  }
  return listing.split('\n').filter((path) => path && !/\.selftest\.mjs$|\.d\.ts$/.test(path)).sort();
};
// Static edges as the shared closure walker reads them, plus every literal lazy import().
const importSpecifiers = (source, file) => [...runtimeImportSpecifiers(source, file),
  ...[...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1])];
const resolvesTo = (importer, specifier, target) => /^\.{1,2}\//.test(specifier)
  && [target, target.replace(/\.ts$/, ''), target.replace(/\.ts$/, '.js')]
    .includes(posix.normalize(posix.join(posix.dirname(importer), specifier)));
const importersOf = async (target) => {
  const needle = posix.basename(target).replace(/\.ts$/, '');
  const importers = [];
  for (const file of repoFiles(needle, ['src/*.ts', 'src/*.js', 'src/*.mjs'])) {
    const source = await readFile(file, 'utf8');
    if (importSpecifiers(source, file).some((specifier) => resolvesTo(file, specifier, target))) importers.push(file);
  }
  return importers;
};
assert.deepEqual(await importersOf('src/googleAnalytics.ts'), Object.keys(GA_LOADERS).sort(),
  'only src/analytics.ts and the 404 runtime may import src/googleAnalytics.ts');
for (const loader of Object.keys(GA_LOADERS)) {
  assert.deepEqual(await importersOf(loader), [], `${loader} is a page entry: no module may import it`);
}
assert.deepEqual(repoFiles(GA_MEASUREMENT_ID), ['src/googleAnalytics.ts'], 'the measurement ID lives in one constant');
assert.deepEqual(repoFiles('googletagmanager.com'), ['src/googleAnalytics.ts'], 'gtag.js loads from one module');

// Both loaders fetch GA4 lazily after idle, as the Vercel client is fetched, and self-hosted builds compile it out.
const notFoundSource = await readFile('src/presentation/notFound.ts', 'utf8');
for (const [loader, source] of [['src/analytics.ts', analyticsSource], ['src/presentation/notFound.ts', notFoundSource]]) {
  assert.match(source, /\bimport\(['"]\.{1,2}\/googleAnalytics\.ts['"]\)/, `${loader}: GA4 is a lazy import`);
  assert.doesNotMatch(source, /^\s*import\s[^(]*googleAnalytics/m, `${loader}: GA4 must never be a static import`);
  assert.match(source, /requestIdleCallback\(mount\w*, \{ timeout: 4000 \}\)[\s\S]*?\}, 3800\);/,
    `${loader}: GA4 mounts after idle, never during the page load`);
}
assert.match(analyticsSource, /if \(!selfHostedBuild\) \{[\s\S]*requestIdleCallback\(mountAll\b/,
  'src/analytics.ts mounts GA4 only outside self-hosted builds');
assert.match(notFoundSource, /if \(import\.meta\.env\.VITE_SELF_HOSTED !== '1'/,
  'the 404 mounts GA4 only outside self-hosted builds');

// The module itself: one public constant, the production host only, Consent Mode before gtag.js, no manual events.
const gaSource = await readFile('src/googleAnalytics.ts', 'utf8');
assert.equal(gaSource.split(GA_MEASUREMENT_ID).length - 1, 1, 'the measurement ID is written once');
assert.match(gaSource, /const PRODUCTION_HOST = 'cot\.kevinliu\.studio';/, 'GA4 is gated on the production host');
assert.match(gaSource, /page_location: target\.location\.origin \+ target\.location\.pathname\b/,
  'page_location never carries the query string');
assert.ok(gaSource.lastIndexOf("gtag('consent'") < gaSource.indexOf('googletagmanager.com/gtag/js'),
  'the consent defaults are queued before gtag.js loads');
assert.doesNotMatch(gaSource, /gtag\(\s*['"]event['"]/, 'GA4 sends no manual events');

// Behaviour, against a stand-in browser (importing the module touches no browser global).
const { mountGoogleAnalytics } = await import('../googleAnalytics.ts');
const stage = ({ hostname, pathname = '/docs/ai', search = '', referrer = '', webdriver = false }) => {
  const log = [];
  const dataLayer = [];
  dataLayer.push = (...entries) => { for (const entry of entries) log.push({ kind: 'command', entry }); return Array.prototype.push.apply(dataLayer, entries); };
  const target = {
    dataLayer,
    location: { hostname, origin: `https://${hostname}`, pathname, search, href: `https://${hostname}${pathname}${search}` },
    navigator: { webdriver },
    document: {
      referrer,
      createElement: (tagName) => ({ tagName }),
      head: { append: (element) => log.push({ kind: 'script', element }) },
    },
  };
  return { target, log, mounted: mountGoogleAnalytics(target) };
};
for (const hostname of ['localhost', '127.0.0.1', 'claude-of-tanks-git-main-kl01s-projects.vercel.app',
  'claudeoftanks.kevinliu.studio', 'kevinliu.studio', 'cot.kevinliu.studio.example.test']) {
  const { mounted, log } = stage({ hostname, search: '?room=r1&host=Kevin' });
  assert.equal(mounted, false, `${hostname}: GA4 must not mount off the production host`);
  assert.deepEqual(log, [], `${hostname}: nothing is queued or loaded`);
}
assert.deepEqual(stage({ hostname: 'cot.kevinliu.studio', webdriver: true }).log, [],
  'automated browsers (e2e, probes) send nothing, even on the production host');

const production = stage({
  hostname: 'cot.kevinliu.studio', search: '?room=r1&host=Kevin',
  referrer: 'https://cot.kevinliu.studio/?room=r1&host=Kevin#garage',
});
assert.equal(production.mounted, true, 'GA4 mounts on cot.kevinliu.studio');
assert.deepEqual(production.log.map(({ kind }) => kind), ['command', 'command', 'command', 'command', 'script'],
  'four gtag commands are queued before gtag.js is appended');
for (const { kind, entry } of production.log) {
  if (kind === 'command') assert.equal(Object.prototype.toString.call(entry), '[object Arguments]', 'gtag queues Arguments objects');
}
const commands = production.log.filter(({ kind }) => kind === 'command').map(({ entry }) => Array.from(entry));
const denied = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
assert.deepEqual(commands[0], ['consent', 'default', { ...denied, analytics_storage: 'denied',
  region: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'LV', 'LI', 'LT',
    'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'CH', 'GB'] }],
'the EEA, UK and Swiss consent default comes first');
assert.deepEqual(commands[1], ['consent', 'default', { ...denied, analytics_storage: 'granted' }],
  'the global consent default grants analytics storage only');
assert.equal(commands[2][0], 'js');
assert.ok(commands[2][1] instanceof Date, 'gtag js carries the load time');
assert.deepEqual(commands[3], ['config', GA_MEASUREMENT_ID, {
  page_location: 'https://cot.kevinliu.studio/docs/ai',
  page_referrer: 'https://cot.kevinliu.studio/',
}], 'config sends the page and the referrer without their query strings');
assert.doesNotMatch(JSON.stringify(commands), /room|Kevin|\?|#/, 'no query string or fragment leaves the browser');
const script = production.log.at(-1).element;
assert.equal(script.tagName, 'script');
assert.equal(script.async, true, 'gtag.js loads async');
assert.equal(script.src, `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`);
assert.ok(!('page_referrer' in Array.from(stage({ hostname: 'cot.kevinliu.studio' }).log[3].entry)[2]),
  'a direct visit sends no referrer');

console.log(`analytics selftest passed (${entrypoints.length} public entrypoints; GA4 on ${googleAnalyticsPages.length} non-game pages, `
  + 'production host only, consent first, no query strings; never the game entry; VITE_SELF_HOSTED=1 compiles the telemetry out)');

// The production test chain invokes this file directly, so keep the public
// discovery/metadata contract coupled to every analytics entrypoint check.
