import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  alertReserve, detectionHeight, MOUSE_NOTICE_GAP_PX, MOUSE_RETICLE, MOUSE_RETICLE_MARGIN_PX, mouseMedalWaits, mouseNoticePlanWork,
  mouseReticleFootprint, planMouseNotices,
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
  // the round-1 verifier's odd windows (its census boxes; the report card, the readout and the lanes as battleHudLayout.ts
  // derives them from those): a 768-wide landscape, a 481-wide portrait just above main's 9 px rule, the compact edge
  { vp: [768, 600], score: [221, 0, 326, 62], obj: [254, 62, 260, 41], earL: [0, 58, 160, 74], earR: [608, 58, 160, 105], map: [560, 392, 192, 192], dp: [12, 289, 160, 183], drive: [184, 364, 108, 108], sys: [12, 496, 382, 32], ammo: [12, 536, 325, 52], card: [452, 196, 300, 184], net: [631, 8, 127, 28], lanes: [140, 245, 171, 188], cd: [390, 136] },
  { vp: [481, 700], score: [81, 4, 320, 57], obj: [113, 61, 254, 41], map: [8, 109, 104, 104], dp: [8, 435, 120, 137], drive: [140, 491, 81, 81], sys: [85, 600, 382, 32], ammo: [172, 640, 301, 52], card: [252, 231, 217, 260], net: [120, 109, 88, 20], lanes: [221, 391, 109, 223], cd: [390, 136] },
  { vp: [1000, 551], score: [337, 0, 326, 62], obj: [370, 62, 260, 41], earL: [0, 58, 160, 133], earR: [840, 58, 160, 105], map: [808, 359, 176, 176], dp: [12, 356, 160, 183], drive: [184, 431, 108, 108], sys: [308, 431, 382, 32], ammo: [284, 471, 433, 64], card: [684, 196, 300, 151], net: [863, 8, 127, 28], lanes: [199, 312, 171, 188], cd: [390, 136] },
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
  // a phone-width window keeps the network strip's corner of the right lane (battleHudLayout.ts)
  const phone = width <= 519;
  if (phone) obstacles.push({ x: width - 10 - 96, y: top + 8, w: 96, h: 30 });
  const side = Math.min(400, width / 2 - 24);
  const lane = (x, from, to) => to - from >= 26 ? { x, w: side, top: from, bottom: to } : null;
  // The census measured the lanes with the objective. A window without rosters starts them under whatever is above them
  // as battleHudLayout.ts derives it: the objective, or the score without one (the left one also under a narrow window's
  // fps/ping readout and a left-hand map; the right one under a phone-width window's network strip).
  let leftTop = v.lanes[0], rightTop = phone ? Math.max(v.lanes[2], top + 46) : v.lanes[2];
  if (!v.earL && !objective) {
    leftTop = Math.max(top, width < 768 && v.net[1] < height / 2 ? v.net[1] + v.net[3] : 0, v.map[0] < width / 2 ? v.map[1] + v.map[3] : 0) + 8;
    rightTop = phone ? top + 46 : top + 8;
  }
  // the HUD's panels and controls the reticle's marks keep clear of (battleHudLayout.ts: not the report or the readouts)
  const furniture = [v.score, ...(objective ? [v.obj] : []), earL, earR, v.map, v.dp, v.drive, v.sys, v.ammo].filter(Boolean).map(box);
  return {
    width, height, top, obstacles, furniture,
    lanes: [lane(0, leftTop, v.lanes[1]), lane(width - side, rightTop, v.lanes[3])],
    smallAlert: height <= 550 || width <= 480, compactDetection: height <= 550,
    countdown: { w: v.cd[0], h: v.cd[1] }, revive: { w: Math.min(390, width - 32), h: 129 },
    medal: { w: Math.min(380, width - 32), h: width > 640 ? 85 : 76 },
    medalCompact: { w: Math.min(250, width - 24), h: 40 },
  };
}

const overlap = (a, b, gap = 0) => a.x < b.x + b.w + gap && a.x + a.w > b.x - gap && a.y < b.y + b.h + gap && a.y + a.h > b.y - gap;
/** A census viewport's boxes moved with their anchors to a w x h window (centred, right-hand and bottom-anchored boxes
 *  follow; the lanes' bottoms follow the height). */
function movedTo(v, w, h) {
  const dw = w - v.vp[0], dh = h - v.vp[1], c = (b) => b && [b[0] + dw / 2, b[1], b[2], b[3]], r = (b) => b && [b[0] + dw, b[1], b[2], b[3]];
  const down = (b) => b && [b[0], b[1] + dh, b[2], b[3]];
  return { ...v, vp: [w, h], score: c(v.score), obj: c(v.obj), earR: r(v.earR), map: down(r(v.map)), dp: down(v.dp), drive: down(v.drive),
    sys: down(c(v.sys)), ammo: down(c(v.ammo)), card: down(r(v.card)), net: r(v.net), lanes: [v.lanes[0], v.lanes[1] + dh, v.lanes[2], v.lanes[3] + dh] };
}
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

// 1. The footprint restates hud.ts and aerialHud.css as the out-of-ammo rounds left them (r10); a change there fails here
//    until MOUSE_RETICLE and mouseReticleFootprint follow.
const hud = readFileSync(new URL('./hud.ts', import.meta.url), 'utf8');
const aerialCss = readFileSync(new URL('./aerialHud.css', import.meta.url), 'utf8');
const R = MOUSE_RETICLE;
const pins = [
  // the ring, the gap every mark keeps, the marker's clear centre
  [/const RET_FLOOR_PX = 11;/, R.ringFloorPx === 11], [/const RET_CEIL_FRAC = 0\.15;/, R.ringCeilFraction === .15],
  [/const RING_STROKE_REACH = 1\.5;/, R.ringReachPx === 1.5], [/const SIGHT_MARK_RING_GAP = 3;/, R.markGapPx === 3],
  [/state\.zoomScale = state\.sniper\s+\? Math\.min\(1\.8, 1\.1 \+ 0\.085 \* \(view\.zoom \|\| 8\)\)/, R.scopeClearCentrePx === 14 + .8 * 9],
  [/state\.centerClearanceRadius = 14 \+ \(state\.zoomScale - 1\) \* 9;/, R.clearCentrePx === 14],
  [/const armEnd = radius \* 1\.55 \+ 3;/, R.armFactor === 1.55],
  [/paintScopeCrossArms\(cx, cy, gap, armEnd, 'rgba\(4,7,6,0\.38\)', 2\.4\);/, R.armPx === 3 + 1.3],
  // the column under the marker: a rack (four shells) or a struck round, dropped below a ring that crosses it, the
  // countdown under it or beside the rack; over the ring where the furniture sits under it
  [/export const AUTOLOADER_HUD_SHELLS = 4;/, true], [/const AUTOLOADER_HUD_ARC_DEPTH = 2\.25;/, true],
  [/const shellW = draw\.sniper \? 6\.5 : 5\.5;\s+const shellH = draw\.sniper \? 16 : 14;\s+const gap = draw\.sniper \? 4 : 3\.5;/,
    R.markHalfWidthPx >= (4 * 6.5 + 3 * 4) / 2 + 5 && R.rangeRackPx === (4 * 6.5 + 3 * 4) / 2 + 6],
  [/totalW \* 0\.5 \+ 5, AUTOLOADER_HUD_ARC_DEPTH \+ shellH \+ 3/, 2.25 + 16 + 3 <= 19 + 3],
  [/const shellW = draw\.sniper \? 8 : 7;\s+const shellH = draw\.sniper \? 19 : 17;/, R.markHalfWidthPx >= 8 / 2 + 6],
  [/const top = draw\.cy \+ draw\.centerClearanceRadius \+ 6;/, true], [/belowRing\(draw\) \+ 3 : top/, true],
  [/return draw\.circleY \+ draw\.radius \+ RING_STROKE_REACH \+ SIGHT_MARK_RING_GAP;/, true],
  [/return Math\.min\(draw\.circleY - draw\.radius - RING_STROKE_REACH, draw\.cy - draw\.centerClearanceRadius, draw\.aboveTopY\);/, true],
  [/const above = aboveSightTop\(draw\) - SIGHT_MARK_RING_GAP - markH;/, true],
  [/const COUNTDOWN_SIZE = 16;/, R.countdownPx >= 16 * (.74 + .08) - .01], [/const COUNTDOWN_RACK_GAP = 3;/, true],
  [/let top = draw\.magazine \? draw\.magazineInkBottomY \+ COUNTDOWN_RACK_GAP/, true],
  [/const sideX = draw\.cx - draw\.magazineHalfW - 7 - textW - unitW;/, R.besideCountdownPx >= 19 + 7 + 50],
  // the chip: under the marker and the column's marks, or over the sight
  [/const AIM_WARNING_CHIP_ABOVE = 14;/, R.chipAbovePx === 14], [/const AIM_WARNING_CHIP_BELOW = 10;/, R.chipBelowPx === 10],
  [/draw\.warningW = ctx\.measureText\(warning\.text\)\.width \+ 50;/, R.chipHalfWidthPx === 92],
  [/let y = Math\.max\(draw\.cy \+ Math\.max\(62, draw\.radius \+ 24\),/, R.chipMinPx === 62 && R.chipRingPx === 24],
  [/const top = Math\.min\(aboveSightTop\(draw\), draw\.cy - SCOPE_VISION_HALF_H, draw\.tagTopY\);\s+return top - SIGHT_MARK_RING_GAP - AIM_WARNING_CHIP_BELOW;/, true],
  [/const SCOPE_VISION_HALF_H = 24;/, R.visionHalfHeightPx === 24],
  // the scope's readout row and its places
  [/const rest = h <= 300 \? draw\.cy \+ 32\s+: h <= 430 \? draw\.cy \+ 48\s+: Math\.min\(draw\.cy \+ Math\.max\(draw\.radius \* 1\.02 \+ 24, draw\.radius \* 1\.55 \+ 18, 96\), sniperReadoutFloor\(\)\);/, true],
  [/function sniperReadoutFloor\(\): number \{\s+return h - 176;/, true], [/return h <= 300 \? 18 : 24;/, true],
  [/row\.lineTop = line\.round \? 14\.7 : 10;\s+row\.lineFoot = line\.round \? 4\.7 : 1\.1;/, R.readoutAbovePx === 14.7 && R.readoutBelowPx === 4.7],
  [/out\.top = 11\.9 - drop; out\.foot = drop \+ 1\.3;/, R.zoomAbovePx === 11.9 && R.zoomBelowPx === 1.3],
  [/\.width \+ 24 \+ 40 \+ 1\.2;/, true], [/const TAG_GROUP_GAP = 16;/, R.rowGroupPx === 16],
  [new RegExp(String.raw`const SNIPER_ROW_PLACES: readonly \(readonly \[SniperRowMode, boolean, boolean, boolean\]\)\[\] = \[\s+\['stack', false, false, false\], \['zoomBeside', false, false, false\], \['chipBeside', false, false, true\],\s+\['stack', true, false, true\], \['zoomBeside', true, false, true\], \['rowBeside', false, false, false\],\s+\['rowAbove', false, false, false\], \['rowAbove', true, false, true\], \['stack', false, true, false\], \['stack', true, true, true\],\s+\['rowAbove', false, true, false\], \['rowAbove', true, true, true\],\s+\];`), true],
  // the range tag at the 4:30, past a rack, or at the 1:30
  [/const offset = 0\.7071 \* \(draw\.radius \+ 9\);/, true], [/const rackClear = draw\.magazine \? draw\.magazineHalfW \+ 10 - 4 : 0;/, true],
  [/tag\.x0 = draw\.cx \+ Math\.max\(offset, rackClear\) \+ 4;\s+tag\.y = draw\.cy \+ offset \+ 12;/, true],
  [/const y = draw\.cy - offset - 3\.5 - 11\.5 \* 0\.08;/, R.rangeOverPx === 3.5],
];
for (const [pattern, restated] of pins) {
  assert.match(hud, pattern);
  assert.ok(restated, `MOUSE_RETICLE restates ${pattern}`);
}
// the vision switch beside the sight (its mirror seat battleHudLayout's)
assert.match(aerialCss, /\.cot-hud \.cot-scope-vision\{[^}]*left:min\(calc\(50% \+ max\(15vmin \+ 8px,80px\)\),calc\(100% - 180px\)\);top:50%;transform:translateY\(-50%\)[^}]*min-height:48px/,
  'the scope-vision switch sits beside the sight, level with the marker');
assert.match(aerialCss, /\.cot-hud \.cot-scope-vision\{left:min\(calc\(50% \+ max\(15vmin \+ 8px,80px\)\),calc\(100% - 112px\)\);width:104px/, 'the compact plate under 540 px wide');
// The furniture moves the marks: at 1280 x 431 (the HUD's recorded furniture, tools/fixtures/hud-sight-furniture.json)
// the controls row sits under the battle sight's chip at full bloom, so the chip goes over the sight and the keep-out
// reaches over the ring (the scope's row and chip too); on the 1024 x 600 census the heaviest scope case seats its row with the chip beside it, under
// the ring, and nothing goes over it.
{
  const fixture = JSON.parse(readFileSync(new URL('../../tools/fixtures/hud-sight-furniture.json', import.meta.url), 'utf8'));
  const furnitureOf = (key) => fixture.sizes[key].filter(([selector]) => selector !== '.cot-scope-vision')
    .map(([, x0, y0, x1, y1]) => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }));
  // (a box whose top reaches over the widest ring in the column under the marker, other than the scope's arm)
  const overRing = (keep, w, h, tier) => keep.some((k) => !('r' in k) && k.y < h / 2 - (tier ? .15 * Math.min(w, h) : 11) - 2.5
    && k.x < w / 2 + 92 && k.x + k.w > w / 2 - 92 && k.w > 2 * R.armHalfWidthPx + .01);
  // (the scope's row also keeps 3 px from the screen's edges, so at 431 px tall its heaviest case goes over the ring with
  // no furniture at all; the battle sight's marks heed the furniture alone)
  for (const tier of [1, 2]) {
    assert.ok(overRing(mouseReticleFootprint(1280, 431, tier, [], furnitureOf('1280x431')), 1280, 431, tier), `1280x431 tier ${tier}: the chip goes over the sight`);
  }
  assert.ok(!overRing(mouseReticleFootprint(1280, 431, 1), 1280, 431, 1), '1280x431 battle sight without furniture: nothing over the ring');
  const v = VIEWPORTS.find((c) => c.vp[0] === 1024 && c.vp[1] === 600);
  const census = [v.score, v.obj, v.earL, v.earR, v.map, v.dp, v.drive, v.sys, v.ammo].map(box);
  const keep = mouseReticleFootprint(1024, 600, 2, [], census);
  assert.ok(!overRing(keep, 1024, 600, 2), '1024x600: the heaviest scope case keeps under the ring');
  assert.ok(keep.some((k) => !('r' in k) && k.x <= 512 - 62 - 16 - 184 + .01), '1024x600: the chip beside the row is inside');
}

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
  if (!INK[`${width}x${height}`]) continue; // (the odd windows' ink was not traced; the browser receipt weighs it)
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
//    both notices' places (the countdown sharing only the detection's where SHARED lists it, as nothing spots the player
//    before the roll-out; never the revive count, nor the countdown the alert's, as an alert can show with either; the
//    medal card may share either, as it waits while anything shown meets it: 4c); nothing leaves the screen or touches
//    an instrument;
//    a lane an element crosses keeps a row while it shows (and while the detection and the alert show together), and
//    keeps all its rows while nothing shows (the plan holds no lane change outside `giveWay`).
// (481 x 700: the scope's heaviest case seats its row with the chip over the sight, its drive gauge under the stacked
// zoom plate (r10), so the band over the ring is the reticle's; the detection takes the one place left under the sight
// and the countdown, which no enemy sees before the roll-out, shares it)
// (844 x 390: on the detection's place the countdown clears the whole reticle at 45 %, where off both notices it cleared
// only the resting sight)
const SHARED = { '768x600': ['countdown'], '481x700': ['countdown'], '844x390': ['countdown'] };
const TIER_FLOOR = { countdown: 2, revive: 1, medal: 1 };
// (844 x 390's notices take the one band clear of the bloomed sight: its countdown and revive count clear the resting
// sight, off both notices, rather than cover one. 768 x 600's drive gauge ends at the widest gun-limit chip's left edge
// at full bloom, so the HUD sets that chip over the sight (r10, placeAimWarning); between the rosters no place for the
// countdown clears it, and the countdown clears the resting sight. 481 x 700's band over the ring is the scope's (its
// heaviest case seats the row with the chip over the sight), so the revive count clears the resting sight there.)
const LOW_TIER = { '844x390': { countdown: 0, revive: 0, medal: 1 }, '768x600': { countdown: 0, revive: 0 }, '481x700': { countdown: 1, revive: 0 } };
// A lane gives up its last row only where every place clear of the reticle crosses it (and only while the element
// shows): the plan prices that as its last resort before any reticle ink.
// (a row needs 26 px; beside the left lane's damage toasts 62, where the lane is that tall: mouseNoticePlan.ts laneRowPx)
const rowPx = (side, lane) => side === 0 && lane.bottom - lane.top >= 62 ? 62 : 26;
// (844 x 390's revive count: every place for it off both notices crosses the left lane whole, one row deep with an
// objective and two without, so the lane yields them while the count shows: the plan's last resort before reticle ink)
// (844 x 390's notices since the HUD's out-of-ammo marks (r10): its systems row sits under the widest gun-limit chip at
// full bloom and under the scope's stacked zoom plate, so the chip goes over the sight and the plate right of the
// readout line, where the notices sat; every place for them clear of the whole reticle crosses the left lane whole)
// (and its revive count without an objective: between the score and the bloomed sight it now crosses both lanes)
const EMPTIED = ['844x390 detection l', '844x390 revive l', '844x390 detection+alert l', '844x390s alert l', '844x390s revive l',
  '844x390s revive r', '844x390s detection+alert l',
  '768x600 alert l', '768x600 detection+alert l', '768x600s revive l', '481x700 alert r', '481x700 detection+alert r'];
const emptied = [];
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
    const keep = mouseReticleFootprint(input.width, input.height, 2, [], input.furniture);
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
      assert.ok(intrusion(r, tier === 2 ? keep : mouseReticleFootprint(input.width, input.height, tier, [], input.furniture)) <= 0,
        `${name}: the ${label} keeps ${MOUSE_RETICLE_MARGIN_PX} px off the reticle (tier ${tier})`);
      assert.ok(r.x >= 11.5 && r.y >= 0 && r.x + r.w <= input.width - 11.5 && r.y + r.h <= input.height - 11.5, `${name}: the ${label} stays on screen`);
      for (const o of input.obstacles) assert.ok(!overlap(r, o, MOUSE_NOTICE_GAP_PX - .01), `${name}: the ${label} keeps ${MOUSE_NOTICE_GAP_PX} px off ${JSON.stringify(o)}`);
      if (!fixedTier) {
        const shares = overlap(r, det, MOUSE_NOTICE_GAP_PX - .01) || overlap(r, alert, MOUSE_NOTICE_GAP_PX - .01);
        assert.equal(r.sharesNotices, shares, `${name}: the ${label} reports whether it shares a notice's place`);
        // the countdown may take only the detection's place; the revive count neither (the medal card waits: 4c)
        const sharesAlert = overlap(r, alert, MOUSE_NOTICE_GAP_PX - .01);
        if (label === 'countdown') assert.ok(!sharesAlert, `${name}: the countdown keeps off the alert's place (H, R and E raise alerts before the roll-out)`);
        if (label === 'revive') assert.ok(!shares, `${name}: the revive count keeps off both notices' places`);
        if (label !== 'medal' && shares) assert.ok(SHARED[vp]?.includes(label), `${name}: the ${label} shares a notice's place`);
      }
      // the lanes' bands while it shows: off the box, each keeping a row
      for (let side = 0; side < 2; side++) {
        const lane = input.lanes[side];
        const [t, b] = [r.giveWay[side * 2], r.giveWay[side * 2 + 1]];
        if (!lane) { assert.ok(Number.isNaN(t) && Number.isNaN(b)); continue; }
        const top = Number.isNaN(t) ? lane.top : t, bottom = Number.isNaN(b) ? lane.bottom : b;
        assert.ok(top >= lane.top && bottom <= lane.bottom, `${name}: the ${label}'s band lies in the lane`);
        // a row needs 26 px; beside the left lane's damage toasts 62
        // (the countdown runs before the first kill: its lanes hold none to keep)
        if (label !== 'countdown' && bottom - top < rowPx(side, lane)) emptied.push(`${vp}${objective ? '' : 's'} ${label} ${side ? 'r' : 'l'}`);
        else assert.ok(!overlap(r, { x: lane.x, y: top, w: lane.w, h: bottom - top }, MOUSE_NOTICE_GAP_PX - .01), `${name}: the ${label} keeps off the ${side ? 'right' : 'left'} lane`);
      }
    }
    assert.ok(!overlap(det, alert, MOUSE_NOTICE_GAP_PX - .01), `${name}: the detection and the alert stand apart`);
    for (let side = 0; side < 2; side++) {
      const lane = input.lanes[side];
      if (!lane) continue;
      const pick = (v2, fallback, f) => Number.isNaN(v2) ? fallback : v2;
      const top = Math.max(pick(det.giveWay[side * 2], lane.top), pick(plan.alert.giveWay[side * 2], lane.top));
      const bottom = Math.min(pick(det.giveWay[side * 2 + 1], lane.bottom), pick(plan.alert.giveWay[side * 2 + 1], lane.bottom));
      if (bottom - top < rowPx(side, lane)) emptied.push(`${vp}${objective ? '' : 's'} detection+alert ${side ? 'r' : 'l'}`);
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
assert.deepEqual(emptied, EMPTIED, 'only these elements leave a lane without a row while they show');
// Planning runs once per viewport and HUD arrangement (battleHudLayout.ts caches the last few, and waits for a resize to
// settle). Its work is counted in bands (each a sorted, merged scan of the fixed boxes), so the bound holds on any machine.
assert.ok(work / plans < 2000 && mostWork < 4500, `planning stays cheap (${Math.round(work / plans)} bands a plan, ${mostWork} at most)`);

// 4b. Larger rosters (14 and 20 a side widen the icon grids) keep every guarantee that matters most.
for (const v of VIEWPORTS.filter((x) => x.earL)) for (const rosters of [14, 20]) {
  const input = inputFor(v, { rosters });
  const plan = planMouseNotices(input);
  assert.equal(plan.clearance, 2, `${v.vp.join('x')} r${rosters}: the notices clear the reticle`);
  assert.equal(plan.alert.small, input.smallAlert, `${v.vp.join('x')} r${rosters}: main's type size`);
  // the countdown off the alert's place, the revive count off both notices' (the medal card waits: 4c)
  const det = plan.detection, alert = alertBox(plan.alert), gap = MOUSE_NOTICE_GAP_PX - .01;
  for (const label of ['countdown', 'revive', 'medal']) assert.ok(plan[label], `${v.vp.join('x')} r${rosters}: the ${label} has a place`);
  assert.ok(!overlap(plan.countdown, alert, gap) && !overlap(plan.revive, alert, gap) && !overlap(plan.revive, det, gap),
    `${v.vp.join('x')} r${rosters}: no element takes a place it can show with`);
}

// 4c. The medal card never shows on anything shown with it: with every mix of the detection, the alert, the revive count
//     (a medal can arrive after the death) and the scope up, mouseMedalWaits holds it back wherever its place meets a
//     shown element's (or the scope is up where it clears the battle sight only), and shows it whenever nothing does.
//     It is the full card wherever main's own card (centred, 16 px under the objective) clears the whole keep-out and
//     every instrument: main's look, waiting where it shares a notice's place (owner: prefer main's look when safe).
let medalCases = 0, medalWaits = 0;
for (const v of VIEWPORTS) for (const rosters of v.earL ? [7, 14, 20] : [7]) for (const objective of [true, false]) {
  const input = inputFor(v, { objective, rosters });
  const plan = planMouseNotices(input);
  const name = `${v.vp.join('x')} r${rosters}${objective ? '' : ' (standard)'}`, medal = plan.medal;
  assert.ok(medal, `${name}: the medal card has a place`);
  const shownBoxes = { detection: plan.detection, alert: alertBox(plan.alert), revive: plan.revive };
  for (let mask = 0; mask < 16; mask++) {
    const up = { detection: !!(mask & 1), alert: !!(mask & 2), revive: !!(mask & 4), scoped: !!(mask & 8) };
    const waits = mouseMedalWaits(plan, up);
    const meets = ['detection', 'alert', 'revive'].filter((k) => up[k] && overlap(medal, shownBoxes[k], MOUSE_NOTICE_GAP_PX - .01));
    const mustWait = meets.length > 0 || (up.scoped && medal.clearance < 2);
    assert.equal(waits, mustWait, `${name} [${Object.keys(up).filter((k) => up[k]).join('+') || 'nothing'} up]: the medal card ${waits ? 'waits' : 'shows'}${meets.length ? ` (it meets the ${meets.join(', ')})` : ''}`);
    medalCases++;
    if (waits) medalWaits++;
  }
  // it waits on the detection's 8 s lamp only where no place for it down the centre line, below the lamp and above the aim
  // point, clears the whole keep-out, every instrument, both notices and the kill lanes (main showed its card at once
  // just below the lamp)
  if (overlap(medal, plan.detection, MOUSE_NOTICE_GAP_PX - .01)) {
    const [w0, h0] = v.vp, keep = mouseReticleFootprint(w0, h0, 2, [], input.furniture);
    for (const [cw, ch] of [[medal.w, medal.h]]) {
      for (let y = Math.ceil(plan.detection.y + plan.detection.h + MOUSE_NOTICE_GAP_PX); y + ch <= h0 / 2; y++) {
        const box = { x: w0 / 2 - cw / 2, y, w: cw, h: ch };
        const clear = intrusion(box, keep) <= 0 && !input.obstacles.some((o) => overlap(box, o, MOUSE_NOTICE_GAP_PX - .01))
          && !overlap(box, plan.detection, MOUSE_NOTICE_GAP_PX - .01) && !overlap(box, alertBox(plan.alert), MOUSE_NOTICE_GAP_PX - .01)
          && !input.lanes.some((l) => l && overlap(box, { x: l.x, y: l.top, w: l.w, h: l.bottom - l.top }, MOUSE_NOTICE_GAP_PX - .01));
        assert.ok(!clear, `${name}: the card waits on the lamp though ${cw} x ${ch} at y ${y} on the centre line below it is clear`);
      }
    }
  }
  // it never hides a kill row (owner: the card waits rather than cover the feed): each lane keeps, beside it, every row it
  // holds without it (the rows may start lower), but on a phone-width mouse window (390 x 844, 481 x 700), where every
  // place for the card cuts a lane: there the card waits while that lane shows a row
  const rows = (h) => Math.min(8, Math.max(0, Math.floor((h + 3) / 29)));
  for (let side = 0; side < 2; side++) {
    const lane = input.lanes[side];
    if (!lane) continue;
    const t = Number.isNaN(medal.giveWay[side * 2]) ? lane.top : medal.giveWay[side * 2];
    const b = Number.isNaN(medal.giveWay[side * 2 + 1]) ? lane.bottom : medal.giveWay[side * 2 + 1];
    const cut = rows(b - t) < rows(lane.bottom - lane.top), what = `${name}: the medal card's place cuts the ${side ? 'right' : 'left'} lane`;
    assert.equal(medal.cutsLanes[side], cut, `${what}: ${cut} (${rows(b - t)} of ${rows(lane.bottom - lane.top)} rows)`);
    const feeds = side ? [false, true] : [true, false], none = { detection: false, alert: false, revive: false, scoped: false };
    if (cut) {
      assert.ok(v.vp[0] < 520, `${what} on a desktop window`);
      assert.ok(mouseMedalWaits(plan, { ...none, feeds }) && !mouseMedalWaits(plan, { ...none, feeds: [false, false] }), `${what}: it waits while that lane shows a row, and only then`);
    } else assert.ok(!mouseMedalWaits(plan, { ...none, feeds }), `${name}: the ${side ? 'right' : 'left'} lane's kill rows hold back a card whose place leaves them all`);
  }
  // it keeps main's centred card wherever a place for the full card on the centre line, off the alert's place (sharing the
  // detection's at most), clears the keep-out, every instrument and the kill lanes (a card aside shows sooner, but the
  // owner keeps main's look: MEDAL_SHIFT_COST)
  if (!medal.compact) {
    const [w0, h0] = v.vp, keep = mouseReticleFootprint(w0, h0, 2, [], input.furniture), cw = input.medal.w, ch = input.medal.h;
    for (let y = Math.ceil(input.top + MOUSE_NOTICE_GAP_PX); y + ch <= h0 / 2; y++) {
      const box = { x: w0 / 2 - cw / 2, y, w: cw, h: ch };
      if (intrusion(box, keep) > 0 || input.obstacles.some((o) => overlap(box, o, MOUSE_NOTICE_GAP_PX - .01))
        || overlap(box, alertBox(plan.alert), MOUSE_NOTICE_GAP_PX - .01)
        || input.lanes.some((l) => l && overlap(box, { x: l.x, y: l.top, w: l.w, h: l.bottom - l.top }, MOUSE_NOTICE_GAP_PX - .01))) continue;
      assert.ok(Math.abs(medal.x + medal.w / 2 - w0 / 2) < 1, `${name}: the card sits ${Math.round(medal.x + medal.w / 2 - w0 / 2)} px off the centre line though y ${y} on it is clear`);
      break;
    }
  }
  const [W] = v.vp, mainCard = { x: W / 2 - input.medal.w / 2, y: Math.ceil(input.top + 16), w: input.medal.w, h: input.medal.h };
  if (intrusion(mainCard, mouseReticleFootprint(W, v.vp[1], 2, [], input.furniture)) <= 0 && !input.obstacles.some((o) => overlap(mainCard, o, MOUSE_NOTICE_GAP_PX - .01))) {
    assert.equal(medal.compact, false, `${name}: main's full card clears everything here, so the card is the full card`);
  }
}

// 4d. No window is too small for the countdown and the revive count to keep off the resting sight: the 768 x 600 census
//     boxes squeezed down to 380 px tall (bottom-anchored boxes moved up; no real layout comes here) still place both,
//     on a notice's place or over an instrument as the last resorts, never on main's own place on the aim point.
{
  const v = VIEWPORTS.find((x) => x.vp[0] === 768 && x.vp[1] === 600);
  for (let H = 380; H < 600; H += 4) for (const objective of [true, false]) {
    const dh = H - 600, up = (b) => b && [b[0], b[1] + dh, b[2], b[3]];
    const squeezed = { ...v, vp: [768, H], map: up(v.map), dp: up(v.dp), drive: up(v.drive), sys: up(v.sys), ammo: up(v.ammo), card: up(v.card),
      lanes: [v.lanes[0], v.lanes[1] + dh, v.lanes[2], v.lanes[3] + dh] };
    const input = inputFor(squeezed, { objective }), plan = planMouseNotices(input);
    for (const label of ['countdown', 'revive']) {
      assert.ok(plan[label], `768x${H}${objective ? '' : 's'}: the ${label} has a place`);
      assert.ok(intrusion(plan[label], mouseReticleFootprint(768, H, 0, [], input.furniture)) <= 0, `768x${H}${objective ? '' : 's'}: the ${label} keeps off the resting sight`);
    }
  }
}

// 4e. 844 x 390 without an objective: no place clear of the whole reticle keeps the lanes whole. Before the HUD's
//     out-of-ammo marks one did, a band at y 295..296 between the gun-limit chip and the scope-vision toggle (then 145 px
//     under the sight), which the card's fine search had to find (stepping over it put the card over the left lane,
//     held back by every kill row); the r10 scope column (a struck mark dropped below the ring, the countdown, the chip,
//     the row under them) now runs through it and the toggle sits beside the sight. The lane decides: the card takes the
//     place clear of the battle sight at full bloom that keeps both lanes whole, and waits only while the scope is up.
//     820 x 400 (the 844 x 390 boxes moved with their anchors) likewise: no card cuts a lane there.
{
  const v = VIEWPORTS.find((x) => x.vp[0] === 844 && x.vp[1] === 390);
  const std = planMouseNotices(inputFor(v, { objective: false }));
  assert.ok(std.medal.clearance === 1 && !std.medal.cutsLanes.some(Boolean),
    `844x390 (standard): the card keeps both lanes whole, clear of the bloomed battle sight (it is at ${Math.round(std.medal.x)},${std.medal.y}, tier ${std.medal.clearance}, cuts ${std.medal.cutsLanes})`);
  assert.ok(mouseMedalWaits(std, { detection: false, alert: false, revive: false, scoped: true }), '844x390 (standard): it waits while the scope is up');
  for (const objective of [true, false]) {
    const plan = planMouseNotices(inputFor(movedTo(v, 820, 400), { objective }));
    assert.ok(!plan.medal.cutsLanes.some(Boolean), `820x400${objective ? '' : ' (standard)'}: the card cuts no lane (${Math.round(plan.medal.x)},${plan.medal.y})`);
  }
}

// 4f. Off the census by a few px (the safe bands are narrow: 1024 x 758..762 once cut a lane, 764 did not): every census
//     window 2 to 16 px shorter and taller, with and without an objective. The card cuts a lane only where no place for
//     it at its keep-out (full or compact, on a notice's place or not) keeps every lane whole; its price counts every row
//     a lane would give up, as its wait does (a cut priced free held the card back on every kill row of that lane).
{
  const laneFree = (input, tier) => {
    const keep = mouseReticleFootprint(input.width, input.height, tier, [], input.furniture), g = MOUSE_NOTICE_GAP_PX - .01;
    for (const [w, h] of [[input.medal.w, input.medal.h], [input.medalCompact.w, input.medalCompact.h]])
      for (let y = Math.ceil(input.top + MOUSE_NOTICE_GAP_PX); y + h <= input.height - 12; y++) for (let x = 12; x + w <= input.width - 12; x += 2) {
        const b = { x, y, w, h };
        if (input.lanes.some((l) => l && overlap(b, { x: l.x, y: l.top, w: l.w, h: l.bottom - l.top }, g))) continue;
        if (input.obstacles.some((o) => overlap(b, o, g)) || intrusion(b, keep) > 0) continue;
        return b;
      }
    return null;
  };
  let near = 0, cut = 0;
  for (const v of VIEWPORTS) for (let dh = -16; dh <= 16; dh += 2) for (const objective of [true, false]) {
    if (!dh) continue;
    const [w0, h0] = v.vp, input = inputFor(movedTo(v, w0, h0 + dh), { objective });
    const medal = planMouseNotices(input).medal;
    near++;
    if (!medal.cutsLanes.some(Boolean)) continue;
    cut++;
    const free = laneFree(input, medal.clearance);
    assert.ok(!free, `${w0}x${h0 + dh}${objective ? '' : ' (standard)'}: the card cuts a lane at ${Math.round(medal.x)},${medal.y} though ${free && JSON.stringify(free)} keeps every lane whole`);
  }
  assert.ok(near > 600, 'the neighbours were planned');
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
assert.match(layout, /let plan: MouseNoticePlan \| null = null;\s+if \(!touch && !planInputs && planned\) plan = planned;\s+else if \(!touch\) \{[\s\S]*?plan = mouseNoticePlan\(/, 'touch never plans');
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
// the layout holds the medal card by mouseMedalWaits with everything it can show with (4c); hud.ts flags the scope on the
// document element, outside the observed HUD root, so a scope toggle relayouts nothing (battleHudLayout.selftest.mjs)
assert.match(layout, /medalWaiting = mouseMedalWaits\(plan, \{ detection: !!root\.querySelector\('\.cot-sixth\.on'\), alert: !!root\.querySelector\('\.cot-alert\.show'\),\s+revive: !!root\.querySelector\('\.cot-revive\.on'\), scoped: document\.documentElement\.hasAttribute\(SCOPED_ATTRIBUTE\),\s+feeds: \[!!killLeft\?\.childElementCount, !!killRight\?\.childElementCount\] \}\);\s+medalReady = !medalWaiting;/);
assert.match(hud, /document\.documentElement\.toggleAttribute\('data-cot-scoped', mode === 'sniper'\);/);
assert.doesNotMatch(hud, /root\.classList\.toggle\('cot-scoped'/, 'no scope class on the observed HUD root');

console.log(`mouseNoticePlan.selftest: ${plans} mouse plans clear the reticle, the instruments and the lanes (${Math.round(work / plans)} bands, ${(ms / plans).toFixed(1)} ms a plan; slowest ${slowest.toFixed(1)} ms); the medal card waits in ${medalWaits} of ${medalCases} company mixes, exactly where its place meets a shown element's`);
