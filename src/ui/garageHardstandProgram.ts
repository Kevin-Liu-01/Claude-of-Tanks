// The graded hardstand's shader program (2026-10-11, wave 408), apart from garageYardWear.ts so the Garage stage can
// compile it with its outdoor seeds without loading the hardstand painters.
import * as THREE from 'three';

/** The graded hardstand's shader program (one in every outdoor pack; garageStage.ts compiles it with the seeds). */
export const GARAGE_HARDSTAND_PROGRAM_KEY = 'garage-hardstand-graded-v2';

/** Metres per repeat of the hardstand's grain. */
export const GARAGE_HARDSTAND_GRAIN_TILE_M = 2;

let sharedGrain: THREE.CanvasTexture | null = null;

/**
 * The hardstand's grain (round 5d-2; waves 408 and 419: "a blurry, smeared texture", "stretched low-resolution
 * image"): the yard's own canvas holds its layout at 35 px/m, which blurs at a bay camera's distance, so the floor
 * multiplies in a shared tileable grain at 256 px/m: fine grit, sand and small stones turned every way, neutral grey on
 * average so its mips fade to nothing with distance. Shared by every pack and never disposed by one.
 */
export function garageHardstandGrainTexture(anisotropy = 4): THREE.CanvasTexture | null {
  if (sharedGrain) return sharedGrain;
  if (typeof document === 'undefined') return null;
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  if (!g) return null;
  let seed = 0x6a7e;
  const rng = (): number => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const image = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = 128 + (rng() - 0.5) * 22;
    image.data[i * 4] = v; image.data[i * 4 + 1] = v; image.data[i * 4 + 2] = v; image.data[i * 4 + 3] = 255;
  }
  g.putImageData(image, 0, 0);
  // stones from grit to pebbles, far more small than large, each drawn across the tile's edges so it repeats seamlessly
  for (let i = 0; i < 2600; i++) {
    const x = rng() * S, y = rng() * S, t = rng();
    const r = 0.8 + t * t * t * 7;
    const dark = rng() < 0.55;
    const shade = dark ? 128 - 16 - rng() * 30 : 128 + 10 + rng() * 26;
    g.fillStyle = `rgba(${shade},${shade},${shade},${(0.5 + rng() * 0.45).toFixed(2)})`;
    const squash = 0.5 + rng() * 0.45, angle = rng() * Math.PI;
    for (const dx of [-S, 0, S]) {
      for (const dy of [-S, 0, S]) {
        if (x + dx < -r * 2 || x + dx > S + r * 2 || y + dy < -r * 2 || y + dy > S + r * 2) continue;
        g.beginPath(); g.ellipse(x + dx, y + dy, r, r * squash, angle, 0, Math.PI * 2); g.fill();
      }
    }
  }
  sharedGrain = new THREE.CanvasTexture(canvas);
  sharedGrain.wrapS = THREE.RepeatWrapping;
  sharedGrain.wrapT = THREE.RepeatWrapping;
  sharedGrain.anisotropy = anisotropy;
  sharedGrain.userData.sharedGarageHardstandGrain = true;
  return sharedGrain;
}

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
export function garageHardstandGradedHook(
  grain: THREE.Texture | null,
  grainStrength: number,
): (shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform> }) => void {
  return (shader) => {
  if (!shader.vertexShader.includes('#include <begin_vertex>') || !shader.fragmentShader.includes('#include <alphamap_fragment>')) return;
  shader.uniforms.hardstandGrain = { value: grain };
  shader.uniforms.hardstandGrainStrength = { value: grain ? grainStrength : 0 };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float hardstandBlend;\nvarying float vHardstandBlend;\nvarying vec2 vHardstandGround;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHardstandBlend = hardstandBlend;\nvHardstandGround = position.xz;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
varying float vHardstandBlend;
varying vec2 vHardstandGround;
uniform sampler2D hardstandGrain;
uniform float hardstandGrainStrength;
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
    .replace('#include <map_fragment>', `#include <map_fragment>
diffuseColor.rgb *= mix(vec3(1.0), texture2D(hardstandGrain, vHardstandGround * ${(1 / GARAGE_HARDSTAND_GRAIN_TILE_M).toFixed(4)}).rgb * 2.0,
  hardstandGrainStrength);`)
    .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
{
  float hardstandBreak = hardstandNoise(vHardstandGround * 0.42) * 0.62 + hardstandNoise(vHardstandGround * 1.9 + 17.0) * 0.28
    + hardstandNoise(vHardstandGround * 7.3 + 41.0) * 0.1;
  diffuseColor.a *= smoothstep(0.36, 0.64, vHardstandBlend + (hardstandBreak - 0.5) * 0.72);
}`);
  };
}
