#!/usr/bin/env node
// Heavy CPU work started outside the capture lock waits while a TIMING hold runs. First-party tooling: Kevin B. Liu.
//
//   node tools/timing-gate.mjs -- <command> [args...]   wait, then run the command (its exit code and signals pass through)
//   node tools/timing-gate.mjs                          wait only (npm run build's prebuild)
//   import { waitForTimingHold } from './timing-gate.mjs'   the same wait inside a heavy entry point
//
// 277 (Main 11-24): a paired timing run cancels only the load both of its arms see, so a test:lane tanks tier and a vite
// build started beside garage's timing9 hold spoiled its phone numbers. A live holder of class timing, or an older copy's
// classless exclusive hold, makes the caller wait; the gate reads the lock's owner token again every 60 s. A render group,
// a free lock and a dead holder's token pass at once, and so does work inside its own timing hold (the holder is an
// ancestor of this process: a regen or world suite run under with-capture-lock.mjs --lock-class=timing).
// COT_TIMING_GATE=off passes too, and says so (a deliberate bypass, never a default).
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ancestorOf, CAPTURE_LOCK_DIR } from './capture-lock.mjs';

export const TIMING_GATE_INTERVAL_MS = 60_000;

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

/** The owner token of the lock at `lockDir`, or null (free, mid-creation, torn). */
function readOwnerToken(lockDir) {
  try {
    const token = JSON.parse(readFileSync(join(lockDir, 'owner.json'), 'utf8'));
    return token && Number.isSafeInteger(token.pid) && token.pid > 0 ? token : null;
  } catch { return null; }
}

/**
 * The hold that blocks heavy work now: { pid, lockClass, command, startedAt } or null. A render group (token.group or
 * class render) never blocks; a token with no class is an older copy's exclusive hold and blocks like timing.
 */
export function timingHolder({ readToken = () => readOwnerToken(CAPTURE_LOCK_DIR), alive = pidAlive,
  isAncestor = (pid) => ancestorOf([pid]) === pid } = {}) {
  const token = readToken();
  if (!token) return null;
  if (token.group || token.lockClass === 'render') return null;
  if (token.lockClass && token.lockClass !== 'timing') return null;
  if (!alive(token.pid) || isAncestor(token.pid)) return null;
  return { pid: token.pid, lockClass: token.lockClass ?? 'exclusive', command: String(token.command ?? '?'), startedAt: token.startedAt ?? null };
}

/** Wait while timingHolder() names a hold; resolves to the minutes waited (0 when it passed at once). */
export async function waitForTimingHold({ label = 'heavy work', env = process.env, holder = timingHolder, intervalMs = TIMING_GATE_INTERVAL_MS,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)), log = (line) => process.stderr.write(`${line}\n`), now = () => Date.now() } = {}) {
  if (env.COT_TIMING_GATE === 'off') { log(`[timing-gate] COT_TIMING_GATE=off: ${label} starts without checking for a timing hold`); return 0; }
  const start = now();
  let last = null;
  for (let held = holder(); held; held = holder()) {
    if (held.pid !== last) log(`[timing-gate] ${label} waits: a ${held.lockClass} hold (pid ${held.pid}, since ${held.startedAt ?? '?'}): ${held.command.slice(0, 120)}`);
    last = held.pid;
    await sleep(intervalMs);
  }
  const minutes = (now() - start) / 60_000;
  if (last !== null) log(`[timing-gate] the timing hold ended after ${minutes.toFixed(1)} min; ${label} starts`);
  return minutes;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const at = process.argv.indexOf('--');
  const command = at === -1 ? [] : process.argv.slice(at + 1);
  await waitForTimingHold({ label: command.length ? command.join(' ').slice(0, 80) : (process.env.npm_lifecycle_event ?? 'heavy work') });
  if (command.length) {
    const child = spawn(command[0], command.slice(1), { stdio: 'inherit' });
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
    child.on('error', (error) => { process.stderr.write(`[timing-gate] ${command[0]}: ${error.message}\n`); process.exit(127); });
    child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 128 + ({ SIGINT: 2, SIGTERM: 15, SIGHUP: 1 }[signal] ?? 1) : 1); });
  }
}
