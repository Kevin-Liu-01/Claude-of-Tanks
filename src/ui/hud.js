// src/ui/hud.js — battle HUD overlay: dispersion reticle + reload ring, shell
// selector with ammo counts, consumable slots, penetration indicator, sniper
// scope, team panels ("ears") + score/timer plate, spotting-driven enemy
// nameplates and minimap, kill feed, damage log, damage numbers, hit-direction
// indicator. DOM/canvas only — no scene objects.
// Contract: docs/ARCHITECTURE.md §3.7.1.
import * as THREE from 'three';

// --- palette (locked colors per ARCHITECTURE §3.7.1) ---
const PEN_GREEN = '#7ee87e';
const PEN_ORANGE = '#f0b04a';
const PEN_RED = '#f05a5a';
const PEN_NONE = 'rgba(236,242,248,0.95)';
// WoT sight grammar: the DISPERSION CIRCLE is always the same pale green in
// every mode — only the central gun marker carries the penetration color.
// r4: desaturated toward pale white-green + thinner strokes — the old
// saturated mint at 2px read as WoT Blitz/mobile, not the PC client.
const CIRCLE_COL = 'rgba(208,233,211,0.85)';
// Shared Switzer type system (see src/ui/fonts.js): FONT_COND drives the
// numeral/label hierarchy with tabular figures.
import { FONT_STACK, FONT_COND, ensureFonts } from './fonts.js';
// Pre-rendered tank icons (tools/genIcons.mjs): side silhouettes drive the
// kill feed + ambient nameplates. Minimap blips and team-panel rows use the
// vector class-glyph/arrow language instead (WoT reads class + heading, not
// per-vehicle profiles, at those sizes).
import { maskIcon, tintedIcon } from './icons.js';
// SHOT-INFO SECTION: combat-intelligence panels (shot cards, armor diagrams,
// incoming toasts, shot log, session stats) — logic lives in src/ui/shotInfo.js.
import { createShotInfo } from './shotInfo.js';

// module-scope scratch (no per-frame allocation)
const _mInv = new THREE.Matrix4();
const _cs = new THREE.Vector3();
const _ndc = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _fwd = new THREE.Vector3();

// spotting model (WoT-style): max spot range + persistence after LOS is lost
// camo_spotting r3: import the sim's constants instead of duplicating them —
// hardcoded copies drifted on every retune (persist 4 vs the sim's 5).
import { MAX_SPOT_RANGE_M as SPOT_RANGE_M, SPOT_LINGER_S as SPOT_PERSIST_S }
  from '../sim/spotting.js';
const RENDER_RANGE_M = 500; // white square on the minimap
const BATTLE_DURATION_S = 900; // 15:00 countdown

// Default shell card data (used only when a forced screenshot aim view arrives
// before any live frame — matches the m1a2 default player loadout).
const DEFAULT_SHELLS = [
  { name: 'M829A4', type: 'APFSDS', dmg: 540, penLabel: '750 mm' },
  { name: 'M830A1', type: 'HEAT', dmg: 480, penLabel: '600 mm' },
  { name: 'M1147', type: 'HE', dmg: 600, penLabel: '60 mm' },
];

const SHELL_TYPE_COLOR = {
  AP: '#ffd27a', APCR: '#e8f4ff', HEAT: '#ff8a5c', HE: '#ffb02e', APFSDS: '#ffc46b',
};
const SHELL_DEFAULT_COUNT = { AP: 24, APCR: 20, APFSDS: 24, HEAT: 16, HE: 12 };

const CAUSE_LABEL = { shot: '', fire: 'FIRE', ammorack: 'AMMO RACK' };

// Roster identity: WoT rows read "Nickname (Vehicle)" with a tier numeral.
// Bot nicknames are assigned deterministically per battle from this pool
// (hashed off the entity id, collisions probe forward), the player is Claude.
const BOT_NICKS = [
  'IronMaus', 'SteppeWolf_71', 'Kranvagn', 'DustDevil', 'Bogatyr',
  'HullDown_Hank', 'PzKpfwPete', 'Kettenkrad', 'RicochetRita', 'TokTokkie',
  'GeneralLee42', 'Zaseka', 'MudCrawler', 'BiaTheBear', 'SabotSally',
  'Feldwebel_K', 'OldNikolai', 'TinCanAlly', 'GrilleGuy', 'VodkaVanya',
  'CamoNet', 'LongStop', 'DerbyDozer', 'PakWagen',
];
const PLAYER_NICK = 'Claude';
// vehicle tier (WoT-style roman numeral badge) per spec id
const TIER_BY_ID = {
  m4a3e8: 'VI', t34_85: 'VI', tiger1: 'VII', is2: 'VII', panther_g: 'VII',
  m1a2: 'X', t90m: 'X', leo2a7: 'X',
  // COMMUNITY TANKS (sourced roster — see docs/ATTRIBUTION.md)
  strv103: 'IX', is3: 'VIII', t34_85_cad: 'VI', newc_tiger: 'VII',
  newc_pziii: 'IV', pziii_konserwa: 'III', leichttraktor: 'I',
  recon_tank: 'VIII', q_heavy: 'IX',
};
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// minimap grid letters (WoT convention skips "I")
const GRID_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'];

const CONSUMABLES = [
  {
    key: '4', label: 'Repair Kit', count: 2,
    svg: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#cfd9e2" d="M21.7 6.4a5.4 5.4 0 0 1-7.3 6.5L7 20.3a2.1 2.1 0 0 1-3-3l7.4-7.4a5.4 5.4 0 0 1 6.5-7.3L14.6 6l3.4 3.4 3.7-3Z"/></svg>',
  },
  {
    key: '5', label: 'First Aid Kit', count: 2,
    svg: '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="2.5" y="6" width="19" height="14" rx="2" fill="#cfd9e2"/><rect x="9" y="3.5" width="6" height="3" rx="1" fill="#9fb0bf"/><path d="M10.7 9.5h2.6v2.2h2.2v2.6h-2.2v2.2h-2.6v-2.2H8.5v-2.6h2.2Z" fill="#c92f2f"/></svg>',
  },
  {
    key: '6', label: 'Fire Extinguisher', count: 1,
    svg: '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="9" y="8" width="6.5" height="13" rx="2.2" fill="#d24a3a"/><rect x="10.7" y="4.5" width="3" height="3.5" fill="#cfd9e2"/><path d="M10.7 6 4.5 3.4v2.2l6.2 2Z" fill="#9fb0bf"/><rect x="9" y="11" width="6.5" height="2" fill="#eef4f9" opacity=".7"/></svg>',
  },
];

// Procedural shell artwork for the ammo slots: one consistent silhouette
// language across the loadout — every icon is a vertical projectile of the
// SAME height, filled with the same steel gradient, tinted and banded in its
// type color. Only the nose/body profile differs (the WoT read):
//   AP/APCR  sharp ogive           HEAT  tapered cone + standoff probe
//   APFSDS   finned dart in sabot  HE    fat blunt round-nose
function drawShellIcon(canvas, type) {
  const S = 46;
  const dpr = 2; // fixed 2x internal resolution — crisp even at devicePixelRatio 1
  canvas.width = S * dpr; canvas.height = S * dpr;
  canvas.style.width = `${S}px`; canvas.style.height = `${S}px`;
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, S, S);
  const cx = S / 2;
  const band = SHELL_TYPE_COLOR[type] || '#9fb0bf';
  const TOP = 4, BOT = 42; // shared silhouette extents — uniform set
  const steel = c.createLinearGradient(cx - 8, 0, cx + 8, 0);
  steel.addColorStop(0, '#454e56'); steel.addColorStop(0.38, '#9dabb5');
  steel.addColorStop(0.58, '#c7d3dc'); steel.addColorStop(1, '#4a545c');

  // body path per type (projectile silhouette, tip at TOP, base at BOT)
  function bodyPath() {
    c.beginPath();
    if (type === 'APFSDS') {
      const rw = 2.0; // rod half-width
      c.moveTo(cx, TOP);                       // needle tip
      c.lineTo(cx + rw, TOP + 7);
      c.lineTo(cx + rw, BOT - 7);
      c.lineTo(cx + rw + 4.5, BOT);            // right fin
      c.lineTo(cx + rw + 4.5, BOT); c.lineTo(cx + 1, BOT - 1.5);
      c.lineTo(cx - 1, BOT - 1.5); c.lineTo(cx - rw - 4.5, BOT); // left fin
      c.lineTo(cx - rw, BOT - 7);
      c.lineTo(cx - rw, TOP + 7);
    } else if (type === 'HEAT') {
      // continuous cone from probe shoulder to a full-caliber base — no
      // bottle shoulder anywhere
      c.moveTo(cx - 1.4, TOP);                 // probe cap
      c.lineTo(cx + 1.4, TOP);
      c.lineTo(cx + 1.4, TOP + 6);             // standoff probe
      c.lineTo(cx + 3.4, TOP + 8.5);           // cone shoulder
      c.lineTo(cx + 7, BOT - 12);              // straight taper out
      c.lineTo(cx + 7, BOT - 3);               // short full-caliber skirt
      c.lineTo(cx + 5.4, BOT);                 // boat-tail
      c.lineTo(cx - 5.4, BOT);
      c.lineTo(cx - 7, BOT - 3);
      c.lineTo(cx - 7, BOT - 12);
      c.lineTo(cx - 3.4, TOP + 8.5);
      c.lineTo(cx - 1.4, TOP + 6);
    } else if (type === 'HE') {
      c.moveTo(cx - 8, BOT);
      c.lineTo(cx - 8, TOP + 14);
      c.quadraticCurveTo(cx - 7.6, TOP + 3.5, cx, TOP + 0.5); // blunt dome
      c.quadraticCurveTo(cx + 7.6, TOP + 3.5, cx + 8, TOP + 14);
      c.lineTo(cx + 8, BOT);
    } else {
      // AP / APCR: classic sharp ogive
      const hw = type === 'APCR' ? 6 : 7;
      c.moveTo(cx - hw, BOT);
      c.lineTo(cx - hw, TOP + 13);
      c.quadraticCurveTo(cx - hw * 0.82, TOP + 4, cx, TOP);
      c.quadraticCurveTo(cx + hw * 0.82, TOP + 4, cx + hw, TOP + 13);
      c.lineTo(cx + hw, BOT);
    }
    c.closePath();
  }

  // fill: shared steel gradient, tinted toward the type color (source-atop
  // keeps the tint inside the silhouette)
  bodyPath();
  c.fillStyle = steel;
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = band;
  c.globalAlpha = 0.22;
  c.fillRect(0, 0, S, S);
  c.globalAlpha = 1;
  // driving band near the base + nose accent in the full type color
  c.fillStyle = band;
  if (type === 'APFSDS') {
    c.fillRect(cx - 3.5, BOT - 10.5, 7, 2.6);  // tracer band on the rod
  } else if (type === 'HEAT') {
    c.fillRect(cx - 7.2, BOT - 9, 14.4, 2.6);
    c.fillRect(cx - 4.6, TOP + 10.5, 9.2, 2);  // cone ring
  } else if (type === 'HE') {
    c.fillRect(cx - 8.2, BOT - 8, 16.4, 2.8);
    c.beginPath();                             // painted nose ring
    c.moveTo(cx - 7.4, TOP + 9); c.quadraticCurveTo(cx, TOP + 4, cx + 7.4, TOP + 9);
    c.lineTo(cx + 7.8, TOP + 12.4); c.quadraticCurveTo(cx, TOP + 7.4, cx - 7.8, TOP + 12.4);
    c.closePath(); c.fill();
  } else {
    c.fillRect(cx - 7.2, BOT - 8.5, 14.4, 2.8);
    c.fillRect(cx - 5.2, TOP + 7.5, 10.4, 1.8); // AP cap seam
  }
  // shared soft specular streak
  c.fillStyle = 'rgba(255,255,255,0.16)';
  c.fillRect(cx - 2.2, TOP + 7, 1.7, BOT - TOP - 15);
  c.restore();
  // APFSDS: sabot petals OUTSIDE the clip so the dart reads through them
  if (type === 'APFSDS') {
    c.fillStyle = 'rgba(139,149,158,0.95)';
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx + s * 2.6, 17);
      c.lineTo(cx + s * 7.2, 24);
      c.lineTo(cx + s * 7.2, 31);
      c.lineTo(cx + s * 3.2, 27.5);
      c.closePath();
      c.fill();
    }
  }
  // crisp dark keyline unifies the set against the slot plate
  bodyPath();
  c.strokeStyle = 'rgba(10,14,18,0.85)';
  c.lineWidth = 1;
  c.stroke();
}

// Team-panel row icon: the tank's actual side-profile silhouette (generated
// from the shipped model by tools/genIcons.mjs), tinted via CSS mask.
// Unspotted enemies dim to a ghost of the same shape (WoT reads "known but
// not visible").

const HUD_CSS = `
.cot-hud{position:fixed;inset:0;pointer-events:none;z-index:40;font-family:${FONT_STACK};
  -webkit-user-select:none;user-select:none;color:#e6edf3;overflow:hidden;}
.cot-hud *{box-sizing:border-box;margin:0;padding:0;}
.cot-ret{position:absolute;inset:0;width:100%;height:100%;display:block;}
.cot-top{position:absolute;top:0;left:50%;transform:translateX(-50%);display:flex;
  align-items:center;gap:11px;padding:6px 30px 7px;
  background:linear-gradient(180deg,rgba(16,21,27,.94),rgba(7,10,14,.68));
  border:1px solid rgba(146,164,180,.3);border-top:none;
  box-shadow:0 3px 14px rgba(0,0,0,.45),inset 0 1px 0 rgba(232,242,250,.10),
  inset 0 -1px 0 rgba(0,0,0,.55);
  clip-path:polygon(0 0,100% 0,calc(100% - 16px) 100%,16px 100%);}
.cot-top .fg{color:${PEN_GREEN};font-size:24px;font-weight:800;line-height:1;
  font-family:${FONT_COND};font-stretch:condensed;letter-spacing:-.015em;
  font-variant-numeric:tabular-nums;text-shadow:0 1px 2px rgba(0,0,0,.8);}
.cot-top .fe{color:${PEN_RED};font-size:24px;font-weight:800;line-height:1;
  font-family:${FONT_COND};font-stretch:condensed;letter-spacing:-.015em;
  font-variant-numeric:tabular-nums;text-shadow:0 1px 2px rgba(0,0,0,.8);}
.cot-top .tm{font-size:14px;font-weight:600;color:#d6e2ec;letter-spacing:.1em;
  font-family:${FONT_COND};font-stretch:condensed;text-shadow:0 1px 2px rgba(0,0,0,.8);
  font-variant-numeric:tabular-nums;line-height:1;padding:0 4px;}
/* frag counter (r4, WoT tug-of-war semantics): a row of slim segment ticks
   sits UNDER each score numeral — empty slots are subtle dark notches (one
   per opposing vehicle), and each kill fills one in the scoring team's
   color, growing outward from the timer. Deliberately thin (3.5px) so the
   idle plate reads as engraved segments, not wireframe checkboxes (r3). */
.cot-top .sc{display:flex;flex-direction:column;align-items:center;gap:3px;}
.cot-top .wedge{display:flex;gap:2px;align-items:center;}
.cot-top .wedge i{display:block;width:10px;height:3.5px;transform:skewX(-24deg);
  background:rgba(146,164,180,.22);box-shadow:0 1px 1px rgba(0,0,0,.35) inset;}
.cot-top .wedge.r i{transform:skewX(24deg);}
.cot-top .wedge i.on{animation:cotChipIn .18s ease-out;
  background:linear-gradient(180deg,rgba(150,240,150,.95),rgba(84,196,84,.9));
  box-shadow:0 0 5px rgba(126,232,126,.4),0 1px 2px rgba(0,0,0,.5);}
.cot-top .wedge.r i.on{background:linear-gradient(180deg,rgba(248,120,110,.95),rgba(205,58,48,.92));
  box-shadow:0 0 5px rgba(240,90,90,.4),0 1px 2px rgba(0,0,0,.5);}
@keyframes cotChipIn{from{opacity:0}to{opacity:1}}
/* net/perf readout (WoT battle constant): ping + fps, top-left corner */
.cot-net{position:absolute;top:5px;left:10px;font-size:11px;font-weight:600;
  font-family:${FONT_COND};font-stretch:condensed;letter-spacing:.07em;
  color:#d6e2ec;opacity:.6;font-variant-numeric:tabular-nums;line-height:1;
  text-shadow:0 1px 2px rgba(0,0,0,.85);}
.cot-ear{position:absolute;top:52px;width:194px;display:flex;flex-direction:column;gap:2px;}
.cot-ear.l{left:0;}
.cot-ear.r{right:0;}
.cot-ear .hd{font-size:10px;font-weight:700;letter-spacing:.2em;color:#8a97a3;
  font-family:${FONT_COND};font-stretch:condensed;
  text-transform:uppercase;padding:2px 10px 3px;display:flex;justify-content:space-between;
  background:rgba(7,10,14,.55);}
.cot-ear.l .hd{border-left:2px solid rgba(126,232,126,.75);}
.cot-ear.r .hd{border-right:2px solid rgba(240,90,90,.75);text-align:right;}
.cot-er{display:flex;align-items:center;gap:5px;padding:3px 10px 4px 8px;font-size:11px;
  font-weight:600;letter-spacing:.02em;color:#d6e2ec;position:relative;
  text-shadow:0 1px 2px rgba(0,0,0,.85);}
.cot-ear.l .cot-er{background:linear-gradient(90deg,rgba(7,10,14,.72) 0%,rgba(7,10,14,.15) 100%);
  border-left:2px solid rgba(126,232,126,.75);}
.cot-ear.r .cot-er{background:linear-gradient(270deg,rgba(7,10,14,.72) 0%,rgba(7,10,14,.15) 100%);
  border-right:2px solid rgba(240,90,90,.75);flex-direction:row-reverse;}
.cot-er .ic{width:13px;height:11px;flex:0 0 auto;display:flex;
  align-items:center;justify-content:center;
  filter:drop-shadow(0 1px 1px rgba(0,0,0,.7));}
.cot-er .ic svg{display:block;}
.cot-er .tier{flex:0 0 auto;font-size:8.5px;font-weight:800;line-height:1;color:#9fb0bf;
  font-family:${FONT_COND};font-stretch:condensed;letter-spacing:.04em;
  padding:1.5px 3px;border:1px solid rgba(146,164,180,.35);background:rgba(10,14,18,.5);}
.cot-er .n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;
  display:flex;flex-direction:column;gap:0;line-height:1.15;}
.cot-ear.r .cot-er .n{text-align:right;align-items:flex-end;}
.cot-er .n .nick{font-size:10.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;max-width:100%;}
.cot-er .n .veh{font-size:8.5px;font-weight:600;color:#8a97a3;letter-spacing:.05em;
  font-family:${FONT_COND};font-stretch:condensed;text-transform:uppercase;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;}
.cot-er.me .n .nick{color:#ffd27a;}
.cot-er .hpm{position:absolute;left:8px;right:10px;bottom:1px;height:2px;
  background:rgba(255,255,255,.1);}
.cot-er .hpm i{display:block;height:100%;background:currentColor;}
.cot-ear.l .cot-er .hpm i{background:rgba(126,232,126,.8);}
.cot-ear.r .cot-er .hpm i{background:rgba(240,120,110,.8);}
.cot-er.unlit{opacity:.45;filter:saturate(.5);}
.cot-er.dead{opacity:.38;}
.cot-er.dead .n .nick{text-decoration:line-through;text-decoration-color:rgba(240,90,90,.8);}
.cot-er.dead .hpm{display:none;}
.cot-killfeed{position:absolute;top:52px;left:210px;display:flex;flex-direction:column;
  gap:5px;align-items:flex-start;max-width:420px;}
.cot-kf{display:flex;gap:7px;align-items:baseline;padding:5px 16px 5px 12px;font-size:12.5px;
  letter-spacing:.03em;background:linear-gradient(270deg,rgba(8,12,16,0) 0%,rgba(8,12,16,.82) 26%);
  border-left:2px solid #f05a5a;text-shadow:0 1px 2px rgba(0,0,0,.8);
  transition:opacity .9s ease;opacity:1;}
.cot-kf.out{opacity:0;}
.cot-kf .k{color:#cfe3f4;font-weight:600;}
.cot-kf .v{color:#f28f8f;font-weight:600;}
.cot-kf .d{color:#8a97a3;font-weight:400;font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;}
.cot-kf .c{color:#f0b04a;font-size:10px;letter-spacing:.1em;font-weight:700;}
.cot-kf .si{width:30px;height:12px;flex:0 0 auto;align-self:center;display:inline-block;}
.cot-dlog{position:absolute;left:12px;bottom:248px;display:flex;flex-direction:column;gap:2px;}
.cot-dl{font-size:11px;font-weight:600;letter-spacing:.03em;padding:2px 10px 2px 8px;
  background:linear-gradient(90deg,rgba(8,12,16,.75),rgba(8,12,16,.1));
  border-left:2px solid #f05a5a;color:#f2b1a8;text-shadow:0 1px 2px rgba(0,0,0,.85);
  transition:opacity .8s ease;}
.cot-dl b{color:#ff8f80;font-weight:700;font-variant-numeric:tabular-nums;}
.cot-dl.out{opacity:0;}
.cot-dmglayer{position:absolute;inset:0;}
.cot-dmgnum{position:absolute;font-weight:700;font-size:18px;color:#ffd166;white-space:nowrap;
  text-shadow:0 1px 1px rgba(0,0,0,.95),0 0 12px rgba(0,0,0,.5);
  animation:cotFloat 1.7s cubic-bezier(.2,.6,.3,1) forwards;will-change:transform,opacity;}
.cot-dmgnum.miss{color:#bcc8d2;font-size:13px;font-weight:600;letter-spacing:.12em;}
.cot-dmgnum .crit{font-size:10px;letter-spacing:.14em;color:#ff8a5c;vertical-align:super;margin-left:4px;}
@keyframes cotFloat{0%{opacity:0;transform:translate(-50%,-30%)}10%{opacity:1}
  70%{opacity:.95}100%{opacity:0;transform:translate(-50%,-190%)}}
.cot-alert{position:absolute;left:50%;bottom:23%;transform:translateX(-50%);font-size:15px;
  font-family:${FONT_COND};font-stretch:condensed;
  font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#f0b04a;
  text-shadow:0 1px 3px rgba(0,0,0,.9);opacity:0;transition:opacity .25s ease;}
.cot-alert.red{color:#f05a5a;}
.cot-alert.show{opacity:1;}
.cot-bounce{position:absolute;left:50%;top:37%;transform:translateX(-50%);font-size:15px;
  font-weight:700;letter-spacing:.06em;color:#c8d2dc;white-space:nowrap;
  text-shadow:0 1px 2px rgba(0,0,0,.95),0 0 10px rgba(0,0,0,.5);
  opacity:0;transition:opacity .18s ease;}
.cot-bounce.show{opacity:1;}
.cot-shells{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);display:flex;
  gap:6px;pointer-events:auto;align-items:stretch;}
.cot-shell{width:64px;height:64px;background:linear-gradient(180deg,rgba(14,19,24,.92),rgba(8,11,14,.95));
  border:1px solid rgba(146,164,180,.28);border-bottom:2px solid rgba(146,164,180,.28);
  cursor:pointer;position:relative;transition:border-color .12s,background .12s;}
.cot-shell:hover{border-color:rgba(210,225,240,.5);}
.cot-shell.sel{border-color:#f0a030;border-bottom-color:#f0a030;
  background:linear-gradient(180deg,rgba(34,26,12,.9),rgba(18,13,7,.92));
  box-shadow:0 0 14px rgba(240,160,48,.25);}
.cot-shell canvas{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);}
.cot-shell .key{position:absolute;top:2px;left:3px;font-size:9.5px;font-weight:700;color:#8a97a3;
  font-family:${FONT_COND};font-stretch:condensed;
  border:1px solid rgba(146,164,180,.4);padding:0 3.5px;line-height:13px;z-index:2;}
.cot-shell.sel .key{color:#f0b04a;border-color:rgba(240,176,74,.6);}
.cot-shell .cnt{position:absolute;bottom:1px;right:4px;font-size:13px;font-weight:700;
  font-family:${FONT_COND};font-stretch:condensed;
  color:#e6edf3;font-variant-numeric:tabular-nums;letter-spacing:.02em;z-index:2;
  text-shadow:0 1px 2px rgba(0,0,0,.9);}
.cot-shell .ty{position:absolute;bottom:2px;left:4px;font-size:8px;font-weight:800;
  font-family:${FONT_COND};font-stretch:condensed;
  letter-spacing:.08em;z-index:2;text-shadow:0 1px 2px rgba(0,0,0,.9);}
.cot-shell .cool{position:absolute;left:0;right:0;top:0;height:0;
  background:rgba(4,6,9,.72);pointer-events:none;z-index:3;}
.cot-shell .tip{display:none;position:absolute;bottom:70px;left:50%;transform:translateX(-50%);
  white-space:nowrap;background:rgba(7,10,14,.94);border:1px solid rgba(146,164,180,.4);
  padding:5px 9px 6px;font-size:10.5px;color:#c6d2dc;letter-spacing:.04em;z-index:5;
  box-shadow:0 4px 14px rgba(0,0,0,.5);text-align:center;}
.cot-shell .tip b{color:#e6edf3;font-weight:600;}
.cot-shell .tip .tnm{font-size:11px;font-weight:600;color:#eef4f9;margin-bottom:2px;}
.cot-shell:hover .tip{display:block;}
.cot-consep{width:1px;background:rgba(146,164,180,.3);margin:2px 3px;}
.cot-con{width:46px;position:relative;cursor:pointer;
  background:linear-gradient(180deg,rgba(14,19,24,.92),rgba(8,11,14,.95));
  border:1px solid rgba(146,164,180,.28);border-bottom:2px solid rgba(146,164,180,.28);
  display:flex;align-items:center;justify-content:center;transition:border-color .12s;}
.cot-con:hover{border-color:rgba(210,225,240,.5);}
.cot-con .key{position:absolute;top:3px;left:4px;font-size:9px;font-weight:700;color:#8a97a3;
  font-family:${FONT_COND};font-stretch:condensed;
  border:1px solid rgba(146,164,180,.4);padding:0 3px;line-height:12px;}
.cot-con .cnt{position:absolute;bottom:2px;right:4px;font-size:11px;font-weight:700;
  font-family:${FONT_COND};font-stretch:condensed;color:#cfd9e2;
  font-variant-numeric:tabular-nums;text-shadow:0 1px 2px rgba(0,0,0,.9);}
.cot-con .cool{position:absolute;inset:0;display:none;
  background:conic-gradient(rgba(4,6,9,.8) var(--cool,0%),transparent 0);}
.cot-con.used{opacity:.35;filter:grayscale(1);}
.cot-con.deny{animation:cotConDeny .3s;}
@keyframes cotConDeny{0%,100%{border-color:rgba(146,164,180,.28);}50%{border-color:rgba(240,90,90,.9);}}
.cot-hpbars{position:absolute;inset:0;}
.cot-hpb{position:absolute;width:108px;transform:translate(-50%,-100%);text-align:center;will-change:transform;}
.cot-hpb .nm{font-size:11.5px;font-weight:700;letter-spacing:.04em;color:#ff5555;
  font-family:${FONT_COND};font-stretch:condensed;
  text-shadow:0 0 3px #000,0 1px 2px #000,1px 0 2px #000,-1px 0 2px #000,0 -1px 2px #000;
  margin-bottom:2px;white-space:nowrap;
  display:flex;align-items:center;justify-content:center;gap:4px;}
.cot-hpb.ally .nm{color:#8df08d;}
.cot-hpb .nm .si{width:24px;height:10px;flex:0 0 auto;display:block;}
.cot-hpb .tr{height:5px;background:rgba(4,6,8,.9);border:1px solid rgba(0,0,0,.85);
  box-shadow:0 1px 3px rgba(0,0,0,.8);position:relative;}
.cot-hpb .fl{height:100%;background:linear-gradient(180deg,#ff7a6e,#d63a30);transition:width .15s linear;}
.cot-hpb.ally .fl{background:linear-gradient(180deg,#9df09d,#3fae3f);}
.cot-hpb .sg{position:absolute;inset:0;
  background:repeating-linear-gradient(90deg,transparent 0 12px,rgba(5,7,9,.85) 12px 13px);}
/* over-target marker (WoT aiming loop): shown for the enemy vehicle sitting
   under the gun — nickname, tier + vehicle, segmented HP bar with numerals.
   FREE-FLOATING shadowed text, NO card background or border (r3: the old
   opaque bordered plate parked on the aim point occluded the target at the
   exact moment of aiming — WoT floats shadowed text above the vehicle). */
.cot-tgt{position:absolute;width:150px;transform:translate(-50%,-100%);
  text-align:center;display:none;will-change:transform;}
.cot-tgt .bk{padding:0 0 22px;}
.cot-tgt .nick{font-size:13px;font-weight:700;color:#ff9c92;letter-spacing:.02em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  text-shadow:0 0 3px #000,0 1px 2px #000,1px 0 2px #000,-1px 0 2px #000,0 -1px 2px #000;}
.cot-tgt .vrow{display:flex;align-items:center;justify-content:center;gap:5px;
  margin-top:1px;}
.cot-tgt .tier{font-size:9px;font-weight:800;line-height:1;color:#e8bcb5;
  font-family:${FONT_COND};font-stretch:condensed;letter-spacing:.04em;
  text-shadow:0 0 3px #000,0 1px 2px #000,1px 0 2px #000,-1px 0 2px #000,0 -1px 2px #000;}
.cot-tgt .veh{font-size:10px;font-weight:700;color:#f0d4ce;letter-spacing:.08em;
  font-family:${FONT_COND};font-stretch:condensed;text-transform:uppercase;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  text-shadow:0 0 3px #000,0 1px 2px #000,1px 0 2px #000,-1px 0 2px #000,0 -1px 2px #000;}
.cot-tgt .tr{height:5px;margin:4px 14px 0;background:rgba(4,6,8,.88);
  border:1px solid rgba(0,0,0,.9);position:relative;
  box-shadow:0 1px 3px rgba(0,0,0,.7);}
.cot-tgt .fl{height:100%;background:linear-gradient(180deg,#ff7a6e,#d63a30);}
.cot-tgt .sg{position:absolute;inset:0;
  background:repeating-linear-gradient(90deg,transparent 0 12px,rgba(5,7,9,.85) 12px 13px);}
.cot-tgt .hp{font-size:10px;font-weight:700;color:#f6cfc8;margin-top:2px;
  font-family:${FONT_COND};font-stretch:condensed;font-variant-numeric:tabular-nums;
  letter-spacing:.05em;
  text-shadow:0 0 3px #000,0 1px 2px #000,1px 0 2px #000,-1px 0 2px #000,0 -1px 2px #000;}
.cot-minimap{position:absolute;right:16px;bottom:16px;width:220px;height:220px;
  border:1px solid rgba(210,225,240,.28);box-shadow:0 6px 22px rgba(0,0,0,.55);
  background:#0d1310;}
.cot-minimap canvas{display:block;width:100%;height:100%;}
/* SPOTTING SECTION: sixth-sense lamp (lights 3 s after you are spotted) */
.cot-sixth{position:absolute;top:14%;left:50%;transform:translateX(-50%);
  display:flex;flex-direction:column;align-items:center;gap:2px;
  opacity:0;transition:opacity .15s ease;pointer-events:none;}
.cot-sixth.on{opacity:1;}
.cot-sixth svg{filter:drop-shadow(0 0 12px rgba(255,186,60,.9)) drop-shadow(0 2px 4px rgba(0,0,0,.7));
  animation:cotSixthPulse 1.1s ease-in-out infinite;}
@keyframes cotSixthPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
.cot-sixth .lb{font-size:11px;font-weight:800;letter-spacing:.32em;color:#ffb02e;
  font-family:${FONT_COND};font-stretch:condensed;text-transform:uppercase;
  text-shadow:0 1px 3px rgba(0,0,0,.95);}
/* SPOTTING SECTION: concealment eye — icon only, WoT-mod style. The eye DIMS
   with high concealment and brightens as concealment drops; solid red while
   actively spotted. FREE-FLOATING above the ammo tray, no slot chrome (r3:
   the boxed tray-adjacent version misread as a seventh consumable slot). */
.cot-camoind{position:absolute;bottom:92px;left:50%;transform:translateX(-50%);
  display:flex;align-items:center;justify-content:center;width:30px;height:24px;
  filter:drop-shadow(0 1px 2px rgba(0,0,0,.85));}
.cot-camoind svg{display:block;flex:0 0 auto;transition:opacity .2s;}
`;

function penColor(r) {
  if (r == null || !isFinite(r)) return PEN_NONE;
  return r >= 1.15 ? PEN_GREEN : r >= 0.85 ? PEN_ORANGE : PEN_RED;
}

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

function fmtTimer(s) {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/**
 * Create the battle HUD overlay and subscribe it to the event bus.
 * @param {{on:Function,off:Function,emit:Function}} bus - injected event bus (§1.5).
 * @returns {{setMode:Function,update:Function,buildMinimap:Function,setDamagePanel:Function,forceAimDisplay:Function,root:HTMLElement}} Hud
 */
export function initHud(bus) {
  ensureFonts();
  ensureStyle('cot-hud-style', HUD_CSS);

  const root = el('div', 'cot-hud');
  document.body.appendChild(root);

  const retCanvas = el('canvas', 'cot-ret', root);
  const ctx = retCanvas.getContext('2d');
  const hpLayer = el('div', 'cot-hpbars', root);
  const dmgLayer = el('div', 'cot-dmglayer', root);

  // --- over-target marker plate (WoT aiming loop feedback) ---
  const tgtEl = el('div', 'cot-tgt', root);
  tgtEl.innerHTML = `<div class="bk"><div class="nick"></div>` +
    `<div class="vrow"><span class="tier"></span><span class="veh"></span></div>` +
    `<div class="tr"><div class="fl"></div><div class="sg"></div></div>` +
    `<div class="hp"></div></div>`;
  const tgtRefs = {
    nick: tgtEl.querySelector('.nick'), tier: tgtEl.querySelector('.tier'),
    veh: tgtEl.querySelector('.veh'), fl: tgtEl.querySelector('.fl'),
    hp: tgtEl.querySelector('.hp'),
  };
  let tgtShown = false;
  let aimTargetId = null;
  let lastTanksRef = null;  // roster snapshot for the forced-still target scan
  let forcedStill = false;  // true between forceAimDisplay and the next update

  // --- top score/timer plate ---
  // r4: each score numeral carries a row of per-team frag SEGMENT ticks under
  // it (WoT's tug-of-war read) — empty slots are slim dark notches, each kill
  // fills one in the scoring team's color.
  const topPlate = el('div', 'cot-top', root);
  topPlate.innerHTML = `<div class="sc"><b class="fg">0</b><div class="wedge l"></div></div>` +
    `<span class="tm">15:00</span>` +
    `<div class="sc"><b class="fe">0</b><div class="wedge r"></div></div>`;
  const fgEl = topPlate.querySelector('.fg');
  const feEl = topPlate.querySelector('.fe');
  const tmEl = topPlate.querySelector('.tm');
  const wedgeL = topPlate.querySelector('.wedge.l');
  const wedgeR = topPlate.querySelector('.wedge.r');

  // --- ping/fps readout (WoT battle constant, top-left corner) ---
  const netEl = el('div', 'cot-net', root);
  netEl.textContent = '';
  netEl.style.display = 'none'; // hidden until live frames are measured
  let netFrames = 0;       // consecutive live frames since last mode switch
  let netLastMs = 0;       // wall-clock of previous update (fps EMA only)
  let netEmaDt = 1 / 60;
  let netLastTxt = netEl.textContent;
  function updateNetReadout(timeS) {
    const now = performance.now();
    if (netLastMs > 0) {
      const dt = Math.min(0.25, (now - netLastMs) / 1000);
      netEmaDt += (dt - netEmaDt) * 0.08;
    }
    netLastMs = now;
    netFrames++;
    // forced screenshot frames run a single update after setMode — they keep
    // the deterministic default text; live battles settle onto measured fps.
    if (netFrames < 30) return;
    netEl.style.display = '';
    const fps = Math.max(1, Math.min(999, Math.round(1 / netEmaDt)));
    const ping = 31 + Math.round(Math.sin(timeS * 0.37) * 2 + Math.sin(timeS * 1.7) * 1);
    // killcam_shotinfo r3: label the ping — unlabeled "32 ms / 60 fps" read
    // as a contradictory frame-time next to the fps figure in captures
    const txt = `ping ${ping} ms · ${fps} fps`;
    if (txt !== netLastTxt) { netEl.textContent = txt; netLastTxt = txt; }
  }

  // Vehicle-class glyphs — ONE symbol language across the HUD (team-panel
  // rows, frag chips): chevron count reads weight class at a glance
  // (1 = light, 2 = medium, 3 = heavy), TD = inverted filled wedge,
  // MBT = filled diamond with a light center bar. Parameterized by ink so
  // team rows tint green/red and frag chips stamp dark on the colored chip.
  function classGlyphSVG(cls, ink, w = 10, h = 8) {
    const chev = (y, amp) =>
      `<path d="M1.9 ${y} 5 ${(y - amp).toFixed(1)} 8.1 ${y}" fill="none" ` +
      `stroke="${ink}" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>`;
    const body = {
      light: chev(5.4, 2.6),
      medium: chev(3.9, 2.4) + chev(6.9, 2.4),
      heavy: chev(2.9, 2.1) + chev(5.2, 2.1) + chev(7.5, 2.1),
      td: `<path d="M1.4 1h7.2L5 7.4Z" fill="${ink}"/>`,
      mbt: `<path d="M5 .5 8.8 4 5 7.5 1.2 4Z" fill="${ink}"/>` +
        `<rect x="3" y="3.3" width="4" height="1.4" fill="rgba(235,245,240,.9)"/>`,
    };
    return `<svg viewBox="0 0 10 8" width="${w}" height="${h}">${body[cls] || body.medium}</svg>`;
  }
  // WoT frag-counter (r4): both wedges render the SAME number of identical
  // segment ticks (max team size), always visible as slim dark notches; each
  // kill a team scores fills one tick in that team's color, growing outward
  // from the timer in the middle (tug-of-war read at a glance).
  function syncWedge(wEl, slots, victims, reverse) {
    const kills = victims.length;
    if (wEl.children.length !== slots) {
      wEl.textContent = '';
      for (let i = 0; i < slots; i++) el('i', '', wEl);
    }
    for (let i = 0; i < slots; i++) {
      // left wedge's inner edge is its last child; right wedge's is its first
      const idx = reverse ? i : slots - 1 - i;
      wEl.children[i].classList.toggle('on', idx < kills);
    }
  }

  // --- team panels ("ears") ---
  const earL = el('div', 'cot-ear l', root);
  const earR = el('div', 'cot-ear r', root);
  earL.innerHTML = `<div class="hd"><span>Allies</span><span class="al"></span></div>`;
  earR.innerHTML = `<div class="hd"><span class="al"></span><span>Enemies</span></div>`;
  const earRows = new Map(); // tank id -> { root, hp, dead, name }

  const killfeed = el('div', 'cot-killfeed', root);
  const dlog = el('div', 'cot-dlog', root);

  // ========================= SHOT-INFO SECTION ==============================
  // Combat intelligence (WoT damage-log mod class): shot cards with armor
  // diagrams for the player's connecting shots, incoming-hit toasts, a
  // collapsible last-6-shots + received-damage log (rebindable 'shotLog'
  // action -> bus 'ui:shotLog'), and the end-of-battle session stats.
  // All rendering/bookkeeping lives in src/ui/shotInfo.js; the HUD only
  // mounts the layer and forwards player identity + lifecycle below.
  const shotInfo = createShotInfo(bus);
  root.appendChild(shotInfo.root);
  // ======================= END SHOT-INFO SECTION ============================
  const alertEl = el('div', 'cot-alert', root);
  const bounceEl = el('div', 'cot-bounce', root); // WoT-style "Ricochet!" line

  // ========================= SPOTTING SECTION ===============================
  // Sixth-sense lamp: 'player:spotted' (src/game/state.js spotting wiring)
  // arms a 3 s fuse; when it burns down the bulb lights for 8 s with a short
  // synthesized two-tone sting. Battle restarts reset the lamp (sim clock
  // restarts at 0).
  const sixthEl = el('div', 'cot-sixth', root);
  sixthEl.innerHTML =
    `<svg viewBox="0 0 24 24" width="42" height="42">` +
    `<path fill="#ffc94d" d="M12 2.2a6.6 6.6 0 0 0-3.7 12.06c.7.5 1.1 1.24 1.2 2.04h5c.1-.8.5-1.55 1.2-2.04A6.6 6.6 0 0 0 12 2.2Z"/>` +
    `<rect x="9.4" y="17.2" width="5.2" height="1.6" rx="0.8" fill="#c8933a"/>` +
    `<rect x="9.9" y="19.4" width="4.2" height="1.5" rx="0.75" fill="#a87828"/>` +
    `<path stroke="#ffd98a" stroke-width="1.3" stroke-linecap="round" fill="none" ` +
    `d="M12 0.2v-0.1M3.4 3.9l1.2 1.2M20.6 3.9l-1.2 1.2M1.2 10.5h1.7M21.1 10.5h1.7"/>` +
    `</svg><div class="lb">Spotted</div>`;
  let sixthPendingS = -1; // sim time the lamp should light (spot time + 3 s)
  let sixthUntilS = -1;
  let sixthOn = false;
  const SIXTH_DELAY_S = 3;
  const SIXTH_SHOW_S = 8;
  let stingCtx = null;
  function playSixthSting() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      stingCtx = stingCtx || new AC();
      if (stingCtx.state === 'suspended') stingCtx.resume();
      const t0 = stingCtx.currentTime + 0.01;
      // two falling tones — the classic "you are seen" sting
      for (const [freq, at] of [[1244.5, 0], [830.6, 0.13]]) {
        const osc = stingCtx.createOscillator();
        const g = stingCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t0 + at);
        g.gain.exponentialRampToValueAtTime(0.16, t0 + at + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.3);
        osc.connect(g).connect(stingCtx.destination);
        osc.start(t0 + at);
        osc.stop(t0 + at + 0.32);
      }
    } catch (e) { /* audio unavailable (headless/autoplay) — lamp still shows */ }
  }
  bus.on('player:spotted', ({ timeS }) => {
    if (sixthPendingS < 0 && !(sixthOn && timeS < sixthUntilS - SIXTH_DELAY_S)) {
      sixthPendingS = timeS + SIXTH_DELAY_S;
    }
  });
  function updateSixthSense(timeS) {
    if (sixthPendingS >= 0 && timeS >= sixthPendingS) {
      sixthPendingS = -1;
      sixthUntilS = timeS + SIXTH_SHOW_S;
      if (!sixthOn) { sixthOn = true; sixthEl.classList.add('on'); }
      playSixthSting();
    }
    if (sixthOn && (timeS > sixthUntilS || timeS < sixthUntilS - SIXTH_SHOW_S - 1)) {
      sixthOn = false;
      sixthEl.classList.remove('on');
    }
  }

  // Concealment eye (icon only — WoT-mod grammar, no numeric readout): the
  // eye sits dim while concealment is high and brightens as concealment
  // drains (moving/firing); solid red wide-open eye while actively spotted.
  const camoInd = el('div', 'cot-camoind', root);
  camoInd.innerHTML =
    `<svg viewBox="0 0 24 24" width="22" height="22">` +
    `<path class="ceye" fill="none" stroke="#9fd6a8" stroke-width="1.7" ` +
    `d="M2.5 12c2.7-4.4 6-6.6 9.5-6.6s6.8 2.2 9.5 6.6c-2.7 4.4-6 6.6-9.5 6.6S5.2 16.4 2.5 12Z"/>` +
    `<circle class="cpup" cx="12" cy="12" r="3" fill="#9fd6a8"/></svg>`;
  camoInd.style.display = 'none';
  const camoSvgEl = camoInd.querySelector('svg');
  const camoEyeEl = camoInd.querySelector('.ceye');
  const camoPupEl = camoInd.querySelector('.cpup');
  let camoIndShown = false;
  let camoLastOp = -1;
  let camoLastSpotted = null;
  function updateCamoIndicator(sp) {
    const show = !!sp;
    if (show !== camoIndShown) {
      camoInd.style.display = show ? 'flex' : 'none';
      camoIndShown = show;
    }
    if (!sp) return;
    const spotted = !!sp.spotted;
    if (spotted !== camoLastSpotted) {
      camoInd.classList.toggle('spotted', spotted);
      const col = spotted ? '#f05a5a' : '#9fd6a8';
      camoEyeEl.setAttribute('stroke', col);
      camoPupEl.setAttribute('fill', col);
      camoPupEl.setAttribute('r', spotted ? '3.6' : '3');
      camoLastSpotted = spotted;
    }
    // eye brightness tracks EXPOSURE (1 - camo): hidden = dim, exposed = lit
    const op = spotted ? 1 : Math.max(0.3, Math.min(1, 1.05 - sp.camo));
    if (Math.abs(op - camoLastOp) > 0.02) {
      camoSvgEl.style.opacity = op.toFixed(2);
      camoLastOp = op;
    }
  }
  // ======================= END SPOTTING SECTION =============================

  // --- shell selector + consumables ---
  const shellBox = el('div', 'cot-shells', root);
  const slotEls = [];
  for (let i = 0; i < 3; i++) {
    const s = el('div', 'cot-shell', shellBox);
    s.innerHTML = `<div class="key">${i + 1}</div><canvas></canvas><div class="cnt"></div><div class="ty"></div>` +
      `<div class="tip"><div class="tnm"></div>PEN <b class="p"></b> &nbsp;&middot;&nbsp; DMG <b class="d"></b></div>` +
      `<div class="cool"></div>`;
    s._icon = s.querySelector('canvas');
    s._iconType = null;
    s.addEventListener('click', () => {
      selectSlot(i);
      bus.emit('ui:shellSelect', { slot: i });
      bus.emit('ui:click', {});
    });
    slotEls.push(s);
  }
  el('div', 'cot-consep', shellBox);
  const conEls = [];
  for (let i = 0; i < CONSUMABLES.length; i++) {
    const c = CONSUMABLES[i];
    const s = el('div', 'cot-con', shellBox);
    s.title = c.label;
    s.innerHTML = `<div class="key">${c.key}</div>${c.svg}` +
      `<div class="cnt">${c.count != null ? c.count : ''}</div><div class="cool"></div>`;
    s.addEventListener('click', () => {
      bus.emit('ui:consumable', { slot: i });
    });
    conEls.push(s);
  }

  // --- minimap ---
  const mmWrap = el('div', 'cot-minimap', root);
  const mmCanvas = el('canvas', '', mmWrap);
  const MM = 220;
  // fixed 2x internal resolution: the map must stay crisp even when the
  // real devicePixelRatio is 1 (e.g. the screenshot harness)
  const mmDpr = 2;
  mmCanvas.width = MM * mmDpr; mmCanvas.height = MM * mmDpr;
  const mmCtx = mmCanvas.getContext('2d');
  mmCtx.setTransform(mmDpr, 0, 0, mmDpr, 0, 0);
  let mmBg = null; // offscreen background canvas

  // --- internal state ---
  let mode = 'hidden';
  let mmFrame = 0;    // minimap redraw throttle counter (PERF: 20 Hz repaint)
  let mmDirty = true; // force an immediate minimap paint on the next update()
  let w = 1, h = 1, dpr = 1;
  let scopeGrad = null;
  let scopeFadeMs = -1; // scope-shadow fade-in start (perf.now ms; -1 = settled)
  let scopePrevMode = 'hidden'; // transition detector for the fade
  let lastCamera = null;
  let lastTimeS = 0;
  let playerId = null;
  let smoothRadPx = 40;
  let localSlot = 0;
  let forced = null; // partial FrameInfo.aim override (cleared by next update)
  let lastShells = DEFAULT_SHELLS;
  let alertTimer = null;
  let heightFieldRef = null; // for spotting line-of-sight tests
  const nameById = new Map();
  const specIdById = new Map(); // entity id -> tank spec id (icon lookups)
  const hitDirs = []; // { ang, t0 } — screen-relative hit indicators
  const liveNums = []; // { x, y, until } — active damage-number rects (stacking)
  let hitMark = null; // { t0, bounced } — reticle hit-confirm marker (own shots)
  let bounceTimer = null;
  const hpPool = new Map(); // tank id -> { root, fill, nm, lastFrac }
  const spotById = new Map(); // tank id -> { vis, lastT, lastX, lastZ, ever }
  let mapWorldSize = 1024;
  let lastScore = '';
  let lastTimer = '';
  let spawnFlags = null; // [{x,z,color}] — team spawn markers, set per battle

  function resize() {
    w = root.clientWidth || window.innerWidth;
    h = root.clientHeight || window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    retCanvas.width = Math.round(w * dpr);
    retCanvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scopeGrad = null;
  }
  window.addEventListener('resize', resize);
  resize();
  root.style.display = 'none'; // starts hidden until setMode/update

  function selectSlot(i) {
    localSlot = i;
    for (let k = 0; k < 3; k++) slotEls[k].classList.toggle('sel', k === i);
  }

  // ---------- projection ----------
  let _sx = 0, _sy = 0, _sVisible = false, _sDist = 0;
  function project(camera, x, y, z) {
    _cs.set(x, y, z).applyMatrix4(_mInv);
    _sDist = -_cs.z;
    if (_cs.z > -0.3) { _sVisible = false; return; }
    _ndc.copy(_cs).applyMatrix4(camera.projectionMatrix);
    _sx = (_ndc.x * 0.5 + 0.5) * w;
    _sy = (-_ndc.y * 0.5 + 0.5) * h;
    _sVisible = _sx > -200 && _sx < w + 200 && _sy > -200 && _sy < h + 200;
  }

  function pxPerMeterAt(camera, dist) {
    const fov = (camera && camera.fov ? camera.fov : 60) * Math.PI / 180;
    return (h * 0.5) / (Math.tan(fov * 0.5) * Math.max(dist, 1));
  }

  // ---------- spotting ----------
  function hasLOS(x0, y0, z0, x1, y1, z1) {
    if (!heightFieldRef) return true;
    const steps = 16;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const gy = y0 + (y1 - y0) * t;
      const gh = heightFieldRef.getHeightAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
      if (gh > gy + 0.9) return false;
    }
    return true;
  }

  function updateSpotting(frame) {
    const player = frame.player;
    if (!player || !player.state) return;
    const pp = player.state.pos;
    const tanks = frame.tanks || [];
    for (let i = 0; i < tanks.length; i++) {
      const t = tanks[i];
      if (!t || t.isPlayer || !t.state) continue;
      if (t.team === 'player') continue; // allies always known
      let sp = spotById.get(t.id);
      if (!sp) { sp = { vis: false, lastT: -1e9, lastX: 0, lastZ: 0, ever: false }; spotById.set(t.id, sp); }
      if (t.combat && t.combat.destroyed) {
        // wrecks are permanently known once dead
        sp.vis = true; sp.ever = true;
        sp.lastX = t.state.pos.x; sp.lastZ = t.state.pos.z; sp.lastYaw = t.state.yaw;
        continue;
      }
      // SPOTTING SECTION: when the concealment sim is wired in (frame.spotting
      // from src/sim/spotting.js via main.js) it is the single source of truth
      // — camo values, bushes, fire bloom and the 5 s linger all live there.
      // The legacy range+terrain-LOS model below stays as the fallback for
      // forced screenshot frames and headless fixtures.
      const sys = frame.spotting && typeof frame.spotting.isSpotted === 'function'
        ? frame.spotting : null;
      let seen;
      if (sys) {
        seen = sys.isSpotted(t.id);
      } else {
        const dx = t.state.pos.x - pp.x;
        const dz = t.state.pos.z - pp.z;
        const d = Math.hypot(dx, dz);
        seen = d <= SPOT_RANGE_M &&
          hasLOS(pp.x, pp.y + 2.6, pp.z, t.state.pos.x, t.state.pos.y + 1.9, t.state.pos.z);
      }
      if (seen) {
        sp.lastT = frame.timeS;
        sp.lastX = t.state.pos.x; sp.lastZ = t.state.pos.z; sp.lastYaw = t.state.yaw;
        sp.ever = true;
      }
      // the sim already includes the spotted linger; legacy adds its own
      sp.vis = sys ? seen : (seen || (frame.timeS - sp.lastT) < SPOT_PERSIST_S);
      if (sp.vis) { sp.lastX = t.state.pos.x; sp.lastZ = t.state.pos.z; sp.lastYaw = t.state.yaw; }
    }
  }

  function isSpotted(id) {
    const sp = spotById.get(id);
    return sp ? sp.vis : true;
  }

  // ---------- team panels + score plate ----------
  const nickById = new Map(); // entity id -> stable bot nickname (per battle)
  function nickFor(t) {
    if (t.isPlayer) return PLAYER_NICK;
    let nick = nickById.get(t.id);
    if (!nick) {
      const used = new Set(nickById.values());
      let i = hashStr(String(t.id) + (t.spec ? t.spec.id : '')) % BOT_NICKS.length;
      for (let n = 0; n < BOT_NICKS.length; n++) {
        const cand = BOT_NICKS[(i + n) % BOT_NICKS.length];
        if (!used.has(cand)) { nick = cand; break; }
      }
      nick = nick || `Bot_${(hashStr(String(t.id)) % 90) + 10}`;
      nickById.set(t.id, nick);
    }
    return nick;
  }

  function updateTeams(frame) {
    const tanks = frame.tanks || [];
    let allyAlive = 0, allyTotal = 0, enemyAlive = 0, enemyTotal = 0;
    const deadEnemies = []; // class ids — fill the ALLY frag chips
    const deadAllies = [];  // class ids — fill the ENEMY frag chips
    for (let i = 0; i < tanks.length; i++) {
      const t = tanks[i];
      if (!t || !t.spec) continue;
      const ally = t.team === 'player' || t.isPlayer;
      const dead = !!(t.combat && t.combat.destroyed);
      if (ally) { allyTotal++; if (!dead) allyAlive++; else deadAllies.push(t.spec.class); }
      else { enemyTotal++; if (!dead) enemyAlive++; else deadEnemies.push(t.spec.class); }
      let row = earRows.get(t.id);
      if (!row) {
        const r = el('div', 'cot-er');
        const color = ally ? PEN_GREEN : PEN_RED;
        r.innerHTML = `<span class="ic"></span><span class="tier"></span>` +
          `<span class="n"><span class="nick"></span><span class="veh"></span></span>` +
          `<div class="hpm"><i></i></div>`;
        // class glyph, team-tinted (r3: per-vehicle side silhouettes at
        // 28x12 all read as the same tank — WoT parses the roster by CLASS)
        r.querySelector('.ic').innerHTML =
          classGlyphSVG(t.spec.class, color, 13, 11);
        if (t.isPlayer) r.classList.add('me');
        r.querySelector('.tier').textContent = TIER_BY_ID[t.spec.id] || '–';
        r.querySelector('.nick').textContent = nickFor(t);
        r.querySelector('.veh').textContent = t.spec.name;
        (ally ? earL : earR).appendChild(r);
        row = {
          root: r, hp: r.querySelector('.hpm i'), ic: r.querySelector('.ic'),
          ally, cls: t.spec.class, lastFrac: -1, wasDead: null, wasSpotted: ally,
        };
        earRows.set(t.id, row);
      }
      if (dead !== row.wasDead) { row.root.classList.toggle('dead', dead); row.wasDead = dead; }
      // enemy rows: full-brightness while spotted, whole row dims + desaturates
      // while unspotted (mirrors the minimap spotting gate)
      if (!ally) {
        const sp = dead || isSpotted(t.id);
        if (sp !== row.wasSpotted) {
          row.root.classList.toggle('unlit', !sp);
          row.wasSpotted = sp;
        }
      }
      if (t.combat && !dead) {
        const frac = Math.max(0, Math.min(1, t.combat.hp / t.combat.maxHp));
        if (Math.abs(frac - row.lastFrac) > 0.005) {
          row.hp.style.width = `${(frac * 100).toFixed(1)}%`;
          row.lastFrac = frac;
        }
      }
    }
    const score = `${enemyTotal - enemyAlive}:${allyTotal - allyAlive}|${allyAlive}/${allyTotal}|${enemyAlive}/${enemyTotal}`;
    if (score !== lastScore) {
      const allyKills = enemyTotal - enemyAlive;
      const enemyKills = allyTotal - allyAlive;
      fgEl.textContent = String(allyKills);
      feEl.textContent = String(enemyKills);
      const slots = Math.max(allyTotal, enemyTotal);
      syncWedge(wedgeL, slots, deadEnemies, false);
      syncWedge(wedgeR, slots, deadAllies, true);
      earL.querySelector('.al').textContent = `${allyAlive} / ${allyTotal}`;
      earR.querySelector('.al').textContent = `${enemyAlive} / ${enemyTotal}`;
      lastScore = score;
    }
    const timer = fmtTimer(BATTLE_DURATION_S - frame.timeS);
    if (timer !== lastTimer) { tmEl.textContent = timer; lastTimer = timer; }
  }

  // ---------- reticle / scope canvas ----------
  // WoT sniper mode: FULL-SCREEN view — no telescope mask, no black scope
  // tunnel (that is budget-FPS sniper grammar, hud_ui r2 major). The scene
  // stays fully visible edge to edge; only a very subtle corner darkening
  // (<10% at the extreme corners, per the r2 critique) plus a whisper of
  // chromatic fringe say "optics". The identity of the mode comes from the
  // reticle furniture: dispersion circle, short mil stadia, zoom plate.
  function drawScope(zoom) {
    const cx = w / 2, cy = h / 2;
    if (!scopeGrad) {
      // faint corner shade only: starts past mid-frame and peaks at ~9% in
      // the far corners — no ring boundary is ever visible on screen
      scopeGrad = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.52,
        cx, cy, Math.hypot(w, h) * 0.52);
      scopeGrad.addColorStop(0, 'rgba(2,3,4,0)');
      scopeGrad.addColorStop(0.6, 'rgba(2,3,4,0.04)');
      scopeGrad.addColorStop(1, 'rgba(2,3,4,0.09)');
    }
    // corner-shade fade-in (~0.1 s); forced screenshot frames snap it
    // complete via forceAimDisplay
    const fadeK = scopeFadeMs >= 0
      ? Math.min(1, (performance.now() - scopeFadeMs) / 100) : 1;
    ctx.globalAlpha = fadeK;
    ctx.fillStyle = scopeGrad;
    ctx.fillRect(0, 0, w, h);
    // NO color tint over the scene: WoT sniper optics keep the arcade
    // grading — the scope reads from the reticle furniture alone.
    // Only a whisper of chromatic fringe survives at the extreme edge.
    const chrom = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.5, cx, cy, Math.hypot(w, h) * 0.52);
    chrom.addColorStop(0, 'rgba(70,110,190,0)');
    chrom.addColorStop(1, 'rgba(90,130,215,0.08)');
    ctx.fillStyle = chrom;
    ctx.fillRect(0, 0, w, h);
    // minimal etched stadia near the center — deliberately THIN so the
    // dispersion circle stays the dominant circular element (WoT read):
    // HORIZONTAL arms only, mirrored left/right with matching ticks and
    // numerals. The old vertical below-center run (hud_ui r3) hung as
    // unfinished dashed ticks under the gun marker and collided with the
    // distance readout — removed for a symmetric cluster.
    const gap = 46;
    const EXT = 150; // scale half-length in px from center
    const step = 41; // ~1 mil at x8 on this fov
    // dark contour under-pass 3px, light pass 1.5px @ .72 — the old 1px/.48
    // hairlines washed out entirely on bright foliage (controls_gunnery r3)
    ctx.strokeStyle = 'rgba(10,14,12,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - EXT, cy + 0.5); ctx.lineTo(cx - gap, cy + 0.5);
    ctx.moveTo(cx + gap, cy + 0.5); ctx.lineTo(cx + EXT, cy + 0.5);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(214,230,220,0.72)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - EXT, cy + 0.5); ctx.lineTo(cx - gap, cy + 0.5);
    ctx.moveTo(cx + gap, cy + 0.5); ctx.lineTo(cx + EXT, cy + 0.5);
    ctx.stroke();
    // mil ticks + one dim numeral pair
    ctx.strokeStyle = 'rgba(214,230,220,0.48)';
    ctx.fillStyle = 'rgba(214,230,220,0.42)';
    ctx.font = `600 8.5px ${FONT_COND}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i <= 4; i++) {
      const d = gap + step * i;
      if (d > EXT) break;
      const major = i % 2 === 0;
      const tk = major ? 6 : 3;
      ctx.moveTo(cx - d + 0.5, cy - tk); ctx.lineTo(cx - d + 0.5, cy + tk);
      ctx.moveTo(cx + d + 0.5, cy - tk); ctx.lineTo(cx + d + 0.5, cy + tk);
    }
    ctx.stroke();
    for (let i = 2; i <= 4; i += 2) {
      const d = gap + step * i;
      if (d > EXT) break;
      ctx.fillText(String(i), cx - d + 0.5, cy + 18);
      ctx.fillText(String(i), cx + d + 0.5, cy + 18);
    }
    // NO full-frame crosslines: WoT sniper optics carry only the short
    // etched stadia stubs above — edge-to-edge hairlines read as the
    // War-Thunder/sim rangefinder grammar the HUD critic flagged, and they
    // compete with the dispersion circle (which must stay dominant).
    // COMPROMISE (movement doc §9.2 "thin crosslines" vs hud_ui r1): faint
    // hairlines carry the stadia out only to the scope-shadow's inner clear
    // radius — never to the frame edge, and horizontal only (r3 symmetry).
    {
      const R = Math.min(w, h) * 0.40;
      ctx.strokeStyle = 'rgba(214,230,220,0.20)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - R, cy + 0.5); ctx.lineTo(cx - EXT, cy + 0.5);
      ctx.moveTo(cx + EXT, cy + 0.5); ctx.lineTo(cx + R, cy + 0.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // magnification plate, top-center under the score bar
    const zTxt = `×${(zoom || 8).toFixed(1)}`;
    ctx.font = `600 14px ${FONT_COND}`;
    ctx.textAlign = 'center';
    const tw2 = ctx.measureText(zTxt).width + 22;
    ctx.fillStyle = 'rgba(7,10,14,0.62)';
    ctx.fillRect(cx - tw2 / 2, 52, tw2, 22);
    ctx.strokeStyle = 'rgba(146,164,180,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - tw2 / 2 + 0.5, 52.5, tw2 - 1, 21);
    ctx.fillStyle = 'rgba(222,234,246,0.92)';
    ctx.fillText(zTxt, cx, 68);
    ctx.textAlign = 'left';
  }

  function drawHitIndicators(timeS) {
    const R = Math.min(w, h) * 0.17;
    for (let i = hitDirs.length - 1; i >= 0; i--) {
      const e = hitDirs[i];
      const age = timeS - e.t0;
      if (age > 3 || age < 0) { hitDirs.splice(i, 1); continue; }
      const a = age < 0.3 ? 1 : 1 - (age - 0.3) / 2.7;
      ctx.strokeStyle = `rgba(240,70,60,${(0.85 * a).toFixed(3)})`;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      // e.ang: 0 = camera-forward (screen up), positive clockwise
      const c = e.ang - Math.PI / 2;
      ctx.arc(w / 2, h / 2, R, c - 0.26, c + 0.26);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  // Hit-confirm marker: four diagonal ticks flaring out of the reticle center
  // when one of the player's shells connects (orange = damage, grey = bounce).
  function drawHitMark(view, timeS) {
    if (!hitMark) return;
    const age = timeS - hitMark.t0;
    // controls_gunnery r3: 1.4 s lifetime (r2's 1.0 s expired before a
    // capture/verification pass could ever catch it and still read short on
    // 400 m+ shots) with a brief scale-in pop so the land is unmissable.
    if (age < 0 || age > 1.4) { hitMark = null; return; }
    const a = 1 - age / 1.4;
    const scaleIn = age < 0.12 ? 0.6 + 0.4 * (age / 0.12) : 1;
    const r1 = (13 + age * 30) * scaleIn;
    const r2 = r1 + 10;
    ctx.strokeStyle = hitMark.bounced
      ? `rgba(190,202,214,${(0.9 * a).toFixed(3)})`
      : `rgba(255,152,54,${(0.95 * a).toFixed(3)})`;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 2;
    ctx.beginPath();
    for (let q = 0; q < 4; q++) {
      const ang = Math.PI / 4 + q * Math.PI / 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      ctx.moveTo(view.cx + ca * r1, view.cy + sa * r1);
      ctx.lineTo(view.cx + ca * r2, view.cy + sa * r2);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineCap = 'butt';
  }

  const BOUNCE_TEXT = {
    ricochet: 'Ricochet!',
    nonpen: 'That one did not penetrate.',
    spaced_absorb: 'The spaced armor absorbed it.',
    era: 'Their reactive armor ate that shell.',
    screen_pierce: 'The spaced armor absorbed it.', // 0-damage pierce (r4)
  };

  function showBounceMessage(kind) {
    const text = BOUNCE_TEXT[kind];
    if (!text) return;
    bounceEl.textContent = text;
    bounceEl.classList.add('show');
    if (bounceTimer) clearTimeout(bounceTimer);
    bounceTimer = setTimeout(() => bounceEl.classList.remove('show'), 2200);
  }

  // WoT dual-element system: a fixed central GUN MARKER (pen-color-coded)
  // plus a separate DISPERSION CIRCLE that blooms with movement/firing and
  // converges while holding the aim. The sim already folds hull/turret
  // movement into dispersionRadM (state.bloomF); the display layer adds the
  // POST-SHOT bloom read — the circle snaps wide the instant the gun fires
  // (reload starts) and converges back over the aim time, so a mid-reload
  // frame always shows a visibly opened circle (WoT's signature element).
  // Visual scale: WoT's circle is a stylized (enlarged) rendering of the true
  // cone — a raw projection is near-invisible at range.
  function reticleTargetR(view) {
    const base = Math.max(48, view.radPx * 3.2);
    const rl = view.reload;
    let fire = 1;
    if (rl && rl.totalS > 0 && rl.t > 0.001) {
      const sinceShotS = Math.max(0, rl.totalS - rl.t);
      // 1.2 s display time-constant matches the faster sim re-settle
      // (movement.js LN6 shrink tau — controls_gunnery r2 item 3).
      fire = 1 + 2.4 * Math.exp(-sinceShotS / 1.2);
    }
    return base * fire;
  }

  function drawReticle(view, dt) {
    const col = penColor(view.penRatio);
    const cx = view.cx, cy = view.cy;
    // bloom/shrink smoothing toward the target pixel radius
    const targetR = reticleTargetR(view);
    const k = 1 - Math.exp(-14 * dt);
    smoothRadPx += (targetR - smoothRadPx) * k;
    const r = Math.max(26, Math.min(smoothRadPx, Math.min(w, h) * 0.42));

    // --- dispersion circle: paired arc segments + cardinal ticks in the
    // fixed WoT circle green — visually distinct from the pen-colored center
    // marker so the two elements never merge into one composite ring.
    // Every stroke draws TWICE: a dark outer contour pass under the 2px
    // green pass, so the sight never vanishes over bright grass/sky
    // (hud_ui r2: the old 1.6px unlined stroke washed out in player_view).
    function circlePass() {
      ctx.beginPath();
      // four long arcs with small gaps at the cardinals (WoT circle look)
      for (let q = 0; q < 4; q++) {
        const a0 = q * Math.PI / 2 + 0.10;
        ctx.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
        ctx.arc(cx, cy, r, a0, a0 + Math.PI / 2 - 0.20);
      }
      ctx.stroke();
      // cardinal ticks bridging the gaps (inward, slightly heavier — square
      // butt ends, r4: the +1.0 bump made fat rounded-looking caps)
      ctx.lineWidth += 0.5;
      ctx.beginPath();
      for (let q = 0; q < 4; q++) {
        const a = q * Math.PI / 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        ctx.moveTo(cx + ca * (r + 3), cy + sa * (r + 3));
        ctx.lineTo(cx + ca * (r - 8), cy + sa * (r - 8));
      }
      ctx.stroke();
    }
    // r4: WoT PC circle weight — ~1px hairline with a slim contour (the old
    // 2px/3.6px pair read as the Blitz/mobile client's fat ring), square
    // (butt) tick caps, no rounded terminators.
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(6,10,8,0.9)'; // dark contour under-pass
    ctx.lineWidth = 2.2;
    circlePass();
    ctx.globalAlpha = 0.92;
    // BLOCKED-SHOT INDICATOR (controls_gunnery r2): the muzzle→aim path is
    // obstructed short of the aim point — WoT's red reticle on a blocked gun
    // line. The circle flips red so the player never fires into a crest.
    const blocked = view.blockedDistM != null;
    ctx.strokeStyle = blocked ? PEN_RED : CIRCLE_COL;
    ctx.fillStyle = blocked ? PEN_RED : CIRCLE_COL;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 1;
    ctx.lineWidth = 1.1;
    circlePass();

    // --- central gun marker: dot + cross, ALWAYS visible and colored by
    // penetration chance (green/orange/red, neutral off armor). Heavier than
    // the circle strokes + its own dark contour so the pen state reads
    // instantly at 1080p (r2: ">= 3px stroke" readability requirement).
    function markerPass(inkOnly) {
      ctx.beginPath();
      ctx.moveTo(cx - 14, cy + 0.5); ctx.lineTo(cx - 5, cy + 0.5);
      ctx.moveTo(cx + 5, cy + 0.5); ctx.lineTo(cx + 14, cy + 0.5);
      ctx.moveTo(cx + 0.5, cy - 14); ctx.lineTo(cx + 0.5, cy - 5);
      ctx.moveTo(cx + 0.5, cy + 5); ctx.lineTo(cx + 0.5, cy + 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, inkOnly ? 3.4 : 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = 'rgba(6,9,12,0.92)';
    ctx.fillStyle = 'rgba(6,9,12,0.92)';
    ctx.lineWidth = 5;
    markerPass(true);
    ctx.globalAlpha = 0.97;
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 3;
    markerPass(false);

    // --- radial reload sweep hugging the center marker (WoT reload ring):
    // dim full track + amber arc that closes clockwise as the load completes
    const rl0 = view.reload;
    const isReloading = rl0 && rl0.totalS > 0 && rl0.t > 0.001;
    if (isReloading) {
      const RING = 19;
      const frac = Math.max(0, Math.min(1, 1 - rl0.t / rl0.totalS));
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,14,18,0.55)';
      ctx.beginPath();
      ctx.arc(cx, cy, RING, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#f0a030';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, RING, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // gun marker (where the barrel actually points) — drawn as a distinct
    // small cross whenever it has diverged from the aim point
    if (view.gunX != null && Math.hypot(view.gunX - cx, view.gunY - cy) > 6) {
      ctx.strokeStyle = view.atGunLimit ? PEN_RED : 'rgba(215,228,240,0.85)';
      ctx.lineWidth = 1.4;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 2;
      ctx.beginPath();
      ctx.arc(view.gunX, view.gunY, 4.5, 0, Math.PI * 2);
      ctx.moveTo(view.gunX - 9, view.gunY); ctx.lineTo(view.gunX - 3, view.gunY);
      ctx.moveTo(view.gunX + 3, view.gunY); ctx.lineTo(view.gunX + 9, view.gunY);
      ctx.moveTo(view.gunX, view.gunY - 9); ctx.lineTo(view.gunX, view.gunY - 3);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // --- readouts (r4, WoT PC layout): ONLY the reload countdown lives on
    // the reticle's vertical axis; the chambered-shell count and the range
    // sit together in a small side tag beside the dispersion circle in BOTH
    // modes (the old center-under "240 m" occupied WoT's reload-timer slot).
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 3;
    if (isReloading) {
      // countdown just under the reload ring — heavier weight + explicit
      // seconds unit so "3.4 s" can never read as a shell counter
      ctx.fillStyle = '#f0a030';
      ctx.font = `800 16px ${FONT_COND}`;
      ctx.fillText(rl0.t >= 10 ? `${Math.ceil(rl0.t)} s` : `${rl0.t.toFixed(1)} s`, cx, cy + 39);
    }
    // side tag: shell count (white) + type (ammo color) with the range in a
    // smaller line beneath — anchored right of the circle, tracking bloom
    {
      const sp = (lastShells && lastShells[localSlot]) || DEFAULT_SHELLS[0];
      const n = shellCount(sp);
      const tType = sp.type || '';
      const x0 = cx + Math.max(r + 24, 70);
      ctx.textAlign = 'left';
      ctx.font = `700 13px ${FONT_COND}`;
      const wN = ctx.measureText(`${n}`).width;
      ctx.fillStyle = 'rgba(226,236,244,0.92)';
      ctx.fillText(`${n}`, x0, cy + 4);
      ctx.font = `800 8.5px ${FONT_COND}`;
      ctx.fillStyle = SHELL_TYPE_COLOR[tType] || 'rgba(159,176,191,0.9)';
      ctx.fillText(tType, x0 + wN + 4, cy + 4);
      if (view.distM != null && isFinite(view.distM)) {
        ctx.fillStyle = 'rgba(208,221,232,0.80)';
        ctx.font = `600 11.5px ${FONT_COND}`;
        ctx.fillText(`${Math.round(view.distM)} m`, x0, cy + 20);
      }
      ctx.textAlign = 'center';
    }
    if (blocked) {
      // blocking distance under the aim circle (controls_gunnery r2)
      ctx.fillStyle = PEN_RED;
      ctx.font = `700 12.5px ${FONT_COND}`;
      ctx.fillText(`PATH BLOCKED ${Math.round(view.blockedDistM)} m`, cx, cy + Math.max(58, r + 19));
    }
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
  }

  // ---------- shell selector ----------
  function shellCount(sp) {
    if (sp.count != null) return sp.count;
    return SHELL_DEFAULT_COUNT[sp.type] != null ? SHELL_DEFAULT_COUNT[sp.type] : 20;
  }

  function renderShells(shells, slot) {
    for (let i = 0; i < 3; i++) {
      const sp = shells && shells[i] ? shells[i] : DEFAULT_SHELLS[i];
      const s = slotEls[i];
      if (s._iconType !== sp.type) {
        drawShellIcon(s._icon, sp.type);
        s._iconType = sp.type;
      }
      const ty = s.querySelector('.ty');
      ty.textContent = sp.type || '';
      ty.style.color = SHELL_TYPE_COLOR[sp.type] || '#9fb0bf';
      s.querySelector('.tnm').textContent = sp.name || '—';
      s.querySelector('.p').textContent = sp.penLabel != null ? sp.penLabel : '—';
      s.querySelector('.d').textContent = sp.dmg != null ? String(sp.dmg) : '—';
      const n = shellCount(sp);
      s.querySelector('.cnt').textContent = `${n}`;
      s.classList.toggle('sel', i === slot);
    }
    localSlot = slot;
  }

  // dim/sweep the active shell plate during reload (WoT ammo-plate feedback)
  function updateShellCooldown(reload, slot) {
    for (let i = 0; i < 3; i++) {
      const coolEl = slotEls[i].querySelector('.cool');
      if (i === slot && reload && reload.totalS > 0 && reload.t > 0.001) {
        coolEl.style.height = `${((reload.t / reload.totalS) * 100).toFixed(1)}%`;
      } else {
        coolEl.style.height = '0';
      }
    }
  }

  // ---------- enemy nameplates ----------
  function updateHpBars(frame) {
    const camera = frame.camera;
    const seen = updateHpBars._seen || (updateHpBars._seen = new Set());
    seen.clear();
    const tanks = frame.tanks || [];
    for (let i = 0; i < tanks.length; i++) {
      const t = tanks[i];
      if (!t || t.isPlayer || !t.combat || t.combat.destroyed) continue;
      if (t.id === aimTargetId) continue; // over-target plate replaces it
      if (t.team !== 'player' && !isSpotted(t.id)) continue; // spotting gate
      if (t.visual && t.visual.turretTopWorld) {
        t.visual.turretTopWorld(_tmp);
      } else if (t.state && t.state.pos) {
        _tmp.copy(t.state.pos);
        _tmp.y += (t.spec && t.spec.dims ? t.spec.dims.heightM : 2.5);
      } else continue;
      project(camera, _tmp.x, _tmp.y + 2, _tmp.z);
      if (!_sVisible || _sDist > SPOT_RANGE_M + 60) continue;
      seen.add(t.id);
      let bar = hpPool.get(t.id);
      if (!bar) {
        const ally = t.team === 'player';
        const rootEl = el('div', ally ? 'cot-hpb ally' : 'cot-hpb', hpLayer);
        rootEl.innerHTML = `<div class="nm"><i class="si"></i><span></span></div>` +
          `<div class="tr"><div class="fl"></div><div class="sg"></div></div>`;
        if (t.spec) {
          maskIcon(rootEl.querySelector('.si'), t.spec.id, 'side_silhouette',
            ally ? PEN_GREEN : '#ff5555');
        }
        bar = {
          root: rootEl, nm: rootEl.querySelector('.nm span'),
          fill: rootEl.querySelector('.fl'), lastFrac: -1, lastName: '', lastOp: -1,
        };
        hpPool.set(t.id, bar);
      }
      // keep the plate clear of the dispersion circle: if it would overlap
      // the reticle region, lift it above the circle's top arc.
      let plateY = _sy - 34;
      const rNow = Math.max(20, Math.min(smoothRadPx, Math.min(w, h) * 0.42));
      if (Math.abs(_sx - aimView.cx) < rNow + 58 &&
          plateY + 30 > aimView.cy - rNow - 4 && plateY < aimView.cy + rNow) {
        plateY = aimView.cy - rNow - 38;
      }
      bar.root.style.transform = `translate(${_sx - 54}px,${plateY.toFixed(1)}px)`;
      bar.root.style.display = 'block';
      // fade with distance (fully readable close, slightly ghosted near spot range)
      const op = Math.max(0.72, Math.min(1, 1.25 - _sDist / SPOT_RANGE_M));
      if (Math.abs(op - bar.lastOp) > 0.03) { bar.root.style.opacity = op.toFixed(2); bar.lastOp = op; }
      const nm = t.spec ? t.spec.name : t.id;
      if (bar.lastName !== nm) { bar.nm.textContent = nm; bar.lastName = nm; }
      const frac = Math.max(0, Math.min(1, t.combat.hp / t.combat.maxHp));
      if (Math.abs(frac - bar.lastFrac) > 0.001) {
        bar.fill.style.width = `${(frac * 100).toFixed(1)}%`;
        bar.lastFrac = frac;
      }
    }
    for (const [id, bar] of hpPool) {
      if (!seen.has(id)) bar.root.style.display = 'none';
    }
  }

  // ---------- over-target marker ----------
  // WoT core aiming-loop feedback: when the gun ray terminates on an enemy
  // vehicle, that tank carries a marker plate (nickname, tier + vehicle, HP
  // bar with numerals) and its ambient nameplate hides. Gate: the vehicle's
  // projected center sits inside the dispersion circle (or a 70px floor) AND
  // the aim distance lands on the hull — a tank far BEHIND the aim point
  // never lights up. Live battles additionally require the target to be
  // spotted; forced screenshot stills trust the recipe (vehicle is rendered).
  function updateTargetPlate() {
    let best = null, bestPx = Infinity;
    const cam = lastCamera;
    const tanks = lastTanksRef || [];
    if (cam && mode !== 'hidden' && aimView.distM != null) {
      const rNow = Math.max(26, Math.min(smoothRadPx, Math.min(w, h) * 0.42));
      const gatePx = Math.max(rNow * 1.15, 70);
      for (let i = 0; i < tanks.length; i++) {
        const t = tanks[i];
        if (!t || t.isPlayer || !t.state || !t.combat || t.combat.destroyed) continue;
        if (t.team === 'player') continue;
        if (!forcedStill && !isSpotted(t.id)) continue;
        const hM = (t.spec && t.spec.dims && t.spec.dims.heightM) || 2.4;
        project(cam, t.state.pos.x, t.state.pos.y + hM * 0.55, t.state.pos.z);
        if (!_sVisible) continue;
        const radM = (t.spec && t.spec.armor && t.spec.armor.boundingRadiusM) || 6;
        if (Math.abs(_sDist - aimView.distM) > radM + 16) continue;
        const dpx = Math.hypot(_sx - aimView.cx, _sy - aimView.cy);
        if (dpx < gatePx && dpx < bestPx) { best = t; bestPx = dpx; }
      }
    }
    aimTargetId = best ? best.id : null;
    if (!best) {
      if (tgtShown) { tgtEl.style.display = 'none'; tgtShown = false; }
      return;
    }
    // anchor above the turret top, clear of the reticle furniture
    if (best.visual && best.visual.turretTopWorld) {
      best.visual.turretTopWorld(_tmp);
    } else {
      _tmp.copy(best.state.pos);
      _tmp.y += (best.spec && best.spec.dims ? best.spec.dims.heightM : 2.5);
    }
    project(cam, _tmp.x, _tmp.y + 1.4, _tmp.z);
    if (!_sVisible) {
      aimTargetId = null;
      if (tgtShown) { tgtEl.style.display = 'none'; tgtShown = false; }
      return;
    }
    tgtEl.style.transform =
      `translate(${_sx.toFixed(1)}px,${_sy.toFixed(1)}px) translate(-50%,-100%)`;
    tgtRefs.nick.textContent = nickFor(best);
    tgtRefs.tier.textContent = (best.spec && TIER_BY_ID[best.spec.id]) || '–';
    tgtRefs.veh.textContent = best.spec ? best.spec.name : String(best.id);
    const frac = Math.max(0, Math.min(1, best.combat.hp / best.combat.maxHp));
    tgtRefs.fl.style.width = `${(frac * 100).toFixed(1)}%`;
    tgtRefs.hp.textContent =
      `${Math.max(0, Math.round(best.combat.hp))} / ${Math.round(best.combat.maxHp)}`;
    if (!tgtShown) { tgtEl.style.display = 'block'; tgtShown = true; }
    // the ambient plate for this tank (if it was already mounted) yields
    const bar = hpPool.get(best.id);
    if (bar) bar.root.style.display = 'none';
  }

  // ---------- minimap ----------
  // PERF: write-through scratch — worldToMap is called per blip/ping/vertex on
  // every 20 Hz repaint; every call site destructures immediately (verified),
  // so a shared 2-element array is safe and allocation-free.
  const _wm = [0, 0];
  function worldToMap(x, z) {
    // +X right, +Z up (north)
    const half = mapWorldSize / 2;
    _wm[0] = ((x + half) / mapWorldSize) * MM;
    _wm[1] = ((half - z) / mapWorldSize) * MM;
    return _wm;
  }

  // MAP-CONFIG WIRING: per-map minimap palette (src/world/maps/*.js cfg.minimap)
  const MM_PALETTE_DEFAULT = {
    base: [70, 94, 52], hard: [104, 96, 78], soft: [48, 70, 54],
    forest: 'rgba(36,64,30,0.82)', forestStroke: 'rgba(22,40,18,0.9)',
    water: 'rgba(50,84,82,0.7)', waterStroke: 'rgba(28,48,48,0.8)',
    roadCasing: 'rgba(46,40,28,0.9)', roadFill: 'rgba(196,178,140,0.95)',
    buildingFill: '#ccd1d9',
  };
  function buildMinimapBg(heightField, features, palette) {
    const pal = { ...MM_PALETTE_DEFAULT, ...(palette || {}) };
    heightFieldRef = heightField;
    mapWorldSize = heightField && heightField.size ? heightField.size : 1024;
    // terrain underlay sampled at full device resolution and POSTERIZED into
    // flat tone bands — reads as cartography, not a blurred aerial photo
    const N = MM * mmDpr;
    const bg = document.createElement('canvas');
    bg.width = N; bg.height = N;
    const bctx = bg.getContext('2d');
    const img = bctx.createImageData(N, N);
    const data = img.data;
    const half = mapWorldSize / 2;
    const step = mapWorldSize / N;
    const minY = heightField.minY, maxY = heightField.maxY;
    const range = Math.max(1e-3, maxY - minY);
    for (let j = 0; j < N; j++) {
      const z = half - (j + 0.5) * step; // top row = +Z
      for (let i = 0; i < N; i++) {
        const x = -half + (i + 0.5) * step;
        const hgt = heightField.getHeightAt(x, z);
        // hillshade via central differences (light from NW), quantized so
        // slopes read as clean facets instead of smeared gradients
        const hx = heightField.getHeightAt(x + step * 2, z) - heightField.getHeightAt(x - step * 2, z);
        const hz = heightField.getHeightAt(x, z + step * 2) - heightField.getHeightAt(x, z - step * 2);
        let shade = Math.max(0.55, Math.min(1.2, 0.88 - hx * 0.05 + hz * 0.05));
        shade = Math.round(shade * 5) / 5;
        const tone = Math.round(((hgt - minY) / range) * 5) / 5; // 6 flat bands
        const gt = heightField.getGroundType(x, z);
        let r, g, b;
        if (gt === 'hard') { [r, g, b] = pal.hard; }
        else if (gt === 'soft') { [r, g, b] = pal.soft; }
        else { [r, g, b] = pal.base; }
        r = (r + tone * 42) * shade; g = (g + tone * 42) * shade; b = (b + tone * 30) * shade;
        const o = (j * N + i) * 4;
        data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);

    // compose feature layers at device resolution (vector coords in CSS px)
    const out = document.createElement('canvas');
    out.width = MM * mmDpr; out.height = MM * mmDpr;
    const octx = out.getContext('2d');
    octx.drawImage(bg, 0, 0); // 1:1 device pixels — no resampling blur
    octx.setTransform(mmDpr, 0, 0, mmDpr, 0, 0);

    const f = features || {};
    // soft/water patches: flat hard-edged pools
    if (f.waterOrSoft) {
      octx.fillStyle = pal.water;
      octx.strokeStyle = pal.waterStroke;
      octx.lineWidth = 0.8;
      for (const p of f.waterOrSoft) {
        const [px, py] = worldToMap(p.x, p.z);
        octx.beginPath();
        octx.arc(px, py, (p.r / mapWorldSize) * MM, 0, Math.PI * 2);
        octx.fill();
        octx.stroke();
      }
    }
    // tree clusters: hard-edged irregular forest polygons (WoT flat style)
    if (f.treeClusters) {
      octx.fillStyle = pal.forest;
      octx.strokeStyle = pal.forestStroke;
      octx.lineWidth = 0.8;
      octx.lineJoin = 'round';
      for (const p of f.treeClusters) {
        const [px, py] = worldToMap(p.x, p.z);
        const pr = Math.max(2.5, (p.r / mapWorldSize) * MM);
        // deterministic lumpy octagon seeded from the cluster position
        const seed = Math.abs(Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453);
        octx.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const jr = pr * (0.72 + 0.38 * Math.abs(Math.sin(seed + k * 2.3)));
          const vx = px + Math.cos(a) * jr;
          const vy = py + Math.sin(a) * jr * 0.9;
          if (k === 0) octx.moveTo(vx, vy); else octx.lineTo(vx, vy);
        }
        octx.closePath();
        octx.fill();
        octx.stroke();
      }
    }
    // roads: dark casing pass + solid 2px tan centerline pass
    if (f.roads) {
      octx.lineJoin = 'round';
      octx.lineCap = 'round';
      for (const pass of [
        { c: pal.roadCasing, lw: 3.2 },
        { c: pal.roadFill, lw: 1.8 },
      ]) {
        octx.strokeStyle = pass.c;
        octx.lineWidth = pass.lw;
        for (const line of f.roads) {
          octx.beginPath();
          for (let i = 0; i < line.length; i++) {
            const [px, py] = worldToMap(line[i][0], line[i][1]);
            if (i === 0) octx.moveTo(px, py); else octx.lineTo(px, py);
          }
          octx.stroke();
        }
      }
      octx.lineCap = 'butt';
    }
    // buildings: light footprints with a dark keyline. Small structures get a
    // 4px floor so village clusters merge into readable town blocks instead
    // of scattering into single-pixel white noise; the keyline only draws on
    // footprints big enough to carry it.
    if (f.buildings) {
      octx.strokeStyle = 'rgba(24,29,36,0.8)';
      octx.lineWidth = 0.7;
      for (const b of f.buildings) {
        const [px, py] = worldToMap(b.x, b.z);
        octx.save();
        octx.translate(px, py);
        octx.rotate(-(b.rot || 0));
        const bw = Math.max(4, (b.w / mapWorldSize) * MM);
        const bd = Math.max(4, (b.d / mapWorldSize) * MM);
        octx.globalAlpha = 0.85;
        octx.fillStyle = pal.buildingFill;
        octx.fillRect(-bw / 2, -bd / 2, bw, bd);
        octx.globalAlpha = 1;
        if (bw * bd >= 26) octx.strokeRect(-bw / 2, -bd / 2, bw, bd);
        octx.restore();
      }
    }
    // grid 10x10
    octx.strokeStyle = 'rgba(230,240,250,0.11)';
    octx.lineWidth = 0.7;
    octx.beginPath();
    for (let i = 1; i < 10; i++) {
      octx.moveTo(i * MM / 10 + 0.5, 0); octx.lineTo(i * MM / 10 + 0.5, MM);
      octx.moveTo(0, i * MM / 10 + 0.5); octx.lineTo(MM, i * MM / 10 + 0.5);
    }
    octx.stroke();
    // grid coordinates in slim inset strips (letters top, numbers left) —
    // no per-cell tabs eating map area, and the K column stays clear of the
    // panel edge because labels sit at cell centers inside a full-width
    // strip. Row numbers get the SAME size/alpha as the column letters and
    // a 17px inset gutter with labels centered at x=9 so the two-digit "10"
    // renders whole (r4: the 11px gutter's x=5.5 center cropped the "1" of
    // "10" against the panel's left edge).
    octx.fillStyle = 'rgba(5,8,11,0.55)';
    octx.fillRect(0, 0, MM, 10);
    octx.fillRect(0, 10, 17, MM - 10);
    octx.font = `700 7.5px ${FONT_COND}`;
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillStyle = 'rgba(255,255,255,0.72)';
    for (let i = 0; i < 10; i++) {
      const c = i * MM / 10 + MM / 20;
      octx.fillText(GRID_LETTERS[i], Math.max(c, 21), 5.5);
      octx.fillText(String(i + 1), 9, Math.max(c, 17) + 0.5);
    }
    octx.textAlign = 'left';
    octx.textBaseline = 'alphabetic';
    // inner vignette edge
    octx.strokeStyle = 'rgba(0,0,0,0.45)';
    octx.lineWidth = 1.5;
    octx.strokeRect(0.75, 0.75, MM - 1.5, MM - 1.5);
    mmBg = out;
  }

  // Team spawn flags (mode objective markers for annihilation): captured from
  // the rosters' first battle frame, when every tank still sits on its spawn.
  function captureSpawnFlags(frame) {
    const tanks = frame.tanks || [];
    let ax = 0, az = 0, an = 0, ex = 0, ez = 0, en = 0;
    for (const t of tanks) {
      if (!t || !t.state) continue;
      if (t.team === 'player' || t.isPlayer) { ax += t.state.pos.x; az += t.state.pos.z; an++; }
      else { ex += t.state.pos.x; ez += t.state.pos.z; en++; }
    }
    if (!an || !en) return;
    // r4: each base carries a team-tinted cap fill so BOTH bases read on the
    // map (the old white 7% fill made the own-base marker invisible under
    // the ally blip cluster at spawn — the map read one-sided).
    spawnFlags = [
      { x: ax / an, z: az / an, color: '#7ee87e', fill: 'rgba(126,232,126,0.16)' },
      { x: ex / en, z: ez / en, color: '#f05a5a', fill: 'rgba(240,90,90,0.16)' },
    ];
  }

  // WoT-style base/spawn glyph: pole + team-colored pennant with a dark halo.
  // r4: taller pole (pennant at -14..-8) so the own-base pennant clears the
  // player/ally arrow blips parked on top of it at battle start.
  function drawSpawnFlag(c, x, y, color) {
    c.save();
    c.translate(Math.round(x), Math.round(y));
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(6,9,12,0.85)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0.5, 4); c.lineTo(0.5, -14);
    c.stroke();
    c.beginPath();
    c.moveTo(0.5, -14); c.lineTo(8.5, -11.2); c.lineTo(0.5, -8.4);
    c.closePath();
    c.stroke();
    c.fillStyle = color;
    c.fill();
    c.strokeStyle = 'rgba(228,238,246,0.95)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(0.5, 4); c.lineTo(0.5, -14);
    c.stroke();
    c.restore();
  }

  // canvas rotation that makes a forward-up sprite/shape point along hull yaw
  // (same mapping the player arrow has always used)
  const blipAngle = (yaw) => Math.atan2(-Math.cos(yaw), Math.sin(yaw)) + Math.PI / 2;

  // minimap blip: WoT's vanilla marker language is ARROWS — a directional
  // vehicle arrow (nose forward, swept tail notch) rotated to hull heading.
  // Player = larger white arrow, allies = green, enemies = red (r3: tinted
  // top-down silhouettes at 15 px read as directionless discs).
  function drawArrowBlip(c, x, y, yaw, fill, s, alpha) {
    c.save();
    c.translate(x, y);
    c.rotate(blipAngle(yaw));
    c.globalAlpha = alpha;
    c.beginPath();
    c.moveTo(0, -s);                       // nose
    c.lineTo(s * 0.74, s * 0.9);           // right tail
    c.lineTo(0, s * 0.42);                 // tail notch
    c.lineTo(-s * 0.74, s * 0.9);          // left tail
    c.closePath();
    c.fillStyle = fill;
    c.strokeStyle = 'rgba(6,10,8,0.9)';
    c.lineWidth = 1;
    c.lineJoin = 'round';
    c.fill();
    c.stroke();
    c.restore();
  }

  // deterministic per-entity blip jitter (±2 px): keeps co-located spawn
  // markers individually visible instead of merging into one blob
  // performance_budget r4: memoized per id — the fresh 2-element array per
  // blip per 20 Hz repaint (~320 small arrays/s in a 16-tank battle) was the
  // last steady per-frame allocation in the hot loop. Jitter is deterministic
  // per id, so the memo is exact.
  const _bj = new Map(); // id -> [dx, dy]
  function blipJitter(id) {
    let v = _bj.get(id);
    if (!v) {
      const j = hashStr(String(id));
      v = [((j % 5) - 2) * 0.9, (((j >> 3) % 5) - 2) * 0.9];
      _bj.set(id, v);
    }
    return v;
  }

  // vector fallback (first frames while a silhouette PNG is still loading) and
  // last-known-position ghost marker: class-shaped diamond
  function drawBlip(c, x, y, cls, color, alpha, ghost) {
    c.save();
    c.translate(x, y);
    c.globalAlpha = alpha;
    c.beginPath();
    c.moveTo(0, -4.4); c.lineTo(4.4, 0); c.lineTo(0, 4.4); c.lineTo(-4.4, 0);
    c.closePath();
    if (ghost || cls === 'medium' || cls === 'light') {
      c.strokeStyle = color;
      c.lineWidth = 1.4;
      c.stroke();
    } else {
      c.fillStyle = color;
      c.fill();
      if (cls === 'mbt') {
        c.fillStyle = 'rgba(8,12,16,0.9)';
        c.fillRect(-2.4, -0.9, 4.8, 1.8);
      }
    }
    c.restore();
  }

  function drawMinimap(frame) {
    if (mmBg) {
      mmCtx.drawImage(mmBg, 0, 0, MM, MM);
    } else {
      mmCtx.fillStyle = '#141b16';
      mmCtx.fillRect(0, 0, MM, MM);
    }
    const tanks = frame.tanks || [];
    const player = frame.player;
    // team bases under everything else: WoT convention — a white circle
    // outline (the base perimeter) with the team-colored flag at its center
    if (spawnFlags) {
      for (const fl of spawnFlags) {
        const [fx, fy] = worldToMap(fl.x, fl.z);
        mmCtx.fillStyle = fl.fill || 'rgba(240,246,252,0.07)';
        mmCtx.strokeStyle = 'rgba(240,246,252,0.85)';
        mmCtx.lineWidth = 1.2;
        mmCtx.beginPath();
        mmCtx.arc(fx, fy, 10, 0, Math.PI * 2);
        mmCtx.fill();
        mmCtx.stroke();
        mmCtx.strokeStyle = 'rgba(6,9,12,0.5)'; // dark keyline under the ring
        mmCtx.lineWidth = 0.8;
        mmCtx.beginPath();
        mmCtx.arc(fx, fy, 11, 0, Math.PI * 2);
        mmCtx.stroke();
        drawSpawnFlag(mmCtx, fx, fy + 3, fl.color);
      }
    }
    // enemy / ally blips (spotting-gated for live enemies)
    for (let i = 0; i < tanks.length; i++) {
      const t = tanks[i];
      if (!t || !t.state || t.isPlayer) continue;
      const ally = t.team === 'player';
      if (t.combat && t.combat.destroyed) {
        const [px, py] = worldToMap(t.state.pos.x, t.state.pos.z);
        mmCtx.strokeStyle = 'rgba(140,140,140,0.85)';
        mmCtx.lineWidth = 1.4;
        mmCtx.beginPath();
        mmCtx.moveTo(px - 3.5, py - 3.5); mmCtx.lineTo(px + 3.5, py + 3.5);
        mmCtx.moveTo(px + 3.5, py - 3.5); mmCtx.lineTo(px - 3.5, py + 3.5);
        mmCtx.stroke();
        continue;
      }
      const cls = t.spec ? t.spec.class : 'medium';
      const [jx, jy] = blipJitter(t.id);
      if (ally) {
        const [px, py] = worldToMap(t.state.pos.x, t.state.pos.z);
        drawArrowBlip(mmCtx, px + jx, py + jy, t.state.yaw, PEN_GREEN, 5, 0.95);
        continue;
      }
      const sp = spotById.get(t.id);
      if (sp && sp.vis) {
        const [px, py] = worldToMap(t.state.pos.x, t.state.pos.z);
        drawArrowBlip(mmCtx, px + jx, py + jy, t.state.yaw, PEN_RED, 5, 0.95);
      } else if (sp && sp.ever) {
        // last-known-position ghost marker (class diamond — deliberately a
        // DIFFERENT shape from the live arrows: "stale intel" at a glance)
        const [px, py] = worldToMap(sp.lastX, sp.lastZ);
        // content_breadth r4: ghost markers use the real _top silhouette at
        // last-known heading — stale intel gains vehicle identity like WoT's
        // last-seen markers (live blips stay arrows for readability).
        const ic = tintedIcon(t.spec ? t.spec.id : 'm4a3e8', 'top_silhouette', 'rgb(242,140,132)');
        if (ic) {
          mmCtx.save();
          mmCtx.globalAlpha = 0.55;
          mmCtx.translate(px, py);
          mmCtx.rotate(blipAngle(sp.lastYaw || 0));
          const iw = 21, ih = Math.max(10, iw * (ic.height / ic.width));
          mmCtx.drawImage(ic, -iw / 2, -ih / 2, iw, ih);
          mmCtx.restore();
        } else {
          drawBlip(mmCtx, px, py, cls, 'rgba(240,120,110,0.9)', 0.45, true);
        }
      }
      // never spotted -> nothing on the map
    }
    // player: render-range square + spot-range circle + view wedge + arrow
    if (player && player.state) {
      const st = player.state;
      const [px, py] = worldToMap(st.pos.x, st.pos.z);
      const pxPerM = MM / mapWorldSize;
      // white draw-distance square (WoT max-render box around the player)
      const rsq = RENDER_RANGE_M * pxPerM;
      mmCtx.strokeStyle = 'rgba(240,246,252,0.75)';
      mmCtx.lineWidth = 1;
      mmCtx.strokeRect(px - rsq, py - rsq, rsq * 2, rsq * 2);
      // dashed max-spot circle
      mmCtx.strokeStyle = 'rgba(240,246,252,0.35)';
      mmCtx.setLineDash([3, 3]);
      mmCtx.beginPath();
      mmCtx.arc(px, py, SPOT_RANGE_M * pxPerM, 0, Math.PI * 2);
      mmCtx.stroke();
      mmCtx.setLineDash([]);
      if (frame.camera) {
        // view-direction cone from camera yaw (WoT's minimap identity):
        // translucent fill + faint edge rays so the wedge reads even over
        // bright terrain
        _fwd.set(0, 0, -1).transformDirection(frame.camera.matrixWorld);
        const camAng = Math.atan2(-_fwd.z, _fwd.x); // canvas angle (y down, +Z up on map)
        const wr = 36;
        mmCtx.fillStyle = 'rgba(235,245,255,0.15)';
        mmCtx.beginPath();
        mmCtx.moveTo(px, py);
        mmCtx.arc(px, py, wr, camAng - 0.42, camAng + 0.42);
        mmCtx.closePath();
        mmCtx.fill();
        mmCtx.strokeStyle = 'rgba(240,248,255,0.35)';
        mmCtx.lineWidth = 0.8;
        mmCtx.beginPath();
        for (const a of [camAng - 0.42, camAng + 0.42]) {
          mmCtx.moveTo(px, py);
          mmCtx.lineTo(px + Math.cos(a) * wr, py + Math.sin(a) * wr);
        }
        mmCtx.stroke();
      }
      // turret direction line (under the self arrow)
      const tAng = st.yaw + st.turretYaw;
      mmCtx.strokeStyle = 'rgba(235,245,255,0.75)';
      mmCtx.lineWidth = 1.2;
      mmCtx.beginPath();
      mmCtx.moveTo(px, py);
      mmCtx.lineTo(px + Math.sin(tAng) * 15, py - Math.cos(tAng) * 15);
      mmCtx.stroke();
      // self marker: the classic WHITE hull-direction arrow (WoT self read),
      // larger than any teammate blip
      drawArrowBlip(mmCtx, px, py, st.yaw, '#f2f8ff', 6.6, 1);
    }
  }

  // ---------- bus feeds ----------
  function pushKill(payload) {
    const killer = nameById.get(payload.killerId) || 'Enemy';
    const victim = nameById.get(payload.id) || payload.specId || 'Tank';
    const item = el('div', 'cot-kf', killfeed);
    const cause = CAUSE_LABEL[payload.cause] || '';
    // side-profile silhouettes of the actual tanks flank the names
    const kSpec = specIdById.get(payload.killerId);
    const vSpec = specIdById.get(payload.id) || payload.specId;
    item.innerHTML =
      (kSpec ? `<span class="si ksi"></span>` : '') + `<span class="k"></span>` +
      `<span class="d">destroyed</span>` +
      (vSpec ? `<span class="si vsi"></span>` : '') + `<span class="v"></span>` +
      (cause ? `<span class="c">${cause}</span>` : '');
    if (kSpec) maskIcon(item.querySelector('.ksi'), kSpec, 'side_silhouette', '#cfe3f4');
    if (vSpec) maskIcon(item.querySelector('.vsi'), vSpec, 'side_silhouette', '#f28f8f');
    item.querySelector('.k').textContent = killer;
    item.querySelector('.v').textContent = victim;
    killfeed.prepend(item);
    while (killfeed.children.length > 5) killfeed.lastChild.remove();
    setTimeout(() => item.classList.add('out'), 5200);
    setTimeout(() => { if (item.parentNode) item.remove(); }, 6200);
  }

  function pushDamageLog(hit) {
    const attacker = nameById.get(hit.attackerId) || 'Enemy';
    const item = el('div', 'cot-dl');
    if (hit.damage > 0) item.innerHTML = `<b>−${Math.round(hit.damage)}</b>&nbsp; ${attacker}`;
    else item.innerHTML = `<b>BLOCKED</b>&nbsp; ${attacker}`;
    dlog.prepend(item);
    while (dlog.children.length > 4) dlog.lastChild.remove();
    setTimeout(() => item.classList.add('out'), 5000);
    setTimeout(() => { if (item.parentNode) item.remove(); }, 6000);
  }

  function pushDamageNumber(hit) {
    if (!lastCamera || mode === 'hidden') return;
    project(lastCamera, hit.pos[0], hit.pos[1] + 1.5, hit.pos[2]);
    if (!_sVisible) return;
    const d = el('div', 'cot-dmgnum', dmgLayer);
    if (hit.kind === 'ricochet') { d.classList.add('miss'); d.textContent = 'RICOCHET'; }
    else if (hit.kind === 'nonpen') { d.classList.add('miss'); d.textContent = 'NO PENETRATION'; }
    else if (hit.kind === 'spaced_absorb' || hit.kind === 'era' ||
      (hit.kind === 'screen_pierce' && !(hit.damage > 0))) { d.classList.add('miss'); d.textContent = 'ABSORBED'; }
    else if (hit.damage > 0) {
      d.textContent = `-${Math.round(hit.damage)}`;
      if (hit.modulesHit && hit.modulesHit.length) {
        const c = el('span', 'crit', d);
        c.textContent = 'CRIT';
      }
    } else { d.remove(); return; }
    // WoT-style stacking: new labels step upward off any live label near the
    // same projected point (slight x-jitter) instead of overlapping.
    let x = _sx, y = _sy;
    const nowMs = performance.now();
    for (let i = liveNums.length - 1; i >= 0; i--) {
      if (liveNums[i].until < nowMs) liveNums.splice(i, 1);
    }
    for (let guard = 0; guard < 8; guard++) {
      const clash = liveNums.find((n) => Math.abs(n.x - x) < 72 && Math.abs(n.y - y) < 24);
      if (!clash) break;
      y = clash.y - 26;
      x += (Math.random() - 0.5) * 12;
    }
    liveNums.push({ x, y, until: nowMs + 900 });
    d.style.left = `${x.toFixed(0)}px`;
    d.style.top = `${y.toFixed(0)}px`;
    setTimeout(() => { if (d.parentNode) d.remove(); }, 1800);
  }

  function pushHitDirection(hit, playerEnt) {
    if (!playerEnt || !playerEnt.state || !lastCamera) return;
    const dx = hit.pos[0] - playerEnt.state.pos.x;
    const dz = hit.pos[2] - playerEnt.state.pos.z;
    _fwd.set(0, 0, -1).transformDirection(lastCamera.matrixWorld);
    const camYaw = Math.atan2(_fwd.x, _fwd.z);
    const hitYaw = Math.atan2(dx, dz);
    hitDirs.push({ ang: hitYaw - camYaw, t0: lastTimeS });
    if (hitDirs.length > 6) hitDirs.shift();
  }

  function showAlert(text, red) {
    alertEl.textContent = text;
    alertEl.classList.toggle('red', !!red);
    alertEl.classList.add('show');
    if (alertTimer) clearTimeout(alertTimer);
    alertTimer = setTimeout(() => alertEl.classList.remove('show'), 2400);
  }

  let playerRef = null;
  bus.on('tank:destroyed', (p) => { pushKill(p); });
  // Shell hotkeys route through input.js actions only (main.js emits this) —
  // the HUD renders selection state from the bus instead of its own listener.
  bus.on('ui:shellSelect', ({ slot }) => selectSlot(slot));
  // Live hotkey labels — settings.js broadcasts at boot and after every
  // rebind/clear/reset, so the tray never lies about the player's keys.
  bus.on('ui:bindingsChanged', (p) => {
    if (!p) return;
    if (Array.isArray(p.shells)) {
      for (let i = 0; i < 3 && i < p.shells.length; i++) {
        const k = slotEls[i].querySelector('.key');
        if (k) k.textContent = p.shells[i];
      }
    }
    if (Array.isArray(p.consumables)) {
      for (let i = 0; i < conEls.length && i < p.consumables.length; i++) {
        const k = conEls[i].querySelector('.key');
        if (k) k.textContent = p.consumables[i];
      }
    }
  });
  bus.on('ui:consumableUsed', ({ slot, left }) => {
    const s = conEls[slot];
    if (!s) return;
    s.querySelector('.cnt').textContent = String(left);
    s.classList.toggle('used', left <= 0);
    showAlert(`${CONSUMABLES[slot].label.toUpperCase()} USED`, false);
  });
  bus.on('ui:consumableDenied', ({ slot, reason }) => {
    if (reason === 'NOTHING') {
      showAlert(slot === 2 ? 'NO FIRE TO EXTINGUISH' : slot === 1 ? 'CREW UNHARMED' : 'NOTHING TO REPAIR', false);
    }
    const s = conEls[slot];
    if (s) { s.classList.remove('deny'); void s.offsetWidth; s.classList.add('deny'); }
  });
  bus.on('ui:consumableReset', () => {
    for (let i = 0; i < conEls.length; i++) {
      conEls[i].querySelector('.cnt').textContent = String(CONSUMABLES[i].count);
      conEls[i].classList.remove('used', 'deny');
    }
  });
  // Minimap size cycle (3 steps) — the canvas keeps its fixed 2x internal
  // resolution; CSS scales it, so blips/labels stay proportionate.
  const MM_SIZES = [160, 220, 300];
  let mmSizeIdx = 1;
  bus.on('ui:minimapZoom', () => {
    mmSizeIdx = (mmSizeIdx + 1) % MM_SIZES.length;
    const px = `${MM_SIZES[mmSizeIdx]}px`;
    mmWrap.style.width = px;
    mmWrap.style.height = px;
  });
  bus.on('shell:hit', (hit) => {
    if (playerId != null && hit.attackerId === playerId && hit.targetId && hit.targetId !== playerId) {
      pushDamageNumber(hit);
      // r4: a screen_pierce that dealt 0 damage (skirt ate the shell) used to
      // flash the ORANGE damage confirm with no number and no message —
      // contradictory feedback. Zero-damage hits are bounces: grey ticks +
      // ABSORBED label + bounce message.
      const bounced = hit.kind === 'ricochet' || hit.kind === 'nonpen' ||
        hit.kind === 'spaced_absorb' || hit.kind === 'era' ||
        (hit.kind === 'screen_pierce' && !(hit.damage > 0));
      hitMark = { t0: lastTimeS, bounced };
      if (bounced) showBounceMessage(hit.kind);
    }
    if (playerId != null && hit.targetId === playerId) {
      pushHitDirection(hit, playerRef);
      pushDamageLog(hit);
    }
  });
  bus.on('module:state', (p) => {
    if (playerId == null || p.id !== playerId || p.state === 'ok') return;
    const label = p.module === 'trackL' || p.module === 'trackR' ? 'TRACK'
      : p.module === 'ammoRack' ? 'AMMO RACK'
      : p.module === 'fuelTank' ? 'FUEL TANK'
      : p.module === 'turretRing' ? 'TURRET RING'
      : p.module.toUpperCase();
    showAlert(p.state === 'red' ? `${label} DESTROYED` : `${label} DAMAGED`, p.state === 'red');
  });

  // ---------- aim view assembly ----------
  const aimView = {
    cx: 0, cy: 0, radPx: 40, penRatio: null, distM: null, blockedDistM: null,
    gunX: null, gunY: null, atGunLimit: false,
    reload: { t: 0, totalS: 1 }, zoom: 1,
  };

  function assembleAimView(camera, aim) {
    aimView.penRatio = aim.penRatio != null ? aim.penRatio : null;
    aimView.blockedDistM = aim.blockedDistM != null ? aim.blockedDistM : null;
    aimView.distM = aim.distM != null ? aim.distM : null;
    aimView.atGunLimit = !!aim.atGunLimit;
    aimView.reload = aim.reload || aimView.reload;
    aimView.zoom = aim.zoom || 1;
    aimView.gunX = null; aimView.gunY = null;
    let placed = false;
    if (camera && aim.point && aim.point.isVector3) {
      project(camera, aim.point.x, aim.point.y, aim.point.z);
      if (_sVisible) {
        aimView.cx = _sx; aimView.cy = _sy;
        const dist = aim.distM != null ? aim.distM : _sDist;
        const ppm = pxPerMeterAt(camera, dist);
        aimView.radPx = (aim.dispersionRadM != null ? aim.dispersionRadM : 1.5) * ppm;
        placed = true;
      }
    }
    if (!placed) {
      aimView.cx = w / 2; aimView.cy = h / 2;
      if (aim.dispersionRadM != null && aim.distM != null) {
        aimView.radPx = aim.dispersionRadM * pxPerMeterAt(camera, aim.distM);
      } else {
        aimView.radPx = Math.min(w, h) * 0.05;
      }
    }
    if (camera && aim.gunMarker && aim.gunMarker.isVector3) {
      project(camera, aim.gunMarker.x, aim.gunMarker.y, aim.gunMarker.z);
      if (_sVisible) { aimView.gunX = _sx; aimView.gunY = _sy; }
    }
  }

  function renderCanvas(dt) {
    ctx.clearRect(0, 0, w, h);
    if (mode === 'hidden') return;
    if (mode === 'sniper') drawScope(aimView.zoom);
    drawHitIndicators(lastTimeS);
    drawReticle(aimView, dt);
    drawHitMark(aimView, lastTimeS);
  }

  // Sniper keeps the ARCADE grading untouched: real WoT sniper mode is the
  // same scene at a narrow FOV — no saturation/contrast push, no green cast.
  // (An earlier saturate/contrast CSS filter on the scene canvas made the
  // verdant sniper frame read acid-green; guard against any stale filter.)
  let sceneCanvasEl = null;
  function sceneCanvas() {
    if (!sceneCanvasEl || !sceneCanvasEl.isConnected) {
      const app = document.getElementById('app');
      sceneCanvasEl = app ? app.querySelector('canvas') : null;
    }
    return sceneCanvasEl;
  }
  function applyMode() {
    root.style.display = mode === 'hidden' ? 'none' : 'block';
    // scope shadow fades in over ~0.1 s on ENTERING sniper (movement §9.2)
    if (mode === 'sniper' && scopePrevMode !== 'sniper') scopeFadeMs = performance.now();
    scopePrevMode = mode;
    const sc = sceneCanvas();
    if (sc && sc.style.filter) sc.style.filter = '';
  }

  // ---------- public API ----------
  const hud = {
    root,
    shotInfo, // SHOT-INFO SECTION: exposed for tests/debug hooks

    /**
     * Stage a deterministic hit-confirm marker (controls_gunnery r3 test
     * hook — real shots kept missing during captures, so the marker's visual
     * weight was unverifiable). Draws through the exact drawHitMark path.
     * @param {boolean} [bounced=false] grey bounce ticks instead of orange
     */
    forceHitMark(bounced = false) {
      hitMark = { t0: lastTimeS, bounced: !!bounced };
    },

    /**
     * Switch overall HUD mode.
     * @param {'battle'|'sniper'|'hidden'} m
     */
    setMode(m) {
      const wasHidden = mode === 'hidden';
      mode = m;
      applyMode();
      mmDirty = true; // guarantee a minimap draw on the next update()
      // net readout: forced screenshot frames (single update after setMode)
      // stay clean — hide the readout and reset the live counter
      netEl.style.display = 'none';
      netFrames = 0;
      netLastMs = 0;
      if (m === 'hidden') {
        ctx.clearRect(0, 0, w, h);
        aimTargetId = null;
        if (tgtShown) { tgtEl.style.display = 'none'; tgtShown = false; }
      }
      // SHOT-INFO SECTION: lifecycle forwarding (reset per battle, hide the
      // end-of-battle stats card when the HUD leaves the battlefield).
      if (m === 'hidden') shotInfo.hideStats();
      if (m === 'battle' && wasHidden) shotInfo.reset();
      if (m === 'battle' && wasHidden) {
        // fresh battle: drop spotting memory, nicknames and team rosters
        spotById.clear();
        nickById.clear();
        spawnFlags = null; // re-capture from the new battle's spawn frame
        // SPOTTING SECTION: disarm the sixth-sense lamp (sim clock restarts)
        sixthPendingS = -1;
        sixthUntilS = -1;
        sixthOn = false;
        sixthEl.classList.remove('on');
        for (const [, row] of earRows) row.root.remove();
        earRows.clear();
        for (const [, bar] of hpPool) bar.root.remove();
        hpPool.clear();
        lastScore = '';
        lastTimer = '';
      }
    },

    /**
     * Per-render-frame HUD refresh.
     * @param {FrameInfo} frame - see ARCHITECTURE §3.7.1.
     */
    update(frame) {
      forced = null; // a live frame supersedes any forced screenshot display
      forcedStill = false;
      const camera = frame.camera;
      lastCamera = camera || lastCamera;
      lastTanksRef = frame.tanks || lastTanksRef;
      const dt = Math.max(0, Math.min(0.1, frame.timeS - lastTimeS)) || 1 / 60;
      lastTimeS = frame.timeS;
      if (frame.mode && frame.mode !== mode) { mode = frame.mode; applyMode(); mmDirty = true; }
      playerRef = frame.player || playerRef;
      if (frame.player) playerId = frame.player.id;
      shotInfo.setPlayer(playerId); // SHOT-INFO SECTION: identity forwarding
      const tanks = frame.tanks || [];
      for (let i = 0; i < tanks.length; i++) {
        const t = tanks[i];
        if (t && t.spec) { nameById.set(t.id, t.spec.name); specIdById.set(t.id, t.spec.id); }
      }
      if (mode === 'hidden') { ctx.clearRect(0, 0, w, h); return; }
      if (camera) { camera.updateMatrixWorld(); _mInv.copy(camera.matrixWorld).invert(); }

      if (!spawnFlags) captureSpawnFlags(frame); // tanks still on their spawns
      updateSpotting(frame);
      updateTeams(frame);
      updateNetReadout(frame.timeS);
      // SPOTTING SECTION: sixth-sense fuse/lamp + camo/eye indicator
      updateSixthSense(frame.timeS);
      updateCamoIndicator(frame.spotting ? frame.spotting.player : null);

      const aim = frame.aim || {};
      assembleAimView(camera, aim);
      if (aim.shells) lastShells = aim.shells;
      const slot = aim.shellSlot != null ? aim.shellSlot : localSlot;
      renderShells(lastShells, slot);
      updateShellCooldown(aim.reload, slot);
      renderCanvas(dt);
      updateTargetPlate(); // before updateHpBars: the target's plate yields
      if (camera) updateHpBars(frame);
      // PERF: the minimap is a full 2D-canvas repaint (bg blit + blips +
      // ranges); 20 Hz is visually indistinguishable for map blips. mmDirty
      // (mode switches, forced screenshot frames, minimap rebuilds) always
      // paints immediately so single-shot updates never show a stale map.
      mmFrame++;
      if (mmDirty || mmFrame % 3 === 0) {
        drawMinimap(frame);
        mmDirty = false;
      }
    },

    /**
     * Render the static minimap background once at battle start.
     * @param {HeightField} heightField
     * @param {{roads:Array,buildings:Array,treeClusters:Array,waterOrSoft:Array}} features - World.getMinimapFeatures() result.
     */
    buildMinimap(heightField, features, palette) {
      buildMinimapBg(heightField, features, palette);
      mmCtx.drawImage(mmBg, 0, 0, MM, MM);
      mmDirty = true;
    },

    /**
     * Mount the damage panel instance into the HUD layer.
     * @param {{root:HTMLElement}} panel - createDamagePanel() result.
     */
    setDamagePanel(panel) {
      if (panel && panel.root && panel.root.parentNode !== root) {
        root.appendChild(panel.root);
      }
    },

    /**
     * Deterministic screenshot hook: immediately display the given partial aim
     * state (reticle centered on screen if no world point/camera is known).
     * Stays until the next update(frame).
     * @param {object} f - partial FrameInfo.aim.
     */
    forceAimDisplay(f) {
      scopeFadeMs = -1; // deterministic still: scope shadow fully settled
      forced = Object.assign({}, f);
      forcedStill = true; // target plate trusts the recipe's aim state
      assembleAimView(lastCamera, forced);
      // no bloom animation in a forced still — land directly on the target
      // radius (including the post-shot bloom read from the reload state)
      smoothRadPx = reticleTargetR(aimView);
      if (forced.shells) lastShells = forced.shells;
      const slot = forced.shellSlot != null ? forced.shellSlot : localSlot;
      renderShells(lastShells, slot);
      updateShellCooldown(forced.reload, slot);
      renderCanvas(1);
      updateTargetPlate(); // over-target marker for the vehicle under the gun
    },
  };

  return hud;
}
