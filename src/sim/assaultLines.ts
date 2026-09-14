// Frontline Assault line geometry shared by the match mode (sector zones),
// the world (real trenches carved into the terrain so tanks drive through
// them with collision) and the match presentation (parapets, wire, works).
//
// Everything here is pure arithmetic over two team centres so the terrain
// build, which runs before any match state exists, and the match state, which
// runs after the terrain, agree on the same lines to the millimetre.

export const ASSAULT_LINE_FRACTIONS = [0.25, 0.55, 0.85] as const;

export interface AssaultPoint { x: number; z: number }

export interface AssaultTrenchLine {
  /** Line centre on the alpha→bravo axis. */
  x: number;
  z: number;
  /** Unit axis from alpha toward bravo (the attack direction). */
  ax: number;
  az: number;
  /** Unit lateral direction along the trench. */
  lx: number;
  lz: number;
  halfLengthM: number;
}

export interface AssaultTrenchPlan {
  lines: readonly AssaultTrenchLine[];
  /** Communication trench along the axis from the first to the last line. */
  connector: { x0: number; z0: number; x1: number; z1: number } | null;
}

/** Cross-section and reach of the carved trenches (metres). */
export const ASSAULT_TRENCH = Object.freeze({
  halfLengthM: 58,          // each fire trench runs ±58 m across the axis
  floorHalfWidthM: 2.3,     // 4.6 m flat floor: one tank plus clearance
  wallRunM: 1.7,            // horizontal run of each sloped wall
  depthM: 1.55,             // floor below the surrounding ground
  endRampM: 9,              // ramped ends so tanks enter and leave the line
  connectorHalfWidthM: 2.0, // communication trench along the axis
  connectorWallRunM: 1.5,
  connectorDepthM: 1.25,
  minAxisM: 60,             // shorter axes carry no trenches (degenerate layouts)
});

const smooth01 = (t: number): number => {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return u * u * (3 - 2 * u);
};

/** Team centres from spawn points: alpha is the player's spawn, bravo the enemy centroid. */
export function assaultTeamCenters(
  player: AssaultPoint,
  enemies: readonly AssaultPoint[],
): { alpha: AssaultPoint; bravo: AssaultPoint } {
  let x = 0, z = 0;
  for (const point of enemies) { x += point.x; z += point.z; }
  const count = enemies.length || 1;
  return { alpha: { x: player.x, z: player.z }, bravo: { x: x / count, z: z / count } };
}

export function planAssaultTrenchLines(alpha: AssaultPoint, bravo: AssaultPoint): AssaultTrenchPlan {
  const dx = bravo.x - alpha.x, dz = bravo.z - alpha.z;
  const axisLength = Math.hypot(dx, dz);
  if (!(axisLength >= ASSAULT_TRENCH.minAxisM)) return { lines: [], connector: null };
  const ax = dx / axisLength, az = dz / axisLength;
  const lines = ASSAULT_LINE_FRACTIONS.map((fraction) => ({
    x: alpha.x + ax * axisLength * fraction,
    z: alpha.z + az * axisLength * fraction,
    ax, az, lx: -az, lz: ax,
    halfLengthM: ASSAULT_TRENCH.halfLengthM,
  }));
  const first = lines[0], last = lines[lines.length - 1];
  return { lines, connector: { x0: first.x, z0: first.z, x1: last.x, z1: last.z } };
}

/** Depth profile across a trench: flat floor, sloped walls, then the surface. */
export function trenchProfile(acrossM: number, floorHalfWidthM: number, wallRunM: number): number {
  const d = Math.abs(acrossM);
  if (d <= floorHalfWidthM) return 1;
  if (d >= floorHalfWidthM + wallRunM) return 0;
  return 1 - smooth01((d - floorHalfWidthM) / wallRunM);
}

/**
 * How deep (metres, ≥ 0) the ground is carved at (x, z). Fire trenches take the
 * deepest value; the communication trench joins them along the axis.
 */
export function assaultTrenchCarveDepth(x: number, z: number, plan: AssaultTrenchPlan): number {
  let depth = 0;
  const T = ASSAULT_TRENCH;
  for (const line of plan.lines) {
    const rx = x - line.x, rz = z - line.z;
    const along = rx * line.lx + rz * line.lz;      // position along the trench
    const across = rx * line.ax + rz * line.az;     // distance across it (toward bravo)
    if (Math.abs(along) > line.halfLengthM || Math.abs(across) > T.floorHalfWidthM + T.wallRunM) continue;
    const ramp = smooth01((line.halfLengthM - Math.abs(along)) / T.endRampM);
    depth = Math.max(depth, T.depthM * trenchProfile(across, T.floorHalfWidthM, T.wallRunM) * ramp);
  }
  const c = plan.connector;
  if (c) {
    const sx = c.x1 - c.x0, sz = c.z1 - c.z0;
    const len2 = sx * sx + sz * sz;
    if (len2 > 0) {
      const t = ((x - c.x0) * sx + (z - c.z0) * sz) / len2;
      if (t >= 0 && t <= 1) {
        const px = c.x0 + sx * t - x, pz = c.z0 + sz * t - z;
        const across = Math.hypot(px, pz);
        depth = Math.max(depth, T.connectorDepthM
          * trenchProfile(across, T.connectorHalfWidthM, T.connectorWallRunM));
      }
    }
  }
  return depth;
}
