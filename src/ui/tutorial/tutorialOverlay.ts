/**
 * tutorialOverlay.ts — the first-game tutorial's one overlay: a glowing square round the lit control with the rest of
 * the screen dimmed, and a card in the middle of the screen (272). Copyright © 2026 Kevin B. Liu.
 *
 * It draws what tutorialRunner.ts hands it and knows nothing of steps. It stands in the top layer (a manual popover, as
 * the pad's guide and the kit's hover tip do), so it shows over the Garage's sheets and the battle HUD; it is off the
 * surface stack on purpose (transientSurfaceRegistry.selftest.mjs OFF_STACK_EXEMPT): it must never close or replace
 * the surface whose control it lights, and a press on that control must reach it.
 *
 * The dim is inert (272, the owner on the preview: a click on the dimmed Garage launched Test Drive). Four transparent
 * blockers tile the screen round the lit control's hole (one covers it all when nothing is lit) and swallow every press,
 * wheel and touch, so only the lit control and the card take the pointer; a battle step the player acts on (dim off)
 * puts none down. The runner guards the keyboard the same way (tutorialRunner.ts).
 *
 * The square follows its control: a resize, any scroll, the control's own resize, and a slow re-check (the HUD and the
 * Garage re-render their controls) re-measure it, and it writes only when the box moved. A control that is not on
 * screen leaves the card alone in the middle. The card stands in the middle, or above or below the control when the
 * middle would cover it, or in the upper band when the step asks (battle steps keep the sight clear).
 *
 * The card fits (274, Kevin: "the tutorial boxes have overflows and you need to scroll? no no none of that"): it never
 * scrolls and never clips. One pass (fit) measures its words against the box it may fill (its max-height: the screen
 * less the margins, or the battle plan's box) and, while they outgrow it, takes the next step of one ladder: the picture's
 * height shrinks (it keeps its proportions, narrower), a type step smaller, a tighter one, and last the picture goes; on a
 * short landscape screen a card with a picture lays out in a row. The card's natural height (the full type, no fit) is
 * written to data-natural-h for the battle plan (battleHudLayout.ts), which sizes its box from it.
 *
 * Motion (274, Kevin: "after successful completion step we have to show that with an animation, green checkmark coming
 * in"): one vocabulary on the shared --dur-* and --ease-* tokens (tutorial.css), transform and opacity only, every
 * duration 1 ms under reduced motion (tokens.css). The card rises in and fades out; a step's words cross-fade into the
 * next's; a step the player completed plays a success beat (a green check coming in over the card, the step confirmed)
 * before the next step's words show, while the next step is already listening (the runner arms it at once: the beat
 * never delays the game); a chapter's end plays a larger one as the card leaves. The card's fit holds through all of it.
 */
import { prefersReducedMotion } from '../accessibilityPreferences.ts';

export interface OverlayButtonCaps {
  readonly next: string;
  readonly back: string;
  readonly skip: string;
}

export interface OverlayView {
  /** The step showing (the card's words cross-fade when it changes). */
  readonly step: string;
  /** 'act': a battle step the player does (a compact card out of the action: no header, no hint, no Back); 'read': a card
   *  that explains (full, and in a battle it holds the battle). Kevin, 2026-11-20: "the boxes are quite intrusive". */
  readonly mode?: 'act' | 'read';
  readonly chapter: string;
  /** "2 of 5"; empty for a chapter of one card (the offer), which shows no progress. */
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
  /** The word a success beat confirms the step before this one with ("Done"). */
  readonly beatWord: string;
  readonly caps: OverlayButtonCaps;
  /** Move focus to Next (the Garage); a battle keeps its keys and never takes focus. */
  readonly focus: boolean;
  readonly label: string;
}

export interface TutorialOverlay {
  readonly root: HTMLElement;
  /** Show a step. `beat`: the step before it was completed by the player: its success beat plays, then these words. */
  show(view: OverlayView, options?: { readonly beat?: boolean }): void;
  /** Hide while the battle is paused; show(…) or setHidden(false) brings it back. */
  setHidden(hidden: boolean): void;
  /** The lit control as last measured (receipts), or null. */
  litRect(): DOMRect | null;
  /** Take the overlay down. Its blockers go at once (nothing waits on it); the card leaves with its exit, or with the
   *  chapter's completion (`complete`: the words it confirms) first. */
  destroy(options?: { readonly complete?: string }): void;
}

export interface OverlayHandlers {
  next(): void;
  back(): void;
  skip(): void;
}

const PAD = 6; // px of glow room round the control
/** What the dim swallows: every press, release, click, wheel and touch on it. */
const BLOCKED_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu', 'wheel',
  'touchstart', 'touchmove', 'touchend'] as const;
const RECHECK_MS = 400;
/** The least height (px) the picture shrinks to before the type steps down. */
const MEDIA_MIN_PX = 96;
/** The fit ladder (tutorial.css data-fit): the full type, a step smaller, a tighter one, and the picture gone. */
const FIT_LEVELS = ['0', '1', '2', '3'] as const;
/** A token's duration (ms) as the page has it now (1 ms under reduced motion: tokens.css). */
function tokenMs(name: string): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = parseFloat(raw);
  return Number.isFinite(value) ? (raw.endsWith('ms') ? value : value * 1000) : 0;
}
/** How long a beat's check stays up when motion is cut (reduced motion keeps it visible, without moving). */
const STILL_BEAT_MS = 320;

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
  // the blockers: above, below, left of and right of the hole (above alone covers the screen when nothing is lit)
  const blockers = [0, 1, 2, 3].map(() => {
    const block = el('div', 'cot-tut-block', root);
    block.setAttribute('aria-hidden', 'true');
    for (const type of BLOCKED_EVENTS) {
      block.addEventListener(type, (event) => { event.stopPropagation(); if (event.cancelable) event.preventDefault(); }, { passive: false });
    }
    return block;
  });
  const card = el('section', 'cot-tut-card', root);
  card.setAttribute('aria-live', 'polite');
  const head = el('div', 'cot-tut-head', card);
  const chapter = el('span', 'cot-tut-chapter', head);
  const progress = el('span', 'cot-tut-progress', head);
  const bar = el('div', 'cot-tut-bar', card);
  const barFill = el('i', '', bar);
  // the step's words and picture: one block, so a step's change cross-fades them together
  const content = el('div', 'cot-tut-content', card);
  const media = el('figure', 'cot-tut-media', content);
  media.hidden = true;
  const words = el('div', 'cot-tut-words', content);
  const title = el('h2', 'cot-tut-title', words);
  title.id = 'cot-tut-title';
  root.setAttribute('aria-labelledby', title.id);
  const body = el('p', 'cot-tut-body', words);
  const hint = el('p', 'cot-tut-hint', words);
  // the success beat: over the card's words (it takes no room), a check drawn in and the step confirmed
  const beat = el('div', 'cot-tut-beat', card);
  beat.setAttribute('aria-hidden', 'true');
  beat.innerHTML = '<svg class="cot-tut-check" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21"/>'
    + '<path d="M14 25 l7 7 l13 -15"/></svg><span class="cot-tut-beat-word"></span>';
  const beatWord = beat.querySelector<HTMLElement>('.cot-tut-beat-word')!;
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
  /** What the last fit read (the box, the width, the words): a pass that finds them unchanged does nothing. */
  let fitKey = '';
  /** A beat playing: its timer, and the step that shows when it ends (the latest asked for wins). */
  let beatTimer = 0;
  let pendingView: OverlayView | null = null;
  let leaving = false;
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
    // the card's fit first (its height places it); its own key keeps an unchanged pass free
    fit();
    const element = view.target?.() ?? null;
    if (element !== observed) {
      if (observed) resizeObserver?.unobserve(observed);
      observed = element;
      if (element) resizeObserver?.observe(element);
    }
    const rect = visibleRect(element);
    const dim = !view.dim ? 'clear' : rect ? 'spot' : 'full';
    const key = `${window.innerWidth}x${window.innerHeight}|${dim}|${rect ? `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)}` : ''}`;
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
    tile(dim, rect);
    place(rect);
  }

  /** The box the card may fill (its max-height in px: the screen less its margins, or the battle plan's box). */
  function available(): number {
    const value = parseFloat(getComputedStyle(card).maxHeight);
    return Number.isFinite(value) && value > 0 ? value : window.innerHeight;
  }

  /** The card fits its box (see the module comment): the ladder's first step at which its words need no more room. */
  function fit(): void {
    if (!view || leaving) return;
    const key = `${window.innerWidth}x${window.innerHeight}|${card.style.cssText}|${getComputedStyle(card).maxHeight}|${view.step}|${body.innerHTML.length}|${title.textContent}`;
    if (key === fitKey && card.scrollHeight <= card.clientHeight + 1) return;
    const hasMedia = !media.hidden;
    // a short landscape screen lays a card with a picture out in a row (the picture beside the words)
    const row = hasMedia && window.innerWidth > window.innerHeight * 1.3 && window.innerHeight < 600;
    if ((card.dataset.layout === 'row') !== row) { if (row) card.dataset.layout = 'row'; else delete card.dataset.layout; }
    card.style.removeProperty('--tut-media-h');
    card.dataset.fit = '0';
    // the natural height (the full type, the picture whole) for the battle plan
    card.dataset.naturalH = String(card.scrollHeight);
    const box = available();
    const fits = (): boolean => card.scrollHeight <= box + 0.5;
    for (const level of FIT_LEVELS) {
      card.dataset.fit = level;
      if (level === '3' && !hasMedia) break;
      if (fits()) break;
      // the picture gives up height first, down to its least, keeping its proportions
      if (hasMedia && level !== '3' && !row) {
        const now = media.getBoundingClientRect().height;
        const over = card.scrollHeight - box;
        card.style.setProperty('--tut-media-h', `${Math.max(MEDIA_MIN_PX, Math.floor(now - over))}px`);
        if (fits()) break;
      }
    }
    fitKey = `${window.innerWidth}x${window.innerHeight}|${card.style.cssText}|${getComputedStyle(card).maxHeight}|${view.step}|${body.innerHTML.length}|${title.textContent}`;
  }

  /** The blockers round the hole (none while the field stays clear for a battle step the player acts on). */
  function tile(dim: string, rect: DOMRect | null): void {
    const W = window.innerWidth, H = window.innerHeight;
    const boxes: Array<[number, number, number, number] | null> = dim === 'clear' ? [null, null, null, null]
      : !rect ? [[0, 0, W, H], null, null, null]
        : (() => {
          const l = Math.max(0, Math.round(rect.left - PAD)), t = Math.max(0, Math.round(rect.top - PAD));
          const r = Math.min(W, Math.round(rect.right + PAD)), b = Math.min(H, Math.round(rect.bottom + PAD));
          return [[0, 0, W, t], [0, b, W, H - b], [0, t, l, b - t], [r, t, W - r, b - t]];
        })();
    boxes.forEach((box, i) => {
      const block = blockers[i]!;
      block.hidden = !box || box[2] <= 0 || box[3] <= 0;
      if (block.hidden || !box) return;
      block.style.transform = `translate(${box[0]}px,${box[1]}px)`;
      block.style.width = `${box[2]}px`;
      block.style.height = `${box[3]}px`;
    });
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

  /** The battle's layout plans a battle chapter's card with its own guidance (battleHudLayout.ts writeGuidance, 274): it
   *  re-plans when the card shows, changes step, hides or goes (a relayout outside a battle does nothing). */
  function askLayout(): void {
    window.dispatchEvent(new Event('cot-hud-relayout'));
  }

  function pulseOnce(): void {
    if (prefersReducedMotion()) return;
    pulse.classList.remove('is-pulsing');
    void pulse.offsetWidth; // restart the one pulse for the newly lit control
    pulse.classList.add('is-pulsing');
  }

  /** Restart one of the card's CSS animations (a class the stylesheet animates once). */
  function play(node: Element, className: string): void {
    node.classList.remove(className);
    void (node as HTMLElement).offsetWidth;
    node.classList.add(className);
  }

  function paint(next: OverlayView): void {
    const mode = next.mode ?? 'read';
    if (root.dataset.mode !== mode) root.dataset.mode = mode;
    const previous = view;
    const opening = !root.classList.contains('is-open');
    view = next;
    root.setAttribute('aria-label', next.label);
    chapter.textContent = next.chapter;
    progress.textContent = next.progress;
    progress.hidden = !next.progress;
    bar.hidden = !next.progress;
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
    fitKey = '';
    if (opening) { root.classList.add('is-open'); play(card, 'is-entering'); }
    else if (previous && previous.step !== next.step) play(content, 'is-swapping');
    if (!hidden && root.hasAttribute('popover') && !root.matches(':popover-open')) root.showPopover();
    measure();
    if (next.target && next.target !== (previous?.target ?? null) && lastRect) pulseOnce();
    // (a press step takes no focus: its Enter belongs to the lit control, the Garage's Deploy)
    if (next.focus && next.canNext) nextButton.button.focus({ preventScroll: true });
    else if (root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    askLayout();
  }

  /** The success beat over the card's words, then `next` (see the module comment). */
  function playBeat(next: OverlayView, word: string): void {
    pendingView = next;
    if (beatTimer) return; // a beat already playing shows the latest step when it ends
    beatWord.textContent = word;
    play(beat, 'is-on');
    const ms = prefersReducedMotion() ? STILL_BEAT_MS : tokenMs('--dur-screen') + tokenMs('--dur-fast');
    beatTimer = window.setTimeout(() => {
      beatTimer = 0;
      const shown = pendingView;
      pendingView = null;
      beat.classList.remove('is-on');
      if (shown && !leaving) paint(shown);
    }, ms);
  }

  return {
    root,
    show(next: OverlayView, options?: { readonly beat?: boolean }): void {
      if (leaving) return;
      if (options?.beat && view && !hidden) { playBeat(next, next.beatWord); return; }
      if (beatTimer) { pendingView = next; return; }
      paint(next);
    },
    setHidden(value: boolean): void {
      if (hidden === value) return;
      hidden = value;
      root.classList.toggle('is-open', !value && !!view);
      if (!root.hasAttribute('popover')) return;
      if (value && root.matches(':popover-open')) root.hidePopover();
      else if (!value && view && !root.matches(':popover-open')) { root.showPopover(); measure(); }
      askLayout();
    },
    litRect: () => lastRect,
    destroy(options?: { readonly complete?: string }): void {
      if (leaving) return;
      leaving = true;
      const wasShowing = !!view && !hidden && root.classList.contains('is-open');
      view = null;
      pendingView = null;
      window.clearTimeout(beatTimer);
      window.clearInterval(recheck);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, { capture: true });
      resizeObserver?.disconnect();
      for (const video of media.querySelectorAll('video')) { video.pause(); video.removeAttribute('src'); video.load(); }
      // nothing waits on the card's leaving: the dim, its blockers and the card's pointer go now
      for (const block of blockers) block.hidden = true;
      root.dataset.dim = 'clear';
      root.classList.remove('has-spot');
      // (no longer open: every reader of the open card, the battle plan's among them, lets a leaving one go)
      root.classList.replace('is-open', 'is-leaving');
      const gone = (): void => {
        if (root.hasAttribute('popover') && root.matches(':popover-open')) root.hidePopover();
        root.remove();
        askLayout();
      };
      if (!wasShowing) { gone(); return; }
      let ms = tokenMs('--dur-fast');
      if (options?.complete) {
        // the chapter's end: the larger beat (tutorial.css .is-complete), then the card leaves
        beatWord.textContent = options.complete;
        card.classList.add('is-complete');
        play(beat, 'is-on');
        ms = (prefersReducedMotion() ? STILL_BEAT_MS * 2 : tokenMs('--dur-stage')) + tokenMs('--dur-fast');
      }
      play(card, options?.complete ? 'is-completing' : 'is-exiting');
      window.setTimeout(gone, ms);
    },
  };
}
