/**
 * The borders lane (2026-10-08, gauntlet wave 270 on Redrock: "the far ring wall seals the valley like a rampart with a
 * flat beige plain behind it"; "the horizon should be a chain of massive jebels with domed tops and siq gaps"): the
 * enclosing walls' crest past the near band as a chain of massifs. The basin stays enclosed — the owner's round-39
 * direction, pinned by redrockCanyonHorizon.selftest — so no gap opens through the walls; the crest instead rises into
 * domed heads (several to a massif, Jebel Rum's beehives) and falls into saddles between them (narrow siq notches, at most
 * a fifth of the wall's height above the floor), so the skyline is a chain of jebels, not one level rampart.
 *
 * Construction only, on the ring's own vertices after the canyon outland is laid (maps/horizon.ts): the rows and the
 * columns stay where they are; nothing below the plateau's shoulder moves (the floor, the walls' faces and their toes are
 * the canyon's), and nothing within 140 m of the square's edge (its walls as the battlefield sees them close up).
 */
interface SkylineRing { rows: readonly unknown[]; positions: Float32Array; heights: Float32Array; maxHeight: number }

export interface JebelSkylineSettings {
  /** The canyon floor's level (m): heights are measured above it. */
  floorM: number;
  /** The plateau's shoulder (m above the floor): the crest above it takes the heads and saddles. */
  shoulderM: number;
  /** The heads' cells (m): one head in most cells, its centre jittered across the cell. */
  cellM: number;
  /** A head's rise over the plateau (m), as a range. */
  headM: readonly [number, number];
  /** The deepest saddle, as a share of the wall's height above the floor. */
  saddle: number;
}

export const JEBEL_SKYLINE_DEFAULTS: JebelSkylineSettings = Object.freeze({
  floorM: 4, shoulderM: 36, cellM: 230, headM: [14, 48] as const, saddle: 0.2,
});

function hash(x: number, y: number, s: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
}
function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * The heads' rise and the saddles' share at a point: the tallest head of the 3 x 3 cells round it (a dome, flattened
 * toward a beehive's shoulder, each head its own height and breadth), and the saddles along the cells' borders where no
 * head stands (the distance to the nearest two heads' bisector).
 */
export function jebelSkylineAt(x: number, z: number, seed: number, s: JebelSkylineSettings = JEBEL_SKYLINE_DEFAULTS): { head: number; saddle: number } {
  const cx0 = Math.floor(x / s.cellM), cz0 = Math.floor(z / s.cellM);
  let head = 0, d1 = Infinity, d2 = Infinity;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = cx0 + i, cz = cz0 + j;
    const hx = (cx + 0.15 + 0.7 * hash(cx, cz, seed + 1)) * s.cellM, hz = (cz + 0.15 + 0.7 * hash(cx, cz, seed + 2)) * s.cellM;
    const d = Math.hypot(x - hx, z - hz);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    if (hash(cx, cz, seed + 3) < 0.18) continue; // (a cell without a head: a broad saddle)
    const radius = s.cellM * (0.42 + 0.3 * hash(cx, cz, seed + 4));
    const q = d / radius;
    if (q >= 1) continue;
    const rise = s.headM[0] + (s.headM[1] - s.headM[0]) * hash(cx, cz, seed + 5);
    // a beehive's profile: a rounded top over steepening flanks (the cap of a superellipse)
    head = Math.max(head, rise * Math.pow(1 - Math.pow(q, 2.6), 0.75));
  }
  // the saddles: where the nearest two heads' cells meet (the bisector), narrowing to a notch
  const border = (d2 - d1) / s.cellM;
  const saddle = s.saddle * (1 - smooth(0.0, 0.16, border));
  return { head, saddle };
}

/** Lay the heads and saddles on the ring's crest past the near band (see the module's note). */
export function shapeJebelSkyline(ring: SkylineRing, seed: number, s: JebelSkylineSettings = JEBEL_SKYLINE_DEFAULTS): void {
  const n = ring.heights.length;
  ring.maxHeight = 1;
  for (let i = 0; i < n; i++) {
    const x = ring.positions[i * 3], z = ring.positions[i * 3 + 2];
    const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - 512;
    const h = ring.heights[i];
    const above = h - s.floorM;
    // past the near band, on the plateau's crest only (the shoulder fades the law in over 20 m)
    const w = smooth(140, 300, edgeOut) * smooth(s.shoulderM, s.shoulderM + 20, above);
    if (w > 0) {
      const { head, saddle } = jebelSkylineAt(x, z, seed, s);
      const next = h + w * (head - saddle * above);
      ring.heights[i] = next;
      ring.positions[i * 3 + 1] = next;
    }
    ring.maxHeight = Math.max(ring.maxHeight, ring.heights[i]);
  }
}
