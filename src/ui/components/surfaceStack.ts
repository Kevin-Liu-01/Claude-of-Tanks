// surfaceStack.ts — the kit's one owner of open transient surfaces (owner 2026-10-27: "what if i have equipment open and
// select consumables, the old surface needs to go away while new one comes in"). Copyright © 2026 Kevin B. Liu.
//
// Every picker, popover, menu, drawer, sheet and dialog that opens over a page tells the stack as it opens (openSurface)
// and as it closes (closeSurface). The stack holds one open surface per level. A surface opened from inside an open one
// (its opener in that one's box) stands a level above it; any other replaces whatever is open at its level and above, in
// the same press: the old one closes with its exit motion while the new one enters. The press is never swallowed: an
// outside press closes the top surface on its way down (capture) and goes on to its target. Escape and an outside press
// close only the top surface; a surface may keep an Escape it uses (a search's text, a key being bound), and a modal one
// (its own scrim takes the presses outside it) never closes on an outside press. The pure plan (planOpen, planPress) is
// what the selftest pins; the census (tools/surface-pairs.mjs) reads the open ids through window.__cotSurfaces, and the
// registry (src/ui/transientSurfaceRegistry.ts) names every id a surface opens under.

/** Why the stack closes a surface: another replaced it (the focus goes to that one), Escape (the focus goes back to its
 *  opener) or a press outside it (the focus stays where the press puts it). */
export type SurfaceCloseReason = 'replace' | 'escape' | 'outside';

export interface TransientSurface {
  /** Its registry id (src/ui/transientSurfaceRegistry.ts). */
  readonly id: string;
  /** Its box: a press inside it is its own. */
  element(): Element | null;
  /** The controls that open it (a trigger, a slot row): a press on one is its own (its toggle). */
  owns?(target: Node): boolean;
  /** Close it with its exit motion (the stack has already let it go). */
  close(reason: SurfaceCloseReason): void;
  /** Its own scrim takes the presses outside it: only Escape or its own controls close it. */
  readonly modal?: boolean;
  /** It keeps this Escape (a search's text to clear, a key being bound): the stack leaves the key to it. */
  keepsEscape?(event: KeyboardEvent): boolean;
}

/** What the stack needs of a surface to plan: whether a node is inside it. */
interface Box { contains(node: Node | null): boolean }

/**
 * Opening a surface from `opener` over `open` (bottom to top): the index of the open surface it stands on (the topmost
 * whose box holds the opener; -1 for none, the page), and so the surfaces above that one, which it replaces. Pure.
 */
export function planOpen(open: readonly Box[], opener: Node | null): { parent: number; replaced: number[] } {
  let parent = -1;
  for (let i = open.length - 1; i >= 0; i--) if (opener && open[i].contains(opener)) { parent = i; break; }
  const replaced: number[] = [];
  for (let i = open.length - 1; i > parent; i--) replaced.push(i);
  return { parent, replaced };
}

/** A press on `target`: whether it closes the top surface (it lands outside it and its controls, and it is not modal). */
export function planPress(top: (Box & { readonly modal?: boolean }) | undefined, target: Node | null): boolean {
  return !!top && !top.modal && !!target && !top.contains(target);
}

const stack: TransientSurface[] = [];
// The control each open surface was opened from (2026-11-02 audit F5): a page that hides owns the surfaces opened from it
// even when their box lives elsewhere (a picker menu's popover in the body's top layer, a body-level modal).
const openers = new WeakMap<TransientSurface, Node | null>();
const boxOf = (surface: TransientSurface): Box => ({
  contains: (node) => !!node && (!!surface.element()?.contains(node) || !!surface.owns?.(node)),
});

/** The ids open now, bottom to top (the census's read). */
export function openSurfaceIds(): readonly string[] {
  return stack.map((surface) => surface.id);
}

/** Whether a modal surface (one with its own scrim) is open, other than the one named `exceptId` (2026-11-02 audit F5:
 *  the stack is the one truth for "a modal is open"; modal.ts isAnyModalOpen reads it). */
export function modalSurfaceOpen(exceptId?: string): boolean {
  for (const surface of stack) if (surface.modal && surface.id !== exceptId) return true;
  return false;
}

/**
 * `surface` opens from `opener` (its trigger; the focused control when none is given). Whatever stands at its level or
 * above closes now, with its exit motion, so the new surface enters as the old one leaves. Opening an open surface
 * again changes nothing.
 */
export function openSurface(surface: TransientSurface, opener?: Node | null): void {
  if (stack.includes(surface)) return;
  install();
  const from = opener ?? (typeof document === 'undefined' ? null : document.activeElement);
  const { replaced } = planOpen(stack.map(boxOf), from);
  for (const index of replaced) {
    const [old] = stack.splice(index, 1);
    old.close('replace');
  }
  stack.push(surface);
  openers.set(surface, from ?? null);
}

/**
 * Whether `node` is `surface`'s: inside its box or its controls, or inside a surface standing on it (opened from it, wherever
 * its box lives: a body-level modal). A surface that closes when the focus leaves it asks this, so the focus a surface it
 * opened takes is not a leave (272: Deploy's focusout read the couch lobby's focus as one, closed Deploy, and the lobby
 * went with it: a real press on Couch opened the lobby and closed it a frame later).
 */
export function surfaceHolds(surface: TransientSurface, node: Node | null): boolean {
  const at = stack.indexOf(surface);
  if (at < 0) return boxOf(surface).contains(node);
  for (let i = at; i < stack.length; i++) if (boxOf(stack[i]).contains(node)) return true;
  return false;
}

/** `surface` closed (its own close, or the stack's): the surfaces standing on it close with it. */
export function closeSurface(surface: TransientSurface): void {
  const at = stack.indexOf(surface);
  if (at < 0) return;
  const above = stack.splice(at);
  for (const old of above.slice(1).reverse()) old.close('replace');
}

/**
 * A page that hides takes its surfaces with it (2026-11-02 audit F5): every open surface whose box is inside `root`, or
 * that was opened from a control inside it, closes, the top first, as a replacement does (no focus goes back to a page
 * that is gone). Without it a surface left open under a hidden page kept its place, and the next Escape (the battle's
 * pause) was spent on it. Returns how many closed.
 */
export function closeSurfacesWithin(root: { contains(node: Node | null): boolean }): number {
  let closed = 0;
  for (const surface of [...stack].reverse()) {
    if (!stack.includes(surface)) continue;
    const element = surface.element();
    const opener = openers.get(surface) ?? null;
    if (!(element && root.contains(element)) && !(opener && root.contains(opener))) continue;
    closeSurface(surface);
    surface.close('replace');
    closed += 1;
  }
  return closed;
}

// a resize, a rotation or a page change that hides an open surface (the phone's menu on a wide window) closes it: none
// stands open unseen
const sweep = (): void => {
  for (const surface of [...stack].reverse()) {
    const element = surface.element();
    if (!stack.includes(surface) || !element || element.getClientRects().length) continue;
    closeSurface(surface);
    surface.close('replace');
  }
};
/** Close every open surface that no longer shows (a page that hid under it): the resize sweep, on demand. */
export function sweepHiddenSurfaces(): void {
  if (stack.length) sweep();
}

/** A native modal <dialog> (a public page's trailer, its archive, its library) on the stack while it is open: opening it
 *  closes what stood open, and Escape is the stack's. showModal() has no event: the open attribute says it opened. */
export function dialogSurface(dialog: HTMLDialogElement, id: string): void {
  const surface: TransientSurface = { id, element: () => dialog, close: () => dialog.close(), modal: true };
  new MutationObserver(() => { if (dialog.open) openSurface(surface); else closeSurface(surface); })
    .observe(dialog, { attributes: true, attributeFilter: ['open'] });
}

/* ------------------------------------------------------------------------------------------------- the page's keys */

let installed = false;
/** One Escape and one outside press for every surface, ahead of the page's own keys (the window's capture, installed as
 *  the kit loads, before any surface's owner adds its listeners). */
function install(): void {
  if (installed || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  installed = true;
  window.addEventListener('keydown', (event) => {
    const top = stack.at(-1);
    if (!top || event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
    if (top.keepsEscape?.(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    stack.pop();
    top.close('escape');
  }, true);
  window.addEventListener('pointerdown', (event) => {
    const top = stack.at(-1);
    // a press on a surface's own backdrop (a sheet's ::backdrop is its element's) lands outside its box
    const box = top && !top.modal && event.target === top.element() ? (event.target as Element).getBoundingClientRect() : null;
    const backdrop = !!box && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom);
    if (!backdrop && !planPress(top && { ...boxOf(top), modal: top.modal }, event.target as Node | null)) return;
    stack.pop();
    top!.close('outside');
  }, true);
  // The sweep runs a frame after the resize and again once the page's layout has changed (responsiveLayout.ts)
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    if (resizeFrame || !stack.length) return;
    resizeFrame = window.requestAnimationFrame(() => { resizeFrame = 0; sweep(); });
  });
  window.addEventListener('cot:layoutchange', () => { if (stack.length) sweep(); });
  Object.defineProperty(window, '__cotSurfaces', { value: openSurfaceIds, configurable: true });
}
install();
