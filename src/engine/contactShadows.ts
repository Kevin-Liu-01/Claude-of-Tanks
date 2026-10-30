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
 * Step table: twelve samples, quadratic spacing in projected distance (dense at the contact, where the seam is).
 * The world-space length grows from 0.55 m at 4 m to 1.4 m at 40 m, bounded to eight scene pixels so the last
 * sample gap stays near one pixel. Fixed half-step sampling needs no noisy per-pixel jitter at that spacing.
 * The term fades out
 * between 65 and 90 m, where the cascades' own penumbra is sub-pixel anyway. Thickness grows along the ray (no
 * long false shadows behind thin or distant objects); the bias grows with distance (no acne on flat ground).
 * The mobile tier and `?fx=off` never enter the block (uContact 0); a preset without the lever likewise.
 *
 * Contact r6 (2026-10-14, the engine-cs lane; the shadow-quality plan's C5: "the binary contact march cuts a hard
 * pixel-aligned rim inside the soft CSM penumbra", and crawls on gravel and cobbles). Three changes:
 *   - the march closes only the seam the cascades leave at a contact — their depth bias plus one cascade-0 texel, which
 *     the shadow pass publishes as lightRig.contactSeamM (CONTACT_SHADOW_SEAM_M, High's estimate, until it does) — at
 *     least CONTACT_SHADOW_MIN_PX pixels (a far pixel's seam is sub-pixel), at most CONTACT_SHADOW_MAX_SCREEN_PX: never
 *     a screen-space shadow of its own beside the cascades' (it was 0.55–1.4 m);
 *   - a soft hit: an occluded rung weighs by how far behind the depth surface it lies against the thickness window
 *     (contactShadowSoftHit), the march keeping the strongest rung, so a rung that only grazes a pebble's depth reads
 *     faint, not a whole pixel of shadow;
 *   - the term fades inside the cascades' own penumbra (0.05 < v_csm < 0.95): the alpha carries v_csm × the cloud's share
 *     (lighting.ts folds vCotCloudSun into cotSunVis), so the pass divides by the cloud's share at the pixel's world
 *     position (cloudShadeMap.ts cotCloudSun); under a cloud deeper than CONTACT_SHADOW_CLOUD_MIN it keeps main's law.
 */
import * as THREE from 'three';
import { SCENE_ALPHA_OPAQUE, SCENE_ALPHA_READ_GLSL, decodeSceneSunVis } from './sceneAlpha.ts';
import { CLOUD_SHADE_PARS_GLSL, type CloudShadeUniforms } from './cloudShadeMap.ts';
import { lightTune } from './lightModelCore.ts';

export const CONTACT_SHADOW_STEPS = 12;
export const CONTACT_SHADOW_MAX_SCREEN_PX = 8;
/** (contact r6) The cascades' residual seam at a contact (m) while the shadow pass publishes none: High's bias plus one
 * cascade-0 texel. */
export const CONTACT_SHADOW_SEAM_M = 0.15;
/** (contact r6) The march spans at least this many scene pixels (a far pixel's seam is sub-pixel). */
export const CONTACT_SHADOW_MIN_PX = 2;
/** (contact r6) The soft hit: a rung's weight rises over this share of the window from the bias to the thickness and
 * falls over the last CONTACT_SHADOW_SOFT_FALL of it. */
export const CONTACT_SHADOW_SOFT_RISE = 0.35;
export const CONTACT_SHADOW_SOFT_FALL = 0.25;
/** (contact r6) The cascades' penumbra the term fades inside (their visibility v_csm), and the cloud share under which
 * v_csm is not decoded (main's law there). */
export const CONTACT_SHADOW_PENUMBRA = Object.freeze([0.05, 0.95] as const);
export const CONTACT_SHADOW_CLOUD_MIN = 0.15;
export const CONTACT_SHADOW_RANGE_M = 90;
export const CONTACT_SHADOW_FADE_M = 25;
/** How much of the sun share an occluded pixel loses (1 = the full sun term). */
export const CONTACT_SHADOW_STRENGTH = 0.92;
/** The last part of the ray fades so the shadow has no cut-off line at its length. */
export const CONTACT_SHADOW_TAIL_FADE = 0.55;
/** Scene-target alpha at or above this decodes as 2 + CSM sun visibility of an opaque lit surface. */
export const CONTACT_SHADOW_ALPHA_OPAQUE = SCENE_ALPHA_OPAQUE;
/**
 * An occluder counts only when the depth this many pixels either side of the hit lies on the same surface (within
 * WIDTH_M + WIDTH_PER_M × distance): wires, rails and far poles — a few pixels wide, never cascade casters — are
 * skipped, hulls, tracks, wheels, walls and rocks pass (an oblique face changes depth by ~0.1 m over 5 px at 10 m).
 */
export const CONTACT_SHADOW_WIDTH_PX = 5;
export const CONTACT_SHADOW_WIDTH_M = 0.12;
export const CONTACT_SHADOW_WIDTH_PER_M = 0.012;
/**
 * 2026-10-10 (contact round 4, the costland lane; both critics on wave 340: "the gaps between the road wheels drop to
 * near-black"): `cotNormalAtGuarded`'s break. An axis whose nearer neighbour still lies farther than this many pixels'
 * footprint (stretched by the view's grazing over a surface facing the given up) has left the surface on both sides — a
 * ground pixel seen through a narrow gap between road wheels, both neighbours a wheel a metre nearer — and the up stands
 * in for the broken normal, which read the sunlit ground in a gap as all ambient (its sun term from a sideways normal).
 */
export const CONTACT_NORMAL_BREAK_PX = 6;

/**
 * The CPU twin of `cotNormalAtGuarded`'s test: whether the nearer neighbour on an axis (`nearestM`, metres) lies past
 * the break for a pixel `distanceM` deep (view depth) whose view ray meets the up at `grazingCos` (|dot(ray, up)|),
 * one pixel spanning `pixelM1` metres at 1 m (2 · tan(fovY / 2) / height).
 */
export function contactNormalBroken(nearestM: number, distanceM: number, grazingCos: number, pixelM1: number): boolean {
  return nearestM > CONTACT_NORMAL_BREAK_PX * pixelM1 * distanceM / Math.max(grazingCos, 0.05);
}

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

/** (contact r6) March length in metres: the cascades' residual seam (lightRig.contactSeamM, else CONTACT_SHADOW_SEAM_M),
 * whatever the receiver's distance (the pixel floor and the screen cap apply in contactShadowBoundedLength). */
export function contactShadowMarchLength(_distance: number, seamM = CONTACT_SHADOW_SEAM_M): number {
  return Math.max(0, seamM);
}

/** Exact perspective bound: projected distance(t) = pixelSlope*t/(startW + directionW*t); (contact r6) at least
 * CONTACT_SHADOW_MIN_PX pixels, at most CONTACT_SHADOW_MAX_SCREEN_PX. */
export function contactShadowBoundedLength(
  worldLength: number, startW: number, directionW: number, pixelSlope: number, nearW: number,
): number {
  if (startW <= nearW) return 0;
  let length = Math.max(0, worldLength);
  const floorDenominator = pixelSlope - CONTACT_SHADOW_MIN_PX * directionW;
  if (floorDenominator > 0) length = Math.max(length, CONTACT_SHADOW_MIN_PX * startW / floorDenominator);
  if (directionW < 0) length = Math.min(length, (startW - nearW) / -directionW);
  const denominator = pixelSlope - CONTACT_SHADOW_MAX_SCREEN_PX * directionW;
  if (denominator > 0) length = Math.min(length, CONTACT_SHADOW_MAX_SCREEN_PX * startW / denominator);
  return length;
}

/** World distance at fraction `u` of the bounded projected ray, rather than its world length. */
export function contactShadowProjectedStep(u: number, length: number, startW: number, directionW: number): number {
  return u * length * startW / (startW + (1 - u) * length * directionW);
}

/** Distance fade: 1 inside the range less the fade band, 0 at the range. */
export function contactShadowRangeFade(distance: number): number {
  return 1 - THREE.MathUtils.smoothstep(distance, CONTACT_SHADOW_RANGE_M - CONTACT_SHADOW_FADE_M, CONTACT_SHADOW_RANGE_M);
}

/** Occlusion strength at an occluded ray parameter (> 1: none): whole, faded over the ray's last part (the tail). */
export function contactShadowOcclusion(hit: number): number {
  if (!(hit <= 1)) return 0;
  return 1 - THREE.MathUtils.smoothstep(hit, CONTACT_SHADOW_TAIL_FADE, 1);
}

/** (contact r6) A rung's soft hit: `diff` how far behind the depth surface it lies, inside the window (bias, thick) —
 * rising over CONTACT_SHADOW_SOFT_RISE of the window, falling over its last CONTACT_SHADOW_SOFT_FALL; 0 outside. */
export function contactShadowSoftHit(diff: number, bias: number, thick: number): number {
  if (!(diff > bias && diff < thick)) return 0;
  const span = thick - bias;
  return THREE.MathUtils.smoothstep(diff, bias, bias + CONTACT_SHADOW_SOFT_RISE * span)
    * (1 - THREE.MathUtils.smoothstep(diff, thick - CONTACT_SHADOW_SOFT_FALL * span, thick));
}

/** (contact r6) The march's occlusion from its rungs (u, soft hit) and the occluder's support: the strongest rung. */
export function contactShadowMarch(rungs: readonly (readonly [number, number])[], support: number): number {
  let best = 0;
  for (const [u, soft] of rungs) {
    if (!(soft > 0)) continue;
    best = Math.max(best, support * soft * contactShadowOcclusion(u));
    if (soft >= 0.99) break;
  }
  return best;
}

/** (contact r6) The fade inside the cascades' penumbra: `sunVis` the alpha's visibility (v_csm × the cloud's share),
 * `cloud` the cloud's share at the pixel; 1 (main's law) under a cloud deeper than CONTACT_SHADOW_CLOUD_MIN. */
export function contactShadowPenumbraFade(sunVis: number, cloud: number): number {
  if (!(cloud >= CONTACT_SHADOW_CLOUD_MIN)) return 1;
  return THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(sunVis / cloud, 0, 1), CONTACT_SHADOW_PENUMBRA[0], CONTACT_SHADOW_PENUMBRA[1]);
}

/** Reject shallow folds of one smooth surface, while retaining corners and raised objects. */
export function contactShadowSurfaceSupport(normalDot: number, planeHeight: number): number {
  return Math.max(1 - THREE.MathUtils.smoothstep(normalDot, 0.35, 0.65),
    THREE.MathUtils.smoothstep(planeHeight, 0.3, 0.5));
}

interface ContactShadowAmbient {
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
/**
 * Decode the scene target's alpha: the CSM sun visibility of an opaque lit surface, or -1 for anything else. A
 * vehicle pixel carries 4 + its visibility (vehicleOcclusion.ts), every other opaque lit pixel 2 + its visibility.
 */
export function contactShadowSunVisibility(alpha: number): number {
  // (2026-10-14) a snowy terrain pixel writes its visibility in the snow band (sceneAlpha.ts): one decode for every reader
  return decodeSceneSunVis(alpha);
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

interface ContactShadowUniforms extends CloudShadeUniforms {
  uContact: THREE.IUniform<number>;
  uContactViewProj: THREE.IUniform<THREE.Matrix4>;
  uContactAmb: THREE.IUniform<THREE.Vector4>;
  uContactFillDir: THREE.IUniform<THREE.Vector3>;
  uContactSunLum: THREE.IUniform<number>;
  /** (contact r6) The march's length (m): the cascades' residual seam; negative: main's 0.55-1.4 m ramp (the A/B lever). */
  uContactSeam: THREE.IUniform<number>;
  /** (contact r6) The soft hit and the penumbra fade, on (1) or main's law (0) — QA: __LIGHT_TUNE.CONTACT_R6 = 0. */
  uContactR6: THREE.IUniform<number>;
}

export function createContactShadowUniforms(): ContactShadowUniforms {
  return {
    uContact: { value: 0 },
    uContactViewProj: { value: new THREE.Matrix4() },
    uContactAmb: { value: new THREE.Vector4(0.3, 0.2, 0.3, 0.3) },
    uContactFillDir: { value: new THREE.Vector3(0, 1, 0) },
    uContactSunLum: { value: 4 },
    uContactSeam: { value: CONTACT_SHADOW_SEAM_M },
    uContactR6: { value: 1 },
    // (contact r6) the lit materials' cloud share (cloudShadeMap.ts), copied each frame: the penumbra fade divides it out
    tCotCloudShade: { value: null },
    uCotCloudShade: { value: new THREE.Vector4(0, 0, 1 / 12000, 0) },
    uCotCloudSun: { value: new THREE.Vector4(0, 1, 0, 1400) },
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
  /** 2026-10-01: the sky's diffuse gain over the environment (lightModel.ts; 1 on the legacy rig). */
  envDiffuseGain?: number;
  /** 2026-10-01: the legacy disc's shadowless fill folded into the environment (0 on the grounded model's disc-less bake). */
  envDiscFill?: number;
  /**
   * 2026-10-14 (SKY shadows r2a; the ENGINE lane's contact r6 contract): the residual seam the cascades leave at a contact,
   * in metres — cascade 0's depth bias along the sun plus one of its texels — kept current on every preset or cascade
   * table change. Contact shadows march this far (r6 falls back to 0.15 m without it).
   */
  readonly contactSeamM?: number;
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
  /** The vehicle occlusion (vehicleOcclusion.ts) reads the same sun / ambient uniforms with the march off. */
  ambientNeeded = enabled,
): void {
  const u = uniforms as ContactShadowUniforms;
  u.uContact.value = enabled ? 1 : 0;
  if (!enabled && !ambientNeeded) return;
  u.uContactViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  // (contact r6) the cloud's share the lit materials folded into the alpha (off without the map)
  const cloud = scene.userData.cloudShadeUniforms as CloudShadeUniforms | undefined;
  if (u.uCotCloudShade && u.tCotCloudShade && u.uCotCloudSun) {
    if (cloud) {
      u.tCotCloudShade.value = cloud.tCotCloudShade.value;
      u.uCotCloudShade.value.copy(cloud.uCotCloudShade.value);
      u.uCotCloudSun.value.copy(cloud.uCotCloudSun.value);
    } else u.uCotCloudShade.value.w = 0;
  }
  const rig = scene.userData.lightRig as PublishedLightRig | undefined;
  // (QA: __LIGHT_TUNE.CONTACT_R6 = 0 restores main's march for an A/B frame: its length ramp, the binary hit, no fade)
  const r6 = lightTune('CONTACT_R6', 1) > 0 ? 1 : 0;
  if (u.uContactSeam) u.uContactSeam.value = r6 ? Math.max(0, rig?.contactSeamM ?? CONTACT_SHADOW_SEAM_M) : -1;
  if (u.uContactR6) u.uContactR6.value = r6;
  if (!rig) return;
  const skyIrradiance = scene.userData.skyIrradiance as THREE.Color | undefined;
  const envIntensity = typeof scene.environmentIntensity === 'number' ? scene.environmentIntensity : 1;
  const envLum = ((skyIrradiance ? luma(skyIrradiance) : 0.35) * (rig.envDiffuseGain ?? 1) + (rig.envDiscFill ?? ENV_DISC_FILL))
    * envIntensity;
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
 * uCamRight, uCamUp, uCamFwd, uTan, uTanShift, uInvSize, uSunDir) and provides `cotContactShade(uv, P, ray, viewZ, alpha)`
 * → the multiplier for the pixel's colour (1 = untouched).
 */
export const CONTACT_SHADOW_GLSL = /* glsl */ `
    // round 69: screen-space contact shadows (contactShadows.ts)
    uniform float uContact;
    uniform mat4 uContactViewProj;
    uniform vec4 uContactAmb;
    uniform vec3 uContactFillDir;
    uniform float uContactSunLum;
    uniform float uContactSeam;
    uniform float uContactR6;
${CLOUD_SHADE_PARS_GLSL}
    float cotDepthToDist( float d ) {
      return ( uNear * uFar ) / ( uFar - ( uFar - uNear ) * d );
    }
    vec3 cotWorldAtDepth( vec2 uv, float dist ) {
      vec3 r = normalize( uCamFwd
        + uCamRight * ( ( uv.x * 2.0 - 1.0 ) * uTan.x + uTanShift.x )
        + uCamUp * ( ( uv.y * 2.0 - 1.0 ) * uTan.y + uTanShift.y ) );
      return uCamPos + r * ( dist / max( dot( r, uCamFwd ), 0.05 ) );
    }
    vec3 cotWorldAt( vec2 uv ) {
      return cotWorldAtDepth( uv, cotDepthToDist( texture2D( tDepth, uv ).x ) );
    }
${SCENE_ALPHA_READ_GLSL}    // best-pair normal from the depth neighbours (the smaller step on each axis stays on the surface)
    vec3 cotNormalAt( vec2 uv, vec3 P ) {
      vec3 px1 = cotWorldAt( uv + vec2( uInvSize.x, 0.0 ) );
      vec3 px0 = cotWorldAt( uv - vec2( uInvSize.x, 0.0 ) );
      vec3 py1 = cotWorldAt( uv + vec2( 0.0, uInvSize.y ) );
      vec3 py0 = cotWorldAt( uv - vec2( 0.0, uInvSize.y ) );
      vec3 dx = ( distance( px1, P ) < distance( px0, P ) ) ? px1 - P : P - px0;
      vec3 dy = ( distance( py1, P ) < distance( py0, P ) ) ? py1 - P : P - py0;
      return normalize( cross( dx, dy ) );
    }
    // contact round 4 (2026-10-10, contactShadows.ts CONTACT_NORMAL_BREAK_PX): the best-pair normal, but where both
    // neighbours on an axis leave the surface the given up (a hull's) stands in — the ground seen through a narrow gap
    // between road wheels kept a sideways normal and lost its sun term
    vec3 cotNormalAtGuarded( vec2 uv, vec3 P, vec3 up, float dist ) {
      vec3 px1 = cotWorldAt( uv + vec2( uInvSize.x, 0.0 ) );
      vec3 px0 = cotWorldAt( uv - vec2( uInvSize.x, 0.0 ) );
      vec3 py1 = cotWorldAt( uv + vec2( 0.0, uInvSize.y ) );
      vec3 py0 = cotWorldAt( uv - vec2( 0.0, uInvSize.y ) );
      float lx1 = distance( px1, P ), lx0 = distance( px0, P ), ly1 = distance( py1, P ), ly0 = distance( py0, P );
      float brk = ${f(CONTACT_NORMAL_BREAK_PX)} * 2.0 * uTan.y * uInvSize.y * dist
        / max( abs( dot( normalize( P - uCamPos ), up ) ), 0.05 );
      if ( min( lx1, lx0 ) > brk || min( ly1, ly0 ) > brk ) return up;
      vec3 dx = lx1 < lx0 ? px1 - P : P - px0;
      vec3 dy = ly1 < ly0 ? py1 - P : P - py0;
      return normalize( cross( dx, dy ) );
    }
    float cotContactOcclusion( vec3 P, vec3 N, float dist ) {
      // (contact r6) the cascades' residual seam, at least ${CONTACT_SHADOW_MIN_PX} pixels, at most ${CONTACT_SHADOW_MAX_SCREEN_PX}
      // (QA lever: a negative seam is main's 0.55-1.4 m ramp, its eight-pixel cap alone)
      float len = uContactSeam >= 0.0 ? uContactSeam : mix( 0.5500, 1.4000, smoothstep( 4.0000, 40.0000, dist ) );
      vec3 start = P + N * ( 0.012 + dist * 0.0025 );
      vec4 rayStart = uContactViewProj * vec4( start, 1.0 );
      vec4 rayDir = uContactViewProj * vec4( uSunDir, 0.0 );
      if ( rayStart.w <= uNear ) return 0.0;
      // Exact projected length, including perspective foreshortening and rays approaching the eye.
      float pixelSlope = length( ( rayDir.xy - rayStart.xy * ( rayDir.w / rayStart.w ) ) * 0.5 / uInvSize );
      float floorDenominator = pixelSlope - ${f(CONTACT_SHADOW_MIN_PX)} * rayDir.w;
      if ( floorDenominator > 0.0 && uContactSeam >= 0.0 ) len = max( len, ${f(CONTACT_SHADOW_MIN_PX)} * rayStart.w / floorDenominator );
      if ( rayDir.w < 0.0 ) len = min( len, ( rayStart.w - uNear ) / -rayDir.w );
      float capDenominator = pixelSlope - ${f(CONTACT_SHADOW_MAX_SCREEN_PX)} * rayDir.w;
      if ( capDenominator > 0.0 ) len = min( len, ${f(CONTACT_SHADOW_MAX_SCREEN_PX)} * rayStart.w / capDenominator );
      float best = 0.0;
      float support = -1.0;
      for ( int i = 0; i < ${CONTACT_SHADOW_STEPS}; i++ ) {
        float s = ( float( i ) + 0.5 ) / ${f(CONTACT_SHADOW_STEPS)};
        float u = s * ( 0.3 + 0.7 * s );
        // Quadratic spacing in screen pixels keeps every gap <= 1.06 px, even under strong perspective.
        float rayDistance = u * len * rayStart.w / ( rayStart.w + ( 1.0 - u ) * len * rayDir.w );
        vec4 c = rayStart + rayDir * rayDistance;
        if ( c.w <= 0.0 ) break;
        vec2 quv = c.xy / c.w * 0.5 + 0.5;
        if ( any( lessThan( quv, vec2( 0.0 ) ) ) || any( greaterThan( quv, vec2( 1.0 ) ) ) ) break;
        float diff = c.w - cotDepthToDist( texture2D( tDepth, quv ).x );
        float bias = 0.015 + c.w * 0.003;
        float thick = 0.10 + rayDistance * 0.45 + c.w * 0.012;
        if ( diff > bias && diff < thick && texture2D( tDiffuse, quv ).a >= ${f(CONTACT_SHADOW_ALPHA_OPAQUE)} ) {
          if ( support < 0.0 ) {
            // an opaque lit occluder (never a grass or leaf card, water or glass), and a wide one: wires and far
            // poles are a few pixels wide and never cast in the cascades — the depth five pixels either side of the
            // hit must belong to the same surface (tested once, at the first such rung; a failed one tests again)
            float occ = c.w - diff;
            float wide = ${f(CONTACT_SHADOW_WIDTH_M)} + occ * ${f(CONTACT_SHADOW_WIDTH_PER_M)};
            vec2 side = vec2( uInvSize.x * ${f(CONTACT_SHADOW_WIDTH_PX)}, 0.0 );
            float dl = cotDepthToDist( texture2D( tDepth, quv - side ).x );
            float dr = cotDepthToDist( texture2D( tDepth, quv + side ).x );
            if ( abs( dl - occ ) < wide && abs( dr - occ ) < wide ) {
              // Smooth terrain is tessellated into flat depth triangles. Letting
              // neighbouring shallow faces cast at full strength exposed their
              // diagonal edges as false ledges. A contact needs a distinct corner
              // or an object raised above the receiver plane. Only confirmed wide
              // hits pay for these four normal taps; the ordinary march is unchanged.
              vec3 Q = cotWorldAtDepth( quv, occ );
              vec3 QN = cotNormalAt( quv, Q );
              float contrast = max( 1.0 - smoothstep( 0.35, 0.65, dot( N, QN ) ),
                smoothstep( 0.3, 0.5, dot( Q - P, N ) ) );
              if ( contrast > 0.01 ) support = contrast;
            }
          }
          if ( support > 0.0 ) {
            // (contact r6) the soft hit: by how far behind the surface the rung lies in its window (contactShadowSoftHit)
            float span = thick - bias;
            float soft = uContactR6 < 0.5 ? 1.0 : smoothstep( bias, bias + ${f(CONTACT_SHADOW_SOFT_RISE)} * span, diff )
              * ( 1.0 - smoothstep( thick - ${f(CONTACT_SHADOW_SOFT_FALL)} * span, thick, diff ) );
            best = max( best, support * soft * ( 1.0 - smoothstep( ${f(CONTACT_SHADOW_TAIL_FADE)}, 1.0, u ) ) );
            if ( soft >= 0.99 ) break;
          }
        }
      }
      return best;
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
      // (contact r6) inside the cascades' own penumbra the term fades: v_csm is the alpha's visibility over the cloud's
      // share at this point (contactShadowPenumbraFade); under a deep cloud, main's law
      float cloud = cotCloudSun( P );
      float penumbra = cloud < ${f(CONTACT_SHADOW_CLOUD_MIN)} || uContactR6 < 0.5 ? 1.0
        : smoothstep( ${f(CONTACT_SHADOW_PENUMBRA[0])}, ${f(CONTACT_SHADOW_PENUMBRA[1])}, clamp( sunVis / cloud, 0.0, 1.0 ) );
      float occ = cotContactOcclusion( P, N, dist ) * penumbra
        * ( 1.0 - smoothstep( ${f(CONTACT_SHADOW_RANGE_M - CONTACT_SHADOW_FADE_M)}, ${f(CONTACT_SHADOW_RANGE_M)}, dist ) );
      return 1.0 - occ * share * ${f(CONTACT_SHADOW_STRENGTH)};
    }
`;
