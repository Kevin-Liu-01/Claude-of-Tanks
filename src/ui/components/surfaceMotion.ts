// surfaceMotion.ts — the one exit for a surface that leaves the page (Kevin 2026-11-21: "need ui transitions and animations
// in general"). Copyright © 2026 Kevin B. Liu.
//
// The game's shared motion vocabulary lives in src/ui/components/surfaceMotion.css: a surface carries one of its classes
// (cot-m-rise, cot-m-drop, cot-m-pop, cot-m-slide-start, cot-m-slide-end, cot-m-fade) and enters from @starting-style as
// it shows, then leaves the same way while it hides or carries data-leaving. A surface shown and hidden by display (the
// hidden attribute, a class) needs nothing here: the transition on display keeps it on screen through its exit.
//
// This module is for the ones whose owner removes them from the document or empties them: it plays the exit first. The
// state has already moved when it is called (the stack has let the surface go, the focus is where it belongs, the game
// has its answer): only the element's removal waits, it takes no presses meanwhile (inert), and opening it again before
// its exit ends cancels the exit. Under reduced motion every --dur-* token is 1 ms, so done runs now.

/** The longest transition on an element, in ms (0 when it has none or reduced motion collapsed it). */
export function exitMs(element: Element): number {
  if (typeof getComputedStyle !== 'function') return 0;
  const style = getComputedStyle(element);
  const times = (text: string): number[] => text.split(',').map((part) => {
    const value = parseFloat(part);
    return Number.isFinite(value) ? (part.trim().endsWith('ms') ? value : value * 1000) : 0;
  });
  const durations = times(style.transitionDuration);
  const delays = times(style.transitionDelay);
  let longest = 0;
  for (let i = 0; i < durations.length; i++) longest = Math.max(longest, durations[i] + (delays[i % delays.length] ?? 0));
  return longest;
}

interface Leaving { readonly timer: ReturnType<typeof setTimeout>; readonly finish: () => void }
const leaving = new WeakMap<Element, Leaving>();

/**
 * Play `element`'s exit, then run `done` (remove it, empty it, hide it). Returns at once. A second call while it leaves
 * keeps the first `done`; reduced motion, a hidden element or one with no exit run `done` now.
 */
export function leaveThen(element: HTMLElement, done: () => void): void {
  if (leaving.has(element)) return;
  // (a Node stand-in with no layout, or an element that no longer shows: nothing to play)
  if (typeof element.getClientRects !== 'function' || !element.getClientRects().length) { done(); return; }
  // the exit's own timing (the vocabulary's [data-leaving] state runs the shorter exit band) decides the wait
  element.dataset.leaving = '';
  const ms = exitMs(element);
  if (ms <= 1) { delete element.dataset.leaving; done(); return; }
  element.inert = true;
  const finish = (): void => {
    if (!leaving.has(element)) return;
    finishLeave(element);
    done();
  };
  const onEnd = (event: Event): void => { if (event.target === element) finish(); };
  element.addEventListener('transitionend', onEnd);
  element.addEventListener('transitioncancel', onEnd);
  // the timer is the guarantee: a transition that never starts (the element hid another way) fires no event
  const timer = setTimeout(finish, ms + 40);
  leaving.set(element, { timer, finish: () => {
    element.removeEventListener('transitionend', onEnd);
    element.removeEventListener('transitioncancel', onEnd);
  } });
}

function finishLeave(element: HTMLElement): void {
  const entry = leaving.get(element);
  if (entry) { clearTimeout(entry.timer); entry.finish(); leaving.delete(element); }
  delete element.dataset.leaving;
  element.inert = false;
}

/** `element` shows again before its exit ended: keep it, drop the pending `done`. Returns whether it was leaving. */
export function cancelLeave(element: HTMLElement): boolean {
  if (!leaving.has(element)) return false;
  finishLeave(element);
  return true;
}

/** Whether `element` is playing its exit. */
export function isLeaving(element: Element): boolean {
  return leaving.has(element);
}
