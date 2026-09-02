// Pure garage ordering helpers. Kept separate from garage.ts so the ordering
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

interface GarageSelectionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface GarageCountrySelectionMemory<Spec extends GarageOrderSpec> {
  preferredSpec(countryId: string): Spec | undefined;
  remember(specId: string): boolean;
}

// Owner-directed leading runs at the left edge of each national fleet. These
// are the previous right-edge showcases in reverse, matching the Garage's new
// high-to-low presentation while preserving the intended hero progression.
export const GARAGE_LEADING_VEHICLE_IDS_BY_NATION = Object.freeze({
  USA: Object.freeze([
    'm1a3',
    'm1a2_tusk',
    'm551a1_tts',
    'm3a3_bradley',
  ]),
  Japan: Object.freeze([
    'type10b',
    'type10',
    'type89_light_tiger',
  ]),
  Sweden: Object.freeze([
    'strv122',
    'strv103',
    'cv90_mkiv',
  ]),
  Germany: Object.freeze([
    'kf51b',
    'kf51',
    'leo2a7v',
    'leo2a5_a5nl',
    'leo2a5',
    'leo2a6m',
    'mbt70',
    'leo2_revolution',
    'spz_puma_s1',
  ]),
});

/** Flat view for checks and consumers that only need the complete set. */
export const GARAGE_LEADING_VEHICLE_IDS = Object.freeze(
  Object.values(GARAGE_LEADING_VEHICLE_IDS_BY_NATION).flat(),
);

const GARAGE_LEADING_VEHICLE_RANK_BY_NATION = new Map(
  Object.entries(GARAGE_LEADING_VEHICLE_IDS_BY_NATION).map(([nation, ids]) => [
    nation,
    new Map(ids.map((id, rank) => [id, rank])),
  ]),
);

/**
 * Order cards inside one catalog group by country, descending gameplay tier,
 * then descending display name. Owner-directed leading runs refine the order
 * within a tier, never allowing a lower-tier vehicle to precede a higher-tier
 * one. The id tie-break keeps duplicate public names deterministic.
 */
export function compareCountryThenTierThenName<Spec extends GarageOrderSpec>(
  a: Spec,
  b: Spec,
  nationRank: ReadonlyMap<string, number>,
  tierOf: (id: string) => number,
): number {
  const nationDelta = (nationRank.get(a.nation) ?? 99) - (nationRank.get(b.nation) ?? 99);
  if (nationDelta) return nationDelta;
  const tierDelta = tierOf(b.id) - tierOf(a.id);
  if (tierDelta) return tierDelta;
  const leadingRanks = GARAGE_LEADING_VEHICLE_RANK_BY_NATION.get(a.nation);
  const aLeadingRank = leadingRanks?.get(a.id);
  const bLeadingRank = leadingRanks?.get(b.id);
  if (aLeadingRank != null || bLeadingRank != null) {
    if (aLeadingRank == null) return 1;
    if (bLeadingRank == null) return -1;
    return aLeadingRank - bLeadingRank;
  }
  const nameDelta = NAME_COLLATOR.compare(String(b.name || ''), String(a.name || ''));
  if (nameDelta) return nameDelta;
  return NAME_COLLATOR.compare(String(b.id || ''), String(a.id || ''));
}

/** Per-country vehicle memory. Stale, malformed and cross-country stored ids
 * are ignored, so each nation safely falls back to its leftmost sorted card. */
export function createGarageCountrySelectionMemory<Spec extends GarageOrderSpec>(
  specs: readonly Spec[],
  countryCodeOf: (spec: Spec) => string,
  {
    storageKey = 'cot.garage.nationTank.v1',
    getStorage = () => globalThis.localStorage,
  }: {
    readonly storageKey?: string;
    readonly getStorage?: () => GarageSelectionStorage;
  } = {},
): GarageCountrySelectionMemory<Spec> {
  const visibleById = new Map(specs.map((spec) => [spec.id, spec]));
  const rememberedByCountry = new Map<string, string>();

  try {
    const raw = getStorage().getItem(storageKey);
    const stored = raw ? JSON.parse(raw) : null;
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      for (const [countryId, specId] of Object.entries(stored)) {
        const spec = typeof specId === 'string' ? visibleById.get(specId) : undefined;
        if (spec && countryCodeOf(spec) === countryId) rememberedByCountry.set(countryId, spec.id);
      }
    }
  } catch {
    // Storage can be unavailable or contain legacy/corrupt data. The in-page
    // map still remembers deliberate selections for the current session.
  }

  const persist = (): void => {
    try {
      getStorage().setItem(storageKey, JSON.stringify(Object.fromEntries(rememberedByCountry)));
    } catch {
      // Selection remains valid in memory when storage is restricted.
    }
  };

  return {
    preferredSpec(countryId) {
      const remembered = visibleById.get(rememberedByCountry.get(countryId) || '');
      if (remembered && countryCodeOf(remembered) === countryId) return remembered;
      return specs.find((spec) => countryCodeOf(spec) === countryId);
    },
    remember(specId) {
      const spec = visibleById.get(specId);
      if (!spec) return false;
      const countryId = countryCodeOf(spec);
      if (!countryId) return false;
      rememberedByCountry.set(countryId, spec.id);
      persist();
      return true;
    },
  };
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
