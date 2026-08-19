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
import { featuredShotForMap } from './featuredShots.js';
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
/* --- full-bleed featured capture ---------------------------------------- */
.cot-bl>.art{position:absolute;inset:-3%;background-size:cover;background-position:center;
  filter:saturate(.82) contrast(1.08) brightness(.72);transform:scale(1.035);}
.cot-bl.on>.art{animation:cot-bl-drift 14s ease-out both;}
@keyframes cot-bl-drift{from{transform:scale(1.035)}to{transform:scale(1.09)}}
.cot-bl>.art.none{background:linear-gradient(160deg,#1e2a1c,#0b1017 70%);}
.cot-bl>.scrim{position:absolute;inset:0;background:
  linear-gradient(180deg,rgba(4,7,10,.40) 0%,rgba(4,7,10,.22) 27%,rgba(4,7,10,.82) 62%,rgba(4,7,10,.98) 100%),
  linear-gradient(90deg,rgba(4,7,10,.48),transparent 42%,rgba(4,7,10,.36));}
.cot-bl>.vig{position:absolute;inset:0;background:
  radial-gradient(115% 110% at 50% 32%,rgba(0,0,0,0) 36%,rgba(0,0,0,.72) 100%);}
.cot-bl>.grid{position:absolute;inset:0;opacity:.16;background-image:
  linear-gradient(rgba(180,197,210,.13) 1px,transparent 1px),
  linear-gradient(90deg,rgba(180,197,210,.13) 1px,transparent 1px);
  background-size:72px 72px;mask-image:linear-gradient(180deg,#000,transparent 68%);}
/* --- operation identity + tactical preview ------------------------------ */
.cot-bl .hero{position:relative;z-index:1;flex:0 0 clamp(190px,31vh,286px);
  display:flex;align-items:flex-end;justify-content:space-between;gap:32px;
  padding:clamp(28px,5vh,54px) clamp(20px,5vw,76px) 20px;
  border-bottom:1px solid rgba(240,160,48,.34);}
.cot-bl .cap{min-width:0;text-align:left;}
.cot-bl .opline{display:flex;align-items:center;gap:13px;}
.cot-bl .opline::after{content:'';width:clamp(42px,7vw,110px);height:1px;
  background:linear-gradient(90deg,rgba(240,160,48,.68),transparent);}
.cot-bl .kicker{font-family:${FONT_COND};font-size:10.5px;font-weight:700;
  letter-spacing:.32em;color:#f0a030;text-transform:uppercase;}
.cot-bl .mapname{margin-top:10px;font-size:clamp(32px,5vw,58px);font-weight:800;
  letter-spacing:.095em;text-transform:uppercase;color:#f4f8fc;
  text-shadow:0 3px 26px rgba(0,0,0,.85);}
.cot-bl .mapsub{margin-top:7px;font-family:${FONT_COND};font-size:11.5px;font-weight:600;
  letter-spacing:.22em;color:#b8c5cf;text-transform:uppercase;}
.cot-bl .shotcap{margin-top:12px;font-family:${FONT_COND};font-size:8.5px;font-weight:700;
  letter-spacing:.18em;color:#71808d;text-transform:uppercase;}
.cot-bl .shotcap::before{content:'Field capture  /  ';color:#c2903f;}
.cot-bl .mapcard{flex:0 0 clamp(168px,17vw,238px);align-self:flex-end;padding:7px;
  border:1px solid rgba(174,191,204,.4);background:rgba(6,10,14,.68);
  box-shadow:0 14px 38px rgba(0,0,0,.42);backdrop-filter:blur(8px);}
.cot-bl .mapthumb{position:relative;aspect-ratio:16/9;background-size:cover;
  background-position:center;overflow:hidden;}
.cot-bl .mapthumb.none{background:linear-gradient(145deg,#26333d,#10161c);}
.cot-bl .mapthumb::after{content:'';position:absolute;inset:0;background:
  linear-gradient(180deg,transparent 42%,rgba(4,7,10,.78)),
  linear-gradient(90deg,rgba(240,160,48,.34) 1px,transparent 1px),
  linear-gradient(rgba(240,160,48,.34) 1px,transparent 1px);background-size:auto,33.333% 100%,100% 33.333%;}
.cot-bl .maplabel{display:flex;align-items:center;justify-content:space-between;gap:8px;
  padding:7px 4px 1px;font-family:${FONT_COND};font-size:8px;font-weight:700;
  letter-spacing:.2em;color:#9fb0bf;text-transform:uppercase;}
.cot-bl .maplabel b{color:#f0a030;font-weight:700;}
/* --- rosters ------------------------------------------------------------- */
.cot-bl .teams{position:relative;z-index:1;flex:1 1 auto;display:flex;align-items:stretch;
  justify-content:center;gap:clamp(12px,3vw,48px);padding:18px clamp(18px,5vw,76px) 0;min-height:0;}
.cot-bl .team{flex:1 1 0;max-width:520px;min-width:0;display:flex;flex-direction:column;
  padding:12px 14px 13px;border:1px solid rgba(146,164,180,.18);
  background:linear-gradient(180deg,rgba(7,11,15,.68),rgba(7,11,15,.4));
  backdrop-filter:blur(7px);box-shadow:0 16px 46px rgba(0,0,0,.2);}
.cot-bl .thead{display:flex;align-items:center;gap:9px;padding-bottom:9px;
  border-bottom:1px solid rgba(146,164,180,.3);font-family:${FONT_COND};
  font-size:11px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;}
.cot-bl .team.ally .thead{color:#7fdc8a;border-bottom-color:rgba(127,220,138,.4);}
.cot-bl .team.foe .thead{color:#f07a72;border-bottom-color:rgba(240,122,114,.4);}
.cot-bl .team.foe .thead{flex-direction:row-reverse;}
.cot-bl .thead .n{margin-left:auto;font-variant-numeric:tabular-nums;color:#8a97a3;
  letter-spacing:.12em;}
.cot-bl .team.foe .thead .n{margin-left:0;margin-right:auto;}
.cot-bl .rows{display:flex;flex-direction:column;gap:3px;padding-top:9px;}
.cot-bl .row{display:flex;align-items:center;gap:10px;height:34px;padding:0 8px;
  background:rgba(255,255,255,.04);border-left:2px solid transparent;}
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
.cot-bl .vs{flex:0 0 34px;align-self:center;display:grid;place-items:center;width:34px;height:34px;
  border:1px solid rgba(146,164,180,.26);background:rgba(7,11,15,.6);
  font-family:${FONT_COND};font-size:9px;font-weight:700;letter-spacing:.14em;color:#7e8c98;}
/* --- footer: progress + countdown --------------------------------------- */
.cot-bl .foot{position:relative;z-index:1;flex:0 0 auto;padding:18px clamp(18px,5vw,76px) 24px;}
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
  font-size:12.5px;font-weight:700;letter-spacing:.34em;text-indent:.34em;
  color:#8a97a3;text-transform:uppercase;min-height:17px;}
.cot-bl .count b{color:#ffd27a;font-size:15px;}
.cot-bl .tip{margin-top:12px;text-align:center;font-size:12px;color:#7f8d99;
  line-height:1.5;padding:0 8%;}
.cot-bl .tip b{color:#c2903f;font-family:${FONT_COND};font-weight:700;
  letter-spacing:.2em;text-transform:uppercase;font-size:9.5px;margin-right:8px;}
@media (prefers-reduced-motion:reduce){.cot-bl.on>.art{animation:none;}}
@media (max-height:700px){.cot-bl .hero{flex-basis:148px;padding-top:18px;padding-bottom:12px;}
  .cot-bl .mapcard{flex-basis:150px}.cot-bl .shotcap,.cot-bl .tip{display:none;}
  .cot-bl .teams{padding-top:9px}.cot-bl .team{padding-top:8px;padding-bottom:8px}
  .cot-bl .row{height:27px}.cot-bl .foot{padding-top:9px;padding-bottom:12px}}
@media (max-width:900px){
  .cot-bl .hero{flex-basis:clamp(140px,26vh,210px);gap:14px;padding:20px 12px 12px;}
  .cot-bl .mapname{margin-top:5px;font-size:clamp(23px,6vw,36px)}
  .cot-bl .mapsub{margin-top:3px;font-size:8.5px}.cot-bl .kicker{font-size:8px}
  .cot-bl .shotcap{margin-top:7px;font-size:7px}.cot-bl .mapcard{flex-basis:132px;padding:5px}
  .cot-bl .maplabel{font-size:6.5px;padding-top:5px}.cot-bl .teams{gap:7px;padding:8px 8px 0}.cot-bl .vs{display:none}
  .cot-bl .team{padding:7px 6px 6px}
  .cot-bl .thead{font-size:9px;padding-bottom:4px}.cot-bl .rows{gap:2px;padding-top:4px}
  .cot-bl .row{height:27px;gap:5px;padding:0 4px}.cot-bl .row .tier{flex-basis:20px;font-size:9px}
  .cot-bl .row .sil{flex-basis:38px;height:20px}.cot-bl .row .nm{font-size:10px}
  .cot-bl .foot{padding:9px 12px max(11px,env(safe-area-inset-bottom))}
  .cot-bl .fmeta{margin-bottom:5px}.cot-bl .fstage{font-size:9px}.cot-bl .fpct{font-size:15px}
  .cot-bl .count{margin-top:8px;font-size:9px}.cot-bl .count b{font-size:12px}.cot-bl .tip{display:none}
}
@media (max-width:520px){.cot-bl .mapcard{display:none}.cot-bl .hero{display:block}
  .cot-bl .opline::after{display:none}.cot-bl .shotcap{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
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
    `<div class="art none"></div><div class="scrim"></div><div class="vig"></div><div class="grid"></div>` +
    `<div class="hero"><div class="cap"><div class="opline">` +
    `<div class="kicker">Random Battle &middot; Standard</div></div>` +
    `<div class="mapname"></div><div class="mapsub"></div><div class="shotcap"></div></div>` +
    `<div class="mapcard"><div class="mapthumb none" role="img"></div>` +
    `<div class="maplabel"><span>Terrain preview</span><b>Live map</b></div></div></div>` +
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
  const subEl = root.querySelector('.mapsub');
  const kickEl = root.querySelector('.kicker');
  const shotCapEl = root.querySelector('.shotcap');
  const mapThumbEl = root.querySelector('.mapthumb');
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
     * @param {{mapName:string, mapSub?:string, thumb?:string, biome?:string,
     *   mapId?:string, hero?:string, mode?:string, allies:Array, enemies:Array}} info
     */
    show(info) {
      nameEl.textContent = info.mapName || 'Battlefield';
      subEl.textContent = info.mapSub || '';
      if (info.mode) kickEl.textContent = info.mode;
      const shot = info.hero
        ? { img: info.hero, cap: info.mapName || 'Battlefield', focal: '50% 48%' }
        : featuredShotForMap(info.mapId || info.biome);
      artEl.className = `art ${info.biome || 'none'}`;
      artEl.style.backgroundImage = shot?.img ? `url("${shot.img}")` : '';
      artEl.style.backgroundPosition = shot?.focal || 'center';
      shotCapEl.textContent = shot?.cap || '';
      mapThumbEl.classList.toggle('none', !info.thumb);
      mapThumbEl.style.backgroundImage = info.thumb ? `url("${info.thumb}")` : '';
      mapThumbEl.setAttribute('aria-label', info.thumb
        ? `${info.mapName || 'Battlefield'} terrain preview`
        : 'Terrain preview unavailable');
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
