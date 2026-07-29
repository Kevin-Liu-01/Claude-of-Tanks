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

// WoT tier numerals. Mirrors garage.js TIER_BY_ID / hud.js TIER_BY_ID /
// state.js SPEC_TIER — an unknown id degrades to a blank plate rather than
// blocking a newly dropped vehicle from appearing in a roster.
const TIER_BY_ID = {
  m4a3e8: 'VI', t34_85: 'VI', tiger1: 'VII', is2: 'VII', panther_g: 'VII',
  m1a2: 'X', t90m: 'X', leo2a7: 'X',
  strv103: 'IX', is3: 'VIII', t34_85_cad: 'VI', newc_tiger: 'VII',
  newc_pziii: 'IV', pziii_konserwa: 'III', leichttraktor: 'I',
  recon_tank: 'VIII', q_heavy: 'IX',
  kv2: 'VI', tiger2: 'VIII', sherman_jumbo: 'VI', jagdtiger: 'IX',
  jpz_e100: 'X', sturmtiger: 'VIII', t95: 'IX', t30: 'IX',
  is7: 'X', object279: 'X', is6b: 'VIII', is1: 'V',
  m1a1: 'IX', t90a: 'IX', m1a2_tusk: 'X',
  t72b3: 'VIII', challenger2: 'IX', merkava4: 'IX', leo2a6: 'IX',
  leo2a4: 'VIII', t80u: 'VIII', leclerc: 'IX', type99a: 'IX',
  leo1a5: 'VII', t14: 'X', chieftain_mk10: 'VII', k2: 'IX', type10: 'IX',
  m2a2_bradley: 'VIII', bmp2: 'VII', ariete: 'VIII',
  type74: 'VIII', bmp1: 'VI', m1128: 'VIII', m1296: 'VII', kf51: 'X',
};

/** WoT tier numeral for a spec id. @param {string} id @returns {string} */
export const tierNumeral = (id) => TIER_BY_ID[id] || '';

const CSS = `
.cot-bl{position:fixed;inset:0;z-index:150;display:none;flex-direction:column;
  font-family:${FONT_STACK};color:#e6edf3;-webkit-user-select:none;user-select:none;
  background:#05080b;opacity:0;transition:opacity .28s ease;overflow:hidden;}
.cot-bl.on{display:flex;opacity:1;}
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
.cot-bl .mapsub{margin-top:7px;font-family:${FONT_COND};font-size:11.5px;font-weight:600;
  letter-spacing:.24em;text-indent:.24em;color:#9fb0bf;text-transform:uppercase;}
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
  margin-bottom:8px;font-family:${FONT_COND};font-variant-numeric:tabular-nums;}
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
@media (max-height:700px){.cot-bl .hero{flex-basis:32%;min-height:150px;}
  .cot-bl .tip{display:none;}}
`;

const BATTLE_TIPS = [
  ['Opening move', 'Do not drive into the open on the first bounce of the clock — let the scouts spot and pick a flank once the map has told you where the weight went.'],
  ['Trade', 'Fire, then break line of sight. A shot that costs you two in return is a shot you should not have taken.'],
  ['Team', 'Allied guns matter more than yours. Fighting beside two friendlies beats fighting alone with the better tank.'],
  ['Minimap', 'Half of every battle is on the minimap. Check it at every reload.'],
];

/**
 * Create the pre-battle loading screen.
 * @returns {{show:(info:object)=>void, progress:(f:number,label?:string)=>void,
 *   countdown:(n:number)=>void, hide:()=>void, readonly visible:boolean,
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
    `<div class="mapname"></div><div class="mapsub"></div></div></div>` +
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
     *   mode?:string, allies:Array, enemies:Array}} info
     */
    show(info) {
      nameEl.textContent = info.mapName || 'Battlefield';
      subEl.textContent = info.mapSub || '';
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
      root.style.display = '';   // let .on drive layout again after a hide()
      root.classList.add('on');
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
      if (!visible) return;
      visible = false;
      // hold display through the opacity transition (.on carries display:flex,
      // so removing it alone would cut the fade to a hard pop)
      root.style.display = 'flex';
      root.classList.remove('on');
      setTimeout(() => { if (!visible) root.style.display = ''; }, 320);
    },
  };
  return api;
}
