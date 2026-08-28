/**
 * battleLoad.ts — pre-battle loading screen (World of Tanks battle-load
 * identity): map name + biome art, the two team rosters with vehicle names /
 * tiers / icons, a real progress bar, and a countdown into the battle.
 *
 * It is shown the instant BATTLE is pressed and torn down when the battle
 * actually starts, so it also MASKS the remaining world build — the 1 km
 * battlefield (terrain bake + vegetation + props) is no longer built during
 * boot, it is built behind this screen (main.ts ensureWorld → onProgress).
 *
 * Presentation only: main.ts supplies already-resolved rows. Icons come from
 * public/icons/<id>_side_silhouette.png (tools/genIcons.mjs).
 */

import { FONT_STACK, FONT_COND } from './fonts.ts';
import { iconUrl } from './icons.ts';
import { tierNumeral } from '../vehicles/tier.ts';

// Backward-compatible re-export for main.ts, killcam and end-screen callers.
export { tierNumeral };

const CSS = `
.cot-bl{position:fixed;inset:0;z-index:150;display:none;place-items:center;
  --bl-edge:clamp(18px,4vw,64px);--bl-panel:rgba(7,11,15,.9);
  font-family:${FONT_STACK};color:#e6edf3;-webkit-user-select:none;user-select:none;
  background:#05080b;opacity:1;overflow:hidden;isolation:isolate;}
.cot-bl.on{display:grid;opacity:1;}
.cot-bl.leaving{display:grid;opacity:0;transition:opacity var(--cot-motion-base) var(--cot-ease-out);}
.cot-bl *{box-sizing:border-box;margin:0;padding:0;}
.cot-bl::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;
  background-image:linear-gradient(rgba(190,208,221,.022) 1px,transparent 1px),
    linear-gradient(90deg,rgba(190,208,221,.018) 1px,transparent 1px);
  background-size:48px 48px;mask-image:linear-gradient(180deg,transparent,black 36%,black);}
/* Full-bleed map art keeps every aspect ratio intentional; the briefing card
   caps the information width so ultrawide screens never become empty space. */
.cot-bl .hero{position:absolute;inset:0;z-index:-1;overflow:hidden;}
.cot-bl .hero .art{position:absolute;inset:-4%;background-size:cover;
  background-position:center;filter:saturate(.82) contrast(1.08) brightness(.7);
  transform:scale(1.04);}
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
  background:linear-gradient(180deg,rgba(3,6,9,.2),rgba(3,6,9,.62) 38%,rgba(3,6,9,.94) 100%);}
.cot-bl .hero .vig{position:absolute;inset:0;
  background:radial-gradient(110% 90% at 50% 20%,transparent 24%,rgba(0,0,0,.78) 100%);}
.cot-bl .briefing{position:relative;z-index:1;width:min(1180px,calc(100vw - (var(--bl-edge) * 2)));
  height:min(720px,78dvh);min-height:520px;
  display:grid;grid-template-rows:auto minmax(0,1fr) auto;align-items:stretch;
  padding:clamp(20px,3vh,34px) clamp(18px,2.5vw,34px) clamp(16px,2.2vh,26px);
  background:linear-gradient(180deg,rgba(9,14,18,.46),var(--bl-panel) 31%,rgba(4,7,10,.95));
  border:1px solid rgba(177,195,208,.24);border-top-color:rgba(240,176,74,.58);
  box-shadow:0 22px 80px rgba(0,0,0,.5),inset 0 1px rgba(255,255,255,.035);}
.cot-bl .cap{text-align:center;padding-bottom:clamp(15px,2.5vh,27px);}
.cot-bl .kicker{font-family:${FONT_COND};font-size:10.5px;font-weight:700;
  letter-spacing:.36em;text-indent:.36em;color:#f0a030;text-transform:uppercase;}
.cot-bl .mapname{margin-top:7px;font-size:clamp(30px,4.1vw,52px);font-weight:800;
  letter-spacing:.14em;text-indent:.14em;text-transform:uppercase;color:#f4f8fc;
  text-shadow:0 3px 22px rgba(0,0,0,.9);}
/* --- rosters ------------------------------------------------------------- */
.cot-bl .teams{min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 54px minmax(0,1fr);
  align-items:center;gap:clamp(16px,3vw,42px);}
.cot-bl .team{min-width:0;display:flex;flex-direction:column;justify-content:center;}
.cot-bl .thead{display:flex;align-items:center;gap:9px;padding:0 8px 8px;
  border-bottom:1px solid rgba(146,164,180,.24);font-family:${FONT_COND};
  font-size:11px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;}
.cot-bl .team.ally .thead{color:#7fdc8a;border-bottom-color:rgba(127,220,138,.4);}
.cot-bl .team.foe .thead{color:#f07a72;border-bottom-color:rgba(240,122,114,.4);}
.cot-bl .team.foe .thead{flex-direction:row-reverse;}
.cot-bl .thead .n{margin-left:auto;font-variant-numeric:tabular-nums;color:#8a97a3;
  letter-spacing:.12em;}
.cot-bl .team.foe .thead .n{margin-left:0;margin-right:auto;}
.cot-bl .rows{display:flex;flex-direction:column;gap:3px;padding-top:7px;}
.cot-bl .row{display:flex;align-items:center;gap:10px;height:clamp(29px,4vh,35px);padding:0 8px;
  background:rgba(171,193,209,.045);border:1px solid rgba(161,181,196,.07);
  border-left:2px solid transparent;}
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
.cot-bl .vs{width:48px;height:48px;display:grid;place-items:center;justify-self:center;
  font-family:${FONT_COND};font-size:11px;font-weight:800;letter-spacing:.14em;color:#c8d4dd;
  background:rgba(6,10,14,.82);border:1px solid rgba(240,176,74,.34);
  box-shadow:inset 0 0 0 3px rgba(4,7,10,.75),0 8px 22px rgba(0,0,0,.4);}
/* --- footer: progress + countdown --------------------------------------- */
.cot-bl .foot{padding-top:clamp(15px,2.5vh,24px);}
.cot-bl .fmeta{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;
  margin-bottom:8px;font-family:${FONT_COND};letter-spacing:-.01em;font-variant-numeric:tabular-nums;}
.cot-bl .fstage{font-size:11px;font-weight:700;letter-spacing:.26em;color:#9fb0bf;
  text-transform:uppercase;}
.cot-bl .fpct{font-size:19px;font-weight:700;color:#ffd27a;}
.cot-bl .fbar{position:relative;height:5px;background:rgba(255,255,255,.07);overflow:hidden;
  box-shadow:inset 0 0 0 1px rgba(146,164,180,.22);}
.cot-bl .ffill{position:absolute;left:0;top:0;bottom:0;width:0%;
  background:linear-gradient(90deg,#b96f10,#f0a030 65%,#ffcf7d);
  box-shadow:0 0 14px rgba(240,160,48,.5);transition:width .18s linear;}
.cot-bl .count{margin-top:13px;text-align:center;font-family:${FONT_COND};
  font-size:15px;font-weight:800;letter-spacing:.3em;text-indent:.3em;
  color:#dce6ee;text-transform:uppercase;min-height:24px;
  text-shadow:0 2px 8px rgba(0,0,0,.9);}
.cot-bl .count b{color:#ffd27a;font-size:23px;text-shadow:0 0 18px rgba(240,160,48,.36);}
.cot-bl .tip{margin-top:9px;text-align:center;font-size:11px;color:#82909b;
  line-height:1.45;padding:0 5%;}
.cot-bl .tip b{color:#c2903f;font-family:${FONT_COND};font-weight:700;
  letter-spacing:.2em;text-transform:uppercase;font-size:9.5px;margin-right:8px;}
@media (prefers-reduced-motion:reduce){.cot-bl.leaving{transition-duration:1ms;}}
`;

const BATTLE_TIPS = [
  ['Opening move', 'Do not drive into the open on the first bounce of the clock — let the scouts spot and pick a flank once the map has told you where the weight went.'],
  ['Trade', 'Fire, then break line of sight. A shot that costs you two in return is a shot you should not have taken.'],
  ['Team', 'Allied guns matter more than yours. Fighting beside two friendlies beats fighting alone with the better tank.'],
  ['Minimap', 'Half of every battle is on the minimap. Check it at every reload.'],
];

export interface BattleLoadRosterRow {
  readonly id: string;
  readonly tier?: string;
  readonly name?: string;
  readonly isPlayer?: boolean;
}

export interface BattleLoadInfo {
  readonly mapName: string;
  readonly thumb?: string;
  readonly biome?: string;
  readonly mode?: string;
  readonly allies: readonly BattleLoadRosterRow[];
  readonly enemies: readonly BattleLoadRosterRow[];
}

export interface BattleLoadScreen {
  readonly root: HTMLElement;
  readonly visible: boolean;
  readonly covering: boolean;
  show(info: BattleLoadInfo): void;
  rosters(
    allies: readonly BattleLoadRosterRow[],
    enemies: readonly BattleLoadRosterRow[],
  ): void;
  progress(fraction: number, label?: string): void;
  countdown(seconds: number): void;
  hide(): Promise<void>;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Battle loading screen is missing ${selector}`);
  return element;
}

/**
 * Create the pre-battle loading screen.
 * @returns {{show:(info:object)=>void, rosters:(allies:Array,enemies:Array)=>void,
 *   progress:(f:number,label?:string)=>void,
 *   countdown:(n:number)=>void, hide:()=>Promise<void>, readonly visible:boolean,
 *   readonly covering:boolean,
 *   root:HTMLElement}}
 */
export function createBattleLoadScreen(): BattleLoadScreen {
  if (!document.getElementById('cot-bl-style')) {
    const s = document.createElement('style');
    s.id = 'cot-bl-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  const root = document.createElement('div');
  root.className = 'cot-bl';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-label', 'Preparing battle');
  root.innerHTML =
    `<div class="hero" aria-hidden="true"><div class="art none"></div><div class="scrim"></div><div class="vig"></div></div>` +
    `<main class="briefing"><div class="cap"><div class="kicker">Random Battle &middot; Standard</div>` +
    `<div class="mapname"></div></div>` +
    `<div class="teams">` +
    `<div class="team ally"><div class="thead"><span>Allies</span><span class="n">0</span></div>` +
    `<div class="rows"></div></div>` +
    `<div class="vs">VS</div>` +
    `<div class="team foe"><div class="thead"><span>Enemies</span><span class="n">0</span></div>` +
    `<div class="rows"></div></div>` +
    `</div>` +
    `<div class="foot" aria-live="polite"><div class="fmeta"><div class="fstage">Loading battlefield</div>` +
    `<div class="fpct">0%</div></div>` +
    `<div class="fbar" role="progressbar" aria-label="Battlefield loading" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="ffill"></div></div>` +
    `<div class="count"></div><div class="tip"></div></div></main>`;
  document.body.appendChild(root);

  const artEl = requiredElement<HTMLDivElement>(root, '.art');
  const nameEl = requiredElement<HTMLDivElement>(root, '.mapname');
  const kickEl = requiredElement<HTMLDivElement>(root, '.kicker');
  const allyRows = requiredElement<HTMLDivElement>(root, '.team.ally .rows');
  const foeRows = requiredElement<HTMLDivElement>(root, '.team.foe .rows');
  const allyN = requiredElement<HTMLSpanElement>(root, '.team.ally .n');
  const foeN = requiredElement<HTMLSpanElement>(root, '.team.foe .n');
  const stageEl = requiredElement<HTMLDivElement>(root, '.fstage');
  const pctEl = requiredElement<HTMLDivElement>(root, '.fpct');
  const fillEl = requiredElement<HTMLDivElement>(root, '.ffill');
  const progressEl = requiredElement<HTMLDivElement>(root, '.fbar');
  const countEl = requiredElement<HTMLDivElement>(root, '.count');
  const tipEl = requiredElement<HTMLDivElement>(root, '.tip');

  let visible = false;
  // `visible` is the requested open state and flips false when hide() starts.
  // `covering` follows the actual composited surface through its exit fade so
  // battle input cannot steer a camera that is only partly exposed yet.
  let covering = false;

  function fillTeam(
    host: HTMLElement,
    countEl2: HTMLElement,
    rows: readonly BattleLoadRosterRow[] = [],
  ): void {
    host.textContent = '';
    for (const r of rows) {
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
    countEl2.textContent = String(rows.length);
  }

  const api: BattleLoadScreen = {
    root,
    get visible() { return visible; },
    get covering() { return covering; },

    /**
     * Stage and show the screen.
     * @param {{mapName:string, thumb?:string, biome?:string,
     *   mode?:string, allies:Array, enemies:Array}} info
     */
    show(info: BattleLoadInfo) {
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
      covering = true;
      // Entry is a safety cover, not an animation: it must own the very next
      // composited frame on slower guests. Only the exit is allowed to fade.
      root.classList.remove('leaving');
      root.style.display = '';
      root.classList.add('on');
    },

    /** Update the team sheets without resetting the progress bar or tip. */
    rosters(
      allies: readonly BattleLoadRosterRow[],
      enemies: readonly BattleLoadRosterRow[],
    ) {
      fillTeam(allyRows, allyN, allies);
      fillTeam(foeRows, foeN, enemies);
    },

    /**
     * Real load progress.
     * @param {number} f 0..1
     * @param {string} [label] stage name
     */
    progress(f: number, label?: string) {
      const v = Math.max(0, Math.min(1, f));
      fillEl.style.width = `${(v * 100).toFixed(1)}%`;
      pctEl.textContent = `${Math.round(v * 100)}%`;
      progressEl.setAttribute('aria-valuenow', String(Math.round(v * 100)));
      if (label) stageEl.textContent = label;
    },

    /** Countdown line. @param {number} n seconds left (0 clears to "GO") */
    countdown(n: number) {
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
      return new Promise<void>((resolve) => setTimeout(() => {
        if (!visible) {
          root.classList.remove('leaving');
          covering = false;
        }
        resolve();
      }, 230));
    },
  };
  return api;
}
