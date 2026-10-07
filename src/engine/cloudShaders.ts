/**
 * cloudShaders.ts — the GLSL of the Clouds 2.0 layer (2026-10-06): the layered cloud medium, the Beer shadow map, the
 * trace and its temporal resolve, and the cloud shade the lit materials read.
 *
 * The architecture follows the clouds package of three-geospatial (Takram): altitude layers packed four to a vec4, each
 * a weather coverage shaped by an altering function into a shell, eroded by a Perlin–Worley shape volume and a detail
 * volume, under a density profile; a Beer shadow map marched along the sun (front depth, mean extinction, maximum
 * optical depth, the tail past the cut) that gives every sample its optical depth to the sun beyond a short secondary
 * march and gives the ground its shadows; the multiple-scattering octaves of Wrenninge (Oz) under a dual-lobe
 * Henyey–Greenstein phase with the powder term; the energy-conserving step integral and the transmittance-weighted
 * depth of Hillaire (Frostbite 2016); a trace at a sixteenth of the history reprojected by its own depth and clipped to
 * the variance of its neighbourhood. The functions marked below are ported from that package and keep its notice:
 *
 *   The MIT License (MIT)
 *
 *   Copyright (c) 2024 Shota Matsuda
 *
 *   Permission is hereby granted, free of charge, to any person obtaining a copy
 *   of this software and associated documentation files (the "Software"), to deal
 *   in the Software without restriction, including without limitation the rights
 *   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *   copies of the Software, and to permit persons to whom the Software is
 *   furnished to do so, subject to the following conditions:
 *
 *   The above copyright notice and this permission notice shall be included in
 *   all copies or substantial portions of the Software.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *   THE SOFTWARE.
 *
 * (https://github.com/takram-design-engineering/three-geospatial, packages/clouds: the shape-altering function, the
 * weather and media sampling, the Beer shadow map's accumulation and lookup with its optical-depth tail, the
 * multiple-scattering octaves, the powder term and the variance clipping, adapted to a flat battlefield under a
 * parabolic Earth, to this file's layer uniforms and to the first-party weather and noise.) The rest — the march, the
 * layer packing, the deck cells, the streets, the lighting terms beyond the octaves, the reprojection and the shade —
 * is first-party. docs/ATTRIBUTION.md records the port.
 */
import { CLOUD_BLUE_SIZE } from './cloudNoise.ts';

const f = (x: number): string => { const s = String(x); return s.includes('.') || s.includes('e') ? s : `${s}.0`; };

/** World periods (m) of the textures the medium reads. */
export const CLOUD2_PERIODS = Object.freeze({
  /** the local weather (cloudNoise.ts bakeCloudLocalWeather) */
  local: 48000,
  /** the street field (cloudNoise.ts bakeCloudWeatherStreets) in the wind frame */
  streets: 12000,
  /** the Perlin–Worley shape volume (cloudVolumeNoise.ts) */
  shape: 3200,
  /** the detail volume */
  detail: 220,
  /** the turbulence field */
  turbulence: 5200,
});
/** The planet radius for the shells' curvature drop (m): a parabolic Earth under the battlefield. */
export const CLOUD2_EARTH_R = 6360000;

/**
 * The layered medium (shared by the trace and the Beer shadow map). Four layers in vec4 lanes: base and top altitude (m),
 * the coverage in the shell law's units, the extinction at full density (1/m; 0 switches a lane off), the shape and
 * detail amounts, the shape-altering bias, the coverage filter width, the weather exponent, the street share, the deck
 * cells and the whippy share of the detail; the weather of each lane is a mix of the local weather's four channels
 * (uLayerChannels, column = lane).
 */
export const CLOUD2_MEDIUM_GLSL = /* glsl */`
uniform vec4 uLayerBase;
uniform vec4 uLayerTop;
uniform vec4 uLayerCover;
uniform vec4 uLayerDensity;
uniform vec4 uLayerShape;
uniform vec4 uLayerDetail;
uniform vec4 uLayerBias;
uniform vec4 uLayerFilter;
uniform vec4 uLayerExp;
uniform vec4 uLayerStreets;
// the stratiform field as an envelope over a convective lane's weather (organised convection)
uniform vec4 uLayerEnvelope;
uniform vec4 uLayerCells;
// the deck cells' lookup period (m): the local weather's cell channel stretched to the regime's cell size
uniform float uCellPeriod;
// the shape volume's world period (m): a few cumulus across one period, a deck's lumps a few hundred metres
uniform float uShapePeriod;
uniform vec4 uLayerWisp;
// a deck's flat faces (0 the semicircle shell, 1 flat to its base and top), its cell cores' hang under the base (a share
// of the thickness) and a cumulonimbus' anvil (the shell widening again over its top fifth)
uniform vec4 uLayerFlat;
uniform vec4 uLayerHang;
uniform vec4 uLayerAnvil;
// the shell's density inside its footprint before the shape carves it (low: the shape carves the whole mass into
// billows; high: a solid mass eroded only at its edges)
uniform vec4 uLayerCore;
// the deck lumps: the cell channel at a third of the cells' period thickens and thins the column (0 = none)
uniform vec4 uLayerLumps;
uniform vec4 uProfA;
uniform vec4 uProfB;
uniform vec4 uProfC;
uniform vec4 uProfD;
uniform mat4 uLayerChannels;
// the lowest base and the highest top of the active lanes (m)
uniform vec2 uHeightRange;
uniform sampler2D tLocal;
uniform sampler2D tStreetField;
uniform sampler3D tShape;
uniform sampler3D tDetail;
uniform sampler2D tTurb;
uniform vec2 uLocalShift;
uniform vec2 uStreetShift2;
uniform vec2 uWindDir2;
uniform vec3 uShapeShift;
uniform vec3 uDetailShift;
// a front keeps the sky over the camera open (xy the camera, z the radius, 0 = none)
uniform vec3 uClear2;
// the turbulence's displacement at the bases (m; 0 = none)
uniform float uTurbulence;
const float CL2_LOCAL = ${f(CLOUD2_PERIODS.local)};
const float CL2_STREETS = ${f(CLOUD2_PERIODS.streets)};
const float CL2_SHAPE = ${f(CLOUD2_PERIODS.shape)};
const float CL2_DETAIL = ${f(CLOUD2_PERIODS.detail)};
const float CL2_TURB = ${f(CLOUD2_PERIODS.turbulence)};
const float CL2_EARTH_R = ${f(CLOUD2_EARTH_R)};
// the altitude of a world point over the parabolic Earth under the battlefield's origin
float cl2Height( vec3 p ) { return p.y + dot( p.xz, p.xz ) * ( 0.5 / CL2_EARTH_R ); }
// the height fraction of every lane (0..1 inside a lane; clamped outside)
vec4 cl2Fraction( float h ) { return clamp( ( vec4( h ) - uLayerBase ) / max( uLayerTop - uLayerBase, vec4( 1.0 ) ), 0.0, 1.0 ); }
vec4 cl2Inside( float h ) { return step( uLayerBase, vec4( h ) ) * step( vec4( h ), uLayerTop ) * step( vec4( 1e-6 ), uLayerDensity ); }
// the convective profile over the height fraction: full width a few percent over the flat base (the condensation
// level), narrowing toward the top as 1 − hf^(1/bias) — a low bias a tower's column, a high one a lens. (Takram's
// semicircle, widest a sixth of the way up and pinched to nothing at the base, drew every cumulus as a mushroom on a
// stem from below.)
vec4 cl2Profile( vec4 hf, vec4 bias ) {
	return smoothstep( 0.0, 0.06, hf ) * ( 1.0 - pow( hf, 1.0 / max( bias, vec4( 0.05 ) ) ) );
}
// the weather of every lane at a world xz (lod: the local weather's mip level)
vec4 cl2Weather( vec2 xz, float lod ) {
	vec4 lw = textureLod( tLocal, ( xz + uLocalShift ) / CL2_LOCAL, lod );
	vec4 w = uLayerChannels * lw;
	if ( dot( uLayerStreets, uLayerStreets ) > 0.0 ) {
		vec2 q = vec2( dot( xz, uWindDir2 ), dot( xz, vec2( -uWindDir2.y, uWindDir2.x ) ) );
		float st = textureLod( tStreetField, ( q + uStreetShift2 ) / CL2_STREETS, lod ).r;
		w = mix( w, vec4( st ), uLayerStreets );
	}
	// a front's cells gathered where the large-scale field runs high, the air between them clear
	w *= mix( vec4( 1.0 ), vec4( smoothstep( 0.3, 0.7, lw.b ) ), uLayerEnvelope );
	if ( uClear2.z > 0.0 ) w *= smoothstep( uClear2.z * 0.6, uClear2.z * 1.4, length( xz - uClear2.xy ) );
	return pow( clamp( w, 0.0, 1.0 ), uLayerExp );
}
// the deck cells at a column (0 a border, 1 a core; 1 where no lane has cells) and their lumps (0..1, 1 where none)
vec2 cl2Cell( vec2 xz, float lod ) {
	if ( dot( uLayerCells, uLayerCells ) <= 0.0 ) return vec2( 1.0 );
	vec2 q = xz + uLocalShift * 0.9;
	float c = textureLod( tLocal, q / uCellPeriod + vec2( 0.37, 0.11 ), lod ).a;
	float l = textureLod( tLocal, q / ( uCellPeriod * 0.31 ) + vec2( 0.71, 0.53 ), lod ).a;
	return vec2( smoothstep( 0.15, 0.85, c ), smoothstep( 0.1, 0.9, l ) );
}
// the shell density of every lane before the shape erodes it (0..core): the equalised weather admitted over the lane's
// cover times the shape-altering function's width at this height (so a map's coverage is the share of the sky the
// footprints take at their widest), ramped in over the filter's share of the footprint; a deck's cell borders thin to three tenths of its
// thickness and its cores (and lumps) hang under its base — a lumpy underside; a deck flat to both faces; an anvil
// spreading over a cumulonimbus' top
vec4 cl2Shell( float h, vec4 weather, vec2 cell, out vec4 hf ) {
	vec4 thick = uLayerTop - uLayerBase;
	vec4 k = mix( vec4( 1.0 ), vec4( cell.x ) * mix( vec4( 1.0 ), vec4( 0.55 + 0.45 * cell.y ), uLayerLumps ), uLayerCells );
	vec4 base = uLayerBase - thick * uLayerHang * k;
	vec4 top = uLayerBase + thick * ( 0.15 + 0.85 * k );
	hf = clamp( ( vec4( h ) - base ) / max( top - base, vec4( 1.0 ) ), 0.0, 1.0 );
	vec4 inside = step( base, vec4( h ) ) * step( vec4( h ), top ) * step( vec4( 1e-6 ), uLayerDensity );
	vec4 box = smoothstep( 0.0, 0.12, hf ) * ( 1.0 - smoothstep( 0.82, 1.0, hf ) );
	// [ported] the shape-altering function (a semicircle over the height fraction, its widest point lowered by the bias)
	vec4 heightScale = mix( cl2Profile( hf, uLayerBias ), box, uLayerFlat );
	heightScale = max( heightScale, uLayerAnvil * smoothstep( 0.74, 0.9, hf ) * ( 1.0 - smoothstep( 0.97, 1.0, hf ) ) );
	// the footprint's share at this height, and the density rising over the footprint from its edge to the weather's
	// peak (the filter: the ramp's share of the footprint — a cumulus' whole footprint, so the shape carves it bulge by
	// bulge inward from the edge and its core is densest; a deck's third, so it stays dense to near its breaks)
	vec4 admitted = uLayerCover * heightScale;
	vec4 ramp = max( admitted * uLayerFilter, vec4( 0.02 ) );
	vec4 d = clamp( ( weather - ( 1.0 - admitted ) ) / ramp, 0.0, 1.0 );
	return d * uLayerCore * inside;
}
// the extinction of every lane at a point (1/m): the shell eroded by the shape and (detail > 0) the detail, under the
// density profile. [ported] the shape and detail remaps and the profile; the turbulence at the base is first-party.
vec4 cl2Media( vec3 p, vec4 shell, vec4 hf, float lod, float detail ) {
	vec3 sp = p + uShapeShift;
	if ( uTurbulence > 0.0 ) {
		// the base drags with the wind's swirl: the lowest third of each lane, by its shell
		float k = dot( shell, clamp( ( 0.3 - hf ) / 0.3, 0.0, 1.0 ) );
		if ( k > 0.0 ) {
			vec3 tv = textureLod( tTurb, ( p.xz + uLocalShift ) / CL2_TURB, 0.0 ).rgb * 2.0 - 1.0;
			sp += vec3( tv.x, tv.z * 0.35, tv.y ) * ( uTurbulence * min( k, 1.0 ) );
		}
	}
	float shape = textureLod( tShape, sp / uShapePeriod, lod ).r;
	vec4 lo = vec4( 1.0 - shape ) * uLayerShape;
	vec4 d = clamp( ( shell - lo ) / max( 1.0 - lo, vec4( 1e-3 ) ), 0.0, 1.0 );
	if ( detail > 0.0 && dot( d, d ) > 0.0 ) {
		float dn = textureLod( tDetail, ( sp + uDetailShift ) / CL2_DETAIL, 0.0 ).r;
		// fluffy (the inverted cells) on the tops, the cells' cores at the base; a wispy lane takes the cells higher up
		vec4 topErode = mix( vec4( 1.0 - dn ), vec4( dn ), uLayerWisp );
		vec4 modifier = mix( vec4( pow( dn, 6.0 ) ), topErode, clamp( ( hf - 0.2 ) / 0.2, 0.0, 1.0 ) ) * uLayerDetail * detail;
		d = clamp( ( d * 2.0 - modifier * 0.5 ) / max( 1.0 - modifier * 0.5, vec4( 1e-3 ) ), 0.0, 1.0 );
	}
	vec4 profile = uProfA * exp( uProfB * hf ) + uProfC * hf + uProfD;
	return clamp( d * profile, 0.0, 1.0 ) * uLayerDensity;
}
// the whole medium's extinction at a point (no detail): the Beer shadow map and the secondary march
float cl2Extinction( vec3 p, float lod ) {
	float h = cl2Height( p );
	if ( h < uHeightRange.x || h > uHeightRange.y ) return 0.0;
	vec4 w = cl2Weather( p.xz, lod );
	vec4 hf;
	vec4 shell = cl2Shell( h, w, cl2Cell( p.xz, lod ), hf );
	if ( dot( shell, shell ) <= 0.0 ) return 0.0;
	vec4 s = cl2Media( p, shell, hf, lod, 0.0 );
	return s.x + s.y + s.z + s.w;
}
`;

/**
 * The Beer shadow map's lookup (the trace and the shade read it): the map is parameterised on the horizontal plane at
 * uBsmPlane — the texel a point reads is where the sun's ray through it crosses that plane, the projection the lit
 * materials' cotCloudSun makes — world-anchored and toroidal (a texel holds world cell c mod N, so the window follows the
 * camera without a re-render). Its channels: r the transmittance-weighted front distance from the top of the shadow
 * lanes along the sun's ray (m), g the mean extinction along the cloud (1/m), b the maximum optical depth, a the tail.
 */
const CLOUD2_BSM_LOOKUP_GLSL = /* glsl */`
uniform sampler2D tBsm0;
uniform sampler2D tBsm1;
// per cascade: x0, z0 (the window's corner, m), side (m), on (0 / 1); the near cascade shades the ground too
uniform vec4 uBsmWindow0;
uniform vec4 uBsmWindow1;
// the plane's altitude (m), the top of the shadow lanes (m)
uniform vec2 uBsmPlane;
uniform vec3 uBsmSun;
// [ported] the optical depth one texel gives a point past offset metres along its sun ray: the mean extinction over
// the run into the cloud from its front, capped by the column's whole depth with its tail
float cl2BsmTexel( vec4 s, float toTop, float offset ) {
	return min( s.b + s.a, s.g * max( 0.0, toTop - offset - s.r ) );
}
// One cascade's optical depth at a point: the four texels around it, each its own depth, blended as transmittances
// (−log of the bilinear mean of e^−τ, from the least of them so a deep column stays exact). Filtering the front depth
// itself drew streaks down a tower's lit flank along the sun: beside a texel whose ray grazes the flank lies one whose
// ray came in through the top, and their mean front put the whole flank kilometres inside the cloud.
float cl2BsmRead( sampler2D map, vec4 win, vec2 xz, float toTop, float offset ) {
	float n = float( textureSize( map, 0 ).x );
	vec2 st = fract( xz / win.z ) * n - 0.5;
	vec2 i0 = floor( st ), f = st - i0;
	vec4 od = vec4(
		cl2BsmTexel( texelFetch( map, ivec2( mod( i0, n ) ), 0 ), toTop, offset ),
		cl2BsmTexel( texelFetch( map, ivec2( mod( i0 + vec2( 1.0, 0.0 ), n ) ), 0 ), toTop, offset ),
		cl2BsmTexel( texelFetch( map, ivec2( mod( i0 + vec2( 0.0, 1.0 ), n ) ), 0 ), toTop, offset ),
		cl2BsmTexel( texelFetch( map, ivec2( mod( i0 + vec2( 1.0, 1.0 ), n ) ), 0 ), toTop, offset ) );
	vec4 w = vec4( ( 1.0 - f.x ) * ( 1.0 - f.y ), f.x * ( 1.0 - f.y ), ( 1.0 - f.x ) * f.y, f.x * f.y );
	float m = min( min( od.x, od.y ), min( od.z, od.w ) );
	return m - log( max( dot( w, exp( m - od ) ), 1e-6 ) );
}
// the optical depth to the sun from the cascades (the near one where it reaches, blended into the far one over the
// near window's outer tenth); -1 outside both
float cl2BsmDepth( vec3 p, float offset ) {
	if ( uBsmSun.y < 0.03 ) return -1.0;
	vec2 xz = p.xz - uBsmSun.xz * ( ( p.y - uBsmPlane.x ) / uBsmSun.y );
	float toTop = max( 0.0, ( uBsmPlane.y - p.y ) / uBsmSun.y );
	vec2 r0 = ( xz - uBsmWindow0.xy ) / uBsmWindow0.z;
	vec2 r1 = ( xz - uBsmWindow1.xy ) / uBsmWindow1.z;
	float e0 = max( abs( r0.x - 0.5 ), abs( r0.y - 0.5 ) ) * 2.0;
	float e1 = max( abs( r1.x - 0.5 ), abs( r1.y - 0.5 ) ) * 2.0;
	bool in0 = uBsmWindow0.w > 0.5 && e0 < 0.98;
	bool in1 = uBsmWindow1.w > 0.5 && e1 < 0.98;
	if ( !in0 && !in1 ) return -1.0;
	float near = in0 ? cl2BsmRead( tBsm0, uBsmWindow0, xz, toTop, offset ) : 0.0;
	if ( !in1 ) return near;
	float far = cl2BsmRead( tBsm1, uBsmWindow1, xz, toTop, offset );
	if ( !in0 ) return far;
	return mix( near, far, smoothstep( 0.8, 0.98, e0 ) );
}
`;

/** The Beer shadow map's march (one band of texels a frame). */
export const CLOUD2_BSM_FRAGMENT = /* glsl */`
precision highp float;
precision highp sampler3D;
${CLOUD2_MEDIUM_GLSL}
uniform vec3 uBsmSunDir;
// the window's origin cell (the cell at its corner) and the texel count
uniform ivec2 uWinCell;
uniform int uTexels;
uniform float uTexelM;
// the plane (m) and the top of the shadow lanes (m)
uniform vec2 uPlane;
uniform float uSlices;
uniform float uLod;
layout( location = 0 ) out highp vec4 outBsm;
void main() {
	ivec2 ij = ivec2( gl_FragCoord.xy );
	// (the modulus of a negative int is undefined in GLSL ES: the float mod is not)
	ivec2 cell = uWinCell + ivec2( mod( vec2( ij - uWinCell ), float( uTexels ) ) );
	vec2 xz = ( vec2( cell ) + 0.5 ) * uTexelM;
	vec3 s = uBsmSunDir;
	float sy = max( s.y, 0.05 );
	float top = uPlane.y;
	// the slices go to the lanes (each from under its hanging cores to its top) and skip the clear air between them
	float total = 0.0;
	for ( int i = 0; i < 4; i++ ) if ( uLayerDensity[ i ] > 0.0 ) total += ( uLayerTop[ i ] - uLayerBase[ i ] ) * ( 1.0 + uLayerHang[ i ] );
	float dy = max( total / uSlices, 10.0 );
	float extinctionSum = 0.0, od = 0.0, tail = 0.0, T = 1.0, wd = 0.0, ws = 0.0;
	int samples = 0;
	// the lanes from the highest down (a stack's lanes stand in order, the main lane first)
	for ( int li = 3; li >= 0; li-- ) {
		if ( uLayerDensity[ li ] <= 0.0 || T < 1e-3 ) continue;
		float lt = uLayerTop[ li ], lb = uLayerBase[ li ] - ( uLayerTop[ li ] - uLayerBase[ li ] ) * uLayerHang[ li ];
		int n = max( 1, int( ceil( ( lt - lb ) / dy ) ) );
		float ldy = ( lt - lb ) / float( n );
		float ds = ldy / sy;
		for ( int k = 0; k < 96; k++ ) {
			if ( k >= n ) break;
			// fixed altitude slices from the lane's top down: the same world points every refresh (no shimmer as the window
			// moves)
			float y = lt - ( float( k ) + 0.5 ) * ldy;
			vec3 p = vec3( xz, uPlane.x ).xzy + s * ( ( y - uPlane.x ) / sy );
			float sigma = cl2Extinction( p, uLod );
			if ( sigma > 1e-5 ) {
				float dist = ( top - y ) / sy;
				float run = ds;
				if ( samples == 0 ) {
					// the first cloud on this texel's ray: its entry between this slice and the one above, by bisection, and
					// only the part of the slice inside it (on the slices' own spacing every texel's front stood on a slice:
					// steps of a slice along the sun, streaks down a tower's flank)
					float yHi = min( y + ldy, lt ), yLo = y;
					for ( int b = 0; b < 3; b++ ) {
						float ym = 0.5 * ( yHi + yLo );
						if ( cl2Extinction( vec3( xz, uPlane.x ).xzy + s * ( ( ym - uPlane.x ) / sy ), uLod ) > 1e-5 ) yLo = ym; else yHi = ym;
					}
					float ye = 0.5 * ( yHi + yLo );
					dist = ( top - ye ) / sy;
					run = ds * clamp( ( ye - ( y - 0.5 * ldy ) ) / ldy, 0.05, 1.0 );
				}
				extinctionSum += sigma;
				od += sigma * run;
				T *= exp( -sigma * run );
				wd += dist * T;
				ws += T;
				samples++;
			}
			if ( T < 1e-3 ) {
				// [ported] the depth the cut leaves out: it falls off with the samples taken before it
				tail = min( 2.0 * ds * exp( float( 1 - samples ) ), ds * 0.5 );
				break;
			}
		}
	}
	if ( samples == 0 ) { outBsm = vec4( 1e6, 0.0, 0.0, 0.0 ); return; }
	outBsm = vec4( wd / max( ws, 1e-5 ), extinctionSum / float( samples ), od, tail );
}
`;

/** The cloud shade the lit materials read (cloudShadeMap.ts): the share of the sun a column takes, from the map. */
export const CLOUD2_SHADE_FRAGMENT = /* glsl */`
precision highp float;
${CLOUD2_BSM_LOOKUP_GLSL}
// xy the shade square's centre, z its side (m)
uniform vec3 uShadeRect;
// x the core's share at most, y the optical depth that reads as a full shadow's half, z the pattern (0..1)
uniform vec3 uShadeLaw;
varying vec2 vUv;
layout( location = 0 ) out highp vec4 outShade;
void main() {
	vec2 xz = uShadeRect.xy + ( vUv - 0.5 ) * uShadeRect.z;
	vec2 rel = ( xz - uBsmWindow0.xy ) / uBsmWindow0.z;
	float share = 0.0, beam = 1.0;
	if ( uBsmWindow0.w > 0.5 && rel.x > 0.0 && rel.y > 0.0 && rel.x < 1.0 && rel.y < 1.0 ) {
		// the whole column along the sun (the plane's texels hold the ray through the plane at xz), its four texels blended
		// as transmittances: the ground under a gap the sun shows through is lit
		float od = cl2BsmRead( tBsm0, uBsmWindow0, xz, 1e9, 0.0 );
		// the beam the column passes, T = exp(−τ); a cloud passes a share of its light forward (the core's cap)
		share = uShadeLaw.x * ( 1.0 - exp( -od / max( uShadeLaw.y, 1e-3 ) ) );
		beam = exp( -od );
	}
	// r the share the lit materials take (the pattern and the core's cap applied), g the column's own transmittance
	outShade = vec4( share * uShadeLaw.z, beam, 0.0, 1.0 );
}
`;

/** The trace's per-pixel ray (history uv → world direction) and the reprojection helpers (trace and resolve). */
export const CLOUD2_CAMERA_GLSL = /* glsl */`
uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;
uniform vec2 uCamTan;
uniform vec2 uHistorySize;
uniform vec2 uTraceSize;
vec3 cloudViewDir( vec2 uv ) {
	vec2 ndc = ( uv * 2.0 - 1.0 ) * uCamTan;
	return normalize( uCamFwd + uCamRight * ndc.x + uCamUp * ndc.y );
}
vec3 cloudProject( vec3 p, vec3 camPos, vec3 right, vec3 up, vec3 fwd, vec2 tanv ) {
	vec3 d = p - camPos;
	float z = dot( d, fwd );
	vec2 ndc = vec2( dot( d, right ), dot( d, up ) ) / ( tanv * max( z, 1e-4 ) );
	return vec3( ndc * 0.5 + 0.5, z );
}
`;

/** The march's tunables per quality tier (defines). */
export interface Cloud2TraceDefines {
  /** primary steps at most */
  steps: number;
  /** multiple-scattering octaves (4 or 8) */
  octaves: number;
  /** secondary steps toward the sun */
  sunSteps: number;
}

/**
 * The trace (GLSL 3, two targets): location 0 the premultiplied radiance and the transmittance, location 1 the
 * transmittance-weighted depth (km) the resolve reprojects by. Ends with the weather beyond the medium (the rain, the sea
 * fog bank, the cirrus sheet and the contrails) from `weatherGlsl`, composited as round 71 did.
 */
export function cloud2TraceFragment(defs: Cloud2TraceDefines, skyGlsl: string, weatherGlsl: string): string {
  return /* glsl */`
precision highp float;
precision highp sampler3D;
#define CL2_STEPS ${defs.steps}
#define CL2_OCTAVES ${defs.octaves}
#define CL2_SUN_STEPS ${defs.sunSteps}
${skyGlsl}
${CLOUD2_CAMERA_GLSL}
${CLOUD2_MEDIUM_GLSL}
${CLOUD2_BSM_LOOKUP_GLSL}
uniform sampler2D tBlue;
uniform sampler2D tAtmoTransmittance;
uniform vec2 uSlot;
uniform vec2 uSubPixel;
uniform float uFrameNoise;
uniform vec3 uSunDir;
// the sun's irradiance outside the atmosphere in the sky's units, times the key light's tint
uniform vec3 uSunIrradianceTop;
// the sky's irradiance / pi at the ground (the summary's, undimmed) and the ground's radiance under the clouds
uniform vec3 uSkyIrradiance;
uniform vec3 uGroundRadiance;
uniform vec3 uTint;
uniform float uSunGain;
uniform float uAmbientScale;
// x g forward, y g back, z the back lobe's share, w the powder's scale
uniform vec4 uPhase;
uniform float uPowderExp;
// the deep diffusion's weight per lane (the decks' diffuse light under their thick columns)
uniform vec4 uLayerDiffuse;
uniform float uMarchMax;
uniform float uStepMin;
uniform float uStepGrowth;
uniform float uDetailRange;
uniform float uPixelAngle;
uniform float uOpaqueCut;
// the forward lobe of the sun's light diffused through a deck (0 = isotropic)
uniform float uDeckLobe;
uniform float uDebug;
// the scene's depth the last frame left (a layer ends at a surface past the dome)
uniform sampler2D tSceneDepth;
uniform float uSceneDepthOn;
uniform vec2 uSceneNearFar;
uniform vec3 uDepthRight;
uniform vec3 uDepthUp;
uniform vec3 uDepthFwd;
uniform vec2 uDepthTan;
uniform float uDomeRadius;
varying vec2 vUv;
layout( location = 0 ) out highp vec4 outColor;
layout( location = 1 ) out highp vec4 outDepth;
const float CL_PI = 3.14159265358979;
float luma( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }
float blueNoise( vec2 px ) { return texelFetch( tBlue, ivec2( mod( px, ${f(CLOUD_BLUE_SIZE)} ) ), 0 ).r; }
float phaseHG( float c, float g ) {
	float g2 = g * g;
	return ( 1.0 - g2 ) / ( 4.0 * CL_PI * pow( max( 1.0 + g2 - 2.0 * g * c, 1e-4 ), 1.5 ) );
}
float phaseDual( float c, float k ) { return mix( phaseHG( c, uPhase.x * k ), phaseHG( c, uPhase.y * k ), uPhase.z ); }
vec2 cloudSheetGradient( vec3 dir, vec3 rayDerivative, float height ) {
	return height * ( rayDerivative.xz * dir.y - dir.xz * rayDerivative.y ) / ( dir.y * dir.y );
}
// the sun's transmittance through the atmosphere at an altitude (m), from the sky's own LUT (atmosphere.ts)
vec3 cl2SunTransmittance( float h ) {
	float r = ${f(6360)} + max( h, 0.0 ) * 0.001;
	float H = sqrt( ${f(6460 * 6460 - 6360 * 6360)} );
	float rho = sqrt( max( r * r - ${f(6360 * 6360)}, 0.0 ) );
	float mu = uSunDir.y;
	float disc = r * r * ( mu * mu - 1.0 ) + ${f(6460 * 6460)};
	float d = max( 0.0, - r * mu + sqrt( max( disc, 0.0 ) ) );
	float dMin = ${f(6460)} - r, dMax = rho + H;
	vec2 uv = vec2( ( ( d - dMin ) / ( dMax - dMin ) + ${f(0.5 / 256)} ) * ${f(256 / 257)}, ( rho / H + ${f(0.5 / 64)} ) * ${f(64 / 65)} );
	return texture( tAtmoTransmittance, uv ).rgb;
}
// the scene's distance along a ray (1e9 for the sky, outside the last frame's frustum or inside the dome)
float cloudSceneT( vec3 dir ) {
	if ( uSceneDepthOn < 0.5 ) return 1e9;
	float fz = dot( dir, uDepthFwd );
	if ( fz < 0.05 ) return 1e9;
	vec2 uv = 0.5 + 0.5 * vec2( dot( dir, uDepthRight ) / ( fz * uDepthTan.x ), dot( dir, uDepthUp ) / ( fz * uDepthTan.y ) );
	if ( uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0 ) return 1e9;
	float depth = textureLod( tSceneDepth, uv, 0.0 ).r;
	if ( depth >= 0.999999 ) return 1e9;
	float viewZ = ( uSceneNearFar.x * uSceneNearFar.y ) / ( ( uSceneNearFar.y - uSceneNearFar.x ) * depth - uSceneNearFar.y );
	float t = -viewZ / fz;
	return t < uDomeRadius ? 1e9 : t;
}
// the parabolic shell h(t) = H along the ray: the two roots (t0 <= t1), or none
bool cl2RayShell( vec3 o, vec3 d, float H, out float t0, out float t1 ) {
	float a = dot( d.xz, d.xz ) * ( 0.5 / CL2_EARTH_R );
	float b = d.y + dot( o.xz, d.xz ) / CL2_EARTH_R;
	float c = cl2Height( o ) - H;
	if ( a < 1e-12 ) {
		if ( abs( b ) < 1e-9 ) return false;
		t0 = t1 = -c / b;
		return true;
	}
	float disc = b * b - 4.0 * a * c;
	if ( disc < 0.0 ) return false;
	float sq = sqrt( disc );
	// the numerically stable pair
	float q = -0.5 * ( b + ( b >= 0.0 ? sq : -sq ) );
	float r0 = q / a, r1 = c / q;
	t0 = min( r0, r1 ); t1 = max( r0, r1 );
	return true;
}
// the run [tA, tB] of the ray inside the band of altitudes [lo, hi] at or after the camera: along a ray the height over
// the parabolic Earth is convex in t (the ground drops away), so a ray under the band rises through its base and leaves
// through its top, a ray inside leaves through its top or (looking down) its base, a ray over it dips in through its top
vec2 cl2Band( vec3 o, vec3 d, float lo, float hi ) {
	float h0 = cl2Height( o );
	float a0, a1, b0, b1;
	bool hasLo = cl2RayShell( o, d, lo, a0, a1 );
	bool hasHi = cl2RayShell( o, d, hi, b0, b1 );
	if ( h0 < lo ) {
		if ( !hasLo || a1 <= 0.0 ) return vec2( -1.0 );
		return vec2( a1, hasHi && b1 > a1 ? b1 : 1e9 );
	}
	if ( h0 <= hi ) {
		float exitTop = hasHi && b1 > 0.0 ? b1 : 1e9;
		float exitBottom = hasLo && a0 > 0.0 ? a0 : 1e9;
		return vec2( 0.0, min( exitTop, exitBottom ) );
	}
	if ( !hasHi || b0 <= 0.0 ) return vec2( -1.0 );
	return vec2( b0, hasLo && a0 > b0 ? a0 : b1 );
}
// lane i's run along the ray, its base lowered by the hanging cores, cut at the march's reach (vec2( 1e9 ) for none)
vec2 cl2LaneRun( int i, vec3 dir, float tMax ) {
	if ( uLayerDensity[ i ] <= 0.0 ) return vec2( 1e9 );
	float lo = uLayerBase[ i ] - ( uLayerTop[ i ] - uLayerBase[ i ] ) * uLayerHang[ i ];
	vec2 b = cl2Band( uCamPos, dir, lo, uLayerTop[ i ] );
	b.y = min( b.y, tMax );
	return b.x >= 0.0 && b.y > b.x ? b : vec2( 1e9 );
}
void cl2Order( inout vec2 a, inout vec2 b ) { if ( b.x < a.x ) { vec2 c = a; a = b; b = c; } }
${weatherGlsl}
void main() {
	vec2 tp = floor( gl_FragCoord.xy );
	vec2 px = tp * 4.0 + uSlot + 0.5 + uSubPixel;
	vec3 dir = cloudViewDir( px / uHistorySize );
	vec3 rayDx = dFdx( dir ), rayDy = dFdy( dir );
	float bn = blueNoise( tp );
	float jitter = fract( bn + uFrameNoise );
	float cosT = dot( dir, uSunDir );
	vec3 L = vec3( 0.0 );
	float T = 1.0;
	float tAcc = 0.0, wAcc = 0.0;
	float sceneT = cloudSceneT( dir );
	float tMax = min( uMarchMax, sceneT );
	// the lanes' runs along the ray (a lane's run starts under its hanging cores), sorted by their start and merged where
	// they overlap: the march visits the lanes and never the air between them (an absent run starts at 1e9; a run ends
	// by the march's reach, so it never does)
	vec2 r0 = cl2LaneRun( 0, dir, tMax ), r1 = cl2LaneRun( 1, dir, tMax ), r2 = cl2LaneRun( 2, dir, tMax ), r3 = cl2LaneRun( 3, dir, tMax );
	cl2Order( r0, r1 ); cl2Order( r2, r3 ); cl2Order( r0, r2 ); cl2Order( r1, r3 ); cl2Order( r1, r2 );
	for ( int m = 0; m < 3; m++ ) {
		if ( r1.x <= r0.y ) { r0.y = max( r0.y, r1.y ); r1 = r2; r2 = r3; r3 = vec2( 1e9 ); }
		else if ( r2.x <= r1.y ) { r1.y = max( r1.y, r2.y ); r2 = r3; r3 = vec2( 1e9 ); }
		else if ( r3.x <= r2.y ) { r2.y = max( r2.y, r3.y ); r3 = vec2( 1e9 ); }
	}
	if ( r0.x < 1e9 ) {
		// the phase of each scattering octave, once per ray (the eccentricity halved per octave)
		vec4 phA = vec4( phaseDual( cosT, 1.0 ), phaseDual( cosT, 0.5 ), phaseDual( cosT, 0.25 ), phaseDual( cosT, 0.125 ) );
#if CL2_OCTAVES > 4
		vec4 phB = vec4( phaseDual( cosT, 0.0625 ), phaseDual( cosT, 0.03125 ), phaseDual( cosT, 0.015625 ), phaseDual( cosT, 0.0078125 ) );
#endif
		float sunUp = max( uSunDir.y, 0.0 );
		// a deck's runs are marched whole; the other lanes' runs are tested first (below)
		bool deckLane = any( greaterThanEqual( uLayerCover * step( vec4( 1e-6 ), uLayerDensity ), vec4( 0.7 ) ) );
		bool inRun = false;
		float t = 0.0;
		vec3 sunE = vec3( 0.0 );
		int empty = 0;
		// the skin: a cloud's lit face is a few tens of metres deep (1 / sigma), under one stride — on entering a cloud the
		// march backs up half a stride and takes its next samples at a quarter stride, so the face's light is sampled
		// instead of averaged away with the dark interior behind it
		int fine = 0;
		float prevSigma = 0.0;
		// the light: on every other lit step (the optical depth carries over one step — the history averages the
		// alternation away, the jitter moving the steps every frame), on the first step into each cloud, and none once
		// the ray is nearly opaque (the samples behind carry little weight)
		int lit = 0;
		float od = 0.0, run = 0.0;
		for ( int i = 0; i < CL2_STEPS; i++ ) {
			if ( T < 0.02 ) break;
			if ( !inRun || t > r0.y ) {
				if ( inRun ) { r0 = r1; r1 = r2; r2 = r3; r3 = vec2( 1e9 ); }
				inRun = true;
				if ( r0.x >= 1e9 ) break;
				// empty-space skipping (v1's): a run up to twelve kilometres is tested at weather taps 450 m apart (jittered)
				// before any march — a clear run costs a few fetches instead of a hundred steps
				float span = r0.y - r0.x;
				if ( span < 12000.0 && !deckLane ) {
					int taps = int( clamp( span / 450.0, 4.0, 24.0 ) );
					bool admits = false;
					for ( int q = 0; q < 24; q++ ) {
						if ( q >= taps ) break;
						vec3 pq = uCamPos + dir * ( r0.x + span * ( float( q ) + jitter ) / float( taps ) );
						if ( any( greaterThan( ( cl2Weather( pq.xz, 0.0 ) - ( 1.0 - uLayerCover ) ) * step( vec4( 1e-6 ), uLayerDensity ), vec4( 0.0 ) ) ) ) { admits = true; break; }
					}
					if ( !admits ) { t = r0.y + 1.0; continue; }
				}
				t = r0.x + max( uStepMin, r0.x * uStepGrowth ) * jitter;
				// the sun at the run's middle altitude (one LUT read a run)
				sunE = uSunIrradianceTop * cl2SunTransmittance( cl2Height( uCamPos + dir * ( 0.5 * ( r0.x + r0.y ) ) ) ) * uSunGain;
				empty = 0; fine = 0; prevSigma = 0.0;
				continue;
			}
			// the stride grows with the distance (the pixel's footprint) and never falls under the floor
			float ds = max( uStepMin, t * uStepGrowth );
			if ( fine > 0 ) ds *= 0.25;
			vec3 p = uCamPos + dir * t;
			float h = cl2Height( p );
			float foot = t * uPixelAngle;
			// the weather's mip by the footprint (a texel is CL2_LOCAL / 512 m)
			float wLod = max( 0.0, log2( max( foot * 4.0, 1.0 ) / ${f(CLOUD2_PERIODS.local / 512)} ) );
			vec4 w = cl2Weather( p.xz, wLod );
			vec4 hf;
			vec4 shell = cl2Shell( h, w, cl2Cell( p.xz, wLod ), hf );
			if ( dot( shell, shell ) <= 0.0 ) {
				// clear air: stride longer (half again per empty step, four at most), then back onto the fine lattice
				empty = min( empty + 1, 4 );
				prevSigma = 0.0;
				t += ds * ( 1.0 + float( empty ) * 0.5 );
				continue;
			}
			if ( empty > 0 ) {
				// the stride met a shell: step back half the last stride so neighbouring rays do not share a coarse boundary
				t -= ds * float( empty ) * 0.25;
				empty = 0;
				continue;
			}
			float sLod = max( 0.0, log2( max( foot * 2.0, 1.0 ) * 128.0 / uShapePeriod ) );
			float detail = uDebug == 12.0 ? 0.0 : 1.0 - smoothstep( uDetailRange * 0.6, uDetailRange, t );
			vec4 sigma4 = cl2Media( p, shell, hf, sLod, detail );
			float sigma = sigma4.x + sigma4.y + sigma4.z + sigma4.w;
			if ( sigma > 1e-5 && prevSigma <= 1e-5 && fine == 0 ) {
				// entering: back up half a stride and refine
				t -= ds * 0.5;
				fine = 4;
				lit = 0;
				prevSigma = 0.0;
				continue;
			}
			prevSigma = sigma;
			if ( sigma > 1e-5 ) {
				if ( fine > 0 ) fine--;
				vec4 wgt = sigma4 / sigma;
				if ( lit == 0 || ( ( lit & 1 ) == 0 && T > 0.15 ) ) {
					// the optical depth to the sun: a short secondary march (the detail the map lacks), then the map
					od = 0.0; run = 0.0;
					float sStep = 80.0;
					for ( int q = 0; q < CL2_SUN_STEPS; q++ ) {
						float r = run + sStep * ( 0.5 + 0.5 * jitter );
						od += cl2Extinction( p + uSunDir * r, sLod ) * sStep;
						run += sStep;
						sStep *= 2.0;
					}
					float bsm = cl2BsmDepth( p, run );
					// past both cascades (the far field, hazed): the column over the point along the sun at half its own density
					// (a far tower's interior stays a cloud's, never lit through)
					od += bsm >= 0.0 ? bsm : sigma * 0.5 * clamp( dot( wgt, uLayerTop ) - h, 0.0, 1500.0 ) / max( sunUp, 0.05 );
				}
				lit++;
				// [ported] the multiple-scattering octaves (a = b = c = 1/2 per octave)
				vec4 e1 = exp( -od * vec4( 1.0, 0.5, 0.25, 0.125 ) ) * vec4( 1.0, 0.5, 0.25, 0.125 );
				float ms = dot( e1, phA );
#if CL2_OCTAVES > 4
				vec4 e2 = exp( -od * vec4( 0.0625, 0.03125, 0.015625, 0.0078125 ) ) * vec4( 0.0625, 0.03125, 0.015625, 0.0078125 );
				ms += dot( e2, phB );
#else
				// the four octaves the low tier drops carry a sixteenth of the light: their share at no depth
				ms += 0.0625 * ( 1.0 / ( 4.0 * CL_PI ) ) * exp( -od * 0.06 );
#endif
				vec3 radiance = sunE * ms;
				vec3 dbgSun = radiance;
				// the deep diffusion of a deck: the light a thick column passes down to its base, 1 / (1 + 0.75 (1 - g) tau)
				float diffuse = dot( wgt, uLayerDiffuse );
				if ( diffuse > 0.0 ) {
					// the radiance a thick column passes down diffusely is a diffuser's, T E / pi (the in-scattered radiance of an
					// opaque medium is what leaves it); only past the lit skin, where the octaves have lost the light
					float tauV = od * max( sunUp, 0.2 );
					// the sun's share keeps a broad forward lobe through the deck (its mean over the sky unchanged): a readable
					// sun direction under a closed deck without a disc (2026-10-04, the gauntlet's wave 62 on Titan Gorge)
					float lobe = 1.0 + uDeckLobe * ( mix( phaseHG( cosT, 0.6 ), phaseHG( cosT, -0.225 ), 0.3 ) * 4.0 * CL_PI - 1.0 );
					vec3 eTop = sunE * sunUp * lobe + uSkyIrradiance * CL_PI;
					radiance += eTop * ( diffuse * ( 1.0 - exp( -od * 0.3 ) ) / ( 1.0 + 0.1125 * tauV ) / CL_PI );
				}
				vec3 dbgDiffuse = radiance - dbgSun;
				// the sky above (by the height in each lane: a base sees less of it) through what the column over the point
				// passes diffusely — a deck's base sees its deck, not the sky — and the ground below (the map's ambient scale
				// lifts the ground's return: snow under a deck)
				float skyK = dot( hf * 0.5 + 0.5, wgt );
				float skyThrough = 1.0 / ( 1.0 + 0.1125 * od * max( sunUp, 0.2 ) );
				radiance += uSkyIrradiance * ( skyK * 0.5 * skyThrough ) + uGroundRadiance * ( ( 1.0 - skyK ) * 0.5 * uAmbientScale );
				// [ported] the powder term: a thin edge has not built up its in-scattered light yet
				radiance *= 1.0 - uPhase.w * exp( -sigma * uPowderExp );
				radiance *= uTint;
				if ( uDebug == 4.0 ) radiance = vec3( 0.6 );
				// QA: one term of the light alone (5 the optical depth to the sun / 40, 6 the octaves, 7 the deep diffusion,
				// 8 the sky and ground, 9 the powder factor, 10 the extinction x 20; 12 draws the medium without its detail)
				else if ( uDebug == 5.0 ) radiance = vec3( od / 40.0 );
				else if ( uDebug == 6.0 ) radiance = dbgSun;
				else if ( uDebug == 7.0 ) radiance = dbgDiffuse;
				else if ( uDebug == 8.0 ) radiance = uSkyIrradiance * ( skyK * 0.5 * skyThrough ) + uGroundRadiance * ( ( 1.0 - skyK ) * 0.5 * uAmbientScale );
				else if ( uDebug == 9.0 ) radiance = vec3( 1.0 - uPhase.w * exp( -sigma * uPowderExp ) );
				else if ( uDebug == 10.0 ) radiance = vec3( sigma * 20.0 );
				// [ported] the energy-conserving integral of the step
				float Tstep = exp( -sigma * ds );
				vec3 S = radiance * sigma;
				L += T * ( S - S * Tstep ) / sigma;
				T *= Tstep;
				// [ported] the transmittance-weighted depth (aerial perspective and reprojection)
				tAcc += t * T;
				wAcc += T;
			}
			t += ds;
		}
		if ( T < 0.03 && uOpaqueCut > 0.0 ) { L /= max( 1.0 - T, 0.5 ); T = 0.0; }
		if ( wAcc > 1e-4 ) {
			float dist = tAcc / wAcc;
			float hAtt = exp( -max( dir.y * dist - 30.0, 0.0 ) / 150.0 );
			L = cloudHaze( L, 1.0 - T, dist, dir, hAtt );
		}
	}
	float depthM = wAcc > 1e-4 ? tAcc / wAcc : 4.0e4;
	// the layered sky: the fog bank and the rain in front, the cirrus behind
	vec4 acc = vec4( L, T );
	float tRain;
	vec4 fogL = seaFogBank( dir, jitter, sceneT );
	vec4 rainL = slabRain( dir, cosT, jitter, sceneT, tRain );
	acc = cloudOver( cloudOver( fogL, rainL ), acc );
	if ( acc.a > 0.01 ) acc = cloudOver( acc, cirrusLayer( dir, cosT, rayDx, rayDy, sceneT ) );
	outColor = vec4( max( acc.rgb, vec3( 0.0 ) ), clamp( acc.a, 0.0, 1.0 ) );
	outDepth = vec4( depthM * 0.001, 0.0, 0.0, 1.0 );
}`;
}

/**
 * The resolve: each history pixel reprojected through the previous camera at the depth its trace block saw (the nearest
 * cloud of the 3 × 3 trace texels around it), the history clipped to the variance of this frame's samples around it,
 * the fresh slot blended in; while the history rebuilds after a cut the pixels without their own sample average the
 * upsampled slots traced so far.
 */
export const CLOUD2_RESOLVE_FRAGMENT = /* glsl */`
precision highp float;
${CLOUD2_CAMERA_GLSL}
uniform sampler2D tTrace;
uniform sampler2D tTraceDepth;
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
uniform float uVarianceGamma;
varying vec2 vUv;
vec4 historyCatmullRom( vec2 uv, vec2 size ) {
	vec2 sp = uv * size;
	if ( all( lessThan( abs( sp - ( floor( sp ) + 0.5 ) ), vec2( 0.001 ) ) ) )
		return texelFetch( tHistory, ivec2( floor( sp ) ), 0 );
	vec2 tp1 = floor( sp - 0.5 ) + 0.5;
	vec2 fr = sp - tp1;
	vec2 w0 = fr * ( fr * ( fr * -0.5 + 1.0 ) - 0.5 );
	vec2 w1 = fr * fr * ( fr * 1.5 - 2.5 ) + 1.0;
	vec2 w2 = fr * ( fr * ( fr * -1.5 + 2.0 ) + 0.5 );
	vec2 w3 = fr * fr * ( fr * 0.5 - 0.5 );
	vec2 w12 = w1 + w2;
	vec2 tc0 = ( tp1 - 1.0 ) / size, tc3 = ( tp1 + 2.0 ) / size, tc12 = ( tp1 + w2 / w12 ) / size;
	float a = w12.x * w0.y, b = w0.x * w12.y, c = w12.x * w12.y, d = w3.x * w12.y, e = w12.x * w3.y;
	vec4 centre = texture( tHistory, tc12 );
	vec4 delta = ( texture( tHistory, vec2( tc12.x, tc0.y ) ) - centre ) * a
		+ ( texture( tHistory, vec2( tc0.x, tc12.y ) ) - centre ) * b
		+ ( texture( tHistory, vec2( tc3.x, tc12.y ) ) - centre ) * d
		+ ( texture( tHistory, vec2( tc12.x, tc3.y ) ) - centre ) * e;
	return centre + delta / ( a + b + c + d + e );
}
vec4 upsampled( vec2 p ) {
	vec2 suv = ( ( p - uSlot ) / 4.0 + 0.5 ) / uTraceSize;
	return texture( tTrace, suv );
}
float bayer2( vec2 c ) { return c.x * 2.0 + c.y * 3.0 - c.x * c.y * 4.0; }
float bayerRank( vec2 cell ) { return 4.0 * bayer2( mod( cell, 2.0 ) ) + bayer2( floor( cell / 2.0 ) ); }
// [ported] clip a history value toward the centre of the neighbourhood's box until it lies inside it
vec4 clipBox( vec4 history, vec4 lo, vec4 hi ) {
	vec4 centre = 0.5 * ( hi + lo );
	vec4 extent = 0.5 * ( hi - lo ) + 1e-5;
	vec4 v = history - centre;
	vec4 unit = abs( v / extent );
	float m = max( max( unit.x, unit.y ), max( unit.z, unit.w ) );
	return m > 1.0 ? centre + v / m : history;
}
void main() {
	vec2 p = floor( gl_FragCoord.xy );
	vec2 uv = ( p + 0.5 ) / uHistorySize;
	vec3 dir = cloudViewDir( uv );
	vec2 tp = floor( p / 4.0 );
	vec2 cell = p - tp * 4.0;
	bool fresh = cell == uSlot;
	vec2 traceUv = ( ( p - uSlot ) / 4.0 + 0.5 ) / uTraceSize;
	// this frame's neighbourhood: its moments for the clip, its nearest cloud for the reprojection
	vec4 m1 = vec4( 0.0 ), m2 = vec4( 0.0 );
	float nearKm = 1e4;
	for ( int y = -1; y <= 1; y++ ) for ( int x = -1; x <= 1; x++ ) {
		vec2 o = vec2( x, y ) / uTraceSize;
		vec4 s = texture( tTrace, traceUv + o );
		m1 += s; m2 += s * s;
		nearKm = min( nearKm, texture( tTraceDepth, traceUv + o ).r );
	}
	m1 /= 9.0; m2 /= 9.0;
	vec3 anchor = uCamPos + dir * clamp( nearKm * 1000.0, 50.0, 60000.0 );
	vec3 pr = cloudProject( anchor, uPrevCamPos, uPrevRight, uPrevUp, uPrevFwd, uPrevTan );
	// the clip tightens with the reprojection's motion: a still view accumulates every slot's samples (a single slot's
	// neighbourhood is a sixteenth of the pixels, its spread no measure of a converged history), a moving one keeps only
	// what this frame's samples support
	float motionPx = length( ( pr.xy - uv ) * uHistorySize );
	vec4 sigma = sqrt( max( m2 - m1 * m1, vec4( 0.0 ) ) ) * mix( uVarianceGamma * 3.0, uVarianceGamma, smoothstep( 0.25, 2.0, motionPx ) );
	bool valid = uHistoryValid > 0.5 && pr.z > 1.0 && all( greaterThan( pr.xy, vec2( 0.0 ) ) ) && all( lessThan( pr.xy, vec2( 1.0 ) ) );
	vec4 outv;
	if ( valid ) {
		vec4 h = max( historyCatmullRom( pr.xy, uHistorySize ), vec4( 0.0 ) );
		outv = uRebuildK < 0.0 ? clipBox( h, m1 - sigma - 0.004, m1 + sigma + 0.004 ) : h;
	} else {
		outv = upsampled( p );
	}
	if ( fresh ) {
		vec4 cur = texelFetch( tTrace, ivec2( tp ), 0 );
		float a = clamp( motionPx * 0.1 + uMinAlpha, uMinAlpha, 0.35 );
		outv = ( valid && uRebuildK < 0.0 ) ? outv + ( cur - outv ) * a : cur;
	} else if ( uRebuildK >= 0.0 && valid ) {
		if ( bayerRank( cell ) > uRebuildK ) outv += ( upsampled( p ) - outv ) / ( uRebuildK + 1.0 );
	}
	gl_FragColor = vec4( max( outv.rgb, vec3( 0.0 ) ), clamp( outv.a, 0.0, 1.0 ) );
}`;
