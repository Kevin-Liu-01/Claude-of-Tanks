// air-support-close-box.selftest.mjs — Air Support's close is the Support slot (item air-support-close-276; Kevin
// 2026-11-23: "for air support, the x button shouldnt just appear and disappear. its part of the ui for air support").
// - the judge (tools/air-support-close-box.mjs closeBoxProblems) passes one control in one box, and fails the old
//   standalone close at the phone portrait gauntlet size (the negative control) and a Support slot that moves;
// - the module over the recording DOM: the binoculars hold no button but CALL; the Support slot carries both faces (the
//   binoculars and Spot, the X and Lower) and names what a press does, raise or lower, as the binoculars go up and down;
// - the styles: no .binocular-close anywhere in the source, and no rule moves or resizes the Support slot or its seat
//   with the binoculars up (its faces cross over in place). The style check fails on the old rules.
// The live boxes at 390x844, 844x390, the iPad and the desktop are tools/air-support-shots.mjs --close-box.
import { created } from '../src/ui/hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBus } from '../src/game/stateCore.ts';
import { strikeView } from '../src/game/strikeViewState.ts';
import { createAirSupportHud } from '../src/ui/airSupportHud.ts';
import { t } from '../src/ui/i18n.ts';
import { closeBoxProblems } from './air-support-close-box.mjs';

const labels = { view: t('airSupport.view'), lower: t('airSupport.lower') };

// ---- the judge, on fixtures
{
  const support = { x: 148, y: 592, w: 44, h: 44 };
  const rack = [0, 1, 2, 3, 4, 5].map((i) => ({ name: 'button.strike-slot', role: 'call-in', box: { x: 148 + i * 47, y: 646, w: 44, h: 44 } }));
  const callBtn = { name: 'button.binocular-call', role: 'call', box: { x: 171, y: 536, w: 112, h: 56 } };
  const rest = { support: { box: support, label: labels.view }, lowers: [],
    buttons: [{ name: 'button.strike-slot.strike-support', role: 'support', box: support }] };
  const up = { support: { box: support, label: labels.lower },
    lowers: [{ name: 'button.strike-slot.strike-support', support: true, box: support }],
    buttons: [{ name: 'button.strike-slot.strike-support', role: 'support', box: support }, ...rack, callBtn] };
  assert.deepEqual(closeBoxProblems(rest, up, labels), [], 'one control in one box passes');

  // the negative control: the old standalone close at 390x844 (left:calc(50% - 88px); bottom:252px; 56 px), a button of
  // its own that came up with the binoculars, while Support kept its name
  const oldClose = { x: 107, y: 536, w: 56, h: 56 };
  const old = { support: { box: support, label: labels.view },
    lowers: [{ name: 'button.binocular-close.cot-c-btn', support: false, box: oldClose }],
    buttons: [...up.buttons, { name: 'button.binocular-close.cot-c-btn', role: 'other', box: oldClose }] };
  const oldProblems = closeBoxProblems(rest, old, labels);
  assert.ok(oldProblems.some((p) => p.includes('a second lower control button.binocular-close')), 'the old standalone close fails');
  assert.ok(oldProblems.some((p) => p.includes('comes up with the binoculars')), 'it popped in with the binoculars');
  assert.ok(oldProblems.some((p) => p.includes('up: Support is named')), 'Support did not lower them');
  // a Support slot that moves with the binoculars, or a close that stays down, fails as well
  const moved = { ...up, support: { ...up.support, box: { ...support, y: support.y - 60 } } };
  assert.ok(closeBoxProblems(rest, moved, labels).some((p) => p.startsWith('Support moved')), 'a moved Support fails');
  assert.ok(closeBoxProblems({ ...rest, lowers: old.lowers }, up, labels).some((p) => p.startsWith('rest: a lower control')));
  assert.ok(closeBoxProblems({ ...rest, support: null }, up, labels).length, 'no Support at rest fails');
}

// ---- the module over the recording DOM
{
  const bus = createBus();
  const parent = globalThis.document.createElement('div');
  const port = { condition() {}, dismiss() {} };
  const from = created.length;
  const hud = createAirSupportHud(parent, bus, port);
  const mine = created.slice(from);
  const has = (el, cls) => el.classes.has(cls);
  assert.ok(!mine.some((el) => has(el, 'binocular-close')), 'no standalone close');
  const binoculars = mine.find((el) => has(el, 'cot-binoculars'));
  const inside = (el, root) => { for (let p = el.parentNode; p; p = p.parentNode) if (p === root) return true; return false; };
  const buttons = mine.filter((el) => el.tagName?.toLowerCase() === 'button');
  assert.deepEqual(buttons.filter((el) => inside(el, binoculars)).map((el) => el.className), ['binocular-call cot-c-btn cot-c-btn--primary cot-c-btn--56'],
    'the binoculars hold one button: CALL');
  const support = mine.find((el) => has(el, 'strike-support'));
  const faces = (cls) => mine.filter((el) => has(el, cls) && inside(el, support));
  assert.equal(faces('face-rest').length, 2, 'the rest faces: the binoculars and the short name');
  assert.equal(faces('face-up').length, 2, 'the up faces: the X and Lower');
  const [glyphUp, labelUp] = faces('face-up');
  assert.match(glyphUp.innerHTML, /close/, 'the up glyph is the close X');
  assert.equal(labelUp.textContent, t('airSupport.short.lower'));
  assert.equal(faces('face-rest')[1].textContent, t('airSupport.short.view'));

  const air = { nowS: 10, points: 1000, strikes: [], cooldowns: {} };
  const P = { x: 0, y: 0, z: 0 }, aim = { x: 0, y: 0, z: 120 };
  strikeView.open = false;
  hud.update(air, aim, P, 'alpha', 10, true, 'X');
  assert.equal(support.getAttribute('aria-label'), labels.view, 'at rest Support raises the binoculars');
  assert.equal(support.dataset.selected, 'false');
  strikeView.open = true;
  hud.update(air, aim, P, 'alpha', 10.1, true, 'X');
  assert.equal(support.getAttribute('aria-label'), labels.lower, 'with them up, Support lowers them');
  assert.equal(support.dataset.selected, 'true');
  // a press of Support is the toggle the X key and the pad already use; it lowers them with the click every toggle sounds
  const heard = [];
  bus.on('ui:strikeViewToggle', () => heard.push('toggle'));
  support.dispatchEvent(new Event('click'));
  assert.deepEqual(heard, ['toggle']);
  strikeView.open = false;
  hud.update(air, aim, P, 'alpha', 10.2, true, 'X');
  assert.equal(support.getAttribute('aria-label'), labels.view, 'down again, Support raises them');
}

// ---- the styles: no standalone close; Support keeps its box with the binoculars up
/** The style problems in a stylesheet: a standalone close, or a rule that moves or sizes Support (or its seat) only
 *  while the binoculars are up. */
function styleProblems(css) {
  const problems = [];
  if (css.includes('binocular-close')) problems.push('a .binocular-close rule');
  const BOX = /(^|;|\{)\s*(position|left|right|top|bottom|inset|width|height|margin[\w-]*|transform|translate|display)\s*:/;
  for (const [, selector, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const up = /data-selected=true|data-cot-strike-view|is-raising/.test(selector);
    const slot = /strike-support(?![\w-])(?!\s*\.)|cot-strike-dock/.test(selector.replace(/\s+/g, ' '));
    if (up && slot && BOX.test(`;${body}`)) problems.push(`moves Support with the binoculars up: ${selector.trim()}`);
  }
  return problems;
}
const css = readFileSync('src/ui/airSupportHud.css', 'utf8');
assert.deepEqual(styleProblems(css), [], 'the shipped styles');
// the negative control: the old rules (integ/276 fb0f3aba6a)
assert.deepEqual(styleProblems('.binocular-call,.binocular-close{display:none;pointer-events:auto}'), ['a .binocular-close rule']);
assert.equal(styleProblems('html[data-cot-strike-view] .cot-strike-dock{top:40px}').length, 1, 'a seat moved under the binoculars fails');
assert.equal(styleProblems('.strike-support[data-selected=true]{width:80px}').length, 1, 'a slot resized while up fails');
// the HUD's module and the air-support capture tool no longer name the old button (its negative control is
// air-support-close-box.mjs putBackOldClose, the one place that does)
for (const file of ['src/ui/airSupportHud.ts', 'tools/air-support-shots.mjs']) {
  assert.ok(!readFileSync(file, 'utf8').includes('binocular-close'), `${file} names .binocular-close`);
}

console.log('air-support-close-box selftest: PASS');
