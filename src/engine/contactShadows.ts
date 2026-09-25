/**
 * contactShadows.ts — round 69 (2026-09-24): screen-space contact shadows for the sun.
 *
 * The cascaded maps ground a hull to within their texel and normal bias (cascade 0: ~3–4 cm at 2K over its box, a
 * 0.35-texel receiver bias), and the five-tap PCF opens a soft penumbra across that band: right at the contact
 * line — a track link on the ground, a road wheel, a wall base, a crate — a thin lit seam survives and the object
 * floats a little. Every deferred engine closes that seam with a short ray march against the depth buffer toward
 * the sun (Bavoil / Sainz, "Screen-space contact shadows"): from the visible point, a few metres at most, a sample
 * that lands behind the depth-buffer surface by more than a bias and less than a thickness is an occluder, and the
 * pixel loses the sun. The march runs INSIDE the aerial pass (post.ts), the one full-resolution pass that already
 * reconstructs each pixel's world position and reads the resolved scene depth, so it costs no extra pass.
 *
 * Blended into the shadow term, not multiplied on top of it. The forward renderer has no G-buffer, so the lit
 * materials carry the CSM sun visibility of every opaque pixel in the scene target's alpha (lighting.ts writes
 * `2 + cotSunVis` there; the canvas is opaque, `alpha: false`, so that channel is free), and the pass reconstructs
 * the normal from depth. An alpha below 1.5 is not an opaque lit surface — a grass or leaf card (alpha-to-coverage:
 * its alpha is its coverage), water, glass, an unlit material — and such a pixel is neither a receiver nor an
 * occluder: the cards never cast in the cascades, and the first captures showed every meadow combed by its own
 * blades. With the receiver's visibility v, the sun term T = sunLum · max(n·l, 0) · v and the ambient
 * A(n) the light rig gives that normal (hemisphere, environment, the anti-sun fill), the colour of an occluded
 * pixel becomes colour · (1 − occ · T / (T + A)): a pixel the cascades already shadow (v = 0) is untouched, a lit
 * pixel loses exactly its sun share. The share is `contactShadowSunShare` below, pinned by the receipt together
 * with the step table and the march length ramp.
 *
 * Step table: twelve samples, quadratic spacing (dense at the contact, where the seam is), jittered per pixel with
 * interleaved gradient noise so the twelve rungs read as a soft edge rather than twelve bands; the march length
 * grows from 0.55 m at 4 m to 1.4 m at 40 m (a metre shrinks to a few pixels at range) and the term fades out
 * between 65 and 90 m, where the cascades' own penumbra is sub-pixel anyway. Thickness grows along the ray (no
 * long false shadows behind thin or distant objects); the bias grows with distance (no acne on flat ground).
 * The mobile tier and `?fx=off` never enter the block (uContact 0); a preset without the lever likewise.
 */
import * as THREE from 'three';

export const CONTACT_SHADOW_STEPS = 12;
export const CONTACT_SHADOW_NEAR_M = 0.55;
export const CONTACT_SHADOW_FAR_M = 1.4;
export const CONTACT_SHADOW_LENGTH_NEAR_DIST_M = 4;
export const CONTACT_SHADOW_LENGTH_FAR_DIST_M = 40;
export const CONTACT_SHADOW_RANGE_M = 90;
export const CONTACT_SHADOW_FADE_M = 25;
/** How much of the sun share an occluded pixel loses (1 = the full sun term). */
export const CONTACT_SHADOW_STRENGTH = 0.92;
/** The last part of the ray fades so the shadow has no cut-off line at its length. */
export const CONTACT_SHADOW_TAIL_FADE = 0.55;
/** Scene-target alpha at or above this decodes as 2 + CSM sun visibility of an opaque lit surface. */
export const CONTACT_SHADOW_ALPHA_OPAQUE = 1.5;
/**
 * An occluder counts only when the depth this many pixels either side of the hit lies on the same surface (within
 * WIDTH_M + WIDTH_PER_M × distance): wires, rails and far poles — a few pixels wide, never cascade casters — are
 * skipped, hulls, tracks, wheels, walls and rocks pass (an oblique face changes depth by ~0.1 m over 5 px at 10 m).
 */
export const CONTACT_SHADOW_WIDTH_PX = 5;
export const CONTACT_SHADOW_WIDTH_M = 0.12;
export const CONTACT_SHADOW_WIDTH_PER_M = 0.012;

/** Ray parameter of step `i` (0-based) with a per-pixel jitter in [0, 1): quadratic, denser at the contact. */
export function contactShadowStepParameter(step: number, jitter = 0.5, steps = CONTACT_SHADOW_STEPS): number {
  const s = (step + jitter) / steps;
  return s * (0.3 + 0.7 * s);
}

/** The twelve ray parameters for a given jitter — what the GLSL loop walks. */
export function contactShadowStepTable(jitter = 0.5, steps = CONTACT_SHADOW_STEPS): number[] {
  const table: number[] = [];
  for (let i = 0; i < steps; i++) table.push(contactShadowStepParameter(i, jitter, steps));
  return table;
}

/** March length in metres for a receiver at `distance` metres from the camera. */
export function contactShadowMarchLength(distance: number): number {
  const t = THREE.MathUtils.smoothstep(distance, CONTACT_SHADOW_LENGTH_NEAR_DIST_M, CONTACT_SHADOW_LENGTH_FAR_DIST_M);
  return CONTACT_SHADOW_NEAR_M + (CONTACT_SHADOW_FAR_M - CONTACT_SHADOW_NEAR_M) * t;
}

/** Distance fade: 1 inside the range less the fade band, 0 at the range. */
export function contactShadowRangeFade(distance: number): number {
  return 1 - THREE.MathUtils.smoothstep(distance, CONTACT_SHADOW_RANGE_M - CONTACT_SHADOW_FADE_M, CONTACT_SHADOW_RANGE_M);
}

/** Occlusion strength from the first occluded ray parameter (> 1: none): hard, faded over the ray's last part. */
export function contactShadowOcclusion(hit: number): number {
  if (!(hit <= 1)) return 0;
  return 1 - THREE.MathUtils.smoothstep(hit, CONTACT_SHADOW_TAIL_FADE, 1);
}

export interface ContactShadowAmbient {
  /** Hemisphere sky pole irradiance luminance (intensity × colour luma). */
  sky: number;
  /** Hemisphere ground pole irradiance luminance. */
  ground: number;
  /** Environment (IBL) irradiance luminance, already × environmentIntensity. */
  env: number;
  /** Anti-sun fill irradiance luminance at normal incidence. */
  fill: number;
}

/**
 * The share of a lit pixel's radiance that is sunlight: T / (T + A) with T the sun term for this normal and CSM
 * visibility and A the ambient the rig gives the normal. 0 when the cascades already shadow the pixel or the face
 * turns from the sun; approaches 1 for a sunlit face under a dim sky.
 */
/** Decode the scene target's alpha: the CSM sun visibility of an opaque lit surface, or -1 for anything else. */
export function contactShadowSunVisibility(alpha: number): number {
  return alpha >= CONTACT_SHADOW_ALPHA_OPAQUE ? THREE.MathUtils.clamp(alpha - 2, 0, 1) : -1;
}

export function contactShadowSunShare(
  nDotL: number, sunVisibility: number, sunLum: number, ambient: ContactShadowAmbient, normalY: number, nDotFill: number,
): number {
  const T = sunLum * Math.max(nDotL, 0) * THREE.MathUtils.clamp(sunVisibility, 0, 1);
  if (!(T > 1e-3)) return 0;
  const hemi = THREE.MathUtils.lerp(ambient.ground, ambient.sky, THREE.MathUtils.clamp(normalY * 0.5 + 0.5, 0, 1));
  const A = Math.max(0, hemi) + Math.max(0, ambient.env) + Math.max(0, ambient.fill) * Math.max(nDotFill, 0);
  return T / (T + A);
}

export interface ContactShadowUniforms {
  uContact: THREE.IUniform<number>;
  uContactViewProj: THREE.IUniform<THREE.Matrix4>;
  uContactAmb: THREE.IUniform<THREE.Vector4>;
  uContactFillDir: THREE.IUniform<THREE.Vector3>;
  uContactSunLum: THREE.IUniform<number>;
}

export function createContactShadowUniforms(): ContactShadowUniforms {
  return {
    uContact: { value: 0 },
    uContactViewProj: { value: new THREE.Matrix4() },
    uContactAmb: { value: new THREE.Vector4(0.3, 0.2, 0.3, 0.3) },
    uContactFillDir: { value: new THREE.Vector3(0, 1, 0) },
    uContactSunLum: { value: 4 },
  };
}

/** What lighting.ts publishes on scene.userData.lightRig for the post chain (mutated in place per preset). */
export interface PublishedLightRig {
  sunIntensity: number;
  sunColor: THREE.Color;
  hemiIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  fillIntensity: number;
  fillColor: THREE.Color;
  /** World direction toward the fill light. */
  fillDir: THREE.Vector3;
}

const luma = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
/** The share of the environment's diffuse fill the legacy sun disc folds into every PMREM (round 65's finding). */
const ENV_DISC_FILL = 0.5;

/**
 * Per-frame uniform refresh (post.ts, before the composer renders). The view-projection is the camera's current
 * one — the scene render jitters it by a fraction of a pixel when temporal AA is on, which the march tolerates.
 */
export function updateContactShadowUniforms(
  uniforms: ContactShadowUniforms | Record<string, THREE.IUniform>, camera: THREE.Camera, scene: THREE.Scene,
  enabled: boolean,
): void {
  const u = uniforms as ContactShadowUniforms;
  u.uContact.value = enabled ? 1 : 0;
  if (!enabled) return;
  u.uContactViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const rig = scene.userData.lightRig as PublishedLightRig | undefined;
  if (!rig) return;
  const skyIrradiance = scene.userData.skyIrradiance as THREE.Color | undefined;
  const envIntensity = typeof scene.environmentIntensity === 'number' ? scene.environmentIntensity : 1;
  const envLum = ((skyIrradiance ? luma(skyIrradiance) : 0.35) + ENV_DISC_FILL) * envIntensity;
  u.uContactAmb.value.set(
    rig.hemiIntensity * luma(rig.hemiSky),
    rig.hemiIntensity * luma(rig.hemiGround),
    envLum,
    rig.fillIntensity * luma(rig.fillColor),
  );
  u.uContactFillDir.value.copy(rig.fillDir).normalize();
  u.uContactSunLum.value = rig.sunIntensity * luma(rig.sunColor);
}

const f = (x: number): string => x.toFixed(4);

/**
 * The block the aerial fragment includes. Expects the pass's own declarations (tDepth, uNear, uFar, uCamPos,
 * uCamRight, uCamUp, uCamFwd, uTan, uInvSize, uSunDir) and provides `cotContactShade(uv, P, ray, viewZ, alpha)`
 * → the multiplier for the pixel's colour (1 = untouched).
 */
export const CONTACT_SHADOW_GLSL = /* glsl */ `
    // round 69: screen-space contact shadows (contactShadows.ts)
    uniform float uContact;
    uniform mat4 uContactViewProj;
    uniform vec4 uContactAmb;
    uniform vec3 uContactFillDir;
    uniform float uContactSunLum;
    float cotDepthToDist( float d ) {
      return ( uNear * uFar ) / ( uFar - ( uFar - uNear ) * d );
    }
    vec3 cotWorldAt( vec2 uv ) {
      float dist = cotDepthToDist( texture2D( tDepth, uv ).x );
      vec3 r = normalize( uCamFwd
        + uCamRight * ( uv.x * 2.0 - 1.0 ) * uTan.x
        + uCamUp * ( uv.y * 2.0 - 1.0 ) * uTan.y );
      return uCamPos + r * ( dist / max( dot( r, uCamFwd ), 0.05 ) );
    }
    // the scene target's alpha: 2 + the CSM sun visibility of an opaque lit surface, below 1.5 anything else
    float cotSunVisOf( float a ) {
      return a >= ${f(CONTACT_SHADOW_ALPHA_OPAQUE)} ? clamp( a - 2.0, 0.0, 1.0 ) : -1.0;
    }
    // best-pair normal from the depth neighbours (the smaller step on each axis stays on the surface)
    vec3 cotNormalAt( vec2 uv, vec3 P ) {
      vec3 px1 = cotWorldAt( uv + vec2( uInvSize.x, 0.0 ) );
      vec3 px0 = cotWorldAt( uv - vec2( uInvSize.x, 0.0 ) );
      vec3 py1 = cotWorldAt( uv + vec2( 0.0, uInvSize.y ) );
      vec3 py0 = cotWorldAt( uv - vec2( 0.0, uInvSize.y ) );
      vec3 dx = ( distance( px1, P ) < distance( px0, P ) ) ? px1 - P : P - px0;
      vec3 dy = ( distance( py1, P ) < distance( py0, P ) ) ? py1 - P : P - py0;
      return normalize( cross( dx, dy ) );
    }
    float cotContactOcclusion( vec3 P, vec3 N, float dist ) {
      float len = mix( ${f(CONTACT_SHADOW_NEAR_M)}, ${f(CONTACT_SHADOW_FAR_M)},
        smoothstep( ${f(CONTACT_SHADOW_LENGTH_NEAR_DIST_M)}, ${f(CONTACT_SHADOW_LENGTH_FAR_DIST_M)}, dist ) );
      vec3 start = P + N * ( 0.012 + dist * 0.0025 );
      float jitter = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
      float hit = 2.0;
      for ( int i = 0; i < ${CONTACT_SHADOW_STEPS}; i++ ) {
        float s = ( float( i ) + jitter ) / ${f(CONTACT_SHADOW_STEPS)};
        float u = s * ( 0.3 + 0.7 * s );
        vec4 c = uContactViewProj * vec4( start + uSunDir * ( u * len ), 1.0 );
        if ( c.w <= 0.0 ) break;
        vec2 quv = c.xy / c.w * 0.5 + 0.5;
        if ( any( lessThan( quv, vec2( 0.0 ) ) ) || any( greaterThan( quv, vec2( 1.0 ) ) ) ) break;
        float diff = c.w - cotDepthToDist( texture2D( tDepth, quv ).x );
        float bias = 0.015 + c.w * 0.003;
        float thick = 0.10 + u * len * 0.45 + c.w * 0.012;
        if ( diff > bias && diff < thick && texture2D( tDiffuse, quv ).a >= ${f(CONTACT_SHADOW_ALPHA_OPAQUE)} ) {
          // an opaque lit occluder (never a grass or leaf card, water or glass), and a wide one: wires and far
          // poles are a few pixels wide and never cast in the cascades — the depth five pixels either side of the
          // hit must belong to the same surface
          float occ = c.w - diff;
          float wide = ${f(CONTACT_SHADOW_WIDTH_M)} + occ * ${f(CONTACT_SHADOW_WIDTH_PER_M)};
          vec2 side = vec2( uInvSize.x * ${f(CONTACT_SHADOW_WIDTH_PX)}, 0.0 );
          float dl = cotDepthToDist( texture2D( tDepth, quv - side ).x );
          float dr = cotDepthToDist( texture2D( tDepth, quv + side ).x );
          if ( abs( dl - occ ) < wide && abs( dr - occ ) < wide ) { hit = u; break; }
        }
      }
      return hit <= 1.0 ? 1.0 - smoothstep( ${f(CONTACT_SHADOW_TAIL_FADE)}, 1.0, hit ) : 0.0;
    }
    // colour multiplier: the pixel's sun share removed where the march finds an occluder
    float cotContactShade( vec2 uv, vec3 P, float dist, float alpha ) {
      float sunVis = cotSunVisOf( alpha );
      if ( sunVis <= 0.02 ) return 1.0; // a card / water / unlit pixel, or already in cascade shadow: no normal taps
      vec3 N = cotNormalAt( uv, P );
      float T = uContactSunLum * max( dot( N, uSunDir ), 0.0 ) * clamp( sunVis, 0.0, 1.0 );
      if ( T <= 1e-3 ) return 1.0;
      float amb = mix( uContactAmb.y, uContactAmb.x, N.y * 0.5 + 0.5 ) + uContactAmb.z
        + uContactAmb.w * max( dot( N, uContactFillDir ), 0.0 );
      float share = T / ( T + amb );
      float occ = cotContactOcclusion( P, N, dist )
        * ( 1.0 - smoothstep( ${f(CONTACT_SHADOW_RANGE_M - CONTACT_SHADOW_FADE_M)}, ${f(CONTACT_SHADOW_RANGE_M)}, dist ) );
      return 1.0 - occ * share * ${f(CONTACT_SHADOW_STRENGTH)};
    }
`;
