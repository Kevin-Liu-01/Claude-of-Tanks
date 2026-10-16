/**
 * shadowTent.ts — the cascades' tent PCF (2026-10-14, SKY shadows r2a; the shadow-quality plan's P1, C2).
 *
 * three's PCF getShadow takes five hardware-compare taps on a Vogel disk; lighting.ts gave each cascade one fixed
 * orientation (a per-pixel rotation crawled with the camera). At the 1.25-texel floor that kernel is lumpy, and past
 * about 2.3 texels its five taps separate into five ghost copies of an edge. Here each cascade samples a regular grid of
 * hardware-compare taps one texel apart or less — every tap is itself a bilinear 2 x 2 compare — under binomial weights,
 * so the kernel is smooth and its footprints overlap (no lobes, nothing to rotate, nothing to crawl):
 * - 3: four taps at ±0.5 texel, weights 1/4 (a 3-texel footprint; the alpha-to-coverage cards always take it);
 * - 5: nine taps at 0 and ±1 texel, weights [1 2 1] x [1 2 1] / 16 (4 texels);
 * - 7: sixteen taps at ±0.5 and ±1.5 texel, weights [1 3 3 1] x [1 3 3 1] / 64 (5 texels).
 * The kernel per cascade is the preset's table (quality.ts shadowTent; a closed deck takes shadowTentDeck — r1's widened
 * Vogel radius went with the Vogel disk), coded on the cascade's shadow radius (shadowTentRadius), so a preset or a deck
 * changes it without a recompile. Only the CSM cascades carry a tent-coded radius: spot, point and other directional
 * lights keep three's disk exactly (getShadow wraps three's, renamed cotThreeGetShadow).
 * Technique after I. Castaño's tent-filtered PCF (2013); this formulation and its code are first-party.
 */

/** The kernels a cascade may take (taps a side: 2, 3 or 4). */
export type ShadowTentKernel = 3 | 5 | 7;
export type ShadowTentTable = readonly [ShadowTentKernel, ShadowTentKernel, ShadowTentKernel, ShadowTentKernel];

/** A preset without its own table: the smallest kernel everywhere. */
export const SHADOW_TENT_DEFAULT: ShadowTentTable = Object.freeze([3, 3, 3, 3] as const);

/** Half the kernel's footprint in texels: its outermost tap's offset plus the bilinear compare's own texel. */
export function shadowTentHalfTexels(k: number): number {
  return k >= 7 ? 2.5 : k >= 5 ? 2 : 1.5;
}

/** Hardware-compare taps the kernel reads (cost). */
export function shadowTentTaps(k: number): number {
  return k >= 7 ? 16 : k >= 5 ? 9 : 4;
}

/**
 * The radius (texels) the depth-bias law takes for a kernel (shadowStability.ts shadowDepthBiasForTexel reaches
 * (0.95 r + 1) texels): the one whose reach is the kernel's half footprint.
 */
export function shadowTentBiasRadius(k: number): number {
  return (shadowTentHalfTexels(k) - 1) / 0.95;
}

/**
 * The cascade's kernel rides on its shadow radius (SHADOW_TENT_RADIUS_BASE + k: no other light carries a radius that
 * large), so the lookup needs no cascade index and every getShadow call site stays three's own — vegetation's leaf floor
 * and the coast wrapper patch those sites (shadows r3's lesson). The depth-bias law takes shadowTentBiasRadius instead.
 */
export const SHADOW_TENT_RADIUS_BASE = 100;
export function shadowTentRadius(k: number): number {
  return SHADOW_TENT_RADIUS_BASE + (k >= 7 ? 7 : k >= 5 ? 5 : 3);
}

/** three's PCF getShadow definition line (shadowmap_pars_fragment), renamed so the tent's getShadow can wrap it. */
export const THREE_PCF_GET_SHADOW = 'float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {';
export const THREE_PCF_GET_SHADOW_RENAMED = 'float cotThreeGetShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {';

/**
 * GLSL (appended to shadowmap_pars_fragment, PCF only): the tent, and getShadow over three's (renamed): a tent-coded
 * radius takes the tent, any other the disk exactly as three draws it.
 */
export const SHADOW_TENT_GLSL = /* glsl */`
#if defined( USE_SHADOWMAP ) && defined( SHADOWMAP_TYPE_PCF )
float cotTentShadow( float k, sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, vec4 shadowCoord ) {
	float shadow = 1.0;
	shadowCoord.xyz /= shadowCoord.w;
	shadowCoord.z += shadowBias;
	bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
	if ( inFrustum && shadowCoord.z <= 1.0 ) {
		vec2 t = vec2( 1.0 ) / shadowMapSize;
		vec2 uv = shadowCoord.xy;
		float z = shadowCoord.z;
		#ifndef OPAQUE
		k = 3.0;
		#endif
		if ( k >= 6.5 ) {
			shadow = 0.0;
			for ( int y = 0; y < 4; y ++ ) {
				float wy = ( y == 0 || y == 3 ) ? 1.0 : 3.0;
				for ( int x = 0; x < 4; x ++ ) {
					float wx = ( x == 0 || x == 3 ) ? 1.0 : 3.0;
					shadow += wx * wy * texture( shadowMap, vec3( uv + ( vec2( float( x ), float( y ) ) - 1.5 ) * t, z ) );
				}
			}
			shadow *= 1.0 / 64.0;
		} else if ( k >= 4.5 ) {
			shadow = 0.0;
			for ( int y = 0; y < 3; y ++ ) {
				float wy = y == 1 ? 2.0 : 1.0;
				for ( int x = 0; x < 3; x ++ ) {
					float wx = x == 1 ? 2.0 : 1.0;
					shadow += wx * wy * texture( shadowMap, vec3( uv + ( vec2( float( x ), float( y ) ) - 1.0 ) * t, z ) );
				}
			}
			shadow *= 1.0 / 16.0;
		} else {
			shadow = 0.25 * (
				texture( shadowMap, vec3( uv + vec2( -0.5, -0.5 ) * t, z ) ) +
				texture( shadowMap, vec3( uv + vec2( 0.5, -0.5 ) * t, z ) ) +
				texture( shadowMap, vec3( uv + vec2( -0.5, 0.5 ) * t, z ) ) +
				texture( shadowMap, vec3( uv + vec2( 0.5, 0.5 ) * t, z ) ) );
		}
	}
	return mix( 1.0, shadow, shadowIntensity );
}
float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
	if ( shadowRadius > ${(SHADOW_TENT_RADIUS_BASE - 0.5).toFixed(1)} ) return cotTentShadow( shadowRadius - ${SHADOW_TENT_RADIUS_BASE.toFixed(1)}, shadowMap, shadowMapSize, shadowIntensity, shadowBias, shadowCoord );
	return cotThreeGetShadow( shadowMap, shadowMapSize, shadowIntensity, shadowBias, shadowRadius, shadowCoord );
}
#endif
`;
