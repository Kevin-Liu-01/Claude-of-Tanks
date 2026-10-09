// src/world/maps/vehicleSurface.ts — the map vehicles' surface law (the map-vehicles lane, 2026-10-05).
//
// One material draws every civilian vehicle of a map (props.ts `mats.vehicle`: the 64 px paint-detail tile under the
// vertex colours). The rebuilt kit (vehicleMesh.ts) gives each vertex a `surf` byte triple — roughness, metalness and
// the paint mask — and this hook reads it: the glass is dark and glossy and takes the sky, the chrome is metal, the
// tyres and the canvas are matte, the body paint satin; the tile still breaks every surface up (its roughness texel
// scales the vertex's roughness by about ±8 %). The paint mask carries each instance's own colour (the pool's
// instanceColor, props.ts tintDestructibleInstances) onto the body paint only, so a row of identical cars wears
// different liveries and their glass, chrome and tyres stay what they are. A geometry without the stream (none
// draws through this material today) would read roughness 0 there, so every builder bakes it.

import { ShaderChunk } from 'three';

/** The program text the hook appends: shader stages as three hands them to onBeforeCompile. */
interface ShaderLike {
  vertexShader: string;
  fragmentShader: string;
}

function mustReplace(src: string, anchor: string, replacement: string): string {
  const out = src.replace(anchor, replacement);
  if (out === src) throw new Error(`vehicleSurface: shader anchor missing: ${anchor}`);
  return out;
}

/** The vehicle material's program cache key suffix (the hook changes the program). */
export const VEHICLE_SURFACE_PROGRAM = 'surf1';

/** Patch the vehicle material's program: the per-vertex surface stream and the masked instance tint. */
export function applyVehicleSurfaceHook(shader: ShaderLike): void {
  shader.vertexShader = mustReplace(shader.vertexShader, '#include <common>',
    '#include <common>\nattribute vec3 surf;\nvarying vec3 vSurf;');
  // the instance colour is the body paint's: three's whole-vertex tint goes through the paint mask instead
  const colorVertex = mustReplace(ShaderChunk.color_vertex, 'vColor.rgb *= instanceColor.rgb;',
    'vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, surf.z);');
  shader.vertexShader = mustReplace(shader.vertexShader, '#include <color_vertex>', `${colorVertex}\nvSurf = surf;`);
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <common>', '#include <common>\nvarying vec3 vSurf;');
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
#ifdef USE_ROUGHNESSMAP
  roughnessFactor = clamp(vSurf.x * (0.55 + 0.55 * texelRoughness.g), 0.035, 1.0);
#else
  roughnessFactor = clamp(vSurf.x, 0.035, 1.0);
#endif`);
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <metalnessmap_fragment>', /* glsl */`#include <metalnessmap_fragment>
  metalnessFactor = vSurf.y;`);
}
