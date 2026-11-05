#!/usr/bin/env node
// Run one command holding the shared capture lock (tools/capture-lock.mjs), queued at the media lane's place
// (ticket stamp 1791397979999), released when the command ends or this process is signalled: for GPU work outside
// cinema.mjs, such as a HyperFrames film render (motion/rerender.zsh). The command gets the hold's nested-hold token
// (capture-lock.mjs nestedEnv, 2026-11-02 audit S4): a tool under it that takes the lock itself nests in this hold.
// The hold is capture-hold.mjs withCaptureHold's (2026-11-02 audit S4): a signal stops the command (SIGTERM, then SIGKILL
// after 15 s) before the lock is released, where a command that ignored the forwarded signal kept the lock for up to 6 h.
// Round 2 U38: it is tools/with-capture-lock.mjs (the shell form of the one hold wrapper) at that ticket, waiting up to 6 h
// (a wait that runs out exits 77, capture-lock LOCK_WAIT_TIMEOUT_EXIT); a film render can neither checkpoint nor stop
// part-way, so past the cap it is logged, not stopped.
//   node tools/media-r5/with-capture-lock.mjs <command> [args...]
import { ticketAt } from '../capture-lock.mjs';
import { holdCommand } from '../with-capture-lock.mjs';

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) throw Error('usage: with-capture-lock.mjs <command> [args...]');
process.exit(await holdCommand({ command: cmd, args, ticket: ticketAt(1791397979999), waitMin: 6 * 60, label: 'lock' },
  { log: (line) => console.log(line) }));
