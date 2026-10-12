#!/usr/bin/env node
// site-media-wire.mjs — wires the public site and the game to the site fifty's media (public/media/site50-r14, built
// by site-media.mjs from tools/media-r5/site-media/picks.json): the landing page's hero, screenshot rail, feature
// reel, destruction loop, camera-path grid, mosaic and closing image; the manual's hero, trailer, chapter cards, battle
// takes, contact sheets and archive; each topic's hero loop and figures; the game's featured stills (boot splash, Garage
// gallery, loading screens), its JSON-LD screenshots, the 404 page, the HUD editor's backdrop and the social cards'
// sources; the landing contract (public/media/landing-r1/manifest.json); and the catalog copy in both locales.
//
//   node tools/media-r5/site-media-wire.mjs --root=<tree> [--dry-run]
// Run it on an export of main after site-media.mjs. Every rewrite matches its block exactly once, or the run stops
// naming the block and writes nothing; the selftests that pin these surfaces are updated with the same picks.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MEDIA = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const ROOT = resolve(arg('root') ?? '');
const dryRun = process.argv.includes('--dry-run');
const PICKS = JSON.parse(readFileSync(join(MEDIA, 'tools/media-r5/site-media/picks.json'), 'utf8'));
const C = `/media/${PICKS.collection}`;
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'public/media', PICKS.collection, 'manifest.json'), 'utf8'));
const ARCHIVE = JSON.parse(readFileSync(join(ROOT, 'public/media', PICKS.collection, 'archive.json'), 'utf8'));
const BUILT = new Map(MANIFEST.files.map((f) => [`/${f.path}`, f]));
const EN = JSON.parse(readFileSync(join(ROOT, 'src/ui/i18nCatalog.en-US.json'), 'utf8'));

// --- names --------------------------------------------------------------------------------------------------------
const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const titleKey = (id) => `media.site50.title.${camel(id)}`;
const shortKey = (id) => `media.site50.short.${camel(id)}`;
const take = (id) => {
  const t = PICKS.takes[id];
  if (!t) throw new Error(`unknown take ${id}`);
  return t;
};
const built = (url) => {
  if (!BUILT.has(url)) throw new Error(`not built: ${url} (run site-media.mjs first)`);
  return url;
};
const still = (id, kind = 'moment') => built(`${C}/stills/${id}${kind === 'close' ? '-close' : ''}.webp`);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mapName = (map) => EN[`map.${map}`] ?? map;
const reKey = (key) => key.replace(/\./g, '\\.');

// --- edits: each file read once, every block matched exactly once --------------------------------------------------
const texts = new Map();
const get = (path) => {
  if (!texts.has(path)) texts.set(path, readFileSync(join(ROOT, path), 'utf8'));
  return texts.get(path);
};
// `fn(match, ...groups)` returns the replacement (a function, so inserted text is never read as a $-pattern)
function swap(path, re, fn, label) {
  const text = get(path);
  const count = [...text.matchAll(new RegExp(re.source, `${re.flags.replace('g', '')}g`))].length;
  if (count !== 1) throw new Error(`${path}: ${label} matched ${count} times`);
  texts.set(path, text.replace(new RegExp(re.source, re.flags.replace('g', '')), fn));
}
// the text of the one element carrying data-i18n(-html)="key" (with or without data-i18n-vars)
function swapText(path, key, value, html = false) {
  swap(path, new RegExp(`(data-i18n${html ? '-html' : ''}="${reKey(key)}"(?: data-i18n-vars='[^']*')?>)(?:[^<]|<a [^>]*>[^<]*</a>)*(</)`),
    (_, open, close) => `${open}${html ? value : esc(value)}${close}`, `copy ${key}`);
}

// --- the landing page ---------------------------------------------------------------------------------------------
const loopVideo = (id) => `<video muted loop playsinline preload="none" data-poster="${built(`${C}/loops/${id}.jpg`)}" data-autoplay-video data-label="${esc(take(id).en)}" aria-hidden="true"><source data-src="${built(`${C}/loops/${id}.webm`)}" data-type="video/webm" data-mobile-src="/media/web-video-r1/${id}-mobile.mp4" data-mobile-type="video/mp4"></video>`;
function wireHome() {
  const H = 'site/home.html';
  const hero = PICKS.home.hero;
  swap(H, /<link rel="preload" href="\/media\/[^"]+" as="image" type="image\/webp" fetchpriority="high">/,
    () => `<link rel="preload" href="${still(hero[0].id, hero[0].still)}" as="image" type="image/webp" fetchpriority="high">`, 'hero preload');
  const slides = hero.map((h, i) => (i === 0
    ? `<img class="is-active" data-hero-slide src="${still(h.id, h.still)}" alt="" width="1920" height="1080" fetchpriority="high" style="--hero-focus:${h.focus}">`
    : `<img data-hero-slide data-src="${still(h.id, h.still)}" alt="" width="1920" height="1080" decoding="async" style="--hero-focus:${h.focus}">`));
  swap(H, /(<div class="v5-hero-rail" data-hero-rail>\n)(?:[ \t]*<img [^\n]*\n)+([ \t]*<\/div>)/,
    (_, open, close) => `${open}${slides.map((s) => `        ${s}\n`).join('')}${close}`, 'hero rail');
  const rail = PICKS.home.rail.map((id) => `          <figure><img data-deferred-src="${still(id)}" alt="${esc(take(id).en)}" data-i18n-alt="${titleKey(id)}" decoding="async"></figure>\n`);
  swap(H, /(<div class="v5-shot-rail" data-shot-rail[^>]*>\n)(?:[ \t]*<figure>[^\n]*<\/figure>\n)+([ \t]*<\/div>)/,
    (_, open, close) => `${open}${rail.join('')}${close}`, 'screenshot rail');
  swap(H, /(<span data-shot-position aria-live="polite">)1 \/ \d+(<\/span>)/, (_, open, close) => `${open}1 / ${PICKS.home.rail.length}${close}`, 'screenshot position');
  swap(H, /(<section class="v5-film"[^>]*>\n[ \t]*)<video [^\n]*?<\/video>/,
    (_, open) => `${open}<video muted loop playsinline preload="none" data-poster="${built(`${C}/films/reel.jpg`)}" data-autoplay-video data-label="Claude of Tanks battle reel, rendered in the game engine" aria-hidden="true"><source data-src="${built(`${C}/films/reel.mp4`)}" data-type="video/mp4" data-mobile-src="/media/web-video-r1/reel-mobile.mp4" data-mobile-type="video/mp4"></video>`, 'feature reel');
  swap(H, /(<section class="v5-destruction"[^>]*>)<video [^\n]*?<\/video>/, (_, open) => `${open}${loopVideo(PICKS.home.destruction)}`, 'destruction loop');
  const paths = PICKS.home.paths.map((id) => `        <article>${loopVideo(id)}<div><p data-i18n="${titleKey(id)}">${esc(take(id).en)}</p></div></article>\n`);
  swap(H, /(<div class="v5-rail-grid">\n)(?:[ \t]*<article>[^\n]*<\/article>\n)+([ \t]*<\/div>)/, (_, open, close) => `${open}${paths.join('')}${close}`, 'camera-path grid');
  const mosaic = PICKS.home.mosaic.map((m) => `        <figure><img src="${still(m.id, m.still)}" alt="${esc(take(m.id).en)}" data-i18n-alt="${titleKey(m.id)}" loading="lazy" decoding="async"></figure>\n`);
  swap(H, /(<div class="v5-mosaic-grid">\n)(?:[ \t]*<figure>[^\n]*<\/figure>\n)+([ \t]*<\/div>)/, (_, open, close) => `${open}${mosaic.join('')}${close}`, 'mosaic');
  const cta = PICKS.home.cta;
  swap(H, /(<section class="v5-cta">)<img [^>]*>/,
    (_, open) => `${open}<img src="${still(cta.id, cta.still)}" alt="${esc(take(cta.id).en)}" data-i18n-alt="${titleKey(cta.id)}" loading="lazy">`, 'closing image');
  for (const key of ['home.reel.title', 'home.reel.lede', 'home.reel.cta', 'home.shots.lede', 'home.mosaic.lede']) swapText(H, key, COPY.en[key]);
}

// --- the manual ---------------------------------------------------------------------------------------------------
function wireDocs() {
  const D = 'site/docs.html';
  const hero = PICKS.docs.hero;
  swap(D, /<link rel="preload" href="\/media\/[^"]+\.webp" as="image">/, () => `<link rel="preload" href="${still(hero.id, hero.still)}" as="image">`, 'manual hero preload');
  swap(D, /(<header class="docs-hero docs-hero--visual">\n[ \t]*)<img [^>]*>/,
    (_, open) => `${open}<img src="${still(hero.id, hero.still)}" alt="${esc(take(hero.id).en)}" data-i18n-alt="${titleKey(hero.id)}">`, 'manual hero image');
  const trailer = BUILT.get(built(`${C}/films/trailer.mp4`));
  const seconds = String(Math.round(trailer.seconds));
  swap(D, /<video controls playsinline preload="metadata" poster="[^"]*" aria-label="[^"]*" data-i18n-aria-label="[^"]*"><source src="[^"]*" type="video\/mp4">(?:<track [^>]*>)?<\/video>/,
    () => `<video controls playsinline preload="metadata" poster="${built(`${C}/films/trailer.jpg`)}" aria-label="${esc(COPY.en['docs.hero.trailerAria'])}" data-i18n-aria-label="docs.hero.trailerAria"><source src="${built(`${C}/films/trailer.mp4`)}" type="video/mp4"></video>`, 'trailer player');
  swap(D, /<figcaption><span data-i18n="docs\.hero\.reelCaption">[^<]*<\/span><strong data-i18n="docs\.hero\.reelApproved"[^>]*>[^<]*<\/strong><\/figcaption>/,
    () => `<figcaption><span data-i18n="docs.hero.trailerCaption">${esc(COPY.en['docs.hero.trailerCaption'])}</span><strong data-i18n="docs.hero.trailerSpec" data-i18n-vars='{"seconds":"${seconds}"}'>${esc(COPY.en['docs.hero.trailerSpec'].replace('{seconds}', seconds))}</strong></figcaption>`, 'trailer caption');
  for (const [chapter, c] of Object.entries(PICKS.docs.chapters)) {
    swap(D, new RegExp(`(<a href="/docs/${chapter}"><span class="docs-chapter-media">)<img [^>]*>`),
      (_, open) => `${open}<img src="${still(c.id, c.still)}" alt="${esc(take(c.id).en)}" data-i18n-alt="${titleKey(c.id)}">`, `chapter card ${chapter}`);
  }
  // the battle takes (battleReels.ts fills the grid; the first take is the page's static state)
  const reels = PICKS.docs.reels;
  const first = reels[0];
  swap(D, /<video controls playsinline preload="metadata" poster="[^"]*" data-battle-reel-video aria-label="[^"]*" data-i18n-aria-label="[^"]*"><source src="[^"]*" type="video\/mp4"><\/video>/,
    () => `<video controls playsinline preload="metadata" poster="${built(`${C}/reels/${first}.webp`)}" data-battle-reel-video aria-label="${esc(take(first).shortEn)}" data-i18n-aria-label="${shortKey(first)}"><source src="${built(`${C}/reels/${first}.mp4`)}" type="video/mp4"></video>`, 'battle-take player');
  swap(D, /<strong data-battle-reel-title>[^<]*<\/strong><small data-battle-reel-map>[^<]*<\/small><\/span><b data-battle-reel-count>[^<]*<\/b>/,
    () => `<strong data-battle-reel-title>${esc(take(first).shortEn)}</strong><small data-battle-reel-map>${esc(mapName(take(first).map))} // ${esc(COPY.en['docs.studio.reelSpec'])}</small></span><b data-battle-reel-count>01 / ${reels.length}</b>`, 'battle-take status');
  swap(D, /(data-battle-reel-grid) aria-label="[^"]*" data-i18n-aria-label="[^"]*"/,
    (_, open) => `${open} aria-label="${esc(COPY.en['docs.studio.reelsGridAria'])}" data-i18n-aria-label="docs.studio.reelsGridAria"`, 'battle-take grid label');
  swap(D, /(<noscript><p><a class="inline-link" href=")[^"]*(" data-i18n="docs\.studio\.reelNoscript">)[^<]*(<\/a>)/,
    (_, a, b, c) => `${a}${built(`${C}/reels/${first}.mp4`)}${b}${esc(COPY.en['docs.studio.reelNoscript'])}${c}`, 'battle-take noscript');
  swap(D, /(<span data-i18n="docs\.studio\.reelsHead" data-i18n-vars=')[^']*('>)[^<]*(<)/,
    (_, a, b, c) => `${a}{"count":"${reels.length}"}${b}${esc(COPY.en['docs.studio.reelsHead'].replace('{count}', reels.length))}${c}`, 'battle-take head');
  // the contact sheets: the fifty frames, ten to a sheet
  const sheets = MANIFEST.files.filter((f) => /\/frames\/sheet-\d+\.webp$/.test(f.path)).sort((a, b) => a.sheet - b.sheet);
  const frameCount = MANIFEST.frames.length;
  const sheetLinks = sheets.map((s) => {
    const url = `/${s.path}`;
    return `            <a href="${url}" target="_blank"><img src="${url}" alt="${esc(SHEET_ALT.en(s))}" data-i18n-alt="docs.media.alt.framesSheet${s.sheet}" loading="lazy"></a>\n`;
  });
  const group = `        <div class="process-sheet-group">\n          <header><span data-i18n="docs.studio.framesHead">${esc(COPY.en['docs.studio.framesHead'])}</span><strong data-i18n="docs.studio.framesSheets" data-i18n-vars='{"count":"${frameCount}","sheets":"${sheets.length}"}'>${frameCount} frames // ${sheets.length} review sheets</strong></header>\n          <div class="process-sheet-grid">\n${sheetLinks.join('')}          </div>\n          <p class="process-sheet-note" data-i18n="docs.studio.framesNote">${esc(COPY.en['docs.studio.framesNote'])}</p>\n        </div>\n`;
  swap(D, / {8}<div class="process-sheet-group">\n[\s\S]*?\n {8}<\/div>\n {8}<div class="process-sheet-group">\n[\s\S]*?\n {8}<\/div>\n/, () => group, 'contact sheets');
  // the sheets are five 480×270 frames by two rows (site-media.mjs SHEET), not the old 2400×592 labelled strips
  swap('src/docs/docs.css', /(\.process-sheet-grid img\{[^}]*aspect-ratio:)2400\/592/, (_, open) => `${open}2400/540`, 'contact sheet aspect');
  // the archive dialog's loops and both archive counts
  const loops = PICKS.docs.archiveLoops.map((id) => `      <video muted loop playsinline preload="none" poster="${built(`${C}/loops/${id}.jpg`)}"><source src="${built(`${C}/loops/${id}-960.webm`)}" type="video/webm"></video>\n`);
  swap(D, /(<div class="docs-motion-grid"[^>]*>\n)(?:[ \t]*<video [^\n]*<\/video>\n)+([ \t]*<\/div>)/, (_, open, close) => `${open}${loops.join('')}${close}`, 'archive loops');
  const n = String(ARCHIVE.shots.length);
  swap(D, /(data-i18n="docs\.aside\.archiveTitle" data-i18n-vars=')[^']*('>)\d+( field frames)/, (_, a, b, c) => `${a}{"count":"${n}"}${b}${n}${c}`, 'archive card count');
  swap(D, /(data-i18n="docs\.archive\.headIdx" data-i18n-vars=')[^']*('>Visual archive \/\/ )\d+( field frames)/, (_, a, b, c) => `${a}{"count":"${n}"}${b}${n}${c}`, 'archive dialog count');
  for (const key of ['docs.studio.reelsTitle', 'docs.studio.reelsLede', 'docs.studio.contactBody', 'docs.archive.lede']) swapText(D, key, COPY.en[key]);
  swapText(D, 'docs.studio.body', COPY.en['docs.studio.body'], true);
}

// --- the manual's topics and archive code -----------------------------------------------------------------------
function wireTopics() {
  const T = 'src/docs/topics.ts';
  for (const [topic, id] of Object.entries(PICKS.topics)) {
    swap(T, new RegExp(`(\\n  ${topic}: \\{[\\s\\S]*?\\n    hero: ')[^']+(')`), (_, open, close) => `${open}${built(`${C}/loops/${id}.webm`)}${close}`, `topic hero ${topic}`);
  }
  for (const [slot, pick] of Object.entries(PICKS.topicMedia)) {
    const [topic, media] = slot.split('.');
    const url = pick.sheet ? built(`${C}/frames/sheet-${pick.sheet}.webp`) : still(pick.id, pick.still);
    swap(T, new RegExp(`\\['/media/[^']+(', t\\('docs\\.topic\\.${topic}\\.${media}'\\)\\])`), (_, close) => `['${url}${close}`, `topic figure ${slot}`);
  }
  swap('src/presentation/mediaArchive.ts', /const MANIFEST_URL = '[^']+';/, () => `const MANIFEST_URL = '${C}/archive.json';`, 'archive manifest');
  swap('src/docs/docs.ts', /\{ mode: 'wall', limit: \d+, filters: false \}/, () => `{ mode: 'wall', limit: ${ARCHIVE.shots.length}, filters: false }`, 'archive wall limit');
}

// --- the battle takes ---------------------------------------------------------------------------------------------
function wireReels() {
  const R = 'src/docs/battleReels.ts';
  swap(R, /const MEDIA_ROOT = '[^']+';/, () => `import { t } from '../ui/i18n.ts';\n\nconst MEDIA_ROOT = '${C}/reels';`, 'reel root');
  const rows = PICKS.docs.reels.map((id) => `  ['${id}', '${shortKey(id)}', 'map.${take(id).map}'],`);
  swap(R, /const REEL_SOURCES: ReadonlyArray<readonly \[string, string, string\]> = \[\n[\s\S]*?\n\];/,
    () => `// [take id, its title's catalog key, its battlefield's catalog key]: twenty of the site fifty's takes, 720p with their\n// sound (tools/media-r5/site-media/picks.json)\nconst REEL_SOURCES: ReadonlyArray<readonly [string, string, string]> = [\n${rows.join('\n')}\n];`, 'reel sources');
  swap(R, /export const BATTLE_REELS: readonly BattleReel\[\] = Object\.freeze\(REEL_SOURCES\.map\(\(\[id, title, map\]\) => Object\.freeze\(\{\n  id,\n  title,\n  map,/,
    () => 'export const BATTLE_REELS: readonly BattleReel[] = Object.freeze(REEL_SOURCES.map(([id, titleKey, mapKey]) => Object.freeze({\n  id,\n  title: t(titleKey),\n  map: t(mapKey),', 'reel table');
  swap(R, /map\.textContent = `\$\{reel\.map\} \/\/ [^`]*`;/, () => "map.textContent = `${reel.map} // ${t('docs.studio.reelSpec')}`;", 'reel status line');
  swap(R, /video\.setAttribute\('aria-label', `\$\{reel\.title\} at \$\{reel\.map\}`\);/, () => "video.setAttribute('aria-label', t('docs.studio.reelAria', { title: reel.title, map: reel.map }));", 'reel aria');
}

// --- the game -----------------------------------------------------------------------------------------------------
function wireGame() {
  const F = 'src/ui/featuredShots.ts';
  const entries = PICKS.featured.map((f) => {
    const lines = [`    img: '${f.fourK ? built(`${C}/stills/${f.id}-4k.webp`) : still(f.id)}',`];
    if (f.boot) lines.push(`    bootImg: '${built(`${C}/stills/${f.id}-boot.webp`)}',`);
    lines.push(`    capKey: '${titleKey(f.id)}',`);
    lines.push(`    ${f.maps?.length ? `maps: [${f.maps.map((m) => `'${m}'`).join(', ')}], ` : ''}focal: '${f.focal ?? '50% 50%'}',`);
    return `  {\n${lines.join('\n')}\n  },`;
  });
  swap(F, /(export const FEATURED_SHOTS: readonly FeaturedShot\[\] = Object\.freeze\(\[\n)[\s\S]*?(\n\]\);)/, (_, open, close) => `${open}${entries.join('\n')}${close}`, 'featured shots');
  const shots = PICKS.featured.slice(0, 4).map((f) => `          "https://cot.kevinliu.studio${still(f.id)}"`);
  swap('index.html', /("screenshot": \[\n)(?:[ \t]*"https:\/\/cot\.kevinliu\.studio\/media\/[^"]+",?\n)+/, (_, open) => `${open}${shots.join(',\n')}\n`, 'JSON-LD screenshots');
  const nf = PICKS.notFound;
  swap('404.html', /<link rel="preload" href="\/media\/[^"]+" as="image">/, () => `<link rel="preload" href="${still(nf.id, nf.still)}" as="image">`, '404 preload');
  swap('src/presentation/notFound.css', /url\('\/media\/[^']+'\) [\d.]+% [\d.]+%\/cover/, () => `url('${still(nf.id, nf.still)}') 50% 50%/cover`, '404 background');
  swap('src/ui/garage.ts', /  \/\/ Assets \+ captions come from the marketing-shots pipeline\n  \/\/ \(tools\/marketing-shots, encoded to public\/media\/featured\/\)\. The panel is\n/,
    () => `  // Assets + captions are the site fifty's stills (public/media/${PICKS.collection}/stills, picked in\n  // tools/media-r5/site-media/picks.json; captions from the catalog). The panel is\n`, 'Garage panel comment');
  const hud = PICKS.hudEditor;
  swap('src/ui/hudEditor.ts', /const BACKDROP='[^']+';/, () => `const BACKDROP='${still(hud.id, hud.still)}';`, 'HUD editor backdrop');
  // the social cards' sources (generate-og-images.mjs re-renders the cards from these)
  const og = { game: PICKS.og, home: PICKS.home.hero[1], docs: PICKS.docs.hero, 'docs-vehicles': PICKS.docs.chapters.vehicles,
    'docs-ai': PICKS.docs.chapters.ai, 'docs-audio': PICKS.topicMedia['audio.media1'] };
  for (const [card, pick] of Object.entries(og)) {
    swap('tools/marketing-shots/generate-og-images.mjs', new RegExp(`(\\['${card}', '[^']*', ')public/media/[^']+(', ')[^']+('\\])`),
      (_, a, b, c) => `${a}public${still(pick.id, pick.still)}${b}50% 50%${c}`, `social card ${card}`);
  }
}

// --- the landing page's social cards (their battle photos sit at low opacity behind each quote) -------------------
function wireSocialCards() {
  for (const [modifier, pick] of Object.entries(PICKS.home.socialCards)) {
    swap('public/home.css', new RegExp(`(\\.v5-social-card--${modifier}\\{--social-card-image:url\\(')[^']+('\\))`),
      (_, open, close) => `${open}${still(pick.id, pick.still)}${close}`, `social card ${modifier}`);
  }
}

// --- the README (the repository's front page) ---------------------------------------------------------------------
function wireReadme() {
  const M = 'README.md';
  const R = PICKS.readme;
  const cell = (id) => `<td width="50%"><img src="public${still(id)}" alt="${esc(take(id).en)}"></td>`;
  const rows = [[R.stills[0], R.stills[1]], [R.stills[2], R.stills[3]]].map((pair) => `<tr>\n${pair.map(cell).join('\n')}\n</tr>`);
  swap(M, /<table>\n<tr>\n<td width="50%"><img src="public\/media\/[^"]+" alt="[^"]*"><\/td>\n<td width="50%"><img src="public\/media\/[^"]+" alt="[^"]*"><\/td>\n<\/tr>\n<tr>\n<td width="50%"><img src="public\/media\/[^"]+" alt="[^"]*"><\/td>\n<td width="50%"><img src="public\/media\/[^"]+" alt="[^"]*"><\/td>\n<\/tr>\n<\/table>/,
    () => `<table>\n${rows.join('\n')}\n</table>`, 'README stills');
  swap(M, /These are handmade, deterministic scenes captured with the current game renderer[\s\S]*?now published on the site\./,
    () => `These are deterministic scenes staged in Scene Studio and rendered at 4K in the game engine—not concept art. The\n[visual archive](public/media/${PICKS.collection}/archive.json) holds the fifty frames and the key moment and close portrait of each of\nthe site's fifty takes. The [landing selection](public/media/landing-r1/manifest.json) records the six hero frames, the feature\nreel, the four camera-path loops, the destruction loop, the 24-shot mosaic, and the directed Strv 122 versus Leclerc sequence\npublished on the site.`, 'README archive note');
  const loop = (id) => `<td width="50%"><a href="public${built(`${C}/loops/${id}.webm`)}"><img src="public${built(`${C}/loops/${id}.jpg`)}" alt="Open the ${esc(take(id).shortEn)} take"></a><br><sub><b>${esc(take(id).shortEn)}:</b> ${esc(take(id).en)}.</sub></td>`;
  const p = PICKS.home.paths;
  swap(M, /<table>\n<tr>\n<td width="50%"><a href="public\/media\/[^"]+\.webm">[\s\S]*?<\/tr>\n<\/table>/,
    () => `<table>\n<tr>\n${loop(p[0])}\n${loop(p[1])}\n</tr>\n<tr>\n${loop(p[2])}\n${loop(p[3])}\n</tr>\n</table>`, 'README loops');
  swap(M, /(<td width="50%"><img src=")public\/media\/[^"]+(" alt=")[^"]*("><br><sub><b>Thirty worlds:<\/b>)/,
    (_, a, b, c) => `${a}public${still(R.worlds.id, R.worlds.still)}${b}${esc(take(R.worlds.id).en)}${c}`, 'README worlds');
  swap(M, /(<td width="50%"><img src=")public\/media\/[^"]+(" alt=")[^"]*("><br><sub><b>Shared world kit:<\/b>)/,
    (_, a, b, c) => `${a}public${still(R.worldKit.id, R.worldKit.still)}${b}${esc(take(R.worldKit.id).en)}${c}`, 'README world kit');
}

// --- the landing contract -----------------------------------------------------------------------------------------
function wireLandingManifest() {
  const path = 'public/media/landing-r1/manifest.json';
  const old = JSON.parse(get(path));
  const reel = BUILT.get(built(`${C}/films/reel.mp4`));
  const next = {
    libraryId: old.libraryId,
    schemaVersion: old.schemaVersion,
    source: `The site fifty (public/media/${PICKS.collection}): takes staged in Scene Studio and rendered at 4K in the game engine, picked in tools/media-r5/site-media/picks.json`,
    hero: PICKS.home.hero.map((h) => ({ id: h.id, title: take(h.id).en, src: still(h.id, h.still), still: h.still })),
    featureReel: { video: `${C}/films/reel.mp4`, poster: built(`${C}/films/reel.jpg`), width: reel.width, height: reel.height,
      durationMs: Math.round(reel.seconds * 1000), fps: reel.fps, takes: reel.takes, crossfadeS: reel.crossfadeS },
    rails: PICKS.home.paths.map((id) => ({ id, title: take(id).en, video: built(`${C}/loops/${id}.webm`), poster: built(`${C}/loops/${id}.jpg`) })),
    destructionRail: built(`${C}/loops/${PICKS.home.destruction}.webm`),
    mosaic: PICKS.home.mosaic.map((m) => ({ id: m.id, title: take(m.id).en, still: m.still, src: still(m.id, m.still) })),
    studio: old.studio,
  };
  texts.set(path, `${JSON.stringify(next, null, 2)}\n`);
}

// --- the catalogs -------------------------------------------------------------------------------------------------
// Copy that changes with the media, in both locales. Keys the pages already use keep their names.
const COPY = {
  en: {
    'home.reel.title': 'Watch tank combat in the game engine',
    'home.reel.lede': "Every vehicle, shot, impact, fire and wreck in this reel is the game's own, rendered by its engine at 4K.",
    'home.reel.cta': 'Watch 20 battle takes',
    'home.shots.lede': 'Each scene was staged in Scene Studio and rendered at 4K in the game engine.',
    'home.mosaic.lede': "These frames show close combat and long-range fire across the game's battlefields, by day, at sunset and at night.",
    'docs.hero.trailerCaption': 'The trailer, filmed in the game engine',
    'docs.hero.trailerSpec': '4K renders // {seconds} seconds',
    'docs.hero.trailerAria': 'The Claude of Tanks trailer, filmed in the game engine, with its score and battle sound',
    'docs.studio.reelsHead': 'The site fifty // {count} takes',
    'docs.studio.reelsTitle': 'Battle takes',
    'docs.studio.reelsLede': "Twenty of the site's fifty takes, staged in Scene Studio and rendered at 4K in the game engine, each with the sound of its own battle. Select a take to load it into the player.",
    'docs.studio.reelNoscript': 'Open the first take.',
    'docs.studio.reelsGridAria': 'Battle takes',
    'docs.studio.reelSpec': '6 seconds // 720p with sound',
    'docs.studio.reelAria': '{title}, {map}',
    'docs.studio.body': 'Open <a class="inline-link" href="/studio">/studio</a> or press F8 in the garage. Studio places any roster vehicle on any map, conforms actors to terrain, applies camouflage and damage states, schedules the game’s firing and destruction effects, scrubs a deterministic 20-second timeline, builds camera, actor, and effect tracks, records video, captures high-resolution PNGs, and imports or exports scene JSON. The Field Frames drawer shows the current archive, the fifty frames and the stills of the site’s fifty takes, beside the authoring controls.',
    'docs.studio.contactBody': 'Each frame begins as deterministic scene data and is first reviewed as a low-resolution capture, ten to a sheet. The sheets expose weak silhouettes, obstructed cameras, unreadable vehicles, repetitive staging and effects that hide the action; the frames that pass are rendered at 4K with motion blur.',
    'docs.studio.framesHead': 'The fifty frames',
    'docs.studio.framesSheets': '{count} frames // {sheets} review sheets',
    'docs.studio.framesNote': "Open any sheet at full resolution. Each frame is a 4K render of a moving scene, exposed like a camera's shutter, so motion blurs as it would on film.",
    'docs.archive.lede': "The fifty frames and the stills of the site's fifty takes: the game's own vehicles, maps and effects, rendered at 4K.",
    'docs.topic.ai.media1': 'A T-90M column driving into the fight, each bot holding its lane and spacing',
    'docs.topic.ai.media2': 'A Type 90 and a Type 89 fighting through a farm village, keeping their spacing under fire',
    'docs.topic.audio.media1': 'A TOS-1A ripple salvo at night: every launch and every impact has its own sound',
    'docs.topic.simulation.media2': 'A T-62MV-1 knocked out by the caravanserai: a resolved penetration, then fire and smoke',
    'docs.topic.rendering.media2': 'Vehicle materials in low sunset light at Sunscar Oasis',
    'docs.topic.build.media2': 'Ten of the fifty frames on one contact sheet, used for visual comparison and review',
    'docs.topic.studio.media2': 'Ten of the fifty frames on one contact sheet, used for visual review',
  },
  zh: {
    'home.reel.title': '观看游戏引擎中的坦克战斗',
    'home.reel.lede': '这段影片中的每辆载具、每次射击、命中、火焰与残骸都来自游戏本身，由游戏引擎以 4K 渲染。',
    'home.reel.cta': '观看 20 段战斗镜头',
    'home.shots.lede': '每个场景都在 Scene Studio 中编排，并在游戏引擎中以 4K 渲染。',
    'home.mosaic.lede': '这些画面呈现游戏各个战场上的近距离交火与远程射击，白昼、日落与夜间皆有。',
    'docs.hero.trailerCaption': '预告片，在游戏引擎中拍摄',
    'docs.hero.trailerSpec': '4K 渲染 // {seconds} 秒',
    'docs.hero.trailerAria': 'Claude of Tanks 预告片，在游戏引擎中拍摄，配有配乐与战场音效',
    'docs.studio.reelsHead': '网站五十镜头 // {count} 段',
    'docs.studio.reelsTitle': '战斗镜头',
    'docs.studio.reelsLede': '网站五十个镜头中的二十个，在 Scene Studio 中编排并在游戏引擎中以 4K 渲染，每段都带有自己那场战斗的声音。点选一段即可载入播放器。',
    'docs.studio.reelNoscript': '打开第一段镜头。',
    'docs.studio.reelsGridAria': '战斗镜头',
    'docs.studio.reelSpec': '6 秒 // 720p，含声音',
    'docs.studio.reelAria': '{map}：{title}',
    'docs.studio.body': '打开 <a class="inline-link" href="/studio">/studio</a>，或在车库中按 F8。Studio 可以把任意名册载具放在任意地图上，使角色贴合地形，套用迷彩与受损状态，排程游戏内的开火与破坏特效，拖动一条确定性的 20 秒时间轴，搭建镜头、角色与特效轨，录制视频、抓取高分辨率 PNG，并导入或导出场景 JSON。Field Frames 抽屉就在创作控件旁边，展示当前的归档：五十帧画面与网站五十个镜头的静帧。',
    'docs.studio.contactBody': '每一帧都从确定性场景数据开始，先以低分辨率抓帧接受审核，十张一组。对照表会暴露轮廓单薄、被遮挡的镜头、看不清的载具、重复的走位以及遮蔽动作的特效；通过的帧再以 4K 加动态模糊渲染。',
    'docs.studio.framesHead': '五十帧',
    'docs.studio.framesSheets': '{count} 帧 // {sheets} 张审核拼版',
    'docs.studio.framesNote': '任意拼版都可以全分辨率打开。每一帧都是运动场景的 4K 渲染，像相机快门一样曝光，因此运动会像在胶片上一样模糊。',
    'docs.archive.lede': '五十帧画面与网站五十个镜头的静帧：游戏自己的载具、地图与特效，以 4K 渲染。',
    'docs.topic.ai.media1': '驶入战斗的 T-90M 纵队，每个机器人都保持自己的路线与间距',
    'docs.topic.ai.media2': 'Type 90 与 Type 89 穿过农庄作战，在炮火下保持间距',
    'docs.topic.audio.media1': '夜间 TOS-1A 连续齐射：每一次发射、每一次落点都有自己的声音',
    'docs.topic.simulation.media2': '商队驿站旁被击毁的 T-62MV-1：一次结算完成的击穿，随后起火冒烟',
    'docs.topic.rendering.media2': '日痕绿洲低角度夕照下的车辆材质',
    'docs.topic.build.media2': '一张拼版图上的十帧（共五十帧），用于视觉对比与评审',
    'docs.topic.studio.media2': '一张拼版图上的十帧（共五十帧），用于视觉评审',
  },
};
const sheetRange = (s) => [(s.sheet - 1) * 10 + 1, (s.sheet - 1) * 10 + s.frames.length];
const SHEET_ALT = {
  en: (s) => `Review sheet ${s.sheet} of the fifty frames, frames ${sheetRange(s)[0]} through ${sheetRange(s)[1]}`,
  zh: (s) => `五十帧审核拼版第 ${s.sheet} 张，第 ${sheetRange(s)[0]} 至 ${sheetRange(s)[1]} 帧`,
};
function wireCatalogs() {
  const sheets = MANIFEST.files.filter((f) => /\/frames\/sheet-\d+\.webp$/.test(f.path));
  for (const [locale, file] of [['en', 'src/ui/i18nCatalog.en-US.json'], ['zh', 'src/ui/i18nCatalog.zh-CN.json']]) {
    const catalog = JSON.parse(get(file));
    for (const [id, t] of Object.entries(PICKS.takes)) {
      catalog[titleKey(id)] = locale === 'en' ? t.en : t.zh;
      catalog[shortKey(id)] = locale === 'en' ? t.shortEn : t.shortZh;
    }
    Object.assign(catalog, COPY[locale]);
    for (const s of sheets) catalog[`docs.media.alt.framesSheet${s.sheet}`] = SHEET_ALT[locale](s);
    texts.set(file, `${JSON.stringify(catalog, null, 2)}\n`);
  }
}

function main() {
  if (!existsSync(join(ROOT, 'site/home.html'))) throw new Error(`--root=${ROOT} is not a tree with site/home.html`);
  wireHome();
  wireDocs();
  wireTopics();
  wireReels();
  wireGame();
  wireSocialCards();
  wireReadme();
  wireLandingManifest();
  wireCatalogs();
  for (const [path, text] of texts) {
    if (readFileSync(join(ROOT, path), 'utf8') === text) continue;
    if (!dryRun) writeFileSync(join(ROOT, path), text);
    console.log(`${dryRun ? '[dry] ' : ''}wired ${path}`);
  }
}

main();
