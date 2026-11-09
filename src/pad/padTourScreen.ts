/**
 * The controls guide on the game screen (docs/PHONE-CONTROLLER.md "The controls guide"; owner 2026-11-03: "the tutorial
 * should open on game screen and the phone"). While a phone shows its guide, the game screen shows the same one, drawn
 * from the phone's own picture of itself (padProtocol.ts PadTourLayout): the panel's controls in outline, a ring on each
 * stop with its name in this screen's language, and the ghost strokes. It takes no input but Skip, which ends it on the
 * phone too; the phone's Skip or its ten seconds end it here. It stands in the top layer (a manual popover, as the kit's
 * hover tip does) so it shows over Settings, where a phone pairs, and over the couch lobby; it loads with the receiver.
 * It keeps no clock of its own (round 8 Y5 s6-04): the receiver closes it when the phone's guide ends (its on:false),
 * when the link leaves live, or when the time the phone's guide had left runs out; its bar counts that time down.
 */
import type { PadTourLayout, PadTourStop } from './padProtocol.ts';
import { t } from '../ui/i18n.ts';
import { ensureStyle } from '../ui/styleLayers.ts';
import { prefersReducedMotion } from '../ui/accessibilityPreferences.ts';

/** The phone drawn this wide at most (its frame scaled to fit), and never wider than this share of the window. */
const PHONE_MAX_PX = 720;
const PHONE_MAX_SHARE = 0.84;
const NAMES: Readonly<Record<PadTourStop, string>> = {
  tilt: 'pad.tour.tilt', throttle: 'pad.tour.throttle', stick: 'pad.tour.stick', aim: 'pad.tour.aim', fire: 'pad.tour.fire',
  scope: 'pad.scope', lock: 'pad.lock',
};

const CSS = `
.cot-pad-tour{position:fixed;inset:auto 0 max(var(--s7),6vh) 0;z-index:var(--z-toast);margin:0 auto;padding:0;border:0;background:none;
  overflow:visible;display:none;flex-direction:column;align-items:flex-end;gap:var(--s3);width:max-content;max-width:none;
  pointer-events:none;color:var(--ink-1);}
.cot-pad-tour.is-open{display:flex;}
.cot-pad-tour-phone{position:relative;box-sizing:content-box;padding:var(--s3);border-radius:28px;background:var(--surface-scene);
  box-shadow:var(--e3);outline:1px solid var(--line-3);}
.cot-pad-tour-screen{position:relative;overflow:hidden;border-radius:18px;background:var(--surface-plate);}
.cot-pad-tour-part,.cot-pad-tour-ring,.cot-pad-tour-name,.cot-pad-tour-ghost{position:absolute;left:0;top:0;box-sizing:border-box;}
.cot-pad-tour-part{border-radius:var(--r2);border:1px solid var(--line-2);}
.cot-pad-tour-part[data-kind='round'],.cot-pad-tour-part[data-kind='dial'],.cot-pad-tour-part[data-kind='fire']{border-radius:50%;}
.cot-pad-tour-part[data-kind='fire']{border:2px solid var(--danger);}
.cot-pad-tour-part[data-kind='sight']{background:var(--surface-scene);}
.cot-pad-tour-part[data-kind='chip']{border:0;}
.cot-pad-tour-ring{border-radius:var(--r2);outline:2px solid var(--accent-hi);}
.cot-pad-tour-ring[data-ring='round']{border-radius:50%;}
.cot-pad-tour-ring[data-ring='none']{outline:0;}
.cot-pad-tour-name{max-width:140px;padding:var(--s1) var(--s2);border-radius:var(--r2);background:var(--surface-menu);box-shadow:var(--e2);
  font-size:var(--fs-14);font-weight:var(--fw-semibold);line-height:1.2;text-align:center;text-wrap:balance;}
.cot-pad-tour-ghost{width:22px;height:22px;margin:-11px;border-radius:50%;background:var(--line-3);outline:2px solid var(--line-control);}
.cot-pad-tour-skip{position:relative;overflow:hidden;pointer-events:auto;}
.cot-pad-tour-clock{position:absolute;left:var(--s2);right:var(--s2);bottom:4px;height:2px;border-radius:1px;background:var(--accent);
  transform-origin:0 50%;}
`;

let host: HTMLElement | null = null;
let animations: Animation[] = [];
/** The showing's owner: a newer showing (another phone in a couch lobby) replaces it, and only its owner may hide it. */
let current: object | null = null;
let skipCurrent: (() => void) | null = null;

function hostElement(): HTMLElement {
  if (host) return host;
  ensureStyle('cot-pad-tour-style', CSS, 'surfaces');
  host = document.createElement('div');
  host.className = 'cot-pad-tour';
  if (typeof host.showPopover === 'function') host.setAttribute('popover', 'manual');
  document.body.append(host);
  return host;
}

function close(): void {
  for (const animation of animations.splice(0)) animation.cancel();
  current = null;
  skipCurrent = null;
  if (!host) return;
  if (host.matches(':popover-open')) host.hidePopover();
  host.classList.remove('is-open');
  host.textContent = '';
}

/** Show the phone's guide, its bar counting down `ms` (the time the phone's guide has left); `onSkip` tells that phone
 *  when Skip is pressed here. Returns its hide (a no-op once another showing replaced it). */
export function showPadTour(layout: PadTourLayout, onSkip: () => void, ms: number): () => void {
  close();
  const root = hostElement();
  const owner = {};
  current = owner;
  skipCurrent = onSkip;
  const scale = Math.min(1, Math.min(PHONE_MAX_PX, innerWidth * PHONE_MAX_SHARE) / layout.w);
  const px = (value: number): string => `${Math.round(value * scale)}px`;
  const box = (x: number, y: number, w: number, h: number, pad = 0): string =>
    `width:${px(w + pad * 2)};height:${px(h + pad * 2)};transform:translate(${px(x - pad)},${px(y - pad)})`;
  const parts = layout.parts.map(([kind, x, y, w, h]) => `<i class="cot-pad-tour-part" data-kind="${kind}" style="${box(x, y, w, h)}"></i>`).join('');
  const stops = layout.stops.map(([id, x, y, w, h, , , ring, stroke]) => {
    const ghost = stroke ? `<i class="cot-pad-tour-ghost" data-move="${stroke === 1 ? 'x' : 'y'}" style="left:50%;top:50%"></i>` : '';
    return `<i class="cot-pad-tour-ring" data-ring="${ring === 1 ? 'round' : ring === 2 ? 'none' : 'square'}" style="${box(x, y, w, h, 4)}">${ghost}</i>`;
  }).join('');
  root.innerHTML = `<div class="cot-pad-tour-phone" aria-hidden="true"><div class="cot-pad-tour-screen" style="width:${px(layout.w)};height:${px(layout.h)}">`
    + `${parts}${stops}</div></div>`
    + `<button class="cot-c-btn cot-c-btn--secondary cot-c-btn--36 cot-pad-tour-skip" type="button" data-ui-sound="press">`
    + `<span class="cot-c-btn__label"></span><i class="cot-pad-tour-clock" aria-hidden="true"></i></button>`;
  (root.querySelector('.cot-c-btn__label') as HTMLElement).textContent = t('pad.tour.skip');
  // each name in this screen's language, centred where the phone put its own
  const screen = root.querySelector('.cot-pad-tour-screen') as HTMLElement;
  const names = layout.stops.map(([id, , , , , cx, cy]) => {
    const name = screen.appendChild(document.createElement('span'));
    name.className = 'cot-pad-tour-name';
    name.textContent = t(NAMES[id]);
    return { name, cx: cx * scale, cy: cy * scale };
  });
  root.querySelector('.cot-pad-tour-skip')!.addEventListener('click', () => {
    const skip = skipCurrent;
    close();
    skip?.();
  });
  root.classList.add('is-open');
  if (root.hasAttribute('popover')) root.showPopover();
  // a name stays inside the screen: these words may run wider than the phone's own
  const inside = (at: number, size: number, room: number): number => Math.round(Math.max(4, Math.min(room - size - 4, at - size / 2)));
  const roomW = Math.round(layout.w * scale);
  const roomH = Math.round(layout.h * scale);
  for (const { name, cx, cy } of names) {
    name.style.transform = `translate(${inside(cx, name.offsetWidth, roomW)}px,${inside(cy, name.offsetHeight, roomH)}px)`;
  }
  if (!prefersReducedMotion()) {
    animations.push((root.querySelector('.cot-pad-tour-clock') as HTMLElement)
      .animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: ms, easing: 'linear', fill: 'forwards' }));
    const reach = Math.round(36 * scale);
    // the phone's own stroke: two of the stage motion token
    const stroke = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-stage')) || 700) * 2;
    for (const ghost of root.querySelectorAll<HTMLElement>('.cot-pad-tour-ghost')) {
      const along = (at: number): string => ghost.dataset.move === 'y' ? `translateY(${-at}px)` : `translateX(${at}px)`;
      animations.push(ghost.animate([{ transform: along(-reach), opacity: 0 }, { transform: along(-reach * 0.8), opacity: 1, offset: 0.15 },
        { transform: along(reach), opacity: 1, offset: 0.8 }, { transform: along(reach * 1.1), opacity: 0 }],
      { duration: stroke, easing: 'ease-in-out', iterations: Infinity }));
    }
  }
  return () => { if (current === owner) close(); };
}
