// Centre notices and the pre-battle countdown on touch screens (verifier 2026-10-15: on 390 x 844 the action dock
// pushed the alert to 11 px above the aim point and the countdown across the crosshair; main puts them on the
// crosshair of most phones). For every touch viewport of the rendered receipt (touchActionDock.fixture.json, measured
// in Chromium), with and without the objective plate, and 1-7 vehicle controls, the plan (centreNotices.ts
// planTouchCentre, the layout owner's own call) must place detection, the alert and the countdown:
// - on screen, clear of every touch control, instrument and the gun-limit warning's place, and of the dock's tiles;
// - clear of the widest of the reticle's keep-outs the screen allows (reticleTiers: crosshair core, battle sight at
//   full bloom, everything either sight draws at any bloom), pinned per viewport below, and never pushed by the feeds;
// - from inputs that never include the feeds or the notices' text (the lane does not move while notices come and go).
// The rendered receipt (tools/battle-hud-layout.browser.mjs) measures the real boxes against the same keep-outs, on
// this branch and on main.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { touchAimKeepOut, touchAimWarningSlot, touchReticleFootprint } from './touchActionDock.ts';
import {
  COMPACT_NOTICES, NOTICE_GAP_PX, alertReserve, placeCountdownLane, placeNoticeLane, planTouchCentre, reticleClearance, reticleTiers,
} from './centreNotices.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const VIEWPORTS = JSON.parse(read('./touchActionDock.fixture.json'));
const css = read('./battleHudLayout.css');
const layout = read('./battleHudLayout.ts');
const HARD = /^(joy|fire|fireAlt|scope|autoaim|chrome|con\d|ammo)$/;
const overlaps = (a, b, gap = 0) => a.x < b.x + b.w + gap && a.x + a.w > b.x - gap && a.y < b.y + b.h + gap && a.y + a.h > b.y - gap;

// The keep-outs nest: the core within the battle sight within the full footprint.
for (const [w, h] of [[360, 640], [390, 844], [844, 390], [568, 256], [1024, 768]]) {
  const [core, battle, full] = reticleTiers(w, h);
  assert.equal(core[0].r, 32, `${w}x${h}: the core is the 64 px round the aim point`);
  assert.equal(battle[0].r, Math.max(32, Math.ceil(.15 * Math.min(w, h))), `${w}x${h}: the battle sight is the ring at full bloom`);
  assert.deepEqual(full, touchReticleFootprint(w, h), `${w}x${h}: the widest is everything the reticle draws`);
  assert.deepEqual(core[1], full[3], 'the magazine and reload stack under the aim point is in every keep-out');
  assert.deepEqual(battle[0], full[0]);
}

// The widest keep-out each viewport's notices and countdown clear, in every state: 3 everything, 2 the battle sight at
// full bloom, 1 the crosshair core, 0 none (568 x 256 has no clear place left between its objective plate, joystick,
// drive gauge and consumables: there the compact notices go where they cover the least). Main, measured on
// 2026-10-15 in the same states, clears 0 on every phone (the feeds push the notices down onto the crosshair), 1 on
// 390 x 844 and 768 x 1024, 2 on 1024 x 768; its countdown 0 on every phone.
const CLEARANCE = {
  'small-phone': [3, 3], phone: [3, 3], landscape: [3, 3], 'small-landscape': [3, 3], 'narrow-phone': [2, 3],
  'short-landscape': [0, 0], 'tiny-landscape': [1, 2], 'browser-landscape': [3, 3], 'wide-landscape': [3, 3], tablet: [3, 3],
  'tablet-portrait': [3, 3],
};
function centreInputs(viewport, objective, count) {
  const { width, height } = viewport;
  const o = structuredClone(viewport.obstacles);
  const scoreBottom = o.top.y + o.top.h;
  if (!objective) {
    delete o.mode;
    if (width < height && width < 520) { o.chrome.y = scoreBottom + 8; o.minimap.y = Math.max(108, scoreBottom + 8); }
  }
  const objectiveBottom = objective ? o.mode.y + o.mode.h : scoreBottom;
  const minimapBottom = o.minimap.y + o.minimap.h;
  return { width, height, top: objectiveBottom + 8, count,
    controls: Object.entries(o).filter(([k]) => HARD.test(k)).map(([, r]) => r),
    instruments: Object.entries(o).filter(([k]) => !HARD.test(k) && k !== 'ammoDrawerOpen').map(([, r]) => r),
    drawer: o.ammoDrawerOpen ? [o.ammoDrawerOpen] : [], lanes: [touchAimWarningSlot(width, height, minimapBottom)],
    keepOut: touchAimKeepOut(width, height, minimapBottom),
    anchor: { x: (o.joy.x * 2 + o.joy.w + o.fire.x * 2 + o.fire.w) / 4, y: (o.joy.y * 2 + o.joy.h + o.fire.y * 2 + o.fire.h) / 4 },
    detection: viewport.centre.detection, alert: alertReserve(width, viewport.centre.alertLine), countdown: viewport.centre.countdown };
}
const rows = [];
let plans = 0;
for (const viewport of VIEWPORTS) {
  const name = viewport.cases[0];
  const [noticeFloor, countdownFloor] = CLEARANCE[name];
  let worstNotices = 3, worstCountdown = 3;
  for (const objective of [true, false]) {
    for (let count = 1; count <= 7; count++) {
      const input = centreInputs(viewport, objective, count);
      const plan = planTouchCentre(input);
      plans++;
      const label = `${name} ${objective ? 'objective' : 'standard'} x${count}`;
      const { notices, countdown, dock } = plan;
      assert.ok(notices && countdown && dock, `${label}: the plan places the notices, the countdown and the dock`);
      const boxes = [['detection', notices.detection], ['alert', notices.alert], ['countdown', countdown]];
      for (const [what, r] of boxes) {
        assert.ok(r.x >= 12 - 1e-6 && r.y >= input.top - 1e-6 && r.x + r.w <= viewport.width - 12 + 1e-6 && r.y + r.h <= viewport.height - 12 + 1e-6,
          `${label}: the ${what} stays on screen, below the objective`);
        for (const o of [...input.controls, ...input.instruments, ...input.lanes]) {
          assert.ok(!overlaps(r, o, NOTICE_GAP_PX - 1e-6), `${label}: the ${what} keeps ${NOTICE_GAP_PX} px off a control, an instrument or the gun-limit warning's place`);
        }
        if (!dock.inLane) for (const t of dock.tiles) assert.ok(!overlaps(r, t), `${label}: the ${what} never lies on a dock tile`);
      }
      assert.ok(!overlaps(notices.detection, notices.alert), `${label}: detection and the alert never overlap`);
      // The plan's own clearance is the boxes' real one.
      assert.equal(reticleClearance(viewport.width, viewport.height, [notices.detection, notices.alert]), notices.clearance, `${label}: notices clearance`);
      assert.equal(reticleClearance(viewport.width, viewport.height, [countdown]), countdown.clearance, `${label}: countdown clearance`);
      worstNotices = Math.min(worstNotices, notices.clearance);
      worstCountdown = Math.min(worstCountdown, countdown.clearance);
      // Compact only where no full-size place clears as much (placeNoticeLane tries full size first at each level).
      if (notices.compact) {
        const full = placeNoticeLane({ width: viewport.width, height: viewport.height, top: input.top,
          obstacles: [...input.controls, ...input.instruments, ...input.lanes, ...(plan.order === 'dock' ? dock.tiles : [])],
          detection: { ...input.detection, h: input.detection.h }, alert: input.alert });
        assert.equal(full.compact, true, `${label}: compact notices only where full-size ones clear less`);
      }
    }
  }
  assert.ok(worstNotices >= noticeFloor, `${name}: the notices clear keep-out ${noticeFloor} in every state (worst ${worstNotices})`);
  assert.ok(worstCountdown >= countdownFloor, `${name}: the countdown clears keep-out ${countdownFloor} in every state (worst ${worstCountdown})`);
  rows.push(`${name} notices >= ${worstNotices}, countdown >= ${worstCountdown}`);
}

// The verifier's counterexample (390 x 844, en and zh): the alert's bottom 11 px above the aim point, the countdown
// over the crosshair (333-469). Now both clear everything the reticle draws, with all five to seven controls docked.
{
  const phone = VIEWPORTS.find((v) => v.cases.includes('phone') && v.cases.includes('chinese-phone'));
  for (let count = 5; count <= 7; count++) {
    const { notices, countdown, dock } = planTouchCentre(centreInputs(phone, true, count));
    assert.equal(notices.clearance, 3);
    assert.equal(countdown.clearance, 3);
    assert.ok(notices.alert.y + notices.alert.h < 327, '390 x 844: the alert ends above the scope\'s arm at full bloom (y 327)');
    assert.ok(countdown.y + countdown.h < 327, '390 x 844: so does the countdown');
    assert.equal(dock.more, false, '390 x 844: every control stays on the dock');
  }
}

// Unit cases. An open screen: the notices stack centred right under the objective, at full size.
{
  const lane = placeNoticeLane({ width: 1000, height: 1000, top: 100, obstacles: [], detection: { w: 200, h: 40 }, alert: { w: 240, h: 40 } });
  assert.deepEqual([lane.arrangement, lane.compact, lane.clearance, lane.detection.y, lane.detection.x + lane.detection.w / 2, lane.alert.x + lane.alert.w / 2],
    ['stack', false, 3, 100, 500, 500]);
  assert.equal(lane.alert.y, 100 + 40 + NOTICE_GAP_PX);
}
// An instrument at the top centre: a shallow one moves the stack down past it, a tall one sideways (each the cheaper).
{
  const shallow = placeNoticeLane({ width: 1000, height: 1000, top: 100, obstacles: [{ x: 380, y: 90, w: 100, h: 30 }], detection: { w: 200, h: 40 }, alert: { w: 200, h: 40 } });
  assert.deepEqual([shallow.detection.y, shallow.detection.x], [90 + 30 + NOTICE_GAP_PX, 400]);
  const tall = placeNoticeLane({ width: 1000, height: 1000, top: 100, obstacles: [{ x: 380, y: 0, w: 60, h: 300 }], detection: { w: 200, h: 40 }, alert: { w: 200, h: 40 } });
  assert.deepEqual([tall.detection.y, tall.detection.x], [100, 380 + 60 + NOTICE_GAP_PX]);
}
// The objective close above the ring (a landscape phone): the notices flank the reticle's column on one line.
{
  const lane = placeNoticeLane({ width: 844, height: 390, top: 111, obstacles: [], detection: { w: 214, h: 32 }, alert: { w: 200, h: 40 } });
  assert.deepEqual([lane.arrangement, lane.clearance, lane.detection.y, lane.alert.y], ['flank', 3, 111, 111]);
  assert.ok(lane.detection.x + lane.detection.w <= 422 && lane.alert.x >= 422, 'detection left of the centre, the alert right of it');
}
// No room for full-size notices clear of the reticle: compact ones (the 299 px landscape type) where they fit.
{
  const lane = placeNoticeLane({ width: 568, height: 320, top: 70, obstacles: [{ x: 0, y: 0, w: 120, h: 320 }, { x: 448, y: 0, w: 120, h: 320 }],
    detection: { w: 214, h: 32 }, alert: { w: 260, h: 43 } });
  assert.equal(lane.compact, true);
  assert.deepEqual([lane.detection.w, lane.alert.w], [COMPACT_NOTICES.detection.w, COMPACT_NOTICES.alert.w]);
}
// No place clears even the crosshair core: the compact notices where they cover the least of the reticle.
{
  const lane = placeNoticeLane({ width: 300, height: 200, top: 60, obstacles: [], detection: { w: 136, h: 32 }, alert: { w: 134, h: 28 } });
  assert.equal(lane.clearance, 0);
  assert.ok(lane.cover > 0);
  const centred = { x: 150 - 60, y: 84, w: 120, h: 32 };
  assert.ok(reticleClearance(300, 200, [centred]) === 0);
}
// The countdown scales down before it moves far, and takes its compact line last.
{
  const big = placeCountdownLane({ width: 1400, height: 1000, top: 100, obstacles: [], box: { w: 390, h: 136 } });
  assert.deepEqual([big.scale, big.compact, big.clearance], [1, false, 3]);
  const squeezed = placeCountdownLane({ width: 568, height: 320, top: 100, obstacles: [{ x: 0, y: 0, w: 140, h: 320 }, { x: 428, y: 0, w: 140, h: 320 }],
    box: { w: 390, h: 136 } });
  assert.ok(squeezed.scale < 1 || squeezed.compact, 'a tight screen gets a smaller countdown');
}
// The plan prefers clearer notices, then more controls on the dock, then 48 px tiles: never trading the reticle away.
{
  const v = VIEWPORTS.find((viewport) => viewport.cases.includes('small-phone'));
  const plan = planTouchCentre(centreInputs(v, true, 6));
  assert.equal(plan.notices.clearance, 3, '360 x 640: the notices clear everything the reticle draws');
  assert.equal(plan.dock.more, false, '360 x 640: and all six controls stay on the dock');
}

// The stylesheet places what the plan says: each notice's centre x, top and width; flanking alerts by their left edge;
// compact type; the countdown's centre x, top and scale, or its one compact line.
for (const pattern of [
  /\[data-hud-notices\] \.cot-sixth\{left:var\(--hud-notice-x\);top:var\(--hud-notice-top\);width:var\(--hud-notice-w\);max-width:var\(--hud-notice-w\);transform:translate\(-50%,-6px\)\}/,
  /\[data-hud-notices\] \.cot-sixth\.on\{transform:translate\(-50%,0\)\}/,
  /\[data-hud-notices\] \.cot-alert\{left:var\(--hud-alert-x\);top:var\(--hud-alert-top\);bottom:auto;width:max-content;max-width:var\(--hud-alert-w\);/,
  /\[data-hud-notices\]\[data-hud-notices-flank\] \.cot-alert\.show\{transform:translate\(0,0\)\}/,
  /\[data-hud-notices\] \.cot-alert-copy\{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;/,
  /\[data-hud-notices='compact'\] \.cot-sixth \.sub\{display:none\}/,
  /(?:\[data-hud-countdown\]){4} \.cot-prebattle\{left:var\(--hud-countdown-x\);top:var\(--hud-countdown-top\);transform:translateX\(-50%\) scale\(var\(--hud-countdown-scale,1\)\);transform-origin:50% 0\}/,
  /(?:\[data-hud-countdown='compact'\]){4} \.cot-prebattle\{width:var\(--hud-countdown-w\);height:40px;/,
]) assert.match(css, pattern);
// The layout feeds the plan fixed inputs, never the feeds or the notices' copy, and the feeds make room for the lane.
assert.match(layout, /centrePlan = planTouchCentre\(\{ width, height, top: top \+ 8, count: controls\.length, controls: dockControls,/);
assert.match(layout, /alert: alertReserve\(width, alert\?\.offsetHeight \|\| 38\),/);
assert.match(layout, /if \(noticeLane && noticeShown\) \{\n\s*for \(const box of \[noticeLane\.detection, noticeLane\.alert\]\) \{\n\s*if \(box\.x < sideWidth \+ 12\) noticeFloorLeft/);
assert.doesNotMatch(layout, /portraitNoticeTop|dockNoticeTop|portraitCountdownTop/, 'no notice is pushed down by the dock or the feeds any more');

console.log(`centreNotices: ${plans} plans (${VIEWPORTS.length} touch sizes x objective/standard x 1-7 controls): notices, alert and countdown on screen, off every control, instrument, warning place and tile, as clear of the reticle as each screen allows:\n  ${rows.join('\n  ')}`);
