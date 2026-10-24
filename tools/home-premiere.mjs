#!/usr/bin/env node
// home-premiere.mjs — writes the landing's Premiere blocks into site/home.html from the direction's own pages
// (streams/brand-ui/phase2/bui01/src/pages: 01-landing-hero, 02-landing-versus-wall, 03-landing-fleet-wall and the
// phone 90-phone-landing; src/ui/components/DIRECTION.md maps their classes to the kit) and the data they show: the
// versus films and stills (public/media/versus-films-r1, versus-r1), the fleet takes (public/media/site50-r14/fleet),
// the tank hero cards (public/icons/hero), the vehicle facts (public/icons/tank-assets.json), the battlefields
// (src/world/maps/mapIds.ts, their art in public/maps, their landscapes in src/ui/regionTags.ts) and the catalog's map
// and time names. Each block sits between <!--home:NAME--> and <!--/home:NAME-->. Run `node tools/public-shell.mjs
// --write` after it (the shell inlines the flags and glyphs the blocks reference). Copyright © 2026 Kevin B. Liu.
//
//   node tools/home-premiere.mjs           check (exit 1 when a block is stale)
//   node tools/home-premiere.mjs --write   rewrite the blocks
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flagMarkup, iconMarkup } from '../src/presentation/publicShell.ts';
import { TANK_IDS } from '../src/vehicles/tankIdAliases.ts';
import '../src/vehicles/tankFactory.ts';
import { getSpec } from '../src/vehicles/specs.ts';
import { CONCEPT_PROTOTYPE_CLASS_FILTER, CONCEPT_PROTOTYPE_FILTER_META, VEHICLE_CLASS_META, vehicleFacetSearchWords, vehicleFacetsForId }
  from '../src/vehicles/vehicleFacets.ts';
import { MAP_IDS } from '../src/world/maps/mapIds.ts';
import { BATTLE_MODE_IDS, GAME_MODE_DEFINITIONS } from '../src/sim/gameModeCatalog.ts';
import { srcsetFor, stillRungs } from '../src/presentation/responsivePicture.ts';
import { mapRegionTags, regionTagIcon } from '../src/ui/regionTags.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const EN = json('src/ui/i18nCatalog.en-US.json');
const ZH = json('src/ui/i18nCatalog.zh-CN.json');
const ASSETS = json('public/icons/tank-assets.json').tanks;
const HERO = json('public/icons/hero/hero-cards.json');
const FILMS = new Map(json('public/media/versus-films-r1/manifest.json').items.map((item) => [item.id, item]));
const STILLS = new Map(json('public/media/versus-r1/manifest.json').items.map((item) => [item.id, item]));
// the hero's responsive rungs of its versus still (public/media/home-hero-r1, from the 2560 px master)
const HERO_RUNGS = json('public/media/home-hero-r1/manifest.json');
/** The hero still covers the viewport: a phone shows 640 px of height (1138 css px wide), a desktop its width. */
const HERO_SIZES = '(width < 768px) 1138px, 100vw';
const heroSrcset = () => HERO_RUNGS.items.map((rung) => `${rung.path} ${rung.width}w`).join(', ');
const heroDefault = () => HERO_RUNGS.items.find((rung) => rung.width === 1440).path;
const TAKES = json('public/media/site50-r14/fleet/index.json');
const SITE = json('public/media/site50-r14/manifest.json');
// The horizontal lockup (public/brand/lockup.svg from tools/brand-marks.mjs: the commander's tank and the outlined
// wordmark), inline so it paints with the document: the tank and the words take the ink, the commander and the "of" the
// accent.
const LOCKUP = readFileSync(join(ROOT, 'public/brand/lockup.svg'), 'utf8');
function lockupMarkup(titleId) {
  const viewBox = /viewBox="([^"]+)"/.exec(LOCKUP)?.[1];
  const body = LOCKUP.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/stroke="#f6f3ec"/g, 'stroke="currentColor"').replace(/stroke="#f0a030"/g, 'style="stroke:var(--accent)"')
    .replace(/fill="#f6f3ec"/g, 'fill="currentColor"').replace(/fill="#f0a030"/g, 'style="fill:var(--accent)"')
    .replace(/style="fill:#f0a030"/g, 'style="fill:var(--accent)"');
  if (!viewBox || /#[0-9a-f]{3,8}\b/i.test(body)) throw new Error('home-premiere: public/brand/lockup.svg is not the two-ink lockup');
  return `<svg class="hero__lockup" viewBox="${viewBox}" role="img" aria-labelledby="${titleId}"><title id="${titleId}">Claude of Tanks</title>${body}</svg>`;
}
const STAMP = TANK_IDS.linkParam();

const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const text = (key) => {
  if (typeof EN[key] !== 'string') throw new Error(`home-premiere: ${key} is not in the en-US catalog`);
  return EN[key];
};
const t = (key, tag = 'span', cls = '') => `<${tag}${cls ? ` class="${cls}"` : ''} data-i18n="${key}">${esc(text(key))}</${tag}>`;
const tank = (id) => {
  const a = ASSETS[id];
  if (!a) throw new Error(`home-premiere: ${id} is not in public/icons/tank-assets.json`);
  return a;
};
const galleryHref = (id, layer = '') => `/gallery?id=${id}${layer ? `&amp;layer=${layer}` : ''}${STAMP ? `&amp;${STAMP}` : ''}`;
const driveHref = (id) => `/?testdrive=${id}${STAMP ? `&amp;${STAMP}` : ''}`;
const studioHref = (map) => `/studio?map=${map}`;
const flag = (code, size = 'md', extra = '') => flagMarkup(code, `cot-c-flag cot-c-flag--${size}${extra ? ` ${extra}` : ''}`);
// direction silM(id, cls, w, h): the side silhouette as a mask, sized by the block that holds it
const sil = (id, right = false) => `<i class="cot-c-sil${right ? ' cot-c-sil--right' : ''}" style="--sil:url('/icons/${id}_side_silhouette.png')" aria-hidden="true"></i>`;
const HOUR_ICON = { day: 'timeDay', golden: 'timeSunset', sunset: 'timeSunset', night: 'regionNight' };
const hourKey = (hour) => `atmosphere.${hour}`;
const where = (map, hour) => `${iconMarkup('map', 16)}${t(`map.${map}`)}${iconMarkup(HOUR_ICON[hour], 16)}${t(hourKey(hour))}`;
// the duel line (01 .matchup, 02 .duel): flag, silhouette and name each side of the VS, the rival mirrored
const side = (id, foe = false) => {
  const a = tank(id);
  return foe
    ? `<span class="vs-side vs-side--foe"><b>${esc(a.name)}</b>${sil(id, true)}${flag(a.countryCode)}</span>`
    : `<span class="vs-side">${flag(a.countryCode)}${sil(id)}<b>${esc(a.name)}</b></span>`;
};
const duel = (hero, foe) => `<span class="vs-duel">${side(hero)}<span class="cot-c-vs vs-mark" lang="en">VS</span>${side(foe, true)}</span>`;
const play = iconMarkup('play', 18);
const btn = (variant, size) => `cot-c-btn${variant ? ` cot-c-btn--${variant}` : ''}${size ? ` cot-c-btn--${size}` : ''}`;
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

// ---- 01: the living versus hero (01-landing-hero; the phone's 90-phone-landing is its <768 px layout) ----------------
// The direction's own still: Steinburg by day with the sky over the town for the headline and both tanks on the road.
const HERO_ID = 'f6-leo2a6-steinburg-r6';
const HERO_FILM = 'f6-leo2a6-steinburg-r7';
const TRAILER = SITE.files.find((file) => file.path === 'media/site50-r14/films/trailer.mp4');
const TRAILER_THUMB = '/media/site50-r14/stills/s16-street-duel-thumb.webp';
function heroBlock() {
  const still = STILLS.get(HERO_ID);
  if (HERO_RUNGS.still !== HERO_ID) throw new Error('home-premiere: public/media/home-hero-r1 is not the hero still\'s rungs');
  const film = FILMS.get(HERO_FILM);
  const [a, b] = film.tanks;
  const titleKey = `media.versus.title.${camel(HERO_ID)}`;
  if (!still || !TRAILER) throw new Error('home-premiere: the hero still or the trailer is missing');
  return `<header class="hero" aria-labelledby="hero-title">`
    + `<img class="hero__still" src="${heroDefault()}" alt="${esc(text(titleKey))}" data-i18n-alt="${titleKey}" width="${still.width}" height="${still.height}" fetchpriority="high" decoding="async" srcset="${heroSrcset()}" sizes="${HERO_SIZES}">`
    + `<div class="hero__grade" aria-hidden="true"></div>`
    + `<div class="hero__card"><h1 class="hero__title" id="hero-title">${lockupMarkup('hero-title-name')}</h1>`
    + `<div class="hero__ctas"><a class="${btn('primary', '64')} hero__play" href="/" data-hero-play>${play}${t('publicNav.playNow')}<kbd class="cot-c-kbd" lang="en">Enter</kbd></a>`
    + `<a class="${btn('', '64')} hero__trailer" href="#trailers" data-trailer-open><span class="hero__thumb" aria-hidden="true">`
    + `<img src="${TRAILER_THUMB}" alt="" width="84" height="46" decoding="async">${play}</span>${t('home.hero.trailer')}`
    + `<span class="hero__dur cot-c-muted num" lang="en">${clock(TRAILER.seconds)}</span></a></div></div>`
    + `<div class="hero__matchup">${duel(a.id, b.id)}<span class="vs-where">${where(film.map, film.hour)}</span></div>`
    + `<div class="hero__scene"><a class="${btn('', '36')}" href="${driveHref(a.id)}">${iconMarkup('vehicle', 16)}${t('home.testDrive')}</a>`
    + `<a class="${btn('', '36')}" href="${studioHref(film.map)}">${iconMarkup('studio', 16)}${t('home.hero.openScene')}</a></div>`
    + `<ul class="hero__stats">`
    + `<li>${iconMarkup('gallery', 18)}<b>{{COT_PRODUCTION_VEHICLES}}</b>${t('home.stats.tanks')}</li>`
    + `<li>${iconMarkup('map', 18)}<b>{{COT_BATTLEFIELDS}}</b>${t('home.stats.battlefields')}</li>`
    + `<li>${iconMarkup('modeStandard', 18)}<b>{{COT_BATTLE_MODES}}</b>${t('home.stats.modes')}</li>`
    + `<li>${iconMarkup('team', 18)}<b lang="en">7v7</b>${t('home.stats.rooms')}</li>`
    + `<li>${iconMarkup('globe', 18)}<b lang="en">EN</b><b lang="zh-CN">中文</b></li></ul>`
    + `</header>`;
}

// ---- 02: the versus wall (02-landing-versus-wall) ----------------------------------------------------------------
const WALL = [
  ['vs03-reservoir-k2-ztz99-r6', 'big'], ['vs02-verdant-challenger-t80u-r6', 'mid'], ['vs09-alpine-strv122-t80bv-r7', 'mid'],
  ['vs01-desert-abrams-t90m-r6', 'sm'], ['vs05-oasis-merkava-t72b3-r6', 'sm'], ['vs04-railyard-leclerc-t14-r7', 'sm'],
  ['vs10-steppe-chieftain-t64-r7', 'sm'], ['vs06-coastal-type10-ztz99a2-r7', 'sm'], ['vs07-autumn-ariete-t62-r7', 'sm'],
  ['vs08-winter-cv90-bmp3-r7', 'sm'], ['f7-t90m-column-r5', 'sm'],
];
function versusBlock() {
  const hours = [...new Set(WALL.map(([id]) => FILMS.get(id).hour))];
  const tiles = WALL.map(([id, size], i) => {
    const film = FILMS.get(id);
    if (!film) throw new Error(`home-premiere: ${id} has no versus film`);
    const [a, b] = film.tanks;
    const titleKey = `media.versus.title.${camel(id)}`;
    const alt = EN[titleKey] ? `alt="${esc(EN[titleKey])}" data-i18n-alt="${titleKey}"` : `alt="${esc(film.title.en)}"`;
    const label = EN[titleKey] ? `data-label="${esc(EN[titleKey])}" data-i18n-label="${titleKey}"` : `data-label="${esc(film.title.en)}"`;
    const whereLine = `<span class="vs-where">${where(film.map, film.hour)}</span>`;
    const foot = size === 'big'
      ? `<span class="vs-row2">${whereLine}<span class="vs-acts"><a class="${btn('primary', '36')}" href="${driveHref(a.id)}">${play}${t('home.testDrive')}</a>`
        + `<a class="${btn('', '36')}" href="${studioHref(film.map)}">${iconMarkup('studio', 16)}${t('home.hero.openScene')}</a></span></span>`
      : whereLine;
    return `<figure class="vs-tile vs-tile--${size} cot-c-media" data-hour="${film.hour}">`
      + `<img class="vs-tile__still" src="${film.poster.path}" ${alt} width="${film.poster.width}" height="${film.poster.height}" loading="lazy" decoding="async">`
      + `<video class="vs-tile__film" data-media-player${size === 'big' ? '' : '="hover"'} muted loop playsinline preload="none" aria-hidden="true" ${label} data-duration="${film.film.seconds}">`
      + `<source data-src="${film.film.path}" type="video/mp4"><source data-src="${film.mobile.path}" type="video/mp4" data-rung="phone"></video>`
      + `<span class="vs-tile__idx num" lang="en" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>`
      + `<figcaption class="vs-tile__meta">${duel(a.id, b.id)}${foot}</figcaption></figure>`;
  });
  const count = (n) => `<span class="cot-c-tabs__count num" lang="en">${n}</span>`;
  const filters = [['all', 'camoTag.all', 'cameraPath'], ...hours.map((h) => [h, hourKey(h), HOUR_ICON[h]])]
    .map(([value, key, icon], i) => `<button class="cot-c-seg__opt" type="button" role="radio" data-versus-filter="${value}" aria-checked="${i === 0}">`
      + `${iconMarkup(icon, 16)}${t(key)}${i === 0 ? count(WALL.length) : ''}</button>`).join('');
  return `<section class="versus" id="versus" aria-labelledby="versus-title"><div class="home-shell">`
    + `<header class="home-head"><h2 class="home-h2" id="versus-title"><span class="t-accent">${WALL.length}</span> ${t('home.versus.duels', 'span', 't-hollow')}</h2>`
    + `<div class="cot-c-seg" role="radiogroup" aria-label="${esc(text('home.versus.filterAria'))}" data-i18n-aria-label="home.versus.filterAria">${filters}</div></header>`
    + `<div class="vs-grid" data-versus-wall>${tiles.join('')}</div></div></section>`;
}

// ---- 03: the fleet wall and the battlefields (03-landing-fleet-wall) ----------------------------------------------
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
const takeKey = (take) => `media.site50.title.${camel(take.take)}`;
const PLATE_SIZES = '(width < 1100px) 100vw, 34vw';
const pen = (a) => Math.max(0, ...(a.gun?.shells ?? []).map((s) => Number(s.pen100Mm) || 0));
// the direction's crew, weight and top speed: the spec's crew volumes and mobility figures (the Gallery's dossier reads them too)
function mobility(id) {
  const spec = getSpec(id);
  const crew = spec.armor?.crew?.length ?? 0, weight = Number(spec.weightTons) || 0, speed = Number(spec.topSpeedKmh) || 0;
  if (!crew || !weight || !speed) throw new Error(`home-premiere: ${id} has no crew, weight or top speed`);
  return { crew, weight: String(Math.round(weight * 10) / 10), speed: Math.round(speed) };
}
// ---- 03 .facets: the fleet wall's nation and class chips and its search --------------------------------------------
// Every vehicle with a fleet take, in src/presentation/fleetWall.json for fleetWall.ts (which loads with the first chip
// or keystroke): its tile, its plate facts and the Garage's facet-search entry (vehicleFacets.ts, vehicleFacetSearch.ts),
// with the English and Chinese words of its name, nation and facets. The curated twelve lead, in their order.
const WALL_JSON = join(ROOT, 'src/presentation/fleetWall.json');
const NATION_ORDER = ['us', 'gb', 'de', 'fr', 'ru', 'ua', 'cn', 'kr', 'jp', 'il', 'it', 'se', 'pl'];
/** The class chips: the classes the takes fill (others answer `class:` in the search), and concept-and-prototype. */
const WALL_CLASSES = ['mbt', 'ifv', 'light', 'td', CONCEPT_PROTOTYPE_CLASS_FILTER];
const classMeta = (value) => (value === CONCEPT_PROTOTYPE_CLASS_FILTER ? CONCEPT_PROTOTYPE_FILTER_META : VEHICLE_CLASS_META[value]);
const lower = (value) => String(value || '').toLocaleLowerCase('en-US');
function fleetCard(take, entry) {
  const id = TANK_IDS.resolve(take, String(TAKES.tankIdSchema ?? 1));
  const a = tank(id);
  return { id, a, take: entry, hero: heroLayers(id, a), m: mobility(id) };
}
/** The plate's facts of one vehicle (publicPages.ts FleetFeature): what a tile shows when it is pointed at. */
const feature = (c) => ({ name: c.a.name, flag: c.a.countryCode, tier: c.a.tierNumeral, cal: c.a.gun?.caliberMm ?? 0,
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
    .sort((x, y) => rank(x) - rank(y) || y.a.tier - x.a.tier || x.a.name.localeCompare(y.a.name))];
  const records = ordered.map((c) => {
    const facets = vehicleFacetsForId(c.id);
    if (!facets) throw new Error(`home-premiere: ${c.id} has no class, role or status (src/vehicles/vehicleFacets.ts)`);
    const nationKey = `nation.${c.a.nation}`;
    const nationTerms = [...new Set([c.a.nation, c.a.markings?.countryLabel, c.a.countryCode, ZH[nationKey]].filter(Boolean).map(lower))];
    const words = [c.a.name, ...(c.a.label?.searchAliases ?? []), ...nationTerms, c.a.era, `tier ${c.a.tier}`, c.a.tierNumeral,
      vehicleFacetSearchWords(facets, (key) => EN[key] ?? key), vehicleFacetSearchWords(facets, (key) => ZH[key] ?? key)];
    return {
      id: c.id, name: c.a.name, flag: c.a.countryCode, href: galleryHref(c.id).replace(/&amp;/g, '&'), poster: c.take.poster, loop: c.take.loop, title: c.take.title,
      // each word once (the facet labels and their aliases repeat across the English and Chinese words)
      entry: { searchText: [...new Set(lower(words.join(' ')).split(/\s+/).filter(Boolean))].join(' '), facets, era: c.a.era, nationTerms, tier: c.a.tier },
      feature: feature(c),
    };
  });
  wall = { cards: ordered, records };
  return wall;
}
const wallJson = () => `[\n${fleetWall().records.map((record) => JSON.stringify(record)).join(',\n')}\n]\n`;
function fleetFacets() {
  const { cards } = fleetWall();
  // each flag's nation name: the name its vehicles carry most (the catalog's nation.* key)
  const nationOf = (code) => {
    const counts = new Map();
    for (const c of cards) if (c.a.countryCode === code) counts.set(c.a.nation, (counts.get(c.a.nation) ?? 0) + 1);
    return [...counts].sort((x, y) => y[1] - x[1])[0]?.[0];
  };
  const nations = NATION_ORDER.filter((code) => nationOf(code)).map((code) => {
    const key = `nation.${nationOf(code)}`;
    return `<button class="cot-c-chip cot-c-chip--compact" type="button" aria-pressed="false" data-fleet-nation="${code}" aria-label="${esc(text(key))}" data-i18n-aria-label="${key}">${flag(code, 'sm')}</button>`;
  }).join('');
  const classes = WALL_CLASSES.map((value) => `<button class="cot-c-chip" type="button" aria-pressed="false" data-fleet-class="${value}">${t(classMeta(value).shortKey)}</button>`).join('');
  return `<div class="fleet-facets">`
    + `<button class="cot-c-chip" type="button" aria-pressed="true" data-fleet-all>${t('camoTag.all')}</button>`
    + `<div class="fleet-facets__set" role="group" aria-label="${esc(text('home.fleet.nationAria'))}" data-i18n-aria-label="home.fleet.nationAria">${nations}</div>`
    + `<div class="fleet-facets__set" role="group" aria-label="${esc(text('home.fleet.classAria'))}" data-i18n-aria-label="home.fleet.classAria">${classes}</div>`
    + `<label class="fleet-search">${iconMarkup('search', 16)}<input type="search" placeholder="${esc(text('home.fleet.searchPlaceholder'))}"`
    // no count in the placeholder: the headline already gives the fleet's one
    + ` data-i18n-placeholder="home.fleet.searchPlaceholder" aria-label="${esc(text('home.fleet.searchAria'))}"`
    + ` data-i18n-aria-label="home.fleet.searchAria" autocomplete="off" spellcheck="false" enterkeyhint="search"></label>`
    + `<p class="fleet-count" role="status"></p></div>`;
}
function fleetBlock() {
  for (const take of FLEET) if (!TAKES.vehicles[take]) throw new Error(`home-premiere: no fleet take ${take}`);
  const cards = fleetWall().cards.slice(0, FLEET.length);
  const first = cards[0];
  // a unit is a symbol (lang="en" in either locale) or a catalog key (the crew count's word)
  const fact = (icon, key, value, unit = '') => `<div>${iconMarkup(icon, 16)}<dt>${t(key)}</dt><dd><b data-fact="${key.split('.').pop()}">${value}</b>`
    + `${unit.startsWith('home.') ? t(unit, 'small') : unit ? `<small lang="en">${unit}</small>` : ''}</dd></div>`;
  const plate = `<article class="fleet-feature" data-fleet-feature>`
    + `<div class="fleet-feature__art cot-hc hc-loaded" data-hero-facing="${HERO.facing}">`
    + `<picture><source type="image/avif" data-fact="banner-set" srcset="${first.hero.flag[0]}" sizes="${PLATE_SIZES}">`
    + `<img class="hc-flag" data-fact="banner" src="${first.hero.flag[1]}" width="480" height="300" alt="" loading="lazy" decoding="async"></picture>`
    + `<picture><source type="image/avif" data-fact="tank-set" srcset="${first.hero.tank[0]}" sizes="${PLATE_SIZES}">`
    + `<img class="hc-tank" data-fact="tank" src="${first.hero.tank[1]}" width="480" height="300" alt="" loading="lazy" decoding="async" style="${first.hero.place}"></picture>`
    + `<h3 class="fleet-feature__name">${flag(first.a.countryCode, 'lg', 'fleet-feature__flag')}<span data-fact="name">${esc(first.a.name)}</span></h3></div>`
    + `<dl class="fleet-facts">${fact('star', 'home.fleet.tier', first.a.tierNumeral)}${fact('gun', 'home.fleet.caliber', first.a.gun?.caliberMm ?? 0, 'mm')}`
    + `${fact('penetration', 'home.fleet.penetration', pen(first.a), 'mm')}${fact('team', 'home.fleet.crew', first.m.crew, 'home.fleet.crewUnit')}`
    + `${fact('track', 'home.fleet.weight', first.m.weight, 't')}${fact('speed', 'home.fleet.speed', first.m.speed, 'km/h')}</dl>`
    + `<div class="fleet-feature__acts"><a class="${btn('primary', '36')}" data-fact="anatomy" href="${galleryHref(first.id, 'modules')}">${iconMarkup('layerModules', 16)}${t('home.fleet.anatomy')}</a>`
    + `<a class="${btn('', '36')}" data-fact="drive" href="${driveHref(first.id)}">${iconMarkup('vehicle', 16)}${t('home.testDrive')}</a></div></article>`;
  const tile = (c) => `<a class="fleet-tile cot-c-media cot-c-media--soft" href="${galleryHref(c.id)}" data-feature="${esc(JSON.stringify(feature(c)))}">`
    + `<img src="${c.take.poster}" alt="" width="640" height="360" loading="lazy" decoding="async">`
    + `<video data-media-player="hover" muted loop playsinline preload="none" aria-hidden="true" data-label="${esc(text(takeKey(c.take)))}" data-i18n-label="${takeKey(c.take)}">`
    + `<source data-src="${c.take.loop}" type="video/webm"></video><span class="fleet-tile__progress" aria-hidden="true"><i></i></span>`
    + `<span class="fleet-tile__id">${flag(c.a.countryCode, 'sm')}${sil(c.id)}<b>${esc(c.a.name)}</b></span></a>`;
  const tiles = cards.map(tile);
  return `<section class="fleet" id="fleet" aria-labelledby="fleet-title"><div class="home-shell">`
    + `<header class="home-head"><h2 class="home-h2" id="fleet-title"><span class="t-accent">{{COT_PRODUCTION_VEHICLES}}</span> ${t('home.fleet.tanks', 'span', 't-hollow')}</h2>`
    + `<a class="${btn('', '')}" href="/gallery">${iconMarkup('gallery', 18)}${t('home.fleet.gallery')}</a></header>`
    + fleetFacets()
    + `<div class="fleet-wall" data-fleet-wall>${tiles.slice(0, 4).join('')}${plate}${tiles.slice(4).join('')}</div>`
    + battlefields() + `</div></section>`;
}

// the battlefields rail (03 .bf): every map's art, its minimap and its landscapes, filtered by landscape
function battlefields() {
  const maps = MAP_IDS.map((id) => ({ id, regions: mapRegionTags(id) }));
  const regions = [...new Set(maps.flatMap((m) => m.regions))];
  const glyph = (region) => iconMarkup(regionTagIcon(region), 16);
  const cards = maps.map((m, i) => `<a class="bf-card cot-c-media cot-c-media--soft${i === 0 ? ' is-lead' : ''}" href="${studioHref(m.id)}" data-regions="${m.regions.join(' ')}">`
    + `<img src="/maps/thumbs/${m.id}.webp" alt="" width="512" height="288" loading="lazy" decoding="async">`
    + `<span class="bf-card__mm" aria-hidden="true"><img src="/minimaps/${m.id}.webp" alt="" width="440" height="440" loading="lazy" decoding="async"></span>`
    + `<span class="bf-card__nm">${t(`map.${m.id}`, 'b')}<span class="bf-card__tags" aria-hidden="true">${m.regions.map(glyph).join('')}</span></span></a>`).join('');
  const filters = [['all', 'camoTag.all', 'map'], ...regions.map((r) => [r, `camoTag.${r}`, regionTagIcon(r)])]
    .map(([value, key, icon], i) => `<button class="cot-c-seg__opt" type="button" role="radio" data-map-filter="${value}" aria-checked="${i === 0}">`
      + `${iconMarkup(icon, 16)}${t(key)}</button>`).join('');
  return `<section class="bf" id="battlefields" aria-labelledby="battlefields-title">`
    + `<header class="bf-head"><h3 class="bf-title" id="battlefields-title"><span class="t-accent">{{COT_BATTLEFIELDS}}</span> ${t('home.battlefields.title')}</h3>`
    + `<div class="cot-c-seg" role="radiogroup" aria-label="${esc(text('home.battlefields.filterAria'))}" data-i18n-aria-label="home.battlefields.filterAria">${filters}</div></header>`
    + `<div class="bf-rail" data-map-rail tabindex="0" role="region" aria-labelledby="battlefields-title">${cards}</div></section>`;
}

// ---- the beats under the walls (SPEC 12.3.2: combat in motion, modes and mechanics, the kill cam and the Studio) -----
// Each beat has one primary piece of media and one call; the pictures are the site fifty's (public/media/site50-r14), the
// mode tiles the Deploy screen's own art once public/media/deploy-r1 carries it.
const SITE_FILE = new Map(SITE.files.map((file) => [`/${file.path}`, file]));
const siteFile = (path) => {
  if (!SITE_FILE.has(path)) throw new Error(`home-premiere: ${path} is not in public/media/site50-r14/manifest.json`);
  return path;
};
const C = '/media/site50-r14';
/** A muted loop that plays while it is on screen (mediaPlayer.ts data-autoplay-video), named by its catalog title. */
function loopVideo(id, labelKey, cls = '') {
  return `<video${cls ? ` class="${cls}"` : ''} muted loop playsinline preload="none" data-poster="${siteFile(`${C}/loops/${id}.jpg`)}" data-autoplay-video`
    + ` data-i18n-label="${labelKey}" data-label="${esc(text(labelKey))}" aria-hidden="true">`
    + `<source data-src="${siteFile(`${C}/loops/${id}.webm`)}" data-type="video/webm" data-mobile-src="/media/web-video-r1/${id}-mobile.mp4" data-mobile-type="video/mp4"></video>`;
}

// 3, combat in motion: the battle reel loops muted (SPEC 12.3.2 beat 3); its cut buttons swap in the trailer, its
// 30-second cut or its vertical cut, which play with their score on that click (owner 2026-10-19: every new film has a
// place on the site); beside it, the loops of the camera paths and a knockout
const MOTION_LOOPS = ['s05-barn-advance', 's18-street-knockout', 's07-lake-shellfire', 's26-minaret-fire', 's27-caravanserai-kill'];
const CUTS = [['trailer', 'trailer-row', 'home.trailers.trailerAria', 'play'], ['trailer-30', 'trailer-30-row', 'home.trailers.trailer30Aria', ''],
  ['trailer-vertical', 'trailer-vertical-row', 'home.trailers.trailerVerticalAria', 'phone']];
function motionBlock() {
  const loops = MOTION_LOOPS.map((id) => `<figure class="motion-loop cot-c-media cot-c-media--soft">${loopVideo(id, `media.site50.title.${camel(id)}`)}</figure>`);
  const cuts = CUTS.map(([film, poster, ariaKey]) => {
    const seconds = String(Math.round(SITE_FILE.get(`${C}/films/${film}.mp4`)?.seconds ?? NaN));
    if (seconds === 'NaN') throw new Error(`home-premiere: ${film} has no length in the site manifest`);
    const aria = `aria-label="${esc(text(ariaKey).replace('{seconds}', seconds))}" data-i18n-aria-label="${ariaKey}" data-i18n-vars='{"seconds":"${seconds}"}'`;
    return { film, seconds, aria, video: `<video controls playsinline preload="none" data-trailer data-poster="${siteFile(`${C}/films/${poster}.jpg`)}" ${aria} hidden>`
      + `<source src="${siteFile(`${C}/films/${film}.webm`)}" type="video/webm"><source src="${siteFile(`${C}/films/${film}.mp4`)}" type="video/mp4"></video>` };
  });
  const buttons = cuts.map((cut, i) => `<button class="cot-c-seg__opt" type="button" aria-pressed="false" data-trailer-cut ${cut.aria}>`
    + `${CUTS[i][3] ? iconMarkup(CUTS[i][3], 16) : ''}<span class="num" lang="en">${clock(Number(cut.seconds))}</span></button>`).join('');
  const reel = `<video class="motion-reel" muted loop playsinline preload="none" data-poster="${siteFile(`${C}/films/reel.jpg`)}" data-autoplay-video`
    + ` data-i18n-label="media.site50.title.reel" data-label="${esc(text('media.site50.title.reel'))}" aria-hidden="true">`
    + `<source data-src="${siteFile(`${C}/films/reel.webm`)}" data-type="video/webm" data-fallback-src="${siteFile(`${C}/films/reel.mp4`)}" data-fallback-type="video/mp4"`
    + ` data-mobile-src="/media/web-video-r1/reel-mobile.mp4" data-mobile-type="video/mp4"></video>`;
  return `<section class="motion" id="trailers" aria-labelledby="motion-title"><div class="home-shell">`
    + `<header class="home-head"><h2 class="home-h2" id="motion-title">${t('home.motion.title')}</h2>`
    + `<a class="${btn('', '')}" href="/docs#battle-reels">${iconMarkup('fireGun', 18)}${t('home.reel.cta')}</a></header>`
    + `<div class="motion-grid"><figure class="motion-trailer" data-trailer-stage>${reel}${cuts.map((cut) => cut.video).join('')}`
    + `<div class="cot-c-seg motion-cuts" role="group" aria-label="${esc(text('home.trailers.cutsAria'))}" data-i18n-aria-label="home.trailers.cutsAria">${buttons}</div></figure>`
    + loops.join('') + `</div></div></section>`;
}

// 6, modes and mechanics: one section, the modes and three sets of mechanics behind one switch, names over pictures
const MECHANICS = [
  ['gunnery', 'gun', ['armor', 'ricochet', 'modules', 'ammunition', 'missiles', 'autoloader', 'era', 'thermal', 'roof-guns']],
  ['battlefield', 'map', ['buildings', 'spotting', 'smoke', 'crushing', 'map-vehicles', 'time-of-day', 'impact', 'suspension', 'field-kit']],
  ['beyond', 'star', ['replays', 'equipment', 'consumables', 'radio', 'medals', 'dossiers', 'presets', 'bots', 'mobile']],
];
// the Deploy screen's mode stills (public/media/deploy-r1) by file; its core tiles are cuts of versus stills, which the
// duel wall already shows, so the landing takes only the modes' own moments
const DEPLOY_ART = (() => {
  try {
    return new Set(json('public/media/deploy-r1/manifest.json').items
      .filter((item) => !String(item.source).includes('/versus-r1/')).map((item) => `media/deploy-r1/${item.file}`));
  } catch { return new Set(); }
})();
const LEAD_SIZES = '(width < 768px) 100vw, (width < 1100px) 100vw, 50vw';
const TILE_SIZES = '(width < 768px) 50vw, (width < 1100px) 50vw, 25vw';
/** A tile's picture: the 640 rung, the full frame where the tile is the lead; its alt is the catalog's own description. */
function stillTag(path, altKey, lead) {
  const base = siteFile(`${C}/home/${path}.webp`), small = siteFile(`${C}/home/${path}-640.webp`);
  return `<img data-home-slot="${path}" src="${lead ? base : small}" srcset="${small} 640w, ${base} 1280w" sizes="${lead ? LEAD_SIZES : TILE_SIZES}" width="1280" height="720"`
    + ` alt="${esc(text(altKey))}" data-i18n-alt="${altKey}" loading="lazy" decoding="async">`;
}
function modeTile(id, i) {
  const def = GAME_MODE_DEFINITIONS[id];
  const deploy = (width) => `media/deploy-r1/${id}-${width}.webp`;
  // the Deploy screen's clean still where it exists (its alt stays empty: the caption names the mode), the lead's only at
  // 1280; else the site's mode still
  const lead = i === 0;
  const picture = lead && DEPLOY_ART.has(deploy(1280)) && DEPLOY_ART.has(deploy(480))
    ? `<img src="/${deploy(1280)}" srcset="/${deploy(480)} 480w, /${deploy(1280)} 1280w" sizes="${LEAD_SIZES}" width="1280" height="720" alt="" loading="lazy" decoding="async">`
    : !lead && DEPLOY_ART.has(deploy(480))
      ? `<img src="/${deploy(480)}" width="480" height="270" alt="" loading="lazy" decoding="async">`
      : stillTag(`modes/${id}`, `media.home.modes.${id}`, lead);
  return `<figure class="play-tile cot-c-media${i === 0 ? ' play-tile--lead' : ''}" data-mode="${id}">${picture}`
    + `<figcaption class="play-tile__nm">${iconMarkup(def.icon, i === 0 ? 24 : 18)}${t(`playMenu.matchMode.${id}.label`, 'b')}</figcaption></figure>`;
}
const mechanicKey = (id) => camel(id);
const mechanicTile = (id, i) => `<figure class="play-tile cot-c-media${i === 0 ? ' play-tile--lead' : ''}">`
  + `${stillTag(`mechanics/${id}`, `media.home.mechanics.${mechanicKey(id)}`, i === 0)}`
  + `<figcaption class="play-tile__nm">${t(`home.mechanics.${mechanicKey(id)}.title`, 'b')}</figcaption></figure>`;
function playBlock() {
  const count = (n) => `<span class="cot-c-tabs__count num" lang="en">${n}</span>`;
  const tabs = [['modes', 'modeStandard', 'home.stats.modes', count('{{COT_BATTLE_MODES}}')],
    ...MECHANICS.map(([group, icon]) => [group, icon, `home.mechanics.group.${group}`, ''])]
    .map(([value, icon, key, extra], i) => `<button class="cot-c-seg__opt" type="button" role="radio" data-play-tab="${value}" aria-checked="${i === 0}">`
      + `${iconMarkup(icon, 16)}${t(key)}${extra}</button>`).join('');
  const panel = (value, tiles, hidden) => `<div class="play-grid" data-play-panel="${value}"${hidden ? ' hidden' : ''}>${tiles.join('')}</div>`;
  return `<section class="play" id="modes" aria-labelledby="play-title"><div class="home-shell">`
    + `<header class="home-head"><h2 class="home-h2" id="play-title">${t('home.play.title')}</h2>`
    + `<div class="cot-c-seg" role="radiogroup" aria-labelledby="play-title">${tabs}</div></header>`
    + panel('modes', BATTLE_MODE_IDS.map(modeTile), false)
    + MECHANICS.map(([group, , ids]) => panel(group, ids.map(mechanicTile), true)).join('')
    + `<p class="play-more" data-play-panel="modes"><a class="${btn('', '')}" href="/docs/simulation#topic-section-7">${iconMarkup('manual', 18)}${t('home.modes.cta')}</a></p>`
    + `</div></section>`;
}

// the screenshots: every still the screenshot rail and the mosaic showed (owner 2026-10-19: "all our new frames need to
// go up with no removals of old ones"), in one strip that loads as it scrolls, with the way into the whole library
const LANDING = json('public/media/landing-r1/manifest.json');
const LIBRARY_COUNT = json('public/media/library-r3/index.json').count;
const stillKey = (id) => `media.site50.title.${camel(id)}`;
function shotsBlock() {
  const shots = [...LANDING.rail, ...LANDING.mosaic];
  if (new Set(shots.map((shot) => shot.src)).size !== shots.length) throw new Error('home-premiere: a screenshot repeats');
  const tiles = shots.map((shot) => {
    const alt = EN[stillKey(shot.id)] ? `alt="${esc(EN[stillKey(shot.id)])}" data-i18n-alt="${stillKey(shot.id)}"` : `alt="${esc(shot.title)}"`;
    // the 640 rung on the strip (responsivePicture.ts names it), the full still on a dense screen that asks for it
    const rungs = stillRungs(siteFile(shot.src));
    return `<figure class="shots-tile cot-c-media"><img src="${rungs[0].src}" srcset="${srcsetFor(rungs)}" sizes="(width < 768px) 72vw, 22vw"`
      + ` width="640" height="360" ${alt} loading="lazy" decoding="async"></figure>`;
  });
  const arrow = (dir, key) => `<button class="${btn('icon', '')}" type="button" data-rail-${dir}${dir === 'prev' ? ' disabled' : ''} aria-label="${esc(text(key))}" data-i18n-aria-label="${key}">`
    + `${iconMarkup(dir === 'prev' ? 'chevronLeft' : 'chevronRight', 18)}</button>`;
  return `<section class="shots" id="screenshots" aria-labelledby="shots-title"><div class="home-shell">`
    + `<header class="home-head"><h2 class="home-h2" id="shots-title">${t('home.shots.title')}</h2>`
    + `<div class="shots-acts">${arrow('prev', 'home.shots.previousAria')}${arrow('next', 'home.shots.nextAria')}`
    + `<a class="${btn('', '')}" href="/docs/filming#library" data-i18n="home.mosaic.library" data-i18n-vars='{"count":"${LIBRARY_COUNT}"}'>`
    + `${esc(text('home.mosaic.library').replace('{count}', LIBRARY_COUNT))}</a></div></header>`
    + `<div class="shots-rail" data-shots-rail tabindex="0" role="region" aria-labelledby="shots-title">${tiles.join('')}</div></div></section>`;
}

// 7 and 8, the kill cam and the Studio: two pictures, each with its name and its one way in
function replayBlock() {
  const card = (key, media, href, cta) => `<article class="replay-card" aria-labelledby="replay-${key}"><figure class="replay-card__media">${media}</figure>`
    + `<div class="replay-card__row">${t(`home.evidence.${key}Title`, 'h2').replace('<h2', `<h2 id="replay-${key}"`)}`
    + `<a class="${btn('', '36')}" href="${href}">${t(`home.evidence.${cta}`)}</a></div></article>`;
  const killcam = `<img data-home-slot="features/killcam" src="${siteFile(`${C}/home/features/killcam.webp`)}" srcset="${siteFile(`${C}/home/features/killcam-640.webp`)} 640w, ${C}/home/features/killcam.webp 1920w"`
    + ` sizes="(width < 1100px) 100vw, 50vw" width="1920" height="1080" alt="${esc(text('media.home.features.killcam'))}" data-i18n-alt="media.home.features.killcam" loading="lazy" decoding="async">`;
  const studio = `<video data-home-slot="features/studio" muted loop playsinline preload="none" data-poster="${siteFile(`${C}/home/features/studio.jpg`)}" data-autoplay-video`
    + ` data-i18n-label="home.evidence.studioTitle" data-label="${esc(text('home.evidence.studioTitle'))}" aria-hidden="true">`
    + `<source data-src="${siteFile(`${C}/home/features/studio.mp4`)}" data-type="video/mp4" data-mobile-src="/media/web-video-r1/home-studio-mobile.mp4" data-mobile-type="video/mp4"></video>`;
  return `<div class="replay home-shell">${card('killcam', killcam, '/docs/simulation', 'killcamCta')}${card('studio', studio, '/studio', 'studioCta')}</div>`;
}

const BLOCKS = { hero: heroBlock, versus: versusBlock, motion: motionBlock, fleet: fleetBlock, play: playBlock, shots: shotsBlock, replay: replayBlock };
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
