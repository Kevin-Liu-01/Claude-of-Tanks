// Facet-aware fleet search shared by the Garage roster filter and the Tank Gallery archive.
//
// A query is a list of words, ANDed. A word of the form `key:value` constrains one facet instead of matching text:
//
//   class:td  class:ifv  class:concept-prototype     role:sniper  role:scout     status:concept  status:prototype
//   era:modern  era:ww2  era:cold-war                nation:germany  nation:"south korea"           tier:10  tier:8-10  tier:x
//
// Values of one key are ORed (`class:td class:ifv`), different keys are ANDed. Values accept the facet aliases in
// vehicleFacets.ts (`class:destroyer`, `role:recon`, `status:proto`). Any other word, or a quoted phrase, must appear
// in the entry's search text, which the caller builds from names, aliases, nation, era and vehicleFacetSearchWords.
// Pure and Node-runnable.

import {
  CONCEPT_PROTOTYPE_CLASS_FILTER,
  CONCEPT_PROTOTYPE_FILTER_META,
  VEHICLE_BATTLE_ROLE_META,
  VEHICLE_BATTLE_ROLE_ORDER,
  VEHICLE_CLASS_META,
  VEHICLE_CLASS_ORDER,
  VEHICLE_DESIGN_STATUS_META,
  VEHICLE_DESIGN_STATUS_ORDER,
  matchesVehicleClassFilter,
} from './vehicleFacets.ts';
import type {
  VehicleBattleRole,
  VehicleClassFilter,
  VehicleDesignStatus,
  VehicleFacetValueMeta,
  VehicleFacets,
} from './vehicleFacets.ts';
import { VEHICLE_ERA_ORDER } from './taxonomy.ts';

interface VehicleFacetQuery {
  /** Lowercase words and phrases that must all appear in the search text. */
  readonly terms: readonly string[];
  readonly classes: ReadonlySet<VehicleClassFilter> | null;
  readonly roles: ReadonlySet<VehicleBattleRole> | null;
  readonly statuses: ReadonlySet<VehicleDesignStatus> | null;
  readonly eras: ReadonlySet<string> | null;
  readonly nations: readonly string[] | null;
  readonly tiers: readonly { readonly min: number; readonly max: number }[] | null;
}

export interface VehicleFacetSearchEntry {
  /** Lowercase haystack: names, aliases, nation, era and vehicleFacetSearchWords. */
  readonly searchText: string;
  readonly facets: VehicleFacets | null;
  readonly era?: string;
  /** Lowercase nation words (`usa`, `united states`, the localized name, the flag code). */
  readonly nationTerms?: readonly string[];
  readonly tier?: number;
}

const normalize = (value: string): string => value.trim().toLocaleLowerCase('en-US');
const slug = (value: string): string => normalize(value).replace(/[\s_]+/g, '-');

function aliasIndex<V extends string>(order: readonly V[], meta: Readonly<Record<V, VehicleFacetValueMeta>>):
  ReadonlyMap<string, V> {
  const index = new Map<string, V>();
  for (const value of order) {
    for (const word of [value, meta[value].label, meta[value].shortLabel, ...meta[value].aliases]) {
      index.set(slug(word), value);
    }
  }
  return index;
}

const CLASS_ALIASES = new Map<string, VehicleClassFilter>(aliasIndex(VEHICLE_CLASS_ORDER, VEHICLE_CLASS_META));
for (const word of [CONCEPT_PROTOTYPE_CLASS_FILTER, ...CONCEPT_PROTOTYPE_FILTER_META.aliases,
  'concept', 'prototype', 'concept/prototype']) {
  CLASS_ALIASES.set(slug(word), CONCEPT_PROTOTYPE_CLASS_FILTER);
}
const ROLE_ALIASES = aliasIndex(VEHICLE_BATTLE_ROLE_ORDER, VEHICLE_BATTLE_ROLE_META);
const STATUS_ALIASES = aliasIndex(VEHICLE_DESIGN_STATUS_ORDER, VEHICLE_DESIGN_STATUS_META);

const ERA_ALIASES: ReadonlyMap<string, string> = new Map([
  ...VEHICLE_ERA_ORDER.map((era) => [era, era] as const),
  ['wwii', 'ww2'], ['world-war-ii', 'ww2'], ['world-war-2', 'ww2'], ['worldwar2', 'ww2'],
  ['cold', 'cold-war'], ['coldwar', 'cold-war'],
  ['next', 'next-generation'], ['next-gen', 'next-generation'], ['nextgen', 'next-generation'],
  ['next-generation', 'next-generation'], ['future', 'next-generation'],
]);

const ROMAN_TIERS: ReadonlyMap<string, number> = new Map([
  ['i', 1], ['ii', 2], ['iii', 3], ['iv', 4], ['v', 5], ['vi', 6], ['vii', 7], ['viii', 8], ['ix', 9], ['x', 10],
]);

const FACET_KEYS: ReadonlyMap<string, 'class' | 'role' | 'status' | 'era' | 'nation' | 'tier'> = new Map([
  ['class', 'class'], ['type', 'class'],
  ['role', 'role'],
  ['status', 'status'],
  ['era', 'era'],
  ['nation', 'nation'], ['country', 'nation'],
  ['tier', 'tier'],
]);

function tierValue(text: string): number | null {
  const roman = ROMAN_TIERS.get(text);
  if (roman) return roman;
  const value = Number(text);
  return Number.isInteger(value) && value >= 1 && value <= 10 ? value : null;
}

function tierRange(text: string): { min: number; max: number } | null {
  const [low, high = low] = text.split('-');
  const min = tierValue(low);
  const max = tierValue(high);
  if (min === null || max === null) return null;
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

const TOKEN_RE = /([a-z]+):"([^"]*)"|"([^"]+)"|(\S+)/giu;
const NATION_WORD_BREAK = /[\s/,()-]+/u;

/** Parse a search box value into free-text terms and facet constraints. */
export function parseVehicleFacetQuery(query: string): VehicleFacetQuery {
  const terms: string[] = [];
  let classes: Set<VehicleClassFilter> | null = null;
  let roles: Set<VehicleBattleRole> | null = null;
  let statuses: Set<VehicleDesignStatus> | null = null;
  let eras: Set<string> | null = null;
  let nations: string[] | null = null;
  let tiers: { min: number; max: number }[] | null = null;

  for (const match of String(query || '').matchAll(TOKEN_RE)) {
    const [, quotedKey, quotedValue, phrase, bare] = match;
    if (phrase !== undefined) {
      if (normalize(phrase)) terms.push(normalize(phrase));
      continue;
    }
    let key = quotedKey;
    let value = quotedValue;
    if (bare !== undefined) {
      const colon = bare.indexOf(':');
      // A facet key still being typed (`class:`) constrains nothing yet rather than emptying the list.
      if (colon === bare.length - 1 && FACET_KEYS.has(normalize(bare.slice(0, -1)))) continue;
      if (colon > 0 && colon < bare.length - 1) {
        key = bare.slice(0, colon);
        value = bare.slice(colon + 1);
      } else {
        terms.push(normalize(bare));
        continue;
      }
    }
    const facet = FACET_KEYS.get(normalize(key || ''));
    const text = slug(value || '');
    const facetValue = facet === 'class' ? CLASS_ALIASES.get(text)
      : facet === 'role' ? ROLE_ALIASES.get(text)
        : facet === 'status' ? STATUS_ALIASES.get(text)
          : facet === 'era' ? ERA_ALIASES.get(text)
            : facet === 'tier' ? tierRange(text)
              : facet === 'nation' && text ? normalize(value || '') : undefined;
    if (facetValue === undefined || facetValue === null) {
      // An unknown key or value is ordinary text: `m1a2:sep` still finds what it spells.
      terms.push(normalize(bare ?? `${key}:${value}`));
      continue;
    }
    if (facet === 'class') (classes ??= new Set()).add(facetValue as VehicleClassFilter);
    else if (facet === 'role') (roles ??= new Set()).add(facetValue as VehicleBattleRole);
    else if (facet === 'status') (statuses ??= new Set()).add(facetValue as VehicleDesignStatus);
    else if (facet === 'era') (eras ??= new Set()).add(facetValue as string);
    else if (facet === 'nation') (nations ??= []).push(facetValue as string);
    else if (facet === 'tier') (tiers ??= []).push(facetValue as { min: number; max: number });
  }
  return { terms, classes, roles, statuses, eras, nations, tiers };
}

/** True when an entry answers every word and facet constraint of a parsed query. */
export function matchesVehicleFacetQuery(entry: VehicleFacetSearchEntry, query: VehicleFacetQuery): boolean {
  const facets = entry.facets;
  if (query.classes && ![...query.classes].some((value) => matchesVehicleClassFilter(facets, value))) return false;
  if (query.roles && !(facets && query.roles.has(facets.battleRole))) return false;
  if (query.statuses && !(facets && query.statuses.has(facets.designStatus))) return false;
  if (query.eras && !(entry.era && query.eras.has(entry.era))) return false;
  if (query.nations) {
    // A nation value matches a whole nation term or the start of one of its words (`nation:korea` finds South Korea,
    // `nation:rus` USSR/Russia); a bare substring would let `nation:us` find Russia and Australia.
    const nationTerms = entry.nationTerms || [];
    if (!query.nations.some((wanted) => nationTerms.some((term) => term.startsWith(wanted)
      || term.split(NATION_WORD_BREAK).some((word) => word.startsWith(wanted))))) {
      return false;
    }
  }
  if (query.tiers) {
    const tier = entry.tier ?? 0;
    if (!query.tiers.some(({ min, max }) => tier >= min && tier <= max)) return false;
  }
  for (const term of query.terms) if (!entry.searchText.includes(term)) return false;
  return true;
}

/** True when a query has no words and no constraints (an empty search box). */
export function isEmptyVehicleFacetQuery(query: VehicleFacetQuery): boolean {
  return !query.terms.length && !query.classes && !query.roles && !query.statuses && !query.eras
    && !query.nations && !query.tiers;
}
