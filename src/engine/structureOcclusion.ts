/**
 * structureOcclusion.ts — 2026-10-10 (the shadows lane, overhaul round r4; the gauntlet on Steinburg: "no ambient occlusion
 * in door and window reveals"; the owner: "also completely overhaul and improve the shadow system").
 *
 * Cavity occlusion for structure pixels only — walls, roofs, timber, brick, canvas, metal sheds — inside the aerial pass,
 * the vehicles' own method (vehicleOcclusion.ts) at a structure's scale. Scene-wide GTAO stays off on every tier by the
 * owner's choice (2026-09-28: its "speckled crevice wash over terrain and foliage"), so this term never touches the
 * ground, the grass, a crown or a stone: only the props' structure materials tag their pixels (props.ts sets
 * material.userData.cotStructurePixel; lighting.ts setupShadowMaterial gives it the COT_STRUCTURE_PIXEL define, under which
 * the opaque chunk adds STRUCTURE_ALPHA_TAG to the lit materials' 2 + sun visibility in the scene target's alpha, so a
 * structure pixel decodes as 6 + v, at or over STRUCTURE_ALPHA_MIN).
 * The ground at a structure's foot is the structure ground occlusion's (r1, structureGroundOcclusion.ts): one owner per
 * pixel, nothing stacks.
 *
 * The law (the vehicles' horizon search, a fixed pattern, no per-pixel noise: the game runs without TAA): from the pixel's
 * position and depth normal, STRUCTURE_OCCLUSION_DIRECTIONS fixed screen directions, each STRUCTURE_OCCLUSION_STEPS steps
 * out to STRUCTURE_OCCLUSION_RADIUS_M (bounded in pixels); the highest opaque surface over the pixel's tangent plane in
 * each direction (a bias so a face never shades itself, a falloff so a far-behind surface never counts) gives that
 * direction's occlusion, and the mean is the cavity term. It dims only the ambient share, colour ·
 * (1 − occ · strength · A / (T + A)): a reveal in shade darkens, a sunlit face keeps its sun. The radius is a door or
 * window reveal's depth and an eave's overhang; a wall's planar face reads nothing (its horizon is its own plane).
 * The tiers: Ultra and High (quality.ts `structureOcclusion`, under the cavity lever `?fx=cavity`); the term fades out
 * between STRUCTURE_OCCLUSION_RANGE_M − STRUCTURE_OCCLUSION_FADE_M and the range.
 */
import { VEHICLE_ALPHA_MIN } from './vehicleOcclusion.ts';

/** What a structure material adds to the lit materials' 2 + v: a structure pixel's alpha is 6 + v. */
export const STRUCTURE_ALPHA_TAG = 4;
/** At or over this the scene alpha decodes as a structure pixel. */
export const STRUCTURE_ALPHA_MIN = 5.5;
export const STRUCTURE_OCCLUSION_DIRECTIONS = 8;
export const STRUCTURE_OCCLUSION_STEPS = 4;
/** World search radius: a door or window reveal, an eave, a porch roof's soffit. */
export const STRUCTURE_OCCLUSION_RADIUS_M = 0.6;
export const STRUCTURE_OCCLUSION_MIN_PX = 3;
export const STRUCTURE_OCCLUSION_MAX_PX = 48;
/** Sine of the horizon elevation below which a surface counts as the pixel's own face. */
export const STRUCTURE_OCCLUSION_BIAS = 0.15;
/** How much of the ambient share a fully occluded pixel loses. */
export const STRUCTURE_OCCLUSION_STRENGTH = 0.55;
export const STRUCTURE_OCCLUSION_RANGE_M = 110;
export const STRUCTURE_OCCLUSION_FADE_M = 35;

/** The props surface kinds that are not structures: ground-like stone and mud, poles, glass and the props' vehicles. */
export const STRUCTURE_OCCLUSION_EXCLUDED_KINDS: ReadonlySet<string> = new Set([
  'rock', 'fieldStone', 'fieldMud', 'ballast', 'pole', 'glass', 'vehicle',
]);

/** Decode the scene alpha: 'structure' (6 + v), 'vehicle' (4 + v), 'opaque' (2 + v) or 'card' (no sun state). */
export function sceneAlphaClass(alpha: number): 'structure' | 'vehicle' | 'opaque' | 'card' {
  if (alpha >= STRUCTURE_ALPHA_MIN) return 'structure';
  if (alpha >= VEHICLE_ALPHA_MIN) return 'vehicle';
  return alpha >= 1.5 ? 'opaque' : 'card';
}

/** Cavity term from per-direction best (biased, weighted) horizons; the vehicles' normalisation at this bias. */
export function structureCavityFromHorizons(bestPerDirection: readonly number[]): number {
  if (!bestPerDirection.length) return 0;
  let sum = 0;
  for (const best of bestPerDirection) sum += Math.min(1, Math.max(0, best / (1 - STRUCTURE_OCCLUSION_BIAS)));
  return sum / bestPerDirection.length;
}

/** The colour multiplier for a structure pixel with cavity term `occ` and sun share `sunShare` (T / (T + A)). */
export function structureOcclusionShade(occ: number, sunShare: number, rangeFade = 1, strength = STRUCTURE_OCCLUSION_STRENGTH): number {
  const o = Math.min(1, Math.max(0, occ)) * Math.min(1, Math.max(0, rangeFade));
  return 1 - o * strength * (1 - Math.min(1, Math.max(0, sunShare)));
}

export interface StructureOcclusionUniforms {
  uStructOcc: { value: number };
  uStructOccStrength: { value: number };
}

export function createStructureOcclusionUniforms(): StructureOcclusionUniforms {
  return { uStructOcc: { value: 0 }, uStructOccStrength: { value: STRUCTURE_OCCLUSION_STRENGTH } };
}

const f = (x: number): string => x.toFixed(4);

/**
 * The block the aerial fragment includes AFTER `CONTACT_SHADOW_GLSL` (cotWorldAt, cotNormalAt, the rig uniforms, the pass's
 * tDiffuse, uTan, uInvSize, uSunDir): `cotStructureCavityShade(uv, P, dist, alpha)` → the multiplier for the pixel's colour.
 */
export const STRUCTURE_OCCLUSION_GLSL = /* glsl */ `
    // 2026-10-10: structure-only cavity occlusion (structureOcclusion.ts)
    uniform float uStructOcc;
    uniform float uStructOccStrength;
    float cotStructureCavity( vec2 uv, vec3 P, vec3 N, float dist ) {
      float pxPerM = 0.5 / max( uTan.y * dist * uInvSize.y, 1e-6 );
      float rPx = clamp( pxPerM * ${f(STRUCTURE_OCCLUSION_RADIUS_M)}, ${f(STRUCTURE_OCCLUSION_MIN_PX)}, ${f(STRUCTURE_OCCLUSION_MAX_PX)} );
      float rM = rPx / pxPerM;
      float sum = 0.0;
      for ( int d = 0; d < ${STRUCTURE_OCCLUSION_DIRECTIONS}; d++ ) {
        float ang = ( float( d ) + 0.5 ) * ${f((Math.PI * 2) / STRUCTURE_OCCLUSION_DIRECTIONS)};
        vec2 stepUv = vec2( cos( ang ), sin( ang ) ) * uInvSize * rPx;
        float best = 0.0;
        for ( int s = 0; s < ${STRUCTURE_OCCLUSION_STEPS}; s++ ) {
          float t = ( float( s ) + 1.0 ) / ${f(STRUCTURE_OCCLUSION_STEPS)};
          t *= 0.35 + 0.65 * t;
          vec2 q = uv + stepUv * t;
          if ( any( lessThan( q, vec2( 0.0 ) ) ) || any( greaterThan( q, vec2( 1.0 ) ) ) ) break;
          vec3 Q = cotWorldAt( q );
          vec3 V = Q - P;
          float l = length( V );
          if ( l < 1e-4 ) continue;
          float w = 1.0 - smoothstep( 0.5 * rM, rM, l );
          float h = ( dot( V, N ) / l - ${f(STRUCTURE_OCCLUSION_BIAS)} ) * w;
          // only an opaque lit surface occludes (never a grass or leaf card, water or glass)
          if ( h > best && texture2D( tDiffuse, q ).a >= 1.5 ) best = h;
        }
        sum += clamp( best / ${f(1 - STRUCTURE_OCCLUSION_BIAS)}, 0.0, 1.0 );
      }
      return sum / ${f(STRUCTURE_OCCLUSION_DIRECTIONS)};
    }
    float cotStructureCavityShade( vec2 uv, vec3 P, float dist, float alpha ) {
      if ( alpha < ${f(STRUCTURE_ALPHA_MIN)} ) return 1.0;
      float sunVis = clamp( alpha - 6.0, 0.0, 1.0 );
      vec3 N = cotNormalAt( uv, P );
      float T = uContactSunLum * max( dot( N, uSunDir ), 0.0 ) * sunVis;
      float amb = mix( uContactAmb.y, uContactAmb.x, N.y * 0.5 + 0.5 ) + uContactAmb.z
        + uContactAmb.w * max( dot( N, uContactFillDir ), 0.0 );
      float ambShare = amb / max( T + amb, 1e-4 );
      float fade = 1.0 - smoothstep( ${f(STRUCTURE_OCCLUSION_RANGE_M - STRUCTURE_OCCLUSION_FADE_M)}, ${f(STRUCTURE_OCCLUSION_RANGE_M)}, dist );
      return 1.0 - cotStructureCavity( uv, P, N, dist ) * fade * uStructOccStrength * ambShare;
    }
`;
