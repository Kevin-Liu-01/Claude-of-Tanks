/**
 * transition.ts — branded full-screen transitions between game states.
 *
 * WHY: state swaps used to hard-pop — garage→studio flashed a half-built
 * frame behind a tiny busy label, and leaving a battle (or the studio)
 * snapped straight to the garage mid-frame. Every state change now passes
 * through the same loading-screen identity the boot splash and the
 * pre-battle screen established: featured action still + scrim, crest mark,
 * amber kicker, big condensed title, progress bar when there is real work
 * to track.
 *
 * The overlay sits at z-index 170 — above the pre-battle screen (150) and
 * every HUD/panel layer, below only the boot splash (200).
 *
 * HARNESS CONTRACT: headless probes (navigator.webdriver, or an explicit
 * ?notrans) must never see this overlay — they drive states via
 * window.__SHOTS / __STUDIO and capture immediately after. Under automation
 * run() executes its work synchronously with no overlay, no fades and no
 * dwell, preserving the old call timing exactly.
 */

import { FONT_STACK, FONT_COND } from './fonts.ts';
import {
  FEATURED_IMAGES,
  FEATURED_SHOTS,
  TRANSITION_SHOTS,
  featuredShotForMap,
  randomFeaturedShot,
} from './featuredShots.ts';
import { isImagePreloaded, preloadImage } from './imagePreload.ts';
import { t } from './i18n.ts';

const FADE_IN_MS = 190;
const FADE_OUT_MS = 140;
const QUICK_FADE_IN_MS = 90;
const QUICK_FADE_OUT_MS = 80;

export type TransitionPace = 'standard' | 'quick';

export interface TransitionOptions {
  readonly kicker?: string;
  readonly title?: string;
  readonly sub?: string;
  readonly progress?: boolean;
  readonly hero?: string;
  readonly mapId?: string;
  readonly minShowMs?: number;
  /** Shorter veil timing for already-resident state returns. */
  readonly pace?: TransitionPace;
}

export type TransitionProgress = (fraction: number, label?: string) => void;
export type TransitionWork<Result> = (progress: TransitionProgress) => Result | Promise<Result>;

export interface TransitionScreen {
  readonly visible: boolean;
  readonly active: boolean;
  show(options?: TransitionOptions): void;
  progress(fraction: number, label?: string): void;
  hide(): Promise<void>;
  run<Result>(work: TransitionWork<Result>, options?: TransitionOptions): Promise<Result>;
}

const CSS = `
.cot-trans{position:fixed;inset:0;z-index:170;display:none;align-items:center;
  justify-content:center;flex-direction:column;background:#05080b;opacity:0;
  transition:opacity ${FADE_IN_MS}ms var(--cot-ease-out);font-family:${FONT_STACK};color:#e6edf3;
  -webkit-user-select:none;user-select:none;cursor:default;overflow:hidden;}
.cot-trans.on{display:flex;}
.cot-trans.lit{opacity:1;}
.cot-trans.out{opacity:0;transition:opacity ${FADE_OUT_MS}ms var(--cot-ease-out);}
.cot-trans.quick{transition-duration:${QUICK_FADE_IN_MS}ms;}
.cot-trans.quick.out{transition-duration:${QUICK_FADE_OUT_MS}ms;}
.cot-trans *{box-sizing:border-box;margin:0;padding:0;}
.cot-trans .bg{position:absolute;inset:-2%;background-size:cover;
  background-position:center;filter:saturate(.88) contrast(1.04);
  transform:scale(1.02);transition:transform 6s var(--cot-ease-soft);}
.cot-trans.lit .bg{transform:scale(1.07);}
.cot-trans .scrim{position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(5,8,11,.78) 0%,rgba(5,8,11,.46) 46%,rgba(5,8,11,.9) 100%);}
.cot-trans .vig{position:absolute;inset:0;
  background:radial-gradient(108% 125% at 50% 38%,rgba(0,0,0,0) 38%,rgba(0,0,0,.74) 100%);}
.cot-trans .core{position:relative;display:flex;flex-direction:column;align-items:center;
  transform:translateY(8px);opacity:0;
  transition:transform var(--cot-motion-slow) var(--cot-ease-out),
    opacity var(--cot-motion-base) var(--cot-ease-out);}
.cot-trans.lit .core{transform:translateY(0);opacity:1;}
.cot-trans .mark{width:46px;height:46px;object-fit:contain;
  filter:drop-shadow(0 4px 18px rgba(0,0,0,.7));}
.cot-trans .kick{margin-top:16px;font-family:${FONT_COND};font-size:11px;font-weight:700;
  letter-spacing:.4em;text-indent:.4em;color:#f0a030;text-transform:uppercase;}
.cot-trans .title{margin-top:9px;font-size:clamp(26px,4.2vw,44px);font-weight:800;
  letter-spacing:.16em;text-indent:.16em;text-transform:uppercase;color:#f4f8fc;
  text-shadow:0 3px 26px rgba(0,0,0,.85);text-align:center;}
.cot-trans .sub{margin-top:8px;font-family:${FONT_COND};font-size:11.5px;font-weight:600;
  letter-spacing:.26em;text-indent:.26em;color:#9fb0bf;text-transform:uppercase;
  min-height:15px;text-align:center;}
.cot-trans .meter{margin-top:30px;width:min(400px,64vw);}
.cot-trans .meter.off{visibility:hidden;}
.cot-trans .mrow{display:flex;align-items:baseline;justify-content:space-between;
  margin-bottom:7px;font-family:${FONT_COND};font-variant-numeric:tabular-nums;}
.cot-trans .mstage{font-size:10px;font-weight:700;letter-spacing:.26em;color:#9fb0bf;
  text-transform:uppercase;}
.cot-trans .mpct{font-size:15px;font-weight:700;color:#ffd27a;}
.cot-trans .mbar{position:relative;height:4px;background:rgba(255,255,255,.07);
  box-shadow:inset 0 0 0 1px rgba(146,164,180,.22);}
.cot-trans .mfill{position:absolute;left:0;top:0;bottom:0;width:0%;
  background:linear-gradient(90deg,#b96f10,#f0a030 65%,#ffcf7d);
  box-shadow:0 0 14px rgba(240,160,48,.5);transition:width .16s linear;}
@media (prefers-reduced-motion:reduce){
  .cot-trans .bg,.cot-trans .core{transform:none!important;}
}
`;

/** @returns {boolean} true when transitions must be invisible (probes). */
function skipTransitions() {
  if (typeof window === 'undefined') return true;
  let q = '';
  try { q = window.location.search || ''; } catch (_) { q = ''; }
  if (/[?&]notrans\b/.test(q)) return true;
  return typeof navigator !== 'undefined' && !!navigator.webdriver;
}

// Timers, never requestAnimationFrame: rAF does not fire in a hidden tab,
// and a transition that gates the actual state swap must keep sequencing
// even when the document is backgrounded mid-swap (the game loop has its
// own hidden-document fallback; this must be at least as robust).
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Transition screen is missing ${selector}`);
  return element;
}

/**
 * Create the shared state-transition screen.
 * @returns {TransitionScreen}
 */
export function createTransition(): TransitionScreen {
  if (!document.getElementById('cot-trans-style')) {
    const s = document.createElement('style');
    s.id = 'cot-trans-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  const root = document.createElement('div');
  root.className = 'cot-trans';
  root.innerHTML =
    `<div class="bg"></div><div class="scrim"></div><div class="vig"></div>` +
    `<div class="core">` +
    `<img class="mark" src="/brand/logo-mark.svg" alt="" draggable="false">` +
    `<div class="kick"></div><div class="title"></div><div class="sub"></div>` +
    `<div class="meter"><div class="mrow"><div class="mstage"></div>` +
    `<div class="mpct">0%</div></div>` +
    `<div class="mbar"><div class="mfill"></div></div></div>` +
    `</div>`;
  document.body.appendChild(root);

  const bgEl = requiredElement<HTMLDivElement>(root, '.bg');
  const kickEl = requiredElement<HTMLDivElement>(root, '.kick');
  const titleEl = requiredElement<HTMLDivElement>(root, '.title');
  const subEl = requiredElement<HTMLDivElement>(root, '.sub');
  const meterEl = requiredElement<HTMLDivElement>(root, '.meter');
  const stageEl = requiredElement<HTMLDivElement>(root, '.mstage');
  const pctEl = requiredElement<HTMLDivElement>(root, '.mpct');
  const fillEl = requiredElement<HTMLDivElement>(root, '.mfill');

  let visible = false;
  let shownAt = 0;
  let hideToken = 0; // cancels a pending hide when show() re-enters first
  let warmAfterWork: string | null = null;
  let activeFadeOutMs = FADE_OUT_MS;
  const api: TransitionScreen = {
    get visible() { return visible; },
    // `visible` flips false when fade-out begins. `active` remains true until
    // the veil has actually left layout, so background builders cannot resume
    // underneath the last transition frames and turn the reveal into a stall.
    get active() { return root.classList.contains('on'); },

    /**
     * Stage and fade the screen in.
     * @param {{kicker?:string, title?:string, sub?:string, progress?:boolean,
     *   hero?:string, mapId?:string}} [o] progress:false hides the meter (pure veil).
     */
    show(o: TransitionOptions = {}) {
      if (skipTransitions()) return;
      hideToken++;
      const token = hideToken;
      kickEl.textContent = o.kicker || 'Claude of Tanks';
      titleEl.textContent = o.title || '';
      subEl.textContent = o.sub || '';
      meterEl.classList.toggle('off', o.progress === false);
      api.progress(0, t('transition.stage.loading'));
      const shot = o.hero
        ? FEATURED_SHOTS.find((entry) => entry.img === o.hero) || { img: o.hero, focal: 'center' }
        : o.mapId ? featuredShotForMap(o.mapId) : randomFeaturedShot();
      const hero = shot.img;
      const warmHero = isImagePreloaded(hero) || !isImagePreloaded(FEATURED_IMAGES[0])
        ? hero : FEATURED_IMAGES[0];
      const warmShot = FEATURED_SHOTS.find((entry) => entry.img === warmHero) || shot;
      bgEl.style.backgroundPosition = warmShot.focal || 'center';
      preloadImage(warmHero, { priority: 'high' }).then((url) => {
        if (url && visible && hideToken === token) {
          bgEl.style.backgroundImage = `url("${url}")`;
          bgEl.style.backgroundPosition = warmShot.focal || 'center';
        }
      });
      // Decode the requested random frame off the fade-critical path, then
      // swap only after decode has completed (CSS no longer blocks on it).
      if (warmHero !== hero) preloadImage(hero, { priority: 'high' }).then((url) => {
        if (url && visible && hideToken === token) {
          bgEl.style.backgroundImage = `url("${url}")`;
          bgEl.style.backgroundPosition = shot.focal || 'center';
        }
      });
      // Keep the following curated capture warm for the next state change.
      const at = TRANSITION_SHOTS.findIndex((entry) => entry.img === hero);
      warmAfterWork = at >= 0 && TRANSITION_SHOTS.length > 1
        ? TRANSITION_SHOTS[(at + 1) % TRANSITION_SHOTS.length].img : null;
      const quick = o.pace === 'quick';
      activeFadeOutMs = quick ? QUICK_FADE_OUT_MS : FADE_OUT_MS;
      visible = true;
      shownAt = performance.now();
      root.classList.remove('out');
      root.classList.toggle('quick', quick);
      root.classList.add('on');
      // let the display flip commit before opacity animates (timer, not rAF —
      // see the sleep() note; in a hidden tab the fade simply skips)
      setTimeout(() => { if (visible) root.classList.add('lit'); }, 30);
    },

    /** Real progress. @param {number} f 0..1 @param {string} [label] */
    progress(f: number, label?: string) {
      const v = Math.max(0, Math.min(1, f));
      fillEl.style.width = `${(v * 100).toFixed(1)}%`;
      pctEl.textContent = `${Math.round(v * 100)}%`;
      if (label) stageEl.textContent = label;
    },

    /** Fade out and drop from layout. Resolves after the fade. */
    async hide() {
      if (skipTransitions() || !visible) return;
      const token = ++hideToken;
      visible = false;
      root.classList.add('out');
      root.classList.remove('lit');
      const fadeOutMs = activeFadeOutMs;
      await sleep(fadeOutMs + 40);
      if (hideToken === token) root.classList.remove('on', 'out', 'quick');
    },

    /**
     * Run `work` behind the screen: fade in, execute (passing a progress
     * callback), hold to minShowMs so cached loads still read as a screen
     * (the pre-battle screen's 900 ms dwell convention), fade out.
     * Under automation: executes work synchronously, no overlay, no dwell.
     * @param {(p:(f:number,l?:string)=>void)=>any} work
     * @param {{kicker?:string,title?:string,sub?:string,progress?:boolean,
     *   hero?:string,mapId?:string,minShowMs?:number}} [o]
     * @returns {Promise<Result>} work's result
     */
    async run<Result>(work: TransitionWork<Result>, o: TransitionOptions = {}): Promise<Result> {
      if (skipTransitions()) return work(() => {});
      api.show(o);
      const fadeInSettleMs = o.pace === 'quick'
        ? QUICK_FADE_IN_MS + 40
        : FADE_IN_MS + 60;
      await sleep(fadeInSettleMs); // land fully lit before heavy work stalls paint
      let result!: Result;
      try {
        result = await work(api.progress);
        api.progress(1, t('transition.stage.ready'));
        if (warmAfterWork) preloadImage(warmAfterWork, { priority: 'low' });
      } finally {
        const dwell = (o.minShowMs != null ? o.minShowMs : 800) -
          (performance.now() - shownAt);
        if (dwell > 0) await sleep(dwell);
        await api.hide();
      }
      return result;
    },
  };
  return api;
}
