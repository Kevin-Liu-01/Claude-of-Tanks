// Bounded fresh CPU subprocesses share one runner-owned lease. Real browser
// regressions are barriers: drain CPU children, release, then run alone.

// Gate P5 (2026-10-01): a lease batch older than maxLeaseBatchMs yields (drains, releases and
// re-queues) only while another acquisition waits in the capture queue. With nobody queued the
// batch window restarts in place: the lease is refreshed, never released, so a 150-700 s fleet
// child no longer idles every other worker each 45 s. Fairness is unchanged whenever someone
// waits. A lock without `waiting()` (test doubles, older locks) keeps the draining rule.
export function captureQueueHasWaiters(lock) {
  return typeof lock.waiting !== 'function' || lock.waiting() > 0;
}

export async function runSelftestCpuPool(name, files, options) {
  const { concurrency, runFile, lock, ownedLeaseFiles, exclusiveCpuFiles = [], refreshMs, maxLeaseBatchMs,
    now, log, logError, onTiming, failFast = false, gate = { lookup: () => null, record: () => {} },
    lockTimeoutMs = 45 * 60 * 1000 } = options;
  let held = false, acquiredAt = 0, refresher, next = 0, failure;
  let interruptionSeen = false, renewals = 0, yields = 0;
  const failures = [];
  const keys = new Map();
  const active = new Map();
  // stop admitting new children in fail-fast mode, when the runner itself could not launch a
  // child (a spawn error is infrastructure, not a receipt verdict) or when a child died to a
  // signal (a requested interruption must still end the suite); otherwise every file runs
  const interrupted = (result) => result.error || result.status === null || result.status >= 128;
  const halted = () => interruptionSeen || (failFast && Boolean(failure));
  const release = () => {
    clearInterval(refresher);
    if (!held) return;
    held = false;
    lock.release();
  };
  const launch = (file, index, queueMs) => {
    const started = now();
    return Promise.resolve().then(() => runFile(file)).then(
      result => ({ file, index, result, runMs: now() - started, queueMs }),
      error => ({ file, index, result: { status: null, error }, runMs: now() - started, queueMs }),
    );
  };
  const collect = row => {
    const { file, index, result, runMs, queueMs } = row;
    onTiming({ file, runMs, queueMs, status: result.status ?? null, error: result.error });
    if (result.error || result.status !== 0) {
      // Reporting keeps the earliest failure; interruption must remain sticky
      // even when that earlier row was an ordinary test failure.
      interruptionSeen ||= Boolean(interrupted(result));
      failures.push(row);
      if (!failure || index < failure.index) failure = row;
    } else gate.record(file, keys.get(file), result.status, runMs);
  };
  // True when an expired batch must yield to a queued acquisition; an expired batch nobody
  // waits for is renewed in place (a fresh window and a refreshed lock).
  const batchMustYield = () => {
    if (!held || now() - acquiredAt < maxLeaseBatchMs) return false;
    if (captureQueueHasWaiters(lock)) return true;
    renewals++;
    acquiredAt = now();
    lock.refresh();
    return false;
  };
  const acquireLease = async () => {
    if (batchMustYield()) { yields++; release(); }
    if (held) return 0;
    const queuedAt = now();
    await lock.acquire(lockTimeoutMs);
    const queueMs = now() - queuedAt;
    held = true;
    acquiredAt = now();
    refresher = setInterval(() => lock.refresh(), refreshMs);
    refresher.unref();
    return queueMs;
  };
  const admit = async () => {
    while (!halted() && next < files.length && active.size < concurrency) {
      const file = files[next];
      const cached = gate.lookup(file);
      if (cached?.skip) {
        next++;
        onTiming({ file, runMs: 0, queueMs: 0, status: 0, error: undefined, skipped: true });
        continue;
      }
      if (cached?.key) keys.set(file, cached.key);
      const exclusiveCpu = exclusiveCpuFiles.includes(file);
      if (exclusiveCpu && active.size) break;
      if (ownedLeaseFiles.includes(file)) {
        if (active.size) break;
        release();
        collect(await launch(file, next++, 0));
        continue;
      }
      // A live child always retains its lease. An expired batch with a queued
      // waiter drains before acquiring the next lease through the ordinary FIFO.
      if (active.size && batchMustYield()) break;
      const queueMs = await acquireLease();
      const index = next++;
      active.set(index, launch(file, index, queueMs));
      if (exclusiveCpu) {
        const row = await active.get(index);
        active.delete(index);
        collect(row);
        break;
      }
    }
  };
  process.once('exit', release);
  log(`[selftests] ${name}: ${files.length} files (${concurrency} CPU workers; browser barriers)`);
  try {
    while (next < files.length || active.size) {
      await admit();
      if (active.size) {
        const row = await Promise.race(active.values());
        active.delete(row.index);
        collect(row);
      } else if (halted()) break;
      else if (next >= files.length) break;
    }
    if (failure) {
      // every failed file is named; a spawn error still surfaces as the thrown error
      for (const row of failures.sort((a, b) => a.index - b.index)) {
        if (!row.result.error) logError(`[selftests] FAIL ${row.file}`);
      }
      if (failure.result.error) throw failure.result.error;
      return failure.result.status ?? 1;
    }
    log(`[selftests] PASS ${name}`);
    return 0;
  } finally {
    if (renewals || yields) log(`[selftests] ${name}: lease batches renewed ${renewals}x with no capture queued, yielded ${yields}x to queued captures`);
    // Even an observer/queue exception cannot release ownership while a
    // previously launched child still executes. No new child is admitted.
    await Promise.allSettled(active.values());
    release();
    process.removeListener('exit', release);
  }
}
