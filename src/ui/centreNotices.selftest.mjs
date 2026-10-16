// Centre notices and the pre-battle countdown on touch screens (verifier 2026-10-15: on 390 x 844 the action dock
// pushed the alert to 11 px above the aim point and the countdown across the crosshair; main puts them on the
// crosshair of most phones; verifier 2026-10-16: the notices and the countdown then emptied the kill and incoming-damage
// feeds on every touch screen, and long alerts were clamped to two lines). For every touch viewport of the rendered
// receipt (touchActionDock.fixture.json, measured in Chromium, with main's feed lanes pinned from main 5ab143d57), with
// and without the objective plate, 1-7 vehicle controls and the feeds at their usual fill, in a burst and as the
// notifications state fills them, the plan (centreNotices.ts planTouchDock and placeTouchCentre, the layout owner's own
// calls) must place detection, the alert and the countdown:
// - on screen, clear of every touch control, instrument and the gun-limit warning's place, of the dock's tiles, and of
//   every row the feeds show, so that no feed ever shows fewer rows than on main;
// - clear of the widest of the reticle's keep-outs the screen allows (reticleTiers: crosshair core, battle sight at
//   full bloom, everything either sight draws at any bloom), pinned per viewport below, and never pushed by the feeds;
// and the dock must keep off the feeds' lanes at their fullest. The rendered receipt
// (tools/battle-hud-layout.browser.mjs) measures the real boxes against the same keep-outs and main's feeds.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { touchAimKeepOut, touchAimWarningSlot, touchReticleFootprint } from './touchActionDock.ts';
import {
  COMPACT_NOTICES, NOTICE_GAP_PX, alertReserve, placeCountdownLane, placeNoticeLane, placeTouchCentre, planTouchCentre, planTouchDock,
  reticleClearance, reticleTiers,
} from './centreNotices.ts';
import { FEED_REFERENCE, battleFeedStack, battleNotificationRows, touchFeedFloor } from './battleHudLayout.ts';

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
// 320 x 568 (round 5): 1. With the feeds' rows kept, the whole alert shown (three or four lines in 8 px type) and the
// detection's second line kept, its only room left between the minimap, the ammo rail and the ring is too short for
// both notices clear of the ring at full bloom.
const CLEARANCE = {
  'small-phone': [3, 3], phone: [3, 3], landscape: [3, 3], 'small-landscape': [3, 3], 'narrow-phone': [1, 3],
  'short-landscape': [0, 0], 'tiny-landscape': [1, 2], 'browser-landscape': [3, 3], 'wide-landscape': [3, 3], tablet: [3, 3],
  'tablet-portrait': [3, 3],
};
// The compact notices as the page measures them (battleHudLayout.ts naturalCentreSizes), widest first: on a portrait
// screen the detection keeps its second line (one line at 180 px, two at 150 and 120); the alert in 8 px type takes
// two, three and four lines at 180, 150 and 120 px for the longest alert.
function compactSizes(viewport) {
  const portrait = viewport.height > 550, d = viewport.centre.detection;
  return [[180, 32, 28], [150, 40, 37], [120, 40, 46]].map(([w, dh, ah]) => ({
    detection: { w: Math.min(d.w, portrait ? w : 120), h: portrait ? dh : 32 }, alert: { w: Math.min(w, viewport.width - 32), h: ah } }));
}
// Main's feed lanes (mainFeeds, pinned from main 5ab143d57) as the layout owner hands them on (touchFeedInputs): the
// lanes at their fullest for the dock, and the rows main shows at a fill (kills a side, incoming toasts).
function feedRects(viewport, objective, kills, toasts) {
  const { width } = viewport;
  const side = Math.min(400, width / 2 - 24);
  const m = viewport.mainFeeds[objective ? 'objective' : 'standard'];
  const [la, le] = m.left, [ra, re] = m.right;
  const lanes = [];
  if (le > la) lanes.push({ x: 0, y: la, w: side, h: le - la });
  if (re > ra) lanes.push({ x: width - side, y: ra, w: side, h: re - ra });
  const rows = [];
  const share = battleFeedStack(le - la, kills, toasts, false);
  if (share.killHeight) rows.push({ x: 0, y: la, w: side, h: share.killHeight, side: 'left', top: la });
  // The toasts share the kill feed's column floor, so they are kept clear as wide as that column.
  if (share.toastHeight) rows.push({ x: 0, y: la + share.below, w: side, h: share.toastHeight, side: 'left', top: la });
  const right = battleNotificationRows(re - ra, kills);
  if (right) rows.push({ x: width - side, y: ra, w: side, h: right * 29 - 3, side: 'right', top: ra });
  return { lanes, rows, columns: { left: [0, side, la], right: [width - side, width, ra] } };
}
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
  const feeds = feedRects(viewport, objective, FEED_REFERENCE.kills, FEED_REFERENCE.toasts);
  return { width, height, top: objectiveBottom + 8, count,
    controls: Object.entries(o).filter(([k]) => HARD.test(k)).map(([, r]) => r),
    instruments: Object.entries(o).filter(([k]) => !HARD.test(k) && k !== 'ammoDrawerOpen').map(([, r]) => r),
    drawer: o.ammoDrawerOpen ? [o.ammoDrawerOpen] : [], lanes: [touchAimWarningSlot(width, height, minimapBottom)],
    feeds: feeds.lanes, reference: feeds.rows,
    keepOut: touchAimKeepOut(width, height, minimapBottom),
    anchor: { x: (o.joy.x * 2 + o.joy.w + o.fire.x * 2 + o.fire.w) / 4, y: (o.joy.y * 2 + o.joy.h + o.fire.y * 2 + o.fire.h) / 4 },
    detection: viewport.centre.detection, alert: alertReserve(width, viewport.centre.alertLine), countdown: viewport.centre.countdown,
    compact: compactSizes(viewport) };
}
// The fills each plan is checked at: the usual one the dock's notice reservation is planned for, the notifications
// state's (three kills a side, no toast) and a burst (eight kills a side, eight incoming toasts).
const FILLS = [['usual', FEED_REFERENCE.kills, FEED_REFERENCE.toasts], ['notifications', 3, 0], ['burst', 8, 8]];
const rows = [];
let plans = 0;
for (const viewport of VIEWPORTS) {
  const name = viewport.cases[0];
  const [noticeFloor, countdownFloor] = CLEARANCE[name];
  let worstNotices = 3, worstCountdown = 3, worstBurst = 3;
  for (const objective of [true, false]) {
    for (let count = 1; count <= 7; count++) {
      const input = centreInputs(viewport, objective, count);
      const { dock } = planTouchDock(input);
      const label = `${name} ${objective ? 'objective' : 'standard'} x${count}`;
      assert.ok(dock, `${label}: the plan places the dock`);
      // The dock keeps off the feeds' lanes at their fullest: it never costs a feed a row main showed.
      for (const t of [...dock.tiles]) for (const lane of input.feeds) {
        assert.ok(!overlaps(t, lane), `${label}: a dock tile lies in a feed's lane (${JSON.stringify(lane)})`);
      }
      for (const [fill, kills, toasts] of FILLS) {
        const feed = feedRects(viewport, objective, kills, toasts);
        const { notices, countdown } = placeTouchCentre(input, dock, feed.rows);
        plans++;
        const at = `${label} ${fill}`;
        assert.ok(notices && countdown, `${at}: the plan places the notices and the countdown`);
        const boxes = [['detection', notices.detection], ['alert', notices.alert], ['countdown', countdown]];
        for (const [what, r] of boxes) {
          assert.ok(r.x >= 12 - 1e-6 && r.y >= input.top - 1e-6 && r.x + r.w <= viewport.width - 12 + 1e-6 && r.y + r.h <= viewport.height - 12 + 1e-6,
            `${at}: the ${what} stays on screen, below the objective`);
          for (const o of [...input.controls, ...input.instruments, ...input.lanes]) {
            assert.ok(!overlaps(r, o, NOTICE_GAP_PX - 1e-6), `${at}: the ${what} keeps ${NOTICE_GAP_PX} px off a control, an instrument or the gun-limit warning's place`);
          }
          for (const row of feed.rows) assert.ok(!overlaps(r, row, NOTICE_GAP_PX - 1e-6), `${at}: the ${what} keeps off a feed's rows`);
          if (!dock.inLane) for (const t of dock.tiles) assert.ok(!overlaps(r, t), `${at}: the ${what} never lies on a dock tile`);
        }
        // Every row main shows stays: no box (a notice, the countdown, the dock) ends a feed above the rows it shows.
        for (const row of feed.rows) {
          const [x0, x1, top] = feed.columns[row.side];
          for (const [what, r] of [...boxes, ['dock', dock]]) {
            assert.ok(touchFeedFloor(r, x0, x1, top) >= row.y + row.h - 1e-6, `${at}: the ${what} would end the ${row.side} feed above its rows`);
          }
        }
        assert.ok(!overlaps(notices.detection, notices.alert), `${at}: detection and the alert never overlap`);
        // The plan's own clearance is the boxes' real one.
        assert.equal(reticleClearance(viewport.width, viewport.height, [notices.detection, notices.alert]), notices.clearance, `${at}: notices clearance`);
        assert.equal(reticleClearance(viewport.width, viewport.height, [countdown]), countdown.clearance, `${at}: countdown clearance`);
        if (fill === 'burst') { worstBurst = Math.min(worstBurst, notices.clearance); continue; }
        worstNotices = Math.min(worstNotices, notices.clearance);
        worstCountdown = Math.min(worstCountdown, countdown.clearance);
        // Compact only where no full-size place clears as much (placeNoticeLane tries full size first at each level).
        if (notices.compact) {
          const full = placeNoticeLane({ width: viewport.width, height: viewport.height, top: input.top,
            obstacles: [...input.controls, ...input.instruments, ...input.lanes, ...feed.rows, ...(dock.inLane ? [] : dock.tiles)],
            detection: input.detection, alert: input.alert, compact: input.compact });
          assert.equal(full.compact, true, `${at}: compact notices only where full-size ones clear less`);
        }
      }
    }
  }
  assert.ok(worstNotices >= noticeFloor, `${name}: the notices clear keep-out ${noticeFloor} at the usual fills (worst ${worstNotices})`);
  assert.ok(worstCountdown >= countdownFloor, `${name}: the countdown clears keep-out ${countdownFloor} at the usual fills (worst ${worstCountdown})`);
  rows.push(`${name} notices >= ${worstNotices} (in a burst ${worstBurst}), countdown >= ${worstCountdown}`);
}

// The verifiers' counterexamples on 390 x 844 (en and zh). Round 4: the alert's bottom 11 px above the aim point, the
// countdown over the crosshair (333-469); round 5: the dock above the ring cut a burst's 11 kill rows and 3 incoming
// toasts to 3 and 1, and every notice emptied both feeds. Now the notices and the countdown clear everything the
// reticle draws beside the feeds' rows, and the dock keeps off the feeds' lanes (both columns down to y 408, where
// main's strip ended them): its row under the reticle, three tiles and More, nearer the thumbs than before.
{
  const phone = VIEWPORTS.find((v) => v.cases.includes('phone') && v.cases.includes('chinese-phone'));
  for (let count = 5; count <= 7; count++) {
    const input = centreInputs(phone, true, count);
    const { dock } = planTouchDock(input);
    for (const [, kills, toasts] of FILLS.slice(0, 2)) {
      const { notices, countdown } = placeTouchCentre(input, dock, feedRects(phone, true, kills, toasts).rows);
      assert.equal(notices.clearance, 3);
      assert.equal(countdown.clearance, 3);
    }
    assert.deepEqual([dock.shown, dock.more, dock.tile, dock.y], [3, true, 48, 572], '390 x 844: three tiles and More under the reticle');
    assert.ok(dock.y > 562, '390 x 844: the dock sits below the scope\'s zoom plate');
  }
  assert.equal(planTouchDock(centreInputs(phone, false, 4)).dock.more, false, '390 x 844: four controls (a mode without the jump) all on the dock');
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
// The plan prefers clearer notices, then more controls on the dock, then a dock by the thumbs, then 48 px tiles:
// never trading the reticle away.
{
  const v = VIEWPORTS.find((viewport) => viewport.cases.includes('small-phone'));
  const plan = planTouchCentre(centreInputs(v, true, 6));
  assert.equal(plan.notices.clearance, 3, '360 x 640: the notices clear everything the reticle draws');
  // 844 x 390 with the objective: reserving the notices' place first would send the dock to the top right (4 tiles in
  // two rows by the settings); placed first, it keeps its one row by the thumbs, and the notices still clear everything.
  const landscape = VIEWPORTS.find((viewport) => viewport.cases.includes('landscape'));
  for (const count of [4, 5]) {
    const { order, dock } = planTouchDock(centreInputs(landscape, true, count));
    assert.deepEqual([order, dock.rows, dock.y], ['dock', 1, 293], `844 x 390 x${count}: the dock keeps its row above the damage panel`);
  }
}
// Split notices: where neither a stack nor a flank fits between the feeds' rows and the reticle, each notice takes its
// own clear place (390 x 844 with three kill rows a side: detection under one feed, the alert under the other).
{
  // Two 40 px pockets at different heights, one each side of the reticle's column: no stack or flank fits.
  const lane = placeNoticeLane({ width: 500, height: 500, top: 20,
    obstacles: [{ x: 0, y: 68, w: 250, h: 432 }, { x: 250, y: 20, w: 250, h: 52 }, { x: 250, y: 128, w: 250, h: 372 }],
    detection: { w: 160, h: 30 }, alert: { w: 160, h: 30 }, compact: [] });
  assert.deepEqual([lane.arrangement, lane.clearance, lane.detection.y, lane.alert.y], ['split', 3, 20, 80]);
  assert.ok(!overlaps(lane.detection, lane.alert, NOTICE_GAP_PX - 1e-6), 'split notices keep their gap');
}
// The compact options run widest first: a 180 px alert in two lines wins over a 120 px one in four where both fit.
{
  const lane = placeNoticeLane({ width: 568, height: 320, top: 70, obstacles: [{ x: 0, y: 0, w: 120, h: 320 }, { x: 448, y: 0, w: 120, h: 320 }],
    detection: { w: 214, h: 32 }, alert: { w: 260, h: 43 },
    compact: [{ detection: { w: 120, h: 32 }, alert: { w: 180, h: 28 } }, { detection: { w: 120, h: 32 }, alert: { w: 120, h: 46 } }] });
  assert.deepEqual([lane.compact, lane.alert.w], [true, 180]);
}
// The alert's reserve is the longest alert's measured height (no two-line guess) wherever the page measured it.
assert.deepEqual(alertReserve(390, 30, 30), { w: 260, h: 30 });
assert.deepEqual(alertReserve(1024, 38, 58), { w: 260, h: 58 });
assert.deepEqual(alertReserve(390, 28), { w: 260, h: 43 }, 'unmeasured: one line plus a second');

// The stylesheet places what the plan says: each notice's centre x, top and width; flanking alerts by their left edge;
// compact type; the countdown's centre x, top and scale, or its one compact line. The alert is never clamped: it wraps
// onto as many lines as its text needs; the compact detection hides its second line only where main does (under 551 px
// of height); the compact alert is in 8 px type, main's smallest.
for (const pattern of [
  /\[data-hud-notices\] \.cot-sixth\{left:var\(--hud-notice-x\);top:var\(--hud-notice-top\);width:var\(--hud-notice-w\);max-width:var\(--hud-notice-w\);transform:translate\(-50%,-6px\)\}/,
  /\[data-hud-notices\] \.cot-sixth\.on\{transform:translate\(-50%,0\)\}/,
  /\[data-hud-notices\] \.cot-alert\{left:var\(--hud-alert-x\);top:var\(--hud-alert-top\);bottom:auto;width:max-content;max-width:var\(--hud-alert-w\);/,
  /\[data-hud-notices\]\[data-hud-notices-flank\] \.cot-alert\.show\{transform:translate\(0,0\)\}/,
  /\[data-hud-notices\] \.cot-alert-copy\{display:block;overflow:visible;text-overflow:clip;white-space:normal\}/,
  /@media \(max-height:550px\)\{body\[data-cot-battle-layout\]\[data-cot-width\]\[data-cot-height\]\.cot-touch-layout\[data-hud-notices='compact'\] \.cot-sixth \.sub\{display:none\}\}/,
  /\[data-hud-notices='compact'\] \.cot-alert\{box-sizing:border-box;gap:6px;min-height:28px;padding:4px 10px;font-size:8px;line-height:1\.2\}/,
  /(?:\[data-hud-countdown\]){4} \.cot-prebattle\{left:var\(--hud-countdown-x\);top:var\(--hud-countdown-top\);transform:translateX\(-50%\) scale\(var\(--hud-countdown-scale,1\)\);transform-origin:50% 0\}/,
  /(?:\[data-hud-countdown='compact'\]){4} \.cot-prebattle\{width:var\(--hud-countdown-w\);height:40px;/,
]) assert.match(css, pattern);
assert.doesNotMatch(css, /line-clamp/, 'no alert is clamped');
assert.doesNotMatch(css, /\[data-hud-notices='compact'\] \.cot-sixth \.sub\{display:none\}\n/, 'the compact detection keeps its second line on portrait screens');
// The layout plans the dock from fixed inputs and main's feed lanes, never the feeds' current rows or the notices'
// copy; the notices and the countdown follow the rows the feeds show; a box ends a feed only where it truly lies in
// its column below its start (the round-4 rule ended both feeds at any notice within 12 px of either column).
assert.match(layout, /dockPlan = planTouchDock\(input\);/);
assert.match(layout, /centrePlan = \{ order: dockPlan\.order, dock: dockPlan\.dock, \.\.\.placeCentreNotices\(input, dockPlan\.dock, feeds\.rows\) \};/);
assert.match(layout, /instruments: noticeObstacles, drawer: dockInstruments\.slice\(instrumentCount\), lanes: \[warning\], feeds: feeds\.lanes,\n\s*reference: feeds\.reference,/);
assert.match(layout, /alert: alertReserve\(width, alertLine, alertH\),/);
assert.match(layout, /floorLeft = Math\.min\(floorLeft, touchFeedFloor\(box, 0, sideWidth, leftAnchor\)\);/);
assert.doesNotMatch(layout, /box\.x < sideWidth \+ 12\) noticeFloorLeft|noticeFloorLeft|noticeFloorRight/, 'no notice ends a feed it does not lie in');
assert.doesNotMatch(layout, /portraitNoticeTop|dockNoticeTop|portraitCountdownTop/, 'no notice is pushed down by the dock or the feeds any more');

console.log(`centreNotices: ${plans} plans (${VIEWPORTS.length} touch sizes x objective/standard x 1-7 controls x usual/notifications/burst fills): notices, alert and countdown on screen, off every control, instrument, warning place, tile and feed row (no feed shows fewer rows than on main), the dock off the feeds' lanes, as clear of the reticle as each screen allows:\n  ${rows.join('\n  ')}`);
