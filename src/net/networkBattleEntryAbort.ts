import type { RuntimeValue } from '../runtimeTypes.ts';
export const NETWORK_BATTLE_ENTRY_ABORTED = 'network_battle_entry_aborted';

export interface NetworkBattleEntryAbortError extends Error {
  code: typeof NETWORK_BATTLE_ENTRY_ABORTED;
}

function reasonMessage(signal: AbortSignal): string {
  const reason = signal.reason;
  if (reason instanceof Error && reason.message) return reason.message;
  if (typeof reason === 'string' && reason.trim()) return reason.trim();
  return 'Network battle entry was cancelled.';
}

export function createNetworkBattleEntryAbortError(
  signal: AbortSignal,
): NetworkBattleEntryAbortError {
  const error = new Error(reasonMessage(signal)) as NetworkBattleEntryAbortError;
  error.name = 'AbortError';
  error.code = NETWORK_BATTLE_ENTRY_ABORTED;
  return error;
}

export function throwIfNetworkBattleEntryAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createNetworkBattleEntryAbortError(signal);
}

export function isNetworkBattleEntryAbortError(
  error: RuntimeValue,
): error is NetworkBattleEntryAbortError {
  return !!error && typeof error === 'object'
    && 'code' in error
    && error.code === NETWORK_BATTLE_ENTRY_ABORTED;
}
