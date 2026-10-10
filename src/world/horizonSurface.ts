import type { CanyonGround } from './horizonRedrock.ts';

function smoothstep(a: number, b: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Carry the conditioned road shoulders into the surrounding geology. */
export function continuedGroundAt(ground: CanyonGround, x: number, z: number): number {
  const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - 512;
  if (edgeOut <= 0 || !ground.getOutlandHeightAt) return ground.getHeightAt(x, z);
  const ex = Math.max(-511.5, Math.min(511.5, x)), ez = Math.max(-511.5, Math.min(511.5, z));
  const residual = ground.getHeightAt(ex, ez) - ground.getOutlandHeightAt(ex, ez);
  return ground.getOutlandHeightAt(x, z) + residual * (1 - smoothstep(0, 180, edgeOut));
}

/**
 * continuedGroundAt for one pass over many points (the time-to-battle lane, 2026-10-08): the same law and the same
 * arithmetic, with the square-clamped residual kept by its point. Every sample past an edge clamps to a point on that
 * edge (every sample past a corner to the corner), so a pass asks the same residuals again and again (the seam's
 * refinement: four in ten). For a pass during which the ground does not change; a zero clamp coordinate is not kept
 * (-0 and +0 are one key, and the ground may tell them apart).
 */
export function continuedGroundSampler(ground: CanyonGround): (x: number, z: number) => number {
  const residuals = new Map<number, Map<number, number>>();
  return (x: number, z: number): number => {
    const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - 512;
    if (edgeOut <= 0 || !ground.getOutlandHeightAt) return ground.getHeightAt(x, z);
    const ex = Math.max(-511.5, Math.min(511.5, x)), ez = Math.max(-511.5, Math.min(511.5, z));
    let residual: number | undefined;
    if (ex === 0 || ez === 0) residual = ground.getHeightAt(ex, ez) - ground.getOutlandHeightAt(ex, ez);
    else {
      let row = residuals.get(ex);
      if (!row) residuals.set(ex, row = new Map());
      residual = row.get(ez);
      if (residual === undefined) row.set(ez, residual = ground.getHeightAt(ex, ez) - ground.getOutlandHeightAt(ex, ez));
    }
    return ground.getOutlandHeightAt(x, z) + residual * (1 - smoothstep(0, 180, edgeOut));
  };
}

/** Construction-time sampling of the two triangles actually drawn in a ring
 * quad. Extrapolating its first triangle through the fourth corner floats
 * props above warped cliffs. The caller owns the reusable output. */
export interface HorizonSurfacePoint { x: number; y: number; z: number; slope: number }
export function sampleHorizonFace(
  positions: Float32Array, heights: Float32Array,
  i00: number, i01: number, i10: number, i11: number,
  u: number, w: number, out: HorizonSurfacePoint,
): HorizonSurfacePoint {
  const upper = u + w > 1;
  const a = upper ? i11 : i00, b = i01, c = i10;
  const ub = upper ? 1 - w : u, uc = upper ? 1 - u : w;
  const ax = positions[a * 3], az = positions[a * 3 + 2], ay = heights[a];
  const bx = positions[b * 3] - ax, bz = positions[b * 3 + 2] - az, by = heights[b] - ay;
  const cx = positions[c * 3] - ax, cz = positions[c * 3 + 2] - az, cy = heights[c] - ay;
  out.x = ax + bx * ub + cx * uc; out.y = ay + by * ub + cy * uc; out.z = az + bz * ub + cz * uc;
  const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
  out.slope = Math.hypot(nx, nz) / Math.max(1e-6, Math.abs(ny));
  return out;
}
