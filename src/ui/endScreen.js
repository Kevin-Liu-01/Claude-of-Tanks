/**
 * endScreen.js — cinematic battle end screen (killcam_endscreen r1).
 *
 * Replaces the old shot-info battle report as the end-of-battle surface.
 * Rendered INTO shotInfo's existing full-screen stats host (`.cot-si-stats`,
 * z 71) so every integration seam keeps working untouched: main.js's
 * veilHud() toggles that exact element around the kill-cam, and the kill-cam
 * CSS parity veil (`body.cot-kc-live .cot-si-stats`) keeps hiding it while a
 * replay owns the screen. The flow is unchanged too — shotInfo buffers
 * `battle:ended` behind its REPORT GATE and calls `show()` when the replay
 * releases the screen (killcam:done), which is exactly when the kill-cam's
 * fade-through-black sits at full black: the staggered entrance below plays
 * as the fade lifts.
 *
 * ADOPTED integration DOM (zero main.js edits):
 *  - `.cot-end` — main.js's end overlay. Its verdict/earnings lines are
 *    superseded by this screen; the overlay itself is display:none'd on show.
 *  - the overlay's RETURN TO GARAGE button (main.js endBtn) — reparented
 *    into the actions row, restyled via class, its existing click handler
 *    (bus 'ui:click' + enterGarage) kept verbatim.
 *  - BATTLE AGAIN drives the existing garage flow: the adopted button's
 *    handler enters the garage, then the garage's own `.cot-battle` button
 *    is clicked — the full loading-screen entry path, nothing re-implemented.
 *
 * DATA: every number is a resolved-event sum handed over by shotInfo
 * (buildSummary), and the credits/XP figures come straight from the
 * economy seam main.js itself prints — techtree.getLastBattleEarnings()
 * (recorded on battle:ended). Nothing here is recomputed or invented; the
 * game has no base-capture mechanic, so no capture stat is fabricated.
 */

import { FONT_STACK, FONT_COND, ensureFonts } from './fonts.js';
import { maskIcon } from './icons.js';
import { getLastBattleEarnings } from './techtree.js';
import { tierNumeral } from './battleLoad.js';

const COL = {
  amber: '#f0a030',
  amberHi: '#ffd27a',
  gold: '#ffd166',
  xp: '#9fd0ff',
  green: '#7fdc8a',
  red: '#f27a6e',
  steel: '#cfd9e2',
  text: '#e6edf3',
  dim: '#8a97a3',
};

const ES_CSS = `
.cot-es{position:fixed;inset:0;z-index:71;display:none;pointer-events:none;
  flex-direction:column;align-items:center;justify-content:center;
  padding:2.6vh 0 3vh;overflow:hidden;font-family:${FONT_STACK};color:${COL.text};
  background:
    radial-gradient(120% 90% at 50% -8%,rgba(240,160,48,.10),rgba(240,160,48,0) 46%),
    linear-gradient(180deg,rgba(5,8,12,.93),rgba(4,7,10,.86) 44%,rgba(3,5,8,.95));}
.cot-es.show{display:flex;}
.cot-es *{box-sizing:border-box;margin:0;padding:0;}
/* staggered entrance: hero first, tallies cascade, buttons last (--i steps) */
@keyframes cotEsIn{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:none;}}
@keyframes cotEsHero{from{opacity:0;transform:translateY(-10px) scale(.96);letter-spacing:.5em;}
  to{opacity:1;transform:none;}}
.cot-es .es-in{opacity:0;animation:cotEsIn .55s cubic-bezier(.2,.7,.3,1) forwards;
  animation-delay:calc(var(--i,0)*85ms);}
/* --- hero ----------------------------------------------------------------- */
.cot-es .es-kick{font-family:${FONT_COND};font-weight:800;font-size:10.5px;
  letter-spacing:.34em;text-indent:.34em;color:${COL.amber};text-transform:uppercase;
  text-align:center;}
.cot-es .es-ban{margin-top:6px;font-weight:800;font-size:clamp(44px,6.2vw,72px);
  line-height:1;letter-spacing:.3em;text-indent:.3em;text-align:center;
  text-transform:uppercase;opacity:0;
  animation:cotEsHero .7s cubic-bezier(.16,.8,.3,1) forwards;
  text-shadow:0 3px 30px rgba(0,0,0,.85);}
.cot-es .es-ban.v{color:#eafce9;text-shadow:0 0 34px rgba(127,220,138,.35),0 3px 30px rgba(0,0,0,.85);}
.cot-es .es-ban.d{color:#fceeec;text-shadow:0 0 34px rgba(242,110,100,.32),0 3px 30px rgba(0,0,0,.85);}
.cot-es .es-ban.n{color:${COL.steel};}
.cot-es .es-rule{width:132px;height:2px;margin:12px auto 0;
  background:linear-gradient(90deg,rgba(240,160,48,0),#f0a030 30%,#ffcf7d 50%,#f0a030 70%,rgba(240,160,48,0));
  box-shadow:0 0 12px rgba(240,160,48,.55);}
.cot-es .es-ban.v+.es-rule{background:linear-gradient(90deg,rgba(127,220,138,0),#5fcf74 30%,#a8f0b2 50%,#5fcf74 70%,rgba(127,220,138,0));box-shadow:0 0 12px rgba(127,220,138,.5);}
.cot-es .es-ban.d+.es-rule{background:linear-gradient(90deg,rgba(242,110,100,0),#e06055 30%,#ffb0a6 50%,#e06055 70%,rgba(242,110,100,0));box-shadow:0 0 12px rgba(242,110,100,.5);}
.cot-es .es-sub{margin-top:10px;text-align:center;font-size:13px;font-weight:600;
  color:${COL.steel};letter-spacing:.04em;}
.cot-es .es-sub b{color:#ffe4b0;font-weight:800;}
.cot-es .es-meta{margin-top:4px;text-align:center;font-family:${FONT_COND};
  font-weight:700;font-size:10px;letter-spacing:.22em;color:${COL.dim};
  text-transform:uppercase;font-variant-numeric:tabular-nums;}
.cot-es .es-meta b{color:#c8d4de;font-weight:800;}
/* --- economy -------------------------------------------------------------- */
.cot-es .es-econ{display:flex;gap:14px;margin-top:2.2vh;width:920px;max-width:92vw;}
.cot-es .es-eco{flex:1;display:flex;align-items:baseline;justify-content:center;gap:12px;
  background:linear-gradient(180deg,rgba(12,16,20,.92),rgba(7,10,13,.94));
  border:1px solid rgba(146,164,180,.28);border-top:2px solid rgba(240,160,48,.55);
  box-shadow:0 10px 34px rgba(0,0,0,.5);padding:12px 18px 13px;}
.cot-es .es-eco .k{font-family:${FONT_COND};font-weight:800;font-size:10px;
  letter-spacing:.26em;color:${COL.dim};text-transform:uppercase;}
.cot-es .es-eco .v{font-family:${FONT_COND};font-weight:800;font-size:30px;
  letter-spacing:-.01em;font-variant-numeric:tabular-nums;line-height:1;}
.cot-es .es-eco.cr .v{color:${COL.gold};}
.cot-es .es-eco.xp .v{color:${COL.xp};}
.cot-es .es-eco .s{font-size:9.5px;color:${COL.dim};letter-spacing:.06em;}
/* --- tallies -------------------------------------------------------------- */
.cot-es .es-tals{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;
  margin-top:12px;width:920px;max-width:92vw;}
.cot-es .es-tal{text-align:center;background:rgba(10,14,18,.72);
  border:1px solid rgba(146,164,180,.2);padding:9px 6px 8px;}
.cot-es .es-tal .v{font-family:${FONT_COND};font-weight:800;font-size:23px;
  letter-spacing:-.01em;font-variant-numeric:tabular-nums;color:#f2f7fb;line-height:1.05;}
.cot-es .es-tal .v i{font-style:normal;font-size:12px;color:${COL.dim};font-weight:700;}
.cot-es .es-tal .k{margin-top:3px;font-size:8.5px;font-weight:700;letter-spacing:.15em;
  color:${COL.dim};text-transform:uppercase;font-family:${FONT_COND};}
.cot-es .es-tal.hot .v{color:${COL.gold};}
/* --- best shot strip ------------------------------------------------------ */
.cot-es .es-best{display:flex;align-items:center;gap:10px;margin-top:12px;
  width:920px;max-width:92vw;padding:7px 14px;
  background:linear-gradient(90deg,rgba(240,160,48,.16),rgba(240,160,48,.03) 70%);
  border:1px solid rgba(240,160,48,.4);border-left:3px solid ${COL.amber};}
.cot-es .es-best .bk{font-family:${FONT_COND};font-weight:800;font-size:9.5px;
  letter-spacing:.24em;color:${COL.amberHi};text-transform:uppercase;flex:0 0 auto;}
.cot-es .es-best .bd{font-family:${FONT_COND};font-weight:800;font-size:17px;
  color:${COL.gold};font-variant-numeric:tabular-nums;flex:0 0 auto;letter-spacing:-.01em;}
.cot-es .es-best .bt{font-size:11px;color:${COL.steel};letter-spacing:.03em;flex:1;
  min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-variant-numeric:tabular-nums;}
.cot-es .es-best .bt b{color:#eef4f9;font-weight:700;}
/* --- columns: kills + team panels ----------------------------------------- */
.cot-es .es-cols{display:flex;gap:14px;margin-top:12px;width:1150px;max-width:95vw;
  min-height:0;flex:0 1 auto;overflow:hidden;align-items:stretch;}
.cot-es .es-panel{background:linear-gradient(180deg,rgba(10,14,18,.92),rgba(6,9,12,.95));
  border:1px solid rgba(146,164,180,.28);box-shadow:0 10px 34px rgba(0,0,0,.5);
  padding:10px 14px 12px;min-height:0;overflow-y:auto;flex:1;pointer-events:auto;}
/* the legacy integration overlay may flash its old button/earnings line in
   the frames between showEndOverlay() and the report flush — armed on
   battle:ended, this suppresses it outright (the end screen owns the frame;
   !important beats the inline display:flex showEndOverlay writes) */
body.cot-es-armed .cot-end{display:none !important;}
.cot-es .es-ph{font-size:9.5px;font-weight:800;letter-spacing:.24em;color:${COL.dim};
  text-transform:uppercase;font-family:${FONT_COND};padding-bottom:6px;
  border-bottom:1px solid rgba(146,164,180,.2);margin-bottom:6px;
  display:flex;justify-content:space-between;font-variant-numeric:tabular-nums;}
.cot-es .es-ph.ally{color:${COL.green};border-bottom-color:rgba(127,220,138,.35);}
.cot-es .es-ph.foe{color:${COL.red};border-bottom-color:rgba(242,122,114,.35);}
/* team rows — battle-load roster grammar with dead-row strikes */
.cot-es .es-tr{display:flex;align-items:center;gap:9px;height:30px;padding:0 7px;
  background:rgba(255,255,255,.024);border-left:2px solid rgba(146,164,180,.25);
  margin-bottom:3px;font-variant-numeric:tabular-nums;}
.cot-es .es-tr.ally{border-left-color:rgba(127,220,138,.45);}
.cot-es .es-tr.foe{border-left-color:rgba(242,122,114,.45);}
.cot-es .es-tr.me{background:linear-gradient(90deg,rgba(240,160,48,.18),rgba(240,160,48,.03));
  border-left-color:${COL.amber};}
.cot-es .es-tr .tier{flex:0 0 22px;text-align:center;font-family:${FONT_COND};
  font-size:10px;font-weight:700;color:${COL.amberHi};}
.cot-es .es-tr .si{flex:0 0 44px;height:18px;}
.cot-es .es-tr .nm{flex:1;min-width:0;font-size:11.5px;font-weight:600;color:#dfe8f0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cot-es .es-tr .nm .you{color:${COL.gold};font-family:${FONT_COND};font-weight:800;
  font-size:8.5px;letter-spacing:.12em;border:1px solid rgba(255,209,102,.6);
  padding:0 3px 1px;margin-right:5px;vertical-align:1px;}
.cot-es .es-tr .k{flex:0 0 34px;text-align:right;font-family:${FONT_COND};font-weight:800;
  font-size:10px;color:#dbe6ef;}
.cot-es .es-tr .dm{flex:0 0 46px;text-align:right;font-family:${FONT_COND};font-weight:800;
  font-size:10px;color:${COL.gold};letter-spacing:-.01em;}
.cot-es .es-tr .st{flex:0 0 40px;text-align:right;font-family:${FONT_COND};font-weight:800;
  font-size:8.5px;letter-spacing:.1em;color:${COL.green};opacity:.8;}
/* DEAD-ROW STRIKE: name struck through + row dimmed + red tag */
.cot-es .es-tr.dead{opacity:.62;background:rgba(120,30,24,.08);}
.cot-es .es-tr.dead .nm{color:#93a2af;text-decoration:line-through;
  text-decoration-color:rgba(242,122,114,.75);text-decoration-thickness:1.5px;}
.cot-es .es-tr.dead .st{color:${COL.red};opacity:1;}
.cot-es .es-tr.dead .si{opacity:.75;}
.cot-es .es-cap{display:flex;gap:9px;padding:0 7px 3px;
  font-family:${FONT_COND};font-weight:700;font-size:7.5px;letter-spacing:.12em;
  color:${COL.dim};text-transform:uppercase;}
.cot-es .es-cap .a{flex:1;}
.cot-es .es-cap .b{flex:0 0 34px;text-align:right;}
.cot-es .es-cap .c{flex:0 0 46px;text-align:right;}
.cot-es .es-cap .d{flex:0 0 40px;text-align:right;}
/* your kill rows */
.cot-es .es-kr{display:flex;align-items:center;gap:9px;height:28px;padding:0 7px;
  border-bottom:1px solid rgba(146,164,180,.1);font-variant-numeric:tabular-nums;}
.cot-es .es-kr .si{flex:0 0 44px;height:17px;}
.cot-es .es-kr .nm{flex:1;min-width:0;font-size:11.5px;font-weight:600;color:#eef4f9;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cot-es .es-kr .x{flex:0 0 auto;font-family:${FONT_COND};font-weight:800;font-size:9px;
  letter-spacing:.14em;color:${COL.red};}
.cot-es .es-kr .dm{flex:0 0 52px;text-align:right;font-family:${FONT_COND};font-weight:800;
  font-size:11px;color:${COL.gold};letter-spacing:-.01em;}
.cot-es .es-none{padding:8px 7px;font-size:10.5px;color:${COL.dim};letter-spacing:.04em;}
/* --- actions -------------------------------------------------------------- */
.cot-es .es-actions{display:flex;gap:14px;margin-top:2.2vh;pointer-events:auto;}
.cot-es .cot-es-btn{font-family:${FONT_COND};font-weight:800;font-size:13.5px;
  letter-spacing:.22em;text-indent:.11em;text-transform:uppercase;cursor:pointer;
  padding:13px 40px;transition:transform .12s ease,box-shadow .12s ease,filter .12s ease;}
.cot-es .cot-es-btn:hover{transform:translateY(-1px);filter:brightness(1.08);}
.cot-es .cot-es-btn:active{transform:translateY(0);}
.cot-es .cot-es-btn.prime{color:#1a0e02;border:1px solid #ffc169;
  background:linear-gradient(180deg,#ffb64f,#e07a10);
  box-shadow:0 6px 22px rgba(240,150,40,.35);}
.cot-es .cot-es-btn.ghost{color:#f4e9d8;border:1px solid rgba(240,193,105,.55);
  background:rgba(240,160,48,.08);}
.cot-es .cot-es-btn.ghost:hover{background:rgba(240,160,48,.16);}
@media (max-height:820px){
  .cot-es .es-econ{margin-top:1.4vh;}
  .cot-es .es-eco{padding:9px 14px 10px;}
  .cot-es .es-eco .v{font-size:25px;}
  .cot-es .es-tal .v{font-size:19px;}
  .cot-es .es-cols{margin-top:9px;}
  .cot-es .es-actions{margin-top:1.4vh;}
}
/* MOBILE-QA r1: landscape phones (375-430 pt tall). The centered fixed-height
   column overflowed BOTH ends on an iPhone SE/13 — BATTLE AGAIN / RETURN TO
   GARAGE rendered below the fold with overflow:hidden, so the player could
   not leave the results screen at all. Top-anchor + scroll, compact the hero
   and tallies so the common case fits without scrolling anyway. */
@media (max-height:480px){
  .cot-es{justify-content:flex-start;overflow-y:auto;padding:10px 0 16px;}
  .cot-es .es-ban{font-size:clamp(24px,9vh,38px);}
  .cot-es .es-econ{margin-top:8px;}
  .cot-es .es-eco{padding:6px 12px 7px;}
  .cot-es .es-eco .v{font-size:19px;}
  .cot-es .es-tal .v{font-size:14px;}
  .cot-es .es-cols{margin-top:8px;flex:0 0 auto;max-height:26vh;}
  .cot-es .es-actions{margin-top:12px;flex:0 0 auto;}
  .cot-es .cot-es-btn{padding:12px 30px;}
  /* narrow side panels: the tracked-out header wrapped mid-word
     ("TEAM ALIV") — drop the letterspacing and keep it on one line */
  .cot-es .es-ph{letter-spacing:.1em;white-space:nowrap;gap:8px;overflow:hidden;}
}
`;

const fmtTime = (s) => {
  const t = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const fmtN = (n) => Math.round(n).toLocaleString('en-US');

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

/**
 * Create the end screen controller.
 * @param {{on:Function,emit:Function}} bus game event bus
 * @param {HTMLElement} host shotInfo's stats root (`.cot-si-stats`) — reused
 *   so main.js's veilHud/statsRoot seams keep addressing the live surface
 * @returns {{show:Function,hide:Function,visible:boolean,root:HTMLElement}}
 */
export function createEndScreen(bus, host) {
  ensureFonts();
  if (!document.getElementById('cot-es-style')) {
    const s = document.createElement('style');
    s.id = 'cot-es-style';
    s.textContent = ES_CSS;
    document.head.appendChild(s);
  }
  host.classList.add('cot-es');

  let visible = false;
  let garageBtn = null;   // adopted main.js endBtn (survives re-renders by ref)
  const counters = [];    // live count-up rAF handles

  // arm the legacy-overlay suppressor the moment the battle is decided —
  // showEndOverlay() runs later in the same tick and must never flash the
  // old button/earnings line before the end screen takes the frame
  bus.on('battle:ended', () => document.body.classList.add('cot-es-armed'));
  // any path into a fresh battle retires the screen — including the debug
  // __DEBUG.startBattle flow, which skips the garage's ui:battleStart (the
  // garage path also lands here via hud.setMode -> shotInfo.hideStats)
  bus.on('phase:change', (p) => { if (p && p.phase === 'battle') api.hide(); });

  /** Animated count-up on an element (finalizes exactly on target). */
  function countUp(elm, target, { durMs = 1050, delayMs = 0, fmt = fmtN, prefix = '' } = {}) {
    const fin = () => { elm.textContent = prefix + fmt(target); };
    if (typeof document !== 'undefined' && document.hidden) { fin(); return; } // headless/throttled: no dead counters
    const state = { raf: 0, done: false, fin };
    counters.push(state);
    const t0 = performance.now() + delayMs;
    const tick = (now) => {
      if (state.done) return;
      const u = Math.min(1, Math.max(0, (now - t0) / durMs));
      const k = 1 - Math.pow(1 - u, 3); // ease-out cubic
      elm.textContent = prefix + fmt(target * k);
      if (u >= 1) { state.done = true; fin(); return; }
      state.raf = requestAnimationFrame(tick);
    };
    elm.textContent = prefix + fmt(0);
    state.raf = requestAnimationFrame(tick);
  }

  function stopCounters() {
    for (const c of counters) {
      if (!c.done) { cancelAnimationFrame(c.raf); c.done = true; c.fin(); }
    }
    counters.length = 0;
  }

  /**
   * Adopt the integration end overlay: hide `.cot-end` (this screen owns the
   * frame) and reparent its RETURN TO GARAGE button — existing handler kept.
   * @param {HTMLElement} actions actions row to mount the button into
   */
  function adoptEndOverlay(actions) {
    const overlay = document.querySelector('.cot-end');
    if (overlay) {
      let btn = overlay.querySelector('button');
      if (btn) {
        btn.removeAttribute('style'); // shed the inline amber pill styling
        btn.classList.add('cot-es-btn', 'ghost');
        btn.textContent = 'RETURN TO GARAGE';
        garageBtn = btn;
      }
      overlay.style.display = 'none';
    }
    if (garageBtn) actions.appendChild(garageBtn);
    return garageBtn;
  }

  let seq = 0; // entrance stagger index
  const nextI = () => String(seq++);

  function tile(parent, key, label, opts = {}) {
    const t = el('div', `es-tal es-in${opts.hot ? ' hot' : ''}`, parent);
    t.style.setProperty('--i', nextI());
    const v = el('div', 'v', t);
    const k = el('div', 'k', t);
    k.textContent = label;
    if (opts.text != null) v.textContent = opts.text;
    else countUp(v, opts.value || 0, { delayMs: 260 + seq * 60, fmt: opts.fmt });
    if (key) host.dataset[key] = String(opts.datasetV != null ? opts.datasetV : Math.round(opts.value || 0));
    return t;
  }

  const api = {
    root: host,
    get visible() { return visible; },

    /**
     * Render and reveal the end screen.
     * @param {''|'victory'|'defeat'|'draw'} result battle verdict
     * @param {object} sum shotInfo.buildSummary() bundle (resolved-event sums)
     */
    show(result, sum) {
      stopCounters();
      seq = 0;
      visible = true;
      // detach the adopted button BEFORE the innerHTML wipe would orphan it
      if (garageBtn && garageBtn.parentNode) garageBtn.parentNode.removeChild(garageBtn);
      host.textContent = '';

      const res = result || '';
      const st = sum.stats;

      // --- hero -----------------------------------------------------------
      const hero = el('div', 'es-hero', host);
      const kick = el('div', 'es-kick es-in', hero);
      kick.style.setProperty('--i', nextI());
      kick.textContent = 'Battle over';
      const ban = el('div', `es-ban ${res === 'victory' ? 'v' : res === 'defeat' ? 'd' : 'n'}`, hero);
      ban.textContent = res === 'victory' ? 'VICTORY'
        : res === 'defeat' ? 'DEFEAT'
          : res === 'draw' ? 'DRAW' : 'BATTLE OVER';
      host.dataset.banner = ban.textContent;
      el('div', 'es-rule', hero);
      const sub = el('div', 'es-sub es-in', hero);
      sub.style.setProperty('--i', nextI());
      const outcomeLine = res === 'victory'
        ? (sum.playerDead ? 'Your team carried the field after you fell.'
          : 'Enemy force destroyed. The field is yours.')
        : res === 'defeat'
          ? 'Your force was wiped out. The field is lost.'
          : res === 'draw' ? 'Battle timer expired. No side held the field.' : '';
      sub.innerHTML = `${sum.playerVehicle ? `<b>${sum.playerVehicle}</b> — ` : ''}${outcomeLine}`;
      const meta = el('div', 'es-meta es-in', hero);
      meta.style.setProperty('--i', nextI());
      const bits = [];
      if (sum.map) bits.push(`<b>${sum.map}</b>`);
      if (sum.timeS > 0) bits.push(`battle time <b>${fmtTime(sum.timeS)}</b>`);
      bits.push(new Date().toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      }));
      meta.innerHTML = bits.join(' &nbsp;·&nbsp; ');
      if (sum.map) host.dataset.map = sum.map;
      if (sum.timeS > 0) host.dataset.durationS = String(Math.floor(sum.timeS));

      // --- economy: the seam main.js prints (techtree wallet award) --------
      const earn = getLastBattleEarnings();
      if (earn) {
        const econ = el('div', 'es-econ', host);
        const eco = (cls, k, val, s) => {
          const e = el('div', `es-eco ${cls} es-in`, econ);
          e.style.setProperty('--i', nextI());
          e.innerHTML = `<span class="k">${k}</span><span class="v"></span><span class="s">${s}</span>`;
          countUp(e.querySelector('.v'), val, { durMs: 1300, delayMs: 420, prefix: '+' });
        };
        eco('cr', 'Credits', earn.credits, 'credited');
        eco('xp', 'Experience', earn.xp, 'earned');
        host.dataset.credits = String(earn.credits);
        host.dataset.xp = String(earn.xp);
      }

      // --- tallies (count-up) ----------------------------------------------
      const tals = el('div', 'es-tals', host);
      tile(tals, 'dealt', 'Damage dealt', { value: Math.round(st.dealt), hot: true });
      tile(tals, 'kills', 'Kills', { value: sum.kills.length, datasetV: sum.kills.length });
      {
        // hits/pens with pen % — assembled after both counters land
        const t = el('div', 'es-tal es-in', tals);
        t.style.setProperty('--i', nextI());
        const v = el('div', 'v', t);
        const k = el('div', 'k', t);
        k.textContent = 'Hits / pens';
        const penRate = st.hits > 0 ? Math.round((st.pens / st.hits) * 100) : 0;
        countUp(v, st.hits, {
          delayMs: 380,
          fmt: (n) => `${Math.round(n)}`,
        });
        setTimeout(() => {
          v.innerHTML = `${st.hits}<i> / </i>${st.pens}<i> · ${penRate}%</i>`;
        }, 1500);
        host.dataset.hits = String(st.hits);
        host.dataset.pens = String(st.pens);
      }
      tile(tals, 'blocked', 'Damage blocked', { value: Math.round(st.blocked) });
      if (st.spotAttributed) {
        tile(tals, 'spotted', 'Enemies spotted', { value: st.spotted, datasetV: st.spotted });
      } else {
        tile(tals, 'received', 'Damage received', { value: Math.round(st.received) });
      }
      tile(tals, null, 'Battle time', { text: fmtTime(sum.timeS) });
      host.dataset.received = String(Math.round(st.received));
      host.dataset.fired = String(st.fired);
      host.dataset.assist = String(Math.round(st.assist));

      // --- best shot strip (only with a real standout) ----------------------
      if (sum.bestShot && (sum.bestShot.damage || 0) > 0) {
        const b = sum.bestShot;
        const strip = el('div', 'es-best es-in', host);
        strip.style.setProperty('--i', nextI());
        strip.innerHTML =
          '<span class="bk">Best shot</span>' +
          `<span class="bd">−${Math.round(b.damage)}</span>` +
          `<span class="bt">${b.shellType || ''} ${b.shellName || ''} → <b>${b.targetName || ''}</b>` +
          `${b.zone ? ` · ${b.zone}` : ''}${b.distM ? ` · ${Math.round(b.distM)} m` : ''}` +
          `${b.destroyed ? ' · <b>destroyed</b>' : ''}</span>`;
        host.dataset.bestShot = String(Math.round(b.damage));
      }

      // --- columns: your kills | team results --------------------------------
      const cols = el('div', 'es-cols es-in', host);
      cols.style.setProperty('--i', nextI());
      const teamPanel = (title, list, hostile) => {
        const p = el('div', 'es-panel', cols);
        const alive = list.filter((r) => !r.dead).length;
        const ph = el('div', `es-ph ${hostile ? 'foe' : 'ally'}`, p);
        ph.innerHTML = `<span>${title}</span><span>${alive}/${list.length} alive</span>`;
        if (!list.length) {
          el('div', 'es-none', p).textContent = 'No combatants recorded.';
          return;
        }
        const cap = el('div', 'es-cap', p);
        cap.innerHTML = '<span style="flex:0 0 22px"></span><span style="flex:0 0 44px"></span>' +
          '<span class="a"></span><span class="b">Kills</span><span class="c">Dmg</span><span class="d"></span>';
        for (const r of list) {
          const row = el('div', `es-tr ${hostile ? 'foe' : 'ally'}${r.isPlayer ? ' me' : ''}${r.dead ? ' dead' : ''}`, p);
          row.innerHTML =
            `<span class="tier">${r.specId ? tierNumeral(r.specId) : ''}</span>` +
            '<span class="si"></span>' +
            `<span class="nm">${r.isPlayer ? '<b class="you">YOU</b>' : ''}${r.name || r.id}</span>` +
            `<span class="k">${r.kills > 0 ? `${r.kills} ✕` : ''}</span>` +
            `<span class="dm">${r.dmg > 0 ? `−${fmtN(r.dmg)}` : '—'}</span>` +
            `<span class="st">${r.dead ? 'DEAD' : 'ALIVE'}</span>`;
          maskIcon(row.querySelector('.si'), r.specId || r.id, 'side_silhouette',
            r.dead ? 'rgba(242,143,143,.8)' : 'rgba(206,220,232,0.8)');
        }
      };
      // left column: your kills (per-kill vehicle rows)
      {
        const p = el('div', 'es-panel', cols);
        p.style.flex = '0 0 330px';
        const ph = el('div', 'es-ph', p);
        ph.innerHTML = `<span>Vehicles destroyed</span><span>${sum.kills.length}</span>`;
        if (!sum.kills.length) {
          el('div', 'es-none', p).textContent = res === 'victory'
            ? 'No kills credited — your team finished them.' : 'No kills this battle.';
        }
        for (const kr of sum.kills) {
          const row = el('div', 'es-kr', p);
          row.innerHTML =
            '<span class="si"></span>' +
            `<span class="nm">${kr.name || kr.id}</span>` +
            '<span class="x">DESTROYED</span>' +
            `<span class="dm">${kr.dmg > 0 ? `−${fmtN(kr.dmg)}` : ''}</span>`;
          maskIcon(row.querySelector('.si'), kr.specId || kr.id, 'side_silhouette',
            'rgba(255,209,102,.85)');
        }
      }
      teamPanel('Your team', sum.allies, false);
      teamPanel('Enemy team', sum.enemies, true);
      host.dataset.rosterAllies = String(sum.allies.length);
      host.dataset.rosterEnemies = String(sum.enemies.length);

      // --- actions (buttons last in the stagger) -----------------------------
      const actions = el('div', 'es-actions es-in', host);
      actions.style.setProperty('--i', String(seq + 3));
      const again = el('button', 'cot-es-btn prime', actions);
      again.type = 'button';
      again.textContent = 'BATTLE AGAIN';
      again.addEventListener('click', () => {
        // battle_again fix: the old flow clicked the garage-return button and
        // the garage BATTLE button 60 ms apart — but the garage return runs a
        // branded transition whose enterGarage() callback fires AFTER the
        // fade-in (~300 ms), so on a warm map the freshly started battle got
        // clobbered back to the garage right as its loading screen finished.
        // main.js now owns the sequencing (garage re-entry transition first,
        // THEN the garage's own battle path with the current selection).
        bus.emit('ui:click', {});
        bus.emit('ui:battleAgain', {});
        api.hide();
      });
      adoptEndOverlay(actions);

      host.classList.add('show');
      // battle-HUD chrome must not bleed through the results backdrop — the
      // class shotInfo's CSS already keys every chrome hide off
      document.body.classList.add('cot-si-report');
    },

    /** Hide + finalize counters (garage entry, battle restart). */
    hide() {
      document.body.classList.remove('cot-es-armed'); // legacy overlay usable again
      if (!visible && !host.classList.contains('show')) return;
      visible = false;
      stopCounters();
      host.classList.remove('show');
      document.body.classList.remove('cot-si-report');
    },
  };
  return api;
}
