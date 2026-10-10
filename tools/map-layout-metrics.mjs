#!/usr/bin/env node
// Map layout metrics (maps-and-layouts lane, 2026-10-01): the measurable checks of docs/MAP-LAYOUT-BRIEF.md computed
// in Node from the same inputs a dedicated host plays on — the map config's height field (terrain seed of the
// collision manifest index) and the committed collision manifest (server/world-collision-manifests/<map>.json).
// No browser, no vite: a whole fleet census runs in about a minute.
//
//   node tools/map-layout-metrics.mjs                         every map, table on stdout
//   node tools/map-layout-metrics.mjs --maps=urban,railyard   a subset
//   node tools/map-layout-metrics.mjs --json=out.json         also write the full rows
//   node tools/map-layout-metrics.mjs --check                 exit 1 when a map misses a brief target (see TARGETS)
//
// What it measures (the brief explains why each one matters):
//   spawns    the authored player pad and the enemy arc centroid (the anchors every objective derives from), their
//             straight separation, the driven route between them over a 5 m passability raster, and whether each
//             anchor is screened from the other
//   lanes     approach lanes across three slices of the spawn axis (35 / 50 / 65 %): drivable points every 20 m that
//             lie on an alpha → bravo route at most 1.6x the shortest, grouped while neighbours see each other and the
//             foliage between them stays thin — a lane is a group at least 40 m wide; the count is the median slice
//   chokes    passable width of every slice across the spawn axis between 20 % and 80 % of the way (min / p10 /
//             median) and the fewest separate passable runs any slice keeps
//   sight     radial viewsheds from a 20 m lattice of drivable points (eye 2.4 m, target 1.9 m above ground) over
//             terrain plus every non-tree collider: the distance to the first occlusion per ray — histogram, median,
//             the long-lane share (>= 300 m) and the close-quarters share (< 100 m)
//   cover     per sector (three bands along the axis x three across it): the share of drivable 10 m cells that a
//             feature within 40 m toward the opposing spawn hides completely (>= 2.3 m above the ground) or hull-down
//             (1.1–2.3 m: the hull masked, the gun clear), and the exposure — the share of rays from the opposing half
//             that see the cell
//   relief    standard deviation of the drivable height and the flat share (30 m windows with < 1 m relief)
//   dressing  buildings farther than 60 m from any road, solid props whose footprint enters the carriageway (3.5 m;
//             hedgehog and barrier roadblocks are reported apart), and solid props standing in water, each by kind
//   objectives the zone-control, capture-the-flag and turbo-ball placements through the real match placement
//             (src/sim/matchPlacement.ts) with each team's driven distance to every objective and the worst
//             alpha/bravo distance ratio (symmetry)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const WORLD_HALF_M = 500;
export const SIGHT_RASTER_M = 2;
export const PASS_RASTER_M = 5;
export const ARENA_HALF_M = 470;
export const OBSERVER_SPACING_M = 20;
export const OBSERVER_HALF_M = 440;
export const SIGHT_AZIMUTHS = 24;
export const SIGHT_MAX_M = 445;
/** A sightline breaks where the target stays hidden this many metres in a row (more than a hull length). */
export const SIGHT_SUSTAIN_M = 24;
export const EYE_M = 2.4;
export const TARGET_M = 1.9;
export const COVER_RANGE_M = 40;
/** Colliders whose longest horizontal side is under this are left out of the occluding surface (posts, beams, drums). */
export const THIN_COLLIDER_M = 2.5;
export const COVER_FULL_M = 2.3;
export const COVER_HULL_M = 1.1;
/** The carriageway half-width a solid prop must stay out of (the road mask's edge sits at ~3.85 m). */
export const ROAD_CORE_M = 3.5;
/** Deliberate roadblocks: reported, but not counted as dressing that wandered into a road. */
// (2026-10-06, the map-revival lane: a burnt tram on its track — Ruinspires' boulevard, maps/sarajevoStreets.ts — blocks a road
// as a hedgehog does, deliberately)
export const ROADBLOCK_KINDS = new Set(['hedgehog', 'barrier', 'tram-wreck']);
export const ORPHAN_ROAD_M = 60;
/** Lane points sit this far apart along each slice across the spawn axis. */
export const LANE_POINT_M = 20;
export const LANE_STRETCH = 1.6;
export const SIGHT_BINS = Object.freeze([50, 100, 200, 300, SIGHT_MAX_M]);
// A roster-independent tracked drivetrain — the same one src/sim/matchPlacementAccess.ts proves objective access with.
export const LAYOUT_DRIVETRAIN = Object.freeze({ enginePowerHp: 900, weightTons: 60,
  terrainResistance: Object.freeze({ hard: 1, medium: 1.2, soft: 1.8 }) });

/**
 * Brief targets (docs/MAP-LAYOUT-BRIEF.md "Measurable checks"). Each is [min, max] (null = unbounded); a map may name
 * a deliberate exception in its config (`layoutBrief: { exceptions: { <key>: 'reason' } }`) — the check then reports
 * the reason instead of failing — or hold a band of its own (`layoutBrief: { bands: { <key>: { band: [min, max],
 * reason } } }`, see briefTargets), which is enforced like the shared one.
 */
export const TARGETS = Object.freeze({
  spawnSeparationM: [600, 860],
  spawnScreened: [1, null],
  routeStretch: [null, 1.45],
  lanes: [3, null],
  chokeMinM: [120, null],
  sightMedianM: [80, 150],
  sightLongShare: [0.03, 0.15],
  sightCloseShare: [0.25, 0.62],
  coverMidShare: [0.30, 0.75],
  coverSectorMin: [0.15, null],
  hullDownTeamShare: [0.10, null],
  reliefStdM: [3, null],
  orphanBuildingShare: [null, 0.15],
  solidPropsInRoad: [null, 0],
  solidPropsInWater: [null, 0],
  objectiveSymmetry: [null, 1.25],
});

// ------------------------------------------------------------------------------------------------ small helpers

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/** Index helpers of a square raster that spans [-half, half] with `step` metre cells (node at -half + i * step). */
export function rasterSpec(half, step) {
  const n = Math.round((2 * half) / step) + 1;
  return {
    half, step, n,
    index(x, z) {
      const i = Math.round((x + half) / step), j = Math.round((z + half) / step);
      if (i < 0 || j < 0 || i >= n || j >= n) return -1;
      return j * n + i;
    },
    x(i) { return -half + (i % n) * step; },
    z(i) { return -half + Math.floor(i / n) * step; },
  };
}

/** Bilinear sample of a raster at a world point (clamped to the raster). */
export function sampleRaster(spec, values, x, z) {
  const fx = clamp((x + spec.half) / spec.step, 0, spec.n - 1.000001);
  const fz = clamp((z + spec.half) / spec.step, 0, spec.n - 1.000001);
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
  const a = values[j * spec.n + i], b = values[j * spec.n + i + 1];
  const c = values[(j + 1) * spec.n + i], d = values[(j + 1) * spec.n + i + 1];
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
}

function percentile(sorted, q) {
  if (!sorted.length) return null;
  return sorted[clamp(Math.floor(q * (sorted.length - 1) + 0.5), 0, sorted.length - 1)];
}

function round(v, digits = 2) {
  if (v == null || !Number.isFinite(v)) return v ?? null;
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}

/** The steepest grade a drivetrain can hold both ways on a ground type (bisection on the shared margin law). */
export function maximumTwoWayGrade(terrainSlopeMargin, spec, ground = 'medium', eps = 0.01) {
  let lo = 0, hi = 2;
  for (let i = 0; i < 40; i++) {
    const g = (lo + hi) * 0.5;
    const ok = terrainSlopeMargin(spec, ground, g) > eps && terrainSlopeMargin(spec, ground, -g) > eps;
    if (ok) lo = g; else hi = g;
  }
  return lo;
}

// ------------------------------------------------------------------------------------------------ geometry frame

/** Spawn frame: alpha = the player pad, bravo = the enemy arc centroid (matchPlacementAnchors' anchors). */
export function spawnFrame(spawns) {
  const alpha = { x: spawns.player.x, z: spawns.player.z };
  let bx = 0, bz = 0;
  for (const e of spawns.enemies) { bx += e.x; bz += e.z; }
  const n = Math.max(1, spawns.enemies.length);
  const bravo = { x: bx / n, z: bz / n };
  const dx = bravo.x - alpha.x, dz = bravo.z - alpha.z, length = Math.hypot(dx, dz) || 1;
  const ux = dx / length, uz = dz / length;
  const mid = { x: (alpha.x + bravo.x) / 2, z: (alpha.z + bravo.z) / 2 };
  return {
    alpha, bravo, mid, length, ux, uz, vx: uz, vz: -ux,
    /** 0 at alpha, 1 at bravo. */
    along(x, z) { return ((x - alpha.x) * ux + (z - alpha.z) * uz) / length; },
    lateral(x, z) { return (x - mid.x) * uz - (z - mid.z) * ux; },
  };
}

export const SECTOR_BANDS = Object.freeze(['alpha', 'mid', 'bravo']);
export const SECTOR_FLANKS = Object.freeze(['left', 'centre', 'right']);
export const FLANK_SPLIT_M = 120;
/** Sector statistics ignore the backfield more than this share of the spawn separation behind either anchor. */
export const SECTOR_BACKFIELD = 0.15;

export function sectorOf(frame, x, z) {
  const a = frame.along(x, z), l = frame.lateral(x, z);
  const band = a < 1 / 3 ? 0 : a > 2 / 3 ? 2 : 1;
  const flank = l < -FLANK_SPLIT_M ? 0 : l > FLANK_SPLIT_M ? 2 : 1;
  return band * 3 + flank;
}

// ------------------------------------------------------------------------------------------------ viewshed

/**
 * One radial sweep from an observer: walks `maxM` metres at the raster step, returns the first occlusion distance
 * (maxM when the whole ray stays visible) and calls `visit(index, visible)` for every drivable target sample.
 * A target is visible when the slope to its top is not below the steepest surface slope seen so far.
 */
export function sweepRay(spec, ground, surface, solid, ox, oz, dirX, dirZ, eyeM, targetM, maxM, visit = null,
  sustainM = SIGHT_SUSTAIN_M) {
  const o = spec.index(ox, oz);
  if (o < 0) return 0;
  const eye = ground[o] + eyeM;
  let maxSlope = -Infinity, firstOcclusion = maxM, hiddenFrom = -1, last = 0;
  for (let d = 2 * spec.step; d <= maxM; d += spec.step) {
    const x = ox + dirX * d, z = oz + dirZ * d;
    const i = spec.index(x, z);
    if (i < 0) break;
    last = d;
    const blocked = solid && solid[i];
    const visible = !blocked && (ground[i] + targetM - eye) / d >= maxSlope;
    if (!blocked && visit) visit(i, visible);
    if (visible) hiddenFrom = -1;
    else {
      if (hiddenFrom < 0) hiddenFrom = d;
      if (firstOcclusion === maxM && d - hiddenFrom >= sustainM) firstOcclusion = hiddenFrom;
    }
    const s = (surface[i] - eye) / d;
    if (s > maxSlope) maxSlope = s;
  }
  // a ray that leaves the raster before any sustained occlusion measured nothing about the layout: -1 (excluded)
  return firstOcclusion === maxM && last < maxM - spec.step ? -1 : firstOcclusion;
}

/**
 * Local cover toward a threat bearing: three rays (bearing and ±10°) from 4 m to `rangeM`; each ray's highest rise of
 * the surface over the cell's ground classifies it full (>= fullM), hull-down (>= hullM) or open; the cell takes the
 * class two of the three rays agree on (2 = full, 1 = hull-down, 0 = open).
 */
export function coverClass(spec, ground, surface, x, z, threatX, threatZ, rangeM = COVER_RANGE_M,
  fullM = COVER_FULL_M, hullM = COVER_HULL_M) {
  const c = spec.index(x, z);
  if (c < 0) return 0;
  const base = ground[c];
  const bearing = Math.atan2(threatX - x, threatZ - z);
  let full = 0, hull = 0;
  for (const offset of [-0.1745, 0, 0.1745]) {
    const dx = Math.sin(bearing + offset), dz = Math.cos(bearing + offset);
    let rise = -Infinity;
    for (let d = 4; d <= rangeM; d += spec.step) {
      const i = spec.index(x + dx * d, z + dz * d);
      if (i < 0) break;
      const r = surface[i] - base;
      if (r > rise) rise = r;
    }
    if (rise >= fullM) full++;
    else if (rise >= hullM) hull++;
  }
  if (full >= 2) return 2;
  if (full + hull >= 2) return 1;
  return 0;
}

/** Line of sight from an eye `eyeM` over a to a target `targetM` over b, through the occluding surface. */
export function seesPoint(spec, ground, surface, ax, az, bx, bz, eyeM = EYE_M, targetM = TARGET_M) {
  const ia = spec.index(ax, az), ib = spec.index(bx, bz);
  if (ia < 0 || ib < 0) return false;
  const eye = ground[ia] + eyeM, target = ground[ib] + targetM;
  const len = Math.hypot(bx - ax, bz - az);
  if (len < spec.step) return true;
  for (let d = spec.step; d < len - spec.step * 0.5; d += spec.step) {
    const t = d / len;
    const i = spec.index(ax + (bx - ax) * t, az + (bz - az) * t);
    if (i < 0) return false;
    if (surface[i] > eye + (target - eye) * t) return false;
  }
  return true;
}

export function sightHistogram(distances, bins = SIGHT_BINS) {
  const counts = new Array(bins.length + 1).fill(0);
  for (const d of distances) {
    let k = 0;
    while (k < bins.length && d >= bins[k]) k++;
    counts[k]++;
  }
  const total = Math.max(1, distances.length);
  return counts.map((c) => round(c / total, 3));
}

// ------------------------------------------------------------------------------------------------ routes

class MinHeap {
  constructor(capacity) { this.items = new Int32Array(capacity); this.keys = new Float64Array(capacity); this.size = 0; }
  push(item, key) {
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.items[i] = this.items[p]; this.keys[i] = this.keys[p]; i = p;
    }
    this.items[i] = item; this.keys[i] = key;
  }
  pop() {
    const top = this.items[0];
    const item = this.items[--this.size], key = this.keys[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++;
      if (this.keys[c] >= key) break;
      this.items[i] = this.items[c]; this.keys[i] = this.keys[c]; i = c;
    }
    this.items[i] = item; this.keys[i] = key;
    return top;
  }
}

const STEPS8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, -1, Math.SQRT2]];

/**
 * A* over a passability raster. `edgeOk(from, to)` rejects an edge (slope), `cellCost[i]` scales the metres spent in a
 * cell (wet / soft ground) and `penalty[i]` adds the lane penalty. Returns the cell path or null.
 */
export function shortestPath(spec, passable, cellCost, penalty, edgeOk, start, goal) {
  const n = spec.n, count = n * n;
  if (start < 0 || goal < 0 || !passable[start] || !passable[goal]) return null;
  const g = new Float64Array(count).fill(Infinity), parent = new Int32Array(count).fill(-1), closed = new Uint8Array(count);
  const heap = new MinHeap(count * 8);
  const gx = goal % n, gz = Math.floor(goal / n);
  g[start] = 0;
  heap.push(start, 0);
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    if (cur === goal) break;
    closed[cur] = 1;
    const cx = cur % n, cz = Math.floor(cur / n);
    for (const [dx, dz, w] of STEPS8) {
      const x = cx + dx, z = cz + dz;
      if (x < 0 || z < 0 || x >= n || z >= n) continue;
      const next = z * n + x;
      if (closed[next] || !passable[next]) continue;
      if (dx && dz && (!passable[cz * n + x] || !passable[z * n + cx])) continue;
      if (!edgeOk(cur, next, w)) continue;
      const step = w * spec.step * 0.5 * (cellCost[cur] + cellCost[next]) * (1 + 0.5 * (penalty[cur] + penalty[next]));
      const cost = g[cur] + step;
      if (cost < g[next]) {
        g[next] = cost; parent[next] = cur;
        heap.push(next, cost + Math.hypot(x - gx, z - gz) * spec.step);
      }
    }
  }
  if (!Number.isFinite(g[goal])) return null;
  const path = [];
  for (let at = goal; at >= 0; at = parent[at]) path.push(at);
  return path.reverse();
}

export function pathLength(spec, path) {
  let len = 0;
  for (let k = 1; k < path.length; k++) len += Math.hypot(spec.x(path[k]) - spec.x(path[k - 1]), spec.z(path[k]) - spec.z(path[k - 1]));
  return len;
}

/**
 * Single-source driven distance (Dijkstra) over the passability raster: the cheapest route by `cellCost` (wet and
 * soft ground cost more), reported as the METRES driven along it; Infinity where unreachable.
 */
export function distanceMap(spec, passable, cellCost, edgeOk, source) {
  const n = spec.n, count = n * n;
  const g = new Float64Array(count).fill(Infinity), metres = new Float64Array(count).fill(Infinity);
  const closed = new Uint8Array(count);
  if (source < 0 || !passable[source]) return metres;
  const heap = new MinHeap(count * 8);
  g[source] = 0; metres[source] = 0;
  heap.push(source, 0);
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % n, cz = Math.floor(cur / n);
    for (const [dx, dz, w] of STEPS8) {
      const x = cx + dx, z = cz + dz;
      if (x < 0 || z < 0 || x >= n || z >= n) continue;
      const next = z * n + x;
      if (closed[next] || !passable[next]) continue;
      if (dx && dz && (!passable[cz * n + x] || !passable[z * n + cx])) continue;
      if (!edgeOk(cur, next, w)) continue;
      const cost = g[cur] + w * spec.step * 0.5 * (cellCost[cur] + cellCost[next]);
      if (cost < g[next]) { g[next] = cost; metres[next] = metres[cur] + w * spec.step; heap.push(next, cost); }
    }
  }
  return metres;
}

/**
 * Lanes across one slice of the spawn axis: drivable points every `everyM` metres along the slice that lie on a
 * reasonable alpha → bravo route (distance via the point at most `stretch` x the shortest) form runs; neighbouring
 * points stay in one lane while each sees the other (eye 2.4 m, target 1.9 m) and the foliage between them adds
 * less than `concealMax` concealment. A lane is a run at least `minWidthM` wide. `seesPair(a, b)` and `concealment(a,
 * b)` are injected so the receipt can drive the grouping with synthetic sight.
 */
export function sliceLanes(points, { seesPair, concealment = () => 0, concealMax = 0.6, minWidthM = 40, everyM = 20 }) {
  const lanes = [];
  let run = [];
  const close = () => {
    if (run.length && (run.length - 1) * everyM >= minWidthM) lanes.push(run);
    run = [];
  };
  for (let k = 0; k < points.length; k++) {
    const p = points[k];
    if (!p.usable) { close(); continue; }
    if (run.length) {
      const q = run[run.length - 1];
      const linked = q.index === k - 1 && seesPair(q, p) && seesPair(p, q) && concealment(q, p) < concealMax;
      if (!linked) close();
    }
    run.push({ ...p, index: k });
  }
  close();
  return lanes;
}

/** Passable width of each slice across the spawn axis (20–80 % of the way, every 10 m) on the passability raster. */
export function axisSlices(frame, spec, passable, { from = 0.2, to = 0.8, everyM = 10, half = ARENA_HALF_M, minRunM = 20 } = {}) {
  const rows = [];
  for (let a = from * frame.length; a <= to * frame.length + 1e-6; a += everyM) {
    const cx = frame.alpha.x + frame.ux * a, cz = frame.alpha.z + frame.uz * a;
    let width = 0, runs = 0, run = 0;
    for (let l = -720; l <= 720; l += spec.step) {
      const x = cx + frame.vx * l, z = cz + frame.vz * l;
      const inside = Math.abs(x) <= half && Math.abs(z) <= half;
      const i = inside ? spec.index(x, z) : -1;
      if (i >= 0 && passable[i]) { width += spec.step; run += spec.step; }
      else { if (run >= minRunM) runs++; run = 0; }
    }
    if (run >= minRunM) runs++;
    rows.push({ along: a / frame.length, width, runs });
  }
  return rows;
}

// ------------------------------------------------------------------------------------------------ the world

function recordFootprintCells(record, spec, inflate, visit, footprintContains) {
  const x0 = record.min[0] - inflate, x1 = record.max[0] + inflate;
  const z0 = record.min[2] - inflate, z1 = record.max[2] + inflate;
  const i0 = Math.max(0, Math.ceil((x0 + spec.half) / spec.step)), i1 = Math.min(spec.n - 1, Math.floor((x1 + spec.half) / spec.step));
  const j0 = Math.max(0, Math.ceil((z0 + spec.half) / spec.step)), j1 = Math.min(spec.n - 1, Math.floor((z1 + spec.half) / spec.step));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = -spec.half + i * spec.step, z = -spec.half + j * spec.step;
    if (footprintContains(record, x, z, inflate)) visit(j * spec.n + i, x, z);
  }
}

/** A record a tank cannot drive through: not crushable, or crushable only past any hull's mass (bunkers). */
export function isSolidRecord(record) {
  if (record.treeIdx != null) return false;
  if (!record.crushable) return true;
  return (record.crushMin ?? 0) >= 999;
}

const MARINE_KINDS = new Set(['bridge', 'jetty', 'pier', 'boat', 'pontoon', 'wharf', 'weir', 'mooring']);

/** Load everything one map's metrics read. */
export async function loadLayoutWorld(mapId) {
  const [{ getMapConfig }, { createHeightField }, dedicated, collision, mobility, { landmarkFootprint, LANDMARK_KINDS, resolveLandmarkParams }] = await Promise.all([
    import('../src/world/maps/index.ts'),
    import('../src/world/terrain.ts'),
    import('../server/dedicatedWorldCollision.ts'),
    import('../src/world/collision.ts'),
    import('../src/sim/terrainMobility.ts'),
    import('../src/world/landmarks/plan.ts'),
  ]);
  const config = getMapConfig(mapId);
  const world = dedicated.createDedicatedWorldCollision(mapId);
  const heightField = world.heightField ?? createHeightField(1337, config);
  // a set piece that carries a road on its deck (a drivable bridge: landmarks/plan.ts spansRoad) is that road's bridge
  const landmarkCarriesRoad = (piece) => LANDMARK_KINDS[piece.kind]?.family === 'bridge' && !!LANDMARK_KINDS[piece.kind].spansRoad
    && resolveLandmarkParams(piece).drivable !== false;
  return { mapId, config, world, heightField, footprintContains: collision.collisionFootprintContainsPoint, mobility, landmarkFootprint,
    landmarkCarriesRoad };
}

/**
 * The bridge deck over (x, z), or null: inside a deck's span and between its parapets. A map's bridge decks (round 61's
 * river crossings and the dry viaducts, heightField.bridgeDecks) are the floor a hull rides over the span; the height
 * field there is the bed below. 1-based index into `decks`, 0 when no deck stands over the point.
 */
export function bridgeDeckIndexAt(decks, x, z) {
  for (let d = 0; d < decks.length; d++) {
    const deck = decks[d], dx = x - deck.x, dz = z - deck.z;
    if (Math.abs(dx * deck.ux + dz * deck.uz) <= deck.halfLength
      && Math.abs(dx * deck.uz - dz * deck.ux) <= deck.halfWidth) return d + 1;
  }
  return 0;
}

/** Rasterise the ground, the occluding surface, the solids and the passability of one map. */
export function buildLayoutRasters({ heightField, world, footprintContains, mobility }) {
  // Bridge decks (maps with heightField.bridgeDecks, 2026-10-02): over a span the rasters carry the deck, as the bot
  // planner's grid does (sim/bridgeDeckNavigation.ts) — the deck's height is the ground, the bridge's own records are
  // its floor and parapets rather than obstacles, and a step between a deck cell and a cell beside the span crosses
  // the parapet, so it is no edge; only the abutments join the deck to the ground. The bed under the span is not
  // represented (a 2.5-D raster carries one level, like the planner).
  const decks = heightField.bridgeDecks ?? [];
  const deckIndex = (x, z) => (decks.length ? bridgeDeckIndexAt(decks, x, z) : 0);
  const sight = rasterSpec(WORLD_HALF_M, SIGHT_RASTER_M);
  const ground = new Float32Array(sight.n * sight.n);
  const sightDeck = decks.length ? new Uint8Array(sight.n * sight.n) : null;
  for (let j = 0; j < sight.n; j++) for (let i = 0; i < sight.n; i++) {
    const x = -WORLD_HALF_M + i * SIGHT_RASTER_M, z = -WORLD_HALF_M + j * SIGHT_RASTER_M, k = j * sight.n + i;
    const d = deckIndex(x, z);
    if (d) sightDeck[k] = d;
    ground[k] = d ? decks[d - 1].deckY : heightField.getHeightAt(x, z);
  }
  const surface = Float32Array.from(ground);
  const sightSolid = new Uint8Array(sight.n * sight.n);
  for (const record of world.getColliders()) {
    if (record.treeIdx != null || record.dead) continue;
    // a post, a hedgehog beam or a drum is thinner than a raster cell: on a 1-D ray it would hide everything behind it
    if (Math.max(record.max[0] - record.min[0], record.max[2] - record.min[2]) < THIN_COLLIDER_M) continue;
    const top = record.max[1];
    const bridge = record.kind === 'bridge';
    recordFootprintCells(record, sight, 0, (i) => {
      if (bridge && sightDeck && sightDeck[i]) return; // the deck itself: its floor is the ground above
      if (top > surface[i]) surface[i] = top;
      if (isSolidRecord(record) && top - ground[i] > 1.2) sightSolid[i] = 1;
    }, footprintContains);
  }
  const pass = rasterSpec(WORLD_HALF_M, PASS_RASTER_M);
  const count = pass.n * pass.n;
  const passable = new Uint8Array(count), cellCost = new Float32Array(count).fill(1);
  const height5 = new Float32Array(count), wet = new Uint8Array(count);
  const solid5 = new Uint8Array(count);
  const deck5 = decks.length ? new Uint8Array(count) : null;
  if (deck5) {
    for (let j = 0; j < pass.n; j++) for (let i = 0; i < pass.n; i++) {
      deck5[j * pass.n + i] = deckIndex(-WORLD_HALF_M + i * PASS_RASTER_M, -WORLD_HALF_M + j * PASS_RASTER_M);
    }
  }
  // a bridge's abutments run on under the approach embankment a few metres past the span, their tops at the deck's
  // level (mapKits.ts addArchedStoneBridge): between the parapet lines they are the road's floor, not a wall (on an
  // oblique crossing the raster's cells past the span's ends fall on them; Suzhou Creek, the map-revival lane)
  const abutmentFloor = (x, z) => decks.some((deck) => {
    const dx = x - deck.x, dz = z - deck.z;
    return Math.abs(dx * deck.ux + dz * deck.uz) <= deck.halfLength + 3 && Math.abs(dx * deck.uz - dz * deck.ux) <= deck.halfWidth;
  });
  for (const record of world.getObstacles()) {
    if (!isSolidRecord(record)) continue;
    const bridge = record.kind === 'bridge';
    recordFootprintCells(record, pass, 1.8, (i, x, z) => {
      if (!(bridge && deck5 && (deck5[i] || abutmentFloor(x, z)))) solid5[i] = 1;
    }, footprintContains);
  }
  const depthAt = typeof heightField.getWaterDepthAt === 'function' ? (x, z) => heightField.getWaterDepthAt(x, z) : null;
  const groundAt = (x, z) => (heightField.getDriveGroundType?.(x, z) ?? heightField.getGroundType?.(x, z) ?? 'medium');
  const gradeLimit = maximumTwoWayGrade(mobility.terrainSlopeMargin, LAYOUT_DRIVETRAIN, 'medium');
  for (let j = 0; j < pass.n; j++) for (let i = 0; i < pass.n; i++) {
    const x = -WORLD_HALF_M + i * PASS_RASTER_M, z = -WORLD_HALF_M + j * PASS_RASTER_M, k = j * pass.n + i;
    const inside = Math.abs(x) <= ARENA_HALF_M && Math.abs(z) <= ARENA_HALF_M;
    if (deck5 && deck5[k]) {
      height5[k] = decks[deck5[k] - 1].deckY;
      passable[k] = inside && !solid5[k] ? 1 : 0;
      continue;
    }
    height5[k] = heightField.getHeightAt(x, z);
    const water = heightField.getWaterMaskAt?.(x, z) ?? 0;
    const deep = depthAt ? depthAt(x, z) > 1.4 : water > 0.85;
    if (water > 0.5) wet[k] = 1;
    const type = groundAt(x, z);
    cellCost[k] = (type === 'soft' ? 1.5 : 1) * (wet[k] ? 3 : 1);
    passable[k] = inside && !deep && !solid5[k] ? 1 : 0;
  }
  // a deck cell and a cell beside its span meet only at the deck's ends (the abutments); across the parapet they are
  // no neighbours, whatever the height step between them
  const joined = (a, b) => {
    if (!deck5 || deck5[a] === deck5[b]) return true;
    const d = decks[(deck5[a] || deck5[b]) - 1], off = deck5[a] ? b : a;
    const along = (pass.x(off) - d.x) * d.ux + (pass.z(off) - d.z) * d.uz;
    return Math.abs(along) > d.halfLength;
  };
  // slope: a cell whose steepest 4-neighbour grade exceeds the drivetrain's two-way limit is not drivable ground
  const slopeOk = new Uint8Array(count);
  for (let j = 0; j < pass.n; j++) for (let i = 0; i < pass.n; i++) {
    const k = j * pass.n + i;
    let worst = 0;
    if (i > 0 && joined(k, k - 1)) worst = Math.max(worst, Math.abs(height5[k] - height5[k - 1]));
    if (i < pass.n - 1 && joined(k, k + 1)) worst = Math.max(worst, Math.abs(height5[k] - height5[k + 1]));
    if (j > 0 && joined(k, k - pass.n)) worst = Math.max(worst, Math.abs(height5[k] - height5[k - pass.n]));
    if (j < pass.n - 1 && joined(k, k + pass.n)) worst = Math.max(worst, Math.abs(height5[k] - height5[k + pass.n]));
    slopeOk[k] = worst / PASS_RASTER_M <= gradeLimit ? 1 : 0;
  }
  for (let k = 0; k < count; k++) if (!slopeOk[k]) passable[k] = 0;
  const edgeOk = (from, to, w) => {
    if (!joined(from, to)) return false;
    const grade = (height5[to] - height5[from]) / (w * PASS_RASTER_M);
    const type = 'medium';
    return mobility.terrainSlopeMargin(LAYOUT_DRIVETRAIN, type, grade) > mobility.TERRAIN_MARGIN_EPS
      && mobility.terrainSlopeMargin(LAYOUT_DRIVETRAIN, type, -grade) > mobility.TERRAIN_MARGIN_EPS;
  };
  return { sight, ground, surface, sightSolid, pass, passable, cellCost, height5, wet, edgeOk, gradeLimit, deck5 };
}

/** Distance from a point to the nearest road polyline, through a 32 m bucket grid of segments. */
export function roadPolylineDistance(roads, bucketM = 32) {
  const buckets = new Map();
  const key = (i, j) => `${i},${j}`;
  for (const road of roads) for (let k = 1; k < road.length; k++) {
    const [ax, az] = road[k - 1], [bx, bz] = road[k];
    const i0 = Math.floor((Math.min(ax, bx) - 8) / bucketM), i1 = Math.floor((Math.max(ax, bx) + 8) / bucketM);
    const j0 = Math.floor((Math.min(az, bz) - 8) / bucketM), j1 = Math.floor((Math.max(az, bz) + 8) / bucketM);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (!buckets.has(key(i, j))) buckets.set(key(i, j), []);
      buckets.get(key(i, j)).push([ax, az, bx, bz]);
    }
  }
  const segment = (px, pz, [ax, az, bx, bz]) => {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
    return Math.hypot(ax + dx * t - px, az + dz * t - pz);
  };
  return (x, z) => {
    const ci = Math.floor(x / bucketM), cj = Math.floor(z / bucketM);
    let best = Infinity;
    for (let ring = 0; ring <= 40; ring++) {
      for (let j = cj - ring; j <= cj + ring; j++) for (let i = ci - ring; i <= ci + ring; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== ring) continue;
        for (const seg of buckets.get(key(i, j)) ?? []) best = Math.min(best, segment(x, z, seg));
      }
      if (best <= ring * bucketM) break;
    }
    return best;
  };
}

/** Snap a world point to the nearest passable raster cell within `radiusM`. */
export function nearestPassable(spec, passable, x, z, radiusM = 60) {
  const base = spec.index(x, z);
  if (base >= 0 && passable[base]) return base;
  let best = -1, bestD = Infinity;
  const r = Math.ceil(radiusM / spec.step);
  const ci = Math.round((x + spec.half) / spec.step), cj = Math.round((z + spec.half) / spec.step);
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const i = ci + di, j = cj + dj;
    if (i < 0 || j < 0 || i >= spec.n || j >= spec.n) continue;
    const k = j * spec.n + i;
    if (!passable[k]) continue;
    const d = di * di + dj * dj;
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ the metrics

export async function computeLayoutMetrics(mapId, { objectives = true } = {}) {
  const t0 = performance.now();
  const loaded = await loadLayoutWorld(mapId);
  const { config, world, heightField, footprintContains, landmarkFootprint, landmarkCarriesRoad } = loaded;
  const R = buildLayoutRasters(loaded);
  const layout = heightField._layout;
  const frame = spawnFrame(layout.spawns);
  const { sight, pass } = R;

  // spawns + driven route: one distance map from each anchor
  const start = nearestPassable(pass, R.passable, frame.alpha.x, frame.alpha.z);
  const goal = nearestPassable(pass, R.passable, frame.bravo.x, frame.bravo.z);
  const fromAlpha = distanceMap(pass, R.passable, R.cellCost, R.edgeOk, start);
  const fromBravo = distanceMap(pass, R.passable, R.cellCost, R.edgeOk, goal);
  const routeM = goal >= 0 && Number.isFinite(fromAlpha[goal]) ? fromAlpha[goal] : null;
  const driven = (dist, x, z) => {
    const k = nearestPassable(pass, R.passable, x, z, 40);
    return k >= 0 && Number.isFinite(dist[k]) ? dist[k] : null;
  };

  // lanes: three slices across the axis (35 / 50 / 65 %), points every 20 m
  const concealers = world.getConcealment?.() ?? [];
  const concealGrid = new Map();
  for (const c of concealers) {
    const key = `${Math.floor(c.x / 20)},${Math.floor(c.z / 20)}`;
    if (!concealGrid.has(key)) concealGrid.set(key, []);
    concealGrid.get(key).push(c);
  }
  const concealment = (a, b) => {
    let sum = 0;
    const seenDiscs = new Set();
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    for (let t = 0; t <= len; t += 5) {
      const x = a.x + (b.x - a.x) * (t / len), z = a.z + (b.z - a.z) * (t / len);
      const gi = Math.floor(x / 20), gj = Math.floor(z / 20);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        for (const c of concealGrid.get(`${gi + di},${gj + dj}`) ?? []) {
          if (seenDiscs.has(c)) continue;
          if (Math.hypot(c.x - x, c.z - z) <= c.r) { seenDiscs.add(c); sum += c.add; }
        }
      }
    }
    return sum;
  };
  const seesPair = (a, b) => seesPoint(sight, R.ground, R.surface, a.x, a.z, b.x, b.z, EYE_M, TARGET_M);
  const laneSlices = [];
  for (const at of [0.35, 0.5, 0.65]) {
    const cx = frame.alpha.x + frame.ux * frame.length * at, cz = frame.alpha.z + frame.uz * frame.length * at;
    const points = [];
    for (let l = -700; l <= 700; l += LANE_POINT_M) {
      const x = cx + frame.vx * l, z = cz + frame.vz * l;
      if (Math.abs(x) > ARENA_HALF_M || Math.abs(z) > ARENA_HALF_M) continue;
      const k = pass.index(x, z);
      const via = k >= 0 && R.passable[k] && !R.wet[k] ? fromAlpha[k] + fromBravo[k] : Infinity;
      points.push({ x, z, lateral: l, usable: routeM != null && via <= routeM * LANE_STRETCH });
    }
    const lanes = sliceLanes(points, { seesPair, concealment, everyM: LANE_POINT_M });
    laneSlices.push({ at, lanes: lanes.map((run) => ({ from: run[0].lateral, to: run[run.length - 1].lateral })) });
  }
  const laneCounts = laneSlices.map((slice) => slice.lanes.length).sort((a, b) => a - b);

  // viewsheds + exposure accumulation per 10 m cell, split by the observer's half
  const cell10 = rasterSpec(WORLD_HALF_M, 10);
  const seen = [new Uint32Array(cell10.n * cell10.n), new Uint32Array(cell10.n * cell10.n)];
  const rays = [new Uint32Array(cell10.n * cell10.n), new Uint32Array(cell10.n * cell10.n)];
  const occlusions = [];
  const sectorOcclusions = Array.from({ length: 9 }, () => []);
  let observers = 0;
  for (let z = -OBSERVER_HALF_M; z <= OBSERVER_HALF_M; z += OBSERVER_SPACING_M) {
    for (let x = -OBSERVER_HALF_M; x <= OBSERVER_HALF_M; x += OBSERVER_SPACING_M) {
      const p = pass.index(x, z);
      if (p < 0 || !R.passable[p] || R.wet[p]) continue;
      observers++;
      const half = frame.along(x, z) < 0.5 ? 0 : 1;
      const sector = sectorOf(frame, x, z);
      for (let k = 0; k < SIGHT_AZIMUTHS; k++) {
        const az = (k / SIGHT_AZIMUTHS) * Math.PI * 2;
        const occ = sweepRay(sight, R.ground, R.surface, R.sightSolid, x, z, Math.sin(az), Math.cos(az), EYE_M, TARGET_M, SIGHT_MAX_M,
          (i, visible) => {
            const c = cell10.index(sight.x(i), sight.z(i));
            if (c < 0) return;
            rays[half][c]++;
            if (visible) seen[half][c]++;
          });
        if (occ < 0) continue;
        occlusions.push(occ);
        sectorOcclusions[sector].push(occ);
      }
    }
  }
  occlusions.sort((a, b) => a - b);

  // cover + exposure per sector on the 10 m lattice of drivable cells
  const sectors = Array.from({ length: 9 }, (_, s) => ({
    name: `${SECTOR_BANDS[Math.floor(s / 3)]}-${SECTOR_FLANKS[s % 3]}`, cells: 0, full: 0, hull: 0, seen: 0, rays: 0,
  }));
  const teamHull = [0, 0], teamCells = [0, 0];
  for (let z = -OBSERVER_HALF_M; z <= OBSERVER_HALF_M; z += 10) {
    for (let x = -OBSERVER_HALF_M; x <= OBSERVER_HALF_M; x += 10) {
      const p = pass.index(x, z);
      if (p < 0 || !R.passable[p] || R.wet[p]) continue;
      const a = frame.along(x, z);
      if (a < -SECTOR_BACKFIELD || a > 1 + SECTOR_BACKFIELD) continue;
      const half = a < 0.5 ? 0 : 1;
      const threat = half === 0 ? frame.bravo : frame.alpha;
      const cls = coverClass(sight, R.ground, R.surface, x, z, threat.x, threat.z);
      const s = sectors[sectorOf(frame, x, z)];
      s.cells++;
      if (cls === 2) s.full++; else if (cls === 1) s.hull++;
      if (cls === 1) teamHull[half]++;
      teamCells[half]++;
      const c = cell10.index(x, z);
      const opposing = 1 - half;
      s.seen += seen[opposing][c]; s.rays += rays[opposing][c];
    }
  }
  const sectorRows = sectors.map((s, index) => {
    const occ = sectorOcclusions[index].sort((a, b) => a - b);
    return {
      name: s.name, cells: s.cells,
      cover: s.cells ? round((s.full + s.hull) / s.cells, 3) : null,
      full: s.cells ? round(s.full / s.cells, 3) : null,
      hullDown: s.cells ? round(s.hull / s.cells, 3) : null,
      exposure: s.rays ? round(s.seen / s.rays, 3) : null,
      sightMedianM: occ.length ? percentile(occ, 0.5) : null,
    };
  });
  const mid = sectorRows.slice(3, 6);
  const midCells = mid.reduce((acc, s) => acc + s.cells, 0);
  const coverMidShare = midCells
    ? round(mid.reduce((acc, s) => acc + (s.cover ?? 0) * s.cells, 0) / midCells, 3) : null;
  const populated = sectorRows.filter((s) => s.cells >= 20);
  const coverSectorMin = populated.length ? Math.min(...populated.map((s) => s.cover ?? 0)) : null;

  // chokes
  const slices = axisSlices(frame, pass, R.passable);
  const widths = slices.map((s) => s.width).sort((a, b) => a - b);

  // relief
  const heights = [];
  let flatCells = 0, reliefCells = 0;
  for (let z = -OBSERVER_HALF_M; z <= OBSERVER_HALF_M; z += 10) {
    for (let x = -OBSERVER_HALF_M; x <= OBSERVER_HALF_M; x += 10) {
      const p = pass.index(x, z);
      if (p < 0 || !R.passable[p] || R.wet[p]) continue;
      heights.push(R.height5[p]);
      let lo = Infinity, hi = -Infinity;
      for (let dz = -15; dz <= 15; dz += 5) for (let dx = -15; dx <= 15; dx += 5) {
        const q = pass.index(x + dx, z + dz);
        if (q < 0) continue;
        lo = Math.min(lo, R.height5[q]); hi = Math.max(hi, R.height5[q]);
      }
      reliefCells++;
      if (hi - lo < 1) flatCells++;
    }
  }
  const meanH = heights.reduce((a, b) => a + b, 0) / Math.max(1, heights.length);
  const reliefStdM = Math.sqrt(heights.reduce((a, b) => a + (b - meanH) ** 2, 0) / Math.max(1, heights.length));

  // dressing logic — distances to the authored road polylines (hardstand aprons are paved squares, not roads)
  const roadDistance = roadPolylineDistance(layout.roads);
  const buildingKinds = new Set(['structure', 'bunker', ...((config.props?.destructibleBuildings) ?? [])]);
  const setPieces = (config.props?.landmarks ?? []).map((piece) => {
    const [hw, hl] = landmarkFootprint(piece), yaw = (piece.yawDeg ?? 0) * Math.PI / 180;
    return { x: piece.x, z: piece.z, hw, hl, c: Math.cos(yaw), s: Math.sin(yaw), deck: landmarkCarriesRoad?.(piece) ?? false };
  });
  const inPiece = (p, x, z) => {
    const dx = x - p.x, dz = z - p.z;
    return Math.abs(dx * p.c - dz * p.s) <= p.hw && Math.abs(dx * p.s + dz * p.c) <= p.hl;
  };
  const inSetPiece = (x, z) => setPieces.some((p) => inPiece(p, x, z));
  // (a set-piece bridge's deck is a 'structure' record, not a 'bridge' one — compose.ts: the bots steer round it — but the
  // road it carries runs over it as over a map kit's bridge: its record is no prop standing in that road)
  const onSetPieceDeck = (x, z) => setPieces.some((p) => p.deck && inPiece(p, x, z));
  let buildings = 0, orphans = 0;
  const inRoad = {}, inWater = {}, roadblocks = {};
  for (const record of world.getObstacles()) {
    if (record.treeIdx != null) continue;
    const cx = (record.min[0] + record.max[0]) / 2, cz = (record.min[2] + record.max[2]) / 2;
    const kind = record.kind ?? 'rock-or-wall';
    // (a set piece, landmarks/compose.ts, is no settlement building: a mill on a crest stands off every road by design —
    // a structure record whose centre stands in a set piece's footprint, from the map's config, is left out)
    if (buildingKinds.has(record.kind) && !inSetPiece(cx, cz)) {
      buildings++;
      if (roadDistance(cx, cz) > ORPHAN_ROAD_M) orphans++;
    }
    if (!isSolidRecord(record)) continue;
    let road = false, water = false;
    const step = 1;
    for (let z = record.min[2]; z <= record.max[2] && !(road && water); z += step) {
      for (let x = record.min[0]; x <= record.max[0]; x += step) {
        if (!footprintContains(record, x, z, 0)) continue;
        if (!road && roadDistance(x, z) < ROAD_CORE_M) road = true;
        if (!water && (heightField.getWaterMaskAt?.(x, z) ?? 0) > 0.5) water = true;
      }
    }
    if (road && kind !== 'bridge' && !onSetPieceDeck(cx, cz)) {
      if (ROADBLOCK_KINDS.has(kind)) roadblocks[kind] = (roadblocks[kind] ?? 0) + 1;
      else inRoad[kind] = (inRoad[kind] ?? 0) + 1;
    }
    if (water && !MARINE_KINDS.has(kind)) inWater[kind] = (inWater[kind] ?? 0) + 1;
  }
  const solidPropsInRoad = Object.values(inRoad).reduce((a, b) => a + b, 0);
  const solidPropsInWater = Object.values(inWater).reduce((a, b) => a + b, 0);

  // objectives through the real placement
  let objectiveRows = null, objectiveSymmetry = null;
  if (objectives) {
    objectiveRows = {};
    const { createMatchPlacement, matchPlacementAnchors } = await import('../src/sim/matchPlacement.ts');
    let worst = 1;
    for (const mode of ['zone_control', 'capture_the_flag', 'turbo_ball']) {
      try {
        const placement = createMatchPlacement({
          mapId, heightField, obstacles: world.getObstacles(), queryObstacles: world.queryObstacles,
          anchors: matchPlacementAnchors(layout.spawns), mode,
        });
        const points = mode === 'zone_control' ? placement.zones
          : mode === 'turbo_ball' ? [placement.middle, placement.centers.alpha, placement.centers.bravo]
            : [placement.centers.alpha, placement.centers.bravo];
        const rows = points.map((point) => {
          const a = driven(fromAlpha, point.x, point.z), b = driven(fromBravo, point.x, point.z);
          return { x: round(point.x, 1), z: round(point.z, 1), fromAlpha: round(a, 0), fromBravo: round(b, 0) };
        });
        if (mode === 'zone_control') worst = Math.max(worst, objectiveBalance(rows));
        else if (mode === 'turbo_ball') worst = Math.max(worst, objectiveBalance([rows[0]]));
        objectiveRows[mode] = rows;
      } catch (error) {
        objectiveRows[mode] = { error: String(error?.message ?? error) };
        worst = Infinity;
      }
    }
    objectiveSymmetry = round(worst, 3);
  }

  const metrics = {
    mapId,
    name: config.name,
    spawns: {
      alpha: { x: round(frame.alpha.x, 1), z: round(frame.alpha.z, 1) },
      bravo: { x: round(frame.bravo.x, 1), z: round(frame.bravo.z, 1) },
      separationM: round(frame.length, 0),
      routeM: round(routeM, 0),
      routeStretch: routeM ? round(routeM / frame.length, 3) : null,
      // neither anchor sees the other (eye 2.4 m, target 1.9 m) over terrain and structures
      screened: !seesPoint(sight, R.ground, R.surface, frame.alpha.x, frame.alpha.z, frame.bravo.x, frame.bravo.z)
        && !seesPoint(sight, R.ground, R.surface, frame.bravo.x, frame.bravo.z, frame.alpha.x, frame.alpha.z),
    },
    lanes: {
      count: laneCounts[1] ?? 0,
      perSlice: laneSlices.map((slice) => slice.lanes.length),
      slices: laneSlices,
    },
    chokes: {
      minM: widths[0] ?? null,
      p10M: percentile(widths, 0.1),
      medianM: percentile(widths, 0.5),
      runsMin: slices.length ? Math.min(...slices.map((s) => s.runs)) : null,
    },
    sight: {
      observers,
      rays: occlusions.length,
      medianM: percentile(occlusions, 0.5),
      p25M: percentile(occlusions, 0.25),
      p75M: percentile(occlusions, 0.75),
      histogram: sightHistogram(occlusions),
      bins: ['<50', '50-100', '100-200', '200-300', '300-445', 'open'],
      longShare: round(occlusions.filter((d) => d >= 300).length / Math.max(1, occlusions.length), 3),
      closeShare: round(occlusions.filter((d) => d < 100).length / Math.max(1, occlusions.length), 3),
    },
    cover: {
      sectors: sectorRows,
      midShare: coverMidShare,
      sectorMin: coverSectorMin,
      hullDownTeamShare: round(Math.min(teamHull[0] / Math.max(1, teamCells[0]), teamHull[1] / Math.max(1, teamCells[1])), 3),
    },
    relief: { stdM: round(reliefStdM, 2), flatShare: round(flatCells / Math.max(1, reliefCells), 3), gradeLimit: round(R.gradeLimit, 3) },
    dressing: {
      buildings, orphanBuildings: orphans,
      orphanBuildingShare: buildings ? round(orphans / buildings, 3) : 0,
      solidPropsInRoad, inRoad, roadblocks, solidPropsInWater, inWater,
    },
    objectives: objectiveRows,
    objectiveSymmetry,
    elapsedS: round((performance.now() - t0) / 1000, 1),
  };
  metrics.checks = evaluateTargets(metrics, config.layoutBrief?.exceptions ?? {}, briefTargets(config.layoutBrief),
    config.layoutBrief?.bands ?? {});
  return metrics;
}

/**
 * Objective balance: each team's driven distances to the objectives, sorted, compared pair by pair (the nearest
 * objective of alpha against the nearest of bravo, and so on) — the worst ratio, with distances floored at 60 m so a
 * flag beside a spawn does not explode the ratio. 1 = perfectly mirrored reach; unreachable = Infinity.
 */
export function objectiveBalance(rows, floorM = 60) {
  const a = rows.map((r) => r.fromAlpha), b = rows.map((r) => r.fromBravo);
  if (a.some((v) => v == null) || b.some((v) => v == null)) return Infinity;
  a.sort((x, y) => x - y); b.sort((x, y) => x - y);
  let worst = 1;
  for (let k = 0; k < a.length; k++) {
    const x = Math.max(floorM, a[k]), y = Math.max(floorM, b[k]);
    worst = Math.max(worst, Math.max(x, y) / Math.min(x, y));
  }
  return worst;
}

/** The value each TARGETS key reads from a metrics row. */
export function targetValues(m) {
  return {
    spawnSeparationM: m.spawns.separationM,
    spawnScreened: m.spawns.screened ? 1 : 0,
    routeStretch: m.spawns.routeStretch,
    lanes: m.lanes.count,
    chokeMinM: m.chokes.minM,
    sightMedianM: m.sight.medianM,
    sightLongShare: m.sight.longShare,
    sightCloseShare: m.sight.closeShare,
    coverMidShare: m.cover.midShare,
    coverSectorMin: m.cover.sectorMin,
    hullDownTeamShare: m.cover.hullDownTeamShare,
    reliefStdM: m.relief.stdM,
    orphanBuildingShare: m.dressing.orphanBuildingShare,
    solidPropsInRoad: m.dressing.solidPropsInRoad,
    solidPropsInWater: m.dressing.solidPropsInWater,
    objectiveSymmetry: m.objectiveSymmetry,
  };
}

/**
 * The bands a map is held to: TARGETS, with each band the map replaces in `layoutBrief.bands` ({ band: [min, max],
 * reason }). A map band is enforced like a shared one (a miss fails), and its row names the band and the reason, so a
 * map at a scale of its own (Olympus Basin's compact low-gravity arena) is measured against bands that fit it rather
 * than excused from them. An unknown key or a malformed band fails closed.
 */
export function briefTargets(layoutBrief) {
  const bands = layoutBrief?.bands ?? {};
  const targets = { ...TARGETS };
  for (const [key, entry] of Object.entries(bands)) {
    if (!(key in TARGETS)) throw new Error(`layoutBrief.bands: no brief band named ${key}`);
    const band = entry?.band;
    if (!Array.isArray(band) || band.length !== 2 || !band.every((v) => v === null || Number.isFinite(v))
      || (band[0] !== null && band[1] !== null && band[0] > band[1])) throw new Error(`layoutBrief.bands.${key}: band must be [min, max]`);
    targets[key] = band;
  }
  return targets;
}

export function evaluateTargets(m, exceptions = {}, targets = TARGETS, bands = {}) {
  const values = targetValues(m);
  const rows = [];
  for (const [key, [min, max]] of Object.entries(targets)) {
    const value = values[key];
    const own = bands[key] ? { band: [min, max], bandReason: bands[key].reason } : {};
    if (value == null) { rows.push({ key, value, ok: null, ...own }); continue; }
    const ok = (min == null || value >= min) && (max == null || value <= max);
    rows.push({ key, value, ok: ok ? true : exceptions[key] ? 'exception' : false, ...own, ...(exceptions[key] && !ok ? { reason: exceptions[key] } : {}) });
  }
  return rows;
}

// ------------------------------------------------------------------------------------------------ CLI

function formatRow(m) {
  const c = m.checks.filter((r) => r.ok === false).map((r) => r.key);
  return [
    m.mapId.padEnd(12),
    String(m.spawns.separationM).padStart(4), String(m.spawns.routeStretch ?? '-').padStart(6),
    String(m.lanes.count).padStart(2),
    String(m.chokes.minM ?? '-').padStart(4), String(m.chokes.runsMin ?? '-').padStart(2),
    String(m.sight.medianM ?? '-').padStart(4), String(m.sight.longShare).padStart(6), String(m.sight.closeShare).padStart(6),
    String(m.cover.midShare).padStart(6), String(m.cover.sectorMin).padStart(6), String(m.cover.hullDownTeamShare).padStart(6),
    String(m.relief.stdM).padStart(6), String(m.relief.flatShare).padStart(6),
    String(m.dressing.orphanBuildingShare).padStart(6), String(m.dressing.solidPropsInRoad).padStart(3), String(m.dressing.solidPropsInWater).padStart(3),
    String(m.objectiveSymmetry ?? '-').padStart(6),
    `  miss: ${c.join(',') || '-'}`,
  ].join(' ');
}

export const TABLE_HEADER = 'map          sep  route ln choke rn sightM  long  close coverM coverS hullDn relief  flat orphan rd wt   sym';

async function main(argv) {
  const opt = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.slice(2).split('=');
    return [k, v ?? true];
  }));
  const { MAP_IDS } = await import('../src/world/maps/index.ts');
  const maps = opt.maps ? String(opt.maps).split(',').filter(Boolean) : [...MAP_IDS];
  for (const id of maps) if (!MAP_IDS.includes(id)) throw new Error(`unknown map ${id}`);
  const rows = [];
  console.log(TABLE_HEADER);
  for (const id of maps) {
    const m = await computeLayoutMetrics(id, { objectives: opt.objectives !== 'false' });
    rows.push(m);
    console.log(formatRow(m));
  }
  if (opt.json) writeFileSync(String(opt.json), `${JSON.stringify({ writtenAt: new Date().toISOString(), targets: TARGETS, rows }, null, 1)}\n`);
  if (opt.check && rows.some((m) => m.checks.some((r) => r.ok === false))) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { console.error(error); process.exitCode = 1; });
}
