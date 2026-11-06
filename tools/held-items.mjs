// One owner of a held run's items (round 4 E10 and F12). A tool whose run outlasts the capture lock's 20-minute cap holds
// through openCaptureHold (tools/capture-hold.mjs) and works through items (ids, scenes, takes) with the hold's
// checkpoint() between them: past the cap with anyone waiting the checkpoint yields, and a hold that was stopped (the cap's
// grace ran out, a yield could not hold again, a signal) ends the run. Each such tool decided an item's end and the run's
// exit code by itself, and they disagreed: turret-parent-audit set exit 3 over a signal's 128 + n, marketing-shots/shoot
// exited 1 for a stop that only left scenes (and over a signal), and studio-example-videos rethrew the stop (exit 1,
// whatever the signal). The rules now live here:
// - openHeldRun(options): the hold's open. A signal while the run waits in the queue rejects openCaptureHold: nothing ran,
//   so it says so, keeps the signal's 128 + n and resolves null (the tool returns). The rejection was uncaught (exit 1).
// - runHeldItem(hold, item): the checkpoint, then the item (heldItemOutcome): 'done' (it returned), 'failed' (it threw
//   while the hold held) or 'left' (the hold was stopped before it, or it threw once the stop came: its browser was
//   stopped under it).
// - heldRunExitCode({ failed, left }): a code already set stands (the hold's signal owner sets 128 + n first), except a
//   left run's 3, which a failure outranks; then 1 when an item failed, 3 when items are left for the next run, else 0.
// frame-budget-probe's probe units delegate here too (round 4 review): runProbeUnit is heldItemOutcome (its pair's hold
// has no checkpoint between units), probeStopWhy is heldStopWhy, markUnitsLeft and its callers' failure writers are
// heldRunExitCode. Those failure writers set 1 over a signal's 128 + n before. Proof: tools/long-hold-users.selftest.mjs
// (the three long hold users and these rules) and tools/probe-unit-stop.selftest.mjs (the probe units).
import { openCaptureHold } from './capture-hold.mjs';

/** Why the hold was stopped, in one line. */
export const heldStopWhy = (signal) => String(signal?.reason?.message ?? signal?.reason ?? 'the capture hold was stopped').split('\n')[0];

/**
 * The hold of a held run: openCaptureHold(options). A signal while the run waits in the queue (or as it is held, or once
 * the process is stopping) rejects the open with code CAPTURE_HOLD_SIGNAL: nothing ran, so the line says so, the exit
 * code stays the signal's 128 + n (heldRunExitCode) and this resolves null, for the caller to return. Any other rejection
 * (the wait ran out) is the caller's.
 */
export async function openHeldRun(options) {
  try {
    return await openCaptureHold(options);
  } catch (error) {
    if (error?.code !== 'CAPTURE_HOLD_SIGNAL') throw error;
    console.error(`[${options?.label ?? 'capture'}] ${String(error.message).split('\n')[0]} before the lock was held: nothing ran; run it again`);
    heldRunExitCode({ left: true });
    return null;
  }
}

/**
 * The end of one item under a hold's `signal`, with no checkpoint first (frame-budget-probe's runProbeUnit: its pair's
 * hold has none between units). `item(signal)` runs it. Resolves { outcome: 'done', value }, { outcome: 'failed', error }
 * or { outcome: 'left', why, error? }: left when the hold was stopped before it, or when it threw once the stop came.
 */
export async function heldItemOutcome(signal, item) {
  const left = (error) => ({ outcome: 'left', why: heldStopWhy(signal), ...(error === undefined ? {} : { error }) });
  if (signal?.aborted) return left();
  try {
    return { outcome: 'done', value: await item(signal) };
  } catch (error) {
    return signal?.aborted ? left(error) : { outcome: 'failed', error };
  }
}

/**
 * One item of a held run: `hold.checkpoint()` (the cap's cooperative yield comes between items), then `item(signal)`
 * (heldItemOutcome). A checkpoint that rejects while the hold is still unstopped (no yield began) rejects here.
 */
export async function runHeldItem(hold, item) {
  // a yield that could not hold again, or whose re-queue a signal withdrew, rejects and has stopped the hold
  // (capture-hold.mjs stopWith, or the signal owner): left, as any stop
  try { await hold.checkpoint(); } catch (error) { if (!hold.signal.aborted) throw error; }
  return heldItemOutcome(hold.signal, item);
}

/** The held run's exit code, set and returned: a code already set stands (a signal's 128 + n, a failure's 1), except a
 *  left run's 3, which a failure outranks; then 1 when an item failed, 3 when items are left for the next run, else 0. */
export function heldRunExitCode({ failed = false, left = false } = {}) {
  const set = Number(process.exitCode) || 0;
  if (!set) process.exitCode = failed ? 1 : left ? 3 : 0;
  else if (set === 3 && failed) process.exitCode = 1;
  return Number(process.exitCode);
}
