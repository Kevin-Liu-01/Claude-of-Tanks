/** Construction-only redistribution. No new trees, variants, geometry or RNG. */
import type { TreeSpecies } from './treeSpecies.ts';
import { TREE_ARCHETYPES } from './treeSpecies.ts';
import { treeRootDecalRadius } from './treeGrounding.ts';
import { overlapsStructureClearance, type StructureClearance } from './vegetationClearance.ts';
import type { CollisionRecord } from './collision.ts';

export interface AuthoredTreeFeature {
  id: string;
  species: TreeSpecies;
  path: readonly (readonly [number, number])[];
  count: number;
  /** Small lateral staggering in metres, not random scatter discs. */
  width?: number;
  /** The map-revival lane (2026-10-05, Orchard Valley's terraces): a row on terraced ground — each station slides along
   * the hillside's fall line (up to `searchM` either way, nearest first) to the first ground a tree's root stands level
   * on, so the row keeps to the benches whatever the terrain seed. Absent: stations stand where the path puts them. */
  bench?: { searchM: number };
}

export interface AuthoredTreeRecord {
  x: number;
  z: number;
  species: TreeSpecies;
  mat: { elements: number[] };
  cy: number;
  cr: number;
  dr: number;
  fallH?: number;
}

interface PlacementTerrain {
  getHeightAt(x: number, z: number): number;
  getNormalAt(x: number, z: number): { y: number };
  getWaterMaskAt(x: number, z: number): number;
  _noVeg(x: number, z: number): boolean;
}

type AuthoredWallRun = readonly [number, number, number, number, number?];

interface AuthoredTreeReceipt {
  id: string;
  attempted: number;
  accepted: number;
  unsafe: number;
  noDonor: number;
  /** Accepted stations whose procedural squatter was moved onto the donor's old ground (2026-09-14). */
  displaced?: number;
}

/** A map's planned building site (props.ts `plannedSites`): its pose and, when it is authored at its size, its plot. */
interface PlannedSite { x: number; z: number; yawDeg: number; plot?: { w: number; d: number } }

/** Half a side of a planned site without a plot: the kits' buildings measure up to 28 m (Kestrel's warehouses 27.3 m). */
const PLANNED_SITE_HALF_M = 14;

/**
 * Trees lane (2026-10-05, Kestrel's dispersal stands): the settlement rect keeps every tree off a map's buildings. A map
 * whose authored stands stand inside it (vegetation.ts `authoredInSettlement`) keeps them off its planned sites instead:
 * each its plot, or a 28 m square on its yaw, with the beats' 0.75 m apron.
 */
export function plannedSiteClearances(sites: readonly PlannedSite[]): StructureClearance[] {
  return sites.map((site) => {
    const yaw = site.yawDeg * Math.PI / 180;
    return {
      x: site.x, z: site.z,
      halfWidth: (site.plot ? site.plot.w / 2 : PLANNED_SITE_HALF_M) + 0.75,
      halfLength: (site.plot ? site.plot.d / 2 : PLANNED_SITE_HALF_M) + 0.75,
      cos: Math.cos(yaw), sin: Math.sin(yaw),
    };
  });
}

/** Whether (x, z) lies inside one of the polygons ([x, z] rings, even-odd): the clear ground a map names for its stands. */
export function insideClearPolygon(polygons: readonly (readonly (readonly [number, number])[])[], x: number, z: number): boolean {
  for (const polygon of polygons) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, zi] = polygon[i], [xj, zj] = polygon[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

/** Equal arc-length stations keep bent bank ribbons and farm rows readable. */
export function authoredTreeStations(feature: AuthoredTreeFeature): Array<{ x: number; z: number }> {
  if (!Number.isInteger(feature.count) || feature.count < 2 || feature.count > 80
      || feature.path.length < 2 || feature.path.length > 12) throw new Error('Invalid bounded authored tree feature');
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < feature.path.length; i++) {
    const [x, z] = feature.path[i], [px, pz] = feature.path[i - 1];
    const length = Math.hypot(x - px, z - pz);
    if (!Number.isFinite(length) || length <= 0) throw new Error('Invalid authored tree path');
    lengths.push(length); total += length;
  }
  return Array.from({ length: feature.count }, (_, i) => {
    let distance = total * i / (feature.count - 1), segment = 0;
    while (segment < lengths.length - 1 && distance > lengths[segment]) distance -= lengths[segment++];
    const a = feature.path[segment], b = feature.path[segment + 1], length = lengths[segment];
    const t = distance / length, offset = ((i % 3) - 1) * (feature.width ?? 0);
    return { x: a[0] + (b[0] - a[0]) * t - (b[1] - a[1]) / length * offset,
      z: a[1] + (b[1] - a[1]) * t + (b[0] - a[0]) / length * offset };
  });
}

function wallClear(x: number, z: number, radius: number, walls: readonly AuthoredWallRun[]): boolean {
  for (const [ax, az, bx, bz] of walls) {
    const dx = bx - ax, dz = bz - az, denominator = dx * dx + dz * dz;
    const t = denominator ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / denominator)) : 0;
    if (Math.hypot(x - ax - dx * t, z - az - dz * t) < radius + 1.5) return false;
  }
  return true;
}

function supportedRoot(tree: AuthoredTreeRecord, x: number, z: number, terrain: PlacementTerrain): boolean {
  // Production root sectors rotate independently and reach 1.08 r. Reserve
  // a small extra bank cushion so inter-sample angles cannot graze wet soil.
  const radius = treeRootDecalRadius(tree.dr) * 1.08 + 0.15;
  const y = terrain.getHeightAt(x, z);
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8, px = x + Math.cos(angle) * radius, pz = z + Math.sin(angle) * radius;
    if (terrain._noVeg(px, pz) || terrain.getWaterMaskAt(px, pz) !== 0
        || terrain.getNormalAt(px, pz).y <= 0.82 || Math.abs(terrain.getHeightAt(px, pz) - y) > 1.2) return false;
  }
  return true;
}

/** A terraced row's station slid along the hillside's fall line (a 6 m baseline reads the slope, not the bench under it)
 * to the nearest ground within `searchM` that a root stands level on (16 points 3.2 m out within 0.9 m of the station's
 * height) and `admit` passes (the site rules, no two trunks already there); the station itself where none does.
 * Deterministic: no RNG. */
function benchStation(station: { x: number; z: number }, searchM: number, terrain: PlacementTerrain,
  admit: (x: number, z: number) => boolean): { x: number; z: number } {
  const h = (x: number, z: number) => terrain.getHeightAt(x, z);
  const gx = h(station.x + 6, station.z) - h(station.x - 6, station.z), gz = h(station.x, station.z + 6) - h(station.x, station.z - 6);
  const g = Math.hypot(gx, gz);
  if (g < 1e-6) return station;
  const ux = gx / g, uz = gz / g;
  const level = (x: number, z: number) => {
    const y = h(x, z);
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      if (Math.abs(h(x + Math.cos(a) * 3.2, z + Math.sin(a) * 3.2) - y) > 0.9) return false;
    }
    return true;
  };
  for (let k = 0; k <= Math.round(searchM * 2); k++) {
    for (const sign of k === 0 ? [1] : [1, -1]) {
      const x = station.x + ux * sign * k * 0.5, z = station.z + uz * sign * k * 0.5;
      if (admit(x, z) && level(x, z)) return { x, z };
    }
  }
  return station;
}

function targetClear(tree: AuthoredTreeRecord, x: number, z: number,
  terrain: PlacementTerrain,
  structures: readonly StructureClearance[], walls: readonly AuthoredWallRun[]): boolean {
  const envelope = tree.cr + Math.sin(TREE_ARCHETYPES[tree.species].leanMaxRad) * (tree.fallH ?? 0);
  if (overlapsStructureClearance(structures, x, z, envelope) || !wallClear(x, z, envelope, walls)
      || !supportedRoot(tree, x, z, terrain)) return false;
  return true;
}

/** Canopies may overlap, but a station must not stack existing trunks. */
function stationOccupant(trees: readonly AuthoredTreeRecord[], x: number, z: number): number {
  let occupied = -1;
  for (let index = 0; index < trees.length; index++) {
    if (Math.hypot(x - trees[index].x, z - trees[index].z) >= 2.5) continue;
    if (occupied >= 0) return -2;
    occupied = index;
  }
  return occupied;
}

function nearestDonor<T extends AuthoredTreeRecord>(trees: readonly T[], donors: ReadonlySet<T>,
  used: ReadonlySet<T>, interactions: ReadonlyMap<number, number>, species: TreeSpecies,
  point: { x: number; z: number }, occupied: number, terrain: PlacementTerrain,
  structures: readonly StructureClearance[], walls: readonly AuthoredWallRun[]): { chosen: number; available: number } {
  let chosen = -1, distance = Infinity, available = 0;
  for (let index = 0; index < trees.length; index++) {
    const tree = trees[index];
    if (!donors.has(tree) || used.has(tree) || tree.species !== species || !interactions.has(index)) continue;
    available++;
    if (occupied >= 0 && occupied !== index) continue;
    const d = Math.hypot(tree.x - point.x, tree.z - point.z);
    if (d >= distance || !targetClear(tree, point.x, point.z, terrain, structures, walls)) continue;
    chosen = index; distance = d;
  }
  return { chosen, available };
}

function relocate(tree: AuthoredTreeRecord, obstacle: CollisionRecord, concealer: { x: number; z: number },
  x: number, z: number, groundY: number): void {
  if (obstacle.shape2?.kind !== 'circle') throw new Error('Authored tree donor needs its existing circular trunk');
  const dx = x - tree.x, dz = z - tree.z, dy = groundY - 0.06 - tree.mat.elements[13];
  tree.x = x; tree.z = z; tree.cy += dy;
  tree.mat.elements[12] = x; tree.mat.elements[13] += dy; tree.mat.elements[14] = z;
  obstacle.min[0] += dx; obstacle.max[0] += dx; obstacle.min[1] += dy; obstacle.max[1] += dy;
  obstacle.min[2] += dz; obstacle.max[2] += dz;
  obstacle.shape2.cx = x; obstacle.shape2.cz = z;
  concealer.x = x; concealer.z = z;
}

/**
 * A procedural tree of another species stands on an authored station. The nearest eligible donor
 * takes the station and the squatter takes the donor's old ground, provided that ground clears the
 * same structure / wall / root-support rules a station must (2026-09-14: the desktop tree richness
 * put more squatters on the mangrove banks; pure relocation had to give those stations up).
 */
function displaceSquatter<T extends AuthoredTreeRecord>(
  trees: T[], obstacles: Array<CollisionRecord & { treeIdx: number }>, concealers: Array<{ x: number; z: number }>,
  donors: ReadonlySet<T>, used: Set<T>, interactions: ReadonlyMap<number, number>, species: TreeSpecies,
  point: { x: number; z: number }, occupied: number, terrain: PlacementTerrain,
  structures: readonly StructureClearance[], walls: readonly AuthoredWallRun[],
): boolean {
  const squatter = trees[occupied];
  const squatterInteraction = interactions.get(occupied);
  if (used.has(squatter) || squatterInteraction === undefined) return false;
  const { chosen } = nearestDonor(trees, donors, used, interactions, species, point, -1, terrain, structures, walls);
  if (chosen < 0 || chosen === occupied) return false;
  const donor = trees[chosen], donorInteraction = interactions.get(chosen)!;
  const groundX = donor.x, groundZ = donor.z;
  if (!targetClear(squatter, groundX, groundZ, terrain, structures, walls)) return false;
  relocate(donor, obstacles[donorInteraction], concealers[donorInteraction], point.x, point.z, terrain.getHeightAt(point.x, point.z));
  relocate(squatter, obstacles[squatterInteraction], concealers[squatterInteraction], groundX, groundZ, terrain.getHeightAt(groundX, groundZ));
  used.add(donor); used.add(squatter);
  return true;
}

export function redistributeAuthoredTrees<T extends AuthoredTreeRecord>(
  trees: T[], obstacles: Array<CollisionRecord & { treeIdx: number }>, concealers: Array<{ x: number; z: number }>,
  donors: ReadonlySet<T>, features: readonly AuthoredTreeFeature[], terrain: PlacementTerrain,
  siteOk: (x: number, z: number, margin: number) => boolean, structures: readonly StructureClearance[],
  walls: readonly AuthoredWallRun[],
): AuthoredTreeReceipt[] {
  if (obstacles.length !== concealers.length) throw new Error('Redistribute trees before bush concealment');
  const interactions = new Map<number, number>();
  obstacles.forEach((obstacle, index) => interactions.set(obstacle.treeIdx, index));
  const used = new Set<T>();
  return features.map(feature => {
    const receipt = { id: feature.id, attempted: feature.count, accepted: 0, unsafe: 0, noDonor: 0, displaced: 0 };
    for (const station of authoredTreeStations(feature)) {
      const point = feature.bench
        ? benchStation(station, feature.bench.searchM, terrain, (x, z) => siteOk(x, z, 0) && stationOccupant(trees, x, z) !== -2)
        : station;
      if (!siteOk(point.x, point.z, 0)) { receipt.unsafe++; continue; }
      // Once per station, not a quadratic scan for every possible donor.
      const occupied = stationOccupant(trees, point.x, point.z);
      if (occupied === -2) { receipt.unsafe++; continue; }
      const { chosen, available } = nearestDonor(trees, donors, used, interactions,
        feature.species, point, occupied, terrain, structures, walls);
      if (chosen < 0) {
        if (occupied >= 0 && displaceSquatter(trees, obstacles, concealers, donors, used, interactions,
          feature.species, point, occupied, terrain, structures, walls)) { receipt.accepted++; receipt.displaced++; continue; }
        if (available) receipt.unsafe++; else receipt.noDonor++; continue;
      }
      const tree = trees[chosen], interaction = interactions.get(chosen)!;
      relocate(tree, obstacles[interaction], concealers[interaction], point.x, point.z, terrain.getHeightAt(point.x, point.z));
      used.add(tree); receipt.accepted++;
    }
    return receipt;
  });
}
