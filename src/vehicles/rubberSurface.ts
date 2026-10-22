// Rubber surface detail (owner 2026-10-21: "rubber all over the place, including for flaps, mudguards, and tyres, need
// proper textures"). The fleet rubber kept one flat tone (runningGearFinish.ts tireRubber 0x292a28) with no maps, so a
// mud flap, a bow mat or a skirt read as an untextured dark slab and tyres as flat rings. These three tileable maps ride
// that audited tone instead of replacing it: a detail multiplier (grime blotches, dust specks and grain; mean about
// 0.93, so the tone stays the palette's), a roughness map (matte compound, glazed where the surface wears) and a
// pebble-grain normal map. Pure pixel generator: no DOM, no three.js (materials.ts uploads the canvases).
// First-party: Kevin B. Liu (NOTICE.md).

/** Map repeats per metre on rubber surfaces: one 256 px tile covers 0.4 m, so the grain is about 1.6 mm a pixel. */
export const RUBBER_UV_REPEATS_PER_M = 2.5;
const RUBBER_SURFACE_SIZE = 256;

export interface RubberSurfacePixels {
  readonly width: number;
  readonly height: number;
  /** RGBA bytes, a linear multiplier on the material colour. */
  readonly albedo: Uint8ClampedArray;
  /** RGBA bytes, linear roughness (three.js reads the green channel). */
  readonly roughness: Uint8ClampedArray;
  /** RGBA bytes, a tangent-space normal map. */
  readonly normal: Uint8ClampedArray;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A periodic value-noise lattice: n x n random cells; sampling u, v in [0, 1) tiles seamlessly. */
interface Lattice { readonly n: number; readonly cells: Float32Array }
function lattice(n: number, rng: () => number): Lattice {
  const cells = new Float32Array(n * n);
  for (let i = 0; i < cells.length; i++) cells[i] = rng();
  return { n, cells };
}
function sample(l: Lattice, u: number, v: number): number {
  const n = l.n, x = u * n, y = v * n;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  let fx = x - x0, fy = y - y0;
  fx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  fy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const i0 = x0 % n, j0 = y0 % n, i1 = (i0 + 1) % n, j1 = (j0 + 1) % n;
  const a = l.cells[j0 * n + i0], b = l.cells[j0 * n + i1], c = l.cells[j1 * n + i0], d = l.cells[j1 * n + i1];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** The fleet rubber's detail maps, deterministic for a seed. */
export function paintRubberSurface(size = RUBBER_SURFACE_SIZE, seed = 0x7ab0e5): RubberSurfacePixels {
  const rng = mulberry32(seed);
  // low frequencies: grime and wear patches; high frequencies: dust specks and the pebble grain
  const grime4 = lattice(4, rng), grime8 = lattice(8, rng), grime16 = lattice(16, rng);
  const wear8 = lattice(8, rng), wear16 = lattice(16, rng);
  const speck32 = lattice(32, rng), speck64 = lattice(64, rng);
  const grain64 = lattice(64, rng), grain128 = lattice(128, rng), swell16 = lattice(16, rng);
  const count = size * size;
  const height = new Float32Array(count);
  const albedo = new Uint8ClampedArray(count * 4), roughness = new Uint8ClampedArray(count * 4);
  const normal = new Uint8ClampedArray(count * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size, i = y * size + x;
      const jitter = rng() * 2 - 1;
      const grime = smoothstep(0.5, 0.78, 0.5 * sample(grime4, u, v) + 0.3 * sample(grime8, u, v) + 0.2 * sample(grime16, u, v));
      const wear = smoothstep(0.58, 0.82, 0.6 * sample(wear8, u, v) + 0.4 * sample(wear16, u, v));
      const dust = smoothstep(0.7, 0.9, 0.55 * sample(speck64, u, v) + 0.45 * sample(speck32, u, v));
      // dried mud and oil darken in soft clouds; dust specks and grain stay within a few percent of the tone
      const tone = clamp01(0.955 - 0.17 * grime + 0.045 * dust + 0.022 * jitter);
      albedo[i * 4] = Math.round(255 * tone);
      albedo[i * 4 + 1] = Math.round(255 * tone * (1 - 0.012 * grime));
      albedo[i * 4 + 2] = Math.round(255 * tone * (1 - 0.035 * grime));
      albedo[i * 4 + 3] = 255;
      // the compound is matte; where it wears it glazes, and caked grime is dead flat
      const rough = Math.min(1, Math.max(0.62, 0.92 - 0.22 * wear + 0.08 * grime + 0.03 * jitter));
      roughness[i * 4] = roughness[i * 4 + 1] = roughness[i * 4 + 2] = Math.round(255 * rough);
      roughness[i * 4 + 3] = 255;
      height[i] = 0.62 * sample(grain128, u, v) + 0.38 * sample(grain64, u, v) + 0.35 * sample(swell16, u, v);
    }
  }
  const strength = 2.4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = y * size, xl = (x + size - 1) % size, xr = (x + 1) % size;
      const up = ((y + size - 1) % size) * size, down = ((y + 1) % size) * size;
      const nx = -(height[row + xr] - height[row + xl]) * strength, ny = (height[down + x] - height[up + x]) * strength;
      const len = Math.hypot(nx, ny, 1), i = (y * size + x) * 4;
      normal[i] = Math.round(255 * (nx / len * 0.5 + 0.5));
      normal[i + 1] = Math.round(255 * (ny / len * 0.5 + 0.5));
      normal[i + 2] = Math.round(255 * (1 / len * 0.5 + 0.5));
      normal[i + 3] = 255;
    }
  }
  return { width: size, height: size, albedo, roughness, normal };
}
