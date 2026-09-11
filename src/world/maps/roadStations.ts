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
  const first = origin?.first ?? 0, last = origin?.last ?? layout.roads[road].length - 1;
  return original - before < first || original + after > last ? -1 : original + (origin?.offset ?? 0);
}
