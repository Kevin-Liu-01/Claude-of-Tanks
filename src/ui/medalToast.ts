import type { RuntimeValue } from '../runtimeTypes.ts';
import { MEDALS } from '../game/serviceRecord.ts';
import { createElement as el, markDatum } from './dom.ts';
import { ensureStyle } from './styleLayers.ts';
import { FONT_COND, FONT_STACK } from './fonts.ts';
import { t } from './i18n.ts';
import { medalSVG } from './medalArt.ts';
import type { NoticeQueue } from './components/notice.ts';
// The moment a medal is earned mid-battle (serviceRecord.ts emits
// `service:medal`), a card drops in under the score strip, one at a time.
// Medals judged when the battle ends appear in the debrief instead.

const HOLD_MS = 3400;
const GAP_MS = 380;
/** A card's leave (.cot-medal-toast.leave: --dur-base). */
const LEAVE_MS = 300;
const QUEUE_MAX = 4;

const CSS = `
.cot-medal-toasts{position:fixed;left:50%;top:var(--hud-banner-top,calc(var(--hud-objective-bottom,104px) + 16px));z-index:41;
  transform:translateX(-50%);max-width:calc(100vw - 32px);pointer-events:none;font-family:${FONT_STACK};}
.cot-medal-toasts:not([data-placement='ready']){visibility:hidden;}
body.cot-battle-ui-hidden .cot-medal-toasts,body.cot-si-report .cot-medal-toasts{display:none;}
.cot-medal-toast{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:var(--s3);
  box-sizing:border-box;min-width:min(250px,calc(100vw - 32px));max-width:min(380px,calc(100vw - 32px));padding:10px 26px;color:var(--ink-1);
  --medal-fill:linear-gradient(100deg,var(--hud-plate-strong),var(--hud-plate-strong));--medal-edge:oklch(from var(--ink-3) .59 c h);
  position:relative;isolation:isolate;background:var(--medal-edge);border:0;
  clip-path:polygon(14px 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,14px 100%,0 50%);
  box-shadow:0 10px 28px oklch(from var(--surface-scene) l c h / .5);opacity:0;transition:opacity var(--dur-base) ease-out;}
.cot-medal-toast::before{content:'';position:absolute;inset:1px;z-index:-1;background:var(--medal-fill);clip-path:inherit;}
.cot-medal-toast.show{opacity:1;}
.cot-medal-toast.leave{opacity:0;transition:opacity var(--dur-base) ease-in;}
.cot-medal-toast.signature{--medal-edge:var(--accent-lo);
  --medal-fill:radial-gradient(120% 140% at 0 50%,oklch(from var(--accent) l c h / .24),var(--hud-plate-strong) 62%);
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

/**
 * Show medals as they are earned in battle, a card at a time in its own seat off the reticle (battleHudLayout places it),
 * on the kit's notice queue (components/notice.ts, as the alert band: UI-LOCKDOWN B14): a card's time runs only while its
 * seat is ready (a short phone can have no free centre lane while detected or reloading, so the award keeps its whole
 * visible lifetime until that lane is clear) and stops while the game pauses; the next waits out the last one's leave.
 * The queue loads with the first medal, off the game page's boot requests.
 */
export function installMedalToasts(bus: ToastBus, parent: HTMLElement = document.body): void {
  ensureStyle('cot-medal-toast-style', CSS, 'surfaces');
  // (one place for the battle's medals, however many cards are in flight: surfaceRegistry.ts medals)
  const root = markDatum(el('div', 'cot-medal-toasts', parent), 'medals');
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  const cards = new Map<string, HTMLElement>();
  let queue: NoticeQueue | null = null;
  let loading: Promise<NoticeQueue> | null = null;
  let serial = 0;
  let timer = 0;
  let enterTimer = 0;
  /** When the last card's leave and the gap after it end: the next card enters then. */
  let clearAt = 0;
  let paused = false;

  // the queue's clock: the shown card's time out, then the next in line
  const schedule = (): void => {
    window.clearTimeout(timer);
    const next = queue?.nextDeadline() ?? null;
    if (next === null) return;
    timer = window.setTimeout(() => {
      for (const id of queue?.expired() ?? []) queue?.remove(id);
      schedule();
    }, Math.ceil(next));
  };
  const enter = (id: string, medal: (typeof MEDALS)[number]): void => {
    if (!cards.has(id) || !queue) return;
    root.dataset.placement = 'pending';
    const card = cards.get(id)!;
    card.className = `cot-medal-toast${medal.tier === 'signature' ? ' signature' : ''}`;
    card.innerHTML = `${medalSVG(medal, 44)}<div><span class="ey">${t('service.toast.medal')}</span>` +
      `<strong>${t(`service.medal.${medal.id}.name`)}</strong><small>${t(`service.medal.${medal.id}.desc`)}</small></div>`;
    root.append(card);
    requestAnimationFrame(() => card.classList.add('show'));
  };
  const load = (): Promise<NoticeQueue> => {
    loading ??= import('./components/notice.ts').then(({ NoticeQueue: Queue }) => {
      queue = new Queue(1, () => performance.now(), {
        show(toast) {
          const medal = MEDALS.find((entry) => entry.id === toast.options.text);
          if (!medal) { window.setTimeout(() => queue?.remove(toast.id), 0); return; }
          // (held until its seat is ready, entering once the last card has left and its gap has passed)
          queue!.hold(toast.id, true);
          cards.set(toast.id, document.createElement('div'));
          window.clearTimeout(enterTimer);
          enterTimer = window.setTimeout(() => enter(toast.id, medal), Math.max(0, clearAt - performance.now()));
        },
        update() {},
        hide(toast) {
          const card = cards.get(toast.id);
          cards.delete(toast.id);
          clearAt = performance.now() + (card?.isConnected ? LEAVE_MS + GAP_MS : 0);
          if (!card?.isConnected) return;
          card.classList.add('leave');
          window.setTimeout(() => card.remove(), LEAVE_MS);
        },
      });
      queue.pause(paused);
      return queue;
    });
    return loading;
  };
  const clear = (): void => {
    window.clearTimeout(timer);
    window.clearTimeout(enterTimer);
    if (queue) for (const toast of [...queue.waiting, ...queue.shown]) queue.remove(toast.id);
    for (const card of cards.values()) card.remove();
    cards.clear();
    root.replaceChildren();
    clearAt = 0;
    root.dataset.placement = 'pending';
  };
  // (the planner's word on the card's seat: its time runs while the seat is ready, and waits while it is not)
  root.addEventListener('cot-banner-placement', () => {
    const shown = queue?.shown[0];
    if (!shown || !cards.get(shown.id)?.isConnected) return;
    queue!.hold(shown.id, root.dataset.placement !== 'ready');
    schedule();
  });

  bus.on('service:medal', (payload) => {
    const id = payload && typeof payload === 'object' ? (payload as { id?: RuntimeValue }).id : null;
    if (typeof id !== 'string') return;
    void load().then((ready) => {
      if (ready.waiting.length >= QUEUE_MAX) return;
      ready.push(`medal-${++serial}`, { text: id, durationMs: HOLD_MS, dismissible: false });
      schedule();
    }, () => {});
  });
  bus.on('ui:pause', (payload) => {
    paused = !!(payload as { on?: RuntimeValue } | undefined)?.on;
    queue?.pause(paused);
    schedule();
  });
  bus.on('phase:change', (payload) => {
    if ((payload as { phase?: RuntimeValue } | undefined)?.phase !== 'battle') clear();
  });
  bus.on('battle:presented', clear);
}
