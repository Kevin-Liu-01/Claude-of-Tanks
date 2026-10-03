// Visual census lock (2026-10-02): the repository's capture FIFO (tools/capture-lock.mjs — the same queue and lock
// directories, ticket names and head rule) taken together with a caller-named session mutex (an mkdir directory such
// as an agent scratchpad's probe.lock) in the polite order: wait in the FIFO queue WITHOUT the session mutex; at the
// head, take the session mutex when it is free and then wait (at most maxHolderWaitMs) for the current FIFO holder;
// when the session mutex is busy, or the FIFO holder outlasts that wait, give the head away by re-queueing directly
// behind the next live waiter (its stamp + 1 ms) — so neither lock is ever held while waiting out the other's queue.
// tools/visual-census.mjs uses it for `capture --probe-lock=<dir>`; without that flag it takes createCaptureLock().
import { mkdirSync, readdirSync, rmSync, rmdirSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_QUEUE_DIR = '/tmp/cot-shots.queue';
const DEFAULT_LOCK_DIR = '/tmp/cot-shots.lock';
const LOCK_STALE_MS = 5 * 60 * 1000;
const TICKET_STALE_MS = 60 * 60 * 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ticketPid = (name) => { const m = /-(\d+)\.t$/.exec(name); return m ? parseInt(m[1], 10) : -1; };
function pidAlive(pid) {
  if (pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

/**
 * The stamp that re-queues a yielding head directly behind the next live waiter (the first live ticket sorting after
 * `own`, + 1 ms), or null when nobody waits behind it (then it re-queues at the tail, i.e. now).
 */
export function stepBehindStamp(names, own, isLive) {
  for (const name of [...names].sort()) {
    if (name <= own || !isLive(name)) continue;
    const stamp = parseInt(name.slice(0, 15), 10);
    return Number.isFinite(stamp) ? stamp + 1 : null;
  }
  return null;
}

/**
 * A queue ticket name in the shared format (`<15-digit stamp>-<12 digits>-<pid>.t`, which capture-lock.mjs checks).
 * The middle field is the waiter's ARRIVAL (ms modulo 1e12, plus a bump on a clash), not a per-round counter: a head
 * that steps behind the next waiter takes that waiter's stamp + 1, so after a few rotations many waiters share one
 * stamp and the middle field decides. With a round counter there, the longest waiter sorted last among equals every
 * round (2026-10-03: five runs yielded about 240 times while newer tickets passed); with arrival there, it goes first.
 */
export function ticketName(stamp, arrivedMs, pid, bump = 0) {
  return `${String(stamp).padStart(15, '0')}-${String((arrivedMs % 1e12) + bump).padStart(12, '0')}-${pid}.t`;
}

/** A FIFO + session-mutex lock with the capture-lock interface: acquire(timeoutMs), refresh(), release(). */
export function createPoliteCaptureLock({
  probeDir, queueDir = DEFAULT_QUEUE_DIR, lockDir = DEFAULT_LOCK_DIR, maxHolderWaitMs = 8 * 60 * 1000,
  requeuePauseMs = 3000, headPollMs = 1000, log = () => {},
  ticketStaleMs = TICKET_STALE_MS, ticketRefreshMs = Math.max(1, Math.min(30_000, ticketStaleMs / 3)),
}) {
  if (!probeDir) throw new Error('createPoliteCaptureLock needs the session mutex directory');
  let fifoHeld = false, probeHeld = false;
  const arrived = Date.now();
  const stale = (name) => { try { return Date.now() - statSync(join(queueDir, name)).mtimeMs > ticketStaleMs; } catch { return false; } };
  // 2026-10-03: a waiter renews its own ticket and restores it if another waiter reaped it, as capture-lock.mjs does;
  // before, a waiter past the stale age was deleted by the next head() scan and then waited outside the queue.
  const keepTicket = (name) => {
    const path = join(queueDir, name), now = new Date();
    try { utimesSync(path, now, now); } catch (error) {
      if (error.code !== 'ENOENT') return;
      try { writeFileSync(path, String(process.pid), { flag: 'wx' }); } catch { /* raced */ }
    }
  };
  const live = (name) => !stale(name) && pidAlive(ticketPid(name));
  const names = () => { try { return readdirSync(queueDir).filter((n) => n.endsWith('.t')).sort(); } catch { return []; } };
  const reserve = (stamp) => {
    mkdirSync(queueDir, { recursive: true });
    for (let bump = 0; ; bump++) {
      const name = ticketName(stamp, arrived, process.pid, bump);
      try { writeFileSync(join(queueDir, name), String(process.pid), { flag: 'wx' }); return name; }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
  };
  const head = (own) => {
    for (const name of names()) {
      if (name === own) return name;
      if (live(name)) return name;
      try { unlinkSync(join(queueDir, name)); } catch { /* raced */ }
    }
    return own;
  };
  const tryMkdir = (dir) => { try { mkdirSync(dir); return true; } catch { return false; } };
  const reapStaleLock = () => {
    try {
      if (Date.now() - statSync(lockDir).mtimeMs <= LOCK_STALE_MS) return false;
      rmdirSync(lockDir);
      return true;
    } catch (error) { return error.code === 'ENOENT'; }
  };
  const dropProbe = () => { if (probeHeld) { probeHeld = false; try { rmSync(probeDir, { recursive: true, force: true }); } catch { /* gone */ } } };

  async function acquire(timeoutMs = 10 * 60 * 1000) {
    const started = Date.now();
    const late = () => Date.now() - started > timeoutMs;
    let stamp = Date.now();
    for (let round = 1; ; round++) {
      const ticket = reserve(stamp);
      try {
        let keptAt = Date.now();
        while (head(ticket) !== ticket) {
          if (late()) throw new Error('cot-shots lock timeout');
          if (Date.now() - keptAt >= ticketRefreshMs) { keepTicket(ticket); keptAt = Date.now(); }
          await sleep(headPollMs);
        }
        if (tryMkdir(probeDir)) {
          probeHeld = true;
          writeFileSync(join(probeDir, 'pid'), String(process.pid));
          const headSince = Date.now();
          for (;;) {
            if (tryMkdir(lockDir)) { fifoHeld = true; break; }
            if (reapStaleLock()) continue;
            if (Date.now() - headSince > maxHolderWaitMs || late()) break;
            await sleep(300);
          }
          if (fifoHeld) {
            log(`FIFO head and session mutex after ${Math.round((Date.now() - started) / 1000)} s (round ${round})`);
            return;
          }
          dropProbe();
          log(`the FIFO holder outlasted ${Math.round(maxHolderWaitMs / 60000)} min: session mutex handed back, one waiter passes`);
        } else log(`FIFO head but the session mutex is busy (round ${round}): one waiter passes`);
        if (late()) throw new Error('cot-shots lock timeout');
        stamp = stepBehindStamp(names(), ticket, live) ?? Date.now();
      } finally {
        try { unlinkSync(join(queueDir, ticket)); } catch { /* removed */ }
      }
      await sleep(requeuePauseMs);
    }
  }

  return {
    acquire,
    refresh() {
      if (!fifoHeld) return;
      try { const now = new Date(); utimesSync(lockDir, now, now); } catch { /* released */ }
    },
    release() {
      if (fifoHeld) { fifoHeld = false; try { rmdirSync(lockDir); } catch { /* released */ } }
      dropProbe();
    },
    get held() { return fifoHeld && probeHeld; },
  };
}
