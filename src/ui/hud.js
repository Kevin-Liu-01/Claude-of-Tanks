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
// Shared Switzer type system (see src/ui/fonts.js): FONT_COND drives the
// numeral/label hierarchy with tabular figures.
import { FONT_STACK, FONT_COND, ensureFonts } from './fonts.js';
// Pre-rendered tank icons (tools/genIcons.mjs): tinted top-down silhouettes
// drive the minimap blips; side silhouettes drive the team panels + kill feed.
import { tintedIcon, maskIcon } from './icons.js';
import { TANK_IDS } from '../vehicles/specs.js';

// module-scope scratch (no per-frame allocation)
const _mInv = new THREE.Matrix4();
const _cs = new THREE.Vector3();
const _ndc = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _fwd = new THREE.Vector3();

// spotting model (WoT-style): max spot range + persistence after LOS is lost
const SPOT_RANGE_M = 445;
const RENDER_RANGE_M = 500; // white square on the minimap
const SPOT_PERSIST_S = 4;
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

// Procedural shell artwork for the ammo slots: brass casing + projectile with
// a distinct nose profile per type, and a type-colored driving band.
// APFSDS: long thin fin-stabilized dart in a sabot. HEAT: cylindrical body
// with a standoff probe nose. HE: fat body, blunt rounded nose. AP/APCR:
// classic sharp ogive.
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
  const steel = c.createLinearGradient(cx - 7, 0, cx + 7, 0);
  steel.addColorStop(0, '#4c565e'); steel.addColorStop(0.4, '#a4b2bc');
  steel.addColorStop(0.6, '#cdd9e2'); steel.addColorStop(1, '#525c64');

  if (type === 'APFSDS' || type === 'APCR') {
    // long-rod dart: needle tip, thin rod full height, sabot petals flaring
    // mid-body, fin cone at the base. No fat casing — reads "dart" instantly.
    const rw = type === 'APFSDS' ? 3.4 : 4.6;
    c.fillStyle = steel;
    c.beginPath(); // rod with needle tip
    c.moveTo(cx, 2);
    c.lineTo(cx + rw / 2, 10); c.lineTo(cx + rw / 2, 36);
    c.lineTo(cx - rw / 2, 36); c.lineTo(cx - rw / 2, 10);
    c.closePath(); c.fill();
    // sabot petals (discarding shoes) flaring off both sides
    c.fillStyle = '#8b959e';
    c.beginPath();
    c.moveTo(cx - rw / 2 - 0.5, 18); c.lineTo(cx - rw / 2 - 6.5, 26);
    c.lineTo(cx - rw / 2 - 7.5, 33); c.lineTo(cx - rw / 2 - 2.5, 29);
    c.lineTo(cx - rw / 2 - 0.5, 24);
    c.closePath(); c.fill();
    c.beginPath();
    c.moveTo(cx + rw / 2 + 0.5, 18); c.lineTo(cx + rw / 2 + 6.5, 26);
    c.lineTo(cx + rw / 2 + 7.5, 33); c.lineTo(cx + rw / 2 + 2.5, 29);
    c.lineTo(cx + rw / 2 + 0.5, 24);
    c.closePath(); c.fill();
    // tail fins
    c.fillStyle = steel;
    c.beginPath();
    c.moveTo(cx - rw / 2, 36); c.lineTo(cx - rw / 2 - 5, 44); c.lineTo(cx - rw / 2, 44);
    c.closePath(); c.fill();
    c.beginPath();
    c.moveTo(cx + rw / 2, 36); c.lineTo(cx + rw / 2 + 5, 44); c.lineTo(cx + rw / 2, 44);
    c.closePath(); c.fill();
    c.fillRect(cx - rw / 2 - 1, 43, rw + 2, 1.6);
    // tracer band at the base
    c.fillStyle = band;
    c.fillRect(cx - rw / 2 - 1, 40, rw + 2, 2.4);
  } else if (type === 'HEAT') {
    // blunt-nose parallel cylinder with standoff probe + boat-tail; stubby.
    c.fillStyle = steel;
    c.fillRect(cx - 6.5, 15, 13, 24); // straight cylinder body
    c.beginPath(); // flat-ish blunt nose cap
    c.moveTo(cx - 6.5, 15); c.lineTo(cx - 3, 10.5); c.lineTo(cx + 3, 10.5); c.lineTo(cx + 6.5, 15);
    c.closePath(); c.fill();
    c.fillRect(cx - 1.6, 3.5, 3.2, 7.5); // standoff probe
    c.fillRect(cx - 3, 2, 6, 2.4); // probe cap
    // boat-tail
    c.beginPath();
    c.moveTo(cx - 6.5, 39); c.lineTo(cx - 4.5, 44); c.lineTo(cx + 4.5, 44); c.lineTo(cx + 6.5, 39);
    c.closePath(); c.fill();
    // twin type bands around the cylinder
    c.fillStyle = band;
    c.fillRect(cx - 6.5, 18, 13, 3);
    c.fillRect(cx - 6.5, 33, 13, 2);
  } else if (type === 'HE') {
    // wide round-nose shell: fat ogive body, painted nose ring, flat base.
    c.fillStyle = steel;
    c.beginPath();
    c.moveTo(cx - 8, 44);
    c.lineTo(cx - 8, 20);
    c.quadraticCurveTo(cx - 7.5, 8, cx, 4.5);
    c.quadraticCurveTo(cx + 7.5, 8, cx + 8, 20);
    c.lineTo(cx + 8, 44);
    c.closePath(); c.fill();
    // fuze tip
    c.fillStyle = '#39424a';
    c.fillRect(cx - 2, 3, 4, 3.5);
    // painted HE nose band + body ring
    c.fillStyle = band;
    c.beginPath();
    c.moveTo(cx - 7.1, 12); c.quadraticCurveTo(cx, 7, cx + 7.1, 12);
    c.lineTo(cx + 7.6, 16); c.quadraticCurveTo(cx, 10.5, cx - 7.6, 16);
    c.closePath(); c.fill();
    c.fillRect(cx - 8, 36, 16, 2.6);
  } else {
    // AP: classic sharp ogive over a short case
    c.fillStyle = steel;
    c.beginPath();
    c.moveTo(cx - 7, 44);
    c.lineTo(cx - 7, 18);
    c.quadraticCurveTo(cx - 6, 8, cx, 3);
    c.quadraticCurveTo(cx + 6, 8, cx + 7, 18);
    c.lineTo(cx + 7, 44);
    c.closePath(); c.fill();
    c.fillStyle = band;
    c.fillRect(cx - 7, 34, 14, 3);
  }
  // shared soft left highlight
  c.fillStyle = 'rgba(255,255,255,0.13)';
  c.fillRect(cx - 1.5, 12, 1.6, 26);
}

// Team-panel row icon: the tank's actual side-profile silhouette (generated
// from the shipped model by tools/genIcons.mjs), tinted via CSS mask.
// Unspotted enemies dim to a ghost of the same shape (WoT reads "known but
// not visible").

const HUD_CSS = `
.cot-hud{position:fixed;inset:0;pointer-events:none;z-index:40;font-family:${FONT_STACK};
  -webkit-user-select:none;user-select:none;color:#e6edf3;overflow:hidden;}
.cot-hud *{box-sizing:border-box;margin:0;padding:0;}
.cot-snipefx{position:absolute;inset:0;display:none;
  -webkit-backdrop-filter:contrast(1.42) saturate(1.45) brightness(.86);
  backdrop-filter:contrast(1.42) saturate(1.45) brightness(.86);}
.cot-ret{position:absolute;inset:0;width:100%;height:100%;display:block;}
.cot-top{position:absolute;top:0;left:50%;transform:translateX(-50%);display:flex;
  align-items:center;gap:11px;padding:6px 30px 7px;
  background:linear-gradient(180deg,rgba(7,10,14,.9),rgba(7,10,14,.62));
  border:1px solid rgba(146,164,180,.3);border-top:none;
  box-shadow:0 3px 14px rgba(0,0,0,.45);
  clip-path:polygon(0 0,100% 0,calc(100% - 16px) 100%,16px 100%);}
.cot-top .fg{color:${PEN_GREEN};font-size:23px;font-weight:700;line-height:1;
  font-family:${FONT_COND};font-stretch:condensed;
  font-variant-numeric:tabular-nums;text-shadow:0 1px 2px rgba(0,0,0,.8);}
.cot-top .fe{color:${PEN_RED};font-size:23px;font-weight:700;line-height:1;
  font-family:${FONT_COND};font-stretch:condensed;
  font-variant-numeric:tabular-nums;text-shadow:0 1px 2px rgba(0,0,0,.8);}
.cot-top .tm{font-size:14px;font-weight:600;color:#d6e2ec;letter-spacing:.1em;
  font-family:${FONT_COND};font-stretch:condensed;text-shadow:0 1px 2px rgba(0,0,0,.8);
  font-variant-numeric:tabular-nums;line-height:1;padding:0 4px;}
.cot-top .wedge{display:flex;gap:3px;align-items:center;}
.cot-top .wedge i{display:block;width:13px;height:8px;transform:skewX(-24deg);
  background:rgba(126,232,126,.85);box-shadow:0 1px 2px rgba(0,0,0,.5);}
.cot-top .wedge.r i{transform:skewX(24deg);background:rgba(240,90,90,.85);}
.cot-top .wedge i.off{background:rgba(126,232,126,.16);box-shadow:none;}
.cot-top .wedge.r i.off{background:rgba(240,90,90,.16);box-shadow:none;}
.cot-top .wedge i.ghost{background:transparent;box-shadow:none;
  border:1px solid rgba(146,164,180,.22);}
.cot-top .wedge.r i.ghost{background:transparent;border:1px solid rgba(146,164,180,.22);}
.cot-ear{position:absolute;top:52px;width:194px;display:flex;flex-direction:column;gap:2px;}
.cot-ear.l{left:0;}
.cot-ear.r{right:0;}
.cot-ear .hd{font-size:10px;font-weight:700;letter-spacing:.2em;color:#8a97a3;
  font-family:${FONT_COND};font-stretch:condensed;
  text-transform:uppercase;padding:2px 10px 3px;display:flex;justify-content:space-between;
  background:rgba(7,10,14,.55);}
.cot-ear.l .hd{border-left:2px solid rgba(126,232,126,.75);}
.cot-ear.r .hd{border-right:2px solid rgba(240,90,90,.75);text-align:right;}
.cot-er{display:flex;align-items:center;gap:6px;padding:3px 10px 3px 8px;font-size:11px;
  font-weight:600;letter-spacing:.02em;color:#d6e2ec;position:relative;
  text-shadow:0 1px 2px rgba(0,0,0,.85);}
.cot-ear.l .cot-er{background:linear-gradient(90deg,rgba(7,10,14,.72) 0%,rgba(7,10,14,.15) 100%);
  border-left:2px solid rgba(126,232,126,.75);}
.cot-ear.r .cot-er{background:linear-gradient(270deg,rgba(7,10,14,.72) 0%,rgba(7,10,14,.15) 100%);
  border-right:2px solid rgba(240,90,90,.75);flex-direction:row-reverse;}
.cot-er .ic{width:30px;height:12px;flex:0 0 auto;}
.cot-ear.r .cot-er .ic{transform:scaleX(-1);}
.cot-er .n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;}
.cot-ear.r .cot-er .n{text-align:right;}
.cot-er.me .n{color:#ffd27a;}
.cot-er .hpm{position:absolute;left:8px;right:10px;bottom:1px;height:2px;
  background:rgba(255,255,255,.1);}
.cot-er .hpm i{display:block;height:100%;background:currentColor;}
.cot-ear.l .cot-er .hpm i{background:rgba(126,232,126,.8);}
.cot-ear.r .cot-er .hpm i{background:rgba(240,120,110,.8);}
.cot-er.dead{opacity:.38;}
.cot-er.dead .n{text-decoration:line-through;text-decoration-color:rgba(240,90,90,.8);}
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
.cot-dlog{position:absolute;left:16px;bottom:362px;display:flex;flex-direction:column;gap:2px;}
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
.cot-minimap{position:absolute;right:16px;bottom:16px;width:220px;height:220px;
  border:1px solid rgba(210,225,240,.28);box-shadow:0 6px 22px rgba(0,0,0,.55);
  background:#0d1310;}
.cot-minimap canvas{display:block;width:220px;height:220px;}
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

  // Warm the tinted-blip cache at boot: the minimap draws synchronously each
  // frame (and exactly once in forced screenshot views), so the roster's
  // top-down silhouettes must already be decoded when a battle starts.
  for (const id of TANK_IDS) {
    tintedIcon(id, 'top_silhouette', PEN_GREEN);
    tintedIcon(id, 'top_silhouette', PEN_RED);
  }

  const root = el('div', 'cot-hud');
  document.body.appendChild(root);

  // --- layers (order matters: snipefx sits under everything else) ---
  const snipeFx = el('div', 'cot-snipefx', root);
  const retCanvas = el('canvas', 'cot-ret', root);
  const ctx = retCanvas.getContext('2d');
  const hpLayer = el('div', 'cot-hpbars', root);
  const dmgLayer = el('div', 'cot-dmglayer', root);

  // --- top score/timer plate ---
  const topPlate = el('div', 'cot-top', root);
  topPlate.innerHTML = `<div class="wedge l"></div><b class="fg">0</b>` +
    `<span class="tm">15:00</span><b class="fe">0</b><div class="wedge r"></div>`;
  const fgEl = topPlate.querySelector('.fg');
  const feEl = topPlate.querySelector('.fe');
  const tmEl = topPlate.querySelector('.tm');
  const wedgeL = topPlate.querySelector('.wedge.l');
  const wedgeR = topPlate.querySelector('.wedge.r');
  // Symmetric pip rows: both wedges render the SAME number of slots
  // (max team size) so the two sides read as one visual language.
  // lit = alive, dim = dead, ghost outline = slot beyond that team's size.
  function syncWedge(wEl, slots, total, alive, reverse) {
    if (wEl.children.length !== slots) {
      wEl.textContent = '';
      for (let i = 0; i < slots; i++) el('i', '', wEl);
    }
    for (let i = 0; i < slots; i++) {
      // left wedge fills from the outside in, right mirrors it
      const idx = reverse ? i : slots - 1 - i;
      const g = idx >= total;
      wEl.children[i].classList.toggle('ghost', g);
      wEl.children[i].classList.toggle('off', !g && idx >= alive);
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
  const alertEl = el('div', 'cot-alert', root);
  const bounceEl = el('div', 'cot-bounce', root); // WoT-style "Ricochet!" line

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
  for (let i = 0; i < CONSUMABLES.length; i++) {
    const c = CONSUMABLES[i];
    const s = el('div', 'cot-con', shellBox);
    s.title = c.label;
    s.innerHTML = `<div class="key">${c.key}</div>${c.svg}` +
      `<div class="cnt">${c.count != null ? c.count : ''}</div><div class="cool"></div>`;
    s.addEventListener('click', () => {
      bus.emit('ui:consumable', { slot: i });
      bus.emit('ui:click', {});
    });
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
  let hitMark = null; // { t0, bounced } — reticle hit-confirm marker (own shots)
  let bounceTimer = null;
  const hpPool = new Map(); // tank id -> { root, fill, nm, lastFrac }
  const spotById = new Map(); // tank id -> { vis, lastT, lastX, lastZ, ever }
  let mapWorldSize = 1024;
  let lastScore = '';
  let lastTimer = '';

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

  window.addEventListener('keydown', (e) => {
    if (mode === 'hidden') return;
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
      const slot = Number(e.code.slice(-1)) - 1;
      selectSlot(slot);
      bus.emit('ui:shellSelect', { slot });
      bus.emit('ui:click', {});
    }
  });

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
        sp.lastX = t.state.pos.x; sp.lastZ = t.state.pos.z;
        continue;
      }
      const dx = t.state.pos.x - pp.x;
      const dz = t.state.pos.z - pp.z;
      const d = Math.hypot(dx, dz);
      const seen = d <= SPOT_RANGE_M &&
        hasLOS(pp.x, pp.y + 2.6, pp.z, t.state.pos.x, t.state.pos.y + 1.9, t.state.pos.z);
      if (seen) {
        sp.lastT = frame.timeS;
        sp.lastX = t.state.pos.x; sp.lastZ = t.state.pos.z;
        sp.ever = true;
      }
      sp.vis = seen || (frame.timeS - sp.lastT) < SPOT_PERSIST_S;
      if (sp.vis) { sp.lastX = t.state.pos.x; sp.lastZ = t.state.pos.z; }
    }
  }

  function isSpotted(id) {
    const sp = spotById.get(id);
    return sp ? sp.vis : true;
  }

  // ---------- team panels + score plate ----------
  function updateTeams(frame) {
    const tanks = frame.tanks || [];
    let allyAlive = 0, allyTotal = 0, enemyAlive = 0, enemyTotal = 0;
    for (let i = 0; i < tanks.length; i++) {
      const t = tanks[i];
      if (!t || !t.spec) continue;
      const ally = t.team === 'player' || t.isPlayer;
      const dead = !!(t.combat && t.combat.destroyed);
      if (ally) { allyTotal++; if (!dead) allyAlive++; }
      else { enemyTotal++; if (!dead) enemyAlive++; }
      let row = earRows.get(t.id);
      if (!row) {
        const r = el('div', 'cot-er');
        const color = ally ? PEN_GREEN : PEN_RED;
        r.innerHTML = `<span class="ic"></span><span class="n"></span><div class="hpm"><i></i></div>`;
        maskIcon(r.querySelector('.ic'), t.spec.id, 'side_silhouette', color);
        if (t.isPlayer) r.classList.add('me');
        r.querySelector('.n').textContent = t.spec.name;
        (ally ? earL : earR).appendChild(r);
        row = {
          root: r, hp: r.querySelector('.hpm i'), ic: r.querySelector('.ic'),
          ally, cls: t.spec.class, lastFrac: -1, wasDead: null, wasSpotted: ally,
        };
        earRows.set(t.id, row);
      }
      if (dead !== row.wasDead) { row.root.classList.toggle('dead', dead); row.wasDead = dead; }
      // enemy silhouettes: solid while spotted, dimmed ghost while unspotted
      if (!ally) {
        const sp = dead || isSpotted(t.id);
        if (sp !== row.wasSpotted) {
          row.ic.style.opacity = sp ? '' : '0.35';
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
      fgEl.textContent = String(enemyTotal - enemyAlive);
      feEl.textContent = String(allyTotal - allyAlive);
      const slots = Math.max(allyTotal, enemyTotal);
      syncWedge(wedgeL, slots, allyTotal, allyAlive, false);
      syncWedge(wedgeR, slots, enemyTotal, enemyAlive, true);
      earL.querySelector('.al').textContent = `${allyAlive} / ${allyTotal}`;
      earR.querySelector('.al').textContent = `${enemyAlive} / ${enemyTotal}`;
      lastScore = score;
    }
    const timer = fmtTimer(BATTLE_DURATION_S - frame.timeS);
    if (timer !== lastTimer) { tmEl.textContent = timer; lastTimer = timer; }
  }

  // ---------- reticle / scope canvas ----------
  // WoT sniper mode: FULL-SCREEN view, no telescope mask and no full-width
  // sim-style rule. A firm corner scope-shadow vignette (~25% darkening), a
  // faint optics tint with a cool chromatic fringe at the edges, a SHORT
  // labeled mil-scale near the center, and a zoom plate. The dispersion
  // circle (drawReticle) stays the only circular element.
  function drawScope(zoom) {
    const cx = w / 2, cy = h / 2;
    if (!scopeGrad) {
      const r = Math.hypot(w, h) * 0.58;
      scopeGrad = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.34, cx, cy, r);
      scopeGrad.addColorStop(0, 'rgba(3,5,7,0)');
      scopeGrad.addColorStop(0.5, 'rgba(3,5,7,0.18)');
      scopeGrad.addColorStop(0.8, 'rgba(2,3,4,0.45)');
      scopeGrad.addColorStop(1, 'rgba(2,3,4,0.82)');
    }
    ctx.fillStyle = scopeGrad;
    ctx.fillRect(0, 0, w, h);
    // faint green optics tint over the whole view
    ctx.fillStyle = 'rgba(96,178,110,0.05)';
    ctx.fillRect(0, 0, w, h);
    // subtle chromatic fringe hugging the vignette (cool blue ring)
    const chrom = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.46, cx, cy, Math.hypot(w, h) * 0.52);
    chrom.addColorStop(0, 'rgba(70,110,190,0)');
    chrom.addColorStop(0.75, 'rgba(70,110,190,0.05)');
    chrom.addColorStop(1, 'rgba(90,130,215,0.12)');
    ctx.fillStyle = chrom;
    ctx.fillRect(0, 0, w, h);
    // short etched mil-scale near the center (not a full-screen rule):
    // stub hairlines with mil ticks, labeled every 2 mils.
    const gap = 46;
    const EXT = 210; // scale half-length in px from center
    const step = 41; // ~1 mil at x8 on this fov
    ctx.strokeStyle = 'rgba(10,14,12,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - EXT, cy + 0.5); ctx.lineTo(cx - gap, cy + 0.5);
    ctx.moveTo(cx + gap, cy + 0.5); ctx.lineTo(cx + EXT, cy + 0.5);
    ctx.moveTo(cx + 0.5, cy + gap); ctx.lineTo(cx + 0.5, cy + EXT);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(214,230,220,0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - EXT, cy + 0.5); ctx.lineTo(cx - gap, cy + 0.5);
    ctx.moveTo(cx + gap, cy + 0.5); ctx.lineTo(cx + EXT, cy + 0.5);
    ctx.moveTo(cx + 0.5, cy + gap); ctx.lineTo(cx + 0.5, cy + EXT);
    ctx.stroke();
    // mil ticks + numerals
    ctx.strokeStyle = 'rgba(214,230,220,0.75)';
    ctx.fillStyle = 'rgba(214,230,220,0.7)';
    ctx.font = `600 9px ${FONT_COND}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i <= 4; i++) {
      const d = gap + step * i;
      if (d > EXT) break;
      const major = i % 2 === 0;
      const tk = major ? 8 : 4;
      ctx.moveTo(cx - d + 0.5, cy - tk); ctx.lineTo(cx - d + 0.5, cy + tk);
      ctx.moveTo(cx + d + 0.5, cy - tk); ctx.lineTo(cx + d + 0.5, cy + tk);
      ctx.moveTo(cx - tk, cy + d + 0.5); ctx.lineTo(cx + tk, cy + d + 0.5);
    }
    ctx.stroke();
    for (let i = 2; i <= 4; i += 2) {
      const d = gap + step * i;
      if (d > EXT) break;
      ctx.fillText(String(i), cx - d + 0.5, cy + 20);
      ctx.fillText(String(i), cx + d + 0.5, cy + 20);
      ctx.fillText(String(i), cx + 14, cy + d + 3);
    }
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
    if (age < 0 || age > 0.6) { hitMark = null; return; }
    const a = 1 - age / 0.6;
    const r1 = 13 + age * 30;
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
  };

  function showBounceMessage(kind) {
    const text = BOUNCE_TEXT[kind];
    if (!text) return;
    bounceEl.textContent = text;
    bounceEl.classList.add('show');
    if (bounceTimer) clearTimeout(bounceTimer);
    bounceTimer = setTimeout(() => bounceEl.classList.remove('show'), 2200);
  }

  function drawReticle(view, dt) {
    const col = penColor(view.penRatio);
    const cx = view.cx, cy = view.cy;
    // bloom/shrink smoothing toward target pixel radius.
    // Visual scale: WoT's arcade circle is a stylized (enlarged) rendering of
    // the true dispersion cone — a raw projection is near-invisible at range.
    const targetR = Math.max(34, view.radPx * 3.0);
    const k = 1 - Math.exp(-14 * dt);
    smoothRadPx += (targetR - smoothRadPx) * k;
    const r = Math.max(20, Math.min(smoothRadPx, Math.min(w, h) * 0.42));

    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 1.8;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 2;
    // dispersion circle (bloom/shrink — independent of the central marker)
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // cardinal ticks (inward)
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let q = 0; q < 4; q++) {
      const a = q * Math.PI / 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      ctx.moveTo(cx + ca * r, cy + sa * r);
      ctx.lineTo(cx + ca * (r - 11), cy + sa * (r - 11));
    }
    ctx.stroke();
    // central aim marker: dot + fine cross, ALWAYS visible (WoT keeps the
    // aim point clear — the reload timer lives below, never on the marker)
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy + 0.5); ctx.lineTo(cx - 5, cy + 0.5);
    ctx.moveTo(cx + 5, cy + 0.5); ctx.lineTo(cx + 14, cy + 0.5);
    ctx.moveTo(cx + 0.5, cy - 14); ctx.lineTo(cx + 0.5, cy - 5);
    ctx.moveTo(cx + 0.5, cy + 5); ctx.lineTo(cx + 0.5, cy + 14);
    ctx.stroke();
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

    // --- under-center info stack (WoT layout: timer sits BELOW the aim
    // point, never on it) -------------------------------------------------
    const rl = view.reload;
    const reloading = rl && rl.totalS > 0 && rl.t > 0.001;
    const infoY = cy + Math.max(44, Math.min(r * 0.62, 86)); // clear of the marker, tracks bloom
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 3;
    if (reloading) {
      // countdown numeral + thin sweep bar beneath it
      ctx.fillStyle = '#f0a030';
      ctx.font = `700 17px ${FONT_COND}`;
      ctx.fillText(rl.t >= 10 ? `${Math.ceil(rl.t)}` : `${rl.t.toFixed(1)}`, cx, infoY);
      const frac = 1 - rl.t / rl.totalS;
      const bw = 46;
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(8,11,14,0.72)';
      ctx.fillRect(cx - bw / 2, infoY + 6, bw, 3);
      ctx.fillStyle = '#f0a030';
      ctx.fillRect(cx - bw / 2, infoY + 6, bw * frac, 3);
      ctx.shadowBlur = 3;
    }
    // selected shell count right of the timer spot (always visible)
    const shSp = lastShells && lastShells[localSlot];
    if (shSp) {
      ctx.font = `700 13px ${FONT_COND}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = SHELL_TYPE_COLOR[shSp.type] || 'rgba(222,232,242,0.9)';
      ctx.fillText(`${shellCount(shSp)}`, cx + 32, infoY);
      ctx.textAlign = 'center';
    }
    // distance readout under the timer line
    if (view.distM != null && isFinite(view.distM)) {
      ctx.fillStyle = 'rgba(214,226,236,0.88)';
      ctx.font = `600 12px ${FONT_COND}`;
      ctx.fillText(`${Math.round(view.distM)} m`, cx, infoY + (reloading ? 24 : 2));
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

  // ---------- minimap ----------
  function worldToMap(x, z) {
    // +X right, +Z up (north)
    const half = mapWorldSize / 2;
    return [((x + half) / mapWorldSize) * MM, ((half - z) / mapWorldSize) * MM];
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
    // buildings: sharp light-gray footprints with a dark keyline
    if (f.buildings) {
      octx.fillStyle = pal.buildingFill;
      octx.strokeStyle = 'rgba(24,29,36,0.85)';
      octx.lineWidth = 0.7;
      for (const b of f.buildings) {
        const [px, py] = worldToMap(b.x, b.z);
        octx.save();
        octx.translate(px, py);
        octx.rotate(-(b.rot || 0));
        const bw = Math.max(3, (b.w / mapWorldSize) * MM);
        const bd = Math.max(3, (b.d / mapWorldSize) * MM);
        octx.fillRect(-bw / 2, -bd / 2, bw, bd);
        octx.strokeRect(-bw / 2, -bd / 2, bw, bd);
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
    // panel edge because labels sit at cell centers inside a full-width strip
    octx.fillStyle = 'rgba(5,8,11,0.55)';
    octx.fillRect(0, 0, MM, 8);
    octx.fillRect(0, 8, 8, MM - 8);
    octx.font = `700 6.5px ${FONT_COND}`;
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillStyle = 'rgba(228,238,248,0.82)';
    for (let i = 0; i < 10; i++) {
      const c = i * MM / 10 + MM / 20;
      octx.fillText(GRID_LETTERS[i], c, 4.5);
      octx.fillText(String(i + 1), 4, Math.max(c, 14) + 0.5);
    }
    octx.textAlign = 'left';
    octx.textBaseline = 'alphabetic';
    // inner vignette edge
    octx.strokeStyle = 'rgba(0,0,0,0.45)';
    octx.lineWidth = 1.5;
    octx.strokeRect(0.75, 0.75, MM - 1.5, MM - 1.5);
    mmBg = out;
  }

  // canvas rotation that makes a forward-up sprite/shape point along hull yaw
  // (same mapping the player arrow has always used)
  const blipAngle = (yaw) => Math.atan2(-Math.cos(yaw), Math.sin(yaw)) + Math.PI / 2;

  // minimap blip: the tank's actual top-down silhouette (tools/genIcons.mjs),
  // tinted green (allies/self) or red (enemies) and rotated to hull heading
  function drawIconBlip(c, x, y, yaw, specId, color, alpha, sizePx = 15) {
    const icon = specId ? tintedIcon(specId, 'top_silhouette', color) : null;
    if (!icon) return false;
    c.save();
    c.translate(x, y);
    c.rotate(blipAngle(yaw));
    c.globalAlpha = alpha;
    c.drawImage(icon, -sizePx / 2, -sizePx / 2, sizePx, sizePx);
    c.restore();
    return true;
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
      const specId = t.spec ? t.spec.id : null;
      if (ally) {
        const [px, py] = worldToMap(t.state.pos.x, t.state.pos.z);
        if (!drawIconBlip(mmCtx, px, py, t.state.yaw, specId, PEN_GREEN, 0.95)) {
          drawBlip(mmCtx, px, py, cls, PEN_GREEN, 0.95, false);
        }
        continue;
      }
      const sp = spotById.get(t.id);
      if (sp && sp.vis) {
        const [px, py] = worldToMap(t.state.pos.x, t.state.pos.z);
        if (!drawIconBlip(mmCtx, px, py, t.state.yaw, specId, PEN_RED, 0.95)) {
          drawBlip(mmCtx, px, py, cls, PEN_RED, 0.95, false);
        }
      } else if (sp && sp.ever) {
        // last-known-position ghost marker
        const [px, py] = worldToMap(sp.lastX, sp.lastZ);
        drawBlip(mmCtx, px, py, cls, 'rgba(240,120,110,0.9)', 0.45, true);
      }
      // never spotted -> nothing on the map
    }
    // player: render-range square + spot-range circle + view wedge + arrow
    if (player && player.state) {
      const st = player.state;
      const [px, py] = worldToMap(st.pos.x, st.pos.z);
      const pxPerM = MM / mapWorldSize;
      // white draw-distance square
      const rsq = RENDER_RANGE_M * pxPerM;
      mmCtx.strokeStyle = 'rgba(240,246,252,0.55)';
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
        _fwd.set(0, 0, -1).transformDirection(frame.camera.matrixWorld);
        const camAng = Math.atan2(-_fwd.z, _fwd.x); // canvas angle (y down, +Z up on map)
        mmCtx.fillStyle = 'rgba(235,245,255,0.16)';
        mmCtx.beginPath();
        mmCtx.moveTo(px, py);
        mmCtx.arc(px, py, 30, camAng - 0.42, camAng + 0.42);
        mmCtx.closePath();
        mmCtx.fill();
      }
      // self marker: own top-down silhouette in green, oriented to hull heading
      const selfSpecId = (player.spec && player.spec.id) || specIdById.get(player.id);
      if (!drawIconBlip(mmCtx, px, py, st.yaw, selfSpecId, '#7ee87e', 1, 17)) {
        const yawAng = Math.atan2(-Math.cos(st.yaw), Math.sin(st.yaw)); // canvas angle of hull forward
        mmCtx.save();
        mmCtx.translate(px, py);
        mmCtx.rotate(yawAng + Math.PI / 2);
        mmCtx.fillStyle = '#7ee87e';
        mmCtx.beginPath();
        mmCtx.moveTo(0, -5.5); mmCtx.lineTo(4, 4.5); mmCtx.lineTo(-4, 4.5);
        mmCtx.closePath();
        mmCtx.fill();
        mmCtx.restore();
      }
      // turret direction line
      const tAng = st.yaw + st.turretYaw;
      mmCtx.strokeStyle = 'rgba(126,232,126,0.7)';
      mmCtx.lineWidth = 1.2;
      mmCtx.beginPath();
      mmCtx.moveTo(px, py);
      mmCtx.lineTo(px + Math.sin(tAng) * 14, py - Math.cos(tAng) * 14);
      mmCtx.stroke();
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
    else if (hit.kind === 'spaced_absorb' || hit.kind === 'era') { d.classList.add('miss'); d.textContent = 'ABSORBED'; }
    else if (hit.damage > 0) {
      d.textContent = `-${Math.round(hit.damage)}`;
      if (hit.modulesHit && hit.modulesHit.length) {
        const c = el('span', 'crit', d);
        c.textContent = 'CRIT';
      }
    } else { d.remove(); return; }
    d.style.left = `${_sx.toFixed(0)}px`;
    d.style.top = `${_sy.toFixed(0)}px`;
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
  bus.on('shell:hit', (hit) => {
    if (playerId != null && hit.attackerId === playerId && hit.targetId && hit.targetId !== playerId) {
      pushDamageNumber(hit);
      const bounced = hit.kind === 'ricochet' || hit.kind === 'nonpen' ||
        hit.kind === 'spaced_absorb' || hit.kind === 'era';
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
    cx: 0, cy: 0, radPx: 40, penRatio: null, distM: null,
    gunX: null, gunY: null, atGunLimit: false,
    reload: { t: 0, totalS: 1 }, zoom: 1,
  };

  function assembleAimView(camera, aim) {
    aimView.penRatio = aim.penRatio != null ? aim.penRatio : null;
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

  function applyMode() {
    root.style.display = mode === 'hidden' ? 'none' : 'block';
    // sniper contrast/saturation recovery layer (counteracts scene fog wash-out)
    snipeFx.style.display = mode === 'sniper' ? 'block' : 'none';
  }

  // ---------- public API ----------
  const hud = {
    root,

    /**
     * Switch overall HUD mode.
     * @param {'battle'|'sniper'|'hidden'} m
     */
    setMode(m) {
      const wasHidden = mode === 'hidden';
      mode = m;
      applyMode();
      mmDirty = true; // guarantee a minimap draw on the next update()
      if (m === 'hidden') ctx.clearRect(0, 0, w, h);
      if (m === 'battle' && wasHidden) {
        // fresh battle: drop spotting memory and team rosters from the last one
        spotById.clear();
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
      const camera = frame.camera;
      lastCamera = camera || lastCamera;
      const dt = Math.max(0, Math.min(0.1, frame.timeS - lastTimeS)) || 1 / 60;
      lastTimeS = frame.timeS;
      if (frame.mode && frame.mode !== mode) { mode = frame.mode; applyMode(); mmDirty = true; }
      playerRef = frame.player || playerRef;
      if (frame.player) playerId = frame.player.id;
      const tanks = frame.tanks || [];
      for (let i = 0; i < tanks.length; i++) {
        const t = tanks[i];
        if (t && t.spec) { nameById.set(t.id, t.spec.name); specIdById.set(t.id, t.spec.id); }
      }
      if (mode === 'hidden') { ctx.clearRect(0, 0, w, h); return; }
      if (camera) { camera.updateMatrixWorld(); _mInv.copy(camera.matrixWorld).invert(); }

      updateSpotting(frame);
      updateTeams(frame);

      const aim = frame.aim || {};
      assembleAimView(camera, aim);
      if (aim.shells) lastShells = aim.shells;
      const slot = aim.shellSlot != null ? aim.shellSlot : localSlot;
      renderShells(lastShells, slot);
      updateShellCooldown(aim.reload, slot);
      renderCanvas(dt);
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
      forced = Object.assign({}, f);
      assembleAimView(lastCamera, forced);
      smoothRadPx = Math.max(34, aimView.radPx * 3.0); // no bloom animation in a forced still
      if (forced.shells) lastShells = forced.shells;
      const slot = forced.shellSlot != null ? forced.shellSlot : localSlot;
      renderShells(lastShells, slot);
      updateShellCooldown(forced.reload, slot);
      renderCanvas(1);
    },
  };

  return hud;
}
