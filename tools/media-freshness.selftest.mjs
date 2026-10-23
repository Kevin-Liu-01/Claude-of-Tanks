// media-freshness.selftest.mjs — every media URL the site names is on a current round (brand-ui SPEC 8.1, 8.3;
// SHOWCASE §5.7 and §7; BUI-F7; the owner: "no old UI or old pictures anywhere").
//
// Every /media/, /maps/, /field-guide/ and /brand/og URL in site/*.html, index.html, 404.html, public/home.css, src/**
// and the manifests the pages render at run time (the site archive, the fleet takes) resolves to a collection on the
// allowlist below. A retiring collection stays allowed only until its replacement lands: the moment the replacement's
// files are in public/, any reference left to the retired one fails, naming the file that still uses it.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT } from './media-page-scan.mjs';

/** Current collections: what they are. */
const CURRENT = Object.freeze({
  'site50-r14': 'the site fifty, round 14 (re-filmed on the GO tip under the same names)',
  'web-video-r1': 'the phone H.264 rungs of the round-14 takes',
  'filming-r1': 'the Filming manual\'s takes and process',
  'social-proof': 'community posts (not showcase media)',
  'production-r1': 'the production archive\'s manifest',
  'capture-recipes-r1.json': 'the Studio recipes behind the archive\'s media',
  'versus-r1': 'the versus stills (the GO renders, media/land226)',
  'showcase-r2/process': 'the review sheets of the filming process',
  maps: 'the battlefields\' art and cards (the S2 re-renders land under the same names)',
  'brand/og': 'the social cards (regenerated from their sources)',
});

/**
 * Retiring collections (SHOWCASE §7): allowed until their replacement lands. `landed(tree)` reads the public/ tree
 * ({ dirs: names under public/media, has(path) }).
 */
const RETIRING = Object.freeze([
  { name: 'the old garages', match: /^\/media\/(?:showcase-r2\/(?:0\d|10|16)_|garage-environments-r2\/)/,
    replacement: 'S4, the redesigned garages\' beauty set (public/media/garages-*)',
    landed: (tree) => tree.dirs.some((dir) => /^(?:garages|garage-beauty)-/.test(dir)) },
  { name: 'the pre-overhaul interface pictures', match: /^(?:\/media\/(?:showcase-r2\/(?:1[1-9]|2[0-5])_|presentation-r1\/ui_|home\/ui_|multiplayer-r1\/)|\/field-guide\/)/,
    replacement: 'S12, the post-overhaul interface captures (public/media/ui-*)',
    landed: (tree) => tree.dirs.some((dir) => /^ui-/.test(dir)) },
  { name: 'the August portraits', match: /^\/media\/modern\//,
    replacement: 'S5, the front portraits (public/media/portraits-*)',
    landed: (tree) => tree.dirs.some((dir) => /^portraits-/.test(dir)) },
  { name: 'the August feature evidence', match: /^\/media\/feature-evidence-r2\//,
    replacement: 'the GO renders (public/media/versus-r1)', landed: (tree) => tree.dirs.includes('versus-r1') },
  { name: 'the landing\'s Studio stand-in', match: /^\/media\/landing-r1\/studio-leclerc-knockout\./,
    replacement: 'J, the Studio loop (site50-r14/home/features/studio.mp4)',
    landed: (tree) => tree.has('/media/site50-r14/home/features/studio.mp4') },
  { name: 'the PNG game card', match: /^\/brand\/og-image\.png$/,
    replacement: 'the ≤ 200 KB jpg from f6-r6 (public/brand/og-image.jpg)', landed: (tree) => tree.has('/brand/og-image.jpg') },
]);

/** The collection a site path belongs to, or null for a path outside the media roots. */
function collectionOf(path) {
  if (path.startsWith('/maps/')) return 'maps';
  if (path.startsWith('/brand/og')) return 'brand/og';
  if (path.startsWith('/field-guide/')) return 'field-guide';
  const media = /^\/media\/([^/]+)(?:\/([^/]+))?/.exec(path);
  if (!media) return null;
  if (media[1] === 'showcase-r2' && media[2] === 'process') return 'showcase-r2/process';
  return media[1];
}

/** The verdict on one reference: { ok, why }. */
function verdict(path, tree) {
  const retiring = RETIRING.find((rule) => rule.match.test(path));
  if (retiring) {
    return retiring.landed(tree)
      ? { ok: false, why: `${retiring.name} retired when ${retiring.replacement} landed` }
      : { ok: true, why: `retiring: ${retiring.name}, until ${retiring.replacement}` };
  }
  const collection = collectionOf(path);
  if (collection && Object.hasOwn(CURRENT, collection)) return { ok: true, why: CURRENT[collection] };
  return { ok: false, why: `${collection ?? path} is on no current round (add it to CURRENT with what it is, or retire it)` };
}

// The rule on fixtures: a retired collection passes until its replacement lands, then fails.
{
  const before = { dirs: ['site50-r14', 'showcase-r2', 'garage-environments-r2'], has: () => false };
  const after = { dirs: ['site50-r14', 'showcase-r2', 'garages-226', 'ui-227', 'portraits-r1', 'versus-r1'], has: () => true };
  for (const path of ['/media/showcase-r2/03_garage_verdant.webp', '/media/garage-environments-r2/x.webp',
    '/media/showcase-r2/17_live_player_hud.webp', '/media/presentation-r1/ui_mobile.webp', '/media/home/ui_roster.webp',
    '/media/multiplayer-r1/dual-perspective.webp', '/field-guide/armor.webp', '/media/modern/t90.webp',
    '/media/feature-evidence-r2/a.webp', '/brand/og-image.png']) {
    assert.equal(verdict(path, before).ok, true, `${path}: allowed while its replacement is pending`);
    assert.equal(verdict(path, after).ok, false, `${path}: fails once its replacement lands`);
  }
  assert.equal(verdict('/media/showcase-r2/process/review-01.webp', after).ok, true, 'the process sheets are not the garages');
  assert.equal(verdict('/media/site50-r14/stills/s05-barn-advance.webp', after).ok, true);
  assert.equal(verdict('/media/brand-new-r1/x.webp', before).ok, false, 'an unknown collection fails until it is allowlisted');
  assert.equal(collectionOf('/media/capture-recipes-r1.json'), 'capture-recipes-r1.json');
}

// The references.
const MEDIA_URL = /(?<=["'`(\s=,])\/(?:media|maps|field-guide|brand\/og)[\w./-]*?\.(?:webp|jpe?g|png|avif|gif|webm|mp4|json)(?=["'`)\s?#,]|$)/g;
const ORIGIN_URL = /https:\/\/cot\.kevinliu\.studio(\/(?:media|maps|field-guide|brand\/og)[\w./-]*?\.(?:webp|jpe?g|png|avif|webm|mp4|json))/g;
const SKIP = /\.(?:selftest|test-support)\.mjs$|\.generated\.json$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(?:ts|css|html|json|mjs)$/.test(name) && !SKIP.test(name)) out.push(path);
  }
  return out;
}
const sources = [
  ...readdirSync(join(ROOT, 'site')).filter((name) => name.endsWith('.html')).map((name) => join(ROOT, 'site', name)),
  join(ROOT, 'index.html'), join(ROOT, '404.html'), join(ROOT, 'public/home.css'),
  ...walk(join(ROOT, 'src')),
  // the manifests the pages render at run time
  ...['public/media/site50-r14/archive.json', 'public/media/site50-r14/fleet/index.json'].map((file) => join(ROOT, file)),
].filter((file) => existsSync(file));

const references = new Map();
for (const file of sources) {
  const text = readFileSync(file, 'utf8');
  const found = new Set([...text.matchAll(MEDIA_URL)].map((match) => match[0]));
  for (const match of text.matchAll(ORIGIN_URL)) found.add(match[1]);
  for (const path of found) {
    if (!references.has(path)) references.set(path, new Set());
    references.get(path).add(relative(ROOT, file));
  }
}
assert.ok(references.size > 300, `the scan found only ${references.size} media references`);

const mediaDirs = readdirSync(join(ROOT, 'public/media')).filter((name) => statSync(join(ROOT, 'public/media', name)).isDirectory());
const tree = { dirs: mediaDirs, has: (path) => existsSync(join(ROOT, 'public', path.replace(/^\//, ''))) };
const failures = [];
const retiring = new Map();
for (const [path, files] of [...references].sort()) {
  const result = verdict(path, tree);
  if (!result.ok) failures.push(`${path} (${[...files].join(', ')}): ${result.why}`);
  else if (result.why.startsWith('retiring')) retiring.set(result.why, (retiring.get(result.why) ?? 0) + 1);
}
assert.deepEqual(failures, [], `media references off the current rounds:\n  ${failures.join('\n  ')}`);
console.log(`media-freshness.selftest: ${references.size} media references from ${sources.length} files, all on current rounds; `
  + `${[...retiring.values()].reduce((a, b) => a + b, 0)} still on retiring collections, each failing the moment its replacement lands `
  + `(${[...retiring].map(([why, count]) => `${count} ${why.replace(/^retiring: /, '')}`).join('; ') || 'none'})`);
