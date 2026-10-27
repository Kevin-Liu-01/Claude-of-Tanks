// The scoped armour flashlight's panels (262): the armour skin (armorSkin.ts) merged into a few smooth armour panels
// per zone — glacis, lower plate, cheeks, mantlet, sides, roof, rear — each one colour.
//
// Owner, 2026-10-27: "make highlighting simpler and generalized". The skin is the cells' outer surface, one panel per
// plate and plane; the cells are convex slices hulled from the vehicle mesh, so a glacis comes out as a fan of facets a
// few degrees apart, and every face takes the authored plate nearest it, so plate changes zigzag along facet edges.
// Coloured per facet, the front read as red and green triangle fans with zones cutting diagonally across the plates.
// Here the facets are grouped into panels instead:
//   - region growing over shared edges: one zone (armorZones.ts: straight borders), and every corner within a thin
//     slab about one plane, so a flat plate with its fittings and the cells' slicing wedges is one panel, a curve is a
//     few, and a real crease starts the next;
//   - slivers and fans (a panel under MIN_PANEL_M2) join the neighbour they share the most border with, whatever its
//     plate, unless the sliver is all its zone has;
//   - a facet poking into a neighbour (more border with it than with its own panel) moves across, so borders between
//     panels run straight instead of in teeth;
//   - each panel aims a few samples (one per ~SAMPLE_AREA_M2, at most MAX_SAMPLES) at points spread over it; the
//     flashlight blends their penetration estimates, weighted by the area each stands for, into one colour.
//
// Pure numbers (no three.js), cached per cell list: every vehicle of one spec shares the panels.
import { armorSkinPanels, type ArmorSkinPanel, type SkinPoint } from './armorSkin.ts';
import { splitByZones, zonePlates } from './armorZones.ts';

/** A panel's corners all lie within a slab this thick (m) about one plane: a flat plate, its fittings, the cells'
 * slicing wedges. A real crease or a curve over a panel's width leaves the slab. */
const PANEL_SLAB_M = 0.1;
/** Facets of one zone whose normal is within this of the panel's mean (60°) may join it; thin wedges tilt a lot. */
const PANEL_SPREAD_COS = 0.5;
/** A facet moves into a neighbouring panel (border smoothing) only within this of that panel's normal (40°). */
const NEIGHBOUR_CREASE_COS = Math.cos((40 * Math.PI) / 180);
/** Panels under this area (m²) are slivers, fans and fittings, not armour plates. */
const MIN_PANEL_M2 = 0.06;
/** A zone smaller than this (m²) in total is noise: it never keeps a panel of its own. */
const MIN_ZONE_M2 = 0.02;
/** A facet moves to the neighbouring panel it shares more border with only while it is this small a part of its own. */
const SMOOTH_SHARE = 0.3;
const SMOOTH_PASSES = 3;
/** One sample per this much panel area (m²), at most MAX_SAMPLES. */
const SAMPLE_AREA_M2 = 0.6;
const MAX_SAMPLES = 4;
/** Edges this close to one line (m) and overlapping by more than EDGE_OVERLAP_M are one shared edge. */
const EDGE_LINE_M = 2e-3;
const EDGE_OVERLAP_M = 2e-3;
const GRID_M = 0.25;

export interface ArmorPanelFacet {
  /** Convex, counter-clockwise about the normal. */
  readonly points: readonly SkinPoint[];
  readonly normal: SkinPoint;
  readonly area: number;
  readonly centroid: SkinPoint;
  /** The skin panel (armorSkinPanels index) the facet is a piece of. */
  readonly skin: number;
  /** Its zone (armorZones.ts): the authored plate it belongs to. */
  readonly plate: unknown;
}

export interface ArmorPanel {
  /** The zone: the authored plate most of the panel resolves to. */
  readonly plate: unknown;
  /** Area-weighted mean outward normal. */
  readonly normal: SkinPoint;
  readonly area: number;
  readonly facets: readonly number[];
  /** Frame-local aim points on the panel, and the share of its area each stands for (they sum to 1). */
  readonly samples: readonly SkinPoint[];
  readonly weights: readonly number[];
}

export interface ArmorPanelSet {
  readonly skin: readonly ArmorSkinPanel[];
  readonly facets: readonly ArmorPanelFacet[];
  readonly panels: readonly ArmorPanel[];
  /** The panel of each facet. */
  readonly facetPanel: Int32Array;
  /** Whether each facet edge (points[i] → points[i + 1]) is on a panel border: its per-facet offset into `borders`. */
  readonly edgeStart: Int32Array;
  readonly borders: Uint8Array;
}

const sub = (a: readonly number[], b: readonly number[]): SkinPoint => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: readonly number[], b: readonly number[]): SkinPoint =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const distance = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function facetOf(points: readonly SkinPoint[], normal: SkinPoint, skin: number, plate: unknown): ArmorPanelFacet | null {
  let area = 0;
  const centroid: SkinPoint = [0, 0, 0];
  for (let i = 1; i + 1 < points.length; i++) {
    const triangle = Math.abs(dot(cross(sub(points[i], points[0]), sub(points[i + 1], points[0])), normal)) / 2;
    area += triangle;
    for (let axis = 0; axis < 3; axis++) centroid[axis] += triangle * (points[0][axis] + points[i][axis] + points[i + 1][axis]) / 3;
  }
  if (!(area > 1e-9)) return null;
  for (let axis = 0; axis < 3; axis++) centroid[axis] /= area;
  return { points, normal, area, centroid, skin, plate };
}

interface Edge { facet: number; a: SkinPoint; dir: SkinPoint; length: number }

/**
 * Shared border length between facets, and per facet edge the facets along it with their overlap. Pieces were clipped
 * independently, so a long edge may meet several shorter ones (T-junctions): edges are matched by lying on one line and
 * overlapping, not by equal end points.
 */
function edgeAdjacency(facets: readonly ArmorPanelFacet[]): {
  neighbours: Array<Map<number, number>>;
  edges: Edge[];
  edgeStart: Int32Array;
  along: Array<Array<[number, number]>>;
} {
  const edges: Edge[] = [];
  const edgeStart = new Int32Array(facets.length + 1);
  facets.forEach((facet, index) => {
    edgeStart[index] = edges.length;
    for (let i = 0; i < facet.points.length; i++) {
      const a = facet.points[i], b = facet.points[(i + 1) % facet.points.length];
      const span = sub(b, a);
      const length = Math.hypot(span[0], span[1], span[2]);
      edges.push({ facet: index, a, dir: length > 1e-12 ? [span[0] / length, span[1] / length, span[2] / length] : [0, 0, 0], length });
    }
  });
  edgeStart[facets.length] = edges.length;
  const grid = new Map<string, number[]>();
  const cellsOf = (edge: Edge): string[] => {
    const b: SkinPoint = [edge.a[0] + edge.dir[0] * edge.length, edge.a[1] + edge.dir[1] * edge.length, edge.a[2] + edge.dir[2] * edge.length];
    const lo = [0, 1, 2].map((axis) => Math.floor((Math.min(edge.a[axis], b[axis]) - EDGE_LINE_M) / GRID_M));
    const hi = [0, 1, 2].map((axis) => Math.floor((Math.max(edge.a[axis], b[axis]) + EDGE_LINE_M) / GRID_M));
    const keys: string[] = [];
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) keys.push(`${x},${y},${z}`);
    return keys;
  };
  edges.forEach((edge, index) => {
    if (!(edge.length > EDGE_OVERLAP_M)) return;
    for (const key of cellsOf(edge)) {
      let list = grid.get(key);
      if (!list) { list = []; grid.set(key, list); }
      list.push(index);
    }
  });
  const neighbours = facets.map(() => new Map<number, number>());
  const along: Array<Array<[number, number]>> = edges.map(() => []);
  const tested = new Set<number>();
  for (const list of grid.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const p = list[i] < list[j] ? list[i] : list[j], q = list[i] < list[j] ? list[j] : list[i];
        const e = edges[p], f = edges[q];
        if (e.facet === f.facet) continue;
        const pair = p * edges.length + q;
        if (tested.has(pair)) continue;
        tested.add(pair);
        const fb: SkinPoint = [f.a[0] + f.dir[0] * f.length, f.a[1] + f.dir[1] * f.length, f.a[2] + f.dir[2] * f.length];
        const ra = sub(f.a, e.a), rb = sub(fb, e.a);
        const ta = dot(ra, e.dir), tb = dot(rb, e.dir);
        const offA = Math.hypot(ra[0] - e.dir[0] * ta, ra[1] - e.dir[1] * ta, ra[2] - e.dir[2] * ta);
        const offB = Math.hypot(rb[0] - e.dir[0] * tb, rb[1] - e.dir[1] * tb, rb[2] - e.dir[2] * tb);
        if (offA > EDGE_LINE_M || offB > EDGE_LINE_M) continue;
        const overlap = Math.min(e.length, Math.max(ta, tb)) - Math.max(0, Math.min(ta, tb));
        if (!(overlap > EDGE_OVERLAP_M)) continue;
        along[p].push([f.facet, overlap]);
        along[q].push([e.facet, overlap]);
        neighbours[e.facet].set(f.facet, (neighbours[e.facet].get(f.facet) || 0) + overlap);
        neighbours[f.facet].set(e.facet, (neighbours[f.facet].get(e.facet) || 0) + overlap);
      }
    }
  }
  return { neighbours, edges, edgeStart, along };
}

interface Group { plate: unknown; sum: SkinPoint; area: number; facets: Set<number>; points: SkinPoint[] }

const meanNormal = (group: Group): SkinPoint => {
  const size = Math.hypot(group.sum[0], group.sum[1], group.sum[2]) || 1;
  return [group.sum[0] / size, group.sum[1] / size, group.sum[2] / size];
};

/** Samples spread over a panel: the facet nearest its centre, then the farthest from those taken (large facets only). */
function panelSamples(facets: readonly ArmorPanelFacet[], members: readonly number[], area: number): { samples: SkinPoint[]; weights: number[] } {
  const centre: SkinPoint = [0, 0, 0];
  let largest = 0;
  for (const index of members) {
    const facet = facets[index];
    largest = Math.max(largest, facet.area);
    for (let axis = 0; axis < 3; axis++) centre[axis] += facet.centroid[axis] * facet.area / area;
  }
  const candidates = members.filter((index) => facets[index].area >= largest * 0.1);
  const count = Math.max(1, Math.min(MAX_SAMPLES, Math.round(area / SAMPLE_AREA_M2), candidates.length));
  const chosen: number[] = [];
  let first = candidates[0];
  for (const index of candidates) if (distance(facets[index].centroid, centre) < distance(facets[first].centroid, centre)) first = index;
  chosen.push(first);
  while (chosen.length < count) {
    let best = -1, bestScore = -1;
    for (const index of candidates) {
      if (chosen.includes(index)) continue;
      let near = Infinity;
      for (const taken of chosen) near = Math.min(near, distance(facets[index].centroid, facets[taken].centroid));
      const score = near * Math.sqrt(facets[index].area);
      if (score > bestScore) { bestScore = score; best = index; }
    }
    if (best < 0) break;
    chosen.push(best);
  }
  const weights = chosen.map(() => 0);
  for (const index of members) {
    let nearest = 0;
    for (let k = 1; k < chosen.length; k++) {
      if (distance(facets[index].centroid, facets[chosen[k]].centroid) < distance(facets[index].centroid, facets[chosen[nearest]].centroid)) nearest = k;
    }
    weights[nearest] += facets[index].area / area;
  }
  return { samples: chosen.map((index) => facets[index].centroid), weights };
}

function buildPanelSet(skin: readonly ArmorSkinPanel[], plates: Parameters<typeof zonePlates>[0]): ArmorPanelSet {
  const zones = zonePlates(plates);
  const facets: ArmorPanelFacet[] = [];
  skin.forEach((panel, index) => {
    for (const piece of panel.pieces) {
      for (const part of zones.length ? splitByZones(zones, piece, panel.normal) : [{ zone: -1, points: piece }]) {
        const facet = facetOf(part.points, panel.normal, index, part.zone >= 0 ? zones[part.zone].plate : panel.plate);
        if (facet) facets.push(facet);
      }
    }
  });
  const plateOf = (facet: number): unknown => facets[facet].plate;
  const { neighbours, edgeStart, along } = edgeAdjacency(facets);

  // region growing: largest facets seed, one zone, normals within the spread of the panel's mean
  const owner = new Int32Array(facets.length).fill(-1);
  const groups: Group[] = [];
  const order = facets.map((_, index) => index).sort((a, b) => facets[b].area - facets[a].area || a - b);
  for (const seed of order) {
    if (owner[seed] >= 0) continue;
    const group: Group = { plate: plateOf(seed), sum: [0, 0, 0], area: 0, facets: new Set(), points: [] };
    const id = groups.length;
    groups.push(group);
    const add = (index: number): void => {
      owner[index] = id;
      group.facets.add(index);
      group.area += facets[index].area;
      for (let axis = 0; axis < 3; axis++) group.sum[axis] += facets[index].normal[axis] * facets[index].area;
      group.points.push(...facets[index].points);
    };
    // the slab test: every corner of the panel with the candidate within PANEL_SLAB_M about the trial mean plane
    const fits = (index: number): boolean => {
      const facet = facets[index];
      const trial = meanNormal({ ...group, sum: [group.sum[0] + facet.normal[0] * facet.area,
        group.sum[1] + facet.normal[1] * facet.area, group.sum[2] + facet.normal[2] * facet.area] });
      let low = Infinity, high = -Infinity;
      for (const point of group.points) { const value = dot(trial, point); low = Math.min(low, value); high = Math.max(high, value); }
      for (const point of facet.points) { const value = dot(trial, point); low = Math.min(low, value); high = Math.max(high, value); }
      return high - low <= PANEL_SLAB_M;
    };
    add(seed);
    const queue = [seed];
    while (queue.length) {
      const index = queue.shift() as number;
      for (const next of [...neighbours[index].keys()].sort((a, b) => facets[b].area - facets[a].area || a - b)) {
        if (owner[next] >= 0 || plateOf(next) !== group.plate) continue;
        if (dot(facets[next].normal, meanNormal(group)) < PANEL_SPREAD_COS || !fits(next)) continue;
        add(next);
        queue.push(next);
      }
    }
  }

  const move = (index: number, to: number): void => {
    const from = groups[owner[index]];
    from.facets.delete(index);
    from.area -= facets[index].area;
    for (let axis = 0; axis < 3; axis++) from.sum[axis] -= facets[index].normal[axis] * facets[index].area;
    const target = groups[to];
    target.facets.add(index);
    target.area += facets[index].area;
    for (let axis = 0; axis < 3; axis++) target.sum[axis] += facets[index].normal[axis] * facets[index].area;
    owner[index] = to;
  };

  // slivers and fans join the neighbour they share the most border with; a zone's largest panel stays unless the
  // zone is noise
  const zoneArea = new Map<unknown, number>();
  for (const group of groups) zoneArea.set(group.plate, (zoneArea.get(group.plate) || 0) + group.area);
  const protectedGroup = (id: number): boolean => {
    const group = groups[id];
    if ((zoneArea.get(group.plate) || 0) < MIN_ZONE_M2) return false;
    for (let other = 0; other < groups.length; other++) {
      if (other !== id && groups[other].facets.size && groups[other].plate === group.plate && groups[other].area > group.area) return false;
    }
    return true;
  };
  for (;;) {
    let smallest = -1;
    for (let id = 0; id < groups.length; id++) {
      const group = groups[id];
      if (!group.facets.size || group.area >= MIN_PANEL_M2 || protectedGroup(id)) continue;
      if (smallest < 0 || group.area < groups[smallest].area) smallest = id;
    }
    if (smallest < 0) break;
    const shared = new Map<number, number>();
    for (const index of groups[smallest].facets) {
      for (const [next, length] of neighbours[index]) {
        const other = owner[next];
        if (other !== smallest) shared.set(other, (shared.get(other) || 0) + length);
      }
    }
    let target = -1, best = 0;
    const own = meanNormal(groups[smallest]);
    for (const [other, length] of shared) {
      const score = length * (groups[other].plate === groups[smallest].plate ? 2 : 1) * Math.max(0.2, dot(own, meanNormal(groups[other])));
      if (score > best) { best = score; target = other; }
    }
    if (target < 0) { zoneArea.set(groups[smallest].plate, 0); groups[smallest].area = Math.max(groups[smallest].area, MIN_PANEL_M2); continue; }
    for (const index of [...groups[smallest].facets]) move(index, target);
  }

  // borders run straight: a facet with more border on a neighbouring panel than on its own moves across
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    let moved = 0;
    for (let index = 0; index < facets.length; index++) {
      const id = owner[index];
      const group = groups[id];
      if (group.facets.size < 2 || facets[index].area > group.area * SMOOTH_SHARE) continue;
      const shared = new Map<number, number>();
      for (const [next, length] of neighbours[index]) shared.set(owner[next], (shared.get(owner[next]) || 0) + length);
      const own = shared.get(id) || 0;
      let target = -1, best = own;
      for (const [other, length] of shared) {
        if (other === id || length <= best) continue;
        if (dot(facets[index].normal, meanNormal(groups[other])) < NEIGHBOUR_CREASE_COS) continue;
        best = length; target = other;
      }
      if (target >= 0) { move(index, target); moved++; }
    }
    if (!moved) break;
  }

  const panels: ArmorPanel[] = [];
  const panelOf = new Map<number, number>();
  groups.forEach((group, id) => {
    if (!group.facets.size) return;
    const members = [...group.facets].sort((a, b) => a - b);
    let area = 0;
    for (const index of members) area += facets[index].area;
    // the zone is the plate most of the panel's area resolves to
    const byPlate = new Map<unknown, number>();
    for (const index of members) byPlate.set(plateOf(index), (byPlate.get(plateOf(index)) || 0) + facets[index].area);
    let plate = group.plate, most = -1;
    for (const [candidate, share] of byPlate) if (share > most) { most = share; plate = candidate; }
    const { samples, weights } = panelSamples(facets, members, area);
    panelOf.set(id, panels.length);
    panels.push({ plate, normal: meanNormal(group), area, facets: members, samples, weights });
  });
  const facetPanel = new Int32Array(facets.length);
  for (let index = 0; index < facets.length; index++) facetPanel[index] = panelOf.get(owner[index]) as number;

  // a facet edge is a border unless most of it runs along facets of its own panel
  const borders = new Uint8Array(edgeStart[facets.length]);
  for (let index = 0; index < facets.length; index++) {
    const facet = facets[index];
    for (let i = 0; i < facet.points.length; i++) {
      const edge = edgeStart[index] + i;
      const length = distance(facet.points[i], facet.points[(i + 1) % facet.points.length]);
      let own = 0;
      for (const [next, overlap] of along[edge]) if (facetPanel[next] === facetPanel[index]) own += overlap;
      borders[edge] = own < length * 0.5 ? 1 : 0;
    }
  }
  return { skin, facets, panels, facetPanel, edgeStart, borders };
}

const sets = new WeakMap<object, ArmorPanelSet>();

/**
 * The flashlight panels of one frame's collision cells, zoned by the frame's authored plates (cached per cell list;
 * read-only).
 */
export function armorPanelSet(
  cells: Parameters<typeof armorSkinPanels>[0],
  plates: Parameters<typeof zonePlates>[0],
): ArmorPanelSet | null {
  if (!cells?.length) return null;
  let set = sets.get(cells);
  if (!set) {
    set = buildPanelSet(armorSkinPanels(cells), plates);
    sets.set(cells, set);
  }
  return set.facets.length ? set : null;
}
