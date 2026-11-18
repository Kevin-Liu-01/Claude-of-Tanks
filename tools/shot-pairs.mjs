// shot-pairs.mjs — what the pair shot tools share: their capture hold's pair loop and their boot wait (gaps 274 S3/S4).
// The tools: tools/building-style-shots.mjs, tools/built-env-shots.mjs and tools/ground-surface-shots.mjs (release 270),
// each staging one (job, map) pair at a time inside one render-class hold.
//
// Each of them took the capture lock itself: acquire() with the first pair staged in its prepare, lock.checkpoint()
// between pairs, a close() helper, and SIGTERM/SIGINT/SIGHUP handlers of its own that exited 143. Those are the rules
// tools/capture-hold-census.selftest.mjs keeps in one place for every holder, so each tool was a listed exception. They
// hold through the one wrapper here (tools/capture-hold.mjs withCaptureHold), and this module decides, once for the
// three:
// - the hold: a render-class ticket that waits `waitHours` (keeping its queue `place` when given), the first pair staged
//   while it waits (`prepare`). The wrapper refreshes it, answers SIGTERM, SIGINT and SIGHUP (the process exits 128 + n)
//   and runs the tool's `teardown` (every browser of the run closed) before the release on every way out;
// - the cap: a checkpoint() before every pair, the first too, so the work counts as checkpointing from its start (a
//   work that has not called one is stopped at the cap at once). Past the 20-min cap while anyone waits, it yields
//   there, as the tools' lock.checkpoint did between pairs; `onYield` runs before the yield's release. A pair in flight
//   when the cap passes is given its budget and a minute (the grace, shotPairsHoldOptions) to reach that checkpoint; one
//   whose open and shoot together outlast that is stopped and left for the next run (the tools ran it on past the cap);
// - a pair: `open(pair, i)` (thaw the warm page, or boot and stage a fresh one), unbudgeted as before, then
//   `shoot(pair, { signal, index, started })` within its budget (`pairMinutes`), which the hold's stop also ends at once;
//   `started` is the pair's start, before its open, which its receipt's `ms` counts from. Its outcome is 'shot',
//   'timeout', 'stopped' or 'failed' (it threw: logged). `signal` aborts at every end but 'shot': a pair past its budget
//   never records (the tool checks it before writing its manifest). `settle(pair, outcome, i)` closes what the pair
//   leaves (its page) before the pair's line; `after(pair, outcome, i)` runs after it (a browser recycled). The pairs
//   array is read live: `settle` may push a retry onto it;
// - a stop (the cap's grace ran out) or a yield that did not hold again: the pairs left are counted failed and named for
//   the next run, which resumes from the manifests.
// The budget's timer is cleared once its pair ends (the tools raced a bare sleep, so the process outlived its last pair
// by up to `pairMinutes`). The lines are the tools' own: `[label] HH:MM:SS <job> <map> staged and shot in N s; k/n`,
// `... <job> <map> failed: <why>`, `... <job> <map> <outcome>` and `... yielded at the cap, held again after N min at the
// back`. tools/shot-pairs.selftest.mjs drives the loop on a stand-in lock and node:test's mock clock.
import { setBrowserGuardContext } from './browser-launch.mjs';
import { withCaptureHold } from './capture-hold.mjs';
import { BOOT_LOADED_EXPRESSION } from './game-readiness.mjs';

/** The page is ready to stage a pair: the boot latch's harness mirror (the readiness probe's own expression,
 *  tools/game-readiness.mjs), and the shot and debug hooks the tools stage through. One wait, one budget. */
export const SHOT_BOOT_EXPRESSION = `${BOOT_LOADED_EXPRESSION} && !!window.__SHOTS && !!window.__DEBUG`;

/** The seconds past a pair's budget that the cap's grace gives it to close its page and browser and reach the checkpoint. */
export const PAIR_CLOSE_S = 60;

/**
 * The hold's options for a run of pairs: a render-class ticket that waits `waitHours` for the lock; the grace of one
 * pair's budget and a minute, so a pair in flight when the cap passes finishes and yields at the next checkpoint (the
 * wrapper's 60 s would stop it); `place` keeps a queue place across runs.
 */
export function shotPairsHoldOptions({ waitHours, pairMinutes, place = null }) {
  if (!(Number.isFinite(waitHours) && waitHours > 0)) throw new TypeError(`shot-pairs: --wait-hours is a positive number of hours, not ${waitHours}`);
  if (!(Number.isFinite(pairMinutes) && pairMinutes > 0)) throw new TypeError(`shot-pairs: --pair-minutes is a positive number of minutes, not ${pairMinutes}`);
  return { lockClass: 'render', timeoutMs: waitHours * 3600 * 1000, graceSeconds: pairMinutes * 60 + PAIR_CLOSE_S, ...(place === null ? {} : { place }) };
}

const stamp = () => new Date().toISOString().slice(11, 19);
const named = (pair) => `${pair.job.name} ${pair.mapId}`;
const why = (value) => String(value?.message ?? value);

/**
 * Shoot `pairs` ({ job: { name }, mapId }, read live) in one capture hold (see above). Resolves { shot, failed }; a hold
 * that never held (its wait ran out, its prepare threw) rejects, as the tools' acquire did. `hold` is laid over the hold's
 * options (a receipt's stand-in lock).
 */
export async function runShotPairs({ pairs, label, waitHours, pairMinutes, place = null, prepare = null, open, shoot, settle = null,
  after = null, onYield = null, teardown, log = console.log, hold = {} }) {
  if (typeof open !== 'function' || typeof shoot !== 'function' || typeof teardown !== 'function') {
    throw new TypeError('runShotPairs needs open(), shoot() and teardown()');
  }
  const options = shotPairsHoldOptions({ waitHours, pairMinutes, place });
  const say = (line) => log(`[${label}] ${stamp()} ${line}`);
  const counts = { shot: 0, failed: 0 };
  setBrowserGuardContext({ hold: label });
  await withCaptureHold(async ({ signal, checkpoint }) => {
    // the hold's stop (the cap's grace ran out): it ends a pair's shoot at once, and the loop with it
    const stopped = new Promise((done) => {
      if (signal.aborted) done('stopped');
      else signal.addEventListener('abort', () => done('stopped'), { once: true });
    });
    const leave = (i, reason) => {
      const left = pairs.slice(i);
      counts.failed += left.length;
      say(`${reason}: ${left.length} pair(s) left for the next run (${left.map(named).join(', ')})`);
    };
    for (let i = 0; i < pairs.length; i++) {
      if (signal.aborted) { leave(i, `the hold was stopped (${why(signal.reason)})`); break; }
      let cp;
      try { cp = await checkpoint(); } catch (error) { leave(i, `the cap yield did not hold again (${why(error)})`); break; }
      if (cp?.yielded) say(`yielded at the cap, held again after ${((cp.waitedMs ?? 0) / 60000).toFixed(1)} min at the back`);
      if (signal.aborted) { leave(i, `the hold was stopped (${why(signal.reason)})`); break; }
      const pair = pairs[i];
      const started = Date.now();
      const ended = new AbortController();
      let outcome = 'failed', budget = null;
      try {
        await open(pair, i);
        if (signal.aborted) outcome = 'stopped';
        else {
          const shooting = Promise.resolve().then(() => shoot(pair, { signal: ended.signal, index: i, started })).then(() => 'shot');
          shooting.catch(() => {});
          const outOfBudget = new Promise((done) => { budget = setTimeout(() => done('timeout'), pairMinutes * 60_000); });
          outcome = await Promise.race([shooting, outOfBudget, stopped]);
        }
      } catch (error) {
        say(`${named(pair)} failed: ${why(error).slice(0, 200)}`);
      } finally {
        clearTimeout(budget);
        if (outcome !== 'shot') ended.abort(new Error(`${named(pair)} ${outcome}`));
        if (settle) await settle(pair, outcome, i);
      }
      if (outcome === 'shot') {
        counts.shot++;
        say(`${named(pair)} staged and shot in ${((Date.now() - started) / 1000).toFixed(1)} s; ${counts.shot}/${pairs.length}`);
      } else {
        counts.failed++;
        say(`${named(pair)} ${outcome}`);
      }
      if (after) await after(pair, outcome, i);
    }
  }, { label, log, ...options, prepare, teardown, onYield, ...hold });
  return counts;
}
