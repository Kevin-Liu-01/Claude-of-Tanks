import { Color, type Material, type Mesh, type MeshStandardMaterial, type Texture, type Vector3, type WebGLRenderer } from 'three';

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
  // Round 40 (2026-09-22, AAA program check 13 "water at the edge: same level and shader beyond"): every ring face
  // inside a sea aperture — near band or far range — renders with the terrain material, which paints it as the
  // square's own open water (terrain.ts outlandSeaWeight), so the sea keeps one shader from the battlefield to the
  // horizon. Near-band land faces keep their winding reversal; marine faces keep the winding they were built with
  // (both materials are double-sided). The marine mask is the ring's UV V channel (V < 0).
  const uv = geometry.attributes.uv, faces = index;
  const marineFace = (i: number): boolean => !!uv
    && Math.min(uv.getY(faces.getX(i)), uv.getY(faces.getX(i + 1)), uv.getY(faces.getX(i + 2))) < -0.5;
  const terrainFaces: number[] = [], vistaFaces: number[] = [];
  for (let i = 0; i < faces.count; i += 3) {
    const a = faces.getX(i), b = faces.getX(i + 1), c = faces.getX(i + 2);
    if (i < nearCount) terrainFaces.push(a, c, b); // reverse the old downward-facing skirt winding
    else if (marineFace(i)) terrainFaces.push(a, b, c);
    else vistaFaces.push(a, b, c);
  }
  const reordered = new (faces.array.constructor as new (n: number) => typeof faces.array)(faces.count);
  reordered.set(terrainFaces, 0); reordered.set(vistaFaces, terrainFaces.length);
  faces.array.set(reordered); faces.needsUpdate = true;
  const terrainCount = terrainFaces.length;
  geometry.addGroup(0, terrainCount, 1);
  geometry.addGroup(terrainCount, faces.count - terrainCount, 0);
  const vistaMaterial = mesh.material;
  mesh.material = [mesh.material, material];
  mesh.receiveShadow = true;
  for (const texture of textures) if (!retained.includes(texture)) retained.push(texture);
  RETAINED.delete(mesh);
  refreshHorizonGroundTone(mesh, textures[0], textures[4]);
  bindRingReliefAtlas(mesh, vistaMaterial, material);
}

/**
 * Round 72b: the terrain material's ring bands read the ring's own surface atlas (horizonRelief.ts, bound on the vista
 * material as uVRelief) — the same texture object, radius window and gradient scale, so the first ridge and the ranges
 * behind it carry one relief; the uniform objects were created with the material, so a bind after its compile reaches
 * the program. A ring without a bake (the mobile tier) leaves the amplitude at 0.
 *
 * The terrain program has no sampler unit to spare (it sits at MAX_TEXTURE_IMAGE_UNITS = 16), so the atlas takes the
 * M (marsh/ice) normal's unit for the bands' draw only: the ring's onBeforeRender points that uniform at the atlas and
 * raises uRingDraw, onAfterRender puts the marsh normal back. three re-uploads a material's uniforms only when the
 * program or material changes between draws — the bands draw right after the square's chunks with the same material —
 * so both hooks drop the bound program (renderer.state.useProgram(null)) to force the upload for the bands' draw and
 * for whatever the same material draws next. Two forced refreshes per pass; no allocation.
 */
function bindRingReliefAtlas(mesh: Mesh, vistaMaterial: Material, terrainMaterial: Material): void {
  const vista = vistaMaterial.userData.horizonVista as VistaMaterialData | undefined;
  const ring = terrainMaterial.userData.ringReliefUniforms as Record<string, { value: unknown }> | undefined;
  if (!vista || !ring) return;
  const amp = vista.uniforms.uVReliefAmp?.value as number | undefined;
  const texture = vista.uniforms.uVRelief?.value as Texture | undefined;
  if (!amp || !texture) return;
  const window = vista.uniforms.uVReliefR?.value as { x: number; y: number } | undefined;
  if (window) (ring.uRingReliefR.value as { set(x: number, y: number): void }).set(window.x, window.y);
  ring.uRingReliefGrad.value = vista.uniforms.uVReliefGrad?.value ?? 1;
  ring.uRingReliefAmp.value = amp;
  const swap = ring.uNrmM, draw = ring.uRingDraw, marshNormal = swap.value;
  const before = mesh.onBeforeRender;
  mesh.onBeforeRender = function (this: Mesh, renderer, scene, camera, geometry, material, group) {
    before.call(this, renderer, scene, camera, geometry, material, group);
    if (material !== terrainMaterial) return;
    swap.value = texture; draw.value = 1;
    (renderer as WebGLRenderer).state.useProgram(null as unknown as WebGLProgram);
  };
  mesh.onAfterRender = (renderer, _scene, _camera, _geometry, material) => {
    if (material !== terrainMaterial) return;
    swap.value = marshNormal; draw.value = 0;
    (renderer as WebGLRenderer).state.useProgram(null as unknown as WebGLProgram);
  };
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
export function refreshHorizonGroundTone(mesh: Mesh, groundAlbedo: Texture | undefined, rockAlbedo?: Texture): void {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const vista = materials.map((material: Material) => material.userData.horizonVista as VistaMaterialData | undefined).find(Boolean);
  if (!vista) return;
  const mean = meanAlbedo(groundAlbedo);
  if (mean) {
    const tint = vista.uniforms.uVMeadowTint?.value as Vector3 | undefined;
    // Round 29: the vista's ground colour is the battlefield's own albedo mean (an absolute linear colour — the
    // fragment no longer multiplies the base-hued bake back in), held a little below the sampled ground because
    // the ring reads under more air than the field.
    if (tint) tint.set(mean.r * 0.94, mean.g * 0.94, mean.b * 0.96);
  }
  // Round 35 (owner 2026-09-21, "it looked like a completely new geography"): the ring's rock and scree take the
  // battlefield's own ROCK layer mean the same way, so a cliff that leaves the playable square keeps its colour
  // instead of switching to the authored hill rock; the scree stays the lighter, dustier relative of that rock.
  const rockMean = meanAlbedo(rockAlbedo);
  if (rockMean) {
    const rock = vista.uniforms.uVRockTint?.value as Vector3 | undefined;
    const scree = vista.uniforms.uVScreeTint?.value as Vector3 | undefined;
    if (rock) rock.set(rockMean.r * 0.96, rockMean.g * 0.96, rockMean.b * 0.97);
    if (scree) scree.set(rockMean.r * 1.13, rockMean.g * 1.12, rockMean.b * 1.10);
  }
}
