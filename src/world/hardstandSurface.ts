export interface HardstandConfig {
  x: number;
  z: number;
  width: number;
  length: number;
  yawDeg?: number;
  level?: number;
  /** Rise per metre along the strip's local +Z. Omitted fits the existing road, held to 1 %; 'road' fits it up to
   * AUTHORED_GRADE_LIMIT, so an apron a sloping road crosses keeps the road's grade at every terrain seed; a number
   * tilts the apron with its hillside, up to AUTHORED_GRADE_LIMIT. */
  grade?: number | 'road';
  /** The bank's width outside the strip in metres; omitted is the road blend's own ROAD_BANK_M. A wider bank meets
   * ground standing metres off the apron's plane at a slope a tank can climb (the apron bank law,
   * tools/hardstand-banks.mjs). */
  bankM?: number;
  /** The painted surfacing (stampHardstandRoadMask): its strength over the apron (cover, default 1: the whole apron
   * compacted) and a mottle of worn and drifted patches across it (0..1, default 0). The Redrock lane (2026-10-07): a
   * desert outpost's yard is graded sand the wind keeps drifting back over, not a ruled brown rectangle from the air.
   * Paint only: the apron's level, grade and every road query are the same. */
  paint?: { cover?: number; mottle?: number };
}

/** The road blend's own bank: the ground holds an apron's plane to 3.8 m and is back on its own height by 14 m. */
const ROAD_BANK_M = 14 - 3.8;

/** The steepest authored apron grade (maps lane, 2026-10-02): a graded yard still seats a zone disc (30 m radius,
 * 7 m relief) and a turbo goal (18 m, 5 m) with room to spare, so an apron on a hillside can follow the hill instead of
 * cutting a level pit into it. */
const AUTHORED_GRADE_LIMIT = 0.08;

/** An apron's bank width in metres: its authored bankM, never narrower than the road blend's. */
export function hardstandBankM(strip: Pick<HardstandConfig, 'bankM'>): number {
  return Math.max(ROAD_BANK_M, strip.bankM ?? ROAD_BANK_M);
}

interface HardstandPlane extends HardstandConfig {
  c: number;
  s: number;
  level: number;
  grade: number;
}

function smooth(a: number, b: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function prepare(
  strips: readonly HardstandConfig[],
  roadHeight: (x: number, z: number) => number,
): HardstandPlane[] {
  return strips.map(strip => {
    const angle = (strip.yawDeg ?? 0) * Math.PI / 180;
    const c = Math.cos(angle), s = Math.sin(angle);
    const half = strip.length * 0.5;
    const grade = typeof strip.grade === 'number' ? strip.grade : (roadHeight(strip.x + s * half, strip.z + c * half)
      - roadHeight(strip.x - s * half, strip.z - c * half)) / Math.max(1, strip.length);
    const limit = strip.grade === undefined ? 0.01 : AUTHORED_GRADE_LIMIT;
    return { ...strip, c, s, level: strip.level ?? roadHeight(strip.x, strip.z),
      grade: Math.max(-limit, Math.min(limit, grade)) };
  });
}

function signedDistance(strip: HardstandPlane, x: number, z: number): number {
  const dx = x - strip.x, dz = z - strip.z;
  const across = Math.abs(dx * strip.c - dz * strip.s) - strip.width * 0.5;
  const along = Math.abs(dx * strip.s + dz * strip.c) - strip.length * 0.5;
  return Math.hypot(Math.max(0, across), Math.max(0, along)) + Math.min(0, Math.max(across, along));
}

function bounds(strip: HardstandPlane, step: number, size: number, halfMap: number, margin: number): number[] {
  const ex = Math.abs(strip.c) * strip.width * 0.5 + Math.abs(strip.s) * strip.length * 0.5 + margin;
  const ez = Math.abs(strip.s) * strip.width * 0.5 + Math.abs(strip.c) * strip.length * 0.5 + margin;
  return [
    Math.max(0, Math.floor((strip.x - ex + halfMap) / step)),
    Math.min(size - 1, Math.ceil((strip.x + ex + halfMap) / step)),
    Math.max(0, Math.floor((strip.z - ez + halfMap) / step)),
    Math.min(size - 1, Math.ceil((strip.z + ez + halfMap) / step)),
  ];
}

/** Construction-only overlay: reuse road distance/elevation grids verbatim. */
export function stampHardstandRoadGrids(
  strips: readonly HardstandConfig[],
  distance: Float32Array,
  elevation: Float32Array,
  size: number,
  mapSize: number,
  roadHeight: (x: number, z: number) => number,
): void {
  const step = mapSize / (size - 1), halfMap = mapSize * 0.5;
  // Bilinear height reads use four surrounding grid vertices. Extend the
  // planar shoulder by one cell diagonal so even authored edge/corner
  // samples read only plane vertices, not a partially blended outer node.
  const gridGuard = step * Math.SQRT2;
  // Resolve all planes before modifying the shared elevation grid.
  for (const strip of prepare(strips, roadHeight)) {
    // A wider bank stretches the same blend: the road distance grows ROAD_BANK_M / bank as fast outside the strip,
    // and the plane's elevation feathers out over the bank plus the flat shoulder.
    const bank = hardstandBankM(strip), stretch = ROAD_BANK_M / bank;
    const feather = bank + 3.8;
    const [x0, x1, z0, z1] = bounds(strip, step, size, halfMap, feather + gridGuard);
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
      const x = ix * step - halfMap, z = iz * step - halfMap;
      const sd = signedDistance(strip, x, z) - gridGuard;
      if (sd >= feather) continue;
      const at = iz * size + ix;
      const along = (x - strip.x) * strip.s + (z - strip.z) * strip.c;
      const target = strip.level + along * strip.grade;
      elevation[at] += (target - elevation[at]) * (1 - smooth(0, feather, sd));
      // 3.8 is the canonical fully-flat road shoulder. The entire rectangle
      // inherits that existing path; no hardstand branch enters heightAt.
      distance[at] = Math.min(distance[at], Math.max(0, sd * stretch + 3.8));
    }
  }
}

/** The farthest the painted surfacing spills past an apron's edge, in metres (stampHardstandRoadMask). */
export const HARDSTAND_PAINT_SPILL_M = 4;

function paintHash(ix: number, iz: number): number {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

function paintNoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = paintHash(ix, iz), b = paintHash(ix + 1, iz), c = paintHash(ix, iz + 1), d = paintHash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/** How far the surfacing spills past the edge at (x, z), 0..HARDSTAND_PAINT_SPILL_M: gravel and spoil worked out onto
 * the bank in irregular tongues, so a yard does not read as a ruled rectangle from the air. Outward only: the apron
 * itself is always fully paved. */
function paintSpill(x: number, z: number): number {
  const n = paintNoise(x / 17 + 41.3, z / 17 - 7.9) * 0.62 + paintNoise(x / 6.5 - 3.1, z / 6.5 + 12.7) * 0.38;
  return HARDSTAND_PAINT_SPILL_M * smooth(0.35, 0.85, n);
}

/** Paint full pavement, not wheel ruts/centre grass, in the existing RG mask; the paint's outline wanders out onto
 * the bank in irregular tongues (paintSpill). */
export function stampHardstandRoadMask(
  strips: readonly HardstandConfig[],
  pixels: Uint8ClampedArray,
  size: number,
  mapSize: number,
): void {
  const step = mapSize / size, halfMap = mapSize * 0.5;
  for (const strip of prepare(strips, () => 0)) {
    const [x0, x1, z0, z1] = bounds(strip, step, size, halfMap, 2 + HARDSTAND_PAINT_SPILL_M);
    const cover = strip.paint?.cover ?? 1, mottle = strip.paint?.mottle ?? 0;
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
      const edge = signedDistance(strip, (ix + 0.5) * step - halfMap, (iz + 0.5) * step - halfMap);
      const x = (ix + 0.5) * step - halfMap, z = (iz + 0.5) * step - halfMap;
      let coverage = 1 - smooth(-0.75, 1.25, edge - paintSpill(x, z));
      if (coverage <= 0) continue;
      if (cover < 1 || mottle > 0) {
        // worn and drifted patches: smooth fields at ~9 m and ~3.5 m, the apron's own surfacing between them
        const n = paintNoise(x / 9 + 17.1, z / 9 - 3.3) * 0.65 + paintNoise(x / 3.5 - 5.2, z / 3.5 + 8.4) * 0.35;
        coverage *= cover * (1 - mottle * (1 - smooth(0.3, 0.7, n)));
      }
      const at = (iz * size + ix) * 4;
      pixels[at] = Math.max(pixels[at], coverage * 255);
      pixels[at + 1] *= 1 - coverage;
    }
  }
}

/**
 * Construction/placement exclusion for the painted apron, not the combined
 * road network. The 2 m rounded shoulder covers the mask's 1.25 m feather.
 */
export function createHardstandVegetationExclusion(
  strips: readonly HardstandConfig[] | undefined,
): ((x: number, z: number) => boolean) | null {
  if (!strips?.length) return null;
  const frames = new Float64Array(strips.length * 6);
  for (let i = 0; i < strips.length; i++) {
    const strip = strips[i], angle = (strip.yawDeg ?? 0) * Math.PI / 180;
    frames.set([strip.x, strip.z, Math.cos(angle), Math.sin(angle),
      strip.width * 0.5, strip.length * 0.5], i * 6);
  }
  return (x, z) => {
    for (let at = 0; at < frames.length; at += 6) {
      const dx = x - frames[at], dz = z - frames[at + 1];
      const across = Math.max(0, Math.abs(dx * frames[at + 2] - dz * frames[at + 3]) - frames[at + 4]);
      const along = Math.max(0, Math.abs(dx * frames[at + 3] + dz * frames[at + 2]) - frames[at + 5]);
      if (across * across + along * along <= 4) return true;
    }
    return false;
  };
}

/** Whether (x, z) lies under any apron's painted surfacing, its spill included (receipts that tell paved yards from
 * protected roads). */
export function createHardstandPaintCover(
  strips: readonly HardstandConfig[] | undefined,
): ((x: number, z: number) => boolean) | null {
  if (!strips?.length) return null;
  const planes = prepare(strips, () => 0);
  return (x, z) => planes.some((strip) => signedDistance(strip, x, z) < HARDSTAND_PAINT_SPILL_M + 1.25);
}
