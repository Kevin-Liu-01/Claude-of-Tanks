import assert from 'node:assert/strict';
import { LocalAmmoSelectionIntent } from './localAmmoSelectionIntent.ts';

const intent = new LocalAmmoSelectionIntent();
assert.equal(intent.reconcile(0, 0, null, 1, false), 0);
assert.equal(intent.pending, false);
assert.equal(intent.reconcile(1, 0, null, 2, false), 1, 'unsent selection survives authority');
assert.equal(intent.pending, true);
assert.equal(intent.reconcile(1, 1, 500, 3, false), 1);
assert.equal(intent.pending, true, 'slot equality and arbitrary ACK cannot settle an unsent intent');
intent.recordSubmitted(1, 10);
intent.recordSubmitted(1, 11);
assert.equal(intent.reconcile(1, 0, 9, 4, false), 1);
assert.equal(intent.reconcile(1, 1, 10, 5, false), 1);
assert.equal(intent.pending, false, 'first submitted sequence settles even while newer repeats remain in flight');
assert.equal(intent.reconcile(1, 0, 10, 6, false), 0, 'later authoritative reset owns settled input');

intent.recordSubmitted(1, 11);
intent.recordSubmitted(0, 12);
assert.equal(intent.pending, true);
assert.equal(intent.reconcile(0, 0, 10, 7, false), 0);
assert.equal(intent.pending, true, 'returning to the visible authority value is still a pending cancellation');
assert.equal(intent.reconcile(0, 1, 11, 8, false), 0, 'delayed previous selection cannot erase cancellation');
assert.equal(intent.reconcile(0, 0, 12, 9, false), 0);
assert.equal(intent.pending, false);

intent.recordSubmitted(1, 13);
assert.equal(intent.reconcile(0, 1, 13, 10, false), 0,
  'a cancellation not yet submitted is observed before the older selection ACK');
assert.equal(intent.pending, true);
intent.recordSubmitted(0, 14);
assert.equal(intent.reconcile(0, 0, 14, 10, false), 0);
assert.equal(intent.pending, true, 'same authority tick with a changed ACK cannot settle a newer intent');
assert.equal(intent.reconcile(0, 1, 100, 9, false), 0);
assert.equal(intent.pending, true, 'older authority cannot acknowledge a newer intent');
assert.equal(intent.reconcile(0, 0, 14, 11, false), 0);
assert.equal(intent.pending, false);

for (const ack of [null, undefined, -1, 1.5, NaN, Infinity, 0x80000000, '15']) {
  intent.reset();
  intent.reconcile(0, 0, null, 1, false);
  intent.recordSubmitted(1, 15);
  assert.equal(intent.reconcile(1, 0, ack, 2, false), 1);
  assert.equal(intent.pending, true, 'malformed/null receipts are never sequence zero');
}

intent.reset();
intent.reconcile(0, 0, null, 1, false);
intent.recordSubmitted(1, 0x7fffffff);
assert.equal(intent.reconcile(1, 0, 0x7ffffffe, 2, false), 1);
assert.equal(intent.reconcile(1, 1, 0, 3, false), 1);
assert.equal(intent.pending, false, 'input receipt wrap covers the preceding maximum sequence');
intent.recordSubmitted(0, 1);
assert.equal(intent.reconcile(0, 1, 0x7fffffff, 4, false), 0);
assert.equal(intent.pending, true, 'pre-wrap receipt cannot cover post-wrap cancellation');
assert.equal(intent.reconcile(0, 2, 1, 5, false), 2);
assert.equal(intent.pending, false, 'authority can deny/reset the requested slot after consuming its input');

intent.recordSubmitted(0, 2);
assert.equal(intent.reconcile(0, 1, null, 6, true), 1);
assert.equal(intent.pending, false, 'death drops obsolete pending input');
intent.recordSubmitted(2, 3);
intent.reset();
assert.equal(intent.pending, false);
assert.equal(intent.reconcile(2, 0, null, 0, false), 0, 'new round/session seeds only its authority');
intent.recordSubmitted(1, -1);
assert.equal(intent.pending, false, 'invalid submission does not claim an input receipt');
intent.recordSubmitted(99, 0);
assert.equal(intent.pending, false);
assert.equal(intent.reconcile(0, 99, 0, 1, false), 0);
assert.equal(intent.reconcile(0, 1, 0, NaN, false), 0);

console.log('local ammunition selection intent selftest passed');
