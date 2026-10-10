/**
 * vehicleOcclusion.ts — owner 2026-10-02 ("shadows on tanks make them look a lil flat"): cavity occlusion for
 * vehicle pixels only, inside the aerial pass.
 *
 * In shade a tank receives only fill light (hemisphere, environment, the anti-sun fill, the ground bounce and the
 * vehicle readability fill, materials.ts), and nothing in that stack knows the hull's own concavities: the gap under
 * a turret bustle, the hull face behind a side skirt, the road-wheel bays, the turret ring, the mantlet cheeks and
 * the track run at the ground all receive the light an open plate does, so the shaded side reads as one flat tone.
 * Scene-wide GTAO is off on every tier by the owner's choice (2026-09-28, quality.ts: "the clean AO-free
 * presentation"), for its speckled crevice wash over terrain and foliage — so this term never touches anything but
 * a vehicle, and it uses a fixed sampling pattern with no per-pixel noise.
 *
 * The vehicle materials tag their pixels: the lit materials write 2 + their CSM sun visibility into the scene
 * target's alpha (lighting.ts, contactShadows.ts), and the vehicle readability hook adds 2 more, so a vehicle pixel
 * decodes as 4 + v (`VEHICLE_ALPHA_MIN` and above). For such a pixel within range the pass reconstructs its
 * position and normal from depth and walks `VEHICLE_OCCLUSION_DIRECTIONS` fixed screen directions, each
 * `VEHICLE_OCCLUSION_STEPS` steps out to a world radius of `VEHICLE_OCCLUSION_RADIUS_M` (bounded in pixels): the
 * highest opaque surface above the pixel's tangent plane in each direction (horizon-based, with a small bias so a
 * plate never shades itself and a distance falloff so far-behind surfaces do not count) gives that direction's
 * occlusion, and their mean is the pixel's cavity term. Grass and leaf cards (alpha below 1.5) never occlude.
 *
 * The term dims only the pixel's ambient share, like the contact shadows dim only its sun share: with the sun term
 * T and the ambient A the rig gives the normal (contactShadows.ts), colour · (1 − occ · strength · A / (T + A)). A
 * plate in shade (T = 0) takes the full cavity darkening; a sunlit plate keeps its sunlight. The term fades out
 * between `VEHICLE_OCCLUSION_RANGE_M − VEHICLE_OCCLUSION_FADE_M` and the range, where a hull is a few dozen pixels.
 * `vehicleCavityFromHorizons` and the constants are the CPU twin the receipt pins against the GLSL.
 */

/** A vehicle pixel's scene-target alpha is 4 + its sun visibility: at or above this it decodes as a vehicle. */
export const VEHICLE_ALPHA_MIN = 3.5;
/** What the vehicle hook adds to the lit materials' 2 + v (materials.ts). */
export const VEHICLE_ALPHA_TAG = 2;
export const VEHICLE_OCCLUSION_DIRECTIONS = 8;
export const VEHICLE_OCCLUSION_STEPS = 4;
/** World search radius: the depth of a bustle overhang, a skirt standoff or a road-wheel bay. */
export const VEHICLE_OCCLUSION_RADIUS_M = 0.8;
export const VEHICLE_OCCLUSION_MIN_PX = 3;
export const VEHICLE_OCCLUSION_MAX_PX = 56;
/** Sine of the horizon elevation below which a surface counts as the pixel's own plate. */
export const VEHICLE_OCCLUSION_BIAS = 0.12;
/** How much of the ambient share a fully occluded pixel loses. */
export const VEHICLE_OCCLUSION_STRENGTH = 0.8;
export const VEHICLE_OCCLUSION_RANGE_M = 120;
export const VEHICLE_OCCLUSION_FADE_M = 40;

/** Decode the scene alpha as a vehicle pixel's sun visibility, or -1 when it is not a vehicle pixel. */
export function vehicleSunVisibility(alpha: number): number {
  return alpha >= VEHICLE_ALPHA_MIN ? Math.min(1, Math.max(0, alpha - 4)) : -1;
}

/** Ray parameter (0..1 of the radius) of step `s`: denser near the pixel, where the cavity edges are. */
export function vehicleOcclusionStep(step: number, steps = VEHICLE_OCCLUSION_STEPS): number {
  const t = (step + 1) / steps;
  return t * (0.35 + 0.65 * t);
}

/** Search radius in screen pixels for a pixel at `distance` metres, `pixelsPerMetreAt1m` = 0.5 · height / tan(fovY/2). */
export function vehicleOcclusionRadiusPx(distance: number, pixelsPerMetreAt1m: number): number {
  const px = pixelsPerMetreAt1m * VEHICLE_OCCLUSION_RADIUS_M / Math.max(distance, 1e-3);
  return Math.min(VEHICLE_OCCLUSION_MAX_PX, Math.max(VEHICLE_OCCLUSION_MIN_PX, px));
}

/** Falloff of an occluder at `length` metres from the pixel for the world radius actually searched. */
export function vehicleOcclusionFalloff(length: number, radius: number): number {
  const a = 0.5 * radius, b = radius;
  if (length <= a) return 1;
  if (length >= b) return 0;
  const x = (length - a) / (b - a);
  return 1 - x * x * (3 - 2 * x);
}

/**
 * Cavity term from per-direction horizons: each entry is that direction's best (sine of elevation, falloff) pair
 * reduced to `max((h − bias) · w)`, normalised by (1 − bias); the term is the clamped mean.
 */
export function vehicleCavityFromHorizons(bestPerDirection: readonly number[]): number {
  if (!bestPerDirection.length) return 0;
  let sum = 0;
  for (const best of bestPerDirection) sum += Math.min(1, Math.max(0, best / (1 - VEHICLE_OCCLUSION_BIAS)));
  return sum / bestPerDirection.length;
}

/** Distance fade: 1 inside the range less the fade band, 0 at the range. */
export function vehicleOcclusionRangeFade(distance: number): number {
  const a = VEHICLE_OCCLUSION_RANGE_M - VEHICLE_OCCLUSION_FADE_M, b = VEHICLE_OCCLUSION_RANGE_M;
  if (distance <= a) return 1;
  if (distance >= b) return 0;
  const x = (distance - a) / (b - a);
  return 1 - x * x * (3 - 2 * x);
}

/**
 * Fleet lane 2026-10-08 (the blind critics on every tank close-up: "a single hard source with no contact occlusion"):
 * the share of a lit pixel's sunlight the cavity term may also dim. 0 keeps the physical ambient-only law; above it a
 * crevice in sunlight (the gap under a bin, between reactive bricks, behind a skirt) darkens too, as the eye expects of
 * a hull's small concavities. The strength and this share are uniforms (`uVehOccStrength`, `uVehOccDirect`), so a
 * capture can compare them on one frame; the constants are their shipped values.
 */
export const VEHICLE_OCCLUSION_DIRECT_SHARE = 0;

/** The colour multiplier for a vehicle pixel with cavity term `occ` and sun share `sunShare` (T / (T + A)). */
export function vehicleOcclusionShade(occ: number, sunShare: number, rangeFade = 1,
  strength = VEHICLE_OCCLUSION_STRENGTH, directShare = VEHICLE_OCCLUSION_DIRECT_SHARE): number {
  const o = Math.min(1, Math.max(0, occ)) * rangeFade;
  const amb = 1 - Math.min(1, Math.max(0, sunShare));
  return 1 - o * strength * (amb + (1 - amb) * directShare);
}

export interface VehicleOcclusionUniforms {
  uVehOcc: { value: number };
  uVehOccStrength: { value: number };
  uVehOccDirect: { value: number };
}

export function createVehicleOcclusionUniforms(): VehicleOcclusionUniforms {
  return {
    uVehOcc: { value: 0 },
    uVehOccStrength: { value: VEHICLE_OCCLUSION_STRENGTH },
    uVehOccDirect: { value: VEHICLE_OCCLUSION_DIRECT_SHARE },
  };
}

const f = (x: number): string => x.toFixed(4);

/**
 * The block the aerial fragment includes AFTER `CONTACT_SHADOW_GLSL` (it uses that block's cotWorldAt, cotNormalAt,
 * cotDepthToDist and ambient uniforms, and the pass's tDiffuse, tDepth, uTan, uInvSize, uSunDir). Provides
 * `cotVehicleOcclusionShade(uv, P, dist, alpha)` → the multiplier for the pixel's colour (1 = untouched).
 */
export const VEHICLE_OCCLUSION_GLSL = /* glsl */ `
    // owner 2026-10-02: vehicle-only cavity occlusion (vehicleOcclusion.ts)
    uniform float uVehOcc;
    uniform float uVehOccStrength;
    uniform float uVehOccDirect;
    float cotVehicleCavity( vec2 uv, vec3 P, vec3 N, float dist ) {
      float pxPerM = 0.5 / max( uTan.y * dist * uInvSize.y, 1e-6 );
      float rPx = clamp( pxPerM * ${f(VEHICLE_OCCLUSION_RADIUS_M)}, ${f(VEHICLE_OCCLUSION_MIN_PX)}, ${f(VEHICLE_OCCLUSION_MAX_PX)} );
      float rM = rPx / pxPerM;
      float sum = 0.0;
      for ( int d = 0; d < ${VEHICLE_OCCLUSION_DIRECTIONS}; d++ ) {
        float ang = ( float( d ) + 0.5 ) * ${f((Math.PI * 2) / VEHICLE_OCCLUSION_DIRECTIONS)};
        vec2 stepUv = vec2( cos( ang ), sin( ang ) ) * uInvSize * rPx;
        float best = 0.0;
        for ( int s = 0; s < ${VEHICLE_OCCLUSION_STEPS}; s++ ) {
          float t = ( float( s ) + 1.0 ) / ${f(VEHICLE_OCCLUSION_STEPS)};
          t *= 0.35 + 0.65 * t;
          vec2 q = uv + stepUv * t;
          if ( any( lessThan( q, vec2( 0.0 ) ) ) || any( greaterThan( q, vec2( 1.0 ) ) ) ) break;
          vec3 Q = cotWorldAt( q );
          vec3 V = Q - P;
          float l = length( V );
          if ( l < 1e-4 ) continue;
          float w = 1.0 - smoothstep( 0.5 * rM, rM, l );
          float h = ( dot( V, N ) / l - ${f(VEHICLE_OCCLUSION_BIAS)} ) * w;
          // only an opaque lit surface occludes: never a grass or leaf card, water or glass
          if ( h > best && texture2D( tDiffuse, q ).a >= 1.5 ) best = h;
        }
        sum += clamp( best / ${f(1 - VEHICLE_OCCLUSION_BIAS)}, 0.0, 1.0 );
      }
      return sum / ${f(VEHICLE_OCCLUSION_DIRECTIONS)};
    }
    float cotVehicleOcclusionShade( vec2 uv, vec3 P, float dist, float alpha ) {
      if ( alpha < ${f(VEHICLE_ALPHA_MIN)} ) return 1.0;
      float sunVis = clamp( alpha - 4.0, 0.0, 1.0 );
      vec3 N = cotNormalAt( uv, P );
      float T = uContactSunLum * max( dot( N, uSunDir ), 0.0 ) * sunVis;
      float amb = mix( uContactAmb.y, uContactAmb.x, N.y * 0.5 + 0.5 ) + uContactAmb.z
        + uContactAmb.w * max( dot( N, uContactFillDir ), 0.0 );
      float ambShare = amb / max( T + amb, 1e-4 );
      float fade = 1.0 - smoothstep( ${f(VEHICLE_OCCLUSION_RANGE_M - VEHICLE_OCCLUSION_FADE_M)}, ${f(VEHICLE_OCCLUSION_RANGE_M)}, dist );
      return 1.0 - cotVehicleCavity( uv, P, N, dist ) * fade * uVehOccStrength * mix( ambShare, 1.0, uVehOccDirect );
    }
`;
