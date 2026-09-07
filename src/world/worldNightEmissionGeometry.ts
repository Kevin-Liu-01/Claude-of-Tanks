// Author emission on real apertures before material buckets lose part identity.
// A curtain bucket also contains fabric and mast bulbs; its name is not a light.
import type { BufferGeometry } from 'three';
import { NIGHT_EMISSION_ATTRIBUTE, setNightEmissionMask } from '../engine/nightEmissionMaterial.ts';

/** The supplied outward normal is in the geometry's current authoring frame.
 * Subsequent rotate/applyMatrix4 calls transform its ordinary vertex normals,
 * preserving the exact visible aperture direction for inspection tools.
 */
export function markWorldWindowPane<T extends BufferGeometry>(
  geometry: T, bucket: string, outward: readonly [number, number, number],
): T {
  if (bucket !== 'curtain') return geometry;
  const length = Math.hypot(...outward), normals = geometry.getAttribute('normal');
  if (!normals || Math.abs(length - 1) > 1e-5) throw new TypeError('Window aperture requires an authored unit normal');
  const vertices: number[] = [];
  for (let i = 0; i < normals.count; i++) {
    const dot = normals.getX(i) * outward[0] + normals.getY(i) * outward[1] + normals.getZ(i) * outward[2];
    if (dot > .999) vertices.push(i);
  }
  if (vertices.length < 3) throw new Error('Window aperture has no outward face');
  setNightEmissionMask(geometry, 1, vertices);
  return geometry;
}

export function markWorldBeacon<T extends BufferGeometry>(geometry: T): T {
  setNightEmissionMask(geometry, 2);
  return geometry;
}

/** The one-byte neutral attribute is required for consistent bucket merging.
 * Never infer emission from material, vertex color or the shape of a prop.
 */
export function ensureWorldNightEmissionMask<T extends BufferGeometry>(geometry: T): T {
  if (!geometry.hasAttribute(NIGHT_EMISSION_ATTRIBUTE)) setNightEmissionMask(geometry, 0);
  return geometry;
}
