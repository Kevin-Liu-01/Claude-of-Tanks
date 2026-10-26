// The decor worker (UI-LOCKDOWN E, stage 2b pass 1, 2026-10-25): it plans each requested tank's decoration over a
// replica of its graph (decorPlanWire.ts planDecorRequest) and posts the plan back, its merged geometry handed over.
// One request at a time, in arrival order; a request that throws replies with its error, and the page plans that tank
// in-line.
import { decorPlanTransfer, planDecorRequest, type DecorPlanReply, type DecorPlanRequest } from './decorPlanWire.ts';

export interface DecorPlanMessage { readonly id: number; readonly request: DecorPlanRequest }
export type DecorPlanResult = { readonly id: number; readonly reply: DecorPlanReply | null } | { readonly id: number; readonly error: string };

interface DecorPlanWorkerScope {
  onmessage: ((event: MessageEvent<DecorPlanMessage>) => void) | null;
  postMessage(message: DecorPlanResult, transfer?: Transferable[]): void;
}
const workerScope = globalThis as typeof globalThis & DecorPlanWorkerScope;

workerScope.onmessage = (event) => {
  const { id, request } = event.data;
  try {
    const reply = planDecorRequest(request);
    workerScope.postMessage({ id, reply }, reply ? decorPlanTransfer(reply) : []);
  } catch (error) {
    workerScope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
