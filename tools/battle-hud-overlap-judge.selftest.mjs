// battle-hud-overlap-judge.selftest.mjs — notices against every control, in every view (notices-276; Kevin 2026-11-23: "fix
// ui overlaps like gunship overhead with X binoculars in air support"). Copyright © 2026 Kevin B. Liu.
// - one list: the controls a view brings (src/ui/hudViewControls.ts) are what every notice planner in battleHudLayout.ts
//   keeps off (the guidance plan's controls, which seat the condition lane; the touch plan's obstacles; the mouse plan's
//   pass, which measures each where it stands) and what the layout observes, and the overlap probe measures them;
// - no view moves a notice by a rule of its own (gauntlet g4's `.cot-alert{top:212px}` under the binoculars placed the
//   alert against nothing that was there);
// - the judge (tools/battle-hud-overlap-judge.mjs) fails a notice on a control, the planted control's case among them
//   (the probe's --plant negative control, on the boxes the probe recorded at 1920x1080 binoculars+notices), passes the
//   same notices moved clear, and reads a lane held back by the guidance plan as waiting, not missing.
// The live pass is tools/battle-hud-overlap.browser.mjs --notices-only --plant (a dev server; under the capture lock).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VIEW_CONTROLS, VIEW_CONTROL_PARTS, VIEW_CONTROL_SELECTOR } from '../src/ui/hudViewControls.ts';
import { GUIDANCE_CONTROLS, TOUCH_NOTICE_OBSTACLES } from '../src/ui/battleHudLayout.ts';
import { FEED, INSTRUMENTS, NOTICES, PLANTS, PLANT_SELECTOR, noticeCoverage, overlapProblems } from './battle-hud-overlap-judge.mjs';

// ---- one list, every planner
{
  const selectors = (list) => list.split(',').map((s) => s.trim());
  for (const control of VIEW_CONTROLS) {
    assert.ok(selectors(GUIDANCE_CONTROLS).includes(control), `the guidance plan (the condition lane) keeps off ${control}`);
    assert.ok(selectors(TOUCH_NOTICE_OBSTACLES).includes(control), `the touch plan keeps off ${control}`);
    assert.ok(INSTRUMENTS.includes(control), `the probe measures ${control}`);
    // its own element (the last compound's first class) is observed, so its coming and going replans
    const own = control.split(' ').at(-1).match(/^\.([\w-]+)/)[1];
    assert.ok(selectors(VIEW_CONTROL_PARTS).includes(`.${own}`), `the layout observes .${own}`);
  }
  for (const notice of NOTICES) assert.ok(INSTRUMENTS.includes(notice), `the probe measures ${notice}`);
  for (const feed of FEED) assert.ok(INSTRUMENTS.includes(feed), `the probe measures ${feed}`);
  const layout = readFileSync('src/ui/battleHudLayout.ts', 'utf8');
  assert.match(layout, /for \(const node of hudQueryAll\(VIEW_CONTROL_SELECTOR\)\) add\(shownBox\(node\)\);/, 'the mouse plan measures every view control');
  assert.match(layout, /observe\(VIEW_CONTROL_PARTS\);/, 'the layout observes the view controls');
  // the feed against the same boxes: each kill lane's floor, and the ribbon's top
  assert.match(layout, /controlFloor\(leftAnchor, 0, leftReach\)/, 'the left kill lane ends over a view control');
  assert.match(layout, /controlFloor\(rightAnchor, rightReach, width\)/, 'the right kill lane ends over a view control');
  assert.match(layout, /const laneControls = touch && scopeVision \? \[\.\.\.viewControls, scopeVision\] : viewControls;/,
    'a touch lane ends over the scope\'s vision plate too');
  // the alert's new height replans (the touch plan seats the condition lane under it at the height it shows)
  assert.match(layout, /if \(target\.classList\?\.contains\('cot-alert'\)\) \{\s*const height = \(target as HTMLElement\)\.offsetHeight \?\? 0;\s*if \(height > 0 && Math\.abs/,
    'a new alert height is a plan input, from a resize or a mutation alike');
  assert.match(layout, /for \(const box of \[\.\.\.viewControls\]\.sort[\s\S]{0,240}ribbonTop = box\.top;/, 'the ribbon rests over a view control');
  // (the old escape: the flight console dropped where keeping off it cost the reticle clearance)
  assert.doesNotMatch(layout, /plainObstacles|obstacles\.slice\(0, plain/, 'no plan drops a view control to keep the reticle clear');
  assert.ok(VIEW_CONTROL_SELECTOR.includes('.binocular-readout'), 'the binoculars\' readout is a view control');
  // the probe's planted controls: one the planners read, one none does
  assert.ok(VIEW_CONTROLS.some((c) => c.startsWith(`.${PLANTS.seen}`)), 'the seen plant carries a view control\'s class');
  assert.ok(!`${GUIDANCE_CONTROLS},${TOUCH_NOTICE_OBSTACLES},${layout}`.includes(PLANTS.unseen), 'no planner reads the unseen plant');
}

// ---- no view moves a notice by a rule of its own
{
  for (const sheet of ['src/ui/airSupportHud.css', 'src/ui/aerialHud.css']) {
    const css = readFileSync(sheet, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/\.cot-alert|\.cot-battle-notices|\.cot-sixth/.test(selector)) continue;
      assert.doesNotMatch(body, /(^|;)\s*(top|left|right|bottom|inset|translate|transform)\s*:/,
        `${sheet}: ${selector.trim()} places a notice by hand; the planners place it (hudViewControls.ts)`);
    }
  }
  // the check fails the old rule
  const old = 'html[data-cot-strike-view] body[data-hud-notices]:not(.cot-touch-layout) .cot-alert{top:212px}';
  assert.ok(/\.cot-alert/.test(old) && /(^|;)\s*top\s*:/.test(old.split('{')[1]), 'the style check reads the old rule');
}

// ---- the judge, on the boxes the probe records (1920x1080, the binoculars up, both lanes' notices)
{
  const box = (selector, name, x, y, w, h) => ({ selector, name, x, y, right: x + w, bottom: y + h });
  const readout = box('.cot-binoculars:not([hidden]) .binocular-readout', 'div.binocular-readout', 760, 116, 400, 40);
  const top = box('.cot-top', 'div.cot-top', 760, 8, 400, 64);
  const rack = box('.cot-strike-rack:not([hidden])', 'section.cot-strike-rack', 788, 760, 344, 64);
  const alertClear = box('.cot-alert.show', 'div.cot-alert.show', 810, 220, 300, 44);
  const conditionClear = box('.cot-battle-notices .cot-c-notice', 'div.cot-c-notice.cot-air-incoming', 750, 168, 420, 40);
  const clear = [top, readout, rack, alertClear, conditionClear];
  assert.deepEqual(overlapProblems(clear, 1920, 1080), [], 'the notices clear of the binoculars pass');
  assert.deepEqual(noticeCoverage(clear, 'toasts'), { event: 'shown', condition: 'shown' });

  // the reported case: "Gunship overhead" seated under the score, on the readout
  const onReadout = box('.cot-battle-notices .cot-c-notice', 'div.cot-c-notice.cot-air-incoming', 750, 104, 420, 40);
  const problems = overlapProblems([top, readout, rack, alertClear, onReadout], 1920, 1080);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^notice div\.cot-c-notice\.cot-air-incoming on div\.binocular-readout \(400 x 28 px\)$/, 'named as a notice on a control');

  // --plant unseen: a control the planners cannot read, planted over both notices, which therefore stay: the judge fails it
  const planted = box(PLANT_SELECTOR, `div.${PLANTS.unseen}.is-planted`, 750, 168, 420, 96);
  const caught = overlapProblems([...clear, planted], 1920, 1080).filter((p) => p.includes('planted'));
  assert.equal(caught.length, 2, 'both notices under the planted control fail');
  assert.ok(caught.every((p) => p.startsWith('notice ')), caught.join(' | '));

  // a condition the guidance plan holds back is waiting, not missing; an event lane with nothing shown is missing
  assert.deepEqual(noticeCoverage([top, readout, alertClear], 'card toasts-wait'), { event: 'shown', condition: 'waits' });
  assert.deepEqual(noticeCoverage([top, readout], ''), { event: 'missing', condition: 'missing' });

  // the feed on a control, as the probe found it before notices-276 seated the lanes (390x844, the binoculars up)
  const laneL = box('.cot-kill-lane.l', 'div.cot-kill-lane.l', 0, 222, 330, 84);
  const phoneRack = box('.cot-strike-rack:not([hidden])', 'section.cot-strike-rack', 51, 228, 279, 44);
  assert.deepEqual(overlapProblems([laneL, phoneRack], 390, 844), ['feed div.cot-kill-lane.l on section.cot-strike-rack (279 x 44 px)']);
  assert.deepEqual(overlapProblems([box('.cot-kill-lane.l', 'div.cot-kill-lane.l', 0, 222, 330, 0.5), phoneRack], 390, 844), [], 'a lane holding no rows');

  // the condition on a soft box (the feed, the map): the plan's ruled fallback only where it says no place cleared them
  // (tier 1, as at 844x390 under the drone's feed), a fault where it claims a clear place (tier 0); never on a control
  const laneR = box('.cot-kill-lane.r', 'div.cot-kill-lane.r', 500, 120, 344, 84);
  const onLane = box('.cot-battle-notices .cot-c-notice', 'div.cot-c-notice.cot-air-incoming', 212, 163, 420, 60);
  assert.deepEqual(overlapProblems([laneR, onLane], 844, 390), ['notice div.cot-c-notice.cot-air-incoming on div.cot-kill-lane.r (132 x 41 px)']);
  assert.deepEqual(overlapProblems([laneR, onLane], 844, 390, { conditionTier: 1 }),
    ['soft: notice div.cot-c-notice.cot-air-incoming on div.cot-kill-lane.r (132 x 41 px) (no place clears the soft boxes)']);
  const rackUnder = box('.cot-strike-rack:not([hidden])', 'section.cot-strike-rack', 300, 180, 200, 44);
  assert.deepEqual(overlapProblems([rackUnder, onLane], 844, 390, { conditionTier: 1 }),
    ['notice div.cot-c-notice.cot-air-incoming on section.cot-strike-rack (200 x 43 px)'], 'a control is never soft');
  const alertOnLane = box('.cot-alert.show', 'div.cot-alert.show', 600, 150, 136, 63);
  assert.ok(overlapProblems([laneR, alertOnLane], 844, 390, { conditionTier: 1 })[0].startsWith('notice '), 'the event lane is not the guidance\'s');

  // off screen, and the deliberate layering
  assert.deepEqual(overlapProblems([box('.cot-dp', 'div.cot-dp', 1900, 1000, 60, 60)], 1920, 1080), ['offscreen: div.cot-dp']);
  assert.deepEqual(overlapProblems([box('.cot-net', 'div.cot-net', 1700, 8, 120, 24), box('.cot-mp-status.battle', 'div.cot-mp-status', 1810, 8, 100, 24)], 1920, 1080), []);
}

console.log('battle-hud-overlap-judge: PASS');
