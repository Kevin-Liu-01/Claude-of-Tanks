#!/usr/bin/env node
// Shared FIFO lock for GPU/browser capture harnesses. Keeping one owner avoids
// copy drift between screenshot, audio, Studio, and marketing verification.

import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const DEFAULT_LOCK_DIR = '/tmp/cot-shots.lock';
const DEFAULT_QUEUE_DIR = '/tmp/cot-shots.queue';
/** The machine-wide queue directory (read-only use: who is waiting). */
export const CAPTURE_QUEUE_DIR = DEFAULT_QUEUE_DIR;
/** The machine-wide lock directory (read-only use: whose hold is on, one directory per hold). */
export const CAPTURE_LOCK_DIR = DEFAULT_LOCK_DIR;
const DEFAULT_LOCK_STALE_MS = 5 * 60 * 1000;
const DEFAULT_TICKET_STALE_MS = 60 * 60 * 1000;

function ticketPid(name) {
  const match = name.match(/-(\d+)\.t$/);
  return match ? parseInt(match[1], 10) : -1;
}

function ticketAlive(name) {
  return pidAlive(ticketPid(name));
}

function readQueue(queueDir, ownTicket) {
  try {
    return readdirSync(queueDir).filter((name) => name.endsWith('.t')).sort();
  } catch {
    return [ownTicket];
  }
}

function ticketStale(queueDir, name, staleMs) {
  try {
    return Date.now() - statSync(join(queueDir, name)).mtimeMs > staleMs;
  } catch {
    return false;
  }
}

function queueHead(queueDir, names, ownTicket, staleMs) {
  for (const name of names) {
    if (name === ownTicket) return name;
    if (!ticketStale(queueDir, name, staleMs) && ticketAlive(name)) return name;
    try { unlinkSync(join(queueDir, name)); } catch { /* raced */ }
  }
  return ownTicket;
}

// ---- owned locks (2026-10-21, item 233) -------------------------------------------------------------------------------
// The lock was a bare directory: release() and refresh() acted on whatever directory sat at the path, and stale recovery
// removed any directory whose mtime was 5 min old. On 2026-10-21 hold A's directory was removed under it, B took the free
// path, A failed and its release() removed B's directory, and C took the lock while B ran: three overlapping GPU captures,
// all voided. Every hold now writes an owner token (OWNER_FILE) into the directory it created:
// - refresh() and release() act only while the directory at the path is the one they created (its dev:inode) and holds
//   their own token (its nonce); otherwise they log the refusal, leave the path untouched and return false;
// - stale recovery removes a lock only when its owner is dead: its pid is gone, or (once the directory has gone a
//   lockStaleMs without a refresh) that pid names another process now (a reused pid: a different start time). A late
//   refresh from a live owner never frees its lock. A directory without a readable token (an older copy of this module,
//   or a claim that died before writing its token) is removed only when it is empty and orphanStaleMs old;
// - release renames the directory away (one atomic step) and then clears it, so a *.holder file left inside cannot wedge
//   the lock, and a reaper re-checks under a short mutex (REAP_MUTEX_SUFFIX) before renaming a dead owner's directory.
// The token makes the directory non-empty, so an older copy's rmdir-based release or stale reap can no longer remove a
// new-style hold either. Ticket names, the FIFO head rule and the *.holder convention are unchanged.

/** The owner token inside a held lock directory. Never a *.holder name: lane 2 reads those as lane-1 timing blocks. */
const OWNER_FILE = 'owner.json';
const OWNER_FORMAT = 'cot-capture-lock-owner/1';
/** A sibling directory that serialises reapers; their critical section is a few syscalls. */
const REAP_MUTEX_SUFFIX = '.reap';
const REAP_MUTEX_STALE_MS = 30_000;
/** How long a waiter trusts one reading of a stale-looking owner's process identity (one `ps` per owner and waiter). */
const IDENTITY_CACHE_MS = 30_000;

const stderrLog = (message) => { try { process.stderr.write(`${message}\n`); } catch { /* stderr closed */ } };

function pidAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** A process's state and kernel start time from ps (fixed locale and zone, so every reader prints the same text), or
 *  null when ps names no such process or cannot run. */
function processIdentity(pid) {
  let out;
  try {
    out = execFileSync('ps', ['-o', 'state=,lstart=', '-p', String(pid)], {
      encoding: 'utf8', env: { PATH: '/bin:/usr/bin', TZ: 'UTC', LC_ALL: 'C' }, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5_000,
    });
  } catch {
    return null;
  }
  const match = out.trim().match(/^(\S+)\s+(.+)$/);
  return match ? { state: match[1], start: match[2].replace(/\s+/g, ' ') } : null;
}
let ownStart;
const ownProcessStart = () => {
  if (ownStart === undefined) ownStart = processIdentity(process.pid)?.start ?? null;
  return ownStart;
};

/** The dev:inode, kind and mtime of `path` itself (a symlink is not followed). Throws as lstat does. */
function pathId(path) {
  const st = lstatSync(path, { bigint: true });
  return { id: `${st.dev}:${st.ino}`, isDir: st.isDirectory(), mtimeMs: Number(st.mtimeMs) };
}
function sameDir(path, id) {
  try { return pathId(path).id === id; } catch { return false; }
}

function readOwner(lockDir) {
  let text;
  try {
    text = readFileSync(join(lockDir, OWNER_FILE), 'utf8');
  } catch (error) {
    return { state: error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 'missing' : 'error', code: error.code };
  }
  try {
    const token = JSON.parse(text);
    if (token && Number.isSafeInteger(token.pid) && token.pid > 0 && typeof token.nonce === 'string' && token.nonce) return { state: 'ok', token };
  } catch { /* a torn or foreign file */ }
  return { state: 'corrupt' };
}
const describeToken = (token) => `pid ${token.pid}, ticket ${token.ticket ?? 'none'}, since ${token.startedAt ?? '?'}`;

/** Whether `hold` still owns its path: 'ok', 'lost' (another directory, or no longer its token) or 'unknown' (an I/O
 *  error, so nothing is decided). */
function holdState(hold) {
  let at;
  try {
    at = pathId(hold.lockDir);
  } catch (error) {
    return error.code === 'ENOENT' ? { state: 'lost', why: `${hold.lockDir} is gone` } : { state: 'unknown', why: `${hold.lockDir}: ${error.code}` };
  }
  const owner = at.isDir ? readOwner(hold.lockDir) : { state: 'missing' };
  if (owner.state === 'error') return { state: 'unknown', why: `${hold.lockDir}/${OWNER_FILE}: ${owner.code}` };
  const now = !at.isDir ? 'a file' : owner.state === 'ok' ? `held by ${describeToken(owner.token)}`
    : 'a directory without an owner token (an older copy of the lock)';
  if (!at.isDir || at.id !== hold.id) return { state: 'lost', why: `${hold.lockDir} is another directory now, ${now}` };
  if (owner.state !== 'ok' || owner.token.nonce !== hold.nonce) return { state: 'lost', why: `${hold.lockDir} is ${now}` };
  return { state: 'ok' };
}
const holdName = (hold) => `pid ${hold.pid}, ticket ${hold.ticket ?? 'none'}`;

/** Remove this hold's token from whatever directory now sits at its path, if the token there is still its own. */
function dropOwnToken(hold) {
  const owner = readOwner(hold.lockDir);
  if (owner.state === 'ok' && owner.token.nonce === hold.nonce) {
    try { unlinkSync(join(hold.lockDir, OWNER_FILE)); } catch { /* gone */ }
  }
}

/** Clear a directory that is no longer the lock (released or reaped): its files, then itself. */
function clearTomb(tomb, log) {
  try {
    for (const name of readdirSync(tomb)) {
      try { unlinkSync(join(tomb, name)); } catch { /* a subdirectory: left, and so is the tomb */ }
    }
    rmdirSync(tomb);
  } catch (error) {
    log(`[capture-lock] left ${tomb} behind (${error.code ?? error.message}); it is no longer the lock`);
  }
}

/** Rename `lockDir` (expected to be `id`) to `tomb`. When the directory moved was another one (the path changed hands
 *  between the check and the rename), put it back while the path is free and report false. */
function renameAway(lockDir, id, tomb, log) {
  try {
    renameSync(lockDir, tomb);
  } catch (error) {
    if (error.code !== 'ENOENT') log(`[capture-lock] could not move ${lockDir} aside (${error.code}); it is left in place`);
    return false;
  }
  if (sameDir(tomb, id)) return true;
  let back = false;
  try {
    lstatSync(lockDir);
  } catch (error) {
    if (error.code === 'ENOENT') {
      try { renameSync(tomb, lockDir); back = true; } catch { /* the path was taken meanwhile */ }
    }
  }
  log(`[capture-lock] ${lockDir} changed hands while it was moved aside: ${back ? 'put back' : `left at ${tomb}`}`);
  return false;
}

/**
 * Take `lockDir` with an owner token: mkdir (the atomic claim), then the token, written exclusively and read back
 * against the directory's dev:inode. Returns the hold, or null when the path is taken (or changed hands mid-claim).
 * `ticket` is the queue ticket the hold was served at (its stamp is recorded too). Throws only when the token cannot be
 * written into a directory this call created (a full disk); that directory is removed first.
 */
export function claimOwnedLock(lockDir, { ticket = null } = {}) {
  try {
    mkdirSync(lockDir);
  } catch {
    return null;
  }
  let id;
  try { id = pathId(lockDir).id; } catch { return null; }
  const nonce = randomBytes(12).toString('hex');
  const token = {
    format: OWNER_FORMAT, pid: process.pid, nonce, id, ticket,
    stamp: typeof ticket === 'string' && /^\d{15}-/.test(ticket) ? Number(ticket.slice(0, 15)) : null,
    startedAt: new Date().toISOString(), procStart: ownProcessStart(), command: process.argv.slice(1).join(' ').slice(0, 300),
  };
  try {
    writeFileSync(join(lockDir, OWNER_FILE), `${JSON.stringify(token)}\n`, { flag: 'wx' });
  } catch (error) {
    if (['ENOENT', 'EEXIST', 'ENOTDIR'].includes(error.code)) return null; // the path changed hands before the token
    try { if (sameDir(lockDir, id)) rmdirSync(lockDir); } catch { /* not empty, or gone */ }
    throw new Error(`cot-shots lock: cannot write the owner token in ${lockDir} (${error.code ?? error.message})`);
  }
  const hold = { lockDir, id, nonce, pid: process.pid, ticket, token, lostNoted: false };
  if (holdState(hold).state !== 'ok') {
    dropOwnToken(hold);
    return null;
  }
  return hold;
}

/** Renew `hold`'s directory mtime while it still owns the path. A lost hold logs once and touches nothing. */
export function refreshOwnedLock(hold, { log = stderrLog } = {}) {
  if (!hold) return false;
  const check = holdState(hold);
  if (check.state !== 'ok') {
    if (check.state === 'lost' && !hold.lostNoted) {
      hold.lostNoted = true;
      log(`[capture-lock] refresh refused (${holdName(hold)}): ${check.why}. This hold no longer owns the lock and leaves it untouched.`);
    }
    return false;
  }
  try {
    const now = new Date();
    utimesSync(hold.lockDir, now, now);
    return true;
  } catch {
    return false;
  }
}

/** Release `hold`: only while it still owns the path (otherwise log, leave it, false). The directory is renamed away
 *  in one step and then cleared with whatever *.holder files were left in it. */
export function releaseOwnedLock(hold, { log = stderrLog } = {}) {
  if (!hold) return false;
  const check = holdState(hold);
  if (check.state !== 'ok') {
    log(check.state === 'lost'
      ? `[capture-lock] release refused (${holdName(hold)}): ${check.why}. This hold no longer owns the lock, so it is left untouched.`
      : `[capture-lock] release could not check its hold (${holdName(hold)}: ${check.why}); the lock is left in place and is reaped once this process exits.`);
    return false;
  }
  const tomb = `${hold.lockDir}.released-${hold.pid}-${hold.nonce}`;
  if (!renameAway(hold.lockDir, hold.id, tomb, log)) return false;
  clearTomb(tomb, log);
  return true;
}

/** Holder files (`*.holder`) in `dir` whose text names a live pid other than `except` (a timing block still running). */
function liveHolderFiles(dir, except) {
  let names;
  try { names = readdirSync(dir); } catch { return []; }
  return names.filter((name) => {
    if (!/\.holder$/i.test(name)) return false;
    let text = '';
    try { text = readFileSync(join(dir, name), 'utf8'); } catch { return false; }
    const match = text.match(/\bpid\s+(\d+)/i) ?? text.match(/^\s*(\d+)\s*$/);
    const pid = match ? parseInt(match[1], 10) : -1;
    return pid !== except && pidAlive(pid);
  });
}

const identityCache = new Map();
/** Whether a token's owner lives: its pid exists and, once its lock has gone `lockStaleMs` without a refresh, that pid
 *  is still the same process (the kernel start time it recorded) and not a zombie. */
function ownerLiveness(token, lockAgeMs, lockStaleMs) {
  if (!pidAlive(token.pid)) return { alive: false, why: `its owner pid ${token.pid} is dead` };
  if (lockAgeMs <= lockStaleMs || typeof token.procStart !== 'string') return { alive: true };
  let seen = identityCache.get(token.nonce);
  if (!seen || Date.now() - seen.at > IDENTITY_CACHE_MS) {
    if (identityCache.size > 256) identityCache.clear();
    seen = { at: Date.now(), identity: processIdentity(token.pid) };
    identityCache.set(token.nonce, seen);
  }
  const { identity } = seen;
  if (!identity) return pidAlive(token.pid) ? { alive: true } : { alive: false, why: `its owner pid ${token.pid} is dead` };
  if (identity.start !== token.procStart) return { alive: false, why: `its owner pid ${token.pid} now names another process (started ${identity.start}; the owner started ${token.procStart})` };
  if (/^Z/.test(identity.state)) return { alive: false, why: `its owner pid ${token.pid} has exited (a zombie)` };
  return { alive: true };
}

/** What sits at `lockDir`: absent, live (keep), dead (a dead owner's token), orphan (no token, old and empty) or keep. */
function inspectLock(lockDir, { lockStaleMs, orphanStaleMs }) {
  let at;
  try {
    at = pathId(lockDir);
  } catch (error) {
    return error.code === 'ENOENT' ? { verdict: 'absent' } : { verdict: 'keep', id: null };
  }
  const ageMs = Date.now() - at.mtimeMs;
  if (!at.isDir) return { verdict: ageMs > orphanStaleMs ? 'orphan' : 'keep', id: at.id, file: true, ageMs };
  const owner = readOwner(lockDir);
  if (owner.state === 'error') return { verdict: 'keep', id: at.id, ageMs };
  if (owner.state === 'ok' && owner.token.id === at.id) {
    const liveness = ownerLiveness(owner.token, ageMs, lockStaleMs);
    if (liveness.alive) return { verdict: 'live', id: at.id, token: owner.token, ageMs };
    const blockers = liveHolderFiles(lockDir, owner.token.pid);
    if (blockers.length) return { verdict: 'keep', id: at.id, ageMs, why: `its owner is dead but ${blockers.join(', ')} names a live pid` };
    return { verdict: 'dead', id: at.id, token: owner.token, ageMs, why: liveness.why };
  }
  // No readable token of this directory: a hold of an older copy of the lock (it refreshes the mtime), or a claim that
  // died before its token. Only past the long orphan age, and only with nothing else inside (a *.holder timing block).
  if (ageMs <= orphanStaleMs) return { verdict: 'keep', id: at.id, ageMs };
  let names;
  try { names = readdirSync(lockDir); } catch { return { verdict: 'keep', id: at.id, ageMs }; }
  const others = names.filter((name) => name !== OWNER_FILE);
  if (others.length) return { verdict: 'keep', id: at.id, ageMs, why: `it has no owner token and holds ${others.slice(0, 3).join(', ')}` };
  return { verdict: 'orphan', id: at.id, ageMs, tokenFile: names.length > 0 };
}

function withReapMutex(lockDir, work) {
  const mutex = `${lockDir}${REAP_MUTEX_SUFFIX}`;
  try {
    mkdirSync(mutex);
  } catch (error) {
    if (error.code === 'EEXIST') {
      try { if (Date.now() - statSync(mutex).mtimeMs > REAP_MUTEX_STALE_MS) rmdirSync(mutex); } catch { /* raced */ }
    }
    return false;
  }
  try {
    return work();
  } finally {
    try { rmdirSync(mutex); } catch { /* raced */ }
  }
}

const noted = new Set();
function noteOnce(key, message, log) {
  if (noted.has(key)) return;
  if (noted.size > 256) noted.clear();
  noted.add(key);
  log(message);
}

/**
 * Stale recovery: remove the lock at `lockDir` only when its owner is dead (see ownerLiveness) or, without a readable
 * token, when it is empty and `orphanStaleMs` old. Re-checks under the reaper mutex before it acts. Returns true when
 * the path is free afterwards (removed here or already gone), so a head can claim at once. `note` logs (once per hold)
 * why a lock that looks stale is kept.
 */
export function reapDeadLock(lockDir, { lockStaleMs = DEFAULT_LOCK_STALE_MS, orphanStaleMs = 4 * lockStaleMs, log = stderrLog, note = false } = {}) {
  const options = { lockStaleMs, orphanStaleMs };
  const first = inspectLock(lockDir, options);
  if (first.verdict === 'absent') return true;
  if (first.verdict !== 'dead' && first.verdict !== 'orphan') {
    if (note && first.ageMs > lockStaleMs) {
      if (first.verdict === 'live') {
        noteOnce(first.token.nonce, `[capture-lock] ${lockDir} is held by live ${describeToken(first.token)}, with no refresh for ` +
          `${Math.round(first.ageMs / 60_000)} min: waiting (a live owner's lock is never reaped; stop that process to free it)`, log);
      } else if (first.why) {
        noteOnce(`${first.id}:${first.why}`, `[capture-lock] ${lockDir} is not reaped: ${first.why}`, log);
      }
    }
    return false;
  }
  const result = withReapMutex(lockDir, () => {
    const again = inspectLock(lockDir, options);
    if (again.verdict === 'absent') return true;
    if (again.verdict !== first.verdict || again.id !== first.id) return false;
    if (again.file) {
      try { unlinkSync(lockDir); } catch { return false; }
      log(`[capture-lock] removed ${lockDir}: a file, not a lock directory, ${Math.round(again.ageMs / 60_000)} min old`);
      return true;
    }
    if (again.verdict === 'orphan' && !again.tokenFile) {
      try { rmdirSync(lockDir); } catch { return false; } // fails if a claim wrote its token meanwhile
      log(`[capture-lock] reaped ${lockDir}: no owner token and no refresh for ${Math.round(again.ageMs / 60_000)} min`);
      return true;
    }
    const tomb = `${lockDir}.reaped-${process.pid}-${randomBytes(6).toString('hex')}`;
    if (!renameAway(lockDir, again.id, tomb, log)) return false;
    log(again.verdict === 'dead'
      ? `[capture-lock] reaped ${lockDir} of ${describeToken(again.token)}: ${again.why}`
      : `[capture-lock] reaped ${lockDir}: an unreadable owner token and no refresh for ${Math.round(again.ageMs / 60_000)} min`);
    clearTomb(tomb, log);
    return true;
  });
  return result === true;
}

/** Renew a waiting ticket; restore it under the same name (so the same place) when a process on an older copy of
 *  this module reaped it while we were still waiting. */
function keepTicket(path) {
  const now = new Date();
  try {
    utimesSync(path, now, now);
  } catch (error) {
    if (error.code !== 'ENOENT') return;
    try { writeFileSync(path, String(process.pid), { flag: 'wx' }); } catch { /* raced */ }
  }
}

// Distinguish acquisitions launched by concurrent workers in one process.
// Keep the PID last for legacy ticket liveness checks and use exclusive creation.
let nextTicketSequence = 0;
function reserveTicket(queueDir) {
  for (;;) {
    const sequence = String(nextTicketSequence++).padStart(12, '0');
    const name = `${String(Date.now()).padStart(15, '0')}-${sequence}-${process.pid}.t`;
    try {
      writeFileSync(join(queueDir, name), String(process.pid), { flag: 'wx' });
      return name;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
}

/** Re-enter the queue under a ticket this process was issued before (its place); a present copy is kept. */
function restoreTicket(queueDir, name) {
  if (!/^\d{15}-\d{12}-\d+\.t$/.test(name) || ticketPid(name) !== process.pid) throw new Error(`not this process's ticket: ${name}`);
  try { writeFileSync(join(queueDir, name), String(process.pid), { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  return name;
}

/** This process's ticket at `stamp` (ms since the epoch), for acquire's `ticket` (2026-10-07): a run split over several
 *  processes (a chain's leases, one process each) rejoins the queue at its first ticket's place. The PID is this
 *  process's, so every copy of this module reads the ticket's liveness as usual. */
export function ticketAt(stamp) {
  if (!Number.isSafeInteger(stamp) || stamp <= 0 || stamp >= 1e15) throw new Error(`not a ticket stamp: ${stamp}`);
  return `${String(stamp).padStart(15, '0')}-${'0'.repeat(12)}-${process.pid}.t`;
}

/** Where a back-dated (place-keeping) lease rejoins the queue (2026-10-13, the coordinator: the media lane's finals
 *  re-joined at their pre-band stamp ahead of a perf cost hold waiting in the band, so perf waited behind every media
 *  lease): behind the waiting band tickets whose process `owner` names (its command line matching `pattern`), one past
 *  the last of them, else at `stamp`. A band ticket is back-dated by more than `bandAgeMs`; normal tickets (stamped as
 *  they join) never move the stamp. `commandOf(pid)` reads a process's command line (ps by default). */
export function stampBehindWaiting(stamp, { pattern = /perf/i, queueDir = DEFAULT_QUEUE_DIR, bandAgeMs = 24 * 3600 * 1000,
  now = Date.now(), commandOf = (pid) => execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }) } = {}) {
  let names = [];
  try { names = readdirSync(queueDir).filter((n) => /^\d{15}-\d{12}-\d+\.t$/.test(n)); } catch { return stamp; }
  let behind = stamp;
  for (const name of names) {
    const at = Number(name.slice(0, 15)), pid = ticketPid(name);
    if (pid === process.pid || at >= now - bandAgeMs || at < stamp) continue;
    let command = '';
    try { command = commandOf(pid); } catch { continue; }
    if (pattern.test(command)) behind = Math.max(behind, at + 1);
  }
  return behind;
}

/**
 * The FIFO capture lock. `lockStaleMs`: a lock this long without a refresh gets its owner's process identity checked (a
 * reused pid is a dead owner); a live owner's lock is never reaped however late its refresh. `orphanStaleMs`: the age
 * at which an empty lock directory without an owner token (an older copy's hold, or a claim that died before its token)
 * is reaped. `log` takes the refusal and reaping lines (stderr by default). acquire() resolves once this instance owns the
 * lock; refresh() and release() return true when they acted on this instance's own hold, false (and touch nothing) when
 * it holds nothing or the lock at the path is no longer its own (logged).
 */
export function createCaptureLock({
  lockDir = DEFAULT_LOCK_DIR,
  queueDir = DEFAULT_QUEUE_DIR,
  lockStaleMs = DEFAULT_LOCK_STALE_MS,
  ticketStaleMs = DEFAULT_TICKET_STALE_MS,
  ticketRefreshMs = Math.max(1, Math.min(30_000, ticketStaleMs / 3)),
  orphanStaleMs = 4 * lockStaleMs,
  log = stderrLog,
} = {}) {
  let hold = null;
  let lastTicket = null;

  /**
   * Wait for the FIFO head, then take the lock. `ticket` (2026-10-02): re-enter under a ticket this process was issued
   * by an earlier acquire (\`lastTicket\`) — its original place — for a caller that gave its turn back because a lock
   * of its own was held by someone queued behind it, and re-enters once that holder is done.
   */
  async function acquire(timeoutMs = 10 * 60 * 1000, { ticket = null } = {}) {
    // A landing chain exports COT_SHOTS_LOCK_TIMEOUT_MS (three hours) so every waiter it spawns — the suite runner and
    // the browser receipts that take the lock themselves — outlasts other sessions' captures (2026-09-25: a probe receipt
    // died at its own 45-minute wait while the runner would have waited three hours).
    const chainWait = Number(process.env.COT_SHOTS_LOCK_TIMEOUT_MS);
    if (Number.isFinite(chainWait) && chainWait > timeoutMs) timeoutMs = chainWait;
    mkdirSync(queueDir, { recursive: true });
    const ownTicket = ticket ? restoreTicket(queueDir, ticket) : reserveTicket(queueDir);
    lastTicket = ownTicket;
    const ownPath = join(queueDir, ownTicket);
    const startedAt = Date.now();
    // A legitimate capture ahead of us can outlast ticketStaleMs. Keep our waiting ticket alive without changing its
    // filename or FIFO position, and restore it if an older copy of this module reaped it anyway.
    const ticketHeartbeat = setInterval(() => keepTicket(ownPath), ticketRefreshMs);
    ticketHeartbeat.unref();
    try {
      for (;;) {
        const head = queueHead(queueDir, readQueue(queueDir, ownTicket), ownTicket, ticketStaleMs);
        const atHead = head === ownTicket;
        if (atHead) {
          const claimed = claimOwnedLock(lockDir, { ticket: ownTicket });
          if (claimed) {
            hold = claimed;
            return;
          }
        }
        // Every waiter, not only the head, clears a dead owner's lock: a head on an older copy of this module cannot
        // remove a directory that holds an owner token, and must not wait behind a dead one. Only the head claims.
        if (reapDeadLock(lockDir, { lockStaleMs, orphanStaleMs, log, note: atHead }) && atHead) continue;
        if (Date.now() - startedAt > timeoutMs) throw new Error('cot-shots lock timeout');
        await new Promise((resolve) => setTimeout(resolve, head === ownTicket ? 300 : 1000));
      }
    } finally {
      clearInterval(ticketHeartbeat);
      try { unlinkSync(join(queueDir, ownTicket)); } catch { /* already removed */ }
    }
  }

  function refresh() {
    return refreshOwnedLock(hold, { log });
  }

  function release() {
    if (!hold) return false;
    const releasing = hold;
    hold = null;
    return releaseOwnedLock(releasing, { log });
  }

  // Read-only count of acquisitions queued behind the owner (2026-10-01, gate P5). An owner's own
  // ticket is removed once it holds the lock, so every ticket of a live process is someone waiting.
  // A ticket is counted while its process lives, even past the reaping age (a waiter on an older copy of this
  // module does not renew its ticket): a long batch must yield to a long waiter. Nothing is reaped here. An unreadable
  // queue reports one waiter, so a caller that yields to waiters keeps the draining behaviour.
  function waiting() {
    let names;
    try {
      names = readdirSync(queueDir);
    } catch (error) {
      return error.code === 'ENOENT' ? 0 : 1;
    }
    return names.filter((name) => name.endsWith('.t') && ticketAlive(name)).length;
  }

  return { acquire, refresh, release, waiting, get lastTicket() { return lastTicket; } };
}

const sharedCaptureLock = createCaptureLock();

export const acquireCaptureLock = sharedCaptureLock.acquire;
export const refreshCaptureLock = sharedCaptureLock.refresh;

/** Selftest runners wait this long for the capture lock before failing with "cot-shots lock timeout" (default 45 min).
 *  Landing chains that share the machine with other sessions' suites set COT_SHOTS_LOCK_TIMEOUT_MS higher
 *  (2026-09-25: a chain died at 1/413 after 45 min behind another session's browser audit). */
export const DEFAULT_SELFTEST_LOCK_TIMEOUT_MS = 45 * 60 * 1000;
// The one variable it reads, by name: a default of the whole process.env made every receipt importing this module an
// opaque-environment receipt the selftest cache could never key (2026-10-16, changed-only R0).
export function selftestLockTimeoutMs(env = { COT_SHOTS_LOCK_TIMEOUT_MS: process.env.COT_SHOTS_LOCK_TIMEOUT_MS }) {
  const value = Number(env.COT_SHOTS_LOCK_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_SELFTEST_LOCK_TIMEOUT_MS;
}
export const releaseCaptureLock = sharedCaptureLock.release;
