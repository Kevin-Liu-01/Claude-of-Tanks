// r10e (the coordinator, from the notices session's blind critic on integ/229 ce8b634668): a touch layout's centre
// notices keep off the reticle's footprint and the HUD's panels (touchNoticePlan.ts). Over every recorded touch size and
// stage (tools/fixtures/hud-sight-furniture.json, the furniture the layout measured there), in battle and through the
// scope, with and without the pre-battle countdown and a medal card: a plan that clears keeps TOUCH_NOTICE_GAP from the
// furniture and between its notices and 4 px from the footprint; integ's centred place, which sat on the sight on the
// phones the critic saw, is left; and on the standard stage only the smallest windows find no clear place (the rendered
// receipt, tools/hud-touch-notices.browser.mjs, measures the real ink there).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planTouchNotices, touchCentrePlace, touchSightKeepOut, TOUCH_COMPACT_ALERT, TOUCH_COMPACT_NOTICE, TOUCH_NOTICE_GAP }
  from './touchNoticePlan.ts';

const FURNITURE = JSON.parse(readFileSync(new URL('../../tools/fixtures/hud-sight-furniture.json', import.meta.url), 'utf8'));
// the furniture a notice covers first where nothing clears (battleHudLayout TOUCH_NOTICE_SOFT, the map apart: `map`)
const SOFT = new Set(['.cot-top', '.cot-mode-status.show', '.cot-ear']);
const MAP = '.cot-minimap';
const apart = (a, b) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
const boxOf = (cx, y, size) => ({ x0: cx - size.w / 2, y0: y, x1: cx + size.w / 2, y1: y + size.h });

// 1. The highest place on the centre line (owner 2026-10-22: notices centred in the screen): under a block that meets the
// line, never beside it; none where nothing fits.
{
  const score = { x0: 0, y0: 0, x1: 400, y1: 50 };
  assert.deepEqual(touchCentrePlace({ w: 100, h: 30 }, 200, 0, 400, 300, [score], 6), { cx: 200, y: 56 }, 'centred under the score');
  assert.deepEqual(touchCentrePlace({ w: 100, h: 30 }, 200, 0, 400, 300, [score, { x0: 150, y0: 50, x1: 250, y1: 120 }], 6),
    { cx: 200, y: 126 }, 'under a block on the centre line, not beside it');
  assert.deepEqual(touchCentrePlace({ w: 100, h: 30 }, 200, 0, 400, 300, [score, { x0: 0, y0: 50, x1: 140, y1: 120 }], 6),
    { cx: 200, y: 56 }, 'a block off the line leaves it');
  assert.equal(touchCentrePlace({ w: 390, h: 30 }, 200, 0, 400, 300, [], 6), null, 'no place wider than the screen allows');
}

// 1b. r10g: a button's label keeps a notice off it where a place clears, and where none does the notice covers the label
// before the sight's footprint (at 375x667 the alert sat on AUTO AIM and SCOPE; the labels are not the buttons' boxes).
{
  const base = { width: 600, height: 400, top: 20, soft: [], scope: false, seated: false, notice: { w: 100, h: 30 },
    alert: { w: 100, h: 30 }, countdown: null, banner: null, fallbackTop: 0 };
  const keep = touchSightKeepOut(600, 400, false, false);
  const [kx0, ky0, kx1, ky1] = [Math.min(...keep.map((b) => b.x0)), Math.min(...keep.map((b) => b.y0)),
    Math.max(...keep.map((b) => b.x1)), Math.max(...keep.map((b) => b.y1))];
  // (walls everywhere but a band under the score, tall enough for the two notices stacked on the centre line, and the
  // footprint itself)
  const walls = [{ x0: 0, y0: 0, x1: 600, y1: 20 }, { x0: 0, y0: 120, x1: kx0, y1: 400 }, { x0: kx1, y0: 120, x1: 600, y1: 400 },
    { x0: kx0, y0: ky1, x1: kx1, y1: 400 }];
  const label = { x0: 0, y0: 30, x1: 600, y1: 56 };
  assert.ok(planTouchNotices({ ...base, obstacles: walls }).cleared, 'without the label the band holds both notices');
  const plan = planTouchNotices({ ...base, obstacles: walls, labels: [label] });
  assert.ok(!plan.cleared, 'a label across the band leaves the notices no clear place');
  // (on the centre line the two stack: one covers the label, the other takes the band under it, neither the footprint)
  const boxes = [['detection', boxOf(plan.noticeCx, plan.noticeTop, TOUCH_COMPACT_NOTICE)], ['alert', boxOf(plan.alertCx, plan.alertTop, TOUCH_COMPACT_ALERT)]];
  for (const [name, box] of boxes) {
    assert.ok(keep.every((block) => apart(box, block) >= 0), `where none clears the ${name} keeps off the footprint (${JSON.stringify(plan)})`);
  }
  assert.ok(boxes.some(([, box]) => apart(box, label) < 0), `where none clears a notice covers the label before the footprint (${JSON.stringify(plan)})`);
}

// 1c. r10g (the coordinator's ruling): through the scope, where nothing clears, a notice covers the minimap before the
// sight's footprint (its "0 APFSDS" and zoom matter more, and the notice is brief: at 320x568 the alert sat on them); in
// battle the footprint, mostly the ring's empty middle, still goes before the map. The only room: the map's corner and
// the footprint's main box (the ring, or the scope's circle); 40 px walls everywhere else.
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
    // (the owner's centre line, 2026-10-22, yields only to a panel: where the line holds the two notices no place off the
    // walls, they take the least intrusive places off it, never a wall)
    const placed = [['detection', boxOf(plan.noticeCx, plan.noticeTop, TOUCH_COMPACT_NOTICE)],
      ['alert', boxOf(plan.alertCx, plan.alertTop, TOUCH_COMPACT_ALERT)]];
    const onWalls = placed.filter(([, box]) => walls.some((wall) => apart(box, wall) < 0)).map(([name]) => name);
    assert.ok(!onWalls.length, `${scope ? 'scope' : 'battle'}: the notices reach into the footprint, not the walls (${onWalls}): ${JSON.stringify(plan)}`);
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
      // (the notices leave the line only where the line holds them no place off every panel and control)
      assert.ok((plan.cleared ? plan.noticeCx === width / 2 && plan.alertCx === width / 2 : true) && (!plan.bannerReady || plan.bannerCx === width / 2),
        `${at}: the notices and the medal card stand on the centre line`);
      if (!plan.cleared) { uncleared.add(`${key}${countdown ? ' countdown' : ''}`); continue; }
      const keep = touchSightKeepOut(width, height, scope, seated);
      // (the countdown takes the detection's place: it never shows with it)
      const parts = [countdown ? ['the countdown', boxOf(plan.countdownCx, plan.countdownTop,
        { w: countdown.w * plan.countdownScale, h: countdown.h * plan.countdownScale })]
        : ['the detection', boxOf(plan.noticeCx, plan.noticeTop, plan.noticeCompact ? TOUCH_COMPACT_NOTICE : notice)],
        ['the alert', boxOf(plan.alertCx, plan.alertTop, plan.alertCompact ? TOUCH_COMPACT_ALERT : { w: notice.w, h: 40 })]];
      if (banner && plan.bannerReady) parts.push(['the medal card', boxOf(plan.bannerCx, plan.bannerTop, banner)]);
      for (const [i, [name, box]] of parts.entries()) {
        assert.ok(box.x0 >= TOUCH_NOTICE_GAP - 1e-6 && box.x1 <= width - TOUCH_NOTICE_GAP + 1e-6 && box.y1 <= height - TOUCH_NOTICE_GAP + 1e-6,
          `${at}: ${name} is on the screen`);
        for (const block of [...obstacles, ...soft, ...(map ? [map] : [])]) {
          assert.ok(apart(box, block) >= TOUCH_NOTICE_GAP - 1e-6, `${at}: ${name} keeps ${apart(box, block).toFixed(2)} px from ${block.name}`);
        }
        // (the countdown's place is the centre line over the crosshair, owner 2026-10-21, countdownPlace.ts: it may lie on
        // the idle sight's footprint, its top never under the aim point)
        if (name === 'the countdown') {
          assert.ok(Math.abs((box.x0 + box.x1) / 2 - width / 2) < 1e-6 && box.y0 <= height / 2 + 1e-6,
            `${at}: the countdown stands on the centre line, its top at the aim point at the lowest`);
          continue;
        }
        for (const block of keep) {
          assert.ok(apart(box, block) >= 4 - 1e-6, `${at}: ${name} keeps ${apart(box, block).toFixed(2)} px from the reticle's footprint`);
        }
        for (const [other, otherBox] of parts.slice(i + 1)) {
          assert.ok(apart(box, otherBox) >= TOUCH_NOTICE_GAP - 1e-6, `${at}: ${name} keeps ${apart(box, otherBox).toFixed(2)} px from ${other}`);
        }
      }
      if (plan.noticeTop !== fallbackTop || plan.noticeCx !== width / 2) moved++;
    }
}
assert.ok(planned === 160 && moved > 0, `the plans ran (${planned}) and moved off integ's place (${moved})`);
// where no place on the centre line keeps clear on the standard stage, in battle or the scope, without the countdown
// (owner 2026-10-22: the notices stand on the centre line; the free span beside the sight they took before sent them 200
// px aside at 844x390): the phones whose band between the objective and the marks over the ring, and under the marks'
// column, leave no notice room there reach into the footprint's reserve over the ring (least intrusive); the tall phones
// and the tablets clear
const plain = [...uncleared].filter((key) => !key.includes(':') && !key.includes('countdown')).sort();
assert.deepEqual(plain, ['320x568t', '360x640t', '375x667t', '568x290t', '640x360t', '667x375t', '740x360t', '844x390t', '932x430t'],
  `no clear place on the standard stage: ${plain.join(', ')}`);
// 3. The critic's phone: at 360x640 integ's centred place (264 px down) crossed the ring; the plan keeps both notices on
// the centre line off it.
{
  const key = '360x640t';
  const boxes = FURNITURE.sizes[key].map(([name, x0, y0, x1, y1]) => ({ name, x0, y0, x1, y1 }));
  const plan = planTouchNotices({ width: 360, height: 640, top: 62, obstacles: boxes.filter((box) => !SOFT.has(box.name) && box.name !== MAP),
    soft: boxes.filter((box) => SOFT.has(box.name)), map: boxes.find((box) => box.name === MAP), scope: false, seated: true, notice: { w: 214, h: 42 }, alert: { w: 214, h: 40 },
    countdown: null, banner: null, fallbackTop: 264 });
  const ring = touchSightKeepOut(360, 640, false, true)[0];
  assert.ok(apart(boxOf(180, 264, { w: 214, h: 90 }), ring) < 0, '360x640: integ\'s centred stack crosses the ring');
  // (on the centre line, owner 2026-10-22: one over the ring and one under its marks, neither on the ring itself)
  const ringOf = (cx, y, size) => apart(boxOf(cx, y, size), ring) >= 0;
  assert.ok(ringOf(plan.noticeCx, plan.noticeTop, plan.noticeCompact ? TOUCH_COMPACT_NOTICE : { w: 214, h: 42 })
    && ringOf(plan.alertCx, plan.alertTop, plan.alertCompact ? TOUCH_COMPACT_ALERT : { w: 214, h: 40 }),
    `360x640: the plan keeps both off the ring (${JSON.stringify(plan)})`);
}

console.log('touchNoticePlan.selftest: the touch notices and the medal card stand on the centre line, off the furniture at every recorded touch size and stage, in battle and the scope, with the countdown, and off the reticle\'s footprint wherever the line leaves a place');
