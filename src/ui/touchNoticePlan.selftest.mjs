// r10e (the coordinator, from the notices session's blind critic on integ/229 ce8b634668): a touch layout's centre
// notices keep off the reticle's footprint and the HUD's panels (touchNoticePlan.ts). Over every recorded touch size and
// stage (tools/fixtures/hud-sight-furniture.json, the furniture the layout measured there), in battle and through the
// scope, with and without the pre-battle countdown and a medal card: a plan that clears keeps TOUCH_NOTICE_GAP from the
// furniture and between its notices and 4 px from the footprint; every element sits on the window's centre line
// (noticeCentreLine.ts, owner 2026-10-22: "they are nnot actually centered in screen"); integ's place, which sat on the
// sight on the phones the critic saw, is left; and on the standard stage only the smaller windows find no clear place (the
// rendered receipt, tools/hud-touch-notices.browser.mjs, measures the real ink there).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planTouchNotices, touchFreePlace, touchSightKeepOut, TOUCH_COMPACT_ALERT, TOUCH_COMPACT_NOTICE, TOUCH_NOTICE_GAP }
  from './touchNoticePlan.ts';

const FURNITURE = JSON.parse(readFileSync(new URL('../../tools/fixtures/hud-sight-furniture.json', import.meta.url), 'utf8'));
// the furniture a notice covers first where nothing clears (battleHudLayout TOUCH_NOTICE_SOFT, the map apart: `map`)
const SOFT = new Set(['.cot-top', '.cot-mode-status.show', '.cot-ear']);
const MAP = '.cot-minimap';
const apart = (a, b) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
/** A box of `size` on the window's centre line, its top at `y`. */
const centred = (width, y, size) => ({ x0: width / 2 - size.w / 2, y0: y, x1: width / 2 + size.w / 2, y1: y + size.h });

// 1. The highest free place on the centre line: under a block that stands on it, never beside it; none where nothing fits.
{
  const score = { x0: 0, y0: 0, x1: 400, y1: 50 };
  assert.equal(touchFreePlace({ w: 100, h: 30 }, 0, 400, 300, [score], 6), 56, 'under the score');
  assert.equal(touchFreePlace({ w: 100, h: 30 }, 0, 400, 300, [score, { x0: 150, y0: 50, x1: 250, y1: 120 }], 6), 126,
    'under a block on the centre line, not beside it');
  assert.equal(touchFreePlace({ w: 100, h: 30 }, 0, 400, 300, [score, { x0: 0, y0: 50, x1: 144, y1: 120 }], 6), 56,
    'beside a block that keeps its gap from the centre column');
  assert.equal(touchFreePlace({ w: 390, h: 30 }, 0, 400, 300, [], 6), null, 'no place wider than the screen allows');
}

// 1b. r10g: a button's label keeps a notice off it where a place clears, and where none does the notice covers the label
// before the sight's footprint (at 375x667 the alert sat on AUTO AIM and SCOPE; the labels are not the buttons' boxes).
{
  // (a band 110 px tall under the score, over the footprint: on the centre line the stack fits there whole)
  const base = { width: 600, height: 600, top: 20, soft: [], scope: false, seated: false, notice: { w: 100, h: 30 },
    alert: { w: 100, h: 30 }, countdown: null, banner: null, fallbackTop: 0 };
  const keep = touchSightKeepOut(600, 600, false, false);
  const [kx0, ky0, kx1, ky1] = [Math.min(...keep.map((b) => b.x0)), Math.min(...keep.map((b) => b.y0)),
    Math.max(...keep.map((b) => b.x1)), Math.max(...keep.map((b) => b.y1))];
  // (walls everywhere but a band under the score and the footprint itself)
  const walls = [{ x0: 0, y0: 0, x1: 600, y1: 20 }, { x0: 0, y0: 130, x1: kx0, y1: 600 }, { x0: kx1, y0: 130, x1: 600, y1: 600 },
    { x0: kx0, y0: ky1, x1: kx1, y1: 600 }, { x0: kx0, y0: 130, x1: kx1, y1: ky0 }];
  const label = { x0: 0, y0: 24, x1: 600, y1: 126 };
  assert.ok(planTouchNotices({ ...base, obstacles: walls }).cleared, 'without the label the band holds both notices');
  const plan = planTouchNotices({ ...base, obstacles: walls, labels: [label] });
  assert.ok(!plan.cleared, 'a label across the band leaves the notices no clear place');
  for (const [name, box] of [['detection', centred(600, plan.noticeTop, TOUCH_COMPACT_NOTICE)],
    ['alert', centred(600, plan.alertTop, TOUCH_COMPACT_ALERT)]]) {
    assert.ok(apart(box, label) < 0 && keep.every((block) => apart(box, block) >= 0),
      `where none clears the ${name} covers the label, not the footprint (${JSON.stringify(plan)})`);
  }
}

// 1c. Where nothing clears, the notices stay on the centre line, reaching into the sight's footprint (the ring, or the
// scope's circle) before a panel or the map, in battle and through the scope. The only room: the map's corner and the
// footprint's main box; 40 px walls everywhere else.
{
  const grid = 40;
  for (const scope of [true, false]) {
    const [width, height] = [1000, 800];
    const keep = touchSightKeepOut(width, height, scope, false);
    const snap = (b) => ({ x0: Math.floor(b.x0 / grid) * grid, y0: Math.floor(b.y0 / grid) * grid,
      x1: Math.ceil(b.x1 / grid) * grid, y1: Math.ceil(b.y1 / grid) * grid });
    const map = { x0: 40, y0: 40, x1: 240, y1: 160 };
    const room = [map, snap(keep[0])];
    const walls = [];
    for (let y = 0; y < height; y += grid) for (let x = 0; x < width; x += grid) {
      const cell = { x0: x, y0: y, x1: x + grid, y1: y + grid };
      if (!room.some((r) => apart(cell, r) < 0)) walls.push(cell);
    }
    const plan = planTouchNotices({ width, height, top: 20, obstacles: walls, soft: [], map, scope, seated: false,
      notice: { w: 300, h: 60 }, alert: { w: 300, h: 60 }, countdown: null, banner: null, fallbackTop: 0 });
    assert.ok(!plan.cleared, `${scope ? 'scope' : 'battle'}: no clear place`);
    const placed = [['detection', centred(width, plan.noticeTop, TOUCH_COMPACT_NOTICE)], ['alert', centred(width, plan.alertTop, TOUCH_COMPACT_ALERT)]];
    const inRoom = placed.filter(([, box]) => walls.every((wall) => apart(box, wall) >= 0)).map(([name]) => name);
    assert.ok(inRoom.length === 2 && placed.every(([, box]) => apart(box, map) >= 0),
      `${scope ? 'scope' : 'battle'}: the notices reach into the footprint (${inRoom}), not a panel or the map: ${JSON.stringify(plan)}`);
  }
}

// 2. Every recorded touch size and stage.
const uncleared = new Set();
let planned = 0;
let moved = 0;
for (const [key, recorded] of Object.entries(FURNITURE.sizes)) {
  const match = /^(\d+)x(\d+)t(.*)$/.exec(key);
  if (!match) continue;
  const width = Number(match[1]);
  const height = Number(match[2]);
  const boxes = recorded.map(([name, x0, y0, x1, y1]) => ({ name, x0, y0, x1, y1 }));
  const obstacles = boxes.filter((box) => !SOFT.has(box.name) && box.name !== MAP);
  const soft = boxes.filter((box) => SOFT.has(box.name));
  const map = boxes.find((box) => box.name === MAP) ?? null;
  const top = Math.max(...boxes.filter((box) => box.name === '.cot-top' || box.name === '.cot-mode-status.show').map((box) => box.y1), 62);
  // (integ's place: under the score and the objective, 12 % down at the least, the stack centred)
  const fallbackTop = Math.max(top + 8, height * 0.12);
  const narrow = width <= 340 && height > width;
  const notice = narrow ? { w: 180, h: 48 } : { w: 214, h: height <= 550 ? 32 : 42 };
  // (battleHudLayout touchChipParked: a short landscape and a portrait phone 340 px wide or less park the chip)
  const seated = !((width > height && height < 550) || (height >= width && width <= 340));
  for (const scope of [false, true]) for (const countdown of [null, { w: Math.min(228, width - 24), h: 136 }])
    for (const banner of [null, { w: Math.min(250, width - 32), h: 64 }]) {
      const at = `${key} ${scope ? 'scope' : 'battle'}${countdown ? ', countdown' : ''}${banner ? ', medal' : ''}`;
      const plan = planTouchNotices({ width, height, top, obstacles, soft, map, scope, seated, notice, alert: { w: notice.w, h: 40 },
        countdown, banner, fallbackTop });
      planned++;
      // (on the centre line, cleared or not, the detection and the alert keep off the crosshair: the resting sight and the
      // marks under it)
      const aim = height / 2;
      for (const [name, y, size] of [['detection', plan.noticeTop, plan.noticeCompact ? TOUCH_COMPACT_NOTICE : notice],
        ['alert', plan.alertTop, plan.alertCompact ? TOUCH_COMPACT_ALERT : { w: notice.w, h: 40 }]]) {
        if (countdown && name === 'detection') continue;
        assert.ok(y >= aim + 76 + 4 || y + size.h <= aim - 20 - 4, `${at}: the ${name} keeps off the crosshair (${y}..${y + size.h}, aim ${aim})`);
      }
      if (!plan.cleared) { uncleared.add(`${key}${countdown ? ' countdown' : ''}`); continue; }
      const keep = touchSightKeepOut(width, height, scope, seated);
      // (the countdown takes the detection's place: it never shows with it)
      const parts = [countdown ? ['the countdown', centred(width, plan.countdownTop,
        { w: countdown.w * plan.countdownScale, h: countdown.h * plan.countdownScale })]
        : ['the detection', centred(width, plan.noticeTop, plan.noticeCompact ? TOUCH_COMPACT_NOTICE : notice)],
        ['the alert', centred(width, plan.alertTop, plan.alertCompact ? TOUCH_COMPACT_ALERT : { w: notice.w, h: 40 })]];
      if (banner && plan.bannerReady) parts.push(['the medal card', centred(width, plan.bannerTop, banner)]);
      for (const [i, [name, box]] of parts.entries()) {
        assert.ok(box.x0 >= TOUCH_NOTICE_GAP - 1e-6 && box.x1 <= width - TOUCH_NOTICE_GAP + 1e-6 && box.y1 <= height - TOUCH_NOTICE_GAP + 1e-6,
          `${at}: ${name} is on the screen`);
        for (const block of [...obstacles, ...soft, ...(map ? [map] : [])]) {
          assert.ok(apart(box, block) >= TOUCH_NOTICE_GAP - 1e-6, `${at}: ${name} keeps ${apart(box, block).toFixed(2)} px from ${block.name}`);
        }
        // (the countdown sits over the crosshair, clear of the resting ring: countdownPlace.ts)
        if (name === 'the countdown') assert.ok(box.y1 <= height / 2 - 20 + 1e-6, `${at}: the countdown keeps the resting ring clear`);
        else for (const block of keep) {
          assert.ok(apart(box, block) >= 4 - 1e-6, `${at}: ${name} keeps ${apart(box, block).toFixed(2)} px from the reticle's footprint`);
        }
        for (const [other, otherBox] of parts.slice(i + 1)) {
          assert.ok(apart(box, otherBox) >= TOUCH_NOTICE_GAP - 1e-6, `${at}: ${name} keeps ${apart(box, otherBox).toFixed(2)} px from ${other}`);
        }
      }
      if (plan.noticeTop !== fallbackTop) moved++;
    }
}
assert.ok(planned === 160 && moved > 0, `the plans ran (${planned}) and moved off integ's place (${moved})`);
// where no place keeps clear on the standard stage, in battle or the scope, without the countdown (the recorded furniture
// is the scope's, its vision plate in every variant): on the centre line the phones under 390 x 844 and the landscapes
// (the band over the ring is the kill feeds' and the score's, and under it the controls row), which take the least
// intrusive heights; the tall phone and the tablets clear (the countdown and an objective panel take more room)
const plain = [...uncleared].filter((key) => !key.includes(':') && !key.includes('countdown')).sort();
assert.deepEqual(plain, ['320x568t', '360x640t', '375x667t', '568x290t', '640x360t', '667x375t', '740x360t', '844x390t', '932x430t'],
  `no clear place on the standard stage: ${plain.join(', ')}`);
// 3. The critic's phone: at 360x640 integ's centred place (264 px down) crossed the ring; on the centre line the plan
// keeps both notices off the ring: the band between the controls row and the ring holds one, the other goes under the
// round buttons (where nothing clears, each reaches least far into the furniture).
{
  const key = '360x640t';
  const boxes = FURNITURE.sizes[key].map(([name, x0, y0, x1, y1]) => ({ name, x0, y0, x1, y1 }));
  const plan = planTouchNotices({ width: 360, height: 640, top: 62, obstacles: boxes.filter((box) => !SOFT.has(box.name) && box.name !== MAP),
    soft: boxes.filter((box) => SOFT.has(box.name)), map: boxes.find((box) => box.name === MAP), scope: false, seated: true, notice: { w: 214, h: 42 }, alert: { w: 214, h: 40 },
    countdown: null, banner: null, fallbackTop: 264 });
  const ring = touchSightKeepOut(360, 640, false, true)[0];
  assert.ok(apart(centred(360, 264, { w: 214, h: 90 }), ring) < 0, '360x640: integ\'s centred stack crosses the ring');
  const placed = [centred(360, plan.noticeTop, plan.noticeCompact ? TOUCH_COMPACT_NOTICE : { w: 214, h: 42 }),
    centred(360, plan.alertTop, plan.alertCompact ? TOUCH_COMPACT_ALERT : { w: 214, h: 40 })];
  assert.ok(placed.every((box) => apart(box, ring) >= 4) && apart(placed[0], placed[1]) >= TOUCH_NOTICE_GAP,
    `360x640: the plan keeps both off the ring and apart (${JSON.stringify(plan)})`);
}

console.log('touchNoticePlan.selftest: the touch notices keep off the reticle\'s footprint and the furniture at every recorded touch size and stage, in battle and the scope, with the countdown and a medal; integ\'s place over the sight is left');
