// Compose an existing browser tool with the shared capture queue. The command runs with the hold's nested-hold token
// (capture-lock.mjs nestedEnv, 2026-11-02 audit S4): a tool that acquires the queue itself nests in this hold instead of
// queueing behind its own parent's live pid until its timeout. The hold is capture-hold.mjs withCaptureHold's (the one
// hold wrapper): refresh, signals and exit; a signal ends the command (SIGTERM, then SIGKILL after 15 s) before the lock
// is released. A command cannot yield, so past the cap it is logged, not stopped (atCap: 'keep').
import { spawn } from 'node:child_process';
import { withCaptureHold } from './capture-hold.mjs';
import { createCaptureLock } from './capture-lock.mjs';

export function runCommand(command, args, options = {}) {
  return startCommand(command, args, options).done;
}

/** Spawn `command`; { child, done }: `done` resolves on a zero exit and rejects otherwise (status on the error). */
function startCommand(command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(Object.assign(new Error(`${command} exited ${code ?? signal}`),{status:code ?? 128})); // tank-release-plan.selftest pins this text
    });
  });
  return { child, done };
}

/** Stop a child: SIGTERM, then SIGKILL past `graceMs`; resolves once it has closed (or at once if it already has). */
function stopChild(child, graceMs = 15_000) {
  if (!child || !child.pid || child.exitCode !== null || child.signalCode) return Promise.resolve(); // never started, or closed
  return new Promise((resolve) => {
    const kill = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, graceMs);
    child.once('close', () => { clearTimeout(kill); resolve(); });
    try { child.kill('SIGTERM'); } catch { clearTimeout(kill); resolve(); }
  });
}

export async function runCapturedCommand(command, args, options = {}, capture = {}) {
  const lock = capture.lock ?? createCaptureLock();
  let running = null;
  // the class (timing or render) comes from the command this runs, unless capture.lockClass names it
  return withCaptureHold(async ({ signal }) => {
    running = startCommand(command, args, { ...options, env: { ...(options.env ?? process.env), ...(lock.nestedEnv?.() ?? {}) } });
    signal.addEventListener('abort', () => { void stopChild(running.child); }, { once: true });
    await running.done;
  }, {
    label: 'capture-command', lock, timeoutMs: capture.timeoutMs ?? 45 * 60 * 1000, command: [command, ...args].join(' '),
    lockClass: capture.lockClass ?? null, refreshMs: capture.refreshMs ?? 30000, log: capture.log ?? (() => {}),
    // a wrapped command (a release-gate step) can neither checkpoint nor stop part-way: past the cap it is logged, not stopped
    atCap: 'keep',
    teardown: () => stopChild(running?.child),
  });
}
