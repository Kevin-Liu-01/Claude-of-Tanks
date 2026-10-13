/**
 * ballisticLanding.ts — where a thrown piece meets the ground (destruction stream, 2026-10-12; the owner's Steinburg
 * screenshot: "rows of brick chunks hanging in the air in strips ... make sure ... their rubble properly falls down onto
 * ground that can potentially be uneven").
 *
 * The GPU debris programs (structureDebris' pieces, debrisChunks' chunks) fly a piece from its spawn under drag and
 * gravity, p + v (1 - e^(-k t)) / k + ½ g t², and used to clamp it to a rest height read under its SPAWN point while it
 * slid on: off a heap's plateau, a bank or a slope a piece lay in the air at its spawn's height (or sank under ground
 * that rose). This finds where that flight first meets the ground as drawn — stepped, then refined — so the program can
 * stop the piece there, on the ground under its landing point. Pure, allocation-free, Node-runnable.
 */

/** The landing search's step (s) and default horizon (s). */
const STEP_S = 1 / 24;
const HORIZON_S = 8;

/**
 * The flight from (ox, oy, oz) at (vx, vy, vz) under drag `k` (1/s) and gravity, until its centre comes within `lift` of
 * `groundY` under it. Writes [landing age (s; Infinity: not within the horizon), the ground there, x, z] to `out`, and
 * returns the landing age. A piece that starts on or under the ground lands at once where it is.
 */
export function ballisticLanding(ox: number, oy: number, oz: number, vx: number, vy: number, vz: number, k: number,
  lift: number, groundY: (x: number, z: number) => number, out: Float64Array | number[], horizonS = HORIZON_S): number {
  const kk = Math.max(1e-3, k);
  const above = (t: number): number => {
    const sd = (1 - Math.exp(-kk * t)) / kk;
    return oy + vy * sd - 4.9 * t * t - (groundY(ox + vx * sd, oz + vz * sd) + lift);
  };
  const at = (t: number): void => {
    const sd = (1 - Math.exp(-kk * t)) / kk;
    const x = ox + vx * sd, z = oz + vz * sd;
    out[0] = t; out[1] = groundY(x, z); out[2] = x; out[3] = z;
  };
  // a piece born at or under the ground (a clod off a crater's floor, a block inside a risen heap) flies once its flight
  // takes it clear (thrown up out of it); one that never comes clear lies where it is
  let t0 = 0;
  if (above(0) <= 0) {
    let clear = -1;
    if (vy > 0) for (let t = STEP_S; t <= Math.min(horizonS, 2) + 1e-9; t += STEP_S) { if (above(t) > 0) { clear = t; break; } }
    if (clear < 0) { at(0); return 0; }
    t0 = clear;
  }
  for (let t = t0 + STEP_S; t <= horizonS + 1e-9; t += STEP_S) {
    if (above(t) <= 0) {
      let lo = t0, hi = t;
      for (let i = 0; i < 6; i++) { const mid = (lo + hi) * 0.5; if (above(mid) <= 0) hi = mid; else lo = mid; }
      at(hi);
      return hi;
    }
    t0 = t;
  }
  at(horizonS);
  out[0] = Infinity;
  return Infinity;
}
