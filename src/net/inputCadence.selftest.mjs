import assert from 'node:assert/strict';
import { NetworkInputCadence } from './inputCadence.ts';

const held = {
  throttle: 1,
  steer: 0,
  brake: false,
  fire: false,
  shellSlot: 0,
  actionBits: 0,
};
const cadence = new NetworkInputCadence({ sendHz: 60 });

cadence.advance(1 / 240);
assert.equal(cadence.shouldSend(held), true, 'the first held state is immediate');
assert.equal(cadence.commit(held), 1 / 240);

let sends = 1;
for (let frame = 0; frame < 239; frame++) {
  cadence.advance(1 / 240);
  if (!cadence.shouldSend(held)) continue;
  cadence.commit(held);
  sends++;
}
assert.ok(sends >= 59 && sends <= 61,
  `240 Hz presentation produces a bounded 60 Hz upload cadence (${sends})`);

cadence.reset();
cadence.advance(1 / 240);
cadence.commit(held);
cadence.advance(1 / 240);
assert.equal(cadence.shouldSend({ ...held, fire: true }), true,
  'fire edges bypass the held-state interval');
cadence.commit({ ...held, fire: true });
cadence.advance(1 / 240);
assert.equal(cadence.shouldSend({ ...held, actionBits: 4 }), true,
  'one-shot action bits bypass the held-state interval');
cadence.commit({ ...held, actionBits: 4 });
cadence.advance(1 / 240);
assert.equal(cadence.shouldSend({ ...held, throttle: 0.5 }), true,
  'meaningful analog changes bypass the held-state interval');

cadence.reset();
for (let frame = 0; frame < 100; frame++) cadence.advance(1 / 60);
assert.equal(cadence.pendingElapsedS, 0.1,
  'a suspended or backpressured page cannot accumulate an unbounded prediction step');

console.log('inputCadence.selftest: display-independent uploads and immediate edges passed');
