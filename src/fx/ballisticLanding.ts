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

/** The landing search's step near the ground (s), its longest step (s) and default horizon (s). */
const STEP_S = 1 / 24;
const MAX_STEP_S = 0.5;
const HORIZON_S = 8;
/**
 * The steepest the ground is taken to rise under a piece's travel (rise per metre) when a step is sized: a piece this
 * far above the ground cannot meet it within a step that falls short of the gap (its fall plus the ground's rise under
 * its travel), so a high piece takes a few long steps and only the last metres are walked at STEP_S. A collapse throws
 * hundreds of pieces in one frame; walked at STEP_S throughout, their landings cost 21 µs each (a 1,000-piece burst
 * 21 ms).
 */
const GROUND_RISE_BOUND = 2;

/**
 * The flight from (ox, oy, oz) at (vx, vy, vz) under drag `k` (1/s) and gravity, until its centre comes within `lift` of
 * `groundY` under it. Writes [landing age (s; Infinity: not within the horizon), the ground there, x, z] to `out`, and
 * returns the landing age. A piece that starts on or under the ground lands at once where it is.
 */
// the flight being solved (module scratch: a call allocates nothing, no closure per piece)
let _ox = 0, _oy = 0, _oz = 0, _vx = 0, _vy = 0, _vz = 0, _k = 1, _lift = 0;
let _ground: (x: number, z: number) => number = () => 0;
function aboveAt(t: number): number {
  const sd = (1 - Math.exp(-_k * t)) / _k;
  return _oy + _vy * sd - 4.9 * t * t - (_ground(_ox + _vx * sd, _oz + _vz * sd) + _lift);
}
function landAt(t: number, out: Float64Array | number[]): void {
  const sd = (1 - Math.exp(-_k * t)) / _k;
  const x = _ox + _vx * sd, z = _oz + _vz * sd;
  out[0] = t; out[1] = _ground(x, z); out[2] = x; out[3] = z;
}

export function ballisticLanding(ox: number, oy: number, oz: number, vx: number, vy: number, vz: number, k: number,
  lift: number, groundY: (x: number, z: number) => number, out: Float64Array | number[], horizonS = HORIZON_S): number {
  const kk = Math.max(1e-3, k);
  _ox = ox; _oy = oy; _oz = oz; _vx = vx; _vy = vy; _vz = vz; _k = kk; _lift = lift; _ground = groundY;
  // a piece born at or under the ground (a clod off a crater's floor, a block inside a risen heap) flies once its flight
  // takes it clear (thrown up out of it); one that never comes clear lies where it is
  let t0 = 0;
  if (aboveAt(0) <= 0) {
    let clear = -1;
    if (vy > 0) for (let t = STEP_S; t <= Math.min(horizonS, 2) + 1e-9; t += STEP_S) { if (aboveAt(t) > 0) { clear = t; break; } }
    if (clear < 0) { landAt(0, out); return 0; }
    t0 = clear;
  }
  const speedXZ = Math.hypot(vx, vz);
  let gap = aboveAt(t0);
  while (t0 < horizonS - 1e-9) {
    // the longest step that cannot reach the ground (its fall from the speed it has now under gravity and the drag on
    // a rise, the ground rising GROUND_RISE_BOUND under its travel), never shorter than STEP_S
    const e = Math.exp(-kk * t0);
    const b = Math.max(0, 9.8 * t0 - vy * e) + GROUND_RISE_BOUND * speedXZ * e;
    const accel = 9.8 + kk * Math.max(0, vy) * e;
    const reach = gap > 0 ? (-b + Math.sqrt(b * b + 2 * accel * gap)) / accel : 0;
    const t = Math.min(horizonS, t0 + Math.min(MAX_STEP_S, Math.max(STEP_S, reach)));
    const a = aboveAt(t);
    if (a <= 0) {
      let lo = t0, hi = t;
      for (let i = 0; i < 6; i++) { const mid = (lo + hi) * 0.5; if (aboveAt(mid) <= 0) hi = mid; else lo = mid; }
      landAt(hi, out);
      return hi;
    }
    t0 = t;
    gap = a;
  }
  landAt(horizonS, out);
  out[0] = Infinity;
  return Infinity;
}
