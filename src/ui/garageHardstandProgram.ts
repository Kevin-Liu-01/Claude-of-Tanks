// The graded hardstand's shader program (2026-10-11, wave 408), apart from garageYardWear.ts so the Garage stage can
// compile it with its outdoor seeds without loading the hardstand painters.

/** The graded hardstand's shader program (one in every outdoor pack; garageStage.ts compiles it with the seeds). */
export const GARAGE_HARDSTAND_PROGRAM_KEY = 'garage-hardstand-graded-v1';

/** Metres over which the worked yard thins out into the terrain at the apron's edges. */
export const GARAGE_HARDSTAND_FEATHER_M = 2.4;

/**
 * The hardstand's graded edge (2026-10-11, wave 408: "a ruler-straight seam runs the full width of the frame where the
 * textured foreground snow meets a flat, pale, untextured snow plane", "cookie-cut pads", "no hard slab edge"): the
 * worked ground thins out into the terrain instead of stopping at a cut. Each vertex carries its share of worked ground
 * (the `hardstandBlend` attribute: 1 over the yard and the pads' cores, 0 at their rims and where the ground rises out of
 * the yard); the fragment breaks that ramp with three octaves of value noise in the pack's ground plane into an
 * irregular, grainy margin through which the terrain shows. Chained after the cascade hook (setupShadowMaterial's extra
 * hook) on a transparent material that writes no depth, drawn before the floor decals.
 */
export function garageHardstandGradedHook(shader: { vertexShader: string; fragmentShader: string }): void {
  if (!shader.vertexShader.includes('#include <begin_vertex>') || !shader.fragmentShader.includes('#include <alphamap_fragment>')) return;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float hardstandBlend;\nvarying float vHardstandBlend;\nvarying vec2 vHardstandGround;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHardstandBlend = hardstandBlend;\nvHardstandGround = position.xz;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
varying float vHardstandBlend;
varying vec2 vHardstandGround;
float hardstandHash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}
float hardstandNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hardstandHash(i), hardstandHash(i + vec2(1.0, 0.0)), u.x),
    mix(hardstandHash(i + vec2(0.0, 1.0)), hardstandHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`)
    .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
{
  float hardstandBreak = hardstandNoise(vHardstandGround * 0.42) * 0.62 + hardstandNoise(vHardstandGround * 1.9 + 17.0) * 0.28
    + hardstandNoise(vHardstandGround * 7.3 + 41.0) * 0.1;
  diffuseColor.a *= smoothstep(0.36, 0.64, vHardstandBlend + (hardstandBreak - 0.5) * 0.72);
}`);
}
