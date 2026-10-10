import { BufferAttribute, Color, type Material, type Mesh, type MeshStandardMaterial, type Texture, type Vector3, type WebGLRenderer } from 'three';
import { refineHorizonGroundSeam } from './horizonSeam.ts';
import type { CanyonGround } from './horizonRedrock.ts';
import { HORIZON_RELIEF_SHADE } from './horizonRelief.ts';

const RETAINED = new WeakMap<Mesh, Texture[]>();
/** Keep the existing live ownership array, including the original detail atlas. */
export function prepareAutumnHorizonGround(mesh: Mesh, retained: Texture[]): void {
  RETAINED.set(mesh, retained);
}

/** Private construction only: share actual terrain shading across the landscape.
 * All geometric triangles/positions survive;
 * reverse the old downward-facing skirt winding for the shared front-side mat. */
export function bindAutumnHorizonGround(
  mesh: Mesh,
  material: MeshStandardMaterial,
  textures: Texture[],
  { columns = 287, bands = 2, continuousGround = false, ground }: {
    columns?: number; bands?: number; continuousGround?: boolean; ground?: CanyonGround;
  } = {},
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
  if (continuousGround && ground?.getOutlandHeightAt) refineHorizonGroundSeam(geometry, columns, ground);
  // Round 40 (2026-09-22, AAA program check 13 "water at the edge: same level and shader beyond"): every ring face
  // inside a sea aperture — near band or far range — renders with the terrain material, which paints it as the
  // square's own open water (terrain.ts outlandSeaWeight), so the sea keeps one shader from the battlefield to the
  // horizon. Shore shelves and the 32 m strand belong to that same material: switching at 50% wetness
  // cut a long triangular strip through the beach. All terrain faces face upward so the shared lit material
  // receives the sun on the same side as the interior ground. UV V < 0 carries marine coverage.
  const uv = geometry.attributes.uv, shore = geometry.attributes.shore, faces = geometry.index!;
  const marineFace = (i: number): boolean => {
    for (let j = 0; j < 3; j++) {
      const vertex = faces.getX(i + j);
      if ((uv && uv.getY(vertex) < -0.001) || (shore && shore.getX(vertex) > 0)) return true;
    }
    return false;
  };
  const terrainFaces: number[] = [], vistaFaces: number[] = [];
  for (let i = 0; i < faces.count; i += 3) {
    const a = faces.getX(i), b = faces.getX(i + 1), c = faces.getX(i + 2);
    if (continuousGround || i < nearCount) terrainFaces.push(a, c, b); // reverse the old downward-facing skirt winding
    else if (marineFace(i)) terrainFaces.push(a, c, b);
    else vistaFaces.push(a, b, c);
  }
  const reordered = new (faces.array.constructor as new (n: number) => typeof faces.array)(faces.count);
  reordered.set(terrainFaces, 0); reordered.set(vistaFaces, terrainFaces.length);
  faces.array.set(reordered); faces.needsUpdate = true;
  const terrainCount = terrainFaces.length;
  geometry.addGroup(0, terrainCount, 1);
  // 2026-10-02 (the frame-budget lane): no face left for the ring's own material (continuous ground) → no group for it.
  // three pushes every group into the render list and links / binds its program even when the group draws nothing.
  if (faces.count > terrainCount) geometry.addGroup(terrainCount, faces.count - terrainCount, 0);
  const vistaMaterial = mesh.material;
  mesh.material = [mesh.material, material];
  mesh.receiveShadow = true;
  for (const texture of textures) if (!retained.includes(texture)) retained.push(texture);
  RETAINED.delete(mesh);
  refreshHorizonGroundTone(mesh, textures[0], textures[4]);
  bindRingReliefAtlas(mesh, vistaMaterial, material);
  if (continuousGround) bindDistantGround(mesh, material);
}

/** The connected distant apron uses the same world-space layers and live
 * lighting. Atmospheric depth and mip footprints provide the gradual loss
 * of detail; a second unlit palette must not expose a ring-shaped boundary. */
function bindDistantGround(ring: Mesh, terrain: MeshStandardMaterial): void {
  const far = ring.getObjectByName('horizon-far-range') as Mesh | undefined;
  if (!far || Array.isArray(far.material)) return;
  const geometry = far.geometry, index = geometry.index;
  if (!index) return;
  for (let i = 0; i < index.count; i += 3) {
    const b = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2)); index.setX(i + 2, b);
  }
  index.needsUpdate = true;
  geometry.setAttribute('normal', geometry.getAttribute('aFarNormal'));
  geometry.setAttribute('shore', new BufferAttribute(new Uint8Array(geometry.attributes.position.count), 1, true));
  geometry.addGroup(0, index.count, 1);
  far.material = [far.material, terrain];
  far.receiveShadow = true;
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
  // The terrain already carries geometric slopes, detail normals and live
  // shadows. Full vista relief double-counted those slopes and turned the
  // exterior into dark, inflated folds. Keep it as subordinate fine relief.
  // The mountains lane (2026-10-02): the program scales the atlas's three terms — the fine gradient, the folds'
  // occlusion and the ridges' cast shadows — by one amplitude, so the 0.18 that kept the gradient subordinate also cut
  // the occlusion to 14 % and the cast shadows to 15 %: past the live cascades (about a kilometre) the ranges had no
  // shadow at all, and a valley read as light as the ridge above it. The amplitude is now the shading's
  // (RING_RELIEF_SHADE) and the gradient scale divides by the same factor, so the gradient's share is unchanged.
  // (the horizons lane, 2026-10-09: an atlas the bake encoded at a wider share binds at that share — horizonRelief.ts
  // HorizonReliefCover.shade; the gradient's share stays the same)
  const ringData = mesh.userData.horizonRing as { relief?: string; reliefShade?: number } | undefined;
  const character = ringData?.relief;
  const shade = ringData?.reliefShade ?? RING_RELIEF_SHADE;
  ring.uRingReliefAmp.value = amp * shade;
  ring.uRingReliefGrad.value = ((vista.uniforms.uVReliefGrad?.value as number | undefined) ?? 1) * RING_RELIEF_GRADIENT / shade;
  // terrain v3 (2026-10-02, the ring lab: zeroing the atlas removed the chevrons on Sirocco Wadi's far ranges and the
  // dimples on Copper Mesa's walls): the atlas's fine relief is a slope's detail; on the tablelands' and the martian
  // scarps' flanks and walls its gradient printed those patterns, so there it fades over the face's own slope from 20°
  // to 41° (the caps and floors keep it, and the occlusion and the cast shadows keep their weight everywhere). The
  // snow, alpine, rolling and coastal ranges keep it in full: their ridges are its relief.
  const wallBand = character ? RING_RELIEF_WALL_BAND[character] : undefined;
  const wall = ring.uRingReliefWall?.value as { set(x: number, y: number): void } | undefined;
  if (wall) wall.set(...(wallBand ?? RING_RELIEF_WALL_NONE));
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

/** The ring atlas's gradient share (terrain v2's subordinate fine relief) and its shading share (the mountains lane:
 * the folds' occlusion and the ridges' cast shadows at 0.7 x their baked strength). */
export const RING_RELIEF_GRADIENT = 0.18;
export const RING_RELIEF_SHADE = HORIZON_RELIEF_SHADE; // the bake encodes the landcover against it (horizonRelief.ts)

/** Terrain v3: the slope band (1 - n.y of the ring face) over which the atlas gradient fades, per relief character. */
export const RING_RELIEF_WALL_BAND: Readonly<Record<string, readonly [number, number]>> = { mesa: [0.06, 0.25], martian: [0.06, 0.25] };
const RING_RELIEF_WALL_NONE: readonly [number, number] = [2, 3];

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
  // the mountains lane (2026-10-03): the far panorama, before its bake, takes the battlefield's own ground and rock
  // means (as the vista once did: the ground a little below the sampled field, read under more air), so the far country
  // continues the ring's terrain material instead of the authored hill palette
  const panorama = (mesh.userData as { horizonPanorama?: { baked: boolean; setGroundTone?(g: Color | null, r: Color | null): boolean } }).horizonPanorama;
  if (panorama?.setGroundTone && !panorama.baked) {
    const ground = meanAlbedo(groundAlbedo), rock = meanAlbedo(rockAlbedo);
    panorama.setGroundTone(ground ? ground.multiplyScalar(0.94) : null, rock ? rock.multiplyScalar(0.96) : null);
  }
  // a terrain-bound ring carries no tint for the means to land on: skip the albedo readbacks
  if (!vista || (!vista.uniforms.uVMeadowTint && !vista.uniforms.uVRockTint)) return;
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
