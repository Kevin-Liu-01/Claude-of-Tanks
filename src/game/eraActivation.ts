/** Shared presentation contract for one-shot explosive reactive armor. */

export interface EraHitEvent {
  eraPlate?: string | null;
  eraActivations?: readonly {
    plate: string;
    pos?: readonly number[];
    normal?: readonly number[];
  }[];
  kind?: string;
}

export interface EraVisual {
  stripEra?: (plateName: string) => void;
}

/** Canonical unique plate names, with legacy single-plate event support. */
export function activatedEraPlateNames(
  event: EraHitEvent | null | undefined,
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const activation of event?.eraActivations || []) {
    const plate = activation?.plate;
    if (typeof plate !== 'string' || plate.length === 0 || seen.has(plate)) continue;
    seen.add(plate);
    names.push(plate);
  }
  const legacy = event?.eraPlate;
  if (typeof legacy === 'string' && legacy.length > 0 && !seen.has(legacy)) names.push(legacy);
  return names;
}

/** ERA activation is additive to the shell's final deeper armor result. */
export function isEraActivation(event: EraHitEvent | null | undefined): boolean {
  return activatedEraPlateNames(event).length > 0;
}

/** Remove every exact cassette cluster activated along the shell path. */
export function stripActivatedEra(
  event: EraHitEvent | null | undefined,
  visual: EraVisual | null | undefined,
): boolean {
  const plates = activatedEraPlateNames(event);
  if (!plates.length || typeof visual?.stripEra !== 'function') return false;
  for (const plateName of plates) visual.stripEra(plateName);
  return plates.length > 0;
}
