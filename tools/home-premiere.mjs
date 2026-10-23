#!/usr/bin/env node
// home-premiere.mjs — writes the landing's Premiere blocks (brand-ui BUI-W2: the 01 living-versus hero, the 02 versus
// wall, the 03 fleet wall) into site/home.html from the data they show: the versus films and stills
// (public/media/versus-films-r1, versus-r1), the fleet takes (public/media/site50-r14/fleet), the tank hero cards
// (public/icons/hero), the vehicle facts (public/icons/tank-assets.json) and the catalog's map and time names. Each
// block sits between <!--home:NAME--> and <!--/home:NAME-->. Run `node tools/public-shell.mjs --write` after it (the
// shell inlines the flags and glyphs the blocks reference). Copyright © 2026 Kevin B. Liu.
//
//   node tools/home-premiere.mjs           check (exit 1 when a block is stale)
//   node tools/home-premiere.mjs --write   rewrite the blocks
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flagMarkup, iconMarkup } from '../src/presentation/publicShell.ts';
import { TANK_IDS } from '../src/vehicles/tankIdAliases.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const EN = json('src/ui/i18nCatalog.en-US.json');
const ASSETS = json('public/icons/tank-assets.json').tanks;
const HERO = json('public/icons/hero/hero-cards.json');
const FILMS = new Map(json('public/media/versus-films-r1/manifest.json').items.map((item) => [item.id, item]));
const STILLS = new Map(json('public/media/versus-r1/manifest.json').items.map((item) => [item.id, item]));
const TAKES = json('public/media/site50-r14/fleet/index.json');
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
const galleryHref = (id) => `/gallery?id=${id}${STAMP ? `&amp;${STAMP}` : ''}`;
const driveHref = (id) => `/?testdrive=${id}${STAMP ? `&amp;${STAMP}` : ''}`;
const studioHref = (map) => `/studio?map=${map}`;
const sil = (id, flip = false) => `<i class="cot-sil${flip ? ' cot-sil--flip' : ''}" style="--sil:url('/icons/${id}_side_silhouette.png')" aria-hidden="true"></i>`;
const HOUR_ICON = { day: 'timeDay', golden: 'timeSunset', sunset: 'timeSunset', night: 'regionNight' };
const hourKey = (hour) => `atmosphere.${hour}`;
const where = (map, hour) => `${iconMarkup('map', 16)}${t(`map.${map}`)}${iconMarkup(HOUR_ICON[hour], 16)}${t(hourKey(hour))}`;
const side = (id, foe = false) => {
  const a = tank(id);
  return foe
    ? `<span class="vs-side vs-side--foe"><b>${esc(a.name)}</b>${sil(id, true)}${flagMarkup(a.countryCode)}</span>`
    : `<span class="vs-side">${flagMarkup(a.countryCode)}${sil(id)}<b>${esc(a.name)}</b></span>`;
};
const duel = (hero, foe) => `<span class="vs-duel">${side(hero)}<span class="vs-mark" lang="en">VS</span>${side(foe, true)}</span>`;
const play = iconMarkup('play', 18);

// ---- 01: the living versus hero -----------------------------------------------------------------------------------
const HERO_ID = 'f6-leo2a6-steinburg-r7';
function heroBlock() {
  const still = STILLS.get(HERO_ID);
  const [a, b] = FILMS.get(HERO_ID).tanks;
  const titleKey = `media.versus.title.${camel(HERO_ID)}`;
  return `<header class="hero" aria-labelledby="hero-title">`
    + `<img class="hero__still" src="${still.path}" alt="${esc(text(titleKey))}" data-i18n-alt="${titleKey}" width="${still.width}" height="${still.height}" fetchpriority="high" decoding="async">`
    + `<div class="hero__grade" aria-hidden="true"></div>`
    + `<div class="hero__copy"><h1 class="hero__title" id="hero-title" lang="en"><span class="hero__line">Claude <span class="t-accent">of</span></span><span class="hero__line t-hollow">Tanks</span></h1>`
    + `<div class="hero__ctas"><a class="cot-btn cot-btn--primary cot-btn--xl" href="/">${play}${t('publicNav.playNow')}</a>`
    + `<a class="cot-btn cot-btn--secondary cot-btn--xl hero__trailer" href="#trailers" data-trailer-open><span class="hero__thumb"><img src="/media/site50-r14/films/trailer-row.jpg" alt="" width="84" height="47" decoding="async"></span>${t('home.hero.trailer')}</a></div></div>`
    + `<div class="hero__matchup">${duel(a.id, b.id)}<span class="vs-where">${where(FILMS.get(HERO_ID).map, FILMS.get(HERO_ID).hour)}</span></div>`
    + `<div class="hero__scene"><a class="cot-btn cot-btn--secondary cot-btn--sm" href="${driveHref(a.id)}">${iconMarkup('vehicle', 16)}${t('home.testDrive')}</a>`
    + `<a class="cot-btn cot-btn--secondary cot-btn--sm" href="${studioHref(FILMS.get(HERO_ID).map)}">${iconMarkup('studio', 16)}${t('home.hero.openScene')}</a></div>`
    + `<ul class="hero__stats">`
    + `<li>${iconMarkup('gallery', 18)}<b>{{COT_PRODUCTION_VEHICLES}}</b>${t('home.stats.tanks')}</li>`
    + `<li>${iconMarkup('map', 18)}<b>{{COT_BATTLEFIELDS}}</b>${t('home.stats.battlefields')}</li>`
    + `<li>${iconMarkup('modeStandard', 18)}<b>{{COT_BATTLE_MODES}}</b>${t('home.stats.modes')}</li>`
    + `<li>${iconMarkup('team', 18)}<b lang="en">7v7</b>${t('home.stats.rooms')}</li>`
    + `<li>${iconMarkup('globe', 18)}<b lang="en">EN</b><b lang="zh-CN">中文</b></li></ul>`
    + `</header>`;
}

// ---- 02: the versus wall ------------------------------------------------------------------------------------------
const WALL = [
  ['vs03-reservoir-k2-ztz99-r6', 'big'], ['vs02-verdant-challenger-t80u-r6', 'mid'], ['vs09-alpine-strv122-t80bv-r7', 'mid'],
  ['vs01-desert-abrams-t90m-r6', 'sm'], ['vs05-oasis-merkava-t72b3-r6', 'sm'], ['vs04-railyard-leclerc-t14-r7', 'sm'],
  ['vs10-steppe-chieftain-t64-r7', 'sm'], ['vs06-coastal-type10-ztz99a2-r7', 'sm'], ['vs07-autumn-ariete-t62-r7', 'sm'],
  ['vs08-winter-cv90-bmp3-r7', 'sm'], ['f7-t90m-column-r5', 'sm'],
];
function versusBlock() {
  const hours = [...new Set(WALL.map(([id]) => FILMS.get(id).hour))];
  const tiles = WALL.map(([id, size]) => {
    const film = FILMS.get(id);
    if (!film) throw new Error(`home-premiere: ${id} has no versus film`);
    const [a, b] = film.tanks;
    const titleKey = `media.versus.title.${camel(id)}`;
    const alt = EN[titleKey] ? `alt="${esc(EN[titleKey])}" data-i18n-alt="${titleKey}"` : `alt="${esc(film.title.en)}"`;
    const label = EN[titleKey] ? `data-label="${esc(EN[titleKey])}" data-i18n-label="${titleKey}"` : `data-label="${esc(film.title.en)}"`;
    const acts = size === 'big'
      ? `<span class="vs-acts"><a class="cot-btn cot-btn--primary cot-btn--sm" href="${driveHref(a.id)}">${play}${t('home.testDrive')}</a>`
        + `<a class="cot-btn cot-btn--secondary cot-btn--sm" href="${studioHref(film.map)}">${iconMarkup('studio', 16)}${t('home.hero.openScene')}</a></span>` : '';
    return `<figure class="vs-tile vs-tile--${size}" data-hour="${film.hour}">`
      + `<img class="vs-tile__still" src="${film.poster.path}" ${alt} width="${film.poster.width}" height="${film.poster.height}" loading="lazy" decoding="async">`
      + `<video class="vs-tile__film" data-media-player${size === 'big' ? '' : '="hover"'} muted loop playsinline preload="none" aria-hidden="true" ${label} data-duration="${film.film.seconds}">`
      + `<source data-src="${film.film.path}" type="video/mp4"><source data-src="${film.mobile.path}" type="video/mp4" data-rung="phone"></video>`
      + `<figcaption class="vs-tile__meta">${duel(a.id, b.id)}<span class="vs-where">${where(film.map, film.hour)}</span>${acts}</figcaption></figure>`;
  });
  const filters = [['all', 'camoTag.all', 'cameraPath'], ...hours.map((h) => [h, hourKey(h), HOUR_ICON[h]])]
    .map(([value, key, icon], i) => `<button type="button" data-versus-filter="${value}" aria-pressed="${i === 0}">${iconMarkup(icon, 16)}${t(key)}</button>`).join('');
  return `<section class="versus" id="versus" aria-labelledby="versus-title"><div class="home-shell">`
    + `<header class="home-head"><h2 id="versus-title"><span class="t-accent">${WALL.length}</span> ${t('home.versus.duels')}</h2>`
    + `<div class="home-seg" role="group" aria-label="${esc(text('home.versus.filterAria'))}" data-i18n-aria-label="home.versus.filterAria">${filters}</div></header>`
    + `<div class="vs-grid" data-versus-wall>${tiles.join('')}</div></div></section>`;
}

// ---- 03: the fleet wall -------------------------------------------------------------------------------------------
const FLEET = ['t14', 'leo2a7v', 'm1a2_x', 'challenger1', 'strv122', 'type99a', 'type90', 'merkava2d', 'ua_t80u_kursk', 'amx40_x',
  'dardo', 'pt91m', 'ztz99a2', 'bmpt_terminator2', 'strv103a', 'namer_ifv', 'pl_t72b3m_modern', 'm3a3_bradley'];
const v = (hash) => (hash ? `?v=${hash.slice(0, 8)}` : '');
function heroLayers(id, a) {
  const row = HERO.tanks[id];
  const flag = HERO.flags[row?.flag ?? a.countryCode];
  if (!row || !flag) throw new Error(`home-premiere: ${id} has no tank hero card`);
  const [cx, cw, ch, cb, fx0, fx1] = row.b;
  const mirrored = (row.face?.[1] ?? 'left') !== 'left';
  const place = `--hc-cx:${cx};--hc-cw:${cw};--hc-ch:${ch};--hc-cb:${cb};--hc-fx0:${fx0};--hc-fx1:${fx1};--hc-fw:${Number((fx1 - fx0).toFixed(4))}${mirrored ? ';--hc-gs:-1' : ''}`;
  const code = row.flag;
  return `<picture><source type="image/avif" srcset="/icons/hero/flag-${code}-480.avif${v(flag.sha[0])} 480w, /icons/hero/flag-${code}-960.avif${v(flag.sha[1])} 960w" sizes="(width < 768px) 50vw, 240px">`
    + `<img class="hc-flag" src="/icons/hero/flag-${code}-480.webp${v(flag.sha[2])}" width="480" height="300" alt="" loading="lazy" decoding="async"></picture>`
    + `<picture><source type="image/avif" srcset="/icons/hero/${id}-480.avif${v(row.sha[0])} 480w, /icons/hero/${id}-960.avif${v(row.sha[1])} 960w" sizes="(width < 768px) 50vw, 240px">`
    + `<img class="hc-tank" src="/icons/hero/${id}-480.webp${v(row.sha[2])}" width="480" height="300" alt="" loading="lazy" decoding="async" style="${place}"></picture>`;
}
const pen = (a) => Math.max(0, ...(a.gun?.shells ?? []).map((s) => Number(s.pen100Mm) || 0));
function fleetBlock() {
  const cards = FLEET.map((take) => {
    const entry = TAKES.vehicles[take];
    if (!entry) throw new Error(`home-premiere: no fleet take ${take}`);
    const id = TANK_IDS.resolve(take, String(TAKES.tankIdSchema ?? 1));
    const a = tank(id);
    return { id, a, take: entry };
  });
  const feature = (c) => JSON.stringify({ id: c.id, name: c.a.name, flag: c.a.countryCode, tier: c.a.tierNumeral, cal: c.a.gun?.caliberMm ?? 0,
    pen: pen(c.a), poster: c.take.poster, gallery: galleryHref(c.id).replace(/&amp;/g, '&'), drive: driveHref(c.id).replace(/&amp;/g, '&') });
  const first = cards[0];
  const fact = (icon, key, value, unit = '') => `<div><dt>${iconMarkup(icon, 16)}${t(key)}</dt><dd><b data-fact="${key.split('.').pop()}">${value}</b>${unit ? `<small lang="en">${unit}</small>` : ''}</dd></div>`;
  const panel = `<article class="fleet-feature" data-fleet-feature>`
    + `<div class="fleet-feature__media"><img data-fact="poster" src="${first.take.poster}" alt="" width="640" height="360" loading="lazy" decoding="async"></div>`
    + `<div class="fleet-feature__body"><h3 class="fleet-feature__name">${flagMarkup(first.a.countryCode, 'cot-flag fleet-feature__flag')}<span data-fact="name">${esc(first.a.name)}</span></h3>`
    + `<dl class="fleet-facts">${fact('star', 'home.fleet.tier', first.a.tierNumeral)}${fact('gun', 'home.fleet.caliber', first.a.gun?.caliberMm ?? 0, 'mm')}${fact('penetration', 'home.fleet.penetration', pen(first.a), 'mm')}</dl>`
    + `<div class="fleet-feature__acts"><a class="cot-btn cot-btn--primary cot-btn--sm" data-fact="gallery" href="${galleryHref(first.id)}">${iconMarkup('layerXray', 16)}${t('home.fleet.dossier')}</a>`
    + `<a class="cot-btn cot-btn--secondary cot-btn--sm" data-fact="drive" href="${driveHref(first.id)}">${iconMarkup('vehicle', 16)}${t('home.testDrive')}</a></div></div></article>`;
  const tiles = cards.map((c) => `<a class="fleet-card cot-hc hc-loaded" data-hero-facing="${HERO.facing}" href="${galleryHref(c.id)}" data-feature="${esc(feature(c))}">`
    + `${heroLayers(c.id, c.a)}<span class="fleet-card__name">${flagMarkup(c.a.countryCode)}<b>${esc(c.a.name)}</b></span></a>`).join('');
  return `<section class="fleet" id="fleet" aria-labelledby="fleet-title"><div class="home-shell">`
    + `<header class="home-head"><h2 id="fleet-title"><span class="t-accent">{{COT_PRODUCTION_VEHICLES}}</span> ${t('home.fleet.tanks')}</h2>`
    + `<a class="cot-btn cot-btn--secondary" href="/gallery">${iconMarkup('gallery', 18)}${t('home.fleet.gallery')}</a></header>`
    + `<div class="fleet-wall">${panel}<div class="fleet-grid">${tiles}</div></div></div></section>`;
}

const BLOCKS = { hero: heroBlock, versus: versusBlock, fleet: fleetBlock };
const HOME = join(ROOT, 'site/home.html');
export function renderHome(html) {
  let out = html;
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
  if (process.argv.includes('--write')) { if (next !== html) writeFileSync(HOME, next); console.log('home-premiere: written'); }
  else if (next !== html) { console.error('home-premiere: site/home.html is stale (node tools/home-premiere.mjs --write)'); process.exit(1); }
  else console.log('home-premiere: site/home.html is current');
}
