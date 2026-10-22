import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { typeTokenCss, TYPE_STACK } from '../ui/typeFaces.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pageFiles = ['site/home.html', 'site/gallery.html', 'site/docs.html'];
const supportingFiles = [
  'README.md',
  'src/gallery/catalog.ts',
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

const gallerySource = readFileSync(join(ROOT, 'src/gallery/gallery.ts'), 'utf8');
const docsScriptSource = readFileSync(join(ROOT, 'src/docs/docs.ts'), 'utf8');
assert.doesNotMatch(gallerySource, /mountMediaArchive|galleryArchiveOpen/);
// the visual archive is the site fifty's (public/media/site50-r14/archive.json: the fifty frames and each take's
// stills) after production-r1's battlefield photographs; the manual's wall shows all of it
const siteArchive = JSON.parse(readFileSync(join(ROOT, 'public/media/site50-r14/archive.json'), 'utf8'));
const productionShots = JSON.parse(readFileSync(join(ROOT, 'public/media/production-r1/manifest.json'), 'utf8')).shots;
const archiveCount = siteArchive.shots.length + productionShots.length;
assert.ok(docsScriptSource.includes(`{ mode: 'wall', limit: ${archiveCount}, filters: false }`),
  'the manual\'s wall shows the whole archive');

const homeSource = readFileSync(join(ROOT, 'site/home.html'), 'utf8');
const homeStyles = readFileSync(join(ROOT, 'src/presentation/home.css'), 'utf8');
const docsSource = readFileSync(join(ROOT, 'site/docs.html'), 'utf8');
const galleryHtmlSource = readFileSync(join(ROOT, 'site/gallery.html'), 'utf8');
const readmeSource = readFileSync(join(ROOT, 'README.md'), 'utf8');
assert.doesNotMatch(galleryHtmlSource, /Live simulation data|galleryArchiveOpen|galleryArchiveTitle/);
assert.ok(new RegExp(`id="docsArchiveOpen"[\\s\\S]*?Visual archive[\\s\\S]*?${archiveCount} field frames`).test(docsSource),
  'the archive card counts the archive');
assert.match(docsSource, /id="docsArchive"[\s\S]*?id="docsArchiveBody"/);
// the home page loops cut-30 silent; the manual plays the trailer with its score (public/media/site50-r14/films), and
// (2026-10-19, the owner: "all our new medai has to be shhown soomewhhere") the home page's trailers row plays the
// trailers with their score on a click only: outside that row the home page names no trailer
assert.match(homeSource, /\/media\/site50-r14\/films\/reel\.mp4/);
const homeTrailerRow = homeSource.match(/<div class="v5-trailer-grid" data-trailer-row>[\s\S]*?\n[ \t]*<\/div>/)?.[0] ?? '';
assert.match(homeTrailerRow, /<video controls playsinline preload="none" data-trailer [^>]*><source src="\/media\/site50-r14\/films\/trailer\.webm"/,
  'the trailers row plays the trailer on a click');
assert.doesNotMatch(homeSource.replace(homeTrailerRow, ''), /\/media\/site50-r14\/films\/trailer[^"]*\.(?:mp4|webm)/,
  'no trailer plays on the home page outside its trailers row');
// (round six, 2026-10-15: the trailer's VP9 webm first, its H.264 mp4 after for a browser that plays no VP9)
assert.match(docsSource, /<video controls[^>]*poster="\/media\/site50-r14\/films\/trailer\.jpg"[^>]*><source src="\/media\/site50-r14\/films\/trailer\.webm" type="video\/webm"><source src="\/media\/site50-r14\/films\/trailer\.mp4"/);
assert.doesNotMatch(`${homeSource}${docsSource}`, /promo-v13/, 'the v13 reel is retired from both pages');
// Chinese headlines (the type rules): the CJK system faces follow the Latin face in the shared stack, the
// lines open up, and no outline type is set on Chinese: the shared .t-hollow treatment paints solid ink in zh-CN.
assert.match(homeStyles, /html\[lang\^='zh'\] \.v5-hero-copy h1\{line-height:1\.15\}/, 'Chinese hero lines open up');
assert.doesNotMatch(homeStyles, /html\[lang\^='zh'\][^{]*\{[^}]*-webkit-text-stroke/, 'no outline type on the Chinese hero');
assert.match(readFileSync(join(ROOT, 'site/home.html'), 'utf8'), /<span class="t-hollow" data-i18n="home\.hero\.titleSub">/,
  'the hero subline uses the shared hollow treatment');
assert.match(typeTokenCss({ fx: true }), /:lang\(zh-CN\) \.t-hollow\{color:var\(--hollow-ink,#eef4f8\);-webkit-text-stroke:0;opacity:\.72\}/,
  'the shared hollow treatment is solid ink on Chinese');
assert.match(TYPE_STACK.ui, /^'Cot UI','Cot Accents','Cot Symbols','Cot Fallback','PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC'/,
  'Chinese glyphs come from the system CJK faces right after the Latin face, its accents and marks faces and its fallback');

// Landing and README pictograms come from the one icon sprite (brand-ui BUI-F4): the page references its symbols, the
// README shows the accent exports tools/gen-icon-sprite.mjs writes; the retired product-mark folders stay gone.
const landingIcons = ['play', 'toolPhoto', 'vehicle', 'map', 'gpu', 'team', 'fireGun', 'layerModules', 'cameraPath',
  'rocket', 'layerArmor'];
for (const icon of landingIcons) {
  assert.ok(homeSource.includes(`href="#i-${icon}"`), `landing page must use the ${icon} glyph`);
}
for (const [, icon] of readmeSource.matchAll(/docs\/media\/icons\/([A-Za-z]+)\.svg/g)) {
  const asset = readFileSync(join(ROOT, 'docs/media/icons', `${icon}.svg`), 'utf8');
  assert.match(asset, /^<svg[^>]+viewBox="0 0 24 24"/, `${icon} README pictogram uses the 24-unit grid`);
}
for (const icon of ['manual', 'gallery', 'studio', 'play']) {
  assert.ok(readmeSource.includes(`docs/media/icons/${icon}.svg`), `README must show the ${icon} pictogram`);
}
assert.ok(!existsSync(join(ROOT, 'public/brand/nav')) && !existsSync(join(ROOT, 'public/brand/features')),
  'the retired product-mark folders stay out of the shipped tree');

for (const film of ['trailer.webm', 'trailer.mp4', 'trailer.jpg', 'reel.mp4', 'reel.jpg']) {
  assert.ok(existsSync(join(ROOT, 'public/media/site50-r14/films', film)), `missing film: ${film}`);
}

console.log('public copy selftest passed');
