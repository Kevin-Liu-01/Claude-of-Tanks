import * as THREE from 'three';

type MaterialShader = Parameters<THREE.Material['onBeforeCompile']>[0];
type LodShadowMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;

/** Per-instance fade amount: zero is fully present, one is fully dissolved. */
export const LOD_SHADOW_FADE_ATTRIBUTE = 'aLodF';
export const LOD_SHADOW_FADE_PROGRAM_KEY = 'cot-lod-shadow-fade-depth-v2';

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
 * The pattern is evaluated in quantized world coordinates. Shadow-map pixel
 * coordinates are not stable: when a cascade snaps by one texel, the same
 * tree surface lands on a different gl_FragCoord and its dissolve pattern
 * changes in a single frame. A world-anchored pattern is shared by every
 * cascade and remains fixed while the presentation camera moves.
 */
export function patchLodShadowFadeDepthShader(shader: MaterialShader): void {
  shader.vertexShader = replaceShaderAnchor(shader.vertexShader, '#include <common>',
    `#include <common>
attribute float ${LOD_SHADOW_FADE_ATTRIBUTE};
varying float vLodShadowFade;
varying vec3 vLodShadowWorldPosition;`);
  shader.vertexShader = replaceShaderAnchor(shader.vertexShader, '#include <begin_vertex>', `
    #include <begin_vertex>
    vLodShadowFade = ${LOD_SHADOW_FADE_ATTRIBUTE};
  `);
  shader.vertexShader = replaceShaderAnchor(shader.vertexShader, '#include <project_vertex>', `
    #include <project_vertex>
    vec4 cotLodShadowWorld = vec4(transformed, 1.0);
    #ifdef USE_BATCHING
      cotLodShadowWorld = batchingMatrix * cotLodShadowWorld;
    #endif
    #ifdef USE_INSTANCING
      cotLodShadowWorld = instanceMatrix * cotLodShadowWorld;
    #endif
    vLodShadowWorldPosition = (modelMatrix * cotLodShadowWorld).xyz;
  `);
  shader.fragmentShader = replaceShaderAnchor(shader.fragmentShader, '#include <common>',
    `#include <common>
varying float vLodShadowFade;
varying vec3 vLodShadowWorldPosition;
float cotLodShadowHash(vec3 cell) {
  cell = fract(cell * 0.1031);
  cell += dot(cell, cell.yzx + 33.33);
  return fract((cell.x + cell.y) * cell.z);
}`);
  shader.fragmentShader = replaceShaderAnchor(
    shader.fragmentShader,
    '#include <alphatest_fragment>',
    `
    #include <alphatest_fragment>
    if (vLodShadowFade > 0.0005) {
      float d1 = cotLodShadowHash(floor(vLodShadowWorldPosition * 5.0));
      float d2 = cotLodShadowHash(floor(vLodShadowWorldPosition * 1.7) + 17.0);
      float d3 = cotLodShadowHash(floor(vLodShadowWorldPosition * 0.73) + 47.0);
      float d4 = cotLodShadowHash(floor(vLodShadowWorldPosition * 0.31) + 89.0);
      // Averaging independent scales tapers the last few percent of
      // coverage. The proxy is visually gone before its instance slot is
      // retired, avoiding a final-frame shadow pop at fade == 1.
      if ((d1 + d2 + d3 + d4) * 0.25 < vLodShadowFade) discard;
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
