// Working-yard grime on the Garage facility kit (rejudge6, 2026-10-15: "clean, sterile, toy-like props with no grime or
// clutter. Critics want the wear of a working yard"). One compile hook shared by the four instanced facility classes
// (structure, painted, equipment, masonry): in world space, patchy dirt, rain streaks running down from the tops,
// a dirt line where the kit meets the yard, and the instance colours drawn a sixth of the way toward grey so a painted
// part reads as weathered paint rather than a toy's plastic. No textures, no new samplers; the same code in every pack.
import type * as THREE from 'three';

/** The program key of every facility class material carrying the grime (one program per class's defines). */
export const GARAGE_FACILITY_GRIME_KEY = 'garage-facility-grime-v1';

/** How much grime the hook lays on (1 = the yard's working wear). */
const GRIME_AMOUNT = 1;

export function garageFacilityGrimeHook(): (shader: {
  vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform>;
}) => void {
  return (shader) => {
    if (!shader.vertexShader.includes('#include <begin_vertex>')
      || !shader.fragmentShader.includes('#include <color_fragment>')) return;
    shader.uniforms.uGrimeAmount = { value: GRIME_AMOUNT };
    shader.uniforms.uGrimeDatum = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vGrimeWorld;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec4 grimeWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  grimeWorld = instanceMatrix * grimeWorld;
#endif
  vGrimeWorld = (modelMatrix * grimeWorld).xyz;
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vGrimeWorld;
uniform float uGrimeAmount;
uniform float uGrimeDatum;
float grimeHash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}
float grimeNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(grimeHash(i), grimeHash(i + vec2(1.0, 0.0)), u.x),
    mix(grimeHash(i + vec2(0.0, 1.0)), grimeHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 gw = vGrimeWorld;
  float gPatch = grimeNoise(gw.xz * 0.45 + gw.y * 0.3) * 0.6 + grimeNoise(gw.xz * 1.6 + gw.y * 0.9 + 11.0) * 0.4;
  float gStreak = grimeNoise(vec2(dot(gw.xz, vec2(2.3, 1.7)), gw.y * 0.22 + 5.0));
  float gFoot = 1.0 - smoothstep(0.0, 1.1, gw.y - uGrimeDatum);
  float grime = 0.16 * smoothstep(0.45, 0.85, gPatch) + 0.1 * smoothstep(0.55, 0.9, gStreak) + 0.14 * gFoot;
  diffuseColor.rgb *= 1.0 - grime * uGrimeAmount;
  float gLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(gLuma) * vec3(1.02, 1.0, 0.96), 0.16 * uGrimeAmount);
}`);
  };
}
