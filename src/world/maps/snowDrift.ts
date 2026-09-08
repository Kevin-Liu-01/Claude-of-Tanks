import { BufferGeometry, Float32BufferAttribute } from 'three';

const SEGMENTS = 24;
const RINGS = 4;

/** Shallow wind-shaped snow, with a buried rim instead of a sphere silhouette. */
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
    for (let ring = 1; ring <= RINGS; ring++) {
      const t = ring / RINGS;
      const id = 1 + (ring - 1) * SEGMENTS + segment;
      const py = centerY + (rimY - centerY) * t + height * (1 - t) ** 2 - 0.025 * t;
      position.set([x + dx * t, py, z + dz * t], id * 3);
      uv.set([(x + dx * t) * 0.3, (z + dz * t) * 0.3], id * 2);
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
