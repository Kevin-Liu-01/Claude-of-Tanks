// r10e (the coordinator, from the notices session's blind critic on integ/229 ce8b634668): a touch layout's centre
// notices keep off the reticle's footprint and the HUD's panels (touchNoticePlan.ts). Over every recorded touch size and
// stage (tools/fixtures/hud-sight-furniture.json, the furniture the layout measured there), in battle and through the
// scope, with and without the pre-battle countdown and a medal card: a plan that clears keeps TOUCH_NOTICE_GAP from the
// furniture and between its notices and 4 px from the footprint; integ's centred place, which sat on the sight on the
// phones the critic saw, is left; and on the standard stage only the smallest windows find no clear place (the rendered
// receipt, tools/hud-touch-notices.browser.mjs, measures the real ink there).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planTouchNotices, touchFreePlace, touchSightKeepOut, TOUCH_COMPACT_ALERT, TOUCH_COMPACT_NOTICE, TOUCH_NOTICE_GAP }
  from './touchNoticePlan.ts';

const FURNITURE = JSON.parse(readFileSync(new URL('../../tools/fixtures/hud-sight-furniture.json', import.meta.url), 'utf8'));
// the furniture a notice covers first where nothing clears (battleHudLayout TOUCH_NOTICE_SOFT, the map apart: `map`)
const SOFT = new Set(['.cot-top', '.cot-mode-status.show', '.cot-ear']);
const MAP = '.cot-minimap';
const apart = (a, b) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
const boxOf = (cx, y, size) => ({ x0: cx - size.w / 2, y0: y, x1: cx + size.w / 2, y1: y + size.h });

// 1. The highest free place: centred on the sight where it fits, else in the free span nearest it, lower down only where
// no span on a higher row holds it; none where nothing fits.
{
  const score = { x0: 0, y0: 0, x1: 400, y1: 50 };
  assert.deepEqual(touchFreePlace({ w: 100, h: 30 }, 200, 0, 400, 300, [score], 6), { cx: 200, y: 56 }, 'centred under the score');
  assert.deepEqual(touchFreePlace({ w: 100, h: 30 }, 200, 0, 400, 300, [score, { x0: 150, y0: 50, x1: 250, y1: 120 }], 6),
    { cx: 94, y: 56 }, 'beside a block on the centre line, in the nearer span');
  assert.deepEqual(touchFreePlace({ w: 100, h: 30 }, 200, 0, 400, 300, [score, { x0: 60, y0: 50, x1: 340, y1: 120 }], 6),
    { cx: 200, y: 126 }, 'under it where the spans beside it are too narrow');
  assert.equal(touchFreePlace({ w: 390, h: 30 }, 200, 0, 400, 300, [], 6), null, 'no place wider than the screen allows');
}

// 1b. r10g: a button's label keeps a notice off it where a place clears, and where none does the notice covers the label
// before the sight's footprint (at 375x667 the alert sat on AUTO AIM and SCOPE; the labels are not the buttons' boxes).
{
  const base = { width: 600, height: 400, top: 20, soft: [], scope: false, seated: false, notice: { w: 100, h: 30 },
    alert: { w: 100, h: 30 }, countdown: null, banner: null, fallbackTop: 0 };
  const keep = touchSightKeepOut(600, 400, false, false);
  const [kx0, ky0, kx1, ky1] = [Math.min(...keep.map((b) => b.x0)), Math.min(...keep.map((b) => b.y0)),
    Math.max(...keep.map((b) => b.x1)), Math.max(...keep.map((b) => b.y1))];
  // (walls everywhere but a band under the score and the footprint itself)
  const walls = [{ x0: 0, y0: 0, x1: 600, y1: 20 }, { x0: 0, y0: 70, x1: kx0, y1: 400 }, { x0: kx1, y0: 70, x1: 600, y1: 400 },
    { x0: kx0, y0: ky1, x1: kx1, y1: 400 }, { x0: kx0, y0: 70, x1: kx1, y1: ky0 }];
  const label = { x0: 0, y0: 30, x1: 600, y1: 56 };
  assert.ok(planTouchNotices({ ...base, obstacles: walls }).cleared, 'without the label the band holds both notices');
  const plan = planTouchNotices({ ...base, obstacles: walls, labels: [label] });
  assert.ok(!plan.cleared, 'a label across the band leaves the notices no clear place');
  for (const [name, box] of [['detection', boxOf(plan.noticeCx, plan.noticeTop, TOUCH_COMPACT_NOTICE)],
    ['alert', boxOf(plan.alertCx, plan.alertTop, TOUCH_COMPACT_ALERT)]]) {
    assert.ok(apart(box, label) < 0 && keep.every((block) => apart(box, block) >= 0),
      `where none clears the ${name} covers the label, not the footprint (${JSON.stringify(plan)})`);
  }
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
    const placed = [['detection', boxOf(plan.noticeCx, plan.noticeTop, TOUCH_COMPACT_NOTICE)],
      ['alert', boxOf(plan.alertCx, plan.alertTop, TOUCH_COMPACT_ALERT)]];
    const onMap = placed.filter(([, box]) => apart(box, map) < 0).map(([name]) => name);
    const onSight = placed.filter(([, box]) => keep.some((block) => apart(box, block) < 0)).map(([name]) => name);
    if (scope) assert.ok(onMap.length === 2 && !onSight.length, `scope: the notices cover the map (${onMap}), not the sight (${onSight}): ${JSON.stringify(plan)}`);
    else assert.ok(!onMap.length && onSight.length === 2, `battle: the notices reach into the footprint (${onSight}), not the map (${onMap}): ${JSON.stringify(plan)}`);
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
// where no place keeps clear on the standard stage, in battle or the scope, without the countdown: the smallest windows
// only (the recorded furniture is the scope's, its vision plate in every variant); the critic's phone and landscape, the
// tall phones and the wide landscapes all clear (the countdown and an objective panel take more room: least intrusive)
const plain = [...uncleared].filter((key) => !key.includes(':') && !key.includes('countdown')).sort();
assert.deepEqual(plain, ['320x568t', '568x290t', '640x360t', '667x375t'], `no clear place on the standard stage: ${plain.join(', ')}`);
// 3. The critic's phone: at 360x640 integ's centred place (264 px down) crossed the ring; the plan moves the detection
// off it, right of the map under the controls row.
{
  const key = '360x640t';
  const boxes = FURNITURE.sizes[key].map(([name, x0, y0, x1, y1]) => ({ name, x0, y0, x1, y1 }));
  const plan = planTouchNotices({ width: 360, height: 640, top: 62, obstacles: boxes.filter((box) => !SOFT.has(box.name) && box.name !== MAP),
    soft: boxes.filter((box) => SOFT.has(box.name)), map: boxes.find((box) => box.name === MAP), scope: false, seated: true, notice: { w: 214, h: 42 }, alert: { w: 214, h: 40 },
    countdown: null, banner: null, fallbackTop: 264 });
  const ring = touchSightKeepOut(360, 640, false, true)[0];
  assert.ok(apart(boxOf(180, 264, { w: 214, h: 90 }), ring) < 0, '360x640: integ\'s centred stack crosses the ring');
  assert.ok(plan.cleared && plan.noticeTop < ring.y0 && plan.alertTop < ring.y0, `360x640: the plan sets both over the sight (${JSON.stringify(plan)})`);
}

console.log('touchNoticePlan.selftest: the touch notices keep off the reticle\'s footprint and the furniture at every recorded touch size and stage, in battle and the scope, with the countdown and a medal; integ\'s place over the sight is left');
