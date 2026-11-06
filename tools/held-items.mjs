// One owner of a held run's items (round 4 E10 and F12). A tool whose run outlasts the capture lock's 20-minute cap holds
// through openCaptureHold (tools/capture-hold.mjs) and works through items (ids, scenes, takes) with the hold's
// checkpoint() between them: past the cap with anyone waiting the checkpoint yields, and a hold that was stopped (the cap's
// grace ran out, a yield could not hold again, a signal) ends the run. Each such tool decided an item's end and the run's
// exit code by itself, and they disagreed: turret-parent-audit set exit 3 over a signal's 128 + n, marketing-shots/shoot
// exited 1 for a stop that only left scenes (and over a signal), and studio-example-videos rethrew the stop (exit 1,
// whatever the signal). The rules now live here:
// - runHeldItem(hold, item): the checkpoint, then the item: 'done' (it returned), 'failed' (it threw while the hold held)
//   or 'left' (the hold was stopped before it, or it threw once the stop came: its browser was stopped under it).
// - heldRunExitCode({ failed, left }): a code already set stands (the hold's signal owner sets 128 + n first), then 1 when
//   an item failed, 3 when items are left for the next run, else 0.
// frame-budget-probe's runProbeUnit and markUnitsLeft keep the same rules for the probe pair's units. Proof:
// tools/long-hold-users.selftest.mjs.

/** Why the hold was stopped, in one line. */
export const heldStopWhy = (signal) => String(signal?.reason?.message ?? signal?.reason ?? 'the capture hold was stopped').split('\n')[0];

/**
 * One item of a held run: `hold.checkpoint()` (the cap's cooperative yield comes between items), then `item(signal)`.
 * Resolves { outcome: 'done', value }, { outcome: 'failed', error } or { outcome: 'left', why, error? }. A checkpoint
 * that rejects while the hold is still unstopped (no yield began) rejects here.
 */
export async function runHeldItem(hold, item) {
  const { signal } = hold;
  // a yield that could not hold again rejects and has stopped the hold (capture-hold.mjs stopWith): left, as any stop
  try { await hold.checkpoint(); } catch (error) { if (!signal.aborted) throw error; }
  const left = (error) => ({ outcome: 'left', why: heldStopWhy(signal), ...(error === undefined ? {} : { error }) });
  if (signal.aborted) return left();
  try {
    return { outcome: 'done', value: await item(signal) };
  } catch (error) {
    return signal.aborted ? left(error) : { outcome: 'failed', error };
  }
}

/** The held run's exit code, set at its end and returned: a code already set stands (a signal's 128 + n), then 1 when an
 *  item failed, 3 when items are left for the next run, else 0. */
export function heldRunExitCode({ failed = false, left = false } = {}) {
  process.exitCode ||= failed ? 1 : left ? 3 : 0;
  return process.exitCode;
}
