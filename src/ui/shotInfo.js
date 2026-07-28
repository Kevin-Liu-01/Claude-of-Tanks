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
import { maskIcon } from './icons.js';
import { getSpec } from '../vehicles/specs.js';

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

const SI_CSS = `
.cot-si{position:absolute;inset:0;pointer-events:none;font-family:${FONT_STACK};color:${COL.text};}
.cot-si *{box-sizing:border-box;margin:0;padding:0;}
.cot-si-cardhost{position:absolute;right:16px;top:288px;width:262px;display:flex;
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
.cot-si-log{position:absolute;right:16px;top:288px;width:262px;display:none;
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
.cot-si-toast .l2 .m{color:${COL.red};font-weight:800;text-transform:uppercase;
  font-family:${FONT_COND};font-stretch:condensed;letter-spacing:.07em;}
.cot-si-stats{position:fixed;left:50%;bottom:5vh;transform:translateX(-50%);z-index:71;
  display:none;width:660px;max-width:92vw;pointer-events:none;font-family:${FONT_STACK};
  color:${COL.text};background:linear-gradient(180deg,rgba(10,14,18,.94),rgba(6,9,12,.96));
  border:1px solid rgba(146,164,180,.35);box-shadow:0 10px 40px rgba(0,0,0,.6);
  padding:12px 18px 14px;}
.cot-si-stats.show{display:block;}
.cot-si-stats *{box-sizing:border-box;margin:0;padding:0;}
.cot-si-stats .ttl{font-size:11px;font-weight:800;letter-spacing:.3em;color:${COL.dim};
  font-family:${FONT_COND};font-stretch:condensed;text-transform:uppercase;
  text-align:center;margin-bottom:9px;}
.cot-si-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px 14px;margin-bottom:10px;}
.cot-si-stat{text-align:center;}
.cot-si-stat .v{font-size:21px;font-weight:800;font-family:${FONT_COND};
  font-stretch:condensed;font-variant-numeric:tabular-nums;color:#f2f7fb;line-height:1.1;}
.cot-si-stat .k{font-size:8.5px;font-weight:700;letter-spacing:.16em;color:${COL.dim};
  text-transform:uppercase;font-family:${FONT_COND};font-stretch:condensed;}
.cot-si-kills{border-top:1px solid rgba(146,164,180,.2);padding-top:7px;}
.cot-si-kill{display:flex;align-items:center;gap:8px;font-size:11px;padding:2.5px 0;
  font-variant-numeric:tabular-nums;}
.cot-si-kill .si{width:34px;height:14px;flex:0 0 auto;}
.cot-si-kill .n{flex:1;color:#dbe6ef;font-weight:600;}
.cot-si-kill .kd{color:${COL.red};font-weight:800;font-size:9px;letter-spacing:.12em;
  font-family:${FONT_COND};font-stretch:condensed;}
.cot-si-kill .s{color:${COL.dim};font-size:10px;}
.cot-si-kill .dm{color:#ffd166;font-weight:800;font-family:${FONT_COND};
  font-stretch:condensed;width:52px;text-align:right;}
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

  function newStats() {
    return {
      fired: 0, hits: 0, pens: 0, dealt: 0, received: 0, blocked: 0,
      modulesDestroyed: 0, perTarget: new Map(),
    };
  }

  // ---------- armor mini-diagram ----------
  // Icon framing (tools/icons-page.html): bbox-normalized ortho renders with
  // MARGIN 1.07. Hull-local extent approximated from spec.dims exactly like
  // damagePanel.js: z in [-hullL/2, overallL - hullL/2] -> center (overall-hull)/2.
  function diagramFor(ev) {
    const specId = ev.targetSpecId || ev.targetId;
    let dims = null;
    try { dims = specId ? getSpec(specId).dims : null; } catch (_) { dims = null; }
    const wrap = el('div', 'cot-si-diag');
    if (!dims || !ev.localPos) {
      wrap.remove();
      return null;
    }
    const czOff = (dims.overallLengthM - dims.hullLengthM) / 2;
    const lp = ev.localPos;
    const ld = ev.localDir;

    // --- top view (72x72; icon: forward = up, screen right = -X world) ---
    const TS = 72;
    const top = el('div', 'box', wrap);
    top.style.width = `${TS}px`; top.style.height = `${TS}px`;
    const topSil = el('div', 'sil', top);
    maskIcon(topSil, specId, 'top_silhouette', 'rgba(196,212,226,0.34)');
    const halfT = (Math.max(dims.widthM, dims.overallLengthM) / 2) * ICON_MARGIN;
    const sT = (TS / 2) / halfT;
    const topPx = (x, z) => [TS / 2 - x * sT, TS / 2 - (z - czOff) * sT];
    const [hx, hy] = topPx(lp[0], lp[2]);
    let arrow = '';
    if (ld) {
      const [ax, ay] = topPx(lp[0] - ld[0] * 2.2, lp[2] - ld[2] * 2.2);
      arrow = `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}"
        stroke="#ff8a5c" stroke-width="1.6" marker-end="url(#cotsiarw)"/>`;
    }
    const ovT = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ovT.setAttribute('class', 'ov');
    ovT.setAttribute('viewBox', `0 0 ${TS} ${TS}`);
    ovT.innerHTML =
      `<defs><marker id="cotsiarw" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="5"
        markerHeight="5" orient="auto"><path d="M0 0L8 4L0 8z" fill="#ff8a5c"/></marker></defs>` +
      arrow +
      `<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="3.4" fill="none" stroke="#fff" stroke-width="1"/>` +
      `<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="1.7" fill="#ff8a5c"/>`;
    top.appendChild(ovT);

    // --- side view (aspect 2:1; icon: front = right, up = +Y) ---
    const SW = 96, SH = 48;
    const side = el('div', 'box', wrap);
    side.style.width = `${SW}px`; side.style.height = `${SH}px`;
    const sideSil = el('div', 'sil', side);
    maskIcon(sideSil, specId, 'side_silhouette', 'rgba(196,212,226,0.34)');
    const halfS = Math.max(dims.heightM / 2, dims.overallLengthM / 4) * ICON_MARGIN;
    const sS = (SH / 2) / halfS;
    const sx = SW / 2 + (lp[2] - czOff) * sS;
    const sy = SH / 2 - (lp[1] - dims.heightM / 2) * sS;
    const ovS = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ovS.setAttribute('class', 'ov');
    ovS.setAttribute('viewBox', `0 0 ${SW} ${SH}`);
    ovS.innerHTML =
      `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="3.2" fill="none" stroke="#fff" stroke-width="1"/>` +
      `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="1.6" fill="#ff8a5c"/>`;
    side.appendChild(ovS);
    return wrap;
  }

  function modChips(ev, parent) {
    const items = [];
    for (const m of ev.modulesHit || []) {
      items.push({ glyph: GLYPH[m.module] || GLYPH.gun, label: MODULE_LABEL[m.module] || m.module,
        col: m.newState === 'red' ? COL.red : COL.yellow });
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
      `<span><span class="ty" style="color:${tyCol}">${ev.shellType}</span> ${ev.shellName || ''}</span>` +
      `<span>${ev.targetName || ''}</span>`;

    const rows = el('div', 'cot-si-rows', card);
    const kv = (k, v) => {
      const r = el('div', 'cot-si-kv', rows);
      r.innerHTML = `<span>${k}</span><b>${v}</b>`;
    };
    const hasArmor = (ev.nominalMm || 0) > 0 || (ev.effectiveMm || 0) > 0;
    kv('Distance', `${Math.round(ev.flightDistM || 0)} m`);
    kv('Angle', `${Math.round(ev.impactAngleDeg || 0)}°`);
    kv('Armor', hasArmor
      ? `${Math.round(ev.nominalMm || 0)}→${Math.round(ev.effectiveMm || 0)} mm`
      : '—');
    kv('Pen roll', (ev.penRollMm || 0) > 0 ? `${Math.round(ev.penRollMm)} mm` : '—');
    kv('Damage', `${Math.round(ev.damage || 0)} / ${Math.round(ev.dmgRoll || 0)}`);
    kv('Result', ev.destroyed ? 'DESTROYED' : `${Math.max(0, Math.round(ev.targetHpAfter || 0))} hp left`);

    const diag = diagramFor(ev);
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
    const modsLost = (ev.modulesHit || [])
      .map((m) => `${MODULE_LABEL[m.module] || m.module}${m.newState === 'red' ? ' ✕' : ''}`)
      .concat((ev.crewHit || []).map((c) => `${CREW_LABEL[c] || c} ✕`))
      .join(', ');
    t.innerHTML =
      `<div class="l1"><span>${ev.attackerName || 'Enemy'}</span>` +
      `<b>${(ev.damage || 0) > 0 ? `−${Math.round(ev.damage)}` : cls.badge}</b></div>` +
      `<div class="l2"><span>${ev.shellType || ''} ${ev.shellName || ''} · ${zoneLabel(ev.zone)}</span>` +
      `${modsLost ? `<span class="m">${modsLost}</span>` : ''}</div>`;
    if (!(ev.damage > 0)) {
      t.style.borderLeftColor = COL.green;
      t.querySelector('.l1 b').style.color = COL.green;
    }
    while (toastHost.children.length > 3) toastHost.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 4600);
    setTimeout(() => { if (t.parentNode) t.remove(); }, 5500);
  }

  // ---------- 4. session stats ----------
  function renderStats(result) {
    statsRoot.textContent = '';
    const ttl = el('div', 'ttl', statsRoot);
    ttl.textContent = `Battle report — ${result || ''}`;
    const grid = el('div', 'cot-si-grid', statsRoot);
    const stat = (v, k) => {
      const s = el('div', 'cot-si-stat', grid);
      s.innerHTML = `<div class="v">${v}</div><div class="k">${k}</div>`;
    };
    const penRate = stats.hits > 0 ? Math.round((stats.pens / stats.hits) * 100) : 0;
    stat(Math.round(stats.dealt), 'Damage dealt');
    stat(Math.round(stats.received), 'Damage received');
    stat(Math.round(stats.blocked), 'Damage blocked');
    stat([...stats.perTarget.values()].filter((t) => t.killed).length, 'Kills');
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

    const engaged = [...stats.perTarget.entries()]
      .sort((a, b) => b[1].dmg - a[1].dmg);
    if (engaged.length) {
      const kills = el('div', 'cot-si-kills', statsRoot);
      for (const [id, t] of engaged) {
        const row = el('div', 'cot-si-kill', kills);
        row.innerHTML = `<span class="si"></span><span class="n">${t.name || id}</span>` +
          `${t.killed ? '<span class="kd">DESTROYED</span>' : ''}` +
          `<span class="s">${t.hits} hit${t.hits === 1 ? '' : 's'} · ${t.pens} pen${t.pens === 1 ? '' : 's'}` +
          `${t.lastZone ? ' · ' + zoneLabel(t.lastZone) : ''}</span>` +
          `<span class="dm">−${Math.round(t.dmg)}</span>`;
        maskIcon(row.querySelector('.si'), t.specId || id, 'side_silhouette',
          t.killed ? '#f28f8f' : 'rgba(206,220,232,0.75)');
      }
    }
    statsRoot.classList.add('show');
  }

  // ---------- bookkeeping ----------
  function perTarget(ev) {
    let t = stats.perTarget.get(ev.targetId);
    if (!t) {
      t = { name: ev.targetName, specId: ev.targetSpecId, dmg: 0, hits: 0, pens: 0, killed: false, lastZone: null };
      stats.perTarget.set(ev.targetId, t);
    }
    return t;
  }

  bus.on('shell:fired', (p) => { if (p.isPlayer) stats.fired += 1; });

  bus.on('shell:hit', (ev) => {
    if (playerId == null) return;
    if (ev.attackerId === playerId && ev.targetId && ev.targetId !== playerId) {
      const cls = classify(ev);
      stats.hits += 1;
      if (PEN_KINDS.has(ev.kind)) stats.pens += 1;
      stats.dealt += ev.damage || 0;
      stats.modulesDestroyed += (ev.modulesHit || []).filter((m) => m.newState === 'red').length;
      const t = perTarget(ev);
      t.dmg += ev.damage || 0;
      t.hits += 1;
      if (PEN_KINDS.has(ev.kind)) t.pens += 1;
      if (ev.zone) t.lastZone = ev.zone;
      if (ev.destroyed) t.killed = true;
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
        t: ev.timeS || 0, dmg: ev.damage || 0, kind: ev.kind,
        attacker: ev.attackerName || 'Enemy', shellType: ev.shellType || '', mods,
      });
      showToast(ev, cls);
      if (logOpen) renderLog();
    }
  });

  bus.on('tank:destroyed', (p) => {
    if (playerId == null || p.killerId !== playerId || p.id === playerId) return;
    let t = stats.perTarget.get(p.id);
    if (!t) {
      let name = p.specId;
      try { name = getSpec(p.specId).name; } catch (_) { /* keep raw id */ }
      t = { name, specId: p.specId, dmg: 0, hits: 0, pens: 0, killed: false, lastZone: null };
      stats.perTarget.set(p.id, t);
    }
    t.killed = true;
  });

  bus.on('battle:ended', (p) => renderStats(p ? p.result : ''));
  bus.on('ui:shotLog', () => toggleLog());
  bus.on('ui:battleStart', () => api.reset());

  const api = {
    root,
    statsRoot,
    toggleLog,

    /** Latch the player entity id (hud.js forwards it each frame). */
    setPlayer(id) { playerId = id; },

    /** Hide the end-of-battle stats card (garage/hidden HUD). */
    hideStats() { statsRoot.classList.remove('show'); },

    /** Fresh battle: clear cards, toasts, logs and session stats. */
    reset() {
      while (cardHost.firstChild) cardHost.firstChild.remove();
      while (toastHost.firstChild) toastHost.firstChild.remove();
      shotLog.length = 0;
      receivedLog.length = 0;
      Object.assign(stats, newStats());
      stats.perTarget = new Map();
      logOpen = false;
      logPanel.classList.remove('open');
      statsRoot.classList.remove('show');
    },
  };
  return api;
}
