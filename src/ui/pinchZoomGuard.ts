// Browser pinch-zoom kill on the game page, for every device (2026-09-20, owner: "see this is what happens when i
// do that pinch zoom", with the splash screen collapsed into a corner of the window).
//
// A trackpad pinch reaches the page as ctrl+wheel (Chrome, Edge, Firefox) or as Safari's non-standard gesture*
// events; either zooms the browser's visual viewport. The game is a fullscreen application, so a pinch is never a
// page zoom here: the 3D surfaces read it as camera zoom (garageShowroomRuntime.ts, input.ts, killcam.ts,
// studio.ts) and every DOM surface ignores it. The guard used to live inside the touch controls module, which a
// desktop never constructs — so desktops had no guard at all.
//
// 2026-10-15 (owner: "using both my fingers on track pad to like expand the screen in landing causes a bunch of
// weirdness and layout shifts ... make sure its not anywhere else"):
// - index.html's inline <head> script carries the same rule from first paint (main.ts only evaluates after its
//   whole import graph has loaded, and a pinch on the splash used to get through); installing this module's guard
//   hands over from that boot copy (PINCH_ZOOM_BOOT_GUARD).
// - Listeners run in the capture phase, so no element's stopPropagation (the Studio dock stops 'wheel') can let a
//   pinch past.
// - A page that is already zoomed in (a pinch from before the guard, a page scale the browser restored) may always
//   zoom back OUT; only zooming in is cancelled. "Zoomed in" is responsiveLayout.ts pinchZoomFactor() above 1 (the
//   layout viewport wider than the visual one by more than a pixel), never visualViewport.scale: iOS page zoom
//   rests at scale 1.25 with no pinch. pinchRestoresPage() names that zoom-out half for the canvases that read a
//   pinch as camera zoom (garage showroom, Studio, gallery orbit), so a zoomed page un-zooms over them as well.
// A pinch that does get through is harmless: responsiveLayout.ts measures the viewport unmagnified, so a zoomed
// page is a magnifier and nothing relayouts. The public pages (home, docs, gallery, 404) keep browser
// pinch-zoom (an accessibility feature) for the same reason. One-finger scrolling and keyboard zoom are untouched;
// two-finger touchmove on gameplay surfaces stays with the touch controls, which know the live layout.

import { pinchFactor, pinchZoomFactor } from './responsiveLayout.ts';

interface GuardListenerTarget {
  addEventListener: (type: string, listener: (event: Event) => void, options?: AddEventListenerOptions) => void;
  removeEventListener: (type: string, listener: (event: Event) => void, options?: EventListenerOptions) => void;
}
interface GuardWindow extends GuardListenerTarget {
  readonly visualViewport?: { readonly width?: number } | null;
}
interface GuardDocument extends GuardListenerTarget {
  readonly documentElement?: { readonly clientWidth?: number } | null;
}

interface PinchZoomGuardHandle {
  /** false when the guard was already installed on this window. */
  readonly installed: boolean;
  destroy(): void;
}

/** The parts of a wheel or Safari gesture event the guard decides on. */
interface PinchEventLike {
  readonly type: string;
  readonly ctrlKey?: boolean;
  readonly deltaY?: number;
  readonly scale?: number;
}

export const PINCH_GESTURE_EVENTS = Object.freeze(['gesturestart', 'gesturechange', 'gestureend'] as const);
const PINCH_ZOOM_GUARD_HANDLE = Symbol.for('claude-of-tanks.pinch-zoom-guard');
/** index.html's inline boot guard leaves its remover here; the module guard calls it once it is listening. */
export const PINCH_ZOOM_BOOT_GUARD = Symbol.for('claude-of-tanks.pinch-zoom-boot-guard');
const LISTENER_OPTIONS: AddEventListenerOptions = Object.freeze({ passive: false, capture: true });

type GuardedWindow = GuardWindow & {
  [PINCH_ZOOM_GUARD_HANDLE]?: PinchZoomGuardHandle;
  [PINCH_ZOOM_BOOT_GUARD]?: () => void;
};

/** True for the wheel events a trackpad pinch (or ctrl+scroll) produces: the browser would zoom on them. */
export function isBrowserZoomWheel(event: { ctrlKey?: boolean }): boolean {
  return event.ctrlKey === true;
}

/**
 * Whether the guard cancels this event at the given pinch factor (responsiveLayout.ts pinchFactor(): 1 at rest,
 * above 1 while pinch-zoomed in). A ctrl+wheel and every Safari gesture event zooms in from rest, so each is
 * cancelled; once the page is zoomed in, the zoom-out half of a pinch (a positive ctrl+wheel deltaY, a gesturechange
 * scale below 1) passes, and so do the gesture's start and end.
 */
export function cancelsPinch(event: PinchEventLike, factor: number): boolean {
  const zoomedIn = Number.isFinite(factor) && factor > 1;
  if (event.type === 'wheel') {
    return isBrowserZoomWheel(event) && !(zoomedIn && (event.deltaY ?? 0) > 0);
  }
  if (!zoomedIn) return true;
  return event.type === 'gesturechange' && !((event.scale ?? 1) < 1);
}

const isPinchEvent = (event: PinchEventLike): boolean =>
  event.type === 'wheel' ? isBrowserZoomWheel(event) : event.type.startsWith('gesture');

/**
 * True for a pinch event that returns a pinch-zoomed-in page toward rest: the guard lets it through, and a canvas
 * that reads a pinch as camera zoom returns without preventDefault for it, so a zoomed page always un-zooms first.
 * A plain wheel is never one, and is answered before anything is measured.
 */
export function pinchRestoresPage(
  event: PinchEventLike,
  win: Parameters<typeof pinchZoomFactor>[0] = globalThis.window,
): boolean {
  if (!isPinchEvent(event)) return false;
  const factor = pinchZoomFactor(win);
  return factor > 1 && !cancelsPinch(event, factor);
}

export function installPinchZoomGuard(
  win: GuardWindow | undefined = globalThis.window as GuardWindow | undefined,
  doc: GuardDocument | undefined = globalThis.document as GuardDocument | undefined,
): PinchZoomGuardHandle {
  if (!win || !doc) return { installed: false, destroy() {} };
  const guarded = win as GuardedWindow;
  const existing = guarded[PINCH_ZOOM_GUARD_HANDLE];
  if (existing) return { installed: false, destroy: () => existing.destroy() };
  const guard = (event: Event): void => {
    const pinch = event as Event & PinchEventLike;
    if (!isPinchEvent(pinch)) return;
    if (cancelsPinch(pinch, pinchFactor(win.visualViewport?.width, doc.documentElement?.clientWidth))) {
      event.preventDefault();
    }
  };
  for (const type of PINCH_GESTURE_EVENTS) doc.addEventListener(type, guard, LISTENER_OPTIONS);
  win.addEventListener('wheel', guard, LISTENER_OPTIONS);
  // listening first, then the boot copy goes: no pinch slips through the handover
  const bootGuard = guarded[PINCH_ZOOM_BOOT_GUARD];
  if (typeof bootGuard === 'function') {
    delete guarded[PINCH_ZOOM_BOOT_GUARD];
    bootGuard();
  }
  const handle: PinchZoomGuardHandle = {
    installed: true,
    destroy() {
      for (const type of PINCH_GESTURE_EVENTS) doc.removeEventListener(type, guard, { capture: true });
      win.removeEventListener('wheel', guard, { capture: true });
      delete guarded[PINCH_ZOOM_GUARD_HANDLE];
    },
  };
  guarded[PINCH_ZOOM_GUARD_HANDLE] = handle;
  return handle;
}
