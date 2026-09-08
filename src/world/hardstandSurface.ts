export interface HardstandConfig {
  x: number;
  z: number;
  width: number;
  length: number;
  yawDeg?: number;
  level?: number;
  /** Rise per metre along the strip's local +Z; omitted fits the existing road. */
  grade?: number;
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
    const grade = strip.grade ?? (roadHeight(strip.x + s * half, strip.z + c * half)
      - roadHeight(strip.x - s * half, strip.z - c * half)) / Math.max(1, strip.length);
    return { ...strip, c, s, level: strip.level ?? roadHeight(strip.x, strip.z),
      grade: Math.max(-0.01, Math.min(0.01, grade)) };
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
    const [x0, x1, z0, z1] = bounds(strip, step, size, halfMap, 14 + gridGuard);
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
      const x = ix * step - halfMap, z = iz * step - halfMap;
      const sd = signedDistance(strip, x, z) - gridGuard;
      if (sd >= 14) continue;
      const at = iz * size + ix;
      const along = (x - strip.x) * strip.s + (z - strip.z) * strip.c;
      const target = strip.level + along * strip.grade;
      elevation[at] += (target - elevation[at]) * (1 - smooth(0, 14, sd));
      // 3.8 is the canonical fully-flat road shoulder. The entire rectangle
      // inherits that existing path; no hardstand branch enters heightAt.
      distance[at] = Math.min(distance[at], Math.max(0, sd + 3.8));
    }
  }
}

/** Paint full pavement, not wheel ruts/centre grass, in the existing RG mask. */
export function stampHardstandRoadMask(
  strips: readonly HardstandConfig[],
  pixels: Uint8ClampedArray,
  size: number,
  mapSize: number,
): void {
  const step = mapSize / size, halfMap = mapSize * 0.5;
  for (const strip of prepare(strips, () => 0)) {
    const [x0, x1, z0, z1] = bounds(strip, step, size, halfMap, 2);
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
      const coverage = 1 - smooth(-0.75, 1.25,
        signedDistance(strip, (ix + 0.5) * step - halfMap, (iz + 0.5) * step - halfMap));
      if (coverage <= 0) continue;
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
