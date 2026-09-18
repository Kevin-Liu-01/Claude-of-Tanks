// Frontline Assault line geometry shared by the match mode (sector zones),
// the world (real trenches carved into the terrain so tanks drive through
// them with collision) and the match presentation (parapets, wire, works).
//
// Everything here is pure arithmetic over two team centres so the terrain
// build, which runs before any match state exists, and the match state, which
// runs after the terrain, agree on the same lines to the millimetre.

export const ASSAULT_LINE_FRACTIONS = [0.25, 0.55, 0.85] as const;

interface AssaultPoint { x: number; z: number }

interface AssaultTrenchLine {
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

/** Cross-section of a carved line (metres); a plan without one carves the fortified ASSAULT_TRENCH section. */
export interface TrenchProfile {
  floorHalfWidthM: number;
  wallRunM: number;
  depthM: number;
  endRampM: number;
}

export interface AssaultTrenchPlan {
  lines: readonly AssaultTrenchLine[];
  /** Field trenches (2026-09-17) carve a shallower section with gentle banks; sector lines leave this unset. */
  profile?: TrenchProfile;
  /** Communication trench along the axis from the first to the last line. */
  connector: { x0: number; z0: number; x1: number; z1: number } | null;
  /**
   * One entry per ASSAULT_LINE_FRACTIONS sector, in order: the carved line's centre, or null
   * when that sector's trench was dropped (settlement) and the mode must fall back to its
   * axis fraction. Index-aligned so sectors never inherit a neighbour's position (2026-09-14).
   */
  sectors?: readonly (AssaultPoint | null)[];
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

/**
 * Field trenches on every map (owner 2026-09-17: "more trenches … on ALL maps, extra in Frontline Assault"):
 * two short fire trenches per side of the alpha→bravo axis, 30 % and 70 % of the way to the enemy, the same
 * cross-section as the assault lines. The terrain drops a line where a settlement, a road or an assault sector
 * line would cross it; the assault variant carries these on top of its three sector lines.
 */
export const FIELD_TRENCH = Object.freeze({
  fractions: [0.30, 0.70] as const,
  lateralFrac: 0.22,
  maxLateralM: 150,
  halfLengthM: 26,
  minAxisM: 140,
  // a fire trench, not a fortified sector line: 1.15 m deep over a 4 m floor with 24° banks (2.6 m run), so a tank
  // that drives through it climbs out at speed instead of crawling up a 42° wall (server/battlePacing on the trenched
  // maps: 16/120 time-limit results at the fortified section, back under the 12.5 % cap with these banks)
  profile: Object.freeze({ floorHalfWidthM: 2.0, wallRunM: 2.6, depthM: 1.15, endRampM: 8 }) as TrenchProfile,
});

export function planFieldTrenchLines(alpha: AssaultPoint, bravo: AssaultPoint): AssaultTrenchPlan {
  const dx = bravo.x - alpha.x, dz = bravo.z - alpha.z;
  const axisLength = Math.hypot(dx, dz);
  if (!(axisLength >= FIELD_TRENCH.minAxisM)) return { lines: [], connector: null };
  const ax = dx / axisLength, az = dz / axisLength;
  const lx = -az, lz = ax;
  const lateral = Math.min(FIELD_TRENCH.maxLateralM, axisLength * FIELD_TRENCH.lateralFrac);
  const lines: AssaultTrenchLine[] = [];
  for (const fraction of FIELD_TRENCH.fractions) {
    for (const side of [-1, 1]) {
      lines.push({
        x: alpha.x + ax * axisLength * fraction + lx * lateral * side,
        z: alpha.z + az * axisLength * fraction + lz * lateral * side,
        ax, az, lx, lz,
        halfLengthM: FIELD_TRENCH.halfLengthM,
      });
    }
  }
  return { lines, connector: null, profile: FIELD_TRENCH.profile };
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
  const T = plan.profile ?? ASSAULT_TRENCH;
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
        depth = Math.max(depth, ASSAULT_TRENCH.connectorDepthM
          * trenchProfile(across, ASSAULT_TRENCH.connectorHalfWidthM, ASSAULT_TRENCH.connectorWallRunM));
      }
    }
  }
  return depth;
}
