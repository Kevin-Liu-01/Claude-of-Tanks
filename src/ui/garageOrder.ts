// Pure garage ordering helpers. Kept separate from garage.js so the ordering
// contract can be verified in Node without importing browser-only flag assets.

const NAME_COLLATOR = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

export interface GarageOrderSpec {
  readonly id: string;
  readonly name?: string;
  readonly nation: string;
}

export interface GarageMapChoice {
  readonly id: string;
}

export interface CountryFilterGroup<Spec> {
  readonly id: string;
  readonly representative: Spec;
  readonly count: number;
}

export interface HorizontalRailState {
  readonly maxScroll: number;
  readonly hasLeft: boolean;
  readonly hasRight: boolean;
}

/**
 * Order cards inside one catalog group by country, gameplay tier, then name.
 * The id tie-break keeps the result deterministic if two variants share a
 * public name. Rank/tier lookups are injected so this helper stays
 * browser-independent.
 */
export function compareCountryThenTierThenName<Spec extends GarageOrderSpec>(
  a: Spec,
  b: Spec,
  nationRank: ReadonlyMap<string, number>,
  tierOf: (id: string) => number,
): number {
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
export function countryFilterGroups<Spec>(
  specs: readonly Spec[],
  countryCodeOf: (spec: Spec) => string,
): CountryFilterGroup<Spec>[] {
  const groups: CountryFilterGroup<Spec>[] = [];
  const seen = new Set<string>();
  for (const spec of specs) {
    const id = countryCodeOf(spec);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    groups.push({ id, representative: spec, count: specs.filter((item) => countryCodeOf(item) === id).length });
  }
  return groups;
}

/** The garage is opt-out random: a concrete battlefield is used only after
 * the player deliberately selects one of its cards. Keep this policy pure so
 * createGarage callers cannot accidentally make the first catalog row the
 * silent default again. */
export function defaultGarageMapId(maps: readonly GarageMapChoice[] | null | undefined): string {
  const entries = Array.isArray(maps) ? maps : [];
  return entries.some((map) => map?.id === 'random')
    ? 'random'
    : (entries[0]?.id || 'random');
}

/** Pure overflow state for horizontally scrolling garage rails. Browser
 * scrollLeft can briefly overshoot on elastic-scroll engines, so clamp before
 * deriving the edge affordances. */
export function horizontalRailState(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
  epsilon = 2,
): HorizontalRailState {
  const maxScroll = Math.max(0, Number(scrollWidth) - Number(clientWidth));
  const position = Math.max(0, Math.min(maxScroll, Number(scrollLeft) || 0));
  return {
    maxScroll,
    hasLeft: maxScroll > 1 && position > epsilon,
    hasRight: maxScroll > 1 && position < maxScroll - epsilon,
  };
}

/** Convert either a mouse wheel or a two-axis trackpad gesture into one
 * horizontal rail delta. DOM_DELTA_LINE/PAGE values are normalized to pixels. */
export function horizontalRailWheelDelta(
  deltaX: number,
  deltaY: number,
  deltaMode = 0,
  pageWidth = 0,
): number {
  const dominant = Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : deltaY;
  const scale = deltaMode === 1 ? 20 : deltaMode === 2 ? Math.max(1, pageWidth) : 1;
  return dominant * scale;
}
