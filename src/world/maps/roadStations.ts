// Construction-time dressing stations retain the pre-completion sample ordinal.
// The surviving authored samples are one contiguous run; inserted junction or
// exit points have no inherited station. No duplicate polylines are retained.
type RoadPoint = readonly [number, number];
type RoadLine = readonly RoadPoint[];

export interface RoadStationOrigin {
  readonly count: number;
  readonly first: number;
  readonly last: number;
  readonly offset: number;
  /** Sparse physical dressing stations on a densely sampled turning arc.
   * -1 retains a trimmed source station's ordinal without moving its props. */
  readonly indices?: readonly number[];
}

interface StationLayout {
  readonly roads: readonly RoadLine[];
  readonly roadStations?: readonly (RoadStationOrigin | null)[];
}

function stationOrigin(source: RoadLine, completed: RoadLine, count: number): RoadStationOrigin | null {
  let first = 0, at = -1;
  for (; first < count; first++) {
    at = completed.indexOf(source[first]);
    if (at >= 0) break;
  }
  let last = first - 1;
  while (last + 1 < count && completed[at + last + 1 - first] === source[last + 1]) last++;
  // Completion only prepends/appends or trims terminal runs. Fail closed if a
  // future implementation reorders/replaces an interior authored station.
  for (let i = last + 1; i < count; i++) {
    if (completed.includes(source[i])) throw new Error('Noncontiguous authored road stations');
  }
  if (first === 0 && last === count - 1 && at === 0 && completed.length === count) return null;
  return { count, first, last, offset: at - first };
}

export function buildRoadStationOrigins(source: readonly RoadLine[], completed: readonly RoadLine[],
  originalCounts: readonly number[] = []): (RoadStationOrigin | null)[] | undefined {
  const origins = source.map((line, i) => stationOrigin(line, completed[i], originalCounts[i] ?? line.length));
  return origins.some(Boolean) ? origins : undefined;
}

export function authoredRoadStationCount(layout: StationLayout, road: number): number {
  return layout.roadStations?.[road]?.count ?? layout.roads[road].length;
}

/** Return the completed index only when the requested original neighbors also
 * survive. Parity, random selection and iteration bounds use the original index.
 * Physical clearance still queries the current completed road/heightfield. */
export function authoredRoadStationIndex(layout: StationLayout, road: number, original: number,
  before = 0, after = 1): number {
  const origin = layout.roadStations?.[road];
  if (origin?.indices) {
    if (!Number.isInteger(original) || !Number.isInteger(before) || !Number.isInteger(after)
      || before < 0 || after < 0 || original - before < 0 || original + after >= origin.count) return -1;
    // Neighborhood requirements refer to surviving dressing stations, not
    // the extra geometric vertices between them. Never cross a trimmed hole.
    for (let ordinal = original - before; ordinal <= original + after; ordinal++) {
      if (origin.indices[ordinal] < 0) return -1;
    }
    return origin.indices[original];
  }
  const first = origin?.first ?? 0, last = origin?.last ?? layout.roads[road].length - 1;
  return original - before < first || original + after > last ? -1 : original + (origin?.offset ?? 0);
}

/** The seven authored rounded networks need independent presentation spacing:
 * four curve chords are geometry, not four utility poles or house parcels. */
export function usesPhysicalRoadStations(mapId: string | undefined): boolean {
  return mapId === 'saltwind' || mapId === 'whiteout' || mapId === 'polders'
    || mapId === 'copper_mesa' || mapId === 'orchard' || mapId === 'longleaf' || mapId === 'oasis' || mapId === 'urban'
    || mapId === 'coastal';
}

const MIN_DRESSING_STATION_M = 24;

/** Select existing vertices by travelled distance, retaining the endpoints as
 * ordinal sentinels. Ordinary authored segments are about 24–32m long; short
 * arc chords accumulate until they cover a comparable parcel frontage.
 * The terminal may be closer, but callers require a following station and
 * therefore never place dressing on that terminal. */
function physicalStationVertices(line: RoadLine): number[] {
  if (!line.length) return [];
  const stations = [0];
  let distance = 0;
  for (let i = 1; i < line.length - 1; i++) {
    distance += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    if (distance + 1e-8 < MIN_DRESSING_STATION_M) continue;
    stations.push(i);
    distance = 0;
  }
  if (line.length > 1) stations.push(line.length - 1);
  return stations;
}

/** Endpoint completion is allowed to trim or extend geometry. Select stations
 * before that operation, then map only surviving vertex identities; appended
 * border nodes must never acquire new buildings, poles or seeded proposals. */
export function buildPhysicalRoadStationOrigins(mapId: string | undefined,
  source: readonly RoadLine[], completed: readonly RoadLine[],
  fallback: (RoadStationOrigin | null)[] | undefined): (RoadStationOrigin | null)[] | undefined {
  if (!usesPhysicalRoadStations(mapId)) return fallback;
  return source.map((line, road) => {
    const indices = physicalStationVertices(line).map(index => completed[road].indexOf(line[index]));
    const first = indices.findIndex(index => index >= 0);
    let last = indices.length - 1;
    while (last >= 0 && indices[last] < 0) last--;
    return { count: indices.length, first: first < 0 ? indices.length : first, last, offset: 0, indices };
  });
}

/** Building placement uses geometric neighbors for its tangent but must not
 * treat every turning-arc vertex as a new lot. Legacy maps retain their exact
 * node order and proposal count, including their completed endpoint policy. */
export function buildingRoadStationIndices(layout: StationLayout, road: number): number[] {
  const line = layout.roads[road];
  if (!layout.roadStations?.[road]?.indices) return Array.from({ length: Math.max(0, line.length - 2) }, (_, i) => i + 1);
  const result: number[] = [];
  const count = authoredRoadStationCount(layout, road);
  for (let ordinal = 1; ordinal < count - 1; ordinal++) {
    const index = authoredRoadStationIndex(layout, road, ordinal, 1, 1);
    if (index > 0 && index < line.length - 1) result.push(index);
  }
  return result;
}
