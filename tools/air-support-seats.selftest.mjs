// air-support-seats.selftest.mjs — Air Support's controls keep their own seats with the binoculars up (item
// air-support-seats-276; notices-276 found the crossings beside the close's stills).
// - the judge (tools/air-support-seats.mjs seatsProblems) passes the live seats recorded after the fix at the touch sizes
//   it failed at, and fails today's crossings (the negative control, recorded live on integ/276 66f8df0b76): at 844x390
//   CALL under the vehicle controls' edge section and the Support dock on CALL; at 820x1180 the selected shell on the rack;
// - it reads the dock, the rack and CALL from src/ui/hudViewControls.ts (VIEW_CONTROLS), the list every notice planner
//   keeps off, so a seat the planners stop seeing is a seat the judge stops seeing too;
// - its live negative control (plantCrossing) is a crossing the judge must find at any size.
// The live boxes at the six gauntlet sizes are tools/air-support-shots.mjs --seats.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VIEW_CONTROLS } from '../src/ui/hudViewControls.ts';
import { SEATS, crossing, seatsProblems } from './air-support-seats.mjs';

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

// ---- the capture tool runs this judge with its negative control
const shots = readFileSync('tools/air-support-shots.mjs', 'utf8');
for (const name of ['--seats', 'seatsProblems', 'plantCrossing', 'measureSeats']) assert.ok(shots.includes(name), `air-support-shots.mjs ${name}`);

console.log('air-support-seats selftest: PASS');
