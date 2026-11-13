// garageVariantReveal.ts — the Garage stage's variant reveal (2026-11-02 audit, 06-ui-3 #7). Copyright © 2026 Kevin B. Liu.
//
// A Garage switch keeps the whole previous scene up while the requested pack decodes and uploads offscreen, then hands
// over in one step. The stage used to apply the new podium and lamp tints (and name the new variant) at the request,
// over the old pack, for the whole decode, and kept that half-state after three failed reveals; its dispose did not stop
// a reveal in flight. This owner holds the reveal as a declared state: the requested variant is revealed whole (tints,
// scene mode, name) by one `reveal` call, a newer request or a dispose supersedes a reveal in flight, and a reveal that
// never became ready leaves the shown variant as it was. Pure: no three.js, no DOM, so the selftest drives it.

export type GarageVariantRevealPhase = 'shown' | 'revealing' | 'failed' | 'disposed';

export interface GarageVariantRevealState {
  readonly phase: GarageVariantRevealPhase;
  /** The variant the stage shows whole (null before the first reveal). */
  readonly shown: string | null;
  /** The variant last asked for. */
  readonly requested: string | null;
}

export interface GarageVariantReveal<Stats> {
  readonly state: GarageVariantRevealState;
  /** Ask for `variantId`. `readyStats` reveals it now (its pack, or Verdant's hall, is ready); null waits for the pack. */
  request(variantId: string, readyStats: Stats | null): void;
  /** Stop every reveal in flight; later requests do nothing. */
  dispose(): void;
}

export function createGarageVariantReveal<Stats extends { readonly ready: boolean }>({
  whenReady,
  reveal,
  fail,
  wait,
  attempts = 3,
  defer = (callback: () => void) => queueMicrotask(callback),
}: {
  /** The requested pack's readiness (a rejection counts as one failed attempt). */
  whenReady(): Promise<Stats>;
  /** The one handoff: tints, scene mode and the variant's name together. `attempt` is 0 for an immediate reveal. */
  reveal(variantId: string, stats: Stats, attempt: number): void;
  /** Every attempt failed: the shown variant stays whole, and the next request for this one tries again. */
  fail(variantId: string, error: string, attempts: number): void;
  /** The pause before attempt `attempt + 1`. */
  wait(attempt: number): Promise<void>;
  attempts?: number;
  defer?: (callback: () => void) => void;
}): GarageVariantReveal<Stats> {
  let phase: GarageVariantRevealPhase = 'shown';
  let shown: string | null = null;
  let requested: string | null = null;
  let generation = 0;

  const show = (variantId: string, stats: Stats, attempt: number): void => {
    phase = 'shown';
    shown = variantId;
    reveal(variantId, stats, attempt);
  };

  const run = async (current: number, variantId: string): Promise<void> => {
    let lastError = '';
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const stats = await whenReady();
        if (current !== generation) return;
        if (stats.ready) { show(variantId, stats, attempt + 1); return; }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      if (current !== generation) return;
      if (attempt + 1 < attempts) await wait(attempt);
      if (current !== generation) return;
    }
    phase = 'failed';
    fail(variantId, lastError || 'environment did not become ready', attempts);
  };

  return {
    get state() { return { phase, shown, requested }; },
    request(variantId, readyStats) {
      if (phase === 'disposed') return;
      const current = ++generation;
      requested = variantId;
      if (readyStats) { show(variantId, readyStats, 0); return; }
      phase = 'revealing';
      defer(() => {
        if (current !== generation) return;
        void run(current, variantId);
      });
    },
    dispose() {
      phase = 'disposed';
      generation += 1;
    },
  };
}
