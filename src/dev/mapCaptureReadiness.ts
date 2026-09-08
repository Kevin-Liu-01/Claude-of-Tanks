import type { SourcedTextureState } from '../world/sourcedTextureReceipt.ts';

export interface CaptureWorld {
  mapId: string;
  minimapTextureState: SourcedTextureState;
}

interface CaptureClock {
  schedule(callback: () => void, milliseconds: number): ReturnType<typeof setTimeout>;
  cancel(handle: ReturnType<typeof setTimeout>): void;
}

/** Explicit authoring only. Never called by production world activation or boot. */
export async function awaitMapCaptureReadiness(
  world: CaptureWorld,
  getActive: () => CaptureWorld | null,
  timeoutMs = 120_000,
  clock: CaptureClock = { schedule: setTimeout, cancel: clearTimeout },
): Promise<{ mapId: string; requested: number; applied: number }> {
  if (getActive() !== world) throw new Error(`capture map is stale: ${world.mapId}`);
  const state = world.minimapTextureState;
  if (!state?.promise) throw new Error(`missing texture readiness: ${world.mapId}`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      state.promise,
      new Promise<never>((_, reject) => {
        timer = clock.schedule(() => reject(new Error(`texture readiness timed out: ${world.mapId}`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clock.cancel(timer);
  }
  if (getActive() !== world) throw new Error(`capture map changed while loading: ${world.mapId}`);
  if (!state.settled || !state.results?.length) throw new Error(`incomplete texture receipt: ${world.mapId}`);
  const failures = state.results.filter((result) => !result.applied || result.failures.length);
  if (failures.length) {
    throw new Error(`sourced texture capture failed for ${world.mapId}: ` + failures.map(
      (result) => `${result.target}: ${result.failures.join('; ') || 'not applied'}`,
    ).join(' | '));
  }
  return { mapId: world.mapId, requested: state.results.length, applied: state.results.length };
}
