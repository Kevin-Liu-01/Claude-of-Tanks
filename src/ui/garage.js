// src/ui/garage.js — full-screen garage/tank-select overlay: dark gradient
// frame with a transparent center band (the 3D pedestal shows through),
// bottom tank carousel, right stats card, top-center BATTLE button.
// Contract: docs/ARCHITECTURE.md §3.7.3.

import { FONT_STACK, FONT_COND, ensureFonts } from './fonts.js';
import { ensureStyle } from './dom.js';
import { FEATURED_SHOTS } from './featuredShots.js';
import { preloadImage, preloadImageWhenIdle } from './imagePreload.js';
import { flagIconHTML, flagIconUrl } from './flags.js';
import { flagIconCode } from './flagCodes.js';
import { iconUrl } from './icons.js';
import { ensureTankThumbs, drainTankThumbs, getTankThumb, requeueTankThumbs } from './tankThumbs.js';
// CAMO PICKER SECTION: swatches preview the REAL resolved pattern (scheme +
// palette from materials.js) instead of hand-approximated CSS gradients.
import { resolveCamoVisual, CLAUDE_CODE_MARK, CLAUDE_SPARK_MARK }
  from '../vehicles/materials.js';
import {
  CUSTOM_CAMO_ID, customCamoPatternId, normalizeCustomCamo,
} from '../vehicles/camoPolicy.js';
import { createInfoButton } from './contextInfo.js';
import { createModal } from './modal.js';
import {
  CUSTOM_CAMO_ASSETS, paintCustomCamoStrokes,
} from '../vehicles/customCamoCanvas.js';
// EQUIPMENT SYSTEM: full catalog + slot logic (game/equipment.js), the
// white-silhouette icon set (equipIcons.js), and the spotting-side math the
// stat card folds into its view/camo rows so the garage can never disagree
// with the battle sim.
import {
  EQUIPMENT_CATALOG, EQUIPMENT_BY_ID, EQUIP_SLOTS, EQUIP_CATEGORIES,
  loadEquipment, saveEquipment, equipEligible, computeEquipMults,
} from '../game/equipment.js';
import { equipIconSVG } from './equipIcons.js';
import { uiIconSVG } from './uiIcons.js';
import { shellIconSVG } from './shellIcons.js';
import {
  garageCrewRows, garageGalleryHref, garageModuleRows, garageSpecialSystem, garageStatGroup,
} from './garageDossier.js';
import { createRandomMapMosaic } from './randomPreviews.js';
import {
  compareCountryThenTierThenName, countryFilterGroups, defaultGarageMapId,
  horizontalRailState, horizontalRailWheelDelta,
} from './garageOrder.js';
import { isGarageVisibleTankId } from '../game/matchmaking.js';
import { tankTier, tierNumeral } from '../vehicles/tier.js';
import { vehicleEraLabel } from '../vehicles/taxonomy.js';
import { getPlayerRecord } from '../game/profile.js';
import { mountGitHubStars } from './githubStars.js';
import {
  viewRangeOf, baseCamoOf, equipViewMult, equipCamoBonus,
} from '../sim/spotting.js';

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

const GARAGE_CSS = `
.cot-garage{--cot-garage-sidebar-width:280px;position:fixed;inset:0;z-index:60;display:none;font-family:${FONT_STACK};
  color:#e6edf3;-webkit-user-select:none;user-select:none;overflow:hidden;pointer-events:none;}
.cot-garage *{box-sizing:border-box;margin:0;padding:0;}
.cot-garage .band-top{position:absolute;left:0;right:0;top:0;height:26%;
  background:linear-gradient(180deg,rgba(5,8,11,.94) 0%,rgba(5,8,11,.78) 55%,rgba(5,8,11,0) 100%);}
.cot-garage .band-bot{position:absolute;left:0;right:0;bottom:0;height:36%;
  background:linear-gradient(0deg,rgba(5,8,11,.96) 0%,rgba(5,8,11,.82) 55%,rgba(5,8,11,0) 100%);}
.cot-garage .band-l{position:absolute;left:0;top:0;bottom:0;width:14%;
  background:linear-gradient(90deg,rgba(5,8,11,.8),rgba(5,8,11,0));}
.cot-garage .band-r{position:absolute;right:0;top:0;bottom:0;width:30%;
  background:linear-gradient(270deg,rgba(5,8,11,.85) 0%,rgba(5,8,11,.35) 60%,rgba(5,8,11,0) 100%);}
.cot-brand-rail{position:absolute;top:20px;left:34px;height:36px;display:flex;align-items:center;
  gap:14px;pointer-events:auto;}
.cot-garage .title{position:static;font-size:17px;font-weight:800;
  letter-spacing:.20em;color:#9fb0bf;text-transform:uppercase;
  display:flex;align-items:center;gap:10px;}
.cot-garage .title > span{word-spacing:-.36em;}
.cot-garage .title b{color:#f0a030;}
/* garage_ui: compact brand badge (v3 colored crest, tank + Claude Code
   commander, same art as the boot splash; public/brand/logo-mark.svg)
   instead of bare text */
.cot-garage .title .mark{display:block;width:36px;height:36px;flex:0 0 auto;
  filter:drop-shadow(0 2px 4px rgba(0,0,0,.55));}
/* Vehicle identity remains solely on the stats card; the brand rail is
   reserved for product identity and quiet player-level destinations. */
/* Header hierarchy: personal destinations sit with the brand at left, while
   workspace navigation stays at right and BATTLE owns the center. This keeps
   the primary action legible without compressing every destination together. */
.cot-brand-utilities{height:32px;display:flex;align-items:stretch;gap:3px;padding-left:14px;
  border-left:1px solid rgba(146,164,180,.24);}
.cot-nav{position:absolute;top:20px;right:26px;display:flex;align-items:stretch;gap:4px;
  height:34px;pointer-events:auto;z-index:8;}
.cot-header-nav .nv{font-family:${FONT_STACK};font-size:8.5px;font-weight:800;
  letter-spacing:.18em;text-transform:uppercase;color:#8a97a3;cursor:pointer;
  display:inline-flex;align-items:center;gap:6px;
  padding:0 6px;background:rgba(11,15,20,.72);
  border:1px solid rgba(146,164,180,.28);border-bottom-width:2px;
  text-decoration:none;transition:color .15s,border-color .15s,background .15s,transform .15s ease-out;}
.cot-header-nav .nv:active{transform:scale(.97);}
@media (hover:hover) and (pointer:fine){
  .cot-header-nav .nv:hover{color:#ffd27a;border-color:rgba(240,176,74,.6);}
}
.cot-header-nav .nv.on{color:#f0b04a;border-color:rgba(240,176,74,.55);
  background:rgba(24,19,11,.82);cursor:default;}
.cot-brand-utilities .nv{background:rgba(8,12,16,.58);border-color:rgba(146,164,180,.22);}
/* Product destinations use the same authored marks as the public navigation. */
.cot-header-nav .nv .nvi{width:13px;height:13px;display:block;object-fit:contain;}
.cot-header-nav .nv .nvi-product{width:18px;height:16px;}
.cot-header-nav .nv .nav-label{display:inline;}
.cot-header-nav .cot-record-trigger{position:relative;}
.cot-header-nav .cot-record-trigger[aria-expanded='true']{color:#ffd27a;border-color:#f0a030;
  background:rgba(35,24,10,.94);}
.cot-header-nav .record-badge{min-width:17px;height:16px;padding:0 4px;display:inline-grid;place-items:center;
  color:#1a1105;background:#f0a030;border:1px solid #ffc46b;font:900 7px ${FONT_COND};
  line-height:1;letter-spacing:0;box-shadow:0 0 12px rgba(240,160,48,.2);}
.cot-nav .cot-github{position:relative;padding-inline:8px;}
.cot-nav .github-stars{padding-left:6px;border-left:1px solid rgba(146,164,180,.28);
  color:#f0b04a;font:900 7px ${FONT_COND};letter-spacing:.04em;font-variant-numeric:tabular-nums;}
.cot-nav .cot-settings-slot{width:34px;height:34px;flex:0 0 auto;}
.cot-nav .cot-gear{position:static;width:34px;height:34px;min-height:34px;z-index:auto;
  right:auto;top:auto;}
.cot-header-nav .nv:focus-visible,.cot-mobile-nav-menu button:focus-visible{
  outline:2px solid #ffd27a;outline-offset:2px;}
.cot-nav .cot-mobile-nav-trigger,.cot-mobile-nav-menu{display:none;}
.cot-mobile-nav-menu[hidden]{display:none !important;}
.cot-mobile-nav-menu{position:absolute;top:calc(100% + 8px);right:0;width:238px;padding:7px;
  max-height:calc(100vh - 118px);overflow-y:auto;overscroll-behavior:contain;
  background:linear-gradient(155deg,rgba(17,23,29,.99),rgba(6,10,14,.99));
  border:1px solid rgba(166,184,199,.38);
  box-shadow:0 22px 60px rgba(0,0,0,.72),0 0 0 1px rgba(0,0,0,.55) inset;}
.cot-mobile-nav-menu::before{content:'Navigate';padding:6px 8px 7px;color:#f0b04a;
  font:900 7px ${FONT_COND};letter-spacing:.22em;text-transform:uppercase;}
.cot-mobile-nav-menu button{width:100%;min-height:44px;padding:7px 9px;display:grid;
  grid-template-columns:24px 1fr;align-items:center;gap:9px;text-align:left;cursor:pointer;
  color:#aebac4;background:rgba(255,255,255,.015);border:1px solid rgba(146,164,180,.16);
  font-family:${FONT_STACK};}
.cot-mobile-nav-menu button + button{margin-top:3px;}
.cot-mobile-nav-menu button[aria-current='page']{color:#ffd27a;border-color:rgba(240,176,74,.38);
  background:rgba(38,27,12,.72);}
.cot-mobile-nav-menu button img,.cot-mobile-nav-menu button svg{width:20px;height:20px;
  object-fit:contain;justify-self:center;}
.cot-mobile-nav-copy{display:flex;flex-direction:column;gap:2px;min-width:0;}
.cot-mobile-nav-copy strong{font-size:8px;letter-spacing:.15em;text-transform:uppercase;}
.cot-mobile-nav-copy small{color:#71808c;font:700 7px ${FONT_COND};letter-spacing:.08em;
  text-transform:uppercase;}
@media (hover:hover) and (pointer:fine){
  .cot-mobile-nav-menu button:hover{color:#fff0cf;border-color:rgba(240,176,74,.5);
    background:rgba(240,160,48,.08);}
}
/* LOCAL SERVICE RECORD: the old top-left micro-card now lives behind a real
   top-bar control. The modal reports only durable local match history. */
.cot-record-modal{position:absolute;inset:0;z-index:90;display:none;place-items:center;
  padding:24px;pointer-events:auto;background:rgba(3,6,9,.76);
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);}
.cot-record-modal.open{display:grid;}
.cot-record-dialog{position:relative;width:min(720px,calc(100vw - 48px));max-height:calc(100vh - 48px);
  overflow-y:auto;overscroll-behavior:contain;color:#dce6ee;
  background:linear-gradient(155deg,rgba(18,24,30,.99),rgba(7,11,15,.99) 70%);
  border:1px solid rgba(166,184,199,.38);
  box-shadow:0 28px 90px rgba(0,0,0,.78),0 0 0 1px rgba(0,0,0,.6) inset;
  scrollbar-width:thin;scrollbar-color:rgba(146,164,180,.45) rgba(8,11,14,.6);}
.cot-record-dialog::before{content:'';position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(circle at 12% 0,rgba(240,160,48,.12),transparent 38%),
    linear-gradient(115deg,transparent 0 63%,rgba(255,255,255,.022) 63% 64%,transparent 64%);}
.cot-record-dialog::-webkit-scrollbar{width:5px;}
.cot-record-dialog::-webkit-scrollbar-track{background:rgba(8,11,14,.6);}
.cot-record-dialog::-webkit-scrollbar-thumb{background:rgba(146,164,180,.45);}
.cot-record-head{position:relative;display:flex;align-items:flex-start;justify-content:space-between;
  padding:22px 24px 18px;border-bottom:1px solid rgba(146,164,180,.18);}
.cot-record-head .eyebrow,.cot-stat-title{font:900 8px ${FONT_COND};
  letter-spacing:.24em;text-transform:uppercase;color:#f0b04a;}
.cot-record-head h2{margin-top:5px;font-size:24px;letter-spacing:.025em;color:#f3f7fa;}
.cot-record-head p{margin-top:5px;font:700 9px ${FONT_COND};letter-spacing:.12em;
  text-transform:uppercase;color:#8293a1;}
.cot-record-close{width:34px;height:34px;display:grid;place-items:center;cursor:pointer;
  color:#9fb0bf;background:rgba(8,12,16,.72);border:1px solid rgba(146,164,180,.28);
  font:400 22px/1 ${FONT_STACK};transition:color .12s,border-color .12s,background .12s;}
.cot-record-close:hover{color:#ffd27a;border-color:rgba(240,176,74,.65);background:rgba(35,24,10,.8);}
.cot-record-body{position:relative;padding:22px 24px 24px;}
.cot-record-overview{display:grid;grid-template-columns:180px 1fr;gap:22px;align-items:center;}
.cot-record-ring{--record-pct:0;position:relative;width:164px;aspect-ratio:1;border-radius:50%;
  display:grid;place-items:center;margin:auto;
  background:conic-gradient(#f0a030 calc(var(--record-pct) * 1%),rgba(255,255,255,.075) 0);
  box-shadow:0 0 34px rgba(240,160,48,.1);}
.cot-record-ring::before{content:'';position:absolute;inset:10px;border-radius:50%;
  background:radial-gradient(circle at 50% 35%,#141b22,#090d11 70%);
  border:1px solid rgba(146,164,180,.22);}
.cot-record-ring-copy{position:relative;text-align:center;}
.cot-record-ring-copy strong{display:block;color:#f4f7fa;font-size:37px;line-height:1;
  font-variant-numeric:tabular-nums;letter-spacing:-.04em;}
.cot-record-ring-copy span{display:block;margin-top:7px;color:#8fa0ad;font:900 8px ${FONT_COND};
  letter-spacing:.22em;text-transform:uppercase;}
.cot-record-outcomes{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
.cot-record-outcome,.cot-record-metric{padding:12px 13px;
  background:linear-gradient(180deg,rgba(23,30,37,.72),rgba(10,14,18,.82));
  border:1px solid rgba(146,164,180,.18);}
.cot-record-outcome span,.cot-record-metric span{display:block;color:#7f909e;font:900 7.5px ${FONT_COND};
  letter-spacing:.17em;text-transform:uppercase;}
.cot-record-outcome strong{display:block;margin-top:6px;font-size:20px;color:#eef4f9;
  font-variant-numeric:tabular-nums;}
.cot-record-outcome.win strong{color:#ffc66c;}
.cot-record-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px;}
.cot-record-metric{min-height:77px;}
.cot-record-metric strong{display:block;margin-top:8px;color:#eef4f9;font-size:18px;
  line-height:1;font-variant-numeric:tabular-nums;}
.cot-record-metric small{display:block;margin-top:5px;color:#6f808d;font:700 7px ${FONT_COND};
  letter-spacing:.08em;text-transform:uppercase;}
.cot-last-battle{margin-top:18px;padding:15px 16px;
  background:linear-gradient(90deg,rgba(240,160,48,.075),rgba(13,18,23,.72));
  border:1px solid rgba(146,164,180,.18);border-left:2px solid #f0a030;}
.cot-last-battle-head{display:flex;justify-content:space-between;gap:12px;align-items:baseline;
  margin-bottom:11px;color:#8a9aa7;font:900 7.5px ${FONT_COND};letter-spacing:.18em;text-transform:uppercase;}
.cot-last-battle-head strong{color:#f0b04a;font-size:9px;}.cot-last-battle-head time{letter-spacing:.08em;}
.cot-last-battle-grid{display:grid;grid-template-columns:minmax(130px,1.4fr) repeat(3,1fr);gap:12px;}
.cot-last-battle-grid div{min-width:0;}.cot-last-battle-grid span{display:block;color:#758592;
  font:900 7px ${FONT_COND};letter-spacing:.15em;text-transform:uppercase;}
.cot-last-battle-grid b{display:block;margin-top:5px;color:#dfe8ef;font-size:11px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums;}
.cot-record-empty{padding:28px;text-align:center;color:#8293a1;font:800 10px ${FONT_COND};
  letter-spacing:.12em;text-transform:uppercase;border:1px dashed rgba(146,164,180,.24);}
/* r7: ONE flat orange plate, no gloss, no bevel highlight, no text shadow —
   the r5 two-stop gradient + inset bevels + letterform shadow still read as
   2012 Flash-game chrome, and the clip-path chamfer aliased at 1080p. The
   chamfered plate is now an SVG background (rasterized with proper edge
   anti-aliasing) carrying only a 1px outline and a darker bottom edge. */
.cot-battle-control{position:absolute;top:26px;left:50%;transform:translateX(-50%);
  pointer-events:auto;width:252px;height:46px;display:flex;z-index:4;
  background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 252 46'%3E%3Cpath d='M11.2 .5H240.8L251.5 23 240.8 45.5H11.2L.5 23Z' fill='%23ee8912' stroke='%238a4a06' stroke-width='1'/%3E%3Cpath d='M1.4 24.8 11.8 45.1h228.4l10.4-20.3' fill='none' stroke='%23a85a05' stroke-width='2' opacity='.9'/%3E%3C/svg%3E") 0 0/100% 100% no-repeat;
  transition:filter .12s,transform .06s;}
.cot-battle-control:hover{filter:brightness(1.07);}
.cot-battle,.cot-battle-mode{height:100%;cursor:pointer;border:0;outline:0;color:#fff8ee;
  background:transparent;font-family:${FONT_STACK};font-weight:800;text-shadow:none;}
.cot-battle{flex:0 0 75%;min-width:0;padding:0 0 1px 10px;font-size:19px;letter-spacing:.24em;
  display:flex;align-items:center;justify-content:center;gap:9px;}
.cot-battle .battle-active-icon{width:21px;height:21px;display:grid;place-items:center;
  color:#fff3dc;filter:drop-shadow(0 1px 0 rgba(92,45,0,.35));}
.cot-battle .battle-active-icon svg{display:block;width:20px;height:20px;}
.cot-battle .battle-word{text-indent:.24em;}
.cot-battle-mode{position:relative;flex:0 0 25%;min-width:0;padding:1px 9px 0 2px;border-left:1px solid rgba(108,55,2,.62);
  font-size:8px;letter-spacing:.09em;text-align:center;}
.cot-battle-mode::after{content:'';position:absolute;right:9px;top:50%;margin-top:-2px;
  border-left:3px solid transparent;border-right:3px solid transparent;border-top:4px solid currentColor;
  opacity:.82;transition:transform .12s;}
.cot-battle-mode[aria-expanded='true']::after{transform:rotate(180deg);}
.cot-battle:active,.cot-battle-mode:active{transform:translateY(1px);}
.cot-battle-menu{position:absolute;top:calc(100% + 7px);right:0;width:206px;display:none;
  padding:5px;background:rgba(8,11,15,.98);border:1px solid rgba(177,194,208,.32);
  box-shadow:0 12px 34px rgba(0,0,0,.68);}
.cot-battle-menu.open{display:grid;gap:3px;}
.cot-room-reminder{position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);
  display:none;width:max-content;max-width:360px;min-height:32px;padding:0 12px;border:1px solid rgba(230,154,54,.5);
  background:linear-gradient(90deg,rgba(12,18,24,.96),rgba(39,27,14,.96));color:#dbe5ec;
  box-shadow:0 10px 30px rgba(0,0,0,.46);font:800 8px ${FONT_COND};letter-spacing:.12em;
  text-transform:uppercase;cursor:pointer;white-space:nowrap}.cot-room-reminder.show{display:flex;align-items:center;gap:9px}
.cot-room-reminder .rr-dot{width:7px;height:7px;border-radius:50%;background:#e5a347;box-shadow:0 0 12px #e5a347}
.cot-room-reminder.ready .rr-dot{background:#73d58a;box-shadow:0 0 12px #73d58a}.cot-room-reminder b{color:#ffca78}
.cot-garage-tools,.cot-garage-panel-scrim{display:none}
.cot-garage-tools{position:absolute;z-index:12;pointer-events:auto;align-items:stretch;gap:4px}
.cot-garage-tool{min-width:0;height:44px;padding:0 12px;display:flex;align-items:center;justify-content:center;gap:8px;
  border:1px solid rgba(156,177,193,.3);border-bottom:2px solid rgba(156,177,193,.36);
  background:linear-gradient(180deg,rgba(17,23,29,.96),rgba(7,11,15,.97));color:#a8b7c2;
  font:900 7.5px ${FONT_COND};letter-spacing:.13em;text-transform:uppercase;cursor:pointer;
  box-shadow:0 6px 18px rgba(0,0,0,.32);transition:color .14s,border-color .14s,background .14s,transform .12s}
.cot-garage-tool svg{width:17px;height:17px;flex:0 0 auto;color:#d89531}
.cot-garage-tool:active{transform:scale(.97)}
.cot-garage-tool[aria-expanded='true']{color:#ffe0aa;border-color:#f0a030;border-bottom-color:#f0a030;
  background:linear-gradient(180deg,rgba(49,34,15,.98),rgba(20,14,8,.98));box-shadow:0 0 18px rgba(240,160,48,.16)}
@media (hover:hover) and (pointer:fine){
  .cot-garage-tool:hover{color:#ffe0aa;border-color:rgba(240,176,74,.7)}
}
.cot-garage-panel-scrim{position:absolute;z-index:9;inset:0;border:0;background:rgba(3,6,9,.46);
  pointer-events:auto;cursor:default;backdrop-filter:blur(2px)}
.cot-garage.vehicle-locked .cot-card:not(.sel),.cot-garage.vehicle-locked .cot-car-arrow,
.cot-garage.vehicle-locked .cot-camo-card,.cot-garage.vehicle-locked .eqrow{pointer-events:none;opacity:.42}
.cot-garage.vehicle-locked .cot-card.sel{cursor:not-allowed}.cot-garage.vehicle-locked .stats::after{content:'VEHICLE LOCKED · UNREADY TO CHANGE';
  display:block;margin-top:8px;color:#79d890;font:800 8px ${FONT_COND};letter-spacing:.13em}
.cot-battle-choice{min-height:48px;display:grid;grid-template-columns:28px 1fr auto;align-items:center;
  gap:8px;padding:0 10px 0 8px;border:1px solid transparent;background:rgba(25,32,39,.9);
  color:#dce6ed;cursor:pointer;text-align:left;font-family:${FONT_STACK};font-size:11px;font-weight:800;}
.cot-battle-choice .choice-icon{width:28px;height:28px;display:grid;place-items:center;color:#899aa8;
  border:1px solid rgba(146,164,180,.16);background:rgba(7,11,15,.46);}
.cot-battle-choice .choice-icon svg{display:block;width:17px;height:17px;}
.cot-battle-choice .choice-name{letter-spacing:.045em;}
.cot-battle-choice small{font:800 7px ${FONT_COND};letter-spacing:.13em;color:#82929f;
  text-transform:uppercase;}
.cot-battle-choice:hover,.cot-battle-choice[aria-checked='true']{border-color:rgba(240,176,74,.62);
  background:rgba(230,139,26,.13);color:#ffd28e;}
.cot-battle-choice:hover .choice-icon,.cot-battle-choice[aria-checked='true'] .choice-icon{
  color:#ffc66c;border-color:rgba(240,176,74,.42);background:rgba(230,139,26,.12);}
.cot-garage .stats{position:absolute;right:22px;top:86px;width:var(--cot-garage-sidebar-width);padding:0;pointer-events:auto;
  background:transparent;border:0;box-shadow:none;}
.cot-garage .stats::before{display:none;}
.cot-dossier-head{position:relative;padding:14px 16px 13px;min-height:104px;margin-bottom:8px;
  background:linear-gradient(150deg,rgba(22,28,34,.97),rgba(8,11,14,.97) 72%);
  border:1px solid rgba(166,184,199,.3);
  box-shadow:0 14px 36px rgba(0,0,0,.48),inset 0 0 0 1px rgba(255,255,255,.015);}
.cot-dossier-head::before{content:'';position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(circle at 86% 0,rgba(240,160,48,.105),transparent 30%);}
.cot-dossier-title{display:flex;align-items:center;gap:9px;padding-right:78px;}
.cot-tier-plate{height:25px;min-width:31px;padding:0 6px;display:grid;place-items:center;
  color:#161007;background:linear-gradient(180deg,#ffc466,#d88b24);border:1px solid #ffd18a;
  font:900 10px ${FONT_COND};letter-spacing:.06em;box-shadow:0 4px 12px rgba(0,0,0,.32);}
.cot-garage .stats h3{font-size:17px;font-weight:750;letter-spacing:.015em;color:#f3f7fa;
  min-width:0;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cot-garage .stats .sub{font-size:8px;font-weight:800;letter-spacing:.17em;color:#94a5b2;
  text-transform:uppercase;margin:7px 0 0 40px;display:flex;align-items:center;gap:7px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cot-garage .stats .sub .cot-flag{display:block;object-fit:cover;
  box-shadow:0 1px 3px rgba(0,0,0,.5);}
.cot-garage .stats .stats-ti{position:absolute;right:47px;top:17px;width:34px;height:22px;
  object-fit:contain;pointer-events:none;opacity:.82;
  filter:drop-shadow(0 4px 6px rgba(0,0,0,.78));}
.cot-gallery-link{width:100%;height:30px;margin-top:11px;padding:0 9px;display:flex;align-items:center;gap:8px;
  color:#b6c5d0;background:linear-gradient(90deg,rgba(240,160,48,.1),rgba(20,27,34,.7));
  border:1px solid rgba(240,176,74,.3);cursor:pointer;text-align:left;font:900 7.5px ${FONT_COND};
  letter-spacing:.14em;text-transform:uppercase;transition:color .14s,border-color .14s,background .14s;}
.cot-gallery-link svg{width:15px;height:15px;color:#f0a030;flex:0 0 auto;}
.cot-gallery-link .go{margin-left:auto;color:#f0a030;font-size:13px;line-height:1;}
.cot-gallery-link:hover,.cot-gallery-link:focus-visible{color:#fff0d7;border-color:#f0a030;
  background:linear-gradient(90deg,rgba(240,160,48,.2),rgba(32,24,12,.86));outline:none;}
.cot-stat-section{position:relative;padding:13px 15px 15px;margin-bottom:8px;
  background:linear-gradient(155deg,rgba(16,22,28,.96),rgba(7,10,13,.96) 76%);
  border:1px solid rgba(146,164,180,.2);box-shadow:0 10px 28px rgba(0,0,0,.36);}
.cot-stat-section:last-child{margin-bottom:0;}
.cot-stat-title{margin-bottom:10px;color:#8fa0ad;display:flex;align-items:center;gap:7px;}
.cot-stat-title svg{width:13px;height:13px;color:#f0a030;flex:0 0 auto;}
.cot-stat-title span{min-width:0;}
.cot-stat-title small{margin-left:auto;color:#596975;font:800 6.5px ${FONT_COND};
  letter-spacing:.1em;text-transform:uppercase;}
.cot-performance-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;}
.cot-garage .srow{position:relative;min-width:0;min-height:50px;padding:8px 8px 8px 36px;
  background:linear-gradient(145deg,rgba(23,30,37,.72),rgba(10,14,18,.82));
  border:1px solid rgba(146,164,180,.13);overflow:hidden;}
.cot-garage .srow .sicon{position:absolute;left:8px;top:10px;width:20px;height:20px;display:grid;
  place-items:center;color:#d99531;background:rgba(240,160,48,.07);border:1px solid rgba(240,176,74,.12);}
.cot-garage .srow .sicon svg{width:15px;height:15px;}
.cot-garage .srow .lr{display:flex;flex-direction:column;gap:2px;font-size:7px;
  letter-spacing:.11em;color:#7f909d;text-transform:uppercase;white-space:nowrap;}
/* r4: VALUE cells escape the row's uppercase transform — SI units are
   case-sensitive ("6.0 s", "67 km/h", not "6.0 S" / "67 KM/H") */
.cot-garage .srow .lr b{min-width:0;color:#edf3f7;font-size:11px;font-weight:750;
  font-variant-numeric:tabular-nums;letter-spacing:.01em;text-transform:none;overflow:hidden;text-overflow:ellipsis;}
.cot-garage .srow .track{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.06);overflow:hidden;}
.cot-garage .srow .fill{height:100%;background:linear-gradient(90deg,#b87425,#f0b04a);
  box-shadow:0 0 8px rgba(240,160,48,.18);}
.cot-garage .shellhead{display:grid;grid-template-columns:46px minmax(0,1fr) 62px 48px;
  gap:7px;padding:0 7px 5px;color:#637481;font:900 6.5px ${FONT_COND};
  letter-spacing:.12em;text-transform:uppercase;}
.cot-garage .shellhead span:nth-last-child(-n+2){text-align:right;}
.cot-garage .magazine-spec{display:flex;align-items:center;justify-content:space-between;
  gap:10px;margin:0 0 9px;padding:7px 8px;border-left:2px solid #e79c34;
  background:rgba(231,156,52,.08);color:#8798a5;font:800 7px ${FONT_COND};
  letter-spacing:.09em;text-transform:uppercase;}
.cot-garage .magazine-spec b{color:#edf3f6;font:750 9px ${FONT_STACK};
  letter-spacing:.01em;text-transform:none;font-variant-numeric:tabular-nums;}
.cot-garage .shellrow{display:grid;grid-template-columns:46px minmax(0,1fr) 62px 48px;
  gap:7px;align-items:center;min-height:46px;margin-top:5px;padding:6px 7px;
  color:#c6d2dc;background:linear-gradient(90deg,rgba(19,25,31,.78),rgba(11,15,19,.7));
  border:1px solid rgba(146,164,180,.13);border-left:2px solid color-mix(in srgb,var(--shell-color) 78%,#252c31);}
.cot-garage .shellkind{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;
  color:var(--shell-color);}
.cot-garage .shellkind svg{width:15px;height:22px;flex:0 0 auto;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55));}
.cot-garage .shellrow .ty{font:900 7px ${FONT_COND};letter-spacing:.05em;}
.cot-garage .shellrow .nm{min-width:0;color:#e6edf3;font-size:9px;font-weight:650;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;}
.cot-garage .shellrow .nm small{display:block;margin-top:2px;color:#71818e;font:700 6px ${FONT_COND};
  letter-spacing:.04em;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;}
.cot-garage .shellmetric{text-align:right;color:#7f909d;font:700 6px ${FONT_COND};
  letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;}
.cot-garage .shellmetric b{display:block;margin-bottom:1px;color:#e6edf3;font:700 9px ${FONT_STACK};
  letter-spacing:0;text-transform:none;font-variant-numeric:tabular-nums;}
.cot-garage .armor-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;}
.cot-garage .armorline{position:relative;min-width:0;min-height:54px;padding:9px 8px 8px 38px;color:#7f909d;
  text-transform:uppercase;background:rgba(19,25,31,.62);border:1px solid rgba(146,164,180,.12);}
.cot-garage .armorline svg{position:absolute;left:9px;top:11px;width:19px;height:19px;color:#c88b35;}
.cot-garage .armorline span{display:block;font:900 6.5px ${FONT_COND};letter-spacing:.13em;}
.cot-garage .armorline b{display:block;margin-top:5px;color:#e6edf3;font-size:11px;font-weight:700;
  font-variant-numeric:tabular-nums;text-transform:none;}
.cot-layer-link{width:100%;height:28px;margin-top:8px;display:flex;align-items:center;justify-content:center;gap:7px;
  color:#8fa0ad;background:rgba(15,20,25,.72);border:1px solid rgba(146,164,180,.18);cursor:pointer;
  font:900 7px ${FONT_COND};letter-spacing:.12em;text-transform:uppercase;}
.cot-layer-link svg{width:13px;height:13px;color:#c88b35;}
.cot-layer-link:hover,.cot-layer-link:focus-visible{color:#ffd79a;border-color:rgba(240,176,74,.55);outline:none;}
.cot-special-card{position:relative;display:grid;grid-template-columns:40px minmax(0,1fr) 25px;gap:9px;
  align-items:start;padding:10px;background:linear-gradient(120deg,rgba(240,160,48,.13),rgba(15,20,26,.86) 55%);
  border:1px solid rgba(240,176,74,.25);border-left:2px solid #f0a030;}
.cot-special-icon{width:40px;height:40px;display:grid;place-items:center;color:#ffc66c;
  background:rgba(240,160,48,.1);border:1px solid rgba(240,176,74,.22);}
.cot-special-icon svg{width:23px;height:23px;}
.cot-special-copy{min-width:0;}.cot-special-copy b{display:block;color:#f6ead7;font-size:10px;letter-spacing:.02em;}
.cot-special-copy p{margin-top:4px;color:#9babb7;font-size:7.5px;line-height:1.45;}
.cot-special-copy small{display:block;margin-top:6px;color:#dba453;font:800 6.5px ${FONT_COND};
  letter-spacing:.07em;text-transform:uppercase;white-space:normal;}
.cot-special-card kbd{width:25px;height:25px;display:grid;place-items:center;color:#171008;background:#efab4a;
  border:1px solid #ffd18b;box-shadow:0 2px 0 #8b5117;font:900 10px ${FONT_COND};}
.cot-module-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;}
.cot-module-chip{min-width:0;height:30px;display:flex;align-items:center;gap:7px;padding:0 7px;
  color:#a8b7c2;background:rgba(19,25,31,.62);border:1px solid rgba(146,164,180,.12);
  font:800 7px ${FONT_COND};letter-spacing:.06em;text-transform:uppercase;}
.cot-module-chip .mi{width:17px;height:17px;display:grid;place-items:center;color:#c88b35;flex:0 0 auto;}
.cot-module-chip svg{width:15px;height:15px;}.cot-module-chip span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cot-crew-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;}
.cot-crew-chip{min-width:0;padding:6px 3px 5px;display:flex;flex-direction:column;align-items:center;gap:4px;
  color:#8798a5;background:rgba(13,18,23,.7);border:1px solid rgba(146,164,180,.1);
  font:800 6px ${FONT_COND};letter-spacing:.04em;text-transform:uppercase;}
.cot-crew-chip svg{width:16px;height:16px;color:#b8c5cf;}
.cot-crew-chip span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
/* One combined historical fleet, filtered by national flag. Compact arrow
   gutters balance the rail without reading as extra nation tiles. The chips
   are deliberately dense enough for the complete selector to center at a
   desktop viewport; narrower widths retain honest horizontal overflow. */
.cot-country-rail{--country-edge:34px;position:absolute;z-index:5;
  left:50%;bottom:186px;transform:translateX(-50%);
  width:min(1100px,calc(100vw - 640px));height:52px;display:grid;
  grid-template-columns:var(--country-edge) minmax(0,1fr) var(--country-edge);
  align-items:center;pointer-events:auto;isolation:isolate;}
.cot-country-rail::before,.cot-country-rail::after{content:'';position:absolute;z-index:2;
  top:0;bottom:4px;width:54px;opacity:0;pointer-events:none;
  transition:opacity .16s,width .16s;}
.cot-country-rail::before{left:var(--country-edge);
  background:linear-gradient(90deg,rgba(7,11,15,.98),rgba(7,11,15,.70) 32%,transparent);}
.cot-country-rail::after{right:var(--country-edge);
  background:linear-gradient(270deg,rgba(7,11,15,.98),rgba(7,11,15,.70) 32%,transparent);}
.cot-country-rail.has-more-left::before,.cot-country-rail.has-more-right::after{opacity:.78;}
.cot-country-rail:hover::before,.cot-country-rail:hover::after,
.cot-country-rail:focus-within::before,.cot-country-rail:focus-within::after{width:62px;}
.cot-country-rail.has-more-left:hover::before,.cot-country-rail.has-more-right:hover::after,
.cot-country-rail.has-more-left:focus-within::before,
.cot-country-rail.has-more-right:focus-within::after{opacity:1;}
.cot-country-chips{grid-column:2;display:flex;justify-content:safe center;gap:3px;width:100%;min-width:0;
  height:52px;padding:2px 3px 4px;
  overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;
  scroll-snap-type:x proximity;scroll-padding-inline:18px;touch-action:pan-x;
  scrollbar-width:none;-ms-overflow-style:none;}
.cot-country-chips::-webkit-scrollbar{display:none;}
.cot-country-edge{position:relative;z-index:3;display:grid;place-items:center;justify-self:center;
  width:26px;height:36px;
  color:#91a2af;background:linear-gradient(180deg,rgba(16,22,28,.96),rgba(7,10,14,.98));
  border:1px solid rgba(146,164,180,.28);cursor:pointer;opacity:.68;outline:none;
  box-shadow:0 5px 14px rgba(0,0,0,.34);
  transition:color .14s,border-color .14s,background .14s,opacity .14s,
    box-shadow .14s,transform .12s ease-out;}
.cot-country-edge.prev{grid-column:1;}
.cot-country-edge.next{grid-column:3;}
.cot-country-edge:hover,.cot-country-edge:focus-visible{color:#ffd27a;border-color:rgba(240,176,74,.72);
  background:linear-gradient(180deg,rgba(42,30,14,.98),rgba(13,10,7,.98));opacity:1;
  box-shadow:0 0 18px rgba(240,160,48,.12);}
.cot-country-edge:active{transform:scale(.96);}
.cot-country-edge.is-unavailable{visibility:hidden;opacity:0;pointer-events:none;}
.cot-country-chip{cursor:pointer;border:1px solid rgba(146,164,180,.3);
  border-bottom:2px solid rgba(146,164,180,.4);background:rgba(11,15,20,.82);
  color:#9fb0bf;font-family:${FONT_STACK};font-size:10px;font-weight:800;
  letter-spacing:.12em;text-transform:uppercase;padding:6px 7px 5px;
  display:inline-flex;align-items:center;gap:6px;white-space:nowrap;flex:0 0 auto;
  scroll-snap-align:center;
  transition:color .15s,border-color .15s,background .15s,transform .15s;outline:none;}
.cot-country-chip .cot-flag{width:22px;height:auto;display:block;box-shadow:0 0 0 1px rgba(255,255,255,.12);}
.cot-country-chip:hover{color:#c6d2dc;border-color:rgba(210,225,240,.5);
  transform:translateY(-1px);}
.cot-country-chip.sel{color:#ffd27a;border-color:rgba(240,176,74,.65);
  border-bottom-color:#f0a030;
  background:linear-gradient(180deg,rgba(32,24,12,.9),rgba(14,10,6,.92));}
.cot-country-chip .ct{font-weight:600;color:#6d7a86;letter-spacing:.04em;}
.cot-country-chip.sel .ct{color:#d8a04c;}
.cot-carousel{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);
  display:flex;align-items:stretch;gap:8px;pointer-events:auto;max-width:96vw;}
.cot-car-arrow{width:34px;border:1px solid rgba(146,164,180,.3);cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  background:rgba(11,15,20,.8);color:#9fb0bf;
  transition:color .15s,border-color .15s,background .15s,opacity .15s;outline:none;}
.cot-car-arrow.is-unavailable{visibility:hidden;opacity:0;pointer-events:none;}
.cot-car-arrow svg{display:block;}
.cot-car-arrow:hover{color:#f0b04a;border-color:rgba(240,176,74,.6);
  background:rgba(20,17,11,.88);}
.cot-car-arrow:active{color:#ffd27a;}
/* The strip advertises overflow only where more cards actually exist. Edge
   classes are synchronized from scrollLeft/scrollWidth in JS, so a fleet that
   fits gets no arrows or shadows, the first page has no false left shadow,
   and the final page has no false right shadow. */
.cot-cards{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;
  /* Horizontal scrolling computes overflow-y:auto too; reserve real headroom
     so the selected card's upward lift keeps its entire top border visible. */
  padding-top:8px;margin-top:-8px;
  cursor:grab;touch-action:pan-x;}
.cot-cards.has-more-left:not(.has-more-right){
  -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 64px,#000 100%);
  mask-image:linear-gradient(90deg,transparent 0,#000 64px,#000 100%);}
.cot-cards.has-more-right:not(.has-more-left){
  -webkit-mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 64px),transparent 100%);
  mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 64px),transparent 100%);}
.cot-cards.has-more-left.has-more-right{
  -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 64px,
    #000 calc(100% - 64px),transparent 100%);
  mask-image:linear-gradient(90deg,transparent 0,#000 64px,
    #000 calc(100% - 64px),transparent 100%);}
.cot-cards::-webkit-scrollbar{display:none;}
/* DRAG-SCROLL CAROUSEL: grabbing cursor while the strip is being panned */
.cot-cards.dragging{cursor:grabbing;}
.cot-cards.dragging .cot-card{cursor:grabbing;}
.cot-card{width:156px;min-height:150px;flex:0 0 auto;cursor:pointer;position:relative;
  isolation:isolate;overflow:hidden;
  background:linear-gradient(180deg,rgba(13,18,23,.90),rgba(8,11,14,.96));
  border:1px solid rgba(146,164,180,.26);
  padding:9px 10px 8px;transition:border-color .15s,transform .15s,box-shadow .15s;}
.cot-card::before{content:"";position:absolute;z-index:-2;inset:-10%;pointer-events:none;
  background-image:var(--nation-flag);background-size:cover;background-position:center;
  opacity:.24;filter:saturate(.84) contrast(1.04);transform:scale(1.03);
  transition:opacity .18s,filter .18s;}
.cot-card::after{content:"";position:absolute;z-index:-1;inset:0;pointer-events:none;
  background:linear-gradient(180deg,rgba(7,11,15,.08) 0%,rgba(7,11,15,.36) 46%,
    rgba(7,11,15,.94) 82%,rgba(7,11,15,.98) 100%);}
.cot-card:hover{border-color:rgba(210,225,240,.5);transform:translateY(-2px);}
.cot-card:hover::before{opacity:.32;filter:saturate(.96) contrast(1.08);}
.cot-card.sel:hover{transform:translateY(-6px);}
.cot-card.sel{border-color:#f0a030;transform:translateY(-6px);
  box-shadow:0 8px 26px rgba(240,140,20,.28);
  background:linear-gradient(180deg,rgba(32,24,12,.92),rgba(14,10,6,.94));}
.cot-card.sel::before{opacity:.38;filter:saturate(1.02) contrast(1.08);}
.cot-card .flag{display:inline-flex;align-items:center;gap:5px;margin-bottom:5px;
  font-size:8.5px;font-weight:800;letter-spacing:.14em;color:#9fb0bf;}
.cot-card .flag .cot-flag{display:block;object-fit:cover;
  box-shadow:0 1px 3px rgba(0,0,0,.55);}
.cot-card .flag i{font-style:normal;}
.cot-card.sel .flag{color:#d8c39a;}
.cot-card .designation{float:right;font-size:7.5px;font-weight:700;letter-spacing:.10em;
  color:#8a97a3;padding:2px 0;}
.cot-card.sel .designation{color:#d8a04c;}
.cot-card .dev-tag{position:absolute;right:8px;top:31px;z-index:2;padding:2px 5px;
  border:1px solid rgba(103,191,255,.62);background:rgba(7,24,38,.86);color:#8fd0ff;
  font-size:7px;font-weight:900;letter-spacing:.14em;line-height:1;text-transform:uppercase;
  box-shadow:0 2px 8px rgba(0,0,0,.45);}
.cot-card.dev-only{border-color:rgba(103,191,255,.38);}
.cot-card.dev-only.sel{border-color:#79c8ff;
  box-shadow:0 8px 26px rgba(64,154,219,.23);}
.cot-card .ti{display:block;margin:-2px auto -1px;width:136px;height:84px;
  object-fit:contain;filter:drop-shadow(0 5px 7px rgba(0,0,0,.72));
  transform:translateY(-3px) scale(1.14);}
.cot-card .nm{font-size:11px;font-weight:650;color:#f3f7fa;letter-spacing:-.01em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0 -3px;text-align:left;
  text-shadow:0 1px 3px rgba(0,0,0,.85);}
.cot-card .nm .tiern{font-weight:900;color:#d8a04c;margin-right:5px;letter-spacing:.04em;}
.cot-card.sel .nm .tiern{color:#f0b04a;}
.cot-card .era{font-size:8.5px;font-weight:800;letter-spacing:.20em;color:#9aa8b5;
  text-transform:uppercase;margin-top:3px;}
.cot-garage .hint{position:absolute;bottom:4px;left:50%;transform:translateX(-50%);
  font-size:9.5px;letter-spacing:.14em;color:rgba(138,151,163,.7);text-transform:uppercase;}
/* MAP-CONFIG WIRING: battlefield picker (4 maps + random) */
/* camo_spotting r1: maps + camo picker stack in ONE flex column so they can
   never overlap at short viewports (the old absolute anchors collided at
   1600x900 — the RANDOM card's conic-gradient thumb showed through the camo
   grid's 5px gaps as a phantom "white national cross"). */
/* The column runs down to just above the country chips. The battlefield
   plate is content-height on roomy screens, but may shrink and scroll when
   the viewport is short so it never collides with the sections below. */
.cot-leftcol{position:absolute;left:34px;top:86px;bottom:210px;
  width:var(--cot-garage-sidebar-width);display:flex;flex-direction:column;gap:8px;overflow:hidden;pointer-events:auto;}
/* garage_polish r9: the battlefield + camo sections share ONE industrial
   plate treatment (translucent backdrop + hairline + amber title tick) so
   they read as a composed panel instead of loose elements on the floor.
   (r9.1: the gallery is deliberately PLATELESS — owner call — but keeps
   the amber title tick so the column rhythm holds.) */
.cot-maps,.cot-camos{box-sizing:border-box;width:100%;height:var(--cot-sidebar-panel-height,280px);
  flex:0 1 var(--cot-sidebar-panel-height,280px);min-height:108px;
  background:linear-gradient(180deg,rgba(9,13,17,.66),rgba(6,9,12,.58));
  border:1px solid rgba(146,164,180,.16);padding:9px 9px 8px;}
.cot-maps .mtitle,.cot-camos .ctitle,.cot-featured .ftitle > span:first-child{
  display:flex;align-items:center;gap:7px;}
.cot-maps .mtitle svg,.cot-camos .ctitle svg,.cot-featured .ftitle > span:first-child svg{
  width:13px;height:13px;flex:0 0 auto;color:#f0a030;}
.cot-maps{position:static;overflow:hidden;display:flex;flex-direction:column;pointer-events:auto;}
/* half-cut last row + fade = "more below" affordance instead of a broken
   clip; .can-scroll is toggled by JS only when the list truly overflows */
.cot-map-scroll{min-height:0;flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;
  scrollbar-width:none;}
.cot-map-scroll::-webkit-scrollbar{display:none;}
.cot-map-scroll.can-scroll{
  -webkit-mask-image:linear-gradient(180deg,#000 0,#000 calc(100% - 22px),transparent 100%);
  mask-image:linear-gradient(180deg,#000 0,#000 calc(100% - 22px),transparent 100%);}
.cot-maps .mtitle{font-size:10px;font-weight:700;letter-spacing:.24em;color:#8a97a3;
  text-transform:uppercase;margin-bottom:7px;}
.cot-maps .mtitle .cot-info-trigger{margin-left:auto;letter-spacing:0}
/* Two-column map tiles keep the full battlefield roster scannable while
   matching the camouflage cards' preview-over-caption layout. */
.cot-map-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;}
.cot-map-card{display:block;min-width:0;cursor:pointer;text-align:center;
  background:linear-gradient(180deg,rgba(13,18,23,.82),rgba(8,11,14,.9));
  border:1px solid rgba(146,164,180,.24);border-bottom:2px solid rgba(146,164,180,.24);
  padding:5px 4px 4px;transition:border-color .12s,background .12s;}
.cot-map-card:hover{border-color:rgba(210,225,240,.5);}
.cot-map-card.sel{border-color:#f0a030;border-bottom-color:#f0a030;
  background:linear-gradient(180deg,rgba(32,24,12,.9),rgba(14,10,6,.92));}
.cot-map-card .mthumb{width:100%;height:auto;aspect-ratio:2.55;background-size:112% auto;
  background-position:center;border:1px solid rgba(0,0,0,.55);position:relative;
  box-shadow:inset 0 0 0 1px rgba(235,243,250,.14);
  transition:background-size .18s ease;}
.cot-map-card:hover .mthumb{background-size:128% auto;}
.cot-map-card.sel .mthumb{box-shadow:inset 0 0 0 1px rgba(240,176,74,.45);}
.cot-map-card .mthumb.verdant{background-color:#3d5a2e;background-image:linear-gradient(135deg,#4c6b38,#2c421f);}
.cot-map-card .mthumb.desert{background-color:#b3925c;background-image:linear-gradient(135deg,#c9a86e,#8f6f42);}
.cot-map-card .mthumb.winter{background-color:#aeb9c4;background-image:linear-gradient(135deg,#cdd6de,#7f8d9b);}
.cot-map-card .mthumb.urban{background-color:#5c6066;background-image:linear-gradient(135deg,#75797e,#3e4247);}
/* Map art overrides these biome fallbacks once the public asset resolves. */
.cot-map-card .mthumb.coastal{background-color:#4a7a86;background-image:linear-gradient(135deg,#5f93a0,#2f5560);}
.cot-map-card .mthumb.autumn{background-color:#9a5a28;background-image:linear-gradient(135deg,#c07030,#6b3d1a);}
.cot-map-card .mthumb.steppe{background-color:#b09a50;background-image:linear-gradient(135deg,#c9b264,#8a763c);}
.cot-map-card .mthumb.railyard{background-color:#565049;background-image:linear-gradient(135deg,#6e6860,#3a352f);}
.cot-map-card .mthumb.frontier{background-color:#536940;background-image:linear-gradient(135deg,#718553,#35442a);}
.cot-map-card .mthumb.fjord{background-color:#4c6974;background-image:linear-gradient(135deg,#78919a,#263d49);}
.cot-map-card .mthumb.delta{background-color:#456c4b;background-image:linear-gradient(135deg,#71945c,#21483f);}
.cot-map-card .mthumb.badlands{background-color:#8a4f32;background-image:linear-gradient(135deg,#ba7549,#482a22);}
.cot-map-card .mthumb.monsoon{background-color:#315b46;background-image:linear-gradient(135deg,#54785c,#172f2c);}
.cot-map-card .mthumb.alpine{background-color:#91a5b1;background-image:linear-gradient(135deg,#d2dce1,#4e6678);}
.cot-map-card .mthumb.caldera{background-color:#544742;background-image:linear-gradient(135deg,#796255,#221d1e);}
.cot-map-card .mthumb.foundry{background-color:#55585a;background-image:linear-gradient(135deg,#7b756b,#282b2e);}
.cot-map-card .mthumb.random{display:grid;overflow:hidden;background:#11171c;isolation:isolate;}
.cot-map-card .mthumb.random .random-map-mosaic{position:absolute;inset:0;display:grid;
  grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,1fr);gap:1px;background:#070a0d;}
.cot-map-card .mthumb.random .random-map-tile{display:block;min-width:0;min-height:0;background-position:center;
  background-size:cover;filter:saturate(.92) contrast(1.06);transition:transform .18s ease,filter .18s ease;}
.cot-map-card .mthumb.random::after{content:'';position:absolute;inset:0;z-index:2;pointer-events:none;
  border:1px solid rgba(255,255,255,.12);box-shadow:inset 0 0 9px rgba(3,6,8,.3);}
.cot-map-card:hover .mthumb.random .random-map-tile{transform:scale(1.08);filter:saturate(1.08) contrast(1.08);}
.cot-map-card .mname{margin-top:4px;min-width:0;font-size:8px;font-weight:700;line-height:1.18;
  color:#e6edf3;letter-spacing:.03em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
/* CAMO PICKER SECTION: per-tank paint pattern (persisted, +concealment) */
.cot-camos{position:static;overflow:hidden;display:flex;flex-direction:column;pointer-events:auto;}
.cot-camos .ctitle{font-size:10px;font-weight:700;letter-spacing:.24em;color:#8a97a3;
  text-transform:uppercase;margin-bottom:7px;}
.cot-camos .ctitle .cot-camo-title-actions{margin-left:auto;display:flex;align-items:center;gap:5px;letter-spacing:0}
.cot-camos .ctitle .cot-info-trigger,.cot-maps .mtitle .cot-info-trigger{width:24px;height:24px;min-width:24px;min-height:24px}
.cot-custom-open{min-height:24px;height:24px;display:inline-flex;align-items:center;gap:5px;padding:0 8px;border:1px solid rgba(240,176,74,.36);
  background:rgba(240,160,48,.08);color:#ffd27a;cursor:pointer;font:900 6.5px ${FONT_COND};
  letter-spacing:.1em;text-transform:uppercase;white-space:nowrap}
.cot-custom-open:hover,.cot-custom-open:focus-visible,.cot-custom-open[aria-expanded='true']{
  border-color:#f0a030;background:rgba(240,160,48,.18);outline:none}
/* garage_polish r9: minmax(0,1fr) + min-width:0 — grid items default to
   min-width:auto, so the widest nowrap label (DESERT PINK ~80px) silently
   inflated every track past the panel and CLIPPED the third column. */
.cot-camos .cgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;}
/* camo r8: the paint roster grew 6 -> 16 — the CAMO grid scrolls (equipment
   grid below stays static). The bottom fade signals overflow without a
   scrollbar gutter narrowing and misaligning the swatch columns. */
.cot-camos .cgrid.camo{grid-template-columns:repeat(2,minmax(0,1fr));min-height:0;flex:1 1 auto;
  overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;}
.cot-camos .cgrid.camo.can-scroll{
  -webkit-mask-image:linear-gradient(180deg,#000 0,#000 calc(100% - 16px),transparent 100%);
  mask-image:linear-gradient(180deg,#000 0,#000 calc(100% - 16px),transparent 100%);}
.cot-camos .cgrid.camo::-webkit-scrollbar{display:none;}
.cot-camo-card{cursor:pointer;text-align:center;padding:5px 4px 4px;min-width:0;
  background:linear-gradient(180deg,rgba(13,18,23,.82),rgba(8,11,14,.9));
  border:1px solid rgba(146,164,180,.24);border-bottom:2px solid rgba(146,164,180,.24);
  transition:border-color .12s,background .12s,box-shadow .12s;}
.cot-camo-card:hover{border-color:rgba(210,225,240,.5);}
.cot-camo-card.sel{border-color:#f0a030;border-bottom-color:#f0a030;
  background:linear-gradient(180deg,rgba(32,24,12,.9),rgba(14,10,6,.92));
  box-shadow:0 0 10px rgba(240,160,48,.18);}
.cot-camo-card .sw{width:100%;height:auto;aspect-ratio:2.55;margin:0 auto 4px;border:1px solid rgba(0,0,0,.55);
  position:relative;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(235,243,250,.10);}
.cot-camo-card .sw canvas{position:absolute;inset:0;width:100%;height:100%;display:block;
  object-fit:cover;object-position:center;}
.cot-camo-card .sw.auto{background:#11171c;}
/* equipment tiles: distinct procedural icons on a dark plate (r3: identical
   stripe bars read as placeholders) */
.cot-camo-card .sw.eq{display:flex;align-items:center;justify-content:center;
  background:linear-gradient(180deg,#232a31,#12161b);}
.cot-camo-card .sw.eq svg{display:block;}
.cot-camo-card .cl{display:block;min-width:0;font-size:8px;font-weight:700;line-height:1.18;
  letter-spacing:.08em;color:#9fb0bf;text-transform:uppercase;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;}
.cot-camo-card.sel .cl{color:#d8a04c;}
/* r4: caption WRAPS instead of clipping — the old nowrap line overflowed the
   196px column and cut off mid-sentence, leaving a dangling em-dash */
.cot-camos .cnote{display:none}
.cot-camo-lab{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.75fr);gap:18px;min-height:460px}
.cot-camo-lab__canvas,.cot-camo-lab__controls{min-width:0;display:flex;flex-direction:column;gap:12px}
.cot-camo-lab__panel{padding:13px;border:1px solid rgba(146,164,180,.2);background:rgba(7,11,14,.58)}
.cot-camo-lab__heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 9px;color:#d5e0e8;
  font:900 10px/1.2 ${FONT_COND};letter-spacing:.16em;text-transform:uppercase}.cot-camo-lab__heading small{color:#6f818e;font-size:8px}
.cot-custom-preview{position:relative;height:124px;overflow:hidden;border:1px solid rgba(0,0,0,.55);
  background:#242a26;box-shadow:inset 0 0 0 1px rgba(235,243,250,.1);}
.cot-custom-preview canvas{width:100%;height:100%;display:block;object-fit:cover;object-position:center;}
.cot-custom-local{position:absolute;left:10px;bottom:9px;padding:5px 7px;color:#ffd17f;
  background:rgba(7,10,13,.86);font:900 8px ${FONT_COND};letter-spacing:.15em;text-transform:uppercase;}
.cot-custom-draw-wrap{position:relative;min-height:250px;flex:1;border:1px solid rgba(146,164,180,.28);overflow:hidden;
  background-color:#202722;background-image:linear-gradient(rgba(255,255,255,.055) 1px,transparent 1px),
  linear-gradient(90deg,rgba(255,255,255,.055) 1px,transparent 1px);background-size:24px 24px}
.cot-custom-draw{display:block;width:100%;height:100%;min-height:250px;touch-action:none;cursor:crosshair}
.cot-custom-draw-label{position:absolute;left:10px;top:9px;padding:5px 7px;background:rgba(4,7,9,.8);color:#aebcc6;
  pointer-events:none;font:900 8px ${FONT_COND};letter-spacing:.13em;text-transform:uppercase}
.cot-custom-tools{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.cot-custom-tool{min-height:40px;display:flex;align-items:center;justify-content:center;gap:7px;padding:0 8px;border:1px solid rgba(146,164,180,.22);
  background:rgba(9,13,17,.82);color:#8d9da9;cursor:pointer;font:900 8.5px ${FONT_COND};letter-spacing:.08em;text-transform:uppercase;
  transition:color .12s,border-color .12s,background .12s,transform .12s}.cot-custom-tool:active{transform:scale(.97)}
.cot-custom-tool:hover,.cot-custom-tool:focus-visible{border-color:rgba(230,154,45,.7);color:#dce6ed;outline:none}
.cot-custom-tool.on{border-color:#f0a030;color:#ffd27a;background:rgba(240,160,48,.1)}
.cot-custom-assets{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}.cot-custom-assets .cot-custom-tool{min-height:46px;flex-direction:column;gap:3px}
.cot-custom-colors{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
.cot-custom-color{display:grid;grid-template-columns:34px 1fr;align-items:center;gap:8px;color:#8d9eaa;
  font:900 8.5px ${FONT_COND};letter-spacing:.1em;text-transform:uppercase;}
.cot-custom-color input{width:34px;height:34px;padding:2px;background:#090d11;border:1px solid rgba(146,164,180,.3);}
.cot-custom-repeat{display:grid;grid-template-columns:auto 1fr 38px;gap:8px;align-items:center;color:#91a2ae;
  font:900 8.5px ${FONT_COND};letter-spacing:.1em;text-transform:uppercase;}
.cot-custom-repeat input{width:100%;accent-color:#f0a030;}.cot-custom-repeat output{text-align:right;color:#f0b04a;}
.cot-custom-repeat-grid{display:grid;grid-template-columns:1fr;gap:9px}
.cot-custom-check{display:flex;align-items:center;gap:8px;color:#9aabb7;font:900 8.5px ${FONT_COND};letter-spacing:.09em;text-transform:uppercase}
.cot-custom-check input{accent-color:#f0a030}
.cot-custom-transfer{display:grid;grid-template-columns:1fr 1fr;gap:6px}.cot-custom-status{min-height:18px;color:#7f919e;
  font:750 9px/1.45 ${FONT_STACK}}.cot-custom-status.ok{color:#98cda0}.cot-custom-status.error{color:#ef8b7e}
.cot-custom-help{color:#7f919e;font:650 11px ${FONT_STACK};line-height:1.55}.cot-custom-help strong{color:#d9a44e}
body:is([data-cot-width='compact'],[data-cot-width='phone']) .cot-camo-lab{grid-template-columns:1fr;min-height:0}
body:is([data-cot-width='compact'],[data-cot-width='phone']) :is(.cot-custom-draw-wrap,.cot-custom-draw){min-height:220px}
body:is([data-cot-width='compact'],[data-cot-width='phone']) .cot-camo-lab__controls{display:grid;grid-template-columns:1fr}
body:is([data-cot-width='compact'],[data-cot-width='phone']) .cot-custom-preview{height:100px}
body[data-cot-width='phone'] .cot-custom-tools{grid-template-columns:repeat(2,minmax(0,1fr))}
body[data-cot-width='phone'] .cot-custom-assets{grid-template-columns:repeat(3,minmax(0,1fr))}
body[data-cot-width='phone'] .cot-custom-colors{grid-template-columns:1fr}
body[data-cot-width='phone'] :is(.cot-custom-draw-wrap,.cot-custom-draw){min-height:190px}

/* EQUIPMENT SYSTEM: 3 loadout slots at the foot of the stats card. Same
   plate/border language as the camo cards; equipped slots carry the item's
   white-silhouette glyph (equipIcons.js), empty ones a quiet dashed +.
   garage polish (spacing): the card now also stops ABOVE the carousel band —
   the old 100vh-148px cap let its equipment tail run underneath the last
   carousel cards at ≤850px-tall viewports (peeking through the card gaps);
   content past the cap scrolls inside the card as designed. */
.cot-garage .stats{max-height:max(320px,calc(100vh - 316px));overflow-y:auto;overflow-x:hidden;
  scrollbar-width:thin;scrollbar-color:rgba(146,164,180,.45) rgba(8,11,14,.6);}
.cot-garage .stats::-webkit-scrollbar{width:5px;}
.cot-garage .stats::-webkit-scrollbar-track{background:rgba(8,11,14,.6);}
.cot-garage .stats::-webkit-scrollbar-thumb{background:rgba(146,164,180,.45);}
/* stat values boosted by equipment tint green (base value in the tooltip) */
.cot-garage .srow .lr b.eqmod{color:#9fd8a0;}
.cot-garage .eqhead{display:flex;justify-content:space-between;align-items:baseline;
  font-size:10px;font-weight:700;letter-spacing:.24em;color:#8a97a3;
  text-transform:uppercase;margin-bottom:7px;}
.cot-garage .eqhead span{display:flex;align-items:center;gap:7px;}
.cot-garage .eqhead svg{width:13px;height:13px;color:#f0a030;}
.cot-garage .eqhead i{font-style:normal;color:#6d7a86;letter-spacing:.08em;}
.cot-garage .cot-stat-title .cot-info-trigger{order:3;margin-left:auto;letter-spacing:0}
.cot-garage .cot-stat-title small{order:4;margin-left:0}
.cot-garage .eqhead .cot-info-trigger{margin-left:6px;letter-spacing:0}
.cot-garage .eqhead i{margin-left:auto}
.cot-garage .cot-dossier-head > .cot-info-trigger{position:absolute;z-index:3;right:11px;top:11px}
.cot-garage .eqrow{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}
.cot-garage .eqslot{cursor:pointer;height:58px;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:4px;
  background:linear-gradient(180deg,rgba(13,18,23,.82),rgba(8,11,14,.9));
  border:1px solid rgba(146,164,180,.24);border-bottom:2px solid rgba(146,164,180,.24);
  transition:border-color .12s,background .12s;}
.cot-garage .eqslot:hover{border-color:rgba(210,225,240,.5);}
.cot-garage .eqslot.open{border-color:#f0a030;border-bottom-color:#f0a030;
  background:linear-gradient(180deg,rgba(32,24,12,.9),rgba(14,10,6,.92));}
.cot-garage .eqslot svg{display:block;}
.cot-garage .eqslot .sl{font-size:7.5px;font-weight:700;letter-spacing:.08em;
  color:#9fb0bf;text-transform:uppercase;max-width:92%;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;}
.cot-garage .eqslot.empty .plus{font-size:19px;line-height:1;color:#5b6873;
  font-weight:400;}
.cot-garage .eqslot.empty .sl{color:#5b6873;}
.cot-garage .eqslot.empty:hover .plus{color:#9fb0bf;}
/* EQUIPMENT PICKER: side panel opened by a slot click — icon+name+effect
   tiles, category filter chips, era-locked tiles stay visible but inert. */
.cot-eqpick{position:absolute;right:calc(var(--cot-garage-sidebar-width) + 38px);top:86px;width:372px;display:none;
  pointer-events:auto;z-index:70;font-family:${FONT_STACK};
  background:linear-gradient(180deg,rgba(11,15,20,.94),rgba(7,10,13,.96));
  border:1px solid rgba(146,164,180,.32);box-shadow:0 10px 36px rgba(0,0,0,.65);
  padding:13px 14px 12px;}
.cot-eqpick.open{display:block;}
.cot-eqpick .ph{display:flex;justify-content:space-between;align-items:center;
  margin-bottom:9px;}
.cot-eqpick .ph .t{font-size:11px;font-weight:800;letter-spacing:.22em;
  color:#c6d2dc;text-transform:uppercase;}
.cot-eqpick .ph .t i{font-style:normal;color:#f0b04a;}
.cot-eqpick .ph .x{cursor:pointer;border:none;background:none;color:#8a97a3;
  font-size:15px;line-height:1;padding:2px 4px;font-family:inherit;}
.cot-eqpick .ph .x:hover{color:#ffd27a;}
.cot-eqpick .chips{display:flex;gap:4px;margin-bottom:9px;flex-wrap:wrap;}
.cot-eqpick .chip{cursor:pointer;border:1px solid rgba(146,164,180,.28);
  background:rgba(11,15,20,.8);color:#8a97a3;font-family:inherit;
  font-size:8.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;
  padding:4px 9px 3px;transition:color .12s,border-color .12s;}
.cot-eqpick .chip:hover{color:#c6d2dc;}
.cot-eqpick .chip.sel{color:#ffd27a;border-color:rgba(240,176,74,.65);
  background:linear-gradient(180deg,rgba(32,24,12,.9),rgba(14,10,6,.92));}
.cot-eqpick .pgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;
  max-height:min(46vh,430px);overflow-y:auto;overscroll-behavior:contain;
  padding-right:3px;scrollbar-width:thin;
  scrollbar-color:rgba(146,164,180,.45) rgba(8,11,14,.6);}
.cot-eqpick .pgrid::-webkit-scrollbar{width:5px;}
.cot-eqpick .pgrid::-webkit-scrollbar-track{background:rgba(8,11,14,.6);}
.cot-eqpick .pgrid::-webkit-scrollbar-thumb{background:rgba(146,164,180,.45);}
.cot-eqtile{cursor:pointer;position:relative;text-align:center;padding:9px 5px 7px;
  background:linear-gradient(180deg,rgba(13,18,23,.82),rgba(8,11,14,.9));
  border:1px solid rgba(146,164,180,.24);border-bottom:2px solid rgba(146,164,180,.24);
  transition:border-color .12s,background .12s;}
.cot-eqtile:hover{border-color:rgba(210,225,240,.5);}
.cot-eqtile.sel{border-color:#f0a030;border-bottom-color:#f0a030;
  background:linear-gradient(180deg,rgba(32,24,12,.9),rgba(14,10,6,.92));}
.cot-eqtile svg{display:block;margin:0 auto 5px;}
.cot-eqtile .n{font-size:8.5px;font-weight:700;letter-spacing:.06em;color:#e6edf3;
  text-transform:uppercase;line-height:1.25;min-height:20px;
  display:flex;align-items:center;justify-content:center;}
.cot-eqtile .e{font-size:7.5px;font-weight:600;letter-spacing:.02em;color:#8a97a3;
  line-height:1.35;margin-top:3px;min-height:29px;}
.cot-eqtile.sel .n{color:#ffd27a;}
.cot-eqtile .tag{position:absolute;top:3px;right:3px;font-size:6.5px;font-weight:800;
  letter-spacing:.1em;color:#d8a04c;background:rgba(20,14,6,.85);
  border:1px solid rgba(240,176,74,.4);padding:1px 4px;text-transform:uppercase;}
.cot-eqtile.inother .tag{color:#9fb0bf;border-color:rgba(146,164,180,.4);
  background:rgba(10,14,18,.85);}
.cot-eqtile.locked{cursor:default;opacity:.38;}
.cot-eqtile.locked:hover{border-color:rgba(146,164,180,.24);}
.cot-eqtile.remove .n{color:#9fb0bf;}
.cot-eqtile.remove svg{opacity:.55;}

/* garage polish (spacing/focus only): keyboard-visible focus affordance on
   the interactive chrome — one quiet amber ring, outline-based so nothing
   shifts layout. Mouse clicks stay ring-free via :focus-visible. */
.cot-battle:focus-visible,.cot-battle-mode:focus-visible,.cot-battle-choice:focus-visible,
.cot-country-chip:focus-visible,.cot-country-edge:focus-visible,.cot-car-arrow:focus-visible,.cot-record-trigger:focus-visible,
.cot-github:focus-visible,.cot-record-close:focus-visible{
  outline:2px solid rgba(240,176,74,.8);outline-offset:2px;}
.cot-eqpick .chip:focus-visible,.cot-eqpick .ph .x:focus-visible{
  outline:1px solid rgba(240,176,74,.8);outline-offset:1px;}

/* garage_ui: entrance transition — the garage used to hard-cut in (boot and
   battle-exit both flipped display:none→block in one frame). show() re-arms
   the .enter class; the UI chrome fades/rises in around the live 3D stage.
   Centered elements keep their translateX(-50%) inside the keyframes. */
.cot-garage.enter .band-top,.cot-garage.enter .band-bot,
.cot-garage.enter .band-l,.cot-garage.enter .band-r{
  animation:cot-g-fade .30s ease-out backwards;}
.cot-garage.enter .title,.cot-garage.enter .cot-nav,
.cot-garage.enter .cot-leftcol,
.cot-garage.enter .hint{animation:cot-g-fade .34s ease-out .05s backwards;}
.cot-garage.enter .stats{animation:cot-g-rise .36s ease-out .08s backwards;}
.cot-garage.enter .cot-battle-control{animation:cot-g-drop-c .36s ease-out .05s backwards;}
.cot-garage.enter .cot-country-rail{animation:cot-g-rise-c .32s ease-out .10s backwards;}
.cot-garage.enter .cot-carousel{animation:cot-g-rise-c .36s ease-out .14s backwards;}
/* MARKETING FEATURED PANEL: rotating in-engine action stills (see
   tools/marketing-shots). Bottom-anchored under the camo grid in the left
   column; purely decorative, so on short viewports it is the element that
   clips first (leftcol overflow:hidden), never the functional pickers. */
.cot-featured{width:100%;flex:0 0 auto;pointer-events:auto;}
/* r9.1: browse arrows — visible on hover, click = prev/next still */
.cot-featured .fnav{position:absolute;top:50%;transform:translateY(-50%);z-index:2;
  width:20px;height:32px;display:flex;align-items:center;justify-content:center;
  background:rgba(5,8,11,.6);border:1px solid rgba(146,164,180,.35);color:#d9e3ec;
  font-size:14px;line-height:1;cursor:pointer;opacity:0;padding:0 0 2px;
  transition:opacity .15s,border-color .15s,color .15s;}
.cot-featured .fshot:hover .fnav{opacity:.92;}
.cot-featured .fnav:hover{border-color:rgba(240,176,74,.7);color:#ffd27a;}
.cot-featured .fnav.prev{left:0;}
.cot-featured .fnav.next{right:0;}
.cot-featured .ftitle{font-size:10px;font-weight:700;letter-spacing:.24em;color:#8a97a3;
  text-transform:uppercase;margin-bottom:7px;display:flex;justify-content:space-between;
  align-items:baseline;}
.cot-featured .ftitle > span:first-child{flex:0 0 auto;white-space:nowrap;}
.cot-featured .fdots{display:flex;gap:2px;flex:0 0 auto;}
.cot-featured .fdots span{width:3px;height:6px;flex:0 0 3px;background:rgba(146,164,180,.35);
  transition:background .2s;cursor:pointer;}
.cot-featured .fdots span:hover{background:rgba(210,225,240,.7);}
.cot-featured .fdots span.on{background:#f0a030;}
.cot-featured .fshot{position:relative;width:100%;height:104px;overflow:hidden;
  border:1px solid rgba(146,164,180,.28);cursor:pointer;background:#0a0e12;
  box-shadow:0 6px 20px rgba(0,0,0,.45);transition:border-color .15s;}
.cot-featured .fshot:hover{border-color:rgba(240,176,74,.6);}
.cot-featured .fly{position:absolute;inset:0;background-size:cover;background-position:center 40%;
  opacity:0;transform:scale(1.05);transition:opacity .8s ease;}
.cot-featured .fly.on{opacity:1;transform:scale(1);
  transition:opacity .8s ease,transform 8.5s linear;}
.cot-featured .fcap{position:absolute;left:0;right:0;bottom:0;padding:14px 8px 5px;
  font-size:8px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:#d9e3ec;
  background:linear-gradient(0deg,rgba(5,8,11,.9),rgba(5,8,11,0));white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;}
@keyframes cot-g-fade{from{opacity:0;}}
@keyframes cot-g-rise{from{opacity:0;transform:translateY(12px);}}
@keyframes cot-g-rise-c{from{opacity:0;transform:translateX(-50%) translateY(12px);}
  to{opacity:1;transform:translateX(-50%);}}
@keyframes cot-g-drop-c{from{opacity:0;transform:translateX(-50%) translateY(-10px);}
  to{opacity:1;transform:translateX(-50%);}}
@media (prefers-reduced-motion:reduce){
  .cot-garage.enter,.cot-garage.enter *{animation:none !important;}
}

/* RESPONSIVE COMPOSITION r1 -------------------------------------------------
   Width/height/input semantics come from responsiveLayout.js. These rules are
   are the canonical garage composition. The Battle dropdown behavior remains
   untouched; only its containing control is fitted to the available top lane. */
body[data-cot-width='laptop'] .cot-garage{
  --cot-garage-sidebar-width:clamp(232px,20vw,272px);
}
body[data-cot-width='laptop'] .cot-header-nav .nv{width:34px;padding:0;justify-content:center;gap:0}
body[data-cot-width='laptop'] .cot-header-nav .nav-label{display:none}
body[data-cot-width='laptop'] .cot-header-nav .record-badge{
  position:absolute;right:-5px;top:-5px;min-width:14px;height:14px;padding:0 3px;font-size:6px;
}
body[data-cot-width='laptop'] .cot-nav .github-stars{
  position:absolute;right:-7px;top:-6px;min-width:18px;height:14px;padding:0 3px;display:grid;place-items:center;
  border:1px solid #ffc46b;background:#f0a030;color:#1a1105;font-size:5.5px;line-height:1;letter-spacing:0;
}
body[data-cot-width='laptop'] .cot-leftcol{left:clamp(18px,2vw,30px)}
body[data-cot-width='laptop'] .cot-garage .stats{right:clamp(18px,2vw,30px)}
body[data-cot-width='laptop'] .cot-country-rail{
  width:min(920px,calc(100vw - (var(--cot-garage-sidebar-width) * 2) - 92px));
}

body[data-cot-panels='overlay'] .cot-garage{
  --cot-overlay-edge:clamp(10px,2vw,18px);
  --cot-roster-height:86px;
  --cot-country-bottom:100px;
  --cot-tools-bottom:152px;
}
body[data-cot-panels='overlay'] .cot-garage .band-top{height:22%}
body[data-cot-panels='overlay'] .cot-garage .band-bot{height:29%}
body[data-cot-panels='overlay'] .cot-garage .band-r{display:none}
body[data-cot-panels='overlay'] .cot-brand-rail{
  top:max(12px,env(safe-area-inset-top));left:max(var(--cot-overlay-edge),env(safe-area-inset-left));
  height:44px;gap:9px;z-index:13;
}
body[data-cot-panels='overlay'] .cot-garage .title{font-size:12px;letter-spacing:.2em;gap:8px}
body[data-cot-panels='overlay'] .cot-garage .title .mark{width:28px;height:28px}
body[data-cot-panels='overlay'] .cot-brand-utilities,
body[data-cot-panels='overlay'] .cot-nav .cot-nav-desktop{display:none}
body[data-cot-panels='overlay'] .cot-nav{
  top:max(12px,env(safe-area-inset-top));right:max(var(--cot-overlay-edge),env(safe-area-inset-right));
  height:44px;gap:4px;z-index:15;
}
body[data-cot-panels='overlay'] .cot-nav .cot-mobile-nav-trigger{display:inline-flex}
body[data-cot-panels='overlay'] .cot-mobile-nav-menu:not([hidden]){display:grid}
body[data-cot-panels='overlay'] .cot-header-nav .nv{
  width:44px;height:44px;min-height:44px;padding:0;justify-content:center;gap:0;
}
body[data-cot-panels='overlay'] .cot-header-nav .nv .nav-label{display:none}
body[data-cot-panels='overlay'] .cot-header-nav .nv .nvi{width:16px;height:16px}
body[data-cot-panels='overlay'] .cot-nav .cot-settings-slot,
body[data-cot-panels='overlay'] .cot-nav .cot-gear{width:44px;height:44px;min-height:44px}
body[data-cot-panels='overlay'] .cot-battle-control{
  top:max(12px,env(safe-area-inset-top));width:clamp(196px,28vw,238px);height:44px;z-index:14;
}
body[data-cot-panels='overlay'] .cot-battle{font-size:clamp(14px,1.8vw,17px)}
body[data-cot-panels='overlay'] .cot-battle-mode{font-size:7.5px}
body[data-cot-panels='overlay'] .cot-garage-tools{
  display:flex;left:50%;bottom:var(--cot-tools-bottom);transform:translateX(-50%);
  width:min(430px,calc(100vw - (var(--cot-overlay-edge) * 2)));
}
body[data-cot-panels='overlay'] .cot-garage-tool{flex:1 1 0}
body[data-cot-panels='overlay'] .cot-leftcol,
body[data-cot-panels='overlay'] .cot-garage .stats{display:none}
body[data-cot-panels='overlay'] .cot-garage[data-garage-panel] .cot-garage-panel-scrim{display:block}
body[data-cot-panels='overlay'] .cot-garage[data-garage-panel='maps'] .cot-leftcol,
body[data-cot-panels='overlay'] .cot-garage[data-garage-panel='appearance'] .cot-leftcol{
  display:flex;z-index:11;left:max(var(--cot-overlay-edge),env(safe-area-inset-left));right:auto;
  top:76px;bottom:206px;width:min(360px,calc(100vw - (var(--cot-overlay-edge) * 2)));
  max-height:none;padding:8px;gap:0;overflow:hidden;
  background:linear-gradient(160deg,rgba(11,16,21,.99),rgba(5,8,11,.99));
  border:1px solid rgba(174,194,209,.32);box-shadow:0 20px 54px rgba(0,0,0,.66);
}
body[data-cot-panels='overlay'] .cot-garage[data-garage-panel='maps'] .cot-maps,
body[data-cot-panels='overlay'] .cot-garage[data-garage-panel='appearance'] .cot-camos{
  display:flex;width:100%;height:100%;min-height:0;max-height:none;flex:1 1 auto;padding:10px;
}
body[data-cot-panels='overlay'] .cot-garage[data-garage-panel='maps'] .cot-camos,
body[data-cot-panels='overlay'] .cot-garage[data-garage-panel='appearance'] .cot-maps,
body[data-cot-panels='overlay'] .cot-leftcol .cot-featured{display:none}
body[data-cot-panels='overlay'] .cot-garage[data-garage-panel='dossier'] .stats{
  display:block;z-index:11;right:max(var(--cot-overlay-edge),env(safe-area-inset-right));left:auto;
  top:76px;bottom:206px;width:min(380px,calc(100vw - (var(--cot-overlay-edge) * 2)));
  max-height:none;padding:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;
  background:transparent;box-shadow:0 20px 54px rgba(0,0,0,.66);
}
body[data-cot-panels='overlay'] .cot-country-rail{
  --country-edge:32px;left:max(var(--cot-overlay-edge),env(safe-area-inset-left));
  right:max(var(--cot-overlay-edge),env(safe-area-inset-right));bottom:var(--cot-country-bottom);
  width:auto;height:44px;transform:none;
}
body[data-cot-panels='overlay'] .cot-garage.enter .cot-country-rail{animation-name:cot-g-rise}
body[data-cot-panels='overlay'] .cot-country-chips{height:44px;gap:4px;padding:2px 3px}
body[data-cot-panels='overlay'] .cot-country-edge{width:30px;height:42px}
body[data-cot-panels='overlay'] .cot-country-chip{
  min-height:42px;padding:4px 9px 3px;font-size:7.5px;letter-spacing:.1em;gap:5px;
}
body[data-cot-panels='overlay'] .cot-country-chip .cot-flag{width:18px}
body[data-cot-panels='overlay'] .cot-carousel{
  left:max(var(--cot-overlay-edge),env(safe-area-inset-left));
  right:max(var(--cot-overlay-edge),env(safe-area-inset-right));bottom:max(8px,env(safe-area-inset-bottom));
  width:auto;height:var(--cot-roster-height);max-width:none;transform:none;gap:5px;
}
body[data-cot-panels='overlay'] .cot-garage.enter .cot-carousel{animation-name:cot-g-rise}
body[data-cot-panels='overlay'] .cot-car-arrow{width:36px;flex:0 0 36px}
body[data-cot-panels='overlay'] .cot-cards{min-width:0;flex:1 1 auto;gap:5px}
body[data-cot-panels='overlay'] .cot-card{
  width:112px;min-height:var(--cot-roster-height);height:var(--cot-roster-height);padding:5px 6px 4px;
}
body[data-cot-panels='overlay'] .cot-card.sel{transform:translateY(-3px)}
body[data-cot-panels='overlay'] .cot-card .flag{margin-bottom:1px;font-size:6px;gap:3px}
body[data-cot-panels='overlay'] .cot-card .flag .cot-flag{width:16px}
body[data-cot-panels='overlay'] .cot-card .designation{font-size:5.5px;padding:1px 0}
body[data-cot-panels='overlay'] .cot-card .dev-tag{right:4px;top:22px;padding:1px 3px;font-size:5px}
body[data-cot-panels='overlay'] .cot-card .ti{width:92px;height:48px;margin:-4px auto -2px;
  transform:translateY(-2px) scale(1.12)}
body[data-cot-panels='overlay'] .cot-card .nm{font-size:8px;margin:0 -2px}
body[data-cot-panels='overlay'] .cot-card .era{font-size:6px;margin-top:1px;letter-spacing:.12em}
body[data-cot-panels='overlay'] .cot-garage .hint{display:none}

body[data-cot-width='phone'] .cot-garage .title span,
body[data-cot-width='compact'] .cot-garage .title span{display:none}
body[data-cot-width='phone'] .cot-garage{
  --cot-roster-height:82px;--cot-country-bottom:94px;--cot-tools-bottom:144px;
}
body[data-cot-width='phone'] .cot-battle-control{width:152px}
body[data-cot-width='phone'] .cot-battle{font-size:13px;padding-left:5px;gap:5px}
body[data-cot-width='phone'] .cot-battle .battle-active-icon{width:18px;height:18px}
body[data-cot-width='phone'] .cot-battle-mode{font-size:7px;padding-right:7px}
body[data-cot-width='phone'] .cot-battle-mode::after{right:5px}
body[data-cot-width-density='narrow'] .cot-battle-control{top:max(64px,calc(env(safe-area-inset-top) + 58px))}
body[data-cot-width='phone'] .cot-garage-tools{width:calc(100vw - (var(--cot-overlay-edge) * 2))}
body[data-cot-width='phone'] .cot-garage-tool{padding:0 7px;gap:5px;font-size:6.5px;letter-spacing:.08em}
body[data-cot-width='phone'] .cot-garage-tool svg{width:15px;height:15px}
body[data-cot-width='phone'] .cot-card{width:102px}
body[data-cot-width='phone'] .cot-car-arrow{width:32px;flex-basis:32px}
body[data-cot-width='phone'] .cot-record-overview{grid-template-columns:1fr}
body[data-cot-width='phone'] .cot-record-dialog{width:calc(100vw - 20px);max-height:calc(100dvh - 20px)}
body[data-cot-width='phone'] .cot-record-head{padding:15px 14px 12px}
body[data-cot-width='phone'] .cot-record-body{padding:14px}
body[data-cot-width='phone'] .cot-record-ring{width:116px}
body[data-cot-width='phone'] .cot-record-metrics,
body[data-cot-width='phone'] .cot-last-battle-grid{grid-template-columns:repeat(2,minmax(0,1fr))}

/* Short viewports use vertical panel tabs, keeping the center sightline and
   both horizontal roster rails usable down to 360 CSS px of height. */
body[data-cot-height='short'][data-cot-panels='overlay'] .cot-garage{
  --cot-roster-height:62px;--cot-country-bottom:70px;
}
body[data-cot-height='short'][data-cot-panels='overlay'] .cot-garage-tools{
  left:max(8px,env(safe-area-inset-left));right:auto;top:72px;bottom:auto;transform:none;
  width:44px;flex-direction:column;
}
body[data-cot-height='short'][data-cot-panels='overlay'] .cot-garage-tool{
  width:44px;height:44px;flex:0 0 44px;padding:0;
}
body[data-cot-height='short'][data-cot-panels='overlay'] .cot-garage-tool span{display:none}
body[data-cot-height='short'][data-cot-panels='overlay'] .cot-garage[data-garage-panel='maps'] .cot-leftcol,
body[data-cot-height='short'][data-cot-panels='overlay'] .cot-garage[data-garage-panel='appearance'] .cot-leftcol{
  left:max(60px,calc(env(safe-area-inset-left) + 60px));top:72px;bottom:118px;
  width:min(310px,calc(100vw - 128px));
}
body[data-cot-height='short'][data-cot-panels='overlay'] .cot-garage[data-garage-panel='dossier'] .stats{
  top:72px;bottom:118px;width:min(340px,calc(100vw - 72px));
}
body[data-cot-height='short'][data-cot-panels='overlay'] .cot-country-rail{height:38px}
body[data-cot-height='short'][data-cot-panels='overlay'] .cot-country-chips{height:38px}
body[data-cot-height='short'][data-cot-panels='overlay'] .cot-country-chip{min-height:36px;padding-block:2px}
body[data-cot-height='short'][data-cot-panels='overlay'] .cot-country-edge{height:36px}
body[data-cot-height='short'][data-cot-panels='overlay'] .cot-card{
  min-height:var(--cot-roster-height);height:var(--cot-roster-height);width:96px;padding-block:3px;
}
body[data-cot-height='short'][data-cot-panels='overlay'] .cot-card .ti{width:76px;height:34px;margin:-4px auto -2px}
body[data-cot-height='short'][data-cot-panels='overlay'] .cot-card .era{display:none}

body[data-cot-input='coarse'] .cot-garage button,
body[data-cot-input='coarse'] .cot-garage a{touch-action:manipulation}
body[data-cot-input='coarse'] .cot-country-chip{min-width:44px}
`;

// garage_ui: one shared accessibility gate for the WAAPI micro-transitions
// (the CSS entrance set is gated by the same media query in GARAGE_CSS).
const REDUCED_MOTION = typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;


// --- CAMO PICKER SECTION: swatch painter ------------------------------------
// Paints a 64px-class preview tile of the ACTUAL resolved pattern — palette
// and scheme come from materials.resolveCamoVisual, and each scheme branch
// mirrors the corresponding paintCamo language at tile scale.
function swRngFactory(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const swHex = (h) => {
  const n = parseInt(String(h).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const swRgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const swMix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function swBlob(c, rng, x, y, r) {
  const n = 8;
  const px = [], py = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.62 + rng() * 0.6);
    px.push(x + Math.cos(a) * rr);
    py.push(y + Math.sin(a) * rr * 0.85);
  }
  c.beginPath();
  c.moveTo((px[n - 1] + px[0]) / 2, (py[n - 1] + py[0]) / 2);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    c.quadraticCurveTo(px[i], py[i], (px[i] + px[j]) / 2, (py[i] + py[j]) / 2);
  }
  c.closePath();
}

function swPoly(c, rng, x, y, r, sides) {
  c.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + rng() * 0.6;
    const rr = r * (0.55 + rng() * 0.55);
    const vx = x + Math.cos(a) * rr, vy = y + Math.sin(a) * rr;
    if (i === 0) c.moveTo(vx, vy); else c.lineTo(vx, vy);
  }
  c.closePath();
}

function paintCamoSwatch(canvas, spec, pid) {
  const W = 128, H = 44;
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  let seed = 11;
  for (const ch of `${spec.id}:${pid}`) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const rng = swRngFactory(seed);
  const vis = resolveCamoVisual(spec, pid);
  const base = swHex(vis.base || '#5a6b46');
  const weather = swHex(vis.weather || vis.base || '#5a6b46');
  const patches = (vis.patches || []).map(swHex);
  // tile-scale reference dimension: 1.6x over the raw canvas width so the
  // pattern features render BOLDER than on-hull scale — at 62px display width
  // the true-scale features smeared into flat noise (r3 readability)
  const repeatScale = Number.isFinite(vis.patternRepeat)
    ? 1.28 - (vis.patternRepeat / 100) * 0.72
    : 1;
  const S = W * 1.6 * repeatScale;
  c.fillStyle = swRgb(base);
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 10; i++) { // weathered tonal drift
    const x = rng() * W, y = rng() * H, r = S * (0.06 + rng() * 0.12);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, swRgb(swMix(base, weather, 0.3 + rng() * 0.4), 0.5));
    g.addColorStop(1, swRgb(base, 0));
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const scheme = vis.scheme || 'solid';
  if (scheme === 'drawn' && patches.length) {
    const repeatX = Math.max(1, Math.min(8, vis.drawRepeatX || 1));
    const repeatY = Math.max(1, Math.min(8, vis.drawRepeatY || 1));
    const cellW = W / repeatX;
    const cellH = H / repeatY;
    const angle = (vis.drawRotation || 0) * Math.PI / 180;
    for (let gy = -1; gy <= repeatY; gy++) {
      for (let gx = -1; gx <= repeatX; gx++) {
        c.save();
        c.translate((gx + 0.5) * cellW, (gy + 0.5) * cellH);
        c.rotate(angle);
        if (vis.drawMirror && ((gx + gy) & 1)) c.scale(-1, 1);
        c.translate(-cellW / 2, -cellH / 2);
        paintCustomCamoStrokes(c, vis.drawStrokes || [], {
          width: cellW,
          height: cellH,
          colorA: swRgb(patches[0], 0.97),
          colorB: swRgb(patches[1] || patches[0], 0.97),
          eraseColor: swRgb(base),
        });
        c.restore();
      }
    }
  } else if (scheme === 'nato' && patches.length) {
    const black = patches[0], brown = patches[1] || patches[0];
    for (let i = 0; i < 6; i++) {
      const r = S * (i < 2 ? 0.085 : 0.04) * (0.8 + rng() * 0.5);
      swBlob(c, rng, rng() * W, rng() * H, r);
      c.fillStyle = swRgb(brown, 0.96);
      c.fill();
    }
    for (let i = 0; i < 5; i++) {
      const r = S * (i < 2 ? 0.06 : 0.032) * (0.8 + rng() * 0.5);
      swBlob(c, rng, rng() * W, rng() * H, r);
      c.fillStyle = swRgb(black, 0.94);
      c.fill();
    }
  } else if (scheme === 'desert' && patches.length) {
    const dark = patches[0], mid = patches[1] || patches[0];
    const pale = patches[2] || swMix(base, [255, 250, 235], 0.35);
    for (let i = 0; i < 3; i++) { // wind bands
      const y0 = rng() * H;
      c.strokeStyle = swRgb(swMix(rng() < 0.5 ? mid : pale, base, 0.45), 0.3);
      c.lineWidth = S * (0.05 + rng() * 0.05);
      c.beginPath();
      c.moveTo(-4, y0);
      c.quadraticCurveTo(W / 2, y0 + (rng() - 0.5) * H * 0.8, W + 4, y0 + (rng() - 0.5) * H);
      c.stroke();
    }
    for (let i = 0; i < 5; i++) {
      swPoly(c, rng, rng() * W, rng() * H, S * (0.05 + rng() * 0.05), 7);
      c.fillStyle = swRgb(i % 2 ? mid : dark, 0.92);
      c.fill();
    }
    for (let i = 0; i < 8; i++) {
      swPoly(c, rng, rng() * W, rng() * H, S * (0.012 + rng() * 0.02), 5);
      c.fillStyle = swRgb([dark, mid, pale][(rng() * 3) | 0], 0.85);
      c.fill();
    }
  } else if (scheme === 'winter') {
    const under = patches.length ? patches[0] : [70, 80, 55];
    for (let i = 0; i < 40; i++) { // brushed whitewash strokes
      const x0 = rng() * W, y0 = rng() * H, len = S * (0.05 + rng() * 0.1);
      const w2 = S * (0.01 + rng() * 0.02);
      c.strokeStyle = `rgba(242,245,239,${0.25 + rng() * 0.2})`;
      c.lineWidth = w2;
      c.beginPath();
      c.moveTo(x0, y0);
      c.quadraticCurveTo(x0 + (rng() - 0.5) * w2 * 3, y0 + len * 0.5, x0 + (rng() - 0.5) * w2 * 4, y0 + len);
      c.stroke();
    }
    for (let i = 0; i < 8; i++) { // worn-through factory paint
      swBlob(c, rng, rng() * W, rng() * H, S * (0.012 + rng() * 0.025));
      c.fillStyle = swRgb(under, 0.3 + rng() * 0.35);
      c.fill();
    }
  } else if ((scheme === 'digital' || scheme === 'fleck') && patches.length) {
    if (scheme === 'digital') {
      const cell = 6; // coarse enough to read as digital at tile size
      const cols = [base, ...patches];
      for (let y = 0; y < H; y += cell) {
        for (let x = 0; x < W; x += cell) {
          if (rng() < 0.55) continue; // let base show through in runs
          c.fillStyle = swRgb(cols[(rng() * cols.length) | 0], 0.9);
          c.fillRect(x, y, cell * (1 + ((rng() * 2) | 0)), cell);
        }
      }
    } else {
      for (let i = 0; i < 130; i++) { // flecktarn dot field
        const col = patches[(rng() * patches.length) | 0];
        c.fillStyle = swRgb(col, 0.85);
        c.beginPath();
        c.arc(rng() * W, rng() * H, S * 0.004 * (0.8 + rng() * 1.6), 0, Math.PI * 2);
        c.fill();
      }
    }
  } else if (scheme === 'stripes' && patches.length) {
    // camo r8: bands, not blobs — the r5 painter rewrite made 'stripes'
    // broad sprayed BANDS and the old blob swatch stopped matching the hull.
    // vis.bandAngle (naval waves) pins the direction like the painter does.
    const ang = vis.bandAngle != null ? vis.bandAngle + 0.05 : 0.9 + rng() * 0.5;
    for (let i = 0; i < 6; i++) {
      const col = swMix(patches[i % patches.length], base, 0.1);
      const w2 = S * (0.035 + rng() * 0.03);
      const x0 = rng() * W, y0 = rng() * H, len = S * 0.5;
      c.strokeStyle = swRgb(col, 0.8);
      c.lineWidth = w2;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x0 - Math.cos(ang) * len / 2, y0 - Math.sin(ang) * len / 2);
      c.quadraticCurveTo(x0 + (rng() - 0.5) * w2 * 2, y0 + (rng() - 0.5) * w2 * 2,
        x0 + Math.cos(ang) * len / 2, y0 + Math.sin(ang) * len / 2);
      c.stroke();
    }
  } else if (scheme === 'ambush' && patches.length) {
    for (let i = 0; i < 6; i++) {
      const col = swMix(patches[i % patches.length], base, 0.1);
      swBlob(c, rng, rng() * W, rng() * H, S * (0.04 + rng() * 0.05));
      c.fillStyle = swRgb(col, 0.85);
      c.fill();
    }
    for (let i = 0; i < 90; i++) {
      c.fillStyle = swRgb([base, ...patches][(rng() * (patches.length + 1)) | 0], 0.9);
      c.beginPath();
      c.arc(rng() * W, rng() * H, 0.8 + rng() * 0.9, 0, Math.PI * 2);
      c.fill();
    }
  } else if (scheme === 'merdc' && patches.length) {
    // two dominant fields + sand/black accents (camo r8)
    const dom = patches[0], sand = patches[1] || base, black = patches[2] || [43, 43, 40];
    for (let i = 0; i < 4; i++) {
      swBlob(c, rng, rng() * W, rng() * H, S * (0.06 + rng() * 0.05));
      c.fillStyle = swRgb(dom, 0.95);
      c.fill();
    }
    for (let i = 0; i < 3; i++) {
      swBlob(c, rng, rng() * W, rng() * H, S * (0.02 + rng() * 0.02));
      c.fillStyle = swRgb(i < 2 ? sand : black, 0.92);
      c.fill();
    }
  } else if (scheme === 'blotch' && patches.length) {
    for (let i = 0; i < 9; i++) {
      const col = patches[i % patches.length];
      swBlob(c, rng, rng() * W, rng() * H, S * (0.03 + rng() * 0.045));
      c.fillStyle = swRgb(col, 0.9);
      c.fill();
    }
  } else if (scheme === 'blocks' && patches.length) {
    for (let i = 0; i < 8; i++) {
      const col = patches[(rng() * patches.length) | 0];
      const w2 = S * (0.04 + rng() * 0.07), h2 = S * (0.03 + rng() * 0.05);
      c.fillStyle = swRgb(col, 0.94);
      c.fillRect(rng() * W - w2 / 2, rng() * H - h2 / 2, w2, h2);
    }
  } else if (scheme === 'washworn') {
    const under = patches.length ? patches[0] : [70, 80, 55];
    for (let i = 0; i < 26; i++) { // opaque mop swathes
      swBlob(c, rng, rng() * W, rng() * H, S * (0.025 + rng() * 0.03));
      c.fillStyle = swRgb(swMix(base, [255, 255, 255], 0.06), 0.7);
      c.fill();
    }
    for (let i = 0; i < 7; i++) { // worn-through factory bands
      swBlob(c, rng, rng() * W, rng() * H, S * (0.018 + rng() * 0.022));
      c.fillStyle = swRgb(under, 0.55 + rng() * 0.25);
      c.fill();
    }
  } else if (scheme === 'caunter' && patches.length) {
    const ang = 0.7;
    for (let i = 0; i < 4; i++) {
      const col = patches[i % patches.length];
      const w2 = S * (0.03 + rng() * 0.025);
      const x0 = rng() * W, y0 = rng() * H;
      c.strokeStyle = swRgb(col, 0.94);
      c.lineWidth = w2;
      c.lineCap = 'butt';
      c.beginPath();
      c.moveTo(x0 - Math.cos(ang) * S * 0.3, y0 - Math.sin(ang) * S * 0.3);
      c.lineTo(x0 + Math.cos(ang) * S * 0.3, y0 + Math.sin(ang) * S * 0.3);
      c.stroke();
    }
  } else if (scheme === 'splinter' && patches.length) {
    // camo r2: 'm90' rides this painter with rainK 0 (no Regenstreifen) and
    // larger wedges — mirror both knobs at tile scale.
    const pk = vis.patchK || 1;
    for (let i = 0; i < 6; i++) {
      const col = patches[i % patches.length];
      swPoly(c, rng, rng() * W, rng() * H, S * pk * (0.035 + rng() * 0.04), 5);
      c.fillStyle = swRgb(col, 0.95);
      c.fill();
    }
    if (vis.rainK !== 0) {
      c.strokeStyle = swRgb(swMix(patches[0], [40, 44, 38], 0.55), 0.7);
      c.lineWidth = 1;
      for (let i = 0; i < 26; i++) { // rain strokes
        const x0 = rng() * W, y0 = rng() * H, len = 4 + rng() * 6;
        c.beginPath();
        c.moveTo(x0, y0);
        c.lineTo(x0 + len * 0.45, y0 + len);
        c.stroke();
      }
    }
  } else if (scheme === 'dazzle' && patches.length) {
    for (let i = 0; i < 7; i++) {
      const col = patches[i % patches.length];
      const ang = (i % 3 === 2 ? 1 : -1) * (0.6 + rng() * 0.3);
      const w2 = S * (0.025 + rng() * 0.03);
      const x0 = rng() * W, y0 = rng() * H;
      c.strokeStyle = swRgb(col, 0.96);
      c.lineWidth = w2;
      c.lineCap = 'butt';
      c.beginPath();
      c.moveTo(x0 - Math.cos(ang) * S * 0.35, y0 - Math.sin(ang) * S * 0.35);
      c.lineTo(x0 + Math.cos(ang) * S * 0.35, y0 + Math.sin(ang) * S * 0.35);
      c.stroke();
    }
  } else if (scheme === 'tigerstripe' && patches.length) {
    // camo r2: jagged near-horizontal claw strokes — dark dominant, thin
    // pale interstripes (mirrors the tigerstripe painter at tile scale)
    const dark = patches[0];
    const pale = patches[1] || swMix(base, [214, 208, 168], 0.4);
    const drawStripe = (col, w2, alpha) => {
      const x0 = rng() * W, y0 = rng() * H, len = S * (0.28 + rng() * 0.2);
      const ang = 0.12 + (rng() - 0.5) * 0.3;
      c.strokeStyle = swRgb(col, alpha);
      c.lineWidth = w2;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x0 - Math.cos(ang) * len / 2, y0 - Math.sin(ang) * len / 2);
      c.quadraticCurveTo(x0 + (rng() - 0.5) * 8, y0 + (rng() - 0.5) * 10,
        x0 + Math.cos(ang) * len / 2, y0 + Math.sin(ang) * len / 2);
      c.stroke();
    };
    for (let i = 0; i < 4; i++) drawStripe(pale, 1 + rng() * 1.4, 0.85);
    for (let i = 0; i < 6; i++) drawStripe(dark, 2.5 + rng() * 3, 0.94);
  } else if (scheme === 'chip6' && patches.length) {
    // camo r2: choc-chip — wavy bands + pale cookies rimmed with black chips
    const bDark = patches[0], bPale = patches[1] || base;
    const cookie = patches[2] || swMix(base, [228, 232, 230], 0.55);
    const chip = patches[3] || [51, 52, 47];
    for (let i = 0; i < 3; i++) {
      const y0 = rng() * H;
      c.strokeStyle = swRgb(swMix(i % 2 ? bDark : bPale, base, 0.12), 0.85);
      c.lineWidth = S * (0.05 + rng() * 0.04);
      c.beginPath();
      c.moveTo(-4, y0);
      c.quadraticCurveTo(W / 2, y0 + (rng() - 0.5) * H * 0.9, W + 4, y0 + (rng() - 0.5) * H * 0.7);
      c.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const x = rng() * W, y = rng() * H, r = 3.4 + rng() * 2.6;
      swBlob(c, rng, x, y, r);
      c.fillStyle = swRgb(cookie, 0.94);
      c.fill();
      c.fillStyle = swRgb(chip, 0.92);
      const nk = 2 + ((rng() * 2) | 0);
      for (let j = 0; j < nk; j++) {
        const a2 = rng() * Math.PI * 2;
        c.beginPath();
        c.arc(x + Math.cos(a2) * r * 0.7, y + Math.sin(a2) * r * 0.55, 0.9 + rng() * 0.7, 0, Math.PI * 2);
        c.fill();
      }
    }
  } else if (scheme === 'brush' && patches.length) {
    // camo r2: DPM — directional brush strokes, green/brown then black on top
    const flow = 0.6 + rng() * 0.5;
    const strokeOne = (col, w2, alpha) => {
      const x0 = rng() * W, y0 = rng() * H, len = S * (0.16 + rng() * 0.14);
      const a = flow + (rng() - 0.5) * 0.6 + (rng() < 0.18 ? Math.PI / 2 : 0);
      c.strokeStyle = swRgb(col, alpha);
      c.lineWidth = w2;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x0, y0);
      c.quadraticCurveTo(x0 + Math.cos(a) * len * 0.5 + (rng() - 0.5) * 6,
        y0 + Math.sin(a) * len * 0.5 + (rng() - 0.5) * 6,
        x0 + Math.cos(a) * len, y0 + Math.sin(a) * len);
      c.stroke();
    };
    const green = patches[0], brown = patches[1] || patches[0], black = patches[2] || null;
    for (let i = 0; i < 5; i++) strokeOne(green, 2.6 + rng() * 2.4, 0.92);
    for (let i = 0; i < 4; i++) strokeOne(brown, 2.4 + rng() * 2.2, 0.92);
    if (black) for (let i = 0; i < 3; i++) strokeOne(black, 1.4 + rng() * 1.4, 0.9);
  } else if (scheme === 'amoeba' && patches.length) {
    // camo r2: few LARGE rounded masses + sparse ochre accents
    const dark = patches[0], ochre = patches[1] || null;
    for (let i = 0; i < 3; i++) {
      const x = rng() * W, y = rng() * H, r = S * (0.055 + rng() * 0.035);
      swBlob(c, rng, x, y, r);
      c.fillStyle = swRgb(dark, 0.92);
      c.fill();
      swBlob(c, rng, x + (rng() - 0.5) * r * 1.6, y + (rng() - 0.5) * r * 1.2, r * 0.65);
      c.fill();
    }
    if (ochre) for (let i = 0; i < 2; i++) {
      swBlob(c, rng, rng() * W, rng() * H, S * (0.018 + rng() * 0.014));
      c.fillStyle = swRgb(ochre, 0.85);
      c.fill();
    }
  } else if (scheme === 'hexfield' && patches.length) {
    // camo r2: honeycomb cell field, ~55% filled from two tones
    const tones = [patches[0], patches[1] || patches[0]];
    const hexR = 4.6, cw = hexR * 1.5, rh = hexR * Math.sqrt(3);
    for (let gy = 0; gy < Math.ceil(H / rh) + 1; gy++) {
      for (let gx = 0; gx < Math.ceil(W / cw) + 1; gx++) {
        const v = rng();
        if (v < 0.45) continue;
        const x = gx * cw, y = gy * rh + (gx % 2 ? rh / 2 : 0);
        c.fillStyle = swRgb(v < 0.75 ? tones[0] : tones[1], 0.9);
        c.beginPath();
        for (let k2 = 0; k2 < 6; k2++) {
          const a2 = (k2 / 6) * Math.PI * 2;
          const px2 = x + Math.cos(a2) * hexR * 0.92, py2 = y + Math.sin(a2) * hexR * 0.8;
          if (k2 === 0) c.moveTo(px2, py2); else c.lineTo(px2, py2);
        }
        c.closePath();
        c.fill();
      }
    }
  } else if (scheme === 'claude' && patches.length) {
    // claude camo r5: the creature IS the print — hero + satellite Claude
    // Code guys in terracotta/slate straight on ivory (fields gone, owner
    // ask; same card language as 'spark'). evenodd keeps the eyes open.
    const terra = patches[0], slate = patches[1] || patches[0];
    const guy = (x, y, s, ink, a) => {
      c.save();
      c.translate(x, y);
      c.scale(s / 24, s / 24);
      c.translate(-12, -12.5);
      c.fillStyle = swRgb(ink, a);
      c.fill(new Path2D(CLAUDE_CODE_MARK), 'evenodd');
      c.restore();
    };
    guy(W * 0.30, H * 0.5, H * 1.05, terra, 0.95);
    guy(W * 0.68, H * 0.42, H * 0.6, slate, 0.9);
    guy(W * 0.88, H * 0.68, H * 0.42, terra, 0.8);
  } else if (scheme === 'spark' && patches.length) {
    // camo r4: the Claude spark from sprinkle to hero scale on warm ivory.
    const terra = patches[0], slate = patches[1] || patches[0];
    const spark = (x, y, s, ink, a) => {
      c.save();
      c.translate(x, y);
      c.scale(s / 24, s / 24);
      c.translate(-12, -12);
      c.fillStyle = swRgb(ink, a);
      c.fill(new Path2D(CLAUDE_SPARK_MARK));
      c.restore();
    };
    spark(W * 0.28, H * 0.5, H * 1.05, terra, 0.95);
    spark(W * 0.66, H * 0.4, H * 0.55, slate, 0.9);
    spark(W * 0.88, H * 0.66, H * 0.4, terra, 0.8);
  } else if (scheme === 'ducky' && patches.length) {
    // camo r6 fun set: each card sells its motif with 1-3 signature marks.
    const gold = patches[0], ink = patches[1] || patches[0];
    const duck = (x, y, sc, a) => {
      c.save(); c.translate(x, y); c.scale(sc, sc);
      c.fillStyle = swRgb(gold, a);
      c.beginPath(); c.ellipse(0.02, 0.10, 0.46, 0.33, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(-0.30, -0.28, 0.22, 0.21, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(-0.48, -0.36); c.lineTo(-0.68, -0.26);
      c.lineTo(-0.48, -0.18); c.closePath(); c.fill();
      c.fillStyle = swRgb(ink, a);
      c.beginPath(); c.arc(-0.34, -0.31, 0.05, 0, Math.PI * 2); c.fill();
      c.restore();
    };
    duck(W * 0.32, H * 0.52, H * 0.6, 0.95);
    duck(W * 0.74, H * 0.5, H * 0.32, 0.9);
  } else if (scheme === 'suits' && patches.length) {
    const red = patches[0], blk = patches[1] || patches[0];
    const glyph = (d, x, y, sc, col) => {
      c.save(); c.translate(x, y); c.scale(sc / 24, sc / 24); c.translate(-12, -12);
      c.fillStyle = swRgb(col, 0.94); c.fill(new Path2D(d)); c.restore();
    };
    const HEART = 'M12 21C4 13 2 9 2 6.5 2 3.5 4.2 2 6.5 2 8.6 2 10.8 3.2 12 5.6' +
      ' 13.2 3.2 15.4 2 17.5 2 19.8 2 22 3.5 22 6.5 22 9 20 13 12 21Z';
    const SPADE = 'M12 2C20 10 22 12.5 22 15 22 18 19.8 19.5 17.5 19.5 16 19.5 14.6' +
      ' 18.9 13.6 17.8L15.2 23H8.8L10.4 17.8C9.4 18.9 8 19.5 6.5 19.5 4.2 19.5 2 18' +
      ' 2 15 2 12.5 4 10 12 2Z';
    glyph(HEART, W * 0.3, H * 0.5, H * 0.85, red);
    glyph(SPADE, W * 0.68, H * 0.46, H * 0.55, blk);
    glyph(HEART, W * 0.88, H * 0.68, H * 0.35, red);
  } else if (scheme === 'flames' && patches.length) {
    const fr = patches[0], fo = patches[1] || fr, fg = patches[2] || fo;
    const lick = (x, y, sc, col, a) => {
      c.fillStyle = swRgb(col, a);
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        c.arc(x + k * sc * 0.6, y - k * sc * 0.3, sc * (0.5 - k * 0.13), 0, Math.PI * 2);
        c.fill();
      }
    };
    lick(W * 0.16, H * 0.66, H * 0.52, fr, 0.95);
    lick(W * 0.2, H * 0.62, H * 0.36, fo, 0.95);
    lick(W * 0.24, H * 0.6, H * 0.22, fg, 0.95);
    lick(W * 0.62, H * 0.56, H * 0.34, fr, 0.9);
    lick(W * 0.65, H * 0.53, H * 0.2, fo, 0.9);
  } else if (scheme === 'leopardprint' && patches.length) {
    const amber = patches[0], blk = patches[1] || patches[0];
    for (let i = 0; i < 7; i++) {
      const x = rng() * W, y = rng() * H, r = S * 0.032 * (0.8 + rng() * 0.6);
      swBlob(c, rng, x, y, r * 0.75);
      c.fillStyle = swRgb(amber, 0.9); c.fill();
      c.strokeStyle = swRgb(blk, 0.92); c.lineWidth = r * 0.5;
      const n = 3 + ((rng() * 3) | 0), a0 = rng() * 7;
      for (let k = 0; k < n; k++) {
        c.beginPath();
        const a1 = a0 + (k / n) * Math.PI * 2;
        c.arc(x, y, r, a1, a1 + 0.6); c.stroke();
      }
    }
  } else if (scheme === 'bolt' && patches.length) {
    const gold = patches[0], ink = patches[1] || patches[0];
    const zap = (x, y, sc, col, a) => {
      c.save(); c.translate(x, y); c.scale(sc, sc);
      c.fillStyle = swRgb(col, a);
      c.beginPath();
      c.moveTo(0.06, -0.5); c.lineTo(0.26, -0.5); c.lineTo(0.03, -0.09);
      c.lineTo(0.2, -0.09); c.lineTo(-0.14, 0.5); c.lineTo(-0.02, 0.05);
      c.lineTo(-0.2, 0.05); c.closePath(); c.fill(); c.restore();
    };
    zap(W * 0.32, H * 0.5, H * 0.85, gold, 0.95);
    zap(W * 0.66, H * 0.48, H * 0.5, ink, 0.9);
    zap(W * 0.86, H * 0.62, H * 0.32, gold, 0.85);
  } else if (scheme === 'stars' && patches.length) {
    const cream = patches[0], gold = patches[1] || patches[0];
    const star = (x, y, sc, col, a) => {
      c.save(); c.translate(x, y); c.scale(sc, sc);
      c.fillStyle = swRgb(col, a); c.beginPath();
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 ? 0.21 : 0.5, aa = -Math.PI / 2 + (k * Math.PI) / 5;
        const px = Math.cos(aa) * rr, py = Math.sin(aa) * rr;
        if (k) c.lineTo(px, py); else c.moveTo(px, py);
      }
      c.closePath(); c.fill(); c.restore();
    };
    star(W * 0.3, H * 0.5, H * 0.8, cream, 0.95);
    star(W * 0.68, H * 0.42, H * 0.45, gold, 0.9);
    star(W * 0.87, H * 0.68, H * 0.28, gold, 0.85);
  } else if (scheme === 'daisy' && patches.length) {
    const cream = patches[0], button = patches[1] || patches[0];
    const flower = (x, y, sc, a) => {
      for (let k = 0; k < 6; k++) {
        const aa = (k * Math.PI) / 3 + 0.3;
        c.beginPath();
        c.ellipse(x + Math.cos(aa) * sc * 0.3, y + Math.sin(aa) * sc * 0.3,
          sc * 0.21, sc * 0.115, aa, 0, Math.PI * 2);
        c.fillStyle = swRgb(cream, a); c.fill();
      }
      c.beginPath(); c.arc(x, y, sc * 0.145, 0, Math.PI * 2);
      c.fillStyle = swRgb(button, a); c.fill();
    };
    flower(W * 0.3, H * 0.5, H * 0.75, 0.95);
    flower(W * 0.72, H * 0.5, H * 0.42, 0.9);
  } else if (scheme === 'circuit' && patches.length) {
    const pad = patches[0], trace = patches[1] || patches[0];
    const via = (x, y, r) => {
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle = swRgb(pad, 0.92); c.fill();
    };
    c.strokeStyle = swRgb(trace, 0.85); c.lineWidth = 2.4;
    for (let i = 0; i < 5; i++) {
      let x = rng() * W, y = rng() * H;
      via(x, y, 2.6);
      c.beginPath(); c.moveTo(x, y);
      let dir = ((rng() * 4) | 0) * (Math.PI / 2);
      for (let k = 0; k < 2; k++) {
        const len = W * (0.1 + rng() * 0.15);
        x += Math.cos(dir) * len; y += Math.sin(dir) * len;
        c.lineTo(x, y);
        dir += (rng() < 0.5 ? 1 : -1) * (Math.PI / 4);
      }
      c.stroke(); via(x, y, 2.6);
    }
    c.fillStyle = swRgb(swMix(base, [0, 0, 0], 0.45), 0.95);
    c.fillRect(W * 0.62, H * 0.3, W * 0.14, H * 0.34);
  } else if (scheme === 'racing' && patches.length) {
    const red = patches[0], blk = patches[1] || patches[0];
    c.save(); c.translate(W * 0.38, H * 0.5); c.rotate(-0.3);
    c.fillStyle = swRgb(red, 0.94); c.fillRect(-W * 0.07, -H * 2, W * 0.14, H * 4);
    c.fillRect(W * 0.1, -H * 2, W * 0.045, H * 4);
    c.fillStyle = swRgb(blk, 0.9); c.fillRect(-W * 0.11, -H * 2, W * 0.016, H * 4);
    c.restore();
    c.beginPath(); c.arc(W * 0.74, H * 0.48, H * 0.34, 0, Math.PI * 2);
    c.fillStyle = swRgb(swMix(base, [255, 255, 255], 0.55), 0.96); c.fill();
    c.lineWidth = H * 0.05; c.strokeStyle = swRgb(blk, 0.92); c.stroke();
    c.fillStyle = swRgb(blk, 0.94);
    c.font = `900 ${Math.round(H * 0.4)}px 'ABC Monument Grotesk', sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('7', W * 0.74, H * 0.5);
  } else if (scheme === 'paintball' && patches.length) {
    for (let i = 0; i < 4; i++) {
      const col = patches[i % patches.length];
      const x = rng() * W, y = rng() * H, r = S * 0.045 * (0.7 + rng() * 0.6);
      swBlob(c, rng, x, y, r);
      c.fillStyle = swRgb(col, 0.92); c.fill();
      for (let k = 0; k < 5; k++) {
        const aa = rng() * Math.PI * 2, d = r * (1.2 + rng() * 1.4);
        c.beginPath();
        c.arc(x + Math.cos(aa) * d, y + Math.sin(aa) * d * 0.8,
          r * (0.08 + rng() * 0.12), 0, Math.PI * 2);
        c.fill();
      }
    }
  } else if (scheme === 'star' && patches.length) {
    // camo r7 loadout set: the circled invasion star on olive drab
    const white = patches[0];
    const star = (x, y, sc, a) => {
      c.save(); c.translate(x, y); c.scale(sc, sc);
      c.fillStyle = swRgb(white, a); c.beginPath();
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 ? 0.21 : 0.5, aa = -Math.PI / 2 + (k * Math.PI) / 5;
        const px = Math.cos(aa) * rr, py = Math.sin(aa) * rr;
        if (k) c.lineTo(px, py); else c.moveTo(px, py);
      }
      c.closePath(); c.fill(); c.restore();
    };
    star(W * 0.34, H * 0.5, H * 0.7, 0.95);
    c.strokeStyle = swRgb(white, 0.9); c.lineWidth = H * 0.045;
    c.beginPath(); c.arc(W * 0.34, H * 0.5, H * 0.46, 0.3, Math.PI * 2 - 0.2); c.stroke();
    star(W * 0.76, H * 0.5, H * 0.36, 0.9);
  } else if (scheme === 'idband' && patches.length) {
    // camo r7 loadout set: white recognition band + tactical number on 4BO
    const white = patches[0];
    c.fillStyle = swRgb(white, 0.9);
    c.fillRect(0, H * 0.34, W, H * 0.12);
    c.font = `900 ${Math.round(H * 0.5)}px 'ABC Monument Grotesk', sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('312', W * 0.68, H * 0.66);
  } else if (scheme === 'brushwash' && patches.length) {
    // camo r8: streaky brushed whitewash with OD dragging through
    const od = patches[0];
    c.strokeStyle = swRgb(od, 0.4); c.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      c.lineWidth = 1 + rng() * 2.5;
      c.beginPath();
      const y = rng() * H, x = rng() * W;
      c.moveTo(x, y);
      c.quadraticCurveTo(x + 18, y + (rng() - 0.5) * 6, x + 30 + rng() * 24, y + (rng() - 0.5) * 8);
      c.stroke();
    }
  } else if (scheme === 'usmc' && patches.length) {
    const blk = patches[0], white = patches[2] || patches[0];
    c.strokeStyle = swRgb(blk, 0.92); c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      c.lineWidth = 5 + rng() * 4;
      c.beginPath();
      const y = rng() * H;
      c.moveTo(-4, y);
      c.quadraticCurveTo(W * 0.3, y + (rng() - 0.5) * 22, W * 0.6, y + (rng() - 0.5) * 14);
      c.quadraticCurveTo(W * 0.85, y + (rng() - 0.5) * 22, W + 4, y + (rng() - 0.5) * 12);
      c.stroke();
    }
    c.fillStyle = swRgb(white, 0.9);
    c.font = `900 ${Math.round(H * 0.5)}px 'ABC Monument Grotesk', sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('34', W * 0.78, H * 0.5);
  } else if (scheme === 'erdl' && patches.length) {
    const dk = patches[0], br = patches[1] || dk, bk = patches[2] || dk;
    for (let i = 0; i < 6; i++) {
      swBlob(c, rng, rng() * W, rng() * H, S * 0.035 * (0.7 + rng() * 0.7));
      c.fillStyle = swRgb(dk, 0.95); c.fill();
    }
    for (let i = 0; i < 4; i++) {
      swBlob(c, rng, rng() * W, rng() * H, S * 0.024 * (0.7 + rng() * 0.6));
      c.fillStyle = swRgb(br, 0.93); c.fill();
    }
    c.strokeStyle = swRgb(bk, 0.92); c.lineWidth = 1.6; c.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      const x = rng() * W, y = rng() * H;
      c.moveTo(x, y);
      c.quadraticCurveTo(x + (rng() - 0.5) * 16, y + (rng() - 0.5) * 16,
        x + (rng() - 0.5) * 26, y + (rng() - 0.5) * 26);
      c.stroke();
    }
  } else if (scheme === 'mudwash' && patches.length) {
    const wet = patches[0], dry = patches[1] || wet, dark = patches[2] || wet;
    for (let i = 0; i < 2; i++) {
      swBlob(c, rng, rng() * W, rng() * H, S * 0.035);
      c.fillStyle = swRgb(dry, 0.85); c.fill();
      c.strokeStyle = swRgb(dark, 0.7); c.lineWidth = 1.4; c.stroke();
    }
    for (let i = 0; i < 60; i++) {
      c.beginPath();
      c.arc(rng() * W, rng() * H, 0.5 + rng() * 1.8, 0, Math.PI * 2);
      c.fillStyle = swRgb(rng() < 0.3 ? dark : wet, 0.5 + rng() * 0.3);
      c.fill();
    }
  }
  // faint top-light so the tile reads as painted steel, not a flat chip
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0.08)');
  g.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.14)');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
}

// AUTO is a per-map policy, so its tile previews four real resolved pattern
// families as a clean seasonal contact sheet. The caption below already
// supplies the AUTO identity, so no badge obscures the paint.
function paintAutoCamoSwatch(canvas, spec) {
  const W = 128, H = 44;
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  c.fillStyle = '#11171c';
  c.fillRect(0, 0, W, H);
  const patterns = ['summer', 'desert', 'winter', 'urbanblock'];
  const scratch = document.createElement('canvas');
  const cellW = W / 2;
  const cellH = H / 2;
  patterns.forEach((pattern, index) => {
    paintCamoSwatch(scratch, spec, pattern);
    const x = (index % 2) * cellW;
    const y = Math.floor(index / 2) * cellH;
    c.drawImage(scratch, 0, 0, W, H, x, y, cellW, cellH);
  });
  c.strokeStyle = 'rgba(235,243,250,.28)';
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(cellW, 0); c.lineTo(cellW, H); c.stroke();
  c.beginPath(); c.moveTo(0, cellH); c.lineTo(W, cellH); c.stroke();
  const shade = c.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(255,255,255,.07)');
  shade.addColorStop(0.55, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(3,6,8,.22)');
  c.fillStyle = shade;
  c.fillRect(0, 0, W, H);
}
// --- END CAMO PICKER SECTION (swatch painter) --------------------------------

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
 *   onStudioIntent?:Function}} opts
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
  ensureStyle('cot-garage-style', GARAGE_CSS);

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
    `<span class="nav-label">GitHub</span><span class="github-stars" data-github-stars>145</span></a>` +
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
  // r9.5: the list moved to featuredShots.js — ONE copy shared with the boot
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
    // r9.1 (owner): lead with a DIFFERENT shot each load
    const first = Math.floor(Math.random() * FEATURED_SHOTS.length);
    preload(first, () => { show(first); arm(); });
    shotEl.addEventListener('click', () => { advance('high'); rearm(); });
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
  const battleChoices = [...root.querySelectorAll('.cot-battle-choice')];
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
          src: selected.thumb,
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
  const camoCardById = new Map();
  let customCamoEl = null;
  let customCamoModal = null;
  let customPreview = null;
  let customDraw = null;
  let customTone = 0;
  let customBrush = 'round';
  let customAsset = 'star';
  let drawingStroke = -1;
  let customDraft = normalizeCustomCamo();
  const drawCustomTile = () => {
    if (!customDraw) return;
    const ctx = customDraw.getContext('2d');
    const width = customDraw.width;
    const height = customDraw.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = customDraft.base;
    ctx.fillRect(0, 0, width, height);
    paintCustomCamoStrokes(ctx, customDraft.strokes, {
      width, height, colorA: customDraft.colorA, colorB: customDraft.colorB, eraseColor: customDraft.base,
    });
  };
  const repaintCustomPreview = () => {
    drawCustomTile();
    if (!customPreview || !selectedId) return;
    const spec = specById.get(selectedId);
    if (spec) paintCamoSwatch(customPreview, spec, customCamoPatternId(customDraft));
  };
  const syncCustomControls = () => {
    if (!customCamoEl) return;
    customCamoEl.querySelectorAll('[data-custom-tone]').forEach((button) => {
      const on = Number(button.dataset.customTone) === customTone;
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
    });
    customCamoEl.querySelectorAll('[data-custom-brush-type]').forEach((button) => {
      const on = button.dataset.customBrushType === customBrush;
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
    });
    customCamoEl.querySelectorAll('[data-custom-asset]').forEach((button) => {
      const on = button.dataset.customAsset === customAsset && customBrush === 'stamp';
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
    });
    for (const key of ['base', 'colorA', 'colorB']) {
      const input = customCamoEl.querySelector(`[data-custom-color="${key}"]`);
      if (input) input.value = customDraft[key];
    }
    for (const [key, value] of [['repeat-x', customDraft.repeatX], ['repeat-y', customDraft.repeatY], ['rotation', customDraft.rotation]]) {
      const input = customCamoEl.querySelector(`[data-custom-${key}]`);
      const output = customCamoEl.querySelector(`[data-custom-${key}-value]`);
      if (input) input.value = String(value);
      if (output) output.value = key === 'rotation' ? `${value}°` : `${value}×`;
    }
    const mirror = customCamoEl.querySelector('[data-custom-mirror]');
    if (mirror) mirror.checked = customDraft.mirror;
    repaintCustomPreview();
  };
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
      customOpenButton.innerHTML = `${uiIconSVG('brush', 12)}<span>Create your own</span>`;
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
      customCamoModal = createModal({
        title: 'Custom camouflage studio',
        eyebrow: 'Local paint laboratory',
        subtitle: 'Author one seamless tile, preview it on the selected vehicle, then save it to this device.',
        size: 'wide',
        onOpen: () => customOpenButton?.setAttribute('aria-expanded', 'true'),
        onClose: () => customOpenButton?.setAttribute('aria-expanded', 'false'),
      });
      customCamoEl = document.createElement('div');
      customCamoEl.className = 'cot-camo-lab';
      const canvasColumn = document.createElement('section');
      canvasColumn.className = 'cot-camo-lab__canvas';
      const canvasHeading = document.createElement('div');
      canvasHeading.className = 'cot-camo-lab__heading';
      canvasHeading.innerHTML = `<span>Pattern tile</span><small>512 × 256 authoring surface</small>`;
      const drawWrap = document.createElement('div');
      drawWrap.className = 'cot-custom-draw-wrap';
      customDraw = document.createElement('canvas');
      customDraw.className = 'cot-custom-draw';
      customDraw.width = 512;
      customDraw.height = 256;
      customDraw.tabIndex = 0;
      customDraw.setAttribute('aria-label', 'Paint a repeating camouflage tile');
      customDraw.setAttribute('role', 'application');
      const drawLabel = document.createElement('span');
      drawLabel.className = 'cot-custom-draw-label';
      drawLabel.textContent = 'Drag to paint · tap to stamp';
      drawWrap.append(customDraw, drawLabel);
      const tools = document.createElement('div');
      tools.className = 'cot-custom-tools';
      const brushDefs = [
        ['round', 'brush', 'Round'], ['flat', 'stamp', 'Flat'], ['spray', 'spray', 'Spray'],
        ['pixel', 'pixels', 'Pixel'], ['eraser', 'eraser', 'Eraser'],
      ];
      for (const [id, icon, label] of brushDefs) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cot-custom-tool';
        button.dataset.customBrushType = id;
        button.innerHTML = `${uiIconSVG(icon, 17)}<span>${label}</span>`;
        button.addEventListener('click', () => {
          customBrush = id;
          syncCustomControls();
        });
        tools.appendChild(button);
      }
      for (const [tone, label] of [[0, 'Tone 1'], [1, 'Tone 2']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cot-custom-tool';
        button.dataset.customTone = String(tone);
        button.innerHTML = `${uiIconSVG('camouflage', 17)}<span>${label}</span>`;
        button.addEventListener('click', () => {
          customTone = tone;
          if (customBrush === 'eraser') customBrush = 'round';
          syncCustomControls();
        });
        tools.appendChild(button);
      }
      const undoDraft = () => {
        customDraft = normalizeCustomCamo({ ...customDraft, style: 'drawn', strokes: customDraft.strokes.slice(0, -1) });
        syncCustomControls();
      };
      const undo = document.createElement('button');
      undo.type = 'button';
      undo.className = 'cot-custom-tool';
      undo.innerHTML = `${uiIconSVG('undo', 17)}<span>Undo</span>`;
      undo.addEventListener('click', undoDraft);
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'cot-custom-tool';
      clear.innerHTML = `${uiIconSVG('trash', 17)}<span>Clear</span>`;
      clear.addEventListener('click', () => {
        customDraft = normalizeCustomCamo({ ...customDraft, style: 'drawn', strokes: [] });
        syncCustomControls();
      });
      tools.append(undo, clear);
      const assetPanel = document.createElement('div');
      assetPanel.className = 'cot-camo-lab__panel';
      const assetHeading = document.createElement('div');
      assetHeading.className = 'cot-camo-lab__heading';
      assetHeading.innerHTML = '<span>Stencil assets</span><small>Select, then place on the tile</small>';
      const assets = document.createElement('div');
      assets.className = 'cot-custom-assets';
      const assetIcons = { star: 'star', chevron: 'chevronRight', leaf: 'camouflage', hex: 'pixels', cross: 'repair' };
      for (const asset of CUSTOM_CAMO_ASSETS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cot-custom-tool';
        button.dataset.customAsset = asset;
        button.innerHTML = `${uiIconSVG(assetIcons[asset], 18)}<span>${asset}</span>`;
        button.addEventListener('click', () => {
          customAsset = asset;
          customBrush = 'stamp';
          syncCustomControls();
        });
        assets.appendChild(button);
      }
      assetPanel.append(assetHeading, assets);
      canvasColumn.append(canvasHeading, tools, drawWrap, assetPanel);

      const controlsColumn = document.createElement('aside');
      controlsColumn.className = 'cot-camo-lab__controls';
      const previewPanel = document.createElement('div');
      previewPanel.className = 'cot-camo-lab__panel';
      const previewHeading = document.createElement('div');
      previewHeading.className = 'cot-camo-lab__heading';
      previewHeading.innerHTML = '<span>Vehicle preview</span><small>Live material bake</small>';
      const preview = document.createElement('div');
      preview.className = 'cot-custom-preview';
      customPreview = document.createElement('canvas');
      const localOnly = document.createElement('span');
      localOnly.className = 'cot-custom-local';
      localOnly.textContent = 'Solo · this device only';
      preview.append(customPreview, localOnly);
      previewPanel.append(previewHeading, preview);

      const colorPanel = document.createElement('div');
      colorPanel.className = 'cot-camo-lab__panel';
      const colorHeading = document.createElement('div');
      colorHeading.className = 'cot-camo-lab__heading';
      colorHeading.innerHTML = '<span>Palette</span><small>Base + two field tones</small>';
      const colors = document.createElement('div');
      colors.className = 'cot-custom-colors';
      for (const [key, label] of [['base', 'Base'], ['colorA', 'Tone 1'], ['colorB', 'Tone 2']]) {
        const wrap = document.createElement('label');
        wrap.className = 'cot-custom-color';
        const input = document.createElement('input');
        input.type = 'color';
        input.dataset.customColor = key;
        input.setAttribute('aria-label', `${label} color`);
        const text = document.createElement('span');
        text.textContent = label;
        input.addEventListener('input', () => {
          customDraft = normalizeCustomCamo({ ...customDraft, style: 'drawn', [key]: input.value });
          syncCustomControls();
        });
        wrap.append(input, text);
        colors.appendChild(wrap);
      }
      colorPanel.append(colorHeading, colors);

      const repeatPanel = document.createElement('div');
      repeatPanel.className = 'cot-camo-lab__panel cot-custom-repeat-grid';
      const brush = document.createElement('label');
      brush.className = 'cot-custom-repeat';
      brush.innerHTML = '<span>Brush size</span><input type="range" min="2" max="40" step="1" value="8" data-custom-brush><output data-custom-brush-value>8</output>';
      const brushInput = brush.querySelector('input');
      const brushOutput = brush.querySelector('output');
      brushInput.addEventListener('input', () => { brushOutput.value = brushInput.value; });
      repeatPanel.appendChild(brush);
      for (const [key, label] of [['repeat-x', 'Repeat X'], ['repeat-y', 'Repeat Y']]) {
        const control = document.createElement('label');
        control.className = 'cot-custom-repeat';
        control.innerHTML = `<span>${label}</span><input type="range" min="1" max="8" step="1" data-custom-${key}><output data-custom-${key}-value></output>`;
        const input = control.querySelector('input');
        input.addEventListener('input', () => {
          const field = key === 'repeat-x' ? 'repeatX' : 'repeatY';
          customDraft = normalizeCustomCamo({ ...customDraft, style: 'drawn', [field]: Number(input.value) });
          syncCustomControls();
        });
        repeatPanel.appendChild(control);
      }
      const rotation = document.createElement('label');
      rotation.className = 'cot-custom-repeat';
      rotation.innerHTML = '<span>Tile rotation</span><input type="range" min="-180" max="180" step="15" data-custom-rotation><output data-custom-rotation-value></output>';
      rotation.querySelector('input').addEventListener('input', (event) => {
        customDraft = normalizeCustomCamo({ ...customDraft, style: 'drawn', rotation: Number(event.target.value) });
        syncCustomControls();
      });
      const mirror = document.createElement('label');
      mirror.className = 'cot-custom-check';
      mirror.innerHTML = '<input type="checkbox" data-custom-mirror><span>Mirror alternate tiles to hide seams</span>';
      mirror.querySelector('input').addEventListener('change', (event) => {
        customDraft = normalizeCustomCamo({ ...customDraft, style: 'drawn', mirror: event.target.checked });
        syncCustomControls();
      });
      repeatPanel.append(rotation, mirror);

      const transferPanel = document.createElement('div');
      transferPanel.className = 'cot-camo-lab__panel';
      const transferHeading = document.createElement('div');
      transferHeading.className = 'cot-camo-lab__heading';
      transferHeading.innerHTML = '<span>Copy & paste</span><small>Share pattern recipes between local vehicles</small>';
      const transfer = document.createElement('div');
      transfer.className = 'cot-custom-transfer';
      const status = document.createElement('div');
      status.className = 'cot-custom-status';
      status.setAttribute('role', 'status');
      const setStatus = (message, kind = '') => {
        status.textContent = message;
        status.className = `cot-custom-status${kind ? ` ${kind}` : ''}`;
      };
      const copyPattern = document.createElement('button');
      copyPattern.type = 'button';
      copyPattern.className = 'cot-custom-tool';
      copyPattern.innerHTML = `${uiIconSVG('copy', 17)}<span>Copy pattern</span>`;
      copyPattern.addEventListener('click', async () => {
        const recipe = JSON.stringify({ schemaVersion: 1, tool: 'claude-of-tanks-camo', pattern: customDraft }, null, 2);
        try {
          if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(recipe);
          else {
            const textarea = document.createElement('textarea');
            textarea.value = recipe; document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); textarea.remove();
          }
          setStatus('Pattern recipe copied to the clipboard.', 'ok');
        } catch (_) { setStatus('Clipboard access was blocked by the browser.', 'error'); }
      });
      const pastePattern = document.createElement('button');
      pastePattern.type = 'button';
      pastePattern.className = 'cot-custom-tool';
      pastePattern.innerHTML = `${uiIconSVG('paste', 17)}<span>Paste pattern</span>`;
      pastePattern.addEventListener('click', async () => {
        try {
          const raw = await navigator.clipboard?.readText?.();
          if (!raw) throw new Error('Clipboard is empty');
          const parsed = JSON.parse(raw);
          const candidate = parsed?.pattern || parsed;
          if (!candidate || typeof candidate !== 'object' || candidate.style !== 'drawn' || !Array.isArray(candidate.strokes)) {
            throw new Error('Unsupported pattern');
          }
          const next = normalizeCustomCamo(candidate);
          customDraft = next;
          syncCustomControls();
          setStatus('Pattern recipe loaded. Apply when the preview looks right.', 'ok');
        } catch (_) { setStatus('Paste a copied Claude of Tanks camo recipe.', 'error'); }
      });
      transfer.append(copyPattern, pastePattern);
      transferPanel.append(transferHeading, transfer, status);
      const help = document.createElement('div');
      help.className = 'cot-custom-help';
      help.innerHTML = '<strong>Local-only paint:</strong> custom recipes stay on this device. Multiplayer automatically substitutes Factory camouflage, so authored patterns never add network or match-time texture work.';
      controlsColumn.append(previewPanel, colorPanel, repeatPanel, transferPanel, help);
      customCamoEl.append(canvasColumn, controlsColumn);
      customCamoModal.body.appendChild(customCamoEl);

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'cot-modal__button';
      cancel.textContent = 'Close';
      cancel.addEventListener('click', () => customCamoModal.close());
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'cot-modal__button cot-modal__button--primary';
      apply.innerHTML = `${uiIconSVG('check', 17)}<span>Apply to solo vehicle</span>`;
      apply.addEventListener('click', () => {
        if (!selectedId) return;
        emit('ui:click', {});
        camoOpts.setCustom(selectedId, customDraft);
        refreshCamoSel();
        requeueTankThumbs(selectedId);
        setStatus('Saved locally and applied to the selected vehicle.', 'ok');
      });
      customCamoModal.footer.append(cancel, apply);
      const pointFromEvent = (event) => {
        const rect = customDraw.getBoundingClientRect();
        return [
          Math.max(0, Math.min(100, Math.round(((event.clientX - rect.left) / rect.width) * 100))),
          Math.max(0, Math.min(100, Math.round(((event.clientY - rect.top) / rect.height) * 100))),
        ];
      };
      customDraw.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        customDraw.setPointerCapture(event.pointerId);
        const strokes = customDraft.strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => [...point]) }));
        strokes.push({
          color: customTone, size: Number(brushInput.value), brush: customBrush,
          asset: customAsset, rotation: 0, points: [pointFromEvent(event)],
        });
        customDraft = normalizeCustomCamo({ ...customDraft, style: 'drawn', strokes });
        drawingStroke = customBrush === 'stamp' ? -1 : customDraft.strokes.length - 1;
        drawCustomTile();
        if (customBrush === 'stamp') repaintCustomPreview();
      });
      customDraw.addEventListener('pointermove', (event) => {
        if (drawingStroke < 0 || !customDraw.hasPointerCapture(event.pointerId)) return;
        const point = pointFromEvent(event);
        const strokes = customDraft.strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((entry) => [...entry]) }));
        const activeStroke = strokes[drawingStroke];
        const last = activeStroke.points.at(-1);
        if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 1.5) return;
        activeStroke.points.push(point);
        customDraft = normalizeCustomCamo({ ...customDraft, style: 'drawn', strokes });
        drawCustomTile();
      });
      const finishDrawing = () => {
        if (drawingStroke < 0) return;
        drawingStroke = -1;
        repaintCustomPreview();
      };
      customDraw.addEventListener('pointerup', finishDrawing);
      customDraw.addEventListener('pointercancel', finishDrawing);
      customCamoEl.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          undoDraft();
        }
      });
      customOpenButton.addEventListener('click', () => {
        if (selectedId) {
          customDraft = normalizeCustomCamo(camoOpts.getCustom(selectedId));
          if (customDraft.style !== 'drawn') customDraft = normalizeCustomCamo({ ...customDraft, style: 'drawn', strokes: [] });
          syncCustomControls();
        }
        customCamoModal.open({ trigger: customOpenButton });
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
  // Catalog/persistence/era-gating live in game/equipment.js (localStorage
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
    if (customCamoEl) {
      customDraft = normalizeCustomCamo(camoOpts.getCustom(selectedId));
      syncCustomControls();
    }
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
    // the same multipliers/tables the battle sim reads (equipment.js +
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

  function launchBattle(specId, mapId, { emitClick = true } = {}) {
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
    if (onBattle) onBattle(specId, mapId); // MAP-CONFIG WIRING
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
        specId,
        mapId,
        startSolo: () => launchBattle(specId, mapId, { emitClick: false }),
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
  function closeBattleMenu({ restoreFocus = false } = {}) {
    battleMenu.classList.remove('open');
    battleModeBtn.setAttribute('aria-expanded', 'false');
    if (restoreFocus) battleModeBtn.focus();
  }
  function openBattleMenu() {
    closeMobileNavigation();
    battleMenu.classList.add('open');
    battleModeBtn.setAttribute('aria-expanded', 'true');
    battleChoices.find((choice) => choice.dataset.mode === battleMode)?.focus();
  }
  function setBattleMode(nextMode) {
    const meta = battleModeMeta[nextMode];
    if (!meta) return;
    battleMode = nextMode;
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
      customCamoModal?.close({ restoreFocus: false, immediate: true });
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
