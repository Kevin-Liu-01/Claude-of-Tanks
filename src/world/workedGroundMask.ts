/** Construction-only harvested ground in the existing terrain wear channel. */
export interface WorkedGroundPatch {
  boundary: readonly (readonly [number, number])[];
  feather: number;
  strength: number;
}

interface NoiseField { noise(x: number, z: number): number }

function smooth(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function validatePatch(patch: WorkedGroundPatch): void {
  if (patch.boundary.length < 3 || patch.boundary.length > 24
    || !Number.isFinite(patch.feather) || patch.feather < 4 || patch.feather > 24
    || !Number.isFinite(patch.strength) || patch.strength <= 0 || patch.strength > 1) {
    throw new Error('Worked ground requires 3–24 vertices, 4–24m feather and normalized strength');
  }
  for (let i = 0; i < patch.boundary.length; i++) {
    const a = patch.boundary[i], b = patch.boundary[(i + 1) % patch.boundary.length];
    if (!a.every(Number.isFinite) || (a[0] === b[0] && a[1] === b[1])) {
      throw new Error('Worked ground boundary requires finite, distinct adjacent vertices');
    }
  }
}

/** Negative inside, positive outside; straight-segment distance in metres. */
function boundaryDistance(patch: WorkedGroundPatch, x: number, z: number): number {
  let inside = false, distanceSquared = Infinity;
  for (let i = 0; i < patch.boundary.length; i++) {
    const a = patch.boundary[i], b = patch.boundary[(i + 1) % patch.boundary.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    const ex = x - a[0] - t * dx, ez = z - a[1] - t * dz;
    distanceSquared = Math.min(distanceSquared, ex * ex + ez * ez);
    if ((a[1] > z) !== (b[1] > z) && x < a[0] + (z - a[1]) * dx / dz) inside = !inside;
  }
  return Math.sqrt(distanceSquared) * (inside ? -1 : 1);
}

function stampPatch(
  pixels: Uint8ClampedArray, size: number, mapSize: number, patch: WorkedGroundPatch, noise: NoiseField,
): void {
  const half = mapSize / 2, texel = mapSize / size;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of patch.boundary) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  const reach = patch.feather + 3;
  const x0 = Math.max(0, Math.floor((minX - reach + half) / texel));
  const x1 = Math.min(size - 1, Math.ceil((maxX + reach + half) / texel));
  const z0 = Math.max(0, Math.floor((minZ - reach + half) / texel));
  const z1 = Math.min(size - 1, Math.ceil((maxZ + reach + half) / texel));
  for (let row = z0; row <= z1; row++) for (let col = x0; col <= x1; col++) {
    const at = (row * size + col) * 4;
    // Preserve roads/ruts, wet terrain and their original wear exactly.
    if (pixels[at] || pixels[at + 2]) continue;
    const x = (col + 0.5) * texel - half, z = (row + 0.5) * texel - half;
    const distance = boundaryDistance(patch, x, z);
    if (distance >= reach) continue;
    const brokenEdge = distance + noise.noise(x * 0.047 + 12, z * 0.047 - 6) * 3;
    const edge = 1 - smooth((brokenEdge + patch.feather * 0.25) / patch.feather);
    // Broad regrowth islands break up the worked soil without repeated discs
    // or a uniformly brown strip. The terrain shader keeps its own fine grain.
    const regrowth = smooth((noise.noise(x * 0.028 - 41, z * 0.028 + 19) + 0.12) / 0.78);
    const wear = edge * patch.strength * (1 - regrowth * 0.38);
    pixels[at + 3] = Math.max(pixels[at + 3], wear * 255);
  }
}

/** No new mask, retained scratch, shader branch, RNG draws or terrain queries. */
export function stampWorkedGroundMask(
  pixels: Uint8ClampedArray, size: number, mapSize: number,
  patches: readonly WorkedGroundPatch[], noise: NoiseField,
): void {
  if (!Number.isInteger(size) || size <= 0 || pixels.length !== size * size * 4
    || !Number.isFinite(mapSize) || mapSize <= 0 || patches.length > 4) {
    throw new Error('Worked ground requires a valid RGBA raster and at most four patches');
  }
  for (const patch of patches) validatePatch(patch);
  for (const patch of patches) stampPatch(pixels, size, mapSize, patch, noise);
}
