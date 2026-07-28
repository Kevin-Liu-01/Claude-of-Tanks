// src/ui/shotInfo.js — combat-intelligence panels (WoT damage-log/armor-info
// mod class). Everything rendered here traces 1:1 to RESOLVED sim events on
// the bus (shell:hit / shell:fired / tank:destroyed / battle:ended) — no
// number is ever recomputed in the UI:
//   1. SHOT CARD  — after every player shot that connects: result badge,
//      shell, distance, impact angle, nominal vs effective armor, pen roll,
//      damage dealt vs damage roll, module/crew glyphs, and a mini armor
//      diagram (top + side silhouette renders from public/icons/ with the
//      hull-local hit point + shell-path arrow from the event payload).
//   2. SHOT LOG   — collapsible last-6-shots + per-battle received-damage log
//      (toggled by the rebindable 'shotLog' action → bus 'ui:shotLog').
//   3. INCOMING   — mirrored compact toasts for hits the player receives.
//   4. SESSION STATS — end-of-battle report (bus 'battle:ended').
// Mounted by the clearly-marked SHOT-INFO section in src/ui/hud.js.

import { FONT_STACK, FONT_COND, ensureFonts } from './fonts.js';
import { maskIcon, iconUrl } from './icons.js';
import { getSpec, ALL_TANK_IDS } from '../vehicles/specs.js';
import { penAtDistanceMm } from '../sim/ballistics.js';

const ICON_MARGIN = 1.07; // tools/icons-page.html bounding-box framing margin

const COL = {
  pen: '#f0a030',
  non: '#8fa3b4',
  ric: '#bcc8d2',
  splash: '#ffb02e',
  mod: '#f0b04a',
  green: '#7ee87e',
  red: '#f05a5a',
  yellow: '#f0b04a',
  text: '#e6edf3',
  dim: '#8a97a3',
};

const SHELL_TYPE_COLOR = {
  AP: '#ffd27a', APCR: '#e8f4ff', HEAT: '#ff8a5c', HE: '#ffb02e',
  APFSDS: '#ffc46b', HESH: '#ffb02e',
};

const BOUNCE_KINDS = new Set(['ricochet', 'nonpen', 'spaced_absorb', 'era']);
const PEN_KINDS = new Set(['pen', 'he_pen']);

const MODULE_LABEL = {
  trackL: 'Track L', trackR: 'Track R', engine: 'Engine', fuelTank: 'Fuel',
  ammoRack: 'Ammo Rack', gun: 'Gun', radio: 'Radio', optics: 'Optics',
  turretRing: 'Turret Ring',
};
const CREW_LABEL = { commander: 'Commander', gunner: 'Gunner', driver: 'Driver', loader: 'Loader' };

// Crisp 12px module/crew glyphs (currentColor) — same visual language as the
// damage panel's canvas icons, redrawn as inline SVG for DOM cards.
const GLYPH = {
  trackL: '<svg viewBox="0 0 12 12"><rect x="3.2" y="0.8" width="5.6" height="10.4" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="6" cy="3.4" r="1" fill="currentColor"/><circle cx="6" cy="6" r="1" fill="currentColor"/><circle cx="6" cy="8.6" r="1" fill="currentColor"/></svg>',
  engine: '<svg viewBox="0 0 12 12"><rect x="1.4" y="4" width="9.2" height="6" fill="currentColor"/><rect x="2.2" y="1.8" width="1.8" height="2" fill="currentColor"/><rect x="5.1" y="1.8" width="1.8" height="2" fill="currentColor"/><rect x="8" y="1.8" width="1.8" height="2" fill="currentColor"/></svg>',
  fuelTank: '<svg viewBox="0 0 12 12"><rect x="1.8" y="2.6" width="8.4" height="8.4" fill="currentColor"/><rect x="6.6" y="0.8" width="2.6" height="1.8" fill="currentColor"/><path d="M3.4 4.8l5.2 4.4M8.6 4.8L3.4 9.2" stroke="#10161c" stroke-width="1.1"/></svg>',
  ammoRack: '<svg viewBox="0 0 12 12"><path d="M3.4 4.4L4.6 0.8l1.2 3.6z" fill="currentColor"/><rect x="3.4" y="4.4" width="2.4" height="6.4" fill="currentColor"/><path d="M6.9 4.4L8.1 0.8l1.2 3.6z" fill="currentColor"/><rect x="6.9" y="4.4" width="2.4" height="6.4" fill="currentColor"/></svg>',
  gun: '<svg viewBox="0 0 12 12"><rect x="4.6" y="0.8" width="2.8" height="8" fill="currentColor"/><rect x="3.4" y="0.8" width="5.2" height="1.8" fill="currentColor"/><rect x="3" y="9" width="6" height="2.2" fill="currentColor"/></svg>',
  radio: '<svg viewBox="0 0 12 12"><rect x="1.4" y="7" width="9.2" height="4" fill="currentColor"/><path d="M4.4 7V1.4" stroke="currentColor" stroke-width="1.3"/><path d="M5.8 3.4a3 3 0 0 1 3 0M5.4 1.8a5 5 0 0 1 4.2 0" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  optics: '<svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="3.6" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="6" cy="6" r="1.3" fill="currentColor"/><path d="M6 0.6v2M6 9.4v2M0.6 6h2M9.4 6h2" stroke="currentColor" stroke-width="1.1"/></svg>',
  turretRing: '<svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="3.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="3.4 1.6"/></svg>',
  crew: '<svg viewBox="0 0 12 12"><circle cx="6" cy="3.6" r="2.6" fill="currentColor"/><path d="M1.6 11.2a4.4 4.4 0 0 1 8.8 0z" fill="currentColor"/></svg>',
};
GLYPH.trackR = GLYPH.trackL;
// commendation-ribbon glyphs (same 12px currentColor language)
GLYPH.star = '<svg viewBox="0 0 12 12"><path d="M6 .7l1.55 3.25 3.55.42-2.62 2.44.7 3.5L6 8.6l-3.18 1.71.7-3.5L.9 4.37l3.55-.42z" fill="currentColor"/></svg>';
GLYPH.shield = '<svg viewBox="0 0 12 12"><path d="M6 .7l4.7 1.6v3.3c0 2.9-1.9 4.7-4.7 5.7C3.2 10.3 1.3 8.5 1.3 5.6V2.3z" fill="currentColor"/></svg>';
GLYPH.skull = '<svg viewBox="0 0 12 12"><path d="M6 .9a4.2 4.2 0 0 0-4.2 4.2c0 1.6.9 3 2.2 3.7v1.6h4V8.8a4.2 4.2 0 0 0 2.2-3.7A4.2 4.2 0 0 0 6 .9z" fill="currentColor"/><circle cx="4.3" cy="5" r="1.1" fill="#10161c"/><circle cx="7.7" cy="5" r="1.1" fill="#10161c"/><rect x="5.5" y="6.9" width="1" height="1.6" fill="#10161c"/></svg>';

const SI_CSS = `
.cot-si{position:absolute;inset:0;pointer-events:none;font-family:${FONT_STACK};color:${COL.text};}
.cot-si *{box-sizing:border-box;margin:0;padding:0;}
.cot-si-cardhost{position:absolute;right:16px;top:288px;width:286px;display:flex;
  flex-direction:column;gap:6px;align-items:stretch;}
.cot-si-card{background:linear-gradient(180deg,rgba(10,14,18,.88),rgba(6,9,12,.9));
  border:1px solid rgba(146,164,180,.3);border-right:2px solid rgba(146,164,180,.3);
  box-shadow:0 6px 22px rgba(0,0,0,.5);padding:0 0 7px;transition:opacity .8s ease;}
.cot-si-card.out{opacity:0;}
.cot-si-hd{display:flex;align-items:baseline;justify-content:space-between;
  padding:5px 9px 4px;border-bottom:1px solid rgba(146,164,180,.18);}
.cot-si-badge{font-family:${FONT_COND};font-stretch:condensed;font-weight:800;
  font-size:12.5px;letter-spacing:.12em;}
.cot-si-dmg{font-family:${FONT_COND};font-stretch:condensed;font-weight:800;font-size:16px;
  font-variant-numeric:tabular-nums;color:#ffd166;}
.cot-si-sub{padding:4px 9px 0;font-size:10.5px;color:#c6d2dc;letter-spacing:.03em;
  display:flex;justify-content:space-between;gap:6px;font-variant-numeric:tabular-nums;}
.cot-si-sub .ty{font-weight:800;font-size:9.5px;letter-spacing:.08em;
  font-family:${FONT_COND};font-stretch:condensed;}
.cot-si-rows{padding:3px 9px 0;display:grid;grid-template-columns:1fr 1fr;gap:1px 10px;}
.cot-si-kv{display:flex;justify-content:space-between;font-size:10px;color:${COL.dim};
  font-variant-numeric:tabular-nums;letter-spacing:.03em;}
.cot-si-kv b{color:#dbe6ef;font-weight:700;font-family:${FONT_COND};font-stretch:condensed;}
.cot-si-diag{display:flex;gap:8px;align-items:center;padding:6px 9px 0;}
.cot-si-diag .box{position:relative;flex:0 0 auto;}
.cot-si-diag .sil{position:absolute;inset:0;}
/* shaded per-tank plan-form render (icons pipeline <id>_top/_side.png)
   layered over the silhouette base: grayscale + brighten turns the camo
   render into a light schematic that carries the turret/barrel/fender read
   the flat mask lacked (r7: top view parsed as a generic rounded box) */
.cot-si-diag .pf{position:absolute;inset:0;background-size:contain;
  background-position:center;background-repeat:no-repeat;
  filter:grayscale(.85) brightness(1.8) contrast(1.05);}
.cot-si-diag svg.ov{position:absolute;inset:0;overflow:visible;}
.cot-si-zone{font-size:10px;color:#f0c987;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;font-family:${FONT_COND};font-stretch:condensed;flex:1;
  text-align:right;line-height:1.35;}
.cot-si-zone .tn{display:block;color:${COL.dim};font-weight:600;text-transform:none;
  letter-spacing:.02em;font-size:9.5px;}
.cot-si-mods{display:flex;flex-wrap:wrap;gap:4px;padding:6px 9px 0;}
.cot-si-mod{display:flex;align-items:center;gap:3px;font-size:8.5px;font-weight:800;
  letter-spacing:.06em;font-family:${FONT_COND};font-stretch:condensed;text-transform:uppercase;
  border:1px solid currentColor;padding:1.5px 4px 1.5px 3px;line-height:1;}
.cot-si-mod svg{width:11px;height:11px;display:block;}
.cot-si-log{position:absolute;right:16px;top:288px;width:286px;display:none;
  pointer-events:auto;background:linear-gradient(180deg,rgba(10,14,18,.92),rgba(6,9,12,.94));
  border:1px solid rgba(146,164,180,.3);box-shadow:0 6px 22px rgba(0,0,0,.55);
  max-height:calc(100vh - 560px);min-height:120px;overflow-y:auto;}
.cot-si-log.open{display:block;}
.cot-si-log .sec{font-size:9.5px;font-weight:800;letter-spacing:.18em;color:${COL.dim};
  font-family:${FONT_COND};font-stretch:condensed;text-transform:uppercase;
  padding:6px 9px 3px;display:flex;justify-content:space-between;
  border-bottom:1px solid rgba(146,164,180,.16);}
.cot-si-lrow{display:flex;align-items:baseline;gap:6px;padding:3px 9px;font-size:10px;
  color:#c6d2dc;font-variant-numeric:tabular-nums;border-bottom:1px solid rgba(146,164,180,.08);}
.cot-si-lrow .b{font-family:${FONT_COND};font-stretch:condensed;font-weight:800;
  font-size:9px;letter-spacing:.08em;width:58px;flex:0 0 auto;}
.cot-si-lrow .d{font-weight:800;color:#ffd166;width:36px;flex:0 0 auto;text-align:right;
  font-family:${FONT_COND};font-stretch:condensed;}
.cot-si-lrow .n{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cot-si-lrow .z{color:${COL.dim};font-size:9px;flex:0 0 auto;}
.cot-si-empty{padding:6px 9px;font-size:9.5px;color:${COL.dim};letter-spacing:.04em;}
.cot-si-toasthost{position:absolute;left:16px;bottom:452px;display:flex;
  flex-direction:column;gap:4px;width:250px;}
.cot-si-toast{background:linear-gradient(90deg,rgba(20,8,8,.9),rgba(10,7,7,.55));
  border-left:2px solid ${COL.red};padding:4px 9px 5px;transition:opacity .7s ease;
  text-shadow:0 1px 2px rgba(0,0,0,.85);}
.cot-si-toast.out{opacity:0;}
.cot-si-toast .l1{display:flex;justify-content:space-between;align-items:baseline;gap:6px;
  font-size:11px;font-weight:700;color:#f2c6bf;}
.cot-si-toast .l1 b{color:#ff8f80;font-family:${FONT_COND};font-stretch:condensed;
  font-variant-numeric:tabular-nums;font-size:13px;}
.cot-si-toast .l2{font-size:9.5px;color:#c9a9a2;letter-spacing:.04em;display:flex;
  justify-content:space-between;gap:6px;font-variant-numeric:tabular-nums;}
.cot-si-toast .l2 .m{font-weight:800;text-transform:uppercase;
  font-family:${FONT_COND};font-stretch:condensed;letter-spacing:.07em;text-align:right;}
.cot-si-stats{position:fixed;inset:0;z-index:71;display:none;pointer-events:none;
  flex-direction:column;align-items:center;justify-content:center;
  padding:2vh 0 4vh;overflow:hidden;
  font-family:${FONT_STACK};color:${COL.text};
  background:linear-gradient(180deg,rgba(5,8,12,.9),rgba(4,7,10,.8) 42%,rgba(3,5,8,.92));}
.cot-si-stats.show{display:flex;}
.cot-si-stats *{box-sizing:border-box;margin:0;padding:0;}
/* While the battle report is up, the integration end-overlay underneath
   (main.js .cot-end, z-index 70) must not stack a second verdict banner
   mid-screen — the report renders its own. Its RETURN TO GARAGE button is
   kept and pinned as the report footer, directly under the last panel
   (--cot-si-endpad is measured in pinFooter(); the r6 report left the button
   floating in an empty black bottom half). The earnings line is hidden too:
   the econ strip above renders the same payout with its formula caption. */
body.cot-si-report .cot-end>div:first-child{display:none;}
body.cot-si-report .cot-end>div:nth-child(2){display:none;}
body.cot-si-report .cot-end{align-items:center !important;
  justify-content:flex-end !important;
  padding-bottom:var(--cot-si-endpad,3.2vh) !important;
  z-index:72 !important;background:transparent !important;}
/* Clean cinematic results screen: no battle-HUD chrome may bleed through the
   report backdrop (r6: kill-feed rows and dimmed team panels overlapped the
   VICTORY banner). Hidden only while body.cot-si-report is set — hideStats()
   and reset() restore everything for the next battle. */
body.cot-si-report .cot-killfeed,body.cot-si-report .cot-ear,
body.cot-si-report .cot-top,body.cot-si-report .cot-dlog,
body.cot-si-report .cot-alert,body.cot-si-report .cot-bounce,
body.cot-si-report .cot-sixth,body.cot-si-report .cot-tgt,
body.cot-si-report .cot-net,body.cot-si-report .cot-camoind,
body.cot-si-report .cot-shells,body.cot-si-report .cot-minimap,
body.cot-si-report .cot-hpbars,body.cot-si-report .cot-dmglayer,
body.cot-si-report .cot-dp,body.cot-si-report .cot-si-log,
body.cot-si-report .cot-ret{display:none !important;}
.cot-si-ban{font-family:${FONT_COND};font-stretch:condensed;font-weight:800;font-size:56px;
  letter-spacing:.34em;text-indent:.34em;line-height:1;text-shadow:0 2px 22px rgba(0,0,0,.85);}
.cot-si-ban.v{color:#7ee87e;}.cot-si-ban.d{color:#f05a5a;}.cot-si-ban.n{color:#cfd9e2;}
.cot-si-bansub{font-size:10px;letter-spacing:.32em;color:${COL.dim};margin:7px 0 2.6vh;
  text-transform:uppercase;font-family:${FONT_COND};font-stretch:condensed;font-weight:800;}
.cot-si-cols{display:flex;gap:16px;width:1120px;max-width:94vw;align-items:stretch;
  min-height:220px;}
.cot-si-panel{background:linear-gradient(180deg,rgba(10,14,18,.92),rgba(6,9,12,.95));
  border:1px solid rgba(146,164,180,.3);box-shadow:0 10px 40px rgba(0,0,0,.5);
  padding:14px 20px 16px;min-height:0;overflow:hidden;}
.cot-si-panel .ph{font-size:9.5px;font-weight:800;letter-spacing:.22em;color:${COL.dim};
  text-transform:uppercase;font-family:${FONT_COND};font-stretch:condensed;
  padding-bottom:6px;border-bottom:1px solid rgba(146,164,180,.2);margin-bottom:7px;
  display:flex;justify-content:space-between;}
.cot-si-pl{flex:1.15;}
.cot-si-pr{flex:1;}
.cot-si-you{display:flex;align-items:center;gap:8px;font-size:11px;padding:3px 0 6px;
  font-variant-numeric:tabular-nums;border-bottom:1px solid rgba(146,164,180,.14);
  margin-bottom:5px;}
.cot-si-you .si{width:62px;height:24px;flex:0 0 auto;}
.cot-si-you .n{flex:1;color:#f2f7fb;font-weight:800;font-family:${FONT_COND};
  font-stretch:condensed;letter-spacing:.1em;}
.cot-si-meta{margin-top:12px;font-size:9.5px;letter-spacing:.2em;color:${COL.dim};
  text-transform:uppercase;font-family:${FONT_COND};font-stretch:condensed;
  font-weight:700;text-align:center;}
.cot-si-you .s{color:${COL.dim};font-size:10px;}
.cot-si-you .dm{color:#ffd166;font-weight:800;font-family:${FONT_COND};
  font-stretch:condensed;width:60px;text-align:right;}
.cot-si-ribbons{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px;}
.cot-si-rib{border:1px solid rgba(214,178,94,.75);color:#e8c86a;font-family:${FONT_COND};
  font-stretch:condensed;font-weight:800;font-size:9px;letter-spacing:.14em;
  padding:3px 8px;text-transform:uppercase;background:rgba(120,90,20,.16);
  display:inline-flex;align-items:center;gap:5px;}
.cot-si-rib svg{width:12px;height:12px;display:block;flex:0 0 auto;}
.cot-si-tlwrap{width:1120px;max-width:94vw;margin-top:14px;}
.cot-si-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px 16px;margin-bottom:12px;}
.cot-si-stat{text-align:center;}
.cot-si-stat .v{font-size:28px;font-weight:800;font-family:${FONT_COND};
  font-stretch:condensed;font-variant-numeric:tabular-nums;color:#f2f7fb;line-height:1.1;}
.cot-si-econ{display:flex;gap:16px;width:1120px;max-width:94vw;margin-bottom:14px;}
.cot-si-ecoitem{flex:1;display:flex;align-items:baseline;justify-content:center;gap:10px;
  background:linear-gradient(180deg,rgba(10,14,18,.92),rgba(6,9,12,.95));
  border:1px solid rgba(146,164,180,.3);box-shadow:0 10px 40px rgba(0,0,0,.5);
  padding:12px 16px 13px;}
.cot-si-ecoitem .ek{font-size:9.5px;font-weight:800;letter-spacing:.22em;color:${COL.dim};
  text-transform:uppercase;font-family:${FONT_COND};font-stretch:condensed;}
.cot-si-ecoitem .ev{font-size:30px;font-weight:800;font-family:${FONT_COND};
  font-stretch:condensed;font-variant-numeric:tabular-nums;line-height:1;}
.cot-si-ecoitem.cr .ev{color:#ffd166;}
.cot-si-ecoitem.xp .ev{color:#9fd0ff;}
.cot-si-ecoitem .eb{font-size:9px;color:${COL.dim};letter-spacing:.05em;
  font-variant-numeric:tabular-nums;}
.cot-si-stat .k{font-size:8.5px;font-weight:700;letter-spacing:.16em;color:${COL.dim};
  text-transform:uppercase;font-family:${FONT_COND};font-stretch:condensed;}
.cot-si-shell{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-bottom:8px;
  font-size:9.5px;color:${COL.dim};font-variant-numeric:tabular-nums;letter-spacing:.05em;}
.cot-si-shell b{color:#dbe6ef;font-family:${FONT_COND};font-stretch:condensed;font-weight:800;}
.cot-si-shell .ty{font-weight:800;font-family:${FONT_COND};font-stretch:condensed;
  letter-spacing:.08em;font-size:9px;}
.cot-si-tl{margin-bottom:9px;}
.cot-si-tl svg{display:block;width:100%;height:58px;}
.cot-si-tl .cap{font-size:8px;letter-spacing:.14em;color:${COL.dim};text-transform:uppercase;
  font-family:${FONT_COND};font-stretch:condensed;font-weight:700;text-align:center;margin-top:2px;}
.cot-si-kills{padding-top:2px;margin-bottom:6px;}
.cot-si-kill{display:flex;align-items:center;gap:8px;font-size:11.5px;padding:3px 0;
  font-variant-numeric:tabular-nums;border-bottom:1px solid rgba(146,164,180,.08);}
.cot-si-kill .si{width:34px;height:14px;flex:0 0 auto;}
.cot-si-kill .n{flex:1;color:#dbe6ef;font-weight:600;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;}
.cot-si-kill .n .you{color:#ffd166;font-family:${FONT_COND};font-stretch:condensed;
  font-weight:800;font-size:9px;letter-spacing:.12em;border:1px solid rgba(255,209,102,.6);
  padding:0 4px 1px;margin-right:4px;vertical-align:1px;}
.cot-si-kill .kd{color:${COL.red};font-weight:800;font-size:9px;letter-spacing:.12em;
  font-family:${FONT_COND};font-stretch:condensed;width:38px;text-align:right;flex:0 0 auto;}
.cot-si-kill .al{color:${COL.green};font-weight:800;font-size:9px;letter-spacing:.12em;
  font-family:${FONT_COND};font-stretch:condensed;width:38px;text-align:right;flex:0 0 auto;
  opacity:.75;}
.cot-si-kill .s{color:${COL.dim};font-size:10px;}
.cot-si-kill .k{color:#dbe6ef;font-weight:800;font-family:${FONT_COND};
  font-stretch:condensed;width:30px;text-align:right;font-size:10px;flex:0 0 auto;}
.cot-si-kill .dm{color:#ffd166;font-weight:800;font-family:${FONT_COND};
  font-stretch:condensed;width:48px;text-align:right;flex:0 0 auto;}
`;

function ensureStyle(id, css) {
  if (!document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id;
    s.textContent = css;
    document.head.appendChild(s);
  }
}

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

/** 'turret_cheek_R' -> 'turret cheek R'; 'turretRing' -> 'turret ring'. */
function zoneLabel(zone) {
  if (!zone) return '—';
  return zone
    .replace(/_(R|L)$/, ' $1')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/ (r|l)$/, (m) => m.toUpperCase());
}

/**
 * Shell display name with a duplicated type token stripped: specs name rounds
 * like 'M829A4 APFSDS' and the card already renders the type badge — never
 * show 'APFSDS M829A4 APFSDS' (same helper as killcam.js).
 * @param {{shellType?:string, shellName?:string}} ev HitEvent
 * @returns {string} cleaned name ('' when it collapses to the bare type)
 */
function shellDisplayName(ev) {
  const type = (ev.shellType || '').trim();
  let name = (ev.shellName || '').trim();
  if (type) {
    const esc = type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    name = name.replace(new RegExp(`^${esc}\\s+|\\s+${esc}$`, 'i'), '');
    if (name.toUpperCase() === type.toUpperCase()) name = '';
  }
  return name;
}

/**
 * Nominal (un-rolled) penetration of the event's shell at the event's flight
 * distance — the exact baseline the sim's ±25% pen roll came from
 * (ensurePenRoll: rollUniform(rng, penAtDistanceMm(spec, distM))). Lets the
 * card print 'roll / nominal' instead of a context-free roll that reads as a
 * bug beside a thin plate (same helper as killcam.js).
 * @param {{attackerSpecId?:string, shellName?:string, shellType?:string,
 *   flightDistM?:number}} ev HitEvent
 * @returns {number} nominal pen in mm (0 when unresolvable)
 */
function nominalPenFor(ev) {
  try {
    const spec = ev.attackerSpecId ? getSpec(ev.attackerSpecId) : null;
    const shells = spec && spec.gun ? spec.gun.shells : null;
    let sh = shells
      ? (shells.find((s) => s.name === ev.shellName && s.type === ev.shellType)
        || shells.find((s) => s.type === ev.shellType))
      : null;
    if (!sh && ev.shellName) {
      // Payload carries no attackerSpecId (staged/legacy events): resolve the
      // shell by exact identity across the whole roster. Only an UNAMBIGUOUS
      // match is trusted — if two guns ship a same-named shell with different
      // pen curves the baseline is omitted rather than guessed (the card must
      // never lie). Same fallback as killcam.js.
      let pen = -1;
      for (const id of ALL_TANK_IDS) {
        const g = getSpec(id).gun;
        if (!g || !g.shells) continue;
        for (const c of g.shells) {
          if (c.name !== ev.shellName || c.type !== ev.shellType) continue;
          const p = Math.round(penAtDistanceMm(c, ev.flightDistM || 0));
          if (pen === -1) { pen = p; sh = c; } else if (p !== pen) return 0;
        }
      }
    }
    return sh ? Math.round(penAtDistanceMm(sh, ev.flightDistM || 0)) : 0;
  } catch (_) { return 0; }
}

/** Classify a HitEvent into the WoT-mod result badge. */
function classify(ev) {
  if (PEN_KINDS.has(ev.kind)) return { badge: 'PENETRATION', col: COL.pen };
  if (ev.kind === 'ricochet') return { badge: 'RICOCHET', col: COL.ric };
  if (ev.kind === 'he_splash') {
    return (ev.damage || 0) > 0
      ? { badge: 'SPLASH', col: COL.splash }
      : { badge: 'NO DAMAGE', col: COL.non };
  }
  const crits = (ev.modulesHit && ev.modulesHit.length) || (ev.crewHit && ev.crewHit.length);
  if ((ev.damage || 0) <= 0 && crits) return { badge: 'MODULE ONLY', col: COL.mod };
  // WoT distinguishes "hit without damage" (screen/track eater, shell flew
  // on) from a true armor non-pen — showing NON-PEN with em-dash armor rows
  // read as a bug (r2 critique).
  if (ev.kind === 'screen_pierce') return { badge: 'SCREEN — NO DAMAGE', col: COL.non };
  if (ev.kind === 'era') return { badge: 'NON-PEN · ERA', col: COL.non };
  if (ev.kind === 'spaced_absorb') return { badge: 'NON-PEN · SPACED', col: COL.non };
  return { badge: 'NON-PEN', col: COL.non };
}

const fmtTime = (s) => {
  const t = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * Create the combat-intelligence UI bundle. All data arrives via bus events;
 * hud.js mounts `root` and forwards player identity / lifecycle.
 * @param {{on:Function,emit:Function}} bus event bus (§1.5)
 * @returns {{root:HTMLElement,statsRoot:HTMLElement,setPlayer:Function,reset:Function,hideStats:Function,toggleLog:Function}}
 */
export function createShotInfo(bus) {
  ensureFonts();
  ensureStyle('cot-si-style', SI_CSS);

  const root = el('div', 'cot-si');
  const cardHost = el('div', 'cot-si-cardhost', root);
  const logPanel = el('div', 'cot-si-log', root);
  const toastHost = el('div', 'cot-si-toasthost', root);
  const statsRoot = el('div', 'cot-si-stats');
  document.body.appendChild(statsRoot);

  let playerId = null;
  let logOpen = false;
  const shotLog = [];      // last 6 outgoing summaries {ev, cls}
  const receivedLog = [];  // per-battle incoming entries (full battle)
  const stats = newStats();

  // --- team-wide roster bookkeeping (battle report) -------------------------
  // Every combatant seen in ANY bus event (shell:hit fires for AI-vs-AI hits
  // too, enriched with names/specIds by state.js) — dmg/kills/dead are pure
  // event sums, never re-simulated. Team split: every shell:hit /
  // tank:destroyed edge asserts attacker and target are on OPPOSING teams
  // (symmetric-teams charter: no friendly targeting), so a parity union-find
  // anchored at the player resolves ally/enemy for the whole battle graph.
  // A `battle:ended` payload roster (additive state.js enrichment, see
  // docs/handoff) overrides with authoritative teams when present.
  const combatants = new Map(); // id -> {name,specId,dmg,kills,dead}
  let endRoster = null;         // battle:ended payload roster (if provided)
  const tg = new Map();         // parity union-find: id -> {p:parent, r:0|1}

  function combatant(id, name, specId) {
    let c = combatants.get(id);
    if (!c) {
      c = { name: null, specId: null, dmg: 0, kills: 0, dead: false };
      combatants.set(id, c);
    }
    if (name && !c.name) c.name = name;
    if (specId && !c.specId) {
      c.specId = specId;
      if (!c.name) { try { c.name = getSpec(specId).name; } catch (_) { /* raw id */ } }
    }
    return c;
  }

  function tgFind(x) {
    let e = tg.get(x);
    if (!e) { e = { p: x, r: 0 }; tg.set(x, e); }
    if (e.p === x) return { root: x, r: 0 };
    const f = tgFind(e.p);
    e.p = f.root;
    e.r = (e.r + f.r) & 1;
    return { root: e.p, r: e.r };
  }

  /** Record that a and b fought — therefore sit on opposing teams. */
  function linkOpposed(a, b) {
    if (a == null || b == null || a === b) return;
    const fa = tgFind(a);
    const fb = tgFind(b);
    if (fa.root === fb.root) return;
    const ra = tg.get(fa.root);
    ra.p = fb.root;
    ra.r = (fa.r + fb.r + 1) & 1;
  }

  /** 'ally' | 'enemy' | null (combatant not connected to the player yet). */
  function sideOf(id) {
    if (playerId == null) return null;
    if (id === playerId) return 'ally';
    if (!tg.has(id)) return null;
    const fp = tgFind(playerId);
    const fi = tgFind(id);
    if (fi.root !== fp.root) return null;
    return fi.r === fp.r ? 'ally' : 'enemy';
  }

  function newStats() {
    return {
      fired: 0, hits: 0, pens: 0, dealt: 0, received: 0, blocked: 0,
      modulesDestroyed: 0, perTarget: new Map(),
      perShell: new Map(),   // shellType -> {fired,hits,pens,dmg}
      timeline: [],          // dealt-damage events [{t, d}] (battle report strip)
    };
  }

  function perShell(type) {
    let s = stats.perShell.get(type);
    if (!s) {
      s = { fired: 0, hits: 0, pens: 0, dmg: 0 };
      stats.perShell.set(type, s);
    }
    return s;
  }

  // ---------- armor mini-diagram ----------
  // Icon framing (tools/icons-page.html): bbox-normalized ortho renders with
  // MARGIN 1.07. Hull-local extent approximated from spec.dims exactly like
  // damagePanel.js: z in [-hullL/2, overallL - hullL/2] -> center (overall-hull)/2.
  function diagramFor(ev, cls) {
    const specId = ev.targetSpecId || ev.targetId;
    let dims = null;
    let arm = null;
    try {
      const spec = specId ? getSpec(specId) : null;
      dims = spec ? spec.dims : null;
      arm = spec ? spec.armor : null;
    } catch (_) { dims = null; }
    const wrap = el('div', 'cot-si-diag');
    if (!dims || !ev.localPos) {
      wrap.remove();
      return null;
    }
    const czOff = (dims.overallLengthM - dims.hullLengthM) / 2;
    const lp = ev.localPos;
    const ld = ev.localDir;
    const badgeCol = (cls && cls.col) || '#ff8a5c';
    // silhouette contrast (r4: the 0.34-alpha mask read as a gray pill):
    // brighter fill + a drop-shadow outline pass that traces the mask edge
    const SIL_FILL = 'rgba(206,222,236,0.55)';
    const SIL_OUTLINE =
      'drop-shadow(0 0 1px rgba(232,242,250,0.9)) drop-shadow(0 0 1px rgba(150,175,195,0.5))';
    /** Badge-colored glow clipped to the silhouette mask at the hit point. */
    const zoneTint = (parent, view, x, y, r) => {
      const tint = el('div', 'sil', parent);
      maskIcon(tint, specId, view, 'transparent');
      tint.style.background =
        `radial-gradient(circle ${r}px at ${x.toFixed(1)}px ${y.toFixed(1)}px,` +
        `${badgeCol}d9 0%,${badgeCol}66 55%,${badgeCol}00 100%)`;
    };

    // --- top view (84x84; icon: forward = up, screen right = -X world) ---
    const TS = 84;
    const top = el('div', 'box', wrap);
    top.style.width = `${TS}px`; top.style.height = `${TS}px`;
    const topSil = el('div', 'sil', top);
    maskIcon(topSil, specId, 'top_silhouette', SIL_FILL);
    topSil.style.filter = SIL_OUTLINE;
    // per-tank plan-form over the mask (r7: the flat silhouette read as a
    // generic rounded box) — the icons pipeline's shaded top render carries
    // the real turret/barrel/fender detail; CSS declutters it to schematic
    el('div', 'pf', top).style.backgroundImage = `url(${iconUrl(specId, 'top')})`;
    const halfT = (Math.max(dims.widthM, dims.overallLengthM) / 2) * ICON_MARGIN;
    const sT = (TS / 2) / halfT;
    const topPx = (x, z) => [TS / 2 - x * sT, TS / 2 - (z - czOff) * sT];
    const [hx, hy] = topPx(lp[0], lp[2]);
    zoneTint(top, 'top_silhouette', hx, hy, 18);
    let arrow = '';
    if (ld) {
      // Clamp the arrow tail inside the viewBox: the raw 2.2 m back-step
      // overshot the 72px box (svg.ov has overflow:visible) and clipped into
      // the card rows above. Shrink along the arrow direction, never bend it.
      let [ax, ay] = topPx(lp[0] - ld[0] * 2.2, lp[2] - ld[2] * 2.2);
      const PAD = 2;
      const dx = ax - hx;
      const dy = ay - hy;
      let k = 1;
      if (dx > 0) k = Math.min(k, (TS - PAD - hx) / dx);
      else if (dx < 0) k = Math.min(k, (PAD - hx) / dx);
      if (dy > 0) k = Math.min(k, (TS - PAD - hy) / dy);
      else if (dy < 0) k = Math.min(k, (PAD - hy) / dy);
      k = Math.max(0, k);
      ax = hx + dx * k;
      ay = hy + dy * k;
      arrow = `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}"
        stroke="#ff8a5c" stroke-width="2.2" marker-end="url(#cotsiarw)"/>`;
    }
    // facing cues over the (turretless-reading) baked mask: turret ring +
    // gun-barrel line so the top view communicates orientation at a glance
    let facing = '';
    if (arm && arm.turretPivot) {
      const [tcx, tcy] = topPx(arm.turretPivot[0], arm.turretPivot[2]);
      const ringR = Math.min(dims.widthM * 0.3, 1.05) * sT;
      const barrelLen = (arm.gunBarrel && arm.gunBarrel.lengthM)
        ? arm.gunBarrel.lengthM : dims.overallLengthM * 0.45;
      const [gx, gy] = topPx(arm.turretPivot[0], arm.turretPivot[2] + barrelLen);
      facing =
        `<circle cx="${tcx.toFixed(1)}" cy="${tcy.toFixed(1)}" r="${ringR.toFixed(1)}"
          fill="none" stroke="rgba(228,240,250,0.55)" stroke-width="1.2"/>` +
        `<line x1="${tcx.toFixed(1)}" y1="${tcy.toFixed(1)}" x2="${gx.toFixed(1)}" y2="${gy.toFixed(1)}"
          stroke="rgba(228,240,250,0.55)" stroke-width="1.8" stroke-linecap="round"/>`;
    }
    const ovT = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ovT.setAttribute('class', 'ov');
    ovT.setAttribute('viewBox', `0 0 ${TS} ${TS}`);
    ovT.innerHTML =
      `<defs><marker id="cotsiarw" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="5"
        markerHeight="5" orient="auto"><path d="M0 0L8 4L0 8z" fill="#ff8a5c"/></marker></defs>` +
      facing +
      arrow +
      `<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="5" fill="none" stroke="#fff" stroke-width="1.3"/>` +
      `<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="2.6" fill="#ff8a5c"/>`;
    top.appendChild(ovT);

    // --- side view (aspect 2:1; icon: front = right, up = +Y) ---
    const SW = 116, SH = 58;
    const side = el('div', 'box', wrap);
    side.style.width = `${SW}px`; side.style.height = `${SH}px`;
    const sideSil = el('div', 'sil', side);
    maskIcon(sideSil, specId, 'side_silhouette', SIL_FILL);
    sideSil.style.filter = SIL_OUTLINE;
    el('div', 'pf', side).style.backgroundImage = `url(${iconUrl(specId, 'side')})`;
    const halfS = Math.max(dims.heightM / 2, dims.overallLengthM / 4) * ICON_MARGIN;
    const sS = (SH / 2) / halfS;
    const sx = SW / 2 + (lp[2] - czOff) * sS;
    const sy = SH / 2 - (lp[1] - dims.heightM / 2) * sS;
    zoneTint(side, 'side_silhouette', sx, sy, 16);
    const ovS = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ovS.setAttribute('class', 'ov');
    ovS.setAttribute('viewBox', `0 0 ${SW} ${SH}`);
    ovS.innerHTML =
      `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="4.6" fill="none" stroke="#fff" stroke-width="1.3"/>` +
      `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="2.4" fill="#ff8a5c"/>`;
    side.appendChild(ovS);
    return wrap;
  }

  function modChips(ev, parent) {
    const items = [];
    for (const m of ev.modulesHit || []) {
      // chip color tracks the sim's post-hit state: red destroyed, yellow
      // damaged, dim for a hit that left the module 'ok' (never imply worse)
      const col = m.newState === 'red' ? COL.red : m.newState === 'yellow' ? COL.yellow : COL.dim;
      items.push({ glyph: GLYPH[m.module] || GLYPH.gun, label: MODULE_LABEL[m.module] || m.module, col });
    }
    for (const c of ev.crewHit || []) {
      items.push({ glyph: GLYPH.crew, label: CREW_LABEL[c] || c, col: COL.red });
    }
    if (ev.fireStarted) items.push({ glyph: GLYPH.fuelTank, label: 'Fire', col: '#ff6a3c' });
    if (!items.length) return;
    const row = el('div', 'cot-si-mods', parent);
    for (const it of items) {
      const chip = el('span', 'cot-si-mod', row);
      chip.style.color = it.col;
      chip.innerHTML = `${it.glyph}<span>${it.label}</span>`;
    }
  }

  // ---------- 1. outgoing shot card ----------
  function buildCard(ev, cls) {
    const card = el('div', 'cot-si-card');
    // machine-checkable trace back to the sim event (verification harness)
    card.dataset.kind = ev.kind;
    card.dataset.damage = String(Math.round(ev.damage || 0));
    card.dataset.dmgroll = String(Math.round(ev.dmgRoll || 0));
    card.dataset.eff = String(Math.round(ev.effectiveMm || 0));
    card.dataset.pen = String(Math.round(ev.penRollMm || 0));
    card.dataset.nominal = String(Math.round(ev.nominalMm || 0));
    card.dataset.dist = String(Math.round(ev.flightDistM || 0));
    card.dataset.angle = String(Math.round(ev.impactAngleDeg || 0));
    card.dataset.zone = ev.zone || '';
    card.style.borderRightColor = cls.col;

    const hd = el('div', 'cot-si-hd', card);
    const badge = el('span', 'cot-si-badge', hd);
    badge.textContent = cls.badge;
    badge.style.color = cls.col;
    const dmg = el('span', 'cot-si-dmg', hd);
    dmg.textContent = (ev.damage || 0) > 0 ? `−${Math.round(ev.damage)}` : '0';
    if (!(ev.damage > 0)) dmg.style.color = COL.dim;

    const sub = el('div', 'cot-si-sub', card);
    const tyCol = SHELL_TYPE_COLOR[ev.shellType] || '#9fb0bf';
    sub.innerHTML =
      `<span><span class="ty" style="color:${tyCol}">${ev.shellType}</span> ${shellDisplayName(ev)}</span>` +
      `<span>${ev.targetName || ''}</span>`;

    const rows = el('div', 'cot-si-rows', card);
    const kv = (k, v) => {
      const r = el('div', 'cot-si-kv', rows);
      r.innerHTML = `<span>${k}</span><b>${v}</b>`;
    };
    const hasArmor = (ev.nominalMm || 0) > 0 || (ev.effectiveMm || 0) > 0;
    kv('Distance', `${Math.round(ev.flightDistM || 0)} m`);
    kv('Angle', `${Math.round(ev.impactAngleDeg || 0)}°`);
    // screen_pierce has no main-armor interaction: show the pierced screen's
    // physical thickness instead of misleading em-dashes / 0→0
    if (ev.kind === 'screen_pierce') {
      kv('Armor', (ev.physicalMm || 0) > 0 ? `${Math.round(ev.physicalMm)} mm screen` : 'screen');
      kv('Pen roll', 'passed through');
    } else {
      kv('Armor', hasArmor
        ? `${Math.round(ev.nominalMm || 0)}→${Math.round(ev.effectiveMm || 0)} mm`
        : '—');
      // roll / nominal baseline: a bare '986 mm' beside a 63 mm plate looks
      // like a bug to anyone who knows the shell's paper pen (r4 critique).
      // Roll colored green/red vs the nominal it was rolled from.
      const penNom = nominalPenFor(ev);
      const roll = Math.round(ev.penRollMm || 0);
      card.dataset.pennom = String(penNom);
      if (roll > 0 && penNom > 0) {
        kv('Pen roll', `<span style="color:${roll >= penNom ? COL.green : COL.red}">${roll}</span>` +
          ` / ${penNom} mm`);
      } else {
        kv('Pen roll', roll > 0 ? `${roll} mm` : '—');
      }
    }
    kv('Damage', `${Math.round(ev.damage || 0)} / ${Math.round(ev.dmgRoll || 0)}`);
    kv('Result', ev.destroyed ? 'DESTROYED' : `${Math.max(0, Math.round(ev.targetHpAfter || 0))} hp left`);

    const diag = diagramFor(ev, cls);
    if (diag) {
      const zone = el('div', 'cot-si-zone', diag);
      zone.innerHTML = `${zoneLabel(ev.zone)}<span class="tn">${ev.targetName || ''}</span>`;
      card.appendChild(diag);
    }
    modChips(ev, card);
    return card;
  }

  function showCard(ev, cls) {
    if (logOpen) return; // the log view replaces floating cards
    while (cardHost.firstChild) cardHost.firstChild.remove();
    const card = buildCard(ev, cls);
    cardHost.appendChild(card);
    const fade = setTimeout(() => card.classList.add('out'), 6200);
    setTimeout(() => { clearTimeout(fade); if (card.parentNode) card.remove(); }, 7200);
  }

  // ---------- 2. collapsible log ----------
  function renderLog() {
    logPanel.textContent = '';
    const sec1 = el('div', 'sec', logPanel);
    sec1.innerHTML = `<span>Your shots</span><span>last ${shotLog.length}</span>`;
    if (!shotLog.length) el('div', 'cot-si-empty', logPanel).textContent = 'No shots connected yet.';
    for (const it of shotLog) {
      const r = el('div', 'cot-si-lrow', logPanel);
      r.innerHTML =
        `<span class="b" style="color:${it.cls.col}">${it.cls.badge.split(' ')[0].split('·')[0]}</span>` +
        `<span class="d">${(it.ev.damage || 0) > 0 ? `−${Math.round(it.ev.damage)}` : '·'}</span>` +
        `<span class="n">${it.ev.targetName || it.ev.targetId || ''}</span>` +
        `<span class="z">${zoneLabel(it.ev.zone)} · ${Math.round(it.ev.flightDistM || 0)}m</span>`;
    }
    const total = receivedLog.reduce((a, e) => a + e.dmg, 0);
    const sec2 = el('div', 'sec', logPanel);
    sec2.innerHTML = `<span>Damage received</span><span>−${Math.round(total)}</span>`;
    if (!receivedLog.length) el('div', 'cot-si-empty', logPanel).textContent = 'Nothing received.';
    for (let i = receivedLog.length - 1; i >= 0; i--) {
      const e = receivedLog[i];
      const r = el('div', 'cot-si-lrow', logPanel);
      r.innerHTML =
        `<span class="b" style="color:${e.dmg > 0 ? COL.red : COL.green}">${e.dmg > 0 ? fmtTime(e.t) : 'BLOCKED'}</span>` +
        `<span class="d">${e.dmg > 0 ? `−${Math.round(e.dmg)}` : '·'}</span>` +
        `<span class="n">${e.attacker}</span>` +
        `<span class="z">${e.shellType}${e.mods ? ' · ' + e.mods : ''}</span>`;
    }
  }

  function toggleLog() {
    logOpen = !logOpen;
    logPanel.classList.toggle('open', logOpen);
    if (logOpen) {
      while (cardHost.firstChild) cardHost.firstChild.remove();
      renderLog();
    }
  }

  // ---------- 3. incoming toasts ----------
  function showToast(ev, cls) {
    const t = el('div', 'cot-si-toast', toastHost);
    t.dataset.damage = String(Math.round(ev.damage || 0));
    t.dataset.kind = ev.kind;
    // Same state-colored policy as the shot card's modChips — never imply
    // worse: dim for a hit that left the module 'ok', yellow damaged, red
    // destroyed (an 'ok' Track R styled as a red casualty lied, r3 critique).
    const stateCol = (s) => (s === 'red' ? COL.red : s === 'yellow' ? COL.yellow : COL.dim);
    const modsLost = (ev.modulesHit || [])
      .map((m) => `<span style="color:${stateCol(m.newState)}">` +
        `${MODULE_LABEL[m.module] || m.module}${m.newState === 'red' ? ' ✕' : ''}</span>`)
      .concat((ev.crewHit || []).map((c) => `<span style="color:${COL.red}">${CREW_LABEL[c] || c} ✕</span>`))
      .join(', ');
    t.innerHTML =
      `<div class="l1"><span>${ev.attackerName || 'Enemy'}</span>` +
      `<b>${(ev.damage || 0) > 0 ? `−${Math.round(ev.damage)}` : cls.badge}</b></div>` +
      `<div class="l2"><span>${ev.shellType || ''} ${shellDisplayName(ev)} · ${zoneLabel(ev.zone)}</span>` +
      `${modsLost ? `<span class="m">${modsLost}</span>` : ''}</div>`;
    if (!(ev.damage > 0)) {
      t.style.borderLeftColor = COL.green;
      t.querySelector('.l1 b').style.color = COL.green;
    }
    while (toastHost.children.length > 3) toastHost.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 4600);
    setTimeout(() => { if (t.parentNode) t.remove(); }, 5500);
  }

  // ---------- 4. session stats (full-screen battle report) ----------
  function renderStats(result) {
    statsRoot.textContent = '';
    // result banner (AAA results flow: verdict first, data below)
    const res = result || '';
    const ban = el('div',
      `cot-si-ban ${res === 'victory' ? 'v' : res === 'defeat' ? 'd' : 'n'}`, statsRoot);
    ban.textContent = res === 'victory' ? 'VICTORY' : res === 'defeat' ? 'DEFEAT' : 'DRAW';
    el('div', 'cot-si-bansub', statsRoot).textContent = 'Battle report';

    const kills = [...stats.perTarget.values()].filter((t) => t.killed).length;

    // --- economy strip (WoT post-battle lead): credits + XP. These are the
    // ONLY derived numbers on the report — each computed 1:1 from the session
    // counters shown in the tiles below (formula in the breakdown caption),
    // never from re-simulated combat.
    // Inputs are the ROUNDED counters the tiles display — a reader
    // recomputing the strip from the visible report must reconcile exactly.
    const win = res === 'victory';
    const dealtR = Math.round(stats.dealt);
    const blockedR = Math.round(stats.blocked);
    const baseXp = Math.round(dealtR * 0.85 + kills * 140 + blockedR * 0.12 + stats.hits * 6);
    const xp = Math.round(baseXp * (win ? 1.5 : 1));
    const credits = Math.round(dealtR * 4.2 + kills * 850 + blockedR * 0.55) + (win ? 2500 : 0);
    statsRoot.dataset.xp = String(xp);
    statsRoot.dataset.credits = String(credits);
    const econ = el('div', 'cot-si-econ', statsRoot);
    const eco = (cls, k, v, b) => {
      const it = el('div', `cot-si-ecoitem ${cls}`, econ);
      it.innerHTML = `<span class="ek">${k}</span><span class="ev">${v}</span><span class="eb">${b}</span>`;
    };
    eco('cr', 'Credits', `+${credits.toLocaleString('en-US')}`,
      `dmg ×4.2 · kill 850 · blocked ×0.55${win ? ' · +2,500 victory' : ''}`);
    eco('xp', 'Experience', `+${xp.toLocaleString('en-US')}`,
      `dmg ×0.85 · kill 140 · hit 6${win ? ' · ×1.5 victory' : ''}`);

    const cols = el('div', 'cot-si-cols', statsRoot);
    const left = el('div', 'cot-si-panel cot-si-pl', cols);
    const right = el('div', 'cot-si-panel cot-si-pr', cols);

    // --- left: your sortie summary + full team rosters ---
    const lh = el('div', 'ph', left);
    lh.innerHTML = '<span>Your sortie</span>';
    const you = el('div', 'cot-si-you', left);
    // player vehicle thumb + name (r7: the sortie row was a bare YOU label
    // over an empty composition) — specId straight from the event roster
    let youSpec = (combatants.get(playerId) || {}).specId || null;
    let youName = (combatants.get(playerId) || {}).name || '';
    if (endRoster) {
      const me = endRoster.find((r) => r.isPlayer);
      if (me) {
        if (!youSpec && me.specId) youSpec = me.specId;
        if (!youName && (me.vehicle || me.name)) youName = me.vehicle || me.name;
      }
    }
    you.innerHTML =
      (youSpec ? '<span class="si"></span>' : '') +
      `<span class="n">YOU${youName ? ` — ${youName}` : ''}</span>` +
      `<span class="s">${kills} kill${kills === 1 ? '' : 's'} · ${stats.hits}/${stats.fired} shots · ` +
      `received −${Math.round(stats.received)}</span>` +
      `<span class="dm">−${Math.round(stats.dealt)}</span>`;
    if (youSpec) {
      maskIcon(you.querySelector('.si'), youSpec, 'side_silhouette', 'rgba(255,209,102,0.9)');
    }

    // --- right: performance tiles + per-shell + commendations ---
    const rh = el('div', 'ph', right);
    rh.innerHTML = '<span>Performance</span>';
    const grid = el('div', 'cot-si-grid', right);
    const stat = (v, k) => {
      const s = el('div', 'cot-si-stat', grid);
      s.innerHTML = `<div class="v">${v}</div><div class="k">${k}</div>`;
    };
    const penRate = stats.hits > 0 ? Math.round((stats.pens / stats.hits) * 100) : 0;
    stat(Math.round(stats.dealt), 'Damage dealt');
    stat(Math.round(stats.received), 'Damage received');
    stat(Math.round(stats.blocked), 'Damage blocked');
    stat(kills, 'Kills');
    stat(stats.fired, 'Shots fired');
    stat(stats.hits, 'Shots hit');
    stat(`${penRate}%`, 'Pen rate');
    stat(stats.modulesDestroyed, 'Modules destroyed');
    statsRoot.dataset.dealt = String(Math.round(stats.dealt));
    statsRoot.dataset.received = String(Math.round(stats.received));
    statsRoot.dataset.blocked = String(Math.round(stats.blocked));
    statsRoot.dataset.fired = String(stats.fired);
    statsRoot.dataset.hits = String(stats.hits);
    statsRoot.dataset.pens = String(stats.pens);

    // per-shell-type accuracy breakdown (fired / hit / pen / damage)
    const shellTypes = [...stats.perShell.entries()].filter(([, s]) => s.fired > 0 || s.hits > 0);
    if (shellTypes.length) {
      const row = el('div', 'cot-si-shell', right);
      for (const [type, s] of shellTypes) {
        const item = el('span', '', row);
        item.innerHTML =
          `<span class="ty" style="color:${SHELL_TYPE_COLOR[type] || '#9fb0bf'}">${type}</span> ` +
          `<b>${s.fired}</b> fired · <b>${s.hits}</b> hit · <b>${s.pens}</b> pen` +
          `${s.dmg > 0 ? ` · <b>${Math.round(s.dmg)}</b> dmg` : ''}`;
      }
    }

    // commendation ribbons — every one derives 1:1 from the session counters
    const ribbons = [];
    if (kills >= 3) ribbons.push({ g: GLYPH.star, t: `ACE — ${kills} kills` });
    else if (kills >= 1) ribbons.push({ g: GLYPH.skull, t: `DESTROYER — ${kills} kill${kills === 1 ? '' : 's'}` });
    if (stats.hits >= 4 && penRate >= 70) ribbons.push({ g: GLYPH.optics, t: `SHARPSHOOTER — ${penRate}% pen` });
    if (stats.blocked >= 400) ribbons.push({ g: GLYPH.shield, t: `STEEL WALL — ${Math.round(stats.blocked)} blocked` });
    if (stats.fired >= 4 && stats.hits === stats.fired) ribbons.push({ g: GLYPH.ammoRack, t: 'EVERY SHOT CONNECTED' });
    if (ribbons.length) {
      const rr = el('div', 'cot-si-ribbons', right);
      for (const r of ribbons) {
        el('span', 'cot-si-rib', rr).innerHTML = `${r.g}<span>${r.t}</span>`;
      }
    }

    // per-shot detail (WoT detailed-results depth — fills the dead space
    // under the ribbons, r5 critique): the in-battle shot log surfaced on
    // the report, chronological, straight from the same resolved shell:hit
    // events the floating cards showed. Nothing recomputed.
    if (shotLog.length) {
      const sh2 = el('div', 'ph', right);
      sh2.style.marginTop = '10px';
      sh2.innerHTML = `<span>Your shots</span><span>last ${shotLog.length}</span>`;
      for (let i = shotLog.length - 1; i >= 0; i--) {
        const it = shotLog[i];
        const r = el('div', 'cot-si-lrow', right);
        r.innerHTML =
          `<span class="b" style="color:${it.cls.col}">${it.cls.badge.split(' ')[0].split('·')[0]}</span>` +
          `<span class="d">${(it.ev.damage || 0) > 0 ? `−${Math.round(it.ev.damage)}` : '·'}</span>` +
          `<span class="n">${it.ev.targetName || it.ev.targetId || ''}</span>` +
          `<span class="z">${zoneLabel(it.ev.zone)} · ${Math.round(it.ev.flightDistM || 0)}m</span>`;
      }
      statsRoot.dataset.reportShots = String(shotLog.length);
    }

    // damage-over-time strip: dealt (gold, up) mirrored vs received (red, down).
    // Collapsed entirely for very short battles — a single lonely bar in a
    // full-width panel read as wasted space (r6 critique); the shot log above
    // already carries the per-event story at that scale.
    const recvEvents = receivedLog.filter((e) => e.dmg > 0);
    let tlHost = null;
    if (stats.timeline.length + recvEvents.length >= 3) {
      tlHost = el('div', 'cot-si-panel cot-si-tlwrap', statsRoot);
      const th = el('div', 'ph', tlHost);
      th.innerHTML = '<span>Damage over battle</span>';
      const tl = el('div', 'cot-si-tl', tlHost);
      const BINS = 48;
      const dur = Math.max(
        30,
        ...stats.timeline.map((e) => e.t),
        ...recvEvents.map((e) => e.t),
      );
      const up = new Float32Array(BINS);
      const dn = new Float32Array(BINS);
      for (const e of stats.timeline) up[Math.min(BINS - 1, Math.floor((e.t / dur) * BINS))] += e.d;
      for (const e of recvEvents) dn[Math.min(BINS - 1, Math.floor((e.t / dur) * BINS))] += e.dmg;
      let peak = 1;
      for (let i = 0; i < BINS; i++) peak = Math.max(peak, up[i], dn[i]);
      const W = 480;
      const H = 34;
      const mid = H / 2;
      const bw = W / BINS;
      let bars = '';
      for (let i = 0; i < BINS; i++) {
        const x = (i * bw + 0.5).toFixed(1);
        if (up[i] > 0) {
          const bh = Math.max(1.5, (up[i] / peak) * (mid - 2));
          bars += `<rect x="${x}" y="${(mid - bh).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${bh.toFixed(1)}" fill="#ffd166"/>`;
        }
        if (dn[i] > 0) {
          const bh = Math.max(1.5, (dn[i] / peak) * (mid - 2));
          bars += `<rect x="${x}" y="${mid + 1}" width="${(bw - 1).toFixed(1)}" height="${bh.toFixed(1)}" fill="#f05a5a"/>`;
        }
      }
      tl.innerHTML =
        `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">` +
        `<line x1="0" y1="${mid}" x2="${W}" y2="${mid}" stroke="rgba(146,164,180,.35)" stroke-width="1"/>` +
        `${bars}</svg>` +
        `<div class="cap">dealt ▲ / received ▼ · ${fmtTime(dur)}</div>`;
    }

    // --- team rosters: every combatant the battle produced evidence for.
    // dmg/kills/dead are raw event sums (shell:hit / tank:destroyed); side
    // comes from the parity graph, overridden by the battle:ended payload
    // roster when the sim provides one. Nothing here is fabricated — a tank
    // that appears in no event and no payload simply is not listed.
    const rows = new Map();
    for (const [id, c] of combatants) {
      rows.set(id, {
        id, name: c.name, specId: c.specId, dmg: c.dmg, kills: c.kills,
        dead: c.dead, side: sideOf(id), isPlayer: id === playerId,
      });
    }
    if (endRoster) {
      for (const r of endRoster) {
        let row = rows.get(r.id);
        if (!row) {
          row = { id: r.id, name: null, specId: null, dmg: 0, kills: 0, dead: false, side: null };
          rows.set(r.id, row);
        }
        if (!row.name && (r.vehicle || r.name)) row.name = r.vehicle || r.name;
        if (!row.specId && r.specId) row.specId = r.specId;
        if (r.team) row.side = r.team === 'enemy' ? 'enemy' : 'ally';
        if (r.alive === false) row.dead = true;
        if (r.isPlayer) row.isPlayer = true;
      }
    }
    const allies = [];
    const enemies = [];
    const unknown = [];
    for (const r of rows.values()) {
      (r.side === 'ally' ? allies : r.side === 'enemy' ? enemies : unknown).push(r);
    }
    const bySort = (a, b) => (b.isPlayer ? 1 : 0) - (a.isPlayer ? 1 : 0) || b.dmg - a.dmg;
    allies.sort(bySort);
    enemies.sort(bySort);
    unknown.sort(bySort);
    statsRoot.dataset.rosterAllies = String(allies.length);
    statsRoot.dataset.rosterEnemies = String(enemies.length);

    // per-enemy interaction ledger: damage each combatant dealt TO THE PLAYER
    // (r7: enemy rows carried no two-way story) — summed from the same
    // receivedLog entries the toasts rendered, never re-simulated
    const recvBy = new Map();
    for (const e of receivedLog) {
      if (e.aid != null && e.dmg > 0) recvBy.set(e.aid, (recvBy.get(e.aid) || 0) + e.dmg);
    }
    const teamBlock = (title, list, hostile) => {
      if (!list.length) return;
      const hd = el('div', 'ph', left);
      const alive = list.filter((r) => !r.dead).length;
      hd.innerHTML = `<span>${title}</span><span>${alive}/${list.length} alive</span>`;
      const host = el('div', 'cot-si-kills', left);
      for (const r of list) {
        const row = el('div', 'cot-si-kill', host);
        // engagement detail is an ENEMY story (your hits on them, their
        // damage on you) — ally rows stay clean (r7: every ally reading
        // 'no direct hits recorded' was noise, the player never shoots them)
        const t = hostile ? stats.perTarget.get(r.id) : null;
        const took = hostile ? Math.round(recvBy.get(r.id) || 0) : 0;
        const parts = [];
        if (t && t.hits > 0) {
          parts.push(`you: ${t.hits} hit${t.hits === 1 ? '' : 's'} · ${t.pens} pen${t.pens === 1 ? '' : 's'}` +
            `${t.lastZone ? ' · ' + zoneLabel(t.lastZone) : ''}`);
          if (!t.killed && t.hpLeft != null) parts.push(`${t.hpLeft} hp left`);
        }
        if (took > 0) parts.push(`hit you −${took}`);
        const detail = parts.length ? parts.join(' · ')
          : hostile ? 'no engagement with you' : '';
        row.innerHTML =
          `<span class="si"></span>` +
          `<span class="n">${r.isPlayer ? '<b class="you">YOU</b> ' : ''}${r.name || r.id}</span>` +
          `<span class="s">${detail}</span>` +
          `<span class="k">${r.kills > 0 ? `${r.kills} ✕` : ''}</span>` +
          `<span class="dm">${r.dmg > 0 ? `−${Math.round(r.dmg)}` : '—'}</span>` +
          (r.dead ? '<span class="kd">DEAD</span>' : '<span class="al">ALIVE</span>');
        maskIcon(row.querySelector('.si'), r.specId || r.id, 'side_silhouette',
          r.dead ? '#f28f8f' : 'rgba(206,220,232,0.75)');
      }
    };
    teamBlock('Your team', allies, false);
    teamBlock('Enemy team', enemies, true);
    teamBlock('Contacts — side unconfirmed', unknown, true);
    if (!rows.size) {
      const none = el('div', 'cot-si-empty', left);
      none.textContent = 'No engagements recorded.';
    }
    // meta footer: battle length from the latest event timestamp seen (a
    // lower bound straight off the payload clocks — nothing invented)
    const durS = Math.max(0,
      ...stats.timeline.map((e) => e.t), ...receivedLog.map((e) => e.t));
    if (rows.size || durS > 0) {
      const meta = el('div', 'cot-si-meta', statsRoot);
      meta.textContent = `${rows.size} combatant${rows.size === 1 ? '' : 's'}` +
        (durS >= 30 ? ` · last engagement ${fmtTime(durS)}` : '') +
        ` · ${stats.fired} shell${stats.fired === 1 ? '' : 's'} fired`;
    }
    statsRoot.classList.add('show');
    // suppress the integration end-overlay's duplicate verdict banner, hide
    // the battle-HUD chrome, and pin its RETURN TO GARAGE button directly
    // under the last report panel (CSS above + measured pad below)
    document.body.classList.add('cot-si-report');
    pinFooter();
  }

  // Measure the report's real content bottom and set --cot-si-endpad so the
  // end-overlay's RETURN TO GARAGE button sits directly under the last panel
  // instead of floating at the screen bottom across an empty black band
  // (r6: the report wasted the bottom ~45% of a 1080p frame). Retried on an
  // interval because the .cot-end overlay only appears once the kill-cam
  // replay releases the screen (veilHud) — up to ~15 s later.
  let pinTimer = null;
  function pinFooter() {
    if (pinTimer) clearInterval(pinTimer);
    let tries = 0;
    const tick = () => {
      tries += 1;
      if (!document.body.classList.contains('cot-si-report') || tries > 140) {
        clearInterval(pinTimer);
        pinTimer = null;
        return;
      }
      const last = statsRoot.lastElementChild;
      const btn = document.querySelector('.cot-end button');
      if (!last || !btn || !btn.offsetHeight) return; // overlay not up yet
      const bottom = last.getBoundingClientRect().bottom;
      const pad = Math.max(18, window.innerHeight - bottom - 26 - btn.offsetHeight);
      document.body.style.setProperty('--cot-si-endpad', `${pad.toFixed(0)}px`);
      clearInterval(pinTimer);
      pinTimer = null;
    };
    pinTimer = setInterval(tick, 120);
    tick();
  }

  function unpinFooter() {
    if (pinTimer) {
      clearInterval(pinTimer);
      pinTimer = null;
    }
    document.body.style.removeProperty('--cot-si-endpad');
  }

  // ---------- bookkeeping ----------
  function perTarget(ev) {
    let t = stats.perTarget.get(ev.targetId);
    if (!t) {
      t = {
        name: ev.targetName, specId: ev.targetSpecId, dmg: 0, hits: 0, pens: 0,
        killed: false, lastZone: null, hpLeft: null,
      };
      stats.perTarget.set(ev.targetId, t);
    }
    return t;
  }

  bus.on('shell:fired', (p) => {
    if (!p.isPlayer) return;
    stats.fired += 1;
    perShell(p.shellType || '—').fired += 1;
  });

  bus.on('shell:hit', (ev) => {
    // team-wide roster bookkeeping (every combatant, incl. AI-vs-AI)
    if (ev.attackerId != null && ev.targetId != null && ev.attackerId !== ev.targetId) {
      const a = combatant(ev.attackerId, ev.attackerName, ev.attackerSpecId);
      a.dmg += ev.damage || 0;
      const t = combatant(ev.targetId, ev.targetName, ev.targetSpecId);
      if (ev.destroyed) t.dead = true; // kill CREDIT counted once, in tank:destroyed
      // splash can catch a teammate — only DIRECT hits assert opposing teams
      if (ev.kind !== 'he_splash') linkOpposed(ev.attackerId, ev.targetId);
    }
    if (playerId == null) return;
    if (ev.attackerId === playerId && ev.targetId && ev.targetId !== playerId) {
      const cls = classify(ev);
      stats.hits += 1;
      if (PEN_KINDS.has(ev.kind)) stats.pens += 1;
      stats.dealt += ev.damage || 0;
      const sh = perShell(ev.shellType || '—');
      sh.hits += 1;
      if (PEN_KINDS.has(ev.kind)) sh.pens += 1;
      sh.dmg += ev.damage || 0;
      if ((ev.damage || 0) > 0) stats.timeline.push({ t: ev.timeS || 0, d: ev.damage });
      stats.modulesDestroyed += (ev.modulesHit || []).filter((m) => m.newState === 'red').length;
      const t = perTarget(ev);
      t.dmg += ev.damage || 0;
      t.hits += 1;
      if (PEN_KINDS.has(ev.kind)) t.pens += 1;
      if (ev.zone) t.lastZone = ev.zone;
      // remaining HP straight from the sim payload (report roster shows it)
      if (Number.isFinite(ev.targetHpAfter)) t.hpLeft = Math.max(0, Math.round(ev.targetHpAfter));
      if (ev.destroyed) { t.killed = true; t.hpLeft = 0; }
      shotLog.unshift({ ev, cls });
      if (shotLog.length > 6) shotLog.pop();
      showCard(ev, cls);
      if (logOpen) renderLog();
    }
    if (ev.targetId === playerId) {
      const cls = classify(ev);
      stats.received += ev.damage || 0;
      if ((ev.damage || 0) <= 0 && BOUNCE_KINDS.has(ev.kind)) stats.blocked += ev.dmgRoll || 0;
      const mods = (ev.modulesHit || []).filter((m) => m.newState === 'red')
        .map((m) => MODULE_LABEL[m.module] || m.module).join(', ');
      receivedLog.push({
        t: ev.timeS || 0, dmg: ev.damage || 0, kind: ev.kind, aid: ev.attackerId,
        attacker: ev.attackerName || 'Enemy', shellType: ev.shellType || '', mods,
      });
      showToast(ev, cls);
      if (logOpen) renderLog();
    }
  });

  bus.on('tank:destroyed', (p) => {
    // team-wide roster bookkeeping (fire deaths included — no shell:hit fires)
    combatant(p.id, null, p.specId).dead = true;
    if (p.killerId != null && p.killerId !== p.id) {
      combatant(p.killerId).kills += 1;
      linkOpposed(p.killerId, p.id);
    }
    if (playerId == null || p.killerId !== playerId || p.id === playerId) return;
    let t = stats.perTarget.get(p.id);
    if (!t) {
      let name = p.specId;
      try { name = getSpec(p.specId).name; } catch (_) { /* keep raw id */ }
      t = {
        name, specId: p.specId, dmg: 0, hits: 0, pens: 0,
        killed: false, lastZone: null, hpLeft: null,
      };
      stats.perTarget.set(p.id, t);
    }
    t.killed = true;
    t.hpLeft = 0;
  });

  bus.on('battle:ended', (p) => {
    // the floating shot card and incoming toasts must never linger behind the
    // results screen — a dimmed PENETRATION card double-reported the final
    // shot in the corner of the DEFEAT report for up to 7 s (r4 critique)
    while (cardHost.firstChild) cardHost.firstChild.remove();
    while (toastHost.firstChild) toastHost.firstChild.remove();
    // authoritative team roster when the sim provides one (additive payload)
    if (p && Array.isArray(p.roster)) endRoster = p.roster;
    renderStats(p ? p.result : '');
  });
  bus.on('ui:shotLog', () => toggleLog());
  bus.on('ui:battleStart', () => api.reset());

  const api = {
    root,
    statsRoot,
    toggleLog,

    /** Latch the player entity id (hud.js forwards it each frame). */
    setPlayer(id) { playerId = id; },

    /** Hide the end-of-battle stats card (garage/hidden HUD). */
    hideStats() {
      statsRoot.classList.remove('show');
      document.body.classList.remove('cot-si-report');
      unpinFooter();
    },

    /** Fresh battle: clear cards, toasts, logs and session stats. */
    reset() {
      while (cardHost.firstChild) cardHost.firstChild.remove();
      while (toastHost.firstChild) toastHost.firstChild.remove();
      shotLog.length = 0;
      receivedLog.length = 0;
      combatants.clear();
      tg.clear();
      endRoster = null;
      Object.assign(stats, newStats());
      stats.perTarget = new Map();
      logOpen = false;
      logPanel.classList.remove('open');
      statsRoot.classList.remove('show');
      document.body.classList.remove('cot-si-report');
      unpinFooter();
    },
  };
  return api;
}
