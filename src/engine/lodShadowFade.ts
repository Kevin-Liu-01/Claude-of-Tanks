import * as THREE from 'three';

type MaterialShader = Parameters<THREE.Material['onBeforeCompile']>[0];
type LodShadowMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;

/** Per-instance fade amount: zero is fully present, one is fully dissolved. */
export const LOD_SHADOW_FADE_ATTRIBUTE = 'aLodF';
export const LOD_SHADOW_FADE_PROGRAM_KEY = 'cot-lod-shadow-fade-depth-v1';

function replaceShaderAnchor(source: string, anchor: string, replacement: string): string {
  const patched = source.replace(anchor, replacement);
  if (patched === source) {
    throw new Error(`engine/lodShadowFade: shader anchor missing: ${anchor}`);
  }
  return patched;
}

/**
 * Mirror a visible instanced-LOD dissolve in the native shadow pass.
 *
 * The pattern is evaluated in texel-snapped shadow-map coordinates, so it is
 * stable while the presentation camera moves. Blending two spatial scales
 * avoids replacing a whole caster with a fine checkerboard on one frame.
 */
export function patchLodShadowFadeDepthShader(shader: MaterialShader): void {
  shader.vertexShader = replaceShaderAnchor(shader.vertexShader, '#include <common>',
    `#include <common>
attribute float ${LOD_SHADOW_FADE_ATTRIBUTE};
varying float vLodShadowFade;`);
  shader.vertexShader = replaceShaderAnchor(shader.vertexShader, '#include <begin_vertex>', `
    #include <begin_vertex>
    vLodShadowFade = ${LOD_SHADOW_FADE_ATTRIBUTE};
  `);
  shader.fragmentShader = replaceShaderAnchor(shader.fragmentShader, '#include <common>',
    '#include <common>\nvarying float vLodShadowFade;');
  shader.fragmentShader = replaceShaderAnchor(
    shader.fragmentShader,
    '#include <alphatest_fragment>',
    `
    #include <alphatest_fragment>
    if (vLodShadowFade > 0.0005) {
      float d1 = fract(52.9829189 * fract(dot(
        gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      float d2 = fract(52.9829189 * fract(dot(
        floor(gl_FragCoord.xy / 3.7), vec2(0.06711056, 0.00583715))));
      if (mix(d1, d2, 0.5) < vLodShadowFade) discard;
    }
  `,
  );
}

// One engine-owned material serves every map and every compatible LOD caster.
// The shader has no per-world uniforms, so rebuilding it for each battlefield
// would only leak programs across map transitions and weaken the shared policy.
const lodShadowFadeDepthMaterial = new THREE.MeshDepthMaterial({
  name: 'LodShadowFadeDepth',
  depthPacking: THREE.RGBADepthPacking,
});
lodShadowFadeDepthMaterial.onBeforeCompile = patchLodShadowFadeDepthShader;
lodShadowFadeDepthMaterial.customProgramCacheKey = () => LOD_SHADOW_FADE_PROGRAM_KEY;
lodShadowFadeDepthMaterial.userData.lodShadowFade = true;

export function getLodShadowFadeDepthMaterial(): THREE.MeshDepthMaterial {
  return lodShadowFadeDepthMaterial;
}

/** Attach the engine's continuous shadow handoff to an instanced LOD caster. */
export function applyLodShadowFadeDepth<T extends LodShadowMesh>(mesh: T): T {
  if (!mesh.geometry.getAttribute(LOD_SHADOW_FADE_ATTRIBUTE)) {
    throw new Error(
      `engine/lodShadowFade: ${mesh.name || mesh.type} requires `
      + `${LOD_SHADOW_FADE_ATTRIBUTE} geometry data`,
    );
  }
  mesh.customDepthMaterial = lodShadowFadeDepthMaterial;
  mesh.userData.lodShadowFadeCaster = true;
  return mesh;
}

export function usesLodShadowFadeDepth(object: THREE.Object3D): boolean {
  const mesh = object as LodShadowMesh;
  return mesh.userData?.lodShadowFadeCaster === true
    && mesh.customDepthMaterial === lodShadowFadeDepthMaterial
    && !!mesh.geometry?.getAttribute?.(LOD_SHADOW_FADE_ATTRIBUTE);
}
