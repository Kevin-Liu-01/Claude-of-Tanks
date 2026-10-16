// Touch action dock (owner 2026-10-14: "find a better way to show the stuff u can do row on mobile").
// The placement is computed here from the layout code itself for every touch viewport of the rendered receipt
// (tools/battle-hud-layout.browser.mjs) x 1-7 controls x the obstacle sets its states produce (objective shown or not,
// the landscape countdown measured or not yet seen), and must keep the dock's one rule: every control is a tile of
// 44 px or more (48 where it fits), nothing scrolls, the dock covers no touch control, instrument, anything the reticle
// draws in any sight at any bloom (touchReticleFootprint: ring, scope arms, magazine and reload countdown, the scope's
// ammunition line, zoom plate and range tag) or the gun-limit warning's place, and no reserved lane unless no other
// room exists; when the row does not fit the last tile is More and the rest open beside it, clear of the touch
// controls and the aim keep-out. The layout owner's DOM path runs on a scripted page: tiles land in their slots, More
// opens and closes, a docked tile acts on a tap and hands a swipe to the aim pad, holding FIRE through a relayout
// keeps the placement (and an open More panel), an unchanged layout never searches again.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  placeTouchActionDock, createCooldownSweep, touchReticleKeepOut, touchAimWarningSlot,
  touchReticleFootprint, touchAimKeepOut, TOUCH_AIM_WARNING_PORTRAIT_W,
  TOUCH_ACTION_TILE_PX, TOUCH_ACTION_MIN_TILE_PX, TOUCH_ACTION_GAP_PX, TOUCH_ACTION_CLEARANCE_PX, TOUCH_ACTION_RETICLE,
  TOUCH_ACTION_RETICLE_READOUTS,
} from './touchActionDock.ts';
import { alertReserve, planTouchCentre } from './centreNotices.ts';
import { FEED_REFERENCE, battleFeedStack, battleNotificationRows } from './battleHudLayout.ts';
import { arrangeVehicleControls } from './vehicleControlOrder.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('./battleHudLayout.css');
const layout = read('./battleHudLayout.ts');
const hud = read('./hud.ts');
const receipt = read('../../tools/battle-hud-layout.browser.mjs');

const overlaps = (a, b, gap = 0) => a.x < b.x + b.w + gap && a.x + a.w > b.x - gap && a.y < b.y + b.h + gap && a.y + a.h > b.y - gap;
const discDistance = (r, d) => Math.hypot(Math.max(r.x - d.x, 0, d.x - r.x - r.w), Math.max(r.y - d.y, 0, d.y - r.y - r.h));
const RETICLE_GAP = 2;
const clearanceOf = (tile) => (tile === TOUCH_ACTION_TILE_PX ? TOUCH_ACTION_CLEARANCE_PX : 6);

const keepDistance = (r, k) => 'r' in k ? discDistance(r, k) - k.r
  : Math.hypot(Math.max(r.x - k.x - k.w, 0, k.x - r.x - r.w), Math.max(r.y - k.y - k.h, 0, k.y - r.y - r.h));

/**
 * The dock's rule for one placement. `hard`: touch controls (dock and panel); `soft`: instruments (dock only); `lanes`:
 * reserved lanes (dock only, unless no placement clear of them exists at all); `keep`: the aim keep-out (dock and
 * panel, always); `fallbackPanel`: the panel may have needed its last resort (clear of the dock and keep-out only).
 */
function checkDock(name, { width, height, hard, soft, lanes = [], feeds = [], keep, insets = {}, anchor }, count, dock, { fallbackPanel = false } = {}) {
  assert.ok(dock, `${name}: ${count} controls get a dock`);
  const { tile } = dock;
  assert.ok(tile === TOUCH_ACTION_TILE_PX || tile === TOUCH_ACTION_MIN_TILE_PX, `${name}: 48 px tiles, 44 px (Apple's minimum) at least`);
  assert.equal(dock.more, dock.flyout.length > 0, `${name}: More exactly when controls wait behind it`);
  assert.equal(dock.shown + dock.flyout.length, count, `${name}: every control is in the dock or behind More`);
  assert.equal(dock.tiles.length, dock.shown + (dock.more ? 1 : 0), `${name}: one slot per shown control, plus More`);
  if (!dock.more) assert.equal(dock.shown, count);
  const left = 12 + (insets.left ?? 0), top = 12 + (insets.top ?? 0);
  const right = width - 12 - (insets.right ?? 0), bottom = height - 12 - (insets.bottom ?? 0);
  const all = [...dock.tiles.map((r) => ['tile', r]), ...dock.flyout.map((r) => ['panel', r])];
  for (const [i, [kind, r]] of all.entries()) {
    assert.ok(r.w === tile && r.h === tile && r.w >= 44 && r.h >= 44, `${name}: ${kind} ${i} is a ${tile} px tile`);
    assert.ok(r.x >= left && r.y >= top && r.x + r.w <= right && r.y + r.h <= bottom, `${name}: ${kind} ${i} stays on screen`);
    for (const [j, k] of keep.entries()) {
      assert.ok(keepDistance(r, k) >= RETICLE_GAP - 1e-6,
        `${name}: ${kind} ${i} keeps off the reticle's footprint / the warning's place (keep-out ${j}: ${keepDistance(r, k).toFixed(1)} px)`);
    }
    if (kind === 'tile' || !fallbackPanel) {
      for (const [j, o] of hard.entries()) assert.ok(!overlaps(r, o, clearanceOf(tile) - 1e-6), `${name}: ${kind} ${i} within ${clearanceOf(tile)} px of touch control ${j}`);
    }
    if (kind === 'tile') {
      for (const [j, o] of soft.entries()) assert.ok(!overlaps(r, o, clearanceOf(tile) - 1e-6), `${name}: tile ${i} within ${clearanceOf(tile)} px of instrument ${j}`);
    } else {
      assert.ok(!overlaps(r, dock, clearanceOf(tile) - 1e-6), `${name}: the panel clears the dock`);
    }
    for (const [, other] of all.slice(i + 1)) assert.ok(!overlaps(r, other), `${name}: tiles never overlap`);
  }
  // Rows fill from the bottom: slot 0 (the jump, in a jump mode) is the bottom-left tile; the next slot is to its right,
  // or starts the row above at the left edge.
  for (const list of [dock.tiles, dock.flyout]) {
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i], b = list[i + 1];
      assert.ok(b.y === a.y ? b.x === a.x + tile + TOUCH_ACTION_GAP_PX
        : b.y === a.y - tile - TOUCH_ACTION_GAP_PX && b.x <= a.x, `${name}: slots keep the row's order, bottom row first`);
    }
  }
  assert.equal(dock.tiles[0].x, dock.x, `${name}: the first control is the leftmost tile`);
  assert.equal(dock.tiles[0].y + tile, dock.y + dock.h, `${name}: the first control is on the bottom row`);
  assert.ok(dock.rows <= 3, `${name}: three rows at most`);
  // A reserved lane is given up only when nothing at all (not even a lone More tile) clears it, and then says so.
  if (dock.tiles.some((r) => lanes.some((o) => overlaps(r, o, clearanceOf(tile) - 1e-6)))) {
    assert.equal(dock.inLane, true, `${name}: a dock in a reserved lane says so (data-hud-dock-lane lifts the notices over it)`);
    lanesGivenUp.add(name.split(' ')[0]);
  }
  if (dock.inLane) {
    assert.equal(placeTouchActionDock({ width, height, count, obstacles: hard, soft: [...soft, ...lanes, ...feeds], keepOut: keep, anchor, insets }), null,
      `${name}: the dock stands in a reserved lane only when no placement clears the lanes`);
  }
  // The feeds' lanes (main's, at their fullest) are never given up on these screens: the dock never costs a feed a row.
  for (const r of dock.tiles) for (const lane of feeds) assert.ok(!overlaps(r, lane), `${name}: a dock tile lies in a feed's lane`);
}
const lanesGivenUp = new Set();

// ---------------------------------------------------------------------------------------------------------------
// Every touch viewport of the rendered receipt. touchActionDock.fixture.json: CSS px rects of the visible touch
// controls and instruments. "measured" ones were read from the production HUD fixture in Chromium touch emulation on
// 2026-10-14 (M1A3 kit, Mars ruleset); "derived" ones (the six sizes that were not measured) are computed from the
// stylesheet rules that place each control, and the rules below reproduce the measured countdown boxes.
const VIEWPORTS = JSON.parse(read('./touchActionDock.fixture.json'));
const receiptTouchCases = [...receipt.matchAll(/\['([a-z-]+)',(\d+),(\d+),true(?:,'[a-zA-Z-]+')?\]/g)].map((m) => ({ name: m[1], width: +m[2], height: +m[3] }));
assert.equal(receiptTouchCases.length, 13, 'the receipt has thirteen touch cases');
for (const { name, width, height } of receiptTouchCases) {
  const viewport = VIEWPORTS.find((v) => v.cases.includes(name));
  assert.ok(viewport, `${name}: the fixture covers every touch case of the receipt`);
  assert.deepEqual([viewport.width, viewport.height], [width, height], `${name}: same size as the receipt`);
}
// The derived short-landscape sizes keep the measured landscape phones' stylesheet edges: each control's offset from
// the edge it is anchored to (and its size) equals the measured one at the same width band, except where a height
// rule changes it (340 px and less: no second FIRE; 299 px and less: FIRE 8 px up, minimap 88, consumables at 116 and
// ammo at 66 from the top, 44 px tall consumables).
const edges = (v, key) => {
  const r = v.obstacles[key];
  return { w: r.w, h: r.h, left: r.x, right: +(v.width - r.x - r.w).toFixed(2), top: r.y, bottom: +(v.height - r.y - r.h).toFixed(2),
    centre: +(r.x + r.w / 2 - v.width / 2).toFixed(2) };
};
const anchoredBy = { joy: ['left', 'bottom'], fire: ['right', 'bottom'], scope: ['right', 'bottom'], autoaim: ['right', 'bottom'],
  drive: ['left', 'bottom'], dp: ['centre', 'bottom'], net: ['left', 'bottom'], chrome: ['right', 'top'], minimap: ['left', 'top'],
  top: ['centre', 'top'], mode: ['centre', 'top'], con0: ['right', 'bottom'], con2: ['right', 'bottom'], ammo: ['right', 'bottom'] };
for (const v of VIEWPORTS.filter((viewport) => viewport.source === 'derived' && viewport.width > viewport.height && viewport.height <= 519)) {
  const template = VIEWPORTS.find((t) => t.source === 'measured' && t.width > t.height && (t.width >= 768) === (v.width >= 768));
  const tiny = v.height <= 299;
  for (const [key, sides] of Object.entries(anchoredBy)) {
    if (tiny && ['minimap', 'con0', 'con2', 'ammo'].includes(key)) continue;
    const got = edges(v, key), want = edges(template, key);
    for (const side of ['w', 'h', ...sides]) {
      if (tiny && key === 'fire' && side === 'bottom') continue;
      assert.ok(Math.abs(got[side] - want[side]) < .6, `${v.cases[0]}: ${key} ${side} ${got[side]} keeps the measured ${template.cases[0]} ${want[side]}`);
    }
  }
  assert.equal(!!v.obstacles.fireAlt, v.height > 340, `${v.cases[0]}: the second FIRE hides at 340 px and less`);
  if (tiny) {
    assert.deepEqual([edges(v, 'fire').bottom, v.obstacles.minimap.w, v.obstacles.con0.y, v.obstacles.con0.h, v.obstacles.ammo.y], [8, 88, 116, 44, 66]);
  }
}
const HARD = /^(joy|fire|fireAlt|scope|autoaim|chrome|con\d|ammo)$/;
const summary = [];
let placements = 0;
/** The layout's own inputs for one fixture viewport (battleHudLayout.ts placeTouchCentre), with or without the
 *  objective plate (Standard has none: the score's bottom is the objective bottom, and portrait phones lift their
 *  settings trio and minimap to it, battleHudLayout.css). */
// Main's feed lanes at their fullest, and its rows at the usual fill (touchActionDock.fixture.json mainFeeds, pinned
// from main 5ab143d57; battleHudLayout.ts touchFeedInputs hands the same on).
function feedLanes(viewport, objective) {
  const { width } = viewport;
  const side = Math.min(400, width / 2 - 24);
  const m = viewport.mainFeeds[objective ? 'objective' : 'standard'];
  const [la, le] = m.left, [ra, re] = m.right;
  const lanes = [], reference = [];
  if (le > la) lanes.push({ x: 0, y: la, w: side, h: le - la });
  if (re > ra) lanes.push({ x: width - side, y: ra, w: side, h: re - ra });
  const share = battleFeedStack(le - la, FEED_REFERENCE.kills, FEED_REFERENCE.toasts, false);
  if (share.killHeight) reference.push({ x: 0, y: la, w: side, h: share.killHeight });
  if (share.toastHeight) reference.push({ x: 0, y: la + share.below, w: side, h: share.toastHeight });
  const right = battleNotificationRows(re - ra, FEED_REFERENCE.kills);
  if (right) reference.push({ x: width - side, y: ra, w: side, h: right * 29 - 3 });
  return { lanes, reference };
}
// A round button with the caption hanging under it (touchControls.ts .lb, measured: touchActionDock.fixture.json captions),
// as the layout owner reads it (battleHudLayout.ts placeTouchCentre): one control, the caption's band at least as wide as
// the button (verifier 2026-10-16, round 6: the detection and the 320 x 568 dock sat on the AUTO AIM and SCOPE captions).
function withCaption(r, c) {
  if (!c) return r;
  const half = Math.max(r.w, c.w) / 2, mid = r.x + r.w / 2;
  const x = Math.min(r.x, mid - half), y = Math.min(r.y, c.y);
  return { x, y, w: Math.max(r.x + r.w, mid + half) - x, h: Math.max(r.y + r.h, c.y + c.h) - y };
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
  return { width, height, top: objectiveBottom + 8, count,
    controls: Object.entries(o).filter(([k]) => HARD.test(k)).map(([k, r]) => withCaption(r, viewport.captions?.[k])),
    instruments: Object.entries(o).filter(([k]) => !HARD.test(k) && k !== 'ammoDrawerOpen').map(([, r]) => r),
    drawer: [...(o.ammoDrawerOpen ? [o.ammoDrawerOpen] : []), ...(viewport.hint ? [viewport.hint] : [])], lanes: [touchAimWarningSlot(width, height, minimapBottom)],
    feeds: feedLanes(viewport, objective).lanes, reference: feedLanes(viewport, objective).reference,
    keepOut: touchAimKeepOut(width, height, minimapBottom),
    anchor: { x: (o.joy.x * 2 + o.joy.w + o.fire.x * 2 + o.fire.w) / 4, y: (o.joy.y * 2 + o.joy.h + o.fire.y * 2 + o.fire.h) / 4 },
    detection: viewport.centre.detection, alert: alertReserve(width, viewport.centre.alertLine), countdown: viewport.centre.countdown };
}
for (const viewport of VIEWPORTS) {
  const { width, height } = viewport;
  const name = viewport.cases.join('/');
  for (const objective of [true, false]) {
    const label = `${name} ${objective ? 'objective' : 'standard'}`;
    const row = [];
    for (let count = 1; count <= 7; count++) {
      const input = centreInputs(viewport, objective, count);
      const plan = planTouchCentre(input);
      const dock = plan.dock;
      // Reserved lanes: the gun-limit warning's place, and the notices' place when the plan reserved it first.
      const lanes = [...input.lanes, ...(plan.order === 'notices' && plan.notices ? [plan.notices.detection, plan.notices.alert] : [])];
      checkDock(`${label} x${count}`, { width, height, hard: input.controls, soft: [...input.instruments, ...input.drawer], lanes,
        feeds: input.feeds, keep: input.keepOut, anchor: input.anchor }, count, dock);
      placements++;
      // Never fewer controls on screen at once than main's strip showed whole (verifier 2026-10-16, round 6: 390 x 844
      // and 360 x 640 showed three and More where main showed four, 320 x 568 one where main showed two, 568 x 256 none
      // where main showed one). Main's strip of five controls scrolled under a hidden scrollbar; mainTiles is how many of
      // its tiles lay whole on screen (measured on main 5ab143d57), and its strip never widened past five whole tiles.
      assert.ok(dock.shown >= Math.min(count, viewport.mainTiles), `${label} x${count}: ${dock.shown} controls on the dock (main's strip showed ${viewport.mainTiles})`);
      // The owner's phones (verifier 2026-10-16: the dock above the ring cost 390 x 844 eight of a burst's kill rows and
      // two of its incoming toasts; round 6: its row under the reticle showed three and More and hid the swipe-to-aim
      // hint). Off the feeds' lanes, the hint and the captions, 390 x 844 and 360 x 640 dock in a column two tiles wide
      // left of the reticle: every control up to six, five and More at seven. 844 x 390, whose feeds end high, shows
      // every control in one row.
      if ((viewport.cases.includes('phone') || viewport.cases.includes('small-phone')) && count >= 4) {
        assert.deepEqual([dock.shown, dock.more, dock.columns], [count > 6 ? 5 : count, count > 6, 2], `${label} x${count}: the column left of the reticle`);
        assert.ok(dock.x + dock.w < viewport.width / 2 - touchReticleKeepOut(viewport.width, viewport.height).r, `${label} x${count}: left of the ring`);
      }
      if (viewport.cases.includes('landscape')) assert.equal(dock.more, false, `${label}: 844 x 390 shows all ${count} controls`);
      if (viewport.cases.includes('landscape')) assert.equal(dock.rows, 1, `${label}: 844 x 390 keeps one row`);
      if (count >= 5) row.push(`${count}:${dock.tile}px ${dock.columns}x${dock.rows}@${dock.x},${dock.y}${dock.more ? ` +More(${dock.flyout.length})` : ''}`);
    }
    if (objective) summary.push(`${name} ${row.join(' ')}`);
  }
}

// The gun-limit warning never moves for the dock and never sits on the crosshair area (the 64 px around the centre):
// its reserved slot is where the stylesheet puts it, 48 px under the centre (42 px on a 340 px phone) or under the
// minimap on a landscape phone.
for (const { width, height, obstacles } of VIEWPORTS) {
  const slot = touchAimWarningSlot(width, height, obstacles.minimap.y + obstacles.minimap.h);
  const centre = { x: width / 2, y: height / 2, r: 0 };
  assert.ok(discDistance(slot, centre) >= TOUCH_ACTION_RETICLE.minRadiusPx + 8, `${width}x${height}: the gun-limit warning stays off the crosshair area`);
}
assert.match(css, /\.cot-aim-warning\{position:fixed;left:50%;top:calc\(50% \+ 48px\);transform:translateX\(-50%\);width:180px;/,
  'the warning sits 48 px under the crosshair, 180 px wide (touchAimWarningSlot)');
assert.match(css, /@media \(max-height:549px\) and \(orientation:landscape\)\{\n\s*\.cot-aim-warning\{left:8px;top:var\(--hud-aim-warning-top,118px\);transform:none;width:106px;/,
  'landscape phones put it under the minimap, 106 px wide');
assert.match(layout, /'aim-warning-top': width > height \? \(map\?\.bottom \?\? 114\) \+ 4 : height \* \.5 \+ 48,/, '4 px under the minimap');
assert.match(css, /@media \(max-width:340px\) and \(orientation:portrait\)\{\n\s*\.cot-aim-warning\{top:326px;left:94px;transform:none;width:156px\}/,
  '340 px phones put it at 326 px, 156 px wide');
assert.doesNotMatch(`${css}\n${layout}`, /aim-docked|aim-warning-dock|hudAimDocked/, 'nothing moves the warning for the dock');
// The keep-out is the reticle's own geometry: centred (touch aim raycasts through the screen centre) and as wide as
// the dispersion ring's full bloom.
assert.match(hud, /const RET_FLOOR_PX = 11;\nconst RET_CEIL_FRAC = 0\.15;/, 'the ring blooms from 11 px to 15% of the shorter side');
assert.equal(TOUCH_ACTION_RETICLE.ringCeilFraction, .15);
assert.match(hud, /\.cot-ret\{position:absolute;z-index:var\(--hud-layer-sight\);inset:0;width:100%;height:100%;/, 'the reticle canvas fills the screen');
assert.match(read('../engine/cameraRig.ts'), /raycast from the camera through screen center/);
for (const [w, h, r] of [[360, 640, 54], [390, 844, 59], [844, 390, 59], [320, 568, 48], [568, 256, 39], [1024, 768, 116], [200, 150, 32]]) {
  assert.deepEqual(touchReticleKeepOut(w, h), { x: w / 2, y: h / 2, r }, `${w}x${h}: keep-out radius`);
}
// Beyond the ring, the keep-out is everything else the reticle canvas draws (verifier 2026-10-15: the dock covered the
// scope's ammunition line and zoom plate on 390 x 844). touchReticleFootprint restates these hud.ts placements; a
// change to any of them fails here until the footprint follows.
for (const [pattern, what] of [
  [/if \(h <= 300\) return draw\.cy \+ 32;\n\s*if \(h <= 430\) return draw\.cy \+ 44;\n\s*return Math\.min\(\n\s*draw\.cy \+ Math\.max\(draw\.radius \* 1\.02 \+ 24, draw\.radius \* 1\.55 \+ 18, 96\),\n\s*h - 176,\n\s*\);/, 'sniperAmmoReadoutY'],
  [/ctx\.font = `700 13\.5px \$\{FONT_COND\}`;\n\s*const countW = ctx\.measureText\(`\$\{count\} `\)\.width;\n\s*ctx\.font = `800 9px \$\{FONT_COND\}`;/, 'the ammunition line'],
  [/const y = sniperAmmoReadoutY\(draw\) \+ \(h <= 300 \? 18 : 24\);\n\s*const text = `×\$\{\(view\.zoom \|\| 8\)\.toFixed\(1\)\}`;\n\s*ctx\.font = `700 16px \$\{FONT_COND\}`;/, 'paintSniperZoom'],
  [/const halfWidth = ctx\.measureText\(text\)\.width \/ 2 \+ 12;[\s\S]{0,200}ctx\.moveTo\(draw\.cx - halfWidth - 20, y - 5\.5\);/, 'the zoom plate rules'],
  [/const offset = 0\.7071 \* \(draw\.radius \+ 9\);[\s\S]{0,260}draw\.cx \+ offset \+ 4,\n\s*draw\.cy \+ offset \+ 12,/, 'paintSniperDistance'],
  [/const gap = radius \+ 3;\n\s*const armEnd = radius \* 1\.55 \+ 3;/, 'the scope cross arms'],
  [/paintScopeCrossArms\(cx, cy, gap, armEnd, 'rgba\(4,7,6,0\.38\)', 2\.4\);/, 'the arms\' under-stroke'],
  [/const tick = i % 2 === 0 \? 4\.5 : 3;/, 'the mil ticks'],
  [/\? Math\.min\(1\.8, 1\.1 \+ 0\.085 \* \(view\.zoom \|\| 8\)\)/, 'the scope zoom scale'],
  [/state\.centerClearanceRadius = 14 \+ \(state\.zoomScale - 1\) \* 9;/, 'the centre clearance'],
  [/const shellH = draw\.sniper \? 16 : 14;[\s\S]{0,400}const y0 = draw\.cy \+ draw\.centerClearanceRadius \+ 6;/, 'the magazine rack'],
  [/const AUTOLOADER_HUD_ARC_DEPTH = 2\.25;/, 'the rack arc'],
  [/\? draw\.magazineBottomY \+ 15\n\s*: draw\.cy \+ draw\.centerClearanceRadius \+ 15;/, 'the reload countdown'],
  [/if \(pending\) return 'SWITCHING';/, 'the countdown while a round is chosen'],
]) assert.match(hud, pattern, `touchReticleFootprint restates hud.ts ${what}`);
// The footprint covers each readout, independently placed from those formulas, at rest and at full bloom, in every
// touch viewport: the ammunition line, the zoom plate with its rules, the range tag, the countdown and rack, the arms.
const inFootprint = (footprint, x, y) => footprint.some((k) => 'r' in k ? Math.hypot(x - k.x, y - k.y) <= k.r
  : x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h);
for (const { width, height } of VIEWPORTS) {
  const footprint = touchReticleFootprint(width, height);
  const cx = width / 2, cy = height / 2;
  const ceil = .15 * Math.min(width, height);
  for (const r of [11, (11 + ceil) / 2, ceil]) {
    const ammo = height <= 300 ? cy + 32 : height <= 430 ? cy + 44 : Math.min(cy + Math.max(r * 1.02 + 24, r * 1.55 + 18, 96), height - 176);
    const zoom = ammo + (height <= 300 ? 18 : 24);
    const tag = .7071 * (r + 9);
    const points = [
      ...[-34, 0, 34].flatMap((dx) => [[cx + dx, ammo - 10], [cx + dx, ammo + 3]]), // "120 APFSDS"
      ...[-53, -24, 0, 24, 53].flatMap((dx) => [[cx + dx, zoom - 12], [cx + dx, zoom + 4]]), // "x25.0" and its rules
      [cx + tag + 4, cy + tag + 3], [cx + tag + 44, cy + tag + 3], [cx + tag + 4, cy + tag + 15], [cx + tag + 44, cy + tag + 15], // "1500 m"
      [cx - 50, cy + 14], [cx + 50, cy + 14], [cx - 44, cy + 59], [cx + 44, cy + 59], [cx, cy + 20], [cx + 36, cy + 44], // SWITCHING, the rack and its +N
      [cx, cy - r * 1.55 - 3], [cx, cy + r * 1.55 + 3], [cx - r * 1.55 - 3, cy], [cx + r * 1.55 + 3, cy], // arm ends
    ];
    for (const [x, y] of points) assert.ok(inFootprint(footprint, x, y), `${width}x${height}: r ${r.toFixed(1)}: the reticle's footprint covers (${x.toFixed(1)}, ${y.toFixed(1)})`);
  }
}
assert.ok(TOUCH_ACTION_RETICLE_READOUTS.zoomHalfWidthPx >= 53 && TOUCH_ACTION_RETICLE_READOUTS.stackHalfWidthPx >= 44);
// The verifier's counterexample, 390 x 844: the zoom plate "x8.0" centred at x 195, baseline 542 at rest and 555 at
// full bloom; no placement for any count may touch it (the old 5-control dock at (56, 537) did).
{
  const v = VIEWPORTS.find((viewport) => viewport.cases.includes('phone'));
  const plate = { x: 195 - 50, y: 542 - 12, w: 100, h: 555 + 4 - (542 - 12) };
  for (let count = 1; count <= 7; count++) {
    const { dock } = planTouchCentre(centreInputs(v, true, count));
    for (const r of [...dock.tiles, ...dock.flyout]) assert.ok(!overlaps(r, plate), `390x844 x${count}: no tile on the scope's zoom plate`);
  }
}

// Without a plan (no touch dock) the stylesheet's own countdown and notice places still apply.
assert.match(css, /\.cot-touch-layout\[data-cot-height='short'\]\[data-cot-orientation='landscape'\] \.cot-prebattle\{width:calc\(100vw - 420px\)\}/);
assert.match(css, /\[data-cot-height='short'\]\[data-cot-orientation='landscape'\] \.cot-prebattle\{top:calc\(var\(--hud-objective-bottom,64px\) \+ 8px\)\}/);
assert.match(read('./responsiveSurfaces.css'), /body\[data-cot-height='short'\] \.cot-prebattle\{top:16%;transform:translateX\(-50%\) scale\(\.82\)\}/);
assert.match(hud, /\.cot-prebattle\{position:absolute;z-index:var\(--hud-layer-status\);left:50%;top:22%;transform:translateX\(-50%\);\n\s*width:min\(390px,calc\(100vw - 32px\)\);display:grid;grid-template-columns:minmax\(0,1fr\);\n\s*grid-template-rows:30px 92px auto;\n\s*row-gap:7px;/);
assert.match(css, /\.cot-prebattle\{grid-template-rows:20px 48px auto;row-gap:3px;transform:translateX\(-50%\)\}/, 'the 340 px rows');
assert.match(css, /\.cot-prebattle\.on\{display:flex;align-items:center;justify-content:center;gap:6px;min-height:40px\}/, 'the 299 px row');
// The landscape notice band is where the stylesheet puts detection and the alert at 299 px and less.
assert.match(css, /\.cot-sixth\{left:122px;transform:none;width:136px;/);
assert.match(css, /\.cot-alert\{box-sizing:border-box;font-size:8px;line-height:1\.2;padding:4px 12px;top:var\(--hud-notice-top\);left:266px;transform:none;width:134px;/);

// ---------------------------------------------------------------------------------------------------------------
// Property sweep: seeded touch controls, instruments and a crosshair (no Math.random). Whatever is placed obeys the rule.
let seed = 0x5eed;
const random = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
let placed = 0, withMore = 0;
// Any screen, then phone-sized ones crowded enough that only a few tiles fit and the rest go behind More.
for (const [minWidth, widthRange, minHeight, heightRange] of [[320, 700, 256, 600], [320, 300, 256, 200]]) {
  for (let run = 0; run < 300; run++) {
    const width = minWidth + Math.floor(random() * widthRange), height = minHeight + Math.floor(random() * heightRange);
    const box = () => ({ x: Math.floor(random() * width), y: Math.floor(random() * height), w: 30 + Math.floor(random() * 110), h: 30 + Math.floor(random() * 110) });
    const hard = Array.from({ length: 2 + Math.floor(random() * 10) }, box);
    const soft = Array.from({ length: Math.floor(random() * 12) }, box);
    const count = 1 + Math.floor(random() * 7);
    const keep = touchReticleFootprint(width, height);
    const dock = placeTouchActionDock({ width, height, count, obstacles: hard, soft, keepOut: keep });
    if (!dock) continue;
    placed++;
    if (dock.more) withMore++;
    checkDock(`random ${width}x${height} ${run}`, { width, height, hard, soft, keep }, count, dock, { fallbackPanel: true });
  }
}
assert.ok(placed > 550 && withMore > 20, `random layouts admit a dock (${placed}/600, ${withMore} with More)`);

// Unit cases: one row wins whenever it fits, centred on the thumbs; no room at all is null; no controls, no dock.
const open = placeTouchActionDock({ width: 800, height: 400, count: 7, obstacles: [] });
assert.equal(open.rows, 1);
assert.equal(open.w, 7 * TOUCH_ACTION_TILE_PX + 6 * TOUCH_ACTION_GAP_PX);
assert.equal(open.y + open.h, 400 - 12, 'with no anchor the dock rests on the bottom edge');
assert.ok(Math.abs(open.x + open.w / 2 - 400) <= 1, 'and is centred');
const anchored = placeTouchActionDock({ width: 800, height: 400, count: 2, obstacles: [], anchor: { x: 700, y: 100 } });
assert.ok(Math.abs(anchored.x + anchored.w / 2 - 700) <= 1 && Math.abs(anchored.y + anchored.h / 2 - 100) <= 1, 'the dock centres on its anchor when free');
assert.equal(placeTouchActionDock({ width: 800, height: 400, count: 3, obstacles: [{ x: 0, y: 0, w: 800, h: 400 }] }), null);
assert.equal(placeTouchActionDock({ width: 800, height: 400, count: 0, obstacles: [] }), null);
// A narrow lane wraps into rows rather than scrolling, filled from the bottom: 7 controls in a 200 px gap become 3 x 3
// with the first control bottom-left and the seventh alone on the top row.
const lane = placeTouchActionDock({ width: 400, height: 400, count: 7, obstacles: [{ x: 0, y: 0, w: 100, h: 400 }, { x: 300, y: 0, w: 100, h: 400 }] });
assert.deepEqual([lane.columns, lane.rows], [3, 3]);
assert.deepEqual([lane.tiles[0].x, lane.tiles[0].y], [lane.x, lane.y + 2 * (TOUCH_ACTION_TILE_PX + TOUCH_ACTION_GAP_PX)]);
assert.deepEqual([lane.tiles[6].x, lane.tiles[6].y], [lane.x, lane.y]);
// The crosshair is never covered: a free screen splits around it rather than across it.
const centred = placeTouchActionDock({ width: 400, height: 300, count: 5, obstacles: [], anchor: { x: 200, y: 150 }, keepOut: [touchReticleKeepOut(400, 300)] });
assert.ok(centred.tiles.every((r) => discDistance(r, touchReticleKeepOut(400, 300)) >= 45 + RETICLE_GAP - 1e-6), 'tiles go around the crosshair');
// Crowding takes 44 px tiles before More, and More before covering anything.
const gap44 = placeTouchActionDock({ width: 400, height: 200, count: 4, obstacles: [{ x: 0, y: 0, w: 400, h: 135 }] });
assert.deepEqual([gap44.tile, gap44.more], [44, false], 'a strip too short for 48 px takes 44 px tiles');
const crowded = placeTouchActionDock({ width: 300, height: 200, count: 6, keepOut: [touchReticleKeepOut(300, 200)],
  obstacles: [{ x: 0, y: 0, w: 300, h: 135 }, { x: 0, y: 135, w: 100, h: 65 }, { x: 260, y: 135, w: 40, h: 65 }] });
assert.equal(crowded.more, true, 'a 160 px lane holds three 44 px tiles: two controls and More');
assert.deepEqual([crowded.tile, crowded.shown, crowded.flyout.length], [44, 2, 4]);
checkDock('crowded', { width: 300, height: 200, hard: [{ x: 0, y: 0, w: 300, h: 135 }, { x: 0, y: 135, w: 100, h: 65 }, { x: 260, y: 135, w: 40, h: 65 }], soft: [], keep: [touchReticleKeepOut(300, 200)] }, 6, crowded, { fallbackPanel: true });
// A 44 px row by the thumbs beats a 48 px block across the screen; 48 px wins when both are as close.
const thumbs = placeTouchActionDock({ width: 600, height: 400, count: 4, anchor: { x: 300, y: 370 },
  obstacles: [{ x: 0, y: 0, w: 600, h: 40 }, { x: 0, y: 330, w: 190, h: 70 }, { x: 410, y: 330, w: 190, h: 70 }, { x: 0, y: 250, w: 600, h: 25 }] });
assert.equal(thumbs.tile, 44, 'the 44 px row in the 46 px gap by the thumbs');
assert.ok(thumbs.y > 275, 'stays by the thumbs');

// Cooldown sweep: the first remaining time is the whole cooldown; snapshot jitter never restarts it; ready resets it.
const sweep = createCooldownSweep();
assert.equal(sweep(0), 0);
assert.equal(sweep(20), 1);
assert.equal(sweep(10), .5);
assert.equal(sweep(10.2), 10.2 / 20, 'a corrected snapshot does not restart the sweep');
assert.equal(sweep(0), 0);
assert.equal(sweep(6), 1, 'a new cooldown latches its own length');
assert.equal(sweep(Number.NaN), 0);

// ---------------------------------------------------------------------------------------------------------------
// Styles: the dock is touch-only; the desktop strip keeps its 74 x 32 text cells and its own placement.
assert.match(css, /\.cot-vehicle-controls>button\{pointer-events:auto;position:static!important;transform:none!important;flex:0 0 74px;width:74px!important;height:32px!important;/,
  'the desktop strip is unchanged');
const dockRules = css.match(/body\.cot-touch-layout\[data-hud-dock\][^{]* \.cot-vehicle-controls[^{]*\{[^}]*\}/g) || [];
assert.ok(dockRules.length >= 16, 'the dock styles are scoped to a placed touch dock');
assert.ok(css.includes('body.cot-touch-layout .cot-vehicle-controls>button{height:44px!important;min-height:44px;grid-template-rows:1fr;padding-block:5px}'),
  'with no spot for a single tile the touch strip keeps its former 44 px styles');
assert.match(css, /body\.cot-touch-layout\[data-hud-dock\] \.cot-vehicle-controls\{display:block;width:var\(--hud-systems-width,0px\);height:var\(--hud-systems-height,0px\);max-width:none;padding:0;overflow:visible\}/,
  'the docked row is a fixed box that never scrolls');
assert.match(css, /body\.cot-touch-layout\[data-hud-dock\] \.cot-vehicle-controls>button\{position:absolute!important;inset:var\(--dock-y,0px\) auto auto var\(--dock-x,0px\)!important;width:var\(--hud-systems-tile,48px\)!important;height:var\(--hud-systems-tile,48px\)!important;min-width:var\(--hud-systems-tile,48px\)!important/,
  'each tile sits at its slot, at the dock tile size');
assert.match(css, /body\.cot-touch-layout\[data-hud-dock\] \.cot-vehicle-controls>button\.cot-special\{inset:var\(--dock-y,0px\) auto auto var\(--dock-x,0px\)!important\}/, 'older special-action offsets never shift a tile');
assert.match(css, /\n\.cot-vehicle-controls>\.cot-dock-more\{display:none\}\nbody\.cot-touch-layout\[data-hud-dock\] \.cot-vehicle-controls>\.cot-dock-more\{display:grid\}/, 'More exists only on a placed touch dock');
assert.match(css, /body\.cot-touch-layout\[data-hud-dock\] \.cot-vehicle-controls>button\[data-dock-overflow\]\{visibility:hidden;pointer-events:none\}/, 'controls behind More stay laid out but hidden');
assert.match(css, /body\.cot-touch-layout\[data-hud-dock\]\[data-hud-dock-open\] \.cot-vehicle-controls>button\[data-dock-overflow\]\{visibility:visible;pointer-events:auto;/, 'and show while More is open');
assert.match(css, /body\.cot-touch-layout\[data-hud-dock\]\[data-hud-dock-open\] \.cot-vehicle-controls\{z-index:calc\(var\(--hud-layer-score\) \+ 2\)\}/,
  'the open panel draws above the score plate it may lie over');
assert.match(hud, /--hud-layer-controls:24;--hud-layer-score:30;/, 'the score plate is the highest HUD layer the panel can meet');
assert.match(css, /body\.cot-touch-layout\[data-hud-dock\] \.cot-vehicle-controls \.system-status\{display:block;grid-area:auto;position:absolute;/, 'the charge badge sits in the tile corner, not the caption row');
assert.match(css, /body\.cot-touch-layout\[data-hud-dock\] \.cot-vehicle-controls>button \.sk\{display:none\}/, 'no keycaps on touch');
assert.match(css, /conic-gradient\(transparent calc\(\(1 - var\(--cd,0\)\) \* 360deg\),rgba\(2,6,9,\.74\) 0\)/, 'cooldowns sweep the shadow off clockwise');
assert.match(css, /body\.cot-touch-layout\[data-hud-dock\]\[data-hud-dock-lane\] :is\(\.cot-sixth,\.cot-alert,\.cot-prebattle\)\{z-index:calc\(var\(--hud-layer-controls\) \+ 1\)\}/,
  'a notice shown in the lane a dock stands in reads over it');
assert.match(layout, /toggleAttribute\('data-hud-dock-lane', !!placement\?\.inLane\)/, 'the page marks a dock standing in a lane');
assert.match(css, /button\.cooling::before\{[^}]*conic-gradient\(#ffc46b calc\(\(1 - var\(--cd,0\)\) \* 360deg\)/, 'and fill an amber ring');
for (const rule of dockRules) {
  assert.doesNotMatch(rule, /(?:^|[;{])order:|grid-auto-flow:[^;}]*dense|row-reverse|column-reverse|direction:rtl/,
    'the dock never reorders the row: the first control in the row (jump-first is its own rule) stays first');
}
assert.doesNotMatch(css, /hud-systems-columns/, 'slots, not a column count, place the tiles');
// The More tile joins the row after its controls; the jump-first arrangement keeps it last whatever it reorders.
{
  const nodes = Object.fromEntries(['special', 'jump', 'drone', 'missile', 'smoke', 'lights', 'roofGun', 'more'].map((id) => [id, { id }]));
  const children = Object.values(nodes);
  for (const node of children) Object.defineProperty(node, 'nextSibling', { get: () => children[children.indexOf(node) + 1] ?? null });
  const row = { get firstChild() { return children[0]; },
    insertBefore(node, reference) { children.splice(children.indexOf(node), 1); children.splice(reference ? children.indexOf(reference) : children.length, 0, node); } };
  const { more, ...controls } = nodes;
  for (const jump of [true, false, true]) {
    arrangeVehicleControls(row, controls, jump);
    assert.equal(children.at(-1), more, 'More stays the last child of the row');
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The layout owner on a scripted touch page (the measured 320 x 568 phone with seven controls: More and the rest behind
// it): slots are written, More opens and closes, a docked tile acts on a tap and hands a swipe to the aim pad, presses
// never relayout, and holding FIRE through a relayout keeps the placement and an open panel.
const originals = new Map(['document', 'window', 'ResizeObserver', 'MutationObserver', 'requestAnimationFrame', 'getComputedStyle', 'PointerEvent']
  .map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
try {
  const frames = new Map(); let nextFrame = 1;
  let mutationCallback = null, resizeCallback = null; const mutationTargets = new Set(); const resizeTargets = new Set();
  const documentListeners = [];
  // One event through the page: document capture listeners (all of them, as on one node), then the target's own unless
  // a capture listener stopped propagation.
  function dispatch(target, type, init = {}) {
    let stopped = false;
    const event = { type, target, detail: 1, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 0, clientY: 0, ...init,
      preventDefault() {}, stopPropagation() { stopped = true; } };
    for (const listener of documentListeners) if (listener.type === type && listener.capture) listener.fn(event);
    if (!stopped) target.listeners.get(type)?.(event);
    return event;
  }
  class FakeStyle {
    constructor() { this.values = new Map(); this.cssText = ''; }
    getPropertyValue(key) { return this.values.get(key) ?? ''; }
    setProperty(key, value) { this.values.set(key, value); }
    removeProperty(key) { this.values.delete(key); }
  }
  const all = [];
  class FakeElement {
    constructor(selectors = [], rect = null, tag = 'div') {
      this.selectors = selectors; this.rect = rect; this.tagName = tag.toUpperCase();
      this.attrs = new Map(); this.style = new FakeStyle(); this.dataset = {}; this.children = []; this.parentElement = null;
      this.listeners = new Map(); this.textContent = ''; this.hiddenFlag = false; this.visible = !!rect; this.childElementCount = 0;
      this.classList = { contains: (c) => this.selectors.some((s) => s.split(/[\s.>]/).includes(c)), toggle: () => false, add() {}, remove() {} };
      all.push(this);
    }
    get hidden() { return this.hiddenFlag; }
    set hidden(value) { this.hiddenFlag = !!value; }
    set innerHTML(html) { if (html.includes('class="sl"')) { const label = new FakeElement(['.sl']); this.append(label); } }
    getAttribute(key) { return this.attrs.has(key) ? this.attrs.get(key) : null; }
    setAttribute(key, value) { this.attrs.set(key, String(value)); }
    hasAttribute(key) { return this.attrs.has(key); }
    removeAttribute(key) { this.attrs.delete(key); }
    // The layout owner measures hidden copies of the notices beside them (naturalCentreSizes): a copy has no size here.
    cloneNode() { const copy = new FakeElement([...this.selectors], this.rect); copy.visible = false; return copy; }
    remove() {
      if (this.parentElement) { this.parentElement.children = this.parentElement.children.filter((c) => c !== this); this.parentElement.childElementCount = this.parentElement.children.length; }
      all.splice(all.indexOf(this), 1);
    }
    toggleAttribute(key, on) { if (on) this.attrs.set(key, ''); else this.attrs.delete(key); }
    getClientRects() { return this.visible && !this.hiddenFlag ? [{}] : []; }
    getBoundingClientRect() { const r = this.rect ?? { x: 0, y: 0, w: 0, h: 0 }; return { left: r.x, top: r.y, right: r.x + r.w, bottom: r.y + r.h, width: r.w, height: r.h, x: r.x, y: r.y }; }
    matches(selector) {
      if (selector === '.down,:active') return !!this.pressed;
      return selector.split(',').some((s) => this.selectors.includes(s.trim()));
    }
    closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches?.(selector)) return node; return null; }
    click() { this.clicks = (this.clicks ?? 0) + 1; dispatch(this, 'click', { detail: 0 }); }
    dispatchEvent(event) { (this.received ??= []).push(event); return true; }
    contains(node) { return node === this || this.children.includes(node); }
    querySelector(selector) { return this.children.find((c) => c.matches(selector)) ?? null; }
    addEventListener(type, fn) { this.listeners.set(type, fn); }
    append(child) { child.parentElement = this; this.children.push(child); this.childElementCount = this.children.length; }
  }
  const v = VIEWPORTS.find((viewport) => viewport.cases.includes('narrow-phone'));
  const o = v.obstacles;
  const body = new FakeElement(['body'], { x: 0, y: 0, w: v.width, h: v.height });
  body.classList.contains = (c) => c === 'cot-touch-layout';
  const root = new FakeElement(['.cot-hud'], { x: 0, y: 0, w: v.width, h: v.height });
  root.classList.toggle = () => false;
  const el = (selectors, rect) => new FakeElement(selectors, rect);
  const fire = el(['.cot-touch.on .round', '.cot-touch .round', '.cot-touch.on .fire', '.cot-touch .fire'], o.fire);
  fire.classList.contains = (c) => c === 'fire';
  const joy = el(['.cot-touch.on .joy', '.cot-touch .joy'], o.joy);
  joy.classList.contains = (c) => c === 'joy';
  for (const key of ['fireAlt', 'scope', 'autoaim']) el(['.cot-touch.on .round', '.cot-touch .round'], o[key]);
  el(['.cot-touch.on .mobile-chrome', '.cot-touch .mobile-chrome'], o.chrome);
  const cons = el(['.cot-cons'], { x: o.con0.x, y: o.con0.y, w: o.con0.w, h: o.con2.y + o.con2.h - o.con0.y });
  const shells = el(['.cot-shells'], o.ammo);
  shells.classList.contains = (c) => c === 'cot-shells';
  for (let i = 0; i < 3; i++) { const shell = new FakeElement(['.cot-shell'], o.ammo); shell.classList.contains = (c) => c === 'cot-shell'; shells.append(shell); }
  for (const [key, selector] of [['dp', '.cot-dp'], ['drive', '.cot-drive'], ['minimap', '.cot-minimap'], ['top', '.cot-top'], ['mode', '.cot-mode-status.show'], ['net', '.cot-net']]) el([selector], o[key]);
  // The centre notices and the countdown: their natural boxes (the measured 320 x 568 phone's) are the plan's inputs.
  for (const [selector, box] of [['.cot-sixth', v.centre.detection], ['.cot-alert', { w: 160, h: v.centre.alertLine }], ['.cot-prebattle', v.centre.countdown]]) {
    const node = el([selector], { x: (v.width - box.w) / 2, y: 111, ...box });
    node.offsetWidth = box.w; node.offsetHeight = box.h;
    root.append(node);
  }
  // touchControls.ts: the swipe-to-aim pad, the right 62 % of the screen below 18 % of its height.
  const aimPad = el(['.cot-touch-aim.on .aimpad'], { x: v.width * .38, y: v.height * .18, w: v.width * .62, h: v.height * .82 });
  const row = el(['.cot-vehicle-controls'], { x: 12, y: 300, w: 300, h: 44 });
  const tiles = Array.from({ length: 7 }, (_, i) => { const tile = new FakeElement([`.cot-vehicle-controls>button`], { x: 12 + i * 77, y: 300, w: 74, h: 44 }, 'button'); row.append(tile); return tile; });
  const document = {
    body, querySelector: (selector) => all.find((n) => n.matches(selector) && n.selectors.length) ?? null,
    querySelectorAll: (selector) => all.filter((n) => n.matches(selector)),
    createElement: (tag) => new FakeElement([], tag === 'button' ? { x: 0, y: 0, w: 48, h: 48 } : null, tag),
    addEventListener: (type, fn, capture) => documentListeners.push({ type, fn, capture }),
  };
  // A placed tile and the More tile match the row-child selector like the real buttons.
  const realCreate = document.createElement;
  document.createElement = (tag) => { const node = realCreate(tag); if (tag === 'button') node.selectors.push('.cot-vehicle-controls>button'); return node; };
  globalThis.document = document;
  globalThis.window = { innerWidth: v.width, innerHeight: v.height, visualViewport: { width: v.width, height: v.height, addEventListener() {} }, addEventListener() {} };
  globalThis.getComputedStyle = () => ({ visibility: 'visible', paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px' });
  globalThis.requestAnimationFrame = (fn) => { const id = nextFrame++; frames.set(id, fn); return id; };
  globalThis.ResizeObserver = class { constructor(fn) { resizeCallback = fn; } observe(target) { resizeTargets.add(target); } };
  globalThis.PointerEvent = class { constructor(type, init) { Object.assign(this, init); this.type = type; } };
  globalThis.MutationObserver = class { constructor(fn) { mutationCallback = fn; } observe(target) { mutationTargets.add(target); } };
  const flush = () => { const work = [...frames.values()]; frames.clear(); for (const fn of work) fn(); };
  const { installBattleHudLayout } = await import('./battleHudLayout.ts');
  installBattleHudLayout(root);
  flush();
  // A later relayout (any lane change) also starts watching the More tile the first one appended.
  resizeCallback([]); flush();
  assert.ok(body.hasAttribute('data-hud-dock'), 'the touch page docks the row');
  const more = row.children.at(-1);
  assert.ok(more.selectors.includes('.cot-vehicle-controls>button') && more.attrs.get('class') === undefined && more.className === 'cot-dock-more', 'the dock appends its More tile to the row');
  const tileSize = Number.parseFloat(body.style.getPropertyValue('--hud-systems-tile'));
  const dockLeft = Number.parseFloat(body.style.getPropertyValue('--hud-systems-left'));
  const dockTop = Number.parseFloat(body.style.getPropertyValue('--hud-systems-top'));
  const cons0 = { x: o.con0.x, y: o.con0.y, w: o.con0.w, h: o.con2.y + o.con2.h - o.con0.y };
  const plan = planTouchCentre({ width: v.width, height: v.height, top: o.mode.y + o.mode.h + 8, count: 7,
    controls: [o.joy, o.fire, o.fireAlt, o.scope, o.autoaim, o.chrome, cons0, o.ammo], instruments: [o.dp, o.drive, o.minimap, o.top, o.mode, o.net],
    drawer: [o.ammoDrawerOpen], lanes: [touchAimWarningSlot(v.width, v.height, o.minimap.y + o.minimap.h)],
    keepOut: touchAimKeepOut(v.width, v.height, o.minimap.y + o.minimap.h), anchor: { x: (o.joy.x * 2 + o.joy.w + o.fire.x * 2 + o.fire.w) / 4, y: (o.joy.y * 2 + o.joy.h + o.fire.y * 2 + o.fire.h) / 4 },
    // 320 x 568's feeds show no row on main (its strip stood just under the settings), so they reserve nothing; the
    // copies the owner measures have no size here, so the compact notices take their least boxes.
    feeds: [], reference: [],
    compact: [180, 150, 120].map((w) => ({ detection: { w: 120, h: 32 }, alert: { w, h: 28 } })),
    detection: v.centre.detection, alert: alertReserve(v.width, v.centre.alertLine), countdown: v.centre.countdown });
  const expected = plan.dock;
  // The notices and the countdown take the plan's places (applyCentre: centre x, top, width; compact when needed).
  assert.equal(body.getAttribute('data-hud-notices'), plan.notices.compact ? 'compact' : 'full', 'the page applies the notices\' plan');
  assert.equal(body.style.getPropertyValue('--hud-notice-x'), `${Math.round((plan.notices.detection.x + plan.notices.detection.w / 2) * 10) / 10}px`);
  assert.equal(body.style.getPropertyValue('--hud-notice-top'), `${Math.floor(plan.notices.detection.y)}px`);
  assert.equal(body.style.getPropertyValue('--hud-alert-top'), `${Math.floor(plan.notices.alert.y)}px`);
  assert.equal(body.getAttribute('data-hud-countdown'), plan.countdown.compact ? 'compact' : 'full', 'and the countdown\'s');
  assert.equal(body.style.getPropertyValue('--hud-countdown-top'), `${Math.round(plan.countdown.y * 10) / 10}px`);
  assert.deepEqual([tileSize, dockLeft, dockTop], [expected.tile, Math.floor(expected.x), Math.floor(expected.y)], 'the page uses the solver\'s placement');
  for (const [i, tile] of tiles.entries()) {
    const slot = i < expected.shown ? expected.tiles[i] : expected.flyout[i - expected.shown];
    assert.equal(tile.style.getPropertyValue('--dock-x'), `${slot.x - expected.x}px`, `tile ${i} x`);
    assert.equal(tile.style.getPropertyValue('--dock-y'), `${slot.y - expected.y}px`, `tile ${i} y`);
    assert.equal(tile.hasAttribute('data-dock-overflow'), i >= expected.shown);
  }
  assert.equal(expected.more, true, 'seven controls overflow a 320 px phone');
  assert.equal(more.hidden, false, 'More shows when controls wait behind it');
  // Presses: FIRE, the scope, the joystick and the tiles are watched by size only, never by class.
  for (const node of [fire, joy, cons, ...tiles, more]) {
    assert.ok(resizeTargets.has(node), 'size-observed');
    assert.ok(!mutationTargets.has(node), 'never class-observed: a FIRE press (down/aiming/autofire) or a tile cooldown cannot relayout the HUD');
  }
  assert.ok(mutationCallback, 'the HUD still watches its lanes');
  // An unchanged layout reuses the placement and leaves an open More panel open; so does a control or instrument that
  // moves without moving the dock (the damage panel growing on a hit); one that moves the dock closes it.
  body.toggleAttribute('data-hud-dock-open', true);
  resizeCallback([]); flush();
  assert.ok(body.hasAttribute('data-hud-dock-open'), 'a relayout with unchanged inputs keeps the panel open');
  fire.rect = { ...fire.rect, y: fire.rect.y - 1 };
  resizeCallback([]); flush();
  assert.ok(body.hasAttribute('data-hud-dock-open'), 'a moved control that leaves the dock where it is keeps it open');
  const resting = fire.rect;
  fire.rect = { x: dockLeft, y: dockTop, w: 82, h: 82 };
  resizeCallback([]); flush();
  assert.ok(!body.hasAttribute('data-hud-dock-open'), 'a control moved onto the dock moves it and closes the panel');
  assert.notEqual(Number.parseFloat(body.style.getPropertyValue('--hud-systems-left')) * 1e4 + Number.parseFloat(body.style.getPropertyValue('--hud-systems-top')),
    dockLeft * 1e4 + dockTop, 'the dock moved off the control');
  fire.rect = { ...resting, y: resting.y + 1 };
  resizeCallback([]); flush();
  // Holding FIRE (.down, scale .94 about its centre) through a relayout: the pressed button keeps its resting box, so
  // the placement and an open More panel stand (verifier 2026-10-15: a hit notice during a hold closed the panel).
  {
    const resting = fire.rect;
    body.toggleAttribute('data-hud-dock-open', true);
    fire.pressed = true;
    fire.rect = { x: resting.x + resting.w * .03, y: resting.y + resting.h * .03, w: resting.w * .94, h: resting.h * .94 };
    resizeCallback([]); flush();
    assert.ok(body.hasAttribute('data-hud-dock-open'), 'holding FIRE through a relayout keeps the placement and the open panel');
    fire.pressed = false; fire.rect = resting;
    resizeCallback([]); flush();
    assert.ok(body.hasAttribute('data-hud-dock-open'), 'and so does releasing it');
    body.toggleAttribute('data-hud-dock-open', false);
  }
  // Tap or swipe: a docked tile acts when a touch lifts within 10 px, through its keyboard path (click, detail 0); a
  // touch that travels farther acts on nothing and, begun over the aim pad, becomes the pad's swipe from where it began.
  {
    const shown = tiles[0];
    const centre = (node) => ({ clientX: node.rect.x + node.rect.w / 2, clientY: node.rect.y + node.rect.h / 2 });
    const before = shown.clicks ?? 0;
    const down = dispatch(shown, 'pointerdown', { ...centre(shown), pointerId: 7 });
    assert.equal(shown.clicks ?? 0, before, 'a touch on a tile does not act on touch-down');
    dispatch(shown, 'pointermove', { clientX: down.clientX + 6, clientY: down.clientY + 5, pointerId: 7 });
    dispatch(shown, 'pointerup', { clientX: down.clientX + 6, clientY: down.clientY + 5, pointerId: 7 });
    assert.equal(shown.clicks, before + 1, 'lifted within the tap slop, it acts once');
    // A swipe begun on a tile over the aim pad aims.
    const start = { clientX: aimPad.rect.x + 30, clientY: aimPad.rect.y + aimPad.rect.h - 60, pointerId: 8 };
    dispatch(shown, 'pointerdown', start);
    dispatch(shown, 'pointermove', { clientX: start.clientX + 4, clientY: start.clientY, pointerId: 8 });
    assert.equal(aimPad.received?.length ?? 0, 0, 'within the slop nothing is handed over yet');
    dispatch(shown, 'pointermove', { clientX: start.clientX + 34, clientY: start.clientY - 12, pointerId: 8 });
    dispatch(aimPad, 'pointerup', { clientX: start.clientX + 34, clientY: start.clientY - 12, pointerId: 8 });
    assert.deepEqual(aimPad.received.map((e) => [e.type, e.pointerId, e.clientX, e.clientY]),
      [['pointerdown', 8, start.clientX, start.clientY], ['pointermove', 8, start.clientX + 34, start.clientY - 12]], 'the aim pad takes the swipe from where it began');
    assert.equal(shown.clicks, before + 1, 'and the tile does not act');
    // Begun outside the aim pad, a swipe is nothing at all.
    aimPad.received = [];
    dispatch(shown, 'pointerdown', { clientX: aimPad.rect.x - 20, clientY: aimPad.rect.y + 40, pointerId: 9 });
    dispatch(shown, 'pointermove', { clientX: aimPad.rect.x - 50, clientY: aimPad.rect.y + 40, pointerId: 9 });
    dispatch(shown, 'pointerup', { clientX: aimPad.rect.x - 50, clientY: aimPad.rect.y + 40, pointerId: 9 });
    assert.deepEqual([aimPad.received.length, shown.clicks], [0, before + 1], 'a swipe off the aim pad neither aims nor acts');
    // A mouse keeps acting on press (the tile's own pointerdown runs).
    let ownPress = 0;
    shown.listeners.set('pointerdown', () => { ownPress++; });
    dispatch(shown, 'pointerdown', { pointerType: 'mouse', pointerId: 10 });
    assert.equal(ownPress, 1, 'a mouse press reaches the tile');
    dispatch(shown, 'pointerdown', { pointerType: 'touch', pointerId: 11 });
    assert.equal(ownPress, 1, 'a touch press waits for the lift');
    dispatch(shown, 'pointercancel', { pointerId: 11 });
    assert.equal(shown.clicks, before + 1, 'a cancelled touch acts on nothing');
    shown.listeners.delete('pointerdown');
  }
  // Opening: the More tile's pointerdown toggles; any other press closes the panel (capture phase, after which the
  // pressed control still acts).
  {
    body.toggleAttribute('data-hud-dock-open', false);
    // A tap: down, up (a docked tile acts on the lift), then the browser's own click (detail 1, which tiles ignore);
    // or a keyboard activation alone (click, detail 0).
    const press = (target, type = 'pointerdown', detail = 1) => {
      if (type === 'click') { dispatch(target, 'click', { detail }); return; }
      dispatch(target, 'pointerdown', { pointerId: 3 });
      dispatch(target, 'pointerup', { pointerId: 3 });
      dispatch(target, 'click', { detail: 1 });
    };
    press(more);
    assert.ok(body.hasAttribute('data-hud-dock-open') && more.getAttribute('aria-expanded') === 'true', 'More opens the panel');
    press(tiles[6]);
    assert.ok(!body.hasAttribute('data-hud-dock-open') && more.getAttribute('aria-expanded') === 'false', 'a press on a control behind More closes the panel');
    press(more); press(joy);
    assert.ok(!body.hasAttribute('data-hud-dock-open'), 'steering closes it');
    press(more); press(more);
    assert.ok(!body.hasAttribute('data-hud-dock-open'), 'More toggles');
    press(more); press(tiles[6], 'click', 0);
    assert.ok(!body.hasAttribute('data-hud-dock-open'), 'a keyboard activation behind More closes it too');
    assert.match(more.getAttribute('aria-label'), /7|\d more vehicle controls/, 'More names how many controls wait behind it');
  }
} finally {
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
}
assert.match(layout, /observeSize\('\.cot-touch \.joy,\.cot-touch \.round,\.cot-touch-aim \.aimhint,\.cot-cons,\.cot-vehicle-controls>button'\);/, 'touch buttons, the aim hint and tiles: by size only');
// Round 5's counterexamples: each round button's caption is part of the control (its band at least as wide as the
// button, so a caption that changes with the button's state moves nothing), and the swipe-to-aim hint is an obstacle
// for the dock alone (the notices may pass over it). A caption is never size-observed: FIRE's changes on every press.
assert.match(layout, /if \(node\.classList\.contains\('round'\)\) \{\n\s*const caption = node\.querySelector<HTMLElement>\(':scope>\.lb'\);[\s\S]{0,260}const half = Math\.max\(rect\.w, c\.width\) \/ 2, mid = rect\.x \+ rect\.w \/ 2;/);
assert.ok(layout.indexOf("node.querySelector<HTMLElement>(':scope>.lb')") < layout.indexOf("if (node.matches('.down,:active')) rect = restingBoxes.get(node) ?? rect;"), 'a pressed button keeps its resting caption band');
assert.match(layout, /const hint = read\('\.cot-touch-aim\.on \.aimhint'\);\n\s*if \(hint && hint\.width >= 1 && hint\.height >= 1\) dockInstruments\.push\(/);
assert.ok(layout.indexOf("const hint = read('.cot-touch-aim.on .aimhint');") > layout.indexOf('instrumentCount = dockInstruments.length;'), 'the hint is a dock-only obstacle (after the notices\' instruments)');
assert.doesNotMatch(layout, /observeSize\('[^']*\.lb/, 'no caption is size-observed');
// The dock's keep-out is the reticle's footprint less the scope's cross arms (their tips are yielded live, hud.ts drawScope
// reports them), and the gun-limit warning's place; a portrait phone's warning is 140 px wide.
for (const { width, height, obstacles } of VIEWPORTS) {
  const footprint = touchReticleFootprint(width, height), mb = obstacles.minimap.y + obstacles.minimap.h;
  assert.deepEqual(touchAimKeepOut(width, height, mb), [footprint[0], ...footprint.slice(3), touchAimWarningSlot(width, height, mb)], `${width}x${height}: the dock's keep-out`);
  const slot = touchAimWarningSlot(width, height, mb);
  if (height > width && width > 340) assert.equal(slot.w, width <= 480 ? TOUCH_AIM_WARNING_PORTRAIT_W : 180, `${width}x${height}: the portrait warning's width`);
}
assert.equal(TOUCH_AIM_WARNING_PORTRAIT_W, 140);
assert.match(css, /@media \(min-width:341px\) and \(max-width:480px\) and \(orientation:portrait\)\{\n\s*\.cot-aim-warning\{width:140px\}\n\}/, 'a portrait phone\'s warning is 140 px');
assert.match(hud, /if \(dockYield\.active\) \{\n\s*const reach = armEnd \+ TOUCH_ACTION_RETICLE_READOUTS\.armReachPx - 3, half = TOUCH_ACTION_RETICLE_READOUTS\.armHalfWidthPx;\n\s*dockYield\.rect\(cx - reach, cy - half, reach \* 2, half \* 2\);\n\s*dockYield\.rect\(cx - half, cy - reach, half \* 2, reach \* 2\);\n\s*\}\n\s*paintScopeCrossArms\(cx, cy, gap, armEnd,/,
  'the scope reports its cross arms to the dock\'s live yield before it paints them');
assert.doesNotMatch(layout.match(/observe\('[^']*'(?:, true)?\);/g).join('\n'), /cot-touch \.(?:fire|round|joy|autoaim|scope)|cot-cons|cot-vehicle-controls>button/,
  'no touch button or tile is class-observed');
assert.match(layout, /if \(!dockPlan \|\| dockKey\.length !== dockInputs\.length \|\| dockKey\.some\(\(value, i\) => value !== dockInputs\[i\]\)\) \{/, 'the solver runs only when its inputs change');
// The dock's inputs never include the feeds' current rows (only main's lanes at their fullest): kills and hits never move it.
assert.match(layout, /for \(const list of \[dockControls, dockInstruments, noticeObstacles, feeds\.lanes, feeds\.reference\]\) \{/);
assert.doesNotMatch(layout.slice(layout.indexOf('dockKey.length = 0;'), layout.indexOf('noticeKey.length = 0;')), /feeds\.rows/, 'the dock never keys on the feeds\' rows');
assert.match(read('./i18nCatalog.en-US.json'), /"systems\.more": "\{count\} more vehicle controls",/);
assert.match(read('./i18nCatalog.zh-CN.json'), /"systems\.more": "另外 \{count\} 个车辆控制",/);

console.log(`touchActionDock: ${receiptTouchCases.length} touch cases (${VIEWPORTS.length} sizes) x 1-7 controls x objective/standard = ${placements} placements (planTouchCentre) keep the rule (tiles >= 44 px, no scroll, no control, caption, instrument or aim hint covered, the reticle's footprint in every sight at every bloom (the scope's arm tips yielded live) and the gun-limit warning's place clear, main's feed lanes never entered, never fewer controls on screen than main's strip showed whole, More beyond what fits; reserved lanes given up only where nothing else fits: ${[...lanesGivenUp].join(', ') || 'none'}); ${placed} random layouts; footprint pinned to hud.ts; a tile acts on a tap and hands a swipe to the aim pad; FIRE presses and holds never relayout\n  ${summary.join('\n  ')}`);
