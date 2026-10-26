// The keyboard and touch judge (INTERACTION-REDESIGN.md part D, UI-GAUNTLET line 12): judgeAccess() over hand-made facts
// and Tab walks, so the page half only collects. Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';

import { ROVING_ROLES, TARGET_PX, judgeAccess } from './interaction-access.mjs';

assert.deepEqual(TARGET_PX, { phone: 44, desktop: 24 }, 'the gauntlet line 12 sizes');
for (const role of ['radiogroup', 'tablist', 'listbox']) assert.ok(ROVING_ROLES.includes(role), `${role} roves`);

const RING = 'rgb(13, 15, 18) 0px 0px 0px 2px, rgb(255, 180, 80) 0px 0px 0px 4px';
const fact = (n, extra = {}) => ({ n, element: `button.b${n}`, role: 'button', name: `Item ${n}`, width: 48, height: 48,
  disabled: false, focusable: true, tabStop: true, group: null, inline: false, ring0: { shadow: 'none', outline: 'none 0px' }, ...extra });
const stop = (n, kit = true, extra = {}) => ({ probe: n, kit, element: `button.b${n}`, shadow: kit ? RING : 'none', outline: 'none 0px', ...extra });

// a clean state: named, big enough, reached, the kit's ring
assert.deepEqual(judgeAccess({ facts: [fact(0), fact(1)] }, { kitRing: RING, stops: [stop(0), stop(1)] }, { phone: true }), []);

// names: an icon-only button with nothing to read
assert.deepEqual(judgeAccess({ facts: [fact(0, { name: '' })] }, null), ['name button.b0: no name for assistive tech (aria-label, text, alt or labelledby)']);

// targets: 44 on a phone, 24 on a desktop; a disabled control and a link in running text are exempt
const small = fact(0, { width: 40, height: 30 });
assert.equal(judgeAccess({ facts: [small] }, null, { phone: true }).length, 1);
assert.match(judgeAccess({ facts: [small] }, null, { phone: true })[0], /^target .*40x30 px, under 44 px on a phone/);
assert.deepEqual(judgeAccess({ facts: [small] }, null, { phone: false }), [], '30 px clears the desktop floor');
assert.equal(judgeAccess({ facts: [fact(0, { width: 20, height: 20 })] }, null).length, 1, '20 px fails the desktop floor');
assert.deepEqual(judgeAccess({ facts: [fact(0, { width: 10, height: 10, disabled: true, name: '' })] }, null, { phone: true }), [], 'disabled is exempt');
assert.deepEqual(judgeAccess({ facts: [fact(0, { width: 60, height: 18, inline: true })] }, null, { phone: true }), [], 'an inline link is exempt');

// reach: a roving group needs one stop; a tab stop never reached fails; a div with a click role and no tabindex fails
const radios = [fact(0, { group: 'div.seg', tabStop: true }), fact(1, { group: 'div.seg', tabStop: false })];
assert.deepEqual(judgeAccess({ facts: radios }, { kitRing: RING, stops: [stop(0)] }), [], 'one stop reaches the group');
assert.deepEqual(judgeAccess({ facts: radios }, { kitRing: RING, stops: [] }),
  ['reach button.b0 "Item 0": Tab never reaches it', 'reach button.b1 "Item 1": its group div.seg is never reached']);
assert.deepEqual(judgeAccess({ facts: [fact(0, { focusable: false, tabStop: false })] }, { kitRing: RING, stops: [] }),
  ['reach button.b0 "Item 0": not focusable: a keyboard cannot reach it']);
assert.deepEqual(judgeAccess({ facts: [fact(0, { tabStop: false })] }, { kitRing: RING, stops: [] }),
  ['reach button.b0 "Item 0": tabindex -1 outside a roving group']);
// without a walk (a phone capture) reach and rings are not judged
assert.deepEqual(judgeAccess({ facts: [fact(0, { focusable: false, tabStop: false })] }, null), []);

// mouse-only: a pointer cursor with nothing a keyboard can reach
assert.deepEqual(judgeAccess({ facts: [], pointerOnly: ['div.card'] }, null), ['mouse-only div.card: a pointer cursor with no control a keyboard can reach']);

// rings: none at all, a home-made one, and a page without the token
assert.deepEqual(judgeAccess({ facts: [fact(0)] }, { kitRing: RING, stops: [stop(0, false)] }), ['ring button.b0 "Item 0": no focus ring']);
assert.deepEqual(judgeAccess({ facts: [fact(0)] }, { kitRing: RING, stops: [stop(0, false, { outline: 'solid 2px' })] }),
  ['ring button.b0 "Item 0": a focus style that is not the kit\'s ring']);
assert.deepEqual(judgeAccess({ facts: [fact(0)] }, { kitRing: null, stops: [stop(0)] }), ['ring the page has no --focus-ring token']);

console.log('interaction-access.selftest: the name, target, reach, mouse-only and ring checks hold');
