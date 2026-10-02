/**
 * cloudWeatherLayers.ts — the sky's weather beyond the volumetric slab (2026-10-01, the clouds-and-skyboxes lane).
 *
 * The slab (volumetricClouds.ts) carries a map's low and convective cloud; a real sky is layered and has weather in
 * it. This module adds, to the same trace and lit by the same atmosphere:
 *   - a mid-level layer — altocumulus elements ranked in rows across the wind (a mackerel sky), an altostratus veil,
 *     cirrocumulus ripples high up — as a 2.5D sheet: an element's thickness from the shape volume's billow octaves,
 *     the light reaching it through its own upper half and the elements toward the sun (so a low sun lights one flank
 *     and leaves the other in shade), the multiple-scattering octaves and the dual-lobe phase of the slab;
 *   - contrails — fresh lines of two merging plumes at the head that spread into contrail cirrus toward the tail,
 *     their optical depth falling as they widen (the ice spreads), drifting with the upper wind;
 *   - distant cumulonimbus cells on the horizon — a tower with a billowed outline, an anvil spread downwind under the
 *     tropopause, the sun's path through the cell found analytically (lit flanks and tops, a dark base), the
 *     boundary layer's haze on the base and not on the top — with the rain shaft under each;
 *   - rain shafts and virga under the slab's own precipitating cores (the columns leaning with the wind, streaked,
 *     evaporating partway down under a dry base);
 *   - a fog bank lying on the sea at the horizon.
 * Placement is deterministic per map (the weather offset hashes the storm cells and the trails), the GLSL reads
 * only the slab's noise volumes and weather fields, and every term is gated by its own uniform (a map without the
 * layer pays a branch). Written first-party from the meteorology; nothing is copied from any reference renderer.
 */
import * as THREE from 'three';
import type { CloudLayerPreset } from './cloudPresets.ts';

export const CLOUD_CONTRAIL_MAX = 6;
export const CLOUD_STORM_MAX = 3;
/** The storm cells' billows sample the shape volume at this world period (m): kilometre lumps on a tower. */
const CLOUD_STORM_SHAPE_TILE_M = 7000;
/**
 * Rain shafts under the slab: the ray's run under the base is sampled from here to there (m) at this many points. The
 * run starts near the composite's 3.4 km dome: the terrain inside it hides the dome, so nearer rain could only be
 * mis-occluded by a hill behind it.
 */
const CLOUD_RAIN_RANGE_M = Object.freeze([3000, 24000] as const);
const CLOUD_RAIN_SAMPLES = 8;
/** The sea fog bank begins past the terrain (all of it stands inside the cloud dome's 3.4 km) and ends here (m). */
const CLOUD_FOGBANK_RANGE_M = Object.freeze([3600, 30000] as const);
/** Rain's extinction (1/m) at a full core: a five-kilometre curtain reads as a grey veil (τ ≈ 1.5). */
const CLOUD_RAIN_EXTINCTION = 0.0003;
/** A storm cell's extinction (1/m): opaque within a few hundred metres. */
const CLOUD_STORM_EXTINCTION = 0.004;
/** The fog bank's extinction (1/m): a ten-kilometre run through it is a white wall. */
const CLOUD_FOGBANK_EXTINCTION = 0.0007;

const f = (x: number): string => { const s = String(x); return s.includes('.') || s.includes('e') ? s : `${s}.0`; };

/** Integer hash → [0, 1) (first-party; the same family as cloudNoise.ts). */
function hash01(a: number, b: number): number {
  let h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ 0x2f6b) | 0;
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  h = Math.imul(h ^ (h >>> 7), 0x27d4eb2d);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** One contrail: its direction (unit, world XZ), its line's offset from the origin (m), its centre along the line, half length, the head's and tail's age (0..1) and a fresh trail's optical depth. */
interface CloudContrail {
  dir: [number, number];
  offsetM: number;
  centreM: number;
  halfLengthM: number;
  headAge: number;
  tailAge: number;
  depth: number;
}

/** The map's trails: deterministic from its weather offset (each map opens under its own traffic). */
export function cloudContrails(preset: Pick<CloudLayerPreset, 'contrails' | 'contrailAge' | 'offset'>): CloudContrail[] {
  const out: CloudContrail[] = [];
  const seed = Math.floor(preset.offset[0] * 9973) ^ Math.floor(preset.offset[1] * 7919);
  for (let i = 0; i < Math.min(CLOUD_CONTRAIL_MAX, preset.contrails); i++) {
    const h = (k: number): number => hash01(seed + i * 31, k);
    // the airways cross the sky in a few headings: two trails often share one (a corridor), the rest cross it
    const corridor = h(1) < 0.45 && i > 0 ? out[0] : null;
    const angle = corridor ? Math.atan2(corridor.dir[1], corridor.dir[0]) + (h(2) - 0.5) * 0.12 : h(2) * Math.PI;
    const age = preset.contrailAge;
    const tail = Math.min(1, age * (0.55 + 0.9 * h(6)));
    out.push({
      dir: [Math.cos(angle), Math.sin(angle)],
      offsetM: (h(3) - 0.5) * 26000,
      centreM: (h(4) - 0.5) * 18000,
      halfLengthM: 14000 + 26000 * h(5),
      headAge: Math.min(tail, age * 0.25 * h(7)),
      tailAge: tail,
      depth: 0.32 + 0.3 * h(8),
    });
  }
  return out;
}

/** One distant storm cell: its centre (world XZ, m), core radius, base, top, anvil radius (m), rain 0..1. */
interface CloudStormCell {
  x: number;
  z: number;
  radiusM: number;
  baseM: number;
  topM: number;
  anvilM: number;
  rain: number;
}

/** The map's storm cells: spread over a sector around its azimuth at its distance, deterministic per map. */
export function cloudStormCells(preset: Pick<CloudLayerPreset, 'storms' | 'stormAzRad' | 'stormDistM' | 'stormTopM' | 'baseM' | 'rain' | 'offset'>): CloudStormCell[] {
  const out: CloudStormCell[] = [];
  const n = Math.min(CLOUD_STORM_MAX, preset.storms);
  const seed = Math.floor(preset.offset[0] * 6007) ^ Math.floor(preset.offset[1] * 4001);
  for (let i = 0; i < n; i++) {
    const h = (k: number): number => hash01(seed + i * 17, k);
    const az = preset.stormAzRad + (i - (n - 1) / 2) * 0.55 + (h(1) - 0.5) * 0.24;
    const dist = preset.stormDistM * (0.82 + 0.4 * h(2));
    const radius = 2400 + 1600 * h(3);
    out.push({
      x: Math.cos(az) * dist, z: Math.sin(az) * dist,
      radiusM: radius,
      baseM: Math.max(600, Math.min(preset.baseM, 1600)),
      topM: preset.stormTopM * (0.84 + 0.22 * h(4)),
      anvilM: radius * (2.1 + 0.9 * h(5)),
      rain: Math.max(0.55, preset.rain) * (0.75 + 0.25 * h(6)),
    });
  }
  return out;
}

/** The trace's uniforms for the weather layers (merged into the trace material's uniforms). */
export function createCloudWeatherUniforms(): Record<string, THREE.IUniform> {
  return {
    uMid: { value: new THREE.Vector4() }, uMidShape: { value: new THREE.Vector4(280, 0, 0, 0) },
    uMidShift: { value: new THREE.Vector2() }, uMidDir: { value: new THREE.Vector2(1, 0) },
    uContrailA: { value: Array.from({ length: CLOUD_CONTRAIL_MAX }, () => new THREE.Vector4()) },
    uContrailB: { value: Array.from({ length: CLOUD_CONTRAIL_MAX }, () => new THREE.Vector4()) },
    uContrails: { value: 0 }, uUpperDrift: { value: new THREE.Vector2() },
    uStormA: { value: Array.from({ length: CLOUD_STORM_MAX }, () => new THREE.Vector4()) },
    uStormB: { value: Array.from({ length: CLOUD_STORM_MAX }, () => new THREE.Vector4()) },
    uStorms: { value: 0 },
    uRain: { value: new THREE.Vector4() }, uFogBank: { value: new THREE.Vector4() },
  };
}

/** Point the weather uniforms at a preset (once per preset: the placement is static, the drifts move per frame). */
export function applyCloudWeatherPreset(u: Record<string, THREE.IUniform>, preset: CloudLayerPreset): void {
  (u.uMid.value as THREE.Vector4).set(preset.midKind ? preset.midCoverage : 0, preset.midAltM, preset.midThicknessM, preset.midDensity);
  (u.uMidShape.value as THREE.Vector4).set(preset.midCellM, preset.midBands, preset.midKind, (u.uMidShape.value as THREE.Vector4).w);
  (u.uMidDir.value as THREE.Vector2).set(Math.cos(preset.cirrusAngleRad), Math.sin(preset.cirrusAngleRad));
  const trails = cloudContrails(preset);
  u.uContrails.value = trails.length;
  trails.forEach((t, i) => {
    (u.uContrailA.value as THREE.Vector4[])[i].set(t.dir[0], t.dir[1], t.offsetM, t.centreM);
    (u.uContrailB.value as THREE.Vector4[])[i].set(t.halfLengthM, t.headAge, t.tailAge, t.depth);
  });
  const cells = cloudStormCells(preset);
  u.uStorms.value = cells.length;
  cells.forEach((c, i) => {
    (u.uStormA.value as THREE.Vector4[])[i].set(c.x, c.z, c.radiusM, c.baseM);
    (u.uStormB.value as THREE.Vector4[])[i].set(c.topM, c.anvilM, c.rain, CLOUD_STORM_EXTINCTION);
  });
  // the shafts lean a third of a metre downwind per metre of fall (a 10 m/s wind on rain falling at 4–6 m/s, half of it
  // already carried by the cloud's own drift)
  (u.uRain.value as THREE.Vector4).set(preset.rain, preset.virga, 0.35, CLOUD_RAIN_EXTINCTION);
  (u.uFogBank.value as THREE.Vector4).set(preset.fogBank, preset.fogBankTopM, CLOUD_FOGBANK_RANGE_M[0], CLOUD_FOGBANK_EXTINCTION);
}

/**
 * The weather layers' GLSL. Included in the trace after cloudHaze: it reads the trace's samplers (tShape, tDetail,
 * tWeather, tStreets), its light (uSunDir, uSunRadiance, uAmbientTop / Bottom, uTint, uSunGain, uAmbientScale), the
 * slab (uBase, uCoverage, uTypeRange, uClearRadius), the wind (uWindDir, uNoiseShift, uWeatherShift) and the helpers
 * (cloudField, phaseHG, phaseDual, cloudSheetGradient, cloudHaze).
 */
export function cloudWeatherGlsl(weatherTileM: number, cirrusHazeScaleM: number): string {
  return /* glsl */`
uniform vec4 uMid;
uniform vec4 uMidShape;
uniform vec2 uMidShift;
uniform vec2 uMidDir;
uniform vec4 uContrailA[ ${CLOUD_CONTRAIL_MAX} ];
uniform vec4 uContrailB[ ${CLOUD_CONTRAIL_MAX} ];
uniform float uContrails;
uniform vec2 uUpperDrift;
uniform vec4 uStormA[ ${CLOUD_STORM_MAX} ];
uniform vec4 uStormB[ ${CLOUD_STORM_MAX} ];
uniform float uStorms;
uniform vec4 uRain;
uniform vec4 uFogBank;
// a in front of b (premultiplied radiance, transmittance)
vec4 cloudOver( vec4 a, vec4 b ) { return vec4( a.rgb + a.a * b.rgb, a.a * b.a ); }
// ---- the mid layer: the thickness (m) of the sheet at a world xz; foot = the trace texel's footprint on it (m)
float midThickness( vec2 xz, float foot ) {
	// (a lenticular stands still over the ranges — a standing wave's crest — the other kinds ride the upper wind)
	vec2 q = uMidShape.z > 3.5 ? xz : xz + uMidShift;
	// patches of the layer with clear sky between: the broad stratiform field at twice the weather tile
	float patchF = textureLod( tWeather, q / ${f(weatherTileM * 2)} + vec2( 0.31, 0.67 ), 0.0 ).b;
	float gate = smoothstep( 1.0 - uMid.x, 1.0 - uMid.x + 0.2, patchF );
	if ( gate <= 0.0 ) return 0.0;
	float cell = uMidShape.x;
	// the element frame: x along the upper wind, the rows run across it
	vec2 r = vec2( dot( q, uMidDir ), dot( q, vec2( -uMidDir.y, uMidDir.x ) ) );
	float period = cell * 4.0;
	// the shape volume's billow octaves on a slowly evolving slice: the elements form and fade as they drift; an
	// element is a little longer along its row than across it
	vec4 s = texture( tShape, vec3( r.x / period, uMidShape.w, r.y / ( period * mix( 1.0, 1.35, uMidShape.y ) ) ) );
	float fine = 1.0 - smoothstep( cell * 0.3, cell * 1.4, foot );
	float e;
	float thr, soft;
	if ( uMidShape.z > 1.5 && uMidShape.z < 2.5 ) {
		// altostratus: a grey fibrous veil, mottled by the shape's low octave, thinning at its patches' edges
		e = mix( 0.7, s.r, 0.5 ) * mix( 1.0, s.g * 0.5 + 0.75, 0.4 );
		thr = 0.28; soft = 0.42;
	} else if ( uMidShape.z > 3.5 ) {
		// lenticular: smooth lenses long across the wind (the standing wave's crests), sharp-rimmed, never crinkled
		vec4 sl = texture( tShape, vec3( r.x / period, uMidShape.w, r.y / ( period * 2.6 ) ) );
		e = sl.g * 0.85 + sl.r * 0.15;
		// a domed lens (thick at its middle, thin at the rim) rather than a plateau
		return uMid.z * pow( clamp( ( e - 0.6 ) / 0.3, 0.0, 1.0 ), 0.6 ) * gate;
	} else {
		e = s.g * 0.62 + s.b * 0.38;
		// rows: a wandering sinusoid along the wind, the elements strung on it
		float rows = 0.5 + 0.5 * sin( 6.2831853 * r.x / ( cell * 2.4 ) + ( s.r - 0.5 ) * 2.4 );
		e *= mix( 1.0, 0.4 + 0.6 * smoothstep( 0.15, 0.85, rows ), uMidShape.y );
		// the edges crinkle with the detail volume while the footprint resolves them
		if ( fine > 0.0 ) {
			// (the slice turns three whole tiles per cycle: seamless when the phase wraps)
			float dn = texture( tDetail, vec3( r.x / ( cell * 1.3 ), uMidShape.w * 3.0, r.y / ( cell * 1.3 ) ) ).r;
			e -= ( 1.0 - dn ) * 0.2 * fine;
		}
		// a footprint past the elements sees their mean: a thin veil, never a moire
		e = mix( 0.43, e, fine * 0.85 + 0.15 );
		thr = 0.46; soft = 0.16 + 0.24 * ( 1.0 - fine );
	}
	return uMid.z * smoothstep( thr, thr + soft, e ) * gate;
}
// the mid layer along a ray: (premultiplied radiance, transmittance); tLayer = its distance (the ordering)
vec4 midLayer( vec3 dir, float cosT, vec3 rayDx, vec3 rayDy, out float tLayer ) {
	tLayer = 1e9;
	if ( uMid.x <= 0.0 || dir.y < 0.012 ) return vec4( 0.0, 0.0, 0.0, 1.0 );
	float tm = ( uMid.y - uCamPos.y ) / dir.y;
	if ( tm <= 0.0 ) return vec4( 0.0, 0.0, 0.0, 1.0 );
	float horiz = tm * length( dir.xz );
	if ( horiz > 60000.0 ) return vec4( 0.0, 0.0, 0.0, 1.0 );
	tLayer = tm;
	vec3 pm = uCamPos + dir * tm;
	vec2 gx = cloudSheetGradient( dir, rayDx, uMid.y - uCamPos.y ), gy = cloudSheetGradient( dir, rayDy, uMid.y - uCamPos.y );
	// (the history pixel's footprint: a trace texel spans four of them, each refreshed by its own jittered sample)
	float foot = max( length( gx ), length( gy ) ) * 0.4;
	float h = midThickness( pm.xz, foot );
	if ( h <= 1.0 ) return vec4( 0.0, 0.0, 0.0, 1.0 );
	float sig = uMid.w;
	float tauV = sig * h / max( dir.y, 0.08 );
	// the light's path: the element's own upper half and the elements standing toward the sun (a low sun lights one
	// flank of each element and leaves the other in its neighbour's shade)
	vec2 toSun = uSunDir.xz / max( uSunDir.y, 0.1 );
	float hs = midThickness( pm.xz + toSun * h * 0.6, foot );
	// (a low sun enters an element from its side: the path is capped at the element's width, never the slant through
	// a sheet that is not there — the sunset's lit flanks)
	float tauS = sig * min( ( 0.5 * h + 0.5 * hs ) / max( uSunDir.y, 0.1 ), uMidShape.x * 1.2 + h );
	float sunT = phaseDual( cosT, 0.8 ) * exp( -tauS ) + phaseDual( cosT, 0.4 ) * 0.5 * exp( -tauS * 0.5 ) + phaseDual( cosT, 0.2 ) * 0.25 * exp( -tauS * 0.25 );
	// the diffused light of a lit sheet (a white diffuser's skin decaying into it) and the sky above and below it
	float diff = 0.55 / ( 1.0 + 0.2 * tauS ) / CL_PI * clamp( uSunDir.y + 0.15, 0.0, 1.0 );
	vec3 amb = ( uAmbientTop * 0.9 + uAmbientBottom * 0.45 ) * uAmbientScale;
	vec3 S = ( uSunRadiance * ( sunT + diff ) * uSunGain + amb ) * uTint;
	float T = exp( -tauV );
	vec3 L = S * ( 1.0 - T );
	// aerial: the slant through the boundary layer's haze (a sheet overhead stays clear, one at the horizon melts)
	float distH = tm * clamp( ${f(cirrusHazeScaleM)} / max( uMid.y - uCamPos.y, 100.0 ), 0.0, 1.0 );
	// (the slab's altitude rule: a layer kilometres up stands over the boundary layer's haze until the far ramp)
	float hAttM = exp( -max( uMid.y - uCamPos.y - 30.0, 0.0 ) / 150.0 );
	L = cloudHaze( L, 1.0 - T, distH, dir, hAttM );
	float fade = 1.0 - smoothstep( 32000.0, 60000.0, horiz );
	return vec4( L * fade, mix( 1.0, T, fade ) );
}
// ---- contrails: the optical depth of the trails at a world xz on the cirrus sheet (foot = the texel's footprint, m)
float contrailDepth( vec2 xz, float foot ) {
	float tau = 0.0;
	vec2 rel = xz + uUpperDrift;
	for ( int i = 0; i < ${CLOUD_CONTRAIL_MAX}; i++ ) {
		if ( float( i ) >= uContrails ) break;
		vec4 A = uContrailA[ i ], B = uContrailB[ i ];
		float along = dot( rel, A.xy ) - A.w;
		if ( abs( along ) > B.x ) continue;
		float across = dot( rel, vec2( -A.y, A.x ) ) - A.z;
		// 0 at the tail, 1 at the head (where the aircraft is): the trail is older toward its tail
		float s = along / B.x * 0.5 + 0.5;
		float age = mix( B.z, B.y, s );
		float w = mix( 22.0, 1500.0, age * age );
		// (foot is the trace texel's footprint, four history pixels; each history pixel takes its own jittered sample
		// over the cycle, so a trail keeps a history pixel's width — the accumulation averages the rest)
		float wf = max( w, foot * 0.3 );
		// two engine plumes a little apart at the head, merged within a few kilometres
		float split = 18.0 * ( 1.0 - smoothstep( 0.0, 0.25, age ) );
		float u0 = ( across - split ) / wf, u1 = ( across + split ) / wf;
		float prof = 0.5 * ( exp( -u0 * u0 ) + exp( -u1 * u1 ) );
		// the ice spreads: the depth falls with the width (and a texel wider than the trail averages it)
		float peak = B.w * sqrt( 22.0 / w ) * ( w / wf );
		// an old trail breaks into fibres and lumps along its length
		vec4 fib = textureLod( tStreets, vec2( along, across * 3.0 ) / 30000.0, 0.0 );
		peak *= mix( 1.0, 0.45 + 0.9 * fib.a, smoothstep( 0.2, 0.7, age ) );
		float ends = smoothstep( 0.0, 0.3, s ) * ( 1.0 - smoothstep( 0.992, 1.0, s ) );
		tau += prof * peak * ends;
	}
	return tau;
}
// ---- distant storm cells: a vertical cylinder's span along a ray (tIn > tOut when missed)
vec2 cloudCylinderSpan( vec3 o, vec3 d, vec2 c, float R, float y0, float y1 ) {
	vec2 oc = o.xz - c;
	float a = dot( d.xz, d.xz );
	float b = dot( oc, d.xz );
	float k = dot( oc, oc ) - R * R;
	float disc = b * b - a * k;
	if ( disc <= 0.0 || a < 1e-8 ) return vec2( 1.0, -1.0 );
	float sq = sqrt( disc );
	vec2 tc = vec2( -b - sq, -b + sq ) / a;
	float dy = abs( d.y ) < 1e-5 ? 1e-5 : d.y;
	vec2 ty = vec2( ( y0 - o.y ) / dy, ( y1 - o.y ) / dy );
	return vec2( max( max( tc.x, min( ty.x, ty.y ) ), 0.0 ), min( tc.y, max( ty.x, ty.y ) ) );
}
// the distance from p along the sun until it leaves a vertical cylinder (radius R about c) or the cell's top
float cloudCylinderExit( vec3 p, vec2 c, float R, float top ) {
	vec2 oc = p.xz - c;
	vec2 d = uSunDir.xz;
	float a = dot( d, d );
	float tTop = uSunDir.y > 0.02 ? max( top - p.y, 0.0 ) / uSunDir.y : 1e6;
	if ( a < 1e-6 ) return tTop;
	float b = dot( oc, d );
	float k = dot( oc, oc ) - R * R;
	float disc = max( b * b - a * k, 0.0 );
	return min( max( ( -b + sqrt( disc ) ) / a, 0.0 ), tTop );
}
// storm cell density (0..1) at p; rainD = the shaft's density under the base
float stormDensity( vec3 p, vec4 A, vec4 B, out float rainD ) {
	rainD = 0.0;
	float h = ( p.y - A.w ) / max( B.x - A.w, 1.0 );
	vec2 rel = p.xz - A.xy;
	if ( h < 0.0 ) {
		// the shaft under the core leans downwind as it falls; streaked, thinning toward its edge
		vec2 rs = rel - uWindDir * ( A.w - p.y ) * 0.35;
		float q = length( rs ) / ( A.z * 0.72 );
		if ( q > 1.2 ) return 0.0;
		float streak = texture( tDetail, vec3( rs.x, p.y * 0.02, rs.y ) / 900.0 ).r;
		rainD = B.z * ( 1.0 - smoothstep( 0.45, 1.05, q + ( 0.5 - streak ) * 0.5 ) ) * ( 0.55 + 0.6 * streak );
		return 0.0;
	}
	if ( h > 1.0 ) return 0.0;
	vec4 s = texture( tShape, ( p + uNoiseShift ) / ${f(CLOUD_STORM_SHAPE_TILE_M)} );
	float bill = s.g * 0.55 + s.b * 0.3 + s.a * 0.15;
	// the tower: a flat base, a cauliflower outline, a head narrowing into the anvil
	float coreR = A.z * ( 0.8 + 0.2 * smoothstep( 0.0, 0.2, h ) ) * ( 1.0 - 0.3 * smoothstep( 0.72, 1.0, h ) );
	float qc = length( rel ) / coreR + ( 0.5 - bill ) * 0.6;
	// (a hard cauliflower outline: the billows draw it, a kilometre-wide soft margin read as smoke at thirty kilometres)
	float core = ( 1.0 - smoothstep( 0.8, 1.0, qc ) ) * smoothstep( 0.0, 0.035, h ) * ( 1.0 - smoothstep( 0.95, 1.0, h ) );
	// the anvil: a flat sheet under the tropopause spreading downwind, smoother than the tower, thinning at its rim
	vec2 ra = rel - uWindDir * ( B.y - A.z ) * 0.45;
	float qa = length( ra ) / B.y + ( 0.5 - bill ) * 0.35;
	float anvil = ( 1.0 - smoothstep( 0.62, 1.0, qa ) ) * smoothstep( 0.76, 0.85, h ) * ( 1.0 - smoothstep( 0.93, 1.0, h ) );
	return max( core, anvil * mix( 0.55, 1.0, 1.0 - qa ) );
}
// the storm cells along a ray: (premultiplied radiance, transmittance); tLayer = the nearest cell's distance
vec4 stormCells( vec3 dir, float cosT, float jitter, out float tLayer ) {
	tLayer = 1e9;
	vec4 acc = vec4( 0.0, 0.0, 0.0, 1.0 );
	if ( uStorms <= 0.0 || dir.y < -0.03 ) return acc;
	for ( int k = 0; k < ${CLOUD_STORM_MAX}; k++ ) {
		if ( float( k ) >= uStorms ) break;
		vec4 A = uStormA[ k ], B = uStormB[ k ];
		float shift = ( B.y - A.z ) * 0.45;
		float R = max( A.z * 1.25, shift + B.y );
		vec2 span = cloudCylinderSpan( uCamPos, dir, A.xy + uWindDir * shift * 0.5, R + shift * 0.5, 0.0, B.x );
		if ( span.x >= span.y ) continue;
		tLayer = min( tLayer, span.x );
		float ds = ( span.y - span.x ) / 18.0;
		float t = span.x + ds * jitter;
		vec3 L = vec3( 0.0 );
		float T = 1.0, tAcc = 0.0, wAcc = 0.0;
		for ( int i = 0; i < 18; i++ ) {
			if ( t > span.y || T < 0.02 ) break;
			vec3 p = uCamPos + dir * t;
			float rainD;
			float d = stormDensity( p, A, B, rainD );
			if ( d > 0.002 ) {
				float sig = d * B.w;
				float h = clamp( ( p.y - A.w ) / max( B.x - A.w, 1.0 ), 0.0, 1.0 );
				// the sun's path out of the cell (through the tower or the anvil sheet), the multiple-scattering octaves
				float exitD = h > 0.78 ? cloudCylinderExit( p, A.xy + uWindDir * shift, B.y, B.x ) * 0.45 : cloudCylinderExit( p, A.xy, A.z, B.x );
				float tauS = B.w * 0.55 * exitD;
				float sunT = phaseDual( cosT, 0.8 ) * exp( -tauS ) + phaseDual( cosT, 0.4 ) * 0.5 * exp( -tauS * 0.5 ) + phaseDual( cosT, 0.2 ) * 0.25 * exp( -tauS * 0.25 );
				// the sky lights the tops; the base, under ten kilometres of cloud, sees the lower sky and little of it
				float up = smoothstep( 0.0, 0.7, h );
				vec3 amb = ( uAmbientTop * up * 1.1 + uAmbientBottom * ( 1.0 - up ) * 0.7 ) * uAmbientScale;
				vec3 S = ( uSunRadiance * ( sunT + 0.12 / ( 1.0 + 0.05 * tauS ) ) * uSunGain + amb ) * uTint;
				float Ts = exp( -sig * ds );
				float dT = T * ( 1.0 - Ts );
				L += S * dT; tAcc += t * dT; wAcc += dT;
				T *= Ts;
			} else if ( rainD > 0.0 ) {
				float sig = rainD * ${f(CLOUD_RAIN_EXTINCTION)} * 2.0;
				vec3 S = ( uAmbientBottom * 1.5 * uAmbientScale + uSunRadiance * phaseHG( cosT, 0.7 ) * 0.12 * uSunGain ) * uTint;
				float Ts = exp( -sig * ds );
				float dT = T * ( 1.0 - Ts );
				L += S * dT; tAcc += t * dT; wAcc += dT;
				T *= Ts;
			}
			t += ds;
		}
		if ( wAcc > 1e-4 ) {
			float dist = tAcc / wAcc;
			// the boundary layer hazes the base, the tower's head stands over it
			float y = uCamPos.y + dir.y * dist;
			float distH = dist * clamp( 2500.0 / max( y - uCamPos.y, 100.0 ), 0.12, 1.0 );
			L = cloudHaze( L, 1.0 - T, distH, dir, exp( -max( y - uCamPos.y - 30.0, 0.0 ) / 150.0 ) );
			acc = cloudOver( acc, vec4( L, T ) );
		}
	}
	return acc;
}
// ---- rain shafts and virga under the slab's precipitating cores, between the camera and the base
float cloudPrecip( vec2 pxz ) {
	vec4 w, st;
	float field = cloudField( pxz, w, st );
	float cov = clamp( ( field - ( 1.0 - uCoverage ) ) / max( uCoverage * 0.5, 0.02 ), 0.0, 1.0 );
	if ( uClearRadius > 0.0 ) cov *= smoothstep( uClearRadius * 0.6, uClearRadius * 1.4, length( pxz - uCamPos.xz ) );
	float vig = mix( uTypeRange.x, uTypeRange.y, w.g );
	return cov * cov * smoothstep( 0.35, 0.75, st.g ) * mix( 0.5, 1.0, smoothstep( 0.35, 0.8, vig ) );
}
vec4 slabRain( vec3 dir, float cosT, float jitter, out float tLayer ) {
	tLayer = 1e9;
	vec4 none = vec4( 0.0, 0.0, 0.0, 1.0 );
	if ( uRain.x <= 0.0 || dir.y > 0.35 || dir.y < -0.03 || uCamPos.y > uBase ) return none;
	float tEnd = dir.y > 0.002 ? ( uBase - uCamPos.y ) / dir.y : ${f(CLOUD_RAIN_RANGE_M[1])};
	tEnd = min( tEnd, ${f(CLOUD_RAIN_RANGE_M[1])} );
	float tStart = ${f(CLOUD_RAIN_RANGE_M[0])};
	if ( tEnd <= tStart ) return none;
	float dt = ( tEnd - tStart ) / ${f(CLOUD_RAIN_SAMPLES)};
	vec3 L = vec3( 0.0 );
	float T = 1.0, tAcc = 0.0, wAcc = 0.0;
	float drop = max( uBase - uCamPos.y + 6.0, 50.0 );
	for ( int i = 0; i < ${CLOUD_RAIN_SAMPLES}; i++ ) {
		float t = tStart + dt * ( float( i ) + jitter );
		vec3 p = uCamPos + dir * t;
		float fall = max( uBase - p.y, 0.0 );
		// the column the rain fell from: upwind of the point by the lean
		vec2 cxz = p.xz - uWindDir * fall * uRain.z;
		float prec = cloudPrecip( cxz );
		if ( prec <= 0.0 ) continue;
		// streaks: the detail volume on a slice, constant down the fall (curtains), and the virga's evaporation front
		float streak = texture( tDetail, vec3( cxz.x, 37.0, cxz.y ) / 520.0 ).r;
		float reach = 1.0 - uRain.y * ( 0.55 + 0.45 * streak );
		float vprof = 1.0 - smoothstep( reach - 0.18, reach + 0.04, fall / drop );
		float rho = uRain.x * uRain.w * prec * ( 0.4 + 0.9 * streak ) * vprof;
		if ( rho <= 0.0 ) continue;
		// lit by the lower sky under the cloud (darker under a heavy core) and the sun's forward glow through the drops
		vec3 S = ( uAmbientBottom * 1.6 * uAmbientScale * ( 1.0 - 0.45 * prec ) + uSunRadiance * phaseHG( cosT, 0.72 ) * 0.1 * uSunGain ) * uTint;
		float Ts = exp( -rho * dt );
		float dT = T * ( 1.0 - Ts );
		L += S * dT; tAcc += t * dT; wAcc += dT;
		T *= Ts;
		tLayer = min( tLayer, t );
	}
	if ( wAcc < 1e-4 ) return none;
	float hAtt = 1.0;
	return vec4( cloudHaze( L, 1.0 - T, tAcc / wAcc, dir, hAtt ), T );
}
// ---- a fog bank lying on the sea at the horizon: the ray's run under the bank's top past the terrain
vec4 seaFogBank( vec3 dir, float jitter ) {
	vec4 none = vec4( 0.0, 0.0, 0.0, 1.0 );
	if ( uFogBank.x <= 0.0 || dir.y > 0.05 || dir.y < -0.03 ) return none;
	float tA = uFogBank.z;
	float tTop = dir.y > 1e-4 ? ( uFogBank.y - uCamPos.y ) / dir.y : 1e9;
	float tB = min( tTop, ${f(CLOUD_FOGBANK_RANGE_M[1])} );
	if ( tB <= tA ) return none;
	float tau = 0.0;
	for ( int i = 0; i < 6; i++ ) {
		float t = mix( tA, tB, ( float( i ) + jitter ) / 6.0 );
		vec3 p = uCamPos + dir * t;
		// banks with gaps between them (the broad field at twice the tile), a lumpy top
		vec2 q = p.xz + uWeatherShift * 0.3;
		float patchF = textureLod( tWeather, q / ${f(weatherTileM * 2)} + vec2( 0.13, 0.77 ), 0.0 ).b;
		float cov = smoothstep( 1.0 - uFogBank.x, 1.0 - uFogBank.x + 0.25, patchF );
		float topLocal = uFogBank.y * ( 0.5 + 0.6 * textureLod( tWeather, q / 2600.0, 0.0 ).a );
		tau += cov * smoothstep( 0.0, 0.3, ( topLocal - p.y ) / max( topLocal, 1.0 ) );
	}
	tau *= uFogBank.w * ( tB - tA ) / 6.0;
	if ( tau < 1e-3 ) return none;
	float T = exp( -tau );
	// a sunlit fog top is white; its face takes the sky's light
	vec3 S = ( uSunRadiance * clamp( uSunDir.y, 0.0, 1.0 ) * 0.3 / CL_PI * uSunGain + uAmbientTop * 1.05 + uAmbientBottom * 0.3 ) * uAmbientScale * uTint;
	return vec4( cloudHaze( S * ( 1.0 - T ), 1.0 - T, 0.5 * ( tA + tB ), dir, 1.0 ), T );
}
`;
}
