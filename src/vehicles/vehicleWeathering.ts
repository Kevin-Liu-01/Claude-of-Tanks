/**
 * vehicleWeathering.ts — the vehicles' weathering by battlefield (2026-10-04, the vehicle-look lane; gauntlet wave 49:
 * "its paint is matte, its soft camo blobs look blurry, and the running gear looks like plastic. It shows no dust, mud
 * or snow", "showroom-clean with no snow or weathering even when parked belly-deep in it").
 *
 * One scene-wide set of uniforms drives a layer the vehicle readability hook (materials.ts vehicleAmbientFloorHook)
 * lays over every vehicle material's albedo, roughness and metalness before the light is gathered — paint, fittings,
 * stowage and the running gear alike, never the optics (their material defines COT_VEH_CLEAN):
 *  - dust or mud on the running gear and the lower hull, fading up the hull's own axis through a ragged edge, heavier on
 *    the faces turned up (fenders, track tops), in the battlefield's own ground: dry dust is the bare ground itself on a
 *    bare battlefield (its light model's ground albedo) and the dirt lifted and bleached elsewhere, wet mud the dirt
 *    darkened and damp, never glossy; a film with holes at most (the paint shows through); an all-over film on the
 *    dusty maps;
 *  - snow lodged on the faces turned up (deck, turret roof, fenders, track tops) and packed into the running gear on
 *    the winter maps, in lumps down there with the dark steel and rubber between them;
 *  - grime in the panel seams the normal map carries, on the faces not turned up;
 *  - light wear on the raised detail of the walked faces (deck, hatches), toward a paler, smoother paint.
 * The breakup noise is sampled in each part's own frame (the plate, the wheel, each track shoe by its instance), so it
 * rides with the vehicle, the turret and the rolling track; the height and facing come from the per-draw ground
 * reference every vehicle mesh already sets (materials.ts VEHICLE_GROUND: the root's origin is the ground contact and
 * its +Y the hull's up). Nothing here reads per-tank geometry: one battlefield row lights every hull alike.
 *
 * The rows: soil is each battlefield's dirt (the terrain's dirt-tone law over its loam base, world/rockDressing.ts —
 * the boulders' soil blend), dust its bare ground where it is bare (sand, rock, ash, concrete, regolith: the light
 * model's ground albedo) or its dirt lifted, dirty slush on the snow maps (vehicleWeathering.selftest re-derives every
 * soil and every bare dust from the map configs); the amounts are its climate's. The Garage keeps a light motor-pool wear (seams, edges, a little running-gear dust), never a battlefield's.
 * The detail level follows the graphics preset (VEHICLE_WEATHER_LEVEL): two noise octaves with the seams and the wear
 * on Ultra and High, one octave and the seams on Medium and Low, off at 0. Uniform-gated: no preset change recompiles.
 * DOM-free: main.ts syncs the row per frame from the phase and the live world (syncVehicleWeather).
 */
import * as THREE from 'three';
import type { MapId } from '../world/maps/mapIds.ts';

export interface VehicleWeather {
  /** The battlefield's dirt, sRGB: its wet mud is this dirt darkened. */
  readonly soilHex: number;
  /** Its dry dust, sRGB: the bare ground itself where the battlefield is bare, else its dirt lifted and bleached. */
  readonly dustHex: number;
  /** Dust or mud on the running gear and the lower hull: its greatest cover (0..1). */
  readonly dust: number;
  /** The all-over dust film (0..1). */
  readonly film: number;
  /** Snow lodged on the faces turned up, packed in the running gear (0..1). */
  readonly snow: number;
  /** 0 dry dust .. 1 wet mud. */
  readonly wet: number;
  /** Grime in the panel seams (0..1). */
  readonly grime: number;
  /** Light wear on the walked faces' raised detail (0..1). */
  readonly wear: number;
}

type Climate = Omit<VehicleWeather, 'soilHex' | 'dustHex'>;
// (amounts tuned on the lane's first capture pair, 2026-10-04: full cover read as a sandblasted hull and chrome-silver
// slush, so a battlefield's dust is a film at most three quarters opaque with holes, and its mud stays matte; the snow
// maps' on the final pair: a pale slush veil under a grey snow veil turned the dark wheels and shoes one even mid grey,
// read as polished alloy, so their slush is the dark wet dirt and their snow comes in lumps)
const ARID: Climate = Object.freeze({ dust: 0.72, film: 0.07, snow: 0, wet: 0, grime: 0.5, wear: 0.55 });
const DRY: Climate = Object.freeze({ dust: 0.66, film: 0.05, snow: 0, wet: 0.1, grime: 0.55, wear: 0.5 });
const TEMPERATE: Climate = Object.freeze({ dust: 0.62, film: 0.03, snow: 0, wet: 0.35, grime: 0.6, wear: 0.45 });
const INDUSTRIAL: Climate = Object.freeze({ ...TEMPERATE, grime: 0.8, wet: 0.25 });
const AUTUMN: Climate = Object.freeze({ ...TEMPERATE, dust: 0.66, wet: 0.5 });
const WET: Climate = Object.freeze({ dust: 0.72, film: 0.02, snow: 0, wet: 0.75, grime: 0.65, wear: 0.4 });
const COASTAL: Climate = Object.freeze({ dust: 0.56, film: 0.03, snow: 0, wet: 0.35, grime: 0.55, wear: 0.45 });
const SNOW: Climate = Object.freeze({ dust: 0.45, film: 0, snow: 0.8, wet: 0.3, grime: 0.5, wear: 0.35 });
const ALPINE: Climate = Object.freeze({ dust: 0.55, film: 0.02, snow: 0.35, wet: 0.25, grime: 0.55, wear: 0.45 });
const REGOLITH: Climate = Object.freeze({ dust: 0.66, film: 0.09, snow: 0, wet: 0, grime: 0.3, wear: 0.3 });

/** The terrain's loam base through no dirt tone (world/rockDressing.ts): the maps that author none. */
const LOAM = 0x654d34;
/**
 * Dirty slush: the winter maps' running-gear film, their dirt churned with meltwater (a little paler than the dirt,
 * never the pale grey that veiled dark steel into alloy); the white comes from the snow lumps.
 */
export const VEHICLE_WEATHER_SLUSH = 0x6e665d;
const SLUSH = VEHICLE_WEATHER_SLUSH;
const _lift = new THREE.Color();
const _liftHsl = { h: 0, s: 0, l: 0 };
/** Dry dust from a dirt: lifted and bleached (fine dust scatters more than the bulk soil it came from). */
export function liftedDustHex(soilHex: number): number {
  _lift.setHex(soilHex, THREE.SRGBColorSpace).getHSL(_liftHsl, THREE.SRGBColorSpace);
  return _lift.setHSL(_liftHsl.h, _liftHsl.s * 0.7, Math.min(0.6, _liftHsl.l * 1.18 + 0.05), THREE.SRGBColorSpace)
    .getHex(THREE.SRGBColorSpace);
}
/** A row: `dustHex` given where the battlefield's own bare ground (its light model's ground albedo) is the dust. */
const row = (soilHex: number, climate: Climate, dustHex: number = liftedDustHex(soilHex)): VehicleWeather =>
  Object.freeze({ soilHex, dustHex, ...climate });

/**
 * Every battlefield's row (vehicleWeathering.selftest: one per MAP_IDS entry, its soil re-derived from the map's dirt
 * tone, a bare battlefield's dust equal to its light model's ground albedo).
 */
export const VEHICLE_WEATHER_BY_MAP: Readonly<Record<MapId, VehicleWeather>> = Object.freeze({
  verdant: row(LOAM, TEMPERATE),
  desert: row(0x8d6e4c, ARID, 0xad9b7c),
  winter: row(0x645a51, SNOW, SLUSH),
  urban: row(0x5f564c, INDUSTRIAL, 0x736f69),
  coastal: row(0xa18657, COASTAL),
  autumn: row(0x675039, AUTUMN, 0x817359),
  steppe: row(0x6d5741, DRY, 0x898165),
  railyard: row(0x585048, INDUSTRIAL, 0x736f69),
  frontier: row(LOAM, DRY),
  fjord: row(0x49443d, WET),
  delta: row(LOAM, WET),
  badlands: row(0x8c5438, ARID, 0xaa8161),
  monsoon: row(LOAM, WET),
  alpine: row(0x625952, ALPINE, 0x9ea0a2),
  caldera: row(0x352e2a, DRY, 0x4b4845),
  foundry: row(LOAM, INDUSTRIAL, 0x736f69),
  ruinspires: row(0x3d3834, DRY, 0xad9b7c),
  blackglass: row(0x312e2b, DRY, 0x4b4845),
  titan_gorge: row(0x8c5438, ARID, 0xaa8161),
  skybridge: row(0x6f5e55, DRY, 0xaa8161),
  polders: row(LOAM, WET),
  copper_mesa: row(0x675347, ARID, 0xa68b6f),
  airfield: row(LOAM, DRY),
  oasis: row(0x8d6e4c, ARID, 0xad9b7c), // (no light-model albedo: Sirocco's sand)
  whiteout: row(0x645a51, { ...SNOW, snow: 0.95 }, SLUSH),
  orchard: row(LOAM, TEMPERATE),
  longleaf: row(LOAM, TEMPERATE),
  mangrove: row(LOAM, WET),
  saltwind: row(0xa18657, COASTAL),
  reservoir: row(LOAM, TEMPERATE),
  mars: row(0x7e4533, { ...ARID, dust: 0.78, film: 0.1 }),
  moon: row(0x65676a, REGOLITH, 0x676b73),
  cliffbridge: row(LOAM, TEMPERATE),
});

/** A spotless vehicle: the gallery, the thumbnails, every tooling path and the boot until the first sync. */
export const CLEAN_VEHICLE_WEATHER: VehicleWeather = Object.freeze({
  soilHex: LOAM, dustHex: liftedDustHex(LOAM), dust: 0, film: 0, snow: 0, wet: 0, grime: 0, wear: 0,
});

/** The Garage's motor pool: seams, walked edges and a little running-gear dust of its workshop's map; no snow, no mud. */
export function garageVehicleWeather(mapId: string | null | undefined): VehicleWeather {
  const source = (mapId && (VEHICLE_WEATHER_BY_MAP as Record<string, VehicleWeather>)[mapId]) || null;
  const soilHex = source?.soilHex ?? LOAM;
  const dustHex = source && source.snow === 0 ? source.dustHex : liftedDustHex(soilHex); // a winter workshop's floor is dry
  return Object.freeze({ soilHex, dustHex, dust: 0.25, film: 0, snow: 0, wet: 0, grime: 0.55, wear: 0.45 });
}

/** A battlefield's row; an unknown id is temperate loam. */
export function vehicleWeatherForMap(mapId: string | null | undefined): VehicleWeather {
  return (mapId && (VEHICLE_WEATHER_BY_MAP as Record<string, VehicleWeather>)[mapId]) || row(LOAM, TEMPERATE);
}

/** The detail level by graphics preset: 2 = two octaves, seams and wear; 1 = one octave and the seams; 0 = off. */
export const VEHICLE_WEATHER_LEVEL: Readonly<Record<string, 0 | 1 | 2>> = Object.freeze({
  ultra: 2, high: 2, medium: 1, low: 1, 'mobile-high': 1, mobile: 1, 'mobile-low': 1,
});
export function vehicleWeatherLevelFor(presetName: string | null | undefined): 0 | 1 | 2 {
  const level = presetName ? VEHICLE_WEATHER_LEVEL[presetName] : undefined;
  return level ?? 1;
}

// ------------------------------------------------------------------------------------------------- uniforms

const WEATHER = Object.freeze({
  /** x dust, y film, z snow, w wet. */
  uVehWeatherA: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** x grime, y wear, z detail level (0 off), w unused. */
  uVehWeatherB: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** Linear dry dust and wet mud. */
  uVehDust: { value: new THREE.Color(0.3, 0.25, 0.18) },
  uVehMud: { value: new THREE.Color(0.06, 0.045, 0.03) },
});
let weatherLevel: 0 | 1 | 2 = 0;
let weatherActive = false;
const _hsl = { h: 0, s: 0, l: 0 };

/** Wet mud: the dirt darkened, a little richer (water fills the pores). */
export function mudColorOf(soilHex: number, target = new THREE.Color()): THREE.Color {
  target.setHex(soilHex, THREE.SRGBColorSpace).getHSL(_hsl, THREE.SRGBColorSpace);
  return target.setHSL(_hsl.h, Math.min(1, _hsl.s * 1.1), _hsl.l * 0.62, THREE.SRGBColorSpace);
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** Point every vehicle material's weathering at a row (the uniform identities never change: no relink). */
export function applyVehicleWeather(weather: VehicleWeather): void {
  WEATHER.uVehWeatherA.value.set(clamp01(weather.dust), clamp01(weather.film), clamp01(weather.snow), clamp01(weather.wet));
  WEATHER.uVehWeatherB.value.x = clamp01(weather.grime);
  WEATHER.uVehWeatherB.value.y = clamp01(weather.wear);
  WEATHER.uVehDust.value.setHex(weather.dustHex, THREE.SRGBColorSpace);
  mudColorOf(weather.soilHex, WEATHER.uVehMud.value);
  weatherActive = weather.dust + weather.film + weather.snow + weather.grime + weather.wear > 0;
  WEATHER.uVehWeatherB.value.z = weatherActive ? weatherLevel : 0;
}

/** The detail level (the graphics preset's, VEHICLE_WEATHER_LEVEL). */
export function setVehicleWeatherLevel(level: 0 | 1 | 2): void {
  if (level !== 0 && level !== 1 && level !== 2) throw new RangeError('vehicle weather level must be 0, 1 or 2');
  weatherLevel = level;
  WEATHER.uVehWeatherB.value.z = weatherActive ? level : 0;
}

/** Read-only view of the live uniforms (receipts, probes). */
export function vehicleWeatherState(): { a: number[]; b: number[]; dust: number[]; mud: number[] } {
  return {
    a: WEATHER.uVehWeatherA.value.toArray(), b: WEATHER.uVehWeatherB.value.toArray(),
    dust: WEATHER.uVehDust.value.toArray(), mud: WEATHER.uVehMud.value.toArray(),
  };
}

/** Bind the shared uniforms into a vehicle program (materials.ts vehicleAmbientFloorHook). */
export function bindVehicleWeatherUniforms(uniforms: Record<string, unknown>): void {
  uniforms.uVehWeatherA = WEATHER.uVehWeatherA;
  uniforms.uVehWeatherB = WEATHER.uVehWeatherB;
  uniforms.uVehDust = WEATHER.uVehDust;
  uniforms.uVehMud = WEATHER.uVehMud;
}

/**
 * QA switch read every frame (A/B probes): `off` draws every vehicle clean, `level` forces a detail level, `scale`
 * multiplies the applied row's amounts (the soil and the wetness kept), `row` replaces fields of it.
 */
export interface VehicleWeatherDebug { off?: boolean; level?: 0 | 1 | 2; scale?: number; row?: Partial<VehicleWeather> }
declare global {
  interface Window { __VEHICLE_WEATHER_DEBUG?: VehicleWeatherDebug }
}

let syncedGarage: boolean | null = null;
let syncedMap: string | null = null;
let syncedRow: VehicleWeather = CLEAN_VEHICLE_WEATHER;
let syncedDebug: VehicleWeatherDebug | null = null;
/**
 * The per-frame owner main.ts drives (mainFrameRuntime syncVehicleWeather): the Garage's workshop (`garage`, its map) or
 * the frame's battlefield. A row is applied only when either changes, so the steady frame is two compares, the QA
 * switch's read and no allocation. Returns whether it applied a row.
 */
export function syncVehicleWeather(garage: boolean, mapId: string | null): boolean {
  const debug = typeof window !== 'undefined' ? window.__VEHICLE_WEATHER_DEBUG : undefined;
  const changed = garage !== syncedGarage || mapId !== syncedMap;
  if (changed) {
    syncedGarage = garage;
    syncedMap = mapId;
    syncedRow = garage ? garageVehicleWeather(mapId) : mapId ? vehicleWeatherForMap(mapId) : CLEAN_VEHICLE_WEATHER;
  }
  if (changed || (debug ?? null) !== syncedDebug) {
    syncedDebug = debug ?? null;
    const k = debug?.scale ?? 1;
    applyVehicleWeather(debug?.scale !== undefined || debug?.row ? {
      ...syncedRow, dust: syncedRow.dust * k, film: syncedRow.film * k, snow: syncedRow.snow * k, grime: syncedRow.grime * k,
      wear: syncedRow.wear * k, ...debug.row,
    } : syncedRow);
  }
  if (debug) WEATHER.uVehWeatherB.value.z = debug.off || !weatherActive ? 0 : debug.level ?? weatherLevel;
  else if (WEATHER.uVehWeatherB.value.z !== (weatherActive ? weatherLevel : 0)) WEATHER.uVehWeatherB.value.z = weatherActive ? weatherLevel : 0;
  return changed;
}

// ------------------------------------------------------------------------------------------------- GLSL

/** Vertex: each part's own frame for the breakup (an instanced shoe or brick by its instance, so it keeps its pattern). */
export const VEHICLE_WEATHER_VERTEX_PARS_GLSL = 'varying vec3 vCotVehObj;\n';
export const VEHICLE_WEATHER_VERTEX_GLSL = `
	vCotVehObj = transformed;
	#ifdef USE_INSTANCING
	vCotVehObj += vec3( float( gl_InstanceID ) * 0.618, float( gl_InstanceID ) * 0.371, 0.0 );
	#endif`;

/** Fragment declarations: the uniforms, the varying and a hash value noise (Quilez). */
export const VEHICLE_WEATHER_FRAGMENT_PARS_GLSL = `uniform vec4 uVehWeatherA;
uniform vec4 uVehWeatherB;
uniform vec3 uVehDust;
uniform vec3 uVehMud;
varying vec3 vCotVehObj;
float cotVehHash( vec3 p ) {
	p = fract( p * 0.3183099 + 0.1 );
	p *= 17.0;
	return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float cotVehNoise( vec3 x ) {
	vec3 i = floor( x );
	vec3 f = fract( x );
	f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mix( cotVehHash( i ), cotVehHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ),
		mix( cotVehHash( i + vec3( 0.0, 1.0, 0.0 ) ), cotVehHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
		mix( mix( cotVehHash( i + vec3( 0.0, 0.0, 1.0 ) ), cotVehHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ),
		mix( cotVehHash( i + vec3( 0.0, 1.0, 1.0 ) ), cotVehHash( i + vec3( 1.0, 1.0, 1.0 ) ), f.x ), f.y ), f.z );
}
`;

/** Breakup frequencies (cycles per metre of a part's frame): patches, then the fine octave. */
export const VEHICLE_WEATHER_PATCH_FREQ = 2.3;
export const VEHICLE_WEATHER_FINE_FREQ = 9.0;
/** The dust's reach up the hull (m): dry dust climbs to the first, wet mud stays under the second. */
export const VEHICLE_WEATHER_REACH_DRY_M = 1.25;
export const VEHICLE_WEATHER_REACH_WET_M = 0.8;
/** Snow: linear albedo of fresh snow (the winter maps' ground, 0xe5e7ec, is 0.78), and of the snow trodden into the gear. */
export const VEHICLE_WEATHER_SNOW = [0.8, 0.82, 0.85] as const;
export const VEHICLE_WEATHER_PACKED_SNOW = [0.58, 0.59, 0.61] as const;
/**
 * Snow in the running gear comes in lumps: the breakup band a lump fills (its noise from the first to the second value),
 * whole near the ground. A thin veil over the whole wheel or shoe, or an unbroken band of fresh snow along a tyre's or a
 * hub's curved top, read as polished alloy and its highlight (the lane's final pair, 2026-10-04).
 */
export const VEHICLE_WEATHER_SNOW_LUMP = [0.52, 0.66] as const;
/** The roughness of wet mud (damp, never glossy: a smoother mud read as chrome under the winter sky). */
export const VEHICLE_WEATHER_MUD_ROUGHNESS = 0.68;

const f = (v: number): string => v.toFixed(4);

/**
 * Fragment: injected before `#include <lights_physical_fragment>` (after the maps and the normal), so the layer is part
 * of the surface every light, floor and the aerial pass then see. Gated by the level and the ground reference (a mesh
 * drawn without a vehicle root stays clean).
 */
export const VEHICLE_WEATHER_FRAGMENT_GLSL = `
#ifndef COT_VEH_CLEAN
	if ( uVehWeatherB.z > 0.5 && uVehGround.w > 0.5 ) {
		vec3 cvP = cameraPosition + ( vec4( -vViewPosition, 0.0 ) * viewMatrix ).xyz;
		float cvH = dot( cvP - uVehGround.xyz, uVehUp );
		float cvUp = dot( inverseTransformDirection( normal, viewMatrix ), uVehUp );
		float cvB = cotVehNoise( vCotVehObj * ${f(VEHICLE_WEATHER_PATCH_FREQ)} );
		float cvCrease = 0.0;
		if ( uVehWeatherB.z > 1.5 ) {
			vec3 cvQ = vCotVehObj * ${f(VEHICLE_WEATHER_FINE_FREQ)} + 3.7;
			// the fine octave fades to its mean where a pixel spans its cycle (no shimmer at range)
			float cvFine = 1.0 - smoothstep( 0.35, 0.9, length( fwidth( cvQ ) ) );
			cvB = mix( cvB, cvB * 0.6 + cotVehNoise( cvQ ) * 0.4, cvFine );
		}
		#ifdef USE_NORMALMAP_TANGENTSPACE
		// the seams, welds and bolt rims the normal map carries: how far its texel tilts off the plate
		cvCrease = clamp( ( 1.0 - normalize( mapN ).z ) * 5.0, 0.0, 1.0 );
		#endif
		float cvTop = smoothstep( 0.45, 0.9, cvUp );
		// grime in the seams of the faces not turned up, light wear on the walked faces' raised detail (High: both)
		float cvGrime = uVehWeatherB.x * cvCrease * ( 1.0 - cvTop ) * smoothstep( 0.25, 0.6, cvB );
		diffuseColor.rgb *= 1.0 - 0.5 * cvGrime;
		roughnessFactor = mix( roughnessFactor, 1.0, 0.5 * cvGrime );
		if ( uVehWeatherB.z > 1.5 ) {
			float cvWear = uVehWeatherB.y * cvCrease * cvTop * smoothstep( 0.5, 0.75, cvB );
			float cvPaintL = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
			diffuseColor.rgb = mix( diffuseColor.rgb, mix( diffuseColor.rgb, vec3( cvPaintL ), 0.5 ) * 1.5 + 0.015, 0.55 * cvWear );
			roughnessFactor = mix( roughnessFactor, 0.55, 0.5 * cvWear );
		}
		// dust or mud: the running gear and the lower hull, fading up the hull through a ragged edge, heavier on the faces
		// turned up; the dusty maps' film over everything
		float cvReach = mix( ${f(VEHICLE_WEATHER_REACH_DRY_M)}, ${f(VEHICLE_WEATHER_REACH_WET_M)}, uVehWeatherA.w );
		float cvLow = 1.0 - smoothstep( 0.12, cvReach, cvH + ( cvB - 0.5 ) * 0.6 );
		// cover with holes: near the ground most of the breakup, higher up only its peaks (a film never seals the paint)
		float cvCover = smoothstep( 0.5 - 0.32 * cvLow, 0.78 - 0.22 * cvLow, cvB );
		float cvDust = uVehWeatherA.x * ( cvLow * cvCover + 0.4 * cvTop * smoothstep( 0.45, 0.75, cvB ) )
			+ uVehWeatherA.y * smoothstep( 0.3, 0.75, cvB );
		cvDust = min( cvDust, 0.85 );
		float cvWet = uVehWeatherA.w * cvLow;
		diffuseColor.rgb = mix( diffuseColor.rgb, mix( uVehDust, uVehMud, cvWet ), cvDust );
		// matte: dry dust, damp mud only a little smoother
		roughnessFactor = mix( roughnessFactor, mix( 0.97, ${f(VEHICLE_WEATHER_MUD_ROUGHNESS)}, cvWet ), cvDust );
		metalnessFactor = mix( metalnessFactor, 0.0, cvDust );
		// snow lodged on the faces turned up (fresh: a sheet on the deck, lumps down on the running gear) and packed into
		// the running gear in lumps (trodden, greyer), the dark steel and rubber showing between them
		vec2 cvLump = vec2( ${VEHICLE_WEATHER_SNOW_LUMP.map(f).join(', ')} );
		float cvSnowTop = smoothstep( 0.55, 0.85, cvUp + ( cvB - 0.5 ) * 0.35 )
			* smoothstep( mix( 0.3, cvLump.x, cvLow ), mix( 0.55, cvLump.y, cvLow ), cvB );
		float cvSnowPack = cvLow * smoothstep( cvLump.x, cvLump.y, cvB );
		float cvSnow = uVehWeatherA.z * max( cvSnowTop, cvSnowPack );
		vec3 cvSnowCol = mix( vec3( ${VEHICLE_WEATHER_SNOW.map(f).join(', ')} ), vec3( ${VEHICLE_WEATHER_PACKED_SNOW.map(f).join(', ')} ),
			cvSnowPack / max( cvSnowPack + cvSnowTop, 1e-4 ) );
		diffuseColor.rgb = mix( diffuseColor.rgb, cvSnowCol, cvSnow );
		roughnessFactor = mix( roughnessFactor, 0.85, cvSnow );
		metalnessFactor = mix( metalnessFactor, 0.0, cvSnow );
	}
#endif
`;
