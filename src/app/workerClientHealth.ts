/**
 * workerClientHealth.ts — the one failure policy of a page's worker client (2026-11-02 audit R6). Copyright © 2026
 * Kevin B. Liu.
 *
 * Every client of a private worker (the material painter, the decor planner, the sourced-texture composer, the
 * riding-parts prebuild) follows one pattern:
 *
 * - a job's deadline runs from its dispatch, the moment the worker takes it, never from when it was queued: a serial
 *   worker's queue is the client's to wait on, and a deadline that counted it failed a healthy worker on a loaded
 *   machine or after a laptop slept mid-bake;
 * - a failure is the deadline, the worker's `error`, its `messageerror` (a reply the page could not read) or a reply
 *   that does not answer its job; it closes the worker and settles every job it held with the client's fallback (the
 *   main-thread or in-line pass), and the next job starts a fresh worker;
 * - `MAX_CONSECUTIVE_WORKER_FAILURES` failures with no success between them leave the client unavailable for the
 *   document (every job takes the fallback at once); one success starts the count again.
 *
 * Before, one slow job (or one hung or unreadable reply) turned the worker off for the session, or waited forever.
 * DOM-free: this holds only the count; each client owns its worker, its timers and its fallback.
 */

export const MAX_CONSECUTIVE_WORKER_FAILURES = 3;

export type WorkerClientState = 'available' | 'unavailable';

export interface WorkerClientHealth {
  readonly state: WorkerClientState;
  /** Consecutive failures since the last success. */
  readonly failures: number;
  /** A job came back answered: the count starts again. */
  succeeded(): void;
  /** The worker failed: true while a fresh worker may still serve the next job, false once the client is unavailable. */
  failed(): boolean;
  /** Unavailable now, whatever the count (an explicit teardown). */
  close(): void;
}

export function createWorkerClientHealth(maxFailures = MAX_CONSECUTIVE_WORKER_FAILURES): WorkerClientHealth {
  if (!Number.isInteger(maxFailures) || maxFailures < 1) throw new RangeError(`max failures must be a positive integer, got ${maxFailures}`);
  let failures = 0;
  let closed = false;
  const state = (): WorkerClientState => (closed || failures >= maxFailures ? 'unavailable' : 'available');
  return {
    get state() { return state(); },
    get failures() { return failures; },
    succeeded() { if (!closed) failures = 0; },
    failed() { failures += 1; return state() === 'available'; },
    close() { closed = true; },
  };
}
