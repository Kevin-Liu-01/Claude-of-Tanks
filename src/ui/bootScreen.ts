/**
 * bootScreen.ts — the branded entry + loading screen (WoT-style).
 *
 * WHY: the game used to boot into a black canvas for ~7.5 s while ~48 vehicle
 * texture sets and a 1 km battlefield baked, then pop straight into the garage.
 * The splash markup itself lives INLINE in index.html so first paint happens
 * from the HTML parse (no module graph, no WebGL context, no bakes); this
 * module only takes over the live parts:
 *
 *  - a progress bar driven by REAL load stages (main.ts BOOT STAGES calls
 *    begin()/end() around each one; weights below are measured costs, so the
 *    bar tracks wall-clock work instead of a fake timer),
 *  - the current stage name + percentage,
 *  - rotating gameplay tips,
 *  - a "press any key" gate into the garage. The gate is not decoration: an
 *    AudioContext may only start from a user gesture, so the keypress that
 *    dismisses it is also what lets audio.resume() succeed.
 *
 * HARNESS CONTRACT (docs/SCREENSHOT_CONTRACT.md): every headless probe drives
 * the page through window.__SHOTS / window.__DEBUG and never presses a key, so
 * the gate AUTO-SKIPS under automation (navigator.webdriver) and for an
 * explicit ?nosplash / ?nogate flag. window.__COT_FORCE_SPLASH=true (set by
 * tools/boot-probe.mjs before navigation) re-arms it so the boot screens can
 * still be captured.
 */

import { TRANSITION_SHOTS } from './featuredShots.ts';
import { mountGitHubStars } from './githubStars.ts';
import { preloadImage } from './imagePreload.ts';

declare global {
  interface Window {
    __COT_NO_BOOT_HERO?: boolean;
    __COT_FORCE_SPLASH?: boolean;
    __COT_BOOT_RECOVERY?: { progress?(stage: string): void };
  }
}

type BootTip = readonly [heading: string, body: string];
type BootStage = readonly [key: string, label: string, weight: number];

export interface BootScreenOptions {
  readonly mode?: 'garage' | 'studio';
}

export interface BootScreen {
  begin(key: string): void;
  end(key: string): void;
  sub(fraction: number): void;
  note(text: string): void;
  ready(): Promise<void>;
  dismiss(): void;
  readonly gated: boolean;
}

const TIPS = [
  ['Angling', 'Turn your hull 20-30° away from the shooter. Side plates presented at an angle gain effective thickness — flat-on armour is the easiest armour to punch through.'],
  ['Weak spots', 'Aim for the lower front plate, the turret ring and the cupola. A tier-X glacis will bounce almost anything; the hatches next to it will not.'],
  ['Camouflage', 'Standing still in a bush drops your spotting range dramatically. Move, and every bonus you were sitting on disappears.'],
  ['Gun handling', 'Wait for the reticle to converge before firing. A shot taken on a wide circle is a shot given away — accuracy is the circle, not the crosshair.'],
  ['Hull-down', 'Park behind a ridge so only your turret shows. Most tanks carry their thickest armour there, and the hull the enemy wants to hit is simply not on screen.'],
  ['Tracks', 'A tracked vehicle cannot turn or run. De-track a heavy at close range and you own the next twelve seconds of the fight.'],
  ['Sniper mode', 'Hold RMB with the default aim setting, or wheel inward past the closest arcade zoom, to enter the gunner sight. Scope in for the shot and back out to move.'],
  ['Gun hold', 'Hold Caps Lock to preserve the current turret rotation and gun elevation while freely moving the live sight. Guided missiles follow that sight; release to let the gun catch up. Left Alt remains a secondary shortcut.'],
  ['Spotting', 'You only see what your crew sees. A target that vanishes was never killed — it just stopped being spotted, and it is still aiming at you.'],
  ['Shell types', 'APCR flies flatter and penetrates more; HE never bounces but barely scratches thick plate. Carry both and pick per target.'],
  ['Terrain', 'Soft ground and steep climbs bleed speed. Read the ground before you commit — the fastest route across a map is rarely the straightest.'],
  ['Ammo rack', 'Modules and crew take damage separately from your hit points. A "healthy" tank with a damaged gun and a dead gunner has already lost the trade.'],
  ['Flanking', 'Rear armour is the thinnest plate on every vehicle in the game. Getting behind a heavy is worth more than out-shooting it from the front.'],
] as const satisfies readonly BootTip[];

// Weighted load stages. Weight = measured share of boot wall-clock, so the bar
// moves at a roughly constant rate instead of parking at 40% for three seconds.
// Keep the keys in sync with the main.ts BOOT STAGES block.
const GARAGE_STAGES = [
  ['renderer', 'Initialising renderer', 4],
  ['sky', 'Baking sky and atmosphere', 16],
  ['lighting', 'Placing sun and shadow cascades', 7],
  ['garage', 'Assembling the garage bay', 6],
  ['vehicle', 'Painting your vehicle', 24],
  ['hud', 'Building combat interface', 10],
  ['ui', 'Loading vehicle roster', 14],
  ['audio', 'Priming audio engine', 4],
  ['post', 'Compiling post-processing chain', 12],
  ['ready', 'Standing by', 3],
] as const satisfies readonly BootStage[];

// Direct Studio navigation keeps the first, already-painted boot surface in
// charge until the battlefield and focused FX warm are ready.  The previous
// flow completed this list, briefly revealed the garage, then opened a second
// loading screen whose work was invisible to this meter.
const STUDIO_STAGES = [
  ['renderer', 'Initialising renderer', 3],
  ['sky', 'Baking sky and atmosphere', 4],
  ['lighting', 'Placing sun and shadow cascades', 2],
  ['garage', 'Preparing shared scene', 9],
  ['vehicle', 'Priming vehicle materials', 7],
  ['hud', 'Wiring authoring overlays', 2],
  ['ui', 'Preparing shared controls', 3],
  ['audio', 'Priming audio engine', 1],
  ['post', 'Compiling post-processing chain', 14],
  ['studio', 'Building Scene Studio', 52],
  ['ready', 'Standing by', 3],
] as const satisfies readonly BootStage[];

const $ = <ElementType extends HTMLElement = HTMLElement>(id: string): ElementType | null =>
  document.getElementById(id) as ElementType | null;

// Marketing backdrop set (in-engine action stills — tools/marketing-shots).
// All are lazy-loaded AFTER the selected Garage vehicle has finished its
// builder/paint stage. The unchanged image remains visible while the entry
// gate is present, but it cannot compete with the cold critical path for
// network, decode, or main-thread time (cold-load-probe guards the timing).
// r9.5: the list lives in featuredShots.ts — ONE copy shared with the
// garage gallery and the state-transition screens, because hand-synced
// copies drifted from disk twice (the r9.1 "same picture every load" bug).
// Keep the first percentage screen on the curated current-capture pool. Export
// the binding so the loading-screen self-test can guard against old renders
// accidentally returning to this first paint surface.
export const BOOT_HERO_SHOTS = TRANSITION_SHOTS;
const HERO_SHOTS = BOOT_HERO_SHOTS;
type BootHeroShot = (typeof HERO_SHOTS)[number];
const HERO_ROTATE_MS = 9000;

/**
 * Lazy marketing backdrop behind the splash chrome. Fades the first still in
 * once it has decoded, then slow-crossfades through the set while the screen
 * is up. Returns a stop() used by dismiss().
 * @returns {() => void}
 */
function startBootHero() {
  const wrap = $<HTMLDivElement>('cot-boot-hero');
  if (!wrap || !HERO_SHOTS.length || window.__COT_NO_BOOT_HERO) return () => {};
  let q = '';
  try { q = window.location.search || ''; } catch (_) { q = ''; }
  if (/[?&]nohero\b/.test(q)) return () => {}; // A/B timing escape hatch
  const layers = wrap.querySelectorAll<HTMLElement>('.hly');
  if (layers.length < 2) return () => {};
  let idx = -1;
  let front = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  const urlFor = (shot: BootHeroShot): string => shot.bootImg || shot.img;
  const show = (i: number): void => {
    const shot = HERO_SHOTS[i];
    front ^= 1;
    layers[front].style.backgroundImage = `url("${urlFor(shot)}")`;
    layers[front].style.backgroundPosition = shot.focal || 'center';
    layers[front].classList.add('on');
    layers[front ^ 1].classList.remove('on');
    idx = i;
  };
  const preload = (i: number, callback: () => void): void => {
    // This is presentation, not a boot dependency. Low fetch priority keeps
    // the selected tank's exact builder and paint assets ahead of the splash
    // image on a first visit while still decoding the small hero during boot.
    preloadImage(urlFor(HERO_SHOTS[i]), { priority: 'low' }).then((url) => {
      if (url && !stopped) callback();
    });
  };
  const advance = () => {
    const next = (idx + 1) % HERO_SHOTS.length;
    preload(next, () => { if (!stopped) show(next); });
  };
  const stopRotation = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const startRotation = () => {
    if (!stopped && !document.hidden && !timer && HERO_SHOTS.length > 1) {
      timer = setInterval(advance, HERO_ROTATE_MS);
    }
  };
  const onVisibility = () => {
    if (document.hidden) stopRotation();
    else startRotation();
  };
  document.addEventListener('visibilitychange', onVisibility);
  // First still: decode fully off the critical path, then fade in. The owner-
  // selected handmade hero stays first; the remaining picks rotate afterward.
  const first = 0;
  preload(first, () => {
    show(first);
    startRotation();
  });
  return () => {
    stopped = true;
    stopRotation();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/**
 * Should the entry gate be dismissed without a keypress?
 * @returns {boolean} true for headless harnesses / explicit ?nosplash
 */
function bootGateSkipped() {
  if (typeof window === 'undefined') return true;
  if (window.__COT_FORCE_SPLASH) return false;
  let q = '';
  try { q = window.location.search || ''; } catch (_) { q = ''; }
  if (/[?&](nosplash|nogate)\b/.test(q)) return true;
  return !!(navigator && navigator.webdriver);
}

/**
 * Wire the inline splash in index.html up to the real load stages.
 *
 * Every method is safe to call when the markup is absent (a stripped build, a
 * unit-test DOM) — the boot sequence must never depend on the screen existing.
 *
 * @returns {{begin:(k:string)=>void, end:(k:string)=>void, sub:(f:number)=>void,
 *   note:(s:string)=>void, ready:()=>Promise<void>, dismiss:()=>void,
 *   readonly gated:boolean}}
 */
export function createBootScreen({ mode = 'garage' }: BootScreenOptions = {}): BootScreen {
  const stages = mode === 'studio' ? STUDIO_STAGES : GARAGE_STAGES;
  const root = $('cot-boot');
  const elStage = $('cot-boot-stage');
  const elPct = $('cot-boot-pct');
  const elFill = $('cot-boot-fill');
  const elTicks = $('cot-boot-ticks');
  const elTip = $('cot-boot-tip');
  const elGate = $('cot-boot-gate');
  mountGitHubStars(document);

  const heartbeat = (stage: string): void => {
    try { window.__COT_BOOT_RECOVERY?.progress?.(stage); } catch (_) { /* recovery is optional */ }
  };
  heartbeat('boot-screen');

  const total = stages.reduce((a, s) => a + s[2], 0);
  // cumulative [start, end] fraction per stage key
  const span = new Map<string, readonly [start: number, end: number]>();
  {
    let acc = 0;
    for (const [key, , w] of stages) {
      span.set(key, [acc / total, (acc + w) / total]);
      acc += w;
    }
  }

  const tickEls: HTMLSpanElement[] = [];
  if (elTicks) {
    for (let i = 0; i < stages.length; i++) {
      const s = document.createElement('span');
      elTicks.appendChild(s);
      tickEls.push(s);
    }
  }

  let target = 0;      // where the real load says we are
  let shown = 0;       // eased value actually rendered
  let curKey: string | null = null;
  let dismissed = false;
  let finished = false;
  let raf = 0;
  let tipTimer: ReturnType<typeof setInterval> | null = null;
  let tipIdx = Math.floor(Math.random() * TIPS.length);

  function paint() {
    // Ease toward the real target so a stage that lands 20 points of progress
    // in one blocking call still reads as motion rather than a jump.
    shown += (target - shown) * 0.16;
    if (target - shown < 0.0015) shown = target;
    if (elFill) elFill.style.width = `${(shown * 100).toFixed(1)}%`;
    if (elPct) elPct.textContent = `${Math.round(shown * 100)}%`;
    raf = 0;
    if (shown !== target) schedule();
  }
  function schedule() {
    if (raf || !root) return;
    raf = requestAnimationFrame(paint);
  }

  function showTip(i: number): void {
    if (!elTip) return;
    const [head, body] = TIPS[i % TIPS.length];
    elTip.innerHTML = `<b>${head}</b>${body}`;
  }
  function rotateTip() {
    if (!elTip || dismissed) return;
    elTip.classList.add('fade');
    setTimeout(() => {
      if (dismissed) return;
      tipIdx = (tipIdx + 1) % TIPS.length;
      showTip(tipIdx);
      elTip.classList.remove('fade');
    }, 360);
  }
  showTip(tipIdx);
  if (root) tipTimer = setInterval(rotateTip, 5200);
  let heroStarted = false;
  let stopHero = () => {};
  const ensureHeroStarted = (): void => {
    // Automation and explicit no-splash entry remove this surface at ready;
    // never start a decorative request that cannot become visible.
    if (!root || heroStarted || dismissed || bootGateSkipped()) return;
    heroStarted = true;
    stopHero = startBootHero();
  };

  function stageLabel(key: string): string {
    const s = stages.find((x) => x[0] === key);
    return s ? s[1] : key;
  }

  const api: BootScreen = {
    /** Enter a stage: bar jumps to its start, label + tick update. */
    begin(key: string) {
      heartbeat(key);
      curKey = key;
      const sp = span.get(key);
      if (sp && sp[0] > target) target = sp[0];
      if (elStage) elStage.textContent = stageLabel(key);
      schedule();
    },
    /** Leave a stage: bar advances to its end and its tick lights up. */
    end(key: string) {
      heartbeat(`${key || curKey}:complete`);
      const effectiveKey = key || curKey;
      const sp = effectiveKey ? span.get(effectiveKey) : undefined;
      if (sp && sp[1] > target) target = sp[1];
      const i = stages.findIndex((x) => x[0] === effectiveKey);
      if (i >= 0 && tickEls[i]) tickEls[i].classList.add('on');
      if (effectiveKey === 'vehicle') ensureHeroStarted();
      schedule();
    },
    /** Sub-progress inside the current stage (0..1) — used by the world build. */
    sub(f: number) {
      heartbeat(curKey || 'sub-progress');
      const sp = curKey ? span.get(curKey) : undefined;
      if (!sp) return;
      const v = sp[0] + (sp[1] - sp[0]) * Math.max(0, Math.min(1, f));
      if (v > target) target = v;
      schedule();
    },
    /** Override the visible stage label without touching the bar. */
    note(text: string) {
      heartbeat(curKey || 'note');
      if (elStage) elStage.textContent = text;
    },

    /**
     * Loading complete. Snaps the bar to 100%, arms the entry gate and
     * resolves once the player commits (immediately under automation).
     * @returns {Promise<void>}
     */
    ready() {
      ensureHeroStarted();
      finished = true;
      target = 1;
      shown = Math.max(shown, 0.985);
      schedule();
      for (const t of tickEls) t.classList.add('on');
      if (elStage) elStage.textContent = mode === 'studio' ? 'Studio ready' : 'Ready for battle';
      if (!root || bootGateSkipped()) { api.dismiss(); return Promise.resolve(); }
      if (elGate) elGate.classList.add('on');
      return new Promise<void>((resolve) => {
        const go = (ev: Event) => {
          // Credits and GitHub are deliberate splash controls, not entry
          // gestures. Let them remain interactive without dismissing the
          // game gate underneath the modal/link click.
          if (ev?.target instanceof Element && ev.target.closest('[data-cot-boot-control]')) return;
          // ignore pure modifier taps so Cmd-Tab back into the tab does not
          // consume the gate
          if (ev.type === 'keydown' && ev instanceof KeyboardEvent &&
              ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(ev.key)) return;
          window.removeEventListener('keydown', go, true);
          window.removeEventListener('pointerdown', go, true);
          api.dismiss();
          resolve();
        };
        window.addEventListener('keydown', go, true);
        window.addEventListener('pointerdown', go, true);
      });
    },

    /** Tear the screen down now (gate skip, or a __SHOTS.set staging call). */
    dismiss() {
      if (dismissed) return;
      dismissed = true;
      stopHero();
      if (tipTimer) clearInterval(tipTimer);
      if (raf) cancelAnimationFrame(raf);
      if (!root) return;
      root.classList.add('cot-boot-out');
      // keep it in the DOM for one transition, then drop it so the tips and
      // the animated sheen stop costing style recalcs during play
      setTimeout(() => { if (root.parentNode) root.parentNode.removeChild(root); }, 620);
    },

    /** True while the entry gate is still waiting on the player. */
    get gated() { return finished && !dismissed; },
  };
  return api;
}
