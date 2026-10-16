import { BufferGeometry, Float32BufferAttribute } from 'three';

const SEGMENTS = 24;
const RINGS = 4;

/**
 * Shallow wind-shaped snow, with a buried rim instead of a sphere silhouette. (props lane A, #19, 2026-10-14: wind
 * builds a drift long and low on its windward side and carries its ridge downwind to a steeper lee face: the drift's
 * local +along is downwind, mapKits.ts WINTER_WIND_YAW's (cos, -sin).) (#19 follow-up, 2026-10-15: the lee crest is a
 * cornice — the ridge held level out over the lee and broken off in a short steep face to the buried rim — on the same
 * 97 vertices and 25 height queries.)
 */
export function createSnowDrift(
  field: { getHeightAt(x: number, z: number): number },
  x: number, z: number, along: number, across: number, height: number, yaw: number,
): BufferGeometry {
  const position = new Float32Array((1 + SEGMENTS * RINGS) * 3);
  const uv = new Float32Array((1 + SEGMENTS * RINGS) * 2);
  const indices: number[] = [];
  const centerY = field.getHeightAt(x, z);
  const ca = Math.cos(yaw), sa = Math.sin(yaw);
  const phase = x * 0.13 + z * 0.19;
  position.set([x, centerY + height, z]);
  uv.set([x * 0.3, z * 0.3]);
  for (let segment = 0; segment < SEGMENTS; segment++) {
    const angle = segment / SEGMENTS * Math.PI * 2;
    const outline = 0.82 + Math.sin(angle * 3 + phase) * 0.12
      + Math.cos(angle * 5 - phase) * 0.06;
    const lx = Math.cos(angle) * along * outline;
    const lz = Math.sin(angle) * across * outline;
    const dx = ca * lx + sa * lz, dz = -sa * lx + ca * lz;
    const rimY = field.getHeightAt(x + dx, z + dz);
    // the windward (along < 0) slope long and low, the lee (along > 0) held up to a steeper face near the rim, and where
    // the wind runs straight over it the crest's cornice: its rings carried out toward the rim, level to its broken edge
    const lee = Math.min(1, Math.max(0, (Math.cos(angle) + 0.3) / 0.9)), w = lee * lee * (3 - 2 * lee), c = w * w;
    for (let ring = 1; ring <= RINGS; ring++) {
      const t = ring / RINGS, held = ring < RINGS ? 1 : 0, tr = t + 0.1 * c * Math.sin(Math.PI * t) * held;
      const id = 1 + (ring - 1) * SEGMENTS + segment;
      const lee1 = (1 - t ** 3.2) * (1 - c) + Math.min(1, 1 - t ** 6 + 0.15 * held * Math.exp(-(((t - 0.75) / 0.1) ** 2))) * c;
      const profile = (1 - t) ** 2.2 * (1 - w) + lee1 * w;
      const py = centerY + (rimY - centerY) * tr + height * profile - 0.025 * t;
      position.set([x + dx * tr, py, z + dz * tr], id * 3);
      uv.set([(x + dx * tr) * 0.3, (z + dz * tr) * 0.3], id * 2);
      const next = (segment + 1) % SEGMENTS;
      if (ring === 1) indices.push(0, 1 + next, id);
      else {
        const inner = id - SEGMENTS;
        const innerNext = 1 + (ring - 2) * SEGMENTS + next;
        const outerNext = 1 + (ring - 1) * SEGMENTS + next;
        indices.push(inner, outerNext, id, inner, innerNext, outerNext);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
