// Garage roster facet filter: the pure half of the Filter panel (garageFacetPanel.ts draws it).
//
// The Garage strip stays one national fleet at a time; this filter narrows the cards inside every nation by class,
// battle role, era and a facet-aware search (vehicleFacetSearch.ts). No DOM, Node-runnable: the receipt runs it over
// the real fleet. Loaded only with the panel, so none of it sits on the game entry.

import {
  CONCEPT_PROTOTYPE_CLASS_FILTER,
  VEHICLE_BATTLE_ROLE_ORDER,
  VEHICLE_CLASS_ORDER,
  matchesVehicleClassFilter,
  matchesVehicleRoleFilter,
  vehicleFacetSearchWords,
  vehicleFacetsForId,
} from '../vehicles/vehicleFacets.ts';
import type { VehicleFacets } from '../vehicles/vehicleFacets.ts';
import {
  isEmptyVehicleFacetQuery,
  matchesVehicleFacetQuery,
  parseVehicleFacetQuery,
} from '../vehicles/vehicleFacetSearch.ts';
import type { VehicleFacetSearchEntry } from '../vehicles/vehicleFacetSearch.ts';
import { VEHICLE_ERA_ORDER, vehicleEraLabelI18n } from '../vehicles/taxonomy.ts';
import { tankTier } from '../vehicles/tier.ts';

export interface GarageFacetSpec {
  readonly id: string;
  readonly name?: string;
  readonly nation?: string;
  readonly era?: string;
  readonly label?: {
    readonly displayName?: string;
    readonly shortName?: string;
    readonly searchAliases?: readonly string[];
  };
}

export interface GarageFacetState {
  /** A vehicle class, 'concept-prototype' or 'all'. */
  readonly vehicleClass: string;
  readonly battleRole: string;
  readonly era: string;
  readonly query: string;
}

export const EMPTY_GARAGE_FACET_STATE: GarageFacetState = Object.freeze({
  vehicleClass: 'all', battleRole: 'all', era: 'all', query: '',
});

/** The groups the panel draws, each value in its facet table's order ('all' first). */
export const GARAGE_FACET_GROUPS = Object.freeze({
  vehicleClass: Object.freeze(['all', ...VEHICLE_CLASS_ORDER, CONCEPT_PROTOTYPE_CLASS_FILTER]),
  battleRole: Object.freeze(['all', ...VEHICLE_BATTLE_ROLE_ORDER]),
  era: Object.freeze(['all', ...VEHICLE_ERA_ORDER]),
});

export type GarageFacetGroup = keyof typeof GARAGE_FACET_GROUPS;

interface GarageFacetEntry extends VehicleFacetSearchEntry {
  readonly id: string;
  readonly facets: VehicleFacets | null;
}

interface GarageFacetIndex {
  readonly entries: readonly GarageFacetEntry[];
}

type Translate = (key: string) => string;

/** Build the search entries once per Garage (names, aliases, nation, era, facet words). */
export function createGarageFacetIndex(specs: readonly GarageFacetSpec[], translate: Translate): GarageFacetIndex {
  const entries = specs.map((spec): GarageFacetEntry => {
    const facets = vehicleFacetsForId(spec.id);
    const nation = String(spec.nation || '');
    const nationLabel = translate(`nation.${nation}`);
    const nationTerms = [nation, nationLabel === `nation.${nation}` ? '' : nationLabel]
      .filter(Boolean).map((term) => term.toLocaleLowerCase('en-US'));
    const era = String(spec.era || '');
    const searchText = [
      spec.id, spec.name, spec.label?.displayName, spec.label?.shortName, ...(spec.label?.searchAliases || []),
      ...nationTerms, era, era ? vehicleEraLabelI18n(era, translate) : '',
      vehicleFacetSearchWords(facets, translate),
    ].filter(Boolean).join(' ').toLocaleLowerCase('en-US');
    return Object.freeze({ id: spec.id, facets, era, nationTerms, tier: tankTier(spec.id), searchText });
  });
  return Object.freeze({ entries: Object.freeze(entries) });
}

/** How many of the four controls narrow the roster (the toggle's badge). */
export function garageFacetActiveCount(state: GarageFacetState): number {
  return Number(state.vehicleClass !== 'all') + Number(state.battleRole !== 'all') + Number(state.era !== 'all')
    + Number(Boolean(state.query.trim()));
}

function entryMatcher(state: GarageFacetState): (entry: GarageFacetEntry) => boolean {
  const query = parseVehicleFacetQuery(state.query);
  const searching = !isEmptyVehicleFacetQuery(query);
  return (entry) => matchesVehicleClassFilter(entry.facets, state.vehicleClass)
    && matchesVehicleRoleFilter(entry.facets, state.battleRole)
    && (state.era === 'all' || entry.era === state.era)
    && (!searching || matchesVehicleFacetQuery(entry, query));
}

/** The visible-card predicate for a filter state, or null when nothing narrows the roster. */
export function garageFacetMatcher(index: GarageFacetIndex, state: GarageFacetState): ((id: string) => boolean) | null {
  if (!garageFacetActiveCount(state)) return null;
  const matches = entryMatcher(state);
  const visible = new Set(index.entries.filter(matches).map((entry) => entry.id));
  return (id) => visible.has(id);
}

/**
 * How many vehicles each option of a group would show with the other controls unchanged (the option chips'
 * counts). An option with zero is shown disabled unless it is the current choice.
 */
export function garageFacetOptionCounts(index: GarageFacetIndex, state: GarageFacetState,
  group: GarageFacetGroup): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const value of GARAGE_FACET_GROUPS[group]) {
    const matches = entryMatcher({ ...state, [group]: value });
    counts.set(value, index.entries.reduce((sum, entry) => sum + Number(matches(entry)), 0));
  }
  return counts;
}

/** Vehicles shown by a state (the panel's count line). */
export function garageFacetMatchCount(index: GarageFacetIndex, state: GarageFacetState): number {
  const matches = entryMatcher(state);
  return index.entries.reduce((sum, entry) => sum + Number(matches(entry)), 0);
}
