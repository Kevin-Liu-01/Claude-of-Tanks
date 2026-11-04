// Process lifecycle for long chains and budgeted tools (2026-11-02 audit S5): one owner per chain lock, children in their
// own process groups that a stop reaches and a sweep ends, and a budget that tears down before it exits.
//
// - takeChainLock: the changed-only regen chain's "one chain per tree" lock was check-then-write (existsSync, read the
//   pid, kill -0, then a plain writeFileSync), so two chains launched together could both pass and the later writer owned
//   the file while the first ran unlocked against the same tables. The lock is now an owned lock directory
//   (capture-lock.mjs claimOwnedLock: mkdir is the atomic claim, an owner token with the pid and its start time inside),
//   so exactly one claim wins; a dead owner's lock (its pid gone, or reused by another process) is reaped, never a live one.
// - createChildGroups + stopOnSignal: SIGINT/SIGTERM only unlocked and exited, while the step children (not detached,
//   never signalled) kept writing generated tables, with the lock already free for a second chain; process.exit also
//   skipped the GPU step's capture-lock release. Children now lead their own process groups (as tools/run-selftests.mjs
//   does since the 17.5-hour burners): a stop signals every group, waits for them to close (bounded), SIGKILLs whatever is
//   left, then runs the caller's cleanup (release the capture holds, unlock) and exits 128 + the signal's number. Each
//   group is also swept once its leader closes, and at exit.
// - armBudget: a budget timer that called process.exit skipped every finally, leaving a spawned server, a browser and
//   the capture lock to the OS. It now runs the tool's teardown (bounded) and then exits with the budget's code.
import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { readFileSync } from 'node:fs';
import { claimOwnedLock, reapDeadLock, releaseOwnedLock } from './capture-lock.mjs';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function pidAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

/** Who holds the owned lock directory at `dir` (its owner token), or null. */
export function chainLockOwner(dir) {
  try {
    const token = JSON.parse(readFileSync(`${dir}/owner.json`, 'utf8'));
    return Number.isSafeInteger(token?.pid) ? token : null;
  } catch {
    return null;
  }
}

/**
 * Take the chain lock at `dir` (an owned lock directory). A dead owner's lock is reaped first; a live one's never is.
 * `legacyFile`: an older chain's pid file at the old path, honoured while its pid lives. Returns { held: true, release() }
 * or { held: false, owner } (the live owner's token, or { pid } of a legacy file).
 */
export function takeChainLock(dir, { legacyFile = null, log = () => {} } = {}) {
  if (legacyFile) {
    let pid = NaN;
    try { pid = Number(readFileSync(legacyFile, 'utf8').trim()); } catch { /* none */ }
    if (pidAlive(pid) && pid !== process.pid) return { held: false, owner: { pid, legacy: true } };
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const hold = claimOwnedLock(dir);
    if (hold) {
      let released = false;
      return { held: true, hold, release: () => { if (released) return false; released = true; return releaseOwnedLock(hold, { log }); } };
    }
    // taken: reap it only when its owner is dead (the owner-token rules), then claim once more
    if (!reapDeadLock(dir, { log, lockStaleMs: 60_000, orphanStaleMs: 10 * 60_000 })) break;
  }
  return { held: false, owner: chainLockOwner(dir) ?? { pid: null } };
}

/**
 * Children that lead their own process groups. `spawn` is child_process.spawn with `detached: true` (a terminal's ^C no
 * longer reaches them directly: stopOnSignal forwards it); each group is swept (SIGKILL) once its leader closes, so a
 * grandchild left behind cannot keep writing. `signal(name)` reaches every live group, `sweep()` SIGKILLs them all,
 * `drain(ms)` waits for every leader to close (at most `ms`).
 */
export function createChildGroups({ killGroup = (pid, signal) => process.kill(-pid, signal), spawnProcess = spawn } = {}) {
  const live = new Map();
  const send = (pid, signal) => { try { killGroup(pid, signal); return true; } catch { return false; } };
  const groups = {
    spawn(command, args, options = {}) {
      const child = spawnProcess(command, args, { ...options, detached: true });
      if (child.pid) {
        live.set(child.pid, child);
        child.once('close', () => { send(child.pid, 'SIGKILL'); live.delete(child.pid); });
      }
      return child;
    },
    signal(signal) { for (const pid of live.keys()) send(pid, signal); },
    sweep() { for (const pid of [...live.keys()]) send(pid, 'SIGKILL'); },
    async drain(ms) {
      const until = Date.now() + ms;
      while (live.size && Date.now() < until) await sleep(50);
      return live.size === 0;
    },
    get size() { return live.size; },
    get pids() { return [...live.keys()]; },
  };
  return groups;
}

/**
 * A stop signal (SIGINT, SIGTERM, SIGHUP) ends the chain cleanly: every child group gets it (SIGINT stays SIGINT, the
 * rest SIGTERM), the chain waits up to `graceMs` for them to close, SIGKILLs what is left, runs `cleanup(signal)` (release
 * the capture holds, unlock: nothing of the chain writes any more) and exits 128 + the signal's number. A second signal
 * while stopping SIGKILLs the groups at once. Process exit sweeps every group too. Returns a function that removes the
 * handlers.
 */
export function stopOnSignal(groups, { cleanup = () => {}, graceMs = 15_000, log = () => {}, exit = (code) => process.exit(code),
  signals = process } = {}) {
  let stopping = false;
  const handler = (signal) => {
    if (stopping) { groups.sweep(); return; }
    stopping = true;
    log(`${signal}: stopping ${groups.size} child group(s) (${groups.pids.join(', ') || 'none'})`);
    groups.signal(signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM');
    void groups.drain(graceMs).then((drained) => {
      if (!drained) log(`${groups.size} child group(s) still running after ${Math.round(graceMs / 1000)} s: SIGKILL`);
      groups.sweep();
      try { cleanup(signal); } catch (error) { log(`cleanup failed: ${error?.message ?? error}`); }
      exit(128 + (constants.signals[signal] ?? 15));
    });
  };
  const names = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const name of names) signals.on(name, handler);
  const atExit = () => groups.sweep();
  signals.on('exit', atExit);
  return () => {
    for (const name of names) signals.removeListener(name, handler);
    signals.removeListener('exit', atExit);
  };
}

/** `fn` run at most once; every later call returns the first call's promise. */
export function once(fn) {
  let result = null;
  return (...args) => (result ??= Promise.resolve().then(() => fn(...args)));
}

/**
 * A budget that tears down before it exits: past `ms`, `teardown()` runs (bounded by `graceMs`: a hung close cannot keep
 * the tool alive) and the process exits with `code`. The timer does not hold the process open. Returns { cancel() }.
 */
export function armBudget(ms, { teardown, code = 3, graceMs = 20_000, log = () => {}, exit = (status) => process.exit(status) }) {
  const timer = setTimeout(() => {
    log(`past its ${Math.round(ms / 60_000 * 10) / 10} min budget: tearing down, then exit ${code}`);
    const bounded = sleep(graceMs).then(() => log(`teardown still running after ${Math.round(graceMs / 1000)} s: exiting anyway`));
    void Promise.race([Promise.resolve().then(teardown).catch((error) => log(`teardown failed: ${error?.message ?? error}`)), bounded])
      .finally(() => exit(code));
  }, ms);
  timer.unref();
  return { cancel: () => clearTimeout(timer) };
}
