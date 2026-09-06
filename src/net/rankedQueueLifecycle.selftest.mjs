import assert from 'node:assert/strict';
import { createRankedQueueLifecycle } from './rankedQueueLifecycle.ts';

function ticket(id, status = 'queued') {
  let cancellations = 0;
  return { ticketId: id, status,
    cancel: async () => { cancellations++; return { cancelled: true }; },
    get cancellations() { return cancellations; },
  };
}

// The attempt exists before loading modules/profile/leaderboard, not only
// after the first network await. Duplicate clicks and stale UI are excluded.
{
  const owner = createRankedQueueLifecycle();
  const pendingRefresh = owner.begin();
  assert.equal(owner.begin(), null, 'second click cannot create a concurrent search');
  await owner.cancel();
  assert.equal(pendingRefresh.signal.aborted, true);
  assert.equal(pendingRefresh.isCurrent(), false, 'late refresh cannot start joining');
}

// Cancel before HTTP join resolves, begin a different search, then receive the
// old response. Only the exact old ticket is cancelled; it never becomes live.
{
  const owner = createRankedQueueLifecycle();
  const oldAttempt = owner.begin();
  await owner.cancel();
  const replacement = owner.begin();
  const newTicket = ticket('new');
  assert.equal(await replacement.adoptTicket(newTicket), true);
  const lateTicket = ticket('late-old');
  assert.equal(await oldAttempt.adoptTicket(lateTicket), false);
  assert.equal(lateTicket.cancellations, 1);
  assert.equal(newTicket.cancellations, 0);
  oldAttempt.release();
  assert.equal(replacement.isCurrent(), true, 'stale completion cannot release current ownership');
  await owner.cancel();
  await owner.cancel();
  assert.equal(newTicket.cancellations, 1, 'current polling ticket is cancelled exactly once');
}

// Match authority owns the ticket after handoff, and cannot be cancelled as a
// queued search by late menu disposal. Already-matched late responses remain
// discarded rather than launching an unwanted battle after mode switching.
{
  const owner = createRankedQueueLifecycle();
  const attempt = owner.begin();
  const assigned = ticket('assigned');
  await attempt.adoptTicket(assigned);
  attempt.takeMatch();
  await owner.cancel();
  assert.equal(assigned.cancellations, 0);
  const alreadyMatched = ticket('late-match', 'matched');
  assert.equal(await attempt.adoptTicket(alreadyMatched), false);
  assert.equal(alreadyMatched.cancellations, 0);
}

// Cancellation releases ownership synchronously, even if its HTTP request is
// slow and eventually fails. Its delayed error cannot touch a replacement's
// ownership, ticket or cancellation controls.
{
  const owner = createRankedQueueLifecycle();
  const failedAttempt = owner.begin();
  let rejectCancellation;
  const slowTicket = {
    ticketId: 'slow-cancel', status: 'queued',
    cancel: () => new Promise((_resolve, reject) => { rejectCancellation = reject; }),
  };
  await failedAttempt.adoptTicket(slowTicket);
  const cancellation = owner.cancel();
  assert.equal(failedAttempt.isCurrent(), false, 'old UI must be finalized before awaiting cancellation');
  const replacement = owner.begin();
  const currentTicket = ticket('replacement-during-cancel');
  await replacement.adoptTicket(currentTicket);
  rejectCancellation(new Error('old cancellation HTTP failed'));
  await assert.rejects(cancellation, /old cancellation HTTP failed/);
  failedAttempt.release();
  assert.equal(replacement.isCurrent(), true);
  assert.equal(currentTicket.cancellations, 0);
  await owner.cancel();
  assert.equal(currentTicket.cancellations, 1);
}

console.log('rankedQueueLifecycle.selftest: pre-await cancellation, exact late-ticket disposal, replacement isolation, match handoff passed');
