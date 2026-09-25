/**
 * volumetricClouds.ts — the raymarched cloud layer over every battlefield (round 68, 2026-09-24).
 *
 * A slab of cumulus / stratus between a map's cloud base and top, its coverage cut from the weather field by
 * the map's derived preset (cloudPresets.ts), its shape from the tileable Perlin–Worley volume eroded by the
 * detail volume (cloudNoise.ts), lit by the round-65 atmosphere: the sun's irradiance through the transmittance
 * LUT, the ambient from the sky-view summary, Beer–Lambert with the powder term of Schneider & Vos 2015 and
 * the multiple-scattering octaves of Wrenninge 2013 / Hillaire 2016 (attenuation, contribution and eccentricity
 * each halved per octave), a dual-lobe Henyey–Greenstein phase whose forward lobe gives the silver lining.
 * Written from those papers; nothing is copied from any reference renderer, and every noise texture is
 * generated at boot by cloudNoise.ts.
 *
 * Cost: the march runs into a trace target of one sixteenth of a half-resolution history (a 4 × 4 slot cycle
 * over sixteen frames, Bayer-ordered, four slots a frame while the history rebuilds after a camera cut) and
 * a resolve pass reprojects the previous history through the previous camera (the anchor is the slab's
 * mid-altitude along the ray), clamps it to the neighbourhood of this frame's samples and blends the fresh
 * slot in. The composite is a horizon-flattened dome mesh in the scene's transparent queue (depth-tested by
 * the terrain and the ring, never writing depth), premultiplied over the physically based dome, sampling the
 * history with a Catmull-Rom filter. The far haze is the aerial pass's own law with the sky-view LUT as its
 * target, so a cloud bank and the far ring converge on the same sky. Cloud shadows come from a per-cascade
 * alpha-tested plane on the shadow-only layer (the CSM carries them at no shading cost); post.ts owns one
 * hook: `scene.userData.volumetricClouds.beforeSceneRender(...)` at the top of its frame transaction.
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { ATMOSPHERE_SKY_GLSL, ATMO_GROUND_KM } from './atmosphere.ts';
import type { AtmospherePublishedState } from './sky.ts';
import { markShadowOnly } from './renderLayers.ts';
import { CLOUD_DETAIL_SIZE, CLOUD_SHAPE_SIZE, CLOUD_WEATHER_SIZE } from './cloudNoise.ts';
import { cloudLayerKey, type CloudLayerPreset } from './cloudPresets.ts';

/** History resolution relative to the scene target; the trace target is a quarter of the history each way. */
export const CLOUD_HISTORY_SCALE = 0.5;
export const CLOUD_TRACE_DIVISOR = 4;
/** Slots traced per frame while the history rebuilds after a cut (all sixteen after four frames). */
export const CLOUD_REBUILD_SLOTS = 4;
/**
 * The 4 × 4 Bayer matrix: slot k of a cycle is the cell holding value k, so consecutive frames trace cells as
 * far apart as possible and the rebuild sharpens evenly.
 */
export const CLOUD_BAYER_4 = Object.freeze([
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const);
/** slot k → [x, y] of the Bayer cell whose value is k. */
export const CLOUD_SLOT_ORDER: readonly (readonly [number, number])[] = Object.freeze(Array.from({ length: 16 }, (_, k) => {
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (CLOUD_BAYER_4[y][x] === k) return [x, y] as const;
  throw new Error('bayer');
}));
/** World periods of the weather field, the shape volume (cumuliform / stratiform) and the detail volume (m). */
export const CLOUD_WEATHER_TILE_M = 12000;
export const CLOUD_SHAPE_TILE_M = 1700;
export const CLOUD_SHAPE_TILE_STRATUS_M = 4200;
export const CLOUD_DETAIL_TILE_M = 400;
/** March limits: steps, the farthest slant distance marched (m) and the dome shell radius (inside camera.far). */
export const CLOUD_MARCH_STEPS = 72;
export const CLOUD_MARCH_MAX_M = 14000;
export const CLOUD_DOME_RADIUS_M = 3400;
/** Camera-cut thresholds: a jump (m), a turn (rad) or a zoom (relative tangent) that invalidates the history. */
export const CLOUD_CUT_JUMP_M = 6;
export const CLOUD_CUT_TURN_RAD = 0.35;
export const CLOUD_CUT_ZOOM = 1e-3;
/**
 * The aerial pass's haze law (post.ts AERIAL_* constants, mirrored so a cloud bank converges like the ring):
 * extinction and scatter-in densities (1/m), their ceilings, the desaturation and cool shift. The target is the
 * sky-view LUT along the ray itself, without the pass's luminance caps: those keep a lit mountain from blowing
 * out against the haze, but a cloud bank fades into the sky it stands against, and a capped target left every
 * far deck a band darker than the sky around it (winter / whiteout skylines rose a tenth).
 */
export const CLOUD_AERIAL = Object.freeze({
  density: 0.00145, hazeDensity: 0.00092, hazeStart: 85, extCeiling: 0.60, scatterCeiling: 0.55,
  desat: 0.62, cool: [0.90, 0.97, 1.08] as const,
  /** the pass's height-aware atmosphere: the falloff's start over the camera (m), its e-fold height, the shares */
  heightRef: 30, heightScale: 150, heightScatterK: 0.75, heightExtK: 0.35,
});
/** Light march toward the sun: sample distances (m) from the point, on the base shape (no detail erosion). */
export const CLOUD_LIGHT_TAPS = Object.freeze([14, 34, 70, 140, 280, 560] as const);

const f = (x: number): string => { const s = String(x); return s.includes('.') || s.includes('e') ? s : `${s}.0`; };

const QUAD_VERTEX = /* glsl */`
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}`;

/** The camera frame, the slab and the noise lookups shared by the trace and the resolve. */
const CLOUD_COMMON_GLSL = /* glsl */`
uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;
uniform vec2 uCamTan;
uniform vec2 uHistorySize;
uniform vec2 uTraceSize;
uniform float uBase;
uniform float uThick;
// view direction of a history uv (y up)
vec3 cloudViewDir( vec2 uv ) {
	vec2 ndc = ( uv * 2.0 - 1.0 ) * uCamTan;
	return normalize( uCamFwd + uCamRight * ndc.x + uCamUp * ndc.y );
}
// slant distance along dir from the camera to the slab's mid altitude (the reprojection anchor), bounded
float cloudAnchorDistance( vec3 dir ) {
	float mid = uBase + uThick * 0.5;
	float dy = dir.y;
	if ( abs( dy ) < 0.01 ) dy = dy < 0.0 ? -0.01 : 0.01;
	float t = ( mid - uCamPos.y ) / dy;
	return clamp( t, 200.0, ${f(CLOUD_MARCH_MAX_M)} );
}
// uv of a world point seen by a camera given by its basis and tangents; z < 0 when behind it
vec3 cloudProject( vec3 p, vec3 camPos, vec3 right, vec3 up, vec3 fwd, vec2 tanv ) {
	vec3 d = p - camPos;
	float z = dot( d, fwd );
	vec2 ndc = vec2( dot( d, right ), dot( d, up ) ) / ( tanv * max( z, 1e-4 ) );
	return vec3( ndc * 0.5 + 0.5, z );
}
`;

const TRACE_FRAGMENT = /* glsl */`
precision highp float;
precision highp sampler3D;
${ATMOSPHERE_SKY_GLSL}
${CLOUD_COMMON_GLSL}
uniform sampler3D tShape;
uniform sampler3D tDetail;
uniform sampler2D tWeather;
uniform vec2 uSlot;
uniform vec2 uSubPixel;
uniform float uFrameNoise;
uniform vec3 uSunDir;
uniform vec3 uSunRadiance;
uniform vec3 uAmbientTop;
uniform vec3 uAmbientBottom;
uniform vec3 uSkyMean;
uniform float uCoverage;
uniform float uTowers;
uniform float uStratiform;
uniform float uDensity;
uniform vec3 uTint;
uniform vec2 uWeatherShift;
uniform vec3 uNoiseShift;
uniform float uShapeTile;
uniform float uSunGain;
uniform float uClearRadius;
uniform float uPixelAngle;
varying vec2 vUv;
const float CL_PI = 3.14159265358979;
float remap( float v, float lo, float hi, float nlo, float nhi ) {
	return clamp( ( v - lo ) / max( hi - lo, 1e-4 ), 0.0, 1.0 ) * ( nhi - nlo ) + nlo;
}
float phaseHG( float c, float g ) {
	float g2 = g * g;
	return ( 1.0 - g2 ) / ( 4.0 * CL_PI * pow( max( 1.0 + g2 - 2.0 * g * c, 1e-4 ), 1.5 ) );
}
// interleaved gradient noise (Jimenez 2014) on the trace grid
float ign( vec2 px ) { return fract( 52.9829189 * fract( dot( px, vec2( 0.06711056, 0.00583715 ) ) ) ); }
// the weather at a world xz: x = local coverage strength 0..1, y = column top (fraction of the slab), z = breakup
vec3 cloudWeather( vec2 pxz ) {
	vec2 uv = ( pxz + uWeatherShift ) / ${f(CLOUD_WEATHER_TILE_M)};
	vec4 w = texture2D( tWeather, uv );
	// the cumuliform field (the cells) or the stratiform one (the broad regions), both equalised so the map's
	// coverage admits exactly that fraction; inside, the local coverage runs 0..1 (skewed high) and carves the
	// base shape into lumps — a region is never one solid slab
	float field = mix( w.r, w.b, uStratiform );
	float cov = pow( clamp( ( field - ( 1.0 - uCoverage ) ) / max( uCoverage, 0.02 ), 0.0, 1.0 ), mix( 0.7, 0.4, uStratiform ) );
	// a storm keeps the sky over the camera open: its towers stand off toward the horizon
	if ( uClearRadius > 0.0 ) cov *= smoothstep( uClearRadius * 0.6, uClearRadius * 1.4, length( pxz - uCamPos.xz ) );
	// cumuliform columns rise where the local coverage is deepest (one dome per mass, not a tower per cell)
	// with the breakup noise on top; storms add towers at the cells; a stratus ceiling is nearly flat
	float cumTop = clamp( 0.5 + 0.5 * sqrt( cov ) + ( w.a - 0.5 ) * 0.2, 0.3, 1.0 );
	cumTop = mix( cumTop, 1.0, uTowers * w.g );
	float strTop = 0.78 + 0.22 * w.a;
	return vec3( cov, mix( cumTop, strTop, uStratiform ), w.a );
}
// density 0..1 at a world point. detail: whether the erosion volumes are sampled (the light march skips them);
// foot: the pixel footprint (m) at the point, which fades the fine erosion fetch out at range
float cloudDensity( vec3 p, vec3 w, bool detail, float foot ) {
	// the base line wanders a little per column (the breakup channel) so no razor-straight edge crosses the sky
	float hRel = ( p.y - uBase - ( w.z - 0.5 ) * mix( 0.05, 0.064, uStratiform ) * uThick ) / uThick;
	float hN = hRel / max( w.y, 0.05 );
	if ( hN <= 0.0 || hN >= 1.0 || w.x <= 0.0 ) return 0.0;
	// a flat base at the cloud base altitude, a domed eroded top (a stratus keeps its sheet almost to its
	// top); a cumulus narrows toward its top so its silhouette is a dome over a wide base, not a lens
	float hg = smoothstep( 0.0, 0.04, hN ) * smoothstep( 1.0, mix( 0.7, 0.92, uStratiform ), hN ) * ( 1.0 - 0.2 * hN * ( 1.0 - uStratiform ) );
	// the slab is a few hundred metres thick against a kilometres-wide shape period: the volume is sampled
	// with its vertical axis compressed so the billows read as tall as they are wide
	vec3 sp = ( p + uNoiseShift ) * vec3( 1.0, 1.4, 1.0 ) / uShapeTile;
	vec4 s = texture( tShape, sp );
	float lowFreq = s.g * 0.625 + s.b * 0.25 + s.a * 0.125;
	float base = remap( s.r, lowFreq - 1.0, 1.0, 0.0, 1.0 ) * hg;
	// a stratus sheet is dense across its footprint (with a little mottle); cumulus keeps the shape's billows
	base = mix( base, base * 0.3 + 0.7 * hg, uStratiform * 0.8 );
	// the coverage threshold rises with height so a mass is widest at its base and narrows to a dome
	float covH = w.x * ( 1.0 - 0.45 * hN * ( 1.0 - uStratiform ) );
	float d = remap( base, 1.0 - covH, 1.0, 0.0, 1.0 ) * w.x;
	if ( detail && d > 0.0 && d < 0.95 ) {
		// two Worley-fbm fetches: the coarse one (lumps of 25 - 100 m) everywhere, a fine one (7 - 27 m) where
		// the pixel footprint resolves it; the octaves lean to the high frequencies so the silhouette crinkles
		vec3 dp = ( p + uNoiseShift * 1.31 ) * vec3( 1.0, 1.5, 1.0 ) / ${f(CLOUD_DETAIL_TILE_M)};
		vec3 dn = texture( tDetail, dp ).rgb;
		float hf = dn.r * 0.5 + dn.g * 0.3 + dn.b * 0.2;
		float fineW = 1.0 - smoothstep( 8.0, 30.0, foot );
		if ( fineW > 0.0 ) {
			vec3 dn2 = texture( tDetail, dp * 3.7 + 0.37 ).rgb;
			hf = mix( hf, hf * 0.55 + ( dn2.r * 0.5 + dn2.g * 0.3 + dn2.b * 0.2 ) * 0.45, fineW );
		}
		// wisps underneath, cauliflower lumps on top; the erosion grows with height in the cloud (a flat dense
		// base, billowy tops), a storm's base is ragged, a stratus erodes little
		float erode = mix( hf, 1.0 - hf, clamp( hN * 8.0, 0.0, 1.0 ) );
		float amount = ( mix( 0.32, 0.62, smoothstep( 0.05, 0.6, hN ) ) + uTowers * 0.4 * ( 1.0 - smoothstep( 0.0, 0.12, hN ) ) ) * ( 1.0 - uStratiform * 0.85 );
		d = remap( d, erode * amount, 1.0, 0.0, 1.0 );
	}
	return d;
}
// light optical depth toward the sun from p (the weather column of p for the near taps)
float cloudLightDepth( vec3 p, vec3 w ) {
	float od = 0.0;
	float prev = 0.0;
${CLOUD_LIGHT_TAPS.map((dist, k) => `	{
		vec3 lp = p + uSunDir * ${f(dist)};
		vec3 lw = ${k < 2 ? 'w' : 'cloudWeather( lp.xz )'};
		od += cloudDensity( lp, lw, false, 0.0 ) * ${f(dist - (k === 0 ? 0 : CLOUD_LIGHT_TAPS[k - 1]))};
	}`).join('\n')}
	return od * uDensity;
}
void main() {
	// the history pixel this trace texel refreshes (its slot of the 4 x 4 block), sub-pixel jittered
	vec2 tp = floor( gl_FragCoord.xy );
	vec2 px = tp * ${f(CLOUD_TRACE_DIVISOR)} + uSlot + 0.5 + uSubPixel;
	vec3 dir = cloudViewDir( px / uHistorySize );
	float jitter = fract( ign( tp ) + uFrameNoise );
	// the slab along the ray (the camera may sit below, inside or above it)
	float dy = dir.y;
	vec4 outv = vec4( 0.0, 0.0, 0.0, 1.0 );
	float t0, t1;
	if ( abs( dy ) < 1e-4 ) {
		bool inside = uCamPos.y > uBase && uCamPos.y < uBase + uThick;
		t0 = 0.0; t1 = inside ? ${f(CLOUD_MARCH_MAX_M)} : -1.0;
	} else {
		float ta = ( uBase - uCamPos.y ) / dy;
		float tb = ( uBase + uThick - uCamPos.y ) / dy;
		t0 = max( min( ta, tb ), 0.0 );
		t1 = min( max( ta, tb ), ${f(CLOUD_MARCH_MAX_M)} );
	}
	if ( t1 > t0 ) {
		float cosT = dot( dir, uSunDir );
		// dual-lobe phase per octave: the forward lobe carries the silver lining, the back lobe the fill
		vec3 gF = vec3( 0.80, 0.40, 0.20 ), gB = vec3( -0.20, -0.10, -0.05 );
		vec3 phase = vec3( phaseHG( cosT, gF.x ), phaseHG( cosT, gF.y ), phaseHG( cosT, gF.z ) ) * 0.8
			+ vec3( phaseHG( cosT, gB.x ), phaseHG( cosT, gB.y ), phaseHG( cosT, gB.z ) ) * 0.2;
		// the powder term fades toward the sun, where the forward peak lights the thin edges instead
		float powderK = clamp( cosT * -0.5 + 0.6, 0.0, 1.0 );
		float span = t1 - t0;
		float ds = clamp( span / ${f(CLOUD_MARCH_STEPS)}, max( 8.0, uThick / 24.0 ), 90.0 );
		float t = t0 + ds * jitter;
		vec3 L = vec3( 0.0 );
		float T = 1.0;
		float tAcc = 0.0, wAcc = 0.0;
		int empty = 0;
		for ( int i = 0; i < ${CLOUD_MARCH_STEPS}; i++ ) {
			if ( t > t1 || T < 0.02 ) break;
			vec3 p = uCamPos + dir * t;
			vec3 w = cloudWeather( p.xz );
			float dens = w.x > 0.0 ? cloudDensity( p, w, true, t * uPixelAngle ) : 0.0;
			if ( dens > 0.003 ) {
				if ( empty > 0 ) {
					// back onto the fine lattice where the stride met cloud: a boundary found on the coarse
					// stride is the same for neighbouring rays and would terrace the cloud wall
					t -= ds * float( empty ) * 0.5;
					empty = 0;
					continue;
				}
				float hN = ( p.y - uBase ) / ( uThick * max( w.y, 0.05 ) );
				float sig = dens * uDensity;
				float tau = cloudLightDepth( p, w ) + sig * 4.0;
				// multiple-scattering octaves: contribution, attenuation and eccentricity halved per octave
				float sun = phase.x * exp( -tau ) + phase.y * 0.5 * exp( -tau * 0.5 ) + phase.z * 0.25 * exp( -tau * 0.25 );
				// an overcast sheet is lit by the whole sky above it, not by one reddened low sun: its diffused
				// light is the sun's luminance, neutral
				vec3 sunDiff = mix( uSunRadiance, vec3( dot( uSunRadiance, vec3( 0.2126, 0.7152, 0.0722 ) ) ), uStratiform );
				// the diffusion regime of a thick non-absorbing cloud: diffuse light is transmitted about
				// 1 / (1 + 0.75 (1 - g) tau), so the base of an overcast sheet is bright and the shaded side of a
				// cumulus stays grey, not black; it builds with height in the cloud (the lower parts are darker)
				float msV = mix( 0.55, 1.0, smoothstep( 0.0, 0.45, hN ) );
				float diffusion = 0.2 / ( 1.0 + 0.15 * tau ) * msV / ( 4.0 * CL_PI ) * 4.0;
				// in-scatter probability (powder): light builds up inside the cloud, so thin edges and the
				// underside read darker when lit from behind the viewer
				float powder = mix( 1.0, ( 1.0 - exp( -sig * 24.0 ) ) * ( 0.15 + 0.85 * smoothstep( 0.02, 0.25, hN ) ), powderK );
				// darker bases: their direct light is scattered away by the cloud above
				float baseShadow = mix( 0.55, 1.0, smoothstep( -0.1, 0.45, hN ) );
				// ambient: the sky lights the tops, the bases see the horizon; a stratus sheet is diffuser-lit
				vec3 amb = mix( uAmbientBottom, uAmbientTop, max( smoothstep( 0.0, 0.9, hN ) , uStratiform * 0.75 ) ) * ( 1.0 + uStratiform * 1.2 );
				// an overcast sheet is the sky: it is never darker than the mean sky it replaces (a low sun's
				// physically dim ceiling would otherwise sit as a grey band under the pale winter horizon)
				amb = mix( amb, max( amb, uSkyMean * 1.15 ), uStratiform );
				amb *= mix( 0.45, 1.0, 1.0 - dens * 0.5 );
				vec3 S = ( ( uSunRadiance * sun + sunDiff * diffusion ) * powder * baseShadow * uSunGain + amb ) * uTint;
				float Tstep = exp( -sig * ds );
				float dT = T * ( 1.0 - Tstep );
				L += S * dT;
				tAcc += t * dT;
				wAcc += dT;
				T *= Tstep;
				t += ds;
			} else {
				// empty space: stride longer until cloud is met again
				empty = min( empty + 1, 4 );
				t += ds * ( 1.0 + float( empty ) * 0.5 );
			}
		}
		float opacity = 1.0 - T;
		if ( wAcc > 1e-4 ) {
			// the aerial pass's law on the cloud's mean distance: desaturation and a cool shift, then the
			// scatter-in toward the sky-view LUT along the ray under the same ceilings and caps, both decaying
			// with the cloud's altitude over the camera as the pass's height-aware atmosphere does
			float dist = tAcc / wAcc;
			float hAtt = exp( -max( dir.y * dist - ${f(CLOUD_AERIAL.heightRef)}, 0.0 ) / ${f(CLOUD_AERIAL.heightScale)} );
			float x = dist * ${f(CLOUD_AERIAL.density)};
			float fe = min( 1.0 - exp( -x * x ), ${f(CLOUD_AERIAL.extCeiling)} ) * mix( 1.0, hAtt, ${f(CLOUD_AERIAL.heightExtK)} );
			float lum = dot( L, vec3( 0.2126, 0.7152, 0.0722 ) );
			vec3 hazy = mix( L, vec3( lum ), ${f(CLOUD_AERIAL.desat)} ) * vec3( ${CLOUD_AERIAL.cool.map(f).join(', ')} );
			L = mix( L, hazy, fe );
			float hz = max( dist - ${f(CLOUD_AERIAL.hazeStart)}, 0.0 ) * ${f(CLOUD_AERIAL.hazeDensity)};
			float fs = min( 1.0 - exp( -hz * hz ), ${f(CLOUD_AERIAL.scatterCeiling)} ) * mix( 1.0, hAtt, ${f(CLOUD_AERIAL.heightScatterK)} );
			vec3 skyDir = normalize( vec3( dir.x, max( dir.y, 0.02 ), dir.z ) );
			vec3 target = atmoSkyVisible( skyDir );
			L = mix( L, target * opacity, fs );
		}
		outv = vec4( max( L, vec3( 0.0 ) ), clamp( T, 0.0, 1.0 ) );
	}
	gl_FragColor = outv;
}`;

const RESOLVE_FRAGMENT = /* glsl */`
precision highp float;
${CLOUD_COMMON_GLSL}
uniform sampler2D tTrace;
uniform sampler2D tHistory;
uniform vec2 uSlot;
uniform vec3 uPrevCamPos;
uniform vec3 uPrevRight;
uniform vec3 uPrevUp;
uniform vec3 uPrevFwd;
uniform vec2 uPrevTan;
uniform float uHistoryValid;
uniform float uRebuildK;
uniform float uMinAlpha;
varying vec2 vUv;
// Catmull-Rom in five bilinear taps (the corner taps dropped)
vec4 historyCatmullRom( vec2 uv, vec2 size ) {
	vec2 sp = uv * size;
	vec2 tp1 = floor( sp - 0.5 ) + 0.5;
	vec2 fr = sp - tp1;
	vec2 w0 = fr * ( fr * ( fr * -0.5 + 1.0 ) - 0.5 );
	vec2 w1 = fr * fr * ( fr * 1.5 - 2.5 ) + 1.0;
	vec2 w2 = fr * ( fr * ( fr * -1.5 + 2.0 ) + 0.5 );
	vec2 w3 = fr * fr * ( fr * 0.5 - 0.5 );
	vec2 w12 = w1 + w2;
	vec2 tc0 = ( tp1 - 1.0 ) / size, tc3 = ( tp1 + 2.0 ) / size, tc12 = ( tp1 + w2 / w12 ) / size;
	float a = w12.x * w0.y, b = w0.x * w12.y, c = w12.x * w12.y, d = w3.x * w12.y, e = w12.x * w3.y;
	vec4 sum = texture2D( tHistory, vec2( tc12.x, tc0.y ) ) * a + texture2D( tHistory, vec2( tc0.x, tc12.y ) ) * b
		+ texture2D( tHistory, tc12 ) * c + texture2D( tHistory, vec2( tc3.x, tc12.y ) ) * d + texture2D( tHistory, vec2( tc12.x, tc3.y ) ) * e;
	return sum / ( a + b + c + d + e );
}
// this frame's samples, bilinear (they sit at the slot of each block)
vec4 upsampled( vec2 p ) {
	vec2 suv = ( ( p - uSlot ) / ${f(CLOUD_TRACE_DIVISOR)} + 0.5 ) / uTraceSize;
	return texture2D( tTrace, suv );
}
// the 4 x 4 Bayer value of a block cell = the cycle index that traces it (CLOUD_BAYER_4 / CLOUD_SLOT_ORDER)
float bayer2( vec2 c ) { return c.x * 2.0 + c.y * 3.0 - c.x * c.y * 4.0; }
float bayerRank( vec2 cell ) { return 4.0 * bayer2( mod( cell, 2.0 ) ) + bayer2( floor( cell / 2.0 ) ); }
void main() {
	vec2 p = floor( gl_FragCoord.xy );
	vec2 uv = ( p + 0.5 ) / uHistorySize;
	vec3 dir = cloudViewDir( uv );
	vec2 tp = floor( p / ${f(CLOUD_TRACE_DIVISOR)} );
	vec2 cell = p - tp * ${f(CLOUD_TRACE_DIVISOR)};
	bool fresh = cell == uSlot;
	// where was this cloud point last frame
	vec3 anchor = uCamPos + dir * cloudAnchorDistance( dir );
	vec3 pr = cloudProject( anchor, uPrevCamPos, uPrevRight, uPrevUp, uPrevFwd, uPrevTan );
	bool valid = uHistoryValid > 0.5 && pr.z > 1.0 && all( greaterThan( pr.xy, vec2( 0.0 ) ) ) && all( lessThan( pr.xy, vec2( 1.0 ) ) );
	vec4 outv;
	if ( valid ) {
		vec4 h = max( historyCatmullRom( pr.xy, uHistorySize ), vec4( 0.0 ) );
		// clamp to the range of this frame's samples around the block (with a margin): lighting and motion
		// the reprojection missed cannot ghost, so the samples average over many frames
		vec4 lo = vec4( 1e4 ), hi = vec4( -1e4 );
		ivec2 tmax = ivec2( uTraceSize ) - 1;
		for ( int y = -1; y <= 1; y++ ) for ( int x = -1; x <= 1; x++ ) {
			vec4 s = texelFetch( tTrace, clamp( ivec2( tp ) + ivec2( x, y ), ivec2( 0 ), tmax ), 0 );
			lo = min( lo, s ); hi = max( hi, s );
		}
		vec4 pad = ( hi - lo ) * 0.25 + 0.01;
		outv = uRebuildK < 0.0 ? clamp( h, lo - pad, hi + pad ) : h;
	} else {
		outv = upsampled( p );
	}
	if ( fresh ) {
		vec4 cur = texelFetch( tTrace, ivec2( tp ), 0 );
		float motion = length( ( pr.xy - uv ) * uHistorySize );
		float a = clamp( motion * 0.1 + uMinAlpha, uMinAlpha, 0.35 );
		// rebuilding after a cut: a pixel takes its own first sample as is
		outv = ( valid && uRebuildK < 0.0 ) ? mix( outv, cur, a ) : cur;
	} else if ( uRebuildK >= 0.0 && valid ) {
		// rebuilding: pixels without a sample of their own since the cut average the upsampled samples of
		// every slot traced so far (their refresh rank is the Bayer index)
		if ( bayerRank( cell ) > uRebuildK ) outv = mix( outv, upsampled( p ), 1.0 / ( uRebuildK + 1.0 ) );
	}
	gl_FragColor = vec4( max( outv.rgb, vec3( 0.0 ) ), clamp( outv.a, 0.0, 1.0 ) );
}`;

const DOME_VERTEX = /* glsl */`
varying vec3 vWorldPosition;
void main() {
	vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
	vWorldPosition = worldPosition.xyz;
	gl_Position = projectionMatrix * viewMatrix * worldPosition;
}`;

const DOME_FRAGMENT = /* glsl */`
precision highp float;
uniform sampler2D tClouds;
uniform vec2 uTargetSize;
uniform vec2 uHistorySize;
uniform vec3 uKnee;
uniform float uSkyIntensity;
varying vec3 vWorldPosition;
vec4 cloudsCatmullRom( vec2 uv, vec2 size ) {
	vec2 sp = uv * size;
	vec2 tp1 = floor( sp - 0.5 ) + 0.5;
	vec2 fr = sp - tp1;
	vec2 w0 = fr * ( fr * ( fr * -0.5 + 1.0 ) - 0.5 );
	vec2 w1 = fr * fr * ( fr * 1.5 - 2.5 ) + 1.0;
	vec2 w2 = fr * ( fr * ( fr * -1.5 + 2.0 ) + 0.5 );
	vec2 w3 = fr * fr * ( fr * 0.5 - 0.5 );
	vec2 w12 = w1 + w2;
	vec2 tc0 = ( tp1 - 1.0 ) / size, tc3 = ( tp1 + 2.0 ) / size, tc12 = ( tp1 + w2 / w12 ) / size;
	float a = w12.x * w0.y, b = w0.x * w12.y, c = w12.x * w12.y, d = w3.x * w12.y, e = w12.x * w3.y;
	vec4 sum = texture2D( tClouds, vec2( tc12.x, tc0.y ) ) * a + texture2D( tClouds, vec2( tc0.x, tc12.y ) ) * b
		+ texture2D( tClouds, tc12 ) * c + texture2D( tClouds, vec2( tc3.x, tc12.y ) ) * d + texture2D( tClouds, vec2( tc12.x, tc3.y ) ) * e;
	return sum / ( a + b + c + d + e );
}
vec3 cloudKnee( vec3 c ) {
	float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	if ( l > uKnee.x ) c *= ( uKnee.x + uKnee.y * ( 1.0 - exp( -( l - uKnee.x ) * uKnee.z ) ) ) / l;
	return c;
}
void main() {
	vec3 dir = normalize( vWorldPosition - cameraPosition );
	vec2 uv = gl_FragCoord.xy / uTargetSize;
	vec4 c = max( cloudsCatmullRom( uv, uHistorySize ), vec4( 0.0 ) );
	// nothing below the horizon line (the history holds no cloud there either)
	float above = smoothstep( -0.05, -0.02, dir.y );
	vec3 rgb = cloudKnee( c.rgb ) * uSkyIntensity * above;
	float alpha = ( 1.0 - min( c.a, 1.0 ) ) * above;
	gl_FragColor = vec4( rgb, alpha );
}`;

interface CloudNoiseTextures {
  shape: THREE.Data3DTexture | null;
  detail: THREE.Data3DTexture | null;
  weather: THREE.DataTexture | null;
  /** The weather's coverage field in the green channel (three's alphaMap channel) for the shadow gobos. */
  coverage: THREE.DataTexture | null;
}

/** The bake buffers as the worker posts them (or the synchronous fallback bakes them). */
export interface CloudNoiseUpload {
  shape?: Uint8Array;
  detail?: Uint8Array;
  weather?: Uint8Array;
}

interface CascadeLightLike {
  position: THREE.Vector3;
  shadow: { camera: THREE.OrthographicCamera };
}

/** What the layer needs of the CSM: its lights (per cascade) and the from-sun direction. */
export interface CloudShadowCascades {
  lights: readonly CascadeLightLike[];
  lightDirection: THREE.Vector3;
}

function makeTarget(width: number, height: number, name: string): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
  });
  rt.texture.name = name;
  return rt;
}

function makeVolume(bytes: Uint8Array, size: number, name: string): THREE.Data3DTexture {
  const tex = new THREE.Data3DTexture(bytes, size, size, size);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.generateMipmaps = false;
  tex.unpackAlignment = 1;
  tex.name = name;
  tex.needsUpdate = true;
  return tex;
}

function makeWeather(bytes: Uint8Array, size: number, name: string): THREE.DataTexture {
  const tex = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = false;
  tex.name = name;
  tex.needsUpdate = true;
  return tex;
}

/**
 * The layer. Created by the sky rig on the desktop tier when the atmosphere runs; `setPreset` per map (null
 * keeps the baked decks), `setNoise` when the worker's bakes arrive, `beforeSceneRender` from post.ts every
 * frame, `attachShadowCascades` once the CSM exists.
 */
export class VolumetricCloudLayer {
  readonly dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly atmosphere: AtmospherePublishedState;
  private readonly quad: FullScreenQuad;
  private readonly traceMaterial: THREE.ShaderMaterial;
  private readonly resolveMaterial: THREE.ShaderMaterial;
  private readonly domeMaterial: THREE.ShaderMaterial;
  private history: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private trace: THREE.WebGLRenderTarget;
  private historyIndex = 0;
  private historyValid = false;
  private targetWidth = 0;
  private targetHeight = 0;
  private readonly noise: CloudNoiseTextures = { shape: null, detail: null, weather: null, coverage: null };
  private preset: CloudLayerPreset | null = null;
  private presetKey = '';
  private readonly weatherShift = new THREE.Vector2();
  private readonly noiseShift = new THREE.Vector3();
  private frame = 0;
  private traces = 0;
  private rebuild = 16;
  private since = 0;
  private readonly prevCam = { pos: new THREE.Vector3(), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(0, 0, -1), tan: new THREE.Vector2(1, 1) };
  private readonly cam = { pos: new THREE.Vector3(), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(0, 0, -1), tan: new THREE.Vector2(1, 1) };
  private hasPrev = false;
  private context: ReturnType<THREE.WebGLRenderer['getContext']> | null = null;
  private rendererInfo: THREE.WebGLRenderer['info'] | null = null;
  private cascades: CloudShadowCascades | null = null;
  private gobos: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly goboCorner = new THREE.Vector3();
  private readonly goboUv = new Float32Array(8);
  private readonly scratch = new THREE.Vector3();
  /** Frames rendered with the layer showing (probes). */
  framesShown = 0;
  /** Camera cuts detected (probes). */
  cuts = 0;
  /** QA: hold the trace and resolve (the composite keeps showing the last history). */
  frozen = false;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, atmosphere: AtmospherePublishedState, knee: THREE.Vector3) {
    this.renderer = renderer;
    this.scene = scene;
    this.atmosphere = atmosphere;
    this.history = [makeTarget(4, 4, 'clouds-history-a'), makeTarget(4, 4, 'clouds-history-b')];
    this.trace = makeTarget(1, 1, 'clouds-trace');
    const common = () => ({
      uCamPos: { value: new THREE.Vector3() }, uCamRight: { value: new THREE.Vector3(1, 0, 0) }, uCamUp: { value: new THREE.Vector3(0, 1, 0) },
      uCamFwd: { value: new THREE.Vector3(0, 0, -1) }, uCamTan: { value: new THREE.Vector2(1, 1) },
      uHistorySize: { value: new THREE.Vector2(4, 4) }, uTraceSize: { value: new THREE.Vector2(1, 1) },
      uBase: { value: 620 }, uThick: { value: 400 },
    });
    this.traceMaterial = new THREE.ShaderMaterial({
      name: 'VolumetricCloudTrace', vertexShader: QUAD_VERTEX, fragmentShader: TRACE_FRAGMENT, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      uniforms: {
        ...common(),
        tAtmoSky: { value: null }, uAtmoSun: { value: new THREE.Vector3(0, 1, 0) }, uAtmoViewH: { value: ATMO_GROUND_KM + 0.05 },
        uAtmoKnee: { value: knee }, uAtmoIntensity: { value: 1 },
        tShape: { value: null }, tDetail: { value: null }, tWeather: { value: null },
        uSlot: { value: new THREE.Vector2() }, uSubPixel: { value: new THREE.Vector2() }, uFrameNoise: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunRadiance: { value: new THREE.Vector3(8, 8, 8) },
        uAmbientTop: { value: new THREE.Vector3(0.3, 0.4, 0.6) }, uAmbientBottom: { value: new THREE.Vector3(0.2, 0.25, 0.3) },
        uSkyMean: { value: new THREE.Vector3(0.3, 0.35, 0.45) },
        uCoverage: { value: 0.4 }, uTowers: { value: 0 }, uStratiform: { value: 0.1 }, uDensity: { value: 0.07 },
        uTint: { value: new THREE.Vector3(1, 1, 1) }, uWeatherShift: { value: new THREE.Vector2() }, uNoiseShift: { value: new THREE.Vector3() },
        uShapeTile: { value: CLOUD_SHAPE_TILE_M }, uSunGain: { value: 1 }, uClearRadius: { value: 0 }, uPixelAngle: { value: 0.002 },
      },
    });
    this.resolveMaterial = new THREE.ShaderMaterial({
      name: 'VolumetricCloudResolve', vertexShader: QUAD_VERTEX, fragmentShader: RESOLVE_FRAGMENT, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      uniforms: {
        ...common(),
        tTrace: { value: null }, tHistory: { value: null }, uSlot: { value: new THREE.Vector2() },
        uPrevCamPos: { value: new THREE.Vector3() }, uPrevRight: { value: new THREE.Vector3(1, 0, 0) }, uPrevUp: { value: new THREE.Vector3(0, 1, 0) },
        uPrevFwd: { value: new THREE.Vector3(0, 0, -1) }, uPrevTan: { value: new THREE.Vector2(1, 1) },
        uHistoryValid: { value: 0 }, uRebuildK: { value: -1 }, uMinAlpha: { value: 0.12 },
      },
    });
    this.quad = new FullScreenQuad(this.traceMaterial);
    this.domeMaterial = new THREE.ShaderMaterial({
      name: 'VolumetricCloudDome', vertexShader: DOME_VERTEX, fragmentShader: DOME_FRAGMENT,
      uniforms: {
        tClouds: { value: this.history[0].texture }, uTargetSize: { value: new THREE.Vector2(1, 1) }, uHistorySize: { value: new THREE.Vector2(4, 4) },
        uKnee: { value: knee }, uSkyIntensity: { value: 1 },
      },
      transparent: true, depthWrite: false, depthTest: true, side: THREE.BackSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    // the same shell as the baked cumulus deck: horizon-grazing rays from any battle camera hit it, the
    // terrain and the ring occlude the rest; AO's prepass ignores it like the decks
    const geometry = new THREE.SphereGeometry(CLOUD_DOME_RADIUS_M, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.65);
    this.dome = new THREE.Mesh(geometry, this.domeMaterial);
    this.dome.name = 'cloudLayerVolumetric';
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -2;
    this.dome.visible = false;
    this.dome.userData.aoExclude = true;
    scene.add(this.dome);
  }

  /** Whether the layer draws: a preset, every noise texture and a running atmosphere. */
  get active(): boolean {
    return !!this.preset && !!this.noise.shape && !!this.noise.detail && !!this.noise.weather && this.atmosphere.active;
  }

  get noiseReady(): boolean {
    return !!this.noise.shape && !!this.noise.detail && !!this.noise.weather;
  }

  /** The current preset (null = the baked decks show). */
  get currentPreset(): CloudLayerPreset | null { return this.preset; }

  setPreset(preset: CloudLayerPreset | null): void {
    const key = preset ? cloudLayerKey(preset) : '';
    if (key !== this.presetKey) {
      this.presetKey = key;
      this.resetHistory();
    }
    this.preset = preset;
    this.updateGoboMaterials();
  }

  /** Upload whichever bakes arrived (each once). */
  setNoise(upload: CloudNoiseUpload): void {
    if (upload.shape && !this.noise.shape) this.noise.shape = makeVolume(upload.shape, CLOUD_SHAPE_SIZE, 'clouds-shape');
    if (upload.detail && !this.noise.detail) this.noise.detail = makeVolume(upload.detail, CLOUD_DETAIL_SIZE, 'clouds-detail');
    if (upload.weather && !this.noise.weather) {
      this.noise.weather = makeWeather(upload.weather, CLOUD_WEATHER_SIZE, 'clouds-weather');
      // the shadow gobos alpha-test three's alphaMap channel (green): the coverage field in every channel
      const coverage = new Uint8Array(upload.weather.length);
      for (let i = 0; i < upload.weather.length; i += 4) {
        const c = upload.weather[i];
        coverage[i] = c; coverage[i + 1] = c; coverage[i + 2] = c; coverage[i + 3] = 255;
      }
      this.noise.coverage = makeWeather(coverage, CLOUD_WEATHER_SIZE, 'clouds-coverage');
      this.updateGoboMaterials();
    }
    const u = this.traceMaterial.uniforms;
    u.tShape.value = this.noise.shape;
    u.tDetail.value = this.noise.detail;
    u.tWeather.value = this.noise.weather;
  }

  /** Forget the history: the next frames rebuild it at four slots a frame. */
  resetHistory(): void {
    this.rebuild = 0;
    this.since = 0;
    this.historyValid = false;
  }

  /** The CSM lights whose cascades carry the cloud shadows (one alpha-tested plane each, shadow-only layer). */
  attachShadowCascades(cascades: CloudShadowCascades): void {
    if (this.cascades === cascades) return;
    this.detachShadowCascades();
    this.cascades = cascades;
    for (let i = 0; i < cascades.lights.length; i++) {
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false, depthWrite: false, alphaTest: 0.5 });
      const geometry = new THREE.PlaneGeometry(1, 1);
      const gobo = new THREE.Mesh(geometry, material);
      gobo.name = `cloudShadowGobo${i}`;
      gobo.castShadow = true;
      gobo.receiveShadow = false;
      gobo.frustumCulled = false;
      gobo.visible = false;
      markShadowOnly(gobo);
      this.scene.add(gobo);
      this.gobos.push(gobo);
    }
    this.updateGoboMaterials();
  }

  private detachShadowCascades(): void {
    for (const gobo of this.gobos) {
      gobo.removeFromParent();
      gobo.geometry.dispose();
      gobo.material.dispose();
    }
    this.gobos = [];
    this.cascades = null;
  }

  private updateGoboMaterials(): void {
    const preset = this.preset;
    const coverage = this.noise.coverage;
    for (const gobo of this.gobos) {
      gobo.material.alphaMap = coverage;
      gobo.material.alphaTest = preset ? preset.shadowThreshold : 0.5;
      gobo.material.needsUpdate = true;
    }
  }

  /** Whether the cascades carry cloud shadows this frame. */
  get shadowsActive(): boolean {
    return this.active && !!this.preset?.shadow && this.gobos.length > 0 && !!this.noise.coverage;
  }

  private refreshLifetime(): void {
    const context = this.renderer.getContext();
    if (context !== this.context || this.renderer.info !== this.rendererInfo) {
      this.context = context;
      this.rendererInfo = this.renderer.info;
      this.resetHistory();
    }
  }

  private resize(width: number, height: number): void {
    this.targetWidth = width;
    this.targetHeight = height;
    const hw = Math.max(4, Math.round(width * CLOUD_HISTORY_SCALE)), hh = Math.max(4, Math.round(height * CLOUD_HISTORY_SCALE));
    const tw = Math.ceil(hw / CLOUD_TRACE_DIVISOR), th = Math.ceil(hh / CLOUD_TRACE_DIVISOR);
    for (const rt of this.history) rt.setSize(hw, hh);
    this.trace.setSize(tw, th);
    for (const m of [this.traceMaterial, this.resolveMaterial]) {
      (m.uniforms.uHistorySize.value as THREE.Vector2).set(hw, hh);
      (m.uniforms.uTraceSize.value as THREE.Vector2).set(tw, th);
    }
    (this.domeMaterial.uniforms.uHistorySize.value as THREE.Vector2).set(hw, hh);
    (this.domeMaterial.uniforms.uTargetSize.value as THREE.Vector2).set(width, height);
    this.resetHistory();
  }

  private renderQuad(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget): void {
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

  private applyPresetUniforms(preset: CloudLayerPreset): void {
    const t = this.traceMaterial.uniforms;
    t.uBase.value = preset.baseM;
    t.uThick.value = preset.thicknessM;
    t.uCoverage.value = preset.coverage;
    t.uTowers.value = preset.towers;
    t.uStratiform.value = preset.stratiform;
    t.uDensity.value = preset.density;
    (t.uTint.value as THREE.Vector3).set(...preset.tint);
    t.uShapeTile.value = THREE.MathUtils.lerp(CLOUD_SHAPE_TILE_M, CLOUD_SHAPE_TILE_STRATUS_M, preset.stratiform);
    t.uClearRadius.value = preset.clearRadiusM;
    const r = this.resolveMaterial.uniforms;
    r.uBase.value = preset.baseM;
    r.uThick.value = preset.thicknessM;
  }

  private applyAtmosphereUniforms(): void {
    const a = this.atmosphere;
    const t = this.traceMaterial.uniforms;
    t.tAtmoSky.value = a.skyView;
    (t.uAtmoSun.value as THREE.Vector3).copy(a.sunDir).normalize();
    t.uAtmoViewH.value = ATMO_GROUND_KM + a.viewHeightKm;
    t.uAtmoIntensity.value = 1; // the composite applies the dome intensity (night) once
    (t.uSunDir.value as THREE.Vector3).copy(a.sunDir).normalize();
    const summary = a.summary;
    const sunT = summary?.sunTransmittance;
    // the sun's irradiance in the sky's own units (atmosphere.ts: the LUT is scaled by the illuminance)
    const illuminance = 8.0;
    if (sunT) (t.uSunRadiance.value as THREE.Vector3).set(sunT.r, sunT.g, sunT.b).multiplyScalar(illuminance);
    else (t.uSunRadiance.value as THREE.Vector3).setScalar(illuminance);
    // ambient: the cosine-weighted sky irradiance / π (a diffuse top under the whole sky), the base sees the
    // horizon band and the ground
    const irr = summary?.irradiance ?? a.irradiance;
    (t.uAmbientTop.value as THREE.Vector3).set(irr.r, irr.g, irr.b).multiplyScalar(0.55);
    const hz = summary?.horizon ?? irr;
    const stratiform = this.preset?.stratiform ?? 0;
    // cumulus bases see the horizon band and the ground; an overcast sheet's base is lit through the sheet by
    // the whole sky, so it takes the sky irradiance's cool hue, never the low sun's warm band
    (t.uAmbientBottom.value as THREE.Vector3).set(hz.r, hz.g, hz.b).multiplyScalar(0.3)
      .lerp(this.scratch.set(irr.r, irr.g, irr.b).multiplyScalar(0.42), stratiform);
    // the stratus floor: the brighter of the horizon band's and the mean upper sky's luminance — the sky a far
    // ceiling replaces at the skyline is the horizon band, the brightest of a hazy sky — in a hue half way from
    // the zenith's (cool) to neutral: an arctic white-out ceiling, never the band's tan
    const hl = Math.max(1e-4, 0.2126 * hz.r + 0.7152 * hz.g + 0.0722 * hz.b);
    const mean = summary?.meanLuminance ?? hl;
    const floorLum = Math.max(hl, mean);
    const zenith = summary?.zenith ?? irr;
    const zl = Math.max(1e-4, 0.2126 * zenith.r + 0.7152 * zenith.g + 0.0722 * zenith.b);
    (t.uSkyMean.value as THREE.Vector3).set(zenith.r, zenith.g, zenith.b).multiplyScalar(floorLum / zl)
      .lerp(this.scratch.set(floorLum, floorLum, floorLum), 0.5);
    this.domeMaterial.uniforms.uSkyIntensity.value = a.skyIntensity;
  }

  private captureCamera(camera: THREE.PerspectiveCamera): void {
    const e = camera.matrixWorld.elements;
    const C = this.cam;
    C.pos.setFromMatrixPosition(camera.matrixWorld);
    C.right.set(e[0], e[1], e[2]).normalize();
    C.up.set(e[4], e[5], e[6]).normalize();
    C.fwd.set(-e[8], -e[9], -e[10]).normalize();
    const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) / (camera.zoom || 1);
    C.tan.set(tanY * camera.aspect, tanY);
  }

  private traceSlot(slot: number): void {
    const [sx, sy] = CLOUD_SLOT_ORDER[slot];
    const t = this.traceMaterial.uniforms, r = this.resolveMaterial.uniforms;
    // an R2 sequence over the cycles (one offset per 16-frame cycle, so a pixel's traces spread over it)
    const n = Math.floor(this.traces / 16) + 1;
    const sub = t.uSubPixel.value as THREE.Vector2;
    sub.set(((0.5 + n * 0.7548776662) % 1) - 0.5, ((0.5 + n * 0.5698402910) % 1) - 0.5).multiplyScalar(0.25);
    t.uFrameNoise.value = (n * 0.6180339887) % 1;
    this.traces++;
    (t.uSlot.value as THREE.Vector2).set(sx, sy);
    (r.uSlot.value as THREE.Vector2).set(sx, sy);
    this.renderQuad(this.traceMaterial, this.trace);
    const prev = this.history[this.historyIndex];
    const next = this.history[1 - this.historyIndex];
    r.tTrace.value = this.trace.texture;
    r.tHistory.value = prev.texture;
    r.uHistoryValid.value = this.historyValid ? 1 : 0;
    this.renderQuad(this.resolveMaterial, next);
    this.historyIndex = 1 - this.historyIndex;
    this.historyValid = true;
    this.domeMaterial.uniforms.tClouds.value = next.texture;
  }

  private setCameraUniforms(target: THREE.ShaderMaterial, cam: typeof this.cam): void {
    const u = target.uniforms;
    (u.uCamPos.value as THREE.Vector3).copy(cam.pos);
    (u.uCamRight.value as THREE.Vector3).copy(cam.right);
    (u.uCamUp.value as THREE.Vector3).copy(cam.up);
    (u.uCamFwd.value as THREE.Vector3).copy(cam.fwd);
    (u.uCamTan.value as THREE.Vector2).copy(cam.tan);
  }

  /** Move the gobos with their cascades: at the light, facing it, sized to the shadow box, uv = the cloud footprint. */
  private updateGobos(preset: CloudLayerPreset): void {
    const cascades = this.cascades;
    const show = this.shadowsActive;
    if (!cascades) return;
    const dir = cascades.lightDirection;
    for (let i = 0; i < this.gobos.length; i++) {
      const gobo = this.gobos[i];
      const light = cascades.lights[i];
      if (!light || !show || Math.abs(dir.y) < 0.02) { gobo.visible = false; continue; }
      const cam = light.shadow.camera;
      gobo.visible = true;
      gobo.position.copy(light.position).addScaledVector(dir, 1.5);
      gobo.lookAt(this.goboCorner.copy(gobo.position).sub(dir));
      const w = cam.right - cam.left, h = cam.top - cam.bottom;
      gobo.scale.set(w * 1.02, h * 1.02, 1);
      gobo.updateMatrixWorld(true);
      // project each corner along the light onto the cloud base and take the weather uv there
      const uvs = gobo.geometry.getAttribute('uv') as THREE.BufferAttribute;
      const positions = gobo.geometry.getAttribute('position') as THREE.BufferAttribute;
      const shift = this.weatherShift;
      for (let v = 0; v < 4; v++) {
        this.goboCorner.fromBufferAttribute(positions, v).applyMatrix4(gobo.matrixWorld);
        const s = (preset.baseM - this.goboCorner.y) / dir.y;
        const qx = this.goboCorner.x + dir.x * s, qz = this.goboCorner.z + dir.z * s;
        this.goboUv[v * 2] = (qx + shift.x) / CLOUD_WEATHER_TILE_M;
        this.goboUv[v * 2 + 1] = (qz + shift.y) / CLOUD_WEATHER_TILE_M;
      }
      uvs.set(this.goboUv);
      uvs.needsUpdate = true;
    }
  }

  /**
   * post.ts's hook, before the scene draws: advance the wind, detect a camera cut, trace this frame's slot(s)
   * and resolve the history the dome composites. `width` × `height` is the scene target.
   */
  beforeSceneRender(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, dt: number, width: number, height: number): void {
    const preset = this.preset;
    if (!preset || !this.active || renderer !== this.renderer) {
      this.dome.visible = false;
      for (const gobo of this.gobos) gobo.visible = false;
      return;
    }
    this.refreshLifetime();
    if (this.context?.isContextLost()) { this.dome.visible = false; return; }
    if (width !== this.targetWidth || height !== this.targetHeight) this.resize(width, height);
    // wind drift, bounded to the weather tile (every noise tiles within it)
    const step = Math.max(0, Math.min(0.1, dt || 0));
    const wx = Math.cos(preset.windDirRad) * preset.windSpeed * step, wz = Math.sin(preset.windDirRad) * preset.windSpeed * step;
    const shift = this.weatherShift;
    shift.x = ((shift.x - wx) % CLOUD_WEATHER_TILE_M + CLOUD_WEATHER_TILE_M) % CLOUD_WEATHER_TILE_M;
    shift.y = ((shift.y - wz) % CLOUD_WEATHER_TILE_M + CLOUD_WEATHER_TILE_M) % CLOUD_WEATHER_TILE_M;
    const ns = this.noiseShift;
    ns.x = ((ns.x - wx * 0.8) % CLOUD_SHAPE_TILE_STRATUS_M + CLOUD_SHAPE_TILE_STRATUS_M) % CLOUD_SHAPE_TILE_STRATUS_M;
    ns.z = ((ns.z - wz * 0.8) % CLOUD_SHAPE_TILE_STRATUS_M + CLOUD_SHAPE_TILE_STRATUS_M) % CLOUD_SHAPE_TILE_STRATUS_M;
    const t = this.traceMaterial.uniforms;
    (t.uWeatherShift.value as THREE.Vector2).set(shift.x + preset.offset[0] * CLOUD_WEATHER_TILE_M, shift.y + preset.offset[1] * CLOUD_WEATHER_TILE_M);
    (t.uNoiseShift.value as THREE.Vector3).copy(ns);
    this.applyPresetUniforms(preset);
    this.applyAtmosphereUniforms();

    // camera frame; cuts (teleports, big turns, zooms) rebuild the history at four slots a frame
    const P = this.prevCam, C = this.cam;
    P.pos.copy(C.pos); P.right.copy(C.right); P.up.copy(C.up); P.fwd.copy(C.fwd); P.tan.copy(C.tan);
    this.captureCamera(camera);
    if (this.hasPrev) {
      const moved = C.pos.distanceTo(P.pos);
      const turned = C.fwd.angleTo(P.fwd);
      const zoomed = Math.abs(C.tan.y - P.tan.y) > CLOUD_CUT_ZOOM * C.tan.y;
      if (moved > CLOUD_CUT_JUMP_M || turned > CLOUD_CUT_TURN_RAD || zoomed) { this.resetHistory(); this.cuts++; }
    } else {
      this.resetHistory();
    }
    this.hasPrev = true;
    this.setCameraUniforms(this.traceMaterial, C);
    this.setCameraUniforms(this.resolveMaterial, C);
    t.uPixelAngle.value = (C.tan.y * 2) / Math.max(4, this.history[0].height);
    const r = this.resolveMaterial.uniforms;
    (r.uPrevCamPos.value as THREE.Vector3).copy(P.pos);
    (r.uPrevRight.value as THREE.Vector3).copy(P.right);
    (r.uPrevUp.value as THREE.Vector3).copy(P.up);
    (r.uPrevFwd.value as THREE.Vector3).copy(P.fwd);
    (r.uPrevTan.value as THREE.Vector2).copy(P.tan);

    if (!this.frozen) {
      if (this.rebuild < 16) {
        for (let k = 0; k < CLOUD_REBUILD_SLOTS && this.rebuild < 16; k++) {
          if (k > 0) {
            // no camera motion between the traces of one frame
            P.pos.copy(C.pos); P.right.copy(C.right); P.up.copy(C.up); P.fwd.copy(C.fwd); P.tan.copy(C.tan);
            (r.uPrevCamPos.value as THREE.Vector3).copy(C.pos);
            (r.uPrevRight.value as THREE.Vector3).copy(C.right);
            (r.uPrevUp.value as THREE.Vector3).copy(C.up);
            (r.uPrevFwd.value as THREE.Vector3).copy(C.fwd);
            (r.uPrevTan.value as THREE.Vector2).copy(C.tan);
          }
          r.uRebuildK.value = this.rebuild;
          r.uMinAlpha.value = 0.12;
          this.traceSlot(this.rebuild++);
        }
      } else {
        const n = 1 + Math.floor(this.since++ / 16);
        r.uMinAlpha.value = Math.max(0.12, 1 / (n + 1));
        r.uRebuildK.value = -1;
        this.traceSlot(this.frame % 16);
      }
    }
    this.frame++;
    this.framesShown++;
    this.dome.visible = true;
    this.updateGobos(preset);
  }

  /** Compile the three programs under a loading cover (a 1 × 1 trace and resolve; the dome compiles with the scene). */
  warm(): void {
    if (!this.active) return;
    const prevW = this.targetWidth, prevH = this.targetHeight;
    if (!prevW || !prevH) this.resize(16, 16);
    try {
      this.renderQuad(this.traceMaterial, this.trace);
      this.resolveMaterial.uniforms.tTrace.value = this.trace.texture;
      this.resolveMaterial.uniforms.tHistory.value = this.history[0].texture;
      this.renderQuad(this.resolveMaterial, this.history[1]);
    } finally {
      this.resetHistory();
    }
  }

  dispose(): void {
    this.detachShadowCascades();
    for (const rt of this.history) rt.dispose();
    this.trace.dispose();
    this.traceMaterial.dispose();
    this.resolveMaterial.dispose();
    this.domeMaterial.dispose();
    this.dome.geometry.dispose();
    this.dome.removeFromParent();
    this.quad.dispose();
    for (const key of ['shape', 'detail', 'weather', 'coverage'] as const) {
      this.noise[key]?.dispose();
      this.noise[key] = null;
    }
  }
}
