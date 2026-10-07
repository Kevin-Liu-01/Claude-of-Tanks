/**
 * facadeBounce.ts — the skies lane (2026-10-06): sunlit facades' light on the shaded ground below them.
 *
 * The facades lane's fill check (r3b, Steinburg's shops-eye; the coordinator's "unsoftened, fully black planar shadow" on
 * the street): with the sun on and off, the road takes the same share of sky fill as the lawn and the lit walls (fill over
 * direct 0.203 against 0.207–0.214 and 0.196–0.209), and a cast shadow removes exactly the sun (on over off 1.000) — so
 * shaded flat ground sits at ~0.17 of its sunlit value with nothing from the sunlit facades across the street. The light
 * rig bounces sunlit GROUND onto faces that look at it (groundBounce.ts: V(n) = (1 − n.y) / 2, zero for the ground itself);
 * nothing carries the other way, from a lit wall down to the street.
 *
 * A one-bounce gather in screen space, inside the aerial pass (post.ts) beside the contact shadows: it already
 * reconstructs each pixel's world position, its normal from depth and the CSM sun visibility the lit materials write in the
 * scene target's alpha (contactShadows.ts). For an opaque receiver in a cast shadow (visibility under 0.5) whose normal
 * points up (the street, a yard, a square — the walls take the ground bounce), eight directions over its hemisphere —
 * cosine-weighted, the elevations stratified in sin² θ, the azimuths fixed in the receiver's world frame (no screen-space
 * noise: a slow pan must not shimmer — the coordinator's flicker condition) — each walk out to a reach of 3.5–14 m; where the depth buffer shows an opaque lit surface in front of that point, within reach
 * and above the receiver's plane, the direction meets it and its pre-haze colour is the radiance it sends (a Lambertian
 * facade sends the camera what it sends the street). With the cosine-weighted estimator the bounce irradiance is
 * E_b = π / 8 · Σ L_k, and with the receiver's colour = albedo / π · E_fill under its sky fill (the contact shadows' own
 * ambient model at n = up), the shaded pixel becomes colour · (1 + E_b / E_fill): a lit facade lifts the street in its
 * own tint, a shaded one barely, an open field (no surface above the horizon) not at all. The blocked sky is not taken off
 * (the fill assumed the whole dome: a narrow alley keeps it), the lift is capped, and it fades out by 60 m.
 *
 * QA knob FACADE_BOUNCE (lightModelCore lightTune): the gather's strength, 0 skips the block. It runs on the High and Ultra
 * presets only (quality.ts facadeBounce) and with the contact shadows (their uniforms); the mobile tier, Medium, Low and
 * `?fx=off` keep it off.
 */
import { CONTACT_SHADOW_ALPHA_OPAQUE } from './contactShadows.ts';

export const FACADE_BOUNCE_SAMPLES = 8;
/** sin² of the polar angle from the normal per sample (cosine-weighted, stratified): ~21°, 38°, 52°, 69°. */
export const FACADE_BOUNCE_SIN2 = Object.freeze([0.125, 0.375, 0.625, 0.875]);
/** The reach of each direction (m), cycled with the elevations. */
export const FACADE_BOUNCE_REACH_M = Object.freeze([3.5, 6.0, 9.5, 14.0]);
/** A hit counts within this multiple of the direction's reach and this far above the receiver's plane (m). */
const FACADE_BOUNCE_HIT_SLACK = 1.6;
const FACADE_BOUNCE_HIT_ABOVE_M = 0.3;
/** Receivers: in a cast shadow (CSM visibility under this) and facing up (n.y over this). */
export const FACADE_BOUNCE_MAX_VIS = 0.5;
export const FACADE_BOUNCE_MIN_NY = 0.6;
/** The lift's cap per channel (the added share of the fill) and its range. */
export const FACADE_BOUNCE_GAIN_MAX = 1.5;
export const FACADE_BOUNCE_RANGE_M = 60;
const FACADE_BOUNCE_FADE_M = 15;
/** Default strength (QA knob FACADE_BOUNCE). */
export const FACADE_BOUNCE_STRENGTH = 1;

interface FacadeBounceUniforms { uFacadeBounce: { value: number } }

export function createFacadeBounceUniforms(): FacadeBounceUniforms {
  return { uFacadeBounce: { value: 0 } };
}

/** The sample directions in the receiver's frame (z along the normal) for a given azimuth turn (radians). */
export function facadeBounceDirections(turn = 0): { dir: [number, number, number]; reach: number }[] {
  const out: { dir: [number, number, number]; reach: number }[] = [];
  for (let k = 0; k < FACADE_BOUNCE_SAMPLES; k++) {
    const s2 = FACADE_BOUNCE_SIN2[k % 4], sinT = Math.sqrt(s2), cosT = Math.sqrt(1 - s2);
    const phi = turn + k * (2 * Math.PI / FACADE_BOUNCE_SAMPLES);
    out.push({ dir: [Math.cos(phi) * sinT, Math.sin(phi) * sinT, cosT], reach: FACADE_BOUNCE_REACH_M[k % 4] });
  }
  return out;
}

/** The CPU twin of the lift: the hit radiances (pre-haze colours, 0 for a miss), the up-facing fill, the strength. */
export function facadeBounceGain(hits: readonly (readonly [number, number, number])[], fillUp: number, strength = FACADE_BOUNCE_STRENGTH): [number, number, number] {
  const sum = [0, 0, 0];
  for (const h of hits) for (let c = 0; c < 3; c++) sum[c] += h[c];
  return sum.map((s) => 1 + Math.min(s * (Math.PI / FACADE_BOUNCE_SAMPLES) / Math.max(fillUp, 1e-4) * strength, FACADE_BOUNCE_GAIN_MAX)) as [number, number, number];
}

const f = (x: number): string => x.toFixed(4);

/**
 * The block the aerial fragment includes after CONTACT_SHADOW_GLSL (it uses cotSunVisOf, cotNormalAt, cotWorldAtDepth,
 * cotDepthToDist, uContactViewProj, uContactAmb, uContactFillDir and the pass's tDepth / tDiffuse / uNear) and provides
 * `cotFacadeBounce(uv, P, dist, alpha)` → the colour multiplier (1 = untouched).
 */
export const FACADE_BOUNCE_GLSL = /* glsl */ `
    // the skies lane (2026-10-06): sunlit facades' light on the shaded ground (facadeBounce.ts)
    uniform float uFacadeBounce;
    vec3 cotFacadeBounce( vec2 uv, vec3 P, float dist, float alpha ) {
      float sunVis = cotSunVisOf( alpha );
      if ( sunVis < 0.0 || sunVis > ${f(FACADE_BOUNCE_MAX_VIS)} ) return vec3( 1.0 );
      vec3 N = cotNormalAt( uv, P );
      if ( N.y < ${f(FACADE_BOUNCE_MIN_NY)} ) return vec3( 1.0 );
      // the up-facing fill: the contact shadows' ambient model at n = up (sky pole, environment, the anti-sun fill)
      float fillUp = uContactAmb.x + uContactAmb.z + uContactAmb.w * max( uContactFillDir.y, 0.0 );
      if ( fillUp <= 1e-4 ) return vec3( 1.0 );
      vec3 T1 = normalize( cross( N, abs( N.x ) < 0.9 ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 0.0, 1.0 ) ) );
      vec3 T2 = cross( N, T1 );
      vec3 sum = vec3( 0.0 );
      for ( int k = 0; k < ${FACADE_BOUNCE_SAMPLES}; k++ ) {
        int m = k - ( k / 4 ) * 4;
        float s2 = m == 0 ? ${f(FACADE_BOUNCE_SIN2[0])} : m == 1 ? ${f(FACADE_BOUNCE_SIN2[1])} : m == 2 ? ${f(FACADE_BOUNCE_SIN2[2])} : ${f(FACADE_BOUNCE_SIN2[3])};
        float reach = m == 0 ? ${f(FACADE_BOUNCE_REACH_M[0])} : m == 1 ? ${f(FACADE_BOUNCE_REACH_M[1])} : m == 2 ? ${f(FACADE_BOUNCE_REACH_M[2])} : ${f(FACADE_BOUNCE_REACH_M[3])};
        float phi = float( k ) * ${f(2 * Math.PI / FACADE_BOUNCE_SAMPLES)};
        vec3 dir = N * sqrt( 1.0 - s2 ) + ( T1 * cos( phi ) + T2 * sin( phi ) ) * sqrt( s2 );
        vec4 c = uContactViewProj * vec4( P + dir * reach, 1.0 );
        if ( c.w <= uNear ) continue;
        vec2 quv = c.xy / c.w * 0.5 + 0.5;
        if ( any( lessThan( quv, vec2( 0.0 ) ) ) || any( greaterThan( quv, vec2( 1.0 ) ) ) ) continue;
        float sceneW = cotDepthToDist( texture2D( tDepth, quv ).x );
        // a surface stands in front of the point: the direction meets it (within reach, above the receiver's plane)
        if ( sceneW < c.w - ( 0.05 + 0.01 * c.w ) ) {
          vec3 S = cotWorldAtDepth( quv, sceneW );
          if ( distance( S, P ) < reach * ${f(FACADE_BOUNCE_HIT_SLACK)} && dot( S - P, N ) > ${f(FACADE_BOUNCE_HIT_ABOVE_M)} ) {
            vec4 hit = texture2D( tDiffuse, quv );
            if ( hit.a >= ${f(CONTACT_SHADOW_ALPHA_OPAQUE)} ) sum += hit.rgb;
          }
        }
      }
      vec3 gain = sum * ${f(Math.PI / FACADE_BOUNCE_SAMPLES)} / fillUp * uFacadeBounce
        * ( 1.0 - smoothstep( ${f(FACADE_BOUNCE_RANGE_M - FACADE_BOUNCE_FADE_M)}, ${f(FACADE_BOUNCE_RANGE_M)}, dist ) );
      return 1.0 + min( gain, vec3( ${f(FACADE_BOUNCE_GAIN_MAX)} ) );
    }
`;
