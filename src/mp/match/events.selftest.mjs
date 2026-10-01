import assert from 'node:assert/strict';
import { MESSAGE_TYPE } from '../wire/index.ts';
import { MAX_SHOT_AUTHORITY_AGE_MS, OwnShotPredictor, ReliableEventQueue } from './events.ts';

const message = (tick, kinds) => ({ type: MESSAGE_TYPE.EVENT, tick, events: kinds.map((kind, index) => ({ kind, payload: { index } })) });

// ------------------------------------------------------------ reliable queue
{
  const queue = new ReliableEventQueue();
  queue.push(message(10, ['module_state', 'tank_fire']));
  queue.push(message(12, ['shell_fired', 'shell_hit', 'tank_destroyed', 'consumable_used']));
  queue.push(message(20, ['match_ended']));
  assert.equal(queue.size, 7);
  const out = [];
  assert.equal(queue.flush(9, out), 0, 'nothing is released before its tick is presented');
  assert.equal(queue.flush(11, out), 2, 'tick 10 events are released together (both light)');
  assert.deepEqual(out.map((event) => event.kind), ['module_state', 'tank_fire']);
  out.length = 0;
  assert.equal(queue.flush(12, out), 1, 'a heavy event ends the flush');
  assert.equal(out[0].kind, 'shell_fired');
  out.length = 0;
  assert.equal(queue.flush(12, out), 1);
  assert.equal(out[0].kind, 'shell_hit');
  out.length = 0;
  assert.equal(queue.flush(12, out), 1);
  assert.equal(out[0].kind, 'tank_destroyed');
  out.length = 0;
  assert.equal(queue.flush(12, out), 1, 'the light tail follows in the next frame');
  assert.equal(out[0].kind, 'consumable_used');
  assert.equal(queue.hasKind('match_ended'), true);
  assert.equal(queue.hasKind('shell_fired'), false);
  out.length = 0;
  assert.equal(queue.flush(19, out), 0);
  assert.equal(queue.flush(20, out), 1);
  assert.equal(queue.size, 0);
  const stats = queue.stats();
  assert.equal(stats.emitted, 7);
  assert.equal(stats.peakPending, 7);
  // The budget is three light events per frame.
  queue.push(message(30, ['a', 'b', 'c', 'd', 'e']));
  out.length = 0;
  assert.equal(queue.flush(30, out), 3);
  assert.equal(queue.flush(30, out), 2);
  queue.clear();
  assert.equal(queue.size, 0);
  const tiny = new ReliableEventQueue({ maxPending: 2 });
  assert.throws(() => tiny.push(message(1, ['a', 'b', 'c'])), /backlog/);
}

// ------------------------------------------------------------ the budget's deadline (world state audit, 2026-10-01)
// A volley of heavy beats is smoothed one per frame for at most maxLateTicks past their tick; then the rest lands together,
// so no hit, impact or fall presents 13–20 ticks behind the world it belongs to.
{
  const queue = new ReliableEventQueue();
  assert.equal(queue.maxLateTicks, 4, 'one snapshot interval at 20 Hz');
  queue.push(message(100, ['shell_hit', 'shell_hit', 'shell_hit', 'shell_hit', 'shell_hit', 'shell_hit']));
  const out = [];
  assert.equal(queue.flush(100, out), 1, 'one heavy beat per frame while the volley is fresh');
  assert.equal(queue.flush(101, out), 1);
  assert.equal(queue.flush(103, out), 1);
  assert.equal(queue.flush(104, out), 3, 'four ticks on: the budget\'s one, then everything the budget still held');
  assert.equal(queue.size, 0);
  assert.equal(out.length, 6);
  queue.push(message(200, ['shell_hit']));
  queue.push(message(203, ['shell_hit', 'shell_hit', 'shell_hit']));
  out.length = 0;
  assert.equal(queue.flush(204, out), 1, 'the deadline is per beat: the tick-200 beat goes under the budget, the tick-203 ones are not yet four ticks old');
  assert.equal(queue.flush(205, out), 1, 'one tick-203 beat under the budget, two held');
  assert.equal(queue.flush(207, out), 2, 'four ticks after 203: the budget\'s one and the held one together');
  assert.equal(queue.size, 0);
  const patient = new ReliableEventQueue({ maxLateTicks: 100 });
  patient.push(message(10, ['shell_hit', 'shell_hit']));
  out.length = 0;
  assert.equal(patient.flush(60, out), 1, 'a long deadline keeps the one-per-frame smoothing');
}

// ------------------------------------------------------------ the destroyed-list guard (world state audit, 2026-10-01)
// A `world_prop_destroyed` is owed to the presentation from its arrival until the frame that presented it is done — queued
// behind the presented tick, staged by the budget, or in the frame's own event list — so the persistent destroyed list a
// snapshot carries (one interpolation delay ahead of the presented world) never lays a prop down before its fall.
{
  const queue = new ReliableEventQueue();
  const prop = (index) => ({ kind: 'world_prop_destroyed', payload: { obstacleIndex: index } });
  queue.push({ type: MESSAGE_TYPE.EVENT, tick: 40, events: [prop(5), { kind: 'shell_fired', payload: {} }, prop(5), prop(9)] });
  assert.equal(queue.isObstaclePending(5), true);
  assert.equal(queue.isObstaclePending(9), true);
  assert.equal(queue.isObstaclePending(6), false, 'an index nobody sent is not owed');
  const out = [];
  queue.flush(39, out);
  assert.equal(out.length, 0);
  assert.equal(queue.isObstaclePending(9), true, 'queued behind the presented tick: owed');
  queue.flush(40, out);
  assert.deepEqual(out.map((event) => event.kind), ['world_prop_destroyed'], 'the heavy prop event flushes alone');
  assert.equal(queue.isObstaclePending(5), true, 'in the frame being presented: still owed until the client releases it');
  queue.release(out); out.length = 0;
  assert.equal(queue.isObstaclePending(5), true, 'the second send of the same index is still staged');
  queue.flush(40, out); queue.release(out); out.length = 0; // shell_fired
  queue.flush(40, out);
  assert.equal(out[0].payload.obstacleIndex, 5);
  queue.release(out); out.length = 0;
  assert.equal(queue.isObstaclePending(5), false, 'both sends presented: no longer owed');
  assert.equal(queue.isObstaclePending(9), true);
  queue.release([prop(77)]);
  assert.equal(queue.isObstaclePending(77), false, 'releasing what was never owed is harmless');
  queue.clear();
  assert.equal(queue.isObstaclePending(9), false, 'a new socket owes nothing (its keyframe settles the list)');
}

// ------------------------------------------------------------ own-shot rule
{
  const predictor = new OwnShotPredictor();
  const ready = (tick, overrides = {}) => ({
    tick, alive: true, shellSlot: 1, reloadS: 0, ammo: 5, magazineRounds: 0, magazineCapacity: 0, guided: false,
    weaponBlocked: false, ...overrides,
  });
  assert.equal(predictor.predict(1, 1, 100), null, 'no authority: no feedback');
  predictor.observe(ready(10), 100);
  assert.equal(predictor.predict(1, 0, 110), null, 'a different slot than the authority loaded');
  assert.equal(predictor.predict(1, 1, 100 + MAX_SHOT_AUTHORITY_AGE_MS + 1), null, 'stale authority cannot vouch');
  const first = predictor.predict(1, 1, 150);
  assert.deepEqual(first, { fireSeq: 1, shellSlot: 1, confirmed: false });
  assert.equal(predictor.predict(2, 1, 160), null, 'one pending intent per ready epoch');
  assert.equal(predictor.confirm({ kind: 'shell_fired', payload: { fireIntentSeq: 1, shellSlot: 0 } }), null, 'the wrong slot confirms nothing');
  assert.equal(predictor.confirm({ kind: 'shell_fired', payload: { fireIntentSeq: 1, shellSlot: 1 } }), first);
  assert.equal(first.confirmed, true);
  assert.equal(predictor.confirm({ kind: 'shell_fired', payload: { fireIntentSeq: 1, shellSlot: 1 } }), null, 'a duplicate confirms nothing twice');
  assert.equal(predictor.predict(2, 1, 170), null, 'the same ready epoch still refuses (the authority has not shown the reload)');
  predictor.observe(ready(12, { reloadS: 2 }), 200);
  assert.equal(predictor.predict(2, 1, 210), null, 'reloading: wait for confirmation');
  predictor.observe(ready(14, { ammo: 4 }), 300);
  const second = predictor.predict(2, 1, 320);
  assert.ok(second, 'a fresh ready epoch admits the next press');
  assert.equal(predictor.confirm({ kind: 'shell_fired', payload: { fireSeq: 2, shellSlot: 1 } }), second, 'fireSeq is accepted as the intent key too');
  predictor.observe(ready(16, { alive: false }), 400);
  assert.equal(predictor.predict(3, 1, 410), null, 'dead');
  predictor.observe(ready(18, { weaponBlocked: true, ammo: 3 }), 500);
  assert.equal(predictor.predict(3, 1, 510), null, 'weapon disabled');
  predictor.observe(ready(20, { magazineCapacity: 3, magazineRounds: 0, ammo: 3 }), 600);
  assert.equal(predictor.predict(3, 1, 610), null, 'an empty magazine');
  predictor.observe(ready(22, { magazineCapacity: 3, magazineRounds: 2, ammo: 3 }), 700);
  assert.ok(predictor.predict(3, 1, 710), 'a loaded magazine');
  predictor.observe(ready(21, { ammo: 0 }), 800);
  assert.equal(predictor.authorityTick, 22, 'older authority is ignored');
  predictor.cancel();
  assert.equal(predictor.predict(4, 1, 720), null, 'cancel drops the pending intent but the epoch was used');
  assert.equal(predictor.predicted, 3);
  assert.equal(predictor.confirmed, 2);
  predictor.reset();
  assert.equal(predictor.authorityTick, -1);
}

console.log('mp events: tick-gated reliable delivery on a three-per-frame budget with heavy breaks, the owed destroyed-prop guard, own-shot feedback rule pass');
