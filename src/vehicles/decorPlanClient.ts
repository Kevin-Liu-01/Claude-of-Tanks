// The page's side of the decor worker (UI-LOCKDOWN E, stage 2b pass 1, 2026-10-25): a stepped build's decoration plan
// (tankFactoryCore.ts DecorPlanner) is made in decorPlanWorker.ts over a replica of the tank, and this attaches nothing:
// it posts the request and rebuilds the reply's plan. The worker starts with the first request and serves every later
// one; a worker that fails to start or dies rejects what it holds, and those tanks plan in-line.
import type { DecorationAttachmentArgs, DecorPlan } from './decorations.ts';
import { decorPlanFrom, decorPlanRequest, type DecorPlanReply } from './decorPlanWire.ts';
import type { DecorPlanMessage, DecorPlanResult } from './decorPlanWorker.ts';

let worker: Worker | null = null;
let broken = false;
let nextId = 0;
const pending = new Map<number, { resolve(reply: DecorPlanReply | null): void; reject(error: Error): void }>();

function failAll(error: Error): void {
  broken = true;
  worker?.terminate();
  worker = null;
  for (const { reject } of pending.values()) reject(error);
  pending.clear();
}

function decorWorker(): Worker {
  if (worker) return worker;
  if (broken) throw new Error('decor worker unavailable');
  worker = new Worker(new URL('./decorPlanWorker.ts', import.meta.url), { type: 'module', name: 'cot-decor-plan' });
  worker.onmessage = (event: MessageEvent<DecorPlanResult>) => {
    const result = event.data, waiter = pending.get(result.id);
    if (!waiter) return;
    pending.delete(result.id);
    if ('error' in result) waiter.reject(new Error(result.error));
    else waiter.resolve(result.reply);
  };
  worker.onerror = (event) => failAll(new Error(`decor worker failed: ${event.message || 'error'}`));
  return worker;
}

/** Start the worker ahead of its first request (it loads the decoration's chunks in its own realm); never throws. */
export function startDecorWorker(): void {
  try { decorWorker(); } catch { /* the first plan reports it */ }
}

/** The decoration's plan for this tank, made off the main thread (null: the tank takes no decoration). */
export function planDecoration(args: DecorationAttachmentArgs): Promise<DecorPlan | null> {
  const { request, transfer } = decorPlanRequest(args);
  const id = ++nextId;
  return new Promise<DecorPlanReply | null>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const message: DecorPlanMessage = { id, request };
    try {
      decorWorker().postMessage(message, transfer);
    } catch (error) {
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  }).then((reply) => (reply ? decorPlanFrom(reply, args) : null));
}
