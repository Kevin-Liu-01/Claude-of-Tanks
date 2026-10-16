// Saltmere's harbour water (rejudge6, 2026-10-15: "the sea is flat teal bands"): the coastal backdrop's sea is unlit
// vertex colour, so near the quay it read as painted bands. A lit sea lies over it from the shore out to 125 m: a dark
// green-teal dielectric whose look is its reflection, with procedural swell and chop in world space (two swell trains
// and a finer chop, flattening with distance so the far sea never shimmers), fading into the backdrop's hazed sea
// beyond 95 m. One draw, no textures, the scene's sky as its mirror.
import * as THREE from 'three';

/** The lit sea's reach from the turntable (m): its inner edge under the quay, its outer fade into the backdrop. */
const SEA_INNER_M = 30;
const SEA_FADE_M: readonly [number, number] = [95, 125];
/** Just over the backdrop's sea (y -2.3) so it covers it. */
const SEA_Y_M = -2.26;

type CompileHook = (shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform> }) => void;

/** A dry basin the sea must not cover, in the Garage's view frame: its centre line, half width and its mouth's depth. */
export interface GarageSeaHole { readonly side: number; readonly halfWidth: number; readonly depth0: number; readonly depth1: number }

/** The GLSL that discards a fragment over the dry basin (vWorld: the fragment's world position). */
export function garageSeaHoleGlsl(hole: GarageSeaHole, world: string): string {
  return `{
  float holeSide = (${world}.x - ${world}.z) * 0.70710678, holeDepth = -(${world}.x + ${world}.z) * 0.70710678;
  if (abs(holeSide - ${hole.side.toFixed(3)}) < ${(hole.halfWidth + 0.05).toFixed(3)}
    && holeDepth > ${(hole.depth0 - 4).toFixed(3)} && holeDepth < ${(hole.depth1 + 0.5).toFixed(3)}) discard;
}`;
}

function seaWaveHook(hole: GarageSeaHole | null): CompileHook {
  return (shader) => {
    if (!shader.fragmentShader.includes('#include <normal_fragment_maps>')
      || !shader.fragmentShader.includes('#include <dithering_fragment>')) return;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vSeaWorld;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSeaWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vSeaWorld;
float seaHash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}
float seaNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(seaHash(i), seaHash(i + vec2(1.0, 0.0)), u.x),
    mix(seaHash(i + vec2(0.0, 1.0)), seaHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float seaHeight(vec2 p) {
  // two swell trains from the open sea, broken by noise so they never read as stripes, and a finer chop
  float swell = sin(dot(p, vec2(0.21, 0.07)) + seaNoise(p * 0.08) * 4.0) * 0.5
    + sin(dot(p, vec2(-0.09, 0.29)) + seaNoise(p * 0.11 + 7.0) * 3.0) * 0.32;
  float chop = seaNoise(p * 0.9) * 0.22 + seaNoise(p * 2.3 + 13.0) * 0.1;
  return swell + chop;
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float seaDist = length(vSeaWorld - cameraPosition);
  float seaAmp = 0.34 * (1.0 - smoothstep(25.0, 110.0, seaDist)) + 0.05;
  vec2 seaP = vSeaWorld.xz;
  float seaE = 0.25;
  float seaDx = seaHeight(seaP + vec2(seaE, 0.0)) - seaHeight(seaP - vec2(seaE, 0.0));
  float seaDz = seaHeight(seaP + vec2(0.0, seaE)) - seaHeight(seaP - vec2(0.0, seaE));
  vec3 seaWorldNormal = normalize(vec3(-seaDx * seaAmp / (2.0 * seaE), 1.0, -seaDz * seaAmp / (2.0 * seaE)));
  normal = normalize((viewMatrix * vec4(seaWorldNormal, 0.0)).xyz);
}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
gl_FragColor.a *= 1.0 - smoothstep(${SEA_FADE_M[0].toFixed(1)}, ${SEA_FADE_M[1].toFixed(1)}, length(vSeaWorld.xz));
${hole ? garageSeaHoleGlsl(hole, 'vSeaWorld') : ''}`);
  };
}

/** The lit harbour sea: a ring from under the quay to the backdrop's hazed sea. */
export function createGarageSea(setup: ((material: THREE.Material, hook: CompileHook) => void) | null,
  hole: GarageSeaHole | null): THREE.Mesh {
  const geometry = new THREE.RingGeometry(SEA_INNER_M, SEA_FADE_M[1], 96, 6);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: 0x1d3a40, roughness: 0.14, metalness: 0, transparent: true, depthWrite: false,
  });
  material.name = 'garage-sea';
  if (setup) setup(material, seaWaveHook(hole));
  else material.onBeforeCompile = seaWaveHook(hole) as THREE.Material['onBeforeCompile'];
  material.customProgramCacheKey = () => 'garage-sea-v1';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'garage_harbour_sea';
  mesh.position.y = SEA_Y_M;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
