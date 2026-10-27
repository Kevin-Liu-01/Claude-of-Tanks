/**
 * What this page's simulation runs on (docs/RUST-KERNELS.md): the world kernels, or the TypeScript and why. A failed
 * load keeps its fallback to the TypeScript, but never silently. A solo battle's (game/soloBattleRuntime.ts) or a room
 * host's (mp/host/matchHost.ts, from its Worker's 'ready') status:
 * - sets globalThis.__SIM_KERNELS's mode, source and reason;
 * - on a fallback, sends one telemetry note a session (`kernels:<source>:<reason>`);
 * - in development, writes one console line. Production writes nothing to the console (the zero-warnings budget).
 *
 * An explicit opt-out ('off': ?simKernels=ts) is recorded on the page only.
 */
import { getEntryTelemetry } from '../entry/telemetry.ts';
import type { SimKernelsStatus } from './simKernelsStatus.ts';

type SimKernelsSource = 'solo' | 'host';

interface PageKernels {
  __SIM_KERNELS?: { mode?: string; source?: SimKernelsSource; reason?: string | null } & Record<string, unknown>;
}

let fallbackReported = false;

export function reportSimKernels(source: SimKernelsSource, status: SimKernelsStatus, detail?: unknown): void {
  const page = globalThis as PageKernels;
  // (a solo battle's report keeps its worlds and comparison: only the mode, source and reason are this report's)
  page.__SIM_KERNELS = { ...(page.__SIM_KERNELS ?? {}), mode: status.mode, source, reason: status.reason ?? null };
  if (status.mode !== 'ts' || status.reason === 'off' || fallbackReported) return;
  fallbackReported = true;
  if (typeof window === 'object' && typeof document === 'object') {
    try { getEntryTelemetry().send({ kind: 'sim_kernels', code: source, reason: status.reason ?? 'unknown' }); } catch { /* never the battle's */ }
  }
  if (import.meta.env?.DEV) console.info(`[simKernels] the ${source} runs on the TypeScript: ${status.reason ?? 'unknown'}`, detail ?? '');
}
