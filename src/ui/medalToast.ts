import type { RuntimeValue } from '../runtimeTypes.ts';
import { MEDALS } from '../game/serviceRecord.ts';
import { createElement as el, ensureStyle } from './dom.ts';
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
.cot-medal-toast{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:12px;
  box-sizing:border-box;min-width:min(250px,calc(100vw - 32px));max-width:min(380px,calc(100vw - 32px));padding:10px 26px;color:#e8f0f5;
  --medal-fill:linear-gradient(100deg,rgba(9,13,17,.97),rgba(9,13,17,.94));--medal-edge:#71818c;
  position:relative;isolation:isolate;background:var(--medal-edge);border:0;
  clip-path:polygon(14px 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,14px 100%,0 50%);
  box-shadow:0 10px 28px rgba(0,0,0,.5);opacity:0;transition:opacity .22s ease-out;}
.cot-medal-toast::before{content:'';position:absolute;inset:1px;z-index:-1;background:var(--medal-fill);clip-path:inherit;}
.cot-medal-toast.show{opacity:1;}
.cot-medal-toast.leave{opacity:0;transition:opacity .28s ease-in;}
.cot-medal-toast.signature{--medal-edge:#c8984c;
  --medal-fill:radial-gradient(120% 140% at 0 50%,rgba(240,160,48,.24),rgba(9,13,17,.94) 62%);
  box-shadow:0 10px 30px rgba(0,0,0,.5),0 0 24px rgba(240,160,48,.25);}
.cot-medal-toast .cot-medal-art{display:block;filter:drop-shadow(0 4px 6px rgba(0,0,0,.6));}
.cot-medal-toast .ey{display:block;font:800 8px ${FONT_COND};letter-spacing:.24em;text-transform:uppercase;color:#f0b04a;}
.cot-medal-toast strong{display:block;margin-top:3px;font:800 17px ${FONT_COND};letter-spacing:.04em;color:#fff4dc;
  text-transform:uppercase;line-height:1.05;}
.cot-medal-toast small{display:block;margin-top:4px;font-size:11px;line-height:1.3;color:#9eadb9;}
@media (max-width:640px){
  .cot-medal-toast{min-width:0;gap:9px;padding:8px 24px;}
  .cot-medal-toast strong{font-size:14px;}
  .cot-medal-toast small{display:none;}
}
@media (max-height:450px) and (orientation:landscape){
  .cot-medal-toast{min-width:0;max-width:min(320px,calc(100vw - 300px));gap:8px;padding:4px 20px;}
  .cot-medal-toast .cot-medal-art{width:24px;height:auto;}
  .cot-medal-toast strong{font-size:12px;overflow-wrap:anywhere;}
  .cot-medal-toast small{display:none;}
}
@media (prefers-reduced-motion:reduce){
  .cot-medal-toast,.cot-medal-toast.leave{transition:opacity .2s linear;transform:none;}
}`;

interface ToastBus {
  on(event: string, listener: (payload?: RuntimeValue) => void): RuntimeValue;
}

/** Show medals as they are earned in battle. */
export function installMedalToasts(bus: ToastBus, parent: HTMLElement = document.body): void {
  ensureStyle('cot-medal-toast-style', CSS);
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
