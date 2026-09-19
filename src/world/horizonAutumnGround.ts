import { Color, type Material, type Mesh, type MeshStandardMaterial, type Texture, type Vector3 } from 'three';

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
  { columns = 287, bands = 2 }: { columns?: number; bands?: number } = {},
): void {
  const retained = RETAINED.get(mesh), geometry = mesh.geometry, index = geometry.index;
  if (!retained || !index || Array.isArray(mesh.material) || geometry.groups.length)
    throw new Error('Expected private unbound horizon ring');
  // Vista pass (2026-09-19): every map binds its rim bands (the buried anchor band and the seated foothill
  // bands) to the terrain material, so the ground texture, sun and shadows continue past the playable edge.
  const rows = geometry.attributes.position.count / (columns + 1);
  const nearCount = bands * columns * 6;
  if (!Number.isInteger(rows) || rows < bands + 1 || index.count !== (rows - 1) * columns * 6)
    throw new Error('Expected the ring topology of ' + columns + ' columns');
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
  refreshHorizonGroundTone(mesh, textures[0]);
}

interface VistaMaterialData { uniforms: Record<string, { value: unknown }>; base: Color }

/** Mean linear colour of a canvas-backed albedo texture (a 2x2 downsample), or null when unavailable. */
function meanAlbedo(texture: Texture | undefined): Color | null {
  const image = texture?.image as { width?: number; height?: number } | undefined;
  if (!image || !image.width || !image.height || typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 2; canvas.height = 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(image as CanvasImageSource, 0, 0, 2, 2);
    const data = ctx.getImageData(0, 0, 2, 2).data;
    const mean = new Color(0, 0, 0), sample = new Color();
    for (let i = 0; i < 4; i++) {
      sample.setRGB(data[i * 4] / 255, data[i * 4 + 1] / 255, data[i * 4 + 2] / 255).convertSRGBToLinear();
      mean.add(sample);
    }
    return mean.multiplyScalar(0.25);
  } catch { return null; }
}

/**
 * Vista pass: the ring's meadow layer takes the battlefield's own ground albedo (the grass layer's mean) as its
 * tint, so the hills continue the field colour instead of the authored hill tone; called at bind and again when
 * the sourced textures replace the procedural ones in place.
 */
export function refreshHorizonGroundTone(mesh: Mesh, groundAlbedo: Texture | undefined): void {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const vista = materials.map((material: Material) => material.userData.horizonVista as VistaMaterialData | undefined).find(Boolean);
  if (!vista) return;
  const mean = meanAlbedo(groundAlbedo);
  if (!mean) return;
  const tint = vista.uniforms.uVMeadowTint?.value as Vector3 | undefined;
  if (!tint) return;
  const ratio = (a: number, b: number): number => Math.min(2.2, Math.max(0.4, a / Math.max(b, 1e-3)));
  // the ring reads under more air than the field: hold the hill a little below the sampled ground
  tint.set(ratio(mean.r * 0.94, vista.base.r), ratio(mean.g * 0.94, vista.base.g), ratio(mean.b * 0.96, vista.base.b));
}
