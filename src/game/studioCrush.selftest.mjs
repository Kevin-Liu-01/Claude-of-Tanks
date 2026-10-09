import assert from 'node:assert/strict';
import { createObstacleGrid, setObbShape } from '../world/collision.ts';
import { createStudioCrushes, planStudioCrushes } from './studioCrush.ts';

// A hull on a straight track: x fixed, z from z0 at speed (m/s), facing +Z.
const lane = (x, z0, speed, halfLength = 3.5, halfWidth = 1.8, fromMs = 0, crushReach = undefined) => ({
  halfLength, halfWidth, crushReach,
  poseAt(tMs, out) {
    if (tMs < fromMs) return false;
    out.x = x; out.z = z0 + speed * (tMs - fromMs) / 1000; out.yawRad = 0;
    return true;
  },
});
const box = (kind, x0, z0, x1, z1, extra = {}) => ({ kind, min: [x0, 0, z0], max: [x1, 1.2, z1], ...extra });

const fence = box('fencerail', -1, 9.9, 1, 10.1, { crushable: true, crushMin: 1.5 });
const bunker = box('bunker', -2, 19, 2, 21, { crushable: true, crushMin: 999 });
const house = box('structure', -2, 40, 2, 44); // not crushable
const wall = box('wallstone', -1.5, 29.7, 1.5, 30.3, { crushable: true }); // the default overrun speed
const aside = box('cart', 6, 12, 8, 14, { crushable: true, crushMin: 0 });
const diagonal = setObbShape(box('walladobe', 0, 0, 0, 0, { crushable: true, crushMin: 2 }), 0, 52, 0.3, 2, Math.PI / 4);
const query = createObstacleGrid([fence, bunker, house, wall, aside, diagonal]);
// the presentation crushables (props.ts CrushableRecord): a utility pole on the lane's edge, loose dressing on the
// lane, a pole well off it
const crushables = [
  { x: 2.2, y: 0, z: 25, h: 8, kind: 'pole', index: 0, toppled: false },
  { x: -0.6, y: 0, z: 46, h: 0.9, kind: 'barrel', recIdx: 7, dynamic: true, toppled: false },
  { x: 12, y: 0, z: 25, h: 8, kind: 'pole', index: 1, toppled: false },
];
const kindOf = (e) => (e.record ? e.record.kind : crushables[e.crushable].kind);

// 9 m/s from z=0 over 6.6 s: the hull's nose (3.5 m ahead) meets the fence at z = 9.9, its centre at 6.4 m (711 ms)
const fast = planStudioCrushes([lane(0, 0, 9)], 6600, query);
assert.deepEqual(fast.map(kindOf), ['fencerail', 'wallstone', 'walladobe'], 'crushes what it overruns fast enough, in time order');
const first = fast[0];
assert.ok(first.tMs >= 711 && first.tMs < 711 + 1000 / 60 + 1e-6, `the fence falls when the nose reaches it (${first.tMs.toFixed(1)} ms)`);
assert.ok(Math.abs(first.speedMps - 9) < 0.01, 'the overrun speed is the hull\'s');
assert.ok(Math.abs(first.dirX) < 1e-9 && Math.abs(first.dirZ - 1) < 1e-9, 'the fall follows the travel');
assert.equal(first.crushable, -1, 'a record\'s event names no crushable');
assert.ok(!fast.some((e) => e.record === bunker), 'a bunker (overrun speed 999) stands');
assert.ok(!fast.some((e) => e.record === house), 'a record that is not crushable stands');
assert.ok(!fast.some((e) => e.record === aside), 'a prop beside the track stands');
const diag = fast.find((e) => e.record === diagonal);
assert.ok(diag && diag.tMs > fast[1].tMs, 'a rotated footprint is met by its own box, after the wall');

// 1.2 m/s: under the fence's own 1.5 m/s and the default overrun speed (6 km/h)
assert.deepEqual(planStudioCrushes([lane(0, 0, 1.2)], 20000, query).map(kindOf), [], 'a crawling hull crushes nothing');
// 1.9 m/s: over the fence's 1.5 and the default 1.67, under the adobe wall's own 2
assert.deepEqual(planStudioCrushes([lane(0, 0, 1.9)], 30000, query).map(kindOf), ['fencerail', 'wallstone'],
  'each record keeps its own overrun speed');
// two hulls through the same fence: the first one to reach it crushes it, once
const pair = planStudioCrushes([lane(0, -20, 9, 3.5, 1.8, 1000), lane(0.5, 0, 9)], 6600, query);
assert.equal(pair.filter((e) => e.record === fence).length, 1, 'a record is crushed once');
assert.ok(pair.find((e) => e.record === fence).tMs < 1000, 'by the first hull to reach it');
// a hull without a track before 1 s: no speed from the gap
const late = planStudioCrushes([lane(0, 8, 9, 3.5, 1.8, 1000)], 1500, query);
assert.ok(late.every((e) => e.tMs > 1000), 'a hull appearing on its track does not crush on its first sample');

// The presentation crushables (battlePresentationRuntime.ts crushNearbyProps): a pole whose centre comes within the
// hull's reach (half its length + 0.5 m: 4.4 m for an 7.8 m hull) topples; the barrel on the lane is kicked; the far
// pole stands. The reach is a circle from the hull's centre, the speed bar 1.2 m/s.
const props = planStudioCrushes([lane(0, 0, 9, 3.5, 1.8, 0, 4.4)], 6600, query, crushables);
assert.deepEqual(props.map(kindOf), ['fencerail', 'pole', 'wallstone', 'barrel', 'walladobe'], 'records and crushables, in time order');
const pole = props.find((e) => e.crushable === 0);
// the pole at (2.2, 25): the hull's centre comes within 4.4 m at z = 25 - sqrt(4.4² - 2.2²) = 21.19 (2354 ms)
assert.ok(pole.record === null && pole.tMs >= 2354 && pole.tMs < 2354 + 1000 / 60 + 1e-6, `the pole topples as the hull reaches it (${pole.tMs.toFixed(1)} ms)`);
assert.ok(!props.some((e) => e.crushable === 2), 'a pole off the lane stands');
assert.deepEqual(planStudioCrushes([lane(0, 0, 1.1, 3.5, 1.8, 0, 4.4)], 30000, query, crushables).map(kindOf), [],
  'under 1.2 m/s nothing topples');
assert.deepEqual(planStudioCrushes([lane(0, 0, 1.3, 3.5, 1.8, 0, 4.4)], 40000, query, crushables).map(kindOf), ['pole', 'barrel'],
  'over 1.2 m/s the crushables go while the records hold');
const twice = planStudioCrushes([lane(0, 0, 9, 3.5, 1.8, 0, 4.4), lane(0.4, -12, 9, 3.5, 1.8, 0, 4.4)], 6600, query, crushables);
assert.equal(twice.filter((e) => e.crushable === 0).length, 1, 'a crushable topples once');

// The applier: live firing, seeks, restore.
const calls = [];
const world = {
  crushObstacle(record, dx, dz, speed, cause, options) { calls.push(`${record.kind}:${options?.settled ? 'settled' : 'live'}:${cause}`); return true; },
  crushProp(index) { calls.push(`${crushables[index].kind}:prop`); return true; },
  resetDestructibles() { calls.push('reset'); },
  advanceDestruction(dt) { if (dt) calls.push(`run ${dt}`); },
};
const crushes = createStudioCrushes();
crushes.setPlan(world, fast);
assert.deepEqual(calls, [], 'a fresh plan touches nothing');
assert.equal(crushes.nextTime(), fast[0].tMs);
assert.equal(crushes.advanceTo(world, 700), 0);
assert.equal(crushes.advanceTo(world, 3500), 2, 'playback fires the fence and the wall');
assert.deepEqual(calls, ['fencerail:live:ram', 'wallstone:live:ram']);
assert.equal(crushes.nextTime(), diag.tMs);
calls.length = 0;
crushes.settleTo(world, 3500);
assert.deepEqual(calls, ['reset', 'fencerail:settled:ram', 'wallstone:settled:ram'], 'a seek over a live crush restores, then settles');
calls.length = 0;
crushes.settleTo(world, diag.tMs);
assert.deepEqual(calls, ['walladobe:settled:ram'], 'a seek forward over settled crushes only adds the new ones');
calls.length = 0;
crushes.settleTo(world, 2000);
assert.deepEqual(calls, ['reset', 'fencerail:settled:ram'], 'a seek back stands the later ones up again');
calls.length = 0;
crushes.setPlan(world, []);
assert.deepEqual(calls, ['reset'], 'a new plan stands the old one\'s crushes up');
assert.equal(crushes.nextTime(), Infinity);
calls.length = 0;
crushes.restore(world);
assert.deepEqual(calls, [], 'nothing to restore after a reset');
crushes.setPlan(world, fast);
crushes.advanceTo(world, 1000);
calls.length = 0;
crushes.restore(world);
crushes.restore(null);
assert.deepEqual(calls, ['reset'], 'restore leaves the battlefield as it was found, once');

// crushables through the applier: live, each burst handed back; a seek over them runs their falls to the end
const bursts = [];
crushes.setPlan(world, props);
calls.length = 0;
crushes.advanceTo(world, 4000, (e) => bursts.push(crushables[e.crushable].kind));
assert.deepEqual(calls, ['fencerail:live:ram', 'pole:prop', 'wallstone:live:ram'], 'playback topples the pole between the records');
assert.deepEqual(bursts, ['pole'], 'and hands its burst back');
calls.length = 0;
crushes.settleTo(world, 2500);
assert.deepEqual(calls, ['reset', 'fencerail:settled:ram', 'pole:prop', 'run 1.6'], 'a seek lays the records settled and runs the pole\'s fall out');

console.log('studioCrush.selftest: pass');
