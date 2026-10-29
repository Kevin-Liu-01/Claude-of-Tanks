// Pure garage ordering helpers. Kept separate from garage.ts so the ordering
// contract can be verified in Node without importing browser-only flag assets.

const NAME_COLLATOR = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

interface GarageOrderSpec {
  readonly id: string;
  readonly name?: string;
  readonly nation: string;
}

interface GarageMapChoice {
  readonly id: string;
}

interface CountryFilterGroup<Spec> {
  readonly id: string;
  readonly representative: Spec;
  readonly count: number;
}

interface HorizontalRailState {
  readonly maxScroll: number;
  readonly hasLeft: boolean;
  readonly hasRight: boolean;
}

interface GarageSelectionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface GarageCountrySelectionMemory<Spec extends GarageOrderSpec> {
  preferredSpec(countryId: string): Spec | undefined;
  remember(specId: string): boolean;
}

// Owner-directed leading runs; China, Poland and the Italian pair are
// explicitly featured across tiers. Stable IDs preserve saved selections.
export const GARAGE_LEADING_VEHICLE_IDS_BY_NATION = Object.freeze({
  USA: Object.freeze([
    'm1a3',
    'm1a2_abrams_sepv3',
    'm1a2_abrams_sepv2',
    'm1a2_abrams_tusk',
    'abramsx',
    'm551a1_tts',
    'm6_linebacker', 'griffin50mm', 'griffin_viper', 'm3a3_bradley',
  ]),
  Japan: Object.freeze([
    // owner 2026-10-22: "make this the first tannk u see in japannnn" (the Type 10 Kaitaku)
    'type10_dozer',
    'type10',
    'type10b',
    'raiju_ifv', 'type89',
    'type90',
  ]),
  Sweden: Object.freeze([
    'strv122',
    'cv90_mk4',
    'strv103b',
    'strv121',
    'cv90_mk4_concept', 'cv90', 'cv9040c',
  ]),
  Germany: Object.freeze([
    // owner 2026-09-16: "german tank order should be kf51_evo panther, leopard 2a7v, leopard 2 revolution,
    // leopard 2a6m, leopard 2a6, leopard 2a5m, leopard 2a5, kf51_evo evo, kf51-U, puma s1, mbt 70, and so on"
    'kf51_panther', 'leo2a7v', 'leo2_revolution', 'leo2a6m', 'leo2a6', 'leo2a5m', 'leo2a5',
    'kf41_lynx', 'kf51_evo', 'kf51_u', 'puma_s1', 'spz_wotan', 'marder2', 'mbt70', 'leo2_improved',
  ]),
  China: Object.freeze([
    'vt4a1', 'ztz99a2', 'ztz99a',
    't72b3_qilin', 't72b3m_kunlun', 't80u_yun',
    'type96b', 'type96_80_feng', 'type96_72m_lei', 'aft10',
    'ztz20', 'ztz20_prototype', 'ztz100', 'type100', 'ztz100_prototype', 'type96_72_long',
    'ztz99_longwei', 'ztz85_iii', 'type59',
  ]),
  // 2026-09-15 owner roster pass ("our x tanks are better models, i like featuring them
  // more"): the X studies lead their tier in every nation that has them; the four T-90 X
  // studies are tier X and open the Russian fleet.
  Russia: Object.freeze([
    't90m',
    't90sm',
    't90ms_tagil',
    't90a_burlak',
    't14_armata',
    't80u_bars_m', 't72b3m_bulat_m', 't72b3_bastion_m',
    'kurganets25',
    'bmp3m_dragun125',
    't90a_vladimir',
    't90a',
    'object695',
    'tos1a_tagil',
    'object148_proto', 't90ms_2011',
  ]),
  'USSR/Russia': Object.freeze([
    't90',
    't80u',
    't72bu',
    't72b_1987',
    't62mv1',
  ]),
  UK: Object.freeze([
    'challenger3',
    'warrior_tes_h', // VEH-11 (2026-10-13): the tier-X Warrior type follows the Challenger 3
    'challenger1_mk3',
    'chieftain_mk10',
    'chieftain5',
  ]),
  France: Object.freeze([
    'leclerc_xlr',
    'amx56',
    'amx40',
    'amx30b',
  ]),
  Israel: Object.freeze([
    'merkava3d',
    'merkava4',
  ]),
  Italy: Object.freeze([
    'c2_ariete',
    'c1_ariete',
  ]),
  'South Korea': Object.freeze([
    'k2_black_panther',
    'k1a1',
  ]),
  Poland: Object.freeze(['pl01_105', 'pl01']),
  Ukraine: Object.freeze([
    'ua_m1a2_abrams',
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

// Russia and USSR/Russia share one flag. Use the same table in both
// comparator directions: separate maps made mixed-generation sorting asymmetric.
const russianRanks = new Map([
  ...GARAGE_LEADING_VEHICLE_IDS_BY_NATION.Russia,
  ...GARAGE_LEADING_VEHICLE_IDS_BY_NATION['USSR/Russia'],
].map((id, rank) => [id, rank]));
GARAGE_LEADING_VEHICLE_RANK_BY_NATION.set('Russia', russianRanks);
GARAGE_LEADING_VEHICLE_RANK_BY_NATION.set('USSR/Russia', russianRanks);
GARAGE_LEADING_VEHICLE_RANK_BY_NATION.set('USSR', russianRanks);

function countryOrderKey(nation: string): string {
  return nation === 'USSR' || nation === 'USSR/Russia' ? 'Russia' : nation;
}

function compareFeaturedRun(a: GarageOrderSpec, b: GarageOrderSpec): number {
  if (!['Italy', 'China', 'Poland'].includes(a.nation)) return 0;
  const featured = GARAGE_LEADING_VEHICLE_RANK_BY_NATION.get(a.nation)!;
  return (featured.get(a.id) ?? featured.size) - (featured.get(b.id) ?? featured.size);
}

/**
 * Order cards inside one catalog group by country, descending gameplay tier,
 * then descending display name. Owner-directed leading runs refine the order
 * within a tier, apart from the explicit Chinese lineup, Polish PL-01s and
 * definitive Italian C2/C1 pair ahead of their remaining vehicles. The id tie-break keeps duplicate public names deterministic.
 */
export function compareCountryThenTierThenName<Spec extends GarageOrderSpec>(
  a: Spec,
  b: Spec,
  nationRank: ReadonlyMap<string, number>,
  tierOf: (id: string) => number,
): number {
  const nationDelta = (nationRank.get(a.nation) ?? 99) - (nationRank.get(b.nation) ?? 99);
  if (nationDelta) return nationDelta;
  const countryDelta = NAME_COLLATOR.compare(countryOrderKey(a.nation), countryOrderKey(b.nation));
  if (countryDelta) return countryDelta;
  const featuredLead = compareFeaturedRun(a, b);
  if (featuredLead) return featuredLead;
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

/**
 * The national strip to show after a roster filter change (garageFacetPanel.ts): the current nation while it
 * still has a matching vehicle, otherwise the first nation in rail order that has one; null when nothing matches.
 */
export function facetFilteredCountry(
  current: string,
  countryOrder: readonly string[],
  hasMatch: (countryId: string) => boolean,
): string | null {
  if (hasMatch(current)) return current;
  return countryOrder.find(hasMatch) ?? null;
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

/** The extra end padding that lets a snapping rail's last stop rest on an item's start like every other stop, so
 * the item before it never shows as a sliver at the start edge (owner 10-24). `stops` are the scroll offsets at which
 * each item meets the snap line; `maxScroll` is the rail's reach without the extra. */
export function horizontalRailEndPad(maxScroll: number, stops: readonly number[]): number {
  if (!(maxScroll > 1)) return 0;
  let next = Infinity;
  for (const stop of stops) if (stop >= maxScroll - 0.5 && stop < next) next = stop;
  return Number.isFinite(next) ? Math.max(0, Math.round((next - maxScroll) * 10) / 10) : 0;
}

/** The end padding a rail keeps: `next` differing from the `current` pad by under a pixel is the rail's own rounding (its
 * scrollWidth is whole pixels, the pad is not), and written back it flips the pad on every layout, each flip a resize
 * that measures the rail again (15 to 27 a second, all through a battle's entry, in the release-259 Garage). */
export function settledRailEndPad(current: number, next: number): number {
  return Math.abs(next - current) < 1 ? current : next;
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
