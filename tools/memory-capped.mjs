#!/usr/bin/env node
// Run one command with a resident-memory cap (replay-system-275, 2026-11-22: an unbounded receipt reached 14 GiB and pushed
// the Mac into 43 GB of swap). Polls the child's resident set by its own PID every 200 ms (`ps -o rss=`), stops that PID
// past the cap (SIGTERM, then SIGKILL), and prints the peak. --max-old-space-size bounds only the V8 heap; this bounds the
// process, typed arrays and buffers included. Children of the child are not counted (run one process).
//
//   node tools/memory-capped.mjs --cap-gib=2 -- node tools/replay-verify.mjs <file>
//
// Exit: the child's code; 137 when it was stopped at the cap.
import { execFileSync, spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const split = argv.indexOf('--');
const capArg = argv.slice(0, split).find((arg) => arg.startsWith('--cap-gib='));
if (split < 0 || !capArg || split === argv.length - 1) {
  console.error('usage: node tools/memory-capped.mjs --cap-gib=<GiB> -- <command> [args...]');
  process.exit(2);
}
const capKib = Number(capArg.slice(10)) * 1024 * 1024;
const [command, ...args] = argv.slice(split + 1);
const child = spawn(command, args, { stdio: 'inherit' });
let peakKib = 0, stopped = false;
const rssKib = (pid) => { try { return Number(execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' }).trim()) || 0; } catch { return 0; } };
const timer = setInterval(() => {
  const rss = rssKib(child.pid);
  peakKib = Math.max(peakKib, rss);
  if (rss > capKib && !stopped) {
    stopped = true;
    console.error(`[memory-capped] pid ${child.pid} at ${(rss / 1048576).toFixed(2)} GiB passed the cap ${(capKib / 1048576).toFixed(2)} GiB: stopping it`);
    child.kill('SIGTERM');
    setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 2000).unref();
  }
}, 200);
child.on('exit', (code, signal) => {
  clearInterval(timer);
  console.error(`[memory-capped] pid ${child.pid} peak resident ${(peakKib / 1048576).toFixed(2)} GiB (cap ${(capKib / 1048576).toFixed(2)} GiB)${stopped ? ', stopped at the cap' : ''}`);
  process.exit(stopped ? 137 : code ?? (signal ? 1 : 0));
});
