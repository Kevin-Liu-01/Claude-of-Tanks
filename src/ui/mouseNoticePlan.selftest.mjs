import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  alertReserve, detectionHeight, MOUSE_NOTICE_GAP_PX, MOUSE_RETICLE, MOUSE_RETICLE_MARGIN_PX, mouseNoticePlanWork, mouseReticleFootprint,
  planMouseNotices,
} from './mouseNoticePlan.ts';
import { battleRosterHeight } from './battleHudLayout.ts';

// The mouse census viewports (desk-notices round, 2026-10-16): the fixed HUD boxes the rendered fixture
// (tools/fixtures/battle-hud-layout.html, mars objective, 7 v 7) measured on integ/226, [x, y, w, h]; lanes are
// [left top, left bottom, right top, right bottom] as battleHudLayout.ts derives them; cd the countdown's natural box.
const VIEWPORTS = [
  { vp: [1024, 600], score: [349, 0, 326, 62], obj: [382, 62, 260, 41], earL: [0, 58, 160, 133], earR: [864, 58, 160, 105], map: [816, 392, 192, 192], dp: [12, 405, 160, 183], drive: [184, 480, 108, 108], sys: [320, 480, 382, 32], ammo: [296, 520, 433, 64], card: [708, 196, 300, 184], net: [887, 8, 127, 28], lanes: [199, 361, 171, 188], cd: [390, 136] },
  { vp: [1000, 600], score: [337, 0, 326, 62], obj: [370, 62, 260, 41], earL: [0, 58, 160, 133], earR: [840, 58, 160, 105], map: [792, 392, 192, 192], dp: [12, 405, 160, 183], drive: [184, 480, 108, 108], sys: [308, 480, 382, 32], ammo: [284, 520, 433, 64], card: [684, 196, 300, 184], net: [863, 8, 127, 28], lanes: [199, 361, 171, 188], cd: [390, 136] },
  { vp: [1024, 768], score: [349, 0, 326, 62], obj: [382, 62, 260, 41], earL: [0, 58, 160, 189], earR: [864, 58, 160, 169], map: [788, 532, 220, 220], dp: [12, 573, 160, 183], drive: [184, 648, 108, 108], sys: [320, 648, 382, 32], ammo: [296, 688, 433, 64], card: [708, 260, 300, 260], net: [887, 8, 127, 28], lanes: [255, 529, 235, 252], cd: [390, 136] },
  { vp: [1152, 648], score: [404, 0, 344, 62], obj: [437, 62, 278, 41], earL: [0, 52, 172, 133], earR: [980, 52, 172, 105], map: [929, 425, 207, 207], dp: [12, 453, 160, 183], drive: [184, 528, 108, 108], sys: [384, 528, 382, 32], ammo: [360, 568, 433, 64], card: [836, 190, 300, 222], net: [1015, 8, 127, 28], lanes: [193, 409, 165, 182], cd: [390, 136] },
  { vp: [1280, 720], score: [468, 0, 344, 62], obj: [501, 62, 278, 41], earL: [0, 52, 179, 189], earR: [1101, 52, 179, 127], map: [1044, 484, 220, 220], dp: [12, 525, 160, 183], drive: [184, 600, 108, 108], sys: [448, 600, 382, 32], ammo: [424, 640, 433, 64], card: [964, 212, 300, 260], net: [1143, 8, 127, 28], lanes: [249, 481, 187, 204], cd: [390, 136] },
  { vp: [1280, 800], score: [468, 0, 344, 62], obj: [501, 62, 278, 41], earL: [0, 52, 179, 189], earR: [1101, 52, 179, 189], map: [1044, 564, 220, 220], dp: [12, 605, 160, 183], drive: [184, 680, 108, 108], sys: [448, 680, 382, 32], ammo: [424, 720, 433, 64], card: [964, 292, 300, 260], net: [1143, 8, 127, 28], lanes: [249, 561, 249, 284], cd: [390, 136] },
  { vp: [1366, 768], score: [511, 0, 344, 62], obj: [544, 62, 278, 41], earL: [0, 52, 191, 189], earR: [1175, 52, 191, 175], map: [1130, 532, 220, 220], dp: [12, 573, 160, 183], drive: [184, 648, 108, 108], sys: [491, 648, 382, 32], ammo: [467, 688, 433, 64], card: [1050, 260, 300, 260], net: [1229, 8, 127, 28], lanes: [249, 529, 235, 252], cd: [390, 136] },
  { vp: [1440, 900], score: [548, 0, 344, 62], obj: [581, 62, 278, 41], earL: [0, 52, 194, 189], earR: [1246, 52, 194, 189], map: [1204, 664, 220, 220], dp: [12, 705, 160, 183], drive: [184, 780, 108, 108], sys: [528, 780, 382, 32], ammo: [504, 820, 433, 64], card: [1124, 392, 300, 260], net: [1303, 8, 127, 28], lanes: [249, 661, 249, 384], cd: [390, 136] },
  { vp: [1536, 864], score: [596, 0, 344, 62], obj: [629, 62, 278, 41], earL: [0, 52, 194, 189], earR: [1342, 52, 194, 189], map: [1300, 628, 220, 220], dp: [12, 669, 160, 183], drive: [184, 744, 108, 108], sys: [576, 744, 382, 32], ammo: [552, 784, 433, 64], card: [1220, 356, 300, 260], net: [1399, 8, 127, 28], lanes: [249, 625, 249, 348], cd: [390, 136] },
  { vp: [1600, 900], score: [628, 0, 344, 62], obj: [661, 62, 278, 41], earL: [0, 52, 194, 189], earR: [1406, 52, 194, 189], map: [1364, 664, 220, 220], dp: [12, 705, 160, 183], drive: [184, 780, 108, 108], sys: [608, 780, 382, 32], ammo: [584, 820, 433, 64], card: [1284, 392, 300, 260], net: [1463, 8, 127, 28], lanes: [249, 661, 249, 384], cd: [390, 136] },
  { vp: [1680, 1050], score: [668, 0, 344, 62], obj: [701, 62, 278, 41], earL: [0, 52, 194, 189], earR: [1486, 52, 194, 189], map: [1444, 814, 220, 220], dp: [12, 855, 160, 183], drive: [184, 930, 108, 108], sys: [648, 930, 382, 32], ammo: [624, 970, 433, 64], card: [1364, 542, 300, 260], net: [1543, 8, 127, 28], lanes: [249, 811, 249, 534], cd: [390, 136] },
  { vp: [1920, 1080], score: [788, 0, 344, 62], obj: [821, 62, 278, 41], earL: [0, 52, 194, 189], earR: [1726, 52, 194, 189], map: [1684, 844, 220, 220], dp: [12, 885, 160, 183], drive: [184, 960, 108, 108], sys: [768, 960, 382, 32], ammo: [744, 1000, 433, 64], card: [1604, 572, 300, 260], net: [1783, 8, 127, 28], lanes: [249, 841, 249, 564], cd: [390, 136] },
  { vp: [2560, 1440], score: [1108, 0, 344, 62], obj: [1141, 62, 278, 41], earL: [0, 52, 194, 189], earR: [2366, 52, 194, 189], map: [2324, 1204, 220, 220], dp: [12, 1245, 160, 183], drive: [184, 1320, 108, 108], sys: [1088, 1320, 382, 32], ammo: [1064, 1360, 433, 64], card: [2244, 932, 300, 260], net: [2423, 8, 127, 28], lanes: [249, 1201, 249, 924], cd: [390, 136] },
  { vp: [3440, 1440], score: [1548, 0, 344, 62], obj: [1581, 62, 278, 41], earL: [0, 52, 194, 189], earR: [3246, 52, 194, 189], map: [3204, 1204, 220, 220], dp: [12, 1245, 160, 183], drive: [184, 1320, 108, 108], sys: [1528, 1320, 382, 32], ammo: [1504, 1360, 433, 64], card: [3124, 932, 300, 260], net: [3303, 8, 127, 28], lanes: [249, 1201, 249, 924], cd: [390, 136] },
  { vp: [820, 1180], score: [247, 0, 326, 62], obj: [280, 62, 260, 41], earL: [0, 58, 160, 189], earR: [660, 58, 160, 189], map: [584, 944, 220, 220], dp: [12, 869, 160, 183], drive: [184, 944, 108, 108], sys: [12, 1076, 382, 32], ammo: [12, 1116, 325, 52], card: [504, 672, 300, 260], net: [683, 8, 127, 28], lanes: [255, 825, 255, 664], cd: [390, 136] },
  { vp: [768, 1024], score: [221, 0, 326, 62], obj: [254, 62, 260, 41], earL: [0, 58, 160, 189], earR: [608, 58, 160, 189], map: [532, 788, 220, 220], dp: [12, 713, 160, 183], drive: [184, 788, 108, 108], sys: [12, 920, 382, 32], ammo: [12, 960, 325, 52], card: [452, 516, 300, 260], net: [631, 8, 127, 28], lanes: [255, 669, 255, 508], cd: [390, 136] },
  { vp: [540, 720], score: [110, 4, 320, 57], obj: [143, 61, 254, 41], map: [8, 109, 104, 104], dp: [8, 455, 120, 137], drive: [140, 511, 81, 81], sys: [144, 620, 382, 32], ammo: [231, 660, 301, 52], card: [282, 251, 246, 260], net: [120, 109, 88, 20], lanes: [221, 410, 109, 243], cd: [292, 136] },
  { vp: [390, 844], score: [44, 4, 302, 57], obj: [77, 61, 236, 41], map: [8, 109, 104, 104], dp: [8, 579, 120, 137], drive: [140, 635, 81, 81], sys: [12, 744, 366, 32], ammo: [81, 784, 301, 52], card: [203, 375, 175, 260], net: [120, 109, 88, 20], lanes: [221, 534, 109, 367], cd: [358, 136] },
  { vp: [844, 390], score: [259, 0, 326, 62], obj: [292, 62, 260, 41], map: [703, 249, 125, 125], dp: [12, 217, 160, 45], drive: [184, 154, 108, 108], sys: [12, 286, 382, 32], ammo: [12, 326, 325, 52], card: [528, 115, 300, 122], net: [707, 8, 127, 28], lanes: [111, 146, 111, 107], cd: [240, 136] },
];
const box = ([x, y, w, h]) => ({ x, y, w, h });
/** The planner's input as battleHudLayout.ts assembles it from those boxes (each roster down to its Tab height). */
function inputFor(v, { objective = true, rosters = 7 } = {}) {
  const [width, height] = v.vp;
  const top = objective ? v.obj[1] + v.obj[3] : v.score[1] + v.score[3];
  const wide = (ear, available) => ear && [ear[0], ear[1], ear[2], Math.max(ear[3], battleRosterHeight(height, available, 48, rosters, true))];
  const earL = wide(v.earL, v.lanes[1] - (v.earL?.[1] ?? 0));
  const earR = wide(v.earR, Math.min(v.map[1] - 12, height - 92) - (v.earR?.[1] ?? 0));
  if (earR) earR[3] = Math.min(earR[3], Math.max(v.earR[3], v.card[1] - v.earR[1] - 32));
  const obstacles = [v.score, ...(objective ? [v.obj] : []), earL, earR, v.map, v.dp, v.drive, v.sys, v.ammo, v.card, v.net].filter(Boolean).map(box);
  obstacles.push({ x: v.dp[0], y: v.dp[1] - 36, w: v.dp[2], h: 36 });
  const side = Math.min(400, width / 2 - 24);
  const lane = (x, from, to) => to - from >= 26 ? { x, w: side, top: from, bottom: to } : null;
  return {
    width, height, top, obstacles,
    lanes: [lane(0, v.lanes[0], v.lanes[1]), lane(width - side, v.lanes[2], v.lanes[3])],
    smallAlert: height <= 550 || width <= 480, compactDetection: height <= 550,
    countdown: { w: v.cd[0], h: v.cd[1] }, revive: { w: Math.min(390, width - 32), h: 129 },
    medal: width > 640 ? { w: Math.min(380, width - 32), h: 85 } : { w: Math.min(270, width - 32), h: 75 },
    medalCompact: { w: Math.min(250, width - 24), h: 40 },
  };
}

const overlap = (a, b, gap = 0) => a.x < b.x + b.w + gap && a.x + a.w > b.x - gap && a.y < b.y + b.h + gap && a.y + a.h > b.y - gap;
/** How far `r` reaches into the footprint (with the reticle margin), 0 when clear. */
function intrusion(r, keep) {
  let worst = 0;
  const m = MOUSE_RETICLE_MARGIN_PX - .01;
  for (const k of keep) {
    if ('r' in k) {
      const dx = Math.max(r.x - k.cx, 0, k.cx - (r.x + r.w)), dy = Math.max(r.y - k.cy, 0, k.cy - (r.y + r.h));
      worst = Math.max(worst, k.r + m - Math.hypot(dx, dy));
    } else if (overlap(r, k, m)) {
      worst = Math.max(worst, Math.min(r.x + r.w - (k.x - m), k.x + k.w + m - r.x, r.y + r.h - (k.y - m), k.y + k.h + m - r.y));
    }
  }
  return worst;
}
const alertBox = (a) => ({ x: a.anchor === 'centre' ? a.x - a.w / 2 : a.anchor === 'start' ? a.x : a.x - a.w, y: a.y, w: a.w, h: a.h, giveWay: a.giveWay });

// 1. The footprint restates hud.ts and aerialHud.css; a change there fails here until MOUSE_RETICLE follows.
const hud = readFileSync(new URL('./hud.ts', import.meta.url), 'utf8');
const aerialCss = readFileSync(new URL('./aerialHud.css', import.meta.url), 'utf8');
assert.match(hud, /const RET_FLOOR_PX = 11;/);
assert.match(hud, /const RET_CEIL_FRAC = 0\.15;/);
assert.equal(MOUSE_RETICLE.ringFloorPx, 11);
assert.equal(MOUSE_RETICLE.ringCeilFraction, .15);
assert.match(hud, /const armEnd = radius \* 1\.55 \+ 3;/, 'scope arms reach 1.55 r + 3');
assert.match(hud, /paintScopeCrossArms\(cx, cy, gap, armEnd, 'rgba\(4,7,6,0\.38\)', 2\.4\);/, 'the arms\' under-stroke is 2.4 px');
assert.match(hud, /if \(h <= 300\) return draw\.cy \+ 32;\s+if \(h <= 430\) return draw\.cy \+ 44;\s+return Math\.min\(\s+draw\.cy \+ Math\.max\(draw\.radius \* 1\.02 \+ 24, draw\.radius \* 1\.55 \+ 18, 96\),\s+h - 176,\s+\);/,
  'sniperAmmoReadoutY is the footprint\'s ammoOffset');
assert.match(hud, /const y = sniperAmmoReadoutY\(draw\) \+ \(h <= 300 \? 18 : 24\);/, 'the zoom plate sits 24 px (18) under the ammunition');
assert.match(hud, /const y = draw\.cy \+ Math\.max\(62, draw\.radius \+ 24\);/, 'the gun-limit chip sits at cy + max(62, r + 24)');
assert.match(hud, /const offset = 0\.7071 \* \(draw\.radius \+ 9\);/, 'the range tag rides the ring\'s 4:30 point');
assert.match(aerialCss, /\.cot-hud \.cot-scope-vision\{[^}]*top:calc\(50% \+ 145px\)[^}]*min-height:48px/, 'the scope-vision toggle opens 145 px under the aim point');
assert.equal(MOUSE_RETICLE.visionTopPx, 145);

// 2. The footprint covers the census's measured ink (union of every .cot-ret pixel, alpha >= 12, readouts and the
//    gun-limit chip included; x0, y0, x1, y1) at every viewport: battle full bloom, scope full bloom.
const INK = {
  '1024x600': [[420, 208, 604, 426], [369, 157, 655, 450]], '1000x600': [[408, 208, 592, 426], [357, 157, 643, 450]],
  '1024x768': [[395, 267, 629, 535], [330, 202, 694, 607]], '1152x648': [[477, 225, 675, 457], [422, 170, 730, 498]],
  '1280x720': [[530, 250, 750, 504], [469, 189, 811, 570]], '1280x800': [[518, 278, 762, 556], [451, 211, 829, 630]],
  '1366x768': [[566, 267, 800, 535], [501, 202, 865, 607]], '1440x900': [[583, 313, 857, 621], [507, 237, 933, 703]],
  '1536x864': [[637, 301, 899, 598], [564, 228, 972, 677]], '1600x900': [[663, 313, 937, 621], [587, 237, 1013, 703]],
  '1680x1050': [[681, 366, 999, 719], [592, 278, 1088, 813]], '1920x1080': [[796, 376, 1124, 738], [705, 286, 1215, 835]],
  '2560x1440': [[1062, 502, 1498, 972], [942, 382, 1618, 1099]], '3440x1440': [[1502, 502, 1938, 972], [1382, 382, 2058, 1099]],
  '820x1180': [[285, 465, 535, 749], [216, 396, 604, 825]], '768x1024': [[267, 395, 501, 663], [202, 330, 566, 735]],
  '540x720': [[187, 277, 353, 477], [141, 231, 399, 530]], '390x844': [[117, 362, 273, 517], [101, 328, 294, 557]],
  '844x390': [[344, 135, 500, 290], [328, 101, 521, 289]],
};
for (const v of VIEWPORTS) {
  const [width, height] = v.vp;
  const [battle, scope] = INK[`${width}x${height}`];
  const bound = (keep) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of keep) {
      const kx0 = 'r' in k ? k.cx - k.r : k.x, ky0 = 'r' in k ? k.cy - k.r : k.y;
      const kx1 = 'r' in k ? k.cx + k.r : k.x + k.w, ky1 = 'r' in k ? k.cy + k.r : k.y + k.h;
      x0 = Math.min(x0, kx0); y0 = Math.min(y0, ky0); x1 = Math.max(x1, kx1); y1 = Math.max(y1, ky1);
    }
    return [x0, y0, x1, y1];
  };
  const b1 = bound(mouseReticleFootprint(width, height, 1)), b2 = bound(mouseReticleFootprint(width, height, 2));
  for (let i = 0; i < 2; i++) {
    assert.ok(b1[i] <= battle[i] + .5 && b1[i + 2] >= battle[i + 2] - .5, `${width}x${height}: the battle footprint spans its measured ink`);
    assert.ok(b2[i] <= scope[i] + .5 && b2[i + 2] >= scope[i + 2] - .5, `${width}x${height}: the full footprint spans the scope's measured ink`);
  }
}

// 3. The alert reserve holds the tallest measured alert (wave 123 cleared, carrier down, ammunition type empty, ATGM
//    deselected; en-US and zh-CN) at each slot width; the detection height is its measured box.
for (const [w, h] of [[520, 38], [409, 50], [334, 52], [260, 67], [234, 70], [180, 101], [159, 118]]) assert.ok(alertReserve(w, false) >= h, `12 px alert at ${w}`);
for (const [w, h] of [[340, 28], [200, 29.6], [159, 40.4]]) assert.ok(alertReserve(w, true) >= h, `9 px alert at ${w}`);
for (const [w, h] of [[248, 48], [230, 48], [214, 52.6], [164, 52.6]]) assert.ok(detectionHeight(w, false) >= h && detectionHeight(w, false) <= h + 1);
assert.equal(detectionHeight(248, true), 32);

// 4. Every viewport, with and without the objective: the detection and the alert clear everything the reticle draws
//    (main's own type size, the detection's second line wherever main shows it); the countdown, the revive count and
//    the medal card each have a place (none falls back to the CSS defaults) clear of the keep-out its tier names, off
//    both notices' places (sharing one only where SHARED lists it); nothing leaves the screen or touches an instrument;
//    a lane an element crosses keeps a row while it shows (and while the detection and the alert show together), and
//    keeps all its rows while nothing shows (the plan holds no lane change outside `giveWay`).
const SHARED = { '844x390': ['countdown', 'revive', 'medal'] };
const TIER_FLOOR = { countdown: 2, revive: 1, medal: 1 };
const LOW_TIER = { '844x390': { revive: 1, medal: 1 }, '540x720': { revive: 1 } };
let plans = 0, slowest = 0, ms = 0, work = 0, mostWork = 0;
for (const v of VIEWPORTS) {
  for (const objective of [true, false]) {
    const input = inputFor(v, { objective });
    const t1 = performance.now();
    const plan = planMouseNotices(input);
    // the countdown, the revive count and the medal card are placed when first read
    void plan.countdown, plan.revive, plan.medal;
    const spent = performance.now() - t1;
    ms += spent;
    slowest = Math.max(slowest, spent);
    work += mouseNoticePlanWork.bands;
    mostWork = Math.max(mostWork, mouseNoticePlanWork.bands);
    plans++;
    const vp = v.vp.join('x'), name = `${vp}${objective ? '' : ' (standard)'}`;
    assert.equal(plan.clearance, 2, `${name}: the notices clear the whole reticle`);
    assert.ok(!('laneTop' in plan), 'no lane moves while nothing shows');
    const keep = mouseReticleFootprint(input.width, input.height);
    const det = plan.detection, alert = alertBox(plan.alert);
    assert.equal(det.h, detectionHeight(det.w, input.compactDetection));
    assert.ok(det.w >= 164 && det.w <= 248, `${name}: the detection is between 164 and 248 wide`);
    assert.equal(plan.alert.small, input.smallAlert, `${name}: the alert keeps main's type size`);
    assert.ok(plan.alert.h >= alertReserve(plan.alert.w, plan.alert.small), `${name}: the alert's slot holds every alert`);
    for (const label of ['countdown', 'revive', 'medal']) assert.ok(plan[label], `${name}: the ${label} has a place`);
    const boxes = [['detection', det, 2], ['alert', alert, 2], ['countdown', plan.countdown], ['revive', plan.revive], ['medal', plan.medal]];
    for (const [label, r, fixedTier] of boxes) {
      const tier = fixedTier ?? r.clearance;
      const floor = LOW_TIER[vp]?.[label] !== undefined ? Math.min(LOW_TIER[vp][label], TIER_FLOOR[label] ?? 2) : (TIER_FLOOR[label] ?? 2);
      assert.ok(tier >= (fixedTier ? 2 : objective ? floor : Math.min(floor, 1)), `${name}: the ${label} clears tier ${tier}`);
      assert.ok(intrusion(r, tier === 2 ? keep : mouseReticleFootprint(input.width, input.height, tier)) <= 0,
        `${name}: the ${label} keeps ${MOUSE_RETICLE_MARGIN_PX} px off the reticle (tier ${tier})`);
      assert.ok(r.x >= 11.5 && r.y >= 0 && r.x + r.w <= input.width - 11.5 && r.y + r.h <= input.height - 11.5, `${name}: the ${label} stays on screen`);
      for (const o of input.obstacles) assert.ok(!overlap(r, o, MOUSE_NOTICE_GAP_PX - .01), `${name}: the ${label} keeps ${MOUSE_NOTICE_GAP_PX} px off ${JSON.stringify(o)}`);
      if (!fixedTier) {
        const shares = overlap(r, det, MOUSE_NOTICE_GAP_PX - .01) || overlap(r, alert, MOUSE_NOTICE_GAP_PX - .01);
        assert.equal(r.sharesNotices, shares, `${name}: the ${label} reports whether it shares a notice's place`);
        // the medal card may wait out a 2.4 s alert in the alert's place, never the 8 s detection
        const sharesDet = overlap(r, det, MOUSE_NOTICE_GAP_PX - .01);
        if (label === 'medal' ? sharesDet : shares) assert.ok(SHARED[vp]?.includes(label), `${name}: the ${label} shares a notice's place`);
      }
      // the lanes' bands while it shows: off the box, each keeping a row
      for (let side = 0; side < 2; side++) {
        const lane = input.lanes[side];
        const [t, b] = [r.giveWay[side * 2], r.giveWay[side * 2 + 1]];
        if (!lane) { assert.ok(Number.isNaN(t) && Number.isNaN(b)); continue; }
        const top = Number.isNaN(t) ? lane.top : t, bottom = Number.isNaN(b) ? lane.bottom : b;
        assert.ok(top >= lane.top && bottom <= lane.bottom, `${name}: the ${label}'s band lies in the lane`);
        assert.ok(bottom - top >= 26, `${name}: a lane keeps a row while the ${label} shows`);
        assert.ok(!overlap(r, { x: lane.x, y: top, w: lane.w, h: bottom - top }, MOUSE_NOTICE_GAP_PX - .01), `${name}: the ${label} keeps off the ${side ? 'right' : 'left'} lane`);
      }
    }
    assert.ok(!overlap(det, alert, MOUSE_NOTICE_GAP_PX - .01), `${name}: the detection and the alert stand apart`);
    for (let side = 0; side < 2; side++) {
      const lane = input.lanes[side];
      if (!lane) continue;
      const pick = (v2, fallback, f) => Number.isNaN(v2) ? fallback : v2;
      const top = Math.max(pick(det.giveWay[side * 2], lane.top), pick(plan.alert.giveWay[side * 2], lane.top));
      const bottom = Math.min(pick(det.giveWay[side * 2 + 1], lane.bottom), pick(plan.alert.giveWay[side * 2 + 1], lane.bottom));
      assert.ok(bottom - top >= 26, `${name}: the ${side ? 'right' : 'left'} lane keeps a row while both notices show`);
    }
    // Tab: a held roster widens up to the nearest element beside it, never narrower than it is
    for (const [ear, side] of [[v.earL, 0], [v.earR, 1]]) {
      if (!ear) continue;
      const wideBottom = input.obstacles.find((o) => o.x === ear[0] && o.y === ear[1]).y + input.obstacles.find((o) => o.x === ear[0] && o.y === ear[1]).h;
      for (const [label, r] of boxes) {
        if (!(r.y < wideBottom + 8 && r.y + r.h > ear[1] - 8)) continue;
        const room = side ? ear[0] + ear[2] - (r.x + r.w) - 8 : r.x - 8 - ear[0];
        assert.ok(room >= ear[2], `${name}: the held ${side ? 'right' : 'left'} roster keeps its width beside the ${label}`);
      }
    }
    // determinism: the same inputs give the same plan
    assert.deepEqual(planMouseNotices(input), plan, `${name}: the plan is a function of its inputs`);
  }
}
// Planning runs once per viewport and HUD arrangement (battleHudLayout.ts caches the last few, and waits for a resize to
// settle). Its work is counted in bands (each a sorted, merged scan of the fixed boxes), so the bound holds on any machine.
assert.ok(work / plans < 2000 && mostWork < 4500, `planning stays cheap (${Math.round(work / plans)} bands a plan, ${mostWork} at most)`);

// 4b. Larger rosters (14 and 20 a side widen the icon grids) keep every guarantee that matters most.
for (const v of VIEWPORTS.filter((x) => x.earL)) for (const rosters of [14, 20]) {
  const input = inputFor(v, { rosters });
  const plan = planMouseNotices(input);
  assert.equal(plan.clearance, 2, `${v.vp.join('x')} r${rosters}: the notices clear the reticle`);
  assert.equal(plan.alert.small, input.smallAlert, `${v.vp.join('x')} r${rosters}: main's type size`);
}

// 5. Main's placements where they were fine: a centred stack under the score from 1280 x 800 up, the detection at
//    main's own top; the flank beside the scope's centre-line arm where only one notice fits above it.
const at = (w, h, objective = true) => planMouseNotices(inputFor(VIEWPORTS.find((v) => v.vp[0] === w && v.vp[1] === h), { objective }));
for (const [w, h] of [[1280, 800], [1440, 900], [1536, 864], [1600, 900], [1680, 1050], [1920, 1080], [2560, 1440], [3440, 1440]]) {
  const plan = at(w, h);
  assert.equal(plan.arrangement, 'stack', `${w}x${h} stacks`);
  assert.equal(plan.detection.x + plan.detection.w / 2, w / 2, `${w}x${h}: the detection is centred`);
  assert.equal(plan.detection.y, Math.max(111, Math.ceil(h * .12)), `${w}x${h}: the detection keeps main's top`);
  assert.equal(plan.alert.y, plan.detection.y + plan.detection.h + 8, `${w}x${h}: the alert sits under the detection`);
  assert.ok(!plan.alert.small && plan.alert.w >= 512, `${w}x${h}: the alert keeps one 12 px line`);
}
for (const [w, h] of [[1024, 600], [1000, 600], [1024, 768], [1152, 648], [1280, 720], [1366, 768]]) {
  const plan = at(w, h);
  assert.equal(plan.arrangement, 'flank', `${w}x${h} flanks the arm`);
  assert.equal(plan.detection.y, 111);
  assert.equal(plan.alert.y, 111);
  assert.ok(plan.detection.x + plan.detection.w <= w / 2 - 10 && plan.alert.x >= w / 2 + 10, `${w}x${h}: either side of the centre line`);
}

// 6. The layout owner calls the plan on the mouse path only, and every rule it drives is keyed to the mouse layout.
const layout = readFileSync(new URL('./battleHudLayout.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('./battleHudLayout.css', import.meta.url), 'utf8');
assert.match(layout, /let plan: MouseNoticePlan \| null = null;\s+if \(!touch\) \{[^}]*?\n[\s\S]*?plan = mouseNoticePlan\(/, 'touch never plans');
assert.equal(layout.match(/= mouseNoticePlan\(/g)?.length, 1, 'one call site');
assert.match(layout, /document\.body\.toggleAttribute\('data-hud-notices', !touch\)/);
for (const rule of css.split('\n').filter((line) => line.includes('[data-hud-notices]'))) {
  assert.match(rule, /\[data-hud-notices\](\[data-hud-alert-type='small'\])?:not\(\.cot-touch-layout\)/, `mouse-only rule: ${rule.slice(0, 80)}`);
}
assert.doesNotMatch(css, /:not\(\.cot-touch-layout\):is\(\[data-cot-width='phone'\],\[data-cot-width='compact'\]\) :is\(\.cot-sixth,\.cot-alert\)/,
  'the old side column next to the aim point is gone');
// the lanes yield only to what is shown, and the held rosters stop short of it
assert.match(layout, /const shown = \[root\.querySelector\('\.cot-sixth\.on'\) && plan\.detection, root\.querySelector\('\.cot-alert\.show'\) && plan\.alert,\s+countdown && plan\.countdown, root\.querySelector\('\.cot-revive\.on'\) && plan\.revive, medalReady && plan\.medal\];/);
assert.match(css, /\.rosters-expanded \.cot-ear\.l\{width:min\(320px,calc\(50vw - 184px\),var\(--hud-roster-wide-left,320px\)\)\}/);
assert.doesNotMatch(css, /data-hud-alert-type/, 'the alert never drops below main\'s type size');

console.log(`mouseNoticePlan.selftest: ${plans} mouse plans clear the reticle, the instruments and the lanes (${Math.round(work / plans)} bands, ${(ms / plans).toFixed(1)} ms a plan; slowest ${slowest.toFixed(1)} ms)`);
