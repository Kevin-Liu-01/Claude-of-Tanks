// Two fresh CPU subprocesses share one runner-owned lease. Real browser
// regressions are barriers: drain CPU children, release, then run alone.
export async function runSelftestCpuPool(name, files, options) {
  const { runFile, lock, ownedLeaseFiles, refreshMs, maxLeaseBatchMs,
    now, log, logError, onTiming } = options;
  let held = false, acquiredAt = 0, refresher, next = 0, failure;
  const active = new Map();
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
    if ((result.error || result.status !== 0) && (!failure || index < failure.index)) failure = row;
  };
  const admit = async () => {
    while (!failure && next < files.length && active.size < 2) {
      const file = files[next];
      if (ownedLeaseFiles.includes(file)) {
        if (active.size) break;
        release();
        collect(await launch(file, next++, 0));
        continue;
      }
      if (held && now() - acquiredAt >= maxLeaseBatchMs) {
        // A live child always retains its lease. Stop admission at the
        // deadline, drain this batch, then rejoin the ordinary FIFO.
        if (active.size) break;
        release();
      }
      let queueMs = 0;
      if (!held) {
        const queuedAt = now();
        await lock.acquire(45 * 60 * 1000);
        queueMs = now() - queuedAt;
        held = true;
        acquiredAt = now();
        refresher = setInterval(() => lock.refresh(), refreshMs);
        refresher.unref();
      }
      const index = next++;
      active.set(index, launch(file, index, queueMs));
    }
  };
  process.once('exit', release);
  log(`[selftests] ${name}: ${files.length} files (2 CPU workers; browser barriers)`);
  try {
    while (next < files.length || active.size) {
      await admit();
      if (active.size) {
        const row = await Promise.race(active.values());
        active.delete(row.index);
        collect(row);
      } else if (failure) break;
    }
    if (failure) {
      if (failure.result.error) throw failure.result.error;
      logError(`[selftests] FAIL ${failure.file}`);
      return failure.result.status ?? 1;
    }
    log(`[selftests] PASS ${name}`);
    return 0;
  } finally {
    // Even an observer/queue exception cannot release ownership while a
    // previously launched child still executes. No new child is admitted.
    await Promise.allSettled(active.values());
    release();
    process.removeListener('exit', release);
  }
}
