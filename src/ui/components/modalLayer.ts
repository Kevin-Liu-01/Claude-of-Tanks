// modalLayer.ts — every modal over everything else (owner 2026-11-24, modal-layer-277: "the settings and pause, any modal
// should go above any other ui stuff"). Copyright © 2026 Kevin B. Liu.
//
// The stacking order is one scale (src/ui/tokens/tokens.json, semantic.layer): a modal's root stands on z-modal, over the
// HUD, notices, menus and drawers, and its scrim is that root's own fill. A z-index only counts inside its stacking
// context, though, and a modal mounted inside a screen (Deploy, the Garage's own sheet) can never rise above the screen.
// So an open modal also stands in the browser's top layer, as a manual popover: no light dismiss and no focus move (the
// owner keeps its keys, its focus and its scrim), and no z-index outranks it. A modal opened over a modal (Settings over
// the pause, a dialog over Settings or Deploy) enters the top layer after it and stands over it. Notices never enter it,
// so a warning raised while a modal is open stays under its scrim. Only what opens from the modal itself (a picker menu,
// a tooltip) and the critical blockers (raiseCritical) stand over one, each entering after it. A browser with no popover
// keeps the z scale alone. tools/z-layer-census.mjs holds every modal to one of the two.

import { ensureStyle } from '../styleLayers.ts';

/** The mark of a root this module put in the top layer (the census and the browser receipt read it). */
export const MODAL_LAYER_ATTR = 'data-cot-modal-layer';
const CRITICAL_ATTR = 'data-cot-critical-layer';

// A popover's UA sheet gives it a margin, a border, padding, a fit-content box, an auto overflow and the Canvas colours;
// a modal root keeps its own box. Zero specificity in the base layer: it beats only the UA sheet, and every surface rule
// of the root (its fill, its display, its inset) beats it.
const CSS = `:where([${MODAL_LAYER_ATTR}],[${CRITICAL_ATTR}]){margin:0;padding:0;border:0;width:auto;height:auto;max-width:none;`
  + 'max-height:none;overflow:visible;color:inherit;background:transparent}';

const canPop = (el: HTMLElement): boolean => typeof el.showPopover === 'function';

function place(el: HTMLElement, attr: string, on: boolean): void {
  if (!canPop(el)) return;
  if (!el.hasAttribute('popover')) {
    ensureStyle('cot-modal-layer-css', CSS, 'base');
    el.setAttribute('popover', 'manual');
    el.setAttribute(attr, '');
  }
  const shown = el.matches(':popover-open');
  try {
    if (on && !shown && el.isConnected) el.showPopover();
    else if (!on && shown) el.hidePopover();
  } catch { /* a detached root or a browser mid-transition: the z scale still orders it */ }
}

/** Put a modal's root in the top layer as it opens (`open`), or take it out as it closes. Idempotent. */
export function liftModal(root: HTMLElement, open: boolean): void {
  place(root, MODAL_LAYER_ATTR, open);
}

/** A blocker that must stand over an open modal (the lost GPU, a failed load's reload): into the top layer as it shows,
 *  after any modal, so over it; out as it goes. Every caller is named in tools/z-layer-census.mjs. */
export function raiseCritical(el: HTMLElement, shown: boolean): void {
  place(el, CRITICAL_ATTR, shown);
}
