/**
 * hudViewControls.ts — the controls a view brings over the battle HUD (notices-276). Copyright © 2026 Kevin B. Liu.
 *
 * Kevin, 2026-11-23: "fix ui overlaps like gunship overhead with X binoculars in air support". The notice planners
 * (battleHudLayout.ts: the mouse plan, the touch plan and the guidance plan that seats the condition lane) each kept a list
 * of the boxes a notice keeps off, and none held what comes up with a view: Air Support's binoculars (the readout, the key
 * hint, CALL), the call-ins' rack and a touch layout's Support slot (the close while the binoculars are up), the drone's
 * and the gunship's flight console and the gunship's solution. "Gunship overhead" was seated by the guidance plan under
 * the score, on the binoculars' readout; the event lane was moved off it by a CSS rule of its own (top: 212px), which
 * placed nothing against the boxes that were there.
 *
 * One list, read by every planner (each layout's pass measures these boxes live, as it measures the instruments) and by
 * the overlap probe (tools/battle-hud-overlap.browser.mjs measures them as controls, with both lanes' notices shown, in
 * every view). A control a new view brings joins this list, or the probe's --plant shows the notice landing on it.
 * DOM-free: selectors only (the probe imports it in Node).
 */

/** Each view control's selector, matched only while it shows (a hidden parent hides it; the planners skip a box with no
 *  client rects). */
export const VIEW_CONTROLS: readonly string[] = Object.freeze([
  // Air Support (airSupportHud.ts): a touch layout's Support slot on its own (on a desktop it is the tray's last slot,
  // already a control of every planner as .cot-shells), the call-ins' row, and the binoculars' readout, hint and CALL
  '.cot-strike-dock:not([hidden])',
  '.cot-strike-rack:not([hidden])',
  '.cot-binoculars:not([hidden]) .binocular-readout',
  '.cot-binoculars:not([hidden]) .binocular-hint',
  '.cot-binoculars:not([hidden]) .binocular-call',
  // the drone's and the gunship's flight (aerialHud.ts): the console and the gunship's solution
  '.cot-flight-hud:not([hidden]) .flight-console',
  '.cot-flight-hud:not([hidden]) .gunship-solution:not([hidden])',
]);

/** The view controls as one selector list. */
export const VIEW_CONTROL_SELECTOR = VIEW_CONTROLS.join(',');

/** The parts the layout observes so a view's coming and going (their `hidden`, their size) asks for a new plan. */
export const VIEW_CONTROL_PARTS = '.cot-strike-dock,.cot-strike-rack,.cot-binoculars,.binocular-readout,.binocular-hint,'
  + '.binocular-call,.cot-flight-hud,.flight-console,.gunship-solution';
