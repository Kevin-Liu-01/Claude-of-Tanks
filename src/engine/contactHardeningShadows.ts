/**
 * contactHardeningShadows.ts — 2026-10-10 (the shadows lane, overhaul round r3; the owner: "also completely overhaul and
 * improve the shadow system").
 *
 * Contact-hardening soft shadows on the nearest cascade(s): sharp where the occluder meets the receiver, soft as the
 * occluder stands higher above it — the penumbra a finite sun draws. Three r185's PCF filters every shadow with one
 * five-tap Vogel disk of a fixed texel radius, so a track's contact and a crown's shadow ten metres below it had the same
 * edge; a wider disk hatched past about three texels (lighting.ts r5/r8 notes), so no radius could serve both.
 *
 * The law, per receiver, all with the cascade's hardware depth compare (sampler2DShadow — the compare sampler cannot read
 * raw depth, and the static shadow cache keeps only the depth texture, so the blocker estimate is made of compares):
 *
 *  1. SEARCH: the centre and four taps on a disk as wide as the widest penumbra the cascade can show (the light's angular
 *     size × PCSS_REACH_M over the cascade's texel). All five lit: the receiver sees the whole light — lit, at the cost
 *     three paid already (five taps). This is the path most pixels take.
 *  2. BLOCKER LADDER: the same five taps compared at the receiver's depth less PCSS_LADDER_M[k] metres along the light
 *     ray: a tap still in shadow at a level has its blocker more than that far above the receiver. The shares in shadow
 *     at each level give the blockers' mean height over the receiver (each band at its midpoint, the top band at
 *     PCSS_TOP_M) — `blockerDistanceM` is the CPU twin.
 *  3. FILTER: the penumbra (light size × blocker height, in the cascade's texels, at least the cascade's own PCF radius,
 *     at most PCSS_MAX_TEXELS) filtered with PCSS_FILTER_TAPS Vogel taps (three's own five under PCSS_SMALL_TEXELS), each
 *     cascade's disk at one fixed rotation (lighting.ts: no screen noise, nothing to crawl — the game runs without TAA).
 *
 * The receiver's depth takes a slope-scaled bias for the disk it filters (radius × texel × tan of the sun's incidence,
 * clamped): a wide disk on a sloping receiver reaches texels of the receiver itself, and the cascade's depth bias
 * (shadowStability.ts) is solved for three's 1.25-texel disk only.
 *
 * The light's size: PCSS_LIGHT_DEG of sun by day (the sun is 0.53°; aerosol, the game's scale and the screen want
 * more), widened under a deck by PCSS_OVERCAST_K × the light model's overcast (a stratus diffuses the sun into a bright
 * patch: Whiteout's thin-deck sun, r1, casts soft shadows). The tiers: Ultra, High and Medium (quality.ts `pcss`); Low and
 * the phones keep three's five taps (uCotPcss.z 0). The first PCSS_CASCADES cascades: past them the penumbra is under a
 * texel or two of their maps anyway.
 *
 * No DOM, no WebGL, no three: the receipt runs the CPU twins as they are.
 */

/** Angular size of the sun the penumbra is drawn for, by day (degrees). */
export const PCSS_LIGHT_DEG = 1.2;
/** Widening under a deck: × (1 + this × the light model's overcast). */
export const PCSS_OVERCAST_K = 3;
/** The tallest blocker height the search provisions for (m). */
export const PCSS_REACH_M = 12;
/** The blocker ladder's levels (m above the receiver along the light ray). */
export const PCSS_LADDER_M: readonly [number, number, number] = Object.freeze([0.4, 1.6, 6.4]) as readonly [number, number, number];
/** The blocker height credited to the top band (at least the top level). */
export const PCSS_TOP_M = 10;
/** The widest filter disk, in the cascade's texels. */
export const PCSS_MAX_TEXELS = 12;
/** Under this radius the filter takes three's five taps; over it PCSS_FILTER_TAPS. */
export const PCSS_SMALL_TEXELS = 2.5;
export const PCSS_FILTER_TAPS = 16;
/** Cascades from the camera that take the law. */
export const PCSS_CASCADES = 1;
/** The slope-scaled bias's tangent ceiling (about 76° of incidence). */
export const PCSS_MAX_SLOPE_TAN = 4;

/**
 * The blockers' mean height over the receiver (m) from the shares in shadow at depth offsets 0 and the ladder's three
 * levels (non-increasing, each 0..1); 0 when nothing is in shadow.
 */
export function blockerDistanceM(s0: number, s1: number, s2: number, s3: number): number {
  if (!(s0 > 1e-3)) return 0;
  const [l1, l2, l3] = PCSS_LADDER_M;
  const a = Math.max(0, s0 - s1), b = Math.max(0, s1 - s2), c = Math.max(0, s2 - s3), d = Math.max(0, s3);
  return (a * l1 / 2 + b * (l1 + l2) / 2 + c * (l2 + l3) / 2 + d * Math.max(PCSS_TOP_M, l3)) / s0;
}

/** The filter radius in texels for a blocker height, a light size (radians) and a cascade's texel (m). */
export function penumbraTexels(blockerM: number, lightRad: number, texelM: number, minTexels: number): number {
  const t = texelM > 0 ? (lightRad * Math.max(0, blockerM)) / texelM : 0;
  return Math.min(PCSS_MAX_TEXELS, Math.max(minTexels, t));
}

/** The light size (radians) for an overcast (0..1). */
export function pcssLightRad(overcast: number, lightDeg = PCSS_LIGHT_DEG, overcastK = PCSS_OVERCAST_K): number {
  const o = Math.min(1, Math.max(0, overcast));
  return (lightDeg * Math.PI / 180) * (1 + overcastK * o);
}

const f = (x: number): string => x.toFixed(5);

/**
 * The block lighting.ts appends to three's shadowmap_pars_fragment: the uniforms and `cotCascadeShadow`, which the CSM
 * chunk calls in place of `getShadow` with the cascade's index (a literal after three unrolls the loop) and the receiver's
 * n·l. uCotPcss = (light size rad, search reach m, on 0/1, shadow depth range m); uCotPcssTexel = the cascades' texels (m).
 */
export const CONTACT_HARDENING_GLSL = /* glsl */ `
#if defined( USE_SHADOWMAP ) && defined( SHADOWMAP_TYPE_PCF ) && defined( USE_CSM )
uniform vec4 uCotPcss;
uniform vec4 uCotPcssTexel;
float cotPcss( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float texelM, float nDotL ) {
	vec3 sc = shadowCoord.xyz / shadowCoord.w;
	sc.z += shadowBias;
	if ( !( sc.x >= 0.0 && sc.x <= 1.0 && sc.y >= 0.0 && sc.y <= 1.0 && sc.z <= 1.0 ) ) return 1.0;
	vec2 texel = vec2( 1.0 ) / shadowMapSize;
	float depthPerM = 1.0 / max( uCotPcss.w, 1.0 );
	float phi = fract( shadowRadius * 0.754877666 ) * PI2;
	float minTx = max( shadowRadius, 1.0 );
	float searchTx = clamp( uCotPcss.x * uCotPcss.y / max( texelM, 1e-4 ), minTx, ${f(PCSS_MAX_TEXELS)} );
	// the slope-scaled bias for the widest disk the receiver may filter (its own tilt to the light)
	float slopeTan = min( sqrt( max( 1.0 - nDotL * nDotL, 0.0 ) ) / max( nDotL, 0.05 ), ${f(PCSS_MAX_SLOPE_TAN)} );
	float zs = sc.z - searchTx * texelM * slopeTan * depthPerM;
	vec2 o1 = vogelDiskSample( 1, 5, phi ) * searchTx * texel;
	vec2 o2 = vogelDiskSample( 2, 5, phi ) * searchTx * texel;
	vec2 o3 = vogelDiskSample( 3, 5, phi ) * searchTx * texel;
	vec2 o4 = vogelDiskSample( 4, 5, phi ) * searchTx * texel;
	vec4 lit0 = vec4(
		texture( shadowMap, vec3( sc.xy + o1, zs ) ), texture( shadowMap, vec3( sc.xy + o2, zs ) ),
		texture( shadowMap, vec3( sc.xy + o3, zs ) ), texture( shadowMap, vec3( sc.xy + o4, zs ) ) );
	float litC = texture( shadowMap, vec3( sc.xy, zs ) );
	if ( litC > 0.999 && min( min( lit0.x, lit0.y ), min( lit0.z, lit0.w ) ) > 0.999 ) return 1.0;
	// the blocker ladder: the share still in shadow with the receiver lifted toward the light by each level
	float s0 = ( 5.0 - litC - lit0.x - lit0.y - lit0.z - lit0.w ) * 0.2;
	float sk[ 3 ];
	${PCSS_LADDER_M.map((m, k) => `{
		float z = zs - ${f(m)} * depthPerM;
		sk[ ${k} ] = ( 5.0 - texture( shadowMap, vec3( sc.xy, z ) ) - texture( shadowMap, vec3( sc.xy + o1, z ) )
			- texture( shadowMap, vec3( sc.xy + o2, z ) ) - texture( shadowMap, vec3( sc.xy + o3, z ) )
			- texture( shadowMap, vec3( sc.xy + o4, z ) ) ) * 0.2;
	}`).join('\n\t')}
	float s1 = min( sk[ 0 ], s0 ), s2 = min( sk[ 1 ], s1 ), s3 = min( sk[ 2 ], s2 );
	float blockerM = ( ( s0 - s1 ) * ${f(PCSS_LADDER_M[0] / 2)} + ( s1 - s2 ) * ${f((PCSS_LADDER_M[0] + PCSS_LADDER_M[1]) / 2)}
		+ ( s2 - s3 ) * ${f((PCSS_LADDER_M[1] + PCSS_LADDER_M[2]) / 2)} + s3 * ${f(Math.max(PCSS_TOP_M, PCSS_LADDER_M[2]))} ) / max( s0, 1e-3 );
	float penTx = clamp( uCotPcss.x * blockerM / max( texelM, 1e-4 ), minTx, ${f(PCSS_MAX_TEXELS)} );
	float zf = sc.z - penTx * texelM * slopeTan * depthPerM;
	float shadow = 0.0;
	if ( penTx < ${f(PCSS_SMALL_TEXELS)} ) {
		for ( int i = 0; i < 5; i ++ ) shadow += texture( shadowMap, vec3( sc.xy + vogelDiskSample( i, 5, phi ) * penTx * texel, zf ) );
		shadow *= 0.2;
	} else {
		for ( int i = 0; i < ${PCSS_FILTER_TAPS}; i ++ ) shadow += texture( shadowMap, vec3( sc.xy + vogelDiskSample( i, ${PCSS_FILTER_TAPS}, phi ) * penTx * texel, zf ) );
		shadow *= ${f(1 / PCSS_FILTER_TAPS)};
	}
	return mix( 1.0, shadow, shadowIntensity );
}
float cotCascadeShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, int cascade, float nDotL ) {
	if ( cascade < ${PCSS_CASCADES} && uCotPcss.z > 0.5 ) {
		float texelM = cascade == 0 ? uCotPcssTexel.x : cascade == 1 ? uCotPcssTexel.y : cascade == 2 ? uCotPcssTexel.z : uCotPcssTexel.w;
		return cotPcss( shadowMap, shadowMapSize, shadowIntensity, shadowBias, shadowRadius, shadowCoord, texelM, nDotL );
	}
	return getShadow( shadowMap, shadowMapSize, shadowIntensity, shadowBias, shadowRadius, shadowCoord );
}
#endif
`;

/** The call three's CSM chunk makes per cascade, and the one that replaces it (lighting.ts patchStableShadowSampling). */
export const CSM_GET_SHADOW_CALL = 'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )';
/** The head of three's non-CSM directional block in the same chunk: its call keeps getShadow. */
export const CSM_NON_CSM_HEAD = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct ) && !defined( USE_CSM ) && !defined( CSM_CASCADES )';
export const CSM_CASCADE_SHADOW_CALL = 'cotCascadeShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ], UNROLLED_LOOP_INDEX, clamp( dot( geometryNormal, directLight.direction ), 0.0, 1.0 ) )';
