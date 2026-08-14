// src/ui/garage.js — full-screen garage/tank-select overlay: dark gradient
// frame with a transparent center band (the 3D pedestal shows through),
// bottom tank carousel, right stats card, top-center BATTLE button.
// Contract: docs/ARCHITECTURE.md §3.7.3.

import { FONT_STACK, FONT_COND, ensureFonts } from './fonts.js';
import { FEATURED_SHOTS } from './featuredShots.js';
import { flagIconHTML, flagIconUrl } from './flags.js';
import { flagIconCode } from './flagCodes.js';
import { ensureTankThumbs, drainTankThumbs, getTankThumb, requeueTankThumbs } from './tankThumbs.js';
// CAMO PICKER SECTION: swatches preview the REAL resolved pattern (scheme +
// palette from materials.js) instead of hand-approximated CSS gradients.
import { resolveCamoVisual, CLAUDE_CODE_MARK, CLAUDE_SPARK_MARK }
  from '../vehicles/materials.js';
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
import { compareCountryThenTierThenName, countryFilterGroups } from './garageOrder.js';
import { isGarageVisibleTankId } from '../game/matchmaking.js';
import { tankTier, tierNumeral } from '../vehicles/tier.js';
import { getPlayerRecord } from '../game/profile.js';
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
.cot-garage{position:fixed;inset:0;z-index:60;display:none;font-family:${FONT_STACK};
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
.cot-garage .title{position:absolute;top:20px;left:34px;font-size:17px;font-weight:800;
  letter-spacing:.20em;color:#9fb0bf;text-transform:uppercase;
  display:flex;align-items:center;gap:10px;}
.cot-garage .title b{color:#f0a030;}
/* garage_ui: compact brand badge (v3 colored crest, tank + Claude Code
   commander, same art as the boot splash; public/brand/logo-mark.svg)
   instead of bare text */
.cot-garage .title .mark{display:block;width:36px;height:36px;flex:0 0 auto;
  filter:drop-shadow(0 2px 4px rgba(0,0,0,.55));}
.cot-local-record{position:absolute;top:63px;left:34px;min-height:36px;display:grid;
  grid-template-columns:35px auto;align-items:stretch;pointer-events:auto;white-space:nowrap;
  color:#dce6ee;background:linear-gradient(90deg,rgba(16,22,28,.94),rgba(8,12,16,.76));
  border:1px solid rgba(146,164,180,.25);border-left:2px solid rgba(240,160,48,.82);
  box-shadow:0 7px 22px rgba(0,0,0,.35);font-variant-numeric:tabular-nums;}
.cot-local-record .record-mark{display:grid;place-items:center;color:#f0b04a;
  background:rgba(240,160,48,.08);border-right:1px solid rgba(146,164,180,.18);}
.cot-local-record .record-mark svg{width:18px;height:18px;display:block;}
.cot-local-record .record-copy{display:grid;align-content:center;gap:3px;padding:5px 9px 4px;}
.cot-local-record .label{color:#8293a1;font:800 6.5px ${FONT_COND};letter-spacing:.19em;
  line-height:1;text-transform:uppercase;}
.cot-local-record .record-values{display:flex;align-items:center;gap:8px;font-size:8.5px;
  font-weight:800;letter-spacing:.045em;line-height:1;}
.cot-local-record .matches{color:#f0b04a;}
.cot-local-record .winrate{color:#cbd6df;}
/* r6-2 (round critique: vehicle name + flag + class line appeared TWICE —
   top-left header and right stats panel): the top-left corner now carries
   only the game logo + a quiet screen-mode tag; the vehicle identity lives
   solely on the stats card. */
/* r9.1 (owner): the quiet "GARAGE" mode tag becomes a real screen nav —
   Garage (current) / Studio / Surface Lab / Home. */
.cot-nav{position:absolute;top:20px;right:26px;display:flex;align-items:stretch;gap:4px;
  height:34px;pointer-events:auto;}
.cot-nav .nv{font-family:${FONT_STACK};font-size:8.5px;font-weight:800;
  letter-spacing:.18em;text-transform:uppercase;color:#8a97a3;cursor:pointer;
  display:inline-flex;align-items:center;gap:6px;
  padding:0 6px;background:rgba(11,15,20,.72);
  border:1px solid rgba(146,164,180,.28);border-bottom-width:2px;
  transition:color .15s,border-color .15s,background .15s;}
.cot-nav .nv:hover{color:#ffd27a;border-color:rgba(240,176,74,.6);}
.cot-nav .nv.on{color:#f0b04a;border-color:rgba(240,176,74,.55);
  background:rgba(24,19,11,.82);cursor:default;}
/* Garage + Studio use the original authored navigation art; Home keeps the
   shared vector mark. object-fit preserves both source assets at 15px. */
.cot-nav .nv .nvi{width:13px;height:13px;display:block;object-fit:contain;}
.cot-nav .cot-settings-slot{width:34px;height:34px;flex:0 0 auto;}
.cot-nav .cot-gear{position:static;width:34px;height:34px;min-height:34px;z-index:auto;
  right:auto;top:auto;}
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
.cot-garage .stats{position:absolute;right:26px;top:110px;width:300px;
  background:linear-gradient(180deg,rgba(11,15,20,.88),rgba(7,10,13,.92));
  border:1px solid rgba(146,164,180,.28);box-shadow:0 8px 30px rgba(0,0,0,.55);
  padding:16px 18px 14px;pointer-events:auto;}
.cot-garage .stats h3{font-size:15px;font-weight:700;letter-spacing:.02em;color:#eef4f9;
  max-width:176px;min-height:18px;}
.cot-garage .stats .sub{font-size:10px;font-weight:700;letter-spacing:.18em;color:#8a97a3;
  text-transform:uppercase;margin:4px 0 12px;display:flex;align-items:center;gap:7px;
  max-width:178px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cot-garage .stats .sub .cot-flag{display:block;object-fit:cover;
  box-shadow:0 1px 3px rgba(0,0,0,.5);}
.cot-garage .stats .stats-ti{position:absolute;right:9px;top:5px;width:112px;height:72px;
  object-fit:contain;pointer-events:none;filter:drop-shadow(0 5px 7px rgba(0,0,0,.72));}
.cot-garage .srow{margin-bottom:9px;}
.cot-garage .srow .lr{display:flex;justify-content:space-between;font-size:11px;
  letter-spacing:.08em;color:#9fb0bf;text-transform:uppercase;margin-bottom:3px;}
/* r4: VALUE cells escape the row's uppercase transform — SI units are
   case-sensitive ("6.0 s", "67 km/h", not "6.0 S" / "67 KM/H") */
.cot-garage .srow .lr b{color:#e6edf3;font-weight:600;font-variant-numeric:tabular-nums;
  letter-spacing:.02em;text-transform:none;}
.cot-garage .srow .track{height:3px;background:rgba(255,255,255,.08);}
.cot-garage .srow .fill{height:100%;background:linear-gradient(90deg,#c98a2e,#f0b04a);}
.cot-garage .sep{height:1px;background:rgba(146,164,180,.2);margin:12px 0 10px;}
.cot-garage .shellrow{display:flex;justify-content:space-between;align-items:baseline;
  font-size:11.5px;padding:3px 0;color:#c6d2dc;}
.cot-garage .shellrow .ty{font-size:9px;font-weight:800;letter-spacing:.1em;width:52px;}
.cot-garage .shellrow .nm{flex:1;color:#e6edf3;font-weight:600;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;padding-right:6px;}
.cot-garage .shellrow .pd{font-variant-numeric:tabular-nums;color:#9fb0bf;font-size:10.5px;}
.cot-garage .shellrow .pd b{color:#e6edf3;font-weight:600;}
.cot-garage .armorline{font-size:10.5px;letter-spacing:.06em;color:#9fb0bf;
  text-transform:uppercase;display:flex;justify-content:space-between;padding:2px 0;}
.cot-garage .armorline b{color:#e6edf3;font-weight:600;font-variant-numeric:tabular-nums;
  text-transform:none;}
/* One combined historical fleet, filtered by national flag. */
.cot-country-chips{position:absolute;left:calc(50% - 34px);bottom:190px;transform:translateX(-50%);
  display:flex;gap:5px;width:max-content;max-width:calc(100vw - 620px);
  overflow-x:auto;scrollbar-width:none;pointer-events:auto;}
.cot-country-chips::-webkit-scrollbar{display:none;}
.cot-country-chip{cursor:pointer;border:1px solid rgba(146,164,180,.3);
  border-bottom:2px solid rgba(146,164,180,.4);background:rgba(11,15,20,.82);
  color:#9fb0bf;font-family:${FONT_STACK};font-size:10px;font-weight:800;
  letter-spacing:.14em;text-transform:uppercase;padding:6px 11px 5px;
  display:inline-flex;align-items:center;gap:6px;white-space:nowrap;
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
  border:1px solid rgba(146,164,180,.26);border-top:2px solid rgba(146,164,180,.26);
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
.cot-card.sel{border-color:#f0a030;border-top-color:#f0a030;transform:translateY(-6px);
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
.cot-card .ti{display:block;margin:-2px auto -1px;width:136px;height:84px;
  object-fit:contain;filter:drop-shadow(0 5px 7px rgba(0,0,0,.72));transform:scale(1.04);}
.cot-card .nm{font-size:11px;font-weight:650;color:#f3f7fa;letter-spacing:-.01em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0 -3px;text-align:left;
  text-shadow:0 1px 3px rgba(0,0,0,.85);}
.cot-card .nm .tiern{font-weight:900;color:#d8a04c;margin-right:5px;letter-spacing:.04em;}
.cot-card.sel .nm .tiern{color:#f0b04a;}
.cot-card .cls{font-size:8.5px;font-weight:800;letter-spacing:.20em;color:#9aa8b5;
  text-transform:uppercase;margin-top:3px;}
.cot-garage .hint{position:absolute;bottom:4px;left:50%;transform:translateX(-50%);
  font-size:9.5px;letter-spacing:.14em;color:rgba(138,151,163,.7);text-transform:uppercase;}
/* MAP-CONFIG WIRING: battlefield picker (4 maps + random) */
/* camo_spotting r1: maps + camo picker stack in ONE flex column so they can
   never overlap at short viewports (the old absolute anchors collided at
   1600x900 — the RANDOM card's conic-gradient thumb showed through the camo
   grid's 5px gaps as a phantom "white national cross"). */
/* r9.1 (owner): the column runs down to just above the country chips
   (chips bottom:172px + ~26px tall) instead of reserving 36% — the freed
   space all goes to the BATTLEFIELD list (maps is the flexible section). */
.cot-leftcol{position:absolute;left:34px;top:108px;bottom:210px;
  width:224px;display:flex;flex-direction:column;gap:8px;overflow:hidden;pointer-events:auto;}
/* garage_polish r9: the battlefield + camo sections share ONE industrial
   plate treatment (translucent backdrop + hairline + amber title tick) so
   they read as a composed panel instead of loose elements on the floor.
   (r9.1: the gallery is deliberately PLATELESS — owner call — but keeps
   the amber title tick so the column rhythm holds.) */
.cot-maps,.cot-camos{box-sizing:border-box;width:224px;
  background:linear-gradient(180deg,rgba(9,13,17,.66),rgba(6,9,12,.58));
  border:1px solid rgba(146,164,180,.16);padding:9px 9px 8px;}
.cot-maps .mtitle::before,.cot-camos .ctitle::before,
.cot-featured .ftitle > span:first-child::before{content:'';display:inline-block;
  width:8px;height:2px;background:#f0a030;margin-right:6px;vertical-align:2px;}
.cot-maps{position:static;min-height:0;overflow-y:auto;
  scrollbar-width:none;flex:0 1 auto;pointer-events:auto;}
/* half-cut last row + fade = "more below" affordance instead of a broken
   clip; .can-scroll is toggled by JS only when the list truly overflows */
.cot-maps.can-scroll{
  -webkit-mask-image:linear-gradient(180deg,#000 0,#000 calc(100% - 22px),transparent 100%);
  mask-image:linear-gradient(180deg,#000 0,#000 calc(100% - 22px),transparent 100%);}
.cot-maps .mtitle{font-size:10px;font-weight:700;letter-spacing:.24em;color:#8a97a3;
  text-transform:uppercase;margin-bottom:7px;}
/* MAPS r1: the battlefield roster DOUBLED (8 + Random) — cards run COMPACT
   so ~7 rows show above the camo section at 1080p, with the next card
   half-cut at the fold as the scroll affordance (the list wheel-scrolls;
   taller windows show all nine). */
.cot-map-card{display:flex;align-items:center;gap:7px;cursor:pointer;margin-bottom:2px;
  background:linear-gradient(180deg,rgba(13,18,23,.82),rgba(8,11,14,.9));
  border:1px solid rgba(146,164,180,.24);border-left:2px solid rgba(146,164,180,.24);
  padding:2px 6px 2px 3px;transition:border-color .12s,background .12s;}
.cot-map-card:hover{border-color:rgba(210,225,240,.5);}
.cot-map-card.sel{border-color:#f0a030;border-left-color:#f0a030;
  background:linear-gradient(180deg,rgba(32,24,12,.9),rgba(14,10,6,.92));}
.cot-map-card .mthumb{width:44px;height:21px;flex:0 0 auto;background-size:112% auto;
  background-position:center;border:1px solid rgba(0,0,0,.55);position:relative;
  box-shadow:inset 0 0 0 1px rgba(235,243,250,.14);
  transition:background-size .18s ease;}
.cot-map-card:hover .mthumb{background-size:128% auto;}
.cot-map-card.sel .mthumb{box-shadow:inset 0 0 0 1px rgba(240,176,74,.45);}
.cot-map-card .mthumb.verdant{background-color:#3d5a2e;background-image:linear-gradient(135deg,#4c6b38,#2c421f);}
.cot-map-card .mthumb.desert{background-color:#b3925c;background-image:linear-gradient(135deg,#c9a86e,#8f6f42);}
.cot-map-card .mthumb.winter{background-color:#aeb9c4;background-image:linear-gradient(135deg,#cdd6de,#7f8d9b);}
.cot-map-card .mthumb.urban{background-color:#5c6066;background-image:linear-gradient(135deg,#75797e,#3e4247);}
/* MAPS r1: gradient fallbacks for the second four (data-URI thumbs override) */
.cot-map-card .mthumb.coastal{background-color:#4a7a86;background-image:linear-gradient(135deg,#5f93a0,#2f5560);}
.cot-map-card .mthumb.autumn{background-color:#9a5a28;background-image:linear-gradient(135deg,#c07030,#6b3d1a);}
.cot-map-card .mthumb.steppe{background-color:#b09a50;background-image:linear-gradient(135deg,#c9b264,#8a763c);}
.cot-map-card .mthumb.railyard{background-color:#565049;background-image:linear-gradient(135deg,#6e6860,#3a352f);}
.cot-map-card .mthumb.random{background-image:conic-gradient(#4c6b38 0 25%,#c9a86e 0 50%,#cdd6de 0 75%,#5c6066 0);}
.cot-map-card .mname{font-size:10.5px;font-weight:600;color:#e6edf3;letter-spacing:.02em;}
.cot-map-card .msub{font-size:8.5px;font-weight:700;letter-spacing:.14em;color:#8a97a3;
  text-transform:uppercase;margin-top:1px;}
.cot-map-card.sel .msub{color:#d8a04c;}
/* CAMO PICKER SECTION: per-tank paint pattern (persisted, +concealment) */
.cot-camos{position:static;flex:0 0 auto;pointer-events:auto;}
.cot-camos .ctitle{font-size:10px;font-weight:700;letter-spacing:.24em;color:#8a97a3;
  text-transform:uppercase;margin-bottom:7px;}
/* garage_polish r9: minmax(0,1fr) + min-width:0 — grid items default to
   min-width:auto, so the widest nowrap label (DESERT PINK ~80px) silently
   inflated every track past the panel and CLIPPED the third column. */
.cot-camos .cgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;}
/* camo r8: the paint roster grew 6 -> 16 — the CAMO grid scrolls (equipment
   grid below stays static). Thin styled scrollbar so the affordance reads
   without stealing column width from the swatches. */
.cot-camos .cgrid.camo{max-height:157px;overflow-y:auto;overscroll-behavior:contain;
  padding-right:3px;scrollbar-width:thin;scrollbar-color:rgba(146,164,180,.45) rgba(8,11,14,.6);}
.cot-camos .cgrid.camo.can-scroll{
  -webkit-mask-image:linear-gradient(180deg,#000 0,#000 calc(100% - 16px),transparent 100%);
  mask-image:linear-gradient(180deg,#000 0,#000 calc(100% - 16px),transparent 100%);}
.cot-camos .cgrid.camo::-webkit-scrollbar{width:5px;}
.cot-camos .cgrid.camo::-webkit-scrollbar-track{background:rgba(8,11,14,.6);}
.cot-camos .cgrid.camo::-webkit-scrollbar-thumb{background:rgba(146,164,180,.45);}
.cot-camo-card{cursor:pointer;text-align:center;padding:4px 3px 3px;min-width:0;
  background:linear-gradient(180deg,rgba(13,18,23,.82),rgba(8,11,14,.9));
  border:1px solid rgba(146,164,180,.24);border-bottom:2px solid rgba(146,164,180,.24);
  transition:border-color .12s,background .12s,box-shadow .12s;}
.cot-camo-card:hover{border-color:rgba(210,225,240,.5);}
.cot-camo-card.sel{border-color:#f0a030;border-bottom-color:#f0a030;
  background:linear-gradient(180deg,rgba(32,24,12,.9),rgba(14,10,6,.92));
  box-shadow:0 0 10px rgba(240,160,48,.18);}
.cot-camo-card .sw{height:30px;margin:0 auto 3px;border:1px solid rgba(0,0,0,.55);
  position:relative;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(235,243,250,.10);}
.cot-camo-card .sw canvas{position:absolute;inset:0;width:100%;height:100%;display:block;}
.cot-camo-card .sw.auto{background:conic-gradient(#4c6b38 0 25%,#c9a86e 0 50%,#cdd6de 0 75%,#5c6066 0);}
/* equipment tiles: distinct procedural icons on a dark plate (r3: identical
   stripe bars read as placeholders) */
.cot-camo-card .sw.eq{display:flex;align-items:center;justify-content:center;
  background:linear-gradient(180deg,#232a31,#12161b);}
.cot-camo-card .sw.eq svg{display:block;}
.cot-camo-card .cl{font-size:8px;font-weight:700;letter-spacing:.1em;color:#9fb0bf;
  text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cot-camo-card.sel .cl{color:#d8a04c;}
/* r4: caption WRAPS instead of clipping — the old nowrap line overflowed the
   196px column and cut off mid-sentence, leaving a dangling em-dash */
.cot-camos .cnote{font-size:8.5px;font-weight:700;letter-spacing:.10em;
  color:#8a97a3;text-transform:uppercase;margin-top:6px;line-height:1.55;
  text-shadow:0 1px 2px rgba(0,0,0,.7);}

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
.cot-garage .eqhead i{font-style:normal;color:#6d7a86;letter-spacing:.08em;}
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
.cot-eqpick{position:absolute;right:344px;top:110px;width:372px;display:none;
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
.cot-country-chip:focus-visible,.cot-car-arrow:focus-visible{
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
.cot-garage.enter .title,.cot-garage.enter .cot-local-record,.cot-garage.enter .cot-nav,
.cot-garage.enter .cot-leftcol,
.cot-garage.enter .hint{animation:cot-g-fade .34s ease-out .05s backwards;}
.cot-garage.enter .stats{animation:cot-g-rise .36s ease-out .08s backwards;}
.cot-garage.enter .cot-battle-control{animation:cot-g-drop-c .36s ease-out .05s backwards;}
.cot-garage.enter .cot-country-chips{animation:cot-g-rise-c .32s ease-out .10s backwards;}
.cot-garage.enter .cot-carousel{animation:cot-g-rise-c .36s ease-out .14s backwards;}
/* MARKETING FEATURED PANEL: rotating in-engine action stills (see
   tools/marketing-shots). Bottom-anchored under the camo grid in the left
   column; purely decorative, so on short viewports it is the element that
   clips first (leftcol overflow:hidden), never the functional pickers. */
.cot-featured{width:224px;flex:0 0 auto;pointer-events:auto;}
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
.cot-featured .fdots{display:flex;gap:5px;}
.cot-featured .fdots span{width:6px;height:6px;background:rgba(146,164,180,.35);
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

/* Compact touch garage: keep the tank, BATTLE action and vehicle roster
   dominant on a phone-sized landscape screen. The full stat sheet remains
   available on desktop, while mobile keeps the interactive loadout column. */
@media (max-width:900px){
  .cot-garage .band-top{height:23%;}.cot-garage .band-bot{height:31%;}
  .cot-garage .band-r{display:none;}
  .cot-garage .title{top:12px;left:14px;font-size:13px;letter-spacing:.22em;gap:7px;}
  .cot-garage .title .mark{width:22px;height:22px;}
  .cot-local-record{top:42px;left:14px;min-height:29px;grid-template-columns:28px auto;}
  .cot-local-record .record-mark svg{width:15px;height:15px;}
  .cot-local-record .record-copy{gap:2px;padding:4px 7px 3px;}
  .cot-local-record .label{font-size:5.5px;}
  .cot-local-record .record-values{gap:6px;font-size:7px;}
  .cot-nav{top:62px;right:14px;gap:3px;height:28px;}
  .cot-nav .nv{font-size:7px;padding:0 6px;letter-spacing:.12em;}
  .cot-nav .nv .nvi{width:11px;height:11px;}
  .cot-nav .cot-settings-slot,.cot-nav .cot-gear{width:28px;height:28px;min-height:28px;}
  .cot-nav .cot-gear svg{width:17px;height:17px;}
  .cot-battle-control{top:12px;width:214px;height:40px;}
  .cot-battle{font-size:15px;}.cot-battle-mode{font-size:7.5px;}
  .cot-garage .stats{display:none;}
  .cot-topbar{top:8px;right:8px;gap:3px;transform:scale(.72);transform-origin:right top;}
  .cot-leftcol{left:14px;top:106px;bottom:112px;width:180px;gap:7px;overflow:visible;}
  .cot-maps{display:none;}
  .cot-featured{display:none;}
  .cot-camos{width:180px;margin-top:0;padding:7px;
    background:rgba(7,11,15,.62);border:1px solid rgba(146,164,180,.18);}
  .cot-camos .ctitle{font-size:8px;margin-bottom:5px;}
  .cot-camos .cgrid.camo{max-height:118px;} /* camo r8: ~3 compact rows */
  .cot-camo-card{padding:3px 2px 2px;}.cot-camo-card .sw{height:22px;margin-bottom:2px;}
  .cot-camo-card .cl{font-size:6.5px;letter-spacing:.06em;}
  .cot-camos .cnote{display:none;}
  .cot-country-chips{left:50%;bottom:86px;gap:3px;max-width:86vw;}
  .cot-country-chip{padding:3px 6px 2px;font-size:7px;letter-spacing:.10em;gap:3px;}
  .cot-country-chip .cot-flag{width:15px;}
  .cot-carousel{bottom:8px;gap:4px;height:72px;max-width:98vw;}
  .cot-car-arrow{width:24px;font-size:16px;}
  .cot-cards{gap:4px;-webkit-mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 30px),transparent 100%);
    mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 30px),transparent 100%);}
  .cot-card{width:98px;min-height:72px;padding:4px 5px 3px;}
  .cot-card::before{opacity:.20;}.cot-card.sel::before{opacity:.28;}
  .cot-card.sel{transform:translateY(-3px);}
  .cot-card .flag{margin-bottom:1px;font-size:6px;gap:2px;}
  .cot-card .flag .cot-flag{width:15px;height:auto;}.cot-card .designation{font-size:5.5px;padding:1px 0;}
  .cot-card .ti{width:80px;height:40px;margin:-3px auto -1px;transform:none;}
  .cot-card .nm{font-size:7.5px;margin:0 -3px;}.cot-card .nm .tiern{margin-right:2px;}
  .cot-card .cls{font-size:6px;margin-top:0;letter-spacing:.12em;}
  .cot-garage .hint{display:none;}
}
/* MOBILE-QA r2 (iOS simulator, portrait 393pt): the centered BATTLE plate
   overlapped BOTH the wordmark (left) and the currency chips (right) — three
   clusters sharing one 393px band. Portrait keeps the crest, drops the
   wordmark text, narrows the plate and shrinks the wallet chips. */
@media (max-width:520px) and (orientation:portrait){
  .cot-garage .title span{display:none;}
  .cot-nav{top:76px;}
  .cot-battle-control{width:176px;height:44px;}
  .cot-battle{font-size:13px;padding-left:4px;gap:5px;}
  .cot-battle .battle-active-icon{width:17px;height:17px;}
  .cot-battle .battle-active-icon svg{width:16px;height:16px;}
  .cot-battle-mode{font-size:7px;padding-right:7px;}
  .cot-battle-mode::after{right:5px;}.cot-battle-menu{width:160px;}
  .cot-battle-choice{grid-template-columns:24px 1fr auto;gap:6px;padding-left:6px;}
  .cot-battle-choice .choice-icon{width:24px;height:24px;}
  .cot-local-record{width:88px;grid-template-columns:25px 1fr;}
  .cot-local-record .record-copy{padding-left:5px;padding-right:4px;}
  .cot-local-record .label,.cot-local-record .winrate{display:none;}
  .cot-local-record .record-values{font-size:6.5px;letter-spacing:.025em;}
}
@media (max-width:1300px) and (min-width:901px){.cot-nav{top:66px;}}
`;

function ensureStyle(id, css) {
  if (!document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id;
    s.textContent = css;
    document.head.appendChild(s);
  }
}

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
  const S = W * 1.6;
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
  if (scheme === 'nato' && patches.length) {
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
 * @param {{specs:TankSpec[],bus:{emit:Function},onSelect:Function,onBattle:Function,onPlayRequest?:Function}} opts
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
    `<div class="title">` +
    // brand mark (tank + Claude Code commander) so the garage brand matches
    // the entry screen; master copy public/brand/logo-mark.svg
    `<img class="mark" src="/brand/logo-mark.svg" alt="" draggable="false">` +
    `<span>CLAUDE <b>OF TANKS</b></span></div>` +
    `<div class="cot-local-record" aria-label="Local record">` +
    `<span class="record-mark">${uiIconSVG('battleRecord', 18)}</span>` +
    `<span class="record-copy"><span class="label">Local record</span>` +
    `<span class="record-values"><span class="matches">0 BATTLES</span>` +
    `<span class="winrate">— WIN RATE</span></span></span></div>` +
    `<nav class="cot-nav" aria-label="Garage navigation">` +
    `<button class="nv on" data-nav="garage" type="button">` +
    `<img class="nvi" src="/brand/nav/garage.svg" alt="" draggable="false">Garage</button>` +
    `<button class="nv" data-nav="studio" type="button">` +
    `<img class="nvi" src="/brand/nav/studio.png" alt="" draggable="false">Studio</button>` +
    `<button class="nv" data-nav="surface" type="button">` +
    `${uiIconSVG('scope', 15, 'currentColor', 'nvi')}Surface Lab</button>` +
    `<button class="nv" data-nav="home" type="button">` +
    `${uiIconSVG('home', 15, 'currentColor', 'nvi')}Home</button>` +
    `<div class="cot-settings-slot"></div></nav>` +
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
    `</div></div>` +
    `<div class="stats"></div>` +
    `<div class="cot-country-chips" role="group" aria-label="Filter vehicles by country"></div>` +
    `<div class="cot-carousel">` +
    `<button class="cot-car-arrow prev is-unavailable" type="button" disabled aria-hidden="true" aria-label="Previous vehicle">` +
    `${uiIconSVG('chevronLeft', 15)}</button>` +
    `<div class="cot-cards"></div>` +
    `<button class="cot-car-arrow next is-unavailable" type="button" disabled aria-hidden="true" aria-label="Next vehicle">` +
    `${uiIconSVG('chevronRight', 15)}</button>` +
    `</div>` +
    `<div class="cot-leftcol"><div class="cot-maps"></div>` +
    `<div class="cot-camos"></div></div>` +
    `<div class="hint">&#8592; &#8594; select &nbsp;&middot;&nbsp; enter to battle</div>`;
  document.body.appendChild(root);

  function refreshLocalRecord() {
    const record = getPlayerRecord();
    const matches = root.querySelector('.cot-local-record .matches');
    const winrate = root.querySelector('.cot-local-record .winrate');
    if (matches) matches.textContent = `${record.matches.toLocaleString('en-US')} ` +
      `BATTLE${record.matches === 1 ? '' : 'S'}`;
    if (winrate) winrate.textContent = record.matches > 0
      ? `${Math.round((record.wins / record.matches) * 100)}% WIN RATE`
      : '— WIN RATE';
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
      `<div class="ftitle"><span>Battle gallery</span><span class="fdots">` +
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
    };
    const preload = (i, cb) => {
      const im = new Image();
      im.onload = () => cb();
      im.onerror = () => { /* missing still — stay on the current frame */ };
      im.src = FEATURED_SHOTS[i].img;
    };
    const jump = (i) => preload(i, () => show(i));
    const advance = () => jump((idx + 1) % FEATURED_SHOTS.length);
    const arm = () => { if (!timer) timer = setInterval(advance, 8000); };
    // r9.1: manual browse resets the auto-rotate clock so it never snatches
    // the frame away right after the user picked one
    const rearm = () => { if (timer) { clearInterval(timer); timer = 0; } arm(); };
    // r9.1 (owner): lead with a DIFFERENT shot each load
    const first = Math.floor(Math.random() * FEATURED_SHOTS.length);
    preload(first, () => { show(first); arm(); });
    shotEl.addEventListener('click', () => { advance(); rearm(); });
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
  const prevVehicleBtn = root.querySelector('.cot-car-arrow.prev');
  const nextVehicleBtn = root.querySelector('.cot-car-arrow.next');
  const battleControl = root.querySelector('.cot-battle-control');
  const battleBtn = root.querySelector('.cot-battle');
  const battleModeBtn = root.querySelector('.cot-battle-mode');
  const battleMenu = root.querySelector('.cot-battle-menu');
  const battleChoices = [...root.querySelectorAll('.cot-battle-choice')];
  const mapsEl = root.querySelector('.cot-maps');

  let selectedId = specs.length ? specs[0].id : null;
  let battleMode = 'solo';
  const cardById = new Map();
  const specById = new Map();
  // specById covers the FULL roster so direct tooling can still inspect a
  // delisted vehicle without exposing it in the player-facing carousel.
  for (const s of allSpecs) specById.set(s.id, s);

  const emit = (ev, payload) => { if (bus && bus.emit) bus.emit(ev, payload); };

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

  // --- MAP-CONFIG WIRING: battlefield picker (maps come from createGarage
  // opts.maps = [{id,name,blurb,thumb}]; 'random' rolls at battle start) ---
  const maps = opts.maps || [];
  let selectedMapId = maps.length ? maps[0].id : 'verdant';
  const mapCardById = new Map();
  if (maps.length) {
    const title = document.createElement('div');
    title.className = 'mtitle';
    title.textContent = 'Battlefield';
    mapsEl.appendChild(title);
    for (const m of maps) {
      const card = document.createElement('div');
      card.className = 'cot-map-card';
      const thumb = document.createElement('div');
      thumb.className = `mthumb ${m.id}`;
      if (m.thumb) thumb.style.backgroundImage = `url(${m.thumb})`;
      const label = document.createElement('div');
      const nm = document.createElement('div');
      nm.className = 'mname';
      nm.textContent = m.name;
      const sub = document.createElement('div');
      sub.className = 'msub';
      sub.textContent = m.sub || '';
      label.append(nm, sub);
      card.append(thumb, label);
      card.addEventListener('click', () => {
        emit('ui:click', {});
        api.setSelectedMap(m.id);
      });
      mapsEl.appendChild(card);
      mapCardById.set(m.id, card);
    }
  }
  // garage_polish r9: the scroll fade masks only make sense when the list
  // actually overflows — on tall viewports the whole roster fits and the
  // fade would dim the last row for no reason. Toggle per resize.
  const syncScrollFades = () => {
    mapsEl.classList.toggle('can-scroll', mapsEl.scrollHeight > mapsEl.clientHeight + 1);
    const cg = root.querySelector('.cot-camos .cgrid.camo');
    if (cg) cg.classList.toggle('can-scroll', cg.scrollHeight > cg.clientHeight + 1);
  };
  window.addEventListener('resize', syncScrollFades);
  requestAnimationFrame(syncScrollFades);

  // --- CAMO PICKER SECTION: per-tank paint pattern -------------------------
  // opts.camo = { patterns: string[], label: {id:label}, get(specId),
  //               set(specId, patternId) } (main.js injects the materials.js
  //               persistence + live-repaint hooks). Selection is per tank,
  //               shown on the pedestal immediately, and persists via
  //               localStorage inside opts.camo.set.
  const camoOpts = opts.camo || null;
  const camosEl = root.querySelector('.cot-camos');
  const camoCardById = new Map();
  if (camoOpts && camoOpts.patterns && camoOpts.patterns.length) {
    const title = document.createElement('div');
    title.className = 'ctitle';
    title.textContent = 'Camouflage';
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
        ? `<div class="sw auto"></div><div class="cl"></div>`
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
    const note = document.createElement('div');
    note.className = 'cnote';
    // r4: complete sentence that WRAPS (the old nowrap line clipped at the
    // column edge and shipped a dangling em-dash mid-sentence)
    note.textContent = '+3.5% concealment on matching maps · auto always matches';
    camosEl.appendChild(note);
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
    if (!selectedId || eqOpenSlot < 0) return;
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
          if (cv) paintCamoSwatch(cv, spec, pid);
        }
        swatchesFor = selectedId;
      }
    }
  }
  // --- END CAMO PICKER SECTION ---------------------------------------------

  // ERA is still used for stat-peer normalization, but it is not a catalog
  // partition. Modern, Cold War and WWII vehicles share each country fleet.

  // PER-CLASS stat ranges for the normalized bars. r6-2 (round critique:
  // "6.0 s reload renders ~90% full / bars carry no comparative scale"): the
  // r5-2 per-era ranges let the IFV autocannons (sub-second reload, ~50 hp
  // alpha) stretch every modern range so far that MBT bars parked at
  // arbitrary-looking lengths. Bars now normalize min→max within the
  // vehicle's own ERA + CLASS peer group (an Abrams compares against MBTs,
  // a Bradley against IFVs), higher-is-better on every row (reload
  // inverted: faster = fuller). garage_ui: stat peers stay ERA-based even
  // though the catalog chips group by the four-way catalog (Cold War /
  // Modern / WWII) — a procedurally built Tiger I must range
  // against WWII heavies, not against a custom Leo 2A7, and a cold-war M60
  // ranges against the whole modern-era MBT pool it fights alongside.
  const statGroupOf = (s) => `${s.era === 'ww2' ? 'ww2' : 'modern'}/${s.class || 'medium'}`;
  const STAT_RANGES = new Map(); // era/class -> {hp,speed,hpt,dmg,reload:[lo,hi]}
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
  const chipsEl = root.querySelector('.cot-country-chips');
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
  }
  // --- END country filter chips --------------------------------------------

  // --- build carousel cards ---
  for (const s of specs) {
    const card = document.createElement('div');
    card.className = 'cot-card';
    card.dataset.specId = s.id; // switch-desync r1: stable hook for tools/tests
    const displayName = s.label?.displayName || s.name;
    const shortName = s.label?.shortName || displayName;
    card.title = displayName;
    card.setAttribute('aria-label', `${tierNumeral(s.id) || ''} ${displayName}`.trim());
    card.style.setProperty('--nation-flag', `url("${flagIconUrl(s.nation)}")`);
    // Stable pre-rendered 3/4 portrait generated from the final first-party
    // procedural build; no live renderer or model swap is needed here.
    card.innerHTML =
      `<span class="designation">${s.markings?.designation || ''}</span>` +
      `<span class="flag">${flagIconHTML(s.nation, 20)}<i>${NATION_LABEL[s.nation] || s.nation}</i></span>` +
      `<img class="ti" data-cot-thumb="${s.id}" src="${getTankThumb(s.id)}" alt="${displayName}">` +
      `<div class="nm"><b class="tiern">${tierNumeral(s.id) || ''}</b><span class="nmt"></span></div>` +
      `<div class="cls">${s.class}</div>`;
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

  function statBar(label, valueText, frac, opts) {
    const pct = Math.max(2, Math.min(100, frac * 100)).toFixed(1);
    // EQUIPMENT SYSTEM: values changed by the mounted loadout render in the
    // boost tint with the stock value + contributing items in the tooltip.
    const mod = opts && opts.mod;
    const title = opts && opts.title ? ` title="${opts.title}"` : '';
    return `<div class="srow"><div class="lr"><span>${label}</span>` +
      `<b${mod ? ' class="eqmod"' : ''}${title}>${valueText}</b></div>` +
      `<div class="track"><div class="fill" style="width:${pct}%"></div></div></div>`;
  }

  let statsFor = null; // last spec rendered — gates the swap micro-fade
  function renderStats(spec) {
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
        ? ` &nbsp;<b>${sh.reloadS.toFixed(sh.reloadS < 10 ? 1 : 0)}</b> s` : '';
      shellRows += `<div class="shellrow"><span class="ty" style="color:${col}">${sh.type}</span>` +
        `<span class="nm">${sh.name}</span>` +
        `<span class="pd"><b>${pen}</b> mm &nbsp;<b>${sh.dmg}</b> hp${shRel}</span></div>`;
    }
    const hullMm = frontArmorMm(spec.armor && spec.armor.hullPlates, ['glacis', 'front', 'driver']);
    const turMm = frontArmorMm(spec.armor && spec.armor.turretPlates, ['front', 'cheek', 'mantlet']);
    // headline DAMAGE (alpha) — penetration lives in the per-shell rows only
    // (r3: a vehicle-level pen number duplicated the shell table; no AAA tank
    // game headlines a single pen figure)
    const bestDmg = shells.length ? Math.max(...shells.map((s) => s.dmg || 0)) : 0;
    // r6-2: every bar normalizes within the vehicle's OWN era+class peer
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
      `<img class="stats-ti" data-cot-thumb="${spec.id}" src="${getTankThumb(spec.id)}" alt="">` +
      `<h3></h3><div class="sub">${flagIconHTML(spec.nation, 20)}<span>${spec.nation} &middot; ${spec.class} &middot; ${spec.era === 'ww2' ? 'WWII' : 'MODERN'}</span></div>` +
      statBar('Hit points', `${spec.hp}`, statFrac(grp, 'hp', spec.hp)) +
      statBar('Top speed', `${spec.topSpeedKmh} km/h`, statFrac(grp, 'speed', spec.topSpeedKmh)) +
      statBar('Power / weight', `${hpT.toFixed(1)} hp/t`, statFrac(grp, 'hpt', hpT)) +
      statBar('Reload', `${reloadS.toFixed(1)} s`, statFrac(grp, 'reload', reloadS, true),
        { mod: eqM.reload !== 1, title: eqTitle(`${spec.gun.reloadS.toFixed(1)} s`) }) +
      statBar('Aim time', `${aimS.toFixed(1)} s`, statFrac(grp, 'aim', aimS, true),
        { mod: eqM.aimTime !== 1, title: eqTitle(`${spec.gun.aimTimeS.toFixed(1)} s`) }) +
      statBar('Damage', `${bestDmg} hp`, statFrac(grp, 'dmg', bestDmg)) +
      statBar('View range', viewText, statFrac(grp, 'view', vrMove),
        { mod: vrMove > vrBase || vrStill > vrMove + 0.5,
          title: vrStill > vrMove + 0.5 ? `Moving / stationary &middot; stock ${vrBase} m`
            : eqTitle(`${vrBase} m`) }) +
      statBar('Camouflage', `${Math.round(camoStill * 100)} / ${Math.round(camoMove * 100)} %`,
        statFrac(grp, 'camo', camoStill),
        { mod: camoModded, title: 'Stationary / moving' +
          (camoModded ? ` &middot; stock ${Math.round(baseCamoOf(spec, false) * 100)} %` : '') }) +
      `<div class="sep"></div>` + shellRows +
      `<div class="sep"></div>` +
      `<div class="armorline"><span>Hull front</span><b>${hullMm != null ? `${Math.round(hullMm)} mm` : '&mdash;'}</b></div>` +
      `<div class="armorline"><span>Turret front</span><b>${turMm != null ? `${Math.round(turMm)} mm` : '&mdash;'}</b></div>` +
      `<div class="armorline"><span>Gun</span><b>${spec.gun.caliberMm} mm</b></div>` +
      `<div class="armorline"><span>Depression</span><b>&minus;${spec.gunDepressionDeg}&deg; / +${spec.gunElevationDeg}&deg;</b></div>` +
      // §5.31b PRINT VIEWER: view-only notice replaces the loadout slots —
      // equipment cannot be mounted on (or saved for) a print pseudo-spec.
      `<div class="sep"></div>` +
      `<div class="eqhead"><span>Equipment</span><i>${eqIds.length}/${EQUIP_SLOTS}</i></div>` +
      `<div class="eqrow">${slotBoxes}</div>`;
    statsEl.querySelector('h3').textContent = spec.label?.displayName || spec.name;
  }

  function applySelection(specId) {
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
    battleMenu.classList.add('open');
    battleModeBtn.setAttribute('aria-expanded', 'true');
    battleChoices.find((choice) => choice.dataset.mode === battleMode)?.focus();
  }
  function setBattleMode(nextMode) {
    const meta = battleModeMeta[nextMode];
    if (!meta) return;
    battleMode = nextMode;
    battleModeBtn.querySelector('span').textContent = meta.short;
    battleBtn.querySelector('.battle-active-icon').innerHTML = uiIconSVG(meta.icon, 20);
    battleModeBtn.setAttribute('aria-label', `Battle type: ${meta.label}. Change battle type`);
    battleBtn.setAttribute('aria-label', `Start ${meta.label} battle`);
    for (const choice of battleChoices) {
      choice.setAttribute('aria-checked', String(choice.dataset.mode === nextMode));
    }
  }

  battleBtn.addEventListener('click', battle);
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
  // listens on window keydown and gates on game.phase === 'garage'); Home
  // goes to the landing page. Garage is the current screen (active chip).
  root.querySelector('[data-nav="studio"]').addEventListener('click', () => {
    emit('ui:click', {});
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F8' }));
  });
  root.querySelector('[data-nav="surface"]').addEventListener('click', () => {
    emit('ui:click', {});
    window.location.href = '/surface-studio';
  });
  root.querySelector('[data-nav="home"]').addEventListener('click', () => {
    emit('ui:click', {});
    window.location.href = '/home'; // pretty route (vite.config.js rewrite)
  });
  function onKey(e) {
    if (!api.isOpen) return;
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
      refreshLocalRecord();
      root.style.display = 'block';
      // garage_ui entrance: re-arm the chrome fade/rise on every open (boot
      // and battle-exit both used to hard-cut the whole screen in one frame)
      root.classList.remove('enter');
      void root.offsetWidth; // restart the CSS animation set
      root.classList.add('enter');
      if (!api.isOpen) window.addEventListener('keydown', onKey);
      api.isOpen = true;
      api.setSelected(specById.has(selected) ? selected : selectedId);
    },

    /** Close the garage screen. */
    hide() {
      closeBattleMenu();
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
      const x0 = Math.max(rr.left, left && left.width ? left.right + 14 : rr.left + 24);
      const x1 = Math.min(rr.right, stats.width ? stats.left - 14 : rr.right - 24);
      const y0 = rr.top + 78;
      const y1 = Math.min(rr.bottom, carousel && carousel.height ? carousel.top - 14 : rr.bottom - 190);
      return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
    },

    /**
     * Highlight a tank in the carousel and refresh the stats card; calls onSelect.
     * @param {string} specId
     */
    setSelected(specId) {
      if (applySelection(specId) && onSelect) onSelect(specId);
    },

    /** Currently highlighted vehicle id (probe/tooling hook). @returns {?string} */
    getSelected() { return selectedId; },

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
