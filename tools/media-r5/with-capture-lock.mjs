#!/usr/bin/env node
// Run one command holding the shared capture lock (tools/capture-lock.mjs), queued at the media lane's place
// (ticket stamp 1791397979999), released when the command ends or this process is signalled: for GPU work outside
// cinema.mjs, such as a HyperFrames film render (motion/rerender.zsh). The command gets the hold's nested-hold token
// (capture-lock.mjs nestedEnv, 2026-11-02 audit S4): a tool under it that takes the lock itself nests in this hold.
// The hold is capture-hold.mjs withCaptureHold's (2026-11-02 audit S4): a signal stops the command (SIGTERM, then SIGKILL
// after 15 s) before the lock is released, where a command that ignored the forwarded signal kept the lock for up to 6 h.
//   node tools/media-r5/with-capture-lock.mjs <command> [args...]
import { spawn } from 'node:child_process';
import { withCaptureHold } from '../capture-hold.mjs';
import { createCaptureLock, ticketAt } from '../capture-lock.mjs';
const [cmd, ...args] = process.argv.slice(2);
if (!cmd) throw Error('usage: with-capture-lock.mjs <command> [args...]');
const lock = createCaptureLock();
const clock = () => new Date().toTimeString().slice(0, 8);
let child = null;
const stop = () => new Promise((done) => {
  if (!child?.pid || child.exitCode !== null || child.signalCode) { done(); return; }
  const kill = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, 15_000);
  child.once('close', () => { clearTimeout(kill); done(); });
  try { child.kill('SIGTERM'); } catch { clearTimeout(kill); done(); }
});
console.log(`[lock] waiting for the capture lock ${clock()}`);
const code = await withCaptureHold(async () => {
  console.log(`[lock] held ${clock()}: ${cmd} ${args.join(' ')}`);
  child = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...lock.nestedEnv() } });
  return new Promise((done) => {
    child.once('error', (error) => { console.error(`[lock] ${cmd}: ${error.message}`); done(127); });
    child.once('close', (status, signal) => { console.log(`[lock] ${cmd} ended (exit ${status ?? signal}) ${clock()}`); done(status ?? 1); });
  });
}, { label: 'with-capture-lock', lock, timeoutMs: 6 * 60 * 60 * 1000, ticket: ticketAt(1791397979999), command: [cmd, ...args].join(' '),
  // a film render can neither checkpoint nor stop part-way: past the cap it is logged, not stopped
  atCap: 'keep', log: () => {}, teardown: stop });
console.log(`[lock] released ${clock()}`);
process.exit(code);
