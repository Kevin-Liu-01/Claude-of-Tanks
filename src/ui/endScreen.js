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
 *  - `.cot-end` — main.js's end overlay. Its verdict/summary lines are
 *    superseded by this screen; the overlay itself is display:none'd on show.
 *  - the overlay's RETURN TO GARAGE button (main.js endBtn) — reparented
 *    into the actions row, restyled via class, its existing click handler
 *    (bus 'ui:click' + enterGarage) kept verbatim.
 *  - BATTLE AGAIN drives the existing garage flow: the adopted button's
 *    handler enters the garage, then the garage's own `.cot-battle` button
 *    is clicked — the full loading-screen entry path, nothing re-implemented.
 *
 * DATA: every number is a resolved-event sum handed over by shotInfo
 * (buildSummary). Nothing here is recomputed or invented; the game has no
 * base-capture mechanic, so no capture stat is fabricated.
 */

import { FONT_STACK, FONT_COND, ensureFonts } from './fonts.js';
import { createElement as el, ensureStyle } from './dom.js';
import { iconUrl, maskIcon } from './icons.js';
import { uiIconSVG } from './uiIcons.js';
import { getSpec } from '../vehicles/specs.js';

const COL = {
  amber: '#f0a030',
  amberHi: '#ffd27a',
  gold: '#ffd166',
  green: '#7fdc8a',
  red: '#f27a6e',
  steel: '#cfd9e2',
  text: '#e6edf3',
  dim: '#8a97a3',
};

const ES_CSS = `
.cot-es{position:fixed;inset:0;z-index:71;display:none;pointer-events:none;
  flex-direction:column;align-items:center;justify-content:center;
  padding:2.2vh 0 2.6vh;overflow:hidden;font-family:${FONT_STACK};color:${COL.text};
  background:
    radial-gradient(110% 80% at 50% -10%,rgba(240,160,48,.13),rgba(240,160,48,0) 48%),
    linear-gradient(180deg,rgba(5,8,12,.985),rgba(4,7,10,.955) 44%,rgba(3,5,8,.99));}
.cot-es.show{display:flex;}
.cot-es *{box-sizing:border-box;margin:0;padding:0;}
.cot-es::before{content:"";position:fixed;left:0;right:0;top:0;height:4px;
  background:linear-gradient(90deg,transparent 8%,${COL.amber} 50%,transparent 92%);
  box-shadow:0 0 22px rgba(240,160,48,.5);}
.cot-es.result-victory::before{background:linear-gradient(90deg,transparent 8%,${COL.green} 50%,transparent 92%);}
.cot-es.result-defeat::before{background:linear-gradient(90deg,transparent 8%,${COL.red} 50%,transparent 92%);}
.cot-es .es-hero{position:relative;width:1160px;max-width:96vw;flex:0 0 auto;overflow:hidden;}
.cot-es .es-vehicle-watermark{position:absolute;right:2%;top:0;width:min(28vw,330px);height:112px;
  object-fit:contain;object-position:center;opacity:.14;filter:grayscale(.25) contrast(1.2) drop-shadow(0 12px 20px #000);
  pointer-events:none;mix-blend-mode:screen}
/* staggered entrance: hero first, tallies cascade, buttons last (--i steps) */
@keyframes cotEsIn{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:none;}}
@keyframes cotEsHero{from{opacity:0;transform:translateY(-10px) scale(.96);letter-spacing:.5em;}
  to{opacity:1;transform:none;}}
.cot-es .es-in{opacity:0;animation:cotEsIn .55s cubic-bezier(.2,.7,.3,1) forwards;
  animation-delay:calc(var(--i,0)*85ms);}
/* --- hero ----------------------------------------------------------------- */
.cot-es .es-kick{font-family:${FONT_COND};font-weight:800;font-size:11.5px;
  letter-spacing:.34em;text-indent:.34em;color:${COL.amber};text-transform:uppercase;
  text-align:center;}
.cot-es .es-ban{margin-top:6px;font-weight:800;font-size:clamp(44px,5.8vw,68px);
  line-height:1;letter-spacing:.18em;text-indent:.18em;text-align:center;
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
.cot-es .es-sub{margin-top:11px;text-align:center;font-size:14.5px;font-weight:650;
  color:${COL.steel};letter-spacing:.04em;}
.cot-es .es-sub b{color:#ffe4b0;font-weight:800;}
.cot-es .es-meta{margin-top:4px;text-align:center;font-family:${FONT_COND};
  font-weight:700;font-size:12px;letter-spacing:.14em;color:#aab7c2;
  text-transform:uppercase;font-variant-numeric:tabular-nums;display:flex;align-items:center;justify-content:center;gap:18px;}
.cot-es .es-meta span{display:flex;align-items:center;gap:7px}.cot-es .es-meta svg{color:#8797a3}
.cot-es .es-meta b{color:#c8d4de;font-weight:800;}
/* --- two-column debrief --------------------------------------------------- */
.cot-es .es-report{display:grid;grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr);
  align-items:stretch;gap:12px;width:1160px;max-width:96vw;height:clamp(300px,45vh,390px);
  flex:0 0 clamp(300px,45vh,390px);margin-top:12px;min-height:0;}
.cot-es .es-debrief{display:flex;flex-direction:column;min-width:0;min-height:0;height:100%;
  overflow:hidden;background:linear-gradient(155deg,rgba(13,18,23,.96),rgba(6,9,12,.97));
  border:1px solid rgba(166,184,199,.3);box-shadow:0 12px 36px rgba(0,0,0,.42);pointer-events:auto;}
.cot-es .es-debrief.personal{border-top:2px solid ${COL.amber};}
.cot-es .es-debrief.teams{border-top:2px solid rgba(127,220,138,.72);}
.cot-es .es-dh{display:flex;align-items:center;justify-content:space-between;gap:12px;
  min-height:41px;padding:9px 14px;border-bottom:1px solid rgba(166,184,199,.2);}
.cot-es .es-dh .titleline{display:flex;align-items:center;gap:9px}.cot-es .es-dh .titleline svg{flex:0 0 auto;opacity:.92}
.cot-es .es-dh .ey{font:800 12px ${FONT_COND};letter-spacing:.18em;text-transform:uppercase;color:${COL.amberHi};}
.cot-es .es-dh .context{font:700 10px ${FONT_COND};letter-spacing:.08em;color:#8f9da9;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cot-es .es-debrief.teams .es-dh .ey{color:#a8eab1;}
.cot-es .es-stat-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;
  background:rgba(166,184,199,.15);border-bottom:1px solid rgba(166,184,199,.18);}
.cot-es .es-tal{display:flex;flex-direction:column;justify-content:center;gap:3px;min-width:0;
  min-height:80px;text-align:left;padding:12px 16px;background:rgba(8,12,16,.98);}
.cot-es .es-tal .v{font-family:${FONT_COND};font-weight:800;font-size:23px;
  letter-spacing:-.01em;font-variant-numeric:tabular-nums;color:#f2f7fb;line-height:1.05;text-align:left;}
.cot-es .es-tal .v i{font-style:normal;font-size:14px;color:${COL.dim};font-weight:700;}
.cot-es .es-tal .k{order:-1;display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.1em;
  color:#aab7c2;text-transform:uppercase;font-family:${FONT_COND};}
.cot-es .es-tal .k svg{flex:0 0 auto;color:${COL.amberHi}}
.cot-es .es-tal.hot{background:linear-gradient(135deg,rgba(255,209,102,.13),rgba(255,209,102,.025));}
.cot-es .es-tal .v,.cot-es .es-tal.hot .v{font-size:34px}.cot-es .es-tal.hot .v{color:${COL.gold};}
.cot-es .es-stat-secondary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));
  border-bottom:1px solid rgba(166,184,199,.18);}
.cot-es .es-mini{min-width:0;padding:10px 14px;border-right:1px solid rgba(166,184,199,.13);}
.cot-es .es-mini:last-child{border-right:0}.cot-es .es-mini .mk{display:flex;align-items:center;gap:6px;font:800 10px ${FONT_COND};letter-spacing:.08em;
  text-transform:uppercase;color:#91a0ac}.cot-es .es-mini .mk svg{flex:0 0 auto}.cot-es .es-mini .mv{margin-top:5px;font:800 21px ${FONT_COND};
  color:#edf4f8;font-variant-numeric:tabular-nums}.cot-es .es-mini .md{margin-top:2px;font-size:10px;color:#7f8e9a;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cot-es .es-best{display:grid;grid-template-columns:auto auto minmax(0,1fr);align-items:center;gap:9px;
  min-height:48px;padding:8px 14px;background:linear-gradient(90deg,rgba(240,160,48,.12),rgba(240,160,48,.015) 78%);
  border-bottom:1px solid rgba(240,160,48,.3);}
.cot-es .es-best .bk{font-family:${FONT_COND};font-weight:800;font-size:10.5px;
  letter-spacing:.14em;color:${COL.amberHi};text-transform:uppercase;flex:0 0 auto;display:flex;align-items:center;gap:7px;}
.cot-es .es-best .bd{font-family:${FONT_COND};font-weight:800;font-size:20px;
  color:${COL.gold};font-variant-numeric:tabular-nums;flex:0 0 auto;letter-spacing:-.01em;}
.cot-es .es-best .bt{font-size:12px;color:${COL.steel};letter-spacing:.02em;flex:1;
  min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-variant-numeric:tabular-nums;}
.cot-es .es-best .bt b{color:#eef4f9;font-weight:700;}
.cot-es .es-best .bt small{display:block;margin-top:2px;font-size:11px;color:#83929e;}
.cot-es .es-kill-block{display:flex;flex:1;min-height:0;flex-direction:column;padding:0 12px 10px;}
.cot-es .es-kill-list{min-height:0;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(240,160,48,.45) transparent;}
/* the legacy integration overlay may flash its old button/earnings line in
   the frames between showEndOverlay() and the report flush — armed on
   battle:ended, this suppresses it outright (the end screen owns the frame;
   !important beats the inline display:flex showEndOverlay writes) */
body.cot-es-armed .cot-end{display:none !important;}
.cot-es .es-ph{font-size:11px;font-weight:800;letter-spacing:.1em;color:#aebbc6;
  text-transform:uppercase;font-family:${FONT_COND};padding:9px 2px 7px;
  border-bottom:1px solid rgba(166,184,199,.25);margin-bottom:4px;
  display:flex;justify-content:space-between;font-variant-numeric:tabular-nums;}
.cot-es .es-ph .ph-title{display:flex;align-items:center;gap:7px}.cot-es .es-ph svg{flex:0 0 auto}
.cot-es .es-ph.ally{color:${COL.green};border-bottom-color:rgba(127,220,138,.35);}
.cot-es .es-ph.foe{color:${COL.red};border-bottom-color:rgba(242,122,114,.35);}
.cot-es .es-scoreboard{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;min-height:86px;
  padding:10px 22px;border-bottom:1px solid rgba(166,184,199,.18);background:rgba(7,11,15,.72);}
.cot-es .es-score-side{display:grid;grid-template-columns:1fr auto;align-items:center;gap:12px;}
.cot-es .es-score-side.foe{text-align:right;grid-template-columns:auto 1fr}.cot-es .es-score-copy{min-width:0}
.cot-es .es-score-side .sl{font:800 12px ${FONT_COND};letter-spacing:.12em;text-transform:uppercase;}
.cot-es .es-score-side .sl{display:flex;align-items:center;gap:7px}.cot-es .es-score-side.foe .sl{justify-content:flex-end}
.cot-es .es-score-side.ally .sl{color:${COL.green}}.cot-es .es-score-side.foe .sl{color:${COL.red}}
.cot-es .es-score-side .ss{margin-top:5px;font-size:11px;color:#8f9daa;}
.cot-es .es-score-side .sn{font:800 38px ${FONT_COND};color:#edf4f8;font-variant-numeric:tabular-nums;line-height:1;}
.cot-es .es-score-dash{padding:0 18px;font:500 24px ${FONT_COND};color:#53616c;}
.cot-es .es-rosters{display:grid;grid-template-columns:1fr 1fr;gap:12px;flex:1;min-height:0;padding:12px;}
.cot-es .es-roster{display:flex;min-width:0;min-height:0;flex-direction:column;}
.cot-es .es-roster-list{min-height:0;padding-top:8px;overflow-y:auto;border-top:1px solid rgba(166,184,199,.28);
  scrollbar-width:thin;scrollbar-color:rgba(166,184,199,.38) transparent;}
.cot-es .es-roster.ally .es-roster-list{border-top-color:rgba(127,220,138,.38)}
.cot-es .es-roster.foe .es-roster-list{border-top-color:rgba(242,122,114,.38)}
/* team rows: one readable identity line, one natural-language result line */
.cot-es .es-tr{display:flex;align-items:center;gap:8px;height:43px;padding:0 8px;
  background:rgba(255,255,255,.024);border-left:2px solid rgba(146,164,180,.25);
  margin-bottom:4px;font-variant-numeric:tabular-nums;}
.cot-es .es-tr.ally{border-left-color:rgba(127,220,138,.45);}
.cot-es .es-tr.foe{border-left-color:rgba(242,122,114,.45);}
.cot-es .es-tr.me{background:linear-gradient(90deg,rgba(240,160,48,.18),rgba(240,160,48,.03));
  border-left-color:${COL.amber};}
.cot-es .es-tr .tier{display:none}.cot-es .es-tr .si{flex:0 0 44px;height:19px;}
.cot-es .es-tr .identity{flex:1;min-width:0}.cot-es .es-tr .nm{display:block;min-width:0;font-size:12px;font-weight:700;color:#e5edf4;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cot-es .es-tr .nm .you{color:${COL.gold};font-family:${FONT_COND};font-weight:800;
  font-size:10px;letter-spacing:.06em;margin-right:5px;vertical-align:1px;}
.cot-es .es-tr .veh{display:block;margin-top:2px;font-size:10.5px;color:#7f8e9a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cot-es .es-tr .veh b{color:${COL.gold};font-weight:800}.cot-es .es-tr .st{display:grid;place-items:center;flex:0 0 18px;
  color:${COL.green};filter:drop-shadow(0 0 5px rgba(127,220,138,.3));}
/* Dead rows remain legible; status color carries the state instead of a
   line-through that made player/tank names needlessly difficult to scan. */
.cot-es .es-tr.dead{opacity:.78;background:rgba(120,30,24,.1);}
.cot-es .es-tr.dead .nm{color:#aab7c2;}
.cot-es .es-tr.dead .st{color:${COL.red};filter:none;opacity:1;}
.cot-es .es-tr.dead .si{opacity:.75;}
/* your kill rows */
.cot-es .es-kr{display:flex;align-items:center;gap:10px;height:39px;padding:0 7px;
  border-bottom:1px solid rgba(146,164,180,.1);font-variant-numeric:tabular-nums;}
.cot-es .es-kr .si{flex:0 0 50px;height:20px;}.cot-es .es-kr .nm{flex:1;min-width:0;font-size:13px;font-weight:700;color:#eef4f9;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cot-es .es-kr .dm{flex:0 0 52px;text-align:right;font-family:${FONT_COND};font-weight:800;
  font-size:13px;color:${COL.gold};letter-spacing:-.01em;}
.cot-es .es-none{padding:9px 5px;font-size:10.5px;color:${COL.dim};letter-spacing:.04em;}
/* persistent private/LAN room: results are one round inside a social session */
.cot-es .es-rematch{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:0;width:1160px;
  max-width:96vw;margin-top:12px;padding:0;background:linear-gradient(100deg,rgba(15,22,28,.98),rgba(25,18,10,.98));
  border:1px solid rgba(240,160,48,.45);border-left:3px solid ${COL.amber};pointer-events:auto;overflow:hidden;flex:0 0 auto}
.cot-es .es-room-info{min-width:0;padding:13px 16px}.cot-es .es-room-head{display:grid;grid-template-columns:36px minmax(0,1fr) auto;
  align-items:center;gap:11px}.cot-es .es-room-mode-icon{display:grid;place-items:center;width:36px;height:36px;color:${COL.amberHi};
  background:rgba(240,160,48,.1);border:1px solid rgba(240,160,48,.32)}
.cot-es .es-room-title{min-width:0}.cot-es .es-room-title span{display:block;font:800 10px ${FONT_COND};letter-spacing:.14em;
  text-transform:uppercase;color:${COL.amberHi}}.cot-es .es-room-title b{display:block;margin-top:2px;font:800 19px ${FONT_COND};
  letter-spacing:.12em;color:#fff0d4}.cot-es .es-room-round{display:flex;align-items:center;gap:7px;font:800 11px ${FONT_COND};
  letter-spacing:.08em;text-transform:uppercase;color:#aebbc6}.cot-es .es-room-round svg{color:${COL.amberHi}}
.cot-es .es-room-players{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.cot-es .es-room-player{display:grid;
  grid-template-columns:44px minmax(100px,1fr) auto;align-items:center;gap:9px;min-width:245px;height:50px;padding:5px 10px;
  background:rgba(4,8,12,.58);border-left:2px solid rgba(228,170,88,.65)}
.cot-es .es-room-player.ready{border-left-color:${COL.green}}.cot-es .es-room-player .ri{width:44px;height:21px}
.cot-es .es-room-player .room-copy{min-width:0}.cot-es .es-room-player .rn{display:block;min-width:0;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;font-weight:750}.cot-es .es-room-player .rv{display:block;margin-top:2px;
  font-size:10px;color:#8796a2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cot-es .es-room-player .rs{display:flex;
  align-items:center;gap:5px;font:800 10px ${FONT_COND};letter-spacing:.04em;color:#e4aa58}.cot-es .es-room-player .rs svg{flex:0 0 auto}
.cot-es .es-room-player.ready .rs{color:${COL.green}}.cot-es .es-room-actions{display:flex;flex-direction:column;align-items:stretch;
  justify-content:center;gap:8px;padding:13px 14px;background:rgba(6,9,12,.65);border-left:1px solid rgba(240,160,48,.22)}
.cot-es .es-ready-meter{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px;margin-bottom:2px;color:#9eacb8}
.cot-es .es-ready-meter .meter-label{font:800 10px ${FONT_COND};letter-spacing:.1em;text-transform:uppercase}.cot-es .es-ready-meter b{
  font:800 13px ${FONT_COND};color:#f5e7d3;font-variant-numeric:tabular-nums}.cot-es .es-ready-track{grid-column:1/-1;height:3px;
  background:rgba(151,171,186,.16);overflow:hidden}.cot-es .es-ready-fill{display:block;height:100%;background:${COL.green};
  box-shadow:0 0 10px rgba(127,220,138,.45);transition:width .25s ease}.cot-es .es-room-actions .cot-es-btn{width:100%;min-width:0;
  min-height:44px;padding:9px 14px;font-size:11.5px}
.cot-es .cot-es-btn.ready-now{color:#b8f2c2;border-color:rgba(127,220,138,.6);background:rgba(31,88,45,.68)}
@keyframes cotEsReadyPulse{50%{box-shadow:0 0 0 5px rgba(240,160,48,.16),0 0 26px rgba(240,160,48,.42)}}
.cot-es .cot-es-btn.can-start,.cot-es .cot-es-btn.needs-ready:not(:disabled){animation:cotEsReadyPulse 1.35s ease-in-out infinite}
/* --- actions -------------------------------------------------------------- */
.cot-es .es-actions{display:flex;gap:14px;margin-top:1.8vh;padding:4px 10px;
  flex:0 0 auto;pointer-events:auto;z-index:2;}
.cot-es .cot-es-btn{font-family:${FONT_COND};font-weight:800;font-size:13.5px;
  letter-spacing:.22em;text-indent:.11em;text-transform:uppercase;cursor:pointer;
  min-width:230px;min-height:52px;padding:13px 40px;
  transition:transform .12s ease,box-shadow .12s ease,filter .12s ease;}
.cot-es .cot-es-btn .btn-inner{display:flex;align-items:center;justify-content:center;gap:10px}.cot-es .cot-es-btn svg{flex:0 0 auto}
.cot-es .cot-es-btn:hover{transform:translateY(-1px);filter:brightness(1.08);}
.cot-es .cot-es-btn:active{transform:translateY(0);}
.cot-es .cot-es-btn:disabled{cursor:not-allowed;opacity:.62;transform:none;filter:none}
.cot-es .cot-es-btn.prime{color:#1a0e02;border:1px solid #ffc169;
  background:linear-gradient(180deg,#ffb64f,#e07a10);
  box-shadow:0 6px 22px rgba(240,150,40,.35);}
.cot-es .cot-es-btn.ghost{color:#f4e9d8;border:1px solid rgba(240,193,105,.55);
  background:rgba(240,160,48,.08);}
.cot-es .cot-es-btn.ghost:hover{background:rgba(240,160,48,.16);}
@media (max-height:820px){
  .cot-es{justify-content:flex-start;overflow-y:auto;padding:12px 0 26px;}
  .cot-es .es-tal .v,.cot-es .es-tal.hot .v{font-size:30px;}
  .cot-es .es-report{margin-top:9px;}
  .cot-es .es-actions{margin-top:1.4vh;}
}
/* MOBILE-QA r1: landscape phones (375-430 pt tall). The centered fixed-height
   column overflowed BOTH ends on an iPhone SE/13 — BATTLE AGAIN / RETURN TO
   GARAGE rendered below the fold with overflow:hidden, so the player could
   not leave the results screen at all. Top-anchor + scroll, compact the hero
   and tallies so the common case fits without scrolling anyway. */
@media (max-height:480px){
  .cot-es{justify-content:flex-start;overflow-y:auto;padding:10px 0 82px;}
  .cot-es .es-ban{font-size:clamp(24px,9vh,38px);}
  .cot-es .es-tal .v,.cot-es .es-tal.hot .v{font-size:24px;}
  .cot-es .es-report{height:300px;flex:0 0 300px;margin-top:8px;}
  .cot-es .es-tal{min-height:0;text-align:center;padding:5px 4px;}
  .cot-es .es-tal .v{text-align:center;}
  .cot-es .es-tal .k{margin-top:3px;font-size:7.5px;letter-spacing:.08em;}
  .cot-es .es-dh{min-height:32px;padding:6px 10px}.cot-es .es-best{min-height:32px;padding:5px 9px}
  .cot-es .es-scoreboard{min-height:64px;padding:6px 10px}.cot-es .es-score-side .sn{font-size:28px}
  .cot-es .es-rosters{gap:6px;padding:0 7px 6px}.cot-es .es-kill-block{padding:0 7px 6px}
  .cot-es .es-actions{position:fixed;left:0;right:0;bottom:0;justify-content:center;
    margin:0;padding:8px 10px;background:linear-gradient(180deg,rgba(3,5,8,.15),rgba(3,5,8,.98) 30%);
    border-top:1px solid rgba(166,184,199,.24);}
  .cot-es .cot-es-btn{min-height:46px;padding:10px 30px;}
  /* narrow side panels: the tracked-out header wrapped mid-word
     ("TEAM ALIV") — drop the letterspacing and keep it on one line */
  .cot-es .es-ph{letter-spacing:.1em;white-space:nowrap;gap:8px;overflow:hidden;}
}
/* Portrait/mobile: preserve the information hierarchy by stacking the two
   dossiers; the desktop equal-height pairing becomes a top-to-bottom read. */
@media (max-width:820px) and (orientation:portrait){
  .cot-es{justify-content:flex-start;overflow-y:auto;padding:12px 0 82px;}
  .cot-es .es-ban{font-size:clamp(30px,10vw,44px);}
  .cot-es .es-report{grid-template-columns:1fr;height:auto;flex:0 0 auto;}
  .cot-es .es-debrief.personal{height:390px}.cot-es .es-debrief.teams{height:auto;min-height:470px}
  .cot-es .es-rosters{grid-template-columns:1fr;gap:4px}.cot-es .es-roster-list{max-height:220px}
  .cot-es .es-actions{position:fixed;left:0;right:0;bottom:0;justify-content:center;
    margin:0;padding:8px 7px;background:linear-gradient(180deg,rgba(3,5,8,.15),rgba(3,5,8,.98) 30%);
    border-top:1px solid rgba(166,184,199,.24);}
  .cot-es .cot-es-btn{min-width:0;padding:12px 15px;font-size:11px;}
  .cot-es .es-ph{letter-spacing:.1em;white-space:nowrap;gap:8px;overflow:hidden;}
  .cot-es .es-rematch{grid-template-columns:1fr}.cot-es .es-room-actions{width:100%;border-left:0;border-top:1px solid rgba(240,160,48,.22)}
  .cot-es .es-room-actions .cot-es-btn{flex:1;min-width:0}.cot-es .es-room-player{min-width:100%;}
}
`;

const fmtTime = (s) => {
  const t = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const fmtN = (n) => Math.round(n).toLocaleString('en-US');

export function summarizeTeam(rows = []) {
  return rows.reduce((summary, row) => {
    summary.total += 1;
    if (!row.dead) summary.alive += 1;
    summary.kills += Math.max(0, Number(row.kills) || 0);
    summary.damage += Math.max(0, Number(row.dmg) || 0);
    return summary;
  }, { total: 0, alive: 0, kills: 0, damage: 0 });
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
  ensureStyle('cot-es-style', ES_CSS);
  host.classList.add('cot-es');
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  host.setAttribute('aria-label', 'Battle results');
  host.setAttribute('aria-hidden', 'true');

  let visible = false;
  let garageBtn = null;   // adopted main.js endBtn (survives re-renders by ref)
  let roomContext = null;
  let rematchPanel = null;
  const counters = [];    // live count-up rAF handles

  // arm the legacy-overlay suppressor the moment the battle is decided —
  // showEndOverlay() runs later in the same tick and must never flash the
  // old button/earnings line before the end screen takes the frame
  bus.on('battle:ended', () => document.body.classList.add('cot-es-armed'));
  // any path into a fresh battle retires the screen — including the debug
  // __DEBUG.startBattle flow, which skips the garage's ui:battleStart (the
  // garage path also lands here via hud.setMode -> shotInfo.hideStats)
  bus.on('phase:change', (p) => { if (p && p.phase === 'battle') api.hide(); });
  bus.on('network:roomState', (context) => {
    roomContext = context?.state ? context : null;
    if (rematchPanel) renderRematchPanel(rematchPanel);
  });

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
        btn.innerHTML = `<span class="btn-inner">${uiIconSVG('garage', 18)}<span>RETURN TO GARAGE</span></span>`;
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
    k.innerHTML = `${opts.icon ? uiIconSVG(opts.icon, 16) : ''}<span>${label}</span>`;
    if (opts.text != null) v.textContent = opts.text;
    else countUp(v, opts.value || 0, { delayMs: 260 + seq * 60, fmt: opts.fmt });
    if (key) host.dataset[key] = String(opts.datasetV != null ? opts.datasetV : Math.round(opts.value || 0));
    return t;
  }

  function renderRematchPanel(panel) {
    panel.textContent = '';
    const state = roomContext?.state;
    if (!state) {
      panel.remove();
      rematchPanel = null;
      return;
    }
    const playerId = roomContext.playerId;
    const me = state.players.find((player) => player.id === playerId);
    const active = state.players.filter((player) => player.team !== 'spectator');
    const readyCount = active.filter((player) => player.ready).length;
    const everyoneReady = active.length > 0 && readyCount === active.length;
    const info = el('div', 'es-room-info', panel);
    const mode = state.mode === 'lan' ? 'LAN room' : 'Private room';
    const nextRound = (Number(state.round) || 0) + 1;
    const head = el('div', 'es-room-head', info);
    const modeIcon = el('span', 'es-room-mode-icon', head);
    modeIcon.innerHTML = uiIconSVG(state.mode === 'lan' ? 'battleLan' : 'battlePrivate', 21);
    const roomTitle = el('span', 'es-room-title', head);
    roomTitle.innerHTML = `<span>${mode}</span><b>${state.roomCode || ''}</b>`;
    const round = el('span', 'es-room-round', head);
    round.innerHTML = `${uiIconSVG('rematch', 16)}<span>Round ${nextRound}</span>`;
    const players = el('div', 'es-room-players', info);
    for (const player of state.players) {
      const row = el('div', `es-room-player${player.ready ? ' ready' : ''}`, players);
      const icon = el('span', 'ri', row);
      maskIcon(icon, player.specId, 'side_silhouette',
        player.ready ? 'rgba(127,220,138,.88)' : 'rgba(190,204,215,.72)');
      const copy = el('span', 'room-copy', row);
      const name = el('span', 'rn', copy);
      let vehicle = player.specId || 'No vehicle';
      try { vehicle = getSpec(player.specId)?.name || vehicle; } catch (_) { /* raw id */ }
      name.textContent = `${player.name || 'Commander'}${player.id === playerId ? ' (You)' : ''}`;
      el('span', 'rv', copy).textContent = vehicle;
      const status = el('span', 'rs', row);
      const statusIcon = player.team === 'spectator' ? 'scope' : player.ready ? 'check' : 'clock';
      const statusText = player.team === 'spectator' ? 'WATCHING' : player.ready ? 'READY' : 'NOT READY';
      status.innerHTML = `${uiIconSVG(statusIcon, 13)}<span>${statusText}</span>`;
    }
    const controls = el('div', 'es-room-actions', panel);
    const meter = el('div', 'es-ready-meter', controls);
    const readyPct = active.length ? Math.round((readyCount / active.length) * 100) : 0;
    meter.innerHTML = `${uiIconSVG('check', 15)}<span class="meter-label">Ready for round ${nextRound}</span>` +
      `<b>${readyCount} / ${active.length}</b><span class="es-ready-track"><span class="es-ready-fill" style="width:${readyPct}%"></span></span>`;
    if (me && me.team !== 'spectator') {
      const ready = el('button', `cot-es-btn ${me.ready ? 'ready-now' : 'prime needs-ready'}`, controls);
      ready.type = 'button';
      ready.innerHTML = `<span class="btn-inner">${uiIconSVG(me.ready ? 'close' : 'check', 17)}` +
        `<span>${me.ready ? 'CANCEL READY' : 'READY FOR NEXT BATTLE'}</span></span>`;
      ready.disabled = state.phase !== 'waiting';
      ready.addEventListener('click', () => {
        bus.emit('ui:click', {});
        bus.emit('ui:roomReady', { ready: !me.ready });
      });
    }
    if (roomContext.role === 'host') {
      const start = el('button', `cot-es-btn ghost${everyoneReady ? ' can-start' : ''}`, controls);
      start.type = 'button';
      start.innerHTML = `<span class="btn-inner">${uiIconSVG(everyoneReady ? 'rematch' : 'clock', 17)}` +
        `<span>${everyoneReady ? 'START NEXT BATTLE' : 'WAITING FOR TEAM'}</span></span>`;
      start.disabled = state.phase !== 'waiting' || !everyoneReady;
      start.addEventListener('click', () => {
        bus.emit('ui:click', {});
        bus.emit('ui:roomStart', {});
      });
    }
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
      host.classList.remove('result-victory', 'result-defeat', 'result-draw');
      host.classList.add(`result-${res === 'victory' || res === 'defeat' || res === 'draw' ? res : 'draw'}`);

      // --- hero -----------------------------------------------------------
      const hero = el('div', 'es-hero', host);
      if (sum.playerSpecId) {
        const vehicle = el('img', 'es-vehicle-watermark', hero);
        vehicle.src = iconUrl(sum.playerSpecId, 'angle');
        vehicle.alt = '';
      }
      const kick = el('div', 'es-kick es-in', hero);
      kick.style.setProperty('--i', nextI());
      kick.textContent = 'After action report';
      const ban = el('div', `es-ban ${res === 'victory' ? 'v' : res === 'defeat' ? 'd' : 'n'}`, hero);
      ban.textContent = res === 'victory' ? 'VICTORY'
        : res === 'defeat' ? 'DEFEAT'
          : res === 'draw' ? 'DRAW' : 'BATTLE OVER';
      host.dataset.banner = ban.textContent;
      el('div', 'es-rule', hero);
      const sub = el('div', 'es-sub es-in', hero);
      sub.style.setProperty('--i', nextI());
      const outcomeLine = sum.reason === 'network_disconnect'
        ? 'The match connection was interrupted. No result was recorded.'
        : res === 'victory'
        ? (sum.playerDead ? 'Your team carried the field after you fell.'
          : 'Enemy force destroyed. The field is yours.')
        : res === 'defeat'
          ? 'Your force was wiped out. The field is lost.'
          : res === 'draw' && sum.reason === 'time_limit'
            ? 'Battle timer expired. No side held the field.'
            : res === 'draw' ? 'Neither side held the field.' : '';
      sub.innerHTML = `${sum.playerVehicle ? `<b>${sum.playerVehicle}</b> — ` : ''}${outcomeLine}`;
      const meta = el('div', 'es-meta es-in', hero);
      meta.style.setProperty('--i', nextI());
      const bits = [];
      if (sum.map) bits.push(`<span>${uiIconSVG('map', 14)}<b>${sum.map}</b></span>`);
      if (sum.timeS > 0) bits.push(`<span>${uiIconSVG('clock', 14)}<b>${fmtTime(sum.timeS)}</b></span>`);
      meta.innerHTML = bits.join('');
      if (sum.map) host.dataset.map = sum.map;
      if (sum.timeS > 0) host.dataset.durationS = String(Math.floor(sum.timeS));

      // --- two equal-height debrief columns --------------------------------
      const report = el('div', 'es-report es-in', host);
      report.style.setProperty('--i', nextI());

      const personal = el('section', 'es-debrief personal', report);
      personal.setAttribute('aria-label', 'Your battle performance');
      const personalHead = el('div', 'es-dh', personal);
      personalHead.innerHTML = `<span class="titleline">${uiIconSVG('battleRecord', 18)}` +
        '<span class="ey">Your performance</span></span>';

      const statGrid = el('div', 'es-stat-grid', personal);
      tile(statGrid, 'dealt', 'Damage dealt', { value: Math.round(st.dealt), hot: true, icon: 'damage' });
      tile(statGrid, 'kills', 'Kills', { value: sum.kills.length, datasetV: sum.kills.length, icon: 'skull' });

      const secondary = el('div', 'es-stat-secondary', personal);
      const mini = (icon, key, label, value, detail = '') => {
        const item = el('div', 'es-mini', secondary);
        item.innerHTML = `<div class="mk">${uiIconSVG(icon, 14)}<span>${label}</span></div><div class="mv">${value}</div>` +
          (detail ? `<div class="md">${detail}</div>` : '');
        if (key) host.dataset[key] = String(value);
      };
      const penRate = st.hits > 0 ? Math.round((st.pens / st.hits) * 100) : 0;
      mini('penetration', null, 'Penetrations', `${st.pens} / ${st.hits}`, `${penRate}% of hits`);
      mini('shield', 'blocked', 'Damage blocked', fmtN(st.blocked));
      mini('damage', 'received', 'Damage received', fmtN(st.received));
      host.dataset.hits = String(st.hits);
      host.dataset.pens = String(st.pens);
      host.dataset.received = String(Math.round(st.received));
      host.dataset.fired = String(st.fired);
      host.dataset.assist = String(Math.round(st.assist));

      // Best shot belongs with personal performance, not as a third page-wide band.
      if (sum.bestShot && (sum.bestShot.damage || 0) > 0) {
        const b = sum.bestShot;
        const strip = el('div', 'es-best', personal);
        strip.style.setProperty('--i', nextI());
        strip.innerHTML =
          `<span class="bk">${uiIconSVG('autoAim', 16)}<span>Best shot</span></span>` +
          `<span class="bd">${fmtN(b.damage)}</span>` +
          `<span class="bt"><b>${b.targetName || 'Enemy vehicle'}</b>` +
          `<small>${[b.zone, b.distM ? `${Math.round(b.distM)} m` : '', b.destroyed ? 'Kill confirmed' : '']
            .filter(Boolean).join(' · ')}</small></span>`;
        host.dataset.bestShot = String(Math.round(b.damage));
      }

      const killBlock = el('div', 'es-kill-block', personal);
      const killHead = el('div', 'es-ph', killBlock);
      killHead.innerHTML = `<span class="ph-title">${uiIconSVG('skull', 15)}<span>Vehicles destroyed</span></span>` +
        `<span>${sum.kills.length}</span>`;
      const killList = el('div', 'es-kill-list', killBlock);
      if (!sum.kills.length) {
        el('div', 'es-none', killList).textContent = res === 'victory'
          ? 'No kills credited — your team finished them.' : 'No kills this battle.';
      }
      for (const kr of sum.kills) {
        const row = el('div', 'es-kr', killList);
        row.innerHTML =
          '<span class="si"></span>' +
          `<span class="nm">${kr.name || kr.id}</span>` +
          `<span class="dm">${kr.dmg > 0 ? fmtN(kr.dmg) : ''}</span>`;
        maskIcon(row.querySelector('.si'), kr.specId || kr.id, 'side_silhouette',
          'rgba(255,209,102,.85)');
      }

      const teams = el('section', 'es-debrief teams', report);
      teams.setAttribute('aria-label', 'Team battle result');
      const allyStats = summarizeTeam(sum.allies);
      const enemyStats = summarizeTeam(sum.enemies);
      const teamsHead = el('div', 'es-dh', teams);
      teamsHead.innerHTML = `<span class="titleline">${uiIconSVG('team', 19)}` +
        '<span class="ey">Battle outcome</span></span>';
      const scoreboard = el('div', 'es-scoreboard', teams);
      scoreboard.innerHTML =
        '<div class="es-score-side ally"><div class="es-score-copy">' +
        `<div class="sl">${uiIconSVG('team', 16)}<span>Your team</span></div><div class="ss">${allyStats.alive} / ${allyStats.total} survived · ${fmtN(allyStats.damage)} damage</div>` +
        `</div><div class="sn">${fmtN(allyStats.kills)}</div></div>` +
        '<div class="es-score-dash">—</div>' +
        `<div class="es-score-side foe"><div class="sn">${fmtN(enemyStats.kills)}</div><div class="es-score-copy">` +
        `<div class="sl"><span>Enemy team</span>${uiIconSVG('team', 16)}</div><div class="ss">${enemyStats.alive} / ${enemyStats.total} survived · ${fmtN(enemyStats.damage)} damage</div>` +
        '</div></div>';

      const rosters = el('div', 'es-rosters', teams);
      const teamRoster = (title, list, hostile) => {
        const p = el('div', `es-roster ${hostile ? 'foe' : 'ally'}`, rosters);
        p.setAttribute('aria-label', title);
        const listRoot = el('div', 'es-roster-list', p);
        if (!list.length) {
          el('div', 'es-none', listRoot).textContent = 'No combatants recorded.';
          return;
        }
        for (const r of list) {
          const row = el('div', `es-tr ${hostile ? 'foe' : 'ally'}${r.isPlayer ? ' me' : ''}${r.dead ? ' dead' : ''}`, listRoot);
          let vehicle = r.specId || '';
          try { vehicle = getSpec(r.specId)?.name || vehicle; } catch (_) { /* raw id */ }
          const details = [vehicle];
          if (r.kills > 0) details.push(`${r.kills} kill${r.kills === 1 ? '' : 's'}`);
          row.innerHTML =
            '<span class="si"></span>' +
            `<span class="identity"><span class="nm">${r.isPlayer ? '<b class="you">YOU</b>' : ''}${r.name || r.id}</span>` +
            `<span class="veh">${details.filter(Boolean).join(' · ')}</span></span>` +
            `<span class="st">${uiIconSVG(r.dead ? 'skull' : 'check', 16)}</span>`;
          const stateMark = row.querySelector('.st');
          stateMark.setAttribute('role', 'img');
          stateMark.setAttribute('aria-label', r.dead ? 'Destroyed' : 'Survived');
          stateMark.title = r.dead ? 'Destroyed' : 'Survived';
          maskIcon(row.querySelector('.si'), r.specId || r.id, 'side_silhouette',
            r.dead ? 'rgba(242,143,143,.8)' : 'rgba(206,220,232,0.8)');
        }
      };
      teamRoster('Your team', sum.allies, false);
      teamRoster('Enemy team', sum.enemies, true);
      host.dataset.rosterAllies = String(sum.allies.length);
      host.dataset.rosterEnemies = String(sum.enemies.length);

      if (roomContext?.state) {
        rematchPanel = el('section', 'es-rematch es-in', host);
        rematchPanel.style.setProperty('--i', String(seq + 1));
        renderRematchPanel(rematchPanel);
      } else rematchPanel = null;

      // --- actions (buttons last in the stagger) -----------------------------
      const actions = el('div', 'es-actions es-in', host);
      actions.style.setProperty('--i', String(seq + 3));
      if (!roomContext?.state) {
        const again = el('button', 'cot-es-btn prime', actions);
        again.type = 'button';
        again.innerHTML = `<span class="btn-inner">${uiIconSVG('rematch', 18)}<span>BATTLE AGAIN</span></span>`;
        again.addEventListener('click', () => {
          bus.emit('ui:click', {});
          bus.emit('ui:battleAgain', {});
          api.hide();
        });
      }
      adoptEndOverlay(actions);

      host.classList.add('show');
      host.setAttribute('aria-hidden', 'false');
      // battle-HUD chrome must not bleed through the results backdrop — the
      // class shotInfo's CSS already keys every chrome hide off
      document.body.classList.add('cot-si-report');
    },

    /** Hide + finalize counters (garage entry, battle restart). */
    hide() {
      document.body.classList.remove('cot-es-armed'); // legacy overlay usable again
      if (!visible && !host.classList.contains('show')) return;
      visible = false;
      rematchPanel = null;
      stopCounters();
      host.classList.remove('show');
      host.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('cot-si-report');
    },
  };
  return api;
}
