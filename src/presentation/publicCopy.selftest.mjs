import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pageFiles = ['home.html', 'gallery.html', 'docs.html'];
const supportingFiles = [
  'README.md',
  'src/gallery/catalog.js',
  'src/presentation/mediaArchive.ts',
];
const retiredPhrases = [
  'Every system. In the frame.',
  'Not a render reel.',
  'Designed as one armored machine.',
  'One result, fully explained.',
  'Sixteen maps, no empty fields.',
  'One command language.',
  'One source of truth.',
  'The game, not a promise.',
  'Clients request. Authority decides. Rooms persist.',
  'Code outranks copy',
  'Claims end in executable evidence.',
  'Contact sheets are the visual gate.',
  'Start the engine.',
  'Tanks in context.',
];

for (const file of [...pageFiles, ...supportingFiles]) {
  const source = readFileSync(join(ROOT, file), 'utf8');
  for (const phrase of retiredPhrases) {
    assert.ok(!source.includes(phrase), `${file} reintroduced retired campaign copy: ${phrase}`);
  }
}

for (const file of pageFiles) {
  const html = readFileSync(join(ROOT, file), 'utf8');
  const headings = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/g)]
    .map((match) => match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  assert.ok(headings.length > 0, `${file} has no public headings`);
  for (const heading of headings) {
    assert.doesNotMatch(heading, /[.!?]$/, `${file} uses a sentence fragment as a heading: ${heading}`);
  }
}

const gallerySource = readFileSync(join(ROOT, 'src/gallery/gallery.js'), 'utf8');
const docsScriptSource = readFileSync(join(ROOT, 'src/docs/docs.js'), 'utf8');
assert.doesNotMatch(gallerySource, /mountMediaArchive|galleryArchiveOpen/);
assert.match(docsScriptSource, /mountMediaArchive\([\s\S]*?\{ mode: 'wall', limit: 88, filters: false \}/);

const homeSource = readFileSync(join(ROOT, 'home.html'), 'utf8');
const docsSource = readFileSync(join(ROOT, 'docs.html'), 'utf8');
const galleryHtmlSource = readFileSync(join(ROOT, 'gallery.html'), 'utf8');
const readmeSource = readFileSync(join(ROOT, 'README.md'), 'utf8');
assert.doesNotMatch(galleryHtmlSource, /Live simulation data|galleryArchiveOpen|galleryArchiveTitle/);
assert.match(docsSource, /id="docsArchiveOpen"[\s\S]*?Visual archive[\s\S]*?88 field frames/);
assert.match(docsSource, /id="docsArchive"[\s\S]*?id="docsArchiveBody"/);
assert.match(homeSource, /\/media\/promo-v13\/claude-of-tanks-promo-clean\.mp4/);
assert.doesNotMatch(homeSource, /claude-of-tanks-promo-badged\.mp4/);
assert.match(docsSource, /\/media\/promo-v13\/claude-of-tanks-promo-badged\.mp4/);
assert.match(docsSource, /<track kind="captions"[^>]+claude-of-tanks-promo-v13\.vtt/);

const landingIcons = [
  'play', 'screenshots', 'vehicle', 'battlefield', 'gpu', 'multiplayer',
  'live-combat', 'modules', 'camera-paths', 'missile', 'armor',
];
for (const icon of landingIcons) {
  const relative = `brand/features/${icon}.svg`;
  const asset = readFileSync(join(ROOT, 'public', relative), 'utf8');
  assert.match(asset, /^<svg[^>]+viewBox="0 0 64 64"/, `${icon} icon must use the shared 64 px grid`);
  assert.match(asset, /role="img" aria-label="[^"]+"/, `${icon} icon must describe its visual concept`);
  assert.ok(homeSource.includes(`/${relative}`), `landing page must use ${icon}.svg`);
  assert.ok(readmeSource.includes(`public/${relative}`), `README must show ${icon}.svg`);
}
for (const relative of ['brand/nav/docs.svg', 'brand/nav/tank-gallery.svg', 'brand/nav/studio.svg']) {
  assert.ok(readmeSource.includes(`public/${relative}`), `README must show ${relative}`);
}
const docsMark = readFileSync(join(ROOT, 'public/brand/nav/docs.svg'), 'utf8');
assert.match(docsMark, /data-vehicle="m1a2"/, 'Docs mark must use the shared M1A2 vehicle silhouette');
assert.doesNotMatch(docsMark, /<image|data:image\//, 'Docs mark must use crisp native vector geometry');

const promoRoot = join(ROOT, 'public/media/promo-v13');
const promoManifest = JSON.parse(readFileSync(join(promoRoot, 'manifest.json'), 'utf8'));
assert.equal(promoManifest.version, 13);
for (const asset of Object.values(promoManifest.assets)) {
  assert.ok(existsSync(join(ROOT, 'public', asset.file)), `missing approved promo: ${asset.file}`);
  assert.ok(existsSync(join(ROOT, 'public', asset.poster)), `missing approved poster: ${asset.poster}`);
  if (asset.captions) assert.ok(existsSync(join(ROOT, 'public', asset.captions)), `missing promo captions: ${asset.captions}`);
}

console.log('public copy selftest passed');
