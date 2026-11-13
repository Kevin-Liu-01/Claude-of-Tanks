#!/usr/bin/env node
// Run one command holding a session mutex (an agent scratchpad's probe.lock) with an owner record (2026-11-02 audit S4).
//   node tools/with-session-mutex.mjs "$SP/probe.lock" -- nice -n 19 node tools/map-view-probe.mjs --root=<worktree> ...
// It replaces the shell form `until mkdir "$SP/probe.lock"; do sleep 5; done; …; rmdir "$SP/probe.lock"`, whose bare
// directory had no owner: a killed agent left it held for good. This holds the mutex through capture-lock.mjs
// claimSessionMutex (an owner token with this process's pid and start time), waits while a live holder has it, reaps a
// dead holder's, forwards SIGINT/SIGTERM/SIGHUP to the command, releases the mutex when the command ends (or this
// process is signalled) and exits with the command's status. --wait-min=<minutes> (default 240) bounds the wait; a wait that
// runs out exits LOCK_WAIT_TIMEOUT_EXIT (77; it was 75, the selftest runner's STARVED, round 2 U39).
import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { resolve } from 'node:path';
import { claimSessionMutex, LOCK_WAIT_TIMEOUT_EXIT, reapDeadSessionMutex, releaseSessionMutex, sessionMutexState } from './capture-lock.mjs';

const argv = process.argv.slice(2);
const split = argv.indexOf('--');
const head = split < 0 ? argv : argv.slice(0, split), command = split < 0 ? [] : argv.slice(split + 1);
const dir = head.find((arg) => !arg.startsWith('--'));
const waitMin = Number(head.find((arg) => arg.startsWith('--wait-min='))?.slice(11) ?? 240);
if (!dir || !command.length || !(waitMin > 0)) {
  console.error('usage: node tools/with-session-mutex.mjs <mutex dir> [--wait-min=240] -- <command> [args...]');
  process.exit(2);
}
const mutex = resolve(dir);
const say = (line) => console.error(`[session-mutex] ${line}`);
const until = Date.now() + waitMin * 60_000;
let hold = null, noted = false;
while (!(hold = claimSessionMutex(mutex))) {
  if (reapDeadSessionMutex(mutex, { log: say })) continue;
  if (Date.now() > until) { say(`${mutex} still held after ${waitMin} min: giving up`); process.exit(LOCK_WAIT_TIMEOUT_EXIT); }
  if (!noted) {
    const state = sessionMutexState(mutex);
    say(`${mutex} is held (${state.state}${state.pid ? `, pid ${state.pid}` : ''}${state.why ? `: ${state.why}` : ''}); waiting`);
    noted = true;
  }
  await new Promise((done) => setTimeout(done, 2_000));
}
const child = spawn(command[0], command.slice(1), { stdio: 'inherit' });
const release = () => { const releasing = hold; hold = null; if (releasing) releaseSessionMutex(releasing, { log: say }); };
process.on('exit', release);
// a stop reaches the command, which runs in this process's group (a group kill ends both); a perl alarm (SIGALRM) would end
// this process without its exit handler and leave the command running unlocked, so it stops the command first (rc 142)
let alarmed = false;
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { try { child.kill(signal); } catch { /* gone */ } });
process.on('SIGALRM', () => { alarmed = true; try { child.kill('SIGTERM'); } catch { /* gone */ } });
child.once('error', (error) => { say(`${command[0]}: ${error.message}`); release(); process.exit(127); });
child.once('close', (code, signal) => {
  release();
  process.exit(alarmed ? 142 : code ?? 128 + (constants.signals[signal] ?? 15));
});
