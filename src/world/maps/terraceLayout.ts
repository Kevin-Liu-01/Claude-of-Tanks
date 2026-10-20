// src/world/maps/terraceLayout.ts — the plot contract of a terrace row (the buildings lane with map-revival, 2026-10-11:
// Cinder Junction's colliery colony streets). One planned site per row: { structure: 'terrace', plot: { w, d } }, x and
// z the plot's centre, yaw turning local +z (the doorsteps) to the street. The base builder (railKit.ts makeTerrace)
// and every kit that rebuilds the row (ruhr.ts) read the row from here, so the base reach and the kit's body agree.
// Dependency-free: plain numbers in, plain numbers out.

/** A row's plot: metres across (x, the street frontage) and deep (z, from the back edge to the pavement line). */
interface TerracePlot {
  w: number;
  d: number;
}

interface TerraceLayout {
  /** the plot, clamped to the contract (11-44 m across, 9-13 m deep) */
  w: number;
  d: number;
  /** houses in the row, each `unitW` wide: the row fills the plot's width exactly */
  units: number;
  unitW: number;
  /** the street wall (+z) stands `stepDepth` inside the plot's front edge: the doorsteps sit on the pavement line */
  front: number;
  stepDepth: number;
  /** the two-storey block's depth and its back wall: 8.2 m deep with wash-houses behind it, else to the plot's back edge */
  depth: number;
  back: number;
  /** one-storey wash-houses behind the block, reaching the plot's back edge, when the plot is deep enough for them (0 deep
   * without them) */
  washhouses: boolean;
  washDepth: number;
}

/** The plot an unauthored row takes (a plan entry with no plot): four houses. */
export const TERRACE_DEFAULT_PLOT: Readonly<TerracePlot> = Object.freeze({ w: 22, d: 9.6 });

/** A house's nominal frontage: the row takes as many as fit, between two and eight. */
const TERRACE_UNIT_M = 5.5;

export function terraceLayout(plot: TerracePlot | undefined): TerraceLayout {
  const w = Math.max(11, Math.min(44, plot?.w ?? TERRACE_DEFAULT_PLOT.w));
  const d = Math.max(9, Math.min(13, plot?.d ?? TERRACE_DEFAULT_PLOT.d));
  const units = Math.max(2, Math.min(8, Math.round(w / TERRACE_UNIT_M)));
  const stepDepth = 0.45, front = d / 2 - stepDepth;
  // the block is 8.2 m deep, the wash-houses taking what the plot leaves behind it when that is 2.1 m or more; a
  // shallower plot (under 10.75 m) deepens the block to its back edge instead, so the row reaches the plot's back edge
  // either way and no lane opens behind it (the map-revival lanes' footprint coverage, regionalArchitecture.selftest)
  const spare = d - stepDepth - 8.2, washhouses = spare >= 2.1;
  const depth = washhouses ? 8.2 : d - stepDepth, back = front - depth;
  return { w, d, units, unitW: w / units, front, stepDepth, depth, back, washhouses, washDepth: washhouses ? spare : 0 };
}

/**
 * The houses' party walls (x of each wall between two houses, west to east) and, for each house, the side its door
 * stands on: the houses pair off, each pair's doors side by side at their shared wall (an odd last house turns its
 * door to its neighbour too).
 */
export function terraceUnits(layout: TerraceLayout): { partyWalls: number[]; houses: { x0: number; x1: number; door: -1 | 1 }[] } {
  const { w, units, unitW } = layout;
  const partyWalls: number[] = [];
  for (let k = 1; k < units; k++) partyWalls.push(-w / 2 + k * unitW);
  const houses = Array.from({ length: units }, (_, i) => {
    const x0 = -w / 2 + i * unitW;
    const door: -1 | 1 = i % 2 === 0 && i + 1 < units ? 1 : -1;
    return { x0, x1: x0 + unitW, door };
  });
  return { partyWalls, houses };
}
