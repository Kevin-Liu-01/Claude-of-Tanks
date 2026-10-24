import type { RuntimeValue } from '../runtimeTypes.ts';
import { MEDALS } from '../game/serviceRecord.ts';
import { createElement as el } from './dom.ts';
import { ensureStyle } from './styleLayers.ts';
import { FONT_COND, FONT_STACK } from './fonts.ts';
import { t } from './i18n.ts';
import { medalSVG } from './medalArt.ts';
// The moment a medal is earned mid-battle (serviceRecord.ts emits
// `service:medal`), a card drops in under the score strip, one at a time.
// Medals judged when the battle ends appear in the debrief instead.

const HOLD_MS = 3400;
const GAP_MS = 380;
const QUEUE_MAX = 4;

const CSS = `
.cot-medal-toasts{position:fixed;left:50%;top:var(--hud-banner-top,calc(var(--hud-objective-bottom,104px) + 16px));z-index:41;
  transform:translateX(-50%);max-width:calc(100vw - 32px);pointer-events:none;font-family:${FONT_STACK};}
.cot-medal-toasts:not([data-placement='ready']){visibility:hidden;}
body.cot-battle-ui-hidden .cot-medal-toasts,body.cot-si-report .cot-medal-toasts{display:none;}
.cot-medal-toast{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:var(--s3);
  box-sizing:border-box;min-width:min(250px,calc(100vw - 32px));max-width:min(380px,calc(100vw - 32px));padding:10px 26px;color:var(--ink-1);
  --medal-fill:linear-gradient(100deg,oklch(from var(--surface-page) l c h / .97),oklch(from var(--surface-page) l c h / .94));--medal-edge:oklch(from var(--ink-3) .59 c h);
  position:relative;isolation:isolate;background:var(--medal-edge);border:0;
  clip-path:polygon(14px 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,14px 100%,0 50%);
  box-shadow:0 10px 28px oklch(from var(--surface-scene) l c h / .5);opacity:0;transition:opacity var(--dur-base) ease-out;}
.cot-medal-toast::before{content:'';position:absolute;inset:1px;z-index:-1;background:var(--medal-fill);clip-path:inherit;}
.cot-medal-toast.show{opacity:1;}
.cot-medal-toast.leave{opacity:0;transition:opacity var(--dur-base) ease-in;}
.cot-medal-toast.signature{--medal-edge:var(--accent-lo);
  --medal-fill:radial-gradient(120% 140% at 0 50%,oklch(from var(--accent) l c h / .24),oklch(from var(--surface-page) l c h / .94) 62%);
  box-shadow:0 10px 30px oklch(from var(--surface-scene) l c h / .5),0 0 24px oklch(from var(--accent) l c h / .25);}
.cot-medal-toast .cot-medal-art{display:block;filter:drop-shadow(0 4px 6px oklch(from var(--surface-scene) l c h / .6));}
.cot-medal-toast .ey{display:block;font:700 var(--battle-fs-11) ${FONT_COND};letter-spacing:var(--track-label);text-transform:uppercase;color:var(--accent);}
.cot-medal-toast strong{display:block;margin-top:3px;font:700 17px ${FONT_COND};letter-spacing:.04em;color:var(--ink-1);
  text-transform:uppercase;line-height:1.05;}
.cot-medal-toast small{display:block;margin-top:var(--s1);font-size:var(--battle-fs-11);line-height:1.3;color:var(--ink-3);text-wrap:pretty;}
@media (max-width:640px){
  .cot-medal-toast{min-width:0;gap:9px;padding:var(--s2) var(--s5);}
  .cot-medal-toast strong{font-size:var(--battle-fs-14);}
  .cot-medal-toast small{display:none;}
}
@media (max-height:450px) and (orientation:landscape){
  .cot-medal-toast{min-width:0;max-width:min(320px,calc(100vw - 300px));gap:var(--s2);padding:var(--s1) 20px;}
  .cot-medal-toast .cot-medal-art{width:24px;height:auto;}
  .cot-medal-toast strong{font-size:var(--battle-fs-12);overflow-wrap:anywhere;}
  .cot-medal-toast small{display:none;}
}
@media (prefers-reduced-motion:reduce){
  .cot-medal-toast,.cot-medal-toast.leave{transition:opacity var(--dur-fast) linear;transform:none;}
}`;

interface ToastBus {
  on(event: string, listener: (payload?: RuntimeValue) => void): RuntimeValue;
}

/** Show medals as they are earned in battle. */
export function installMedalToasts(bus: ToastBus, parent: HTMLElement = document.body): void {
  ensureStyle('cot-medal-toast-style', CSS, 'surfaces');
  const root = el('div', 'cot-medal-toasts', parent);
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  const queue: string[] = [];
  let current: HTMLElement | null = null;
  let busy = false;
  let timer = 0;
  let remaining = HOLD_MS;
  let shownAt = 0;
  let leaving = false;

  const clear = () => {
    queue.length = 0;
    window.clearTimeout(timer);
    current?.remove();
    current = null;
    busy = false;
    shownAt = 0;
    leaving = false;
    root.dataset.placement = 'pending';
  };
  const showNext = () => {
    const id = queue.shift();
    const medal = id ? MEDALS.find((entry) => entry.id === id) : null;
    if (!medal) { busy = queue.length > 0; if (busy) showNext(); return; }
    busy = true;
    remaining = HOLD_MS;
    shownAt = 0;
    leaving = false;
    root.dataset.placement = 'pending';
    const card = el('div', `cot-medal-toast${medal.tier === 'signature' ? ' signature' : ''}`, root);
    card.innerHTML = `${medalSVG(medal, 44)}<div><span class="ey">${t('service.toast.medal')}</span>` +
      `<strong>${t(`service.medal.${medal.id}.name`)}</strong><small>${t(`service.medal.${medal.id}.desc`)}</small></div>`;
    current = card;
    requestAnimationFrame(() => card.classList.add('show'));
  };
  // A short phone can have no free center lane while detected or reloading.
  // Preserve the award and its full visible lifetime until that lane is clear.
  root.addEventListener('cot-banner-placement', () => {
    if (!current || leaving) return;
    if (root.dataset.placement !== 'ready') {
      if (shownAt) remaining = Math.max(0, remaining - (performance.now() - shownAt));
      window.clearTimeout(timer);
      shownAt = 0;
      return;
    }
    shownAt = performance.now();
    timer = window.setTimeout(() => {
      leaving = true;
      current?.classList.add('leave');
      timer = window.setTimeout(() => {
        current?.remove();
        current = null;
        if (queue.length) timer = window.setTimeout(showNext, GAP_MS);
        else busy = false;
      }, 300);
    }, remaining);
  });

  bus.on('service:medal', (payload) => {
    const id = payload && typeof payload === 'object' ? (payload as { id?: RuntimeValue }).id : null;
    if (typeof id !== 'string' || queue.length >= QUEUE_MAX) return;
    queue.push(id);
    if (!busy) showNext();
  });
  bus.on('phase:change', (payload) => {
    if ((payload as { phase?: RuntimeValue } | undefined)?.phase !== 'battle') clear();
  });
  bus.on('battle:presented', clear);
}
