/**
 * volumetricClouds.ts — the raymarched cloud layer over every battlefield (round 68, 2026-09-24; round 71's cloudscapes;
 * Clouds 2.0, 2026-10-06: the layered medium, the Beer shadow map and the depth-reprojected history).
 *
 * The medium (cloudShaders.ts, after the clouds package of Takram's three-geospatial) is up to four altitude lanes
 * (cloudLayers.ts resolves them from the map's preset): each a coverage of the local weather (cloudNoise.ts — fields of
 * cumulus groups with clearings, the elements aloft, the stratiform decks and their cells, or the street rolls in the
 * wind frame) shaped into a shell (a dome over a flat base, a deck flat on both faces), eroded by a 3.2 km Perlin–Worley
 * shape volume and a detail volume (cloudVolumeNoise.ts, baked on the GPU at load) under a density profile, so a cloud
 * is carved out of the weather by the shape and never one stamped cell. Over a parabolic Earth: the shells curve down
 * toward the horizon, so the far field converges as a real one does and the march (to 36 km on the high tier, with
 * the footprint's growing stride and the weather's mip) ends where the haze has taken it.
 *
 * Light: the sun's irradiance at each sample's altitude through the atmosphere's own transmittance LUT, its optical
 * depth to the sun from a short secondary march plus the Beer shadow map — a sun-space march of the same medium,
 * world-anchored and toroidal around the camera, refreshed a band a frame — so a cloud's core, its base and a deck's
 * thick cells take the shade of the whole mass above them; the multiple-scattering octaves under a dual-lobe phase
 * (the silver lining), the powder term, the sky above and the ground below by the height in the lane, the deep
 * diffusion of a deck's column; the energy-conserving step integral; the aerial pass's own haze law on the
 * transmittance-weighted depth (cloudHaze, mirrored from post.ts).
 *
 * Cost: the trace runs at one sixteenth of a half-resolution history (the 4 × 4 Bayer slot cycle, four slots a frame
 * after a camera cut), writes its colour and its depth, and the resolve reprojects every history pixel through the
 * previous camera at the depth its block saw, clipped to the variance of this frame's samples. The composite is the
 * round-68 dome (unchanged: the lens flare, the sun shafts and the horizon panorama read its history and uniforms).
 * The cloud shade the lit materials read (cloudShadeMap.ts) is the Beer shadow map's column depth: the ground's
 * shadows are the visible clouds'. post.ts owns one hook: `scene.userData.volumetricClouds.beforeSceneRender(...)`.
 *
 * The sky's weather beyond the medium stays round 71's and the clouds-and-skyboxes lane's (cloudWeatherLayers.ts): the
 * rain and virga under the precipitating cores, the sea fog bank, the cirrus sheet with its 22° halo and the contrails,
 * lightning in a night storm, the moonlight's hue and a town's glow on the bases.
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { ATMOSPHERE_SKY_GLSL, ATMO_GROUND_KM } from './atmosphere.ts';
import type { AtmospherePublishedState } from './sky.ts';
import { CLOUD_BLUE_SIZE, CLOUD_LOCAL_SIZE, CLOUD_WEATHER_SIZE } from './cloudNoise.ts';
import { CLOUD_LAYER_RULES, cloudLayerKey, type CloudLayerPreset } from './cloudPresets.ts';
import { resolvePresetName } from './quality.ts';
import { publishCloudShade, type CloudShadeUniforms } from './cloudShadeMap.ts';
import { lightTune } from './lightModelCore.ts';
import { beginRgba8Readback } from './rgba8Readback.ts';
import { hazeTargetTerms } from './hazeLaw.ts';
import {
  CLOUD_CONTRAIL_MAX, CLOUD_FOGBANK_RANGE_M, CLOUD_RAIN_RANGE_M, CLOUD_RAIN_SAMPLES,
  applyCloudWeatherPreset, createCloudWeatherUniforms,
} from './cloudWeatherLayers.ts';
import { bakeCloudVolumes, type CloudVolumeTextures } from './cloudVolumeNoise.ts';
import { cloudBsmSlices, cloudDeckTau, cloudGroundLight, cloudStackOf, packCloudStack } from './cloudLayers.ts';
import {
  CLOUD2_BSM_FRAGMENT, CLOUD2_RESOLVE_FRAGMENT, CLOUD2_SHADE_FRAGMENT, cloud2TraceFragment, type Cloud2TraceDefines,
} from './cloudShaders.ts';

/** 0..1 smoothstep of a 0..1 ramp (the deck's far rows' share of the overcast haze target). */
const smoothstep01 = (x: number): number => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };

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
/** World periods (m) of the round-71 weather fields the sky beyond the medium reads (the rain, the fog bank, the cirrus). */
export const CLOUD_WEATHER_TILE_M = 12000;
const CLOUD_STREET_TILE_M = 12000;
const CLOUD_CIRRUS_TILE_M = 30000;
/**
 * 2026-10-04 (the gauntlet's wave 62 on Titan Gorge: "no readable sun direction" under its closed deck): the broad forward
 * lobe the sun's light keeps diffused through a deck (a dual Henyey–Greenstein of g 0.6 over the isotropic share, its
 * mean over the sky unchanged); the deck's deep diffusion carries it.
 */
// (round 6, wave 222: an overcast "with no brighter patch to give the sun's direction" — the critics' advice "a lower,
// subtler deck that shows the sun's direction, not more cloud contrast": the forward lobe through a deck at 0.45)
export const CLOUD_DECK_SUN_LOBE = 0.45;
// (the march's light budget is per tier now: CLOUD_TIERS lightEvery / exitT / fineN / fineStride. Round 9 set the high
// tier's — the light on every third lit step, the march out at 0.05 of the light, priced at Monsoon's sky-w: −0.18 and
// −0.46 ms; the sun step kept for the towers' self-shadowing near the point)
/**
 * The ground's return on a closing deck's base, a multiple of the law's (2026-10-07, round 5): the cover's own light
 * raised from the snow or sand under it (round four's Whiteout deck sat at 163 of 255 over a snowfield near white).
 */
const CLOUD_DECK_GROUND_RETURN = 2;
/** 2026-10-01: a lightning stroke's peak glow on the cloud around it (the composite's units, after the night dimming). */
const CLOUD_FLASH_STRENGTH = 0.9;
/** 2026-10-01: the cirrus streak frame's warp (m): the jet's eddies bend the streaks over tens of kilometres. */
const CIRRUS_WARP_M = 2600;
/** 2026-10-01: the convective boil — the shape and detail noise rise through a cumulus at this rate (m/s). */
const CLOUD_BOIL_M_PER_S = 0.7;
/** 2026-10-01: the trails' upper drift and the boil wrap here (m): whole tiles of every field they read. */
const CLOUD_UPPER_WRAP_M = 600000;
/** A drift kept inside (-w, w): continuous through zero and a whole wrap at ±w (2026-10-02). */
const wrapDrift = (v: number, w: number): number => (v >= w ? v - w : v <= -w ? v + w : v);
/** 2026-10-01: the ground's light on the cloud bases at night (the composite's units). */
const CLOUD_GROUND_GLOW_K = 0.16;
/**
 * The share of the sun's beam a cloud core takes at most (the map's darkest texel): a fair-weather cumulus core passes
 * about a tenth of the direct beam (2026-10-05, the skies lane's clouds and land).
 */
export const CLOUD_SHADOW_CORE = 0.9;
/**
 * Clouds 2.0: the column optical depth whose shade reads as the core's half. A Beer column passes e^−τ of the beam; the
 * shade is the core's share × (1 − e^(−τ / τ½)), so a cumulus' thin rim (τ ≈ 1) shades about half as much as its core.
 */
export const CLOUD_SHADOW_TAU = 1.4;
/**
 * The cloud shade map: one square around the camera at the plane the lit materials project to (cloudShadeMap.ts
 * cotCloudSun), re-rendered from the Beer shadow map every frame (a cheap pass) at a texel of 23 m.
 */
export const CLOUD_FAR_SHADE_SIZE = 512;
/** The square's side (m): the battlefield, the ring and the land an overview sees. */
export const CLOUD_FAR_SHADE_SPAN_M = 12000;
/**
 * Frames between the shade's refreshes (2026-10-07, the cost rule's CPU: every 4 frames on its own phase, never in a
 * frame that marches a band of the Beer shadow map — one auxiliary pass a frame at most; a strong wind still moves the
 * field well under a texel between two).
 */
export const CLOUD_FAR_SHADE_EVERY = 4;
/**
 * The Beer shadow map's cascades: texels, the window's side (m), the bands one refresh is split into and the frames
 * between two bands. The near one (a texel of 23 m) shades the ground and the clouds over the battlefield; the far one
 * (a texel of 78 m) lights the clouds out to twenty kilometres, past which the haze owns them. Every band of both after a
 * camera cut or a preset change. (A 250 m far texel drew the lit faces of every cloud past the near window as flat
 * facets — the map's front depth interpolated across a texel the size of a cumulus' lobe; the trace's sun march covers
 * a far texel's first few hundred metres now, the map the depth behind them.)
 */
// (2026-10-07, the cost rule's CPU — H1: Clouds 2.0 +0.3 to +0.6 ms of the main thread a frame against the old layer, its
// auxiliary passes about two more a frame — and GPU: a band of twice the rows every 4 and 8 frames on their own phases,
// one auxiliary pass a frame at most and each map's turnover once a second and two: the clouds drift under a texel in it)
export const CLOUD_BSM_CASCADES = Object.freeze([
  Object.freeze({ texels: 512, span: 12000, bands: 16, every: 4, phase: 0 }),
  Object.freeze({ texels: 512, span: 40000, bands: 16, every: 8, phase: 6 }),
] as const);
/**
 * The shade map's and the sun mean's phases (the frame counter has moved on by one when they run): in the frame f the near
 * cascade marches when f ≡ 0 (mod 4), the far one when f ≡ 2 (mod 8), the shade when f ≡ 1 and the sun mean when f ≡ 3.
 */
const CLOUD_SHADE_PHASE = 2;
const CLOUD_SUN_MEAN_PHASE = 0;
/**
 * A front's clear radius over the camera, as a share of the regime's (2026-10-07, the gauntlet's wave 198 on Monsoon: "the
 * road and trees are lit with hard, bright, clear-sky sunlight despite a heavy dark storm ceiling overhead" — at the full
 * 2.5 km the towers stood round an open battlefield in the sun; at a third, wave W's chase still stood in clear-sky sun
 * under the towers' bases): none — a front's towers stand anywhere, over the camera too, and shade the field.
 */
export const CLOUD_CLEAR_RADIUS_SHARE = 0;
/** The tiers' stretch of the cascades' refresh (a band every n × `every` frames): the low tier's map turns over in a second. */
export const CLOUD_BSM_TIER_STRETCH: Readonly<Record<string, number>> = Object.freeze({ low: 2, medium: 1, high: 1, ultra: 1 });
/** The Beer shadow map's march: altitude slices through the shadow lanes (the stack's own count: cloudLayers.ts cloudBsmSlices). */
export const CLOUD_BSM_SLICES = 32;
/** The march's reach on High and the dome shell radius (inside camera.far); the tiers own the step counts. */
export const CLOUD_MARCH_MAX_M = 36000;
export const CLOUD_DOME_RADIUS_M = 3400;
/** Camera-cut thresholds: a jump (m), a turn (rad) or a zoom (relative tangent) that invalidates the history. */
export const CLOUD_CUT_JUMP_M = 6;
export const CLOUD_CUT_TURN_RAD = 0.35;
// Reprojection already accounts for both cameras' field of view. The gun's
// 7.5% FOV punch must keep that history: resetting for each easing step left
// the sky permanently in its coarse four-slot rebuild during a shot.
export const CLOUD_CUT_ZOOM = 0.20;

export function cloudCameraCut(movedM: number, turnedRad: number, previousTan: number, currentTan: number): boolean {
  const zoomRatio = Math.max(previousTan, currentTan) / Math.min(previousTan, currentTan);
  return movedM > CLOUD_CUT_JUMP_M || turnedRad > CLOUD_CUT_TURN_RAD
    || !Number.isFinite(zoomRatio) || zoomRatio > 1 + CLOUD_CUT_ZOOM;
}
/**
 * The aerial pass's haze law (post.ts AERIAL_* constants, mirrored so a cloud bank converges like the ring):
 * extinction and scatter-in densities (1/m), their ceilings, the desaturation and cool shift. The target is the
 * sky-view LUT along the ray itself, without the pass's luminance caps.
 */
export const CLOUD_AERIAL = Object.freeze({
  density: 0.00145, hazeDensity: 0.00092, hazeStart: 85, extCeiling: 0.42, scatterCeiling: 0.38,
  /** 2026-10-02: the pass's haze layer (AERIAL_LAYER_H): its scale height over the ground under the camera (m) */
  layerH: 300,
  desat: 0.62, cool: [0.90, 0.97, 1.08] as const,
  /** the pass's height-aware atmosphere: the falloff's start over the camera (m), its e-fold height, the shares */
  heightRef: 30, heightScale: 150, heightScatterK: 0.75, heightExtK: 0.35,
  /** past the ring the scatter-in ceiling rises toward the sky and the altitude rule fades out */
  farStartM: 5000, farEndM: 24000, farScatterCeiling: 0.82,
  /** the cirrus sheet's slant through the boundary-layer haze: its e-fold height (m) */
  cirrusHazeScaleM: 1500,
});
/**
 * The march's tunables per quality preset (the mobile tier never runs the layer): the primary steps, the octaves, the
 * secondary steps toward the sun, the stride floor and growth, the march's reach, the detail's reach (m).
 */
// and the march's light budget per tier (round 11, 2026-10-08): the light on every lightEvery-th lit step, the march out at
// exitT of the light, the entry refinement's fineN samples at fineStride of a step. High and ultra keep round 10's (the
// look the waves passed, F1's cost); medium and low take the cheaper budget the layer's own GPU timer priced on Monsoon's
// towers at high (the three together −0.77 ms on establishing and sky-w) — F2 put medium's sky-w at +1.07 ms, over the
// normal line its exception requires.
export const CLOUD_TIERS: Readonly<Record<string, Cloud2TraceDefines & { stepMin: number; growth: number; marchMax: number; detailRange: number;
  lightEvery: number; exitT: number; fineN: number; fineStride: number }>> = Object.freeze({
  low: { steps: 72, octaves: 4, sunSteps: 1, stepMin: 90, growth: 0.016, marchMax: 22000, detailRange: 2500, lightEvery: 4, exitT: 0.08, fineN: 2, fineStride: 0.5 },
  medium: { steps: 96, octaves: 4, sunSteps: 1, stepMin: 70, growth: 0.013, marchMax: 28000, detailRange: 6000, lightEvery: 4, exitT: 0.08, fineN: 2, fineStride: 0.5 },
  // (round 9: the stride's growth 0.011 → 0.0125 — the cost lab's knob screen on Monsoon's towers: 0.26 ms at ×1.3)
  high: { steps: 128, octaves: 8, sunSteps: 2, stepMin: 50, growth: 0.0125, marchMax: CLOUD_MARCH_MAX_M, detailRange: 20000, lightEvery: 3, exitT: 0.05, fineN: 4, fineStride: 0.25 },
  ultra: { steps: 160, octaves: 8, sunSteps: 3, stepMin: 40, growth: 0.009, marchMax: 40000, detailRange: 30000, lightEvery: 3, exitT: 0.05, fineN: 4, fineStride: 0.25 },
});
/** The noise uploads the layer needs from the worker, in its posting order (the volumes are baked on the GPU). */
export const CLOUD_NOISE_KINDS = Object.freeze(['blue', 'weather', 'streets', 'local'] as const);
export type CloudNoiseKind = (typeof CLOUD_NOISE_KINDS)[number];

const f = (x: number): string => { const s = String(x); return s.includes('.') || s.includes('e') ? s : `${s}.0`; };

const QUAD_VERTEX = /* glsl */`
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}`;

/**
 * The sky beyond the medium (round 71 and the clouds-and-skyboxes lane, unchanged in their law): the aerial haze the
 * trace applies to every layer, the contrails, the rain and virga under the main lane's precipitating cores, the sea fog
 * bank and the cirrus sheet. Reads the round-71 weather fields (tWeather, tStreets) and their drift.
 */
const CLOUD_SKY_WEATHER_GLSL = /* glsl */`
uniform sampler2D tWeather;
uniform sampler2D tStreets;
uniform vec2 uWeatherShift;
uniform vec2 uStreetShift;
uniform vec2 uWindDir;
uniform vec3 uSunRadiance;
uniform vec3 uAmbientTop;
uniform vec3 uAmbientBottom;
uniform float uBase;
uniform float uCirrus;
uniform vec2 uCirrusDir;
uniform float uCirrusAlt;
uniform vec2 uCirrusShift;
uniform float uCirrusDensity;
uniform float uHazeDatum;
float cloudHazeLayer( float dist, vec3 dir ) {
	float y0 = max( uCamPos.y - uHazeDatum, 0.0 );
	if ( y0 <= 1.0 ) return 1.0;
	float y1 = max( uCamPos.y + dir.y * dist - uHazeDatum, 0.0 );
	float H = ${f(CLOUD_AERIAL.layerH)};
	float fromCam = abs( y0 - y1 ) < 1.0 ? exp( -0.5 * ( y0 + y1 ) / H ) : H * ( exp( -y1 / H ) - exp( -y0 / H ) ) / ( y0 - y1 );
	float fromGround = y1 < 1.0 ? exp( -0.5 * y1 / H ) : H * ( 1.0 - exp( -y1 / H ) ) / y1;
	return clamp( fromCam / max( fromGround, 1e-3 ), 0.0, 1.0 );
}
// the aerial pass's law on a layer at its distance: desaturation and a cool shift, then the scatter-in toward
// the sky-view LUT along the ray under the same ceilings (uncapped: a bank fades into the sky it stands
// against), both decaying with the layer's altitude over the camera as the pass's height-aware atmosphere does
// 2026-10-03 (the gauntlet's wave 17 on Frosthollow: "a flat whitish band just above the true horizon where the haze layer
// meets the cloud deck — a discrete seam"): under a deck the far clouds converge on the aerial pass's own target — the
// authored tint's share of the hue (x) at the sky's luminance, a level under it (y; hazeLaw.ts hazeTargetTerms) — not the
// clear sky's LUT: the deck's far rows paled to the clear horizon's glow while the ranges under them took the dim
// overcast haze. w: the share of that target (none under an open sky, all of it from a third of a deck's overcast)
uniform vec4 uOvercastHaze;
uniform vec3 uOvercastTint;
vec3 cloudHaze( vec3 L, float opacity, float dist, vec3 dir, float hAtt ) {
	float layer = cloudHazeLayer( dist, dir );
	float x = dist * ${f(CLOUD_AERIAL.density)} * layer;
	float fe = min( 1.0 - exp( -x * x ), ${f(CLOUD_AERIAL.extCeiling)} ) * mix( 1.0, hAtt, ${f(CLOUD_AERIAL.heightExtK)} );
	vec3 hazy = mix( L, vec3( luma( L ) ), ${f(CLOUD_AERIAL.desat)} ) * vec3( ${CLOUD_AERIAL.cool.map(f).join(', ')} );
	L = mix( L, hazy, fe );
	float hz = max( dist - ${f(CLOUD_AERIAL.hazeStart)}, 0.0 ) * ${f(CLOUD_AERIAL.hazeDensity)} * layer;
	// beyond the ring's range the pass's ceiling and altitude rule no longer apply (they hold a lit mountain
	// against the haze): a bank far out converges on the sky it stands against
	float farW = smoothstep( ${f(CLOUD_AERIAL.farStartM)}, ${f(CLOUD_AERIAL.farEndM)}, dist );
	float fs = min( 1.0 - exp( -hz * hz ), mix( ${f(CLOUD_AERIAL.scatterCeiling)}, ${f(CLOUD_AERIAL.farScatterCeiling)}, farW ) )
		* mix( 1.0, hAtt, ${f(CLOUD_AERIAL.heightScatterK)} * ( 1.0 - farW ) );
	vec3 skyDir = normalize( vec3( dir.x, max( dir.y, 0.02 ), dir.z ) );
	vec3 target = atmoSkyVisible( skyDir );
	if ( uOvercastHaze.w > 0.0 ) {
		vec3 law = mix( target, uOvercastTint * ( luma( target ) / max( luma( uOvercastTint ), 1e-4 ) ), uOvercastHaze.x ) * uOvercastHaze.y;
		target = mix( target, law, uOvercastHaze.w );
	}
	return mix( L, target * opacity, fs );
}
// ---- the scene's distance along a ray (2026-10-03; the mountains lane: "seaFogBank() integrates out to 30 km regardless
// of scene depth", Saltwind's far shore stood as a pale slab over the channel). The layer composites through the dome at
// 3.4 km with the depth test, so a surface out past it (to the camera's 4 km) took every layer the trace summed — the
// whole sea fog bank from its 3.6 km out, the rain, the far band, the cirrus — with a sheer cut where the surface
// crossed the bank's start. The trace runs before the frame's scene, so it reads the previous frame's resolved depth
// through the camera that drew it (post.ts hands it over; a frame-old silhouette is sub-pixel at that range): every
// layer ends at the surface. 1e9 for the sky, outside that frustum, or before a frame has drawn the scene.
// ---- the weather layers (2026-10-01): the contrails, the rain and virga, the sea fog bank — cloudWeatherLayers.ts
// places the trails and packs these uniforms
uniform vec4 uContrailA[ ${CLOUD_CONTRAIL_MAX} ];
uniform vec4 uContrailB[ ${CLOUD_CONTRAIL_MAX} ];
uniform float uContrails;
uniform vec2 uUpperDrift;
uniform vec4 uRain;
// QA (round 9 candidate): 0 the rain law over the weather and the anvil field, 1 rain under the towers' cores only
uniform float uRainCore;
uniform vec4 uFogBank;
// a in front of b (premultiplied radiance, transmittance)
vec4 cloudOver( vec4 a, vec4 b ) { return vec4( a.rgb + a.a * b.rgb, a.a * b.a ); }
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
		// (2026-10-03: a fresh trail 40 m wide, not 22 — a line two or three pixels wide at 10 km read as a scratch)
		float w = mix( 40.0, 1500.0, age * age );
		// (foot is the trace texel's footprint, four history pixels; each history pixel takes its own jittered sample
		// over the cycle, so a trail keeps a history pixel's width — the accumulation averages the rest)
		float wf = max( w, foot * 0.3 );
		// two engine plumes a little apart at the head, merged within a few kilometres
		float split = 18.0 * ( 1.0 - smoothstep( 0.0, 0.25, age ) );
		float u0 = ( across - split ) / wf, u1 = ( across + split ) / wf;
		float prof = 0.5 * ( exp( -u0 * u0 ) + exp( -u1 * u1 ) );
		// the ice spreads: the depth falls with the width (and a texel wider than the trail averages it)
		float peak = B.w * sqrt( 40.0 / w ) * ( w / wf );
		// an old trail breaks into fibres and lumps along its length
		vec4 fib = textureLod( tStreets, vec2( along, across * 3.0 ) / 30000.0, 0.0 );
		peak *= mix( 1.0, 0.45 + 0.9 * fib.a, smoothstep( 0.2, 0.7, age ) );
		// 2026-10-03 (the skies lane; wave 5's "perfectly straight streak ... a rendering artifact"): a trail persists only
		// where the air at its height is supersaturated over ice, so it runs in segments of a few kilometres with gaps where
		// the air is dry — the broad weather channel along the track, at its own phase per trail
		peak *= smoothstep( 0.3, 0.55, textureLod( tWeather, vec2( along / 30000.0 + float( i ) * 0.173, 0.29 + float( i ) * 0.137 ), 0.0 ).b );
		float ends = smoothstep( 0.0, 0.3, s ) * ( 1.0 - smoothstep( 0.992, 1.0, s ) );
		tau += prof * peak * ends;
	}
	return tau;
}
// ---- rain shafts and virga under the slab's precipitating cores, between the camera and the base
// ---- rain shafts and virga under the main lane's precipitating cores, between the camera and the base
float cloudPrecip( vec2 pxz ) {
	vec4 w = cl2Weather( pxz, uLayerBase.x, 0.0 );
	float cov = smoothstep( 1.0 - uLayerCover.x * 0.9, 1.0, w.x ) * step( 1e-6, uLayerDensity.x );
	vec2 q = vec2( dot( pxz, uWindDir ), dot( pxz, vec2( -uWindDir.y, uWindDir.x ) ) );
	float anvil = textureLod( tStreets, ( q + uStreetShift ) / ${f(CLOUD_STREET_TILE_M)}, 0.0 ).g;
	float law = cov * cov * smoothstep( 0.35, 0.75, anvil );
	if ( uRainCore <= 0.0 ) return law;
	// under a tower's core only (the weather's peak under its footprint), no anvil field: the rain falls where the eye sees
	// the storm, never streaked over a far tower from a clear column in front of it (wave 235 on Monsoon)
	float core = smoothstep( 1.0 - uLayerCover.x * 0.4, 1.0 - uLayerCover.x * 0.1, w.x ) * step( 1e-6, uLayerDensity.x );
	return mix( law, core, uRainCore );
}
vec4 slabRain( vec3 dir, float cosT, float jitter, float sceneT, out float tLayer ) {
	tLayer = 1e9;
	vec4 none = vec4( 0.0, 0.0, 0.0, 1.0 );
	if ( uRain.x <= 0.0 || dir.y > 0.35 || dir.y < -0.03 || uCamPos.y > uBase ) return none;
	float tEnd = dir.y > 0.002 ? ( uBase - uCamPos.y ) / dir.y : ${f(CLOUD_RAIN_RANGE_M[1])};
	tEnd = min( min( tEnd, ${f(CLOUD_RAIN_RANGE_M[1])} ), sceneT );
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
		// (round 7, wave 221 on Monsoon: a shaft in front of a tower's dark core read as blue sky through it — under the
		// storm the rain sees the storm's grey base, not the open sky: its light greyed toward its luminance and darker
		// under a heavy core, the sun's glow only where the column is thin)
		vec3 amb = uAmbientBottom * 1.6 * uAmbientScale;
		amb = mix( amb, vec3( dot( amb, vec3( 0.2126, 0.7152, 0.0722 ) ) ), 0.7 ) * ( 1.0 - 0.7 * prec );
		vec3 S = ( amb + uSunRadiance * phaseHG( cosT, 0.72 ) * 0.1 * uSunGain * ( 1.0 - prec ) ) * uTint;
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
vec4 seaFogBank( vec3 dir, float jitter, float sceneT ) {
	vec4 none = vec4( 0.0, 0.0, 0.0, 1.0 );
	if ( uFogBank.x <= 0.0 || dir.y > 0.05 || dir.y < -0.03 ) return none;
	float tA = uFogBank.z;
	float tTop = dir.y > 1e-4 ? ( uFogBank.y - uCamPos.y ) / dir.y : 1e9;
	float tB = min( min( tTop, ${f(CLOUD_FOGBANK_RANGE_M[1])} ), sceneT );
	if ( tB <= tA ) return none;
	float tau = 0.0;
	for ( int i = 0; i < 6; i++ ) {
		float t = mix( tA, tB, ( float( i ) + jitter ) / 6.0 );
		vec3 p = uCamPos + dir * t;
		// banks with gaps between them (the broad field at twice the tile), a lumpy top
		vec2 q = p.xz + uWeatherShift * 0.3;
		float patchF = textureLod( tWeather, q / ${f(CLOUD_WEATHER_TILE_M * 2)} + vec2( 0.13, 0.77 ), 0.0 ).b;
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
// ---- the far band: a distant stratocumulus deck beyond the slab's traced range, a flat band at the horizon
vec4 cirrusLayer( vec3 dir, float cosT, vec3 rayDx, vec3 rayDy, float sceneT ) {
	vec4 none = vec4( 0.0, 0.0, 0.0, 1.0 );
	if ( ( uCirrus <= 0.0 && uContrails <= 0.0 ) || dir.y <= 0.012 ) return none;
	float tc = ( uCirrusAlt - uCamPos.y ) / dir.y;
	if ( tc <= 0.0 || tc >= sceneT ) return none;
	vec3 pc = uCamPos + dir * tc;
	vec2 q = vec2( dot( pc.xz, uCirrusDir ), dot( pc.xz, vec2( -uCirrusDir.y, uCirrusDir.x ) ) );
	vec2 gx = cloudSheetGradient( dir, rayDx, uCirrusAlt - uCamPos.y ) / ${f(CLOUD_CIRRUS_TILE_M)};
	vec2 gy = cloudSheetGradient( dir, rayDy, uCirrusAlt - uCamPos.y ) / ${f(CLOUD_CIRRUS_TILE_M)};
	float tauC = 0.0;
	// 2026-10-01: cirrus comes in patches and bands with clear sky between, and its streaks curve with the jet's
	// eddies — the broad field gates the coverage (the same mean over the sky) and a slow warp bends the streak frame
	// (round 71's sheet was one comb of parallel streaks from horizon to horizon)
	vec4 cw = textureLod( tWeather, pc.xz / ${f(CLOUD_CIRRUS_TILE_M * 1.5)} + vec2( 0.71, 0.19 ), 0.0 );
	float patchC = 0.35 + 1.3 * cw.b;
	q += ( textureLod( tWeather, pc.xz / ${f(CLOUD_CIRRUS_TILE_M * 2.2)} + vec2( 0.13, 0.57 ), 0.0 ).gb - 0.5 ) * ${f(CIRRUS_WARP_M)};
	if ( uCirrus > 0.0 ) {
		vec2 across = vec2( -uCirrusDir.y, uCirrusDir.x );
		vec2 gradX = vec2( dot( gx, uCirrusDir ), dot( gx, across ) );
		vec2 gradY = vec2( dot( gy, uCirrusDir ), dot( gy, across ) );
		vec4 c1 = textureGrad( tStreets, ( q + uCirrusShift ) / ${f(CLOUD_CIRRUS_TILE_M)}, gradX, gradY );
		// the second octave keeps the streak axis (both axes scaled alike: unequal scales rotate the streaks
		// into a lattice of crossing lines)
		vec4 c2 = textureGrad( tStreets, ( q * 1.6 + uCirrusShift * 1.7 + vec2( 3100.0, 900.0 ) ) / ${f(CLOUD_CIRRUS_TILE_M)}, gradX * 1.6, gradY * 1.6 );
		// (2026-10-07, the gauntlet's wave 198 on Desert: "soft, blurred streaks that look like smeared paint"): a third,
		// finer octave on the same axis and a sharper edge — fibres and hooks of ice, not a soft smear
		vec4 c3 = textureGrad( tStreets, ( q * 3.1 + uCirrusShift * 2.9 + vec2( 1700.0, 5300.0 ) ) / ${f(CLOUD_CIRRUS_TILE_M)}, gradX * 3.1, gradY * 3.1 );
		float streak = c1.b * 0.6 + c2.b * 0.25 + c3.b * 0.15;
		float cEff = clamp( uCirrus * patchC, 0.0, 0.98 );
		float covC = smoothstep( 1.0 - cEff, 1.0 - cEff + 0.38, streak );
		// the fibres carve the sheet into strands (a fibrous sheet, not a comb of parallel lines)
		float fibres = mix( 0.5, 1.0, c3.a ) * mix( 0.7, 1.0, c2.a ) * mix( 0.85, 1.0, c1.a );
		tauC = covC * fibres * uCirrusDensity / max( dir.y, 0.1 );
	}
	if ( uContrails > 0.0 ) tauC += contrailDepth( pc.xz, max( length( gx ), length( gy ) ) * ${f(CLOUD_CIRRUS_TILE_M)} ) / max( dir.y, 0.1 );
	if ( tauC <= 0.0 ) return none;
	float TC = exp( -tauC );
	float ang = acos( clamp( cosT, -1.0, 1.0 ) );
	// ice: a strong forward lobe with the 22° halo of hexagonal crystals (a soft ring — the haze around the sun)
	// (2026-10-01: a square, not pow() — GLSL leaves pow undefined for a negative base, inside the ring)
	float hx = ( ang - 0.384 ) / 0.07;
	float halo = exp( -hx * hx ) * 0.10;
	float phC = phaseHG( cosT, 0.7 ) * 0.65 + phaseHG( cosT, -0.25 ) * 0.35 + halo;
	vec3 SC = ( uSunRadiance * phC * 1.2 * uSunGain + uAmbientTop * 0.6 * uAmbientScale ) * uTint;
	// aerial: the slant through the boundary-layer haze — a cirrus overhead stays clear, one at the horizon melts
	float distC = tc * clamp( ${f(CLOUD_AERIAL.cirrusHazeScaleM)} / max( uCirrusAlt - uCamPos.y, 100.0 ), 0.0, 1.0 );
	return vec4( cloudHaze( SC * ( 1.0 - TC ), 1.0 - TC, distC, dir, 1.0 ), TC );
}
`;

const COPY_FRAGMENT = /* glsl */`
precision highp float;
uniform sampler2D tHistory;
varying vec2 vUv;
void main() {
	vec4 h = texture2D( tHistory, vUv );
	gl_FragColor = vec4( clamp( h.rgb, 0.0, 1.0 ), clamp( h.a, 0.0, 1.0 ) );
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
// 2026-10-01: lightning in a night storm — the flash's direction from the camera and its strength (0 = none); drawn
// here at the full frame rate (the history refreshes a sixteenth of its texels a frame and would smear a flash)
uniform vec4 uFlash;
uniform vec3 uFlashTint;
// 2026-10-03 (the skies lane): toward the sun from the camera — a thin cloud in front of the sun keeps its forward-
// scattered light above the knee (the dome exempts the sun's spot from its knee and adds the glow after it, so a kneed
// cloud read as a dark eye around the sun on Nordhavn and the polders)
uniform vec3 uSunDir;
// 2026-10-01: 1 while the camera stands inside or over the slab (a bird's view over a low deck): the cloud between it and
// the ground is in front of everything, so the composite covers the frame below the horizon too (the trace marches the
// downward rays to the slab's floor) instead of leaving the terrain unclouded under the camera
uniform float uInside;
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
	// nothing below the horizon line (the history holds no cloud there either) — unless the camera is in the slab
	float above = max( smoothstep( -0.05, -0.02, dir.y ), uInside );
	// the knee eases off within a few degrees of the sun: the silver lining of a cloud in front of it outshines the glow
	float sunNear = pow( max( dot( dir, uSunDir ), 0.0 ), 400.0 );
	vec3 rgb = mix( cloudKnee( c.rgb ), min( c.rgb, vec3( 6.0 ) ), sunNear ) * uSkyIntensity * above;
	float alpha = ( 1.0 - min( c.a, 1.0 ) ) * above;
	if ( uFlash.w > 0.0 ) {
		// the cloud mass around the strike lit from inside: a broad glow and a bright core, only where there is cloud
		float k = max( dot( dir, uFlash.xyz ), 0.0 );
		rgb += uFlashTint * ( uFlash.w * ( pow( k, 30.0 ) * 0.7 + pow( k, 600.0 ) * 1.6 ) * alpha );
	}
	gl_FragColor = vec4( rgb, alpha );
}`;

/** The worker's bakes (blue noise, the round-71 weather fields, the local weather). */
interface CloudNoiseTextures {
  weather: THREE.DataTexture | null;
  streets: THREE.DataTexture | null;
  blue: THREE.DataTexture | null;
  local: THREE.DataTexture | null;
}

/** The bake buffers as the worker posts them (or the synchronous fallback bakes them). */
export type CloudNoiseUpload = Partial<Record<CloudNoiseKind, Uint8Array>>;

/** QA: one readback of the history (bottom-up rows, RGBA8: the radiance clamped, alpha = transmittance). */
interface CloudHistoryReadback {
  width: number;
  height: number;
  rgba: Uint8Array;
}

/** The sun's mean share over the battlefield (the skies lane's light-model hook, refreshed about twice a second). */
export interface CloudSunMean {
  /** the beam's mean transmittance as the lit materials take it (the deck's pattern and the core's cap applied) */
  mean: number;
  /** the columns' own mean transmittance, e^−τ (no pattern switch, no core cap): the deck itself */
  raw: number;
  /** the share of the square's texels passing under half the beam (as the lit materials take it) */
  cover: number;
}
/** The playable square the sun mean reads (m, centred on the origin) and its readback's texels and cadence (frames). */
export const CLOUD_SUN_MEAN_SPAN_M = 3000;
const CLOUD_SUN_MEAN_TEXELS = 32;
const CLOUD_SUN_MEAN_EVERY = 30;

function makeTarget(width: number, height: number, name: string, type: THREE.TextureDataType = THREE.HalfFloatType): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
    type, format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
  });
  rt.texture.name = name;
  return rt;
}

function makeWeather(bytes: Uint8Array, size: number, name: string, filter: THREE.MagnificationTextureFilter = THREE.LinearFilter): THREE.DataTexture {
  const tex = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = filter === THREE.LinearFilter ? THREE.LinearMipmapLinearFilter : filter;
  tex.magFilter = filter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = filter === THREE.LinearFilter;
  tex.name = name;
  tex.needsUpdate = true;
  return tex;
}

/** The medium's uniforms (cloudShaders.ts CLOUD2_MEDIUM_GLSL), one set shared by reference by the trace and the map. */
function createMediumUniforms(): Record<string, THREE.IUniform> {
  return {
    uLayerBase: { value: new THREE.Vector4(1e6, 1e6, 1e6, 1e6) }, uLayerTop: { value: new THREE.Vector4(1e6 + 1, 1e6 + 1, 1e6 + 1, 1e6 + 1) },
    uLayerCover: { value: new THREE.Vector4() }, uLayerDensity: { value: new THREE.Vector4() },
    uLayerShape: { value: new THREE.Vector4(1, 1, 1, 1) }, uLayerDetail: { value: new THREE.Vector4(1, 1, 1, 1) },
    uLayerBias: { value: new THREE.Vector4(1, 1, 1, 1) }, uLayerFilter: { value: new THREE.Vector4(0.5, 0.5, 0.5, 0.5) },
    uLayerExp: { value: new THREE.Vector4(1, 1, 1, 1) }, uLayerStreets: { value: new THREE.Vector4() }, uLayerEnvelope: { value: new THREE.Vector4() }, uCellStretch: { value: 1 },
    uLayerCells: { value: new THREE.Vector4() }, uLayerWisp: { value: new THREE.Vector4() },
    uLayerFlat: { value: new THREE.Vector4() }, uLayerHang: { value: new THREE.Vector4() }, uLayerAnvil: { value: new THREE.Vector4() },
    uLayerCore: { value: new THREE.Vector4(0.6, 0.6, 0.6, 0.6) }, uLayerLumps: { value: new THREE.Vector4() },
    uProfA: { value: new THREE.Vector4() }, uProfB: { value: new THREE.Vector4() }, uProfC: { value: new THREE.Vector4() },
    uProfD: { value: new THREE.Vector4(1, 1, 1, 1) }, uLayerChannels: { value: new THREE.Matrix4().set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0) },
    uHeightRange: { value: new THREE.Vector2(1e6, 1e6 + 1) },
    tLocal: { value: null }, tStreetField: { value: null }, tShape: { value: null }, tDetail: { value: null }, tTurb: { value: null },
    uLocalShift: { value: new THREE.Vector2() }, uStreetShift2: { value: new THREE.Vector2() }, uWindDir2: { value: new THREE.Vector2(1, 0) },
    uShapeShift: { value: new THREE.Vector3() }, uDetailShift: { value: new THREE.Vector3() }, uClear2: { value: new THREE.Vector3() },
    uTurbulence: { value: 0 }, uFragMin: { value: 0 }, uWeatherWarp: { value: 0 }, uCellPeriod: { value: 96000 }, uShapePeriod: { value: 3200 },
  };
}

/**
 * The layer. Created by the sky rig on the desktop tier when the atmosphere runs; `setPreset` per map (null
 * keeps the baked decks), `setNoise` when the worker's bakes arrive, `beforeSceneRender` from post.ts every
 * frame (it refreshes the Beer shadow map a band at a time and the cloud shade the lit materials read).
 */
export class VolumetricCloudLayer {
  readonly dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly atmosphere: AtmospherePublishedState;
  private readonly quad: FullScreenQuad;
  private readonly medium: Record<string, THREE.IUniform>;
  private traceMaterial: THREE.ShaderMaterial;
  private traceTier = '';
  private readonly resolveMaterial: THREE.ShaderMaterial;
  private readonly domeMaterial: THREE.ShaderMaterial;
  private readonly bsmMaterial: THREE.ShaderMaterial;
  private readonly shadeMaterial: THREE.ShaderMaterial;
  /** The Beer shadow map's cascades (toroidal, world-anchored) and their band schedules. */
  private readonly bsm = CLOUD_BSM_CASCADES.map(() => ({ target: null as THREE.WebGLRenderTarget | null, band: 0, valid: false }));
  private readonly bsmKey = [NaN, NaN, NaN, NaN, NaN];
  /** The stack's own slice count for the Beer shadow map (cloudLayers.ts cloudBsmSlices); the low tier takes 0.6 of it. */
  private bsmSlices = CLOUD_BSM_SLICES;
  /** The main lane's vertical optical depth (cloudDeckTau): the cover the ground's light passes. */
  private deckTau = 0;
  /** The packed streets' share per lane (the cost lab's CLOUD_STREETS scales it a frame). */
  private readonly streetsBase = new THREE.Vector4();
  /** The stack's weather warp (m): the cost lab's CLOUD_WARP scales it a frame. */
  private warpM = 0;
  /** How far the main lane is a closing deck (CloudStack.closing): the share of the ground's light law it takes. */
  private deckClosing = 0;
  /** The band a cascade refreshes (reused: no allocation per frame). */
  private readonly bsmBandRect = new THREE.Vector4();
  private farShadeTarget: THREE.WebGLRenderTarget | null = null;
  private farShadeValid = false;
  private readonly farShadeInfo = { texture: null as THREE.Texture | null, rect: new THREE.Vector3(), baseM: 1400 };
  private sunMeanTarget: THREE.WebGLRenderTarget | null = null;
  private sunMeanPixels: Uint8Array | null = null;
  private sunMeanPending = false;
  private sunMeanAge = Infinity;
  /** The sun's mean share over the playable square (published on scene.userData.cloudSunMean). */
  readonly sunMean: CloudSunMean = { mean: 1, raw: 1, cover: 0 };
  private copyMaterial: THREE.ShaderMaterial | null = null;
  private copyTarget: THREE.WebGLRenderTarget | null = null;
  private history: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private trace: THREE.WebGLRenderTarget;
  private historyIndex = 0;
  private historyValid = false;
  private targetWidth = 0;
  private targetHeight = 0;
  private readonly noise: CloudNoiseTextures = { weather: null, streets: null, blue: null, local: null };
  private volumes: CloudVolumeTextures | null = null;
  private preset: CloudLayerPreset | null = null;
  private presetKey = '';
  private readonly weatherShift = new THREE.Vector2();
  private readonly noiseShift = new THREE.Vector3();
  private readonly cirrusShift = new THREE.Vector2();
  private readonly upperDrift = new THREE.Vector2();
  private hazeDatum = Number.NaN;
  private flashSeed = 0x2f6b4a1d;
  private flashClock = 0;
  private flashNext = 3;
  private flashAge = 1e3;
  private flashStrokes = 0;
  private flashPeak = 0;
  private readonly windDir = new THREE.Vector2(1, 0);
  private frame = 0;
  private traces = 0;
  private rebuild = 16;
  private since = 0;
  private readonly prevCam = { pos: new THREE.Vector3(), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(0, 0, -1), tan: new THREE.Vector2(1, 1) };
  private readonly cam = { pos: new THREE.Vector3(), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(0, 0, -1), tan: new THREE.Vector2(1, 1) };
  private hasPrev = false;
  private sceneDepthReady = false;
  private readonly hazeTerms = { x: 0, y: 1 };
  private readonly depthPlanes = new THREE.Vector2(0.5, 4000);
  private lastSceneDepth: THREE.Texture | null = null;
  private context: ReturnType<THREE.WebGLRenderer['getContext']> | null = null;
  private rendererInfo: THREE.WebGLRenderer['info'] | null = null;
  private readonly scratch = new THREE.Vector3();
  private readonly irr = new THREE.Color();
  private readonly hz = new THREE.Color();
  /** Frames rendered with the layer showing (probes). */
  framesShown = 0;
  /** Camera cuts detected (probes). */
  cuts = 0;
  /** QA: hold the trace and resolve (the composite keeps showing the last history). */
  frozen = false;
  /** QA: bracket each frame's trace and resolve with a GPU timer query (EXT_disjoint_timer_query_webgl2). */
  gpuTiming = false;
  /** QA: the last completed timer's result (ms), −1 until one lands. */
  lastTraceGpuMs = -1;
  /** QA: trace and resolve the frame's slot this many times (a repeat benchmark amortises the frame's noise). */
  benchRepeat = 1;
  /** QA: 4 = flat white radiance (the medium's structure alone); the history re-keys on a change. */
  debugMode = 0;
  /** QA: hold a lightning strike at this strength in a night storm (0 = the natural sequence). */
  qaFlash = 0;
  private timerExt: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null | undefined;
  private timerQuery: WebGLQuery | null = null;
  private timerOpen = false;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, atmosphere: AtmospherePublishedState, knee: THREE.Vector3) {
    this.renderer = renderer;
    this.scene = scene;
    this.atmosphere = atmosphere;
    this.history = [makeTarget(4, 4, 'clouds-history-a'), makeTarget(4, 4, 'clouds-history-b')];
    this.trace = this.makeTraceTarget(1, 1);
    this.medium = createMediumUniforms();
    this.traceMaterial = this.makeTraceMaterial('high', knee);
    this.traceTier = 'high';
    const camera = () => ({
      uCamPos: { value: new THREE.Vector3() }, uCamRight: { value: new THREE.Vector3(1, 0, 0) }, uCamUp: { value: new THREE.Vector3(0, 1, 0) },
      uCamFwd: { value: new THREE.Vector3(0, 0, -1) }, uCamTan: { value: new THREE.Vector2(1, 1) },
      uHistorySize: { value: new THREE.Vector2(4, 4) }, uTraceSize: { value: new THREE.Vector2(1, 1) },
    });
    this.resolveMaterial = new THREE.ShaderMaterial({
      name: 'VolumetricCloudResolve', vertexShader: QUAD_VERTEX, fragmentShader: CLOUD2_RESOLVE_FRAGMENT, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      uniforms: {
        ...camera(),
        tTrace: { value: null }, tTraceDepth: { value: null }, tHistory: { value: null }, uSlot: { value: new THREE.Vector2() },
        uPrevCamPos: { value: new THREE.Vector3() }, uPrevRight: { value: new THREE.Vector3(1, 0, 0) }, uPrevUp: { value: new THREE.Vector3(0, 1, 0) },
        uPrevFwd: { value: new THREE.Vector3(0, 0, -1) }, uPrevTan: { value: new THREE.Vector2(1, 1) },
        uHistoryValid: { value: 0 }, uRebuildK: { value: -1 }, uMinAlpha: { value: 0.12 }, uVarianceGamma: { value: 1.5 },
      },
    });
    this.bsmMaterial = new THREE.ShaderMaterial({
      name: 'VolumetricCloudBeerShadow', glslVersion: THREE.GLSL3, vertexShader: QUAD_VERTEX, fragmentShader: CLOUD2_BSM_FRAGMENT,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      uniforms: {
        ...this.medium,
        uBsmSunDir: { value: new THREE.Vector3(0, 1, 0) }, uWinCell: { value: new THREE.Vector2() }, uTexels: { value: CLOUD_BSM_CASCADES[0].texels },
        uTexelM: { value: CLOUD_BSM_CASCADES[0].span / CLOUD_BSM_CASCADES[0].texels }, uPlane: { value: new THREE.Vector2() }, uSlices: { value: CLOUD_BSM_SLICES },
        uLod: { value: 0 },
      },
    });
    const bsmLookup = () => ({
      tBsm0: { value: null }, tBsm1: { value: null }, uBsmWindow0: { value: new THREE.Vector4() }, uBsmWindow1: { value: new THREE.Vector4() },
      uBsmPlane: { value: new THREE.Vector2() }, uBsmSun: { value: new THREE.Vector3(0, 1, 0) }, uBsmFarBilinear: { value: 0 },
    });
    const lookup = bsmLookup();
    // the trace and the shade read the same lookup uniforms (by reference)
    Object.assign(this.traceMaterial.uniforms, lookup);
    this.shadeMaterial = new THREE.ShaderMaterial({
      name: 'VolumetricCloudShade', glslVersion: THREE.GLSL3, vertexShader: QUAD_VERTEX, fragmentShader: CLOUD2_SHADE_FRAGMENT,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      uniforms: { ...lookup, uShadeRect: { value: new THREE.Vector3(0, 0, CLOUD_FAR_SHADE_SPAN_M) }, uShadeLaw: { value: new THREE.Vector3(CLOUD_SHADOW_CORE, CLOUD_SHADOW_TAU, 1) } },
    });
    this.quad = new FullScreenQuad(this.traceMaterial);
    this.domeMaterial = new THREE.ShaderMaterial({
      name: 'VolumetricCloudDome', vertexShader: DOME_VERTEX, fragmentShader: DOME_FRAGMENT,
      uniforms: {
        tClouds: { value: this.history[0].texture }, uTargetSize: { value: new THREE.Vector2(1, 1) }, uHistorySize: { value: new THREE.Vector2(4, 4) },
        uKnee: { value: knee }, uSkyIntensity: { value: 1 },
        uFlash: { value: new THREE.Vector4() }, uFlashTint: { value: new THREE.Vector3(0.78, 0.84, 1.0) }, uInside: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      },
      transparent: true, depthWrite: false, depthTest: true, side: THREE.BackSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    // the same shell as the baked cumulus deck: horizon-grazing rays from any battle camera hit it, the terrain and the
    // ring occlude the rest; AO's prepass ignores it like the decks (the whole sphere: a camera over a low deck sees the
    // cloud below the horizon too)
    const geometry = new THREE.SphereGeometry(CLOUD_DOME_RADIUS_M, 48, 32, 0, Math.PI * 2, 0, Math.PI);
    this.dome = new THREE.Mesh(geometry, this.domeMaterial);
    this.dome.name = 'cloudLayerVolumetric';
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -2;
    this.dome.visible = false;
    this.dome.userData.aoExclude = true;
    scene.add(this.dome);
  }

  /** The trace target: the colour and the transmittance-weighted depth (km) in two attachments. */
  private makeTraceTarget(width: number, height: number): THREE.WebGLRenderTarget {
    const rt = new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, count: 2,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
    });
    rt.textures[0].name = 'clouds-trace';
    rt.textures[1].name = 'clouds-trace-depth';
    rt.textures[1].minFilter = THREE.NearestFilter;
    rt.textures[1].magFilter = THREE.NearestFilter;
    return rt;
  }

  /** The trace program for a quality tier (its loop bounds and octaves are compile-time). */
  private makeTraceMaterial(tier: string, knee: THREE.Vector3): THREE.ShaderMaterial {
    const defs = CLOUD_TIERS[tier] ?? CLOUD_TIERS.high;
    const weather = CLOUD_SKY_WEATHER_GLSL;
    return new THREE.ShaderMaterial({
      name: `VolumetricCloudTrace-${tier}`, glslVersion: THREE.GLSL3, vertexShader: QUAD_VERTEX,
      fragmentShader: cloud2TraceFragment(defs, ATMOSPHERE_SKY_GLSL, weather),
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      uniforms: {
        ...this.medium,
        uCamPos: { value: new THREE.Vector3() }, uCamRight: { value: new THREE.Vector3(1, 0, 0) }, uCamUp: { value: new THREE.Vector3(0, 1, 0) },
        uCamFwd: { value: new THREE.Vector3(0, 0, -1) }, uCamTan: { value: new THREE.Vector2(1, 1) },
        uHistorySize: { value: new THREE.Vector2(4, 4) }, uTraceSize: { value: new THREE.Vector2(1, 1) },
        tAtmoSky: { value: null }, uAtmoSun: { value: new THREE.Vector3(0, 1, 0) }, uAtmoViewH: { value: ATMO_GROUND_KM + 0.05 },
        uAtmoKnee: { value: knee }, uAtmoIntensity: { value: 1 }, tAtmoTransmittance: { value: null },
        tBlue: { value: null }, uSlot: { value: new THREE.Vector2() }, uSubPixel: { value: new THREE.Vector2() }, uFrameNoise: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunIrradianceTop: { value: new THREE.Vector3(8, 8, 8) },
        uSkyIrradiance: { value: new THREE.Vector3(0.3, 0.4, 0.6) }, uGroundRadiance: { value: new THREE.Vector3(0.05, 0.05, 0.05) },
        uTint: { value: new THREE.Vector3(1, 1, 1) }, uSunGain: { value: 1 }, uAmbientScale: { value: 1 },
        uPhase: { value: new THREE.Vector4(0.7, -0.2, 0.5, 0.8) }, uPowderExp: { value: 150 }, uLayerDiffuse: { value: new THREE.Vector4() },
        uMarchMax: { value: defs.marchMax }, uStepMin: { value: defs.stepMin }, uStepGrowth: { value: defs.growth },
        uDetailRange: { value: defs.detailRange }, uPixelAngle: { value: 0.002 },
        uHazeDatum: { value: 0 }, uOvercastHaze: { value: new THREE.Vector4(0, 1, 0, 0) }, uOvercastTint: { value: new THREE.Vector3(1, 1, 1) },
        uOpaqueCut: { value: 1 }, uLightBudget: { value: new THREE.Vector4(defs.lightEvery, 0.15, defs.sunSteps, defs.exitT) },
        uStepCap: { value: defs.steps }, uFine: { value: new THREE.Vector2(defs.fineN, defs.fineStride) }, uDeckLobe: { value: CLOUD_DECK_SUN_LOBE }, uDeckTune: { value: new THREE.Vector3(1, 1, CLOUD_DECK_GROUND_RETURN) }, uDebug: { value: 0 },
        tSceneDepth: { value: null }, uSceneDepthOn: { value: 0 }, uSceneNearFar: { value: new THREE.Vector2(0.5, 4000) },
        uDepthRight: { value: new THREE.Vector3(1, 0, 0) }, uDepthUp: { value: new THREE.Vector3(0, 1, 0) },
        uDepthFwd: { value: new THREE.Vector3(0, 0, -1) }, uDepthTan: { value: new THREE.Vector2(1, 1) }, uDomeRadius: { value: CLOUD_DOME_RADIUS_M },
        // the sky beyond the medium (round 71's fields and the weather layers)
        tWeather: { value: null }, tStreets: { value: null }, uWeatherShift: { value: new THREE.Vector2() }, uStreetShift: { value: new THREE.Vector2() },
        uWindDir: { value: new THREE.Vector2(1, 0) }, uSunRadiance: { value: new THREE.Vector3(8, 8, 8) },
        uAmbientTop: { value: new THREE.Vector3(0.3, 0.4, 0.6) }, uAmbientBottom: { value: new THREE.Vector3(0.2, 0.25, 0.3) }, uBase: { value: 1400 },
        uCirrus: { value: 0 }, uCirrusDir: { value: new THREE.Vector2(1, 0) }, uCirrusAlt: { value: 10000 }, uCirrusShift: { value: new THREE.Vector2() },
        uCirrusDensity: { value: 0.35 },
        ...createCloudWeatherUniforms(),
      },
    });
  }

  /** Whether the layer draws: a preset, every noise texture and a running atmosphere. */
  get active(): boolean {
    return !!this.preset && this.noiseReady && this.atmosphere.active;
  }

  get noiseReady(): boolean {
    const n = this.noise;
    return !!n.weather && !!n.streets && !!n.blue && !!n.local;
  }

  /** The current preset (null = the baked decks show). */
  get currentPreset(): CloudLayerPreset | null { return this.preset; }

  /**
   * The resolved cloud history the dome composites, in screen uv — alpha is the clouds' transmittance along each view
   * ray — while the layer draws; null otherwise. The lens flare and the sun shafts read it to fade behind cloud.
   */
  get historyTexture(): THREE.Texture | null {
    return this.active && this.dome.visible && this.historyValid ? this.domeMaterial.uniforms.tClouds.value as THREE.Texture : null;
  }

  setPreset(preset: CloudLayerPreset | null): void {
    const key = preset ? cloudLayerKey(preset) : '';
    if (key !== this.presetKey) {
      this.presetKey = key;
      this.resetHistory();
      for (const c of this.bsm) c.valid = false;
      if (preset) {
        applyCloudWeatherPreset(this.traceMaterial.uniforms, preset);
        const stack = cloudStackOf(preset);
        packCloudStack(stack, this.medium);
        const diffuse = this.traceMaterial.uniforms.uLayerDiffuse.value as THREE.Vector4;
        diffuse.set(stack.lanes[0]?.diffuse ?? 0, stack.lanes[1]?.diffuse ?? 0, stack.lanes[2]?.diffuse ?? 0, stack.lanes[3]?.diffuse ?? 0);
        this.bsmSlices = cloudBsmSlices(stack);
        this.deckTau = cloudDeckTau(stack);
        this.streetsBase.copy(this.medium.uLayerStreets.value as THREE.Vector4);
        this.warpM = stack.weatherWarpM;
        this.deckClosing = stack.closing;
        // QA: the turbulence's displacement scaled (0 draws the medium without it)
        this.medium.uTurbulence.value = stack.turbulenceM * lightTune('CLOUD_TURBULENCE', 1);
        // QA: a convective lane's extinction, footprint ramp, core and cover scaled (the decks keep theirs)
        const cuKnobs: Array<[string, string]> = [['CLOUD_CU_DENSITY', 'uLayerDensity'], ['CLOUD_CU_FILTER', 'uLayerFilter'], ['CLOUD_CU_CORE', 'uLayerCore'], ['CLOUD_CU_COVER', 'uLayerCover'], ['CLOUD_CU_SHAPE', 'uLayerShape'], ['CLOUD_CU_DETAIL', 'uLayerDetail']];
        this.medium.uShapePeriod.value = stack.shapePeriodM * lightTune('CLOUD_SHAPE_PERIOD', 1);
        for (const [knob, key] of cuKnobs) {
          const k = lightTune(knob, 1);
          if (k === 1) continue;
          const v = this.medium[key].value as THREE.Vector4;
          stack.lanes.forEach((lane, i) => { if (lane.flat < 0.5) v.setComponent(i, v.getComponent(i) * k); });
        }
        // QA (the cost lab): CLOUD_ALOFT 0 draws the main lane alone (the lanes aloft without density)
        if (lightTune('CLOUD_ALOFT', 1) === 0) {
          const v = this.medium.uLayerDensity.value as THREE.Vector4;
          for (let i = 1; i < 4; i++) v.setComponent(i, 0);
        }
      }
    }
    this.preset = preset;
  }

  /** Upload whichever bakes arrived (each once). */
  setNoise(upload: CloudNoiseUpload): void {
    const n = this.noise;
    if (upload.weather && !n.weather) n.weather = makeWeather(upload.weather, CLOUD_WEATHER_SIZE, 'clouds-weather');
    if (upload.streets && !n.streets) n.streets = makeWeather(upload.streets, CLOUD_WEATHER_SIZE, 'clouds-streets');
    if (upload.blue && !n.blue) n.blue = makeWeather(upload.blue, CLOUD_BLUE_SIZE, 'clouds-blue', THREE.NearestFilter);
    if (upload.local && !n.local) n.local = makeWeather(upload.local, CLOUD_LOCAL_SIZE, 'clouds-local');
    this.bindNoise();
  }

  private bindNoise(): void {
    const n = this.noise, t = this.traceMaterial.uniforms;
    t.tWeather.value = n.weather;
    t.tStreets.value = n.streets;
    t.tBlue.value = n.blue;
    this.medium.tLocal.value = n.local;
    this.medium.tStreetField.value = n.streets;
    const v = this.volumes;
    this.medium.tShape.value = v?.shape ?? null;
    this.medium.tDetail.value = v?.detail ?? null;
    this.medium.tTurb.value = v?.turbulence ?? null;
  }

  /** Bake the noise volumes on the GPU (once; the first warm or the first active frame). */
  private ensureVolumes(): boolean {
    if (this.volumes) return true;
    try {
      this.volumes = bakeCloudVolumes(this.renderer);
    } catch (error) {
      console.warn('[clouds] the noise volumes could not be baked', error);
      return false;
    }
    this.bindNoise();
    return true;
  }

  /** Forget the history: the next frames rebuild it at four slots a frame. */
  resetHistory(): void {
    this.rebuild = 0;
    this.since = 0;
    this.historyValid = false;
  }

  /** Whether the clouds cast shadows this frame (the shade map the lit materials read; the ring's horizon shade follows it). */
  get shadowsActive(): boolean {
    return this.active && (this.preset?.shadowPattern ?? 0) > 0 && (this.preset?.coverage ?? 0) > 0;
  }

  private refreshLifetime(): void {
    const context = this.renderer.getContext();
    if (context !== this.context || this.renderer.info !== this.rendererInfo) {
      this.context = context;
      this.rendererInfo = this.renderer.info;
      this.resetHistory();
      for (const c of this.bsm) c.valid = false;
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

  private renderQuad(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget, band?: THREE.Vector4): void {
    const renderer = this.renderer;
    const prevTarget = renderer.getRenderTarget();
    const prevFace = renderer.getActiveCubeFace(), prevMip = renderer.getActiveMipmapLevel();
    const prevXr = renderer.xr.enabled, prevToneMapping = renderer.toneMapping, prevAutoClear = renderer.autoClear;
    try {
      renderer.xr.enabled = false;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.autoClear = false;
      if (band) {
        target.viewport.copy(band);
        target.scissor.copy(band);
        target.scissorTest = true;
      }
      renderer.setRenderTarget(target);
      this.quad.material = material;
      this.quad.render(renderer);
    } finally {
      if (band) {
        target.viewport.set(0, 0, target.width, target.height);
        target.scissor.set(0, 0, target.width, target.height);
        target.scissorTest = false;
      }
      renderer.xr.enabled = prevXr;
      renderer.toneMapping = prevToneMapping;
      renderer.autoClear = prevAutoClear;
      renderer.setRenderTarget(prevTarget, prevFace, prevMip);
    }
  }

  /** The quality tier's trace program (rebuilt only when the tier changes). */
  private syncTier(): void {
    // (2026-10-07, the cost rule's CPU: the preset is resolved once — it reads the stored choice — and every 15 frames; a
    // settings change takes a quarter of a second)
    if (this.frame % 15 !== 0 && this.traceTier) return;
    const name = resolvePresetName();
    const tier = CLOUD_TIERS[name] ? name : 'high';
    if (tier === this.traceTier) return;
    const old = this.traceMaterial;
    const next = this.makeTraceMaterial(tier, old.uniforms.uAtmoKnee.value as THREE.Vector3);
    // carry every uniform object over (the medium's and the lookup's are shared by reference)
    for (const key of Object.keys(old.uniforms)) {
      if (key === 'uMarchMax' || key === 'uStepMin' || key === 'uStepGrowth' || key === 'uDetailRange') continue;
      next.uniforms[key] = old.uniforms[key];
    }
    this.traceMaterial = next;
    this.traceTier = tier;
    old.dispose();
    this.resetHistory();
  }

  private applyPresetUniforms(preset: CloudLayerPreset): void {
    const t = this.traceMaterial.uniforms;
    (t.uTint.value as THREE.Vector3).set(preset.tint[0], preset.tint[1], preset.tint[2]);
    t.uSunGain.value = preset.sunGain;
    t.uAmbientScale.value = preset.ambientScale;
    t.uBase.value = preset.baseM;
    // (2026-10-07, wave 198 on Desert: the upper sky's streaks read as smeared paint; at round five's trace — 0.7 of its
    // cover, 0.6 of its depth — wave 221 still read "airbrushed smears": the cirrus is dropped (its pass skipped, the
    // contrails keep theirs); QA: CLOUD_CIRRUS_COVER, CLOUD_CIRRUS_DEPTH bring it back)
    t.uCirrus.value = preset.cirrus * lightTune('CLOUD_CIRRUS_COVER', 0);
    (t.uCirrusDir.value as THREE.Vector2).set(Math.cos(preset.cirrusAngleRad), Math.sin(preset.cirrusAngleRad));
    t.uCirrusAlt.value = preset.cirrusAltM;
    t.uCirrusDensity.value = preset.cirrusDensity * lightTune('CLOUD_CIRRUS_DEPTH', 0.6);
    (t.uWindDir.value as THREE.Vector2).copy(this.windDir);
    (this.medium.uWindDir2.value as THREE.Vector2).copy(this.windDir);
  }

  private applyAtmosphereUniforms(): void {
    const a = this.atmosphere;
    const t = this.traceMaterial.uniforms;
    t.tAtmoSky.value = a.skyView;
    t.tAtmoTransmittance.value = a.transmittanceLut ?? null;
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
    const key = this.preset?.keyTint;
    const top = t.uSunIrradianceTop.value as THREE.Vector3;
    top.setScalar(illuminance);
    if (!a.transmittanceLut && sunT) top.set(sunT.r, sunT.g, sunT.b).multiplyScalar(illuminance);
    // 2026-10-07 (the gauntlet's wave 200: "beige low-sun clouds over neutrally lit snow"): the clouds take the scene's own
    // sun — the light model's colour (the ground's transmittance tint, greyed by the overcast) — and keep only the air
    // between the ground and the cloud from the LUT (the trace's T(h) over T(ground)): equal at the ground, a little less
    // reddened aloft, warm or grey with the scene both ways. Without a grounded model, the preset's key tint as before.
    const sceneSun = (this.scene.userData.lightModel as { mode?: string; sunColor?: readonly number[] } | undefined);
    const lum = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sunUpNow = a.sunDir.y / Math.max(1e-6, a.sunDir.length());
    if (sceneSun?.mode === 'physical' && sceneSun.sunColor && sunT && sunUpNow > 0.02 && lum(sunT.r, sunT.g, sunT.b) > 1e-3) {
      const sc = sceneSun.sunColor;
      const ls = Math.max(1e-6, lum(sc[0], sc[1], sc[2])), lt = lum(sunT.r, sunT.g, sunT.b);
      const corr = this.scratch.set((sc[0] / ls) / Math.max(1e-4, sunT.r / lt), (sc[1] / ls) / Math.max(1e-4, sunT.g / lt), (sc[2] / ls) / Math.max(1e-4, sunT.b / lt));
      (t.uSunRadiance.value as THREE.Vector3).multiply(corr);
      top.multiply(corr);
    } else if (key) {
      (t.uSunRadiance.value as THREE.Vector3).multiply(this.scratch.set(key[0], key[1], key[2]));
      top.multiply(this.scratch.set(key[0], key[1], key[2]));
    }
    // the summary is read with the preset's sky intensity applied and the composite multiplies the clouds by it once
    // more: undo it here so the sky's light is dimmed once (2026-10-01: the night's black occluders)
    const undim = 1 / Math.max(1e-3, a.skyIntensity);
    const irrSrc = summary?.irradiance ?? a.irradiance;
    const irr = this.irr.setRGB(irrSrc.r * undim, irrSrc.g * undim, irrSrc.b * undim);
    (t.uAmbientTop.value as THREE.Vector3).set(irr.r, irr.g, irr.b).multiplyScalar(0.55);
    (t.uSkyIrradiance.value as THREE.Vector3).set(irr.r, irr.g, irr.b);
    const hzSrc = summary?.horizon ?? irrSrc;
    const hz = this.hz.setRGB(hzSrc.r * undim, hzSrc.g * undim, hzSrc.b * undim);
    const stratiform = this.preset?.stratiform ?? 0;
    (t.uAmbientBottom.value as THREE.Vector3).set(irr.r, irr.g, irr.b).multiplyScalar(0.22)
      .addScaledVector(this.scratch.set(hz.r, hz.g, hz.b), 0.08)
      .lerp(this.scratch.set(irr.r, irr.g, irr.b).multiplyScalar(0.42), stratiform);
    // the ground under the clouds as the bases see it: its albedo under the light that reaches it. 2026-10-07 (overcast with
    // structure): under a closing deck the sun and the sky alike come down through it — the diffuse share of the main
    // lane's column, raised by the light the ground and the deck's base pass back and forth (cloudGroundLight) — where
    // the old law let the open sky's blue irradiance through a closed deck untouched (its base lit blue, the same
    // everywhere). A broken deck and a convective sky keep the old law (round 6: over Frosthollow's snow the new one lit
    // a broken deck's bases white, round three's grey undone). QA: CLOUD_DECK_GROUND 0 the old law everywhere.
    const model = this.scene.userData.lightModel as { groundAlbedo?: readonly number[]; overcast?: number } | undefined;
    const albedo = model?.groundAlbedo ?? [0.18, 0.18, 0.18];
    const sunUp = Math.max(0, a.sunDir.y / Math.max(1e-6, a.sunDir.length()));
    const open = 1 - Math.min(1, Math.max(0, this.preset?.coverage ?? 0));
    const ground = t.uGroundRadiance.value as THREE.Vector3;
    const sr = t.uSunRadiance.value as THREE.Vector3;
    const lawK = Math.min(1, Math.max(0, lightTune('CLOUD_DECK_GROUND', 1))) * this.deckClosing;
    const reach = cloudGroundLight(open, this.deckTau, 0.2126 * albedo[0] + 0.7152 * albedo[1] + 0.0722 * albedo[2]);
    const sunK = open + (reach - open) * lawK, skyK = 1 + (reach - 1) * lawK;
    ground.set(
      albedo[0] * (sr.x * sunUp * sunK / Math.PI + irr.r * skyK),
      albedo[1] * (sr.y * sunUp * sunK / Math.PI + irr.g * skyK),
      albedo[2] * (sr.z * sunUp * sunK / Math.PI + irr.b * skyK));
    const glow = this.preset?.groundGlow;
    if (glow && (glow[0] > 0 || glow[1] > 0 || glow[2] > 0)) {
      (t.uAmbientBottom.value as THREE.Vector3).addScaledVector(this.scratch.set(glow[0], glow[1], glow[2]), CLOUD_GROUND_GLOW_K);
      ground.addScaledVector(this.scratch.set(glow[0], glow[1], glow[2]), CLOUD_GROUND_GLOW_K * 2);
    }
    this.domeMaterial.uniforms.uSkyIntensity.value = a.skyIntensity;
    (this.domeMaterial.uniforms.uSunDir.value as THREE.Vector3).copy(a.sunDir).normalize();
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
    r.tTrace.value = this.trace.textures[0];
    r.tTraceDepth.value = this.trace.textures[1];
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

  /**
   * The Beer shadow map: a band of each toroidal cascade on its cadence (every band after a cut or a preset change), each
   * window re-centred on the camera by whole texels, and the lookup uniforms the trace and the shade read.
   */
  private updateBeerShadow(full: boolean): void {
    const sun = this.traceMaterial.uniforms.uSunDir.value as THREE.Vector3;
    const t = this.traceMaterial.uniforms;
    const w0 = t.uBsmWindow0.value as THREE.Vector4, w1 = t.uBsmWindow1.value as THREE.Vector4;
    const stack = this.medium.uHeightRange.value as THREE.Vector2;
    // (QA: CLOUD_BSM_OFF draws the medium without the map — the trace's sun march and its fallback alone)
    if (sun.y < 0.03 || !(stack.y > stack.x) || stack.x > 1e5 || lightTune('CLOUD_BSM_OFF', 0) > 0) {
      w0.w = 0; w1.w = 0;
      for (const c of this.bsm) c.valid = false;
      return;
    }
    const plane = stack.x, top = stack.y;
    // the map's key (no per-frame string): the sun to 1e-4 and the stack's plane and top
    const k = this.bsmKey;
    const sx = Math.round(sun.x * 1e4), sy = Math.round(sun.y * 1e4), sz = Math.round(sun.z * 1e4);
    if (k[0] !== sx || k[1] !== sy || k[2] !== sz || k[3] !== plane || k[4] !== top) {
      k[0] = sx; k[1] = sy; k[2] = sz; k[3] = plane; k[4] = top;
      for (const c of this.bsm) c.valid = false;
    }
    const b = this.bsmMaterial.uniforms;
    (b.uBsmSunDir.value as THREE.Vector3).copy(sun);
    (b.uPlane.value as THREE.Vector2).set(plane, top);
    // the low tier (its cost at or under the old layer's): the near cascade alone, at 0.6 of the stack's slices — the far
    // clouds take the trace's own column, and the far map is never marched
    const low = this.traceTier === 'low';
    b.uSlices.value = low ? Math.max(16, Math.round(this.bsmSlices * 0.6)) : this.bsmSlices;
    if (low) { w1.w = 0; this.bsm[1].valid = false; }
    for (let i = 0; i < (low ? 1 : CLOUD_BSM_CASCADES.length); i++) {
      const spec = CLOUD_BSM_CASCADES[i], c = this.bsm[i];
      const texel = spec.span / spec.texels;
      if (!c.target) {
        c.target = makeTarget(spec.texels, spec.texels, `clouds-beer-shadow-${i}`, THREE.HalfFloatType);
        c.target.texture.wrapS = c.target.texture.wrapT = THREE.RepeatWrapping;
      }
      // the windows hold plane coordinates (a texel is the sun's ray through the plane at it): the near one is centred on
      // the camera (the ground's shade, the low cloud about it); the far one on the camera's point at the stack's middle
      // height carried down the sun's ray to the plane — a point aloft lies on a texel toward the anti-sun by its height
      // over the plane / tan(elevation), kilometres for a front's towers (centred on the camera, the far window's edge cut
      // through every tower past ten kilometres: streaks along the sun where the map ended)
      let ox = this.cam.pos.x, oz = this.cam.pos.z;
      if (i > 0) {
        const shift = Math.min(15000, (0.5 * (top - plane)) / Math.max(sun.y, 0.03));
        const hl = Math.hypot(sun.x, sun.z);
        if (hl > 1e-6) { ox -= (sun.x / hl) * shift; oz -= (sun.z / hl) * shift; }
      }
      const cellX = Math.floor(ox / texel) - spec.texels / 2, cellZ = Math.floor(oz / texel) - spec.texels / 2;
      const all = full || !c.valid;
      const period = spec.every * (CLOUD_BSM_TIER_STRETCH[this.traceTier] ?? 1);
      if (all || (this.frame + spec.phase) % period === 0) {
        (b.uWinCell.value as THREE.Vector2).set(cellX, cellZ);
        b.uTexels.value = spec.texels;
        b.uTexelM.value = texel;
        b.uLod.value = i;
        const rows = spec.texels / spec.bands;
        const n = all ? spec.bands : 1;
        const band = this.bsmBandRect;
        for (let k = 0; k < n; k++) {
          band.set(0, ((c.band + k) % spec.bands) * rows, spec.texels, rows);
          this.renderQuad(this.bsmMaterial, c.target, band);
        }
        c.band = (c.band + n) % spec.bands;
        if (all) c.valid = true;
      }
      (i === 0 ? w0 : w1).set(cellX * texel, cellZ * texel, spec.span, c.valid ? 1 : 0);
    }
    t.tBsm0.value = this.bsm[0].target?.texture ?? null;
    t.tBsm1.value = this.bsm[1].target?.texture ?? null;
    (t.uBsmPlane.value as THREE.Vector2).set(plane, top);
    (t.uBsmSun.value as THREE.Vector3).copy(sun);
  }

  /**
   * post.ts's hook, before the scene draws: advance the wind, detect a camera cut, refresh a band of the Beer shadow
   * map, trace this frame's slot(s), resolve the history the dome composites and refresh the cloud shade.
   * @param hazeDatum the aerial pass's haze-layer datum (post.ts uHazeDatum: the ground under the camera); a call
   * without it (the Studio's and the captures' settle) keeps the last one the frame passed
   */
  beforeSceneRender(
    renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, dt: number, width: number, height: number, hazeDatum?: number,
    sceneDepth?: THREE.Texture | null,
  ): void {
    if (hazeDatum !== undefined && Number.isFinite(hazeDatum)) this.hazeDatum = hazeDatum;
    if (sceneDepth !== undefined) this.lastSceneDepth = sceneDepth;
    const preset = this.preset;
    if (!preset || !this.active || renderer !== this.renderer || !this.ensureVolumes()) {
      this.dome.visible = false;
      this.sceneDepthReady = false;
      this.dropCloudShade();
      return;
    }
    this.refreshLifetime();
    if (this.context?.isContextLost()) { this.dome.visible = false; this.sceneDepthReady = false; return; }
    this.syncTier();
    if (width !== this.targetWidth || height !== this.targetHeight) { this.resize(width, height); this.sceneDepthReady = false; }
    // wind drift, bounded to the fields' periods (every noise tiles within them)
    const step = Math.max(0, Math.min(0.1, dt || 0));
    const wdx = Math.cos(preset.windDirRad), wdz = Math.sin(preset.windDirRad);
    this.windDir.set(wdx, wdz);
    const wx = wdx * preset.windSpeed * step, wz = wdz * preset.windSpeed * step;
    const shift = this.weatherShift;
    shift.x = wrapDrift(shift.x - wx, CLOUD_WEATHER_TILE_M);
    shift.y = wrapDrift(shift.y - wz, CLOUD_WEATHER_TILE_M);
    const ns = this.noiseShift;
    ns.x = wrapDrift(ns.x - wx * 0.8, CLOUD_UPPER_WRAP_M);
    ns.z = wrapDrift(ns.z - wz * 0.8, CLOUD_UPPER_WRAP_M);
    // the billows boil: the noise rises slowly through a convective cloud (a deck turns over slower)
    ns.y = wrapDrift(ns.y - CLOUD_BOIL_M_PER_S * (1 - 0.8 * preset.stratiform) * step, CLOUD_UPPER_WRAP_M);
    const cs = this.cirrusShift;
    cs.x = wrapDrift(cs.x - preset.windSpeed * 2 * step, CLOUD_CIRRUS_TILE_M);
    const ux = Math.cos(preset.cirrusAngleRad), uz = Math.sin(preset.cirrusAngleRad);
    const ud = this.upperDrift;
    ud.x = wrapDrift(ud.x - ux * preset.windSpeed * 2 * step, CLOUD_UPPER_WRAP_M);
    ud.y = wrapDrift(ud.y - uz * preset.windSpeed * 2 * step, CLOUD_UPPER_WRAP_M);
    const t = this.traceMaterial.uniforms, m = this.medium;
    const offX = preset.offset[0] * CLOUD_WEATHER_TILE_M, offY = preset.offset[1] * CLOUD_WEATHER_TILE_M;
    // the drift in the wind frame: the streets ride along the wind (the shift projected onto it) plus the map's offset
    const streetShiftX = shift.x * wdx + shift.y * wdz + offX * 0.73, streetShiftY = -shift.x * wdz + shift.y * wdx + offY * 0.37;
    (t.uWeatherShift.value as THREE.Vector2).set(shift.x + offX, shift.y + offY);
    (t.uStreetShift.value as THREE.Vector2).set(streetShiftX, streetShiftY);
    (t.uWindDir.value as THREE.Vector2).copy(this.windDir);
    // the medium: the local weather drifts with the wind at the map's own offset (four tiles of the old field)
    (m.uLocalShift.value as THREE.Vector2).set(shift.x + offX * 4, shift.y + offY * 4);
    (m.uStreetShift2.value as THREE.Vector2).set(streetShiftX, streetShiftY);
    (m.uWindDir2.value as THREE.Vector2).copy(this.windDir);
    (m.uShapeShift.value as THREE.Vector3).copy(ns);
    (m.uDetailShift.value as THREE.Vector3).set(ns.x * 0.31, ns.y * 1.7, ns.z * 0.31);
    (t.uCirrusShift.value as THREE.Vector2).set(cs.x + offX * 1.9, offY * 2.3);
    (t.uUpperDrift.value as THREE.Vector2).copy(ud);
    t.uHazeDatum.value = Number.isFinite(this.hazeDatum) ? this.hazeDatum : camera.position.y;
    this.applyPresetUniforms(preset);
    this.applyAtmosphereUniforms();
    {
      const overcast = (this.scene.userData.lightModel as { overcast?: number } | undefined)?.overcast ?? 0;
      const a = this.atmosphere;
      const terms = hazeTargetTerms(overcast, a.fogMix ?? 0, this.hazeTerms);
      (t.uOvercastHaze.value as THREE.Vector4).set(terms.x, terms.y, 0, smoothstep01(overcast / 0.3));
      const tint = a.fogTint;
      if (tint) (t.uOvercastTint.value as THREE.Vector3).set(tint.r, tint.g, tint.b);
    }
    t.uOpaqueCut.value = lightTune('CLOUD_OPAQUE_CUT', 1);
    t.uRainCore.value = lightTune('CLOUD_RAIN_CORE', 0);
    // QA (round 10): the cost lab's knobs — the step cap, the entry refinement, the far cascade's bilinear read, the
    // streets' share; the march's budget the tier's (round 11)
    const budget = CLOUD_TIERS[this.traceTier] ?? CLOUD_TIERS.high;
    t.uStepCap.value = lightTune('CLOUD_STEP_CAP', budget.steps);
    (t.uFine.value as THREE.Vector2).set(lightTune('CLOUD_FINE_N', budget.fineN), lightTune('CLOUD_FINE_STRIDE', budget.fineStride));
    t.uBsmFarBilinear.value = lightTune('CLOUD_BSM_FAR_BILINEAR', 0);
    {
      const k = lightTune('CLOUD_STREETS', 1), base = this.streetsBase;
      (m.uLayerStreets.value as THREE.Vector4).set(base.x * k, base.y * k, base.z * k, base.w * k);
    }
    m.uFragMin.value = lightTune('CLOUD_FRAG_MIN', 0);
    // QA: the march's light budget (cloudShaders.ts uLightBudget; the defaults the tier's law) and the towers' warp, the
    // detail's reach and the stride's growth as scales — the cost lab's knobs
    (t.uLightBudget.value as THREE.Vector4).set(Math.max(1, Math.round(lightTune('CLOUD_LIGHT_EVERY', budget.lightEvery))), lightTune('CLOUD_LIGHT_T', 0.15),
      lightTune('CLOUD_SUN_STEPS', budget.sunSteps), lightTune('CLOUD_T_EXIT', budget.exitT));
    t.uDetailRange.value = budget.detailRange * lightTune('CLOUD_DETAIL_RANGE', 1);
    t.uStepGrowth.value = budget.growth * lightTune('CLOUD_STEP_GROWTH', 1);
    m.uWeatherWarp.value = this.warpM * lightTune('CLOUD_WARP', 1);
    t.uDeckLobe.value = lightTune('CLOUD_DECK_SUN_LOBE', CLOUD_DECK_SUN_LOBE);
    // QA: a deck's light by its own column (0 / 0 the round-three law: the sun ray's depth, the map's ambient scale) and a
    // closing deck's ground return
    (t.uDeckTune.value as THREE.Vector3).set(lightTune('CLOUD_DECK_LOCAL_TAU', 1), lightTune('CLOUD_DECK_GROUND', 1),
      lightTune('CLOUD_DECK_GROUND_RETURN', CLOUD_DECK_GROUND_RETURN));
    if (t.uDebug.value !== this.debugMode) { t.uDebug.value = this.debugMode; this.resetHistory(); }

    // camera frame; cuts (teleports, big turns, zooms) rebuild the history at four slots a frame
    const P = this.prevCam, C = this.cam;
    P.pos.copy(C.pos); P.right.copy(C.right); P.up.copy(C.up); P.fwd.copy(C.fwd); P.tan.copy(C.tan);
    this.captureCamera(camera);
    const low = (m.uHeightRange.value as THREE.Vector2).x;
    const depthTex = sceneDepth ?? this.lastSceneDepth;
    const depthOn = !!depthTex && this.sceneDepthReady && this.hasPrev && C.pos.y <= low;
    t.tSceneDepth.value = depthOn ? depthTex : null;
    t.uSceneDepthOn.value = depthOn ? 1 : 0;
    (t.uSceneNearFar.value as THREE.Vector2).copy(this.depthPlanes);
    (t.uDepthRight.value as THREE.Vector3).copy(P.right);
    (t.uDepthUp.value as THREE.Vector3).copy(P.up);
    (t.uDepthFwd.value as THREE.Vector3).copy(P.fwd);
    (t.uDepthTan.value as THREE.Vector2).copy(P.tan);
    this.depthPlanes.set(camera.near, camera.far);
    let cut = false;
    if (this.hasPrev) {
      const moved = C.pos.distanceTo(P.pos);
      const turned = C.fwd.angleTo(P.fwd);
      if (cloudCameraCut(moved, turned, P.tan.y, C.tan.y)) { this.resetHistory(); this.cuts++; cut = moved > CLOUD_CUT_JUMP_M; }
    } else {
      this.resetHistory();
    }
    this.hasPrev = true;
    (m.uClear2.value as THREE.Vector3).set(C.pos.x, C.pos.z, preset.clearRadiusM * lightTune('CLOUD_CLEAR_RADIUS_SHARE', CLOUD_CLEAR_RADIUS_SHARE));
    this.setCameraUniforms(this.traceMaterial, C);
    this.setCameraUniforms(this.resolveMaterial, C);
    t.uPixelAngle.value = (C.tan.y * 2) / Math.max(4, this.history[0].height);
    const r = this.resolveMaterial.uniforms;
    (r.uPrevCamPos.value as THREE.Vector3).copy(P.pos);
    (r.uPrevRight.value as THREE.Vector3).copy(P.right);
    (r.uPrevUp.value as THREE.Vector3).copy(P.up);
    (r.uPrevFwd.value as THREE.Vector3).copy(P.fwd);
    (r.uPrevTan.value as THREE.Vector2).copy(P.tan);

    this.beginTimer();
    if (!this.frozen) {
      this.updateBeerShadow(cut);
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
        for (let k = 1; k < this.benchRepeat; k++) this.traceSlot(this.frame % 16);
      }
    }
    this.endTimer();
    this.frame++;
    this.framesShown++;
    this.dome.visible = true;
    // a camera in or over the lowest lane sees the cloud in front of the terrain (no depth test, no horizon mask)
    const inside = C.pos.y > low ? 1 : 0;
    this.domeMaterial.uniforms.uInside.value = inside;
    if (this.domeMaterial.depthTest === !!inside) this.domeMaterial.depthTest = !inside;
    this.updateFarShade(preset);
    this.updateSunMean();
    this.updateLightning(preset, step);
    // the scene draws next with this camera: its depth is the next frame's cloudSceneT
    this.sceneDepthReady = true;
  }

  /**
   * The cloud shade map (cloudShadeMap.ts): the Beer shadow map's column depth as the share of the sun a cloud takes,
   * over the texel-snapped square around the camera, published to the lit materials' shared uniforms; off where the
   * clouds cast no shadows (a closed deck: the light model's uniform cut takes the beam instead).
   */
  private updateFarShade(preset: CloudLayerPreset): void {
    const lookup = this.traceMaterial.uniforms.uBsmWindow0.value as THREE.Vector4;
    if (!(preset.shadowPattern > 0) || preset.coverage <= 0 || lookup.w < 0.5) { this.dropCloudShade(); return; }
    const texel = CLOUD_FAR_SHADE_SPAN_M / CLOUD_FAR_SHADE_SIZE;
    const cx = Math.round(this.cam.pos.x / texel) * texel, cz = Math.round(this.cam.pos.z / texel) * texel;
    const rect = this.farShadeInfo.rect;
    const moved = !this.farShadeValid || rect.x !== cx || rect.y !== cz;
    if (!moved && (this.frame + CLOUD_SHADE_PHASE) % (CLOUD_FAR_SHADE_EVERY * (this.traceTier === 'low' ? 2 : 1)) !== 0) return;
    if (!this.farShadeTarget) {
      this.farShadeTarget = makeTarget(CLOUD_FAR_SHADE_SIZE, CLOUD_FAR_SHADE_SIZE, 'clouds-far-shade', THREE.UnsignedByteType);
    }
    rect.set(cx, cz, CLOUD_FAR_SHADE_SPAN_M);
    const s = this.shadeMaterial.uniforms;
    (s.uShadeRect.value as THREE.Vector3).copy(rect);
    // a cumulus core takes most of the beam; a deck's cells by the deck's openness (shadowPattern), closing toward the
    // light model's uniform cut
    const core = preset.shadow ? lightTune('CLOUD_SHADOW_CORE', CLOUD_SHADOW_CORE) : lightTune('CLOUD_DECK_SHADOW_CORE', CLOUD_LAYER_RULES.deckShadowCore);
    (s.uShadeLaw.value as THREE.Vector3).set(core, lightTune('CLOUD_SHADOW_TAU', CLOUD_SHADOW_TAU), preset.shadowPattern);
    this.renderQuad(this.shadeMaterial, this.farShadeTarget);
    this.farShadeInfo.texture = this.farShadeTarget.texture;
    this.farShadeInfo.baseM = (this.medium.uHeightRange.value as THREE.Vector2).x;
    this.farShadeValid = true;
    const shared = this.scene.userData.cloudShadeUniforms as CloudShadeUniforms | undefined;
    if (shared) {
      publishCloudShade(shared, this.farShadeInfo as { texture: THREE.Texture; rect: THREE.Vector3; baseM: number },
        this.traceMaterial.uniforms.uSunDir.value as THREE.Vector3);
    }
  }

  /**
   * The sun's mean share over the playable square (the skies lane's light-model hook): the shade over the square at
   * 32², read back asynchronously every CLOUD_SUN_MEAN_EVERY frames, published on scene.userData.cloudSunMean.
   */
  private updateSunMean(): void {
    if (!this.farShadeValid || this.sunMeanPending || ++this.sunMeanAge < CLOUD_SUN_MEAN_EVERY || (this.frame + CLOUD_SUN_MEAN_PHASE) % 4 !== 0) return;
    const gl = this.context as WebGL2RenderingContext | null;
    if (!gl || gl.isContextLost() || typeof gl.fenceSync !== 'function') return;
    this.sunMeanAge = 0;
    if (!this.sunMeanTarget) {
      this.sunMeanTarget = makeTarget(CLOUD_SUN_MEAN_TEXELS, CLOUD_SUN_MEAN_TEXELS, 'clouds-sun-mean', THREE.UnsignedByteType);
      this.sunMeanPixels = new Uint8Array(CLOUD_SUN_MEAN_TEXELS * CLOUD_SUN_MEAN_TEXELS * 4);
    }
    const s = this.shadeMaterial.uniforms;
    const rect = s.uShadeRect.value as THREE.Vector3;
    const keepX = rect.x, keepY = rect.y, keepZ = rect.z;
    rect.set(0, 0, CLOUD_SUN_MEAN_SPAN_M);
    this.renderQuad(this.shadeMaterial, this.sunMeanTarget);
    rect.set(keepX, keepY, keepZ);
    // the house readback (rgba8Readback.ts): the target snapshotted into an owned pack buffer, no binding held across a
    // task. (three's readRenderTargetPixelsAsync keeps its pack buffer bound across its await: on the hardware the
    // atmosphere's summary read fell into that window and the sky dropped to its Preetham fallback.)
    const renderer = this.renderer;
    const prev = renderer.getRenderTarget();
    const pixels = this.sunMeanPixels!;
    let read: Promise<void>;
    renderer.setRenderTarget(this.sunMeanTarget);
    try { read = beginRgba8Readback(gl, CLOUD_SUN_MEAN_TEXELS, CLOUD_SUN_MEAN_TEXELS, pixels); } finally { renderer.setRenderTarget(prev); }
    this.sunMeanPending = true;
    read.then(() => {
      let sum = 0, raw = 0, under = 0;
      const n = CLOUD_SUN_MEAN_TEXELS * CLOUD_SUN_MEAN_TEXELS;
      for (let i = 0; i < n; i++) {
        const beam = 1 - pixels[i * 4] / 255;
        sum += beam;
        raw += pixels[i * 4 + 1] / 255;
        if (beam < 0.5) under++;
      }
      this.sunMean.mean = sum / n;
      this.sunMean.raw = raw / n;
      this.sunMean.cover = under / n;
      this.scene.userData.cloudSunMean = this.sunMean;
    }, () => { /* a lost context or a busy driver: the next refresh retries */ }).finally(() => { this.sunMeanPending = false; });
  }

  /** The shared cloud-shade uniforms while the map is live (the ring's vista samples the same map: horizonCloudShade.ts). */
  get cloudShade(): CloudShadeUniforms | null {
    const shared = this.scene.userData.cloudShadeUniforms as CloudShadeUniforms | undefined;
    return this.active && this.farShadeValid && shared ? shared : null;
  }

  /** The clouds cast no shadow this frame: the map is stale and the lit materials stand in full sun. */
  private dropCloudShade(): void {
    this.farShadeValid = false;
    const shared = this.scene.userData.cloudShadeUniforms as CloudShadeUniforms | undefined;
    if (shared) publishCloudShade(shared, null, this.traceMaterial.uniforms.uSunDir.value as THREE.Vector3);
    this.sunMean.mean = 1;
    this.sunMean.raw = 1;
    this.sunMean.cover = 0;
  }

  /**
   * The cloud shade map (diagnostics; the lit materials read it through cloudShadeMap.ts): r = the share of the sun a
   * cloud takes, its square (centre x, z and side, m) and the plane it was projected to (m); null where the clouds cast
   * no shadows this frame.
   */
  get farShade(): { readonly texture: THREE.Texture; readonly rect: THREE.Vector3; readonly baseM: number } | null {
    const info = this.farShadeInfo;
    return this.active && this.farShadeValid && info.texture && (this.preset?.shadowPattern ?? 0) > 0 ? info as { texture: THREE.Texture; rect: THREE.Vector3; baseM: number } : null;
  }

  /**
   * 2026-10-01: lightning in a night storm (a front's towers, night only). A deterministic sequence (presentation only
   * — never the simulation's randomness): a strike every 4–16 s, one to three return strokes over a third of a second,
   * the cloud around it lit from inside in the composite.
   */
  private updateLightning(preset: CloudLayerPreset, step: number): void {
    const flash = this.domeMaterial.uniforms.uFlash.value as THREE.Vector4;
    const stormy = preset.timeOfDay === 'night' && preset.anvil >= 0.5;
    if (!stormy) { flash.w = 0; return; }
    const rnd = (): number => { this.flashSeed = (Math.imul(this.flashSeed, 1664525) + 1013904223) >>> 0; return this.flashSeed / 4294967296; };
    this.flashClock += step;
    if (this.flashClock >= this.flashNext) {
      this.flashClock = 0;
      this.flashNext = 4 + 12 * rnd();
      this.flashAge = 0;
      this.flashStrokes = 1 + Math.floor(rnd() * 3);
      this.flashPeak = CLOUD_FLASH_STRENGTH * (0.5 + 0.5 * rnd());
      const cam = this.cam.pos;
      const az = preset.windDirRad + (rnd() - 0.5) * 2.4, d = preset.clearRadiusM * 1.6 + 6000 * rnd();
      const x = cam.x + Math.cos(az) * d, z = cam.z + Math.sin(az) * d, y = preset.baseM + preset.thicknessM * (0.2 + 0.4 * rnd());
      flash.set(x - cam.x, y - cam.y, z - cam.z, 0).normalize();
    }
    this.flashAge += step;
    const strokeT = this.flashAge / 0.09;
    const k = Math.floor(strokeT);
    flash.w = k < this.flashStrokes ? this.flashPeak * Math.exp(-(strokeT - k) * 0.09 / 0.03) * (1 - 0.25 * k) : 0;
    if (this.qaFlash > 0) flash.w = this.qaFlash;
  }

  /** One timer query in flight: a pending one is read (or dropped when disjoint) before a new one opens. */
  private beginTimer(): void {
    if (!this.gpuTiming) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (this.timerExt === undefined) this.timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2') as typeof this.timerExt;
    const ext = this.timerExt;
    if (!ext) return;
    if (this.timerQuery) {
      const query = this.timerQuery;
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean;
      const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) as boolean;
      if (!available && !disjoint) return;
      if (available && !disjoint) this.lastTraceGpuMs = (gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6;
      gl.deleteQuery(query);
      this.timerQuery = null;
    }
    const query = gl.createQuery();
    if (!query) return;
    gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
    this.timerQuery = query;
    this.timerOpen = true;
  }

  private endTimer(): void {
    if (!this.timerOpen || !this.timerExt) return;
    (this.renderer.getContext() as WebGL2RenderingContext).endQuery(this.timerExt.TIME_ELAPSED_EXT);
    this.timerOpen = false;
  }

  /** Complete interleaved history plus four averaging cycles for a still.
   * Trace only the cloud targets; do not redraw the complete world 68 times. */
  settleForCapture(camera: THREE.PerspectiveCamera): boolean {
    if (!this.targetWidth || !this.targetHeight) return false;
    const remaining = this.captureFramesRemaining;
    for (let i = 0; i < remaining; i++) {
      this.beforeSceneRender(this.renderer, camera, 0, this.targetWidth, this.targetHeight);
    }
    return remaining > 0;
  }

  /** Cold captures must average the first noisy Bayer samples as well as fill every slot. */
  get captureFramesRemaining(): number {
    if (!this.active || !this.preset || this.frozen) return 0;
    return Math.ceil((16 - this.rebuild) / CLOUD_REBUILD_SLOTS) + Math.max(0, 64 - this.since);
  }

  /**
   * QA: read the current history back (the cloud mask and radiance at history resolution) through an 8-bit
   * copy, for the round's structure / lighting / edge metrics. Null before the first resolve.
   */
  readHistory(): CloudHistoryReadback | null {
    if (!this.historyValid) return null;
    const src = this.history[this.historyIndex];
    const w = src.width, h = src.height;
    if (!this.copyTarget) this.copyTarget = makeTarget(w, h, 'clouds-copy', THREE.UnsignedByteType);
    else if (this.copyTarget.width !== w || this.copyTarget.height !== h) this.copyTarget.setSize(w, h);
    if (!this.copyMaterial) {
      this.copyMaterial = new THREE.ShaderMaterial({ name: 'VolumetricCloudCopy', vertexShader: QUAD_VERTEX, fragmentShader: COPY_FRAGMENT, depthTest: false, depthWrite: false, blending: THREE.NoBlending, uniforms: { tHistory: { value: null } } });
    }
    this.copyMaterial.uniforms.tHistory.value = src.texture;
    this.renderQuad(this.copyMaterial, this.copyTarget);
    const rgba = new Uint8Array(w * h * 4);
    this.renderer.readRenderTargetPixels(this.copyTarget, 0, 0, w, h, rgba);
    return { width: w, height: h, rgba };
  }

  /** Compile the programs and bake the volumes under a loading cover (a 1 × 1 trace and resolve; the dome compiles with the scene). */
  warm(): void {
    if (!this.active || !this.ensureVolumes()) return;
    const prevW = this.targetWidth, prevH = this.targetHeight;
    if (!prevW || !prevH) this.resize(16, 16);
    try {
      this.syncTier();
      this.renderQuad(this.traceMaterial, this.trace);
      this.resolveMaterial.uniforms.tTrace.value = this.trace.textures[0];
      this.resolveMaterial.uniforms.tTraceDepth.value = this.trace.textures[1];
      this.resolveMaterial.uniforms.tHistory.value = this.history[0].texture;
      this.renderQuad(this.resolveMaterial, this.history[1]);
      // the map's program on a one-texel band of a scratch target (the cascades allocate on the first frame)
      const scratch = makeTarget(1, 1, 'clouds-beer-shadow-warm', THREE.HalfFloatType);
      this.bsmBandRect.set(0, 0, 1, 1);
      this.renderQuad(this.bsmMaterial, scratch, this.bsmBandRect);
      scratch.dispose();
    } finally {
      this.resetHistory();
    }
  }

  dispose(): void {
    this.dropCloudShade();
    for (const rt of this.history) rt.dispose();
    this.trace.dispose();
    this.copyTarget?.dispose();
    this.copyMaterial?.dispose();
    this.traceMaterial.dispose();
    this.resolveMaterial.dispose();
    this.domeMaterial.dispose();
    this.bsmMaterial.dispose();
    this.shadeMaterial.dispose();
    for (const c of this.bsm) { c.target?.dispose(); c.target = null; c.valid = false; }
    this.farShadeTarget?.dispose();
    this.farShadeTarget = null;
    this.sunMeanTarget?.dispose();
    this.sunMeanTarget = null;
    this.farShadeValid = false;
    this.dome.geometry.dispose();
    this.dome.removeFromParent();
    this.quad.dispose();
    for (const key of CLOUD_NOISE_KINDS) {
      this.noise[key]?.dispose();
      this.noise[key] = null;
    }
    for (const rt of this.volumes?.targets ?? []) rt.dispose();
    this.volumes = null;
  }
}
