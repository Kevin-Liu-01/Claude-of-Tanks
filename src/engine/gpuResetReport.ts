/**
 * gpuResetReport.ts — one field record per graphics reset (mobile-gpu-reset-277; Kevin 2026-11-25: "on mobile, multiplayer
 * often just breaks, and the GPU fails and restarts when I try to enter a battle"). A desktop browser holding a phone
 * page's whole battle entry (about 300 MB of GPU allocations) never loses its context, so where a real phone gives out
 * can only come from the field: this sends, through the entry telemetry's error path (no new record kind, the beacon's
 * caps and opt-outs as they are), what the page was doing when the context went and whether it came back.
 *
 * At the loss it notes the snapshot (taken before the loss's own quality relief moves the preset); the recovery machine's
 * outcome settles it: `ready` (restored), `failed`, or `delayed` (still gone after the machine's deadline). One record per
 * loss, the code `gpu_reset:<phase>:<outcome>`, the message the rest, all words and numbers: no name, room or address.
 */

export type GpuResetOutcome = 'restored' | 'failed' | 'delayed';
type RecoveryNoticeState = 'waiting' | 'restoring' | 'delayed' | 'failed' | 'ready';

/** What the page was doing at the loss, read from its owners (main.ts). */
export interface GpuResetContext {
  /** The session's phase: 'garage', 'loading', 'battle', … */
  phase: string;
  /** The battle loader's progress, 0..100, while it covers the screen; null when it does not. */
  loaderPercent: number | null;
  /** 'solo' or 'network' for a battle or its entry; 'none' otherwise. */
  mode: string;
  /** Milliseconds since the current (or last) battle entry began; null before the first. */
  sinceEntryMs: number | null;
}

export interface GpuResetReportOptions {
  read(): GpuResetContext | null;
  preset(): string;
  tier(): string;
  /** The entry telemetry's error path: (stage, message, code). */
  report(stage: string, message: string, code: string): void;
  now(): number;
}

export interface GpuResetReport {
  /** The context is gone (before the loss's quality relief). */
  lost(): void;
  /** The recovery machine's notice: `ready`, `failed` and `delayed` settle the loss noted last. */
  notice(state: RecoveryNoticeState): void;
}

const word = (value: unknown, max = 24): string => String(value ?? '').replace(/[^A-Za-z0-9_.-]+/g, '-').slice(0, max) || 'none';

export function createGpuResetReport({ read, preset, tier, report, now }: GpuResetReportOptions): GpuResetReport {
  let losses = 0;
  let pending: { index: number; at: number; context: GpuResetContext | null; preset: string; tier: string } | null = null;

  const settle = (outcome: GpuResetOutcome): void => {
    if (!pending) return;
    const { index, at, context, preset: presetName, tier: tierName } = pending;
    pending = null;
    const phase = word(context?.phase);
    const loader = context && context.loaderPercent !== null ? String(Math.round(context.loaderPercent)) : 'none';
    const since = context && context.sinceEntryMs !== null ? String(Math.max(0, Math.round(context.sinceEntryMs))) : 'none';
    const message = `gpu reset ${index} phase=${phase} loader=${loader} preset=${word(presetName)} tier=${word(tierName)} `
      + `mode=${word(context?.mode)} sinceEntryMs=${since} back=${outcome} afterMs=${Math.max(0, Math.round(now() - at))}`;
    try { report('gpu-reset', message, `gpu_reset:${phase}:${outcome}`); } catch { /* the beacon never breaks recovery */ }
  };

  return {
    lost() {
      // a loss while the last one is still unsettled: that one never came back before this one
      if (pending) settle('delayed');
      losses += 1;
      let context: GpuResetContext | null = null;
      try { context = read(); } catch { /* the snapshot is best effort */ }
      let presetName = 'unknown', tierName = 'unknown';
      try { presetName = preset(); } catch { /* unknown */ }
      try { tierName = tier(); } catch { /* unknown */ }
      pending = { index: losses, at: now(), context, preset: presetName, tier: tierName };
    },
    notice(state) {
      if (state === 'ready') settle('restored');
      else if (state === 'failed') settle('failed');
      else if (state === 'delayed') settle('delayed');
    },
  };
}
