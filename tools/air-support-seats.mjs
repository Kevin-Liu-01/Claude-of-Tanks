// Air Support's controls keep their own seats while the binoculars are up (item air-support-seats-276; found by notices-276
// beside the close's stills): CALL, the call-ins' rack, the touch layout's Support dock, the Support slot, the ammunition's
// shells and the vehicle's controls may not cross one another. At 844x390 CALL stood under the vehicle controls' edge
// section (110x44, it could not be pressed) and the dock crossed CALL (44x9); at 820x1180 the selected shell crossed the
// rack (52x44).
//
// measureSeats() runs in the page with the binoculars up; seatsProblems() judges what it returns.
// tools/air-support-seats.selftest.mjs runs the judge on fixtures (today's crossings among them, the negative control) and
// tools/air-support-shots.mjs --seats on a live Air Support battle at each gauntlet size.
//
// Which controls a view brings over the HUD is src/ui/hudViewControls.ts VIEW_CONTROLS (notices-276), the list every
// notice planner keeps off; the dock, the rack and CALL are read from it here, not restated.
import { VIEW_CONTROLS } from '../src/ui/hudViewControls.ts';

const viewControl = (part) => {
  const hit = VIEW_CONTROLS.find((selector) => selector.includes(part));
  if (!hit) throw new Error(`hudViewControls.ts VIEW_CONTROLS names no ${part}`);
  return hit;
};

/** The seats, each a role and where it stands. A role's boxes are each a control (the shells and the vehicle controls one
 *  box a button: the gaps of a grid are no control's), the rack, the dock and CALL one box each. */
export const SEATS = Object.freeze([
  ['call', viewControl('.binocular-call')],
  ['rack', viewControl('.cot-strike-rack')],
  ['dock', viewControl('.cot-strike-dock')],
  ['support', '.strike-support'],
  ['shell', '.cot-shells>.cot-shell'],
  ['vehicle', '.cot-vehicle-controls>button'],
  // (and what a seat moved off those may land on: the binoculars' own plates, the items, the touch kit's round buttons;
  // at 1180x820 CALL stood on the readout and the items' column, which the brief's six alone did not see)
  ['readout', viewControl('.binocular-readout')],
  ['hint', viewControl('.binocular-hint')],
  ['item', '.cot-cons>.cot-con'],
  ['round', '.cot-touch.on .round'],
]);

/** The seats this item places, each kept whole on the screen (at 1180x820 the rack ran 80 px off its right edge). */
const ON_SCREEN = Object.freeze(['call', 'rack', 'dock', 'readout', 'hint']);

/** Boxes that stand inside another by design: Support inside its dock (a touch layout's own seat). */
const NESTED = Object.freeze([['support', 'dock']]);

/** In the page: each seat's visible boxes, as { role, name, x, y, w, h }, and whether the binoculars are up. */
export const measureSeats = (seats) => {
  const shown = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getBoundingClientRect().width >= 1;
  const name = (el) => `${el.tagName.toLowerCase()}${el.classList.length ? `.${[...el.classList].join('.')}` : ''}`
    + (el.dataset?.control ? `[${el.dataset.control}]` : '') + (el.dataset?.selected === 'true' || el.classList.contains('sel') ? ':selected' : '');
  const boxes = [];
  for (const [role, selector] of seats) {
    for (const el of document.querySelectorAll(selector)) {
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect();
      boxes.push({ role, name: name(el), x: r.left, y: r.top, w: r.width, h: r.height });
    }
  }
  const binoculars = document.querySelector('.cot-binoculars');
  return { up: !!binoculars && !binoculars.hidden, touch: document.body.classList.contains('cot-touch-layout'),
    slot: document.body.dataset.systemsSlot ?? '', viewport: [innerWidth, innerHeight], boxes };
};

/** In the page: the live negative control. The rack planted on the Support slot (`on`), or lifted again; the judge must
 *  fail it at every size. */
export const plantCrossing = (on) => {
  document.getElementById('seats-plant')?.remove();
  if (!on) return false;
  const support = document.querySelector('.strike-support')?.getBoundingClientRect();
  if (!support) return false;
  const style = document.createElement('style');
  style.id = 'seats-plant';
  style.textContent = `body .cot-strike-rack:not([hidden]){position:fixed!important;left:${support.left}px!important;top:${support.top}px!important;`
    + 'right:auto!important;bottom:auto!important;transform:none!important}';
  document.head.append(style);
  return true;
};

const fmt = (b) => `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}`;
const nested = (a, b) => NESTED.some(([inner, outer]) => (a.role === inner && b.role === outer) || (a.role === outer && b.role === inner));
/** How far two boxes cross (0 by 0 when they only touch or stand apart; sub-pixel rounding is not a crossing). */
export const crossing = (a, b) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0.5 && h > 0.5 ? { w, h } : null;
};

/** The problems (empty is a pass) with one size's measure, the binoculars up. A touch layout shows CALL; every layout
 *  shows the rack and Support. */
export function seatsProblems(measure) {
  if (!measure?.up) return ['the binoculars are not up'];
  const problems = [];
  const has = (role) => measure.boxes.some((b) => b.role === role);
  for (const role of ['rack', 'support', ...(measure.touch ? ['call'] : [])]) if (!has(role)) problems.push(`no ${role} shown`);
  const { boxes } = measure;
  const [vw, vh] = measure.viewport ?? [Infinity, Infinity];
  for (const b of boxes) {
    if (!ON_SCREEN.includes(b.role)) continue;
    const off = Math.max(0, -b.x, b.x + b.w - vw, -b.y, b.y + b.h - vh);
    if (off > 0.5) problems.push(`${b.role} ${b.name} at ${fmt(b)} runs ${Math.round(off)} px off the ${vw}x${vh} screen`);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.role === b.role || nested(a, b)) continue;
      const hit = crossing(a, b);
      if (hit) problems.push(`${a.role} ${a.name} at ${fmt(a)} crosses ${b.role} ${b.name} at ${fmt(b)} by ${Math.round(hit.w)}x${Math.round(hit.h)}`);
    }
  }
  return problems;
}
