// src/ui/garage.js — full-screen garage/tank-select overlay: dark gradient
// frame with a transparent center band (the 3D pedestal shows through),
// bottom tank carousel, right stats card, top-center BATTLE button.
// Contract: docs/ARCHITECTURE.md §3.7.3.

import { ensureFonts } from './fonts.ts';
import { FEATURED_SHOTS } from './featuredShots.ts';
import { preloadImage, preloadImageWhenIdle } from './imagePreload.ts';
import { flagIconHTML, flagIconUrl } from './flags.ts';
import { flagIconCode } from './flagCodes.ts';
import { iconUrl } from './icons.ts';
import { ensureTankThumbs, drainTankThumbs, getTankThumb, requeueTankThumbs } from './tankThumbs.js';
import { createCamoSwatchAccess } from './camoSwatchAccess.ts';
import { createCustomCamoStudioAccess } from './customCamoStudioAccess.ts';
import {
  CUSTOM_CAMO_ID, customCamoPatternId,
} from '../vehicles/camoPolicy.js';
import { createInfoButton } from './contextInfo.ts';
// EQUIPMENT SYSTEM: full catalog + slot logic (game/equipment.ts), the
// white-silhouette icon set (equipIcons.ts), and the spotting-side math the
// stat card folds into its view/camo rows so the garage can never disagree
// with the battle sim.
import {
  EQUIPMENT_CATALOG, EQUIPMENT_BY_ID, EQUIP_SLOTS, EQUIP_CATEGORIES,
  loadEquipment, saveEquipment, equipEligible, computeEquipMults,
} from '../game/equipment.ts';
import { equipIconSVG } from './equipIcons.ts';
import { uiIconSVG } from './uiIcons.ts';
import { shellIconSVG } from './shellIcons.ts';
import {
  garageCrewRows, garageGalleryHref, garageModuleRows, garageSpecialSystem, garageStatGroup,
} from './garageDossier.ts';
import { createRandomMapMosaic } from './randomPreviews.ts';
import {
  compareCountryThenTierThenName, countryFilterGroups, defaultGarageMapId,
  horizontalRailState, horizontalRailWheelDelta,
} from './garageOrder.ts';
import { isGarageVisibleTankId } from '../game/matchmaking.ts';
import { tankTier, tierNumeral } from '../vehicles/tier.ts';
import { vehicleEraLabel } from '../vehicles/taxonomy.ts';
import { getPlayerRecord } from '../game/profile.ts';
import { mountGitHubStars } from './githubStars.ts';
import {
  viewRangeOf, baseCamoOf, equipViewMult, equipCamoBonus,
} from '../sim/spotting.js';
import { normalizeGameMode } from '../sim/matchModes.ts';

const NATION_LABEL = {
  USA: 'USA', Germany: 'GER', USSR: 'USSR', Russia: 'RUS', 'USSR/Russia': 'RUS',
  Sweden: 'SWE', Community: 'COM', UK: 'UK', France: 'FRA', Israel: 'ISR',
  China: 'CHN', 'South Korea': 'KOR', Japan: 'JPN', Italy: 'ITA',
  Poland: 'POL', Ukraine: 'UKR',
};

// One unified historical/modern catalog. Country flags are the only primary
// filter; within each country the owner-facing order is tier, then name.
// USSR / USSR-Russia / Russia intentionally share the RU flag block.
const NATION_RANK = new Map([
  ['USA', 0], ['Germany', 1],
  ['USSR', 2], ['USSR/Russia', 2], ['Russia', 2],
  ['UK', 3], ['France', 4], ['China', 5], ['Italy', 6], ['Japan', 7],
  ['Poland', 8], ['South Korea', 9], ['Sweden', 10], ['Community', 11],
  ['Israel', 12], ['Ukraine', 13],
]);
function catalogCompare(a, b) {
  return compareCountryThenTierThenName(a, b, NATION_RANK, tankTier);
}
const countryCodeOf = (spec) => flagIconCode(spec.nation);

const SHELL_TYPE_COLOR = {
  AP: '#ffd27a', APCR: '#e8f4ff', HEAT: '#ff8a5c', HE: '#ffb02e', APFSDS: '#ffc46b',
};

// roster maxima for normalized stat bars are computed from the actual specs
// passed to createGarage (so bars always spread across the roster range).



// garage_ui: one shared accessibility gate for the WAAPI micro-transitions
// (the CSS entrance set is gated by the same media query in garage.css).
const REDUCED_MOTION = typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;


// --- CAMO PICKER SECTION: demand-loaded exact swatch painter -----------------
// This renderer is decorative and used to add ~700 lines of canvas pattern
// code to the garage-critical chunk. Give every tile a deterministic painted
// placeholder immediately, then replace it with the exact existing renderer
// during an idle window. Pointer/focus intent promotes the shared request, so
// opening the camouflage surface never waits for the idle deadline.
const camoSwatchPaintVersion = new WeakMap();
const camoSwatchAccess = createCamoSwatchAccess({
  load: () => import('./camoSwatchPainter.js'),
  isPlayable: () => globalThis.__GAME_READY === true,
});

function scheduleCamoSwatchLoad(immediate = false) {
  return camoSwatchAccess.preload({ immediate });
}

function paintCamoSwatchPlaceholder(canvas, spec, pid) {
  const W = 128;
  const H = 44;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let hash = 2166136261;
  for (const ch of `${spec?.id || 'tank'}:${pid || 'factory'}`) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const hue = ((hash >>> 0) % 46) + 72;
  ctx.fillStyle = `hsl(${hue} 22% 25%)`;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate((hash >>> 8) % 19, 0);
  ctx.rotate(-0.34);
  ctx.fillStyle = 'rgba(18,23,20,.36)';
  for (let x = -H; x < W + H; x += 30) ctx.fillRect(x, -H, 13, H * 3);
  ctx.restore();
  const light = ctx.createLinearGradient(0, 0, 0, H);
  light.addColorStop(0, 'rgba(255,255,255,.10)');
  light.addColorStop(1, 'rgba(0,0,0,.18)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, W, H);
}

function queueExactCamoSwatch(canvas, spec, pid, auto = false) {
  const version = (camoSwatchPaintVersion.get(canvas) || 0) + 1;
  camoSwatchPaintVersion.set(canvas, version);
  paintCamoSwatchPlaceholder(canvas, spec, auto ? 'auto' : pid);
  scheduleCamoSwatchLoad(false).then((loaded) => {
    if (!loaded || camoSwatchPaintVersion.get(canvas) !== version) return;
    if (auto) loaded.paintAutoCamoSwatch(canvas, spec);
    else loaded.paintCamoSwatch(canvas, spec, pid);
  }).catch(() => { /* placeholder remains; the next intent retries */ });
}

function paintCamoSwatch(canvas, spec, pid) {
  queueExactCamoSwatch(canvas, spec, pid, false);
}

function paintAutoCamoSwatch(canvas, spec) {
  queueExactCamoSwatch(canvas, spec, 'auto', true);
}
// --- END CAMO PICKER SECTION -------------------------------------------------


function frontArmorMm(plates, keys) {
  if (!plates || !plates.length) return null;
  let best = null;
  for (const p of plates) {
    const n = (p.name || '').toLowerCase();
    const match = keys.some((k) => n.includes(k));
    if (match && p.kind === 'main') best = Math.max(best || 0, p.keMm || p.physicalMm || 0);
  }
  if (best == null) for (const p of plates) if (p.kind === 'main') best = Math.max(best || 0, p.keMm || 0);
  return best;
}

/**
 * Create the garage/tank-select screen. Appends its root to document.body (hidden).
 * @param {{specs:TankSpec[],bus:{emit:Function},onSelect:Function,onBattle:Function,
 *   onPlayRequest?:Function,onPlayModeIntent?:Function,onBattleIntent?:Function,
 *   onStudioIntent?:Function,onTankIntent?:Function}} opts
 * @returns {{show:Function,hide:Function,isOpen:boolean,setSelected:Function,root:HTMLElement}} Garage
 */
export function createGarage(opts) {
  const { bus, onSelect, onBattle } = opts;
  const allSpecs = opts.specs || [];
  // One combined fleet: country first, then tier, then display name. Cards,
  // arrow stepping and flag-chip hand-offs all use this single sorted array.
  const specs = allSpecs.filter((s) => isGarageVisibleTankId(s.id)).sort(catalogCompare);
  const countryGroups = countryFilterGroups(specs, countryCodeOf).map(({ id, representative, count }) => ({
    id,
    count,
    nation: representative.nation,
    label: representative.markings?.filterLabel || NATION_LABEL[representative.nation] || id.toUpperCase(),
    name: representative.markings?.countryLabel || representative.nation,
  }));
  ensureFonts();
  const root = document.createElement('div');
  root.className = 'cot-garage';
  root.innerHTML =
    `<div class="band-top"></div><div class="band-bot"></div>` +
    `<div class="band-l"></div><div class="band-r"></div>` +
    `<div class="cot-brand-rail"><div class="title">` +
    // brand mark (tank + Claude Code commander) so the garage brand matches
    // the entry screen; master copy public/brand/logo-mark.svg
    `<img class="mark" src="/brand/logo-mark.svg" alt="" draggable="false">` +
    `<span>CLAUDE <b>OF TANKS</b></span></div>` +
    `<div class="cot-brand-utilities cot-header-nav" aria-label="Home and player record">` +
    `<button class="nv" data-nav="home" type="button" aria-label="Home" title="Home">` +
    `<img class="nvi nvi-product" src="/brand/nav/home.svg" alt="" draggable="false">` +
    `<span class="nav-label">Home</span></button>` +
    `<button class="nv cot-record-trigger" type="button" aria-label="Open local service record" ` +
    `title="Local service record" aria-haspopup="dialog" aria-expanded="false" aria-controls="cot-record-modal">` +
    `${uiIconSVG('battleRecord', 15, 'currentColor', 'nvi')}` +
    `<span class="nav-label">Record</span><span class="record-badge" aria-hidden="true">0</span></button>` +
    `</div></div>` +
    `<nav class="cot-nav cot-header-nav" aria-label="Garage navigation">` +
    `<button class="nv on cot-nav-desktop" data-nav="garage" type="button" aria-label="Garage" title="Garage">` +
    `<img class="nvi nvi-product" src="/brand/nav/garage.svg" alt="" draggable="false">` +
    `<span class="nav-label">Garage</span></button>` +
    `<button class="nv cot-nav-desktop" data-nav="studio" type="button" aria-label="Studio" title="Studio">` +
    `<img class="nvi nvi-product" src="/brand/nav/studio.svg" alt="" draggable="false">` +
    `<span class="nav-label">Studio</span></button>` +
    `<button class="nv cot-nav-desktop" data-nav="gallery" type="button" aria-label="Tank Gallery" title="Tank Gallery">` +
    `<img class="nvi nvi-product" src="/brand/nav/tank-gallery.svg" alt="" draggable="false">` +
    `<span class="nav-label">Gallery</span></button>` +
    `<button class="nv cot-nav-desktop" data-nav="docs" type="button" aria-label="Documentation" title="Documentation">` +
    `<img class="nvi nvi-product" src="/brand/nav/docs.svg" alt="" draggable="false">` +
    `<span class="nav-label">Docs</span></button>` +
    `<a class="nv cot-github" data-nav="github" href="https://github.com/Kevin-Liu-01/Claude-of-Tanks" ` +
    `target="_blank" rel="noopener noreferrer" aria-label="View Claude of Tanks on GitHub" title="GitHub">` +
    `${uiIconSVG('github', 15, 'currentColor', 'nvi')}` +
    `<span class="nav-label">GitHub</span><span class="github-stars" data-github-stars>154</span></a>` +
    `<div class="cot-settings-slot"></div>` +
    `<button class="nv cot-mobile-nav-trigger" type="button" aria-label="Open navigation menu" ` +
    `title="Menu" aria-expanded="false" aria-controls="cot-mobile-nav-menu">` +
    `${uiIconSVG('menu', 17, 'currentColor', 'nvi')}<span class="nav-label">Menu</span></button>` +
    `<div class="cot-mobile-nav-menu" id="cot-mobile-nav-menu" role="group" aria-label="Game pages" hidden>` +
    `<button type="button" data-mobile-nav="home">` +
    `<img src="/brand/nav/home.svg" alt="" draggable="false"><span class="cot-mobile-nav-copy">` +
    `<strong>Home</strong><small>Public showcase</small></span></button>` +
    `<button type="button" data-mobile-nav="garage" aria-current="page">` +
    `<img src="/brand/nav/garage.svg" alt="" draggable="false"><span class="cot-mobile-nav-copy">` +
    `<strong>Garage</strong><small>Current page</small></span></button>` +
    `<button type="button" data-mobile-nav="studio">` +
    `<img src="/brand/nav/studio.svg" alt="" draggable="false"><span class="cot-mobile-nav-copy">` +
    `<strong>Studio</strong><small>Scene tools</small></span></button>` +
    `<button type="button" data-mobile-nav="gallery">` +
    `<img src="/brand/nav/tank-gallery.svg" alt="" draggable="false"><span class="cot-mobile-nav-copy">` +
    `<strong>Gallery</strong><small>Fleet dossiers</small></span></button>` +
    `<button type="button" data-mobile-nav="docs">` +
    `<img src="/brand/nav/docs.svg" alt="" draggable="false"><span class="cot-mobile-nav-copy">` +
    `<strong>Docs</strong><small>Game handbook</small></span></button>` +
    `<button type="button" data-mobile-nav="record">` +
    `${uiIconSVG('battleRecord', 20, 'currentColor')}<span class="cot-mobile-nav-copy">` +
    `<strong>Record</strong><small>Local career stats</small></span></button></div></nav>` +
    `<div class="cot-record-modal" id="cot-record-modal" role="dialog" aria-modal="true" ` +
    `aria-labelledby="cot-record-title" aria-describedby="cot-record-description" hidden>` +
    `<section class="cot-record-dialog">` +
    `<header class="cot-record-head"><div><div class="eyebrow">Local commander profile</div>` +
    `<h2 id="cot-record-title">Service Record</h2>` +
    `<p id="cot-record-description">Career totals stored on this device</p></div>` +
    `<button class="cot-record-close" type="button" aria-label="Close service record">&times;</button></header>` +
    `<div class="cot-record-body"></div></section></div>` +
    `<div class="cot-battle-control">` +
    `<button class="cot-battle" type="button" aria-label="Start Bots battle">` +
    `<span class="battle-active-icon">${uiIconSVG('battleBots', 20)}</span>` +
    `<span class="battle-word">BATTLE</span></button>` +
    `<button class="cot-battle-mode" type="button" aria-haspopup="menu" aria-expanded="false" ` +
    `aria-controls="cot-battle-menu" aria-label="Battle type: Bots. Change battle type">` +
    `<span>BOTS</span></button>` +
    `<div class="cot-battle-menu" id="cot-battle-menu" role="menu" aria-label="Battle type">` +
    `<button class="cot-battle-choice" type="button" role="menuitemradio" data-mode="solo" aria-checked="true">` +
    `<span class="choice-icon">${uiIconSVG('battleBots', 17)}</span>` +
    `<span class="choice-name">Bots</span><small>Solo</small></button>` +
    `<button class="cot-battle-choice" type="button" role="menuitemradio" data-mode="private" aria-checked="false">` +
    `<span class="choice-icon">${uiIconSVG('battlePrivate', 17)}</span>` +
    `<span class="choice-name">Private</span><small>Code</small></button>` +
    `<button class="cot-battle-choice" type="button" role="menuitemradio" data-mode="lan" aria-checked="false">` +
    `<span class="choice-icon">${uiIconSVG('battleLan', 17)}</span>` +
    `<span class="choice-name">LAN</span><small>Wi-Fi</small></button>` +
    `<button class="cot-battle-choice" type="button" role="menuitemradio" data-mode="ranked" aria-checked="false">` +
    `<span class="choice-icon">${uiIconSVG('battleRanked', 17)}</span>` +
    `<span class="choice-name">Ranked</span><small>ELO</small></button>` +
    `<div class="cot-battle-menu-label">Solo rules</div>` +
    `<button class="cot-battle-choice" type="button" role="menuitemradio" data-game-mode="capture_the_flag" aria-checked="false">` +
    `<span class="choice-icon">${uiIconSVG('modeFlag', 17)}</span>` +
    `<span class="choice-name">Capture Flag</span><small>CTF</small></button>` +
    `<button class="cot-battle-choice" type="button" role="menuitemradio" data-game-mode="zone_control" aria-checked="false">` +
    `<span class="choice-icon">${uiIconSVG('modeZones', 17)}</span>` +
    `<span class="choice-name">Zone Control</span><small>1000</small></button>` +
    `<button class="cot-battle-choice" type="button" role="menuitemradio" data-game-mode="turbo_ball" aria-checked="false">` +
    `<span class="choice-icon">${uiIconSVG('modeTurbo', 17)}</span>` +
    `<span class="choice-name">Turbo Ball</span><small>Goals</small></button>` +
    `<button class="cot-battle-choice" type="button" role="menuitemradio" data-game-mode="endless_horde" aria-checked="false">` +
    `<span class="choice-icon">${uiIconSVG('modeHorde', 17)}</span>` +
    `<span class="choice-name">Endless Horde</span><small>Waves</small></button>` +
    `</div><button class="cot-room-reminder" type="button" aria-label="Open active room">` +
    `<span class="rr-dot"></span><span class="rr-copy"></span></button></div>` +
    `<div class="cot-garage-tools" role="toolbar" aria-label="Garage panels">` +
    `<button class="cot-garage-tool" type="button" data-garage-panel="maps" aria-expanded="false" ` +
    `aria-controls="cot-garage-maps">${uiIconSVG('map', 17)}<span>Battlefields</span></button>` +
    `<button class="cot-garage-tool" type="button" data-garage-panel="appearance" aria-expanded="false" ` +
    `aria-controls="cot-garage-camos">${uiIconSVG('camouflage', 17)}<span>Appearance</span></button>` +
    `<button class="cot-garage-tool" type="button" data-garage-panel="dossier" aria-expanded="false" ` +
    `aria-controls="cot-garage-dossier">${uiIconSVG('battleRecord', 17)}<span>Dossier</span></button></div>` +
    `<button class="cot-garage-panel-scrim" type="button" aria-label="Close garage panel"></button>` +
    `<div class="stats" id="cot-garage-dossier"></div>` +
    `<div class="cot-country-rail">` +
    `<button class="cot-country-edge prev is-unavailable" type="button" disabled aria-hidden="true" ` +
    `aria-label="Scroll countries left">${uiIconSVG('chevronLeft', 14)}</button>` +
    `<div class="cot-country-chips" role="group" aria-label="Filter vehicles by country"></div>` +
    `<button class="cot-country-edge next is-unavailable" type="button" disabled aria-hidden="true" ` +
    `aria-label="Scroll countries right">${uiIconSVG('chevronRight', 14)}</button>` +
    `</div>` +
    `<div class="cot-carousel">` +
    `<button class="cot-car-arrow prev is-unavailable" type="button" disabled aria-hidden="true" aria-label="Previous vehicle">` +
    `${uiIconSVG('chevronLeft', 15)}</button>` +
    `<div class="cot-cards"></div>` +
    `<button class="cot-car-arrow next is-unavailable" type="button" disabled aria-hidden="true" aria-label="Next vehicle">` +
    `${uiIconSVG('chevronRight', 15)}</button>` +
    `</div>` +
    `<div class="cot-leftcol"><div class="cot-maps" id="cot-garage-maps"></div>` +
    `<div class="cot-camos" id="cot-garage-camos"></div></div>` +
    `<div class="hint">&#8592; &#8594; select &nbsp;&middot;&nbsp; enter to battle</div>`;
  document.body.appendChild(root);
  mountGitHubStars(root);

  function refreshServiceRecord() {
    const record = getPlayerRecord();
    const badge = root.querySelector('.cot-record-trigger .record-badge');
    if (badge) badge.textContent = record.matches > 999 ? '999+' : record.matches.toLocaleString('en-US');

    const body = root.querySelector('.cot-record-body');
    if (!body) return;
    const pct = record.matches ? Math.round((record.wins / record.matches) * 100) : 0;
    const avgDamage = record.matches ? Math.round(record.damage / record.matches) : 0;
    const avgKills = record.matches ? record.kills / record.matches : 0;
    const num = (value) => value.toLocaleString('en-US');
    const safe = (value) => String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);
    const metric = (label, value, note) => `<div class="cot-record-metric"><span>${label}</span>` +
      `<strong>${value}</strong><small>${note}</small></div>`;
    let lastBattle = `<div class="cot-record-empty">Complete a battle to begin your local service history.</div>`;
    if (record.lastBattle) {
      const last = record.lastBattle;
      const vehicle = allSpecs.find((spec) => spec.id === last.vehicleId);
      const map = (opts.maps || []).find((entry) => entry.id === last.mapId);
      const durationM = Math.floor(last.durationS / 60);
      const durationS = String(last.durationS % 60).padStart(2, '0');
      const completed = last.completedAt ? new Date(last.completedAt) : null;
      const completedLabel = completed && !Number.isNaN(completed.getTime())
        ? completed.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : 'Local session';
      lastBattle = `<div class="cot-last-battle"><div class="cot-last-battle-head">` +
        `<strong>${safe(last.result)}</strong><time>${safe(completedLabel)}</time></div>` +
        `<div class="cot-last-battle-grid">` +
        `<div><span>Deployment</span><b>${safe(vehicle?.label?.displayName || vehicle?.name || last.vehicleId || 'Unknown vehicle')} · ${safe(map?.name || last.mapId || 'Unknown map')}</b></div>` +
        `<div><span>Damage</span><b>${num(last.damage)}</b></div>` +
        `<div><span>Destroyed</span><b>${num(last.kills)}</b></div>` +
        `<div><span>Duration</span><b>${durationM}:${durationS}</b></div></div></div>`;
    }
    body.innerHTML = `<div class="cot-record-overview">` +
      `<div class="cot-record-ring" style="--record-pct:${pct}"><div class="cot-record-ring-copy">` +
      `<strong>${record.matches ? `${pct}%` : '—'}</strong><span>Win rate</span></div></div>` +
      `<div><div class="cot-record-outcomes">` +
      `<div class="cot-record-outcome win"><span>Victories</span><strong>${num(record.wins)}</strong></div>` +
      `<div class="cot-record-outcome"><span>Defeats</span><strong>${num(record.losses)}</strong></div>` +
      `<div class="cot-record-outcome"><span>Draws</span><strong>${num(record.draws)}</strong></div></div>` +
      `<div class="cot-record-metrics">` +
      metric('Battles', num(record.matches), 'Completed locally') +
      metric('Destroyed', num(record.kills), `${avgKills.toFixed(2)} per battle`) +
      metric('Total damage', num(record.damage), 'Career output') +
      metric('Average damage', num(avgDamage), 'Per battle') +
      metric('Best damage', num(record.bestDamage), 'Single battle') +
      metric('Decisive results', num(record.wins + record.losses), 'Non-draw battles') +
      `</div></div></div>${lastBattle}`;
  }

  // --- MARKETING FEATURED PANEL: rotating in-engine action stills ------------
  // Assets + captions come from the marketing-shots pipeline
  // (tools/marketing-shots, encoded to public/media/featured/). The panel is
  // created programmatically so the main markup block stays untouched; it
  // crossfades every 8 s, click advances, hover pauses. Images lazy-load —
  // a missing set simply never shows the panel's layers (gradient card).
  // r9.5: the list moved to featuredShots.ts — ONE copy shared with the boot
  // splash and the transition screens (hand-synced copies drifted from disk
  // twice; r9.1 was the "always the same picture" bug that caused).
  (() => {
    const col = root.querySelector('.cot-leftcol');
    if (!col || !FEATURED_SHOTS.length) return;
    const panel = document.createElement('div');
    panel.className = 'cot-featured';
    panel.innerHTML =
      `<div class="ftitle"><span>${uiIconSVG('gallery', 13)}Battle gallery</span><span class="fdots">` +
      FEATURED_SHOTS.map(() => '<span></span>').join('') +
      `</span></div>` +
      `<div class="fshot"><div class="fly"></div><div class="fly"></div>` +
      `<button class="fnav prev" type="button" aria-label="Previous shot">&#8249;</button>` +
      `<button class="fnav next" type="button" aria-label="Next shot">&#8250;</button>` +
      `<div class="fcap"></div></div>`;
    col.appendChild(panel);
    const layers = panel.querySelectorAll('.fly');
    const capEl = panel.querySelector('.fcap');
    const dots = panel.querySelectorAll('.fdots span');
    const shotEl = panel.querySelector('.fshot');
    let idx = -1;
    let front = 0;
    let timer = 0;
    const show = (i) => {
      front ^= 1;
      layers[front].style.backgroundImage = `url("${FEATURED_SHOTS[i].img}")`;
      layers[front].classList.add('on');
      layers[front ^ 1].classList.remove('on');
      capEl.textContent = FEATURED_SHOTS[i].cap;
      dots.forEach((d, k) => d.classList.toggle('on', k === i));
      idx = i;
      preloadImageWhenIdle(FEATURED_SHOTS[(i + 1) % FEATURED_SHOTS.length].img);
    };
    const preload = (i, cb, priority = 'low') => {
      preloadImage(FEATURED_SHOTS[i].img, { priority }).then((url) => {
        if (url) cb();
      });
    };
    const jump = (i, priority = 'high') => preload(i, () => show(i), priority);
    const advance = (priority = 'low') => jump(
      (idx + 1) % FEATURED_SHOTS.length, priority);
    const arm = () => { if (!timer) timer = setInterval(advance, 8000); };
    // r9.1: manual browse resets the auto-rotate clock so it never snatches
    // the frame away right after the user picked one
    const rearm = () => { if (timer) { clearInterval(timer); timer = 0; } arm(); };
    // r9.1 (owner): lead with a DIFFERENT shot each load. The panel used to
    // request and decode this 45-350 kB image while the selected tank and the
    // post chain were still warming. Keep the gradient card in place, then
    // activate only after the playable-ready contract (or immediately on
    // explicit panel intent). No gallery media competes with a pristine boot.
    const first = Math.floor(Math.random() * FEATURED_SHOTS.length);
    let activated = false;
    const activate = (priority = 'low') => {
      if (activated) return;
      activated = true;
      preload(first, () => { show(first); arm(); }, priority);
    };
    const activateWhenPlayable = () => {
      if (globalThis.__GAME_READY === true) {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(() => activate('low'), { timeout: 1400 });
        } else setTimeout(() => activate('low'), 500);
        return;
      }
      setTimeout(activateWhenPlayable, 120);
    };
    activateWhenPlayable();
    shotEl.addEventListener('pointerenter', () => activate('high'), { once: true });
    shotEl.addEventListener('focusin', () => activate('high'), { once: true });
    shotEl.addEventListener('click', () => { activate('high'); advance('high'); rearm(); });
    panel.querySelector('.fnav.prev').addEventListener('click', (e) => {
      e.stopPropagation();
      jump((idx - 1 + FEATURED_SHOTS.length) % FEATURED_SHOTS.length);
      rearm();
    });
    panel.querySelector('.fnav.next').addEventListener('click', (e) => {
      e.stopPropagation(); advance(); rearm();
    });
    dots.forEach((d, k) => d.addEventListener('click', () => { jump(k); rearm(); }));
    shotEl.addEventListener('mouseenter', () => { if (timer) { clearInterval(timer); timer = 0; } });
    shotEl.addEventListener('mouseleave', arm);
  })();

  const statsEl = root.querySelector('.stats');
  const cardsEl = root.querySelector('.cot-cards');
  const countryRailEl = root.querySelector('.cot-country-rail');
  const chipsEl = root.querySelector('.cot-country-chips');
  const prevCountryBtn = root.querySelector('.cot-country-edge.prev');
  const nextCountryBtn = root.querySelector('.cot-country-edge.next');
  const prevVehicleBtn = root.querySelector('.cot-car-arrow.prev');
  const nextVehicleBtn = root.querySelector('.cot-car-arrow.next');
  const battleControl = root.querySelector('.cot-battle-control');
  const battleBtn = root.querySelector('.cot-battle');
  const battleModeBtn = root.querySelector('.cot-battle-mode');
  const battleMenu = root.querySelector('.cot-battle-menu');
  const battleChoices = [...root.querySelectorAll('.cot-battle-choice[data-mode]')];
  const battleRuleChoices = [...root.querySelectorAll('.cot-battle-choice[data-game-mode]')];
  const roomReminder = root.querySelector('.cot-room-reminder');
  const mapsEl = root.querySelector('.cot-maps');
  const recordTrigger = root.querySelector('.cot-record-trigger');
  const recordModal = root.querySelector('.cot-record-modal');
  const recordClose = root.querySelector('.cot-record-close');
  const mobileNavTrigger = root.querySelector('.cot-mobile-nav-trigger');
  const mobileNavMenu = root.querySelector('.cot-mobile-nav-menu');
  const garagePanelButtons = [...root.querySelectorAll('.cot-garage-tool')];
  const garagePanelScrim = root.querySelector('.cot-garage-panel-scrim');

  let selectedId = specs.length ? specs[0].id : null;
  let battleMode = 'solo';
  let battleGameMode = 'standard';
  let vehicleLocked = false;
  const cardById = new Map();
  const specById = new Map();
  // specById covers the FULL roster so direct tooling can still inspect a
  // delisted vehicle without exposing it in the player-facing carousel.
  for (const s of allSpecs) specById.set(s.id, s);

  const emit = (ev, payload) => { if (bus && bus.emit) bus.emit(ev, payload); };
  const openSelectedInGallery = (layer = 'appearance') => {
    emit('ui:click', {});
    window.location.href = garageGalleryHref(selectedId, layer);
  };
  let recordRestoreFocus = null;
  const isRecordOpen = () => recordModal.classList.contains('open');
  const openServiceRecord = () => {
    refreshServiceRecord();
    recordRestoreFocus = document.activeElement;
    recordModal.hidden = false;
    recordModal.classList.add('open');
    recordTrigger.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => recordClose.focus());
  };
  const closeServiceRecord = ({ restoreFocus = true } = {}) => {
    if (!isRecordOpen()) return;
    recordModal.classList.remove('open');
    recordModal.hidden = true;
    recordTrigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) (recordRestoreFocus || recordTrigger).focus?.();
    recordRestoreFocus = null;
  };
  const isMobileNavigationOpen = () => !mobileNavMenu.hidden;
  const closeMobileNavigation = ({ restoreFocus = false } = {}) => {
    if (!isMobileNavigationOpen()) return;
    mobileNavMenu.hidden = true;
    mobileNavTrigger.setAttribute('aria-expanded', 'false');
    mobileNavTrigger.setAttribute('aria-label', 'Open navigation menu');
    if (restoreFocus) mobileNavTrigger.focus();
  };
  const isOverlayPanelLayout = () => document.body.dataset.cotPanels === 'overlay';
  const openGaragePanel = () => root.dataset.garagePanel || '';
  const setGaragePanel = (panel = '', { restoreFocus = false } = {}) => {
    const previous = openGaragePanel();
    const next = isOverlayPanelLayout() && panel ? panel : '';
    if (next) root.dataset.garagePanel = next;
    else delete root.dataset.garagePanel;
    garagePanelButtons.forEach((button) => {
      const expanded = button.dataset.garagePanel === next;
      button.setAttribute('aria-expanded', String(expanded));
    });
    if (restoreFocus && previous) {
      garagePanelButtons.find((button) => button.dataset.garagePanel === previous)?.focus();
    }
    requestAnimationFrame(() => {
      syncSidebarPanelHeight();
      queueCountryRailAffordances();
    });
  };
  garagePanelButtons.forEach((button) => button.addEventListener('click', () => {
    emit('ui:click', {});
    const panel = button.dataset.garagePanel;
    setGaragePanel(openGaragePanel() === panel ? '' : panel);
  }));
  garagePanelScrim.addEventListener('click', () => setGaragePanel('', { restoreFocus: true }));
  window.addEventListener('cot:layoutchange', () => {
    if (!isOverlayPanelLayout()) setGaragePanel('');
    syncSidebarPanelHeight();
  });
  const openMobileNavigation = () => {
    closeBattleMenu();
    mobileNavMenu.hidden = false;
    mobileNavTrigger.setAttribute('aria-expanded', 'true');
    mobileNavTrigger.setAttribute('aria-label', 'Close navigation menu');
  };
  mobileNavTrigger.addEventListener('click', () => {
    emit('ui:click', {});
    if (isMobileNavigationOpen()) closeMobileNavigation();
    else openMobileNavigation();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!isMobileNavigationOpen() || event.target === mobileNavTrigger ||
      mobileNavTrigger.contains(event.target) || mobileNavMenu.contains(event.target)) return;
    closeMobileNavigation();
  });
  // Escape belongs to the open disclosure. Capture it before the game's
  // rebindable input layer so closing navigation cannot also open Settings.
  window.addEventListener('keydown', (event) => {
    if (!isMobileNavigationOpen() || event.code !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeMobileNavigation({ restoreFocus: true });
  }, true);
  // Capture before the global rebindable input layer is created. Escape must
  // close this modal without also firing the settings-menu action behind it.
  window.addEventListener('keydown', (event) => {
    if (!isRecordOpen()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.code === 'Escape') closeServiceRecord();
    else if (event.code === 'Tab') recordClose.focus();
  }, true);

  // Show an edge affordance only while cards actually remain beyond it.
  // Keep unavailable buttons in layout (visibility:hidden) so the strip does
  // not jump sideways as the user reaches either end.
  const syncCarouselAffordances = () => {
    const maxScroll = Math.max(0, cardsEl.scrollWidth - cardsEl.clientWidth);
    const hasLeft = maxScroll > 1 && cardsEl.scrollLeft > 2;
    const hasRight = maxScroll > 1 && cardsEl.scrollLeft < maxScroll - 2;
    cardsEl.classList.toggle('has-more-left', hasLeft);
    cardsEl.classList.toggle('has-more-right', hasRight);
    for (const [button, available] of [[prevVehicleBtn, hasLeft], [nextVehicleBtn, hasRight]]) {
      button.disabled = !available;
      button.classList.toggle('is-unavailable', !available);
      button.setAttribute('aria-hidden', String(!available));
    }
  };
  const queueCarouselAffordances = () => requestAnimationFrame(syncCarouselAffordances);
  cardsEl.addEventListener('scroll', syncCarouselAffordances, { passive: true });
  window.addEventListener('resize', queueCarouselAffordances);

  // Country flags use the same honest overflow contract as the vehicle strip:
  // fixed edge fades/buttons appear only where hidden content really exists.
  const syncCountryRailAffordances = () => {
    const { hasLeft, hasRight } = horizontalRailState(
      chipsEl.scrollLeft, chipsEl.scrollWidth, chipsEl.clientWidth,
    );
    countryRailEl.classList.toggle('has-more-left', hasLeft);
    countryRailEl.classList.toggle('has-more-right', hasRight);
    for (const [button, available] of [[prevCountryBtn, hasLeft], [nextCountryBtn, hasRight]]) {
      button.disabled = !available;
      button.classList.toggle('is-unavailable', !available);
      button.setAttribute('aria-hidden', String(!available));
    }
  };
  const queueCountryRailAffordances = () => requestAnimationFrame(syncCountryRailAffordances);
  const scrollCountries = (direction) => {
    const distance = Math.max(180, chipsEl.clientWidth * 0.72);
    chipsEl.scrollBy({ left: direction * distance, behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
  };
  chipsEl.addEventListener('scroll', syncCountryRailAffordances, { passive: true });
  chipsEl.addEventListener('wheel', (event) => {
    const { maxScroll } = horizontalRailState(
      chipsEl.scrollLeft, chipsEl.scrollWidth, chipsEl.clientWidth,
    );
    if (maxScroll <= 1) return;
    const delta = horizontalRailWheelDelta(
      event.deltaX, event.deltaY, event.deltaMode, chipsEl.clientWidth,
    );
    if (!delta) return;
    const before = chipsEl.scrollLeft;
    const target = Math.max(0, Math.min(maxScroll, before + delta));
    if (Math.abs(target - before) < 0.5) return;
    event.preventDefault();
    chipsEl.scrollLeft = target;
    syncCountryRailAffordances();
  }, { passive: false });
  prevCountryBtn.addEventListener('click', () => {
    emit('ui:click', {});
    scrollCountries(-1);
  });
  nextCountryBtn.addEventListener('click', () => {
    emit('ui:click', {});
    scrollCountries(1);
  });
  window.addEventListener('resize', queueCountryRailAffordances);

  // --- MAP-CONFIG WIRING: battlefield picker (maps come from createGarage
  // opts.maps = [{id,name,blurb,thumb}]; 'random' rolls at battle start) ---
  const maps = opts.maps || [];
  let selectedMapId = defaultGarageMapId(maps);
  const mapCardById = new Map();
  if (maps.length) {
    const title = document.createElement('div');
    title.className = 'mtitle';
    title.innerHTML = `${uiIconSVG('map', 13)}<span>Battlefield</span>`;
    title.appendChild(createInfoButton({
      label: 'About battlefield selection',
      title: 'Battlefield',
      text: 'Choose the terrain used by the next battle. Random rolls from the full available battlefield roster when deployment begins; room hosts make the final selection for multiplayer matches.',
      images: () => {
        const selected = maps.find((map) => map.id === selectedMapId && map.thumb)
          || maps.find((map) => map.thumb);
        if (!selected) return [];
        const action = FEATURED_SHOTS.find((shot) => shot.maps?.includes(selected.id));
        return [{
          src: selected.hero || selected.thumb,
          alt: `${selected.name} battlefield preview`,
          caption: `${selected.name} // battlefield preview`,
        }, action ? {
          src: action.img,
          alt: action.cap,
          caption: `${action.cap} // live game capture`,
        } : null].filter(Boolean);
      },
      sections: [
        { icon: 'map', title: 'Solo deployment', text: 'Your selection is resolved when the battle begins.' },
        { icon: 'team', title: 'Multiplayer rooms', text: 'The room host owns the final battlefield choice.' },
      ],
    }));
    mapsEl.appendChild(title);
    const mapScroll = document.createElement('div');
    mapScroll.className = 'cot-map-scroll';
    mapsEl.appendChild(mapScroll);
    const mapGrid = document.createElement('div');
    mapGrid.className = 'cot-map-grid';
    mapScroll.appendChild(mapGrid);
    for (const m of maps) {
      const card = document.createElement('div');
      card.className = 'cot-map-card';
      card.title = m.name;
      const thumb = document.createElement('div');
      thumb.className = `mthumb ${m.id}`;
      if (m.id === 'random') thumb.appendChild(createRandomMapMosaic(maps));
      else if (m.thumb) thumb.style.backgroundImage = `url(${m.thumb})`;
      const nm = document.createElement('div');
      nm.className = 'mname';
      nm.textContent = m.name;
      card.append(thumb, nm);
      card.addEventListener('click', () => {
        emit('ui:click', {});
        api.setSelectedMap(m.id);
      });
      mapGrid.appendChild(card);
      mapCardById.set(m.id, card);
    }
  }
  // garage_polish r9: the scroll fade masks only make sense when the list
  // actually overflows — on tall viewports the whole roster fits and the
  // fade would dim the last row for no reason. Toggle per resize.
  const syncScrollFades = () => {
    const mapScroll = mapsEl.querySelector('.cot-map-scroll');
    if (mapScroll) mapScroll.classList.toggle('can-scroll', mapScroll.scrollHeight > mapScroll.clientHeight + 1);
    const cg = root.querySelector('.cot-camos .cgrid.camo');
    if (cg) cg.classList.toggle('can-scroll', cg.scrollHeight > cg.clientHeight + 1);
  };
  window.addEventListener('resize', syncScrollFades);
  requestAnimationFrame(syncScrollFades);
  // The map roster now exceeds the short-viewport column. Its flex height
  // can settle after the first animation frame (once the camo grid measures),
  // so window resize alone is insufficient to keep the fade affordance true.
  if (typeof ResizeObserver === 'function') {
    const scrollFadeObserver = new ResizeObserver(syncScrollFades);
    const mapScroll = mapsEl.querySelector('.cot-map-scroll');
    if (mapScroll) scrollFadeObserver.observe(mapScroll);
  }

  // --- CAMO PICKER SECTION: per-tank paint pattern -------------------------
  // opts.camo = { patterns: string[], label: {id:label}, get(specId),
  //               set(specId, patternId) } (main.js injects the materials.js
  //               persistence + live-repaint hooks). Selection is per tank,
  //               shown on the pedestal immediately, and persists via
  //               localStorage inside opts.camo.set.
  const camoOpts = opts.camo || null;
  const camosEl = root.querySelector('.cot-camos');
  const promoteCamoSwatches = () => {
    scheduleCamoSwatchLoad(true).catch(() => { /* next interaction retries */ });
  };
  camosEl?.addEventListener('pointerenter', promoteCamoSwatches, { once: true });
  camosEl?.addEventListener('focusin', promoteCamoSwatches, { once: true });
  camosEl?.addEventListener('touchstart', promoteCamoSwatches, { once: true, passive: true });
  const camoCardById = new Map();
  let customCamoStudioAccess = null;
  if (camoOpts && camoOpts.patterns && camoOpts.patterns.length) {
    const title = document.createElement('div');
    title.className = 'ctitle';
    title.innerHTML = `${uiIconSVG('camouflage', 13)}<span>Camouflage</span>`;
    const titleActions = document.createElement('div');
    titleActions.className = 'cot-camo-title-actions';
    titleActions.appendChild(createInfoButton({
      label: 'About camouflage concealment',
      title: 'Camouflage concealment',
      text: '+3.5% concealment on matching maps. Auto always selects a matching seasonal pattern; manually selected camouflage only receives the bonus on compatible battlefields.',
      images: () => {
        const selected = specById.get(selectedId);
        if (!selected) return [];
        const tile = document.createElement('canvas');
        tile.width = 480;
        tile.height = 180;
        const current = camoOpts.get(selected.id);
        paintCamoSwatch(tile, selected, current === CUSTOM_CAMO_ID && camoOpts.getCustom
          ? customCamoPatternId(camoOpts.getCustom(selected.id)) : current);
        return [{
          src: tile.toDataURL('image/png'),
          alt: 'Selected camouflage pattern tile',
          caption: 'Current paint // material swatch',
        }, {
          src: iconUrl(selected.id, 'angle'),
          alt: `${selected.label?.displayName || selected.name} camouflage reference`,
          fit: 'contain',
          caption: `${selected.label?.displayName || selected.name} // vehicle application`,
        }];
      },
      sections: [
        { icon: 'camouflage', title: 'Matching biome', text: 'Compatible seasonal paint adds 3.5% concealment.' },
        { icon: 'brush', title: 'Local studio', text: 'Custom recipes are device-local and convert to Factory paint online.' },
      ],
    }));
    let customOpenButton = null;
    if (typeof camoOpts.getCustom === 'function' && typeof camoOpts.setCustom === 'function') {
      customOpenButton = document.createElement('button');
      customOpenButton.type = 'button';
      customOpenButton.className = 'cot-custom-open';
      customOpenButton.innerHTML = `${uiIconSVG('brush', 12)}<span>Create</span>`;
      customOpenButton.setAttribute('aria-label', 'Create custom camouflage');
      customOpenButton.setAttribute('aria-haspopup', 'dialog');
      customOpenButton.setAttribute('aria-expanded', 'false');
      titleActions.appendChild(customOpenButton);
    }
    title.appendChild(titleActions);
    camosEl.appendChild(title);
    const grid = document.createElement('div');
    // camo r8: 'camo' modifier — the pattern roster grew 6 -> 16, so THIS
    // grid scrolls (max-height in css) while the equipment grid below stays
    // static. Tools query `.cot-camos .cgrid` first-match as before.
    grid.className = 'cgrid camo';
    camosEl.appendChild(grid);
    for (const pid of camoOpts.patterns) {
      const card = document.createElement('div');
      card.className = 'cot-camo-card';
      card.dataset.pid = pid; // camo r8: stable hook for tools + tests
      card.innerHTML = pid === 'auto'
        ? `<div class="sw auto"><canvas></canvas></div><div class="cl"></div>`
        : `<div class="sw"><canvas></canvas></div><div class="cl"></div>`;
      card.querySelector('.cl').textContent =
        (camoOpts.label && camoOpts.label[pid]) || pid;
      card.title = (camoOpts.label && camoOpts.label[pid]) || pid;
      card.addEventListener('click', () => {
        emit('ui:click', {});
        if (!selectedId) return;
        camoOpts.set(selectedId, pid);
        refreshCamoSel();
        // Keep the packaged portrait healthy; the live pedestal is the
        // authoritative camouflage preview.
        requeueTankThumbs(selectedId);
      });
      grid.appendChild(card);
      camoCardById.set(pid, card);
    }
    if (typeof camoOpts.getCustom === 'function' && typeof camoOpts.setCustom === 'function') {
      customCamoStudioAccess = createCustomCamoStudioAccess(async () => {
        const { createCustomCamoStudio } = await import('./customCamoStudio.ts');
        return createCustomCamoStudio({
          button: customOpenButton,
          camo: camoOpts,
          selectedId: () => selectedId,
          selectedSpec: () => (selectedId ? specById.get(selectedId) : null),
          paintPreview: paintCamoSwatch,
          emitClick: () => emit('ui:click', {}),
          refreshSelection: refreshCamoSel,
          requeueThumb: requeueTankThumbs,
        });
      });
      const preloadStudio = () => {
        customCamoStudioAccess.preload().catch(() => { /* the click path retries */ });
      };
      customOpenButton.addEventListener('pointerenter', preloadStudio, { once: true });
      customOpenButton.addEventListener('focus', preloadStudio, { once: true });
      customOpenButton.addEventListener('click', async () => {
        customOpenButton.setAttribute('aria-busy', 'true');
        customOpenButton.removeAttribute('data-load-error');
        try {
          await customCamoStudioAccess.open();
          customOpenButton.removeAttribute('title');
        } catch (error) {
          customOpenButton.dataset.loadError = 'true';
          customOpenButton.title = 'Custom studio could not load. Click to retry.';
          console.warn('[garage] custom camouflage studio failed to load', error);
        } finally {
          customOpenButton.removeAttribute('aria-busy');
        }
      });
    }
  }
  // Battlefield and camouflage form one balanced pair. They share the
  // available vertical budget, grow together, and stop once the taller
  // section can show all of its content. Any excess room remains below the
  // pair for Battle Gallery rather than stretching either plate into a void.
  function syncSidebarPanelHeight() {
    const leftcol = root.querySelector('.cot-leftcol');
    if (!leftcol || isOverlayPanelLayout() || getComputedStyle(mapsEl).display === 'none') {
      leftcol?.style.removeProperty('--cot-sidebar-panel-height');
      return;
    }
    const style = getComputedStyle(leftcol);
    const gap = Number.parseFloat(style.rowGap || style.gap) || 8;
    const fixedChildren = [...leftcol.children]
      .filter((child) => child !== mapsEl && child !== camosEl && getComputedStyle(child).display !== 'none');
    const fixedHeight = fixedChildren.reduce((sum, child) => sum + child.offsetHeight, 0);
    const gapHeight = gap * Math.max(0, leftcol.children.length - 1);
    const pairBudget = Math.max(216, leftcol.clientHeight - fixedHeight - gapHeight);
    const mapTitle = mapsEl.querySelector('.mtitle');
    const mapGrid = mapsEl.querySelector('.cot-map-grid');
    const camoTitle = camosEl.querySelector('.ctitle');
    const camoGrid = camosEl.querySelector('.cgrid.camo');
    const mapIntrinsic = (mapTitle?.offsetHeight || 0) + (mapGrid?.scrollHeight || 0) + 25;
    const camoIntrinsic = (camoTitle?.offsetHeight || 0) + (camoGrid?.scrollHeight || 0) + 25;
    const contentCap = Math.max(108, mapIntrinsic, camoIntrinsic);
    const height = Math.floor(Math.min(pairBudget / 2, contentCap));
    const next = `${height}px`;
    if (leftcol.style.getPropertyValue('--cot-sidebar-panel-height') !== next) {
      leftcol.style.setProperty('--cot-sidebar-panel-height', next);
      requestAnimationFrame(syncScrollFades);
    }
  }
  window.addEventListener('resize', syncSidebarPanelHeight);
  requestAnimationFrame(syncSidebarPanelHeight);
  if (typeof ResizeObserver === 'function') {
    const sidebarSizeObserver = new ResizeObserver(syncSidebarPanelHeight);
    sidebarSizeObserver.observe(root.querySelector('.cot-leftcol'));
  }
  // --- EQUIPMENT SYSTEM: slot boxes on the stats card + item picker --------
  // Catalog/persistence/era-gating live in game/equipment.ts (localStorage
  // `cot.equip.<specId>`, read battle-side by game/state.js at spawn). The
  // three slot boxes are rendered INTO the stats card by renderStats (the
  // card rebuilds its innerHTML per vehicle), so slot clicks are delegated
  // from statsEl here; the picker is a side panel anchored next to the card.
  const eqpickEl = document.createElement('div');
  eqpickEl.className = 'cot-eqpick';
  root.appendChild(eqpickEl);
  let eqOpenSlot = -1;   // -1 = picker closed
  let eqCat = 'all';     // active category chip

  const curLoadout = () =>
    selectedId ? loadEquipment(selectedId, specById.get(selectedId)) : [];

  /** Assign/remove an item in the open slot, persist, refresh the card. */
  function eqAssign(itemId) {
    if (vehicleLocked || !selectedId || eqOpenSlot < 0) return;
    const spec = specById.get(selectedId);
    const cur = curLoadout();
    const prev = cur.indexOf(itemId);
    if (itemId && prev === eqOpenSlot) {
      // re-picking the item already in this slot = unequip it
      cur.splice(eqOpenSlot, 1);
    } else if (itemId) {
      if (prev >= 0) cur.splice(prev, 1); // moving from another slot
      if (eqOpenSlot < cur.length) cur.splice(eqOpenSlot, 1, itemId);
      else cur.push(itemId);
    } else if (eqOpenSlot < cur.length) {
      cur.splice(eqOpenSlot, 1); // REMOVE tile
    }
    saveEquipment(selectedId, cur, spec);
    closeEqPicker();
    renderStats(spec); // slots + modified stat bars
  }

  function renderEqPicker() {
    if (!selectedId || eqOpenSlot < 0) return;
    const spec = specById.get(selectedId);
    const cur = curLoadout();
    let chips = '';
    for (const c of EQUIP_CATEGORIES) {
      chips += `<button type="button" class="chip${c.id === eqCat ? ' sel' : ''}" data-cat="${c.id}">${c.label}</button>`;
    }
    let tiles =
      `<div class="cot-eqtile remove" data-eq="">` +
      `${uiIconSVG('close', 34, 'rgba(238,244,250,.86)')}` +
      `<div class="n">Empty</div><div class="e">remove equipment from this slot</div></div>`;
    for (const it of EQUIPMENT_CATALOG) {
      if (eqCat !== 'all' && it.cat !== eqCat) continue;
      const locked = !equipEligible(it, spec);
      const at = cur.indexOf(it.id);
      const cls = ['cot-eqtile'];
      let tag = '';
      if (locked) { cls.push('locked'); tag = `<span class="tag">${it.era}</span>`; }
      else if (at === eqOpenSlot) { cls.push('sel'); tag = `<span class="tag">Fitted</span>`; }
      else if (at >= 0) { cls.push('inother'); tag = `<span class="tag">Slot ${at + 1}</span>`; }
      tiles += `<div class="${cls.join(' ')}" data-eq="${locked ? '' : it.id}" ` +
        `title="${it.name} — ${it.desc}${locked ? ' (modern vehicles only)' : ''}">` +
        `${tag}${equipIconSVG(it.id, 34)}<div class="n">${it.name}</div>` +
        `<div class="e">${it.desc}</div></div>`;
    }
    eqpickEl.innerHTML =
      `<div class="ph"><span class="t">Equipment &middot; <i>Slot ${eqOpenSlot + 1}</i></span>` +
      `<button type="button" class="x" aria-label="Close">&#10005;</button></div>` +
      `<div class="chips">${chips}</div>` +
      `<div class="pgrid">${tiles}</div>`;
    // slot highlight on the card
    for (const el of statsEl.querySelectorAll('.eqslot')) {
      el.classList.toggle('open', Number(el.dataset.slot) === eqOpenSlot);
    }
  }

  function openEqPicker(slot) {
    if (vehicleLocked) return;
    eqOpenSlot = slot;
    eqpickEl.classList.add('open');
    renderEqPicker();
    document.addEventListener('keydown', eqKeydown);
    document.addEventListener('mousedown', eqOutside, true);
  }
  function closeEqPicker() {
    if (eqOpenSlot < 0) return;
    eqOpenSlot = -1;
    eqpickEl.classList.remove('open');
    for (const el of statsEl.querySelectorAll('.eqslot')) el.classList.remove('open');
    document.removeEventListener('keydown', eqKeydown);
    document.removeEventListener('mousedown', eqOutside, true);
  }
  function eqKeydown(e) {
    if (e.code === 'Escape') { e.stopPropagation(); closeEqPicker(); }
  }
  function eqOutside(e) {
    if (!eqpickEl.contains(e.target) && !e.target.closest('.eqslot')) closeEqPicker();
  }

  eqpickEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) {
      emit('ui:click', {});
      eqCat = chip.dataset.cat;
      renderEqPicker();
      return;
    }
    if (e.target.closest('.x')) { emit('ui:click', {}); closeEqPicker(); return; }
    const tile = e.target.closest('.cot-eqtile');
    if (!tile || tile.classList.contains('locked')) return;
    emit('ui:click', {});
    eqAssign(tile.dataset.eq || null);
  });

  // slot boxes are re-created by every renderStats — delegate their clicks
  statsEl.addEventListener('click', (e) => {
    const galleryLink = e.target.closest('[data-gallery-layer]');
    if (galleryLink) {
      openSelectedInGallery(galleryLink.dataset.galleryLayer || 'appearance');
      return;
    }
    const slot = e.target.closest('.eqslot');
    if (!slot) return;
    emit('ui:click', {});
    const idx = Number(slot.dataset.slot);
    if (idx === eqOpenSlot) closeEqPicker();
    else openEqPicker(idx);
  });

  /** Tank switch: the card re-renders its own slots; just drop a stale picker. */
  function refreshEquipSel() {
    closeEqPicker();
  }
  // --- END EQUIPMENT SYSTEM -------------------------------------------------
  let swatchesFor = null; // spec id the swatches are currently painted for
  function refreshCamoSel() {
    if (!camoOpts || !selectedId) return;
    const cur = camoOpts.get(selectedId);
    customCamoStudioAccess?.peek()?.syncSelected();
    for (const [pid, card] of camoCardById) {
      card.classList.toggle('sel', pid === cur);
      // camo r8: the grid scrolls now — keep the active pattern in view when
      // selection changes (tank switch restoring a persisted pick).
      if (pid === cur && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
    }
    // repaint swatch tiles for THIS tank (factory palette + nation digital
    // differ per vehicle — the preview must show what the hull will wear)
    if (swatchesFor !== selectedId) {
      const spec = specById.get(selectedId);
      if (spec) {
        for (const [pid, card] of camoCardById) {
          const cv = card.querySelector('.sw canvas');
          if (cv) {
            if (pid === 'auto') paintAutoCamoSwatch(cv, spec);
            else paintCamoSwatch(cv, spec, pid);
          }
        }
        swatchesFor = selectedId;
      }
    }
  }
  // --- END CAMO PICKER SECTION ---------------------------------------------

  // ERA is still used for stat-peer normalization, but it is not a catalog
  // partition. Modern, Cold War and WWII vehicles share each country fleet.

  // PER-ERA stat ranges for the normalized bars. r6-2 (round critique:
  // "6.0 s reload renders ~90% full / bars carry no comparative scale"): the
  // r5-2 per-era ranges let the IFV autocannons (sub-second reload, ~50 hp
  // alpha) stretch every modern range so far that MBT bars parked at
  // arbitrary-looking lengths. Bars now normalize min→max within the
  // vehicle's own matchmaking tier + ERA peer group, higher-is-better on
  // every row (reload inverted: faster = fuller). The tier boundary keeps a
  // tier-VII M60 and tier-X Abrams off the same scale without reintroducing a
  // public vehicle-class taxonomy.
  const statGroupOf = garageStatGroup;
  const STAT_RANGES = new Map(); // tier/era -> {hp,speed,hpt,dmg,reload:[lo,hi]}
  for (const s of allSpecs) {
    const g = statGroupOf(s);
    let r = STAT_RANGES.get(g);
    if (!r) {
      r = {
        hp: [Infinity, -Infinity], speed: [Infinity, -Infinity],
        hpt: [Infinity, -Infinity], dmg: [Infinity, -Infinity],
        reload: [Infinity, -Infinity],
        // EQUIPMENT SYSTEM rows: aim time + the spotting pair, so optics/
        // nets/rammers visibly move their bars against the same peer group
        aim: [Infinity, -Infinity], view: [Infinity, -Infinity],
        camo: [Infinity, -Infinity],
      };
      STAT_RANGES.set(g, r);
    }
    const add = (key, v) => {
      if (v == null || !isFinite(v)) return;
      if (v < r[key][0]) r[key][0] = v;
      if (v > r[key][1]) r[key][1] = v;
    };
    add('hp', s.hp);
    add('speed', s.topSpeedKmh);
    add('hpt', s.enginePowerHp / s.weightTons);
    add('reload', s.gun.reloadS);
    add('aim', s.gun.aimTimeS);
    add('view', viewRangeOf(s));
    add('camo', baseCamoOf(s, false));
    const shells = (s.gun && s.gun.shells) || [];
    add('dmg', shells.length ? Math.max(...shells.map((sh) => sh.dmg || 0)) : null);
  }
  // min→0.14 stub, max→1.0 full; degenerate spans (single-vehicle group)
  // park at a neutral 0.72 so the card never shows an all-stub column
  function statFrac(group, key, v, invert) {
    const r = STAT_RANGES.get(group);
    if (!r || v == null || !isFinite(v)) return 0.6;
    const [lo, hi] = r[key];
    const span = hi - lo;
    if (!(span > Math.max(1e-6, Math.abs(hi) * 0.02))) return 0.72;
    let f = (v - lo) / span;
    if (invert) f = 1 - f;
    return 0.14 + Math.max(0, Math.min(1, f)) * 0.86;
  }

  // --- COUNTRY FILTER CHIPS -------------------------------------------------
  // The row is an explicit national flag selector. USSR and Russia share RU;
  // every historical era stays together inside its country fleet.
  const inCountry = (spec, countryId) => countryCodeOf(spec) === countryId;
  let countryFilter = countryGroups[0]?.id || 'us';
  const chipById = new Map();
  for (const group of countryGroups) {
    const count = group.count;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cot-country-chip';
    chip.dataset.country = group.id;
    chip.title = `${group.name} · ${count} vehicles`;
    chip.setAttribute('aria-label', `Show ${group.name} vehicles`);
    chip.innerHTML = `${flagIconHTML(group.nation, 22)}` +
      `<span class="code">${group.label}</span><span class="ct">${count}</span>`;
    chip.addEventListener('click', () => {
      emit('ui:click', {});
      applyCountryFilter(group.id);
      // Moving to a new country selects its first vehicle so the pedestal,
      // stats card and highlighted card stay in sync with the visible strip
      const first = specs.find((spec) => inCountry(spec, group.id));
      if (first && !inCountry(specById.get(selectedId) || first, group.id)) {
        api.setSelected(first.id);
      }
    });
    chipsEl.appendChild(chip);
    chipById.set(group.id, chip);
  }
  function applyCountryFilter(countryId) {
    countryFilter = countryId;
    for (const [id, chip] of chipById) chip.classList.toggle('sel', id === countryId);
    // Programmatic tank selection can cross national groups. Keep the active
    // flag fully visible rather than leaving its highlight under an edge fade.
    const activeChip = chipById.get(countryId);
    requestAnimationFrame(() => {
      if (api.isOpen && activeChip) activeChip.scrollIntoView({
        block: 'nearest', inline: 'center', behavior: REDUCED_MOTION ? 'auto' : 'smooth',
      });
      syncCountryRailAffordances();
    });
    let vis = 0; // garage_ui: stagger budget for the reveal animation
    for (const spec of specs) {
      const card = cardById.get(spec.id);
      if (!card) continue;
      const showCard = inCountry(spec, countryId);
      const wasShown = card.style.display !== 'none';
      card.style.display = showCard ? '' : 'none';
      // garage_ui: a freshly revealed strip fades in with a light stagger
      // instead of teleporting 20-60 cards in one style flush (opacity only —
      // transform stays owned by the sel/hover lift). Cards already on screen
      // and the initial hidden-root pass don't animate.
      if (showCard && !wasShown && api.isOpen && card.animate && !REDUCED_MOTION) {
        card.animate([{ opacity: 0 }, { opacity: 1 }],
          { duration: 200, delay: Math.min(vis, 12) * 16, easing: 'ease-out', fill: 'backwards' });
      }
      if (showCard) vis++;
    }
    cardsEl.scrollLeft = 0;
    queueCarouselAffordances();
    queueCountryRailAffordances();
  }
  // --- END country filter chips --------------------------------------------

  // --- build carousel cards ---
  // Pointer sweeps across a dense carousel must not transfer half the fleet.
  // A short dwell is enough to distinguish a deliberate target; focus/touch/
  // press are already explicit and signal immediately. The eventual click
  // joins the same builder/texture promise in main.js.
  let tankIntentTimer = 0;
  let tankIntentId = '';
  const clearTankIntent = (specId = '') => {
    if (specId && tankIntentId !== specId) return;
    if (tankIntentTimer) clearTimeout(tankIntentTimer);
    tankIntentTimer = 0;
    tankIntentId = '';
  };
  const signalTankIntent = (specId, immediate = false) => {
    if (!opts.onTankIntent || !specId || specId === selectedId) return;
    clearTankIntent();
    if (immediate) {
      try { opts.onTankIntent(specId); } catch (_) { /* optional warm path */ }
      return;
    }
    tankIntentId = specId;
    tankIntentTimer = setTimeout(() => {
      tankIntentTimer = 0;
      tankIntentId = '';
      try { opts.onTankIntent(specId); } catch (_) { /* optional warm path */ }
    }, 90);
  };
  for (const s of specs) {
    const card = document.createElement('div');
    const developmentOnly = Boolean(s.roster?.developmentOnly);
    card.className = `cot-card${developmentOnly ? ' dev-only' : ''}`;
    card.dataset.specId = s.id; // switch-desync r1: stable hook for tools/tests
    const displayName = s.label?.displayName || s.name;
    const shortName = s.label?.shortName || displayName;
    card.title = developmentOnly ? `${displayName} — local development vehicle` : displayName;
    card.setAttribute('aria-label', `${tierNumeral(s.id) || ''} ${displayName}${developmentOnly ? ', development vehicle' : ''}`.trim());
    card.style.setProperty('--nation-flag', `url("${flagIconUrl(s.nation)}")`);
    // Stable pre-rendered 3/4 portrait generated from the final first-party
    // procedural build; no live renderer or model swap is needed here.
    card.innerHTML =
      `<span class="designation">${s.markings?.designation || ''}</span>` +
      (developmentOnly ? `<span class="dev-tag">${s.roster?.tag || 'DEV'}</span>` : '') +
      `<span class="flag">${flagIconHTML(s.nation, 20)}<i>${NATION_LABEL[s.nation] || s.nation}</i></span>` +
      `<img class="ti" data-cot-thumb="${s.id}" src="${getTankThumb(s.id)}" alt="${displayName}">` +
      `<div class="nm"><b class="tiern">${tierNumeral(s.id) || ''}</b><span class="nmt"></span></div>` +
      `<div class="era">${vehicleEraLabel(s.era, { short: true })}</div>`;
    card.querySelector('.nmt').textContent = shortName;
    card.addEventListener('pointerenter', () => signalTankIntent(s.id), { passive: true });
    card.addEventListener('pointerleave', () => clearTankIntent(s.id), { passive: true });
    card.addEventListener('focusin', () => signalTankIntent(s.id, true));
    card.addEventListener('touchstart', () => signalTankIntent(s.id, true), { passive: true });
    card.addEventListener('pointerdown', () => signalTankIntent(s.id, true), { passive: true });
    card.addEventListener('click', () => {
      emit('ui:click', {});
      api.setSelected(s.id);
    });
    cardsEl.appendChild(card);
    cardById.set(s.id, card);
  }
  applyCountryFilter(countryFilter);
  // Packaged PNGs avoid per-card WebGL contexts and remain deterministic
  // across the garage carousel and screenshot harness.
  ensureTankThumbs(allSpecs, { canWork: () => api.isOpen });

  const GARAGE_INFO = Object.freeze({
    Performance: 'Core mobility, survivability, vision, and concealment values. Bars compare this vehicle with others in the same tier and battlefield role; green values include mounted equipment.',
    'Special system': 'A vehicle-specific combat mechanic. The card shows its activation key, effect, and runtime limitations.',
    Ammunition: 'Every available shell type with point-blank / 1 km penetration and average damage. Autoloaders also show magazine size, intra-clip timing, and full reload.',
    Protection: 'Nominal frontal hull and turret armor from the simulation profile. Angle, impact location, normalization, and shell type still determine the actual result.',
    Armament: 'Gun caliber and the authored vertical gun arc used by the aiming and ballistics simulation.',
    Modules: 'Damageable internal systems represented by this vehicle. The Gallery module overlay shows their authored placement.',
    Crew: 'Crew stations used by the vehicle damage model. Disabled crew affect the systems associated with their roles.',
    Equipment: 'Three local loadout slots. Mounted equipment changes the same runtime values shown above and used when a battle begins.',
  });

  function statSectionTitle(icon, label, meta = '') {
    return `<div class="cot-stat-title" data-stat-info="${label}">${uiIconSVG(icon, 13)}` +
      `<span>${label}</span>${meta ? `<small>${meta}</small>` : ''}</div>`;
  }

  function statBar(label, valueText, frac, opts) {
    const pct = Math.max(2, Math.min(100, frac * 100)).toFixed(1);
    // EQUIPMENT SYSTEM: values changed by the mounted loadout render in the
    // boost tint with the stock value + contributing items in the tooltip.
    const mod = opts && opts.mod;
    const title = opts && opts.title ? ` title="${opts.title}"` : '';
    const icon = opts?.icon || 'speed';
    return `<div class="srow"${title}><span class="sicon">${uiIconSVG(icon, 16)}</span>` +
      `<div class="lr"><span>${label}</span>` +
      `<b${mod ? ' class="eqmod"' : ''}>${valueText}</b></div>` +
      `<div class="track"><div class="fill" style="width:${pct}%"></div></div></div>`;
  }

  function garageInfoImages(spec, label) {
    const name = spec.label?.displayName || spec.name;
    const technicalViews = {
      'Vehicle dossier': [
        ['angle', 'Procedural vehicle render'], ['armor_side', 'Armor protection diagram'], ['modules_side', 'Internal module diagram'],
      ],
      Performance: [['angle', 'Vehicle profile'], ['side', 'Mobility silhouette']],
      'Special system': [['modules_side', 'Special system placement'], ['angle', 'Vehicle profile']],
      Protection: [['armor_side', 'Armor protection diagram'], ['hit_zones_side', 'Hit-zone layout']],
      Modules: [['modules_side', 'Internal module diagram'], ['hit_zones_side', 'Damage-zone layout']],
      Crew: [['modules_side', 'Crew and module diagram'], ['side', 'Crew platform profile']],
      Armament: [['side', 'Armament profile'], ['top', 'Weapon plan view']],
      Ammunition: [['side', 'Ammunition platform profile'], ['modules_side', 'Ammunition and module layout']],
      Equipment: [['modules_side', 'Equipment integration diagram'], ['angle', 'Vehicle profile']],
    };
    return (technicalViews[label] || [['angle', 'Procedural vehicle render']]).map(([view, caption]) => ({
      src: iconUrl(spec.id, view),
      alt: `${name} ${caption.toLowerCase()}`,
      fit: 'contain',
      caption: `${name} // ${caption}`,
    }));
  }

  let statsFor = null; // last spec rendered — gates the swap micro-fade
  function renderStats(spec) {
    statsEl.querySelectorAll('.cot-info-trigger').forEach((button) => button.disposeInfo?.());
    const vehicleChanged = statsFor !== spec.id;
    // garage_ui: vehicle-switch micro-fade — the stats card content used to
    // teleport; a 190 ms fade/rise sells the swap without delaying the data.
    if (statsFor !== spec.id && statsFor !== null &&
        statsEl.animate && !REDUCED_MOTION) {
      statsEl.animate(
        [{ opacity: 0.25, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }],
        { duration: 190, easing: 'ease-out' });
    }
    statsFor = spec.id;
    const hpT = spec.enginePowerHp / spec.weightTons;
    const shells = (spec.gun && spec.gun.shells) || [];
    let shellRows = '';
    for (const sh of shells) {
      const col = SHELL_TYPE_COLOR[sh.type] || '#9fb0bf';
      // penetration at point blank / at 1 km
      const pen = sh.type === 'HE' ? `${sh.pen100Mm}` : `${sh.pen100Mm} / ${sh.pen1000Mm}`;
      // per-shell reload (IFV autocannon vs. ATGM rail): only shown when the
      // shell's own duration differs from the headline Reload bar above.
      const shRel = sh.reloadS && Math.abs(sh.reloadS - spec.gun.reloadS) > 0.01
        ? `${sh.reloadS.toFixed(sh.reloadS < 10 ? 1 : 0)} s reload` : '';
      shellRows += `<div class="shellrow" style="--shell-color:${col}">` +
        `<span class="shellkind">${shellIconSVG(sh.type, 24)}<span class="ty">${sh.type}</span></span>` +
        `<span class="nm">${sh.name}${shRel ? `<small>${shRel}</small>` : ''}</span>` +
        `<span class="shellmetric"><b>${pen}</b>mm</span>` +
        `<span class="shellmetric"><b>${sh.dmg}</b>hp</span></div>`;
    }
    const hullMm = frontArmorMm(spec.armor && spec.armor.hullPlates, ['glacis', 'front', 'driver']);
    const turMm = frontArmorMm(spec.armor && spec.armor.turretPlates, ['front', 'cheek', 'mantlet']);
    // headline DAMAGE (alpha) — penetration lives in the per-shell rows only
    // (r3: a vehicle-level pen number duplicated the shell table; no AAA tank
    // game headlines a single pen figure)
    const bestDmg = shells.length ? Math.max(...shells.map((s) => s.dmg || 0)) : 0;
    // Every bar normalizes within the vehicle's OWN tier+class peer
    // group, higher-is-better (reload inverted) — see STAT_RANGES above
    const grp = statGroupOf(spec);
    // EQUIPMENT SYSTEM: fold the mounted loadout into the displayed stats —
    // the same multipliers/tables the battle sim reads (equipment.ts +
    // spotting.js), so the card IS the loadout preview. Modified values tint
    // green with the stock number in the tooltip.
    // §5.31b PRINT VIEWER: print cards show STOCK stats — no loadout is
    // read (or ever written) for a view-only 'print:<id>' pseudo-spec.
    const eqIds = loadEquipment(spec.id, spec);
    const eqM = computeEquipMults(eqIds);
    const eqNames = eqIds.map((id) => EQUIPMENT_BY_ID.get(id).name).join(', ');
    const reloadS = spec.gun.reloadS * eqM.reload;
    const autoloader = spec.gun.autoloader;
    const reloadLabel = autoloader ? 'Magazine reload' : 'Reload';
    const magazineSpec = autoloader
      ? `<div class="magazine-spec"><span>Magazine autoloader</span>` +
        `<b>${autoloader.magazineSize} rounds &middot; ${autoloader.intraClipS.toFixed(1)} s cycle &middot; ` +
        `${reloadS.toFixed(1)} s full reload</b></div>`
      : '';
    const aimS = spec.gun.aimTimeS * eqM.aimTime;
    const vrBase = viewRangeOf(spec);
    const vrMove = vrBase * equipViewMult(eqIds, true);   // always-on items
    const vrStill = vrBase * equipViewMult(eqIds, false); // + binoculars
    const camoStill = Math.min(0.95, baseCamoOf(spec, false) + equipCamoBonus(eqIds, false));
    const camoMove = Math.min(0.95, baseCamoOf(spec, true) + equipCamoBonus(eqIds, true));
    const camoModded = equipCamoBonus(eqIds, false) > 0;
    const viewText = vrStill > vrMove + 0.5
      ? `${Math.round(vrMove)} / ${Math.round(vrStill)} m`
      : `${Math.round(vrMove)} m`;
    const eqTitle = (base) => `Stock ${base} &middot; ${eqNames}`;
    const special = garageSpecialSystem(spec, reloadS);
    const specialCard = special
      ? `<section class="cot-stat-section cot-special-section">` +
        statSectionTitle(special.icon, 'Special system', 'E key') +
        `<div class="cot-special-card"><span class="cot-special-icon">${uiIconSVG(special.icon, 24)}</span>` +
        `<div class="cot-special-copy"><b>${special.label}</b><p>${special.detail}</p>` +
        `<small>${special.meta}</small></div><kbd>E</kbd></div></section>`
      : '';
    const moduleRows = garageModuleRows(spec);
    const crewRows = garageCrewRows(spec);
    const moduleChips = moduleRows.map((row) =>
      `<div class="cot-module-chip" title="Damageable module: ${row.label}">` +
      `<span class="mi">${uiIconSVG(row.icon, 16)}</span><span>${row.label}</span></div>`).join('');
    const crewChips = crewRows.map((row) =>
      `<div class="cot-crew-chip"><span>${uiIconSVG(row.icon, 16)}</span><span>${row.label}</span></div>`).join('');
    let slotBoxes = '';
    for (let i = 0; i < EQUIP_SLOTS; i++) {
      const it = eqIds[i] ? EQUIPMENT_BY_ID.get(eqIds[i]) : null;
      slotBoxes += it
        ? `<div class="eqslot" data-slot="${i}" title="${it.name} &mdash; ${it.desc}">` +
          `${equipIconSVG(it.id, 26)}<span class="sl">${it.short}</span></div>`
        : `<div class="eqslot empty" data-slot="${i}" title="Mount equipment">` +
          `<span class="plus">+</span><span class="sl">Empty</span></div>`;
    }
    statsEl.innerHTML =
      `<div class="cot-dossier-head">` +
      `<img class="stats-ti" src="${iconUrl(spec.id, 'side_silhouette')}" alt="">` +
      `<div class="cot-dossier-title"><span class="cot-tier-plate">${tierNumeral(spec.id) || '&mdash;'}</span><h3></h3></div>` +
      `<div class="sub">${flagIconHTML(spec.nation, 20)}<span>${spec.nation} &middot; ${vehicleEraLabel(spec.era)}</span></div>` +
      `<button class="cot-gallery-link" type="button" data-gallery-layer="appearance">` +
      `${uiIconSVG('gallery', 15)}<span>Open in Tank Gallery</span><span class="go">&#8250;</span></button></div>` +
      `<section class="cot-stat-section">${statSectionTitle('speed', 'Performance', `${spec.weightTons.toFixed(1)} t`)}` +
      `<div class="cot-performance-grid">` +
      statBar('Hit points', `${spec.hp}`, statFrac(grp, 'hp', spec.hp), { icon: 'shield' }) +
      statBar('Top speed', `${spec.topSpeedKmh} km/h`, statFrac(grp, 'speed', spec.topSpeedKmh), { icon: 'speed' }) +
      statBar('Power / weight', `${hpT.toFixed(1)} hp/t`, statFrac(grp, 'hpt', hpT), { icon: 'engine' }) +
      statBar(reloadLabel, `${reloadS.toFixed(1)} s`, statFrac(grp, 'reload', reloadS, true),
        { icon: 'clock', mod: eqM.reload !== 1, title: eqTitle(`${spec.gun.reloadS.toFixed(1)} s`) }) +
      statBar('Aim time', `${aimS.toFixed(1)} s`, statFrac(grp, 'aim', aimS, true),
        { icon: 'scope', mod: eqM.aimTime !== 1, title: eqTitle(`${spec.gun.aimTimeS.toFixed(1)} s`) }) +
      statBar('Damage', `${bestDmg} hp`, statFrac(grp, 'dmg', bestDmg), { icon: 'damage' }) +
      statBar('View range', viewText, statFrac(grp, 'view', vrMove),
        { icon: 'optics', mod: vrMove > vrBase || vrStill > vrMove + 0.5,
          title: vrStill > vrMove + 0.5 ? `Moving / stationary &middot; stock ${vrBase} m`
            : eqTitle(`${vrBase} m`) }) +
      statBar('Camouflage', `${Math.round(camoStill * 100)} / ${Math.round(camoMove * 100)} %`,
        statFrac(grp, 'camo', camoStill),
        { icon: 'camouflage', mod: camoModded, title: 'Stationary / moving' +
          (camoModded ? ` &middot; stock ${Math.round(baseCamoOf(spec, false) * 100)} %` : '') }) +
      `</div></section>` +
      specialCard +
      `<section class="cot-stat-section">${statSectionTitle('shell', 'Ammunition', `${shells.length} types`)}` +
      magazineSpec +
      `<div class="shellhead"><span>Type</span><span>Round</span><span>Pen</span><span>Damage</span></div>` +
      shellRows + `</section>` +
      `<section class="cot-stat-section">${statSectionTitle('shield', 'Protection')}` +
      `<div class="armor-grid">` +
      `<div class="armorline">${uiIconSVG('shield', 19)}<span>Hull front</span><b>${hullMm != null ? `${Math.round(hullMm)} mm` : '&mdash;'}</b></div>` +
      `<div class="armorline">${uiIconSVG('turretRing', 19)}<span>Turret front</span><b>${turMm != null ? `${Math.round(turMm)} mm` : '&mdash;'}</b></div></div>` +
      `<button class="cot-layer-link" type="button" data-gallery-layer="armor">${uiIconSVG('shield', 13)}Inspect armor overlay</button></section>` +
      `<section class="cot-stat-section">${statSectionTitle('gun', 'Armament', `${spec.gun.caliberMm} mm`)}` +
      `<div class="armor-grid">` +
      `<div class="armorline">${uiIconSVG('gun', 19)}<span>Gun</span><b>${spec.gun.caliberMm} mm</b></div>` +
      `<div class="armorline">${uiIconSVG('scope', 19)}<span>Gun arc</span><b>&minus;${spec.gunDepressionDeg}&deg; / +${spec.gunElevationDeg}&deg;</b></div></div></section>` +
      `<section class="cot-stat-section">${statSectionTitle('engine', 'Modules', `${moduleRows.length} systems`)}` +
      `<div class="cot-module-grid">${moduleChips}</div>` +
      `<button class="cot-layer-link" type="button" data-gallery-layer="modules">${uiIconSVG('gallery', 13)}Open module overlay</button></section>` +
      `<section class="cot-stat-section">${statSectionTitle('crew', 'Crew', `${crewRows.length} stations`)}` +
      `<div class="cot-crew-grid">${crewChips}</div></section>` +
      // §5.31b PRINT VIEWER: view-only notice replaces the loadout slots —
      // equipment cannot be mounted on (or saved for) a print pseudo-spec.
      `<section class="cot-stat-section">` +
      `<div class="eqhead"><span>${uiIconSVG('repair', 13)} Equipment</span><i>${eqIds.length}/${EQUIP_SLOTS}</i></div>` +
      `<div class="eqrow">${slotBoxes}</div></section>`;
    statsEl.querySelector('h3').textContent = spec.label?.displayName || spec.name;
    const dossierHead = statsEl.querySelector('.cot-dossier-head');
    dossierHead?.appendChild(createInfoButton({
      label: 'About the vehicle dossier',
      title: 'Vehicle dossier',
      text: 'This panel is built from the selected vehicle’s authoritative gameplay specification. Tier, origin, combat values, ammunition, modules, crew, and equipment all update with the selected vehicle.',
      images: garageInfoImages(spec, 'Vehicle dossier'),
      sections: [
        { icon: 'shield', title: 'Authoritative data', text: 'Armor, modules, crew, shells, and mobility come from the playable vehicle specification.' },
        { icon: 'gallery', title: 'Technical views', text: 'Open Tank Gallery for interactive armor, module, and appearance layers.' },
      ],
    }));
    statsEl.querySelectorAll('[data-stat-info]').forEach((heading) => {
      const label = heading.dataset.statInfo;
      const text = GARAGE_INFO[label];
      if (text) heading.appendChild(createInfoButton({
        label: `About ${label}`,
        title: label,
        text,
        images: garageInfoImages(spec, label),
      }));
    });
    const equipmentHead = statsEl.querySelector('.eqhead');
    equipmentHead?.appendChild(createInfoButton({
      label: 'About equipment', title: 'Equipment', text: GARAGE_INFO.Equipment,
      images: garageInfoImages(spec, 'Equipment'),
    }));
    if (vehicleChanged) statsEl.scrollTop = 0;
  }

  function applySelection(specId) {
    if (vehicleLocked && specId !== selectedId) return false;
    const spec = specById.get(specId);
    if (!spec) return false;
    selectedId = specId;
    // Direct selection from another country (for example a screenshot
    // harness) switches the visible strip to that national fleet.
    if (cardById.has(specId) && countryCodeOf(spec) !== countryFilter) {
      applyCountryFilter(countryCodeOf(spec));
    }
    for (const [id, card] of cardById) card.classList.toggle('sel', id === specId);
    const card = cardById.get(specId);
    if (card && card.scrollIntoView) {
      card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
    queueCarouselAffordances();
    renderStats(spec);
    battleBtn.disabled = false;
    battleBtn.querySelector('.battle-word').textContent = 'BATTLE';
    camosEl.style.display = '';
    refreshCamoSel(); // CAMO PICKER SECTION: highlight this tank's pattern
    // camo r4: warm this tank's pattern bakes in the background so picker
    // clicks restore instantly instead of running the painter chain.
    if (camoOpts && camoOpts.prewarm) camoOpts.prewarm(specId);
    refreshEquipSel(); // EQUIPMENT PICKER: highlight this tank's loadout
    return true;
  }

  function step(dir) {
    if (vehicleLocked) return;
    // Arrows walk the active national fleet only.
    const pool = specs.filter((spec) => inCountry(spec, countryFilter));
    if (!pool.length) return;
    const idx = pool.findIndex((s) => s.id === selectedId);
    const next = pool[(idx + dir + pool.length) % pool.length];
    emit('ui:click', {});
    api.setSelected(next.id);
  }

  function launchBattle(specId, mapId, { emitClick = true, gameMode = battleGameMode } = {}) {
    // Battle entry must be unstoppable: the pre-battle emits fan out to five+
    // subscribers (audio click, pointer-lock grab, killcam/shot-log resets…)
    // and any one of them throwing in an exotic environment would silently
    // block onBattle — a BATTLE button that does nothing is the worst failure
    // mode. Contain their failures; the phase flip always runs.
    try {
      if (emitClick) emit('ui:click', {});
      emit('ui:battleStart', { specId, mapId });
    } catch (err) {
      console.error('[garage] battle-start listener failed:', err);
    }
    if (onBattle) onBattle(specId, mapId, { gameMode }); // MAP-CONFIG WIRING
  }

  function battle() {
    if (!selectedId) return;
    const specId = selectedId;
    const mapId = selectedMapId;
    closeBattleMenu();
    if (opts.onPlayRequest) {
      try { emit('ui:click', {}); } catch (_) { /* presentation-only */ }
      opts.onPlayRequest({
        mode: battleMode,
        gameMode: battleGameMode,
        specId,
        mapId,
        startSolo: () => launchBattle(specId, mapId, {
          emitClick: false,
          gameMode: battleGameMode,
        }),
      });
      return;
    }
    launchBattle(specId, mapId);
  }

  const battleModeMeta = {
    solo: { short: 'BOTS', label: 'Bots', icon: 'battleBots' },
    private: { short: 'CODE', label: 'Private', icon: 'battlePrivate' },
    lan: { short: 'LAN', label: 'LAN', icon: 'battleLan' },
    ranked: { short: 'RANK', label: 'Ranked', icon: 'battleRanked' },
  };
  const battleRuleMeta = {
    capture_the_flag: { short: 'CTF', label: 'Capture the Flag', icon: 'modeFlag' },
    zone_control: { short: '1000', label: 'Zone Control', icon: 'modeZones' },
    turbo_ball: { short: 'BALL', label: 'Turbo Ball', icon: 'modeTurbo' },
    endless_horde: { short: 'WAVE', label: 'Endless Horde', icon: 'modeHorde' },
  };
  function closeBattleMenu({ restoreFocus = false } = {}) {
    battleMenu.classList.remove('open');
    battleModeBtn.setAttribute('aria-expanded', 'false');
    if (restoreFocus) battleModeBtn.focus();
  }
  function openBattleMenu() {
    closeMobileNavigation();
    battleMenu.classList.add('open');
    battleModeBtn.setAttribute('aria-expanded', 'true');
    const activeRule = battleGameMode === 'standard' ? null
      : battleRuleChoices.find((choice) => choice.dataset.gameMode === battleGameMode);
    (activeRule || battleChoices.find((choice) => choice.dataset.mode === battleMode))?.focus();
  }
  function setBattleMode(nextMode) {
    const meta = battleModeMeta[nextMode];
    if (!meta) return;
    battleMode = nextMode;
    if (nextMode === 'solo') battleGameMode = 'standard';
    if (nextMode !== 'solo' && opts.onPlayModeIntent) {
      try { opts.onPlayModeIntent(nextMode); } catch (_) { /* optional warm path */ }
    }
    battleModeBtn.querySelector('span').textContent = meta.short;
    battleBtn.querySelector('.battle-active-icon').innerHTML = uiIconSVG(meta.icon, 20);
    battleModeBtn.setAttribute('aria-label', `Battle type: ${meta.label}. Change battle type`);
    battleBtn.setAttribute('aria-label', `Start ${meta.label} battle`);
    for (const choice of battleChoices) {
      choice.setAttribute('aria-checked', String(choice.dataset.mode === nextMode));
    }
    for (const choice of battleRuleChoices) choice.setAttribute('aria-checked', 'false');
  }
  function setBattleGameMode(nextMode) {
    const id = normalizeGameMode(nextMode);
    const meta = battleRuleMeta[id];
    if (!meta) return;
    battleMode = 'solo';
    battleGameMode = id;
    try { localStorage.setItem('cot.game.mode.v1', id); } catch (_) { /* session-only */ }
    battleModeBtn.querySelector('span').textContent = meta.short;
    battleBtn.querySelector('.battle-active-icon').innerHTML = uiIconSVG(meta.icon, 20);
    battleModeBtn.setAttribute('aria-label', `Battle rules: ${meta.label}. Change battle type`);
    battleBtn.setAttribute('aria-label', `Start ${meta.label}`);
    for (const choice of battleChoices) choice.setAttribute('aria-checked', 'false');
    for (const choice of battleRuleChoices) {
      choice.setAttribute('aria-checked', String(choice.dataset.gameMode === id));
    }
  }

  battleBtn.addEventListener('click', battle);
  const signalBattleIntent = () => {
    if (!selectedId) return;
    try {
      if (battleMode === 'solo') {
        opts.onBattleIntent?.({ specId: selectedId, mapId: selectedMapId });
      } else {
        // Opening a room is not solo-battle intent. Warming the bot roster and
        // current garage map here made the lobby compete with irrelevant
        // terrain generation; transfer only the selected network path.
        opts.onPlayModeIntent?.(battleMode);
      }
    } catch (_) { /* optional warm path */ }
  };
  battleControl.addEventListener('pointerenter', signalBattleIntent, { passive: true });
  battleControl.addEventListener('focusin', signalBattleIntent);
  battleControl.addEventListener('touchstart', signalBattleIntent, { passive: true });
  roomReminder.addEventListener('click', () => emit('ui:roomOpen', {}));
  battleModeBtn.addEventListener('click', () => {
    emit('ui:click', {});
    if (battleMenu.classList.contains('open')) closeBattleMenu();
    else openBattleMenu();
  });
  for (const choice of battleChoices) choice.addEventListener('click', () => {
    emit('ui:click', {});
    setBattleMode(choice.dataset.mode);
    closeBattleMenu({ restoreFocus: true });
  });
  for (const choice of battleRuleChoices) choice.addEventListener('click', () => {
    emit('ui:click', {});
    setBattleGameMode(choice.dataset.gameMode);
    closeBattleMenu({ restoreFocus: true });
  });
  root.addEventListener('pointerdown', (event) => {
    if (!battleControl.contains(event.target)) closeBattleMenu();
  });
  prevVehicleBtn.addEventListener('click', () => step(-1));
  nextVehicleBtn.addEventListener('click', () => step(1));

  // --- DRAG-SCROLL CAROUSEL (garage_ui) -------------------------------------
  // The strip pans 1:1 with a held pointer and coasts with momentum on
  // release; a press that moves less than DRAG_MIN_PX still reads as a plain
  // card click (no accidental drag-selects). Mouse/pen get the JS drag; touch
  // keeps the browser's native pan+fling (touch-action: pan-x in the CSS —
  // the browser takes the gesture over via pointercancel, which lands in the
  // same end handler). Arrows and wheel behavior stay.
  {
    const DRAG_MIN_PX = 5;      // movement below this stays a click
    const COAST_TAU_S = 0.32;   // momentum decay time constant
    const COAST_MAX = 3600;     // px/s flick velocity clamp
    const COAST_MIN = 40;       // px/s — coast ends below this
    let ptrId = -1;
    let startX = 0, startScroll = 0;
    let engaged = false;        // true once the drag threshold is crossed
    let suppressClick = false;  // swallow the click that follows a real drag
    let vel = 0, lastX = 0, lastT = 0;
    let coastRaf = 0;

    const stopCoast = () => {
      if (coastRaf) { cancelAnimationFrame(coastRaf); coastRaf = 0; }
    };
    const coast = () => {
      let prev = performance.now();
      const frame = (now) => {
        coastRaf = 0;
        const dt = Math.min(0.05, Math.max(0.001, (now - prev) / 1000));
        prev = now;
        const before = cardsEl.scrollLeft;
        cardsEl.scrollLeft = before - vel * dt;
        vel *= Math.exp(-dt / COAST_TAU_S);
        // hitting either end of the strip kills the coast (no rubber-band)
        if (cardsEl.scrollLeft === before) vel = 0;
        if (Math.abs(vel) > COAST_MIN) coastRaf = requestAnimationFrame(frame);
      };
      coastRaf = requestAnimationFrame(frame);
    };

    cardsEl.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      stopCoast();
      ptrId = e.pointerId;
      startX = lastX = e.clientX;
      startScroll = cardsEl.scrollLeft;
      lastT = performance.now();
      vel = 0;
      engaged = false;
      suppressClick = false;
    });
    cardsEl.addEventListener('pointermove', (e) => {
      if (e.pointerId !== ptrId) return;
      const dx = e.clientX - startX;
      if (!engaged) {
        if (Math.abs(dx) < DRAG_MIN_PX) return;
        engaged = true;
        cardsEl.classList.add('dragging');
        try { cardsEl.setPointerCapture(ptrId); } catch (_) { /* embedded panes */ }
      }
      cardsEl.scrollLeft = startScroll - dx;  // 1:1 strip follow
      const now = performance.now();
      const dt = Math.max(4, now - lastT) / 1000;
      // EMA over the last ~2-3 pointer events → release flick velocity
      const inst = (e.clientX - lastX) / dt;
      vel = Math.max(-COAST_MAX, Math.min(COAST_MAX, vel * 0.55 + inst * 0.45));
      lastX = e.clientX;
      lastT = now;
    });
    const endStripDrag = (e) => {
      if (e.pointerId !== ptrId) return;
      ptrId = -1;
      if (!engaged) return;
      engaged = false;
      suppressClick = true;
      cardsEl.classList.remove('dragging');
      try { cardsEl.releasePointerCapture(e.pointerId); } catch (_) { /* released */ }
      // a pointer that rested before release has a stale flick — don't coast
      if (performance.now() - lastT < 90 && Math.abs(vel) > COAST_MIN) coast();
    };
    cardsEl.addEventListener('pointerup', endStripDrag);
    cardsEl.addEventListener('pointercancel', endStripDrag);
    // pointer capture retargets the post-drag click at cardsEl itself in most
    // engines, but not all — swallow it in the capture phase either way.
    cardsEl.addEventListener('click', (e) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    }, true);
    // vertical trackpad/mouse wheel pans the strip too (horizontal deltas
    // already pan natively via overflow-x; that path is untouched)
    cardsEl.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      stopCoast();
      cardsEl.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });
  }
  // --- END DRAG-SCROLL CAROUSEL ---------------------------------------------

  // r9.1 header nav — Studio rides the exact F8 production path (studio.js
  // listens on window keydown and gates on game.phase === 'garage'); Home and
  // Docs use their public pretty routes. Garage is the current screen.
  recordTrigger.addEventListener('click', () => {
    emit('ui:click', {});
    if (isRecordOpen()) closeServiceRecord();
    else openServiceRecord();
  });
  recordClose.addEventListener('click', () => {
    emit('ui:click', {});
    closeServiceRecord();
  });
  recordModal.addEventListener('click', (event) => {
    if (event.target === recordModal) closeServiceRecord();
  });
  const openStudio = () => {
    emit('ui:click', {});
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F8' }));
  };
  const openDocs = () => {
    emit('ui:click', {});
    window.location.href = '/docs'; // pretty route (vite.config.js rewrite)
  };
  const openHome = () => {
    emit('ui:click', {});
    window.location.href = '/home'; // pretty route (vite.config.js rewrite)
  };
  root.querySelector('[data-nav="studio"]').addEventListener('click', openStudio);
  root.querySelector('[data-nav="gallery"]').addEventListener('click', () => openSelectedInGallery());
  root.querySelector('[data-nav="docs"]').addEventListener('click', openDocs);
  root.querySelector('[data-nav="home"]').addEventListener('click', openHome);
  root.querySelector('[data-nav="github"]').addEventListener('click', () => {
    emit('ui:click', {});
  });
  for (const studioIntent of root.querySelectorAll(
    '[data-nav="studio"], [data-mobile-nav="studio"]',
  )) {
    const signalStudioIntent = () => {
      try { opts.onStudioIntent?.(); } catch (_) { /* optional warm path */ }
    };
    studioIntent.addEventListener('pointerenter', signalStudioIntent, { passive: true });
    studioIntent.addEventListener('focusin', signalStudioIntent);
    studioIntent.addEventListener('touchstart', signalStudioIntent, { passive: true });
  }
  for (const item of root.querySelectorAll('[data-mobile-nav]')) {
    item.addEventListener('click', () => {
      const destination = item.dataset.mobileNav;
      closeMobileNavigation();
      if (destination === 'home') openHome();
      else if (destination === 'garage') emit('ui:click', {});
      else if (destination === 'studio') openStudio();
      else if (destination === 'gallery') openSelectedInGallery();
      else if (destination === 'docs') openDocs();
      else if (destination === 'record') {
        emit('ui:click', {});
        openServiceRecord();
      }
    });
  }
  function onKey(e) {
    if (!api.isOpen) return;
    if (e.target?.closest?.('.cot-modal')) return;
    if (e.code === 'Escape' && openGaragePanel()) {
      setGaragePanel('', { restoreFocus: true });
      e.preventDefault();
      return;
    }
    if (e.code === 'Escape' && isMobileNavigationOpen()) {
      closeMobileNavigation({ restoreFocus: true });
      e.preventDefault();
      return;
    }
    if (e.code === 'Escape' && battleMenu.classList.contains('open')) {
      closeBattleMenu({ restoreFocus: true });
      e.preventDefault();
      return;
    }
    if (e.code === 'ArrowLeft') { step(-1); e.preventDefault(); }
    else if (e.code === 'ArrowRight') { step(1); e.preventDefault(); }
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (e.target?.closest?.('button,input,select,a,[role="button"]')) return;
      battle();
      e.preventDefault();
    }
  }

  const api = {
    root,
    isOpen: false,

    /**
     * Open the garage screen.
     * @param {string} [selectedId='m1a1'] - initially highlighted tank id.
     */
    show(selected = 'm1a1') {
      refreshServiceRecord();
      setGaragePanel('');
      root.style.display = 'block';
      // garage_ui entrance: re-arm the chrome fade/rise on every open (boot
      // and battle-exit both used to hard-cut the whole screen in one frame).
      // Do not force `offsetWidth` here: after a battle that synchronously
      // lays out the complete hidden garage (fleet cards, dossiers, pickers,
      // service record) and has produced multi-second transition freezes.
      // The transition veil already gives us a frame boundary, so re-attach
      // the animation class on that boundary instead.
      root.classList.remove('enter');
      requestAnimationFrame(() => {
        if (api.isOpen) root.classList.add('enter');
      });
      if (!api.isOpen) window.addEventListener('keydown', onKey);
      api.isOpen = true;
      api.setSelected(specById.has(selected) ? selected : selectedId);
      statsEl.scrollTop = 0;
      // The hidden garage reports a zero-width rail during initial creation.
      // Re-measure after display:block so the first visible frame gets honest
      // left/right fades and controls without waiting for a resize or scroll.
      queueCountryRailAffordances();
    },

    /** Close the garage screen. */
    hide() {
      customCamoStudioAccess?.peek()?.close({ restoreFocus: false, immediate: true });
      closeServiceRecord({ restoreFocus: false });
      closeMobileNavigation();
      closeBattleMenu();
      setGaragePanel('');
      root.style.display = 'none';
      if (api.isOpen) window.removeEventListener('keydown', onKey);
      api.isOpen = false;
    },

    /** Normalize packaged tank portraits (screenshot compatibility). */
    drainThumbs() { drainTankThumbs(); },

    /** UI-free rectangle reserved for the 3D showroom hero (CSS pixels). */
    getStageRect() {
      const rr = root.getBoundingClientRect();
      const left = root.querySelector('.cot-leftcol')?.getBoundingClientRect();
      const stats = statsEl.getBoundingClientRect();
      const carousel = root.querySelector('.cot-carousel')?.getBoundingClientRect();
      const reservePanels = !isOverlayPanelLayout();
      const x0 = reservePanels && left && left.width ? left.right + 14 : rr.left + 18;
      const x1 = reservePanels && stats.width ? stats.left - 14 : rr.right - 18;
      const y0 = rr.top + (isOverlayPanelLayout() ? 66 : 78);
      const y1 = Math.min(rr.bottom, carousel && carousel.height ? carousel.top - 14 : rr.bottom - 190);
      return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
    },

    /**
     * Highlight a tank in the carousel and refresh the stats card; calls onSelect.
     * @param {string} specId
     */
    setSelected(specId) {
      if (vehicleLocked) {
        if (specId === selectedId) applySelection(specId);
        return;
      }
      if (applySelection(specId) && onSelect) onSelect(specId);
    },

    /** Currently highlighted vehicle id (probe/tooling hook). @returns {?string} */
    getSelected() { return selectedId; },

    /** Adjacent cards in the active national carousel, forward then back. */
    getNeighborIds(radius = 2) {
      const selected = specById.get(selectedId);
      if (!selected) return [];
      const pool = specs.filter((spec) => countryCodeOf(spec) === countryCodeOf(selected));
      const index = pool.findIndex((spec) => spec.id === selectedId);
      if (index < 0 || pool.length < 2) return [];
      const result = [];
      for (let distance = 1; distance <= Math.min(radius, pool.length - 1); distance++) {
        for (const offset of [distance, -distance]) {
          const id = pool[(index + offset + pool.length) % pool.length]?.id;
          if (id && id !== selectedId && !result.includes(id)) result.push(id);
        }
      }
      return result;
    },

    /** Reflect persistent multiplayer membership beneath the main battle action. */
    setRoomStatus(status = null) {
      if (!status) {
        roomReminder.classList.remove('show', 'ready');
        roomReminder.querySelector('.rr-copy').textContent = '';
        vehicleLocked = false;
        root.classList.remove('vehicle-locked');
        return;
      }
      const ready = !!status.ready;
      const count = Math.max(0, Number(status.readyCount) || 0);
      const total = Math.max(0, Number(status.total) || 0);
      roomReminder.querySelector('.rr-copy').innerHTML =
        `<b>${status.mode === 'lan' ? 'LAN' : 'PRIVATE'} ROOM ${status.roomCode || ''}</b> · ` +
        `${ready ? 'READY' : 'NOT READY'} · ${count}/${total} READY`;
      roomReminder.classList.add('show');
      roomReminder.classList.toggle('ready', ready);
      roomReminder.setAttribute('aria-label',
        `Open room ${status.roomCode || ''}. You are ${ready ? 'ready' : 'not ready'}. ${count} of ${total} ready.`);
      vehicleLocked = ready;
      root.classList.toggle('vehicle-locked', vehicleLocked);
      closeEqPicker();
    },

    isVehicleLocked() { return vehicleLocked; },

    /** Move the settings-owned gear into the garage navigation rail. */
    attachSettingsControl(control) {
      const slot = root.querySelector('.cot-settings-slot');
      if (slot && control) slot.replaceChildren(control);
    },

    // --- MAP-CONFIG WIRING ---
    /** Currently selected battlefield id ('random' allowed). @returns {string} */
    getSelectedMap() { return selectedMapId; },

    /** Enter the currently selected solo battle without reopening the play menu. */
    startSolo() {
      if (selectedId) launchBattle(selectedId, selectedMapId);
    },

    /**
     * Highlight a battlefield in the map picker.
     * @param {string} mapId map id or 'random'
     */
    setSelectedMap(mapId) {
      if (!mapCardById.has(mapId)) return;
      selectedMapId = mapId;
      for (const [id, card] of mapCardById) card.classList.toggle('sel', id === mapId);
      if (opts.onMapSelect) opts.onMapSelect(mapId);   // CAMO WIRING: AUTO preview
      // Keep packaged portraits healthy after the biome/camo transition.
      requeueTankThumbs();
    },
  };

  if (mapCardById.size) api.setSelectedMap(selectedMapId);

  applyCountryFilter(countryFilter);
  if (selectedId) applySelection(selectedId);
  return api;
}
