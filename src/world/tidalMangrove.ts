/** Map-owned tidal forms. Root arches are decorative, like legacy flares;
 * hull/shell interaction remains the existing crushable main-stem cylinder. */
import type { BufferGeometry } from 'three';
import { authoredTreeStations, type AuthoredTreeFeature, type AuthoredTreeRecord } from './authoredTreePlacement.ts';
import type { CollisionRecord } from './collision.ts';
import type { HeightField } from './terrain.ts';
import { overlapsStructureClearance, type StructureClearance } from './vegetationClearance.ts';
import { planRiverLanding, type RiverLandingAnchor } from './maps/riverLandings.ts';

export interface TidalMangroveFeature extends AuthoredTreeFeature {
  species: 'willow';
  /** Explicit small thickets, not evenly spaced plantations. */
  clumps: readonly number[];
}

interface TidalReceipt {
  id: string;
  attempted: number;
  accepted: number;
  unsafe: number;
  noDonor: number;
  treeIndices: number[];
}

/** Reshape the existing closed six-sided/two-segment cone, never add a part. */
export function bendMangroveRoot(geometry: BufferGeometry, angle: number, length: number, tilt: number): void {
  const a = geometry.attributes.position;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const reach = 0.94 + (length - 0.627) * 0.85;
  const joinY = 1.18 + (tilt - 0.1) * 2;
  const footY = -0.75;
  const rise = joinY - footY, span = reach - 0.08;
  const norm = Math.hypot(rise, span), br = rise / norm, by = span / norm;
  for (let i = 0; i < a.count; i++) {
    const t = (a.getY(i) + length / 2) / length;
    const side = a.getX(i), cross = a.getZ(i);
    const radial = 0.08 + span * t + Math.sin(Math.PI * t) * 0.18 + cross * br;
    const y = joinY - rise * t + cross * by;
    a.setXYZ(i, ca * radial - sa * side, y, sa * radial + ca * side);
  }
  geometry.computeVertexNormals();
}

type MangroveCapColumn = { x: number; z: number };
type MangrovePosition = BufferGeometry['attributes'][string];

/** A sufficient disk interior inside actual outward triangle planes; not an
 * assumption that a closed, jittered lobe must also be convex. */
function mangroveLobeCapHeight(p: MangrovePosition, begin: number, cx: number, cz: number,
  preferredY: number, radius: number): number | undefined {
  // The extra 0.1 mm keeps the final Float32 cap off a tangent face.
  const paddedRadius = radius + 1e-4;
  let low = 0, high = Infinity;
  for (let i = begin; i < begin + 60; i += 3) {
    const ax = p.getX(i), ay = p.getY(i), az = p.getZ(i);
    const bx = p.getX(i + 1) - ax, by = p.getY(i + 1) - ay, bz = p.getZ(i + 1) - az;
    const dx = p.getX(i + 2) - ax, dy = p.getY(i + 2) - ay, dz = p.getZ(i + 2) - az;
    const nx = by * dz - bz * dy, ny = bz * dx - bx * dz, nz = bx * dy - by * dx;
    const norm = Math.hypot(nx, ny, nz);
    const rhs = nx * (ax - cx) + ny * ay + nz * (az - cz) - paddedRadius * Math.hypot(nx, nz);
    if (!Number.isFinite(norm + rhs) || norm < 1e-12) return undefined;
    if (Math.abs(ny) <= norm * 1e-12) {
      if (rhs < 0) return undefined;
    } else if (ny > 0) high = Math.min(high, rhs / ny);
    else low = Math.max(low, rhs / ny);
  }
  if (!Number.isFinite(high) || high - low <= 2e-4) return undefined;
  const inset = Math.min(radius, (high - low) / 2);
  return Math.max(low + inset, Math.min(preferredY, high - inset));
}

function moveMangroveCapColumn(p: MangrovePosition, begin: number, column: MangroveCapColumn,
  x: number, z: number, radius: number): boolean {
  let cx = 0, cz = 0;
  for (let i = begin; i < begin + 60; i++) { cx += p.getX(i); cz += p.getZ(i); }
  cx /= 60; cz /= 60;
  const travel = Math.hypot(cx - x, cz - z), reach = radius * 2;
  if (!Number.isFinite(travel)) return false;
  // Move toward a real lobe center by at most one existing cap diameter.
  const fraction = travel > reach ? reach / travel : 1;
  column.x = x + (cx - x) * fraction; column.z = z + (cz - z) * fraction;
  return true;
}

/** Construction-only, for two library variants; no geometry/state is retained. */
function mangroveCapAttachment(canopy: BufferGeometry, x: number, y: number, z: number,
  radius: number): MangroveCapColumn & { y: number } {
  const target = { x, y, z }, column = { x, z }, p = canopy?.attributes.position;
  if (!p || canopy.index || p.count < 360 || p.count > 480 || p.count % 60 !== 0) return target;
  for (let pass = 0; pass < 2; pass++) {
    let best = Infinity;
    for (let begin = 0; begin < p.count; begin += 60) {
      if (pass === 1 && !moveMangroveCapColumn(p, begin, column, x, z, radius)) continue;
      const cy = mangroveLobeCapHeight(p, begin, column.x, column.z, y, radius);
      if (cy === undefined) continue;
      const distance = (column.x - x) ** 2 + (cy - y) ** 2 + (column.z - z) ** 2;
      if (distance < best) { best = distance; target.x = column.x; target.y = cy; target.z = column.z; }
    }
    if (best < Infinity) break; // Preserve the original bend whenever its column fits.
  }
  // Unsupported/malformed future crowns retain the legacy finite stem rather
  // than crashing map load. Actual-builder tests must still prove containment.
  return target;
}

/** Same closed distant stem and ground ring; attach its cap to its actual crown. */
export function shapeMangroveFarStem(geometry: BufferGeometry, variant: number, canopy: BufferGeometry): void {
  const p = geometry.attributes.position;
  let height = 0, radius = 0;
  for (let i = 0; i < p.count; i++) height = Math.max(height, p.getY(i));
  if (!(height > 0) || !Number.isFinite(height)) return;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) === height) radius = Math.max(radius, Math.hypot(p.getX(i), p.getZ(i)) * .5);
  }
  const angle = variant === 0 ? 0 : 2.2;
  // Keep exact ground-ring bytes (including Float32 dust). The legacy bend and
  // height are preferences, never evidence that the cap meets a lobe.
  const legacyHeight = variant === 0 ? 2.86 : height;
  const cx = Math.cos(angle) * .24, cz = Math.sin(angle) * .24;
  const cap = mangroveCapAttachment(canopy, cx, legacyHeight, cz, radius);
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / height;
    if (t === 1) p.setXYZ(i, p.getX(i) * .5 + cap.x, cap.y, p.getZ(i) * .5 + cap.z);
    else p.setXYZ(i, p.getX(i) * .5 + cx * t, legacyHeight * t, p.getZ(i) * .5 + cz * t);
  }
  geometry.computeVertexNormals();
}

function stationNoise(index: number, salt: number): number {
  let h = Math.imul(index + 1, 374761393) ^ Math.imul(salt, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A bounded explicit allocation to irregular 2D groups. This independent
 * position hash never consumes the existing species/placement RNG stream. */
export function tidalMangroveStations(feature: TidalMangroveFeature): Array<{ x: number; z: number }> {
  if (feature.path.length !== 2 || feature.clumps.length < 2 || feature.clumps.length > 20
      || feature.clumps.some(n => !Number.isInteger(n) || n < 3 || n > 5)
      || feature.clumps.reduce((a, b) => a + b, 0) !== feature.count) throw new Error('Invalid bounded tidal thickets');
  const reference = authoredTreeStations(feature);
  const a = reference[0], b = reference[reference.length - 1];
  const length = Math.hypot(b.x - a.x, b.z - a.z), tx = (b.x - a.x) / length, tz = (b.z - a.z) / length;
  const gaps = feature.clumps.slice(1).map((_, i) => .8 + stationNoise(i, 31) * .45);
  const total = gaps.reduce((x, y) => x + y, 0), points: Array<{ x: number; z: number }> = [];
  let along = 6;
  feature.clumps.forEach((count, group) => {
    if (group > 0) along += gaps[group - 1] / total * (length - 12);
    const lateral = (stationNoise(group, 73) - .5) * 2;
    const phase = stationNoise(group, 97) * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const angle = phase + i / count * Math.PI * 2 + (stationNoise(group * 5 + i, 113) - .5) * .12;
      const radius = 2.8 + stationNoise(group * 5 + i, 157) * .4;
      const longitudinal = along + Math.cos(angle) * radius, cross = lateral + Math.sin(angle) * radius;
      points.push({ x: a.x + tx * longitudinal - tz * cross, z: a.z + tz * longitudinal + tx * cross });
    }
  });
  return points;
}

/** A deliberately local exception for tidal roots, not a soft-ground bypass.
 * Every point in the entire 3 m root footprint must be canonical flat water.
 * Dry shoulders, fords, roads and spawn approaches remain unavailable. */
function wetFootprintClear(field: HeightField, x: number, z: number): boolean {
  const y = field.getHeightAt(x, z);
  for (let ring = 0; ring <= 2; ring++) for (let i = 0; i < (ring ? 16 : 1); i++) {
    const angle = i * Math.PI / 8, px = x + Math.cos(angle) * ring * 1.5, pz = z + Math.sin(angle) * ring * 1.5;
    if (field.getWaterMaskAt(px, pz) !== 1 || Math.abs(field.getHeightAt(px, pz) - y) > 1e-8
        || field._roadDist(px, pz) < 31) return false;
  }
  return true;
}

function clearStation(field: HeightField, x: number, z: number, structures: readonly StructureClearance[],
  keepouts: readonly { x: number; z: number; r: number }[]): boolean {
  const v = field._layout.village;
  if (Math.max(Math.abs(x), Math.abs(z)) > 420
      || (x > v.x0 - 32 && x < v.x1 + 32 && z > v.z0 - 32 && z < v.z1 + 32)
      || overlapsStructureClearance(structures, x, z, 8)) return false;
  for (const p of [field._layout.spawns.player, ...field._layout.spawns.enemies]) {
    if (Math.hypot(x - p.x, z - p.z) < 40) return false;
  }
  for (const k of keepouts) if (Math.hypot(x - k.x, z - k.z) < k.r + 8) return false;
  return wetFootprintClear(field, x, z);
}

function selectDonor<T extends AuthoredTreeRecord>(trees: readonly T[], donors: ReadonlySet<T>, used: ReadonlySet<T>,
  interactions: ReadonlyMap<number, number>, x: number, z: number, reference: { x: number; z: number },
  dryStations: readonly { x: number; z: number }[]): number {
  let chosen = -1, distance = Infinity;
  for (let i = 0; i < trees.length; i++) {
    const t = trees[i];
    if (Math.hypot(t.x - x, t.z - z) < 2.5) return -1;
    if (t.species !== 'willow' || !donors.has(t) || used.has(t) || !interactions.has(i)) continue;
    // Never steal the already composed dry bank rows to populate the tide.
    if (dryStations.some(p => Math.hypot(t.x - p.x, t.z - p.z) < 0.01)) continue;
    const d = Math.hypot(t.x - reference.x, t.z - reference.z);
    if (d < distance) { chosen = i; distance = d; }
  }
  return chosen;
}

function moveTidalTree(tree: AuthoredTreeRecord, obstacle: CollisionRecord, concealer: { x: number; z: number },
  x: number, z: number, y: number): void {
  if (obstacle.shape2?.kind !== 'circle') throw new Error('Tidal donor requires the existing main-stem cylinder');
  const dx = x - tree.x, dz = z - tree.z, dy = y - .06 - tree.mat.elements[13];
  tree.x = x; tree.z = z; tree.cy += dy;
  tree.mat.elements[12] = x; tree.mat.elements[13] += dy; tree.mat.elements[14] = z;
  // A ground-contact shadow decal on liquid would look like a floating pad.
  tree.dr = 0;
  obstacle.min[0] += dx; obstacle.max[0] += dx; obstacle.min[1] += dy; obstacle.max[1] += dy;
  obstacle.min[2] += dz; obstacle.max[2] += dz;
  obstacle.shape2.cx = x; obstacle.shape2.cz = z;
  concealer.x = x; concealer.z = z;
}

/** Construction-only one-for-one allocation transfer; no RNG or new trees. */
export function relocateTidalMangroves<T extends AuthoredTreeRecord>(
  trees: T[], obstacles: Array<CollisionRecord & { treeIdx: number }>, concealers: Array<{ x: number; z: number }>,
  donors: ReadonlySet<T>, features: readonly TidalMangroveFeature[], dryFeatures: readonly AuthoredTreeFeature[],
  field: HeightField, structures: readonly StructureClearance[], anchors: readonly RiverLandingAnchor[],
  avoid: readonly { x: number; z: number; r: number }[],
): TidalReceipt[] {
  if (obstacles.length !== concealers.length) throw new Error('Tidal transfer requires paired pre-bush interaction slots');
  const interactions = new Map<number, number>();
  obstacles.forEach((obstacle, index) => interactions.set(obstacle.treeIdx, index));
  const dryStations = dryFeatures.flatMap(authoredTreeStations), used = new Set<T>();
  const keepouts = [...avoid];
  for (const anchor of anchors) {
    const landing = planRiverLanding(field, field._layout.lakes, anchor);
    if (!landing) throw new Error('Tidal trees require the actual authored landing');
    // The first creek landing also owns the complete working wharf. This
    // larger circle contains its roof, annexe, deck, boat and approach.
    keepouts.push({ x: landing.x, z: landing.z, r: anchor.lakeIndex === 20 ? 36 : 13 });
  }
  return features.map(feature => {
    const receipt: TidalReceipt = { id: feature.id, attempted: feature.count, accepted: 0, unsafe: 0, noDonor: 0, treeIndices: [] };
    const references = authoredTreeStations(feature);
    for (const [i, point] of tidalMangroveStations(feature).entries()) {
      if (!clearStation(field, point.x, point.z, structures, keepouts)) { receipt.unsafe++; continue; }
      const index = selectDonor(trees, donors, used, interactions, point.x, point.z, references[i], dryStations);
      if (index < 0) { receipt.noDonor++; continue; }
      const tree = trees[index], slot = interactions.get(index)!;
      moveTidalTree(tree, obstacles[slot], concealers[slot], point.x, point.z, field.getHeightAt(point.x, point.z));
      used.add(tree); receipt.accepted++; receipt.treeIndices.push(index);
    }
    return receipt;
  });
}
