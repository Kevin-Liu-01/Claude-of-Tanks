/**
 * atmosphere.ts — the physically based sky (round 65, 2026-09-24).
 *
 * Implements Sébastien Hillaire, "A Scalable and Production Ready Sky and Atmosphere Rendering
 * Technique", Computer Graphics Forum 39(4), 2020 (EGSR): a transmittance LUT, a multiple-scattering
 * LUT and a sky-view LUT, each a small fragment pass, rebuilt only when the sun or the map's atmosphere
 * parameters change. The medium is the paper's (Bruneton's) Earth: Rayleigh scattering with an 8 km scale
 * height, Mie scattering and absorption with a 1.2 km scale height, an ozone tent centred at 25 km — every
 * coefficient per kilometre at sea level, scaled by the per-map parameters `skyPresetToAtmosphere` derives
 * from a map's authored sky preset (the calibration lives there). The GLSL is first-party; no third-party
 * shader text or asset enters the tree.
 *
 * Consumers sample the sky-view LUT through `ATMOSPHERE_SKY_GLSL` (`atmoSky(dir)`, `atmoSkyVisible(dir)`):
 * the sky dome in sky.ts, the aerial-perspective pass in post.ts and the summary pass below. The terrain
 * material never sees a LUT (it sits at its sixteen texture units); the ground reads the sky through the
 * fog colour and the hemisphere light the summary derives.
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/** Planet and atmosphere radii (km), the paper's Earth. */
export const ATMO_GROUND_KM = 6360;
export const ATMO_TOP_KM = 6460;
/** LUT resolutions: transmittance 256×64, multiple scattering 32×32, sky view 200×100 (the paper's sizes). */
export const ATMO_LUT_SIZES = Object.freeze({
  transmittance: [256, 64] as const,
  multiScatter: [32, 32] as const,
  skyView: [200, 100] as const,
});
const [T_W, T_H] = ATMO_LUT_SIZES.transmittance;
const [MS_W, MS_H] = ATMO_LUT_SIZES.multiScatter;
const [SV_W, SV_H] = ATMO_LUT_SIZES.skyView;
/** Ray-march steps: transmittance 40, multiple scattering 8×8 directions × 20, sky view 32 (quadratic). */
export const ATMO_STEPS = Object.freeze({ transmittance: 40, multiScatterDirs: 8, multiScatter: 20, skyView: 32 });
/** Summary texels (8×1 float): see `AtmosphereSummary`. */
const SUMMARY_W = 8;
/**
 * The sun disc's half-angle cosine — the legacy (Preetham) dome's disc, 0.533° (twice the apparent sun), kept
 * on purpose: PMREMGenerator folds the disc's radiance into the environment's diffuse term, and every map's
 * ground fill was tuned with that energy (see sky.ts `legacySunDiscRadiance`).
 */
export const ATMO_SUN_DISC_COS = 0.999956676946448443553574619906976478926848692873900859324;

/** Medium and scattering constants (per km at sea level), the paper's Table 1 / Bruneton 2017. */
export const ATMO_MEDIUM = Object.freeze({
  rayleighScattering: [5.802e-3, 13.558e-3, 33.1e-3] as const,
  rayleighScaleHeightKm: 8.0,
  mieScattering: 3.996e-3,
  mieExtinction: 4.440e-3,
  mieScaleHeightKm: 1.2,
  ozoneAbsorption: [0.650e-3, 1.881e-3, 0.085e-3] as const,
  ozoneCentreKm: 25.0,
  ozoneHalfWidthKm: 15.0,
});

export interface AtmosphereParams {
  /** Multiplier on the Rayleigh scattering coefficient (1 = the paper's Earth). */
  rayleighScale: number;
  /** Multiplier on the Mie scattering and extinction coefficients. */
  mieScale: number;
  /** Cornette-Shanks asymmetry of the aerosol phase function. */
  mieG: number;
  /** Multiplier on the ozone absorption. */
  ozoneScale: number;
  /** Per-channel Mie single-scattering albedo tint (1 = grey aerosol; dust absorbs blue). */
  mieTint: readonly [number, number, number];
  /** Ground albedo seen by the multiple-scattering bounce. */
  groundAlbedo: readonly [number, number, number];
  /** Sun irradiance outside the atmosphere in engine linear units (the exposure of the sky). */
  sunIlluminance: number;
  /** Viewer height above the ground (km); the sky-view LUT is built for this fixed height. */
  viewHeightKm: number;
  /** Unit vector toward the sun (or the moon on a night preset), world space, +y up. */
  sunDir: readonly [number, number, number];
}

/** Per-map overrides a sky preset may author on top of the derived parameters (Mars' thin CO2 sky). */
export interface AtmosphereOverrides {
  rayleighScale?: number;
  mieScale?: number;
  mieG?: number;
  ozoneScale?: number;
  mieTintHex?: number;
  groundAlbedoHex?: number;
  sunIlluminance?: number;
}

/** The sky preset fields the mapping reads (a subset of sky.ts's SkyPreset). */
export interface AtmosphereSkyPresetInput {
  sunElevationDeg: number;
  sunAzimuthDeg: number;
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  atmosphere?: AtmosphereOverrides | null;
}

// Calibration (round 65, 2026-09-24). The legacy dome was three's Preetham sky with the engine's radiance scale,
// horizon treatment and knee; every map's preset was authored against it. The physical model reads the same
// fields: Preetham's Rayleigh coefficient is linear in `rayleigh`, its Mie coefficient is linear in
// `turbidity × mieCoefficient` (totalMie(T) ∝ 0.2·T, and sky.ts multiplies the coefficient by 1.25), so the
// two scales below are proportional to those products, and the sun illuminance sets the exposure. The three
// constants were fitted (mean absolute log-radiance difference per channel over 35 sky directions per map,
// the 2–20° band weighted twice, the sun's 8° neighbourhood skipped; grid over the two scales with the
// illuminance solved per candidate) against the legacy dome on the owner's twelve good maps (verdant, urban,
// railyard, frontier, delta, monsoon, alpine, foundry, airfield, orchard, longleaf, reservoir): the loss surface
// is flat between 0.6–0.7 / 250–320 (0.324–0.327) and the residual is structural — three's Preetham evaluates
// its Rayleigh phase at (cosθ·0.5 + 0.5), which halves the anti-solar sky, and raises the in-scatter to the
// power 1.5, which over-saturates the upper sky; the physical model corrects both. The loss minimum's aerosol
// (verdant optical depth 0.045) whitened the anti-solar sky the sky views look at, so the eye test on the
// captures (verdant / desert sky-w, six candidates) chose a cleaner air: K_M 40 with the illuminance 8.0 puts
// verdant's sky-w bands within 2 % of the legacy luminance (105 / 136 / 174 display against 107 / 135 / 174)
// at saturation 0.63 against 0.78 — the physical ceiling for a Rayleigh sky. Verdant maps onto rayleigh 0.84,
// Mie 1.2 (aerosol optical depth 0.0064); Monsoon onto 1.44 / 4.7 (0.025); Desert onto 0.6 / 3.15 (0.017). The
// per-map table is in docs/MAP-BEAUTIFICATION.md round 65. `mieG` passes through (both models use a forward
// lobe of that asymmetry), ozone is the Earth's, the ground bounce a temperate 0.25 grey.
export const ATMO_CALIBRATION = Object.freeze({
  rayleighPerPreset: 0.7,
  miePerTurbidityCoefficient: 40,
  sunIlluminance: 8.0,
  mieGMin: 0.45,
  mieGMax: 0.92,
  groundAlbedo: [0.25, 0.25, 0.25] as const,
  viewHeightKm: 0.05,
  /** sky.ts multiplies the authored Mie coefficient by this before the legacy dome sees it. */
  legacyMieGain: 1.25,
});

function hexToLinear(hex: number): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/** Unit vector toward a preset's sun from its elevation / azimuth (the sky.ts convention). */
export function sunDirectionOf(sunElevationDeg: number, sunAzimuthDeg: number): [number, number, number] {
  const v = new THREE.Vector3().setFromSphericalCoords(
    1, THREE.MathUtils.degToRad(90 - sunElevationDeg), THREE.MathUtils.degToRad(sunAzimuthDeg));
  return [v.x, v.y, v.z];
}

/** QA hook: a page may set window.__ATMO_CALIBRATION before boot to try other constants (the calibration probes). */
function liveCalibration(): typeof ATMO_CALIBRATION {
  try {
    const override = (globalThis as { __ATMO_CALIBRATION?: Partial<typeof ATMO_CALIBRATION> }).__ATMO_CALIBRATION;
    return override && typeof override === 'object' ? { ...ATMO_CALIBRATION, ...override } : ATMO_CALIBRATION;
  } catch {
    return ATMO_CALIBRATION;
  }
}

/** Map a sky preset onto atmosphere parameters (see ATMO_CALIBRATION); authored overrides win. */
export function skyPresetToAtmosphere(preset: AtmosphereSkyPresetInput): AtmosphereParams {
  const C = liveCalibration();
  const o = preset.atmosphere ?? {};
  const clamp = THREE.MathUtils.clamp;
  const mieProduct = Math.max(0, preset.turbidity) * Math.max(0, preset.mieCoefficient) * C.legacyMieGain;
  return {
    rayleighScale: o.rayleighScale ?? Math.max(0.005, preset.rayleigh * C.rayleighPerPreset),
    mieScale: o.mieScale ?? Math.max(0.01, mieProduct * C.miePerTurbidityCoefficient),
    mieG: clamp(o.mieG ?? preset.mieDirectionalG, C.mieGMin, C.mieGMax),
    ozoneScale: o.ozoneScale ?? 1,
    mieTint: o.mieTintHex == null ? [1, 1, 1] : hexToLinear(o.mieTintHex),
    groundAlbedo: o.groundAlbedoHex == null ? C.groundAlbedo : hexToLinear(o.groundAlbedoHex),
    sunIlluminance: o.sunIlluminance ?? C.sunIlluminance,
    viewHeightKm: C.viewHeightKm,
    sunDir: sunDirectionOf(preset.sunElevationDeg, preset.sunAzimuthDeg),
  };
}

const f = (x: number): string => {
  const s = String(x);
  return s.includes('.') || s.includes('e') ? s : `${s}.0`;
};

/** Medium, LUT parameterizations and ray/sphere helpers: the builders and the summary share it (exported for the receipt). */
export const ATMOSPHERE_CORE_GLSL = /* glsl */`
const float ATMO_RG = ${f(ATMO_GROUND_KM)};
const float ATMO_RT = ${f(ATMO_TOP_KM)};
const float ATMO_PI = 3.14159265358979;
uniform float uAtmoRayleigh;
uniform float uAtmoMie;
uniform float uAtmoOzone;
uniform vec3 uAtmoMieTint;
uniform vec3 uAtmoGroundAlbedo;
uniform float uAtmoMieG;
uniform vec3 uAtmoSunIlluminance;
struct AtmoMedium { vec3 rayScat; vec3 mieScat; vec3 extinction; vec3 scattering; };
AtmoMedium atmoMedium( float hKm ) {
	float rayD = exp( - hKm / ${f(ATMO_MEDIUM.rayleighScaleHeightKm)} );
	float mieD = exp( - hKm / ${f(ATMO_MEDIUM.mieScaleHeightKm)} );
	float ozD = max( 0.0, 1.0 - abs( hKm - ${f(ATMO_MEDIUM.ozoneCentreKm)} ) / ${f(ATMO_MEDIUM.ozoneHalfWidthKm)} );
	AtmoMedium m;
	m.rayScat = vec3( ${ATMO_MEDIUM.rayleighScattering.map(f).join(', ')} ) * rayD * uAtmoRayleigh;
	m.mieScat = vec3( ${f(ATMO_MEDIUM.mieScattering)} ) * uAtmoMieTint * mieD * uAtmoMie;
	vec3 mieExt = vec3( ${f(ATMO_MEDIUM.mieExtinction)} ) * mieD * uAtmoMie;
	vec3 ozAbs = vec3( ${ATMO_MEDIUM.ozoneAbsorption.map(f).join(', ')} ) * ozD * uAtmoOzone;
	m.extinction = m.rayScat + mieExt + ozAbs;
	m.scattering = m.rayScat + m.mieScat;
	return m;
}
// nearest positive intersection of a ray from ro (km, planet centred) with the sphere of the given radius; -1 if none
float atmoRaySphere( vec3 ro, vec3 rd, float radius ) {
	float b = dot( ro, rd );
	float c = dot( ro, ro ) - radius * radius;
	float disc = b * b - c;
	if ( disc < 0.0 ) return -1.0;
	float sq = sqrt( disc );
	float t0 = - b - sq;
	float t1 = - b + sq;
	if ( t0 > 0.0 ) return t0;
	if ( t1 > 0.0 ) return t1;
	return -1.0;
}
// (r, mu) -> transmittance LUT uv (Bruneton's parameterization, the paper's section 4.1)
vec2 atmoTransmittanceUV( float r, float mu ) {
	float H = sqrt( ATMO_RT * ATMO_RT - ATMO_RG * ATMO_RG );
	float rho = sqrt( max( r * r - ATMO_RG * ATMO_RG, 0.0 ) );
	float disc = r * r * ( mu * mu - 1.0 ) + ATMO_RT * ATMO_RT;
	float d = max( 0.0, - r * mu + sqrt( max( disc, 0.0 ) ) );
	float dMin = ATMO_RT - r;
	float dMax = rho + H;
	float xMu = ( d - dMin ) / ( dMax - dMin );
	float xR = rho / H;
	return vec2( ( xMu + ${f(0.5 / T_W)} ) * ${f(T_W / (T_W + 1))}, ( xR + ${f(0.5 / T_H)} ) * ${f(T_H / (T_H + 1))} );
}
uniform sampler2D tAtmoTransmittance;
vec3 atmoTransmittance( float r, float mu ) {
	return texture2D( tAtmoTransmittance, atmoTransmittanceUV( r, mu ) ).rgb;
}
uniform sampler2D tAtmoMultiScatter;
vec3 atmoMultiScatter( float r, float cosSun ) {
	vec2 uv = vec2( cosSun * 0.5 + 0.5, ( r - ATMO_RG ) / ( ATMO_RT - ATMO_RG ) );
	vec2 suv = uv * vec2( ${f((MS_W - 1) / MS_W)}, ${f((MS_H - 1) / MS_H)} ) + vec2( ${f(0.5 / MS_W)}, ${f(0.5 / MS_H)} );
	return texture2D( tAtmoMultiScatter, suv ).rgb;
}
float atmoRayleighPhase( float cosTheta ) {
	return ${f(3 / (16 * Math.PI))} * ( 1.0 + cosTheta * cosTheta );
}
// Cornette-Shanks (the paper's aerosol phase)
float atmoMiePhase( float cosTheta, float g ) {
	float g2 = g * g;
	return ${f(3 / (8 * Math.PI))} * ( ( 1.0 - g2 ) * ( 1.0 + cosTheta * cosTheta ) )
		/ ( ( 2.0 + g2 ) * pow( max( 1.0 + g2 - 2.0 * g * cosTheta, 1e-4 ), 1.5 ) );
}
`;

/**
 * Sky-view sampling for consumers: `atmoSky(dir)` is the sky luminance (no sun disc) in a world direction,
 * `atmoKnee` the dome's soft luminance shoulder (uAtmoKnee = start, range, 1/e width — sky.ts's SKY_KNEE
 * constants) and `atmoSkyVisible(dir)` the sky as the dome shows it (knee, then the preset's skyIntensity).
 */
export const ATMOSPHERE_SKY_GLSL = /* glsl */`
uniform sampler2D tAtmoSky;
uniform vec3 uAtmoSun;
uniform float uAtmoViewH;
uniform vec3 uAtmoKnee;
uniform float uAtmoIntensity;
vec3 atmoSky( vec3 dir ) {
	float rg = ${f(ATMO_GROUND_KM)};
	float vHorizon = sqrt( max( uAtmoViewH * uAtmoViewH - rg * rg, 0.0 ) );
	float beta = acos( clamp( vHorizon / uAtmoViewH, -1.0, 1.0 ) );
	float zenithHorizon = 3.14159265358979 - beta;
	float vza = acos( clamp( dir.y, -1.0, 1.0 ) );
	float v = vza < zenithHorizon
		? ( 1.0 - sqrt( max( 1.0 - vza / zenithHorizon, 0.0 ) ) ) * 0.5
		: sqrt( max( ( vza - zenithHorizon ) / beta, 0.0 ) ) * 0.5 + 0.5;
	vec2 sunH = normalize( uAtmoSun.xz + vec2( 1e-5, 0.0 ) );
	vec2 dirH = normalize( dir.xz + vec2( 1e-5, 0.0 ) );
	float u = sqrt( clamp( dot( sunH, dirH ) * -0.5 + 0.5, 0.0, 1.0 ) );
	vec2 uv = vec2( u * ${f((SV_W - 1) / SV_W)} + ${f(0.5 / SV_W)}, v * ${f((SV_H - 1) / SV_H)} + ${f(0.5 / SV_H)} );
	return texture2D( tAtmoSky, uv ).rgb;
}
vec3 atmoKnee( vec3 c ) {
	float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	if ( l > uAtmoKnee.x ) c *= ( uAtmoKnee.x + uAtmoKnee.y * ( 1.0 - exp( - ( l - uAtmoKnee.x ) * uAtmoKnee.z ) ) ) / l;
	return c;
}
vec3 atmoSkyVisible( vec3 dir ) {
	return atmoKnee( atmoSky( dir ) ) * uAtmoIntensity;
}
`;

const QUAD_VERTEX = /* glsl */`
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}`;

const TRANSMITTANCE_FRAGMENT = /* glsl */`
${ATMOSPHERE_CORE_GLSL}
varying vec2 vUv;
void main() {
	float xMu = ( vUv.x - ${f(0.5 / T_W)} ) * ${f(T_W / (T_W - 1))};
	float xR = ( vUv.y - ${f(0.5 / T_H)} ) * ${f(T_H / (T_H - 1))};
	float H = sqrt( ATMO_RT * ATMO_RT - ATMO_RG * ATMO_RG );
	float rho = xR * H;
	float r = sqrt( rho * rho + ATMO_RG * ATMO_RG );
	float dMin = ATMO_RT - r;
	float dMax = rho + H;
	float d = dMin + xMu * ( dMax - dMin );
	float mu = d == 0.0 ? 1.0 : clamp( ( H * H - rho * rho - d * d ) / ( 2.0 * r * d ), -1.0, 1.0 );
	vec3 ro = vec3( 0.0, r, 0.0 );
	vec3 rd = vec3( sqrt( max( 1.0 - mu * mu, 0.0 ) ), mu, 0.0 );
	float tMax = max( atmoRaySphere( ro, rd, ATMO_RT ), 0.0 );
	float dt = tMax / ${f(ATMO_STEPS.transmittance)};
	vec3 od = vec3( 0.0 );
	for ( int i = 0; i < ${ATMO_STEPS.transmittance}; i++ ) {
		float t = ( float( i ) + 0.5 ) * dt;
		vec3 p = ro + rd * t;
		od += atmoMedium( length( p ) - ATMO_RG ).extinction * dt;
	}
	gl_FragColor = vec4( exp( - od ), 1.0 );
}`;

const MULTI_SCATTER_FRAGMENT = /* glsl */`
${ATMOSPHERE_CORE_GLSL}
varying vec2 vUv;
void main() {
	float cosSun = ( ( vUv.x - ${f(0.5 / MS_W)} ) * ${f(MS_W / (MS_W - 1))} ) * 2.0 - 1.0;
	float hv = clamp( ( vUv.y - ${f(0.5 / MS_H)} ) * ${f(MS_H / (MS_H - 1))}, 0.001, 0.999 );
	float r = ATMO_RG + hv * ( ATMO_RT - ATMO_RG );
	vec3 sunDir = normalize( vec3( 0.0, cosSun, - sqrt( max( 1.0 - cosSun * cosSun, 0.0 ) ) ) );
	vec3 ro = vec3( 0.0, r, 0.0 );
	float isoPhase = 1.0 / ( 4.0 * ATMO_PI );
	vec3 lSum = vec3( 0.0 );
	vec3 fmsSum = vec3( 0.0 );
	for ( int i = 0; i < ${ATMO_STEPS.multiScatterDirs * ATMO_STEPS.multiScatterDirs}; i++ ) {
		float ii = ( float( i - ( i / ${ATMO_STEPS.multiScatterDirs} ) * ${ATMO_STEPS.multiScatterDirs} ) + 0.5 ) / ${f(ATMO_STEPS.multiScatterDirs)};
		float jj = ( float( i / ${ATMO_STEPS.multiScatterDirs} ) + 0.5 ) / ${f(ATMO_STEPS.multiScatterDirs)};
		float theta = ii * 2.0 * ATMO_PI;
		float phi = acos( 1.0 - jj * 2.0 );
		vec3 rd = vec3( cos( theta ) * sin( phi ), cos( phi ), sin( theta ) * sin( phi ) );
		float tBottom = atmoRaySphere( ro, rd, ATMO_RG );
		float tTop = atmoRaySphere( ro, rd, ATMO_RT );
		bool hitGround = tBottom > 0.0;
		float tMax = hitGround ? tBottom : max( tTop, 0.0 );
		float dt = tMax / ${f(ATMO_STEPS.multiScatter)};
		vec3 throughput = vec3( 1.0 );
		vec3 L = vec3( 0.0 );
		vec3 fms = vec3( 0.0 );
		for ( int s = 0; s < ${ATMO_STEPS.multiScatter}; s++ ) {
			float t = ( float( s ) + 0.3 ) * dt;
			vec3 p = ro + rd * t;
			float pr = length( p );
			AtmoMedium m = atmoMedium( pr - ATMO_RG );
			vec3 up = p / pr;
			float cosSunP = dot( up, sunDir );
			vec3 tSun = atmoTransmittance( pr, cosSunP );
			float earthShadow = atmoRaySphere( p, sunDir, ATMO_RG ) > 0.0 ? 0.0 : 1.0;
			vec3 S = tSun * earthShadow * m.scattering * isoPhase;
			vec3 tStep = exp( - m.extinction * dt );
			vec3 ext = max( m.extinction, vec3( 1e-6 ) );
			L += throughput * ( S - S * tStep ) / ext;
			fms += throughput * ( m.scattering - m.scattering * tStep ) / ext;
			throughput *= tStep;
		}
		if ( hitGround ) {
			vec3 p = ro + rd * tMax;
			vec3 up = normalize( p );
			float cosS = dot( up, sunDir );
			vec3 tSun = atmoTransmittance( ATMO_RG, cosS );
			L += tSun * throughput * max( cosS, 0.0 ) * uAtmoGroundAlbedo / ATMO_PI;
		}
		lSum += L;
		fmsSum += fms;
	}
	float dirWeight = 4.0 * ATMO_PI / ${f(ATMO_STEPS.multiScatterDirs * ATMO_STEPS.multiScatterDirs)};
	vec3 lIn = lSum * dirWeight * isoPhase;
	vec3 fmsAvg = fmsSum * dirWeight * isoPhase;
	gl_FragColor = vec4( lIn / ( vec3( 1.0 ) - fmsAvg ), 1.0 );
}`;

const SKY_VIEW_FRAGMENT = /* glsl */`
${ATMOSPHERE_CORE_GLSL}
uniform vec3 uAtmoSunDir;
uniform float uAtmoViewHeight;
varying vec2 vUv;
void main() {
	float u = ( vUv.x - ${f(0.5 / SV_W)} ) * ${f(SV_W / (SV_W - 1))};
	float v = ( vUv.y - ${f(0.5 / SV_H)} ) * ${f(SV_H / (SV_H - 1))};
	float viewH = uAtmoViewHeight;
	float vHorizon = sqrt( max( viewH * viewH - ATMO_RG * ATMO_RG, 0.0 ) );
	float beta = acos( clamp( vHorizon / viewH, -1.0, 1.0 ) );
	float zenithHorizon = ATMO_PI - beta;
	float vza;
	if ( v < 0.5 ) {
		float c = 1.0 - v * 2.0;
		vza = zenithHorizon * ( 1.0 - c * c );
	} else {
		float c = v * 2.0 - 1.0;
		vza = zenithHorizon + beta * c * c;
	}
	float cosVz = cos( vza );
	float sinVz = sin( vza );
	float lightViewCos = 1.0 - 2.0 * u * u;
	float lightViewSin = sqrt( max( 1.0 - lightViewCos * lightViewCos, 0.0 ) );
	// local frame: up = +y, the sun's azimuth along +x
	float sunCosZ = uAtmoSunDir.y;
	float sunSinZ = sqrt( max( 1.0 - sunCosZ * sunCosZ, 0.0 ) );
	vec3 sunDir = vec3( sunSinZ, sunCosZ, 0.0 );
	vec3 rd = vec3( sinVz * lightViewCos, cosVz, sinVz * lightViewSin );
	vec3 ro = vec3( 0.0, viewH, 0.0 );
	float tBottom = atmoRaySphere( ro, rd, ATMO_RG );
	float tTop = atmoRaySphere( ro, rd, ATMO_RT );
	float tMax = tBottom > 0.0 ? tBottom : max( tTop, 0.0 );
	float cosTheta = dot( rd, sunDir );
	float rayPhase = atmoRayleighPhase( cosTheta );
	float miePhase = atmoMiePhase( cosTheta, uAtmoMieG );
	vec3 throughput = vec3( 1.0 );
	vec3 L = vec3( 0.0 );
	for ( int i = 0; i < ${ATMO_STEPS.skyView}; i++ ) {
		float t0 = float( i ) / ${f(ATMO_STEPS.skyView)};
		float t1 = ( float( i ) + 1.0 ) / ${f(ATMO_STEPS.skyView)};
		float ta = t0 * t0 * tMax;
		float tb = t1 * t1 * tMax;
		float t = mix( ta, tb, 0.3 );
		float dt = tb - ta;
		vec3 p = ro + rd * t;
		float pr = length( p );
		AtmoMedium m = atmoMedium( pr - ATMO_RG );
		vec3 up = p / pr;
		float cosSunP = dot( up, sunDir );
		vec3 tSun = atmoTransmittance( pr, cosSunP );
		float earthShadow = atmoRaySphere( p, sunDir, ATMO_RG ) > 0.0 ? 0.0 : 1.0;
		vec3 ms = atmoMultiScatter( pr, cosSunP );
		vec3 phaseScat = m.rayScat * rayPhase + m.mieScat * miePhase;
		vec3 S = tSun * earthShadow * phaseScat + ms * m.scattering;
		vec3 tStep = exp( - m.extinction * dt );
		vec3 ext = max( m.extinction, vec3( 1e-6 ) );
		L += throughput * ( S - S * tStep ) / ext;
		throughput *= tStep;
	}
	gl_FragColor = vec4( L * uAtmoSunIlluminance, 1.0 );
}`;

// The summary: eight float texels the CPU reads back once per atmosphere change (never per frame).
//   0 cosine-weighted hemisphere irradiance / π of the visible sky (the hemisphere light's hue)
//   1 transmittance from the viewer toward the sun (the sun disc's colour)
//   2 anti-solar horizon average, elevation 1.25° over ±20° of azimuth (the fog colour, the legacy probe's row 8)
//   3 the same band at 16.25° (row 14: the elevation falloff of round 37 is texel 3 over texel 2)
//   4 zenith   5 sun-side horizon average   6 mean upper-hemisphere luminance   7 unused
const SUMMARY_FRAGMENT = /* glsl */`
${ATMOSPHERE_CORE_GLSL}
${ATMOSPHERE_SKY_GLSL}
varying vec2 vUv;
vec3 atmoBand( float elevationDeg, vec3 towards ) {
	vec3 sum = vec3( 0.0 );
	float el = elevationDeg * ATMO_PI / 180.0;
	float base = atan( towards.z, towards.x );
	for ( int i = 0; i < 9; i++ ) {
		float az = base + ( float( i ) - 4.0 ) * ( 5.0 * ATMO_PI / 180.0 );
		vec3 d = vec3( cos( el ) * cos( az ), sin( el ), cos( el ) * sin( az ) );
		sum += atmoSkyVisible( d );
	}
	return sum / 9.0;
}
void main() {
	int texel = int( floor( vUv.x * ${f(SUMMARY_W)} ) );
	vec3 outv = vec3( 0.0 );
	if ( texel == 0 ) {
		for ( int i = 0; i < 256; i++ ) {
			float a = ( float( i - ( i / 16 ) * 16 ) + 0.5 ) / 16.0;
			float b = ( float( i / 16 ) + 0.5 ) / 16.0;
			float rr = sqrt( b );
			float phi = a * 2.0 * ATMO_PI;
			vec3 d = vec3( rr * cos( phi ), sqrt( max( 1.0 - b, 0.0 ) ), rr * sin( phi ) );
			outv += atmoSkyVisible( d );
		}
		outv /= 256.0;
	} else if ( texel == 1 ) {
		outv = atmoTransmittance( uAtmoViewH, uAtmoSun.y );
	} else if ( texel == 2 ) {
		outv = atmoBand( 1.25, - uAtmoSun );
	} else if ( texel == 3 ) {
		outv = atmoBand( 16.25, - uAtmoSun );
	} else if ( texel == 4 ) {
		outv = atmoSkyVisible( vec3( 0.0, 1.0, 0.0 ) );
	} else if ( texel == 5 ) {
		outv = atmoBand( 1.25, uAtmoSun );
	} else if ( texel == 6 ) {
		float lum = 0.0;
		for ( int i = 0; i < 64; i++ ) {
			float a = ( float( i - ( i / 8 ) * 8 ) + 0.5 ) / 8.0;
			float b = ( float( i / 8 ) + 0.5 ) / 8.0;
			float phi = a * 2.0 * ATMO_PI;
			float y = b;
			float rr = sqrt( max( 1.0 - y * y, 0.0 ) );
			lum += dot( atmoSkyVisible( vec3( rr * cos( phi ), y, rr * sin( phi ) ) ), vec3( 0.2126, 0.7152, 0.0722 ) );
		}
		outv = vec3( lum / 64.0 );
	}
	gl_FragColor = vec4( outv, 1.0 );
}`;

export interface AtmosphereSummary {
  irradiance: THREE.Color;
  sunTransmittance: THREE.Color;
  horizon: THREE.Color;
  horizonElevated: THREE.Color;
  zenith: THREE.Color;
  sunHorizon: THREE.Color;
  meanLuminance: number;
  /** Luminance of the +16.25° band over the horizon band (round 37's falloff), 1 when degenerate. */
  elevationFalloff: number;
}

function makeLut(width: number, height: number, type: THREE.TextureDataType): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(width, height, {
    type, format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
  });
  rt.texture.name = `atmosphere-lut-${width}x${height}`;
  return rt;
}

/** The renderer supports the float render targets and readback the LUTs need (WebGL2 desktop class). */
export function atmosphereSupported(renderer: THREE.WebGLRenderer): boolean {
  try {
    const capabilities = renderer.capabilities as { isWebGL2?: boolean };
    return capabilities.isWebGL2 !== false && renderer.extensions.has('EXT_color_buffer_float');
  } catch {
    return false;
  }
}

function paramsMediumKey(p: AtmosphereParams): string {
  return [p.rayleighScale, p.mieScale, p.ozoneScale, ...p.mieTint].join(',');
}
function paramsMultiScatterKey(p: AtmosphereParams): string {
  return `${paramsMediumKey(p)}|${p.groundAlbedo.join(',')}`;
}
/** The whole-parameter key: the sky-view LUT and every consumer uniform follow it. */
export function atmosphereKey(p: AtmosphereParams, skyIntensity = 1): string {
  return `${paramsMultiScatterKey(p)}|${p.mieG},${p.sunIlluminance},${p.viewHeightKm}|${p.sunDir.join(',')}|${skyIntensity}`;
}

/**
 * The three LUTs and the summary, owned by the sky rig. `update` renders only the passes whose inputs
 * changed (the transmittance LUT when the medium does, the multiple-scattering LUT when the medium or the
 * ground albedo does, the sky-view LUT and the summary whenever anything does) and returns whether the
 * sky-view LUT was rebuilt. A restored or replaced graphics context invalidates every key.
 */
export class AtmosphereLuts {
  readonly transmittance: THREE.WebGLRenderTarget;
  readonly multiScatter: THREE.WebGLRenderTarget;
  readonly skyView: THREE.WebGLRenderTarget;
  readonly summary: AtmosphereSummary;
  private readonly summaryTarget: THREE.WebGLRenderTarget;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly quad: FullScreenQuad;
  private readonly transmittanceMaterial: THREE.ShaderMaterial;
  private readonly multiScatterMaterial: THREE.ShaderMaterial;
  private readonly skyViewMaterial: THREE.ShaderMaterial;
  private readonly summaryMaterial: THREE.ShaderMaterial;
  private mediumKey: string | null = null;
  private multiScatterKey: string | null = null;
  private skyViewKey: string | null = null;
  private context: ReturnType<THREE.WebGLRenderer['getContext']> | null = null;
  private rendererInfo: THREE.WebGLRenderer['info'] | null = null;
  private readonly summaryPixels = new Float32Array(SUMMARY_W * 4);
  /** True after a summary readback returned finite, non-black values for the current key. */
  summaryValid = false;

  constructor(renderer: THREE.WebGLRenderer, knee: readonly [number, number, number]) {
    this.renderer = renderer;
    this.transmittance = makeLut(T_W, T_H, THREE.HalfFloatType);
    this.multiScatter = makeLut(MS_W, MS_H, THREE.HalfFloatType);
    this.skyView = makeLut(SV_W, SV_H, THREE.HalfFloatType);
    this.summaryTarget = makeLut(SUMMARY_W, 1, THREE.FloatType);
    this.summaryTarget.texture.minFilter = THREE.NearestFilter;
    this.summaryTarget.texture.magFilter = THREE.NearestFilter;
    const core = () => ({
      uAtmoRayleigh: { value: 1 }, uAtmoMie: { value: 1 }, uAtmoOzone: { value: 1 },
      uAtmoMieTint: { value: new THREE.Vector3(1, 1, 1) }, uAtmoGroundAlbedo: { value: new THREE.Vector3(0.25, 0.25, 0.25) },
      uAtmoMieG: { value: 0.8 }, uAtmoSunIlluminance: { value: new THREE.Vector3(1, 1, 1) },
      tAtmoTransmittance: { value: this.transmittance.texture }, tAtmoMultiScatter: { value: this.multiScatter.texture },
    });
    const material = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) => new THREE.ShaderMaterial({
      vertexShader: QUAD_VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false,
    });
    this.transmittanceMaterial = material(TRANSMITTANCE_FRAGMENT, core());
    this.multiScatterMaterial = material(MULTI_SCATTER_FRAGMENT, core());
    this.skyViewMaterial = material(SKY_VIEW_FRAGMENT, {
      ...core(), uAtmoSunDir: { value: new THREE.Vector3(0, 1, 0) }, uAtmoViewHeight: { value: ATMO_GROUND_KM + 0.05 },
    });
    this.summaryMaterial = material(SUMMARY_FRAGMENT, {
      ...core(), tAtmoSky: { value: this.skyView.texture }, uAtmoSun: { value: new THREE.Vector3(0, 1, 0) },
      uAtmoViewH: { value: ATMO_GROUND_KM + 0.05 }, uAtmoKnee: { value: new THREE.Vector3(...knee) },
      uAtmoIntensity: { value: 1 },
    });
    this.quad = new FullScreenQuad(this.transmittanceMaterial);
    this.summary = {
      irradiance: new THREE.Color(0.3, 0.4, 0.6), sunTransmittance: new THREE.Color(1, 1, 1),
      horizon: new THREE.Color(0.45, 0.5, 0.55), horizonElevated: new THREE.Color(0.2, 0.3, 0.5),
      zenith: new THREE.Color(0.1, 0.2, 0.45), sunHorizon: new THREE.Color(0.5, 0.5, 0.5),
      meanLuminance: 0.3, elevationFalloff: 1,
    };
  }

  private applyCore(uniforms: Record<string, THREE.IUniform>, p: AtmosphereParams): void {
    uniforms.uAtmoRayleigh.value = p.rayleighScale;
    uniforms.uAtmoMie.value = p.mieScale;
    uniforms.uAtmoOzone.value = p.ozoneScale;
    (uniforms.uAtmoMieTint.value as THREE.Vector3).set(...p.mieTint);
    (uniforms.uAtmoGroundAlbedo.value as THREE.Vector3).set(...p.groundAlbedo);
    uniforms.uAtmoMieG.value = p.mieG;
    (uniforms.uAtmoSunIlluminance.value as THREE.Vector3).setScalar(p.sunIlluminance);
  }

  private renderPass(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget): void {
    const renderer = this.renderer;
    const prevTarget = renderer.getRenderTarget();
    const prevFace = renderer.getActiveCubeFace(), prevMip = renderer.getActiveMipmapLevel();
    const prevXr = renderer.xr.enabled, prevToneMapping = renderer.toneMapping, prevAutoClear = renderer.autoClear;
    try {
      renderer.xr.enabled = false;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.autoClear = false;
      renderer.setRenderTarget(target);
      this.quad.material = material;
      this.quad.render(renderer);
    } finally {
      renderer.xr.enabled = prevXr;
      renderer.toneMapping = prevToneMapping;
      renderer.autoClear = prevAutoClear;
      renderer.setRenderTarget(prevTarget, prevFace, prevMip);
    }
  }

  private refreshLifetime(): void {
    const context = this.renderer.getContext();
    if (context !== this.context || this.renderer.info !== this.rendererInfo || context.isContextLost()) {
      this.context = context;
      this.rendererInfo = this.renderer.info;
      this.mediumKey = this.multiScatterKey = this.skyViewKey = null;
      this.summaryValid = false;
    }
  }

  /** Render whatever the parameters invalidated; returns true when the sky-view LUT (and summary) changed. */
  update(p: AtmosphereParams, skyIntensity: number): boolean {
    this.refreshLifetime();
    if (this.context?.isContextLost()) return false;
    const mediumKey = paramsMediumKey(p);
    const multiScatterKey = paramsMultiScatterKey(p);
    const skyViewKey = atmosphereKey(p, skyIntensity);
    if (skyViewKey === this.skyViewKey && this.summaryValid) return false;
    if (mediumKey !== this.mediumKey) {
      this.applyCore(this.transmittanceMaterial.uniforms, p);
      this.renderPass(this.transmittanceMaterial, this.transmittance);
      this.mediumKey = mediumKey;
      this.multiScatterKey = null;
    }
    if (multiScatterKey !== this.multiScatterKey) {
      this.applyCore(this.multiScatterMaterial.uniforms, p);
      this.renderPass(this.multiScatterMaterial, this.multiScatter);
      this.multiScatterKey = multiScatterKey;
    }
    const sv = this.skyViewMaterial.uniforms;
    this.applyCore(sv, p);
    (sv.uAtmoSunDir.value as THREE.Vector3).set(...p.sunDir).normalize();
    sv.uAtmoViewHeight.value = ATMO_GROUND_KM + p.viewHeightKm;
    this.renderPass(this.skyViewMaterial, this.skyView);
    this.skyViewKey = skyViewKey;
    const su = this.summaryMaterial.uniforms;
    this.applyCore(su, p);
    (su.uAtmoSun.value as THREE.Vector3).set(...p.sunDir).normalize();
    su.uAtmoViewH.value = ATMO_GROUND_KM + p.viewHeightKm;
    su.uAtmoIntensity.value = skyIntensity;
    this.renderPass(this.summaryMaterial, this.summaryTarget);
    this.readSummary(skyIntensity);
    return true;
  }

  private readSummary(skyIntensity: number): void {
    const px = this.summaryPixels;
    px.fill(0);
    let read = false;
    try {
      this.renderer.readRenderTargetPixels(this.summaryTarget, 0, 0, SUMMARY_W, 1, px);
      read = true;
    } catch {
      read = false;
    }
    const finite = read && px.every(Number.isFinite);
    const horizonLum = 0.2126 * px[8] + 0.7152 * px[9] + 0.0722 * px[10];
    // A black or non-finite readback (a lost context, a driver without float readback) keeps the previous
    // summary and reports it invalid so the rig can fall back; a dim night preset is legitimately dark.
    if (!finite || horizonLum <= 1e-6 * Math.max(skyIntensity, 1e-3)) {
      this.summaryValid = false;
      return;
    }
    const s = this.summary;
    s.irradiance.setRGB(px[0], px[1], px[2]);
    s.sunTransmittance.setRGB(px[4], px[5], px[6]);
    s.horizon.setRGB(px[8], px[9], px[10]);
    s.horizonElevated.setRGB(px[12], px[13], px[14]);
    s.zenith.setRGB(px[16], px[17], px[18]);
    s.sunHorizon.setRGB(px[20], px[21], px[22]);
    s.meanLuminance = px[24];
    const elevatedLum = 0.2126 * px[12] + 0.7152 * px[13] + 0.0722 * px[14];
    s.elevationFalloff = horizonLum > 1e-6 ? Math.min(1, Math.max(0.05, elevatedLum / horizonLum)) : 1;
    this.summaryValid = true;
  }

  dispose(): void {
    this.transmittance.dispose();
    this.multiScatter.dispose();
    this.skyView.dispose();
    this.summaryTarget.dispose();
    this.transmittanceMaterial.dispose();
    this.multiScatterMaterial.dispose();
    this.skyViewMaterial.dispose();
    this.summaryMaterial.dispose();
    this.quad.dispose();
    this.mediumKey = this.multiScatterKey = this.skyViewKey = null;
    this.summaryValid = false;
  }
}
