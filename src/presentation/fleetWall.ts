// The landing's fleet wall, narrowed (bui01/src/pages/03-landing-fleet-wall .facets). Copyright © 2026 Kevin B. Liu.
// publicPages.ts loads this module with the first chip press or keystroke. Every vehicle with a fleet take is in
// fleetWall.json (tools/home-premiere.mjs, from the Garage's facet tables: vehicleFacets.ts and vehicleFacetSearch.ts);
// a nation, a class and the search narrow it, and the wall shows the first twelve that answer in its own tile markup.
// The empty filter brings back the curated twelve the page was written with.
import { getLocale } from '../ui/i18n.ts';
import { hrefForLocale } from '../ui/localeRouting.ts';
import { matchesVehicleFacetQuery, parseVehicleFacetQuery } from '../vehicles/vehicleFacetSearch.ts';
import type { VehicleFacetSearchEntry } from '../vehicles/vehicleFacetSearch.ts';
import records from './fleetWall.json' with { type: 'json' };

export interface FleetWallRecord {
  readonly id: string;
  readonly name: string;
  readonly flag: string;
  readonly href: string;
  readonly poster: string;
  readonly loop: string;
  readonly title: { readonly en: string; readonly zh: string };
  readonly entry: VehicleFacetSearchEntry;
  readonly feature: object;
}

export interface FleetFilter {
  /** A flag code, or '' for every nation. */
  readonly nation: string;
  /** A class (or the concept-and-prototype cut), or '' for every class. */
  readonly cls: string;
  readonly query: string;
}

const WALL = records as unknown as readonly FleetWallRecord[];
/** The wall's size: four tiles, the plate, eight tiles. */
const SHOWN = 12;

export const isEmptyFilter = (filter: FleetFilter): boolean => !filter.nation && !filter.cls && !filter.query.trim();

/** Every vehicle that answers the filter, in the wall's order (the curated twelve first). */
export function fleetMatches(filter: FleetFilter, wall: readonly FleetWallRecord[] = WALL): FleetWallRecord[] {
  const query = parseVehicleFacetQuery(filter.query);
  return wall.filter((record) => (!filter.nation || record.flag === filter.nation)
    && (!filter.cls || classAnswers(record, filter.cls))
    && matchesVehicleFacetQuery(record.entry, query));
}

/** vehicleFacets.ts matchesVehicleClassFilter, without importing the Filter panel's strings (i18nLazyCatalog.selftest). */
const classAnswers = (record: FleetWallRecord, cls: string): boolean => (cls === 'concept-prototype'
  ? record.entry.facets?.designStatus !== 'service' : record.entry.facets?.vehicleClass === cls);

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A tile as tools/home-premiere.mjs writes one; its flag is the matching chip's (the page's own symbol). */
function tileFor(section: HTMLElement, record: FleetWallRecord): HTMLAnchorElement {
  const locale = getLocale();
  const tile = document.createElement('a');
  tile.className = 'fleet-tile cot-c-media cot-c-media--soft';
  tile.href = hrefForLocale(record.href, locale);
  tile.dataset.feature = JSON.stringify(record.feature);
  const label = locale === 'zh-CN' ? record.title.zh : record.title.en;
  tile.innerHTML = `<img src="${esc(record.poster)}" alt="" width="640" height="360" loading="lazy" decoding="async">`
    + `<video data-media-player="hover" muted loop playsinline preload="none" aria-hidden="true" data-label="${esc(label)}">`
    + `<source data-src="${esc(record.loop)}" type="video/webm"></video><span class="fleet-tile__progress" aria-hidden="true"><i></i></span>`
    + `<span class="fleet-tile__id"><i class="cot-c-sil" style="--sil:url('/icons/${esc(record.id)}_side_silhouette.png')" aria-hidden="true"></i>`
    + `<b>${esc(record.name)}</b></span>`;
  const flag = section.querySelector(`[data-fleet-nation="${record.flag}"] svg`)?.cloneNode(true);
  if (flag) tile.querySelector('.fleet-tile__id')?.prepend(flag);
  return tile;
}

const built = new WeakMap<HTMLElement, Map<string, HTMLAnchorElement>>();

/**
 * Put the filter's tiles on the wall (the curated twelve for the empty filter) and return them with the number of
 * vehicles that answer. A tile once built is kept for the page, so its player keeps its place.
 */
export function applyFleetFilter(section: HTMLElement, filter: FleetFilter): { tiles: HTMLAnchorElement[]; total: number } {
  const wall = section.querySelector<HTMLElement>('[data-fleet-wall]');
  const plate = wall?.querySelector<HTMLElement>('[data-fleet-feature]');
  if (!wall || !plate) return { tiles: [], total: 0 };
  let tiles = built.get(section);
  if (!tiles) {
    // the page's own twelve are the first twelve records
    tiles = new Map();
    [...wall.querySelectorAll<HTMLAnchorElement>('a.fleet-tile')].forEach((tile, i) => { if (WALL[i]) tiles!.set(WALL[i].id, tile); });
    built.set(section, tiles);
  }
  const matches = isEmptyFilter(filter) ? WALL.slice(0, SHOWN) : fleetMatches(filter);
  const shown = matches.slice(0, SHOWN).map((record) => {
    let tile = tiles!.get(record.id);
    if (!tile) { tile = tileFor(section, record); tiles!.set(record.id, tile); }
    return tile;
  });
  for (const tile of wall.querySelectorAll('a.fleet-tile')) tile.remove();
  plate.before(...shown.slice(0, 4));
  plate.after(...shown.slice(4));
  return { tiles: shown, total: matches.length };
}
