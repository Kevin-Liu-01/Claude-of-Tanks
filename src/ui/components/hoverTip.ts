/**
 * The kit's hover tip (owner, 2026-10-24: "have little tooltips that we can hover stuff that appears when we hover over
 * long enough"): one small label per document, delegated, so a surface adopts it without markup of its own.
 *
 * When: the pointer rests on a control for TIP_DWELL_MS (moving to the next control while one shows switches at once),
 * the keyboard moves focus to it, or a finger holds it for TIP_HOLD_MS. A tap never shows it, and the press that ends a hold
 * does not also press the control. It hides on leave, any press, Escape, scroll and resize.
 * Which controls: any with data-tip, and every icon-only control (a named button, link, tab or summary with no visible
 * text). data-tip-off on a control or a region opts it out; the rich tooltip's own targets (richTooltip.ts) are skipped.
 * What it says: data-tip's text, else the control's name (aria-label, aria-labelledby, an image's alt). A control that
 * still has a title keeps the browser's own tooltip, so the two never stack; the tip never edits the page (code may read
 * a title: the Garage's guides read their info from it).
 * Where: the rich tooltip's placement (responsiveLayout.ts placeFloat), clear of every edge, in the top layer. Copyright © 2026 Kevin B. Liu.
 */
import { placeFloat } from '../responsiveLayout.ts';

const TIP_DWELL_MS = 600;
const TIP_HOLD_MS = 500;
const WARM_MS = 400;
const HOLD_SLOP_PX = 8;
const HOLD_LINGER_MS = 1500;

const CONTROL = 'button, a[href], summary, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [data-tip]';

/** The rich tooltip's targets (richTooltip.ts names them on its host as data-rich-tip-targets): the hover tip leaves them to it. */
function richTarget(control: HTMLElement): boolean {
  for (let host = control.closest<HTMLElement>('[data-rich-tip-targets]'); host; host = host.parentElement?.closest<HTMLElement>('[data-rich-tip-targets]') ?? null) {
    const selector = host.dataset.richTipTargets;
    if (selector && control.closest(selector)) return true;
  }
  return false;
}

function nameOf(control: HTMLElement): string {
  const label = control.getAttribute('aria-label')?.trim();
  if (label) return label;
  const ids = control.getAttribute('aria-labelledby');
  if (ids) {
    const text = ids.split(/\s+/).map((id) => control.ownerDocument.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean).join(' ');
    if (text) return text;
  }
  return control.querySelector('img[alt]')?.getAttribute('alt')?.trim() ?? '';
}

/** The tip a control shows, or '' for none. */
function tipText(control: HTMLElement): string {
  if (control.closest('[data-tip-off]')) return '';
  if (richTarget(control)) return '';
  // a title raises the browser's own tooltip: that control keeps it, so the two never stack
  if (control.hasAttribute('title')) return '';
  const own = control.dataset.tip?.trim();
  if (own) return own;
  if (control.hasAttribute('data-tip')) return nameOf(control);
  return control.textContent?.trim() ? '' : nameOf(control);
}

let installed = false;

export function installHoverTips(doc: Document = document): void {
  if (installed || typeof doc.addEventListener !== 'function') return;
  installed = true;
  const win = doc.defaultView ?? window;
  const tip = doc.createElement('div');
  tip.className = 'cot-c-tip';
  tip.id = 'cot-c-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  const popover = typeof tip.showPopover === 'function';
  if (popover) tip.setAttribute('popover', 'manual');
  let anchor: HTMLElement | null = null;
  let described = false;
  let timer = 0;
  let lastHidden = 0;
  let hold: { control: HTMLElement; x: number; y: number; timer: number } | null = null;
  let swallowClickUntil = 0;

  const controlOf = (target: EventTarget | null): HTMLElement | null =>
    target instanceof Element ? target.closest<HTMLElement>(CONTROL) : null;

  function hide(): void {
    win.clearTimeout(timer);
    if (!anchor) return;
    if (described) {
      const ids = (anchor.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id && id !== tip.id);
      if (ids.length) anchor.setAttribute('aria-describedby', ids.join(' '));
      else anchor.removeAttribute('aria-describedby');
    }
    anchor = null;
    described = false;
    lastHidden = win.performance.now();
    tip.classList.remove('is-on');
    if (popover && tip.matches(':popover-open')) tip.hidePopover();
    tip.hidden = true;
  }

  function show(control: HTMLElement): void {
    win.clearTimeout(timer);
    if (anchor === control || !control.isConnected) return;
    // a control whose surface is open says nothing more: its menu or panel is in view, and a tip would stand over it (the
    // 261 report: the rival's tip over its open menu's search, shown again as the trigger redrew under a still pointer)
    if (control.getAttribute('aria-expanded') === 'true') { hide(); return; }
    const text = tipText(control);
    if (!text) { hide(); return; }
    hide();
    if (!tip.isConnected) doc.body.append(tip);
    anchor = control;
    tip.textContent = text;
    // the tip adds to a name only when it says more than the name
    if (text !== nameOf(control)) {
      control.setAttribute('aria-describedby', [control.getAttribute('aria-describedby'), tip.id].filter(Boolean).join(' '));
      described = true;
    }
    tip.hidden = false;
    if (popover) tip.showPopover();
    const viewport = { width: doc.documentElement.clientWidth, height: doc.documentElement.clientHeight };
    const { x, y } = placeFloat(control.getBoundingClientRect(), tip.getBoundingClientRect(), viewport, 8, 8);
    tip.style.left = `${Math.round(x)}px`;
    tip.style.top = `${Math.round(y)}px`;
    tip.classList.add('is-on');
  }

  function schedule(control: HTMLElement): void {
    win.clearTimeout(timer);
    // a tip just showed: the next control's shows without the dwell
    const warm = anchor !== null || win.performance.now() - lastHidden < WARM_MS;
    if (warm) { show(control); return; }
    timer = win.setTimeout(() => show(control), TIP_DWELL_MS);
  }

  doc.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch') return;
    const control = controlOf(event.target);
    if (!control) { if (anchor || timer) hide(); return; }
    if (control === anchor) return;
    if (!tipText(control) || control.getAttribute('aria-expanded') === 'true') { hide(); return; }
    schedule(control);
  });
  doc.addEventListener('pointerout', (event) => {
    if (event.pointerType === 'touch') return;
    const control = controlOf(event.target);
    if (!control || (event.relatedTarget instanceof Node && control.contains(event.relatedTarget))) return;
    if (control === anchor || timer) hide();
  });
  // focus moved by the keyboard shows the tip; a panel focusing its own control as it opens does not
  let navigatedAt = -Infinity;
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' || event.key.startsWith('Arrow')) navigatedAt = win.performance.now();
  }, true);
  doc.addEventListener('focusin', (event) => {
    const control = controlOf(event.target);
    if (control && win.performance.now() - navigatedAt < 1000 && control.matches(':focus-visible')) show(control);
  });
  doc.addEventListener('focusout', () => hide());

  // touch: a hold shows the tip, a tap never does, and the release that ends a hold does not press the control
  const cancelHold = (): void => { if (hold) { win.clearTimeout(hold.timer); hold = null; } };
  doc.addEventListener('pointerdown', (event) => {
    hide();
    cancelHold();
    if (event.pointerType !== 'touch') return;
    const control = controlOf(event.target);
    if (!control) return;
    hold = { control, x: event.clientX, y: event.clientY, timer: win.setTimeout(() => {
      if (!hold || !tipText(hold.control)) return;
      show(hold.control);
      swallowClickUntil = Number.POSITIVE_INFINITY;
    }, TIP_HOLD_MS) };
  }, true);
  doc.addEventListener('pointermove', (event) => {
    if (hold && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > HOLD_SLOP_PX) cancelHold();
  }, true);
  const release = (): void => {
    cancelHold();
    if (swallowClickUntil === Number.POSITIVE_INFINITY) {
      swallowClickUntil = win.performance.now() + 600;
      timer = win.setTimeout(hide, HOLD_LINGER_MS);
    }
  };
  doc.addEventListener('pointerup', release, true);
  doc.addEventListener('pointercancel', release, true);
  doc.addEventListener('click', (event) => {
    if (win.performance.now() > swallowClickUntil) return;
    swallowClickUntil = 0;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  doc.addEventListener('contextmenu', (event) => { if (anchor && swallowClickUntil) event.preventDefault(); }, true);

  doc.addEventListener('keydown', (event) => { if (event.key === 'Escape' && anchor && !event.defaultPrevented) hide(); }, true);
  doc.addEventListener('scroll', () => { if (anchor || timer) hide(); }, { capture: true, passive: true });
  win.addEventListener('resize', () => hide());
  win.addEventListener('blur', () => hide());
}
