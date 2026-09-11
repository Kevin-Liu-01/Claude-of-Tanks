import type { Mesh, MeshStandardMaterial, Texture } from 'three';

const RETAINED = new WeakMap<Mesh, Texture[]>();
/** Keep the existing live ownership array, including the original detail atlas. */
export function prepareAutumnHorizonGround(mesh: Mesh, retained: Texture[]): void {
  RETAINED.set(mesh, retained);
}

/** Private construction only: use the actual terrain shading on the two near
 * bands. All geometric triangles/positions and the outer index suffix survive;
 * reverse the old downward-facing skirt winding for the shared front-side mat. */
export function bindAutumnHorizonGround(
  mesh: Mesh,
  material: MeshStandardMaterial,
  textures: Texture[],
): void {
  const retained = RETAINED.get(mesh), geometry = mesh.geometry, index = geometry.index;
  if (!retained || !index || Array.isArray(mesh.material) || geometry.groups.length)
    throw new Error('Expected private unbound Autumn horizon');
  const nearCount = 2 * 287 * 6;
  if (geometry.attributes.position.count !== 2880 || index.count !== 15498)
    throw new Error('Expected original Autumn horizon topology');
  for (let i = 0; i < nearCount; i += 3) {
    const b = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2)); index.setX(i + 2, b);
  }
  index.needsUpdate = true;
  geometry.addGroup(0, nearCount, 1);
  geometry.addGroup(nearCount, index.count - nearCount, 0);
  mesh.material = [mesh.material, material];
  mesh.receiveShadow = true;
  for (const texture of textures) if (!retained.includes(texture)) retained.push(texture);
  RETAINED.delete(mesh);
}
