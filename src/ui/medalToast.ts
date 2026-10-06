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
.cot-medal-toasts{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 104px);z-index:41;
  transform:translateX(-50%);pointer-events:none;font-family:${FONT_STACK};}
body.cot-battle-ui-hidden .cot-medal-toasts,body.cot-si-report .cot-medal-toasts{display:none;}
.cot-medal-toast{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:12px;
  min-width:250px;max-width:min(380px,calc(100vw - 32px));padding:8px 18px 8px 10px;color:#e8f0f5;
  background:linear-gradient(100deg,rgba(9,13,17,.95),rgba(9,13,17,.86));border:1px solid rgba(176,194,208,.3);
  box-shadow:0 10px 28px rgba(0,0,0,.5);opacity:0;transform:translateY(-12px) scale(.97);
  transition:opacity .22s ease-out,transform .32s cubic-bezier(.2,.9,.25,1.2);}
.cot-medal-toast.show{opacity:1;transform:none;}
.cot-medal-toast.leave{opacity:0;transform:translateY(-8px);transition:opacity .28s ease-in,transform .28s ease-in;}
.cot-medal-toast.signature{border-color:rgba(240,160,48,.7);
  background:radial-gradient(120% 140% at 0 50%,rgba(240,160,48,.24),rgba(9,13,17,.94) 62%);
  box-shadow:0 10px 30px rgba(0,0,0,.5),0 0 24px rgba(240,160,48,.25);}
.cot-medal-toast .cot-medal-art{display:block;filter:drop-shadow(0 4px 6px rgba(0,0,0,.6));}
.cot-medal-toast .ey{display:block;font:800 8px ${FONT_COND};letter-spacing:.24em;text-transform:uppercase;color:#f0b04a;}
.cot-medal-toast strong{display:block;margin-top:3px;font:800 17px ${FONT_COND};letter-spacing:.04em;color:#fff4dc;
  text-transform:uppercase;line-height:1.05;}
.cot-medal-toast small{display:block;margin-top:4px;font-size:11px;line-height:1.3;color:#9eadb9;}
@media (max-width:640px){
  .cot-medal-toasts{top:calc(env(safe-area-inset-top,0px) + 86px);}
  .cot-medal-toast{min-width:0;gap:9px;padding:6px 12px 6px 8px;}
  .cot-medal-toast strong{font-size:14px;}
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

  const clear = () => {
    queue.length = 0;
    window.clearTimeout(timer);
    current?.remove();
    current = null;
    busy = false;
  };
  const showNext = () => {
    const id = queue.shift();
    const medal = id ? MEDALS.find((entry) => entry.id === id) : null;
    if (!medal) { busy = queue.length > 0; if (busy) showNext(); return; }
    busy = true;
    const card = el('div', `cot-medal-toast${medal.tier === 'signature' ? ' signature' : ''}`, root);
    card.innerHTML = `${medalSVG(medal, 44)}<div><span class="ey">${t('service.toast.medal')}</span>` +
      `<strong>${t(`service.medal.${medal.id}.name`)}</strong><small>${t(`service.medal.${medal.id}.desc`)}</small></div>`;
    current = card;
    requestAnimationFrame(() => card.classList.add('show'));
    timer = window.setTimeout(() => {
      card.classList.add('leave');
      timer = window.setTimeout(() => {
        card.remove();
        current = null;
        if (queue.length) timer = window.setTimeout(showNext, GAP_MS);
        else busy = false;
      }, 300);
    }, HOLD_MS);
  };

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
