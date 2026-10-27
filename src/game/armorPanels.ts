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
//   - neighbouring panels of one zone that still fit one slab merge (the small steps between the cells' slices);
//   - a facet poking into a neighbouring panel of its zone (more border with it than with its own) moves across, so
//     borders between panels run straight instead of in teeth;
//   - lines are drawn on zone borders and corners only: panels of one zone show their colours, not a line;
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
/** Two panels of one zone merge (steps between the cells' slices) only within this of each other's normal (45°). */
const MERGE_COS = Math.cos((45 * Math.PI) / 180);
/** Neighbouring pieces this close in direction (35°) are one surface: their zones' border may be straightened. */
const SAME_SURFACE_COS = Math.cos((35 * Math.PI) / 180);
/** Opposite faces this close (m) and this nearly opposite (|cos|) are a crack between slices, not armour skin. */
const CRACK_M = 0.04;
const CRACK_FACING = 0.995;
/** Facets meeting at more than this (70°) are a corner and outlined even within one zone; the cells' slicing wedges
 * fold less. */
const CORNER_COS = Math.cos((70 * Math.PI) / 180);
/** A facet narrower than about this (m: its area over its longest edge) is a sliver and draws no outline. */
const SLIVER_WIDTH_M = 0.015;
/** Panels under this area (m²) are slivers, fans and fittings, not armour plates. */
const MIN_PANEL_M2 = 0.06;
/** A zone whose largest panel is smaller than this (m²) is noise (slivers of slice caps): it keeps no panel of its own. */
const MIN_ZONE_M2 = 0.02;
/** A facet moves to the neighbouring panel it shares more border with only while it is this small a part of its own. */
const SMOOTH_SHARE = 0.3;
const SMOOTH_PASSES = 3;
/** One sample per this much panel area (m²), at most MAX_SAMPLES. */
const SAMPLE_AREA_M2 = 0.6;
const MAX_SAMPLES = 4;
/**
 * Edges this close to one line (m) and overlapping by more than EDGE_OVERLAP_M are one shared edge: neighbouring
 * slices of the cells meet up to a few centimetres apart (a step and its sliver of cap between), and still border.
 */
const EDGE_LINE_M = 0.04;
const EDGE_OVERLAP_M = 2e-3;
/** Edges this parallel (|cos|) may be one line (about 11°). */
const PARALLEL_DOT = 0.98;

interface ArmorPanelFacet {
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

interface ArmorPanel {
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

interface ArmorPanelSet {
  readonly skin: readonly ArmorSkinPanel[];
  readonly facets: readonly ArmorPanelFacet[];
  readonly panels: readonly ArmorPanel[];
  /** The panel of each facet. */
  readonly facetPanel: Int32Array;
  /** Whether each facet edge (points[i] → points[i + 1]) is outlined (a zone border or a crease): its per-facet offset
   * into `borders`. */
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
  // facet pairs whose bounds (grown by the line tolerance) overlap, by a sweep along x; then their edge pairs
  const bounds = facets.map((facet) => {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const point of facet.points) for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], point[axis] - EDGE_LINE_M); max[axis] = Math.max(max[axis], point[axis] + EDGE_LINE_M);
    }
    return { min, max };
  });
  const byX = facets.map((_, index) => index).sort((a, b) => bounds[a].min[0] - bounds[b].min[0] || a - b);
  const neighbours = facets.map(() => new Map<number, number>());
  const along: Array<Array<[number, number]>> = edges.map(() => []);
  for (let i = 0; i < byX.length; i++) {
    const a = byX[i], A = bounds[a];
    for (let j = i + 1; j < byX.length; j++) {
      const b = byX[j], B = bounds[b];
      if (B.min[0] > A.max[0]) break;
      if (B.min[1] > A.max[1] || B.max[1] < A.min[1] || B.min[2] > A.max[2] || B.max[2] < A.min[2]) continue;
      for (let p = edgeStart[a]; p < edgeStart[a + 1]; p++) {
        const e = edges[p];
        if (!(e.length > EDGE_OVERLAP_M)) continue;
        const ex = e.a[0], ey = e.a[1], ez = e.a[2], dx = e.dir[0], dy = e.dir[1], dz = e.dir[2];
        for (let q = edgeStart[b]; q < edgeStart[b + 1]; q++) {
          const f = edges[q];
          if (!(f.length > EDGE_OVERLAP_M)) continue;
          // one line: nearly parallel (a short edge off the line cannot overlap it by much), both ends on it
          const parallel = dx * f.dir[0] + dy * f.dir[1] + dz * f.dir[2];
          if (parallel < PARALLEL_DOT && parallel > -PARALLEL_DOT) continue;
          const ax = f.a[0] - ex, ay = f.a[1] - ey, az = f.a[2] - ez;
          const ta = ax * dx + ay * dy + az * dz;
          const ox = ax - dx * ta, oy = ay - dy * ta, oz = az - dz * ta;
          if (ox * ox + oy * oy + oz * oz > EDGE_LINE_M * EDGE_LINE_M) continue;
          const bx = ax + f.dir[0] * f.length, by = ay + f.dir[1] * f.length, bz = az + f.dir[2] * f.length;
          const tb = bx * dx + by * dy + bz * dz;
          const px = bx - dx * tb, py = by - dy * tb, pz = bz - dz * tb;
          if (px * px + py * py + pz * pz > EDGE_LINE_M * EDGE_LINE_M) continue;
          const overlap = Math.min(e.length, Math.max(ta, tb)) - Math.max(0, Math.min(ta, tb));
          if (!(overlap > EDGE_OVERLAP_M)) continue;
          along[p].push([b, overlap]);
          along[q].push([a, overlap]);
          neighbours[a].set(b, (neighbours[a].get(b) || 0) + overlap);
          neighbours[b].set(a, (neighbours[b].get(a) || 0) + overlap);
        }
      }
    }
  }
  return { neighbours, edges, edgeStart, along };
}

/**
 * Slices of the cells that stop a few centimetres short of each other leave a crack: the two caps either side face
 * each other, both outer skin, and seen edge-on from the side they draw as lines. Facets facing each other (opposite
 * normals) across less than CRACK_M, one's centre over the other, are the inside of the armour: both go.
 */
function dropCracks(facets: ArmorPanelFacet[]): void {
  const drop = new Set<number>();
  const order = facets.map((_, index) => index).sort((a, b) => facets[a].centroid[0] - facets[b].centroid[0] || a - b);
  const reach = facets.map((facet) => {
    let radius = 0;
    for (const point of facet.points) radius = Math.max(radius, distance(point, facet.centroid));
    return radius;
  });
  let widest = 0;
  for (const radius of reach) widest = Math.max(widest, radius);
  const over = (top: ArmorPanelFacet, below: ArmorPanelFacet): boolean => {
    const depth = dot(below.normal, sub(top.centroid, below.points[0]));
    if (Math.abs(depth) > CRACK_M) return false;
    const projected: SkinPoint = [top.centroid[0] - below.normal[0] * depth, top.centroid[1] - below.normal[1] * depth,
      top.centroid[2] - below.normal[2] * depth];
    for (let i = 0; i < below.points.length; i++) {
      const a = below.points[i], b = below.points[(i + 1) % below.points.length];
      if (dot(cross(sub(b, a), sub(projected, a)), below.normal) < 0) return false;
    }
    return true;
  };
  for (let i = 0; i < order.length; i++) {
    const a = facets[order[i]];
    for (let j = i + 1; j < order.length; j++) {
      const b = facets[order[j]];
      if (b.centroid[0] - a.centroid[0] > reach[order[i]] + widest + CRACK_M) break;
      if (dot(a.normal, b.normal) > -CRACK_FACING || distance(a.centroid, b.centroid) > reach[order[i]] + reach[order[j]] + CRACK_M) continue;
      if (over(a, b) || over(b, a)) { drop.add(order[i]); drop.add(order[j]); }
    }
  }
  if (!drop.size) return;
  let kept = 0;
  for (let index = 0; index < facets.length; index++) if (!drop.has(index)) facets[kept++] = facets[index];
  facets.length = kept;
}

interface Group {
  plate: unknown; sum: SkinPoint; area: number; facets: Set<number>; points: SkinPoint[];
  /** The group's corners' extent along its mean normal (the slab), kept while growing. */
  low: number; high: number;
}

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
  const zoneOf = new Map<unknown, number>();
  zones.forEach((zone, index) => zoneOf.set(zone.plate, index));
  // the skin's pieces as the authority zones them (each the plate its face resolves to); a piece may change only to
  // the zone of a neighbour on the same surface, so the classifier straightens the borders the authority zigzags and
  // never re-zones a face it gives one plate whole
  const base: ArmorPanelFacet[] = [];
  skin.forEach((panel, index) => {
    for (const piece of panel.pieces) {
      const facet = facetOf(piece, panel.normal, index, panel.plate);
      if (facet) base.push(facet);
    }
  });
  const baseNeighbours = zones.length ? edgeAdjacency(base).neighbours : [];
  const facets: ArmorPanelFacet[] = [];
  base.forEach((piece, index) => {
    const own = zoneOf.get(piece.plate);
    const allowed = new Set<number>();
    if (own !== undefined) allowed.add(own);
    for (const next of baseNeighbours[index]?.keys() || []) {
      const zone = zoneOf.get(base[next].plate);
      if (zone !== undefined && dot(base[next].normal, piece.normal) >= SAME_SURFACE_COS) allowed.add(zone);
    }
    if (allowed.size < 2) { facets.push(piece); return; }
    for (const part of splitByZones(zones, piece.points as SkinPoint[], piece.normal, allowed)) {
      const facet = facetOf(part.points, piece.normal, piece.skin, part.zone >= 0 ? zones[part.zone].plate : piece.plate);
      if (facet) facets.push(facet);
    }
  });
  dropCracks(facets);
  const plateOf = (facet: number): unknown => facets[facet].plate;
  const { neighbours, edgeStart, along } = edgeAdjacency(facets);

  // region growing: largest facets seed, one zone, normals within the spread of the panel's mean
  const owner = new Int32Array(facets.length).fill(-1);
  const groups: Group[] = [];
  const order = facets.map((_, index) => index).sort((a, b) => facets[b].area - facets[a].area || a - b);
  for (const seed of order) {
    if (owner[seed] >= 0) continue;
    const group: Group = { plate: plateOf(seed), sum: [0, 0, 0], area: 0, facets: new Set(), points: [], low: 0, high: 0 };
    const id = groups.length;
    groups.push(group);
    const add = (index: number): void => {
      owner[index] = id;
      group.facets.add(index);
      group.area += facets[index].area;
      for (let axis = 0; axis < 3; axis++) group.sum[axis] += facets[index].normal[axis] * facets[index].area;
      group.points.push(...facets[index].points);
      const normal = meanNormal(group);
      group.low = Infinity; group.high = -Infinity;
      for (const point of group.points) {
        const value = dot(normal, point);
        if (value < group.low) group.low = value;
        if (value > group.high) group.high = value;
      }
    };
    // the slab test: the panel's corners and the candidate's within PANEL_SLAB_M along the panel's mean normal
    const fits = (index: number): boolean => {
      const normal = meanNormal(group);
      let low = group.low, high = group.high;
      for (const point of facets[index].points) {
        const value = dot(normal, point);
        if (value < low) low = value;
        if (value > high) high = value;
      }
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

  // slivers and fans join the neighbour they share the most border with; a zone's largest panel stays unless it too
  // is a sliver
  const isolated = new Set<number>();
  const largest = new Map<unknown, number>();
  groups.forEach((group, id) => {
    const held = largest.get(group.plate);
    if (held === undefined || group.area > groups[held].area) largest.set(group.plate, id);
  });
  const protectedGroup = (id: number): boolean => largest.get(groups[id].plate) === id && groups[id].area >= MIN_ZONE_M2;
  for (;;) {
    let smallest = -1;
    for (let id = 0; id < groups.length; id++) {
      const group = groups[id];
      if (!group.facets.size || group.area >= MIN_PANEL_M2 || isolated.has(id) || protectedGroup(id)) continue;
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
    if (target < 0) { isolated.add(smallest); continue; }
    for (const index of [...groups[smallest].facets]) move(index, target);
  }

  // the steps between slices: neighbouring panels of one zone whose union still fits one slab merge, the longest
  // shared border first
  const slabUnion = (first: Iterable<number>, second: Iterable<number>, normal: SkinPoint): number => {
    let low = Infinity, high = -Infinity;
    for (const members of [first, second]) for (const index of members) for (const point of facets[index].points) {
      const value = dot(normal, point);
      low = Math.min(low, value); high = Math.max(high, value);
    }
    return high - low;
  };
  const version = new Int32Array(groups.length);
  const failed = new Map<number, number>();
  for (;;) {
    const pairs = new Map<number, number>();
    for (let index = 0; index < facets.length; index++) {
      for (const [next, length] of neighbours[index]) {
        const a = owner[index], b = owner[next];
        if (a >= b || groups[a].plate !== groups[b].plate) continue;
        const key = a * groups.length + b;
        pairs.set(key, (pairs.get(key) || 0) + length);
      }
    }
    const order = [...pairs].sort((x, y) => y[1] - x[1] || x[0] - y[0]);
    let merged = false;
    // one pass merges every pair it can whose panels have not changed in it, the longest shared border first
    const touched = new Set<number>();
    for (const [key] of order) {
      const a = Math.floor(key / groups.length), b = key % groups.length;
      if (touched.has(a) || touched.has(b)) continue;
      const stamp = version[a] * 65536 + version[b];
      if (failed.get(key) === stamp) continue;
      const normal = meanNormal({ ...groups[a], sum: [groups[a].sum[0] + groups[b].sum[0], groups[a].sum[1] + groups[b].sum[1], groups[a].sum[2] + groups[b].sum[2]] });
      if (dot(meanNormal(groups[a]), meanNormal(groups[b])) < MERGE_COS || slabUnion(groups[a].facets, groups[b].facets, normal) > PANEL_SLAB_M) {
        failed.set(key, stamp);
        continue;
      }
      for (const index of [...groups[b].facets]) move(index, a);
      version[a]++; version[b]++;
      touched.add(a); touched.add(b);
      merged = true;
    }
    if (!merged) break;
  }

  // borders within a zone run straight: a facet with more border on a neighbouring panel of its zone than on its own
  // moves across (zone borders are straight already)
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
        if (other === id || length <= best || groups[other].plate !== group.plate) continue;
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

  // a facet edge is outlined where most of it runs along another zone or round a corner (CORNER: the silhouette's
  // edges): the plates' borders, never a fold or a panel change within one plate (its colours show that). An edge with
  // nothing beside it (a crack between slices) and a sliver (a slice cap's exposed rim, seen edge-on) outline nothing:
  // the skin is closed, so a border always has its other side
  const borders = new Uint8Array(edgeStart[facets.length]);
  for (let index = 0; index < facets.length; index++) {
    const facet = facets[index];
    const zone = panels[facetPanel[index]].plate;
    let longest = 0;
    for (let i = 0; i < facet.points.length; i++) longest = Math.max(longest, distance(facet.points[i], facet.points[(i + 1) % facet.points.length]));
    if (facet.area < SLIVER_WIDTH_M * longest) continue;
    for (let i = 0; i < facet.points.length; i++) {
      const edge = edgeStart[index] + i;
      const length = distance(facet.points[i], facet.points[(i + 1) % facet.points.length]);
      let loud = 0;
      for (const [next, overlap] of along[edge]) {
        if (panels[facetPanel[next]].plate !== zone || dot(facets[next].normal, facet.normal) < CORNER_COS) loud += overlap;
      }
      borders[edge] = loud >= length * 0.5 ? 1 : 0;
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
