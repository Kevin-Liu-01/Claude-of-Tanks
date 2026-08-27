/** Shared presentation contract for one-shot explosive reactive armor. */

export interface EraHitEvent {
  eraPlate?: string | null;
  kind?: string;
}

export interface EraVisual {
  stripEra?: (plateName: string) => void;
}

/** ERA activation is additive to the shell's final deeper armor result. */
export function isEraActivation(event: EraHitEvent | null | undefined): boolean {
  return typeof event?.eraPlate === 'string' && event.eraPlate.length > 0;
}

/** Remove the exact activated cassette cluster from the live tank visual. */
export function stripActivatedEra(
  event: EraHitEvent | null | undefined,
  visual: EraVisual | null | undefined,
): boolean {
  const plateName = event?.eraPlate;
  if (typeof plateName !== 'string' || plateName.length === 0 ||
      typeof visual?.stripEra !== 'function') return false;
  visual.stripEra(plateName);
  return true;
}
