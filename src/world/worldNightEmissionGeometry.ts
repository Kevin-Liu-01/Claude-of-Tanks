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
  return markWorldAperture(geometry, outward);
}

/** Explicit authored pane in an existing vertex-painted or glass family. */
export function markWorldAperture<T extends BufferGeometry>(
  geometry: T, outward: readonly [number, number, number],
): T {
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

/** The existing lighthouse lantern's curved glass sides, not its roof/caps. */
export function markWorldLantern<T extends BufferGeometry>(geometry: T): T {
  const normal = geometry.getAttribute('normal'), vertices: number[] = [];
  if (!normal) throw new TypeError('Lantern requires authored side normals');
  for (let index = 0; index < normal.count; index++) if (Math.abs(normal.getY(index)) < .25) vertices.push(index);
  if (vertices.length < 3) throw new Error('Lantern has no curved glass side');
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
