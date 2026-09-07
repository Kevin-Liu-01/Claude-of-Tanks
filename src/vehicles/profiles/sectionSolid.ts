// First-party geometric primitive, not a vehicle/family template. Callers own
// every authored cross-section and all vehicle-specific measurements.
import * as THREE from 'three';

export type SectionPoint = readonly [number, number];
export interface SolidSection {
  readonly z: number;
  /** Counter-clockwise XY contour viewed from +Z; correspondence is explicit. */
  readonly ring: readonly SectionPoint[];
}

function validateContour(ring: readonly SectionPoint[], count: number): void {
  if (ring.length !== count) throw new Error('sectionSolid contour correspondence differs');
  let area2 = 0;
  for (let i = 0; i < count; i++) {
    const a = ring[i], b = ring[(i + 1) % count];
    if (!a.every(Number.isFinite)) throw new Error('sectionSolid contour must be finite');
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7) {
      throw new Error('sectionSolid contour has a collapsed edge');
    }
    area2 += a[0] * b[1] - b[0] * a[1];
  }
  if (area2 <= 1e-8) throw new Error('sectionSolid contour must be counter-clockwise');
}

function validateSections(sections: readonly SolidSection[], count: number): void {
  for (let s = 0; s < sections.length; s++) {
    const { z, ring } = sections[s];
    if (!Number.isFinite(z) || (s > 0 && z <= sections[s - 1].z)) {
      throw new Error('sectionSolid stations must be finite and strictly increasing');
    }
    validateContour(ring, count);
  }
}

/** Closed longitudinal loft with triangulated (including concave) end caps.
 * No source vertices, indices, or sampled source contours belong in callers.
 * This builds only at vehicle creation, never in the render/simulation loop. */
export function sectionSolid(sections: readonly SolidSection[]): THREE.BufferGeometry {
  if (sections.length < 2) throw new Error('sectionSolid needs at least two sections');
  const n = sections[0].ring.length;
  if (n < 3) throw new Error('sectionSolid needs at least three contour points');
  validateSections(sections, n);
  const positions: number[] = [];
  const point = (s: number, i: number): readonly [number, number, number] =>
    [sections[s].ring[i][0], sections[s].ring[i][1], sections[s].z];
  const tri = (a: readonly number[], b: readonly number[], c: readonly number[]) => {
    positions.push(...a, ...b, ...c);
  };
  for (let s = 0; s < sections.length - 1; s++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      tri(point(s, i), point(s, j), point(s + 1, j));
      tri(point(s, i), point(s + 1, j), point(s + 1, i));
    }
  }
  for (const s of [0, sections.length - 1]) {
    const contour = sections[s].ring.map(([x, y]) => new THREE.Vector2(x, y));
    const caps = THREE.ShapeUtils.triangulateShape(contour, []);
    if (caps.length !== n - 2) throw new Error('sectionSolid end cap is not triangulatable');
    for (const [a, b, c] of caps) {
      if (s === 0) tri(point(s, c), point(s, b), point(s, a));
      else tri(point(s, a), point(s, b), point(s, c));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uv: number[] = [];
  for (let i = 0; i < positions.length; i += 3) uv.push(positions[i], positions[i + 2]);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}
