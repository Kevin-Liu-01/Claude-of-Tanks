/**
 * ERA cassettes travel as indices into the vehicle's spec-order ERA plate
 * list: every plate of `kind === 'era'` in hullPlates followed by
 * turretPlates, in authored order. Both sides own the same first-party spec,
 * so the mapping is deterministic and never crosses the wire as text.
 */
interface EraPlateLike { kind?: string; name?: string }
interface ArmorLike { hullPlates?: readonly EraPlateLike[] | null; turretPlates?: readonly EraPlateLike[] | null }

/** Spec-order ERA plate names (index -> name). */
export function eraPlateNames(armor: ArmorLike | null | undefined): string[] {
  const names: string[] = [];
  for (const plates of [armor?.hullPlates, armor?.turretPlates]) {
    for (const plate of plates || []) if (plate.kind === 'era') names.push(String(plate.name ?? ''));
  }
  return names;
}

/** Name -> first spec-order index (duplicate names share a cassette id, as the armor model does). */
export function eraPlateIndices(armor: ArmorLike | null | undefined): Map<string, number> {
  const indices = new Map<string, number>();
  eraPlateNames(armor).forEach((name, index) => { if (!indices.has(name)) indices.set(name, index); });
  return indices;
}
