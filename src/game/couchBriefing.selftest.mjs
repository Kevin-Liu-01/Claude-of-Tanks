// Couch mode's briefing (docs/COUCH-MODE.md "The briefing"; Kevin 2026-11-20: "have it be centered in screen when i
// press start and go through a couple things then go!"): three steps the host moves on with Enter or Space, a phone's
// Ready lighting its seat, a Skip going to the last step, GO once, and every seat ready deploying; a seat's phone sees
// its step and its own Ready, and nothing once it deployed or for a seat not in play.
import assert from 'node:assert/strict';
import { COUCH_BRIEF_STEPS, couchBriefSeatView, createCouchBriefing } from './couchBriefing.ts';

assert.deepEqual([...COUCH_BRIEF_STEPS], ['seats', 'phone', 'sides'], 'who is who, the phone, the sides');

{
  const b = createCouchBriefing([1, 3]);
  assert.equal(b.stepId, 'seats');
  assert.equal(b.back(), false, 'no step before the first');
  assert.equal(b.next(), 'step');
  assert.equal(b.stepId, 'phone');
  assert.equal(b.back(), true);
  assert.equal(b.stepId, 'seats');
  b.next(); b.next();
  assert.equal(b.stepId, 'sides');
  assert.equal(b.next(), 'go', 'Next on the last step is GO');
  assert.equal(b.done, true);
  assert.equal(b.next(), 'none', 'it deploys once');
  assert.equal(b.go(), 'none');
  assert.equal(b.ready(1), 'none', 'nothing moves it after GO');
}
{
  const b = createCouchBriefing([1, 3]);
  assert.equal(b.ready(2), 'none', 'a seat not in play is no one\'s Ready');
  assert.equal(b.ready(1), 'step');
  assert.equal(b.isReady(1), true);
  assert.equal(b.allReady, false);
  assert.equal(b.stepId, 'seats', 'a Ready moves no step');
  assert.deepEqual(couchBriefSeatView(b, 1), { s: 0, n: 3, r: true }, 'the phone sees its step and its own Ready');
  assert.deepEqual(couchBriefSeatView(b, 3), { s: 0, n: 3, r: false });
  assert.equal(couchBriefSeatView(b, 2), undefined, 'a seat not in play sees none');
  assert.equal(b.ready(3), 'go', 'every seat ready deploys');
  assert.equal(couchBriefSeatView(b, 1), undefined, 'and the phones\' briefing goes with it');
}
{
  const b = createCouchBriefing([2, 4, 5]);
  assert.equal(b.ready(4, true), 'step', 'Skip readies its seat');
  assert.equal(b.stepId, 'sides', 'and takes the screen to the last step');
  assert.equal(b.isReady(4), true);
  assert.equal(b.go(), 'go', 'GO deploys with seats still waiting');
}
assert.equal(createCouchBriefing([]).allReady, false, 'no seats is never all ready');
assert.equal(couchBriefSeatView(null, 1), undefined);

console.log('couchBriefing.selftest: PASS — three steps, Enter moves on, a Ready lights its seat, Skip to the last step, GO once, every seat ready deploys');
