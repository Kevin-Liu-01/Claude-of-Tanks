/**
 * volumetricClouds.ts — the raymarched cloud layer over every battlefield (round 68, 2026-09-24; round 71,
 * 2026-09-25: the cloudscape pass — the opt-in layer stays `?clouds=volumetric`).
 *
 * A slab of cloud between a map's cloud base and top, its coverage cut from two weather fields by the map's
 * cloudscape (cloudPresets.ts over cloudscapes.ts): the multi-scale isotropic field (synoptic bands, mesoscale
 * groups, local cells; a vigour channel that sets the cloud type per column — stratus, cumulus, cumulonimbus —
 * the Nubis weather map written first-party) and the street field in the wind frame (rows of cumulus along the
 * wind). Each column takes its type's height profile (a stratus fills its lower slab flat, a cumulus a flat base
 * under a domed top, a cumulonimbus the whole slab under a spreading anvil), leans downwind with height (shear),
 * and is eroded at its edges by the curl-warped Worley detail volume (billowy under the bases, wispy on the
 * tops, a per-map wispiness). Lit by the round-65 atmosphere: the sun's irradiance through the transmittance
 * LUT, the ambient split between the sky irradiance on the tops and the horizon / ground term under the bases
 * (the summary pass), a blue-noise-jittered light march toward the sun, Beer–Lambert with the multiple-
 * scattering octaves of Wrenninge 2013 / Hillaire 2016 (contribution, attenuation and eccentricity each halved
 * per octave), a dual-lobe Henyey–Greenstein phase (forward 0.8, back −0.3) whose forward lobe gives the silver
 * lining, the Beer–powder term of Schneider & Vos 2015 toward the sun, and the energy-conserving step
 * integration. Behind the slab a far stratocumulus band and a wind-sheared cirrus sheet (with the 22° halo of
 * ice) close the sky; the aerial perspective on every layer is the aerial pass's own law toward the sky-view LUT
 * by distance, so a bank keeps reading at the horizon. Written from those papers; nothing is copied from any
 * reference renderer, and every noise texture is generated at boot by cloudNoise.ts.
 *
 * Cost: the march runs into a trace target of one sixteenth of a half-resolution history (a 4 × 4 slot cycle
 * over sixteen frames, Bayer-ordered, four slots a frame while the history rebuilds after a camera cut) and
 * a resolve pass reprojects the previous history through the previous camera (the anchor is the slab's
 * mid-altitude along the ray), clamps it to the neighbourhood of this frame's samples and blends the fresh
 * slot in. A short slab segment is tested at six weather taps before any march (empty-space skipping), the
 * march strides longer through empty air and with the pixel footprint at range. The composite is a
 * horizon-flattened dome mesh in the scene's transparent queue (depth-tested by the terrain and the ring, never
 * writing depth), premultiplied over the physically based dome, sampling the history with a Catmull-Rom filter.
 * Cloud shadows come from a per-cascade plane on the shadow-only layer whose custom depth material discards
 * outside the cloud cores of the same two weather fields (the CSM carries them at no shading cost); each plane
 * renders into ITS OWN cascade only (round 78: `setShadowCasterCascades` — three would rasterise every plane
 * into every map, sixteen field-shader draws for four); post.ts owns one hook:
 * `scene.userData.volumetricClouds.beforeSceneRender(...)` at the top of its frame transaction.
 *
 * 2026-10-01 (the clouds-and-skyboxes lane): the layered sky. The same trace draws the weather beyond the slab
 * (cloudWeatherLayers.ts) — a fog bank lying on the sea and rain shafts / virga under the base in front of the slab,
 * the far band behind it, the cirrus sheet with contrails last — and the composite adds lightning in a night front.
 * A deck's underside mottles with its rolls, the noise boils, the cirrus comes in patches; the sky light reaches the
 * clouds dimmed once (the summary's sky intensity undone), the moonlight's hue lights them at night and a town's glow
 * rides on the bases; a camera in or over a low deck sees the cloud in front of the terrain.
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { ATMOSPHERE_SKY_GLSL, ATMO_GROUND_KM } from './atmosphere.ts';
import type { AtmospherePublishedState } from './sky.ts';
import { markShadowOnly, setShadowCasterCascades } from './renderLayers.ts';
import { CLOUD_BLUE_SIZE, CLOUD_CURL_SIZE, CLOUD_DETAIL_SIZE, CLOUD_SHAPE_SIZE, CLOUD_WEATHER_SIZE } from './cloudNoise.ts';
import { cloudLayerKey, type CloudLayerPreset } from './cloudPresets.ts';
import { resolvePresetName } from './quality.ts';
import {
  CLOUD_CONTRAIL_MAX, CLOUD_FOGBANK_RANGE_M, CLOUD_RAIN_RANGE_M, CLOUD_RAIN_SAMPLES,
  applyCloudWeatherPreset, createCloudWeatherUniforms,
} from './cloudWeatherLayers.ts';

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
/** World periods (m): the weather fields, the shape volume (cumuliform / stratiform), the detail and curl volumes. */
export const CLOUD_WEATHER_TILE_M = 12000;
const CLOUD_STREET_TILE_M = 12000;
/** The cirrus sheet and the far band sample the fields at longer periods (a streak is tens of kilometres long). */
const CLOUD_CIRRUS_TILE_M = 30000;
const CLOUD_FARBAND_PERIOD_K = 2;
export const CLOUD_SHAPE_TILE_M = 1000;
export const CLOUD_SHAPE_TILE_STRATUS_M = 4200;
export const CLOUD_DETAIL_TILE_M = 300;
const CLOUD_CURL_TILE_M = 900;
/** The curl warp's amplitude (m) at full height in the cloud. */
const CLOUD_CURL_M = 60;
/** The scud band under the base (m) where a regime asks for ragged fragments. */
const CLOUD_SCUD_BAND_M = 380;
/** Round 76: a deck's cell cores hang under the base by this share of the slab thickness (× the cells knob). */
export const CLOUD_DECK_HANG_K = 0.12;
/** Round 76: the cell field's world period is this many cells (the shape volume's first Worley octave per period). */
export const CLOUD_CELLS_PER_TILE = 4;
/**
 * Round 76: the share of the sun's irradiance on a deck's top that the underside's transmitted light takes. The
 * physical share (1) put a base — a third to a half of a lit top's radiance under the diffusion law — into the
 * tonemap's clipped shoulder (the flat-density calibration at 0.6 displays as the same white as a sheet at 1.2),
 * because the battlefield skies are exposed for the ground with the horizon band near white; a third keeps the
 * cores in the mid-tones under the clear sky's level, the thin borders and the lit walls white.
 */
export const CLOUD_DECK_SUN_SHARE = 0.35;
/** 2026-10-01: a lightning stroke's peak glow on the cloud around it (the composite's units, after the night dimming). */
const CLOUD_FLASH_STRENGTH = 0.9;
/** 2026-10-01: the cirrus streak frame's warp (m): the jet's eddies bend the streaks over tens of kilometres. */
const CIRRUS_WARP_M = 2600;
/** 2026-10-01: the convective boil — the shape and detail noise rise through a cumulus at this rate (m/s). */
const CLOUD_BOIL_M_PER_S = 0.7;
/** 2026-10-01: the trails' upper drift and the boil wrap here (m): whole tiles of every field they read. */
const CLOUD_UPPER_WRAP_M = 600000;
/**
 * A drift kept inside (-w, w) (2026-10-02): continuous through zero and a whole wrap at +-w. The positive modulo it
 * replaces jumped a whole wrap on the first frame after a capture zeroed the drifts (the census and the shot tools
 * zero them for a frame-comparable field) — a seam for every lookup whose period does not divide the wrap: the boiling
 * noise (its vertical period follows the slab's thickness) ghosted every captured cloud.
 */
const wrapDrift = (v: number, w: number): number => (v >= w ? v - w : v <= -w ? v + w : v);
/**
 * 2026-10-01: the ground's light on the cloud bases at night — the preset's glow (linear, already scaled by the night
 * amount) joins the base ambient at this strength in the trace's units (the night bottom ambient is ~0.06 there).
 */
const CLOUD_GROUND_GLOW_K = 0.16;
/** The far band shows beyond this horizontal distance (m), fading in over the next three kilometres. */
const CLOUD_FARBAND_START_M = 8000;
/**
 * 2026-10-03 (the skies-and-atmosphere lane; the gauntlet's wave 0: "a pasted stratus ribbon", Saltwind's "hard-edged
 * pale streak ... a compositing seam or cloud-layer LOD transition"): a cumuliform sky's band starts where its traced
 * cumulus thin out (they are marched to 20 km), not at the decks' 8 km — there the flat band began 10° up in the middle of
 * the traced field, one pale sheet with an edge across the sky — and fades in over a longer run, so it sits on the
 * horizon (under 4–5° at a 1.4 km band) as the distant field's crowding, never in front of the traced clouds.
 */
export const CLOUD_FARBAND_START_CU_M = 16000;
export const CLOUD_FARBAND_FADE_CU_M = 9000;
/**
 * 2026-10-03 (the skies-and-atmosphere lane; the gauntlet's wave 0: "no cloud shadows on the land"): the far cloud
 * shadows. The gobos carry the clouds' shadows only inside the cascades (700 m on desktop: an overview's land beyond
 * them lay in one even sun). The same shade the gobos dither into the cascades — the cores of the same two weather
 * fields at the cloud base — is rendered small over a square around the camera, world-anchored (snapped to its texel),
 * refreshed every few frames (the wind moves it a metre), and the aerial pass (post.ts) takes each far pixel's sun share
 * away by it beyond the cascades' fade, as the cascades do inside it.
 */
export const CLOUD_FAR_SHADE_SIZE = 256;
/** The square's side (m): the land an overview sees, its ring's first kilometres beyond the square. */
export const CLOUD_FAR_SHADE_SPAN_M = 12000;
/** Frames between refreshes (a 6 m/s wind moves the field under a metre; a texel is 47 m). */
export const CLOUD_FAR_SHADE_EVERY = 8;
/** The gobos' darkest dither: the share of the sun a cloud core takes (the shade map holds the same value). */
export const CLOUD_SHADOW_CORE = 0.62;
/** March limits: steps, the farthest slant distance marched (m) and the dome shell radius (inside camera.far). */
export const CLOUD_MARCH_STEPS = 96;
/** The farthest slant distance marched (m): a bank beyond it has melted into the sky (the far scatter ramp). */
export const CLOUD_MARCH_MAX_M = 20000;
/** Round 76: a cellular deck's slab is marched to here (m); the far band fades in over 8–11 km and owns the horizon beyond. */
export const CLOUD_DECK_MARCH_MAX_M = 10000;
/**
 * Round 78 (the performance lane): a deck whose base sits under this altitude takes the cellular decks' march laws —
 * the 10 km cap and the tall slab's far strides — whatever its cells: a grazing ray under whiteout's 300 m stratus
 * otherwise marched twenty kilometres of sheet the far band and the haze ramp already own (+1.1–1.8 ms GPU at the
 * centre-far view in the round-71–77 audit). The cellular decks are unchanged (`cloudDeckMarch` is 1 for them
 * already); every cumuliform regime and the high sheets stay at 0.
 */
export const CLOUD_LOW_DECK_BASE_M = 400;

/** Whether a preset's slab marches under the deck laws (the 10 km cap, the far strides): the cellular decks and the low stratus decks. */
export function cloudDeckMarch(preset: { readonly cells: number; readonly stratiform: number; readonly baseM: number }): 0 | 1 {
  return preset.cells > 0 || (preset.stratiform >= 0.5 && preset.baseM < CLOUD_LOW_DECK_BASE_M) ? 1 : 0;
}
/** Step bounds (m): the floor scales with the slab, the far stride with the distance. */
export const CLOUD_STEP_MIN_M = 8;
export const CLOUD_STEP_MAX_M = 260;
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
 * sky-view LUT along the ray itself, without the pass's luminance caps: those keep a lit mountain from blowing
 * out against the haze, but a cloud bank fades into the sky it stands against, and a capped target left every
 * far deck a band darker than the sky around it (winter / whiteout skylines rose a tenth).
 */
export const CLOUD_AERIAL = Object.freeze({
  density: 0.00145, hazeDensity: 0.00092, hazeStart: 85, extCeiling: 0.42, scatterCeiling: 0.38,
  /** 2026-10-02: the pass's haze layer (AERIAL_LAYER_H): its scale height over the ground under the camera (m) */
  layerH: 300,
  desat: 0.62, cool: [0.90, 0.97, 1.08] as const,
  /** the pass's height-aware atmosphere: the falloff's start over the camera (m), its e-fold height, the shares */
  heightRef: 30, heightScale: 150, heightScatterK: 0.75, heightExtK: 0.35,
  /**
   * past the ring the scatter-in ceiling rises toward the sky and the altitude rule fades out — round 71 moved
   * the ramp out (3–12 km → 5–24 km) and lowered its ceiling (0.92 → 0.82) so a deck stays readable at the
   * horizon instead of melting past three kilometres
   */
  farStartM: 5000, farEndM: 24000, farScatterCeiling: 0.82,
  /** the cirrus sheet's slant through the boundary-layer haze: its e-fold height (m) */
  cirrusHazeScaleM: 1500,
});
/** The march's stride scale per quality preset (low tier: coarser steps, fewer of them; the mobile tier never runs the layer). */
export const CLOUD_STEP_SCALE_BY_PRESET: Readonly<Record<string, number>> = Object.freeze({ low: 1.8, medium: 1.3, high: 1, ultra: 1 });
/** Light march toward the sun: sample distances (m) from the point, on the base shape (no detail erosion); a stratus sheet takes the first three. */
export const CLOUD_LIGHT_TAPS = Object.freeze([14, 34, 70, 150, 320] as const);
/** The noise uploads the layer needs, in the worker's posting order. */
export const CLOUD_NOISE_KINDS = Object.freeze(['blue', 'weather', 'streets', 'curl', 'detail', 'shape'] as const);
export type CloudNoiseKind = (typeof CLOUD_NOISE_KINDS)[number];

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

/** The two weather fields as the trace and the shadow gobos read them (the gobos discard on the same field). */
const CLOUD_FIELD_GLSL = /* glsl */`
uniform sampler2D tWeather;
uniform sampler2D tStreets;
uniform vec2 uWeatherShift;
uniform vec2 uStreetShift;
uniform vec2 uWindDir;
uniform float uStreets;
uniform float uFieldMix;
// the equalised field the coverage cuts at a world xz: the cell-carried cumuliform one blended toward the
// street field in the wind frame (rows along the wind), or the broad stratiform one
float cloudField( vec2 pxz, out vec4 w, out vec4 st ) {
	// March neighbours take different paths: implicit derivatives select unrelated mip levels inside the loop.
	// Keep the authored volume and shadow coverage at level zero; the distant sheets filter their own footprint.
	w = textureLod( tWeather, ( pxz + uWeatherShift ) / ${f(CLOUD_WEATHER_TILE_M)}, 0.0 );
	vec2 q = vec2( dot( pxz, uWindDir ), dot( pxz, vec2( -uWindDir.y, uWindDir.x ) ) );
	st = textureLod( tStreets, ( q + uStreetShift ) / ${f(CLOUD_STREET_TILE_M)}, 0.0 );
	return mix( mix( w.r, st.r, uStreets ), w.b, uFieldMix );
}
`;

const TRACE_FRAGMENT = /* glsl */`
precision highp float;
precision highp sampler3D;
${ATMOSPHERE_SKY_GLSL}
${CLOUD_COMMON_GLSL}
${CLOUD_FIELD_GLSL}
uniform sampler3D tShape;
uniform sampler3D tDetail;
uniform sampler3D tCurl;
uniform sampler2D tBlue;
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
uniform vec3 uNoiseShift;
uniform float uShapeTile;
uniform float uSunGain;
uniform float uAmbientScale;
uniform float uClearRadius;
uniform float uPixelAngle;
uniform float uVertScale;
uniform vec2 uTypeRange;
uniform float uAnvil;
uniform float uWispiness;
uniform float uShearM;
uniform float uScud;
uniform float uSlabLow;
uniform float uCirrus;
uniform vec2 uCirrusDir;
uniform float uCirrusAlt;
uniform vec2 uCirrusShift;
uniform float uCirrusDensity;
uniform float uFarBand;
uniform float uFarBandAlt;
uniform vec2 uFarBandShift;
uniform float uStepScale;
// round 76 (the deck pass): the deck cells (their strength and the cell field's world period), the deck lighting
// share, the undulatus bands, the interior octave, the sky's irradiance on a horizontal diffuser (E / π) and the
// hang of the cell cores under the base (m)
uniform float uCells;
// round 78: 1 where the slab marches under the deck laws (a cellular deck or a low stratus deck, cloudDeckMarch)
uniform float uDeckMarch;
uniform float uCellTile;
uniform float uDeckLight;
uniform float uUndulatus;
uniform float uInterior;
// 2026-10-03: a deck's sub-cell lumps (cloudscapes.ts lumps; 0 = the cells alone)
uniform float uLumps;
uniform vec3 uSkyIrradiance;
uniform float uHang;
// QA: 1 = no depth-above term, 2 = no detail erosion, 3 = no light march, 4 = flat white density (structure only),
// 5 = the shape volume sampled unstretched, 6 = the height profile alone (no shape noise), 7 = no column top variation,
// 8 = no empty-space striding, 9 = half the stride, 10 = no start jitter
uniform float uDebug;
varying vec2 vUv;
const float CL_PI = 3.14159265358979;
float remap( float v, float lo, float hi, float nlo, float nhi ) {
	return clamp( ( v - lo ) / max( hi - lo, 1e-4 ), 0.0, 1.0 ) * ( nhi - nlo ) + nlo;
}
float phaseHG( float c, float g ) {
	float g2 = g * g;
	return ( 1.0 - g2 ) / ( 4.0 * CL_PI * pow( max( 1.0 + g2 - 2.0 * g * c, 1e-4 ), 1.5 ) );
}
// dual-lobe Henyey–Greenstein: the forward lobe carries the silver lining, the back lobe the glow of a mass
// lit from behind the viewer (forward 0.8 with a −0.3 back lobe at the first octave; both shrink per octave)
float phaseDual( float c, float g ) { return mix( phaseHG( c, g ), phaseHG( c, -0.375 * g ), 0.3 ); }
// the blue-noise tile at a trace texel (void-and-cluster ranks: neighbouring rays take offsets as far apart as possible)
float blueNoise( vec2 px ) { return texelFetch( tBlue, ivec2( mod( px, ${f(CLOUD_BLUE_SIZE)} ) ), 0 ).r; }
float luma( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }
// Project a ray's screen derivative onto a horizontal sheet. Its footprint grows rapidly at the horizon.
vec2 cloudSheetGradient( vec3 dir, vec3 rayDerivative, float height ) {
	return height * ( rayDerivative.xz * dir.y - dir.xz * rayDerivative.y ) / ( dir.y * dir.y );
}
// the weather at a world xz
struct Weather { float cov; float top; float breakup; float type; float anvil; float roll; };
Weather cloudWeather( vec2 pxz ) {
	vec4 w, st;
	float field = cloudField( pxz, w, st );
	Weather o;
	// round 76: the wind-frame rolls band a deck's thickness (undulatus); the fetch is the street field's own
	o.roll = st.r;
	// the street share fades past four kilometres: the far field reads as scattered cumulus, not as rolls
	// converging on the horizon (71c)
	float farK = smoothstep( 4000.0, 11000.0, length( pxz - uCamPos.xz ) );
	field = mix( field, mix( w.r, w.b, uFieldMix ), uStreets * 0.55 * farK );
	float anvilField = st.g;
	// the field is equalised: the map's coverage admits exactly that fraction; inside, the local coverage runs
	// 0..1 (skewed high) and carves the base shape into masses — a region is never one solid slab
	// (a sheet reaches its full strength within a third of the admitted range: dense across its footprint, thin only
	// at the breaks — ramped across the whole range a 97 % ceiling was translucent over most of the tile)
	// (round 76: a cellular deck compresses the ramp like a sheet — its structure comes from the cells, and a broken
	// stratocumulus at 0.66 ramped across the whole range covered a tenth of the sky as one soft mass)
	float sheetK = max( smoothstep( 0.5, 0.85, uStratiform ), uCells * 0.85 );
	float ramp = max( uCoverage * mix( 1.0, 0.35, sheetK ), 0.02 );
	o.cov = pow( clamp( ( field - ( 1.0 - uCoverage ) ) / ramp, 0.0, 1.0 ), mix( 0.7, 0.4, max( uStratiform, uCells * 0.7 ) ) );
	// a front keeps the sky over the camera open: its towers stand off toward the horizon
	if ( uClearRadius > 0.0 ) o.cov *= smoothstep( uClearRadius * 0.6, uClearRadius * 1.4, length( pxz - uCamPos.xz ) );
	// the column's type from the vigour channel inside the map's range: 0 stratus, 0.5 cumulus, 1 cumulonimbus
	o.type = mix( uTypeRange.x, uTypeRange.y, w.g );
	// anvils where the broad anvil field peaks under the convective end of the range
	o.anvil = uAnvil * smoothstep( 0.72, 0.9, anvilField ) * smoothstep( 0.55, 0.85, o.type );
	o.breakup = w.a;
	// the column top as a fraction of the slab: a stratus sheet fills its lower half flat, a cumulus rises with
	// its coverage (one dome per mass, not a tower per cell), a cumulonimbus the whole slab; towers lift the
	// deepest convective columns further
	float topS = 0.42 + 0.12 * w.a;
	float topC = clamp( 0.5 + 0.5 * sqrt( o.cov ) + ( w.a - 0.5 ) * 0.2, 0.3, 0.97 );
	// a cumulonimbus mass is a broad flat base deck with clustered towers on it: the deck is low, the towers
	// rise where the vigour clusters — a tower the width of a vigour lump (1.5–3 km), its height comparable to
	// its width — never one spire per cell
	float topDeck = 0.2 + 0.16 * sqrt( o.cov ) + ( w.a - 0.5 ) * 0.06;
	float top = o.type < 0.5 ? mix( topS, topC, o.type * 2.0 ) : mix( topC, topDeck, ( o.type - 0.5 ) * 2.0 );
	float cluster = smoothstep( 0.62, 0.92, w.g ) * pow( o.cov, 0.5 );
	top = mix( top, 1.0, uTowers * cluster * smoothstep( 0.3, 0.8, o.type ) );
	o.top = mix( top, 0.78 + 0.22 * w.a, uStratiform );
	if ( uDebug == 7.0 ) o.top = 1.0;
	return o;
}
// the xz of the column a point belongs to: a column leans downwind with height (wind shear), and its weather
// and its noise are read in the column's own frame so the lean is rigid — displacing only the noise slid the
// billows through an upright outline and read as stacked layers
vec2 cloudColumnXZ( vec3 p ) {
	// Wind shear bends the body above its condensation base, not just its cap.
	float hRel = clamp( ( p.y - uBase ) / uThick, 0.0, 1.0 );
	return p.xz - uWindDir * ( uShearM * smoothstep( 0.08, 1.0, hRel ) );
}
// coverage only (the empty-space test before the march)
float cloudCoverageAt( vec2 pxz ) {
	vec4 w, st;
	float field = cloudField( pxz, w, st );
	return max( field - ( 1.0 - uCoverage ), 0.0 );
}
// round 76: a deck's cell factor at a column — the inverted-Worley cells of the shape volume (two octaves) read in
// a slice at the slab's mid altitude at the deck's own period: 1 at a cell's core, near 0 on its borders. The
// column's thickness follows it (a stratocumulus deck is thick cells with thin borders), its base hangs under the
// cores, and the borders open where the coverage is marginal. 1 when the regime has no cells (round 71's sheet).
float cloudCellK( vec2 cxz ) {
	if ( uCells <= 0.0 ) return 1.0;
	vec3 cp = ( vec3( cxz.x, uBase + uThick * 0.5, cxz.y ) + uNoiseShift ) / uCellTile;
	vec4 c = texture( tShape, cp );
	float k = mix( 1.0, smoothstep( 0.12, 0.88, c.g * 0.75 + c.b * 0.25 ), uCells );
	// 2026-10-03: the sub-cell lumps — the detail volume's Worley lumps at twice its period (lumps of a few hundred
	// metres) carry the cell factor down to the scale of a stratocumulus base's rolls: each lump core a thicker, lower,
	// darker column, the lanes between them thinner and brighter (one fetch per column, the deck rows only)
	if ( uLumps > 0.0 ) {
		vec3 dl = texture( tDetail, ( vec3( cxz.x, uBase, cxz.y ) + uNoiseShift * 0.73 ) / ${f(CLOUD_DETAIL_TILE_M * 2)} ).rgb;
		float lump = smoothstep( 0.25, 0.8, dl.r * 0.55 + dl.g * 0.3 + dl.b * 0.15 );
		k *= mix( 1.0, 0.45 + 0.85 * lump, uLumps );
	}
	return k;
}
// density 0..1 at a world point. detail: whether the erosion volumes are sampled (the light march skips them);
// foot: the pixel footprint (m) at the point, which fades the fine erosion fetch out at range; cellK: the column's
// deck cell factor (cloudCellK; 1 without cells)
float cloudDensityK( vec3 p, Weather w, bool detail, float foot, float cellK ) {
	if ( w.cov <= 0.0 ) return 0.0;
	// round 76: the column's thickness factor — the cell (thin borders at two fifths of the core's height) banded by
	// the wind-frame rolls (undulatus); exactly 1 without the knobs
	float thickK = mix( 0.4, 1.0, cellK ) * min( 1.0, mix( 1.0, 0.6 + 0.8 * w.roll, uUndulatus ) );
	// the base line wanders a little per column (the breakup channel) so no razor-straight edge crosses the sky;
	// a deck's cell cores hang under it (round 76)
	float hRel = ( p.y - uBase - ( w.breakup - 0.5 ) * mix( 0.05, 0.064, uStratiform ) * uThick + uHang * cellK ) / uThick;
	if ( hRel < 0.0 ) {
		// scud: ragged fragments in the band under the base (a front's tatters, a low stratus' rags)
		if ( uScud <= 0.0 ) return 0.0;
		float hS = hRel * uThick / ${f(CLOUD_SCUD_BAND_M)};
		if ( hS <= -1.0 ) return 0.0;
		float band = smoothstep( -1.0, -0.45, hS ) * ( 1.0 - smoothstep( -0.25, 0.0, hS ) );
		vec3 sp = ( p + uNoiseShift ) * vec3( 1.0, 1.8, 1.0 ) / ( uShapeTile * 0.3 );
		vec4 s = texture( tShape, sp );
		float n = remap( s.r, 0.58, 1.0, 0.0, 1.0 ) * w.cov * band;
		if ( detail && n > 0.0 ) {
			vec3 dn = texture( tDetail, ( p + uNoiseShift * 1.31 ) / ${f(CLOUD_DETAIL_TILE_M)} ).rgb;
			n = remap( n, ( 1.0 - ( dn.r * 0.5 + dn.g * 0.3 + dn.b * 0.2 ) ) * 0.65, 1.0, 0.0, 1.0 );
		}
		return n * uScud * 0.5;
	}
	float hN = hRel / max( w.top * thickK, 0.05 );
	if ( hN >= 1.25 ) return 0.0;
	float t = w.type;
	float riseEnd = mix( 0.05, 0.14, t );
	float fallStart = t < 0.5 ? mix( 0.5, 0.48, t * 2.0 ) : mix( 0.48, 0.86, ( t - 0.5 ) * 2.0 );
	// the anvil: over the top quarter the mass widens instead of narrowing, flattened under a flat top and
	// spread downwind
	float anv = w.anvil * smoothstep( 0.7, 0.92, hN );
	fallStart = mix( fallStart, 0.95, w.anvil );
	// the column's own frame (the lean: cloudColumnXZ)
	vec3 ps = vec3( cloudColumnXZ( p ), p.y ).xzy;
	// Reuse the erosion curl for coherent silhouette-scale turbulence: fine
	// erosion alone left a fuzzy but perfectly cylindrical envelope.
	vec3 curl = vec3( 0.0 );
	if ( detail && uDebug != 6.0 ) {
		curl = texture( tCurl, ( ps + uNoiseShift * 0.57 ) / ${f(CLOUD_CURL_TILE_M)} ).rgb * 2.0 - 1.0;
		ps += curl * ( 110.0 * ( 1.0 - uStratiform ) * smoothstep( 0.0, 0.35, hN ) );
	}
	// a thin slab against a kilometre-wide shape period is sampled with its vertical axis compressed so the
	// billows read as tall as they are wide; a tall storm slab is not (compressed cells stack into layers); an
	// anvil is flattened
	vec3 sp = ( ps + uNoiseShift ) * vec3( 1.0, ( uDebug == 5.0 ? 1.0 : uVertScale ) * mix( 1.0, 0.45, anv ), 1.0 ) / uShapeTile;
	vec4 s = texture( tShape, sp );
	// the cauliflower: the inverted Worley cells of the shape (and, on the view march, a second octave at 2.7 x
	// the frequency: bulges of 90 / 45 / 23 m) lift the column top over each cell centre and drop it at the cell
	// borders, so a mass's outline is made of overlapping bulges — the interior stays dense (a mask that thinned
	// the upper half read as pancakes); a stratus keeps its sheet
	vec4 s2 = vec4( 0.5 );
	if ( detail && uDebug != 6.0 ) s2 = texture( tShape, sp * 2.7 + vec3( 0.31, 0.17, 0.53 ) );
	float bulge = detail ? s.g * 0.6 + s2.g * 0.4 : s.g;
	float lift = mix( 1.0, 0.3 + 1.3 * bulge, ( 1.0 - uStratiform ) * 0.9 );
	hN /= lift;
	if ( hN >= 1.0 ) return 0.0;
	// the type's height profile (Nubis): a stratus rises fast and fades from half height, a cumulus keeps a flat
	// base under a top that narrows from mid-height, a cumulonimbus keeps its width almost to its top
	float hg = smoothstep( 0.0, riseEnd, hN ) * ( 1.0 - smoothstep( fallStart, 1.0, hN ) );
	float lowFreq = s.g * 0.625 + s.b * 0.25 + s.a * 0.125;
	float base = ( uDebug == 6.0 ? 0.8 : remap( s.r, lowFreq - 1.0, 1.0, 0.0, 1.0 ) ) * hg;
	if ( detail && uDebug != 6.0 ) {
		// the second octave's billows crinkle the mass at 90 - 23 m, more toward the top
		// (2026-10-01: and a deck's rolls and lumps — its shape period is the cells' few kilometres, so without this
		// octave a stratocumulus was a field of smooth plates with nothing between the cell and the turret)
		float bill2 = s2.g * 0.625 + s2.b * 0.25 + s2.a * 0.125;
		float topW = smoothstep( 0.3, 0.85, hN ) * ( 1.0 - uStratiform );
		base = remap( base, ( 1.0 - bill2 ) * ( 0.22 * ( 0.5 + topW ) + 0.25 * uCells ), 1.0, 0.0, 1.0 );
	}
	// a stratus sheet is dense across its footprint (with a little mottle); cumulus keeps the shape's billows
	// (round 76: a cellular deck keeps more of the mottle inside its cells)
	base = mix( base, base * 0.3 + 0.7 * hg, uStratiform * 0.8 * ( 1.0 - 0.3 * uCells ) );
	// the coverage threshold rises with height so a mass is widest at its base and narrows to a dome (a tower
	// to a head); a cumulonimbus narrows less, and the anvil lowers the threshold again
	float narrow = mix( 0.45, 0.75, uTowers ) * ( 1.0 - uStratiform ) * ( 1.0 - 0.6 * smoothstep( 0.6, 1.0, t ) );
	float covH = min( 1.0, w.cov * ( 1.0 - narrow * hN ) + anv * 0.55 );
	// round 76: a deck's thin cell borders open where the coverage is marginal (the breaks follow the cell borders)
	covH *= mix( 1.0, 0.55 + 0.45 * cellK, uCells * 0.5 );
	float d = remap( base, 1.0 - covH, 1.0, 0.0, 1.0 ) * w.cov;
	// round 76: the cell cores are the dense columns, the borders a little thinner (their height carries most of the
	// optical depth the underside is lit through; a thin border at half density took twenty lit steps to go opaque)
	d *= mix( 0.8, 1.0, cellK );
	// Keep the three-dimensional billows visible through the body. Saturating
	// every admitted weather column erased them into a smooth solid cylinder.
	d *= mix( 1.0, mix( 0.4, 1.25, smoothstep( 0.25, 0.75, s.g ) ), uDebug == 6.0 ? 0.0 : 1.0 - uStratiform );
	if ( detail && d > 0.0 && d < 0.95 && uDebug != 2.0 ) {
		// two Worley-fbm fetches on a lattice the curl field advects (more with height: turbulent tops, calm
		// bases): the coarse one (lumps of 25 - 100 m) everywhere, a fine one (7 - 27 m) where the pixel
		// footprint resolves it; the octaves lean to the high frequencies so the silhouette crinkles
		// Stretch the erosion along the wind to pull out trailing filaments.
		vec3 wispyPos = ps;
		wispyPos.xz -= uWindDir * dot( ps.xz, uWindDir ) * ( 0.5 * uWispiness );
		vec3 dp = ( wispyPos + uNoiseShift * 1.31 + curl * ( ${f(CLOUD_CURL_M)} * ( 0.35 + 0.65 * hN ) ) ) * vec3( 1.0, uVertScale * 1.07, 1.0 ) / ${f(CLOUD_DETAIL_TILE_M)};
		vec3 dn = texture( tDetail, dp ).rgb;
		float hf = dn.r * 0.5 + dn.g * 0.3 + dn.b * 0.2;
		float hfCoarse = hf;
		float fineW = 1.0 - smoothstep( 6.0, 12.0, foot );
		if ( fineW > 0.0 ) {
			vec3 dn2 = texture( tDetail, dp * 3.7 + 0.37 ).rgb;
			hf = mix( hf, hf * 0.55 + ( dn2.r * 0.5 + dn2.g * 0.3 + dn2.b * 0.2 ) * 0.45, fineW );
		}
		// billowy lumps (the Worley cells) under the base and on the flanks, wisps (the inverted cells) on the
		// tops — the wispy share grows with height and with the map's wispiness; the erosion grows with height
		// too (a crisp dense base, wispy tops), a front's base is ragged, a stratus erodes little
		float wispy = clamp( mix( hN * 1.4 - 0.15, 1.0, uWispiness ), 0.0, 1.0 );
		float erode = mix( hf, 1.0 - hf, wispy );
		float amount = ( mix( 0.3, 0.85, smoothstep( 0.05, 0.6, hN ) ) + uTowers * 0.35 * ( 1.0 - smoothstep( 0.0, 0.12, hN ) ) )
			* ( 1.0 - uStratiform * 0.8 ) * mix( 0.8, 1.25, uWispiness ) * mix( 0.35, 1.0, smoothstep( 0.0, 0.2, uWispiness ) )
			* mix( 1.0, 1.25, uCells );
		d = remap( d, erode * amount, 1.0, 0.0, 1.0 );
		// a sharper threshold: the density saturates a short way in from the outline (crisper edges, no
		// semi-transparent halo around every mass)
		d = smoothstep( 0.03, 0.6, d );
		// round 76: the interior octave — the coarse detail lumps (25–100 m) modulate the density inside the mass
		// instead of vanishing in the remap, so the light march shades the lit face bulge by bulge
		if ( uInterior > 0.0 ) d *= mix( 1.0, 0.5 + 0.5 * hfCoarse, uInterior );
	}
	return d;
}
float cloudDensity( vec3 p, Weather w, bool detail, float foot ) {
	return cloudDensityK( p, w, detail, foot, cloudCellK( cloudColumnXZ( p ) ) );
}
// light optical depth toward the sun from p (the weather column of p for the near taps); the tap ladder is
// scaled per texel by the blue noise so the banding of a fixed ladder decorrelates between neighbouring rays
// (round 76: the two near taps share the point's column and its cell factor — no second cell fetch — and the
// detailed first tap of the interior octave skips the fine erosion octave, a footprint past its fade)
float cloudLightDepth( vec3 p, Weather w, float scale, bool short_, float cellK ) {
	float od = 0.0;
${CLOUD_LIGHT_TAPS.map((dist, k) => `	${k >= 2 ? `if ( !short_ && od * uDensity < 4.0${k >= 3 ? ' && uStratiform < 0.5' : ''}${k >= 4 ? ' && uThick < 2000.0' : ''} ) ` : ''}{
		vec3 lp = p + uSunDir * ( ${f(dist)} * scale );
		${k < 2 ? `od += cloudDensityK( lp, w, ${k === 0 ? 'uInterior > 0.0' : 'false'}, ${k === 0 ? '100.0' : '0.0'}, cellK )` : 'od += cloudDensity( lp, cloudWeather( cloudColumnXZ( lp ) ), false, 0.0 )'} * ( ${f(dist - (k === 0 ? 0 : CLOUD_LIGHT_TAPS[k - 1]))} * scale );
	}`).join('\n')}
	return od * uDensity;
}
// Optical depth through the deck above p. Keep this broad transmission estimate stable:
// scaling both column taps by the trace's temporal jitter made the entire underside
// brighten/darken with each 4 x 4 refresh block. The view and sun marches retain their
// jitter; this two-tap quadrature keeps its existing positions, weights and fetch budget.
float cloudColumnDepthAbove( vec3 p, Weather w, float cellK ) {
	float rem = max( uBase + uThick * max( w.top, 0.05 ) - p.y, 20.0 );
	float od = cloudDensityK( p + vec3( 0.0, rem * 0.22, 0.0 ), w, false, 0.0, cellK ) * 0.45
		+ cloudDensityK( p + vec3( 0.0, rem * 0.66, 0.0 ), w, false, 0.0, cellK ) * 0.55;
	return od * rem * uDensity;
}
// optical depth of the cloud above p toward the zenith (two base-shape taps): the underside of a thick lump
// sees less of the sky than a thin edge does
float cloudDepthAbove( vec3 p, Weather w ) {
	return cloudDensity( p + vec3( 0.0, 70.0, 0.0 ), w, false, 0.0 ) * 110.0 * uDensity;
}
// 2026-10-02: the battlefield haze is a layer over the ground (post.ts AERIAL_LAYER_H): the path-averaged density
// between the camera's height and the point's over the same path from the ground — 1 for a camera on the ground (the
// chase, the sights), 0.63 for the census bird at 300 m — so a cloud bank and the ground under it haze alike
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
	return mix( L, atmoSkyVisible( skyDir ) * opacity, fs );
}
// ---- the weather layers (2026-10-01): the contrails, the rain and virga, the sea fog bank — cloudWeatherLayers.ts
// places the trails and packs these uniforms
uniform vec4 uContrailA[ ${CLOUD_CONTRAIL_MAX} ];
uniform vec4 uContrailB[ ${CLOUD_CONTRAIL_MAX} ];
uniform float uContrails;
uniform vec2 uUpperDrift;
uniform vec4 uRain;
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
vec4 farBandLayer( vec3 dir, float cosT, vec3 rayDx, vec3 rayDy, out float tLayer ) {
	tLayer = 1e9;
	vec4 none = vec4( 0.0, 0.0, 0.0, 1.0 );
	if ( uFarBand <= 0.0 || dir.y <= 0.004 ) return none;
	float tb = ( uFarBandAlt - uCamPos.y ) / dir.y;
	float horiz = tb * length( dir.xz );
	// a deck's band continues its 10 km march; a cumuliform sky's starts where its 20 km march thins (2026-10-03)
	float fbStart = uDeckMarch > 0.0 ? ${f(CLOUD_FARBAND_START_M)} : ${f(CLOUD_FARBAND_START_CU_M)};
	float fbFade = uDeckMarch > 0.0 ? 3000.0 : ${f(CLOUD_FARBAND_FADE_CU_M)};
	if ( tb <= 0.0 || horiz <= fbStart ) return none;
	vec3 pb = uCamPos + dir * tb;
	vec2 gradX = cloudSheetGradient( dir, rayDx, uFarBandAlt - uCamPos.y ) / ${f(CLOUD_WEATHER_TILE_M * CLOUD_FARBAND_PERIOD_K)};
	vec2 gradY = cloudSheetGradient( dir, rayDy, uFarBandAlt - uCamPos.y ) / ${f(CLOUD_WEATHER_TILE_M * CLOUD_FARBAND_PERIOD_K)};
	float fb = textureGrad( tWeather, ( pb.xz / ${f(CLOUD_FARBAND_PERIOD_K)} + uFarBandShift ) / ${f(CLOUD_WEATHER_TILE_M)}, gradX, gradY ).b;
	float covB = smoothstep( 1.0 - uFarBand, 1.0 - uFarBand + 0.35, fb ) * smoothstep( fbStart, fbStart + fbFade, horiz );
	if ( covB <= 0.0 ) return none;
	tLayer = tb;
	// slant depth through a thin lumpy deck: opaque at a grazing angle, a veil overhead
	float tauB = covB * 1.6 / max( dir.y, 0.03 );
	float TB = exp( -tauB );
	float sunB = phaseHG( cosT, 0.3 ) * exp( -tauB * 0.5 ) * 2.0 + 0.12;
	vec3 SB = ( uSunRadiance * sunB * 0.5 * uSunGain + uAmbientTop * 0.9 * uAmbientScale ) * uTint;
	return vec4( cloudHaze( SB * ( 1.0 - TB ), 1.0 - TB, tb, dir, 1.0 ), TB );
}
// ---- the cirrus sheet: wind-sheared streaks of ice high over everything, the forward lobe and the 22° halo; the
// contrails ride on the same sheet (2026-10-01)
vec4 cirrusLayer( vec3 dir, float cosT, vec3 rayDx, vec3 rayDy ) {
	vec4 none = vec4( 0.0, 0.0, 0.0, 1.0 );
	if ( ( uCirrus <= 0.0 && uContrails <= 0.0 ) || dir.y <= 0.012 ) return none;
	float tc = ( uCirrusAlt - uCamPos.y ) / dir.y;
	if ( tc <= 0.0 ) return none;
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
		float streak = c1.b * 0.7 + c2.b * 0.3;
		float cEff = clamp( uCirrus * patchC, 0.0, 0.98 );
		float covC = smoothstep( 1.0 - cEff, 1.0 - cEff + 0.55, streak );
		// the fibres modulate gently: a fibrous sheet, not a comb of parallel lines
		float fibres = mix( 0.75, 1.0, c2.a ) * mix( 0.85, 1.0, c1.a );
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
void main() {
	// the history pixel this trace texel refreshes (its slot of the 4 x 4 block), sub-pixel jittered
	vec2 tp = floor( gl_FragCoord.xy );
	vec2 px = tp * ${f(CLOUD_TRACE_DIVISOR)} + uSlot + 0.5 + uSubPixel;
	vec3 dir = cloudViewDir( px / uHistorySize );
	// Take derivatives before the divergent march. Filter at the trace footprint so all sixteen history slots
	// see the same distant features, including during camera motion and the first frames after a cut.
	vec3 rayDx = dFdx( dir ), rayDy = dFdy( dir );
	float bn = blueNoise( tp );
	float jitter = fract( bn + uFrameNoise );
	float cosT = dot( dir, uSunDir );
	vec3 L = vec3( 0.0 );
	float T = 1.0;
	// ---- the slab along the ray (the camera may sit below, inside or above it)
	float dy = dir.y;
	float t0, t1;
	if ( abs( dy ) < 1e-4 ) {
		bool inside = uCamPos.y > uSlabLow && uCamPos.y < uBase + uThick;
		t0 = 0.0; t1 = inside ? ${f(CLOUD_MARCH_MAX_M)} : -1.0;
	} else {
		float ta = ( uSlabLow - uCamPos.y ) / dy;
		float tb = ( uBase + uThick - uCamPos.y ) / dy;
		t0 = max( min( ta, tb ), 0.0 );
		t1 = min( max( ta, tb ), ${f(CLOUD_MARCH_MAX_M)} );
	}
	// round 76: a cellular deck's march ends where the far band (8–11 km) and the haze ramp own the horizon — a low
	// deck's grazing rays otherwise marched it for the whole twenty kilometres (polders at 600 m: 2.3 ms a slot)
	// (round 78: a low stratus deck too — whiteout's 300 m ceiling took the full march; cloudDeckMarch)
	if ( uDeckMarch > 0.0 ) t1 = min( t1, ${f(CLOUD_DECK_MARCH_MAX_M)} );
	if ( t1 > t0 && uCoverage > 0.0 ) {
		float span = t1 - t0;
		// empty-space skipping: a segment up to twelve kilometres is tested at weather taps 450 m apart (jittered)
		// before any march; a clear column costs a few fetches instead of a hundred steps (a front's clear
		// radius, the open sky between masses); a closed deck skips the test
		bool any = true;
		if ( span < 12000.0 && uCoverage < 0.7 ) {
			any = false;
			int taps = int( clamp( span / 450.0, 4.0, 24.0 ) );
			for ( int k = 0; k < 24; k++ ) {
				if ( k >= taps ) break;
				float tk = t0 + span * ( float( k ) + jitter ) / float( taps );
				if ( cloudCoverageAt( cloudColumnXZ( uCamPos + dir * tk ) ) > 0.0 ) { any = true; break; }
			}
		}
		if ( any ) {
			// the phase per octave (Wrenninge 2013 / Hillaire 2016): eccentricity halved per octave
			vec3 phase = vec3( phaseDual( cosT, 0.8 ), phaseDual( cosT, 0.4 ), phaseDual( cosT, 0.2 ) );
			// the Beer–powder term darkens the crevices of the lit face — the face seen with the sun behind the
			// viewer (cos < 0); looking toward the sun the thin edges must glow with the forward lobe instead (the
			// silver lining), so the term fades out there. (71b: the first build had the sign inverted.)
			float powderK = ( 1.0 - smoothstep( -0.25, 0.7, cosT ) ) * ( 1.0 - uStratiform );
			// the ladder scale rotates with the frame like the start offset (a static per-texel scale never averages
			// out of the history and read as a block pattern)
			float lightScale = 0.75 + 0.5 * jitter;
			// (round 76: a cellular deck takes a sheet's stride floor — its structure is the cells', hundreds of metres across)
			float ds0 = clamp( span / ${f(CLOUD_MARCH_STEPS)}, max( ${f(CLOUD_STEP_MIN_M)}, uThick / 40.0 ) * ( 1.0 + 2.5 * max( uStratiform, uCells * 0.8 ) ) * uStepScale, ${f(CLOUD_STEP_MAX_M)} );
			if ( uDebug == 9.0 ) ds0 *= 0.5;
			float t = t0 + ds0 * ( uDebug == 10.0 ? 0.5 : jitter );
			float tAcc = 0.0, wAcc = 0.0;
			int empty = 0;
			float lastLight = -1.0;
			int lit = 0;
			for ( int i = 0; i < ${CLOUD_MARCH_STEPS}; i++ ) {
				if ( t > t1 || T < 0.03 ) break;
				// the stride never falls under the trace texel's footprint (four history pixels: a far bank needs
				// no eight-metre steps — 28 m at 3 km, 83 m at 9 km)
				// (round 76: a deck's grazing far rays stride like a tall slab's — the cells are hundreds of metres across)
				float ds = max( ds0 * ( 1.0 + smoothstep( 3000.0, 9000.0, t ) * ( uThick > 2000.0 || uDeckMarch > 0.0 ? 1.0 : 0.4 ) ), min( t * uPixelAngle * 4.0, ${f(CLOUD_STEP_MAX_M)} ) );
				vec3 p = uCamPos + dir * t;
				vec2 cxz = cloudColumnXZ( p );
				Weather w = cloudWeather( cxz );
				float cellK = w.cov > 0.0 ? cloudCellK( cxz ) : 1.0;
				float dens = w.cov > 0.0 ? cloudDensityK( p, w, true, t * uPixelAngle, cellK ) : 0.0;
				if ( dens > 0.003 ) {
					if ( empty > 0 ) {
						// back onto the fine lattice where the stride met cloud: a boundary found on the coarse
						// stride is the same for neighbouring rays and would terrace the cloud wall
						t -= ds * float( empty ) * 0.5;
						empty = 0;
						continue;
					}
					float hN = clamp( ( p.y - uBase ) / ( uThick * max( w.top, 0.05 ) ), 0.0, 1.0 );
					float sig = dens * uDensity;
					// the light march on every other lit step (its optical depth carries over one fine step: the
					// history averages the alternation away)
					// (none once the ray is nearly opaque — the samples behind carry little weight — and none for the
					// scud under a base, which the deck above shades: a fixed depth of six)
					bool scudPt = p.y < uBase - uHang;
					// inside a front's base deck (a tall slab, the lower third) the two near taps suffice: the deck
					// is dark under its towers whatever the far taps read
					bool shortLadder = uThick > 2000.0 && hN < 0.34;
					if ( scudPt ) lastLight = 6.0;
					else if ( lastLight < 0.0 || ( ( lit & 1 ) == 0 && T > 0.15 ) ) lastLight = uDebug == 3.0 ? 0.0 : cloudLightDepth( p, w, lightScale, shortLadder, cellK );
					lit++;
					float tau = lastLight + sig * 2.0;
					// multiple-scattering octaves: contribution, attenuation and eccentricity halved per octave
					float sun = phase.x * exp( -tau ) + phase.y * 0.5 * exp( -tau * 0.5 ) + phase.z * 0.25 * exp( -tau * 0.25 );
					// Beer–powder: light builds up inside the mass, so the sunlit face's crevices and thin edges
					// read darker than its body
					float powder = mix( 1.0, 1.0 - exp( -sig * 60.0 ), powderK );
					vec3 S = vec3( 0.0 );
					if ( uDeckLight < 1.0 ) {
					// an overcast sheet is lit by the whole sky above it, not by one reddened low sun: its diffused
					// light is the sun's luminance, neutral
					// (71c: half way to neutral on a cumulus too — the light diffused to a base has crossed the whole
					// lit mass and mixed with the sky's; a low sun's colour painted every base brown)
					vec3 sunDiff = mix( uSunRadiance, vec3( luma( uSunRadiance ) ), max( uStratiform, 0.6 ) );
					// the diffusion regime of a thick non-absorbing cloud: diffuse light is transmitted about
					// 1 / (1 + 0.75 (1 - g) tau), so the base of an overcast sheet is bright and the shaded side of a
					// cumulus stays grey, not black; it builds with height in the cloud (the lower parts are darker)
					float msV = mix( 0.35, 1.0, smoothstep( 0.0, 0.5, hN ) );
					// (71b: 0.2 read as a grey cloud — a lit face is a near-white diffuser under the sun's irradiance,
					// E · albedo / π at its skin, decaying into the mass with the diffusion law)
					float diffusion = mix( 0.7, 0.45, uStratiform ) / ( 1.0 + 0.15 * tau ) * msV / ( 4.0 * CL_PI ) * 4.0;
					// darker bases: their direct light is scattered away by the cloud above
					float baseShadow = mix( 0.35, 1.0, smoothstep( -0.1, 0.45, hN ) );
					// ambient: the sky's irradiance lights the tops, the bases see the horizon band and the ground; a
					// stratus sheet is diffuser-lit; the deeper into the mass, the less of either arrives, and the
					// underside of a thick lump is darker than a thin edge (the depth above it)
					float up = smoothstep( 0.0, 0.85, hN );
					float sheet = smoothstep( 0.5, 0.9, uStratiform );
					float tauUp = uDebug == 1.0 ? 0.0 : cloudDepthAbove( p, w );
					// the sky's irradiance on the tops decays with the depth above the point; the base's light arrives
					// from below and the sides (the lower sky, the ground) and does not (71c: attenuating it too left
					// every base near black under a warm diffused sun — the brown of the alpine and coastal masses)
					float upW = max( up, uStratiform * 0.75 );
					// (a cumulonimbus base deck is the exception: its underside is shaded by three kilometres of tower and
					// stays a dark wall — the bottom term decays with the depth above there)
					float cb = smoothstep( 0.55, 0.9, w.type ) * ( 1.0 - sheet );
					vec3 amb = ( uAmbientTop * upW * mix( exp( -tauUp * 0.1 ), 1.0, sheet * 0.6 ) + uAmbientBottom * ( 1.0 - upW ) * mix( 1.0, exp( -tauUp * 0.06 ), cb ) ) * ( 1.0 + sheet * 1.2 );
					amb *= mix( 0.45, 1.0, 1.0 - dens * 0.7 ) * mix( 0.85, 1.15, up );
					// a cloud is lit through by the whole sky: its underside is never much darker than the sky it
					// stands against — a sheet takes the floor whole, a deck or a cumulus by its share, the thick cores
					// a little darker than the thin parts so the mass keeps its relief; the floor carries the sky's
					// cool hue (uSkyMean), so a base reads luminous blue-grey
					// (the cumulus floor sits at a third of the sky mean — 0.85 lifted every base to the lit level and
					// flattened the masses to white — and a cumulonimbus base deck takes half of that: its wall is dark)
					float deckFloor = smoothstep( 0.3, 0.9, uStratiform );
					float floorK = mix( 0.34, 1.25, deckFloor ) * mix( 1.0, 0.35, cb * ( 1.0 - deckFloor ) );
					float floorDecay = mix( 0.04, 0.08, deckFloor );
					amb = max( amb, uSkyMean * floorK * ( 0.5 + 0.5 * exp( -tauUp * floorDecay ) ) );
					amb *= uAmbientScale;
					S = ( ( uSunRadiance * sun * ( 1.0 - 0.7 * uStratiform ) + sunDiff * diffusion ) * powder * baseShadow * uSunGain + amb ) * uTint;
					}
					if ( uDeckLight > 0.0 ) {
						// round 76: the deck lighting. A deck's underside is lit by what the column above it transmits:
						// the sun's irradiance on the top (its colour half way to neutral — the light diffused to the
						// base has mixed with the sky's) plus the sky's, through the diffusion law of a thick
						// non-absorbing cloud, T = 1 / (1 + 0.75 (1 − g) τ) with g 0.85 on the column's optical depth
						// above the point — so the thick cores read dark and the thin borders bright, and the whole
						// deck sits under the clear sky's level instead of on the sky-mean floor that made every sheet
						// a flat white. The sun's own forward glow comes through the slant depth (the disc through a
						// thin sheet as through ground glass; the near taps of the light march keep the lit walls at
						// the breaks). From below, the lower sky and the ground bounce (the map's ambient scale: snow
						// lifts a deck) and, near a column's top, the sky itself.
						float tauAbove = cloudColumnDepthAbove( p, w, cellK );
						// 2026-10-01: the underside's mottle — the deck's rolls and lumps (the shape volume's mid octaves
						// at half the cell period) thicken and thin the column over each point, so a stratocumulus base
						// reads lumpy grey instead of airbrushed (one fetch, the deck rows only)
						if ( uCells > 0.0 ) {
							vec4 mo = texture( tShape, ( vec3( cxz.x, uBase, cxz.y ) + uNoiseShift ) / ( uCellTile * 0.5 ) );
							tauAbove *= mix( 1.0, 0.2 + 1.6 * ( mo.b * 0.6 + mo.a * 0.4 ), 0.75 * uCells );
							// 2026-10-03 (the skies lane): the base's fine mottle — the detail volume's Worley lumps on the base
							// plane (coherent through the column, so the view march keeps them), each lump a thicker, darker
							// column with lighter seams between: a stratocumulus base reads lumpy, not airbrushed
							if ( uLumps > 0.0 ) {
								vec3 dm = texture( tDetail, ( vec3( cxz.x, uBase, cxz.y ) + uNoiseShift * 0.91 ) / ${f(CLOUD_DETAIL_TILE_M)} ).rgb;
								tauAbove *= mix( 1.0, 0.3 + 1.4 * smoothstep( 0.15, 0.85, dm.r * 0.55 + dm.g * 0.3 + dm.b * 0.15 ), uLumps );
							}
						}
						float Tdiff = 1.0 / ( 1.0 + 0.1125 * tauAbove );
						// (the transmitted sun at a third of its physical share: the battlefield skies are exposed for the
						// ground with the horizon band near white, and a physically lit base — a third to a half of a lit
						// top — landed in the tonemap's clipped shoulder as the same white sheet; the sky's share whole)
						vec3 sunTop = mix( uSunRadiance, vec3( luma( uSunRadiance ) ), 0.5 ) * max( uSunDir.y, 0.03 ) * uSunGain;
						vec3 Etop = sunTop * ${f(CLOUD_DECK_SUN_SHARE)} / CL_PI + uSkyIrradiance;
						vec3 Lbase = Etop * Tdiff;
						// the directional term keeps the light march's depth (a lump's flank lit from the side), extended
						// to the plane-parallel slant depth only where the near taps are already inside cloud (a sheet's
						// glow toward the sun follows the whole slant, not the seventy metres the ladder reaches)
						float tauSun = tau + max( tauAbove / max( uSunDir.y, 0.25 ) - lastLight, 0.0 ) * smoothstep( 0.3, 1.5, lastLight );
						float sunD = phase.x * exp( -tauSun ) + phase.y * 0.5 * exp( -tauSun * 0.5 ) + phase.z * 0.25 * exp( -tauSun * 0.25 );
						// the ground bounce: the ground under the deck reflects the transmitted light back up (a grey
						// ground at a quarter, scaled by the map's ambient scale — snow lifts a deck), plus the lower sky
						vec3 ambD = uAmbientBottom * 0.4 * uAmbientScale + Etop * 0.3 * 0.25 * uAmbientScale + uAmbientTop * 0.5 * exp( -tauAbove * 0.7 );
						vec3 Sd = ( uSunRadiance * sunD * powder * uSunGain + Lbase + ambD ) * uTint;
						S = mix( S, Sd, uDeckLight );
					}
					if ( uDebug == 4.0 ) S = vec3( 0.6 );
					// energy-conserving step integration: the in-scatter over the step's own transmittance
					float Tstep = exp( -sig * ds );
					float dT = T * ( 1.0 - Tstep );
					L += S * dT;
					tAcc += t * dT;
					wAcc += dT;
					T *= Tstep;
					t += ds;
				} else if ( ( w.cov <= 0.0 || cellK < 0.08 ) && uDebug != 8.0 ) {
					// clear air between masses (the weather admits no column here, or — round 76 — a deck's open cell
					// border): stride longer until cloud is met
					empty = min( empty + 1, 4 );
					t += ds * ( 1.0 + float( empty ) * 0.5 );
				} else {
					// an eroded pocket inside a mass: one and a half strides, re-entering on the fine lattice — a
					// stride that GREW through a tower's pockets re-entered on a coarse lattice shared by neighbouring
					// rays and terraced its walls into stacked discs (round 71's monsoon variants)
					empty = uDebug == 8.0 ? 0 : 1;
					t += ds * ( uDebug == 8.0 ? 1.0 : 1.5 );
				}
			}
			if ( wAcc > 1e-4 ) {
				float dist = tAcc / wAcc;
				float hAtt = exp( -max( dir.y * dist - ${f(CLOUD_AERIAL.heightRef)}, 0.0 ) / ${f(CLOUD_AERIAL.heightScale)} );
				L = cloudHaze( L, 1.0 - T, dist, dir, hAtt );
			}
		}
	}
	// ---- 2026-10-01: the layered sky. In front of the slab along the horizon rays: a fog bank lying on the sea, then
	// the rain shafts and virga hanging under the base; behind it the far band, then the cirrus sheet with its
	// contrails.
	vec4 acc = vec4( L, T );
	float tRain;
	vec4 fogL = seaFogBank( dir, jitter );
	vec4 rainL = slabRain( dir, cosT, jitter, tRain );
	acc = cloudOver( cloudOver( fogL, rainL ), acc );
	if ( acc.a > 0.01 ) {
		float tB;
		acc = cloudOver( acc, farBandLayer( dir, cosT, rayDx, rayDy, tB ) );
	}
	if ( acc.a > 0.01 ) acc = cloudOver( acc, cirrusLayer( dir, cosT, rayDx, rayDy ) );
	L = acc.rgb;
	T = acc.a;
	gl_FragColor = vec4( max( L, vec3( 0.0 ) ), clamp( T, 0.0, 1.0 ) );
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
	// An unchanged camera reprojects to texel centres, apart from floating-point roundoff. Re-filtering that
	// value on every frame slowly rounds half-float history down and prints the 4 x 4 refresh grid into the sky.
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
	// Accumulate differences so a uniform cloud stays exactly uniform even while the camera moves.
	vec4 centre = texture2D( tHistory, tc12 );
	vec4 delta = ( texture2D( tHistory, vec2( tc12.x, tc0.y ) ) - centre ) * a
		+ ( texture2D( tHistory, vec2( tc0.x, tc12.y ) ) - centre ) * b
		+ ( texture2D( tHistory, vec2( tc3.x, tc12.y ) ) - centre ) * d
		+ ( texture2D( tHistory, vec2( tc12.x, tc3.y ) ) - centre ) * e;
	return centre + delta / ( a + b + c + d + e );
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
		// Centre the bounds on this history pixel, not its 4 x 4 refresh block.
		// A block-constant clamp cuts smooth reprojected cloud rims into square steps.
		// The same nine taps interpolate continuously; trace resolution/cost stays unchanged.
		vec2 traceUv = ( ( p - uSlot ) / ${f(CLOUD_TRACE_DIVISOR)} + 0.5 ) / uTraceSize;
		for ( int y = -1; y <= 1; y++ ) for ( int x = -1; x <= 1; x++ ) {
			vec4 s = texture2D( tTrace, traceUv + vec2( x, y ) / uTraceSize );
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
		outv = ( valid && uRebuildK < 0.0 ) ? outv + ( cur - outv ) * a : cur;
	} else if ( uRebuildK >= 0.0 && valid ) {
		// rebuilding: pixels without a sample of their own since the cut average the upsampled samples of
		// every slot traced so far (their refresh rank is the Bayer index)
		if ( bayerRank( cell ) > uRebuildK ) outv += ( upsampled( p ) - outv ) / ( uRebuildK + 1.0 );
	}
	gl_FragColor = vec4( max( outv.rgb, vec3( 0.0 ) ), clamp( outv.a, 0.0, 1.0 ) );
}`;

/** QA: the history copied to an 8-bit target for a readback (the transmittance in alpha, the radiance clamped). */
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

/** Cover the current shadow camera directly. A world-space plane placed at
 * its previous near clip can cut across the next cascade during camera motion. */
const GOBO_VERTEX = /* glsl */`
varying vec2 vXZ;
uniform mat4 uShadowWorld;
uniform vec4 uShadowBounds;
uniform float uCloudBase;
void main() {
	vec2 q = position.xy + 0.5;
	vec3 p = (uShadowWorld * vec4(mix(uShadowBounds.x, uShadowBounds.y, q.x),
		mix(uShadowBounds.z, uShadowBounds.w, q.y), -1.5, 1.0)).xyz;
	vec3 direction = -uShadowWorld[2].xyz;
	vXZ = p.xz + direction.xz * ((uCloudBase - p.y) / direction.y);
	gl_Position = vec4(position.xy * 2.0, -0.999999, 1.0);
}`;

const GOBO_FRAGMENT = /* glsl */`
precision highp float;
${CLOUD_FIELD_GLSL}
uniform float uThreshold;
uniform vec2 uShadowCellOrigin;
uniform vec3 uClear;
varying vec2 vXZ;
void main() {
	vec4 w, st;
	// A binary weather cutoff stamped polygonal shadows onto open beaches.
	// World-anchored coverage gives PCF a soft, translucent cloud edge. A
	// screen-space pattern changes phase whenever a cascade moves.
	float shade = ${f(CLOUD_SHADOW_CORE)} * smoothstep( uThreshold - 0.08, uThreshold + 0.08, cloudField( vXZ, w, st ) );
	// 2026-10-01: a front's clear radius holds its towers off the camera (the trace's own law), so no cloud stands
	// over the sky it keeps open and none may shade the ground under it (xy = the camera's xz, z = the radius)
	if ( uClear.z > 0.0 ) shade *= smoothstep( uClear.z * 0.6, uClear.z * 1.4, length( vXZ - uClear.xy ) );
	vec2 cell = mod( floor( gl_FragCoord.xy ) + uShadowCellOrigin, 256.0 );
	float dither = fract( 52.9829189 * fract( dot( cell, vec2( 0.06711056, 0.00583715 ) ) ) );
	if ( dither >= shade ) discard;
	gl_FragColor = vec4( 1.0 );
}`;

/** 2026-10-03: the far cloud shade — the gobos' shade, undithered, over the square around the camera (post.ts samples it). */
const FAR_SHADE_FRAGMENT = /* glsl */`
precision highp float;
${CLOUD_FIELD_GLSL}
uniform float uThreshold;
uniform vec3 uClear;
uniform vec3 uFarShadeRect;
varying vec2 vUv;
void main() {
	vec2 xz = uFarShadeRect.xy + ( vUv - 0.5 ) * uFarShadeRect.z;
	vec4 w, st;
	float shade = ${f(CLOUD_SHADOW_CORE)} * smoothstep( uThreshold - 0.08, uThreshold + 0.08, cloudField( xz, w, st ) );
	if ( uClear.z > 0.0 ) shade *= smoothstep( uClear.z * 0.6, uClear.z * 1.4, length( xz - uClear.xy ) );
	gl_FragColor = vec4( shade, 0.0, 0.0, 1.0 );
}`;

interface CloudNoiseTextures {
  shape: THREE.Data3DTexture | null;
  detail: THREE.Data3DTexture | null;
  curl: THREE.Data3DTexture | null;
  weather: THREE.DataTexture | null;
  streets: THREE.DataTexture | null;
  blue: THREE.DataTexture | null;
}

/** The bake buffers as the worker posts them (or the synchronous fallback bakes them). */
export type CloudNoiseUpload = Partial<Record<CloudNoiseKind, Uint8Array>>;

interface CascadeLightLike {
  position: THREE.Vector3;
  shadow: { camera: THREE.OrthographicCamera; mapSize: THREE.Vector2 };
}

/** Each coverage mask belongs to one shadow map. Overlapping masks from
 * other cascades would multiply the translucent cloud's occlusion. */
export function cloudShadowCellOrigin(min: number, inverseTranslation: number, span: number, pixels: number): number {
  return ((Math.round((min - inverseTranslation) * pixels / span) % 256) + 256) % 256;
}

export function bindCloudShadowCascade(gobo: THREE.Mesh, shadowCamera: THREE.OrthographicCamera, mapSize: THREE.Vector2): void {
  const before = gobo.onBeforeShadow, after = gobo.onAfterShadow;
  gobo.onBeforeShadow = function (renderer, object, camera, current, geometry, material, group) {
    before.call(this, renderer, object, camera, current, geometry, material, group);
    geometry.setDrawRange(0, current === shadowCamera ? 6 : 0);
    const depth = material as THREE.ShaderMaterial;
    const origin = depth.uniforms?.uShadowCellOrigin?.value as THREE.Vector2 | undefined;
    if (current === shadowCamera && origin) {
      // The shadow renderer has just updated this camera. Anchor coverage to
      // its absolute integer light-space cells, including during raw renders
      // that do not advance the cloud layer or its gobo transforms.
      const m = shadowCamera.matrixWorldInverse.elements;
      origin.set(cloudShadowCellOrigin(shadowCamera.left, m[12], shadowCamera.right - shadowCamera.left, mapSize.x),
        cloudShadowCellOrigin(shadowCamera.bottom, m[13], shadowCamera.top - shadowCamera.bottom, mapSize.y));
      (depth.uniforms.uShadowWorld.value as THREE.Matrix4).copy(shadowCamera.matrixWorld);
      (depth.uniforms.uShadowBounds.value as THREE.Vector4).set(shadowCamera.left, shadowCamera.right,
        shadowCamera.bottom, shadowCamera.top);
      depth.uniformsNeedUpdate = true;
    }
  };
  gobo.onAfterShadow = function (renderer, object, camera, current, geometry, material, group) {
    geometry.setDrawRange(0, Infinity);
    after.call(this, renderer, object, camera, current, geometry, material, group);
  };
}

/** What the layer needs of the CSM: its lights (per cascade) and the from-sun direction. */
export interface CloudShadowCascades {
  lights: readonly CascadeLightLike[];
  lightDirection: THREE.Vector3;
}

/** QA: one readback of the history (bottom-up rows, RGBA8: the radiance clamped, alpha = transmittance). */
interface CloudHistoryReadback {
  width: number;
  height: number;
  rgba: Uint8Array;
}

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
  private readonly goboMaterial: THREE.ShaderMaterial;
  private readonly farShadeMaterial: THREE.ShaderMaterial;
  private farShadeTarget: THREE.WebGLRenderTarget | null = null;
  private farShadeAge = Infinity;
  private farShadeValid = false;
  private readonly farShadeInfo = { texture: null as THREE.Texture | null, rect: new THREE.Vector3(), baseM: 1400 };
  private copyMaterial: THREE.ShaderMaterial | null = null;
  private copyTarget: THREE.WebGLRenderTarget | null = null;
  private history: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private trace: THREE.WebGLRenderTarget;
  private historyIndex = 0;
  private historyValid = false;
  private targetWidth = 0;
  private targetHeight = 0;
  private readonly noise: CloudNoiseTextures = { shape: null, detail: null, curl: null, weather: null, streets: null, blue: null };
  private preset: CloudLayerPreset | null = null;
  private presetKey = '';
  private readonly weatherShift = new THREE.Vector2();
  private readonly noiseShift = new THREE.Vector3();
  private readonly cirrusShift = new THREE.Vector2();
  private readonly upperDrift = new THREE.Vector2();
  /** 2026-10-02: the aerial pass's haze-layer datum (the ground under the camera, post.ts uHazeDatum); NaN until a frame passes it. */
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
  private context: ReturnType<THREE.WebGLRenderer['getContext']> | null = null;
  private rendererInfo: THREE.WebGLRenderer['info'] | null = null;
  private cascades: CloudShadowCascades | null = null;
  private gobos: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly scratch = new THREE.Vector3();
  private readonly irr = new THREE.Color();
  private readonly hz = new THREE.Color();
  private readonly zenith = new THREE.Color();
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
  /** QA: isolate a term (0 = off; 1 no depth-above, 2 no erosion, 3 no light march, 4 flat density); the history re-keys on a change. */
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
    this.trace = makeTarget(1, 1, 'clouds-trace');
    const common = () => ({
      uCamPos: { value: new THREE.Vector3() }, uCamRight: { value: new THREE.Vector3(1, 0, 0) }, uCamUp: { value: new THREE.Vector3(0, 1, 0) },
      uCamFwd: { value: new THREE.Vector3(0, 0, -1) }, uCamTan: { value: new THREE.Vector2(1, 1) },
      uHistorySize: { value: new THREE.Vector2(4, 4) }, uTraceSize: { value: new THREE.Vector2(1, 1) },
      uBase: { value: 620 }, uThick: { value: 400 },
    });
    const field = () => ({
      tWeather: { value: null }, tStreets: { value: null }, uWeatherShift: { value: new THREE.Vector2() }, uStreetShift: { value: new THREE.Vector2() },
      uWindDir: { value: new THREE.Vector2(1, 0) }, uStreets: { value: 0 }, uFieldMix: { value: 0 },
    });
    this.traceMaterial = new THREE.ShaderMaterial({
      name: 'VolumetricCloudTrace', vertexShader: QUAD_VERTEX, fragmentShader: TRACE_FRAGMENT, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      uniforms: {
        ...common(), ...field(),
        tAtmoSky: { value: null }, uAtmoSun: { value: new THREE.Vector3(0, 1, 0) }, uAtmoViewH: { value: ATMO_GROUND_KM + 0.05 },
        uAtmoKnee: { value: knee }, uAtmoIntensity: { value: 1 },
        tShape: { value: null }, tDetail: { value: null }, tCurl: { value: null }, tBlue: { value: null },
        uSlot: { value: new THREE.Vector2() }, uSubPixel: { value: new THREE.Vector2() }, uFrameNoise: { value: 0 }, uHazeDatum: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunRadiance: { value: new THREE.Vector3(8, 8, 8) },
        uAmbientTop: { value: new THREE.Vector3(0.3, 0.4, 0.6) }, uAmbientBottom: { value: new THREE.Vector3(0.2, 0.25, 0.3) },
        uSkyMean: { value: new THREE.Vector3(0.3, 0.35, 0.45) },
        uCoverage: { value: 0.4 }, uTowers: { value: 0 }, uStratiform: { value: 0.1 }, uDensity: { value: 0.07 },
        uTint: { value: new THREE.Vector3(1, 1, 1) }, uNoiseShift: { value: new THREE.Vector3() },
        uShapeTile: { value: CLOUD_SHAPE_TILE_M }, uSunGain: { value: 1 }, uAmbientScale: { value: 1 }, uClearRadius: { value: 0 }, uPixelAngle: { value: 0.002 },
        uVertScale: { value: 1.4 },
        uTypeRange: { value: new THREE.Vector2(0.3, 0.6) }, uAnvil: { value: 0 }, uWispiness: { value: 0.3 }, uShearM: { value: 0 },
        uScud: { value: 0 }, uSlabLow: { value: 620 },
        uCirrus: { value: 0 }, uCirrusDir: { value: new THREE.Vector2(1, 0) }, uCirrusAlt: { value: 10000 }, uCirrusShift: { value: new THREE.Vector2() }, uCirrusDensity: { value: 0.7 },
        uFarBand: { value: 0 }, uFarBandAlt: { value: 2000 }, uFarBandShift: { value: new THREE.Vector2() },
        uStepScale: { value: 1 }, uDebug: { value: 0 },
        uCells: { value: 0 }, uDeckMarch: { value: 0 }, uCellTile: { value: 4800 }, uDeckLight: { value: 0 }, uUndulatus: { value: 0 }, uInterior: { value: 0 }, uLumps: { value: 0 },
        uSkyIrradiance: { value: new THREE.Vector3(0.3, 0.4, 0.6) }, uHang: { value: 0 },
        // 2026-10-01: the weather layers beyond the slab (cloudWeatherLayers.ts)
        ...createCloudWeatherUniforms(),
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
    this.goboMaterial = new THREE.ShaderMaterial({
      name: 'VolumetricCloudGobo', vertexShader: GOBO_VERTEX, fragmentShader: GOBO_FRAGMENT, side: THREE.DoubleSide,
      uniforms: { ...field(), uThreshold: { value: 0.5 }, uShadowCellOrigin: { value: new THREE.Vector2() }, uClear: { value: new THREE.Vector3() },
        uShadowWorld: { value: new THREE.Matrix4() }, uShadowBounds: { value: new THREE.Vector4() }, uCloudBase: { value: 1400 } },
    });
    // the far shade reads the gobos' own uniform objects (the field, its drift, the cut, the front's clear radius)
    const gu = this.goboMaterial.uniforms;
    this.farShadeMaterial = new THREE.ShaderMaterial({
      name: 'VolumetricCloudFarShade', vertexShader: QUAD_VERTEX, fragmentShader: FAR_SHADE_FRAGMENT,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      uniforms: {
        tWeather: gu.tWeather, tStreets: gu.tStreets, uWeatherShift: gu.uWeatherShift, uStreetShift: gu.uStreetShift,
        uWindDir: gu.uWindDir, uStreets: gu.uStreets, uFieldMix: gu.uFieldMix, uThreshold: gu.uThreshold, uClear: gu.uClear,
        uFarShadeRect: { value: new THREE.Vector3(0, 0, CLOUD_FAR_SHADE_SPAN_M) },
      },
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
    // the same shell as the baked cumulus deck: horizon-grazing rays from any battle camera hit it, the
    // terrain and the ring occlude the rest; AO's prepass ignores it like the decks
    // (2026-10-01: the whole sphere — a camera in or over a low deck composites the cloud below the horizon too; from
    // the ground the lower half sits behind the terrain and fails the depth test before shading)
    const geometry = new THREE.SphereGeometry(CLOUD_DOME_RADIUS_M, 48, 32, 0, Math.PI * 2, 0, Math.PI);
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
    return !!this.preset && this.noiseReady && this.atmosphere.active;
  }

  get noiseReady(): boolean {
    const n = this.noise;
    return !!n.shape && !!n.detail && !!n.curl && !!n.weather && !!n.streets && !!n.blue;
  }

  /** The current preset (null = the baked decks show). */
  get currentPreset(): CloudLayerPreset | null { return this.preset; }

  setPreset(preset: CloudLayerPreset | null): void {
    const key = preset ? cloudLayerKey(preset) : '';
    if (key !== this.presetKey) {
      this.presetKey = key;
      this.resetHistory();
      // the weather layers' placement (storm cells, trails) is static per preset: resolved once, never per frame
      if (preset) applyCloudWeatherPreset(this.traceMaterial.uniforms, preset);
    }
    this.preset = preset;
    this.updateGoboMaterials();
  }

  /** Upload whichever bakes arrived (each once). */
  setNoise(upload: CloudNoiseUpload): void {
    const n = this.noise;
    if (upload.shape && !n.shape) n.shape = makeVolume(upload.shape, CLOUD_SHAPE_SIZE, 'clouds-shape');
    if (upload.detail && !n.detail) n.detail = makeVolume(upload.detail, CLOUD_DETAIL_SIZE, 'clouds-detail');
    if (upload.curl && !n.curl) n.curl = makeVolume(upload.curl, CLOUD_CURL_SIZE, 'clouds-curl');
    if (upload.weather && !n.weather) n.weather = makeWeather(upload.weather, CLOUD_WEATHER_SIZE, 'clouds-weather');
    if (upload.streets && !n.streets) n.streets = makeWeather(upload.streets, CLOUD_WEATHER_SIZE, 'clouds-streets');
    if (upload.blue && !n.blue) n.blue = makeWeather(upload.blue, CLOUD_BLUE_SIZE, 'clouds-blue', THREE.NearestFilter);
    const u = this.traceMaterial.uniforms;
    u.tShape.value = n.shape;
    u.tDetail.value = n.detail;
    u.tCurl.value = n.curl;
    u.tWeather.value = n.weather;
    u.tStreets.value = n.streets;
    u.tBlue.value = n.blue;
    const g = this.goboMaterial.uniforms;
    g.tWeather.value = n.weather;
    g.tStreets.value = n.streets;
    this.updateGoboMaterials();
  }

  /** Forget the history: the next frames rebuild it at four slots a frame. */
  resetHistory(): void {
    this.rebuild = 0;
    this.since = 0;
    this.historyValid = false;
  }

  /** The CSM lights whose cascades carry the cloud shadows (one plane each on the shadow-only layer, discarding by the cloud field). */
  attachShadowCascades(cascades: CloudShadowCascades): void {
    if (this.cascades === cascades) return;
    this.detachShadowCascades();
    this.cascades = cascades;
    for (let i = 0; i < cascades.lights.length; i++) {
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false, depthWrite: false });
      const geometry = new THREE.PlaneGeometry(1, 1);
      const gobo = new THREE.Mesh(geometry, material);
      gobo.name = `cloudShadowGobo${i}`;
      gobo.castShadow = true;
      gobo.receiveShadow = false;
      gobo.frustumCulled = false;
      gobo.visible = false;
      // the shadow pass renders the plane with the field material: the same two weather fields the trace reads
      gobo.customDepthMaterial = this.goboMaterial;
      bindCloudShadowCascade(gobo, cascades.lights[i].shadow.camera, cascades.lights[i].shadow.mapSize);
      markShadowOnly(gobo);
      // round 78: the plane is sized to cascade i's shadow box and carries the field only there — the router
      // hides it around every other cascade's pass (one field-shader draw per cascade instead of one per pair)
      setShadowCasterCascades(gobo, 1 << i);
      this.scene.add(gobo);
      this.gobos.push(gobo);
    }
    this.updateGoboMaterials();
  }

  private detachShadowCascades(): void {
    for (const gobo of this.gobos) {
      setShadowCasterCascades(gobo, null);
      gobo.removeFromParent();
      gobo.geometry.dispose();
      gobo.material.dispose();
    }
    this.gobos = [];
    this.cascades = null;
  }

  private updateGoboMaterials(): void {
    const preset = this.preset;
    const g = this.goboMaterial.uniforms;
    g.uThreshold.value = preset ? preset.shadowThreshold : 0.5;
    g.uCloudBase.value = preset?.baseM ?? 1400;
    g.uStreets.value = preset ? preset.streets : 0;
    g.uFieldMix.value = preset ? preset.fieldMix : 0;
  }

  /** Whether the cascades carry cloud shadows this frame. */
  get shadowsActive(): boolean {
    return this.active && !!this.preset?.shadow && this.gobos.length > 0 && this.preset.coverage > 0;
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
    // a cirrus-only sky anchors its reprojection on the cirrus sheet
    const slabOnly = preset.coverage > 0;
    const base = slabOnly ? preset.baseM : preset.cirrusAltM, thick = slabOnly ? preset.thicknessM : 200;
    t.uBase.value = base;
    t.uThick.value = thick;
    // round 76: a deck's cell cores hang under the base by this much (the march starts at the hang)
    const hang = CLOUD_DECK_HANG_K * preset.thicknessM * preset.cells;
    t.uHang.value = hang;
    t.uCells.value = preset.cells;
    t.uDeckMarch.value = cloudDeckMarch(preset);
    t.uCellTile.value = preset.cellM * CLOUD_CELLS_PER_TILE;
    t.uDeckLight.value = preset.deckLight;
    t.uUndulatus.value = preset.undulatus;
    t.uInterior.value = preset.interior;
    t.uLumps.value = preset.lumps ?? 0;
    // the scud band never reaches down past the lower half of the base altitude (a 300 m ceiling's rags stay aloft)
    t.uSlabLow.value = Math.min(preset.baseM - hang, preset.scud > 0 ? Math.max(preset.baseM * 0.45, preset.baseM - CLOUD_SCUD_BAND_M) : preset.baseM);
    t.uCoverage.value = preset.coverage;
    t.uTowers.value = preset.towers;
    t.uStratiform.value = preset.stratiform;
    t.uDensity.value = preset.density;
    (t.uTint.value as THREE.Vector3).set(...preset.tint);
    // (round 76: a cellular deck's billows follow its cells' scale — the shape period tends to the cell period)
    t.uShapeTile.value = THREE.MathUtils.lerp(THREE.MathUtils.lerp(CLOUD_SHAPE_TILE_M, CLOUD_SHAPE_TILE_STRATUS_M, preset.stratiform), preset.cellM * CLOUD_CELLS_PER_TILE, preset.cells);
    t.uClearRadius.value = preset.clearRadiusM;
    t.uFieldMix.value = preset.fieldMix;
    // a thin slab compresses the shape's vertical axis (billows as tall as wide); a tall slab stretches it (a
    // tower's cells are taller than wide, and a kilometre period stacked three times over a storm slab read as layers)
    // (71b: a tall slab samples the volume isotropically — stretched 2.2 x it read as vertical smears)
    t.uVertScale.value = THREE.MathUtils.clamp(450 / Math.max(1, preset.thicknessM), 1.0, 1.4);
    (t.uTypeRange.value as THREE.Vector2).set(preset.typeRange[0], preset.typeRange[1]);
    t.uAnvil.value = preset.anvil;
    t.uWispiness.value = preset.wispiness;
    t.uShearM.value = preset.shearM;
    t.uStreets.value = preset.streets;
    t.uScud.value = preset.scud;
    t.uSunGain.value = preset.sunGain;
    t.uAmbientScale.value = preset.ambientScale;
    t.uCirrus.value = preset.cirrus;
    (t.uCirrusDir.value as THREE.Vector2).set(Math.cos(preset.cirrusAngleRad), Math.sin(preset.cirrusAngleRad));
    t.uCirrusAlt.value = preset.cirrusAltM;
    t.uCirrusDensity.value = preset.cirrusDensity;
    t.uFarBand.value = preset.farBand;
    t.uFarBandAlt.value = preset.farBandAltM;
    (t.uWindDir.value as THREE.Vector2).copy(this.windDir);
    const r = this.resolveMaterial.uniforms;
    r.uBase.value = base;
    r.uThick.value = thick;
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
    // 2026-10-01: the key light's hue on the clouds — white by day (the transmittance colours the sun), the moonlight's at night
    const key = this.preset?.keyTint;
    if (key) (t.uSunRadiance.value as THREE.Vector3).multiply(this.scratch.set(key[0], key[1], key[2]));
    // 2026-10-01: the summary is read with the preset's sky intensity applied (atmosphere.ts update(params, skyIntensity)),
    // and the composite multiplies the clouds by it once more: undo it here so the ambient is dimmed once, like the
    // sun. At night (.08) the twice-dimmed sky light left every face turned from the moon black — the round-68
    // "black occluders"; a day sky (1) is unchanged.
    const undim = 1 / Math.max(1e-3, a.skyIntensity);
    // ambient: the cosine-weighted sky irradiance / π (a diffuse top under the whole sky), the base sees the
    // horizon band and the ground
    const irrSrc = summary?.irradiance ?? a.irradiance;
    const irr = this.irr.setRGB(irrSrc.r * undim, irrSrc.g * undim, irrSrc.b * undim);
    (t.uAmbientTop.value as THREE.Vector3).set(irr.r, irr.g, irr.b).multiplyScalar(0.55);
    // round 76: the deck lighting takes the sky's irradiance on a horizontal diffuser whole (the summary's E / π)
    (t.uSkyIrradiance.value as THREE.Vector3).set(irr.r, irr.g, irr.b);
    const hzSrc = summary?.horizon ?? irrSrc;
    const hz = this.hz.setRGB(hzSrc.r * undim, hzSrc.g * undim, hzSrc.b * undim);
    const stratiform = this.preset?.stratiform ?? 0;
    // cumulus bases see the horizon band and the ground; an overcast sheet's base is lit through the sheet by
    // the whole sky, so it takes the sky irradiance's cool hue, never the low sun's warm band
    // (71c: the base term leads with the sky irradiance's cool hue — 0.22 of it — over 0.08 of the horizon band;
    // under a low sun the band alone painted the shaded bases tan, and a base is lit by the whole lower sky)
    (t.uAmbientBottom.value as THREE.Vector3).set(irr.r, irr.g, irr.b).multiplyScalar(0.22)
      .addScaledVector(this.scratch.set(hz.r, hz.g, hz.b), 0.08)
      .lerp(this.scratch.set(irr.r, irr.g, irr.b).multiplyScalar(0.42), stratiform);
    // 2026-10-01: a lit town's glow on the bases at night (the preset scales it by the night amount: zero by day)
    const glow = this.preset?.groundGlow;
    if (glow && (glow[0] > 0 || glow[1] > 0 || glow[2] > 0)) {
      (t.uAmbientBottom.value as THREE.Vector3).addScaledVector(this.scratch.set(glow[0], glow[1], glow[2]), CLOUD_GROUND_GLOW_K);
    }
    // the stratus floor: the brighter of the horizon band's and the mean upper sky's luminance — the sky a far
    // ceiling replaces at the skyline is the horizon band, the brightest of a hazy sky — in a hue half way from
    // the zenith's (cool) to neutral: an arctic white-out ceiling, never the band's tan
    const hl = Math.max(1e-4, 0.2126 * hz.r + 0.7152 * hz.g + 0.0722 * hz.b);
    const mean = summary ? summary.meanLuminance * undim : hl;
    const floorLum = Math.max(hl, mean);
    const zSrc = summary?.zenith ?? irrSrc;
    const zenith = this.zenith.setRGB(zSrc.r * undim, zSrc.g * undim, zSrc.b * undim);
    const zl = Math.max(1e-4, 0.2126 * zenith.r + 0.7152 * zenith.g + 0.0722 * zenith.b);
    (t.uSkyMean.value as THREE.Vector3).set(zenith.r, zenith.g, zenith.b).multiplyScalar(floorLum / zl)
      .lerp(this.scratch.set(floorLum, floorLum, floorLum), 0.5);
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

  /** The draw hook supplies the current shadow projection, including when
   * the scene is rendered directly without advancing the cloud animation. */
  private updateGobos(_preset: CloudLayerPreset): void {
    const cascades = this.cascades;
    const show = this.shadowsActive;
    if (!cascades) return;
    const dir = cascades.lightDirection;
    for (let i = 0; i < this.gobos.length; i++) {
      const gobo = this.gobos[i];
      const light = cascades.lights[i];
      if (!light || !show || Math.abs(dir.y) < 0.02) { gobo.visible = false; continue; }
      gobo.visible = true;
    }
  }

  /**
   * post.ts's hook, before the scene draws: advance the wind, detect a camera cut, trace this frame's slot(s)
   * and resolve the history the dome composites. `width` × `height` is the scene target.
   */
  /**
   * @param hazeDatum the aerial pass's haze-layer datum (post.ts uHazeDatum: the ground under the camera); a call
   * without it (the Studio's and the captures' settle) keeps the last one the frame passed
   */
  beforeSceneRender(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, dt: number, width: number, height: number, hazeDatum?: number): void {
    if (hazeDatum !== undefined && Number.isFinite(hazeDatum)) this.hazeDatum = hazeDatum;
    const preset = this.preset;
    if (!preset || !this.active || renderer !== this.renderer) {
      this.dome.visible = false;
      for (const gobo of this.gobos) gobo.visible = false;
      this.farShadeValid = false;
      return;
    }
    this.refreshLifetime();
    if (this.context?.isContextLost()) { this.dome.visible = false; return; }
    if (width !== this.targetWidth || height !== this.targetHeight) this.resize(width, height);
    // wind drift, bounded to the weather tile (every noise tiles within it); the street field drifts in the
    // wind frame, the cirrus sheet at twice the speed along its own streaks
    const step = Math.max(0, Math.min(0.1, dt || 0));
    const wdx = Math.cos(preset.windDirRad), wdz = Math.sin(preset.windDirRad);
    this.windDir.set(wdx, wdz);
    const wx = wdx * preset.windSpeed * step, wz = wdz * preset.windSpeed * step;
    const shift = this.weatherShift;
    shift.x = wrapDrift(shift.x - wx, CLOUD_WEATHER_TILE_M);
    shift.y = wrapDrift(shift.y - wz, CLOUD_WEATHER_TILE_M);
    const ns = this.noiseShift;
    ns.x = wrapDrift(ns.x - wx * 0.8, CLOUD_SHAPE_TILE_STRATUS_M);
    ns.z = wrapDrift(ns.z - wz * 0.8, CLOUD_SHAPE_TILE_STRATUS_M);
    // 2026-10-01: the billows boil — the noise rises slowly through a convective cloud (a deck's cells turn over
    // slower), so a cumulus' outline changes over minutes instead of sliding past as a frozen sculpture (wrapped at the
    // upper drifts' 600 km: the vertical period of the lookups follows the slab's thickness, so any wrap is a seam —
    // this one comes after 238 hours)
    ns.y = wrapDrift(ns.y - CLOUD_BOIL_M_PER_S * (1 - 0.8 * preset.stratiform) * step, CLOUD_UPPER_WRAP_M);
    const cs = this.cirrusShift;
    cs.x = wrapDrift(cs.x - preset.windSpeed * 2 * step, CLOUD_CIRRUS_TILE_M);
    // 2026-10-01: the contrails ride the upper wind (the cirrus' veered direction, twice the speed), wrapped at 600 km —
    // a whole number of the fibres' 30 km tiles and far past any match: the analytic trails never jump while a battle runs
    const ux = Math.cos(preset.cirrusAngleRad), uz = Math.sin(preset.cirrusAngleRad);
    const ud = this.upperDrift;
    ud.x = wrapDrift(ud.x - ux * preset.windSpeed * 2 * step, CLOUD_UPPER_WRAP_M);
    ud.y = wrapDrift(ud.y - uz * preset.windSpeed * 2 * step, CLOUD_UPPER_WRAP_M);
    const t = this.traceMaterial.uniforms, g = this.goboMaterial.uniforms;
    const offX = preset.offset[0] * CLOUD_WEATHER_TILE_M, offY = preset.offset[1] * CLOUD_WEATHER_TILE_M;
    // the drift in the wind frame: the streets ride along the wind (the shift projected onto it) plus the map's offset
    const streetShiftX = shift.x * wdx + shift.y * wdz + offX * 0.73, streetShiftY = -shift.x * wdz + shift.y * wdx + offY * 0.37;
    for (const u of [t, g]) {
      (u.uWeatherShift.value as THREE.Vector2).set(shift.x + offX, shift.y + offY);
      (u.uStreetShift.value as THREE.Vector2).set(streetShiftX, streetShiftY);
      (u.uWindDir.value as THREE.Vector2).copy(this.windDir);
    }
    (t.uNoiseShift.value as THREE.Vector3).copy(ns);
    (t.uCirrusShift.value as THREE.Vector2).set(cs.x + offX * 1.9, offY * 2.3);
    (t.uFarBandShift.value as THREE.Vector2).set(shift.x * 0.5 + offX * 1.37, shift.y * 0.5 + offY * 0.61);
    // (the trails drift by the upper wind in world space; their placement is relative to the map's origin, never wrapped
    // across their own length — the drift wraps at the cirrus tile, far past the ±26 km the trails span)
    (t.uUpperDrift.value as THREE.Vector2).copy(ud);
    // (no datum yet: the camera stands on the layer's base, the haze law of a camera on the ground)
    t.uHazeDatum.value = Number.isFinite(this.hazeDatum) ? this.hazeDatum : camera.position.y;
    this.applyPresetUniforms(preset);
    this.applyAtmosphereUniforms();
    // the low quality preset marches coarser (the same slab, fewer steps); the mobile tier never creates the layer
    t.uStepScale.value = CLOUD_STEP_SCALE_BY_PRESET[resolvePresetName()] ?? 1;
    if (t.uDebug.value !== this.debugMode) { t.uDebug.value = this.debugMode; this.resetHistory(); }

    // camera frame; cuts (teleports, big turns, zooms) rebuild the history at four slots a frame
    const P = this.prevCam, C = this.cam;
    P.pos.copy(C.pos); P.right.copy(C.right); P.up.copy(C.up); P.fwd.copy(C.fwd); P.tan.copy(C.tan);
    this.captureCamera(camera);
    if (this.hasPrev) {
      const moved = C.pos.distanceTo(P.pos);
      const turned = C.fwd.angleTo(P.fwd);
      if (cloudCameraCut(moved, turned, P.tan.y, C.tan.y)) { this.resetHistory(); this.cuts++; }
    } else {
      this.resetHistory();
    }
    this.hasPrev = true;
    (g.uClear.value as THREE.Vector3).set(C.pos.x, C.pos.z, preset.clearRadiusM);
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
    // 2026-10-01: a camera in or over the slab sees the cloud in front of the terrain (no depth test, no horizon mask)
    const inside = C.pos.y > (t.uSlabLow.value as number) ? 1 : 0;
    this.domeMaterial.uniforms.uInside.value = inside;
    if (this.domeMaterial.depthTest === !!inside) this.domeMaterial.depthTest = !inside;
    this.updateGobos(preset);
    this.updateFarShade(preset);
    this.updateLightning(preset, step);
  }

  /**
   * 2026-10-03: the far cloud shade (CLOUD_FAR_SHADE_* note) — re-rendered when its texel-snapped square moves or every
   * CLOUD_FAR_SHADE_EVERY frames; off (null for post.ts) where the clouds cast no shadows.
   */
  private updateFarShade(preset: CloudLayerPreset): void {
    if (!preset.shadow || preset.coverage <= 0) { this.farShadeValid = false; return; }
    const texel = CLOUD_FAR_SHADE_SPAN_M / CLOUD_FAR_SHADE_SIZE;
    const cx = Math.round(this.cam.pos.x / texel) * texel, cz = Math.round(this.cam.pos.z / texel) * texel;
    const rect = this.farShadeInfo.rect;
    const moved = !this.farShadeValid || rect.x !== cx || rect.y !== cz;
    if (!moved && ++this.farShadeAge < CLOUD_FAR_SHADE_EVERY) return;
    if (!this.farShadeTarget) {
      this.farShadeTarget = makeTarget(CLOUD_FAR_SHADE_SIZE, CLOUD_FAR_SHADE_SIZE, 'clouds-far-shade', THREE.UnsignedByteType);
    }
    rect.set(cx, cz, CLOUD_FAR_SHADE_SPAN_M);
    (this.farShadeMaterial.uniforms.uFarShadeRect.value as THREE.Vector3).copy(rect);
    this.renderQuad(this.farShadeMaterial, this.farShadeTarget);
    this.farShadeInfo.texture = this.farShadeTarget.texture;
    this.farShadeInfo.baseM = preset.baseM;
    this.farShadeAge = 0;
    this.farShadeValid = true;
  }

  /**
   * 2026-10-03: the far cloud shade for the aerial pass (post.ts): the map (r = the share of the sun a cloud takes, as
   * the gobos dither it), its square (centre x, z and side, m) and the cloud base it was cut at (m); null where the
   * clouds cast no shadows this frame.
   */
  get farShade(): { readonly texture: THREE.Texture; readonly rect: THREE.Vector3; readonly baseM: number } | null {
    const info = this.farShadeInfo;
    return this.active && this.farShadeValid && info.texture && this.preset?.shadow ? info as { texture: THREE.Texture; rect: THREE.Vector3; baseM: number } : null;
  }

  /**
   * 2026-10-01: lightning in a night storm (a front's towers or the distant storm cells, night only). A deterministic
   * sequence (presentation only — never the simulation's randomness): a strike every 4–16 s somewhere in a cell, one
   * to three return strokes over a third of a second, the cloud around it lit from inside in the composite.
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
      // where: a tower of the front off in the wind's sector, past its clear radius, in the lower half of its body
      const cam = this.cam.pos;
      const az = preset.windDirRad + (rnd() - 0.5) * 2.4, d = preset.clearRadiusM * 1.6 + 6000 * rnd();
      const x = cam.x + Math.cos(az) * d, z = cam.z + Math.sin(az) * d, y = preset.baseM + preset.thicknessM * (0.2 + 0.4 * rnd());
      flash.set(x - cam.x, y - cam.y, z - cam.z, 0).normalize();
    }
    this.flashAge += step;
    // return strokes: bright pulses 80 ms apart decaying over 60 ms each
    const strokeT = this.flashAge / 0.09;
    const k = Math.floor(strokeT);
    flash.w = k < this.flashStrokes ? this.flashPeak * Math.exp(-(strokeT - k) * 0.09 / 0.03) * (1 - 0.25 * k) : 0;
    // QA: hold the current strike at this strength (a still of the storm lit from inside)
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
    this.copyTarget?.dispose();
    this.copyMaterial?.dispose();
    this.traceMaterial.dispose();
    this.resolveMaterial.dispose();
    this.domeMaterial.dispose();
    this.goboMaterial.dispose();
    this.farShadeMaterial.dispose();
    this.farShadeTarget?.dispose();
    this.farShadeTarget = null;
    this.farShadeValid = false;
    this.dome.geometry.dispose();
    this.dome.removeFromParent();
    this.quad.dispose();
    for (const key of CLOUD_NOISE_KINDS) {
      this.noise[key]?.dispose();
      this.noise[key] = null;
    }
  }
}
