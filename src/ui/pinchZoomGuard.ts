// Browser pinch-zoom kill for every device (2026-09-20, owner: "see this is what happens when i do that pinch zoom",
// with the splash screen collapsed into a corner of the window).
//
// A trackpad pinch reaches the page as ctrl+wheel (Chrome, Edge, Firefox) or as Safari's non-standard gesture*
// events; either zooms the browser, and every game surface is pinned to the measured visual viewport, so the
// whole UI folded into the zoomed rectangle. The guard used to live inside the touch controls module, which a
// desktop never constructs — so desktops had no guard at all. It is now installed at boot, before the first
// paint, idempotently (one handle per window). ctrl+wheel never scrolls anything, so it is cancelled app-wide;
// one-finger scrolling and keyboard zoom (an accessibility feature) are untouched. Two-finger touchmove on
// gameplay surfaces stays with the touch controls, which know the live layout.

interface GuardWindow {
  addEventListener: (type: string, listener: (event: Event) => void, options?: AddEventListenerOptions) => void;
  removeEventListener: (type: string, listener: (event: Event) => void, options?: EventListenerOptions) => void;
}
interface GuardDocument {
  addEventListener: (type: string, listener: (event: Event) => void, options?: AddEventListenerOptions) => void;
  removeEventListener: (type: string, listener: (event: Event) => void, options?: EventListenerOptions) => void;
}

interface PinchZoomGuardHandle {
  /** false when the guard was already installed on this window. */
  readonly installed: boolean;
  destroy(): void;
}

export const PINCH_GESTURE_EVENTS = Object.freeze(['gesturestart', 'gesturechange', 'gestureend'] as const);
const PINCH_ZOOM_GUARD_HANDLE = Symbol.for('claude-of-tanks.pinch-zoom-guard');

type GuardedWindow = GuardWindow & { [PINCH_ZOOM_GUARD_HANDLE]?: PinchZoomGuardHandle };

/** True for the wheel events a trackpad pinch (or ctrl+scroll) produces: the browser would zoom on them. */
export function isBrowserZoomWheel(event: { ctrlKey?: boolean }): boolean {
  return event.ctrlKey === true;
}

export function installPinchZoomGuard(
  win: GuardWindow | undefined = globalThis.window as GuardWindow | undefined,
  doc: GuardDocument | undefined = globalThis.document as GuardDocument | undefined,
): PinchZoomGuardHandle {
  if (!win || !doc) return { installed: false, destroy() {} };
  const guarded = win as GuardedWindow;
  const existing = guarded[PINCH_ZOOM_GUARD_HANDLE];
  if (existing) return { installed: false, destroy: () => existing.destroy() };
  const killGesture = (event: Event): void => event.preventDefault();
  const killZoomWheel = (event: Event): void => {
    if (isBrowserZoomWheel(event as { ctrlKey?: boolean })) event.preventDefault();
  };
  for (const type of PINCH_GESTURE_EVENTS) doc.addEventListener(type, killGesture, { passive: false });
  win.addEventListener('wheel', killZoomWheel, { passive: false });
  const handle: PinchZoomGuardHandle = {
    installed: true,
    destroy() {
      for (const type of PINCH_GESTURE_EVENTS) doc.removeEventListener(type, killGesture);
      win.removeEventListener('wheel', killZoomWheel);
      delete guarded[PINCH_ZOOM_GUARD_HANDLE];
    },
  };
  guarded[PINCH_ZOOM_GUARD_HANDLE] = handle;
  return handle;
}
