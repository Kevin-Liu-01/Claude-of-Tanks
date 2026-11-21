// firstUseHintPolicy.selftest.mjs — the first-use hints' rules (mobile-hud-274, owner 2026-11-20: "make sure it
// properly is taken into account with other ui stuff like our existing notifications"): a combat notice preempts a
// hint, one shows at a time from a queue, the start delay and the gap hold, nothing shows in a battle the tutorial
// teaches (or behind any other gate), and no hint shows twice.
import assert from 'node:assert/strict';
import { createHintPolicy, START_DELAY_MS, HINT_GAP_MS, MIN_SEEN_MS, MAX_PER_BATTLE } from './firstUseHintPolicy.ts';

const open = (now, extra = {}) => ({ now, blocked: false, combat: false, ...extra });

// 1. the start delay: an offer at rollout waits START_DELAY_MS
{
  const p = createHintPolicy({ seen: new Set() });
  p.battleStart(0);
  assert.ok(p.offer('moduleRepair', 0, 0));
  assert.equal(p.step(open(START_DELAY_MS - 1)).show, null, 'nothing before the start delay');
  assert.equal(p.step(open(START_DELAY_MS)).show, 'moduleRepair', 'the hint shows once the delay has passed');
}

// 2. one at a time, the most urgent first, then the oldest; the gap between them
{
  const p = createHintPolicy({ seen: new Set(), maxPerBattle: 3 });
  p.battleStart(0);
  p.offer('ammoTypes', 5, 100);
  p.offer('suspension', 4, 200);
  p.offer('moduleRepair', 0, 300);
  const t0 = START_DELAY_MS;
  assert.equal(p.step(open(t0)).show, 'moduleRepair', 'the most urgent first');
  assert.equal(p.step(open(t0 + 50)).show, null, 'one on screen at a time');
  p.closed('moduleRepair', t0 + 8000);
  assert.equal(p.step(open(t0 + 8000 + HINT_GAP_MS - 1)).show, null, 'the gap holds');
  assert.equal(p.step(open(t0 + 8000 + HINT_GAP_MS)).show, 'suspension', 'then the next most urgent');
}

// 3. combat first: no hint while a combat notice is up; one that comes withdraws the hint back to the queue's head
{
  const p = createHintPolicy({ seen: new Set() });
  p.battleStart(0);
  p.offer('reload', 1, 0);
  p.offer('autoAim', 2, 0);
  const t0 = START_DELAY_MS;
  assert.equal(p.step(open(t0, { combat: true })).show, null, 'a combat notice holds every hint');
  assert.equal(p.step(open(t0 + 100)).show, 'reload');
  const out = p.step(open(t0 + 1000, { combat: true }));
  assert.deepEqual(out.withdraw, { id: 'reload', seen: false }, 'a combat notice withdraws a hint not yet seen');
  assert.equal(p.hasSeen('reload'), false);
  assert.equal(p.step(open(t0 + 1000 + HINT_GAP_MS)).show, 'reload', 'the withdrawn hint comes back first, after the gap');
  // shown long enough, a withdrawal counts it as seen
  const later = p.step(open(t0 + 1000 + HINT_GAP_MS + MIN_SEEN_MS, { combat: true }));
  assert.deepEqual(later.withdraw, { id: 'reload', seen: true }, 'shown MIN_SEEN_MS, it counts as seen');
  assert.ok(p.hasSeen('reload'));
}

// 4. the gates: a battle the tutorial teaches (or scoped, dead, the kill-cam, hints off) shows nothing
{
  const p = createHintPolicy({ seen: new Set() });
  p.battleStart(0);
  p.offer('moduleRepair', 0, 0);
  for (let t = START_DELAY_MS; t < START_DELAY_MS * 4; t += 500) {
    assert.equal(p.step(open(t, { blocked: true })).show, null, 'a closed gate shows nothing');
  }
  assert.equal(p.step(open(START_DELAY_MS * 4)).show, 'moduleRepair', 'it waits for the gate to open');
  assert.deepEqual(p.step(open(START_DELAY_MS * 4 + 100, { blocked: true })).withdraw, { id: 'moduleRepair', seen: false },
    'a gate closing (the scope raised, a death) takes the hint down');
}

// 5. never twice: a seen hint is not offered again, in this battle or the next; the per-battle cap holds
{
  const p = createHintPolicy({ seen: new Set(['armourShading']) });
  p.battleStart(0);
  assert.equal(p.offer('armourShading', 0, 0), false, 'a hint seen before is never offered');
  p.offer('moduleRepair', 0, 0);
  assert.equal(p.offer('moduleRepair', 0, 10), false, 'one offer per hint while it waits');
  p.step(open(START_DELAY_MS));
  p.closed('moduleRepair', START_DELAY_MS + 8000);
  p.battleStart(100_000);
  assert.equal(p.offer('moduleRepair', 0, 100_000), false, 'seen in one battle, never offered in the next');
  const q = createHintPolicy({ seen: new Set() });
  q.battleStart(0);
  for (const id of ['a', 'b', 'c', 'd']) q.offer(id, 1, 0);
  let shown = 0, t = START_DELAY_MS;
  for (; t < START_DELAY_MS + 120_000; t += 500) {
    const step = q.step(open(t));
    if (step.show) { shown++; q.closed(step.show, t + 8000); t += 8000; }
  }
  assert.equal(shown, MAX_PER_BATTLE, `at most ${MAX_PER_BATTLE} hints a battle`);
}

// 6. nothing waits into the next battle, and nothing is offered outside one
{
  const p = createHintPolicy({ seen: new Set() });
  assert.equal(p.offer('reload', 1, 0), false, 'no battle, no offer');
  p.battleStart(0);
  p.offer('reload', 1, 0);
  p.battleEnd();
  p.battleStart(50_000);
  assert.equal(p.step(open(50_000 + START_DELAY_MS)).show, null, 'the last battle\'s queue is gone');
}

console.log('firstUseHintPolicy.selftest: PASS (start delay, one at a time by urgency, the gap, combat preempts and re-queues, gates hold, never twice, per-battle cap)');
