#!/usr/bin/env node
// Run one command holding the shared capture lock on a normal ticket (round 2 U38): the shell form of the one hold wrapper
// (tools/capture-hold.mjs withCaptureHold, through tools/capture-command.mjs runCapturedCommand).
//   node tools/with-capture-lock.mjs [--lock-class=render|timing] [--wait-min=240] [--place=<job key>] [--label=<name>]
//     [--hold-cap-min=<minutes> --hold-cap-reason=<why>] -- <command> [args...]
// It replaces the lane-hold helpers kept outside the repository (fifo-hold.mjs, band-hold.mjs: take the FIFO, then run a
// probe under COT_LANE_HOLD=1) and the retired tools/tmp-lane-hold.mjs. The command runs with the hold's nested-hold token
// (capture-lock nestedEnv), so every tool under it that takes the lock itself nests in this one hold: several probe steps
// under one ticket. The class is --lock-class (else COT_SHOTS_LOCK_CLASS, else the command's script names, as for any
// acquire); --place keeps a killed run's queue place (capture-lock placeStamp). A signal stops the command (SIGTERM, then
// SIGKILL after 15 s) before the lock is released and exits 128 + n; a command can neither checkpoint nor stop part-way,
// so past the cap it is logged, not stopped (atCap 'keep'). Exit status: the command's; 2 for a usage error;
// LOCK_WAIT_TIMEOUT_EXIT (77) when the wait runs out (--wait-min, default 240).
// tools/media-r5/with-capture-lock.mjs is this command at the media lane's back-dated ticket.
import { pathToFileURL } from 'node:url';
import { runCapturedCommand } from './capture-command.mjs';
import { createCaptureLock, LOCK_WAIT_TIMEOUT_EXIT } from './capture-lock.mjs';

const USAGE = 'usage: node tools/with-capture-lock.mjs [--lock-class=render|timing] [--wait-min=240] [--place=<key>] [--label=<name>] '
  + '[--hold-cap-min=<n> --hold-cap-reason=<why>] -- <command> [args...]';

/** The command line: { command, args, lockClass, waitMin, place, label, holdCapMinutes, holdCapReason }; throws a usage
 *  error (`usage: true`). */
export function parseHoldArgs(argv) {
  const split = argv.indexOf('--');
  const head = split < 0 ? [] : argv.slice(0, split), tail = split < 0 ? [] : argv.slice(split + 1);
  const fail = (why) => { throw Object.assign(new Error(`${why}\n${USAGE}`), { usage: true }); };
  if (split < 0 || !tail.length) fail('with-capture-lock: no command after --');
  const options = { command: tail[0], args: tail.slice(1), lockClass: null, waitMin: 240, place: null, label: 'with-capture-lock',
    holdCapMinutes: null, holdCapReason: null };
  for (const arg of head) {
    const [flag, ...parts] = arg.split('=');
    const value = parts.join('=');
    if (flag === '--lock-class' && (value === 'render' || value === 'timing')) options.lockClass = value;
    else if (flag === '--wait-min' && Number(value) > 0) options.waitMin = Number(value);
    else if (flag === '--place' && /^[\w.:-]{1,120}$/.test(value)) options.place = value;
    else if (flag === '--label' && /^[\w.:-]{1,60}$/.test(value)) options.label = value;
    else if (flag === '--hold-cap-min' && Number(value) > 0) options.holdCapMinutes = Number(value);
    else if (flag === '--hold-cap-reason' && value.trim()) options.holdCapReason = value;
    else fail(`with-capture-lock: unknown or malformed option ${arg}`);
  }
  if (options.holdCapReason && options.holdCapMinutes === null) fail('with-capture-lock: --hold-cap-reason without --hold-cap-min');
  return options;
}

/**
 * Run `command` inside one capture hold (see the header); resolves with the exit status this tool exits with: the
 * command's, or LOCK_WAIT_TIMEOUT_EXIT when the wait ran out. `ticket` re-enters at a stamped place (capture-lock ticketAt).
 * `lock` and `log` are for a caller that holds a private lock (the receipt).
 */
export async function holdCommand({ command, args = [], lockClass = null, waitMin = 240, place = null, ticket = null, label = 'with-capture-lock',
  holdCapMinutes = null, holdCapReason = null }, { lock = createCaptureLock(), log = (line) => console.error(line), stdio = 'inherit' } = {}) {
  const clock = () => new Date().toTimeString().slice(0, 8);
  log(`[${label}] waiting for the capture lock ${clock()}: ${command} ${args.join(' ')}`.trimEnd());
  try {
    await runCapturedCommand(command, args, { stdio }, { lock, timeoutMs: waitMin * 60_000, lockClass, place, ticket, holdCapMinutes,
      holdCapReason, label, log });
    log(`[${label}] ${command} ended (exit 0), lock released ${clock()}`);
    return 0;
  } catch (error) {
    if (/cot-shots lock timeout/.test(String(error?.message))) {
      log(`[${label}] the capture lock was not free after ${waitMin} min: giving up`);
      return LOCK_WAIT_TIMEOUT_EXIT;
    }
    if (Number.isInteger(error?.status)) {
      log(`[${label}] ${command} ended (exit ${error.status}), lock released ${clock()}`);
      return error.status;
    }
    log(`[${label}] ${command}: ${error?.message ?? error}`);
    return error?.code === 'ENOENT' ? 127 : 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let parsed;
  try { parsed = parseHoldArgs(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exit(2); }
  process.exit(await holdCommand(parsed));
}
