/** Construction-only clearance shared by every tree placement path. */
export interface StructureClearance {
  x: number;
  z: number;
  halfWidth: number;
  halfLength: number;
  cos: number;
  sin: number;
}

interface StructureSite {
  x: number;
  z: number;
  yawDeg?: number;
  structure?: string;
}

export function createStructureClearances(
  sites: readonly StructureSite[],
  types: Readonly<Record<string, { hw: number; hl: number }>>,
): StructureClearance[] {
  return sites.flatMap((site) => {
    const dimensions = site.structure ? types[site.structure] : undefined;
    if (!dimensions) return [];
    const yaw = (site.yawDeg ?? 0) * Math.PI / 180;
    return [{
      x: site.x, z: site.z,
      // Metadata contains the rigid roof envelope. A small working apron
      // protects eaves and branch sway without clearing a whole circular yard.
      halfWidth: dimensions.hw + 0.75,
      halfLength: dimensions.hl + 0.75,
      cos: Math.cos(yaw), sin: Math.sin(yaw),
    }];
  });
}

export function overlapsStructureClearance(
  sites: readonly StructureClearance[], x: number, z: number, radius: number,
): boolean {
  for (const site of sites) {
    const dx = x - site.x, dz = z - site.z;
    const lx = dx * site.cos - dz * site.sin;
    const lz = dx * site.sin + dz * site.cos;
    const ex = Math.max(0, Math.abs(lx) - site.halfWidth);
    const ez = Math.max(0, Math.abs(lz) - site.halfLength);
    if (ex * ex + ez * ez <= radius * radius) return true;
  }
  return false;
}

/**
 * Filter only after seeded placement finishes, before instancing/root decals.
 * No replacement trees or extra RNG draws: unaffected candidates stay exact.
 * Collision and spotting records remain paired, with repaired tree indices.
 */
export function excludeStructureVegetation<T extends { x: number; z: number },
  O extends { treeIdx: number }, C>(
  trees: T[], obstacles: O[], concealers: C[],
  sites: readonly StructureClearance[], radiusOf: (tree: T) => number,
): number {
  if (!sites.length) return 0;
  return excludeVegetation(trees,obstacles,concealers,
    tree=>overlapsStructureClearance(sites,tree.x,tree.z,radiusOf(tree)));
}

/** Keep record ordering and collision/concealment pairing after authored filters. */
export function excludeVegetation<T,O extends {treeIdx:number},C>(
  trees:T[],obstacles:O[],concealers:C[],reject:(tree:T)=>boolean,
): number {
  if (obstacles.length !== concealers.length) {
    throw new Error('Tree clearance must run before non-tree concealment is added');
  }
  const remap = new Int32Array(trees.length);
  const originalCount = trees.length;
  let kept = 0;
  for (let i = 0; i < originalCount; i++) {
    const tree = trees[i];
    if (reject(tree)) {
      remap[i] = -1;
    } else {
      remap[i] = kept;
      trees[kept++] = tree;
    }
  }
  trees.length = kept;
  let keptObstacles = 0;
  for (let i = 0; i < obstacles.length; i++) {
    const obstacle = obstacles[i];
    const index = remap[obstacle.treeIdx];
    if (index < 0) continue;
    obstacle.treeIdx = index;
    obstacles[keptObstacles] = obstacle;
    concealers[keptObstacles++] = concealers[i];
  }
  obstacles.length = concealers.length = keptObstacles;
  return originalCount - kept;
}
