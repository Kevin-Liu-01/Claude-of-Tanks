// The page's side of the decor worker (UI-LOCKDOWN E, stage 2b pass 1, 2026-10-25): a stepped build's decoration plan
// (tankFactoryCore.ts DecorPlanner) is made in decorPlanWorker.ts over a replica of the tank, and this attaches nothing:
// it posts the request and rebuilds the reply's plan. The worker starts with the first request and serves every later
// one; a worker that fails to start or dies rejects what it holds, and those tanks plan in-line.
// (improve-271, plan 038) Through src/workerCalls.ts: a worker silent past its deadline, or whose reply cannot be read,
// rejects what it holds too (the stepped build waits on nothing else); after it had answered, one fresh worker may start,
// and the next failure leaves every later tank to the in-line plan.
import type { DecorationAttachmentArgs, DecorPlan } from './decorations.ts';
import { decorPlanFrom, decorPlanRequest, type DecorPlanReply } from './decorPlanWire.ts';
import type { DecorPlanMessage, DecorPlanResult } from './decorPlanWorker.ts';
import { createWorkerCalls, type WorkerCalls, type WorkerCallTimers } from '../workerCalls.ts';

/** How long the worker may stay silent while it holds a plan (ms): the page's single-job workers' 15 s
 *  (materialPainterWorkerClient.ts), and twice that before its first answer, while it loads the decoration's chunks. */
const DECOR_SILENCE_MS = 15_000;
const DECOR_FIRST_SILENCE_MS = 30_000;

let calls: WorkerCalls<DecorPlanResult> | null = null;
let timers: WorkerCallTimers | undefined;
let nextId = 0;

function decorCalls(): WorkerCalls<DecorPlanResult> {
  calls ??= createWorkerCalls<DecorPlanResult>({
    name: 'decor worker',
    spawn: () => new Worker(new URL('./decorPlanWorker.ts', import.meta.url), { type: 'module', name: 'cot-decor-plan' }),
    idOf: (result) => result?.id,
    silenceMs: DECOR_SILENCE_MS,
    firstSilenceMs: DECOR_FIRST_SILENCE_MS,
    starts: 2,
    timers,
  });
  return calls;
}

/** Receipts: drop the client (its worker terminated, what it holds rejected) and start the next on this clock. */
export function resetDecorWorker(clock?: WorkerCallTimers): void {
  calls?.dispose(new Error('decor worker reset'));
  calls = null;
  timers = clock;
}

/** Start the worker ahead of its first request (it loads the decoration's chunks in its own realm); never throws. */
export function startDecorWorker(): void {
  decorCalls().warm();
}

/** The decoration's plan for this tank, made off the main thread (null: the tank takes no decoration). */
export function planDecoration(args: DecorationAttachmentArgs): Promise<DecorPlan | null> {
  const { request, transfer } = decorPlanRequest(args);
  const id = ++nextId;
  return new Promise<DecorPlanReply | null>((resolve, reject) => {
    const message: DecorPlanMessage = { id, request };
    const posted = decorCalls().post(id, message, transfer, {
      reply: (result) => {
        if ('error' in result) reject(new Error(result.error));
        else resolve(result.reply);
        return true;
      },
      fail: reject,
    });
    if (!posted) reject(new Error('decor worker unavailable'));
  }).then((reply) => (reply ? decorPlanFrom(reply, args) : null));
}
