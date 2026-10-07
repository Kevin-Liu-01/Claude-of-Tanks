/**
 * overcastOcclusion.ts — the skies lane (2026-10-06): the sky's occlusion at contacts under a closed deck.
 *
 * The gauntlet's wave 190 (Frosthollow round 3, overcast): "the tank casts no shadow and gets no contact darkening on the
 * road, so it appears to hover"; "nothing casts a shadow or receives contact darkening: the log house, the fence, the crates
 * and the hedgehogs all sit on a uniform near-white snow plane" (Titan's overcast frames the same in wave 181). Under a
 * closed deck the light model cuts the sun's beam (lightModel.ts OVERCAST_DIRECT_CUT 0.98), so the cascades shadow nothing
 * the eye can see; the ambient dims fade with the deck (uCotShadowDepth), and the contact march is a share of the sun
 * (contactShadows.ts: T = sunLum · n·l · vis, nothing when the beam is gone). A real overcast still grounds every object:
 * its light comes from the whole dome, and a crevice, the ground under a hull, a wall's foot, the eaves see less of it.
 *
 * A short gather inside the aerial pass, beside the contact shadows (their helpers: the world position, the normal from
 * depth, the alpha carrier): for an opaque receiver within 50 m, eight directions over its hemisphere — cosine-weighted,
 * the elevations stratified in sin² θ, the azimuths fixed in the receiver's world frame (no screen-space noise: nothing to
 * shimmer under a pan) — each walk out a contact reach of 0.35–2.4 m; where the depth buffer shows a surface in front of
 * that point, within twice its reach and above the receiver's plane, the dome is hidden that way. With the cosine-weighted
 * set the hidden share of the sky's light is hits / 8, and since under a closed deck the light is the dome's, the pixel
 * keeps 1 − strength · hidden of its colour. The term scales with the deck (0 under an open sky: the sun's shadows and the
 * contact march ground objects there), so a clear map pays nothing and keeps its look.
 *
 * QA knob SKY_OCCLUSION (lightModelCore lightTune): the strength at a closed deck; 0 skips the block. It runs with the
 * contact shadows (their tier and uniforms): the mobile tier and `?fx=off` keep it off.
 */
export const SKY_OCCLUSION_SAMPLES = 8;
/** sin² of the polar angle from the normal per sample (cosine-weighted, stratified): ~21°, 38°, 52°, 69°. */
export const SKY_OCCLUSION_SIN2 = Object.freeze([0.125, 0.375, 0.625, 0.875]);
/** The contact reach of each direction (m), cycled with the elevations. */
export const SKY_OCCLUSION_REACH_M = Object.freeze([0.35, 0.7, 1.3, 2.4]);
/** A hit counts within this multiple of its reach and this far above the receiver's plane (m). */
const SKY_OCCLUSION_HIT_SLACK = 2.0;
const SKY_OCCLUSION_HIT_ABOVE_M = 0.03;
export const SKY_OCCLUSION_RANGE_M = 50;
const SKY_OCCLUSION_FADE_M = 10;
/** Strength at a closed deck (QA knob SKY_OCCLUSION) and the deck's ramp (overcast). */
export const SKY_OCCLUSION_STRENGTH = 0.7;
export const SKY_OCCLUSION_DECK: readonly [number, number] = [0.4, 0.9];

interface SkyOcclusionUniforms { uSkyOcc: { value: number } }

export function createSkyOcclusionUniforms(): SkyOcclusionUniforms {
  return { uSkyOcc: { value: 0 } };
}

/** The term's weight for a deck (0 under an open sky, the full strength at a closed deck). */
export function skyOcclusionWeight(overcast: number, strength = SKY_OCCLUSION_STRENGTH): number {
  const [a, b] = SKY_OCCLUSION_DECK;
  const t = Math.min(1, Math.max(0, ((Number.isFinite(overcast) ? overcast : 0) - a) / (b - a)));
  return strength * t * t * (3 - 2 * t);
}

/** The CPU twin: the colour multiplier for `hits` of the eight directions hidden, at a weight. */
export function skyOcclusionShade(hits: number, weight: number): number {
  return 1 - weight * Math.min(SKY_OCCLUSION_SAMPLES, Math.max(0, hits)) / SKY_OCCLUSION_SAMPLES;
}

const f = (x: number): string => x.toFixed(4);

/**
 * The block the aerial fragment includes after CONTACT_SHADOW_GLSL (it uses cotSunVisOf, cotNormalAt, cotWorldAtDepth,
 * cotDepthToDist, uContactViewProj and the pass's tDepth / uNear) and provides `cotSkyOcclusion(uv, P, dist, alpha)` → the
 * colour multiplier (1 = untouched).
 */
export const SKY_OCCLUSION_GLSL = /* glsl */ `
    // the skies lane (2026-10-06): the sky's occlusion at contacts under a closed deck (overcastOcclusion.ts)
    uniform float uSkyOcc;
    float cotSkyOcclusion( vec2 uv, vec3 P, float dist, float alpha ) {
      if ( cotSunVisOf( alpha ) < 0.0 ) return 1.0;
      vec3 N = cotNormalAt( uv, P );
      vec3 T1 = normalize( cross( N, abs( N.x ) < 0.9 ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 0.0, 1.0 ) ) );
      vec3 T2 = cross( N, T1 );
      vec3 start = P + N * ( 0.02 + dist * 0.002 );
      float hits = 0.0;
      for ( int k = 0; k < ${SKY_OCCLUSION_SAMPLES}; k++ ) {
        int m = k - ( k / 4 ) * 4;
        float s2 = m == 0 ? ${f(SKY_OCCLUSION_SIN2[0])} : m == 1 ? ${f(SKY_OCCLUSION_SIN2[1])} : m == 2 ? ${f(SKY_OCCLUSION_SIN2[2])} : ${f(SKY_OCCLUSION_SIN2[3])};
        float reach = m == 0 ? ${f(SKY_OCCLUSION_REACH_M[0])} : m == 1 ? ${f(SKY_OCCLUSION_REACH_M[1])} : m == 2 ? ${f(SKY_OCCLUSION_REACH_M[2])} : ${f(SKY_OCCLUSION_REACH_M[3])};
        float phi = float( k ) * ${f(2 * Math.PI / SKY_OCCLUSION_SAMPLES)};
        vec3 dir = N * sqrt( 1.0 - s2 ) + ( T1 * cos( phi ) + T2 * sin( phi ) ) * sqrt( s2 );
        vec4 c = uContactViewProj * vec4( start + dir * reach, 1.0 );
        if ( c.w <= uNear ) continue;
        vec2 quv = c.xy / c.w * 0.5 + 0.5;
        if ( any( lessThan( quv, vec2( 0.0 ) ) ) || any( greaterThan( quv, vec2( 1.0 ) ) ) ) continue;
        float sceneW = cotDepthToDist( texture2D( tDepth, quv ).x );
        if ( sceneW < c.w - ( 0.02 + 0.004 * c.w ) ) {
          vec3 S = cotWorldAtDepth( quv, sceneW );
          if ( distance( S, P ) < reach * ${f(SKY_OCCLUSION_HIT_SLACK)} && dot( S - P, N ) > ${f(SKY_OCCLUSION_HIT_ABOVE_M)} ) hits += 1.0;
        }
      }
      return 1.0 - uSkyOcc * hits * ${f(1 / SKY_OCCLUSION_SAMPLES)}
        * ( 1.0 - smoothstep( ${f(SKY_OCCLUSION_RANGE_M - SKY_OCCLUSION_FADE_M)}, ${f(SKY_OCCLUSION_RANGE_M)}, dist ) );
    }
`;
