/**
 * battleLoad.js — pre-battle loading screen (World of Tanks battle-load
 * identity): map name + biome art, the two team rosters with vehicle names /
 * tiers / icons, a real progress bar, and a countdown into the battle.
 *
 * It is shown the instant BATTLE is pressed and torn down when the battle
 * actually starts, so it also MASKS the remaining world build — the 1 km
 * battlefield (terrain bake + vegetation + props) is no longer built during
 * boot, it is built behind this screen (main.js ensureWorld → onProgress).
 *
 * Presentation only: main.js supplies already-resolved rows. Icons come from
 * public/icons/<id>_side_silhouette.png (tools/genIcons.mjs).
 */

import { FONT_STACK, FONT_COND } from './fonts.js';
import { iconUrl } from './icons.js';
import { tierNumeral } from '../vehicles/tier.js';

// Backward-compatible re-export for main.js, killcam and end-screen callers.
export { tierNumeral };

const CSS = `
.cot-bl{position:fixed;inset:0;z-index:150;display:none;flex-direction:column;
  font-family:${FONT_STACK};color:#e6edf3;-webkit-user-select:none;user-select:none;
  background:#05080b;opacity:1;overflow:hidden;}
.cot-bl.on{display:flex;opacity:1;}
.cot-bl.leaving{display:flex;opacity:0;transition:opacity .28s ease;}
.cot-bl *{box-sizing:border-box;margin:0;padding:0;}
/* --- map hero band ------------------------------------------------------- */
.cot-bl .hero{position:relative;flex:0 0 40%;min-height:210px;overflow:hidden;
  border-bottom:1px solid rgba(240,160,48,.35);}
.cot-bl .hero .art{position:absolute;inset:-6%;background-size:cover;
  background-position:center;filter:saturate(.86) contrast(1.05);
  transform:scale(1.06);}
.cot-bl .hero .art.none{background:linear-gradient(160deg,#1e2a1c,#0b1017 70%);}
.cot-bl .hero .art.desert{background-image:linear-gradient(160deg,#6d5330,#241a10 72%);}
.cot-bl .hero .art.winter{background-image:linear-gradient(160deg,#5d6b78,#141a20 72%);}
.cot-bl .hero .art.urban{background-image:linear-gradient(160deg,#4b4a45,#14161a 72%);}
.cot-bl .hero .art.coastal,.cot-bl .hero .art.fjord{background-image:linear-gradient(160deg,#426b78,#101b22 72%);}
.cot-bl .hero .art.autumn,.cot-bl .hero .art.badlands{background-image:linear-gradient(160deg,#80502f,#211510 72%);}
.cot-bl .hero .art.steppe,.cot-bl .hero .art.frontier{background-image:linear-gradient(160deg,#667247,#172015 72%);}
.cot-bl .hero .art.railyard,.cot-bl .hero .art.foundry{background-image:linear-gradient(160deg,#55514b,#151619 72%);}
.cot-bl .hero .art.delta,.cot-bl .hero .art.monsoon{background-image:linear-gradient(160deg,#315f4d,#0e1d1a 72%);}
.cot-bl .hero .art.alpine{background-image:linear-gradient(160deg,#7e96a6,#121a23 72%);}
.cot-bl .hero .art.caldera{background-image:linear-gradient(160deg,#59473f,#171316 72%);}
.cot-bl .hero .scrim{position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(5,8,11,.62) 0%,rgba(5,8,11,.25) 40%,rgba(5,8,11,.96) 100%);}
.cot-bl .hero .vig{position:absolute;inset:0;
  background:radial-gradient(105% 130% at 50% 20%,rgba(0,0,0,0) 40%,rgba(0,0,0,.72) 100%);}
.cot-bl .hero .cap{position:absolute;left:5%;right:5%;bottom:20px;text-align:center;}
.cot-bl .kicker{font-family:${FONT_COND};font-size:10.5px;font-weight:700;
  letter-spacing:.36em;text-indent:.36em;color:#f0a030;text-transform:uppercase;}
.cot-bl .mapname{margin-top:8px;font-size:clamp(28px,4.6vw,50px);font-weight:800;
  letter-spacing:.14em;text-indent:.14em;text-transform:uppercase;color:#f4f8fc;
  text-shadow:0 3px 26px rgba(0,0,0,.85);}
/* --- rosters ------------------------------------------------------------- */
.cot-bl .teams{flex:1 1 auto;display:flex;align-items:stretch;justify-content:center;
  gap:clamp(18px,4vw,74px);padding:22px clamp(18px,5vw,74px) 0;min-height:0;}
.cot-bl .team{flex:1 1 0;max-width:460px;min-width:0;display:flex;flex-direction:column;}
.cot-bl .thead{display:flex;align-items:center;gap:9px;padding-bottom:7px;
  border-bottom:1px solid rgba(146,164,180,.24);font-family:${FONT_COND};
  font-size:11px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;}
.cot-bl .team.ally .thead{color:#7fdc8a;border-bottom-color:rgba(127,220,138,.4);}
.cot-bl .team.foe .thead{color:#f07a72;border-bottom-color:rgba(240,122,114,.4);}
.cot-bl .team.foe .thead{flex-direction:row-reverse;}
.cot-bl .thead .n{margin-left:auto;font-variant-numeric:tabular-nums;color:#8a97a3;
  letter-spacing:.12em;}
.cot-bl .team.foe .thead .n{margin-left:0;margin-right:auto;}
.cot-bl .rows{display:flex;flex-direction:column;gap:3px;padding-top:8px;}
.cot-bl .row{display:flex;align-items:center;gap:10px;height:34px;padding:0 8px;
  background:rgba(255,255,255,.026);border-left:2px solid transparent;}
.cot-bl .team.foe .row{flex-direction:row-reverse;border-left:none;
  border-right:2px solid transparent;}
.cot-bl .team.ally .row{border-left-color:rgba(127,220,138,.42);}
.cot-bl .team.foe .row{border-right-color:rgba(240,122,114,.42);}
.cot-bl .row.me{background:linear-gradient(90deg,rgba(240,160,48,.20),rgba(240,160,48,.03));
  border-left-color:#f0a030;}
.cot-bl .row .tier{flex:0 0 26px;text-align:center;font-family:${FONT_COND};
  font-size:11px;font-weight:700;letter-spacing:.04em;color:#ffd27a;}
.cot-bl .row .sil{flex:0 0 52px;height:24px;background-repeat:no-repeat;
  background-position:center;background-size:contain;opacity:.9;}
.cot-bl .team.foe .row .sil{transform:scaleX(-1);}
.cot-bl .row .nm{flex:1 1 auto;min-width:0;font-size:12.5px;font-weight:600;
  color:#dfe8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cot-bl .team.foe .row .nm{text-align:right;}
.cot-bl .row.me .nm{color:#ffe4b0;}
.cot-bl .vs{flex:0 0 auto;align-self:center;font-family:${FONT_COND};font-size:13px;
  font-weight:700;letter-spacing:.2em;color:#5d6a76;}
/* --- footer: progress + countdown --------------------------------------- */
.cot-bl .foot{flex:0 0 auto;padding:18px clamp(18px,5vw,74px) 26px;}
.cot-bl .fmeta{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;
  margin-bottom:8px;font-family:${FONT_COND};letter-spacing:-.01em;font-variant-numeric:tabular-nums;}
.cot-bl .fstage{font-size:11px;font-weight:700;letter-spacing:.26em;color:#9fb0bf;
  text-transform:uppercase;}
.cot-bl .fpct{font-size:19px;font-weight:700;color:#ffd27a;}
.cot-bl .fbar{position:relative;height:5px;background:rgba(255,255,255,.07);
  box-shadow:inset 0 0 0 1px rgba(146,164,180,.22);}
.cot-bl .ffill{position:absolute;left:0;top:0;bottom:0;width:0%;
  background:linear-gradient(90deg,#b96f10,#f0a030 65%,#ffcf7d);
  box-shadow:0 0 14px rgba(240,160,48,.5);transition:width .18s linear;}
.cot-bl .count{margin-top:16px;text-align:center;font-family:${FONT_COND};
  font-size:15px;font-weight:800;letter-spacing:.3em;text-indent:.3em;
  color:#dce6ee;text-transform:uppercase;min-height:24px;
  text-shadow:0 2px 8px rgba(0,0,0,.9);}
.cot-bl .count b{color:#ffd27a;font-size:23px;text-shadow:0 0 18px rgba(240,160,48,.36);}
.cot-bl .tip{margin-top:12px;text-align:center;font-size:12px;color:#7f8d99;
  line-height:1.5;padding:0 8%;}
.cot-bl .tip b{color:#c2903f;font-family:${FONT_COND};font-weight:700;
  letter-spacing:.2em;text-transform:uppercase;font-size:9.5px;margin-right:8px;}
@media (max-height:700px){
  /* A short landscape viewport must reserve a real row for progress. The old
     32% hero + desktop roster rows left less space than seven vehicles need,
     so the footer painted across the final row. */
  .cot-bl .hero{flex-basis:27%;min-height:108px;max-height:150px;}
  .cot-bl .hero .cap{bottom:11px;}
  .cot-bl .mapname{margin-top:4px;font-size:clamp(24px,4vw,38px);}
  .cot-bl .kicker{font-size:8.5px;}
  .cot-bl .teams{gap:clamp(12px,3vw,34px);padding:9px clamp(12px,5vw,42px) 0;}
  .cot-bl .thead{font-size:9px;padding-bottom:4px;}
  .cot-bl .rows{gap:2px;padding-top:4px;min-height:0;}
  .cot-bl .row{height:clamp(23px,5vh,28px);gap:6px;padding:0 5px;}
  .cot-bl .row .tier{flex-basis:22px;font-size:9px;}
  .cot-bl .row .sil{flex-basis:42px;height:19px;}
  .cot-bl .row .nm{font-size:10px;}
  .cot-bl .foot{padding:6px clamp(12px,5vw,42px) max(8px,env(safe-area-inset-bottom));}
  .cot-bl .fmeta{margin-bottom:4px;align-items:center;}
  .cot-bl .fstage{font-size:8.5px;letter-spacing:.2em;}
  .cot-bl .fpct{font-size:14px;}
  .cot-bl .fbar{height:4px;}
  .cot-bl .count{margin-top:5px;min-height:14px;font-size:9px;line-height:14px;}
  .cot-bl .count b{font-size:15px;}
  .cot-bl .tip{display:none;}
}
@media (max-width:900px){
  .cot-bl .hero{flex-basis:34%;min-height:128px;}
  .cot-bl .hero .cap{bottom:12px}.cot-bl .mapname{margin-top:4px;font-size:clamp(22px,6vw,34px)}
  .cot-bl .kicker{font-size:8.5px}
  .cot-bl .teams{gap:8px;padding:9px 10px 0}.cot-bl .vs{display:none}
  .cot-bl .thead{font-size:9px;padding-bottom:4px}.cot-bl .rows{gap:2px;padding-top:4px}
  .cot-bl .row{height:27px;gap:5px;padding:0 4px}.cot-bl .row .tier{flex-basis:20px;font-size:9px}
  .cot-bl .row .sil{flex-basis:38px;height:20px}.cot-bl .row .nm{font-size:10px}
  .cot-bl .foot{padding:9px 12px max(11px,env(safe-area-inset-bottom))}
  .cot-bl .fmeta{margin-bottom:5px}.cot-bl .fstage{font-size:9px}.cot-bl .fpct{font-size:15px}
  .cot-bl .count{margin-top:8px;font-size:10px}.cot-bl .count b{font-size:16px}.cot-bl .tip{display:none}
}
/* This rule intentionally follows both compact queries: on a short phone the
   width rule otherwise restores a 34% hero and 27 px rows after the
   height-aware values above. Empty countdown copy consumes no footer row. */
@media (orientation:landscape) and (max-height:560px){
  .cot-bl .hero{flex:0 0 clamp(100px,25vh,138px);min-height:100px;max-height:138px;}
  .cot-bl .hero .cap{bottom:8px;}
  .cot-bl .mapname{margin-top:3px;font-size:clamp(21px,4vw,34px);}
  .cot-bl .kicker{font-size:7.5px;}
  .cot-bl .teams{gap:8px;padding:7px max(10px,env(safe-area-inset-left)) 0;}
  .cot-bl .team{justify-content:center;}
  .cot-bl .row{height:clamp(21px,4.7vh,26px);gap:5px;padding:0 4px;}
  .cot-bl .row .tier{flex-basis:20px;font-size:8.5px;}
  .cot-bl .row .sil{flex-basis:36px;height:18px;}
  .cot-bl .row .nm{font-size:9.5px;}
  .cot-bl .foot{padding:5px max(10px,env(safe-area-inset-left)) max(7px,env(safe-area-inset-bottom));}
  .cot-bl .fmeta{margin-bottom:3px;}
  .cot-bl .fstage{font-size:8px;}
  .cot-bl .fpct{font-size:13px;}
  .cot-bl .count{margin-top:4px;min-height:12px;line-height:12px;}
  .cot-bl .count:empty{display:none;}
}
`;

const BATTLE_TIPS = [
  ['Opening move', 'Do not drive into the open on the first bounce of the clock — let the scouts spot and pick a flank once the map has told you where the weight went.'],
  ['Trade', 'Fire, then break line of sight. A shot that costs you two in return is a shot you should not have taken.'],
  ['Team', 'Allied guns matter more than yours. Fighting beside two friendlies beats fighting alone with the better tank.'],
  ['Minimap', 'Half of every battle is on the minimap. Check it at every reload.'],
];

/**
 * Create the pre-battle loading screen.
 * @returns {{show:(info:object)=>void, rosters:(allies:Array,enemies:Array)=>void,
 *   progress:(f:number,label?:string)=>void,
 *   countdown:(n:number)=>void, hide:()=>Promise<void>, readonly visible:boolean,
 *   root:HTMLElement}}
 */
export function createBattleLoadScreen() {
  if (!document.getElementById('cot-bl-style')) {
    const s = document.createElement('style');
    s.id = 'cot-bl-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  const root = document.createElement('div');
  root.className = 'cot-bl';
  root.innerHTML =
    `<div class="hero"><div class="art none"></div><div class="scrim"></div><div class="vig"></div>` +
    `<div class="cap"><div class="kicker">Random Battle &middot; Standard</div>` +
    `<div class="mapname"></div></div></div>` +
    `<div class="teams">` +
    `<div class="team ally"><div class="thead"><span>Allies</span><span class="n">0</span></div>` +
    `<div class="rows"></div></div>` +
    `<div class="vs">VS</div>` +
    `<div class="team foe"><div class="thead"><span>Enemies</span><span class="n">0</span></div>` +
    `<div class="rows"></div></div>` +
    `</div>` +
    `<div class="foot"><div class="fmeta"><div class="fstage">Loading battlefield</div>` +
    `<div class="fpct">0%</div></div>` +
    `<div class="fbar"><div class="ffill"></div></div>` +
    `<div class="count"></div><div class="tip"></div></div>`;
  document.body.appendChild(root);

  const artEl = root.querySelector('.art');
  const nameEl = root.querySelector('.mapname');
  const kickEl = root.querySelector('.kicker');
  const allyRows = root.querySelector('.team.ally .rows');
  const foeRows = root.querySelector('.team.foe .rows');
  const allyN = root.querySelector('.team.ally .n');
  const foeN = root.querySelector('.team.foe .n');
  const stageEl = root.querySelector('.fstage');
  const pctEl = root.querySelector('.fpct');
  const fillEl = root.querySelector('.ffill');
  const countEl = root.querySelector('.count');
  const tipEl = root.querySelector('.tip');

  let visible = false;

  function fillTeam(host, countEl2, rows) {
    host.textContent = '';
    for (const r of rows || []) {
      const el = document.createElement('div');
      el.className = 'row' + (r.isPlayer ? ' me' : '');
      const tier = document.createElement('div');
      tier.className = 'tier';
      tier.textContent = r.tier || tierNumeral(r.id);
      const sil = document.createElement('div');
      sil.className = 'sil';
      sil.style.backgroundImage = `url(${iconUrl(r.id, 'side_silhouette')})`;
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = r.name || r.id;
      el.append(tier, sil, nm);
      host.appendChild(el);
    }
    countEl2.textContent = String((rows || []).length);
  }

  const api = {
    root,
    get visible() { return visible; },

    /**
     * Stage and show the screen.
     * @param {{mapName:string, thumb?:string, biome?:string,
     *   mode?:string, allies:Array, enemies:Array}} info
     */
    show(info) {
      nameEl.textContent = info.mapName || 'Battlefield';
      if (info.mode) kickEl.textContent = info.mode;
      artEl.className = 'art' + (info.thumb ? '' : ` ${info.biome || 'none'}`);
      artEl.style.backgroundImage = info.thumb ? `url(${info.thumb})` : '';
      fillTeam(allyRows, allyN, info.allies);
      fillTeam(foeRows, foeN, info.enemies);
      const [h, b] = BATTLE_TIPS[Math.floor(Math.random() * BATTLE_TIPS.length)];
      tipEl.innerHTML = `<b>${h}</b>${b}`;
      countEl.textContent = '';
      api.progress(0, 'Loading battlefield');
      visible = true;
      // Entry is a safety cover, not an animation: it must own the very next
      // composited frame on slower guests. Only the exit is allowed to fade.
      root.classList.remove('leaving');
      root.style.display = '';
      root.classList.add('on');
    },

    /** Update the team sheets without resetting the progress bar or tip. */
    rosters(allies, enemies) {
      fillTeam(allyRows, allyN, allies);
      fillTeam(foeRows, foeN, enemies);
    },

    /**
     * Real load progress.
     * @param {number} f 0..1
     * @param {string} [label] stage name
     */
    progress(f, label) {
      const v = Math.max(0, Math.min(1, f));
      fillEl.style.width = `${(v * 100).toFixed(1)}%`;
      pctEl.textContent = `${Math.round(v * 100)}%`;
      if (label) stageEl.textContent = label;
    },

    /** Countdown line. @param {number} n seconds left (0 clears to "GO") */
    countdown(n) {
      countEl.innerHTML = n > 0
        ? `Battle begins in <b>${n}</b>`
        : `<b>Battle!</b>`;
    },

    /** Fade out, then drop out of layout. */
    hide() {
      if (!visible) return Promise.resolve();
      visible = false;
      // hold display through the opacity transition (.on carries display:flex,
      // so removing it alone would cut the fade to a hard pop)
      root.classList.add('leaving');
      root.classList.remove('on');
      return new Promise((resolve) => setTimeout(() => {
        if (!visible) root.classList.remove('leaving');
        resolve();
      }, 320));
    },
  };
  return api;
}
