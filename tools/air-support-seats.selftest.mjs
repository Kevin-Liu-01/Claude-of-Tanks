// air-support-seats.selftest.mjs — Air Support's controls keep their own seats with the binoculars up (item
// air-support-seats-276; notices-276 found the crossings beside the close's stills).
// - the judge (tools/air-support-seats.mjs seatsProblems) passes the live seats recorded after the fix at the touch sizes
//   it failed at, and fails today's crossings (the negative control, recorded live on integ/276 66f8df0b76): at 844x390
//   CALL under the vehicle controls' edge section and the Support dock on CALL; at 820x1180 the selected shell on the rack;
// - it reads the dock, the rack and CALL from src/ui/hudViewControls.ts (VIEW_CONTROLS), the list every notice planner
//   keeps off, so a seat the planners stop seeing is a seat the judge stops seeing too;
// - its live negative control (plantCrossing) is a crossing the judge must find at any size;
// - the planner that seats them (src/ui/strikeSeats.ts) keeps each designed seat where it is clear, moves one off the
//   items at 744x1001, and over a seeded sweep of windows and boxes puts no seat off the screen or on any box.
// The live boxes at the six gauntlet sizes are tools/air-support-shots.mjs --seats.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VIEW_CONTROLS } from '../src/ui/hudViewControls.ts';
import { SEATS, crossing, seatsProblems } from './air-support-seats.mjs';
import { SEAT_GAP, planStrikeSeats } from '../src/ui/strikeSeats.ts';

// the recorded measures (measureSeats at each size, the binoculars up): before/ on integ/276, after/ with this item
const FIXTURES = JSON.parse(readFileSync('tools/air-support-seats.fixtures.json', 'utf8'));

// ---- the seats come from the shared list
for (const role of ['call', 'rack', 'dock']) {
  const selector = SEATS.find(([r]) => r === role)?.[1];
  assert.ok(VIEW_CONTROLS.includes(selector), `${role} is VIEW_CONTROLS' own selector (${selector})`);
}

// ---- the box arithmetic
assert.equal(crossing({ x: 0, y: 0, w: 44, h: 44 }, { x: 44, y: 0, w: 44, h: 44 }), null, 'touching tiles do not cross');
assert.equal(crossing({ x: 0, y: 0, w: 44, h: 44 }, { x: 43.7, y: 0, w: 44, h: 44 }), null, 'sub-pixel rounding is not a crossing');
assert.deepEqual(crossing({ x: 0, y: 0, w: 44, h: 44 }, { x: 34, y: 40, w: 44, h: 44 }), { w: 10, h: 4 });

// ---- the judge on the recorded seats
const problemsOf = (key) => seatsProblems(FIXTURES[key]);
for (const key of Object.keys(FIXTURES).filter((k) => k.startsWith('after/'))) {
  assert.deepEqual(problemsOf(key), [], `${key}: the fixed seats pass`);
}
// the negative control: today's crossings, each the one the brief names
const has = (key, a, b) => problemsOf(key).some((p) => p.startsWith(`${a} `) && p.includes(` crosses ${b} `)
  || p.startsWith(`${b} `) && p.includes(` crosses ${a} `));
assert.ok(has('before/phone-844x390', 'call', 'vehicle'), '844x390: CALL under the vehicle controls fails');
assert.ok(has('before/phone-844x390', 'call', 'dock'), '844x390: the dock on CALL fails');
assert.ok(has('before/ipad-820x1180', 'rack', 'shell'), '820x1180: the selected shell on the rack fails');
assert.ok(problemsOf('before/ipad-820x1180').some((p) => p.includes(':selected')), '820x1180: the shell it names is the selected one');

// ---- what the judge demands
const after = FIXTURES['after/phone-844x390'];
assert.deepEqual(seatsProblems({ ...after, up: false }), ['the binoculars are not up']);
assert.ok(seatsProblems({ ...after, boxes: after.boxes.filter((b) => b.role !== 'call') }).includes('no call shown'),
  'a touch layout without CALL fails');
assert.deepEqual(seatsProblems({ ...after, touch: false, boxes: after.boxes.filter((b) => b.role !== 'call') }), [],
  'a mouse layout calls by the key');
// Support in its own dock is one seat, not a crossing
const support = after.boxes.find((b) => b.role === 'support'), dock = after.boxes.find((b) => b.role === 'dock');
assert.ok(support && dock && crossing(support, dock), 'the fixture seats Support in its dock');
// the live negative control's shape: the rack laid on Support fails
const planted = { ...after, boxes: after.boxes.map((b) => (b.role === 'rack' ? { ...b, x: support.x, y: support.y } : b)) };
assert.ok(seatsProblems(planted).some((p) => p.startsWith('rack ') && p.includes('crosses support')), 'the planted rack fails');

// ---- the planner (src/ui/strikeSeats.ts): seats from the measured boxes, never on one
{
  const support = { x: 418, y: 642, w: 44, h: 44 };
  const base = { width: 744, height: 1001, slot: '', systemsLeft: 465, systemsTop: 640, support,
    rack: { w: 279, h: 44 }, readout: { w: 122, h: 40 }, call: { w: 112, h: 56 } };
  // the designed seats where they are clear: the call-ins 54 px under the row on Support's edge, the readout under them,
  // CALL on the centre line 252 px over the foot
  const open = planStrikeSeats({ ...base, obstacles: [support] });
  assert.deepEqual(open.rack, { x: 418, y: 694, w: 279, h: 44 }, 'the call-ins keep their designed seat');
  assert.deepEqual(open.readout, { x: 418, y: 748, w: 122, h: 40 });
  // (CALL's designed seat, 693..749, is in the call-ins' band: it takes the nearest clear place along it)
  assert.ok(!crossing(open.call, open.rack), 'CALL clears the call-ins');
  // 744x1001: the items' column under the shells blocks the designed seat (the overlap probe's 19x43); the call-ins end
  // short of it, and CALL and the readout clear both
  const items = [0, 1, 2].map((i) => ({ x: 683, y: 695 + i * 61, w: 52, h: 52 }));
  const blocked = planStrikeSeats({ ...base, obstacles: [support, ...items] });
  for (const part of ['rack', 'readout', 'call']) {
    for (const o of items) assert.equal(crossing(blocked[part], o), null, `${part} clears the items`);
  }
  assert.ok(blocked.rack.x + blocked.rack.w <= 683 - SEAT_GAP, 'the call-ins end a gap short of the items');
  // any size, any kit: a seeded sweep of windows and boxes; every seat on the screen and on no box or other seat
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let planned = 0;
  for (let n = 0; n < 400; n++) {
    const width = 360 + Math.round(rnd() * 1600), height = 360 + Math.round(rnd() * 900);
    const systemsLeft = 60 + Math.round(rnd() * (width - 200)), systemsTop = 60 + Math.round(rnd() * (height - 160));
    const sup = { x: systemsLeft - 47, y: systemsTop + 2, w: 44, h: 44 };
    const obstacles = [sup, ...Array.from({ length: 8 }, () => ({ x: rnd() * width, y: rnd() * height, w: 44 + rnd() * 60, h: 44 + rnd() * 30 }))];
    const seats = planStrikeSeats({ width, height, slot: rnd() < 0.3 ? 'edge' : '', systemsLeft, systemsTop, support: sup,
      rack: { w: 279, h: 44 }, readout: { w: 163, h: 40 }, call: { w: 112, h: 56 }, obstacles });
    if (!seats) continue;
    planned++;
    const parts = [seats.rack, seats.readout, seats.call].filter(Boolean);
    for (const p of parts) {
      assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= width && p.y + p.h <= height, `on the ${width}x${height} screen`);
      for (const o of obstacles) assert.equal(crossing(p, o), null, `a seat on a box at ${width}x${height}`);
      for (const q of parts) if (q !== p) assert.equal(crossing(p, q), null, 'two seats crossed');
    }
  }
  assert.ok(planned > 300, `the sweep planned ${planned} of 400`);
}

// ---- the capture tool runs this judge with its negative control
const shots = readFileSync('tools/air-support-shots.mjs', 'utf8');
for (const name of ['--seats', 'seatsProblems', 'plantCrossing', 'measureSeats']) assert.ok(shots.includes(name), `air-support-shots.mjs ${name}`);

console.log('air-support-seats selftest: PASS');
