/**
 * fogLayer.ts — the materials' scene fog on the battlefield's haze layer (2026-10-02, the lighting lane).
 *
 * The aerial pass (post.ts) hazes along the view ray through an exponential layer over the ground (AERIAL_LAYER_H, scale
 * height 300 m over the ground under the camera), so a camera high over the field looks down through less haze than a
 * camera on the ground sees along the same distance. The materials' FogExp2 (sky.ts applyFog, the extinction share of
 * the map's fog) kept the plain distance law, so the census bird (300 m up) still saw the far half of the square under
 * the fog a tank on the ground would see over 900 m of air. This patches three's fog vertex chunk (the exp2 path) to the
 * same layer: the fog's optical distance takes the path-averaged density between the camera's height and the vertex's
 * over the same path from the ground (post.ts's own expression), folded into vFogDepth per vertex — no new varying (a
 * terrain program near its varying limit links as before) and no per-fragment cost; the layer is smooth over the
 * hundreds of metres it varies across, so the interpolation is exact enough. A camera on the ground keeps the plain law
 * exactly (the layer is gated off below FOG_LAYER_MIN_M, where it would move the fog by under 4 % of itself), so the
 * chase, the sights and every horizon seen from the field keep their fog.
 *
 * The shared uniform (FOG_LAYER: x the camera's height over the datum, y the datum, z 1/H, w on) is a plain object on
 * every fogged built-in material's uniforms (UniformsUtils.clone keeps a plain object by reference) and on
 * UniformsLib.fog for shader materials that merge it; a material without it reads w = 0, the plain law.
 */
import * as THREE from 'three';

/** post.ts AERIAL_LAYER_H: the haze layer's scale height (m). */
export const FOG_LAYER_H = 300;
/** Below this height over the ground the layer would move the fog by under 4 % of itself: the shader skips it. */
export const FOG_LAYER_MIN_M = 12;
/** The shared uniform post.ts writes once per frame (updateAerialCameraBasis). */
export const FOG_LAYER = { x: 0, y: 0, z: 1 / FOG_LAYER_H, w: 0 };

let installed = false;
/** Patch the fog vertex chunk and hand every fogged material the shared uniform; idempotent, before the first compile. */
export function installFogLayer(): void {
  if (installed) return;
  installed = true;
  const chunk = THREE.ShaderChunk;
  const depth = 'vFogDepth = - mvPosition.z;';
  if (!chunk.fog_vertex.includes(depth) || !chunk.fog_pars_vertex.includes('varying float vFogDepth;')) {
    throw new Error('fogLayer.ts: three fog chunk anchors not found');
  }
  chunk.fog_pars_vertex = chunk.fog_pars_vertex.replace('varying float vFogDepth;', 'varying float vFogDepth;\n#ifdef FOG_EXP2\nuniform vec4 fogLayer;\n#endif');
  chunk.fog_vertex = chunk.fog_vertex.replace(depth, `${depth}
#ifdef FOG_EXP2
if ( fogLayer.w > 0.5 ) {
float fogY1 = max( cameraPosition.y + dot( viewMatrix[ 1 ].xyz, mvPosition.xyz ) - fogLayer.y, 0.0 ) * fogLayer.z;
float fogY0 = fogLayer.x * fogLayer.z;
float fogCam = abs( fogY0 - fogY1 ) < 0.003 ? exp( -0.5 * ( fogY0 + fogY1 ) ) : ( exp( -fogY1 ) - exp( -fogY0 ) ) / ( fogY0 - fogY1 );
float fogGround = fogY1 < 0.003 ? exp( -0.5 * fogY1 ) : ( 1.0 - exp( -fogY1 ) ) / fogY1;
vFogDepth *= clamp( fogCam / max( fogGround, 1e-3 ), 0.0, 1.0 );
}
#endif`);
  const uniform = (): THREE.IUniform => ({ value: FOG_LAYER });
  (THREE.UniformsLib.fog as Record<string, THREE.IUniform>).fogLayer = uniform();
  for (const shader of Object.values(THREE.ShaderLib)) {
    if (shader.uniforms.fogDensity && !shader.uniforms.fogLayer) shader.uniforms.fogLayer = uniform();
  }
}
