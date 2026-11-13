/**
 * tutorialOverlay.ts — the first-game tutorial's one overlay: a glowing square round the lit control with the rest of
 * the screen dimmed, and a card in the middle of the screen (272). Copyright © 2026 Kevin B. Liu.
 *
 * It draws what tutorialRunner.ts hands it and knows nothing of steps. It stands in the top layer (a manual popover, as
 * the pad's guide and the kit's hover tip do), so it shows over the Garage's sheets and the battle HUD; it is off the
 * surface stack on purpose (transientSurfaceRegistry.selftest.mjs OFF_STACK_EXEMPT): it must never close or replace
 * the surface whose control it lights, and a press on that control must reach it.
 *
 * The square follows its control: a resize, any scroll, the control's own resize, and a slow re-check (the HUD and the
 * Garage re-render their controls) re-measure it, and it writes only when the box moved. A control that is not on
 * screen leaves the card alone in the middle. The card stands in the middle, or above or below the control when the
 * middle would cover it, or in the upper band when the step asks (battle steps keep the sight clear).
 */
import { prefersReducedMotion } from '../accessibilityPreferences.ts';

export interface OverlayButtonCaps {
  readonly next: string;
  readonly back: string;
  readonly skip: string;
}

export interface OverlayView {
  readonly chapter: string;
  readonly progress: string;
  /** 0..1, the share of the chapter done once this step is. */
  readonly fraction: number;
  readonly title: string;
  /** Escaped text with key caps (<kbd>) already in it. */
  readonly bodyHtml: string;
  readonly media: { readonly src: string; readonly kind: 'image' | 'video'; readonly poster?: string; readonly alt: string } | null;
  /** The lit control's resolver, asked again on every re-measure; null for the card alone. */
  readonly target: (() => Element | null) | null;
  readonly dim: boolean;
  readonly place: 'middle' | 'upper';
  readonly nextLabel: string;
  readonly backLabel: string;
  readonly skipLabel: string;
  readonly canBack: boolean;
  /** A step that waits for a press on its lit control shows no Next: the control is the way on. */
  readonly canNext: boolean;
  /** The step moves on when the player does the thing: Next stays, quietly, and the hint names the deed. */
  readonly actionHint: string | null;
  readonly caps: OverlayButtonCaps;
  /** Move focus to Next (the Garage); a battle keeps its keys and never takes focus. */
  readonly focus: boolean;
  readonly label: string;
}

export interface TutorialOverlay {
  readonly root: HTMLElement;
  show(view: OverlayView): void;
  /** Hide while the battle is paused; show(…) or setHidden(false) brings it back. */
  setHidden(hidden: boolean): void;
  /** The lit control as last measured (receipts), or null. */
  litRect(): DOMRect | null;
  destroy(): void;
}

export interface OverlayHandlers {
  next(): void;
  back(): void;
  skip(): void;
}

const PAD = 6; // px of glow room round the control
const RECHECK_MS = 400;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: Element): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent?.append(node);
  return node;
}

function button(className: string, parent: Element, onPress: () => void): { button: HTMLButtonElement; label: HTMLSpanElement; cap: HTMLSpanElement } {
  const node = el('button', `cot-c-btn cot-c-btn--36 ${className}`, parent);
  node.type = 'button';
  node.dataset.uiSound = 'press';
  const label = el('span', 'cot-c-btn__label', node);
  const cap = el('span', 'cot-tut-cap', node);
  cap.setAttribute('aria-hidden', 'true');
  node.addEventListener('click', (event) => { event.stopPropagation(); onPress(); });
  return { button: node, label, cap };
}

function visibleRect(element: Element | null): DOMRect | null {
  if (!element || !element.isConnected) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  if (rect.right < 0 || rect.bottom < 0 || rect.left > window.innerWidth || rect.top > window.innerHeight) return null;
  // a layer over the whole screen (the sight's text layer, a HUD root) is no control to light
  if (rect.width * rect.height > window.innerWidth * window.innerHeight * 0.5) return null;
  const style = getComputedStyle(element);
  if (style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
  return rect;
}

export function createTutorialOverlay(handlers: OverlayHandlers): TutorialOverlay {
  const root = el('div', 'cot-tut');
  if (typeof root.showPopover === 'function') root.setAttribute('popover', 'manual');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'false');
  el('div', 'cot-tut-scrim', root);
  const spot = el('div', 'cot-tut-spot', root);
  const pulse = el('span', 'cot-tut-pulse', spot);
  const card = el('section', 'cot-tut-card', root);
  card.setAttribute('aria-live', 'polite');
  const head = el('div', 'cot-tut-head', card);
  const chapter = el('span', 'cot-tut-chapter', head);
  const progress = el('span', 'cot-tut-progress', head);
  const bar = el('div', 'cot-tut-bar', card);
  const barFill = el('i', '', bar);
  const media = el('figure', 'cot-tut-media', card);
  media.hidden = true;
  const title = el('h2', 'cot-tut-title', card);
  title.id = 'cot-tut-title';
  root.setAttribute('aria-labelledby', title.id);
  const body = el('p', 'cot-tut-body', card);
  const hint = el('p', 'cot-tut-hint', card);
  const foot = el('div', 'cot-tut-foot', card);
  const skipButton = button('cot-c-btn--quiet cot-tut-skip', foot, () => handlers.skip());
  const backButton = button('cot-c-btn--secondary cot-tut-back', foot, () => handlers.back());
  const nextButton = button('cot-c-btn--primary cot-tut-next', foot, () => handlers.next());
  document.body.append(root);

  let view: OverlayView | null = null;
  let hidden = false;
  let lastRect: DOMRect | null = null;
  let lastKey = '';
  let observed: Element | null = null;
  let mediaSrc = '';
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => measure()) : null;

  function place(rect: DOMRect | null): void {
    let where: 'middle' | 'upper' | 'lower' = view?.place ?? 'middle';
    if (where === 'middle' && rect) {
      // the middle card's box, without reading the card's own placement back (it hugs its content's height only)
      const h = card.offsetHeight, w = card.offsetWidth;
      const top = (window.innerHeight - h) / 2, left = (window.innerWidth - w) / 2;
      const overlaps = rect.left < left + w + PAD && rect.right > left - PAD && rect.top < top + h + PAD && rect.bottom > top - PAD;
      if (overlaps) where = rect.top + rect.height / 2 > window.innerHeight / 2 ? 'upper' : 'lower';
    }
    if (card.dataset.place !== where) card.dataset.place = where;
  }

  function measure(): void {
    if (!view) return;
    const element = view.target?.() ?? null;
    if (element !== observed) {
      if (observed) resizeObserver?.unobserve(observed);
      observed = element;
      if (element) resizeObserver?.observe(element);
    }
    const rect = visibleRect(element);
    const key = rect ? `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)}` : '';
    const dim = !view.dim ? 'clear' : rect ? 'spot' : 'full';
    if (root.dataset.dim !== dim) root.dataset.dim = dim;
    if (key === lastKey) return;
    lastKey = key;
    lastRect = rect;
    root.classList.toggle('has-spot', !!rect);
    if (rect) {
      spot.style.width = `${Math.round(rect.width + PAD * 2)}px`;
      spot.style.height = `${Math.round(rect.height + PAD * 2)}px`;
      spot.style.transform = `translate(${Math.round(rect.left - PAD)}px,${Math.round(rect.top - PAD)}px)`;
    }
    place(rect);
  }

  const onScroll = (): void => measure();
  window.addEventListener('resize', onScroll);
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  const recheck = window.setInterval(() => { if (view && !hidden) measure(); }, RECHECK_MS);

  function setMedia(next: OverlayView['media']): void {
    const src = next ? `${next.kind}:${next.src}` : '';
    if (src === mediaSrc) return;
    mediaSrc = src;
    media.textContent = '';
    media.hidden = !next;
    if (!next) return;
    // a still under reduced motion, or where the browser cannot play the loop (VP9 WebM; an older Safari)
    const playable = next.kind === 'video' && document.createElement('video').canPlayType('video/webm; codecs="vp9"') !== '';
    const still = next.kind === 'image' || prefersReducedMotion() || !playable;
    if (still) {
      const img = el('img', '', media);
      img.decoding = 'async';
      img.alt = next.alt;
      img.src = next.kind === 'image' ? next.src : next.poster ?? next.src;
    } else {
      const video = el('video', '', media);
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.autoplay = true;
      video.preload = 'auto';
      video.setAttribute('aria-label', next.alt);
      if (next.poster) video.poster = next.poster;
      // a loop that fails to load leaves its poster
      video.addEventListener('error', () => { if (next.poster && video.isConnected) video.replaceWith(Object.assign(document.createElement('img'), { src: next.poster, alt: next.alt })); }, { once: true });
      video.src = next.src;
      void video.play().catch(() => { /* a refused autoplay shows the poster */ });
    }
  }

  function setButton(part: ReturnType<typeof button>, label: string, cap: string): void {
    if (part.label.textContent !== label) part.label.textContent = label;
    if (part.cap.textContent !== cap) part.cap.textContent = cap;
  }

  function pulseOnce(): void {
    if (prefersReducedMotion()) return;
    pulse.classList.remove('is-pulsing');
    void pulse.offsetWidth; // restart the one pulse for the newly lit control
    pulse.classList.add('is-pulsing');
  }

  return {
    root,
    show(next: OverlayView): void {
      const previousTarget = view?.target ?? null;
      view = next;
      root.setAttribute('aria-label', next.label);
      chapter.textContent = next.chapter;
      progress.textContent = next.progress;
      barFill.style.transform = `scaleX(${Math.max(0, Math.min(1, next.fraction)).toFixed(3)})`;
      title.textContent = next.title;
      body.innerHTML = next.bodyHtml;
      hint.textContent = next.actionHint ?? '';
      hint.hidden = !next.actionHint;
      setMedia(next.media);
      setButton(nextButton, next.nextLabel, next.caps.next);
      setButton(backButton, next.backLabel, next.caps.back);
      setButton(skipButton, next.skipLabel, next.caps.skip);
      backButton.button.hidden = !next.canBack;
      nextButton.button.hidden = !next.canNext;
      nextButton.button.classList.toggle('cot-c-btn--primary', !next.actionHint);
      nextButton.button.classList.toggle('cot-c-btn--secondary', !!next.actionHint);
      lastKey = '#'; // re-measure and re-place for the new step
      if (!root.classList.contains('is-open')) root.classList.add('is-open');
      if (!hidden && root.hasAttribute('popover') && !root.matches(':popover-open')) root.showPopover();
      measure();
      if (next.target && next.target !== previousTarget && lastRect) pulseOnce();
      // (a press step takes no focus: its Enter belongs to the lit control, the Garage's Deploy)
      if (next.focus && next.canNext) nextButton.button.focus({ preventScroll: true });
      else if (root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    },
    setHidden(value: boolean): void {
      if (hidden === value) return;
      hidden = value;
      root.classList.toggle('is-open', !value && !!view);
      if (!root.hasAttribute('popover')) return;
      if (value && root.matches(':popover-open')) root.hidePopover();
      else if (!value && view && !root.matches(':popover-open')) { root.showPopover(); measure(); }
    },
    litRect: () => lastRect,
    destroy(): void {
      view = null;
      window.clearInterval(recheck);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, { capture: true });
      resizeObserver?.disconnect();
      for (const video of media.querySelectorAll('video')) { video.pause(); video.removeAttribute('src'); video.load(); }
      if (root.hasAttribute('popover') && root.matches(':popover-open')) root.hidePopover();
      root.remove();
    },
  };
}
