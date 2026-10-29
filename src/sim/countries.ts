/**
 * The fleet's countries (gameplay-modes-228, TEAM NATIONS): the one table the roster planner (sim/teamNations.ts), the
 * campaign, the arrangement pickers, the flags and the multiplayer bot planner read. Data only — no planner, no fleet
 * import — so the game's boot path (the garage's TEAMS control, the arrangement store) reads it without loading the
 * planner (round 2, the critic's E3: the planner rode the entry's imports into a boot chunk of its own).
 */

export type CountryId =
  | 'russia' | 'germany' | 'usa' | 'uk' | 'france' | 'china' | 'japan' | 'sweden' | 'israel' | 'poland' | 'italy'
  | 'south_korea' | 'ukraine' | 'canada' | 'denmark';

interface Country {
  readonly id: CountryId;
  /** Spec `nation` strings the fleet uses for this country. */
  readonly specNations: readonly string[];
  /** flag-icons code (ISO 3166-1 alpha-2). */
  readonly flag: string;
  /** The tree's one bloc notion (the tracer lineage): east = Russia and China, west = everyone else. */
  readonly bloc: 'east' | 'west';
}

const country = (id: CountryId, flag: string, bloc: 'east' | 'west', ...specNations: string[]): Country =>
  Object.freeze({ id, flag, bloc, specNations: Object.freeze(specNations) });

/** Every country the fleet fields, in the order the pickers list them. */
export const COUNTRIES: readonly Country[] = Object.freeze([
  country('russia', 'ru', 'east', 'Russia', 'USSR', 'USSR/Russia', 'RU'),
  country('germany', 'de', 'west', 'Germany'),
  country('usa', 'us', 'west', 'USA', 'US'),
  country('uk', 'gb', 'west', 'UK'),
  country('france', 'fr', 'west', 'France'),
  country('china', 'cn', 'east', 'China', 'CN'),
  country('japan', 'jp', 'west', 'Japan'),
  country('sweden', 'se', 'west', 'Sweden'),
  country('israel', 'il', 'west', 'Israel'),
  country('poland', 'pl', 'west', 'Poland'),
  country('italy', 'it', 'west', 'Italy'),
  country('south_korea', 'kr', 'west', 'South Korea'),
  country('ukraine', 'ua', 'west', 'Ukraine'),
  country('canada', 'ca', 'west', 'Canada'),
  // release 265: the Danish Army line (techTree/nations/denmark.ts)
  country('denmark', 'dk', 'west', 'Denmark'),
]);

const COUNTRY_BY_ID: ReadonlyMap<string, Country> = new Map(COUNTRIES.map((entry) => [entry.id, entry]));
const COUNTRY_BY_NATION: ReadonlyMap<string, Country> = new Map(COUNTRIES.flatMap((entry) => entry.specNations.map((nation) => [nation, entry] as const)));

/** The country a spec `nation` string belongs to, or null (a dev hull, a community entry). */
export function countryOfNation(nation: string | null | undefined): CountryId | null {
  return COUNTRY_BY_NATION.get(String(nation ?? ''))?.id ?? null;
}

/**
 * Vehicles a team seats under another country than their spec's design `nation` (round 2: the Leopard 2A4M CAN, a
 * Canadian Army hull whose spec names its German design, sat in German teams and Italy's German fill).
 */
const VEHICLE_COUNTRY: Readonly<Record<string, CountryId>> = Object.freeze({
  leo2a4m_can: 'canada',
});

/** The country a vehicle fights for on a team: its operator where VEHICLE_COUNTRY names one, else its spec nation's. */
export function countryOfVehicle(id: string | null | undefined, nation: string | null | undefined): CountryId | null {
  return (id && Object.prototype.hasOwnProperty.call(VEHICLE_COUNTRY, id) ? VEHICLE_COUNTRY[id]! : null) ?? countryOfNation(nation);
}

export function isCountryId(value: unknown): value is CountryId {
  return typeof value === 'string' && COUNTRY_BY_ID.has(value);
}

/** A country's flag-icons code ('xx' for none). */
export function countryFlag(id: string | null | undefined): string {
  return COUNTRY_BY_ID.get(String(id ?? ''))?.flag ?? 'xx';
}

export function countryBloc(id: string | null | undefined): 'east' | 'west' | null {
  return COUNTRY_BY_ID.get(String(id ?? ''))?.bloc ?? null;
}

/** A country's first spec `nation` string (its flag's key), or null. */
export function countryNation(id: string | null | undefined): string | null {
  return COUNTRY_BY_ID.get(String(id ?? ''))?.specNations[0] ?? null;
}

/**
 * A seated side's flags read off its vehicles (gameplay-modes-228 round 2, the critic's E10: a room's loading screen
 * showed no flags — the host's TEAM NATIONS record never leaves the host): the side's most common country (ties to the
 * first seated) as a spec nation for its flag, and the other countries present in order of count, first seat breaking
 * ties. Under MONO-NATION those are exactly the side's country and its printed fills; an empty side is null.
 */
export function sideFlags(vehicles: readonly { readonly id: string | null | undefined; readonly nation: string | null | undefined }[]):
  { readonly country: string | null; readonly fills: readonly string[] } {
  const counts = new Map<CountryId, { n: number; first: number }>();
  vehicles.forEach((vehicle, index) => {
    const id = countryOfVehicle(vehicle.id, vehicle.nation);
    if (!id) return;
    const seen = counts.get(id);
    if (seen) seen.n++; else counts.set(id, { n: 1, first: index });
  });
  const ranked = [...counts].sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first).map(([id]) => countryNation(id)!);
  return { country: ranked[0] ?? null, fills: ranked.slice(1) };
}

/**
 * Each country's closest allied countries, in order: the fills a short side draws from before it repeats a vehicle
 * (teamNations.selftest pins it). East fills only from east; west from west first.
 */
const allies = (...ids: CountryId[]): readonly CountryId[] => Object.freeze(ids);
export const COUNTRY_ALLIES: Readonly<Record<CountryId, readonly CountryId[]>> = Object.freeze({
  usa: allies('uk', 'germany', 'france', 'italy', 'poland', 'israel', 'japan', 'south_korea', 'sweden', 'denmark', 'ukraine', 'canada'),
  uk: allies('usa', 'germany', 'france', 'italy', 'poland', 'sweden', 'denmark', 'israel', 'japan', 'south_korea', 'ukraine', 'canada'),
  germany: allies('france', 'italy', 'poland', 'uk', 'usa', 'sweden', 'denmark', 'ukraine', 'israel', 'japan', 'south_korea', 'canada'),
  france: allies('germany', 'italy', 'uk', 'usa', 'poland', 'sweden', 'denmark', 'ukraine', 'israel', 'japan', 'south_korea', 'canada'),
  italy: allies('germany', 'france', 'uk', 'usa', 'poland', 'sweden', 'denmark', 'ukraine', 'israel', 'japan', 'south_korea', 'canada'),
  poland: allies('ukraine', 'germany', 'usa', 'uk', 'sweden', 'denmark', 'france', 'italy', 'israel', 'japan', 'south_korea', 'canada'),
  ukraine: allies('poland', 'uk', 'usa', 'germany', 'sweden', 'denmark', 'france', 'italy', 'israel', 'japan', 'south_korea', 'canada'),
  sweden: allies('denmark', 'germany', 'uk', 'poland', 'france', 'usa', 'italy', 'ukraine', 'israel', 'japan', 'south_korea', 'canada'),
  israel: allies('usa', 'uk', 'germany', 'france', 'italy', 'poland', 'sweden', 'denmark', 'ukraine', 'japan', 'south_korea', 'canada'),
  japan: allies('usa', 'south_korea', 'uk', 'france', 'germany', 'italy', 'poland', 'sweden', 'denmark', 'israel', 'ukraine', 'canada'),
  south_korea: allies('usa', 'japan', 'uk', 'germany', 'france', 'italy', 'poland', 'sweden', 'denmark', 'israel', 'ukraine', 'canada'),
  // one Canadian hull in the fleet: a Canadian side is its allies' first (the US and the UK), named in the notes
  canada: allies('usa', 'uk', 'france', 'germany', 'italy', 'poland', 'sweden', 'denmark', 'ukraine', 'israel', 'japan', 'south_korea'),
  // release 265: Denmark fills first from its Nordic neighbour, then its NATO allies
  denmark: allies('sweden', 'germany', 'uk', 'usa', 'poland', 'france', 'italy', 'ukraine', 'canada', 'israel', 'japan', 'south_korea'),
  russia: allies('china'),
  china: allies('russia'),
});

/** Eras a roster may draw from around the player's: contemporaries only, never WW2 against modern. */
export const ERA_NEIGHBOURS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  ww2: Object.freeze(['ww2']),
  'cold-war': Object.freeze(['cold-war', 'modern']),
  modern: Object.freeze(['modern', 'cold-war', 'next-generation']),
  'next-generation': Object.freeze(['next-generation', 'modern']),
});

/**
 * The country each campaign operation's formation is drawn from (gameplay-modes-228): the one table the solo campaign
 * (game/campaignOperations.ts builds its ladder from it) and the multiplayer bot planner (src/mp/room/roomBots.ts, which
 * the rooms Worker reaches and which may not import src/game) both read. The story fixes it under both TEAM NATIONS
 * values. (It lives here, not in a module of its own, so the game page loads no further chunk for it.)
 */
export const CAMPAIGN_OPERATION_COUNTRY: Readonly<Record<string, CountryId>> = Object.freeze({
  first_light: 'russia',
  iron_ridge: 'germany',
  steinburg: 'germany',
  tarkhan_steppe: 'russia',
  frontier_basin: 'china',
  delta_crossing: 'usa',
});

/** An operation's formation country, or null for a free sortie / an unknown id. */
export function campaignOperationCountry(operationId: string | null | undefined): CountryId | null {
  return operationId && Object.prototype.hasOwnProperty.call(CAMPAIGN_OPERATION_COUNTRY, operationId)
    ? CAMPAIGN_OPERATION_COUNTRY[operationId]! : null;
}
