// The media lane's payback to the normal band (2026-11-02 audit S4): one copy of the rule lab.mjs and site50-finals.mjs
// each carried (they drifted: each comment cites the other's incident, 2026-10-12 two labs passing the lock between them
// for 25 min, 2026-10-13 the finals counting perf holds as yields for over an hour).
// Media leases take back-dated tickets (capture-lock ticketAt at a fixed stamp), so they sort ahead of every normal ticket.
// Between leases a lane pays that back: it waits until `holds` other holds of the NORMAL band have taken the lock. A hold
// is one lock directory (its inode and birth time); it is classed by the ticket that left the queue within three seconds
// of it (its owner's): a ticket back-dated by more than a day is another priority lease (another media lease, perf's
// band), which is passed by and never counts. With the lock free a minute and no normal-band ticket waiting (five minutes
// at most), the lane goes on. `fifo2` (the capture service's own hold count) replaces the lock-directory count when given.
import { readdirSync, statSync } from 'node:fs';
import { CAPTURE_LOCK_DIR, CAPTURE_QUEUE_DIR } from '../capture-lock.mjs';

/** A ticket stamped back by more than this is a priority-band ticket. */
export const PRIORITY_AGE_MS = 24 * 3600 * 1000;

/** The hold at `lockDir` now (`<inode>:<birth ms>`), or null while the lock is free. */
export function holdIdAt(lockDir = CAPTURE_LOCK_DIR) {
  try { const s = statSync(lockDir); return `${s.ino}:${s.birthtimeMs}`; } catch { return null; }
}

/** The queue's ready tickets and their stamps (a ticket's name starts with its 15-digit stamp). */
export function queueTicketStamps(queueDir = CAPTURE_QUEUE_DIR) {
  try { return new Map(readdirSync(queueDir).filter((n) => n.endsWith('.t')).map((n) => [n, Number(n.slice(0, 15))])); } catch { return new Map(); }
}

/**
 * Classes the holds a waiter sees by the ticket that left the queue with each. `observe({ holdId, tickets, t })` takes one
 * look (the hold now, the queue now, the time) and returns the holds it classed on that look ([{ hold, priority }]).
 * `tickets` (a Map of name to stamp) is the queue when the watch starts.
 */
export function createHoldClassifier({ tickets = new Map(), priorityAgeMs = PRIORITY_AGE_MS, ownerWindowMs = 3000, leftWindowMs = 5000 } = {}) {
  const seen = new Set(), skipped = new Set(), pending = new Map();
  let last = tickets, left = [];
  return {
    observe({ holdId, tickets: now, t }) {
      // the tickets that left the queue in the last five seconds ([stamp, when]); a new hold is classed by the ticket that
      // left within three seconds of it, waiting up to three seconds for that ticket to go
      for (const [name, stamp] of last) if (!now.has(name)) left.push([stamp, t]);
      left = left.filter(([, at]) => t - at < leftWindowMs);
      last = now;
      if (holdId && !seen.has(holdId) && !skipped.has(holdId) && !pending.has(holdId)) pending.set(holdId, t);
      const classed = [];
      for (const [hold, first] of pending) {
        const owners = left.filter(([, at]) => Math.abs(at - first) < ownerWindowMs);
        if (!owners.length && t - first < ownerWindowMs) continue;
        const priority = owners.length > 0 && owners.every(([stamp]) => stamp < t - priorityAgeMs);
        (priority ? skipped : seen).add(hold);
        pending.delete(hold);
        classed.push({ hold, priority });
      }
      return classed;
    },
    get normal() { return seen.size; },
    get priority() { return skipped.size; },
  };
}

/**
 * Wait until `holds` normal-band holds have taken the lock (see above). `fifo2()` reads the capture service's hold count
 * (null when unreadable) and `fifo2Base` is its count when this lane's last lease ended (null: the first look). Resolves
 * { normal, priority, served, fifo2Base, waitedMs, stopped }.
 */
export async function yieldToNormalHolds({ holds, lockDir = CAPTURE_LOCK_DIR, queueDir = CAPTURE_QUEUE_DIR, fifo2 = null, fifo2Base = null,
  stopped = () => false, onPriority = () => {}, now = Date.now, sleep = (ms) => new Promise((done) => setTimeout(done, ms)), pollMs = 200,
  readHold = () => holdIdAt(lockDir), readTickets = () => queueTicketStamps(queueDir), priorityAgeMs = PRIORITY_AGE_MS,
  freeGoMs = 60_000, freeMaxMs = 300_000, fifo2EveryMs = 5000 }) {
  const began = now();
  const classifier = createHoldClassifier({ tickets: readTickets(), priorityAgeMs });
  let freeSince = began, served = 0, readAt = -Infinity, base = fifo2Base;
  const result = (extra = {}) => ({ normal: classifier.normal, priority: classifier.priority, served, fifo2Base: base, waitedMs: now() - began, stopped: false, ...extra });
  for (;;) {
    if (stopped()) return result({ stopped: true });
    const id = readHold(), tickets = readTickets(), t = now();
    for (const { priority } of classifier.observe({ holdId: id, tickets, t })) if (priority) onPriority();
    if (id) freeSince = t;
    if (fifo2 && t - readAt > fifo2EveryMs) {
      readAt = t;
      const count = fifo2();
      // (a relaunch counts from its first look; a restarted service counts from zero again)
      if (count != null && (base == null || count < base)) base = count;
      served = count != null ? count - base : 0;
    }
    if ((fifo2 ? served : classifier.normal) >= holds) return result();
    // with the lock free a minute and no normal-band ticket waiting (five minutes at most), the lane goes on
    const free = id ? 0 : t - freeSince;
    const normalWaiting = [...tickets.values()].some((at) => at >= t - priorityAgeMs);
    if ((free > freeGoMs && !normalWaiting) || free > freeMaxMs) return result();
    await sleep(pollMs);
  }
}
