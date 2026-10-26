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
  // the manual's old names (248: one title form, "<page> · Claude of Tanks"; the manual is the Field Manual)
  'Technical Field Manual',
  'Claude of Tanks Technical Manual',
];

for (const file of [...pageFiles, ...supportingFiles]) {
  const source = readFileSync(join(ROOT, file), 'utf8');
  for (const phrase of retiredPhrases) {
    assert.ok(!source.includes(phrase), `${file} reintroduced retired campaign copy: ${phrase}`);
  }
}

// the manual's titles name the page, then the game, in both catalogs: no manual suffix after the brand
for (const locale of ['en-US', 'zh-CN']) {
  const catalog = JSON.parse(readFileSync(join(ROOT, `src/ui/i18nCatalog.${locale}.json`), 'utf8'));
  for (const [key, value] of Object.entries(catalog).filter(([key]) => /^metadata\.docs[A-Za-z]*\.title$/.test(key))) {
    assert.match(value, /^[^·]+ · Claude of Tanks$/, `${locale} ${key} "${value}" is "<page> · Claude of Tanks"`);
  }
  // (249) one string for the head and the running page: each topic's title is its heading (the label), then the game
  for (const [key, label] of Object.entries(catalog).filter(([key]) => /^docs\.topic\.[a-z]+\.label$/.test(key))) {
    const slug = key.split('.')[2];
    const title = catalog[`metadata.docs${slug[0].toUpperCase()}${slug.slice(1)}.title`];
    assert.equal(title, `${label} · Claude of Tanks`, `${locale} the ${slug} title is its heading, then the game`);
    if (locale === 'en-US') {
      const head = readFileSync(join(ROOT, `site/docs-${slug}.html`), 'utf8').match(/<title>([^<]+)<\/title>/)?.[1];
      assert.equal(head, title.replace(/&/g, '&amp;'), `site/docs-${slug}.html's prerendered title is the catalog's`);
    }
  }
}
assert.match(readFileSync(join(ROOT, 'src/docs/topics.ts'), 'utf8'), /document\.title = topic\.pageTitle;/,
  'the running page sets the same catalog title the head carries');

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
// (2026-10-25, the owner: "have big hero pics always animate and show multiple") the landing's hero reel crossfades the
// curated clips (public/media/home-r2), and the trailer plays in the hero's dialog with its score on a press only: its
// files are named only then (data-src), and nowhere else on the page
const homeTrailerDialog = homeSource.match(/<dialog class="hero__film" data-trailer-dialog[\s\S]*?<\/dialog>/)?.[0] ?? '';
assert.match(homeTrailerDialog, /<video playsinline preload="none" data-trailer [^>]*><source data-src="\/media\/site50-r14\/films\/trailer\.webm"/,
  'the hero dialog plays the trailer on a press');
assert.doesNotMatch(homeSource.replace(homeTrailerDialog, ''), /\/media\/site50-r14\/films\/trailer[^"]*\.(?:mp4|webm)/,
  'no trailer plays on the home page outside its dialog');
assert.ok((homeSource.match(/<video class="hero__clip" [^>]*data-reel-clip/g) || []).length >= 3, 'the hero reel holds several clips');
// (2026-10-25 gauntlet) the trailer plays under the page's own controls, never the browser's
assert.doesNotMatch(homeTrailerDialog, /<video [^>]*\bcontrols\b/, 'the trailer video draws no native controls');
for (const role of ['play', 'scrub', 'time', 'mute', 'full']) assert.match(homeTrailerDialog, new RegExp(`data-film-${role}`), `the trailer has its ${role} control`);
// (245: the manual's hero is its own banner, public/media/docs-r1, and the trailer plays in the landing's motion stage)
assert.match(docsSource, /<img src="\/media\/docs-r1\/banner-2560\.webp" srcset="\/media\/docs-r1\/banner-1280\.webp 1280w/, 'the manual leads with its banner');
assert.doesNotMatch(docsSource, /\/media\/site50-r14\/films\/trailer/, 'the trailer plays on the landing, not in the manual');
assert.doesNotMatch(`${homeSource}${docsSource}`, /promo-v13/, 'the v13 reel is retired from both pages');
// Chinese headlines (the type rules): the CJK system faces follow the Latin face in the shared stack, the
// lines open up, and no outline type is set on Chinese: the shared .t-hollow treatment paints solid ink in zh-CN.
assert.match(homeSource, /<h1 class="hero__title" id="hero-title"><span class="home-sr">Claude of Tanks\. <\/span><span data-i18n="home\.hero\.title">[^<]+<\/span><\/h1>/,
  'the hero\'s headline says what the game is (owner 2026-10-25: "also add text here at the left that says stuff about this!") and its h1 names the game for assistive tech and search; the mark and the name live in the nav bar alone (owner 2026-10-25)');
assert.doesNotMatch(homeSource, /hero__lockup/, 'the hero draws no second lockup');
assert.doesNotMatch(homeStyles, /html\[lang\^='zh'\][^{]*\{[^}]*-webkit-text-stroke/, 'no outline type on the Chinese hero');
assert.match(typeTokenCss({ fx: true }), /:lang\(zh-CN\) \.t-hollow\{color:var\(--hollow-ink,#eef4f8\);-webkit-text-stroke:0;opacity:\.72\}/,
  'the shared hollow treatment is solid ink on Chinese');
assert.match(TYPE_STACK.ui, /^'Cot UI','Cot Accents','Cot Symbols','Cot Fallback','PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC'/,
  'Chinese glyphs come from the system CJK faces right after the Latin face, its accents and marks faces and its fallback');

// Landing and README pictograms come from the one icon sprite (brand-ui BUI-F4): the page references its symbols, the
// README shows the accent exports tools/gen-icon-sprite.mjs writes; the retired product-mark folders stay gone.
// (242, the direction's pages: the section eyebrow pictograms went with the eyebrows; the walls carry the duel, map, time
// and fact glyphs; 246: the facts strip's renderer glyph left with the strip, the modes and mechanics switch carries the
// modes' own glyphs; a glyph drawn at 18 px or less uses its small master, #i-<id>-s)
// (2026-10-25, the reel and the features: the counts' glyphs, Play, the features' way in, the reel's pause, the dialog's close)
const landingIcons = ['play', 'map', 'team', 'gallery', 'media', 'modeStandard', 'chevronRight', 'close', 'fullscreen', 'sound'];
// the reel's pause is the media player's own glyph pair (mediaPlayer.ts), drawn in place
assert.match(homeSource, /data-reel-toggle[^>]*><svg viewBox="0 0 16 16"[^>]*><path fill="currentColor" d="M5 2\.5h1\.25v11H5zM9\.75 2\.5H11v11H9\.75z"\/>/, 'the reel\'s pause draws the player\'s glyph');
for (const icon of landingIcons) {
  assert.match(homeSource, new RegExp(`href="#i-${icon}(?:-s)?"`), `landing page must use the ${icon} glyph`);
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
