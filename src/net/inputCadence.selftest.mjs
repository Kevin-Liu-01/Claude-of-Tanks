import assert from 'node:assert/strict';
import { NetworkInputCadence } from './inputCadence.ts';

const held = {
  throttle: 1,
  steer: 0,
  brake: false,
  fire: false,
  aimLocked: false,
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

for (const refreshHz of [60, 90, 120, 144, 165, 240]) {
  const clock = new NetworkInputCadence();
  let count = 0;
  let recordedS = 0;
  let elapsedSinceSend = 0;
  for (let frame = 0; frame < refreshHz * 10; frame++) {
    clock.advance(1 / refreshHz);
    elapsedSinceSend += 1 / refreshHz;
    if (!clock.shouldSend(held)) continue;
    const elapsed = clock.commit(held);
    assert.ok(Math.abs(elapsed - elapsedSinceSend) < 1e-12,
      'upload phase preservation cannot change actual input replay duration');
    elapsedSinceSend = 0;
    recordedS += elapsed;
    count++;
  }
  assert.ok(count >= 599 && count <= 601,
    `${refreshHz} Hz display preserves 60 Hz authority upload phase (${count} / 10s)`);
  assert.ok(Math.abs(recordedS + clock.pendingElapsedS - 10) < 1e-9,
    'cadence phase is not double-counted as simulated input time');
}

{
  const clock = new NetworkInputCadence();
  const frames = [1 / 120, 1 / 90, 1 / 165, 1 / 144, 1 / 60];
  let time = 0;
  let count = 0;
  for (let index = 0; index < 2_000; index++) {
    const dt = frames[index % frames.length];
    time += dt;
    clock.advance(dt);
    if (clock.shouldSend(held)) { clock.commit(held); count++; }
  }
  assert.ok(Math.abs(count - time * 60) <= 1,
    `variable-rate frames preserve upload phase (${count} versus ${time * 60})`);
  clock.advance(10);
  assert.equal(clock.shouldSend(held), true);
  assert.equal(clock.commit(held), 0.1, 'suspension preserves the existing catch-up duration bound');
  assert.equal(clock.shouldSend(held), false, 'resume cannot emit a stale catch-up packet burst');
}

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
assert.equal(cadence.shouldSend({ ...held, aimLocked: true }), true,
  'gun-hold press edges bypass the held-state interval');
cadence.commit({ ...held, aimLocked: true });
cadence.advance(1 / 240);
assert.equal(cadence.shouldSend({ ...held, aimLocked: false }), true,
  'gun-hold release reaches authority without waiting for cadence');
cadence.commit({ ...held, aimLocked: false });
cadence.advance(1 / 240);
assert.equal(cadence.shouldSend({ ...held, throttle: 0.5 }), true,
  'meaningful analog changes bypass the held-state interval');

cadence.reset();
for (let frame = 0; frame < 100; frame++) cadence.advance(1 / 60);
assert.equal(cadence.pendingElapsedS, 0.1,
  'a suspended or backpressured page cannot accumulate an unbounded prediction step');

console.log('inputCadence.selftest: display-independent uploads and immediate edges passed');
