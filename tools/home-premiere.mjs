#!/usr/bin/env node
// home-premiere.mjs — writes the landing's blocks into site/home.html: the hero reel and the features, from the curated
// set in public/media/home-r2/manifest.json (owner 2026-10-25: "use the videos and pics to show off game features, have
// big hero pics always animate and show multiple"), and the fleet records the 404 page searches (src/presentation/
// fleetWall.json, from the fleet takes, public/icons/tank-assets/ and the Garage's facet tables). Each block sits
// between <!--home:NAME--> and <!--/home:NAME-->. Run `node tools/public-shell.mjs --write` after it (the shell inlines the
// glyphs the blocks reference). Copyright © 2026 Kevin B. Liu.
//
//   node tools/home-premiere.mjs           check (exit 1 when a block is stale)
//   node tools/home-premiere.mjs --write   rewrite the blocks
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTankAssets } from './tank-assets-store.mjs';
import { iconMarkup } from '../src/presentation/publicShell.ts';
import { heroLqip } from './hero-lqip.mjs';
import { MEDIA_PAUSE_ICON } from '../src/presentation/mediaPlayer.ts';
import { TANK_IDS } from '../src/vehicles/tankIdAliases.ts';
import '../src/vehicles/tankFactory.ts';
import { getSpec } from '../src/vehicles/specs.ts';
import { displayTier, tierNumeral } from '../src/techTree/tiers.ts';
import { vehicleFacetSearchWords, vehicleFacetsForId } from '../src/vehicles/vehicleFacets.ts';
import { GAME_MODE_DEFINITIONS, MODE_PRESENTATION_ORDER } from '../src/sim/gameModeCatalog.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const EN = json('src/ui/i18nCatalog.en-US.json');
const ZH = json('src/ui/i18nCatalog.zh-CN.json');
const ASSETS = readTankAssets(join(ROOT, 'public/icons')).tanks;
const HERO = json('public/icons/hero/hero-cards.json');
const TAKES = json('public/media/site50-r14/fleet/index.json');
const SITE = json('public/media/site50-r14/manifest.json');
const STAMP = TANK_IDS.linkParam();

const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const text = (key) => {
  if (typeof EN[key] !== 'string') throw new Error(`home-premiere: ${key} is not in the en-US catalog`);
  return EN[key];
};
const t = (key, tag = 'span', cls = '') => `<${tag}${cls ? ` class="${cls}"` : ''} data-i18n="${key}">${esc(text(key))}</${tag}>`;
/** Vetted catalog markup (a headline's .t-hollow word), which each locale places in its own word order. */
const html = (key) => `<span data-i18n-html="${key}">${text(key)}</span>`;
const tank = (id) => {
  const a = ASSETS[id];
  if (!a) throw new Error(`home-premiere: ${id} has no row in public/icons/tank-assets/`);
  return a;
};
const galleryHref = (id, layer = '') => `/gallery?id=${id}${layer ? `&amp;layer=${layer}` : ''}${STAMP ? `&amp;${STAMP}` : ''}`;
const driveHref = (id) => `/?testdrive=${id}${STAMP ? `&amp;${STAMP}` : ''}`;
const play = iconMarkup('play', 18);
const btn = (variant, size) => `cot-c-btn${variant ? ` cot-c-btn--${variant}` : ''}${size ? ` cot-c-btn--${size}` : ''}`;
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

// ---- the hero reel (owner 2026-10-25: "have big hero pics always animate and show multiple (like showing videos)") ----
// public/media/home-r2/manifest.json (the media lane's curated set) names the clips. The first clip's poster is the page's
// LCP picture, preloaded at its rungs; the clips wait in the markup without a source, and heroReel.ts (publicPages.ts,
// after the page has loaded) gives them one at a time, each decoded before its turn, and crossfades from one to the next.
const REEL = json('public/media/home-r2/manifest.json');
const TRAILER = SITE.files.find((file) => file.path === 'media/site50-r14/films/trailer.mp4');
// the owner's pick in the media election (2026-10-30): the Steinburg crossroads key art, an Abrams firing low at the lens
const TRAILER_THUMB = '/media/home-r2/trailer-thumb.webp';
const reelPoster = () => REEL.hero[0].poster.rungs;
/** The hero still covers the viewport: a phone shows 640 px of height (1138 css px wide), a desktop its width. */
const HERO_SIZES = '(width < 768px) 1138px, 100vw';
const heroSrcset = () => reelPoster().map((rung) => `${rung.path} ${rung.width}w`).join(', ');
const heroDefault = () => (reelPoster().find((rung) => rung.width >= 1440) ?? reelPoster().at(-1)).path;
/** A clip's alt text: its catalog key (both catalogs carry it, so /cn reads Chinese): the manifest's altKey, else
 *  media.homeR2.<id>, which --write adds to both catalogs from the clip's title. */
const altKeyOf = (clip) => clip.altKey ?? `media.homeR2.${camel(clip.id)}`;
function altOf(clip) {
  const key = altKeyOf(clip);
  if (typeof EN[key] !== 'string' || typeof ZH[key] !== 'string') {
    throw new Error(`home-premiere: ${clip.id}: ${key} is not in both catalogs (--write adds it from the clip's title in public/media/home-r2/manifest.json)`);
  }
  return { key, en: EN[key] };
}
/** --write: the alt texts the manifest gives only as titles join both catalogs, one line each, beside the landing's own. */
function syncAltCatalogs() {
  const clips = [...REEL.hero, ...Object.values(REEL.features ?? {})].filter((clip) => !clip.altKey);
  for (const [path, catalog, lang] of [['src/ui/i18nCatalog.en-US.json', EN, 'en'], ['src/ui/i18nCatalog.zh-CN.json', ZH, 'zh']]) {
    const missing = clips.filter((clip) => typeof catalog[altKeyOf(clip)] !== 'string');
    if (!missing.length) continue;
    for (const clip of missing) if (!clip.title?.[lang]) throw new Error(`home-premiere: ${clip.id} has no ${lang} title for its alt text`);
    const file = join(ROOT, path);
    const source = readFileSync(file, 'utf8');
    const at = source.indexOf('\n  "media.home.modes.');
    if (at < 0) throw new Error(`home-premiere: ${path} has no media.home.modes.* line to write the alt texts beside`);
    const lines = missing.map((clip) => `\n  ${JSON.stringify(altKeyOf(clip))}: ${JSON.stringify(clip.title[lang])},`).join('');
    writeFileSync(file, source.slice(0, at) + lines + source.slice(at));
    for (const clip of missing) catalog[altKeyOf(clip)] = clip.title[lang];
  }
}
/** A clip's ladder in the media player's order (mediaPlayer.ts chooseSource): wide screens, the film, the phone rung. A
 *  rung leads with its AV1 file only beside its VP9 twin (av1 then vp9, mobileAv1 then mobileVp9: brand-ui SPEC 8.3, held
 *  by tools/media-fallback.selftest.mjs), its type naming its codec so the player can ask MediaCapabilities; the H.264
 *  file every browser plays closes each rung. */
function ladder(clip) {
  const files = [clip.wide && { ...clip.wide, rung: 'wide' }, clip.vp9 && clip.av1, clip.vp9, clip.film,
    clip.mobileVp9 && clip.mobileAv1 && { ...clip.mobileAv1, rung: 'phone' }, clip.mobileVp9 && { ...clip.mobileVp9, rung: 'phone' },
    clip.mobile && { ...clip.mobile, rung: 'phone' }].filter(Boolean);
  for (const file of files) if (!existsSync(join(ROOT, 'public', file.path))) throw new Error(`home-premiere: ${file.path} is not in public/`);
  // an AV1 file's type names its codec in quotes (video/webm; codecs="av01..."): escaped, so the attribute holds whole
  return files.map((file) => `<source data-src="${file.path}" type="${esc(file.type ?? (file.path.endsWith('.mp4') ? 'video/mp4' : 'video/webm'))}"`
    + `${file.rung ? ` data-rung="${file.rung}"` : ''}>`).join('');
}
const seconds = (clip) => (clip.film ?? clip.wide ?? clip.mobile)?.seconds ?? 0;
// what each clip shows (owner 2026-10-25: "also add text here at the left that says stuff about this!"): the media lane's
// manifest names each clip's vehicles (spec ids in frame order, the lead first), its battlefield and its mode
// two vehicles read "A vs B", three "A vs B and C", four (a two-on-two) "A and B vs C and D"
const MATCHUP_KEYS = { 2: 'home.hero.shot', 3: 'home.hero.shotThree', 4: 'home.hero.shotFour' };
/** The vehicles a clip shows, in frame order (their names are the same in every locale): its catalog key, the names and
 *  the English line. */
function matchupOf(id, tanks) {
  const key = MATCHUP_KEYS[tanks?.length];
  if (!key) throw new Error(`home-premiere: ${id} names ${tanks?.length ?? 'no'} vehicles; a caption reads two to four (manifest tanks)`);
  // a name keeps its model and variant on one line: "M1A2 Abrams SEPv3" never breaks before "SEPv3"
  const names = tanks.map((spec) => tank(spec).name.replace(/ /g, '\u00a0'));
  const vars = Object.fromEntries(names.map((name, i) => ['abcd'[i], name]));
  return { key, vars, line: names.reduce((out, name, i) => out.replace(`{${'abcd'[i]}}`, name), text(key)) };
}
/** The matchup as one catalog line. */
function matchup(id, tanks) {
  const { key, vars, line } = matchupOf(id, tanks);
  return `<b data-i18n="${key}" data-i18n-vars="${esc(JSON.stringify(vars))}">${esc(line)}</b>`;
}
/** A clip's mode: its glyph in the mode's own hue, and its name. */
function modeMark(clip) {
  const mode = GAME_MODE_DEFINITIONS[clip.mode];
  if (!mode) throw new Error(`home-premiere: ${clip.id} plays no known mode (manifest mode: ${clip.mode})`);
  return `<span class="hero__mode" data-mode-tone="${clip.mode}">${iconMarkup(mode.icon, 16)}${t(`playMenu.matchMode.${clip.mode}.label`)}</span>`;
}
/** Where and when a clip plays: its battlefield, its hour where the manifest names one (the catalog's atmosphere words),
 *  and its mode. */
function whereLine(clip) {
  if (clip.hour && typeof EN[`atmosphere.${clip.hour}`] !== 'string') throw new Error(`home-premiere: ${clip.id} is filmed at an unknown hour ${clip.hour}`);
  return `${t(`map.${clip.map}`)}${clip.hour ? t(`atmosphere.${clip.hour}`) : ''}${modeMark(clip)}`;
}
/** A reel clip's caption: the vehicles, then where and when, stacked in one cell so the longest sets the box and a turn
 *  moves nothing. */
const shotCaption = (clip, on) => `<span class="hero__shot${on ? ' is-on' : ''}" data-reel-shot="${clip.id}">${matchup(clip.id, clip.tanks)}`
  + `<span class="hero__where">${whereLine(clip)}</span></span>`;
/** One of the trailer's controls: a ghost icon button named for the action it takes (publicPages.ts swaps both as it plays). */
// a toggle holds its other glyph too (homePage.ts sets data-on): the page's inline sprite carries only what the markup names
const filmButton = (role, icon, key, alt = '') => `<button class="${btn('icon', '36')} cot-c-btn--ghost film-btn" type="button" data-film-${role}`
  + ` aria-label="${esc(text(key))}" data-i18n-aria-label="${key}">${iconMarkup(icon, 20)}${alt ? iconMarkup(alt, 20).replace('class="cot-i', 'class="cot-i film-alt') : ''}</button>`;
function heroBlock() {
  if (!REEL.hero?.length) throw new Error('home-premiere: public/media/home-r2/manifest.json names no hero clip');
  if (!TRAILER) throw new Error('home-premiere: the trailer is missing from the site manifest');
  const first = REEL.hero[0];
  const lead = altOf(first);
  const size = reelPoster().find((rung) => rung.width >= 1440) ?? reelPoster().at(-1);
  const moving = REEL.hero.filter((clip) => clip.film || clip.mobile || clip.wide);
  const clips = moving.map((clip) => {
    const alt = altOf(clip);
    return `<video class="hero__clip" muted playsinline loop preload="none" aria-hidden="true" data-reel-clip data-shot="${clip.id}" data-seconds="${seconds(clip)}"`
      + ` data-label="${esc(alt.en)}" data-i18n-label="${alt.key}">${ladder(clip)}</video>`;
  }).join('');
  // the poster is the first clip's frame, so its caption shows until the reel turns (heroReel.ts)
  const shots = [first, ...moving.filter((clip) => clip !== first)].map((clip) => shotCaption(clip, clip === first)).join('');
  const trailer = SITE.files.find((file) => file.path === 'media/site50-r14/films/trailer.webm');
  return `<header class="hero" aria-labelledby="hero-title" data-hero-reel>`
    // its inline preview (tools/hero-lqip.mjs) paints at once under it; the still fades in over it once decoded
    + `<div class="hero__lqip" aria-hidden="true" style="--hero-lqip:url(&quot;${heroLqip(heroDefault())}&quot;)"></div>`
    + `<img class="hero__still" src="${heroDefault()}" alt="${esc(lead.en)}" data-i18n-alt="${lead.key}" width="1920" height="${Math.round(1920 * size.height / size.width)}"`
    + ` fetchpriority="high" decoding="async" srcset="${heroSrcset()}" sizes="${HERO_SIZES}">`
    + `<div class="hero__reel">${clips}</div>`
    + `<div class="hero__grade" aria-hidden="true"></div>`
    // the game's mark and name live in the nav bar alone (owner 2026-10-25: "keep the logo in the navbar, dont need to
    // duplicate it in hero"); the headline says what the game is, and its h1 names the game for assistive tech and search
    + `<div class="hero__card"><div class="hero__lead"><h1 class="hero__title" id="hero-title"><span class="home-sr">Claude of Tanks. </span>${html('home.hero.title')}</h1>`
    + `${t('home.hero.lede', 'p', 'hero__lede')}`
    + `<div class="hero__ctas"><a class="${btn('primary', '64')} hero__play" href="/" data-hero-play>${play}${t('publicNav.playNow')}</a>`
    + `<button class="${btn('', '64')} hero__trailer" type="button" data-trailer-open><span class="hero__thumb" aria-hidden="true">`
    + `<img src="${TRAILER_THUMB}" alt="" width="84" height="46" decoding="async">${play}</span>${iconMarkup('media', 22, 'hero__trailer-icon')}<span>${t('home.hero.trailer')}`
    + `<span class="hero__dur cot-c-muted num" lang="en">${clock(TRAILER.seconds)}</span></span></button></div></div>`
    // the shot on screen and the reel's pause: the captions are the picture's (the poster's alt and the clips' labels name
    // the shots for assistive tech)
    + `<div class="hero__reelbar"><p class="hero__shots" aria-hidden="true">${shots}</p>`
    // the kit's square icon button from the first paint: its slot (home.css) is the size the reel shows it at, so the
    // caption beside it never moves when it appears
    + `<button class="hero__toggle ${btn('icon', '')}" type="button" data-reel-toggle hidden aria-label="${esc(text('publicPages.reel.pauseAria'))}" data-i18n-aria-label="publicPages.reel.pauseAria">`
    // the media player's own pause glyph (mediaPlayer.ts), so the reel's control and the features' are one
    + `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="${MEDIA_PAUSE_ICON}"/></svg></button></div></div>`
    + `<ul class="hero__stats" data-datum="fleet-counts">`
    + `<li>${iconMarkup('gallery', 18)}<b>{{COT_PRODUCTION_VEHICLES}}</b>${t('home.stats.tanks')}</li>`
    + `<li>${iconMarkup('map', 18)}<b>{{COT_BATTLEFIELDS}}</b>${t('home.stats.battlefields')}</li>`
    // every mode together reads with the Deploy screen's glyph: a mode's own glyph (Standard's included) wears its mode hue
    + `<li>${iconMarkup('deploy', 18)}<b>{{COT_BATTLE_MODES}}</b>${t('home.stats.modes')}</li>`
    + `<li>${iconMarkup('team', 18)}<b lang="en">7v7</b>${t('home.stats.rooms')}</li></ul>`
    // the trailer plays in a dialog with its sound, on the viewer's press: nothing of it loads before then. Its controls are
    // the kit's (ghost icon buttons, the Studio's scrubber), never the browser's own (publicPages.ts mountFilm)
    + `<dialog class="hero__film" data-trailer-dialog aria-label="${esc(text('home.hero.trailer'))}" data-i18n-aria-label="home.hero.trailer">`
    + `<video playsinline preload="none" data-trailer data-poster="${C}/films/trailer.jpg" aria-label="${esc(text('home.trailers.trailerAria').replace('{seconds}', String(Math.round(TRAILER.seconds))))}"`
    + ` data-i18n-aria-label="home.trailers.trailerAria" data-i18n-vars='{"seconds":"${Math.round(TRAILER.seconds)}"}'>`
    + `${trailer ? `<source data-src="/${trailer.path}" type="video/webm">` : ''}<source data-src="/${TRAILER.path}" type="video/mp4"></video>`
    + `<div class="film-bar">`
    + filmButton('play', 'play', 'publicPages.film.play', 'pause')
    + `<input class="film-scrub" type="range" min="0" max="1000" step="1" value="0" data-film-scrub aria-label="${esc(text('publicPages.film.seek'))}" data-i18n-aria-label="publicPages.film.seek">`
    + `<span class="film-time num" lang="en" data-film-time>0:00 / ${clock(TRAILER.seconds)}</span>`
    + filmButton('mute', 'sound', 'publicPages.film.mute', 'soundOff')
    + filmButton('full', 'fullscreen', 'publicPages.film.fullscreen')
    + `</div>`
    // a film that cannot load (the link dropped) says so over its poster, with the kit's Retry (homePage.ts mountFilm)
    + `<div class="cot-c-notice hero__film-failed" data-severity="error" role="alert" data-film-failed hidden>`
    + `<span class="cot-c-notice__glyph">${iconMarkup('alert', 20)}</span><span class="cot-c-notice__body"><span class="cot-c-notice__text" data-i18n="home.hero.trailerFailed">${esc(text('home.hero.trailerFailed'))}</span></span>`
    + `<span class="cot-c-notice__acts"><button type="button" class="${btn('', '36')}" data-i18n="notice.retry">${esc(text('notice.retry'))}</button></span></div>`
    + `<button class="${btn('icon', '36')} hero__film-close" type="button" data-trailer-close aria-label="${esc(text('home.hero.closeTrailerAria'))}" data-i18n-aria-label="home.hero.closeTrailerAria">`
    + `${iconMarkup('close', 20)}</button></dialog>`
    + `</header>`;
}

// ---- the features (owner 2026-10-25: "use the videos and pics to show off game features"): one large picture or loop
// each, named in two to four words, the name the way in. A row of one runs the page's width; a row of two splits it.
const C = '/media/site50-r14';
const FEATURE_ROWS = [['battlefields'], ['killcam', 'destruction'], ['watch'], ['studio', 'multiplayer'], ['fleet', 'garage']];
const FEATURE_LINKS = { watch: '/docs/modes', killcam: '/docs/combat', destruction: '/docs/battlefields', studio: '/studio',
  multiplayer: '/docs/multiplayer', garage: '/', battlefields: '/docs/battlefields', fleet: '/gallery' };
function featureTile(slot, wide) {
  const clip = REEL.features?.[slot];
  if (!clip) throw new Error(`home-premiere: public/media/home-r2/manifest.json has no ${slot} feature`);
  const alt = altOf(clip);
  const rungs = clip.poster.rungs;
  const big = rungs.at(-1);
  const sizes = wide ? '(width < 1100px) 100vw, 1440px' : '(width < 768px) 100vw, 50vw';
  const picture = `<img src="${big.path}"${rungs.length > 1 ? ` srcset="${rungs.map((rung) => `${rung.path} ${rung.width}w`).join(', ')}" sizes="${sizes}"` : ''}`
    + ` width="${big.width}" height="${big.height}" alt="${esc(alt.en)}" data-i18n-alt="${alt.key}" loading="lazy" decoding="async">`;
  const film = clip.film || clip.mobile || clip.wide
    ? `<video data-media-player muted loop playsinline preload="none" aria-hidden="true" data-label="${esc(text(`home.features.${slot}`))}"`
      + ` data-i18n-label="home.features.${slot}" data-duration="${seconds(clip)}">${ladder(clip)}</video>`
    : '';
  return `<figure class="feat${wide ? ' feat--wide' : ''} cot-c-media" data-feature="${slot}">${picture}${film}`
    + `<figcaption class="feat__cap"><a class="feat__link" href="${FEATURE_LINKS[slot]}">${t(`home.features.${slot}`)}${iconMarkup('chevronRight', 24)}</a></figcaption></figure>`;
}
function featuresBlock() {
  const tiles = FEATURE_ROWS.flatMap((row) => row.map((slot) => featureTile(slot, row.length === 1))).join('');
  return `<section class="features" aria-label="${esc(text('home.features.aria'))}" data-i18n-aria-label="home.features.aria">`
    + `<div class="features-grid home-shell">${tiles}</div></section>`;
}
// ---- how it plays (owner 2026-10-12: "a new section highlighting all game modes with custom shots for all of them" and
// "far more mechanics"): one rail of large cards, the modes and the three sets of mechanics behind one switch, each card
// its picture and its name. The rail scrolls; its arrows step it by most of a screen.
const SITE_FILE = new Map(SITE.files.map((file) => [`/${file.path}`, file]));
const siteFile = (path) => {
  if (!SITE_FILE.has(path)) throw new Error(`home-premiere: ${path} is not in public/media/site50-r14/manifest.json`);
  return path;
};
const MECHANICS = [
  ['gunnery', 'gun', ['armor', 'ricochet', 'modules', 'ammunition', 'missiles', 'autoloader', 'era', 'thermal', 'roof-guns']],
  ['battlefield', 'map', ['buildings', 'spotting', 'smoke', 'crushing', 'map-vehicles', 'time-of-day', 'impact', 'suspension', 'field-kit']],
  ['beyond', 'star', ['replays', 'equipment', 'consumables', 'radio', 'medals', 'dossiers', 'presets', 'bots', 'mobile']],
];
// the Deploy screen's mode stills (public/media/deploy-r1) by file; its core tiles are cuts of versus stills, so the landing
// takes only the modes' own moments
const DEPLOY_ART = (() => {
  try {
    return new Set(json('public/media/deploy-r1/manifest.json').items
      .filter((item) => !String(item.source).includes('/versus-r1/')).map((item) => `media/deploy-r1/${item.file}`));
  } catch { return new Set(); }
})();
const CARD_SIZES = '(width < 768px) 86vw, (width < 1100px) 62vw, 42vw';
/** A card's picture: the full frame with its 640 rung; its alt is the catalog's own description of the shot. */
function stillTag(path, altKey) {
  const base = siteFile(`${C}/home/${path}.webp`), small = siteFile(`${C}/home/${path}-640.webp`);
  return `<img data-home-slot="${path}" src="${base}" srcset="${small} 640w, ${base} 1280w" sizes="${CARD_SIZES}" width="1280" height="720"`
    + ` alt="${esc(text(altKey))}" data-i18n-alt="${altKey}" loading="lazy" decoding="async">`;
}
function modeTile(id) {
  const def = GAME_MODE_DEFINITIONS[id];
  const deploy = (width) => `media/deploy-r1/${id}-${width}.webp`;
  // the Deploy screen's clean still where it exists (its alt stays empty: the caption names the mode); else the site's
  const picture = DEPLOY_ART.has(deploy(1280)) && DEPLOY_ART.has(deploy(480))
    ? `<img src="/${deploy(1280)}" srcset="/${deploy(480)} 480w, /${deploy(1280)} 1280w" sizes="${CARD_SIZES}" width="1280" height="720" alt="" loading="lazy" decoding="async">`
    : stillTag(`modes/${id}`, `media.home.modes.${id}`);
  return `<figure class="play-tile cot-c-media" data-mode="${id}" data-mode-tone="${id}">${picture}`
    + `<figcaption class="play-tile__nm"><a href="/docs/modes">${iconMarkup(def.icon, 24)}${t(`playMenu.matchMode.${id}.label`, 'b')}</a></figcaption></figure>`;
}
const mechanicTile = (id) => `<figure class="play-tile cot-c-media">${stillTag(`mechanics/${id}`, `media.home.mechanics.${camel(id)}`)}`
  + `<figcaption class="play-tile__nm">${t(`home.mechanics.${camel(id)}.title`, 'b')}</figcaption></figure>`;
function playBlock() {
  const tabs = [['modes', 'deploy', 'home.stats.modes', ''],
    ...MECHANICS.map(([group, icon]) => [group, icon, `home.mechanics.group.${group}`, ''])]
    .map(([value, icon, key, extra], i) => `<button class="cot-c-seg__opt" type="button" role="tab" id="play-tab-${value}" aria-controls="play-panel-${value}"`
      + ` data-play-tab="${value}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">`
      + `${iconMarkup(icon, 16)}${t(key)}${extra}</button>`).join('');
  const arrow = (dir, key) => `<button class="${btn('icon', '')}" type="button" data-rail-${dir}${dir === 'prev' ? ' disabled' : ''} aria-label="${esc(text(key))}" data-i18n-aria-label="${key}">`
    + `${iconMarkup(dir === 'prev' ? 'chevronLeft' : 'chevronRight', 18)}</button>`;
  const panel = (value, tiles, hidden) => `<div class="play-rail" id="play-panel-${value}" data-play-panel="${value}" tabindex="0" role="tabpanel" aria-labelledby="play-tab-${value}"${hidden ? ' hidden' : ''}>${tiles.join('')}</div>`;
  return `<section class="play" id="modes" aria-labelledby="play-title"><div class="home-shell">`
    + `<header class="home-head"><h2 class="home-h2" id="play-title">${t('home.play.title', 'span', 't-hollow')}</h2>`
    + `<div class="play-acts"><div class="cot-c-seg" role="tablist" aria-labelledby="play-title">${tabs}</div>`
    + `${arrow('prev', 'home.play.previousAria')}${arrow('next', 'home.play.nextAria')}</div></header>`
    + panel('modes', MODE_PRESENTATION_ORDER.map(modeTile), false)
    + MECHANICS.map(([group, , ids]) => panel(group, ids.map(mechanicTile), true)).join('')
    + `</div></section>`;
}

// ---- head to head and the fleet (owner 2026-10-25: "we need to show of all our higher quality stuff. we hide too much and
// we had better sections"): the media lane's versus twelve (public/media/versus-r1, `featured` in its order) and its fleet
// strip (public/media/home-r2 fleetStrip), each a bento of large stills: the first spans two columns and two rows, every
// still is named by what it shows and opens its vehicle's Gallery page. Below the fold: lazy, sized, no script.
const VERSUS = json('public/media/versus-r1/manifest.json');
/** The rungs a tile can use: the lead is at most 900 css px wide (its 3840 for dense screens), a small tile 450, and a
 *  phone's rail card 86 % of the screen. */
const BENTO_RUNGS = { lead: [1280, 1920, 3840], tile: [640, 1280, 1920] };
/** A still's rungs as a srcset; the 1920 rung is its src. */
function bentoRungs(rungs, lead) {
  const sorted = [...rungs].sort((a, b) => a.width - b.width).filter((rung) => BENTO_RUNGS[lead ? 'lead' : 'tile'].includes(rung.width));
  if (!sorted.some((rung) => rung.width === 1920)) throw new Error(`home-premiere: ${rungs[0]?.path} has no 1920 rung`);
  return sorted;
}
function bentoPicture(rungs, lead) {
  const sorted = bentoRungs(rungs, lead);
  const base = sorted.find((rung) => rung.width === 1920);
  for (const rung of sorted) if (!existsSync(join(ROOT, 'public', rung.path))) throw new Error(`home-premiere: ${rung.path} is not in public/`);
  const sizes = lead ? '(width < 768px) 100vw, (width < 1100px) 66vw, 900px' : '(width < 768px) 50vw, (width < 1100px) 33vw, 450px';
  return `<img src="${base.path}" srcset="${sorted.map((rung) => `${rung.path} ${rung.width}w`).join(', ')}" sizes="${sizes}"`
    + ` width="1920" height="1080" alt="" loading="lazy" decoding="async">`;
}
/** One still: its picture (its alt stays empty: the caption names it) and its two lines on their own scrim (home.css
 *  .bento__words), the whole tile the way in. */
const bentoTile = (cls, picture, href, name, where) => `<figure class="${cls} cot-c-media">${picture}`
  + `<figcaption class="bento__cap"><a href="${href}"><span class="bento__words">${name}<span class="bento__where">${where.join('')}</span></span></a></figcaption></figure>`;
const bentoHead = (id, key, href, linkKey) => `<header class="home-head"><h2 class="home-h2" id="${id}">${t(key, 'span', 't-hollow')}</h2>`
  + `${href ? `<a class="${btn('', '')}" href="${href}">${t(linkKey)}${iconMarkup('chevronRight', 18)}</a>` : ''}</header>`;
// the duels that move (owner 2026-10-27: "in home, lets try to use our coolest versus videos too, make em load fast and
// transition in"): the media lane's home-r2 duels, keyed by the versus still each one moves (the same staging). Its poster,
// the loop's own first frame, takes the still's place, and the loop fades in over it on the features' player
// (mediaPlayer.ts: its file only near the screen, revealed once it can play through, from its first frame).
const DUELS = REEL.duels ?? {};
const DUELS_MAX = 6;
function duelsBlock() {
  if (VERSUS.featured?.length !== 12) throw new Error('home-premiere: public/media/versus-r1/manifest.json features no twelve');
  const moving = Object.keys(DUELS);
  const stray = moving.filter((id) => !VERSUS.featured.includes(id));
  if (stray.length) throw new Error(`home-premiere: home-r2 duels ${stray.join(', ')} move no featured versus still`);
  if (moving.length > DUELS_MAX) throw new Error(`home-premiere: home-r2 names ${moving.length} duels; the bento plays at most ${DUELS_MAX}`);
  const tiles = VERSUS.featured.map((id, i) => {
    const item = VERSUS.items.find((entry) => entry.id === id);
    if (!item?.rungs?.length) throw new Error(`home-premiere: versus ${id} has no rungs`);
    const hero = item.tanks.find((entry) => entry.role === 'hero'), foe = item.tanks.find((entry) => entry.role === 'foe');
    if (!hero || !foe) throw new Error(`home-premiere: versus ${id} names no hero and foe`);
    const name = matchup(id, [hero.id, foe.id]);
    const clip = DUELS[id];
    if (clip && !clip.poster?.rungs?.length) throw new Error(`home-premiere: duel ${id} has no poster`);
    // the loop names itself for its player's control ("Play <matchup>"), in either language (publicPages.ts videoLabels)
    const shot = clip && matchupOf(id, [hero.id, foe.id]);
    const film = clip ? `<video data-media-player muted loop playsinline preload="none" aria-hidden="true" data-duration="${seconds(clip)}"`
      + ` data-label="${esc(shot.line)}" data-i18n-label="${shot.key}" data-i18n-vars="${esc(JSON.stringify(shot.vars))}">${ladder(clip)}</video>` : '';
    // the duel opens in the Gallery as a duel: its hero, its foe the rival (gallery.ts reads vs)
    return bentoTile(`bento__tile${i === 0 ? ' bento__tile--lead' : ''}`, bentoPicture(clip ? clip.poster.rungs : item.rungs, i === 0) + film,
      `${galleryHref(hero.id)}&amp;vs=${foe.id}`, name, [t(`map.${item.map}`), t(`atmosphere.${item.hour}`)]);
  });
  return `<section class="bento bento--duels" aria-labelledby="duels-title"><div class="home-shell">`
    + bentoHead('duels-title', 'home.duels.title', '/docs/filming#library', 'publicNav.media')
    + `<div class="bento__grid">${tiles.join('')}</div></div></section>`;
}
// in battle: the media lane's battle clips (home-r2 clips[]), four loops two to a row, each its poster until the media
// player gives it its file on screen (mediaPlayer.ts, the features' own player), named like the reel's shots
function clipsBlock() {
  const clips = REEL.clips ?? [];
  if (clips.length !== 4) throw new Error('home-premiere: public/media/home-r2/manifest.json has no four battle clips');
  const tiles = clips.map((clip) => {
    const rungs = [...clip.poster.rungs].sort((a, b) => a.width - b.width);
    const base = rungs.find((rung) => rung.width === 1280) ?? rungs.at(-1);
    const picture = `<img src="${base.path}" srcset="${rungs.map((rung) => `${rung.path} ${rung.width}w`).join(', ')}"`
      + ` sizes="(width < 768px) 86vw, (width < 1100px) 50vw, 680px" width="1280" height="720" alt="" loading="lazy" decoding="async">`;
    // the loop names itself for its player's control ("Play <matchup>"), in either language (publicPages.ts videoLabels)
    const shot = matchupOf(clip.id, clip.tanks);
    const film = `<video data-media-player muted loop playsinline preload="none" aria-hidden="true" data-duration="${seconds(clip)}"`
      + ` data-label="${esc(shot.line)}" data-i18n-label="${shot.key}" data-i18n-vars="${esc(JSON.stringify(shot.vars))}">${ladder(clip)}</video>`;
    return `<figure class="bento__tile cot-c-media" data-clip="${clip.id}">${picture}${film}`
      + `<figcaption class="bento__cap"><a href="${galleryHref(clip.tanks[0])}"><span class="bento__words">${matchup(clip.id, clip.tanks)}`
      + `<span class="bento__where">${whereLine(clip)}</span></span></a></figcaption></figure>`;
  });
  return `<section class="bento bento--clips" aria-labelledby="clips-title"><div class="home-shell">`
    + bentoHead('clips-title', 'home.clips.title') + `<div class="bento__grid">${tiles.join('')}</div></div></section>`;
}
function fleetBlock() {
  const strip = REEL.fleetStrip ?? [];
  if (strip.length !== 9) throw new Error('home-premiere: public/media/home-r2/manifest.json has no fleet strip of nine');
  const tiles = strip.map((entry, i) => {
    const a = tank(entry.specId);
    return bentoTile(`bento__tile${i === 0 ? ' bento__tile--lead' : ''}`, bentoPicture(entry.rungs, i === 0), galleryHref(entry.specId),
      `<b>${esc(a.name.replace(/ /g, '\u00a0'))}</b>`, [t(`nation.${a.nation}`), t(`map.${entry.map}`)]);
  });
  return `<section class="bento bento--fleet" aria-labelledby="fleet-title"><div class="home-shell">`
    + bentoHead('fleet-title', 'home.fleet.title', '/gallery', 'publicNav.tankGallery')
    + `<div class="bento__grid">${tiles.join('')}</div></div></section>`;
}

// ---- the fleet index (src/presentation/fleetWall.json): the 404 page's search over every vehicle with a fleet take --
// twelve nations, one take each (the newest fleet round), around the featured vehicle's plate
const FLEET = ['t14', 'leo2a7v', 'm1a2_x', 'challenger1', 'strv122', 'type99a', 'type90', 'merkava2d', 'ua_t80u_kursk', 'amx40_x',
  'dardo', 'pl_t72b3m_modern'];
const v = (hash) => (hash ? `?v=${hash.slice(0, 8)}` : '');
// the featured plate's tank: its hero card render over its waving flag (src/ui/heroCard.css), the direction's x-ray slot
function heroLayers(id, a) {
  const row = HERO.tanks[id];
  const flagRow = HERO.flags[row?.flag ?? a.countryCode];
  if (!row || !flagRow) throw new Error(`home-premiere: ${id} has no tank hero card`);
  const [cx, cw, ch, cb, fx0, fx1] = row.b;
  const mirrored = (row.face?.[1] ?? 'left') !== 'left';
  return {
    flag: [`/icons/hero/flag-${row.flag}-480.avif${v(flagRow.sha[0])} 480w, /icons/hero/flag-${row.flag}-960.avif${v(flagRow.sha[1])} 960w`,
      `/icons/hero/flag-${row.flag}-480.webp${v(flagRow.sha[2])}`],
    tank: [`/icons/hero/${id}-480.avif${v(row.sha[0])} 480w, /icons/hero/${id}-960.avif${v(row.sha[1])} 960w`,
      `/icons/hero/${id}-480.webp${v(row.sha[2])}`],
    place: `--hc-cx:${cx};--hc-cw:${cw};--hc-ch:${ch};--hc-cb:${cb};--hc-fx0:${fx0};--hc-fx1:${fx1};--hc-fw:${Number((fx1 - fx0).toFixed(4))}${mirrored ? ';--hc-gs:-1' : ''}`,
  };
}
const pen = (a) => Math.max(0, ...(a.gun?.shells ?? []).map((s) => Number(s.pen100Mm) || 0));
// the direction's crew, weight and top speed: the spec's crew volumes and mobility figures (the Gallery's dossier reads them too)
function mobility(id) {
  const spec = getSpec(id);
  const crew = spec.armor?.crew?.length ?? 0, weight = Number(spec.weightTons) || 0, speed = Number(spec.topSpeedKmh) || 0;
  if (!crew || !weight || !speed) throw new Error(`home-premiere: ${id} has no crew, weight or top speed`);
  return { crew, weight: String(Math.round(weight * 10) / 10), speed: Math.round(speed) };
}
// Every vehicle with a fleet take, in src/presentation/fleetWall.json for fleetWall.ts (which loads with the first chip
// or keystroke): its tile, its plate facts and the Garage's facet-search entry (vehicleFacets.ts, vehicleFacetSearch.ts),
// with the English and Chinese words of its name, nation and facets. The curated twelve lead, in their order.
const WALL_JSON = join(ROOT, 'src/presentation/fleetWall.json');
const NATION_ORDER = ['us', 'gb', 'de', 'fr', 'ru', 'ua', 'cn', 'kr', 'jp', 'il', 'it', 'se', 'pl'];
/** The class chips: the classes the takes fill (others answer `class:` in the search), and concept-and-prototype. */
const lower = (value) => String(value || '').toLocaleLowerCase('en-US');
function fleetCard(take, entry) {
  const id = TANK_IDS.resolve(take, String(TAKES.tankIdSchema ?? 1));
  const a = tank(id);
  return { id, a, take: entry, hero: heroLayers(id, a), m: mobility(id) };
}
/** The plate's facts of one vehicle (publicPages.ts FleetFeature): what a tile shows when it is pointed at. */
const feature = (c) => ({ name: c.a.name, flag: c.a.countryCode, tier: tierNumeral(c.id), cal: c.a.gun?.caliberMm ?? 0,
  pen: pen(c.a), crew: c.m.crew, weight: c.m.weight, speed: c.m.speed, tank: c.hero.tank, banner: c.hero.flag, place: c.hero.place,
  anatomy: galleryHref(c.id, 'modules').replace(/&amp;/g, '&'), drive: driveHref(c.id).replace(/&amp;/g, '&') });
let wall = null;
function fleetWall() {
  if (wall) return wall;
  const curated = FLEET.map((take) => [take, TAKES.vehicles[take]]);
  const rest = Object.entries(TAKES.vehicles).filter(([take]) => !FLEET.includes(take));
  const cards = [...curated, ...rest].map(([take, entry]) => fleetCard(take, entry));
  const rank = (c) => NATION_ORDER.indexOf(c.a.countryCode);
  const ordered = [...cards.slice(0, FLEET.length), ...cards.slice(FLEET.length)
    .sort((x, y) => rank(x) - rank(y) || displayTier(y.id) - displayTier(x.id) || x.a.name.localeCompare(y.a.name))];
  const records = ordered.map((c) => {
    const facets = vehicleFacetsForId(c.id);
    if (!facets) throw new Error(`home-premiere: ${c.id} has no class, role or status (src/vehicles/vehicleFacets.ts)`);
    const nationKey = `nation.${c.a.nation}`;
    const nationTerms = [...new Set([c.a.nation, c.a.markings?.countryLabel, c.a.countryCode, ZH[nationKey]].filter(Boolean).map(lower))];
    const words = [c.a.name, ...(c.a.label?.searchAliases ?? []), ...nationTerms, c.a.era, `tier ${displayTier(c.id)}`, tierNumeral(c.id),
      vehicleFacetSearchWords(facets, (key) => EN[key] ?? key), vehicleFacetSearchWords(facets, (key) => ZH[key] ?? key)];
    return {
      id: c.id, name: c.a.name, flag: c.a.countryCode, href: galleryHref(c.id).replace(/&amp;/g, '&'), poster: c.take.poster, loop: c.take.loop, title: c.take.title,
      // each word once (the facet labels and their aliases repeat across the English and Chinese words)
      entry: { searchText: [...new Set(lower(words.join(' ')).split(/\s+/).filter(Boolean))].join(' '), facets, era: c.a.era, nationTerms, tier: displayTier(c.id) },
      feature: feature(c),
    };
  });
  wall = { cards: ordered, records };
  return wall;
}
const wallJson = () => `[\n${fleetWall().records.map((record) => JSON.stringify(record)).join(',\n')}\n]\n`;

const BLOCKS = { hero: heroBlock, duels: duelsBlock, features: featuresBlock, clips: clipsBlock, play: playBlock, fleet: fleetBlock };
const PRELOAD = /<link rel="preload"[^>]*as="image"[^>]*fetchpriority="high"[^>]*>/;
const preloadTag = () => `<link rel="preload" href="${heroDefault()}" as="image" type="image/webp" fetchpriority="high" imagesrcset="${heroSrcset()}" imagesizes="${HERO_SIZES}">`;
const HOME = join(ROOT, 'site/home.html');
export function renderHome(html) {
  if (!PRELOAD.test(html)) throw new Error('home-premiere: the hero still\'s preload is missing from site/home.html');
  let out = html.replace(PRELOAD, () => preloadTag());
  for (const [name, render] of Object.entries(BLOCKS)) {
    const marker = new RegExp(`<!--home:${name}-->[\\s\\S]*?<!--/home:${name}-->`);
    if (!marker.test(out)) throw new Error(`home-premiere: <!--home:${name}--> is missing from site/home.html`);
    out = out.replace(marker, () => `<!--home:${name}-->${render()}<!--/home:${name}-->`);
  }
  return out;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write')) syncAltCatalogs();
  const html = readFileSync(HOME, 'utf8');
  const next = renderHome(html);
  const json = wallJson();
  let current = '';
  try { current = readFileSync(WALL_JSON, 'utf8'); } catch { /* first write */ }
  if (process.argv.includes('--write')) {
    if (next !== html) writeFileSync(HOME, next);
    if (json !== current) writeFileSync(WALL_JSON, json);
    console.log(`home-premiere: written (${fleetWall().records.length} vehicles in src/presentation/fleetWall.json)`);
  } else if (next !== html || json !== current) {
    console.error('home-premiere: site/home.html or src/presentation/fleetWall.json is stale (node tools/home-premiere.mjs --write)');
    process.exit(1);
  } else console.log('home-premiere: site/home.html and src/presentation/fleetWall.json are current');
}
