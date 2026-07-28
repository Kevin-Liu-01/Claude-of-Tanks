// src/ui/garage.js — full-screen garage/tank-select overlay: dark gradient
// frame with a transparent center band (the 3D pedestal shows through),
// bottom tank carousel, right stats card, top-center BATTLE button.
// Contract: docs/ARCHITECTURE.md §3.7.3.

import { FONT_STACK, ensureFonts } from './fonts.js';
import { flagSVG } from './flags.js';
import { iconUrl } from './icons.js';
import { createTechTree } from './techtree.js';
import { ensureTankThumbs, drainTankThumbs, getTankThumb } from './tankThumbs.js';
// CAMO PICKER SECTION: swatches preview the REAL resolved pattern (scheme +
// palette from materials.js) instead of hand-approximated CSS gradients.
import { resolveCamoVisual } from '../vehicles/materials.js';
import { EQUIPMENT } from '../sim/spotting.js';

const NATION_LABEL = { USA: 'USA', Germany: 'GER', USSR: 'USSR', Russia: 'RUS', Sweden: 'SWE', Community: 'COM' };

// WoT-style tier numerals per vehicle (mirrors hud.js TIER_BY_ID — r5: the
// carousel cards carried no tier at all, a core piece of WoT card info)
const TIER_BY_ID = {
  m4a3e8: 'VI', t34_85: 'VI', tiger1: 'VII', is2: 'VII', panther_g: 'VII',
  m1a2: 'X', t90m: 'X', leo2a7: 'X',
  strv103: 'IX', is3: 'VIII', t34_85_cad: 'VI', newc_tiger: 'VII',
  newc_pziii: 'IV', pziii_konserwa: 'III', leichttraktor: 'I',
  recon_tank: 'VIII', q_heavy: 'IX',
};

const SHELL_TYPE_COLOR = {
  AP: '#ffd27a', APCR: '#e8f4ff', HEAT: '#ff8a5c', HE: '#ffb02e', APFSDS: '#ffc46b',
};

// roster maxima for normalized stat bars are computed from the actual specs
// passed to createGarage (so bars always spread across the roster range).

const GARAGE_CSS = `
.cot-garage{position:fixed;inset:0;z-index:60;display:none;font-family:${FONT_STACK};
  color:#e6edf3;-webkit-user-select:none;user-select:none;overflow:hidden;}
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
.cot-garage .selname{position:absolute;top:46px;left:34px;font-size:30px;font-weight:500;
  letter-spacing:-.01em;color:#eef4f9;}
.cot-garage .selsub{position:absolute;top:88px;left:36px;font-size:11px;font-weight:600;
  letter-spacing:.18em;color:#8a97a3;text-transform:uppercase;display:flex;
  align-items:center;gap:8px;}
.cot-garage .selsub svg{display:block;box-shadow:0 1px 4px rgba(0,0,0,.5);}
.cot-tech{position:absolute;top:118px;left:34px;pointer-events:auto;cursor:pointer;
  display:flex;align-items:center;gap:8px;
  font-family:${FONT_STACK};font-size:10.5px;font-weight:800;letter-spacing:.20em;
  color:#c6d2dc;text-transform:uppercase;padding:8px 16px 7px;
  background:rgba(11,15,20,.82);border:1px solid rgba(146,164,180,.35);
  border-bottom:2px solid rgba(146,164,180,.45);
  transition:color .12s,border-color .12s;}
.cot-tech:hover{color:#ffd27a;border-color:rgba(240,176,74,.65);}
.cot-tech .tt-ico{font-size:12px;line-height:1;color:#f0b04a;}
/* r5: FLAT two-stop plate with a crisp 1px bevel — the old three-stop glossy
   gradient + orange glow + fuzzy text shadow read as a 2012 Flash-game web
   button, not a shipped client's battle CTA */
.cot-battle{position:absolute;top:26px;left:50%;transform:translateX(-50%);
  pointer-events:auto;cursor:pointer;border:none;outline:none;
  font-family:${FONT_STACK};font-size:19px;font-weight:800;letter-spacing:.30em;
  color:#fff8ee;text-shadow:0 1px 0 rgba(96,44,0,.85);
  padding:13px 66px 13px 74px;
  background:linear-gradient(180deg,#f5921c 0%,#dd6f04 100%);
  border:1px solid #8f4a06;
  box-shadow:inset 0 1px 0 rgba(255,224,170,.55),inset 0 -1px 0 rgba(90,42,0,.55),
  0 2px 8px rgba(0,0,0,.45);
  transition:filter .12s,transform .06s;clip-path:polygon(4% 0,96% 0,100% 50%,96% 100%,4% 100%,0 50%);}
.cot-battle:hover{filter:brightness(1.08);}
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
.cot-garage .srow .lr b{color:#e6edf3;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:.02em;}
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
.cot-garage .armorline b{color:#e6edf3;font-weight:600;font-variant-numeric:tabular-nums;}
.cot-carousel{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);
  display:flex;align-items:stretch;gap:8px;pointer-events:auto;max-width:96vw;}
.cot-car-arrow{width:34px;border:1px solid rgba(146,164,180,.3);cursor:pointer;
  background:rgba(11,15,20,.8);color:#9fb0bf;font-size:20px;font-family:${FONT_STACK};
  transition:color .12s,border-color .12s;outline:none;}
.cot-car-arrow:hover{color:#f0b04a;border-color:rgba(240,176,74,.6);}
.cot-cards{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;}
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
.cot-leftcol{position:absolute;left:34px;top:168px;bottom:calc(36% + 10px);
  width:224px;display:flex;flex-direction:column;gap:14px;overflow:hidden;pointer-events:auto;}
.cot-maps{position:static;width:224px;min-height:0;overflow-y:auto;
  scrollbar-width:none;flex:0 1 auto;pointer-events:auto;}
.cot-maps .mtitle{font-size:10px;font-weight:700;letter-spacing:.24em;color:#8a97a3;
  text-transform:uppercase;margin-bottom:7px;}
.cot-map-card{display:flex;align-items:center;gap:9px;cursor:pointer;margin-bottom:6px;
  background:linear-gradient(180deg,rgba(13,18,23,.82),rgba(8,11,14,.9));
  border:1px solid rgba(146,164,180,.24);border-left:2px solid rgba(146,164,180,.24);
  padding:5px 8px 5px 6px;transition:border-color .12s,background .12s;}
.cot-map-card:hover{border-color:rgba(210,225,240,.5);}
.cot-map-card.sel{border-color:#f0a030;border-left-color:#f0a030;
  background:linear-gradient(180deg,rgba(32,24,12,.9),rgba(14,10,6,.92));}
.cot-map-card .mthumb{width:86px;height:48px;flex:0 0 auto;background-size:112% auto;
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
.cot-camos .cnote{font-size:8.5px;font-weight:700;letter-spacing:.14em;
  color:#8a97a3;text-transform:uppercase;margin-top:6px;white-space:nowrap;
  text-shadow:0 1px 2px rgba(0,0,0,.7);}
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
  const DELISTED = new Set(['newc_tiger', 'newc_pziii']);
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
    `<div class="selname"></div><div class="selsub"></div>` +
    `<button class="cot-tech" type="button"><span class="tt-ico">&#9776;</span>TECH TREE</button>` +
    `<button class="cot-battle" type="button">BATTLE</button>` +
    `<div class="stats"></div>` +
    `<div class="cot-carousel">` +
    `<button class="cot-car-arrow prev" type="button">&#8249;</button>` +
    `<div class="cot-cards"></div>` +
    `<button class="cot-car-arrow next" type="button">&#8250;</button>` +
    `</div>` +
    `<div class="cot-leftcol"><div class="cot-maps"></div>` +
    `<div class="cot-camos"></div></div>` +
    `<div class="hint">&#8592; &#8594; select &nbsp;&middot;&nbsp; enter to battle</div>`;
  document.body.appendChild(root);

  const selName = root.querySelector('.selname');
  const selSub = root.querySelector('.selsub');
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
      });
      grid.appendChild(card);
      camoCardById.set(pid, card);
    }
    const note = document.createElement('div');
    note.className = 'cnote';
    note.textContent = 'Pattern +3.5% concealment';
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

  // roster maxima/minima for normalized stat bars — every bar spreads across
  // the actual roster range so bar length carries meaning (r3: the old
  // fixed-scale reload bar sat near-full for every tank)
  const MAXES = {
    hp: 1, speed: 1, hpt: 1, dmg: 1, reloadMax: 1, reloadMin: Infinity,
  };
  for (const s of allSpecs) {
    MAXES.hp = Math.max(MAXES.hp, s.hp);
    MAXES.speed = Math.max(MAXES.speed, s.topSpeedKmh);
    MAXES.hpt = Math.max(MAXES.hpt, s.enginePowerHp / s.weightTons);
    MAXES.reloadMax = Math.max(MAXES.reloadMax, s.gun.reloadS);
    MAXES.reloadMin = Math.min(MAXES.reloadMin, s.gun.reloadS);
    const shells = (s.gun && s.gun.shells) || [];
    for (const sh of shells) MAXES.dmg = Math.max(MAXES.dmg, sh.dmg || 0);
  }
  if (!isFinite(MAXES.reloadMin)) MAXES.reloadMin = 1;

  // --- build carousel cards ---
  for (const s of specs) {
    const card = document.createElement('div');
    card.className = 'cot-card';
    // portrait: runtime-rendered 3/4 side-profile (tankThumbs.js) with the
    // baked hero icon as the instant fallback while portraits render
    card.innerHTML =
      `<span class="era">${s.era === 'ww2' ? 'WWII' : 'MODERN'}</span>` +
      `<span class="flag">${flagSVG(s.nation, s.era, 18, 12)}<i>${NATION_LABEL[s.nation] || s.nation}</i></span>` +
      `<img class="ti" data-cot-thumb="${s.id}" src="${getTankThumb(s.id) || iconUrl(s.id, 'angle')}" alt="">` +
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
  // PERF (load-to-ready): portraits render as idle-time chunks while the
  // garage is VISIBLE (see tankThumbs.js) — off the __GAME_READY critical
  // path, and never inside a battle frame. Cards ship with the baked icons
  // and upgrade in place as chunks land; screenshot recipes call
  // api.drainThumbs() so captured garage frames always carry portraits.
  ensureTankThumbs(allSpecs, { canWork: () => api.isOpen }); // tech tree needs delisted portraits too

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
    const reloadSpan = Math.max(0.5, MAXES.reloadMax - MAXES.reloadMin);
    const reloadFrac = Math.max(0.06,
      (MAXES.reloadMax - spec.gun.reloadS) / reloadSpan * 0.94 + 0.06);
    statsEl.innerHTML =
      `<h3></h3><div class="sub">${flagSVG(spec.nation, spec.era, 20, 13)}<span>${spec.nation} &middot; ${spec.class} &middot; ${spec.era === 'ww2' ? 'WWII' : 'MODERN'}</span></div>` +
      statBar('Hit points', `${spec.hp}`, spec.hp / MAXES.hp) +
      statBar('Top speed', `${spec.topSpeedKmh} km/h`, spec.topSpeedKmh / MAXES.speed) +
      statBar('Power / weight', `${hpT.toFixed(1)} hp/t`, hpT / MAXES.hpt) +
      statBar('Reload', `${spec.gun.reloadS.toFixed(1)} s`, reloadFrac) +
      statBar('Damage', `${bestDmg} hp`, bestDmg / MAXES.dmg) +
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
    for (const [id, card] of cardById) card.classList.toggle('sel', id === specId);
    const card = cardById.get(specId);
    if (card && card.scrollIntoView) {
      card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
    selName.textContent = spec.name;
    selSub.innerHTML = `${flagSVG(spec.nation, spec.era, 22, 14)}<span></span>`;
    selSub.querySelector('span').textContent =
      `${spec.nation} · ${spec.class} · ${spec.era === 'ww2' ? 'WWII' : 'MODERN'}`;
    renderStats(spec);
    refreshCamoSel(); // CAMO PICKER SECTION: highlight this tank's pattern
    refreshEquipSel(); // EQUIPMENT PICKER: highlight this tank's loadout
    return true;
  }

  function step(dir) {
    const idx = specs.findIndex((s) => s.id === selectedId);
    const next = specs[(idx + dir + specs.length) % specs.length];
    emit('ui:click', {});
    api.setSelected(next.id);
  }

  function battle() {
    if (!selectedId) return;
    emit('ui:click', {});
    emit('ui:battleStart', { specId: selectedId, mapId: selectedMapId });
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
  const NATION_TAB = { USA: 'usa', Germany: 'germany', USSR: 'ussr', Russia: 'ussr' };
  root.querySelector('.cot-tech').addEventListener('click', () => {
    emit('ui:click', {});
    const sel = specById.get(selectedId);
    // COMMUNITY TANKS live on their own tech-tree tab
    techtree.show(sel ? (sel.community ? 'community' : NATION_TAB[sel.nation] || 'usa') : 'usa');
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

    /** Synchronously finish queued tank portraits (screenshot determinism). */
    drainThumbs() { drainTankThumbs(); },

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
    },
  };

  if (mapCardById.size) api.setSelectedMap(selectedMapId);

  if (selectedId) applySelection(selectedId);
  return api;
}
