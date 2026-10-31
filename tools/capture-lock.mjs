#!/usr/bin/env node
// Shared FIFO lock for GPU/browser capture harnesses. Keeping one owner avoids
// copy drift between screenshot, audio, Studio, and marketing verification.

import {
  appendFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
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
import { fileURLToPath } from 'node:url';

const DEFAULT_LOCK_DIR = '/tmp/cot-shots.lock';
const DEFAULT_QUEUE_DIR = '/tmp/cot-shots.queue';
/** The machine-wide queue directory (read-only use: who is waiting). */
export const CAPTURE_QUEUE_DIR = DEFAULT_QUEUE_DIR;
/** The machine-wide lock directory (read-only use: whose hold is on, one directory per hold). */
export const CAPTURE_LOCK_DIR = DEFAULT_LOCK_DIR;
const DEFAULT_LOCK_STALE_MS = 5 * 60 * 1000;
const DEFAULT_TICKET_STALE_MS = 60 * 60 * 1000;

function ticketPid(name) {
  const match = name.match(/-(\d+)\.[tw]$/);
  return match ? parseInt(match[1], 10) : -1;
}

function readQueue(queueDir, ownTicket) {
  try {
    return readdirSync(queueDir).filter((name) => name.endsWith('.t') || name.endsWith('.w')).sort();
  } catch {
    return [ownTicket];
  }
}

// ---- ticket identity (2026-10-22, item 240) -------------------------------------------------------------------------
// A ticket held only its pid, so a waiter killed in the queue (a lane's alarm) whose pid the kernel then reused looked
// alive: at the head it stalled the queue until its ticket aged out (an hour). Tickets now carry their owner's process
// start time, their heartbeat period and whether they are ready to hold. A ticket whose pid names another process (or a
// zombie), or whose heartbeat stopped for `ticketSilentMs`, is dead at once. A ticket not ready to hold (acquire's
// `prepare` not done) waits as `<name>.w`, which older copies of this module never read (they list `*.t`), so they never
// wait behind it; it keeps its place among this copy's tickets and becomes `<name>.t`, at the same stamp, once ready.
// Tickets written by an older copy (the bare pid, no heartbeat period) keep the old rules exactly: pid alive and an
// hour without a heartbeat, never the silent rule.
const TICKET_FORMAT = 'cot-capture-ticket/1';
const DEFAULT_TICKET_SILENT_MS = 10 * 60 * 1000;

/** `terms`: the ticket's class and hold cap (see lock classes below); older copies read past the extra fields. */
function ticketText(refreshMs, ready, phase, terms = {}) {
  return `${JSON.stringify({ format: TICKET_FORMAT, pid: process.pid, procStart: ownProcessStart(), refreshMs, ready, phase,
    command: process.argv.slice(1).join(' ').slice(0, 200), ...terms })}\n`;
}

/** A ticket's owner record, or null for an older copy's bare pid (or an unreadable file). */
function readTicketMeta(queueDir, name) {
  try {
    const text = readFileSync(join(queueDir, name), 'utf8');
    if (!text.startsWith('{')) return null;
    const meta = JSON.parse(text);
    return meta && meta.format === TICKET_FORMAT ? meta : null;
  } catch {
    return null;
  }
}

function ticketAgeMs(queueDir, name) {
  try {
    return Date.now() - statSync(join(queueDir, name)).mtimeMs;
  } catch {
    return 0;
  }
}

const ticketIdentityCache = new Map();
/** Whether a ticket's owner lives: { live, ready, why }. `staleMs` ages out an older copy's ticket; `silentMs` a new one
 *  whose heartbeat stopped; `ignoreAge` counts every ticket of a live process (waiting()). */
function ticketLiveness(queueDir, name, { staleMs, silentMs, ignoreAge = false }) {
  const pid = ticketPid(name);
  if (!pidAlive(pid)) return { live: false, why: `its pid ${pid} is dead` };
  const meta = readTicketMeta(queueDir, name);
  const ageMs = ignoreAge ? 0 : ticketAgeMs(queueDir, name);
  if (!meta) return ageMs > staleMs ? { live: false, why: `no heartbeat for ${Math.round(ageMs / 60_000)} min` } : { live: true, ready: true };
  if (meta.pid === pid && typeof meta.procStart === 'string') {
    let seen = ticketIdentityCache.get(name);
    if (!seen || Date.now() - seen.at > IDENTITY_CACHE_MS) {
      if (ticketIdentityCache.size > 256) ticketIdentityCache.clear();
      seen = { at: Date.now(), identity: processIdentity(pid) };
      ticketIdentityCache.set(name, seen);
    }
    const { identity } = seen;
    if (identity && identity.start !== meta.procStart) return { live: false, why: `its pid ${pid} now names another process` };
    if (identity && /^Z/.test(identity.state)) return { live: false, why: `its pid ${pid} has exited (a zombie)` };
  }
  if (Number(meta.refreshMs) > 0 && ageMs > Math.max(silentMs, 10 * Number(meta.refreshMs))) {
    return { live: false, why: `its heartbeat stopped ${Math.round(ageMs / 60_000)} min ago` };
  }
  return { live: true, ready: meta.ready !== false && !name.endsWith('.w') };
}

// ---- lock classes and the hold cap (2026-10-27, item 262) -----------------------------------------------------------
// The lock was fully exclusive: one UI gauntlet held it for its 60-minute budget with 11 tickets behind it while eight
// tank lanes started icon, hero-card, anatomy-diagram and drawing chains. Two classes now:
// - `timing` holds (perf probes, censuses, entry/leave timings, the Rust sorties, and every command not known to
//   render) stay exclusive: nothing else holds while one runs, and one at the head waits for running renders to end;
// - `render` holds (deterministic stills: genIcons, genHeroCards, genDrawings, the anatomy render sets, gauntlet
//   captures, owner sheets) share the lock, RENDER_SLOTS at once, each browser under launchGuardedBrowser's caps.
//   tank-standard-check's stage holds are renders too (2026-10-29): the geometry gate, the concept and photo checks,
//   the track-clip audit and its own census/contiguity render measure silhouettes, voxels and rasters, never frame time
//   (standard-check-page's `ms` is informational), so a lane's gate no longer waits for an empty lock.
// FIFO between the classes: a render takes a slot only when every ready ticket ahead of it is a render and a slot is
// free for it, so renders queued behind a timing ticket wait for it and a stream of renders cannot starve it. A ticket
// or a hold of an older copy of this module (no class) is exclusive, as every hold was, and older copies keep their
// rules: they never join a render group, and a group's directory looks held to them (see render groups below).
// The class comes from `--lock-class=render|timing` on the command line, else acquire's `lockClass`, else
// COT_SHOTS_LOCK_CLASS, else the command's script names (classifyCommand); the ticket, owner.json, the slot files and
// the hold log record it, and `--status` shows it.
// The hold cap (DEFAULT_HOLD_CAP_MS, 20 min): a holder past its cap gives the lock up at its next checkpoint() while
// anyone waits and re-queues at the back. acquire's `holdCapMinutes` raises it for that ticket only, with a
// `holdCapReason`; a holder that never calls checkpoint() keeps its hold and is logged once past the cap.
// Release priority (2026-10-31, item 266): 265's default tier took 96 min, 82 of them its browser receipts waiting one by
// one behind lane holds (whole-fleet proofs with raised caps). A ticket of priority `release` (acquire's `priority`, else
// COT_CAPTURE_PRIORITY, read by name: the integrator sets it on its default-tier and smoke runs and their children inherit
// it) is named before every waiting normal ticket and after every waiting release ticket, so each copy of this module,
// older ones included (they order by name), lets it go first and release tickets keep FIFO among themselves. While one
// waits, a normal hold's raised cap falls back to the base cap: at the grant, and at every checkpoint() of a hold
// already running. A release ticket therefore waits behind the holds running when it arrives (at most the base cap for
// a holder that checkpoints), never behind the queue. A holder that never checkpoints keeps its hold, as before.
const LOCK_CLASSES = ['timing', 'render'];
const RENDER_SLOTS = 2;
const DEFAULT_HOLD_CAP_MS = 20 * 60 * 1000;
const PRIORITIES = ['normal', 'release'];

/** This acquisition's priority: acquire's `priority`, else COT_CAPTURE_PRIORITY (read by name), else normal. */
function resolvePriority(option = null, env = process.env.COT_CAPTURE_PRIORITY) {
  const value = option ?? (env || 'normal');
  if (!PRIORITIES.includes(value)) throw new TypeError(`capture priority: not a priority: ${JSON.stringify(value)} (normal or release)`);
  return value;
}
const TIMING_SCRIPTS = /perf|census|timing|sortie/i;
const RENDER_SCRIPTS = /genIcons|genHeroCards|genDrawings|anatomy-render|gauntlet|sheet|tank-standard-check|geometry-gate|track-clip-audit|first-party-concept-check|photo-reference-check/i;

/**
 * The lock class a command line implies: { lockClass, from }. Only its script names count (a path after its last
 * `tools/`, else its file name), so a lane directory such as web-nav-perf-240 does not make a render timing. A zsh script
 * counts as one (`/bin/zsh /abs/steps.zsh`): without it the whole line, arguments and lane directory included, was read.
 * A timing pattern wins over a render one, and a command matching neither is timing (exclusive, as every hold was).
 */
export function classifyCommand(command) {
  const tokens = String(command ?? '').split(/\s+/).filter(Boolean);
  const scripts = tokens.filter((token) => !token.startsWith('-') && /\.(?:[cm]?[jt]sx?|z?sh|py)$/i.test(token))
    .map((token) => (/(?:^|\/)tools\//.test(token) ? token.replace(/^(?:.*\/)?tools\//, '') : token.replace(/^.*\//, '')));
  const subject = (scripts.length ? scripts : tokens).join(' ');
  if (TIMING_SCRIPTS.test(subject)) return { lockClass: 'timing', from: 'command' };
  if (RENDER_SCRIPTS.test(subject)) return { lockClass: 'render', from: 'command' };
  return { lockClass: 'timing', from: 'default' };
}

function lockClassArg(args) {
  for (let index = 0; index < args.length; index++) {
    if (args[index].startsWith('--lock-class=')) return args[index].slice('--lock-class='.length);
    if (args[index] === '--lock-class') return args[index + 1] ?? '';
  }
  return null;
}

/** This acquisition's class: { lockClass, from }. `command` stands for the process's own command line (a wrapper names
 *  the command it runs). The one variable it reads is read by name (see selftestLockTimeoutMs). */
function resolveLockClass({ option = null, command = null, args = process.argv.slice(2), env = process.env.COT_SHOTS_LOCK_CLASS } = {}) {
  for (const [value, from] of [[lockClassArg(args), '--lock-class'], [option, 'lockClass'], [env || null, 'COT_SHOTS_LOCK_CLASS']]) {
    if (value === null || value === undefined) continue;
    if (!LOCK_CLASSES.includes(value)) throw new TypeError(`${from}: not a lock class: ${JSON.stringify(value)} (timing or render)`);
    return { lockClass: value, from };
  }
  return classifyCommand(command ?? process.argv.slice(1).join(' '));
}

/** The hold cap of one ticket: { capMs, capReason }. Raising it past the base cap (DEFAULT_HOLD_CAP_MS) needs a reason. */
function resolveHoldCap(minutes, reason, baseCapMs = DEFAULT_HOLD_CAP_MS) {
  const why = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 200) : null;
  if (minutes === null || minutes === undefined) return { capMs: baseCapMs, capReason: why };
  const capMs = Number(minutes) * 60_000;
  if (!(capMs > 0) || !Number.isFinite(capMs)) throw new TypeError(`holdCapMinutes: not a positive number: ${minutes}`);
  if (capMs > baseCapMs && !why) {
    throw new TypeError(`holdCapMinutes ${minutes} raises the ${baseCapMs / 60_000}-min hold cap: give a holdCapReason`);
  }
  return { capMs, capReason: why };
}

/** A ticket's class from its record: 'legacy' (exclusive) for an older copy's ticket. */
const ticketClass = (meta) => (meta && LOCK_CLASSES.includes(meta.lockClass) ? meta.lockClass : 'legacy');

/**
 * The live tickets ready to hold ahead of `ownTicket`, in order, as { name, lockClass }, up to the first for which
 * `enough(list)` holds. Dead tickets on the way are removed (and logged); a warming ticket keeps its place and is
 * passed over.
 */
function readyAhead(queueDir, names, ownTicket, { staleMs, silentMs, log }, enough = () => true) {
  const ahead = [];
  for (const name of names) {
    if (name === ownTicket) break;
    const state = ticketLiveness(queueDir, name, { staleMs, silentMs });
    if (state.live) {
      if (!state.ready) continue;
      ahead.push({ name, lockClass: ticketClass(readTicketMeta(queueDir, name)) });
      if (enough(ahead)) break;
      continue;
    }
    try {
      unlinkSync(join(queueDir, name));
      log(`[capture-lock] removed the dead ticket ${name}: ${state.why}`);
    } catch { /* raced */ }
  }
  return ahead;
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
  if (hold.slot) {
    // a render group's member: the same directory, and its own slot file in it
    if (!at.isDir || at.id !== hold.id) return { state: 'lost', why: `${hold.lockDir} is another directory now` };
    const slot = readSlot(hold.lockDir, hold.slot);
    if (slot.error) return slot.error === 'ENOENT' ? { state: 'lost', why: `its render slot ${hold.slot} is gone` } : { state: 'unknown', why: `${hold.slot}: ${slot.error}` };
    return slot.record?.nonce === hold.nonce ? { state: 'ok' } : { state: 'lost', why: `${hold.slot} is another member's now` };
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
 * `ticket` is the queue ticket the hold was served at (its stamp is recorded too); `terms` its class and hold cap (an
 * exclusive hold: timing unless named). Throws only when the token cannot be written into a directory this call created
 * (a full disk); that directory is removed first.
 */
export function claimOwnedLock(lockDir, { ticket = null, terms = {} } = {}) {
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
    ...terms, lockClass: 'timing',
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
    if (hold.slot) utimesSync(join(hold.lockDir, hold.slot), now, now);
    return true;
  } catch {
    return false;
  }
}

/** Release `hold`: only while it still owns the path (otherwise log, leave it, false). The directory is renamed away
 *  in one step and then cleared with whatever *.holder files were left in it. */
export function releaseOwnedLock(hold, { log = stderrLog } = {}) {
  if (!hold) return false;
  if (hold.slot) return leaveRenderGroup(hold, log);
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

// ---- render groups (2026-10-27, item 262) ----------------------------------------------------------------------------
// Renders that share the lock hold one directory at the path: owner.json (the token of the member that created it, with
// `group: { max }`) and one SLOT file per member, `slot-<k>.holder`, written exclusively. A slot's first line is
// `pid <pid>`, the line older copies read as a live holder (liveHolderFiles), so they never reap the directory while a
// member lives even after its creator has left; the directory is never empty, so a pre-owner-token copy cannot remove
// it either. Members join and leave under a short mutex (MEMBERS_MUTEX_SUFFIX): a join counts the live slots and
// removes dead ones (a dead pid, or a pid reused once the slot went a lockStaleMs without a refresh); the last member
// out moves the directory away. A new group is made in that order (directory, the creator's slot, then owner.json),
// so no reader sees a group token without a live member.
const SLOT_FORMAT = 'cot-capture-lock-slot/1';
const SLOT_FILE = /^slot-(\d+)\.holder$/;
const MEMBERS_MUTEX_SUFFIX = '.members';
const MEMBERS_MUTEX_STALE_MS = 10_000;
/** A slot this young that cannot be parsed is a write in progress. */
const SLOT_WRITE_GRACE_MS = 10_000;
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const slotText = (record) => `pid ${record.pid}\n${JSON.stringify(record)}\n`;
const isGroupToken = (token, id) => token.id === id && Number.isSafeInteger(token.group?.max) && token.group.max > 0;
const groupMax = (token) => Math.min(token.group.max, 8);

/** One slot file: { name, record, ageMs } (record null when unreadable), or { name, error } (its errno). */
function readSlot(lockDir, name) {
  let text, mtimeMs;
  try {
    text = readFileSync(join(lockDir, name), 'utf8');
    mtimeMs = statSync(join(lockDir, name)).mtimeMs;
  } catch (error) {
    return { name, error: error.code ?? 'EIO' };
  }
  let record = null;
  try {
    const parsed = JSON.parse(text.slice(text.indexOf('\n') + 1));
    if (parsed && parsed.format === SLOT_FORMAT && Number.isSafeInteger(parsed.pid) && typeof parsed.nonce === 'string') record = parsed;
  } catch { /* torn, or being written */ }
  return { name, record, ageMs: Date.now() - mtimeMs };
}

function readSlots(lockDir) {
  let names;
  try { names = readdirSync(lockDir); } catch { return []; }
  return names.filter((name) => SLOT_FILE.test(name)).map((name) => readSlot(lockDir, name)).filter((slot) => !slot.error);
}

function slotLive(slot, lockStaleMs) {
  if (!slot.record) return slot.ageMs < SLOT_WRITE_GRACE_MS;
  return ownerLiveness(slot.record, slot.ageMs, lockStaleMs).alive;
}

/** Run `work` under the members mutex: { value }, or { busy: true } when the mutex stayed taken for `waitMs`. Its
 *  critical sections are a few syscalls, so a mutex older than MEMBERS_MUTEX_STALE_MS was left by a dead process. */
function withMembersMutex(lockDir, work, { waitMs = 1_000 } = {}) {
  const mutex = `${lockDir}${MEMBERS_MUTEX_SUFFIX}`;
  const until = Date.now() + waitMs;
  for (;;) {
    try {
      mkdirSync(mutex);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') return { busy: true };
      try { if (Date.now() - statSync(mutex).mtimeMs > MEMBERS_MUTEX_STALE_MS) rmdirSync(mutex); } catch { /* raced */ }
      if (Date.now() > until) return { busy: true };
      sleepSync(5);
    }
  }
  try {
    return { value: work() };
  } finally {
    try { rmdirSync(mutex); } catch { /* raced */ }
  }
}

/** Free render slots at `lockDir` as a waiter sees them (no mutex): all of them when the path is free, the group's
 *  free ones when a render group holds it, none while an exclusive hold (an older copy's included) is there. */
function freeRenderSlots(lockDir, lockStaleMs) {
  let at;
  try { at = pathId(lockDir); } catch (error) { return error.code === 'ENOENT' ? RENDER_SLOTS : 0; }
  if (!at.isDir) return 0;
  const owner = readOwner(lockDir);
  if (owner.state !== 'ok' || !isGroupToken(owner.token, at.id)) return 0;
  return Math.max(0, groupMax(owner.token) - readSlots(lockDir).filter((slot) => slotLive(slot, lockStaleMs)).length);
}

/**
 * Take a render slot: start a group at a free path, or join the render group there while it has a free slot. Returns
 * the hold ({ ..., slot, members }), or null (the path holds an exclusive lock, the group is full, or the mutex is busy).
 */
function claimRenderSlot(lockDir, { ticket = null, terms = {}, lockStaleMs = DEFAULT_LOCK_STALE_MS, log = stderrLog, logFile = null } = {}) {
  const outcome = withMembersMutex(lockDir, () => {
    const nonce = randomBytes(12).toString('hex');
    const startedAt = new Date().toISOString();
    const command = process.argv.slice(1).join(' ').slice(0, 300);
    const record = { format: SLOT_FORMAT, pid: process.pid, procStart: ownProcessStart(), nonce, ticket, startedAt, command,
      ...terms, lockClass: 'render' };
    const write = (name) => {
      try {
        writeFileSync(join(lockDir, name), slotText(record), { flag: 'wx' });
        return true;
      } catch (error) {
        if (['ENOENT', 'EEXIST', 'ENOTDIR'].includes(error.code)) return false;
        throw new Error(`cot-shots lock: cannot write the render slot ${name} in ${lockDir} (${error.code ?? error.message})`);
      }
    };
    let at;
    try {
      at = pathId(lockDir);
    } catch (error) {
      if (error.code !== 'ENOENT') return null;
      try { mkdirSync(lockDir); } catch { return null; }
      let id;
      try { id = pathId(lockDir).id; } catch { return null; }
      const slot = 'slot-0.holder';
      const undo = () => { try { unlinkSync(join(lockDir, slot)); } catch { /* gone */ } try { if (sameDir(lockDir, id)) rmdirSync(lockDir); } catch { /* not empty */ } };
      try {
        if (!write(slot)) return null;
        const token = { format: OWNER_FORMAT, pid: process.pid, nonce: randomBytes(12).toString('hex'), id, ticket,
          stamp: typeof ticket === 'string' && /^\d{15}-/.test(ticket) ? Number(ticket.slice(0, 15)) : null, startedAt,
          procStart: record.procStart, command, lockClass: 'render', group: { max: RENDER_SLOTS } };
        writeFileSync(join(lockDir, OWNER_FILE), `${JSON.stringify(token)}\n`, { flag: 'wx' });
      } catch (error) {
        undo();
        if (['ENOENT', 'EEXIST', 'ENOTDIR'].includes(error.code)) return null;
        throw error;
      }
      const hold = { lockDir, id, nonce, slot, pid: process.pid, ticket, token: record, lockStaleMs, lostNoted: false, members: 1 };
      if (holdState(hold).state === 'ok') return hold;
      undo();
      return null;
    }
    if (!at.isDir) return null;
    const owner = readOwner(lockDir);
    if (owner.state !== 'ok' || !isGroupToken(owner.token, at.id)) return null;
    const taken = new Set();
    let live = 0;
    for (const slot of readSlots(lockDir)) {
      taken.add(slot.name);
      if (slotLive(slot, lockStaleMs)) { live += 1; continue; }
      try { unlinkSync(join(lockDir, slot.name)); } catch { continue; }
      taken.delete(slot.name);
      const who = slot.record ? `pid ${slot.record.pid}, ticket ${slot.record.ticket ?? 'none'}` : 'unreadable';
      log(`[capture-lock] removed the dead render slot ${slot.name} (${who}) from ${lockDir}`);
      appendHoldLog(logFile, { e: 'reap', pid: slot.record?.pid ?? null, ticket: slot.record?.ticket ?? null, lockClass: 'render',
        why: 'a dead render member', heldMs: slot.record ? Date.now() - Date.parse(slot.record.startedAt) || null : null });
    }
    const max = groupMax(owner.token);
    if (live >= max) return null;
    const slot = Array.from({ length: max }, (_, index) => `slot-${index}.holder`).find((name) => !taken.has(name));
    if (!slot || !write(slot)) return null;
    const hold = { lockDir, id: at.id, nonce, slot, pid: process.pid, ticket, token: record, lockStaleMs, lostNoted: false, members: live + 1 };
    if (holdState(hold).state === 'ok') return hold;
    // the directory changed hands between the check and the write (an older copy reaped it): take the slot back out
    const stray = readSlot(lockDir, slot);
    if (stray.record?.nonce === nonce) { try { unlinkSync(join(lockDir, slot)); } catch { /* gone */ } }
    return null;
  });
  return outcome.busy ? null : outcome.value;
}

/** Leave a render group: drop this member's slot and, when no live member is left, move the directory away. */
function leaveRenderGroup(hold, log) {
  const refuse = (check) => {
    log(check.state === 'lost'
      ? `[capture-lock] release refused (${holdName(hold)}, ${hold.slot}): ${check.why}. This member no longer holds the lock, so it is left untouched.`
      : `[capture-lock] release could not check its render slot (${holdName(hold)}: ${check.why}); it is reaped once this process exits.`);
    return false;
  };
  const outcome = withMembersMutex(hold.lockDir, () => {
    const check = holdState(hold);
    if (check.state !== 'ok') return refuse(check);
    try { unlinkSync(join(hold.lockDir, hold.slot)); } catch { return false; }
    if (readSlots(hold.lockDir).some((slot) => slotLive(slot, hold.lockStaleMs ?? DEFAULT_LOCK_STALE_MS))) return true;
    const tomb = `${hold.lockDir}.released-${hold.pid}-${hold.nonce}`;
    if (renameAway(hold.lockDir, hold.id, tomb, log)) clearTomb(tomb, log);
    return true;
  }, { waitMs: 5_000 });
  if (!outcome.busy) return outcome.value;
  // The mutex stayed taken (a stuck peer): drop this member's slot only; a group left without members is reaped by the
  // next waiter.
  const check = holdState(hold);
  if (check.state !== 'ok') return refuse(check);
  try { unlinkSync(join(hold.lockDir, hold.slot)); return true; } catch { return false; }
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
  if (owner.state === 'ok' && isGroupToken(owner.token, at.id)) {
    // a render group lives while any member does, whoever created it
    const slots = readSlots(lockDir);
    const members = slots.filter((slot) => slotLive(slot, lockStaleMs)).length;
    if (members) return { verdict: 'live', id: at.id, token: owner.token, ageMs, group: true, members };
    return { verdict: 'dead', id: at.id, token: owner.token, ageMs, group: true,
      why: slots.length ? 'every member of its render group is dead' : 'its render group has no members left' };
  }
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
export function reapDeadLock(lockDir, { lockStaleMs = DEFAULT_LOCK_STALE_MS, orphanStaleMs = 4 * lockStaleMs, log = stderrLog, note = false,
  logFile = null } = {}) {
  const options = { lockStaleMs, orphanStaleMs };
  const first = inspectLock(lockDir, options);
  if (first.verdict === 'absent') return true;
  if (first.verdict !== 'dead' && first.verdict !== 'orphan') {
    if (note && first.ageMs > lockStaleMs) {
      if (first.verdict === 'live' && first.group) {
        noteOnce(first.token.nonce, `[capture-lock] ${lockDir} is held by a render group of ${first.members}, with no refresh for ` +
          `${Math.round(first.ageMs / 60_000)} min: waiting (a group with a live member is never reaped)`, log);
      } else if (first.verdict === 'live') {
        noteOnce(first.token.nonce, `[capture-lock] ${lockDir} is held by live ${describeToken(first.token)}, with no refresh for ` +
          `${Math.round(first.ageMs / 60_000)} min: waiting (a live owner's lock is never reaped; stop that process to free it)`, log);
      } else if (first.why) {
        noteOnce(`${first.id}:${first.why}`, `[capture-lock] ${lockDir} is not reaped: ${first.why}`, log);
      }
    }
    return false;
  }
  const reap = () => {
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
    if (again.verdict === 'dead') {
      appendHoldLog(logFile, { e: 'reap', pid: again.token.pid, ticket: again.token.ticket ?? null, why: again.why,
        heldMs: Date.now() - Date.parse(again.token.startedAt ?? '') || null, ...(again.group ? { lockClass: 'render' } : {}) });
    }
    clearTomb(tomb, log);
    return true;
  };
  // a render group is reaped under its members mutex too, so no member joins between the check and the move
  const result = withReapMutex(lockDir, first.group ? () => {
    const inner = withMembersMutex(lockDir, reap);
    return inner.busy ? false : inner.value;
  } : reap);
  return result === true;
}

/** Renew a waiting ticket; restore it under the same name (so the same place) when another waiter removed it while we
 *  were still waiting (an older copy of this module, or a heartbeat this process missed). */
function keepTicket(path, text) {
  const now = new Date();
  try {
    utimesSync(path, now, now);
  } catch (error) {
    if (error.code !== 'ENOENT') return;
    try { writeFileSync(path, text(), { flag: 'wx' }); } catch { /* raced */ }
  }
}

/** Replace a ticket's text in one step (a reader sees the old record or the new one, never half of one). */
function rewriteTicket(path, text) {
  const temporary = `${path}.w${process.pid}`;
  try {
    writeFileSync(temporary, text);
    renameSync(temporary, path);
  } catch {
    try { unlinkSync(temporary); } catch { /* gone */ }
  }
}

// Distinguish acquisitions launched by concurrent workers in one process.
// Keep the PID last for legacy ticket liveness checks and use exclusive creation.
let nextTicketSequence = 0;
function reserveTicket(queueDir, text, suffix = '.t') {
  for (;;) {
    const sequence = String(nextTicketSequence++).padStart(12, '0');
    const name = `${String(Date.now()).padStart(15, '0')}-${sequence}-${process.pid}${suffix}`;
    try {
      writeFileSync(join(queueDir, name), text, { flag: 'wx' });
      return name;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
}

/** A release ticket (see release priority above): named one before the first waiting normal ticket, else now, and after
 *  every waiting release ticket (the same stamp, one sequence later), by exclusive creation. */
function reserveReleaseTicket(queueDir, text, suffix = '.t') {
  for (;;) {
    let names = [];
    try { names = readdirSync(queueDir).filter((name) => /^\d{15}-\d{12}-\d+\.[tw]$/.test(name)).sort(); } catch { /* an empty queue */ }
    const release = (name) => readTicketMeta(queueDir, name)?.priority === 'release';
    const firstNormal = names.find((name) => !release(name));
    let stamp = Math.min(Date.now(), firstNormal ? Number(firstNormal.slice(0, 15)) - 1 : Infinity), sequence = 0;
    const lastRelease = names.filter((name) => (!firstNormal || name < firstNormal) && release(name)).at(-1);
    if (lastRelease && Number(lastRelease.slice(0, 15)) >= stamp) {
      stamp = Number(lastRelease.slice(0, 15));
      sequence = Number(lastRelease.slice(16, 28)) + 1;
    }
    const name = `${String(stamp).padStart(15, '0')}-${String(sequence).padStart(12, '0')}-${process.pid}${suffix}`;
    try {
      writeFileSync(join(queueDir, name), text, { flag: 'wx' });
      return name;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
}

/** Live release tickets in the queue other than `except` (warming ones included: they hold their place). */
function releaseWaiting(queueDir, rules, except = null) {
  let names;
  try { names = readdirSync(queueDir); } catch { return 0; }
  return names.filter((name) => /^\d{15}-\d{12}-\d+\.[tw]$/.test(name) && name !== except
    && readTicketMeta(queueDir, name)?.priority === 'release' && ticketLiveness(queueDir, name, { ...rules, ignoreAge: true }).live).length;
}

/** Re-enter the queue under a ticket this process was issued before (its place); a present copy is kept. */
function restoreTicket(queueDir, name, text = String(process.pid)) {
  if (!/^\d{15}-\d{12}-\d+\.[tw]$/.test(name) || ticketPid(name) !== process.pid) throw new Error(`not this process's ticket: ${name}`);
  try { writeFileSync(join(queueDir, name), text, { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  return name;
}

// ---- places (2026-10-22, item 240) -----------------------------------------------------------------------------------
// A lane's alarm that killed a waiter sent its next run to the back of a two-hour queue. acquire's `place` (a key the
// job chooses, e.g. "<lane>-<item>") records the stamp of its first ticket; a later run under the same key, within
// PLACE_MAX_AGE_MS, rejoins at that stamp. The record is dropped once the job holds the lock.
const PLACE_MAX_AGE_MS = 12 * 3600 * 1000;
const placePath = (queueDir, key) => join(queueDir, 'places', `${String(key).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120)}.json`);

function placeStamp(queueDir, key) {
  const path = placePath(queueDir, key);
  try {
    const { stamp } = JSON.parse(readFileSync(path, 'utf8'));
    if (Number.isSafeInteger(stamp) && stamp > 0 && Date.now() - stamp < PLACE_MAX_AGE_MS) return stamp;
  } catch { /* none yet */ }
  const stamp = Date.now();
  try {
    mkdirSync(join(queueDir, 'places'), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ stamp, pid: process.pid, at: new Date(stamp).toISOString() })}\n`);
  } catch { /* the place is kept for this run only */ }
  return stamp;
}

// ---- the hold log (2026-10-22, item 240) -----------------------------------------------------------------------------
// One JSON line per hold, release and reap in `logFile` (`/tmp/cot-shots.log`): `node tools/capture-lock.mjs --status`
// reads holds per hour, hold lengths and waits from it. Bounded: past LOG_MAX_BYTES it moves to `<logFile>.1`.
const DEFAULT_LOG_FILE = '/tmp/cot-shots.log';
const LOG_MAX_BYTES = 4 * 1024 * 1024;
function appendHoldLog(logFile, record) {
  if (!logFile) return;
  try {
    if (statSync(logFile).size > LOG_MAX_BYTES) renameSync(logFile, `${logFile}.1`);
  } catch { /* none yet */ }
  try {
    appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`);
  } catch { /* the meter misses a line; the lock is unaffected */ }
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
// Every lock instance of this process that holds the lock now, for releaseAllCaptureHolds.
const heldLocks = new Set();

/**
 * Release every capture hold this process has (2026-10-26, item 244): the browser guard (tools/browser-launch.mjs) calls
 * it once it has killed a runaway browser, before the process exits, so the queue moves on at once instead of after the
 * dead owner's lock goes stale. `reason` goes into each release's hold-log line. Returns the tickets released.
 */
export function releaseAllCaptureHolds(reason = null) {
  const tickets = [];
  for (const lock of [...heldLocks]) {
    const ticket = lock.heldTicket;
    if (lock.release(reason)) tickets.push(ticket);
  }
  return tickets;
}

export function createCaptureLock({
  lockDir = DEFAULT_LOCK_DIR,
  queueDir = DEFAULT_QUEUE_DIR,
  lockStaleMs = DEFAULT_LOCK_STALE_MS,
  ticketStaleMs = DEFAULT_TICKET_STALE_MS,
  ticketRefreshMs = Math.max(1, Math.min(30_000, ticketStaleMs / 3)),
  ticketSilentMs = Math.max(DEFAULT_TICKET_SILENT_MS, 10 * ticketRefreshMs),
  orphanStaleMs = 4 * lockStaleMs,
  logFile = lockDir === DEFAULT_LOCK_DIR ? DEFAULT_LOG_FILE : null,
  log = stderrLog,
  holdCapMs = DEFAULT_HOLD_CAP_MS, // the base hold cap (a selftest shortens it)
} = {}) {
  let hold = null;
  let lastTicket = null;
  // the hold's terms (its class, cap and the acquire arguments a checkpoint re-queues with) and when it began
  let holdTerms = null, heldSince = 0;
  const queueRules = { staleMs: ticketStaleMs, silentMs: ticketSilentMs, log };

  /**
   * Wait for the FIFO head, then take the lock. `ticket` (2026-10-02): re-enter under a ticket this process was issued
   * by an earlier acquire (\`lastTicket\`) — its original place — for a caller that gave its turn back because a lock
   * of its own was held by someone queued behind it, and re-enters once that holder is done.
   * `prepare` (2026-10-22): an async function run while the ticket waits, so warming (servers, browser, pages) costs
   * no hold time. It starts just in time, once at most `warmAhead` live tickets are ahead (COT_SHOTS_WARM_AHEAD,
   * default 2): every queued lane warming at once would hold a browser each for hours. Until it resolves the ticket
   * keeps its place but is passed over; acquire then resolves with its result once this ticket heads the queue. A
   * `prepare` that throws leaves the queue and rethrows.
   * `place` (2026-10-22): a job key; a run killed while it waited rejoins at its first run's stamp (see placeStamp).
   * `lockClass` ('timing' or 'render'), `command` (the command a wrapper runs, to classify it), `holdCapMinutes` and
   * `holdCapReason` (2026-10-27): see lock classes and the hold cap above.
   */
  async function acquire(timeoutMs = 10 * 60 * 1000, { ticket = null, prepare = null, place = null, lockClass = null, command = null,
    holdCapMinutes = null, holdCapReason = null, priority = null,
    warmAhead = Number(process.env.COT_SHOTS_WARM_AHEAD) >= 0 && process.env.COT_SHOTS_WARM_AHEAD !== '' ? Number(process.env.COT_SHOTS_WARM_AHEAD) : 2 } = {}) {
    const classed = resolveLockClass({ option: lockClass, command });
    const cap = resolveHoldCap(holdCapMinutes, holdCapReason, holdCapMs);
    const release = resolvePriority(priority) === 'release';
    const terms = { lockClass: classed.lockClass, classFrom: classed.from, capMs: cap.capMs, ...(cap.capReason ? { capReason: cap.capReason } : {}),
      ...(release ? { priority: 'release' } : {}) };
    const render = terms.lockClass === 'render';
    // a render needs to know whether every ready ticket ahead is a render, and how many there are up to its slots
    const enough = render ? (ahead) => ahead.at(-1).lockClass !== 'render' || ahead.length >= RENDER_SLOTS : () => true;
    // A landing chain exports COT_SHOTS_LOCK_TIMEOUT_MS (three hours) so every waiter it spawns — the suite runner and
    // the browser receipts that take the lock themselves — outlasts other sessions' captures (2026-09-25: a probe receipt
    // died at its own 45-minute wait while the runner would have waited three hours).
    const chainWait = Number(process.env.COT_SHOTS_LOCK_TIMEOUT_MS);
    if (Number.isFinite(chainWait) && chainWait > timeoutMs) timeoutMs = chainWait;
    mkdirSync(queueDir, { recursive: true });
    let ready = typeof prepare !== 'function';
    let preparing = null;
    const text = () => ticketText(ticketRefreshMs, ready, ready ? 'ready' : preparing ? 'warming' : 'queued', terms);
    if (!ticket && place && !release) ticket = ticketAt(placeStamp(queueDir, place)); // a release ticket goes ahead of any place
    // not ready yet: wait as `.w`, out of older copies' sight (see ticket identity above)
    const suffix = ready ? '.t' : '.w';
    if (ticket) ticket = ticket.replace(/\.[tw]$/, suffix);
    let ownTicket = ticket ? restoreTicket(queueDir, ticket, text())
      : release ? reserveReleaseTicket(queueDir, text(), suffix) : reserveTicket(queueDir, text(), suffix);
    if (ticket) rewriteTicket(join(queueDir, ownTicket), text());
    lastTicket = ownTicket;
    let ownPath = join(queueDir, ownTicket);
    const startedAt = Date.now();
    // A legitimate capture ahead of us can outlast ticketStaleMs. Keep our waiting ticket alive without changing its
    // filename or FIFO position, and restore it if an older copy of this module reaped it anyway.
    const ticketHeartbeat = setInterval(() => keepTicket(ownPath, text), ticketRefreshMs);
    ticketHeartbeat.unref();
    let prepared, prepareError = null, warmMs = 0;
    const startPrepare = () => {
      const warmFrom = Date.now();
      preparing = (async () => prepare())();
      rewriteTicket(ownPath, text());
      preparing = preparing.then(
        (value) => {
          prepared = value;
          warmMs = Date.now() - warmFrom;
          ready = true;
          // ready: the same stamp as `.t`, where every copy of this module sees it
          rewriteTicket(ownPath, text());
          const readyTicket = ownTicket.replace(/\.w$/, '.t');
          try {
            renameSync(ownPath, join(queueDir, readyTicket));
          } catch {
            writeFileSync(join(queueDir, readyTicket), text()); // removed meanwhile: re-enter at the same stamp
          }
          ownTicket = readyTicket;
          ownPath = join(queueDir, readyTicket);
          lastTicket = readyTicket;
        },
        (error) => { prepareError = error; });
    };
    try {
      for (;;) {
        if (prepareError) throw prepareError;
        const names = readQueue(queueDir, ownTicket);
        const ahead = readyAhead(queueDir, names, ownTicket, queueRules, enough);
        if (!ready && !preparing) {
          const live = names.slice(0, Math.max(0, names.indexOf(ownTicket)))
            .filter((name) => ticketLiveness(queueDir, name, queueRules).live).length;
          if (live <= warmAhead) startPrepare();
        }
        const atHead = ahead.length === 0;
        // timing (and every exclusive hold): the head of the queue, at a free path. A render: only renders ahead of it,
        // fewer than the slots free for them, so it never passes a timing ticket nor a render queued before it.
        const turn = ready && (render ? ahead.every((other) => other.lockClass === 'render') && ahead.length < freeRenderSlots(lockDir, lockStaleMs) : atHead);
        if (turn) {
          // a normal hold granted while a release ticket waits keeps the base cap, whatever it asked for
          const granted = !release && terms.capMs > holdCapMs && releaseWaiting(queueDir, queueRules, ownTicket)
            ? { ...terms, capMs: holdCapMs, capReason: `${terms.capReason} (raised cap refused: a release ticket waits)` } : terms;
          if (granted !== terms) log(`[capture-lock] a release ticket waits: this ${terms.lockClass} hold keeps the ${holdCapMs / 60_000}-min cap`);
          const claimed = render ? claimRenderSlot(lockDir, { ticket: ownTicket, terms: granted, lockStaleMs, log, logFile })
            : claimOwnedLock(lockDir, { ticket: ownTicket, terms: granted });
          if (claimed) {
            hold = claimed;
            heldSince = Date.now();
            holdTerms = { ...granted, timeoutMs, command, holdCapMinutes, holdCapReason };
            heldLocks.add(api);
            if (place) { try { unlinkSync(placePath(queueDir, place)); } catch { /* gone */ } }
            appendHoldLog(logFile, { e: 'hold', pid: process.pid, ticket: ownTicket, waitedMs: Date.now() - startedAt, warmMs,
              lockClass: terms.lockClass, ...(render ? { members: claimed.members } : {}), capMs: granted.capMs,
              ...(granted.capReason ? { capReason: granted.capReason } : {}), ...(release ? { priority: 'release' } : {}),
              command: process.argv.slice(1).join(' ').slice(0, 300) });
            return prepared;
          }
        }
        // Every waiter, not only the head, clears a dead owner's lock: a head on an older copy of this module cannot
        // remove a directory that holds an owner token, and must not wait behind a dead one. Only the head claims.
        if (reapDeadLock(lockDir, { lockStaleMs, orphanStaleMs, log, logFile, note: atHead && ready }) && atHead && ready) continue;
        if (Date.now() - startedAt > timeoutMs) throw new Error('cot-shots lock timeout');
        await new Promise((resolve) => setTimeout(resolve, turn || (atHead && ready) ? 300 : 1000));
      }
    } catch (error) {
      // A wait that ends without a hold still lets `prepare` finish, and hands its result to the caller to close.
      if (preparing) {
        await preparing;
        if (prepared !== undefined && error && typeof error === 'object') error.prepared = prepared;
      }
      throw error;
    } finally {
      clearInterval(ticketHeartbeat);
      for (const name of new Set([ownTicket, ownTicket.replace(/\.[tw]$/, '.t'), ownTicket.replace(/\.[tw]$/, '.w')])) {
        try { unlinkSync(join(queueDir, name)); } catch { /* already removed */ }
      }
    }
  }

  /** The running hold's cap: its own, or the base cap while a release ticket waits behind a normal hold. */
  const capNow = () => (holdTerms.priority !== 'release' && holdTerms.capMs > holdCapMs && releaseWaiting(queueDir, queueRules)
    ? holdCapMs : holdTerms.capMs);

  function refresh() {
    const refreshed = refreshOwnedLock(hold, { log });
    if (refreshed && Date.now() - heldSince > capNow()) {
      noteOnce(`${hold.nonce}:cap`, `[capture-lock] this ${holdTerms.lockClass} hold (${holdName(hold)}) is past its ${capNow() / 60_000}-min cap; `
        + 'it gives the lock up only at a checkpoint(): call one between batches', log);
    }
    return refreshed;
  }

  /**
   * Call between batches (2026-10-27). Past its hold cap while anyone waits, the hold is given up and this instance
   * re-queues at the back with the same class and cap; it resolves once it holds the lock again. `beforeYield()` runs
   * while the lock is still held (freeze the pages: nothing draws after the release), `afterResume()` once it is held
   * again. Before the cap, or with nobody waiting, it returns at once. Resolves { yielded, heldMs, capMs, waitedMs }.
   */
  async function checkpoint({ beforeYield = null, afterResume = null, timeoutMs = null } = {}) {
    if (!hold) throw new Error('checkpoint(): this lock holds nothing (call it between batches, while the lock is held)');
    const heldMs = Date.now() - heldSince, terms = holdTerms, capMs = capNow();
    if (heldMs < capMs) return { yielded: false, heldMs, capMs, waitedMs: 0 };
    const waiters = waiting();
    if (!waiters) {
      noteOnce(`${hold.nonce}:cap-idle`, `[capture-lock] this ${terms.lockClass} hold is past its ${capMs / 60_000}-min cap with nobody `
        + 'waiting: it keeps the lock', log);
      return { yielded: false, heldMs, capMs, waitedMs: 0 };
    }
    log(`[capture-lock] this ${terms.lockClass} hold is past its ${capMs / 60_000}-min cap (${(heldMs / 60_000).toFixed(1)} min) with `
      + `${waiters} waiting${capMs < terms.capMs ? ' (a release ticket waits: its raised cap is off)' : ''}: yielding at its checkpoint and re-queueing`);
    if (beforeYield) await beforeYield();
    release(`hold cap: yielded after ${(heldMs / 60_000).toFixed(1)} min with ${waiters} waiting`);
    const queuedAt = Date.now();
    await acquire(timeoutMs ?? terms.timeoutMs, { lockClass: terms.lockClass, command: terms.command,
      holdCapMinutes: terms.holdCapMinutes, holdCapReason: terms.holdCapReason, priority: terms.priority ?? 'normal' });
    if (afterResume) await afterResume();
    return { yielded: true, heldMs, capMs, waitedMs: Date.now() - queuedAt };
  }

  /** `reason` (optional) is recorded on the hold-log line (the browser guard's release says why). */
  function release(reason = null) {
    if (!hold) return false;
    const releasing = hold;
    hold = null;
    heldLocks.delete(api);
    const released = releaseOwnedLock(releasing, { log });
    appendHoldLog(logFile, { e: 'release', pid: process.pid, ticket: releasing.ticket, released, lockClass: holdTerms?.lockClass ?? null,
      heldMs: Date.now() - Date.parse(releasing.token.startedAt), ...(typeof reason === 'string' && reason ? { reason } : {}) });
    return released;
  }

  // Read-only count of acquisitions queued behind the owner (2026-10-01, gate P5). An owner's own
  // ticket is removed once it holds the lock, so every ticket of a live process is someone waiting.
  // A ticket is counted while its process lives, even past the reaping age (a waiter on an older copy of this
  // module does not renew its ticket): a long batch must yield to a long waiter. Nothing is reaped here. An unreadable
  // queue reports one waiter, so a caller that yields to waiters keeps the draining behaviour.
  // A warming ticket (acquire's `prepare` still running) is not counted: a batch that yields to it would leave the lock
  // idle while it warms.
  function waiting() {
    let names;
    try {
      names = readdirSync(queueDir);
    } catch (error) {
      return error.code === 'ENOENT' ? 0 : 1;
    }
    return names.filter((name) => {
      if (!name.endsWith('.t')) return false; // a `.w` ticket is not ready to hold
      const state = ticketLiveness(queueDir, name, { ...queueRules, ignoreAge: true });
      return state.live && state.ready;
    }).length;
  }

  const api = { acquire, refresh, release, checkpoint, waiting, get lastTicket() { return lastTicket; },
    get heldTicket() { return hold?.ticket ?? null; }, get heldClass() { return hold ? holdTerms.lockClass : null; } };
  return api;
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

/** Holds per hour, hold lengths and waits over the last `hours` from hold-log lines (`--status`). */
export function summarizeHoldLog(lines, { now = Date.now(), hours = 6 } = {}) {
  const since = now - hours * 3600 * 1000;
  const records = lines.map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter((record) => record && Date.parse(record.at) >= since);
  const quantile = (values, q) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  };
  const holds = records.filter((record) => record.e === 'hold');
  const ends = records.filter((record) => (record.e === 'release' || record.e === 'reap') && Number.isFinite(record.heldMs));
  const heldMin = ends.map((record) => record.heldMs / 60_000), waitedMin = holds.map((record) => record.waitedMs / 60_000);
  const warmMin = holds.filter((record) => record.warmMs > 0).map((record) => record.warmMs / 60_000);
  return {
    hours, holds: holds.length, perHour: holds.length / hours, reaped: records.filter((record) => record.e === 'reap').length,
    heldMedianMin: quantile(heldMin, 0.5), heldP90Min: quantile(heldMin, 0.9),
    waitedMedianMin: quantile(waitedMin, 0.5), warmedHolds: warmMin.length, warmMedianMin: quantile(warmMin, 0.5),
  };
}

// `node tools/capture-lock.mjs --status [--hours=6]`: who holds the lock, who waits (ready, warming, dead) and, from the
// hold log, holds per hour. Read-only: it removes nothing. Holds by tools on an older copy of this module are not logged.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--status')) {
  const hours = Number(process.argv.find((arg) => arg.startsWith('--hours='))?.slice(8)) || 6;
  const minutes = (ms) => `${(ms / 60_000).toFixed(1)} min`;
  const owner = readOwner(DEFAULT_LOCK_DIR);
  const capOf = (record) => (Number(record.capMs) > 0 ? `, cap ${minutes(record.capMs)}${record.capReason ? ` (${record.capReason})` : ''}` : '');
  let groupId = null;
  try { groupId = pathId(DEFAULT_LOCK_DIR).id; } catch { /* free */ }
  if (owner.state === 'ok' && isGroupToken(owner.token, groupId)) {
    const slots = readSlots(DEFAULT_LOCK_DIR);
    const live = slots.filter((slot) => slotLive(slot, DEFAULT_LOCK_STALE_MS));
    console.log(`held by a render group: ${live.length} of ${groupMax(owner.token)} slots${slots.length > live.length ? ` (${slots.length - live.length} dead)` : ''}`);
    for (const slot of slots) {
      const record = slot.record ?? {};
      const heldMs = Date.now() - Date.parse(record.startedAt ?? '');
      console.log(`  ${slot.name}  render  held ${Number.isFinite(heldMs) ? minutes(heldMs) : '?'} by pid ${record.pid ?? '?'}${live.includes(slot) ? '' : ' (dead)'}`
        + `${capOf(record)}: ${(record.command ?? '?').slice(0, 110)}`);
    }
  } else if (owner.state === 'ok') {
    const heldMs = Date.now() - Date.parse(owner.token.startedAt);
    const lockClass = LOCK_CLASSES.includes(owner.token.lockClass) ? owner.token.lockClass : 'exclusive (an older copy: no class)';
    console.log(`held ${minutes(heldMs)} by pid ${owner.token.pid}${pidAlive(owner.token.pid) ? '' : ' (dead)'}, ${lockClass}${capOf(owner.token)}: `
      + `${owner.token.command ?? '?'}`);
  } else {
    let present = false;
    try { lstatSync(DEFAULT_LOCK_DIR); present = true; } catch { /* free */ }
    console.log(present ? `held by an older copy of the lock (no owner token)` : 'free');
  }
  let names = [];
  try { names = readQueue(DEFAULT_QUEUE_DIR, null).filter(Boolean); } catch { /* no queue */ }
  const rules = { staleMs: DEFAULT_TICKET_STALE_MS, silentMs: DEFAULT_TICKET_SILENT_MS };
  const states = names.map((name) => ({ name, ...ticketLiveness(DEFAULT_QUEUE_DIR, name, rules), meta: readTicketMeta(DEFAULT_QUEUE_DIR, name) }));
  const ready = states.filter((state) => state.live && state.ready), warming = states.filter((state) => state.live && !state.ready);
  console.log(`queue: ${ready.length} ready, ${warming.length} warming or waiting to warm, ${states.length - ready.length - warming.length} dead`);
  for (const state of [...ready, ...warming].slice(0, 12)) {
    const age = Date.now() - Number(state.name.slice(0, 15));
    const phase = state.ready ? 'ready' : state.meta?.phase ?? 'warming';
    console.log(`  ${minutes(age).padStart(10)}  ${phase.padEnd(7)}  ${ticketClass(state.meta).padEnd(6)}  `
      + `${state.meta?.priority === 'release' ? 'RELEASE  ' : ''}${(state.meta?.command ?? `pid ${ticketPid(state.name)} (older copy)`).slice(0, 110)}`);
  }
  let lines = [];
  for (const file of [`${DEFAULT_LOG_FILE}.1`, DEFAULT_LOG_FILE]) {
    try { lines = lines.concat(readFileSync(file, 'utf8').split('\n').filter(Boolean)); } catch { /* none */ }
  }
  const stats = summarizeHoldLog(lines, { hours });
  const fmt = (value) => value === null ? '—' : `${value.toFixed(1)} min`;
  console.log(`last ${hours} h: ${stats.holds} holds (${stats.perHour.toFixed(2)}/h), ${stats.reaped} reaped; held median ${fmt(stats.heldMedianMin)}, `
    + `p90 ${fmt(stats.heldP90Min)}; waited median ${fmt(stats.waitedMedianMin)}; warmed while queued ${stats.warmedHolds} (median ${fmt(stats.warmMedianMin)})`);
}
