// Pure garage ordering helpers. Kept separate from garage.js so the ordering
// contract can be verified in Node without importing browser-only flag assets.

const NAME_COLLATOR = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

/**
 * Order cards inside one catalog group by country, gameplay tier, then name.
 * The id tie-break keeps the result deterministic if two variants share a
 * public name. Rank/tier lookups are injected so this helper stays
 * browser-independent.
 */
export function compareCountryThenTierThenName(a, b, nationRank, tierOf) {
  const nationDelta = (nationRank.get(a.nation) ?? 99) - (nationRank.get(b.nation) ?? 99);
  if (nationDelta) return nationDelta;
  const tierDelta = tierOf(a.id) - tierOf(b.id);
  if (tierDelta) return tierDelta;
  const nameDelta = NAME_COLLATOR.compare(String(a.name || ''), String(b.name || ''));
  if (nameDelta) return nameDelta;
  return NAME_COLLATOR.compare(String(a.id || ''), String(b.id || ''));
}

/** Unique country groups in the same order as an already-sorted fleet. Era is
 * deliberately ignored: WWII, Cold War and modern vehicles share a flag. */
export function countryFilterGroups(specs, countryCodeOf) {
  const groups = [];
  const seen = new Set();
  for (const spec of specs) {
    const id = countryCodeOf(spec);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    groups.push({ id, representative: spec, count: specs.filter((item) => countryCodeOf(item) === id).length });
  }
  return groups;
}
