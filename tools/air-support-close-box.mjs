// Air Support's close is the Support slot (item air-support-close-276; Kevin 2026-11-23: "for air support, the x button
// shouldnt just appear and disappear. its part of the ui for air support"). One control in one box: Support at rest, the
// same box with the binoculars up, where it lowers them; nothing else lowers them by pointer, and no button comes up with
// the binoculars but the call-ins and CALL.
//
// closeBoxProblems() judges two page measures (measureCloseBox(), run in the page at rest and with the binoculars up);
// tools/air-support-close-box.selftest.mjs runs it on fixtures (the old standalone button among them, the negative
// control) and tools/air-support-shots.mjs --close-box on a live Air Support battle at each gauntlet size.

/** In the page: the Support slot's box and label, every visible control whose name lowers the binoculars, and every
 *  visible button with where it stands. `lower` is the catalog's airSupport.lower in the page's locale. */
export const measureCloseBox = (lower) => {
  const shown = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getBoundingClientRect().width >= 1;
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const name = (el) => `${el.tagName.toLowerCase()}${el.classList.length ? `.${[...el.classList].join('.')}` : ''}`;
  const support = document.querySelector('.strike-support');
  const buttons = [...document.querySelectorAll('button,[role=button]')].filter(shown);
  return {
    support: support && shown(support) ? { box: box(support), label: support.getAttribute('aria-label') } : null,
    lowers: buttons.filter((el) => el.getAttribute('aria-label') === lower).map((el) => ({ name: name(el), box: box(el), support: el === support })),
    buttons: buttons.map((el) => ({ name: name(el), box: box(el),
      role: el === support ? 'support' : el.closest('.cot-strike-rack') ? 'call-in' : el.classList.contains('binocular-call') ? 'call' : 'other' })),
  };
};

/** In the page: the negative control. The old standalone close (integ/276 fb0f3aba6a airSupportHud.ts and .css, its
 *  phone rules shown at every size) put back in the binoculars (`on`), or taken out again; the judge must fail it. This
 *  module is the one place outside the old tree that names it. */
export const putBackOldClose = (lower, on) => {
  const cls = 'binocular-close';
  document.getElementById('old-close')?.remove();
  document.querySelector(`.cot-binoculars .${cls}`)?.remove();
  if (!on) return false;
  const style = document.createElement('style');
  style.id = 'old-close';
  style.textContent = `.cot-binoculars .${cls}{display:inline-flex;position:absolute;pointer-events:auto;`
    + 'right:calc(max(12px,env(safe-area-inset-right)) + 120px);bottom:calc(max(10px,env(safe-area-inset-bottom)) + 222px);'
    + `background:var(--hud-plate-strong)}@media(orientation:portrait){.cot-binoculars .${cls}{right:auto;left:calc(50% - 88px);bottom:252px}}`;
  document.head.append(style);
  const button = document.createElement('button');
  button.className = `${cls} cot-c-btn cot-c-btn--secondary cot-c-btn--56 cot-c-btn--icon`;
  button.setAttribute('aria-label', lower);
  button.textContent = '×';
  document.querySelector('.cot-binoculars').append(button);
  return true;
};

const same = (a, b, tol = 0.5) => !!a && !!b && ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) <= tol);
const key = (b) => `${b.name}@${Math.round(b.box.x)},${Math.round(b.box.y)}`;
const fmt = (b) => `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}`;

/** The problems (empty is a pass) with `rest` and `up` measures of one size; `labels` the catalog's view and lower. */
export function closeBoxProblems(rest, up, labels) {
  const problems = [];
  if (!rest?.support) problems.push('rest: no Support slot shown');
  if (!up?.support) problems.push('up: no Support slot shown');
  if (problems.length) return problems;
  if (!same(rest.support.box, up.support.box)) problems.push(`Support moved: rest ${fmt(rest.support.box)}, up ${fmt(up.support.box)}`);
  if (rest.support.label !== labels.view) problems.push(`rest: Support is named "${rest.support.label}", not "${labels.view}"`);
  if (up.support.label !== labels.lower) problems.push(`up: Support is named "${up.support.label}", not "${labels.lower}"`);
  // the one control that lowers them is Support, in Support's own box
  const lowers = up.lowers.filter((l) => !l.support);
  for (const l of lowers) problems.push(`up: a second lower control ${l.name} at ${fmt(l.box)} (Support is at ${fmt(up.support.box)})`);
  if (rest.lowers.some((l) => !l.support)) problems.push('rest: a lower control is shown with the binoculars down');
  // nothing pops in with the binoculars but the call-ins and CALL
  const before = new Set(rest.buttons.map(key));
  for (const b of up.buttons) {
    if (b.role === 'support' || b.role === 'call-in' || b.role === 'call' || before.has(key(b))) continue;
    problems.push(`up: ${b.name} at ${fmt(b.box)} comes up with the binoculars`);
  }
  return problems;
}
