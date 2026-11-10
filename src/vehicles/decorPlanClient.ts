// The page's side of the decor worker (UI-LOCKDOWN E, stage 2b pass 1, 2026-10-25): a stepped build's decoration plan
// (tankFactoryCore.ts DecorPlanner) is made in decorPlanWorker.ts over a replica of the tank, and this attaches nothing:
// it posts the request and rebuilds the reply's plan. The worker starts with the first request and serves every later
// one; a worker that fails to start or dies rejects what it holds, and those tanks plan in-line.
// (2026-11-02 audit R6) the worker-client pattern (src/workerClientHealth.ts): the worker plans one request at a time in
// arrival order, so the oldest request held is its job, dispatched when it was posted to an idle worker or when the
// reply before it came back, and its deadline runs from then. A deadline, an error or a messageerror closes the worker
// and rejects what it held (those tanks plan in-line: a build's wait always settles, where a hung or unreadable reply
// stalled that build and every stepped build queued behind it); the next request starts a fresh worker, and three
// failures in a row leave every later tank in-line.
import type { DecorationAttachmentArgs, DecorPlan } from './decorations.ts';
import { decorPlanFrom, decorPlanRequest, type DecorPlanReply } from './decorPlanWire.ts';
import type { DecorPlanMessage, DecorPlanResult } from './decorPlanWorker.ts';
import { createWorkerClientHealth, type WorkerClientHealth } from '../workerClientHealth.ts';

/** A job's deadline from its dispatch; a plan takes tens of milliseconds, a slow phone a few hundred. */
export const DECOR_PLAN_DEADLINE_MS = 15_000;

interface DecorWorkerPort {
  onmessage: ((event: { data: DecorPlanResult }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
  onmessageerror: (() => void) | null;
  postMessage(message: DecorPlanMessage, transfer: Transferable[]): void;
  terminate(): void;
}

interface DecorPlanClientPorts {
  createWorker(): DecorWorkerPort;
  /** Run `callback` after `delayMs`; returns its cancel. */
  schedule(callback: () => void, delayMs: number): () => void;
}

interface DecorPlanClient {
  start(): void;
  plan(message: DecorPlanMessage['request'], transfer: Transferable[]): Promise<DecorPlanReply | null>;
  readonly health: WorkerClientHealth;
}

interface Waiter { resolve(reply: DecorPlanReply | null): void; reject(error: Error): void }

export function createDecorPlanClient(ports: DecorPlanClientPorts, deadlineMs = DECOR_PLAN_DEADLINE_MS): DecorPlanClient {
  const health = createWorkerClientHealth();
  const held = new Map<number, Waiter>(); // in posting order: the first is the worker's job
  let worker: DecorWorkerPort | null = null;
  let cancelDeadline: (() => void) | null = null;
  let nextId = 0;

  /** The worker took its next job (or has none): that job's deadline runs from now. */
  function dispatched(): void {
    cancelDeadline?.();
    cancelDeadline = held.size ? ports.schedule(() => fail(new Error('decor worker timed out')), deadlineMs) : null;
  }

  function fail(error: Error): void {
    health.failed();
    cancelDeadline?.(); cancelDeadline = null;
    const owned = worker; worker = null;
    if (owned) {
      owned.onmessage = owned.onerror = owned.onmessageerror = null;
      try { owned.terminate(); } catch { /* already gone */ }
    }
    const waiters = [...held.values()];
    held.clear();
    for (const { reject } of waiters) reject(error);
  }

  function acquire(): DecorWorkerPort {
    if (worker) return worker;
    if (health.state === 'unavailable') throw new Error('decor worker unavailable');
    const owned = ports.createWorker();
    worker = owned;
    owned.onmessage = (event) => {
      if (worker !== owned) return;
      const result = event.data, waiter = result ? held.get(result.id) : undefined;
      if (!waiter) return;
      held.delete(result.id);
      dispatched();
      if ('error' in result) waiter.reject(new Error(result.error));
      else { health.succeeded(); waiter.resolve(result.reply); }
    };
    owned.onerror = (event) => { if (worker === owned) fail(new Error(`decor worker failed: ${event?.message || 'error'}`)); };
    owned.onmessageerror = () => { if (worker === owned) fail(new Error('decor worker reply could not be read')); };
    return owned;
  }

  return {
    health,
    start() { try { acquire(); } catch { /* the first plan reports it */ } },
    plan(request, transfer) {
      const id = ++nextId;
      return new Promise<DecorPlanReply | null>((resolve, reject) => {
        try {
          const owned = acquire();
          const idle = held.size === 0;
          held.set(id, { resolve, reject });
          owned.postMessage({ id, request }, transfer);
          if (idle) dispatched();
        } catch (error) {
          held.delete(id);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
  };
}

let shared: DecorPlanClient | null = null;

function client(): DecorPlanClient {
  shared ??= createDecorPlanClient({
    createWorker: () => new Worker(new URL('./decorPlanWorker.ts', import.meta.url), { type: 'module', name: 'cot-decor-plan' }) as unknown as DecorWorkerPort,
    schedule: (callback, delayMs) => { const timer = setTimeout(callback, delayMs); return () => clearTimeout(timer); },
  });
  return shared;
}

/** Start the worker ahead of its first request (it loads the decoration's chunks in its own realm); never throws. */
export function startDecorWorker(): void {
  client().start();
}

/** The decoration's plan for this tank, made off the main thread (null: the tank takes no decoration). */
export function planDecoration(args: DecorationAttachmentArgs): Promise<DecorPlan | null> {
  const { request, transfer } = decorPlanRequest(args);
  return client().plan(request, transfer).then((reply) => (reply ? decorPlanFrom(reply, args) : null));
}
