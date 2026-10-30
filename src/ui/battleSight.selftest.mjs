// battle-camera-264: the arcade sight's place (battleSight.ts) and the HUD's sight bands that follow it. The chase
// framing's lens shift raises the battle sight over the screen centre (the reticle is the aim point's projection there);
// the notice planners, the countdown and a portrait phone's systems row keep clear of the risen sight, the scope's keep-outs
// stay on the centre, and the layout's rise cap holds its own sight-led places.
import assert from 'node:assert/strict';
import { battleBands, battleSightShift, battleSightY, onBattleSightShift, publishBattleBands, setBattleSightShift } from './battleSight.ts';
import { touchSightKeepOut, planTouchNotices } from './touchNoticePlan.ts';
import { mouseReticleFootprint, planMouseNotices } from './mouseNoticePlan.ts';
import { placeCountdown, SIGHT_CLEAR_PX, MARKS_BELOW_PX } from './countdownPlace.ts';
import { portraitSightClearTop, portraitSightRiseCap, SIGHT_BAND_ABOVE, SIGHT_BAND_BELOW, SCOPE_BAND_BELOW } from './battleHudLayout.ts';

// 1. the datum: whole px, a change notifies, equal bands keep their identity
{
  let calls = 0;
  const off = onBattleSightShift(() => calls++);
  assert.equal(battleSightShift(), 0);
  assert.equal(battleSightY(900), 450, 'the centre by default');
  setBattleSightShift(54.4);
  assert.equal(battleSightShift(), 54);
  assert.equal(battleSightY(900), 396);
  setBattleSightShift(54.2);
  assert.equal(calls, 1, 'an unchanged rise notifies nothing');
  setBattleSightShift(-20);
  assert.equal(battleSightY(900), 470, 'a framing that lowers the picture lowers the sight');
  setBattleSightShift(0);
  off();
  const a = { width: 800, height: 600, touch: false, floor: [{ x0: 1, y0: 500, x1: 9, y1: 520 }], ceiling: 40 };
  publishBattleBands(a);
  publishBattleBands({ ...a, floor: [{ ...a.floor[0] }] });
  assert.equal(battleBands(), a, 'equal bands keep their identity (the rig re-solves on a change only)');
  publishBattleBands({ ...a, transient: [{ x0: 0, y0: 450, x1: 9, y1: 490 }] });
  assert.notEqual(battleBands(), a, 'a transient strip is a change');
  publishBattleBands({ ...a, riseCap: 20 });
  assert.equal(battleBands().riseCap, 20);
}

const bottom = (boxes) => Math.max(...boxes.map((b) => b.y1));
const top = (boxes) => Math.min(...boxes.map((b) => b.y0));

// 2. touch: the battle footprint moves with the sight, the scope's stays on the centre
{
  const [w, h, rise] = [844, 390, 53];
  const centred = touchSightKeepOut(w, h, false, true);
  const risen = touchSightKeepOut(w, h, false, true, h / 2 - rise);
  assert.equal(risen.length, centred.length);
  risen.forEach((box, i) => {
    assert.equal(box.y0, centred[i].y0 - rise, 'each battle box rises with the sight');
    assert.equal(box.y1, centred[i].y1 - rise);
  });
  assert.deepEqual(touchSightKeepOut(w, h, true, true, h / 2 - rise), touchSightKeepOut(w, h, true, true), 'the scope stays on the centre');
  // a plan with the countdown keeps the dial over the risen crosshair, and the notices off its footprint
  const base = { width: w, height: h, top: 78, obstacles: [], soft: [], scope: false, seated: false, notice: { w: 136, h: 32 },
    alert: { w: 136, h: 40 }, countdown: { w: 164, h: 150 }, countdownRules: null, banner: null, fallbackTop: 90 };
  const plan = planTouchNotices({ ...base, sightY: h / 2 - rise });
  assert.ok(plan.countdownTop + 150 * plan.countdownScale <= h / 2 - rise || plan.dialOverSight,
    'the dial sits over the risen crosshair (or is marked over it where nothing clears)');
  const free = planTouchNotices({ ...base, countdown: null, sightY: h / 2 - rise });
  if (free.cleared) {
    const keep = touchSightKeepOut(w, h, false, false, h / 2 - rise);
    for (const y of [free.noticeTop]) {
      const box = { x0: w / 2 - 68, y0: y, x1: w / 2 + 68, y1: y + 32 };
      assert.ok(keep.every((k) => k.y1 <= box.y0 || k.y0 >= box.y1 || k.x1 <= box.x0 || k.x0 >= box.x1), 'the notice keeps off the risen footprint');
    }
  }
}

// 3. mouse: tiers 0 and 1 are the battle sight's, risen; tier 2 keeps both the risen sight and the scope's centre
{
  const [w, h, rise] = [1280, 720, 68];
  const at = (tier, sightY) => mouseReticleFootprint(w, h, tier, [], undefined, sightY);
  const circles = (out) => out.filter((k) => 'r' in k).map((k) => k.cy);
  assert.deepEqual(circles(at(0, h / 2 - rise)), [h / 2 - rise], 'the resting sight is the risen one');
  assert.deepEqual(circles(at(2, h / 2 - rise)), [h / 2 - rise, h / 2], 'everything either sight draws: both centres');
  assert.deepEqual(circles(at(2)), [h / 2], 'unrisen: one sight, as before');
  const plan = planMouseNotices({ width: w, height: h, top: 44, obstacles: [], furniture: [], lanes: [null, null], smallAlert: false,
    countdown: { w: 164, h: 150 }, countdownRules: { w: 300, h: 40 }, revive: null, medal: { w: 380, h: 85 }, medalCompact: { w: 250, h: 40 },
    sightY: h / 2 - rise });
  const dial = plan.countdown;
  assert.ok(dial && dial.y + dial.h <= h / 2 - rise - SIGHT_CLEAR_PX, 'the countdown keeps over the risen sight');
  // the notices keep off the resting risen sight
  const resting = at(0, h / 2 - rise);
  for (const n of [plan.detection, plan.alert].filter(Boolean)) {
    const box = 'w' in n ? { x0: n.x - (n.small !== undefined ? n.w / 2 : 0), y0: n.y, x1: n.x + (n.small !== undefined ? n.w / 2 : n.w), y1: n.y + n.h } : null;
    if (!box) continue;
    for (const k of resting) {
      if ('r' in k) assert.ok(box.y1 <= k.cy - k.r || box.y0 >= k.cy + k.r || box.x1 <= k.cx - k.r || box.x0 >= k.cx + k.r,
        'a notice keeps off the risen resting ring');
    }
  }
}

// 4. the countdown: over the given sight, its rules under the given sight's marks
{
  const [w, h] = [1440, 900];
  const sightY = 396;
  const place = placeCountdown(w, h, 44, { w: 164, h: 150 }, { w: 300, h: 40 }, [], 8, false, 1, sightY);
  assert.ok(place.top + 150 * place.scale <= sightY - SIGHT_CLEAR_PX, 'the dial over the risen sight');
  assert.ok(place.rulesShown && place.rulesTop >= sightY + MARKS_BELOW_PX, 'the rules under its marks');
  const centred = placeCountdown(w, h, 44, { w: 164, h: 150 }, { w: 300, h: 40 }, [], 8, false, 1);
  assert.ok(place.top < centred.top, 'higher than over the centre');
}

// 5. a portrait phone's systems row: kept off the risen sight's band (the scope's band stays the centre's), and the
// layout's rise cap stops the sight short of leaving the row over the tank
{
  const c = 422, rowH = 44, ceiling = 208, floor = 600;
  // unrisen: as before
  assert.equal(portraitSightClearTop(416, rowH, c, floor, ceiling), portraitSightClearTop(416, rowH, c, floor, ceiling, c));
  // risen 40: the row the band crosses moves over the risen ring
  const sy = c - 40;
  const placed = portraitSightClearTop(416, rowH, c, floor, ceiling, sy);
  assert.ok(placed + rowH <= sy - SIGHT_BAND_ABOVE || placed >= Math.max(c + SCOPE_BAND_BELOW, sy + SIGHT_BAND_BELOW),
    `the row clears the risen band (${placed})`);
  const cap = portraitSightRiseCap(416, rowH, c, ceiling);
  assert.equal(cap, Math.min(c + SIGHT_BAND_BELOW - 416 - 1, c - SIGHT_BAND_ABOVE - rowH - ceiling), 'the cap: the band still crosses the row, its place over the ring fits');
  // at the cap the row still moves off the band; past it the band would leave the row under the sight
  const atCap = portraitSightClearTop(416, rowH, c, floor, ceiling, c - cap);
  assert.ok(atCap + rowH <= c - cap - SIGHT_BAND_ABOVE, 'at the cap the row still seats over the ring');
  assert.equal(portraitSightClearTop(416, rowH, c, floor, ceiling, c - cap - 2), 416, 'past it the band no longer crosses the row');
  assert.equal(portraitSightRiseCap(c + SIGHT_BAND_BELOW + 4, rowH, c, ceiling), Infinity, 'a row under the band never moves for the sight');
}

// 6. the sight's projection follows the window: hud.ts measures again once responsiveLayout.ts has sized the HUD's root
// (a rotated phone kept the old width, its reticle off the aim point, until the next resize)
{
  const { readFileSync } = await import('node:fs');
  const hud = readFileSync(new URL('./hud.ts', import.meta.url), 'utf8');
  assert.match(hud, /window\.addEventListener\('cot:layoutchange', resize\);/, 'the HUD re-measures on the layout change');
}

console.log('battleSight.selftest: the sight datum, the touch and mouse keep-outs, the countdown and the portrait row follow the risen sight; the scope stays centred');
