#!/usr/bin/env node
// Shared FIFO lock for GPU/browser capture harnesses. Keeping one owner avoids
// copy drift between screenshot, audio, Studio, and marketing verification.

import {
  mkdirSync,
  readdirSync,
  rmdirSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const DEFAULT_LOCK_DIR = '/tmp/cot-shots.lock';
const DEFAULT_QUEUE_DIR = '/tmp/cot-shots.queue';
const DEFAULT_LOCK_STALE_MS = 5 * 60 * 1000;
const DEFAULT_TICKET_STALE_MS = 60 * 60 * 1000;

function ticketPid(name) {
  const match = name.match(/-(\d+)\.t$/);
  return match ? parseInt(match[1], 10) : -1;
}

function ticketAlive(name) {
  const pid = ticketPid(name);
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
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

function claimLock(lockDir) {
  try {
    mkdirSync(lockDir);
    return true;
  } catch {
    return false;
  }
}

function removeLockPath(lockDir) {
  try {
    rmdirSync(lockDir);
  } catch (error) {
    if (error.code === 'ENOTDIR') unlinkSync(lockDir);
    else throw error;
  }
}

function reapStaleLock(lockDir, staleMs) {
  let modifiedAt;
  try {
    modifiedAt = statSync(lockDir).mtimeMs;
  } catch (error) {
    return error.code === 'ENOENT';
  }
  if (Date.now() - modifiedAt <= staleMs) return false;
  try {
    removeLockPath(lockDir);
    return true;
  } catch {
    return false;
  }
}

export function createCaptureLock({
  lockDir = DEFAULT_LOCK_DIR,
  queueDir = DEFAULT_QUEUE_DIR,
  lockStaleMs = DEFAULT_LOCK_STALE_MS,
  ticketStaleMs = DEFAULT_TICKET_STALE_MS,
} = {}) {
  let held = false;

  async function acquire(timeoutMs = 10 * 60 * 1000) {
    mkdirSync(queueDir, { recursive: true });
    const ownTicket = `${String(Date.now()).padStart(15, '0')}-${process.pid}.t`;
    writeFileSync(join(queueDir, ownTicket), String(process.pid));
    const startedAt = Date.now();
    try {
      for (;;) {
        const head = queueHead(queueDir, readQueue(queueDir, ownTicket), ownTicket, ticketStaleMs);
        if (head === ownTicket && claimLock(lockDir)) {
          held = true;
          return;
        }
        if (head === ownTicket && reapStaleLock(lockDir, lockStaleMs)) continue;
        if (Date.now() - startedAt > timeoutMs) throw new Error('cot-shots lock timeout');
        await new Promise((resolve) => setTimeout(resolve, head === ownTicket ? 300 : 1000));
      }
    } finally {
      try { unlinkSync(join(queueDir, ownTicket)); } catch { /* already removed */ }
    }
  }

  function refresh() {
    if (!held) return;
    try {
      const now = new Date();
      utimesSync(lockDir, now, now);
    } catch { /* already released */ }
  }

  function release() {
    if (!held) return;
    held = false;
    try { rmdirSync(lockDir); } catch { /* already released */ }
  }

  return { acquire, refresh, release };
}

const sharedCaptureLock = createCaptureLock();

export const acquireCaptureLock = sharedCaptureLock.acquire;
export const refreshCaptureLock = sharedCaptureLock.refresh;
export const releaseCaptureLock = sharedCaptureLock.release;
