// src/world/maps/clutterKit.ts — the containers, crates, barrels and yard clutter of each place and period (props lane
// A, family #2, 2026-10-14; the owner: "update all our buildings from before which had this flat ugly looking format of
// low detail ... make sure you touch all props and buildings and objects"; WORKLIST.md #2).
//
// props.ts resolves each clutter kind through `clutterTypes(mapId, mobile)` (LOCAL_TYPES, after the period forms): the
// kind's name, record, placement and pool are unchanged; its build is the map's own form. Every form spends exactly the
// draws its legacy builder spent from the shared destructible stream (the legacy builder runs first and is disposed,
// as the fort, gate and well kinds do), so every later pool keeps its geometry.
//
// The distance form (the coordinator's ruling (A), 2026-10-14): a kind's pool geometry carries its near form (tagged
// aClutterLod = 1) and its far form (2); the baked material's vertex hook (clutterLodHook, chained into its existing
// weathering hook: no new program) folds the near form's vertices to the instance's origin beyond CLUTTER_NEAR_M and the
// far form's within it, so one pool and one draw a kind draw ~300 triangles close and ≤ 60 far. Geometry without the tag
// reads 0 (material.defaultAttributeValues) and is never folded. Only kinds that cast no dynamic shadow take a distance
// form (destructibleRenderPolicy: under 1.15 m and 1 m reach, no collider), so the shadow pass never draws them.
import * as THREE from 'three';
import type { DestructiblePropType } from './inhabitKit.ts';

/** The vertex attribute that tags a clutter pool's near (1) and far (2) form; untagged geometry reads 0. */
export const CLUTTER_LOD_ATTRIBUTE = 'aClutterLod';
/** The distance (m, in plan from the camera to the instance's origin) past which a clutter instance draws its far form. */
export const CLUTTER_NEAR_M = 45;
/** The program key suffix of a material that runs the hook (props.ts customProgramCacheKey). */
export const CLUTTER_LOD_KEY = '-clod1';

/** The material hook (chained after the props' weathering hook on the baked material). */
export function clutterLodHook(shader: { vertexShader: string }): void {
  const common = '#include <common>', begin = '#include <begin_vertex>';
  if (!shader.vertexShader.includes(common) || !shader.vertexShader.includes(begin)) {
    throw new Error('clutterKit: the baked vertex shader lost its common or begin_vertex chunk');
  }
  shader.vertexShader = shader.vertexShader
    .replace(common, `${common}\nattribute float ${CLUTTER_LOD_ATTRIBUTE};`)
    .replace(begin, /* glsl */`${begin}
{
  // (clutterKit.ts) a clutter pool's near form folds away past CLUTTER_NEAR_M, its far form within it
  if (${CLUTTER_LOD_ATTRIBUTE} > 0.5) {
    vec4 cotClutterAt = vec4(0.0, 0.0, 0.0, 1.0);
    #ifdef USE_INSTANCING
    cotClutterAt = instanceMatrix * cotClutterAt;
    #endif
    cotClutterAt = modelMatrix * cotClutterAt;
    vec2 cotClutterD = cotClutterAt.xz - cameraPosition.xz;
    bool cotClutterFar = dot(cotClutterD, cotClutterD) > ${(CLUTTER_NEAR_M * CLUTTER_NEAR_M).toFixed(1)};
    if ((${CLUTTER_LOD_ATTRIBUTE} < 1.5) == cotClutterFar) transformed = vec3(0.0);
  }
}`);
}

/** The default the hooked material reads for geometry without the tag (three's WebGLBindingStates). */
export function clutterLodDefaults(material: THREE.Material): void {
  const m = material as THREE.Material & { defaultAttributeValues?: Record<string, number[]> };
  m.defaultAttributeValues = { ...(m.defaultAttributeValues ?? {}), [CLUTTER_LOD_ATTRIBUTE]: [0] };
}

/** One pool geometry from a near and a far form (both non-indexed after merge), each tagged. */
export function withDistanceForms(near: THREE.BufferGeometry, far: THREE.BufferGeometry): THREE.BufferGeometry {
  const parts = [near, far].map((g, i) => {
    const flat = g.index ? g.toNonIndexed() : g;
    const n = flat.getAttribute('position').count;
    flat.setAttribute(CLUTTER_LOD_ATTRIBUTE, new THREE.BufferAttribute(new Float32Array(n).fill(i + 1), 1));
    return flat;
  });
  const names = ['position', 'normal', 'uv', 'color', CLUTTER_LOD_ATTRIBUTE];
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const list = parts.map((g) => g.getAttribute(name) as THREE.BufferAttribute | undefined);
    if (list.some((a) => !a)) continue;
    const size = list[0]!.itemSize, total = list.reduce((s, a) => s + a!.count, 0);
    const array = new Float32Array(total * size);
    let at = 0;
    for (const a of list) { array.set(a!.array as Float32Array, at); at += a!.count * size; }
    out.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  for (const g of [...parts, near, far]) if (g !== out) g.dispose();
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/** The clutter kinds' forms on a map, over the inhabit kit's records (props.ts LOCAL_TYPES). */
export function clutterTypes(_mapId: string, _mobile: boolean): Record<string, DestructiblePropType> {
  return {};
}
