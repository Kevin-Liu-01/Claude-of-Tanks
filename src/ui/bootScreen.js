/**
 * bootScreen.js — the branded entry + loading screen (WoT-style).
 *
 * WHY: the game used to boot into a black canvas for ~7.5 s while ~48 vehicle
 * texture sets and a 1 km battlefield baked, then pop straight into the garage.
 * The splash markup itself lives INLINE in index.html so first paint happens
 * from the HTML parse (no module graph, no WebGL context, no bakes); this
 * module only takes over the live parts:
 *
 *  - a progress bar driven by REAL load stages (main.js BOOT STAGES calls
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

import { FEATURED_IMAGES } from './featuredShots.js';

const TIPS = [
  ['Angling', 'Turn your hull 20-30° away from the shooter. Side plates presented at an angle gain effective thickness — flat-on armour is the easiest armour to punch through.'],
  ['Weak spots', 'Aim for the lower front plate, the turret ring and the cupola. A tier-X glacis will bounce almost anything; the hatches next to it will not.'],
  ['Camouflage', 'Standing still in a bush drops your spotting range dramatically. Move, and every bonus you were sitting on disappears.'],
  ['Gun handling', 'Wait for the reticle to converge before firing. A shot taken on a wide circle is a shot given away — accuracy is the circle, not the crosshair.'],
  ['Hull-down', 'Park behind a ridge so only your turret shows. Most tanks carry their thickest armour there, and the hull the enemy wants to hit is simply not on screen.'],
  ['Tracks', 'A tracked vehicle cannot turn or run. De-track a heavy at close range and you own the next twelve seconds of the fight.'],
  ['Sniper mode', 'Shift drops you into the gunner sight. Zoom costs you situational awareness, so scope in for the shot and scope back out to move.'],
  ['Spotting', 'You only see what your crew sees. A target that vanishes was never killed — it just stopped being spotted, and it is still aiming at you.'],
  ['Shell types', 'APCR flies flatter and penetrates more; HE never bounces but barely scratches thick plate. Carry both and pick per target.'],
  ['Terrain', 'Soft ground and steep climbs bleed speed. Read the ground before you commit — the fastest route across a map is rarely the straightest.'],
  ['Ammo rack', 'Modules and crew take damage separately from your hit points. A "healthy" tank with a damaged gun and a dead gunner has already lost the trade.'],
  ['Flanking', 'Rear armour is the thinnest plate on every vehicle in the game. Getting behind a heavy is worth more than out-shooting it from the front.'],
];

// Weighted load stages. Weight = measured share of boot wall-clock, so the bar
// moves at a roughly constant rate instead of parking at 40% for three seconds.
// Keep the keys in sync with the main.js BOOT STAGES block.
const STAGES = [
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
];

const $ = (id) => document.getElementById(id);

// Marketing backdrop set (in-engine action stills — tools/marketing-shots).
// All are lazy-loaded AFTER the splash has painted, so the boot critical
// path never waits on them (bootgate-probe guards the timing).
// r9.5: the list lives in featuredShots.js — ONE copy shared with the
// garage gallery and the state-transition screens, because hand-synced
// copies drifted from disk twice (the r9.1 "same picture every load" bug).
const HERO_SHOTS = FEATURED_IMAGES;
const HERO_ROTATE_MS = 9000;

/**
 * Lazy marketing backdrop behind the splash chrome. Fades the first still in
 * once it has decoded, then slow-crossfades through the set while the screen
 * is up. Returns a stop() used by dismiss().
 * @returns {() => void}
 */
function startBootHero() {
  const wrap = $('cot-boot-hero');
  if (!wrap || !HERO_SHOTS.length || window.__COT_NO_BOOT_HERO) return () => {};
  let q = '';
  try { q = window.location.search || ''; } catch (_) { q = ''; }
  if (/[?&]nohero\b/.test(q)) return () => {}; // A/B timing escape hatch
  const layers = wrap.querySelectorAll('.hly');
  if (layers.length < 2) return () => {};
  let idx = -1;
  let front = 0;
  let timer = 0;
  let stopped = false;
  const show = (i) => {
    front ^= 1;
    layers[front].style.backgroundImage = `url("${HERO_SHOTS[i]}")`;
    layers[front].classList.add('on');
    layers[front ^ 1].classList.remove('on');
    idx = i;
  };
  const preload = (i, cb) => {
    const im = new Image();
    im.onload = () => { if (!stopped) cb(); };
    im.onerror = () => { /* missing still — keep the gradient field */ };
    im.src = HERO_SHOTS[i];
  };
  const advance = () => {
    const next = (idx + 1) % HERO_SHOTS.length;
    preload(next, () => { if (!stopped) show(next); });
  };
  // first still: decode fully off the critical path, then fade in.
  // Start at a RANDOM still (owner: different picture every load).
  const first = Math.floor(Math.random() * HERO_SHOTS.length);
  preload(first, () => {
    show(first);
    if (HERO_SHOTS.length > 1) timer = setInterval(advance, HERO_ROTATE_MS);
  });
  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
  };
}

/**
 * Should the entry gate be dismissed without a keypress?
 * @returns {boolean} true for headless harnesses / explicit ?nosplash
 */
export function bootGateSkipped() {
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
export function createBootScreen() {
  const root = $('cot-boot');
  const elStage = $('cot-boot-stage');
  const elPct = $('cot-boot-pct');
  const elFill = $('cot-boot-fill');
  const elTicks = $('cot-boot-ticks');
  const elTip = $('cot-boot-tip');
  const elGate = $('cot-boot-gate');

  const total = STAGES.reduce((a, s) => a + s[2], 0);
  // cumulative [start, end] fraction per stage key
  const span = new Map();
  {
    let acc = 0;
    for (const [key, , w] of STAGES) {
      span.set(key, [acc / total, (acc + w) / total]);
      acc += w;
    }
  }

  const tickEls = [];
  if (elTicks) {
    for (let i = 0; i < STAGES.length; i++) {
      const s = document.createElement('span');
      elTicks.appendChild(s);
      tickEls.push(s);
    }
  }

  let target = 0;      // where the real load says we are
  let shown = 0;       // eased value actually rendered
  let curKey = null;
  let dismissed = false;
  let finished = false;
  let raf = 0;
  let tipTimer = 0;
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

  function showTip(i) {
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
  const stopHero = root ? startBootHero() : () => {};

  function stageLabel(key) {
    const s = STAGES.find((x) => x[0] === key);
    return s ? s[1] : key;
  }

  const api = {
    /** Enter a stage: bar jumps to its start, label + tick update. */
    begin(key) {
      curKey = key;
      const sp = span.get(key);
      if (sp && sp[0] > target) target = sp[0];
      if (elStage) elStage.textContent = stageLabel(key);
      schedule();
    },
    /** Leave a stage: bar advances to its end and its tick lights up. */
    end(key) {
      const sp = span.get(key || curKey);
      if (sp && sp[1] > target) target = sp[1];
      const i = STAGES.findIndex((x) => x[0] === (key || curKey));
      if (i >= 0 && tickEls[i]) tickEls[i].classList.add('on');
      schedule();
    },
    /** Sub-progress inside the current stage (0..1) — used by the world build. */
    sub(f) {
      const sp = span.get(curKey);
      if (!sp) return;
      const v = sp[0] + (sp[1] - sp[0]) * Math.max(0, Math.min(1, f));
      if (v > target) target = v;
      schedule();
    },
    /** Override the visible stage label without touching the bar. */
    note(text) { if (elStage) elStage.textContent = text; },

    /**
     * Loading complete. Snaps the bar to 100%, arms the entry gate and
     * resolves once the player commits (immediately under automation).
     * @returns {Promise<void>}
     */
    ready() {
      finished = true;
      target = 1;
      shown = Math.max(shown, 0.985);
      schedule();
      for (const t of tickEls) t.classList.add('on');
      if (elStage) elStage.textContent = 'Ready for battle';
      if (!root || bootGateSkipped()) { api.dismiss(); return Promise.resolve(); }
      if (elGate) elGate.classList.add('on');
      return new Promise((resolve) => {
        const go = (ev) => {
          // ignore pure modifier taps so Cmd-Tab back into the tab does not
          // consume the gate
          if (ev && ev.type === 'keydown' &&
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
