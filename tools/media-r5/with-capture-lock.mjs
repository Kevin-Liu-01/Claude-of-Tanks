#!/usr/bin/env node
// Run one command holding the shared capture lock (tools/capture-lock.mjs), queued at the media lane's place
// (ticket stamp 1791397979999), released when the command ends or this process is signalled: for GPU work outside
// cinema.mjs, such as a HyperFrames film render (motion/rerender.zsh).
//   node tools/media-r5/with-capture-lock.mjs <command> [args...]
import { spawn } from 'node:child_process';
import { createCaptureLock, ticketAt } from '../capture-lock.mjs';
const [cmd, ...args] = process.argv.slice(2);
if (!cmd) throw Error('usage: with-capture-lock.mjs <command> [args...]');
const lock = createCaptureLock();
console.log(`[lock] waiting for the capture lock ${new Date().toTimeString().slice(0, 8)}`);
await lock.acquire(6 * 60 * 60 * 1000, { ticket: ticketAt(1791397979999) });
console.log(`[lock] held ${new Date().toTimeString().slice(0, 8)}: ${cmd} ${args.join(' ')}`);
const child = spawn(cmd, args, { stdio: 'inherit' });
const stop = (signal) => { child.kill(signal); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
const refresh = setInterval(() => { try { lock.refresh?.(); } catch { /* the lock module refreshes on its own */ } }, 30000);
child.on('exit', (code, signal) => {
  clearInterval(refresh);
  lock.release();
  console.log(`[lock] released ${new Date().toTimeString().slice(0, 8)} (exit ${code ?? signal})`);
  process.exit(code ?? 1);
});
