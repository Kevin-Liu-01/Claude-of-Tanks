// src/world/hinterland/buildings.ts — the outland's buildings, verticals and trees in the scene (HZ.11, the horizons
// stream, 2026-10-13; B-architecture §4.5): the worker's geometry (outlandGeometry.ts) wrapped as three static draws —
// buildings and verticals, near trees, far trees (a few hundred buildings and a couple of thousand trees: one draw each
// beats per-instance matrices) — drawn through the land's own projection (project.ts: the direction-exact compression
// and the earth's curvature per vertex, so a village at 12 km keeps its exact angular size at a drawn depth under
// 3.3 km) with its haze for the distance the compression takes away. Lit through the engine's lit-material setup (the
// cascade rule); no shadow casting (the cascades end inside the battlefield).
import * as THREE from 'three';
import type { HinterlandShapeArrays } from './outlandGeometry.ts';
import type { HinterlandAir } from './air.ts';
import { HINTERLAND_DEPTH_GLSL, HINTERLAND_PROJECT_GLSL, HINTERLAND_REMAP_DEFINE, HINTERLAND_WRITE_DEPTH } from './project.ts';
import type { HinterlandPyramid } from './pyramid.ts';
import { HINTERLAND_TREE_STRIDE, type HinterlandWire } from './wire.ts';

interface EngineLike {
  setupShadowMaterial?: (material: THREE.Material, hook: (shader: THREE.WebGLProgramParametersWithUniforms) => void) => THREE.Material;
}

/** The outland's material: vertex colours, the land's projection per vertex, its haze for the compressed distance. */
function createOutlandMaterial(engine: EngineLike, hazeSigma: number, key: string, roughness: number, air: HinterlandAir | null): { material: THREE.MeshStandardMaterial; cam: THREE.Vector3; proj: THREE.Matrix4 } {
  const cam = new THREE.Vector3(), proj = new THREE.Matrix4();
  const uniforms: Record<string, THREE.IUniform> = {
    uHlCam: { value: cam },
    uHlProj: { value: proj },
    uHlAir: { value: air?.clarity ?? 1 },
    uHlHazeSigma: { value: hazeSigma },
    uHlHazeColor: { value: new THREE.Color(0.62, 0.7, 0.8) },
    ...(air?.uniforms ?? {}),
  };
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness, metalness: 0, fog: true });
  material.name = key;
  const patch = (shader: THREE.WebGLProgramParametersWithUniforms): void => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform vec3 uHlCam;
varying float vHlTrueD;
varying float vHlDrawnR0;
${HINTERLAND_REMAP_DEFINE}
${HINTERLAND_PROJECT_GLSL}`)
      .replace('#include <begin_vertex>', `
  float hlTrueD, hlR0;
  vec3 transformed = hinterlandProjectDrawn( position, uHlCam, hlTrueD, hlR0 );
  vHlTrueD = hlTrueD;
  vHlDrawnR0 = hlR0;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
  vColor.rgb *= vColor.rgb;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vHlTrueD;
varying float vHlDrawnR0;
uniform float uHlHazeSigma;
uniform vec3 uHlHazeColor;
${HINTERLAND_REMAP_DEFINE}
${HINTERLAND_PROJECT_GLSL}
${HINTERLAND_DEPTH_GLSL}
float hlHazeD = 0.0, hlDrawnR = 0.0;
uniform float uHlAir;
${air ? air.fragmentPars : 'vec3 hlHazeTarget( vec3 fallback ) { return fallback; }'}`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
  {
    // (the land's law: the haze for the distance the written depth no longer covers — project.ts)
    hlHazeD = length( vViewPosition ); hlDrawnR = vHlDrawnR0;
#ifdef HL_REMAP
    float hlSeg = uHlAir * hinterlandSegmentDepth( hlHazeD, hlDrawnR );
#else
    float hlSeg = 0.0;
#endif
    float hlLost = max( 0.0, vHlTrueD - hlDrawnR );
    float hlT = exp( -hlSeg - uHlHazeSigma * hlLost );
    if ( hlT < 0.999 ) {
      #ifdef USE_FOG
      gl_FragColor.rgb = mix( hlHazeTarget( fogColor ), gl_FragColor.rgb, hlT );
      #else
      gl_FragColor.rgb = mix( hlHazeTarget( uHlHazeColor ), gl_FragColor.rgb, hlT );
      #endif
    }
  }`);
  };
  if (engine.setupShadowMaterial) engine.setupShadowMaterial(material, patch);
  else material.onBeforeCompile = patch;
  material.customProgramCacheKey = () => `${key}-${HINTERLAND_WRITE_DEPTH ? 'depth' : 'drawn'}`;
  return { material, cam, proj };
}

function outlandMesh(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, cam: THREE.Vector3, air: HinterlandAir | null, proj: THREE.Matrix4): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.onBeforeRender = (_r, scene, camera) => { cam.copy(camera.position); proj.copy(camera.projectionMatrix); air?.update(scene); };
  return mesh;
}

/** The trees' packed records nearer than HINTERLAND_NEAR_TREE_M, kept for the impostors (trees.ts). */
export interface HinterlandNearTrees { trees: Float32Array; species: string[]; pyramid: HinterlandPyramid }
/** The near trees' packed records (the wire's stride), kept for the impostors (trees.ts). */
export interface HinterlandNearTrees { trees: Float32Array; species: string[]; pyramid: HinterlandPyramid }

function wrap(arrays: HinterlandShapeArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arrays.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(arrays.normal, 3, true));
  // (square-root encoded linear colour: the shader squares it back, vertex colours are linear)
  g.setAttribute('color', new THREE.BufferAttribute(arrays.color, 3, true));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
  return g;
}

/** The outland's scene objects from the worker's answer (null when it carries no outland). */
export function createHinterlandOutlandObjects(wire: HinterlandWire, pyramid: HinterlandPyramid, engineCtx: unknown, air: HinterlandAir | null = null): THREE.Object3D | null {
  const geo = wire.outland;
  if (!geo) return null;
  const engine = (engineCtx ?? {}) as EngineLike;
  const group = new THREE.Group();
  group.name = 'hinterland-outland';
  group.matrixAutoUpdate = false;
  const hazeSigma = Math.max(0, wire.fogDensity) * 0.42 * (wire.air ?? 1);
  if (geo.buildings) {
    const { material, cam, proj } = createOutlandMaterial(engine, hazeSigma, 'hinterland-outland-built-v2', 0.9, air);
    group.add(outlandMesh('hinterland-buildings', wrap(geo.buildings), material, cam, air, proj));
  }
  if (geo.nearTrees || geo.farTrees) {
    const { material, cam, proj } = createOutlandMaterial(engine, hazeSigma, 'hinterland-outland-trees-v2', 1, air);
    if (geo.nearTrees) group.add(outlandMesh('hinterland-trees-near', wrap(geo.nearTrees), material, cam, air, proj));
    if (geo.farTrees) group.add(outlandMesh('hinterland-trees-far', wrap(geo.farTrees), material, cam, air, proj));
  }
  group.userData.hinterlandOutland = geo.stats;
  // (the impostor trees take the same written depth and haze: trees.ts)
  group.userData.hinterlandHaze = { sigma: hazeSigma, air };
  const packed = new Float32Array(geo.nearIndex.length * HINTERLAND_TREE_STRIDE);
  geo.nearIndex.forEach((t, i) => packed.set(wire.trees.subarray(t * HINTERLAND_TREE_STRIDE, (t + 1) * HINTERLAND_TREE_STRIDE), i * HINTERLAND_TREE_STRIDE));
  group.userData.hinterlandNearTrees = { trees: packed, species: wire.species, pyramid } satisfies HinterlandNearTrees;
  return group.children.length ? group : null;
}
