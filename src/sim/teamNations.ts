/**
 * TEAM NATIONS (gameplay-modes-228; owner 2026-10-18: "make the allied/enemy tank country enforcement work properly",
 * and the same evening: "be able to select wehtehr we want team enemies to be mononation or just random").
 *
 * The country identity of the fleet (one table for the roster, the campaign, the flags and the tracers) and the pure
 * planner that fills each side of a battle from ONE country under MONO-NATION: the allies from the player's country,
 * the enemies from one opposing country chosen per match, every shortfall filled from the side's closest allied
 * countries and reported in `notes`, and the player's own pick always kept. RANDOM leaves the roster to the classic
 * era-ranked pool (game/rosterState.ts) and never reaches this planner. Node-runnable, DOM-free, no fleet import: the
 * solo battle hands it rows built from its pool, the rooms hand it the light generated index
 * (vehicles/nationIndex.generated.ts). Every draw is seeded by the caller's seed.
 */

import {
  COUNTRIES, COUNTRY_ALLIES, ERA_NEIGHBOURS, countryBloc, countryNation, inMatchTierBand, type CountryId,
} from './countries.ts';

export {
  COUNTRIES, COUNTRY_ALLIES, ERA_NEIGHBOURS, MATCH_TIER_SPREAD, campaignOperationCountry, countryBloc, countryFlag,
  countryOfNation, countryOfVehicle, inMatchTierBand, isCountryId, CAMPAIGN_OPERATION_COUNTRY, type CountryId,
} from './countries.ts';

/** One vehicle the planner may seat: its id, country, era and tier. */
export interface NationRow {
  readonly id: string;
  readonly country: CountryId | null;
  readonly era: string | null;
  readonly tier: number;
}

/** A fill the planner made, printed by the receipts and shown as a "+UK" chip on the deploy and loading screens. */
export interface NationNote {
  readonly side: 'alpha' | 'bravo';
  readonly country: CountryId | null;
  readonly count: number;
  /** ally: a closest-ally fill; repeat: a vehicle fielded twice, only once no distinct vehicle is left; far-era: outside
   * the era band or the side's country chain, still before any repeat; clash: the allied bots
   * gave way to the operation's country; humans: both sides' humans share a country (their picks are kept); budget:
   * the multiplayer profile budget repeats a side's vehicles. */
  readonly reason: 'ally' | 'repeat' | 'far-era' | 'clash' | 'humans' | 'budget';
}

interface NationalSeat {
  readonly id: string;
  /** The same vehicle again on this side (solo: a clone entity; multiplayer: a duplicate spec id, which is valid). */
  readonly repeat: boolean;
}

interface NationalSidesPlan {
  readonly allied: CountryId | null;
  readonly enemy: CountryId | null;
  /** Bot seats, the humans excluded, in seat order. */
  readonly allies: readonly NationalSeat[];
  readonly enemies: readonly NationalSeat[];
  readonly notes: readonly NationNote[];
}

interface NationalSidesInput {
  /** Candidate vehicles in preference order (seeded, recency-rotated; the humans' picks excluded or not, either way). */
  readonly rows: readonly NationRow[];
  /** The allied side's humans (solo: the player), seat order; their picks are kept and never replaced. */
  readonly alliedHumans: readonly NationRow[];
  /** The enemy side's humans (multiplayer). */
  readonly enemyHumans?: readonly NationRow[];
  readonly alliedSeats: number;
  readonly enemySeats: number;
  /** A campaign operation's country (the story fixes it), else the arranged enemy country, if any. */
  readonly campaignEnemy?: CountryId | null;
  readonly arrangedEnemy?: CountryId | null;
  readonly seed: number;
  /** The rival bloc's weight in the AUTO enemy draw. */
  readonly rivalBlocWeight: number;
  /** At most this many distinct bot vehicles per side (multiplayer's profile budget; null: none). */
  readonly distinctPerSide?: number | null;
  /** The AUTO enemy must fill its seats from contemporaries alone where some country can. */
  readonly autoNeedsContemporaries?: boolean;
  /** A side's country outranks the tier band (the wave modes' same-nation waves, owner 2026-09-17); otherwise the band
   * outranks the country, so a small nation's side fills from its allies in the band before its own far tiers. */
  readonly nationFirst?: boolean;
}

function seededUnit(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** A stable 32-bit hash of the parts (the solo AUTO seed: battle ordinal, roster seed, the player's vehicle). */
export function teamNationsSeed(...parts: readonly (string | number | null | undefined)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const text = String(part ?? '');
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= 0x2c; h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The majority country of some humans; a tie goes to the first human (the host, or the lowest seat). */
export function majorityCountry(humans: readonly NationRow[]): CountryId | null {
  const counts = new Map<CountryId, number>();
  for (const human of humans) if (human.country) counts.set(human.country, (counts.get(human.country) ?? 0) + 1);
  let best: CountryId | null = null, bestCount = 0;
  for (const human of humans) {
    if (!human.country) continue;
    const count = counts.get(human.country)!;
    if (count > bestCount) { best = human.country; bestCount = count; }
  }
  return best;
}

/**
 * Seat both sides under MONO-NATION. The rule (docs/GAME-MODES.md "Team nations"):
 * 1. the allied country A is the allied humans' (the player's) country; a pick with no country leaves A to AUTO;
 * 2. the enemy country E is the operation's (the allied bots give way to A's first ally when it equals A), else the
 *    arranged one if it is not A, else the enemy humans' majority if it is not A, else AUTO: a seeded draw over the
 *    countries that are not A nor among A's fills and can fill the enemy seats from contemporaries, the rival bloc
 *    weighted `rivalBlocWeight`;
 * 3. each side fills from its own country's contemporaries (the era band, own era first), then its closest allies'
 *    (COUNTRY_ALLIES, never a country the other side uses), the whole chain in the humans' tier band (MATCH_TIER_SPREAD)
 *    before its nearest tiers outside it (the wave modes, `nationFirst`: each country's band, then its other tiers,
 *    before the next country); then any other vehicle, far eras included; a vehicle repeats only
 *    when no distinct one is left (owner 2026-11-22, roster-mirror-fix: a WW2 T95 fielded seven T95s against seven
 *    KV-2s while 300 distinct hulls sat unused);
 * 4. every enemy seat takes the candidate whose tier is nearest the matching allied seat's (the humans' included);
 * 5. the humans keep their picks; each fill is a note.
 */
export function pickNationalSides(input: NationalSidesInput): NationalSidesPlan {
  const notes: NationNote[] = [];
  const humans = input.alliedHumans;
  const enemyHumans = input.enemyHumans ?? [];
  const leadEra = humans.find((h) => h.era)?.era ?? enemyHumans.find((h) => h.era)?.era ?? 'modern';
  const band = ERA_NEIGHBOURS[leadEra] ?? [leadEra];
  // the battle's tier band: both sides' humans' mean tier (no humans: no band)
  const humanTiers = [...humans, ...enemyHumans].map((h) => h.tier).filter((t) => Number.isFinite(t) && t > 0);
  const anchor = humanTiers.length ? Math.round(humanTiers.reduce((a, b) => a + b, 0) / humanTiers.length) : null;
  const inBand = (row: NationRow): boolean => inMatchTierBand(row.tier, anchor);
  const rank = new Map<string, number>();
  input.rows.forEach((row, index) => { if (!rank.has(row.id)) rank.set(row.id, index); });
  const unique = input.rows.filter((row, index) => rank.get(row.id) === index);
  const rowById = new Map(unique.map((row) => [row.id, row]));
  const contemporaries = (c: CountryId): NationRow[] => {
    const own = unique.filter((row) => row.country === c && row.era === leadEra);
    const near = unique.filter((row) => row.country === c && row.era !== leadEra && band.includes(row.era ?? ''));
    return [...own, ...near];
  };
  const rng = seededUnit(input.seed);
  const alliedSeats = Math.max(0, Math.floor(input.alliedSeats));
  const enemySeats = Math.max(0, Math.floor(input.enemySeats));

  // 1. the allied country
  let allied: CountryId | null = majorityCountry(humans);
  const autoCountry = (exclude: ReadonlySet<CountryId>, seats: number, rival: CountryId | null): CountryId | null => {
    // a country that fills the seats from contemporaries in the battle's tier band (the wave modes: any tier, so their
    // armies rotate), else from contemporaries at all
    const open = COUNTRIES.filter((c) => !exclude.has(c.id));
    const banded = input.autoNeedsContemporaries && !input.nationFirst ? open.filter((c) => contemporaries(c.id).filter(inBand).length >= seats) : [];
    const eligible = banded.length ? banded : open.filter((c) => !input.autoNeedsContemporaries || contemporaries(c.id).length >= seats);
    const pool = eligible.length ? eligible : COUNTRIES.filter((c) => !exclude.has(c.id))
      .sort((a, b) => contemporaries(b.id).length - contemporaries(a.id).length).slice(0, 1);
    if (!pool.length) return null;
    const weights = pool.map((c) => (rival && countryBloc(rival) !== c.bloc ? input.rivalBlocWeight : 1));
    let pick = rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { pick -= weights[i]!; if (pick < 0) return pool[i]!.id; }
    return pool[pool.length - 1]!.id;
  };
  // the fills a side would need: its own contemporaries short of its seats, the closest allies in order
  const plannedFills = (c: CountryId | null, seats: number, skip: ReadonlySet<CountryId>): CountryId[] => {
    if (!c) return [];
    let short = seats - contemporaries(c).length;
    const fills: CountryId[] = [];
    for (const ally of COUNTRY_ALLIES[c]) {
      if (short <= 0) break;
      if (skip.has(ally)) continue;
      const n = contemporaries(ally).length;
      if (n > 0) { fills.push(ally); short -= n; }
    }
    return fills;
  };

  // 2. the enemy country
  let enemy: CountryId | null = null;
  const campaign = input.campaignEnemy ?? null;
  if (campaign) {
    enemy = campaign;
    if (allied === campaign) {
      // the story fixes the enemy: the allied BOTS give way to A's first ally (the humans keep their picks)
      const giveWay = COUNTRY_ALLIES[campaign].find((c) => c !== campaign) ?? null;
      notes.push({ side: 'alpha', country: giveWay, count: alliedSeats, reason: 'clash' });
      allied = giveWay;
    }
  }
  // no allied human country (a side of bots, a dev hull): AUTO, clear of the enemy's (the operation's, or its humans')
  if (!allied) {
    const theirs = enemy ?? majorityCountry(enemyHumans);
    allied = autoCountry(new Set(theirs ? [theirs] : []), alliedSeats, theirs);
  }
  if (!enemy && input.arrangedEnemy && input.arrangedEnemy !== allied) enemy = input.arrangedEnemy;
  if (!enemy && enemyHumans.length) {
    const theirs = majorityCountry(enemyHumans);
    if (theirs && theirs !== allied) enemy = theirs;
    else if (theirs) notes.push({ side: 'bravo', country: theirs, count: enemyHumans.length, reason: 'humans' });
  }
  if (!enemy) {
    // AUTO never draws a country an allied human drives (round 3, the critic's E-R2-5: alpha humans 2x US and 1x RU drew
    // an all-Russian enemy in 74 of 400 rooms), nor the allied country's planned fills
    const exclude = new Set<CountryId>(allied ? [allied, ...plannedFills(allied, alliedSeats, new Set())] : []);
    for (const human of humans) if (human.country) exclude.add(human.country);
    enemy = autoCountry(exclude, enemySeats, allied);
  }
  // an enemy country the arrangement or the enemy humans fixed may still be an allied human's own (a minority pick):
  // the humans keep their picks and the receipt says so
  if (enemy && enemy !== allied && humans.some((h) => h.country === enemy)) {
    notes.push({ side: 'bravo', country: enemy, count: humans.filter((h) => h.country === enemy).length, reason: 'humans' });
  }

  // 3. the fills
  const used = { alpha: new Set<CountryId>(), bravo: new Set<CountryId>() };
  const taken = new Set<string>([...humans, ...enemyHumans].map((h) => h.id));
  const note = (side: 'alpha' | 'bravo', c: CountryId | null, reason: NationNote['reason']): void => {
    const existing = notes.find((n) => n.side === side && n.country === c && n.reason === reason);
    if (existing) (existing as { count: number }).count++;
    else notes.push({ side, country: c, count: 1, reason });
  };
  const fill = (side: 'alpha' | 'bravo', c: CountryId | null, seats: number, targetTiers: readonly number[] | null,
    other: ReadonlySet<CountryId>): NationalSeat[] => {
    const out: NationalSeat[] = [];
    if (seats <= 0) return out;
    if (c) used[side].add(c);
    // a group of candidate rows, its country (null: each row's own) and the note its seats leave
    type Group = { rows: readonly NationRow[]; country: CountryId | null; reason: NationNote['reason'] | null };
    const groups: Group[] = [{ rows: c ? contemporaries(c) : [], country: c, reason: null }];
    if (c) for (const ally of COUNTRY_ALLIES[c]) if (!other.has(ally) && ally !== c) groups.push({ rows: contemporaries(ally), country: ally, reason: 'ally' });
    // a seat's tier target: the matching allied seat's (the enemy side), else the band's anchor once outside the band
    const targetOf = (k: number, outside: boolean): number | null =>
      targetTiers && targetTiers.length ? targetTiers[k % targetTiers.length]! : outside ? anchor : null;
    // the best untaken row of these groups for seat k: the nearest tier to its target first, then the earlier group (the
    // closer country), then the seeded rank
    const pickAcross = (list: readonly Group[], k: number, banded: boolean): { row: NationRow; group: Group } | null => {
      let best: { row: NationRow; group: Group } | null = null, bestScore = Infinity;
      const target = targetOf(k, !banded);
      list.forEach((group, gi) => {
        for (const row of group.rows) {
          if (taken.has(row.id) || inBand(row) !== banded) continue;
          const score = (target == null ? 0 : Math.abs(row.tier - target) * 1e9) + gi * 1e6 + rank.get(row.id)!;
          if (score < bestScore) { bestScore = score; best = { row, group }; }
        }
      });
      return best;
    };
    const fillFrom = (list: readonly Group[], banded: boolean): void => {
      while (out.length < seats) {
        const pick = pickAcross(list, out.length, banded);
        if (!pick) return;
        taken.add(pick.row.id);
        out.push({ id: pick.row.id, repeat: false });
        const country = pick.group.country ?? pick.row.country;
        const reason = pick.group.reason;
        if (reason) { note(side, country, reason); if (country) used[side].add(country); }
      }
    };
    // the widening ladder: the side's country, its closest allies in order, then any other vehicle not on the other
    // side's countries (the side's own country first, far eras included); the tier band before the nearest tiers outside
    // it, the band outranking the country unless `nationFirst` (the wave modes) fills each country before the next
    const far: Group[] = [{ rows: unique.filter((row) => row.country === c || !c), country: null, reason: 'far-era' },
      { rows: unique.filter((row) => row.country !== c && !other.has(row.country as CountryId)), country: null, reason: 'far-era' }];
    for (const list of [groups, far]) {
      if (input.nationFirst) for (const group of list) { fillFrom([group], true); fillFrom([group], false); }
      else { fillFrom(list, true); fillFrom(list, false); }
    }
    // no distinct vehicle left: the side repeats what it fields (its humans' vehicles when it fields none)
    const sideHumans = (side === 'alpha' ? humans : enemyHumans).filter((h) => !c || h.country === c);
    const fielded = out.map((seat) => rowById.get(seat.id)!);
    const repeatSource = fielded.length ? fielded : sideHumans;
    for (let k = 0; out.length < seats && repeatSource.length; k++) {
      const row = repeatSource[k % repeatSource.length]!;
      out.push({ id: row.id, repeat: true });
      note(side, row.country, 'repeat');
    }
    return out;
  };
  const enemyOnly = new Set<CountryId>(enemy ? [enemy] : []);
  // the allied country and the allied humans' own count as the allied side's even with no allied bot seat (round 2:
  // Juggernaut's hunters, no allied bots, filled the enemy side from the player's own country)
  if (allied) used.alpha.add(allied);
  for (const human of humans) if (human.country) used.alpha.add(human.country);
  const allies = fill('alpha', allied, alliedSeats, null, enemyOnly);
  // 4. tier pairing: enemy seat k matches allied seat k (the humans first)
  const alliedTiers = [...humans.map((h) => h.tier), ...allies.map((s) => rowById.get(s.id)?.tier ?? 0)];
  let enemies = fill('bravo', enemy, enemySeats, alliedTiers.length ? alliedTiers : null, used.alpha);
  let alliedOut = allies;
  // the multiplayer profile budget: beyond `distinctPerSide` distinct vehicles a side repeats the ones it fields
  const budget = input.distinctPerSide;
  if (budget != null && budget > 0) {
    const cap = (side: 'alpha' | 'bravo', seats: NationalSeat[]): NationalSeat[] => {
      const distinct: string[] = [];
      return seats.map((seat) => {
        if (distinct.includes(seat.id)) return seat;
        if (distinct.length < budget) { distinct.push(seat.id); return seat; }
        const again = distinct[seats.indexOf(seat) % distinct.length]!;
        note(side, rowById.get(again)?.country ?? null, 'budget');
        return { id: again, repeat: true };
      });
    };
    alliedOut = cap('alpha', allies);
    enemies = cap('bravo', enemies);
  }
  return Object.freeze({ allied, enemy, allies: alliedOut, enemies, notes: Object.freeze(notes) });
}

/**
 * A battle's TEAM NATIONS record as flags (the loading screen and the HUD team plate): each side's country as a spec
 * nation for its flag, and the countries that filled it (an ally fill, the operation's give-way), null under RANDOM.
 */
export function teamNationsFlags(record: { readonly teamNations: string; readonly allied: CountryId | null;
  readonly enemy: CountryId | null; readonly notes: readonly NationNote[] } | null | undefined):
  { allied: string | null; enemy: string | null; alliedFills: string[]; enemyFills: string[] } | null {
  if (!record || record.teamNations === 'random') return null;
  const nation = (id: CountryId | null): string | null => countryNation(id);
  const fills = (side: 'alpha' | 'bravo'): string[] => [...new Set(record.notes
    .filter((note) => note.side === side && (note.reason === 'ally' || note.reason === 'clash') && note.country)
    .map((note) => nation(note.country)).filter((value): value is string => !!value))];
  return { allied: nation(record.allied), enemy: nation(record.enemy), alliedFills: fills('alpha'), enemyFills: fills('bravo') };
}

