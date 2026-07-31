// src/ui/garage.js — full-screen garage/tank-select overlay: dark gradient
// frame with a transparent center band (the 3D pedestal shows through),
// bottom tank carousel, right stats card, top-center BATTLE button.
// Contract: docs/ARCHITECTURE.md §3.7.3.

import { FONT_STACK, ensureFonts } from './fonts.js';
import { flagSVG } from './flags.js';
import { createTechTree } from './techtree.js';
import { ensureTankThumbs, drainTankThumbs, getTankThumb, requeueTankThumbs } from './tankThumbs.js';
// CAMO PICKER SECTION: swatches preview the REAL resolved pattern (scheme +
// palette from materials.js) instead of hand-approximated CSS gradients.
import { resolveCamoVisual } from '../vehicles/materials.js';
import { MODEL_SOURCE } from '../vehicles/specs.js';
import { EQUIPMENT } from '../sim/spotting.js';

const NATION_LABEL = {
  USA: 'USA', Germany: 'GER', USSR: 'USSR', Russia: 'RUS', 'USSR/Russia': 'RUS',
  Sweden: 'SWE', Community: 'COM', UK: 'UK', France: 'FRA', Israel: 'ISR',
  China: 'CHN', 'South Korea': 'KOR', Japan: 'JPN', Italy: 'ITA',
};

// WoT-style tier numerals per vehicle (mirrors hud.js TIER_BY_ID — r5: the
// carousel cards carried no tier at all, a core piece of WoT card info)
const TIER_BY_ID = {
  m4a3e8: 'VI', t34_85: 'VI', tiger1: 'VII', is2: 'VII', panther_g: 'VII',
  m1a2: 'X', t90m: 'X', leo2a7: 'X',
  strv103: 'IX', is3: 'VIII', t34_85_cad: 'VI', newc_tiger: 'VII',
  newc_pziii: 'IV', pziii_konserwa: 'III', leichttraktor: 'I',
  recon_tank: 'VIII', q_heavy: 'IX',
  // community waves 2+3
  kv2: 'VI', tiger2: 'VIII', sherman_jumbo: 'VI', jagdtiger: 'IX',
  jpz_e100: 'X', sturmtiger: 'VIII', t95: 'IX', t30: 'IX',
  is7: 'X', object279: 'X', is6b: 'VIII', is1: 'V',
  // modern expansion (state.js SPEC_TIER mirrors these numerically)
  m1a1: 'IX', t90a: 'IX', m1a2_tusk: 'X',
  t72b3: 'VIII', challenger2: 'IX', merkava4: 'IX', leo2a6: 'IX',
  leo2a4: 'VIII', t80u: 'VIII', leclerc: 'IX', type99a: 'IX',
  leo1a5: 'VII', t14: 'X', chieftain_mk10: 'VII', k2: 'IX', type10: 'IX',
  m2a2_bradley: 'VIII', bmp2: 'VII', ariete: 'VIII',
  // user drops (2026-07-28)
  type74: 'VIII',
  // user drops wave 2 (recovered batch)
  bmp1: 'VI', m1128: 'VIII', m1296: 'VII',
  // user drops wave 4 (recovered batch, final sweep)
  kf51: 'X',
  m1a2_tejas: 'X', abramsx: 'X',
  challenger1: 'VIII', chieftain5: 'VII', fv510: 'VII',
  leo2_revolution: 'X', leo2a5: 'IX', leo2a7v: 'X',
  m1a1ha: 'IX', m1a2_sepv2: 'X', m60a1: 'VII', pt91m: 'VIII',
  merkava1b: 'VII', merkava2b: 'VII', merkava2d: 'VIII',
  merkava3b: 'VIII', merkava3c: 'VIII', merkava3d: 'IX', merkava4b: 'IX',
  t62mv1: 'VII', t64bv1: 'VIII', t72b_1987: 'VIII', t72b3m: 'IX',
  t72bu: 'VIII', t90sm: 'IX', type90: 'IX', t90a_vladimir: 'IX',
  is3_bergman: 'VIII', isu152: 'VIII', isu122s: 'VIII',
  centurion3: 'VII', centurion5: 'VIII', comet: 'VII', challenger_cruiser: 'VI', charioteer: 'VIII',
  leopard2_proto: 'VIII', m1a1_aim: 'IX', m46_patton: 'VII', m47_patton: 'VII',
  m26_pershing: 'VIII', m45_patton: 'VIII', m60a3: 'VIII',
};

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
.cot-garage .title{position:absolute;top:22px;left:34px;font-size:17px;font-weight:800;
  letter-spacing:.30em;color:#9fb0bf;text-transform:uppercase;}
.cot-garage .title b{color:#f0a030;}
/* r6-2 (round critique: vehicle name + flag + class line appeared TWICE —
   top-left header and right stats panel): the top-left corner now carries
   only the game logo + a quiet screen-mode tag; the vehicle identity lives
   solely on the stats card. */
.cot-garage .modetag{position:absolute;top:47px;left:35px;font-size:10px;
  font-weight:700;letter-spacing:.30em;color:#68747f;text-transform:uppercase;}
.cot-tech{position:absolute;top:70px;left:34px;pointer-events:auto;cursor:pointer;
  display:flex;align-items:center;gap:8px;
  font-family:${FONT_STACK};font-size:10.5px;font-weight:800;letter-spacing:.20em;
  color:#c6d2dc;text-transform:uppercase;padding:8px 16px 7px;
  background:rgba(11,15,20,.82);border:1px solid rgba(146,164,180,.35);
  border-bottom:2px solid rgba(146,164,180,.45);
  transition:color .12s,border-color .12s;}
.cot-tech:hover{color:#ffd27a;border-color:rgba(240,176,74,.65);}
.cot-tech .tt-ico{font-size:12px;line-height:1;color:#f0b04a;}
/* r7: ONE flat orange plate, no gloss, no bevel highlight, no text shadow —
   the r5 two-stop gradient + inset bevels + letterform shadow still read as
   2012 Flash-game chrome, and the clip-path chamfer aliased at 1080p. The
   chamfered plate is now an SVG background (rasterized with proper edge
   anti-aliasing) carrying only a 1px outline and a darker bottom edge. */
.cot-battle{position:absolute;top:26px;left:50%;transform:translateX(-50%);
  pointer-events:auto;cursor:pointer;border:none;outline:none;
  width:252px;height:46px;padding:0 0 1px;
  font-family:${FONT_STACK};font-size:19px;font-weight:800;letter-spacing:.30em;
  text-indent:.30em;color:#fff8ee;text-shadow:none;
  background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 252 46'%3E%3Cpath d='M11.2 .5H240.8L251.5 23 240.8 45.5H11.2L.5 23Z' fill='%23ee8912' stroke='%238a4a06' stroke-width='1'/%3E%3Cpath d='M1.4 24.8 11.8 45.1h228.4l10.4-20.3' fill='none' stroke='%23a85a05' stroke-width='2' opacity='.9'/%3E%3C/svg%3E") 0 0/100% 100% no-repeat;
  transition:filter .12s,transform .06s;}
.cot-battle:hover{filter:brightness(1.07);}
.cot-battle:active{transform:translateX(-50%) translateY(1px);}
.cot-garage .stats{position:absolute;right:26px;top:110px;width:300px;
  background:linear-gradient(180deg,rgba(11,15,20,.88),rgba(7,10,13,.92));
  border:1px solid rgba(146,164,180,.28);box-shadow:0 8px 30px rgba(0,0,0,.55);
  padding:16px 18px 14px;pointer-events:auto;}
.cot-garage .stats h3{font-size:15px;font-weight:700;letter-spacing:.02em;color:#eef4f9;}
.cot-garage .stats .sub{font-size:10px;font-weight:700;letter-spacing:.18em;color:#8a97a3;
  text-transform:uppercase;margin:4px 0 12px;display:flex;align-items:center;gap:7px;}
.cot-garage .stats .sub svg{display:block;box-shadow:0 1px 3px rgba(0,0,0,.5);}
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
/* MODERN EXPANSION: era filter chips — 35+ vehicles need grouping to stay
   navigable; the carousel shows one era group at a time (WWII/MODERN/COMMUNITY) */
.cot-era-chips{position:absolute;left:50%;bottom:172px;transform:translateX(-50%);
  display:flex;gap:6px;pointer-events:auto;}
.cot-era-chip{cursor:pointer;border:1px solid rgba(146,164,180,.3);
  border-bottom:2px solid rgba(146,164,180,.4);background:rgba(11,15,20,.82);
  color:#9fb0bf;font-family:${FONT_STACK};font-size:10px;font-weight:800;
  letter-spacing:.20em;text-transform:uppercase;padding:7px 18px 6px;
  transition:color .12s,border-color .12s;outline:none;}
.cot-era-chip:hover{color:#c6d2dc;border-color:rgba(210,225,240,.5);}
.cot-era-chip.sel{color:#ffd27a;border-color:rgba(240,176,74,.65);
  border-bottom-color:#f0a030;
  background:linear-gradient(180deg,rgba(32,24,12,.9),rgba(14,10,6,.92));}
.cot-era-chip .ct{margin-left:7px;font-weight:600;color:#6d7a86;letter-spacing:.05em;}
.cot-era-chip.sel .ct{color:#d8a04c;}
.cot-carousel{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);
  display:flex;align-items:stretch;gap:8px;pointer-events:auto;max-width:96vw;}
.cot-car-arrow{width:34px;border:1px solid rgba(146,164,180,.3);cursor:pointer;
  background:rgba(11,15,20,.8);color:#9fb0bf;font-size:20px;font-family:${FONT_STACK};
  transition:color .12s,border-color .12s;outline:none;}
.cot-car-arrow:hover{color:#f0b04a;border-color:rgba(240,176,74,.6);}
/* r7-2 (round critique: "'Type 99A (ZTZ-9' truncates with no ellipsis at
   the strip edge"): the overflow container hard-clipped the last partially
   visible card mid-glyph. A right-edge fade mask dissolves the partial card
   into the strip edge instead — the standard carousel "more content"
   affordance — while each card's own label keeps its CSS ellipsis. */
.cot-cards{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;
  -webkit-mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 64px),transparent 100%);
  mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 64px),transparent 100%);}
.cot-cards::-webkit-scrollbar{display:none;}
.cot-card{width:132px;flex:0 0 auto;cursor:pointer;position:relative;
  background:linear-gradient(180deg,rgba(13,18,23,.86),rgba(8,11,14,.92));
  border:1px solid rgba(146,164,180,.26);border-top:2px solid rgba(146,164,180,.26);
  padding:9px 10px 8px;transition:border-color .12s,transform .12s,box-shadow .12s;}
.cot-card:hover{border-color:rgba(210,225,240,.5);}
.cot-card.sel{border-color:#f0a030;border-top-color:#f0a030;transform:translateY(-6px);
  box-shadow:0 8px 26px rgba(240,140,20,.28);
  background:linear-gradient(180deg,rgba(32,24,12,.92),rgba(14,10,6,.94));}
.cot-card .flag{display:inline-flex;align-items:center;gap:5px;margin-bottom:5px;
  font-size:8.5px;font-weight:800;letter-spacing:.14em;color:#9fb0bf;}
.cot-card .flag svg{display:block;box-shadow:0 1px 3px rgba(0,0,0,.55);}
.cot-card .flag i{font-style:normal;}
.cot-card.sel .flag{color:#d8c39a;}
.cot-card .era{float:right;font-size:8.5px;font-weight:700;letter-spacing:.12em;
  color:#8a97a3;padding:2px 0;}
.cot-card.sel .era{color:#d8a04c;}
.cot-card .ti{display:block;margin:1px auto 2px;width:106px;height:64px;
  object-fit:contain;filter:drop-shadow(0 3px 5px rgba(0,0,0,.5));}
.cot-card .nm{font-size:10.5px;font-weight:600;color:#eef4f9;letter-spacing:-.01em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0 -5px;text-align:center;}
.cot-card .nm .tiern{font-weight:800;color:#d8a04c;margin-right:4px;letter-spacing:.02em;}
.cot-card.sel .nm .tiern{color:#f0b04a;}
.cot-card .cls{font-size:9px;font-weight:700;letter-spacing:.18em;color:#8a97a3;
  text-transform:uppercase;margin-top:2px;}
.cot-garage .hint{position:absolute;bottom:4px;left:50%;transform:translateX(-50%);
  font-size:9.5px;letter-spacing:.14em;color:rgba(138,151,163,.7);text-transform:uppercase;}
/* r5: top-right currency/XP strip (WoT garage constant — the screen read as
   a demo shell without an economy bar; values are session-stubbed) */
.cot-topbar{position:absolute;top:20px;right:26px;display:flex;gap:8px;}
.cot-topbar .res{display:flex;align-items:center;gap:7px;padding:7px 12px 6px;
  background:rgba(11,15,20,.82);border:1px solid rgba(146,164,180,.28);
  font-size:12.5px;font-weight:600;color:#e6edf3;letter-spacing:.03em;
  font-variant-numeric:tabular-nums;line-height:1;}
.cot-topbar .res svg{display:block;flex:0 0 auto;}
/* MAP-CONFIG WIRING: battlefield picker (4 maps + random) */
/* camo_spotting r1: maps + camo picker stack in ONE flex column so they can
   never overlap at short viewports (the old absolute anchors collided at
   1600x900 — the RANDOM card's conic-gradient thumb showed through the camo
   grid's 5px gaps as a phantom "white national cross"). */
.cot-leftcol{position:absolute;left:34px;top:122px;bottom:calc(36% + 10px);
  width:224px;display:flex;flex-direction:column;gap:14px;overflow:hidden;pointer-events:auto;}
.cot-maps{position:static;width:224px;min-height:0;overflow-y:auto;
  scrollbar-width:none;flex:0 1 auto;pointer-events:auto;}
.cot-maps .mtitle{font-size:10px;font-weight:700;letter-spacing:.24em;color:#8a97a3;
  text-transform:uppercase;margin-bottom:7px;}
.cot-map-card{display:flex;align-items:center;gap:9px;cursor:pointer;margin-bottom:4px;
  background:linear-gradient(180deg,rgba(13,18,23,.82),rgba(8,11,14,.9));
  border:1px solid rgba(146,164,180,.24);border-left:2px solid rgba(146,164,180,.24);
  padding:3px 8px 3px 5px;transition:border-color .12s,background .12s;}
.cot-map-card:hover{border-color:rgba(210,225,240,.5);}
.cot-map-card.sel{border-color:#f0a030;border-left-color:#f0a030;
  background:linear-gradient(180deg,rgba(32,24,12,.9),rgba(14,10,6,.92));}
.cot-map-card .mthumb{width:72px;height:34px;flex:0 0 auto;background-size:112% auto;
  background-position:center;border:1px solid rgba(0,0,0,.55);position:relative;
  box-shadow:inset 0 0 0 1px rgba(235,243,250,.14);
  transition:background-size .18s ease;}
.cot-map-card:hover .mthumb{background-size:128% auto;}
.cot-map-card.sel .mthumb{box-shadow:inset 0 0 0 1px rgba(240,176,74,.45);}
.cot-map-card .mthumb.verdant{background-color:#3d5a2e;background-image:linear-gradient(135deg,#4c6b38,#2c421f);}
.cot-map-card .mthumb.desert{background-color:#b3925c;background-image:linear-gradient(135deg,#c9a86e,#8f6f42);}
.cot-map-card .mthumb.winter{background-color:#aeb9c4;background-image:linear-gradient(135deg,#cdd6de,#7f8d9b);}
.cot-map-card .mthumb.urban{background-color:#5c6066;background-image:linear-gradient(135deg,#75797e,#3e4247);}
.cot-map-card .mthumb.random{background-image:conic-gradient(#4c6b38 0 25%,#c9a86e 0 50%,#cdd6de 0 75%,#5c6066 0);}
.cot-map-card .mname{font-size:11px;font-weight:600;color:#e6edf3;letter-spacing:.02em;}
.cot-map-card .msub{font-size:8.5px;font-weight:700;letter-spacing:.14em;color:#8a97a3;
  text-transform:uppercase;margin-top:1px;}
.cot-map-card.sel .msub{color:#d8a04c;}
/* CAMO PICKER SECTION: per-tank paint pattern (persisted, +concealment) */
.cot-camos{position:static;width:196px;flex:0 0 auto;margin-top:auto;pointer-events:auto;}
.cot-camos .ctitle{font-size:10px;font-weight:700;letter-spacing:.24em;color:#8a97a3;
  text-transform:uppercase;margin-bottom:7px;}
.cot-camos .cgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;}
.cot-camo-card{cursor:pointer;text-align:center;padding:4px 3px 3px;
  background:linear-gradient(180deg,rgba(13,18,23,.82),rgba(8,11,14,.9));
  border:1px solid rgba(146,164,180,.24);border-bottom:2px solid rgba(146,164,180,.24);
  transition:border-color .12s,background .12s;}
.cot-camo-card:hover{border-color:rgba(210,225,240,.5);}
.cot-camo-card.sel{border-color:#f0a030;border-bottom-color:#f0a030;
  background:linear-gradient(180deg,rgba(32,24,12,.9),rgba(14,10,6,.92));}
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

/* Compact touch garage: keep the tank, BATTLE action and vehicle roster
   dominant on a phone-sized landscape screen. The full stat sheet remains
   available on desktop, while mobile keeps the interactive loadout column. */
@media (max-width:900px){
  .cot-garage .band-top{height:23%;}.cot-garage .band-bot{height:31%;}
  .cot-garage .band-r{display:none;}
  .cot-garage .title{top:14px;left:14px;font-size:13px;letter-spacing:.22em;}
  .cot-garage .modetag{top:35px;left:15px;font-size:7.5px;letter-spacing:.24em;}
  .cot-tech{top:56px;left:14px;padding:6px 10px 5px;font-size:8px;}
  .cot-battle{top:12px;width:214px;height:40px;font-size:15px;}
  .cot-garage .stats{display:none;}
  .cot-topbar{top:8px;right:8px;gap:3px;transform:scale(.72);transform-origin:right top;}
  .cot-leftcol{left:14px;top:98px;bottom:112px;width:180px;gap:7px;overflow:visible;}
  .cot-maps{display:none;}
  .cot-camos{width:180px;margin-top:0;padding:7px;
    background:rgba(7,11,15,.62);border:1px solid rgba(146,164,180,.18);}
  .cot-camos .ctitle{font-size:8px;margin-bottom:5px;}
  .cot-camo-card{padding:3px 2px 2px;}.cot-camo-card .sw{height:22px;margin-bottom:2px;}
  .cot-camo-card .cl{font-size:6.5px;letter-spacing:.06em;}
  .cot-camos .cnote{display:none;}
  .cot-era-chips{bottom:86px;gap:3px;}
  .cot-era-chip{padding:4px 8px 3px;font-size:7px;letter-spacing:.12em;}
  .cot-era-chip .ct{margin-left:3px;}
  .cot-carousel{bottom:8px;gap:4px;height:72px;max-width:98vw;}
  .cot-car-arrow{width:24px;font-size:16px;}
  .cot-cards{gap:4px;-webkit-mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 30px),transparent 100%);
    mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 30px),transparent 100%);}
  .cot-card{width:94px;padding:4px 5px 3px;}
  .cot-card.sel{transform:translateY(-3px);}
  .cot-card .flag{margin-bottom:1px;font-size:6px;gap:2px;}
  .cot-card .flag svg{width:15px;height:auto;}.cot-card .era{font-size:6px;padding:1px 0;}
  .cot-card .ti{width:76px;height:40px;margin:-3px auto -1px;}
  .cot-card .nm{font-size:7.5px;margin:0 -3px;}.cot-card .nm .tiern{margin-right:2px;}
  .cot-card .cls{font-size:6px;margin-top:0;letter-spacing:.12em;}
  .cot-garage .hint{display:none;}
}
`;

function ensureStyle(id, css) {
  if (!document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id;
    s.textContent = css;
    document.head.appendChild(s);
  }
}


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
  } else if ((scheme === 'stripes' || scheme === 'ambush') && patches.length) {
    for (let i = 0; i < 6; i++) {
      const col = swMix(patches[i % patches.length], base, 0.1);
      swBlob(c, rng, rng() * W, rng() * H, S * (0.04 + rng() * 0.05));
      c.fillStyle = swRgb(col, 0.85);
      c.fill();
    }
    if (scheme === 'ambush') {
      for (let i = 0; i < 90; i++) {
        c.fillStyle = swRgb([base, ...patches][(rng() * (patches.length + 1)) | 0], 0.9);
        c.beginPath();
        c.arc(rng() * W, rng() * H, 0.8 + rng() * 0.9, 0, Math.PI * 2);
        c.fill();
      }
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
 * @param {{specs:TankSpec[],bus:{emit:Function},onSelect:Function,onBattle:Function}} opts
 * @returns {{show:Function,hide:Function,isOpen:boolean,setSelected:Function,root:HTMLElement}} Garage
 */
export function createGarage(opts) {
  const { bus, onSelect, onBattle } = opts;
  // r4: placeholder-grade community models are DELISTED from the default
  // carousel — the Newc42 box-hull Tiger and untextured Panzer III J sat
  // next to the hero roster as Minecraft-grade thumbnails (hud_ui r4 major).
  // They stay researchable/selectable through the tech tree's COMMUNITY tab
  // (attribution + playability preserved); only the carousel strip curates.
  // content_breadth r2: bmp1/m1128/m1296 defense-in-depth — registration is
  // already gated off in userdrops2.js (SHIP_USERDROP2_NEW).
  const DELISTED = new Set(['newc_tiger', 'newc_pziii', 'bmp1', 'm1128', 'm1296']);
  const allSpecs = opts.specs || [];
  const specs = allSpecs.filter((s) => !DELISTED.has(s.id));
  ensureFonts();
  ensureStyle('cot-garage-style', GARAGE_CSS);

  const root = document.createElement('div');
  root.className = 'cot-garage';
  root.innerHTML =
    `<div class="band-top"></div><div class="band-bot"></div>` +
    `<div class="band-l"></div><div class="band-r"></div>` +
    `<div class="title">CLAUDE <b>OF TANKS</b></div>` +
    `<div class="modetag">Garage</div>` +
    `<div class="cot-topbar">` +
    `<div class="res"><svg viewBox="0 0 14 14" width="13" height="13">` +
    `<circle cx="7" cy="7" r="6" fill="#c8d2dc"/><circle cx="7" cy="7" r="4.4" fill="none" stroke="#8f9aa4" stroke-width="1"/>` +
    `<path d="M7 3.6v6.8M5 5.4h4M5 8.6h4" stroke="#6d7883" stroke-width="1.1"/></svg>` +
    `<span>2 458 300</span></div>` +
    `<div class="res"><svg viewBox="0 0 14 14" width="13" height="13">` +
    `<circle cx="7" cy="7" r="6" fill="#f0c04a"/><circle cx="7" cy="7" r="4.4" fill="none" stroke="#b98a1e" stroke-width="1"/>` +
    `<circle cx="7" cy="7" r="1.9" fill="#b98a1e"/></svg>` +
    `<span>6 750</span></div>` +
    `<div class="res"><svg viewBox="0 0 14 14" width="13" height="13">` +
    `<path d="M7 .8 8.7 5.3 13.2 7 8.7 8.7 7 13.2 5.3 8.7 .8 7 5.3 5.3Z" fill="#9fd8ec"/></svg>` +
    `<span>48 250</span></div>` +
    `</div>` +
    `<button class="cot-tech" type="button"><span class="tt-ico">&#9776;</span>TECH TREE</button>` +
    `<button class="cot-battle" type="button">BATTLE</button>` +
    `<div class="stats"></div>` +
    `<div class="cot-era-chips"></div>` +
    `<div class="cot-carousel">` +
    `<button class="cot-car-arrow prev" type="button">&#8249;</button>` +
    `<div class="cot-cards"></div>` +
    `<button class="cot-car-arrow next" type="button">&#8250;</button>` +
    `</div>` +
    `<div class="cot-leftcol"><div class="cot-maps"></div>` +
    `<div class="cot-camos"></div></div>` +
    `<div class="hint">&#8592; &#8594; select &nbsp;&middot;&nbsp; enter to battle</div>`;
  document.body.appendChild(root);

  const statsEl = root.querySelector('.stats');
  const cardsEl = root.querySelector('.cot-cards');
  const battleBtn = root.querySelector('.cot-battle');
  const mapsEl = root.querySelector('.cot-maps');

  let selectedId = specs.length ? specs[0].id : null;
  const cardById = new Map();
  const specById = new Map();
  // specById covers the FULL roster (incl. delisted community tanks) so a
  // tech-tree pick of a delisted vehicle still selects it for battle.
  for (const s of allSpecs) specById.set(s.id, s);

  const emit = (ev, payload) => { if (bus && bus.emit) bus.emit(ev, payload); };

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
    grid.className = 'cgrid';
    camosEl.appendChild(grid);
    for (const pid of camoOpts.patterns) {
      const card = document.createElement('div');
      card.className = 'cot-camo-card';
      card.innerHTML = pid === 'auto'
        ? `<div class="sw auto"></div><div class="cl"></div>`
        : `<div class="sw"><canvas></canvas></div><div class="cl"></div>`;
      card.querySelector('.cl').textContent =
        (camoOpts.label && camoOpts.label[pid]) || pid;
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
  // --- EQUIPMENT PICKER (camo_spotting r1): 3-slot loadout toggles ---------
  // Persistence mirrors the camo picker: localStorage `cot.equip.<specId>`
  // (read battle-side by game/state.js loadEquipment -> spotting sim).
  const equipCardById = new Map();
  {
    const title = document.createElement('div');
    title.className = 'ctitle';
    title.style.marginTop = '10px';
    title.textContent = 'Equipment';
    camosEl.appendChild(title);
    const grid = document.createElement('div');
    grid.className = 'cgrid';
    camosEl.appendChild(grid);
    const SHORT = { camo_net: 'Camo Net', binoculars: 'Binocs', vents: 'Vents' };
    // distinct procedural icon per item (r3): net = diamond mesh,
    // binoculars = twin objectives + bridge, vents = fan rotor
    const INK = '#cfd9e2';
    const EQUIP_SVG = {
      camo_net:
        `<svg viewBox="0 0 24 18" width="26" height="20">` +
        `<g stroke="${INK}" stroke-width="1.1" fill="none" opacity=".9">` +
        `<path d="M2 4 8 14M8 2 16 14M16 2 22 12M22 4 16 14M16 2 8 14M8 2 2 10"/>` +
        `</g><path d="M1 3q6 -2.5 11 0q6 2.5 11 0" stroke="${INK}" stroke-width="1.4" fill="none"/></svg>`,
      binoculars:
        `<svg viewBox="0 0 24 18" width="26" height="20">` +
        `<circle cx="7" cy="11" r="5" fill="none" stroke="${INK}" stroke-width="1.7"/>` +
        `<circle cx="17" cy="11" r="5" fill="none" stroke="${INK}" stroke-width="1.7"/>` +
        `<circle cx="7" cy="11" r="1.6" fill="${INK}"/><circle cx="17" cy="11" r="1.6" fill="${INK}"/>` +
        `<rect x="10.6" y="9.6" width="2.8" height="2.8" fill="${INK}"/>` +
        `<rect x="5.4" y="2.6" width="3.2" height="3" fill="${INK}"/>` +
        `<rect x="15.4" y="2.6" width="3.2" height="3" fill="${INK}"/></svg>`,
      vents:
        `<svg viewBox="0 0 24 18" width="26" height="20">` +
        `<circle cx="12" cy="9" r="7.4" fill="none" stroke="${INK}" stroke-width="1.4"/>` +
        `<g fill="${INK}"><path d="M12 9 10.4 3.2q1.6-.9 3.2 0Z"/>` +
        `<path d="M12 9 17.4 11.4q-.2 1.9-1.8 2.7Z"/>` +
        `<path d="M12 9 8.4 13.9q-1.6-.8-1.8-2.7Z"/></g>` +
        `<circle cx="12" cy="9" r="1.7" fill="${INK}"/></svg>`,
    };
    for (const eid of Object.keys(EQUIPMENT)) {
      const card = document.createElement('div');
      card.className = 'cot-camo-card';
      card.title = EQUIPMENT[eid].label;
      card.innerHTML = `<div class="sw eq">${EQUIP_SVG[eid] || ''}</div><div class="cl"></div>`;
      card.querySelector('.cl').textContent = SHORT[eid] || EQUIPMENT[eid].label;
      card.addEventListener('click', () => {
        emit('ui:click', {});
        if (!selectedId) return;
        const cur = loadEquipIds(selectedId);
        const i = cur.indexOf(eid);
        if (i >= 0) cur.splice(i, 1);
        else cur.push(eid);
        try { localStorage.setItem(`cot.equip.${selectedId}`, JSON.stringify(cur)); } catch { /* private mode */ }
        refreshEquipSel();
      });
      grid.appendChild(card);
      equipCardById.set(eid, card);
    }
  }
  function loadEquipIds(specId) {
    try {
      const arr = JSON.parse(localStorage.getItem(`cot.equip.${specId}`) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  function refreshEquipSel() {
    if (!selectedId) return;
    const cur = loadEquipIds(selectedId);
    for (const [eid, card] of equipCardById) card.classList.toggle('sel', cur.includes(eid));
  }
  // --- END EQUIPMENT PICKER ------------------------------------------------
  let swatchesFor = null; // spec id the swatches are currently painted for
  function refreshCamoSel() {
    if (!camoOpts || !selectedId) return;
    const cur = camoOpts.get(selectedId);
    for (const [pid, card] of camoCardById) card.classList.toggle('sel', pid === cur);
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

  // era-group classifier hoisted (r5-2): both the stat-bar normalization and
  // the carousel filter chips below key off it.
  const groupOf = (s) =>
    (s.community && !s.variantOf) ? 'community' : (s.era === 'ww2' ? 'ww2' : 'modern');

  // PER-CLASS stat ranges for the normalized bars. r6-2 (round critique:
  // "6.0 s reload renders ~90% full / bars carry no comparative scale"): the
  // r5-2 per-era ranges let the IFV autocannons (sub-second reload, ~50 hp
  // alpha) stretch every modern range so far that MBT bars parked at
  // arbitrary-looking lengths. Bars now normalize min→max within the
  // vehicle's own ERA + CLASS peer group (an Abrams compares against MBTs,
  // a Bradley against IFVs), higher-is-better on every row (reload
  // inverted: faster = fuller).
  const statGroupOf = (s) => `${groupOf(s)}/${s.class || 'medium'}`;
  const STAT_RANGES = new Map(); // era/class -> {hp,speed,hpt,dmg,reload:[lo,hi]}
  for (const s of allSpecs) {
    const g = statGroupOf(s);
    let r = STAT_RANGES.get(g);
    if (!r) {
      r = {
        hp: [Infinity, -Infinity], speed: [Infinity, -Infinity],
        hpt: [Infinity, -Infinity], dmg: [Infinity, -Infinity],
        reload: [Infinity, -Infinity],
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

  // --- MODERN EXPANSION: era filter chips (WWII / MODERN / COMMUNITY) ------
  // The carousel shows ONE group at a time so a 35+ vehicle roster stays
  // navigable. Nation-roster variants (spec.variantOf) count as MODERN;
  // sourced third-party vehicles (spec.community without variantOf) are
  // COMMUNITY regardless of era. (groupOf hoisted above the stat ranges.)
  const ERA_GROUPS = [
    { id: 'ww2', label: 'WWII' },
    { id: 'modern', label: 'Modern' },
    { id: 'community', label: 'Community' },
    // LOCAL: every vehicle whose registered model source is a real local GLB
    // in THIS build (private/local builds register the recovered fleet; the
    // public build strips them, so the chip auto-hides on zero members).
    // Overlay group — a tank stays in its era group AND appears here.
    { id: 'local', label: 'Local' },
  ];
  const inGroup = (s, gid) => gid === 'local'
    ? MODEL_SOURCE[s.id]?.source === 'glb'
    : groupOf(s) === gid;
  let eraFilter = specs.length ? groupOf(specs[0]) : 'modern';
  const chipsEl = root.querySelector('.cot-era-chips');
  const chipById = new Map();
  for (const g of ERA_GROUPS) {
    const count = specs.filter((s) => inGroup(s, g.id)).length;
    if (!count) continue;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cot-era-chip';
    chip.innerHTML = `${g.label}<span class="ct">${count}</span>`;
    chip.addEventListener('click', () => {
      emit('ui:click', {});
      applyEraFilter(g.id);
      // moving to a new group: select its first vehicle so the pedestal,
      // stats card and highlighted card stay in sync with the visible strip
      const first = specs.find((s) => inGroup(s, g.id));
      if (first && !inGroup(specById.get(selectedId) || first, g.id)) {
        api.setSelected(first.id);
      }
    });
    chipsEl.appendChild(chip);
    chipById.set(g.id, chip);
  }
  function applyEraFilter(gid) {
    eraFilter = gid;
    for (const [id, chip] of chipById) chip.classList.toggle('sel', id === gid);
    for (const s of specs) {
      const card = cardById.get(s.id);
      if (!card) continue;
      card.style.display = inGroup(s, gid) ? '' : 'none';
      // r3: the per-card era tag is REDUNDANT while the matching era chip is
      // the active filter (every visible card would repeat "MODERN" under a
      // selected MODERN chip). It only stays on the mixed-era COMMUNITY tab,
      // where it actually disambiguates.
      const tag = card.querySelector('.era');
      if (tag) {
        // mixed-era tabs (community, local) keep the per-card era tag
        tag.style.display = (s.era === 'ww2' ? 'ww2' : 'modern') === gid ? 'none' : '';
      }
    }
  }
  // --- END era filter chips -------------------------------------------------

  // --- build carousel cards ---
  for (const s of specs) {
    const card = document.createElement('div');
    card.className = 'cot-card';
    // Stable pre-rendered 3/4 portrait. These are generated only after the
    // final model has loaded, so async GLB stand-ins can never replace a card.
    card.innerHTML =
      `<span class="era">${s.era === 'ww2' ? 'WWII' : 'MODERN'}</span>` +
      `<span class="flag">${flagSVG(s.nation, s.era, 18, 12)}<i>${NATION_LABEL[s.nation] || s.nation}</i></span>` +
      `<img class="ti" data-cot-thumb="${s.id}" src="${getTankThumb(s.id)}" alt="">` +
      `<div class="nm"><b class="tiern">${TIER_BY_ID[s.id] || ''}</b><span class="nmt"></span></div>` +
      `<div class="cls">${s.class}</div>`;
    card.querySelector('.nmt').textContent = s.name;
    card.addEventListener('click', () => {
      emit('ui:click', {});
      api.setSelected(s.id);
    });
    cardsEl.appendChild(card);
    cardById.set(s.id, card);
  }
  // Packaged PNGs avoid per-card WebGL contexts and remain deterministic
  // across the garage carousel, tech tree, and screenshot harness.
  ensureTankThumbs(allSpecs, { canWork: () => api.isOpen });

  function statBar(label, valueText, frac) {
    const pct = Math.max(2, Math.min(100, frac * 100)).toFixed(1);
    return `<div class="srow"><div class="lr"><span>${label}</span><b>${valueText}</b></div>` +
      `<div class="track"><div class="fill" style="width:${pct}%"></div></div></div>`;
  }

  function renderStats(spec) {
    const hpT = spec.enginePowerHp / spec.weightTons;
    const shells = (spec.gun && spec.gun.shells) || [];
    let shellRows = '';
    for (const sh of shells) {
      const col = SHELL_TYPE_COLOR[sh.type] || '#9fb0bf';
      // penetration at point blank / at 1 km
      const pen = sh.type === 'HE' ? `${sh.pen100Mm}` : `${sh.pen100Mm} / ${sh.pen1000Mm}`;
      shellRows += `<div class="shellrow"><span class="ty" style="color:${col}">${sh.type}</span>` +
        `<span class="nm">${sh.name}</span>` +
        `<span class="pd"><b>${pen}</b> mm &nbsp;<b>${sh.dmg}</b> hp</span></div>`;
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
    statsEl.innerHTML =
      `<h3></h3><div class="sub">${flagSVG(spec.nation, spec.era, 20, 13)}<span>${spec.nation} &middot; ${spec.class} &middot; ${spec.era === 'ww2' ? 'WWII' : 'MODERN'}</span></div>` +
      statBar('Hit points', `${spec.hp}`, statFrac(grp, 'hp', spec.hp)) +
      statBar('Top speed', `${spec.topSpeedKmh} km/h`, statFrac(grp, 'speed', spec.topSpeedKmh)) +
      statBar('Power / weight', `${hpT.toFixed(1)} hp/t`, statFrac(grp, 'hpt', hpT)) +
      statBar('Reload', `${spec.gun.reloadS.toFixed(1)} s`, statFrac(grp, 'reload', spec.gun.reloadS, true)) +
      statBar('Damage', `${bestDmg} hp`, statFrac(grp, 'dmg', bestDmg)) +
      `<div class="sep"></div>` + shellRows +
      `<div class="sep"></div>` +
      `<div class="armorline"><span>Hull front</span><b>${hullMm != null ? `${Math.round(hullMm)} mm` : '&mdash;'}</b></div>` +
      `<div class="armorline"><span>Turret front</span><b>${turMm != null ? `${Math.round(turMm)} mm` : '&mdash;'}</b></div>` +
      `<div class="armorline"><span>Gun</span><b>${spec.gun.caliberMm} mm</b></div>` +
      `<div class="armorline"><span>Depression</span><b>&minus;${spec.gunDepressionDeg}&deg; / +${spec.gunElevationDeg}&deg;</b></div>` +
      (spec.community
        ? `<div class="sep"></div><div class="armorline"><span>Community model</span><b class="cr"></b></div>`
        : '');
    statsEl.querySelector('h3').textContent = spec.name;
    if (spec.community) {
      const cr = statsEl.querySelector('.cr');
      cr.textContent = `${spec.community.author} · ${spec.community.license}`;
      cr.title = spec.community.source;
    }
  }

  function applySelection(specId) {
    const spec = specById.get(specId);
    if (!spec) return false;
    selectedId = specId;
    // era filter chips: selecting a vehicle from another group (tech tree
    // pick, harness setSelected) switches the visible strip to its group
    if (cardById.has(specId) && groupOf(spec) !== eraFilter) {
      applyEraFilter(groupOf(spec));
    }
    for (const [id, card] of cardById) card.classList.toggle('sel', id === specId);
    const card = cardById.get(specId);
    if (card && card.scrollIntoView) {
      card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
    renderStats(spec);
    refreshCamoSel(); // CAMO PICKER SECTION: highlight this tank's pattern
    refreshEquipSel(); // EQUIPMENT PICKER: highlight this tank's loadout
    return true;
  }

  function step(dir) {
    // arrows walk the ACTIVE era group only (era filter chips)
    const pool = specs.filter((s) => groupOf(s) === eraFilter);
    if (!pool.length) return;
    const idx = pool.findIndex((s) => s.id === selectedId);
    const next = pool[(idx + dir + pool.length) % pool.length];
    emit('ui:click', {});
    api.setSelected(next.id);
  }

  function battle() {
    if (!selectedId) return;
    // Battle entry must be unstoppable: the pre-battle emits fan out to five+
    // subscribers (audio click, pointer-lock grab, killcam/shot-log resets…)
    // and any one of them throwing in an exotic environment would silently
    // block onBattle — a BATTLE button that does nothing is the worst failure
    // mode. Contain their failures; the phase flip always runs.
    try {
      emit('ui:click', {});
      emit('ui:battleStart', { specId: selectedId, mapId: selectedMapId });
    } catch (err) {
      console.error('[garage] battle-start listener failed:', err);
    }
    if (onBattle) onBattle(selectedId, selectedMapId); // MAP-CONFIG WIRING
  }

  battleBtn.addEventListener('click', battle);
  root.querySelector('.prev').addEventListener('click', () => step(-1));
  root.querySelector('.next').addEventListener('click', () => step(1));

  // --- tech tree (research screen layered over the garage) ---
  const techtree = createTechTree({
    specs: allSpecs,
    bus,
    onPick: (specId) => { api.setSelected(specId); },
    onClose: () => {},
  });
  const NATION_TAB = {
    USA: 'usa', Germany: 'germany', USSR: 'ussr', Russia: 'ussr',
    'USSR/Russia': 'ussr', UK: 'uk', France: 'france', Israel: 'israel',
    China: 'china', 'South Korea': 'korea', Japan: 'japan', Italy: 'italy',
  };
  root.querySelector('.cot-tech').addEventListener('click', () => {
    emit('ui:click', {});
    const sel = specById.get(selectedId);
    // COMMUNITY TANKS live on their own tech-tree tab; nation-roster
    // variants (spec.variantOf) stay on their nation tab
    techtree.show(sel
      ? (sel.community && !sel.variantOf ? 'community' : NATION_TAB[sel.nation] || 'usa')
      : 'usa');
  });

  function onKey(e) {
    if (!api.isOpen || techtree.isOpen) return;
    if (e.code === 'ArrowLeft') { step(-1); e.preventDefault(); }
    else if (e.code === 'ArrowRight') { step(1); e.preventDefault(); }
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') { battle(); e.preventDefault(); }
  }

  const api = {
    root,
    isOpen: false,

    /**
     * Open the garage screen.
     * @param {string} [selectedId='m1a2'] - initially highlighted tank id.
     */
    show(selected = 'm1a2') {
      root.style.display = 'block';
      if (!api.isOpen) window.addEventListener('keydown', onKey);
      api.isOpen = true;
      api.setSelected(specById.has(selected) ? selected : selectedId);
    },

    /** Close the garage screen (and any tech tree layered over it). */
    hide() {
      root.style.display = 'none';
      if (techtree.isOpen) techtree.hide();
      if (api.isOpen) window.removeEventListener('keydown', onKey);
      api.isOpen = false;
    },

    /** The research screen (created/owned by the garage). */
    techtree,

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
     * Open the tech tree over the garage (used by the screenshot harness).
     * @param {string} [nation='usa'] 'usa' | 'germany' | 'ussr'
     */
    showTechTree(nation = 'usa') {
      techtree.show(nation);
    },

    /**
     * Highlight a tank in the carousel and refresh the stats card; calls onSelect.
     * @param {string} specId
     */
    setSelected(specId) {
      if (applySelection(specId) && onSelect) onSelect(specId);
    },

    // --- MAP-CONFIG WIRING ---
    /** Currently selected battlefield id ('random' allowed). @returns {string} */
    getSelectedMap() { return selectedMapId; },

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

  applyEraFilter(eraFilter); // era chips: initial group visibility
  if (selectedId) applySelection(selectedId);
  return api;
}
