// aerialHitMark.selftest.mjs — (lane ac130-fx-228 r3, the critic's "tan wash while the 30 mm fires", on the base build
// too) through the gunship's lens the full-screen sight canvas held nothing but the hit-confirm mark, and in the films the
// compositor showed it for a frame or two as one magnified patch of the mark's centre spark: a flat cream veil (the
// spark's cream over its dark under-stroke, to within 1 % at day and night) over the lens and the gunship's console. The
// gunship's mark now draws into its own small canvas on the sight. This receipt pins the routing (the gunship never draws
// the mark on the full-screen canvas; the ground sight keeps it), that the mark draws only through the context it is
// given, that the box holds the mark at every age, and that the mark canvas follows every rule that hides the sight.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hitConfirmVisualState, HIT_CONFIRM_LIFETIME_S } from './hud.ts';

const hud = readFileSync(new URL('./hud.ts', import.meta.url), 'utf8');
const fnBody = (name) => {
  const start = hud.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, `hud.ts keeps ${name}`);
  const next = hud.indexOf('\n  function ', start + 10);
  const comment = hud.lastIndexOf('\n  //', next);
  return hud.slice(start, comment > start ? comment : next);
};

// the routing: in the gunship the mark goes to its own canvas, the full-screen sight only on the ground
const render = fnBody('renderCanvas');
assert.match(render, /if \(aerial\) paintAerialHitMark\(lastTimeS\);\s*else \{ hideAerialHitMark\(\); drawHitMark\(ctx, aimView\.cx, aimView\.cy, lastTimeS\); \}/,
  'renderCanvas draws the gunship\'s mark on its own canvas and the ground mark on the sight');
assert.equal((hud.match(/drawHitMark\(ctx\b/g) ?? []).length, 1, 'the full-screen sight receives the mark from the ground branch alone');
const paint = fnBody('paintAerialHitMark');
assert.match(paint, /drawHitMark\(markCtx, HIT_MARK_BOX_PX \/ 2, HIT_MARK_BOX_PX \/ 2, timeS\)/, 'the gunship\'s mark is drawn about the centre of its own canvas');
assert.match(paint, /markCanvas\.style\.transform = `translate\(\$\{x\}px,\$\{y\}px\)`/, 'the mark canvas is placed on the sight');
// the mark draws only through the context it is given: nothing in it can reach the full-screen canvas
const mark = fnBody('drawHitMark');
assert.doesNotMatch(mark, /\bctx\b/, 'drawHitMark never touches the full-screen sight context directly');
assert.doesNotMatch(mark, /\bview\./, 'drawHitMark is placed by its centre argument, never by the sight\'s aim view');

// the box holds the mark at every age (the shards' far tip with the dark pad, the blocked-round diamond, their strokes)
const box = Number(hud.match(/^const HIT_MARK_BOX_PX = (\d+);/m)?.[1]);
assert.ok(box > 0, 'hud.ts keeps HIT_MARK_BOX_PX');
let reach = 0;
for (const reduced of [false, true]) {
  for (let age = 0; age <= HIT_CONFIRM_LIFETIME_S; age += 0.005) {
    const v = hitConfirmVisualState(age, reduced);
    if (v.visible) reach = Math.max(reach, v.radius + v.length + 2.1 + 1.6);
  }
}
const diamond = Math.hypot(30 + 6, 30 + 7) + 1.5;
assert.ok(box / 2 >= Math.max(reach, Math.hypot(reach * Math.SQRT1_2, reach * Math.SQRT1_2)) && box / 2 * Math.SQRT2 >= diamond,
  `the ${box} px box holds the mark (shards reach ${reach.toFixed(1)} px, the diamond ${diamond.toFixed(1)} px at the diagonal)`);

// the mark canvas follows every rule that hides the sight
const css = readFileSync(new URL('./battleUiVisibility.css', import.meta.url), 'utf8');
const shot = readFileSync(new URL('./shotInfo.ts', import.meta.url), 'utf8');
assert.match(hud, /body\.cot-spectating \.cot-ret,body\.cot-spectating \.cot-hitmark\{display:none !important;\}/, 'hidden while spectating');
assert.match(shot, /body\.cot-si-report \.cot-ret,body\.cot-si-report \.cot-hitmark\{display:none !important;\}/, 'hidden under the battle report');
assert.match(css, /\.cot-hud > :not\(\.cot-ret,\.cot-hitmark,/, 'kept with the sight when the battle UI hides');
assert.equal((hud.match(/ctx\.clearRect\(0, 0, w, h\); hideAerialHitMark\(\);/g) ?? []).length
  + (hud.match(/ctx\.clearRect\(0, 0, w, h\);\n\s+hideAerialHitMark\(\);/g) ?? []).length, 2, 'cleared with the sight when the HUD hides');
console.log(`aerialHitMark: the gunship's hit-confirm mark draws in its own ${box} px canvas on the sight (reach ${reach.toFixed(1)} px), never on the full-screen sight; the ground sight unchanged`);
