import assert from 'node:assert/strict';
import { PresentationEventQueue } from './presentationEventQueue.js';

const emitted = [];
const queue = new PresentationEventQueue({
  emit: (event) => emitted.push(event.type),
  maxEventsPerFlush: 8,
});
queue.enqueue([
  { type: 'shell_hit' },
  { type: 'tank_destroyed', id: 'a' },
  { type: 'tank_destroyed', id: 'b' },
  { type: 'tank_destroyed', id: 'c' },
  { type: 'match_ended' },
]);

assert.equal(queue.hasType('match_ended'), true);
assert.equal(queue.flush(), 2, 'a flush stops after its first destruction beat');
assert.deepEqual(emitted, ['shell_hit', 'tank_destroyed']);
assert.equal(queue.flush(), 1, 'the next destruction waits for the next frame');
assert.equal(queue.flush(), 1, 'destruction bursts remain frame-bounded');
assert.equal(queue.flush(), 1, 'the result preserves event order after destruction');
assert.deepEqual(emitted, [
  'shell_hit', 'tank_destroyed', 'tank_destroyed', 'tank_destroyed', 'match_ended',
]);
assert.equal(queue.size, 0);
assert.equal(queue.hasType('match_ended'), false);
assert.deepEqual(queue.getStats(), { pending: 0, emitted: 5, peakPending: 5 });

const volley = [];
const volleyQueue = new PresentationEventQueue({
  emit: (event) => volley.push(event.id),
});
volleyQueue.enqueue(Array.from({ length: 14 }, (_, id) => ({ type: 'shell_fired', id })));
assert.equal(volleyQueue.flush(), 1, 'default queue admits only one full shot graph per frame');
assert.equal(volleyQueue.size, 13, 'the rest of a synchronized volley remains ordered');
while (volleyQueue.size) volleyQueue.flush();
assert.deepEqual(volley, Array.from({ length: 14 }, (_, id) => id),
  'volley shaping preserves every report and its authoritative order');

console.log('presentationEventQueue self-test passed');
