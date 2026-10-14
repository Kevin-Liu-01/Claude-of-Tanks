/**
 * latticeGround.ts — the ground as drawn, for the debris programs' landing solves, read from its lattice's vertices
 * (destruction stream, 2026-10-13).
 *
 * The ground a battle has dug (effects' deformedGroundY: the terrain's contact surface plus the overlay's craters and
 * heaps) is piecewise linear on the 1.333 m contact lattice and its diagonal (terrainContactSurface.ts,
 * terrainDeformation.ts contactOffsetAt): its value anywhere is its three lattice vertices' interpolated. A collapse throws
 * hundreds of pieces in one frame and each landing solve reads the ground a dozen and more times; each read summed every
 * crater and heap of its bucket at three vertices (a crater's ragged rim is an atan2, six sines and an exp), and the
 * browser A/B against production measured the collapse frame 20 ms longer. This reads each vertex once — the sampler's
 * own value there, cached until the ground changes (`revision`) — and interpolates with the same split: the same surface,
 * a lookup a read. Presentation only (the sim reads its own ground); allocation-free once its vertices are warm.
 */

/** The terrain contact lattice (terrainContactSurface.ts): 1,024 m in 768 cells of 128/96 m. */
const HALF = 512;
const STEP = 128 / 96;
const CELLS = 768;
const N = CELLS + 1;

export interface LatticeGround {
  (x: number, z: number): number;
  /** Forget every vertex (the ground changed under it: a crater, a heap, a new battle). */
  clear(): void;
  /** Vertices held (receipts). */
  readonly size: number;
}

/**
 * `sample` is the ground as drawn (lattice-linear); `revision()` changes whenever it does (the overlay's stamp count, a
 * world swap), and the held vertices are forgotten then. Off the lattice the sampler answers directly.
 */
export function createLatticeGround(sample: (x: number, z: number) => number, revision: () => number): LatticeGround {
  const held = new Map<number, number>();
  let seen = Number.NaN;
  function vertex(ix: number, iz: number): number {
    const key = iz * N + ix;
    const known = held.get(key);
    if (known !== undefined) return known;
    const y = sample(-HALF + ix * STEP, -HALF + iz * STEP);
    held.set(key, y);
    return y;
  }
  const ground = ((x: number, z: number): number => {
    const r = revision();
    if (r !== seen) { held.clear(); seen = r; }
    if (!(x > -HALF && x < HALF && z > -HALF && z < HALF)) return sample(x, z);
    const gx = (x + HALF) / STEP, gz = (z + HALF) / STEP;
    const ix = Math.min(CELLS - 1, Math.floor(gx)), iz = Math.min(CELLS - 1, Math.floor(gz));
    const u = gx - ix, v = gz - iz;
    const b = vertex(ix + 1, iz), c = vertex(ix, iz + 1);
    if (u + v <= 1) {
      const a = vertex(ix, iz);
      return a + (b - a) * u + (c - a) * v;
    }
    const d = vertex(ix + 1, iz + 1);
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }) as LatticeGround;
  ground.clear = () => { held.clear(); };
  Object.defineProperty(ground, 'size', { get: () => held.size });
  return ground;
}
