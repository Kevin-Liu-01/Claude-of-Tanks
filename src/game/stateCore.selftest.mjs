import assert from 'node:assert/strict';
import { createBus, createGameState, mulberry32 } from './stateCore.ts';

const first = mulberry32(6000);
const second = mulberry32(6000);
assert.deepEqual(
  Array.from({ length: 8 }, () => first()),
  Array.from({ length: 8 }, () => second()),
  'equal seeds must produce an equal deterministic stream',
);

const recorded = [];
const bus = createBus((event, payload) => recorded.push([event, payload]));
const delivered = [];
let stopSecond = () => {};
bus.on('round', (payload) => {
  delivered.push(['first', payload]);
  stopSecond();
});
stopSecond = bus.on('round', (payload) => delivered.push(['second', payload]));
bus.emit('round', 1);
bus.emit('round', 2);
assert.deepEqual(delivered, [
  ['first', 1], ['second', 1], ['first', 2],
], 'listener mutation must not alter the active dispatch snapshot');
assert.deepEqual(recorded, [['round', 1], ['round', 2]]);

const resilient = createBus(() => { throw new Error('diagnostic failure'); });
let survived = false;
resilient.on('event', () => { survived = true; });
resilient.emit('event', null);
assert.equal(survived, true, 'diagnostic failures must not stop gameplay delivery');

const a = createGameState();
const b = createGameState();
assert.equal(a.phase, 'garage');
assert.equal(a.mapId, 'verdant');
assert.notEqual(a.tanks, b.tanks);
assert.notEqual(a.tankById, b.tankById);
assert.deepEqual(a.openingRouteJobs, []);

console.log('stateCore.selftest: deterministic session shell and mutation-safe bus passed');
